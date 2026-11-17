/**
 * Archivo: app/producto/[id].tsx
 * Función: ficha de un producto, en la dirección /producto/<id> (admite ?chat=1 y ?guia=1).
 * Para qué sirve: el cliente ve fotos, precio, estado, entrega estimada y garantía, y puede añadir a la cesta, comprar ya, preguntar, compartir, dar «me gusta», avisarse de bajadas de precio, comparar o reservar con señal.
 * Conectado con: lib/supabase.ts (tablas products, product_media, categories, profiles), lib/interaccion.ts, lib/reservas.ts, lib/envio.ts, lib/analytics.ts, constants/theme.ts, lib/admin/products.utils.ts, components/VisorFotos.tsx, ImagenInteligente.tsx, CarruselProductosCategoria.tsx, ConversacionProducto.tsx, PerfilPublico.tsx, CabeceraMarca.tsx, TirarParaActualizar.tsx, components/marca/*; api/pago.ts (reserva con señal).
 * Utilizado por: Expo Router (dirección /producto/<id>); la enlazan app/catalogo.tsx, app/comparar.tsx, app/(tabs)/index.tsx, app/(tabs)/perfil.tsx, app/(tabs)/blue-ia.tsx, app/admin/escaparate.tsx y components/CarruselProductosCategoria.tsx, AsistenteBlue.tsx, BarraBusqueda.tsx, ConversacionProducto.tsx; exporta FichaProducto, usada por app/servicio/[id].tsx.
 * Dependencias: react, react-native, expo-router, @expo/vector-icons, @react-native-async-storage/async-storage.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: ficha de un producto individual. Carga el producto y su galería
 * de fotos/vídeos desde Supabase a partir del id de la URL, y permite
 * añadirlo a la cesta, ir a checkout, preguntar por este producto,
 * compartir la ficha o darle "me gusta".
 *
 * Dudas (mejora 10 «Chat con el producto adjunto», 2026-11-15): «Preguntar por este artículo» abre directamente el chat
 * de la tienda de (este producto, este cliente) —el que ya hay o uno nuevo, get_or_create_product_chat no duplica— con la
 * tarjeta del producto arriba y preguntas sugeridas (abrirChatProducto en components/ConversacionProducto.tsx); Jefe lo ve
 * en app/admin/chats.tsx. Sin cuenta (PreguntarArticulo): explica la ventaja y ofrece «Crear cuenta gratis» / «Entrar»;
 * al entrar vuelve aquí con ?chat=1 y abre el chat. Se mide chat_producto_invitacion (solo el producto). Antes abría Blue
 * IA con ?producto=<id> (Blue sigue pudiendo pasar al equipo con «Hablar con el equipo»).
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
 * Tamaños (2026-11-12, grupo 3): compartir y «me gusta» sobre la foto tienen 44 × 44 de zona táctil (el círculo
 * visible sigue en 32) y el contador a 13 px (constants/theme.ts; prueba TM3).
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
 * cesta, como el botón equivalente de otras tiendas online. Desde el 2026-11-14 (mejora 2 «Comprar en menos pasos»)
 * abre /checkout?comprar=<id>: se paga SOLO este artículo (lo demás sigue en la cesta) con los datos del perfil ya puestos.
 *
 * Imagen ampliada: al tocar la foto principal se abre
 * components/VisorFotos.tsx, un visor a pantalla completa con zoom
 * (pellizco, doble toque o rueda del ratón) y navegación entre todas las
 * fotos del producto. La foto principal (sin abrir el visor) también se
 * puede deslizar con el dedo hacia los lados como un carrusel, para pasar
 * de una foto a otra sin salir de la ficha (mainImagePan).
 *
 * Ficha de confianza (mejora 4, 2026-11-14): el visor se cierra también deslizando hacia abajo y su uso se mide como
 * ficha_foto_zoom (abrir, zoom, cerrar deslizando). Debajo del precio, «Revisado por nuestro equipo» y «Garantía de N
 * meses» SOLO si el dueño los marca en el producto (products.revisado / garantia_meses, migración 20261114140000; sin
 * la columna no sale nada). Y la entrega estimada (EntregaEstimadaFicha con lib/envio.ts → entregaEstimada): con el
 * código postal del perfil (dirección predeterminada) o uno escrito aquí que no se guarda, «Llega hoy» en Zaragoza y
 * Cuarte, «Llega entre el … y el …» en el resto de España (sin domingos) y, sin código, las dos; se mide como
 * ficha_entrega_estimada (tipo y origen, nunca el código postal). Se ve en Administración → Analítica.
 *
 * «Avísame si baja de precio» (mejora 5, 2026-11-14; AvisoPrecioFicha, migración 20261114160100): bajo «Preguntar por
 * este producto», un interruptor de 44 px SOLO con cuenta (tabla avisos_precio, lib/interaccion.ts). Sin cuenta, al
 * tocarlo explica la ventaja y ofrece «Crear cuenta gratis» (vuelve a esta ficha al entrar). Sin la migración o si la
 * lectura falla, no se ofrece (un error no es «no lo sigues»). Se mide como aviso_precio_activado / aviso_precio_desactivado
 * (solo el producto) y aviso_precio_invitacion; Blue avisa de la bajada (components/AsistenteBlue.tsx).
 *
 * «Productos parecidos» y «Completa tu compra» (mejora 6, 2026-11-14; components/CarruselProductosCategoria.tsx): al final,
 * hasta 8 productos de la misma categoría y precio parecido (carrusel en el móvil, rejilla de 4 en el ordenador; sin
 * ninguno, no sale) y, bajo los botones de comprar, como mucho 3 mandos o accesorios de la misma familia SOLO si es una
 * consola. Se miden parecidos_mostrado / parecido_tocado y complemento_mostrado / _tocado (Administración → Analítica).
 *
 * «Comparar con otros productos» (mejora 8, 2026-11-14; components/CarruselProductosCategoria.tsx → BotonComparar): bajo el
 * aviso de precio, una casilla de 44 px que lo añade a la comparación (como mucho 3, en el dispositivo). La barra de
 * abajo (BarraComparar) se esconde mientras «Comprar ya» / «Añadir a la cesta» (ficha-comprar-ya, ficha-anadir-cesta)
 * estén donde iría ella, y la ficha termina con su hueco. Lleva a app/comparar.tsx.
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
 * Reservar con señal (mejora 14, 2026-11-15; ReservarConSenal): SOLO si GET /api/pago?reserva=ajustes dice que está
 * activa (apagada y vacía hasta que el dueño ponga sus reglas y su gestor revise el texto). Hoja con días, % y € de la
 * escala, vencimiento, arras, qué pasa al vencer, condiciones y casilla obligatoria; «Pagar señal» solo manda artículo y
 * días (el importe lo calcula api/pago.ts). Si el artículo está reservado, «Este artículo está reservado hasta el …» y sin comprar.
 * Las condiciones y «Qué pasa al vencer» se enseñan con las marcas rellenadas (rellenarCondicionesReserva).
 * Mide reserva_abierta y reserva_pagar (lib/reservas.ts tiene el cálculo y los textos).
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
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Href } from "expo-router";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { filaPerfilCliente, rolDeUsuario, supabase } from "../../lib/supabase";
import { CAMPO, COLORES_TEXTO, TACTIL, TAMANOS, colorTextoAzul } from "../../constants/theme";
import { sinEmojis } from "../../lib/admin/products.utils";
import { contarVistaProducto, fijarAvisoPrecio, fijarMeGusta, misAvisosPrecio } from "../../lib/interaccion";
import { marcarOrigenRegistro, medirCargaPantalla, trackEvent, trackEventThrottled } from "../../lib/analytics";
import {
  EXPLICACION_ARRAS,
  eurosReserva,
  fechaReserva,
  leerAjustesReserva,
  porcentajeReserva,
  productosReservadosPorOtros,
  rellenarCondicionesReserva,
  RESERVA_MINUTOS,
  reservaDisponible,
  reservarProducto,
  senalReserva,
  URL_PAGO,
  type AjustesReservaPublicos,
} from "../../lib/reservas";
import {
  cargarAjustesFranjas,
  cargarTarifas,
  entregaEstimada,
  limpiarCodigoPostal,
  tipoEntregaPorCodigo,
  type TipoEntregaEstimada,
  type ZonaEnvio,
} from "../../lib/envio";
import { direccionesDeFila } from "../../components/PerfilPublico";
import ImageLightbox, { type EventoVisor, type LightboxImage } from "../../components/VisorFotos";
import SmartImage from "../../components/ImagenInteligente";
import CargaMarca from "../../components/marca/CargaMarca";
import CabeceraMarca from "../../components/CabeceraMarca";
import { useRecarga } from "../../components/TirarParaActualizar";
import MarcaAnimada from "../../components/marca/MarcaAnimada";
import { BotonComparar, CompletaTuCompra, ProductosParecidos, registrarVisto, useAlturaBarraComparar } from "../../components/CarruselProductosCategoria";
import { abrirChatProducto } from "../../components/ConversacionProducto";

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
export type Caracteristica = { etiqueta: string; valor: string };
// «Mantenimiento básico realizado» que envía VeoAura: título, nota y puntos (etiqueta y valor), tal cual llegan.
type Mantenimiento = { titulo: string; nota: string | null; puntos: Caracteristica[] };

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

type Product = {
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

async function detectAdmin(): Promise<boolean> {
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
async function fetchProductRow(productId: string, publicOnly: boolean): Promise<ProductDbRow | null> {
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

export default function ProductoScreen() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const isTablet = widthSafe >= 700 && widthSafe < 1080;
  const isWide = widthSafe >= 1080;
  const pagePadding = isMobile ? 12 : 16;
  const alturaBarraComparar = useAlturaBarraComparar();

  // ?guia=1: la guía de Blue (components/AsistenteBlue.tsx) enseña esta ficha; esa demostración no cuenta como visita.
  // ?chat=1: vuelve de crear la cuenta o entrar desde «Preguntar por este artículo» y abre el chat (PreguntarArticulo).
  const params = useLocalSearchParams<{ id?: string; guia?: string; chat?: string; reserva?: string }>();
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

  // Entrega estimada (mejora 4 «Ficha de confianza»): el código postal del perfil (su dirección predeterminada) o el que
  // escribe aquí el cliente solo para calcular (no se guarda). perfilListo evita contar «sin_cp» antes de leer el perfil.
  const [cpPerfil, setCpPerfil] = useState<string | null>(null);
  const [perfilListo, setPerfilListo] = useState(false);
  const [cpEscrito, setCpEscrito] = useState("");
  const [campoCp, setCampoCp] = useState(false);
  const [zonasEnvio, setZonasEnvio] = useState<ZonaEnvio[] | null>(null);
  const zonasPedidas = useRef(false);
  const entregasContadas = useRef(new Set<string>());

  const reqSeqRef = useRef(0);

  // Reservar con señal (mejora 14): la configuración pública (apagada → nada) y si el artículo ya está reservado.
  const [ajustesReserva, setAjustesReserva] = useState<AjustesReservaPublicos | null>(null);
  const reservadoSenalHasta = ajustesReserva?.reservado_hasta && Date.parse(ajustesReserva.reservado_hasta) > Date.now() ? ajustesReserva.reservado_hasta : null;

  const canBuy = useMemo(() => {
    if (!p) return false;
    if (!isAdmin) return p.status === "PUBLICADA" && p.isActive && !reservadoPorOtro && !reservadoSenalHasta;
    return true;
  }, [p, isAdmin, reservadoPorOtro, reservadoSenalHasta]);

  const loadedId = p?.id ?? null;
  useEffect(() => {
    if (!loadedId) return;
    let vivo = true;
    leerAjustesReserva(loadedId).then((a) => {
      if (vivo) setAjustesReserva(a);
    });
    return () => {
      vivo = false;
    };
  }, [loadedId]);
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

  // Debajo del título, solo lo que importa al cliente: el estado del artículo (petición del dueño: sin
  // «Disponible para compra» ni el número de fotos). El admin ve además que está en su vista.
  const heroSubcopy = useMemo(() => {
    if (!p) return "Ficha de producto";
    const estado = p.condition === "NEW" ? "Nuevo · unidad única" : `Segunda mano · ${labelCondition(p.condition)} · unidad única`;
    return isAdmin ? `${estado} · Vista admin` : estado;
  }, [p, isAdmin]);

  // Entrega estimada: el código postal de la dirección predeterminada del perfil (o el de siempre), solo con sesión.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        const uid = s.session?.user?.id;
        if (uid) {
          // select("*"): una sola petición que no falla aunque falte alguna columna del perfil.
          // (Compartida con «Completa tu perfil» si las dos la piden a la vez: lib/supabase.ts → filaPerfilCliente.)
          const { data } = await filaPerfilCliente(uid);
          if (vivo && data) {
            const fila = data as Record<string, unknown>;
            const lista = direccionesDeFila(fila);
            const pred = lista?.find((d) => d.predeterminada) ?? lista?.[0] ?? null;
            const cp = limpiarCodigoPostal(pred?.codigoPostal || (typeof fila.codigo_postal === "string" ? fila.codigo_postal : ""));
            setCpPerfil(cp.length === 5 ? cp : null);
          }
        }
      } catch {
        // Sin perfil: se enseñan las dos opciones.
      } finally {
        if (vivo) setPerfilListo(true);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const cpEscritoLimpio = limpiarCodigoPostal(cpEscrito);
  const cpActivo = cpEscritoLimpio.length === 5 ? cpEscritoLimpio : cpPerfil;
  const origenCp: "escrito" | "perfil" | null = cpEscritoLimpio.length === 5 ? "escrito" : cpPerfil ? "perfil" : null;
  // Las tarifas (zona «local» que edita el dueño) solo hacen falta con un código postal; una vez por visita.
  useEffect(() => {
    if (!cpActivo || zonasPedidas.current) return;
    zonasPedidas.current = true;
    cargarTarifas().then((z) => setZonasEnvio(z));
  }, [cpActivo]);
  const tipoEntrega: TipoEntregaEstimada = tipoEntregaPorCodigo(cpActivo, zonasEnvio);
  // Solo en lo que se puede comprar y enviar (lo que solo se entrega en mano ya lo explica su aviso).
  const conEntrega = !!p && !p.soloEntregaMano && p.status === "PUBLICADA" && p.isActive;
  const productoCargadoId = p?.id ?? null;
  useEffect(() => {
    if (!conEntrega || !perfilListo || !productoCargadoId || params.guia === "1") return;
    const clave = `${productoCargadoId}:${tipoEntrega}`;
    if (entregasContadas.current.has(clave)) return;
    entregasContadas.current.add(clave);
    // Sin el código postal en los datos: solo el tipo y de dónde salió.
    trackEvent("ficha_entrega_estimada", "Ficha: entrega estimada", {
      path: `/producto/${productoCargadoId}`,
      metadata: { tipo: tipoEntrega, origen: origenCp, productId: productoCargadoId },
    });
  }, [conEntrega, perfilListo, productoCargadoId, tipoEntrega, origenCp, params.guia]);

  // silencioso («Desliza para actualizar»): sin volver a la pantalla de carga y sin contar otra visita.
  async function loadProduct(silencioso = false) {
    const seq = ++reqSeqRef.current;

    if (!productId) {
      setErr("No hemos podido encontrar este producto.");
      setP(null);
      setSelectedImageUrl(null);
      setLoading(false);
      return;
    }

    if (!silencioso) {
      setLoading(true);
      setViewCount(null);
    }
    setErr(null);

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
        mantenimiento: productRow.mantenimiento,
        soloEntregaMano: productRow.solo_entrega_mano,
        revisado: productRow.revisado,
        garantiaMeses: productRow.garantia_meses,
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
      // «Vistos recientemente» de Inicio (solo en este dispositivo): lo que está a la venta pasa a ser el primero.
      if (mapped.status === "PUBLICADA" && mapped.isActive) void registrarVisto(mapped.id);

      adminPromise.then((adminFlag) => {
        if (seq !== reqSeqRef.current) return;
        setIsAdmin(adminFlag);
        if (adminFlag || params.guia === "1" || silencioso) return;

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

  // Carga rápida (mejora 7): la primera pantalla útil es la ficha ya pintada con su producto (una vez por visita).
  const fichaLista = !loading && !!p;
  useEffect(() => {
    if (fichaLista) medirCargaPantalla("producto");
  }, [fichaLista]);

  // «Desliza para actualizar»: precio, ficha, fotos… al día sin volver a la pantalla de carga.
  const recarga = useRecarga();
  useEffect(() => {
    if (recarga > 0) loadProduct(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recarga]);

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
      ...(sinEmojis(p.description) ? { description: sinEmojis(p.description) } : {}),
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
    // Uso del visor (Administración → Analítica → Recorrido principal). El zoom lo cuenta el propio visor.
    trackEvent("foto_ampliada", "Ficha: foto ampliada", { metadata: { fotos: lightboxImages.length } });
    // Ficha del producto (Analítica → «Ficha del producto (30 días)»): abrir, zoom y cerrar deslizando.
    trackEvent("ficha_foto_zoom", "Ficha: visor de fotos", { path: `/producto/${p?.id ?? ""}`, metadata: { accion: "abrir", fotos: lightboxImages.length } });
  }

  function eventoVisor(evento: EventoVisor, como?: string) {
    trackEvent("ficha_foto_zoom", "Ficha: visor de fotos", {
      path: `/producto/${p?.id ?? ""}`,
      metadata: evento === "zoom" ? { accion: "zoom", como: como ?? null } : { accion: "cerrar_deslizando" },
    });
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

  // Galería con muchas fotos (VeoAura manda hasta 30): posición actual («3 / 30»), miniaturas que solo se descargan
  // cuando van a verse (las demás esperan con su hueco) y la miniatura activa siempre a la vista.
  const fotoActual = Math.max(0, imageGallery.findIndex((m) => m.publicUrl === selectedImageUrl));
  const ladoMiniatura = isMobile ? 74 : 88;
  const pasoMiniatura = ladoMiniatura + 10;
  const miniaturasRef = useRef<ScrollView>(null);
  const [anchoMiniaturas, setAnchoMiniaturas] = useState(0);
  const [miniaturasCargadas, setMiniaturasCargadas] = useState(0);
  const cargarMiniaturasHasta = useCallback(
    (px: number) => setMiniaturasCargadas((v) => Math.max(v, Math.ceil(px / pasoMiniatura) + 3)),
    [pasoMiniatura]
  );
  useEffect(() => {
    if (!anchoMiniaturas || imageGallery.length < 2) return;
    const izquierda = fotoActual * pasoMiniatura;
    const destino = Math.max(0, izquierda - (anchoMiniaturas - ladoMiniatura) / 2);
    cargarMiniaturasHasta(destino + anchoMiniaturas);
    miniaturasRef.current?.scrollTo({ x: destino, animated: true });
  }, [fotoActual, anchoMiniaturas, pasoMiniatura, ladoMiniatura, imageGallery.length, cargarMiniaturasHasta]);

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
        // Directo al pago con SOLO este artículo (lo demás de la cesta se queda allí) y los datos del perfil ya puestos.
        // push (no replace): «atrás» vuelve a esta ficha.
        pushRoute(`/checkout?comprar=${encodeURIComponent(p.id)}` as Href);
      } else {
        pushRoute("/cesta" as Href);
      }
    } finally {
      setCartBusy(false);
    }
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
              onPress={() => loadProduct()}
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
                      // Carga rápida: la foto principal es la primera de la ficha (ya y con prioridad alta).
                      priority="high"
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

                {/* Con varias fotos: en qué foto se está y, en ordenador, flechas (en el móvil se desliza). */}
                {selectedImageUrl && imageGallery.length > 1 ? (
                  <View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      left: 12,
                      top: 12,
                      paddingVertical: 4,
                      paddingHorizontal: 10,
                      borderRadius: 999,
                      backgroundColor: "rgba(11,33,56,0.60)",
                    }}
                  >
                    <Text nativeID="galeria-posicion" style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 12 }}>
                      {fotoActual + 1} / {imageGallery.length}
                    </Text>
                  </View>
                ) : null}

                {selectedImageUrl && imageGallery.length > 1 && !isMobile
                  ? ([-1, 1] as const).map((paso) => (
                      <Pressable
                        key={paso}
                        onPress={() => stepImage(paso)}
                        accessibilityRole="button"
                        accessibilityLabel={paso < 0 ? "Foto anterior" : "Foto siguiente"}
                        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
                          position: "absolute",
                          top: "50%",
                          marginTop: -22,
                          [paso < 0 ? "left" : "right"]: 12,
                          width: 44,
                          height: 44,
                          borderRadius: 22,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: hovered ? "rgba(11,33,56,0.72)" : "rgba(11,33,56,0.48)",
                          opacity: pressed ? 0.85 : 1,
                        })}
                      >
                        <Ionicons name={paso < 0 ? "chevron-back" : "chevron-forward"} size={22} color="#FFFFFF" />
                      </Pressable>
                    ))
                  : null}

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
                    right: 4,
                    bottom: 4,
                    flexDirection: "row",
                    gap: 8,
                  }}
                >
                  {/* Zona táctil de 44 × 44 (grupo 3, 2026-11-12); el círculo visible sigue siendo de 32. */}
                  <Pressable
                    onPress={shareProduct}
                    accessibilityRole="button"
                    accessibilityLabel="Compartir este producto"
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.85 : 1,
                      width: 44,
                      height: 44,
                      alignItems: "center",
                      justifyContent: "center",
                    })}
                  >
                    <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(11,33,56,0.60)" }}>
                      <Ionicons name="share-social-outline" size={15} color="#FFFFFF" />
                    </View>
                  </Pressable>

                  <Pressable
                    onPress={toggleLike}
                    disabled={likeBusy}
                    accessibilityRole="button"
                    accessibilityLabel={liked ? "Quitar me gusta" : "Dar me gusta"}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.85 : 1,
                      minWidth: 44,
                      height: 44,
                      alignItems: "center",
                      justifyContent: "center",
                    })}
                  >
                    <View style={{ minWidth: 32, height: 32, borderRadius: 16, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: "rgba(11,33,56,0.60)" }}>
                      <Ionicons
                        name={liked ? "heart" : "heart-outline"}
                        size={15}
                        color={liked ? "#FF5A7A" : "#FFFFFF"}
                      />
                      <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: TAMANOS.minimo }}>
                        {likeCount}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              </View>

              {imageGallery.length > 1 ? (
                <ScrollView
                  ref={miniaturasRef}
                  nativeID="galeria-miniaturas"
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  // Miniaturas de ancho fijo: el carrusel encaja en cada una (ancho + hueco de 10).
                  snapToInterval={pasoMiniatura}
                  decelerationRate="fast"
                  onLayout={(e) => {
                    setAnchoMiniaturas(e.nativeEvent.layout.width);
                    cargarMiniaturasHasta(e.nativeEvent.layout.width);
                  }}
                  onScroll={(e) => cargarMiniaturasHasta(e.nativeEvent.contentOffset.x + e.nativeEvent.layoutMeasurement.width)}
                  scrollEventThrottle={64}
                  contentContainerStyle={{
                    gap: 10,
                    paddingTop: 10,
                    flexGrow: 1,
                    justifyContent: "center",
                  }}
                >
                  {imageGallery.map((media, i) => {
                    const active = selectedImageUrl === media.publicUrl;

                    return (
                      <Pressable
                        key={media.id}
                        onPress={() => setSelectedImageUrl(media.publicUrl)}
                        accessibilityRole="button"
                        accessibilityLabel={`Ver la foto ${i + 1} de ${imageGallery.length}`}
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.88 : 1,
                          width: ladoMiniatura,
                          height: ladoMiniatura,
                          borderRadius: 16,
                          overflow: "hidden",
                          borderWidth: 2,
                          borderColor: active ? COLORS.accent : "#E3EAF2",
                          backgroundColor: "#F6FAFD",
                        })}
                      >
                        {/* Carga diferida: solo las miniaturas que se ven (y unas pocas más) piden su foto. */}
                        {i < miniaturasCargadas ? (
                          <SmartImage
                            uri={media.publicUrl}
                            alt={`${p.title} (miniatura ${i + 1})`}
                            ancho={90}
                            contentFit="cover"
                            style={{ width: "100%", height: "100%" }}
                          />
                        ) : null}
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
                  {/* El estado («Segunda mano · … · unidad única») va ya debajo del título. */}
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

                {/* «Revisado por nuestro equipo» y la garantía: SOLO si el dueño lo ha marcado en este producto. */}
                <InsigniasConfianza revisado={p.revisado} garantiaMeses={p.garantiaMeses} />

                {/* Solo entrega en mano (dueño, 2026-11-07: los televisores sin su caja original no se envían). */}
                {p.soloEntregaMano ? (
                  <View nativeID="ficha-solo-mano" style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
                    <Ionicons name="hand-left-outline" size={16} color={COLORS.muted} />
                    <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: 13.5, lineHeight: 19, textAlign: "center", flexShrink: 1 }}>
                      Solo entrega en mano en Zaragoza o Cuarte de Huerva: sin su caja original no se puede enviar.
                    </Text>
                  </View>
                ) : null}

                {/* Entrega estimada con los plazos de siempre (nunca garantizada). */}
                {conEntrega ? (
                  <EntregaEstimadaFicha
                    tipo={tipoEntrega}
                    cp={cpActivo}
                    origen={origenCp}
                    campoAbierto={campoCp}
                    onAbrirCampo={() => setCampoCp(true)}
                    cpEscrito={cpEscrito}
                    onCpEscrito={(v) => setCpEscrito(v.replace(/[^0-9]/g, "").slice(0, 5))}
                    onIrPerfil={() => pushRoute("/perfil" as Href)}
                  />
                ) : null}

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

                {reservadoSenalHasta ? (
                  <Text
                    nativeID="ficha-reservado-senal"
                    style={{ color: COLORES_TEXTO.secundario, fontWeight: "800", fontSize: TAMANOS.minimo + 0.5, lineHeight: 19, textAlign: "center" }}
                  >
                    {/* Sin «señal»: también sale con las reservas apagadas (un artículo ya reservado no se ofrece). */}
                    Este artículo está reservado hasta el {fechaReserva(reservadoSenalHasta)}.
                  </Text>
                ) : null}

                <View style={{ gap: 10, width: "100%", maxWidth: 460 }}>
                  {/* Acción principal: una sola, clara. La secundaria, con contorno. */}
                  <Pressable
                    nativeID="ficha-comprar-ya"
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
                    nativeID="ficha-anadir-cesta"
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

                  {/* Reservar con señal (mejora 14): SOLO si la tienda la ha activado con sus reglas; apagada, nada. */}
                  {p.status === "PUBLICADA" && p.isActive && !reservadoPorOtro && !reservadoSenalHasta && ajustesReserva && reservaDisponible(ajustesReserva) ? (
                    <ReservarConSenal producto={{ id: p.id, titulo: p.title, precio: p.priceEUR }} ajustes={ajustesReserva} cancelada={params.reserva === "cancelada"} />
                  ) : null}

                  {/* Dudas (mejora 10): el chat de la tienda con este artículo adjunto; sin cuenta, invita a crearla. */}
                  <PreguntarArticulo productId={p.id} abrirAlEntrar={params.chat === "1"} />


                  {/* «Avísame si baja de precio» (solo con cuenta): en lo que se puede comprar. */}
                  {p.status === "PUBLICADA" && p.isActive ? <AvisoPrecioFicha productId={p.id} precio={p.priceEUR} /> : null}

                  {/* «Comparar con otros productos» (mejora 8): hasta 3, en este dispositivo; la barra de abajo lleva a /comparar. */}
                  {p.status === "PUBLICADA" && p.isActive ? (
                    <BotonComparar producto={{ id: p.id, titulo: p.title, precio: p.priceEUR, imagen: p.imageUrl }} origen="ficha" variante="ficha" />
                  ) : null}

                  {/* «Completa tu compra» (mejora 6): solo en consolas, como mucho 3 mandos o accesorios de su familia. */}
                  {p.status === "PUBLICADA" && p.isActive ? <CompletaTuCompra bases={[p.id]} origen="ficha" /> : null}
                </View>

                {/* Ficha técnica y mantenimiento de VeoAura y descripción: con más de una, un carrusel que se desliza
                    (y pasa solo cada 10 s); con solo la descripción, sin carrusel. */}
                <FichaProducto key={p.id} caracteristicas={p.caracteristicas} mantenimiento={p.mantenimiento} descripcion={p.description} />
              </View>
              {/* Las garantías y promesas las escribe la tienda en la descripción de cada producto; las insignias de
                  arriba solo salen si el dueño las marca en ese producto (nunca fijas para todos). */}
            </View>
          </View>

          {/* «Productos parecidos» (mejora 6): misma categoría y precio parecido; sin ninguno, no sale. */}
          <View style={{ width: "100%", paddingTop: isMobile ? 18 : 28 }}>
            <ProductosParecidos producto={{ id: p.id, categoriaId: p.category?.id ?? null, precio: p.priceEUR }} isMobile={isMobile} />
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
          {/* Hueco de la barra de «Comparar» (si se ve): el final de la ficha no queda debajo de ella. */}
          {alturaBarraComparar ? <View style={{ height: alturaBarraComparar }} /> : null}
          </View>
        </ScrollView>
      )}

      <ImageLightbox
        visible={lightboxOpen}
        images={lightboxImages}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxOpen(false)}
        onEvento={eventoVisor}
      />
    </View>
  );
}

