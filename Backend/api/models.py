from django.core.validators import MinValueValidator, MaxValueValidator
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models import Q
from decimal import Decimal

# ==============================================================================
# CONSTANTES COMPARTIDAS (catálogos de UI y validaciones)
# ==============================================================================

# CU17: catálogo de grupos musculares. Se expone al frontend mediante
# ``GET /api/ejercicios/grupos/`` para poblar los selects sin escribir
# los valores a mano (evita "Pecho", "pecho", "PECHO" en la misma BD).
GRUPOS_MUSCULARES = [
    ('Pecho', 'Pecho'),
    ('Espalda', 'Espalda'),
    ('Hombros', 'Hombros'),
    ('Brazos', 'Brazos'),
    ('Piernas', 'Piernas'),
    ('Gluteos', 'Glúteos'),
    ('Abdomen', 'Abdomen'),
    ('Cuerpo completo', 'Cuerpo completo'),
]

DIAS_SEMANA = [
    ('Lunes', 'Lunes'),
    ('Martes', 'Martes'),
    ('Miercoles', 'Miércoles'),
    ('Jueves', 'Jueves'),
    ('Viernes', 'Viernes'),
    ('Sabado', 'Sábado'),
    ('Domingo', 'Domingo'),
]

NIVELES_RUTINA = [
    ('Principiante', 'Principiante'),
    ('Intermedio', 'Intermedio'),
    ('Avanzado', 'Avanzado'),
]



class Usuario(AbstractUser):
    ci = models.CharField(max_length=20, unique=True, null=True, blank=True)
    telefono = models.CharField(max_length=20, null=True, blank=True)
    estado_cuenta = models.CharField(max_length=20, default='Activo')
    
    # Roles
    es_socio = models.BooleanField(default=False)
    es_entrenador = models.BooleanField(default=False)
    es_recepcionista = models.BooleanField(default=False)
    es_administrador = models.BooleanField(default=False)

    class Meta:
        db_table = 'usuario'

# ==============================================================================
# FASE 1: CATÁLOGOS BASE Y MODELOS PRIMARIOS
# ==============================================================================

class MetodoPago(models.Model):
    id_metodo_pago = models.AutoField(primary_key=True)
    descripcion = models.CharField(max_length=100, unique=True)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = 'metodo_pago'

class Proveedor(models.Model):
    id_proveedor = models.AutoField(primary_key=True)
    razon_social = models.CharField(max_length=150)
    nit = models.CharField(max_length=50, unique=True)
    moneda_facturacion = models.CharField(max_length=10, default='BOB')
    telefono = models.CharField(max_length=20, null=True, blank=True)
    email = models.CharField(max_length=100, null=True, blank=True)
    direccion = models.TextField(null=True, blank=True)

    class Meta:
        db_table = 'proveedor'


class CategoriaProducto(models.Model):
    id_categoria = models.AutoField(primary_key=True)
    nombre_categoria = models.CharField(max_length=100)
    id_subcategoria = models.ForeignKey(
        'self', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        db_column='id_subcategoria'
    )

    class Meta:
        db_table = 'categoria_producto'


class PlanMembresia(models.Model):
    id_plan_membresia = models.AutoField(primary_key=True)
    nombre_plan = models.CharField(max_length=100)
    moneda_origen = models.CharField(max_length=10, default='BOB')
    costo_base_origen = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    duracion_dias = models.IntegerField(validators=[MinValueValidator(1)])
    acceso_piscina = models.BooleanField(default=False)
    clases_grupales = models.BooleanField(default=False)
    estado = models.CharField(max_length=20, default='Activo')

    class Meta:
        db_table = 'plan_membresia'


class Rutina(models.Model):
    id_rutina = models.AutoField(primary_key=True)
    nombre_rutina = models.CharField(max_length=100)
    nivel = models.CharField(max_length=50, choices=NIVELES_RUTINA, default='Principiante')
    descripcion = models.TextField(null=True, blank=True)
    calorias_estimadas = models.IntegerField(null=True, blank=True, validators=[MinValueValidator(1)])
    duracion_estimada_mins = models.IntegerField(null=True, blank=True, validators=[MinValueValidator(1)])
    estado = models.CharField(max_length=20, default='Activo')

    class Meta:
        db_table = 'rutina'


