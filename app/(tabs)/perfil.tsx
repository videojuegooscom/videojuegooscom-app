/**
 * Qué hace: pantalla "Mi cuenta" (pestaña Perfil). Antes de iniciar sesión
 * muestra un formulario de acceso/registro; una vez hay sesión, muestra «Tu
 * perfil» (nombre, usuario, país, provincia y edad: PerfilDatos, al final de
 * este archivo), el email conectado, el botón de cerrar sesión y (si el rol es
 * admin) el acceso al panel de control. Al final, el pie de página (con las
 * redes sociales, una sola vez).
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
 *   arriba del todo): todo el contenido de acceso vive centrado, sin
 *   tarjetas ni burbujas envolventes.
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
 */
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
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
import { marcarSeguimientosVistos } from "../../components/Campanita";
import CategoryProductsShelf from "../../components/CategoryProductsShelf";
import CargaMarca from "../../components/marca/CargaMarca";
import MarcaAnimada from "../../components/marca/MarcaAnimada";
import SiteFooter from "../../components/SiteFooter";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";
import { trackEvent } from "../../lib/analytics";

// Ficha a la que volver tras iniciar sesión o registrarse (la deja «Comprar ya» de la ficha).
const VOLVER_TRAS_ACCESO_KEY = "videojuegoszaragoza:volver_tras_acceso";

const COLORS = {
  bg: "#FFFFFF",
  // bg2/card/cardSoft eran tonos grisáceos muy sutiles (#F4F9FD/#F6FAFD/
  // #F8FBFE) para distinguir tarjetas del fondo. A petición de Daniel, ahora
  // valen igual que "bg" (blanco puro): toda la pantalla queda de un blanco
  // limpio y uniforme, sin ese "fondo blanco grisáceo" — los bloques se
  // siguen distinguiendo por el espaciado, no por un tono de fondo distinto.
  cardSoft: "#FFFFFF",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  mutedSoft: "rgba(11,33,56,0.62)",
  accent: "#1EA7E8",
  danger: "#B91C1C",
  success: "#15803D",
};

type AccessState = "checking" | "idle" | "submitting" | "signingOut" | "resettingPassword";
type SessionRole = "admin" | "user" | "guest";
type AuthMode = "signin" | "signup";
type PerfilTab = "cuenta" | "seguimientos";

function normalizeEmail(value: string) {
  return (value ?? "").trim().toLowerCase();
}