// --- «Avísame si baja de precio» (mejora 5, aprobada por el dueño el 2026-11-14) ------------------------------------
// SOLO CON CUENTA (ventaja de registrarse, como los avisos de Blue). Con cuenta: interruptor de 44 px que guarda o quita el
// aviso en avisos_precio. Sin cuenta: al tocarlo explica la ventaja y lleva a crear la cuenta (y de vuelta a esta ficha).
// Sin la migración o con la lectura fallida no sale nada: nunca un «desactivado» que no se sabe.
const VOLVER_TRAS_ACCESO_FICHA_KEY = "videojuegoszaragoza:volver_tras_acceso";

// --- «Preguntar por este artículo» (mejora 10, aprobada por el dueño el 2026-11-15) --------------------------------------
// Con cuenta: abre el chat de la tienda de este producto (el que ya hay o uno nuevo) con la tarjeta del artículo arriba.
// Sin cuenta: explica la ventaja («te contestamos aquí y te avisamos») con «Crear cuenta gratis» y «Entrar»; al entrar vuelve
// a esta ficha con ?chat=1 (perfil.tsx, volver_tras_acceso) y abre el chat solo (abrirAlEntrar), una vez.
function PreguntarArticulo({ productId, abrirAlEntrar }: { productId: string; abrirAlEntrar: boolean }) {
  const [abriendo, setAbriendo] = useState(false);
  const [invitacion, setInvitacion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abiertoAlEntrar = useRef(false);

  const preguntar = useCallback(async () => {
    if (abriendo) return;
    setAbriendo(true);
    setError(null);
    try {
      const r = await abrirChatProducto(productId);
      if (r === "login") {
        setInvitacion(true);
        void trackEvent("chat_producto_invitacion", "Ficha: preguntar por el artículo sin cuenta", { path: `/producto/${productId}`, metadata: { productId } });
      }
    } catch {
      setError("No se ha podido abrir el chat. Inténtalo de nuevo.");
    } finally {
      setAbriendo(false);
    }
  }, [abriendo, productId]);

  // Vuelta tras crear la cuenta o entrar: abre el chat (si de verdad hay sesión) y quita ?chat=1 para no repetirlo.
  useEffect(() => {
    if (!abrirAlEntrar || abiertoAlEntrar.current) return;
    abiertoAlEntrar.current = true;
    router.setParams({ chat: undefined } as never);
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) void preguntar();
    });
  }, [abrirAlEntrar, preguntar]);

  const irAcceso = useCallback(
    (modo: "registro" | "entrar") => {
      marcarOrigenRegistro("chat_producto");
      AsyncStorage.setItem(VOLVER_TRAS_ACCESO_FICHA_KEY, JSON.stringify({ ruta: `/producto/${productId}?chat=1`, hasta: Date.now() + 30 * 60_000 })).catch(() => {});
      pushRoute(`/perfil?acceso=${modo}` as Href);
    },
    [productId]
  );

  return (
    <View style={{ gap: 8 }}>
      <Pressable
        nativeID="ficha-preguntar"
        onPress={preguntar}
        disabled={abriendo}
        accessibilityRole="button"
        accessibilityLabel="Preguntar por este artículo"
        style={({ pressed }) => ({
          opacity: pressed || abriendo ? 0.88 : 1,
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
        {abriendo ? <ActivityIndicator size="small" color={COLORS.accent} /> : <Ionicons name="chatbubble-ellipses-outline" size={16} color={COLORS.text} />}
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13.5 }}>Preguntar por este artículo</Text>
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: "#B91C1C", fontWeight: "800", fontSize: TAMANOS.minimo, textAlign: "center" }}>
          {error}
        </Text>
      ) : null}
      {invitacion ? (
        <View nativeID="ficha-chat-invitacion" style={{ alignItems: "center", gap: 8, borderRadius: 16, backgroundColor: COLORS.bg2, padding: 12 }}>
          <Text style={{ color: COLORES_TEXTO.texto, fontSize: TAMANOS.minimo, lineHeight: 19, textAlign: "center" }}>
            Pregunta con tu cuenta gratis: te contestamos aquí, con el artículo adjunto, y te avisamos cuando respondamos.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: TACTIL.separacion }}>
            <Pressable
              nativeID="ficha-chat-crear-cuenta"
              onPress={() => irAcceso("registro")}
              accessibilityRole="button"
              style={({ pressed }) => ({ minHeight: TACTIL.minimo, justifyContent: "center", paddingHorizontal: 20, borderRadius: 999, backgroundColor: COLORS.accentDark, opacity: pressed ? 0.85 : 1 })}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>Crear cuenta gratis</Text>
            </Pressable>
            <Pressable
              nativeID="ficha-chat-entrar"
              onPress={() => irAcceso("entrar")}
              accessibilityRole="button"
              style={({ pressed }) => ({ minHeight: TACTIL.minimo, justifyContent: "center", paddingHorizontal: 20, borderRadius: 999, borderWidth: 1.5, borderColor: COLORS.accent, backgroundColor: "#FFFFFF", opacity: pressed ? 0.85 : 1 })}
            >
              <Text style={{ color: colorTextoAzul(14), fontWeight: "900", fontSize: 14 }}>Entrar</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// --- Reservar con señal (mejora 14, aprobada por el dueño el 2026-11-15) ---------------------------------------------
