/**
 * Qué hace: pantalla de inicio (pestaña "Inicio"). Es el escaparate
 * principal: cabecera con marca, barra de búsqueda flotante, accesos
 * rápidos a categorías, productos destacados desde Supabase, bloque de
 * reseñas y footer con enlaces y contacto por WhatsApp.
 *
 * Cómo funciona:
 * - Carga productos destacados desde la tabla "products" de Supabase
 *   (con su categoría e imágenes) para la sección de destacados.
 * - FloatingBarramagic (components/Barramagic.tsx) es un componente aparte
 *   que se superpone al contenido y se puede arrastrar arriba/abajo.
 * - containerStyle (maxWidth según el ancho de pantalla: 920/1040/1240)
 *   centra todo el contenido en pantallas anchas para que nada quede
 *   pegado a la izquierda.
 * - Sigue el tema claro global: fondo blanco, azul claro de acento y
 *   texto en azul marino oscuro (COLORS de este mismo archivo).
 * - El botón "Vender ahora" y el botón "Vender Ya" de la franja superior
 *   (rotador de "Noticias Flash", components/PromoBanner.tsx — lee la tabla
 *   Supabase "flash_news" y se edita desde app/admin/flash-news.tsx)
 *   ya no abren WhatsApp directamente: ambos abren el mismo formulario "pop"
 *   de VenderAhoraModal (comparten el estado sellModalOpen), que guarda la
 *   solicitud en Supabase (tabla "sell_requests") para revisarla luego en
 *   el admin. PromoBanner también se muestra en las otras 4 pestañas
 *   (perfil, cesta, chat-global, blue-ia), pero solo aquí, en Inicio, va
 *   dentro de este Animated.View que la oculta al hacer scroll.
 * - Al deslizar hacia abajo dentro del ScrollView, la franja superior y la
 *   barra de búsqueda flotante se ocultan solas con una animación suave
 *   (fade + colapso de altura / desplazamiento), para dejar ver mejor el
 *   contenido; al deslizar hacia arriba (o volver arriba del todo) vuelven
 *   a aparecer. handleScroll detecta la dirección comparando cada posición
 *   de scroll con la anterior y solo dispara la animación cuando cambia de
 *   sentido, no en cada píxel. Cerca del pie de página (o durante su rebote
 *   elástico al llegar al final) esa comparación se congela a propósito:
 *   el rebote por sí solo ya no las hace reaparecer, hace falta que el
 *   usuario suba de verdad un poco más para volver a verlas.
 *
 * - Analítica propia (lib/analytics.ts): al entrar se registra el paso
 *   "Inicio", el scroll dispara "Scroll" (con límite de frecuencia para no
 *   mandar un evento por pixel) y, la primera vez que el bloque de reseñas
 *   entra en pantalla, se registra "Reseñas". Todo esto respeta el aviso de
 *   cookies/analítica: si el visitante rechaza el seguimiento, estas
 *   llamadas no hacen nada (lo decide trackEvent internamente).
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase para los productos destacados.
 * - lib/analytics.ts → registro del recorrido del visitante para el panel
 *   de métricas del admin.
 * - components/Barramagic.tsx → barra de búsqueda (aquí, en modo flotante
 *   vía FloatingBarramagic; app/catalogo.tsx usa el mismo archivo en modo
 *   fijo/editable).
 * - components/Resenas.tsx → bloque de reseñas.
 * - components/PromoBanner.tsx → franja rotatoria "Noticias Flash".
 * - components/VenderAhoraModal.tsx → formulario de "Vender ahora"
 *   (sustituye el envío por email; guarda en la tabla "sell_requests").
 * - app/catalogo.tsx, app/producto/[id].tsx, app/(tabs)/blue-ia.tsx →
 *   pantallas a las que enlazan los accesos rápidos y las tarjetas de
 *   producto destacado.
 * - app/(tabs)/_layout.tsx → define esta pantalla como la pestaña "Inicio".
 */
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { ParamListBase } from "@react-navigation/native";
import type { Href } from "expo-router";
import { router, useNavigation } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  View,
  useWindowDimensions,
  type DimensionValue,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { FloatingBarramagic } from "../../components/Barramagic";
import PromoBanner from "../../components/PromoBanner";
import Resenas from "../../components/Resenas";
import VenderAhoraModal from "../../components/VenderAhoraModal";
import { supabase } from "../../lib/supabase";
import { trackEvent, trackEventThrottled } from "../../lib/analytics";

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
  name: "Videojuegoszaragoza.com",
  whatsappPhoneE164: "+34627748741",
  whatsappPrefill:
    "Hola, vengo desde videojuegoszaragoza.com. Quiero vender o tasar mi consola/electrónica. ¿Te paso fotos y modelo?",
};