function isValidEmail(value: string) {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Bloque de sección sin envoltorio visual (sin borde ni fondo): solo agrupa.
// La separación vertical entre apartados la pone el contenedor (sectionGap).
function SectionCard({
  children,
  padding = 18,
}: {
  children: React.ReactNode;
  padding?: number;
}) {
  return <View style={{ paddingHorizontal: padding, gap: 14 }}>{children}</View>;
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
  // Mensaje limpio: solo texto centrado en su color, sin pastilla de fondo.
  const color = tone === "error" ? COLORS.danger : COLORS.success;

  return (
    <Text style={{ color, fontWeight: "800", lineHeight: 20, textAlign: "center" }}>{text}</Text>
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

  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");

  const [registerName, setRegisterName] = useState("");
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerCountry, setRegisterCountry] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [state, setState] = useState<AccessState>("checking");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [sessionRole, setSessionRole] = useState<SessionRole>("guest");

  // Pestañas del perfil con sesión: "Mi cuenta" | "Seguimientos" (?tab=seguimientos)
  // ?aviso=… lo manda quien trae aquí para iniciar sesión (p. ej. "Hablar con el equipo").
  // ?acceso=registro | entrar → abre directamente el formulario de crear cuenta o de iniciar
  // sesión (lo usa la guía de Blue, components/Campanita.tsx).
  const {
    tab: tabParam,
    aviso: avisoParam,
    acceso: accesoParam,
  } = useLocalSearchParams<{ tab?: string; aviso?: string; acceso?: string }>();
  const aviso = typeof avisoParam === "string" ? avisoParam.slice(0, 160) : "";
  useEffect(() => {
    if (accesoParam === "registro" || accesoParam === "entrar") {
      setMode(accesoParam === "registro" ? "signup" : "signin");
      setFormOpen(true);
    }
  }, [accesoParam]);
  const [perfilTab, setPerfilTab] = useState<PerfilTab>(
    tabParam === "seguimientos" ? "seguimientos" : "cuenta"
  );
  useEffect(() => {
    if (tabParam === "seguimientos") setPerfilTab("seguimientos");
  }, [tabParam]);
  const isLogged = sessionRole !== "guest";
  const showSeguimientos = isLogged && perfilTab === "seguimientos";

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
  // Aire entre apartados: 36px en móvil, 48px en escritorio.
  const sectionGap = isMobile ? 36 : 48;

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
        setSessionUserId(null);
        setSessionRole("guest");
        setState("idle");
        return;
      }

      const currentEmail = normalizeEmail(session.user.email ?? "");
      const userId = session.user.id;

      setSessionEmail(currentEmail || null);
      setSessionUserId(userId);

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
      setSessionUserId(null);
      setSessionRole("guest");
      setState("idle");
      setMsg(error?.message ?? "No se pudo comprobar la sesión actual.");
    }
  }, []);

  useEffect(() => {
    hydrateSessionState();
  }, [hydrateSessionState]);

  // «Comprar ya» sin sesión deja aquí la ficha a la que volver: en cuanto hay sesión (al iniciar
  // sesión o al crear la cuenta) se vuelve a esa ficha. La marca caduca a los 30 minutos.
  useEffect(() => {
    if (!sessionEmail) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(VOLVER_TRAS_ACCESO_KEY);
        if (!raw) return;
        await AsyncStorage.removeItem(VOLVER_TRAS_ACCESO_KEY);
        const v = JSON.parse(raw) as { ruta?: string; hasta?: number };
        if (v?.ruta && typeof v.ruta === "string" && v.ruta.startsWith("/") && Date.now() < Number(v.hasta ?? 0)) {
          router.replace(v.ruta as never);
        }
      } catch {
        // sin marca válida: se queda en el perfil
      }
    })();
  }, [sessionEmail]);

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
      setSessionUserId(userId);
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
      setSessionUserId(null);
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
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            // Formulario de acceso: el primer toque fuera del teclado ya pulsa el botón
            // y al arrastrar la página se cierra el teclado.
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: pagePadding,
              paddingTop: isMobile ? 28 : 40,
              paddingBottom: 32,
              // + 8px de margen del pie = sectionGap.
              gap: sectionGap - 8,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: cardMaxWidth,
                alignSelf: "center",
                gap: sectionGap,
              }}
            >
              {/* Las pestañas van pegadas a su contenido (no cuentan como apartado). */}
              <View style={{ gap: 18 }}>
              {isLogged ? <PerfilTabs value={perfilTab} onChange={setPerfilTab} /> : null}

              {showSeguimientos ? (
                <SectionCard padding={cardPadding}>
                  <SeguimientosSeccion />
                </SectionCard>
              ) : (
              <>
              {/* Tus datos (nombre, usuario, país, provincia y edad): primero lo tuyo, después la sesión. La tarjeta se oculta
                  sola si la tabla perfiles_cliente aún no está creada (migración sin aplicar). */}
              {isLogged && sessionUserId ? (
                <SectionCard padding={cardPadding}>
                  <PerfilDatos uid={sessionUserId} />
                </SectionCard>
              ) : null}
              <SectionCard padding={cardPadding}>
                <View style={{ gap: 12, alignItems: "center" }}>
                    {sessionRole === "guest" ? <MarcaAnimada cual="logo-mini" ancho={96} /> : null}
                    {sessionRole === "guest" && aviso ? (
                      <Text style={{ color: "#1EA7E8", fontWeight: "800", textAlign: "center" }}>
                        {aviso}
                      </Text>
                    ) : null}
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

                {msg ? <InfoMessage text={msg} tone="error" /> : null}
                {okMsg ? <InfoMessage text={okMsg} tone="success" /> : null}

                {isChecking ? (
                  <CargaMarca texto="Comprobando sesión…" />
                ) : null}

                {sessionRole === "guest" ? (
                  <>
                    {/* nativeID: sin sesión, la guía de Blue enmarca estas dos pestañas. */}
                    <View nativeID="perfil-acceso" style={{ flexDirection: "row", justifyContent: "center", gap: 10 }}>
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
                    <View style={{ gap: 8, alignItems: "center" }}>
                      <Text
                        style={{ color: COLORS.muted, fontSize: 12, fontWeight: "800", textAlign: "center" }}
                      >
                        SESIÓN ACTUAL
                      </Text>
                      <Text
                        style={{ color: COLORS.text, fontSize: 16, fontWeight: "900", textAlign: "center" }}
                      >
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
              </>
              )}
              </View>

              {!showSeguimientos && sessionRole === "admin" ? (
                <SectionCard padding={cardPadding}>
                  <ActionButton title="Panel de control" onPress={openAdminPanel} />
                </SectionCard>
              ) : null}

              <CategoryProductsShelf />
              {/* Las redes sociales ya salen en el pie de página (SiteFooter): no se repiten. */}
            </View>

            <SiteFooter sidePadding={pagePadding} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ============================================================================
// Pestañas del perfil y sección "Seguimientos" (pedidos + reparaciones)
// ----------------------------------------------------------------------------
// Lee "pedidos" + "pedido_items" (user_id = cliente): si la tabla aún no existe
// (migración pendiente) esa parte se oculta sin error. Lee "service_requests"
// (customer_user_id = cliente): si faltan las columnas de seguimiento, usa solo
// lo que exista. "Preguntar por esto" abre Blue IA con ?pedido= o ?reparacion=.
// El panel admin (app/admin/services.tsx) cambia la etapa de cada reparación.
// ============================================================================

const SEG = {
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  mutedSoft: "rgba(11,33,56,0.45)",
  line: "#E3EAF2",
  accent: "#1EA7E8",
  accentDark: "#1EA7E8",
  danger: "#DC2626",
};

// Selector de pestañas centrado con subrayado azul en la activa.
function PerfilTabs({ value, onChange }: { value: PerfilTab; onChange: (t: PerfilTab) => void }) {
  const tabs: { key: PerfilTab; label: string }[] = [
    { key: "cuenta", label: "Mi cuenta" },
    { key: "seguimientos", label: "Seguimientos" },
  ];
  return (
    // nativeID: la guía de Blue (components/Campanita.tsx) enmarca estas pestañas.
    <View nativeID="perfil-pestanas" style={{ flexDirection: "row", justifyContent: "center", gap: 28, paddingTop: 4 }}>
      {tabs.map((t) => {
        const active = value === t.key;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            hitSlop={6}
            style={({ pressed }) => ({ alignItems: "center", gap: 6, opacity: pressed ? 0.7 : 1 })}
          >
            <Text style={{ color: active ? SEG.text : SEG.muted, fontWeight: "900", fontSize: 15 }}>{t.label}</Text>
            <View
              style={{
                height: 3,
                width: 28,
                borderRadius: 2,
                backgroundColor: active ? SEG.accent : "transparent",
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

type EtapaReparacion = "solicitado" | "recibido" | "diagnostico" | "reparando" | "listo" | "entregado" | "cancelado";
const ETAPAS_REPARACION: EtapaReparacion[] = ["solicitado", "recibido", "diagnostico", "reparando", "listo", "entregado"];
const ETIQUETA_REPARACION: Record<EtapaReparacion, string> = {
  solicitado: "Solicitada",
  recibido: "Recibida",
  diagnostico: "Diagnóstico",
  reparando: "En reparación",
  listo: "Lista para recoger",
  entregado: "Entregada",
  cancelado: "Cancelada",
};

type EstadoPedido = "pendiente" | "confirmado" | "preparado" | "enviado" | "entregado" | "cancelado";
const ETAPAS_PEDIDO: EstadoPedido[] = ["pendiente", "confirmado", "preparado", "enviado", "entregado"];

function etiquetasPedido(entrega: string | null): string[] {
  return ["Pendiente", "Confirmado", "Preparando", entrega === "recogida" ? "Listo para recoger" : "Enviado", "Entregado"];
}

type PedidoSeg = {
  id: string;
  numero: number | null;
  created_at: string;
  estado: EstadoPedido;
  entrega: "envio" | "recogida" | null;
  total_eur: number | null;
  items: string[];
};

type ReparacionSeg = {
  id: string;
  created_at: string;
  service_title: string;
  seguimiento: EtapaReparacion;
  seguimiento_nota: string | null;
  seguimiento_actualizado: string | null;
};

function segFecha(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

// Precio siempre con dos decimales, coma decimal y miles con punto (155,00€ · 1.299,00€).
function segEuros(n: number | null) {
  if (n == null || !Number.isFinite(Number(n))) return "";
  const cents = Math.round(Number(n) * 100);
  const [ent, dec] = (Math.abs(cents) / 100).toFixed(2).split(".");
  return `${cents < 0 ? "-" : ""}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}€`;
}

// Tabla/columna inexistente (migración aún sin aplicar)
function faltaEsquema(error: any) {
  const code = String(error?.code ?? "");
  return ["42P01", "42703", "PGRST205", "PGRST204"].includes(code);
}

// Línea de progreso: puntos unidos, etapa actual en azul; cancelado en rojo.
function LineaProgreso({ etiquetas, actual, cancelado }: { etiquetas: string[]; actual: number; cancelado: boolean }) {
  if (cancelado) {
    return (
      <View style={{ width: "100%", maxWidth: 460, alignItems: "center", gap: 6, paddingVertical: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", width: "100%", paddingHorizontal: 18 }}>
          {etiquetas.map((_, i) => (
            <React.Fragment key={i}>
              {i > 0 ? <View style={{ flex: 1, height: 2, backgroundColor: "rgba(220,38,38,0.25)" }} /> : null}
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "rgba(220,38,38,0.4)" }} />
            </React.Fragment>
          ))}
        </View>
        <Text style={{ color: SEG.danger, fontWeight: "900", fontSize: 13 }}>Cancelado</Text>
      </View>
    );
  }

  return (
    <View style={{ width: "100%", maxWidth: 460, gap: 8, paddingVertical: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18 }}>
        {etiquetas.map((_, i) => {
          const esActual = i === actual;
          return (
            <React.Fragment key={i}>
              {i > 0 ? <View style={{ flex: 1, height: 2, backgroundColor: i <= actual ? SEG.accent : SEG.line }} /> : null}
              <View
                style={{
                  width: esActual ? 16 : 10,
                  height: esActual ? 16 : 10,
                  borderRadius: 8,
                  backgroundColor: i <= actual ? SEG.accent : SEG.line,
                  borderWidth: esActual ? 3 : 0,
                  borderColor: "rgba(30,167,232,0.25)",
                }}
              />
            </React.Fragment>
          );
        })}
      </View>
      <View style={{ flexDirection: "row" }}>
        {etiquetas.map((t, i) => (
          <Text
            key={i}
            numberOfLines={2}
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: 10.5,
              lineHeight: 13,
              color: i === actual ? SEG.accent : i < actual ? SEG.text : SEG.mutedSoft,
              fontWeight: i === actual ? "900" : "700",
            }}
          >
            {t}
          </Text>
        ))}
      </View>
    </View>
  );
}

function PreguntarBoton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingVertical: 4 })}>
      <Text style={{ color: SEG.accentDark, fontWeight: "900", fontSize: 13.5 }}>Preguntar por esto</Text>
    </Pressable>
  );
}

function SegVacio({
  cual,
  texto,
  boton,
  destino,
}: {
  cual: "tienda" | "taller";
  texto: string;
  boton: string;
  destino: "/catalogo" | "/servicios";
}) {
  return (
    <View style={{ alignItems: "center", gap: 10, paddingVertical: 6 }}>
      <MarcaAnimada cual={cual} ancho={110} />
      <Text style={{ color: SEG.muted, textAlign: "center", lineHeight: 20, maxWidth: 360 }}>{texto}</Text>
      <Pressable
        onPress={() => router.push(destino)}
        style={({ pressed }) => ({
          borderRadius: 999,
          paddingVertical: 12,
          paddingHorizontal: 22,
          backgroundColor: SEG.accentDark,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>{boton}</Text>
      </Pressable>
    </View>
  );
}

function SegTitulo({ children }: { children: React.ReactNode }) {
  return <Text style={{ color: SEG.text, fontWeight: "900", fontSize: 19, textAlign: "center" }}>{children}</Text>;
}

function SegSeparador() {
  return <View style={{ height: 1, backgroundColor: SEG.line, width: "100%", maxWidth: 460 }} />;
}

function SeguimientosSeccion() {
  const [cargando, setCargando] = useState(true);
  const [conSesion, setConSesion] = useState(false);
  const [pedidos, setPedidos] = useState<PedidoSeg[] | null>(null); // null = tabla aún no disponible
  const [reparaciones, setReparaciones] = useState<ReparacionSeg[]>([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid) {
        setConSesion(false);
        return;
      }
      setConSesion(true);

      // Lo que se enseña aquí queda «visto» (Blue deja de avisar de esos cambios): se apunta al final.
      const vistosPedidos: { id: string; estado: string }[] = [];
      const vistasReparaciones: { id: string; etapa: string; actualizado: string }[] = [];

      // Pedidos (la tabla puede no existir aún)
      const pedRes = await supabase
        .from("pedidos")
        .select("id,numero,created_at,estado,entrega,total_eur")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(50);

      if (pedRes.error) {
        if (!faltaEsquema(pedRes.error)) console.error("Error cargando pedidos:", pedRes.error);
        setPedidos(null);
      } else {
        const filas = (pedRes.data ?? []) as Omit<PedidoSeg, "items">[];
        const porPedido: Record<string, string[]> = {};
        if (filas.length) {
          const itRes = await supabase
            .from("pedido_items")
            .select("pedido_id,titulo")
            .in("pedido_id", filas.map((p) => p.id));
          for (const it of (itRes.data ?? []) as { pedido_id: string; titulo: string }[]) {
            (porPedido[it.pedido_id] ??= []).push(it.titulo);
          }
        }
        setPedidos(filas.map((p) => ({ ...p, items: porPedido[p.id] ?? [] })));
        for (const p of filas) vistosPedidos.push({ id: p.id, estado: String(p.estado ?? "pendiente") });
      }

      // Reparaciones (las columnas de seguimiento pueden no existir aún)
      let repRes: { data: any[] | null; error: any } = await supabase
        .from("service_requests")
        .select("id,created_at,service_title,status,seguimiento,seguimiento_nota,seguimiento_actualizado")
        .eq("customer_user_id", uid)
        .order("created_at", { ascending: false })
        .limit(50);

      if (repRes.error && faltaEsquema(repRes.error)) {
        repRes = await supabase
          .from("service_requests")
          .select("id,created_at,service_title,status")
          .eq("customer_user_id", uid)
          .order("created_at", { ascending: false })
          .limit(50);
      }

      if (repRes.error) {
        console.error("Error cargando reparaciones:", repRes.error);
        setReparaciones([]);
      } else {
        setReparaciones(
          (repRes.data ?? []).map((r: any) => ({
            id: r.id,
            created_at: r.created_at,
            service_title: r.service_title ?? "Servicio",
            seguimiento:
              r.seguimiento && r.seguimiento in ETIQUETA_REPARACION
                ? r.seguimiento
                : r.status === "descartado"
                ? "cancelado"
                : "solicitado",
            seguimiento_nota: r.seguimiento_nota ?? null,
            seguimiento_actualizado: r.seguimiento_actualizado ?? null,
          }))
        );
        for (const r of repRes.data ?? []) {
          vistasReparaciones.push({
            id: String(r.id),
            etapa: String(r.seguimiento ?? "solicitado"),
            actualizado: String(r.seguimiento_actualizado ?? ""),
          });
        }
      }

      // Ya se han visto: Blue quita sus avisos de estado.
      await marcarSeguimientosVistos(uid, vistosPedidos, vistasReparaciones);
    } catch (e) {
      console.error("Error cargando seguimientos:", e);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (cargando) return <CargaMarca texto="Cargando tus seguimientos…" />;
  if (!conSesion) return null;

  return (
    <View style={{ gap: 40, alignItems: "center" }}>
      {pedidos !== null ? (
        <View style={{ gap: 18, alignItems: "center", width: "100%" }}>
          <SegTitulo>Mis pedidos</SegTitulo>
          {pedidos.length === 0 ? (
            <SegVacio
              cual="tienda"
              texto="Aún no tienes pedidos. Cuando compres algo, podrás seguirlo aquí paso a paso."
              boton="Ver catálogo"
              destino="/catalogo"
            />
          ) : (
            pedidos.map((p, i) => (
              <View key={p.id} style={{ gap: 10, alignItems: "center", width: "100%" }}>
                {i > 0 ? <SegSeparador /> : null}
                <Text style={{ color: SEG.text, fontWeight: "900", fontSize: 15.5, textAlign: "center" }}>
                  Pedido nº {p.numero ?? "—"}
                  {p.total_eur != null ? ` · ${segEuros(p.total_eur)}` : ""}
                  {` · ${segFecha(p.created_at)}`}
                </Text>
                {p.items.length ? (
                  <Text style={{ color: SEG.muted, textAlign: "center", lineHeight: 19, maxWidth: 460 }}>
                    {p.items.join(" · ")}
                  </Text>
                ) : null}
                {p.entrega ? (
                  <Text style={{ color: SEG.mutedSoft, fontSize: 12.5, textAlign: "center" }}>
                    {p.entrega === "recogida" ? "Recogida en tienda" : "Envío a domicilio"}
                  </Text>
                ) : null}
                <LineaProgreso
                  etiquetas={etiquetasPedido(p.entrega)}
                  actual={Math.max(0, ETAPAS_PEDIDO.indexOf(p.estado))}
                  cancelado={p.estado === "cancelado"}
                />
                <PreguntarBoton onPress={() => router.push(`/blue-ia?pedido=${p.numero ?? ""}`)} />
              </View>
            ))
          )}
        </View>
      ) : null}

      <View style={{ gap: 18, alignItems: "center", width: "100%" }}>
        <SegTitulo>Reparaciones con seguimiento</SegTitulo>
        {reparaciones.length === 0 ? (
          <SegVacio
            cual="taller"
            texto="No tienes reparaciones en curso. Pide un servicio con tu sesión iniciada y verás aquí cada etapa."
            boton="Ver servicios"
            destino="/servicios"
          />
        ) : (
          reparaciones.map((r, i) => (
            <View key={r.id} style={{ gap: 10, alignItems: "center", width: "100%" }}>
              {i > 0 ? <SegSeparador /> : null}
              <Text style={{ color: SEG.text, fontWeight: "900", fontSize: 15.5, textAlign: "center" }}>
                {r.service_title} · {segFecha(r.created_at)}
              </Text>
              <LineaProgreso
                etiquetas={ETAPAS_REPARACION.map((e) => ETIQUETA_REPARACION[e])}
                actual={Math.max(0, ETAPAS_REPARACION.indexOf(r.seguimiento))}
                cancelado={r.seguimiento === "cancelado"}
              />
              {r.seguimiento_nota ? (
                <View style={{ alignItems: "center", gap: 2, maxWidth: 460 }}>
                  <Text style={{ color: SEG.mutedSoft, fontSize: 11.5, fontWeight: "800" }}>
                    NOTA DEL TALLER{r.seguimiento_actualizado ? ` · ${segFecha(r.seguimiento_actualizado)}` : ""}
                  </Text>
                  <Text style={{ color: SEG.text, textAlign: "center", lineHeight: 20 }}>{r.seguimiento_nota}</Text>
                </View>
              ) : null}
              <PreguntarBoton onPress={() => router.push(`/blue-ia?reparacion=${r.id}`)} />
            </View>
          ))
        )}
      </View>
    </View>
  );
}

// ============================================================================
// «Tu perfil» (Mi cuenta): nombre, nombre de usuario, país, provincia y edad
// ----------------------------------------------------------------------------
// Se guarda en la tabla perfiles_cliente (supabase/migrations/20261022100000_perfiles_cliente.sql): cada cliente ve y edita
// SOLO su fila y el administrador las lee (Administración → Usuarios). La edad sale de la fecha de nacimiento (mínimo 14 años;
// solo se guarda la fecha). Al guardar también se actualizan los datos de la cuenta (nombre, usuario y país), que es de donde
// el Foro saca el nombre que enseña. Si la tabla aún no existe (migración sin aplicar) esta tarjeta no se enseña.
// Estilo: campos redondeados y centrados con ✓ verde cuando están bien, desplegables con flechas ⌃⌄ (el desplegable y la fecha
// son los nativos del móvil, invisibles encima del campo: se tocan igual que cualquier campo) y «Guardar perfil» / «Deshacer».
// ============================================================================

type DatosPerfil = { nombre: string; usuario: string; pais: string; provincia: string; fecha: string };
const DATOS_VACIOS: DatosPerfil = { nombre: "", usuario: "", pais: "", provincia: "", fecha: "" };
const PAIS_ESPANA = "España";
const EDAD_MINIMA = 14;
const FECHA_MINIMA = "1900-01-01";

const PAISES = [
  "España", "Andorra", "Portugal", "Francia", "Italia", "Alemania", "Reino Unido", "Irlanda", "Países Bajos", "Bélgica",
  "Luxemburgo", "Suiza", "Austria", "Polonia", "Rumanía", "Bulgaria", "Grecia", "Suecia", "Noruega", "Dinamarca", "Finlandia",
  "Ucrania", "Rusia", "Marruecos", "Argelia", "Túnez", "Senegal", "Nigeria", "Guinea Ecuatorial", "Estados Unidos", "Canadá",
  "México", "Cuba", "República Dominicana", "Puerto Rico", "Guatemala", "Honduras", "El Salvador", "Nicaragua", "Costa Rica",
  "Panamá", "Colombia", "Venezuela", "Ecuador", "Perú", "Bolivia", "Chile", "Argentina", "Uruguay", "Paraguay", "Brasil",
  "China", "Japón", "India", "Pakistán", "Filipinas", "Australia", "Otro país",
];

const PROVINCIAS_ES = [
  "Álava", "Albacete", "Alicante", "Almería", "Asturias", "Ávila", "Badajoz", "Baleares", "Barcelona", "Burgos", "Cáceres",
  "Cádiz", "Cantabria", "Castellón", "Ceuta", "Ciudad Real", "Córdoba", "A Coruña", "Cuenca", "Girona", "Granada", "Guadalajara",
  "Guipúzcoa", "Huelva", "Huesca", "Jaén", "La Rioja", "Las Palmas", "León", "Lleida", "Lugo", "Madrid", "Málaga", "Melilla",
  "Murcia", "Navarra", "Ourense", "Palencia", "Pontevedra", "Salamanca", "Santa Cruz de Tenerife", "Segovia", "Sevilla", "Soria",
  "Tarragona", "Teruel", "Toledo", "Valencia", "Valladolid", "Vizcaya", "Zamora", "Zaragoza",
];

const textoDe = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// Edad cumplida a partir de «AAAA-MM-DD» (null si la fecha no existe).
function edadDeFecha(fecha: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return null;
  const [a, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(Date.UTC(a, mes - 1, dia));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - a;
  if (hoy.getMonth() + 1 < mes || (hoy.getMonth() + 1 === mes && hoy.getDate() < dia)) edad -= 1;
  return edad;
}

// Hoy hace 14 años, en «AAAA-MM-DD» (la fecha más reciente que se puede elegir).
function fechaMaximaPerfil(): string {
  const h = new Date();
  return `${h.getFullYear() - EDAD_MINIMA}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
}

function fechaBonita(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return fecha;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).replace(/\./g, "");
}

// Lo que no vale de lo escrito (los campos vacíos no son un error: el perfil puede estar a medias).
function erroresPerfil(d: DatosPerfil): Partial<Record<keyof DatosPerfil, string>> {
  const e: Partial<Record<keyof DatosPerfil, string>> = {};
  const nombre = d.nombre.trim();
  if (nombre && (nombre.length < 2 || nombre.length > 60)) e.nombre = "El nombre debe tener entre 2 y 60 letras.";
  const usuario = d.usuario.trim();
  if (usuario && !/^[A-Za-z0-9._-]{3,24}$/.test(usuario)) {
    e.usuario = "El usuario debe tener de 3 a 24 caracteres: letras, números, punto, guion o guion bajo.";
  }
  const provincia = d.provincia.trim();
  if (provincia && (provincia.length < 2 || provincia.length > 60)) e.provincia = "La provincia debe tener entre 2 y 60 letras.";
  if (d.fecha) {
    const edad = edadDeFecha(d.fecha);
    if (edad === null || d.fecha < FECHA_MINIMA) e.fecha = "Elige una fecha de nacimiento válida.";
    else if (edad < EDAD_MINIMA) e.fecha = `Para guardar tu edad hay que tener ${EDAD_MINIMA} años o más.`;
  }
  return e;
}

// Caja redondeada de cada dato: ✓ verde a la izquierda cuando está bien, flechas ⌃⌄ a la derecha en los desplegables y,
// encima, el control nativo invisible (`encima`) para que todo el campo sea tocable.
function CajaPerfil({
  valido,
  desplegable,
  enfocado,
  error,
  encima,
  children,
}: {
  valido?: boolean;
  desplegable?: boolean;
  enfocado?: boolean;
  error?: boolean;
  encima?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 56,
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: error ? SEG.danger : enfocado ? SEG.accent : SEG.line,
        backgroundColor: "#FFFFFF",
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 10,
        gap: 4,
        position: "relative",
      }}
    >
      <View style={{ width: 22, alignItems: "center" }}>
        {valido ? <Ionicons name="checkmark" size={20} color="#2E9E5B" /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0, justifyContent: "center" }}>{children}</View>
      <View style={{ width: 22, alignItems: "center" }}>
        {desplegable ? <Ionicons name="chevron-expand" size={18} color={SEG.text} /> : null}
      </View>
      {encima}
    </View>
  );
}

const ESTILO_NATIVO_INVISIBLE = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  opacity: 0,
  cursor: "pointer",
  // 16 px: con menos, Safari (iPhone) hace zoom al abrir el selector.
  fontSize: 16,
};

const ESTILO_TEXTO_PERFIL = { textAlign: "center" as const, fontSize: 17, fontWeight: "800" as const, color: SEG.text };

function PerfilDatos({ uid }: { uid: string }) {
  const [estado, setEstado] = useState<"cargando" | "no-disponible" | "listo">("cargando");
  const [datos, setDatos] = useState<DatosPerfil>(DATOS_VACIOS);
  const [guardado, setGuardado] = useState<DatosPerfil>(DATOS_VACIOS);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [enfocado, setEnfocado] = useState<keyof DatosPerfil | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("perfiles_cliente")
          .select("nombre,usuario,pais,provincia,fecha_nacimiento")
          .eq("user_id", uid)
          .maybeSingle();
        if (!vivo) return;
        if (error && faltaEsquema(error)) {
          setEstado("no-disponible");
          return;
        }
        if (data) {
          const d: DatosPerfil = {
            nombre: textoDe(data.nombre),
            usuario: textoDe(data.usuario),
            pais: textoDe(data.pais),
            provincia: textoDe(data.provincia),
            fecha: textoDe(data.fecha_nacimiento),
          };
          setDatos(d);
          setGuardado(d);
        } else {
          // Todavía sin guardar: se rellena con lo que escribió al registrarse (queda pendiente de guardar).
          const { data: s } = await supabase.auth.getSession();
          const meta = (s.session?.user?.user_metadata ?? {}) as Record<string, unknown>;
          if (!vivo) return;
          setDatos({ ...DATOS_VACIOS, nombre: textoDe(meta.full_name), usuario: textoDe(meta.username), pais: textoDe(meta.country) });
          setGuardado(DATOS_VACIOS);
        }
        setEstado("listo");
      } catch {
        if (vivo) setEstado("listo");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [uid]);

  const errores = useMemo(() => erroresPerfil(datos), [datos]);
  const primerError = Object.values(errores)[0];
  const hayCambios = (Object.keys(DATOS_VACIOS) as (keyof DatosPerfil)[]).some((k) => datos[k].trim() !== guardado[k].trim());
  const puedeGuardar = hayCambios && !primerError && !guardando;
  const esEspana = datos.pais === PAIS_ESPANA;
  const edad = datos.fecha ? edadDeFecha(datos.fecha) : null;

  const cambiar = (campo: keyof DatosPerfil, valor: string) => {
    setAviso(null);
    setDatos((d) => {
      const nuevo = { ...d, [campo]: valor };
      // Las provincias son las de España: al cambiar de país se borra la que no corresponda.
      if (campo === "pais" && (valor === PAIS_ESPANA) !== (d.pais === PAIS_ESPANA)) nuevo.provincia = "";
      return nuevo;
    });
  };

  const guardar = async () => {
    if (!puedeGuardar) return;
    setGuardando(true);
    setAviso(null);
    const limpio: DatosPerfil = {
      nombre: datos.nombre.trim(),
      usuario: datos.usuario.trim(),
      pais: datos.pais.trim(),
      provincia: datos.provincia.trim(),
      fecha: datos.fecha,
    };
    try {
      const { error } = await supabase.from("perfiles_cliente").upsert(
        {
          user_id: uid,
          nombre: limpio.nombre || null,
          usuario: limpio.usuario || null,
          pais: limpio.pais || null,
          provincia: limpio.provincia || null,
          fecha_nacimiento: limpio.fecha || null,
        },
        { onConflict: "user_id" }
      );
      if (error) {
        const codigo = String((error as { code?: string }).code ?? "");
        setAviso({
          tipo: "error",
          texto:
            codigo === "23505"
              ? "Ese nombre de usuario ya está en uso. Prueba con otro."
              : codigo === "23514"
              ? `Revisa los datos: el usuario debe tener de 3 a 24 caracteres y hay que tener ${EDAD_MINIMA} años o más.`
              : faltaEsquema(error)
              ? "Esta función todavía no está disponible."
              : "No se ha podido guardar. Inténtalo de nuevo.",
        });
        return;
      }
      // El Foro enseña el nombre que está en los datos de la cuenta: se mantienen al día (si falla, el perfil ya está guardado).
      try {
        await supabase.auth.updateUser({
          data: {
            ...(limpio.nombre ? { full_name: limpio.nombre } : {}),
            ...(limpio.usuario ? { username: limpio.usuario } : {}),
            ...(limpio.pais ? { country: limpio.pais } : {}),
          },
        });
      } catch {
        // no pasa nada
      }
      setDatos(limpio);
      setGuardado(limpio);
      setAviso({ tipo: "ok", texto: "Perfil guardado." });
      trackEvent("perfil_guardado", "Perfil: guardado");
    } catch {
      setAviso({ tipo: "error", texto: "No se ha podido guardar. Inténtalo de nuevo." });
    } finally {
      setGuardando(false);
    }
  };

  if (estado === "no-disponible") return null;
  if (estado === "cargando") return <CargaMarca texto="Cargando tu perfil…" />;

  const web = Platform.OS === "web";
  const opcionesPais = datos.pais && !PAISES.includes(datos.pais) ? [datos.pais, ...PAISES] : PAISES;
  const opcionesProvincia = datos.provincia && !PROVINCIAS_ES.includes(datos.provincia) ? [datos.provincia, ...PROVINCIAS_ES] : PROVINCIAS_ES;
  const marcador = "rgba(11,33,56,0.40)";

  const campoTexto = (campo: "nombre" | "usuario", placeholder: string, etiqueta: string, extra?: object) => (
    <CajaPerfil valido={!!datos[campo].trim() && !errores[campo]} enfocado={enfocado === campo} error={!!errores[campo]}>
      <TextInput
        value={datos[campo]}
        onChangeText={(t) => cambiar(campo, t)}
        onFocus={() => setEnfocado(campo)}
        onBlur={() => setEnfocado((e) => (e === campo ? null : e))}
        placeholder={placeholder}
        placeholderTextColor={marcador}
        accessibilityLabel={etiqueta}
        maxLength={campo === "usuario" ? 24 : 60}
        autoCapitalize={campo === "usuario" ? "none" : "words"}
        autoCorrect={false}
        style={[ESTILO_TEXTO_PERFIL, { paddingVertical: 10, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : {}) }, extra]}
      />
    </CajaPerfil>
  );

  const campoSelector = (campo: "pais" | "provincia", placeholder: string, etiqueta: string, opciones: string[]) => (
    <CajaPerfil
      valido={!!datos[campo].trim() && !errores[campo]}
      desplegable
      enfocado={enfocado === campo}
      encima={
        web ? (
          <select
            aria-label={etiqueta}
            value={datos[campo]}
            onChange={(e) => cambiar(campo, e.target.value)}
            onFocus={() => setEnfocado(campo)}
            onBlur={() => setEnfocado((v) => (v === campo ? null : v))}
            style={ESTILO_NATIVO_INVISIBLE}
          >
            <option value="">{placeholder}</option>
            {opciones.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : null
      }
    >
      <Text numberOfLines={1} style={[ESTILO_TEXTO_PERFIL, { paddingVertical: 10, color: datos[campo] ? SEG.text : marcador }]}>
        {datos[campo] || placeholder}
      </Text>
    </CajaPerfil>
  );

  return (
    <View nativeID="perfil-datos" style={{ gap: 14, alignItems: "center" }}>
      <SegTitulo>Tu perfil</SegTitulo>

      <View style={{ width: "100%", maxWidth: 460, gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          {campoTexto("nombre", "Nombre", "Nombre")}
          {campoTexto("usuario", "Usuario", "Nombre de usuario")}
        </View>

        <View style={{ flexDirection: "row", gap: 12 }}>
          {campoSelector("pais", "País", "País", opcionesPais)}
          {esEspana ? (
            campoSelector("provincia", "Provincia", "Provincia", opcionesProvincia)
          ) : (
            <CajaPerfil valido={!!datos.provincia.trim() && !errores.provincia} enfocado={enfocado === "provincia"} error={!!errores.provincia}>
              <TextInput
                value={datos.provincia}
                onChangeText={(t) => cambiar("provincia", t)}
                onFocus={() => setEnfocado("provincia")}
                onBlur={() => setEnfocado((e) => (e === "provincia" ? null : e))}
                placeholder="Región"
                placeholderTextColor={marcador}
                accessibilityLabel="Provincia o región"
                maxLength={60}
                autoCapitalize="words"
                style={[ESTILO_TEXTO_PERFIL, { paddingVertical: 10, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : {}) }]}
              />
            </CajaPerfil>
          )}
        </View>

        <View style={{ flexDirection: "row" }}>
          <CajaPerfil
            valido={!!datos.fecha && !errores.fecha}
            desplegable
            enfocado={enfocado === "fecha"}
            error={!!errores.fecha}
            encima={
              web ? (
                <input
                  type="date"
                  aria-label="Fecha de nacimiento"
                  value={datos.fecha}
                  min={FECHA_MINIMA}
                  max={fechaMaximaPerfil()}
                  onChange={(e) => cambiar("fecha", e.target.value)}
                  onFocus={() => setEnfocado("fecha")}
                  onBlur={() => setEnfocado((v) => (v === "fecha" ? null : v))}
                  style={ESTILO_NATIVO_INVISIBLE}
                />
              ) : null
            }
          >
            <Text numberOfLines={1} style={[ESTILO_TEXTO_PERFIL, { paddingVertical: 10, color: datos.fecha ? SEG.text : marcador }]}>
              {datos.fecha ? fechaBonita(datos.fecha) : "Fecha de nacimiento"}
            </Text>
          </CajaPerfil>
        </View>

        <View style={{ flexDirection: "row" }}>
          <CajaPerfil valido={edad !== null && edad >= EDAD_MINIMA}>
            <Text accessibilityLabel="Edad" style={[ESTILO_TEXTO_PERFIL, { paddingVertical: 10, color: edad !== null ? SEG.text : marcador }]}>
              {edad !== null && edad >= 0 ? `${edad} Años` : "Edad"}
            </Text>
          </CajaPerfil>
        </View>

        {primerError ? (
          <Text style={{ color: SEG.danger, fontWeight: "800", textAlign: "center", lineHeight: 19 }}>{primerError}</Text>
        ) : aviso ? (
          <Text
            accessibilityRole="alert"
            style={{ color: aviso.tipo === "ok" ? "#2E9E5B" : SEG.danger, fontWeight: "800", textAlign: "center", lineHeight: 19 }}
          >
            {aviso.texto}
          </Text>
        ) : null}

        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <Pressable
            onPress={guardar}
            disabled={!puedeGuardar}
            accessibilityRole="button"
            accessibilityLabel="Guardar perfil"
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 56,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: SEG.accent,
              opacity: !puedeGuardar ? 0.5 : pressed ? 0.88 : 1,
            })}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 17 }}>{guardando ? "Guardando…" : "Guardar perfil"}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setDatos(guardado);
              setAviso(null);
            }}
            disabled={!hayCambios || guardando}
            accessibilityRole="button"
            accessibilityLabel="Deshacer los cambios"
            style={({ pressed }) => ({
              minHeight: 56,
              paddingHorizontal: 22,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#FFFFFF",
              borderWidth: 1.5,
              borderColor: SEG.line,
              opacity: !hayCambios || guardando ? 0.5 : pressed ? 0.88 : 1,
            })}
          >
            <Text style={{ color: SEG.text, fontWeight: "900", fontSize: 16 }}>Deshacer</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}