// Solo sale si GET /api/pago?reserva=ajustes dice que está activa y completa (reglas del dueño y texto revisado por su
// gestor). La hoja enseña los días (hasta dias_max), el porcentaje y la señal de la escala, el vencimiento, el tipo de
// arras explicado, qué pasa al vencer y las condiciones completas, con la casilla OBLIGATORIA. «Pagar señal» solo manda el
// artículo y los días: el importe lo calcula el servidor con la base de datos. Solo con cuenta (sin cuenta, invita).
function ReservarConSenal({
  producto,
  ajustes,
  cancelada,
}: {
  producto: { id: string; titulo: string; precio: number };
  ajustes: AjustesReservaPublicos;
  cancelada: boolean;
}) {
  const escala = useMemo(() => ajustes.escala ?? [], [ajustes.escala]);
  const diasMax = Number(ajustes.dias_max ?? 0);
  const tipo = ajustes.tipo_arras ?? "penitenciales";
  const [abierto, setAbierto] = useState(false);
  const [conSesion, setConSesion] = useState<boolean | null>(null);
  const [invitacion, setInvitacion] = useState(false);
  const [dias, setDias] = useState(() => Math.max(1, Math.min(escala[0]?.hasta_dias ?? 1, diasMax || 1)));
  const [acepta, setAcepta] = useState(false);
  const [verCondiciones, setVerCondiciones] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(cancelada ? "Has cancelado el pago de la señal: el artículo no se ha reservado." : null);
  const { width } = useWindowDimensions();

  useEffect(() => {
    let vivo = true;
    supabase.auth
      .getSession()
      .then(({ data }) => vivo && setConSesion(!!data.session?.user))
      .catch(() => vivo && setConSesion(false));
    return () => {
      vivo = false;
    };
  }, []);

  const porcentaje = porcentajeReserva(escala, dias);
  const senal = porcentaje ? senalReserva(producto.precio, porcentaje) : 0;
  const vence = Date.now() + dias * 86_400_000;
  const arras = EXPLICACION_ARRAS[tipo];
  // Las marcas ({porcentaje}, {dias}…) rellenadas con lo elegido: lo mismo que guardará el servidor.
  const datosTexto = { porcentaje: porcentaje ?? 0, dias, vence, senal_eur: senal, precio_eur: producto.precio };
  const condiciones = rellenarCondicionesReserva(ajustes.texto_condiciones ?? "", datosTexto);
  const alVencer = rellenarCondicionesReserva(ajustes.al_vencer ?? "", datosTexto);

  const abrir = useCallback(() => {
    if (conSesion === false) {
      setInvitacion((v) => !v);
      return;
    }
    setAbierto(true);
    void trackEvent("reserva_abierta", "Ficha: reservar con señal", { path: `/producto/${producto.id}`, metadata: { productId: producto.id } });
  }, [conSesion, producto.id]);

  const crearCuenta = useCallback(() => {
    marcarOrigenRegistro("reserva_senal");
    AsyncStorage.setItem(VOLVER_TRAS_ACCESO_FICHA_KEY, JSON.stringify({ ruta: `/producto/${producto.id}`, hasta: Date.now() + 30 * 60_000 })).catch(() => {});
    pushRoute("/perfil?acceso=registro" as Href);
  }, [producto.id]);

  const pagar = useCallback(async () => {
    if (!acepta || enviando || !porcentaje) return;
    setEnviando(true);
    setError(null);
    void trackEvent("reserva_pagar", "Ficha: pagar la señal", { path: `/producto/${producto.id}`, metadata: { dias, porcentaje } });
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setError("Inicia sesión para reservar.");
        return;
      }
      // Solo el artículo, los días y que acepta: el importe lo calcula el servidor.
      const r = await fetch(URL_PAGO, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ accion: "reserva", producto: producto.id, dias, acepta: true }),
      });
      const d = (await r.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;
      if (r.ok && d?.url && /^https:\/\/checkout\.stripe\.com\//.test(d.url)) {
        if (Platform.OS === "web" && typeof window !== "undefined") window.location.assign(d.url);
        else await Linking.openURL(d.url);
        return;
      }
      const motivo = d?.error ? `${d.error.charAt(0).toUpperCase()}${d.error.slice(1)}.` : "No se ha podido abrir el pago. Inténtalo de nuevo.";
      setError(motivo);
    } catch {
      setError("No se ha podido abrir el pago: revisa tu conexión.");
    } finally {
      setEnviando(false);
    }
  }, [acepta, enviando, porcentaje, producto.id, dias]);

  const boton = (props: { id: string; texto: string; onPress: () => void; disabled?: boolean; icono: React.ComponentProps<typeof Ionicons>["name"] }) => (
    <Pressable
      nativeID={props.id}
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityLabel={props.texto}
      style={({ pressed }) => ({
        width: TACTIL.minimo,
        height: TACTIL.minimo,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: COLORS.border,
        alignItems: "center",
        justifyContent: "center",
        opacity: props.disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={props.icono} size={20} color={COLORS.text} />
    </Pressable>
  );

  return (
    <View nativeID="ficha-reserva-senal" style={{ gap: 8, alignItems: "stretch" }}>
      <Pressable
        nativeID="ficha-reservar-senal"
        onPress={abrir}
        accessibilityRole="button"
        accessibilityLabel={`Reservar con señal ${producto.titulo}`}
        style={({ pressed }) => ({
          minHeight: TACTIL.minimo,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingHorizontal: 14,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: "#FFFFFF",
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Ionicons name="calendar-outline" size={16} color={COLORS.text} />
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13.5 }}>Reservar con señal</Text>
      </Pressable>
      {error && !abierto ? (
        <Text nativeID="ficha-reserva-aviso" style={{ color: COLORES_TEXTO.secundario, fontSize: TAMANOS.minimo, lineHeight: 18, textAlign: "center" }}>
          {error}
        </Text>
      ) : null}
      {conSesion === false && invitacion ? (
        <View nativeID="ficha-reserva-invitacion" style={{ alignItems: "center", gap: 8 }}>
          <Text style={{ color: COLORES_TEXTO.texto, fontSize: TAMANOS.minimo, lineHeight: 19, textAlign: "center" }}>
            Las reservas con señal son solo con cuenta: créala gratis y podrás apartar este artículo y seguir tu reserva en Mis pedidos.
          </Text>
          <Pressable
            nativeID="ficha-reserva-crear-cuenta"
            onPress={crearCuenta}
            accessibilityRole="button"
            style={({ pressed }) => ({ minHeight: TACTIL.minimo, justifyContent: "center", paddingHorizontal: 20, borderRadius: 999, backgroundColor: COLORS.accentDark, opacity: pressed ? 0.85 : 1 })}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>Crear cuenta gratis</Text>
          </Pressable>
        </View>
      ) : null}

      <Modal visible={abierto} transparent animationType="fade" onRequestClose={() => setAbierto(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(11,33,56,0.45)", justifyContent: width >= 700 ? "center" : "flex-end", alignItems: "center" }}>
          <View
            nativeID="reserva-hoja"
            style={{
              width: "100%",
              maxWidth: 520,
              maxHeight: "92%",
              backgroundColor: "#FFFFFF",
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              borderBottomLeftRadius: width >= 700 ? 22 : 0,
              borderBottomRightRadius: width >= 700 ? 22 : 0,
            }}
          >
            <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ flex: 1, color: COLORS.text, fontWeight: "900", fontSize: 18 }}>Reservar con señal</Text>
                <Pressable
                  nativeID="reserva-cerrar"
                  onPress={() => setAbierto(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar"
                  style={({ pressed }) => ({ width: TACTIL.minimo, height: TACTIL.minimo, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
                >
                  <Ionicons name="close" size={24} color={COLORS.text} />
                </Pressable>
              </View>
              <Text style={{ color: COLORES_TEXTO.secundario, fontSize: TAMANOS.minimo + 0.5, lineHeight: 19 }} numberOfLines={2}>
                {producto.titulo} · {eurosReserva(producto.precio)}
              </Text>

              <View style={{ gap: 6 }}>
                <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 14 }}>¿Cuántos días quieres reservarlo?</Text>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14 }}>
                  {boton({ id: "reserva-dias-menos", texto: "Un día menos", icono: "remove", onPress: () => setDias((d) => Math.max(1, d - 1)), disabled: dias <= 1 })}
                  <Text nativeID="reserva-dias-valor" style={{ minWidth: 96, textAlign: "center", color: COLORS.text, fontWeight: "900", fontSize: 18 }}>
                    {dias} {dias === 1 ? "día" : "días"}
                  </Text>
                  {boton({ id: "reserva-dias-mas", texto: "Un día más", icono: "add", onPress: () => setDias((d) => Math.min(diasMax, d + 1)), disabled: dias >= diasMax })}
                </View>
                <Text style={{ color: COLORES_TEXTO.secundario, fontSize: TAMANOS.minimo, textAlign: "center" }}>Como mucho {diasMax} días.</Text>
              </View>

              <View nativeID="reserva-calculo" style={{ borderRadius: 16, backgroundColor: COLORS.card, padding: 12, gap: 4 }}>
                <Text nativeID="reserva-senal" style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>
                  {porcentaje ? `Señal: ${porcentaje} % · ${eurosReserva(senal)}` : "Elige los días"}
                </Text>
                <Text nativeID="reserva-vence" style={{ color: COLORES_TEXTO.texto, fontSize: TAMANOS.minimo + 0.5, lineHeight: 19, textAlign: "center" }}>
                  Vence el {fechaReserva(vence)} si pagas hoy.
                </Text>
                {porcentaje ? (
                  <Text style={{ color: COLORES_TEXTO.secundario, fontSize: TAMANOS.minimo, lineHeight: 18, textAlign: "center" }}>
                    El resto ({eurosReserva(Math.round((producto.precio - senal) * 100) / 100)}) se paga al completar la compra.
                  </Text>
                ) : null}
              </View>

              <View nativeID="reserva-arras" style={{ gap: 4 }}>
                <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 14 }}>{arras.titulo}</Text>
                <Text style={{ color: COLORES_TEXTO.texto, fontSize: TAMANOS.minimo + 0.5, lineHeight: 20 }}>{arras.texto}</Text>
              </View>
              <View nativeID="reserva-al-vencer" style={{ gap: 4 }}>
                <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 14 }}>Qué pasa al vencer</Text>
                <Text style={{ color: COLORES_TEXTO.texto, fontSize: TAMANOS.minimo + 0.5, lineHeight: 20 }}>{alVencer}</Text>
              </View>

              <Pressable
                nativeID="reserva-condiciones-ver"
                onPress={() => setVerCondiciones((v) => !v)}
                accessibilityRole="button"
                style={({ pressed }) => ({ minHeight: TACTIL.minimo, justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={{ color: colorTextoAzul(14), fontWeight: "800", fontSize: 14 }}>
                  {verCondiciones ? "Ocultar las condiciones completas" : "Leer las condiciones completas"}
                </Text>
              </Pressable>
              {verCondiciones ? (
                <Text nativeID="reserva-condiciones-texto" style={{ color: COLORES_TEXTO.texto, fontSize: TAMANOS.minimo + 0.5, lineHeight: 20 }}>
                  {condiciones}
                </Text>
              ) : null}

              <Pressable
                nativeID="reserva-acepta"
                onPress={() => setAcepta((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: acepta }}
                aria-checked={acepta}
                style={({ pressed }) => ({ minHeight: TACTIL.minimo, flexDirection: "row", alignItems: "center", gap: 10, opacity: pressed ? 0.8 : 1 })}
              >
                <Ionicons name={acepta ? "checkbox" : "square-outline"} size={24} color={acepta ? COLORS.accent : COLORS.text} />
                <Text style={{ flex: 1, color: COLORS.text, fontWeight: "700", fontSize: 14, lineHeight: 20 }}>
                  He leído y acepto las condiciones de la reserva
                </Text>
              </Pressable>

              {error ? (
                <Text nativeID="reserva-error" style={{ color: "#B91C1C", fontWeight: "800", fontSize: 14, lineHeight: 20, textAlign: "center" }}>
                  {error}
                </Text>
              ) : null}

              <Pressable
                nativeID="reserva-pagar"
                onPress={pagar}
                disabled={!acepta || enviando || !porcentaje}
                accessibilityRole="button"
                accessibilityState={{ disabled: !acepta || enviando || !porcentaje }}
                style={({ pressed }) => ({
                  minHeight: 52,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: COLORS.accentDark,
                  opacity: !acepta || !porcentaje ? 0.45 : pressed || enviando ? 0.85 : 1,
                })}
              >
                {enviando ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>{porcentaje ? `Pagar señal · ${eurosReserva(senal)}` : "Pagar señal"}</Text>
                )}
              </Pressable>
              <Text style={{ color: COLORES_TEXTO.secundario, fontSize: TAMANOS.minimo, lineHeight: 18, textAlign: "center" }}>
                Se paga en la página segura de Stripe. Podrás seguir tu reserva en Mis pedidos.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function AvisoPrecioFicha({ productId, precio }: { productId: string; precio: number }) {
  // "cargando" | "sin_cuenta" | "no" (sin migración o error de lectura: no se ofrece) | "listo"
  const [estado, setEstado] = useState<"cargando" | "sin_cuenta" | "no" | "listo">("cargando");
  const [activo, setActivo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [invitacion, setInvitacion] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const leer = useCallback(async () => {
    try {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session?.user) {
        setEstado("sin_cuenta");
        return;
      }
      const lista = await misAvisosPrecio();
      if (!lista) {
        setEstado("no");
        return;
      }
      setActivo(lista.some((a) => a.product_id === productId));
      setEstado("listo");
    } catch {
      setEstado("no");
    }
  }, [productId]);

  useEffect(() => {
    leer();
    // Al entrar o salir de la cuenta se vuelve a mirar; con cada renovación del token, nada (sesión estable).
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_IN" || evento === "SIGNED_OUT" || evento === "USER_UPDATED") leer();
    });
    return () => data?.subscription?.unsubscribe?.();
  }, [leer]);

  const alternar = useCallback(async () => {
    if (ocupado) return;
    if (estado === "sin_cuenta") {
      setInvitacion((v) => !v);
      if (!invitacion) void trackEvent("aviso_precio_invitacion", "Ficha: aviso de precio sin cuenta", { metadata: { productId } });
      return;
    }
    if (estado !== "listo") return;
    const nuevo = !activo;
    setOcupado(true);
    setMensaje(null);
    setActivo(nuevo);
    const r = await fijarAvisoPrecio(productId, nuevo);
    setOcupado(false);
    if (r === "ok") {
      setMensaje(nuevo ? "Hecho: Blue te avisará si baja de precio." : "Aviso quitado.");
      void trackEvent(nuevo ? "aviso_precio_activado" : "aviso_precio_desactivado", nuevo ? "Aviso de precio: activado" : "Aviso de precio: desactivado", {
        path: `/producto/${productId}`,
        metadata: { productId },
      });
    } else {
      setActivo(!nuevo);
      setMensaje(r === "limite" ? "Ya tienes 50 avisos de precio: quita alguno en Mi perfil." : r === "sin_sesion" ? "Inicia sesión para activar el aviso." : "No se ha podido guardar. Inténtalo de nuevo.");
    }
  }, [ocupado, estado, activo, invitacion, productId]);

  const crearCuenta = useCallback(() => {
    void trackEvent("aviso_precio_crear_cuenta", "Ficha: crear cuenta por el aviso de precio", { metadata: { productId } });
    marcarOrigenRegistro("aviso_precio");
    AsyncStorage.setItem(VOLVER_TRAS_ACCESO_FICHA_KEY, JSON.stringify({ ruta: `/producto/${productId}`, hasta: Date.now() + 30 * 60_000 })).catch(() => {});
    pushRoute("/perfil?acceso=registro" as Href);
  }, [productId]);

  if (estado === "cargando" || estado === "no" || !(precio > 0)) return null;
  const encendido = estado === "listo" && activo;
  return (
    <View nativeID="ficha-aviso-precio" style={{ gap: 8, alignItems: "stretch" }}>
      <Pressable
        nativeID="ficha-aviso-precio-boton"
        onPress={alternar}
        disabled={ocupado}
        accessibilityRole="switch"
        accessibilityState={{ checked: encendido, disabled: ocupado }}
        aria-checked={encendido}
        accessibilityLabel="Avísame si baja de precio"
        style={({ pressed }) => ({
          minHeight: TACTIL.minimo,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingHorizontal: 14,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: encendido ? COLORS.accentBorder : COLORS.border,
          backgroundColor: encendido ? COLORS.accent2 : "#FFFFFF",
          opacity: pressed || ocupado ? 0.85 : 1,
        })}
      >
        <Ionicons name={encendido ? "notifications" : "notifications-outline"} size={16} color={encendido ? COLORS.accent : COLORS.text} />
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13.5, flexShrink: 1 }}>Avísame si baja de precio</Text>
        {/* El interruptor dibujado (todo el botón es el que se toca). */}
        <View style={{ width: 34, height: 20, borderRadius: 10, padding: 2, backgroundColor: encendido ? COLORS.accent : "#CBD5E1", alignItems: encendido ? "flex-end" : "flex-start" }}>
          <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: "#FFFFFF" }} />
        </View>
      </Pressable>
      {estado === "sin_cuenta" && invitacion ? (
        <View nativeID="ficha-aviso-precio-invitacion" style={{ alignItems: "center", gap: 8 }}>
          <Text style={{ color: COLORES_TEXTO.texto, fontSize: TAMANOS.minimo, lineHeight: 19, textAlign: "center" }}>
            Los avisos de precio son solo con cuenta: créala gratis y Blue te avisará si este artículo baja de precio.
          </Text>
          <Pressable
            nativeID="ficha-aviso-precio-crear-cuenta"
            onPress={crearCuenta}
            accessibilityRole="button"
            style={({ pressed }) => ({ minHeight: TACTIL.minimo, justifyContent: "center", paddingHorizontal: 20, borderRadius: 999, backgroundColor: COLORS.accentDark, opacity: pressed ? 0.85 : 1 })}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>Crear cuenta gratis</Text>
          </Pressable>
        </View>
      ) : null}
      {mensaje ? (
        <Text nativeID="ficha-aviso-precio-mensaje" style={{ color: COLORES_TEXTO.secundario, fontSize: TAMANOS.minimo, lineHeight: 18, textAlign: "center" }}>
          {mensaje}
        </Text>
      ) : null}
    </View>
  );
}

