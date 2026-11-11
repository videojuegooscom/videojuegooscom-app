// lib/analytics.ts
/**
 * Qué hace: cliente de analítica propia (sin librerías externas de terceros
 * tipo Google Analytics). Genera un identificador de "sesión de visita" por
 * dispositivo, adjunta el user_id si hay sesión iniciada, y envía eventos a
 * la tabla analytics_events de Supabase para poder reconstruir el recorrido
 * de cada visita (Inicio → Scroll → Categoría → Producto → Reseñas, etc.)
 * desde el panel de administración.
 *
 * Cómo funciona:
 * - session_id: UUID que se genera la primera vez que se llama a trackEvent
 *   en esta "visita" y se guarda en AsyncStorage junto a la hora del último
 *   evento. Mientras no pasen más de SESSION_TTL_MS (30 min) sin actividad,
 *   los eventos siguientes reutilizan el mismo session_id (así navegar por
 *   varias pantallas cuenta como una sola visita en el embudo); pasado ese
 *   tiempo se genera una sesión nueva, como en cualquier herramienta de
 *   analítica web.
 * - Consentimiento (RGPD): respeta el aviso de cookies/analítica (ver
 *   components/CookieConsentBanner.tsx). NO se envía nada a Supabase (ni se
 *   crea el session_id en el dispositivo) hasta que el visitante pulsa
 *   "Aceptar". Mientras no ha contestado, los eventos de esta visita se
 *   guardan solo en memoria (cola limitada a MAX_PENDING_EVENTS): si acepta,
 *   se envían en ese momento; si rechaza (o cierra la pestaña sin contestar),
 *   se descartan y no sale nada. Con "Rechazar" tampoco se envía ningún
 *   evento posterior. La decisión se guarda en AsyncStorage
 *   (getAnalyticsConsent/setAnalyticsConsent) y se cachea en memoria para no
 *   leer el storage en cada evento.
 * - trackEvent() nunca bloquea la UI ni lanza errores hacia quien la llama:
 *   cualquier fallo (sin red, RLS, AsyncStorage no disponible, etc.) se
 *   traga en silencio, porque perder un evento de analítica no debe romper
 *   la experiencia de compra.
 * - Visitas del propio admin: si hay sesión iniciada, se comprueba (y se
 *   cachea en memoria) el rol en "profiles"; si es "admin" (Jefe navegando
 *   su propia tienda) no se registra nada, para que las estadísticas del
 *   panel reflejen solo a clientes reales.
 * - trackEventThrottled() es una variante para eventos que se disparan muy
 *   seguido (el típico "Scroll"): ignora llamadas repetidas de la misma
 *   clave antes de que pase un intervalo mínimo, para no inundar la tabla.
 *
 * Conectado con:
 * - lib/supabase.ts → cliente usado para leer la sesión (user_id) y para el
 *   insert en analytics_events.
 * - components/CookieConsentBanner.tsx → lee/escribe el consentimiento con
 *   getAnalyticsConsent()/setAnalyticsConsent().
 * - app/(tabs)/index.tsx, app/catalogo.tsx, app/producto/[id].tsx → llaman a
 *   trackEvent()/trackEventThrottled() en los pasos del recorrido (Inicio,
 *   Scroll, Categoría, Categoría X, Producto, Reseñas...).
 * - components/Campanita.tsx → «Crear cuenta gratis» de los avisos de Blue
 *   (marcarOrigenRegistro): la cuenta creada después se cuenta aparte.
 * - app/noticias/[id].tsx → página de cada noticia (vista por categoría y
 *   llegada desde un buscador, medirNoticiaDesdeBuscador).
 * - app/admin/analytics.tsx → lee analytics_events indirectamente, a través
 *   de las funciones SQL analytics_totals / analytics_daily_visitors /
 *   analytics_funnel / analytics_top_metadata, para el panel de métricas.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

const SESSION_ID_KEY = "videojuegoos.analytics.session_id";
const SESSION_STAMP_KEY = "videojuegoos.analytics.session_last_seen";
const CONSENT_KEY = "videojuegoos.analytics.consent"; // "accepted" | "declined"
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutos sin actividad = nueva sesión

export type AnalyticsConsent = "accepted" | "declined" | null;

let sessionIdCache: string | null = null;
let consentCache: AnalyticsConsent | undefined; // undefined = aún no leído de storage

type QueuedEvent = {
  eventName: string;
  stepLabel: string;
  opts?: { path?: string; metadata?: Record<string, unknown> };
};

// Eventos de la visita actual a la espera de que el visitante conteste el
// aviso. Solo en memoria: nunca se guardan en el dispositivo ni se envían
// sin consentimiento.
const MAX_PENDING_EVENTS = 50;
const pendingEvents: QueuedEvent[] = [];

function makeId(): string {
  // UUID v4 sencillo sin dependencias extra: solo hace falta que sea único
  // para agrupar eventos de una misma visita, no criptográficamente perfecto.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function getOrCreateSessionId(): Promise<string> {
  const now = Date.now();

  if (sessionIdCache) {
    AsyncStorage.setItem(SESSION_STAMP_KEY, String(now)).catch(() => {});
    return sessionIdCache;
  }

  try {
    const [storedId, storedStamp] = await Promise.all([
      AsyncStorage.getItem(SESSION_ID_KEY),
      AsyncStorage.getItem(SESSION_STAMP_KEY),
    ]);

    const lastSeen = storedStamp ? Number(storedStamp) : 0;
    const isFresh = Boolean(storedId) && lastSeen > 0 && now - lastSeen < SESSION_TTL_MS;

    const sessionId = isFresh ? (storedId as string) : makeId();
    sessionIdCache = sessionId;

    await Promise.all([
      AsyncStorage.setItem(SESSION_ID_KEY, sessionId),
      AsyncStorage.setItem(SESSION_STAMP_KEY, String(now)),
    ]);

    return sessionId;
  } catch {
    // Si AsyncStorage falla (modo privado, cuota, etc.) usamos una sesión
    // solo en memoria: dura menos, pero no rompe nada.
    if (!sessionIdCache) sessionIdCache = makeId();
    return sessionIdCache;
  }
}

/** Lee el consentimiento guardado: "accepted" | "declined" | null (aún no contestó). */
export async function getAnalyticsConsent(): Promise<AnalyticsConsent> {
  if (consentCache !== undefined) return consentCache;

  try {
    const raw = await AsyncStorage.getItem(CONSENT_KEY);
    consentCache = raw === "accepted" || raw === "declined" ? raw : null;
  } catch {
    consentCache = null;
  }

  return consentCache;
}

