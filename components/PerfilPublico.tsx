// components/PerfilPublico.tsx
/**
 * Qué hace: «Mi perfil» del cliente (su perfil público: usuario y foto se ven en el Foro) y su obligación de completarlo.
 *
 * - PerfilPublico (Mi cuenta → app/(tabs)/perfil.tsx): tarjeta plegable con la foto pequeña, «Mi perfil», el subtítulo
 *   «Tu cuenta está activa» y «@usuario · Completo» (o «Faltan datos»); sale plegada si ya está completo y se pliega sola al
 *   guardarlo completo. Dentro: la foto grande («Toca la foto para cambiarla», opcional, con su recorte: RecortarFoto),
 *   usuario, nombre y apellidos (a lo ancho, para que se lean enteros), el correo de la sesión (a lo ancho, con candado:
 *   no se cambia aquí), país y provincia o región, fecha de nacimiento y edad (se calcula; mínimo 14 años) y «Guardar
 *   perfil» / «Deshacer». Al final, abierta o plegada, los botones de la cuenta («Cerrar sesión» y, al administrador,
 *   «Panel de control»), que le pasa la pantalla en `cuenta`. Campos compactos, redondeados y centrados con ✓ verde cuando
 *   están bien; desplegables con ⌃⌄ (los nativos del móvil, invisibles encima del campo).
 *   «Dirección de envío» (opcional, solo en Mi cuenta, dueño 2026-11-02, «como en Amazon»): código postal (5 cifras en
 *   España; la provincia se reconoce por sus dos primeras cifras, se pone sola si faltaba y se avisa si no es la del
 *   perfil) y localidad, dirección (calle o avenida y número de portal, o «s/n») y piso/puerta/letra. Si se empieza, tiene
 *   que estar entera; nunca impide tener el perfil completo. Rellena el pago (app/checkout.tsx). Columnas codigo_postal,
 *   localidad, direccion y piso (migración 20261102120000_perfiles_direccion.sql); sin ellas no se ofrece.
 *   «Inicio de sesión y seguridad» (SeguridadCuenta, con la tarjeta abierta, dueño 2026-11-03): cambiar el correo (enlace
 *   al de antes y al nuevo; se cambia al confirmar los dos y, mientras, sale «Cambio pendiente») y la contraseña (pide la
 *   actual, que se comprueba volviendo a entrar; la nueva dos veces; «Mostrar»; «¿No recuerdas la actual?»). Al volver de
 *   un enlace (/perfil?cuenta=correo) la tarjeta se abre y dice en español cómo va.
 * - perfilesPublicos(ids): usuario y foto de varias personas para el Foro (función perfiles_publicos de la base de datos,
 *   que solo devuelve eso; si aún no existe, el Foro sigue como antes).
 * - PerfilObligatorio (montado una vez en app/_layout.tsx): con sesión iniciada y el perfil sin completar, una pantalla
 *   «Completa tu perfil» tapa la tienda hasta que se guarda completo (o se cierra la sesión). No sale en Mi cuenta (allí está
 *   la tarjeta), ni en las políticas (se pueden leer antes de dar los datos), ni al cambiar la contraseña, ni en el panel de
 *   administración. Mientras está
 *   abierta, Blue se esconde (usePerfilObligatorioVisible, components/Campanita.tsx).
 *
 * Datos: tabla perfiles_cliente (cada cliente ve y edita SOLO su fila; el administrador las lee en Administración →
 * Usuarios) y fotos en el almacén «avatares», carpeta del propio cliente (supabase/migrations/20261030150000_perfiles_cliente
 * _completo.sql). Al guardar se actualizan también los datos de la cuenta (nombre, usuario, país y foto), que es de donde el
 * Foro saca el nombre. Si la tabla aún no existe (migración sin aplicar), no se enseña nada ni se exige nada; si existe sin la
 * columna de la foto, todo funciona sin foto.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { avisoContrasenaCorta, CONTRASENA_MINIMA, mensajeAuthEnEspanol, motivoErrorAuth, pedirEnlaceContrasena, supabase } from "../lib/supabase";
import { trackEvent } from "../lib/analytics";
import { pickMediaFilesWeb, reducirImagenWeb } from "../lib/admin/products.utils";
import CargaMarca from "./marca/CargaMarca";
import SmartImage from "./SmartImage";

const P = {
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  line: "#E3EAF2",
  accent: "#1EA7E8",
  danger: "#DC2626",
  ok: "#2E9E5B",
  fondo: "#F4F9FD",
};

export type DatosPerfil = {
  usuario: string;
  nombre: string;
  pais: string;
  provincia: string;
  fecha: string;
  foto: string;
  // Dirección de envío (opcional): rellena el pago (app/checkout.tsx).
  codigoPostal: string;
  localidad: string;
  direccion: string;
  piso: string;
};
const DATOS_VACIOS: DatosPerfil = {
  usuario: "",
  nombre: "",
  pais: "",
  provincia: "",
  fecha: "",
  foto: "",
  codigoPostal: "",
  localidad: "",
  direccion: "",
  piso: "",
};
const PAIS_ESPANA = "España";
const EDAD_MINIMA = 14;
const FECHA_MINIMA = "1900-01-01";
const ALMACEN_FOTOS = "avatares";

const PAISES = [
  "España", "Andorra", "Portugal", "Francia", "Italia", "Alemania", "Reino Unido", "Irlanda", "Países Bajos", "Bélgica",
  "Luxemburgo", "Suiza", "Austria", "Polonia", "Rumanía", "Bulgaria", "Grecia", "Suecia", "Noruega", "Dinamarca", "Finlandia",
  "Ucrania", "Rusia", "Marruecos", "Argelia", "Túnez", "Senegal", "Nigeria", "Guinea Ecuatorial", "Estados Unidos", "Canadá",
  "México", "Cuba", "República Dominicana", "Puerto Rico", "Guatemala", "Honduras", "El Salvador", "Nicaragua", "Costa Rica",
  "Panamá", "Colombia", "Venezuela", "Ecuador", "Perú", "Bolivia", "Chile", "Argentina", "Uruguay", "Paraguay", "Brasil",
  "China", "Japón", "India", "Pakistán", "Filipinas", "Australia", "Otro país",
];

const PROVINCIAS_ES = [
  "Álava", "Albacete", "Alicante", "Almería", "Asturias", "Ávila", "Badajoz", "Baleares", "Barcelona", "Burgos", "Cáceres",
  "Cádiz", "Cantabria", "Castellón", "Ceuta", "Ciudad Real", "Córdoba", "A Coruña", "Cuenca", "Girona", "Granada", "Guadalajara",
  "Guipúzcoa", "Huelva", "Huesca", "Jaén", "La Rioja", "Las Palmas", "León", "Lleida", "Lugo", "Madrid", "Málaga", "Melilla",
  "Murcia", "Navarra", "Ourense", "Palencia", "Pontevedra", "Salamanca", "Santa Cruz de Tenerife", "Segovia", "Sevilla", "Soria",
  "Tarragona", "Teruel", "Toledo", "Valencia", "Valladolid", "Vizcaya", "Zamora", "Zaragoza",
];

// Provincia de cada código postal de España por sus dos primeras cifras (01 Álava … 52 Melilla), con los nombres de
// PROVINCIAS_ES.
const PROVINCIA_POR_CP = [
  "", "Álava", "Albacete", "Alicante", "Almería", "Ávila", "Badajoz", "Baleares", "Barcelona", "Burgos", "Cáceres", "Cádiz",
  "Castellón", "Ciudad Real", "Córdoba", "A Coruña", "Cuenca", "Girona", "Granada", "Guadalajara", "Guipúzcoa", "Huelva",
  "Huesca", "Jaén", "León", "Lleida", "La Rioja", "Lugo", "Madrid", "Málaga", "Murcia", "Navarra", "Ourense", "Asturias",
  "Palencia", "Las Palmas", "Pontevedra", "Salamanca", "Santa Cruz de Tenerife", "Cantabria", "Segovia", "Sevilla", "Soria",
  "Tarragona", "Teruel", "Toledo", "Valencia", "Valladolid", "Vizcaya", "Zamora", "Zaragoza", "Ceuta", "Melilla",
];

/** Provincia de un código postal de España (5 cifras, de 01000 a 52999); null si no lo es. */
export function provinciaDeCodigoPostal(cp: string): string | null {
  const m = /^(\d{2})\d{3}$/.exec(cp.trim());
  return m ? PROVINCIA_POR_CP[Number(m[1])] || null : null;
}

const textoDe = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// Tabla/columna inexistente (migración aún sin aplicar).
function faltaEsquema(error: unknown) {
  const code = String((error as { code?: unknown })?.code ?? "");
  return ["42P01", "42703", "PGRST205", "PGRST204"].includes(code);
}