class Ejercicio(models.Model):
    id_ejercicio = models.AutoField(primary_key=True)
    nombre_ejercicio = models.CharField(max_length=100)
    equipo_requerido = models.CharField(max_length=100, null=True, blank=True)
    grupo_muscular = models.CharField(
        max_length=100, choices=GRUPOS_MUSCULARES, null=True, blank=True
    )
    zona_ubicacion = models.CharField(max_length=100, null=True, blank=True)
    url_video_tecnica = models.CharField(max_length=255, null=True, blank=True)
    descripcion_tecnica = models.TextField(null=True, blank=True)
    estado = models.CharField(max_length=20, default='Activo')

    class Meta:
        db_table = 'ejercicio'


class Turno(models.Model):
    id_turno = models.AutoField(primary_key=True)
    nombre_turno = models.CharField(max_length=50)
    hora_inicio = models.TimeField()
    hora_fin = models.TimeField()

    class Meta:
        db_table = 'turno'


# ==============================================================================
# FASE 2: TABLAS DE HERENCIA Y CATALOGOS DEPENDIENTES
# ==============================================================================

class Administrador(models.Model):
    id_administrador = models.OneToOneField(Usuario, primary_key=True, on_delete=models.CASCADE, db_column='id_administrador')

    class Meta:
        db_table = 'administrador'


class Recepcionista(models.Model):
    id_recepcionista = models.OneToOneField(Usuario, primary_key=True, on_delete=models.CASCADE, db_column='id_recepcionista')

    class Meta:
        db_table = 'recepcionista'


class Entrenador(models.Model):
    id_entrenador = models.OneToOneField(Usuario, primary_key=True, on_delete=models.CASCADE, db_column='id_entrenador')
    certificado = models.CharField(max_length=100, null=True, blank=True)
    especialidad = models.CharField(max_length=100, null=True, blank=True)
    biografia_profesional = models.TextField(null=True, blank=True)
    anios_experiencia = models.IntegerField(null=True, blank=True, validators=[MinValueValidator(0)])
    red_social_link = models.CharField(max_length=255, null=True, blank=True)
    estado = models.CharField(max_length=20, default='Activo')

    class Meta:
        db_table = 'entrenador'


class HorarioEntrenador(models.Model):
    """CU20: disponibilidad semanal del entrenador.

    Reutiliza el catálogo ``Turno`` (franja horaria) más el día de la semana,
    en lugar de duplicar horas en cada fila. La restricción
    ``unique_together`` impide que el mismo entrenador quede registrado dos
    veces en el mismo turno/día (dato incoherente para la agenda).
    """
    id_horario_entrenador = models.AutoField(primary_key=True)
    id_entrenador = models.ForeignKey(
        Entrenador, on_delete=models.CASCADE, db_column='id_entrenador', related_name='horarios'
    )
    id_turno = models.ForeignKey(Turno, on_delete=models.RESTRICT, db_column='id_turno')
    dia_semana = models.CharField(max_length=15, choices=DIAS_SEMANA)

    class Meta:
        db_table = 'horario_entrenador'
        unique_together = (('id_entrenador', 'id_turno', 'dia_semana'),)


class Socio(models.Model):
    id_socio = models.OneToOneField(Usuario, primary_key=True, on_delete=models.CASCADE, db_column='id_socio')
    foto_perfil = models.CharField(max_length=255, null=True, blank=True)
    fecha_registro = models.DateField(auto_now_add=True)
    fecha_nacimiento = models.DateField()
    peso_inicial_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0.01)])
    contacto_emerg_nombre = models.CharField(max_length=150, null=True, blank=True)

    class Meta:
        db_table = 'socio'