/** true solo si el visitante ha aceptado expresamente la analítica. */
export async function hasAnalyticsConsent(): Promise<boolean> {
  return (await getAnalyticsConsent()) === "accepted";
}

/**
 * Guarda la decisión del aviso de cookies/analítica y actualiza la caché en
 * memoria. Si acepta, envía los eventos de esta visita que estaban en cola;
 * si rechaza, los descarta sin enviar nada.
 */
export async function setAnalyticsConsent(value: "accepted" | "declined"): Promise<void> {
  consentCache = value;

  const queued = pendingEvents.splice(0, pendingEvents.length);
  if (value === "accepted") {
    // En orden y sin bloquear a quien llama (el banner se cierra al momento).
    (async () => {
      for (const ev of queued) {
        await sendEvent(ev);
      }
    })();
  }

  try {
    await AsyncStorage.setItem(CONSENT_KEY, value);
  } catch {
    // ignore: si no se puede guardar, se volverá a preguntar la próxima vez.
  }
}

// Caché en memoria de "¿este user_id es admin?", para no consultar la tabla
// profiles en cada evento: solo hace falta una vez por sesión y por usuario
// (los visitantes anónimos, la inmensa mayoría, ni siquiera la tocan).
const adminCheckCache = new Map<string, boolean>();

async function isAdminUser(userId: string): Promise<boolean> {
  if (adminCheckCache.has(userId)) return adminCheckCache.get(userId) as boolean;

  try {
    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle<{ role: string | null }>();

    const result = String(data?.role ?? "").trim().toLowerCase() === "admin";
    adminCheckCache.set(userId, result);
    return result;
  } catch {
    return false;
  }
}

/**
 * Registra un evento del recorrido del visitante en analytics_events.
 * - eventName: identificador técnico corto y estable (ej. "page_view", "scroll").
 * - stepLabel: texto legible que se ve en el embudo del panel admin
 *   (ej. "Inicio", "Categoría Playstation 5", "Producto Ps5 + Mando").
 * - opts.path: ruta/pantalla actual (opcional, informativo).
 * - opts.metadata: datos extra en JSON (ej. { category: "Playstation 5" }).
 *
 * No registra nada mientras Jefe navega la tienda con su propia cuenta de
 * administrador (igual que el contador de visitas de cada producto): así
 * las estadísticas reflejan solo a los clientes reales, nunca sus propias
 * pruebas o revisiones del catálogo.
 */
