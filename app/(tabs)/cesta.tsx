/**
 * app/(tabs)/cesta.tsx
 *
 * Qué hace: pantalla de la cesta de la compra. Guarda los artículos en el
 * dispositivo (AsyncStorage) para que sobrevivan a cerrar la app, permite
 * subir/bajar cantidad, quitar artículos y calcula el total.
 *
 * Cómo funciona: usa la misma clave CART_KEY = "videojuegoos_cart_v1" que
 * lee app/checkout.tsx. Si llegas aquí con el parámetro ?add=<id> (por
 * ejemplo desde la ficha de producto), addToCartById() busca ese producto
 * en Supabase y lo añade automáticamente.
 *
 * Conectado con:
 * - app/producto/[id].tsx → botón "Añadir a la cesta" (navega aquí con
 *   ?add=<id>).
 * - app/checkout.tsx → botón "Ir a pagar".
 * - lib/supabase.ts → tabla products, para completar los datos del
 *   artículo añadido.
 * - components/PromoBanner.tsx → franja "Te compramos tu consola..." fija
 *   arriba del todo (misma franja que en el resto de pestañas).
 * - components/VenderAhoraModal.tsx → formulario que abre el botón "Vender
 *   Ya" de esa franja.
 */
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Href } from "expo-router";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  View,
} from "react-native";
import PromoBanner from "../../components/PromoBanner";
import VenderAhoraModal from "../../components/VenderAhoraModal";
import { supabase } from "../../lib/supabase";

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  cardSoft: "#F8FBFE",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  mutedSoft: "rgba(11,33,56,0.48)",
  accent: "#1EA7E8",
  gold: "#B8860B",
  danger: "#DC2626",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  success: "#15803D",
  successBg: "#DCFCE7",
  successBorder: "#86EFAC",
  gamingGlow: "#1EA7E8",
};

function softShadow() {
  return Platform.select<any>({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.24,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 3 },
    default: {},
  });
}

