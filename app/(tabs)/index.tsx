/**
 * Qué hace: pantalla de inicio (pestaña "Inicio"). Es el escaparate
 * principal: cabecera con marca, barra de búsqueda flotante, accesos
 * rápidos a categorías, productos destacados desde Supabase, bloque de
 * reseñas y footer con enlaces y contacto por WhatsApp.
 *
 * Cómo funciona:
 * - Carga productos destacados desde la tabla "products" de Supabase
 *   (con su categoría e imágenes) para la sección de destacados.
 * - FloatingSearchBar es un componente aparte que se superpone al
 *   contenido y se puede arrastrar arriba/abajo.
 * - containerStyle (maxWidth según el ancho de pantalla: 920/1040/1240)
 *   centra todo el contenido en pantallas anchas para que nada quede
 *   pegado a la izquierda.
 * - Sigue el tema claro global: fondo blanco, azul claro de acento y
 *   texto en azul marino oscuro (COLORS de este mismo archivo).
 * - El botón "Vender ahora" y el botón "Vender Ya" de la franja superior
 *   ("Te compramos tu consola en menos de 24h") ya no abren WhatsApp
 *   directamente: ambos abren el mismo formulario "pop" de
 *   VenderAhoraModal (comparten el estado sellModalOpen), que guarda la
 *   solicitud en Supabase (tabla "sell_requests") para revisarla luego en
 *   el admin. En móvil esa franja es un poco más compacta (icono, texto y
 *   botón más pequeños) para que no ocupe tanto espacio visualmente.
 * - Al deslizar hacia abajo dentro del ScrollView, la franja superior y la
 *   barra de búsqueda flotante se ocultan solas con una animación suave
 *   (fade + colapso de altura / desplazamiento), para dejar ver mejor el
 *   contenido; al deslizar hacia arriba (o volver arriba del todo) vuelven
 *   a aparecer. handleScroll detecta la dirección comparando cada posición
 *   de scroll con la anterior y solo dispara la animación cuando cambia de
 *   sentido, no en cada píxel.
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase para los productos destacados.
 * - components/FloatingSearchBar.tsx → barra de búsqueda flotante.
 * - components/Resenas.tsx → bloque de reseñas.
 * - components/VenderAhoraModal.tsx → formulario de "Vender ahora"
 *   (sustituye el envío por email; guarda en la tabla "sell_requests").
 * - app/catalogo.tsx, app/producto/[id].tsx, app/(tabs)/blue-ia.tsx →
 *   pantallas a las que enlazan los accesos rápidos y las tarjetas de
 *   producto destacado.
 * - app/(tabs)/_layout.tsx → define esta pantalla como la pestaña "Inicio".
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Href } from "expo-router";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import Resenas from "../../components/Resenas";
import FloatingSearchBar from "../../components/FloatingSearchBar";
import VenderAhoraModal from "../../components/VenderAhoraModal";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  card: "#FFFFFF",
  cardBorder: "#E3EAF2",
  border: "#E3EAF2",
  tile: "#F6FAFD",
  tileBorder: "rgba(11,33,56,0.10)",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.48)",
  accent: "#1EA7E8",
  accentDark: "#0F8FCC",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  onAccent: "#FFFFFF",
  warningBg: "rgba(255, 178, 0, 0.14)",
  warningBorder: "rgba(255, 178, 0, 0.45)",
  successBg: "#E7F8EE",
  successBorder: "#BCEBCB",
};

const BRAND = {
  name: "Videojuegoos",
  whatsappPhoneE164: "+34627748741",
  whatsappPrefill:
    "Hola, vengo desde videojuegoszaragoza.com. Quiero vender o tasar mi consola/electrónica. ¿Te paso fotos y modelo?",
};

type FeaturedProduct = {
  id: string;
  title: string;
  description: string | null;
  priceEUR: number;
  imageUrl: string | null;
  categoryName: string | null;
  mediaCount: number;
  hasVideo: boolean;
};

type HomeCategory = {
  title: string;
  icon: IoniconName;
  cat: string;
  span?: 1 | 2;
  cta?: string;
};

type ProductCategoryLite = {
  name?: string | null;
};

type ProductRow = {
  id: string;
  title: string;
  description?: string | null;
  price_eur?: number | string | null;
  images?: string[] | null;
  updated_at?: string | null;
  created_at?: string | null;
  category?: ProductCategoryLite | null;
};

type ProductMediaKind = "image" | "video";

type ProductMediaRow = {
  id: string;
  product_id: string;
  kind?: ProductMediaKind | null;
  public_url?: string | null;
  file_name?: string | null;
  sort_order?: number | null;
  is_cover?: boolean | null;
  duration_seconds?: number | null;
};

type SearchSnapPosition = "top" | "bottom";

const HOME_CATEGORIES: HomeCategory[] = [
  { title: "PlayStation 5", icon: "game-controller-outline", cat: "playstation-5", cta: "Ver categoría →" },
  { title: "PlayStation 4", icon: "game-controller-outline", cat: "playstation-4", cta: "Ver categoría →" },
  { title: "Nintendo Switch", icon: "game-controller-outline", cat: "nintendo-switch", cta: "Ver categoría →" },
  { title: "Xbox", icon: "game-controller-outline", cat: "xbox", cta: "Ver categoría →" },
  {
    title: "Reparación / Limpieza",
    icon: "construct-outline",
    cat: "reparaciones",
    span: 2,
    cta: "Pedir información →",
  },
  {
    title: "Otros (electrónica)",
    icon: "cube-outline",
    cat: "electronica",
    span: 2,
    cta: "Ver categoría →",
  },
];

const SEARCH_LAYOUT = {
  topSnapMobile: 84,
  topSnapDesktop: 92,
  searchBarHeightMobile: 58,
  searchBarHeightDesktop: 64,
  // La tab bar inferior se hizo más compacta (ver app/(tabs)/_layout.tsx)
  // para dejar más hueco al scroll; estos valores acompañan esa altura
  // real para que la barra de búsqueda "abajo" y el padding inferior del
  // scroll no dejen un hueco de más.
  mobileTabBarHeight: 78,
  desktopTabBarHeight: 82,
  bottomGapMobile: 12,
  bottomGapDesktop: 14,
  widthMobilePercent: 0.86,
  widthDesktopPercent: 0.74,
  maxWidth: 760,
  topContentGapMobile: 12,
  topContentGapDesktop: 14,
  bottomContentGapMobile: 18,
  bottomContentGapDesktop: 20,
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asProductRow(value: unknown): ProductRow | null {
  if (!value || typeof value !== "object") return null;

  const row = value as Record<string, unknown>;
  const id = String(row.id ?? "").trim();
  const title = String(row.title ?? "").trim();

  if (!id || !title) return null;

  const rawCategory = row.category;
  const category =
    rawCategory && typeof rawCategory === "object"
      ? {
          name:
            typeof (rawCategory as Record<string, unknown>).name === "string"
              ? ((rawCategory as Record<string, unknown>).name as string)
              : null,
        }
      : null;

  return {
    id,
    title,
    description: typeof row.description === "string" ? row.description : null,
    price_eur:
      typeof row.price_eur === "number" || typeof row.price_eur === "string"
        ? row.price_eur
        : null,
    images: Array.isArray(row.images)
      ? row.images.filter((v): v is string => typeof v === "string" && !!v.trim())
      : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    category,
  };
}

function clampText(value: string, max = 400) {
  const text = (value ?? "").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function fmtEUR(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  return `${Math.round(safe)}€`;
}

function buildWhatsAppUrl(prefill: string) {
  const phone = BRAND.whatsappPhoneE164.replace(/[^\d+]/g, "");
  const text = encodeURIComponent(clampText(prefill, 400));
  return `https://wa.me/${phone.replace("+", "")}?text=${text}`;
}

function openWhatsApp() {
  const url = buildWhatsAppUrl(BRAND.whatsappPrefill);

  Linking.openURL(url).catch(() => {
    const phone = BRAND.whatsappPhoneE164.replace(/[^\d+]/g, "").replace("+", "");
    const text = encodeURIComponent(clampText(BRAND.whatsappPrefill, 400));
    Linking.openURL(`https://api.whatsapp.com/send?phone=${phone}&text=${text}`);
  });
}

function openWhatsAppWithText(prefill: string) {
  const url = buildWhatsAppUrl(prefill);

  Linking.openURL(url).catch(() => {
    const phone = BRAND.whatsappPhoneE164.replace(/[^\d+]/g, "").replace("+", "");
    const text = encodeURIComponent(clampText(prefill, 400));
    Linking.openURL(`https://api.whatsapp.com/send?phone=${phone}&text=${text}`);
  });
}

function softShadow() {
  return Platform.select({
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

function isMissingColumnError(error: unknown, columnName: string) {
  const msg = String((error as any)?.message ?? "").toLowerCase();
  const col = columnName.toLowerCase();
  return (
    msg.includes(col) &&
    (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("column"))
  );
}

function isMissingRelationError(error: unknown, relationName: string) {
  const msg = String((error as any)?.message ?? "").toLowerCase();
  const rel = relationName.toLowerCase();
  return (
    msg.includes(rel) &&
    (msg.includes("does not exist") ||
      msg.includes("relation") ||
      msg.includes("could not find the table"))
  );
}

function firstImageFromAnyRow(row: ProductRow | null | undefined): string | null {
  const images = row?.images;
  if (Array.isArray(images) && images.length > 0) {
    const first = images.find((v) => typeof v === "string" && v.trim());
    if (typeof first === "string" && first.trim()) return first.trim();
  }
  return null;
}

function normalizeMediaKind(value: unknown): ProductMediaKind | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "image") return "image";
  if (v === "video") return "video";
  return null;
}

function sortMediaRows(a: ProductMediaRow, b: ProductMediaRow) {
  const aCover = Boolean(a.is_cover);
  const bCover = Boolean(b.is_cover);

  if (aCover && !bCover) return -1;
  if (!aCover && bCover) return 1;

  const aOrder = Number.isFinite(Number(a.sort_order)) ? Number(a.sort_order) : 99999;
  const bOrder = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 99999;

  return aOrder - bOrder;
}

function pickHeroImage(productRow: ProductRow | null | undefined, mediaRows: ProductMediaRow[]) {
  const sorted = [...mediaRows].sort(sortMediaRows);

  const coverImage =
    sorted.find(
      (m) =>
        Boolean(m.is_cover) &&
        normalizeMediaKind(m.kind) === "image" &&
        typeof m.public_url === "string" &&
        m.public_url.trim()
    ) ??
    sorted.find(
      (m) =>
        normalizeMediaKind(m.kind) === "image" &&
        typeof m.public_url === "string" &&
        m.public_url.trim()
    ) ??
    null;

  if (coverImage?.public_url) return coverImage.public_url;

  return firstImageFromAnyRow(productRow);
}

function pushRoute(route: Href) {
  router.push(route);
}

async function fetchFeaturedProductSafe(): Promise<ProductRow | null> {
  const selectWithJoinAndImages =
    "id,title,description,price_eur,status,is_active,updated_at,created_at,images,category:categories(name)";
  const selectWithJoinBase =
    "id,title,description,price_eur,status,is_active,updated_at,created_at,category:categories(name)";
  const selectImagesNoJoin =
    "id,title,description,price_eur,status,is_active,updated_at,created_at,images";
  const selectBaseNoJoin =
    "id,title,description,price_eur,status,is_active,updated_at,created_at";

  const attempts = [
    selectWithJoinAndImages,
    selectWithJoinBase,
    selectImagesNoJoin,
    selectBaseNoJoin,
  ];

  const buildFeaturedQuery = (selectStr: string) =>
    supabase
      .from("products")
      .select(selectStr)
      .eq("is_active", true)
      .eq("status", "PUBLISHED")
      .eq("is_featured_home", true)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  const buildFallbackQuery = (selectStr: string) =>
    supabase
      .from("products")
      .select(selectStr)
      .eq("is_active", true)
      .eq("status", "PUBLISHED")
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  let lastFeaturedError: unknown = null;

  for (const selectStr of attempts) {
    const featuredRes = await buildFeaturedQuery(selectStr);

    if (!featuredRes.error) {
      const normalized = asProductRow(featuredRes.data);
      if (normalized) return normalized;
      break;
    }

    lastFeaturedError = featuredRes.error;

    const canFallback =
      isMissingColumnError(featuredRes.error, "images") ||
      isMissingRelationError(featuredRes.error, "categories") ||
      isMissingColumnError(featuredRes.error, "name") ||
      isMissingColumnError(featuredRes.error, "is_featured_home");

    if (!canFallback) throw featuredRes.error;
  }

  let lastFallbackError: unknown = null;

  for (const selectStr of attempts) {
    const fallbackRes = await buildFallbackQuery(selectStr);

    if (!fallbackRes.error) {
      const normalized = asProductRow(fallbackRes.data);
      return normalized ?? null;
    }

    lastFallbackError = fallbackRes.error;

    const canFallback =
      isMissingColumnError(fallbackRes.error, "images") ||
      isMissingRelationError(fallbackRes.error, "categories") ||
      isMissingColumnError(fallbackRes.error, "name");

    if (!canFallback) throw fallbackRes.error;
  }

  if (lastFallbackError) throw lastFallbackError;
  if (lastFeaturedError && !isMissingColumnError(lastFeaturedError, "is_featured_home")) {
    throw lastFeaturedError;
  }

  return null;
}

async function fetchProductMediaRowsSafe(productId: string): Promise<ProductMediaRow[]> {
  const selects = [
    "id,product_id,kind,public_url,file_name,sort_order,is_cover,duration_seconds",
    "id,product_id,kind,public_url,file_name,sort_order,is_cover",
  ];

  let lastError: unknown = null;

  for (const selectStr of selects) {
    const res = await supabase
      .from("product_media")
      .select(selectStr)
      .eq("product_id", productId)
      .limit(100);

    if (res.error) {
      const missingTable = isMissingRelationError(res.error, "product_media");
      const missingColumn =
        String(res.error.message ?? "").toLowerCase().includes("column") ||
        String(res.error.message ?? "").toLowerCase().includes("schema cache");

      if (missingTable) return [];
      if (missingColumn) {
        lastError = res.error;
        continue;
      }

      throw res.error;
    }

    return asArray<ProductMediaRow>(res.data).sort(sortMediaRows);
  }

  if (lastError) throw lastError;
  return [];
}

function SectionTitle({
  title,
  subtitle,
  isMobile,
}: {
  title: string;
  subtitle?: string;
  isMobile?: boolean;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text
        style={{
          color: COLORS.text,
          fontSize: isMobile ? 17 : 18,
          fontWeight: "900",
          lineHeight: isMobile ? 22 : 24,
        }}
      >
        {title}
      </Text>

      {!!subtitle && (
        <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 19 }}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}

function Pill({
  text,
  icon,
  isMobile,
}: {
  text: string;
  icon?: IoniconName;
  isMobile?: boolean;
}) {
  return (
    <View
      style={{
        paddingVertical: isMobile ? 7 : 8,
        paddingHorizontal: isMobile ? 9 : 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(11,33,56,0.12)",
        backgroundColor: "#F6FAFD",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      }}
    >
      {!!icon && <Ionicons name={icon} size={isMobile ? 13 : 14} color={COLORS.accentDark} />}
      <Text
        style={{
          color: "rgba(11,33,56,0.78)",
          fontWeight: "800",
          fontSize: isMobile ? 12 : 13,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

function PrimaryButton({
  title,
  subtitle,
  onPress,
  rightHint,
  isMobile,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  rightHint?: string;
  isMobile?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.accentDark,
        backgroundColor: COLORS.accent,
        paddingVertical: isMobile ? 13 : 14,
        paddingHorizontal: isMobile ? 14 : 16,
        opacity: pressed ? 0.9 : 1,
        ...softShadow(),
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              color: COLORS.onAccent,
              fontWeight: "900",
              fontSize: isMobile ? 15 : 16,
              lineHeight: isMobile ? 20 : 22,
            }}
          >
            {title}
          </Text>

          {!!subtitle && (
            <Text
              style={{
                color: "rgba(255,255,255,0.85)",
                marginTop: 4,
                lineHeight: 18,
                fontSize: isMobile ? 13 : 14,
              }}
            >
              {subtitle}
            </Text>
          )}
        </View>

        {!!rightHint && (
          <View
            style={{
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.35)",
              backgroundColor: "rgba(255,255,255,0.16)",
              alignSelf: "flex-start",
            }}
          >
            <Text
              style={{
                color: "#FFFFFF",
                fontWeight: "900",
                fontSize: 12,
              }}
            >
              {rightHint}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function SecondaryButton({
  title,
  subtitle,
  onPress,
  isMobile,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  isMobile?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: COLORS.accentBorder,
        backgroundColor: "#FFFFFF",
        paddingVertical: isMobile ? 13 : 14,
        paddingHorizontal: isMobile ? 14 : 16,
        opacity: pressed ? 0.88 : 1,
      })}
    >
      <Text
        style={{
          color: COLORS.accentDark,
          fontWeight: "900",
          fontSize: isMobile ? 15 : 16,
        }}
      >
        {title}
      </Text>

      {!!subtitle && (
        <Text
          style={{
            color: COLORS.muted,
            marginTop: 4,
            lineHeight: 18,
            fontSize: isMobile ? 13 : 14,
          }}
        >
          {subtitle}
        </Text>
      )}
    </Pressable>
  );
}

function CategoryCard({
  title,
  icon,
  onPress,
  cta,
  widthPercent,
  isMobile,
}: {
  title: string;
  icon: IoniconName;
  onPress: () => void;
  cta?: string;
  widthPercent?: string;
  isMobile?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: widthPercent ?? (isMobile ? "100%" : "48.8%"),
        minHeight: isMobile ? 92 : 100,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.tileBorder,
        backgroundColor: COLORS.tile,
        padding: isMobile ? 12 : 14,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View
        style={{
          width: isMobile ? 38 : 40,
          height: isMobile ? 38 : 40,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: COLORS.accent2,
        }}
      >
        <Ionicons name={icon} size={isMobile ? 20 : 21} color={COLORS.accentDark} />
      </View>

      <Text
        style={{
          color: COLORS.text,
          fontWeight: "900",
          marginTop: 6,
          lineHeight: 20,
          fontSize: isMobile ? 14 : 15,
        }}
      >
        {title}
      </Text>

      <Text
        style={{
          color: COLORS.muted,
          marginTop: 4,
          fontSize: 12,
          lineHeight: 16,
        }}
      >
        {cta ?? "Ver categoría →"}
      </Text>
    </Pressable>
  );
}

function FooterLink({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.85 : 1,
        paddingVertical: 6,
      })}
    >
      <Text
        style={{
          color: "rgba(11,33,56,0.72)",
          fontWeight: "700",
          lineHeight: 20,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function FooterAccordionSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.card,
        overflow: "hidden",
      }}
    >
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => ({
          opacity: pressed ? 0.9 : 1,
          paddingVertical: 14,
          paddingHorizontal: 14,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        })}
      >
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 15 }}>
          {title}
        </Text>

        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
          {open ? "↑" : "↓"}
        </Text>
      </Pressable>

      {open ? (
        <View
          style={{
            paddingHorizontal: 14,
            paddingBottom: 14,
            borderTopWidth: 1,
            borderTopColor: "rgba(11,33,56,0.08)",
          }}
        >
          <View style={{ paddingTop: 8, gap: 2 }}>{children}</View>
        </View>
      ) : null}
    </View>
  );
}

function FeaturedOfferCard({
  item,
  isDesktopish,
  isWide,
  isMobile,
  onPressCategories,
}: {
  item: FeaturedProduct | null;
  isDesktopish: boolean;
  isWide?: boolean;
  isMobile: boolean;
  onPressCategories: () => void;
}) {
  const mediaHeight = isWide ? 320 : isDesktopish ? 280 : isMobile ? 210 : 240;

  if (!item) {
    return (
      <View
        style={{
          borderRadius: 22,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.card,
          padding: isMobile ? 14 : 16,
          gap: 12,
        }}
      >
        <View
          style={{
            alignSelf: "flex-start",
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: COLORS.warningBorder,
            backgroundColor: COLORS.warningBg,
          }}
        >
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
            Oferta de la semana
          </Text>
        </View>

        <Text
          style={{
            color: COLORS.text,
            fontSize: isMobile ? 19 : 20,
            fontWeight: "900",
            lineHeight: isMobile ? 25 : 28,
          }}
        >
          Estamos preparando la próxima oferta destacada.
        </Text>

        <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
          Mientras tanto, puedes explorar las categorías disponibles o escribirnos por WhatsApp para
          preguntarnos qué producto te recomendamos ahora mismo.
        </Text>

        <View style={{ flexDirection: isDesktopish ? "row" : "column", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <PrimaryButton
              title="Ver categorías"
              subtitle="Explora PS5, PS4, Switch, Xbox y servicios"
              rightHint="Ir →"
              onPress={onPressCategories}
              isMobile={isMobile}
            />
          </View>

          <View style={{ flex: 1 }}>
            <SecondaryButton
              title="Preguntar por WhatsApp"
              subtitle="Te orientamos según lo que buscas"
              onPress={openWhatsApp}
              isMobile={isMobile}
            />
          </View>
        </View>
      </View>
    );
  }

  const waText = `Hola, vengo desde videojuegoszaragoza.com.

Me interesa esta oferta de la semana:
${item.title}
Precio: ${fmtEUR(item.priceEUR)}

¿Sigue disponible?`;

  return (
    <View
      style={{
        borderRadius: 22,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.card,
        overflow: "hidden",
        ...softShadow(),
      }}
    >
      <View style={{ flexDirection: isDesktopish ? "row" : "column" }}>
        <View
          style={{
            flex: isDesktopish ? 1.05 : undefined,
            height: mediaHeight,
            backgroundColor: COLORS.tile,
            position: "relative",
          }}
        >
          {item.imageUrl ? (
            <Image
              source={{ uri: item.imageUrl }}
              resizeMode="cover"
              style={{
                width: "100%",
                height: mediaHeight,
              }}
            />
          ) : (
            <View
              style={{
                height: mediaHeight,
                backgroundColor: COLORS.tile,
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
              }}
            >
              <Ionicons name="game-controller-outline" size={40} color={COLORS.muted} />
              <Text style={{ color: COLORS.text, fontWeight: "900", marginTop: 10 }}>
                Producto destacado
              </Text>
              <Text
                style={{
                  color: COLORS.muted,
                  textAlign: "center",
                  marginTop: 6,
                  lineHeight: 18,
                }}
              >
                Esta oferta todavía no tiene imagen publicada.
              </Text>
            </View>
          )}

          {item.mediaCount > 0 ? (
            <View
              style={{
                position: "absolute",
                right: 12,
                bottom: 12,
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 999,
                backgroundColor: "rgba(7,30,51,0.86)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.16)",
              }}
            >
              {/* Chip oscuro sobre la foto: texto blanco fijo, no sigue el tema claro de la página */}
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 12 }}>
                {item.mediaCount} foto{item.mediaCount === 1 ? "" : "s"}
                {item.hasVideo ? " + vídeo" : ""}
              </Text>
            </View>
          ) : null}
        </View>

        <View
          style={{
            flex: 1,
            padding: isMobile ? 14 : 16,
            gap: 12,
            justifyContent: "center",
          }}
        >
          <View
            style={{
              alignSelf: "flex-start",
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: COLORS.successBorder,
              backgroundColor: COLORS.successBg,
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
              Oferta de la semana
            </Text>
          </View>

          <View>
            <Text
              style={{
                color: COLORS.text,
                fontSize: isMobile ? 20 : 22,
                fontWeight: "900",
                lineHeight: isMobile ? 26 : 28,
              }}
            >
              {item.title}
            </Text>

            <Text
              style={{
                color: COLORS.accent,
                fontSize: isMobile ? 22 : 24,
                fontWeight: "900",
                marginTop: 8,
              }}
            >
              {fmtEUR(item.priceEUR)}
            </Text>
          </View>

          <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
            {item.description?.trim()
              ? clampText(item.description, 180)
              : "Producto revisado y seleccionado para destacar esta semana por relación calidad-precio y salida comercial."}
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Pill icon="flame-outline" text="Destacado" isMobile={isMobile} />
            <Pill icon="checkmark-circle-outline" text="Revisado" isMobile={isMobile} />
            {item.categoryName ? <Pill icon="cube-outline" text={item.categoryName} isMobile={isMobile} /> : null}
          </View>

          <View style={{ flexDirection: isDesktopish ? "row" : "column", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                title="Ver producto"
                subtitle="Abrir ficha completa"
                rightHint="Ir →"
                onPress={() => pushRoute(`/producto/${item.id}` as Href)}
                isMobile={isMobile}
              />
            </View>

            <View style={{ flex: 1 }}>
              <SecondaryButton
                title="Consultar por WhatsApp"
                subtitle="Confirmar disponibilidad"
                onPress={() => openWhatsAppWithText(waText)}
                isMobile={isMobile}
              />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const [featured, setFeatured] = useState<FeaturedProduct | null>(null);
  const [featuredLoading, setFeaturedLoading] = useState(true);

  const [footerNavOpen, setFooterNavOpen] = useState(false);
  const [footerPoliciesOpen, setFooterPoliciesOpen] = useState(false);
  const [footerBlogOpen, setFooterBlogOpen] = useState(false);
  const [searchSnapPosition, setSearchSnapPosition] = useState<SearchSnapPosition>("bottom");
  const [sellModalOpen, setSellModalOpen] = useState(false);

  const scrollRef = useRef<ScrollView | null>(null);
  const [categoriesY, setCategoriesY] = useState(0);

  // Ocultar/mostrar la franja superior y la barra de búsqueda flotante
  // según la dirección del scroll: al bajar se ocultan (más sitio para ver
  // contenido), al subir o al llegar arriba del todo vuelven a aparecer.
  const [headerHidden, setHeaderHidden] = useState(false);
  const headerHiddenRef = useRef(false);
  const lastScrollYRef = useRef(0);
  const headerAnim = useRef(new Animated.Value(0)).current;
  const [bannerHeight, setBannerHeight] = useState(0);

  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = e.nativeEvent.contentOffset.y;
    const delta = y - lastScrollYRef.current;
    const nearTop = y < 20;

    if (nearTop && headerHiddenRef.current) {
      headerHiddenRef.current = false;
      setHeaderHidden(false);
    } else if (delta > 6 && !nearTop && !headerHiddenRef.current) {
      headerHiddenRef.current = true;
      setHeaderHidden(true);
    } else if (delta < -6 && headerHiddenRef.current) {
      headerHiddenRef.current = false;
      setHeaderHidden(false);
    }

    lastScrollYRef.current = y;
  }, []);

  useEffect(() => {
    Animated.timing(headerAnim, {
      toValue: headerHidden ? 1 : 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [headerHidden, headerAnim]);

  const { width } = useWindowDimensions();
  const widthSafe = width > 0 ? width : 1024;

  const isMobile = widthSafe < 700;
  const isDesktopish = widthSafe >= 900;
  const isWide = widthSafe >= 1280;

  const containerMaxWidth = isWide ? 1240 : isDesktopish ? 1040 : 920;

  const containerStyle = useMemo(
    () => ({
      width: "100%" as const,
      maxWidth: containerMaxWidth,
      alignSelf: "center" as const,
    }),
    [containerMaxWidth]
  );

  const categoryColumns = isMobile ? 1 : isWide ? 3 : 2;

  const categoryCardWidth = useCallback(
    (span?: 1 | 2) => {
      if (isMobile) return "100%";
      if (categoryColumns === 3) return span === 2 ? "66.2%" : "32%";
      return span === 2 ? "100%" : "48.8%";
    },
    [isMobile, categoryColumns]
  );

  const sidePadding = isMobile ? 16 : isWide ? 24 : 16;

  const handleCategoriesLayout = useCallback((e: LayoutChangeEvent) => {
    setCategoriesY(e.nativeEvent.layout.y);
  }, []);

  const scrollToCategories = useCallback(() => {
    if (!scrollRef.current) return;
    const target = Math.max(categoriesY - 12, 0);
    scrollRef.current.scrollTo({ y: target, animated: true });
  }, [categoriesY]);

  useEffect(() => {
    let alive = true;

    async function loadFeatured() {
      setFeaturedLoading(true);

      try {
        const data = await fetchFeaturedProductSafe();
        if (!alive) return;

        if (!data) {
          setFeatured(null);
          return;
        }

        const mediaRows = await fetchProductMediaRowsSafe(data.id);
        if (!alive) return;

        setFeatured({
          id: data.id,
          title: data.title,
          description: data.description ?? null,
          priceEUR: Number(data.price_eur ?? 0),
          imageUrl: pickHeroImage(data, mediaRows),
          categoryName: data.category?.name ?? null,
          mediaCount: mediaRows.filter(
            (m) =>
              normalizeMediaKind(m.kind) === "image" &&
              typeof m.public_url === "string" &&
              m.public_url.trim()
          ).length,
          hasVideo: mediaRows.some((m) => normalizeMediaKind(m.kind) === "video"),
        });
      } catch {
        if (!alive) return;
        setFeatured(null);
      } finally {
        if (!alive) return;
        setFeaturedLoading(false);
      }
    }

    loadFeatured();

    return () => {
      alive = false;
    };
  }, []);

  const searchBarHeight = isMobile
    ? SEARCH_LAYOUT.searchBarHeightMobile
    : SEARCH_LAYOUT.searchBarHeightDesktop;

  const topOverlaySpace =
    searchSnapPosition === "top"
      ? searchBarHeight +
        (isMobile ? SEARCH_LAYOUT.topContentGapMobile : SEARCH_LAYOUT.topContentGapDesktop)
      : 0;

  const bottomOverlaySpace =
    searchSnapPosition === "bottom"
      ? searchBarHeight +
        (isMobile ? SEARCH_LAYOUT.bottomContentGapMobile : SEARCH_LAYOUT.bottomContentGapDesktop)
      : 40;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      <SafeAreaView style={{ backgroundColor: COLORS.bg2 }}>
        <Animated.View
          style={{
            height: bannerHeight
              ? headerAnim.interpolate({ inputRange: [0, 1], outputRange: [bannerHeight, 0] })
              : undefined,
            opacity: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            overflow: "hidden",
          }}
        >
          <View onLayout={(e) => setBannerHeight(e.nativeEvent.layout.height)}>
            <View
              style={{
                backgroundColor: "rgba(255, 178, 0, 0.14)",
                borderBottomWidth: 1,
                borderBottomColor: "rgba(255, 178, 0, 0.35)",
                paddingVertical: isMobile ? 7 : 10,
                paddingHorizontal: sidePadding,
              }}
            >
              <View
                style={{
                  ...containerStyle,
                  flexDirection: isMobile ? "column" : "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: isMobile ? 6 : 12,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 5,
                  }}
                >
                  <Ionicons name="flash-outline" size={isMobile ? 13 : 16} color={COLORS.text} />
                  <Text
                    numberOfLines={2}
                    style={{
                      color: COLORS.text,
                      fontWeight: "900",
                      fontSize: isMobile ? 12 : 15,
                      lineHeight: isMobile ? 16 : 20,
                      textAlign: "center",
                    }}
                  >
                    Te compramos tu consola en menos de 24h
                  </Text>
                </View>

                <Pressable
                  onPress={() => setSellModalOpen(true)}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.85 : 1,
                    paddingVertical: isMobile ? 6 : 8,
                    paddingHorizontal: isMobile ? 11 : 14,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: COLORS.warningBorder,
                    backgroundColor: COLORS.warningBg,
                    flexShrink: 0,
                  })}
                >
                  <Text
                    style={{
                      color: COLORS.text,
                      fontWeight: "900",
                      fontSize: isMobile ? 12 : 14,
                    }}
                  >
                    Vender Ya
                  </Text>
                </Pressable>
              </View>
            </View>

            <View
              style={{
                backgroundColor: COLORS.bg2,
                borderBottomWidth: 1,
                borderBottomColor: "rgba(11,33,56,0.06)",
                height: 10,
              }}
            />
          </View>
        </Animated.View>
      </SafeAreaView>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          paddingHorizontal: sidePadding,
          paddingTop: (isMobile ? 12 : 16) + topOverlaySpace,
          paddingBottom: (isMobile ? 30 : 36) + bottomOverlaySpace,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View style={{ ...containerStyle, gap: 14 }}>
          <View
            style={{
              borderRadius: 22,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.card,
              padding: isMobile ? 14 : 16,
              gap: 12,
              ...softShadow(),
            }}
          >
            <Text
              style={{
                color: COLORS.text,
                fontSize: isMobile ? 21 : 22,
                fontWeight: "900",
                lineHeight: 28,
              }}
            >
              Compra y vende consolas y electrónica con confianza.
            </Text>

            <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
              Productos revisados, precios claros y soporte real. Explora primero las categorías
              disponibles y entra solo en lo que realmente te interesa.
            </Text>

            <View style={{ flexDirection: isDesktopish ? "row" : "column", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Ver categorías"
                  subtitle="Explora PS5, PS4, Switch, Xbox y servicios"
                  rightHint="Ir →"
                  onPress={scrollToCategories}
                  isMobile={isMobile}
                />
              </View>

              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Vender ahora"
                  subtitle="Te compramos tu consola o electrónica"
                  rightHint="Ir →"
                  onPress={() => setSellModalOpen(true)}
                  isMobile={isMobile}
                />
              </View>
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 2 }}>
              <Pill icon="checkmark-circle-outline" text="Garantía" isMobile={isMobile} />
              <Pill icon="cube-outline" text="Envíos en España" isMobile={isMobile} />
              <Pill icon="shield-checkmark-outline" text="Productos revisados" isMobile={isMobile} />
              <Pill icon="flash-outline" text="Pago rápido" isMobile={isMobile} />
            </View>
          </View>

          {featuredLoading ? (
            <View
              style={{
                borderRadius: 22,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.card,
                padding: isMobile ? 14 : 16,
                gap: 10,
                minHeight: isMobile ? 150 : 180,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ActivityIndicator />
              <Text style={{ color: COLORS.muted }}>Cargando oferta destacada…</Text>
            </View>
          ) : (
            <FeaturedOfferCard
              item={featured}
              isDesktopish={isDesktopish}
              isWide={isWide}
              isMobile={isMobile}
              onPressCategories={scrollToCategories}
            />
          )}

          <View
            onLayout={handleCategoriesLayout}
            style={{
              borderRadius: 22,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.card,
              padding: isMobile ? 14 : 16,
              gap: 10,
            }}
          >
            <SectionTitle
              title="Categorías"
              subtitle="Explora las principales secciones de la tienda."
              isMobile={isMobile}
            />

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 10,
                justifyContent: "space-between",
              }}
            >
              {HOME_CATEGORIES.map((category) => {
                const onPress =
                  category.cat === "reparaciones"
                    ? () =>
                        openWhatsAppWithText(
                          "Hola, vengo desde videojuegoszaragoza.com. Me interesa vuestro servicio de reparación o limpieza. ¿Qué necesitáis para darme información?"
                        )
                    : () => pushRoute(`/catalogo?cat=${encodeURIComponent(category.cat)}` as Href);

                return (
                  <CategoryCard
                    key={category.cat}
                    title={category.title}
                    icon={category.icon}
                    cta={category.cta}
                    onPress={onPress}
                    widthPercent={categoryCardWidth(category.span)}
                    isMobile={isMobile}
                  />
                );
              })}
            </View>
          </View>

          <Resenas isMobile={isMobile} />

          <View
            style={{
              marginTop: 8,
              paddingTop: 16,
              paddingBottom: 30,
              borderTopWidth: 1,
              borderTopColor: "rgba(11,33,56,0.08)",
              gap: 12,
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
              Videojuegoszaragoza.com
            </Text>

            <View style={{ gap: 12 }}>
              <FooterAccordionSection
                title="Navegación"
                open={footerNavOpen}
                onToggle={() => setFooterNavOpen((value) => !value)}
              >
                <FooterLink label="Inicio" onPress={() => pushRoute("/" as Href)} />
                <FooterLink label="Categorías" onPress={scrollToCategories} />
                <FooterLink label="Catálogo" onPress={() => pushRoute("/catalogo" as Href)} />
                <FooterLink label="Cesta" onPress={() => pushRoute("/cesta" as Href)} />
                <FooterLink label="Checkout" onPress={() => pushRoute("/checkout" as Href)} />
                <FooterLink label="Perfil" onPress={() => pushRoute("/perfil" as Href)} />
                <FooterLink label="Chat Global" onPress={() => pushRoute("/chat-global" as Href)} />
                <FooterLink label="Blue IA" onPress={() => pushRoute("/blue-ia" as Href)} />
              </FooterAccordionSection>

              <FooterAccordionSection
                title="Políticas"
                open={footerPoliciesOpen}
                onToggle={() => setFooterPoliciesOpen((value) => !value)}
              >
                <FooterLink label="Política de envíos" onPress={() => {}} />
                <FooterLink label="Política de devoluciones" onPress={() => {}} />
                <FooterLink label="Privacidad" onPress={() => {}} />
                <FooterLink label="Términos y condiciones" onPress={() => {}} />
              </FooterAccordionSection>

              <FooterAccordionSection
                title="Blog"
                open={footerBlogOpen}
                onToggle={() => setFooterBlogOpen((value) => !value)}
              >
                <FooterLink label="Últimos artículos" onPress={() => {}} />
                <FooterLink label="Guías de compra" onPress={() => {}} />
                <FooterLink label="Consejos y mantenimiento" onPress={() => {}} />
              </FooterAccordionSection>
            </View>

            <Text
              style={{
                color: "rgba(11,33,56,0.50)",
                marginTop: 6,
                lineHeight: 18,
                fontSize: 12,
              }}
            >
              © {new Date().getFullYear()} {BRAND.name}. Todos los derechos reservados.
            </Text>
          </View>
        </View>
      </ScrollView>

      <FloatingSearchBar
        isMobile={isMobile}
        topSnapY={isMobile ? SEARCH_LAYOUT.topSnapMobile : SEARCH_LAYOUT.topSnapDesktop}
        mobileTabBarHeight={SEARCH_LAYOUT.mobileTabBarHeight}
        desktopTabBarHeight={SEARCH_LAYOUT.desktopTabBarHeight}
        bottomGapMobile={SEARCH_LAYOUT.bottomGapMobile}
        bottomGapDesktop={SEARCH_LAYOUT.bottomGapDesktop}
        widthMobilePercent={SEARCH_LAYOUT.widthMobilePercent}
        widthDesktopPercent={SEARCH_LAYOUT.widthDesktopPercent}
        maxWidth={SEARCH_LAYOUT.maxWidth}
        onSnapChange={setSearchSnapPosition}
        hidden={headerHidden}
      />

      <VenderAhoraModal visible={sellModalOpen} onClose={() => setSellModalOpen(false)} />
    </View>
  );
}