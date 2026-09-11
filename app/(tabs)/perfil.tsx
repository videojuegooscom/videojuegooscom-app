/**
 * Qué hace: pantalla "Mi cuenta" (pestaña Perfil). Antes de iniciar sesión
 * muestra un formulario de acceso/registro; una vez hay sesión, muestra el
 * email conectado, el botón de cerrar sesión y (si el rol es admin) el acceso
 * al panel de administración. Al final, siempre (haya sesión o no), el
 * bloque "Síguenos" con los logos de las redes sociales activas
 * (components/SocialLinks.tsx).
 *
 * Cómo funciona:
 * - Usa Supabase Auth (supabase.auth.signInWithPassword / signUp / signOut /
 *   getSession) para el login y registro.
 * - Tras autenticar, consulta la tabla "profiles" (columna "role") para saber
 *   si la cuenta es "admin" o "user" y así decidir qué se muestra.
 * - El registro guarda nombre, usuario y país como metadata del usuario en
 *   Supabase (options.data en signUp).
 * - Toda la interfaz sigue el tema claro global: fondo blanco, azul claro
 *   como color de acento y textos en azul marino oscuro para contraste.
 * - Los textos de la pantalla de acceso son deliberadamente sobrios y
 *   funcionales (sin hablar de funciones futuras que aún no existen, como
 *   "chat global" o "perfil comunitario"): es lo primero que ve un cliente
 *   real de la tienda.
 * - Ya no hay una cabecera de página separada ("Acceso y registro" en gris
 *   arriba del todo): en su lugar va PromoBanner (misma franja "Te
 *   compramos tu consola..." que en el resto de pestañas), y todo el
 *   contenido de acceso vive centrado dentro de la tarjeta blanca.
 * - Solo hay UN botón de "Iniciar sesión": es el propio selector que está al
 *   lado de "Crear cuenta" (componente AuthPill). El primer toque abre el
 *   panel con los campos Email/Contraseña (formOpen) y, mientras ese modo
 *   sigue activo, el mismo botón crece y se pinta como el CTA azul grande
 *   (interpolando su Animated.Value pillAnimSignin/pillAnimSignup entre 0 y
 *   1): un segundo toque sobre él ya no cambia de modo, envía el formulario
 *   (handlePillPress). Lo mismo aplica a "Crear cuenta" en modo registro.
 *   Así no hay un botón duplicado "Iniciar sesión" arriba y otro abajo.
 * - El ancho de la tarjeta es responsive (cardMaxWidth vía
 *   useWindowDimensions): en móvil ocupa el ancho disponible, en pantallas
 *   grandes crece a una tarjeta centrada más ancha y con más aire (padding,
 *   tipografía), sin pasar a un layout de columnas.
 * - El ScrollView usa flexGrow:1 + justifyContent:"center" en su
 *   contentContainerStyle: cuando la tarjeta es más baja que la pantalla
 *   (caso normal, panel cerrado) queda centrada vertical y horizontalmente;
 *   si crece (panel abierto, mensajes de error, panel de admin...) el
 *   scroll sigue funcionando con normalidad desde arriba.
 * - ActionButton y AuthPill usan AnimatedPressable (definido en este mismo
 *   archivo, mismo patrón que components/VenderAhoraModal.tsx) para el
 *   efecto "pop" al pulsar: se encogen levemente y vuelven a su tamaño con
 *   un muelle (Animated.spring).
 * - El enlace "¿Olvidaste tu contraseña?" (solo en el modo "Iniciar sesión")
 *   llama a sendPasswordReset(), que usa
 *   supabase.auth.resetPasswordForEmail() y manda al cliente a
 *   app/reset-password.tsx por email. El mensaje de éxito es siempre igual,
 *   exista o no una cuenta con ese email (para no dejar comprobar por aquí
 *   qué emails están registrados).
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase usado para todo el login/registro.
 * - app/reset-password.tsx → pantalla a la que llega el cliente desde el
 *   enlace de "olvidé mi contraseña".
 * - app/admin/index.tsx → se abre con router.push("/admin") cuando el rol es
 *   "admin" (botón "Entrar al panel de administración").
 * - app/(tabs)/chat-global.tsx → su modal de "inicia sesión para comentar"
 *   trae al usuario a esta pantalla para autenticarse.
 * - app/(tabs)/_layout.tsx → define esta pestaña dentro de la barra inferior.
 * - components/PromoBanner.tsx → franja "Te compramos tu consola..." fija
 *   arriba del todo.
 * - components/VenderAhoraModal.tsx → formulario que abre el botón "Vender
 *   Ya" de esa franja.
 */
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import CategoryProductsShelf from "../../components/CategoryProductsShelf";
import PromoBanner from "../../components/PromoBanner";
import SiteFooter from "../../components/SiteFooter";
import SocialLinks from "../../components/SocialLinks";
import VenderAhoraModal from "../../components/VenderAhoraModal";
import { supabase } from "../../lib/supabase";

