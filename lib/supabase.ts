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