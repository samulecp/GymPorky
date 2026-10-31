import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';

type Categoria = { id_categoria: number; nombre_categoria: string; id_subcategoria: number | null };
type Producto = {
  id_producto: number;
  id_categoria: number;
  nombre_producto: string;
  moneda_origen: string;
  precio_base_original: string | number;
  precio_venta_local: string | number;
  costo_promedio_local: string | number;
  stock_actual: number;
  stock_minimo: number;
  stock_maximo: number | null;
  clasificacion_abc: string | null;
  estado: string;
};
type Props = { onVolver: () => void };
type Formulario = {
  id_categoria: string;
  nombre_producto: string;
  moneda_origen: string;
  precio_base_original: string;
  precio_venta_local: string;
  stock_minimo: string;
  stock_maximo: string;
  clasificacion_abc: string;
  estado: string;
};

const inputClass = 'mt-1 w-full rounded border border-gray-700 bg-gray-800 p-2 text-white outline-none focus:border-yellow-500';
const primary = 'rounded bg-yellow-500 px-4 py-2 font-bold text-black hover:bg-yellow-400 disabled:opacity-50';
const secondary = 'rounded border border-gray-600 px-4 py-2 text-white hover:bg-gray-700 disabled:opacity-50';
const vacio: Formulario = { id_categoria: '', nombre_producto: '', moneda_origen: 'BOB', precio_base_original: '0', precio_venta_local: '0', stock_minimo: '0', stock_maximo: '', clasificacion_abc: '', estado: 'Activo' };

