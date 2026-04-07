import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

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