// Preguntas frecuentes de la sección "Preguntas frecuentes" de Inicio (antes
// vivían dentro de Blue IA). Tocar una lleva a "/blue-ia?q=..." y esa
// pantalla la manda automáticamente en cuanto entra — ver el useEffect de
// autoenvío en app/(tabs)/blue-ia.tsx.
const HOME_FAQ = [
  "Quiero una PS5 por unos 450€",
  "Tengo una Nintendo Switch para vender",
  "¿Cuánto cuesta limpiar una consola?",
  "Busco un mando bueno y barato para PS4",
  "¿Puedo pagar a plazos?",
  "Quiero un pack completo para empezar a jugar",
];

type FeaturedProduct = {
  id: string;
  title: string;
  description: string | null;
  priceEUR: number;
  // Todas las fotos del producto (la de portada primero), para poder
  // deslizar entre ellas directamente desde la tarjeta de Inicio sin
  // entrar en la ficha de producto.
  images: string[];
  categoryName: string | null;
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
    cta: "Ver servicios →",
  },
  {
    title: "Electrónica y otros",
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
  mobileTabBarHeight: 84,
  desktopTabBarHeight: 88,
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
  center,
}: {
  title: string;
  subtitle?: string;
  isMobile?: boolean;
  /** Centra título y subtítulo (solo se usa donde se pide explícitamente). */
  center?: boolean;
}) {
  return (
    <View style={{ marginBottom: 10, alignItems: center ? "center" : "flex-start" }}>
      <Text
        style={{
          color: COLORS.text,
          fontSize: isMobile ? 17 : 18,
          fontWeight: "900",
          lineHeight: isMobile ? 22 : 24,
          textAlign: center ? "center" : "left",
        }}
      >
        {title}
      </Text>

      {!!subtitle && (
        <Text
          style={{
            color: COLORS.muted,
            marginTop: 4,
            lineHeight: 19,
            textAlign: center ? "center" : "left",
          }}
        >
          {subtitle}
        </Text>
      )}
    </View>
  );
}

function FaqChip({ text, onPress }: { text: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View
        style={{
          borderRadius: 999,
          paddingVertical: 10,
          paddingHorizontal: 14,
          backgroundColor: "#F6FAFD",
          borderWidth: 1,
          borderColor: COLORS.border,
          maxWidth: 420,
        }}
      >
        <Text style={{ color: COLORS.text, fontWeight: "800", lineHeight: 20 }}>{text}</Text>
      </View>
    </Pressable>
  );
}