// --- Ficha de confianza (mejora 4, aprobada por el dueño el 2026-11-14) -------------------------------------------
// «Revisado por nuestro equipo» y «Garantía de N meses» los marca el dueño en cada producto (Administración → Productos,
// migración 20261114140000): si no lo ha marcado, no se enseña nada (ninguna promesa por defecto). La entrega estimada usa
// los plazos de siempre (lib/envio.ts → entregaEstimada) y siempre dice «estimada».

const VERDE_CONFIANZA = "#15803D";

function InsigniasConfianza({ revisado, garantiaMeses }: { revisado: boolean; garantiaMeses: number | null }) {
  if (!revisado && !garantiaMeses) return null;
  const chip = {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 32,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#CDEBD6",
    backgroundColor: "#F1FAF4",
    flexShrink: 1,
  } as const;
  const texto = { color: COLORES_TEXTO.texto, fontWeight: "800", fontSize: TAMANOS.minimo + 0.5, lineHeight: 18, flexShrink: 1 } as const;
  return (
    <View nativeID="ficha-confianza" style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, maxWidth: "100%" }}>
      {revisado ? (
        <View nativeID="ficha-revisado" style={chip}>
          <Ionicons name="checkmark-circle" size={16} color={VERDE_CONFIANZA} />
          <Text style={texto}>Revisado por nuestro equipo</Text>
        </View>
      ) : null}
      {garantiaMeses ? (
        <View nativeID="ficha-garantia" style={chip}>
          <Ionicons name="shield-checkmark-outline" size={16} color={VERDE_CONFIANZA} />
          <Text style={texto}>
            Garantía de {garantiaMeses} {garantiaMeses === 1 ? "mes" : "meses"}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function EntregaEstimadaFicha({
  tipo,
  cp,
  origen,
  campoAbierto,
  onAbrirCampo,
  cpEscrito,
  onCpEscrito,
  onIrPerfil,
}: {
  tipo: TipoEntregaEstimada;
  cp: string | null;
  origen: "escrito" | "perfil" | null;
  campoAbierto: boolean;
  onAbrirCampo: () => void;
  cpEscrito: string;
  onCpEscrito: (v: string) => void;
  onIrPerfil: () => void;
}) {
  const azul = colorTextoAzul(14);
  // Las franjas del dueño (dueño, 2026-11-15): «Llega hoy entre las 17:15 y las 19:00 si lo pides antes de las 16:30».
  const [, setFranjasCargadas] = useState(false);
  useEffect(() => {
    let vivo = true;
    cargarAjustesFranjas().then(() => {
      if (vivo) setFranjasCargadas(true);
    });
    return () => {
      vivo = false;
    };
  }, []);
  const enlace = (texto: string, onPress: () => void, id: string) => (
    <Pressable
      nativeID={id}
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({ minHeight: TACTIL.minimo, justifyContent: "center", paddingHorizontal: 4, opacity: pressed ? 0.7 : 1 })}
    >
      <Text style={{ color: azul, fontWeight: "900", fontSize: 14, textDecorationLine: "underline" }}>{texto}</Text>
    </Pressable>
  );
  const textoTitulo = { color: COLORES_TEXTO.texto, fontWeight: "900", fontSize: TAMANOS.cuerpo, lineHeight: 20, flexShrink: 1 } as const;
  const textoDetalle = { color: COLORES_TEXTO.secundario, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 18 } as const;

  let cuerpo: React.ReactNode;
  if (tipo === "sin_cp") {
    const local = entregaEstimada("mismo_dia").titulo ?? "";
    const resto = entregaEstimada("peninsula").titulo ?? "";
    const enMinuscula = (t: string) => t.replace(/^Llega/, "llega");
    cuerpo = (
      <>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="cube-outline" size={18} color={COLORES_TEXTO.texto} />
          <Text nativeID="ficha-entrega-titulo" style={textoTitulo}>
            Entrega estimada
          </Text>
        </View>
        <Text nativeID="ficha-entrega-local" style={{ ...textoDetalle, color: COLORES_TEXTO.texto }}>
          Zaragoza y Cuarte de Huerva: {enMinuscula(local)}
        </Text>
        <Text nativeID="ficha-entrega-resto" style={{ ...textoDetalle, color: COLORES_TEXTO.texto }}>
          Resto de España: {enMinuscula(resto)}
        </Text>
        <Text nativeID="ficha-entrega-detalle" style={textoDetalle}>
          Si lo pides hoy, sin contar domingos.
        </Text>
      </>
    );
  } else {
    const e = entregaEstimada(tipo);
    cuerpo = (
      <>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons
            name={tipo === "mismo_dia" ? "bicycle-outline" : tipo === "peninsula" ? "cube-outline" : "information-circle-outline"}
            size={18}
            color={COLORES_TEXTO.texto}
          />
          <Text nativeID="ficha-entrega-titulo" style={textoTitulo}>
            {e.titulo ?? "Entrega estimada"}
          </Text>
        </View>
        <Text nativeID="ficha-entrega-detalle" style={textoDetalle}>
          {e.detalle}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 4 }}>
          <Text nativeID="ficha-entrega-cp-actual" style={textoDetalle}>
            Código postal {cp}
            {origen === "perfil" ? " (de tu perfil)" : ""} ·
          </Text>
          {campoAbierto ? null : enlace("Cambiar", onAbrirCampo, "ficha-entrega-cambiar")}
        </View>
      </>
    );
  }

  return (
    <View
      nativeID="ficha-entrega"
      {...({ dataSet: { tipo } } as object)}
      style={{
        width: "100%",
        maxWidth: 460,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.bg2,
        paddingVertical: 12,
        paddingHorizontal: 14,
        gap: 6,
      }}
    >
      {cuerpo}
      {tipo === "sin_cp" && !campoAbierto ? enlace("Indica tu código postal", onAbrirCampo, "ficha-entrega-cp-boton") : null}
      {campoAbierto ? (
        <View style={{ gap: 4, marginTop: 4 }}>
          <TextInput
            nativeID="ficha-entrega-cp"
            value={cpEscrito}
            onChangeText={onCpEscrito}
            placeholder="Código postal (5 cifras)"
            placeholderTextColor="rgba(11,33,56,0.45)"
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={5}
            autoComplete="postal-code"
            accessibilityLabel="Código postal para calcular la entrega"
            style={{
              height: CAMPO.alto,
              fontSize: CAMPO.letra,
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: 12,
              paddingHorizontal: 12,
              color: COLORES_TEXTO.texto,
              backgroundColor: "#FFFFFF",
            }}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 4 }}>
            <Text style={textoDetalle}>Solo para calcular la entrega: no se guarda.</Text>
            {enlace("Guárdalo en Mi perfil", onIrPerfil, "ficha-entrega-perfil")}
          </View>
        </View>
      ) : null}
    </View>
  );
}

