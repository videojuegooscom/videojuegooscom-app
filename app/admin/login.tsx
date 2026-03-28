// app/admin/login.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
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
  accentSoft: "rgba(0,170,228,0.16)",
  accentBorder: "rgba(0,170,228,0.45)",
  danger: "#FCA5A5",
  dangerBg: "rgba(255,59,48,0.12)",
  dangerBorder: "rgba(255,59,48,0.35)",
  success: "#86EFAC",
  successBg: "rgba(34,197,94,0.14)",
  successBorder: "rgba(34,197,94,0.30)",
};

function normalizeEmail(value: string) {
  return (value ?? "").trim().toLowerCase();
}

function isValidEmail(value: string) {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function softShadow() {
  return Platform.select<any>({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.24,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 3 },
    default: {},
  });
}

type AccessState = "checking" | "idle" | "submitting";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [state, setState] = useState<AccessState>("checking");

  const loading = state === "checking" || state === "submitting";

  const canSubmit = useMemo(() => {
    return isValidEmail(email) && pass.trim().length >= 6 && state === "idle";
  }, [email, pass, state]);

  const clearMessages = useCallback(() => {
    if (msg) setMsg(null);
    if (okMsg) setOkMsg(null);
  }, [msg, okMsg]);

  const validateExistingSession = useCallback(async () => {
    setState("checking");
    setMsg(null);
    setOkMsg(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setState("idle");
        return;
      }

      const userId = session.user.id;

      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle<{ role: string | null }>();

      if (profErr) {
        await supabase.auth.signOut();
        setState("idle");
        setMsg("No se pudo validar el perfil de administrador. Vuelve a iniciar sesión.");
        return;
      }

      const role = String(profile?.role ?? "").trim().toLowerCase();

      if (role !== "admin") {
        await supabase.auth.signOut();
        setState("idle");
        setMsg("Tu sesión existe, pero esta cuenta no tiene permisos de administrador.");
        return;
      }

      router.replace("/admin");
    } catch (error: any) {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
      setState("idle");
      setMsg(error?.message ?? "No se pudo comprobar la sesión actual.");
    }
  }, []);

  useEffect(() => {
    validateExistingSession();
  }, [validateExistingSession]);

  const signIn = useCallback(async () => {
    const e = normalizeEmail(email);
    const p = pass.trim();

    clearMessages();

    if (!e || !p) {
      setMsg("Pon email y contraseña.");
      return;
    }

    if (!isValidEmail(e)) {
      setMsg("Introduce un email válido.");
      return;
    }

    if (p.length < 6) {
      setMsg("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setState("submitting");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: e,
        password: p,
      });

      if (error) {
        setMsg(
          error.message === "Invalid login credentials"
            ? "Email o contraseña incorrectos."
            : error.message
        );
        setState("idle");
        return;
      }

      const userId = data.user?.id;
      if (!userId) {
        setMsg("No se pudo iniciar sesión correctamente.");
        try {
          await supabase.auth.signOut();
        } catch {
          // ignore
        }
        setState("idle");
        return;
      }

      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle<{ role: string | null }>();

      if (profErr) {
        setMsg("No se pudo validar el perfil de administrador.");
        try {
          await supabase.auth.signOut();
        } catch {
          // ignore
        }
        setState("idle");
        return;
      }

      const role = String(profile?.role ?? "").trim().toLowerCase();

      if (role !== "admin") {
        setMsg("Esta cuenta no tiene permisos de administrador.");
        try {
          await supabase.auth.signOut();
        } catch {
          // ignore
        }
        setState("idle");
        return;
      }

      setOkMsg("Acceso correcto. Entrando al panel…");
      router.replace("/admin");
    } catch (error: any) {
      setMsg(error?.message ?? "Error inesperado al iniciar sesión.");
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
      setState("idle");
    }
  }, [clearMessages, email, pass]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="light-content" />

      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <View
          style={{
            backgroundColor: COLORS.bg2,
            borderBottomWidth: 1,
            borderBottomColor: "rgba(255,255,255,0.06)",
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 14,
          }}
        >
          <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "900" }}>
            Admin · Videojuegoos
          </Text>
          <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 20 }}>
            Acceso privado para gestión interna de productos, categorías e inventario.
          </Text>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              paddingHorizontal: 16,
              paddingVertical: 20,
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 520,
                alignSelf: "center",
                borderRadius: 22,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.card,
                padding: 18,
                gap: 12,
                ...softShadow(),
              }}
            >
              <View
                style={{
                  alignSelf: "flex-start",
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: COLORS.accentBorder,
                  backgroundColor: COLORS.accentSoft,
                }}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                  Acceso profesional
                </Text>
              </View>

              <View>
                <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "900" }}>
                  Iniciar sesión
                </Text>
                <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 20 }}>
                  Solo las cuentas con rol admin pueden entrar al panel. Aquí no hay barra libre.
                </Text>
              </View>

              <View style={{ gap: 8, marginTop: 4 }}>
                <Text style={{ color: COLORS.text, fontWeight: "800" }}>Email</Text>
                <TextInput
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    clearMessages();
                  }}
                  placeholder="tu@email.com"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="username"
                  autoComplete="email"
                  returnKeyType="next"
                  editable={state !== "checking"}
                  style={{
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    borderRadius: 14,
                    paddingHorizontal: 12,
                    paddingVertical: 13,
                    color: COLORS.text,
                    backgroundColor: "rgba(255,255,255,0.03)",
                  }}
                />
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ color: COLORS.text, fontWeight: "800" }}>Contraseña</Text>
                <TextInput
                  value={pass}
                  onChangeText={(text) => {
                    setPass(text);
                    clearMessages();
                  }}
                  placeholder="Tu contraseña"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  autoComplete="password"
                  returnKeyType="go"
                  editable={state !== "checking"}
                  onSubmitEditing={() => {
                    if (canSubmit) signIn();
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    borderRadius: 14,
                    paddingHorizontal: 12,
                    paddingVertical: 13,
                    color: COLORS.text,
                    backgroundColor: "rgba(255,255,255,0.03)",
                  }}
                />
              </View>

              {msg ? (
                <View
                  style={{
                    marginTop: 2,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: COLORS.dangerBorder,
                    backgroundColor: COLORS.dangerBg,
                    padding: 10,
                  }}
                >
                  <Text style={{ color: COLORS.danger, fontWeight: "800", lineHeight: 20 }}>
                    {msg}
                  </Text>
                </View>
              ) : null}

              {okMsg ? (
                <View
                  style={{
                    marginTop: 2,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: COLORS.successBorder,
                    backgroundColor: COLORS.successBg,
                    padding: 10,
                  }}
                >
                  <Text style={{ color: COLORS.success, fontWeight: "800", lineHeight: 20 }}>
                    {okMsg}
                  </Text>
                </View>
              ) : null}

              <Pressable
                onPress={signIn}
                disabled={!canSubmit}
                style={({ pressed }) => ({
                  marginTop: 8,
                  borderRadius: 14,
                  paddingVertical: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: COLORS.accent,
                  opacity: !canSubmit ? 0.45 : pressed ? 0.9 : 1,
                })}
              >
                {state === "submitting" ? (
                  <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                    <ActivityIndicator color="#FFFFFF" />
                    <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Entrando…</Text>
                  </View>
                ) : state === "checking" ? (
                  <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                    <ActivityIndicator color="#FFFFFF" />
                    <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
                      Comprobando sesión…
                    </Text>
                  </View>
                ) : (
                  <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>
                    Entrar al panel
                  </Text>
                )}
              </Pressable>

              <View
                style={{
                  marginTop: 4,
                  paddingTop: 12,
                  borderTopWidth: 1,
                  borderTopColor: "rgba(255,255,255,0.08)",
                  gap: 10,
                }}
              >
                <Pressable
                  onPress={() => router.replace("/")}
                  style={({ pressed }) => ({
                    alignItems: "center",
                    opacity: pressed ? 0.85 : 1,
                    paddingVertical: 4,
                  })}
                >
                  <Text style={{ color: "rgba(255,255,255,0.88)", fontWeight: "800" }}>
                    ← Volver a la tienda
                  </Text>
                </Pressable>

                <Text
                  style={{
                    color: "rgba(255,255,255,0.52)",
                    textAlign: "center",
                    lineHeight: 18,
                    fontSize: 12,
                  }}
                >
                  Acceso restringido. Las cuentas sin rol admin se cierran automáticamente.
                </Text>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}