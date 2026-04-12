import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "../lib/supabase";

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

type UiFilter = "ALL" | "PUBLICADA" | "LISTA" | "REVISAR";
type UiStatus = "PUBLICADA" | "LISTA" | "REVISAR";
type DbStatus = "DRAFT" | "PUBLISHED" | "REVIEW";

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  sort_order: number;
};

type ProductBaseRow = {
  id: string;
  title: string;
  description: string | null;
  price_eur: number | null;
  status: DbStatus;
  is_active: boolean;
  category_id: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type ProductDbRow = ProductBaseRow & {
  images?: string[] | null;
  category?: { id: string; name: string; slug: string } | null;
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

type Product = {
  id: string;
  title: string;
  description: string | null;
  status: UiStatus;
  priceEUR: number;
  imageUrl: string | null;
  imageCount: number;
  videoCount: number;
  mediaCount: number;
  hasVideo: boolean;
  category?: { id: string; name: string; slug: string } | null;
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
  if (s === "LISTA") return "Preparación";
  return "Revisión";
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

function smartBack() {
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

const LEGACY_CAT_TO_SLUG: Record<string, string> = {};

function legacyCatLabel(raw?: string) {
  if (!raw) return undefined;
  const legacyMap: Record<string, string> = {
    c1: "Nintendo Switch",
    c2: "PlayStation 4",
    c3: "Xbox",
    c4: "PlayStation 5",
    c5: "Mantenimiento y Reparaciones",
    c6: "Electrónica y Electrodomésticos",
    k1: "Videojuegos Nintendo Switch",
    k2: "Videojuegos PlayStation 4",
    k3: "Videojuegos PlayStation 5",
    k4: "Accesorios y Mandos",
  };
  return legacyMap[raw];
}

function calcColumns(width: number) {
  if (width >= 1320) return 4;
  if (width >= 980) return 3;
  if (width >= 680) return 2;
  return 1;
}

function resolveCategory(rawCat: string | undefined, cats: CategoryRow[]) {
  if (!rawCat) return undefined;

  const mappedSlug = LEGACY_CAT_TO_SLUG[rawCat];
  if (mappedSlug) {
    const byMapped = cats.find((c) => c.slug === mappedSlug);
    if (byMapped) return byMapped;
  }

  const bySlug = cats.find((c) => c.slug === rawCat);
  if (bySlug) return bySlug;

  const byId = cats.find((c) => c.id === rawCat);
  if (byId) return byId;

  return undefined;
}

function getCategoryHint(name?: string) {
  if (!name) return "Segunda mano revisada";
  const n = name.toLowerCase();

  if (n.includes("playstation 5") || n.includes("ps5")) return "Consolas y packs PS5";
  if (n.includes("playstation 4") || n.includes("ps4")) return "Consolas y accesorios PS4";
  if (n.includes("xbox")) return "Xbox y accesorios";
  if (n.includes("switch") || n.includes("nintendo")) return "Nintendo y accesorios";
  if (n.includes("videojuego")) return "Juegos listos para enviar";
  if (n.includes("mando") || n.includes("accesorio")) return "Accesorios y periféricos";
  if (n.includes("repar")) return "Servicio y mantenimiento";
  if (n.includes("electr")) return "Electrónica seleccionada";

  return "Producto revisado";
}

function firstImageFromAnyRow(row: ProductDbRow | null | undefined): string | null {
  const imgs = row?.images;

  if (Array.isArray(imgs) && imgs.length > 0) {
    const first = imgs.find((v: unknown) => typeof v === "string" && v.trim());
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

function pickHeroImage(productRow: ProductDbRow, mediaRows: ProductMediaRow[]) {
  const sorted = [...mediaRows].sort(sortMediaRows);

  const coverImage =
    sorted.find(
      (m) =>
        Boolean(m.is_cover) &&
        normalizeMediaKind(m.kind) === "image" &&
        typeof m.public_url === "string" &&
        m.public_url.trim()
    ) ??
    sorted.find(
      (m) =>
        normalizeMediaKind(m.kind) === "image" &&
        typeof m.public_url === "string" &&
        m.public_url.trim()
    ) ??
    null;

  if (coverImage?.public_url) return coverImage.public_url;

  return firstImageFromAnyRow(productRow);
}

function countImages(mediaRows: ProductMediaRow[]) {
  return mediaRows.filter((m) => normalizeMediaKind(m.kind) === "image").length;
}

function countVideos(mediaRows: ProductMediaRow[]) {
  return mediaRows.filter((m) => normalizeMediaKind(m.kind) === "video").length;
}

function isMissingColumnError(error: any, columnName: string) {
  const msg = String(error?.message ?? "").toLowerCase();
  const col = columnName.toLowerCase();
  return (
    msg.includes(col) &&
    (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("column"))
  );
}

function isMissingRelationError(error: any, relationName: string) {
  const msg = String(error?.message ?? "").toLowerCase();
  const rel = relationName.toLowerCase();
  return (
    msg.includes(rel) &&
    (msg.includes("does not exist") ||
      msg.includes("relation") ||
      msg.includes("could not find the table"))
  );
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

async function fetchCategoriesSafe(adminFlag: boolean): Promise<CategoryRow[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id,name,slug,is_active,sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;

  const rows = asArray<CategoryRow>(data);
  return rows.filter((c) => (adminFlag ? true : !!c.is_active));
}

async function fetchCategoryMapByIds(categoryIds: string[]) {
  const map = new Map<string, CategoryRow>();
  const uniqueIds = [...new Set(categoryIds.filter(Boolean))];

  if (!uniqueIds.length) return map;

  const { data, error } = await supabase
    .from("categories")
    .select("id,name,slug,is_active,sort_order")
    .in("id", uniqueIds);

  if (error) {
    if (isMissingRelationError(error, "categories")) {
      return map;
    }
    throw error;
  }

  for (const row of asArray<CategoryRow>(data)) {
    map.set(row.id, row);
  }

  return map;
}

export default function CatalogoScreen() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const cols = calcColumns(widthSafe);
  const isMobile = widthSafe < 700;
  const isTablet = widthSafe >= 700 && widthSafe < 1024;
  const isWide = widthSafe >= 980;
  const pagePadding = isMobile ? 12 : 16;

  const params = useLocalSearchParams<{ cat?: string; query?: string }>();
  const rawCat = typeof params.cat === "string" ? params.cat : undefined;
  const queryFromUrl = typeof params.query === "string" ? params.query.trim() : "";

  const [filter, setFilter] = useState<UiFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [items, setItems] = useState<Product[]>([]);

  const [q, setQ] = useState(queryFromUrl);

  const bootedRef = useRef(false);
  const reqSeqRef = useRef(0);

  const effectiveFilter: UiFilter = useMemo(() => {
    return isAdmin ? filter : "PUBLICADA";
  }, [isAdmin, filter]);

  const resolvedCategory = useMemo(() => {
    return resolveCategory(rawCat, categories);
  }, [rawCat, categories]);

  const pageTitle = useMemo(() => {
    if (!rawCat) return "Catálogo";
    if (resolvedCategory?.name) return resolvedCategory.name;
    return legacyCatLabel(rawCat) ?? "Catálogo";
  }, [rawCat, resolvedCategory]);

  const pageSubtitle = useMemo(() => {
    if (isAdmin) return "Gestión visual del catálogo y revisión de estado.";
    if (resolvedCategory?.name) {
      return `${getCategoryHint(resolvedCategory.name)} · Envíos a toda España`;
    }
    return "Consolas, videojuegos y electrónica revisada lista para vender";
  }, [isAdmin, resolvedCategory]);

  const categoryChips = useMemo(() => {
    const base = [
      { id: "ALL", name: "Todo", slug: "all", is_active: true, sort_order: -999 } as CategoryRow,
    ];
    return base.concat(categories);
  }, [categories]);

  const activeCategoryId = useMemo(() => {
    if (!rawCat) return "ALL";
    const resolved = resolveCategory(rawCat, categories);
    if (resolved?.id) return resolved.id;
    const bySlug = categories.find((c) => c.slug === rawCat);
    if (bySlug) return bySlug.id;
    return "ALL";
  }, [rawCat, categories]);

  const heroStats = useMemo(() => {
    const total = items.length;
    const withPrice = items.filter((p) => p.priceEUR > 0).length;
    const categoryCount = categories.length;
    return { total, withPrice, categoryCount };
  }, [items, categories]);

  async function fetchProductsSafe(
    adminFlag: boolean,
    queryText: string,
    resolvedCat?: CategoryRow
  ): Promise<ProductDbRow[]> {
    const selectWithJoinAndImages =
      "id,title,description,price_eur,status,is_active,category_id,images,updated_at,created_at,category:categories(id,name,slug)";
    const selectWithJoinBase =
      "id,title,description,price_eur,status,is_active,category_id,updated_at,created_at,category:categories(id,name,slug)";
    const selectImagesNoJoin =
      "id,title,description,price_eur,status,is_active,category_id,images,updated_at,created_at";
    const selectBaseNoJoin =
      "id,title,description,price_eur,status,is_active,category_id,updated_at,created_at";

    const buildQuery = (selectStr: string) => {
      let query = supabase
        .from("products")
        .select(selectStr)
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false });

      if (!adminFlag) {
        query = query.eq("is_active", true).eq("status", "PUBLISHED");
      } else if (effectiveFilter !== "ALL") {
        const dbStatus: DbStatus =
          effectiveFilter === "PUBLICADA"
            ? "PUBLISHED"
            : effectiveFilter === "LISTA"
              ? "DRAFT"
              : "REVIEW";
        query = query.eq("status", dbStatus);
      }

      if (resolvedCat?.id) {
        query = query.eq("category_id", resolvedCat.id);
      }

      if (queryText) {
        const safeQuery = queryText.replace(/[%(),]/g, " ").trim();
        const pattern = `%${safeQuery}%`;
        query = query.or(`title.ilike.${pattern},description.ilike.${pattern}`);
      }

      return query;
    };

    const attempts = [
      selectWithJoinAndImages,
      selectWithJoinBase,
      selectImagesNoJoin,
      selectBaseNoJoin,
    ];

    let lastError: any = null;

    for (const selectStr of attempts) {
      const res = await buildQuery(selectStr);

      if (!res.error) {
        return asArray<ProductDbRow>(res.data);
      }

      lastError = res.error;

      const canFallback =
        isMissingColumnError(res.error, "images") ||
        isMissingRelationError(res.error, "categories") ||
        isMissingColumnError(res.error, "slug") ||
        isMissingColumnError(res.error, "name");

      if (!canFallback) {
        throw res.error;
      }
    }

    if (lastError) throw lastError;
    return [];
  }

  async function fetchProductMediaMap(productIds: string[]) {
    const empty = new Map<string, ProductMediaRow[]>();
    if (!productIds.length) return empty;

    const selectStr =
      "id,product_id,kind,public_url,file_name,sort_order,is_cover,duration_seconds";

    const res = await supabase
      .from("product_media")
      .select(selectStr)
      .in("product_id", productIds)
      .limit(5000);

    if (res.error) {
      if (isMissingRelationError(res.error, "product_media")) {
        return empty;
      }
      throw res.error;
    }

    const rows = asArray<ProductMediaRow>(res.data);
    const map = new Map<string, ProductMediaRow[]>();

    for (const row of rows) {
      if (!row?.product_id) continue;
      const list = map.get(row.product_id) ?? [];
      list.push(row);
      map.set(row.product_id, list);
    }

    for (const [key, list] of map.entries()) {
      map.set(key, [...list].sort(sortMediaRows));
    }

    return map;
  }

  async function loadAll(opts?: { queryOverride?: string }) {
    const seq = ++reqSeqRef.current;
    const queryText = (opts?.queryOverride ?? q ?? "").trim();

    setErr(null);

    const adminFlag = await detectAdmin();
    if (seq !== reqSeqRef.current) return;
    setIsAdmin(adminFlag);

    const cats = await fetchCategoriesSafe(adminFlag);
    if (seq !== reqSeqRef.current) return;
    setCategories(cats);

    const resolvedCatLocal = resolveCategory(rawCat, cats);
    const rows = await fetchProductsSafe(adminFlag, queryText, resolvedCatLocal);
    if (seq !== reqSeqRef.current) return;

    const categoryMap = await fetchCategoryMapByIds(
      rows.map((row) => row.category_id).filter((v): v is string => !!v)
    );
    if (seq !== reqSeqRef.current) return;

    const productIds = rows.map((row) => row.id);
    const mediaMap = await fetchProductMediaMap(productIds);
    if (seq !== reqSeqRef.current) return;

    const mapped: Product[] = rows.map((row) => {
      const mediaRows = mediaMap.get(row.id) ?? [];
      const imageUrl = pickHeroImage(row, mediaRows);
      const imageCount = countImages(mediaRows);
      const videoCount = countVideos(mediaRows);

      const category =
        row?.category && typeof row.category === "object"
          ? row.category
          : row?.category_id
            ? categoryMap.get(row.category_id) ?? null
            : null;

      return {
        id: row.id,
        title: String(row.title ?? ""),
        description: row.description ?? null,
        status: mapDbStatusToUi((row.status ?? "DRAFT") as DbStatus),
        priceEUR: Number(row.price_eur ?? 0),
        imageUrl,
        imageCount,
        videoCount,
        mediaCount: mediaRows.length,
        hasVideo: videoCount > 0,
        category,
      };
    });

    setItems(mapped);
  }

  async function bootstrap() {
    setLoading(true);
    try {
      await loadAll({ queryOverride: queryFromUrl });
    } catch (e: any) {
      setErr(e?.message ?? "Error cargando catálogo.");
      setItems([]);
      setCategories([]);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }

  async function refresh(opts?: { queryOverride?: string }) {
    setRefreshing(true);
    try {
      await loadAll(opts);
    } catch (e: any) {
      setErr(e?.message ?? "Error actualizando catálogo.");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setQ(queryFromUrl);
    if (!bootedRef.current) return;
    if (loading) return;
    refresh({ queryOverride: queryFromUrl });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawCat, queryFromUrl, effectiveFilter]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            backgroundColor: COLORS.bg2,
            borderBottomWidth: 1,
            borderBottomColor: "rgba(255,255,255,0.06)",
            paddingHorizontal: pagePadding,
            paddingTop: isMobile ? 12 : 14,
            paddingBottom: isMobile ? 14 : 18,
            gap: 14,
          }}
        >
          <View
            style={{
              flexDirection: isMobile ? "column" : "row",
              justifyContent: "space-between",
              alignItems: isMobile ? "stretch" : "flex-start",
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: COLORS.text,
                  fontSize: isMobile ? 24 : 28,
                  fontWeight: "900",
                  letterSpacing: -0.5,
                  lineHeight: isMobile ? 30 : 34,
                }}
              >
                {pageTitle}
              </Text>

              <Text
                style={{
                  color: COLORS.muted,
                  marginTop: 6,
                  fontSize: isMobile ? 13 : 14,
                  lineHeight: 20,
                  maxWidth: 760,
                }}
              >
                {pageSubtitle}
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

          {!isAdmin ? (
            <View
              style={{
                borderRadius: 22,
                borderWidth: 1,
                borderColor: COLORS.borderSoft,
                backgroundColor: "rgba(255,255,255,0.04)",
                padding: isMobile ? 14 : 16,
                gap: 14,
              }}
            >
              <View
                style={{
                  flexDirection: isWide ? "row" : "column",
                  justifyContent: "space-between",
                  alignItems: isWide ? "center" : "flex-start",
                  gap: 14,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: COLORS.text,
                      fontSize: isMobile ? 18 : 20,
                      fontWeight: "900",
                      lineHeight: isMobile ? 24 : 26,
                    }}
                  >
                    Encuentra consolas, videojuegos y accesorios con aspecto de tienda seria.
                  </Text>
                  <Text
                    style={{
                      color: COLORS.muted,
                      marginTop: 8,
                      lineHeight: 20,
                    }}
                  >
                    Catálogo claro, contacto directo y productos publicados con enfoque real de venta.
                  </Text>
                </View>

                <View
                  style={{
                    flexDirection: isTablet ? "row" : "column",
                    gap: 10,
                    flexWrap: "wrap",
                    width: isMobile ? "100%" : "auto",
                  }}
                >
                  <TrustPill label="Productos revisados" isMobile={isMobile} />
                  <TrustPill label="Envíos en España" isMobile={isMobile} />
                  <TrustPill label="Atención por WhatsApp" isMobile={isMobile} />
                </View>
              </View>

              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 10,
                  justifyContent: "space-between",
                }}
              >
                <MetricCard
                  title="Productos visibles"
                  value={`${heroStats.total}`}
                  subtitle="Inventario mostrado"
                  isMobile={isMobile}
                  compact
                />
                <MetricCard
                  title="Categorías"
                  value={`${heroStats.categoryCount}`}
                  subtitle="Acceso rápido"
                  isMobile={isMobile}
                  compact
                />
                <MetricCard
                  title="Con precio"
                  value={`${heroStats.withPrice}`}
                  subtitle="Listos para decidir"
                  isMobile={isMobile}
                  compact
                />
              </View>
            </View>
          ) : (
            <View
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: COLORS.accentBorder,
                backgroundColor: COLORS.accent2,
                padding: 14,
                gap: 8,
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
                Vista admin
              </Text>
              <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                Aquí sí tiene sentido ver estados internos. En público solo se debe sentir tienda,
                no panel.
              </Text>
            </View>
          )}

          <View
            style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.card,
              paddingHorizontal: 12,
              paddingVertical: 10,
              gap: 10,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Text style={{ color: COLORS.muted, fontWeight: "900", fontSize: 16 }}>🔎</Text>

              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Buscar consola, videojuego, accesorio..."
                placeholderTextColor="rgba(255,255,255,0.42)"
                style={{
                  flex: 1,
                  color: COLORS.text,
                  fontWeight: "700",
                  paddingVertical: 0,
                  fontSize: isMobile ? 14 : 15,
                }}
                returnKeyType="search"
                onSubmitEditing={() => refresh()}
              />
            </View>

            <View
              style={{
                flexDirection: isMobile ? "column" : "row",
                gap: 10,
              }}
            >
              {q ? (
                <Pressable
                  onPress={() => {
                    setQ("");
                    refresh({ queryOverride: "" });
                  }}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.85 : 1,
                    paddingVertical: 10,
                    paddingHorizontal: 11,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.14)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                    width: isMobile ? "100%" : undefined,
                  })}
                >
                  <Text
                    style={{
                      color: COLORS.text,
                      fontWeight: "900",
                      textAlign: "center",
                    }}
                  >
                    Limpiar
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={() => refresh()}
                disabled={refreshing}
                style={({ pressed }) => ({
                  opacity: refreshing ? 0.55 : pressed ? 0.85 : 1,
                  paddingVertical: 10,
                  paddingHorizontal: 11,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: COLORS.accentBorder,
                  backgroundColor: COLORS.accent2,
                  width: isMobile ? "100%" : undefined,
                })}
              >
                <Text
                  style={{
                    color: COLORS.text,
                    fontWeight: "900",
                    textAlign: "center",
                  }}
                >
                  {refreshing ? "..." : "Buscar"}
                </Text>
              </Pressable>
            </View>
          </View>

          {isAdmin ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <Chip
                active={filter === "ALL"}
                label="Todos"
                onPress={() => setFilter("ALL")}
                isMobile={isMobile}
              />
              <Chip
                active={filter === "PUBLICADA"}
                label="Publicadas"
                onPress={() => setFilter("PUBLICADA")}
                isMobile={isMobile}
              />
              <Chip
                active={filter === "LISTA"}
                label="Listas"
                onPress={() => setFilter("LISTA")}
                isMobile={isMobile}
              />
              <Chip
                active={filter === "REVISAR"}
                label="Por revisar"
                onPress={() => setFilter("REVISAR")}
                isMobile={isMobile}
              />
            </View>
          ) : null}

          <View style={{ gap: 8 }}>
            <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: 13 }}>
              Explorar por categoría
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10 }}
            >
              {categoryChips.map((c) => {
                const active =
                  c.id === "ALL" ? activeCategoryId === "ALL" : c.id === activeCategoryId;

                return (
                  <Chip
                    key={c.id}
                    active={active}
                    label={c.name}
                    isMobile={isMobile}
                    onPress={() => {
                      if (c.id === "ALL") {
                        router.replace({ pathname: "/catalogo" });
                      } else {
                        router.replace({ pathname: "/catalogo", params: { cat: c.slug } });
                      }
                    }}
                  />
                );
              })}
            </ScrollView>
          </View>

          {err ? (
            <View
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(255,59,48,0.35)",
                backgroundColor: "rgba(255,59,48,0.12)",
                padding: 12,
              }}
            >
              <Text style={{ color: "#FCA5A5", fontWeight: "900" }}>Error cargando catálogo</Text>
              <Text style={{ color: "#FEE2E2", marginTop: 4, lineHeight: 20 }}>{err}</Text>
            </View>
          ) : null}
        </View>

        {loading ? (
          <View
            style={{
              minHeight: 360,
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              paddingHorizontal: pagePadding,
            }}
          >
            <ActivityIndicator />
            <Text style={{ color: COLORS.muted }}>Cargando catálogo…</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: pagePadding, paddingTop: 16, gap: 14 }}>
            <View
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.cardStrong,
                padding: 14,
                gap: 12,
              }}
            >
              <View
                style={{
                  flexDirection: isWide ? "row" : "column",
                  justifyContent: "space-between",
                  alignItems: isWide ? "center" : "flex-start",
                  gap: 10,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
                    {items.length} producto{items.length === 1 ? "" : "s"} encontrado
                    {items.length === 1 ? "" : "s"}
                  </Text>

                  <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 20 }}>
                    {!isAdmin ? "Catálogo público" : "Vista interna"} ·{" "}
                    {effectiveFilter === "ALL"
                      ? "Todos"
                      : effectiveFilter === "PUBLICADA"
                        ? isAdmin
                          ? "Publicadas"
                          : "Disponibles"
                        : effectiveFilter === "LISTA"
                          ? "Listas"
                          : "Por revisar"}
                    {q ? (
                      <>
                        {" "}
                        · Búsqueda: <Text style={{ color: COLORS.text, fontWeight: "900" }}>{q}</Text>
                      </>
                    ) : null}
                  </Text>
                </View>

                <View
                  style={{
                    flexDirection: isMobile ? "column" : "row",
                    gap: 10,
                    width: isMobile ? "100%" : "auto",
                  }}
                >
                  <Pressable
                    onPress={() => router.push("/carrito")}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.88 : 1,
                      borderRadius: 999,
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      backgroundColor: "rgba(255,255,255,0.06)",
                      width: isMobile ? "100%" : undefined,
                    })}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>
                      Ir al carrito
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => router.push("/checkout")}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.88 : 1,
                      borderRadius: 999,
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderWidth: 1,
                      borderColor: COLORS.accentBorder,
                      backgroundColor: COLORS.accent2,
                      width: isMobile ? "100%" : undefined,
                    })}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>
                      Finalizar compra
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {items.length === 0 ? (
              <View
                style={{
                  borderRadius: 22,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.card,
                  padding: isMobile ? 16 : 18,
                  gap: 12,
                }}
              >
                <Text
                  style={{ color: COLORS.text, fontWeight: "900", fontSize: isMobile ? 18 : 20 }}
                >
                  Ahora mismo no hay productos para esta vista.
                </Text>

                <Text style={{ color: COLORS.muted, lineHeight: 21 }}>
                  Quita filtros, cambia de categoría o vuelve al catálogo general para ver todo lo
                  disponible. Si esta pantalla la ve un cliente, el problema no es el diseño: es que
                  faltan productos publicados y activos.
                </Text>

                <View
                  style={{
                    flexDirection: isMobile ? "column" : "row",
                    gap: 10,
                    marginTop: 4,
                  }}
                >
                  <Pressable
                    onPress={() => {
                      setQ("");
                      router.replace({ pathname: "/catalogo" });
                      refresh({ queryOverride: "" });
                    }}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.88 : 1,
                      borderRadius: 16,
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      borderWidth: 1,
                      borderColor: COLORS.accentBorder,
                      backgroundColor: COLORS.accent2,
                      width: isMobile ? "100%" : undefined,
                    })}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>
                      Ver todo
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={smartBack}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.88 : 1,
                      borderRadius: 16,
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      backgroundColor: "rgba(255,255,255,0.06)",
                      width: isMobile ? "100%" : undefined,
                    })}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>
                      Volver
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Grid columns={cols} gap={14}>
                {items.map((p) => (
                  <ProductCard
                    key={p.id}
                    p={p}
                    isAdmin={isAdmin}
                    isMobile={isMobile}
                    isTablet={isTablet}
                    onPress={() => router.push(`/producto/${p.id}`)}
                  />
                ))}
              </Grid>
            )}

            {!loading && items.length > 0 && !isAdmin ? (
              <View
                style={{
                  borderRadius: 22,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.card,
                  padding: isMobile ? 14 : 16,
                  gap: 10,
                }}
              >
                <Text
                  style={{ color: COLORS.text, fontWeight: "900", fontSize: isMobile ? 17 : 18 }}
                >
                  ¿No encuentras exactamente lo que buscas?
                </Text>
                <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                  Escríbenos por WhatsApp y te decimos rápido si podemos conseguirlo, reservarlo o
                  proponerte una alternativa.
                </Text>

                <Pressable
                  onPress={() => router.push("/checkout")}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.88 : 1,
                    alignSelf: isMobile ? "stretch" : "flex-start",
                    borderRadius: 999,
                    paddingVertical: 11,
                    paddingHorizontal: 14,
                    borderWidth: 1,
                    borderColor: COLORS.accentBorder,
                    backgroundColor: COLORS.accent2,
                  })}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>
                    Seguir con la compra
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <View style={{ alignItems: "center", paddingTop: 8 }}>
              <Pressable
                onPress={smartBack}
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
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>← Volver</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function TrustPill({
  label,
  isMobile,
}: {
  label: string;
  isMobile?: boolean;
}) {
  return (
    <View
      style={{
        borderRadius: 999,
        paddingVertical: 9,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: COLORS.accentBorder,
        backgroundColor: COLORS.accent2,
        width: isMobile ? "100%" : undefined,
      }}
    >
      <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 12, textAlign: "center" }}>
        {label}
      </Text>
    </View>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  isMobile,
  compact,
}: {
  title: string;
  value: string;
  subtitle: string;
  isMobile?: boolean;
  compact?: boolean;
}) {
  return (
    <View
      style={{
        width: compact ? (isMobile ? "100%" : "31.9%") : "100%",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.borderSoft,
        backgroundColor: "rgba(255,255,255,0.05)",
        padding: isMobile ? 12 : 14,
        gap: 4,
      }}
    >
      <Text style={{ color: COLORS.muted2, fontSize: 12, fontWeight: "700" }}>{title}</Text>
      <Text style={{ color: COLORS.text, fontSize: isMobile ? 20 : 22, fontWeight: "900" }}>
        {value}
      </Text>
      <Text style={{ color: COLORS.muted, fontSize: 12 }}>{subtitle}</Text>
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
  isMobile,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  isMobile?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.88 : 1,
        borderRadius: 999,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: active ? COLORS.accentBorder : "rgba(255,255,255,0.14)",
        backgroundColor: active ? COLORS.accent2 : "rgba(255,255,255,0.06)",
      })}
    >
      <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: isMobile ? 13 : 14 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Grid({
  columns,
  gap,
  children,
}: {
  columns: number;
  gap: number;
  children: React.ReactNode;
}) {
  const kids = React.Children.toArray(children);
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < kids.length; i += columns) {
    rows.push(kids.slice(i, i + columns));
  }

  return (
    <View style={{ gap }}>
      {rows.map((row, idx) => (
        <View
          key={idx}
          style={{
            flexDirection: columns === 1 ? "column" : "row",
            gap,
          }}
        >
          {row.map((child, j) => (
            <View key={j} style={{ flex: 1 }}>
              {child}
            </View>
          ))}
          {row.length < columns
            ? Array.from({ length: columns - row.length }).map((_, k) => (
                <View key={`pad-${k}`} style={{ flex: 1 }} />
              ))
            : null}
        </View>
      ))}
    </View>
  );
}

