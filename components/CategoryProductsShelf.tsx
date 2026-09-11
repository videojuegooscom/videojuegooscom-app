// components/CategoryProductsShelf.tsx
/**
 * Qué hace: carrusel horizontal con TODOS los productos de PlayStation 5 y
 * Xbox ("También te puede interesar"). Daniel pidió mostrar productos de
 * esas categorías en Perfil y Cesta para que esas pantallas no se vean tan
 * vacías por debajo de su propio contenido (formulario de cuenta / resumen
 * del pedido); después pidió que fuera un carrusel de TODOS los productos de
 * esas categorías, no solo una muestra de 12.
 *
 * Cómo funciona:
 * - Primero resuelve los ids de las categorías con slug "playstation-5" y
 *   "xbox" (tabla categories), luego trae TODOS los productos activos y
 *   publicados de esas categorías (hasta SHELF_MAX_PRODUCTS, un tope técnico
 *   generoso para no pedir un número absurdo de filas si el catálogo creciera
 *   mucho — en la práctica esto es "todos"), los más recientes primero.
 * - La foto de portada de cada producto NO vive en products.images (ese
 *   campo suele estar vacío/heredado) sino en la tabla product_media, igual
 *   que en app/catalogo.tsx y app/(tabs)/index.tsx: se hace una segunda
 *   consulta por lotes (todos los ids de producto a la vez) a product_media
 *   y se elige, por producto, la foto marcada is_cover, o si no hay ninguna
 *   marcada, la de menor sort_order; products.images queda solo como último
 *   recurso si ese producto no tiene ninguna fila en product_media. La
 *   primera versión de este componente solo miraba products.images, por eso
 *   no se veía ninguna miniatura ni se encendía la barra de carga.
 * - Si algún paso falla (columna que no existe, tabla vacía...), se sigue
 *   sin esa parte en vez de romper; si al final no hay productos, no se
 *   pinta nada (return null) — es un añadido opcional, nunca debe mostrarle
 *   un error al cliente ni dejar un hueco raro en la pantalla.
 * - Es un carrusel de verdad, no solo una fila con scroll: las tarjetas
 *   encajan en "carriles" (snapToInterval, del ancho de una tarjeta + su
 *   hueco) y aparecen flechas ‹ › a los lados (solo cuando hay más contenido
 *   hacia ese lado) que avanzan/retroceden una pantalla completa de
 *   tarjetas — mismo espíritu que el carrusel de fotos de la Oferta de la
 *   Semana (FeaturedMediaCarousel en app/(tabs)/index.tsx). En pantallas
 *   táctiles sigue funcionando igual arrastrando con el dedo; las flechas
 *   son sobre todo para ratón/escritorio.
 * - Cada tarjeta abre la ficha del producto (app/producto/[id].tsx).
 *
 * Rendimiento: este componente se monta por separado en Perfil Y en Cesta —
 * son las MISMAS tarjetas de PS5/Xbox en los dos sitios, así que antes, cada
 * vez que el cliente iba de una pantalla a la otra (algo habitual: revisar
 * el carrito, volver al perfil, volver a la cesta...), se repetían las
 * mismas 3 consultas a Supabase (categorías, productos, fotos de portada)
 * aunque el resultado fuera a ser idéntico. Ahora el resultado se guarda en
 * memoria (shelfCache) durante SHELF_CACHE_TTL_MS (5 minutos): la primera
 * vez sí consulta Supabase, pero mientras el cliente navegue de un lado a
 * otro dentro de esos 5 minutos, ya no vuelve a preguntar. Pasado ese tiempo
 * (o si recarga la página), se refresca solo.
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase (tablas categories, products,
 *   product_media).
 * - components/SmartImage.tsx → foto de cada tarjeta (y quien enciende la
 *   barra de carga global, components/lineapensadoraefectosiri.tsx,
 *   mientras esa foto concreta está descargándose).
 * - app/producto/[id].tsx → destino de cada tarjeta.
 * - app/(tabs)/perfil.tsx, app/(tabs)/cesta.tsx → pantallas que lo montan.
 */
import { Ionicons } from "@expo/vector-icons";
import type { Href } from "expo-router";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import SmartImage from "./SmartImage";
import { supabase } from "../lib/supabase";

