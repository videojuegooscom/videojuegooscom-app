import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  LayoutChangeEvent,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";

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

const HOME_CATEGORIES: Array<{
  title: string;
  emoji: string;
  cat: string;
  span?: 1 | 2;
  cta?: string;
}> = [
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

function clampText(s: string, max = 400) {
  const t = (s ?? "").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

function fmtEUR(n: number) {
  const safe = Number.isFinite(n) ? n : 0;
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

function firstImageFromAnyRow(row: any): string | null {
  const imgs = row?.images;
  if (Array.isArray(imgs) && imgs.length > 0 && typeof imgs[0] === "string") {
    return imgs[0];
  }
  const url = row?.image_url;
  if (typeof url === "string" && url.trim()) return url.trim();
  return null;
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "900" }}>
        {title}
      </Text>
      {!!subtitle && (
        <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 18 }}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}

function Pill({ text, icon }: { text: string; icon?: string }) {
  return (
    <View
      style={{
        paddingVertical: 8,
        paddingHorizontal: 10,
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
      <Text style={{ color: "rgba(255,255,255,0.85)", fontWeight: "800" }}>
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
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  rightHint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.accentBorder,
        backgroundColor: COLORS.accent2,
        paddingVertical: 14,
        paddingHorizontal: 16,
        opacity: pressed ? 0.88 : 1,
        ...softShadow(),
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
            {title}
          </Text>
          {!!subtitle && (
            <Text style={{ color: "rgba(255,255,255,0.80)", marginTop: 4 }}>
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
            }}
          >
            <Text style={{ color: "rgba(255,255,255,0.90)", fontWeight: "900" }}>
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
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.card,
        paddingVertical: 14,
        paddingHorizontal: 16,
        opacity: pressed ? 0.88 : 1,
      })}
    >
      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
        {title}
      </Text>
      {!!subtitle && (
        <Text style={{ color: "rgba(255,255,255,0.70)", marginTop: 4 }}>
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
  span = 1,
  cta,
}: {
  title: string;
  emoji: string;
  onPress: () => void;
  span?: 1 | 2;
  cta?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: span === 2 ? 2 : 1,
        minHeight: 86,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.card,
        padding: 12,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <Text style={{ fontSize: 22 }}>{emoji}</Text>
      <Text
        style={{
          color: COLORS.text,
          fontWeight: "900",
          marginTop: 6,
          lineHeight: 18,
        }}
      >
        {title}
      </Text>
      <Text style={{ color: COLORS.muted, marginTop: 2, fontSize: 12 }}>
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
      <Text style={{ color: "rgba(255,255,255,0.78)", fontWeight: "700" }}>
        {label}
      </Text>
    </Pressable>
  );
}

function FeaturedOfferCard({
  item,
  isWide,
}: {
  item: FeaturedProduct | null;
  isWide: boolean;
}) {
  if (!item) {
    return (
      <View
        style={{
          borderRadius: 22,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.card,
          padding: 16,
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
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>
            Oferta de la semana
          </Text>
        </View>

        <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "900" }}>
          Estamos preparando la próxima oferta destacada.
        </Text>

        <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
          Mientras tanto, puedes explorar las categorías disponibles o escribirnos
          por WhatsApp para preguntarnos qué producto te recomendamos ahora mismo.
        </Text>

        <View style={{ flexDirection: isWide ? "row" : "column", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <PrimaryButton
              title="Ver categorías"
              subtitle="Explora PS5, PS4, Switch, Xbox y servicios"
              rightHint="Ir →"
              onPress={() => router.push("/")}
            />
          </View>

          <View style={{ flex: 1 }}>
            <SecondaryButton
              title="Preguntar por WhatsApp"
              subtitle="Te orientamos según lo que buscas"
              onPress={openWhatsApp}
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
      <View
        style={{
          flexDirection: isWide ? "row" : "column",
        }}
      >
        <View
          style={{
            flex: isWide ? 1.05 : undefined,
            minHeight: isWide ? 280 : 220,
            backgroundColor: "rgba(255,255,255,0.04)",
          }}
        >
          {item.imageUrl ? (
            <Image
              source={{ uri: item.imageUrl }}
              resizeMode="cover"
              style={{ width: "100%", height: "100%" as any, minHeight: isWide ? 280 : 220 }}
            />
          ) : (
            <View
              style={{
                minHeight: isWide ? 280 : 220,
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
            padding: 16,
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
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>
              Oferta de la semana
            </Text>
          </View>

          <View>
            <Text
              style={{
                color: COLORS.text,
                fontSize: 22,
                fontWeight: "900",
                lineHeight: 28,
              }}
            >
              {item.title}
            </Text>

            <Text
              style={{
                color: COLORS.accent,
                fontSize: 24,
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
            <Pill icon="🔥" text="Destacado" />
            <Pill icon="✅" text="Revisado" />
            {item.categoryName ? <Pill icon="📦" text={item.categoryName} /> : null}
          </View>

          <View style={{ flexDirection: isWide ? "row" : "column", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                title="Ver producto"
                subtitle="Abrir ficha completa"
                rightHint="Ir →"
                onPress={() => router.push(`/producto/${item.id}`)}
              />
            </View>

            <View style={{ flex: 1 }}>
              <SecondaryButton
                title="Consultar por WhatsApp"
                subtitle="Confirmar disponibilidad"
                onPress={() => openWhatsAppWithText(waText)}
              />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isWide = widthSafe >= 760;

  const [featured, setFeatured] = useState<FeaturedProduct | null>(null);
  const [featuredLoading, setFeaturedLoading] = useState(true);

  const scrollRef = useRef<ScrollView | null>(null);
  const [categoriesY, setCategoriesY] = useState(0);

  const containerStyle = useMemo(
    () => ({
      width: "100%" as const,
      maxWidth: 920,
      alignSelf: "center" as const,
    }),
    []
  );

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

        let data: any = null;

        const trySmartQuery = async () => {
          const featuredRes1 = await buildFeaturedQuery(selectWithImages);

          if (!featuredRes1.error) {
            return featuredRes1.data;
          }

          const msg = String(featuredRes1.error.message ?? "");
          const looksLikeMissingColumn =
            msg.includes("column") ||
            msg.includes("does not exist") ||
            msg.includes("schema cache");

          if (!looksLikeMissingColumn) throw featuredRes1.error;

          const featuredRes2 = await buildFeaturedQuery(selectBase);
          if (featuredRes2.error) throw featuredRes2.error;
          if (featuredRes2.data) return featuredRes2.data;

          return null;
        };

        data = await trySmartQuery();

        if (!data) {
          const fallbackRes1 = await buildFallbackQuery(selectWithImages);

          if (!fallbackRes1.error) {
            data = fallbackRes1.data;
          } else {
            const msg = String(fallbackRes1.error.message ?? "");
            const looksLikeMissingColumn =
              msg.includes("column") ||
              msg.includes("does not exist") ||
              msg.includes("schema cache");

            if (!looksLikeMissingColumn) throw fallbackRes1.error;

            const fallbackRes2 = await buildFallbackQuery(selectBase);
            if (fallbackRes2.error) throw fallbackRes2.error;
            data = fallbackRes2.data;
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
            paddingHorizontal: 12,
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
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>
              ⚡ Te compramos tu consola en menos de 24h
            </Text>

            <Pressable
              onPress={openWhatsApp}
              style={({ pressed }) => ({
                opacity: pressed ? 0.85 : 1,
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: COLORS.warningBorder,
                backgroundColor: COLORS.warningBg,
              })}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                WhatsApp
              </Text>
            </Pressable>
          </View>
        </View>

        <View
          style={{
            backgroundColor: COLORS.bg2,
            borderBottomWidth: 1,
            borderBottomColor: "rgba(255,255,255,0.06)",
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 14,
          }}
        >
          <View
            style={{
              ...containerStyle,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.text, fontSize: 26, fontWeight: "900" }}>
                {BRAND.name}
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => router.push("/catalogo")}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.85 : 1,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.14)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                })}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                  🔎 Buscar
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.push("/carrito")}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.85 : 1,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.14)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                })}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                  🛒 Carrito
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        ref={(ref) => {
          scrollRef.current = ref;
        }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingVertical: 16,
          gap: 14,
        }}
      >
        <View style={{ ...containerStyle, gap: 14 }}>
          <View
            style={{
              borderRadius: 22,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
              padding: 16,
              gap: 12,
              ...softShadow(),
            }}
          >
            <Text
              style={{
                color: COLORS.text,
                fontSize: 22,
                fontWeight: "900",
                lineHeight: 28,
              }}
            >
              Compra y vende consolas y electrónica con confianza.
            </Text>

            <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
              Productos revisados, precios claros y soporte real. Explora primero
              las categorías disponibles y entra solo en lo que realmente te interesa.
            </Text>

            <View style={{ flexDirection: isWide ? "row" : "column", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Ver categorías"
                  subtitle="Explora PS5, PS4, Switch, Xbox y servicios"
                  rightHint="Ir →"
                  onPress={scrollToCategories}
                />
              </View>

              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Vender ahora"
                  subtitle="Te compramos tu consola o electrónica"
                  rightHint="WA"
                  onPress={openWhatsApp}
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
              <Pill icon="✅" text="Garantía" />
              <Pill icon="🚚" text="Envíos en España" />
              <Pill icon="⚙️" text="Productos revisados" />
              <Pill icon="⚡" text="Pago rápido" />
            </View>
          </View>

          {featuredLoading ? (
            <View
              style={{
                borderRadius: 22,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.card,
                padding: 16,
                gap: 10,
                minHeight: 180,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ActivityIndicator />
              <Text style={{ color: COLORS.muted }}>Cargando oferta destacada…</Text>
            </View>
          ) : (
            <FeaturedOfferCard item={featured} isWide={isWide} />
          )}

          <View
            onLayout={handleCategoriesLayout}
            style={{
              borderRadius: 22,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.card,
              padding: 16,
              gap: 10,
            }}
          >
            <SectionTitle
              title="Categorías"
              subtitle="Explora las principales secciones de la tienda."
            />

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {HOME_CATEGORIES.map((c) => {
                const span = c.span ?? 1;
                const onPress =
                  c.cat === "reparaciones"
                    ? () =>
                        openWhatsAppWithText(
                          "Hola, vengo desde videojuegoszaragoza.com. Me interesa vuestro servicio de reparación o limpieza. ¿Qué necesitáis para darme información?"
                        )
                    : () =>
                        router.push({
                          pathname: "/catalogo",
                          params: { cat: c.cat },
                        });

                return (
                  <CategoryCard
                    key={c.cat}
                    title={c.title}
                    emoji={c.emoji}
                    span={span}
                    cta={c.cta}
                    onPress={onPress}
                  />
                );
              })}
            </View>
          </View>

          <View
            style={{
              borderRadius: 22,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.card,
              padding: 16,
              gap: 10,
            }}
          >
            <SectionTitle
              title="Compra con tranquilidad"
              subtitle="Atención directa, información clara y una experiencia pensada para dar confianza."
            />

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <Pill icon="⭐" text="Reseñas reales" />
              <Pill icon="🔁" text="Devolución clara" />
              <Pill icon="🧾" text="Factura o recibo" />
              <Pill icon="🧑‍🔧" text="Soporte" />
            </View>
          </View>

          <View
            style={{
              marginTop: 8,
              paddingTop: 16,
              paddingBottom: 30,
              borderTopWidth: 1,
              borderTopColor: "rgba(255,255,255,0.08)",
              gap: 10,
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 14 }}>
              {BRAND.name} — Zaragoza · Envíos a España
            </Text>

            <View
              style={{
                flexDirection: widthSafe >= 720 ? "row" : "column",
                gap: 16,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                  Compra y venta de consolas, juegos y electrónica. Reparación,
                  limpieza y atención directa por WhatsApp.
                </Text>

                <Pressable
                  onPress={openWhatsApp}
                  style={({ pressed }) => ({
                    marginTop: 10,
                    alignSelf: "flex-start",
                    opacity: pressed ? 0.85 : 1,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: COLORS.accentBorder,
                    backgroundColor: COLORS.accent2,
                  })}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                    📲 Hablar por WhatsApp
                  </Text>
                </Pressable>
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={{ color: COLORS.text, fontWeight: "900", marginBottom: 6 }}
                >
                  Navegación
                </Text>
                <FooterLink label="Inicio" onPress={() => router.push("/")} />
                <FooterLink
                  label="Categorías"
                  onPress={scrollToCategories}
                />
                <FooterLink
                  label="Catálogo"
                  onPress={() => router.push("/catalogo")}
                />
                <FooterLink
                  label="Carrito"
                  onPress={() => router.push("/carrito")}
                />
                <FooterLink
                  label="Checkout"
                  onPress={() => router.push("/checkout")}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={{ color: COLORS.text, fontWeight: "900", marginBottom: 6 }}
                >
                  Ayuda
                </Text>
                <FooterLink label="Vender tu consola" onPress={openWhatsApp} />
                <FooterLink label="Reparación y limpieza" onPress={openWhatsApp} />
                <FooterLink label="Contacto por WhatsApp" onPress={openWhatsApp} />
              </View>
            </View>

            <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 6 }}>
              © {new Date().getFullYear()} {BRAND.name}. Todos los derechos reservados.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}