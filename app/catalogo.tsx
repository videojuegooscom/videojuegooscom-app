/**
 * app/catalogo.tsx
 *
 * Qué hace: pantalla de catálogo público (y vista interna para admins).
 * Carga productos y categorías desde Supabase, permite buscar, filtrar por
 * plataforma/categoría, estado (Nuevo / Segunda mano y condición detallada),
 * rango de precio, ordenar (Novedades, precio, más vistos) y, si eres admin,
 * filtrar por estado interno (Publicada/Lista/Por revisar). Los resultados se
 * muestran en una rejilla de tarjetas de producto.
 *
 * Cómo funciona:
 * - loadIdentity() (detectAdmin + categorías) se ejecuta UNA sola vez al
 *   entrar en la pantalla.
 * - fetchProductsPage() pide SOLO las columnas que pinta la tarjeta y aplica
 *   todos los filtros y el orden en la consulta a Supabase (no en cliente),
 *   paginando de 24 en 24 con .range() y pidiendo el total (count) para el
 *   contador "N productos". Así la paginación es correcta aunque haya
 *   cientos de productos.
 * - fetchCoverMap() pide las fotos de product_media solo para los productos
 *   de la página recién cargada (máx. 24 ids) y solo las de tipo imagen.
 *   pickHeroImage() elige la portada (is_cover → sort_order → images[0]).
 * - "Ver más productos" (botón centrado) o llegar al final del scroll carga
 *   la siguiente página.
 * - Filtros desde la URL: ?cat= (o ?categoria=) con el slug o el id de la
 *   categoría, y ?query= con el texto de búsqueda.
 *
 * Analítica: registra el paso "Categoría" (o "Categoría {nombre}") al entrar
 * y cada vez que cambia la categoría elegida (lib/analytics.ts).
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase (products, categories,
 *   product_media, profiles).
 * - lib/analytics.ts → paso "Categoría" para el panel de métricas.
 * - components/CatalogFilters.tsx → botón "Filtros" con contador y panel
 *   (hoja inferior en móvil) con todos los filtros, orden y "Quitar filtros".
 * - components/Barramagic.tsx → buscador (modo "input").
 * - components/SmartImage.tsx → fotos de las tarjetas.
 * - app/producto/[id].tsx → a donde se navega al pulsar una tarjeta.
 * - app/(tabs)/index.tsx → los accesos por categoría de la home enlazan aquí
 *   con el parámetro ?cat=.
 * - "Chatear con nosotros" abre el chat de soporte (get_or_create_support_chat,
 *   ver sql/product_chats.sql), la misma bandeja de app/admin/chats.tsx.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Href } from "expo-router";
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
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
import MarcaAnimada from "../components/marca/MarcaAnimada";
import CargaMarca from "../components/marca/CargaMarca";
import { crearAvisoBusqueda } from "../components/Campanita";
import CatalogFilters, {
  Chip,
  USED_CONDITIONS,
  type CatalogCategoryOption,
  type ConditionFilter,
  type PriceFilter,
  type SortKey,
} from "../components/CatalogFilters";

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  bg3: "#F6FAFD",
  card: "#F6FAFD",
  border: "#E3EAF2",
  borderSoft: "#EEF3F8",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.48)",
  accent: "#1EA7E8",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
};

/** Productos por página (consulta con .range()). */
const PAGE_SIZE = 24;

/** Solo lo que pinta la tarjeta (antes se pedían joins y columnas de más). */
const PRODUCT_COLUMNS = "id,title,description,price_eur,status,images";

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

type ProductDbRow = {
  id: string;
  title: string | null;
  description: string | null;
  price_eur: number | string | null;
  status: DbStatus | null;
  images?: string[] | null;
};

type ProductMediaRow = {
  product_id: string;
  public_url?: string | null;
  sort_order?: number | null;
  is_cover?: boolean | null;
};

