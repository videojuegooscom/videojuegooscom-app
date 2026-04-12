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
type ProductMediaKind = "image" | "video";

type Category = {
  id: string;
  name: string;
  slug: string;
};

type ProductMediaRow = {
  id: string;
  product_id: string;
  kind: ProductMediaKind | null;
  public_url: string | null;
  file_name: string | null;
  sort_order: number | null;
  is_cover: boolean | null;
  duration_seconds: number | null;
};

type ProductMedia = {
  id: string;
  kind: ProductMediaKind;
  publicUrl: string;
  fileName: string | null;
  sortOrder: number;
  isCover: boolean;
  durationSeconds: number | null;
};

type ProductDbRow = {
  id: string;
  title: string;
  description: string | null;
  price_eur: number | null;
  status: DbStatus;
  is_active: boolean;
  category_id: string | null;
  updated_at: string | null;
  created_at: string | null;
  images: string[] | null;
  category: Category | null;
};

type Product = {
  id: string;
  title: string;
  description: string | null;
  priceEUR: number;
  status: UiStatus;
  isActive: boolean;
  imageUrl: string | null;
  category: Category | null;
  media: ProductMedia[];
};

const BRAND = {
  whatsappPhoneE164: "+34627748741",
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

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
    // ignore
  }
  router.replace("/catalogo");
}

