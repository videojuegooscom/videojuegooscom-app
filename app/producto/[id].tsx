/**
 * app/producto/[id].tsx
 *
 * Qué hace: ficha de un producto individual. Carga el producto y su galería
 * de fotos/vídeos desde Supabase a partir del id de la URL, y permite
 * añadirlo a la cesta, ir a checkout, preguntar por WhatsApp, abrir un chat
 * privado sobre este producto, compartir la ficha o darle "me gusta".
 *
 * Chat privado: el botón "Chat" (junto a "Preguntar por WhatsApp") exige
 * sesión iniciada; con sesión, get_or_create_product_chat (ver
 * sql/product_chats.sql) crea o reutiliza la conversación de
 * (este producto, este cliente) y lleva a app/chat/[chatId].tsx. Así Jefe
 * puede ver, desde app/admin/chats.tsx, quién le ha escrito por cada
 * artículo y marcarlo como vendido a la persona correcta.
 *
 * Cómo funciona: fetchProductSafe() intenta varias variantes de la consulta
 * (con/sin join de categoría, con/sin columna de imágenes, con/sin
 * like_count) para no romperse si falta alguna columna en la base de datos.
 * pickInitialHeroImage() elige la foto de portada. detectAdmin() decide si
 * se muestra información extra (estado interno) reservada para el panel de
 * admin.
 *
 * "Me gusta": el contador vive en products.like_count (ver
 * sql/product_likes.sql — hay que ejecutarlo una vez en Supabase). Se
 * actualiza con la función adjust_product_like(product_id, delta), que solo
 * puede sumar o restar 1 a ese contador (no da acceso a modificar el resto
 * de la fila), así que un visitante sin cuenta también puede dar like. Qué
 * productos ha marcado CADA dispositivo se guarda en AsyncStorage (igual que
 * la cesta), no en Supabase, para no exigir inicio de sesión. Si la tabla
 * todavía no tiene la columna like_count, el botón se deshabilita solo
 * (likesSupported=false) en vez de romper la pantalla.
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
 * Rendimiento: dentro de loadProduct(), la comprobación de admin y la carga
 * del producto siguen siendo secuenciales a propósito (la segunda necesita
 * saber si eres admin antes de decidir qué puede ver), pero la consulta de
 * categoría y la de fotos/vídeos del producto ya NO dependen entre sí, así
 * que se lanzan juntas con Promise.all en vez de una detrás de otra.
 *
 * Conectado con:
 * - lib/supabase.ts → tablas products, product_media, categories, profiles.
 * - sql/product_likes.sql → columna like_count y función adjust_product_like.
 * - app/catalogo.tsx → de donde se navega hasta aquí.
 * - app/(tabs)/cesta.tsx y app/checkout.tsx → botones "Ver cesta" y
 *   "Finalizar compra".
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Href } from "expo-router";
import {
  ActivityIndicator,
  Image,
  Linking,
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
import ImageLightbox, { type LightboxImage } from "../../components/ImageLightbox";

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
  accentDark: "#0E86C4",
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
  condition: string | null;
  like_count: number | null;
  reference: string | null;
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
  condition: ProductCondition;
  likeCount: number;
  reference: string | null;
};

const BRAND = {
  whatsappPhoneE164: "+34627748741",
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
  replaceRoute("/catalogo" as Href);
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
    return "Toda la información de este producto está verificada, y nuestro equipo está disponible para resolver cualquier duda antes de tu compra.";
  }
  return "Ficha de producto sencilla y clara, con atención rápida y directa si necesitas confirmar cualquier detalle antes de comprar.";
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

function buildProductSelectVariants(includeLikeCount: boolean, includeReference: boolean) {
  const extraFrag =
    (includeLikeCount ? ",like_count" : "") + (includeReference ? ",reference" : "");

  return {
    withJoinAndImages: `id,title,description,price_eur,status,is_active,category_id,images,updated_at,created_at,condition${extraFrag},category:categories(id,name,slug)`,
    withJoinBase: `id,title,description,price_eur,status,is_active,category_id,updated_at,created_at,condition${extraFrag},category:categories(id,name,slug)`,
    imagesNoJoin: `id,title,description,price_eur,status,is_active,category_id,images,updated_at,created_at,condition${extraFrag}`,
    baseNoJoin: `id,title,description,price_eur,status,is_active,category_id,updated_at,created_at,condition${extraFrag}`,
  };
}

// Devuelve la fila y si el "me gusta" y el número de referencia están
// disponibles: si a la tabla products todavía le falta like_count (falta
// ejecutar sql/product_likes.sql) o reference (falta sql/product_reference.sql),
// se reintenta toda la consulta sin la columna que falte en vez de romper
// la ficha de producto.
async function fetchProductSafe(
  productId: string,
  adminFlag: boolean
): Promise<{ row: ProductDbRow | null; likesSupported: boolean; referenceSupported: boolean }> {
  for (const includeLikeCount of [true, false]) {
    for (const includeReference of [true, false]) {
      const variants = buildProductSelectVariants(includeLikeCount, includeReference);
      const attempts = [
        variants.withJoinAndImages,
        variants.withJoinBase,
        variants.imagesNoJoin,
        variants.baseNoJoin,
      ];

      let missingOptionalColumn = false;

      for (const selectStr of attempts) {
        let query = supabase.from("products").select(selectStr).eq("id", productId);

        if (!adminFlag) {
          query = query.eq("is_active", true).eq("status", "PUBLISHED");
        }

        const res = await query.maybeSingle();

        if (!res.error) {
          return {
            row: asProductDbRow(res.data),
            likesSupported: includeLikeCount,
            referenceSupported: includeReference,
          };
        }

        if (
          (includeLikeCount && isMissingColumnError(res.error, "like_count")) ||
          (includeReference && isMissingColumnError(res.error, "reference"))
        ) {
          missingOptionalColumn = true;
          break;
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

      if (!missingOptionalColumn) break;
    }
  }

  return { row: null, likesSupported: false, referenceSupported: false };
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
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likeBusy, setLikeBusy] = useState(false);
  const [likesSupported, setLikesSupported] = useState(true);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [cartBusy, setCartBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

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

  const whatsappText = useMemo(() => {
    const title = p?.title ? `Producto: ${p.title}` : "Producto de la tienda";
    const price = p?.priceEUR ? `Precio: ${fmtEUR(p.priceEUR)}` : "";

    return `Hola, vengo desde Videojuegoszaragoza.com.

${title}
${price}

¿Sigue disponible? Me interesa este producto.`;
  }, [p?.title, p?.priceEUR]);

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

    try {
      const adminFlag = await detectAdmin();
      if (seq !== reqSeqRef.current) return;
      setIsAdmin(adminFlag);

      const { row: productRow, likesSupported: likesOk } = await fetchProductSafe(
        productId,
        adminFlag
      );
      if (seq !== reqSeqRef.current) return;
      setLikesSupported(likesOk);

      if (!productRow) {
        setP(null);
        setSelectedImageUrl(null);
        setErr(
          "Este producto no existe o ya no está disponible para la venta. Prueba a volver al catálogo para ver el resto de artículos."
        );
        return;
      }

      // Estas dos consultas no dependen entre sí (solo del producto que ya
      // tenemos), así que se lanzan a la vez en vez de una detrás de otra —
      // se ahorra una ida y vuelta a la red completa en cada ficha de
      // producto, algo que se nota sobre todo en móvil con red lenta.
      const [categoryMap, mediaRows] = await Promise.all([
        fetchCategoryMapByIds(productRow.category_id ? [productRow.category_id] : []),
        loadProductMediaRows(productRow.id),
      ]);
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
        condition: asProductCondition(productRow.condition),
        likeCount: Math.max(0, Number(productRow.like_count ?? 0)),
        reference: productRow.reference ?? null,
      };

      setP(mapped);
      setSelectedImageUrl(heroImage);
      setLikeCount(mapped.likeCount);

      const likedIds = await getLikedProductIds();
      if (seq !== reqSeqRef.current) return;
      setLiked(likedIds.has(mapped.id));
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
    setQty(1);
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
    onMoveShouldSetPanResponder: (_evt, gestureState) =>
      Math.abs(gestureState.dx) > 6 || Math.abs(gestureState.dy) > 6,
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
          pushRoute("/perfil" as Href);
          return;
        }
        await AsyncStorage.setItem(
          BUY_NOW_MARK_KEY,
          JSON.stringify({ productId: p.id, userId } as BuyNowMark)
        );
      }

      const current = await loadCart();
      const existing = current.find((it) => it.id === p.id);

      const next: CartItem[] = existing
        ? current.map((it) => (it.id === p.id ? { ...it, qty: it.qty + qty } : it))
        : [
            {
              id: p.id,
              title: p.title,
              subtitle: p.category?.name ?? null,
              priceEUR: p.priceEUR,
              qty,
              imageUrl: p.imageUrl,
            },
            ...current,
          ];

      await saveCart(next);

      if (mode === "buyNow") {
        replaceRoute("/checkout" as Href);
      } else {
        pushRoute("/cesta" as Href);
      }
    } finally {
      setCartBusy(false);
    }
  }

  async function handleChatPress() {
    if (!p || chatBusy) return;

    setChatBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user) {
        pushRoute("/perfil" as Href);
        return;
      }

      const { data: chatId, error } = await supabase.rpc("get_or_create_product_chat", {
        p_product_id: p.id,
      });
      if (error) throw error;

      pushRoute({ pathname: "/chat/[chatId]", params: { chatId: String(chatId) } });
    } catch (e) {
      console.error("Error abriendo el chat del producto:", e);
    } finally {
      setChatBusy(false);
    }
  }

  async function toggleLike() {
    if (!p || !likesSupported || likeBusy) return;

    const nextLiked = !liked;
    const delta = nextLiked ? 1 : -1;

    setLikeBusy(true);
    setLiked(nextLiked);
    setLikeCount((prev) => Math.max(0, prev + delta));

    try {
      const { data, error } = await supabase.rpc("adjust_product_like", {
        product_id: p.id,
        delta,
      });

      if (error) throw error;
      if (typeof data === "number") setLikeCount(data);

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

    const url =
      Platform.OS === "web" && typeof window !== "undefined"
        ? window.location.href
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
        await nav.share({ title: p.title, url });
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
        <Pressable
          onPress={smartBack}
          style={({ pressed }) => ({
            opacity: pressed ? 0.88 : 1,
            alignSelf: "flex-start",
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: "#F6FAFD",
          })}
        >
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>←</Text>
        </Pressable>
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
              borderColor: "#F5B5B5",
              backgroundColor: "#FDECEC",
              padding: 14,
              gap: 6,
            }}
          >
            <Text style={{ color: "#B91C1C", fontWeight: "900" }}>No se ha podido cargar el producto</Text>
            <Text style={{ color: "#7A271A", lineHeight: 20 }}>{err}</Text>
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
        <View style={{ padding: pagePadding, gap: 10 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18 }}>
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
              alignSelf: isMobile ? "stretch" : "flex-start",
            })}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>
              Volver al catálogo
            </Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: pagePadding,
            paddingBottom: isMobile ? 28 : 36,
            alignItems: "center",
          }}
        >
          <View style={{ width: "100%", maxWidth: 1240, gap: 14 }}>
          <View style={{ width: "100%", alignItems: isMobile ? "center" : "flex-start" }}>
            <Text
              style={{
                color: COLORS.text,
                fontSize: isMobile ? 24 : 28,
                fontWeight: "900",
                lineHeight: isMobile ? 30 : 32,
                textAlign: isMobile ? "center" : "left",
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
                textAlign: isMobile ? "center" : "left",
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
                  borderWidth: 1,
                  borderColor: "#E3EAF2",
                  backgroundColor: COLORS.card,
                  overflow: "hidden",
                  position: "relative",
                  ...softShadow(),
                }}
              >
                {selectedImageUrl ? (
                  <View style={{ width: "100%" }} {...mainImagePan.panHandlers}>
                    <Image
                      source={{ uri: selectedImageUrl }}
                      style={{
                        width: "100%",
                        height: isWide ? 520 : isTablet ? 360 : 260,
                        backgroundColor: "#F8FBFE",
                      }}
                      resizeMode="contain"
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
                    disabled={!likesSupported || likeBusy}
                    style={({ pressed }) => ({
                      opacity: !likesSupported ? 0.5 : pressed ? 0.85 : 1,
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
                          borderColor: active ? COLORS.accent : "#E3EAF2",
                          backgroundColor: "#F6FAFD",
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
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      borderRadius: 999,
                      backgroundColor: COLORS.accent2,
                      borderWidth: 1,
                      borderColor: COLORS.accentBorder,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Ionicons name="shield-checkmark-outline" size={14} color={COLORS.accent} />
                    <Text
                      style={{
                        color: COLORS.text,
                        fontWeight: "900",
                        fontSize: 12,
                        letterSpacing: 0.2,
                      }}
                    >
                      De segunda mano: {labelCondition(p.condition)}
                    </Text>
                  </View>
                </View>

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

                <View style={{ gap: 10 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Text style={{ color: COLORS.muted2, fontWeight: "800", fontSize: 13 }}>
                        Cantidad
                      </Text>

                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: COLORS.border,
                          backgroundColor: "#F6FAFD",
                          overflow: "hidden",
                        }}
                      >
                        <Pressable
                          onPress={() => setQty((n) => Math.max(1, n - 1))}
                          disabled={qty <= 1}
                          style={({ pressed }) => ({
                            opacity: qty <= 1 ? 0.4 : pressed ? 0.85 : 1,
                            width: 36,
                            height: 36,
                            alignItems: "center",
                            justifyContent: "center",
                          })}
                        >
                          <Ionicons name="remove" size={16} color={COLORS.text} />
                        </Pressable>

                        <Text
                          style={{
                            minWidth: 30,
                            textAlign: "center",
                            color: COLORS.text,
                            fontWeight: "900",
                          }}
                      >
                        {qty}
                      </Text>

                      <Pressable
                        onPress={() => setQty((n) => Math.min(20, n + 1))}
                        disabled={qty >= 20}
                        style={({ pressed }) => ({
                          opacity: qty >= 20 ? 0.4 : pressed ? 0.85 : 1,
                          width: 36,
                          height: 36,
                          alignItems: "center",
                          justifyContent: "center",
                        })}
                      >
                        <Ionicons name="add" size={16} color={COLORS.text} />
                      </Pressable>
                    </View>
                    </View>

                    <Pressable
                      onPress={handleChatPress}
                      disabled={chatBusy}
                      style={({ pressed }) => ({
                        opacity: chatBusy ? 0.6 : pressed ? 0.88 : 1,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        height: 36,
                        paddingHorizontal: 14,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        backgroundColor: "#FFFFFF",
                      })}
                    >
                      {chatBusy ? (
                        <ActivityIndicator size="small" color={COLORS.text} />
                      ) : (
                        <Ionicons name="chatbubble-ellipses-outline" size={16} color={COLORS.text} />
                      )}
                      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13 }}>Chat</Text>
                    </Pressable>
                  </View>

                  <Pressable
                    onPress={() => addToCart("cart")}
                    disabled={!canBuy || cartBusy}
                    style={({ pressed }) => ({
                      opacity: !canBuy ? 0.45 : pressed ? 0.9 : 1,
                      borderRadius: 999,
                      paddingVertical: 14,
                      alignItems: "center",
                      backgroundColor: COLORS.accent,
                    })}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>
                      Añadir a la cesta
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => addToCart("buyNow")}
                    disabled={!canBuy || cartBusy}
                    style={({ pressed }) => ({
                      opacity: !canBuy ? 0.45 : pressed ? 0.9 : 1,
                      borderRadius: 999,
                      paddingVertical: 14,
                      alignItems: "center",
                      backgroundColor: COLORS.accentDark,
                    })}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>
                      Comprar ya
                    </Text>
                  </Pressable>
                </View>

                <View
                  style={{
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: COLORS.borderSoft,
                    backgroundColor: "#F8FBFE",
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
                      Todavía no hay una descripción disponible para este producto. Aun así,
                      puedes preguntarnos por su estado, contenido, compatibilidad o
                      disponibilidad por WhatsApp.
                    </Text>
                  )}
                </View>

                <View
                  style={{
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: COLORS.borderSoft,
                    backgroundColor: "#F8FBFE",
                    padding: 14,
                    gap: 10,
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
                    Información del producto
                  </Text>

                  <View style={{ gap: 8 }}>
                    <InfoRow label="Estado" value={badgeLabel} isMobile={isMobile} />
                    {p.reference ? (
                      <InfoRow
                        label="Número de referencia del artículo"
                        value={p.reference}
                        isMobile={isMobile}
                      />
                    ) : null}
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
                      value={canBuy ? "Disponible para añadir a la cesta" : "No disponible"}
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
                    backgroundColor: "#F4F9FD",
                    padding: 14,
                    gap: 8,
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
                    ¿Tienes dudas antes de comprar?
                  </Text>

                  <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                    Escríbenos y te confirmamos disponibilidad, estado, accesorios incluidos o
                    cualquier otro detalle que necesites.
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
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <Ionicons name="logo-whatsapp" size={16} color={COLORS.text} />
                      <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>
                        Preguntar por WhatsApp
                      </Text>
                    </View>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>

          <View style={{ alignItems: "center", paddingTop: 4 }}>
            <Pressable
              onPress={() => replaceRoute("/catalogo" as Href)}
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
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>← Volver al catálogo</Text>
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
        borderColor: "#E3EAF2",
        backgroundColor: "#F6FAFD",
        width: isMobile ? "auto" : undefined,
      }}
    >
      <Text style={{ color: "rgba(11,33,56,0.72)", fontWeight: "800", fontSize: 13 }}>
        {text}
      </Text>
    </View>
  );
}