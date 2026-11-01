/**
 * components/ReviewModal.tsx
 *
 * Qué hace: el "pop" a pantalla completa que se abre al pulsar "Dejar una
 * reseña" en components/Resenas.tsx. Deja elegir una valoración de 1 a 5
 * estrellas (empieza con las 5 marcadas; tocar cualquier estrella salta
 * directamente a esa valoración, y tocar la última estrella rellena la
 * quita a ella sola, bajando la valoración en uno), escribir un comentario
 * opcional y publicarla. Si nadie ha iniciado sesión, en vez del formulario
 * muestra un aviso pidiendo iniciar sesión (igual que hace el Chat Global),
 * porque hace falta saber quién es la persona para poder firmar la reseña.
 *
 * Cómo funciona:
 * - Sigue el mismo patrón "premium" de components/VenderAhoraModal.tsx:
 *   Modal transparente + fondo oscuro semitransparente + tarjeta centrada
 *   con animación de entrada (fundido + muelle de escala), y los botones
 *   usan AnimatedPressable para el "pop" al tocar/soltar. Cada estrella,
 *   además, da un saltito hacia arriba (ReviewStar) cada vez que se enciende
 *   o se apaga, tanto al subir como al bajar la valoración.
 * - Al abrirse comprueba la sesión (supabase.auth.getSession()): sin sesión
 *   → aviso "Inicia sesión"; con sesión → formulario, con la valoración en
 *   5 estrellas por defecto.
 * - Publicar hace un INSERT en "store_reviews" (ver sql/store_reviews.sql)
 *   mandando solo rating + comment: quién firma la reseña (nombre, usuario)
 *   lo rellena SIEMPRE un trigger en la base de datos a partir de la sesión
 *   real, nunca lo que mande este archivo — así nadie puede publicar una
 *   reseña haciéndose pasar por otra persona.
 * - Tras publicar, avisa al padre (onPublished) con la fila ya guardada
 *   (con su fecha real) para que Resenas.tsx la añada arriba de la lista al
 *   momento, sin tener que volver a pedir todas las reseñas a Supabase.
 * - Ideas para no quedarse en blanco (SUGERENCIAS_RESENA, 10): cada una es un
 *   botón corto («Atención de 10») que añade al comentario una frase completa;
 *   tocarla otra vez la quita. Las que ya no caben (600 caracteres) se apagan.
 * - El recuadro del comentario crece con lo escrito (sin barra de desplazamiento
 *   dentro) hasta los 600 caracteres: en la web se mide su contenido después de
 *   cada cambio (y también encoge al borrar).
 * - Emojis: según lo escrito (palabras clave, en el propio móvil: nada se manda
 *   a ninguna IA) se proponen hasta 4 emojis relacionados (rápido → 🚀, trato →
 *   🤝, reparación → 🔧…); tocar uno lo añade al final.
 * - Al publicar se apunta en la analítica propia («resena_publicada») cuántas
 *   estrellas, qué ideas se usaron y cuántos emojis propuestos se quedaron;
 *   Administración → Usuarios lo cuenta (30 días).
 *
 * Conectado con:
 * - lib/supabase.ts → sesión actual + INSERT en "store_reviews".
 * - components/Resenas.tsx → abre este modal y recibe la reseña publicada.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Href } from "expo-router";
import { router } from "expo-router";
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { trackEvent } from "../lib/analytics";

const COLORS = {
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  cardSoft: "#F8FBFE",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.62)",
  accent: "#1EA7E8",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  gold: "#F0B429",
  goldSoft: "rgba(11,33,56,0.18)",
  success: "#15803D",
  successBg: "#DCFCE7",
  successBorder: "#86EFAC",
  danger: "#B91C1C",
  dangerBg: "#FDECEC",
  dangerBorder: "#F5B5B5",
  warnBg: "#FFF7E6",
  warnBorder: "#F6DBA0",
};

const COMMENT_MAX = 600;
// Alto del recuadro del comentario vacío (cabe el texto de ejemplo entero); con más texto crece, sin barra de
// desplazamiento dentro.
const ALTO_MIN_COMENTARIO = 112;

// Ideas para la reseña: el botón dice lo corto y al tocarlo se añade la frase. Solo cosas que la tienda hace de verdad
// (envíos, entrega en mano, reparaciones). Administración → Usuarios cuenta cuáles se usan (por su id).
export const SUGERENCIAS_RESENA = [
  { id: "atencion", etiqueta: "Atención de 10", texto: "La atención fue de 10: amables y rápidos en responder." },
  { id: "descripcion", etiqueta: "Como se describía", texto: "El producto llegó tal y como se describía." },
  { id: "envio", etiqueta: "Envío rápido", texto: "El envío fue rapidísimo y llegó muy bien embalado." },
  { id: "entrega", etiqueta: "Entrega puntual", texto: "La entrega en mano fue puntual y sin complicaciones." },
  { id: "precio", etiqueta: "Buen precio", texto: "Muy buena relación calidad-precio." },
  { id: "funciona", etiqueta: "Funciona perfecto", texto: "Todo funciona perfecto, como nuevo." },
  { id: "dudas", etiqueta: "Dudas resueltas", texto: "Me resolvieron todas las dudas antes de comprar." },
  { id: "reparacion", etiqueta: "Gran reparación", texto: "La reparación quedó perfecta y me lo explicaron todo." },
  { id: "segura", etiqueta: "Compra segura", texto: "Compra fácil y con total confianza." },
  { id: "repetire", etiqueta: "Repetiré", texto: "Sin duda repetiré y lo recomiendo." },
] as const;

// Emojis según lo escrito (palabras clave, sin tildes ni mayúsculas). Se proponen en el orden en que aparece cada tema.
const EMOJIS_POR_TEMA: { patron: RegExp; emojis: string[] }[] = [
  { patron: /encant|feliz|content|ilusion|me gusta|enamor/, emojis: ["😍", "🥰"] },
  { patron: /rapid|veloz|enseguida|pronto|mismo dia|en nada/, emojis: ["🚀", "⚡"] },
  { patron: /envio|paquete|embalad|llego|recibi|entrega|mensajer/, emojis: ["📦", "🚚"] },
  { patron: /atencion|amable|trato|cercan|simpatic|majo|atent|ayud|duda/, emojis: ["🤝", "😊"] },
  { patron: /precio|barat|economic|oferta|ahorr/, emojis: ["💰", "👌"] },
  { patron: /perfect|impecable|como nuev|calidad|excelente|genial|brutal|increible/, emojis: ["✨", "💯"] },
  { patron: /consola|juego|mando|ps5|ps4|playstation|xbox|switch|nintendo|gaming/, emojis: ["🎮", "🕹️"] },
  { patron: /repar|arregl|limpi|taller|mantenimiento/, emojis: ["🔧", "🛠️"] },
  { patron: /recomiend|repetir|repetire|volvere|sin duda/, emojis: ["👍", "🙌"] },
  { patron: /gracias|agradec/, emojis: ["🙏", "❤️"] },
  { patron: /segur|confian|fiable|tranquil/, emojis: ["✅", "🔒"] },
  { patron: /\bmal\b|lento|tarde|roto|decepcion|problema/, emojis: ["😕"] },
];
const MAX_EMOJIS = 4;

/** Hasta 4 emojis relacionados con lo escrito (sin los que ya lleva); sin tema reconocible, según las estrellas. */
export function emojisParaResena(comentario: string, estrellas: number): string[] {
  const texto = comentario.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (texto.trim().length < 3) return [];
  const temas = EMOJIS_POR_TEMA.map((t) => ({ ...t, donde: texto.search(t.patron) }))
    .filter((t) => t.donde >= 0)
    .sort((a, b) => a.donde - b.donde);
  // Primero el emoji principal de cada tema (en el orden en que se ha escrito) y luego los segundos.
  const lista = [...temas.map((t) => t.emojis[0]), ...temas.flatMap((t) => t.emojis.slice(1))];
  if (!lista.length) lista.push(...(estrellas >= 4 ? ["⭐", "😊", "👍"] : estrellas === 3 ? ["🙂"] : ["😕"]));
  return Array.from(new Set(lista)).filter((e) => !comentario.includes(e)).slice(0, MAX_EMOJIS);
}

