// app/admin/login.tsx
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";

const COLORS = {
  bg: "#071E33",
  bg2: "#061A2C",
  card: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.12)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.75)",
  accent: "#00AAE4",
  danger: "#FCA5A5",
};

function normalizeEmail(s: string) {
  return (s ?? "").trim().toLowerCase();
}

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    return normalizeEmail(email).length > 3 && pass.trim().length >= 6 && !loading;
  }, [email, pass, loading]);

  async function signIn() {
    const e = normalizeEmail(email);
    const p = pass;

    if (!e || !p) {
      setMsg("Pon email y contraseña.");
      return;
    }

    setLoading(true);
    setMsg(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: e,
        password: p,
      });

      if (error) {
        setMsg(error.message);
        return;
      }

      const userId = data.user?.id;
      if (!userId) {
        setMsg("No se pudo iniciar sesión (sin userId).");
        return;
      }

      // Comprobar role=admin en profiles
      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle<{ role: string | null }>();

      if (profErr) {
        setMsg("No se pudo validar el perfil (profiles).");
        // Seguridad: cerrar sesión si no podemos validar permisos
        await supabase.auth.signOut();
        return;
      }

      if ((profile?.role ?? "") !== "admin") {
        setMsg("Esta cuenta no tiene permisos de administrador.");
        await supabase.auth.signOut();
        return;
      }

      router.replace("/admin");
    } catch (e: any) {
      setMsg(e?.message ?? "Error inesperado al iniciar sesión.");
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.06)",
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 12,
        }}
      >
        <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "900" }}>
          Admin · Videojuegoos
        </Text>
        <Text style={{ color: COLORS.muted, marginTop: 4 }}>
          Acceso privado para crear categorías y productos.
        </Text>
      </View>

      <View style={{ padding: 16, justifyContent: "center", flex: 1 }}>
        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.card,
            padding: 16,
            gap: 10,
          }}
        >
          <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: "900" }}>
            Iniciar sesión
          </Text>
          <Text style={{ color: COLORS.muted }}>
            Si no eres admin, te saco automáticamente (sin dramas).
          </Text>

          <TextInput
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              if (msg) setMsg(null);
            }}
            placeholder="Email"
            placeholderTextColor="rgba(255,255,255,0.45)"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={{
              marginTop: 8,
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 12,
              color: COLORS.text,
            }}
          />

          <TextInput
            value={pass}
            onChangeText={(t) => {
              setPass(t);
              if (msg) setMsg(null);
            }}
            placeholder="Contraseña"
            placeholderTextColor="rgba(255,255,255,0.45)"
            secureTextEntry
            style={{
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 12,
              color: COLORS.text,
            }}
          />

          {msg ? (
            <View
              style={{
                marginTop: 4,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(255,59,48,0.35)",
                backgroundColor: "rgba(255,59,48,0.12)",
                padding: 10,
              }}
            >
              <Text style={{ color: COLORS.danger, fontWeight: "800" }}>{msg}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={signIn}
            disabled={!canSubmit}
            style={({ pressed }) => ({
              marginTop: 10,
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: "center",
              backgroundColor: COLORS.accent,
              opacity: !canSubmit ? 0.45 : pressed ? 0.9 : 1,
            })}
          >
            {loading ? (
              <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <ActivityIndicator />
                <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Entrando...</Text>
              </View>
            ) : (
              <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Entrar</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => router.replace("/")}
            style={({ pressed }) => ({
              alignItems: "center",
              paddingTop: 10,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: "rgba(255,255,255,0.85)", fontWeight: "800" }}>
              ← Volver a la tienda
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
