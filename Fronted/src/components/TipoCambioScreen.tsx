import React, { useCallback, useEffect, useState } from 'react';

const API_URL = (
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api'
).replace(/\/+$/, '');

type ConfiguracionTipoCambio = {
  clave: string;
  valor: string;
  fecha_actualizacion: string | null;
  configurado?: boolean;
};

type Props = { onVolver: () => void };

export default function TipoCambioScreen({ onVolver }: Props) {
  const [configuracion, setConfiguracion] = useState<ConfiguracionTipoCambio | null>(null);
  const [valor, setValor] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const token = localStorage.getItem('access_token');

  const cargarConfiguracion = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/configuracion/tipo-cambio/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || data.error || 'No se pudo consultar el tipo de cambio.');
      }
      setConfiguracion(data);
      setValor(data.valor && Number(data.valor) > 0 ? String(data.valor) : '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al conectar con el servidor.');
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => { void cargarConfiguracion(); }, [cargarConfiguracion]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMensaje('');
    const numero = Number(valor.replace(',', '.'));
    if (!Number.isFinite(numero) || numero <= 0) {
      setError('Ingresa un tipo de cambio mayor que cero.');
      return;
    }
    setGuardando(true);
    try {
      const response = await fetch(`${API_URL}/configuracion/tipo-cambio/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ valor: numero.toFixed(4) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || data.error || 'No se pudo guardar el tipo de cambio.');
      }
      setConfiguracion(data);
      setValor(data.valor);
      setMensaje(data.mensaje || 'Tipo de cambio actualizado correctamente.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar la configuración.');
    } finally {
      setGuardando(false);
    }
  };

  const fecha = configuracion?.fecha_actualizacion
    ? new Date(configuracion.fecha_actualizacion).toLocaleString('es-BO')
    : 'Todavía no actualizado';

  return (
    <section className="mx-auto max-w-3xl rounded-xl border border-gray-700 bg-gray-900 p-5 text-white shadow-lg">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-widest text-yellow-400">CONFIGURACIÓN</p>
          <h1 className="mt-1 text-2xl font-bold">Tipo de cambio</h1>
          <p className="mt-1 text-sm text-gray-400">Define cuántos bolivianos equivalen a un dólar estadounidense.</p>
        </div>
        <button type="button" onClick={onVolver} className="rounded-lg border border-gray-600 px-4 py-2 text-sm hover:bg-gray-800">
          Volver
        </button>
      </div>

      {cargando ? (
        <p className="text-gray-300">Cargando configuración...</p>
      ) : (
        <>
          <div className="mb-5 rounded-lg border border-gray-700 bg-gray-800 p-4">
            <p className="text-sm text-gray-400">Tipo de cambio vigente</p>
            <p className="mt-1 text-3xl font-bold text-yellow-400">
              {configuracion && Number(configuracion.valor) > 0
                ? `${Number(configuracion.valor).toFixed(4)} Bs/USD`
                : 'Sin configurar'}
            </p>
            <p className="mt-2 text-xs text-gray-500">Última actualización: {fecha}</p>
          </div>

          <form onSubmit={guardar} className="space-y-4">
            <div>
              <label htmlFor="tipo-cambio" className="mb-2 block text-sm font-medium">Nuevo tipo de cambio (Bs por USD)</label>
              <input
                id="tipo-cambio"
                type="number"
                min="0.0001"
                max="999999.9999"
                step="0.0001"
                inputMode="decimal"
                required
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="Ej. 10.5000"
                className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white outline-none focus:border-yellow-400"
              />
              <p className="mt-2 text-xs text-gray-400">El valor se actualiza en el mismo registro. Los pagos anteriores conservan la tasa que utilizaron.</p>
            </div>

            {error && <p role="alert" className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">{error}</p>}
            {mensaje && <p role="status" className="rounded-lg border border-green-800 bg-green-950/40 p-3 text-sm text-green-300">{mensaje}</p>}

            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={guardando || !valor.trim()} className="rounded-lg bg-yellow-400 px-5 py-3 font-bold text-black hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50">
                {guardando ? 'Guardando...' : 'Guardar tipo de cambio'}
              </button>
              <button type="button" onClick={() => void cargarConfiguracion()} disabled={guardando} className="rounded-lg border border-gray-600 px-5 py-3 hover:bg-gray-800 disabled:opacity-50">
                Recargar
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