class Bitacora(models.Model):
    id_bitacora = models.AutoField(primary_key=True)
    direccion_ip = models.CharField(max_length=45, null=True, blank=True)
    nombre_usuario_db = models.CharField(max_length=100, null=True, blank=True)
    accion = models.CharField(max_length=50)
    tabla_afectada = models.CharField(max_length=50)
    descripcion = models.TextField(null=True, blank=True)
    fecha_hora = models.DateTimeField(auto_now_add=True)
    id_usuario = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True, blank=True, db_column='id_usuario')

    class Meta:
        db_table = 'bitacora'


class ContratoLaboral(models.Model):
    id_contrato_laboral = models.AutoField(primary_key=True)
    id_usuario = models.ForeignKey(Usuario, on_delete=models.RESTRICT, db_column='id_usuario')
    cargo = models.CharField(max_length=100)
    salario_mensual = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    fecha_inicio = models.DateField()
    fecha_finalizacion = models.DateField(null=True, blank=True)
    estado = models.CharField(max_length=20, default='Activo')

    class Meta:
        db_table = 'contrato_laboral'


class Producto(models.Model):
    id_producto = models.AutoField(primary_key=True)
    id_categoria = models.ForeignKey(CategoriaProducto, on_delete=models.RESTRICT, db_column='id_categoria')
    nombre_producto = models.CharField(max_length=150)
    moneda_origen = models.CharField(max_length=10, default='BOB')
    precio_base_original = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    precio_venta_local = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    costo_promedio_local = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    stock_actual = models.IntegerField(default=0)
    stock_minimo = models.IntegerField(default=0)
    stock_maximo = models.IntegerField(null=True, blank=True)
    clasificacion_abc = models.CharField(max_length=2, null=True, blank=True)
    estado = models.CharField(max_length=20, default='Activo')

    class Meta:
        db_table = 'producto'


# ==============================================================================
# FASE 3: TRANSACCIONES OPERATIVAS CORE
# ==============================================================================

class ArqueoCaja(models.Model):
    ESTADOS = [('ABIERTA', 'Abierta'), ('CERRADA', 'Cerrada')]
    id_caja = models.AutoField(primary_key=True)
    # Se conserva la relación histórica; la responsabilidad operativa nueva
    # se registra directamente contra Usuario para admitir recepcionistas.
    id_administrador = models.ForeignKey(Administrador, on_delete=models.RESTRICT, db_column='id_administrador', null=True, blank=True)
    responsable = models.ForeignKey(Usuario, on_delete=models.RESTRICT, related_name='cajas_asignadas', null=True, blank=True)
    turno = models.ForeignKey(Turno, on_delete=models.RESTRICT, null=True, blank=True)
    fecha_apertura = models.DateTimeField()
    fecha_cierre = models.DateTimeField(null=True, blank=True)
    monto_inicial = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    monto_final = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)])
    efectivo_contado = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)])
    diferencia = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    estado = models.CharField(max_length=10, choices=ESTADOS, default='CERRADA')

    class Meta:
        db_table = 'arqueo_caja'
        constraints = [models.UniqueConstraint(fields=['estado'], condition=Q(estado='ABIERTA'), name='una_sola_caja_abierta_global')]


class EgresoCaja(models.Model):
    id_egreso = models.AutoField(primary_key=True)
    caja = models.ForeignKey(ArqueoCaja, on_delete=models.RESTRICT, related_name='egresos')
    usuario = models.ForeignKey(Usuario, on_delete=models.RESTRICT)
    fecha_hora = models.DateTimeField(auto_now_add=True)
    concepto = models.CharField(max_length=180)
    monto = models.DecimalField(
    max_digits=12,
    decimal_places=2,
    validators=[MinValueValidator(Decimal('0.01'))])
    observacion = models.TextField(null=True, blank=True)

    class Meta:
        db_table = 'egreso_caja'
        ordering = ['-fecha_hora']


