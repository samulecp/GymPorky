import React, { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import EntrenamientoScreen from './components/EntrenamientoScreen';
import EntrenadoresScreen from './components/EntrenadoresScreen';
import CategoriasScreen from './components/CategoriasScreen';
import ProductosScreen from './components/ProductosScreen';
import ProveedoresScreen from './components/ProveedoresScreen';
import ComprasScreen from './components/ComprasScreen';
import VentasPOSScreen from './components/VentasPOSScreen';
import HistorialVentasScreen from './components/HistorialVentasScreen';
import KardexScreen from './components/KardexScreen';
import AlertasScreen from './components/AlertasScreen';
import TipoCambioScreen from './components/TipoCambioScreen';
import CajaScreen from './components/CajaScreen';
import MetodosPagoScreen from './components/MetodosPagoScreen';
import {
  iniciarActividad,
  iniciarSesionInactividad,
  limpiarSesion,
} from './services/sesion';

// URL base del backend Django
const API_URL = (
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api'
).replace(/\/+$/, '');

interface UsuarioActual {
  id: number;
  username: string;
  email?: string;
  estado_cuenta: string;

  es_socio: boolean;
  es_entrenador: boolean;
  es_recepcionista: boolean;
  es_administrador: boolean;

  is_superuser: boolean;
}

// ============================================================
// 1. Función para validar la seguridad de la contraseña
//    (se aplica SOLO al registrarse o al elegir una NUEVA contraseña)
// ============================================================
export const validarPassword = (password: string): boolean => {
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&._-])[A-Za-z\d@$!%*?&._-]{8,}$/;
  return regex.test(password);
};

// ============================================================
// Estilos compartidos
// ============================================================
const inputCls =
  'w-full p-2 bg-gray-800 text-white rounded border border-gray-700 focus:border-yellow-500 outline-none';
const btnCls =
  'w-full bg-yellow-500 text-black font-bold p-3 rounded hover:bg-yellow-400 mt-2 uppercase tracking-wide transition-colors';
const linkCls =
  'text-yellow-400 hover:text-white transition-colors underline';

const Tarjeta = ({ children, titulo }: { children: React.ReactNode; titulo: string }) => (
  <div className="max-w-md mx-auto mt-10 p-6 bg-gray-900 text-white rounded-lg shadow-lg max-h-[90vh] overflow-y-auto">
    <h2 className="text-2xl font-bold mb-4 text-center">{titulo}</h2>
    {children}
  </div>
);

const Alerta = ({ tipo, children }: { tipo: 'error' | 'ok'; children: React.ReactNode }) => (
  <div
    className={
      tipo === 'ok'
        ? 'text-green-400 text-sm mb-2'
        : 'text-red-400 text-sm mb-2'
    }
  >
    {children}
  </div>
);

const mensajeDeError = (data: any): string => {
  if (!data) return 'Error del servidor.';
  if (typeof data === 'string') return data;
  if (data.detail) return data.detail;
  if (data.error) return Array.isArray(data.error) ? data.error.join('. ') : String(data.error);
  for (const key of Object.keys(data)) {
    const v = data[key];
    if (Array.isArray(v) && v.length > 0) return `${key}: ${v.join(', ')}`;
    if (typeof v === 'string' && v) return `${key}: ${v}`;
  }
  return 'Error del servidor.';
};

// ============================================================
// 2. Campo de contraseña con OJO para mostrar/ocultar
// ============================================================
interface PasswordInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
}

