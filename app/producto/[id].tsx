// app/producto/[id].tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "../../lib/supabase";

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
  danger: "#FF3B30",
};

type DbStatus = "DRAFT" | "PUBLISHED" | "REVIEW";
type UiStatus = "PUBLICADA" | "LISTA" | "REVISAR";

type Category = { id: string; name: string; slug: string };

type ProductRowBase = {
  id: string;
  title: string;
  description: string | null;
  price_eur: number | null;
  status: DbStatus;
  is_active: boolean;
  category_id: string | null;
  updated_at: string;
  created_at: string;
  category?: Category | null;
};

type Product = {
  id: string;
  title: string;
  description: string | null;
  priceEUR: number;
  status: UiStatus;
  isActive: boolean;
  imageUrl: string | null;
  category?: Category | null;
};

function fmtEUR(n: number) {
  const safe = Number.isFinite(n) ? n : 0;
  return `${Math.round(safe)}€`;
}

function mapDbStatusToUi(s: DbStatus): UiStatus {
  if (s === "PUBLISHED") return "PUBLICADA";
  if (s === "DRAFT") return "LISTA";
  return "REVISAR";
}

function statusLabel(s: UiStatus) {
  if (s === "PUBLICADA") return "Publicada";
  if (s === "LISTA") return "Lista";
  return "Por revisar";
}

function statusColor(s: UiStatus) {
  if (s === "PUBLICADA") return "rgba(34,197,94,0.18)";
  if (s === "LISTA") return "rgba(242,194,0,0.18)";
  return "rgba(255,45,85,0.18)";
}

