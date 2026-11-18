/**
 * Archivo: components/ficha/DatosFicha.tsx
 * Función: datos de la ficha de producto: colores, tipos (producto, fotos, categoría, características, mantenimiento,
 *          cesta), la lectura del producto y sus fotos desde Supabase (con las columnas opcionales), la cesta y los
 *          «me gusta» guardados en el dispositivo, y pequeñas ayudas (estado, condición, volver atrás, ¿es administrador?).
 * Para qué sirve: lo que antes estaba al principio de app/producto/[id].tsx. Se separó en la tanda 6 de «ordenar el
 *          proyecto» (2026-11-18), sin cambiar nada.
 * Conectado con: lib/supabase.ts (products, product_media, categories, profiles), @react-native-async-storage/async-storage
 *          (cesta y «me gusta»), expo-router.
 * Utilizado por: app/producto/[id].tsx y components/ficha/*.
 * Dependencias: react-native, expo-router, @react-native-async-storage/async-storage.
 * Estado: ACTIVO
 */
import type { Href } from "expo-router";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { rolDeUsuario, supabase } from "../../lib/supabase";

export const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  bg3: "#F6FAFD",
  card: "#F6FAFD",
  cardStrong: "#EEF3F8",
  border: "#E3EAF2",
  borderSoft: "#EEF3F8",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.62)",
  accent: "#1EA7E8",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  accentDark: "#1EA7E8",
};

type DbStatus = "DRAFT" | "PUBLISHED" | "REVIEW";
type UiStatus = "PUBLICADA" | "LISTA" | "REVISAR";
type ProductMediaKind = "image" | "video";
type ProductCondition = "NEW" | "LIKE_NEW" | "GOOD" | "FAIR" | "PARTS";

type Category = {
  id: string;
  name: string;
  slug: string;
};

export type ProductMediaRow = {
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

// Ficha técnica («características») que envía VeoAura: etiqueta y valor, en el orden en que llegan.
export type Caracteristica = { etiqueta: string; valor: string };
// «Mantenimiento básico realizado» que envía VeoAura: título, nota y puntos (etiqueta y valor), tal cual llegan.
export type Mantenimiento = { titulo: string; nota: string | null; puntos: Caracteristica[] };

type ProductDbRow = {
  id: string;
  title: string;
  caracteristicas: Caracteristica[];
  mantenimiento: Mantenimiento | null;
  description: string | null;
  price_eur: number | null;
  status: DbStatus;
  is_active: boolean;
  category_id: string | null;
  updated_at: string | null;
  created_at: string | null;
  images: string[] | null;
  category: Category | null;
  condition: string | null;
  like_count: number | null;
  reference: string | null;
  // Solo entrega en mano: no se envía (televisores sin su caja original; migración 20261107140000).
  solo_entrega_mano: boolean;
  // Lo marca el dueño por producto (migración 20261114140000): sin la columna, false / null y no se muestra nada.
  revisado: boolean;
  garantia_meses: number | null;
};

export type Product = {
  id: string;
  title: string;
  caracteristicas: Caracteristica[];
  mantenimiento: Mantenimiento | null;
  soloEntregaMano: boolean;
  revisado: boolean;
  garantiaMeses: number | null;
  description: string | null;
  priceEUR: number;
  status: UiStatus;
  isActive: boolean;
  imageUrl: string | null;
  category: Category | null;
  media: ProductMedia[];
  condition: ProductCondition;
  likeCount: number;
  reference: string | null;
};

const LIKED_PRODUCTS_KEY = "videojuegoszaragoza:liked_products";

export async function getLikedProductIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(LIKED_PRODUCTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []
    );
  } catch {
    return new Set();
  }
}

export async function saveLikedProductIds(ids: Set<string>) {
  try {
    await AsyncStorage.setItem(LIKED_PRODUCTS_KEY, JSON.stringify([...ids]));
  } catch {
    // Si falla el guardado local no pasa nada grave: como mucho el like se
    // olvida al recargar la página, pero el contador ya se actualizó en
    // Supabase.
  }
}

// Misma clave y forma que usan app/(tabs)/cesta.tsx y app/checkout.tsx
// (CART_KEY = "videojuegoos_cart_v1"), duplicada aquí en vez de importada
// -siguiendo cómo está hecho el resto del proyecto- para poder añadir al
// carrito directamente desde esta pantalla (botones "Añadir a la cesta" y
// "Comprar ya") sin depender de que cesta.tsx esté montada.
export type CartItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  priceEUR: number;
  qty: number;
  imageUrl?: string | null;
  // Fin de la reserva de 15 minutos (ms), ver lib/reservas.ts.
  reservedUntil?: number;
};

