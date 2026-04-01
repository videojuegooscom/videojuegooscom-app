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
  gamingGlow: "rgba(0,170,228,0.22)",
};

type AccessState = "checking" | "idle" | "submitting" | "signingOut";
type SessionRole = "admin" | "user" | "guest";
type AuthMode = "signin" | "signup";

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

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        borderRadius: 24,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.card,
        padding: 18,
        gap: 14,
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
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 14,
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
        padding: 12,
      }}
    >
      <Text style={{ color: styles.color, fontWeight: "800", lineHeight: 20 }}>{text}</Text>
    </View>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text style={{ color: COLORS.text, fontWeight: "800" }}>{children}</Text>;
}

function Input({
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  returnKeyType,
  editable,
  autoCapitalize = "none",
  autoCorrect = false,
  textContentType,
  autoComplete,
  onSubmitEditing,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: any;
  returnKeyType?: any;
  editable?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  textContentType?: any;
  autoComplete?: any;
  onSubmitEditing?: () => void;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="rgba(255,255,255,0.45)"
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      returnKeyType={returnKeyType}
      editable={editable}
      autoCapitalize={autoCapitalize}
      autoCorrect={autoCorrect}
      textContentType={textContentType}
      autoComplete={autoComplete}
      onSubmitEditing={onSubmitEditing}
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
  );
}

function TabButton({
  title,
  active,
  onPress,
}: {
  title: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: active ? COLORS.accentSoft : "rgba(255,255,255,0.03)",
        borderWidth: 1,
        borderColor: active ? COLORS.accentBorder : "rgba(255,255,255,0.08)",
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <Text style={{ color: COLORS.text, fontWeight: "900" }}>{title}</Text>
    </Pressable>
  );
}

function FeatureItem({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <View
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "rgba(255,255,255,0.03)",
        padding: 14,
        gap: 6,
      }}
    >
      <Text style={{ color: COLORS.text, fontWeight: "900" }}>{title}</Text>
      <Text style={{ color: COLORS.muted, lineHeight: 19 }}>{text}</Text>
    </View>
  );
}