// Edad cumplida a partir de «AAAA-MM-DD» (null si la fecha no existe).
function edadDeFecha(fecha: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return null;
  const [a, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(Date.UTC(a, mes - 1, dia));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - a;
  if (hoy.getMonth() + 1 < mes || (hoy.getMonth() + 1 === mes && hoy.getDate() < dia)) edad -= 1;
  return edad;
}

// Hoy hace 14 años, en «AAAA-MM-DD» (la fecha más reciente que se puede elegir).
function fechaMaximaPerfil(): string {
  const h = new Date();
  return `${h.getFullYear() - EDAD_MINIMA}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
}

function fechaBonita(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return fecha;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).replace(/\./g, "");
}

// Lo que no vale de lo escrito (un campo vacío no es un error aquí: eso lo dice «faltan»).
function erroresPerfil(d: DatosPerfil): Partial<Record<keyof DatosPerfil, string>> {
  const e: Partial<Record<keyof DatosPerfil, string>> = {};
  const nombre = d.nombre.trim();
  if (nombre && (nombre.length < 2 || nombre.length > 60)) e.nombre = "El nombre debe tener entre 2 y 60 letras.";
  const usuario = d.usuario.trim();
  if (usuario && !/^[A-Za-z0-9._-]{3,24}$/.test(usuario)) {
    e.usuario = "El usuario debe tener de 3 a 24 caracteres: letras, números, punto, guion o guion bajo.";
  }
  const provincia = d.provincia.trim();
  if (provincia && (provincia.length < 2 || provincia.length > 60)) e.provincia = "La provincia debe tener entre 2 y 60 letras.";
  if (d.fecha) {
    const edad = edadDeFecha(d.fecha);
    if (edad === null || d.fecha < FECHA_MINIMA) e.fecha = "Elige una fecha de nacimiento válida.";
    else if (edad < EDAD_MINIMA) e.fecha = `Para tener cuenta hay que tener ${EDAD_MINIMA} años o más.`;
  }
  // Dirección de envío: opcional, pero si se empieza tiene que estar entera (como en Amazon) para servir en un pedido.
  const cp = d.codigoPostal.trim();
  const localidad = d.localidad.trim();
  const direccion = d.direccion.trim();
  const piso = d.piso.trim();
  if (cp || localidad || direccion || piso) {
    const espana = d.pais === PAIS_ESPANA || !d.pais;
    if (!cp) e.codigoPostal = "Falta el código postal de la dirección.";
    else if (espana ? !provinciaDeCodigoPostal(cp) : !/^[A-Za-z0-9][A-Za-z0-9 -]{1,8}[A-Za-z0-9]$/.test(cp)) {
      e.codigoPostal = espana ? "El código postal tiene 5 cifras (por ejemplo, 50410)." : "Revisa el código postal.";
    }
    if (!localidad) e.localidad = "Falta la localidad de la dirección.";
    else if (localidad.length < 2 || localidad.length > 60) e.localidad = "La localidad debe tener entre 2 y 60 letras.";
    if (!direccion) e.direccion = "Falta la dirección: calle o avenida y número.";
    else if (direccion.length < 5 || direccion.length > 120) e.direccion = "La dirección debe tener entre 5 y 120 caracteres.";
    else if (!/\d/.test(direccion) && !/\bs\/?n\b/i.test(direccion)) e.direccion = "Añade el número del portal (o «s/n» si no tiene).";
    if (piso.length > 40) e.piso = "El piso, la puerta y la letra, como mucho 40 caracteres.";
  }
  return e;
}

/** Dirección del perfil en una línea («C/ Mayor 5, 3º B · 50410 Cuarte de Huerva»); vacía si no hay. */
export function direccionEnUnaLinea(d: Pick<DatosPerfil, "direccion" | "piso" | "codigoPostal" | "localidad">): string {
  const calle = [d.direccion.trim(), d.piso.trim()].filter(Boolean).join(", ");
  const lugar = [d.codigoPostal.trim(), d.localidad.trim()].filter(Boolean).join(" ");
  return [calle, lugar].filter(Boolean).join(" · ");
}

// Datos obligatorios que aún faltan (la foto es opcional).
function faltan(d: DatosPerfil): string[] {
  const lista: string[] = [];
  if (!d.usuario.trim()) lista.push("usuario");
  if (!d.nombre.trim()) lista.push("nombre");
  if (!d.pais.trim()) lista.push("país");
  if (!d.provincia.trim()) lista.push(d.pais === PAIS_ESPANA || !d.pais ? "provincia" : "región");
  if (!d.fecha) lista.push("fecha de nacimiento");
  return lista;
}

// Fallos de los datos obligatorios (la dirección es opcional: nunca impide tener el perfil completo).
function erroresObligatorios(d: DatosPerfil): Partial<Record<keyof DatosPerfil, string>> {
  const { codigoPostal: _cp, localidad: _lo, direccion: _di, piso: _pi, ...resto } = erroresPerfil(d);
  return resto;
}

export function perfilCompleto(d: DatosPerfil): boolean {
  return faltan(d).length === 0 && Object.keys(erroresObligatorios(d)).length === 0;
}

// --- lectura y avisos compartidos --------------------------------------------------------------------------------

type Lectura = { disponible: false } | { disponible: true; conFoto: boolean; conDireccion: boolean; datos: DatosPerfil | null };

/** De una fila de perfiles_cliente (lo que haya) a los datos del formulario. */
export function datosDeFila(fila: Record<string, unknown>): DatosPerfil {
  return {
    usuario: textoDe(fila.usuario),
    nombre: textoDe(fila.nombre),
    pais: textoDe(fila.pais),
    provincia: textoDe(fila.provincia),
    fecha: textoDe(fila.fecha_nacimiento),
    foto: textoDe(fila.foto_url),
    codigoPostal: textoDe(fila.codigo_postal),
    localidad: textoDe(fila.localidad),
    direccion: textoDe(fila.direccion),
    piso: textoDe(fila.piso),
  };
}

// Con «*» la lectura funciona antes y después de cada migración (sin peticiones fallidas): qué columnas hay se sabe por la
// fila. Sin fila todavía, se ofrece todo y, si al guardar falta una columna, se guarda sin ella.
async function leerPerfil(uid: string): Promise<Lectura> {
  const r = await supabase.from("perfiles_cliente").select("*").eq("user_id", uid).maybeSingle();
  if (r.error) {
    if (faltaEsquema(r.error)) return { disponible: false };
    throw r.error;
  }
  const fila = r.data as Record<string, unknown> | null;
  if (!fila) return { disponible: true, conFoto: true, conDireccion: true, datos: null };
  return { disponible: true, conFoto: "foto_url" in fila, conDireccion: "codigo_postal" in fila, datos: datosDeFila(fila) };
}

// --- usuario y foto para el Foro ----------------------------------------------------------------------------------

export type PerfilForo = { usuario: string; foto: string };
// Lo ya pedido (null = esa persona no tiene usuario o no ha escrito en el Foro); se vuelve a pedir pasados 5 minutos.
const perfilesForo = new Map<string, { perfil: PerfilForo | null; hasta: number }>();
const VIGENCIA_PERFIL_FORO_MS = 5 * 60 * 1000;
let funcionForoDisponible = true;

// Usuario y foto de «Mi perfil» de quienes escriben en el Foro (función perfiles_publicos: solo esos dos datos y solo de
// quien ha escrito allí). Si la función aún no existe (migración sin aplicar), devuelve vacío y el Foro sigue como antes.
export async function perfilesPublicos(ids: string[]): Promise<Map<string, PerfilForo>> {
  const ahora = Date.now();
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  const pedir = unicos.filter((id) => (perfilesForo.get(id)?.hasta ?? 0) <= ahora);
  for (let i = 0; funcionForoDisponible && i < pedir.length; i += 200) {
    const lote = pedir.slice(i, i + 200);
    const { data, error } = await supabase.rpc("perfiles_publicos", { ids: lote });
    if (error) {
      const codigo = String((error as { code?: unknown }).code ?? "");
      if (["PGRST202", "42883", "42501", "PGRST205"].includes(codigo)) funcionForoDisponible = false;
      break;
    }
    const hasta = Date.now() + VIGENCIA_PERFIL_FORO_MS;
    for (const id of lote) perfilesForo.set(id, { perfil: null, hasta });
    for (const fila of (Array.isArray(data) ? data : []) as { user_id?: unknown; usuario?: unknown; foto_url?: unknown }[]) {
      const usuario = textoDe(fila.usuario);
      if (typeof fila.user_id === "string" && usuario) perfilesForo.set(fila.user_id, { perfil: { usuario, foto: textoDe(fila.foto_url) }, hasta });
    }
  }
  const encontrados = new Map<string, PerfilForo>();
  for (const id of unicos) {
    const p = perfilesForo.get(id)?.perfil;
    if (p) encontrados.set(id, p);
  }
  return encontrados;
}

// Al guardar el perfil en cualquier sitio, la pantalla obligatoria vuelve a mirar si ya está completo.
const oyentesGuardado = new Set<() => void>();
const avisarPerfilGuardado = () => oyentesGuardado.forEach((f) => f());

// ¿Está abierta «Completa tu perfil»? (Blue se esconde mientras tanto.)
let obligatorioVisible = false;
const oyentesVisible = new Set<() => void>();
function fijarObligatorioVisible(v: boolean) {
  if (obligatorioVisible === v) return;
  obligatorioVisible = v;
  oyentesVisible.forEach((f) => f());
}
const suscribirVisible = (f: () => void) => {
  oyentesVisible.add(f);
  return () => {
    oyentesVisible.delete(f);
  };
};
export function usePerfilObligatorioVisible(): boolean {
  return useSyncExternalStore(suscribirVisible, () => obligatorioVisible, () => false);
}

// ¿Está desplegado «Mi perfil» en Mi cuenta? Blue no aparece mientras tanto (dueño, 2026-11-03; components/Campanita.tsx,
// que además mira que se esté en /perfil: las pestañas de la tienda se quedan montadas al cambiar de una a otra).
let miPerfilAbierto = false;
const oyentesMiPerfil = new Set<() => void>();
function fijarMiPerfilAbierto(v: boolean) {
  if (miPerfilAbierto === v) return;
  miPerfilAbierto = v;
  oyentesMiPerfil.forEach((f) => f());
}
const suscribirMiPerfil = (f: () => void) => {
  oyentesMiPerfil.add(f);
  return () => {
    oyentesMiPerfil.delete(f);
  };
};
export function useMiPerfilAbierto(): boolean {
  return useSyncExternalStore(suscribirMiPerfil, () => miPerfilAbierto, () => false);
}

// --- piezas de la tarjeta ----------------------------------------------------------------------------------------

// Caja redondeada de cada dato: ✓ verde a la izquierda cuando está bien, flechas ⌃⌄ a la derecha en los desplegables y,
// encima, el control nativo invisible (`encima`) para que todo el campo sea tocable.
function CajaPerfil({
  valido,
  desplegable,
  enfocado,
  error,
  encima,
  ancho,
  sinHuecoDerecho,
  fija,
  children,
}: {
  valido?: boolean;
  desplegable?: boolean;
  enfocado?: boolean;
  error?: boolean;
  encima?: React.ReactNode;
  /** Ancho fijo (la edad, junto a la fecha); sin él, ocupa lo que queda de la fila. */
  ancho?: number;
  /** Sin el hueco de las flechas (caja estrecha que no es desplegable). */
  sinHuecoDerecho?: boolean;
  /** Dato que no se cambia aquí (el correo de la sesión): candado en vez de ✓ (el fondo sigue blanco, como toda la pantalla). */
  fija?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        ...(ancho ? { width: ancho } : { flex: 1 }),
        minWidth: 0,
        minHeight: 48,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: error ? P.danger : enfocado ? P.accent : P.line,
        backgroundColor: "#FFFFFF",
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 10,
        gap: 4,
        position: "relative",
      }}
    >
      <View style={{ width: 22, alignItems: "center" }}>
        {fija ? <Ionicons name="lock-closed" size={16} color={P.muted} /> : valido ? <Ionicons name="checkmark" size={20} color={P.ok} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0, justifyContent: "center" }}>{children}</View>
      {sinHuecoDerecho && !desplegable ? null : (
        <View style={{ width: 22, alignItems: "center" }}>{desplegable ? <Ionicons name="chevron-expand" size={18} color={P.text} /> : null}</View>
      )}
      {encima}
    </View>
  );
}

// Letra del correo de la sesión: la de los demás datos y, si es largo, algo más pequeña para que se lea entero.
function letraCorreo(correo: string): number {
  return Math.max(12, Math.min(ESTILO_TEXTO_PERFIL.fontSize, (ESTILO_TEXTO_PERFIL.fontSize * 27) / Math.max(1, correo.length)));
}

const ESTILO_NATIVO_INVISIBLE = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  opacity: 0,
  cursor: "pointer",
  // 16 px: con menos, Safari (iPhone) hace zoom al abrir el selector.
  fontSize: 16,
};

const ESTILO_TEXTO_PERFIL = { textAlign: "center" as const, fontSize: 15.5, fontWeight: "800" as const, color: P.text };

// Foto redonda (o silueta si no hay).
function Foto({ uri, lado, alt }: { uri: string; lado: number; alt: string }) {
  return (
    <View
      style={{
        width: lado,
        height: lado,
        borderRadius: lado / 2,
        overflow: "hidden",
        backgroundColor: P.fondo,
        borderWidth: 1.5,
        borderColor: P.line,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {uri ? (
        <SmartImage uri={uri} alt={alt} contentFit="cover" style={{ width: "100%", height: "100%" }} />
      ) : (
        <Ionicons name="person" size={Math.round(lado * 0.5)} color="rgba(11,33,56,0.28)" />
      )}
    </View>
  );
}

// --- la tarjeta ----------------------------------------------------------------------------------------------------

export default function PerfilPublico({
  uid,
  modo = "tarjeta",
  alCompletar,
  correo,
  cuenta,
  onDisponible,
}: {
  uid: string;
  /** «tarjeta»: en Mi cuenta, plegable. «obligatorio»: dentro de «Completa tu perfil». */
  modo?: "tarjeta" | "obligatorio";
  alCompletar?: () => void;
  /** Correo de la sesión: la cabecera dice «Tu cuenta está activa» y el correo sale en un recuadro más (no se cambia aquí). */
  correo?: string | null;
  /** Los botones de la cuenta («Cerrar sesión» y, al administrador, «Panel de control»): al final de la tarjeta, abierta o plegada. */
  cuenta?: React.ReactNode;
  /** Dice si «Mi perfil» se puede enseñar (si la tabla aún no existe, la pantalla enseña la cuenta por su cuenta). */
  onDisponible?: (disponible: boolean) => void;
}) {
  const obligatorio = modo === "obligatorio";
  // Vuelta de un enlace de «cambiar el correo» (Inicio de sesión y seguridad): la tarjeta se abre para decir cómo va.
  const [retornoCorreo] = useState<RetornoCorreo>(() => (obligatorio ? null : tomarRetornoCorreo()));
  const [estado, setEstado] = useState<"cargando" | "no-disponible" | "listo">("cargando");
  const [recorte, setRecorte] = useState<string | null>(null); // foto elegida, a la espera de recortarla
  useEffect(() => {
    if (estado !== "cargando") onDisponible?.(estado === "listo");
  }, [estado, onDisponible]);
  const [conFoto, setConFoto] = useState(true);
  // ¿Existen ya las columnas de la dirección? (migración 20261102120000_perfiles_direccion.sql)
  const [conDireccion, setConDireccion] = useState(true);
  const [datos, setDatos] = useState<DatosPerfil>(DATOS_VACIOS);
  const [guardado, setGuardado] = useState<DatosPerfil>(DATOS_VACIOS);
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [enfocado, setEnfocado] = useState<keyof DatosPerfil | null>(null);
  const [abierto, setAbierto] = useState(true);
  // Fecha y edad en la misma fila a partir de este ancho de pantalla (más estrecha, la fecha no se leería entera).
  const fechaYEdadJuntas = useWindowDimensions().width >= 370;

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const l = await leerPerfil(uid);
        if (!vivo) return;
        if (!l.disponible) {
          setEstado("no-disponible");
          return;
        }
        setConFoto(l.conFoto);
        setConDireccion(l.conDireccion);
        if (l.datos) {
          setDatos(l.datos);
          setGuardado(l.datos);
          // Completo: en Mi cuenta se enseña plegado (se abre al tocarlo), salvo al volver de un enlace del correo.
          if (!obligatorio && perfilCompleto(l.datos) && !retornoCorreo) setAbierto(false);
        } else {
          // Todavía sin guardar: se rellena con lo que escribió al registrarse (queda pendiente de guardar).
          const { data: s } = await supabase.auth.getSession();
          const meta = (s.session?.user?.user_metadata ?? {}) as Record<string, unknown>;
          if (!vivo) return;
          setDatos({ ...DATOS_VACIOS, nombre: textoDe(meta.full_name), usuario: textoDe(meta.username), pais: textoDe(meta.country) });
          setGuardado(DATOS_VACIOS);
        }
        setEstado("listo");
      } catch {
        if (vivo) setEstado("listo");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [uid, obligatorio, retornoCorreo]);

  // «Mi perfil» desplegado en Mi cuenta: Blue no aparece (y vuelve al plegarlo o al salir de la tarjeta).
  useEffect(() => {
    if (obligatorio) return;
    fijarMiPerfilAbierto(estado === "listo" && abierto);
    return () => fijarMiPerfilAbierto(false);
  }, [obligatorio, estado, abierto]);

  // En «Completa tu perfil» no sale la dirección: sus avisos tampoco.
  const errores = useMemo(() => (obligatorio || !conDireccion ? erroresObligatorios(datos) : erroresPerfil(datos)), [datos, obligatorio, conDireccion]);
  const primerError = Object.values(errores)[0];
  const pendientes = faltan(datos);
  const completo = pendientes.length === 0 && !primerError;
  const guardadoCompleto = perfilCompleto(guardado);
  const hayCambios = (Object.keys(DATOS_VACIOS) as (keyof DatosPerfil)[]).some((k) => datos[k].trim() !== guardado[k].trim());
  // En Mi cuenta se puede guardar a medias; en «Completa tu perfil», solo completo.
  const puedeGuardar = (obligatorio ? completo : hayCambios && !primerError) && !guardando && !subiendoFoto;
  const esEspana = datos.pais === PAIS_ESPANA;
  const edad = datos.fecha ? edadDeFecha(datos.fecha) : null;

  const cambiar = useCallback((campo: keyof DatosPerfil, valor: string) => {
    setAviso(null);
    setDatos((d) => {
      const nuevo = { ...d, [campo]: valor };
      // Las provincias son las de España: al cambiar de país se borra la que no corresponda.
      if (campo === "pais" && (valor === PAIS_ESPANA) !== (d.pais === PAIS_ESPANA)) nuevo.provincia = "";
      // Código postal de España sin provincia elegida: la provincia se pone sola (y el país, si estaba vacío).
      if (campo === "codigoPostal" && (d.pais === PAIS_ESPANA || !d.pais) && !d.provincia.trim()) {
        const provincia = provinciaDeCodigoPostal(valor);
        if (provincia) {
          nuevo.provincia = provincia;
          if (!d.pais) nuevo.pais = PAIS_ESPANA;
        }
      }
      return nuevo;
    });
  }, []);

  // Foto: se elige, se recorta (RecortarFoto: encuadre cuadrado de 320 px en JPEG) y se sube a la carpeta del cliente; se
  // guarda con «Guardar perfil».
  const elegirFoto = async () => {
    if (subiendoFoto || guardando) return;
    setAviso(null);
    let elegidas: Awaited<ReturnType<typeof pickMediaFilesWeb>>;
    try {
      elegidas = await pickMediaFilesWeb({ soloImagenes: true });
    } catch (e: unknown) {
      setAviso({ tipo: "error", texto: e instanceof Error ? e.message : "No se ha podido abrir el selector de fotos." });
      return;
    }
    const foto = elegidas.items.find((it) => it.kind === "image");
    for (const it of elegidas.items) {
      if (it === foto) continue;
      try {
        URL.revokeObjectURL(it.previewUrl);
      } catch {
        // nada
      }
    }
    if (!foto) {
      if (elegidas.skipped.length) setAviso({ tipo: "error", texto: "Esa foto no se puede usar. Prueba con una JPG o PNG." });
      return;
    }
    // En la web se recorta antes de subirla; fuera de la web, se reduce tal cual.
    if (Platform.OS === "web") {
      setRecorte(foto.previewUrl);
      return;
    }
    await subirFoto(await reducirImagenWeb(foto.file, LADO_FOTO, 0.85, true));
  };

  const subirFoto = async (archivo: File) => {
    setSubiendoFoto(true);
    try {
      const ruta = `${uid}/${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from(ALMACEN_FOTOS)
        .upload(ruta, archivo, { cacheControl: "31536000", upsert: false, contentType: "image/jpeg" });
      if (error) throw error;
      cambiar("foto", supabase.storage.from(ALMACEN_FOTOS).getPublicUrl(ruta).data.publicUrl);
    } catch {
      setAviso({ tipo: "error", texto: "No se ha podido subir la foto. Inténtalo de nuevo." });
    } finally {
      setSubiendoFoto(false);
    }
  };

  const guardar = async () => {
    if (!puedeGuardar) return;
    setGuardando(true);
    setAviso(null);
    const limpio: DatosPerfil = {
      usuario: datos.usuario.trim(),
      nombre: datos.nombre.trim(),
      pais: datos.pais.trim(),
      provincia: datos.provincia.trim(),
      fecha: datos.fecha,
      foto: conFoto ? datos.foto.trim() : "",
      // El código postal se guarda sin espacios de más y en mayúsculas (los de otros países llevan letras).
      codigoPostal: conDireccion ? datos.codigoPostal.trim().toUpperCase() : "",
      localidad: conDireccion ? datos.localidad.trim() : "",
      direccion: conDireccion ? datos.direccion.trim() : "",
      piso: conDireccion ? datos.piso.trim() : "",
    };
    const direccionAntes = direccionEnUnaLinea(guardado);
    const fila = (conDir: boolean) => ({
      user_id: uid,
      nombre: limpio.nombre || null,
      usuario: limpio.usuario || null,
      pais: limpio.pais || null,
      provincia: limpio.provincia || null,
      fecha_nacimiento: limpio.fecha || null,
      ...(conFoto ? { foto_url: limpio.foto || null } : {}),
      ...(conDir
        ? {
            codigo_postal: limpio.codigoPostal || null,
            localidad: limpio.localidad || null,
            direccion: limpio.direccion || null,
            piso: limpio.piso || null,
          }
        : {}),
    });
    // Las columnas de la dirección solo se mandan si hay una que guardar o que borrar: así quien no la usa (p. ej. en
    // «Completa tu perfil») no pide columnas que quizá aún no existen.
    const enviarDireccion = conDireccion && (!!direccionEnUnaLinea(limpio) || !!direccionAntes);
    try {
      let { error } = await supabase.from("perfiles_cliente").upsert(fila(enviarDireccion), { onConflict: "user_id" });
      // Aún sin las columnas de la dirección (migración sin aplicar): se guarda lo demás y la dirección deja de ofrecerse.
      let sinDireccion = false;
      if (error && enviarDireccion && faltaEsquema(error) && /codigo_postal|localidad|direccion|piso/.test(String((error as { message?: string }).message ?? ""))) {
        setConDireccion(false);
        sinDireccion = true;
        ({ error } = await supabase.from("perfiles_cliente").upsert(fila(false), { onConflict: "user_id" }));
      }
      if (sinDireccion) {
        limpio.codigoPostal = "";
        limpio.localidad = "";
        limpio.direccion = "";
        limpio.piso = "";
      }
      if (error) {
        const codigo = String((error as { code?: string }).code ?? "");
        setAviso({
          tipo: "error",
          texto:
            codigo === "23505"
              ? "Ese nombre de usuario ya está en uso. Prueba con otro."
              : codigo === "23514"
              ? `Revisa los datos: el usuario debe tener de 3 a 24 caracteres y hay que tener ${EDAD_MINIMA} años o más.`
              : faltaEsquema(error)
              ? "Esta función todavía no está disponible."
              : "No se ha podido guardar. Inténtalo de nuevo.",
        });
        return;
      }
      // El Foro enseña el nombre que está en los datos de la cuenta: se mantienen al día (si falla, el perfil ya está guardado).
      try {
        await supabase.auth.updateUser({
          data: {
            ...(limpio.nombre ? { full_name: limpio.nombre } : {}),
            ...(limpio.usuario ? { username: limpio.usuario } : {}),
            ...(limpio.pais ? { country: limpio.pais } : {}),
            ...(conFoto ? { avatar_url: limpio.foto || null } : {}),
          },
        });
      } catch {
        // no pasa nada
      }
      setDatos(limpio);
      setGuardado(limpio);
      perfilesForo.delete(uid); // el Foro vuelve a pedir su usuario y su foto
      setAviso({ tipo: "ok", texto: sinDireccion ? "Perfil guardado (la dirección todavía no se puede guardar)." : "Perfil guardado." });
      trackEvent("perfil_guardado", "Perfil: guardado");
      // Analítica propia (Administración → Usuarios): quién añade o cambia su dirección de envío (nunca la dirección).
      const direccionAhora = direccionEnUnaLinea(limpio);
      if (direccionAhora && direccionAhora !== direccionAntes) {
        trackEvent("perfil_direccion_guardada", "Perfil: dirección guardada", { metadata: { nueva: !direccionAntes } });
      }
      avisarPerfilGuardado();
      if (perfilCompleto(limpio)) {
        alCompletar?.();
        // Guardado completo: en Mi cuenta el desplegable se cierra solo (si falta algo, se queda abierto para verlo).
        if (!obligatorio) setAbierto(false);
      }
    } catch {
      setAviso({ tipo: "error", texto: "No se ha podido guardar. Inténtalo de nuevo." });
    } finally {
      setGuardando(false);
    }
  };

  if (estado === "no-disponible") return null;
  if (estado === "cargando") return <CargaMarca texto="Cargando tu perfil…" />;

  const web = Platform.OS === "web";
  const opcionesPais = datos.pais && !PAISES.includes(datos.pais) ? [datos.pais, ...PAISES] : PAISES;
  const opcionesProvincia = datos.provincia && !PROVINCIAS_ES.includes(datos.provincia) ? [datos.provincia, ...PROVINCIAS_ES] : PROVINCIAS_ES;
  const marcador = "rgba(11,33,56,0.40)";
  const sinOutline = Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : {};

  const campoTexto = (campo: "nombre" | "usuario", placeholder: string, etiqueta: string) => (
    <CajaPerfil valido={!!datos[campo].trim() && !errores[campo]} enfocado={enfocado === campo} error={!!errores[campo]}>
      <TextInput
        value={datos[campo]}
        onChangeText={(t) => cambiar(campo, t)}
        onFocus={() => setEnfocado(campo)}
        onBlur={() => setEnfocado((e) => (e === campo ? null : e))}
        placeholder={placeholder}
        placeholderTextColor={marcador}
        accessibilityLabel={etiqueta}
        maxLength={campo === "usuario" ? 24 : 60}
        autoCapitalize={campo === "usuario" ? "none" : "words"}
        autoCorrect={false}
        style={[ESTILO_TEXTO_PERFIL, { paddingVertical: 7, ...sinOutline }]}
      />
    </CajaPerfil>
  );

  const campoSelector = (campo: "pais" | "provincia", placeholder: string, etiqueta: string, opciones: string[]) => (
    <CajaPerfil
      valido={!!datos[campo].trim() && !errores[campo]}
      desplegable
      enfocado={enfocado === campo}
      encima={
        web ? (
          <select
            aria-label={etiqueta}
            value={datos[campo]}
            onChange={(e) => cambiar(campo, e.target.value)}
            onFocus={() => setEnfocado(campo)}
            onBlur={() => setEnfocado((v) => (v === campo ? null : v))}
            style={ESTILO_NATIVO_INVISIBLE}
          >
            <option value="">{placeholder}</option>
            {opciones.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : null
      }
    >
      <Text numberOfLines={1} style={[ESTILO_TEXTO_PERFIL, { paddingVertical: 7, color: datos[campo] ? P.text : marcador }]}>
        {datos[campo] || placeholder}
      </Text>
    </CajaPerfil>
  );

  // Campos de la dirección de envío (como en Amazon: el navegador puede rellenarlos con «autocompletar»).
  const campoDireccion = (
    campo: "codigoPostal" | "localidad" | "direccion" | "piso",
    placeholder: string,
    etiqueta: string,
    opciones: {
      max: number;
      ancho?: number;
      numerico?: boolean;
      autoComplete?: "postal-code" | "address-line1" | "address-line2";
      mayusculas?: "none" | "words" | "sentences" | "characters";
    }
  ) => (
    <CajaPerfil
      valido={!!datos[campo].trim() && !errores[campo]}
      enfocado={enfocado === campo}
      error={!!errores[campo] && !!datos[campo].trim()}
      ancho={opciones.ancho}
      sinHuecoDerecho={!!opciones.ancho}
    >
      <TextInput
        nativeID={`perfil-${campo}`}
        value={datos[campo]}
        onChangeText={(t) => cambiar(campo, opciones.numerico ? t.replace(/[^0-9]/g, "") : t)}
        onFocus={() => setEnfocado(campo)}
        onBlur={() => setEnfocado((e) => (e === campo ? null : e))}
        placeholder={placeholder}
        placeholderTextColor={marcador}
        accessibilityLabel={etiqueta}
        maxLength={opciones.max}
        autoComplete={opciones.autoComplete}
        keyboardType={opciones.numerico ? "number-pad" : "default"}
        inputMode={opciones.numerico ? "numeric" : "text"}
        autoCapitalize={opciones.mayusculas ?? "sentences"}
        autoCorrect={false}
        style={[ESTILO_TEXTO_PERFIL, { paddingVertical: 7, ...sinOutline }]}
      />
    </CajaPerfil>
  );
  // Provincia del código postal (España): se enseña al escribirlo y se avisa si no es la del perfil.
  const provinciaCp = esEspana || !datos.pais ? provinciaDeCodigoPostal(datos.codigoPostal) : null;
  const cpDeOtraProvincia = !!provinciaCp && !!datos.provincia.trim() && provinciaCp !== datos.provincia.trim();
  const apartadoDireccion =
    !obligatorio && conDireccion ? (
      <View nativeID="perfil-direccion-envio" style={{ gap: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: P.line, marginTop: 4 }}>
        <View style={{ alignItems: "center", gap: 2, paddingTop: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="location-outline" size={18} color={P.accent} />
            <Text style={{ color: P.text, fontWeight: "900", fontSize: 15.5 }}>Dirección de envío</Text>
          </View>
          <Text style={{ color: P.muted, fontWeight: "700", fontSize: 12.5, textAlign: "center" }}>Opcional · tus pedidos se rellenan solos</Text>
        </View>
        {/* Cada dato a lo ancho, como el resto del perfil: así una localidad larga («Cuarte de Huerva») se lee entera. */}
        <View style={{ flexDirection: "row" }}>
          {campoDireccion("codigoPostal", "Código postal", "Código postal", {
            max: esEspana || !datos.pais ? 5 : 10,
            numerico: esEspana || !datos.pais,
            autoComplete: "postal-code",
            mayusculas: "characters",
          })}
        </View>
        {provinciaCp ? (
          <Text
            nativeID="perfil-cp-provincia"
            style={{ color: cpDeOtraProvincia ? "#B45309" : P.muted, fontWeight: "800", fontSize: 12.5, textAlign: "center", lineHeight: 17 }}
          >
            {cpDeOtraProvincia
              ? `Ese código postal es de ${provinciaCp} y tu provincia es ${datos.provincia.trim()}: revísalo.`
              : `Código postal de ${provinciaCp}.`}
          </Text>
        ) : null}
        <View style={{ flexDirection: "row" }}>{campoDireccion("localidad", "Localidad", "Localidad", { max: 60, mayusculas: "words" })}</View>
        <View style={{ flexDirection: "row" }}>
          {campoDireccion("direccion", "Calle o avenida y número", "Dirección: calle o avenida y número de portal", { max: 120, autoComplete: "address-line1" })}
        </View>
        <View style={{ flexDirection: "row" }}>
          {campoDireccion("piso", "Piso, puerta y letra (opcional)", "Piso, puerta y letra", { max: 40, autoComplete: "address-line2", mayusculas: "characters" })}
        </View>
      </View>
    ) : null;

  const cajaEdad =
    edad !== null && edad >= 0 ? (
      <CajaPerfil valido={edad >= EDAD_MINIMA} ancho={fechaYEdadJuntas ? 112 : undefined} sinHuecoDerecho={fechaYEdadJuntas}>
        <Text accessibilityLabel="Edad" numberOfLines={1} style={[ESTILO_TEXTO_PERFIL, { paddingVertical: 7 }]}>
          {`${edad} Años`}
        </Text>
      </CajaPerfil>
    ) : null;

  const formulario = (
    <View style={{ width: "100%", maxWidth: 460, gap: 10 }}>
      {conFoto ? (
        <View style={{ alignItems: "center", gap: 6, paddingBottom: 2 }}>
          <Pressable
            nativeID="perfil-foto"
            onPress={elegirFoto}
            disabled={subiendoFoto}
            accessibilityRole="button"
            accessibilityLabel={datos.foto ? "Cambiar la foto de perfil" : "Añadir una foto de perfil"}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, position: "relative" })}
          >
            <Foto uri={datos.foto} lado={104} alt="Tu foto de perfil" />
            <View
              style={{
                position: "absolute",
                right: 0,
                bottom: 0,
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: P.accent,
                borderWidth: 2,
                borderColor: "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {subiendoFoto ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Ionicons name="camera" size={18} color="#FFFFFF" />}
            </View>
          </Pressable>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", minHeight: datos.foto ? 44 : 0 }}>
            <Text style={{ color: P.muted, fontWeight: "800", fontSize: 13.5, textAlign: "center" }}>
              {subiendoFoto ? "Subiendo la foto…" : datos.foto ? "Toca la foto para cambiarla" : "Toca para añadir tu foto (opcional)"}
            </Text>
            {datos.foto && !subiendoFoto ? (
              <Pressable onPress={() => cambiar("foto", "")} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }}>
                <Text style={{ color: P.muted, fontWeight: "800", fontSize: 13.5, textDecorationLine: "underline" }}>Quitar foto</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Usuario y nombre a lo ancho: así el nombre y los apellidos se leen enteros. */}
      <View style={{ flexDirection: "row" }}>{campoTexto("usuario", "Usuario", "Nombre de usuario")}</View>
      <View style={{ flexDirection: "row" }}>{campoTexto("nombre", "Nombre y apellidos", "Nombre")}</View>
      {/* El correo de la sesión, con los datos de la cuenta: a lo ancho y con candado (se cambia con el acceso, no aquí). */}
      {correo ? (
        <View style={{ flexDirection: "row" }}>
          <CajaPerfil fija>
            <Text
              nativeID="perfil-correo"
              accessibilityLabel={`Correo de la sesión: ${correo}`}
              numberOfLines={1}
              style={[ESTILO_TEXTO_PERFIL, { paddingVertical: 7, fontSize: letraCorreo(correo), color: P.muted }]}
            >
              {correo}
            </Text>
          </CajaPerfil>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: 10 }}>
        {campoSelector("pais", "País", "País", opcionesPais)}
        {esEspana || !datos.pais ? (
          campoSelector("provincia", "Provincia", "Provincia", opcionesProvincia)
        ) : (
          <CajaPerfil valido={!!datos.provincia.trim() && !errores.provincia} enfocado={enfocado === "provincia"} error={!!errores.provincia}>
            <TextInput
              value={datos.provincia}
              onChangeText={(t) => cambiar("provincia", t)}
              onFocus={() => setEnfocado("provincia")}
              onBlur={() => setEnfocado((e) => (e === "provincia" ? null : e))}
              placeholder="Región"
              placeholderTextColor={marcador}
              accessibilityLabel="Provincia o región"
              maxLength={60}
              autoCapitalize="words"
              style={[ESTILO_TEXTO_PERFIL, { paddingVertical: 7, ...sinOutline }]}
            />
          </CajaPerfil>
        )}
      </View>

      {/* La edad sale al elegir la fecha: a su lado si cabe; en pantallas estrechas, debajo. */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <CajaPerfil
          valido={!!datos.fecha && !errores.fecha}
          desplegable
          enfocado={enfocado === "fecha"}
          error={!!errores.fecha}
          encima={
            web ? (
              <input
                type="date"
                aria-label="Fecha de nacimiento"
                value={datos.fecha}
                min={FECHA_MINIMA}
                max={fechaMaximaPerfil()}
                onChange={(e) => cambiar("fecha", e.target.value)}
                onFocus={() => setEnfocado("fecha")}
                onBlur={() => setEnfocado((v) => (v === "fecha" ? null : v))}
                style={ESTILO_NATIVO_INVISIBLE}
              />
            ) : null
          }
        >
          <Text numberOfLines={1} style={[ESTILO_TEXTO_PERFIL, { paddingVertical: 7, color: datos.fecha ? P.text : marcador }]}>
            {datos.fecha ? fechaBonita(datos.fecha) : "Fecha de nacimiento"}
          </Text>
        </CajaPerfil>
        {fechaYEdadJuntas ? cajaEdad : null}
      </View>
      {!fechaYEdadJuntas && cajaEdad ? <View style={{ flexDirection: "row" }}>{cajaEdad}</View> : null}

      {apartadoDireccion}

      {primerError ? (
        <Text style={{ color: P.danger, fontWeight: "800", textAlign: "center", lineHeight: 19 }}>{primerError}</Text>
      ) : aviso ? (
        <Text accessibilityRole="alert" style={{ color: aviso.tipo === "ok" ? P.ok : P.danger, fontWeight: "800", textAlign: "center", lineHeight: 19 }}>
          {aviso.texto}
        </Text>
      ) : pendientes.length ? (
        <Text style={{ color: P.muted, fontWeight: "800", textAlign: "center", lineHeight: 19 }}>Falta: {pendientes.join(", ")}.</Text>
      ) : null}

      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <Pressable
          onPress={guardar}
          disabled={!puedeGuardar}
          accessibilityRole="button"
          accessibilityLabel={obligatorio ? "Guardar y continuar" : "Guardar perfil"}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: 48,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: P.accent,
            opacity: !puedeGuardar ? 0.5 : pressed ? 0.88 : 1,
          })}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>
            {guardando ? "Guardando…" : obligatorio ? "Guardar y continuar" : "Guardar perfil"}
          </Text>
        </Pressable>
        {!obligatorio ? (
          <Pressable
            onPress={() => {
              setDatos(guardado);
              setAviso(null);
            }}
            disabled={!hayCambios || guardando}
            accessibilityRole="button"
            accessibilityLabel="Deshacer los cambios"
            style={({ pressed }) => ({
              minHeight: 48,
              paddingHorizontal: 22,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#FFFFFF",
              borderWidth: 1.5,
              borderColor: P.line,
              opacity: !hayCambios || guardando ? 0.5 : pressed ? 0.88 : 1,
            })}
          >
            <Text style={{ color: P.text, fontWeight: "900", fontSize: 16 }}>Deshacer</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const ventanaRecorte = recorte ? (
    <RecortarFoto
      uri={recorte}
      onCancelar={() => {
        revocar(recorte);
        setRecorte(null);
        // Analítica propia (Administración → Usuarios): cuántos encuadran su foto y cuántos lo dejan.
        trackEvent("perfil_foto_cancelada", "Perfil: recorte de foto cancelado");
      }}
      onListo={(archivo) => {
        revocar(recorte);
        setRecorte(null);
        trackEvent("perfil_foto_encuadrada", "Perfil: foto encuadrada");
        void subirFoto(archivo);
      }}
    />
  ) : null;

  if (obligatorio) {
    return (
      <View nativeID="perfil-obligatorio-formulario" style={{ width: "100%", alignItems: "center" }}>
        {formulario}
        {ventanaRecorte}
      </View>
    );
  }

  return (
    <View nativeID="perfil-datos" style={{ gap: 14, alignItems: "center" }}>
      {/* Cabecera plegable: foto pequeña, «Mi perfil» y «@usuario · Completo». */}
      <Pressable
        nativeID="perfil-cabecera"
        onPress={() => setAbierto((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={abierto ? "Plegar mi perfil" : "Abrir mi perfil"}
        {...({ "aria-expanded": abierto } as object)}
        style={({ pressed }) => ({
          width: "100%",
          maxWidth: 460,
          minHeight: 62,
          borderRadius: 20,
          borderWidth: 1.5,
          borderColor: abierto ? P.accent : P.line,
          backgroundColor: "#FFFFFF",
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          gap: 10,
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <Foto uri={guardado.foto} lado={correo ? 46 : 40} alt="Foto de perfil" />
        <View style={{ flex: 1, minWidth: 0, alignItems: "center", paddingVertical: correo ? 8 : 0 }}>
          <Text style={{ color: P.text, fontWeight: "900", fontSize: 17, textAlign: "center" }}>Mi perfil</Text>
          {/* Subtítulo: la sesión está iniciada (punto verde). */}
          {correo ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 1 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: P.ok }} />
              <Text style={{ color: P.ok, fontWeight: "800", fontSize: 13.5 }}>Tu cuenta está activa</Text>
            </View>
          ) : null}
          <Text numberOfLines={1} style={{ color: P.muted, fontWeight: "800", fontSize: correo ? 12.5 : 13.5, textAlign: "center", marginTop: 1 }}>
            {guardado.usuario ? `@${guardado.usuario}` : "Sin usuario"} · {guardadoCompleto ? "Completo" : "Faltan datos"}
          </Text>
        </View>
        <View style={{ width: 40, alignItems: "center" }}>
          <Ionicons name={abierto ? "chevron-up" : "chevron-down"} size={20} color={P.muted} />
        </View>
      </Pressable>
      {/* Recién guardado y ya plegado: se dice aquí (dentro ya no se ve). */}
      {!abierto && aviso?.tipo === "ok" ? (
        <Text accessibilityRole="alert" style={{ color: P.ok, fontWeight: "800", textAlign: "center" }}>
          {aviso.texto}
        </Text>
      ) : null}
      {abierto ? formulario : null}
      {/* Inicio de sesión y seguridad: cambiar el correo y la contraseña (con la tarjeta abierta). */}
      {abierto && correo ? <SeguridadCuenta correo={correo} retorno={retornoCorreo} /> : null}
      {/* Los botones de la cuenta, siempre a mano (también plegado); abierto, separados de los datos por una línea fina. */}
      {cuenta ? (
        <View style={{ width: "100%", maxWidth: 460, ...(abierto ? { borderTopWidth: 1, borderTopColor: P.line, paddingTop: 14 } : null) }}>
          {cuenta}
        </View>
      ) : null}
      {ventanaRecorte}
    </View>
  );
}

// --- Inicio de sesión y seguridad: cambiar el correo y la contraseña (dueño, 2026-11-03, «que se vea profesional») ---
// Correo: se escribe el nuevo y Supabase manda un enlace al correo de antes y otro al nuevo («Secure email change»
// activado; plantilla supabase/templates/email_change.html). Se cambia al confirmar los dos; mientras, se dice que está
// pendiente. Los enlaces vuelven a /perfil?cuenta=correo y aquí se explica en español cómo va.
// Contraseña: la actual (se comprueba volviendo a entrar con ella), la nueva dos veces y «Mostrar»; si no se recuerda la
// actual, se manda el enlace de «¿Olvidaste tu contraseña?». Todos los errores de Supabase, en español.
// Analítica propia (Administración → Usuarios, nunca el correo): perfil_correo_cambio_pedido / _error, perfil_correo_cambiado,
// perfil_contrasena_cambiada / _error (con el motivo).

type RetornoCorreo = { tipo: "ok" | "medio" | "error"; texto: string } | null;

// Lo que trae la dirección al volver de un enlace de cambio de correo (se lee una vez; la dirección se limpia después de
// que Supabase haya leído su código, en SeguridadCuenta).
function leerRetornoCorreo(): RetornoCorreo {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const leer = (k: string) => q.get(k) ?? h.get(k) ?? "";
  if (leer("cuenta") !== "correo") return null;
  const error = leer("error_description") || leer("error");
  if (error) {
    return { tipo: "error", texto: mensajeAuthEnEspanol({ code: leer("error_code"), message: error }, "No se ha podido cambiar el correo. Vuelve a intentarlo.") };
  }
  if (leer("message")) {
    return { tipo: "medio", texto: "Primer enlace confirmado. Abre también el que te hemos enviado al otro correo para terminar el cambio." };
  }
  return { tipo: "ok", texto: "¡Listo! Tu correo ya está cambiado: desde ahora entras con el nuevo." };
}

// Se lee al cargar la página: el enrutador quita el «#…» de la dirección en cuanto arranca (y con él el error del enlace),
// antes de que la tarjeta se abra. Se usa una sola vez.
let retornoAlCargar: RetornoCorreo = leerRetornoCorreo();
function tomarRetornoCorreo(): RetornoCorreo {
  const r = retornoAlCargar ?? leerRetornoCorreo();
  retornoAlCargar = null;
  return r;
}

const esCorreoValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

function FilaSeguridad({
  id,
  icono,
  titulo,
  detalle,
  abierta,
  onPress,
}: {
  id: string;
  icono: React.ComponentProps<typeof Ionicons>["name"];
  titulo: string;
  detalle: string;
  abierta: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      nativeID={id}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${titulo}: ${abierta ? "cerrar" : "cambiar"}`}
      {...({ "aria-expanded": abierta } as object)}
      style={({ pressed }) => ({
        minHeight: 56,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: abierta ? P.accent : P.line,
        backgroundColor: "#FFFFFF",
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        gap: 10,
        opacity: pressed ? 0.88 : 1,
      })}
    >
      <Ionicons name={icono} size={20} color={P.accent} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: P.text, fontWeight: "900", fontSize: 15 }}>{titulo}</Text>
        <Text numberOfLines={1} style={{ color: P.muted, fontWeight: "700", fontSize: 12.5 }}>
          {detalle}
        </Text>
      </View>
      <Text style={{ color: P.accent, fontWeight: "900", fontSize: 14 }}>{abierta ? "Cerrar" : "Cambiar"}</Text>
    </Pressable>
  );
}

function SeguridadCuenta({ correo, retorno }: { correo: string; retorno: RetornoCorreo }) {
  const [abierta, setAbierta] = useState<"correo" | "contrasena" | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(
    retorno ? { tipo: retorno.tipo === "error" ? "error" : "ok", texto: retorno.texto } : null
  );
  const [enviando, setEnviando] = useState(false);
  const [nuevoCorreo, setNuevoCorreo] = useState("");
  const [pendiente, setPendiente] = useState<string | null>(null);
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repite, setRepite] = useState("");
  // ¿Ya se contó en esta visita un intento con una contraseña nueva demasiado corta?
  const cortaMedida = useRef(false);
  const [ver, setVer] = useState(false);
  const marcador = "rgba(11,33,56,0.40)";
  const sinOutline = Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : {};

  // ¿Hay un cambio de correo a medias? Y, al volver de un enlace, cuando Supabase ya ha leído su código: se limpia la
  // dirección, se pone al día la sesión (el correo nuevo) y se mide.
  useEffect(() => {
    let vivo = true;
    (async () => {
      if (retorno) {
        await supabase.auth.getSession();
        if (Platform.OS === "web" && typeof window !== "undefined") {
          try {
            window.history.replaceState(window.history.state, "", window.location.pathname);
          } catch {
            // sin historial
          }
        }
        if (retorno.tipo === "ok") {
          try {
            await supabase.auth.refreshSession();
          } catch {
            // el correo ya está cambiado en el servidor aunque esta sesión no se renueve
          }
          trackEvent("perfil_correo_cambiado", "Perfil: correo cambiado");
        }
      }
      try {
        const { data } = await supabase.auth.getUser();
        const nuevo = data.user?.new_email;
        if (vivo && nuevo && nuevo.toLowerCase() !== correo.toLowerCase()) setPendiente(nuevo);
      } catch {
        // sin datos: no se dice nada del cambio pendiente
      }
    })();
    return () => {
      vivo = false;
    };
  }, [correo, retorno]);

  const alternar = (cual: "correo" | "contrasena") => {
    setAviso(null);
    setAbierta((a) => (a === cual ? null : cual));
  };

  const pedirCambioCorreo = async () => {
    if (enviando) return;
    const e = nuevoCorreo.trim().toLowerCase();
    if (!esCorreoValido(e)) return setAviso({ tipo: "error", texto: "Escribe un correo válido." });
    if (e === correo.trim().toLowerCase()) return setAviso({ tipo: "error", texto: "Ese ya es tu correo." });
    setEnviando(true);
    setAviso(null);
    const redirectTo = Platform.OS === "web" && typeof window !== "undefined" ? `${window.location.origin}/perfil?cuenta=correo` : undefined;
    let error: unknown = null;
    try {
      ({ error } = await supabase.auth.updateUser({ email: e }, { emailRedirectTo: redirectTo }));
    } catch (err) {
      error = err;
    }
    setEnviando(false);
    if (error) {
      void trackEvent("perfil_correo_cambio_error", "Perfil: no se pudo pedir el cambio de correo", { metadata: { motivo: motivoErrorAuth(error) } });
      const codigo = String((error as { code?: unknown }).code ?? "");
      setAviso({
        tipo: "error",
        texto:
          codigo === "email_exists" || /already (been )?registered|already exists/i.test(String((error as { message?: unknown }).message ?? ""))
            ? "Ya hay otra cuenta con ese correo."
            : mensajeAuthEnEspanol(error, "No se ha podido pedir el cambio. Inténtalo de nuevo en unos minutos."),
      });
      return;
    }
    void trackEvent("perfil_correo_cambio_pedido", "Perfil: cambio de correo pedido");
    setPendiente(e);
    setNuevoCorreo("");
    setAbierta(null);
    setAviso({ tipo: "ok", texto: `Te hemos enviado un enlace a ${correo} y otro a ${e}. Ábrelos los dos para terminar el cambio (mira también en Spam).` });
  };

  const cambiarContrasena = async () => {
    if (enviando) return;
    const a = actual.trim();
    const n = nueva.trim();
    if (!a) return setAviso({ tipo: "error", texto: "Escribe tu contraseña actual." });
    if (n.length < CONTRASENA_MINIMA) {
      // Se cuenta una vez por visita (Administración → Usuarios), nunca la contraseña.
      if (!cortaMedida.current) {
        cortaMedida.current = true;
        void trackEvent("contrasena_corta", "Contraseña: más corta del mínimo", { metadata: { motivo: "perfil" } });
      }
      return setAviso({ tipo: "error", texto: `La contraseña nueva debe tener al menos ${CONTRASENA_MINIMA} caracteres.` });
    }
    if (n !== repite.trim()) return setAviso({ tipo: "error", texto: "Las dos contraseñas nuevas no coinciden." });
    if (n === a) return setAviso({ tipo: "error", texto: "La contraseña nueva tiene que ser distinta de la actual." });
    setEnviando(true);
    setAviso(null);
    try {
      // Se comprueba la actual volviendo a entrar con ella: nadie con el móvil desbloqueado la cambia sin saberla.
      const { error: e1 } = await supabase.auth.signInWithPassword({ email: correo.trim().toLowerCase(), password: a });
      if (e1) {
        const mala = String((e1 as { code?: unknown }).code ?? "") === "invalid_credentials" || /invalid login credentials/i.test(e1.message);
        void trackEvent("perfil_contrasena_error", "Perfil: no se pudo cambiar la contraseña", { metadata: { motivo: mala ? "actual" : motivoErrorAuth(e1) } });
        setAviso({ tipo: "error", texto: mala ? "La contraseña actual no es correcta." : mensajeAuthEnEspanol(e1, "No se ha podido cambiar la contraseña. Inténtalo de nuevo.") });
        return;
      }
      const { error: e2 } = await supabase.auth.updateUser({ password: n });
      if (e2) {
        void trackEvent("perfil_contrasena_error", "Perfil: no se pudo cambiar la contraseña", { metadata: { motivo: motivoErrorAuth(e2) } });
        setAviso({ tipo: "error", texto: mensajeAuthEnEspanol(e2, "No se ha podido cambiar la contraseña. Inténtalo de nuevo.") });
        return;
      }
      void trackEvent("perfil_contrasena_cambiada", "Perfil: contraseña cambiada");
      setActual("");
      setNueva("");
      setRepite("");
      setVer(false);
      setAbierta(null);
      setAviso({ tipo: "ok", texto: "Contraseña cambiada. La próxima vez entra con la nueva." });
    } catch (err) {
      setAviso({ tipo: "error", texto: mensajeAuthEnEspanol(err, "No se ha podido cambiar la contraseña. Inténtalo de nuevo.") });
    } finally {
      setEnviando(false);
    }
  };

  const olvidada = async () => {
    if (enviando) return;
    setEnviando(true);
    const r = await pedirEnlaceContrasena(correo.trim().toLowerCase());
    setEnviando(false);
    if (r.ok) {
      void trackEvent("contrasena_enlace_pedido", "Contraseña: enlace pedido", { metadata: { desde: "seguridad" } });
      setAviso({ tipo: "ok", texto: `Te hemos enviado un enlace a ${correo} para crear una contraseña nueva (mira también en Spam).` });
    } else {
      void trackEvent("contrasena_enlace_error", "Contraseña: no se pudo pedir el enlace", { metadata: { desde: "seguridad", motivo: r.motivo } });
      setAviso({ tipo: "error", texto: r.mensaje });
    }
  };

  const campo = (
    id: string,
    valor: string,
    cambiar: (t: string) => void,
    placeholder: string,
    etiqueta: string,
    tipo: "correo" | "clave-actual" | "clave-nueva"
  ) => (
    <View style={{ flexDirection: "row" }}>
      {/* La actual puede ser de 6 o 7 (cuentas antiguas); la nueva, de CONTRASENA_MINIMA o más. */}
      <CajaPerfil valido={tipo === "correo" ? esCorreoValido(valor) : valor.trim().length >= (tipo === "clave-nueva" ? CONTRASENA_MINIMA : 6)}>
        <TextInput
          nativeID={id}
          value={valor}
          onChangeText={(t) => {
            cambiar(t);
            setAviso(null);
          }}
          placeholder={placeholder}
          placeholderTextColor={marcador}
          accessibilityLabel={etiqueta}
          secureTextEntry={tipo !== "correo" && !ver}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={tipo === "correo" ? "email-address" : "default"}
          autoComplete={tipo === "correo" ? "email" : tipo === "clave-actual" ? "current-password" : "new-password"}
          textContentType={tipo === "correo" ? "emailAddress" : tipo === "clave-actual" ? "password" : "newPassword"}
          style={[ESTILO_TEXTO_PERFIL, { paddingVertical: 7, ...sinOutline }]}
        />
      </CajaPerfil>
    </View>
  );

  const botonAzul = (texto: string, onPress: () => void, id: string) => (
    <Pressable
      nativeID={id}
      onPress={onPress}
      disabled={enviando}
      accessibilityRole="button"
      style={({ pressed }) => ({
        minHeight: 48,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: P.accent,
        opacity: enviando ? 0.55 : pressed ? 0.88 : 1,
      })}
    >
      <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15.5 }}>{enviando ? "Un momento…" : texto}</Text>
    </Pressable>
  );

  return (
    <View nativeID="perfil-seguridad" style={{ width: "100%", maxWidth: 460, gap: 10, borderTopWidth: 1, borderTopColor: P.line, paddingTop: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <Ionicons name="shield-checkmark-outline" size={18} color={P.accent} />
        <Text style={{ color: P.text, fontWeight: "900", fontSize: 15.5 }}>Inicio de sesión y seguridad</Text>
      </View>

      <FilaSeguridad
        id="perfil-seguridad-correo"
        icono="mail-outline"
        titulo="Correo electrónico"
        detalle={pendiente ? `Cambio pendiente a ${pendiente}` : correo}
        abierta={abierta === "correo"}
        onPress={() => alternar("correo")}
      />
      {abierta === "correo" ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: P.muted, fontWeight: "700", fontSize: 13, textAlign: "center", lineHeight: 18 }}>
            Te enviaremos un enlace a tu correo actual y otro al nuevo: el cambio se hace al confirmar los dos.
          </Text>
          {campo("perfil-correo-nuevo", nuevoCorreo, setNuevoCorreo, "Correo nuevo", "Correo nuevo", "correo")}
          {botonAzul("Enviar los enlaces de confirmación", pedirCambioCorreo, "perfil-correo-enviar")}
        </View>
      ) : null}

      <FilaSeguridad
        id="perfil-seguridad-contrasena"
        icono="key-outline"
        titulo="Contraseña"
        detalle="••••••••"
        abierta={abierta === "contrasena"}
        onPress={() => alternar("contrasena")}
      />
      {abierta === "contrasena" ? (
        <View style={{ gap: 10 }}>
          {campo("perfil-clave-actual", actual, setActual, "Contraseña actual", "Contraseña actual", "clave-actual")}
          {campo("perfil-clave-nueva", nueva, setNueva, `Contraseña nueva (mínimo ${CONTRASENA_MINIMA})`, "Contraseña nueva", "clave-nueva")}
          {avisoContrasenaCorta(nueva) ? (
            <Text nativeID="perfil-clave-nueva-aviso" style={{ color: P.muted, fontWeight: "700", fontSize: 12.5, textAlign: "center" }}>
              {avisoContrasenaCorta(nueva)}
            </Text>
          ) : null}
          {campo("perfil-clave-repite", repite, setRepite, "Repite la contraseña nueva", "Repite la contraseña nueva", "clave-nueva")}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
            <Pressable
              onPress={() => setVer((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={ver ? "Ocultar las contraseñas" : "Mostrar las contraseñas"}
              style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4, opacity: pressed ? 0.7 : 1 })}
            >
              <Ionicons name={ver ? "eye-off-outline" : "eye-outline"} size={19} color={P.accent} />
              <Text style={{ color: P.text, fontWeight: "800" }}>{ver ? "Ocultar" : "Mostrar"}</Text>
            </Pressable>
            <Pressable
              nativeID="perfil-clave-olvidada"
              onPress={olvidada}
              disabled={enviando}
              accessibilityRole="button"
              style={({ pressed }) => ({ minHeight: 44, justifyContent: "center", paddingHorizontal: 4, opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={{ color: P.text, fontWeight: "800", textDecorationLine: "underline" }}>¿No recuerdas la actual?</Text>
            </Pressable>
          </View>
          {botonAzul("Cambiar contraseña", cambiarContrasena, "perfil-clave-guardar")}
        </View>
      ) : null}

      {aviso ? (
        <Text
          nativeID="perfil-seguridad-aviso"
          accessibilityRole="alert"
          style={{ color: aviso.tipo === "ok" ? P.ok : P.danger, fontWeight: "800", textAlign: "center", lineHeight: 19 }}
        >
          {aviso.texto}
        </Text>
      ) : null}
    </View>
  );
}

function revocar(url: string) {
  try {
    URL.revokeObjectURL(url);
  } catch {
    // nada
  }
}

// --- recortar la foto (web) ---------------------------------------------------------------------------------------

// La foto que se guarda: 320 × 320 px en JPEG (nítida en la foto grande de «Mi perfil» y ligera para el Foro, que enseña
// muchas a la vez).
const LADO_FOTO = 320;
const ZOOM_MAX = 4;

// La persona encuadra su foto: la arrastra para moverla y la acerca o aleja (− / + o la barra). El círculo marca lo que
// se verá en el Foro y en su perfil; se guarda el cuadrado entero (LADO_FOTO px, JPEG, fondo blanco si la foto tiene huecos).
// También la usa Administración → Categorías (app/admin/categories.tsx) para encuadrar las portadas del recuadro de
// Inicio: con `proporcion` (ancho / alto) la vista es ese recuadro, sin círculo (`redondo` false), con lo que va encima
// (`encima`: el nombre) y la foto al % elegido (`opacidadFoto`, solo en la vista: la foto se guarda entera). Con `remota`,
// la foto ya está subida y se pide con permiso (crossOrigin) para poder recortarla; si no se puede, lo dice.
export function RecortarFoto({
  uri,
  onCancelar,
  onListo,
  proporcion = 1,
  salida = { ancho: LADO_FOTO, alto: LADO_FOTO },
  redondo = true,
  titulo = "Encuadra tu foto",
  texto = "Arrástrala para moverla y acércala o aléjala. Se verá lo que queda dentro del círculo.",
  textoUsar = "Usar foto",
  encima,
  opacidadFoto = 1,
  remota = false,
  nativeID = "perfil-recorte",
  nombreArchivo = "perfil.jpg",
}: {
  uri: string;
  onCancelar: () => void;
  onListo: (archivo: File) => void;
  proporcion?: number;
  salida?: { ancho: number; alto: number };
  redondo?: boolean;
  titulo?: string;
  texto?: string;
  textoUsar?: string;
  encima?: React.ReactNode;
  opacidadFoto?: number;
  remota?: boolean;
  nativeID?: string;
  nombreArchivo?: string;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [fallo, setFallo] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [desplazamiento, setDesplazamiento] = useState({ x: 0, y: 0 }); // en px de la vista, desde el centro
  const [lado, setLado] = useState(280); // ancho de la vista en pantalla
  const ladoAlto = Math.round(lado / proporcion); // alto de la vista (con proporcion 1, cuadrada)
  const [preparando, setPreparando] = useState(false);
  const arrastre = useRef<{ id: number; x: number; y: number; dx: number; dy: number } | null>(null);

  useEffect(() => {
    const i = new window.Image();
    if (remota) i.crossOrigin = "anonymous";
    i.onload = () => setImg(i);
    i.onerror = () => setFallo(true);
    i.src = uri;
  }, [uri, remota]);

  // Tamaño de la foto en la vista: a zoom 1 la cubre entera (sin huecos ni a lo ancho ni a lo alto).
  const base = img ? Math.max(lado / (img.naturalWidth || 1), ladoAlto / (img.naturalHeight || 1)) : 1;
  const ancho = img ? img.naturalWidth * base * zoom : lado;
  const alto = img ? img.naturalHeight * base * zoom : ladoAlto;
  // Sin dejar huecos: la foto siempre cubre la vista.
  const limitar = useCallback(
    (d: { x: number; y: number }, z: number) => {
      if (!img) return { x: 0, y: 0 };
      const w = img.naturalWidth * base * z;
      const h = img.naturalHeight * base * z;
      const mx = Math.max(0, (w - lado) / 2);
      const my = Math.max(0, (h - ladoAlto) / 2);
      return { x: Math.min(mx, Math.max(-mx, d.x)), y: Math.min(my, Math.max(-my, d.y)) };
    },
    [img, base, lado, ladoAlto]
  );
  const cambiarZoom = (z: number) => {
    const nuevo = Math.min(ZOOM_MAX, Math.max(1, Math.round(z * 100) / 100));
    setZoom(nuevo);
    setDesplazamiento((d) => limitar({ x: (d.x * nuevo) / zoom, y: (d.y * nuevo) / zoom }, nuevo));
  };

  const usar = async () => {
    if (!img || preparando) return;
    setPreparando(true);
    try {
      const lienzo = document.createElement("canvas");
      lienzo.width = salida.ancho;
      lienzo.height = salida.alto;
      const ctx = lienzo.getContext("2d");
      if (!ctx) throw new Error("sin lienzo");
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, salida.ancho, salida.alto);
      ctx.imageSmoothingQuality = "high";
      const escala = salida.ancho / lado;
      const x = (lado - ancho) / 2 + desplazamiento.x;
      const y = (ladoAlto - alto) / 2 + desplazamiento.y;
      ctx.drawImage(img, x * escala, y * escala, ancho * escala, alto * escala);
      // Una foto remota sin permiso deja el lienzo «manchado»: toBlob falla y se avisa (fallo).
      const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/jpeg", 0.88));
      if (!blob) throw new Error("sin foto");
      onListo(new File([blob], nombreArchivo, { type: "image/jpeg" }));
    } catch {
      setFallo(true);
      setPreparando(false);
    }
  };

  const vista = (
    <div
      onPointerDown={(e) => {
        if (!img) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        arrastre.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: desplazamiento.x, dy: desplazamiento.y };
      }}
      onPointerMove={(e) => {
        const a = arrastre.current;
        if (!a || a.id !== e.pointerId) return;
        setDesplazamiento(limitar({ x: a.dx + e.clientX - a.x, y: a.dy + e.clientY - a.y }, zoom));
      }}
      onPointerUp={() => {
        arrastre.current = null;
      }}
      onPointerCancel={() => {
        arrastre.current = null;
      }}
      onWheel={(e) => cambiarZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
      aria-label="Arrastra la foto para encuadrarla"
      style={{
        position: "relative",
        width: lado,
        height: ladoAlto,
        overflow: "hidden",
        borderRadius: 18,
        // Sin círculo (portadas), el fondo es el del recuadro de Inicio: con la foto suave se ve igual que allí.
        background: redondo ? "#0B2138" : "#F6FAFD",
        border: redondo ? undefined : `1px solid ${P.line}`,
        boxSizing: "border-box",
        touchAction: "none",
        cursor: img ? "grab" : "default",
        userSelect: "none",
      }}
    >
      {img ? (
        <img
          src={uri}
          alt=""
          draggable={false}
          crossOrigin={remota ? "anonymous" : undefined}
          style={{
            position: "absolute",
            left: (lado - ancho) / 2 + desplazamiento.x,
            top: (ladoAlto - alto) / 2 + desplazamiento.y,
            width: ancho,
            height: alto,
            maxWidth: "none",
            opacity: opacidadFoto,
            pointerEvents: "none",
          }}
        />
      ) : null}
      {redondo ? (
        // Fuera del círculo, oscurecido: lo de dentro es lo que se verá.
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            boxShadow: "0 0 0 999px rgba(11,33,56,0.55)",
            border: "2px solid rgba(255,255,255,0.9)",
            pointerEvents: "none",
          }}
        />
      ) : null}
      {encima ? (
        <div style={{ position: "absolute", inset: 0, display: "flex", pointerEvents: "none" }}>{encima}</div>
      ) : null}
    </div>
  );

  const botonZoom = (icono: "remove" | "add", etiqueta: string, z: number) => (
    <Pressable
      onPress={() => cambiarZoom(z)}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1.5,
        borderColor: P.line,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FFFFFF",
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Ionicons name={icono} size={22} color={P.text} />
    </Pressable>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancelar}>
      <View
        nativeID={nativeID}
        style={{ flex: 1, backgroundColor: "rgba(11,33,56,0.55)", alignItems: "center", justifyContent: "center", padding: 16 }}
      >
        <View
          onLayout={(e) => {
            const nuevo = Math.max(200, Math.min(320, Math.floor(e.nativeEvent.layout.width - 32)));
            if (nuevo === lado) return;
            setLado(nuevo);
            setDesplazamiento({ x: 0, y: 0 });
          }}
          style={{ width: "100%", maxWidth: 380, backgroundColor: "#FFFFFF", borderRadius: 24, padding: 16, gap: 12, alignItems: "center" }}
        >
          <Text accessibilityRole="header" style={{ color: P.text, fontWeight: "900", fontSize: 18, textAlign: "center" }}>
            {titulo}
          </Text>
          <Text style={{ color: P.muted, fontWeight: "700", textAlign: "center", lineHeight: 19 }}>{texto}</Text>
          {fallo ? (
            <Text accessibilityRole="alert" style={{ color: P.danger, fontWeight: "800", textAlign: "center" }}>
              {remota
                ? "Esta foto no se puede encuadrar aquí. Quítala y vuelve a subirla: al subirla se encuadra."
                : "No se ha podido preparar esta foto. Prueba con otra."}
            </Text>
          ) : img ? (
            vista
          ) : (
            <View style={{ width: lado, height: ladoAlto, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator color={P.accent} />
            </View>
          )}
          {!fallo ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "stretch" }}>
              {botonZoom("remove", "Alejar", zoom / 1.25)}
              <View style={{ flex: 1, minWidth: 0 }}>
                <input
                  type="range"
                  aria-label="Acercar o alejar"
                  min={1}
                  max={ZOOM_MAX}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => cambiarZoom(Number(e.target.value))}
                  style={{ width: "100%", accentColor: P.accent, cursor: "pointer" }}
                />
              </View>
              {botonZoom("add", "Acercar", zoom * 1.25)}
            </View>
          ) : null}
          <View style={{ flexDirection: "row", gap: 10, alignSelf: "stretch" }}>
            <Pressable
              onPress={onCancelar}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 46,
                borderRadius: 999,
                borderWidth: 1.5,
                borderColor: P.line,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: P.text, fontWeight: "900", fontSize: 15.5 }}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={usar}
              disabled={!img || fallo || preparando}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 46,
                borderRadius: 999,
                backgroundColor: P.accent,
                alignItems: "center",
                justifyContent: "center",
                opacity: !img || fallo || preparando ? 0.5 : pressed ? 0.88 : 1,
              })}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15.5 }}>{preparando ? "Preparando…" : textoUsar}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// --- «Completa tu perfil» (obligatorio) --------------------------------------------------------------------------

// Donde no se exige: Mi cuenta (allí está la tarjeta), las políticas (se leen antes de dar datos), cambiar la contraseña y
// el panel de administración (es trabajo de la tienda, no una cuenta de cliente).
const SIN_OBLIGACION = /^\/(perfil|politicas|reset-password|admin)(\/|$)/;

export function PerfilObligatorio() {
  const pathname = usePathname() ?? "";
  const insets = useSafeAreaInsets();
  const [uid, setUid] = useState<string | null>(null);
  const [incompleto, setIncompleto] = useState(false);
  const [revisar, setRevisar] = useState(0);

  useEffect(() => {
    let vivo = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (vivo) setUid(data.session?.user?.id ?? null);
      })
      .catch(() => {});
    const { data } = supabase.auth.onAuthStateChange((_evento, sesion) => setUid(sesion?.user?.id ?? null));
    return () => {
      vivo = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const f = () => setRevisar((n) => n + 1);
    oyentesGuardado.add(f);
    return () => {
      oyentesGuardado.delete(f);
    };
  }, []);

  // Una lectura al iniciar sesión (y otra al guardar el perfil en cualquier sitio), no en cada pantalla.
  useEffect(() => {
    if (!uid) {
      setIncompleto(false);
      return;
    }
    let vivo = true;
    leerPerfil(uid)
      .then((l) => {
        if (vivo) setIncompleto(l.disponible && !(l.datos && perfilCompleto(l.datos)));
      })
      .catch(() => {
        if (vivo) setIncompleto(false);
      });
    return () => {
      vivo = false;
    };
  }, [uid, revisar]);

  const visible = !!uid && incompleto && !SIN_OBLIGACION.test(pathname);
  useEffect(() => {
    fijarObligatorioVisible(visible);
    if (visible) trackEvent("perfil_obligatorio_visto", "Perfil: completar (obligatorio)");
  }, [visible]);
  useEffect(() => () => fijarObligatorioVisible(false), []);

  if (!visible || !uid) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View nativeID="perfil-obligatorio" style={{ flex: 1, backgroundColor: P.fondo }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, alignItems: "center", paddingHorizontal: 16, paddingTop: insets.top + 28, paddingBottom: insets.bottom + 32, gap: 14 }}
        >
          <Text accessibilityRole="header" {...({ "aria-level": 1 } as object)} style={{ color: P.text, fontWeight: "900", fontSize: 26, textAlign: "center" }}>
            Completa tu perfil
          </Text>
          <Text style={{ color: P.muted, fontWeight: "700", fontSize: 15, lineHeight: 21, textAlign: "center", maxWidth: 420 }}>
            Para usar tu cuenta necesitamos estos datos. La foto es opcional.
          </Text>
          <View style={{ width: "100%", maxWidth: 480, backgroundColor: "#FFFFFF", borderRadius: 24, paddingVertical: 18, paddingHorizontal: 14 }}>
            <PerfilPublico uid={uid} modo="obligatorio" alCompletar={() => setIncompleto(false)} />
          </View>
          <Pressable
            onPress={() => router.push("/politicas/privacidad" as Href)}
            accessibilityRole="link"
            style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 12 }}
          >
            <Text style={{ color: P.accent, fontWeight: "800", textAlign: "center" }}>Cómo tratamos tus datos</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              trackEvent("perfil_obligatorio_salir", "Perfil: cerrar sesión desde completar");
              supabase.auth.signOut().catch(() => {});
            }}
            accessibilityRole="button"
            style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 12 }}
          >
            <Text style={{ color: P.muted, fontWeight: "800", textAlign: "center", textDecorationLine: "underline" }}>Cerrar sesión</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}
