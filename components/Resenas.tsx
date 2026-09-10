/**
 * Qué hace: bloque de "Reseñas" de la pantalla de inicio: valoración media
 * real (calculada a partir de las reseñas guardadas en Supabase), un botón
 * "Dejar una reseña" que abre components/ReviewModal.tsx, y las últimas
 * reseñas publicadas por clientes de verdad (quién la escribió y cuándo).
 *
 * Cómo funciona: pide a Supabase (tabla "store_reviews", ver
 * sql/store_reviews.sql) hasta las últimas 300 reseñas para calcular la
 * media y el total, y muestra las 5 más recientes como tarjetas. Si todavía
 * no hay ninguna reseña, se ve un aviso honesto invitando a dejar la
 * primera, en vez de números inventados. Al publicar una reseña nueva desde
 * el modal, se vuelve a pedir la lista para que aparezca al momento arriba
 * del todo. Sigue el tema claro global: fondo blanco, azul claro de acento
 * y texto en azul marino oscuro.
 *
 * Miniatura del producto comprado: para las reseñas que se muestran (las 5
 * más recientes) se busca en "product_sales" (ver sql/product_sales.sql) la
 * venta más reciente de quien escribió cada una. Si existe, la tarjeta de
 * la reseña muestra a la izquierda la foto, el título y el estado de ESE
 * producto (marcado como vendido a mano por Jefe desde el chat o el panel
 * de Productos, o en automático al comprar con "Comprar ya"). Si esa
 * persona no tiene ninguna venta registrada todavía, la tarjeta se ve igual
 * que antes, sin miniatura.
 *
 * Conectado con:
 * - lib/supabase.ts → lee "store_reviews" y "product_sales".
 * - components/ReviewModal.tsx → el "pop" donde se publica una reseña
 *   nueva (estrellas + comentario), firmada con la sesión real del cliente.
 * - app/(tabs)/index.tsx → lo incluye como sección de la pantalla de inicio.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Image, Platform, Pressable, Text, View } from "react-native";
import { supabase } from "../lib/supabase";
import ReviewModal, { type PublishedReview } from "./ReviewModal";

// Mismo texto que labelCondition() en app/producto/[id].tsx (duplicado a
// propósito, como el resto de textos de estado en este proyecto).
const CONDITION_LABEL: Record<string, string> = {
  NEW: "Nuevo",
  LIKE_NEW: "Como nuevo",
  GOOD: "Bueno",
  FAIR: "Regular",
  PARTS: "Para piezas",
};

type SoldProduct = {
  title: string;
  condition: string;
  image: string;
};

const COLORS = {
  card: "#FFFFFF",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.48)",
  accent: "#1EA7E8",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  successBg: "#E7F8EE",
  successBorder: "#BCEBCB",
  gold: "#F0B429",
  goldSoft: "rgba(11,33,56,0.18)",
};

// Cuántas reseñas se piden como máximo para calcular la media/el total (una
// tienda local no va a tener miles de reseñas; con 300 sobra de sobra) y
// cuántas de las más recientes se muestran como tarjetas.
const STATS_SAMPLE_LIMIT = 300;
const VISIBLE_REVIEWS = 5;

function softShadow() {
  return Platform.select<any>({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 3 },
    default: {},
  });
}

// Siempre la fecha de publicación (día, mes, año) sin relativos tipo "hace
// X min" ni hora — es lo que pidió Jefe: la fecha da igual que sea exacta al
// minuto, pero sí quiere verla en vez de un "ahora mismo" que envejece mal.
function formatReviewDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function Stars({ rating, size = 15 }: { rating: number; size?: number }) {
  const full = Math.round(rating);
  return (
    <Text style={{ fontSize: size, color: COLORS.gold, letterSpacing: 1 }}>
      {"★".repeat(Math.max(0, Math.min(5, full)))}
      <Text style={{ color: COLORS.goldSoft }}>{"★".repeat(5 - Math.max(0, Math.min(5, full)))}</Text>
    </Text>
  );
}

function ReviewCard({
  review,
  isMobile,
  soldProduct,
}: {
  review: PublishedReview;
  isMobile?: boolean;
  soldProduct?: SoldProduct;
}) {
  return (
    <View
      style={{
        width: "100%",
        flexDirection: "row",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(11,33,56,0.10)",
        backgroundColor: "#F6FAFD",
        padding: isMobile ? 12 : 14,
        gap: isMobile ? 10 : 12,
      }}
    >
      {soldProduct ? (
        <View style={{ width: isMobile ? 56 : 64, gap: 4 }}>
          {soldProduct.image ? (
            <Image
              source={{ uri: soldProduct.image }}
              style={{
                width: isMobile ? 56 : 64,
                height: isMobile ? 56 : 64,
                borderRadius: 12,
                backgroundColor: "#EAF1F7",
              }}
            />
          ) : (
            <View
              style={{
                width: isMobile ? 56 : 64,
                height: isMobile ? 56 : 64,
                borderRadius: 12,
                backgroundColor: "#EAF1F7",
              }}
            />
          )}
          <Text numberOfLines={2} style={{ color: COLORS.text, fontSize: 10, fontWeight: "700", lineHeight: 12 }}>
            {soldProduct.title}
          </Text>
          {soldProduct.condition ? (
            <Text style={{ color: COLORS.muted2, fontSize: 9 }}>
              {CONDITION_LABEL[soldProduct.condition] ?? soldProduct.condition}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <Stars rating={review.rating} size={13} />

        {review.comment?.trim() ? (
          <Text
            style={{
              color: COLORS.text,
              fontSize: isMobile ? 14 : 15,
              lineHeight: isMobile ? 20 : 22,
              fontWeight: "700",
            }}
          >
            “{review.comment.trim()}”
          </Text>
        ) : null}

        <Text style={{ color: COLORS.muted2, fontSize: 12 }}>
          {review.display_name || "Cliente"} · {formatReviewDate(review.created_at)}
        </Text>
      </View>
    </View>
  );
}

export default function Resenas({ isMobile = false }: { isMobile?: boolean }) {
  const [reviews, setReviews] = useState<PublishedReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [soldByUser, setSoldByUser] = useState<Record<string, SoldProduct>>({});

  const loadReviews = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("store_reviews")
        .select("id,created_at,user_id,display_name,rating,comment")
        .order("created_at", { ascending: false })
        .limit(STATS_SAMPLE_LIMIT);

      if (error) throw error;
      setReviews((data ?? []) as PublishedReview[]);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const count = reviews.length;
  const average = count ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / count : 0;
  const visibleReviews = reviews.slice(0, VISIBLE_REVIEWS);

  // Para cada persona detrás de las reseñas visibles, busca su venta más
  // reciente en product_sales (si tiene alguna) para mostrar la miniatura
  // del producto que compró junto a su reseña.
  useEffect(() => {
    const userIds = Array.from(
      new Set(visibleReviews.map((r) => r.user_id).filter((id): id is string => Boolean(id)))
    );
    if (userIds.length === 0) {
      setSoldByUser({});
      return;
    }

    let alive = true;
    supabase
      .from("product_sales")
      .select("buyer_user_id,product_title,product_condition,product_image,created_at")
      .in("buyer_user_id", userIds)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!alive || error || !data) return;

        const map: Record<string, SoldProduct> = {};
        for (const row of data as any[]) {
          const buyerId = String(row.buyer_user_id ?? "");
          if (!buyerId || map[buyerId]) continue; // ya tenemos la más reciente de esta persona
          map[buyerId] = {
            title: String(row.product_title ?? ""),
            condition: String(row.product_condition ?? ""),
            image: String(row.product_image ?? ""),
          };
        }
        setSoldByUser(map);
      });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviews]);

  return (
    <View
      style={{
        borderRadius: 22,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.card,
        padding: isMobile ? 14 : 16,
        gap: 14,
        ...softShadow(),
      }}
    >
      <View style={{ gap: 8, alignItems: isMobile ? "center" : "flex-start" }}>
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>Reseñas</Text>

        <Text
          style={{
            color: COLORS.text,
            fontSize: isMobile ? 20 : 22,
            fontWeight: "900",
            lineHeight: isMobile ? 27 : 29,
            textAlign: isMobile ? "center" : "left",
          }}
        >
          Lo que importa no es lo que decimos nosotros, sino lo que opina la gente.
        </Text>

        <Text
          style={{
            color: COLORS.muted,
            lineHeight: 20,
            fontSize: isMobile ? 14 : 15,
            textAlign: isMobile ? "center" : "left",
          }}
        >
          Opiniones reales de clientes que ya han comprado o vendido con nosotros.
        </Text>
      </View>

      <View
        style={{
          borderRadius: 20,
          borderWidth: 1,
          borderColor: COLORS.accentBorder,
          backgroundColor: COLORS.accent2,
          padding: isMobile ? 14 : 16,
          gap: 12,
        }}
      >
        <View
          style={{
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "flex-start" : "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            {loading ? (
              <Text style={{ color: COLORS.muted }}>Cargando valoración…</Text>
            ) : count > 0 ? (
              <>
                <Stars rating={average} size={isMobile ? 22 : 26} />

                <Text
                  style={{
                    color: COLORS.text,
                    fontSize: isMobile ? 24 : 28,
                    fontWeight: "900",
                    marginTop: 4,
                  }}
                >
                  {average.toFixed(1).replace(".", ",")} / 5
                </Text>

                <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 19 }}>
                  Basada en {count} reseña{count === 1 ? "" : "s"} de clientes.
                </Text>
              </>
            ) : (
              <>
                <Text style={{ color: COLORS.text, fontSize: isMobile ? 18 : 20, fontWeight: "900" }}>
                  Todavía no hay reseñas
                </Text>
                <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 19 }}>
                  Sé la primera persona en contar tu experiencia con nosotros.
                </Text>
              </>
            )}
          </View>

          <Pressable
            onPress={() => setModalOpen(true)}
            style={({ pressed }) => ({
              opacity: pressed ? 0.88 : 1,
              borderRadius: 999,
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderWidth: 1,
              borderColor: COLORS.accentBorder,
              backgroundColor: "#FFFFFF",
              alignSelf: isMobile ? "stretch" : "center",
            })}
          >
            <Text
              style={{
                color: COLORS.accent,
                fontWeight: "900",
                textAlign: "center",
              }}
            >
              Dejar una reseña
            </Text>
          </Pressable>
        </View>
      </View>

      {visibleReviews.length > 0 ? (
        <View style={{ gap: 10 }}>
          {visibleReviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              isMobile={isMobile}
              soldProduct={review.user_id ? soldByUser[review.user_id] : undefined}
            />
          ))}
        </View>
      ) : null}

      <ReviewModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        onPublished={() => {
          loadReviews();
        }}
      />
    </View>
  );
}
