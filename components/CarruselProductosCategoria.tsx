/**
 * Archivo: components/CarruselProductosCategoria.tsx
 * Función: componente del carrusel de productos («También te puede interesar») y de la barra de comparar.
 * Para qué sirve: lista en un carrusel los productos activos de PlayStation 5 y Xbox, y exporta useComparar y useAlturaBarraComparar para la comparación de productos.
 * Conectado con: lib/supabase.ts, lib/analiticaPropia.ts, components/ImagenInteligente.tsx, TirarParaActualizar.tsx, BarraBusqueda.tsx, constants/temaTienda.ts, tablas categories y products.
 * Utilizado por: app/_layout.tsx, app/catalogo.tsx, app/comparar.tsx, app/servicios.tsx, app/producto/[id].tsx, app/(tabs)/index.tsx, perfil.tsx, cesta.tsx, app/admin/analytics.tsx, components/AsistenteBlue.tsx y components/BotonAtrasAlcance.tsx.
 * Dependencias: react, react-native, expo-router, @expo/vector-icons, @react-native-async-storage/async-storage, react-native-safe-area-context.
 * Estado: ACTIVO
 */
/**
 * Notas:
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
 * - modo="novedades": el mismo carrusel con lo último que ha llegado a la tienda (por
 *   products.novedad_en, que se renueva también cuando un artículo de VeoAura vuelve a la
 *   venta), sin filtrar por categoría. Lo usa la portada («Recién llegado»).
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
 * «Productos parecidos» y «Completa tu compra» (mejora 6, dueño 2026-11-14; abajo del todo): ProductosParecidos (final
 * de la ficha: misma categoría y precio parecido ±40 %, sin el actual; carrusel en el móvil con este mismo estante y
 * `productos` ya calculados, rejilla de 4 en el ordenador) y CompletaTuCompra (bajo los botones de la ficha y en la
 * cesta): solo si hay una consola, mandos y accesorios de su familia (tipoDeArticulo y familiasDeProducto, con los
 * sinónimos de la búsqueda); nunca otra consola ni relleno. Salen del índice ligero de components/BarraBusqueda.tsx y
 * solo bajan las portadas pequeñas de lo que se enseña. Analítica propia: parecidos_mostrado, parecido_tocado,
 * complemento_mostrado, complemento_tocado y complemento_anadido (ids de producto), en Administración → Analítica.
 *
 * «Comparar 2-3 productos» (mejora 8, dueño 2026-11-14; abajo del todo): la lista de lo que se compara (solo en el
 * dispositivo, como mucho 3; useComparar, alternarComparar…), el «Comparar» de las tarjetas del catálogo y de la ficha
 * (BotonComparar) y la barra flotante de abajo (BarraComparar, en el Catálogo y las fichas) que lleva a app/comparar.tsx.
 * Se mide como comparar_anadido / comparar_quitado (solo ids) en Administración → Analítica → «Comparador (30 días)».
 *
 * «Vistos recientemente» (mejora 9, dueño 2026-11-14; abajo del todo): historial SOLO del dispositivo (registrarVisto desde
 * la ficha; el último primero, sin repetidos, como mucho 12) y el estante de Inicio (VistosRecientemente: solo con 3 o más
 * a la venta, «Quitar» por producto y «Borrar historial»). Se mide como vistos_mostrado, visto_tocado, visto_quitado y
 * vistos_borrados (solo ids y cuántos) en Administración → Analítica → «Vistos recientemente (30 días)».
 *
 * «Recientes noticias que creemos que podrían interesarte» (dueño, 2026-11-27; NoticiasEstantes, abajo del todo): en Inicio
 * bajo «Recién llegado» y en Perfil y Cesta bajo «También te puede interesar» (tabla noticias_gaming, solo lectura).
 *
 * Tamaños (2026-11-12, grupo 3): nombres a 13 px como mínimo, precios pequeños (menos de 17 px) en el azul de texto
 * #0A78B4 (constants/temaTienda.ts) y flechas con 44 px de zona táctil.
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase (tablas categories, products,
 *   product_media).
 * - components/ImagenInteligente.tsx → foto de cada tarjeta (y quien enciende la
 *   barra de carga global, components/EfectoPensando.tsx,
 *   mientras esa foto concreta está descargándose).
 * - app/producto/[id].tsx → destino de cada tarjeta.
 * - app/(tabs)/perfil.tsx, app/(tabs)/cesta.tsx → pantallas que lo montan (la cesta, también «Completa tu compra»).
 * - app/producto/[id].tsx → «Productos parecidos» y «Completa tu compra» de la ficha.
 * - app/admin/analytics.tsx → tarjeta «Parecidos y complementos (30 días)» y «Comparador (30 días)».
 * - app/comparar.tsx (la comparación), app/_layout.tsx (monta BarraComparar), app/catalogo.tsx y
 *   components/BotonAtrasAlcance.tsx (dejan el hueco de la barra: useAlturaBarraComparar).
 */
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Href } from "expo-router";
import { Link, router, usePathname } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent, ViewStyle } from "react-native";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ImagenInteligente from "./ImagenInteligente";
import { AparecerAlVer } from "./DesplazamientoSuave";
import { useRecarga } from "./TirarParaActualizar";
import { cargarIndiceBusqueda, palabrasBusqueda, portadasDeProductos, type ProductoIndice } from "./BarraBusqueda";
import { supabase } from "../lib/supabase";
import { medirEvento } from "../lib/analiticaPropia";
import { formatearEuros } from "../lib/envio";
import { colorTextoAzul, COLORES_TEXTO, TACTIL, TAMANOS } from "../constants/temaTienda";

