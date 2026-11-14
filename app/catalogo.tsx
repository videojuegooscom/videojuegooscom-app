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
 *   categoría, ?query= con el texto de búsqueda y (mejora 3, 2026-11-14)
 *   ?estado= (nuevo, segunda-mano, como-nuevo, bueno, regular, para-piezas),
 *   ?precio_min= y ?precio_max= (1–1000; sin precio_max = «1000 € o más»):
 *   el estado y el precio se leen SIEMPRE de la dirección, así se pueden
 *   compartir y no se pierden al volver atrás. Encima de la lista, un chip por
 *   filtro activo con su «Quitar» y «Borrar filtros».
 * - Búsqueda con texto (mejora 3): ya no es un ilike. Se busca en el índice
 *   ligero de components/Barramagic.tsx (sin fotos; una vez cada 5 min) con
 *   sinónimos («play 5» = «ps5» = «PlayStation 5»), plurales y errores de
 *   escritura, por relevancia, y solo se piden las 24 filas de la página.
 *   Sin resultados: «No hemos encontrado «x»», «¿Querías decir «y»?» y «Ver
 *   todo el catálogo». Mientras se escribe, hasta 6 sugerencias (flechas e
 *   Intro en el ordenador). Si el índice no carga, se busca como antes.
 *   Analítica: busqueda, busqueda_sin_resultados, busqueda_sugerencia_tocada
 *   y catalogo_filtro (Administración → Analítica → «Búsquedas (30 días)»).
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
 * - components/CategoryProductsShelf.tsx → la tarjeta y la rejilla (TarjetaProducto, RejillaTarjetas), las mismas
 *   de Inicio y Servicios.
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
  type TextInputKeyPressEventData,
  useWindowDimensions,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { trackEvent, trackEventThrottled } from "../lib/analytics";
import Barramagic, {
  SugerenciasCatalogo,
  buscarProductos,
  cargarIndiceBusqueda,
  medirBusqueda,
  medirSugerenciaTocada,
  useSugerenciasProductos,
  type ProductoIndice,
} from "../components/Barramagic";
import { colorTextoAzul } from "../constants/theme";
import MarcaAnimada from "../components/marca/MarcaAnimada";
import CargaMarca from "../components/marca/CargaMarca";
import CabeceraMarca from "../components/CabeceraMarca";
import PortadasCategoria, { enterasInicioDe, esCategoriaServicios, faltaColumnaPortadas, portadasDe } from "../components/PortadasCategoria";
import { useRecarga } from "../components/TirarParaActualizar";
import { crearAvisoBusqueda } from "../components/Campanita";
import { RejillaTarjetas, TarjetaProducto } from "../components/CategoryProductsShelf";
import CatalogFilters, {
  Chip,
  PRECIO_MAX,
  PRECIO_MIN,
  USED_CONDITIONS,
  estadoAUrl,
  estadoDeUrl,
  nombreEstado,
  precioActivo,
  precioDeUrl,
  textoPrecio,
  type CatalogCategoryOption,
  type FiltrosDisponibles,
  type ConditionFilter,
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
  muted2: "rgba(11,33,56,0.62)",
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
  // Portadas (panel → Categorías); la cabecera de la categoría las pasa en carrusel.
  image_url?: string | null;
  imagenes?: unknown;
  // Encuadres de Inicio; «entera» = la portada se ve completa también aquí.
  portadas_inicio?: unknown;
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
  /** 1–1000 (1 = sin mínimo; 1000 = «1000 € o más», sin tope). */
  priceMin: number;
  priceMax: number;
  sort: SortKey;
  queryText: string;
};

/** Cómo fue la búsqueda (para «¿Querías decir…?» y la analítica propia). */
type InfoBusqueda = { sinonimo: boolean; correccion: boolean; sugerencia: string | null };

function pushRoute(route: Href) {
  router.push(route);
}