const PasswordInput: React.FC<PasswordInputProps> = ({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  required = true,
}) => {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="block text-sm mb-1">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={`${inputCls} pr-10`}
          required={required}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          title={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-yellow-400 cursor-pointer"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
};

// ============================================================
// 3. Barra de Navegación (solo visible si hay sesión)
// ============================================================
interface NavbarProps {
  pantallaActual: string;
  onGestionUsuarios: () => void;
  onBitacora: () => void;
  onRegistrarSocio: () => void;
  onEntrenadores: () => void;
  onPlanes: () => void;
  onCategorias: () => void;
  onProductos: () => void;
  onProveedores: () => void;
  onCompras: () => void;
  onVentas: () => void;
  onHistorialVentas: () => void;
  onKardex: () => void;
  onAlertas: () => void;
  onTipoCambio: () => void;
  onCaja: () => void;
  onMetodosPago: () => void;
  onRegistrarContrato: () => void;
  onEntrenamiento: () => void;
  onInicio: () => void;
}

export const Navbar = ({
  pantallaActual,
  onGestionUsuarios,
  onBitacora,
  onRegistrarSocio,
  onEntrenadores,
  onPlanes,
  onCategorias,
  onProductos,
  onProveedores,
  onCompras,
  onVentas,
  onHistorialVentas,
  onKardex,
  onAlertas,
  onTipoCambio,
  onCaja,
  onMetodosPago,
  onRegistrarContrato,
  onEntrenamiento,
  onInicio,
}: NavbarProps) => {
  const [menuUsuariosAbierto, setMenuUsuariosAbierto] = useState(false);
  const [menuMembresiasAbierto, setMenuMembresiasAbierto] = useState(false);

  const token = localStorage.getItem('access_token');
  const usuarioGuardado = localStorage.getItem('usuario');

  if (!token || !usuarioGuardado) return null;

  const usuario: UsuarioActual = JSON.parse(usuarioGuardado);

  const btnActivo = 'px-3 py-1 bg-yellow-500 text-black rounded font-bold';
  const btnInactivo = 'px-3 py-1 bg-gray-800 rounded text-white hover:bg-gray-700';

  return (
    <nav className="flex flex-wrap bg-black text-white p-2 gap-2">
      <button
        onClick={onInicio}
        className={pantallaActual === 'inicio' ? btnActivo : btnInactivo}
      >
        INICIO
      </button>

      {/* PAQUETE 1: SEGURIDAD, AUTENTICACIÓN Y AUDITORÍA */}

      {/* Menú desplegable: Gestión de usuarios + Agregar nuevo socio +
          Entrenadores. Visible para Administrador y Recepcionista. Cada opción
          conserva su propio permiso (Administrador ve las tres; Recepcionista
          solo el alta de socios). */}
      {(usuario.es_administrador || usuario.es_recepcionista) && (
        <div className="relative">
          <button
            onClick={() => setMenuUsuariosAbierto((abierto) => !abierto)}
            aria-expanded={menuUsuariosAbierto}
            className={`${
              pantallaActual === 'usuarios' ||
              pantallaActual === 'registrar-socio' ||
              pantallaActual === 'entrenadores'
                ? btnActivo
                : btnInactivo
            } flex items-center gap-1`}
          >
            GESTIÓN DE USUARIOS
            <span className="text-xs">{menuUsuariosAbierto ? '▲' : '▼'}</span>
          </button>

          {menuUsuariosAbierto && (
            <div className="absolute left-0 mt-1 z-20 min-w-max bg-gray-900 border border-gray-700 rounded shadow-lg flex flex-col">
              {/* CU01: Registrar Cuenta de Usuario — solo Administrador */}
              {usuario.es_administrador && (
                <button
                  onClick={() => {
                    onGestionUsuarios();
                    setMenuUsuariosAbierto(false);
                  }}
                  className={`text-left px-4 py-2 whitespace-nowrap hover:bg-gray-700 ${
                    pantallaActual === 'usuarios' ? 'text-yellow-400 font-bold' : 'text-white'
                  }`}
                >
                  Gestionar usuarios
                </button>
              )}

              {/* CU04: Registrar Expediente de Socio — Recepcionista, Administrador */}
              {(usuario.es_recepcionista || usuario.es_administrador) && (
                <button
                  onClick={() => {
                    onRegistrarSocio();
                    setMenuUsuariosAbierto(false);
                  }}
                  className={`text-left px-4 py-2 whitespace-nowrap hover:bg-gray-700 ${
                    pantallaActual === 'registrar-socio' ? 'text-yellow-400 font-bold' : 'text-white'
                  }`}
                >
                  Agregar nuevo socio
                </button>
              )}

              {/* CU20: Gestionar Perfil de Entrenador — solo Administrador.
                  Tercera opción del menú: abre el listado, alta y baja de
                  entrenadores (antes era una pestaña del módulo de
                  entrenamiento y una tarjeta de Gestión de usuarios). */}
              {usuario.es_administrador && (
                <button
                  onClick={() => {
                    onEntrenadores();
                    setMenuUsuariosAbierto(false);
                  }}
                  className={`text-left px-4 py-2 whitespace-nowrap hover:bg-gray-700 ${
                    pantallaActual === 'entrenadores' ? 'text-yellow-400 font-bold' : 'text-white'
                  }`}
                >
                  Entrenadores
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* CU03: Registrar Bitácora de Auditoría — solo Administrador */}
      {usuario.es_administrador && (
        <button
          onClick={onBitacora}
          className={pantallaActual === 'bitacora' ? btnActivo : btnInactivo}
        >
          BITÁCORA
        </button>
      )}

      {/* PAQUETE 2: GESTIÓN DE SOCIOS, MEMBRESÍAS Y CONTROL DE ACCESO */}

      {/* Menú desplegable «Membresías»: agrupa la gestión de planes (CU05,
          solo Administrador) y el registro de contratos (CU06, Administrador
          y Recepcionista). Cada opción conserva su propio permiso. */}
      {(usuario.es_administrador || usuario.es_recepcionista) && (
        <div className="relative">
          <button
            onClick={() => setMenuMembresiasAbierto((abierto) => !abierto)}
            aria-expanded={menuMembresiasAbierto}
            className={`${
              pantallaActual === 'planes' || pantallaActual === 'contrato'
                ? btnActivo
                : btnInactivo
            } flex items-center gap-1`}
          >
            MEMBRESÍAS
            <span className="text-xs">{menuMembresiasAbierto ? '▲' : '▼'}</span>
          </button>

          {menuMembresiasAbierto && (
            <div className="absolute left-0 mt-1 z-20 min-w-max bg-gray-900 border border-gray-700 rounded shadow-lg flex flex-col">
              {/* CU05: Administrar Planes de Membresía — solo Administrador */}
              {usuario.es_administrador && (
                <button
                  onClick={() => {
                    onPlanes();
                    setMenuMembresiasAbierto(false);
                  }}
                  className={`text-left px-4 py-2 whitespace-nowrap hover:bg-gray-700 ${
                    pantallaActual === 'planes' ? 'text-yellow-400 font-bold' : 'text-white'
                  }`}
                >
                  Gestionar planes de membresía
                </button>
              )}

              {/* CU06: Registrar Contrato de Membresía — Administrador y Recepcionista */}
              {(usuario.es_administrador || usuario.es_recepcionista) && (
                <button
                  onClick={() => {
                    onRegistrarContrato();
                    setMenuMembresiasAbierto(false);
                  }}
                  className={`text-left px-4 py-2 whitespace-nowrap hover:bg-gray-700 ${
                    pantallaActual === 'contrato' ? 'text-yellow-400 font-bold' : 'text-white'
                  }`}
                >
                  Registrar contrato de membresía
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* CU08: Punto de venta — administración y recepción */}
      {(usuario.es_administrador || usuario.es_recepcionista) && (
        <button onClick={onVentas} className={pantallaActual === 'ventas' ? btnActivo : btnInactivo}>
          PUNTO DE VENTA
        </button>
      )}

      {(usuario.es_administrador || usuario.es_recepcionista) && (
        <button onClick={onHistorialVentas} className={pantallaActual === 'historial-ventas' ? btnActivo : btnInactivo}>
          HISTORIAL DE VENTAS
        </button>
      )}

      {/* CU11: Administración de categorías — solo Administrador */}
      {usuario.es_administrador && (
        <button onClick={onCategorias} className={pantallaActual === 'categorias' ? btnActivo : btnInactivo}>
          CATEGORÍAS
        </button>
      )}

      {/* CU12: Catálogo comercial — administrador gestiona, recepción consulta */}
      {(usuario.es_administrador || usuario.es_recepcionista) && (
        <button onClick={onProductos} className={pantallaActual === 'productos' ? btnActivo : btnInactivo}>
          PRODUCTOS
        </button>
      )}

      {/* CU13: Proveedores — administrador gestiona, recepción consulta */}
      {(usuario.es_administrador || usuario.es_recepcionista) && (
        <button onClick={onProveedores} className={pantallaActual === 'proveedores' ? btnActivo : btnInactivo}>
          PROVEEDORES
        </button>
      )}

            {/* CU14, CU15 y CU16: Inventario — solo administrador */}
      {usuario.es_administrador && (
        <>
          <button
            onClick={onCompras}
            className={pantallaActual === 'compras' ? btnActivo : btnInactivo}
          >
            COMPRAS
          </button>

          <button
            onClick={onKardex}
            className={pantallaActual === 'kardex' ? btnActivo : btnInactivo}
          >
            KARDEX
          </button>

          <button
            onClick={onAlertas}
            className={pantallaActual === 'alertas' ? btnActivo : btnInactivo}
          >
            ALERTAS
          </button>
        </>
      )}

      {usuario.es_administrador && (
        <button onClick={onMetodosPago} className={pantallaActual === 'metodos-pago' ? btnActivo : btnInactivo}>MÉTODOS DE PAGO</button>
      )}

      {(usuario.es_administrador || usuario.es_recepcionista) && (
        <button onClick={onCaja} className={pantallaActual === 'caja' ? btnActivo : btnInactivo}>
          ARQUEO Y CAJA
        </button>
      )}

      {/* Configuración general: solo Administrador */}
      {usuario.es_administrador && (
        <button onClick={onTipoCambio} className={pantallaActual === 'configuracion' ? btnActivo : btnInactivo}>
          CONFIGURACIÓN
        </button>
      )}

      {/* PAQUETE 4: ENTRENAMIENTO (CU17–CU20)
          Ejercicios, rutinas, asignación a socios y perfil de entrenadores.
          El Socio también entra, pero en modo solo lectura (ve sus rutinas
          asignadas y el catálogo); el alta la controla el backend. */}
      <button
        onClick={onEntrenamiento}
        className={pantallaActual === 'entrenamiento' ? btnActivo : btnInactivo}
      >
        ENTRENAMIENTO
      </button>

      <button
        onClick={() => {
          // Cierre manual: también limpia la marca de inactividad.
          limpiarSesion();

          window.location.reload();
        }}
        className="bg-red-600 px-3 py-1 ml-auto rounded font-bold"
      >
        CERRAR SESIÓN
      </button>
    </nav>
  );
};

// ============================================================
// 4. Formulario de Login
//    (AQUÍ NO se exigen requisitos de contraseña: solo se verifica)
// ============================================================
interface LoginFormProps {
  mensajeInicio?: string;
  onIrARecuperar: () => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ mensajeInicio, onIrARecuperar }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);

    try {
      const response = await fetch(`${API_URL}/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('access_token', data.access);
        localStorage.setItem('refresh_token', data.refresh);

        localStorage.setItem(
          'usuario',
          JSON.stringify(data.usuario)
        );

        // Nuevo inicio de sesión: marca de actividad desde cero, para no
        // heredar el tiempo de una sesión anterior.
        iniciarActividad();

        window.location.reload();
      } else {
        setError(mensajeDeError(data));
      }
    } catch {
      setError('Error al conectar con el servidor de Django. Asegúrate de que está corriendo.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <Tarjeta titulo="Bienvenido a PorkyGym">
      {mensajeInicio && <Alerta tipo="ok">{mensajeInicio}</Alerta>}
      {error && <Alerta tipo="error">{error}</Alerta>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-sm mb-1">Usuario:</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={inputCls}
            autoComplete="username"
            required
          />
        </div>

        <PasswordInput
          id="login-password"
          label="Contraseña:"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />

        <div className="flex justify-between items-center mt-1">
          <button
            type="button"
            onClick={onIrARecuperar}
            className={linkCls}
          >
            ¿Olvidaste tu contraseña?
          </button>
        </div>

        <button type="submit" className={btnCls} disabled={cargando}>
          {cargando ? 'INGRESANDO...' : 'INGRESAR'}
        </button>
      </form>
    </Tarjeta>
  );
};

// ============================================================
// 5. Formulario de Registro
// ============================================================
interface RegistroFormProps {
  onRegistrado: (mensaje: string) => void;
  onVolver: () => void;
}

const RegistroForm: React.FC<RegistroFormProps> = ({ onRegistrado, onVolver }) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Requisitos de contraseña aplicados AL REGISTRARSE
    if (!validarPassword(password)) {
      setError(
        'La contraseña debe tener mínimo 8 caracteres, una mayúscula (A), una minúscula (a), un número (1) y un símbolo (@,*.#_-$).'
      );
      return;
    }
    if (password !== password2) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setCargando(true);
    try {
      const response = await fetch(`${API_URL}/auth/registro/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), email: email.trim(), password, password2 }),
      });
      const data = await response.json();

      if (response.ok) {
        onRegistrado('¡Registro exitoso! Ya puedes iniciar sesión.');
      } else {
        setError(mensajeDeError(data));
      }
    } catch {
      setError('Error al conectar con el servidor de Django. Asegúrate de que está corriendo.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <Tarjeta titulo="CREAR CUENTA">
      {error && <Alerta tipo="error">{error}</Alerta>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-sm mb-1">Usuario:</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={inputCls}
            autoComplete="username"
            required
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Correo electrónico:</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
            autoComplete="email"
            required
          />
        </div>

        <PasswordInput
          id="reg-password"
          label="Contraseña:"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />
        <PasswordInput
          id="reg-password2"
          label="Confirmar contraseña:"
          value={password2}
          onChange={setPassword2}
          autoComplete="new-password"
        />

        <button type="submit" className={btnCls} disabled={cargando}>
          {cargando ? 'REGISTRANDO...' : 'REGISTRARSE'}
        </button>
        <button type="button" onClick={onVolver} className="text-gray-400 text-sm hover:text-white">
          ← Volver al inicio de sesión
        </button>
      </form>
    </Tarjeta>
  );
};

// ============================================================
// 6. Formulario "Olvidé mi contraseña" (envía el correo vía Brevo)
// ============================================================
interface RecuperarFormProps {
  onEnviado: (mensaje: string) => void;
  onVolver: () => void;
}

const RecuperarForm: React.FC<RecuperarFormProps> = ({ onEnviado, onVolver }) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [debugLink, setDebugLink] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDebugLink(null);
    setCargando(true);

    try {
      const response = await fetch(`${API_URL}/auth/solicitar-reset/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await response.json();

      if (response.ok) {
        if (data.debug_link) {
          setDebugLink(data.debug_link);
        } else {
          onEnviado(data.mensaje || 'Revisa tu correo para continuar.');
        }
      } else {
        setError(mensajeDeError(data));
      }
    } catch {
      setError('Error al conectar con el servidor de Django. Asegúrate de que está corriendo.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <Tarjeta titulo="RECUPERAR CONTRASEÑA">
      {error && <Alerta tipo="error">{error}</Alerta>}
      {debugLink && (
        <Alerta tipo="ok">
          En modo desarrollo (sin BREVO_API_KEY) usa este enlace directo:
          <a href={debugLink} className="underline break-all">{debugLink}</a>
        </Alerta>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-gray-400">
          Escribe tu correo y te enviaremos un enlace para restablecer tu contraseña.
        </p>
        <div>
          <label className="block text-sm mb-1">Correo electrónico:</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
            autoComplete="email"
            required
          />
        </div>

        <button type="submit" className={btnCls} disabled={cargando}>
          {cargando ? 'ENVIANDO...' : 'ENVIAR ENLACE'}
        </button>
        <button type="button" onClick={onVolver} className="text-gray-400 text-sm hover:text-white">
          ← Volver al inicio de sesión
        </button>
      </form>
    </Tarjeta>
  );
};

// ============================================================
// 7. Formulario para elegir la NUEVA contraseña
//    (llega aquí desde el correo: /reset-password/uid/token/)
//    (AQUÍ se aplican los requisitos de seguridad)
// ============================================================
interface ResetPasswordFormProps {
  uid: string;
  token: string;
}

const ResetPasswordForm: React.FC<ResetPasswordFormProps> = ({ uid, token }) => {
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validarPassword(password)) {
      setError(
        'La contraseña debe tener mínimo 8 caracteres, una mayúscula (A), una minúscula (a), un número (1) y un símbolo (@,*.#_-$).'
      );
      return;
    }
    if (password !== password2) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setCargando(true);
    try {
      const response = await fetch(`${API_URL}/auth/confirmar-reset/${uid}/${token}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password_nueva: password, password_confirmacion: password2 }),
      });
      const data = await response.json();

      if (response.ok) {
        setOk(true);
      } else {
        setError(mensajeDeError(data));
      }
    } catch {
      setError('Error al conectar con el servidor de Django.');
    } finally {
      setCargando(false);
    }
  };

  if (ok) {
    return (
      <Tarjeta titulo="CONTRASEÑA RESTABLECIDA">
        <p className="text-green-400 text-sm mb-4">
          Tu contraseña fue actualizada con éxito. Ya puedes iniciar sesión.
        </p>
        <button onClick={() => (window.location.href = '/')} className={btnCls}>
          IR AL INICIO
        </button>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta titulo="NUEVA CONTRASEÑA">
      {error && <Alerta tipo="error">{error}</Alerta>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-gray-400">
          Elige una nueva contraseña con: mínimo 8 caracteres, una mayúscula, una minúscula, un número y un símbolo.
        </p>

        <PasswordInput
          id="reset-password"
          label="Nueva contraseña:"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />
        <PasswordInput
          id="reset-password2"
          label="Confirmar contraseña:"
          value={password2}
          onChange={setPassword2}
          autoComplete="new-password"
        />

        <button type="submit" className={btnCls} disabled={cargando}>
          {cargando ? 'GUARDANDO...' : 'GUARDAR NUEVA CONTRASEÑA'}
        </button>
      </form>
    </Tarjeta>
  );
};

// ============================================================
// 8. Puerta de autenticación: login / registro / recuperar
// ============================================================
const AuthGate = () => {
  const [modo, setModo] = useState<'login' | 'recuperar'>('login');
  const [mensajeLogin, setMensajeLogin] = useState('');

  return (
    <>
      {modo === 'login' && (
        <LoginForm
          mensajeInicio={mensajeLogin}
          onIrARecuperar={() => setModo('recuperar')}
        />
      )}
      {modo === 'recuperar' && (
        <RecuperarForm
          onEnviado={(m) => {
            setMensajeLogin(m);
            setModo('login');
          }}
          onVolver={() => setModo('login')}
        />
      )}
    </>
  );
};

// ============================================================
// 9. Componente Principal
// ============================================================

interface MembresiaResumen {
  estado: string;
  tiene_membresia: boolean;
  plan: string | null;
  fecha_inicio: string | null;
  fecha_vencimiento: string | null;
  dias_restantes: number | null;
}

interface UsuarioListado {
  id: number;
  username: string;
  email: string;
  estado_cuenta: string;
  es_socio: boolean;
  es_entrenador: boolean;
  es_recepcionista: boolean;
  es_administrador: boolean;
  membresia: MembresiaResumen | null;
}

const GestionUsuarios = ({ onVolver }: { onVolver: () => void }) => {
  const [usuarios, setUsuarios] = useState<UsuarioListado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [nuevoUsuario, setNuevoUsuario] = useState({
    username: '',
    email: '',
    password: '',
    password2: '',

    es_administrador: false,
    es_recepcionista: false,
    es_socio: false,
  });
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<
    'administradores' |
    'recepcionistas' |
    'entrenadores' |
    'socios' |
    'sin_rol' |
    null
  >(null);

  const [creando, setCreando] = useState(false);
  const [errorFormulario, setErrorFormulario] = useState('');
  const [mensajeFormulario, setMensajeFormulario] = useState('');
  const [usuarioEditando, setUsuarioEditando] =
    useState<UsuarioListado | null>(null);

  const [formEdicion, setFormEdicion] = useState({
    username: '',
    email: '',
    password: '',
    password2: '',

    es_administrador: false,
    es_recepcionista: false,
    es_socio: false,
  });

  const [errorEdicion, setErrorEdicion] = useState('');
  const [mensajeAccion, setMensajeAccion] = useState('');

  useEffect(() => {
    const cargarUsuarios = async () => {
      try {
        const token = localStorage.getItem('access_token');

        const response = await fetch(`${API_URL}/usuarios/`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('No se pudieron cargar los usuarios');
        }

        const data = await response.json();
        setUsuarios(data);
      } catch (error) {
        setError('Error al cargar los usuarios');
      } finally {
        setCargando(false);
      }
    };

    cargarUsuarios();
  }, []);

  const obtenerRoles = (usuario: UsuarioListado) => {
    const roles: string[] = [];

    if (usuario.es_administrador) roles.push('Administrador');
    if (usuario.es_recepcionista) roles.push('Recepcionista');
    if (usuario.es_entrenador) roles.push('Entrenador');
    if (usuario.es_socio) roles.push('Socio');

    return roles.length > 0 ? roles.join(', ') : 'Sin rol';
  };
  const usuariosFiltrados = () => {
    switch (categoriaSeleccionada) {

      case 'administradores':
        return usuarios.filter(
          (usuario) => usuario.es_administrador
        );

      case 'recepcionistas':
        return usuarios.filter(
          (usuario) => usuario.es_recepcionista
        );

      case 'entrenadores':
        return usuarios.filter(
          (usuario) => usuario.es_entrenador
        );

      case 'socios':
        return usuarios.filter(
          (usuario) => usuario.es_socio
        );

      case 'sin_rol':
        return usuarios.filter(
          (usuario) =>
            !usuario.es_administrador &&
            !usuario.es_recepcionista &&
            !usuario.es_entrenador &&
            !usuario.es_socio
        );

      default:
        return [];
    }
  };
  const tituloCategoria = () => {
    switch (categoriaSeleccionada) {
      case 'administradores':
        return 'ADMINISTRADORES';

      case 'recepcionistas':
        return 'RECEPCIONISTAS';

      case 'entrenadores':
        return 'ENTRENADORES';

      case 'socios':
        return 'SOCIOS';

      case 'sin_rol':
        return 'USUARIOS SIN ROL';

      default:
        return '';
    }
  };
  const abrirEdicion = (usuario: UsuarioListado) => {
    setUsuarioEditando(usuario);

    setFormEdicion({
      username: usuario.username,
      email: usuario.email || '',
      password: '',
      password2: '',

      es_administrador: usuario.es_administrador,
      es_recepcionista: usuario.es_recepcionista,
      es_socio: usuario.es_socio,
    });

    setErrorEdicion('');
    setMensajeAccion('');
  };
  const guardarEdicion = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!usuarioEditando) return;

    setErrorEdicion('');
    setMensajeAccion('');

    const tieneRol =
      formEdicion.es_administrador ||
      formEdicion.es_recepcionista ||
      formEdicion.es_socio ||
      // El rol Entrenador no se administra desde este formulario (CU20), pero
      // sí cuenta como rol del usuario: sin incluirlo, una cuenta cuyo único
      // rol sea Entrenador nunca podría guardarse ni cambiar su contraseña
      // desde «Gestionar usuarios». Como es_entrenador no se envía en el
      // PATCH, la API lo conserva sin modificar.
      Boolean(usuarioEditando.es_entrenador);

    if (!tieneRol) {
      setErrorEdicion('El usuario debe tener al menos un rol.');
      return;
    }

    if (formEdicion.password) {

      if (!validarPassword(formEdicion.password)) {
        setErrorEdicion(
          'La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial.'
        );
        return;
      }

      if (formEdicion.password !== formEdicion.password2) {
        setErrorEdicion('Las contraseñas no coinciden.');
        return;
      }
    }

    try {
      const token = localStorage.getItem('access_token');

      // Los roles Socio y Entrenador no se gestionan desde este formulario
      // (el socio se registra en su propio módulo y el entrenador en
      // «Entrenadores», CU20): por eso no se envían. PATCH es una
      // actualización parcial, de modo que omitirlos conserva el valor actual
      // en vez de restablecerlo a false.
      const datos: any = {
        username: formEdicion.username,
        email: formEdicion.email,

        es_administrador: formEdicion.es_administrador,
        es_recepcionista: formEdicion.es_recepcionista,
      };

      // Solo enviamos contraseña si realmente la cambió
      if (formEdicion.password) {
        datos.password = formEdicion.password;
        datos.password2 = formEdicion.password2;
      }

      const response = await fetch(
        `${API_URL}/usuarios/${usuarioEditando.id}/`,
        {
          method: 'PATCH',

          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },

          body: JSON.stringify(datos),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setErrorEdicion(mensajeDeError(data));
        return;
      }

      setUsuarios((anteriores) =>
        anteriores.map((u) =>
          u.id === usuarioEditando.id
            ? data
            : u
        )
      );

      setUsuarioEditando(null);
      setMensajeAccion('Usuario actualizado correctamente.');

    } catch {
      setErrorEdicion('No se pudo conectar con el servidor.');
    }
  };
  const desactivarUsuario = async (usuario: UsuarioListado) => {

    const confirmar = window.confirm(
      `¿Desea desactivar al usuario "${usuario.username}"?`
    );

    if (!confirmar) return;

    try {
      const token = localStorage.getItem('access_token');

      const response = await fetch(
        `${API_URL}/usuarios/${usuario.id}/`,
        {
          method: 'PATCH',

          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },

          body: JSON.stringify({
            estado_cuenta: 'Inactivo',
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMensajeAccion('No se pudo desactivar el usuario.');
        return;
      }

      setUsuarios((anteriores) =>
        anteriores.map((u) =>
          u.id === usuario.id
            ? data
            : u
        )
      );

      setMensajeAccion(
        `Usuario ${usuario.username} desactivado correctamente.`
      );

    } catch {
      setMensajeAccion(
        'No se pudo conectar con el servidor.'
      );
    }
  };
  const activarUsuario = async (usuario: UsuarioListado) => {

    try {
      const token = localStorage.getItem('access_token');

      const response = await fetch(
        `${API_URL}/usuarios/${usuario.id}/`,
        {
          method: 'PATCH',

          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },

          body: JSON.stringify({
            estado_cuenta: 'Activo',
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMensajeAccion('No se pudo activar el usuario.');
        return;
      }

      setUsuarios((anteriores) =>
        anteriores.map((u) =>
          u.id === usuario.id
            ? data
            : u
        )
      );

      setMensajeAccion(
        `Usuario ${usuario.username} activado correctamente.`
      );

    } catch {
      setMensajeAccion(
        'No se pudo conectar con el servidor.'
      );
    }
  };
  const crearUsuario = async (e: React.FormEvent) => {
    e.preventDefault();

    setErrorFormulario('');
    setMensajeFormulario('');

    if (!validarPassword(nuevoUsuario.password)) {
      setErrorFormulario(
        'La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial.'
      );
      return;
    }

    if (nuevoUsuario.password !== nuevoUsuario.password2) {
      setErrorFormulario('Las contraseñas no coinciden.');
      return;
    }

    const tieneRol =
      nuevoUsuario.es_administrador ||
      nuevoUsuario.es_recepcionista ||
      nuevoUsuario.es_socio;

    if (!tieneRol) {
      setErrorFormulario(
        'Debe seleccionar al menos un rol para el usuario.'
      );
      return;
    }

    setCreando(true);

    try {
      const token = localStorage.getItem('access_token');

      const response = await fetch(`${API_URL}/usuarios/`, {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },

        body: JSON.stringify({
          ...nuevoUsuario,
          estado_cuenta: 'Activo',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorFormulario(mensajeDeError(data));
        return;
      }

      setMensajeFormulario(
        'Usuario creado correctamente.'
      );

      setUsuarios((anteriores) => [
        ...anteriores,
        data,
      ]);

      setNuevoUsuario({
        username: '',
        email: '',
        password: '',
        password2: '',

        es_administrador: false,
        es_recepcionista: false,
        es_socio: false,
      });

    } catch {
      setErrorFormulario(
        'No se pudo conectar con el servidor.'
      );
    } finally {
      setCreando(false);
    }
  };

  return (
    <div className="p-6 text-white">
      <div className="flex justify-between items-center mb-6">

        <h1 className="text-3xl font-bold">
          GESTIÓN DE USUARIOS
        </h1>

        <div className="flex gap-3">
          <button
            onClick={() => setMostrarFormulario(true)}
            className="bg-yellow-500 text-black px-4 py-2 rounded font-bold"
          >
            + NUEVO USUARIO
          </button>

          <button
            onClick={onVolver}
            className="bg-gray-700 px-4 py-2 rounded"
          >
            VOLVER
          </button>
        </div>

      </div>
      {mensajeAccion && (
        <p className="mb-4 text-green-400">
          {mensajeAccion}
        </p>
      )}

      {cargando && (
        <p>Cargando usuarios...</p>
      )}

      {error && (
        <p className="text-red-400">
          {error}
        </p>
      )}
      {mostrarFormulario && (
        <div className="mb-6 bg-gray-900 p-6 rounded">

          <h2 className="text-2xl font-bold mb-5">
            NUEVO USUARIO
          </h2>

          {errorFormulario && (
            <p className="mb-4 text-red-400">
              {errorFormulario}
            </p>
          )}

          {mensajeFormulario && (
            <p className="mb-4 text-green-400">
              {mensajeFormulario}
            </p>
          )}

          <form
            onSubmit={crearUsuario}
            className="flex flex-col gap-4"
          >

            <div>
              <label className="block mb-1">
                Usuario:
              </label>

              <input
                type="text"
                value={nuevoUsuario.username}
                onChange={(e) =>
                  setNuevoUsuario({
                    ...nuevoUsuario,
                    username: e.target.value,
                  })
                }
                className={inputCls}
                required
              />
            </div>


            <div>
              <label className="block mb-1">
                Correo:
              </label>

              <input
                type="email"
                value={nuevoUsuario.email}
                onChange={(e) =>
                  setNuevoUsuario({
                    ...nuevoUsuario,
                    email: e.target.value,
                  })
                }
                className={inputCls}
                required
              />
            </div>


            <PasswordInput
              id="admin-password"
              label="Contraseña:"
              value={nuevoUsuario.password}
              onChange={(valor) =>
                setNuevoUsuario({
                  ...nuevoUsuario,
                  password: valor,
                })
              }
              autoComplete="new-password"
            />


            <PasswordInput
              id="admin-password2"
              label="Confirmar contraseña:"
              value={nuevoUsuario.password2}
              onChange={(valor) =>
                setNuevoUsuario({
                  ...nuevoUsuario,
                  password2: valor,
                })
              }
              autoComplete="new-password"
            />


            <div className="mt-2">

              <p className="font-bold mb-3">
                Roles:
              </p>

              <div className="flex flex-wrap gap-5">

                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={nuevoUsuario.es_administrador}
                    onChange={(e) =>
                      setNuevoUsuario({
                        ...nuevoUsuario,
                        es_administrador: e.target.checked,
                      })
                    }
                  />
                  Administrador
                </label>


                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={nuevoUsuario.es_recepcionista}
                    onChange={(e) =>
                      setNuevoUsuario({
                        ...nuevoUsuario,
                        es_recepcionista: e.target.checked,
                      })
                    }
                  />
                  Recepcionista
                </label>

              </div>

              <p className="mt-3 text-sm text-gray-400">
                El registro de socios se realiza desde «Agregar nuevo socio» y
                el de entrenadores desde «Entrenadores».
              </p>

            </div>


            <div className="flex gap-3 mt-3">

              <button
                type="submit"
                disabled={creando}
                className="bg-yellow-500 text-black px-5 py-2 rounded font-bold"
              >
                {creando
                  ? 'CREANDO...'
                  : 'GUARDAR USUARIO'}
              </button>


              <button
                type="button"
                onClick={() => {
                  setMostrarFormulario(false);
                  setErrorFormulario('');
                  setMensajeFormulario('');
                }}
                className="bg-red-600 px-5 py-2 rounded"
              >
                CANCELAR
              </button>

            </div>

          </form>

        </div>
      )}
      {usuarioEditando && (
        <div className="mb-6 bg-gray-900 p-6 rounded">

          <h2 className="text-2xl font-bold mb-5">
            EDITAR USUARIO
          </h2>

          <p className="mb-4 text-gray-400">
            Editando: {usuarioEditando.username}
          </p>

          {errorEdicion && (
            <p className="text-red-400 mb-4">
              {errorEdicion}
            </p>
          )}

          <form
            onSubmit={guardarEdicion}
            className="flex flex-col gap-4"
          >

            <div>
              <label className="block mb-1">
                Usuario:
              </label>

              <input
                type="text"
                value={formEdicion.username}
                onChange={(e) =>
                  setFormEdicion({
                    ...formEdicion,
                    username: e.target.value,
                  })
                }
                className={inputCls}
                required
              />
            </div>

            <div>
              <label className="block mb-1">
                Correo:
              </label>

              <input
                type="email"
                value={formEdicion.email}
                onChange={(e) =>
                  setFormEdicion({
                    ...formEdicion,
                    email: e.target.value,
                  })
                }
                className={inputCls}
                required
              />
            </div>

            <PasswordInput
              id="editar-password"
              label="Nueva contraseña (opcional):"
              value={formEdicion.password}
              onChange={(valor) =>
                setFormEdicion({
                  ...formEdicion,
                  password: valor,
                })
              }
              autoComplete="new-password"
              required={false}
            />

            <PasswordInput
              id="editar-password2"
              label="Confirmar nueva contraseña:"
              value={formEdicion.password2}
              onChange={(valor) =>
                setFormEdicion({
                  ...formEdicion,
                  password2: valor,
                })
              }
              autoComplete="new-password"
              required={false}
            />

            <div>
              <p className="font-bold mb-3">
                Roles:
              </p>

              <div className="flex flex-wrap gap-5">

                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={formEdicion.es_administrador}
                    onChange={(e) =>
                      setFormEdicion({
                        ...formEdicion,
                        es_administrador: e.target.checked,
                      })
                    }
                  />
                  Administrador
                </label>

                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={formEdicion.es_recepcionista}
                    onChange={(e) =>
                      setFormEdicion({
                        ...formEdicion,
                        es_recepcionista: e.target.checked,
                      })
                    }
                  />
                  Recepcionista
                </label>

              </div>
            </div>

            <div className="flex gap-3 mt-3">

              <button
                type="submit"
                className="bg-yellow-500 text-black px-5 py-2 rounded font-bold"
              >
                GUARDAR CAMBIOS
              </button>

              <button
                type="button"
                onClick={() => {
                  setUsuarioEditando(null);
                  setErrorEdicion('');
                }}
                className="bg-gray-700 px-5 py-2 rounded"
              >
                CANCELAR
              </button>

            </div>

          </form>

        </div>
      )}

      {!cargando && !error && categoriaSeleccionada === null && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">

          <button
            onClick={() => setCategoriaSeleccionada('administradores')}
            className="bg-gray-900 border border-gray-700 p-6 rounded text-left hover:bg-gray-800"
          >
            <h2 className="text-xl font-bold text-yellow-400">
              ADMINISTRADORES
            </h2>

            <p className="mt-2 text-gray-300">
              {
                usuarios.filter(
                  (usuario) => usuario.es_administrador
                ).length
              } usuario(s)
            </p>
          </button>


          <button
            onClick={() => setCategoriaSeleccionada('recepcionistas')}
            className="bg-gray-900 border border-gray-700 p-6 rounded text-left hover:bg-gray-800"
          >
            <h2 className="text-xl font-bold">
              RECEPCIONISTAS
            </h2>

            <p className="mt-2 text-gray-300">
              {
                usuarios.filter(
                  (usuario) => usuario.es_recepcionista
                ).length
              } usuario(s)
            </p>
          </button>


          <button
            onClick={() => setCategoriaSeleccionada('entrenadores')}
            className="bg-gray-900 border border-gray-700 p-6 rounded text-left hover:bg-gray-800"
          >
            <h2 className="text-xl font-bold">
              ENTRENADORES
            </h2>

            <p className="mt-2 text-gray-300">
              {
                usuarios.filter(
                  (usuario) => usuario.es_entrenador
                ).length
              } usuario(s)
            </p>
          </button>


          <button
            onClick={() => setCategoriaSeleccionada('socios')}
            className="bg-gray-900 border border-gray-700 p-6 rounded text-left hover:bg-gray-800"
          >
            <h2 className="text-xl font-bold">
              SOCIOS
            </h2>

            <p className="mt-2 text-gray-300">
              {
                usuarios.filter(
                  (usuario) => usuario.es_socio
                ).length
              } usuario(s)
            </p>
          </button>


          <button
            onClick={() => setCategoriaSeleccionada('sin_rol')}
            className="bg-gray-900 border border-red-800 p-6 rounded text-left hover:bg-gray-800"
          >
            <h2 className="text-xl font-bold text-red-400">
              SIN ROL
            </h2>

            <p className="mt-2 text-gray-300">
              {
                usuarios.filter(
                  (usuario) =>
                    !usuario.es_administrador &&
                    !usuario.es_recepcionista &&
                    !usuario.es_entrenador &&
                    !usuario.es_socio
                ).length
              } usuario(s)
            </p>
          </button>

        </div>
      )}
      {!cargando && !error && categoriaSeleccionada !== null && (
        <div>

          <div className="flex justify-between items-center mb-4">

            <h2 className="text-2xl font-bold">
              {tituloCategoria()}
            </h2>

            <button
              onClick={() => setCategoriaSeleccionada(null)}
              className="bg-gray-700 px-4 py-2 rounded"
            >
              VOLVER A CATEGORÍAS
            </button>

          </div>


          <div className="overflow-x-auto">

            <table className="w-full border-collapse">

              <thead>
                <tr className="bg-gray-800">

                  <th className="p-3 text-left">
                    IDENTIFICACIÓN
                  </th>

                  <th className="p-3 text-left">
                    Usuario
                  </th>

                  <th className="p-3 text-left">
                    Correo
                  </th>

                  <th className="p-3 text-left">
                    Roles
                  </th>

                  <th className="p-3 text-left">
                    Estado
                  </th>
                  {categoriaSeleccionada === 'socios' && (
                    <>
                      <th className="p-3 text-left">
                        Membresía
                      </th>
                      <th className="p-3 text-left">
                        Estado membre.
                      </th>
                      <th className="p-3 text-left">
                        Vencimiento
                      </th>
                      <th className="p-3 text-left">
                        Días restantes
                      </th>
                    </>
                  )}
                  <th className="p-3 text-left">
                    Acciones
                  </th>

                </tr>
              </thead>


              <tbody>

                {usuariosFiltrados().map((usuario) => (

                  <tr
                    key={usuario.id}
                    className="border-b border-gray-700"
                  >

                    <td className="p-3">
                      {usuario.id}
                    </td>

                    <td className="p-3">
                      {usuario.username}
                    </td>

                    <td className="p-3">
                      {usuario.email || '-'}
                    </td>

                    <td className="p-3">
                      {obtenerRoles(usuario)}
                    </td>

                    <td className="p-3">
                      {usuario.estado_cuenta}
                    </td>
                    {categoriaSeleccionada === 'socios' && (
                      <>
                        <td className="p-3">
                          {usuario.membresia?.plan || '—'}
                        </td>
                        <td
                          className={`p-3 font-bold ${
                            usuario.membresia?.estado === 'Vigente'
                              ? 'text-green-400'
                              : usuario.membresia?.estado === 'Vencida'
                                ? 'text-red-400'
                                : 'text-gray-400'
                          }`}
                        >
                          {usuario.membresia?.estado || 'Sin membresía'}
                        </td>
                        <td className="p-3">
                          {usuario.membresia?.fecha_vencimiento || '—'}
                        </td>
                        <td className="p-3">
                          {usuario.membresia?.dias_restantes !== null &&
                          usuario.membresia?.dias_restantes !== undefined
                            ? usuario.membresia.dias_restantes
                            : '—'}
                        </td>
                      </>
                    )}
                    <td className="p-3">

                      <div className="flex gap-2">

                        <button
                          onClick={() => abrirEdicion(usuario)}
                          className="bg-blue-600 px-3 py-1 rounded"
                        >
                          EDITAR
                        </button>

                        {usuario.estado_cuenta === 'Activo' ? (

                          <button
                            onClick={() => desactivarUsuario(usuario)}
                            className="bg-red-600 px-3 py-1 rounded"
                          >
                            DESACTIVAR
                          </button>

                        ) : (

                          <button
                            onClick={() => activarUsuario(usuario)}
                            className="bg-green-600 px-3 py-1 rounded"
                          >
                            ACTIVAR
                          </button>

                        )}

                      </div>

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>


          {usuariosFiltrados().length === 0 && (
            <p className="mt-4 text-gray-400">
              No existen usuarios registrados en esta categoría.
            </p>
          )}

        </div>
      )}

    </div>
  );
};

// ============================================================
// 10. CU03: Registrar Bitácora de Auditoría (consulta, filtra y exporta)
// ============================================================
interface RegistroBitacora {
  id_bitacora: number;
  id_usuario: number | null;
  usuario_username: string;
  nombre_usuario_db: string | null;
  accion: string;
  tabla_afectada: string;
  descripcion: string | null;
  direccion_ip: string | null;
  fecha_hora: string;
}

const PantallaBitacora = ({ onVolver }: { onVolver: () => void }) => {
  const [registros, setRegistros] = useState<RegistroBitacora[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioListado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [filtroFecha, setFiltroFecha] = useState('');

  const token = localStorage.getItem('access_token');

  useEffect(() => {
    // Se carga una sola vez para poder filtrar "por usuario"
    fetch(`${API_URL}/usuarios/`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setUsuarios(data))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargarBitacora = async () => {
    setCargando(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (filtroUsuario) params.set('usuario', filtroUsuario);
      if (filtroFecha) params.set('fecha', filtroFecha);

      const response = await fetch(`${API_URL}/bitacora/?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('No autorizado o error del servidor');
      }

      const data = await response.json();
      setRegistros(Array.isArray(data) ? data : data.results || []);
    } catch {
      setError('No se pudo cargar la bitácora de auditoría.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarBitacora();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportar = async () => {
    const params = new URLSearchParams();
    if (filtroUsuario) params.set('usuario', filtroUsuario);
    if (filtroFecha) params.set('fecha', filtroFecha);

    try {
      const response = await fetch(`${API_URL}/bitacora/export/?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error();

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bitacora_auditoria.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('No se pudo exportar la bitácora.');
    }
  };

  return (
    <div className="p-6 text-white">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">BITÁCORA DE AUDITORÍA</h1>
        <div className="flex gap-3">
          <button onClick={exportar} className="bg-yellow-500 text-black px-4 py-2 rounded font-bold">
            EXPORTAR CSV
          </button>
          <button onClick={onVolver} className="bg-gray-700 px-4 py-2 rounded">
            VOLVER
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mb-5 bg-gray-900 p-4 rounded">
        <div>
          <label className="block text-sm mb-1">Filtrar por usuario:</label>
          <select
            value={filtroUsuario}
            onChange={(e) => setFiltroUsuario(e.target.value)}
            className={inputCls}
          >
            <option value="">-- Todos --</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>{u.username}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm mb-1">Filtrar por fecha:</label>
          <input
            type="date"
            value={filtroFecha}
            onChange={(e) => setFiltroFecha(e.target.value)}
            className={inputCls}
          />
        </div>

        <div className="flex items-end">
          <button onClick={cargarBitacora} className={btnCls} style={{ marginTop: 0 }}>
            APLICAR FILTROS
          </button>
        </div>
      </div>

      {cargando && <p>Cargando bitácora...</p>}
      {error && <p className="text-red-400">{error}</p>}

      {!cargando && !error && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-800">
                <th className="p-3 text-left">Fecha y hora</th>
                <th className="p-3 text-left">Usuario</th>
                <th className="p-3 text-left">Acción</th>
                <th className="p-3 text-left">Tabla</th>
                <th className="p-3 text-left">Descripción</th>
                <th className="p-3 text-left">IP</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((r) => (
                <tr key={r.id_bitacora} className="border-b border-gray-700">
                  <td className="p-3 whitespace-nowrap">{new Date(r.fecha_hora).toLocaleString()}</td>
                  <td className="p-3">{r.usuario_username}</td>
                  <td className="p-3">{r.accion}</td>
                  <td className="p-3">{r.tabla_afectada}</td>
                  <td className="p-3">{r.descripcion}</td>
                  <td className="p-3">{r.direccion_ip || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {registros.length === 0 && (
            <p className="mt-4 text-gray-400">No hay registros para los filtros seleccionados.</p>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================
// 11. CU04: Registrar Expediente de Socio (rol Recepcionista/Administrador)
// ============================================================
interface PlanMembresiaItem {
  id_plan_membresia: number;
  nombre_plan: string;
  costo_base_origen: string;
  duracion_dias: number;
  estado: string;
}

const PantallaRegistrarSocio = ({ onVolver }: { onVolver: () => void }) => {
  const token = localStorage.getItem('access_token');

  const [planes, setPlanes] = useState<PlanMembresiaItem[]>([]);
  const [metodosPago, setMetodosPago] = useState<MetodoPagoItem[]>([]);
  const [form, setForm] = useState({
    username: '',
    email: '',
    ci: '',
    telefono: '',
    password: '',
    password2: '',
    fecha_nacimiento: '',
    peso_inicial_kg: '',
    contacto_emerg_nombre: '',
    id_plan_membresia: '',
    id_metodo_pago: '',
  });

  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    fetch(`${API_URL}/planes/`, { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setPlanes((data || []).filter((p: PlanMembresiaItem) => p.estado === 'Activo')))
      .catch(() => {});
    // Métodos de pago disponibles para la membresía inicial (opcional).
    fetch(`${API_URL}/metodos-pago/`, { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) =>
        setMetodosPago(Array.isArray(data) ? data : data.results || [])
      )
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const actualizarCampo = (campo: string, valor: string) =>
    setForm((prev) => ({ ...prev, [campo]: valor }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMensaje('');

    if (!validarPassword(form.password)) {
      setError(
        'La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula, un número y un símbolo.'
      );
      return;
    }
    if (form.password !== form.password2) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setEnviando(true);
    try {
      const payload: any = {
        username: form.username.trim(),
        email: form.email.trim(),
        ci: form.ci.trim(),
        telefono: form.telefono.trim(),
        password: form.password,
        password2: form.password2,
        fecha_nacimiento: form.fecha_nacimiento,
      };
      if (form.peso_inicial_kg) payload.peso_inicial_kg = form.peso_inicial_kg;
      if (form.contacto_emerg_nombre) payload.contacto_emerg_nombre = form.contacto_emerg_nombre;
      if (form.id_plan_membresia) payload.id_plan_membresia = Number(form.id_plan_membresia);
      if (form.id_plan_membresia && form.id_metodo_pago) {
        payload.id_metodo_pago = Number(form.id_metodo_pago);
      }

      const response = await fetch(`${API_URL}/socios/registrar/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(mensajeDeError(data));
        return;
      }

      setMensaje(
        data.plan_asignado
          ? `Socio '${data.username}' registrado con el plan '${data.plan_asignado}'.`
          : `Socio '${data.username}' registrado correctamente.`
      );

      setForm({
        username: '',
        email: '',
        ci: '',
        telefono: '',
        password: '',
        password2: '',
        fecha_nacimiento: '',
        peso_inicial_kg: '',
        contacto_emerg_nombre: '',
        id_plan_membresia: '',
        id_metodo_pago: '',
      });
    } catch {
      setError('No se pudo conectar con el servidor.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="p-6 text-white max-w-2xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">REGISTRAR NUEVO SOCIO</h1>
        <button onClick={onVolver} className="bg-gray-700 px-4 py-2 rounded">
          VOLVER
        </button>
      </div>

      {error && <p className="mb-4 text-red-400">{error}</p>}
      {mensaje && <p className="mb-4 text-green-400">{mensaje}</p>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 bg-gray-900 p-6 rounded">
        <div>
          <label className="block mb-1">Nombre de usuario:</label>
          <input
            type="text"
            value={form.username}
            onChange={(e) => actualizarCampo('username', e.target.value)}
            className={inputCls}
            required
          />
        </div>

        <div>
          <label className="block mb-1">Correo electrónico:</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => actualizarCampo('email', e.target.value)}
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block mb-1">CI:</label>
            <input
              type="text"
              value={form.ci}
              onChange={(e) => actualizarCampo('ci', e.target.value)}
              className={inputCls}
              required
            />
          </div>
          <div>
            <label className="block mb-1">Teléfono:</label>
            <input
              type="text"
              value={form.telefono}
              onChange={(e) => actualizarCampo('telefono', e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <PasswordInput
          id="socio-password"
          label="Contraseña:"
          value={form.password}
          onChange={(v) => actualizarCampo('password', v)}
          autoComplete="new-password"
        />
        <PasswordInput
          id="socio-password2"
          label="Confirmar contraseña:"
          value={form.password2}
          onChange={(v) => actualizarCampo('password2', v)}
          autoComplete="new-password"
        />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block mb-1">Fecha de nacimiento:</label>
            <input
              type="date"
              value={form.fecha_nacimiento}
              onChange={(e) => actualizarCampo('fecha_nacimiento', e.target.value)}
              className={inputCls}
              required
            />
          </div>
          <div>
            <label className="block mb-1">Peso inicial (kg) — opcional:</label>
            <input
              type="number"
              step="0.01"
              value={form.peso_inicial_kg}
              onChange={(e) => actualizarCampo('peso_inicial_kg', e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className="block mb-1">Contacto de emergencia — opcional:</label>
          <input
            type="text"
            value={form.contacto_emerg_nombre}
            onChange={(e) => actualizarCampo('contacto_emerg_nombre', e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <label className="block mb-1">Plan de membresía inicial — opcional:</label>
          <select
            value={form.id_plan_membresia}
            onChange={(e) => actualizarCampo('id_plan_membresia', e.target.value)}
            className={inputCls}
          >
            <option value="">-- Sin plan por ahora --</option>
            {planes.map((p) => (
              <option key={p.id_plan_membresia} value={p.id_plan_membresia}>
                {p.nombre_plan} ({p.duracion_dias} días — {p.costo_base_origen})
              </option>
            ))}
          </select>
        </div>

        {form.id_plan_membresia && (
          <div>
            <label className="block mb-1">Método de pago — opcional (Efectivo por defecto):</label>
            <select
              value={form.id_metodo_pago}
              onChange={(e) => actualizarCampo('id_metodo_pago', e.target.value)}
              className={inputCls}
            >
              <option value="">-- Efectivo (por defecto) --</option>
              {metodosPago.map((m) => (
                <option key={m.id_metodo_pago} value={m.id_metodo_pago}>
                  {m.descripcion}
                </option>
              ))}
            </select>
          </div>
        )}

        <button type="submit" className={btnCls} disabled={enviando}>
          {enviando ? 'REGISTRANDO...' : 'REGISTRAR SOCIO'}
        </button>
      </form>
    </div>
  );
};

// ============================================================
// 12. CU05: Administrar Planes de Membresía (solo Administrador)
//    Lista, crea, edita y activa/desactiva planes. Usa los
//    endpoints reales del backend (jamás borra físicamente).
// ============================================================
interface PlanMembresiaAdminItem {
  id_plan_membresia: number;
  nombre_plan: string;
  moneda_origen: string;
  costo_base_origen: string;
  duracion_dias: number;
  acceso_piscina: boolean;
  clases_grupales: boolean;
  estado: string;
}

const PantallaPlanesMembresia = ({ onVolver }: { onVolver: () => void }) => {
  const token = localStorage.getItem('access_token');

  const [planes, setPlanes] = useState<PlanMembresiaAdminItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorFormulario, setErrorFormulario] = useState('');
  const [planEditando, setPlanEditando] = useState<PlanMembresiaAdminItem | null>(null);

  const formVacio = {
    nombre_plan: '',
    moneda_origen: 'BOB',
    costo_base_origen: '',
    duracion_dias: '',
    acceso_piscina: false,
    clases_grupales: false,
  };

  const [form, setForm] = useState(formVacio);

  const cargarPlanes = async () => {
    setCargando(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/planes/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error('No se pudieron cargar los planes');
      }
      const data = await response.json();
      setPlanes(Array.isArray(data) ? data : data.results || []);
    } catch {
      setError('No se pudieron cargar los planes de membresía.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarPlanes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const actualizarCampo = (campo: string, valor: string) =>
    setForm((prev) => ({ ...prev, [campo]: valor }));

  const abrirNuevoPlan = () => {
    setPlanEditando(null);
    setForm(formVacio);
    setErrorFormulario('');
    setMostrarFormulario(true);
  };

  const abrirEdicionPlan = (plan: PlanMembresiaAdminItem) => {
    setPlanEditando(plan);
    setForm({
      nombre_plan: plan.nombre_plan,
      moneda_origen: plan.moneda_origen,
      costo_base_origen: plan.costo_base_origen,
      duracion_dias: String(plan.duracion_dias),
      acceso_piscina: plan.acceso_piscina,
      clases_grupales: plan.clases_grupales,
    });
    setErrorFormulario('');
    setMostrarFormulario(true);
  };

  const guardarPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorFormulario('');
    setMensaje('');

    if (!form.nombre_plan.trim()) {
      setErrorFormulario('El nombre del plan es obligatorio.');
      return;
    }

    const duracion = Number(form.duracion_dias);
    if (!form.duracion_dias || !Number.isInteger(duracion) || duracion < 1) {
      setErrorFormulario('La duración debe ser un número entero mayor o igual a 1 día.');
      return;
    }

    const costo = Number(form.costo_base_origen);
    if (form.costo_base_origen === '' || isNaN(costo) || costo < 0) {
      setErrorFormulario('El costo base no puede ser negativo.');
      return;
    }

    setGuardando(true);
    try {
      const url = planEditando
        ? `${API_URL}/planes/${planEditando.id_plan_membresia}/`
        : `${API_URL}/planes/`;

      const response = await fetch(url, {
        method: planEditando ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nombre_plan: form.nombre_plan.trim(),
          moneda_origen: form.moneda_origen || 'BOB',
          costo_base_origen: costo,
          duracion_dias: duracion,
          acceso_piscina: form.acceso_piscina,
          clases_grupales: form.clases_grupales,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorFormulario(mensajeDeError(data));
        return;
      }

      setMensaje(
        planEditando
          ? 'Plan actualizado correctamente.'
          : 'Plan creado correctamente.'
      );
      setMostrarFormulario(false);
      setPlanEditando(null);
      setForm(formVacio);
      await cargarPlanes();
    } catch {
      setErrorFormulario('No se pudo conectar con el servidor.');
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstadoPlan = async (plan: PlanMembresiaAdminItem, activar: boolean) => {
    const confirmar = window.confirm(
      activar
        ? `¿Desea activar el plan "${plan.nombre_plan}"?`
        : `¿Desea desactivar el plan "${plan.nombre_plan}"?`
    );
    if (!confirmar) return;

    try {
      const response = await fetch(
        `${API_URL}/planes/${plan.id_plan_membresia}/${activar ? 'activar' : 'desactivar'}/`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setMensaje(mensajeDeError(data));
        return;
      }

      setMensaje(
        activar
          ? `Plan "${plan.nombre_plan}" activado correctamente.`
          : `Plan "${plan.nombre_plan}" desactivado correctamente.`
      );

      setPlanes((anteriores) =>
        anteriores.map((p) =>
          p.id_plan_membresia === plan.id_plan_membresia ? data : p
        )
      );
    } catch {
      setMensaje('No se pudo conectar con el servidor.');
    }
  };

  return (
    <div className="p-6 text-white">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">PLANES DE MEMBRESÍA</h1>
        <div className="flex gap-3">
          <button
            onClick={abrirNuevoPlan}
            className="bg-yellow-500 text-black px-4 py-2 rounded font-bold"
          >
            + NUEVO PLAN
          </button>
          <button onClick={onVolver} className="bg-gray-700 px-4 py-2 rounded">
            VOLVER
          </button>
        </div>
      </div>

      {mensaje && <p className="mb-4 text-green-400">{mensaje}</p>}

      {mostrarFormulario && (
        <div className="mb-6 bg-gray-900 p-6 rounded max-w-xl">
          <h2 className="text-2xl font-bold mb-5">
            {planEditando ? 'EDITAR PLAN' : 'NUEVO PLAN'}
          </h2>

          {errorFormulario && <p className="mb-4 text-red-400">{errorFormulario}</p>}

          <form onSubmit={guardarPlan} className="flex flex-col gap-4">
            <div>
              <label className="block mb-1">Nombre del plan:</label>
              <input
                type="text"
                value={form.nombre_plan}
                onChange={(e) => actualizarCampo('nombre_plan', e.target.value)}
                className={inputCls}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block mb-1">Moneda:</label>
                <input
                  type="text"
                  value={form.moneda_origen}
                  onChange={(e) => actualizarCampo('moneda_origen', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block mb-1">Costo base:</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.costo_base_origen}
                  onChange={(e) => actualizarCampo('costo_base_origen', e.target.value)}
                  className={inputCls}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block mb-1">Duración (días):</label>
              <input
                type="number"
                min="1"
                step="1"
                value={form.duracion_dias}
                onChange={(e) => actualizarCampo('duracion_dias', e.target.value)}
                className={inputCls}
                required
              />
            </div>

            <div className="flex flex-wrap gap-5">
              <label className="flex gap-2 items-center">
                <input
                  type="checkbox"
                  checked={form.acceso_piscina}
                  onChange={(e) =>
                    setForm({ ...form, acceso_piscina: e.target.checked })
                  }
                />
                Acceso a piscina
              </label>
              <label className="flex gap-2 items-center">
                <input
                  type="checkbox"
                  checked={form.clases_grupales}
                  onChange={(e) =>
                    setForm({ ...form, clases_grupales: e.target.checked })
                  }
                />
                Clases grupales
              </label>
            </div>

            <div className="flex gap-3 mt-3">
              <button
                type="submit"
                disabled={guardando}
                className="bg-yellow-500 text-black px-5 py-2 rounded font-bold"
              >
                {guardando ? 'GUARDANDO...' : 'GUARDAR PLAN'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMostrarFormulario(false);
                  setPlanEditando(null);
                  setErrorFormulario('');
                }}
                className="bg-red-600 px-5 py-2 rounded"
              >
                CANCELAR
              </button>
            </div>
          </form>
        </div>
      )}

      {cargando ? (
        <p>Cargando planes...</p>
      ) : error ? (
        <p className="text-red-400">{error}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-800">
                <th className="p-3 text-left">ID</th>
                <th className="p-3 text-left">Nombre</th>
                <th className="p-3 text-left">Costo</th>
                <th className="p-3 text-left">Duración</th>
                <th className="p-3 text-left">Piscina</th>
                <th className="p-3 text-left">Clases</th>
                <th className="p-3 text-left">Estado</th>
                <th className="p-3 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {planes.map((plan) => (
                <tr key={plan.id_plan_membresia} className="border-b border-gray-700">
                  <td className="p-3">{plan.id_plan_membresia}</td>
                  <td className="p-3">{plan.nombre_plan}</td>
                  <td className="p-3">
                    {plan.costo_base_origen} {plan.moneda_origen}
                  </td>
                  <td className="p-3">{plan.duracion_dias} días</td>
                  <td className="p-3">{plan.acceso_piscina ? 'Sí' : 'No'}</td>
                  <td className="p-3">{plan.clases_grupales ? 'Sí' : 'No'}</td>
                  <td className="p-3">{plan.estado}</td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => abrirEdicionPlan(plan)}
                        className="bg-blue-600 px-3 py-1 rounded"
                      >
                        EDITAR
                      </button>
                      {plan.estado === 'Activo' ? (
                        <button
                          onClick={() => cambiarEstadoPlan(plan, false)}
                          className="bg-red-600 px-3 py-1 rounded"
                        >
                          DESACTIVAR
                        </button>
                      ) : (
                        <button
                          onClick={() => cambiarEstadoPlan(plan, true)}
                          className="bg-green-600 px-3 py-1 rounded"
                        >
                          ACTIVAR
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {planes.length === 0 && (
            <p className="mt-4 text-gray-400">No existen planes de membresía.</p>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================
// 13. CU06: Registrar Contrato de Membresía (Admin/Recepcionista)
// ============================================================
interface MetodoPagoItem {
  id_metodo_pago: number;
  descripcion: string;
}

interface HistorialContratoItem {
  id_contrato_mem: number;
  plan: string;
  metodo_pago: string;
  tipo_operacion: string;
  fecha_inicio: string;
  fecha_vencimiento: string;
  monto_pagado_local: string;
  estado_membresia: string;
  vigencia: string;
  dias_restantes: number | null;
  id_renovacion: number | null;
}

interface SocioItem {
  id_socio: number;
  username: string;
  ci: string;
  estado_cuenta: string;
  membresia: MembresiaResumen | null;
  historial_contratos: HistorialContratoItem[];
}

const PantallaRegistrarContratoMembresia = ({ onVolver }: { onVolver: () => void }) => {
  const token = localStorage.getItem('access_token');

  const [planes, setPlanes] = useState<PlanMembresiaItem[]>([]);
  const [socios, setSocios] = useState<SocioItem[]>([]);
  const [metodosPago, setMetodosPago] = useState<MetodoPagoItem[]>([]);

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [errorFormulario, setErrorFormulario] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [paypalProcesando, setPaypalProcesando] = useState(false);

  const hoyISO = new Date().toISOString().slice(0, 10);

  const formVacio = {
    id_socio: '',
    id_plan_membresia: '',
    id_metodo_pago: '',
    monto_pagado_local: '',
  };

  const [form, setForm] = useState(formVacio);

  const actualizarCampo = (campo: string, valor: string) =>
    setForm((prev) => ({ ...prev, [campo]: valor }));

  const cargarDatos = async () => {
    setCargando(true);
    setError('');
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [planesResp, sociosResp, metodosResp] = await Promise.all([
        fetch(`${API_URL}/planes/`, { headers }),
        fetch(`${API_URL}/socios/`, { headers }),
        fetch(`${API_URL}/metodos-pago/`, { headers }),
      ]);

      if (!planesResp.ok || !sociosResp.ok || !metodosResp.ok) {
        throw new Error('Error al cargar datos');
      }

      const planesData = await planesResp.json();
      const sociosData = await sociosResp.json();
      const metodosData = await metodosResp.json();

      // CU06: solo se ofrecen planes activos en el registro.
      setPlanes(
        (Array.isArray(planesData) ? planesData : planesData.results || []).filter(
          (p: PlanMembresiaItem) => p.estado === 'Activo'
        )
      );
      // Los socios llegan enriquecidos con su membresía (vigencia, días
      // restantes) e historial de contratos.
      setSocios(Array.isArray(sociosData) ? sociosData : sociosData.results || []);
      setMetodosPago(Array.isArray(metodosData) ? metodosData : metodosData.results || []);
    } catch {
      setError('No se pudieron cargar los datos necesarios.');
    } finally {
      setCargando(false);
    }
  };

  // PAYPAL_MEMBERSHIP_FLOW_V1: verifica el pago al regresar desde PayPal.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('token');
    if (params.get('paypal') === 'cancelado') {
      setErrorFormulario('El pago fue cancelado. No se registró ningún contrato.');
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    if (!orderId) return;
    const capturar = async () => {
      setPaypalProcesando(true);
      setMensaje('Verificando el pago con PayPal...');
      setErrorFormulario('');
      try {
        const response = await fetch(`${API_URL}/paypal/membresias/capturar/`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ order_id: orderId }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(mensajeDeError(data));
        setMensaje(data.mensaje || 'Pago confirmado y contrato registrado.');
        setForm(formVacio);
        await cargarDatos();
      } catch (err) {
        setMensaje('');
        setErrorFormulario(err instanceof Error ? err.message : 'No se pudo confirmar el pago.');
      } finally {
        setPaypalProcesando(false);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };
    capturar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cargarDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const planSeleccionado = planes.find(
    (p) => String(p.id_plan_membresia) === form.id_plan_membresia
  );

  const socioSeleccionado =
    socios.find((s) => String(s.id_socio) === form.id_socio) || null;

  const membresiaActual = socioSeleccionado?.membresia || null;
  // Acumulación de vigencia: si el socio tiene membresía vigente, el nuevo
  // periodo inicia al vencer la actual (contiguo); si no, inicia hoy.
  const acumulaVigencia = membresiaActual?.estado === 'Vigente';
  const fechaInicioEfectiva =
    acumulaVigencia && membresiaActual?.fecha_vencimiento
      ? membresiaActual.fecha_vencimiento
      : hoyISO;

  // Vencimiento calculado igual que el backend: inicio + duración en días.
  const vencimiento = (() => {
    if (!planSeleccionado) return null;
    const fecha = new Date(`${fechaInicioEfectiva}T00:00:00`);
    if (isNaN(fecha.getTime())) return null;
    fecha.setDate(fecha.getDate() + planSeleccionado.duracion_dias);
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  })();

  const precioPlan = planSeleccionado ? Number(planSeleccionado.costo_base_origen) : null;
  const montoNum = form.monto_pagado_local === '' ? NaN : Number(form.monto_pagado_local);
  // Pago exacto: debe coincidir con el precio del plan (sin pagos parciales).
  const pagoExacto =
    precioPlan !== null && !isNaN(montoNum) && montoNum === precioPlan;

  const guardarContrato = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorFormulario('');
    setMensaje('');

    if (!form.id_socio) {
      setErrorFormulario('Debe seleccionar un socio.');
      return;
    }
    if (!form.id_plan_membresia) {
      setErrorFormulario('Debe seleccionar un plan activo.');
      return;
    }
    if (!form.id_metodo_pago) {
      setErrorFormulario('Debe seleccionar un método de pago.');
      return;
    }
    // PayPal: crear orden y redirigir; el contrato se crea solo tras captura verificada.
    if (form.id_metodo_pago === 'paypal') {
      if (!planSeleccionado || !socioSeleccionado) { setErrorFormulario('Selecciona socio y plan.'); return; }
      setGuardando(true);
      try {
        const base = `${window.location.origin}${window.location.pathname}`;
        const response = await fetch(`${API_URL}/paypal/membresias/crear-orden/`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id_socio: Number(form.id_socio), id_plan_membresia: Number(form.id_plan_membresia), return_url: `${base}?paypal=retorno`, cancel_url: `${base}?paypal=cancelado` }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(mensajeDeError(data));
        if (!data.url_aprobacion) throw new Error('PayPal no devolvió el enlace de aprobación.');
        window.location.assign(data.url_aprobacion);
        return;
      } catch (err) { setErrorFormulario(err instanceof Error ? err.message : 'No se pudo crear la orden PayPal.'); }
      finally { setGuardando(false); }
      return;
    }

    if (form.monto_pagado_local === '' || isNaN(montoNum)) {
      setErrorFormulario('Debe indicar el monto pagado.');
      return;
    }
    if (montoNum < 0) {
      setErrorFormulario('El monto pagado no puede ser negativo.');
      return;
    }
    if (!planSeleccionado || !vencimiento) {
      setErrorFormulario('No se pudo calcular la fecha de vencimiento.');
      return;
    }
    if (!pagoExacto) {
      setErrorFormulario(
        `El monto debe ser exactamente ${precioPlan} (precio del plan ` +
          `"${planSeleccionado.nombre_plan}"). No se permiten pagos parciales ` +
          `ni montos distintos.`
      );
      return;
    }

    const metodo = metodosPago.find((m) => String(m.id_metodo_pago) === form.id_metodo_pago);

    const confirmar = window.confirm(
      '¿Registrar el contrato de membresía?\n\n' +
        `Socio: ${socioSeleccionado ? `${socioSeleccionado.username} (CI ${socioSeleccionado.ci})` : form.id_socio}\n` +
        `Plan: ${planSeleccionado.nombre_plan} — ${planSeleccionado.duracion_dias} días — ${planSeleccionado.costo_base_origen}\n` +
        `Inicio: ${fechaInicioEfectiva}${
          acumulaVigencia ? ' (acumulado tras la vigencia actual)' : ' (hoy)'
        } → Vence: ${vencimiento}\n` +
        `Método de pago: ${metodo ? metodo.descripcion : form.id_metodo_pago}\n` +
        `Monto pagado: ${montoNum}`
    );

    if (!confirmar) return;

    setGuardando(true);
    try {
      const response = await fetch(`${API_URL}/contratos/registrar/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id_socio: Number(form.id_socio),
          id_plan_membresia: Number(form.id_plan_membresia),
          id_metodo_pago: Number(form.id_metodo_pago),
          monto_pagado_local: montoNum,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorFormulario(mensajeDeError(data));
        return;
      }

      setMensaje(
        data.mensaje ||
          `Contrato registrado. Vigencia ${data.contrato?.fecha_inicio || ''} → ` +
            `${data.contrato?.fecha_vencimiento || ''}.`
      );
      setForm(formVacio);
      // Recargar socios para reflejar la nueva vigencia e historial.
      await cargarDatos();
    } catch {
      setErrorFormulario('No se pudo conectar con el servidor.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="p-6 text-white">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">REGISTRAR CONTRATO DE MEMBRESÍA</h1>
        <button onClick={onVolver} className="bg-gray-700 px-4 py-2 rounded">
          VOLVER
        </button>
      </div>

      {cargando ? (
        <p>Cargando datos...</p>
      ) : error ? (
        <p className="text-red-400">{error}</p>
      ) : (
        <div className="flex flex-col gap-6 max-w-4xl">
          <div className="bg-gray-900 p-6 rounded max-w-2xl">
            {mensaje && <p className="mb-4 text-green-400">{mensaje}</p>}
            {errorFormulario && <p className="mb-4 text-red-400">{errorFormulario}</p>}

            <form onSubmit={guardarContrato} className="flex flex-col gap-4">
              <div>
                <label className="block mb-1">Socio:</label>
                <select
                  value={form.id_socio}
                  onChange={(e) => actualizarCampo('id_socio', e.target.value)}
                  className={inputCls}
                  required
                >
                  <option value="">— Seleccione un socio —</option>
                  {socios.map((s) => (
                    <option key={s.id_socio} value={s.id_socio}>
                      {s.username} (CI {s.ci}) — {s.membresia?.estado || 'Sin membresía'}
                    </option>
                  ))}
                </select>
              </div>

              {socioSeleccionado && (
                <div className="bg-gray-800 p-4 rounded text-sm flex flex-col gap-1">
                  <p className="font-bold">Membresía actual de {socioSeleccionado.username}</p>
                  {membresiaActual ? (
                    <>
                      <p>
                        Estado:{' '}
                        <span
                          className={`font-bold ${
                            membresiaActual.estado === 'Vigente'
                              ? 'text-green-400'
                              : membresiaActual.estado === 'Vencida'
                                ? 'text-red-400'
                                : 'text-gray-400'
                          }`}
                        >
                          {membresiaActual.estado}
                        </span>
                      </p>
                      <p>
                        Plan:{' '}
                        <span className="font-bold">{membresiaActual.plan || '—'}</span>
                      </p>
                      <p>
                        Vigencia: {membresiaActual.fecha_inicio || '—'} →{' '}
                        {membresiaActual.fecha_vencimiento || '—'}
                      </p>
                      <p>
                        Días restantes:{' '}
                        <span className="font-bold">
                          {membresiaActual.dias_restantes ?? '—'}
                        </span>
                      </p>
                    </>
                  ) : (
                    <p className="text-gray-400">Sin membresía registrada.</p>
                  )}
                </div>
              )}

              <div>
                <label className="block mb-1">Plan de membresía (solo activos):</label>
                <select
                  value={form.id_plan_membresia}
                  onChange={(e) => actualizarCampo('id_plan_membresia', e.target.value)}
                  className={inputCls}
                  required
                >
                  <option value="">— Seleccione un plan —</option>
                  {planes.map((p) => (
                    <option key={p.id_plan_membresia} value={p.id_plan_membresia}>
                      {p.nombre_plan} — {p.duracion_dias} días — {p.costo_base_origen}
                    </option>
                  ))}
                </select>
                {planes.length === 0 && (
                  <p className="mt-1 text-sm text-gray-400">
                    No hay planes activos disponibles.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1">Método de pago:</label>
                  <select
                    value={form.id_metodo_pago}
                    onChange={(e) => actualizarCampo('id_metodo_pago', e.target.value)}
                    className={inputCls}
                    required
                  >
                    <option value="">— Seleccione —</option>
                    <option value="paypal">PayPal (Sandbox)</option>
                    {metodosPago.map((m) => (
                      <option key={m.id_metodo_pago} value={m.id_metodo_pago}>
                        {m.descripcion}
                      </option>
                    ))}
                  </select>
                </div>

                {form.id_metodo_pago !== 'paypal' && (
                <div>
                  <label className="block mb-1">
                    Monto pagado{precioPlan !== null ? ` (exacto: ${precioPlan})` : ''}:
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.monto_pagado_local}
                    onChange={(e) => actualizarCampo('monto_pagado_local', e.target.value)}
                    className={inputCls}
                    required
                  />
                </div>
                )}
              </div>

              {form.id_metodo_pago === 'paypal' && planSeleccionado && (
                <div className="bg-blue-900/30 border border-blue-700 p-4 rounded text-sm">
                  <p className="font-bold">Pago mediante PayPal Sandbox</p>
                  <p>Precio: {planSeleccionado.costo_base_origen} Bs.</p>
                  <p>Se aplicará automáticamente el tipo de cambio vigente configurado por el administrador.</p>
                  <p className="text-yellow-300 mt-1">El contrato se registra únicamente después de confirmar el pago.</p>
                </div>
              )}
              {planSeleccionado && (
                <div className="bg-gray-800 p-4 rounded text-sm flex flex-col gap-1">
                  <p>
                    Precio del plan (pago exacto):{' '}
                    <span className="font-bold">{planSeleccionado.costo_base_origen}</span>
                  </p>
                  <p>
                    Inicio:{' '}
                    <span className="font-bold">{fechaInicioEfectiva}</span>{' '}
                    {acumulaVigencia
                      ? '(acumula tras la vigencia actual)'
                      : '(hoy)'}
                  </p>
                  <p>
                    Vencimiento estimado:{' '}
                    <span className="font-bold">{vencimiento || '—'}</span> (
                    {planSeleccionado.duracion_dias} días)
                  </p>
                  <p>
                    Pago:{' '}
                    <span
                      className={`font-bold ${
                        pagoExacto ? 'text-green-400' : 'text-yellow-400'
                      }`}
                    >
                      {pagoExacto
                        ? 'Exacto — membresía Activa'
                        : `Debe ser exactamente ${precioPlan}`}
                    </span>
                  </p>
                </div>
              )}

              <div className="flex gap-3 mt-3">
                <button
                  type="submit"
                  disabled={guardando || paypalProcesando}
                  className="bg-yellow-500 text-black px-5 py-2 rounded font-bold"
                >
                  {guardando ? 'PROCESANDO...' : form.id_metodo_pago === 'paypal' ? 'PAGAR CON PAYPAL' : 'REGISTRAR CONTRATO'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForm(formVacio);
                    setErrorFormulario('');
                  }}
                  className="bg-red-600 px-5 py-2 rounded"
                >
                  CANCELAR
                </button>
              </div>
            </form>

            {socioSeleccionado && socioSeleccionado.historial_contratos.length > 0 && (
              <div className="mt-6">
                <h3 className="font-bold mb-2">
                  Historial de contratos de {socioSeleccionado.username}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-gray-800">
                        <th className="p-2 text-left">Plan</th>
                        <th className="p-2 text-left">Tipo</th>
                        <th className="p-2 text-left">Inicio</th>
                        <th className="p-2 text-left">Vence</th>
                        <th className="p-2 text-left">Monto</th>
                        <th className="p-2 text-left">Método</th>
                        <th className="p-2 text-left">Vigencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {socioSeleccionado.historial_contratos.map((h) => (
                        <tr key={h.id_contrato_mem} className="border-b border-gray-700">
                          <td className="p-2">{h.plan}</td>
                          <td className="p-2">{h.tipo_operacion}</td>
                          <td className="p-2">{h.fecha_inicio}</td>
                          <td className="p-2">{h.fecha_vencimiento}</td>
                          <td className="p-2">{h.monto_pagado_local}</td>
                          <td className="p-2">{h.metodo_pago}</td>
                          <td className="p-2">
                            <span
                              className={`font-bold ${
                                h.vigencia === 'Vigente'
                                  ? 'text-green-400'
                                  : h.vigencia === 'Vencida'
                                    ? 'text-red-400'
                                    : 'text-yellow-400'
                              }`}
                            >
                              {h.vigencia}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Consulta de socios y membresías (CU06). */}
          <div className="bg-gray-900 p-6 rounded">
            <h2 className="text-xl font-bold mb-3">Consulta de socios y membresías</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-800">
                    <th className="p-2 text-left">ID</th>
                    <th className="p-2 text-left">Usuario</th>
                    <th className="p-2 text-left">CI</th>
                    <th className="p-2 text-left">Cuenta</th>
                    <th className="p-2 text-left">Plan</th>
                    <th className="p-2 text-left">Estado</th>
                    <th className="p-2 text-left">Vence</th>
                    <th className="p-2 text-left">Días restantes</th>
                  </tr>
                </thead>
                <tbody>
                  {socios.map((s) => (
                    <tr key={s.id_socio} className="border-b border-gray-700">
                      <td className="p-2">{s.id_socio}</td>
                      <td className="p-2">{s.username}</td>
                      <td className="p-2">{s.ci}</td>
                      <td className="p-2">{s.estado_cuenta}</td>
                      <td className="p-2">{s.membresia?.plan || '—'}</td>
                      <td className="p-2">
                        <span
                          className={`font-bold ${
                            s.membresia?.estado === 'Vigente'
                              ? 'text-green-400'
                              : s.membresia?.estado === 'Vencida'
                                ? 'text-red-400'
                                : 'text-gray-400'
                          }`}
                        >
                          {s.membresia?.estado || 'Sin membresía'}
                        </span>
                      </td>
                      <td className="p-2">{s.membresia?.fecha_vencimiento || '—'}</td>
                      <td className="p-2">
                        {s.membresia?.dias_restantes ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {socios.length === 0 && (
                <p className="mt-4 text-gray-400">No hay socios registrados.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  const token = localStorage.getItem('access_token');

  const [pantalla, setPantalla] = useState<
    | 'inicio'
    | 'usuarios'
    | 'bitacora'
    | 'registrar-socio'
    | 'entrenadores'
    | 'planes'
    | 'categorias'
    | 'productos'
    | 'proveedores'
    | 'compras'
    | 'ventas'
    | 'historial-ventas'
    | 'kardex'
    | 'alertas'
    | 'configuracion'
    | 'metodos-pago'
    | 'caja'
    | 'contrato'
    | 'entrenamiento'
  >((new URLSearchParams(window.location.search).has('token') || new URLSearchParams(window.location.search).get('paypal') === 'cancelado') ? 'contrato' : 'inicio');
  // Cierre automático de sesión tras 15 min de inactividad real. El módulo
  // decide internamente si hay sesión autenticada y limpia sus propios
  // listeners/intervalos al desmontar.
  useEffect(() => iniciarSesionInactividad(), []);

  // Ruta del enlace de recuperación: /reset-password/{uid}/{token}/
  const matchReset = window.location.pathname.match(/^\/reset-password\/([^/]+)\/([^/]+)\/?$/);

  if (matchReset) {
    return (
      <div className="min-h-screen bg-black text-white">
        <ResetPasswordForm uid={matchReset[1]} token={matchReset[2]} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white overflow-y-auto">
      <Navbar
        pantallaActual={pantalla}
        onInicio={() => setPantalla('inicio')}
        onGestionUsuarios={() => setPantalla('usuarios')}
        onBitacora={() => setPantalla('bitacora')}
        onRegistrarSocio={() => setPantalla('registrar-socio')}
        onEntrenadores={() => setPantalla('entrenadores')}
        onPlanes={() => setPantalla('planes')}
        onCategorias={() => setPantalla('categorias')}
        onProductos={() => setPantalla('productos')}
        onProveedores={() => setPantalla('proveedores')}
        onCompras={() => setPantalla('compras')}
        onVentas={() => setPantalla('ventas')}
        onHistorialVentas={() => setPantalla('historial-ventas')}
        onKardex={() => setPantalla('kardex')}
        onAlertas={() => setPantalla('alertas')}
        onTipoCambio={() => setPantalla('configuracion')}
        onCaja={() => setPantalla('caja')}
        onMetodosPago={() => setPantalla('metodos-pago')}
        onRegistrarContrato={() => setPantalla('contrato')}
        onEntrenamiento={() => setPantalla('entrenamiento')}
      />
      <main className="p-4">
        {!token ? (
          <AuthGate />
        ) : pantalla === 'usuarios' ? (
          <GestionUsuarios
            onVolver={() => setPantalla('inicio')}
          />
        ) : pantalla === 'entrenadores' ? (
          <EntrenadoresScreen
            onVolver={() => setPantalla('inicio')}
          />
        ) : pantalla === 'bitacora' ? (
          <PantallaBitacora
            onVolver={() => setPantalla('inicio')}
          />
        ) : pantalla === 'registrar-socio' ? (
          <PantallaRegistrarSocio
            onVolver={() => setPantalla('inicio')}
          />
        ) : pantalla === 'planes' ? (
          <PantallaPlanesMembresia
            onVolver={() => setPantalla('inicio')}
          />
        ) : pantalla === 'categorias' ? (
          <CategoriasScreen onVolver={() => setPantalla('inicio')} />
        ) : pantalla === 'productos' ? (
          <ProductosScreen onVolver={() => setPantalla('inicio')} />
        ) : pantalla === 'proveedores' ? (
          <ProveedoresScreen onVolver={() => setPantalla('inicio')} />
        ) : pantalla === 'compras' ? (
          <ComprasScreen onVolver={() => setPantalla('inicio')} />
        ) : pantalla === 'ventas' ? (
          <VentasPOSScreen onVolver={() => setPantalla('inicio')} />
        ) : pantalla === 'historial-ventas' ? (
          <HistorialVentasScreen onVolver={() => setPantalla('inicio')} />
        ) : pantalla === 'kardex' ? (
          <KardexScreen onVolver={() => setPantalla('inicio')} />
        ) : pantalla === 'alertas' ? (
          <AlertasScreen onVolver={() => setPantalla('inicio')} />
        ) : pantalla === 'metodos-pago' ? (
          <MetodosPagoScreen onVolver={() => setPantalla('inicio')} />
        ) : pantalla === 'configuracion' ? (
          <TipoCambioScreen onVolver={() => setPantalla('inicio')} />
        ) : pantalla === 'caja' ? (
          <CajaScreen onVolver={() => setPantalla('inicio')} />
        ) : pantalla === 'contrato' ? (
          <PantallaRegistrarContratoMembresia
            onVolver={() => setPantalla('inicio')}
          />
        ) : pantalla === 'entrenamiento' ? (
          <EntrenamientoScreen
            onVolver={() => setPantalla('inicio')}
          />
        ) : (
          <div>
            <h1 className="text-xl font-bold">
              BIENVENIDO AL SISTEMA PORKY GYM
            </h1>

            <p className="mt-2 text-gray-400">
              Has iniciado sesión correctamente. Ya puedes acceder a las opciones de la barra superior.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}