class Compra(models.Model):
    id_compra = models.AutoField(primary_key=True)
    id_administrador = models.ForeignKey(Administrador, on_delete=models.RESTRICT, db_column='id_administrador')
    id_proveedor = models.ForeignKey(Proveedor, on_delete=models.RESTRICT, db_column='id_proveedor')
    fecha_hora = models.DateTimeField(auto_now_add=True)
    nro_factura_proveedor = models.CharField(max_length=50, null=True, blank=True)
    tasa_cambio_aplicada = models.DecimalField(max_digits=10, decimal_places=4, default=1.0000)
    monto_total_origen = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    monto_total_local = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    estado_compra = models.CharField(max_length=20, default='Completada')

    class Meta:
        db_table = 'compra'


class HorarioLaboral(models.Model):
    id_turno = models.ForeignKey(Turno, on_delete=models.CASCADE, db_column='id_turno')
    id_contrato_laboral = models.ForeignKey(ContratoLaboral, on_delete=models.CASCADE, db_column='id_contrato_laboral')
    dia_semana = models.CharField(max_length=15)
    tolerancia_minutos = models.IntegerField(default=0, validators=[MinValueValidator(0)])

    class Meta:
        db_table = 'horario_laboral'
        unique_together = (('id_turno', 'id_contrato_laboral', 'dia_semana'),)


class PagoPlanilla(models.Model):
    id_pago_planilla = models.AutoField(primary_key=True)
    id_contrato_laboral = models.ForeignKey(ContratoLaboral, on_delete=models.RESTRICT, db_column='id_contrato_laboral')
    periodo_mes = models.IntegerField(validators=[MinValueValidator(1), MaxValueValidator(12)])
    periodo_anio = models.IntegerField()
    salario_base = models.DecimalField(max_digits=12, decimal_places=2)
    bonos = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    descuentos = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_pagado = models.DecimalField(max_digits=12, decimal_places=2)
    fecha_pagada = models.DateField()

    class Meta:
        db_table = 'pago_planilla'


class MarcacionPersonal(models.Model):
    id_marcacion_personal = models.AutoField(primary_key=True)
    id_contrato_laboral = models.ForeignKey(ContratoLaboral, on_delete=models.CASCADE, db_column='id_contrato_laboral')
    fecha_hora = models.DateTimeField(auto_now_add=True)
    tipo_evento = models.CharField(max_length=20)
    metodo = models.CharField(max_length=50, null=True, blank=True)

    class Meta:
        db_table = 'marcacion_personal'


class ContratoMembresia(models.Model):
    id_contrato_mem = models.AutoField(primary_key=True)
    id_socio = models.ForeignKey(Socio, on_delete=models.RESTRICT, db_column='id_socio')
    id_metodo_pago = models.ForeignKey(MetodoPago, on_delete=models.RESTRICT, db_column='id_metodo_pago')
    id_plan_mem = models.ForeignKey(PlanMembresia, on_delete=models.RESTRICT, db_column='id_plan_mem')
    id_renovacion = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, db_column='id_renovacion')
    tipo_operacion = models.CharField(max_length=50)
    fecha_inicio = models.DateField()
    fecha_vencimiento = models.DateField()
    tasa_cambio_aplicada = models.DecimalField(max_digits=10, decimal_places=4, default=1.0000)
    monto_pagado_local = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    estado_membresia = models.CharField(max_length=20, default='Activa')

    class Meta:
        db_table = 'contrato_membresia'


class MarcacionAcceso(models.Model):
    id_marcacion_acceso = models.AutoField(primary_key=True)
    id_socio = models.ForeignKey(Socio, on_delete=models.CASCADE, db_column='id_socio')
    fecha_hora = models.DateTimeField(auto_now_add=True)
    tipo_acceso = models.CharField(max_length=20, null=True, blank=True)
    observacion = models.TextField(null=True, blank=True)

    class Meta:
        db_table = 'marcacion_acceso'