export type PublishedReview = {
  id: string;
  created_at: string;
  user_id: string;
  display_name: string;
  rating: number;
  comment: string;
};

type Phase = "checking" | "auth-required" | "form" | "success";

function softShadow() {
  return Platform.select<any>({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.28,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
    },
    android: { elevation: 6 },
    default: {},
  });
}

function pushRoute(route: Href) {
  router.push(route);
}

// Mismo envoltorio "pop" (Animated.spring al pulsar/soltar) que ya usa
// VenderAhoraModal, para que todos los botones/estrellas se sientan igual
// en toda la app.
function AnimatedPressable({
  onPress,
  disabled,
  containerStyle,
  style,
  children,
}: {
  onPress?: () => void;
  disabled?: boolean;
  containerStyle?: any;
  style?: any | ((state: { pressed: boolean }) => any);
  children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);

  function onPressIn() {
    setPressed(true);
    Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 50, bounciness: 6 }).start();
  }

  function onPressOut() {
    setPressed(false);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  }

  const resolvedStyle = typeof style === "function" ? style({ pressed }) : style;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={containerStyle}
    >
      <Animated.View style={[resolvedStyle, { transform: [{ scale }] }]}>
        {typeof children === "function" ? children({ pressed }) : children}
      </Animated.View>
    </Pressable>
  );
}

