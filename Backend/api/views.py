# api/views.py
import csv

from django.conf import settings
from axes.models import AccessAttempt
from decouple import config
from rest_framework import status, permissions, viewsets, mixins, serializers  # <--- Se agregó viewsets aquí
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import action
from django.http import HttpResponse
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from django.db.models import Q, Count, F
from rest_framework_simplejwt.views import TokenObtainPairView
from .emails import enviar_correo_brevo

from rest_framework.permissions import AllowAny
from .models import (
    Usuario, Socio, PlanMembresia, MetodoPago, Venta, Producto, CategoriaProducto, Proveedor, Compra, DetalleCompra, Administrador, KardexInventario,
    Ejercicio, Rutina, Bitacora,
    DetalleRutina, AsignacionRutina, Entrenador, HorarioEntrenador, Turno,
    GRUPOS_MUSCULARES, AlertaReposicion,
)
from .membresias import asegurar_metodos_pago
from .serializers import (
    RegistroUsuarioSerializer, UsuarioSerializer, SocioSerializer, CategoriaProductoSerializer, ProveedorSerializer,
    PlanMembresiaSerializer, MetodoPagoSerializer, ContratoMembresiaSerializer,
    RegistrarContratoMembresiaSerializer, VentaSerializer, ProductoSerializer, RegistrarCompraSerializer, CompraLecturaSerializer, RegistrarKardexSerializer, KardexLecturaSerializer,
    EjercicioSerializer, EjercicioListSerializer, RutinaSerializer,
    RutinaConDetallesSerializer, AsignacionRutinaSerializer,
    EntrenadorSerializer, RegistrarEntrenadorSerializer,
    HorarioEntrenadorSerializer, TurnoSerializer,
    LoginSerializer, AlertaReposicionSerializer,
    BitacoraSerializer, RegistrarSocioSerializer,
)

User = get_user_model()


# ==============================================================================
# CU03: REGISTRAR BITÁCORA DE AUDITORÍA
# Utilidades usadas por el resto de las vistas para dejar rastro de las
# acciones relevantes (login, alta/edición de usuarios, alta de socios, etc.)
# ==============================================================================

def obtener_ip(request):
    """Obtiene la IP real del cliente, considerando proxies (X-Forwarded-For)."""
    if request is None:
        return None
    forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded_for:
        return forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def registrar_bitacora(request, accion, tabla_afectada, descripcion, usuario=None, nombre_usuario_db=None):
    """Crea una entrada en la bitácora de auditoría (CU03).

    - `usuario`: instancia de Usuario que ejecuta la acción (si hay sesión).
    - `nombre_usuario_db`: texto libre para casos sin usuario autenticado
      (por ejemplo, un intento de login fallido con un username inexistente).
    No debe interrumpir el flujo principal si algo falla (ver excepción de CU03).
    """
    try:
        Bitacora.objects.create(
            id_usuario=usuario,
            nombre_usuario_db=nombre_usuario_db or (usuario.username if usuario else 'Sistema'),
            accion=accion,
            tabla_afectada=tabla_afectada,
            descripcion=descripcion,
            direccion_ip=obtener_ip(request),
        )
    except Exception:
        # El sistema notifica el fallo sin interrumpir la operación principal.
        pass

# 1. Cambiar contraseña cuando está logueado
class CambiarPasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        password_actual = request.data.get('password_actual')
        password_nueva = request.data.get('password_nueva')

        if not user.check_password(password_actual):
            return Response({'error': 'La contraseña actual es incorrecta.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_password(password_nueva, user)
        except ValidationError as e:
            return Response({'error': e.messages}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(password_nueva)  # Se encripta automáticamente
        user.save()
        registrar_bitacora(
            request, 'UPDATE', 'usuario',
            f"El usuario '{user.username}' cambió su propia contraseña.",
            usuario=user,
        )
        return Response({'mensaje': 'Contraseña actualizada con éxito.'})

# 2. Solicitar correo de recuperación (Olvidé mi contraseña)
class SolicitarResetPasswordView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = (request.data.get('email') or '').strip().lower()
        user = User.objects.filter(email=email).first()

        # Por seguridad devolvemos siempre el mismo mensaje genérico
        # (no revelar si el correo existe en el sistema).
        if user is not None and not user.is_active:
            user = None

        if user is not None:
            token = default_token_generator.make_token(user)
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            frontend_url = config('FRONTEND_URL', default='http://localhost:3000').rstrip('/')
            link_recuperacion = f"{frontend_url}/reset-password/{uid}/{token}/"

            asunto = 'Recuperación de contraseña — Porky Gym'
            contenido = (
                '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">'
                f'<h2 style="color:#111">Hola {user.username},</h2>'
                '<p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>'
                '<p style="margin:24px 0">'
                f'<a href="{link_recuperacion}" style="background:#E2FF00;color:#111;padding:12px 24px;'
                'text-decoration:none;font-weight:bold;border-radius:4px">'
                'Restablecer mi contraseña</a></p>'
                '<p>Si no solicitaste este cambio, ignora este correo; tu contraseña '
                'seguirá siendo la misma.</p>'
                '<hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>'
                '<p style="color:#777;font-size:12px">Porky Gym • Sistema de gestión</p>'
                '</div>'
            )

            enviado = enviar_correo_brevo(email, asunto, contenido)

            registrar_bitacora(
                request, 'UPDATE', 'usuario',
                f"Se solicitó recuperación de contraseña para '{user.username}' "
                f"({'correo enviado' if enviado else 'correo no enviado, ver debug_link'}).",
                usuario=user,
            )

            if not enviado:
                # Fallback de desarrollo: se imprime el enlace en la consola del backend.
                print(f"LINK DE RECUPERACIÓN (no se pudo enviar correo): {link_recuperacion}")
                if settings.DEBUG:
                    return Response({
                        'mensaje': 'No se pudo enviar el correo (revisa BREVO_API_KEY). '
                                   'En modo desarrollo, usa el enlace de abajo.',
                        'debug_link': link_recuperacion,
                    })

        return Response({'mensaje': 'Si existe una cuenta con ese correo, '
                                    'recibirás un enlace de recuperación.'})

# 3. Confirmar la nueva contraseña mediante el token
class ConfirmarResetPasswordView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, uidb64, token):
        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return Response({'error': 'Enlace inválido o expirado.'}, status=status.HTTP_400_BAD_REQUEST)

        if default_token_generator.check_token(user, token):
            password_nueva = request.data.get('password_nueva')
            password_confirmacion = request.data.get('password_confirmacion')

            if not password_nueva or password_nueva != password_confirmacion:
                return Response({'error': 'Las contraseñas no coinciden.'}, status=status.HTTP_400_BAD_REQUEST)

            # Los requisitos de complejidad se aplican AQUÍ (al elegir la nueva contraseña)
            try:
                validate_password(password_nueva, user)
            except ValidationError as e:
                return Response({'error': e.messages}, status=status.HTTP_400_BAD_REQUEST)

            user.set_password(password_nueva)  # Se almacena hasheada automáticamente
            user.save()
            registrar_bitacora(
                request, 'UPDATE', 'usuario',
                f"El usuario '{user.username}' restableció su contraseña vía enlace de correo.",
                usuario=user,
            )
            return Response({'mensaje': 'Tu contraseña ha sido restablecida exitosamente.'})
        return Response({'error': 'El token no es válido o ha expirado.'}, status=status.HTTP_400_BAD_REQUEST)

# 4. Registro de Usuario
class RegistroView(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = RegistroUsuarioSerializer(data=request.data)
        if serializer.is_valid():
            usuario = serializer.save()
            registrar_bitacora(
                request, 'CREATE', 'usuario',
                f"Nueva cuenta autorregistrada: '{usuario.username}'.",
                usuario=usuario,
            )
            return Response({"mensaje": "Usuario registrado exitosamente"}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class EsAdministrador(permissions.BasePermission):
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.es_administrador
        )


class EsRecepcionistaOAdministrador(permissions.BasePermission):
    """Actores de CU04 (Registrar Expediente de Socio): Recepcionista, Administrador."""
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and (request.user.es_recepcionista or request.user.es_administrador)
        )


class EsAdministradorORecepcionista(permissions.BasePermission):
    """Lectura de catálogos (planes): Administrador y Recepcionista.

    CU04 (Registrar Expediente de Socio) necesita listar los planes activos
    para asignar la membresía inicial, por eso la consulta se mantiene
    disponible para ambos roles.
    """
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and (request.user.es_administrador or request.user.es_recepcionista)
        )


class EsEntrenadorOAdministrador(permissions.BasePermission):
    """CU17, CU18 y CU20: roles que diseñan el contenido de entrenamiento.

    El Entrenador administra ejercicios, rutinas y su propio perfil; el
    Administrador tiene acceso total sobre el mismo módulo.
    """
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and (request.user.es_entrenador or request.user.es_administrador)
        )