class AsignacionRutina(models.Model):
    # 1. PEGA LAS OPCIONES AQUÍ ARRIBA:
    TURNO_CHOICES = [
        ('mañana', 'Mañana'),
        ('mediodia', 'Mediodía'),
        ('tarde', 'Tarde'),
        ('noche', 'Noche'),
    ]

    id_asignacion_rutina = models.AutoField(primary_key=True)
    id_entrenador = models.ForeignKey(Entrenador, on_delete=models.RESTRICT, db_column='id_entrenador')
    id_socio = models.ForeignKey(Socio, on_delete=models.CASCADE, db_column='id_socio')
    id_rutina = models.ForeignKey(Rutina, on_delete=models.RESTRICT, db_column='id_rutina')
    fecha_asignacion = models.DateField(auto_now_add=True)
    fecha_inicio = models.DateField(null=True, blank=True)
    fecha_fin = models.DateField(null=True, blank=True)
    observaciones = models.TextField(null=True, blank=True)
    estado = models.CharField(max_length=20, default='Activa')
    
    # 2. PEGA EL CAMPO TURNO AQUÍ ABAJO (usando 'choices' y un max_length adecuado):
    turno = models.CharField(max_length=20, choices=TURNO_CHOICES, default='mañana')

    class Meta:
        db_table = 'asignacion_rutina'

class DetalleRutina(models.Model):
    id_rutina = models.ForeignKey(
        Rutina, on_delete=models.CASCADE, db_column='id_rutina', related_name='detalles'
    )
    id_ejercicio = models.ForeignKey(
        Ejercicio, on_delete=models.CASCADE, db_column='id_ejercicio', related_name='detalles_rutina'
    )
    orden = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    series = models.IntegerField(validators=[MinValueValidator(1)])
    repeticiones = models.IntegerField(validators=[MinValueValidator(1)])
    descanso_minutos = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)])

    class Meta:
        db_table = 'detalle_rutina'
        unique_together = (('id_rutina', 'id_ejercicio'),)
        ordering = ['orden', 'id_ejercicio']


class Venta(models.Model):
    id_venta = models.AutoField(primary_key=True)
    id_usuario = models.ForeignKey(Usuario, on_delete=models.RESTRICT, db_column='id_usuario')
    id_metodo_pago = models.ForeignKey(MetodoPago, on_delete=models.RESTRICT, db_column='id_metodo_pago')
    id_socio = models.ForeignKey(Socio, on_delete=models.RESTRICT, db_column='id_socio')
    caja = models.ForeignKey(ArqueoCaja, on_delete=models.RESTRICT, null=True, blank=True, related_name='ventas')
    fecha_hora = models.DateTimeField(auto_now_add=True)
    nro_factura = models.CharField(max_length=50, null=True, blank=True)
    tasa_cambio_aplicada = models.DecimalField(max_digits=10, decimal_places=4, default=1.0000)
    monto_total_local = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    estado_venta = models.CharField(max_length=20, default='Completada')

    class Meta:
        db_table = 'venta'


# ==============================================================================
# FASE 4: DETALLES DE TRANSACCIONES Y LOGÍSTICA
# ==============================================================================

class DetalleCompra(models.Model):
    id_compra = models.ForeignKey(Compra, on_delete=models.CASCADE, db_column='id_compra')
    id_producto = models.ForeignKey(Producto, on_delete=models.RESTRICT, db_column='id_producto')
    cantidad = models.IntegerField(validators=[MinValueValidator(1)])
    costo_unitario_origen = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    costo_unitario_local = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    subtotal_origen = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    subtotal_local = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])

    class Meta:
        db_table = 'detalle_compra'
        unique_together = (('id_compra', 'id_producto'),)


class KardexInventario(models.Model):
    id_kardex = models.AutoField(primary_key=True)
    id_producto = models.ForeignKey(Producto, on_delete=models.RESTRICT, db_column='id_producto')
    fecha_movimiento = models.DateTimeField(auto_now_add=True)
    tipo_movimiento = models.CharField(max_length=20)
    cantidad = models.IntegerField()
    motivo = models.CharField(max_length=100)

    class Meta:
        db_table = 'kardex_inventario'


