from django.contrib.auth import get_user_model
from django.test import TestCase
from decimal import Decimal
from rest_framework.test import APIClient

from .models import Socio, CategoriaProducto, Bitacora, Producto, Proveedor, Compra, DetalleCompra, Administrador, KardexInventario

Usuario = get_user_model()


class UsuarioEdicionTests(TestCase):
    """CU01: editar un usuario sin verse obligado a cambiar la contraseña."""

    def setUp(self):
        self.admin = Usuario.objects.create_user(
            username='admin_test', password='Admin123!', es_administrador=True,
            email='admin@test.com', ci='ADM-1',
        )
        self.target = Usuario.objects.create_user(
            username='target_test', password='OldPass123!', es_entrenador=True,
            email='target@test.com', ci='TGT-1',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def test_editar_correo_sin_password(self):
        resp = self.client.patch(f'/api/usuarios/{self.target.id}/',
                                 {'email': 'nuevo@test.com'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.target.refresh_from_db()
        self.assertEqual(self.target.email, 'nuevo@test.com')
        self.assertTrue(self.target.check_password('OldPass123!'))

    def test_cambiar_rol_sin_password(self):
        resp = self.client.patch(f'/api/usuarios/{self.target.id}/',
                                 {'es_recepcionista': True}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.target.refresh_from_db()
        self.assertTrue(self.target.es_recepcionista)
        self.assertTrue(self.target.check_password('OldPass123!'))

    def test_activar_desactivar_sin_password(self):
        resp = self.client.patch(f'/api/usuarios/{self.target.id}/',
                                 {'estado_cuenta': 'Inactivo'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.target.refresh_from_db()
        self.assertEqual(self.target.estado_cuenta, 'Inactivo')

    def test_password_vacio_no_cambia_la_anterior(self):
        resp = self.client.patch(
            f'/api/usuarios/{self.target.id}/',
            {'email': 'b@test.com', 'password': '', 'password2': ''},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.target.refresh_from_db()
        self.assertTrue(self.target.check_password('OldPass123!'))

    def test_password_nueva_valida_se_aplica(self):
        resp = self.client.patch(
            f'/api/usuarios/{self.target.id}/',
            {'password': 'NewPass123!', 'password2': 'NewPass123!'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.target.refresh_from_db()
        self.assertTrue(self.target.check_password('NewPass123!'))
        self.assertNotEqual(self.target.password, 'NewPass123!')  # nunca texto plano

    def test_password_nueva_invalida_se_rechaza(self):
        resp = self.client.patch(
            f'/api/usuarios/{self.target.id}/',
            {'email': 'no-guardar@test.com', 'password': 'weak',
             'password2': 'weak'},
            format='json',
        )
        self.assertEqual(resp.status_code, 400, resp.data)
        self.target.refresh_from_db()
        self.assertEqual(self.target.email, 'target@test.com')  # no guarda parcial
        self.assertTrue(self.target.check_password('OldPass123!'))

    def test_password_nunca_se_devuelve(self):
        resp = self.client.get(f'/api/usuarios/{self.target.id}/')
        self.assertNotIn('password', resp.data)
        self.assertNotIn('password2', resp.data)


class UsuarioCreacionRolSocioTests(TestCase):
    """CU01/CU04: la creación ordinaria no permite asignar el rol de socio."""

    def setUp(self):
        self.admin = Usuario.objects.create_user(
            username='admin_test', password='Admin123!', es_administrador=True,
            email='admin@test.com', ci='ADM-1',
        )
        self.target = Usuario.objects.create_user(
            username='target_test', password='OldPass123!', es_entrenador=True,
            email='target@test.com', ci='TGT-1',
        )
        self.socio_user = Usuario.objects.create_user(
            username='socio_test', password='Socio123!', es_socio=True,
            email='socio@test.com', ci='SOC-1',
        )
        Socio.objects.create(id_socio=self.socio_user, fecha_nacimiento='1990-01-01')
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def test_crear_roles_ordinarios(self):
        for flag, username in [
            ('es_administrador', 'nuevo_admin'),
            ('es_entrenador', 'nuevo_entrenador'),
            ('es_recepcionista', 'nuevo_recepcionista'),
        ]:
            resp = self.client.post('/api/usuarios/', {
                'username': username, 'email': f'{username}@test.com',
                'password': 'NewPass123!', 'password2': 'NewPass123!',
                flag: True,
            }, format='json')
            self.assertEqual(resp.status_code, 201, resp.data)

    def test_crear_con_rol_socio_se_rechaza(self):
        resp = self.client.post('/api/usuarios/', {
            'username': 'no_debe_existir', 'email': 'x@test.com',
            'password': 'NewPass123!', 'password2': 'NewPass123!',
            'es_socio': True,
        }, format='json')
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('es_socio', resp.data)
        self.assertFalse(Usuario.objects.filter(username='no_debe_existir').exists())

    def test_creacion_sigue_exigiendo_password(self):
        resp = self.client.post('/api/usuarios/', {
            'username': 'sin_password', 'email': 'n@test.com',
            'es_entrenador': True,
        }, format='json')
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('password', resp.data)

    def test_no_promover_a_socio_por_edicion(self):
        resp = self.client.patch(f'/api/usuarios/{self.target.id}/',
                                 {'es_socio': True}, format='json')
        self.assertEqual(resp.status_code, 400, resp.data)
        self.target.refresh_from_db()
        self.assertFalse(self.target.es_socio)

    def test_edicion_conserva_rol_socio_existente(self):
        resp = self.client.patch(
            f'/api/usuarios/{self.socio_user.id}/',
            {'es_socio': True, 'email': 'socio2@test.com'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.socio_user.refresh_from_db()
        self.assertTrue(self.socio_user.es_socio)
        self.assertEqual(self.socio_user.email, 'socio2@test.com')

    def test_registrar_nuevo_socio_crea_expediente_y_aparece_en_selector(self):
        from .models import MetodoPago
        MetodoPago.objects.get_or_create(descripcion='Efectivo')
        resp = self.client.post('/api/socios/registrar/', {
            'username': 'socio_nuevo', 'email': 'sn@test.com', 'ci': 'NS-1',
            'password': 'Socio123!', 'password2': 'Socio123!',
            'fecha_nacimiento': '1995-05-05',
        }, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        nuevo = Usuario.objects.get(username='socio_nuevo')
        self.assertTrue(nuevo.es_socio)
        self.assertTrue(Socio.objects.filter(id_socio=nuevo).exists())

        selector = self.client.get('/api/socios/')
        self.assertEqual(selector.status_code, 200)
        usernames = [s['username'] for s in selector.data]
        self.assertIn('socio_nuevo', usernames)


class CategoriaProductoCU11Tests(TestCase):
    """Pruebas básicas de CU11: permisos, CRUD y relaciones de categorías."""
    def setUp(self):
        self.admin = Usuario.objects.create_user(
            username='admin_cat', password='Admin123!', es_administrador=True,
            email='admincat@test.com', ci='CAT-ADM-1',
        )
        self.recepcion = Usuario.objects.create_user(
            username='recepcion_cat', password='Recep123!', es_recepcionista=True,
            email='recepcioncat@test.com', ci='CAT-REC-1',
        )
        self.client = APIClient()

    def test_admin_crea_categoria_y_registra_bitacora(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post('/api/categorias/', {'nombre_categoria': 'Bebidas'}, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertTrue(CategoriaProducto.objects.filter(nombre_categoria='Bebidas').exists())
        self.assertTrue(Bitacora.objects.filter(tabla_afectada='categoria_producto', accion='CREATE').exists())

    def test_rechaza_nombre_duplicado_sin_distinguir_mayusculas(self):
        CategoriaProducto.objects.create(nombre_categoria='Bebidas')
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post('/api/categorias/', {'nombre_categoria': 'bebidas'}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_admite_subcategoria(self):
        padre = CategoriaProducto.objects.create(nombre_categoria='Alimentos')
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post('/api/categorias/', {
            'nombre_categoria': 'Proteínas', 'id_subcategoria': padre.pk,
        }, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['id_subcategoria'], padre.pk)

    def test_recepcionista_no_puede_gestionar_categorias(self):
        self.client.force_authenticate(user=self.recepcion)
        resp = self.client.get('/api/categorias/')
        self.assertEqual(resp.status_code, 403)

    def test_no_elimina_categoria_con_productos(self):
        # La protección de integridad se valida en el endpoint al existir productos.
        from .models import Producto
        categoria = CategoriaProducto.objects.create(nombre_categoria='Accesorios')
        Producto.objects.create(
            id_categoria=categoria, nombre_producto='Botella', precio_base_original='10.00',
            precio_venta_local='15.00', costo_promedio_local='10.00',
        )
        self.client.force_authenticate(user=self.admin)
        resp = self.client.delete(f'/api/categorias/{categoria.pk}/')
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(CategoriaProducto.objects.filter(pk=categoria.pk).exists())


class ProductoCatalogoCU12Tests(TestCase):
    """CU12: catálogo, permisos y protección del stock."""
    def setUp(self):
        self.admin = Usuario.objects.create_user(
            username='admin_prod', password='Admin123!', es_administrador=True,
            email='adminprod@test.com', ci='PROD-ADM-1',
        )
        self.recepcion = Usuario.objects.create_user(
            username='recepcion_prod', password='Recep123!', es_recepcionista=True,
            email='recepcionprod@test.com', ci='PROD-REC-1',
        )
        self.categoria = CategoriaProducto.objects.create(nombre_categoria='Suplementos')
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        self.url = '/api/productos/'

    def datos(self, **extra):
        datos = {
            'id_categoria': self.categoria.pk,
            'nombre_producto': 'Proteína Whey',
            'moneda_origen': 'BOB',
            'precio_base_original': '100.00',
            'precio_venta_local': '150.00',
            'stock_minimo': 3,
            'stock_maximo': 50,
            'clasificacion_abc': 'A',
            'estado': 'Activo',
        }
        datos.update(extra)
        return datos

    def test_admin_crea_producto_y_registra_bitacora(self):
        resp = self.client.post(self.url, self.datos(), format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        producto = Producto.objects.get(pk=resp.data['id_producto'])
        self.assertEqual(producto.stock_actual, 0)
        self.assertEqual(producto.costo_promedio_local, 0)
        self.assertTrue(Bitacora.objects.filter(tabla_afectada='producto', accion='CREATE').exists())

    def test_stock_y_costo_no_se_modifican_desde_catalogo(self):
        producto = Producto.objects.create(
            id_categoria=self.categoria, nombre_producto='Creatina',
            precio_base_original='80.00', precio_venta_local='120.00',
            costo_promedio_local='70.00', stock_actual=12,
        )
        resp = self.client.patch(f'{self.url}{producto.pk}/', {
            'stock_actual': 999, 'costo_promedio_local': '1.00',
            'precio_venta_local': '130.00',
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        producto.refresh_from_db()
        self.assertEqual(producto.stock_actual, 12)
        self.assertEqual(str(producto.costo_promedio_local), '70.00')
        self.assertEqual(str(producto.precio_venta_local), '130.00')

    def test_rechaza_producto_duplicado_en_misma_categoria(self):
        Producto.objects.create(
            id_categoria=self.categoria, nombre_producto='Proteína Whey',
            precio_base_original='100.00', precio_venta_local='150.00',
        )
        resp = self.client.post(self.url, self.datos(nombre_producto='proteína whey'), format='json')
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_rechaza_maximo_menor_que_minimo(self):
        resp = self.client.post(self.url, self.datos(stock_minimo=10, stock_maximo=5), format='json')
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_recepcionista_solo_puede_consultar(self):
        Producto.objects.create(
            id_categoria=self.categoria, nombre_producto='Barra energética',
            precio_base_original='5.00', precio_venta_local='8.00',
        )
        self.client.force_authenticate(user=self.recepcion)
        lectura = self.client.get(self.url)
        self.assertEqual(lectura.status_code, 200, lectura.data)
        escritura = self.client.post(self.url, self.datos(nombre_producto='Otro producto'), format='json')
        self.assertEqual(escritura.status_code, 403)


class ProveedorCU13Tests(TestCase):
    """CU13: registro, validaciones, permisos e integridad de proveedores."""
    def setUp(self):
        self.admin = Usuario.objects.create_user(
            username='admin_prov', password='Admin123!', es_administrador=True,
            email='adminprov@test.com', ci='PROV-ADM-1',
        )
        self.recepcion = Usuario.objects.create_user(
            username='recepcion_prov', password='Recep123!', es_recepcionista=True,
            email='recepcionprov@test.com', ci='PROV-REC-1',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        self.url = '/api/proveedores/'

    def datos(self, **extra):
        datos = {
            'razon_social': 'Distribuidora Central', 'nit': '123456789',
            'moneda_facturacion': 'BOB', 'telefono': '70000000',
            'email': 'ventas@central.test', 'direccion': 'Santa Cruz',
        }
        datos.update(extra)
        return datos

    def test_admin_registra_proveedor_y_bitacora(self):
        resp = self.client.post(self.url, self.datos(), format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertTrue(Proveedor.objects.filter(nit='123456789').exists())
        self.assertTrue(Bitacora.objects.filter(tabla_afectada='proveedor', accion='CREATE').exists())

    def test_rechaza_nit_duplicado_sin_distinguir_mayusculas(self):
        Proveedor.objects.create(razon_social='Proveedor 1', nit='abc-123')
        resp = self.client.post(self.url, self.datos(nit='ABC-123'), format='json')
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_normaliza_razon_social_y_moneda(self):
        resp = self.client.post(self.url, self.datos(razon_social='  Proveedor Norte  ', moneda_facturacion=' bob '), format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['razon_social'], 'Proveedor Norte')
        self.assertEqual(resp.data['moneda_facturacion'], 'BOB')

    def test_recepcionista_solo_consulta(self):
        Proveedor.objects.create(razon_social='Proveedor 2', nit='NIT-2')
        self.client.force_authenticate(user=self.recepcion)
        lectura = self.client.get(self.url)
        self.assertEqual(lectura.status_code, 200, lectura.data)
        escritura = self.client.post(self.url, self.datos(nit='NIT-3'), format='json')
        self.assertEqual(escritura.status_code, 403)

    def test_no_elimina_proveedor_con_compras(self):
        from .models import Compra, Administrador
        proveedor = Proveedor.objects.create(razon_social='Proveedor con compras', nit='NIT-COMPRA')
        administrador, _ = Administrador.objects.get_or_create(id_administrador=self.admin)
        compra = Compra.objects.create(
            id_administrador=administrador, id_proveedor=proveedor,
            monto_total_origen='100.00', monto_total_local='100.00',
        )
        resp = self.client.delete(f'{self.url}{proveedor.pk}/')
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertTrue(Proveedor.objects.filter(pk=proveedor.pk).exists())


class CompraCU14Tests(TestCase):
    """CU14: compra atomica, aumento de stock y costo promedio ponderado."""
    def setUp(self):
        self.admin = Usuario.objects.create_user(
            username='admin_compra', password='Admin123!', es_administrador=True,
            email='admincompra@test.com', ci='COMP-ADM-1',
        )
        self.recepcion = Usuario.objects.create_user(
            username='recepcion_compra', password='Recep123!', es_recepcionista=True,
            email='recepcompra@test.com', ci='COMP-REC-1',
        )
        self.perfil_admin, _ = Administrador.objects.get_or_create(id_administrador=self.admin)
        self.proveedor = Proveedor.objects.create(razon_social='Distribuidora', nit='COMP-NIT-1', moneda_facturacion='BOB')
        self.categoria = CategoriaProducto.objects.create(nombre_categoria='Suplementos')
        self.producto = Producto.objects.create(
            id_categoria=self.categoria, nombre_producto='Proteina', moneda_origen='BOB',
            precio_base_original='50.00', precio_venta_local='80.00',
            costo_promedio_local='40.00', stock_actual=10, stock_minimo=2, estado='Activo',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        self.url = '/api/compras/'

    def payload(self, **extra):
        data = {
            'id_proveedor': self.proveedor.pk,
            'nro_factura_proveedor': 'FAC-001',
            'tasa_cambio_aplicada': '1.0000',
            'detalles': [{'id_producto': self.producto.pk, 'cantidad': 5, 'costo_unitario_origen': '50.00'}],
        }
        data.update(extra)
        return data

    def test_compra_incrementa_stock_actualiza_costo_y_registra_bitacora(self):
        resp = self.client.post(self.url, self.payload(), format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock_actual, 15)
        self.assertEqual(self.producto.costo_promedio_local, Decimal('43.33'))
        compra = Compra.objects.get(pk=resp.data['id_compra'])
        self.assertEqual(compra.monto_total_origen, Decimal('250.00'))
        self.assertEqual(compra.monto_total_local, Decimal('250.00'))
        self.assertEqual(DetalleCompra.objects.filter(id_compra=compra).count(), 1)
        self.assertTrue(Bitacora.objects.filter(tabla_afectada='compra', accion='CREATE').exists())

    def test_tasa_cambio_calcula_total_local_y_costo_promedio(self):
        resp = self.client.post(self.url, self.payload(tasa_cambio_aplicada='6.9600'), format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock_actual, 15)
        self.assertEqual(self.producto.costo_promedio_local, Decimal('142.67'))
        compra = Compra.objects.get(pk=resp.data['id_compra'])
        self.assertEqual(compra.monto_total_local, Decimal('1740.00'))

    def test_rechaza_detalles_vacios_o_productos_duplicados(self):
        vacia = self.client.post(self.url, self.payload(detalles=[]), format='json')
        self.assertEqual(vacia.status_code, 400, vacia.data)
        duplicada = self.client.post(self.url, self.payload(detalles=[
            {'id_producto': self.producto.pk, 'cantidad': 1, 'costo_unitario_origen': '10.00'},
            {'id_producto': self.producto.pk, 'cantidad': 2, 'costo_unitario_origen': '10.00'},
        ]), format='json')
        self.assertEqual(duplicada.status_code, 400, duplicada.data)
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock_actual, 10)
        self.assertEqual(Compra.objects.count(), 0)

    def test_no_permite_comprar_producto_inactivo(self):
        self.producto.estado = 'Inactivo'
        self.producto.save(update_fields=['estado'])
        resp = self.client.post(self.url, self.payload(), format='json')
        self.assertEqual(resp.status_code, 400, resp.data)
        self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock_actual, 10)
        self.assertEqual(Compra.objects.count(), 0)

    def test_recepcionista_no_puede_registrar_ni_consultar_compras(self):
        self.client.force_authenticate(user=self.recepcion)
        resp = self.client.post(self.url, self.payload(), format='json')
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(Compra.objects.count(), 0)

    def test_rechaza_tasa_cero(self):
        resp = self.client.post(self.url, self.payload(tasa_cambio_aplicada='0'), format='json')
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertEqual(Compra.objects.count(), 0)


class KardexCU15Tests(TestCase):
    """CU15: movimientos extraordinarios actualizan stock de forma segura."""
    def setUp(self):
        self.admin = Usuario.objects.create_user(username='admin_kardex', password='Admin123!', es_administrador=True, email='kardexadmin@test.com', ci='KDX-ADM')
        self.recepcion = Usuario.objects.create_user(username='recep_kardex', password='Admin123!', es_recepcionista=True, email='kardexrecep@test.com', ci='KDX-REC')
        categoria = CategoriaProducto.objects.create(nombre_categoria='Kardex prueba')
        self.producto = Producto.objects.create(id_categoria=categoria, nombre_producto='Producto Kardex', moneda_origen='BOB', precio_base_original='10.00', precio_venta_local='15.00', stock_actual=5, stock_minimo=1, estado='Activo')
        self.client = APIClient(); self.client.force_authenticate(user=self.admin)
        self.url = '/api/kardex/'
    def payload(self, **extra):
        data = {'id_producto': self.producto.pk, 'tipo_movimiento': 'INGRESO', 'cantidad': 3, 'motivo': 'Ingreso extraordinario de prueba'}
        data.update(extra); return data
    def test_ingreso_incrementa_stock_y_crea_kardex_bitacora(self):
        r = self.client.post(self.url, self.payload(), format='json')
        self.assertEqual(r.status_code, 201, r.data); self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock_actual, 8); self.assertEqual(KardexInventario.objects.count(), 1)
        self.assertTrue(Bitacora.objects.filter(tabla_afectada='kardex_inventario', accion='CREATE').exists())
    def test_retiro_disminuye_stock(self):
        r = self.client.post(self.url, self.payload(tipo_movimiento='RETIRO', cantidad=2), format='json')
        self.assertEqual(r.status_code, 201, r.data); self.producto.refresh_from_db(); self.assertEqual(self.producto.stock_actual, 3)
    def test_rechaza_stock_negativo_sin_guardar_movimiento(self):
        r = self.client.post(self.url, self.payload(tipo_movimiento='AJUSTE_NEGATIVO', cantidad=6), format='json')
        self.assertEqual(r.status_code, 400, r.data); self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock_actual, 5); self.assertEqual(KardexInventario.objects.count(), 0)
    def test_rechaza_cantidad_cero_y_motivo_vacio(self):
        a = self.client.post(self.url, self.payload(cantidad=0), format='json')
        b = self.client.post(self.url, self.payload(motivo='   '), format='json')
        self.assertEqual(a.status_code, 400); self.assertEqual(b.status_code, 400)
        self.assertEqual(KardexInventario.objects.count(), 0)
    def test_recepcionista_no_puede_consultar_ni_registrar(self):
        self.client.force_authenticate(user=self.recepcion)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.assertEqual(self.client.post(self.url, self.payload(), format='json').status_code, 403)
        self.assertEqual(KardexInventario.objects.count(), 0)
    def test_no_permite_movimientos_en_producto_inactivo(self):
        self.producto.estado='Inactivo'; self.producto.save(update_fields=['estado'])
        r=self.client.post(self.url, self.payload(), format='json')
        self.assertEqual(r.status_code, 400, r.data); self.producto.refresh_from_db()
        self.assertEqual(self.producto.stock_actual, 5); self.assertEqual(KardexInventario.objects.count(), 0)
