/**
 * Qué hace: crea y exporta el cliente único (singleton) de Supabase que
 * usa toda la app para autenticación y acceso a la base de datos.
 *
 * Cómo funciona: lee la URL y la clave anónima de las variables de entorno
 * EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY (si faltan, lanza
 * un error claro en consola al arrancar). Usa AsyncStorage para guardar la
 * sesión en nativo (en web usa el storage por defecto del navegador) y
 * globalThis.__videojuegoos_supabase__ para evitar crear más de un cliente
 * si el archivo se vuelve a importar (hot reload, etc.).
 *
 * Barra de carga global ("Pensando"): el cliente usa `trackedFetch` en vez
 * del fetch normal, que simplemente avisa a lib/loadingBus.ts justo antes de
 * lanzar cada petición real y en cuanto termina (éxito o error). Así,
 * components/GlobalLoadingBar.tsx sabe, sin que ninguna pantalla tenga que
 * avisar a mano, cuándo hay algo cargando en cualquier parte de la app.
 * SILENT_URL_PARTS excluye las llamadas silenciosas de fondo que no
 * bloquean nada que el usuario esté esperando ver (si no, la barra
 * parpadearía sola).
 *
 * Errores de la cuenta: mensajeAuthEnEspanol() traduce los de Supabase Auth (que llegan en inglés) y motivoErrorAuth()
 * los clasifica para la analítica propia; pedirEnlaceContrasena() pide el enlace de «¿Olvidaste tu contraseña?».
 *
 * Dispositivos (2026-11-12): registrarDispositivo() apunta en public.cliente_dispositivos desde qué tipo de dispositivo y
 * navegador entra el cliente con sesión y cuándo (como mucho cada 15 min; al iniciar sesión suma un inicio), sin IP ni
 * ubicación; nombreDispositivo() y haceCuanto() los usan también Administración → Usuarios y la ficha del cliente.
 *
 * Sesión al volver (2026-11-14): sesionActual() (la sesión, renovada antes si estaba caducada), esErrorDeSesion() (401,
 * 42501, JWT…: fallo de sesión, no «no hay datos») y alVolverALaTienda() (avisa al volver a la pantalla con la sesión ya
 * renovada); los usa «Mi perfil» (components/PerfilPublico.tsx). En la app nativa, la renovación automática solo con la
 * app delante (AppState), como recomienda Supabase.
 *
 * Conectado con: prácticamente todas las pantallas que leen o escriben
 * datos (app/(tabs)/*.tsx, app/admin/*.tsx, app/producto/[id].tsx,
 * app/catalogo.tsx) importan `supabase` desde aquí. app/_layout.tsx llama a registrarDispositivo();
 * app/admin/cliente/[userId].tsx, app/admin/users.tsx y app/admin/analytics.tsx leen esa tabla. lib/loadingBus.ts +
 * components/GlobalLoadingBar.tsx → la barra de carga global.
 */
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import { markEnd, markStart } from "./loadingBus";

/**
 * Trozos de URL que NO deben encender la barra de carga global: llamadas
 * silenciosas de fondo que no bloquean nada que el usuario esté esperando
 * ver en pantalla.
 * - analytics_events: registro propio de visitas (lib/analytics.ts).
 * - increment_product_view: suma 1 a las visitas de un producto en segundo
 *   plano al abrir su ficha.
 * - get_unread_chat_count: sondeo de la campanita cada 45s
 *   (components/Campanita.tsx).
 */
const SILENT_URL_PARTS = [
  "analytics_events",
  "increment_product_view",
  "get_unread_chat_count",
  // cliente_dispositivos: la última conexión del cliente, en segundo plano (registrarDispositivo, abajo).
  "rest/v1/cliente_dispositivos",
];

function isSilentRequest(url: string): boolean {
  return SILENT_URL_PARTS.some((part) => url.includes(part));
}

function trackedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request)?.url ?? "";

  const silent = isSilentRequest(url);

  if (!silent) markStart();

  return fetch(input as any, init).finally(() => {
    if (!silent) markEnd();
  });
}

const rawSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const rawSupabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabaseUrl = rawSupabaseUrl?.trim();
const supabaseAnonKey = rawSupabaseAnonKey?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ ERROR CRÍTICO: variables de entorno de Supabase no configuradas");
  console.error("Revisa tu .env.local o variables de entorno en build:");
  console.error("EXPO_PUBLIC_SUPABASE_URL =", supabaseUrl || "(vacía)");
  console.error(
    "EXPO_PUBLIC_SUPABASE_ANON_KEY =",
    supabaseAnonKey ? "(configurada)" : "(vacía)"
  );

  throw new Error("Faltan variables de entorno de Supabase");
}