function ProductCard({
  p,
  onPress,
  isAdmin,
  isMobile,
}: {
  p: Product;
  onPress: () => void;
  isAdmin: boolean;
  isMobile?: boolean;
  isTablet?: boolean;
}) {
  const badgeLabel = isAdmin ? adminStatusLabel(p.status) : publicStatusLabel(p.status);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.94 : 1,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.card,
        overflow: "hidden",
      })}
    >
      <View
        style={{
          height: isMobile ? 200 : 180,
          backgroundColor: COLORS.bg3,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.borderSoft,
          position: "relative",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {p.imageUrl ? (
          <Image
            source={{ uri: p.imageUrl }}
            resizeMode="cover"
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <View
            style={{
              width: "100%",
              height: "100%",
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 18,
            }}
          >
            <Text
              style={{
                color: "rgba(255,255,255,0.20)",
                fontWeight: "900",
                fontSize: 40,
              }}
            >
              VG
            </Text>
            <Text
              style={{
                color: COLORS.muted2,
                fontSize: 12,
                marginTop: 6,
                textAlign: "center",
              }}
            >
              Imagen pendiente o no disponible
            </Text>
          </View>
        )}

        <View
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 999,
            backgroundColor: statusBg(p.status),
            borderWidth: 1,
            borderColor: statusBorder(p.status),
          }}
        >
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>{badgeLabel}</Text>
        </View>

        {p.mediaCount > 0 ? (
          <View
            style={{
              position: "absolute",
              right: 12,
              bottom: 12,
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 999,
              backgroundColor: "rgba(7,30,51,0.86)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.16)",
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
              {p.imageCount} foto{p.imageCount === 1 ? "" : "s"}
              {p.hasVideo ? ` + ${p.videoCount} vídeo${p.videoCount === 1 ? "" : "s"}` : ""}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={{ padding: isMobile ? 12 : 14, gap: 10 }}>
        <View style={{ gap: 6 }}>
          {p.category?.name ? (
            <Text
              style={{
                color: COLORS.accent,
                fontSize: 12,
                fontWeight: "800",
                textTransform: "uppercase",
                letterSpacing: 0.4,
              }}
              numberOfLines={1}
            >
              {p.category.name}
            </Text>
          ) : null}

          <Text
            style={{
              color: COLORS.text,
              fontSize: isMobile ? 16 : 17,
              lineHeight: isMobile ? 21 : 22,
              fontWeight: "900",
              minHeight: isMobile ? 42 : 44,
            }}
            numberOfLines={2}
          >
            {p.title}
          </Text>

          <Text
            style={{
              color: COLORS.muted,
              fontSize: 13,
              lineHeight: 19,
              minHeight: 38,
            }}
            numberOfLines={2}
          >
            {p.description?.trim()
              ? p.description.trim()
              : "Producto revisado y presentado con enfoque claro para compra rápida."}
          </Text>
        </View>

        <View
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: COLORS.borderSoft,
            backgroundColor: "rgba(255,255,255,0.04)",
            padding: 12,
            gap: 8,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: 10,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.muted2, fontSize: 12, fontWeight: "700" }}>
                Precio
              </Text>
              <Text style={{ color: COLORS.text, fontSize: isMobile ? 22 : 24, fontWeight: "900" }}>
                {fmtEUR(p.priceEUR)}
              </Text>
            </View>

            <View
              style={{
                borderRadius: 999,
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderWidth: 1,
                borderColor: COLORS.accentBorder,
                backgroundColor: COLORS.accent2,
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                Ver producto
              </Text>
            </View>
          </View>

          {!isAdmin ? (
            <Text style={{ color: COLORS.muted, fontSize: 12, lineHeight: 18 }}>
              Compra clara, contacto rápido y producto orientado a venta real.
            </Text>
          ) : (
            <Text style={{ color: COLORS.muted, fontSize: 12, lineHeight: 18 }}>
              Estado interno visible solo para gestión.
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}