class EsAdministradorOEntrenador(permissions.BasePermission):
    """CU19: asignar rutinas a socios.

    Lo usan el Entrenador (asigna las rutinas que diseñó) y el Administrador.
    """
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and (request.user.es_entrenador or request.user.es_administrador)
        )


def entrenador_del_usuario(usuario):
    """Devuelve el perfil Entrenador del usuario o None si no tiene uno."""
    if usuario is None or not usuario.is_authenticated:
        return None
    return Entrenador.objects.filter(id_entrenador=usuario).first()


def _roles_texto(usuario):
    roles = []
    if usuario.es_administrador:
        roles.append('Administrador')
    if usuario.es_recepcionista:
        roles.append('Recepcionista')
    if usuario.es_entrenador:
        roles.append('Entrenador')
    if usuario.es_socio:
        roles.append('Socio')
    return ', '.join(roles) if roles else 'Sin rol'


# 5. ViewSets del sistema Porky Gym

# ----------------------------------------------------------------------------
# CU01: REGISTRAR CUENTA DE USUARIO (gestión desde el panel de Administrador)
# Cada alta/edición/baja queda además registrada en la Bitácora (CU03).
# ----------------------------------------------------------------------------
class UsuarioViewSet(viewsets.ModelViewSet):
    queryset = Usuario.objects.all()
    serializer_class = UsuarioSerializer
    permission_classes = [EsAdministrador]

    def perform_create(self, serializer):
        usuario = serializer.save()
        registrar_bitacora(
            self.request, 'CREATE', 'usuario',
            f"El administrador '{self.request.user.username}' creó la cuenta "
            f"'{usuario.username}' con rol(es): {_roles_texto(usuario)}.",
            usuario=self.request.user,
        )

    def perform_update(self, serializer):
        anterior = self.get_object()
        estado_previo = anterior.estado_cuenta
        usuario = serializer.save()
        cambios = []
        if estado_previo != usuario.estado_cuenta:
            cambios.append(f"estado: {estado_previo} → {usuario.estado_cuenta}")
        cambios.append(f"roles actuales: {_roles_texto(usuario)}")
        registrar_bitacora(
            self.request, 'UPDATE', 'usuario',
            f"El administrador '{self.request.user.username}' modificó la cuenta "
            f"'{usuario.username}' ({'; '.join(cambios)}).",
            usuario=self.request.user,
        )

    def perform_destroy(self, instance):
        nombre = instance.username
        instance.delete()
        registrar_bitacora(
            self.request, 'DELETE', 'usuario',
            f"El administrador '{self.request.user.username}' eliminó la cuenta '{nombre}'.",
            usuario=self.request.user,
        )


class SocioViewSet(viewsets.ModelViewSet):
    queryset = Socio.objects.all()
    serializer_class = SocioSerializer
    permission_classes = [permissions.IsAuthenticated]


# ----------------------------------------------------------------------------
# CU04: REGISTRAR EXPEDIENTE DE SOCIO
# Alta de un nuevo socio (con su cuenta de acceso) desde el rol Recepcionista,
# con asignación opcional del plan de membresía inicial.
# ----------------------------------------------------------------------------
class RegistrarSocioView(APIView):
    permission_classes = [EsRecepcionistaOAdministrador]

    def post(self, request):
        serializer = RegistrarSocioSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        resultado = serializer.save()
        usuario = resultado['usuario']
        contrato = resultado['contrato']

        descripcion = f"'{request.user.username}' registró al socio '{usuario.username}' (CI: {usuario.ci})."
        if contrato:
            descripcion += f" Plan inicial asignado: '{contrato.id_plan_mem.nombre_plan}'."
        registrar_bitacora(request, 'CREATE', 'socio', descripcion, usuario=request.user)

        return Response({
            'mensaje': 'Socio registrado exitosamente.',
            'id_socio': usuario.id,
            'username': usuario.username,
            'plan_asignado': contrato.id_plan_mem.nombre_plan if contrato else None,
        }, status=status.HTTP_201_CREATED)


