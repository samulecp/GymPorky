import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';

type Categoria = { id_categoria: number; nombre_categoria: string; id_subcategoria: number | null };
type Props = { onVolver: () => void };
const inputClass = 'w-full rounded border border-gray-700 bg-gray-800 p-2 text-white outline-none focus:border-yellow-500';
const primary = 'rounded bg-yellow-500 px-4 py-2 font-bold text-black hover:bg-yellow-400 disabled:opacity-50';
const secondary = 'rounded border border-gray-600 px-4 py-2 text-white hover:bg-gray-700';

function errorTexto(error: any): string {
  const data = error?.response?.data;
  if (!data) return 'No se pudo conectar con Django. Comprueba que el servidor esté activo.';
  if (typeof data.detail === 'string') return data.detail;
  if (typeof data === 'object') return Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`).join(' | ');
  return 'Ocurrió un error al procesar la solicitud.';
}

export default function CategoriasScreen({ onVolver }: Props) {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [formulario, setFormulario] = useState(false);
  const [editando, setEditando] = useState<Categoria | null>(null);
  const [nombre, setNombre] = useState('');
  const [padre, setPadre] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try { const r = await api.get<Categoria[]>('categorias/'); setCategorias(r.data); }
    catch (e) { setError(errorTexto(e)); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const opcionesPadre = useMemo(() => categorias.filter(c => c.id_categoria !== editando?.id_categoria), [categorias, editando]);
  const cerrarFormulario = () => { setFormulario(false); setEditando(null); setNombre(''); setPadre(''); };
  const nueva = () => { setError(''); setMensaje(''); setEditando(null); setNombre(''); setPadre(''); setFormulario(true); };
  const editar = (c: Categoria) => { setError(''); setMensaje(''); setEditando(c); setNombre(c.nombre_categoria); setPadre(c.id_subcategoria ? String(c.id_subcategoria) : ''); setFormulario(true); };

  const guardar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!nombre.trim()) { setError('El nombre de la categoría es obligatorio.'); return; }
    setGuardando(true); setError(''); setMensaje('');
    const datos = { nombre_categoria: nombre.trim(), id_subcategoria: padre ? Number(padre) : null };
    try {
      if (editando) { await api.patch(`categorias/${editando.id_categoria}/`, datos); setMensaje('Categoría actualizada correctamente.'); }
      else { await api.post('categorias/', datos); setMensaje('Categoría creada correctamente.'); }
      cerrarFormulario(); await cargar();
    } catch (err) { setError(errorTexto(err)); }
    finally { setGuardando(false); }
  };
  const eliminar = async (c: Categoria) => {
    if (!window.confirm(`¿Eliminar la categoría "${c.nombre_categoria}"?`)) return;
    setError(''); setMensaje('');
    try { await api.delete(`categorias/${c.id_categoria}/`); setMensaje('Categoría eliminada correctamente.'); await cargar(); }
    catch (err) { setError(errorTexto(err)); }
  };
  const nombrePadre = (id: number | null) => id ? categorias.find(c => c.id_categoria === id)?.nombre_categoria || 'No encontrada' : 'Principal';

  return <section className="mx-auto w-full max-w-6xl">
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-yellow-400 sm:text-3xl">ADMINISTRAR CATEGORÍAS</h1><p className="mt-1 text-sm text-gray-400">Organiza los productos mediante categorías y subcategorías.</p></div>
      <button type="button" onClick={onVolver} className={secondary}>Volver</button>
    </header>
    {mensaje && <div role="status" className="mb-4 rounded border border-green-700 bg-green-950/50 p-3 text-green-300">{mensaje}</div>}
    {error && <div role="alert" className="mb-4 rounded border border-red-700 bg-red-950/50 p-3 text-red-300">{error}</div>}
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-gray-400">Categorías registradas: {categorias.length}</p><button type="button" onClick={nueva} className={primary}>+ Nueva categoría</button></div>
    {formulario && <form onSubmit={guardar} className="mb-6 rounded-lg border border-gray-700 bg-gray-900 p-4 sm:p-5">
      <h2 className="mb-4 text-lg font-bold">{editando ? 'EDITAR CATEGORÍA' : 'NUEVA CATEGORÍA'}</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="text-sm text-gray-300">Nombre de categoría *<input className={`${inputClass} mt-1`} value={nombre} onChange={e => setNombre(e.target.value)} maxLength={100} required placeholder="Ej. Suplementos" /></label>
        <label className="text-sm text-gray-300">Categoría principal<select className={`${inputClass} mt-1`} value={padre} onChange={e => setPadre(e.target.value)}><option value="">Sin categoría padre (principal)</option>{opcionesPadre.map(c => <option key={c.id_categoria} value={c.id_categoria}>{c.nombre_categoria}</option>)}</select></label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2"><button type="submit" disabled={guardando} className={primary}>{guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear categoría'}</button><button type="button" onClick={cerrarFormulario} disabled={guardando} className={secondary}>Cancelar</button></div>
    </form>}
    <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-900">
      {cargando ? <p className="p-6 text-center text-gray-400">Cargando categorías...</p> : categorias.length === 0 ? <p className="p-6 text-center text-gray-400">Todavía no hay categorías registradas.</p> :
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-gray-800 text-yellow-400"><tr><th className="p-3">Nombre</th><th className="p-3">Tipo</th><th className="p-3">Categoría principal</th><th className="p-3">Acciones</th></tr></thead><tbody>
          {categorias.map(c => <tr key={c.id_categoria} className="border-t border-gray-800 hover:bg-gray-800/60"><td className="p-3 font-medium">{c.nombre_categoria}</td><td className="p-3">{c.id_subcategoria ? 'Subcategoría' : 'Principal'}</td><td className="p-3">{nombrePadre(c.id_subcategoria)}</td><td className="p-3"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => editar(c)} className="rounded border border-yellow-600 px-3 py-1 text-yellow-300 hover:bg-yellow-600/20">Editar</button><button type="button" onClick={() => void eliminar(c)} className="rounded border border-red-700 px-3 py-1 text-red-300 hover:bg-red-700/20">Eliminar</button></div></td></tr>)}
        </tbody></table></div>}
    </div>
  </section>;
}