function Pill({
  text,
  icon,
  isMobile,
  plain,
}: {
  text: string;
  icon?: IoniconName;
  isMobile?: boolean;
  // plain: sin fondo ni borde (solo icono + texto), para que no parezca un
  // botón pulsable cuando en realidad es una simple etiqueta informativa.
  plain?: boolean;
}) {
  return (
    <View
      style={{
        paddingVertical: plain ? 0 : isMobile ? 7 : 8,
        paddingHorizontal: plain ? 0 : isMobile ? 9 : 10,
        borderRadius: plain ? 0 : 999,
        borderWidth: plain ? 0 : 1,
        borderColor: "rgba(11,33,56,0.12)",
        backgroundColor: plain ? "transparent" : "#F6FAFD",
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

// Antes "Garantía / Envíos en España / Productos revisados / Pago rápido"
// eran píldoras con borde (parecían botones) justo debajo de la cabecera.
// Ahora viven aquí, debajo de "Categorías", como información sencilla (solo
// icono + texto, sin fondo ni borde) — y al tocarlas se abre un "Pop" con el
// detalle (ver InfoPopModal más abajo).
type TrustInfoItem = { icon: IoniconName; title: string; detail: string };

const TRUST_INFO: TrustInfoItem[] = [
  {
    icon: "checkmark-circle-outline",
    title: "Garantía",
    detail: "Todo lo que vendemos incluye garantía de tienda: si algo falla, te lo solucionamos sin líos.",
  },
  {
    icon: "cube-outline",
    title: "Envíos en España",
    detail: "Enviamos a toda España bien protegido y con seguimiento. También puedes recoger en tienda.",
  },
  {
    icon: "shield-checkmark-outline",
    title: "Productos revisados",
    detail: "Cada producto pasa una revisión de funcionamiento antes de ponerse a la venta.",
  },
  {
    icon: "flash-outline",
    title: "Pago rápido",
    detail: "Si nos vendes tu consola o electrónica, la tasamos y te pagamos en menos de 24h.",
  },
];

function TrustInfoRow({
  isMobile,
  onPressItem,
}: {
  isMobile?: boolean;
  onPressItem: (item: TrustInfoItem) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: isMobile ? 16 : 28,
      }}
    >
      {TRUST_INFO.map((item) => (
        <Pressable
          key={item.title}
          onPress={() => onPressItem(item)}
          style={({ pressed }) => ({
            opacity: pressed ? 0.65 : 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          })}
        >
          <Ionicons name={item.icon} size={19} color={COLORS.accentDark} />
          <Text
            style={{
              color: COLORS.muted,
              fontWeight: "700",
              fontSize: isMobile ? 14 : 14.5,
            }}
          >
            {item.title}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function InfoPopModal({
  item,
  onClose,
}: {
  item: TrustInfoItem | null;
  onClose: () => void;
}) {
  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.55)",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
        onPress={onClose}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: "100%",
            maxWidth: 380,
            backgroundColor: COLORS.card,
            borderRadius: 20,
            padding: 20,
            gap: 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 14,
                backgroundColor: COLORS.accent2,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {item ? <Ionicons name={item.icon} size={19} color={COLORS.accentDark} /> : null}
            </View>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, flex: 1 }}>
              {item?.title ?? ""}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={COLORS.muted} />
            </Pressable>
          </View>

          <Text style={{ color: COLORS.muted, lineHeight: 20 }}>{item?.detail ?? ""}</Text>
        </Pressable>
      </Pressable>
    </Modal>
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
        <View style={{ flex: 1, minWidth: 0, alignItems: "center" }}>
          <Text
            style={{
              color: COLORS.onAccent,
              fontWeight: "900",
              fontSize: isMobile ? 15 : 16,
              lineHeight: isMobile ? 20 : 22,
              textAlign: "center",
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
                textAlign: "center",
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
  icon,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  isMobile?: boolean;
  icon?: IoniconName;
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
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }}>
        {!!icon && <Ionicons name={icon} size={isMobile ? 15 : 16} color={COLORS.accentDark} />}
        <Text
          style={{
            color: COLORS.accentDark,
            fontWeight: "900",
            fontSize: isMobile ? 15 : 16,
          }}
        >
          {title}
        </Text>
      </View>

      {!!subtitle && (
        <Text
          style={{
            color: COLORS.muted,
            marginTop: 4,
            lineHeight: 18,
            fontSize: isMobile ? 13 : 14,
            textAlign: "center",
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
  widthPercent?: DimensionValue;
  isMobile?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: widthPercent ?? "48.8%",
        minHeight: isMobile ? 92 : 100,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.tileBorder,
        backgroundColor: COLORS.tile,
        padding: isMobile ? 12 : 14,
        opacity: pressed ? 0.9 : 1,
        // En móvil, icono/título/enlace centrados (se ve más cuidado en una
        // rejilla de 2 columnas estrecha); en escritorio se deja como
        // estaba, alineado a la izquierda.
        alignItems: isMobile ? "center" : "flex-start",
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
          textAlign: isMobile ? "center" : "left",
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
          textAlign: isMobile ? "center" : "left",
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
  // Antes el contenido aparecía/desaparecía de golpe (render condicional sin
  // animar) y la flecha era un carácter "↑"/"↓" que cambiaba en seco. Ahora
  // la altura y la opacidad del contenido se animan con Animated (sin
  // librerías nuevas), y la flecha es un chevron que gira 180° en vez de
  // cambiar de golpe — se ve mucho más suave y cuidado.
  const [contentHeight, setContentHeight] = useState(0);
  const openAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(openAnim, {
      toValue: open ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // animamos "height", que no admite el driver nativo
    }).start();
  }, [open, openAnim]);

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

        <Animated.View
          style={{
            transform: [
              {
                rotate: openAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0deg", "180deg"],
                }),
              },
            ],
          }}
        >
          <Ionicons name="chevron-down" size={17} color={COLORS.text} />
        </Animated.View>
      </Pressable>

      <Animated.View
        style={{
          height: openAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, contentHeight],
          }),
          opacity: openAnim,
          overflow: "hidden",
        }}
      >
        <View
          onLayout={(e) => setContentHeight(e.nativeEvent.layout.height)}
          style={{
            paddingHorizontal: 14,
            paddingBottom: 14,
            borderTopWidth: 1,
            borderTopColor: "rgba(11,33,56,0.08)",
          }}
        >
          <View style={{ paddingTop: 8, gap: 2 }}>{children}</View>
        </View>
      </Animated.View>
    </View>
  );
}

