import React, { useMemo } from "react";
import { Pressable, ScrollView, StatusBar, Text, View } from "react-native";
import { router } from "expo-router";

const COLORS = {
  bg: "#071E33",
  bg2: "#061A2C",
  card: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.12)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.75)",
  accent: "#00AAE4",
  gold: "#D8B04A",
};

type CartItem = {
  id: string;
  title: string;
  subtitle?: string;
  priceEUR: number;
  qty: number;
};

function fmtEUR(n: number) {
  return `${Math.round(n)}€`;
}

/**
 * Back inteligente:
 * - Si hay historial real -> back()
 * - Si entraste directo por URL y no hay historial -> Inicio
 */
function smartBackToHome() {
  const canGoBack =
    typeof window !== "undefined" &&
    typeof window.history !== "undefined" &&
    window.history.length > 1;

  if (canGoBack) router.back();
  else router.replace("/");
}

export default function CarritoScreen() {
  // Mock (luego conectamos a store real + Stripe)
  const items: CartItem[] = useMemo(
    () => [
      // Deja vacío si quieres ver el "carrito vacío"
      // { id: "1", title: "Nintendo Switch OLED", subtitle: "Revisada · Garantía", priceEUR: 239, qty: 1 },
      // { id: "2", title: "Mando PS4 Original", subtitle: "Perfecto estado", priceEUR: 29, qty: 1 },
    ],
    []
  );

  const subtotal = useMemo(
    () => items.reduce((acc, it) => acc + it.priceEUR * it.qty, 0),
    [items]
  );

  const shipping = 0; // mock
  const total = subtotal + shipping;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.06)",
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "900" }}>Carrito</Text>
            <Text style={{ color: COLORS.muted, marginTop: 4 }}>
              De momento mock. Luego metemos Stripe Checkout.
            </Text>
          </View>

          <Pressable
            onPress={smartBackToHome}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: "rgba(255,255,255,0.05)",
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "800" }}>← Volver</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28, gap: 12 }}>
        {/* Lista */}
        {items.length === 0 ? (
          <View
            style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.card,
              padding: 16,
              gap: 10,
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
              Tu carrito está vacío.
            </Text>
            <Text style={{ color: COLORS.muted }}>
              Vuelve al catálogo y añade algo que te mole (y no, no vendemos humo).
            </Text>

            <Pressable
              onPress={() => router.push("/catalogo")}
              style={{
                marginTop: 6,
                borderRadius: 999,
                paddingVertical: 12,
                paddingHorizontal: 14,
                backgroundColor: "rgba(0,170,228,0.18)",
                borderWidth: 1,
                borderColor: "rgba(0,170,228,0.35)",
                alignSelf: "flex-start",
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>Ir al catálogo</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {items.map((it) => (
              <View
                key={it.id}
                style={{
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.card,
                  padding: 14,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: "900" }}>
                    {it.title}
                  </Text>
                  {it.subtitle ? (
                    <Text style={{ color: COLORS.muted, marginTop: 6 }}>{it.subtitle}</Text>
                  ) : null}

                  <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 8, fontSize: 12 }}>
                    Cantidad: {it.qty}
                  </Text>
                </View>

                <Text style={{ color: COLORS.gold, fontSize: 16, fontWeight: "900" }}>
                  {fmtEUR(it.priceEUR * it.qty)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Resumen + CTA */}
        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: "rgba(255,255,255,0.04)",
            padding: 14,
            gap: 10,
          }}
        >
          <Row label="Subtotal" value={fmtEUR(subtotal)} />
          <Row label="Envío" value={shipping === 0 ? "Gratis" : fmtEUR(shipping)} />
          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.10)" }} />
          <Row label="Total" value={fmtEUR(total)} strong />

          <Pressable
            disabled={items.length === 0}
            onPress={() => {
              // luego: Stripe checkout
              // router.push("/checkout");
            }}
            style={{
              marginTop: 8,
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: "center",
              backgroundColor: items.length === 0 ? "rgba(0,170,228,0.20)" : COLORS.accent,
              opacity: items.length === 0 ? 0.45 : 1,
            }}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Ir a pagar</Text>
          </Pressable>

          {/* ✅ SIEMPRE a Inicio */}
          <Pressable
            onPress={() => router.replace("/")}
            style={{ alignItems: "center", paddingVertical: 10 }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "800" }}>← Seguir comprando</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={{ color: "rgba(255,255,255,0.75)", fontWeight: strong ? "900" : "700" }}>
        {label}
      </Text>
      <Text style={{ color: "#FFFFFF", fontWeight: strong ? "900" : "800" }}>{value}</Text>
    </View>
  );
}
