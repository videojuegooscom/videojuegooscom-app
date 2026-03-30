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
  cardSoft: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.12)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.75)",
  mutedSoft: "rgba(255,255,255,0.58)",
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

function SectionCard({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
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
      {children}
    </View>
  );
}

function Badge({
  text,
  tone = "default",
}: {
  text: string;
  tone?: "default" | "accent" | "success" | "warning";
}) {
  const toneStyles =
    tone === "accent"
      ? {
          bg: COLORS.accentSoft,
          border: COLORS.accentBorder,
          color: COLORS.text,
        }
      : tone === "success"
      ? {
          bg: COLORS.successBg,
          border: COLORS.successBorder,
          color: COLORS.success,
        }
      : tone === "warning"
      ? {
          bg: COLORS.warningBg,
          border: COLORS.warningBorder,
          color: COLORS.warning,
        }
      : {
          bg: "rgba(255,255,255,0.05)",
          border: "rgba(255,255,255,0.10)",
          color: COLORS.text,
        };

  return (
    <View
      style={{
        alignSelf: "flex-start",
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: toneStyles.border,
        backgroundColor: toneStyles.bg,
      }}
    >
      <Text style={{ color: toneStyles.color, fontWeight: "900" }}>{text}</Text>
    </View>
  );
}

function ActionButton({
  title,
  onPress,
  disabled,
  variant = "primary",
  loading = false,
  loadingText = "Cargando...",
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  loading?: boolean;
  loadingText?: string;
}) {
  const isPrimary = variant === "primary";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: isPrimary ? 0 : 1,
        borderColor: isPrimary ? "transparent" : COLORS.border,
        backgroundColor: isPrimary ? COLORS.accent : COLORS.cardSoft,
        opacity: disabled || loading ? 0.5 : pressed ? 0.9 : 1,
      })}
    >
      {loading ? (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <ActivityIndicator color="#FFFFFF" />
          <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>{loadingText}</Text>
        </View>
      ) : (
        <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>{title}</Text>
      )}
    </Pressable>
  );
}

function InfoMessage({
  text,
  tone,
}: {
  text: string;
  tone: "error" | "success";
}) {
  const styles =
    tone === "error"
      ? {
          borderColor: COLORS.dangerBorder,
          backgroundColor: COLORS.dangerBg,
          color: COLORS.danger,
        }
      : {
          borderColor: COLORS.successBorder,
          backgroundColor: COLORS.successBg,
          color: COLORS.success,
        };

  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: styles.borderColor,
        backgroundColor: styles.backgroundColor,
        padding: 10,
      }}
    >
      <Text style={{ color: styles.color, fontWeight: "800", lineHeight: 20 }}>{text}</Text>
    </View>
  );
}