function replaceRoute(route: Href) {
  router.replace(route);
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
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
  const consultar = (columnas: string) =>
    supabase
      .from("categories")
      .select(columnas)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

  // Con las portadas y cuáles van enteras (portadas_inicio); si aún falta alguna columna (migración pendiente), sin ella.
  let conPortadas = await consultar("id,name,slug,is_active,sort_order,image_url,imagenes,portadas_inicio");
  if (conPortadas.error) conPortadas = await consultar("id,name,slug,is_active,sort_order,image_url,imagenes");
  const { data, error } =
    conPortadas.error && faltaColumnaPortadas(conPortadas.error) ? await consultar("id,name,slug,is_active,sort_order") : conPortadas;

  if (error) throw error;

  const rows = asArray<CategoryRow>(data);
  // «Reparación / Limpieza» solo guarda la portada del recuadro de Inicio que lleva a Servicios: no tiene productos.
  return rows.filter((c) => !esCategoriaServicios(c.slug) && (adminFlag ? true : !!c.is_active));
}

/**
 * Una página de productos con TODOS los filtros y el orden aplicados en la
 * consulta (así .range() y el total son correctos).
 */
async function fetchProductsPage(
  f: ListFilters,
  offset: number
): Promise<{ rows: ProductDbRow[]; total: number | null; busqueda?: InfoBusqueda }> {
  // Con texto: búsqueda tolerante en el índice ligero (components/Barramagic.tsx) y luego solo esa página de filas.
  if (f.queryText) {
    const porIndice = await fetchProductsPageBuscando(f, offset);
    if (porIndice) return porIndice;
  }
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

  if (f.priceMin > PRECIO_MIN) query = query.gte("price_eur", f.priceMin);
  if (f.priceMax < PRECIO_MAX) query = query.lte("price_eur", f.priceMax);

  // Solo si el índice de búsqueda no se ha podido cargar: la búsqueda de siempre (texto tal cual).
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

/** Mismo orden que la consulta (fecha de alta, y el id para desempatar) cuando se busca en el índice. */
function ordenarIndice(lista: ProductoIndice[], sort: SortKey): ProductoIndice[] {
  const porFecha = (a: ProductoIndice, b: ProductoIndice) => (a.creado < b.creado ? 1 : a.creado > b.creado ? -1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const copia = [...lista];
  if (sort === "PRICE_ASC") copia.sort((a, b) => a.precio - b.precio || porFecha(a, b));
  else if (sort === "PRICE_DESC") copia.sort((a, b) => b.precio - a.precio || porFecha(a, b));
  else if (sort === "MOST_VIEWED") copia.sort((a, b) => b.vistas - a.vistas || porFecha(a, b));
  else copia.sort(porFecha);
  return copia;
}

/**
 * Búsqueda con texto: filtra el índice (estado, categoría, condición y precio, igual que la consulta), busca con
 * sinónimos, plurales y errores de escritura, ordena por relevancia y pide a Supabase SOLO las 24 filas de esa página.
 * null = el índice no se ha podido cargar (se busca como antes).
 */
async function fetchProductsPageBuscando(
  f: ListFilters,
  offset: number
): Promise<{ rows: ProductDbRow[]; total: number; busqueda: InfoBusqueda } | null> {
  const indice = await cargarIndiceBusqueda(f.adminFlag);
  if (!indice) return null;
  const dbStatus = f.adminFlag ? uiFilterToDb(f.statusFilter) : null;
  const usados: readonly string[] = USED_CONDITIONS;
  const lista = indice.productos.filter(
    (p) =>
      (!dbStatus || p.estado === dbStatus) &&
      (!f.categoryId || p.categoriaId === f.categoryId) &&
      (f.condition === "ALL" || (f.condition === "USED" ? usados.includes(p.condicion ?? "") : p.condicion === f.condition)) &&
      (f.priceMin <= PRECIO_MIN || p.precio >= f.priceMin) &&
      (f.priceMax >= PRECIO_MAX || p.precio <= f.priceMax)
  );
  const r = buscarProductos(ordenarIndice(lista, f.sort), f.queryText);
  const ids = r.productos.slice(offset, offset + PAGE_SIZE).map((p) => p.id);
  let rows: ProductDbRow[] = [];
  if (ids.length) {
    const { data, error } = await supabase.from("products").select(PRODUCT_COLUMNS).in("id", ids);
    if (error) throw error;
    const porId = new Map(asArray<ProductDbRow>(data).map((row) => [row.id, row]));
    rows = ids.map((id) => porId.get(id)).filter((row): row is ProductDbRow => !!row);
  }
  return { rows, total: r.productos.length, busqueda: { sinonimo: r.sinonimo, correccion: r.correccion, sugerencia: r.sugerencia } };
}

/** Fotos (solo imágenes) de los productos de UNA página (máx. 24 ids). */
async function fetchCoverMap(productIds: string[]) {
  const map = new Map<string, ProductMediaRow[]>();
  if (!productIds.length) return map;

  const { data, error } = await supabase
    .from("product_media")
    .select("product_id,public_url,sort_order,is_cover")
    .eq("kind", "image")
    .in("product_id", productIds)
    // Solo la portada de cada producto (marcada o la primera), no las filas de todas sus fotos (hasta 30).
    .or("is_cover.eq.true,sort_order.eq.0");

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
  const pagePadding = isMobile ? 12 : 16;

  const params = useLocalSearchParams<{ cat?: string; categoria?: string; query?: string; estado?: string; precio_min?: string; precio_max?: string }>();
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
  // Estado y precio viven en la dirección (?estado=bueno&precio_min=20&precio_max=300): se pueden compartir y no se
  // pierden al volver atrás (mejora 3, 2026-11-14).
  const condition: ConditionFilter = estadoDeUrl(typeof params.estado === "string" ? params.estado : undefined);
  const minUrl = precioDeUrl(typeof params.precio_min === "string" ? params.precio_min : undefined, PRECIO_MIN);
  const maxUrl = precioDeUrl(typeof params.precio_max === "string" ? params.precio_max : undefined, PRECIO_MAX);
  const priceMin = Math.min(minUrl, maxUrl);
  const priceMax = Math.max(minUrl, maxUrl);
  const setCondition = useCallback((c: ConditionFilter) => {
    router.setParams({ estado: estadoAUrl(c) });
    if (c !== "ALL") trackEvent("catalogo_filtro", "Filtro: estado", { path: "/catalogo", metadata: { filtro: "estado", valor: c } });
  }, []);
  const setPrice = useCallback((min: number, max: number) => {
    router.setParams({ precio_min: min > PRECIO_MIN ? String(min) : undefined, precio_max: max < PRECIO_MAX ? String(max) : undefined });
    if (precioActivo(min, max)) {
      trackEvent("catalogo_filtro", "Filtro: precio", { path: "/catalogo", metadata: { filtro: "precio", min, max: max >= PRECIO_MAX ? null : max } });
    }
  }, []);
  const [sort, setSort] = useState<SortKey>("NEWEST");
  const [q, setQ] = useState(queryFromUrl);
  // «Avísame cuando llegue» desde una búsqueda sin resultados (lo avisa Blue, components/Campanita.tsx).
  const [avisoMsg, setAvisoMsg] = useState<string | null>(null);
  const avisarCuandoLlegue = useCallback(async () => {
    const r = await crearAvisoBusqueda(q);
    if (r === "ok") setAvisoMsg("Hecho: Blue te avisará en cuanto llegue.");
    else if (r === "sin_sesion") router.push(`/perfil?aviso=${encodeURIComponent("Inicia sesión para que te avisemos cuando llegue")}` as Href);
    else if (r === "limite") setAvisoMsg("Ya tienes 10 avisos: quita alguno desde «Noticias y avisos» de Blue.");
    else setAvisoMsg("No se ha podido crear el aviso. Inténtalo de nuevo.");
  }, [q]);
  useEffect(() => setAvisoMsg(null), [q]);
  const [appliedQuery, setAppliedQuery] = useState(queryFromUrl);
  // «¿Querías decir…?» y cómo fue la última búsqueda (sinónimo, corrección).
  const [infoBusqueda, setInfoBusqueda] = useState<InfoBusqueda | null>(null);

  // Sugerencias mientras se escribe (desde 2 letras, como mucho 6): con el campo activo y algo distinto de lo buscado.
  const [enfocado, setEnfocado] = useState(false);
  const [activo, setActivo] = useState(-1);
  const cierreSugerencias = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textoEscrito = q.trim();
  const verSugerencias = enfocado && textoEscrito.length >= 2 && textoEscrito !== appliedQuery.trim();
  const sugerencias = useSugerenciasProductos(q, 6, verSugerencias);
  useEffect(() => setActivo(-1), [q]);
  useEffect(
    () => () => {
      if (cierreSugerencias.current) clearTimeout(cierreSugerencias.current);
    },
    []
  );

  // Buscar lo escrito: se aplica y queda en la dirección (?query=), como los filtros.
  const aplicarBusqueda = useCallback((texto: string) => {
    const t = texto.trim();
    setQ(t);
    setAppliedQuery(t);
    router.setParams({ query: t || undefined });
  }, []);

  const elegirSugerencia = useCallback(
    (i: number) => {
      const p = sugerencias.productos[i];
      if (!p) return;
      medirBusqueda("catalogo", q, sugerencias);
      medirSugerenciaTocada("catalogo", q, i);
      if (cierreSugerencias.current) clearTimeout(cierreSugerencias.current);
      setEnfocado(false);
      pushRoute(`/producto/${p.id}` as Href);
    },
    [q, sugerencias]
  );

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

  const portadasCategoria = useMemo(() => portadasDe(selectedCategory), [selectedCategory]);

  const categoryOptions: CatalogCategoryOption[] = useMemo(
    () => categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
    [categories]
  );

  const pageTitle = useMemo(() => {
    if (selectedCategory?.name) return selectedCategory.name;
    if (!ready && rawCat) return legacyCatLabel(rawCat) ?? "Catálogo";
    return "Catálogo";
  }, [selectedCategory, ready, rawCat]);

  // Dentro de una categoría (se entró con ?cat=, p. ej. desde Inicio): los filtros son los de esa categoría
  // (sin «Plataforma») y «Quitar filtros» no la quita (dueño, 2026-11-07).
  const categoriaDeUrl = useMemo(() => (rawCat ? resolveCategory(rawCat, categories)?.id ?? null : null), [rawCat, categories]);
  const enCategoria = !!categoriaDeUrl && categoryId === categoriaDeUrl;

  // Lo que hay en la categoría (estados y tramos de precio) para no ofrecer filtros sin productos.
  const [disponibles, setDisponibles] = useState<FiltrosDisponibles | null>(null);
  useEffect(() => {
    setDisponibles(null);
    if (isAdmin) return;
    let vivo = true;
    // Fuera de una categoría: los estados y precios de toda la tienda, del índice de búsqueda (ya cargado o pequeño,
    // sin fotos). Así solo se ofrecen los estados que existen de verdad (hoy, por ejemplo, ningún «Nuevo»).
    if (!enCategoria || !categoryId) {
      cargarIndiceBusqueda(false).then((indice) => {
        if (!vivo || !indice || !indice.productos.length) return;
        const lista = categoryId ? indice.productos.filter((p) => p.categoriaId === categoryId) : indice.productos;
        setDisponibles({
          condiciones: [...new Set(lista.map((p) => String(p.condicion ?? "")).filter(Boolean))],
          precios: [...new Set(lista.map((p) => p.precio))],
        });
      });
      return () => {
        vivo = false;
      };
    }
    supabase
      .from("products")
      .select("price_eur,condition")
      .eq("category_id", categoryId)
      .eq("is_active", true)
      .eq("status", "PUBLISHED")
      .limit(1000)
      .then(({ data, error }) => {
        if (!vivo || error || !Array.isArray(data)) return;
        const filas = data as { price_eur: number | string | null; condition: string | null }[];
        setDisponibles({
          condiciones: [...new Set(filas.map((f) => String(f.condition ?? "")).filter(Boolean))],
          precios: [...new Set(filas.map((f) => Number(f.price_eur ?? 0)))],
        });
      });
    return () => {
      vivo = false;
    };
  }, [enCategoria, categoryId, isAdmin]);

  const hasActiveFilters =
    (!!categoryId && !enCategoria) ||
    condition !== "ALL" ||
    precioActivo(priceMin, priceMax) ||
    !!appliedQuery ||
    (isAdmin && filter !== "ALL");

  const compactCards = isMobile && cols > 1;

  const productCards = useMemo(
    () =>
      items.map((p) => (
        // La misma tarjeta que Inicio y Servicios (components/CategoryProductsShelf.tsx). Solo el administrador ve,
        // en texto y sin recuadro, el estado interno del artículo.
        <TarjetaProducto
          key={p.id}
          titulo={p.title}
          precioEUR={p.priceEUR}
          imagenUrl={p.imageUrl}
          isMobile={isMobile}
          compact={compactCards}
          onPress={() => pushRoute(`/producto/${p.id}` as Href)}
          extra={
            isAdmin ? (
              <Text style={{ color: adminStatusColor(p.status), fontWeight: "800", fontSize: 11.5, marginTop: 4, textAlign: "center" }}>
                {adminStatusLabel(p.status)}
              </Text>
            ) : null
          }
        />
      )),
    [items, isAdmin, isMobile, compactCards]
  );

  const currentFilters: ListFilters = useMemo(
    () => ({
      adminFlag: isAdmin,
      statusFilter: effectiveFilter,
      categoryId,
      condition,
      priceMin,
      priceMax,
      sort,
      queryText: appliedQuery.trim(),
    }),
    [isAdmin, effectiveFilter, categoryId, condition, priceMin, priceMax, sort, appliedQuery]
  );

  // Primera página con los filtros actuales (sustituye la lista).
  const loadFirstPage = useCallback(async (f: ListFilters) => {
    const seq = ++reqSeqRef.current;
    loadingMoreRef.current = false;
    setLoadingMore(false);
    setRefreshing(true);
    setErr(null);
    try {
      const { rows, total: count, busqueda } = await fetchProductsPage(f, 0);
      if (seq !== reqSeqRef.current) return;
      const mediaMap = await fetchCoverMap(rows.map((r) => r.id));
      if (seq !== reqSeqRef.current) return;

      setItems(mapRows(rows, mediaMap));
      setTotal(count);
      setHasMore(count !== null ? rows.length < count : rows.length === PAGE_SIZE);
      setInfoBusqueda(f.queryText && busqueda ? busqueda : null);
      // Analítica propia (Administración → Analítica → Búsquedas): lo buscado (normalizado), cuántos resultados y si
      // hizo falta un sinónimo o una corrección. Una vez por texto (no con cada cambio de filtro).
      if (f.queryText && !f.adminFlag) {
        medirBusqueda("catalogo", f.queryText, {
          total: count ?? rows.length,
          sinonimo: !!busqueda?.sinonimo,
          correccion: !!busqueda?.correccion,
          sugerencia: busqueda?.sugerencia ?? null,
        });
      }
    } catch (e) {
      if (seq !== reqSeqRef.current) return;
      console.error("Error cargando catálogo:", e);
      setErr("No hemos podido cargar el catálogo. Comprueba tu conexión e inténtalo de nuevo.");
      setItems([]);
      setTotal(null);
      setHasMore(false);
      setInfoBusqueda(null);
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

  // Cualquier cambio de filtro/orden/búsqueda (o «Desliza para actualizar») → primera página de nuevo.
  const recarga = useRecarga();
  useEffect(() => {
    if (!ready) return;
    loadFirstPage(currentFilters);
  }, [ready, currentFilters, loadFirstPage, recarga]);

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
    setFilter("ALL");
    setQ("");
    setAppliedQuery("");
    trackEvent("catalogo_filtro", "Filtro: borrar filtros", { path: "/catalogo", metadata: { filtro: "todos", accion: "borrar" } });
    // Estado, precio y búsqueda salen de la dirección; dentro de una categoría se queda en ella (solo se quitan sus filtros).
    const sinFiltros = { query: undefined, estado: undefined, precio_min: undefined, precio_max: undefined };
    if (enCategoria) {
      router.setParams(sinFiltros);
      return;
    }
    setCategoryId(null);
    router.setParams({ ...sinFiltros, cat: undefined, categoria: undefined });
  }

  // Chips de lo que está filtrando ahora, cada uno con su «Quitar» (y «Borrar filtros» al lado).
  const quitarYMedir = (filtro: string, quitar: () => void) => () => {
    quitar();
    trackEvent("catalogo_filtro", "Filtro: quitado", { path: "/catalogo", metadata: { filtro, accion: "quitar" } });
  };
  const chipsActivos: { clave: string; texto: string; quitar: () => void }[] = [];
  if (appliedQuery.trim()) chipsActivos.push({ clave: "busqueda", texto: `Búsqueda: «${appliedQuery.trim().slice(0, 40)}»`, quitar: quitarYMedir("busqueda", () => aplicarBusqueda("")) });
  if (categoryId && !enCategoria && selectedCategory) {
    chipsActivos.push({
      clave: "plataforma",
      texto: `Plataforma: ${selectedCategory.name}`,
      quitar: quitarYMedir("plataforma", () => {
        setCategoryId(null);
        if (rawCat) router.setParams({ cat: undefined, categoria: undefined });
      }),
    });
  }
  if (condition !== "ALL") chipsActivos.push({ clave: "estado", texto: `Estado: ${nombreEstado(condition)}`, quitar: quitarYMedir("estado", () => router.setParams({ estado: undefined })) });
  if (precioActivo(priceMin, priceMax)) {
    chipsActivos.push({
      clave: "precio",
      texto: `Precio: ${textoPrecio(priceMin, priceMax)}`,
      quitar: quitarYMedir("precio", () => router.setParams({ precio_min: undefined, precio_max: undefined })),
    });
  }
  if (isAdmin && filter !== "ALL") chipsActivos.push({ clave: "interno", texto: `Estado interno: ${adminStatusLabel(filter)}`, quitar: () => setFilter("ALL") });

  // Teclado del buscador (ordenador): flechas para elegir una sugerencia, Intro la abre y Escape las cierra.
  function teclaBuscador(e: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    const tecla = e.nativeEvent.key;
    if (tecla === "Escape") {
      setEnfocado(false);
      return;
    }
    const n = verSugerencias && sugerencias.listo ? sugerencias.productos.length : 0;
    if ((tecla === "ArrowDown" || tecla === "ArrowUp") && n > 0) {
      (e as unknown as { preventDefault?: () => void }).preventDefault?.();
      setActivo((i) => (tecla === "ArrowDown" ? Math.min(i + 1, n - 1) : Math.max(i - 1, -1)));
    }
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
            paddingTop: isMobile ? 12 : 14,
            paddingBottom: isMobile ? 14 : 18,
            alignItems: "center",
            // Las sugerencias del buscador quedan por encima de la lista (no la empujan).
            zIndex: 10,
          }}
        >
          <View style={{ width: "100%", maxWidth: 1240, gap: 14 }}>
            <CabeceraMarca onBack={smartBack} />
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

            {/* Portadas de la categoría elegida (panel → Categorías), en carrusel. */}
            {portadasCategoria.length ? (
              <View nativeID="catalogo-portada" style={{ width: "100%", maxWidth: 960, alignSelf: "center" }}>
                <PortadasCategoria
                  key={selectedCategory?.id}
                  // Las marcadas «Entera» en el editor se ven completas, sin cortar el logo ni la consola (dueño, 2026-11-07).
                  entera={enterasInicioDe(selectedCategory)}
                  imagenes={portadasCategoria}
                  alt={`Portada de ${selectedCategory?.name ?? "la categoría"}`}
                  prioridad="high"
                  style={{ width: "100%", aspectRatio: isMobile ? 16 / 7 : 3, borderRadius: isMobile ? 16 : 20 }}
                />
              </View>
            ) : null}

            {/* Buscador compartido (components/Barramagic.tsx), modo "input": busca al pulsar intro y limpia con la
                "x". A su derecha, a la misma altura, el icono de filtros (dueño, 2026-11-07); sin contador de productos. */}
            <View nativeID="catalogo-buscador-filtros" style={{ flexDirection: "row", alignItems: "center", gap: 6, zIndex: 2 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Barramagic
                  isMobile={isMobile}
                  mode="input"
                  value={q}
                  onChangeText={(t) => {
                    setQ(t);
                    setEnfocado(true);
                  }}
                  onSubmit={() => {
                    if (activo >= 0 && verSugerencias && sugerencias.listo && sugerencias.productos[activo]) {
                      elegirSugerencia(activo);
                      return;
                    }
                    aplicarBusqueda(q);
                  }}
                  onClear={() => aplicarBusqueda("")}
                  onFocus={() => {
                    if (cierreSugerencias.current) clearTimeout(cierreSugerencias.current);
                    setEnfocado(true);
                  }}
                  // Con un pequeño retraso: al tocar una sugerencia el campo pierde el foco ANTES de que llegue el toque.
                  onBlur={() => {
                    if (cierreSugerencias.current) clearTimeout(cierreSugerencias.current);
                    cierreSugerencias.current = setTimeout(() => setEnfocado(false), 220);
                  }}
                  onKeyPress={teclaBuscador}
                  placeholder={isMobile ? "Buscar productos..." : "Buscar consola, videojuego, accesorio..."}
                />
                {verSugerencias ? (
                  <View style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 6, zIndex: 20 }}>
                    <SugerenciasCatalogo estado={sugerencias} activo={activo} onElegir={elegirSugerencia} />
                  </View>
                ) : null}
              </View>

            {/* Icono de filtros con su panel: dentro van todos los filtros (y, para admin, el estado interno de
                publicación); dentro de una categoría, los de esa categoría. */}
            <CatalogFilters
              enCategoria={enCategoria}
              disponibles={disponibles}
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
              priceMin={priceMin}
              priceMax={priceMax}
              onPriceCommit={setPrice}
              sort={sort}
              onSortChange={setSort}
              total={loading ? null : total}
              busy={refreshing && !loading}
              hasActiveFilters={hasActiveFilters}
              onClear={clearFilters}
            />
            </View>

            {/* Lo que está filtrando ahora: un chip con su «Quitar» por filtro y «Borrar filtros» (44 px). */}
            {chipsActivos.length ? (
              <View nativeID="catalogo-filtros-activos" style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 8 }}>
                {chipsActivos.map((c) => (
                  <Pressable
                    key={c.clave}
                    nativeID={`catalogo-chip-${c.clave}`}
                    onPress={c.quitar}
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar ${c.texto}`}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.85 : 1,
                      minHeight: 44,
                      maxWidth: "100%",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingLeft: 14,
                      paddingRight: 10,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: COLORS.accentBorder,
                      backgroundColor: COLORS.accent2,
                    })}
                  >
                    <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: "800", fontSize: 14, flexShrink: 1 }}>
                      {c.texto}
                    </Text>
                    <Ionicons name="close" size={18} color={COLORS.text} />
                  </Pressable>
                ))}
                <Pressable
                  nativeID="catalogo-borrar-filtros"
                  onPress={clearFilters}
                  accessibilityRole="button"
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, minHeight: 44, paddingHorizontal: 10, justifyContent: "center" })}
                >
                  <Text style={{ color: colorTextoAzul(14), fontWeight: "900", fontSize: 14 }}>Borrar filtros</Text>
                </Pressable>
              </View>
            ) : null}

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
                    {appliedQuery.trim()
                      ? `No hemos encontrado «${appliedQuery.trim().slice(0, 60)}»`
                      : hasActiveFilters
                        ? "No hay productos con estos filtros"
                        : "Ahora mismo no hay productos publicados"}
                  </Text>

                  {/* La mejor corrección que sí tiene productos («plaistation» → «playstation»). */}
                  {appliedQuery.trim() && infoBusqueda?.sugerencia ? (
                    <Pressable
                      nativeID="catalogo-quisiste-decir"
                      onPress={() => aplicarBusqueda(infoBusqueda.sugerencia ?? "")}
                      accessibilityRole="button"
                      accessibilityLabel={`¿Querías decir ${infoBusqueda.sugerencia}?`}
                      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, minHeight: 44, justifyContent: "center", paddingHorizontal: 12 })}
                    >
                      <Text style={{ color: COLORS.text, fontWeight: "700", fontSize: 17, textAlign: "center" }}>
                        ¿Querías decir <Text style={{ color: COLORS.accent, fontWeight: "900" }}>«{infoBusqueda.sugerencia}»</Text>?
                      </Text>
                    </Pressable>
                  ) : null}

                  <Text style={{ color: COLORS.muted, lineHeight: 21, textAlign: "center", maxWidth: 560 }}>
                    {hasActiveFilters
                      ? "Prueba a quitar algún filtro o a buscar con otras palabras."
                      : "Vuelve a pasarte pronto o escríbenos por chat si buscas algo concreto."}
                  </Text>

                  {hasActiveFilters ? (
                    <Pressable
                      nativeID="catalogo-ver-todo"
                      onPress={clearFilters}
                      accessibilityRole="button"
                      style={({ pressed }) => ({
                        opacity: pressed ? 0.88 : 1,
                        alignSelf: isMobile ? "stretch" : "center",
                        minHeight: 44,
                        justifyContent: "center",
                        borderRadius: 999,
                        paddingVertical: 12,
                        paddingHorizontal: 18,
                        backgroundColor: COLORS.accent,
                        marginTop: 4,
                      })}
                    >
                      <Text style={{ color: "#FFFFFF", fontWeight: "900", textAlign: "center" }}>
                        {appliedQuery.trim() ? "Ver todo el catálogo" : "Quitar filtros"}
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
                <RejillaTarjetas columns={cols} gap={14}>
                  {productCards}
                </RejillaTarjetas>
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
