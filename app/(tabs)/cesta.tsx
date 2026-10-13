/**
 * app/(tabs)/cesta.tsx
 *
 * Qué hace: pantalla de la cesta de la compra. Guarda los artículos en el
 * dispositivo (AsyncStorage) para que sobrevivan a cerrar la app, permite
 * subir/bajar cantidad, quitar artículos y calcula el total.
 *
 * Cómo funciona: usa la misma clave CART_KEY = "videojuegoos_cart_v1" que
 * lee app/checkout.tsx. Si llegas aquí con el parámetro ?add=<id> (por
 * ejemplo desde la ficha de producto), addToCartById() busca ese producto
 * en Supabase y lo añade automáticamente.
 *
 * Conectado con:
 * - app/producto/[id].tsx → botón "Añadir a la cesta" (navega aquí con
 *   ?add=<id>).
 * - app/checkout.tsx → botón "Ir a pagar".
 * - lib/supabase.ts → tabla products, para completar los datos del
 *   artículo añadido.
 * - components/PromoBanner.tsx → franja "Te compramos tu consola..." fija
 *   arriba del todo (misma franja que en el resto de pestañas).
 * - components/VenderAhoraModal.tsx → formulario que abre el botón "Vender
 *   Ya" de esa franja.
 * - components/SocialLinks.tsx → bloque "Síguenos" debajo del resumen del
 *   pedido, con los logos de las redes sociales activas.
 */
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Href } from "expo-router";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  View,
} from "react-native";
import CategoryProductsShelf from "../../components/CategoryProductsShelf";
import PromoBanner from "../../components/PromoBanner";
import SiteFooter from "../../components/SiteFooter";
import SocialLinks from "../../components/SocialLinks";
import VenderAhoraModal from "../../components/VenderAhoraModal";
import {
  formatoCuentaAtras,
  liberarReserva,
  RESERVA_MINUTOS,
  reservarProducto,
} from "../../lib/reservas";
import { supabase } from "../../lib/supabase";

const COLORS = {
  bg: "#FFFFFF",
  // bg2/card/cardSoft eran tonos grisáceos muy sutiles (#F4F9FD/#F6FAFD/
  // #F8FBFE) para distinguir tarjetas del fondo. A petición de Daniel, ahora
  // valen igual que "bg" (blanco puro): toda la pantalla queda de un blanco
  // limpio y uniforme, sin ese "fondo blanco grisáceo" — los bloques se
  // siguen distinguiendo por el espaciado, no por un tono de fondo distinto.
  bg2: "#FFFFFF",
  card: "#FFFFFF",
  cardSoft: "#FFFFFF",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  mutedSoft: "rgba(11,33,56,0.48)",
  accent: "#1EA7E8",
  gold: "#B8860B",
  danger: "#DC2626",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  success: "#15803D",
  successBg: "#DCFCE7",
  successBorder: "#86EFAC",
  gamingGlow: "#1EA7E8",
};

