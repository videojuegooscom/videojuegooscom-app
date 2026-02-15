// app/carrito.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";

const COLORS = {
  bg: "#071E33",
  bg2: "#061A2C",
  card: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.12)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.75)",
  accent: "#00AAE4",
  gold: "#D8B04A",
  danger: "#FF3B30",
  accent2: "rgba(0,170,228,0.16)",
  accentBorder: "rgba(0,170,228,0.45)",
};

type CartItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  priceEUR: number;
  qty: number;
};

type DbStatus = "DRAFT" | "PUBLISHED" | "REVIEW";
type ProductRow = {
  id: string;
  title: string;
  description: string | null;
  price_eur: number | null;
  status: DbStatus;
  is_active: boolean;
  category?: { id: string; name: string; slug: string } | null;
};

const CART_KEY = "videojuegoos_cart_v1";

function fmtEUR(n: number) {
  const safe = Number.isFinite(n) ? n : 0;
  return `${Math.round(safe)}€`;
}

function safeInt(n: unknown, fallback = 1) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(0, Math.floor(x));
}

/**
 * Back inteligente:
 * - Si hay stack: back()
 * - Si entraste por URL directa/refresh: vuelve al Home "/"
 */
function smartBackToHome() {
  try {
    if (typeof router.canGoBack === "function" && router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // no-op
  }
  router.replace("/");
}

async function loadCart(): Promise<CartItem[]> {
  try {
    const raw = await AsyncStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((it: any) => ({
        id: String(it?.id ?? ""),
        title: String(it?.title ?? ""),
        subtitle: it?.subtitle ?? null,
        priceEUR: Number(it?.priceEUR ?? 0),
        qty: safeInt(it?.qty, 1),
      }))
      .filter((it: CartItem) => it.id && it.title && it.qty > 0);
  } catch {
    return [];
  }
}

async function saveCart(items: CartItem[]) {
  try {
    await AsyncStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {
    // no-op (si falla storage, no bloqueamos UX)
  }
}

export default function CarritoScreen() {
  const params = useLocalSearchParams<{ add?: string }>();
  const addId = typeof params.add === "string" ? params.add : "";

  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);

  const bootedRef = useRef(false);
  const lastAddRef = useRef<string>("");

  const subtotal = useMemo(
    () => items.reduce((acc, it) => acc + it.priceEUR * it.qty, 0),
    [items]
  );

  const shipping = 0; // MVP: gratis
  const total = subtotal + shipping;

  const persist = useCallback(async (next: CartItem[]) => {
    setItems(next);
    await saveCart(next);
  }, []);

  const inc = useCallback(
    async (id: string) => {
      const next = items.map((it) => (it.id === id ? { ...it, qty: it.qty + 1 } : it));
      await persist(next);
    },
    [items, persist]
  );

  const dec = useCallback(
    async (id: string) => {
      const next = items
        .map((it) => (it.id === id ? { ...it, qty: Math.max(1, it.qty - 1) } : it))
        .filter(Boolean);
      await persist(next);
    },
    [items, persist]
  );

  const remove = useCallback(
    async (id: string) => {
      const next = items.filter((it) => it.id !== id);
      await persist(next);
    },
    [items, persist]
  );

  const clear = useCallback(async () => {
    await persist([]);
  }, [persist]);

  const bootstrap = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const stored = await loadCart();
      setItems(stored);
    } catch (e: any) {
      setErr(e?.message ?? "Error cargando carrito.");
    } finally {
      setLoading(false);
    }
  }, []);

  async function fetchProductForCart(productId: string): Promise<CartItem | null> {
    // Público: solo PUBLISHED + is_active=true (coherente con catálogo/producto)
    const { data, error } = await supabase
      .from("products")
      .select("id,title,description,price_eur,status,is_active,category:categories(id,name,slug)")
      .eq("id", productId)
      .eq("is_active", true)
      .eq("status", "PUBLISHED")
      .maybeSingle<ProductRow>();

    if (error) throw error;
    if (!data) return null;

    const title = data.title;
    const price = Number(data.price_eur ?? 0);

    const subtitleParts: string[] = [];
    if (data.category?.name) subtitleParts.push(data.category.name);
    subtitleParts.push("Revisado");
    if (subtitleParts.length === 0 && data.description) subtitleParts.push(data.description);

    return {
      id: data.id,
      title,
      subtitle: subtitleParts.join(" · "),
      priceEUR: price,
      qty: 1,
    };
  }

  const addToCartById = useCallback(
    async (productId: string) => {
      if (!productId) return;

      // evita dobles adds por re-render/navigation
      if (lastAddRef.current === productId) return;
      lastAddRef.current = productId;

      setAdding(true);
      setErr(null);

      try {
        // Si ya existe, incrementa qty sin consultar DB (más rápido)
        const existing = items.find((it) => it.id === productId);
        if (existing) {
          const next = items.map((it) =>
            it.id === productId ? { ...it, qty: it.qty + 1 } : it
          );
          await persist(next);
          return;
        }

        // Si no existe, trae datos del producto (title/price)
        const fetched = await fetchProductForCart(productId);
        if (!fetched) {
          setErr("Ese producto no está disponible (o no está publicado).");
          return;
        }

        const next = [fetched, ...items];
        await persist(next);
      } catch (e: any) {
        setErr(e?.message ?? "No se pudo añadir al carrito.");
      } finally {
        setAdding(false);
      }
    },
    [items, persist]
  );

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    // Si vienes desde /producto/[id] con ?add=...
    if (!addId) return;
    addToCartById(addId);
  }, [addId, addToCartById]);

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
            <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "900" }}>
              Carrito
            </Text>
            <Text style={{ color: COLORS.muted, marginTop: 4 }}>
              Total rápido, sin drama. Checkout en 1 clic (en breve).
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

        {err ? (
          <View
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "rgba(255,59,48,0.35)",
              backgroundColor: "rgba(255,59,48,0.12)",
              padding: 10,
            }}
          >
            <Text style={{ color: "#FCA5A5", fontWeight: "900" }}>Ojo:</Text>
            <Text style={{ color: "#FEE2E2", marginTop: 4 }}>{err}</Text>
          </View>
        ) : null}

        {adding ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ActivityIndicator />
            <Text style={{ color: COLORS.muted }}>Añadiendo al carrito…</Text>
          </View>
        ) : null}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator />
          <Text style={{ color: COLORS.muted }}>Cargando carrito…</Text>
        </View>
      ) : (
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
                Vuelve al catálogo y añade algo que te mole. Aquí solo entran productos reales. 😄
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
                    gap: 10,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: "900" }}>
                        {it.title}
                      </Text>
                      {it.subtitle ? (
                        <Text style={{ color: COLORS.muted, marginTop: 6 }}>{it.subtitle}</Text>
                      ) : null}

                      <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 8, fontSize: 12 }}>
                        ID: {it.id}
                      </Text>
                    </View>

                    <Text style={{ color: COLORS.gold, fontSize: 16, fontWeight: "900" }}>
                      {fmtEUR(it.priceEUR * it.qty)}
                    </Text>
                  </View>

                  {/* Controls */}
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Pressable
                        onPress={() => dec(it.id)}
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.88 : 1,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: "rgba(255,255,255,0.14)",
                          backgroundColor: "rgba(255,255,255,0.06)",
                          paddingVertical: 10,
                          paddingHorizontal: 14,
                        })}
                      >
                        <Text style={{ color: COLORS.text, fontWeight: "900" }}>−</Text>
                      </Pressable>

                      <View
                        style={{
                          minWidth: 46,
                          alignItems: "center",
                          justifyContent: "center",
                          paddingVertical: 10,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: "rgba(255,255,255,0.10)",
                          backgroundColor: "rgba(0,0,0,0.12)",
                        }}
                      >
                        <Text style={{ color: COLORS.text, fontWeight: "900" }}>{it.qty}</Text>
                      </View>

                      <Pressable
                        onPress={() => inc(it.id)}
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.88 : 1,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: COLORS.accentBorder,
                          backgroundColor: COLORS.accent2,
                          paddingVertical: 10,
                          paddingHorizontal: 14,
                        })}
                      >
                        <Text style={{ color: COLORS.text, fontWeight: "900" }}>+</Text>
                      </Pressable>
                    </View>

                    <Pressable
                      onPress={() => remove(it.id)}
                      style={({ pressed }) => ({
                        opacity: pressed ? 0.88 : 1,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: "rgba(255,59,48,0.35)",
                        backgroundColor: "rgba(255,59,48,0.12)",
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                      })}
                    >
                      <Text style={{ color: "#FCA5A5", fontWeight: "900" }}>🗑️ Quitar</Text>
                    </Pressable>
                  </View>
                </View>
              ))}

              <Pressable
                onPress={clear}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.88 : 1,
                  alignSelf: "flex-start",
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.14)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                })}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Vaciar carrito</Text>
              </Pressable>
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
              onPress={() => router.push("/checkout")}
              style={({ pressed }) => ({
                marginTop: 8,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: "center",
                backgroundColor: items.length === 0 ? "rgba(0,170,228,0.20)" : COLORS.accent,
                opacity: items.length === 0 ? 0.45 : pressed ? 0.88 : 1,
              })}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
                Ir a pagar
              </Text>
            </Pressable>

            {/* ✅ SIEMPRE a Inicio */}
            <Pressable onPress={() => router.replace("/")} style={{ alignItems: "center", paddingVertical: 10 }}>
              <Text style={{ color: COLORS.text, fontWeight: "800" }}>← Seguir comprando</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
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