const COLORS = {
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  accent: "#1EA7E8",
  tile: "#F6FAFD",
};

const SHELF_CATEGORY_SLUGS = ["playstation-5", "xbox"];

// Tope técnico, no un límite de negocio: evita pedir un número absurdo de
// filas si el catálogo de esas dos categorías creciera muchísimo. Con el
// catálogo actual esto siempre trae "todos" los productos de PS5 y Xbox.
const SHELF_MAX_PRODUCTS = 300;

// Ancho de cada tarjeta + su hueco: define tanto el "carril" al que encaja
// cada tarjeta (snapToInterval) como cuánto avanza el carrusel al pulsar las
// flechas ‹ ›.
const CARD_WIDTH = 156;
const CARD_GAP = 10;
const CARD_STEP = CARD_WIDTH + CARD_GAP;

// Caché en memoria compartida entre Perfil y Cesta (ver nota de rendimiento
// arriba): evita repetir las mismas 3 consultas cada vez que se monta este
// componente si ya se pidieron hace poco.
const SHELF_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
let shelfCache: { data: ShelfProduct[]; fetchedAt: number } | null = null;
let shelfInFlight: Promise<ShelfProduct[]> | null = null;

type ShelfProductRow = {
  id: string;
  title: string;
  priceEUR: number;
  fallbackImage: string | null;
};

type ShelfProduct = {
  id: string;
  title: string;
  priceEUR: number;
  image: string | null;
};

type ProductMediaKind = "image" | "video";

type ProductMediaRow = {
  product_id: string;
  kind?: ProductMediaKind | string | null;
  public_url?: string | null;
  sort_order?: number | null;
  is_cover?: boolean | null;
};

function fmtEUR(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  // Antes se redondeaba siempre a euros enteros (Math.round) y se perdían
  // los céntimos (17,97€ se veía como "18€"); ahora se muestran decimales
  // solo cuando el precio los tiene de verdad.
  const rounded = Math.round(safe * 100) / 100;
  const hasCents = Math.abs(rounded - Math.round(rounded)) > 0.001;
  return hasCents ? `${rounded.toFixed(2).replace(".", ",")}€` : `${Math.round(rounded)}€`;
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

function asShelfProductRow(row: unknown): ShelfProductRow | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;

  const id = String(r.id ?? "").trim();
  const title = String(r.title ?? "").trim();
  if (!id || !title) return null;

  const images = Array.isArray(r.images) ? r.images : [];
  const fallbackImage =
    (images.find((v): v is string => typeof v === "string" && !!v.trim()) as
      | string
      | undefined) ?? null;

  return {
    id,
    title,
    priceEUR: Number(r.price_eur ?? 0),
    fallbackImage,
  };
}

async function fetchProductRowsSafe(catIds: string[]): Promise<ShelfProductRow[]> {
  const selects = ["id,title,price_eur,images,category_id", "id,title,price_eur,category_id"];

  for (const selectStr of selects) {
    const { data, error } = await supabase
      .from("products")
      .select(selectStr)
      .in("category_id", catIds)
      .eq("is_active", true)
      .eq("status", "PUBLISHED")
      .order("updated_at", { ascending: false })
      .limit(SHELF_MAX_PRODUCTS);

    if (!error && Array.isArray(data)) {
      return data.map(asShelfProductRow).filter((p): p is ShelfProductRow => p !== null);
    }
  }

  return [];
}

// Trae, en una sola consulta por lotes, las fotos de product_media de TODOS
// los productos a la vez (nunca una consulta por tarjeta), y devuelve un
// mapa productId → mejor foto de portada (is_cover primero, luego la de
// menor sort_order). Si la tabla no existe o falla, devuelve un mapa vacío
// y cada producto usa su fallbackImage (products.images) si tiene una.
async function fetchCoverImageMapSafe(productIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (productIds.length === 0) return map;

  try {
    const { data, error } = await supabase
      .from("product_media")
      .select("product_id,kind,public_url,sort_order,is_cover")
      .in("product_id", productIds)
      .limit(4000);

    if (error || !Array.isArray(data)) return map;

    const byProduct = new Map<string, ProductMediaRow[]>();
    for (const row of data as ProductMediaRow[]) {
      if (!row?.product_id) continue;
      if (normalizeMediaKind(row.kind) !== "image") continue;
      if (typeof row.public_url !== "string" || !row.public_url.trim()) continue;

      const list = byProduct.get(row.product_id) ?? [];
      list.push(row);
      byProduct.set(row.product_id, list);
    }

    for (const [productId, rows] of byProduct.entries()) {
      const sorted = [...rows].sort(sortMediaRows);
      const best = sorted[0];
      if (best?.public_url) map.set(productId, best.public_url.trim());
    }

    return map;
  } catch {
    return map;
  }
}

