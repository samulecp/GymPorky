# api/urls.py
from django.urls import path, include
from .views import CambiarPasswordView, SolicitarResetPasswordView, ConfirmarResetPasswordView
from .paypal_views import PayPalConexionView, PayPalCrearOrdenMembresiaView, PayPalCapturarMembresiaView
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    RegistroView, UsuarioViewSet, SocioViewSet, CategoriaProductoViewSet, ProveedorViewSet, CompraViewSet,
    PlanMembresiaViewSet, MetodoPagoViewSet, VentaViewSet, ProductoViewSet, KardexViewSet, AlertaReposicionViewSet,
    EjercicioViewSet, RutinaViewSet, LoginView,
    BitacoraViewSet, RegistrarSocioView, RegistrarContratoMembresiaView,
    # CU17–CU20: módulo de entrenamiento
    AsignacionRutinaViewSet, EntrenadorViewSet, RegistrarEntrenadorView,
    HorarioEntrenadorViewSet, TurnoViewSet,
)

# Configuración del Router para los ViewSets
router = DefaultRouter()
router.register(r'usuarios', UsuarioViewSet)
router.register(r'socios', SocioViewSet)
router.register(r'planes', PlanMembresiaViewSet)
router.register(r'metodos-pago', MetodoPagoViewSet)  # CU06: catálogo de pago
router.register(r'ventas', VentaViewSet)
router.register(r'productos', ProductoViewSet)
router.register(r'compras', CompraViewSet, basename='compras')
router.register(r'kardex', KardexViewSet, basename='kardex')  # CU15
router.register(r'alertas-reposicion', AlertaReposicionViewSet, basename='alertas-reposicion')  # CU16
router.register(r'categorias', CategoriaProductoViewSet, basename='categorias')  # CU11
router.register(r'proveedores', ProveedorViewSet, basename='proveedores')  # CU13
router.register(r'ejercicios', EjercicioViewSet)          # CU17: registrar ejercicio
router.register(r'rutinas', RutinaViewSet)               # CU18: diseñar rutina
router.register(r'asignaciones-rutina', AsignacionRutinaViewSet, basename='asignaciones-rutina')  # CU19
router.register(r'entrenadores', EntrenadorViewSet, basename='entrenadores')                      # CU20
router.register(r'horarios-entrenador', HorarioEntrenadorViewSet, basename='horarios-entrenador')  # CU20
router.register(r'turnos', TurnoViewSet)                 # CU20: catálogo de franjas horarias
router.register(r'bitacora', BitacoraViewSet, basename='bitacora')  # CU03

from .paypal_views import TipoCambioConfiguracionView

urlpatterns = [
    path('configuracion/tipo-cambio/', TipoCambioConfiguracionView.as_view(), name='configuracion_tipo_cambio'),

    path('paypal/conexion/', PayPalConexionView.as_view(), name='paypal_conexion'),
    path('paypal/membresias/crear-orden/', PayPalCrearOrdenMembresiaView.as_view(), name='paypal_crear_orden_membresia'),
    path('paypal/membresias/capturar/', PayPalCapturarMembresiaView.as_view(), name='paypal_capturar_membresia'),
    # Rutas de Autenticación
    path('auth/registro/', RegistroView.as_view(), name='registro'),
    path('auth/login/', LoginView.as_view(), name='login'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/cambiar-password/', CambiarPasswordView.as_view(), name='cambiar_password'),
    path('auth/solicitar-reset/', SolicitarResetPasswordView.as_view(), name='solicitar_reset'),
    path('auth/confirmar-reset/<uidb64>/<token>/', ConfirmarResetPasswordView.as_view(), name='confirmar_reset'),
    # CU04: Registrar Expediente de Socio (alta desde Recepción)
    path('socios/registrar/', RegistrarSocioView.as_view(), name='registrar_socio'),
    # CU06: Registrar Contrato de Membresía (socio existente + plan activo)
    path('contratos/registrar/', RegistrarContratoMembresiaView.as_view(), name='registrar_contrato'),
    # CU20: Registrar Entrenador (cuenta + perfil + horarios en una sola petición)
    path('entrenadores/registrar/', RegistrarEntrenadorView.as_view(), name='registrar_entrenador'),
    # Rutas generadas por el Router
    path('', include(router.urls)),
]