// --- Ficha: «Características», «Mantenimiento básico realizado» y «Descripción» ----------------------------------
// Con más de una, son pantallas de un carrusel horizontal: se pasa de una a otra deslizando el dedo (en la web, el
// desplazamiento con «encaje» por páginas), o con las pestañas de arriba (ratón y teclado); los puntos de debajo dicen
// en cuál se está y se van llenando mientras corre el pase automático (una pantalla cada 10 s, solo con el carrusel a
// la vista; se para mientras el dedo o el ratón están encima, con la pestaña del navegador oculta y con «reducir
// movimiento»; el botón de pausa lo detiene). Cuando el cliente cambia de pantalla él mismo, el pase automático se
// acaba y, a los 3 s, la página se recoloca sola para que la pantalla nueva se lea entera (salvo que el cliente ya se
// esté moviendo). Con solo la descripción, sin carrusel. Todo el texto con <Text> (nunca HTML).

const VERDE_OK = "#16A34A";
const PASE_MS = 10_000;
const RECOLOCAR_MS = 3_000;
const PISTA_PASE = "rgba(30,167,232,0.22)";

type PantallaFicha = "caracteristicas" | "mantenimiento" | "descripcion";

// Mueve con suavidad el contenedor con scroll de la página (el primero hacia arriba que se desplaza en vertical): si la
// ficha cabe, la deja entera y centrada; si no cabe, deja las pestañas arriba. Si ya se lee bien, no mueve nada. Web.
function recolocarParaLeer(nodo: HTMLElement, suave: boolean) {
  let contenedor: HTMLElement | null = null;
  for (let n = nodo.parentElement; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 1) {
      contenedor = n;
      break;
    }
  }
  const caja = contenedor ? contenedor.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  const arriba = Math.max(caja.top, 0) + 12;
  const abajo = Math.min(caja.bottom, window.innerHeight) - 24;
  const r = nodo.getBoundingClientRect();
  let mover = 0;
  if (r.height <= abajo - arriba) {
    if (r.top < arriba || r.bottom > abajo) mover = r.top - (arriba + (abajo - arriba - r.height) / 2);
  } else if (Math.abs(r.top - arriba) > 24) {
    mover = r.top - arriba;
  }
  if (Math.abs(mover) < 2) return;
  (contenedor ?? window).scrollBy({ top: mover, behavior: suave ? "smooth" : "auto" });
}

