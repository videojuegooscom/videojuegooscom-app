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
  useWindowDimensions,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "../../lib/supabase";

const COLORS = {
  bg: "#071E33",
  bg2: "#061A2C",
  bg3: "#082743",
  card: "rgba(255,255,255,0.06)",
  cardStrong: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.12)",
  borderSoft: "rgba(255,255,255,0.08)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.76)",
  muted2: "rgba(255,255,255,0.58)",
  accent: "#00AAE4",
  accent2: "rgba(0,170,228,0.16)",
  accentBorder: "rgba(0,170,228,0.45)",
};

type DbStatus = "DRAFT" | "PUBLISHED" | "REVIEW";
type UiStatus = "PUBLICADA" | "LISTA" | "REVISAR";

type Category = {
  id: string;
  name: string;
  slug: string;
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

const BRAND = {
  whatsappPhoneE164: "+34627748741",
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

function publicStatusLabel(s: UiStatus) {
  if (s === "PUBLICADA") return "Disponible";
  if (s === "LISTA") return "En preparación";
  return "Por revisar";
}

function adminStatusLabel(s: UiStatus) {
  if (s === "PUBLICADA") return "Publicada";
  if (s === "LISTA") return "Lista";
  return "Por revisar";
}

function statusBg(s: UiStatus) {
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

function smartBack() {
  try {
    if (typeof (router as any).canGoBack === "function" && (router as any).canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // no-op
  }
  router.replace("/catalogo");
}

function openWhatsApp(prefill: string) {
  const phone = BRAND.whatsappPhoneE164.replace(/[^\d+]/g, "");
  const text = encodeURIComponent((prefill ?? "").trim().slice(0, 500));
  const url = `https://wa.me/${phone.replace("+", "")}?text=${text}`;

  Linking.openURL(url).catch(() => {
    Linking.openURL(
      `https://api.whatsapp.com/send?phone=${phone.replace("+", "")}&text=${text}`
    );
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
  const imgs = row?.images;

  if (Array.isArray(imgs) && imgs.length > 0) {
    const first = imgs.find((v: unknown) => typeof v === "string" && v.trim());
    if (typeof first === "string" && first.trim()) return first.trim();
  }

  const url = row?.image_url;
  if (typeof url === "string" && url.trim()) return url.trim();

  return null;
}

function productTrustCopy(hasDescription: boolean) {
  if (hasDescription) {
    return "Producto presentado con información clara, contacto directo y enfoque real de venta.";
  }
  return "Ficha limpia, contacto rápido y soporte directo si necesitas confirmar cualquier detalle.";
}

function productHintByCategory(name?: string | null) {
  if (!name) return "Segunda mano revisada";
  const n = name.toLowerCase();

  if (n.includes("playstation 5") || n.includes("ps5")) return "Consola o accesorio PS5";
  if (n.includes("playstation 4") || n.includes("ps4")) return "Consola o accesorio PS4";
  if (n.includes("xbox")) return "Xbox y accesorios";
  if (n.includes("switch") || n.includes("nintendo")) return "Nintendo y accesorios";
  if (n.includes("videojuego")) return "Videojuego listo para enviar";
  if (n.includes("mando") || n.includes("accesorio")) return "Accesorio listo para usar";
  if (n.includes("electr")) return "Electrónica seleccionada";
  if (n.includes("repar")) return "Servicio especializado";

  return "Producto revisado";
}

export default function ProductoScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 1080;
  const isTablet = width >= 760;

  const params = useLocalSearchParams<{ id?: string }>();
  const productId = typeof params.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [p, setP] = useState<Product | null>(null);

  const reqSeqRef = useRef(0);

  const canBuy = useMemo(() => {
    if (!p) return false;
    if (!isAdmin) return p.status === "PUBLICADA" && p.isActive;
    return true;
  }, [p, isAdmin]);

  const badgeLabel = useMemo(() => {
    if (!p) return "";
    return isAdmin ? adminStatusLabel(p.status) : publicStatusLabel(p.status);
  }, [p, isAdmin]);

  const heroSubcopy = useMemo(() => {
    if (!p) return "Ficha de producto";
    const parts: string[] = [];

    if (p.category?.name) parts.push(productHintByCategory(p.category.name));
    else parts.push("Producto de segunda mano revisado");

    if (!isAdmin && p.status === "PUBLICADA" && p.isActive) {
      parts.push("Disponible para compra");
    }

    if (isAdmin) parts.push("Vista admin");

    return parts.join(" · ");
  }, [p, isAdmin]);

  const whatsappText = useMemo(() => {
    const title = p?.title ? `Producto: ${p.title}` : `Producto ID: ${productId}`;
    const price = p?.priceEUR ? `Precio: ${fmtEUR(p.priceEUR)}` : "";
    return `Hola, vengo desde Videojuegoos.com.

${title}
${price}

¿Sigue disponible? Me interesa este producto.`;
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

      const selectWithImagesAndUrl =
        "id,title,description,price_eur,status,is_active,category_id,images,image_url,updated_at,created_at,category:categories(id,name,slug)";
      const selectWithImagesOnly =
        "id,title,description,price_eur,status,is_active,category_id,images,updated_at,created_at,category:categories(id,name,slug)";
      const selectBase =
        "id,title,description,price_eur,status,is_active,category_id,updated_at,created_at,category:categories(id,name,slug)";

      const runQuery = async (selectStr: string) => {
        let q = supabase.from("products").select(selectStr).eq("id", productId);

        if (!adminFlag) {
          q = q.eq("is_active", true).eq("status", "PUBLISHED");
        }

        return q.maybeSingle();
      };

      let data: any = null;

      const res1 = await runQuery(selectWithImagesAndUrl);

      if (res1.error) {
        const msg1 = String(res1.error.message ?? "").toLowerCase();

        const missingImageUrl =
          msg1.includes("image_url") &&
          (msg1.includes("does not exist") || msg1.includes("schema cache") || msg1.includes("column"));

        if (!missingImageUrl) {
          throw res1.error;
        }

        const res2 = await runQuery(selectWithImagesOnly);

        if (res2.error) {
          const msg2 = String(res2.error.message ?? "").toLowerCase();

          const missingImages =
            msg2.includes("images") &&
            (msg2.includes("does not exist") || msg2.includes("schema cache") || msg2.includes("column"));

          if (!missingImages) {
            throw res2.error;
          }

          const res3 = await runQuery(selectBase);
          if (res3.error) throw res3.error;
          data = res3.data;
        } else {
          data = res2.data;
        }
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

  useEffect(() => {
    loadProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="light-content" />

      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.06)",
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 14,
          gap: 12,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{ color: COLORS.text, fontSize: 28, fontWeight: "900", lineHeight: 32 }}
              numberOfLines={2}
            >
              {p?.title ?? "Producto"}
            </Text>

            <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 20 }}>
              {heroSubcopy}
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={() => router.push("/carrito")}
              style={({ pressed }) => ({
                opacity: pressed ? 0.88 : 1,
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: COLORS.accentBorder,
                backgroundColor: COLORS.accent2,
              })}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>🛒 Carrito</Text>
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

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
          }}
        >
          <Pressable
            onPress={() => router.replace("/")}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <Text style={{ color: "rgba(255,255,255,0.78)", fontWeight: "800" }}>Inicio</Text>
          </Pressable>

          <Text style={{ color: "rgba(255,255,255,0.42)" }}>›</Text>

          <Pressable
            onPress={() => router.replace("/catalogo")}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <Text style={{ color: "rgba(255,255,255,0.78)", fontWeight: "800" }}>Catálogo</Text>
          </Pressable>

          <Text style={{ color: "rgba(255,255,255,0.42)" }}>›</Text>

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
            <Text style={{ color: "#FEE2E2", lineHeight: 20 }}>{err}</Text>
          </View>

          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
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
              })}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>Reintentar</Text>
            </Pressable>

            <Pressable
              onPress={() => router.replace("/catalogo")}
              style={({ pressed }) => ({
                opacity: pressed ? 0.88 : 1,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: "rgba(255,255,255,0.06)",
                paddingVertical: 14,
                paddingHorizontal: 16,
              })}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>Volver al catálogo</Text>
            </Pressable>
          </View>
        </View>
      ) : !p ? (
        <View style={{ padding: 16, gap: 10 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18 }}>
            Producto no disponible
          </Text>

          <Pressable
            onPress={() => router.replace("/catalogo")}
            style={({ pressed }) => ({
              opacity: pressed ? 0.88 : 1,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: "rgba(255,255,255,0.06)",
              paddingVertical: 14,
              paddingHorizontal: 16,
              alignSelf: "flex-start",
            })}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>Volver al catálogo</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 132, gap: 14 }}>
            <View
              style={{
                flexDirection: isWide ? "row" : "column",
                gap: 14,
                alignItems: "stretch",
              }}
            >
              {/* BLOQUE IMAGEN */}
              <View
                style={{
                  flex: isWide ? 1.08 : undefined,
                  minWidth: 0,
                }}
              >
                <View
                  style={{
                    borderRadius: 24,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: COLORS.card,
                    overflow: "hidden",
                    ...softShadow(),
                  }}
                >
                  {p.imageUrl ? (
                    <Image
                      source={{ uri: p.imageUrl }}
                      style={{
                        width: "100%",
                        height: isWide ? 520 : 280,
                        backgroundColor: "rgba(255,255,255,0.04)",
                      }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View
                      style={{
                        height: isWide ? 520 : 280,
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 22,
                        backgroundColor: COLORS.bg3,
                      }}
                    >
                      <Text
                        style={{
                          color: "rgba(255,255,255,0.20)",
                          fontWeight: "900",
                          fontSize: 56,
                        }}
                      >
                        VG
                      </Text>
                      <Text
                        style={{
                          color: COLORS.text,
                          fontWeight: "900",
                          marginTop: 10,
                          fontSize: 18,
                        }}
                      >
                        Imagen no disponible
                      </Text>
                      <Text
                        style={{
                          color: COLORS.muted,
                          marginTop: 6,
                          textAlign: "center",
                          lineHeight: 20,
                          maxWidth: 380,
                        }}
                      >
                        Este producto todavía no tiene imagen publicada. La ficha sigue accesible
                        para no romper la venta por una tontería.
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* BLOQUE INFO */}
              <View
                style={{
                  flex: isWide ? 0.92 : undefined,
                  minWidth: 0,
                  gap: 14,
                }}
              >
                <View
                  style={{
                    borderRadius: 24,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: COLORS.cardStrong,
                    padding: 18,
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <View
                      style={{
                        paddingVertical: 7,
                        paddingHorizontal: 12,
                        borderRadius: 999,
                        backgroundColor: statusBg(p.status),
                        borderWidth: 1,
                        borderColor: statusBorder(p.status),
                      }}
                    >
                      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                        {badgeLabel}
                      </Text>
                    </View>

                    <View
                      style={{
                        paddingVertical: 7,
                        paddingHorizontal: 12,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: COLORS.borderSoft,
                        backgroundColor: "rgba(255,255,255,0.05)",
                      }}
                    >
                      <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12 }}>
                        Segunda mano
                      </Text>
                    </View>

                    {p.category?.name ? (
                      <View
                        style={{
                          paddingVertical: 7,
                          paddingHorizontal: 12,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: COLORS.borderSoft,
                          backgroundColor: "rgba(255,255,255,0.05)",
                        }}
                      >
                        <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12 }}>
                          {p.category.name}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <Text
                    style={{
                      color: COLORS.text,
                      fontSize: 30,
                      fontWeight: "900",
                      lineHeight: 34,
                    }}
                  >
                    {p.title}
                  </Text>

                  <Text
                    style={{
                      color: COLORS.accent,
                      fontSize: 34,
                      fontWeight: "900",
                      lineHeight: 38,
                    }}
                  >
                    {fmtEUR(p.priceEUR)}
                  </Text>

                  <View
                    style={{
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: COLORS.borderSoft,
                      backgroundColor: "rgba(255,255,255,0.04)",
                      padding: 14,
                      gap: 8,
                    }}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
                      Descripción
                    </Text>

                    {p.description?.trim() ? (
                      <Text style={{ color: COLORS.muted, lineHeight: 22 }}>
                        {p.description.trim()}
                      </Text>
                    ) : (
                      <Text style={{ color: COLORS.muted2, lineHeight: 22 }}>
                        Este producto todavía no tiene una descripción publicada. Aun así, puedes
                        preguntarnos por estado, contenido, compatibilidad o disponibilidad por
                        WhatsApp.
                      </Text>
                    )}
                  </View>

                  <View
                    style={{
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: COLORS.borderSoft,
                      backgroundColor: "rgba(255,255,255,0.04)",
                      padding: 14,
                      gap: 10,
                    }}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
                      Lo importante
                    </Text>

                    <View style={{ gap: 8 }}>
                      <InfoRow label="Estado" value={badgeLabel} />
                      <InfoRow label="Categoría" value={p.category?.name ?? "General"} />
                      <InfoRow label="Precio" value={fmtEUR(p.priceEUR)} />
                      <InfoRow
                        label="Compra"
                        value={canBuy ? "Disponible para añadir al carrito" : "No disponible"}
                      />
                    </View>
                  </View>
                </View>

                <View
                  style={{
                    borderRadius: 24,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: COLORS.card,
                    padding: 18,
                    gap: 12,
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18 }}>
                    Compra con tranquilidad
                  </Text>

                  <Text style={{ color: COLORS.muted, lineHeight: 21 }}>
                    {productTrustCopy(Boolean(p.description?.trim()))}
                  </Text>

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                    <Pill text="Producto revisado" />
                    <Pill text="Envíos en España" />
                    <Pill text="Recibo o factura" />
                    <Pill text="Atención directa" />
                  </View>

                  <View
                    style={{
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: COLORS.borderSoft,
                      backgroundColor: "rgba(0,0,0,0.18)",
                      padding: 14,
                      gap: 8,
                    }}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
                      ¿Tienes dudas antes de comprar?
                    </Text>

                    <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                      Escríbenos y te confirmamos disponibilidad, estado, accesorios incluidos o
                      cualquier detalle. Sin rodeos.
                    </Text>

                    <Pressable
                      onPress={() => openWhatsApp(whatsappText)}
                      style={({ pressed }) => ({
                        opacity: pressed ? 0.88 : 1,
                        marginTop: 2,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: COLORS.accentBorder,
                        backgroundColor: COLORS.accent2,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        alignSelf: "flex-start",
                      })}
                    >
                      <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                        📲 Preguntar por WhatsApp
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>

            <View style={{ alignItems: "center", paddingTop: 4 }}>
              <Pressable
                onPress={() => router.replace("/catalogo")}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.88 : 1,
                  borderRadius: 999,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: "rgba(255,255,255,0.06)",
                })}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>← Volver al catálogo</Text>
              </Pressable>
            </View>
          </ScrollView>

          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: 14,
              backgroundColor: "rgba(6,26,44,0.94)",
              borderTopWidth: 1,
              borderTopColor: "rgba(255,255,255,0.10)",
            }}
          >
            <View style={{ flexDirection: isTablet ? "row" : "column", gap: 10 }}>
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
                  paddingVertical: 15,
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
                  borderColor: COLORS.border,
                  backgroundColor: "rgba(255,255,255,0.06)",
                  paddingVertical: 15,
                  alignItems: "center",
                  justifyContent: "center",
                })}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Finalizar compra</Text>
              </Pressable>

              <Pressable
                onPress={() => openWhatsApp(whatsappText)}
                style={({ pressed }) => ({
                  flex: 1,
                  opacity: pressed ? 0.88 : 1,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: "rgba(255,255,255,0.06)",
                  paddingVertical: 15,
                  alignItems: "center",
                  justifyContent: "center",
                })}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>WhatsApp</Text>
              </Pressable>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 12,
        alignItems: "center",
      }}
    >
      <Text style={{ color: COLORS.muted2, fontWeight: "700", flex: 1 }}>{label}</Text>
      <Text
        style={{
          color: COLORS.text,
          fontWeight: "800",
          flex: 1,
          textAlign: "right",
        }}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function Pill({ text }: { text: string }) {
  return (
    <View
      style={{
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: "rgba(255,255,255,0.06)",
      }}
    >
      <Text style={{ color: "rgba(255,255,255,0.88)", fontWeight: "800" }}>{text}</Text>
    </View>
  );
}