export default function PerfilScreen() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [state, setState] = useState<AccessState>("checking");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionRole, setSessionRole] = useState<SessionRole>("guest");

  const isChecking = state === "checking";
  const isSubmitting = state === "submitting";
  const isSigningOut = state === "signingOut";

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

  const signIn = useCallback(async () => {
    const e = normalizeEmail(email);
    const p = pass.trim();

    clearMessages();

    if (!e || !p) {
      setMsg("Introduce tu email y tu contraseña.");
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
        setState("idle");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle<{ role: string | null }>();

      const role = String(profile?.role ?? "").trim().toLowerCase();

      setSessionEmail(currentEmail);
      setSessionRole(role === "admin" ? "admin" : "user");
      setPass("");
      setOkMsg(
        role === "admin"
          ? "Sesión iniciada correctamente. Esta cuenta tiene acceso interno."
          : "Sesión iniciada correctamente."
      );
      setState("idle");
    } catch (error: any) {
      setMsg(error?.message ?? "Error inesperado al iniciar sesión.");
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

  const accountBadge = useMemo(() => {
    if (sessionRole === "admin") {
      return { text: "Cuenta verificada", tone: "success" as const };
    }
    if (sessionRole === "user") {
      return { text: "Sesión iniciada", tone: "warning" as const };
    }
    return { text: "Mi cuenta", tone: "default" as const };
  }, [sessionRole]);

  const accountTitle = useMemo(() => {
    if (sessionRole === "admin") return "Tu cuenta";
    if (sessionRole === "user") return "Tu cuenta";
    return "Accede a tu cuenta";
  }, [sessionRole]);

  const accountDescription = useMemo(() => {
    if (sessionRole === "admin") {
      return "Has iniciado sesión correctamente. Desde aquí puedes gestionar tu cuenta y, si corresponde, acceder a herramientas internas.";
    }
    if (sessionRole === "user") {
      return "Has iniciado sesión correctamente. Desde aquí podrás consultar tu cuenta, pedidos y datos cuando esas secciones estén activas.";
    }
    return "Inicia sesión con tu email y contraseña para acceder a tu cuenta. Si esa cuenta además tiene permisos internos, el acceso administrativo aparecerá automáticamente.";
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
            Mi cuenta
          </Text>
          <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 20 }}>
            Accede a tu cuenta para gestionar tu sesión y consultar tu área personal.
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
              <SectionCard>
                <Badge text={accountBadge.text} tone={accountBadge.tone} />

                <View>
                  <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "900" }}>
                    {accountTitle}
                  </Text>
                  <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 20 }}>
                    {accountDescription}
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
                    SESIÓN ACTUAL
                  </Text>

                  <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: "900" }}>
                    {sessionEmail || "No hay sesión iniciada"}
                  </Text>

                  <Text
                    style={{
                      color: COLORS.mutedSoft,
                      lineHeight: 19,
                      marginTop: 2,
                    }}
                  >
                    {sessionRole === "admin"
                      ? "Cuenta iniciada correctamente con permisos internos disponibles."
                      : sessionRole === "user"
                      ? "Cuenta iniciada correctamente."
                      : "Puedes iniciar sesión con tu email y contraseña cuando quieras."}
                  </Text>
                </View>

                {msg ? <InfoMessage text={msg} tone="error" /> : null}
                {okMsg ? <InfoMessage text={okMsg} tone="success" /> : null}

                {isChecking ? (
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

                {sessionRole === "guest" ? (
                  <>
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
                        editable={!isChecking && !isSigningOut}
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
                        editable={!isChecking && !isSigningOut}
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

                    <ActionButton
                      title="Iniciar sesión"
                      onPress={signIn}
                      disabled={!canSubmit}
                      loading={isSubmitting}
                      loadingText="Entrando..."
                    />
                  </>
                ) : (
                  <View style={{ gap: 10, marginTop: 2 }}>
                    <ActionButton
                      title="Cerrar sesión"
                      onPress={signOut}
                      variant="secondary"
                      loading={isSigningOut}
                      loadingText="Cerrando sesión..."
                    />
                  </View>
                )}

                <View
                  style={{
                    marginTop: 4,
                    paddingTop: 12,
                    borderTopWidth: 1,
                    borderTopColor: "rgba(255,255,255,0.08)",
                    gap: 10,
                  }}
                >
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.52)",
                      textAlign: "center",
                      lineHeight: 18,
                      fontSize: 12,
                    }}
                  >
                    Esta área está preparada para crecer con pedidos, direcciones, datos de cuenta y más secciones de cliente.
                  </Text>
                </View>
              </SectionCard>

              {sessionRole === "admin" ? (
                <SectionCard>
                  <Badge text="Herramientas internas" tone="accent" />

                  <View>
                    <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "900" }}>
                      Acceso interno disponible
                    </Text>
                    <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 20 }}>
                      Esta cuenta tiene permisos autorizados. El acceso al panel solo se muestra cuando el usuario autenticado es realmente administrador.
                    </Text>
                  </View>

                  <ActionButton
                    title="Entrar al panel de administración"
                    onPress={openAdminPanel}
                  />

                  <View
                    style={{
                      marginTop: 4,
                      paddingTop: 12,
                      borderTopWidth: 1,
                      borderTopColor: "rgba(255,255,255,0.08)",
                    }}
                  >
                    <Text
                      style={{
                        color: "rgba(255,255,255,0.52)",
                        textAlign: "center",
                        lineHeight: 18,
                        fontSize: 12,
                      }}
                    >
                      Este bloque no aparece para clientes normales ni para cuentas sin permisos.
                    </Text>
                  </View>
                </SectionCard>
              ) : null}

              <SectionCard>
                <Badge text="Próximamente" tone="default" />

                <View>
                  <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "900" }}>
                    Tu área personal
                  </Text>
                  <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 20 }}>
                    Esta pantalla está preparada para incorporar pedidos, favoritos, direcciones, soporte y más opciones de cuenta sin rehacer la base.
                  </Text>
                </View>

                <View style={{ gap: 10 }}>
                  <View
                    style={{
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.08)",
                      backgroundColor: "rgba(255,255,255,0.03)",
                      padding: 14,
                    }}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>Pedidos</Text>
                    <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 19 }}>
                      Consulta futura de pedidos y seguimiento.
                    </Text>
                  </View>

                  <View
                    style={{
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.08)",
                      backgroundColor: "rgba(255,255,255,0.03)",
                      padding: 14,
                    }}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>Datos de cuenta</Text>
                    <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 19 }}>
                      Gestión futura de nombre, direcciones y preferencias.
                    </Text>
                  </View>
                </View>
              </SectionCard>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}