import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';

type Proveedor = { id_proveedor: number; razon_social: string; moneda_facturacion: string };
type Producto = { id_producto: number; nombre_producto: string; moneda_origen: string; stock_actual: number; estado: string };
type DetalleCompra = { id_producto: number; nombre_producto: string; cantidad: number; costo_unitario_origen: string; costo_unitario_local: string; subtotal_origen: string; subtotal_local: string };
type Compra = { id_compra: number; proveedor_nombre: string; fecha_hora: string; nro_factura_proveedor: string | null; tasa_cambio_aplicada: string; monto_total_origen: string; monto_total_local: string; detalles: DetalleCompra[] };
type Linea = { id_producto: string; cantidad: string; costo_unitario_origen: string };
type Props = { onVolver: () => void };
const campo = 'mt-1 w-full rounded border border-gray-600 bg-gray-800 p-2 text-white outline-none focus:border-yellow-500';
const primario = 'rounded bg-yellow-500 px-4 py-2 font-semibold text-black hover:bg-yellow-400 disabled:opacity-50';
const secundario = 'rounded border border-gray-600 px-4 py-2 text-white hover:bg-gray-700 disabled:opacity-50';
const vacia = (): Linea => ({ id_producto: '', cantidad: '1', costo_unitario_origen: '' });
function lista<T,>(data: any): T[] { return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : []; }
function errorTexto(error: any): string {
  const data = error?.response?.data;
  if (!data) return 'No se pudo conectar con Django. Comprueba que el servidor esté activo.';
  if (typeof data.detail === 'string') return data.detail;
  if (typeof data === 'object') return Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' | ');
  return String(data);
}
export default function ComprasScreen({ onVolver }: Props) {
  const usuario = useMemo(() => { try { return JSON.parse(localStorage.getItem('usuario') || '{}'); } catch { return {}; } }, []);
  const [compras, setCompras] = useState<Compra[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [modal, setModal] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [proveedor, setProveedor] = useState('');
  const [factura, setFactura] = useState('');
  const [tasa, setTasa] = useState('1');
  const [lineas, setLineas] = useState<Linea[]>([vacia()]);
  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const [c, p, pr] = await Promise.all([api.get('compras/'), api.get('productos/'), api.get('proveedores/')]);
      setCompras(lista<Compra>(c.data)); setProductos(lista<Producto>(p.data).filter(x => x.estado?.toLowerCase() === 'activo'));
      setProveedores(lista<Proveedor>(pr.data));
    } catch (e) { setError(errorTexto(e)); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  const moneda = proveedores.find(p => String(p.id_proveedor) === proveedor)?.moneda_facturacion || 'BOB';
  const total = lineas.reduce((sum, l) => sum + (Number(l.cantidad) || 0) * (Number(l.costo_unitario_origen) || 0), 0);
  const abrir = () => { setProveedor(''); setFactura(''); setTasa('1'); setLineas([vacia()]); setError(''); setMensaje(''); setModal(true); };
  const cambiarLinea = (i: number, campoLinea: keyof Linea, valor: string) => setLineas(actual => actual.map((l, n) => n === i ? { ...l, [campoLinea]: valor } : l));
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setMensaje('');
    if (!proveedor) { setError('Selecciona un proveedor.'); return; }
    if (!lineas.length || lineas.some(l => !l.id_producto || Number(l.cantidad) < 1 || Number(l.costo_unitario_origen) <= 0)) { setError('Completa producto, cantidad y costo unitario válido en cada detalle.'); return; }
    if (new Set(lineas.map(l => l.id_producto)).size !== lineas.length) { setError('No repitas productos en la compra; agrupa sus cantidades en una sola línea.'); return; }
    if (Number(tasa) <= 0) { setError('La tasa de cambio debe ser mayor que cero.'); return; }
    setGuardando(true);
    try {
      await api.post('compras/', { id_proveedor: Number(proveedor), nro_factura_proveedor: factura.trim() || null, tasa_cambio_aplicada: Number(tasa), detalles: lineas.map(l => ({ id_producto: Number(l.id_producto), cantidad: Number(l.cantidad), costo_unitario_origen: Number(l.costo_unitario_origen) })) });
      setModal(false); setMensaje('Compra registrada correctamente. El inventario fue actualizado.'); await cargar();
    } catch (err) { setError(errorTexto(err)); }
    finally { setGuardando(false); }
  };
  if (!usuario.es_administrador) return <div className="mx-auto max-w-5xl rounded border border-red-800 bg-gray-900 p-6 text-white"><p className="text-red-400">No tienes permiso para registrar compras.</p><button className={`${secundario} mt-4`} onClick={onVolver}>VOLVER</button></div>;
  return <div className="mx-auto max-w-7xl space-y-5 text-white">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-yellow-400">CICLO 3 · CU14</p><h1 className="text-2xl font-bold">Compras de mercadería</h1><p className="text-sm text-gray-400">Registro de compras y actualización automática de existencias.</p></div><div className="flex gap-2"><button className={secundario} onClick={onVolver}>VOLVER</button><button className={primario} onClick={abrir}>+ NUEVA COMPRA</button></div></div>
    {mensaje && <p className="rounded border border-green-700 bg-green-950 p-3 text-green-300">{mensaje}</p>}{error && !modal && <p className="rounded border border-red-700 bg-red-950 p-3 text-red-300">{error}</p>}
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-4"><h2 className="mb-3 text-lg font-semibold">Historial de compras</h2>{cargando ? <p className="text-gray-400">Cargando...</p> : compras.length === 0 ? <p className="text-gray-400">Todavía no hay compras registradas.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-gray-800 text-gray-300"><tr><th className="p-3">N.º</th><th className="p-3">Fecha</th><th className="p-3">Proveedor</th><th className="p-3">Factura</th><th className="p-3">Productos</th><th className="p-3 text-right">Total (Bs)</th></tr></thead><tbody>{compras.map(c => <tr key={c.id_compra} className="border-t border-gray-700"><td className="p-3">{c.id_compra}</td><td className="p-3">{new Date(c.fecha_hora).toLocaleString()}</td><td className="p-3">{c.proveedor_nombre}</td><td className="p-3">{c.nro_factura_proveedor || '—'}</td><td className="p-3">{c.detalles?.map(d => `${d.nombre_producto} × ${d.cantidad}`).join(', ') || '—'}</td><td className="p-3 text-right">{Number(c.monto_total_local).toFixed(2)}</td></tr>)}</tbody></table></div>}</div>
    {modal && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-3 sm:p-6"><form onSubmit={guardar} className="my-4 w-full max-w-3xl space-y-4 rounded-lg border border-gray-700 bg-gray-900 p-4 sm:p-6"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">Registrar compra</h2><button type="button" onClick={() => setModal(false)} className="text-gray-400 hover:text-white">✕</button></div>
      {error && <p className="rounded border border-red-700 bg-red-950 p-3 text-sm text-red-300">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-sm">Proveedor<select required className={campo} value={proveedor} onChange={e => { setProveedor(e.target.value); setTasa('1'); }}><option value="">Seleccionar proveedor</option>{proveedores.map(p => <option key={p.id_proveedor} value={p.id_proveedor}>{p.razon_social} · {p.moneda_facturacion}</option>)}</select></label><label className="text-sm">N.º de factura (opcional)<input className={campo} value={factura} onChange={e => setFactura(e.target.value)} /></label><label className="text-sm">Tasa de cambio<input required type="number" min="0.0001" step="0.0001" className={campo} value={tasa} onChange={e => setTasa(e.target.value)} /><span className="text-xs text-gray-400">Multiplica el costo de origen para convertirlo a Bs.</span></label><div className="flex items-end text-sm text-gray-400">Moneda del proveedor: <strong className="ml-1 text-white">{moneda}</strong></div></div>
      <div><div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">Detalle de productos</h3><button type="button" className={secundario} onClick={() => setLineas(a => [...a, vacia()])}>+ AGREGAR PRODUCTO</button></div><div className="space-y-3">{lineas.map((l, i) => <div key={i} className="grid grid-cols-1 items-end gap-2 rounded border border-gray-700 p-3 sm:grid-cols-[minmax(0,2fr)_100px_140px_auto]"><label className="text-sm">Producto<select required className={campo} value={l.id_producto} onChange={e => cambiarLinea(i, 'id_producto', e.target.value)}><option value="">Seleccionar</option>{productos.map(p => <option key={p.id_producto} value={p.id_producto}>{p.nombre_producto} · Stock: {p.stock_actual}</option>)}</select></label><label className="text-sm">Cantidad<input required type="number" min="1" step="1" className={campo} value={l.cantidad} onChange={e => cambiarLinea(i, 'cantidad', e.target.value)} /></label><label className="text-sm">Costo unitario ({moneda})<input required type="number" min="0.01" step="0.01" className={campo} value={l.costo_unitario_origen} onChange={e => cambiarLinea(i, 'costo_unitario_origen', e.target.value)} /></label><button type="button" disabled={lineas.length === 1} onClick={() => setLineas(a => a.filter((_, n) => n !== i))} className="rounded border border-red-800 px-3 py-2 text-red-300 disabled:opacity-30">Quitar</button></div>)}</div></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-700 pt-4"><p className="text-lg">Total de origen: <strong>{total.toFixed(2)} {moneda}</strong></p><p className="text-lg">Total estimado en Bs: <strong>{(total * (Number(tasa) || 0)).toFixed(2)} Bs</strong></p></div><p className="text-xs text-gray-400">Al confirmar, la compra quedará registrada y el stock/costo promedio se actualizarán automáticamente. La operación no se puede deshacer desde esta pantalla.</p><div className="flex justify-end gap-2"><button type="button" className={secundario} onClick={() => setModal(false)} disabled={guardando}>CANCELAR</button><button type="submit" className={primario} disabled={guardando || !proveedores.length || !productos.length}>{guardando ? 'REGISTRANDO...' : 'CONFIRMAR COMPRA'}</button></div>
    </form></div>}
    {!cargando && (!proveedores.length || !productos.length) && <p className="rounded border border-yellow-800 bg-yellow-950 p-3 text-sm text-yellow-200">Para registrar compras necesitas al menos un proveedor y un producto activo.</p>}
  </div>;
}