const SIN_DESCRIPCION_PRODUCTO =
  "Todavía no hay una descripción disponible para este producto. Aun así, puedes preguntarnos por su estado, contenido, compatibilidad o disponibilidad por el chat.";

// La descripción se enseña sin emojis aunque el dueño los escriba en el panel (sinEmojis; dueño, 2026-11-04).
function BloqueDescripcion({ descripcion, sinDescripcion }: { descripcion: string | null; sinDescripcion: string }) {
  const texto = sinEmojis(descripcion);
  return texto ? (
    <Text style={{ color: COLORS.muted, lineHeight: 22, textAlign: "center" }}>{texto}</Text>
  ) : (
    <Text style={{ color: COLORS.muted2, lineHeight: 22, textAlign: "center" }}>{sinDescripcion}</Text>
  );
}

function ListaPares({ pares }: { pares: Caracteristica[] }) {
  return (
    <View style={{ width: "100%" }}>
      {pares.map((c, i) => (
        <View
          key={`${i}-${c.etiqueta}`}
          accessible
          accessibilityLabel={`${c.etiqueta}: ${c.valor}`}
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 12,
            paddingVertical: 9,
            borderBottomWidth: i === pares.length - 1 ? 0 : 1,
            borderBottomColor: COLORS.borderSoft,
          }}
        >
          <Text style={{ flex: 1, color: COLORS.muted, fontWeight: "700", fontSize: 14, lineHeight: 20 }}>{c.etiqueta}</Text>
          <Text style={{ flex: 1, color: COLORS.text, fontWeight: "800", fontSize: 14, lineHeight: 20, textAlign: "right" }}>{c.valor}</Text>
        </View>
      ))}
    </View>
  );
}

