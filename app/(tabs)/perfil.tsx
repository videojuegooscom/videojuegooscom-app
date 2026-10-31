/**
 * Qué hace: pantalla "Mi cuenta" (pestaña Perfil). Antes de iniciar sesión
 * muestra un formulario de acceso/registro; una vez hay sesión, muestra
 * «Mi perfil» (foto, usuario, nombre, país, provincia y edad:
 * components/PerfilPublico.tsx, que también obliga a completarlo en el resto
 * de la tienda) con la cuenta dentro (subtítulo «Tu cuenta está activa», el
 * correo de la sesión en un recuadro más y, al pie, «Cerrar sesión» y, si el
 * rol es admin, «Panel de control» en la misma fila) y la pestaña «Mis
 * seguimientos»; se cambia de pestaña tocándola o deslizando el dedo. Al
 * final, el pie de página (con las redes sociales, una sola vez).
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
 *   "admin" (botón "Panel de control", al pie de «Mi perfil»).
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
  PanResponder,
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
import PerfilPublico from "../../components/PerfilPublico";
import SiteFooter from "../../components/SiteFooter";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { trackEvent } from "../../lib/analytics";
import { supabase } from "../../lib/supabase";

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

// Botón de la cuenta al pie de «Mi perfil»: redondeado y de 48 px como «Guardar perfil» / «Deshacer» (sin icono, como
// ellos, para que «Panel de control» se lea entero en media fila); el principal, azul de marca. Ocupan la fila a partes
// iguales; en móviles estrechos la letra baja un punto.
function BotonCuenta({
  titulo,
  onPress,
  principal = false,
  cargando = false,
  textoCargando,
}: {
  titulo: string;
  onPress: () => void;
  principal?: boolean;
  cargando?: boolean;
  textoCargando?: string;
}) {
  const color = principal ? "#FFFFFF" : COLORS.text;
  const estrecho = useWindowDimensions().width < 380;
  return (
    <Pressable
      onPress={onPress}
      disabled={cargando}
      accessibilityRole="button"
      accessibilityLabel={titulo}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 0,
        minHeight: 48,
        borderRadius: 999,
        paddingHorizontal: 8,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: principal ? COLORS.accent : "#FFFFFF",
        // El mismo borde en los dos (del color del fondo en el principal): así miden exactamente lo mismo.
        borderWidth: 1.5,
        borderColor: principal ? COLORS.accent : COLORS.border,
        opacity: cargando ? 0.6 : pressed ? 0.88 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      {cargando ? <ActivityIndicator size="small" color={color} /> : null}
      <Text numberOfLines={1} style={{ color, fontWeight: "900", fontSize: estrecho ? 14 : 15 }}>
        {cargando && textoCargando ? textoCargando : titulo}
      </Text>
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

  // Pestañas del perfil con sesión: "Mi cuenta" | "Mis seguimientos" (?tab=seguimientos)
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

  // Cambiar de pestaña tocándola o deslizando el dedo sobre su contenido: hacia la izquierda, «Mis seguimientos»; hacia
  // la derecha, «Mi cuenta». Abrir «Mis seguimientos» se mide (analítica propia, Administración → Usuarios).
  const [desliz] = useState(() => new Animated.Value(0));
  const perfilTabRef = useRef<PerfilTab>(perfilTab);
  useEffect(() => {
    perfilTabRef.current = perfilTab;
  }, [perfilTab]);
  const cambiarPestana = useCallback((t: PerfilTab, como: "tocar" | "deslizar") => {
    if (perfilTabRef.current !== t && t === "seguimientos") {
      trackEvent("seguimientos_abiertos", "Perfil: Mis seguimientos", { metadata: { como } });
    }
    perfilTabRef.current = t;
    setPerfilTab(t);
  }, []);
  // Al soltar: cambia con un deslizamiento largo (60 px) o con uno corto y rápido hacia el mismo lado (como en las apps del
  // móvil); si no, el contenido vuelve a su sitio.
  const soltarDedo = useCallback(
    (dx: number, vx: number) => {
      const rapido = Math.abs(dx) > 24 && Math.abs(vx) > 0.35 && Math.sign(vx) === Math.sign(dx);
      const destino: PerfilTab | null = Math.abs(dx) > 60 || rapido ? (dx < 0 ? "seguimientos" : "cuenta") : null;
      if (destino && destino !== perfilTabRef.current) {
        cambiarPestana(destino, "deslizar");
        // Entra desde el lado del gesto.
        desliz.setValue(destino === "seguimientos" ? 70 : -70);
      }
      Animated.spring(desliz, { toValue: 0, useNativeDriver: false, speed: 18, bounciness: 4 }).start();
    },
    [cambiarPestana, desliz]
  );
  // El dedo en la web: dónde tocó, sus últimas posiciones (para la distancia y la velocidad) y hacia dónde va, que se decide
  // con sus primeros 8 px. La distancia cuenta desde que toca (PanResponder la pone a 0 al reconocer el gesto y un
  // deslizamiento corto se quedaba sin llegar). En horizontal, la página no se mueve arriba o abajo mientras se desliza
  // (aunque el pulgar vaya en diagonal); en vertical, se desplaza como siempre y no cambia de pestaña.
  const zonaDeslizable = useRef<View>(null);
  const dedo = useRef<{ x0: number; y0: number; eje: "h" | "v" | null; muestras: { x: number; t: number }[]; reconocido: boolean }>({
    x0: 0,
    y0: 0,
    eje: null,
    muestras: [],
    reconocido: false,
  });
  const recorrido = useCallback(() => {
    const d = dedo.current;
    const ultima = d.muestras[d.muestras.length - 1];
    if (!ultima || d.muestras.length < 2) return null;
    // Velocidad de los últimos 100 ms (px/ms).
    const antes = d.muestras.find((m) => ultima.t - m.t <= 100) ?? ultima;
    return { dx: ultima.x - d.x0, vx: ultima.t > antes.t ? (ultima.x - antes.x) / (ultima.t - antes.t) : 0 };
  }, []);
  useEffect(() => {
    const zona = zonaDeslizable.current as unknown as HTMLElement | null;
    if (Platform.OS !== "web" || !isLogged || !zona?.addEventListener) return;
    const inicio = (e: TouchEvent) => {
      const t = e.touches[0];
      // Con dos dedos (acercar la página) no es un cambio de pestaña.
      dedo.current = {
        x0: t?.clientX ?? 0,
        y0: t?.clientY ?? 0,
        eje: e.touches.length === 1 ? null : "v",
        muestras: t ? [{ x: t.clientX, t: e.timeStamp }] : [],
        reconocido: false,
      };
    };
    const mover = (e: TouchEvent) => {
      const d = dedo.current;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      d.muestras.push({ x: t.clientX, t: e.timeStamp });
      if (d.muestras.length > 8) d.muestras.shift();
      const dx = t.clientX - d.x0;
      const dy = t.clientY - d.y0;
      if (d.eje === null && Math.hypot(dx, dy) >= 8) d.eje = Math.abs(dx) > Math.abs(dy) * 1.2 ? "h" : "v";
      if (d.eje === "h" && e.cancelable) e.preventDefault();
    };
    // Horizontal pero tan rápido que no llegó a reconocerse (casi sin movimientos entre tocar y soltar): se decide aquí.
    const fin = () => {
      const r = recorrido();
      if (dedo.current.eje === "h" && !dedo.current.reconocido && r) soltarDedo(r.dx, r.vx);
    };
    zona.addEventListener("touchstart", inicio, { passive: true });
    zona.addEventListener("touchmove", mover, { passive: false });
    zona.addEventListener("touchend", fin);
    return () => {
      zona.removeEventListener("touchstart", inicio);
      zona.removeEventListener("touchmove", mover);
      zona.removeEventListener("touchend", fin);
    };
  }, [isLogged, recorrido, soltarDedo]);
  const gestoPestanas = useMemo(
    () =>
      PanResponder.create({
        // Solo un gesto horizontal: el desplazamiento vertical de la página sigue igual. En la web, en cuanto el dedo
        // se ha movido 8 px más en horizontal que en vertical (lo mismo que decide `dedo`).
        onMoveShouldSetPanResponder: (_e, g) => {
          if (!isLogged) return false;
          if (Platform.OS !== "web") return Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 2;
          const eje = dedo.current.eje ?? (Math.hypot(g.dx, g.dy) >= 8 ? (Math.abs(g.dx) > Math.abs(g.dy) * 1.2 ? "h" : "v") : null);
          return eje === "h";
        },
        onPanResponderGrant: () => {
          dedo.current.reconocido = true;
        },
        // Empezado el gesto, el desplazamiento de la página no se lo quita (si no, en diagonal se quedaba a medias).
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e, g) => {
          // El contenido acompaña un poco al dedo (con resistencia) para que se note que se puede deslizar.
          const dx = recorrido()?.dx ?? g.dx;
          const haciaSeguimientos = dx < 0;
          const posible = haciaSeguimientos ? perfilTabRef.current === "cuenta" : perfilTabRef.current === "seguimientos";
          desliz.setValue(Math.max(-90, Math.min(90, dx * (posible ? 0.35 : 0.12))));
        },
        onPanResponderRelease: (_e, g) => {
          const r = recorrido() ?? { dx: g.dx, vx: g.vx };
          soltarDedo(r.dx, r.vx);
        },
        onPanResponderTerminate: () => {
          Animated.spring(desliz, { toValue: 0, useNativeDriver: false }).start();
        },
      }),
    [isLogged, desliz, recorrido, soltarDedo]
  );
  // ¿Se enseña «Mi perfil»? (null mientras carga; false si la tabla aún no existe: entonces la cuenta sale en su tarjeta).
  const [perfilDisponible, setPerfilDisponible] = useState<boolean | null>(null);

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

  // Botones de la cuenta, al final de «Mi perfil» (abierta o plegada): «Cerrar sesión» y, al administrador, «Panel de
  // control» a su derecha (al alcance del pulgar), con el aviso del panel justo encima. «Tu cuenta está activa» es el
  // subtítulo de «Mi perfil» y el correo de la sesión va en su recuadro, con los datos (components/PerfilPublico.tsx).
  const accionesCuenta = (
    <View nativeID="perfil-cuenta" style={{ gap: 8, alignItems: "center" }}>
      {sessionRole === "admin" ? (
        <Text style={{ color: COLORS.muted, fontSize: 12.5, fontWeight: "700", lineHeight: 17, textAlign: "center" }}>
          Esta cuenta tiene acceso al panel de administración.
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: 10, alignSelf: "stretch" }}>
        <BotonCuenta titulo="Cerrar sesión" onPress={signOut} cargando={isSigningOut} textoCargando="Cerrando…" />
        {sessionRole === "admin" ? <BotonCuenta titulo="Panel de control" principal onPress={openAdminPanel} /> : null}
      </View>
    </View>
  );

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
              {/* Las pestañas van pegadas a su contenido (no cuentan como apartado). Con sesión, deslizar el dedo a la
                  izquierda o a la derecha sobre esta zona cambia de pestaña (gestoPestanas). */}
              <Animated.View
                ref={zonaDeslizable}
                nativeID="perfil-deslizable"
                {...gestoPestanas.panHandlers}
                style={{ gap: 18, transform: [{ translateX: desliz }] }}
              >
              {isLogged ? <PerfilTabs value={perfilTab} onChange={(t) => cambiarPestana(t, "tocar")} /> : null}

              {showSeguimientos ? (
                <SectionCard padding={cardPadding}>
                  <SeguimientosSeccion />
                </SectionCard>
              ) : (
              <>
              {/* «Mi perfil» (foto, usuario, nombre, país, provincia y edad) con la cuenta dentro, debajo de los datos. Si la
                  tabla perfiles_cliente aún no está creada (migración sin aplicar), se oculta y la cuenta sale en su tarjeta. */}
              {isLogged && sessionUserId ? (
                <SectionCard padding={cardPadding}>
                  {perfilDisponible ? (
                    <>
                      {msg ? <InfoMessage text={msg} tone="error" /> : null}
                      {okMsg ? <InfoMessage text={okMsg} tone="success" /> : null}
                    </>
                  ) : null}
                  <PerfilPublico uid={sessionUserId} correo={sessionEmail} cuenta={accionesCuenta} onDisponible={setPerfilDisponible} />
                </SectionCard>
              ) : null}
              {!isLogged || !sessionUserId || perfilDisponible === false ? (
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
                    </View>

                    {accionesCuenta}
                  </View>
                )}
              </SectionCard>
              ) : null}
              </>
              )}
              </Animated.View>

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
// Pestañas del perfil y sección "Mis seguimientos" (pedidos + reparaciones)
// ----------------------------------------------------------------------------
// Lee "pedidos" + "pedido_items" (user_id = cliente): si la tabla aún no existe
// (migración pendiente) esa parte se oculta sin error. Lee "service_requests"
// (customer_user_id = cliente): si faltan las columnas de seguimiento, usa solo
// lo que exista. "Preguntar por esto" abre Blue IA con ?pedido= o ?reparacion=.
// El panel admin (app/admin/services.tsx) cambia la etapa de cada reparación.
// Números de seguimiento (migración 20261031170000): cada pedido y cada
// reparación tiene el suyo («VZ-XXXX-XXXX»). Si la tienda se lo da al cliente
// (p. ej. una ficha creada en VeoAura, api/escaparate-veoaura.ts), el cliente lo
// escribe aquí y vincular_seguimiento lo pasa a su cuenta. Sin la migración no
// sale el campo.
// ============================================================================