type Product = {
  id: string;
  title: string;
  description: string | null;
  status: UiStatus;
  priceEUR: number;
  imageUrl: string | null;
};

type ListFilters = {
  adminFlag: boolean;
  statusFilter: UiFilter;
  categoryId: string | null;
  condition: ConditionFilter;
  price: PriceFilter;
  sort: SortKey;
  queryText: string;
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

// Precio siempre con dos decimales, coma decimal y miles con punto (155,00€ · 1.299,00€).
function fmtEUR(n: number) {
  const v = Number(n);
  const cents = Math.round((Number.isFinite(v) ? v : 0) * 100);
  const [ent, dec] = (Math.abs(cents) / 100).toFixed(2).split(".");
  return `${cents < 0 ? "-" : ""}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}€`;
}

function mapDbStatusToUi(s: DbStatus): UiStatus {
  if (s === "PUBLISHED") return "PUBLICADA";
  if (s === "DRAFT") return "LISTA";
  return "REVISAR";
}

function uiFilterToDb(f: UiFilter): DbStatus | null {
  if (f === "PUBLICADA") return "PUBLISHED";
  if (f === "LISTA") return "DRAFT";
  if (f === "REVISAR") return "REVIEW";
  return null;
}

function adminStatusLabel(s: UiStatus) {
  if (s === "PUBLICADA") return "Publicada";
  if (s === "LISTA") return "Lista";
  return "Por revisar";
}

// Color del texto del estado interno (solo lo ve el administrador).
function adminStatusColor(s: UiStatus) {
  if (s === "PUBLICADA") return "#15803D";
  if (s === "LISTA") return "#92660B";
  return "#B91C1C";
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
  return cats.find((c) => c.slug === rawCat) ?? cats.find((c) => c.id === rawCat);
}


function firstImageFromAnyRow(row: ProductDbRow | null | undefined): string | null {
  const imgs = row?.images;
  if (Array.isArray(imgs) && imgs.length > 0) {
    const first = imgs.find((v: unknown) => typeof v === "string" && v.trim());
    if (typeof first === "string" && first.trim()) return first.trim();
  }
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
  const hero = sorted.find((m) => typeof m.public_url === "string" && m.public_url.trim());
  if (hero?.public_url) return hero.public_url.trim();
  return firstImageFromAnyRow(productRow);
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

/**
 * Una página de productos con TODOS los filtros y el orden aplicados en la
 * consulta (así .range() y el total son correctos).
 */
async function fetchProductsPage(
  f: ListFilters,
  offset: number
): Promise<{ rows: ProductDbRow[]; total: number | null }> {
  let query = supabase.from("products").select(PRODUCT_COLUMNS, { count: "exact" });

  if (!f.adminFlag) {
    query = query.eq("is_active", true).eq("status", "PUBLISHED");
  } else {
    const dbStatus = uiFilterToDb(f.statusFilter);
    if (dbStatus) query = query.eq("status", dbStatus);
  }

  if (f.categoryId) query = query.eq("category_id", f.categoryId);

  if (f.condition === "NEW") {
    query = query.eq("condition", "NEW");
  } else if (f.condition === "USED") {
    query = query.in("condition", [...USED_CONDITIONS]);
  } else if (f.condition !== "ALL") {
    query = query.eq("condition", f.condition);
  }

  if (f.price === "UP_25") {
    query = query.lte("price_eur", 25);
  } else if (f.price === "25_100") {
    query = query.gt("price_eur", 25).lte("price_eur", 100);
  } else if (f.price === "100_300") {
    query = query.gt("price_eur", 100).lte("price_eur", 300);
  } else if (f.price === "OVER_300") {
    query = query.gt("price_eur", 300);
  }

  if (f.queryText) {
    const safeQuery = f.queryText.replace(/[%(),*]/g, " ").trim();
    if (safeQuery) {
      const pattern = `%${safeQuery}%`;
      query = query.or(`title.ilike.${pattern},description.ilike.${pattern}`);
    }
  }

  if (f.sort === "PRICE_ASC") {
    query = query.order("price_eur", { ascending: true, nullsFirst: false });
  } else if (f.sort === "PRICE_DESC") {
    query = query.order("price_eur", { ascending: false, nullsFirst: false });
  } else if (f.sort === "MOST_VIEWED") {
    query = query.order("view_count", { ascending: false, nullsFirst: false });
  }
  // Desempate estable para que la paginación no repita ni salte productos.
  query = query.order("created_at", { ascending: false }).order("id", { ascending: true });

  const { data, error, count } = await query.range(offset, offset + PAGE_SIZE - 1);
  if (error) throw error;

  return { rows: asArray<ProductDbRow>(data), total: typeof count === "number" ? count : null };
}

/** Fotos (solo imágenes) de los productos de UNA página (máx. 24 ids). */
async function fetchCoverMap(productIds: string[]) {
  const map = new Map<string, ProductMediaRow[]>();
  if (!productIds.length) return map;

  const { data, error } = await supabase
    .from("product_media")
    .select("product_id,public_url,sort_order,is_cover")
    .eq("kind", "image")
    .in("product_id", productIds);

  // Si falla, las tarjetas usan products.images como respaldo: no se rompe
  // la página por las fotos.
  if (error) {
    console.warn("No se pudieron cargar las fotos del catálogo:", error.message);
    return map;
  }

  for (const row of asArray<ProductMediaRow>(data)) {
    if (!row?.product_id) continue;
    const list = map.get(row.product_id) ?? [];
    list.push(row);
    map.set(row.product_id, list);
  }

  return map;
}

function mapRows(rows: ProductDbRow[], mediaMap: Map<string, ProductMediaRow[]>): Product[] {
  return rows.map((row) => ({
    id: row.id,
    title: String(row.title ?? ""),
    description: row.description ?? null,
    status: mapDbStatusToUi((row.status ?? "DRAFT") as DbStatus),
    priceEUR: Number(row.price_eur ?? 0),
    imageUrl: pickHeroImage(row, mediaMap.get(row.id) ?? []),
  }));
}

export default function CatalogoScreen() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const isTablet = widthSafe >= 700 && widthSafe < 1024;
  const pagePadding = isMobile ? 12 : 16;

  const params = useLocalSearchParams<{ cat?: string; categoria?: string; query?: string }>();
  const rawCat =
    typeof params.cat === "string" && params.cat
      ? params.cat
      : typeof params.categoria === "string" && params.categoria
        ? params.categoria
        : undefined;
  const queryFromUrl = typeof params.query === "string" ? params.query.trim() : "";

  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Filtros
  const [filter, setFilter] = useState<UiFilter>("ALL");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [condition, setCondition] = useState<ConditionFilter>("ALL");
  const [price, setPrice] = useState<PriceFilter>("ALL");
  const [sort, setSort] = useState<SortKey>("NEWEST");
  const [q, setQ] = useState(queryFromUrl);
  // «Avísame cuando llegue» desde una búsqueda sin resultados (lo avisa Blue, components/Campanita.tsx).
  const [avisoMsg, setAvisoMsg] = useState<string | null>(null);
  const avisarCuandoLlegue = useCallback(async () => {
    const r = await crearAvisoBusqueda(q);
    if (r === "ok") setAvisoMsg("Hecho: Blue te avisará en cuanto llegue.");
    else if (r === "sin_sesion") router.push(`/perfil?aviso=${encodeURIComponent("Inicia sesión para que te avisemos cuando llegue")}` as Href);
    else if (r === "limite") setAvisoMsg("Ya tienes 10 avisos: quita alguno desde las notificaciones de Blue.");
    else setAvisoMsg("No se ha podido crear el aviso. Inténtalo de nuevo.");
  }, [q]);
  useEffect(() => setAvisoMsg(null), [q]);
  const [appliedQuery, setAppliedQuery] = useState(queryFromUrl);

  const [contactBusy, setContactBusy] = useState(false);

  const bootedRef = useRef(false);
  const reqSeqRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const prevRawCatRef = useRef(rawCat);
  const prevQueryRef = useRef(queryFromUrl);

  // Móvil: 1 producto se ve grande; con 2 o más, rejilla de 2 columnas.
  const cols = useMemo(() => {
    if (isMobile) return items.length > 1 ? 2 : 1;
    return calcColumns(widthSafe);
  }, [isMobile, items.length, widthSafe]);

  const effectiveFilter: UiFilter = isAdmin ? filter : "PUBLICADA";

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId),
    [categories, categoryId]
  );

  const categoryOptions: CatalogCategoryOption[] = useMemo(
    () => categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
    [categories]
  );

  const pageTitle = useMemo(() => {
    if (selectedCategory?.name) return selectedCategory.name;
    if (!ready && rawCat) return legacyCatLabel(rawCat) ?? "Catálogo";
    return "Catálogo";
  }, [selectedCategory, ready, rawCat]);

  const hasActiveFilters =
    !!categoryId ||
    condition !== "ALL" ||
    price !== "ALL" ||
    !!appliedQuery ||
    (isAdmin && filter !== "ALL");

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

  const currentFilters: ListFilters = useMemo(
    () => ({
      adminFlag: isAdmin,
      statusFilter: effectiveFilter,
      categoryId,
      condition,
      price,
      sort,
      queryText: appliedQuery.trim(),
    }),
    [isAdmin, effectiveFilter, categoryId, condition, price, sort, appliedQuery]
  );

  // Primera página con los filtros actuales (sustituye la lista).
  const loadFirstPage = useCallback(async (f: ListFilters) => {
    const seq = ++reqSeqRef.current;
    loadingMoreRef.current = false;
    setLoadingMore(false);
    setRefreshing(true);
    setErr(null);
    try {
      const { rows, total: count } = await fetchProductsPage(f, 0);
      if (seq !== reqSeqRef.current) return;
      const mediaMap = await fetchCoverMap(rows.map((r) => r.id));
      if (seq !== reqSeqRef.current) return;

      setItems(mapRows(rows, mediaMap));
      setTotal(count);
      setHasMore(count !== null ? rows.length < count : rows.length === PAGE_SIZE);
    } catch (e) {
      if (seq !== reqSeqRef.current) return;
      console.error("Error cargando catálogo:", e);
      setErr("No hemos podido cargar el catálogo. Comprueba tu conexión e inténtalo de nuevo.");
      setItems([]);
      setTotal(null);
      setHasMore(false);
    } finally {
      if (seq === reqSeqRef.current) {
        setRefreshing(false);
        setLoading(false);
      }
    }
  }, []);

  // Página siguiente (se añade al final de la lista).
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore || refreshing) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const seq = reqSeqRef.current;
    try {
      const { rows, total: count } = await fetchProductsPage(currentFilters, items.length);
      if (seq !== reqSeqRef.current) return;
      const mediaMap = await fetchCoverMap(rows.map((r) => r.id));
      if (seq !== reqSeqRef.current) return;

      const seen = new Set(items.map((p) => p.id));
      const next = [...items, ...mapRows(rows, mediaMap).filter((p) => !seen.has(p.id))];
      setItems(next);
      setTotal(count);
      setHasMore(
        rows.length > 0 && (count !== null ? next.length < count : rows.length === PAGE_SIZE)
      );
    } catch (e) {
      if (seq !== reqSeqRef.current) return;
      console.error("Error cargando más productos:", e);
      setErr("No hemos podido cargar más productos. Inténtalo de nuevo en unos segundos.");
    } finally {
      if (seq === reqSeqRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [hasMore, refreshing, currentFilters, items]);

  // Al entrar: quién eres y las categorías (una sola vez). La categoría de la
  // URL se resuelve aquí para que la primera consulta ya vaya filtrada.
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    (async () => {
      const adminFlag = await detectAdmin();
      let cats: CategoryRow[] = [];
      try {
        cats = await fetchCategoriesSafe(adminFlag);
      } catch (e) {
        console.error("Error cargando categorías:", e);
      }
      setIsAdmin(adminFlag);
      setCategories(cats);
      setCategoryId(resolveCategory(rawCat, cats)?.id ?? null);
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cualquier cambio de filtro/orden/búsqueda → primera página de nuevo.
  useEffect(() => {
    if (!ready) return;
    loadFirstPage(currentFilters);
  }, [ready, currentFilters, loadFirstPage]);

  // Si cambia la URL estando ya en la pantalla (?cat= / ?query=), se respeta.
  useEffect(() => {
    if (prevRawCatRef.current === rawCat) return;
    prevRawCatRef.current = rawCat;
    setCategoryId(resolveCategory(rawCat, categories)?.id ?? null);
  }, [rawCat, categories]);

  useEffect(() => {
    if (prevQueryRef.current === queryFromUrl) return;
    prevQueryRef.current = queryFromUrl;
    setQ(queryFromUrl);
    setAppliedQuery(queryFromUrl);
  }, [queryFromUrl]);

  // Analítica: "Categoría" o "Categoría {nombre}" al entrar y en cada cambio
  // real de categoría (analyticsCatKeyRef evita repetir el mismo).
  const analyticsCatKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    const key = categoryId ?? "";
    if (analyticsCatKeyRef.current === key) return;
    analyticsCatKeyRef.current = key;

    const label = selectedCategory?.name ? `Categoría ${selectedCategory.name}` : "Categoría";
    trackEvent("page_view", label, {
      path: "/catalogo",
      metadata: { cat: selectedCategory?.slug ?? rawCat ?? null },
    });
  }, [ready, categoryId, selectedCategory, rawCat]);

  function clearFilters() {
    setCategoryId(null);
    setCondition("ALL");
    setPrice("ALL");
    setFilter("ALL");
    setQ("");
    setAppliedQuery("");
    if (rawCat || queryFromUrl) replaceRoute("/catalogo" as Href);
  }

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    if (contentOffset.y > 40) {
      trackEventThrottled("catalogo-scroll", "scroll", "Scroll", { path: "/catalogo" });
    }
    // Carga automática al acercarse al final (además del botón).
    const distanceToEnd = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    if (distanceToEnd < 600 && hasMore && !loadingMoreRef.current && !refreshing) {
      loadMore();
    }
  }

  // "Chatear con nosotros": con sesión abre (o reutiliza) el chat general de
  // soporte; sin sesión, manda primero a iniciar sesión.
  async function handleContactPress() {
    if (contactBusy) return;
    setContactBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user) {
        pushRoute("/perfil" as Href);
        return;
      }

      const { data: chatId, error } = await supabase.rpc("get_or_create_support_chat");
      if (error) throw error;

      router.push({ pathname: "/chat/[chatId]", params: { chatId: String(chatId) } } as any);
    } catch (e) {
      console.error("Error abriendo el chat de soporte:", e);
    } finally {
      setContactBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      {/* Botón de volver flotante en la esquina superior izquierda. */}
      <Pressable
        onPress={smartBack}
        hitSlop={8}
        accessibilityLabel="Volver"
        style={({ pressed }) => ({
          position: "absolute",
          top: 14,
          left: 16,
          zIndex: 10,
          width: 38,
          height: 38,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#FFFFFF",
          borderWidth: 1,
          borderColor: COLORS.border,
          opacity: pressed ? 0.85 : 1,
          shadowColor: "#000",
          shadowOpacity: 0.08,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 3,
        })}
      >
        <Ionicons name="chevron-back" size={22} color={COLORS.text} />
      </Pressable>

      <ScrollView
        // 96 abajo: la última fila de productos y el botón "cargar más" quedan por encima
        // del asistente flotante Blue (72 px en la esquina inferior).
        contentContainerStyle={{ paddingBottom: 96 }}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        // Buscador dentro de la lista: el primer toque ya funciona y al arrastrar se cierra el teclado.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View
          style={{
            backgroundColor: COLORS.bg2,
            borderBottomWidth: 1,
            borderBottomColor: "#F6FAFD",
            paddingHorizontal: pagePadding,
            // +40 para que el título no quede bajo el botón de volver.
            paddingTop: (isMobile ? 12 : 14) + 40,
            paddingBottom: isMobile ? 14 : 18,
            alignItems: "center",
          }}
        >
          <View style={{ width: "100%", maxWidth: 1240, gap: 14 }}>
            <View style={{ alignItems: "center" }}>
              <Text
                accessibilityRole="header"
                {...({ "aria-level": 1 } as object)}
                style={{
                  color: COLORS.text,
                  fontSize: isMobile ? 24 : 28,
                  fontWeight: "900",
                  letterSpacing: -0.5,
                  lineHeight: isMobile ? 30 : 34,
                  textAlign: "center",
                }}
              >
                {pageTitle}
              </Text>
            </View>

            {/* Buscador compartido (components/Barramagic.tsx), modo "input":
                busca al pulsar intro y limpia con la "x". */}
            <Barramagic
              isMobile={isMobile}
              mode="input"
              value={q}
              onChangeText={setQ}
              onSubmit={() => setAppliedQuery(q.trim())}
              onClear={() => {
                setQ("");
                setAppliedQuery("");
              }}
              placeholder={isMobile ? "Buscar productos..." : "Buscar consola, videojuego, accesorio..."}
            />

            {/* Botón "Filtros" con panel: dentro van todos los filtros (y, para
                admin, el estado interno de publicación). */}
            <CatalogFilters
              extraTitle="Estado interno"
              extraActiveCount={isAdmin && filter !== "ALL" ? 1 : 0}
              extraContent={
                isAdmin ? (
                  <>
                    <Chip active={filter === "ALL"} label="Todos" onPress={() => setFilter("ALL")} isMobile={isMobile} />
                    <Chip
                      active={filter === "PUBLICADA"}
                      label="Publicadas"
                      onPress={() => setFilter("PUBLICADA")}
                      isMobile={isMobile}
                    />
                    <Chip active={filter === "LISTA"} label="Listas" onPress={() => setFilter("LISTA")} isMobile={isMobile} />
                    <Chip
                      active={filter === "REVISAR"}
                      label="Por revisar"
                      onPress={() => setFilter("REVISAR")}
                      isMobile={isMobile}
                    />
                  </>
                ) : undefined
              }
              isMobile={isMobile}
              categories={categoryOptions}
              categoryId={categoryId}
              onCategoryChange={(c) => setCategoryId(c?.id ?? null)}
              condition={condition}
              onConditionChange={setCondition}
              price={price}
              onPriceChange={setPrice}
              sort={sort}
              onSortChange={setSort}
              total={loading ? null : total}
              busy={refreshing && !loading}
              hasActiveFilters={hasActiveFilters}
              onClear={clearFilters}
            />

            {err ? (
              <View style={{ alignItems: "center" }}>
                <Text style={{ color: "#B91C1C", fontWeight: "900", textAlign: "center" }}>
                  Error cargando catálogo
                </Text>
                <Text style={{ color: "#7A271A", marginTop: 4, lineHeight: 20, textAlign: "center" }}>
                  {err}
                </Text>
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
            <CargaMarca texto="Cargando productos…" />
          </View>
        ) : (
          <View style={{ paddingHorizontal: pagePadding, paddingTop: 16, alignItems: "center" }}>
            <View
              style={{
                width: "100%",
                maxWidth: 1240,
                gap: 14,
                // Mientras se recalcula con otros filtros, la lista anterior se
                // atenúa en vez de desaparecer de golpe.
                opacity: refreshing ? 0.55 : 1,
              }}
            >
              {items.length === 0 ? (
                <View style={{ alignItems: "center", gap: 12, paddingVertical: 24 }}>
                  <MarcaAnimada cual="tienda" ancho={130} />
                  <Text
                    style={{
                      color: COLORS.text,
                      fontWeight: "900",
                      fontSize: isMobile ? 18 : 20,
                      textAlign: "center",
                    }}
                  >
                    {hasActiveFilters
                      ? "No hay productos con estos filtros"
                      : "Ahora mismo no hay productos publicados"}
                  </Text>

                  <Text style={{ color: COLORS.muted, lineHeight: 21, textAlign: "center", maxWidth: 560 }}>
                    {hasActiveFilters
                      ? "Prueba a quitar algún filtro o a buscar con otras palabras."
                      : "Vuelve a pasarte pronto o escríbenos por chat si buscas algo concreto."}
                  </Text>

                  {hasActiveFilters ? (
                    <Pressable
                      onPress={clearFilters}
                      accessibilityRole="button"
                      style={({ pressed }) => ({
                        opacity: pressed ? 0.88 : 1,
                        alignSelf: isMobile ? "stretch" : "center",
                        borderRadius: 999,
                        paddingVertical: 12,
                        paddingHorizontal: 18,
                        backgroundColor: COLORS.accent,
                        marginTop: 4,
                      })}
                    >
                      <Text style={{ color: "#FFFFFF", fontWeight: "900", textAlign: "center" }}>
                        Quitar filtros
                      </Text>
                    </Pressable>
                  ) : null}

                  {q.trim().length >= 2 ? (
                    avisoMsg ? (
                      <Text style={{ color: COLORS.muted, fontWeight: "800", textAlign: "center" }}>{avisoMsg}</Text>
                    ) : (
                      <Pressable
                        onPress={avisarCuandoLlegue}
                        accessibilityRole="button"
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.88 : 1,
                          alignSelf: isMobile ? "stretch" : "center",
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          borderRadius: 999,
                          paddingVertical: 12,
                          paddingHorizontal: 18,
                          borderWidth: 1.5,
                          borderColor: COLORS.accent,
                        })}
                      >
                        <Ionicons name="notifications-outline" size={16} color={COLORS.accent} />
                        <Text style={{ color: COLORS.accent, fontWeight: "900", textAlign: "center" }}>
                          Avísame cuando llegue «{q.trim().slice(0, 40)}»
                        </Text>
                      </Pressable>
                    )
                  ) : null}
                </View>
              ) : (
                <Grid columns={cols} gap={14}>
                  {productCards}
                </Grid>
              )}

              {items.length > 0 && hasMore ? (
                <View style={{ alignItems: "center", paddingTop: 6 }}>
                  <Pressable
                    onPress={loadMore}
                    disabled={loadingMore}
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      opacity: loadingMore ? 0.7 : pressed ? 0.88 : 1,
                      alignSelf: isMobile ? "stretch" : "center",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      borderRadius: 999,
                      paddingVertical: 14,
                      paddingHorizontal: 22,
                      backgroundColor: COLORS.accent,
                    })}
                  >
                    {loadingMore ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
                    <Text style={{ color: "#FFFFFF", fontWeight: "900", textAlign: "center" }}>
                      {loadingMore ? "Cargando…" : "Ver más productos"}
                    </Text>
                  </Pressable>
                  {total !== null ? (
                    <Text style={{ color: COLORS.muted2, fontSize: 12, marginTop: 8, textAlign: "center" }}>
                      Mostrando {items.length} de {total}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {items.length > 0 && !isAdmin && !hasMore ? (
                <View style={{ alignItems: "center", gap: 10, paddingTop: 12 }}>
                  <Text
                    style={{
                      color: COLORS.text,
                      fontWeight: "900",
                      fontSize: isMobile ? 17 : 18,
                      textAlign: "center",
                    }}
                  >
                    ¿No encuentras exactamente lo que buscas?
                  </Text>
                  <Text
                    style={{
                      color: COLORS.muted,
                      lineHeight: 20,
                      textAlign: "center",
                      maxWidth: 640,
                    }}
                  >
                    Escríbenos por chat: te confirmamos al momento si podemos conseguirlo,
                    reservarlo o proponerte una alternativa.
                  </Text>

                  <Pressable
                    onPress={handleContactPress}
                    disabled={contactBusy}
                    style={({ pressed }) => ({
                      opacity: contactBusy ? 0.6 : pressed ? 0.88 : 1,
                      alignSelf: isMobile ? "stretch" : "center",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      borderRadius: 999,
                      paddingVertical: 14,
                      paddingHorizontal: 18,
                      backgroundColor: COLORS.accent,
                    })}
                  >
                    {contactBusy ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name="chatbubble-ellipses-outline" size={16} color="#FFFFFF" />
                    )}
                    <Text style={{ color: "#FFFFFF", fontWeight: "900", textAlign: "center" }}>
                      Chatear con nosotros
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
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
  // Reparto en filas memorizado: solo se rehace si cambian hijos o columnas.
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

const ProductCard = React.memo(function ProductCard({
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
  // Mismo diseño que las tarjetas de Inicio (CategoryProductsShelf): fondo suave sin borde,
  // foto entera sobre blanco, título completo y precio en azul. Sin etiquetas ni botones
  // decorativos: toda la tarjeta es el enlace. Solo el administrador ve, en texto y sin
  // recuadro, el estado interno del artículo.
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${p.title}, ${fmtEUR(p.priceEUR)}`}
      style={({ pressed }) => ({
        opacity: pressed ? 0.9 : 1,
        borderRadius: 16,
        backgroundColor: COLORS.card,
        padding: compact ? 8 : 10,
        alignItems: "center",
      })}
    >
      <View
        style={{
          width: "100%",
          height: compact ? 150 : isMobile ? 200 : 180,
          borderRadius: 12,
          overflow: "hidden",
          backgroundColor: "#FFFFFF",
          position: "relative",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {p.imageUrl ? (
          <SmartImage uri={p.imageUrl} contentFit="contain" style={{ width: "100%", height: "100%" }} />
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
            <Text style={{ color: "rgba(11,33,56,0.15)", fontWeight: "900", fontSize: 40 }}>VG</Text>
            <Text style={{ color: COLORS.muted2, fontSize: 12, marginTop: 6, textAlign: "center" }}>
              Foto no disponible
            </Text>
          </View>
        )}
      </View>

      {/* Sin numberOfLines a propósito: el título se ve completo, en dos o tres líneas. */}
      <Text
        style={{
          color: COLORS.text,
          fontWeight: "800",
          fontSize: compact ? 13 : 14.5,
          lineHeight: compact ? 17 : 19,
          marginTop: 8,
          textAlign: "center",
        }}
      >
        {p.title}
      </Text>

      <Text
        style={{
          color: COLORS.accent,
          fontWeight: "900",
          fontSize: compact ? 16 : 18,
          marginTop: 4,
          textAlign: "center",
        }}
      >
        {fmtEUR(p.priceEUR)}
      </Text>

      {isAdmin ? (
        <Text style={{ color: adminStatusColor(p.status), fontWeight: "800", fontSize: 11.5, marginTop: 4, textAlign: "center" }}>
          {adminStatusLabel(p.status)}
        </Text>
      ) : null}
    </Pressable>
  );
});