const SUPABASE_URL: string = supabaseUrl;
const SUPABASE_ANON_KEY: string = supabaseAnonKey;

const storage = Platform.OS === "web" ? undefined : AsyncStorage;

declare global {
  var __videojuegoos_supabase__: SupabaseClient | undefined;
}

function createSupabaseSingleton(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: Platform.OS === "web",
      flowType: "pkce",
      storageKey: "videojuegoos.supabase.auth",
    },
    global: {
      headers: {
        "X-Client-Info": "videojuegoos-expo-app",
      },
      fetch: trackedFetch,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });
}

export const supabase: SupabaseClient =
  globalThis.__videojuegoos_supabase__ ?? createSupabaseSingleton();

if (!globalThis.__videojuegoos_supabase__) {
  globalThis.__videojuegoos_supabase__ = supabase;
  // Fuera de la web (app nativa), como recomienda Supabase: la renovación automática del token solo con la app delante.
  // En la web (y la app instalada en el iPhone) ya lo hace Supabase solo con «visibilitychange».
  if (Platform.OS !== "web") {
    AppState.addEventListener("change", (s) => {
      if (s === "active") void supabase.auth.startAutoRefresh();
      else void supabase.auth.stopAutoRefresh();
    });
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Sesión al volver a la tienda (fallo real del 2026-11-14, iPhone con la app instalada): tras una noche dormida, la
// renovación del token se disparó decenas de veces seguidas, Supabase la cortó (429) y quitó la sesión, y las lecturas
// salieron con la clave anónima (401 / 42501). «Mi perfil» lo tomaba por «no hay datos» y enseñaba el formulario vacío.
// sesionActual() pide la sesión a Supabase (la renueva ANTES si está caducada; null si no hay o no se pudo renovar),
// esErrorDeSesion() reconoce esos fallos y alVolverALaTienda() avisa al volver a la pantalla, ya con la sesión renovada.
// ---------------------------------------------------------------------------------------------------------------------

/** La sesión vigente (renovada si estaba caducada) o null si no hay o no se ha podido renovar. Nunca lanza. */
export async function sesionActual(): Promise<Session | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session ?? null;
  } catch {
    return null;
  }
}

/** ¿El fallo de una consulta es por la sesión (token caducado, sin sesión o sin permiso), y no porque no haya datos? */
export function esErrorDeSesion(error: unknown): boolean {
  const e = (error ?? {}) as { code?: unknown; message?: unknown; status?: unknown };
  const codigo = String(e.code ?? "");
  const status = Number(e.status ?? 0);
  return (
    status === 401 ||
    status === 403 ||
    ["42501", "PGRST301", "PGRST302", "PGRST303"].includes(codigo) ||
    /jwt|permission denied|not authenticated|sin sesión/i.test(String(e.message ?? ""))
  );
}

/**
 * Llama a `f` cada vez que se vuelve a la tienda (pestaña o app instalada otra vez a la vista, o vuelta desde la caché de
 * «atrás»), DESPUÉS de renovar la sesión si estaba caducada: así lo que pida `f` ya sale con un token válido.
 * Devuelve la función para dejar de escuchar.
 */