export default function PerfilScreen() {
  const [mode, setMode] = useState<AuthMode>("signin");

  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");

  const [registerName, setRegisterName] = useState("");
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerCountry, setRegisterCountry] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [state, setState] = useState<AccessState>("checking");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionRole, setSessionRole] = useState<SessionRole>("guest");

  const isChecking = state === "checking";
  const isSubmitting = state === "submitting";
  const isSigningOut = state === "signingOut";

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

  const canSubmitLogin = useMemo(() => {
    return isValidEmail(email) && pass.trim().length >= 6 && state === "idle";
  }, [email, pass, state]);

  const canSubmitRegister = useMemo(() => {
    return (
      registerName.trim().length >= 2 &&
      registerUsername.trim().length >= 3 &&
      registerCountry.trim().length >= 2 &&
      isValidEmail(email) &&
      pass.trim().length >= 6 &&
      state === "idle"
    );
  }, [registerCountry, registerName, registerUsername, email, pass, state]);

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

  const signUp = useCallback(async () => {
    const e = normalizeEmail(email);
    const p = pass.trim();
    const fullName = registerName.trim();
    const username = registerUsername.trim();
    const country = registerCountry.trim();

    clearMessages();

    if (!fullName || !username || !country || !e || !p) {
      setMsg("Completa todos los campos del registro.");
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
      const { error } = await supabase.auth.signUp({
        email: e,
        password: p,
        options: {
          data: {
            full_name: fullName,
            username,
            country,
          },
        },
      });

      if (error) {
        setMsg(error.message);
        setState("idle");
        return;
      }

      setOkMsg(
        "Cuenta creada correctamente. Si tienes activada la confirmación por email en Supabase, revisa tu bandeja de entrada antes de iniciar sesión."
      );
      setMode("signin");
      setPass("");
      setState("idle");
    } catch (error: any) {
      setMsg(error?.message ?? "No se pudo crear la cuenta.");
      setState("idle");
    }
  }, [clearMessages, email, pass, registerCountry, registerName, registerUsername]);

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

  const headerTitle = sessionRole === "guest" ? "Acceso y registro" : "Mi cuenta";
  const headerDesc =
    sessionRole === "guest"
      ? "Accede a tu cuenta o únete a la comunidad gamer de Videojuegoos con una entrada seria, limpia y lista para crecer."
      : "Gestiona tu sesión y tu acceso a la comunidad desde un único punto, sin duplicados ni rutas raras.";

  const showCommunityBaseSection = sessionRole !== "admin";

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
            {headerTitle}
          </Text>
          <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 20 }}>
            {headerDesc}
          </Text>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 18,
              paddingBottom: 32,
              gap: 14,
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 920,
                alignSelf: "center",
                gap: 14,
              }}
            >
              <SectionCard>
                <View
                  style={{
                    borderRadius: 22,
                    borderWidth: 1,
                    borderColor: "rgba(0,170,228,0.18)",
                    backgroundColor: "rgba(255,255,255,0.02)",
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      padding: 18,
                      gap: 12,
                      backgroundColor: COLORS.bg2,
                    }}
                  >
                    <Badge
                      text={sessionRole === "guest" ? "Entrada a la comunidad" : "Sesión activa"}
                      tone={sessionRole === "guest" ? "accent" : "success"}
                    />

                    <Text style={{ color: COLORS.text, fontSize: 26, fontWeight: "900" }}>
                      {sessionRole === "guest"
                        ? "Tu perfil gamer empieza aquí"
                        : "Tu cuenta está activa"}
                    </Text>

                    <Text style={{ color: COLORS.muted, lineHeight: 22, maxWidth: 720 }}>
                      {sessionRole === "guest"
                        ? "Regístrate o inicia sesión para comentar en el chat global, preparar tu perfil comunitario y entrar en una experiencia más seria, social y gaming."
                        : sessionRole === "admin"
                        ? "Has iniciado sesión correctamente. Esta cuenta tiene acceso interno además del acceso normal de usuario."
                        : "Has iniciado sesión correctamente. Desde aquí podrás evolucionar tu cuenta, tu perfil comunitario y tu acceso al chat."}
                    </Text>
                  </View>

                  <View
                    style={{
                      height: 4,
                      backgroundColor: COLORS.gamingGlow,
                    }}
                  />
                </View>

                {msg ? <InfoMessage text={msg} tone="error" /> : null}
                {okMsg ? <InfoMessage text={okMsg} tone="success" /> : null}

                {isChecking ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
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
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <TabButton
                        title="Iniciar sesión"
                        active={mode === "signin"}
                        onPress={() => {
                          clearMessages();
                          setMode("signin");
                        }}
                      />
                      <TabButton
                        title="Crear cuenta"
                        active={mode === "signup"}
                        onPress={() => {
                          clearMessages();
                          setMode("signup");
                        }}
                      />
                    </View>

                    {mode === "signin" ? (
                      <View style={{ gap: 12 }}>
                        <View style={{ gap: 8 }}>
                          <Label>Email</Label>
                          <Input
                            value={email}
                            onChangeText={(text) => {
                              setEmail(text);
                              clearMessages();
                            }}
                            placeholder="tu@email.com"
                            keyboardType="email-address"
                            returnKeyType="next"
                            editable={!isChecking && !isSigningOut}
                            textContentType="username"
                            autoComplete="email"
                          />
                        </View>

                        <View style={{ gap: 8 }}>
                          <Label>Contraseña</Label>
                          <Input
                            value={pass}
                            onChangeText={(text) => {
                              setPass(text);
                              clearMessages();
                            }}
                            placeholder="Tu contraseña"
                            secureTextEntry
                            returnKeyType="go"
                            editable={!isChecking && !isSigningOut}
                            textContentType="password"
                            autoComplete="password"
                            onSubmitEditing={() => {
                              if (canSubmitLogin) signIn();
                            }}
                          />
                        </View>

                        <ActionButton
                          title="Iniciar sesión"
                          onPress={signIn}
                          disabled={!canSubmitLogin}
                          loading={isSubmitting}
                          loadingText="Entrando..."
                        />

                        <View
                          style={{
                            borderRadius: 16,
                            borderWidth: 1,
                            borderColor: "rgba(255,255,255,0.08)",
                            backgroundColor: "rgba(255,255,255,0.03)",
                            padding: 14,
                            gap: 6,
                          }}
                        >
                          <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                            Acceso normal, sin puertas raras
                          </Text>
                          <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                            Todo el mundo entra por aquí. Si una cuenta además tiene permisos
                            internos, el acceso administrativo aparecerá automáticamente.
                          </Text>
                        </View>
                      </View>
                    ) : (
                      <View style={{ gap: 12 }}>
                        <View style={{ gap: 8 }}>
                          <Label>Nombre visible</Label>
                          <Input
                            value={registerName}
                            onChangeText={(text) => {
                              setRegisterName(text);
                              clearMessages();
                            }}
                            placeholder="Ejemplo: Dani Jefe"
                            editable={!isChecking && !isSigningOut}
                            autoCapitalize="words"
                            textContentType="name"
                            autoComplete="name"
                          />
                        </View>

                        <View style={{ gap: 8 }}>
                          <Label>Nombre de usuario</Label>
                          <Input
                            value={registerUsername}
                            onChangeText={(text) => {
                              setRegisterUsername(text);
                              clearMessages();
                            }}
                            placeholder="Ejemplo: danijefe"
                            editable={!isChecking && !isSigningOut}
                            autoCapitalize="none"
                            autoCorrect={false}
                          />
                        </View>

                        <View style={{ gap: 8 }}>
                          <Label>País</Label>
                          <Input
                            value={registerCountry}
                            onChangeText={(text) => {
                              setRegisterCountry(text);
                              clearMessages();
                            }}
                            placeholder="Ejemplo: España"
                            editable={!isChecking && !isSigningOut}
                            autoCapitalize="words"
                          />
                        </View>

                        <View style={{ gap: 8 }}>
                          <Label>Email</Label>
                          <Input
                            value={email}
                            onChangeText={(text) => {
                              setEmail(text);
                              clearMessages();
                            }}
                            placeholder="tu@email.com"
                            keyboardType="email-address"
                            returnKeyType="next"
                            editable={!isChecking && !isSigningOut}
                            textContentType="emailAddress"
                            autoComplete="email"
                          />
                        </View>

                        <View style={{ gap: 8 }}>
                          <Label>Contraseña</Label>
                          <Input
                            value={pass}
                            onChangeText={(text) => {
                              setPass(text);
                              clearMessages();
                            }}
                            placeholder="Mínimo 6 caracteres"
                            secureTextEntry
                            returnKeyType="go"
                            editable={!isChecking && !isSigningOut}
                            textContentType="newPassword"
                            autoComplete="password-new"
                            onSubmitEditing={() => {
                              if (canSubmitRegister) signUp();
                            }}
                          />
                        </View>

                        <ActionButton
                          title="Crear cuenta"
                          onPress={signUp}
                          disabled={!canSubmitRegister}
                          loading={isSubmitting}
                          loadingText="Creando cuenta..."
                        />

                        <View
                          style={{
                            borderRadius: 16,
                            borderWidth: 1,
                            borderColor: COLORS.accentBorder,
                            backgroundColor: COLORS.accentSoft,
                            padding: 14,
                            gap: 8,
                          }}
                        >
                          <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                            Registro pensado para la comunidad
                          </Text>
                          <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                            Esta es la base para que luego completes tu perfil gamer, comentes
                            en el chat y conectes con personas de tu ciudad o país.
                          </Text>
                        </View>
                      </View>
                    )}
                  </>
                ) : (
                  <View style={{ gap: 12 }}>
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
                      <Text style={{ color: COLORS.mutedSoft, lineHeight: 19 }}>
                        {sessionRole === "admin"
                          ? "Cuenta iniciada correctamente con acceso interno disponible."
                          : "Cuenta iniciada correctamente."}
                      </Text>
                    </View>

                    <ActionButton
                      title="Cerrar sesión"
                      onPress={signOut}
                      variant="secondary"
                      loading={isSigningOut}
                      loadingText="Cerrando sesión..."
                    />
                  </View>
                )}
              </SectionCard>

              {sessionRole === "admin" ? (
                <SectionCard>
                  <Badge text="Herramientas internas" tone="accent" />

                  <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "900" }}>
                    Acceso interno disponible
                  </Text>

                  <Text style={{ color: COLORS.muted, lineHeight: 21 }}>
                    Esta cuenta tiene permisos autorizados. El acceso administrativo solo se
                    muestra cuando el usuario autenticado es realmente administrador.
                  </Text>

                  <ActionButton
                    title="Entrar al panel de administración"
                    onPress={openAdminPanel}
                  />
                </SectionCard>
              ) : null}

              {showCommunityBaseSection ? (
                <SectionCard>
                  <Badge text="Comunidad + gaming" tone="warning" />

                  <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "900" }}>
                    Lo que desbloquea esta base
                  </Text>

                  <Text style={{ color: COLORS.muted, lineHeight: 21 }}>
                    Esta página ya queda orientada a evolucionar hacia un registro serio para el
                    chat global, la comunidad gamer y el perfil social de Videojuegoos.
                  </Text>

                  <View style={{ gap: 10 }}>
                    <FeatureItem
                      title="Perfil comunitario"
                      text="Nombre público, país, ciudad, juego principal, fotos y portada."
                    />
                    <FeatureItem
                      title="Chat global"
                      text="Participación real en la sala, viewers silenciosos, multimedia y filtros."
                    />
                    <FeatureItem
                      title="Conectar con jugadores"
                      text="Encontrar gente para jugar por ciudad, país, plataforma o juego."
                    />
                  </View>
                </SectionCard>
              ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}