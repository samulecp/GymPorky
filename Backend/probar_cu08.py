from types import SimpleNamespace
from django.db import transaction
from django.db.models import Q


from api.models import (
    Usuario, Producto, Socio, MetodoPago,
    Venta, DetalleVentaProducto, Bitacora, KardexInventario
)
from api.serializers import RegistrarVentaSerializer


def probar():
    usuario = Usuario.objects.filter(
        Q(es_administrador=True) | Q(es_recepcionista=True),
        is_active=True,
        estado_cuenta="Activo"
    ).first()

    if not usuario:
        print("ERROR: No hay usuario autorizado activo.")
        return

    producto = Producto.objects.get(pk=1)
    stock_inicial = producto.stock_actual

    conteos = {
        "ventas": Venta.objects.count(),
        "detalles": DetalleVentaProducto.objects.count(),
        "bitacora": Bitacora.objects.count(),
        "kardex": KardexInventario.objects.count(),
    }

    try:
        with transaction.atomic():
            request = SimpleNamespace(
    user=usuario,
    META={"REMOTE_ADDR": "127.0.0.1"}
)

            serializer = RegistrarVentaSerializer(
                data={
                    "id_socio": 3,
                    "id_metodo_pago": 1,
                    "nro_factura": "",
                    "detalles": [
                        {"id_producto": 1, "cantidad": 1}
                    ]
                },
                context={"request": request}
            )

            serializer.is_valid(raise_exception=True)
            venta = serializer.save()

            producto.refresh_from_db()

            print("VENTA CREADA:", venta.pk)
            print("TOTAL:", venta.monto_total_local)
            print("STOCK DURANTE LA PRUEBA:", producto.stock_actual)
            print("DETALLES:", DetalleVentaProducto.objects.filter(id_venta=venta).count())
            print("BITÁCORA TOTAL:", Bitacora.objects.count())
            print("KARDEX TOTAL:", KardexInventario.objects.count())

            raise RuntimeError("REVERSIÓN INTENCIONAL DE LA PRUEBA")

    except RuntimeError as error:
        if str(error) != "REVERSIÓN INTENCIONAL DE LA PRUEBA":
            raise
        print("PRUEBA REVERTIDA CORRECTAMENTE.")

    producto.refresh_from_db()

    print("\nVERIFICACIÓN FINAL")
    print("Stock:", producto.stock_actual, "Inicial:", stock_inicial)
    print("Ventas:", Venta.objects.count(), "Inicial:", conteos["ventas"])
    print("Detalles:", DetalleVentaProducto.objects.count(), "Inicial:", conteos["detalles"])
    print("Bitácora:", Bitacora.objects.count(), "Inicial:", conteos["bitacora"])
    print("Kardex:", KardexInventario.objects.count(), "Inicial:", conteos["kardex"])


probar()