async function fetchShelfProductsSafe(): Promise<ShelfProduct[]> {
  try {
    const { data: cats, error: catsErr } = await supabase
      .from("categories")
      .select("id,slug")
      .in("slug", SHELF_CATEGORY_SLUGS);

    if (catsErr || !Array.isArray(cats) || cats.length === 0) return [];

    const catIds = (cats as Array<{ id: string }>).map((c) => c.id).filter(Boolean);
    if (catIds.length === 0) return [];

    const rows = await fetchProductRowsSafe(catIds);
    if (rows.length === 0) return [];

    const coverMap = await fetchCoverImageMapSafe(rows.map((r) => r.id));

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      priceEUR: r.priceEUR,
      image: coverMap.get(r.id) ?? r.fallbackImage,
    }));
  } catch {
    return [];
  }
}

// Devuelve la lista de productos del estante, usando la caché en memoria si
// todavía es reciente (SHELF_CACHE_TTL_MS) y compartiendo la misma petición
// en vuelo si Perfil y Cesta llegan a pedirla casi a la vez (por ejemplo, al
// recargar la página con las dos montadas).
async function getShelfProductsCached(): Promise<ShelfProduct[]> {
  const now = Date.now();
  if (shelfCache && now - shelfCache.fetchedAt < SHELF_CACHE_TTL_MS) {
    return shelfCache.data;
  }

  if (!shelfInFlight) {
    shelfInFlight = fetchShelfProductsSafe()
      .then((rows) => {
        shelfCache = { data: rows, fetchedAt: Date.now() };
        return rows;
      })
      .finally(() => {
        shelfInFlight = null;
      });
  }

  return shelfInFlight;
}