// Envoltorio de Pressable con una pequeña animación "pop" al pulsar (mismo
// patrón que app/(tabs)/perfil.tsx y components/VenderAhoraModal.tsx): se
// encoge levemente y vuelve a su tamaño con un muelle.
function AnimatedPressable({
  onPress,
  disabled,
  style,
  children,
}: {
  onPress?: () => void;
  disabled?: boolean;
  style?: any;
  children?: React.ReactNode;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  function onPressIn() {
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 50,
      bounciness: 6,
    }).start();
  }

  function onPressOut() {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 6,
    }).start();
  }

  return (
    <Pressable onPress={onPress} disabled={disabled} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

// Botón de acción principal/secundario, mismo estilo que app/(tabs)/perfil.tsx
// (fondo azul sólido con texto blanco en "primary", fondo suave con borde en
// "secondary"), para que la cesta se sienta parte de la misma app.
function ActionButton({
  title,
  onPress,
  disabled,
  variant = "primary",
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  const isPrimary = variant === "primary";

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      style={{
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 14,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: isPrimary ? 0 : 1,
        borderColor: isPrimary ? "transparent" : COLORS.border,
        backgroundColor: isPrimary ? COLORS.accent : COLORS.cardSoft,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text
        style={{
          color: isPrimary ? "#FFFFFF" : COLORS.text,
          fontWeight: "900",
          fontSize: 15,
        }}
      >
        {title}
      </Text>
    </AnimatedPressable>
  );
}

// Insignia pequeña en píldora, mismo componente que app/(tabs)/perfil.tsx:
// se usa para el contador de artículos y para destacar "Envío gratis".
function Badge({
  text,
  tone = "default",
}: {
  text: string;
  tone?: "default" | "accent" | "success";
}) {
  const toneStyles =
    tone === "accent"
      ? { bg: COLORS.accent2, border: COLORS.accentBorder, color: COLORS.text }
      : tone === "success"
      ? { bg: COLORS.successBg, border: COLORS.successBorder, color: COLORS.success }
      : { bg: "#F6FAFD", border: COLORS.border, color: COLORS.text };

  return (
    <View
      style={{
        alignSelf: "center",
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: toneStyles.border,
        backgroundColor: toneStyles.bg,
      }}
    >
      <Text style={{ color: toneStyles.color, fontWeight: "900", fontSize: 12 }}>{text}</Text>
    </View>
  );
}

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

type DbStatus = "DRAFT" | "PUBLISHED" | "REVIEW";

type ProductCategoryLite = {
  id?: string | null;
  name?: string | null;
  slug?: string | null;
};

type ProductRow = {
  id: string;
  title: string;
  description: string | null;
  price_eur: number | null;
  status: DbStatus;
  is_active: boolean;
  category?: ProductCategoryLite | null;
  images?: string[] | null;
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

const CART_KEY = "videojuegoos_cart_v1";

function pushRoute(route: Href) {
  router.push(route);
}

function replaceRoute(route: Href) {
  router.replace(route);
}

function fmtEUR(n: number) {
  const safe = Number.isFinite(n) ? n : 0;
  // Antes se redondeaba siempre a euros enteros (Math.round) y se perdían
  // los céntimos (17,97€ se veía como "18€"); ahora se muestran decimales
  // solo cuando el precio los tiene de verdad.
  const rounded = Math.round(safe * 100) / 100;
  const hasCents = Math.abs(rounded - Math.round(rounded)) > 0.001;
  return hasCents ? `${rounded.toFixed(2).replace(".", ",")}€` : `${Math.round(rounded)}€`;
}

function safeInt(n: unknown, fallback = 1) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(0, Math.floor(x));
}

function asCartItem(value: unknown): CartItem | null {
  if (!value || typeof value !== "object") return null;

  const row = value as Record<string, unknown>;
  const id = String(row.id ?? "").trim();
  const title = String(row.title ?? "").trim();
  const qty = safeInt(row.qty, 1);

  if (!id || !title || qty <= 0) return null;

  return {
    id,
    title,
    subtitle: typeof row.subtitle === "string" ? row.subtitle : null,
    priceEUR: Number(row.priceEUR ?? 0),
    qty,
    imageUrl: typeof row.imageUrl === "string" ? row.imageUrl : null,
    reservedUntil: Number.isFinite(Number(row.reservedUntil)) ? Number(row.reservedUntil) : undefined,
  };
}

function asProductRow(value: unknown): ProductRow | null {
  if (!value || typeof value !== "object") return null;

  const row = value as Record<string, unknown>;
  const id = String(row.id ?? "").trim();
  const title = String(row.title ?? "").trim();

  if (!id || !title) return null;

  return {
    id,
    title,
    description: typeof row.description === "string" ? row.description : null,
    price_eur:
      typeof row.price_eur === "number" || typeof row.price_eur === "string"
        ? Number(row.price_eur)
        : null,
    status:
      row.status === "DRAFT" || row.status === "PUBLISHED" || row.status === "REVIEW"
        ? row.status
        : "DRAFT",
    is_active: Boolean(row.is_active),
    category:
      row.category && typeof row.category === "object"
        ? {
            id: typeof (row.category as Record<string, unknown>).id === "string"
              ? ((row.category as Record<string, unknown>).id as string)
              : null,
            name: typeof (row.category as Record<string, unknown>).name === "string"
              ? ((row.category as Record<string, unknown>).name as string)
              : null,
            slug: typeof (row.category as Record<string, unknown>).slug === "string"
              ? ((row.category as Record<string, unknown>).slug as string)
              : null,
          }
        : null,
    images: Array.isArray(row.images)
      ? (row.images as unknown[]).filter((v): v is string => typeof v === "string")
      : null,
  };
}

// Mismo patrón que app/catalogo.tsx y app/producto/[id].tsx para elegir la
// foto de portada de un producto: primero busca en product_media (respeta
// is_cover y sort_order), y si no hay nada ahí cae al array products.images.
function firstImageFromAnyRow(row: ProductRow | null | undefined): string | null {
  const imgs = row?.images;

  if (Array.isArray(imgs) && imgs.length > 0) {
    const first = imgs.find((v) => typeof v === "string" && v.trim());
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

function pickHeroImage(productRow: ProductRow, mediaRows: ProductMediaRow[]) {
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

function isMissingColumnError(error: unknown, columnName: string) {
  const msg = String((error as { message?: string } | null)?.message ?? "").toLowerCase();
  const col = columnName.toLowerCase();

  return (
    msg.includes(col) &&
    (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("column"))
  );
}

function isMissingRelationError(error: unknown, relationName: string) {
  const msg = String((error as { message?: string } | null)?.message ?? "").toLowerCase();
  const rel = relationName.toLowerCase();

  return (
    msg.includes(rel) &&
    (msg.includes("does not exist") ||
      msg.includes("relation") ||
      msg.includes("could not find the table"))
  );
}

async function loadCart(): Promise<CartItem[]> {
  try {
    const raw = await AsyncStorage.getItem(CART_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(asCartItem)
      .filter((item): item is CartItem => Boolean(item));
  } catch {
    return [];
  }
}

async function saveCart(items: CartItem[]) {
  try {
    await AsyncStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {
    // no-op
  }
}

async function fetchProductMediaForCart(productId: string): Promise<ProductMediaRow[]> {
  const selectStr =
    "id,product_id,kind,public_url,file_name,sort_order,is_cover,duration_seconds";

  const res = await supabase
    .from("product_media")
    .select(selectStr)
    .eq("product_id", productId)
    .limit(200);

  if (res.error) {
    if (isMissingRelationError(res.error, "product_media")) return [];
    // No bloqueamos el añadido al carrito por un fallo al pedir las fotos.
    return [];
  }

  return Array.isArray(res.data) ? (res.data as unknown as ProductMediaRow[]) : [];
}

async function fetchProductForCart(productId: string): Promise<CartItem | null> {
  const selectWithJoinAndImages =
    "id,title,description,price_eur,status,is_active,images,category:categories(id,name,slug)";
  const selectWithJoinBase =
    "id,title,description,price_eur,status,is_active,category:categories(id,name,slug)";
  const selectImagesNoJoin = "id,title,description,price_eur,status,is_active,images";
  const selectBaseNoJoin = "id,title,description,price_eur,status,is_active";

  const buildQuery = (selectStr: string) =>
    supabase
      .from("products")
      .select(selectStr)
      .eq("id", productId)
      .eq("is_active", true)
      .eq("status", "PUBLISHED")
      .maybeSingle();

  const attempts = [
    selectWithJoinAndImages,
    selectWithJoinBase,
    selectImagesNoJoin,
    selectBaseNoJoin,
  ];

  let product: ProductRow | null = null;
  let lastError: unknown = null;

  for (const selectStr of attempts) {
    const res = await buildQuery(selectStr);

    if (!res.error) {
      product = asProductRow(res.data);
      lastError = null;
      break;
    }

    lastError = res.error;

    const canFallback =
      isMissingRelationError(res.error, "categories") ||
      isMissingColumnError(res.error, "name") ||
      isMissingColumnError(res.error, "slug") ||
      isMissingColumnError(res.error, "images");

    if (!canFallback) throw res.error;
  }

  if (lastError) throw lastError;
  if (!product) return null;

  const subtitleParts: string[] = [];
  if (product.category?.name) subtitleParts.push(product.category.name);
  subtitleParts.push("Revisado");

  if (!subtitleParts.length && product.description) {
    subtitleParts.push(product.description);
  }

  let imageUrl: string | null = null;
  try {
    const mediaRows = await fetchProductMediaForCart(product.id);
    imageUrl = pickHeroImage(product, mediaRows);
  } catch {
    imageUrl = firstImageFromAnyRow(product);
  }

  return {
    id: product.id,
    title: product.title,
    subtitle: subtitleParts.join(" · "),
    priceEUR: Number(product.price_eur ?? 0),
    qty: 1,
    imageUrl,
  };
}

export default function CestaScreen() {
  const params = useLocalSearchParams<{ add?: string }>();
  const addId = typeof params.add === "string" ? params.add.trim() : "";

  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [sellModalOpen, setSellModalOpen] = useState(false);

  const bootedRef = useRef(false);
  const lastAddRef = useRef<string>("");

  const subtotal = useMemo(
    () => items.reduce((acc, it) => acc + it.priceEUR * it.qty, 0),
    [items]
  );

  const shipping = 0;
  const total = subtotal + shipping;

  const persist = useCallback(async (next: CartItem[]) => {
    setItems(next);
    await saveCart(next);
  }, []);

  const remove = useCallback(
    async (id: string) => {
      const next = items.filter((it) => it.id !== id);
      await persist(next);
      liberarReserva(id);
    },
    [items, persist]
  );

  const clear = useCallback(async () => {
    const ids = items.map((it) => it.id);
    await persist([]);
    ids.forEach((id) => liberarReserva(id));
  }, [items, persist]);

  // Reloj de la cuenta atrás de la reserva (un tic por segundo mientras haya artículos).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!items.length) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [items.length]);

  // Al acabar los 15 minutos el artículo sale de la cesta y queda libre para otros.
  useEffect(() => {
    const caducados = items.filter((it) => (it.reservedUntil ?? 0) <= now);
    if (!caducados.length) return;
    const next = items.filter((it) => (it.reservedUntil ?? 0) > now);
    persist(next);
    caducados.forEach((it) => liberarReserva(it.id));
    setErr(
      caducados.length === 1
        ? `Se acabó la reserva de "${caducados[0].title}". Si sigue disponible, puedes volver a añadirlo.`
        : "Se acabó la reserva de algunos artículos. Si siguen disponibles, puedes volver a añadirlos."
    );
  }, [now, items, persist]);

  const bootstrap = useCallback(async () => {
    setErr(null);
    setLoading(true);

    try {
      // Cestas guardadas antes de este cambio podían tener más de 1 unidad: se deja en 1.
      // Las que no tenían reserva (anteriores a esta versión) intentan reservarse ahora.
      const loaded = (await loadCart()).map((it) => ({ ...it, qty: 1 }));
      const stored: CartItem[] = [];
      for (const it of loaded) {
        if (it.reservedUntil) {
          stored.push(it);
          continue;
        }
        const reserva = await reservarProducto(it.id);
        if (reserva.ok) stored.push({ ...it, reservedUntil: reserva.hasta });
      }
      setItems(stored);
      await saveCart(stored);
    } catch (e: any) {
      console.error("Error cargando la cesta:", e);
      setErr("No hemos podido cargar tu cesta. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  const addToCartById = useCallback(
    async (productId: string) => {
      if (!productId) return;
      if (lastAddRef.current === productId) return;

      lastAddRef.current = productId;
      setAdding(true);
      setErr(null);

      try {
        const existing = items.find((it) => it.id === productId);

        if (existing) return; // unidad única: ya está en la cesta

        const fetched = await fetchProductForCart(productId);

        if (!fetched) {
          setErr("Ese producto no está disponible en este momento.");
          return;
        }

        const reserva = await reservarProducto(productId);
        if (!reserva.ok) {
          setErr(
            `Otro cliente tiene este artículo en su cesta. Se reserva ${RESERVA_MINUTOS} minutos: vuelve a mirar en un rato.`
          );
          return;
        }

        const next = [{ ...fetched, reservedUntil: reserva.hasta }, ...items];
        await persist(next);
      } catch (e: any) {
        console.error("Error añadiendo producto a la cesta:", e);
        setErr("No se pudo añadir el producto a la cesta. Inténtalo de nuevo.");
      } finally {
        setAdding(false);
      }
    },
    [items, persist]
  );

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!addId) return;
    addToCartById(addId);
  }, [addId, addToCartById]);

  return (
    <>
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      <PromoBanner onPressVender={() => setSellModalOpen(true)} />

      {/*
        El bloque de título "Cesta" / subtítulo / contador de artículos se
        quitó a petición del usuario ("no tiene sentido que esté allí").
        Esta franja solo aparece ahora si hay algo que decir de verdad: un
        error o el aviso de "añadiendo producto".
      */}
      {(!!err || adding) && (
        <View
          style={{
            backgroundColor: COLORS.bg2,
            borderBottomWidth: 1,
            borderBottomColor: "#F6FAFD",
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 12,
            alignItems: "center",
          }}
        >
          {/* Columna centrada: no se pega a la izquierda en pantallas anchas */}
          <View style={{ width: "100%", maxWidth: 640, gap: 10 }}>
            {!!err && (
              <Text style={{ color: "#B91C1C", fontWeight: "800", lineHeight: 20, textAlign: "center" }}>
                {err}
              </Text>
            )}

            {adding ? (
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <ActivityIndicator />
                <Text style={{ color: COLORS.muted }}>Añadiendo producto a la cesta…</Text>
              </View>
            ) : null}
          </View>
        </View>
      )}

      {loading ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            paddingHorizontal: 24,
          }}
        >
          <ActivityIndicator />
          <Text style={{ color: COLORS.muted }}>Cargando cesta…</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            padding: 16,
            paddingBottom: 28,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View style={{ width: "100%", maxWidth: 640, gap: 12 }}>
          {items.length === 0 ? (
            <View style={{ paddingVertical: 24, gap: 12, alignItems: "center" }}>
              <Ionicons name="cart-outline" size={34} color={COLORS.accent} />

              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18, textAlign: "center" }}>
                Tu cesta está vacía
              </Text>

              <Text style={{ color: COLORS.muted, lineHeight: 22, textAlign: "center" }}>
                Aún no has añadido nada. Vuelve al catálogo y elige tu próximo producto.
              </Text>

              <View style={{ marginTop: 6, width: "100%", maxWidth: 260 }}>
                <ActionButton title="Ir al catálogo" onPress={() => pushRoute("/catalogo" as Href)} />
              </View>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {items.map((it, idx) => (
                <View
                  key={it.id}
                  style={{
                    paddingVertical: 16,
                    gap: 10,
                    alignItems: "center",
                    borderTopWidth: idx === 0 ? 0 : 1,
                    borderTopColor: COLORS.border,
                  }}
                >
                  {/* Miniatura del artículo, misma foto de portada que en
                      el catálogo y la ficha de producto. Si no hay foto,
                      se muestra un icono a modo de marcador. */}
                  {it.imageUrl ? (
                    <Image
                      source={{ uri: it.imageUrl }}
                      style={{ width: 88, height: 88, borderRadius: 16 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <Ionicons name="image-outline" size={34} color={COLORS.mutedSoft} />
                  )}

                  <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: "900", textAlign: "center" }}>
                    {it.title}
                  </Text>

                  {it.subtitle ? (
                    <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
                      {it.subtitle}
                    </Text>
                  ) : null}

                  <Text style={{ color: COLORS.gold, fontSize: 17, fontWeight: "900", textAlign: "center" }}>
                    {fmtEUR(it.priceEUR * it.qty)}
                  </Text>

                  {/* Reserva de 15 minutos: al llegar a 0 sale de la cesta. */}
                  <Text style={{ color: COLORS.accent, fontWeight: "800", fontSize: 13, textAlign: "center" }}>
                    Reservado para ti · {formatoCuentaAtras((it.reservedUntil ?? 0) - now)}
                  </Text>

                  {/*
                    Segunda mano: cada artículo es una unidad única, así que no hay
                    selector de cantidad; solo se puede quitar.
                  */}
                  <View style={{ alignItems: "center", gap: 8 }}>
                    <Text style={{ color: COLORS.muted, fontWeight: "700", fontSize: 12.5, textAlign: "center" }}>
                      Unidad única
                    </Text>
                    <AnimatedPressable
                      onPress={() => remove(it.id)}
                      style={{
                        minHeight: 44,
                        paddingHorizontal: 14,
                        borderRadius: 999,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        borderWidth: 1,
                        borderColor: "#F5B5B5",
                        backgroundColor: "#FDECEC",
                      }}
                    >
                      <Ionicons name="trash-outline" size={16} color="#B91C1C" />
                      <Text style={{ color: "#B91C1C", fontWeight: "900", fontSize: 13 }}>Quitar</Text>
                    </AnimatedPressable>
                  </View>
                </View>
              ))}

              <AnimatedPressable
                onPress={clear}
                style={{
                  alignSelf: "center",
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "#E3EAF2",
                  backgroundColor: "#F6FAFD",
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                }}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Vaciar cesta</Text>
              </AnimatedPressable>
            </View>
          )}

          <View
            style={{
              paddingTop: 18,
              borderTopWidth: 1,
              borderTopColor: COLORS.border,
              gap: 12,
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>
              Resumen del pedido
            </Text>

            <Row label="Subtotal" value={fmtEUR(subtotal)} />
            <Row label="Envío" value={fmtEUR(shipping)} freeBadge={shipping === 0} />
            <View style={{ height: 1, backgroundColor: "#E3EAF2" }} />
            <Row label="Total" value={fmtEUR(total)} strong />

            <View style={{ marginTop: 4 }}>
              <ActionButton
                title="Ir a pagar"
                disabled={items.length === 0}
                onPress={() => pushRoute("/checkout" as Href)}
              />
            </View>

            <Pressable
              onPress={() => replaceRoute("/" as Href)}
              style={{ alignItems: "center", paddingVertical: 6 }}
            >
              <Text style={{ color: COLORS.accent, fontWeight: "800", fontSize: 13 }}>
                ← Seguir comprando
              </Text>
            </Pressable>
          </View>

          <CategoryProductsShelf />

          <View style={{ paddingVertical: 12, alignItems: "center" }}>
            <SocialLinks />
          </View>
          </View>

          <SiteFooter sidePadding={16} />
        </ScrollView>
      )}
    </SafeAreaView>

    <VenderAhoraModal visible={sellModalOpen} onClose={() => setSellModalOpen(false)} />
    </>
  );
}

function Row({
  label,
  value,
  strong,
  freeBadge,
}: {
  label: string;
  value: string;
  strong?: boolean;
  freeBadge?: boolean;
}) {
  return (
    // Etiqueta y valor juntos y centrados (nada pegado a los lados).
    <View
      style={{
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 8,
      }}
    >
      <Text
        style={{
          color: "rgba(11,33,56,0.62)",
          fontWeight: strong ? "900" : "700",
        }}
      >
        {label}:
      </Text>
      {freeBadge ? (
        <Badge text="Gratis" tone="success" />
      ) : (
        <Text style={{ color: "#0B2138", fontWeight: strong ? "900" : "800" }}>{value}</Text>
      )}
    </View>
  );
}