function errorTexto(error: any): string {
  const data = error?.response?.data;
  if (!data) return 'No se pudo conectar con Django. Comprueba que el servidor esté activo.';
  if (typeof data.detail === 'string') return data.detail;
  if (typeof data === 'object') return Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`).join(' | ');
  return 'Ocurrió un error al procesar la solicitud.';
}
function lista<T>(data: any): T[] { return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : []; }
function moneda(value: string | number, currency = 'BOB') {
  const n = Number(value || 0);
  return `${currency} ${n.toFixed(2)}`;
}

export default function ProductosScreen({ onVolver }: Props) {
  const usuario = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('usuario') || '{}'); } catch { return {}; }
  }, []);
  const esAdmin = Boolean(usuario.es_administrador);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [editando, setEditando] = useState<Producto | null>(null);
  const [form, setForm] = useState<Formulario>(vacio);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('Todos');

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const rp = await api.get('productos/');
      setProductos(lista<Producto>(rp.data));
      // Categorías solo son consultables por el administrador en CU11.
      // Recepción puede consultar productos y verá el identificador de categoría.
      if (esAdmin) {
        const rc = await api.get('categorias/');
        setCategorias(lista<Categoria>(rc.data));
      } else {
        setCategorias([]);
      }
    } catch (e) { setError(errorTexto(e)); }
    finally { setCargando(false); }
  }, [esAdmin]);
  useEffect(() => { void cargar(); }, [cargar]);

  const visibles = useMemo(() => productos.filter(p => {
    const coincideTexto = p.nombre_producto.toLowerCase().includes(busqueda.trim().toLowerCase());
    const coincideEstado = filtroEstado === 'Todos' || p.estado === filtroEstado;
    return coincideTexto && coincideEstado;
  }), [productos, busqueda, filtroEstado]);

  const abrirNuevo = () => { setError(''); setMensaje(''); setEditando(null); setForm(vacio); setMostrarFormulario(true); };
  const abrirEdicion = (p: Producto) => {
    setError(''); setMensaje(''); setEditando(p);
    setForm({ id_categoria: String(p.id_categoria), nombre_producto: p.nombre_producto, moneda_origen: p.moneda_origen, precio_base_original: String(p.precio_base_original), precio_venta_local: String(p.precio_venta_local), stock_minimo: String(p.stock_minimo), stock_maximo: p.stock_maximo == null ? '' : String(p.stock_maximo), clasificacion_abc: p.clasificacion_abc || '', estado: p.estado });
    setMostrarFormulario(true);
  };
  const cerrar = () => { setMostrarFormulario(false); setEditando(null); setForm(vacio); };
  const cambiar = (campo: keyof Formulario, valor: string) => setForm(actual => ({ ...actual, [campo]: valor }));

  const guardar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError(''); setMensaje('');
    if (!form.nombre_producto.trim() || !form.id_categoria) { setError('El nombre y la categoría son obligatorios.'); return; }
    if (Number(form.precio_base_original) < 0 || Number(form.precio_venta_local) < 0 || Number(form.stock_minimo) < 0 || (form.stock_maximo !== '' && Number(form.stock_maximo) < Number(form.stock_minimo))) { setError('Revisa los precios y los límites de stock. El máximo no puede ser menor que el mínimo.'); return; }
    const datos = {
      id_categoria: Number(form.id_categoria), nombre_producto: form.nombre_producto.trim(),
      moneda_origen: form.moneda_origen.trim().toUpperCase(), precio_base_original: form.precio_base_original,
      precio_venta_local: form.precio_venta_local, stock_minimo: Number(form.stock_minimo),
      stock_maximo: form.stock_maximo === '' ? null : Number(form.stock_maximo),
      clasificacion_abc: form.clasificacion_abc || null, estado: form.estado,
    };
    setGuardando(true);
    try {
      if (editando) { await api.patch(`productos/${editando.id_producto}/`, datos); setMensaje('Producto actualizado correctamente.'); }
      else { await api.post('productos/', datos); setMensaje('Producto registrado correctamente.'); }
      cerrar(); await cargar();
    } catch (err) { setError(errorTexto(err)); }
    finally { setGuardando(false); }
  };
  const eliminar = async (p: Producto) => {
    if (!window.confirm(`¿Eliminar el producto "${p.nombre_producto}"? Si tiene historial, el sistema impedirá eliminarlo.`)) return;
    setError(''); setMensaje('');
    try { await api.delete(`productos/${p.id_producto}/`); setMensaje('Producto eliminado correctamente.'); await cargar(); }
    catch (err) { setError(errorTexto(err)); }
  };
  const nombreCategoria = (id: number) => categorias.find(c => c.id_categoria === id)?.nombre_categoria || `Categoría #${id}`;

  return <section className="mx-auto w-full max-w-7xl">
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-yellow-400 sm:text-3xl">CATÁLOGO DE PRODUCTOS</h1><p className="mt-1 text-sm text-gray-400">Administra los productos comerciales y consulta sus existencias.</p></div>
      <button type="button" onClick={onVolver} className={secondary}>Volver</button>
    </header>
    {mensaje && <div role="status" className="mb-4 rounded border border-green-700 bg-green-950/50 p-3 text-green-300">{mensaje}</div>}
    {error && <div role="alert" className="mb-4 rounded border border-red-700 bg-red-950/50 p-3 text-red-300">{error}</div>}
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-sm text-gray-300">Buscar producto<input className={inputClass} value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Nombre del producto" /></label>
      <label className="text-sm text-gray-300">Estado<select className={inputClass} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}><option>Todos</option><option>Activo</option><option>Inactivo</option></select></label>
      <div className="flex items-end">{esAdmin && <button type="button" onClick={abrirNuevo} className={`${primary} w-full sm:w-auto`}>+ Nuevo producto</button>}</div>
    </div>
    {mostrarFormulario && esAdmin && <form onSubmit={guardar} className="mb-6 rounded-lg border border-gray-700 bg-gray-900 p-4 sm:p-5">
      <h2 className="mb-4 text-lg font-bold">{editando ? 'EDITAR PRODUCTO' : 'REGISTRAR PRODUCTO'}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm text-gray-300">Nombre del producto *<input className={inputClass} value={form.nombre_producto} onChange={e => cambiar('nombre_producto', e.target.value)} maxLength={150} required /></label>
        <label className="text-sm text-gray-300">Categoría *<select className={inputClass} value={form.id_categoria} onChange={e => cambiar('id_categoria', e.target.value)} required><option value="">Seleccionar categoría</option>{categorias.map(c => <option key={c.id_categoria} value={c.id_categoria}>{c.nombre_categoria}</option>)}</select></label>
        <label className="text-sm text-gray-300">Moneda de origen<input className={inputClass} value={form.moneda_origen} onChange={e => cambiar('moneda_origen', e.target.value)} maxLength={10} required placeholder="BOB, USD, etc." /></label>
        <label className="text-sm text-gray-300">Precio base de origen<input className={inputClass} type="number" min="0" step="0.01" value={form.precio_base_original} onChange={e => cambiar('precio_base_original', e.target.value)} required /></label>
        <label className="text-sm text-gray-300">Precio de venta local (Bs)<input className={inputClass} type="number" min="0" step="0.01" value={form.precio_venta_local} onChange={e => cambiar('precio_venta_local', e.target.value)} required /></label>
        <label className="text-sm text-gray-300">Clasificación ABC<select className={inputClass} value={form.clasificacion_abc} onChange={e => cambiar('clasificacion_abc', e.target.value)}><option value="">Sin clasificación</option><option value="A">A</option><option value="B">B</option><option value="C">C</option></select></label>
        <label className="text-sm text-gray-300">Stock mínimo<input className={inputClass} type="number" min="0" step="1" value={form.stock_minimo} onChange={e => cambiar('stock_minimo', e.target.value)} required /></label>
        <label className="text-sm text-gray-300">Stock máximo (opcional)<input className={inputClass} type="number" min="0" step="1" value={form.stock_maximo} onChange={e => cambiar('stock_maximo', e.target.value)} placeholder="Sin límite definido" /></label>
        <label className="text-sm text-gray-300">Estado<select className={inputClass} value={form.estado} onChange={e => cambiar('estado', e.target.value)}><option value="Activo">Activo</option><option value="Inactivo">Inactivo</option></select></label>
      </div>
      <p className="mt-4 rounded border border-blue-900 bg-blue-950/40 p-3 text-xs text-blue-200">El stock actual y el costo promedio son de solo lectura. Se actualizarán mediante compras, ventas y movimientos de Kardex.</p>
      <div className="mt-4 flex flex-wrap gap-2"><button type="submit" disabled={guardando} className={primary}>{guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Registrar producto'}</button><button type="button" onClick={cerrar} disabled={guardando} className={secondary}>Cancelar</button></div>
    </form>}
    <div className="mb-3 flex flex-wrap justify-between gap-2 text-sm text-gray-400"><span>Productos registrados: {productos.length}</span><span>Mostrando: {visibles.length}</span></div>
    <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-900">
      {cargando ? <p className="p-6 text-center text-gray-400">Cargando productos...</p> : visibles.length === 0 ? <p className="p-6 text-center text-gray-400">No se encontraron productos.</p> :
        <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-gray-800 text-yellow-400"><tr><th className="p-3">Producto</th><th className="p-3">Categoría</th><th className="p-3">Precio de venta</th><th className="p-3">Stock actual</th><th className="p-3">Mínimo / Máximo</th><th className="p-3">ABC</th><th className="p-3">Estado</th>{esAdmin && <th className="p-3">Acciones</th>}</tr></thead><tbody>
          {visibles.map(p => <tr key={p.id_producto} className="border-t border-gray-800 hover:bg-gray-800/60"><td className="p-3 font-medium">{p.nombre_producto}<div className="text-xs text-gray-500">ID: {p.id_producto}</div></td><td className="p-3">{nombreCategoria(p.id_categoria)}</td><td className="p-3">{moneda(p.precio_venta_local)}</td><td className="p-3 tabular-nums">{p.stock_actual}</td><td className="p-3 tabular-nums">{p.stock_minimo} / {p.stock_maximo ?? '—'}</td><td className="p-3">{p.clasificacion_abc || '—'}</td><td className="p-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${p.estado === 'Activo' ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-300'}`}>{p.estado}</span></td>{esAdmin && <td className="p-3"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => abrirEdicion(p)} className="rounded border border-yellow-600 px-3 py-1 text-yellow-300 hover:bg-yellow-600/20">Editar</button><button type="button" onClick={() => void eliminar(p)} className="rounded border border-red-700 px-3 py-1 text-red-300 hover:bg-red-700/20">Eliminar</button></div></td>}</tr>)}
        </tbody></table></div>}
    </div>
    <p className="mt-3 text-xs text-gray-500">Los productos inactivos también se muestran y pueden consultarse usando el filtro de estado.</p>
  </section>;
}
