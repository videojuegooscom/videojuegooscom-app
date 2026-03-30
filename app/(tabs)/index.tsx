import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Href } from "expo-router";
import { router } from "expo-router";
import {
  ActivityIndicator,
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
import { supabase } from "../../lib/supabase";
import Resenas from "../../components/Resenas";
import FloatingSearchBar from "../../components/FloatingSearchBar";

const COLORS = {
  bg: "#071E33",
  bg2: "#061A2C",
  card: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.12)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.75)",
  accent: "#00AAE4",
  accent2: "rgba(0,170,228,0.16)",
  accentBorder: "rgba(0,170,228,0.45)",
  warningBg: "rgba(255, 215, 0, 0.18)",
  warningBorder: "rgba(255, 215, 0, 0.40)",
  successBg: "rgba(34,197,94,0.16)",
  successBorder: "rgba(34,197,94,0.34)",
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
};

type HomeCategory = {
  title: string;
  emoji: string;
  cat: string;
  span?: 1 | 2;
  cta?: string;
};

type ProductRow = {
  id: string;
  title: string;
  description?: string | null;
  price_eur?: number | string | null;
  images?: string[] | null;
  image_url?: string | null;
  category?: {
    name?: string | null;
  } | null;
};

type SearchSnapPosition = "top" | "bottom";

const HOME_CATEGORIES: HomeCategory[] = [
  { title: "PlayStation 5", emoji: "🎮", cat: "playstation-5", cta: "Ver categoría →" },
  { title: "PlayStation 4", emoji: "🕹️", cat: "playstation-4", cta: "Ver categoría →" },
  { title: "Nintendo Switch", emoji: "🟥", cat: "nintendo-switch", cta: "Ver categoría →" },
  { title: "Xbox", emoji: "🟩", cat: "xbox", cta: "Ver categoría →" },
  {
    title: "Reparación / Limpieza",
    emoji: "🛠️",
    cat: "reparaciones",
    span: 2,
    cta: "Pedir información →",
  },
  {
    title: "Otros (electrónica)",
    emoji: "📦",
    cat: "electronica",
    span: 2,
    cta: "Ver categoría →",
  },
];

/**
 * ============================================================
 * SEARCH LAYOUT MASTER CONFIG
 * ============================================================
 *
 * TOCA ESTO SI QUIERES AJUSTAR LA BARRA:
 *
 * 1) POSICIÓN DE SNAP:
 *    topSnapMobile / topSnapDesktop
 *
 * 2) ALTURA VISUAL APROX DE LA SEARCH BAR:
 *    searchBarHeightMobile / searchBarHeightDesktop
 *
 * 3) HUECO REAL DEL CONTENIDO:
 *    topContentGapMobile / topContentGapDesktop
 *    bottomContentGapMobile / bottomContentGapDesktop
 *
 * IMPORTANTE:
 * Ya NO sumamos aquí toda la altura de la tab bar al ScrollView.
 * Ese era el fallo que generaba los huecos enormes.
 */
const SEARCH_LAYOUT = {
  topSnapMobile: 84,
  topSnapDesktop: 92,

  searchBarHeightMobile: 58,
  searchBarHeightDesktop: 64,

  mobileTabBarHeight: 92,
  desktopTabBarHeight: 96,

  bottomGapMobile: 12,
  bottomGapDesktop: 14,

  widthMobilePercent: 0.86,
  widthDesktopPercent: 0.74,
  maxWidth: 760,

  /**
   * TOCA ESTO SI QUIERES MÁS O MENOS AIRE ENTRE
   * LA SEARCH BAR SUPERIOR Y EL CONTENIDO.
   */
  topContentGapMobile: 12,
  topContentGapDesktop: 14,

  /**
   * TOCA ESTO SI QUIERES MÁS O MENOS AIRE AL FINAL
   * CUANDO LA SEARCH BAR ESTÁ ABAJO.
   *
   * Menor = menos hueco abajo
   * Mayor = más hueco abajo
   */
  bottomContentGapMobile: 18,
  bottomContentGapDesktop: 20,
};

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

function firstImageFromAnyRow(row: ProductRow | null | undefined): string | null {
  const images = row?.images;
  if (Array.isArray(images) && images.length > 0 && typeof images[0] === "string") {
    return images[0];
  }

  const url = row?.image_url;
  if (typeof url === "string" && url.trim()) {
    return url.trim();
  }

  return null;
}