export async function trackEvent(
  eventName: string,
  stepLabel: string,
  opts?: { path?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  try {
    const consent = await getAnalyticsConsent();
    if (consent === "declined") return; // el visitante rechazó el seguimiento

    if (consent !== "accepted") {
      // Aún no ha contestado: se guarda en memoria y solo se enviará si acepta.
      if (pendingEvents.length < MAX_PENDING_EVENTS) {
        pendingEvents.push({ eventName, stepLabel, opts: { path: opts?.path, metadata: opts?.metadata } });
      }
      return;
    }

    await sendEvent({ eventName, stepLabel, opts });
  } catch {
    // La analítica nunca debe romper la experiencia de la tienda.
  }
}

// Envío real a Supabase. Solo se llama con consentimiento aceptado.
async function sendEvent({ eventName, stepLabel, opts }: QueuedEvent): Promise<void> {
  try {
    if (consentCache !== "accepted") return;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? null;

    if (userId && (await isAdminUser(userId))) return;

    const sessionId = await getOrCreateSessionId();

    await supabase.from("analytics_events").insert({
      session_id: sessionId,
      user_id: userId,
      event_name: eventName,
      step_label: stepLabel,
      path: opts?.path ?? null,
      metadata: opts?.metadata ?? {},
    });
  } catch {
    // La analítica nunca debe romper la experiencia de la tienda.
  }
}

// Desde dónde se abrió el formulario de Vender («guia» = la persona vio «Vender ahora» en la guía de Blue y abrió el
// formulario después, «blue» = un mensaje o el panel de Blue). Sirve para medir cuántos llegan al formulario desde la
// guía y cuántos lo envían. Solo vive en memoria. `minutos`: cuánto tiempo vale la marca (la de la guía, una hora).
let origenVender: { origen: string; hasta: number } | null = null;
export function marcarOrigenVender(origen: string | null, minutos?: number): void {
  origenVender = origen ? { origen, hasta: minutos ? Date.now() + minutos * 60_000 : Infinity } : null;
}
export function leerOrigenVender(): string | null {
  if (origenVender && Date.now() > origenVender.hasta) origenVender = null;
  return origenVender?.origen ?? null;
}

// Redes sociales (dueño, 2026-11-04, tras publicar el carrusel «Regístrate»): de qué red llega la visita y si crea una
// cuenta en esa visita, para saber qué red funciona mejor. Se mira una sola vez al abrir la tienda: el enlace de la
// biografía con ?utm_source=instagram|tiktok, la página de la que viene o el navegador de la propia app. Solo vive en
// memoria (no se guarda nada en el dispositivo) y se cuenta con trackEvent: solo llega a la analítica de quien la
// acepta. Administración → Analítica lo enseña en «Redes sociales: Instagram y TikTok».
export type RedSocial = "instagram" | "tiktok";
export const NOMBRE_RED: Record<RedSocial, string> = { instagram: "Instagram", tiktok: "TikTok" };
let redOrigen: RedSocial | null = null;
let llegadaMedida = false;

/** De qué red llega una visita (o null). `via`: el enlace con utm, la página de la que viene o el navegador de la app. */
export function detectarRedOrigen(
  direccion: string,
  referente: string,
  agente: string
): { red: RedSocial; via: "enlace" | "pagina" | "app" } | null {
  try {
    const params = new URL(direccion).searchParams;
    for (const clave of ["utm_source", "ref", "origen"]) {
      const valor = (params.get(clave) ?? "").trim().toLowerCase();
      if (valor === "instagram" || valor === "ig") return { red: "instagram", via: "enlace" };
      if (valor === "tiktok" || valor === "tt") return { red: "tiktok", via: "enlace" };
    }
  } catch {
    // dirección rara: se mira lo demás
  }
  try {
    const host = referente ? new URL(referente).hostname.toLowerCase() : "";
    if (/(^|\.)instagram\.com$/.test(host)) return { red: "instagram", via: "pagina" };
    if (/(^|\.)tiktok\.com$/.test(host)) return { red: "tiktok", via: "pagina" };
  } catch {
    // sin página de origen válida
  }
  // Navegador dentro de la app: Instagram pone «Instagram» en su identificador y TikTok, «musical_ly» o «Bytedance».
  if (/Instagram/.test(agente)) return { red: "instagram", via: "app" };
  if (/musical_ly|BytedanceWebview|TikTok/i.test(agente)) return { red: "tiktok", via: "app" };
  return null;
}

/** Al abrir la tienda (app/_layout.tsx): si la visita llega de Instagram o TikTok, se cuenta una vez. */
export function medirLlegadaDesdeRedes(): void {
  if (llegadaMedida || typeof window === "undefined" || typeof document === "undefined") return;
  llegadaMedida = true;
  const origen = detectarRedOrigen(window.location.href, document.referrer ?? "", navigator.userAgent ?? "");
  if (!origen) return;
  redOrigen = origen.red;
  trackEvent("llegada_redes", `Redes: llegada desde ${NOMBRE_RED[origen.red]}`, {
    path: window.location.pathname,
    metadata: { red: origen.red, via: origen.via },
  });
}

// Desde dónde se fue a crear la cuenta (dueño, 2026-11-11: los avisos de Blue de bajadas de precio y artículos nuevos son
// solo para clientes con cuenta). «blue_avisos» = «Crear cuenta gratis» del panel de Blue (components/Campanita.tsx). Solo
// vive en memoria y caduca a la hora; si la cuenta se crea antes, se cuenta aparte (Administración → Analítica).
let origenRegistro: { origen: string; hasta: number } | null = null;
export function marcarOrigenRegistro(origen: string): void {
  origenRegistro = { origen, hasta: Date.now() + 60 * 60_000 };
}

/** Al crear una cuenta (app/(tabs)/perfil.tsx): se cuenta y, si la visita llegó de una red, también de cuál. */
export function medirCuentaCreada(): void {
  trackEvent("registro", "Registro: cuenta creada", { metadata: { red: redOrigen ?? "otra" } });
  if (redOrigen) {
    trackEvent("registro_redes", `Redes: registro desde ${NOMBRE_RED[redOrigen]}`, { metadata: { red: redOrigen } });
  }
  if (origenRegistro && Date.now() < origenRegistro.hasta && origenRegistro.origen === "blue_avisos") {
    trackEvent("registro_blue_avisos", "Blue: cuenta creada tras «Crear cuenta gratis» (avisos)", { metadata: { desde: "panel de Blue" } });
  }
  origenRegistro = null;
}

// Noticias desde Google (dueño, 2026-11-09: atraer visitas orgánicas con las noticias). Solo el NOMBRE del buscador
// (Google, Bing…), nunca la búsqueda ni la dirección completa de la que viene, y solo si la visita ENTRÓ en la tienda por
// una noticia (la página con la que se abrió). Una vez por visita y con trackEvent (solo con la analítica aceptada).
// Administración → Analítica lo enseña en «Noticias: visitas desde Google» (#analitica-noticias-organicas).
const paginaDeEntrada = typeof window !== "undefined" && window.location ? window.location.pathname : "";
let buscadorNoticiaMedido = false;

/** Qué buscador manda la visita (por la página de la que viene), o null. */
export function detectarBuscadorOrigen(referente: string): string | null {
  let host = "";
  try {
    host = referente ? new URL(referente).hostname.toLowerCase() : "";
  } catch {
    return null;
  }
  if (!host) return null;
  if (/(^|\.)google\.[a-z.]+$/.test(host) || /googlequicksearchbox/.test(host)) return "Google";
  if (/(^|\.)bing\.com$/.test(host)) return "Bing";
  if (/(^|\.)duckduckgo\.com$/.test(host)) return "DuckDuckGo";
  if (/(^|\.)yahoo\.[a-z.]+$/.test(host)) return "Yahoo";
  if (/(^|\.)ecosia\.org$/.test(host)) return "Ecosia";
  return null;
}

/** En la página de una noticia (app/noticias/[id].tsx): si la visita entró por ella desde un buscador, se cuenta una vez. */
export function medirNoticiaDesdeBuscador(path: string): void {
  if (buscadorNoticiaMedido || typeof document === "undefined") return;
  buscadorNoticiaMedido = true;
  if (!/^\/noticias(\/|$)/.test(paginaDeEntrada)) return;
  const buscador = detectarBuscadorOrigen(document.referrer ?? "");
  if (!buscador) return;
  trackEvent("noticia_buscador", `Noticias: llegada desde buscador · ${buscador}`, { path, metadata: { buscador } });
}

const lastTrackedAt = new Map<string, number>();

/**
 * Como trackEvent(), pero pensada para eventos que se disparan muy seguido
 * (el típico "Scroll"): si ya se registró un evento con la misma `key` hace
 * menos de minIntervalMs (4s por defecto), esta llamada no hace nada. Así
 * evitamos mandar un evento por cada pixel desplazado.
 */
export function trackEventThrottled(
  key: string,
  eventName: string,
  stepLabel: string,
  opts?: { path?: string; metadata?: Record<string, unknown>; minIntervalMs?: number }
): void {
  const now = Date.now();
  const last = lastTrackedAt.get(key) ?? 0;
  const minInterval = opts?.minIntervalMs ?? 4000;
  if (now - last < minInterval) return;

  lastTrackedAt.set(key, now);
  trackEvent(eventName, stepLabel, opts);
}
