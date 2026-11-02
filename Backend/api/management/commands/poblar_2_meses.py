import random
from datetime import timedelta, date, time
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.utils import timezone

from api.models import (
    Usuario, Administrador, Recepcionista, Entrenador, Socio,
    PlanMembresia, ContratoMembresia, MetodoPago, PagoPasarela,
    CategoriaProducto, Proveedor, Producto, KardexInventario,
    Venta, DetalleVentaProducto, DetalleVentaServicio, ArqueoCaja, EgresoCaja,
    Turno, HorarioLaboral, MarcacionPersonal, ContratoLaboral, PagoPlanilla,
    MarcacionAcceso, Ejercicio, Rutina, DetalleRutina, AsignacionRutina, HorarioEntrenador
)

class Command(BaseCommand):
    help = 'Puebla todas las tablas del proyecto PorkyGym con 2 meses de datos realistas.'

    def handle(self, *args, **options):
        self.stdout.write("Iniciando la población de todas las tablas...")

        fecha_fin = timezone.now()
        fecha_inicio = fecha_fin - timedelta(days=60)

        # 1. METODOS DE PAGO
        metodos = ['Efectivo', 'Tarjeta de Crédito', 'Transferencia QR', 'PayPal']
        metodos_obj = []
        for nombre in metodos:
            m, _ = MetodoPago.objects.get_or_create(descripcion=nombre, defaults={'activo': True})
            metodos_obj.append(m)

        # 2. CATEGORIAS Y PRODUCTOS
        cat_suplementos, _ = CategoriaProducto.objects.get_or_create(nombre_categoria="Suplementos", defaults={'descripcion': 'Proteínas y creatinas'})
        cat_bebidas, _ = CategoriaProducto.objects.get_or_create(nombre_categoria="Bebidas", defaults={'descripcion': 'Energizantes e hidratantes'})

        prov, _ = Proveedor.objects.get_or_create(
            nombre_proveedor="FitSupplies Co.",
            defaults={'contacto': "Juan Pérez", 'telefono': "70012345", 'email': "ventas@fitsupplies.com"}
        )

        prod1, _ = Producto.objects.get_or_create(
            nombre_producto="Proteína Whey 2lb",
            defaults={'categoria': cat_suplementos, 'proveedor': prov, 'precio_venta': Decimal('250.00'), 'precio_compra': Decimal('180.00'), 'stock_actual': 50, 'stock_minimo': 5}
        )
        prod2, _ = Producto.objects.get_or_create(
            nombre_producto="Bebida Hidratante 500ml",
            defaults={'categoria': cat_bebidas, 'proveedor': prov, 'precio_venta': Decimal('12.00'), 'precio_compra': Decimal('6.00'), 'stock_actual': 200, 'stock_minimo': 20}
        )

        # 3. PLANES DE MEMBRESIA
        plan_mensual, _ = PlanMembresia.objects.get_or_create(
            nombre_plan="Plan Mensual Libre",
            defaults={'descripcion': 'Acceso total por 30 días', 'costo': Decimal('200.00'), 'duracion_dias': 30}
        )
        plan_trimestral, _ = PlanMembresia.objects.get_or_create(
            nombre_plan="Plan Trimestral VIP",
            defaults={'descripcion': 'Acceso total por 90 días', 'costo': Decimal('500.00'), 'duracion_dias': 90}
        )

        # 4. USUARIOS (Admin, Recepcionista, Entrenador, Socios)
        admin_user, _ = Usuario.objects.get_or_create(username="admin", defaults={'email': 'admin@porkygym.com', 'rol': 'ADMINISTRADOR', 'nombres': 'Admin', 'apellidos': 'General'})
        if not hasattr(admin_user, 'administrador'):
            Administrador.objects.get_or_create(usuario=admin_user, defaults={'nivel_acceso': 'FULL'})

        recep_user, _ = Usuario.objects.get_or_create(username="recepcion", defaults={'email': 'recepcion@porkygym.com', 'rol': 'RECEPCIONISTA', 'nombres': 'Ana', 'apellidos': 'Gómez'})
        if not hasattr(recep_user, 'recepcionista'):
            Recepcionista.objects.get_or_create(usuario=recep_user, defaults={'turno': 'MAÑANA'})

        ent_user, _ = Usuario.objects.get_or_create(username="entrenador1", defaults={'email': 'coach@porkygym.com', 'rol': 'ENTRENADOR', 'nombres': 'Carlos', 'apellidos': 'Roca'})
        if not hasattr(ent_user, 'entrenador'):
            entrenador_obj, _ = Entrenador.objects.get_or_create(usuario=ent_user, defaults={'especialidad': 'Musculación'})

        # 5. EJERCICIOS Y RUTINAS
        ej1, _ = Ejercicio.objects.get_or_create(nombre="Sentadillas con Barra", defaults={'grupo_muscular': 'Piernas', 'descripcion': 'Sentadilla libre con barra olímpica'})
        ej2, _ = Ejercicio.objects.get_or_create(nombre="Press de Banca", defaults={'grupo_muscular': 'Pecho', 'descripcion': 'Press plano con barra'})

        rutina, _ = Rutina.objects.get_or_create(nombre_rutina="Rutina Hipertrofia 4 Días", defaults={'entrenador': entrenador_obj, 'objetivo': 'Aumento de masa muscular'})
        DetalleRutina.objects.get_or_create(rutina=rutina, ejercicio=ej1, defaults={'series': 4, 'repeticiones': '10-12', 'dia_semana': 'Lunes'})
        DetalleRutina.objects.get_or_create(rutina=rutina, ejercicio=ej2, defaults={'series': 4, 'repeticiones': '8-10', 'dia_semana': 'Martes'})

        # 6. SOCIOS Y SUS ACTIVIDADES (60 DÍAS)
        socios = []
        for i in range(1, 15):
            u, _ = Usuario.objects.get_or_create(
                username=f'socio_{i}',
                defaults={'email': f'socio{i}@mail.com', 'rol': 'SOCIO', 'nombres': f'Socio{i}', 'apellidos': f'Pérez{i}'}
            )
            s, _ = Socio.objects.get_or_create(usuario=u, defaults={'ci': f'884930{i}', 'telefono': f'7712340{i}'})
            socios.append(s)

            # Asignar rutina a socio
            AsignacionRutina.objects.get_or_create(socio=s, rutina=rutina, defaults={'fecha_asignacion': fecha_inicio.date(), 'estado': 'ACTIVA'})

            # Crear contrato membresía
            ContratoMembresia.objects.get_or_create(
                socio=s,
                defaults={
                    'plan': plan_mensual,
                    'fecha_inicio': fecha_inicio.date(),
                    'fecha_fin': (fecha_inicio + timedelta(days=30)).date(),
                    'estado': 'ACTIVO',
                    'monto_total': plan_mensual.costo
                }
            )

        # 7. GENERACIÓN DE DIARIOS (CAJA, VENTAS, ACCESOS) PARA LOS ÚLTIMOS 60 DÍAS
        for dia_offset in range(60):
            fecha_actual = fecha_inicio + timedelta(days=dia_offset)
            
            # Crear arqueo de caja diario
            caja, _ = ArqueoCaja.objects.get_or_create(
                fecha=fecha_actual.date(),
                defaults={
                    'monto_apertura': Decimal('100.00'),
                    'monto_cierre': Decimal('600.00'),
                    'estado': 'CERRADA',
                    'recepcionista': recep_user.recepcionista
                }
            )

            # Simular asistencias de socios
            for socio in random.sample(socios, k=random.randint(3, 8)):
                MarcacionAcceso.objects.create(
                    socio=socio,
                    fecha_hora=fecha_actual + timedelta(hours=random.randint(7, 20)),
                    estado_acceso='PERMITIDO'
                )

            # Simular Ventas diarias
            for _ in range(random.randint(1, 4)):
                socio_compra = random.choice(socios)
                venta = Venta.objects.create(
                    socio=socio_compra.usuario,
                    recepcionista=recep_user.recepcionista,
                    metodo_pago=random.choice(metodos_obj),
                    fecha_hora=fecha_actual + timedelta(hours=random.randint(8, 19)),
                    monto_total=Decimal('262.00')
                )
                DetalleVentaProducto.objects.create(venta=venta, producto=prod1, cantidad=1, precio_unitario=prod1.precio_venta, subtotal=prod1.precio_venta)
                DetalleVentaProducto.objects.create(venta=venta, producto=prod2, cantidad=1, precio_unitario=prod2.precio_venta, subtotal=prod2.precio_venta)

        self.stdout.write(self.style.SUCCESS("¡Todas las tablas han sido pobladas con éxito con 2 meses de datos!"))