// Envoltorio de Pressable con una pequeña animación "pop" al pulsar (mismo
// patrón que app/(tabs)/perfil.tsx y components/VenderAhoraModal.tsx): se
// encoge levemente y vuelve a su tamaño con un muelle.
function AnimatedPressable({
  onPress,
  disabled,
  style,
  children,
}: {
  onPress?: () => void;
  disabled?: boolean;
  style?: any;
  children?: React.ReactNode;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  function onPressIn() {
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 50,
      bounciness: 6,
    }).start();
  }

  function onPressOut() {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 6,
    }).start();
  }

  return (
    <Pressable onPress={onPress} disabled={disabled} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

// Botón de acción principal/secundario, mismo estilo que app/(tabs)/perfil.tsx
// (fondo azul sólido con texto blanco en "primary", fondo suave con borde en
// "secondary"), para que la cesta se sienta parte de la misma app.
function ActionButton({
  title,
  onPress,
  disabled,
  variant = "primary",
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  const isPrimary = variant === "primary";

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      style={{
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 14,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: isPrimary ? 0 : 1,
        borderColor: isPrimary ? "transparent" : COLORS.border,
        backgroundColor: isPrimary ? COLORS.accent : COLORS.cardSoft,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text
        style={{
          color: isPrimary ? "#FFFFFF" : COLORS.text,
          fontWeight: "900",
          fontSize: 15,
        }}
      >
        {title}
      </Text>
    </AnimatedPressable>
  );
}

// Insignia pequeña en píldora, mismo componente que app/(tabs)/perfil.tsx:
// se usa para el contador de artículos y para destacar "Envío gratis".
function Badge({
  text,
  tone = "default",
}: {
  text: string;
  tone?: "default" | "accent" | "success";
}) {
  const toneStyles =
    tone === "accent"
      ? { bg: COLORS.accent2, border: COLORS.accentBorder, color: COLORS.text }
      : tone === "success"
      ? { bg: COLORS.successBg, border: COLORS.successBorder, color: COLORS.success }
      : { bg: "#F6FAFD", border: COLORS.border, color: COLORS.text };

  return (
    <View
      style={{
        alignSelf: "center",
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: toneStyles.border,
        backgroundColor: toneStyles.bg,
      }}
    >
      <Text style={{ color: toneStyles.color, fontWeight: "900", fontSize: 12 }}>{text}</Text>
    </View>
  );
}

type CartItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  priceEUR: number;
  qty: number;
};

type DbStatus = "DRAFT" | "PUBLISHED" | "REVIEW";

type ProductCategoryLite = {
  id?: string | null;
  name?: string | null;
  slug?: string | null;
};

type ProductRow = {
  id: string;
  title: string;
  description: string | null;
  price_eur: number | null;
  status: DbStatus;
  is_active: boolean;
  category?: ProductCategoryLite | null;
};

const CART_KEY = "videojuegoos_cart_v1";

function pushRoute(route: Href) {
  router.push(route);
}

function replaceRoute(route: Href) {
  router.replace(route);
}

function fmtEUR(n: number) {
  const safe = Number.isFinite(n) ? n : 0;
  return `${Math.round(safe)}€`;
}

function safeInt(n: unknown, fallback = 1) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(0, Math.floor(x));
}

function asCartItem(value: unknown): CartItem | null {
  if (!value || typeof value !== "object") return null;

  const row = value as Record<string, unknown>;
  const id = String(row.id ?? "").trim();
  const title = String(row.title ?? "").trim();
  const qty = safeInt(row.qty, 1);

  if (!id || !title || qty <= 0) return null;

  return {
    id,
    title,
    subtitle: typeof row.subtitle === "string" ? row.subtitle : null,
    priceEUR: Number(row.priceEUR ?? 0),
    qty,
  };
}

function asProductRow(value: unknown): ProductRow | null {
  if (!value || typeof value !== "object") return null;

  const row = value as Record<string, unknown>;
  const id = String(row.id ?? "").trim();
  const title = String(row.title ?? "").trim();

  if (!id || !title) return null;

  return {
    id,
    title,
    description: typeof row.description === "string" ? row.description : null,
    price_eur:
      typeof row.price_eur === "number" || typeof row.price_eur === "string"
        ? Number(row.price_eur)
        : null,
    status:
      row.status === "DRAFT" || row.status === "PUBLISHED" || row.status === "REVIEW"
        ? row.status
        : "DRAFT",
    is_active: Boolean(row.is_active),
    category:
      row.category && typeof row.category === "object"
        ? {
            id: typeof (row.category as Record<string, unknown>).id === "string"
              ? ((row.category as Record<string, unknown>).id as string)
              : null,
            name: typeof (row.category as Record<string, unknown>).name === "string"
              ? ((row.category as Record<string, unknown>).name as string)
              : null,
            slug: typeof (row.category as Record<string, unknown>).slug === "string"
              ? ((row.category as Record<string, unknown>).slug as string)
              : null,
          }
        : null,
  };
}

function isMissingColumnError(error: unknown, columnName: string) {
  const msg = String((error as { message?: string } | null)?.message ?? "").toLowerCase();
  const col = columnName.toLowerCase();

  return (
    msg.includes(col) &&
    (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("column"))
  );
}

function isMissingRelationError(error: unknown, relationName: string) {
  const msg = String((error as { message?: string } | null)?.message ?? "").toLowerCase();
  const rel = relationName.toLowerCase();

  return (
    msg.includes(rel) &&
    (msg.includes("does not exist") ||
      msg.includes("relation") ||
      msg.includes("could not find the table"))
  );
}

async function loadCart(): Promise<CartItem[]> {
  try {
    const raw = await AsyncStorage.getItem(CART_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(asCartItem)
      .filter((item): item is CartItem => Boolean(item));
  } catch {
    return [];
  }
}

async function saveCart(items: CartItem[]) {
  try {
    await AsyncStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {
    // no-op
  }
}

async function fetchProductForCart(productId: string): Promise<CartItem | null> {
  const selectWithJoin =
    "id,title,description,price_eur,status,is_active,category:categories(id,name,slug)";
  const selectBase = "id,title,description,price_eur,status,is_active";

  const buildQuery = (selectStr: string) =>
    supabase
      .from("products")
      .select(selectStr)
      .eq("id", productId)
      .eq("is_active", true)
      .eq("status", "PUBLISHED")
      .maybeSingle();

  let product: ProductRow | null = null;

  const withJoinRes = await buildQuery(selectWithJoin);

  if (!withJoinRes.error) {
    product = asProductRow(withJoinRes.data);
  } else {
    const canFallback =
      isMissingRelationError(withJoinRes.error, "categories") ||
      isMissingColumnError(withJoinRes.error, "name") ||
      isMissingColumnError(withJoinRes.error, "slug");

    if (!canFallback) {
      throw withJoinRes.error;
    }

    const baseRes = await buildQuery(selectBase);
    if (baseRes.error) throw baseRes.error;
    product = asProductRow(baseRes.data);
  }

  if (!product) return null;

  const subtitleParts: string[] = [];
  if (product.category?.name) subtitleParts.push(product.category.name);
  subtitleParts.push("Revisado");

  if (!subtitleParts.length && product.description) {
    subtitleParts.push(product.description);
  }

  return {
    id: product.id,
    title: product.title,
    subtitle: subtitleParts.join(" · "),
    priceEUR: Number(product.price_eur ?? 0),
    qty: 1,
  };
}

export default function CestaScreen() {
  const params = useLocalSearchParams<{ add?: string }>();
  const addId = typeof params.add === "string" ? params.add.trim() : "";

  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [sellModalOpen, setSellModalOpen] = useState(false);

  const bootedRef = useRef(false);
  const lastAddRef = useRef<string>("");

  const subtotal = useMemo(
    () => items.reduce((acc, it) => acc + it.priceEUR * it.qty, 0),
    [items]
  );

  const shipping = 0;
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
      const next = items.map((it) =>
        it.id === id ? { ...it, qty: Math.max(1, it.qty - 1) } : it
      );
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
      console.error("Error cargando la cesta:", e);
      setErr("No hemos podido cargar tu cesta. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  const addToCartById = useCallback(
    async (productId: string) => {
      if (!productId) return;
      if (lastAddRef.current === productId) return;

      lastAddRef.current = productId;
      setAdding(true);
      setErr(null);

      try {
        const existing = items.find((it) => it.id === productId);

        if (existing) {
          const next = items.map((it) =>
            it.id === productId ? { ...it, qty: it.qty + 1 } : it
          );
          await persist(next);
          return;
        }

        const fetched = await fetchProductForCart(productId);

        if (!fetched) {
          setErr("Ese producto no está disponible en este momento.");
          return;
        }

        const next = [fetched, ...items];
        await persist(next);
      } catch (e: any) {
        console.error("Error añadiendo producto a la cesta:", e);
        setErr("No se pudo añadir el producto a la cesta. Inténtalo de nuevo.");
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
    if (!addId) return;
    addToCartById(addId);
  }, [addId, addToCartById]);

  return (
    <>
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      <PromoBanner onPressVender={() => setSellModalOpen(true)} />

      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: "#F6FAFD",
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 12,
          alignItems: "center",
        }}
      >
        {/* Columna centrada: no se pega a la izquierda en pantallas anchas */}
        <View style={{ width: "100%", maxWidth: 640, gap: 10 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <View style={{ flex: 1, paddingRight: 8, gap: 8 }}>
            <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "900", textAlign: "center" }}>
              Cesta
            </Text>
            <Text style={{ color: COLORS.muted, lineHeight: 21, textAlign: "center" }}>
              Tus productos listos para cerrar la compra, de forma clara y sencilla.
            </Text>
            {!loading && items.length > 0 ? (
              <Badge
                text={`${items.length} ${items.length === 1 ? "artículo" : "artículos"}`}
                tone="accent"
              />
            ) : null}
          </View>
        </View>

        {!!err && (
          <View
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#F5B5B5",
              backgroundColor: "#FDECEC",
              padding: 10,
            }}
          >
            <Text style={{ color: "#B91C1C", fontWeight: "900", textAlign: "center" }}>Atención</Text>
            <Text style={{ color: "#7A271A", marginTop: 4, textAlign: "center" }}>{err}</Text>
          </View>
        )}

        {adding ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <ActivityIndicator />
            <Text style={{ color: COLORS.muted }}>Añadiendo producto a la cesta…</Text>
          </View>
        ) : null}
        </View>
      </View>

      {loading ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            paddingHorizontal: 24,
          }}
        >
          <ActivityIndicator />
          <Text style={{ color: COLORS.muted }}>Cargando cesta…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 28,
            alignItems: "center",
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ width: "100%", maxWidth: 640, gap: 12 }}>
          {items.length === 0 ? (
            <View
              style={{
                borderRadius: 24,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.card,
                padding: 24,
                gap: 12,
                alignItems: "center",
                ...softShadow(),
              }}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: COLORS.accent2,
                  borderWidth: 1,
                  borderColor: COLORS.accentBorder,
                }}
              >
                <Ionicons name="cart-outline" size={26} color={COLORS.accent} />
              </View>

              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18, textAlign: "center" }}>
                Tu cesta está vacía
              </Text>

              <Text style={{ color: COLORS.muted, lineHeight: 22, textAlign: "center" }}>
                Aún no has añadido nada. Vuelve al catálogo y elige tu próximo producto.
              </Text>

              <View style={{ marginTop: 6, width: "100%", maxWidth: 260 }}>
                <ActionButton title="Ir al catálogo" onPress={() => pushRoute("/catalogo" as Href)} />
              </View>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {items.map((it) => (
                <View
                  key={it.id}
                  style={{
                    borderRadius: 24,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: COLORS.card,
                    padding: 16,
                    gap: 12,
                    ...softShadow(),
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: "900" }}>
                        {it.title}
                      </Text>

                      {it.subtitle ? (
                        <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 20 }}>
                          {it.subtitle}
                        </Text>
                      ) : null}
                    </View>

                    <Text style={{ color: COLORS.gold, fontSize: 16, fontWeight: "900" }}>
                      {fmtEUR(it.priceEUR * it.qty)}
                    </Text>
                  </View>

                  {/*
                    Mismo patrón que la cesta de Amazon: un único control de
                    cantidad donde el botón de la izquierda hace de "quitar"
                    cuando queda 1 unidad (icono de papelera) y de "restar"
                    cuando hay más de 1 (icono de menos) — así no hace falta
                    un botón "Quitar" aparte en otro sitio.
                  */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <AnimatedPressable
                      onPress={() => (it.qty <= 1 ? remove(it.id) : dec(it.id))}
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: 1,
                        borderColor: it.qty <= 1 ? "#F5B5B5" : "#E3EAF2",
                        backgroundColor: it.qty <= 1 ? "#FDECEC" : "#F6FAFD",
                      }}
                    >
                      <Ionicons
                        name={it.qty <= 1 ? "trash-outline" : "remove-outline"}
                        size={18}
                        color={it.qty <= 1 ? "#B91C1C" : COLORS.text}
                      />
                    </AnimatedPressable>

                    <View
                      style={{
                        minWidth: 40,
                        alignItems: "center",
                        justifyContent: "center",
                        paddingVertical: 9,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: "#E3EAF2",
                        backgroundColor: "#F4F9FD",
                      }}
                    >
                      <Text style={{ color: COLORS.text, fontWeight: "900" }}>{it.qty}</Text>
                    </View>

                    <AnimatedPressable
                      onPress={() => inc(it.id)}
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: 1,
                        borderColor: COLORS.accentBorder,
                        backgroundColor: COLORS.accent2,
                      }}
                    >
                      <Ionicons name="add-outline" size={18} color={COLORS.text} />
                    </AnimatedPressable>
                  </View>
                </View>
              ))}

              <AnimatedPressable
                onPress={clear}
                style={{
                  alignSelf: "flex-start",
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "#E3EAF2",
                  backgroundColor: "#F6FAFD",
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                }}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Vaciar cesta</Text>
              </AnimatedPressable>
            </View>
          )}

          <View
            style={{
              borderRadius: 24,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.cardSoft,
              padding: 18,
              gap: 12,
              ...softShadow(),
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
              Resumen del pedido
            </Text>

            <Row label="Subtotal" value={fmtEUR(subtotal)} />
            <Row label="Envío" value={fmtEUR(shipping)} freeBadge={shipping === 0} />
            <View style={{ height: 1, backgroundColor: "#E3EAF2" }} />
            <Row label="Total" value={fmtEUR(total)} strong />

            <View style={{ marginTop: 4 }}>
              <ActionButton
                title="Ir a pagar"
                disabled={items.length === 0}
                onPress={() => pushRoute("/checkout" as Href)}
              />
            </View>

            <Pressable
              onPress={() => replaceRoute("/" as Href)}
              style={{ alignItems: "center", paddingVertical: 6 }}
            >
              <Text style={{ color: COLORS.accent, fontWeight: "800", fontSize: 13 }}>
                ← Seguir comprando
              </Text>
            </Pressable>
          </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>

    <VenderAhoraModal visible={sellModalOpen} onClose={() => setSellModalOpen(false)} />
    </>
  );
}

function Row({
  label,
  value,
  strong,
  freeBadge,
}: {
  label: string;
  value: string;
  strong?: boolean;
  freeBadge?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Text
        style={{
          color: "rgba(11,33,56,0.62)",
          fontWeight: strong ? "900" : "700",
        }}
      >
        {label}
      </Text>
      {freeBadge ? (
        <Badge text="Gratis" tone="success" />
      ) : (
        <Text style={{ color: "#0B2138", fontWeight: strong ? "900" : "800" }}>{value}</Text>
      )}
    </View>
  );
}