function pushRoute(route: Href) {
  router.push(route);
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
  icon?: string;
  isMobile?: boolean;
}) {
  return (
    <View
      style={{
        paddingVertical: isMobile ? 7 : 8,
        paddingHorizontal: isMobile ? 9 : 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: "rgba(255,255,255,0.06)",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      }}
    >
      {!!icon && <Text style={{ color: COLORS.text }}>{icon}</Text>}

      <Text
        style={{
          color: "rgba(255,255,255,0.85)",
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
        borderColor: COLORS.accentBorder,
        backgroundColor: COLORS.accent2,
        paddingVertical: isMobile ? 13 : 14,
        paddingHorizontal: isMobile ? 14 : 16,
        opacity: pressed ? 0.88 : 1,
        ...softShadow(),
      })}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              color: COLORS.text,
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
                color: "rgba(255,255,255,0.80)",
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
              borderColor: "rgba(255,255,255,0.14)",
              backgroundColor: "rgba(255,255,255,0.06)",
              alignSelf: "flex-start",
            }}
          >
            <Text
              style={{
                color: "rgba(255,255,255,0.90)",
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
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.card,
        paddingVertical: isMobile ? 13 : 14,
        paddingHorizontal: isMobile ? 14 : 16,
        opacity: pressed ? 0.88 : 1,
      })}
    >
      <Text
        style={{
          color: COLORS.text,
          fontWeight: "900",
          fontSize: isMobile ? 15 : 16,
        }}
      >
        {title}
      </Text>

      {!!subtitle && (
        <Text
          style={{
            color: "rgba(255,255,255,0.70)",
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
  emoji,
  onPress,
  cta,
  forceFullWidth,
  isMobile,
}: {
  title: string;
  emoji: string;
  onPress: () => void;
  cta?: string;
  forceFullWidth?: boolean;
  isMobile?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: forceFullWidth ? "100%" : isMobile ? "100%" : "48.8%",
        minHeight: isMobile ? 92 : 100,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.card,
        padding: isMobile ? 12 : 14,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <Text style={{ fontSize: isMobile ? 21 : 22 }}>{emoji}</Text>

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
          color: "rgba(255,255,255,0.78)",
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
            borderTopColor: "rgba(255,255,255,0.08)",
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
  isMobile,
  onPressCategories,
}: {
  item: FeaturedProduct | null;
  isDesktopish: boolean;
  isMobile: boolean;
  onPressCategories: () => void;
}) {
  const mediaHeight = isDesktopish ? 280 : isMobile ? 210 : 240;

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
          Mientras tanto, puedes explorar las categorías disponibles o escribirnos
          por WhatsApp para preguntarnos qué producto te recomendamos ahora mismo.
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
            backgroundColor: "rgba(255,255,255,0.04)",
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
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
              }}
            >
              <Text style={{ fontSize: 40 }}>🎮</Text>
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
            <Pill icon="🔥" text="Destacado" isMobile={isMobile} />
            <Pill icon="✅" text="Revisado" isMobile={isMobile} />
            {item.categoryName ? (
              <Pill icon="📦" text={item.categoryName} isMobile={isMobile} />
            ) : null}
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
  const [searchSnapPosition, setSearchSnapPosition] =
    useState<SearchSnapPosition>("bottom");

  const scrollRef = useRef<ScrollView | null>(null);
  const [categoriesY, setCategoriesY] = useState(0);

  const { width } = useWindowDimensions();
  const widthSafe = width > 0 ? width : 1024;

  const isMobile = widthSafe < 700;
  const isDesktopish = widthSafe >= 900;

  const containerStyle = useMemo(
    () => ({
      width: "100%" as const,
      maxWidth: 920,
      alignSelf: "center" as const,
    }),
    []
  );

  const sidePadding = isMobile ? 12 : 16;

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
        const selectWithImages =
          "id,title,description,price_eur,status,is_active,updated_at,created_at,images,category:categories(name),image_url";
        const selectBase =
          "id,title,description,price_eur,status,is_active,updated_at,created_at,category:categories(name),image_url";

        const buildFeaturedQuery = (selectStr: string) =>
          supabase
            .from("products")
            .select(selectStr)
            .eq("is_active", true)
            .eq("status", "PUBLISHED")
            .eq("is_featured_home", true)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        const buildFallbackQuery = (selectStr: string) =>
          supabase
            .from("products")
            .select(selectStr)
            .eq("is_active", true)
            .eq("status", "PUBLISHED")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        let data: ProductRow | null = null;

        const trySmartQuery = async () => {
          const featuredRes1 = await buildFeaturedQuery(selectWithImages);

          if (!featuredRes1.error) {
            return featuredRes1.data as ProductRow | null;
          }

          const msg = String(featuredRes1.error.message ?? "");
          const looksLikeMissingColumn =
            msg.includes("column") ||
            msg.includes("does not exist") ||
            msg.includes("schema cache");

          if (!looksLikeMissingColumn) {
            throw featuredRes1.error;
          }

          const featuredRes2 = await buildFeaturedQuery(selectBase);
          if (featuredRes2.error) throw featuredRes2.error;
          return featuredRes2.data as ProductRow | null;
        };

        data = await trySmartQuery();

        if (!data) {
          const fallbackRes1 = await buildFallbackQuery(selectWithImages);

          if (!fallbackRes1.error) {
            data = fallbackRes1.data as ProductRow | null;
          } else {
            const msg = String(fallbackRes1.error.message ?? "");
            const looksLikeMissingColumn =
              msg.includes("column") ||
              msg.includes("does not exist") ||
              msg.includes("schema cache");

            if (!looksLikeMissingColumn) {
              throw fallbackRes1.error;
            }

            const fallbackRes2 = await buildFallbackQuery(selectBase);
            if (fallbackRes2.error) throw fallbackRes2.error;
            data = fallbackRes2.data as ProductRow | null;
          }
        }

        if (!alive) return;

        if (!data) {
          setFeatured(null);
          return;
        }

        setFeatured({
          id: data.id,
          title: data.title,
          description: data.description ?? null,
          priceEUR: Number(data.price_eur ?? 0),
          imageUrl: firstImageFromAnyRow(data),
          categoryName: data.category?.name ?? null,
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

  /**
   * ============================================================
   * OVERLAY SPACES CORRECTOS Y MÍNIMOS
   * ============================================================
   *
   * EL ERROR ANTERIOR:
   * Estábamos reservando demasiado hueco en el ScrollView, como si
   * hubiera que sumar la posición absoluta completa de la barra.
   *
   * NO.
   *
   * El ScrollView solo necesita reservar:
   * - arriba: altura real de la barra + pequeño gap
   * - abajo: altura real de la barra + pequeño gap de seguridad
   *
   * Nada más.
   */

  const searchBarHeight = isMobile
    ? SEARCH_LAYOUT.searchBarHeightMobile
    : SEARCH_LAYOUT.searchBarHeightDesktop;

  /**
   * TOCA ESTO SI QUIERES MÁS O MENOS AIRE ARRIBA CUANDO LA BARRA HACE SNAP TOP.
   */
  const topOverlaySpace =
    searchSnapPosition === "top"
      ? searchBarHeight +
        (isMobile
          ? SEARCH_LAYOUT.topContentGapMobile
          : SEARCH_LAYOUT.topContentGapDesktop)
      : 0;

  /**
   * TOCA ESTO SI QUIERES MÁS O MENOS AIRE ABAJO CUANDO LA BARRA HACE SNAP BOTTOM.
   *
   * Menor = menos hueco abajo
   * Mayor = más hueco abajo
   */
  const bottomOverlaySpace =
    searchSnapPosition === "bottom"
      ? searchBarHeight +
        (isMobile
          ? SEARCH_LAYOUT.bottomContentGapMobile
          : SEARCH_LAYOUT.bottomContentGapDesktop)
      : 40;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="light-content" />

      <SafeAreaView style={{ backgroundColor: COLORS.bg2 }}>
        <View
          style={{
            backgroundColor: "rgba(255, 215, 0, 0.20)",
            borderBottomWidth: 1,
            borderBottomColor: "rgba(255, 215, 0, 0.35)",
            paddingVertical: 10,
            paddingHorizontal: sidePadding,
          }}
        >
          <View
            style={{
              ...containerStyle,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
              <Text
                numberOfLines={2}
                style={{
                  color: COLORS.text,
                  fontWeight: "900",
                  fontSize: isMobile ? 14 : 15,
                  lineHeight: 20,
                }}
              >
                ⚡ Te compramos tu consola en menos de 24h
              </Text>
            </View>

            <Pressable
              onPress={openWhatsApp}
              style={({ pressed }) => ({
                opacity: pressed ? 0.85 : 1,
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: COLORS.warningBorder,
                backgroundColor: COLORS.warningBg,
                flexShrink: 0,
              })}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>WhatsApp</Text>
            </Pressable>
          </View>
        </View>

        <View
          style={{
            backgroundColor: COLORS.bg2,
            borderBottomWidth: 1,
            borderBottomColor: "rgba(255,255,255,0.06)",
            height: 10,
          }}
        />
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
      >
        <View style={{ ...containerStyle, gap: 14 }}>
          <View
            style={{
              borderRadius: 22,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
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
              Productos revisados, precios claros y soporte real. Explora primero las
              categorías disponibles y entra solo en lo que realmente te interesa.
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
                  rightHint="WA"
                  onPress={openWhatsApp}
                  isMobile={isMobile}
                />
              </View>
            </View>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 10,
                marginTop: 2,
              }}
            >
              <Pill icon="✅" text="Garantía" isMobile={isMobile} />
              <Pill icon="🚚" text="Envíos en España" isMobile={isMobile} />
              <Pill icon="⚙️" text="Productos revisados" isMobile={isMobile} />
              <Pill icon="⚡" text="Pago rápido" isMobile={isMobile} />
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
                    : () =>
                        pushRoute(
                          `/catalogo?cat=${encodeURIComponent(category.cat)}` as Href
                        );

                const forceFullWidth = isMobile || category.span === 2;

                return (
                  <CategoryCard
                    key={category.cat}
                    title={category.title}
                    emoji={category.emoji}
                    cta={category.cta}
                    onPress={onPress}
                    forceFullWidth={forceFullWidth}
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
              borderTopColor: "rgba(255,255,255,0.08)",
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
                <FooterLink
                  label="Chat Global"
                  onPress={() => pushRoute("/chat-global" as Href)}
                />
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
      />
    </View>
  );
}