const SEG = {
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  mutedSoft: "rgba(11,33,56,0.45)",
  line: "#E3EAF2",
  accent: "#1EA7E8",
  accentDark: "#1EA7E8",
  danger: "#DC2626",
  ok: "#15803D",
};

// Selector de pestañas centrado con subrayado azul en la activa.
function PerfilTabs({ value, onChange }: { value: PerfilTab; onChange: (t: PerfilTab) => void }) {
  const tabs: { key: PerfilTab; label: string }[] = [
    { key: "cuenta", label: "Mi cuenta" },
    { key: "seguimientos", label: "Mis seguimientos" },
  ];
  return (
    // nativeID: la guía de Blue (components/Campanita.tsx) enmarca estas pestañas.
    <View nativeID="perfil-pestanas" role="tablist" style={{ flexDirection: "row", justifyContent: "center", gap: 28, paddingTop: 4 }}>
      {tabs.map((t) => {
        const active = value === t.key;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            role="tab"
            aria-selected={active}
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
  codigo_seguimiento?: string | null;
};

type ReparacionSeg = {
  id: string;
  created_at: string;
  service_title: string;
  seguimiento: EtapaReparacion;
  seguimiento_nota: string | null;
  seguimiento_actualizado: string | null;
  codigo_seguimiento?: string | null;
};

// Número de seguimiento que da la tienda (p. ej. al crear en VeoAura la ficha de una reparación o de un pedido): al
// escribirlo, ese pedido o esa reparación pasan a esta cuenta (función vincular_seguimiento, migración 20261031170000).
const MOTIVOS_SEGUIMIENTO: Record<string, string> = {
  formato: "Ese número no tiene el formato de la tienda: «VZ-» y 8 letras o números (por ejemplo, VZ-7K3M-9QPD).",
  no_existe: "No encontramos ese número. Revisa que esté bien escrito.",
  otra_cuenta: "Ese número ya está añadido a otra cuenta. Si es tuyo, escríbenos desde Blue IA.",
  demasiados_intentos: "Has hecho muchos intentos seguidos. Vuelve a probar dentro de una hora.",
  sin_sesion: "Inicia sesión para añadirlo.",
};

function AnadirNumeroSeguimiento({ onAnadido }: { onAnadido: () => void }) {
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const puede = codigo.replace(/[^A-Z0-9]/g, "").length >= 10 && !enviando;

  async function anadir() {
    if (!puede) return;
    setEnviando(true);
    setAviso(null);
    try {
      const { data, error } = await supabase.rpc("vincular_seguimiento", { p_codigo: codigo });
      if (error) throw error;
      const r = (data ?? {}) as { ok?: boolean; motivo?: string; tipo?: "pedido" | "reparacion"; titulo?: string; numero?: number };
      if (r.ok && r.tipo) {
        trackEvent("seguimiento_numero_anadido", "Perfil: número de seguimiento añadido", { metadata: { tipo: r.tipo } });
        setCodigo("");
        setAviso({
          ok: true,
          texto:
            r.tipo === "pedido"
              ? `Listo: el pedido nº ${r.numero ?? ""} ya está en «Mis pedidos».`
              : `Listo: «${r.titulo ?? "tu reparación"}» ya está en «Reparaciones y Mantenimientos».`,
        });
        onAnadido();
      } else {
        trackEvent("seguimiento_numero_fallido", "Perfil: número de seguimiento no válido", { metadata: { motivo: r.motivo ?? "desconocido" } });
        setAviso({ ok: false, texto: MOTIVOS_SEGUIMIENTO[r.motivo ?? ""] ?? "No se ha podido añadir. Inténtalo de nuevo." });
      }
    } catch (e) {
      console.error("Error añadiendo el número de seguimiento:", e);
      setAviso({ ok: false, texto: "No se ha podido añadir. Inténtalo de nuevo." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <View style={{ width: "100%", maxWidth: 460, gap: 8, alignItems: "center" }}>
      <Text style={{ color: SEG.muted, fontSize: 13.5, textAlign: "center" }}>¿Te hemos dado un número de seguimiento? Escríbelo aquí.</Text>
      <View style={{ flexDirection: "row", gap: 8, width: "100%" }}>
        <TextInput
          value={codigo}
          onChangeText={(t) => {
            setCodigo(t.toUpperCase().slice(0, 16));
            setAviso(null);
          }}
          onSubmitEditing={anadir}
          placeholder="VZ-XXXX-XXXX"
          placeholderTextColor={SEG.mutedSoft}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel="Número de seguimiento"
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 48,
            borderWidth: 1,
            borderColor: SEG.line,
            borderRadius: 14,
            paddingHorizontal: 14,
            fontSize: 16,
            fontWeight: "800",
            letterSpacing: 1,
            color: SEG.text,
            textAlign: "center",
            backgroundColor: "#FFFFFF",
          }}
        />
        <Pressable
          onPress={anadir}
          disabled={!puede}
          accessibilityRole="button"
          accessibilityLabel="Añadir el número de seguimiento"
          style={({ pressed }) => ({
            minHeight: 48,
            paddingHorizontal: 18,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: SEG.accentDark,
            opacity: !puede ? 0.45 : pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>{enviando ? "Añadiendo…" : "Añadir"}</Text>
        </Pressable>
      </View>
      {aviso ? (
        <Text accessibilityRole="alert" style={{ color: aviso.ok ? SEG.ok : SEG.danger, fontWeight: "800", textAlign: "center", lineHeight: 19 }}>
          {aviso.texto}
        </Text>
      ) : null}
    </View>
  );
}

// El número de seguimiento de cada pedido o reparación (para dárselo a la tienda si pregunta por él).
function NumeroSeguimiento({ codigo }: { codigo?: string | null }) {
  if (!codigo) return null;
  return <Text style={{ color: SEG.mutedSoft, fontSize: 12, fontWeight: "800", letterSpacing: 0.5 }}>Nº de seguimiento {codigo}</Text>;
}

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
  // ¿Existen ya los números de seguimiento? (migración 20261031170000). Sin ellos no se ofrece añadir uno.
  const [numerosOk, setNumerosOk] = useState(false);

  // silencioso: al añadir un número se recarga sin volver a la pantalla de carga (el aviso de «Listo» sigue a la vista).
  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
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

      // Pedidos (la tabla puede no existir aún; el número de seguimiento, tampoco)
      const pedidosCon = (columnas: string) =>
        supabase.from("pedidos").select(columnas).eq("user_id", uid).order("created_at", { ascending: false }).limit(50);
      let pedRes: { data: any[] | null; error: any } = await pedidosCon("id,numero,created_at,estado,entrega,total_eur,codigo_seguimiento");
      let numeros = !pedRes.error;
      if (pedRes.error && faltaEsquema(pedRes.error)) {
        pedRes = await pedidosCon("id,numero,created_at,estado,entrega,total_eur");
        numeros = false;
      }

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

      // Reparaciones (las columnas de seguimiento y el número pueden no existir aún)
      const reparacionesCon = (columnas: string) =>
        supabase.from("service_requests").select(columnas).eq("customer_user_id", uid).order("created_at", { ascending: false }).limit(50);
      let repRes: { data: any[] | null; error: any } = await reparacionesCon(
        "id,created_at,service_title,status,seguimiento,seguimiento_nota,seguimiento_actualizado,codigo_seguimiento"
      );
      if (repRes.error && faltaEsquema(repRes.error)) {
        numeros = false;
        repRes = await reparacionesCon("id,created_at,service_title,status,seguimiento,seguimiento_nota,seguimiento_actualizado");
      }
      if (repRes.error && faltaEsquema(repRes.error)) {
        repRes = await reparacionesCon("id,created_at,service_title,status");
      }
      if (repRes.error) numeros = false;
      setNumerosOk(numeros);

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
            codigo_seguimiento: r.codigo_seguimiento ?? null,
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
          {numerosOk ? <AnadirNumeroSeguimiento onAnadido={() => cargar(true)} /> : null}
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
                <NumeroSeguimiento codigo={p.codigo_seguimiento} />
                {p.items.length ? (
                  <Text style={{ color: SEG.muted, textAlign: "center", lineHeight: 19, maxWidth: 460 }}>
                    {p.items.join(" · ")}
                  </Text>
                ) : null}
                {p.entrega ? (
                  <Text style={{ color: SEG.mutedSoft, fontSize: 12.5, textAlign: "center" }}>
                    {p.entrega === "recogida" ? "Entrega en mano" : "Envío a domicilio"}
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
        <SegTitulo>Reparaciones y Mantenimientos</SegTitulo>
        {numerosOk ? <AnadirNumeroSeguimiento onAnadido={() => cargar(true)} /> : null}
        {reparaciones.length === 0 ? (
          <SegVacio
            cual="taller"
            texto="No tienes ninguna Reparación o Mantenimiento en curso. Solicita un servicio con tu sesión iniciada y verás aquí el estado actual."
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
              <NumeroSeguimiento codigo={r.codigo_seguimiento} />
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