// Carrusel de fotos de la tarjeta de "Oferta de la semana": permite deslizar
// (o usar las flechas, en escritorio) entre todas las fotos del producto sin
// salir de Inicio. Muestra puntos de página y, mientras queden fotos por
// delante, un indicador "…+N" (N = fotos que faltan por ver desde la que se
// está viendo) que va bajando a medida que se avanza.
function FeaturedMediaCarousel({
  images,
  mediaHeight,
  hasVideo,
}: {
  images: string[];
  mediaHeight: number;
  hasVideo: boolean;
}) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const goToIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(images.length - 1, index));
      if (containerWidth > 0) {
        scrollRef.current?.scrollTo({ x: clamped * containerWidth, animated: true });
      }
      setActiveIndex(clamped);
    },
    [containerWidth, images.length]
  );

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!containerWidth) return;
      const index = Math.round(e.nativeEvent.contentOffset.x / containerWidth);
      setActiveIndex(Math.max(0, Math.min(images.length - 1, index)));
    },
    [containerWidth, images.length]
  );

  if (images.length === 0) {
    return (
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
        <Text style={{ color: COLORS.muted, textAlign: "center", marginTop: 6, lineHeight: 18 }}>
          Sin imagen disponible.
        </Text>
      </View>
    );
  }

  const remaining = images.length - 1 - activeIndex;
  const hasMultiple = images.length > 1;

  return (
    <View
      style={{ height: mediaHeight, backgroundColor: COLORS.tile, position: "relative" }}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.round(w) !== Math.round(containerWidth)) setContainerWidth(w);
      }}
    >
      {containerWidth > 0 ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleMomentumEnd}
          scrollEventThrottle={16}
        >
          {images.map((uri, index) => (
            <Image
              key={`${uri}-${index}`}
              source={{ uri }}
              resizeMode="contain"
              style={{ width: containerWidth, height: mediaHeight }}
            />
          ))}
        </ScrollView>
      ) : null}

      {hasMultiple && activeIndex > 0 ? (
        <Pressable
          onPress={() => goToIndex(activeIndex - 1)}
          hitSlop={10}
          style={({ pressed }) => ({
            position: "absolute",
            left: 8,
            top: mediaHeight / 2 - 16,
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: pressed ? "rgba(11,33,56,0.65)" : "rgba(11,33,56,0.45)",
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <Ionicons name="chevron-back" size={18} color="#FFFFFF" />
        </Pressable>
      ) : null}

      {hasMultiple && activeIndex < images.length - 1 ? (
        <Pressable
          onPress={() => goToIndex(activeIndex + 1)}
          hitSlop={10}
          style={({ pressed }) => ({
            position: "absolute",
            right: 8,
            top: mediaHeight / 2 - 16,
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: pressed ? "rgba(11,33,56,0.65)" : "rgba(11,33,56,0.45)",
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
        </Pressable>
      ) : null}

      {hasMultiple ? (
        <View
          style={{
            position: "absolute",
            bottom: 12,
            left: 0,
            right: 0,
            flexDirection: "row",
            justifyContent: "center",
            gap: 5,
          }}
        >
          {images.map((_, index) => (
            <View
              key={index}
              style={{
                width: index === activeIndex ? 16 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: index === activeIndex ? "#FFFFFF" : "rgba(255,255,255,0.55)",
              }}
            />
          ))}
        </View>
      ) : null}

      {remaining > 0 ? (
        <View style={{ position: "absolute", right: 12, bottom: hasMultiple ? 26 : 12 }}>
          <Text
            style={{
              color: "#FFFFFF",
              fontWeight: "900",
              fontSize: 12,
              textShadowColor: "rgba(0,0,0,0.55)",
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 4,
            }}
          >
            …+{remaining}
          </Text>
        </View>
      ) : null}

      {hasVideo ? (
        <View
          style={{
            position: "absolute",
            left: 12,
            top: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            backgroundColor: "rgba(11,33,56,0.55)",
            borderRadius: 999,
            paddingHorizontal: 8,
            paddingVertical: 4,
          }}
        >
          <Ionicons name="videocam" size={12} color="#FFFFFF" />
          <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 11 }}>Vídeo</Text>
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
  onPressChat,
  chatBusy,
}: {
  item: FeaturedProduct | null;
  isDesktopish: boolean;
  isWide?: boolean;
  isMobile: boolean;
  onPressCategories: () => void;
  // Abre el chat interno del producto destacado (mismo flujo que el botón
  // "Chat" de la ficha de producto): pide login si hace falta y crea/reusa
  // la conversación en app/chat/[chatId].tsx.
  onPressChat: () => void;
  chatBusy?: boolean;
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
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
          Oferta de la semana
        </Text>

        <Text
          style={{
            color: COLORS.text,
            fontSize: isMobile ? 19 : 20,
            fontWeight: "900",
            lineHeight: isMobile ? 25 : 28,
          }}
        >
          Descubre nuestras categorías destacadas.
        </Text>

        <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
          Explora las categorías disponibles o escríbenos por WhatsApp y te recomendamos el
          producto que mejor encaja contigo.
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
        <View style={{ flex: isDesktopish ? 1.05 : undefined }}>
          <FeaturedMediaCarousel
            images={item.images}
            mediaHeight={mediaHeight}
            hasVideo={item.hasVideo}
          />
        </View>

        <View
          style={{
            flex: 1,
            padding: isMobile ? 14 : 16,
            gap: 12,
            justifyContent: "center",
          }}
        >
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
            Oferta de la semana
          </Text>

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
              : "Producto revisado y seleccionado para destacar esta semana por su excelente relación calidad-precio."}
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="checkmark-circle-outline" size={isMobile ? 14 : 15} color={COLORS.accentDark} />
              <Text
                style={{
                  color: "rgba(11,33,56,0.78)",
                  fontWeight: "800",
                  fontSize: isMobile ? 12 : 13,
                }}
              >
                Revisado
              </Text>
            </View>
            {item.categoryName ? <Pill icon="cube-outline" text={item.categoryName} isMobile={isMobile} plain /> : null}
          </View>

          <View style={{ flexDirection: isDesktopish ? "row" : "column", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                title="Ver producto"
                onPress={() => pushRoute(`/producto/${item.id}` as Href)}
                isMobile={isMobile}
              />
            </View>

            <View style={{ flex: 1 }}>
              <SecondaryButton
                title="Consultar por Chat"
                subtitle={chatBusy ? "Abriendo…" : "¿Cómo podemos ayudar?"}
                icon="chatbubble-ellipses-outline"
                onPress={onPressChat}
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
  const [featuredChatBusy, setFeaturedChatBusy] = useState(false);

  const [footerNavOpen, setFooterNavOpen] = useState(false);
  const [footerPoliciesOpen, setFooterPoliciesOpen] = useState(false);
  const [footerBlogOpen, setFooterBlogOpen] = useState(false);
  const [searchSnapPosition, setSearchSnapPosition] = useState<SearchSnapPosition>("bottom");
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [infoPop, setInfoPop] = useState<TrustInfoItem | null>(null);
  // Botón flotante "volver arriba" ⬆️: aparece tras bajar bastante.
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollTopAnim = useRef(new Animated.Value(0)).current;

  const scrollRef = useRef<ScrollView | null>(null);
  const [categoriesY, setCategoriesY] = useState(0);

  // Ocultar/mostrar la franja superior y la barra de búsqueda flotante
  // según la dirección del scroll: al bajar se ocultan (más sitio para ver
  // contenido), al subir o al llegar arriba del todo vuelven a aparecer.
  const [headerHidden, setHeaderHidden] = useState(false);
  const headerHiddenRef = useRef(false);
  const lastScrollYRef = useRef(0);
  // Recorrido acumulado en la dirección actual, para no ocultar/mostrar la
  // franja superior a la primera sacudida del dedo (antes bastaban 6px de un
  // solo evento de scroll, y con scrollEventThrottle=16 eso disparaba el
  // cambio en cuanto el usuario tocaba la pantalla, dando una sensación
  // "nerviosa"). Ahora hace falta un recorrido sostenido en la misma
  // dirección antes de reaccionar, como en apps con scroll "suave".
  const scrollRunRef = useRef(0);
  const headerAnim = useRef(new Animated.Value(0)).current;
  const [bannerHeight, setBannerHeight] = useState(0);

  // Analítica: posición del bloque de "Reseñas" (para saber cuándo entra en
  // pantalla al hacer scroll) y una bandera para registrar ese paso una sola
  // vez por visita, no cada vez que pasa por ahí.
  const resenasYRef = useRef(0);
  const resenasTrackedRef = useRef(false);

  const handleResenasLayout = useCallback((e: LayoutChangeEvent) => {
    resenasYRef.current = e.nativeEvent.layout.y;
  }, []);

  const HEADER_SCROLL_HIDE_THRESHOLD = 28;
  const HEADER_SCROLL_SHOW_THRESHOLD = 18;
  // Zona de "pie de página": incluye estar ya al final del todo Y el rebote
  // elástico que se pasa de ese final (en iOS/web ese rebote hace que
  // contentOffset.y suba un poco y luego vuelva sola, lo que antes se leía
  // como "el usuario ha subido" y reaparecían la franja y la búsqueda solo
  // por el rebote, sin que nadie moviera el dedo hacia arriba de verdad).
  const HEADER_SCROLL_BOTTOM_GUARD = 32;

  const handleScroll = useCallback(
    (e: {
      nativeEvent: {
        contentOffset: { y: number };
        contentSize?: { height: number };
        layoutMeasurement?: { height: number };
      };
    }) => {
    const y = e.nativeEvent.contentOffset.y;
    const delta = y - lastScrollYRef.current;
    const nearTop = y < 20;

    const contentHeight = e.nativeEvent.contentSize?.height ?? 0;
    const viewportHeight = e.nativeEvent.layoutMeasurement?.height ?? 0;
    const distanceFromBottom = contentHeight - viewportHeight - y;
    // true tanto en el final exacto como durante el rebote (ahí
    // distanceFromBottom se vuelve negativo al pasarse del límite).
    const nearBottom = distanceFromBottom < HEADER_SCROLL_BOTTOM_GUARD;

    if (nearTop) {
      scrollRunRef.current = 0;
      if (headerHiddenRef.current) {
        headerHiddenRef.current = false;
        setHeaderHidden(false);
      }
    } else if (nearBottom) {
      // En el pie de página (o en su rebote) no cuenta como "el usuario ha
      // subido": se congela el recorrido para que, al salir de esta zona
      // subiendo de verdad, haga falta un recorrido nuevo — ni el rebote ni
      // los primeros píxeles de salida reaparecen la franja por sí solos.
      scrollRunRef.current = 0;
    } else if (delta > 0) {
      // Bajando: solo acumula mientras se siga bajando; si el usuario cambia
      // de sentido, el recorrido se reinicia en vez de restar (evita que un
      // pequeño rebote hacia arriba "gaste" progreso y luego dispare el
      // ocultado de golpe).
      scrollRunRef.current = scrollRunRef.current > 0 ? scrollRunRef.current + delta : delta;
      if (scrollRunRef.current > HEADER_SCROLL_HIDE_THRESHOLD && !headerHiddenRef.current) {
        headerHiddenRef.current = true;
        setHeaderHidden(true);
      }
    } else if (delta < 0) {
      scrollRunRef.current = scrollRunRef.current < 0 ? scrollRunRef.current + delta : delta;
      if (scrollRunRef.current < -HEADER_SCROLL_SHOW_THRESHOLD && headerHiddenRef.current) {
        headerHiddenRef.current = false;
        setHeaderHidden(false);
      }
    }

    // El botón "volver arriba" se oculta al acercarse al final de verdad
    // (el pie de página) para que nunca quede montado encima del texto del
    // pie — solo se ve mientras hay contenido normal debajo.
    setShowScrollTop(y > 480 && distanceFromBottom > 280);

    // Analítica: "Scroll" con límite de frecuencia (no queremos un evento
    // por cada pixel) y "Reseñas" la primera vez que ese bloque entra en la
    // parte visible de la pantalla.
    if (y > 40) {
      trackEventThrottled("home-scroll", "scroll", "Scroll", { path: "/" });
    }

    if (
      !resenasTrackedRef.current &&
      resenasYRef.current > 0 &&
      y + viewportHeight > resenasYRef.current + 40
    ) {
      resenasTrackedRef.current = true;
      trackEvent("section_view", "Reseñas", { path: "/" });
    }

    lastScrollYRef.current = y;
    },
    []
  );

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  // Al tocar la pestaña "Inicio" de abajo estando ya en Inicio, la app sube
  // del todo automáticamente (como si se pulsara el botón flotante ⬆️) en
  // vez de no hacer nada, que es lo que pasaba antes.
  const navigation = useNavigation<BottomTabNavigationProp<ParamListBase>>();
  useEffect(() => {
    const unsubscribe = navigation.addListener("tabPress", () => {
      if (navigation.isFocused()) {
        scrollToTop();
      }
    });
    return unsubscribe;
  }, [navigation, scrollToTop]);

  useEffect(() => {
    Animated.timing(scrollTopAnim, {
      toValue: showScrollTop ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [showScrollTop, scrollTopAnim]);

  useEffect(() => {
    Animated.timing(headerAnim, {
      toValue: headerHidden ? 1 : 0,
      duration: 280,
      easing: Easing.inOut(Easing.cubic),
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
    (span?: 1 | 2): DimensionValue => {
      // En móvil todas las categorías van en rejilla de 2 columnas (incluso
      // las que en escritorio ocupan el ancho completo con span:2), para
      // que quepan más sin tener que hacer tanto scroll. 46% y no 48.8%:
      // el contenedor fila tiene "gap:10" además del ancho en porcentaje, y
      // en pantallas estrechas ese hueco fijo de 10px no dejaba sitio para
      // la segunda tarjeta (48.8% + 48.8% + 10px se pasaba del 100%
      // disponible por un par de píxeles), así que cada tarjeta acababa
      // sola en su fila. 46% dejamos margen de sobra para que quepan las 2.
      if (isMobile) return "46%";
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

  // Mismo flujo que el botón "Chat" de la ficha de producto
  // (handleChatPress en app/producto/[id].tsx): exige sesión iniciada y usa
  // get_or_create_product_chat para crear o reutilizar la conversación de
  // (este producto destacado, este cliente) antes de llevar a
  // app/chat/[chatId].tsx.
  const handleFeaturedChatPress = useCallback(async () => {
    if (!featured || featuredChatBusy) return;

    setFeaturedChatBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user) {
        pushRoute("/perfil" as Href);
        return;
      }

      const { data: chatId, error } = await supabase.rpc("get_or_create_product_chat", {
        p_product_id: featured.id,
      });
      if (error) throw error;

      router.push({ pathname: "/chat/[chatId]", params: { chatId: String(chatId) } } as never);
    } catch (e) {
      console.error("Error abriendo el chat del producto destacado:", e);
    } finally {
      setFeaturedChatBusy(false);
    }
  }, [featured, featuredChatBusy]);

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

        // mediaRows ya viene ordenado (portada primero, luego por sort_order)
        // gracias a fetchProductMediaRowsSafe, así que basta con quedarnos
        // con las de tipo imagen para tener el orden correcto del carrusel.
        const imagesFromMedia = mediaRows
          .filter(
            (m) =>
              normalizeMediaKind(m.kind) === "image" &&
              typeof m.public_url === "string" &&
              m.public_url.trim()
          )
          .map((m) => (m.public_url as string).trim());

        const fallbackSingleImage = firstImageFromAnyRow(data);
        const images =
          imagesFromMedia.length > 0
            ? imagesFromMedia
            : fallbackSingleImage
            ? [fallbackSingleImage]
            : [];

        setFeatured({
          id: data.id,
          title: data.title,
          description: data.description ?? null,
          priceEUR: Number(data.price_eur ?? 0),
          images,
          categoryName: data.category?.name ?? null,
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

  // Analítica: registra la visita a "Inicio" en cuanto se monta la pantalla.
  useEffect(() => {
    trackEvent("page_view", "Inicio", { path: "/" });
  }, []);

  const searchBarHeight = isMobile
    ? SEARCH_LAYOUT.searchBarHeightMobile
    : SEARCH_LAYOUT.searchBarHeightDesktop;

  const topOverlaySpace =
    searchSnapPosition === "top"
      ? searchBarHeight +
        (isMobile ? SEARCH_LAYOUT.topContentGapMobile : SEARCH_LAYOUT.topContentGapDesktop)
      : 0;

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
            <PromoBanner onPressVender={() => setSellModalOpen(true)} />

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
        // overscrollBehaviorY:"contain" (propiedad web) es lo que evita que,
        // al llegar abajo del todo (justo después del pie de página), el
        // scroll "rebote" más allá del contenido y haya que volver a subir
        // para que se acomode — el rebote elástico se queda contenido
        // dentro de este ScrollView en vez de notarse en toda la pantalla.
        style={{ overscrollBehaviorY: "contain" } as any}
        bounces={false}
        overScrollMode="never"
        contentContainerStyle={{
          paddingHorizontal: sidePadding,
          paddingTop: (isMobile ? 12 : 16) + topOverlaySpace,
          // Antes llevaba también + bottomOverlaySpace (el hueco reservado
          // para que el buscador flotante no tape el contenido mientras se
          // desplaza). Al llegar del todo abajo esa reserva ya no hace
          // falta — el buscador se oculta solo al bajar (hidden={headerHidden}
          // en FloatingBarramagic más abajo) — y sumada al propio padding
          // del pie de página dejaba un hueco en blanco de más entre el pie
          // y la barra de pestañas, con la sensación de que el scroll "se
          // pasaba" del final. Con un margen fijo pequeño el pie de página
          // queda pegado a la barra de pestañas, como debe ser.
          paddingBottom: isMobile ? 24 : 28,
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
                fontWeight: "700",
                letterSpacing: 0.2,
                lineHeight: 30,
                textAlign: "center",
              }}
            >
              ¡Véndenos, Intercambia, Repara o realízale mantenimiento a tus dispositivos
              electrónicos!
            </Text>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Ver categorías"
                  subtitle="Explora PS5, PS4, Switch, Xbox y servicios"
                  rightHint={isMobile ? undefined : "Ir →"}
                  onPress={scrollToCategories}
                  isMobile={isMobile}
                />
              </View>

              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Vender ahora"
                  subtitle="Te lo compramos rápido y al mejor precio"
                  rightHint={isMobile ? undefined : "Ir →"}
                  onPress={() => setSellModalOpen(true)}
                  isMobile={isMobile}
                />
              </View>
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
              onPressChat={handleFeaturedChatPress}
              chatBusy={featuredChatBusy}
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
              center={isMobile}
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
                    ? () => pushRoute("/servicios" as Href)
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

          <TrustInfoRow isMobile={isMobile} onPressItem={setInfoPop} />

          <View onLayout={handleResenasLayout}>
            <Resenas isMobile={isMobile} />
          </View>

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
            <SectionTitle
              title="Preguntas frecuentes"
              subtitle="Toca una y Blue IA te responde al momento."
              isMobile={isMobile}
              center
            />

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: 10,
              }}
            >
              {HOME_FAQ.map((item) => (
                <FaqChip
                  key={item}
                  text={item}
                  onPress={() => pushRoute(`/blue-ia?q=${encodeURIComponent(item)}` as Href)}
                />
              ))}
            </View>
          </View>
        </View>

        {/* Pie de página en banda completa (color oscuro de la paleta, de
            lado a lado) en vez de ir metido dentro de la columna centrada
            como el resto de secciones — así se lee de verdad como el pie de
            una web, no como una tarjeta más. */}
        <View
          style={{
            marginTop: 8,
            marginHorizontal: -sidePadding,
            paddingHorizontal: sidePadding,
            paddingTop: 28,
            paddingBottom: 34,
            backgroundColor: COLORS.text,
          }}
        >
          <View style={{ ...containerStyle, gap: 12 }}>
            <Text
              style={{
                color: "#FFFFFF",
                fontWeight: "900",
                fontSize: 16,
                textAlign: "center",
              }}
            >
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
                <FooterLink label="Foro" onPress={() => pushRoute("/chat-global" as Href)} />
                <FooterLink label="Blue IA" onPress={() => pushRoute("/blue-ia" as Href)} />
              </FooterAccordionSection>

              <FooterAccordionSection
                title="Políticas"
                open={footerPoliciesOpen}
                onToggle={() => setFooterPoliciesOpen((value) => !value)}
              >
                <FooterLink
                  label="Política de envíos"
                  onPress={() => pushRoute("/politicas/envios" as Href)}
                />
                <FooterLink
                  label="Política de devoluciones"
                  onPress={() => pushRoute("/politicas/devoluciones" as Href)}
                />
                <FooterLink
                  label="Privacidad"
                  onPress={() => pushRoute("/politicas/privacidad" as Href)}
                />
                <FooterLink
                  label="Términos y condiciones"
                  onPress={() => pushRoute("/politicas/terminos" as Href)}
                />
              </FooterAccordionSection>

              <FooterAccordionSection
                title="Blog"
                open={footerBlogOpen}
                onToggle={() => setFooterBlogOpen((value) => !value)}
              >
                <FooterLink label="Últimos artículos" onPress={() => pushRoute("/blog" as Href)} />
                <FooterLink
                  label="Guías de compra"
                  onPress={() => pushRoute("/blog?open=elegir-consola-segunda-mano" as Href)}
                />
                <FooterLink
                  label="Consejos y mantenimiento"
                  onPress={() => pushRoute("/blog?open=mantenimiento-consola" as Href)}
                />
              </FooterAccordionSection>
            </View>

            <Text
              style={{
                color: "rgba(255,255,255,0.55)",
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

      {/* "Volver arriba": aparece solo tras bajar bastante, en la esquina
          izquierda para no chocar con FloatingBarramagic (el buscador
          flotante, que vive más centrado/derecha). */}
      <Animated.View
        pointerEvents={showScrollTop ? "auto" : "none"}
        style={{
          position: "absolute",
          left: 14,
          bottom: (isMobile ? SEARCH_LAYOUT.mobileTabBarHeight : SEARCH_LAYOUT.desktopTabBarHeight) + 14,
          opacity: scrollTopAnim,
          transform: [
            {
              translateY: scrollTopAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }),
            },
          ],
        }}
      >
        <Pressable
          onPress={scrollToTop}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: "rgba(11,33,56,0.75)",
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.85 : 1,
            ...softShadow(),
          })}
        >
          <Ionicons name="arrow-up" size={17} color="#FFFFFF" />
        </Pressable>
      </Animated.View>

      <FloatingBarramagic
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

      <InfoPopModal item={infoPop} onClose={() => setInfoPop(null)} />
    </View>
  );
}