# ----------------------------------------------------------------------------
# CU05: ADMINISTRAR PLANES DE MEMBRESÍA
# El Administrador crea, edita, activa y desactiva planes. La lectura queda
# disponible para Recepcionista y Administrador (CU04 la usa al registrar
# socios). Los planes NO se eliminan físicamente: se desactivan para conservar
# el historial y las relaciones de los contratos que los referencian.
# ----------------------------------------------------------------------------
class PlanMembresiaViewSet(viewsets.ModelViewSet):
    queryset = PlanMembresia.objects.all()
    serializer_class = PlanMembresiaSerializer

    def get_permissions(self):
        # Lectura: CU04 (Registrar Socio) y CU05 (listar) → Admin/Recepcionista.
        if self.action in ('list', 'retrieve'):
            return [EsAdministradorORecepcionista()]
        # Escritura y acciones administrativas: solo Administrador.
        return [EsAdministrador()]

    def perform_create(self, serializer):
        plan = serializer.save()
        registrar_bitacora(
            self.request, 'CREATE', 'plan_membresia',
            f"El administrador '{self.request.user.username}' creó el plan "
            f"'{plan.nombre_plan}' ({plan.duracion_dias} días, "
            f"{plan.costo_base_origen} {plan.moneda_origen}).",
            usuario=self.request.user,
        )

    def perform_update(self, serializer):
        anterior = self.get_object()
        plan = serializer.save()
        cambios = []
        if anterior.nombre_plan != plan.nombre_plan:
            cambios.append(f"nombre: {anterior.nombre_plan} → {plan.nombre_plan}")
        if float(anterior.costo_base_origen) != float(plan.costo_base_origen):
            cambios.append(f"costo: {anterior.costo_base_origen} → {plan.costo_base_origen}")
        if anterior.duracion_dias != plan.duracion_dias:
            cambios.append(f"duracion: {anterior.duracion_dias} → {plan.duracion_dias} días")
        if anterior.estado != plan.estado:
            cambios.append(f"estado: {anterior.estado} → {plan.estado}")
        registrar_bitacora(
            self.request, 'UPDATE', 'plan_membresia',
            f"El administrador '{self.request.user.username}' modificó el plan "
            f"'{plan.nombre_plan}' ({'; '.join(cambios) if cambios else 'sin cambios registrados'}).",
            usuario=self.request.user,
        )

    def destroy(self, request, *args, **kwargs):
        # CU05: nunca se elimina físicamente; se desactiva (conserva contratos).
        plan = self.get_object()
        registrar_bitacora(
            request, 'DELETE', 'plan_membresia',
            f"Intento de eliminación del plan '{plan.nombre_plan}' bloqueado: "
            f"debe usarse la desactivación para cambios de estado.",
            usuario=request.user,
        )
        return Response(
            {'error': 'No se permite eliminar físicamente un plan de membresía. '
                      'Use la acción de desactivación para cambios de estado.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @action(detail=True, methods=['post'])
    def activar(self, request, pk=None):
        plan = self.get_object()
        if plan.estado == 'Activo':
            return Response({'mensaje': f"El plan '{plan.nombre_plan}' ya está activo."})
        plan.estado = 'Activo'
        plan.save(update_fields=['estado'])
        registrar_bitacora(
            request, 'UPDATE', 'plan_membresia',
            f"El administrador '{request.user.username}' activó el plan '{plan.nombre_plan}'.",
            usuario=request.user,
        )
        return Response(PlanMembresiaSerializer(plan).data)

    @action(detail=True, methods=['post'])
    def desactivar(self, request, pk=None):
        plan = self.get_object()
        if plan.estado == 'Inactivo':
            return Response({'mensaje': f"El plan '{plan.nombre_plan}' ya está inactivo."})
        plan.estado = 'Inactivo'
        plan.save(update_fields=['estado'])
        registrar_bitacora(
            request, 'UPDATE', 'plan_membresia',
            f"El administrador '{request.user.username}' desactivó el plan '{plan.nombre_plan}'.",
            usuario=request.user,
        )
        return Response(PlanMembresiaSerializer(plan).data)


# ----------------------------------------------------------------------------
# CU06: MÉTODOS DE PAGO DISPONIBLES (catálogo)
# Lectura exclusiva para Administrador y Recepcionista (se usa en el registro
# de contratos de membresía).
# ----------------------------------------------------------------------------
class MetodoPagoViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = MetodoPago.objects.all()
    serializer_class = MetodoPagoSerializer
    permission_classes = [EsAdministradorORecepcionista]

    def list(self, request, *args, **kwargs):
        # Garantiza de forma idempotente que existan los métodos base
        # (Efectivo y Transferencia bancaria) antes de exponer el catálogo,
        # sin duplicar ni alterar los ya existentes.
        asegurar_metodos_pago()
        return super().list(request, *args, **kwargs)


# ----------------------------------------------------------------------------
# CU06: REGISTRAR CONTRATO DE MEMBRESÍA
# Crea el contrato de un socio existente con un plan activo y un método de
# pago real. El vencimiento se calcula con la duración en días del plan y el
# estado de la membresía depende de la cobertura del pago (Activa/Pendiente).
# La operación es atómica (transaction.atomic) y se registra en la bitácora.
# No modifica la cuenta del socio ni su estado de la cuenta.
# ----------------------------------------------------------------------------
class RegistrarContratoMembresiaView(APIView):
    permission_classes = [EsRecepcionistaOAdministrador]

    def post(self, request):
        serializer = RegistrarContratoMembresiaSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            contrato = serializer.save()

        socio = contrato.id_socio.id_socio
        registrar_bitacora(
            request,
            'CREATE',
            'contrato_membresia',
            f"'{request.user.username}' registró un contrato de membresía "
            f"para el socio '{socio.username}' (plan '{contrato.id_plan_mem.nombre_plan}', "
            f"monto {contrato.monto_pagado_local}, estado '{contrato.estado_membresia}', "
            f"vigencia {contrato.fecha_inicio} → {contrato.fecha_vencimiento}).",
            usuario=request.user,
        )

        return Response(
            {
                'mensaje': 'Contrato de membresía registrado exitosamente.',
                'contrato': ContratoMembresiaSerializer(contrato).data,
            },
            status=status.HTTP_201_CREATED,
        )


# ----------------------------------------------------------------------------
# CU03: REGISTRAR BITÁCORA DE AUDITORÍA
# Solo lectura: el Administrador consulta/filtra/exporta el historial.
# ----------------------------------------------------------------------------
class BitacoraViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = Bitacora.objects.all().order_by('-fecha_hora')
    serializer_class = BitacoraSerializer
    permission_classes = [EsAdministrador]

    def _filtrar(self, queryset):
        usuario_id = self.request.query_params.get('usuario')
        fecha = self.request.query_params.get('fecha')  # YYYY-MM-DD
        accion = self.request.query_params.get('accion')

        if usuario_id:
            queryset = queryset.filter(id_usuario_id=usuario_id)
        if fecha:
            queryset = queryset.filter(fecha_hora__date=fecha)
        if accion:
            queryset = queryset.filter(accion__iexact=accion)
        return queryset

    def get_queryset(self):
        return self._filtrar(super().get_queryset())

    @action(detail=False, methods=['get'])
    def export(self, request):
        """Flujo secundario de CU03: exportar la bitácora filtrada a un archivo."""
        queryset = self._filtrar(self.get_queryset())

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="bitacora_auditoria.csv"'

        writer = csv.writer(response)
        writer.writerow(['Fecha y hora', 'Usuario', 'Acción', 'Tabla afectada', 'Descripción', 'IP'])
        for registro in queryset:
            writer.writerow([
                registro.fecha_hora.strftime('%Y-%m-%d %H:%M:%S'),
                registro.id_usuario.username if registro.id_usuario_id else (registro.nombre_usuario_db or 'Sistema'),
                registro.accion,
                registro.tabla_afectada,
                registro.descripcion or '',
                registro.direccion_ip or '',
            ])
        return response

class VentaViewSet(viewsets.ModelViewSet):
    queryset = Venta.objects.all()
    serializer_class = VentaSerializer

class ProductoViewSet(viewsets.ModelViewSet):
    """CU12: catálogo de productos comerciales.

    Administrador: CRUD. Recepcionista: solo consulta. El stock y el costo
    promedio son de solo lectura y se actualizarán desde CU08/CU14/CU15.
    """
    queryset = Producto.objects.select_related('id_categoria').order_by('nombre_producto')
    serializer_class = ProductoSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [EsAdministradorORecepcionista()]
        return [EsAdministrador()]

    def perform_create(self, serializer):
        producto = serializer.save()
        registrar_bitacora(
            self.request, 'CREATE', 'producto',
            f"'{self.request.user.username}' creó el producto '{producto.nombre_producto}'.",
            usuario=self.request.user,
        )

    def perform_update(self, serializer):
        producto = serializer.save()
        registrar_bitacora(
            self.request, 'UPDATE', 'producto',
            f"'{self.request.user.username}' actualizó el producto '{producto.nombre_producto}'.",
            usuario=self.request.user,
        )

    def perform_destroy(self, instance):
        # No eliminar productos con historial comercial o de inventario.
        from .models import DetalleCompra, DetalleVentaProducto, KardexInventario
        if (DetalleCompra.objects.filter(id_producto=instance).exists()
                or DetalleVentaProducto.objects.filter(id_producto=instance).exists()
                or KardexInventario.objects.filter(id_producto=instance).exists()):
            raise serializers.ValidationError(
                {'detail': 'No se puede eliminar: el producto tiene historial de compras, ventas o Kardex. Puede cambiar su estado a Inactivo.'}
            )
        nombre = instance.nombre_producto
        instance.delete()
        registrar_bitacora(
            self.request, 'DELETE', 'producto',
            f"'{self.request.user.username}' eliminó el producto '{nombre}'.",
            usuario=self.request.user,
        )


class CategoriaProductoViewSet(viewsets.ModelViewSet):
    """CU11: CRUD de categorías. Solo el administrador puede gestionarlas."""
    queryset = CategoriaProducto.objects.select_related('id_subcategoria').order_by('nombre_categoria')
    serializer_class = CategoriaProductoSerializer
    permission_classes = [EsAdministrador]

    def perform_create(self, serializer):
        categoria = serializer.save()
        registrar_bitacora(
            self.request, 'CREATE', 'categoria_producto',
            f"'{self.request.user.username}' creó la categoría '{categoria.nombre_categoria}'.",
            usuario=self.request.user,
        )

    def perform_update(self, serializer):
        categoria = serializer.save()
        registrar_bitacora(
            self.request, 'UPDATE', 'categoria_producto',
            f"'{self.request.user.username}' actualizó la categoría '{categoria.nombre_categoria}'.",
            usuario=self.request.user,
        )

    def perform_destroy(self, instance):
        if Producto.objects.filter(id_categoria=instance).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail': 'No se puede eliminar: la categoría tiene productos asociados.'})
        if CategoriaProducto.objects.filter(id_subcategoria=instance).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail': 'No se puede eliminar: la categoría tiene subcategorías asociadas.'})
        nombre = instance.nombre_categoria
        instance.delete()
        registrar_bitacora(
            self.request, 'DELETE', 'categoria_producto',
            f"'{self.request.user.username}' eliminó la categoría '{nombre}'.",
            usuario=self.request.user,
        )

# ----------------------------------------------------------------------------


class ProveedorViewSet(viewsets.ModelViewSet):
    """CU13: administración de proveedores para el módulo comercial."""
    queryset = Proveedor.objects.all().order_by('razon_social')
    serializer_class = ProveedorSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [EsAdministradorORecepcionista()]
        return [EsAdministrador()]

    def perform_create(self, serializer):
        proveedor = serializer.save()
        registrar_bitacora(
            self.request, 'CREATE', 'proveedor',
            f"'{self.request.user.username}' registró al proveedor '{proveedor.razon_social}' (NIT {proveedor.nit}).",
            usuario=self.request.user,
        )

    def perform_update(self, serializer):
        proveedor = serializer.save()
        registrar_bitacora(
            self.request, 'UPDATE', 'proveedor',
            f"'{self.request.user.username}' actualizó al proveedor '{proveedor.razon_social}' (NIT {proveedor.nit}).",
            usuario=self.request.user,
        )

    def perform_destroy(self, instance):
        if Compra.objects.filter(id_proveedor=instance).exists():
            raise serializers.ValidationError(
                {'detail': 'No se puede eliminar este proveedor porque tiene compras registradas.'}
            )
        razon_social = instance.razon_social
        nit = instance.nit
        instance.delete()
        registrar_bitacora(
            self.request, 'DELETE', 'proveedor',
            f"'{self.request.user.username}' eliminó al proveedor '{razon_social}' (NIT {nit}).",
            usuario=self.request.user,
        )


class CompraViewSet(viewsets.ModelViewSet):
    """CU14: registro y consulta de compras. Solo administradores."""
    queryset = Compra.objects.select_related(
        'id_proveedor', 'id_administrador__id_administrador'
    ).prefetch_related('detallecompra_set__id_producto').order_by('-fecha_hora', '-id_compra')
    http_method_names = ['get', 'post', 'head', 'options']

    def get_permissions(self):
        return [EsAdministrador()]

    def get_serializer_class(self):
        if self.action == 'create':
            return RegistrarCompraSerializer
        return CompraLecturaSerializer

    def perform_create(self, serializer):
        compra = serializer.save()
        registrar_bitacora(
            self.request, 'CREATE', 'compra',
            f"'{self.request.user.username}' registró la compra #{compra.id_compra} "
            f"por {compra.monto_total_local} BOB al proveedor '{compra.id_proveedor.razon_social}'.",
            usuario=self.request.user,
        )




class KardexViewSet(viewsets.ModelViewSet):
    """CU15: consulta del historial y registro de movimientos extraordinarios."""
    queryset = KardexInventario.objects.select_related('id_producto').order_by('-fecha_movimiento', '-id_kardex')
    http_method_names = ['get', 'post', 'head', 'options']

    def get_permissions(self):
        return [EsAdministrador()]

    def get_serializer_class(self):
        if self.action == 'create':
            return RegistrarKardexSerializer
        return KardexLecturaSerializer

    def perform_create(self, serializer):
        movimiento = serializer.save()
        signo = '+' if movimiento.tipo_movimiento in ('INGRESO', 'AJUSTE_POSITIVO') else '-'
        registrar_bitacora(
            self.request, 'CREATE', 'kardex_inventario',
            f"'{self.request.user.username}' registró {movimiento.tipo_movimiento} de {movimiento.cantidad} unidad(es) "
            f"del producto '{movimiento.id_producto.nombre_producto}' (variación {signo}{movimiento.cantidad}). Motivo: {movimiento.motivo}.",
            usuario=self.request.user,
        )




# CU16: MONITOREAR ALERTAS DE REPOSICION
class AlertaReposicionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AlertaReposicionSerializer

    def get_permissions(self):
        return [EsRecepcionistaOAdministrador()]

    def get_queryset(self):
        # Sincroniza alertas pendientes con el stock actual, evitando duplicados.
        # Una alerta cerrada no se vuelve a abrir automáticamente.
        if self.request.user.es_administrador:
            administrador, _ = Administrador.objects.get_or_create(id_administrador=self.request.user)
            for producto in Producto.objects.filter(estado__iexact='Activo', stock_actual__lte=F('stock_minimo')):
                pendiente = AlertaReposicion.objects.filter(id_producto=producto, estado_alerta='Pendiente').first()
                if not pendiente:
                    urgencia = 'Agotado' if producto.stock_actual <= 0 else 'Bajo'
                    sugerida = max(1, (producto.stock_maximo or producto.stock_minimo * 2) - producto.stock_actual)
                    AlertaReposicion.objects.create(id_admin=administrador, id_producto=producto,
                        nivel_urgencia=urgencia, cantidad_sugerida=sugerida)
                else:
                    urgencia = 'Agotado' if producto.stock_actual <= 0 else 'Bajo'
                    pendiente.nivel_urgencia = urgencia
                    pendiente.cantidad_sugerida = max(1, (producto.stock_maximo or producto.stock_minimo * 2) - producto.stock_actual)
                    pendiente.save(update_fields=['nivel_urgencia', 'cantidad_sugerida'])
            # Si el stock se recuperó, cierra automáticamente la alerta pendiente.
            AlertaReposicion.objects.filter(estado_alerta='Pendiente', id_producto__stock_actual__gt=F('id_producto__stock_minimo')).update(estado_alerta='Cerrada', fecha_cierre=timezone.now())
        qs = AlertaReposicion.objects.select_related('id_producto').order_by('-fecha_generacion')
        estado = self.request.query_params.get('estado')
        if estado:
            qs = qs.filter(estado_alerta__iexact=estado)
        return qs

    @action(detail=True, methods=['post'])
    def cerrar(self, request, pk=None):
        if not request.user.es_administrador:
            return Response({'detail': 'Solo el administrador puede cerrar alertas.'}, status=status.HTTP_403_FORBIDDEN)
        alerta = self.get_object()
        if alerta.estado_alerta != 'Pendiente':
            return Response({'detail': 'La alerta ya está cerrada.'}, status=status.HTTP_400_BAD_REQUEST)
        if alerta.id_producto.stock_actual <= alerta.id_producto.stock_minimo:
            return Response({'detail': 'No se puede cerrar: el producto aún está en nivel de reposición.'}, status=status.HTTP_400_BAD_REQUEST)
        alerta.estado_alerta = 'Cerrada'
        alerta.fecha_cierre = timezone.now()
        alerta.save(update_fields=['estado_alerta', 'fecha_cierre'])
        registrar_bitacora(request, 'UPDATE', 'alerta_reposicion',
            f"'{request.user.username}' cerró la alerta de reposición del producto '{alerta.id_producto.nombre_producto}'.", usuario=request.user)
        return Response(self.get_serializer(alerta).data)


# CU17: REGISTRAR EJERCICIO
# Catálogo de ejercicios del gimnasio, con filtrado por grupo muscular.
# Lectura: cualquier usuario autenticado (el frontend los usa para armar
# rutinas). Escritura: Entrenador y Administrador.
# ----------------------------------------------------------------------------
class EjercicioViewSet(viewsets.ModelViewSet):
    queryset = Ejercicio.objects.all()
    serializer_class = EjercicioSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        # La lista necesita el contador de rutinas; el alta/edición, el de escritura.
        if self.action in ('list', 'retrieve'):
            return EjercicioListSerializer
        return EjercicioSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'grupos'):
            return [permissions.IsAuthenticated()]
        return [EsEntrenadorOAdministrador()]

    def get_queryset(self):
        queryset = (
            Ejercicio.objects
            .annotate(en_rutinas=Count('detalles_rutina', distinct=True))
            .order_by('grupo_muscular', 'nombre_ejercicio')
        )

        # Filtrado principal de CU17: ver los ejercicios de un grupo muscular.
        grupo = self.request.query_params.get('grupo_muscular')
        if grupo:
            queryset = queryset.filter(grupo_muscular__iexact=grupo)

        # Búsqueda rápida por nombre (usada por el buscador del frontend).
        busqueda = self.request.query_params.get('buscar')
        if busqueda:
            queryset = queryset.filter(
                Q(nombre_ejercicio__icontains=busqueda)
                | Q(equipo_requerido__icontains=busqueda)
            )

        # El catálogo completo solo lo ve el staff; los socios ven los activos.
        if not (self.request.user.es_entrenador or self.request.user.es_administrador):
            queryset = queryset.filter(estado='Activo')

        return queryset

    def perform_create(self, serializer):
        ejercicio = serializer.save()
        registrar_bitacora(
            self.request, 'CREATE', 'ejercicio',
            f"'{self.request.user.username}' registró el ejercicio "
            f"'{ejercicio.nombre_ejercicio}' (grupo muscular: {ejercicio.grupo_muscular}).",
            usuario=self.request.user,
        )

    def perform_update(self, serializer):
        ejercicio = serializer.save()
        registrar_bitacora(
            self.request, 'UPDATE', 'ejercicio',
            f"'{self.request.user.username}' modificó el ejercicio '{ejercicio.nombre_ejercicio}'.",
            usuario=self.request.user,
        )

    def perform_destroy(self, instance):
        # Baja lógica: los ejercicios ya están referenciados por rutinas
        # históricas, por lo que no se eliminan físicamente.
        instance.estado = 'Inactivo'
        instance.save(update_fields=['estado'])
        registrar_bitacora(
            self.request, 'DELETE', 'ejercicio',
            f"'{self.request.user.username}' dio de baja el ejercicio '{instance.nombre_ejercicio}'.",
            usuario=self.request.user,
        )

    @action(detail=False, methods=['get'])
    def grupos(self, request):
        """Catálogo de grupos musculares para poblar los selects del frontend.

        Combina el catálogo fijo del modelo con los grupos que ya existen en
        la base de datos, para no perder registros heredados.
        """
        en_bd = (
            Ejercicio.objects
            .exclude(grupo_muscular__isnull=True)
            .exclude(grupo_muscular__exact='')
            .values_list('grupo_muscular', flat=True)
            .distinct()
        )
        catalogo = [valor for valor, _ in GRUPOS_MUSCULARES]
        combinados = list(dict.fromkeys(catalogo + sorted(en_bd)))
        return Response({'grupos': combinados})


# ----------------------------------------------------------------------------
# CU18: DISEÑAR RUTINA DE ENTRENAMIENTO
# La creación/edición acepta la rutina junto con su lista de ejercicios
# (series, repeticiones, descanso) en una sola petición atómica.
# ----------------------------------------------------------------------------
class RutinaViewSet(viewsets.ModelViewSet):
    queryset = Rutina.objects.all().prefetch_related('detalles__id_ejercicio')
    serializer_class = RutinaSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return RutinaConDetallesSerializer
        return RutinaSerializer

    def get_permissions(self):
        # Leer el catálogo y el plan de ejercicios de una rutina es de solo
        # lectura: también lo usa el Socio para ver la rutina que le asignaron.
        if self.action in ('list', 'retrieve', 'ejercicios'):
            return [permissions.IsAuthenticated()]
        return [EsEntrenadorOAdministrador()]

    def get_queryset(self):
        queryset = super().get_queryset().order_by('nombre_rutina')

        nivel = self.request.query_params.get('nivel')
        if nivel:
            queryset = queryset.filter(nivel__iexact=nivel)

        estado = self.request.query_params.get('estado')
        if estado:
            queryset = queryset.filter(estado__iexact=estado)
        elif self.action == 'ejercicios':
            # Al abrir el plan de UNA rutina no se filtra por estado: el Socio
            # debe poder ver la rutina que ya le asignaron aunque después se
            # haya dado de baja (queda como histórico).
            pass
        elif not (self.request.user.es_entrenador or self.request.user.es_administrador):
            # Los socios solo ven rutinas activas.
            queryset = queryset.filter(estado='Activo')

        busqueda = self.request.query_params.get('buscar')
        if busqueda:
            queryset = queryset.filter(nombre_rutina__icontains=busqueda)

        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rutina = serializer.save()
        registrar_bitacora(
            request, 'CREATE', 'rutina',
            f"'{request.user.username}' diseñó la rutina '{rutina.nombre_rutina}' "
            f"(nivel {rutina.nivel}, {rutina.detalles.count()} ejercicio(s)).",
            usuario=request.user,
        )
        return Response(
            RutinaSerializer(rutina).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        parcial = kwargs.pop('partial', False)
        rutina = self.get_object()
        serializer = self.get_serializer(rutina, data=request.data, partial=parcial)
        serializer.is_valid(raise_exception=True)
        rutina = serializer.save()
        registrar_bitacora(
            request, 'UPDATE', 'rutina',
            f"'{request.user.username}' modificó la rutina '{rutina.nombre_rutina}' "
            f"({rutina.detalles.count()} ejercicio(s)).",
            usuario=request.user,
        )
        return Response(RutinaSerializer(rutina).data)

    def perform_destroy(self, instance):
        # Baja lógica: la rutina puede estar asignada a socios (CU19) y su
        # historial debe conservarse.
        instance.estado = 'Inactivo'
        instance.save(update_fields=['estado'])
        registrar_bitacora(
            self.request, 'DELETE', 'rutina',
            f"'{self.request.user.username}' dio de baja la rutina '{instance.nombre_rutina}'.",
            usuario=self.request.user,
        )

    @action(detail=True, methods=['get'])
    def ejercicios(self, request, pk=None):
        """Plan de ejercicios de una rutina (para la vista de detalle)."""
        rutina = self.get_object()
        detalles = rutina.detalles.select_related('id_ejercicio')
        return Response({
            'rutina': RutinaSerializer(rutina).data,
            'ejercicios': [
                {
                    'orden': d.orden,
                    'id_ejercicio': d.id_ejercicio_id,
                    'nombre_ejercicio': d.id_ejercicio.nombre_ejercicio,
                    'grupo_muscular': d.id_ejercicio.grupo_muscular,
                    'series': d.series,
                    'repeticiones': d.repeticiones,
                    'descanso_minutos': str(d.descanso_minutos) if d.descanso_minutos else None,
                }
                for d in detalles
            ],
        })


# ----------------------------------------------------------------------------
# CU19: ASIGNAR RUTINA A SOCIO
# Vincula una rutina existente con un socio que tenga la membresía vigente.
# ----------------------------------------------------------------------------
class AsignacionRutinaViewSet(viewsets.ModelViewSet):
    queryset = (
        AsignacionRutina.objects
        .select_related('id_socio__id_socio', 'id_rutina', 'id_entrenador__id_entrenador')
        .order_by('-fecha_asignacion', '-id_asignacion_rutina')
    )
    serializer_class = AsignacionRutinaSerializer
    permission_classes = [EsAdministradorOEntrenador]

    def get_permissions(self):
        # El Socio consulta en modo lectura SUS propias rutinas asignadas
        # (pestaña «Mis rutinas»). Escribir o ver ajenas sigue siendo
        # exclusivo del Entrenador y del Administrador.
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated()]
        return [EsAdministradorOEntrenador()]

    def get_queryset(self):
        queryset = super().get_queryset()

        # Un Socio jamás ve las asignaciones de otros socios: el filtro se
        # aplica SIEMPRE por el usuario autenticado, sin posibilidad de
        # saltarlo con el parámetro ?id_socio=.
        usuario = self.request.user
        if not (usuario.es_administrador or usuario.es_entrenador):
            queryset = queryset.filter(id_socio__id_socio=usuario)

        socio = self.request.query_params.get('id_socio')
        rutina = self.request.query_params.get('id_rutina')
        estado = self.request.query_params.get('estado')

        if socio:
            queryset = queryset.filter(id_socio_id=socio)
        if rutina:
            queryset = queryset.filter(id_rutina_id=rutina)
        if estado:
            queryset = queryset.filter(estado__iexact=estado)
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Si el actor es Entrenador, se firma con su propio perfil; el
        # Administrador puede indicar explícitamente quién asigna.
        datos = serializer.validated_data
        entrenador = datos.get('id_entrenador') or entrenador_del_usuario(request.user)
        if entrenador is None:
            return Response(
                {'id_entrenador': 'Debe indicar el entrenador que asigna la rutina.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        self.perform_create(serializer, entrenador)
        asignacion = serializer.instance
        return Response(
            self.get_serializer(asignacion).data,
            status=status.HTTP_201_CREATED,
        )

    def perform_create(self, serializer, entrenador=None):
        if entrenador is None:
            entrenador = entrenador_del_usuario(self.request.user)

        asignacion = serializer.save(id_entrenador=entrenador)
        registrar_bitacora(
            self.request, 'CREATE', 'asignacion_rutina',
            f"'{self.request.user.username}' asignó la rutina "
            f"'{asignacion.id_rutina.nombre_rutina}' al socio "
            f"'{asignacion.id_socio.id_socio.username}'.",
            usuario=self.request.user,
        )

    @action(detail=True, methods=['post'])
    def finalizar(self, request, pk=None):
        """Marca la asignación como finalizada (el socio terminó la rutina)."""
        asignacion = self.get_object()
        if asignacion.estado != 'Activa':
            return Response(
                {'mensaje': 'Esta asignación ya no está activa.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        asignacion.estado = 'Finalizada'
        asignacion.save(update_fields=['estado'])
        registrar_bitacora(
            request, 'UPDATE', 'asignacion_rutina',
            f"'{request.user.username}' finalizó la rutina "
            f"'{asignacion.id_rutina.nombre_rutina}' del socio "
            f"'{asignacion.id_socio.id_socio.username}'.",
            usuario=request.user,
        )
        return Response(self.get_serializer(asignacion).data)


# ----------------------------------------------------------------------------
# CU20: GESTIONAR PERFIL DE ENTRENADOR
# CRUD del perfil (especialidad, certificación, experiencia, horarios) y alta
# completa de la cuenta con rol Entrenador.
# ----------------------------------------------------------------------------
class EntrenadorViewSet(viewsets.ModelViewSet):
    queryset = (
        Entrenador.objects
        .select_related('id_entrenador')
        .prefetch_related('horarios__id_turno')
        .order_by('id_entrenador__username')
    )
    serializer_class = EntrenadorSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated()]
        return [EsAdministrador()]

    def get_queryset(self):
        queryset = super().get_queryset()
        estado = self.request.query_params.get('estado')
        if estado:
            queryset = queryset.filter(estado__iexact=estado)

        busqueda = self.request.query_params.get('buscar')
        if busqueda:
            queryset = queryset.filter(
                Q(id_entrenador__username__icontains=busqueda)
                | Q(especialidad__icontains=busqueda)
                | Q(id_entrenador__ci__icontains=busqueda)
            )
        return queryset

    def perform_create(self, serializer):
        entrenador = serializer.save()
        registrar_bitacora(
            self.request, 'CREATE', 'entrenador',
            f"'{self.request.user.username}' creó el perfil del entrenador "
            f"'{entrenador.id_entrenador.username}'.",
            usuario=self.request.user,
        )

    def perform_update(self, serializer):
        entrenador = serializer.save()
        registrar_bitacora(
            self.request, 'UPDATE', 'entrenador',
            f"'{self.request.user.username}' modificó el perfil del entrenador "
            f"'{entrenador.id_entrenador.username}'.",
            usuario=self.request.user,
        )

    def perform_destroy(self, instance):
        # Baja lógica: el entrenador puede tener rutinas y asignaciones
        # históricas que referencian su perfil.
        instance.estado = 'Inactivo'
        instance.save(update_fields=['estado'])
        registrar_bitacora(
            self.request, 'DELETE', 'entrenador',
            f"'{self.request.user.username}' dio de baja al entrenador "
            f"'{instance.id_entrenador.username}'.",
            usuario=self.request.user,
        )

    @action(detail=True, methods=['post'])
    def activar(self, request, pk=None):
        """CU20: reactivar un entrenador dado de baja (Inactivo → Activo).

        Es la operación inversa de la baja lógica del ``perform_destroy``:
        no recrea nada, solo vuelve a marcar el perfil como ``Activo`` para
        que vuelva a aparecer en el listado y pueda ser elegido al asignar
        rutinas. Ruta generada por el router: ``POST /api/entrenadores/<pk>/activar/``.
        """
        entrenador = self.get_object()
        if entrenador.estado == 'Activo':
            return Response(
                {'mensaje': f"El entrenador '{entrenador.id_entrenador.username}' ya está activo."}
            )

        entrenador.estado = 'Activo'
        entrenador.save(update_fields=['estado'])
        registrar_bitacora(
            request, 'UPDATE', 'entrenador',
            f"'{request.user.username}' reactivó al entrenador "
            f"'{entrenador.id_entrenador.username}'.",
            usuario=request.user,
        )
        return Response(EntrenadorSerializer(entrenador).data)


class RegistrarEntrenadorView(APIView):
    """Alta de entrenador: crea la cuenta (rol Entrenador) + perfil + horarios."""

    permission_classes = [EsAdministrador]

    def post(self, request):
        serializer = RegistrarEntrenadorSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        entrenador = serializer.save()
        registrar_bitacora(
            request, 'CREATE', 'entrenador',
            f"'{request.user.username}' registró al entrenador "
            f"'{entrenador.id_entrenador.username}' "
            f"(especialidad: {entrenador.especialidad or 'sin definir'}).",
            usuario=request.user,
        )
        return Response(
            {
                'mensaje': 'Entrenador registrado exitosamente.',
                'entrenador': EntrenadorSerializer(entrenador).data,
            },
            status=status.HTTP_201_CREATED,
        )


class HorarioEntrenadorViewSet(viewsets.ModelViewSet):
    """Gestión directa de los horarios (día + turno) de cada entrenador."""

    queryset = HorarioEntrenador.objects.select_related('id_turno', 'id_entrenador__id_entrenador')
    serializer_class = HorarioEntrenadorSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated()]
        return [EsEntrenadorOAdministrador()]

    def get_queryset(self):
        queryset = super().get_queryset().order_by('dia_semana', 'id_turno__hora_inicio')
        entrenador = self.request.query_params.get('id_entrenador')
        if entrenador:
            queryset = queryset.filter(id_entrenador_id=entrenador)
        return queryset


class TurnoViewSet(viewsets.ReadOnlyModelViewSet):
    """Catálogo de turnos (franjas horarias) usado por CU20."""

    queryset = Turno.objects.all().order_by('hora_inicio')
    serializer_class = TurnoSerializer
    permission_classes = [permissions.IsAuthenticated]

class LoginView(TokenObtainPairView):
    """CU02: Autenticar Usuario / Iniciar Sesión.

    <<extend>> hacia CU03: cada intento de inicio de sesión (exitoso o
    fallido) queda registrado en la Bitácora de Auditoría.
    """
    serializer_class = LoginSerializer

    def post(self, request, *args, **kwargs):
        username = (request.data.get('username') or '').strip()

        try:
            response = super().post(request, *args, **kwargs)
        except Exception as exc:

            registrar_bitacora(
            request,
            'LOGIN_FALLIDO',
            'usuario',
            f"Intento de inicio de sesión fallido para '{username}'.",
            usuario=None,
            nombre_usuario_db=username,
            )
            # ------------------------------------------------------
            # Si la cuenta está desactivada, conservar ese mensaje
            # ------------------------------------------------------
            detalle_error = str(getattr(exc, 'detail', ''))

            if 'desactivada' in detalle_error.lower():
              return Response(
              {
                'detail': 'La cuenta está desactivada. Contacte con el administrador.'
              },
              status=status.HTTP_403_FORBIDDEN
            )
            # ------------------------------------------------------
            # Consultar los intentos fallidos registrados por Axes
            # ------------------------------------------------------
            intento = (
                 AccessAttempt.objects
                .filter(username=username)
                .order_by('-attempt_time')
                .first()
            )
            # ------------------------------------------------------
            # Si alcanzó el límite configurado en settings.py
            # ------------------------------------------------------
            if (
                intento
                and intento.failures_since_start >= settings.AXES_FAILURE_LIMIT
            ):
              return Response(
              {
                'detail': (
                    'Cuenta bloqueada por demasiados intentos fallidos. '
                    'Intente nuevamente en 5 minutos.'
                )
              },
               status=status.HTTP_403_FORBIDDEN
               )
            # ------------------------------------------------------
            # Primeros intentos incorrectos
            # ------------------------------------------------------
            return Response(
             {
               'detail': 'Usuario o contraseña incorrectos.'
             },
             status=status.HTTP_401_UNAUTHORIZED
            )
         

        if response.status_code == 200:
            usuario = Usuario.objects.filter(username=username).first()
            registrar_bitacora(
                request, 'LOGIN', 'usuario',
                f"Inicio de sesión exitoso de '{username}'.",
                usuario=usuario,
                nombre_usuario_db=username,
            )
        else:
            registrar_bitacora(
                request, 'LOGIN_FALLIDO', 'usuario',
                f"Intento de inicio de sesión fallido para '{username}'.",
                usuario=None,
                nombre_usuario_db=username,
            )

        return response
