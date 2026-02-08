import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";

const COLORS = {
  bg: "#071E33",
  card: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.12)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.75)",
  accent: "#00AAE4",
};

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    setMsg(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: pass,
    });

    if (error) {
      setMsg(error.message);
      setLoading(false);
      return;
    }

    const userId = data.user?.id;
    if (!userId) {
      setMsg("No se pudo iniciar sesión.");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (profile?.role !== "admin") {
      setMsg("Esta cuenta no tiene permisos de administrador.");
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    router.replace("/admin");
    setLoading(false);
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg, padding: 16, justifyContent: "center" }}>
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
        <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "900" }}>
          Admin · Videojuegoos
        </Text>
        <Text style={{ color: COLORS.muted }}>
          Acceso privado para crear categorías y productos.
        </Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="rgba(255,255,255,0.45)"
          autoCapitalize="none"
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
          onChangeText={setPass}
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

        {msg ? <Text style={{ color: "#FCA5A5", marginTop: 6 }}>{msg}</Text> : null}

        <Pressable
          onPress={signIn}
          disabled={loading}
          style={{
            marginTop: 10,
            borderRadius: 14,
            paddingVertical: 14,
            alignItems: "center",
            backgroundColor: COLORS.accent,
            opacity: loading ? 0.6 : 1,
          }}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
            {loading ? "Entrando..." : "Entrar"}
          </Text>
        </Pressable>

        <Pressable onPress={() => router.replace("/")} style={{ alignItems: "center", paddingTop: 10 }}>
          <Text style={{ color: COLORS.text, fontWeight: "800" }}>Volver a la tienda</Text>
        </Pressable>
      </View>
    </View>
  );
}
