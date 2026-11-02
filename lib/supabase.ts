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
 * Conectado con: prácticamente todas las pantallas que leen o escriben
 * datos (app/(tabs)/*.tsx, app/admin/*.tsx, app/producto/[id].tsx,
 * app/catalogo.tsx) importan `supabase` desde aquí. lib/loadingBus.ts +
 * components/GlobalLoadingBar.tsx → la barra de carga global.
 */
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
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