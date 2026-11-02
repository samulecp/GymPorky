import React, { useCallback, useEffect, useState } from "react";
import api from "../services/api";
type Caja = {
  id_caja: number;
  responsable: number | null;
  responsable_nombre: string | null;
  turno: number | null;
  turno_nombre: string | null;
  fecha_apertura: string;
  fecha_cierre: string | null;
  monto_inicial: string;
  efectivo_contado: string | null;
  diferencia: string | null;
  estado: string;
};
type Resumen = {
  caja: Caja;
  ventas_efectivo: string;
  ventas_transferencia: string;
  egresos: string;
  efectivo_esperado: string;
  egresos_detalle: any[];
};
type Props = { onVolver: () => void };
const inp =
  "mt-1 w-full rounded border border-gray-600 bg-gray-800 p-2 text-white";
const btn =
  "rounded bg-yellow-500 px-4 py-2 font-semibold text-black disabled:opacity-50";
const sec = "rounded border border-gray-600 px-4 py-2 text-white";
const fmt = (v: any) => Number(v || 0).toFixed(2);
function err(e: any) {
  const d = e?.response?.data;
  return (
    d?.detail ||
    Object.entries(d || {})
      .map(([k, v]) => `${k}: ${v}`)
      .join(" | ") ||
    "Error de conexión."
  );
}
export default function CajaScreen({ onVolver }: Props) {
  const usuario = (() => {
    try {
      return JSON.parse(localStorage.getItem("usuario") || "{}");
    } catch {
      return {};
    }
  })();
  const [abierta, setAbierta] = useState<Caja | null>(null),
    [historial, setHistorial] = useState<Caja[]>([]),
    [resumen, setResumen] = useState<Resumen | null>(null),
    [turnos, setTurnos] = useState<any[]>([]);
  const [cajaConsultada, setCajaConsultada] = useState<number | null>(null);
  const [resumenHistorico, setResumenHistorico] = useState<Resumen | null>(
    null,
  );
  const [consultando, setConsultando] = useState(false);
  const [fondo, setFondo] = useState("0"),
    [turno, setTurno] = useState(""),
    [contado, setContado] = useState(""),
    [concepto, setConcepto] = useState(""),
    [monto, setMonto] = useState(""),
    [observacion, setObservacion] = useState(""),
    [error, setError] = useState(""),
    [ok, setOk] = useState(""),
    [busy, setBusy] = useState(false);
  const cargar = useCallback(async () => {
    setError("");
    try {
      const [c, t] = await Promise.all([api.get("caja/"), api.get("turnos/")]);
      setAbierta(c.data.abierta);
      setHistorial(c.data.historial || []);
      setTurnos(Array.isArray(t.data) ? t.data : t.data.results || []);
      if (c.data.abierta) {
        const r = await api.get(`caja/${c.data.abierta.id_caja}/resumen/`);
        setResumen(r.data);
      } else setResumen(null);
    } catch (e) {
      setError(err(e));
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);
  const consultarEgresos = async (id: number) => {
    setConsultando(true);
    setError("");
    setCajaConsultada(id);
    setResumenHistorico(null);
    try {
      const r = await api.get(`caja/${id}/resumen/`);
      setResumenHistorico(r.data);
    } catch (e) {
      setError(err(e));
    } finally {
      setConsultando(false);
    }
  };
  const soyResponsable = !!abierta && abierta.responsable === usuario.id;
  const abrir = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("caja/abrir/", {
        monto_inicial: Number(fondo),
        turno: turno ? Number(turno) : null,
      });
      setOk("Caja abierta correctamente.");
      await cargar();
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  };
  const egreso = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("caja/egresos/", {
        concepto,
        monto: Number(monto),
        observacion,
      });
      setConcepto("");
      setMonto("");
      setObservacion("");
      setOk("Egreso registrado.");
      await cargar();
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  };
  const cerrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!abierta) return;
    setBusy(true);
    setError("");
    try {
      const r = await api.post(`caja/${abierta.id_caja}/cerrar/`, {
        efectivo_contado: Number(contado),
      });
      setOk(`Caja cerrada. Diferencia: Bs ${fmt(r.data.diferencia)}`);
      setContado("");
      await cargar();
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-6xl space-y-5 text-white">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-yellow-400">CICLO 3 · CU10</p>
          <h1 className="text-2xl font-bold">Arqueo y cierre de caja</h1>
          <p className="text-sm text-gray-400">
            Una sola caja abierta para todo PorkyGym.
          </p>
        </div>
        <button className={sec} onClick={onVolver}>
          VOLVER
        </button>
      </header>
      {error && (
        <p className="rounded border border-red-700 bg-red-950 p-3 text-red-200">
          {error}
        </p>
      )}
      {ok && (
        <p className="rounded border border-green-700 bg-green-950 p-3 text-green-200">
          {ok}
        </p>
      )}
      {!abierta ? (
        <form
          onSubmit={abrir}
          className="rounded-lg border border-gray-700 bg-gray-900 p-4 space-y-3"
        >
          <h2 className="text-lg font-semibold">Abrir caja</h2>
          <p className="text-sm text-gray-400">
            No existe una caja abierta actualmente.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Fondo inicial (Bs)
              <input
                className={inp}
                type="number"
                min="0"
                step="0.01"
                required
                value={fondo}
                onChange={(e) => setFondo(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Turno
              <select
                className={inp}
                value={turno}
                onChange={(e) => setTurno(e.target.value)}
              >
                <option value="">Sin turno asignado</option>
                {turnos.map((t) => (
                  <option key={t.id_turno} value={t.id_turno}>
                    {t.nombre_turno} ({t.hora_inicio}–{t.hora_fin})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            className={btn}
            disabled={
              busy || !(usuario.es_administrador || usuario.es_recepcionista)
            }
          >
            {busy ? "PROCESANDO..." : "ABRIR CAJA"}
          </button>
          {!(usuario.es_administrador || usuario.es_recepcionista) && (
            <p className="text-sm text-yellow-300">
              Tu rol no permite abrir caja.
            </p>
          )}
        </form>
      ) : (
        <>
          <section className="rounded-lg border border-gray-700 bg-gray-900 p-4 space-y-3">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <span className="text-green-400 text-sm font-bold">
                  CAJA ABIERTA #{abierta.id_caja}
                </span>
                <h2 className="text-xl font-semibold">
                  Responsable: {abierta.responsable_nombre || "Sin asignar"}
                </h2>
                <p className="text-sm text-gray-400">
                  Turno: {abierta.turno_nombre || "No especificado"} · Apertura:{" "}
                  {new Date(abierta.fecha_apertura).toLocaleString()}
                </p>
              </div>
              <span className="h-fit rounded bg-green-950 px-3 py-1 text-green-300">
                ABIERTA
              </span>
            </div>
            {!soyResponsable && (
              <p className="rounded border border-yellow-800 bg-yellow-950 p-3 text-yellow-200">
                Esta caja pertenece a otro usuario. Puedes consultar su estado,
                pero no registrar ventas ni egresos ni cerrarla.
              </p>
            )}
          </section>
          {resumen && (
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Fondo inicial", resumen.caja.monto_inicial],
                ["Ventas efectivo", resumen.ventas_efectivo],
                ["Ventas transferencia", resumen.ventas_transferencia],
                ["Egresos", resumen.egresos],
                ["Efectivo esperado", resumen.efectivo_esperado],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="rounded border border-gray-700 bg-gray-900 p-4"
                >
                  <p className="text-sm text-gray-400">{k}</p>
                  <p className="text-xl font-bold">Bs {fmt(v)}</p>
                </div>
              ))}
            </section>
          )}
          {soyResponsable && (
            <>
              <form
                onSubmit={egreso}
                className="rounded-lg border border-gray-700 bg-gray-900 p-4 space-y-3"
              >
                <h2 className="font-semibold">Registrar egreso de caja</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    Concepto
                    <input
                      className={inp}
                      required
                      maxLength={180}
                      value={concepto}
                      onChange={(e) => setConcepto(e.target.value)}
                    />
                  </label>
                  <label className="text-sm">
                    Monto (Bs)
                    <input
                      className={inp}
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={monto}
                      onChange={(e) => setMonto(e.target.value)}
                    />
                  </label>
                </div>
                <label className="block text-sm">
                  Observación (opcional)
                  <textarea
                    className={inp}
                    value={observacion}
                    onChange={(e) => setObservacion(e.target.value)}
                  />
                </label>
                <button className={btn} disabled={busy}>
                  REGISTRAR EGRESO
                </button>
              </form>
              <form
                onSubmit={cerrar}
                className="rounded-lg border border-gray-700 bg-gray-900 p-4 space-y-3"
              >
                <h2 className="font-semibold">Arqueo y cierre</h2>
                <p className="text-sm text-gray-400">
                  Efectivo esperado:{" "}
                  <strong className="text-white">
                    Bs {fmt(resumen?.efectivo_esperado)}
                  </strong>
                  . Las transferencias no forman parte del efectivo físico.
                </p>
                <label className="block text-sm">
                  Efectivo contado (Bs)
                  <input
                    className={inp}
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={contado}
                    onChange={(e) => setContado(e.target.value)}
                  />
                </label>
                <button
                  className="rounded bg-red-600 px-4 py-2 font-semibold text-white"
                  disabled={busy}
                >
                  CERRAR CAJA
                </button>
              </form>
            </>
          )}
        </>
      )}
      <section className="rounded-lg border border-gray-700 bg-gray-900 p-4">
        <h2 className="mb-3 font-semibold">Historial de cajas</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead className="text-gray-400">
              <tr>
                <th className="p-2">Caja</th>
                <th className="p-2">Responsable</th>
                <th className="p-2">Apertura</th>
                <th className="p-2">Cierre</th>
                <th className="p-2">Estado</th>
                <th className="p-2">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {historial.map((c) => (
                <tr
                  key={c.id_caja}
                  onClick={() => void consultarEgresos(c.id_caja)}
                  className={`border-t border-gray-700 cursor-pointer hover:bg-gray-800 ${
                    cajaConsultada === c.id_caja
                      ? "bg-gray-800 border-yellow-500"
                      : ""
                  }`}
                >
                  <td className="p-2 font-semibold text-yellow-400">
                    #{c.id_caja} · Ver egresos
                  </td>
                  <td className="p-2">{c.responsable_nombre || "—"}</td>
                  <td className="p-2">
                    {new Date(c.fecha_apertura).toLocaleString()}
                  </td>
                  <td className="p-2">
                    {c.fecha_cierre
                      ? new Date(c.fecha_cierre).toLocaleString()
                      : "—"}
                  </td>
                  <td className="p-2">{c.estado}</td>
                  <td className="p-2">
                    {c.diferencia === null ? "—" : `Bs ${fmt(c.diferencia)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
            {cajaConsultada !== null && (
        <section className="rounded-lg border border-gray-700 bg-gray-900 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">
              Egresos de la caja #{cajaConsultada}
            </h2>

            <button
              type="button"
              className={sec}
              onClick={() => {
                setCajaConsultada(null);
                setResumenHistorico(null);
              }}
            >
              CERRAR
            </button>
          </div>

          {consultando ? (
            <p className="text-gray-400">Consultando egresos...</p>
          ) : resumenHistorico ? (
            <>
              <p className="text-yellow-400 font-semibold">
                Total de egresos: Bs {fmt(resumenHistorico.egresos)}
              </p>

              {resumenHistorico.egresos_detalle.length === 0 ? (
                <p className="text-gray-400">
                  Esta caja no tiene egresos registrados.
                </p>
              ) : (
                <div className="space-y-3">
                  {resumenHistorico.egresos_detalle.map((e: any) => (
                    <article
                      key={e.id_egreso}
                      className="rounded border border-gray-700 p-3"
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <strong>{e.concepto}</strong>
                        <strong className="text-yellow-400">
                          Bs {fmt(e.monto)}
                        </strong>
                      </div>

                      <p className="mt-1 text-sm text-gray-400">
                        Fecha: {new Date(e.fecha_hora).toLocaleString()}
                      </p>

                      <p className="text-sm text-gray-400">
                        Registrado por: {e.usuario_nombre || "—"}
                      </p>

                      <p className="mt-2 text-sm">
                        {e.observacion || "Sin observaciones adicionales."}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </section>
      )}
    </div>
  );
}