/**
 * Qué hace: pantalla de inicio (pestaña "Inicio"). Es el escaparate
 * principal: cabecera con marca, barra de búsqueda flotante, accesos
 * rápidos a categorías, productos destacados desde Supabase, bloque de
 * reseñas y pie de página (components/SiteFooter.tsx, que a su vez incluye
 * components/SocialLinks.tsx) y contacto por WhatsApp.
 *
 * Cómo funciona:
 * - Carga productos destacados desde la tabla "products" de Supabase
 *   (con su categoría e imágenes) para la sección de destacados.
 * - FloatingBarramagic (components/Barramagic.tsx) es un componente aparte
 *   que se superpone al contenido y se puede arrastrar arriba/abajo.
 * - containerStyle (maxWidth según el ancho de pantalla: 920/1040/1240)
 *   centra todo el contenido en pantallas anchas para que nada quede
 *   pegado a la izquierda.
 * - Marca (components/marca/): logo animado arriba del todo, la pareja de
 *   mascotas antes de las preguntas frecuentes y CargaMarca mientras carga
 *   la oferta destacada. Todos se animan al tocarlos.
 * - Sigue el tema claro global: fondo blanco, azul claro de acento y
 *   texto en azul marino oscuro (COLORS de este mismo archivo).
 * - Cada apartado lleva su título y entre apartados hay una línea fina
 *   (Separador) con aire; "Oferta de la semana" brilla (TituloOferta).
 * - "Recién llegado": carrusel con lo último que ha entrado a la tienda
 *   (components/CategoryProductsShelf.tsx, modo "novedades").
 * - El botón "Vender ahora" lleva a la página app/vender.tsx (formulario de VenderAhoraModal),
 *   que guarda la solicitud en Supabase (tabla "sell_requests") para
 *   revisarla luego en el admin. La antigua franja "Noticias Flash" ya no
 *   se muestra: esas noticias las enseña ahora el asistente flotante de
 *   Blue IA (se editan en app/admin/flash-news.tsx).
 * - Al deslizar hacia abajo dentro del ScrollView, la barra de búsqueda
 *   flotante se oculta sola con una animación suave, para dejar ver mejor
 *   el contenido; al deslizar hacia arriba (o volver arriba del todo)
 *   vuelve a aparecer. handleScroll detecta la dirección comparando cada posición
 *   de scroll con la anterior y solo dispara la animación cuando cambia de
 *   sentido, no en cada píxel. Cerca del pie de página (o durante su rebote
 *   elástico al llegar al final) esa comparación se congela a propósito:
 *   el rebote por sí solo ya no las hace reaparecer, hace falta que el
 *   usuario suba de verdad un poco más para volver a verlas.
 *
 * - Analítica propia (lib/analytics.ts): al entrar se registra el paso
 *   "Inicio", el scroll dispara "Scroll" (con límite de frecuencia para no
 *   mandar un evento por pixel) y, la primera vez que el bloque de reseñas
 *   entra en pantalla, se registra "Reseñas". Todo esto respeta el aviso de
 *   cookies/analítica: si el visitante rechaza el seguimiento, estas
 *   llamadas no hacen nada (lo decide trackEvent internamente).
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase para los productos destacados.
 * - lib/analytics.ts → registro del recorrido del visitante para el panel
 *   de métricas del admin.
 * - components/Barramagic.tsx → barra de búsqueda (aquí, en modo flotante
 *   vía FloatingBarramagic; app/catalogo.tsx usa el mismo archivo en modo
 *   fijo/editable).
 * - components/Resenas.tsx → bloque de reseñas.
 * - components/VenderAhoraModal.tsx → formulario de "Vender ahora"
 *   (sustituye el envío por email; guarda en la tabla "sell_requests").
 * - components/SiteFooter.tsx → pie de página completo (navegación,
 *   políticas, blog, redes sociales, copyright), reutilizado también en
 *   app/(tabs)/perfil.tsx y app/(tabs)/cesta.tsx.
 * - app/catalogo.tsx, app/producto/[id].tsx, app/(tabs)/blue-ia.tsx →
 *   pantallas a las que enlazan los accesos rápidos y las tarjetas de
 *   producto destacado.
 * - app/(tabs)/_layout.tsx → define esta pantalla como la pestaña "Inicio".
 */
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { ParamListBase } from "@react-navigation/native";
import type { Href } from "expo-router";
import { router, useNavigation } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  View,
  useWindowDimensions,
  type DimensionValue,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { FloatingBarramagic } from "../../components/Barramagic";
import CategoryProductsShelf from "../../components/CategoryProductsShelf";
import { useRecarga } from "../../components/TirarParaActualizar";
import Resenas from "../../components/Resenas";
import SiteFooter from "../../components/SiteFooter";
import SmartImage from "../../components/SmartImage";
import CargaMarca from "../../components/marca/CargaMarca";
import MarcaAnimada from "../../components/marca/MarcaAnimada";
import { supabase } from "../../lib/supabase";
import { trackEvent, trackEventThrottled } from "../../lib/analytics";
import { useTabBarBottomInset } from "../../lib/tabBar";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  card: "#FFFFFF",
  cardBorder: "#E3EAF2",
  border: "#E3EAF2",
  tile: "#F6FAFD",
  tileBorder: "rgba(11,33,56,0.10)",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.62)",
  accent: "#1EA7E8",
  accentDark: "#1EA7E8",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  onAccent: "#FFFFFF",
  warningBg: "rgba(255, 178, 0, 0.14)",
  warningBorder: "rgba(255, 178, 0, 0.45)",
  successBg: "#E7F8EE",
  successBorder: "#BCEBCB",
};

// Preguntas frecuentes de Inicio: desplegables con la respuesta ya escrita. Solo se dice lo
// que la tienda ya publica (reserva de 15 min, envíos y recogida, Servicios, «Vender
// ahora»); lo demás (garantía, plazos) se deriva a la ficha o a Blue IA, sin inventar nada.
const HOME_FAQ: { pregunta: string; respuesta: string }[] = [
  {
    pregunta: "¿Cómo compro un artículo?",
    respuesta:
      "Añádelo a la Cesta. Cada artículo es unidad única, así que te lo reservamos 15 minutos. Después eliges envío o recogida, rellenas tus datos y confirmas el pedido.",
  },
  {
    pregunta: "¿Cómo son los envíos y la recogida?",
    respuesta:
      "Enviamos a toda España y también puedes recoger tu pedido en persona en Zaragoza. Preparamos cada pedido en 24–48 h laborables tras confirmarse el pago. Todos los detalles están en la política de envíos.",
  },
  {
    pregunta: "¿Qué estado y garantía tiene cada producto?",
    respuesta:
      "Cada ficha indica el estado del artículo y, en su descripción, lo que incluye y su garantía. Si te queda alguna duda, pregúntale a Blue IA o escríbenos desde el chat de la tienda.",
  },
  {
    pregunta: "¿Puedo vender o cambiar mi consola?",
    respuesta:
      "Sí. Toca «Vender ahora», cuéntanos qué tienes y cómo está, y nuestro equipo te da un precio. También puedes entregarla como parte de pago de otra compra.",
  },
  {
    pregunta: "¿Reparáis y limpiáis consolas?",
    respuesta:
      "Sí. En Servicios tienes reparación, limpieza y mantenimiento, cada uno con su precio y su ficha para contratarlo.",
  },
  {
    pregunta: "¿Puedo pagar a plazos?",
    respuesta:
      "Está disponible en el proceso de compra. Para conocer las condiciones, pregúntale a Blue IA o al equipo desde el chat de la tienda.",
  },
];

type FeaturedProduct = {
  id: string;
  title: string;
  description: string | null;
  priceEUR: number;
  // Todas las fotos del producto (la de portada primero), para poder
  // deslizar entre ellas directamente desde la tarjeta de Inicio sin
  // entrar en la ficha de producto.
  images: string[];
  categoryName: string | null;
  hasVideo: boolean;
};