class AlertaReposicion(models.Model):
    id_alerta_repo = models.AutoField(primary_key=True)
    id_admin = models.ForeignKey(Administrador, on_delete=models.RESTRICT, db_column='id_admin')
    id_producto = models.ForeignKey(Producto, on_delete=models.CASCADE, db_column='id_producto')
    codigo_evento_global = models.CharField(max_length=50, null=True, blank=True)
    nivel_urgencia = models.CharField(max_length=20, null=True, blank=True)
    cantidad_sugerida = models.IntegerField(null=True, blank=True, validators=[MinValueValidator(1)])
    estado_alerta = models.CharField(max_length=20, default='Pendiente')
    orden_compra_erp = models.CharField(max_length=50, null=True, blank=True)
    fecha_generacion = models.DateTimeField(auto_now_add=True)
    fecha_cierre = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'alerta_reposicion'


class DetalleVentaProducto(models.Model):
    id_venta = models.ForeignKey(Venta, on_delete=models.CASCADE, db_column='id_venta')
    id_producto = models.ForeignKey(Producto, on_delete=models.RESTRICT, db_column='id_producto')
    cantidad = models.IntegerField(validators=[MinValueValidator(1)])
    precio_unitario_origen = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    precio_unitario_local = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    subtotal_origen = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    subtotal_local = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])

    class Meta:
        db_table = 'detalle_venta_producto'
        unique_together = (('id_venta', 'id_producto'),)


class DetalleVentaServicio(models.Model):
    id_venta = models.ForeignKey(Venta, on_delete=models.CASCADE, db_column='id_venta')
    id_plan_membresia = models.ForeignKey(PlanMembresia, on_delete=models.RESTRICT, db_column='id_plan_membresia')
    cantidad = models.IntegerField(validators=[MinValueValidator(1)])
    precio_unitario_origen = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    precio_unitario_local = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    subtotal_origen = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    subtotal_local = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])

    class Meta:
        db_table = 'detalle_venta_servicio'
        unique_together = (('id_venta', 'id_plan_membresia'),)

class PagoPasarela(models.Model):
    """Registro idempotente de pagos externos (PayPal)."""
    ESTADOS = [
        ('PENDIENTE', 'Pendiente'),
        ('COMPLETADO', 'Completado'),
        ('CANCELADO', 'Cancelado'),
        ('FALLIDO', 'Fallido'),
    ]
    id_pago = models.AutoField(primary_key=True)
    proveedor = models.CharField(max_length=20, default='PAYPAL')
    id_orden_externa = models.CharField(max_length=100, unique=True)
    id_captura_externa = models.CharField(max_length=100, unique=True, null=True, blank=True)
    tipo_operacion = models.CharField(max_length=20, default='MEMBRESIA')
    id_usuario = models.ForeignKey(Usuario, on_delete=models.RESTRICT, db_column='id_usuario')
    id_socio = models.ForeignKey(Socio, on_delete=models.RESTRICT, db_column='id_socio')
    id_plan_mem = models.ForeignKey(PlanMembresia, on_delete=models.RESTRICT, db_column='id_plan_mem')
    id_contrato_mem = models.ForeignKey(ContratoMembresia, on_delete=models.RESTRICT, null=True, blank=True, db_column='id_contrato_mem')
    monto_local = models.DecimalField(max_digits=12, decimal_places=2)
    monto_usd = models.DecimalField(max_digits=12, decimal_places=2)
    tasa_cambio = models.DecimalField(max_digits=10, decimal_places=4)
    estado = models.CharField(max_length=20, choices=ESTADOS, default='PENDIENTE')
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    fecha_actualizacion = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'pago_pasarela'
        ordering = ['-fecha_creacion']


class ConfiguracionSistema(models.Model):
    """Configuración vigente del sistema; cada clave tiene una sola fila."""
    id_configuracion = models.AutoField(primary_key=True)
    clave = models.CharField(max_length=60, unique=True)
    valor = models.DecimalField(max_digits=10, decimal_places=4)
    fecha_actualizacion = models.DateTimeField(auto_now=True)
    actualizado_por = models.ForeignKey(
        Usuario, on_delete=models.SET_NULL, null=True, blank=True,
        db_column='actualizado_por'
    )

    class Meta:
        db_table = 'configuracion_sistema'