export default function CategoryProductsShelf() {
  const [products, setProducts] = useState<ShelfProduct[] | null>(null);

  // Estado del carrusel: solo hace falta saber cuánto se puede seguir
  // desplazando hacia cada lado, para mostrar u ocultar las flechas ‹ ›. La
  // posición y los anchos se guardan en refs (no en estado) porque cambian
  // en cada frame de scroll y no hace falta volver a renderizar por eso —
  // solo se usan dentro de scrollByCards, al pulsar una flecha.
  const scrollRef = useRef<ScrollView>(null);
  const scrollXRef = useRef(0);
  const layoutWidthRef = useRef(0);
  const contentWidthRef = useRef(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    let alive = true;

    getShelfProductsCached().then((rows) => {
      if (alive) setProducts(rows);
    });

    return () => {
      alive = false;
    };
  }, []);

  // Recalcula qué flechas tienen sentido mostrar a partir de los refs
  // (posición actual, ancho visible, ancho total). Se llama tanto al hacer
  // scroll como al terminar de medir el carrusel (onLayout/onContentSizeChange),
  // para que la flecha derecha ya aparezca de entrada si hay más tarjetas de
  // las que caben en pantalla, sin esperar a que el cliente arrastre primero.
  const recomputeArrows = useCallback(() => {
    setCanScrollLeft(scrollXRef.current > 4);
    setCanScrollRight(scrollXRef.current < contentWidthRef.current - layoutWidthRef.current - 4);
  }, []);

  const updateArrows = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      scrollXRef.current = contentOffset.x;
      layoutWidthRef.current = layoutMeasurement.width;
      contentWidthRef.current = contentSize.width;
      recomputeArrows();
    },
    [recomputeArrows]
  );

  const scrollByCards = useCallback((direction: 1 | -1) => {
    // Avanza/retrocede "una pantalla" de tarjetas de golpe, no una tarjeta
    // suelta — así las flechas sirven de verdad para recorrer un carrusel
    // largo sin tener que pulsarlas decenas de veces. Redondeado al carril
    // más cercano (CARD_STEP) para que la tarjeta de destino quede encajada,
    // no cortada a medias.
    const visibleCards = Math.max(1, Math.floor(layoutWidthRef.current / CARD_STEP));
    const delta = visibleCards * CARD_STEP * direction;
    const maxX = Math.max(0, contentWidthRef.current - layoutWidthRef.current);
    const nextX = Math.min(maxX, Math.max(0, scrollXRef.current + delta));
    scrollRef.current?.scrollTo({ x: nextX, animated: true });
  }, []);

  // Mientras carga, o si no hay nada que mostrar, no se pinta nada: es un
  // añadido opcional, nunca debe dejar un hueco de "cargando" a la vista.
  if (!products || products.length === 0) return null;

  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: COLORS.text, fontSize: 17, fontWeight: "900", textAlign: "center" }}>
        También te puede interesar
      </Text>

      <View style={{ position: "relative" }}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_STEP}
          decelerationRate="fast"
          onScroll={updateArrows}
          onLayout={(e) => {
            layoutWidthRef.current = e.nativeEvent.layout.width;
            recomputeArrows();
          }}
          onContentSizeChange={(w) => {
            // Al terminar de cargar, comprueba si ya hay más tarjetas de las
            // que caben en pantalla, para mostrar la flecha derecha desde el
            // principio en vez de esperar a que el cliente arrastre primero.
            contentWidthRef.current = w;
            recomputeArrows();
          }}
          scrollEventThrottle={16}
          contentContainerStyle={{ gap: CARD_GAP, paddingRight: 4 }}
        >
          {products.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => router.push(`/producto/${p.id}` as Href)}
              style={({ pressed }) => ({
                width: CARD_WIDTH,
                borderRadius: 16,
                backgroundColor: COLORS.tile,
                padding: 10,
                alignItems: "center",
                opacity: pressed ? 0.9 : 1,
              })}
            >
              {/* contentFit="contain" (no "cover") a propósito: aquí interesa
                  ver la foto entera del producto, sin recortarla para rellenar
                  el hueco — aunque eso deje una pequeña banda blanca a los
                  lados si la foto no es cuadrada. */}
              <View
                style={{
                  width: "100%",
                  height: 108,
                  borderRadius: 12,
                  overflow: "hidden",
                  backgroundColor: "#FFFFFF",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {p.image ? (
                  <SmartImage uri={p.image} contentFit="contain" style={{ width: "100%", height: "100%" }} />
                ) : (
                  <Ionicons name="game-controller-outline" size={28} color={COLORS.muted} />
                )}
              </View>

              {/* Sin numberOfLines a propósito: el título se ve completo,
                  aunque ocupe dos o tres líneas, en vez de cortarse con "...". */}
              <Text
                style={{
                  color: COLORS.text,
                  fontWeight: "800",
                  fontSize: 12.5,
                  marginTop: 8,
                  lineHeight: 16,
                  textAlign: "center",
                }}
              >
                {p.title}
              </Text>

              <Text
                style={{
                  color: COLORS.accent,
                  fontWeight: "900",
                  fontSize: 14,
                  marginTop: 4,
                  textAlign: "center",
                }}
              >
                {fmtEUR(p.priceEUR)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {canScrollLeft ? (
          <CarouselArrow direction="left" onPress={() => scrollByCards(-1)} />
        ) : null}

        {canScrollRight ? (
          <CarouselArrow direction="right" onPress={() => scrollByCards(1)} />
        ) : null}
      </View>
    </View>
  );
}

// Flecha ‹ › flotante a un lado del carrusel — mismo estilo (círculo oscuro
// semitransparente) que las del carrusel de fotos de la Oferta de la Semana.
// Solo aparece cuando de verdad hay más tarjetas hacia ese lado.
function CarouselArrow({ direction, onPress }: { direction: "left" | "right"; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => ({
        position: "absolute",
        [direction]: -6,
        top: 44,
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: pressed ? "rgba(11,33,56,0.72)" : "rgba(11,33,56,0.52)",
        alignItems: "center",
        justifyContent: "center",
      })}
    >
      <Ionicons name={direction === "left" ? "chevron-back" : "chevron-forward"} size={16} color="#FFFFFF" />
    </Pressable>
  );
}