const CART_KEY = "videojuegoos_cart_v1";

// Marcador de "Comprar ya": qué producto se compró así con qué usuario
// logueado, para que app/checkout.tsx pueda marcarlo como vendido solo al
// confirmar el pedido (ver sql/product_sales.sql). Es distinto de CART_KEY
// porque un pedido puede llevar además otros productos añadidos a mano a la
// cesta, que no se marcan como vendidos automáticamente.
export const BUY_NOW_MARK_KEY = "videojuegoos_buy_now_mark_v1";

export type BuyNowMark = { productId: string; userId: string };

export async function loadCart(): Promise<CartItem[]> {
  try {
    const raw = await AsyncStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((it: CartItem) => it && it.id && it.title)
      : [];
  } catch {
    return [];
  }
}

export async function saveCart(items: CartItem[]) {
  try {
    await AsyncStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {
    // Si falla el guardado, la cesta se queda como estaba antes del intento.
  }
}

export function pushRoute(route: Href | { pathname: string; params?: Record<string, string> }) {
  router.push(route as never);
}

export function replaceRoute(route: Href) {
  router.replace(route);
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function mapDbStatusToUi(s: DbStatus): UiStatus {
  if (s === "PUBLISHED") return "PUBLICADA";
  if (s === "DRAFT") return "LISTA";
  return "REVISAR";
}

export function asProductCondition(value: unknown): ProductCondition {
  const raw = String(value ?? "").trim().toUpperCase();
  if (raw === "NEW" || raw === "LIKE_NEW" || raw === "GOOD" || raw === "FAIR" || raw === "PARTS") {
    return raw;
  }
  return "GOOD";
}

// Mismo texto que labelCond() en lib/admin/productos.utilidades.ts, para
// que el estado que ve el cliente coincida con el que elige el admin.
export function labelCondition(c: ProductCondition) {
  if (c === "NEW") return "Nuevo";
  if (c === "LIKE_NEW") return "Como nuevo";
  if (c === "GOOD") return "Bueno";
  if (c === "FAIR") return "Regular";
  return "Para piezas";
}

export function smartBack() {
  try {
    if (typeof (router as any).canGoBack === "function" && (router as any).canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // ignore
  }
  replaceRoute("/catalogo" as Href);
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

// La ficha técnica tal cual la guardó api/escaparate-veoaura.ts (que ya la valida). Aquí se vuelve a
// comprobar por si acaso: solo pares de texto, como mucho 30. Se muestra con <Text>, nunca como HTML.
function asCaracteristicas(value: unknown, maxEtiqueta = 40, maxValor = 80): Caracteristica[] {
  if (!Array.isArray(value)) return [];
  const lista: Caracteristica[] = [];
  for (const el of value) {
    if (lista.length >= 30) break;
    if (!el || typeof el !== "object") continue;
    const etiqueta = (el as Record<string, unknown>).etiqueta;
    const valor = (el as Record<string, unknown>).valor;
    if (typeof etiqueta !== "string" || typeof valor !== "string") continue;
    const e = etiqueta.trim().slice(0, maxEtiqueta);
    const v = valor.trim().slice(0, maxValor);
    if (e && v) lista.push({ etiqueta: e, valor: v });
  }
  return lista;
}

// El mantenimiento tal cual lo guardó el receptor (que ya lo valida); aquí se vuelve a comprobar. Sin título se
// usa el de siempre. Sin nota ni puntos, no hay nada que enseñar (null).
function asMantenimiento(value: unknown): Mantenimiento | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const m = value as Record<string, unknown>;
  const titulo = typeof m.titulo === "string" && m.titulo.trim() ? m.titulo.trim().slice(0, 60) : "Mantenimiento básico realizado";
  const nota = typeof m.nota === "string" && m.nota.trim() ? m.nota.trim().slice(0, 300) : null;
  const puntos = asCaracteristicas(m.puntos, 60, 20);
  return nota || puntos.length ? { titulo, nota, puntos } : null;
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
    caracteristicas: asCaracteristicas(row.caracteristicas),
    mantenimiento: asMantenimiento(row.mantenimiento),
    solo_entrega_mano: row.solo_entrega_mano === true,
    revisado: row.revisado === true,
    garantia_meses: (() => {
      const n = Number(row.garantia_meses);
      return row.garantia_meses != null && Number.isInteger(n) && n >= 1 && n <= 36 ? n : null;
    })(),
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
    condition: typeof row.condition === "string" ? row.condition : null,
    like_count:
      typeof row.like_count === "number"
        ? row.like_count
        : row.like_count != null
        ? Number(row.like_count)
        : null,
    reference: typeof row.reference === "string" && row.reference.trim() ? row.reference.trim() : null,
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

export async function detectAdmin(): Promise<boolean> {
  try {
    const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) throw sessErr;

    const userId = sessionData.session?.user?.id;
    if (!userId) return false;

    // Compartida con Blue y la analítica (lib/supabase.ts → rolDeUsuario): una sola consulta al abrir.
    return (await rolDeUsuario(userId)) === "admin";
  } catch {
    return false;
  }
}

function firstImageFromAnyRow(row: ProductDbRow | null | undefined): string | null {
  const imgs = row?.images;

  if (Array.isArray(imgs) && imgs.length > 0) {
    const first = imgs.find((v) => typeof v === "string" && !!v.trim());
    if (typeof first === "string" && first.trim()) return first.trim();
  }

  return null;
}

function normalizeDuration(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function normalizeProductMediaRows(rows: ProductMediaRow[]): ProductMedia[] {
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

export function pickInitialHeroImage(productRow: ProductDbRow, media: ProductMedia[]): string | null {
  const coverImage =
    media.find((m) => m.isCover && m.kind === "image") ||
    media.find((m) => m.kind === "image");

  if (coverImage?.publicUrl) return coverImage.publicUrl;

  return firstImageFromAnyRow(productRow);
}

export async function loadProductMediaRows(productId: string): Promise<ProductMediaRow[]> {
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

// Columnas reales de products (todas existen ya en Supabase) + su categoría
// con un join, en UNA sola consulta (antes había hasta 16 variantes con
// reintentos en cadena por si faltaba alguna columna).
const PRODUCT_SELECT_BASE =
  "id,title,description,price_eur,status,is_active,category_id,images,updated_at,created_at,condition,like_count,reference,category:categories(id,name,slug)";
// Columnas que llegan con su propia migración: la ficha técnica (20261029110000_productos_caracteristicas.sql) y el
// mantenimiento (20261030100000_productos_mantenimiento.sql). Si alguna aún no existe, se pide sin ella (y ya sin
// ella en adelante): la ficha del producto nunca se rompe por eso.
const COLUMNAS_OPCIONALES = ["caracteristicas", "mantenimiento", "solo_entrega_mano"];
// «revisado» y «garantia_meses» (20261114140000, mejora 4): se piden con «*» (trae las columnas que existan, todas
// pequeñas) para que, mientras la migración no esté aplicada, no salga un 400 en la consola en cada visita (lección
// «Columna nueva sin errores en la consola antes de la migración»). Sin ellas no sale ninguna insignia.
const PRODUCT_SELECT_TODO = "*,category:categories(id,name,slug)";
let seleccionTodoFalla = false;
const columnasQueFaltan = new Set<string>();

function columnaQueFalta(error: unknown): string | null {
  const msg = String((error as { message?: unknown })?.message ?? "");
  if (!/does not exist|could not find/i.test(msg)) return null;
  return COLUMNAS_OPCIONALES.find((c) => msg.includes(c)) ?? null;
}

// publicOnly=true añade el filtro de "solo publicados y activos" (lo que ve
// un cliente); el admin puede abrir también borradores y productos ocultos.
export async function fetchProductRow(productId: string, publicOnly: boolean): Promise<ProductDbRow | null> {
  const consultar = () => {
    const columnas = seleccionTodoFalla
      ? [PRODUCT_SELECT_BASE, ...COLUMNAS_OPCIONALES.filter((c) => !columnasQueFaltan.has(c))].join(",")
      : PRODUCT_SELECT_TODO;
    let query = supabase.from("products").select(columnas).eq("id", productId);
    if (publicOnly) {
      query = query.eq("is_active", true).eq("status", "PUBLISHED");
    }
    return query.maybeSingle();
  };

  let res = await consultar();
  // Si «*» fallara por cualquier motivo (no debería), se vuelve a las columnas de siempre, como antes.
  if (res.error && !seleccionTodoFalla) {
    seleccionTodoFalla = true;
    res = await consultar();
  }
  for (let i = 0; i < COLUMNAS_OPCIONALES.length && res.error; i++) {
    const falta = columnaQueFalta(res.error);
    if (!falta || columnasQueFaltan.has(falta)) break;
    columnasQueFaltan.add(falta);
    res = await consultar();
  }
  if (res.error) throw res.error;
  return asProductDbRow(res.data);
}
