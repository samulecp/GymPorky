import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';

type Producto = { id_producto: number; nombre_producto: string; moneda_origen: string; precio_base_original: string; precio_venta_local: string; stock_actual: number; estado: string };
type Socio = { id_socio: number; username: string; ci?: string; estado_cuenta: string; id_socio_id?: number };
type MetodoPago = { id_metodo_pago: number; descripcion: string };
type Linea = { id_producto: number; cantidad: number };
type Props = { onVolver: () => void };
const campo = 'mt-1 w-full rounded border border-gray-600 bg-gray-800 p-2 text-white outline-none focus:border-yellow-500';
const primario = 'rounded bg-yellow-500 px-4 py-2 font-semibold text-black hover:bg-yellow-400 disabled:opacity-50';
const secundario = 'rounded border border-gray-600 px-4 py-2 text-white hover:bg-gray-700 disabled:opacity-50';
function lista<T,>(data: any): T[] { return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : []; }
function errorTexto(error: any): string {
  const data = error?.response?.data;
  if (!data) return 'No se pudo conectar con Django. Comprueba que el servidor esté activo.';
  if (typeof data === 'string') return data;
  if (typeof data.detail === 'string') return data.detail;
  return Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' | ');
}
export default function VentasPOSScreen({ onVolver }: Props) {
  const usuario = useMemo(() => { try { return JSON.parse(localStorage.getItem('usuario') || '{}'); } catch { return {}; } }, []);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [socios, setSocios] = useState<Socio[]>([]);
  const [metodos, setMetodos] = useState<MetodoPago[]>([]);
  const [socio, setSocio] = useState('');
  const [metodo, setMetodo] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [carrito, setCarrito] = useState<Linea[]>([]);
  const [factura, setFactura] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [ventaConfirmada, setVentaConfirmada] = useState<any>(null);

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const [p, s, m] = await Promise.all([api.get('productos/'), api.get('socios/'), api.get('metodos-pago/')]);
      setProductos(lista<Producto>(p.data).filter(x => x.estado?.toLowerCase() === 'activo'));
      setSocios(lista<Socio>(s.data).filter(x => x.estado_cuenta?.toLowerCase() === 'activo'));
      setMetodos(lista<MetodoPago>(m.data));
    } catch (e) { setError(errorTexto(e)); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const productosVisibles = productos.filter(p => p.nombre_producto.toLowerCase().includes(busqueda.toLowerCase()));
  const tieneUSD = carrito.some(l => productos.find(p => p.id_producto === l.id_producto)?.moneda_origen?.toUpperCase() === 'USD');
  const total = carrito.reduce((s, l) => {
    const p = productos.find(x => x.id_producto === l.id_producto);
    return s + (p && p.moneda_origen?.toUpperCase() !== 'USD' ? Number(p.precio_venta_local) * l.cantidad : 0);
  }, 0);
  const agregar = (p: Producto) => {
    if (p.stock_actual <= 0) return;
    setCarrito(actual => actual.some(x => x.id_producto === p.id_producto)
      ? actual.map(x => x.id_producto === p.id_producto ? { ...x, cantidad: Math.min(x.cantidad + 1, p.stock_actual) } : x)
      : [...actual, { id_producto: p.id_producto, cantidad: 1 }]);
  };
  const cambiarCantidad = (id: number, cantidad: number) => setCarrito(actual => actual.map(x => x.id_producto === id ? { ...x, cantidad } : x));
  const quitar = (id: number) => setCarrito(actual => actual.filter(x => x.id_producto !== id));
  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setMensaje(''); setVentaConfirmada(null);
    if (!socio) return setError('Selecciona un socio activo.');
    if (!metodo) return setError('Selecciona un método de pago.');
    if (!carrito.length) return setError('Agrega al menos un producto.');
    for (const l of carrito) {
      const p = productos.find(x => x.id_producto === l.id_producto);
      if (!p || l.cantidad < 1 || l.cantidad > p.stock_actual) return setError(`Cantidad inválida o stock insuficiente para ${p?.nombre_producto || 'un producto'}.`);
    }
    setGuardando(true);
    try {
      const { data } = await api.post('ventas/', {
        id_socio: Number(socio), id_metodo_pago: Number(metodo), nro_factura: factura.trim(),
        detalles: carrito.map(l => ({ id_producto: l.id_producto, cantidad: l.cantidad })),
      });
      setVentaConfirmada(data); setMensaje(`Venta #${data.id_venta} registrada correctamente.`);
      setCarrito([]); setFactura(''); setBusqueda(''); await cargar();
    } catch (err) { setError(errorTexto(err)); }
    finally { setGuardando(false); }
  };

  if (!usuario.es_administrador && !usuario.es_recepcionista) return <div className="mx-auto max-w-5xl rounded border border-red-800 bg-gray-900 p-6 text-white"><p className="text-red-400">No tienes permiso para procesar ventas.</p><button className={`${secundario} mt-4`} onClick={onVolver}>VOLVER</button></div>;

  return <div className="mx-auto max-w-7xl space-y-5 text-white">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-yellow-400">CICLO 3 · CU08</p><h1 className="text-2xl font-bold">Punto de venta (POS)</h1><p className="text-sm text-gray-400">Venta de productos a socios registrados. Los precios finales se calculan en el servidor.</p></div><button className={secundario} onClick={onVolver}>VOLVER</button></header>
    {error && <p role="alert" className="rounded border border-red-700 bg-red-950 p-3 text-red-300">{error}</p>}
    {mensaje && <div className="rounded border border-green-700 bg-green-950 p-3 text-green-300"><p>{mensaje}</p>{ventaConfirmada && <p className="mt-1 text-sm">Total registrado: <strong>{Number(ventaConfirmada.monto_total_local).toFixed(2)} Bs</strong> · Estado: {ventaConfirmada.estado_venta}</p>}</div>}
    {cargando ? <p className="text-gray-400">Cargando catálogo y socios...</p> : <form onSubmit={confirmar} className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
      <section className="space-y-3 rounded-lg border border-gray-700 bg-gray-900 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Productos disponibles</h2><span className="text-sm text-gray-400">{productosVisibles.length} productos</span></div><input className={campo} placeholder="Buscar producto..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{productosVisibles.map(p => <article key={p.id_producto} className="flex flex-col justify-between rounded border border-gray-700 bg-gray-800 p-3"><div><h3 className="font-semibold">{p.nombre_producto}</h3><p className="mt-1 text-sm text-gray-400">Stock: {p.stock_actual}</p><p className="mt-1 text-yellow-400">{p.moneda_origen?.toUpperCase() === 'USD' ? `${Number(p.precio_base_original).toFixed(2)} USD · conversión automática` : `${Number(p.precio_venta_local).toFixed(2)} Bs`}</p></div><button type="button" disabled={p.stock_actual <= 0} onClick={() => agregar(p)} className={`${primario} mt-3 w-full`}>{p.stock_actual <= 0 ? 'SIN STOCK' : 'AGREGAR'}</button></article>)}</div>
        {productosVisibles.length === 0 && <p className="text-sm text-gray-400">No se encontraron productos.</p>}
      </section>
      <section className="space-y-4 rounded-lg border border-gray-700 bg-gray-900 p-4"><h2 className="text-lg font-semibold">Datos de la venta</h2>
        <label className="block text-sm">Socio<select required className={campo} value={socio} onChange={e => setSocio(e.target.value)}><option value="">Seleccionar socio activo</option>{socios.map(s => <option key={s.id_socio} value={s.id_socio}>{s.username} · CI {s.ci || 'No registrada'}</option>)}</select></label>
        <label className="block text-sm">Método de pago<select required className={campo} value={metodo} onChange={e => setMetodo(e.target.value)}><option value="">Seleccionar método</option>{metodos.map(m => <option key={m.id_metodo_pago} value={m.id_metodo_pago}>{m.descripcion}</option>)}</select></label>
        <label className="block text-sm">N.º de factura (opcional)<input className={campo} value={factura} onChange={e => setFactura(e.target.value)} maxLength={50} /></label>
        <div><div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">Carrito</h3><button type="button" className="text-sm text-red-300 hover:text-red-200" onClick={() => setCarrito([])}>Vaciar</button></div>
          {carrito.length === 0 ? <p className="rounded border border-dashed border-gray-700 p-4 text-sm text-gray-400">Todavía no agregaste productos.</p> : <div className="space-y-2">{carrito.map(l => { const p = productos.find(x => x.id_producto === l.id_producto); if (!p) return null; const precio = p.moneda_origen?.toUpperCase() === 'USD' ? Number(p.precio_base_original) : Number(p.precio_venta_local); return <div key={l.id_producto} className="grid grid-cols-[minmax(0,1fr)_76px_auto] items-center gap-2 rounded border border-gray-700 p-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{p.nombre_producto}</p><p className="text-xs text-gray-400">{precio.toFixed(2)} {p.moneda_origen?.toUpperCase() === 'USD' ? 'USD' : 'Bs'} por unidad</p></div><input aria-label={`Cantidad de ${p.nombre_producto}`} className={campo} type="number" min="1" max={p.stock_actual} value={l.cantidad} onChange={e => cambiarCantidad(l.id_producto, Math.max(1, Math.min(p.stock_actual, Number(e.target.value) || 1)))} /><button type="button" onClick={() => quitar(l.id_producto)} className="px-2 py-1 text-red-300">Quitar</button></div>; })}</div>}</div>
        <div className="border-t border-gray-700 pt-3"><p className="text-xs text-gray-400">Total estimado. El backend recalcula el importe usando el tipo de cambio configurado.</p><p className="mt-1 text-2xl font-bold text-yellow-400">{tieneUSD ? 'Se calculará al confirmar' : `${total.toFixed(2)} Bs`}</p></div>
        <button type="submit" disabled={guardando || cargando || !carrito.length} className={`${primario} w-full`}>{guardando ? 'REGISTRANDO VENTA...' : 'CONFIRMAR VENTA'}</button>
        <p className="text-xs text-gray-500">La venta descuenta existencias y genera bitácora. No genera movimientos de Kardex.</p>
      </section>
    </form>}
  </div>;
}
