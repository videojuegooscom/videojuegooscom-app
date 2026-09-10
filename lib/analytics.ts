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
 * - Consentimiento: respeta el aviso de cookies/analítica (ver
 *   components/CookieConsentBanner.tsx). Jefe decidió "seguimiento completo
 *   con aviso de cookies", así que mientras el visitante no haya contestado
 *   el aviso SÍ se registra su recorrido; si pulsa "Rechazar" se deja de
 *   enviar cualquier evento nuevo. La decisión se guarda en AsyncStorage
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

/** Guarda la decisión del aviso de cookies/analítica y actualiza la caché en memoria. */
export async function setAnalyticsConsent(value: "accepted" | "declined"): Promise<void> {
  consentCache = value;
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
