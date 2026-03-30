import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
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
  warning: "#FDE68A",
  warningBg: "rgba(245,158,11,0.12)",
  warningBorder: "rgba(245,158,11,0.30)",
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

type AccessState = "checking" | "idle" | "submitting" | "signingOut";

type SessionRole = "admin" | "user" | "guest";

export default function PerfilScreen() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [state, setState] = useState<AccessState>("checking");

  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionRole, setSessionRole] = useState<SessionRole>("guest");

  const loading = state === "checking" || state === "submitting" || state === "signingOut";

  const canSubmit = useMemo(() => {
    return isValidEmail(email) && pass.trim().length >= 6 && state === "idle";
  }, [email, pass, state]);

  const clearMessages = useCallback(() => {
    if (msg) setMsg(null);
    if (okMsg) setOkMsg(null);
  }, [msg, okMsg]);

  const hydrateSessionState = useCallback(async () => {
    setState("checking");
    setMsg(null);
    setOkMsg(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setSessionEmail(null);
        setSessionRole("guest");
        setState("idle");
        return;
      }

      const currentEmail = normalizeEmail(session.user.email ?? "");
      const userId = session.user.id;

      setSessionEmail(currentEmail || null);

      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle<{ role: string | null }>();

      if (profErr) {
        setSessionRole("user");
        setState("idle");
        setMsg("La sesión existe, pero no se pudo validar el perfil completo.");
        return;
      }

      const role = String(profile?.role ?? "").trim().toLowerCase();
      setSessionRole(role === "admin" ? "admin" : "user");
      setState("idle");
    } catch (error: any) {
      setSessionEmail(null);
      setSessionRole("guest");
      setState("idle");
      setMsg(error?.message ?? "No se pudo comprobar la sesión actual.");
    }
  }, []);

  useEffect(() => {
    hydrateSessionState();
  }, [hydrateSessionState]);

  const signInAdmin = useCallback(async () => {
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
      const currentEmail = normalizeEmail(data.user?.email ?? e);

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
        setSessionEmail(null);
        setSessionRole("guest");
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
        setSessionEmail(null);
        setSessionRole("guest");
        setState("idle");
        return;
      }

      setSessionEmail(currentEmail);
      setSessionRole("admin");
      setOkMsg("Acceso correcto. Ya puedes entrar al panel de administración.");
      setPass("");
      setState("idle");
    } catch (error: any) {
      setMsg(error?.message ?? "Error inesperado al iniciar sesión.");
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
      setSessionEmail(null);
      setSessionRole("guest");
      setState("idle");
    }
  }, [clearMessages, email, pass]);

  const signOut = useCallback(async () => {
    clearMessages();
    setState("signingOut");

    try {
      await supabase.auth.signOut();
      setSessionEmail(null);
      setSessionRole("guest");
      setEmail("");
      setPass("");
      setOkMsg("Sesión cerrada correctamente.");
      setState("idle");
    } catch (error: any) {
      setMsg(error?.message ?? "No se pudo cerrar la sesión.");
      setState("idle");
    }
  }, [clearMessages]);

  const openAdminPanel = useCallback(() => {
    router.push("/admin");
  }, []);

  const roleBadge = useMemo(() => {
    if (sessionRole === "admin") {
      return {
        text: "Administrador",
        bg: COLORS.successBg,
        border: COLORS.successBorder,
        color: COLORS.success,
      };
    }

    if (sessionRole === "user") {
      return {
        text: "Sesión iniciada",
        bg: COLORS.warningBg,
        border: COLORS.warningBorder,
        color: COLORS.warning,
      };
    }

    return {
      text: "Invitado",
      bg: "rgba(255,255,255,0.05)",
      border: "rgba(255,255,255,0.10)",
      color: COLORS.text,
    };
  }, [sessionRole]);

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
            Perfil
          </Text>
          <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 20 }}>
            Área de cuenta, sesión actual y acceso administrativo si corresponde.
          </Text>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 18,
              paddingBottom: 32,
              gap: 14,
            }}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 720,
                alignSelf: "center",
                gap: 14,
              }}
            >
              <View
                style={{
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
                    borderColor: roleBadge.border,
                    backgroundColor: roleBadge.bg,
                  }}
                >
                  <Text style={{ color: roleBadge.color, fontWeight: "900" }}>
                    {roleBadge.text}
                  </Text>
                </View>

                <View>
                  <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "900" }}>
                    Estado de la cuenta
                  </Text>
                  <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 20 }}>
                    Desde aquí puedes ver si hay sesión iniciada y entrar al panel admin si
                    la cuenta tiene permisos.
                  </Text>
                </View>

                <View
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.08)",
                    backgroundColor: "rgba(255,255,255,0.03)",
                    padding: 14,
                    gap: 8,
                  }}
                >
                  <Text style={{ color: COLORS.muted, fontSize: 12, fontWeight: "800" }}>
                    EMAIL ACTUAL
                  </Text>
                  <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: "900" }}>
                    {sessionEmail || "No hay sesión iniciada"}
                  </Text>

                  <Text
                    style={{
                      color: "rgba(255,255,255,0.62)",
                      lineHeight: 19,
                      marginTop: 2,
                    }}
                  >
                    {sessionRole === "admin"
                      ? "Esta cuenta tiene permisos de administrador."
                      : sessionRole === "user"
                      ? "Hay sesión iniciada, pero esta cuenta no es admin."
                      : "Ahora mismo estás navegando como invitado."}
                  </Text>
                </View>

                {msg ? (
                  <View
                    style={{
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

                {loading && state === "checking" ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      paddingTop: 4,
                    }}
                  >
                    <ActivityIndicator color="#FFFFFF" />
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                      Comprobando sesión...
                    </Text>
                  </View>
                ) : null}

                <View style={{ gap: 10, marginTop: 2 }}>
                  {sessionRole === "admin" ? (
                    <>
                      <Pressable
                        onPress={openAdminPanel}
                        style={({ pressed }) => ({
                          borderRadius: 14,
                          paddingVertical: 14,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: COLORS.accent,
                          opacity: pressed ? 0.9 : 1,
                        })}
                      >
                        <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>
                          Entrar al panel admin
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={signOut}
                        disabled={state === "signingOut"}
                        style={({ pressed }) => ({
                          borderRadius: 14,
                          paddingVertical: 14,
                          alignItems: "center",
                          justifyContent: "center",
                          borderWidth: 1,
                          borderColor: COLORS.border,
                          backgroundColor: COLORS.card,
                          opacity: state === "signingOut" ? 0.6 : pressed ? 0.9 : 1,
                        })}
                      >
                        {state === "signingOut" ? (
                          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                            <ActivityIndicator color="#FFFFFF" />
                            <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
                              Cerrando sesión...
                            </Text>
                          </View>
                        ) : (
                          <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>
                            Cerrar sesión
                          </Text>
                        )}
                      </Pressable>
                    </>
                  ) : sessionRole === "user" ? (
                    <Pressable
                      onPress={signOut}
                      disabled={state === "signingOut"}
                      style={({ pressed }) => ({
                        borderRadius: 14,
                        paddingVertical: 14,
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        backgroundColor: COLORS.card,
                        opacity: state === "signingOut" ? 0.6 : pressed ? 0.9 : 1,
                      })}
                    >
                      {state === "signingOut" ? (
                        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                          <ActivityIndicator color="#FFFFFF" />
                          <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
                            Cerrando sesión...
                          </Text>
                        </View>
                      ) : (
                        <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>
                          Cerrar sesión
                        </Text>
                      )}
                    </Pressable>
                  ) : null}
                </View>
              </View>

              <View
                style={{
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
                    Acceso administrativo
                  </Text>
                </View>

                <View>
                  <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "900" }}>
                    Iniciar sesión como admin
                  </Text>
                  <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 20 }}>
                    Solo las cuentas con rol admin pueden entrar al panel. Aquí no hay
                    barra libre.
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
                    editable={state !== "checking" && state !== "signingOut"}
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
                    editable={state !== "checking" && state !== "signingOut"}
                    onSubmitEditing={() => {
                      if (canSubmit) signInAdmin();
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

                <Pressable
                  onPress={signInAdmin}
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
                      <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Entrando...</Text>
                    </View>
                  ) : (
                    <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>
                      Validar acceso admin
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
                  {sessionRole === "admin" ? (
                    <Pressable
                      onPress={openAdminPanel}
                      style={({ pressed }) => ({
                        alignItems: "center",
                        opacity: pressed ? 0.85 : 1,
                        paddingVertical: 4,
                      })}
                    >
                      <Text style={{ color: "rgba(255,255,255,0.88)", fontWeight: "800" }}>
                        → Ir al panel de administración
                      </Text>
                    </Pressable>
                  ) : (
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
                  )}

                  <Text
                    style={{
                      color: "rgba(255,255,255,0.52)",
                      textAlign: "center",
                      lineHeight: 18,
                      fontSize: 12,
                    }}
                  >
                    Acceso restringido. Las cuentas sin rol admin no pueden entrar al
                    panel interno.
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}