function openWhatsApp(prefill: string) {
  const phone = BRAND.whatsappPhoneE164.replace(/[^\d+]/g, "");
  const text = encodeURIComponent(String(prefill ?? "").trim().slice(0, 500));
  const url = `https://wa.me/${phone.replace("+", "")}?text=${text}`;

  Linking.openURL(url).catch(() => {
    Linking.openURL(
      `https://api.whatsapp.com/send?phone=${phone.replace("+", "")}&text=${text}`
    );
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

function asCategory(value: unknown): Category | null {
  if (!value || typeof value !== "object") return null;

  const row = value as Record<string, unknown>;
  const id = String(row.id ?? "").trim();
  const name = String(row.name ?? "").trim();
  const slug = String(row.slug ?? "").trim();

  if (!id || !name || !slug) return null;

  return { id, name, slug };
}

function asProductDbRow(value: unknown): ProductDbRow | null {
  if (!value || typeof value !== "object") return null;

  const row = value as Record<string, unknown>;
  const id = String(row.id ?? "").trim();
  const title = String(row.title ?? "").trim();
  const statusRaw = String(row.status ?? "").trim().toUpperCase();

  if (!id || !title) return null;
  if (statusRaw !== "DRAFT" && statusRaw !== "PUBLISHED" && statusRaw !== "REVIEW") return null;

  return {
    id,
    title,
    description: typeof row.description === "string" ? row.description : null,
    price_eur: typeof row.price_eur === "number" ? row.price_eur : Number(row.price_eur ?? 0),
    status: statusRaw as DbStatus,
    is_active: Boolean(row.is_active),
    category_id: typeof row.category_id === "string" ? row.category_id : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    images: Array.isArray(row.images)
      ? row.images.filter((v): v is string => typeof v === "string" && !!v.trim())
      : null,
    category: asCategory(row.category),
  };
}

function asProductMediaRow(value: unknown): ProductMediaRow | null {
  if (!value || typeof value !== "object") return null;

  const row = value as Record<string, unknown>;
  const id = String(row.id ?? "").trim();
  const productId = String(row.product_id ?? "").trim();
  const kindRaw = String(row.kind ?? "").trim().toLowerCase();
  const publicUrl = String(row.public_url ?? "").trim();

  if (!id || !productId) return null;

  let kind: ProductMediaKind | null = null;
  if (kindRaw === "image") kind = "image";
  if (kindRaw === "video") kind = "video";

  return {
    id,
    product_id: productId,
    kind,
    public_url: publicUrl || null,
    file_name: typeof row.file_name === "string" ? row.file_name : null,
    sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
    is_cover: Boolean(row.is_cover),
    duration_seconds:
      Number.isFinite(Number(row.duration_seconds)) && Number(row.duration_seconds) > 0
        ? Number(row.duration_seconds)
        : null,
  };
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

async function fetchCategoryMapByIds(categoryIds: string[]) {
  const map = new Map<string, Category>();
  const uniqueIds = [...new Set(categoryIds.filter(Boolean))];

  if (!uniqueIds.length) return map;

  const { data, error } = await supabase
    .from("categories")
    .select("id,name,slug")
    .in("id", uniqueIds);

  if (error) {
    if (isMissingRelationError(error, "categories")) return map;
    throw error;
  }

  for (const row of asArray<unknown>(data)) {
    const normalized = asCategory(row);
    if (normalized) map.set(normalized.id, normalized);
  }

  return map;
}

function firstImageFromAnyRow(row: ProductDbRow | null | undefined): string | null {
  const imgs = row?.images;

  if (Array.isArray(imgs) && imgs.length > 0) {
    const first = imgs.find((v) => typeof v === "string" && !!v.trim());
    if (typeof first === "string" && first.trim()) return first.trim();
  }

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

function normalizeDuration(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeProductMediaRows(rows: ProductMediaRow[]): ProductMedia[] {
  return rows
    .map((row) => {
      if (!row.kind || !row.public_url) return null;

      return {
        id: row.id,
        kind: row.kind,
        publicUrl: row.public_url,
        fileName: row.file_name ?? null,
        sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
        isCover: Boolean(row.is_cover),
        durationSeconds: normalizeDuration(row.duration_seconds),
      } satisfies ProductMedia;
    })
    .filter((value): value is ProductMedia => Boolean(value))
    .sort((a, b) => {
      if (a.isCover && !b.isCover) return -1;
      if (!a.isCover && b.isCover) return 1;
      return a.sortOrder - b.sortOrder;
    });
}

function pickInitialHeroImage(productRow: ProductDbRow, media: ProductMedia[]): string | null {
  const coverImage =
    media.find((m) => m.isCover && m.kind === "image") ||
    media.find((m) => m.kind === "image");

  if (coverImage?.publicUrl) return coverImage.publicUrl;

  return firstImageFromAnyRow(productRow);
}

function mediaCountLabel(media: ProductMedia[]) {
  const images = media.filter((m) => m.kind === "image").length;
  const videos = media.filter((m) => m.kind === "video").length;

  if (!images && !videos) return "Sin multimedia";
  if (images && videos) {
    return `${images} foto${images === 1 ? "" : "s"} + ${videos} vídeo${videos === 1 ? "" : "s"}`;
  }
  if (images) return `${images} foto${images === 1 ? "" : "s"}`;
  return `${videos} vídeo${videos === 1 ? "" : "s"}`;
}

async function loadProductMediaRows(productId: string): Promise<ProductMediaRow[]> {
  const selectStr =
    "id,product_id,kind,public_url,file_name,sort_order,is_cover,duration_seconds";

  const res = await supabase
    .from("product_media")
    .select(selectStr)
    .eq("product_id", productId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(50);

  if (res.error) {
    if (isMissingRelationError(res.error, "product_media")) return [];
    throw res.error;
  }

  return asArray<unknown>(res.data)
    .map(asProductMediaRow)
    .filter((row): row is ProductMediaRow => Boolean(row));
}

async function fetchProductSafe(productId: string, adminFlag: boolean): Promise<ProductDbRow | null> {
  const selectWithJoinAndImages =
    "id,title,description,price_eur,status,is_active,category_id,images,updated_at,created_at,category:categories(id,name,slug)";
  const selectWithJoinBase =
    "id,title,description,price_eur,status,is_active,category_id,updated_at,created_at,category:categories(id,name,slug)";
  const selectImagesNoJoin =
    "id,title,description,price_eur,status,is_active,category_id,images,updated_at,created_at";
  const selectBaseNoJoin =
    "id,title,description,price_eur,status,is_active,category_id,updated_at,created_at";

  const attempts = [
    selectWithJoinAndImages,
    selectWithJoinBase,
    selectImagesNoJoin,
    selectBaseNoJoin,
  ];

  for (const selectStr of attempts) {
    let query = supabase.from("products").select(selectStr).eq("id", productId);

    if (!adminFlag) {
      query = query.eq("is_active", true).eq("status", "PUBLISHED");
    }

    const res = await query.maybeSingle();

    if (!res.error) {
      return asProductDbRow(res.data);
    }

    const canFallback =
      isMissingColumnError(res.error, "images") ||
      isMissingRelationError(res.error, "categories") ||
      isMissingColumnError(res.error, "slug") ||
      isMissingColumnError(res.error, "name");

    if (!canFallback) {
      throw res.error;
    }
  }

  return null;
}

export default function ProductoScreen() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const isTablet = widthSafe >= 700 && widthSafe < 1080;
  const isWide = widthSafe >= 1080;
  const pagePadding = isMobile ? 12 : 16;

  const params = useLocalSearchParams<{ id?: string }>();
  const productId = typeof params.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [p, setP] = useState<Product | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);

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

    if (p.media.length > 0) {
      parts.push(mediaCountLabel(p.media));
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
      setSelectedImageUrl(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const adminFlag = await detectAdmin();
      if (seq !== reqSeqRef.current) return;
      setIsAdmin(adminFlag);

      const productRow = await fetchProductSafe(productId, adminFlag);
      if (seq !== reqSeqRef.current) return;

      if (!productRow) {
        setP(null);
        setSelectedImageUrl(null);
        setErr("Producto no encontrado o no disponible.");
        return;
      }

      const categoryMap = await fetchCategoryMapByIds(
        productRow.category_id ? [productRow.category_id] : []
      );
      if (seq !== reqSeqRef.current) return;

      const mediaRows = await loadProductMediaRows(productRow.id);
      if (seq !== reqSeqRef.current) return;

      const normalizedMedia = normalizeProductMediaRows(mediaRows);
      const heroImage = pickInitialHeroImage(productRow, normalizedMedia);

      const category =
        productRow.category ||
        (productRow.category_id ? categoryMap.get(productRow.category_id) ?? null : null);

      const mapped: Product = {
        id: productRow.id,
        title: productRow.title,
        description: productRow.description ?? null,
        priceEUR: Number(productRow.price_eur ?? 0),
        status: mapDbStatusToUi(productRow.status),
        isActive: Boolean(productRow.is_active),
        imageUrl: heroImage,
        category,
        media: normalizedMedia,
      };

      setP(mapped);
      setSelectedImageUrl(heroImage);
    } catch (e: any) {
      if (seq !== reqSeqRef.current) return;
      setErr(e?.message ?? "Error cargando el producto.");
      setP(null);
      setSelectedImageUrl(null);
    } finally {
      if (seq !== reqSeqRef.current) return;
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  useEffect(() => {
    if (!p) {
      setSelectedImageUrl(null);
      return;
    }

    const validUrls = p.media.filter((m) => m.kind === "image").map((m) => m.publicUrl);

    if (!validUrls.length) {
      setSelectedImageUrl(p.imageUrl ?? null);
      return;
    }

    if (!selectedImageUrl || !validUrls.includes(selectedImageUrl)) {
      setSelectedImageUrl(validUrls[0]);
    }
  }, [p, selectedImageUrl]);

  const imageGallery = useMemo(() => {
    if (!p) return [];
    return p.media.filter((m) => m.kind === "image");
  }, [p]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="light-content" />

      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.06)",
          paddingHorizontal: pagePadding,
          paddingTop: isMobile ? 12 : 14,
          paddingBottom: isMobile ? 12 : 14,
          gap: 12,
        }}
      >
        <View
          style={{
            flexDirection: isMobile ? "column" : "row",
            justifyContent: "space-between",
            alignItems: isMobile ? "stretch" : "flex-start",
            gap: 10,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: COLORS.text,
                fontSize: isMobile ? 24 : 28,
                fontWeight: "900",
                lineHeight: isMobile ? 30 : 32,
              }}
              numberOfLines={isMobile ? 3 : 2}
            >
              {p?.title ?? "Producto"}
            </Text>

            <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 20 }}>
              {heroSubcopy}
            </Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              gap: 10,
              flexWrap: "wrap",
              justifyContent: isMobile ? "flex-start" : "flex-end",
            }}
          >
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
              <Text
                style={{ color: COLORS.text, fontWeight: "900", fontSize: isMobile ? 13 : 14 }}
              >
                🛒 Carrito
              </Text>
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
            <Text style={{ color: "rgba(255,255,255,0.78)", fontWeight: "800", fontSize: 13 }}>
              Inicio
            </Text>
          </Pressable>

          <Text style={{ color: "rgba(255,255,255,0.42)" }}>›</Text>

          <Pressable
            onPress={() => router.replace("/catalogo")}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <Text style={{ color: "rgba(255,255,255,0.78)", fontWeight: "800", fontSize: 13 }}>
              Catálogo
            </Text>
          </Pressable>

          <Text style={{ color: "rgba(255,255,255,0.42)" }}>›</Text>

          <Text
            style={{ color: COLORS.text, fontWeight: "900", fontSize: 13 }}
            numberOfLines={1}
          >
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
        <View style={{ padding: pagePadding, gap: 12 }}>
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

          <View
            style={{
              flexDirection: isMobile ? "column" : "row",
              gap: 10,
            }}
          >
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
                width: isMobile ? "100%" : undefined,
              })}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>
                Reintentar
              </Text>
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
                width: isMobile ? "100%" : undefined,
              })}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>
                Volver al catálogo
              </Text>
            </Pressable>
          </View>
        </View>
      ) : !p ? (
        <View style={{ padding: pagePadding, gap: 10 }}>
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
              alignSelf: isMobile ? "stretch" : "flex-start",
            })}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>
              Volver al catálogo
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{
              padding: pagePadding,
              paddingBottom: isMobile ? 200 : 132,
              gap: 14,
            }}
          >
            <View
              style={{
                flexDirection: isWide ? "row" : "column",
                gap: 14,
                alignItems: "stretch",
              }}
            >
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
                  {selectedImageUrl ? (
                    <Image
                      source={{ uri: selectedImageUrl }}
                      style={{
                        width: "100%",
                        height: isWide ? 520 : isTablet ? 360 : 260,
                        backgroundColor: "rgba(255,255,255,0.04)",
                      }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View
                      style={{
                        height: isWide ? 520 : isTablet ? 360 : 260,
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
                          fontSize: isMobile ? 46 : 56,
                        }}
                      >
                        VG
                      </Text>
                      <Text
                        style={{
                          color: COLORS.text,
                          fontWeight: "900",
                          marginTop: 10,
                          fontSize: isMobile ? 17 : 18,
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

                {imageGallery.length > 1 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{
                      gap: 10,
                      paddingTop: 10,
                    }}
                  >
                    {imageGallery.map((media) => {
                      const active = selectedImageUrl === media.publicUrl;

                      return (
                        <Pressable
                          key={media.id}
                          onPress={() => setSelectedImageUrl(media.publicUrl)}
                          style={({ pressed }) => ({
                            opacity: pressed ? 0.88 : 1,
                            width: isMobile ? 74 : 88,
                            height: isMobile ? 74 : 88,
                            borderRadius: 16,
                            overflow: "hidden",
                            borderWidth: 2,
                            borderColor: active ? COLORS.accent : "rgba(255,255,255,0.10)",
                            backgroundColor: "rgba(255,255,255,0.05)",
                          })}
                        >
                          <Image
                            source={{ uri: media.publicUrl }}
                            resizeMode="cover"
                            style={{ width: "100%", height: "100%" }}
                          />
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : null}
              </View>

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
                    padding: isMobile ? 14 : 18,
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

                    {p.media.length > 0 ? (
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
                          {mediaCountLabel(p.media)}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <Text
                    style={{
                      color: COLORS.text,
                      fontSize: isMobile ? 24 : 30,
                      fontWeight: "900",
                      lineHeight: isMobile ? 29 : 34,
                    }}
                  >
                    {p.title}
                  </Text>

                  <Text
                    style={{
                      color: COLORS.accent,
                      fontSize: isMobile ? 28 : 34,
                      fontWeight: "900",
                      lineHeight: isMobile ? 32 : 38,
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
                      <InfoRow label="Estado" value={badgeLabel} isMobile={isMobile} />
                      <InfoRow
                        label="Categoría"
                        value={p.category?.name ?? "General"}
                        isMobile={isMobile}
                      />
                      <InfoRow label="Precio" value={fmtEUR(p.priceEUR)} isMobile={isMobile} />
                      <InfoRow
                        label="Multimedia"
                        value={mediaCountLabel(p.media)}
                        isMobile={isMobile}
                      />
                      <InfoRow
                        label="Compra"
                        value={canBuy ? "Disponible para añadir al carrito" : "No disponible"}
                        isMobile={isMobile}
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
                    padding: isMobile ? 14 : 18,
                    gap: 12,
                  }}
                >
                  <Text
                    style={{ color: COLORS.text, fontWeight: "900", fontSize: isMobile ? 17 : 18 }}
                  >
                    Compra con tranquilidad
                  </Text>

                  <Text style={{ color: COLORS.muted, lineHeight: 21 }}>
                    {productTrustCopy(Boolean(p.description?.trim()))}
                  </Text>

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                    <Pill text="Producto revisado" isMobile={isMobile} />
                    <Pill text="Envíos en España" isMobile={isMobile} />
                    <Pill text="Recibo o factura" isMobile={isMobile} />
                    <Pill text="Atención directa" isMobile={isMobile} />
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
                        alignSelf: isMobile ? "stretch" : "flex-start",
                      })}
                    >
                      <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>
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
              padding: isMobile ? 12 : 14,
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

function InfoRow({
  label,
  value,
  isMobile,
}: {
  label: string;
  value: string;
  isMobile?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: isMobile ? "column" : "row",
        justifyContent: "space-between",
        gap: 6,
        alignItems: isMobile ? "flex-start" : "center",
      }}
    >
      <Text style={{ color: COLORS.muted2, fontWeight: "700", flex: isMobile ? undefined : 1 }}>
        {label}
      </Text>
      <Text
        style={{
          color: COLORS.text,
          fontWeight: "800",
          flex: isMobile ? undefined : 1,
          textAlign: isMobile ? "left" : "right",
        }}
        numberOfLines={isMobile ? 3 : 2}
      >
        {value}
      </Text>
    </View>
  );
}

function Pill({
  text,
  isMobile,
}: {
  text: string;
  isMobile?: boolean;
}) {
  return (
    <View
      style={{
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: "rgba(255,255,255,0.06)",
        width: isMobile ? "auto" : undefined,
      }}
    >
      <Text style={{ color: "rgba(255,255,255,0.88)", fontWeight: "800", fontSize: 13 }}>
        {text}
      </Text>
    </View>
  );
}