const COLORS = {
  bg: "#FFFFFF",
  // bg2/card/cardSoft eran tonos grisáceos muy sutiles (#F4F9FD/#F6FAFD/
  // #F8FBFE) para distinguir tarjetas del fondo. A petición de Daniel, ahora
  // valen igual que "bg" (blanco puro): toda la pantalla queda de un blanco
  // limpio y uniforme, sin ese "fondo blanco grisáceo" — los bloques se
  // siguen distinguiendo por el espaciado, no por un tono de fondo distinto.
  bg2: "#FFFFFF",
  card: "#FFFFFF",
  cardSoft: "#FFFFFF",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  mutedSoft: "rgba(11,33,56,0.48)",
  accent: "#1EA7E8",
  accentSoft: "#EAF6FD",
  accentBorder: "#BEE6FA",
  danger: "#B91C1C",
  dangerBg: "#FFE4E6",
  dangerBorder: "#FDA4AF",
  success: "#15803D",
  successBg: "#DCFCE7",
  successBorder: "#86EFAC",
  warning: "#92660B",
  warningBg: "#FEF3C7",
  warningBorder: "#FDE68A",
  gamingGlow: "#1EA7E8",
};

type AccessState = "checking" | "idle" | "submitting" | "signingOut" | "resettingPassword";
type SessionRole = "admin" | "user" | "guest";
type AuthMode = "signin" | "signup";

function normalizeEmail(value: string) {
  return (value ?? "").trim().toLowerCase();
}

