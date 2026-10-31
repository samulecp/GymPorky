import React, { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
type Producto = { id_producto:number; nombre_producto:string; stock_actual:number; estado:string };
type Movimiento = { id_kardex:number; id_producto:number; nombre_producto:string; fecha_movimiento:string; tipo_movimiento:string; cantidad:number; motivo:string };
type Props = { onVolver:()=>void };
const input='mt-1 w-full rounded border border-gray-600 bg-gray-800 p-2 text-white';
const btn='rounded bg-yellow-500 px-4 py-2 font-semibold text-black hover:bg-yellow-400 disabled:opacity-50';
function lista<T,>(d:any):T[]{return Array.isArray(d)?d:Array.isArray(d?.results)?d.results:[];}
function errorTexto(e:any):string{const d=e?.response?.data;if(!d)return 'No se pudo conectar con Django. Comprueba que el servidor esté activo.';return Object.entries(d).map(([k,v])=>`${k}: ${Array.isArray(v)?v.join(', '):typeof v==='object'?JSON.stringify(v):String(v)}`).join(' | ');}
export default function KardexScreen({onVolver}:Props){
 const [productos,setProductos]=useState<Producto[]>([]); const [movimientos,setMovimientos]=useState<Movimiento[]>([]);
 const [producto,setProducto]=useState(''); const [tipo,setTipo]=useState('INGRESO'); const [cantidad,setCantidad]=useState('1'); const [motivo,setMotivo]=useState('');
 const [cargando,setCargando]=useState(true); const [guardando,setGuardando]=useState(false); const [error,setError]=useState(''); const [mensaje,setMensaje]=useState('');
 const cargar=useCallback(async()=>{setCargando(true);setError('');try{const [p,k]=await Promise.all([api.get('productos/'),api.get('kardex/')]);setProductos(lista<Producto>(p.data).filter(x=>x.estado?.toLowerCase()==='activo'));setMovimientos(lista<Movimiento>(k.data));}catch(e){setError(errorTexto(e));}finally{setCargando(false);}},[]);
 useEffect(()=>{cargar();},[cargar]);
 const guardar=async(e:React.FormEvent)=>{e.preventDefault();setError('');setMensaje('');if(!producto||!motivo.trim()||Number(cantidad)<1){setError('Selecciona un producto, una cantidad válida y escribe el motivo.');return;}setGuardando(true);try{await api.post('kardex/',{id_producto:Number(producto),tipo_movimiento:tipo,cantidad:Number(cantidad),motivo:motivo.trim()});setMensaje('Movimiento registrado y stock actualizado correctamente.');setCantidad('1');setMotivo('');await cargar();}catch(err){setError(errorTexto(err));}finally{setGuardando(false);}};
 const fecha=(v:string)=>{const d=new Date(v);return Number.isNaN(d.getTime())?v:d.toLocaleString();};
 return <div className="mx-auto max-w-6xl space-y-5 text-white">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Kardex de inventario</h1><p className="text-sm text-gray-400">Registro de movimientos extraordinarios y consulta del historial.</p></div><button onClick={onVolver} className="rounded border border-gray-600 px-4 py-2">Volver</button></div>
  {error&&<div className="rounded border border-red-700 bg-red-950 p-3 text-red-200">{error}</div>}{mensaje&&<div className="rounded border border-green-700 bg-green-950 p-3 text-green-200">{mensaje}</div>}
  <form onSubmit={guardar} className="grid grid-cols-1 gap-4 rounded-lg border border-gray-700 bg-gray-900 p-4 md:grid-cols-2">
   <h2 className="font-semibold md:col-span-2">Registrar movimiento</h2>
   <label>Producto<select className={input} value={producto} onChange={e=>setProducto(e.target.value)} required><option value="">Seleccionar producto</option>{productos.map(p=><option key={p.id_producto} value={p.id_producto}>{p.nombre_producto} — Stock: {p.stock_actual}</option>)}</select></label>
   <label>Tipo de movimiento<select className={input} value={tipo} onChange={e=>setTipo(e.target.value)}><option value="INGRESO">Ingreso extraordinario (+)</option><option value="RETIRO">Retiro por vencimiento, daño o pérdida (-)</option><option value="AJUSTE_POSITIVO">Ajuste positivo (+)</option><option value="AJUSTE_NEGATIVO">Ajuste negativo (-)</option></select></label>
   <label>Cantidad<input className={input} type="number" min="1" step="1" value={cantidad} onChange={e=>setCantidad(e.target.value)} required /></label>
   <label className="md:col-span-2">Motivo<textarea className={input} maxLength={100} rows={2} value={motivo} onChange={e=>setMotivo(e.target.value)} placeholder="Ej.: retiro de 2 unidades vencidas" required /></label>
   <p className="text-xs text-gray-400 md:col-span-2">El stock se actualizará automáticamente. No uses Kardex para registrar compras o ventas.</p>
   <div className="md:col-span-2"><button className={btn} disabled={guardando||cargando}>{guardando?'Registrando...':'Registrar movimiento'}</button></div>
  </form>
  <section className="rounded-lg border border-gray-700 bg-gray-900 p-4"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Historial de movimientos</h2><button onClick={cargar} className="rounded border border-gray-600 px-3 py-1 text-sm">Actualizar</button></div>
   {cargando?<p className="text-gray-400">Cargando...</p>:movimientos.length===0?<p className="text-gray-400">Todavía no hay movimientos registrados.</p>:<div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="text-gray-400"><tr><th className="p-2">Fecha</th><th className="p-2">Producto</th><th className="p-2">Tipo</th><th className="p-2">Cantidad</th><th className="p-2">Motivo</th></tr></thead><tbody>{movimientos.map(m=><tr key={m.id_kardex} className="border-t border-gray-700"><td className="p-2">{fecha(m.fecha_movimiento)}</td><td className="p-2">{m.nombre_producto}</td><td className="p-2">{m.tipo_movimiento}</td><td className="p-2">{m.cantidad}</td><td className="p-2">{m.motivo}</td></tr>)}</tbody></table></div>}
  </section>
 </div>;
}
