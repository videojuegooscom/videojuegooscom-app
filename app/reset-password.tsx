// app/reset-password.tsx
/**
 * Qué hace: pantalla donde un cliente pone su contraseña nueva después de
 * pulsar el enlace de recuperación que le llega por email (lo dispara
 * app/(tabs)/perfil.tsx con supabase.auth.resetPasswordForEmail).
 *
 * Cómo funciona:
 * - Supabase manda al usuario aquí (?redirectTo=.../reset-password) con un
 *   código de un solo uso en la URL. El cliente de Supabase ya está
 *   configurado con detectSessionInUrl:true (ver lib/supabase.ts), así que
 *   al cargar la página intercambia ese código por una sesión temporal él
 *   solo — esta pantalla solo espera a que eso ocurra (evento
 *   "PASSWORD_RECOVERY" o, si ya ocurrió antes de montar, sesión ya activa).
 * - Con esa sesión temporal, supabase.auth.updateUser({ password }) cambia
 *   la contraseña. No hace falta pedir la contraseña antigua: el enlace de
 *   un solo uso ya demuestra que es el dueño del email.
 * - Si el enlace es inválido, caducado o ya se usó, no llega la sesión y a
 *   los pocos segundos se muestra un aviso con vuelta al login para pedir
 *   uno nuevo.
 *
 * Requisito en Supabase (fuera de este archivo): en Authentication → URL
 * Configuration hay que tener añadida la URL de este sitio + "/reset-password"
 * en "Redirect URLs" — si no, Supabase rechaza la redirección del enlace.
 *
 * Conectado con:
 * - app/(tabs)/perfil.tsx → envía aquí el enlace de recuperación.
 * - lib/supabase.ts → cliente de Supabase (sesión de recuperación + updateUser).
 * - app/_layout.tsx → registra esta ruta en el Stack raíz.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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
import { router, type Href } from "expo-router";
import { supabase } from "../lib/supabase";

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  cardSoft: "#F8FBFE",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  accent: "#1EA7E8",
  danger: "#B91C1C",
  dangerBg: "#FFE4E6",
  dangerBorder: "#FDA4AF",
  success: "#15803D",
  successBg: "#DCFCE7",
  successBorder: "#86EFAC",
};

type Phase = "checking" | "ready" | "invalid" | "submitting" | "done";

function AnimatedPressable({
  onPress,
  disabled,
  style,
  children,
}: {
  onPress?: () => void;
  disabled?: boolean;
  style?: any;
  children?: React.ReactNode;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  function onPressIn() {
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 50, bounciness: 6 }).start();
  }

  function onPressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  }

  return (
    <Pressable onPress={onPress} disabled={disabled} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
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
        width: "100%",
        maxWidth: 440,
      }}
    >
      {children}
    </View>
  );
}

function InfoMessage({ text, tone }: { text: string; tone: "error" | "success" }) {
  const styles =
    tone === "error"
      ? { borderColor: COLORS.dangerBorder, backgroundColor: COLORS.dangerBg, color: COLORS.danger }
      : { borderColor: COLORS.successBorder, backgroundColor: COLORS.successBg, color: COLORS.success };

  return (
    <View style={{ borderRadius: 14, borderWidth: 1, borderColor: styles.borderColor, backgroundColor: styles.backgroundColor, padding: 12 }}>
      <Text style={{ color: styles.color, fontWeight: "800", lineHeight: 20 }}>{text}</Text>
    </View>
  );
}

export default function ResetPasswordScreen() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY") {
        setPhase("ready");
      }
    });

    // Si el evento ya se disparó antes de que este componente se montara
    // (carga directa de la URL), la sesión ya estará activa.
    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) setPhase((p) => (p === "checking" ? "ready" : p));
    });

    const timeout = setTimeout(() => {
      if (mounted) setPhase((p) => (p === "checking" ? "invalid" : p));
    }, 5000);

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const canSubmit = pass.trim().length >= 6 && pass.trim() === pass2.trim() && phase === "ready";

  const submit = useCallback(async () => {
    setMsg(null);

    const p = pass.trim();

    if (p.length < 6) {
      setMsg("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (p !== pass2.trim()) {
      setMsg("Las dos contraseñas no coinciden.");
      return;
    }

    setPhase("submitting");

    try {
      const { error } = await supabase.auth.updateUser({ password: p });

      if (error) {
        setMsg(error.message);
        setPhase("ready");
        return;
      }

      setPhase("done");
    } catch (error: any) {
      setMsg(error?.message ?? "No se pudo guardar la contraseña nueva.");
      setPhase("ready");
    }
  }, [pass, pass2]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
            }}
          >
            <SectionCard>
              <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "900" }}>
                Nueva contraseña
              </Text>

              {phase === "checking" && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <ActivityIndicator color={COLORS.accent} />
                  <Text style={{ color: COLORS.text, fontWeight: "800" }}>
                    Comprobando tu enlace...
                  </Text>
                </View>
              )}

              {phase === "invalid" && (
                <>
                  <InfoMessage
                    tone="error"
                    text="Este enlace no es válido o ha caducado. Pide uno nuevo desde la pantalla de acceso."
                  />
                  <AnimatedPressable
                    onPress={() => router.replace("/perfil" as Href)}
                    style={{
                      borderRadius: 16,
                      paddingVertical: 14,
                      alignItems: "center",
                      backgroundColor: COLORS.accent,
                    }}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>
                      Volver al acceso
                    </Text>
                  </AnimatedPressable>
                </>
              )}

              {(phase === "ready" || phase === "submitting") && (
                <>
                  <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                    Escribe tu contraseña nueva. Mínimo 6 caracteres.
                  </Text>

                  {msg ? <InfoMessage tone="error" text={msg} /> : null}

                  <View style={{ gap: 8 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "800" }}>Contraseña nueva</Text>
                    <TextInput
                      value={pass}
                      onChangeText={(t) => {
                        setPass(t);
                        setMsg(null);
                      }}
                      placeholder="Mínimo 6 caracteres"
                      placeholderTextColor="rgba(11,33,56,0.40)"
                      secureTextEntry
                      editable={phase === "ready"}
                      textContentType="newPassword"
                      autoComplete="password-new"
                      style={{
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        borderRadius: 14,
                        paddingHorizontal: 12,
                        paddingVertical: 13,
                        color: COLORS.text,
                        backgroundColor: COLORS.cardSoft,
                      }}
                    />
                  </View>

                  <View style={{ gap: 8 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "800" }}>Repite la contraseña</Text>
                    <TextInput
                      value={pass2}
                      onChangeText={(t) => {
                        setPass2(t);
                        setMsg(null);
                      }}
                      placeholder="Repite la contraseña"
                      placeholderTextColor="rgba(11,33,56,0.40)"
                      secureTextEntry
                      editable={phase === "ready"}
                      textContentType="newPassword"
                      autoComplete="password-new"
                      onSubmitEditing={() => {
                        if (canSubmit) submit();
                      }}
                      style={{
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        borderRadius: 14,
                        paddingHorizontal: 12,
                        paddingVertical: 13,
                        color: COLORS.text,
                        backgroundColor: COLORS.cardSoft,
                      }}
                    />
                  </View>

                  <AnimatedPressable
                    onPress={submit}
                    disabled={!canSubmit || phase === "submitting"}
                    style={{
                      borderRadius: 16,
                      paddingVertical: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: COLORS.accent,
                      opacity: !canSubmit || phase === "submitting" ? 0.5 : 1,
                    }}
                  >
                    {phase === "submitting" ? (
                      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                        <ActivityIndicator color="#FFFFFF" />
                        <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Guardando...</Text>
                      </View>
                    ) : (
                      <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>
                        Guardar contraseña
                      </Text>
                    )}
                  </AnimatedPressable>
                </>
              )}

              {phase === "done" && (
                <>
                  <InfoMessage tone="success" text="Contraseña actualizada correctamente." />
                  <AnimatedPressable
                    onPress={() => router.replace("/perfil" as Href)}
                    style={{
                      borderRadius: 16,
                      paddingVertical: 14,
                      alignItems: "center",
                      backgroundColor: COLORS.accent,
                    }}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>
                      Ir a mi cuenta
                    </Text>
                  </AnimatedPressable>
                </>
              )}
            </SectionCard>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
