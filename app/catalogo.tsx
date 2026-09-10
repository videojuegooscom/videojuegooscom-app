/**
 * app/catalogo.tsx
 *
 * Qué hace: pantalla de catálogo público (y vista interna para admins).
 * Carga productos y categorías desde Supabase, permite buscar, filtrar por
 * categoría y (si eres admin) por estado (Publicada/Lista/Por revisar), y
 * muestra los resultados en una rejilla de tarjetas de producto.
 *
 * Cómo funciona: detectAdmin() comprueba el rol del usuario logueado en
 * Supabase (tabla profiles). Según sea admin o no, fetchProductsSafe() pide
 * más o menos columnas/estados. pickHeroImage() elige la foto de portada de
 * cada producto a partir de product_media. calcColumns() decide cuántas
 * columnas tiene la rejilla según el ancho de pantalla.
 *
 * Rendimiento: detectAdmin() y fetchCategoriesSafe() (loadIdentity) se
 * ejecutan UNA sola vez al entrar en la pantalla — antes se repetían en cada
 * cambio de categoría/búsqueda/filtro (loadAll llamaba a ambas cada vez).
 * fetchCategoryMapByIds() solo se llama ahora como respaldo, cuando el join
 * "category:categories(...)" de fetchProductsSafe no ha podido traer la
 * categoría de algún producto (antes se llamaba siempre, aunque el join ya
 * hubiera funcionado). fetchProductsSafe() lleva un límite de seguridad
 * (300) para no traer el catálogo entero de golpe si crece mucho.
 *
 * Analítica: registra el paso "Categoría" (o "Categoría {nombre}" si viene
 * con ?cat=) en cuanto se resuelve qué categoría es, tanto al entrar como al
 * cambiar de categoría sin salir de la pantalla (lib/analytics.ts).
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase (tablas products, categories,
 *   product_media, profiles).
 * - lib/analytics.ts → registro del paso "Categoría" para el panel de
 *   métricas del admin.
 * - app/producto/[id].tsx → a donde se navega al pulsar una tarjeta.
 * - app/(tabs)/cesta.tsx y app/checkout.tsx → botones "Ir a la cesta" /
 *   "Finalizar compra".
 * - app/(tabs)/index.tsx → los accesos por categoría de la home enlazan aquí
 *   con el parámetro ?cat=.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Href } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { trackEvent, trackEventThrottled } from "../lib/analytics";
import Barramagic from "../components/Barramagic";
import SmartImage from "../components/SmartImage";

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  bg3: "#F6FAFD",
  card: "#F6FAFD",
  cardStrong: "#EEF3F8",
  border: "#E3EAF2",
  borderSoft: "#EEF3F8",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.48)",
  accent: "#1EA7E8",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
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

function pushRoute(route: Href) {
  router.push(route);
}

function replaceRoute(route: Href) {
  router.replace(route);
}

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
  if (s === "PUBLICADA") return "#DCFCE7";
  if (s === "LISTA") return "#FEF3C7";
  return "#FFE4E6";
}

function statusBorder(s: UiStatus) {
  if (s === "PUBLICADA") return "#86EFAC";
  if (s === "LISTA") return "#FDE68A";
  return "#FDA4AF";
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
  replaceRoute("/" as Href);
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
  const isMobile = widthSafe < 700;
  const isTablet = widthSafe >= 700 && widthSafe < 1024;
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

  // En móvil, con un solo producto se ve mejor grande (rejilla de 1
  // columna); en cuanto hay 2 o más, se agrupan de dos en dos (🟩🟩 / 🟩🟩)
  // para no obligar a tanto scroll. En pantallas más anchas se mantiene el
  // número de columnas de siempre según el ancho disponible.
  const cols = useMemo(() => {
    if (isMobile) return items.length > 1 ? 2 : 1;
    return calcColumns(widthSafe);
  }, [isMobile, items.length, widthSafe]);

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
    return "Consolas, videojuegos y electrónica de segunda mano, revisados y listos para ti";
  }, [isAdmin, resolvedCategory]);

  // Las tarjetas solo deben recrearse cuando cambian los productos o algo
  // que afecte a cómo se pintan — no en cada tecla escrita en el buscador
  // ni en cada cambio de "loading"/"refreshing", que antes recreaba toda la
  // lista (y la rejilla la volvía a repartir en filas) sin necesidad.
  // Tarjeta "compacta": móvil + rejilla de 2 columnas, la tarjeta es más
  // estrecha que antes (cuando siempre iba a ancho completo en móvil), así
  // que el precio y "Ver producto" necesitan un poco menos de aire.
  const compactCards = isMobile && cols > 1;

  const productCards = useMemo(
    () =>
      items.map((p) => (
        <ProductCard
          key={p.id}
          p={p}
          isAdmin={isAdmin}
          isMobile={isMobile}
          isTablet={isTablet}
          compact={compactCards}
          onPress={() => pushRoute(`/producto/${p.id}` as Href)}
        />
      )),
    [items, isAdmin, isMobile, isTablet, compactCards]
  );

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

      // Red de seguridad: sin esto, si el catálogo crece a cientos de
      // productos, cada visita/búsqueda los traería todos de golpe.
      return query.limit(300);
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

  // Se ejecuta UNA sola vez al entrar en la pantalla: quién eres (admin o
  // no) y la lista de categorías no cambian al cambiar de filtro o buscar,
  // así que no tiene sentido repetir estas dos consultas en cada cambio.
  async function loadIdentity(): Promise<{ adminFlag: boolean; cats: CategoryRow[] }> {
    const adminFlag = await detectAdmin();
    const cats = await fetchCategoriesSafe(adminFlag);
    return { adminFlag, cats };
  }

  async function loadResults(
    adminFlag: boolean,
    cats: CategoryRow[],
    opts?: { queryOverride?: string }
  ) {
    const seq = ++reqSeqRef.current;
    const queryText = (opts?.queryOverride ?? q ?? "").trim();

    setErr(null);

    const resolvedCatLocal = resolveCategory(rawCat, cats);
    const rows = await fetchProductsSafe(adminFlag, queryText, resolvedCatLocal);
    if (seq !== reqSeqRef.current) return;

    // La consulta de arriba ya intenta traer la categoría de cada producto
    // con un join (category:categories(...)); solo hace falta esta consulta
    // de respaldo si ese join no ha podido traerla para algún producto que
    // sí tiene category_id (p. ej. porque el join falló y se usó una de las
    // consultas de reserva sin él).
    const needsCategoryFallback = rows.some((row) => row.category_id && !row.category);
    const categoryMap = needsCategoryFallback
      ? await fetchCategoryMapByIds(
          rows.map((row) => row.category_id).filter((v): v is string => !!v)
        )
      : new Map<string, CategoryRow>();
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
      const { adminFlag, cats } = await loadIdentity();
      setIsAdmin(adminFlag);
      setCategories(cats);
      await loadResults(adminFlag, cats, { queryOverride: queryFromUrl });
    } catch (e: any) {
      console.error("Error cargando catálogo:", e);
      setErr("No hemos podido cargar el catálogo. Comprueba tu conexión e inténtalo de nuevo.");
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
      // isAdmin/categories ya están cargados (loadIdentity solo corre en
      // bootstrap): un cambio de filtro/búsqueda/categoría solo necesita
      // volver a pedir productos, no quién eres ni la lista de categorías.
      await loadResults(isAdmin, categories, opts);
    } catch (e: any) {
      console.error("Error actualizando catálogo:", e);
      setErr("No hemos podido actualizar el catálogo. Inténtalo de nuevo en unos segundos.");
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

  // Analítica: "Categoría" (genérico) o "Categoría {nombre}" según el
  // parámetro ?cat= resuelto. Se espera a que termine loading (bootstrap) la
  // primera vez para tener ya cargada la lista de categorías y así resolver
  // bien el nombre; después, cada cambio real de categoría dispara un nuevo
  // evento (analyticsCatKeyRef evita repetir el mismo dos veces seguidas).
  const analyticsCatKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading) return;
    const key = rawCat ?? "";
    if (analyticsCatKeyRef.current === key) return;
    analyticsCatKeyRef.current = key;

    const label = resolvedCategory?.name ? `Categoría ${resolvedCategory.name}` : "Categoría";
    trackEvent("page_view", label, {
      path: "/catalogo",
      metadata: { cat: rawCat ?? null },
    });
  }, [loading, rawCat, resolvedCategory]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => {
          if (e.nativeEvent.contentOffset.y > 40) {
            trackEventThrottled("catalogo-scroll", "scroll", "Scroll", { path: "/catalogo" });
          }
        }}
        scrollEventThrottle={16}
      >
        <View
          style={{
            backgroundColor: COLORS.bg2,
            borderBottomWidth: 1,
            borderBottomColor: "#F6FAFD",
            paddingHorizontal: pagePadding,
            paddingTop: isMobile ? 12 : 14,
            paddingBottom: isMobile ? 14 : 18,
            alignItems: "center",
          }}
        >
          {/* Columna centrada: en pantallas anchas el contenido no se pega a la izquierda */}
          <View style={{ width: "100%", maxWidth: 1240, gap: 14 }}>
          <View style={{ alignItems: isMobile ? "center" : "flex-start" }}>
            <Text
              style={{
                color: COLORS.text,
                fontSize: isMobile ? 24 : 28,
                fontWeight: "900",
                letterSpacing: -0.5,
                lineHeight: isMobile ? 30 : 34,
                textAlign: isMobile ? "center" : "left",
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
                textAlign: isMobile ? "center" : "left",
              }}
            >
              {pageSubtitle}
            </Text>
          </View>

          {isAdmin ? (
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
                Panel de administración
              </Text>
              <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                Consulta el estado interno de cada producto: publicado, listo o pendiente de
                revisión.
              </Text>
            </View>
          ) : null}

          {/* Buscador: componente compartido (mismo diseño y misma
              funcionalidad que el de "Inicio"). Aquí en modo "input": busca
              de verdad dentro de esta pantalla al escribir y pulsar intro,
              o al tocar la "x" para borrar. Cambiar cómo se ve/comporta el
              buscador en toda la app ahora se hace en un solo sitio:
              components/Barramagic.tsx. */}
          <Barramagic
            isMobile={isMobile}
            mode="input"
            value={q}
            onChangeText={setQ}
            onSubmit={() => refresh()}
            onClear={() => {
              setQ("");
              refresh({ queryOverride: "" });
            }}
            placeholder="Buscar consola, videojuego, accesorio..."
          />

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

          {err ? (
            <View
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "#F5B5B5",
                backgroundColor: "#FDECEC",
                padding: 12,
              }}
            >
              <Text style={{ color: "#B91C1C", fontWeight: "900" }}>Error cargando catálogo</Text>
              <Text style={{ color: "#7A271A", marginTop: 4, lineHeight: 20 }}>{err}</Text>
            </View>
          ) : null}
          </View>
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
          <View style={{ paddingHorizontal: pagePadding, paddingTop: 16, alignItems: "center" }}>
          <View style={{ width: "100%", maxWidth: 1240, gap: 14 }}>
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
                  No hay productos que coincidan con tu búsqueda
                </Text>

                <Text style={{ color: COLORS.muted, lineHeight: 21 }}>
                  Prueba a quitar algún filtro, cambiar de categoría o revisar más tarde: renovamos
                  el catálogo con frecuencia y seguro que encuentras algo que te interese.
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
                      replaceRoute("/catalogo" as Href);
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
                      backgroundColor: "#F6FAFD",
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
                {productCards}
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
                  alignItems: isMobile ? "center" : "flex-start",
                }}
              >
                <Text
                  style={{
                    color: COLORS.text,
                    fontWeight: "900",
                    fontSize: isMobile ? 17 : 18,
                    textAlign: isMobile ? "center" : "left",
                  }}
                >
                  ¿No encuentras exactamente lo que buscas?
                </Text>
                <Text
                  style={{
                    color: COLORS.muted,
                    lineHeight: 20,
                    textAlign: isMobile ? "center" : "left",
                  }}
                >
                  Escríbenos por WhatsApp: te confirmamos al momento si podemos conseguirlo,
                  reservarlo o proponerte una alternativa.
                </Text>

                <Pressable
                  onPress={() => pushRoute("/checkout" as Href)}
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
                  backgroundColor: "#F6FAFD",
                })}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>← Volver</Text>
              </Pressable>
            </View>
          </View>
          </View>
        )}
      </ScrollView>
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
        borderColor: active ? COLORS.accentBorder : "#E3EAF2",
        backgroundColor: active ? COLORS.accent2 : "#F6FAFD",
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
  // Repartir en filas es barato hoy, pero se recalculaba en CADA render de
  // la pantalla (por ejemplo, en cada letra escrita en el buscador) aunque
  // los productos no hubieran cambiado. Con useMemo solo se rehace cuando de
  // verdad cambian los hijos o el número de columnas.
  const rows = useMemo(() => {
    const kids = React.Children.toArray(children);
    const chunked: React.ReactNode[][] = [];
    for (let i = 0; i < kids.length; i += columns) {
      chunked.push(kids.slice(i, i + columns));
    }
    return chunked;
  }, [children, columns]);

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
  compact,
}: {
  p: Product;
  onPress: () => void;
  isAdmin: boolean;
  isMobile?: boolean;
  isTablet?: boolean;
  /** Móvil + 2 columnas: tarjeta más estrecha, precio/botón necesitan menos aire. */
  compact?: boolean;
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
          height: compact ? 150 : isMobile ? 200 : 180,
          backgroundColor: COLORS.bg3,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.borderSoft,
          position: "relative",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {p.imageUrl ? (
          <SmartImage
            uri={p.imageUrl}
            contentFit="cover"
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
                color: "rgba(11,33,56,0.15)",
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
              Foto no disponible
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
            {/* Chip oscuro sobre la foto: texto blanco fijo, no sigue el tema claro de la página */}
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 12 }}>
              {p.imageCount} foto{p.imageCount === 1 ? "" : "s"}
              {p.hasVideo ? ` + ${p.videoCount} vídeo${p.videoCount === 1 ? "" : "s"}` : ""}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={{ padding: compact ? 10 : isMobile ? 12 : 14, gap: compact ? 8 : 10 }}>
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
              fontSize: compact ? 14 : isMobile ? 16 : 17,
              lineHeight: compact ? 18 : isMobile ? 21 : 22,
              fontWeight: "900",
              minHeight: compact ? 36 : isMobile ? 42 : 44,
            }}
            numberOfLines={2}
          >
            {p.title}
          </Text>

          {/* En tarjeta compacta (móvil, 2 columnas) se omite la descripción:
              con menos ancho no cabía bien y el título + precio ya bastan
              para decidir si entrar a ver el producto. */}
          {!compact ? (
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
                : "Aún no hay una descripción detallada. Escríbenos si tienes alguna duda sobre este artículo."}
            </Text>
          ) : null}
        </View>

        <View
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: COLORS.borderSoft,
            backgroundColor: "#F8FBFE",
            padding: compact ? 10 : 12,
            gap: 8,
          }}
        >
          <View
            style={{
              flexDirection: compact ? "column" : "row",
              justifyContent: "space-between",
              alignItems: compact ? "stretch" : "flex-end",
              gap: compact ? 8 : 10,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.muted2, fontSize: 12, fontWeight: "700" }}>
                Precio
              </Text>
              <Text
                style={{
                  color: COLORS.text,
                  fontSize: compact ? 19 : isMobile ? 22 : 24,
                  fontWeight: "900",
                }}
              >
                {fmtEUR(p.priceEUR)}
              </Text>
            </View>

            <View
              style={{
                borderRadius: 999,
                paddingVertical: compact ? 7 : 8,
                paddingHorizontal: 12,
                borderWidth: 1,
                borderColor: COLORS.accentBorder,
                backgroundColor: COLORS.accent2,
                alignItems: "center",
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                Ver producto
              </Text>
            </View>
          </View>

          {!compact ? (
            !isAdmin ? (
              <Text style={{ color: COLORS.muted, fontSize: 12, lineHeight: 18 }}>
                Compra segura, con atención directa y envío inmediato tras confirmar el pedido.
              </Text>
            ) : (
              <Text style={{ color: COLORS.muted, fontSize: 12, lineHeight: 18 }}>
                Estado interno visible solo para gestión.
              </Text>
            )
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}