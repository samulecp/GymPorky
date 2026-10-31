import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';

type Proveedor = {
  id_proveedor: number;
  razon_social: string;
  nit: string;
  moneda_facturacion: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
};
type Formulario = {
  razon_social: string;
  nit: string;
  moneda_facturacion: string;
  telefono: string;
  email: string;
  direccion: string;
};
type Props = { onVolver: () => void };
const vacio: Formulario = { razon_social: '', nit: '', moneda_facturacion: 'BOB', telefono: '', email: '', direccion: '' };
const campo = 'mt-1 w-full rounded border border-gray-600 bg-gray-800 p-2 text-white outline-none focus:border-yellow-500';
const primario = 'rounded bg-yellow-500 px-4 py-2 font-semibold text-black hover:bg-yellow-400 disabled:opacity-50';
const secundario = 'rounded border border-gray-600 px-4 py-2 text-white hover:bg-gray-700 disabled:opacity-50';
function lista(data: any): Proveedor[] { return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : []; }
function errorTexto(error: any): string {
  const data = error?.response?.data;
  if (!data) return 'No se pudo conectar con Django. Comprueba que el servidor esté activo.';
  if (typeof data.detail === 'string') return data.detail;
  if (typeof data === 'object') return Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`).join(' | ');
  return 'Ocurrió un error al procesar la solicitud.';
}

export default function ProveedoresScreen({ onVolver }: Props) {
  const usuario = useMemo(() => { try { return JSON.parse(localStorage.getItem('usuario') || '{}'); } catch { return {}; } }, []);
  const esAdmin = Boolean(usuario.es_administrador);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  const [form, setForm] = useState<Formulario>(vacio);
  const [guardando, setGuardando] = useState(false);
  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try { const r = await api.get('proveedores/'); setProveedores(lista(r.data)); }
    catch (e) { setError(errorTexto(e)); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  const visibles = proveedores.filter(p => `${p.razon_social} ${p.nit} ${p.email || ''}`.toLowerCase().includes(busqueda.toLowerCase()));
  const abrirNuevo = () => { setEditando(null); setForm(vacio); setError(''); setMensaje(''); setModal(true); };
  const abrirEditar = (p: Proveedor) => { setEditando(p.id_proveedor); setForm({ razon_social: p.razon_social, nit: p.nit, moneda_facturacion: p.moneda_facturacion, telefono: p.telefono || '', email: p.email || '', direccion: p.direccion || '' }); setError(''); setMensaje(''); setModal(true); };
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault(); setGuardando(true); setError('');
    const payload = { ...form, razon_social: form.razon_social.trim(), nit: form.nit.trim(), telefono: form.telefono.trim() || null, email: form.email.trim() || null, direccion: form.direccion.trim() || null };
    try {
      if (editando) await api.patch(`proveedores/${editando}/`, payload);
      else await api.post('proveedores/', payload);
      setModal(false); setMensaje(editando ? 'Proveedor actualizado correctamente.' : 'Proveedor registrado correctamente.'); await cargar();
    } catch (err) { setError(errorTexto(err)); }
    finally { setGuardando(false); }
  };
  const eliminar = async (p: Proveedor) => {
    if (!window.confirm(`¿Eliminar al proveedor "${p.razon_social}"? Si tiene compras registradas, el sistema impedirá eliminarlo.`)) return;
    setError(''); setMensaje('');
    try { await api.delete(`proveedores/${p.id_proveedor}/`); setMensaje('Proveedor eliminado correctamente.'); await cargar(); }
    catch (e) { setError(errorTexto(e)); }
  };
  return <div className="mx-auto max-w-7xl space-y-5 text-white">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm text-yellow-400">CICLO 3 · CU13</p><h1 className="text-2xl font-bold">Proveedores</h1><p className="text-sm text-gray-400">Registro y consulta de proveedores de mercadería.</p></div>
      <div className="flex gap-2"><button className={secundario} onClick={onVolver}>Volver</button>{esAdmin && <button className={primario} onClick={abrirNuevo}>+ Nuevo proveedor</button>}</div>
    </div>
    {mensaje && <div role="status" className="rounded border border-green-700 bg-green-950/40 p-3 text-green-300">{mensaje}</div>}
    {error && !modal && <div role="alert" className="rounded border border-red-700 bg-red-950/40 p-3 text-red-300">{error}</div>}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-700 bg-gray-900 p-4"><input className={`${campo} mt-0 max-w-md`} placeholder="Buscar por razón social, NIT o correo..." value={busqueda} onChange={e => setBusqueda(e.target.value)} /><span className="text-sm text-gray-400">{visibles.length} proveedor(es)</span></div>
    <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
      {cargando ? <p className="p-6 text-gray-300">Cargando proveedores...</p> : visibles.length === 0 ? <p className="p-6 text-gray-400">No se encontraron proveedores.</p> : <table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-gray-800 text-gray-300"><tr>{['Razón social','NIT','Moneda','Teléfono','Correo','Dirección',...(esAdmin ? ['Acciones'] : [])].map(x => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody>{visibles.map(p => <tr key={p.id_proveedor} className="border-t border-gray-800 hover:bg-gray-800/60"><td className="px-4 py-3 font-medium">{p.razon_social}</td><td className="px-4 py-3">{p.nit}</td><td className="px-4 py-3">{p.moneda_facturacion}</td><td className="px-4 py-3">{p.telefono || '—'}</td><td className="px-4 py-3">{p.email || '—'}</td><td className="max-w-xs truncate px-4 py-3">{p.direccion || '—'}</td>{esAdmin && <td className="px-4 py-3"><div className="flex gap-2"><button className="text-yellow-400 hover:underline" onClick={() => abrirEditar(p)}>Editar</button><button className="text-red-400 hover:underline" onClick={() => void eliminar(p)}>Eliminar</button></div></td>}</tr>)}</tbody></table>}
    </div>
    <p className="text-xs text-gray-500">La recepción puede consultar proveedores. Solo administración puede registrar, editar o eliminar.</p>
    {modal && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-proveedor"><form onSubmit={guardar} className="my-8 w-full max-w-2xl space-y-4 rounded-xl border border-gray-700 bg-gray-900 p-5 shadow-2xl">
      <div className="flex items-center justify-between"><h2 id="titulo-proveedor" className="text-xl font-bold">{editando ? 'Editar proveedor' : 'Nuevo proveedor'}</h2><button type="button" className="text-2xl text-gray-400" onClick={() => setModal(false)} aria-label="Cerrar">×</button></div>
      {error && <div role="alert" className="rounded border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="text-sm">Razón social *<input required maxLength={150} className={campo} value={form.razon_social} onChange={e => setForm({ ...form, razon_social: e.target.value })} /></label>
        <label className="text-sm">NIT *<input required maxLength={50} className={campo} value={form.nit} onChange={e => setForm({ ...form, nit: e.target.value })} /></label>
        <label className="text-sm">Moneda de facturación *<select className={campo} value={form.moneda_facturacion} onChange={e => setForm({ ...form, moneda_facturacion: e.target.value })}><option value="BOB">BOB – Bolivianos</option><option value="USD">USD – Dólares</option><option value="EUR">EUR – Euros</option></select></label>
        <label className="text-sm">Teléfono<input maxLength={20} className={campo} value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} /></label>
        <label className="text-sm sm:col-span-2">Correo electrónico<input type="email" maxLength={100} className={campo} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
        <label className="text-sm sm:col-span-2">Dirección<textarea rows={2} className={campo} value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} /></label>
      </div>
      <div className="flex justify-end gap-2"><button type="button" className={secundario} onClick={() => setModal(false)}>Cancelar</button><button type="submit" className={primario} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar proveedor'}</button></div>
    </form></div>}
  </div>;
}
