import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

// ⚠️ IMPORTANTE: acceso directo (NO dinámico)
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ ERROR CRÍTICO: variables de entorno de Supabase no configuradas");
  console.error("Revisa tu .env.local:");

  console.error("EXPO_PUBLIC_SUPABASE_URL =", supabaseUrl);
  console.error("EXPO_PUBLIC_SUPABASE_ANON_KEY =", supabaseAnonKey);

  throw new Error("Faltan variables de entorno de Supabase");
}

const storage = Platform.OS === "web" ? undefined : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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
});