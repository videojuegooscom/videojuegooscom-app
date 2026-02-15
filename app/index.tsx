// app/index.tsx
import React, { useMemo } from "react";
import {
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
};

const BRAND = {
  name: "Videojuegoos",
  tagline: "Catálogo.",
  whatsappPhoneE164: "+34627748741",
  whatsappPrefill:
    "Hola! Vengo desde Videojuegoos.com. Quiero vender (o tasar) mi consola/electrónica. ¿Te paso fotos y modelo?",
};

function clampText(s: string, max = 400) {
  const t = (s ?? "").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

function openWhatsApp() {
  const phone = BRAND.whatsappPhoneE164.replace(/[^\d+]/g, "");
  const text = encodeURIComponent(clampText(BRAND.whatsappPrefill, 400));
  const url = `https://wa.me/${phone.replace("+", "")}?text=${text}`;
  Linking.openURL(url).catch(() => {
    Linking.openURL(`https://api.whatsapp.com/send?phone=${phone.replace("+", "")}&text=${text}`);
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

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "900" }}>{title}</Text>
      {!!subtitle && <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 18 }}>{subtitle}</Text>}
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
      <Text style={{ color: "rgba(255,255,255,0.85)", fontWeight: "800" }}>{text}</Text>
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
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>{title}</Text>
          {!!subtitle && <Text style={{ color: "rgba(255,255,255,0.80)", marginTop: 4 }}>{subtitle}</Text>}
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
            <Text style={{ color: "rgba(255,255,255,0.90)", fontWeight: "900" }}>{rightHint}</Text>
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
      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>{title}</Text>
      {!!subtitle && <Text style={{ color: "rgba(255,255,255,0.70)", marginTop: 4 }}>{subtitle}</Text>}
    </Pressable>
  );
}

function CategoryCard({
  title,
  emoji,
  onPress,
  span = 1,
}: {
  title: string;
  emoji: string;
  onPress: () => void;
  span?: 1 | 2;
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
      <Text style={{ color: COLORS.text, fontWeight: "900", marginTop: 6, lineHeight: 18 }}>{title}</Text>
      <Text style={{ color: COLORS.muted, marginTop: 2, fontSize: 12 }}>Ver productos →</Text>
    </Pressable>
  );
}

function FooterLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, paddingVertical: 6 })}>
      <Text style={{ color: "rgba(255,255,255,0.78)", fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

const HOME_CATEGORIES: Array<{ title: string; emoji: string; cat: string; span?: 1 | 2 }> = [
  { title: "PlayStation 5", emoji: "🎮", cat: "playstation-5" },
  { title: "PlayStation 4", emoji: "🕹️", cat: "playstation-4" },
  { title: "Nintendo Switch", emoji: "🟥", cat: "nintendo-switch" },
  { title: "Xbox", emoji: "🟩", cat: "xbox" },
  { title: "Reparación / Limpieza", emoji: "🛠️", cat: "reparaciones", span: 2 },
  { title: "Otros (electrónica)", emoji: "📦", cat: "electronica", span: 2 },
];

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024; // ✅ SSR-proof
  const isWide = widthSafe >= 680;

  // ✅ No dependemos de width para maxWidth (evita maxWidth=0 en SSR)
  const containerStyle = useMemo(
    () => ({
      width: "100%" as const,
      maxWidth: 920,
      alignSelf: "center" as const,
    }),
    []
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="light-content" />

      <SafeAreaView style={{ backgroundColor: COLORS.bg2 }}>
        {/* Announcement Bar */}
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
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>⚡ Te compramos tu consola en menos de 24h</Text>
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
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>WhatsApp</Text>
            </Pressable>
          </View>
        </View>

        {/* Header */}
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
              <Text style={{ color: COLORS.text, fontSize: 26, fontWeight: "900" }}>{BRAND.name}</Text>
              <Text style={{ color: COLORS.muted }}>{BRAND.tagline}</Text>
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
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>🔎 Buscar</Text>
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
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>🛒 Carrito</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, gap: 14 }}>
        <View style={{ ...containerStyle, gap: 14 }}>
          {/* HERO */}
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
            <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "900", lineHeight: 28 }}>
              Compra y vende consolas/electrónica sin drama.
            </Text>
            <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
              Productos revisados, precios claros y soporte real. Si quieres vender, WhatsApp y cerramos rápido.
            </Text>

            <View style={{ flexDirection: isWide ? "row" : "column", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Ver catálogo"
                  subtitle="Productos publicados y activos"
                  rightHint="Ir →"
                  onPress={() => router.push("/catalogo")}
                />
              </View>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  title="Vender ahora"
                  subtitle="Te compramos tu consola/electrónica"
                  rightHint="WA"
                  onPress={openWhatsApp}
                />
              </View>
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 2 }}>
              <Pill icon="✅" text="Garantía" />
              <Pill icon="🚚" text="Envíos España" />
              <Pill icon="⚙️" text="Revisado" />
              <Pill icon="⚡" text="Pago rápido" />
            </View>
          </View>

          {/* CATEGORÍAS */}
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
            <SectionTitle title="Categorías" subtitle="Lo típico que la gente viene a buscar (y lo que más convierte)." />

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {HOME_CATEGORIES.map((c) => {
                const span = c.span ?? 1;
                const onPress =
                  c.cat === "reparaciones"
                    ? openWhatsApp
                    : () => router.push({ pathname: "/catalogo", params: { cat: c.cat } });

                return <CategoryCard key={c.cat} title={c.title} emoji={c.emoji} span={span} onPress={onPress} />;
              })}
            </View>
          </View>

          {/* CONFIANZA */}
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
            <SectionTitle title="Confianza primero" subtitle="Una tienda que no da confianza, no vende." />

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <Pill icon="⭐" text="Reseñas reales" />
              <Pill icon="🔁" text="Devolución clara" />
              <Pill icon="🧾" text="Factura/recibo" />
              <Pill icon="🧑‍🔧" text="Soporte" />
            </View>

            <View
              style={{
                marginTop: 6,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(0,0,0,0.18)",
                padding: 14,
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>Flujo simple</Text>
              <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 20 }}>
                1) Catálogo → 2) ficha del producto → 3) carrito → 4) checkout. Y si quieres vender: WhatsApp.
              </Text>
            </View>
          </View>

          {/* ADMIN */}
          <View style={{ gap: 12 }}>
            <SecondaryButton
              title="Panel admin"
              subtitle="Inicia sesión para subir/editar productos"
              onPress={() => router.push("/admin/login")}
            />
          </View>

          {/* FOOTER */}
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

            <View style={{ flexDirection: widthSafe >= 720 ? "row" : "column", gap: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                  Compra/venta de consolas, juegos y electrónica. Reparación y limpieza completa. Si tienes dudas: WhatsApp.
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
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>📲 Hablar por WhatsApp</Text>
                </Pressable>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.text, fontWeight: "900", marginBottom: 6 }}>Navegación</Text>
                <FooterLink label="Inicio" onPress={() => router.push("/")} />
                <FooterLink label="Catálogo" onPress={() => router.push("/catalogo")} />
                <FooterLink label="Carrito" onPress={() => router.push("/carrito")} />
                <FooterLink label="Checkout" onPress={() => router.push("/checkout")} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.text, fontWeight: "900", marginBottom: 6 }}>Legal</Text>
                <FooterLink label="Privacidad (pendiente)" onPress={() => {}} />
                <FooterLink label="Devoluciones (pendiente)" onPress={() => {}} />
                <FooterLink label="Términos (pendiente)" onPress={() => {}} />
              </View>
            </View>

            <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 6 }}>
              © {new Date().getFullYear()} {BRAND.name}. Hecho para vender.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