// Una estrella individual del selector: además del "pop" de escala que ya
// trae AnimatedPressable al tocar/soltar, da un pequeño saltito hacia arriba
// (translateY con muelle) cada vez que ESA estrella pasa de vacía a rellena
// o de rellena a vacía — tanto al subir como al bajar la valoración, aunque
// el toque haya sido en otra estrella (p. ej. al pasar de 5 a 2 de golpe,
// las estrellas 3, 4 y 5 también dan su saltito al vaciarse).
function ReviewStar({ n, filled, onPress }: { n: number; filled: boolean; onPress: () => void }) {
  const hop = useRef(new Animated.Value(0)).current;
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      // No saltar en el primer render (las 5 estrellas se marcan de golpe
      // al abrir el modal); solo cuando el usuario cambia la valoración.
      mounted.current = true;
      return;
    }
    hop.setValue(0);
    Animated.sequence([
      Animated.timing(hop, {
        toValue: -8,
        duration: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(hop, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 10 }),
    ]).start();
  }, [filled, hop]);

  return (
    <AnimatedPressable onPress={onPress}>
      <Animated.View style={{ transform: [{ translateY: hop }] }}>
        <Ionicons
          name={filled ? "star" : "star-outline"}
          size={36}
          color={filled ? COLORS.gold : COLORS.goldSoft}
        />
      </Animated.View>
    </AnimatedPressable>
  );
}

function StarPicker({ rating, onChange }: { rating: number; onChange: (n: number) => void }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "center", gap: 8 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= rating;
        return (
          <ReviewStar
            key={n}
            n={n}
            filled={filled}
            // Tocar una estrella ya rellena que es justo el límite actual
            // (la última encendida) la apaga a ella sola, bajando la
            // valoración en uno — así "quitar una estrella" es tocar
            // exactamente la estrella que se quiere quitar, no la de al
            // lado. Tocar cualquier otra estrella salta directamente a esa
            // valoración, como hasta ahora.
            onPress={() => onChange(n === rating ? Math.max(1, n - 1) : n)}
          />
        );
      })}
    </View>
  );
}