// ✓ verde para «Sí»/«Completo»; indicador neutro para «Parcial» y «No»; el resto, solo el texto.
function iconoPunto(valor: string): { nombre: React.ComponentProps<typeof Ionicons>["name"]; color: string } | null {
  const v = valor.trim().toLowerCase();
  if (v === "sí" || v === "si" || v === "completo" || v === "completa") return { nombre: "checkmark-circle", color: VERDE_OK };
  if (v === "parcial") return { nombre: "contrast-outline", color: COLORS.muted };
  if (v === "no") return { nombre: "remove-circle-outline", color: COLORS.muted };
  return null;
}

// La pestaña dice «Mantenimiento» (tres pestañas caben así en el móvil); el título que envía VeoAura va aquí.
function BloqueMantenimiento({ m }: { m: Mantenimiento }) {
  return (
    <View style={{ width: "100%", gap: 10 }}>
      <Text accessibilityRole="header" {...({ "aria-level": 3 } as object)} style={{ color: COLORS.text, fontWeight: "900", fontSize: 15, lineHeight: 21, textAlign: "center" }}>
        {m.titulo}
      </Text>
      {!!m.nota && (
        <Text style={{ color: COLORS.muted, fontSize: 13.5, lineHeight: 20, textAlign: "center" }}>{m.nota}</Text>
      )}
      <View style={{ width: "100%" }}>
        {m.puntos.map((pt, i) => {
          const icono = iconoPunto(pt.valor);
          return (
            <View
              key={`${i}-${pt.etiqueta}`}
              accessible
              accessibilityLabel={`${pt.etiqueta}: ${pt.valor}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingVertical: 9,
                borderBottomWidth: i === m.puntos.length - 1 ? 0 : 1,
                borderBottomColor: COLORS.borderSoft,
              }}
            >
              <Text style={{ flex: 1, color: COLORS.muted, fontWeight: "700", fontSize: 14, lineHeight: 20 }}>{pt.etiqueta}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {icono && <Ionicons name={icono.nombre} size={18} color={icono.color} />}
                <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 14, lineHeight: 20 }}>{pt.valor}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// También la usa la ficha de servicio (app/servicio/[id].tsx, mismo formato que la de producto): «prefijo» da los id
// de sus partes (#servicio-ficha-carrusel…) y «sinDescripcion», el texto cuando no hay descripción.
export function FichaProducto({
  caracteristicas,
  mantenimiento,
  descripcion,
  prefijo = "producto",
  sinDescripcion = SIN_DESCRIPCION_PRODUCTO,
}: {
  caracteristicas: Caracteristica[];
  mantenimiento: Mantenimiento | null;
  descripcion: string | null;
  prefijo?: "producto" | "servicio";
  sinDescripcion?: string;
}) {
  const pantallas: PantallaFicha[] = [];
  if (caracteristicas.length) pantallas.push("caracteristicas");
  if (mantenimiento) pantallas.push("mantenimiento");
  pantallas.push("descripcion");
  const total = pantallas.length;
  const varias = total > 1;
  const web = Platform.OS === "web" && typeof window !== "undefined";

  const { width: anchoVentana } = useWindowDimensions();
  const [ancho, setAncho] = useState(0);
  const [activaGuardada, setActiva] = useState(0);
  const activa = Math.min(activaGuardada, total - 1);
  const [altos, setAltos] = useState<number[]>([]);
  const [parado, setParado] = useState(false); // pase automático detenido (por el cliente o por «reducir movimiento»)
  const [listo, setListo] = useState(false); // ya se sabe si el dispositivo pide «reducir movimiento»
  const [suave, setSuave] = useState(true);
  const [enPausa, setEnPausa] = useState(false); // dedo o ratón encima, o pestaña del navegador oculta
  const [aLaVista, setALaVista] = useState(!web);
  const cajaRef = useRef<View>(null);
  const paginasRef = useRef<View>(null);
  const carruselRef = useRef<ScrollView>(null);
  const anchoRef = useRef(0);
  const activaRef = useRef(activa);
  const suaveRef = useRef(true);
  const destinoRef = useRef<number | null>(null); // pantalla a la que va un desplazamiento hecho por código
  const destinoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelarRecolocar = useRef<(() => void) | null>(null);
  const [progreso] = useState(() => new Animated.Value(0));
  const restante = useRef(PASE_MS);

  useEffect(() => {
    let vivo = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reducir) => {
        if (!vivo) return;
        if (reducir) {
          setParado(true);
          setSuave(false);
          suaveRef.current = false;
        }
        setListo(true);
      })
      .catch(() => {
        if (vivo) setListo(true);
      });
    return () => {
      vivo = false;
    };
  }, []);

  // Cada pantalla, SIEMPRE entera en su sitio (dueño, 2026-11-04: al pasar de «Características» a «Descripción» se
  // quedaba a medias y había que acomodarla con el dedo). En el iPhone el deslizamiento animado se corta a veces (a la
  // vez cambia el alto del carrusel) y el dedo puede soltarlo entre dos pantallas: al pararse, se coloca en la que toca.
  const dedoRef = useRef(false);
  const totalRef = useRef(total);
  totalRef.current = total;
  const encajarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paradaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Dónde está de verdad el carrusel (en la web, el nodo que se desplaza; fuera de la web no hace falta).
  const xActual = useCallback((): number | null => {
    const nodo = (carruselRef.current as unknown as { getScrollableNode?: () => HTMLElement | null } | null)?.getScrollableNode?.();
    return nodo && typeof nodo.scrollLeft === "number" ? nodo.scrollLeft : null;
  }, []);
  // Si se quedó a medias, la pantalla «i» se coloca exacta, sin animación.
  const encajar = useCallback(
    (i: number) => {
      const x = xActual();
      const objetivo = i * anchoRef.current;
      if (x === null || Math.abs(x - objetivo) <= 1) return;
      destinoRef.current = i;
      carruselRef.current?.scrollTo({ x: objetivo, animated: false });
    },
    [xActual]
  );

  const moverA = useCallback(
    (i: number) => {
      destinoRef.current = i;
      if (destinoTimer.current) clearTimeout(destinoTimer.current);
      destinoTimer.current = setTimeout(() => {
        destinoRef.current = null;
      }, 1200);
      carruselRef.current?.scrollTo({ x: i * anchoRef.current, animated: suaveRef.current });
      // El deslizamiento animado tarda unos 300-500 ms: después se comprueba que llegó y, si no, se encaja.
      if (encajarTimer.current) clearTimeout(encajarTimer.current);
      encajarTimer.current = setTimeout(() => {
        encajarTimer.current = null;
        encajar(i);
      }, 650);
    },
    [encajar]
  );

  // Al dejar de desplazarse (y sin el dedo encima), si el carrusel está entre dos pantallas, va a la más cercana.
  const revisarParada = useCallback(() => {
    if (paradaTimer.current) clearTimeout(paradaTimer.current);
    paradaTimer.current = setTimeout(() => {
      paradaTimer.current = null;
      if (dedoRef.current || destinoRef.current !== null) return;
      const x = xActual();
      const w = anchoRef.current;
      if (x === null || !w) return;
      const i = Math.max(0, Math.min(totalRef.current - 1, Math.round(x / w)));
      if (Math.abs(x - i * w) > 1) moverA(i);
    }, 220);
  }, [xActual, moverA]);
  const revisarParadaRef = useRef(revisarParada);
  revisarParadaRef.current = revisarParada;

  // A los 3 s de cambiar de pantalla el cliente, se recoloca la página; si antes toca, teclea o mueve la página, no.
  const programarRecolocar = useCallback(() => {
    cancelarRecolocar.current?.();
    if (!web) return;
    const nodo = cajaRef.current as unknown as HTMLElement | null;
    if (!nodo?.getBoundingClientRect) return;
    let espera: ReturnType<typeof setTimeout> | undefined;
    function cancelar() {
      if (espera) clearTimeout(espera);
      window.removeEventListener("pointerdown", cancelar, true);
      window.removeEventListener("keydown", cancelar, true);
      window.removeEventListener("wheel", rueda, true);
      cancelarRecolocar.current = null;
    }
    function rueda(e: WheelEvent) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) cancelar();
    }
    window.addEventListener("pointerdown", cancelar, true);
    window.addEventListener("keydown", cancelar, true);
    window.addEventListener("wheel", rueda, { capture: true, passive: true });
    espera = setTimeout(() => {
      cancelar();
      recolocarParaLeer(nodo, suaveRef.current);
    }, RECOLOCAR_MS);
    cancelarRecolocar.current = cancelar;
  }, [web]);

  // El cliente ha cambiado de pantalla: se acaba el pase automático y se recoloca la página a los 3 s.
  const cambioDelCliente = useCallback(() => {
    setParado(true);
    programarRecolocar();
  }, [programarRecolocar]);

  useEffect(() => {
    const recolocar = cancelarRecolocar;
    const destino = destinoTimer;
    const encaje = encajarTimer;
    const parada = paradaTimer;
    return () => {
      recolocar.current?.();
      if (destino.current) clearTimeout(destino.current);
      if (encaje.current) clearTimeout(encaje.current);
      if (parada.current) clearTimeout(parada.current);
    };
  }, []);

  // Pausas: ratón o dedo sobre las pantallas, pestaña del navegador oculta y carrusel fuera de la vista.
  useEffect(() => {
    if (!web || !varias) return;
    const caja = cajaRef.current as unknown as HTMLElement | null;
    const paginas = paginasRef.current as unknown as HTMLElement | null;
    if (!caja?.addEventListener || !paginas?.addEventListener) return;
    const motivos = new Set<string>();
    const marcar = (motivo: string, si: boolean) => {
      if (si) motivos.add(motivo);
      else motivos.delete(motivo);
      setEnPausa(motivos.size > 0);
    };
    const entra = (e: PointerEvent) => {
      if (e.pointerType === "mouse") marcar("raton", true);
    };
    const sale = (e: PointerEvent) => {
      if (e.pointerType === "mouse") marcar("raton", false);
    };
    const toca = () => {
      destinoRef.current = null; // el dedo manda: lo que se mueva ahora lo mueve el cliente
      dedoRef.current = true;
      marcar("dedo", true);
    };
    const suelta = () => {
      dedoRef.current = false;
      marcar("dedo", false);
      revisarParadaRef.current(); // si lo soltó entre dos pantallas, va a la más cercana
    };
    const visibilidad = () => marcar("oculta", document.hidden);
    paginas.addEventListener("pointerenter", entra);
    paginas.addEventListener("pointerleave", sale);
    paginas.addEventListener("touchstart", toca, { passive: true });
    paginas.addEventListener("touchend", suelta);
    paginas.addEventListener("touchcancel", suelta);
    document.addEventListener("visibilitychange", visibilidad);
    visibilidad();
    const vigia =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            ([e]) => {
              const alto = e.rootBounds?.height ?? window.innerHeight;
              setALaVista(e.isIntersecting && (e.intersectionRatio >= 0.6 || e.intersectionRect.height >= alto * 0.5));
            },
            { threshold: Array.from({ length: 21 }, (_, i) => i / 20) }
          );
    if (vigia) vigia.observe(caja);
    else setALaVista(true);
    return () => {
      paginas.removeEventListener("pointerenter", entra);
      paginas.removeEventListener("pointerleave", sale);
      paginas.removeEventListener("touchstart", toca);
      paginas.removeEventListener("touchend", suelta);
      paginas.removeEventListener("touchcancel", suelta);
      document.removeEventListener("visibilitychange", visibilidad);
      vigia?.disconnect();
    };
  }, [web, varias]);

  // Pase automático: la barrita del punto activo se llena en 10 s y entonces pasa a la siguiente (y de la última, a
  // la primera). Al pausar se guarda lo que faltaba; al cambiar de pantalla vuelve a empezar.
  const corriendo = varias && listo && !parado && !enPausa && aLaVista && ancho > 0;
  useEffect(() => {
    progreso.setValue(0);
    restante.current = PASE_MS;
  }, [activa, progreso]);
  useEffect(() => {
    if (!corriendo) return;
    Animated.timing(progreso, { toValue: 1, duration: restante.current, easing: Easing.linear, useNativeDriver: false }).start(
      ({ finished }) => {
        if (!finished) return;
        const siguiente = (activa + 1) % total;
        moverA(siguiente);
        setActiva(siguiente);
      }
    );
    return () =>
      progreso.stopAnimation((v) => {
        restante.current = Math.max(0, (1 - v) * PASE_MS);
      });
  }, [corriendo, activa, total, moverA, progreso]);

  // Si cambia el ancho (giro del móvil), la pantalla que se ve sigue en su sitio.
  useEffect(() => {
    activaRef.current = activa;
  }, [activa]);
  useEffect(() => {
    if (ancho > 0) carruselRef.current?.scrollTo({ x: activaRef.current * ancho, animated: false });
  }, [ancho]);

  const seccion = { width: "100%", gap: 10, alignItems: "center", paddingTop: 16, borderTopWidth: 1, borderTopColor: COLORS.borderSoft } as const;

  // Solo la descripción: sin carrusel.
  if (!varias) {
    return (
      <View nativeID={`${prefijo}-descripcion`} style={[seccion, { gap: 8 }]}>
        <Text accessibilityRole="header" {...({ "aria-level": 2 } as object)} style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>
          Descripción
        </Text>
        <BloqueDescripcion descripcion={descripcion} sinDescripcion={sinDescripcion} />
      </View>
    );
  }

  const etiqueta = (cual: PantallaFicha) => (cual === "caracteristicas" ? "Características" : cual === "mantenimiento" ? "Mantenimiento" : "Descripción");
  const contenido = (cual: PantallaFicha) =>
    cual === "caracteristicas" ? (
      <ListaPares pares={caracteristicas} />
    ) : cual === "mantenimiento" ? (
      mantenimiento ? <BloqueMantenimiento m={mantenimiento} /> : null
    ) : (
      <BloqueDescripcion descripcion={descripcion} sinDescripcion={sinDescripcion} />
    );
  const estrecho = anchoVentana < 420;
  const diminuto = anchoVentana < 360;
  const ir = (i: number) => {
    if (i === activa) return;
    moverA(i);
    setActiva(i);
    cambioDelCliente();
  };
  // Cada pantalla con su alto natural; el carrusel toma el alto de la que se ve (con una transición suave en la web).
  const altoActiva = altos[activa];
  const estiloAlto = altoActiva
    ? ({
        height: altoActiva,
        ...(web && suave ? { transitionProperty: "height", transitionDuration: "280ms", transitionTimingFunction: "ease-out" } : null),
      } as ViewStyle)
    : undefined;

  return (
    <View ref={cajaRef} nativeID={`${prefijo}-ficha-carrusel`} style={seccion}>
      {/* Pestañas (ordenador, teclado y lectores de pantalla); en el móvil, además, se desliza con el dedo. */}
      <View accessibilityRole="tablist" style={{ width: "100%", maxWidth: 520, flexDirection: "row", justifyContent: "center", gap: 4 }}>
        {pantallas.map((cual, i) => {
          const sel = i === activa;
          return (
            <Pressable
              key={cual}
              accessibilityRole="tab"
              accessibilityState={{ selected: sel }}
              {...({ "aria-selected": sel } as object)}
              onPress={() => ir(i)}
              style={({ pressed }) => ({
                flexShrink: 1,
                minHeight: 44,
                paddingHorizontal: diminuto ? 4 : estrecho ? 7 : 10,
                justifyContent: "center",
                borderBottomWidth: 2,
                borderBottomColor: sel ? COLORS.accent : "transparent",
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text numberOfLines={1} style={{ color: sel ? COLORS.text : COLORS.muted, fontWeight: "900", fontSize: diminuto ? 12.5 : estrecho ? 14 : 15, textAlign: "center" }}>
                {etiqueta(cual)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View
        ref={paginasRef}
        style={{ width: "100%", maxWidth: 520 }}
        onLayout={(e) => {
          anchoRef.current = e.nativeEvent.layout.width;
          setAncho(e.nativeEvent.layout.width);
        }}
      >
        {ancho > 0 && (
          <ScrollView
            ref={carruselRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={32}
            onScroll={(e) => {
              const x = e.nativeEvent.contentOffset.x;
              // Un desplazamiento hecho por código (pestaña o pase automático) no cuenta como gesto del cliente.
              const destino = destinoRef.current;
              if (destino !== null) {
                if (Math.abs(x - destino * ancho) < 2) destinoRef.current = null;
                return;
              }
              const i = Math.round(x / ancho);
              if (i !== activa && i >= 0 && i < total) {
                setActiva(i);
                cambioDelCliente();
              }
              revisarParada();
            }}
            contentContainerStyle={{ alignItems: "flex-start" }}
            style={estiloAlto}
          >
            {pantallas.map((cual, i) => (
              <View
                key={cual}
                nativeID={`${prefijo}-${cual}`}
                {...({ role: "tabpanel" } as object)}
                // 1 px de margen: con el carrusel en una posición con decimales, no asoma el borde de la pantalla vecina.
                style={{ width: ancho, paddingHorizontal: 1 }}
                onLayout={(e) => {
                  const alto = Math.ceil(e.nativeEvent.layout.height);
                  setAltos((prev) => (prev[i] === alto ? prev : Object.assign([...prev], { [i]: alto })));
                }}
              >
                {contenido(cual)}
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Puntos indicadores (el activo se va llenando con el pase automático) y botón de pausa. Un hueco igual a la
          izquierda deja los puntos centrados. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
        <View style={{ width: 44 }} />
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          {pantallas.map((cual, i) => {
            const sel = i === activa;
            return (
              <View
                key={cual}
                style={{
                  width: sel ? 22 : 7,
                  height: 7,
                  borderRadius: 4,
                  overflow: "hidden",
                  backgroundColor: sel ? (parado ? COLORS.accent : PISTA_PASE) : COLORS.border,
                }}
              >
                {sel && !parado && (
                  <Animated.View
                    style={{
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: COLORS.accent,
                      width: progreso.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
                    }}
                  />
                )}
              </View>
            );
          })}
        </View>
        <Pressable
          nativeID={`${prefijo}-ficha-pausa`}
          onPress={() => setParado((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={parado ? "Reanudar el pase automático" : "Pausar el pase automático"}
          style={({ pressed }) => ({ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
        >
          <Ionicons name={parado ? "play" : "pause"} size={13} color={COLORS.muted} />
        </Pressable>
      </View>
    </View>
  );
}
