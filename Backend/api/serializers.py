# api/serializers.py
from datetime import date
from decimal import Decimal

from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from .models import (
    Usuario, Socio, PlanMembresia, Venta, Producto, CategoriaProducto, Proveedor, Compra, DetalleCompra, Administrador, Ejercicio, Rutina,
    Bitacora, MetodoPago, ContratoMembresia, KardexInventario, DetalleVentaProducto,
    DetalleRutina, AsignacionRutina, Entrenador, HorarioEntrenador, Turno,
    GRUPOS_MUSCULARES, NIVELES_RUTINA, DIAS_SEMANA, AlertaReposicion, ArqueoCaja, EgresoCaja,
)
from .membresias import (
    crear_contrato_pagado,
    historial_contratos,
    metodo_pago_por_defecto,
    resumen_membresia,
    validar_pago_exacto,
)
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

Usuario = get_user_model()

class CategoriaProductoSerializer(serializers.ModelSerializer):
    """CU11: administraciÃ³n del catÃ¡logo de categorÃ­as y subcategorÃ­as."""
    id_subcategoria = serializers.PrimaryKeyRelatedField(
        queryset=CategoriaProducto.objects.all(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = CategoriaProducto
        fields = ['id_categoria', 'nombre_categoria', 'id_subcategoria']
        read_only_fields = ['id_categoria']

    def validate_nombre_categoria(self, value):
        nombre = value.strip()
        if not nombre:
            raise serializers.ValidationError('El nombre de la categorÃ­a es obligatorio.')
        duplicados = CategoriaProducto.objects.filter(nombre_categoria__iexact=nombre)
        if self.instance:
            duplicados = duplicados.exclude(pk=self.instance.pk)
        if duplicados.exists():
            raise serializers.ValidationError('Ya existe una categorÃ­a con ese nombre.')
        return nombre

    def validate(self, attrs):
        padre = attrs.get('id_subcategoria', getattr(self.instance, 'id_subcategoria', None))
        if self.instance and padre:
            if padre.pk == self.instance.pk:
                raise serializers.ValidationError({'id_subcategoria': 'Una categorÃ­a no puede ser su propia subcategorÃ­a.'})
            # Evita ciclos: no se puede asignar como padre a uno de sus descendientes.
            pendientes = [self.instance]
            visitados = set()
            while pendientes:
                actual = pendientes.pop()
                if actual.pk in visitados:
                    continue
                visitados.add(actual.pk)
                if actual.pk == padre.pk:
                    raise serializers.ValidationError({'id_subcategoria': 'La relaciÃ³n generarÃ­a un ciclo de categorÃ­as.'})
                pendientes.extend(list(CategoriaProducto.objects.filter(id_subcategoria=actual)))
        return attrs


class RegistroUsuarioSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True)
    password2 = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = Usuario
        fields = ['username', 'email', 'password', 'password2', 'ci', 'telefono', 'es_socio', 'es_entrenador', 'es_recepcionista', 'es_administrador']

    def validate(self, attrs):
        # Las contraseÃ±as deben coincidir
        if attrs.get('password') != attrs.get('password2'):
            raise serializers.ValidationError({'password2': 'Las contraseÃ±as no coinciden.'})
        return attrs

    def validate_password(self, value):
        # Requisitos estrictos se aplican AL REGISTRARSE (mismos que en el reset)
        try:
            validate_password(value)
        except ValidationError as e:
            raise serializers.ValidationError(list(e.messages))
        return value

    def create(self, validated_data):
        # create_user hashea la contraseÃ±a automÃ¡ticamente (PBKDF2 + salt)
        validated_data.pop('password2', None)
        user = Usuario.objects.create_user(**validated_data)
        return user


class UsuarioSerializer(serializers.ModelSerializer):
    # CU01 (ediciÃ³n): la contraseÃ±a es opcional al actualizar. Se acepta el
    # campo vacÃ­o y se interpreta como "no cambiar la contraseÃ±a"; al crear,
    # la validaciÃ³n sigue exigiÃ©ndola (no se debilitan las cuentas nuevas).
    password = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
    )

    password2 = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
    )

    # Resumen de membresÃ­a del socio (solo lectura). Es ``null`` para las
    # cuentas que no son socios o que aÃºn no tienen expediente de socio, de
    # modo que no se presenta como si fuera una propiedad de todo usuario.
    membresia = serializers.SerializerMethodField()

    class Meta:
        model = Usuario
        fields = [
            'id',
            'username',
            'email',
            'ci',
            'telefono',
            'estado_cuenta',

            'es_socio',
            'es_entrenador',
            'es_recepcionista',
            'es_administrador',

            'membresia',

            'password',
            'password2',
        ]

    def get_membresia(self, obj):
        if not obj.es_socio:
            return None
        socio = getattr(obj, 'socio', None)
        if socio is None:
            return None
        return resumen_membresia(socio)

    def validate(self, attrs):
        # EdiciÃ³n (CU01): un campo de contraseÃ±a vacÃ­o u omitido significa
        # "no modificar la contraseÃ±a actual". Se normaliza a ausente para no
        # guardar nunca una contraseÃ±a en blanco ni reescribir la existente.
        if attrs.get('password') in ('', None):
            attrs.pop('password', None)
        if attrs.get('password2') in ('', None):
            attrs.pop('password2', None)

        password = attrs.get('password')
        password2 = attrs.get('password2')

        # Al CREAR la contraseÃ±a sigue siendo obligatoria (se mantienen los
        # requisitos de seguridad para las cuentas nuevas).
        if self.instance is None:
            if not password:
                raise serializers.ValidationError({
                    'password': 'La contraseÃ±a es obligatoria.'
                })

            if not password2:
                raise serializers.ValidationError({
                    'password2': 'Debe confirmar la contraseÃ±a.'
                })

        # Si se ingresÃ³ contraseÃ±a, ambas deben coincidir y cumplir la
        # polÃ­tica de complejidad existente.
        if password or password2:
            if password != password2:
                raise serializers.ValidationError({
                    'password2': 'Las contraseÃ±as no coinciden.'
                })

            try:
                validate_password(password)
            except ValidationError as e:
                raise serializers.ValidationError({
                    'password': list(e.messages)
                })

        # CU04: el rol de socio no se administra desde "Gestionar usuarios",
        # porque ese flujo no crea el expediente Socio (fecha de nacimiento,
        # etc.). El alta correcta es "Registrar nuevo socio", que usa otro
        # serializador y sÃ­ crea/vÃ­ncula la cuenta con su expediente.
        es_socio = attrs.get('es_socio')
        if es_socio:
            if self.instance is None:
                raise serializers.ValidationError({
                    'es_socio': 'El rol de socio no se asigna desde '
                                '"Gestionar usuarios". Use "Registrar nuevo '
                                'socio" para crear la cuenta y su expediente.'
                })
            # En ediciÃ³n solo se permite conservar el rol de socio si la
            # cuenta ya es socio o ya tiene expediente Socio. AsÃ­ no se
            # bloquea la ediciÃ³n legÃ­tima de cuentas existentes ni se alteran
            # datos histÃ³ricos, pero se evitan nuevas inconsistencias.
            if not (self.instance.es_socio or hasattr(self.instance, 'socio')):
                raise serializers.ValidationError({
                    'es_socio': 'No se puede asignar el rol de socio a una '
                                'cuenta sin expediente de socio. Use '
                                '"Registrar nuevo socio".'
                })

        return attrs

    def create(self, validated_data):
        validated_data.pop('password2', None)
        password = validated_data.pop('password')

        user = Usuario(**validated_data)
        user.set_password(password)
        user.save()

        return user

    def update(self, instance, validated_data):
        validated_data.pop('password2', None)
        password = validated_data.pop('password', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if password:
            instance.set_password(password)

        instance.save()

        return instance
    
class LoginSerializer(TokenObtainPairSerializer):

    def validate(self, attrs):
        data = super().validate(attrs)
        
        usuario = self.user
        if usuario.estado_cuenta != 'Activo':
           raise serializers.ValidationError({
           'detail': 'La cuenta estÃ¡ desactivada. Contacte con el administrador.'
         })
        data['usuario'] = {
            'id': usuario.id,
            'username': usuario.username,
            'email': usuario.email,
            'estado_cuenta': usuario.estado_cuenta,

            'es_socio': usuario.es_socio,
            'es_entrenador': usuario.es_entrenador,
            'es_recepcionista': usuario.es_recepcionista,
            'es_administrador': usuario.es_administrador,

            'is_superuser': usuario.is_superuser,
        }

        return data
class SocioSerializer(serializers.ModelSerializer):
    # Campos legibles del socio (desde su cuenta Usuario) para los selectores
    # del frontend (CU06). Solo lectura: no afectan el alta (CU04).
    username = serializers.CharField(source='id_socio.username', read_only=True)
    ci = serializers.CharField(source='id_socio.ci', read_only=True)
    estado_cuenta = serializers.CharField(source='id_socio.estado_cuenta', read_only=True)

    # Consulta de vigencia e historial de membresÃ­a (solo lectura, CU06).
    membresia = serializers.SerializerMethodField()
    historial_contratos = serializers.SerializerMethodField()

    class Meta:
        model = Socio
        fields = '__all__'

    def get_membresia(self, obj):
        return resumen_membresia(obj)

    def get_historial_contratos(self, obj):
        return historial_contratos(obj)

class PlanMembresiaSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlanMembresia
        fields = [
            'id_plan_membresia',
            'nombre_plan',
            'moneda_origen',
            'costo_base_origen',
            'duracion_dias',
            'acceso_piscina',
            'clases_grupales',
            'estado',
        ]
        read_only_fields = ['id_plan_membresia']

    def validate_nombre_plan(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('El nombre del plan es obligatorio.')
        return value

    def validate_costo_base_origen(self, value):
        if value is None:
            raise serializers.ValidationError('El costo base es obligatorio.')
        if value < 0:
            raise serializers.ValidationError('El costo base no puede ser negativo.')
        return value

    def validate_duracion_dias(self, value):
        if value is None:
            raise serializers.ValidationError('La duraciÃ³n en dÃ­as es obligatoria.')
        if value < 1:
            raise serializers.ValidationError('La duraciÃ³n debe ser al menos 1 dÃ­a.')
        return value

class MetodoPagoSerializer(serializers.ModelSerializer):
    class Meta:
        model = MetodoPago
        fields = ['id_metodo_pago', 'descripcion', 'activo']


class TurnoSerializer(serializers.ModelSerializer):
    """CatÃ¡logo de franjas horarias (CU20: horarios del entrenador)."""

    class Meta:
        model = Turno
        fields = ['id_turno', 'nombre_turno', 'hora_inicio', 'hora_fin']


class ContratoMembresiaSerializer(serializers.ModelSerializer):
    """Lectura de un contrato de membresÃ­a (respuesta del registro, CU06)."""
    socio_username = serializers.SerializerMethodField()
    socio_ci = serializers.SerializerMethodField()
    plan_nombre = serializers.CharField(source='id_plan_mem.nombre_plan', read_only=True)
    plan_estado = serializers.CharField(source='id_plan_mem.estado', read_only=True)
    metodo_pago = serializers.CharField(source='id_metodo_pago.descripcion', read_only=True)

    # Vigencia derivada (no se almacena): 'Vigente' / 'Vencida' / 'Pendiente'.
    vigencia = serializers.SerializerMethodField()
    dias_restantes = serializers.SerializerMethodField()

    class Meta:
        model = ContratoMembresia
        fields = [
            'id_contrato_mem',
            'id_socio',
            'socio_username',
            'socio_ci',
            'id_plan_mem',
            'plan_nombre',
            'plan_estado',
            'id_metodo_pago',
            'metodo_pago',
            'id_renovacion',
            'tipo_operacion',
            'fecha_inicio',
            'fecha_vencimiento',
            'tasa_cambio_aplicada',
            'monto_pagado_local',
            'estado_membresia',
            'vigencia',
            'dias_restantes',
        ]

    def get_socio_username(self, obj):
        return obj.id_socio.id_socio.username

    def get_socio_ci(self, obj):
        return obj.id_socio.id_socio.ci

    def get_vigencia(self, obj):
        if obj.estado_membresia != 'Activa':
            return obj.estado_membresia
        if obj.fecha_vencimiento > date.today():
            return 'Vigente'
        return 'Vencida'

    def get_dias_restantes(self, obj):
        if obj.estado_membresia != 'Activa':
            return None
        if obj.fecha_vencimiento > date.today():
            return (obj.fecha_vencimiento - date.today()).days
        return 0


class RegistrarContratoMembresiaSerializer(serializers.Serializer):
    """CU06: Registra un contrato de membresÃ­a para un socio existente.

    Reglas de negocio:
    - Solo se aceptan planes activos.
    - El pago debe ser **exactamente** el precio del plan (no hay pagos
      parciales). El estado resultante es siempre 'Activa'.
    - El periodo se calcula de forma acumulativa (ver ``api.membresias``): si
      el socio tiene vigencia pagada, el nuevo contrato empieza al vencer la
      anterior; si no, empieza hoy.
    - El servidor determina la fecha de inicio, el vencimiento, el tipo de
      operaciÃ³n y el ``id_renovacion``; no se aceptan desde el cliente.
    """
    id_socio = serializers.PrimaryKeyRelatedField(queryset=Socio.objects.all())
    id_plan_membresia = serializers.PrimaryKeyRelatedField(
        queryset=PlanMembresia.objects.all()
    )
    id_metodo_pago = serializers.PrimaryKeyRelatedField(queryset=MetodoPago.objects.all())
    monto_pagado_local = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal('0.01')
    )

    def validate_id_plan_membresia(self, plan):
        if plan.estado != 'Activo':
            raise serializers.ValidationError(
                'Solo se pueden seleccionar planes activos.'
            )
        return plan

    def validate_monto_pagado_local(self, value):
        if value is None:
            raise serializers.ValidationError('El monto pagado es obligatorio.')
        if value < 0:
            raise serializers.ValidationError('El monto pagado no puede ser negativo.')
        return value

    def validate(self, attrs):
        plan = attrs.get('id_plan_membresia')
        monto = attrs.get('monto_pagado_local')
        if plan is not None and monto is not None:
            # Pago exacto (ni menor, ni mayor, ni negativo, ni invÃ¡lido).
            try:
                validar_pago_exacto(monto, plan)
            except ValidationError as error:
                raise serializers.ValidationError(
                    {'monto_pagado_local': list(error.messages)}
                )
        return attrs

    def create(self, validated_data):
        return crear_contrato_pagado(
            socio=validated_data['id_socio'],
            plan=validated_data['id_plan_membresia'],
            metodo_pago=validated_data['id_metodo_pago'],
        )

class DetalleVentaProductoLecturaSerializer(serializers.ModelSerializer):
    nombre_producto = serializers.CharField(source='id_producto.nombre_producto', read_only=True)

    class Meta:
        model = DetalleVentaProducto
        fields = ['id_producto', 'nombre_producto', 'cantidad', 'precio_unitario_origen',
                  'precio_unitario_local', 'subtotal_origen', 'subtotal_local']


class DetalleVentaProductoEntradaSerializer(serializers.Serializer):
    id_producto = serializers.PrimaryKeyRelatedField(queryset=Producto.objects.all())
    cantidad = serializers.IntegerField(min_value=1)


class VentaSerializer(serializers.ModelSerializer):
    # El cliente solo envÃ­a socio, mÃ©todo y productos. Usuario, caja y total
    # son determinados/calculados por el servidor.
    detalles = DetalleVentaProductoEntradaSerializer(many=True, write_only=True)
    detalle_productos = DetalleVentaProductoLecturaSerializer(
        source='detalleventaproducto_set', many=True, read_only=True
    )
    id_usuario = serializers.PrimaryKeyRelatedField(read_only=True)
    caja = serializers.PrimaryKeyRelatedField(read_only=True)
    monto_total_local = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    tasa_cambio_aplicada = serializers.DecimalField(max_digits=10, decimal_places=4, read_only=True)
    fecha_hora = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Venta
        fields = ['id_venta', 'caja', 'id_usuario', 'id_metodo_pago', 'id_socio',
                  'fecha_hora', 'nro_factura', 'tasa_cambio_aplicada',
                  'monto_total_local', 'estado_venta', 'detalles', 'detalle_productos']
        read_only_fields = ['id_venta', 'caja', 'id_usuario', 'fecha_hora',
                            'tasa_cambio_aplicada', 'monto_total_local', 'estado_venta']

    def validate_id_metodo_pago(self, metodo):
        if not metodo.activo:
            raise serializers.ValidationError('El mÃ©todo de pago seleccionado estÃ¡ inactivo.')
        return metodo

    def validate_detalles(self, detalles):
        if not detalles:
            raise serializers.ValidationError('Agrega al menos un producto a la venta.')
        ids = [item['id_producto'].pk for item in detalles]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError('No repitas productos; modifica la cantidad de la lÃ­nea existente.')
        return detalles

    @transaction.atomic
    def create(self, validated_data):
        detalles = validated_data.pop('detalles')
        # Bloquea filas para evitar vender simultÃ¡neamente el mismo stock.
        productos_ids = [item['id_producto'].pk for item in detalles]
        productos = {
            p.pk: p for p in Producto.objects.select_for_update().filter(pk__in=productos_ids)
        }
        total = Decimal('0.00')
        lineas = []
        for item in detalles:
            producto = productos.get(item['id_producto'].pk)
            cantidad = item['cantidad']
            if producto is None or producto.estado.lower() != 'activo':
                raise serializers.ValidationError({'detalles': 'Uno de los productos ya no estÃ¡ disponible.'})
            if producto.stock_actual < cantidad:
                raise serializers.ValidationError({'detalles': f"Stock insuficiente para {producto.nombre_producto}. Disponible: {producto.stock_actual}."})
            precio = producto.precio_venta_local  # Todos los importes del sistema estÃ¡n en Bs.
            subtotal = precio * cantidad
            total += subtotal
            lineas.append((producto, cantidad, precio, subtotal))

        venta = Venta.objects.create(monto_total_local=total, **validated_data)
        for producto, cantidad, precio, subtotal in lineas:
            DetalleVentaProducto.objects.create(
                id_venta=venta, id_producto=producto, cantidad=cantidad,
                precio_unitario_origen=precio, precio_unitario_local=precio,
                subtotal_origen=subtotal, subtotal_local=subtotal,
            )
            producto.stock_actual -= cantidad
            producto.save(update_fields=['stock_actual'])
        return venta



class RegistrarKardexSerializer(serializers.ModelSerializer):
    """CU15: movimiento extraordinario de inventario con actualizaciÃ³n atÃ³mica."""
    id_producto = serializers.PrimaryKeyRelatedField(queryset=Producto.objects.all())
    tipo_movimiento = serializers.ChoiceField(choices=[
        ('INGRESO', 'Ingreso extraordinario'),
        ('RETIRO', 'Retiro por vencimiento, daÃ±o o pÃ©rdida'),
        ('AJUSTE_POSITIVO', 'Ajuste positivo'),
        ('AJUSTE_NEGATIVO', 'Ajuste negativo'),
    ])
    cantidad = serializers.IntegerField(min_value=1)
    motivo = serializers.CharField(max_length=100, allow_blank=False, trim_whitespace=True)

    class Meta:
        model = KardexInventario
        fields = ['id_kardex', 'id_producto', 'tipo_movimiento', 'cantidad', 'motivo', 'fecha_movimiento']
        read_only_fields = ['id_kardex', 'fecha_movimiento']

    def validate_motivo(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('El motivo es obligatorio.')
        return value

    @transaction.atomic
    def create(self, validated_data):
        from django.db import transaction as db_transaction
        request = self.context.get('request')
        usuario = getattr(request, 'user', None)
        if not usuario or not usuario.is_authenticated or not usuario.es_administrador:
            raise serializers.ValidationError('Solo un administrador puede registrar movimientos de Kardex.')
        producto = Producto.objects.select_for_update().get(pk=validated_data['id_producto'].pk)
        if producto.estado.lower() != 'activo':
            raise serializers.ValidationError({'id_producto': 'No se pueden registrar movimientos para un producto inactivo.'})
        tipo = validated_data['tipo_movimiento']
        cantidad = validated_data['cantidad']
        signo = 1 if tipo in ('INGRESO', 'AJUSTE_POSITIVO') else -1
        nuevo_stock = producto.stock_actual + (signo * cantidad)
        if nuevo_stock < 0:
            raise serializers.ValidationError({'cantidad': f'Stock insuficiente. Stock actual: {producto.stock_actual}.'})
        movimiento = KardexInventario.objects.create(**validated_data)
        producto.stock_actual = nuevo_stock
        producto.save(update_fields=['stock_actual'])
        return movimiento


class KardexLecturaSerializer(serializers.ModelSerializer):
    nombre_producto = serializers.CharField(source='id_producto.nombre_producto', read_only=True)

    class Meta:
        model = KardexInventario
        fields = ['id_kardex', 'id_producto', 'nombre_producto', 'fecha_movimiento', 'tipo_movimiento', 'cantidad', 'motivo']
        read_only_fields = fields


class ProductoSerializer(serializers.ModelSerializer):
    """CU12: catÃ¡logo comercial. El stock y el costo promedio se calculan
    mediante compras, ventas y movimientos extraordinarios de Kardex; nunca
    se editan directamente desde esta pantalla.
    """
    class Meta:
        model = Producto
        fields = [
            'id_producto', 'id_categoria', 'nombre_producto', 'moneda_origen',
            'precio_base_original', 'precio_venta_local', 'costo_promedio_local',
            'stock_actual', 'stock_minimo', 'stock_maximo',
            'clasificacion_abc', 'estado',
        ]
        read_only_fields = ['id_producto', 'costo_promedio_local', 'stock_actual']

    def validate_nombre_producto(self, value):
        nombre = value.strip()
        if not nombre:
            raise serializers.ValidationError('El nombre del producto es obligatorio.')
        categoria = self.initial_data.get('id_categoria')
        if categoria in (None, '') and self.instance:
            categoria = self.instance.id_categoria_id
        duplicados = Producto.objects.filter(nombre_producto__iexact=nombre)
        if categoria not in (None, ''):
            duplicados = duplicados.filter(id_categoria_id=categoria)
        if self.instance:
            duplicados = duplicados.exclude(pk=self.instance.pk)
        if duplicados.exists():
            raise serializers.ValidationError('Ya existe un producto con ese nombre en la categorÃ­a seleccionada.')
        return nombre

    def validate_moneda_origen(self, value):
        moneda = value.strip().upper()
        if not moneda:
            raise serializers.ValidationError('La moneda de origen es obligatoria.')
        return moneda

    def validate_clasificacion_abc(self, value):
        if value in (None, ''):
            return None
        valor = value.strip().upper()
        if valor not in ('A', 'B', 'C'):
            raise serializers.ValidationError('La clasificaciÃ³n ABC debe ser A, B o C.')
        return valor

    def validate_estado(self, value):
        valor = value.strip().capitalize()
        if valor not in ('Activo', 'Inactivo'):
            raise serializers.ValidationError('El estado debe ser Activo o Inactivo.')
        return valor

    def validate(self, attrs):
        stock_minimo = attrs.get('stock_minimo', getattr(self.instance, 'stock_minimo', 0))
        stock_maximo = attrs.get('stock_maximo', getattr(self.instance, 'stock_maximo', None))
        if stock_minimo is not None and stock_minimo < 0:
            raise serializers.ValidationError({'stock_minimo': 'El stock mÃ­nimo no puede ser negativo.'})
        if stock_maximo is not None and stock_maximo < 0:
            raise serializers.ValidationError({'stock_maximo': 'El stock mÃ¡ximo no puede ser negativo.'})
        if stock_maximo is not None and stock_maximo < stock_minimo:
            raise serializers.ValidationError({'stock_maximo': 'El stock mÃ¡ximo no puede ser menor que el stock mÃ­nimo.'})
        return attrs



class ProveedorSerializer(serializers.ModelSerializer):
    """CU13: registro y mantenimiento de proveedores."""
    class Meta:
        model = Proveedor
        fields = [
            'id_proveedor', 'razon_social', 'nit', 'moneda_facturacion',
            'telefono', 'email', 'direccion',
        ]
        read_only_fields = ['id_proveedor']

    def validate_razon_social(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('La razÃ³n social es obligatoria.')
        return value

    def validate_nit(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('El NIT es obligatorio.')
        duplicados = Proveedor.objects.filter(nit__iexact=value)
        if self.instance:
            duplicados = duplicados.exclude(pk=self.instance.pk)
        if duplicados.exists():
            raise serializers.ValidationError('Ya existe un proveedor registrado con ese NIT.')
        return value

    def validate_moneda_facturacion(self, value):
        value = value.strip().upper()
        if not value:
            raise serializers.ValidationError('La moneda de facturaciÃ³n es obligatoria.')
        return value

    def validate_telefono(self, value):
        return value.strip() if value else value

    def validate_email(self, value):
        return value.strip().lower() if value else value

    def validate_direccion(self, value):
        return value.strip() if value else value


# ============================================================
# CU17: REGISTRAR EJERCICIO
# ============================================================
class EjercicioSerializer(serializers.ModelSerializer):
    """Alta y ediciÃ³n de ejercicios del catÃ¡logo del gimnasio.

    Reglas de negocio:
    - El nombre es obligatorio y no puede repetirse dentro del mismo grupo
      muscular (evita duplicados como "Press de banca" / "press banca").
    - El grupo muscular se valida contra el catÃ¡logo ``GRUPOS_MUSCULARES``.
    - El video es opcional, pero si se informa debe ser una URL vÃ¡lida.
    """

    class Meta:
        model = Ejercicio
        fields = [
            'id_ejercicio',
            'nombre_ejercicio',
            'grupo_muscular',
            'equipo_requerido',
            'zona_ubicacion',
            'url_video_tecnica',
            'descripcion_tecnica',
            'estado',
        ]
        read_only_fields = ['id_ejercicio']

    def validate_nombre_ejercicio(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('El nombre del ejercicio es obligatorio.')
        return value

    def validate_grupo_muscular(self, value):
        if not value:
            raise serializers.ValidationError('Debe indicar el grupo muscular.')
        validos = dict(GRUPOS_MUSCULARES).keys()
        if value not in validos:
            raise serializers.ValidationError(
                f'Grupo muscular invÃ¡lido. Opciones: {", ".join(sorted(validos))}.'
            )
        return value

    def validate_url_video_tecnica(self, value):
        if not value:
            return value
        value = value.strip()
        if not value.lower().startswith(('http://', 'https://')):
            raise serializers.ValidationError('El video debe ser una URL http(s) vÃ¡lida.')
        return value

    def validate(self, attrs):
        nombre = (attrs.get('nombre_ejercicio') or '').strip().lower()
        grupo = attrs.get('grupo_muscular')
        # En ediciÃ³n se excluye el propio registro del control de duplicados.
        excluido = self.instance.pk if self.instance else None
        duplicado = (
            Ejercicio.objects.filter(nombre_ejercicio__iexact=nombre, grupo_muscular=grupo)
            .exclude(pk=excluido)
            .exists()
        )
        if duplicado:
            raise serializers.ValidationError({
                'nombre_ejercicio': f'Ya existe un ejercicio "{attrs.get("nombre_ejercicio")}" '
                                    f'en el grupo muscular "{grupo}".'
            })
        return attrs


class EjercicioListSerializer(serializers.ModelSerializer):
    """Lectura del catÃ¡logo (lista y detalle)."""
    en_rutinas = serializers.IntegerField(read_only=True)

    class Meta:
        model = Ejercicio
        fields = [
            'id_ejercicio',
            'nombre_ejercicio',
            'grupo_muscular',
            'equipo_requerido',
            'zona_ubicacion',
            'url_video_tecnica',
            'descripcion_tecnica',
            'estado',
            'en_rutinas',
        ]


# ============================================================
# CU18: DISEÃ‘AR RUTINA DE ENTRENAMIENTO
# ============================================================
class DetalleRutinaSerializer(serializers.ModelSerializer):
    """Fila de la rutina: ejercicio + series + repeticiones + descanso."""

    id_ejercicio = serializers.PrimaryKeyRelatedField(queryset=Ejercicio.objects.all())
    nombre_ejercicio = serializers.CharField(source='id_ejercicio.nombre_ejercicio', read_only=True)
    grupo_muscular = serializers.CharField(source='id_ejercicio.grupo_muscular', read_only=True)

    class Meta:
        model = DetalleRutina
        fields = [
            'id_ejercicio',
            'nombre_ejercicio',
            'grupo_muscular',
            'orden',
            'series',
            'repeticiones',
            'descanso_minutos',
        ]

    def validate_id_ejercicio(self, ejercicio):
        if ejercicio.estado != 'Activo':
            raise serializers.ValidationError('Solo se pueden usar ejercicios activos.')
        return ejercicio

    def validate(self, attrs):
        if attrs.get('series', 1) < 1:
            raise serializers.ValidationError({'series': 'Las series deben ser al menos 1.'})
        if attrs.get('repeticiones', 1) < 1:
            raise serializers.ValidationError({'repeticiones': 'Las repeticiones deben ser al menos 1.'})
        descanso = attrs.get('descanso_minutos')
        if descanso is not None and descanso < 0:
            raise serializers.ValidationError({'descanso_minutos': 'El descanso no puede ser negativo.'})
        return attrs


class RutinaSerializer(serializers.ModelSerializer):
    """Lectura de una rutina CON su plan de ejercicios ya resuelto."""

    detalles = DetalleRutinaSerializer(many=True, read_only=True)
    total_ejercicios = serializers.SerializerMethodField()
    total_series = serializers.SerializerMethodField()

    class Meta:
        model = Rutina
        fields = [
            'id_rutina',
            'nombre_rutina',
            'nivel',
            'descripcion',
            'calorias_estimadas',
            'duracion_estimada_mins',
            'estado',
            'detalles',
            'total_ejercicios',
            'total_series',
        ]
        read_only_fields = ['id_rutina']

    def get_total_ejercicios(self, obj):
        return obj.detalles.count()

    def get_total_series(self, obj):
        return sum(detalle.series for detalle in obj.detalles.all())


class RutinaConDetallesSerializer(serializers.Serializer):
    """CU18: crea/actualiza la rutina JUNTO CON sus ejercicios, en una sola peticiÃ³n.

    El cliente envÃ­a un Ãºnico JSON con la cabecera de la rutina y la lista
    ``ejercicios``. El servidor valida que:
    - haya al menos un ejercicio,
    - no haya ejercicios repetidos dentro de la rutina,
    - todos los ejercicios estÃ©n activos.
    La escritura es atÃ³mica: si algo falla, no se guarda nada.
    """

    nombre_rutina = serializers.CharField(max_length=100)
    nivel = serializers.ChoiceField(choices=NIVELES_RUTINA, default='Principiante')
    descripcion = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    calorias_estimadas = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    duracion_estimada_mins = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    ejercicios = DetalleRutinaSerializer(many=True)

    def validate_nombre_rutina(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('El nombre de la rutina es obligatorio.')
        excluido = self.instance.pk if self.instance else None
        if Rutina.objects.filter(nombre_rutina__iexact=value).exclude(pk=excluido).exists():
            raise serializers.ValidationError('Ya existe una rutina con ese nombre.')
        return value

    def validate_ejercicios(self, ejercicios):
        if not ejercicios:
            raise serializers.ValidationError('La rutina debe incluir al menos un ejercicio.')

        vistos = set()
        for detalle in ejercicios:
            clave = detalle['id_ejercicio'].pk
            if clave in vistos:
                raise serializers.ValidationError(
                    f'El ejercicio "{detalle["id_ejercicio"].nombre_ejercicio}" estÃ¡ repetido '
                    'dentro de la rutina.'
                )
            vistos.add(clave)
        return ejercicios

    def create(self, validated_data):
        detalles = validated_data.pop('ejercicios')
        with transaction.atomic():
            rutina = Rutina.objects.create(**validated_data)
            DetalleRutina.objects.bulk_create([
                DetalleRutina(
                    id_rutina=rutina,
                    id_ejercicio=detalle['id_ejercicio'],
                    orden=detalle.get('orden') or posicion + 1,
                    series=detalle['series'],
                    repeticiones=detalle['repeticiones'],
                    descanso_minutos=detalle.get('descanso_minutos'),
                )
                for posicion, detalle in enumerate(detalles)
            ])
        return rutina

    def update(self, instance, validated_data):
        detalles = validated_data.pop('ejercicios')
        with transaction.atomic():
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()

            # Se reconstruye el plan completo (alta/ediciÃ³n/baja de ejercicios
            # en una sola operaciÃ³n) respetando el orden recibido.
            instance.detalles.all().delete()
            DetalleRutina.objects.bulk_create([
                DetalleRutina(
                    id_rutina=instance,
                    id_ejercicio=detalle['id_ejercicio'],
                    orden=detalle.get('orden') or posicion + 1,
                    series=detalle['series'],
                    repeticiones=detalle['repeticiones'],
                    descanso_minutos=detalle.get('descanso_minutos'),
                )
                for posicion, detalle in enumerate(detalles)
            ])
        return instance


# ============================================================
# CU19: ASIGNAR RUTINA A SOCIO
# ============================================================
class AsignacionRutinaSerializer(serializers.ModelSerializer):
    """Asocia una rutina existente a un socio con membresÃ­a vigente.

    Reglas de negocio:
    - El socio debe tener la cuenta activa.
    - El socio debe tener membresÃ­a **Vigente** (se reutiliza
      ``resumen_membresia`` para no duplicar criterios de vigencia).
    - La rutina debe estar activa.
    - No se puede asignar dos veces la misma rutina activa al mismo socio.
    """

    socio_username = serializers.CharField(source='id_socio.id_socio.username', read_only=True)
    socio_ci = serializers.CharField(source='id_socio.id_socio.ci', read_only=True)
    rutina_nombre = serializers.CharField(source='id_rutina.nombre_rutina', read_only=True)
    entrenador_username = serializers.CharField(source='id_entrenador.id_entrenador.username', read_only=True)
    membresia = serializers.SerializerMethodField()

    # Opcional: si el cliente no lo envÃ­a, la vista firma la asignaciÃ³n con
    # el perfil de Entrenador del usuario autenticado.
    id_entrenador = serializers.PrimaryKeyRelatedField(
        queryset=Entrenador.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = AsignacionRutina
        fields = [
            'id_asignacion_rutina',
            'id_socio',
            'socio_username',
            'socio_ci',
            'id_rutina',
            'rutina_nombre',
            'id_entrenador',
            'entrenador_username',
            'fecha_asignacion',
            'fecha_inicio',
            'fecha_fin',
            'observaciones',
            'estado',
            'membresia',
        ]
        read_only_fields = ['id_asignacion_rutina', 'fecha_asignacion']

    def get_membresia(self, obj):
        return resumen_membresia(obj.id_socio)

    def validate(self, attrs):
        socio = attrs.get('id_socio')
        rutina = attrs.get('id_rutina')

        if socio is not None:
            if socio.id_socio.estado_cuenta != 'Activo':
                raise serializers.ValidationError({
                    'id_socio': 'El socio tiene la cuenta desactivada; no puede recibir rutinas.'
                })

            membresia = resumen_membresia(socio)
            if membresia['estado'] != 'Vigente':
                raise serializers.ValidationError({
                    'id_socio': f'El socio no puede recibir rutinas: su membresÃ­a estÃ¡ '
                                f'"{membresia["estado"]}". Renueve la membresÃ­a (CU06) primero.'
                })

        if rutina is not None and rutina.estado != 'Activo':
            raise serializers.ValidationError({
                'id_rutina': 'Solo se pueden asignar rutinas activas.'
            })

        # Evita duplicar la misma rutina vigente para el mismo socio.
        if self.instance is None and socio is not None and rutina is not None:
            duplicada = (
                AsignacionRutina.objects
                .filter(id_socio=socio, id_rutina=rutina, estado='Activa')
                .exists()
            )
            if duplicada:
                raise serializers.ValidationError({
                    'id_rutina': f'La rutina "{rutina.nombre_rutina}" ya estÃ¡ asignada '
                                 'y activa para este socio.'
                })

        return attrs


# ============================================================
# CU20: GESTIONAR PERFIL DE ENTRENADOR
# ============================================================
class HorarioEntrenadorSerializer(serializers.ModelSerializer):
    """Disponibilidad semanal del entrenador (dÃ­a + turno del catÃ¡logo)."""

    dia_semana_display = serializers.CharField(source='get_dia_semana_display', read_only=True)
    turno_nombre = serializers.CharField(source='id_turno.nombre_turno', read_only=True)
    hora_inicio = serializers.TimeField(source='id_turno.hora_inicio', read_only=True)
    hora_fin = serializers.TimeField(source='id_turno.hora_fin', read_only=True)

    class Meta:
        model = HorarioEntrenador
        fields = [
            'id_horario_entrenador',
            'id_turno',
            'turno_nombre',
            'dia_semana',
            'dia_semana_display',
            'hora_inicio',
            'hora_fin',
        ]
        read_only_fields = ['id_horario_entrenador']

    def validate_dia_semana(self, value):
        validos = dict(DIAS_SEMANA).keys()
        if value not in validos:
            raise serializers.ValidationError(f'DÃ­a invÃ¡lido. Opciones: {", ".join(sorted(validos))}.')
        return value


class EntrenadorSerializer(serializers.ModelSerializer):
    """Perfil del entrenador: datos personales + especialidad + horarios.

    Los campos de la cuenta (username, email, ci, telÃ©fono) se leen desde el
    ``Usuario`` relacionado y son de solo lectura aquÃ­; la gestiÃ³n de la
    contraseÃ±a queda en el mÃ³dulo de usuarios (CU01).
    """

    username = serializers.CharField(source='id_entrenador.username', read_only=True)
    email = serializers.EmailField(source='id_entrenador.email', read_only=True)
    ci = serializers.CharField(source='id_entrenador.ci', read_only=True)
    telefono = serializers.CharField(source='id_entrenador.telefono', read_only=True)
    estado_cuenta = serializers.CharField(source='id_entrenador.estado_cuenta', read_only=True)
    horarios = HorarioEntrenadorSerializer(many=True, read_only=True)

    class Meta:
        model = Entrenador
        fields = [
            'id_entrenador',
            'username',
            'email',
            'ci',
            'telefono',
            'estado_cuenta',
            'especialidad',
            'certificado',
            'biografia_profesional',
            'anios_experiencia',
            'red_social_link',
            'estado',
            'horarios',
        ]
        read_only_fields = ['id_entrenador']


class RegistrarEntrenadorSerializer(serializers.Serializer):
    """CU20: alta completa de entrenador (cuenta + perfil + horarios).

    Crea la ``Usuario`` con el rol ``es_entrenador`` y su perfil ``Entrenador``
    en la misma operaciÃ³n atÃ³mica, replicando el patrÃ³n de CU04 (Registrar
    Socio). Los horarios se reciben como lista opcional de
    ``{id_turno, dia_semana}``.
    """

    username = serializers.CharField(max_length=150)
    email = serializers.EmailField(required=False, allow_blank=True)
    ci = serializers.CharField(max_length=20)
    telefono = serializers.CharField(max_length=20, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True)
    password2 = serializers.CharField(write_only=True)

    especialidad = serializers.CharField(max_length=100, required=False, allow_blank=True)
    certificado = serializers.CharField(max_length=100, required=False, allow_blank=True)
    biografia_profesional = serializers.CharField(required=False, allow_blank=True)
    anios_experiencia = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    red_social_link = serializers.CharField(max_length=255, required=False, allow_blank=True)

    horarios = HorarioEntrenadorSerializer(many=True, required=False)

    def validate_username(self, value):
        if Usuario.objects.filter(username=value).exists():
            raise serializers.ValidationError('Ese nombre de usuario ya existe.')
        return value

    def validate_ci(self, value):
        if Usuario.objects.filter(ci=value).exists():
            raise serializers.ValidationError('Ya existe una persona registrada con ese CI.')
        return value

    def validate_horarios(self, horarios):
        vistos = set()
        for horario in horarios:
            clave = (horario['id_turno'].pk, horario['dia_semana'])
            if clave in vistos:
                raise serializers.ValidationError(
                    f'El turno {horario["id_turno"].nombre_turno} del '
                    f'{horario["dia_semana"]} estÃ¡ duplicado.'
                )
            vistos.add(clave)
        return horarios

    def validate(self, attrs):
        if attrs.get('password') != attrs.get('password2'):
            raise serializers.ValidationError({'password2': 'Las contraseÃ±as no coinciden.'})
        try:
            validate_password(attrs.get('password'))
        except ValidationError as e:
            raise serializers.ValidationError({'password': list(e.messages)})
        return attrs

    def create(self, validated_data):
        horarios = validated_data.pop('horarios', [])
        validated_data.pop('password2', None)
        password = validated_data.pop('password')

        with transaction.atomic():
            usuario = Usuario.objects.create_user(
                username=validated_data['username'],
                email=validated_data.get('email', ''),
                ci=validated_data['ci'],
                telefono=validated_data.get('telefono', ''),
                es_entrenador=True,
                password=password,
            )

            entrenador = Entrenador.objects.create(
                id_entrenador=usuario,
                especialidad=validated_data.get('especialidad', ''),
                certificado=validated_data.get('certificado', ''),
                biografia_profesional=validated_data.get('biografia_profesional', ''),
                anios_experiencia=validated_data.get('anios_experiencia'),
                red_social_link=validated_data.get('red_social_link', ''),
            )

            HorarioEntrenador.objects.bulk_create([
                HorarioEntrenador(
                    id_entrenador=entrenador,
                    id_turno=horario['id_turno'],
                    dia_semana=horario['dia_semana'],
                )
                for horario in horarios
            ])

        return entrenador


# ============================================================
# CU03: Registrar BitÃ¡cora de AuditorÃ­a
# ============================================================
class BitacoraSerializer(serializers.ModelSerializer):
    usuario_username = serializers.SerializerMethodField()

    class Meta:
        model = Bitacora
        fields = [
            'id_bitacora',
            'id_usuario',
            'usuario_username',
            'nombre_usuario_db',
            'accion',
            'tabla_afectada',
            'descripcion',
            'direccion_ip',
            'fecha_hora',
        ]
        read_only_fields = fields

    def get_usuario_username(self, obj):
        if obj.id_usuario_id:
            return obj.id_usuario.username
        return obj.nombre_usuario_db or 'Sistema'


# ============================================================
# CU04: Registrar Expediente de Socio (alta desde RecepciÃ³n)
# ============================================================
class RegistrarSocioSerializer(serializers.Serializer):
    """Crea la cuenta de Usuario (rol Socio) + su expediente (Socio),
    y opcionalmente asigna un plan de membresÃ­a inicial (crea el
    primer ContratoMembresia, ligado a CU06)."""

    username = serializers.CharField(max_length=150)
    email = serializers.EmailField(required=False, allow_blank=True)
    ci = serializers.CharField(max_length=20)
    telefono = serializers.CharField(max_length=20, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True)
    password2 = serializers.CharField(write_only=True)

    fecha_nacimiento = serializers.DateField()
    peso_inicial_kg = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, allow_null=True
    )
    contacto_emerg_nombre = serializers.CharField(
        max_length=150, required=False, allow_blank=True
    )

    id_plan_membresia = serializers.PrimaryKeyRelatedField(
        queryset=PlanMembresia.objects.all(), required=False, allow_null=True
    )

    id_metodo_pago = serializers.PrimaryKeyRelatedField(
        queryset=MetodoPago.objects.all(), required=False, allow_null=True
    )

    def validate_username(self, value):
        if Usuario.objects.filter(username=value).exists():
            raise serializers.ValidationError('Ese nombre de usuario ya existe.')
        return value

    def validate_ci(self, value):
        if Usuario.objects.filter(ci=value).exists():
            raise serializers.ValidationError('Ya existe un socio registrado con ese CI.')
        return value

    def validate(self, attrs):
        if attrs.get('password') != attrs.get('password2'):
            raise serializers.ValidationError({'password2': 'Las contraseÃ±as no coinciden.'})
        try:
            validate_password(attrs.get('password'))
        except ValidationError as e:
            raise serializers.ValidationError({'password': list(e.messages)})
        return attrs

    def create(self, validated_data):
        plan = validated_data.pop('id_plan_membresia', None)
        metodo_pago = validated_data.pop('id_metodo_pago', None)
        validated_data.pop('password2', None)
        password = validated_data.pop('password')

        usuario = Usuario.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            ci=validated_data['ci'],
            telefono=validated_data.get('telefono', ''),
            es_socio=True,
            password=password,
        )

        socio = Socio.objects.create(
            id_socio=usuario,
            fecha_nacimiento=validated_data['fecha_nacimiento'],
            peso_inicial_kg=validated_data.get('peso_inicial_kg'),
            contacto_emerg_nombre=validated_data.get('contacto_emerg_nombre', ''),
        )

        contrato = None
        if plan is not None:
            # MembresÃ­a inicial con pago completo y mÃ©todo real (Efectivo por
            # defecto si no se indica). Reutiliza la misma lÃ³gica que CU06.
            if metodo_pago is None:
                metodo_pago = metodo_pago_por_defecto()
            contrato = crear_contrato_pagado(socio=socio, plan=plan, metodo_pago=metodo_pago)

        return {'usuario': usuario, 'socio': socio, 'contrato': contrato}

# ============================================================
# CU14: REGISTRAR COMPRA DE MERCADERIA
# ============================================================
class DetalleCompraEntradaSerializer(serializers.Serializer):
    id_producto = serializers.PrimaryKeyRelatedField(
        queryset=Producto.objects.filter(estado__iexact='Activo')
    )
    cantidad = serializers.IntegerField(min_value=1)
    costo_unitario_origen = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))


class RegistrarCompraSerializer(serializers.ModelSerializer):
    """Registra una compra completa y actualiza existencias/costo promedio."""
    detalles = DetalleCompraEntradaSerializer(many=True, write_only=True)

    class Meta:
        model = Compra
        fields = [
            'id_compra', 'id_proveedor', 'nro_factura_proveedor',
            'tasa_cambio_aplicada', 'detalles',
        ]
        read_only_fields = ['id_compra']

    def validate_tasa_cambio_aplicada(self, value):
        if value <= 0:
            raise serializers.ValidationError('La tasa de cambio debe ser mayor que cero.')
        return value

    def validate(self, attrs):
        detalles = attrs.get('detalles') or []
        if not detalles:
            raise serializers.ValidationError({'detalles': 'La compra debe incluir al menos un producto.'})
        ids = [d['id_producto'].pk for d in detalles]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError({'detalles': 'No repita productos; agrupe sus cantidades en una sola lÃ­nea.'})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        from django.db.models import F
        from django.utils import timezone

        detalles_data = validated_data.pop('detalles')
        request = self.context.get('request')
        usuario = getattr(request, 'user', None)
        if not usuario or not usuario.is_authenticated or not usuario.es_administrador:
            raise serializers.ValidationError('Solo un administrador puede registrar compras.')

        administrador, _ = Administrador.objects.get_or_create(id_administrador=usuario)
        tasa = validated_data['tasa_cambio_aplicada']

        # Bloquea productos para evitar que compras simultaneas calculen stock/costo con datos viejos.
        producto_ids = sorted(d['id_producto'].pk for d in detalles_data)
        productos = {p.pk: p for p in Producto.objects.select_for_update().filter(pk__in=producto_ids).order_by('pk')}
        if len(productos) != len(producto_ids):
            raise serializers.ValidationError({'detalles': 'Uno o mÃ¡s productos ya no existen.'})
        for producto in productos.values():
            if producto.estado.lower() != 'activo':
                raise serializers.ValidationError({'detalles': f"El producto '{producto.nombre_producto}' estÃ¡ inactivo."})

        lineas = []
        total_origen = Decimal('0.00')
        total_local = Decimal('0.00')
        for item in detalles_data:
            producto = productos[item['id_producto'].pk]
            cantidad = item['cantidad']
            unitario_origen = item['costo_unitario_origen'].quantize(Decimal('0.01'))
            unitario_local = (unitario_origen * tasa).quantize(Decimal('0.01'))
            subtotal_origen = (unitario_origen * cantidad).quantize(Decimal('0.01'))
            subtotal_local = (unitario_local * cantidad).quantize(Decimal('0.01'))
            total_origen += subtotal_origen
            total_local += subtotal_local
            lineas.append((producto, cantidad, unitario_origen, unitario_local, subtotal_origen, subtotal_local))

        compra = Compra.objects.create(
            id_administrador=administrador,
            monto_total_origen=total_origen,
            monto_total_local=total_local,
            estado_compra='Completada',
            **validated_data,
        )

        for producto, cantidad, unitario_origen, unitario_local, subtotal_origen, subtotal_local in lineas:
            DetalleCompra.objects.create(
                id_compra=compra, id_producto=producto, cantidad=cantidad,
                costo_unitario_origen=unitario_origen, costo_unitario_local=unitario_local,
                subtotal_origen=subtotal_origen, subtotal_local=subtotal_local,
            )
            stock_anterior = producto.stock_actual
            stock_nuevo = stock_anterior + cantidad
            if stock_anterior > 0:
                costo_total_anterior = producto.costo_promedio_local * stock_anterior
                nuevo_promedio = ((costo_total_anterior + subtotal_local) / Decimal(stock_nuevo)).quantize(Decimal('0.01'))
            else:
                nuevo_promedio = unitario_local
            producto.stock_actual = stock_nuevo
            producto.costo_promedio_local = nuevo_promedio
            producto.save(update_fields=['stock_actual', 'costo_promedio_local'])

        return compra


class CompraDetalleLecturaSerializer(serializers.ModelSerializer):
    nombre_producto = serializers.CharField(source='id_producto.nombre_producto', read_only=True)

    class Meta:
        model = DetalleCompra
        fields = [
            'id_producto', 'nombre_producto', 'cantidad', 'costo_unitario_origen',
            'costo_unitario_local', 'subtotal_origen', 'subtotal_local',
        ]


class CompraLecturaSerializer(serializers.ModelSerializer):
    proveedor_nombre = serializers.CharField(source='id_proveedor.razon_social', read_only=True)
    detalles = CompraDetalleLecturaSerializer(source='detallecompra_set', many=True, read_only=True)
    administrador_nombre = serializers.CharField(source='id_administrador.id_administrador.username', read_only=True)

    class Meta:
        model = Compra
        fields = [
            'id_compra', 'id_proveedor', 'proveedor_nombre', 'id_administrador',
            'administrador_nombre', 'fecha_hora', 'nro_factura_proveedor',
            'tasa_cambio_aplicada', 'monto_total_origen', 'monto_total_local',
            'estado_compra', 'detalles',
        ]


# CU16: ALERTAS DE REPOSICION
class AlertaReposicionSerializer(serializers.ModelSerializer):
    nombre_producto = serializers.CharField(source='id_producto.nombre_producto', read_only=True)
    stock_actual = serializers.IntegerField(source='id_producto.stock_actual', read_only=True)
    stock_minimo = serializers.IntegerField(source='id_producto.stock_minimo', read_only=True)

    class Meta:
        model = AlertaReposicion
        fields = ['id_alerta_repo', 'id_producto', 'nombre_producto', 'stock_actual',
                  'stock_minimo', 'nivel_urgencia', 'cantidad_sugerida',
                  'estado_alerta', 'fecha_generacion', 'fecha_cierre']
        read_only_fields = fields

class ArqueoCajaSerializer(serializers.ModelSerializer):
    responsable_nombre = serializers.CharField(source='responsable.username', read_only=True)
    turno_nombre = serializers.CharField(source='turno.nombre_turno', read_only=True)

    class Meta:
        model = ArqueoCaja
        fields = [
            'id_caja', 'responsable', 'responsable_nombre',
            'turno', 'turno_nombre', 'fecha_apertura',
            'fecha_cierre', 'monto_inicial', 'monto_final',
            'efectivo_contado', 'diferencia', 'estado'
        ]
        read_only_fields = fields

class ArqueoCajaSerializer(serializers.ModelSerializer):
    responsable_nombre = serializers.CharField(source='responsable.username', read_only=True)
    turno_nombre = serializers.CharField(source='turno.nombre_turno', read_only=True)

    class Meta:
        model = ArqueoCaja
        fields = [
            'id_caja', 'responsable', 'responsable_nombre',
            'turno', 'turno_nombre', 'fecha_apertura',
            'fecha_cierre', 'monto_inicial', 'monto_final',
            'efectivo_contado', 'diferencia', 'estado'
        ]
        read_only_fields = fields


class EgresoCajaSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.CharField(source='usuario.username', read_only=True)

    class Meta:
        model = EgresoCaja
        fields = ['id_egreso', 'caja', 'usuario', 'usuario_nombre', 'fecha_hora', 'concepto', 'monto', 'observacion']
        read_only_fields = ['id_egreso', 'caja', 'usuario', 'usuario_nombre', 'fecha_hora']

    def validate_monto(self, value):
        if value <= 0:
            raise serializers.ValidationError('El monto debe ser mayor que cero.')
        return value

    def validate_concepto(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('El concepto es obligatorio.')
        return value
