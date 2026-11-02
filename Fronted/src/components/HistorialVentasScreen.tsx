import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Printer, RefreshCw, Search, Eye, X } from 'lucide-react';
import api from '../services/api';

type Detalle = { id_producto: number; nombre_producto: string; cantidad: number; precio_unitario_origen: string; precio_unitario_local: string; subtotal_origen: string; subtotal_local: string };
type Venta = { id_venta: number; id_usuario: number; usuario: string; id_metodo_pago: number; metodo_pago: string; id_socio: number; socio_nombre: string; fecha_hora: string; nro_factura: string | null; tasa_cambio_aplicada: string; monto_total_local: string; estado_venta: string; detalle_productos: Detalle[] };
type Props = { onVolver: () => void };
const campo = 'rounded border border-gray-600 bg-gray-800 p-2 text-white outline-none focus:border-yellow-500';
const boton = 'rounded border border-gray-600 px-3 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50';
function lista<T,>(data: any): T[] { return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : []; }
function errorTexto(error: any): string { const d = error?.response?.data; if (!d) return 'No se pudo conectar con Django.'; if (typeof d.detail === 'string') return d.detail; return Object.entries(d).map(([k,v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`).join(' | '); }
function fecha(v: string) { return new Date(v).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' }); }
export default function HistorialVentasScreen({ onVolver }: Props) {
  const usuario = useMemo(() => { try { return JSON.parse(localStorage.getItem('usuario') || '{}'); } catch { return {}; } }, []);
  const [ventas, setVentas] = useState<Venta[]>([]); const [cargando, setCargando] = useState(true); const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState(''); const [desde, setDesde] = useState(''); const [hasta, setHasta] = useState(''); const [metodo, setMetodo] = useState(''); const [seleccionada, setSeleccionada] = useState<Venta | null>(null);
  const cargar = useCallback(async () => { setCargando(true); setError(''); try { const {data} = await api.get('ventas/'); setVentas(lista<Venta>(data)); } catch(e) { setError(errorTexto(e)); } finally { setCargando(false); } }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  const filtradas = ventas.filter(v => {
    const q = busqueda.trim().toLowerCase(); const d = new Date(v.fecha_hora); const dia = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return (!q || [String(v.id_venta), v.socio_nombre, v.usuario, v.nro_factura || ''].some(x => x.toLowerCase().includes(q))) && (!desde || dia >= desde) && (!hasta || dia <= hasta) && (!metodo || String(v.id_metodo_pago) === metodo);
  });
  const totalFiltrado = filtradas.reduce((s,v) => s + Number(v.monto_total_local || 0), 0);
  const imprimirComprobante = () => window.print();
  const imprimirListado = () => {
    document.body.classList.add('printing-list');
    const limpiar = () => { document.body.classList.remove('printing-list'); window.removeEventListener('afterprint', limpiar); };
    window.addEventListener('afterprint', limpiar);
    window.print();
  };
  if (!usuario.es_administrador && !usuario.es_recepcionista) return <div className="rounded border border-red-800 bg-gray-900 p-6 text-white">No tienes permiso para consultar ventas.<button className={`${boton} mt-4 block`} onClick={onVolver}>VOLVER</button></div>;
  return <div className="mx-auto max-w-7xl space-y-5 text-white print:bg-white print:text-black">
    <style>{`@media print {
      @page { size: auto; margin: 12mm; }
      body * { visibility: hidden !important; }
      .print-ticket, .print-ticket * { visibility: visible !important; }
      .print-ticket { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important; border: 0 !important; border-radius: 0 !important; background: #fff !important; color: #000 !important; box-shadow: none !important; }
      .print-ticket table { width: 100% !important; border-collapse: collapse !important; }
      .print-ticket th, .print-ticket td { color: #000 !important; border-color: #999 !important; }
      .print-ticket .print-hidden { display: none !important; }
      body.printing-list * { visibility: hidden !important; }
      body.printing-list .print-list, body.printing-list .print-list * { visibility: visible !important; }
      body.printing-list .print-ticket { display: none !important; }
      body.printing-list .print-list { display: block !important; width: 100% !important; color: #000 !important; background: #fff !important; }
      body.printing-list .print-list table { width: 100% !important; border-collapse: collapse !important; min-width: 0 !important; }
      body.printing-list .print-list th, body.printing-list .print-list td { color: #000 !important; border: 1px solid #999 !important; padding: 6px !important; }
      body.printing-list .print-list-summary { color: #000 !important; background: #fff !important; border: 0 !important; }
      body.printing-list .print-list-hide { display: none !important; }
    }`}</style>
    <header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-yellow-400">CICLO 3 · CU08</p><h1 className="text-2xl font-bold">Historial de ventas</h1><p className="text-sm text-gray-400">Consulta las ventas registradas y sus productos.</p></div><div className="flex gap-2"><button className={boton} onClick={onVolver}>VOLVER</button><button className={boton} onClick={() => void cargar()} disabled={cargando}><RefreshCw size={16} className="inline mr-1"/>Actualizar</button></div></header>
    {error && <p role="alert" className="rounded border border-red-700 bg-red-950 p-3 text-red-300">{error}</p>}
    <section className="grid grid-cols-1 gap-3 rounded-lg border border-gray-700 bg-gray-900 p-4 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
      <label className="text-sm text-gray-300">Buscar venta, socio, usuario o factura<div className="relative mt-1"><Search size={16} className="absolute left-3 top-3 text-gray-400"/><input className={`${campo} w-full pl-9`} value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar..."/></div></label>
      <label className="text-sm text-gray-300">Desde<input type="date" className={`${campo} mt-1 w-full`} value={desde} onChange={e=>setDesde(e.target.value)}/></label>
      <label className="text-sm text-gray-300">Hasta<input type="date" className={`${campo} mt-1 w-full`} value={hasta} onChange={e=>setHasta(e.target.value)}/></label>
      <label className="text-sm text-gray-300">Método de pago<select className={`${campo} mt-1 w-full`} value={metodo} onChange={e=>setMetodo(e.target.value)}><option value="">Todos</option>{Array.from(new Map(ventas.map(v=>[v.id_metodo_pago,v.metodo_pago])).entries()).map(([id,nombre])=><option key={id} value={id}>{nombre}</option>)}</select></label>
    </section>
    <div className="print-list-summary flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-700 bg-gray-900 p-4"><div><p className="text-sm text-gray-400">Ventas encontradas: <strong className="text-white">{filtradas.length}</strong></p><p className="text-lg font-bold text-yellow-400">Total del filtro: {totalFiltrado.toFixed(2)} Bs</p></div><button className={`${boton} print:hidden`} onClick={imprimirListado}><Printer size={16} className="mr-1 inline"/>Imprimir listado</button></div>
    <section className="print-list overflow-hidden rounded-lg border border-gray-700 bg-gray-900"><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-gray-800 text-gray-300"><tr>{['Venta','Fecha','Socio','Registró','Método','Estado','Total',''].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{filtradas.map(v=><tr key={v.id_venta} className="border-t border-gray-700"><td className="p-3 font-semibold">#{v.id_venta}</td><td className="p-3">{fecha(v.fecha_hora)}</td><td className="p-3">{v.socio_nombre || `Socio #${v.id_socio}`}</td><td className="p-3">{v.usuario || `Usuario #${v.id_usuario}`}</td><td className="p-3">{v.metodo_pago || '—'}</td><td className="p-3">{v.estado_venta}</td><td className="p-3 text-right font-semibold">{Number(v.monto_total_local).toFixed(2)} Bs</td><td className="p-3"><button className="text-yellow-400 hover:text-yellow-300" onClick={()=>setSeleccionada(v)}><Eye size={18}/><span className="sr-only">Ver detalle</span></button></td></tr>)}</tbody></table></div>{!cargando && filtradas.length===0 && <p className="p-6 text-center text-gray-400">No se encontraron ventas con esos filtros.</p>}{cargando && <p className="p-6 text-gray-400">Cargando historial...</p>}</section>
    {seleccionada && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-3 sm:p-6 print:static print:bg-white"><div className="print-ticket my-5 w-full max-w-3xl space-y-4 rounded-lg border border-gray-700 bg-gray-900 p-5 print:border-0 print:bg-white print:text-black"><div className="flex items-center justify-between print:hidden"><h2 className="text-xl font-bold">Detalle de venta #{seleccionada.id_venta}</h2><button onClick={()=>setSeleccionada(null)} aria-label="Cerrar"><X/></button></div><div className="hidden print:block"><h2 className="text-xl font-bold">PorkyGym · Venta #{seleccionada.id_venta}</h2></div><div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2"><p>Fecha: <strong>{fecha(seleccionada.fecha_hora)}</strong></p><p>Socio: <strong>{seleccionada.socio_nombre}</strong></p><p>Atendió: <strong>{seleccionada.usuario}</strong></p><p>Pago: <strong>{seleccionada.metodo_pago}</strong></p><p>Factura: <strong>{seleccionada.nro_factura || 'No registrada'}</strong></p><p>Tipo de cambio: <strong>{Number(seleccionada.tasa_cambio_aplicada).toFixed(4)} Bs/USD</strong></p></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-gray-600 text-left"><th className="py-2">Producto</th><th className="py-2">Cant.</th><th className="py-2 text-right">P. unitario</th><th className="py-2 text-right">Subtotal</th></tr></thead><tbody>{seleccionada.detalle_productos?.map((d,i)=><tr key={`${d.id_producto}-${i}`} className="border-b border-gray-700"><td className="py-2">{d.nombre_producto}</td><td className="py-2">{d.cantidad}</td><td className="py-2 text-right">{Number(d.precio_unitario_local).toFixed(2)} Bs</td><td className="py-2 text-right">{Number(d.subtotal_local).toFixed(2)} Bs</td></tr>)}</tbody></table></div><div className="text-right text-xl font-bold text-yellow-400 print:text-black">Total: {Number(seleccionada.monto_total_local).toFixed(2)} Bs</div><div className="flex justify-end gap-2 print:hidden"><button className={boton} onClick={imprimirComprobante}><Printer size={16} className="mr-1 inline"/>Imprimir comprobante</button><button className={boton} onClick={()=>setSeleccionada(null)}>Cerrar</button></div></div></div>}
  </div>;
}