export default function ReviewModal({
  visible,
  onClose,
  onPublished,
}: {
  visible: boolean;
  onClose: () => void;
  onPublished: (review: PublishedReview) => void;
}) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);
  // El recuadro del comentario crece con lo escrito (ver el efecto de abajo).
  const campoRef = useRef<TextInput>(null);
  const [altoCampo, setAltoCampo] = useState(ALTO_MIN_COMENTARIO);
  // Emojis propuestos que se han añadido (para contar al publicar los que se quedan).
  const [emojisAnadidos, setEmojisAnadidos] = useState<string[]>([]);
  const emojis = useMemo(() => emojisParaResena(comment, rating), [comment, rating]);

  // Web: después de cada cambio se mide lo que ocupa el texto (con el alto a 0 un momento, para que también encoja al
  // borrar) y el recuadro toma ese alto: nunca hay que desplazarse dentro de él.
  useLayoutEffect(() => {
    if (Platform.OS !== "web" || phase !== "form") return;
    const el = campoRef.current as unknown as HTMLTextAreaElement | null;
    if (!el?.style || typeof el.scrollHeight !== "number") return;
    const antes = el.style.height;
    el.style.height = "0px";
    const alto = Math.max(ALTO_MIN_COMENTARIO, Math.ceil(el.scrollHeight) + 2);
    el.style.height = antes;
    setAltoCampo((a) => (a === alto ? a : alto));
  }, [comment, phase]);

  // Añade (o quita, si ya está) la frase de una idea; si no cabe, no hace nada (el botón sale apagado).
  function alternarSugerencia(texto: string) {
    setComment((c) => {
      if (c.includes(texto)) return c.replace(texto, "").replace(/ {2,}/g, " ").trim();
      const nuevo = c.trim() ? `${c.trim()} ${texto}` : texto;
      return nuevo.length > COMMENT_MAX ? c : nuevo;
    });
  }

  function anadirEmoji(emoji: string) {
    const nuevo = `${comment.trimEnd()} ${emoji}`;
    if (nuevo.length > COMMENT_MAX) return;
    setComment(nuevo);
    setEmojisAnadidos((l) => [...l, emoji]);
  }

  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    let alive = true;

    scaleAnim.setValue(0.9);
    fadeAnim.setValue(0);
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    setPhase("checking");
    setRating(5);
    setComment("");
    setEmojisAnadidos([]);
    setAltoCampo(ALTO_MIN_COMENTARIO);
    setErrorMsg(null);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!alive) return;

      if (!session?.user) {
        setPhase("auth-required");
        return;
      }

      const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
      const fullName = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
      const username = typeof meta.username === "string" ? meta.username.trim() : "";
      const emailPrefix = (session.user.email ?? "").split("@")[0] ?? "";
      setPreviewName(fullName || username || emailPrefix || "tu cuenta");
      setPhase("form");
    });

    return () => {
      alive = false;
    };
  }, [visible, scaleAnim, fadeAnim]);

  async function handlePublish() {
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase
        .from("store_reviews")
        .insert({ rating, comment: comment.trim() })
        .select("id,created_at,user_id,display_name,rating,comment")
        .single();

      if (error) throw error;

      // Analítica propia (Administración → Usuarios): estrellas, ideas usadas y emojis propuestos que se quedaron.
      const final = comment.trim();
      void trackEvent("resena_publicada", "Reseña publicada", {
        metadata: {
          estrellas: rating,
          sugerencias: SUGERENCIAS_RESENA.filter((s) => final.includes(s.texto)).map((s) => s.id),
          emojis: Array.from(new Set(emojisAnadidos)).filter((e) => final.includes(e)).length,
        },
      });
      onPublished(data as PublishedReview);
      setPhase("success");
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.toLowerCase().includes("iniciar sesión")) {
        setPhase("auth-required");
      } else {
        setErrorMsg("No se pudo publicar la reseña. Inténtalo de nuevo en unos segundos.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    if (submitting) return;
    onClose();
  }

  const remaining = COMMENT_MAX - comment.length;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.60)",
          padding: 16,
          justifyContent: "center",
        }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            style={{
              width: "100%",
              maxWidth: 460,
              alignSelf: "center",
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            }}
          >
            <View
              style={{
                borderRadius: 24,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.bg2,
                padding: 20,
                gap: 14,
                ...softShadow(),
              }}
            >
              <AnimatedPressable
                onPress={handleClose}
                containerStyle={{
                  position: "absolute",
                  top: 14,
                  right: 14,
                  zIndex: 2,
                  width: 32,
                  height: 32,
                }}
                style={({ pressed }: { pressed: boolean }) => ({
                  flex: 1,
                  opacity: pressed ? 0.8 : 1,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: COLORS.card,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                })}
              >
                <Ionicons name="close" size={18} color={COLORS.text} />
              </AnimatedPressable>

              {phase === "checking" ? (
                <View style={{ alignItems: "center", paddingVertical: 30, gap: 10 }}>
                  <Text style={{ color: COLORS.muted }}>Comprobando tu sesión…</Text>
                </View>
              ) : phase === "auth-required" ? (
                <View style={{ alignItems: "center", paddingTop: 6, gap: 12 }}>
                  <View
                    style={{
                      alignSelf: "center",
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: COLORS.warnBorder,
                      backgroundColor: COLORS.warnBg,
                    }}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                      ACCESO NECESARIO
                    </Text>
                  </View>

                  <Text
                    style={{
                      color: COLORS.text,
                      fontSize: 20,
                      fontWeight: "900",
                      textAlign: "center",
                    }}
                  >
                    Inicia sesión para dejar una reseña
                  </Text>

                  <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 21 }}>
                    Así podemos firmarla a tu nombre y evitar reseñas falsas. Puedes iniciar sesión
                    o crear tu cuenta en un momento.
                  </Text>

                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 4 }}
                  >
                    <AnimatedPressable
                      onPress={() => {
                        handleClose();
                        pushRoute("/perfil" as Href);
                      }}
                      style={({ pressed }: { pressed: boolean }) => ({
                        opacity: pressed ? 0.9 : 1,
                        borderRadius: 999,
                        paddingVertical: 12,
                        paddingHorizontal: 20,
                        backgroundColor: COLORS.accent,
                      })}
                    >
                      <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Iniciar sesión</Text>
                    </AnimatedPressable>

                    <AnimatedPressable
                      onPress={handleClose}
                      style={({ pressed }: { pressed: boolean }) => ({
                        opacity: pressed ? 0.9 : 1,
                        borderRadius: 999,
                        paddingVertical: 12,
                        paddingHorizontal: 20,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        backgroundColor: COLORS.card,
                      })}
                    >
                      <Text style={{ color: COLORS.text, fontWeight: "900" }}>Ahora no</Text>
                    </AnimatedPressable>
                  </View>
                </View>
              ) : phase === "success" ? (
                <View style={{ alignItems: "center", gap: 12, paddingVertical: 10 }}>
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: COLORS.successBg,
                      borderWidth: 1,
                      borderColor: COLORS.successBorder,
                    }}
                  >
                    <Ionicons name="checkmark" size={28} color={COLORS.success} />
                  </View>

                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18, textAlign: "center" }}>
                    ¡Gracias por tu reseña!
                  </Text>

                  <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 20 }}>
                    Ya está publicada y visible!
                  </Text>

                  <AnimatedPressable
                    onPress={handleClose}
                    containerStyle={{ marginTop: 4 }}
                    style={({ pressed }: { pressed: boolean }) => ({
                      opacity: pressed ? 0.9 : 1,
                      borderRadius: 999,
                      paddingVertical: 12,
                      paddingHorizontal: 20,
                      backgroundColor: COLORS.accent,
                    })}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Cerrar</Text>
                  </AnimatedPressable>
                </View>
              ) : (
                <View style={{ gap: 14, paddingTop: 6 }}>
                  <View style={{ alignItems: "center", paddingHorizontal: 30, gap: 4 }}>
                    <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "900", textAlign: "center" }}>
                      Cuéntanos tu experiencia
                    </Text>
                    {previewName ? (
                      <Text style={{ color: COLORS.muted2, fontSize: 12, textAlign: "center" }}>
                        Se publicará como {previewName}
                      </Text>
                    ) : null}
                  </View>

                  <StarPicker rating={rating} onChange={setRating} />

                  <Text style={{ color: COLORS.muted, textAlign: "center", fontSize: 13 }}>
                    {rating} de 5 estrellas
                  </Text>

                  {/* Ideas para no quedarse en blanco: cada botón añade su frase (y la quita si ya está). */}
                  <View nativeID="resena-sugerencias" style={{ gap: 8 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13.5, textAlign: "center" }}>
                      ¿No sabes qué poner? Toca una idea
                    </Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                      {SUGERENCIAS_RESENA.map((s) => {
                        const puesta = comment.includes(s.texto);
                        const cabe = puesta || (comment.trim() ? comment.trim().length + 1 : 0) + s.texto.length <= COMMENT_MAX;
                        return (
                          <Pressable
                            key={s.id}
                            onPress={() => alternarSugerencia(s.texto)}
                            disabled={!cabe}
                            accessibilityRole="button"
                            accessibilityLabel={puesta ? `Quitar: ${s.texto}` : `Añadir: ${s.texto}`}
                            {...({ "aria-pressed": puesta } as object)}
                            style={({ pressed }) => ({
                              minHeight: 44,
                              paddingHorizontal: 12,
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor: puesta ? COLORS.accent : COLORS.accentBorder,
                              backgroundColor: puesta ? COLORS.accent2 : "#FFFFFF",
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 5,
                              opacity: !cabe ? 0.45 : pressed ? 0.85 : 1,
                            })}
                          >
                            <Ionicons name={puesta ? "checkmark" : "add"} size={16} color={COLORS.accent} />
                            <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13.5 }}>{s.etiqueta}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View style={{ gap: 6 }}>
                    <TextInput
                      ref={campoRef}
                      nativeID="resena-comentario"
                      value={comment}
                      onChangeText={(t) => setComment(t.slice(0, COMMENT_MAX))}
                      // En el móvil nativo el alto llega por aquí; en la web lo mide el efecto de arriba.
                      onContentSizeChange={(e) => {
                        if (Platform.OS === "web") return;
                        setAltoCampo(Math.max(ALTO_MIN_COMENTARIO, Math.ceil(e.nativeEvent.contentSize.height) + 26));
                      }}
                      placeholder="Cuéntanos tu experiencia: la atención recibida, el estado del producto, los plazos de envío… (opcional)"
                      placeholderTextColor="rgba(11,33,56,0.40)"
                      multiline
                      numberOfLines={4}
                      style={{
                        minHeight: ALTO_MIN_COMENTARIO,
                        height: altoCampo,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        borderRadius: 14,
                        padding: 12,
                        color: COLORS.text,
                        backgroundColor: COLORS.cardSoft,
                        // 16px mínimo: por debajo, el móvil hace zoom solo
                        // al tocar la casilla (ver components/ProductChatThread.tsx).
                        fontSize: 16,
                        textAlignVertical: "top",
                      }}
                    />
                    <Text style={{ color: COLORS.muted2, fontSize: 11, textAlign: "right" }}>
                      {remaining} caracteres restantes
                    </Text>
                  </View>

                  {/* Emojis relacionados con lo escrito: tocar uno lo añade al final. */}
                  {emojis.length ? (
                    <View nativeID="resena-emojis" style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
                      <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13.5 }}>Añade un emoji:</Text>
                      {emojis.map((e) => (
                        <Pressable
                          key={e}
                          onPress={() => anadirEmoji(e)}
                          accessibilityRole="button"
                          accessibilityLabel={`Añadir el emoji ${e}`}
                          style={({ pressed }) => ({
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            borderWidth: 1,
                            borderColor: COLORS.accentBorder,
                            backgroundColor: "#FFFFFF",
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: pressed ? 0.8 : 1,
                            transform: [{ scale: pressed ? 0.92 : 1 }],
                          })}
                        >
                          <Text style={{ fontSize: 22 }}>{e}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}

                  {errorMsg ? (
                    <View
                      style={{
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: COLORS.dangerBorder,
                        backgroundColor: COLORS.dangerBg,
                        padding: 10,
                      }}
                    >
                      <Text style={{ color: COLORS.danger, fontSize: 13, lineHeight: 18 }}>{errorMsg}</Text>
                    </View>
                  ) : null}

                  <AnimatedPressable
                    onPress={handlePublish}
                    disabled={submitting}
                    style={({ pressed }: { pressed: boolean }) => ({
                      opacity: submitting ? 0.7 : pressed ? 0.92 : 1,
                      borderRadius: 999,
                      paddingVertical: 14,
                      alignItems: "center",
                      backgroundColor: COLORS.accent,
                    })}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>
                      {submitting ? "Publicando…" : "Publicar"}
                    </Text>
                  </AnimatedPressable>
                </View>
              )}
            </View>
          </Animated.View>
        </ScrollView>
      </View>
    </Modal>
  );
}