function isValidEmail(value: string) {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function SectionCard({
  children,
  padding = 18,
}: {
  children: React.ReactNode;
  padding?: number;
}) {
  return (
    <View
      style={{
        borderRadius: 24,
        backgroundColor: COLORS.card,
        padding,
        gap: 14,
      }}
    >
      {children}
    </View>
  );
}

function Badge({
  text,
  tone = "default",
  center = false,
}: {
  text: string;
  tone?: "default" | "accent" | "success" | "warning";
  center?: boolean;
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
          bg: "#F6FAFD",
          border: "#E3EAF2",
          color: COLORS.text,
        };

  return (
    <View
      style={{
        alignSelf: center ? "center" : "flex-start",
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

// Envoltorio de Pressable con una pequeña animación "pop" tipo Apple: al
// pulsar se encoge levemente (Animated.spring) y al soltar vuelve a su
// tamaño normal. Mismo criterio que components/VenderAhoraModal.tsx —
// se define aquí también en vez de importarlo porque es un helper pequeño
// y este archivo no depende de ese componente (patrón ya usado en otros
// archivos del proyecto, como components/SellRequestMedia.tsx).
function AnimatedPressable({
  onPress,
  disabled,
  style,
  children,
}: {
  onPress?: () => void;
  disabled?: boolean;
  style?: any | ((state: { pressed: boolean }) => any);
  children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);

  function onPressIn() {
    setPressed(true);
    Animated.spring(scale, {
      toValue: 0.95,
      useNativeDriver: true,
      speed: 50,
      bounciness: 6,
    }).start();
  }

  function onPressOut() {
    setPressed(false);
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 6,
    }).start();
  }

  const resolvedStyle = typeof style === "function" ? style({ pressed }) : style;

  return (
    <Pressable onPress={onPress} disabled={disabled} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[resolvedStyle, { transform: [{ scale }] }]}>
        {typeof children === "function" ? children({ pressed }) : children}
      </Animated.View>
    </Pressable>
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
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled || loading}
      style={{
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 14,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: isPrimary ? 0 : 1,
        borderColor: isPrimary ? "transparent" : COLORS.border,
        backgroundColor: isPrimary ? COLORS.accent : COLORS.cardSoft,
        opacity: disabled || loading ? 0.5 : 1,
      }}
    >
      {loading ? (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <ActivityIndicator color={isPrimary ? "#FFFFFF" : COLORS.text} />
          <Text style={{ color: isPrimary ? "#FFFFFF" : COLORS.text, fontWeight: "900" }}>
            {loadingText}
          </Text>
        </View>
      ) : (
        <Text
          style={{
            color: isPrimary ? "#FFFFFF" : COLORS.text,
            fontWeight: "900",
            fontSize: 15,
          }}
        >
          {title}
        </Text>
      )}
    </AnimatedPressable>
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
  return (
    <Text style={{ color: COLORS.text, fontWeight: "800", textAlign: "center" }}>
      {children}
    </Text>
  );
}

// Fila de etiqueta con, opcionalmente, el botón de cerrar (X) alineado a la
// derecha a la misma altura que el texto. Se usa solo en el campo "Email"
// de cada panel (login/registro) para que la X quede a la altura de ese
// encabezado, en la esquina derecha, en vez de flotar arriba del todo de
// la tarjeta.
function LabelRow({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <View style={{ position: "relative", justifyContent: "center" }}>
      <Label>{children}</Label>
      {onClose ? (
        <Pressable
          onPress={onClose}
          hitSlop={8}
          style={{
            position: "absolute",
            right: 0,
            top: -7,
            width: 30,
            height: 30,
            borderRadius: 15,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(11,33,56,0.06)",
          }}
        >
          <Ionicons name="close" size={16} color={COLORS.text} />
        </Pressable>
      ) : null}
    </View>
  );
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
  const isPasswordField = !!secureTextEntry;
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={{ position: "relative", justifyContent: "center" }}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(11,33,56,0.40)"
        secureTextEntry={isPasswordField && !revealed}
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
          paddingRight: isPasswordField ? 44 : 12,
          paddingVertical: 13,
          color: COLORS.text,
          backgroundColor: "#F8FBFE",
          // 16px mínimo: por debajo, el móvil hace zoom automático al
          // tocar la casilla (ver components/ProductChatThread.tsx).
          fontSize: 16,
        }}
      />

      {isPasswordField ? (
        <Pressable
          onPress={() => setRevealed((prev) => !prev)}
          hitSlop={8}
          style={{
            position: "absolute",
            right: 12,
            height: "100%",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Ionicons
            name={revealed ? "eye-outline" : "eye-off-outline"}
            size={19}
            color={COLORS.mutedSoft}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

// Botón/pestaña combinados: es el selector de modo (Iniciar sesión / Crear
// cuenta) y, cuando su modo ya está activo, también el botón de envío del
// formulario — así no hace falta un segundo botón "Iniciar sesión" más
// abajo. `anim` (0 → 1) controla, con Animated.spring, tanto el ancho
// relativo (flex) como los colores: en 0 es una pestaña neutra pequeña, en 1
// es el CTA azul grande. El "pop" de pulsación (pressScale) es un
// Animated.Value aparte con useNativeDriver:true para que no choque con la
// animación de flex/color, que necesita useNativeDriver:false.
function AuthPill({
  title,
  anim,
  onPress,
  disabled,
  loading,
}: {
  title: string;
  anim: Animated.Value;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const pressScale = useRef(new Animated.Value(1)).current;

  function onPressIn() {
    Animated.spring(pressScale, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 50,
      bounciness: 6,
    }).start();
  }

  function onPressOut() {
    Animated.spring(pressScale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 6,
    }).start();
  }

  const flex = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });
  const backgroundColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#F8FBFE", COLORS.accent],
  });
  const borderColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.border, COLORS.accent],
  });
  const textColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.text, "#FFFFFF"],
  });
  const fontSize = anim.interpolate({ inputRange: [0, 1], outputRange: [13.5, 15] });

  return (
    // minWidth garantiza que, aunque el otro botón crezca al activarse, este
    // siempre tenga hueco de sobra para su texto completo (ni en móvil ni en
    // pantallas grandes se corta "Crear cuenta" a mitad).
    <Animated.View style={{ flex, minWidth: 118 }}>
      <Pressable onPress={onPress} disabled={disabled} onPressIn={onPressIn} onPressOut={onPressOut}>
        <Animated.View style={{ transform: [{ scale: pressScale }] }}>
          <Animated.View
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor,
              backgroundColor,
              paddingVertical: 13,
              paddingHorizontal: 8,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 8,
              opacity: disabled ? 0.6 : 1,
            }}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Animated.Text
                style={{ color: textColor, fontWeight: "900", fontSize }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {title}
              </Animated.Text>
            )}
          </Animated.View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