export function alVolverALaTienda(f: () => void): () => void {
  const avisar = () => void sesionActual().then(() => f());
  if (Platform.OS === "web" && typeof document !== "undefined" && typeof window !== "undefined") {
    const visible = () => {
      if (document.visibilityState === "visible") avisar();
    };
    const mostrada = (e: PageTransitionEvent) => {
      if (e.persisted) avisar();
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("pageshow", mostrada);
    return () => {
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("pageshow", mostrada);
    };
  }
  const sub = AppState.addEventListener("change", (s) => {
    if (s === "active") avisar();
  });
  return () => sub.remove();
}

// ---------------------------------------------------------------------------------------------------------------------
// Errores de la cuenta en español. Supabase los da en inglés («email rate limit exceeded», «Invalid login
// credentials»…): el cliente nunca los ve tal cual. Se mira primero el código (auth-js v2) y, si no hay, el texto; lo
// que no se conoce sale con un mensaje genérico en español.
// ---------------------------------------------------------------------------------------------------------------------

type ErrorAuth = { code?: unknown; message?: unknown; status?: unknown; name?: unknown } | null | undefined;

/** Para la analítica propia: de qué tipo es el fallo (nunca el correo ni el texto). */
export type MotivoErrorAuth = "limite" | "correo" | "red" | "enlace" | "contrasena" | "otro";

function piezasError(error: unknown) {
  const e = (error ?? {}) as Exclude<ErrorAuth, null | undefined>;
  return { codigo: String(e.code ?? ""), texto: String(e.message ?? ""), status: Number(e.status ?? 0), nombre: String(e.name ?? "") };
}

export function motivoErrorAuth(error: unknown): MotivoErrorAuth {
  const { codigo, texto, status, nombre } = piezasError(error);
  if (/rate_limit/.test(codigo) || status === 429 || /rate limit|too many|after \d+ seconds?/i.test(texto)) return "limite";
  if (/email_address|email/.test(codigo) || /email address|invalid format|validate email|not authorized/i.test(texto)) return "correo";
  if (/fetch|network/i.test(texto) || nombre === "AuthRetryableFetchError") return "red";
  if (/otp_expired|flow_state|code_verifier/.test(codigo) || /expired|flow state|link is invalid/i.test(texto)) return "enlace";
  if (/password/.test(codigo) || /password/i.test(texto)) return "contrasena";
  return "otro";
}

/**
 * Mínimo de caracteres de una contraseña NUEVA: al crear la cuenta, al recuperarla y al cambiarla en Mi perfil (dueño,
 * 2026-11-05: «sube la contraseña a 8»). Tiene que coincidir con Supabase → Authentication → Sign In / Providers → Email
 * → «Minimum password length» (lo cambia el dueño). Para ENTRAR no se exige: las cuentas que ya tienen una de 6 o 7
 * siguen entrando con ella.
 */
export const CONTRASENA_MINIMA = 8;

/** Aviso mientras se escribe una contraseña nueva demasiado corta («Mínimo 8 caracteres: te faltan 3»); null si vale o está vacía. */
export function avisoContrasenaCorta(clave: string): string | null {
  const n = clave.trim().length;
  if (n === 0 || n >= CONTRASENA_MINIMA) return null;
  const faltan = CONTRASENA_MINIMA - n;
  return `Mínimo ${CONTRASENA_MINIMA} caracteres: ${faltan === 1 ? "te falta 1" : `te faltan ${faltan}`}.`;
}

export function mensajeAuthEnEspanol(error: unknown, generico = "No se ha podido completar. Inténtalo de nuevo en unos minutos."): string {
  const { codigo, texto, status, nombre } = piezasError(error);
  const segundos = /after (\d+) seconds?/i.exec(texto)?.[1];
  if (codigo === "invalid_credentials" || /invalid login credentials/i.test(texto)) return "Email o contraseña incorrectos.";
  if (codigo === "email_not_confirmed" || /email not confirmed/i.test(texto)) {
    return "Aún no has confirmado tu correo: abre el enlace que te enviamos al crear la cuenta.";
  }
  if (codigo === "user_already_exists" || codigo === "email_exists" || /already (been )?registered|already exists/i.test(texto)) {
    return "Ya hay una cuenta con ese correo. Inicia sesión o recupera la contraseña.";
  }
  if (segundos) return `Por seguridad, espera ${segundos} segundos antes de volver a pedirlo.`;
  if (codigo === "over_email_send_rate_limit" || /email rate limit/i.test(texto)) {
    return "Ahora mismo no podemos enviar más correos. Inténtalo dentro de un rato o escríbenos por el chat de la tienda.";
  }
  if (/rate_limit/.test(codigo) || status === 429 || /rate limit|too many/i.test(texto)) return "Demasiados intentos seguidos. Espera un minuto y vuelve a probar.";
  if (codigo === "email_address_not_authorized" || /not authorized/i.test(texto)) {
    return "No hemos podido enviar el correo a esa dirección. Escríbenos por el chat de la tienda y te ayudamos.";
  }
  if (codigo === "email_address_invalid" || /invalid format|email address .* is invalid|validate email/i.test(texto)) return "Ese correo no parece válido. Revísalo.";
  if (codigo === "same_password" || /different from the old password/i.test(texto)) return "La contraseña nueva tiene que ser distinta de la anterior.";
  if (codigo === "weak_password" || /password should|weak password|known to be weak/i.test(texto)) {
    return "Esa contraseña es demasiado fácil o muy conocida. Prueba con otra más larga, mezclando letras y números.";
  }
  if (/otp_expired|flow_state|code_verifier/.test(codigo) || /expired|flow state|link is invalid/i.test(texto)) return "Este enlace ha caducado o ya se ha usado. Pide uno nuevo.";
  if (codigo === "session_not_found" || codigo === "refresh_token_not_found" || /session missing|session not found/i.test(texto)) {
    return "Tu sesión ha caducado. Vuelve a iniciar sesión o pide un enlace nuevo.";
  }
  if (codigo === "signup_disabled" || /signups not allowed/i.test(texto)) return "Ahora mismo no se pueden crear cuentas nuevas. Escríbenos por el chat de la tienda.";
  if (/failed to fetch|network|load failed|fetch failed/i.test(texto) || nombre === "AuthRetryableFetchError") {
    return "No hay conexión. Comprueba tu internet y vuelve a intentarlo.";
  }
  return generico;
}

/**
 * Pide el enlace para crear una contraseña nueva (Perfil → «¿Olvidaste tu contraseña?» y app/reset-password.tsx, si el
 * enlace no sirve). El enlace vuelve a /reset-password de esta misma tienda. La respuesta es la misma exista o no una
 * cuenta con ese correo (así nadie comprueba qué correos están registrados).
 */
export async function pedirEnlaceContrasena(
  email: string
): Promise<{ ok: true } | { ok: false; mensaje: string; motivo: MotivoErrorAuth }> {
  const redirectTo = Platform.OS === "web" && typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (!error) return { ok: true };
    return { ok: false, mensaje: mensajeAuthEnEspanol(error, "No se ha podido enviar el enlace. Inténtalo de nuevo en unos minutos."), motivo: motivoErrorAuth(error) };
  } catch (e) {
    return { ok: false, mensaje: mensajeAuthEnEspanol(e, "No se ha podido enviar el enlace. Inténtalo de nuevo en unos minutos."), motivo: motivoErrorAuth(e) };
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Dispositivos y última conexión (dueño, 2026-11-12: la ficha del cliente enseña desde qué dispositivos entra y cuándo fue
// la última vez). Tabla public.cliente_dispositivos (migración 20261112120000_cliente_dispositivos.sql). Solo se guarda el
// tipo y el navegador legibles («iPhone · Safari»), si usa la app instalada y las fechas: NUNCA la IP, la ubicación ni el
// identificador completo del navegador (de él solo se saca aquí ese nombre corto, y no sale del dispositivo).
// Con sesión: al abrir la tienda o volver a ella, como mucho una vez cada 15 min por cuenta y dispositivo (la marca se
// guarda en AsyncStorage / localStorage); al iniciar sesión (sesión nueva en este dispositivo, ver idDeSesion), siempre,
// y suma un inicio. Las fechas las pone la base de
// datos y cada inicio suma exactamente 1 (lo hace su disparador: aquí «inicios: 0» solo significa «un inicio más»).
// Nunca rompe nada ni deja errores en la consola: si la tabla aún no existe, se deja de intentar hasta recargar.
// ---------------------------------------------------------------------------------------------------------------------

export const DISPOSITIVO_CADA_MS = 15 * 60_000;
const DISPOSITIVO_CLAVE = "videojuegoszaragoza:dispositivo_visto:";
const DISPOSITIVO_SESION_CLAVE = "videojuegoszaragoza:dispositivo_sesion:";
let dispositivosSinTabla = false;

/** Nombre corto y legible del dispositivo («iPhone · Safari», «Android · Chrome», «Windows · Edge»…), máx. 60 letras. */
export function nombreDispositivo(agente: string, toques = 0): string {
  const ua = agente || "";
  let sistema = "Otro";
  if (/iPhone|iPod/.test(ua)) sistema = "iPhone";
  else if (/iPad/.test(ua) || (/Macintosh/.test(ua) && toques > 1)) sistema = "iPad";
  else if (/Android/.test(ua)) sistema = /Mobile/.test(ua) ? "Android" : "Tablet Android";
  else if (/CrOS/.test(ua)) sistema = "Chromebook";
  else if (/Windows/.test(ua)) sistema = "Windows";
  else if (/Macintosh|Mac OS X/.test(ua)) sistema = "Mac";
  else if (/Linux/.test(ua)) sistema = "Linux";
  let navegador = "Navegador";
  if (/Edg(e|A|iOS)?\//.test(ua)) navegador = "Edge";
  else if (/OPR\/|Opera/.test(ua)) navegador = "Opera";
  else if (/SamsungBrowser/.test(ua)) navegador = "Samsung Internet";
  else if (/Firefox\/|FxiOS/.test(ua)) navegador = "Firefox";
  else if (/Chrome\/|CriOS/.test(ua)) navegador = "Chrome";
  else if (/Safari\//.test(ua)) navegador = "Safari";
  return `${sistema} · ${navegador}`.slice(0, 60);
}

/** «hace 5 min», «hace 2 h», «hace 3 días» (para la última conexión en Administración). */
export function haceCuanto(iso: string | null | undefined, ahora = Date.now()): string {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(t)) return "";
  const min = Math.max(0, Math.round((ahora - t) / 60_000));
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 31) return d === 1 ? "hace 1 día" : `hace ${d} días`;
  const m = Math.round(d / 30);
  return m <= 1 ? "hace 1 mes" : `hace ${m} meses`;
}

function datosDelDispositivo(): { dispositivo: string; app_instalada: boolean } {
  if (Platform.OS !== "web" || typeof navigator === "undefined") {
    return { dispositivo: `${Platform.OS === "ios" ? "iPhone" : Platform.OS === "android" ? "Android" : "Otro"} · App`, app_instalada: true };
  }
  let instalada = false;
  try {
    instalada =
      (typeof window !== "undefined" && !!window.matchMedia?.("(display-mode: standalone)").matches) ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    // sin matchMedia: navegador normal
  }
  return { dispositivo: nombreDispositivo(navigator.userAgent ?? "", Number(navigator.maxTouchPoints ?? 0)), app_instalada: instalada };
}

// Id de la sesión de Supabase Auth que va dentro del token («session_id»): es nuevo en cada inicio de sesión y no cambia
// al renovar el token. Supabase repite el aviso «SIGNED_IN» cada vez que se abre la tienda o se vuelve a la pestaña, así
// que un inicio de sesión de verdad se reconoce porque ese id cambia. Solo se lee el id, no se guarda nada más del token.
function idDeSesion(token: string | null | undefined): string {
  try {
    const parte = String(token ?? "").split(".")[1] ?? "";
    if (!parte || typeof atob !== "function") return "";
    const json = atob(parte.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(parte.length / 4) * 4, "="));
    const id = (JSON.parse(json) as { session_id?: unknown }).session_id;
    return typeof id === "string" ? id.slice(0, 64) : "";
  } catch {
    return "";
  }
}

/**
 * Apunta la conexión de este dispositivo (app/_layout.tsx, con el token de la sesión). Si la sesión es nueva en este
 * dispositivo (acaba de iniciar sesión) no espera los 15 min y suma un inicio. Primero intenta poner al día su fila y, si
 * aún no la tiene, la crea (empieza con 1 inicio).
 */
export function registrarDispositivo(userId: string, token?: string | null): Promise<void> {
  // De una en una: al abrir la tienda llegan dos avisos seguidos y no deben contar dos veces el mismo inicio.
  colaDispositivo = colaDispositivo.then(() => registrarAhora(userId, token));
  return colaDispositivo;
}
let colaDispositivo: Promise<void> = Promise.resolve();

async function registrarAhora(userId: string, token?: string | null): Promise<void> {
  if (!userId || dispositivosSinTabla) return;
  try {
    const { dispositivo, app_instalada } = datosDelDispositivo();
    const clave = `${DISPOSITIVO_CLAVE}${userId}`;
    const claveSesion = `${DISPOSITIVO_SESION_CLAVE}${userId}`;
    const sesion = idDeSesion(token);
    const inicio = !!sesion && (await AsyncStorage.getItem(claveSesion).catch(() => null)) !== sesion;
    if (!inicio) {
      const ultima = Number((await AsyncStorage.getItem(clave).catch(() => null)) ?? 0);
      if (Date.now() - ultima < DISPOSITIVO_CADA_MS) return;
    }
    await AsyncStorage.setItem(clave, String(Date.now())).catch(() => {});
    if (inicio) await AsyncStorage.setItem(claveSesion, sesion).catch(() => {});
    const cambio: Record<string, unknown> = { app_instalada, ultima_vez: new Date().toISOString() };
    if (inicio) cambio.inicios = 0;
    const puesta = await supabase.from("cliente_dispositivos").update(cambio).eq("user_id", userId).eq("dispositivo", dispositivo).select("id");
    if (puesta.error) {
      if (/PGRST205|42P01/.test(String(puesta.error.code ?? "")) || /cliente_dispositivos/.test(String(puesta.error.message ?? ""))) dispositivosSinTabla = true;
      return;
    }
    if ((puesta.data ?? []).length > 0) return;
    // Primera vez en este dispositivo (si a la vez lo crea otra pestaña, la base de datos no lo duplica).
    await supabase.from("cliente_dispositivos").insert({ user_id: userId, dispositivo, app_instalada });
  } catch {
    // Apuntar la conexión nunca debe romper la tienda.
  }
}