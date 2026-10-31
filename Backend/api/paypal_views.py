from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import uuid

from django.db import transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status
from django.conf import settings

from .views import EsAdministrador, EsRecepcionistaOAdministrador, registrar_bitacora
from .models import PagoPasarela, Socio, PlanMembresia, MetodoPago, ConfiguracionSistema
from .membresias import crear_contrato_pagado
from .serializers import ContratoMembresiaSerializer
from .paypal_service import (obtener_access_token, solicitud_paypal, consultar_recurso, PayPalError)


class PayPalConexionView(APIView):
    permission_classes = [IsAuthenticated, EsAdministrador]

    def get(self, request):
        try:
            obtener_access_token()
            return Response({'conectado': True, 'modo': settings.PAYPAL_MODE, 'mensaje': 'Conexión con PayPal establecida.'})
        except PayPalError as exc:
            return Response({'conectado': False, 'mensaje': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)


class PayPalCrearOrdenMembresiaView(APIView):
    permission_classes = [IsAuthenticated, EsRecepcionistaOAdministrador]

    def post(self, request):
        try:
            socio = Socio.objects.select_related('id_socio').get(pk=request.data.get('id_socio'))
            plan = PlanMembresia.objects.get(pk=request.data.get('id_plan_membresia'), estado='Activo')
            config_tasa = ConfiguracionSistema.objects.get(clave='tipo_cambio_usd')
            tasa = config_tasa.valor
            if tasa <= 0:
                raise ValueError('El administrador todavía no configuró el tipo de cambio (Bs por USD).')
            monto_local = Decimal(plan.costo_base_origen).quantize(Decimal('0.01'))
            monto_usd = (monto_local / tasa).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            if monto_usd <= 0:
                raise ValueError('El importe convertido a USD debe ser mayor que cero.')
            token = obtener_access_token()
            orden = solicitud_paypal('/v2/checkout/orders', token, {
                'intent': 'CAPTURE',
                'purchase_units': [{'reference_id': f'MEM-{socio.pk}-{plan.pk}', 'description': f'Membresía {plan.nombre_plan}', 'amount': {'currency_code': 'USD', 'value': f'{monto_usd:.2f}'}}],
                'payment_source': {'paypal': {'experience_context': {'payment_method_preference': 'IMMEDIATE_PAYMENT_REQUIRED', 'user_action': 'PAY_NOW', 'return_url': request.data.get('return_url', 'http://localhost:3000/paypal/retorno'), 'cancel_url': request.data.get('cancel_url', 'http://localhost:3000/paypal/cancelado')}}}
            }, request_id=str(uuid.uuid4()))
            pago = PagoPasarela.objects.create(
                id_orden_externa=orden['id'], tipo_operacion='MEMBRESIA', id_usuario=request.user,
                id_socio=socio, id_plan_mem=plan, monto_local=monto_local, monto_usd=monto_usd, tasa_cambio=tasa
            )
            approval = next((x['href'] for x in orden.get('links', []) if x.get('rel') in ('approve', 'payer-action')), None)
            if not approval:
                pago.estado = 'FALLIDO'; pago.save(update_fields=['estado', 'fecha_actualizacion'])
                return Response({'error': 'PayPal no devolvió el enlace de aprobación.'}, status=502)
            return Response({'id_pago': pago.pk, 'id_orden': orden['id'], 'url_aprobacion': approval, 'monto_local': str(monto_local), 'monto_usd': str(monto_usd), 'moneda': 'USD', 'tasa_cambio': str(tasa)}, status=201)
        except (Socio.DoesNotExist, PlanMembresia.DoesNotExist):
            return Response({'error': 'Socio o plan no encontrado, o el plan está inactivo.'}, status=400)
        except (ValueError, InvalidOperation, TypeError) as exc:
            return Response({'error': str(exc)}, status=400)
        except PayPalError as exc:
            return Response({'error': str(exc)}, status=502)


class PayPalCapturarMembresiaView(APIView):
    permission_classes = [IsAuthenticated, EsRecepcionistaOAdministrador]

    def post(self, request):
        order_id = str(request.data.get('order_id', '')).strip()
        if not order_id:
            return Response({'error': 'Falta order_id.'}, status=400)
        try:
            with transaction.atomic():
                pago = PagoPasarela.objects.select_for_update().select_related('id_socio', 'id_plan_mem', 'id_usuario', 'id_contrato_mem').get(id_orden_externa=order_id, tipo_operacion='MEMBRESIA')
                if pago.estado == 'COMPLETADO' and pago.id_contrato_mem_id:
                    return Response({'mensaje': 'Este pago ya fue procesado.', 'contrato': ContratoMembresiaSerializer(pago.id_contrato_mem).data}, status=200)
                if pago.id_usuario_id != request.user.id and not request.user.es_administrador:
                    return Response({'error': 'Esta orden no pertenece al usuario autenticado.'}, status=403)
                token = obtener_access_token()
                detalle = consultar_recurso(f'/v2/checkout/orders/{order_id}', token)
                # Recuperación segura: si PayPal ya capturó pero nuestra respuesta
                # anterior se perdió, leemos la captura existente en vez de repetirla.
                if detalle.get('status') == 'COMPLETED':
                    fuente_capturas = detalle
                elif detalle.get('status') == 'APPROVED':
                    fuente_capturas = solicitud_paypal(
                        f'/v2/checkout/orders/{order_id}/capture', token, {},
                        request_id=f'capture-{order_id}'
                    )
                else:
                    return Response({'error': 'La orden todavía no está aprobada o no se puede capturar.', 'estado': detalle.get('status')}, status=409)
                captures = [c for pu in fuente_capturas.get('purchase_units', []) for c in pu.get('payments', {}).get('captures', [])]
                completed = next((c for c in captures if c.get('status') == 'COMPLETED'), None)
                if not completed:
                    return Response({'error': 'PayPal no confirmó una captura completada.'}, status=409)
                amount = completed.get('amount', {})
                if amount.get('currency_code') != 'USD' or Decimal(amount.get('value', '0')) != pago.monto_usd:
                    return Response({'error': 'El importe o la moneda confirmados por PayPal no coinciden con la orden registrada.'}, status=409)
                if PagoPasarela.objects.exclude(pk=pago.pk).filter(id_captura_externa=completed['id']).exists():
                    return Response({'error': 'La captura ya está asociada a otra operación.'}, status=409)
                metodo, _ = MetodoPago.objects.get_or_create(descripcion='PayPal')
                contrato = crear_contrato_pagado(pago.id_socio, pago.id_plan_mem, metodo)
                contrato.tasa_cambio_aplicada = pago.tasa_cambio
                contrato.monto_pagado_local = pago.monto_local
                contrato.save(update_fields=['tasa_cambio_aplicada', 'monto_pagado_local'])
                pago.id_captura_externa = completed['id']
                pago.estado = 'COMPLETADO'
                pago.id_contrato_mem = contrato
                pago.save(update_fields=['id_captura_externa', 'estado', 'id_contrato_mem', 'fecha_actualizacion'])
                registrar_bitacora(request, 'CREATE', 'contrato_membresia', f'Pago PayPal {order_id} confirmado; contrato {contrato.pk} creado para socio {pago.id_socio_id}.', usuario=request.user)
                return Response({'mensaje': 'Pago confirmado y contrato creado.', 'contrato': ContratoMembresiaSerializer(contrato).data}, status=201)
        except PagoPasarela.DoesNotExist:
            return Response({'error': 'No existe una orden de membresía registrada con ese ID.'}, status=404)
        except PayPalError as exc:
            return Response({'error': str(exc)}, status=502)


class TipoCambioConfiguracionView(APIView):
    permission_classes = [IsAuthenticated, EsAdministrador]

    def get(self, request):
        config, _ = ConfiguracionSistema.objects.get_or_create(
            clave='tipo_cambio_usd', defaults={'valor': Decimal('0.0000')}
        )
        return Response({
            'clave': config.clave,
            'valor': str(config.valor),
            'fecha_actualizacion': config.fecha_actualizacion,
            'configurado': config.valor > 0,
        })

    def put(self, request):
        try:
            valor = Decimal(str(request.data.get('valor', '')).strip())
            if not valor.is_finite() or valor <= 0:
                raise ValueError
            if valor > Decimal('999999.9999'):
                raise ValueError
        except (InvalidOperation, ValueError, TypeError, AttributeError):
            return Response({'error': 'Ingresa un tipo de cambio válido, mayor que cero (Bs por USD).'}, status=status.HTTP_400_BAD_REQUEST)

        config, _ = ConfiguracionSistema.objects.get_or_create(
            clave='tipo_cambio_usd', defaults={'valor': Decimal('0.0000')}
        )
        config.valor = valor.quantize(Decimal('0.0001'))
        config.actualizado_por = request.user
        config.save(update_fields=['valor', 'actualizado_por', 'fecha_actualizacion'])
        registrar_bitacora(
            request, 'UPDATE', 'configuracion_sistema',
            f'Tipo de cambio USD actualizado a {config.valor} Bs por USD.',
            usuario=request.user
        )
        return Response({
            'mensaje': 'Tipo de cambio actualizado.',
            'clave': config.clave,
            'valor': str(config.valor),
            'fecha_actualizacion': config.fecha_actualizacion,
        })