function statusBorder(s: UiStatus) {
  if (s === "PUBLICADA") return "rgba(34,197,94,0.35)";
  if (s === "LISTA") return "rgba(242,194,0,0.35)";
  return "rgba(255,45,85,0.35)";
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

/**
 * ✅ BACK “a prueba de balas”
 * - Si hay stack: back()
 * - Si entraste por URL directa/refresh: vuelve al Home "/"
 */
function smartBack() {
  try {
    if (typeof (router as any).canGoBack === "function" && (router as any).canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // no-op
  }
  router.replace("/");
}

const BRAND = {
  whatsappPhoneE164: "+34627748741",
};

function openWhatsApp(prefill: string) {
  const phone = BRAND.whatsappPhoneE164.replace(/[^\d+]/g, "");
  const text = encodeURIComponent((prefill ?? "").trim().slice(0, 400));
  const url = `https://wa.me/${phone.replace("+", "")}?text=${text}`;

  Linking.openURL(url).catch(() => {
    Linking.openURL(`https://api.whatsapp.com/send?phone=${phone.replace("+", "")}&text=${text}`);
  });
}

async function detectAdmin(): Promise<boolean> {
  try {
    const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) throw sessErr;

    const userId = sessionData.session?.user?.id;
    if (!userId) return false;

    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle<{ role: string | null }>();

    if (error) throw error;
    return (data?.role ?? "") === "admin";
  } catch {
    return false;
  }
}

function firstImageFromAnyRow(row: any): string | null {
  // Prefer: products.images (array) -> image_url (string) -> null
  const imgs = row?.images;
  if (Array.isArray(imgs) && imgs.length > 0 && typeof imgs[0] === "string") return imgs[0];
  const url = row?.image_url;
  if (typeof url === "string" && url.trim()) return url.trim();
  return null;
}

export default function ProductoScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const productId = typeof params.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [p, setP] = useState<Product | null>(null);

  // evita setState tardío si cambias de ruta rápido
  const reqSeqRef = useRef(0);

  const canBuy = useMemo(() => {
    if (!p) return false;
    if (!isAdmin) return p.status === "PUBLICADA" && p.isActive;
    return true;
  }, [p, isAdmin]);

  const whatsappText = useMemo(() => {
    const title = p?.title ? `Producto: ${p.title}` : `Producto ID: ${productId}`;
    const price = p?.priceEUR ? `Precio: ${fmtEUR(p.priceEUR)}` : "";
    return `Hola! Vengo desde Videojuegoos.com.\n\n${title}\n${price}\n\n¿Está disponible?`;
  }, [p?.title, p?.priceEUR, productId]);

  async function loadProduct() {
    const seq = ++reqSeqRef.current;

    if (!productId) {
      setErr("Falta el id del producto.");
      setP(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const adminFlag = await detectAdmin();
      if (seq !== reqSeqRef.current) return;
      setIsAdmin(adminFlag);

      // Intento 1: con images (recomendado si tu tabla products tiene `images text[]`)
      const selectWithImages =
        "id,title,description,price_eur,status,is_active,category_id,images,updated_at,created_at,category:categories(id,name,slug)";
      const selectBase =
        "id,title,description,price_eur,status,is_active,category_id,updated_at,created_at,category:categories(id,name,slug)";

      let data: any = null;

      const tryQuery = async (selectStr: string) => {
        let q = supabase.from("products").select(selectStr).eq("id", productId);

        if (!adminFlag) {
          q = q.eq("is_active", true).eq("status", "PUBLISHED");
        }

        const res = await q.maybeSingle();
        return res;
      };

      const res1 = await tryQuery(selectWithImages);
      if (res1.error) {
        // Si falla por columna no existente (images o join), fallback al select base
        const msg = String(res1.error.message ?? "");
        const looksLikeMissingColumn =
          msg.includes("column") || msg.includes("does not exist") || msg.includes("schema cache");
        if (!looksLikeMissingColumn) throw res1.error;

        const res2 = await tryQuery(selectBase);
        if (res2.error) throw res2.error;
        data = res2.data;
      } else {
        data = res1.data;
      }

      if (seq !== reqSeqRef.current) return;

      if (!data) {
        setP(null);
        setErr("Producto no encontrado o no disponible.");
        return;
      }

      const mapped: Product = {
        id: data.id,
        title: data.title,
        description: data.description ?? null,
        priceEUR: Number(data.price_eur ?? 0),
        status: mapDbStatusToUi(data.status as DbStatus),
        isActive: Boolean(data.is_active),
        imageUrl: firstImageFromAnyRow(data),
        category: data.category ?? null,
      };

      setP(mapped);
    } catch (e: any) {
      if (seq !== reqSeqRef.current) return;
      setErr(e?.message ?? "Error cargando el producto.");
      setP(null);
    } finally {
      if (seq !== reqSeqRef.current) return;
      setLoading(false);
    }
  }

  // ✅ recarga si cambias de /producto/[id] a otro id
  useEffect(() => {
    loadProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

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
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "900" }} numberOfLines={1}>
              {p?.title ?? "Producto"}
            </Text>

            <Text style={{ color: COLORS.muted, marginTop: 4 }}>
              {p?.category?.name ? `Categoría: ${p.category.name}` : "Ficha del producto"}
              {isAdmin ? " · (admin)" : ""}
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={() => router.push("/carrito")}
              style={({ pressed }) => ({
                opacity: pressed ? 0.88 : 1,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(0,170,228,0.35)",
                backgroundColor: "rgba(0,170,228,0.14)",
              })}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>🛒</Text>
            </Pressable>

            <Pressable
              onPress={smartBack}
              style={({ pressed }) => ({
                opacity: pressed ? 0.88 : 1,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: "rgba(255,255,255,0.05)",
              })}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>←</Text>
            </Pressable>
          </View>
        </View>

        {/* Breadcrumbs */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <Pressable onPress={() => router.replace("/")} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
            <Text style={{ color: "rgba(255,255,255,0.80)", fontWeight: "800" }}>Inicio</Text>
          </Pressable>
          <Text style={{ color: "rgba(255,255,255,0.45)" }}>›</Text>
          <Pressable
            onPress={() => router.replace("/catalogo")}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <Text style={{ color: "rgba(255,255,255,0.80)", fontWeight: "800" }}>Catálogo</Text>
          </Pressable>
          <Text style={{ color: "rgba(255,255,255,0.45)" }}>›</Text>
          <Text style={{ color: COLORS.text, fontWeight: "900" }} numberOfLines={1}>
            {p?.title ?? "Producto"}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator />
          <Text style={{ color: COLORS.muted }}>Cargando producto…</Text>
        </View>
      ) : err ? (
        <View style={{ padding: 16, gap: 12 }}>
          <View
            style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: "rgba(255,59,48,0.35)",
              backgroundColor: "rgba(255,59,48,0.12)",
              padding: 14,
              gap: 6,
            }}
          >
            <Text style={{ color: "#FCA5A5", fontWeight: "900" }}>Error</Text>
            <Text style={{ color: "#FEE2E2" }}>{err}</Text>
          </View>

          <Pressable
            onPress={loadProduct}
            style={({ pressed }) => ({
              opacity: pressed ? 0.88 : 1,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: COLORS.accentBorder,
              backgroundColor: COLORS.accent2,
              paddingVertical: 14,
              paddingHorizontal: 16,
              alignSelf: "flex-start",
            })}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>Reintentar</Text>
          </Pressable>

          <Pressable
            onPress={() => router.replace("/catalogo")}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <Text style={{ color: "rgba(255,255,255,0.75)", fontWeight: "800" }}>← Volver al catálogo</Text>
          </Pressable>
        </View>
      ) : !p ? (
        <View style={{ padding: 16, gap: 10 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>Producto no disponible</Text>
          <Pressable
            onPress={() => router.replace("/catalogo")}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <Text style={{ color: "rgba(255,255,255,0.75)", fontWeight: "800" }}>← Volver al catálogo</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 12 }}>
            {/* Imagen / placeholder */}
            <View
              style={{
                borderRadius: 22,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.04)",
                overflow: "hidden",
                ...softShadow(),
              }}
            >
              {p.imageUrl ? (
                <Image
                  source={{ uri: p.imageUrl }}
                  style={{ width: "100%", height: 240, backgroundColor: "rgba(255,255,255,0.04)" }}
                  resizeMode="cover"
                />
              ) : (
                <View style={{ height: 220, alignItems: "center", justifyContent: "center", padding: 16 }}>
                  <Text style={{ fontSize: 32 }}>🎮</Text>
                  <Text style={{ color: COLORS.text, fontWeight: "900", marginTop: 8 }}>Imagen pendiente</Text>
                  <Text style={{ color: COLORS.muted, marginTop: 4, textAlign: "center" }}>
                    Añade una imagen para que esto convierta de verdad.
                  </Text>
                </View>
              )}
            </View>

            {/* Título + precio + estado */}
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
              <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "900" }}>{p.title}</Text>

              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                <View
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    backgroundColor: statusColor(p.status),
                    borderWidth: 1,
                    borderColor: statusBorder(p.status),
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 12 }}>{statusLabel(p.status)}</Text>
                </View>

                <Text style={{ color: COLORS.muted, fontSize: 12 }}>Segunda mano · Revisado</Text>

                {p.category?.name ? (
                  <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>· {p.category.name}</Text>
                ) : null}
              </View>

              <Text style={{ color: COLORS.accent, fontSize: 22, fontWeight: "900" }}>{fmtEUR(p.priceEUR)}</Text>

              {p.description ? (
                <Text style={{ color: COLORS.muted, lineHeight: 20 }}>{p.description}</Text>
              ) : (
                <Text style={{ color: "rgba(255,255,255,0.60)", lineHeight: 20 }}>
                  Descripción pendiente. (Spoiler: sin descripción se vende menos.)
                </Text>
              )}
            </View>

            {/* Confianza / detalles rápidos */}
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
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>Lo importante</Text>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                <Pill icon="✅" text="Garantía" />
                <Pill icon="🚚" text="Envío España" />
                <Pill icon="🧾" text="Recibo" />
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
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Disponibilidad</Text>
                <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 20 }}>
                  Si tienes dudas, te lo confirmo por WhatsApp en 1 minuto.
                </Text>

                <Pressable
                  onPress={() => openWhatsApp(whatsappText)}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.88 : 1,
                    marginTop: 10,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.14)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    alignSelf: "flex-start",
                  })}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>📲 Preguntar por WhatsApp</Text>
                </Pressable>
              </View>
            </View>

            <Pressable
              onPress={() => router.replace("/catalogo")}
              style={({ pressed }) => ({
                opacity: pressed ? 0.85 : 1,
                alignSelf: "center",
                paddingVertical: 10,
                paddingHorizontal: 14,
              })}
            >
              <Text style={{ color: "rgba(255,255,255,0.75)", fontWeight: "800" }}>← Volver al catálogo</Text>
            </Pressable>
          </ScrollView>

          {/* Bottom Bar (CTA) */}
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: 14,
              backgroundColor: "rgba(6,26,44,0.92)",
              borderTopWidth: 1,
              borderTopColor: "rgba(255,255,255,0.10)",
            }}
          >
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                disabled={!canBuy}
                onPress={() => router.push({ pathname: "/carrito", params: { add: p.id } })}
                style={({ pressed }) => ({
                  flex: 1,
                  opacity: !canBuy ? 0.45 : pressed ? 0.88 : 1,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: COLORS.accentBorder,
                  backgroundColor: COLORS.accent2,
                  paddingVertical: 14,
                  alignItems: "center",
                  justifyContent: "center",
                })}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Añadir al carrito</Text>
              </Pressable>

              <Pressable
                onPress={() => router.push("/checkout")}
                style={({ pressed }) => ({
                  flex: 1,
                  opacity: pressed ? 0.88 : 1,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.14)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  paddingVertical: 14,
                  alignItems: "center",
                  justifyContent: "center",
                })}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Checkout</Text>
              </Pressable>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

function Pill({ icon, text }: { icon?: string; text: string }) {
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