// Aparición suave (fade + pequeño desplazamiento) para el panel de campos
// que revela AuthPill al abrirse. Se remonta cada vez que cambia formOpen o
// mode, así que la animación se dispara de nuevo en cada apertura/cambio.
function RevealPanel({ children }: { children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [anim]);

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

export default function PerfilScreen() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [formOpen, setFormOpen] = useState(false);
  const [sellModalOpen, setSellModalOpen] = useState(false);

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
  const isResettingPassword = state === "resettingPassword";

  // Responsive: tarjeta centrada más ancha y con más aire en pantallas
  // grandes, sin pasar a un layout de columnas (móvil sigue con el ancho
  // disponible y su padding compacto habitual).
  const { width } = useWindowDimensions();
  const widthSafe = width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const isDesktop = widthSafe >= 1024;
  const cardMaxWidth = isMobile ? undefined : isDesktop ? 620 : 560;
  const cardPadding = isMobile ? 18 : isDesktop ? 26 : 22;
  const heroTitleSize = isMobile ? 24 : isDesktop ? 30 : 27;
  const pagePadding = isMobile ? 16 : 24;

  // pillAnimSignin/pillAnimSignup: 0 = pestaña neutra pequeña, 1 = CTA
  // grande activo. Solo uno de los dos vale 1 a la vez (o ninguno, si el
  // panel todavía no se ha abierto) — ver AuthPill y el useEffect de abajo.
  const pillAnimSignin = useRef(new Animated.Value(0)).current;
  const pillAnimSignup = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const targetSignin = formOpen && mode === "signin" ? 1 : 0;
    const targetSignup = formOpen && mode === "signup" ? 1 : 0;

    Animated.parallel([
      Animated.spring(pillAnimSignin, {
        toValue: targetSignin,
        useNativeDriver: false,
        speed: 14,
        bounciness: 6,
      }),
      Animated.spring(pillAnimSignup, {
        toValue: targetSignup,
        useNativeDriver: false,
        speed: 14,
        bounciness: 6,
      }),
    ]).start();
  }, [formOpen, mode, pillAnimSignin, pillAnimSignup]);

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

  // Un único botón por modo hace dos cosas según el estado: si el panel
  // todavía no está abierto, el primer toque solo lo abre (y fija el modo).
  // Si ya está abierto y el modo pulsado ya es el activo, ese mismo toque
  // ahora significa "enviar" (equivale al botón grande que antes iba debajo
  // del formulario). Si está abierto pero el modo pulsado es el otro, solo
  // cambia de modo (signin <-> signup) sin cerrar el panel.
  const handlePillPress = useCallback(
    (target: AuthMode) => {
      clearMessages();

      if (!formOpen) {
        setMode(target);
        setFormOpen(true);
        return;
      }

      if (mode !== target) {
        setMode(target);
        return;
      }

      if (target === "signin") {
        if (canSubmitLogin) signIn();
      } else if (canSubmitRegister) {
        signUp();
      }
    },
    [formOpen, mode, clearMessages, canSubmitLogin, canSubmitRegister, signIn, signUp]
  );

  // Envía el enlace de "olvidé mi contraseña" (ver app/reset-password.tsx).
  // El mensaje de éxito es siempre el mismo exista o no una cuenta con ese
  // email: así nadie puede usar este formulario para comprobar qué emails
  // están registrados en la tienda.
  const sendPasswordReset = useCallback(async () => {
    const e = normalizeEmail(email);

    clearMessages();

    if (!isValidEmail(e)) {
      setMsg("Escribe tu email arriba y pulsa de nuevo para recibir el enlace.");
      return;
    }

    setState("resettingPassword");

    try {
      const redirectTo =
        Platform.OS === "web" && typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : undefined;

      const { error } = await supabase.auth.resetPasswordForEmail(e, { redirectTo });

      if (error) {
        setMsg(error.message);
        setState("idle");
        return;
      }

      setOkMsg(
        "Si ese email tiene una cuenta, te hemos enviado un enlace para crear una contraseña nueva."
      );
      setState("idle");
    } catch (error: any) {
      setMsg(error?.message ?? "No se pudo enviar el enlace de recuperación.");
      setState("idle");
    }
  }, [clearMessages, email]);

  const signOut = useCallback(async () => {
    clearMessages();
    setState("signingOut");

    try {
      await supabase.auth.signOut();
      setSessionEmail(null);
      setSessionRole("guest");
      setEmail("");
      setPass("");
      setMode("signin");
      setFormOpen(false);
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

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <PromoBanner onPressVender={() => setSellModalOpen(true)} />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: pagePadding,
              paddingTop: isMobile ? 18 : 28,
              paddingBottom: 32,
              gap: 14,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: cardMaxWidth,
                alignSelf: "center",
                gap: 14,
              }}
            >
              <SectionCard padding={cardPadding}>
                <View
                  style={{
                    borderRadius: 22,
                    borderWidth: 1,
                    borderColor: "#BEE6FA",
                    backgroundColor: "#FFFFFF",
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      padding: cardPadding,
                      gap: 12,
                      backgroundColor: COLORS.bg2,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: COLORS.text,
                        fontSize: heroTitleSize,
                        fontWeight: "900",
                        textAlign: "center",
                      }}
                    >
                      {sessionRole === "guest" ? "Inicia sesión o regístrate" : "Tu cuenta está activa"}
                    </Text>

                    <Text
                      style={{
                        color: COLORS.muted,
                        lineHeight: 22,
                        maxWidth: 460,
                        textAlign: "center",
                      }}
                    >
                      {sessionRole === "guest"
                        ? "Accede con tu email y contraseña, o crea una cuenta nueva en un minuto."
                        : sessionRole === "admin"
                        ? "Has iniciado sesión correctamente. Esta cuenta tiene acceso al panel de administración."
                        : "Has iniciado sesión correctamente."}
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
                    <ActivityIndicator color={COLORS.accent} />
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                      Comprobando sesión...
                    </Text>
                  </View>
                ) : null}

                {sessionRole === "guest" ? (
                  <>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <AuthPill
                        title="Crear cuenta"
                        anim={pillAnimSignup}
                        onPress={() => handlePillPress("signup")}
                        disabled={
                          isChecking ||
                          isSigningOut ||
                          isResettingPassword ||
                          (isSubmitting && mode !== "signup")
                        }
                        loading={isSubmitting && formOpen && mode === "signup"}
                      />
                      <AuthPill
                        title="Iniciar sesión"
                        anim={pillAnimSignin}
                        onPress={() => handlePillPress("signin")}
                        disabled={
                          isChecking ||
                          isSigningOut ||
                          isResettingPassword ||
                          (isSubmitting && mode !== "signin")
                        }
                        loading={isSubmitting && formOpen && mode === "signin"}
                      />
                    </View>

                    {formOpen && mode === "signin" ? (
                      <RevealPanel>
                        <View style={{ gap: 12 }}>
                          <View style={{ gap: 8 }}>
                            <LabelRow
                              onClose={() => {
                                clearMessages();
                                setFormOpen(false);
                              }}
                            >
                              Email
                            </LabelRow>
                            <Input
                              value={email}
                              onChangeText={(text) => {
                                setEmail(text);
                                clearMessages();
                              }}
                              placeholder="tu@email.com"
                              keyboardType="email-address"
                              returnKeyType="next"
                              editable={!isChecking && !isSigningOut && !isResettingPassword}
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
                              editable={!isChecking && !isSigningOut && !isResettingPassword}
                              textContentType="password"
                              autoComplete="password"
                              onSubmitEditing={() => {
                                if (canSubmitLogin) signIn();
                              }}
                            />
                          </View>

                          <Pressable
                            onPress={sendPasswordReset}
                            disabled={isSubmitting || isResettingPassword}
                            hitSlop={6}
                            style={({ pressed }) => ({
                              alignSelf: "center",
                              opacity: isSubmitting || isResettingPassword ? 0.5 : pressed ? 0.6 : 1,
                            })}
                          >
                            <Text style={{ color: COLORS.accent, fontWeight: "800", fontSize: 13 }}>
                              {isResettingPassword ? "Enviando enlace..." : "¿Olvidaste tu contraseña?"}
                            </Text>
                          </Pressable>
                        </View>
                      </RevealPanel>
                    ) : null}

                    {formOpen && mode === "signup" ? (
                      <RevealPanel>
                        <View style={{ gap: 12 }}>
                          <View style={{ gap: 8 }}>
                            <Label>Nombre visible</Label>
                            <Input
                              value={registerName}
                              onChangeText={(text) => {
                                setRegisterName(text);
                                clearMessages();
                              }}
                              placeholder="Nombre y apellidos"
                              editable={!isChecking && !isSigningOut && !isResettingPassword}
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
                              placeholder="Nombre de usuario"
                              editable={!isChecking && !isSigningOut && !isResettingPassword}
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
                              placeholder="País de residencia"
                              editable={!isChecking && !isSigningOut && !isResettingPassword}
                              autoCapitalize="words"
                            />
                          </View>

                          <View style={{ gap: 8 }}>
                            <LabelRow
                              onClose={() => {
                                clearMessages();
                                setFormOpen(false);
                              }}
                            >
                              Email
                            </LabelRow>
                            <Input
                              value={email}
                              onChangeText={(text) => {
                                setEmail(text);
                                clearMessages();
                              }}
                              placeholder="tu@email.com"
                              keyboardType="email-address"
                              returnKeyType="next"
                              editable={!isChecking && !isSigningOut && !isResettingPassword}
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
                              editable={!isChecking && !isSigningOut && !isResettingPassword}
                              textContentType="newPassword"
                              autoComplete="password-new"
                              onSubmitEditing={() => {
                                if (canSubmitRegister) signUp();
                              }}
                            />
                          </View>
                        </View>
                      </RevealPanel>
                    ) : null}
                  </>
                ) : (
                  <View style={{ gap: 12 }}>
                    <View
                      style={{
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: "#E3EAF2",
                        backgroundColor: "#F8FBFE",
                        padding: 14,
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: COLORS.muted, fontSize: 12, fontWeight: "800" }}>
                        SESIÓN ACTUAL
                      </Text>
                      <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: "900" }}>
                        {sessionEmail || "No hay sesión iniciada"}
                      </Text>
                      <Text style={{ color: COLORS.mutedSoft, lineHeight: 19, textAlign: "center" }}>
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
                <SectionCard padding={cardPadding}>
                  <View style={{ alignItems: "center", gap: 14 }}>
                    <Badge text="Herramientas internas" tone="accent" center />

                    <Text
                      style={{
                        color: COLORS.text,
                        fontSize: 20,
                        fontWeight: "900",
                        textAlign: "center",
                      }}
                    >
                      Acceso interno disponible
                    </Text>

                    <Text style={{ color: COLORS.muted, lineHeight: 21, textAlign: "center" }}>
                      Esta cuenta tiene permisos autorizados. El acceso administrativo solo se
                      muestra cuando el usuario autenticado es realmente administrador.
                    </Text>
                  </View>

                  <ActionButton
                    title="Entrar al panel de administración"
                    onPress={openAdminPanel}
                  />
                </SectionCard>
              ) : null}

              <CategoryProductsShelf />

              <SectionCard padding={cardPadding}>
                <SocialLinks />
              </SectionCard>
            </View>

            <SiteFooter sidePadding={pagePadding} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <VenderAhoraModal visible={sellModalOpen} onClose={() => setSellModalOpen(false)} />
    </View>
  );
}