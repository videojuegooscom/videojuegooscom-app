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
 *
 * Conectado con:
 * - lib/supabase.ts → sesión actual + INSERT en "store_reviews".
 * - components/Resenas.tsx → abre este modal y recibe la reseña publicada.
 */
import React, { useEffect, useRef, useState } from "react";
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

const COLORS = {
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  cardSoft: "#F8FBFE",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.48)",
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

                  <View style={{ gap: 6 }}>
                    <TextInput
                      value={comment}
                      onChangeText={(t) => setComment(t.slice(0, COMMENT_MAX))}
                      placeholder="Cuéntanos tu experiencia: la atención recibida, el estado del producto, los plazos de envío… (opcional)"
                      placeholderTextColor="rgba(11,33,56,0.40)"
                      multiline
                      numberOfLines={4}
                      style={{
                        minHeight: 96,
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