const COLORS = {
  text: "#0B2138",
  muted: COLORES_TEXTO.secundario,
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

// Movimiento automático: una tarjeta cada 3,8 s y 9 s de pausa tras tocarlo.
const AUTO_PASO_MS = 3800;
const AUTO_PAUSA_MS = 9000;

// Cuántos artículos enseña el estante de novedades.
const NOVEDADES_MAX = 12;

type ShelfModo = "consolas" | "novedades";
const shelfCache = new Map<ShelfModo, { data: ShelfProduct[]; fetchedAt: number }>();
const shelfInFlight = new Map<ShelfModo, Promise<ShelfProduct[]>>();

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

// --- Tarjeta y rejilla de las listas de la tienda (Catálogo y Servicios) --------------------------------------------
// Mismo diseño que las tarjetas de este estante (las de Inicio): fondo suave sin borde, foto entera sobre blanco, título
// completo y precio en azul de marca. Sin etiquetas ni botones decorativos: toda la tarjeta es el enlace. «extra» es lo
// que solo ve el administrador (el estado interno, en texto y sin recuadro). compact: móvil con 2 columnas.
export const TarjetaProducto = React.memo(function TarjetaProducto({
  titulo,
  precioEUR,
  imagenUrl,
  onPress,
  isMobile,
  compact,
  extra,
  prioridad,
  comparar,
}: {
  titulo: string;
  precioEUR: number;
  imagenUrl: string | null;
  onPress: () => void;
  isMobile?: boolean;
  compact?: boolean;
  extra?: React.ReactNode;
  /** Primera fila de la lista (carga rápida): la foto se pide ya y con prioridad alta; las demás, al acercarse. */
  prioridad?: boolean;
  /** «Comparar» debajo de la tarjeta, fuera del enlace (mejora 8). Ya no lo usa el catálogo (dueño, 2026-11-25: tarjeta
   *  más limpia; se compara desde la ficha); se deja por si otra lista lo necesita. */
  comparar?: ProductoComparar;
}) {
  const anchoPantalla = useWindowDimensions().width;
  const tarjeta = (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${titulo}, ${formatearEuros(precioEUR)}`}
      style={({ pressed }) => ({
        opacity: pressed ? 0.9 : 1,
        borderRadius: 16,
        backgroundColor: comparar ? undefined : COLORS.tile,
        padding: compact ? 8 : 10,
        paddingBottom: comparar ? 0 : compact ? 8 : 10,
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
        {imagenUrl ? (
          <ImagenInteligente
            uri={imagenUrl}
            alt={titulo}
            // En el móvil (2 columnas) la foto mide media pantalla menos márgenes (160 px a 390): se pide ≈ 2 × eso.
            ancho={compact ? Math.max(140, Math.round(anchoPantalla / 2 - 35)) : 340}
            priority={prioridad ? "high" : "normal"}
            contentFit="contain"
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <View style={{ width: "100%", height: "100%", justifyContent: "center", alignItems: "center", paddingHorizontal: 18 }}>
            <Text style={{ color: "rgba(11,33,56,0.15)", fontWeight: "900", fontSize: 40 }}>VG</Text>
            <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, marginTop: 6, textAlign: "center" }}>Foto no disponible</Text>
          </View>
        )}
      </View>

      {/* Sin numberOfLines a propósito: el título se ve completo, en dos o tres líneas. */}
      <Text
        style={{
          color: COLORS.text,
          fontWeight: "800",
          fontSize: compact ? TAMANOS.minimo : 14.5,
          lineHeight: compact ? 17 : 19,
          marginTop: 8,
          textAlign: "center",
        }}
      >
        {titulo}
      </Text>

      <Text style={{ color: colorTextoAzul(compact ? 16 : 18), fontWeight: "900", fontSize: compact ? 16 : 18, marginTop: 4, textAlign: "center" }}>
        {formatearEuros(precioEUR)}
      </Text>

      {extra}
    </Pressable>
  );
  if (!comparar) return tarjeta;
  // El mismo fondo para la tarjeta y su «Comparar»; flexGrow + space-between: en cada fila, los «Comparar» a la misma altura.
  return (
    <View style={{ flexGrow: 1, justifyContent: "space-between", borderRadius: 16, backgroundColor: COLORS.tile }}>
      {tarjeta}
      <BotonComparar producto={comparar} origen="catalogo" variante="tarjeta" />
    </View>
  );
});

// Rejilla de tarjetas en filas iguales (la última fila se completa con huecos para que no se estiren). Cada fila que
// empieza fuera de la pantalla aparece con un fundido suave al llegar a ella (AparecerAlVer; dueño, 2026-11-19).
export function RejillaTarjetas({ columns, gap, children }: { columns: number; gap: number; children: React.ReactNode }) {
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
        <AparecerAlVer key={idx} style={{ flexDirection: columns === 1 ? "column" : "row", gap }}>
          {row.map((child, j) => (
            <View key={j} style={{ flex: 1 }}>
              {child}
            </View>
          ))}
          {row.length < columns
            ? Array.from({ length: columns - row.length }).map((_, k) => <View key={`pad-${k}`} style={{ flex: 1 }} />)
            : null}
        </AparecerAlVer>
      ))}
    </View>
  );
}

// Columnas de las listas: en el móvil, 1 si hay un solo elemento y 2 si hay más; en pantallas anchas, por ancho.
export function columnasLista(ancho: number, esMovil: boolean, cuantos: number) {
  if (esMovil) return cuantos > 1 ? 2 : 1;
  if (ancho >= 1320) return 4;
  if (ancho >= 980) return 3;
  if (ancho >= 680) return 2;
  return 1;
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
      // Solo la portada (marcada o la primera), no las filas de todas las fotos (hasta 30 por producto).
      .or("is_cover.eq.true,sort_order.eq.0")
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

// Lo último que ha llegado (novedad_en; si esa columna aún no existe, created_at).
async function fetchNovedadesRowsSafe(): Promise<ShelfProductRow[]> {
  for (const orden of ["novedad_en", "created_at"]) {
    const { data, error } = await supabase
      .from("products")
      .select("id,title,price_eur,images")
      .eq("is_active", true)
      .eq("status", "PUBLISHED")
      .order(orden, { ascending: false })
      .limit(NOVEDADES_MAX);
    if (!error && Array.isArray(data)) {
      return data.map(asShelfProductRow).filter((p): p is ShelfProductRow => p !== null);
    }
  }
  return [];
}

async function fetchShelfProductsSafe(modo: ShelfModo): Promise<ShelfProduct[]> {
  try {
    let rows: ShelfProductRow[];
    if (modo === "novedades") {
      rows = await fetchNovedadesRowsSafe();
    } else {
      const { data: cats, error: catsErr } = await supabase
        .from("categories")
        .select("id,slug")
        .in("slug", SHELF_CATEGORY_SLUGS);

      if (catsErr || !Array.isArray(cats) || cats.length === 0) return [];

      const catIds = (cats as { id: string }[]).map((c) => c.id).filter(Boolean);
      if (catIds.length === 0) return [];

      rows = await fetchProductRowsSafe(catIds);
    }
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

export type ProductoEstante = ShelfProduct;

/**
 * Artículos a la venta de unas categorías (por su slug) cuyo título cumple `filtro`, con su foto de portada. Lo usan las
 * páginas «Compramos tu…» (app/compramos/[tipo].tsx, 2026-11-24) para enseñar lo que hay a la venta de ese tipo.
 */
export async function productosDeCategorias(slugs: string[], filtro: RegExp | null, max = 12): Promise<ProductoEstante[]> {
  try {
    const { data: cats, error } = await supabase.from("categories").select("id").in("slug", slugs);
    if (error || !Array.isArray(cats) || !cats.length) return [];
    const filas = (await fetchProductRowsSafe((cats as { id: string }[]).map((c) => c.id))).filter((r) => !filtro || filtro.test(r.title)).slice(0, max);
    if (!filas.length) return [];
    const portadas = await fetchCoverImageMapSafe(filas.map((r) => r.id));
    return filas.map((r) => ({ id: r.id, title: r.title, priceEUR: r.priceEUR, image: portadas.get(r.id) ?? r.fallbackImage }));
  } catch {
    return [];
  }
}

// Devuelve la lista de productos del estante, usando la caché en memoria si
// todavía es reciente (SHELF_CACHE_TTL_MS) y compartiendo la misma petición
// en vuelo si Perfil y Cesta llegan a pedirla casi a la vez (por ejemplo, al
// recargar la página con las dos montadas).
// forzar=true («Desliza para actualizar»): no se usa la copia guardada.
async function getShelfProductsCached(modo: ShelfModo, forzar = false): Promise<ShelfProduct[]> {
  const now = Date.now();
  const cache = shelfCache.get(modo);
  if (!forzar && cache && now - cache.fetchedAt < SHELF_CACHE_TTL_MS) {
    return cache.data;
  }

  let enVuelo = shelfInFlight.get(modo);
  if (!enVuelo) {
    enVuelo = fetchShelfProductsSafe(modo)
      .then((rows) => {
        shelfCache.set(modo, { data: rows, fetchedAt: Date.now() });
        return rows;
      })
      .finally(() => {
        shelfInFlight.delete(modo);
      });
    shelfInFlight.set(modo, enVuelo);
  }

  return enVuelo;
}

export default function CarruselProductosCategoria({
  modo = "consolas",
  titulo,
  pie,
  productos: productosFijos,
  onTocar,
  sinMovimiento,
  nativeID,
  onQuitar,
}: {
  modo?: ShelfModo;
  titulo?: string;
  // Algo que va debajo solo si el estante se pinta (p. ej. el separador de la portada).
  pie?: React.ReactNode;
  /** Lista ya calculada (p. ej. «Productos parecidos» de la ficha): no se consulta nada y se enseña tal cual. */
  productos?: ShelfProduct[];
  /** Al tocar una tarjeta (antes de abrir la ficha), con su posición: para la analítica. */
  onTocar?: (id: string, posicion: number) => void;
  /** Sin el movimiento automático (en la ficha, el cliente decide cuándo mirar). */
  sinMovimiento?: boolean;
  nativeID?: string;
  /** «Vistos recientemente» (Inicio): un «Quitar» de 44 px bajo cada tarjeta. */
  onQuitar?: (id: string) => void;
} = {}) {
  const [cargados, setProducts] = useState<ShelfProduct[] | null>(null);
  const products = productosFijos ?? cargados;
  const conLista = !!productosFijos;

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

  // «Desliza para actualizar»: con recarga > 0 se piden de nuevo, sin la copia guardada.
  const recarga = useRecarga({ parte: true });
  useEffect(() => {
    if (conLista) return;
    let alive = true;

    getShelfProductsCached(modo, recarga > 0).then((rows) => {
      if (alive) setProducts(rows);
    });

    return () => {
      alive = false;
    };
  }, [modo, recarga, conLista]);

  // Movimiento automático: cada AUTO_PASO_MS avanza una tarjeta (tiempo de sobra para verla);
  // al llegar al final vuelve al principio. Si la persona toca o desliza el carrusel, se para
  // AUTO_PAUSA_MS para no quitarle lo que está mirando.
  const pausaHasta = useRef(0);
  const hayProductos = !!products && products.length > 0;
  useEffect(() => {
    if (!hayProductos || sinMovimiento) return;
    const t = setInterval(() => {
      if (Date.now() < pausaHasta.current) return;
      const maxX = contentWidthRef.current - layoutWidthRef.current;
      if (maxX <= 8) return; // caben todas: no hace falta moverse
      const siguiente = scrollXRef.current + CARD_STEP;
      scrollRef.current?.scrollTo({ x: siguiente > maxX + 4 ? 0 : Math.min(maxX, siguiente), animated: true });
    }, AUTO_PASO_MS);
    return () => clearInterval(t);
  }, [hayProductos, sinMovimiento]);
  const pausarAuto = useCallback(() => {
    pausaHasta.current = Date.now() + AUTO_PAUSA_MS;
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
    // Con las flechas, el movimiento automático espera un rato.
    pausaHasta.current = Date.now() + AUTO_PAUSA_MS;
    const maxX = Math.max(0, contentWidthRef.current - layoutWidthRef.current);
    const nextX = Math.min(maxX, Math.max(0, scrollXRef.current + delta));
    scrollRef.current?.scrollTo({ x: nextX, animated: true });
  }, []);

  // Mientras carga, o si no hay nada que mostrar, no se pinta nada: es un
  // añadido opcional, nunca debe dejar un hueco de "cargando" a la vista.
  if (!products || products.length === 0) return null;

  return (
    <View nativeID={nativeID} style={{ gap: 10 }}>
      {/* Con nivel 2: sin nivel, la web lo pinta como H1 y la página tendría dos (Search Console, 2026-11-24). */}
      <Text accessibilityRole="header" {...({ "aria-level": 2 } as object)} style={{ color: COLORS.text, fontSize: 17, fontWeight: "900", textAlign: "center" }}>
        {titulo ?? "También te puede interesar"}
      </Text>

      <View style={{ position: "relative" }}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_STEP}
          decelerationRate="fast"
          onScroll={updateArrows}
          onScrollBeginDrag={pausarAuto}
          onTouchStart={pausarAuto}
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
          {products.map((p, i) => {
            const tarjeta = (
            <Pressable
              key={p.id}
              nativeID={nativeID ? `${nativeID}-${p.id}` : undefined}
              accessibilityRole="link"
              accessibilityLabel={`${p.title}, ${formatearEuros(p.priceEUR)}`}
              onPress={() => {
                onTocar?.(p.id, i + 1);
                router.push(`/producto/${p.id}` as Href);
              }}
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
                  <ImagenInteligente uri={p.image} alt={p.title} ancho={150} contentFit="contain" style={{ width: "100%", height: "100%" }} />
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
                  fontSize: TAMANOS.minimo,
                  marginTop: 8,
                  lineHeight: 16,
                  textAlign: "center",
                }}
              >
                {p.title}
              </Text>

              <Text
                style={{
                  color: colorTextoAzul(14),
                  fontWeight: "900",
                  fontSize: 14,
                  marginTop: 4,
                  textAlign: "center",
                }}
              >
                {formatearEuros(p.priceEUR)}
              </Text>
            </Pressable>
            );
            if (!onQuitar) return tarjeta;
            // «Vistos recientemente»: «Quitar» (44 px) debajo de la tarjeta, fuera del enlace, con el mismo fondo.
            return (
              <View key={p.id} style={{ width: CARD_WIDTH, borderRadius: 16, backgroundColor: COLORS.tile, justifyContent: "space-between" }}>
                {tarjeta}
                <Pressable
                  nativeID={nativeID ? `${nativeID}-quitar-${p.id}` : undefined}
                  onPress={() => onQuitar(p.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Quitar ${p.title} de vistos recientemente`}
                  style={({ pressed }) => ({ minHeight: TACTIL.minimo, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, opacity: pressed ? 0.6 : 1 })}
                >
                  <Ionicons name="close" size={15} color={COLORES_TEXTO.secundario} />
                  <Text style={{ color: COLORES_TEXTO.secundario, fontWeight: "800", fontSize: TAMANOS.minimo }}>Quitar</Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>

        {canScrollLeft ? (
          <CarouselArrow direction="left" onPress={() => scrollByCards(-1)} />
        ) : null}

        {canScrollRight ? (
          <CarouselArrow direction="right" onPress={() => scrollByCards(1)} />
        ) : null}
      </View>
      {pie}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// «Productos parecidos» y «Completa tu compra» (mejora 6, dueño 2026-11-14). Todo sale del índice ligero de la búsqueda
// (components/BarraBusqueda.tsx → cargarIndiceBusqueda: sin fotos, en memoria 5 min) y solo se piden las portadas pequeñas
// de lo que se enseña (portadasDeProductos), para cuidar la cuota de salida de Supabase.
// ---------------------------------------------------------------------------------------------------------------------

/** Familias de consola que la tienda distingue para los complementos (Switch 2 aparte: su funda no vale para la Switch). */
export type FamiliaConsola = "ps5" | "ps4" | "switch" | "switch2" | "xbox";
export type TipoArticulo = "consola" | "mando" | "accesorio" | "juego" | "otro";

/** Palabras (ya normalizadas y en singular) que dicen que un título es un videojuego. «Caset» = la caja del juego. */
const PALABRAS_JUEGO = ["videojuego", "juego", "caset", "cartucho"];
/** Palabras que dicen que es un accesorio. Sin ninguna, no se sugiere nunca (mejor nada que relleno sin sentido). */
const PALABRAS_ACCESORIO = [
  "casco", "auricular", "headset", "funda", "estuche", "cargador", "cable", "dock", "base", "soporte", "gafa", "vr",
  "almacenamiento", "ssd", "disco", "tarjeta", "memoria", "volante", "pedal", "adaptador", "aparato", "camara",
  "bateria", "protector", "grip",
];
const CANON_CONSOLA = ["ps5", "ps4", "switch", "xbox", "xboxseries"];

/** Familias que nombra un texto (con los sinónimos de la búsqueda: «Playstation 5» = ps5, «joycon» = Switch…). */
function familiasDeTexto(texto: string): Set<FamiliaConsola> {
  const w = palabrasBusqueda(texto);
  const raw = ` ${w.raw.join(" ")} `;
  const canon = ` ${w.canon.join(" ")} `;
  const f = new Set<FamiliaConsola>();
  if (w.set.has("ps5") || w.set.has("dualsense")) f.add("ps5");
  if (w.set.has("ps4") || w.set.has("dualshock")) f.add("ps4");
  if (canon.includes(" switch 2 ")) f.add("switch2");
  else if (w.set.has("switch") || w.set.has("joycon") || raw.includes(" joy con ")) f.add("switch");
  if (w.set.has("xbox") || w.set.has("xboxseries")) f.add("xbox");
  return f;
}

/** Familias de un producto: las de su título y, si el título no nombra ninguna, las de su categoría. */
export function familiasDeProducto(p: { titulo: string; categoria: string }): Set<FamiliaConsola> {
  const delTitulo = familiasDeTexto(p.titulo);
  return delTitulo.size ? delTitulo : familiasDeTexto(p.categoria);
}

/**
 * Qué es un artículo, por su título. Se mira el artículo principal (lo que va antes de «+», «,», «con» o «más»:
 * «Xbox Series S + Mando Élite 2» es una consola; «Mando ps5 con caja», un mando):
 * 1. «consola» o empieza por el nombre de una consola → consola (el PS Portal, un reproductor remoto, queda en «otro»);
 * 2. si el título dice videojuego, juego o caset → juego;
 * 3. mando (también dualsense, joycon…) → mando;
 * 4. una palabra de accesorio (cascos, funda, gafas VR, volante…) → accesorio;
 * 5. lo demás → otro (no se sugiere).
 */
export function tipoDeArticulo(titulo: string): TipoArticulo {
  const principal = titulo.split(/\s\+\s|\+|,|\s(?:con|mas|más)\s/i)[0] || titulo;
  const p = palabrasBusqueda(principal);
  const todo = palabrasBusqueda(titulo);
  if (p.set.has("portal")) return "otro";
  if (p.set.has("consola") || CANON_CONSOLA.includes(p.canon[0] ?? "")) return "consola";
  if (PALABRAS_JUEGO.some((x) => todo.set.has(x))) return "juego";
  if (p.set.has("mando")) return "mando";
  if (PALABRAS_ACCESORIO.some((x) => p.set.has(x))) return "accesorio";
  return "otro";
}

const publicado = (p: ProductoIndice) => !p.estado || p.estado === "PUBLISHED";

/**
 * «Productos parecidos»: de la misma categoría, sin el actual, con precio parecido (±40 %), los más cercanos en precio
 * primero (hasta 8). Si salen menos de 4, se completa hasta 4 con el resto de la categoría (también por cercanía).
 */
export function productosParecidos(
  lista: ProductoIndice[],
  base: { id: string; categoriaId: string | null; precio: number },
  max = 8,
  min = 4
): ProductoIndice[] {
  if (!base.categoriaId) return [];
  const misma = lista.filter((p) => p.id !== base.id && p.categoriaId === base.categoriaId && publicado(p));
  const cercania = (a: ProductoIndice, b: ProductoIndice) => Math.abs(a.precio - base.precio) - Math.abs(b.precio - base.precio);
  const cerca = misma.filter((p) => !(base.precio > 0) || Math.abs(p.precio - base.precio) <= base.precio * 0.4).sort(cercania);
  const out = cerca.slice(0, max);
  if (out.length < min) out.push(...misma.filter((p) => !out.includes(p)).sort(cercania).slice(0, min - out.length));
  return out;
}

/**
 * «Completa tu compra»: SOLO si entre `bases` hay una consola. Se sugieren mandos y accesorios de su misma familia
 * (PS5 → mandos y accesorios PS5; Switch → Switch; Switch 2 → Switch 2), nunca otra consola ni juegos, sin lo que ya
 * está en `fuera` (el propio artículo o la cesta). Primero los mandos y luego los accesorios, de más barato a más caro;
 * como mucho `max`. Un mando o un accesorio no tiene complementos: la lista sale vacía y no se enseña nada.
 */
export function complementosDe(
  lista: ProductoIndice[],
  bases: { titulo: string; categoria: string }[],
  fuera: string[],
  max = 3
): ProductoIndice[] {
  const familias = new Set<FamiliaConsola>();
  for (const b of bases) if (tipoDeArticulo(b.titulo) === "consola") familiasDeProducto(b).forEach((f) => familias.add(f));
  if (!familias.size) return [];
  const excluidos = new Set(fuera);
  return lista
    .filter((p) => !excluidos.has(p.id) && publicado(p))
    .map((p) => ({ p, tipo: tipoDeArticulo(p.titulo) }))
    .filter((x) => (x.tipo === "mando" || x.tipo === "accesorio") && [...familiasDeProducto(x.p)].some((f) => familias.has(f)))
    .sort((a, b) => Number(a.tipo !== "mando") - Number(b.tipo !== "mando") || a.p.precio - b.p.precio)
    .slice(0, max)
    .map((x) => x.p);
}

async function conPortadas(productos: ProductoIndice[]): Promise<ShelfProduct[]> {
  const portadas = await portadasDeProductos(productos.map((p) => p.id)).catch(() => new Map<string, string>());
  return productos.map((p) => ({ id: p.id, title: p.titulo.trim() || "Producto", priceEUR: p.precio, image: portadas.get(p.id) ?? null }));
}

/**
 * Sección «Productos parecidos» al final de la ficha (app/producto/[id].tsx): carrusel en el móvil y rejilla de 4 en el
 * ordenador. Sin parecidos, no sale. Mide parecidos_mostrado (ids enseñados) y parecido_tocado (cuál y en qué posición).
 */
export function ProductosParecidos({
  producto,
  isMobile,
}: {
  producto: { id: string; categoriaId: string | null; precio: number };
  isMobile: boolean;
}) {
  const [lista, setLista] = useState<ShelfProduct[] | null>(null);
  const { id, categoriaId, precio } = producto;
  useEffect(() => {
    let vivo = true;
    setLista(null);
    (async () => {
      const indice = await cargarIndiceBusqueda(false);
      const elegidos = indice ? productosParecidos(indice.productos, { id, categoriaId, precio }) : [];
      const conFoto = elegidos.length ? await conPortadas(elegidos) : [];
      if (!vivo) return;
      setLista(conFoto);
      if (conFoto.length) {
        void medirEvento("parecidos_mostrado", "Ficha: productos parecidos", {
          path: `/producto/${id}`,
          metadata: { productId: id, ids: conFoto.map((p) => p.id), n: conFoto.length },
        });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [id, categoriaId, precio]);

  const tocar = useCallback(
    (destino: string, posicion: number) => {
      void medirEvento("parecido_tocado", "Ficha: producto parecido tocado", { path: `/producto/${id}`, metadata: { productId: id, id: destino, posicion } });
    },
    [id]
  );

  if (!lista || !lista.length) return null;
  if (isMobile) return <CarruselProductosCategoria nativeID="ficha-parecidos" titulo="Productos parecidos" productos={lista} onTocar={tocar} sinMovimiento />;
  return (
    <View nativeID="ficha-parecidos" style={{ gap: 12 }}>
      <Text accessibilityRole="header" {...({ "aria-level": 2 } as object)} style={{ color: COLORS.text, fontSize: 20, fontWeight: "900", textAlign: "center" }}>
        Productos parecidos
      </Text>
      <RejillaTarjetas columns={4} gap={14}>
        {lista.map((p, i) => (
          <View key={p.id} nativeID={`ficha-parecidos-${p.id}`}>
            <TarjetaProducto
              titulo={p.title}
              precioEUR={p.priceEUR}
              imagenUrl={p.image}
              onPress={() => {
                tocar(p.id, i + 1);
                router.push(`/producto/${p.id}` as Href);
              }}
            />
          </View>
        ))}
      </RejillaTarjetas>
    </View>
  );
}

/**
 * «Completa tu compra» (ficha y cesta). `bases` = los ids de lo que se mira (el producto de la ficha o lo que hay en la
 * cesta); los complementos salen de complementosDe y, si no hay ninguno que encaje, no se pinta nada. En la ficha, filas
 * discretas que abren el producto; en la cesta, además un «Añadir» de 44 px (onAnadir) que lo añade sin salir.
 * Mide complemento_mostrado, complemento_tocado y complemento_anadido (solo ids de producto).
 */
export function CompletaTuCompra({
  bases,
  origen,
  onAnadir,
}: {
  bases: string[];
  origen: "ficha" | "cesta";
  onAnadir?: (id: string) => Promise<boolean>;
}) {
  const [lista, setLista] = useState<ShelfProduct[] | null>(null);
  const [anadiendo, setAnadiendo] = useState<string | null>(null);
  const clave = bases.join(",");
  const medidos = useRef(new Set<string>());
  useEffect(() => {
    let vivo = true;
    (async () => {
      const ids = clave ? clave.split(",") : [];
      const indice = ids.length ? await cargarIndiceBusqueda(false) : null;
      const porId = new Map((indice?.productos ?? []).map((p) => [p.id, p]));
      const basesIndice = ids.map((x) => porId.get(x)).filter((p): p is ProductoIndice => !!p);
      const elegidos = indice ? complementosDe(indice.productos, basesIndice, ids) : [];
      const conFoto = elegidos.length ? await conPortadas(elegidos) : [];
      if (!vivo) return;
      setLista(conFoto);
      const firma = `${clave}|${conFoto.map((p) => p.id).join(",")}`;
      if (conFoto.length && !medidos.current.has(firma)) {
        medidos.current.add(firma);
        void medirEvento("complemento_mostrado", origen === "ficha" ? "Ficha: completa tu compra" : "Cesta: completa tu compra", {
          metadata: { origen, bases: ids, ids: conFoto.map((p) => p.id), n: conFoto.length },
        });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [clave, origen]);

  if (!lista || !lista.length) return null;
  const enCesta = origen === "cesta";
  return (
    <View nativeID={`${origen}-complementos`} style={{ width: "100%", gap: 6, marginTop: enCesta ? 0 : 4 }}>
      <Text
        accessibilityRole="header"
        {...({ "aria-level": 2 } as object)}
        style={{ color: COLORS.text, fontWeight: "900", fontSize: enCesta ? 18 : TAMANOS.cuerpo, textAlign: "center" }}
      >
        Completa tu compra
      </Text>
      {lista.map((p, i) => (
        <View
          key={p.id}
          nativeID={`${origen}-complemento-${p.id}`}
          style={{ flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: "#EEF3F8" }}
        >
          <Pressable
            onPress={() => {
              void medirEvento("complemento_tocado", "Completa tu compra: producto tocado", { metadata: { origen, id: p.id, posicion: i + 1 } });
              router.push(`/producto/${p.id}` as Href);
            }}
            accessibilityRole="link"
            accessibilityLabel={`${p.title}, ${formatearEuros(p.priceEUR)}`}
            style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, opacity: pressed ? 0.7 : 1 })}
          >
            <View style={{ width: enCesta ? 56 : 44, height: enCesta ? 56 : 44, borderRadius: 10, overflow: "hidden", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
              {p.image ? (
                <ImagenInteligente uri={p.image} alt={p.title} ancho={enCesta ? 72 : 56} contentFit="contain" style={{ width: "100%", height: "100%" }} />
              ) : (
                <Ionicons name="game-controller-outline" size={20} color={COLORS.muted} />
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={2} style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 17 }}>
                {p.title}
              </Text>
              <Text style={{ color: colorTextoAzul(14), fontWeight: "900", fontSize: 14, marginTop: 2 }}>{formatearEuros(p.priceEUR)}</Text>
            </View>
          </Pressable>
          {enCesta && onAnadir ? (
            <Pressable
              nativeID={`cesta-complemento-anadir-${p.id}`}
              disabled={!!anadiendo}
              onPress={async () => {
                setAnadiendo(p.id);
                try {
                  const ok = await onAnadir(p.id);
                  if (ok) void medirEvento("complemento_anadido", "Cesta: complemento añadido", { metadata: { origen, id: p.id, precio: p.priceEUR } });
                } finally {
                  setAnadiendo(null);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel={`Añadir ${p.title} a la cesta`}
              style={({ pressed }) => ({
                minHeight: TACTIL.minimo,
                minWidth: 88,
                paddingHorizontal: 14,
                borderRadius: 999,
                borderWidth: 1.5,
                borderColor: COLORS.accent,
                backgroundColor: "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
                opacity: anadiendo && anadiendo !== p.id ? 0.5 : pressed ? 0.8 : 1,
              })}
            >
              {anadiendo === p.id ? (
                <ActivityIndicator size="small" color={COLORS.accent} />
              ) : (
                <Text style={{ color: COLORES_TEXTO.azulTexto, fontWeight: "900", fontSize: TAMANOS.cuerpo }}>Añadir</Text>
              )}
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

// --- «Comparar 2-3 productos» (mejora 8, aprobada por el dueño el 2026-11-14) --------------------------------------------
// Lo que se compara se guarda SOLO en el dispositivo (AsyncStorage = localStorage en la web; sin cuenta), como mucho 3,
// con su título, precio y portada para la barra. Todo el que lo usa (el «Comparar» de las tarjetas y de la ficha, la
// barra flotante y app/comparar.tsx) comparte la misma lista en memoria y se entera de cada cambio.
// Analítica propia (sin datos de nadie, solo ids de producto): comparar_anadido y comparar_quitado (id, origen y cuántos
// quedan); comparar_abierto y comparar_anadir_cesta salen de app/comparar.tsx. Administración → Analítica → «Comparador».
export const COMPARAR_MAX = 3;
const COMPARAR_KEY = "videojuegoszaragoza:comparar_v1";
export const AVISO_COMPARAR_LLENO = "Puedes comparar hasta 3 productos. Quita uno para añadir este.";
export type ProductoComparar = { id: string; titulo: string; precio: number; imagen: string | null };
export type OrigenComparar = "catalogo" | "ficha" | "barra" | "comparar";

// Un objeto nuevo en cada cambio (useSyncExternalStore): así React, y su compilador, ven que ha cambiado.
type EstadoComparar = { lista: ProductoComparar[]; leido: boolean; aviso: string | null; alturaBarra: number };
let comparador: EstadoComparar = { lista: [], leido: false, aviso: null, alturaBarra: 0 };
const oyentesComparar = new Set<() => void>();
let lecturaComparar: Promise<void> | null = null;
let relojAvisoComparar: ReturnType<typeof setTimeout> | null = null;

function cambiarComparar(parcial: Partial<EstadoComparar>) {
  comparador = { ...comparador, ...parcial };
  for (const f of [...oyentesComparar]) f();
}
function suscribirComparar(f: () => void) {
  oyentesComparar.add(f);
  return () => {
    oyentesComparar.delete(f);
  };
}
const fotoComparar = () => comparador;

/** Lo guardado tal cual se lee del dispositivo: solo lo que tiene forma de producto, sin repetidos y como mucho 3. */
function limpiarComparados(v: unknown): ProductoComparar[] {
  if (!Array.isArray(v)) return [];
  const out: ProductoComparar[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const id = String(r.id ?? "").trim();
    if (!/^[0-9A-Za-z-]{1,64}$/.test(id) || out.some((o) => o.id === id)) continue;
    const precio = Number(r.precio);
    out.push({
      id,
      titulo: String(r.titulo ?? "").slice(0, 200),
      precio: Number.isFinite(precio) ? precio : 0,
      imagen: typeof r.imagen === "string" && r.imagen.trim() ? r.imagen.trim() : null,
    });
    if (out.length >= COMPARAR_MAX) break;
  }
  return out;
}

function leerComparados(): Promise<void> {
  if (!lecturaComparar) {
    lecturaComparar = (async () => {
      let lista: ProductoComparar[] = [];
      try {
        const raw = await AsyncStorage.getItem(COMPARAR_KEY);
        lista = limpiarComparados(raw ? JSON.parse(raw) : []);
      } catch {
        // Sin almacenamiento (modo privado…): se compara igual mientras dure la visita.
      }
      cambiarComparar({ lista, leido: true });
    })();
  }
  return lecturaComparar;
}

function guardarComparados(lista: ProductoComparar[]) {
  cambiarComparar({ lista });
  AsyncStorage.setItem(COMPARAR_KEY, JSON.stringify(lista)).catch(() => {});
}

function avisoComparar(texto: string | null) {
  if (relojAvisoComparar) clearTimeout(relojAvisoComparar);
  relojAvisoComparar = null;
  if (texto) relojAvisoComparar = setTimeout(() => cambiarComparar({ aviso: null }), 6000);
  if (comparador.aviso !== texto) cambiarComparar({ aviso: texto });
}

/** La lista que se compara, si ya se ha leído del dispositivo, el aviso y el alto de la barra (se repinta con cada cambio). */
export function useComparar(): EstadoComparar {
  const estado = React.useSyncExternalStore(suscribirComparar, fotoComparar, fotoComparar);
  useEffect(() => {
    void leerComparados();
  }, []);
  return estado;
}

// Productos añadidos a «Comparar» desde que arrancó la tienda (no los ya guardados). Blue lo lee para su consejo del
// primer «Comparar»: así no se lo pierde aunque Blue llegue un momento después (se descarga aparte, carga más rápida).
let anadidosComparar = 0;
export function anadidosCompararDesdeArranque(): number {
  return anadidosComparar;
}

/** Añade o quita un producto. Con 3 ya elegidos no añade: deja el aviso amable («lleno»). */
export async function alternarComparar(p: ProductoComparar, origen: OrigenComparar): Promise<"anadido" | "quitado" | "lleno"> {
  await leerComparados();
  if (comparador.lista.some((x) => x.id === p.id)) {
    quitarDeComparar(p.id, origen);
    return "quitado";
  }
  if (comparador.lista.length >= COMPARAR_MAX) {
    avisoComparar(AVISO_COMPARAR_LLENO);
    return "lleno";
  }
  avisoComparar(null);
  const nueva = [...comparador.lista, p];
  anadidosComparar++;
  guardarComparados(nueva);
  void medirEvento("comparar_anadido", "Comparar: producto añadido", { metadata: { id: p.id, origen, n: nueva.length } });
  return "anadido";
}

export function quitarDeComparar(id: string, origen: OrigenComparar) {
  const nueva = comparador.lista.filter((x) => x.id !== id);
  if (nueva.length === comparador.lista.length) return;
  avisoComparar(null);
  guardarComparados(nueva);
  void medirEvento("comparar_quitado", "Comparar: producto quitado", { metadata: { id, origen, n: nueva.length } });
}

export function vaciarComparar(origen: OrigenComparar) {
  const quitados = comparador.lista.length;
  if (!quitados) return;
  avisoComparar(null);
  guardarComparados([]);
  void medirEvento("comparar_quitado", "Comparar: comparación vaciada", { metadata: { origen, vaciada: true, quitados, n: 0 } });
}

/** /comparar abierto con un enlace (compartido o no): lo que se compara en este dispositivo pasa a ser eso. */
export async function fijarComparados(lista: ProductoComparar[]) {
  await leerComparados();
  const limpia = limpiarComparados(lista);
  if (JSON.stringify(limpia) !== JSON.stringify(comparador.lista)) guardarComparados(limpia);
}

/** Enlace de la comparación (se puede compartir): /comparar?ids=a,b,c */
export function enlaceComparar(ids: string[]): Href {
  return `/comparar?ids=${ids.map(encodeURIComponent).join(",")}` as Href;
}

// La barra flotante sale en el Catálogo y en las fichas (fuera de la barra de pestañas, que ahí no se ve); en Inicio va
// el buscador flotante abajo y no se pisa. Su alto real (con la zona segura del iPhone) lo mide ella misma.
const RUTAS_BARRA_COMPARAR = /^\/(catalogo|producto\/[^/]+)\/?$/;
const ALTURA_BARRA_COMPARAR = 64;
// En la ficha, si «Comprar ya» o «Añadir a la cesta» quedan donde va la barra, la barra se esconde hasta que queden libres.
const BOTONES_SIN_TAPAR = ["ficha-comprar-ya", "ficha-anadir-cesta"];
const TRANSICION_BARRA = (Platform.OS === "web"
  ? { transitionProperty: "opacity, transform", transitionDuration: "180ms", transitionTimingFunction: "ease-out" }
  : {}) as unknown as ViewStyle;

/** Hueco que deja abajo una pantalla con la barra (Catálogo, ficha y el «Volver» flotante): 0 si no se ve. */
export function useAlturaBarraComparar(): number {
  const pathname = usePathname() ?? "";
  const { lista, alturaBarra } = useComparar();
  if (Platform.OS !== "web" || !RUTAS_BARRA_COMPARAR.test(pathname) || lista.length === 0) return 0;
  return alturaBarra || ALTURA_BARRA_COMPARAR;
}

/**
 * «Comparar» de la tarjeta del catálogo (casilla cuadrada y texto, 44 px de alto, sin recuadro) y de la ficha (como el botón de
 * «Avísame si baja de precio»). Es una casilla: «Comparar» o «Comparando». En la ficha, el aviso de «como mucho 3» sale
 * debajo del botón (allí la barra puede estar escondida para no tapar «Comprar ya»); en el catálogo, en la barra.
 */
export function BotonComparar({
  producto,
  origen,
  variante,
}: {
  producto: ProductoComparar;
  origen: "catalogo" | "ficha";
  variante: "tarjeta" | "ficha";
}) {
  const { lista } = useComparar();
  const activo = lista.some((x) => x.id === producto.id);
  const [lleno, setLleno] = useState(false);
  const n = lista.length;
  useEffect(() => {
    if (n < COMPARAR_MAX) setLleno(false);
  }, [n]);
  const pulsar = async () => setLleno((await alternarComparar(producto, origen)) === "lleno");
  const comunes = {
    onPress: pulsar,
    accessibilityRole: "checkbox" as const,
    accessibilityState: { checked: activo },
    "aria-checked": activo,
    accessibilityLabel: `Comparar ${producto.titulo}`,
  };

  if (variante === "tarjeta") {
    return (
      <Pressable
        nativeID={`comparar-${producto.id}`}
        {...comunes}
        style={({ pressed }) => ({
          minHeight: TACTIL.minimo,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          paddingHorizontal: 8,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        {/* Casilla cuadrada, como en las tiendas profesionales (dueño, 2026-11-19): vacía «Comparar», marcada en azul
            «Comparando». */}
        <Ionicons name={activo ? "checkbox" : "square-outline"} size={19} color={activo ? COLORS.accent : "#8A9AAA"} />
        <Text style={{ color: activo ? COLORES_TEXTO.azulTexto : COLORES_TEXTO.secundario, fontWeight: "700", fontSize: TAMANOS.minimo }}>
          {activo ? "Comparando" : "Comparar"}
        </Text>
      </Pressable>
    );
  }

  return (
    <View nativeID="ficha-comparar" style={{ gap: 6, alignItems: "stretch" }}>
      <Pressable
        nativeID="ficha-comparar-boton"
        {...comunes}
        style={({ pressed }) => ({
          minHeight: TACTIL.minimo,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingHorizontal: 14,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: activo ? "#BEE6FA" : "#E3EAF2",
          backgroundColor: activo ? "#EAF6FD" : "#FFFFFF",
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Ionicons name={activo ? "checkmark-circle" : "git-compare-outline"} size={16} color={activo ? COLORS.accent : COLORS.text} />
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13.5, flexShrink: 1 }}>
          {activo ? "En tu comparación" : "Comparar con otros productos"}
        </Text>
      </Pressable>
      {lleno ? (
        <Text nativeID="ficha-comparar-aviso" style={{ color: COLORES_TEXTO.secundario, fontSize: TAMANOS.minimo, lineHeight: 18, textAlign: "center" }}>
          {AVISO_COMPARAR_LLENO}
        </Text>
      ) : null}
      {activo && n >= 2 ? (
        <Pressable
          nativeID="ficha-comparar-ver"
          onPress={() => router.push(enlaceComparar(lista.map((x) => x.id)))}
          accessibilityRole="link"
          style={({ pressed }) => ({ minHeight: TACTIL.minimo, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
        >
          <Text style={{ color: COLORES_TEXTO.azulTexto, fontWeight: "900", fontSize: 14, textDecorationLine: "underline" }}>Ver la comparación ({n})</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Barra flotante de abajo (se monta una vez en app/_layout.tsx): miniaturas de lo elegido (tocar una la quita), la X que
 * vacía la comparación y «Comparar (N)», activo desde 2. Solo en el Catálogo y las fichas, nunca con la lista vacía. En la
 * ficha se esconde mientras «Comprar ya» o «Añadir a la cesta» estén donde iría ella. Blue va arriba a la derecha, así que
 * no se cruzan; el «Volver» flotante del catálogo sube lo que mide la barra (useAlturaBarraComparar).
 */
export function BarraComparar() {
  const pathname = usePathname() ?? "";
  const { lista, aviso } = useComparar();
  const insets = useSafeAreaInsets();
  const visible = Platform.OS === "web" && RUTAS_BARRA_COMPARAR.test(pathname) && lista.length > 0;
  const enFicha = pathname.startsWith("/producto/");
  const [tapa, setTapa] = useState(false);

  useEffect(() => {
    if (!visible || !enFicha || typeof document === "undefined" || typeof window === "undefined") {
      setTapa(false);
      return;
    }
    let pendiente = 0;
    const medir = () => {
      pendiente = 0;
      const limite = window.innerHeight - (comparador.alturaBarra || ALTURA_BARRA_COMPARAR);
      setTapa(
        BOTONES_SIN_TAPAR.some((id) => {
          const r = document.getElementById(id)?.getBoundingClientRect();
          return !!r && r.height > 0 && r.bottom > limite && r.top < window.innerHeight;
        })
      );
    };
    const pedir = () => {
      if (!pendiente) pendiente = requestAnimationFrame(medir);
    };
    // El scroll de la ficha es de un div (no de la ventana): se escucha en captura. La ficha llega después que la barra.
    document.addEventListener("scroll", pedir, true);
    window.addEventListener("resize", pedir);
    const cambios = typeof MutationObserver !== "undefined" ? new MutationObserver(pedir) : null;
    cambios?.observe(document.body, { childList: true, subtree: true });
    pedir();
    return () => {
      document.removeEventListener("scroll", pedir, true);
      window.removeEventListener("resize", pedir);
      cambios?.disconnect();
      if (pendiente) cancelAnimationFrame(pendiente);
    };
  }, [visible, enFicha, pathname]);

  if (!visible) return null;
  const n = lista.length;
  const listo = n >= 2;
  const textoArriba = aviso && !enFicha ? aviso : n === 1 ? "Elige otro producto para comparar" : null;
  return (
    <View
      nativeID="comparar-barra"
      pointerEvents={tapa ? "none" : "box-none"}
      aria-hidden={tapa}
      {...({ dataSet: { tapa: tapa ? "1" : "0" } } as object)}
      onLayout={(e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        if (h > 0 && h !== comparador.alturaBarra) cambiarComparar({ alturaBarra: h });
      }}
      style={[
        {
          position: (Platform.OS === "web" ? "fixed" : "absolute") as "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 8500,
          alignItems: "center",
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: 8 + Math.round(insets.bottom),
          backgroundColor: "rgba(255,255,255,0.97)",
          borderTopWidth: 1,
          borderTopColor: "#E3EAF2",
          opacity: tapa ? 0 : 1,
          transform: [{ translateY: tapa ? 24 : 0 }],
        },
        TRANSICION_BARRA,
      ]}
    >
      <View style={{ width: "100%", maxWidth: 560, gap: 4 }}>
        {textoArriba ? (
          <Text
            nativeID={aviso && !enFicha ? "comparar-barra-aviso" : "comparar-barra-pista"}
            style={{ color: COLORES_TEXTO.secundario, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 17, textAlign: "center" }}
          >
            {textoArriba}
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Pressable
            nativeID="comparar-barra-vaciar"
            onPress={() => vaciarComparar("barra")}
            accessibilityRole="button"
            accessibilityLabel="Vaciar la comparación"
            style={({ pressed }) => ({ width: TACTIL.minimo, height: TACTIL.minimo, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
          >
            <Ionicons name="close" size={22} color={COLORS.text} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 }}>
            {lista.map((p) => (
              <Pressable
                key={p.id}
                nativeID={`comparar-barra-${p.id}`}
                onPress={() => quitarDeComparar(p.id, "barra")}
                accessibilityRole="button"
                accessibilityLabel={`Quitar ${p.titulo} de la comparación`}
                style={({ pressed }) => ({
                  width: TACTIL.minimo,
                  height: TACTIL.minimo,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: "#E3EAF2",
                  backgroundColor: "#FFFFFF",
                  overflow: "hidden",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                {p.imagen ? (
                  <ImagenInteligente uri={p.imagen} alt={p.titulo} ancho={88} contentFit="contain" style={{ width: "100%", height: "100%" }} />
                ) : (
                  <Ionicons name="game-controller-outline" size={20} color={COLORS.muted} />
                )}
                {/* «Quitar»: la X pequeña en la esquina (toda la miniatura es el botón). */}
                <View pointerEvents="none" style={{ position: "absolute", top: 2, right: 2, width: 16, height: 16, borderRadius: 8, backgroundColor: "rgba(11,33,56,0.72)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="close" size={11} color="#FFFFFF" />
                </View>
              </Pressable>
            ))}
          </View>
          <Pressable
            nativeID="comparar-barra-ir"
            disabled={!listo}
            onPress={() => router.push(enlaceComparar(lista.map((p) => p.id)))}
            accessibilityRole="button"
            accessibilityState={{ disabled: !listo }}
            accessibilityLabel={listo ? `Comparar ${n} productos` : "Elige al menos 2 productos para comparar"}
            style={({ pressed }) => ({
              minHeight: TACTIL.minimo,
              paddingHorizontal: 16,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: listo ? COLORS.accent : "#E3EAF2",
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: listo ? "#FFFFFF" : COLORES_TEXTO.secundario, fontWeight: "900", fontSize: TAMANOS.cuerpo }}>Comparar ({n})</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// --- «Vistos recientemente» en Inicio (mejora 9, aprobada por el dueño el 2026-11-14: «solo con historial suficiente») -----
// Al abrir la ficha de un producto a la venta se apunta SOLO en el dispositivo (AsyncStorage = localStorage en la web; sin
// cuenta) su id y la hora: el último visto primero, sin repetidos y como mucho 12. Inicio enseña el estante solo con 3 o
// más que sigan a la venta (están en el índice ligero de la búsqueda); lo retirado o vendido se quita solo del historial.
// Analítica propia sin datos de nadie: vistos_mostrado (n), visto_tocado (id y posición), visto_quitado (id) y
// vistos_borrados (n), en Administración → Analítica → «Vistos recientemente (30 días)».
export const VISTOS_MAX = 12;
export const VISTOS_MIN = 3;
const VISTOS_KEY = "videojuegoszaragoza:vistos_v1";
export type VistoReciente = { id: string; en: number };

// Un objeto nuevo en cada cambio (useSyncExternalStore), como el comparador.
type EstadoVistos = { lista: VistoReciente[]; leido: boolean };
let vistos: EstadoVistos = { lista: [], leido: false };
const oyentesVistos = new Set<() => void>();
let lecturaVistos: Promise<void> | null = null;

function cambiarVistos(lista: VistoReciente[], guardar: boolean) {
  vistos = { lista, leido: true };
  for (const f of [...oyentesVistos]) f();
  if (guardar) AsyncStorage.setItem(VISTOS_KEY, JSON.stringify(lista)).catch(() => {});
}
function suscribirVistos(f: () => void) {
  oyentesVistos.add(f);
  return () => {
    oyentesVistos.delete(f);
  };
}
const fotoVistos = () => vistos;

/** Lo guardado tal cual se lee: solo ids con buena forma, sin repetidos (se queda el primero, el más reciente) y 12. */
function limpiarVistos(v: unknown): VistoReciente[] {
  if (!Array.isArray(v)) return [];
  const out: VistoReciente[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const id = String(r.id ?? "").trim();
    if (!/^[0-9A-Za-z-]{1,64}$/.test(id) || out.some((o) => o.id === id)) continue;
    const en = Number(r.en);
    out.push({ id, en: Number.isFinite(en) ? en : 0 });
    if (out.length >= VISTOS_MAX) break;
  }
  return out;
}

function leerVistos(): Promise<void> {
  if (!lecturaVistos) {
    lecturaVistos = (async () => {
      let lista: VistoReciente[] = [];
      try {
        const raw = await AsyncStorage.getItem(VISTOS_KEY);
        lista = limpiarVistos(raw ? JSON.parse(raw) : []);
      } catch {
        // Sin almacenamiento (modo privado…): no hay historial y no pasa nada.
      }
      cambiarVistos(lista, false);
    })();
  }
  return lecturaVistos;
}

/** La ficha (app/producto/[id].tsx) al abrir un producto a la venta: pasa a ser el primero del historial. */
export async function registrarVisto(id: string) {
  if (!/^[0-9A-Za-z-]{1,64}$/.test(id)) return;
  await leerVistos();
  if (vistos.lista[0]?.id === id) return;
  cambiarVistos([{ id, en: Date.now() }, ...vistos.lista.filter((v) => v.id !== id)].slice(0, VISTOS_MAX), true);
}

export function quitarVisto(id: string) {
  const nueva = vistos.lista.filter((v) => v.id !== id);
  if (nueva.length === vistos.lista.length) return;
  cambiarVistos(nueva, true);
  void medirEvento("visto_quitado", "Inicio: visto recientemente quitado", { path: "/", metadata: { id, n: nueva.length } });
}

export function borrarVistos() {
  const n = vistos.lista.length;
  if (!n) return;
  cambiarVistos([], true);
  void medirEvento("vistos_borrados", "Inicio: historial de vistos borrado", { path: "/", metadata: { n } });
}

/** El historial del dispositivo (se repinta con cada cambio, también al volver de una ficha). */
export function useVistos(): EstadoVistos {
  const estado = React.useSyncExternalStore(suscribirVistos, fotoVistos, fotoVistos);
  useEffect(() => {
    void leerVistos();
  }, []);
  return estado;
}

/**
 * El estante «Vistos recientemente» de Inicio (app/(tabs)/index.tsx, tras «Recién llegado»): el mismo carrusel discreto
 * (sin movimiento automático) con «Quitar» en cada tarjeta y «Borrar historial» debajo. No sale con menos de 3 vistos a la
 * venta ni si todos son justo los que ya enseña «Recién llegado» al lado. `pie` va debajo solo si se pinta.
 */
export function VistosRecientemente({ pie }: { pie?: React.ReactNode }) {
  const { lista, leido } = useVistos();
  const [productos, setProductos] = useState<ShelfProduct[] | null>(null);
  const portadas = useRef(new Map<string, string | null>());
  const medido = useRef(false);
  const clave = lista.map((v) => v.id).join(",");

  useEffect(() => {
    if (!leido) return;
    let vivo = true;
    (async () => {
      const ids = clave ? clave.split(",") : [];
      if (ids.length < VISTOS_MIN) {
        setProductos([]);
        return;
      }
      const indice = await cargarIndiceBusqueda(false);
      if (!vivo) return;
      if (!indice) {
        setProductos([]);
        return;
      }
      const porId = new Map(indice.productos.filter(publicado).map((p) => [p.id, p]));
      const aLaVenta = ids.filter((id) => porId.has(id));
      // Lo retirado o vendido sale solo del historial del dispositivo.
      if (aLaVenta.length !== ids.length && vistos.lista.length === ids.length) {
        cambiarVistos(vistos.lista.filter((v) => porId.has(v.id)), true);
        return;
      }
      if (aLaVenta.length < VISTOS_MIN) {
        setProductos([]);
        return;
      }
      // Si son justo los mismos que «Recién llegado» (el estante de al lado; misma consulta en memoria), no se repiten.
      const novedades = await getShelfProductsCached("novedades").catch(() => [] as ShelfProduct[]);
      const enNovedades = new Set(novedades.map((p) => p.id));
      if (aLaVenta.every((id) => enNovedades.has(id))) {
        if (vivo) setProductos([]);
        return;
      }
      const faltan = aLaVenta.filter((id) => !portadas.current.has(id));
      if (faltan.length) {
        const nuevas = await portadasDeProductos(faltan).catch(() => new Map<string, string>());
        for (const id of faltan) portadas.current.set(id, nuevas.get(id) ?? null);
      }
      if (!vivo) return;
      setProductos(
        aLaVenta.map((id) => {
          const p = porId.get(id)!;
          return { id, title: p.titulo.trim() || "Producto", priceEUR: p.precio, image: portadas.current.get(id) ?? null };
        })
      );
    })();
    return () => {
      vivo = false;
    };
  }, [clave, leido]);

  const n = productos?.length ?? 0;
  useEffect(() => {
    if (n >= VISTOS_MIN && !medido.current) {
      medido.current = true;
      void medirEvento("vistos_mostrado", "Inicio: vistos recientemente", { path: "/", metadata: { n } });
    }
  }, [n]);

  const tocar = useCallback((id: string, posicion: number) => {
    void medirEvento("visto_tocado", "Inicio: visto recientemente tocado", { path: "/", metadata: { id, posicion } });
  }, []);

  if (!productos || productos.length < VISTOS_MIN) return null;
  return (
    <CarruselProductosCategoria
      nativeID="inicio-vistos"
      titulo="Vistos recientemente"
      productos={productos}
      onTocar={tocar}
      onQuitar={quitarVisto}
      sinMovimiento
      pie={
        <>
          <Pressable
            nativeID="inicio-vistos-borrar"
            onPress={borrarVistos}
            accessibilityRole="button"
            accessibilityLabel="Borrar el historial de vistos recientemente"
            style={({ pressed }) => ({ alignSelf: "center", minHeight: TACTIL.minimo, justifyContent: "center", paddingHorizontal: 12, opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ color: COLORES_TEXTO.secundario, fontWeight: "800", fontSize: TAMANOS.minimo, textDecorationLine: "underline" }}>Borrar historial</Text>
          </Pressable>
          {pie}
        </>
      }
    />
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// «Recientes noticias que creemos que podrían interesarte» (dueño, 2026-11-27, una sola tira en vez de «Noticias que
// podrían interesarte» y «Últimas noticias»): en Inicio bajo «Recién llegado» y en Perfil y Cesta bajo «También te puede
// interesar». Una sola consulta (las 20 últimas publicadas, sin textos largos) guardada 5 minutos en memoria para las
// tres pantallas. Se enseñan 12: primero las que nombran la consola de lo que el cliente ha mirado en este dispositivo
// (Vistos recientemente y, en la cesta, lo que lleva) y después las demás, la más nueva primero; todo se calcula en el
// dispositivo, sin guardar nada. Cada tarjeta es un enlace de verdad a /noticias/<id>.
// Analítica propia: noticias_estante_mostrado y noticia_estante_tocada (estante, pantalla, id, posición, si iba
// personalizada), en Administración → Analítica (#analitica-noticias-estantes).
// ---------------------------------------------------------------------------------------------------------------------

export type PantallaNoticias = "inicio" | "perfil" | "cesta";
type EstanteNoticias = "recientes";
type NoticiaEstante = { id: string; titulo: string; categoria: string; afectaA: string; fecha: string | null; foto: string | null };

// Nombres de la analítica (Administración → Analítica los busca tal cual).
const ESTANTE_NOMBRE: Record<EstanteNoticias, string> = { recientes: "recientes que podrían interesarte" };
// Se eligen entre las 20 más nuevas y se enseñan 12.
const NOTICIAS_RECIENTES = 20;
const NOTICIAS_MOSTRADAS = 12;
const NOTICIA_ANCHO = 220;
const NOTICIA_FOTO_ALTO = 124;
let noticiasCache: { en: number; filas: Promise<NoticiaEstante[]> } | null = null;

// Mismo criterio que leerFotosNoticia (app/noticias/[id].tsx): solo fotos comprobadas por el servidor y en https.
function fotoNoticia(r: Record<string, unknown>): string | null {
  if (r.imagenes_verificadas !== true) return null;
  for (const u of [r.imagen_url, ...(Array.isArray(r.imagenes) ? r.imagenes : [])]) {
    if (typeof u === "string" && /^https:\/\//i.test(u)) return u;
  }
  return null;
}

async function consultarNoticiasEstante(): Promise<NoticiaEstante[]> {
  const base = "id,titulo,categoria,afecta_a,imagen_url,publicada_en,created_at";
  const consulta = (columnas: string) =>
    supabase.from("noticias_gaming").select(columnas).eq("publicada", true).order("publicada_en", { ascending: false, nullsFirst: false }).limit(NOTICIAS_RECIENTES);
  let { data, error } = await consulta(`${base},imagenes,imagenes_verificadas`);
  // Sin las columnas opcionales (migración pendiente), con lo básico.
  if (error) ({ data, error } = await consulta(base));
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[])
    .map((r) => ({
      id: String(r.id),
      titulo: String(r.titulo ?? "").trim(),
      categoria: String(r.categoria ?? "").trim() || "Gaming",
      afectaA: String(r.afecta_a ?? "").trim(),
      fecha: (r.publicada_en as string | null) ?? (r.created_at as string | null) ?? null,
      foto: fotoNoticia(r),
    }))
    .filter((n) => n.titulo);
}

function leerNoticiasEstante(forzar: boolean): Promise<NoticiaEstante[]> {
  if (!forzar && noticiasCache && Date.now() - noticiasCache.en < SHELF_CACHE_TTL_MS) return noticiasCache.filas;
  const filas = consultarNoticiasEstante().catch((e) => {
    // Es un añadido: si falla, no se pinta (aviso, no error) y se reintenta en la siguiente pantalla.
    console.warn("No se han podido cargar las noticias de los estantes:", e);
    noticiasCache = null;
    return [] as NoticiaEstante[];
  });
  noticiasCache = { en: Date.now(), filas };
  return filas;
}

// «Hoy», «Ayer» o «26 nov».
function fechaCorta(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.round((dia(new Date()) - dia(d)) / 86400000);
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Ayer";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" }).replace(".", "");
}

/**
 * «Recientes noticias que creemos que podrían interesarte»: de las NOTICIAS_RECIENTES más nuevas, primero las que nombran
 * la consola de lo mirado en el dispositivo (y lo de la cesta); dentro de cada grupo, la más nueva primero.
 */
export function noticiasRecientesParaTi(noticias: NoticiaEstante[], familias: Set<FamiliaConsola>) {
  const coincide = (n: NoticiaEstante) => [...familiasDeTexto(`${n.titulo} ${n.afectaA}`)].some((f) => familias.has(f));
  const lista = noticias
    .slice(0, NOTICIAS_RECIENTES)
    .map((n, orden) => ({ n, orden, suya: familias.size > 0 && coincide(n) }))
    .sort((a, b) => Number(b.suya) - Number(a.suya) || a.orden - b.orden)
    .slice(0, NOTICIAS_MOSTRADAS);
  return { noticias: lista.map((x) => x.n), personal: lista.some((x) => x.suya) };
}

export function NoticiasEstantes({ pantalla, idsBase, separador }: { pantalla: PantallaNoticias; idsBase?: string[]; separador?: React.ReactNode }) {
  const { lista, leido } = useVistos();
  const [noticias, setNoticias] = useState<NoticiaEstante[] | null>(null);
  const [familias, setFamilias] = useState<Set<FamiliaConsola>>(() => new Set());
  const recarga = useRecarga({ parte: true });
  const clave = [...lista.map((v) => v.id), ...(idsBase ?? [])].join(",");

  useEffect(() => {
    let vivo = true;
    void leerNoticiasEstante(recarga > 0).then((filas) => vivo && setNoticias(filas));
    return () => {
      vivo = false;
    };
  }, [recarga]);

  // Las consolas de lo mirado (y de la cesta), con el índice ligero de la búsqueda que ya está en memoria.
  useEffect(() => {
    if (!leido) return;
    let vivo = true;
    const ids = clave ? clave.split(",") : [];
    if (!ids.length) {
      setFamilias(new Set());
      return;
    }
    void cargarIndiceBusqueda(false).then((indice) => {
      if (!vivo || !indice) return;
      const porId = new Map(indice.productos.map((p) => [p.id, p]));
      const f = new Set<FamiliaConsola>();
      for (const id of ids) {
        const p = porId.get(id);
        if (p) familiasDeProducto(p).forEach((x) => f.add(x));
      }
      setFamilias(f);
    });
    return () => {
      vivo = false;
    };
  }, [clave, leido]);

  const reparto = useMemo(() => (noticias ? noticiasRecientesParaTi(noticias, familias) : null), [noticias, familias]);
  if (!reparto) return null;
  return (
    <CarruselNoticias
      estante="recientes"
      pantalla={pantalla}
      titulo="Recientes noticias que creemos que podrían interesarte"
      noticias={reparto.noticias}
      personal={reparto.personal}
      pie={separador}
    />
  );
}

function CarruselNoticias({
  estante,
  pantalla,
  titulo,
  noticias,
  personal,
  pie,
}: {
  estante: EstanteNoticias;
  pantalla: PantallaNoticias;
  titulo: string;
  noticias: NoticiaEstante[];
  personal: boolean;
  pie?: React.ReactNode;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(0);
  const anchoVisible = useRef(0);
  const anchoTotal = useRef(0);
  const [izquierda, setIzquierda] = useState(false);
  const [derecha, setDerecha] = useState(false);
  const medido = useRef(false);
  const paso = NOTICIA_ANCHO + CARD_GAP;
  const nombreId = `${pantalla}-noticias-${estante}`;

  const flechas = useCallback(() => {
    setIzquierda(scrollX.current > 4);
    setDerecha(scrollX.current < anchoTotal.current - anchoVisible.current - 4);
  }, []);

  useEffect(() => {
    if (!noticias.length || medido.current) return;
    medido.current = true;
    void medirEvento("noticias_estante_mostrado", `Noticias en estantes: ${ESTANTE_NOMBRE[estante]} · vistas`, {
      metadata: { estante, pantalla, n: noticias.length, personal },
    });
  }, [noticias.length, estante, pantalla, personal]);

  const mover = useCallback(
    (dir: 1 | -1) => {
      const visibles = Math.max(1, Math.floor(anchoVisible.current / paso));
      const maxX = Math.max(0, anchoTotal.current - anchoVisible.current);
      scrollRef.current?.scrollTo({ x: Math.min(maxX, Math.max(0, scrollX.current + visibles * paso * dir)), animated: true });
    },
    [paso]
  );

  if (!noticias.length) return null;
  return (
    <View nativeID={nombreId} style={{ gap: 10 }}>
      <Text accessibilityRole="header" {...({ "aria-level": 2 } as object)} style={{ color: COLORS.text, fontSize: 17, fontWeight: "900", textAlign: "center" }}>
        {titulo}
      </Text>
      <View style={{ position: "relative" }}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={paso}
          decelerationRate="fast"
          scrollEventThrottle={16}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            scrollX.current = contentOffset.x;
            anchoVisible.current = layoutMeasurement.width;
            anchoTotal.current = contentSize.width;
            flechas();
          }}
          onLayout={(e) => {
            anchoVisible.current = e.nativeEvent.layout.width;
            flechas();
          }}
          onContentSizeChange={(w) => {
            anchoTotal.current = w;
            flechas();
          }}
          contentContainerStyle={{ gap: CARD_GAP, paddingRight: 4 }}
        >
          {noticias.map((n, i) => (
            <Link key={n.id} href={`/noticias/${n.id}` as Href} asChild>
              <Pressable
                nativeID={`${nombreId}-${n.id}`}
                accessibilityRole="link"
                accessibilityLabel={n.titulo}
                onPress={() => {
                  void medirEvento("noticia_estante_tocada", `Noticias en estantes: ${ESTANTE_NOMBRE[estante]} · tocada`, {
                    metadata: { estante, pantalla, id: n.id, posicion: i + 1, personal },
                  });
                }}
                // Dentro de <Link asChild> el estilo tiene que ser un objeto (con una función, Link lo pierde).
                style={{ width: NOTICIA_ANCHO, borderRadius: 16, backgroundColor: COLORS.tile, padding: 10, alignItems: "center" }}
              >
                <View
                  style={{
                    width: "100%",
                    height: NOTICIA_FOTO_ALTO,
                    borderRadius: 12,
                    overflow: "hidden",
                    backgroundColor: "#FFFFFF",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {n.foto ? (
                    <ImagenInteligente uri={n.foto} alt={n.titulo} ancho={220} contentFit="cover" style={{ width: "100%", height: "100%" }} />
                  ) : (
                    <Ionicons name="newspaper-outline" size={30} color={COLORS.muted} />
                  )}
                </View>
                <Text style={{ color: colorTextoAzul(12), fontSize: 12, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase", marginTop: 8, textAlign: "center" }}>
                  {[n.categoria, fechaCorta(n.fecha)].filter(Boolean).join(" · ")}
                </Text>
                <Text numberOfLines={3} style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo + 1, lineHeight: 19, marginTop: 4, textAlign: "center" }}>
                  {n.titulo}
                </Text>
              </Pressable>
            </Link>
          ))}
        </ScrollView>
        {izquierda ? <CarouselArrow direction="left" onPress={() => mover(-1)} top={NOTICIA_FOTO_ALTO / 2 - 12} /> : null}
        {derecha ? <CarouselArrow direction="right" onPress={() => mover(1)} top={NOTICIA_FOTO_ALTO / 2 - 12} /> : null}
      </View>
      {pie}
    </View>
  );
}

// Flecha ‹ › flotante a un lado del carrusel — mismo estilo (círculo oscuro
// semitransparente) que las del carrusel de fotos de la Oferta de la Semana.
// Solo aparece cuando de verdad hay más tarjetas hacia ese lado.
function CarouselArrow({ direction, onPress, top = 37 }: { direction: "left" | "right"; onPress: () => void; top?: number }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={direction === "left" ? "Anteriores" : "Siguientes"}
      // Zona táctil de 44 px; el círculo visible sigue siendo de 30.
      style={{
        position: "absolute",
        [direction]: -6,
        top,
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {({ pressed }) => (
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: pressed ? "rgba(11,33,56,0.72)" : "rgba(11,33,56,0.52)", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={direction === "left" ? "chevron-back" : "chevron-forward"} size={16} color="#FFFFFF" />
        </View>
      )}
    </Pressable>
  );
}