type HomeCategory = {
  title: string;
  icon: IoniconName;
  cat: string;
  span?: 1 | 2;
  cta?: string;
};

type ProductCategoryLite = {
  name?: string | null;
};

type ProductRow = {
  id: string;
  title: string;
  description?: string | null;
  price_eur?: number | string | null;
  images?: string[] | null;
  updated_at?: string | null;
  created_at?: string | null;
  category?: ProductCategoryLite | null;
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

type SearchSnapPosition = "top" | "bottom";

const HOME_CATEGORIES: HomeCategory[] = [
  { title: "PlayStation 5", icon: "game-controller-outline", cat: "playstation-5", cta: "Ver categoría →" },
  { title: "PlayStation 4", icon: "game-controller-outline", cat: "playstation-4", cta: "Ver categoría →" },
  { title: "Nintendo Switch", icon: "game-controller-outline", cat: "nintendo-switch", cta: "Ver categoría →" },
  { title: "Xbox", icon: "game-controller-outline", cat: "xbox", cta: "Ver categoría →" },
  {
    title: "Reparación / Limpieza",
    icon: "construct-outline",
    cat: "reparaciones",
    span: 2,
    cta: "Ver servicios →",
  },
  {
    title: "Electrónica y otros",
    icon: "cube-outline",
    cat: "electronica",
    span: 2,
    cta: "Ver categoría →",
  },
];

const SEARCH_LAYOUT = {
  // Sin la franja de Noticias Flash, el buscador "arriba" va pegado al borde
  // superior con el mismo margen que reserva el padding del contenido.
  topSnapMobile: 12,
  topSnapDesktop: 16,
  searchBarHeightMobile: 58,
  searchBarHeightDesktop: 64,
  // La tab bar inferior se hizo más compacta (ver app/(tabs)/_layout.tsx)
  // para dejar más hueco al scroll; estos valores acompañan esa altura
  // real para que la barra de búsqueda "abajo" y el padding inferior del
  // scroll no dejen un hueco de más.
  mobileTabBarHeight: 100,
  desktopTabBarHeight: 104,
  bottomGapMobile: 12,
  bottomGapDesktop: 14,
  widthMobilePercent: 0.86,
  widthDesktopPercent: 0.74,
  maxWidth: 760,
  topContentGapMobile: 12,
  topContentGapDesktop: 14,
  bottomContentGapMobile: 18,
  bottomContentGapDesktop: 20,
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asProductRow(value: unknown): ProductRow | null {
  if (!value || typeof value !== "object") return null;

  const row = value as Record<string, unknown>;
  const id = String(row.id ?? "").trim();
  const title = String(row.title ?? "").trim();

  if (!id || !title) return null;

  const rawCategory = row.category;
  const category =
    rawCategory && typeof rawCategory === "object"
      ? {
          name:
            typeof (rawCategory as Record<string, unknown>).name === "string"
              ? ((rawCategory as Record<string, unknown>).name as string)
              : null,
        }
      : null;

  return {
    id,
    title,
    description: typeof row.description === "string" ? row.description : null,
    price_eur:
      typeof row.price_eur === "number" || typeof row.price_eur === "string"
        ? row.price_eur
        : null,
    images: Array.isArray(row.images)
      ? row.images.filter((v): v is string => typeof v === "string" && !!v.trim())
      : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    category,
  };
}

function clampText(value: string, max = 400) {
  const text = (value ?? "").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

// Precio siempre con dos decimales, coma decimal y miles con punto (155,00€ · 1.299,00€).
function fmtEUR(value: number) {
  const v = Number(value);
  const cents = Math.round((Number.isFinite(v) ? v : 0) * 100);
  const [ent, dec] = (Math.abs(cents) / 100).toFixed(2).split(".");
  return `${cents < 0 ? "-" : ""}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}€`;
}

function softShadow() {
  return Platform.select({
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

function firstImageFromAnyRow(row: ProductRow | null | undefined): string | null {
  const images = row?.images;
  if (Array.isArray(images) && images.length > 0) {
    const first = images.find((v) => typeof v === "string" && v.trim());
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

function pushRoute(route: Href) {
  router.push(route);
}

async function fetchFeaturedProductSafe(): Promise<ProductRow | null> {
  const selectWithJoinAndImages =
    "id,title,description,price_eur,status,is_active,updated_at,created_at,images,category:categories(name)";
  const selectWithJoinBase =
    "id,title,description,price_eur,status,is_active,updated_at,created_at,category:categories(name)";
  const selectImagesNoJoin =
    "id,title,description,price_eur,status,is_active,updated_at,created_at,images";
  const selectBaseNoJoin =
    "id,title,description,price_eur,status,is_active,updated_at,created_at";

  const attempts = [
    selectWithJoinAndImages,
    selectWithJoinBase,
    selectImagesNoJoin,
    selectBaseNoJoin,
  ];

  const buildFeaturedQuery = (selectStr: string) =>
    supabase
      .from("products")
      .select(selectStr)
      .eq("is_active", true)
      .eq("status", "PUBLISHED")
      .eq("is_featured_home", true)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  const buildFallbackQuery = (selectStr: string) =>
    supabase
      .from("products")
      .select(selectStr)
      .eq("is_active", true)
      .eq("status", "PUBLISHED")
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  let lastFeaturedError: unknown = null;

  for (const selectStr of attempts) {
    const featuredRes = await buildFeaturedQuery(selectStr);

    if (!featuredRes.error) {
      const normalized = asProductRow(featuredRes.data);
      if (normalized) return normalized;
      break;
    }

    lastFeaturedError = featuredRes.error;

    const canFallback =
      isMissingColumnError(featuredRes.error, "images") ||
      isMissingRelationError(featuredRes.error, "categories") ||
      isMissingColumnError(featuredRes.error, "name") ||
      isMissingColumnError(featuredRes.error, "is_featured_home");

    if (!canFallback) throw featuredRes.error;
  }

  let lastFallbackError: unknown = null;

  for (const selectStr of attempts) {
    const fallbackRes = await buildFallbackQuery(selectStr);

    if (!fallbackRes.error) {
      const normalized = asProductRow(fallbackRes.data);
      return normalized ?? null;
    }

    lastFallbackError = fallbackRes.error;

    const canFallback =
      isMissingColumnError(fallbackRes.error, "images") ||
      isMissingRelationError(fallbackRes.error, "categories") ||
      isMissingColumnError(fallbackRes.error, "name");

    if (!canFallback) throw fallbackRes.error;
  }

  if (lastFallbackError) throw lastFallbackError;
  if (lastFeaturedError && !isMissingColumnError(lastFeaturedError, "is_featured_home")) {
    throw lastFeaturedError;
  }

  return null;
}

async function fetchProductMediaRowsSafe(productId: string): Promise<ProductMediaRow[]> {
  const selects = [
    "id,product_id,kind,public_url,file_name,sort_order,is_cover,duration_seconds",
    "id,product_id,kind,public_url,file_name,sort_order,is_cover",
  ];

  let lastError: unknown = null;

  for (const selectStr of selects) {
    const res = await supabase
      .from("product_media")
      .select(selectStr)
      .eq("product_id", productId)
      .limit(100);

    if (res.error) {
      const missingTable = isMissingRelationError(res.error, "product_media");
      const missingColumn =
        String(res.error.message ?? "").toLowerCase().includes("column") ||
        String(res.error.message ?? "").toLowerCase().includes("schema cache");

      if (missingTable) return [];
      if (missingColumn) {
        lastError = res.error;
        continue;
      }

      throw res.error;
    }

    return asArray<ProductMediaRow>(res.data).sort(sortMediaRows);
  }

  if (lastError) throw lastError;
  return [];
}

// Cabecera de sección: siempre centrada (título y subtítulo).
function SectionTitle({
  title,
  subtitle,
  isMobile,
}: {
  title: string;
  subtitle?: string;
  isMobile?: boolean;
}) {
  return (
    <View style={{ marginBottom: 12, alignItems: "center" }}>
      <Text
        accessibilityRole="header"
        {...({ "aria-level": 2 } as object)}
        style={{
          color: COLORS.text,
          fontSize: isMobile ? 19 : 21,
          fontWeight: "900",
          lineHeight: isMobile ? 25 : 28,
          textAlign: "center",
        }}
      >
        {title}
      </Text>

      {!!subtitle && (
        <Text
          style={{
            color: COLORS.muted,
            marginTop: 4,
            lineHeight: 19,
            textAlign: "center",
          }}
        >
          {subtitle}
        </Text>
      )}
    </View>
  );
}

// Línea fina entre apartados (sin recuadros): el aire de arriba y abajo
// suma ~37px en móvil y ~49px en escritorio entre bloque y bloque.
function Separador({ isMobile }: { isMobile?: boolean }) {
  return (
    <View
      style={{
        height: 1,
        width: "100%",
        maxWidth: 720,
        alignSelf: "center",
        backgroundColor: COLORS.border,
        marginVertical: isMobile ? 18 : 24,
      }}
    />
  );
}

// Brillo de "Oferta de la semana". Web: un reflejo de luz (azul claro con un
// punto dorado) recorre el texto de izquierda a derecha cada 2,8 s, con un
// halo azul suave que crece al pasar. Con "reducir movimiento" queda quieto.
const CSS_BRILLO_OFERTA = [
  ".vz-oferta-brillo{display:inline-block;filter:drop-shadow(0 0 4px rgba(30,167,232,.18));animation:vz-oferta-brillo 2.8s ease-in-out infinite;}",
  // Solo se vuelve transparente el relleno si el navegador sabe recortar el fondo al texto.
  "@supports (-webkit-background-clip:text) or (background-clip:text){.vz-oferta-brillo{background-image:linear-gradient(105deg,#1EA7E8 0%,#1EA7E8 40%,#5CCBF7 46%,#F4D58D 50%,#5CCBF7 54%,#1EA7E8 60%,#1EA7E8 100%);background-size:250% 100%;background-position:100% 0;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}}",
  "@keyframes vz-oferta-brillo{0%{background-position:100% 0;filter:drop-shadow(0 0 4px rgba(30,167,232,.18))}30%{filter:drop-shadow(0 0 10px rgba(30,167,232,.42))}60%,100%{background-position:0 0;filter:drop-shadow(0 0 4px rgba(30,167,232,.18))}}",
  "@media (prefers-reduced-motion: reduce){.vz-oferta-brillo{animation:none}}",
].join("");

const ID_CSS_BRILLO_OFERTA = "vz-oferta-brillo-css";

// Inyecta la hoja de estilos del brillo una sola vez (solo web).
function asegurarCssBrilloOferta() {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  let el = document.getElementById(ID_CSS_BRILLO_OFERTA);
  if (!el) {
    el = document.createElement("style");
    el.id = ID_CSS_BRILLO_OFERTA;
    document.head.appendChild(el);
  }
  if (el.textContent !== CSS_BRILLO_OFERTA) el.textContent = CSS_BRILLO_OFERTA;
}

// Título del apartado "Oferta de la semana" con brillo premium.
function TituloOferta({ isMobile }: { isMobile?: boolean }) {
  const esWeb = Platform.OS === "web";
  const halo = useRef(new Animated.Value(0)).current;
  const [reducir, setReducir] = useState(false);

  // Nativo: respeta "reducir movimiento" del sistema (en web lo hace el CSS).
  useEffect(() => {
    if (esWeb) {
      asegurarCssBrilloOferta();
      return;
    }
    let vivo = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (vivo) setReducir(!!v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => setReducir(!!v));
    return () => {
      vivo = false;
      sub.remove();
    };
  }, [esWeb]);

  // Nativo: halo azul que respira (sin reflejo, que necesita máscaras).
  useEffect(() => {
    if (esWeb) return;
    if (reducir) {
      halo.setValue(0.6);
      return;
    }
    const bucle = Animated.loop(
      Animated.sequence([
        Animated.timing(halo, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(halo, { toValue: 0.25, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(500),
      ])
    );
    bucle.start();
    return () => bucle.stop();
  }, [esWeb, reducir, halo]);

  const estilo = {
    color: "#1EA7E8",
    fontSize: isMobile ? 21 : 24,
    fontWeight: "900" as const,
    letterSpacing: 0.3,
    lineHeight: isMobile ? 28 : 32,
    textAlign: "center" as const,
  };

  if (esWeb) {
    return (
      <View style={{ alignItems: "center", marginBottom: 2 }}>
        <Text accessibilityRole="header" {...({ "aria-level": 2 } as object)} style={estilo}>
          <span className="vz-oferta-brillo">Oferta de la semana</span>
        </Text>
      </View>
    );
  }

  return (
    <View style={{ alignItems: "center", marginBottom: 2 }}>
      <View>
        <Animated.Text
          aria-hidden
          style={[
            estilo,
            {
              position: "absolute",
              left: 0,
              right: 0,
              opacity: halo,
              textShadowColor: "rgba(30,167,232,0.55)",
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 12,
            },
          ]}
        >
          Oferta de la semana
        </Animated.Text>
        <Text accessibilityRole="header" {...({ "aria-level": 2 } as object)} style={estilo}>
          Oferta de la semana
        </Text>
      </View>
    </View>
  );
}

// Pregunta frecuente desplegable: fondo limpio (sin burbuja), línea fina entre preguntas, la
// flecha gira y la respuesta se abre con una animación suave de altura y fundido. La
// respuesta se mide en una capa absoluta para conocer su alto real sin que se corte.
function FaqItem({
  pregunta,
  respuesta,
  abierta,
  onToggle,
}: {
  pregunta: string;
  respuesta: string;
  abierta: boolean;
  onToggle: () => void;
}) {
  const progreso = useRef(new Animated.Value(0)).current;
  const [alto, setAlto] = useState(0);

  useEffect(() => {
    Animated.timing(progreso, {
      toValue: abierta ? 1 : 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [abierta, progreso]);

  const altura = progreso.interpolate({ inputRange: [0, 1], outputRange: [0, alto] });
  const giro = progreso.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: abierta }}
        style={({ pressed }) => ({
          paddingVertical: 17,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Text
          style={{
            flexShrink: 1,
            color: abierta ? COLORS.accent : COLORS.text,
            fontWeight: "900",
            fontSize: 16,
            lineHeight: 22,
            textAlign: "center",
          }}
        >
          {pregunta}
        </Text>
        <Animated.View style={{ transform: [{ rotate: giro }] }}>
          <Ionicons name="chevron-down" size={20} color={COLORS.accent} />
        </Animated.View>
      </Pressable>

      <Animated.View style={{ height: altura, opacity: progreso, overflow: "hidden" }}>
        <View
          onLayout={(e) => setAlto(Math.round(e.nativeEvent.layout.height))}
          style={{ position: "absolute", left: 0, right: 0, top: 0, paddingBottom: 18, paddingHorizontal: 6 }}
        >
          <Text style={{ color: COLORS.muted, fontSize: 15, lineHeight: 23, textAlign: "center" }}>{respuesta}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

// Etiqueta informativa: solo icono + texto, sin fondo ni borde (no es un botón).
function Pill({
  text,
  icon,
  isMobile,
}: {
  text: string;
  icon?: IoniconName;
  isMobile?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
      }}
    >
      {!!icon && <Ionicons name={icon} size={isMobile ? 13 : 14} color={COLORS.accentDark} />}
      <Text
        style={{
          color: "rgba(11,33,56,0.78)",
          fontWeight: "800",
          fontSize: isMobile ? 12 : 13,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

// Antes "Garantía / Envíos en España / Productos revisados / Pago rápido"
// eran píldoras con borde (parecían botones) justo debajo de la cabecera.
// Ahora viven aquí, debajo de "Categorías", como información sencilla (solo
// icono + texto, sin fondo ni borde) — y al tocarlas se abre un "Pop" con el
// detalle (ver InfoPopModal más abajo).
type TrustInfoItem = { icon: IoniconName; title: string; detail: string };

const TRUST_INFO: TrustInfoItem[] = [
  {
    icon: "checkmark-circle-outline",
    title: "Garantía",
    detail: "Todo lo que vendemos incluye garantía de tienda: si algo falla, te lo solucionamos sin líos.",
  },
  {
    icon: "cube-outline",
    title: "Envíos en España",
    detail:
      "Enviamos a toda España bien protegido y con seguimiento: sale en 1-2 días y llega en 72 horas como máximo. En Zaragoza te lo llevamos el mismo día, a domicilio o en mano en Cuarte de Huerva.",
  },
  {
    icon: "shield-checkmark-outline",
    title: "Productos revisados",
    detail: "Cada producto pasa una revisión de funcionamiento antes de ponerse a la venta.",
  },
  {
    icon: "flash-outline",
    title: "Pago rápido",
    detail: "Si nos vendes tu consola o electrónica, la tasamos y te pagamos en menos de 24h.",
  },
];

function TrustInfoRow({
  isMobile,
  onPressItem,
}: {
  isMobile?: boolean;
  onPressItem: (item: TrustInfoItem) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: isMobile ? 16 : 28,
      }}
    >
      {TRUST_INFO.map((item) => (
        <Pressable
          key={item.title}
          onPress={() => onPressItem(item)}
          style={({ pressed }) => ({
            opacity: pressed ? 0.65 : 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          })}
        >
          <Ionicons name={item.icon} size={19} color={COLORS.accentDark} />
          <Text
            style={{
              color: COLORS.muted,
              fontWeight: "700",
              fontSize: isMobile ? 14 : 14.5,
            }}
          >
            {item.title}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function InfoPopModal({
  item,
  onClose,
}: {
  item: TrustInfoItem | null;
  onClose: () => void;
}) {
  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.55)",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
        onPress={onClose}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: "100%",
            maxWidth: 380,
            backgroundColor: COLORS.card,
            borderRadius: 20,
            padding: 20,
            gap: 12,
            alignItems: "center",
          }}
        >
          {/* Cerrar en la esquina (absoluto) para no descentrar icono y título. */}
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={{ position: "absolute", top: 16, right: 16 }}
          >
            <Ionicons name="close" size={20} color={COLORS.muted} />
          </Pressable>

          {item ? <Ionicons name={item.icon} size={24} color={COLORS.accentDark} /> : null}
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>
            {item?.title ?? ""}
          </Text>

          <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
            {item?.detail ?? ""}
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PrimaryButton({
  title,
  subtitle,
  onPress,
  rightHint,
  isMobile,
  icono,
  testID,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  rightHint?: string;
  isMobile?: boolean;
  // Lo usa la guía de Blue para señalar el botón.
  testID?: string;
  // Con icono, el botón es el «destacado» de la cabecera de Inicio («Ver categorías» y «Vender
  // ahora»): con icono, sombra azul y una «respiración» muy suave (algo más compacto desde el
  // 2026-10-29). Así el cliente sabe siempre por dónde empezar, sin competir con el brillo de
  // «Oferta de la semana».
  icono?: IoniconName;
}) {
  const respiracion = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!icono) return;
    const bucle = Animated.loop(
      Animated.sequence([
        Animated.timing(respiracion, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(respiracion, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== "web" }),
        Animated.delay(900),
      ])
    );
    bucle.start();
    return () => bucle.stop();
  }, [icono, respiracion]);

  return (
    <Animated.View
      style={icono ? { transform: [{ scale: respiracion.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] }) }] } : undefined}
    >
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.accentDark,
        backgroundColor: COLORS.accent,
        // Destacados algo más compactos (petición del dueño: se veían muy grandes), sin bajar de 44 px.
        paddingVertical: icono ? (isMobile ? 11 : 13) : isMobile ? 13 : 14,
        paddingHorizontal: isMobile ? 14 : 16,
        opacity: pressed ? 0.9 : 1,
        ...(icono
          ? {
              shadowColor: COLORS.accent,
              shadowOpacity: 0.4,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 5 },
              elevation: 6,
            }
          : softShadow()),
      })}
    >
      {/* Todo apilado y centrado; la pista ("Ir →") va como texto simple
          debajo, sin pastilla ni pegada a la derecha. */}
      <View style={{ alignItems: "center" }}>
        {icono ? <Ionicons name={icono} size={isMobile ? 19 : 21} color={COLORS.onAccent} style={{ marginBottom: 2 }} /> : null}
        <Text
          style={{
            color: COLORS.onAccent,
            fontWeight: "900",
            fontSize: icono ? (isMobile ? 15.5 : 16.5) : isMobile ? 15 : 16,
            lineHeight: icono ? (isMobile ? 20 : 22) : isMobile ? 20 : 22,
            textAlign: "center",
          }}
        >
          {title}
        </Text>

        {!!subtitle && (
          <Text
            style={{
              color: "rgba(255,255,255,0.85)",
              marginTop: 4,
              lineHeight: 18,
              fontSize: isMobile ? 13 : 14,
              textAlign: "center",
            }}
          >
            {subtitle}
          </Text>
        )}

        {!!rightHint && (
          <Text
            style={{
              color: "#FFFFFF",
              fontWeight: "900",
              fontSize: 12,
              marginTop: 6,
              textAlign: "center",
            }}
          >
            {rightHint}
          </Text>
        )}
      </View>
    </Pressable>
    </Animated.View>
  );
}

function SecondaryButton({
  title,
  subtitle,
  onPress,
  isMobile,
  icon,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  isMobile?: boolean;
  icon?: IoniconName;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: COLORS.accentBorder,
        backgroundColor: "#FFFFFF",
        paddingVertical: isMobile ? 13 : 14,
        paddingHorizontal: isMobile ? 14 : 16,
        opacity: pressed ? 0.88 : 1,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }}>
        {!!icon && <Ionicons name={icon} size={isMobile ? 15 : 16} color={COLORS.accentDark} />}
        <Text
          style={{
            color: COLORS.accentDark,
            fontWeight: "900",
            fontSize: isMobile ? 15 : 16,
          }}
        >
          {title}
        </Text>
      </View>

      {!!subtitle && (
        <Text
          style={{
            color: COLORS.muted,
            marginTop: 4,
            lineHeight: 18,
            fontSize: isMobile ? 13 : 14,
            textAlign: "center",
          }}
        >
          {subtitle}
        </Text>
      )}
    </Pressable>
  );
}

function CategoryCard({
  title,
  icon,
  onPress,
  cta,
  widthPercent,
  isMobile,
}: {
  title: string;
  icon: IoniconName;
  onPress: () => void;
  cta?: string;
  widthPercent?: DimensionValue;
  isMobile?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: widthPercent ?? "48.8%",
        minHeight: isMobile ? 92 : 100,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.tileBorder,
        backgroundColor: COLORS.tile,
        padding: isMobile ? 12 : 14,
        opacity: pressed ? 0.9 : 1,
        // Icono, título y enlace centrados en todos los tamaños.
        alignItems: "center",
        justifyContent: "center",
      })}
    >
      <View
        style={{
          width: isMobile ? 38 : 40,
          height: isMobile ? 38 : 40,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: COLORS.accent2,
        }}
      >
        <Ionicons name={icon} size={isMobile ? 20 : 21} color={COLORS.accentDark} />
      </View>

      <Text
        style={{
          color: COLORS.text,
          fontWeight: "900",
          marginTop: 6,
          lineHeight: 20,
          fontSize: isMobile ? 14 : 15,
          textAlign: "center",
        }}
      >
        {title}
      </Text>

      <Text
        style={{
          color: COLORS.muted,
          marginTop: 4,
          fontSize: 12,
          lineHeight: 16,
          textAlign: "center",
        }}
      >
        {cta ?? "Ver categoría →"}
      </Text>
    </Pressable>
  );
}

// Carrusel de fotos de la tarjeta de "Oferta de la semana": permite deslizar
// (o usar las flechas, en escritorio) entre todas las fotos del producto sin
// salir de Inicio. Muestra puntos de página y, mientras queden fotos por
// delante, un indicador "…+N" (N = fotos que faltan por ver desde la que se
// está viendo) que va bajando a medida que se avanza.
function FeaturedMediaCarousel({
  images,
  alt,
  mediaHeight,
  hasVideo,
}: {
  images: string[];
  alt: string;
  mediaHeight: number;
  hasVideo: boolean;
}) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const goToIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(images.length - 1, index));
      if (containerWidth > 0) {
        scrollRef.current?.scrollTo({ x: clamped * containerWidth, animated: true });
      }
      setActiveIndex(clamped);
    },
    [containerWidth, images.length]
  );

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!containerWidth) return;
      const index = Math.round(e.nativeEvent.contentOffset.x / containerWidth);
      setActiveIndex(Math.max(0, Math.min(images.length - 1, index)));
    },
    [containerWidth, images.length]
  );

  if (images.length === 0) {
    return (
      <View
        style={{
          height: mediaHeight,
          backgroundColor: COLORS.tile,
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <Ionicons name="game-controller-outline" size={40} color={COLORS.muted} />
        <Text style={{ color: COLORS.text, fontWeight: "900", marginTop: 10, textAlign: "center" }}>
          Producto destacado
        </Text>
        <Text style={{ color: COLORS.muted, textAlign: "center", marginTop: 6, lineHeight: 18 }}>
          Sin imagen disponible.
        </Text>
      </View>
    );
  }

  const remaining = images.length - 1 - activeIndex;
  const hasMultiple = images.length > 1;

  return (
    <View
      style={{ height: mediaHeight, backgroundColor: COLORS.tile, position: "relative" }}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.round(w) !== Math.round(containerWidth)) setContainerWidth(w);
      }}
    >
      {containerWidth > 0 ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          onMomentumScrollEnd={handleMomentumEnd}
          // En la web no existe onMomentumScrollEnd: el punto activo se actualiza aquí
          // (React ignora el setState si el índice no cambia).
          onScroll={Platform.OS === "web" ? handleMomentumEnd : undefined}
          scrollEventThrottle={16}
        >
          {images.map((uri, index) => (
            <SmartImage
              key={`${uri}-${index}`}
              uri={uri}
              alt={images.length > 1 ? `${alt} (foto ${index + 1} de ${images.length})` : alt}
              ancho={Math.max(320, containerWidth || 420)}
              contentFit="contain"
              style={{ width: containerWidth, height: mediaHeight }}
            />
          ))}
        </ScrollView>
      ) : null}

      {hasMultiple && activeIndex > 0 ? (
        <Pressable
          onPress={() => goToIndex(activeIndex - 1)}
          hitSlop={10}
          style={({ pressed }) => ({
            position: "absolute",
            left: 8,
            top: mediaHeight / 2 - 16,
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: pressed ? "rgba(11,33,56,0.65)" : "rgba(11,33,56,0.45)",
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <Ionicons name="chevron-back" size={18} color="#FFFFFF" />
        </Pressable>
      ) : null}

      {hasMultiple && activeIndex < images.length - 1 ? (
        <Pressable
          onPress={() => goToIndex(activeIndex + 1)}
          hitSlop={10}
          style={({ pressed }) => ({
            position: "absolute",
            right: 8,
            top: mediaHeight / 2 - 16,
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: pressed ? "rgba(11,33,56,0.65)" : "rgba(11,33,56,0.45)",
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
        </Pressable>
      ) : null}

      {hasMultiple ? (
        <View
          style={{
            position: "absolute",
            bottom: 12,
            left: 0,
            right: 0,
            flexDirection: "row",
            justifyContent: "center",
            gap: 5,
          }}
        >
          {images.map((_, index) => (
            <View
              key={index}
              style={{
                width: index === activeIndex ? 16 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: index === activeIndex ? "#FFFFFF" : "rgba(255,255,255,0.55)",
              }}
            />
          ))}
        </View>
      ) : null}

      {remaining > 0 ? (
        <View style={{ position: "absolute", right: 12, bottom: hasMultiple ? 26 : 12 }}>
          <Text
            // Azul marino: las fotos van enteras sobre fondo claro y en blanco no se leía.
            style={{ color: "#0B2138", fontWeight: "900", fontSize: 12.5 }}
          >
            +{remaining} fotos
          </Text>
        </View>
      ) : null}

      {hasVideo ? (
        <View
          style={{
            position: "absolute",
            left: 12,
            top: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            backgroundColor: "rgba(11,33,56,0.55)",
            borderRadius: 999,
            paddingHorizontal: 8,
            paddingVertical: 4,
          }}
        >
          <Ionicons name="videocam" size={12} color="#FFFFFF" />
          <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 11 }}>Vídeo</Text>
        </View>
      ) : null}
    </View>
  );
}

function FeaturedOfferCard({
  item,
  isDesktopish,
  isWide,
  isMobile,
  onPressCategories,
  onPressChat,
  chatBusy,
}: {
  item: FeaturedProduct | null;
  isDesktopish: boolean;
  isWide?: boolean;
  isMobile: boolean;
  onPressCategories: () => void;
  // Abre el chat interno del producto destacado (mismo flujo que el botón
  // "Chat" de la ficha de producto): pide login si hace falta y crea/reusa
  // la conversación en app/chat/[chatId].tsx.
  onPressChat: () => void;
  chatBusy?: boolean;
}) {
  const mediaHeight = isWide ? 320 : isDesktopish ? 280 : isMobile ? 210 : 240;

  if (!item) {
    // Sin envoltorio de tarjeta: textos y botones directamente, centrados.
    // El título "Oferta de la semana" (con brillo) lo pone HomeScreen encima.
    return (
      <View style={{ gap: 12, alignItems: "center" }}>
        <Text
          style={{
            color: COLORS.text,
            fontSize: isMobile ? 19 : 20,
            fontWeight: "900",
            lineHeight: isMobile ? 25 : 28,
            textAlign: "center",
          }}
        >
          Descubre nuestras categorías destacadas.
        </Text>

        <View style={{ flexDirection: isDesktopish ? "row" : "column", gap: 12, alignSelf: "stretch" }}>
          <View style={{ flex: 1 }}>
            <PrimaryButton title="Ver categorías" onPress={onPressCategories} isMobile={isMobile} />
          </View>

          <View style={{ flex: 1 }}>
            {/* Atención dentro de la tienda: primero Blue IA y, si hace falta, el equipo. */}
            <SecondaryButton
              title="Preguntar a Blue IA"
              icon="sparkles-outline"
              onPress={() => pushRoute("/blue-ia" as Href)}
              isMobile={isMobile}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        borderRadius: 22,
        backgroundColor: COLORS.card,
        overflow: "hidden",
      }}
    >
      <View style={{ flexDirection: isDesktopish ? "row" : "column" }}>
        <View style={{ flex: isDesktopish ? 1.05 : undefined }}>
          <FeaturedMediaCarousel
            images={item.images}
            alt={item.title}
            mediaHeight={mediaHeight}
            hasVideo={item.hasVideo}
          />
        </View>

        <View
          style={{
            flex: 1,
            padding: isMobile ? 14 : 16,
            gap: 12,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View style={{ alignItems: "center" }}>
            <Text
              style={{
                color: COLORS.text,
                fontSize: isMobile ? 20 : 22,
                fontWeight: "900",
                lineHeight: isMobile ? 26 : 28,
                textAlign: "center",
              }}
            >
              {item.title}
            </Text>

            <Text
              style={{
                color: COLORS.accent,
                fontSize: isMobile ? 22 : 24,
                fontWeight: "900",
                marginTop: 8,
                textAlign: "center",
              }}
            >
              {fmtEUR(item.priceEUR)}
            </Text>
          </View>

          <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
            {item.description?.trim()
              ? clampText(item.description, 180)
              : "Producto revisado y seleccionado para destacar esta semana por su excelente relación calidad-precio."}
          </Text>

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
              <Ionicons name="checkmark-circle-outline" size={isMobile ? 14 : 15} color={COLORS.accentDark} />
              <Text
                style={{
                  color: "rgba(11,33,56,0.78)",
                  fontWeight: "800",
                  fontSize: isMobile ? 12 : 13,
                }}
              >
                Revisado
              </Text>
            </View>
            {item.categoryName ? <Pill icon="cube-outline" text={item.categoryName} isMobile={isMobile} /> : null}
          </View>

          <View style={{ flexDirection: isDesktopish ? "row" : "column", gap: 12, alignSelf: "stretch" }}>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                title="Ver producto"
                onPress={() => pushRoute(`/producto/${item.id}` as Href)}
                isMobile={isMobile}
              />
            </View>

            <View style={{ flex: 1 }}>
              <SecondaryButton
                title="Consultar por Chat"
                subtitle={chatBusy ? "Abriendo…" : undefined}
                icon="chatbubble-ellipses-outline"
                onPress={onPressChat}
                isMobile={isMobile}
              />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  // La barra de pestañas crece con la zona segura del iPhone (lib/tabBar.ts): lo que flota
  // justo encima (buscador y "volver arriba") se desplaza lo mismo para no quedar tapado.
  const tabBarInset = useTabBarBottomInset();
  const mobileTabBarHeight = SEARCH_LAYOUT.mobileTabBarHeight + tabBarInset;
  const desktopTabBarHeight = SEARCH_LAYOUT.desktopTabBarHeight + tabBarInset;
  const [featured, setFeatured] = useState<FeaturedProduct | null>(null);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [featuredChatBusy, setFeaturedChatBusy] = useState(false);

  const [searchSnapPosition, setSearchSnapPosition] = useState<SearchSnapPosition>("bottom");
  const [infoPop, setInfoPop] = useState<TrustInfoItem | null>(null);
  // Pregunta frecuente abierta (solo una a la vez).
  const [faqAbierta, setFaqAbierta] = useState<number | null>(null);
  // Botón flotante "volver arriba" ⬆️: aparece tras bajar bastante.
  const [showScrollTop, setShowScrollTop] = useState(false);
  const showScrollTopRef = useRef(false);
  const scrollTopAnim = useRef(new Animated.Value(0)).current;

  const scrollRef = useRef<ScrollView | null>(null);
  const [categoriesY, setCategoriesY] = useState(0);

  // Ocultar/mostrar la barra de búsqueda flotante
  // según la dirección del scroll: al bajar se ocultan (más sitio para ver
  // contenido), al subir o al llegar arriba del todo vuelven a aparecer.
  const [headerHidden, setHeaderHidden] = useState(false);
  const headerHiddenRef = useRef(false);
  const lastScrollYRef = useRef(0);
  // Recorrido acumulado en la dirección actual, para no ocultar/mostrar la
  // buscador a la primera sacudida del dedo (antes bastaban 6px de un
  // solo evento de scroll, y con scrollEventThrottle=16 eso disparaba el
  // cambio en cuanto el usuario tocaba la pantalla, dando una sensación
  // "nerviosa"). Ahora hace falta un recorrido sostenido en la misma
  // dirección antes de reaccionar, como en apps con scroll "suave".
  const scrollRunRef = useRef(0);

  // Analítica: posición del bloque de "Reseñas" (para saber cuándo entra en
  // pantalla al hacer scroll) y una bandera para registrar ese paso una sola
  // vez por visita, no cada vez que pasa por ahí.
  const resenasYRef = useRef(0);
  const resenasTrackedRef = useRef(false);

  const handleResenasLayout = useCallback((e: LayoutChangeEvent) => {
    resenasYRef.current = e.nativeEvent.layout.y;
  }, []);

  const HEADER_SCROLL_HIDE_THRESHOLD = 28;
  const HEADER_SCROLL_SHOW_THRESHOLD = 18;
  // Zona de "pie de página": incluye estar ya al final del todo Y el rebote
  // elástico que se pasa de ese final (en iOS/web ese rebote hace que
  // contentOffset.y suba un poco y luego vuelva sola, lo que antes se leía
  // como "el usuario ha subido" y reaparecía la búsqueda solo
  // por el rebote, sin que nadie moviera el dedo hacia arriba de verdad).
  const HEADER_SCROLL_BOTTOM_GUARD = 32;

  const handleScroll = useCallback(
    (e: {
      nativeEvent: {
        contentOffset: { y: number };
        contentSize?: { height: number };
        layoutMeasurement?: { height: number };
      };
    }) => {
    const y = e.nativeEvent.contentOffset.y;
    const delta = y - lastScrollYRef.current;
    const nearTop = y < 20;

    const contentHeight = e.nativeEvent.contentSize?.height ?? 0;
    const viewportHeight = e.nativeEvent.layoutMeasurement?.height ?? 0;
    const distanceFromBottom = contentHeight - viewportHeight - y;
    // true tanto en el final exacto como durante el rebote (ahí
    // distanceFromBottom se vuelve negativo al pasarse del límite).
    const nearBottom = distanceFromBottom < HEADER_SCROLL_BOTTOM_GUARD;

    if (nearTop) {
      scrollRunRef.current = 0;
      if (headerHiddenRef.current) {
        headerHiddenRef.current = false;
        setHeaderHidden(false);
      }
    } else if (nearBottom) {
      // En el pie de página (o en su rebote) no cuenta como "el usuario ha
      // subido": se congela el recorrido para que, al salir de esta zona
      // subiendo de verdad, haga falta un recorrido nuevo — ni el rebote ni
      // los primeros píxeles de salida reaparecen el buscador por sí solos.
      scrollRunRef.current = 0;
    } else if (delta > 0) {
      // Bajando: solo acumula mientras se siga bajando; si el usuario cambia
      // de sentido, el recorrido se reinicia en vez de restar (evita que un
      // pequeño rebote hacia arriba "gaste" progreso y luego dispare el
      // ocultado de golpe).
      scrollRunRef.current = scrollRunRef.current > 0 ? scrollRunRef.current + delta : delta;
      if (scrollRunRef.current > HEADER_SCROLL_HIDE_THRESHOLD && !headerHiddenRef.current) {
        headerHiddenRef.current = true;
        setHeaderHidden(true);
      }
    } else if (delta < 0) {
      scrollRunRef.current = scrollRunRef.current < 0 ? scrollRunRef.current + delta : delta;
      if (scrollRunRef.current < -HEADER_SCROLL_SHOW_THRESHOLD && headerHiddenRef.current) {
        headerHiddenRef.current = false;
        setHeaderHidden(false);
      }
    }

    // El botón "volver arriba" se oculta al acercarse al final de verdad
    // (el pie de página) para que nunca quede montado encima del texto del
    // pie — solo se ve mientras hay contenido normal debajo.
    // Solo se actualiza el estado al cruzar el umbral (no en cada evento de scroll).
    const nextShowScrollTop = y > 480 && distanceFromBottom > 280;
    if (nextShowScrollTop !== showScrollTopRef.current) {
      showScrollTopRef.current = nextShowScrollTop;
      setShowScrollTop(nextShowScrollTop);
    }

    // Analítica: "Scroll" con límite de frecuencia (no queremos un evento
    // por cada pixel) y "Reseñas" la primera vez que ese bloque entra en la
    // parte visible de la pantalla.
    if (y > 40) {
      trackEventThrottled("home-scroll", "scroll", "Scroll", { path: "/" });
    }

    if (
      !resenasTrackedRef.current &&
      resenasYRef.current > 0 &&
      y + viewportHeight > resenasYRef.current + 40
    ) {
      resenasTrackedRef.current = true;
      trackEvent("section_view", "Reseñas", { path: "/" });
    }

    lastScrollYRef.current = y;
    },
    []
  );

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  // Al tocar la pestaña "Inicio" de abajo estando ya en Inicio, la app sube
  // del todo automáticamente (como si se pulsara el botón flotante ⬆️) en
  // vez de no hacer nada, que es lo que pasaba antes.
  const navigation = useNavigation<BottomTabNavigationProp<ParamListBase>>();
  useEffect(() => {
    const unsubscribe = navigation.addListener("tabPress", () => {
      if (navigation.isFocused()) {
        scrollToTop();
      }
    });
    return unsubscribe;
  }, [navigation, scrollToTop]);

  useEffect(() => {
    Animated.timing(scrollTopAnim, {
      toValue: showScrollTop ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [showScrollTop, scrollTopAnim]);

  const { width } = useWindowDimensions();
  const widthSafe = width > 0 ? width : 1024;

  const isMobile = widthSafe < 700;
  const isDesktopish = widthSafe >= 900;
  const isWide = widthSafe >= 1280;

  const containerMaxWidth = isWide ? 1240 : isDesktopish ? 1040 : 920;

  const containerStyle = useMemo(
    () => ({
      width: "100%" as const,
      maxWidth: containerMaxWidth,
      alignSelf: "center" as const,
    }),
    [containerMaxWidth]
  );

  const categoryColumns = isMobile ? 1 : isWide ? 3 : 2;

  const categoryCardWidth = useCallback(
    (span?: 1 | 2): DimensionValue => {
      // En móvil todas las categorías van en rejilla de 2 columnas (incluso
      // las que en escritorio ocupan el ancho completo con span:2), para
      // que quepan más sin tener que hacer tanto scroll. 46% y no 48.8%:
      // el contenedor fila tiene "gap:10" además del ancho en porcentaje, y
      // en pantallas estrechas ese hueco fijo de 10px no dejaba sitio para
      // la segunda tarjeta (48.8% + 48.8% + 10px se pasaba del 100%
      // disponible por un par de píxeles), así que cada tarjeta acababa
      // sola en su fila. 46% dejamos margen de sobra para que quepan las 2.
      if (isMobile) return "46%";
      if (categoryColumns === 3) return span === 2 ? "66.2%" : "32%";
      return span === 2 ? "100%" : "48.8%";
    },
    [isMobile, categoryColumns]
  );

  const sidePadding = isMobile ? 16 : isWide ? 24 : 16;

  const handleCategoriesLayout = useCallback((e: LayoutChangeEvent) => {
    setCategoriesY(e.nativeEvent.layout.y);
  }, []);

  const categoriasRef = useRef<View>(null);

  const scrollToCategories = useCallback(() => {
    if (!scrollRef.current) return;
    // Web: se mide dónde está AHORA el apartado «Categorías» respecto al contenido que se
    // desplaza (layout.y es relativo a su contenedor y no cuenta el margen de arriba, ni lo
    // que aparece después, como «Recién llegado»): así llega exactamente a su título.
    if (Platform.OS === "web") {
      const el = categoriasRef.current as unknown as HTMLElement | null;
      const contenedor = (scrollRef.current as any).getScrollableNode?.() as HTMLElement | undefined;
      if (el?.getBoundingClientRect && contenedor) {
        const y = el.getBoundingClientRect().top - contenedor.getBoundingClientRect().top + contenedor.scrollTop;
        scrollRef.current.scrollTo({ y: Math.max(0, y - 18), animated: true });
        return;
      }
    }
    const target = Math.max(categoriesY - 12, 0);
    scrollRef.current.scrollTo({ y: target, animated: true });
  }, [categoriesY]);

  // Mismo flujo que el botón "Chat" de la ficha de producto
  // (handleChatPress en app/producto/[id].tsx): exige sesión iniciada y usa
  // get_or_create_product_chat para crear o reutilizar la conversación de
  // (este producto destacado, este cliente) antes de llevar a
  // app/chat/[chatId].tsx.
  const handleFeaturedChatPress = useCallback(async () => {
    if (!featured || featuredChatBusy) return;

    setFeaturedChatBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user) {
        pushRoute("/perfil" as Href);
        return;
      }

      const { data: chatId, error } = await supabase.rpc("get_or_create_product_chat", {
        p_product_id: featured.id,
      });
      if (error) throw error;

      router.push({ pathname: "/chat/[chatId]", params: { chatId: String(chatId) } } as never);
    } catch (e) {
      console.error("Error abriendo el chat del producto destacado:", e);
    } finally {
      setFeaturedChatBusy(false);
    }
  }, [featured, featuredChatBusy]);

  // «Desliza para actualizar»: vuelve a pedir la oferta destacada (sin volver a enseñar la carga).
  const recarga = useRecarga();
  useEffect(() => {
    let alive = true;

    async function loadFeatured() {
      if (recarga === 0) setFeaturedLoading(true);

      try {
        const data = await fetchFeaturedProductSafe();
        if (!alive) return;

        if (!data) {
          setFeatured(null);
          return;
        }

        const mediaRows = await fetchProductMediaRowsSafe(data.id);
        if (!alive) return;

        // mediaRows ya viene ordenado (portada primero, luego por sort_order)
        // gracias a fetchProductMediaRowsSafe, así que basta con quedarnos
        // con las de tipo imagen para tener el orden correcto del carrusel.
        const imagesFromMedia = mediaRows
          .filter(
            (m) =>
              normalizeMediaKind(m.kind) === "image" &&
              typeof m.public_url === "string" &&
              m.public_url.trim()
          )
          .map((m) => (m.public_url as string).trim());

        const fallbackSingleImage = firstImageFromAnyRow(data);
        const images =
          imagesFromMedia.length > 0
            ? imagesFromMedia
            : fallbackSingleImage
            ? [fallbackSingleImage]
            : [];

        setFeatured({
          id: data.id,
          title: data.title,
          description: data.description ?? null,
          priceEUR: Number(data.price_eur ?? 0),
          images,
          categoryName: data.category?.name ?? null,
          hasVideo: mediaRows.some((m) => normalizeMediaKind(m.kind) === "video"),
        });
      } catch {
        if (!alive) return;
        setFeatured(null);
      } finally {
        if (!alive) return;
        setFeaturedLoading(false);
      }
    }

    loadFeatured();

    return () => {
      alive = false;
    };
  }, [recarga]);

  // Analítica: registra la visita a "Inicio" en cuanto se monta la pantalla.
  useEffect(() => {
    trackEvent("page_view", "Inicio", { path: "/" });
  }, []);

  const searchBarHeight = isMobile
    ? SEARCH_LAYOUT.searchBarHeightMobile
    : SEARCH_LAYOUT.searchBarHeightDesktop;

  const topOverlaySpace =
    searchSnapPosition === "top"
      ? searchBarHeight +
        (isMobile ? SEARCH_LAYOUT.topContentGapMobile : SEARCH_LAYOUT.topContentGapDesktop)
      : 0;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      <SafeAreaView style={{ backgroundColor: COLORS.bg }} />

      <ScrollView
        ref={scrollRef}
        // overscrollBehaviorY:"contain" (propiedad web) es lo que evita que,
        // al llegar abajo del todo (justo después del pie de página), el
        // scroll "rebote" más allá del contenido y haya que volver a subir
        // para que se acomode — el rebote elástico se queda contenido
        // dentro de este ScrollView en vez de notarse en toda la pantalla.
        style={{ overscrollBehaviorY: "contain" } as any}
        bounces={false}
        overScrollMode="never"
        contentContainerStyle={{
          paddingHorizontal: sidePadding,
          paddingTop: (isMobile ? 12 : 16) + topOverlaySpace,
          // Antes llevaba también + bottomOverlaySpace (el hueco reservado
          // para que el buscador flotante no tape el contenido mientras se
          // desplaza). Al llegar del todo abajo esa reserva ya no hace
          // falta — el buscador se oculta solo al bajar (hidden={headerHidden}
          // en FloatingBarramagic más abajo) — y sumada al propio padding
          // del pie de página dejaba un hueco en blanco de más entre el pie
          // y la barra de pestañas, con la sensación de que el scroll "se
          // pasaba" del final. Con un margen fijo pequeño el pie de página
          // queda pegado a la barra de pestañas, como debe ser.
          paddingBottom: isMobile ? 24 : 28,
          // + 8px de margen del pie = 36px (móvil) / 48px (escritorio).
          gap: isMobile ? 28 : 40,
        }}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {/* Apartados separados por <Separador /> (línea fina + aire), sin recuadros. */}
        <View style={containerStyle}>
          {/* Logo animado como cabecera de marca: centrado, sin recuadro y con
              poco margen para no empujar el contenido. Al tocarlo, se anima. */}
          <View style={{ alignItems: "center", marginTop: isMobile ? -4 : 0, marginBottom: 8 }}>
            <MarcaAnimada cual="logo" ancho={isMobile ? 150 : isWide ? 190 : 170} />
          </View>

          {/* Cabecera sin envoltorio de tarjeta: texto y botones centrados. */}
          <View style={{ gap: 12, alignItems: "center", paddingVertical: 4 }}>
            {/* Único título de primer nivel (h1) de la portada. */}
            <Text
              accessibilityRole="header"
              {...({ "aria-level": 1 } as object)}
              style={{
                color: COLORS.text,
                fontSize: isMobile ? 21 : 22,
                fontWeight: "700",
                letterSpacing: 0.2,
                lineHeight: 30,
                textAlign: "center",
              }}
            >
              ¡Véndenos, Intercambia, Repara o realízale mantenimiento a tus dispositivos
              electrónicos!
            </Text>

            <View style={{ flexDirection: "row", justifyContent: "center", gap: 12, alignSelf: "stretch" }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton title="Ver categorías" icono="apps" testID="boton-ver-categorias" onPress={scrollToCategories} isMobile={isMobile} />
              </View>

              <View style={{ flex: 1 }}>
                <PrimaryButton title="Vender ahora" icono="cash" testID="boton-vender-ahora" onPress={() => pushRoute("/vender" as Href)} isMobile={isMobile} />
              </View>
            </View>
          </View>

          <Separador isMobile={isMobile} />

          {/* Oferta de la semana: título con brillo + tarjeta del producto. */}
          <View style={{ gap: 12 }}>
            <TituloOferta isMobile={isMobile} />

            {featuredLoading ? (
              // Carga con la mascota de la tienda (antes, ruedita gris).
              <View
                style={{
                  minHeight: isMobile ? 150 : 180,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <CargaMarca texto="Cargando oferta destacada…" ancho={isMobile ? 84 : 96} />
              </View>
            ) : (
              <FeaturedOfferCard
                item={featured}
                isDesktopish={isDesktopish}
                isWide={isWide}
                isMobile={isMobile}
                onPressCategories={scrollToCategories}
                onPressChat={handleFeaturedChatPress}
                chatBusy={featuredChatBusy}
              />
            )}
          </View>

          <Separador isMobile={isMobile} />

          {/* Recién llegado: lo último que ha entrado (también lo que llega de VeoAura).
              Si no hay nada, no se pinta, ni su separador. */}
          <CategoryProductsShelf modo="novedades" titulo="Recién llegado" pie={<Separador isMobile={isMobile} />} />

          <View ref={categoriasRef} testID="seccion-categorias" onLayout={handleCategoriesLayout} style={{ gap: 10 }}>
            <SectionTitle title="Categorías" isMobile={isMobile} />

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 10,
                justifyContent: "center",
              }}
            >
              {HOME_CATEGORIES.map((category) => {
                const onPress =
                  category.cat === "reparaciones"
                    ? () => pushRoute("/servicios" as Href)
                    : () => pushRoute(`/catalogo?cat=${encodeURIComponent(category.cat)}` as Href);

                return (
                  <CategoryCard
                    key={category.cat}
                    title={category.title}
                    icon={category.icon}
                    cta={category.cta}
                    onPress={onPress}
                    widthPercent={categoryCardWidth(category.span)}
                    isMobile={isMobile}
                  />
                );
              })}
            </View>
          </View>

          <Separador isMobile={isMobile} />

          <View>
            <SectionTitle title="Compra con confianza" isMobile={isMobile} />
            <TrustInfoRow isMobile={isMobile} onPressItem={setInfoPop} />
          </View>

          <Separador isMobile={isMobile} />

          <View onLayout={handleResenasLayout}>
            <Resenas isMobile={isMobile} />
          </View>

          <Separador isMobile={isMobile} />

          <View style={{ gap: 12 }}>
            {/* Las dos mascotas de la tienda dan paso a las preguntas
                frecuentes; al tocarlas se animan. */}
            <View style={{ alignItems: "center" }}>
              <MarcaAnimada cual="pareja" ancho={isMobile ? 280 : isWide ? 360 : 320} />
            </View>

            <SectionTitle title="Preguntas frecuentes" isMobile={isMobile} />

            <View style={{ width: "100%", maxWidth: 640, alignSelf: "center", borderTopWidth: 1, borderTopColor: COLORS.border }}>
              {HOME_FAQ.map((item, i) => (
                <FaqItem
                  key={item.pregunta}
                  pregunta={item.pregunta}
                  respuesta={item.respuesta}
                  abierta={faqAbierta === i}
                  onToggle={() => setFaqAbierta((a) => (a === i ? null : i))}
                />
              ))}
            </View>

            <Pressable
              onPress={() => pushRoute("/blue-ia" as Href)}
              accessibilityRole="button"
              style={({ pressed }) => ({ alignSelf: "center", paddingVertical: 10, opacity: pressed ? 0.8 : 1 })}
            >
              <Text style={{ color: COLORS.accent, fontWeight: "900", fontSize: 15, textAlign: "center" }}>
                ¿Otra duda? Pregúntale a Blue IA →
              </Text>
            </Pressable>
          </View>
        </View>

        <SiteFooter
          sidePadding={sidePadding}
          contentMaxWidth={containerMaxWidth}
          onPressCategorias={scrollToCategories}
        />
      </ScrollView>

      {/* "Volver arriba": aparece solo tras bajar bastante, abajo a la DERECHA (donde llega el
          pulgar derecho). Con el buscador abajo (móvil) se coloca justo encima de él. */}
      <Animated.View
        pointerEvents={showScrollTop ? "auto" : "none"}
        style={{
          position: "absolute",
          right: 14,
          bottom:
            (isMobile ? mobileTabBarHeight : desktopTabBarHeight) +
            14 +
            (isMobile && searchSnapPosition === "bottom" ? SEARCH_LAYOUT.searchBarHeightMobile + 14 : 0),
          opacity: scrollTopAnim,
          transform: [
            {
              translateY: scrollTopAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }),
            },
          ],
        }}
      >
        <Pressable
          onPress={scrollToTop}
          // 46 px: objetivo cómodo para el pulgar.
          style={({ pressed }) => ({
            width: 46,
            height: 46,
            borderRadius: 23,
            backgroundColor: "rgba(11,33,56,0.75)",
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.85 : 1,
            ...softShadow(),
          })}
        >
          <Ionicons name="arrow-up" size={17} color="#FFFFFF" />
        </Pressable>
      </Animated.View>

      <FloatingBarramagic
        isMobile={isMobile}
        topSnapY={isMobile ? SEARCH_LAYOUT.topSnapMobile : SEARCH_LAYOUT.topSnapDesktop}
        mobileTabBarHeight={mobileTabBarHeight}
        desktopTabBarHeight={desktopTabBarHeight}
        bottomGapMobile={SEARCH_LAYOUT.bottomGapMobile}
        bottomGapDesktop={SEARCH_LAYOUT.bottomGapDesktop}
        widthMobilePercent={SEARCH_LAYOUT.widthMobilePercent}
        widthDesktopPercent={SEARCH_LAYOUT.widthDesktopPercent}
        maxWidth={SEARCH_LAYOUT.maxWidth}
        onSnapChange={setSearchSnapPosition}
        hidden={headerHidden}
      />

      <InfoPopModal item={infoPop} onClose={() => setInfoPop(null)} />
    </View>
  );
}