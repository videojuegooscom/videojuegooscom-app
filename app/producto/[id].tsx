/**
 * app/producto/[id].tsx
 *
 * Qué hace: ficha de un producto individual. Carga el producto y su galería
 * de fotos/vídeos desde Supabase a partir del id de la URL, y permite
 * añadirlo a la cesta, ir a checkout, preguntar por este producto,
 * compartir la ficha o darle "me gusta".
 *
 * Dudas: el botón "Preguntar por este producto" abre Blue IA con
 * ?producto=<id>; desde ahí, "Hablar con el equipo" (abrirChatEquipo en components/ProductChatThread.tsx) crea o
 * reutiliza el chat privado de (este producto, este cliente) con
 * get_or_create_product_chat, para que Jefe lo vea en app/admin/chats.tsx.
 *
 * Cómo funciona: fetchProductRow() trae el producto y su categoría en una
 * sola consulta (join categories). pickInitialHeroImage() elige la foto de portada. detectAdmin() decide si
 * se muestra información extra (estado interno) reservada para el panel de
 * admin.
 *
 * "Me gusta": el contador vive en products.like_count (ver
 * sql/product_likes.sql — hay que ejecutarlo una vez en Supabase). Se
 * actualiza con la función adjust_product_like(product_id, delta), que solo
 * puede sumar o restar 1 a ese contador (no da acceso a modificar el resto
 * de la fila), así que un visitante sin cuenta también puede dar like. Qué
 * productos ha marcado CADA dispositivo se guarda en AsyncStorage (igual que
 * la cesta), no en Supabase, para no exigir inicio de sesión.
 *
 * "Compartir": usa la Web Share API del navegador (navigator.share) en
 * móvil/web, con copiar el enlace al portapapeles como alternativa en
 * escritorio; en nativo (iOS/Android) usa el Share de React Native.
 *
 * Comprar: "Añadir a la cesta" y "Comprar ya" (con selector de Cantidad)
 * escriben directamente en la misma cesta que usan app/(tabs)/cesta.tsx y
 * app/checkout.tsx (misma clave de AsyncStorage, CART_KEY), duplicada aquí
 * en vez de importada, igual que el resto de pantallas de este proyecto.
 * "Comprar ya" añade el producto y lleva directo a checkout, saltándose la
 * cesta, como el botón equivalente de otras tiendas online.
 *
 * Imagen ampliada: al tocar la foto principal se abre
 * components/ImageLightbox.tsx, un visor a pantalla completa con zoom
 * (pellizco, doble toque o rueda del ratón) y navegación entre todas las
 * fotos del producto. La foto principal (sin abrir el visor) también se
 * puede deslizar con el dedo hacia los lados como un carrusel, para pasar
 * de una foto a otra sin salir de la ficha (mainImagePan).
 *
 * Cabecera: solo el botón "←" queda fijo arriba; el título y el subtítulo
 * del producto viven dentro del ScrollView (son lo primero que se ve) y
 * desaparecen al hacer scroll como el resto del contenido, en vez de
 * quedarse pegados arriba.
 *
 * Número de referencia: viene de products.reference (ver
 * sql/product_reference.sql — columna nueva, opcional, hay que ejecutar el
 * script una vez en Supabase). Se rellena al crear/editar el producto desde
 * app/admin/products.tsx y aquí solo se muestra dentro de "Información del
 * producto" cuando el producto tiene uno asignado.
 *
 * "X Visitas": contador REAL (nunca inventado) junto a "De segunda mano:
 * ...", ambos como texto plano (sin fondo/borde de burbuja). Vive en
 * products.view_count (ver sql/product_views.sql — columna nueva, hay que
 * ejecutar el script una vez en Supabase) y sube exactamente 1 en cada carga
 * real de esta ficha vía increment_product_view(), salvo cuando la abre el
 * propio admin (para no inflar el número con sus propias revisiones). Si esa
 * función todavía no existe en Supabase, el número simplemente no se
 * muestra en vez de romper la ficha.
 *
 * Rendimiento: loadProduct() lanza a la vez (Promise.all) el producto con su
 * categoría (filtrado a "publicado"), sus fotos/vídeos y los "me gusta"
 * locales, y pinta la ficha en cuanto llegan. La comprobación de admin
 * arranca en paralelo y no bloquea: al resolverse ajusta la vista, suma la
 * visita y registra la analítica. Solo si el producto no aparece como
 * publicado se espera a saber si eres admin y se repite la consulta sin
 * filtro (borradores/ocultos, que solo ve el admin).
 *
 * Analítica: al cargar el producto (sin contar visitas del propio admin) se
 * registra el paso "Producto {título}" y el scroll dentro de la ficha
 * dispara "Scroll" (lib/analytics.ts), para el embudo del panel de métricas.
 * "Añadir a la cesta" y "Comprar ya" registran los eventos de conversión
 * "add_to_cart" y "buy_now" con { productId, price }.
 *
 * Conectado con:
 * - lib/supabase.ts → tablas products, product_media, categories, profiles.
 * - lib/analytics.ts → registro de "Producto {título}" y "Scroll" para el
 *   panel de métricas del admin.
 * - sql/product_likes.sql → columna like_count y función adjust_product_like.
 * - sql/product_views.sql → columna view_count y función increment_product_view.
 * - app/catalogo.tsx → de donde se navega hasta aquí.
 * - app/(tabs)/cesta.tsx y app/checkout.tsx → botones "Ver cesta" y
 *   "Finalizar compra".
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Href } from "expo-router";
import {
  ActivityIndicator,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";
import { contarVistaProducto, fijarMeGusta } from "../../lib/interaccion";
import { trackEvent, trackEventThrottled } from "../../lib/analytics";
import { productosReservadosPorOtros, RESERVA_MINUTOS, reservarProducto } from "../../lib/reservas";
import ImageLightbox, { type LightboxImage } from "../../components/ImageLightbox";
import SmartImage from "../../components/SmartImage";
import CargaMarca from "../../components/marca/CargaMarca";
import CabeceraMarca from "../../components/CabeceraMarca";
import MarcaAnimada from "../../components/marca/MarcaAnimada";

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

// Ficha técnica («características») que envía VeoAura: etiqueta y valor, en el orden en que llegan.
type Caracteristica = { etiqueta: string; valor: string };

type ProductDbRow = {
  id: string;
  title: string;
  caracteristicas: Caracteristica[];
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
};

type Product = {
  id: string;
  title: string;
  caracteristicas: Caracteristica[];
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

async function getLikedProductIds(): Promise<Set<string>> {
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

async function saveLikedProductIds(ids: Set<string>) {
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
type CartItem = {
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
const BUY_NOW_MARK_KEY = "videojuegoos_buy_now_mark_v1";

type BuyNowMark = { productId: string; userId: string };

async function loadCart(): Promise<CartItem[]> {
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

async function saveCart(items: CartItem[]) {
  try {
    await AsyncStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {
    // Si falla el guardado, la cesta se queda como estaba antes del intento.
  }
}

function pushRoute(route: Href | { pathname: string; params?: Record<string, string> }) {
  router.push(route as never);
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

function asProductCondition(value: unknown): ProductCondition {
  const raw = String(value ?? "").trim().toUpperCase();
  if (raw === "NEW" || raw === "LIKE_NEW" || raw === "GOOD" || raw === "FAIR" || raw === "PARTS") {
    return raw;
  }
  return "GOOD";
}

// Mismo texto que labelCond() en app/admin/products/products.utils.ts, para
// que el estado que ve el cliente coincida con el que elige el admin.
function labelCondition(c: ProductCondition) {
  if (c === "NEW") return "Nuevo";
  if (c === "LIKE_NEW") return "Como nuevo";
  if (c === "GOOD") return "Bueno";
  if (c === "FAIR") return "Regular";
  return "Para piezas";
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
function asCaracteristicas(value: unknown): Caracteristica[] {
  if (!Array.isArray(value)) return [];
  const lista: Caracteristica[] = [];
  for (const el of value) {
    if (lista.length >= 30) break;
    if (!el || typeof el !== "object") continue;
    const etiqueta = (el as Record<string, unknown>).etiqueta;
    const valor = (el as Record<string, unknown>).valor;
    if (typeof etiqueta !== "string" || typeof valor !== "string") continue;
    const e = etiqueta.trim().slice(0, 40);
    const v = valor.trim().slice(0, 80);
    if (e && v) lista.push({ etiqueta: e, valor: v });
  }
  return lista;
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

function firstImageFromAnyRow(row: ProductDbRow | null | undefined): string | null {
  const imgs = row?.images;

  if (Array.isArray(imgs) && imgs.length > 0) {
    const first = imgs.find((v) => typeof v === "string" && !!v.trim());
    if (typeof first === "string" && first.trim()) return first.trim();
  }

  return null;
}

function productHintByCategory(name?: string | null) {
  if (!name) return "Producto de segunda mano revisado";

  const n = name.toLowerCase();

  if (n.includes("videojuego")) return "Videojuego listo para enviar";
  if (n.includes("mando") || n.includes("accesorio")) return "Accesorio listo para usar";
  if (n.includes("electr")) return "Electrónica seleccionada";
  if (n.includes("repar")) return "Servicio especializado";

  return "Producto de segunda mano revisado";
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

  if (!images && !videos) return "Sin imágenes disponibles";
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

// Columnas reales de products (todas existen ya en Supabase) + su categoría
// con un join, en UNA sola consulta (antes había hasta 16 variantes con
// reintentos en cadena por si faltaba alguna columna).
const PRODUCT_SELECT_BASE =
  "id,title,description,price_eur,status,is_active,category_id,images,updated_at,created_at,condition,like_count,reference,category:categories(id,name,slug)";
// Con la ficha técnica (supabase/migrations/20261029110000_productos_caracteristicas.sql). Si esa
// columna aún no existe, se pide sin ella: la ficha del producto nunca se rompe por eso.
const PRODUCT_SELECT = `${PRODUCT_SELECT_BASE},caracteristicas`;
let hayColumnaCaracteristicas = true;

function faltaColumnaCaracteristicas(error: unknown): boolean {
  const msg = String((error as { message?: unknown })?.message ?? "");
  return /caracteristicas/i.test(msg) && /does not exist|could not find/i.test(msg);
}

// publicOnly=true añade el filtro de "solo publicados y activos" (lo que ve
// un cliente); el admin puede abrir también borradores y productos ocultos.
async function fetchProductRow(productId: string, publicOnly: boolean): Promise<ProductDbRow | null> {
  const consultar = (columnas: string) => {
    let query = supabase.from("products").select(columnas).eq("id", productId);
    if (publicOnly) {
      query = query.eq("is_active", true).eq("status", "PUBLISHED");
    }
    return query.maybeSingle();
  };

  let res = await consultar(hayColumnaCaracteristicas ? PRODUCT_SELECT : PRODUCT_SELECT_BASE);
  if (res.error && hayColumnaCaracteristicas && faltaColumnaCaracteristicas(res.error)) {
    hayColumnaCaracteristicas = false;
    res = await consultar(PRODUCT_SELECT_BASE);
  }
  if (res.error) throw res.error;
  return asProductDbRow(res.data);
}

export default function ProductoScreen() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const isTablet = widthSafe >= 700 && widthSafe < 1080;
  const isWide = widthSafe >= 1080;
  const pagePadding = isMobile ? 12 : 16;

  // ?guia=1: la guía de Blue (components/Campanita.tsx) enseña esta ficha; esa demostración no cuenta como visita.
  const params = useLocalSearchParams<{ id?: string; guia?: string }>();
  const productId = typeof params.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [p, setP] = useState<Product | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likeBusy, setLikeBusy] = useState(false);
  const [viewCount, setViewCount] = useState<number | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  // Segunda mano: cada ficha es una unidad única, así que siempre se compra 1 (sin selector).
  const qty = 1;
  const [cartBusy, setCartBusy] = useState(false);
  // Otro cliente lo tiene en su cesta (reserva de 15 minutos activa).
  const [reservadoPorOtro, setReservadoPorOtro] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const reqSeqRef = useRef(0);

  const canBuy = useMemo(() => {
    if (!p) return false;
    if (!isAdmin) return p.status === "PUBLICADA" && p.isActive && !reservadoPorOtro;
    return true;
  }, [p, isAdmin, reservadoPorOtro]);

  const loadedId = p?.id ?? null;
  useEffect(() => {
    if (!loadedId) return;
    let vivo = true;
    productosReservadosPorOtros([loadedId]).then((ids) => {
      if (vivo) setReservadoPorOtro(ids.has(loadedId));
    });
    return () => {
      vivo = false;
    };
  }, [loadedId]);

  const heroSubcopy = useMemo(() => {
    if (!p) return "Ficha de producto";

    const parts: string[] = [];
    parts.push(productHintByCategory(p.category?.name));

    if (!isAdmin && p.status === "PUBLICADA" && p.isActive) {
      parts.push("Disponible para compra");
    }

    if (p.media.length > 0) {
      parts.push(mediaCountLabel(p.media));
    }

    if (isAdmin) parts.push("Vista admin");

    return parts.join(" · ");
  }, [p, isAdmin]);

  async function loadProduct() {
    const seq = ++reqSeqRef.current;

    if (!productId) {
      setErr("No hemos podido encontrar este producto.");
      setP(null);
      setSelectedImageUrl(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErr(null);

    setViewCount(null);

    // Lo secundario (¿eres admin?) arranca ya, en paralelo, pero no bloquea
    // el pintado de la ficha.
    const adminPromise = detectAdmin();

    try {
      // Lo principal, todo a la vez: producto + categoría (una consulta con
      // join), sus fotos/vídeos (solo dependen del id de la URL) y los "me
      // gusta" de este dispositivo (AsyncStorage, local).
      const [publicRow, mediaRows, likedIds] = await Promise.all([
        fetchProductRow(productId, true),
        loadProductMediaRows(productId).catch((e) => {
          // Sin galería la ficha sigue sirviendo (queda products.images).
          console.error("Error cargando las fotos del producto:", e);
          return [] as ProductMediaRow[];
        }),
        getLikedProductIds(),
      ]);
      if (seq !== reqSeqRef.current) return;

      // Borradores u ocultos: solo los ve el admin, así que únicamente en ese
      // caso (raro) se espera a saber si eres admin y se repite la consulta
      // sin el filtro de "publicado".
      let productRow = publicRow;
      if (!productRow && (await adminPromise)) {
        if (seq !== reqSeqRef.current) return;
        productRow = await fetchProductRow(productId, false);
      }
      if (seq !== reqSeqRef.current) return;

      if (!productRow) {
        setP(null);
        setSelectedImageUrl(null);
        setErr(
          "Este producto no existe o ya no está disponible para la venta. Prueba a volver al catálogo para ver el resto de artículos."
        );
        return;
      }

      const normalizedMedia = normalizeProductMediaRows(mediaRows);
      const heroImage = pickInitialHeroImage(productRow, normalizedMedia);

      const mapped: Product = {
        id: productRow.id,
        title: productRow.title,
        caracteristicas: productRow.caracteristicas,
        description: productRow.description ?? null,
        priceEUR: Number(productRow.price_eur ?? 0),
        status: mapDbStatusToUi(productRow.status),
        isActive: Boolean(productRow.is_active),
        imageUrl: heroImage,
        category: productRow.category,
        media: normalizedMedia,
        condition: asProductCondition(productRow.condition),
        likeCount: Math.max(0, Number(productRow.like_count ?? 0)),
        reference: productRow.reference ?? null,
      };

      setP(mapped);
      setSelectedImageUrl(heroImage);
      setLikeCount(mapped.likeCount);
      setLiked(likedIds.has(mapped.id));
      // La ficha se pinta ya: lo que sigue (admin, visitas, analítica) llega
      // después sin bloquear.
      setLoading(false);

      adminPromise.then((adminFlag) => {
        if (seq !== reqSeqRef.current) return;
        setIsAdmin(adminFlag);
        if (adminFlag || params.guia === "1") return;

        // Contador de visitas REAL (ver sql/product_views.sql): se suma 1 en
        // cada carga real de la ficha, salvo cuando la abre el propio admin
        // (esas no son visitas de clientes). Si la función falla, simplemente
        // no se muestra el número, sin romper la ficha.
        contarVistaProducto(mapped.id).then((total) => {
          if (seq !== reqSeqRef.current) return;
          if (typeof total === "number") setViewCount(total);
        });

        // Analítica: igual que el contador de visitas, no se cuentan las
        // aperturas del propio admin revisando su catálogo.
        trackEvent("page_view", `Producto ${mapped.title}`, {
          path: `/producto/${mapped.id}`,
          metadata: { productId: mapped.id, category: mapped.category?.name ?? null },
        });
      });
    } catch (e: any) {
      if (seq !== reqSeqRef.current) return;
      console.error("Error cargando el producto:", e);
      setErr("No hemos podido cargar este producto en este momento. Inténtalo de nuevo en unos instantes.");
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

  // Datos estructurados del producto para Google (schema.org Product), con la ficha técnica como
  // additionalProperty. Solo web; se escribe con textContent (nunca como HTML) y se quita al salir.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined" || !p) return;
    const fotos = p.media.filter((m) => m.kind === "image").map((m) => m.publicUrl);
    const disponible = p.status === "PUBLICADA" && p.isActive;
    const estado =
      p.condition === "NEW"
        ? "https://schema.org/NewCondition"
        : p.condition === "PARTS"
        ? "https://schema.org/DamagedCondition"
        : "https://schema.org/UsedCondition";
    const url = `https://videojuegoszaragoza.com/producto/${p.id}`;
    const datos: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: p.title,
      url,
      ...(fotos.length ? { image: fotos } : p.imageUrl ? { image: [p.imageUrl] } : {}),
      ...(p.description?.trim() ? { description: p.description.trim() } : {}),
      ...(p.reference ? { sku: p.reference } : {}),
      ...(p.category?.name ? { category: p.category.name } : {}),
      offers: {
        "@type": "Offer",
        url,
        price: p.priceEUR.toFixed(2),
        priceCurrency: "EUR",
        itemCondition: estado,
        availability: disponible ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        seller: { "@type": "Organization", name: "Videojuegoszaragoza.com" },
      },
      ...(p.caracteristicas.length
        ? { additionalProperty: p.caracteristicas.map((c) => ({ "@type": "PropertyValue", name: c.etiqueta, value: c.valor })) }
        : {}),
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "datos-producto";
    script.textContent = JSON.stringify(datos).replace(/</g, "\\u003c");
    document.getElementById("datos-producto")?.remove();
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [p]);

  const imageGallery = useMemo(() => {
    if (!p) return [];
    return p.media.filter((m) => m.kind === "image");
  }, [p]);

  // Imágenes para el visor a pantalla completa (ImageLightbox). Si el
  // producto no tiene fotos en product_media pero sí una imagen "de toda la
  // vida" en products.images, se usa esa como única foto del visor en vez
  // de dejarlo sin nada.
  const lightboxImages: LightboxImage[] = useMemo(() => {
    if (imageGallery.length > 0) {
      return imageGallery.map((m) => ({ id: m.id, url: m.publicUrl }));
    }
    if (p?.imageUrl) {
      return [{ id: p.id, url: p.imageUrl }];
    }
    return [];
  }, [imageGallery, p?.id, p?.imageUrl]);

  function openLightbox() {
    if (!lightboxImages.length) return;
    const idx = selectedImageUrl
      ? lightboxImages.findIndex((img) => img.url === selectedImageUrl)
      : 0;
    setLightboxIndex(idx >= 0 ? idx : 0);
    setLightboxOpen(true);
  }

  // Desliza la foto principal como un carrusel (sin zoom: el zoom vive en
  // ImageLightbox). "delta" es -1 (anterior) o 1 (siguiente), y da la
  // vuelta al llegar al final, como cualquier carrusel.
  function stepImage(delta: number) {
    if (imageGallery.length < 2) return;
    const currentIdx = imageGallery.findIndex((m) => m.publicUrl === selectedImageUrl);
    const base = currentIdx >= 0 ? currentIdx : 0;
    const next = ((base + delta) % imageGallery.length + imageGallery.length) % imageGallery.length;
    setSelectedImageUrl(imageGallery[next].publicUrl);
  }

  // Un toque corto (sin apenas movimiento) abre el visor a pantalla
  // completa; un arrastre horizontal claro cambia de foto tipo carrusel. Se
  // crea de nuevo en cada render (a propósito, no con useRef) para que
  // siempre "vea" el selectedImageUrl/imageGallery actuales -si se creara
  // una sola vez, se quedaría con los valores del primer render.
  const mainImagePan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    // Solo reclama arrastres sobre todo horizontales: el arrastre vertical sobre la foto
    // debe desplazar la ficha, no quedarse atrapado en la imagen.
    onMoveShouldSetPanResponder: (_evt, gestureState) =>
      Math.abs(gestureState.dx) > 6 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
    onPanResponderTerminationRequest: () => true,
    onPanResponderRelease: (_evt, gestureState) => {
      const movedLittle = Math.abs(gestureState.dx) < 6 && Math.abs(gestureState.dy) < 6;

      if (movedLittle) {
        openLightbox();
        return;
      }

      if (Math.abs(gestureState.dx) > 40 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy)) {
        stepImage(gestureState.dx > 0 ? -1 : 1);
      }
    },
  });

  async function addToCart(mode: "cart" | "buyNow") {
    if (!p || cartBusy) return;

    setCartBusy(true);
    try {
      // "Comprar ya" exige sesión iniciada: es lo que permite marcar el
      // producto como vendido solo al confirmar el pedido. "Añadir a la
      // cesta" sigue funcionando como invitado, sin pedir login.
      if (mode === "buyNow") {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user?.id;
        if (!userId) {
          // Sin sesión: primero iniciar sesión o registrarse, y después vuelve a esta ficha.
          await AsyncStorage.setItem(
            "videojuegoszaragoza:volver_tras_acceso",
            JSON.stringify({ ruta: `/producto/${p.id}`, hasta: Date.now() + 30 * 60 * 1000 })
          ).catch(() => {});
          pushRoute(
            `/perfil?acceso=entrar&aviso=${encodeURIComponent("Inicia sesión o crea tu cuenta para comprar. Al terminar volverás a este artículo.")}` as Href
          );
          return;
        }
        await AsyncStorage.setItem(
          BUY_NOW_MARK_KEY,
          JSON.stringify({ productId: p.id, userId } as BuyNowMark)
        );
      }

      // Reserva de 15 minutos: si otro cliente ya lo tiene en su cesta, no se añade.
      const reserva = await reservarProducto(p.id);
      if (!reserva.ok) {
        setReservadoPorOtro(true);
        if (mode === "buyNow") await AsyncStorage.removeItem(BUY_NOW_MARK_KEY);
        return;
      }
      setReservadoPorOtro(false);

      const current = await loadCart();
      const existing = current.find((it) => it.id === p.id);

      const next: CartItem[] = existing
        ? current.map((it) =>
            it.id === p.id ? { ...it, qty, reservedUntil: reserva.hasta } : it
          ) // ya estaba: sigue siendo 1 y renueva la reserva
        : [
            {
              id: p.id,
              title: p.title,
              subtitle: p.category?.name ?? null,
              priceEUR: p.priceEUR,
              qty,
              imageUrl: p.imageUrl,
              reservedUntil: reserva.hasta,
            },
            ...current,
          ];

      await saveCart(next);

      // Conversión: sin await, la analítica nunca retrasa la navegación.
      trackEvent(
        mode === "buyNow" ? "buy_now" : "add_to_cart",
        mode === "buyNow" ? "Comprar ya" : "Añadir a la cesta",
        {
          path: `/producto/${p.id}`,
          metadata: { productId: p.id, price: p.priceEUR },
        }
      );

      if (mode === "buyNow") {
        replaceRoute("/checkout" as Href);
      } else {
        pushRoute("/cesta" as Href);
      }
    } finally {
      setCartBusy(false);
    }
  }

  // Las dudas van primero a Blue IA con el producto como contexto; desde ahí
  // el cliente puede pasar al chat con el equipo.
  function handleAskBlue() {
    if (!p) return;
    pushRoute(`/blue-ia?producto=${encodeURIComponent(p.id)}` as Href);
  }

  async function toggleLike() {
    if (!p || likeBusy) return;

    const nextLiked = !liked;
    const delta = nextLiked ? 1 : -1;

    setLikeBusy(true);
    setLiked(nextLiked);
    setLikeCount((prev) => Math.max(0, prev + delta));

    try {
      // Pasa por api/interaccion.ts: un «me gusta» por persona y producto (ver lib/interaccion.ts).
      const total = await fijarMeGusta(p.id, nextLiked);
      if (total === null) throw new Error("no se pudo actualizar el me gusta");
      setLikeCount(total);

      const likedIds = await getLikedProductIds();
      if (nextLiked) likedIds.add(p.id);
      else likedIds.delete(p.id);
      await saveLikedProductIds(likedIds);
    } catch (e) {
      console.error("Error actualizando el like:", e);
      // Si falla la llamada, se deshace el cambio optimista.
      setLiked(!nextLiked);
      setLikeCount((prev) => Math.max(0, prev - delta));
    } finally {
      setLikeBusy(false);
    }
  }

  async function shareProduct() {
    if (!p) return;

    // Enlace limpio de la ficha: WhatsApp, Instagram… enseñan su vista previa con foto,
    // título y precio (api/compartir.ts, por la regla de vercel.json para sus lectores).
    const url =
      Platform.OS === "web" && typeof window !== "undefined"
        ? `${window.location.origin}/producto/${p.id}`
        : `https://videojuegoszaragoza.com/producto/${p.id}`;

    if (Platform.OS !== "web") {
      try {
        await Share.share({ title: p.title, message: `${p.title} · ${fmtEUR(p.priceEUR)} · ${url}`, url });
      } catch {
        // El usuario canceló el share nativo: no hay nada que hacer.
      }
      return;
    }

    const nav: any = typeof navigator !== "undefined" ? navigator : null;

    if (nav?.share) {
      try {
        await nav.share({ title: p.title, text: `${p.title} · ${fmtEUR(p.priceEUR)}`, url });
      } catch {
        // El usuario canceló el share del navegador: no hay nada que hacer.
      }
      return;
    }

    if (nav?.clipboard?.writeText) {
      try {
        await nav.clipboard.writeText(url);
        setShareFeedback("Enlace copiado");
        setTimeout(() => setShareFeedback(null), 2000);
      } catch {
        // Sin permiso de portapapeles: no hay más alternativa silenciosa.
      }
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: "#F6FAFD",
          paddingHorizontal: pagePadding,
          paddingTop: isMobile ? 12 : 14,
          paddingBottom: isMobile ? 12 : 14,
          alignItems: "center",
        }}
      >
        {/* Columna centrada: en pantallas anchas la ficha no se pega a la izquierda */}
        <View style={{ width: "100%", maxWidth: 1240 }}>
          <CabeceraMarca onBack={smartBack} />
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <CargaMarca texto="Cargando producto…" />
        </View>
      ) : err ? (
        <View style={{ padding: pagePadding, gap: 12, alignItems: "center" }}>
          <MarcaAnimada cual="taller" ancho={130} />
          <View style={{ gap: 6, alignItems: "center", maxWidth: 520 }}>
            <Text style={{ color: "#B91C1C", fontWeight: "900", textAlign: "center" }}>
              No se ha podido cargar el producto
            </Text>
            <Text style={{ color: "#7A271A", lineHeight: 20, textAlign: "center" }}>{err}</Text>
          </View>

          <View
            style={{
              flexDirection: isMobile ? "column" : "row",
              justifyContent: "center",
              alignSelf: "stretch",
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
              onPress={() => replaceRoute("/catalogo" as Href)}
              style={({ pressed }) => ({
                opacity: pressed ? 0.88 : 1,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: "#F6FAFD",
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
        <View style={{ padding: pagePadding, gap: 10, alignItems: "center" }}>
          <MarcaAnimada cual="taller" ancho={130} />
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18, textAlign: "center" }}>
            Producto no disponible
          </Text>

          <Pressable
            onPress={() => replaceRoute("/catalogo" as Href)}
            style={({ pressed }) => ({
              opacity: pressed ? 0.88 : 1,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: "#F6FAFD",
              paddingVertical: 14,
              paddingHorizontal: 16,
              alignSelf: isMobile ? "stretch" : "center",
            })}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>
              Volver al catálogo
            </Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            padding: pagePadding,
            paddingBottom: isMobile ? 28 : 36,
            alignItems: "center",
          }}
          onScroll={(e) => {
            if (e.nativeEvent.contentOffset.y > 40) {
              trackEventThrottled("producto-scroll", "scroll", "Scroll", {
                path: `/producto/${productId ?? ""}`,
              });
            }
          }}
          scrollEventThrottle={16}
        >
          <View style={{ width: "100%", maxWidth: 1240, gap: 14 }}>
          <View style={{ width: "100%", alignItems: "center" }}>
            <Text
              accessibilityRole="header"
              {...({ "aria-level": 1 } as object)}
              style={{
                color: COLORS.text,
                fontSize: isMobile ? 24 : 28,
                fontWeight: "900",
                lineHeight: isMobile ? 30 : 32,
                textAlign: "center",
              }}
              numberOfLines={isMobile ? 3 : 2}
            >
              {p.title}
            </Text>

            <Text
              style={{
                color: COLORS.muted,
                marginTop: 6,
                lineHeight: 20,
                textAlign: "center",
              }}
            >
              {heroSubcopy}
            </Text>
          </View>

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
                  backgroundColor: COLORS.card,
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                {selectedImageUrl ? (
                  <View style={{ width: "100%" }} {...mainImagePan.panHandlers}>
                    <SmartImage
                      uri={selectedImageUrl}
                      alt={p.title}
                      ancho={isWide ? 700 : 420}
                      style={{
                        width: "100%",
                        height: isWide ? 520 : isTablet ? 360 : 260,
                        backgroundColor: "#F8FBFE",
                      }}
                      contentFit="contain"
                    />
                  </View>
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
                        color: "rgba(11,33,56,0.15)",
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
                      Este producto todavía no tiene una imagen disponible, pero puedes consultar
                      el resto de la información y escribirnos si necesitas más detalles.
                    </Text>
                  </View>
                )}

                {shareFeedback ? (
                  <View
                    style={{
                      position: "absolute",
                      right: 12,
                      bottom: 52,
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      backgroundColor: "rgba(11,33,56,0.78)",
                    }}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 12 }}>
                      {shareFeedback}
                    </Text>
                  </View>
                ) : null}

                <View
                  style={{
                    position: "absolute",
                    right: 12,
                    bottom: 12,
                    flexDirection: "row",
                    gap: 8,
                  }}
                >
                  <Pressable
                    onPress={shareProduct}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.85 : 1,
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "rgba(11,33,56,0.60)",
                    })}
                  >
                    <Ionicons name="share-social-outline" size={15} color="#FFFFFF" />
                  </Pressable>

                  <Pressable
                    onPress={toggleLike}
                    disabled={likeBusy}
                    accessibilityRole="button"
                    accessibilityLabel={liked ? "Quitar me gusta" : "Dar me gusta"}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.85 : 1,
                      minWidth: 32,
                      height: 32,
                      borderRadius: 16,
                      paddingHorizontal: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                      backgroundColor: "rgba(11,33,56,0.60)",
                    })}
                  >
                    <Ionicons
                      name={liked ? "heart" : "heart-outline"}
                      size={15}
                      color={liked ? "#FF5A7A" : "#FFFFFF"}
                    />
                    <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 11 }}>
                      {likeCount}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {imageGallery.length > 1 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  // Miniaturas de ancho fijo: el carrusel encaja en cada una (ancho + hueco de 10).
                  snapToInterval={(isMobile ? 74 : 88) + 10}
                  decelerationRate="fast"
                  contentContainerStyle={{
                    gap: 10,
                    paddingTop: 10,
                    flexGrow: 1,
                    justifyContent: "center",
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
                          borderColor: active ? COLORS.accent : "#E3EAF2",
                          backgroundColor: "#F6FAFD",
                        })}
                      >
                        <SmartImage
                          uri={media.publicUrl}
                          alt={`${p.title} (miniatura)`}
                          ancho={90}
                          contentFit="cover"
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
                  paddingVertical: isMobile ? 4 : 8,
                  gap: 14,
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 14,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="shield-checkmark-outline" size={14} color={COLORS.accent} />
                    <Text
                      style={{
                        color: COLORS.text,
                        fontWeight: "900",
                        fontSize: 12,
                        letterSpacing: 0.2,
                      }}
                    >
                      {p.condition === "NEW"
                        ? "Nuevo · unidad única"
                        : `Segunda mano · ${labelCondition(p.condition)} · unidad única`}
                    </Text>
                  </View>

                  {viewCount !== null && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <Ionicons name="eye-outline" size={14} color={COLORS.muted} />
                      <Text
                        style={{
                          color: COLORS.muted,
                          fontWeight: "700",
                          fontSize: 12,
                        }}
                      >
                        {viewCount} {viewCount === 1 ? "Visita" : "Visitas"}
                      </Text>
                    </View>
                  )}
                </View>

                <Text
                  style={{
                    color: COLORS.accent,
                    fontSize: isMobile ? 28 : 34,
                    fontWeight: "900",
                    lineHeight: isMobile ? 32 : 38,
                    textAlign: "center",
                  }}
                >
                  {fmtEUR(p.priceEUR)}
                </Text>

                {reservadoPorOtro ? (
                  <Text
                    style={{
                      color: COLORS.muted,
                      fontWeight: "800",
                      fontSize: 13.5,
                      lineHeight: 19,
                      textAlign: "center",
                    }}
                  >
                    Otro cliente lo tiene en su cesta. Se reserva {RESERVA_MINUTOS} minutos:
                    vuelve a mirar en un rato.
                  </Text>
                ) : null}

                <View style={{ gap: 10, width: "100%", maxWidth: 460 }}>
                  {/* Acción principal: una sola, clara. La secundaria, con contorno. */}
                  <Pressable
                    onPress={() => addToCart("buyNow")}
                    disabled={!canBuy || cartBusy}
                    accessibilityRole="button"
                    accessibilityLabel={`Comprar ya ${p.title}`}
                    style={({ pressed }) => ({
                      opacity: !canBuy ? 0.45 : pressed ? 0.9 : 1,
                      borderRadius: 999,
                      minHeight: 52,
                      justifyContent: "center",
                      alignItems: "center",
                      backgroundColor: COLORS.accentDark,
                    })}
                  >
                    {cartBusy ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>Comprar ya</Text>
                    )}
                  </Pressable>

                  <Pressable
                    onPress={() => addToCart("cart")}
                    disabled={!canBuy || cartBusy}
                    accessibilityRole="button"
                    accessibilityLabel={`Añadir ${p.title} a la cesta`}
                    style={({ pressed }) => ({
                      opacity: !canBuy ? 0.45 : pressed ? 0.9 : 1,
                      borderRadius: 999,
                      minHeight: 48,
                      justifyContent: "center",
                      alignItems: "center",
                      borderWidth: 1.5,
                      borderColor: COLORS.accent,
                      backgroundColor: "#FFFFFF",
                    })}
                  >
                    <Text style={{ color: COLORS.accentDark, fontWeight: "900", fontSize: 15 }}>
                      Añadir a la cesta
                    </Text>
                  </Pressable>

                  {/* Dudas: primero Blue IA con el producto como contexto; desde ahí, el equipo. */}
                  <Pressable
                    onPress={handleAskBlue}
                    accessibilityRole="button"
                    accessibilityLabel="Preguntar por este producto"
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.88 : 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                      minHeight: 44,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      backgroundColor: "#FFFFFF",
                    })}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={16} color={COLORS.text} />
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13.5 }}>
                      Preguntar por este producto
                    </Text>
                  </Pressable>
                </View>

                {/* Ficha técnica de VeoAura, tal cual llega y en su orden. Sin lista, no sale. */}
                {p.caracteristicas.length > 0 && (
                  <View
                    nativeID="producto-caracteristicas"
                    style={{ width: "100%", gap: 8, alignItems: "center", paddingTop: 16, borderTopWidth: 1, borderTopColor: COLORS.borderSoft }}
                  >
                    <Text
                      accessibilityRole="header"
                      {...({ "aria-level": 2 } as object)}
                      style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}
                    >
                      Características
                    </Text>
                    <View style={{ width: "100%", maxWidth: 520 }}>
                      {p.caracteristicas.map((c, i) => (
                        <View
                          key={`${i}-${c.etiqueta}`}
                          accessible
                          accessibilityLabel={`${c.etiqueta}: ${c.valor}`}
                          style={{
                            flexDirection: "row",
                            alignItems: "flex-start",
                            gap: 12,
                            paddingVertical: 9,
                            borderBottomWidth: i === p.caracteristicas.length - 1 ? 0 : 1,
                            borderBottomColor: COLORS.borderSoft,
                          }}
                        >
                          <Text style={{ flex: 1, color: COLORS.muted, fontWeight: "700", fontSize: 14, lineHeight: 20 }}>
                            {c.etiqueta}
                          </Text>
                          <Text style={{ flex: 1, color: COLORS.text, fontWeight: "800", fontSize: 14, lineHeight: 20, textAlign: "right" }}>
                            {c.valor}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Sin recuadros: secciones separadas solo por una línea fina. */}
                <View style={{ width: "100%", gap: 8, alignItems: "center", paddingTop: 16, borderTopWidth: 1, borderTopColor: COLORS.borderSoft }}>
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>
                    Descripción
                  </Text>

                  {p.description?.trim() ? (
                    <Text style={{ color: COLORS.muted, lineHeight: 22, textAlign: "center" }}>
                      {p.description.trim()}
                    </Text>
                  ) : (
                    <Text style={{ color: COLORS.muted2, lineHeight: 22, textAlign: "center" }}>
                      Todavía no hay una descripción disponible para este producto. Aun así,
                      puedes preguntarnos por su estado, contenido, compatibilidad o
                      disponibilidad por el chat.
                    </Text>
                  )}
                </View>

              </View>
              {/* Las garantías y promesas las escribe la tienda en la descripción de cada producto. */}
            </View>
          </View>

          {/* Último botón: limpio y claro, vuelve a donde estaba (o al catálogo). */}
          <View style={{ alignItems: "center", paddingTop: 8, paddingBottom: 8 }}>
            <Pressable
              onPress={smartBack}
              accessibilityRole="button"
              accessibilityLabel="Volver atrás"
              style={({ pressed }) => ({
                width: "100%",
                maxWidth: 320,
                minHeight: 52,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                borderRadius: 999,
                borderWidth: 1.5,
                borderColor: COLORS.accent,
                backgroundColor: "#FFFFFF",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Ionicons name="chevron-back" size={20} color={COLORS.accent} />
              <Text style={{ color: COLORS.accent, fontWeight: "900", fontSize: 16 }}>Volver atrás</Text>
            </Pressable>
          </View>
          </View>
        </ScrollView>
      )}

      <ImageLightbox
        visible={lightboxOpen}
        images={lightboxImages}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxOpen(false)}
      />
    </View>
  );
}
