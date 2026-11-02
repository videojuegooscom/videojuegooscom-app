// app/reset-password.tsx
/**
 * Qué hace: pantalla donde un cliente pone su contraseña nueva después de
 * pulsar el enlace de recuperación que le llega por email (lo pide
 * app/(tabs)/perfil.tsx → «¿Olvidaste tu contraseña?», con
 * pedirEnlaceContrasena de lib/supabase.ts).
 *
 * Cómo funciona (dos tipos de enlace):
 * - ?token_hash=…&type=recovery (el de la plantilla del correo de la tienda,
 *   supabase/templates/recovery.html): se canjea aquí con
 *   supabase.auth.verifyOtp y sirve en CUALQUIER navegador o app (también si
 *   se pide en el ordenador y se abre en el móvil, o dentro de la app de
 *   Gmail). Después se quita de la dirección.
 * - ?code=… (el enlace de siempre de Supabase): lo canjea solo el cliente de
 *   Supabase (detectSessionInUrl, flujo PKCE de lib/supabase.ts), pero SOLO en
 *   el mismo navegador donde se pidió (allí se guardó su código de seguridad).
 *   Si se abre en otro, se explica por qué no sirve.
 * - Con la sesión de recuperación, supabase.auth.updateUser({ password })
 *   cambia la contraseña (no hace falta la antigua: el enlace de un solo uso
 *   ya demuestra que es el dueño del correo).
 * - Si el enlace no sirve (otro navegador, caducado o ya usado, o se llega sin
 *   enlace), se dice por qué en español y se puede pedir otro aquí mismo.
 * - Todos los errores de Supabase salen en español (mensajeAuthEnEspanol).
 * - Analítica propia (nunca el correo): contrasena_enlace_abierto (por qué
 *   vía), contrasena_enlace_invalido (por qué), contrasena_cambiada y, al
 *   pedir otro, contrasena_enlace_pedido / contrasena_enlace_error.
 *   Administración → Usuarios lo cuenta (30 días, «Recuperar contraseña»).
 *
 * Requisito en Supabase (fuera de este archivo, lo pone el dueño): la
 * plantilla «Reset password» con el enlace de token_hash (la del repositorio)
 * y, para el enlace de siempre, la tienda en Authentication → URL
 * Configuration (Site URL y Redirect URLs).
 *
 * Conectado con:
 * - app/(tabs)/perfil.tsx → pide el enlace.
 * - lib/supabase.ts → cliente, mensajes en español y pedirEnlaceContrasena.
 * - app/admin/users.tsx → cuenta los pedidos, aperturas y cambios.
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
import { Ionicons } from "@expo/vector-icons";
import { mensajeAuthEnEspanol, pedirEnlaceContrasena, supabase } from "../lib/supabase";
import { trackEvent } from "../lib/analytics";

const COLORS = {
  bg: "#FFFFFF",
  cardSoft: "#F8FBFE",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  accent: "#1EA7E8",
  danger: "#B91C1C",
  success: "#15803D",
};

type Phase = "checking" | "ready" | "invalid" | "submitting" | "done";
// Por qué no sirve el enlace (se cuenta en la analítica propia).
type Motivo = "otro_navegador" | "caducado" | "sin_enlace";

const TEXTO_MOTIVO: Record<Motivo, string> = {
  otro_navegador:
    "Este enlace hay que abrirlo en el mismo navegador donde lo pediste. Pide aquí otro y ábrelo desde este mismo móvil u ordenador.",
  caducado: "Este enlace ha caducado o ya se ha usado (cada enlace sirve una sola vez). Pide aquí otro.",
  sin_enlace: "Para crear una contraseña nueva hace falta el enlace que te enviamos por correo. Pídelo aquí.",
};

// Lo que trae la dirección al abrir el enlace (se lee una sola vez, antes de que nadie la cambie).
function leerEnlace() {
  const vacio = { tokenHash: "", tipo: "", codigo: "", error: "" };
  if (Platform.OS !== "web" || typeof window === "undefined") return vacio;
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const leer = (k: string) => q.get(k) ?? h.get(k) ?? "";
  return { tokenHash: leer("token_hash"), tipo: leer("type"), codigo: leer("code"), error: leer("error_code") || leer("error_description") || leer("error") };
}

// Quita el enlace de la dirección (no se queda en el historial ni se comparte sin querer).
function limpiarDireccion() {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  try {
    window.history.replaceState(window.history.state, "", window.location.pathname);
  } catch {
    // sin historial: no pasa nada
  }
}

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function AnimatedPressable({
  onPress,
  disabled,
  style,
  children,
  accessibilityLabel,
}: {
  onPress?: () => void;
  disabled?: boolean;
  style?: any;
  children?: React.ReactNode;
  accessibilityLabel?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  function onPressIn() {
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 50, bounciness: 6 }).start();
  }

  function onPressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

// Columna centrada sin tarjeta envolvente (sin borde ni fondo).
function SectionCard({ children }: { children: React.ReactNode }) {
  return <View style={{ gap: 14, width: "100%", maxWidth: 440 }}>{children}</View>;
}

// Mensaje limpio: solo texto centrado en su color, sin pastilla de fondo.
function InfoMessage({ text, tone, nativeID }: { text: string; tone: "error" | "success"; nativeID?: string }) {
  const color = tone === "error" ? COLORS.danger : COLORS.success;

  return (
    <Text nativeID={nativeID} style={{ color, fontWeight: "800", lineHeight: 20, textAlign: "center" }}>
      {text}
    </Text>
  );
}

const labelStyle = { color: COLORS.text, fontWeight: "800", textAlign: "center" } as const;
const campoStyle = {
  borderWidth: 1,
  borderColor: COLORS.border,
  borderRadius: 14,
  paddingHorizontal: 12,
  paddingVertical: 13,
  color: COLORS.text,
  backgroundColor: COLORS.cardSoft,
  // 16 px: con menos, Safari (iPhone) hace zoom al enfocar.
  fontSize: 16,
} as const;
const botonAzul = {
  borderRadius: 16,
  minHeight: 48,
  paddingVertical: 14,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: COLORS.accent,
} as const;

export default function ResetPasswordScreen() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [motivo, setMotivo] = useState<Motivo>("sin_enlace");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [verContrasena, setVerContrasena] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Pedir otro enlace desde aquí (cuando este no sirve).
  const [correo, setCorreo] = useState("");
  const [pidiendo, setPidiendo] = useState(false);
  const [pedido, setPedido] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enlace] = useState(leerEnlace);
  const contadoRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    // Cada apertura se cuenta una sola vez (sea válida o no).
    const contar = (nombre: string, etiqueta: string, metadata: Record<string, unknown>) => {
      if (contadoRef.current) return;
      contadoRef.current = true;
      void trackEvent(nombre, etiqueta, { metadata });
    };
    const lista = (via: "token" | "codigo" | "sesion") => {
      if (!mounted) return;
      setPhase((p) => (p === "checking" ? "ready" : p));
      contar("contrasena_enlace_abierto", "Contraseña: enlace abierto", { via });
    };
    const noSirve = (m: Motivo) => {
      if (!mounted) return;
      setMotivo(m);
      setPhase((p) => (p === "checking" ? "invalid" : p));
      contar("contrasena_enlace_invalido", "Contraseña: enlace que no sirve", { motivo: m });
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") lista(enlace.tokenHash ? "token" : "codigo");
    });

    (async () => {
      // Supabase manda aquí los enlaces caducados o ya usados con el error en la dirección.
      if (enlace.error) {
        limpiarDireccion();
        noSirve("caducado");
        return;
      }
      // Enlace de la plantilla de la tienda: sirve en cualquier navegador.
      if (enlace.tokenHash && enlace.tipo === "recovery") {
        try {
          const { data, error } = await supabase.auth.verifyOtp({ token_hash: enlace.tokenHash, type: "recovery" });
          limpiarDireccion();
          if (error || !data.session) noSirve("caducado");
          else lista("token");
        } catch {
          noSirve("caducado");
        }
        return;
      }
      // Enlace de siempre (?code=): el cliente de Supabase ya lo ha canjeado si este es el navegador donde se pidió
      // (getSession espera a que termine).
      const { data } = await supabase.auth.getSession();
      if (data.session) lista(enlace.codigo ? "codigo" : "sesion");
      else noSirve(enlace.codigo ? "otro_navegador" : "sin_enlace");
    })();

    // Por si la red no contesta: no se queda «comprobando» para siempre.
    const timeout = setTimeout(() => {
      if (mounted) setPhase((p) => (p === "checking" ? "invalid" : p));
    }, 15000);

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [enlace]);

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
        setMsg(mensajeAuthEnEspanol(error, "No se ha podido guardar la contraseña nueva. Inténtalo de nuevo."));
        setPhase("ready");
        return;
      }

      void trackEvent("contrasena_cambiada", "Contraseña: cambiada");
      setPhase("done");
    } catch (error: any) {
      setMsg(mensajeAuthEnEspanol(error, "No se ha podido guardar la contraseña nueva. Inténtalo de nuevo."));
      setPhase("ready");
    }
  }, [pass, pass2]);

  const pedirOtro = useCallback(async () => {
    const e = correo.trim().toLowerCase();
    setPedido(null);
    if (!isValidEmail(e)) {
      setPedido({ ok: false, texto: "Escribe el correo de tu cuenta." });
      return;
    }
    setPidiendo(true);
    const r = await pedirEnlaceContrasena(e);
    setPidiendo(false);
    if (r.ok) {
      void trackEvent("contrasena_enlace_pedido", "Contraseña: enlace pedido", { metadata: { desde: "enlace" } });
      setPedido({
        ok: true,
        texto: "Si ese email tiene una cuenta, te hemos enviado un enlace nuevo. Ábrelo desde este mismo móvil u ordenador (mira también en Spam).",
      });
    } else {
      void trackEvent("contrasena_enlace_error", "Contraseña: no se pudo pedir el enlace", { metadata: { desde: "enlace", motivo: r.motivo } });
      setPedido({ ok: false, texto: r.mensaje });
    }
  }, [correo]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              flexGrow: 1,
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
            }}
          >
            <SectionCard>
              <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "900", textAlign: "center" }}>
                Nueva contraseña
              </Text>

              {phase === "checking" && (
                <View
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}
                >
                  <ActivityIndicator color={COLORS.accent} />
                  <Text style={{ color: COLORS.text, fontWeight: "800" }}>
                    Comprobando tu enlace...
                  </Text>
                </View>
              )}

              {phase === "invalid" && (
                <View nativeID="contrasena-enlace-no-sirve" style={{ gap: 14 }}>
                  <InfoMessage tone="error" text={TEXTO_MOTIVO[motivo]} />
                  <View style={{ gap: 8 }}>
                    <Text style={labelStyle}>Tu correo</Text>
                    <TextInput
                      nativeID="contrasena-correo"
                      value={correo}
                      onChangeText={(t) => {
                        setCorreo(t);
                        setPedido(null);
                      }}
                      placeholder="tu@email.com"
                      placeholderTextColor="rgba(11,33,56,0.40)"
                      autoCapitalize="none"
                      autoComplete="email"
                      keyboardType="email-address"
                      textContentType="emailAddress"
                      onSubmitEditing={pedirOtro}
                      style={campoStyle}
                    />
                  </View>
                  {pedido ? <InfoMessage nativeID="contrasena-pedido" tone={pedido.ok ? "success" : "error"} text={pedido.texto} /> : null}
                  <AnimatedPressable onPress={pedirOtro} disabled={pidiendo} style={{ ...botonAzul, opacity: pidiendo ? 0.6 : 1 }}>
                    <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>
                      {pidiendo ? "Enviando…" : "Enviarme otro enlace"}
                    </Text>
                  </AnimatedPressable>
                  <Pressable
                    onPress={() => router.replace("/perfil" as Href)}
                    accessibilityRole="button"
                    style={({ pressed }) => ({ minHeight: 44, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900", textDecorationLine: "underline" }}>Volver al acceso</Text>
                  </Pressable>
                </View>
              )}

              {(phase === "ready" || phase === "submitting") && (
                <>
                  <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
                    Escribe tu contraseña nueva. Mínimo 6 caracteres.
                  </Text>

                  {msg ? <InfoMessage nativeID="contrasena-error" tone="error" text={msg} /> : null}

                  <View style={{ gap: 8 }}>
                    <Text style={labelStyle}>Contraseña nueva</Text>
                    <TextInput
                      value={pass}
                      onChangeText={(t) => {
                        setPass(t);
                        setMsg(null);
                      }}
                      placeholder="Mínimo 6 caracteres"
                      placeholderTextColor="rgba(11,33,56,0.40)"
                      secureTextEntry={!verContrasena}
                      editable={phase === "ready"}
                      textContentType="newPassword"
                      autoComplete="password-new"
                      style={campoStyle}
                    />
                  </View>

                  <View style={{ gap: 8 }}>
                    <Text style={labelStyle}>Repite la contraseña</Text>
                    <TextInput
                      value={pass2}
                      onChangeText={(t) => {
                        setPass2(t);
                        setMsg(null);
                      }}
                      placeholder="Repite la contraseña"
                      placeholderTextColor="rgba(11,33,56,0.40)"
                      secureTextEntry={!verContrasena}
                      editable={phase === "ready"}
                      textContentType="newPassword"
                      autoComplete="password-new"
                      onSubmitEditing={() => {
                        if (canSubmit) submit();
                      }}
                      style={campoStyle}
                    />
                  </View>

                  {/* Ver lo escrito, para no equivocarse al teclear en el móvil. */}
                  <Pressable
                    onPress={() => setVerContrasena((v) => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={verContrasena ? "Ocultar las contraseñas" : "Mostrar las contraseñas"}
                    style={({ pressed }) => ({
                      minHeight: 44,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Ionicons name={verContrasena ? "eye-off-outline" : "eye-outline"} size={20} color={COLORS.accent} />
                    <Text style={{ color: COLORS.text, fontWeight: "800" }}>{verContrasena ? "Ocultar" : "Mostrar"}</Text>
                  </Pressable>

                  <AnimatedPressable
                    onPress={submit}
                    disabled={phase === "submitting" || !canSubmit}
                    style={{ ...botonAzul, opacity: phase === "submitting" || !canSubmit ? 0.5 : 1 }}
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
                  <InfoMessage tone="success" text="Contraseña actualizada correctamente. Ya has entrado en tu cuenta con ella." />
                  <AnimatedPressable onPress={() => router.replace("/perfil" as Href)} style={botonAzul}>
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
