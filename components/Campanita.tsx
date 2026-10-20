/**
 * components/Campanita.tsx — "Blue", la asistente flotante de ventas
 *
 * Qué hace: antes era una campanita; ahora es Blue, el capibara asistente de la
 * tienda, flotando en una esquina de TODA la app (se monta una sola vez en
 * app/_layout.tsx, fuera del Stack, así que no se reinicia al navegar).
 * - Se mueve sola (components/marca/MarcaAnimada.tsx) y se puede arrastrar a
 *   cualquier altura de los dos lados (se recuerda en AsyncStorage).
 * - Se aparta sola (web): si debajo de ella hay texto, un botón, un campo o una foto
 *   (document.elementsFromPoint en 9 puntos de su caja), busca el hueco libre más
 *   cercano en su lado (o en el otro) y vuelve a su sitio cuando queda libre. Lo mira
 *   al cambiar de pantalla, al dejar de desplazarse y cada 4 s.
 * - Guía de bienvenida (GuiaBlue): a los 15 s, una vez por dispositivo y solo sin
 *   sesión. 12 pasos con datos reales de la tienda que SEÑALAN cada botón (se oscurece
 *   todo menos él, aro azul que late y flecha): las 5 secciones de abajo, el buscador y
 *   el propio Blue (data-testid "pestana-*" en app/(tabs)/_layout.tsx, id
 *   "buscador-flotante" en components/Barramagic.tsx). Va a Inicio al empezar, se usa con
 *   un dedo (deslizar o «Siguiente» abajo a la derecha; si el botón está abajo, la tarjeta
 *   se pone justo encima) y al final ayuda a crear cuenta o a iniciar sesión
 *   (/perfil?acceso=registro|entrar). Se puede repetir desde el panel de Blue.
 * - Aparece 10 s después de entrar en la web (APARECER_MS, contados desde que
 *   se abrió la página con performance.now()): antes no se ve ni se puede tocar.
 *   Entra con un rebote de escala, saluda moviéndose de lado a lado y enseña un
 *   mini bocadillo "¡Hola! Soy Blue" unos segundos (al tocarlo abre su panel).
 * - Scroll (solo web): al bajar se desliza hacia su borde y se desvanece; al
 *   subir vuelve. Escucha el scroll de CUALQUIER contenedor (listener en
 *   document con capture) y compara el scrollTop de ese mismo elemento con el
 *   anterior, con un umbral de 12 px para no parpadear; los carruseles
 *   horizontales (no cambian scrollTop) no cuentan. Cerca del principio
 *   (scrollTop < 40) siempre se ve. No se oculta con su panel abierto, con un
 *   bocadillo o con el saludo a la vista, y vuelve a verse al cambiar de pantalla.
 * - Habla con bocadillos AL LADO de ella, en cristal transparente (se lee bien) y al
 *   tocarlos llevan a lo que dicen (solo cuando ya ha aparecido):
 *   · En la ficha de un producto, tras 8 s: un dato real del producto (si la
 *     descripción menciona la garantía, esa frase; si no, que es unidad única y se
 *     reserva 15 minutos en la cesta) y después cómo se entrega (en persona en
 *     Zaragoza o envío a toda España); al tocarlos se abre el chat de la tienda
 *     (Blue IA con el producto ya indicado; desde ahí, si hace falta, el equipo).
 *   · En el resto de la tienda, tras 12 s: una de las "Noticias Flash" activas
 *     (tabla flash_news, se editan en app/admin/flash-news.tsx).
 *   Cada bocadillo sale una sola vez por visita y se cierra con la X.
 * - Al tocar a Blue se abre su panel con 3 pestañas: "Asistente" (hablar con Blue
 *   IA, hablar con nuestro equipo —pasando antes por Blue IA—, "Vender"), "Notificaciones" (lo que antes era la campanita:
 *   mensajes sin leer, favoritos que ya no están, novedades; con su número) y
 *   "Noticias" (Noticias Flash). Si hay notificaciones, abre en esa pestaña.
 * - Avisos de Noticias Gaming: si el cliente los activó (con sesión,
 *   preferencias_usuario.avisos_noticias; sin sesión o si esa tabla falla, la clave
 *   local NOTICIAS_AVISOS_KEY = "1"), cuenta las noticias publicadas desde la última
 *   vez que las vio (lo más reciente entre preferencias_usuario.noticias_vistas_hasta
 *   y NOTICIAS_VISTAS_KEY; si no hay ninguna, las de las últimas 24 h). Se suman al
 *   número rojo y salen en Notificaciones ("Ver noticias"). Si no están activados,
 *   ahí mismo se explica cómo activarlos (campana de Noticias Gaming).
 * - Avisos de la tienda (en Notificaciones, con sus ajustes debajo):
 *   · Artículos nuevos: si el cliente lo activa (preferencias_usuario.avisos_novedades o,
 *     sin sesión, NOVEDADES_AVISOS_KEY), cuenta los productos con products.novedad_en
 *     posterior a la última vez que los vio. Apagado por defecto.
 *   · «Avísame cuando llegue» (con sesión): el cliente apunta hasta 10 búsquedas
 *     (tabla avisos_busqueda; también desde el catálogo sin resultados con
 *     crearAvisoBusqueda) y Blue le avisa cuando entra un artículo con todas esas palabras.
 *   · Bajada de precio: de lo que le gusta (LIKED_PRODUCTS_KEY) o tiene en la cesta
 *     (CART_KEY) se guarda en el móvil el precio visto (PRECIOS_VISTOS_KEY); si baja, avisa.
 *   · Solo el admin: ventas de artículos de VeoAura que aún no se han podido confirmar a
 *     VeoAura (tabla escaparate_salida) → panel Escaparate.
 *
 * Rendimiento: el sondeo (45 s) de mensajes sin leer y de noticias nuevas se pausa
 * con la pestaña en segundo plano (web). El recuento de noticias es head (sin
 * filas). Las consultas del bocadillo son pequeñas y de una fila.
 *
 * Conectado con:
 * - app/_layout.tsx → la monta una sola vez.
 * - app/(tabs)/blue-ia.tsx → chat completo con Blue IA.
 * - sql/product_chats.sql → get_unread_chat_count().
 * - app/producto/[id].tsx → misma clave de "me gusta" (LIKED_PRODUCTS_KEY).
 * - app/(tabs)/chat-global.tsx → misma clave/versión de "Novedades vistas" y mismas
 *   claves de avisos de noticias (activar con la campana; marcar como vistas).
 * - supabase/migrations/20261013200000_noticias_comentarios_preferencias.sql →
 *   tabla preferencias_usuario (cada usuario lee la suya).
 * - app/vender.tsx → página "Vender" (botones de Blue, de su panel y de la guía).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname, type Href } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { getAnalyticsConsent, marcarOrigenVender, trackEvent } from "../lib/analytics";
import { guardarConocimiento, temasRespondidos, TEMAS_CONOCIMIENTO, type TemaConocimiento } from "../lib/conocimiento";
import { estadoNotificaciones, notificarMensajeNuevo } from "../lib/notificaciones";
import MarcaAnimada from "./marca/MarcaAnimada";

const COLORS = {
  bg: "#FFFFFF",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  accent: "#1EA7E8",
  accentDark: "#1EA7E8",
  accentSoft: "#EAF6FD",
  danger: "#DC2626",
};

// Mensajes de Blue en «cristal»: casi transparentes (se ve lo de detrás, difuminado) pero
// con el texto siempre legible.
const CRISTAL = {
  backgroundColor: "rgba(255,255,255,0.72)",
  borderRadius: 18,
  borderWidth: 1,
  borderColor: "rgba(227,234,242,0.9)",
  shadowColor: "#0B2138",
  shadowOpacity: 0.1,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 6,
  ...(Platform.OS === "web" ? ({ backdropFilter: "blur(12px) saturate(160%)", WebkitBackdropFilter: "blur(12px) saturate(160%)" } as object) : {}),
};
const TEXTO_CRISTAL = {
  color: "#0B2138",
  ...(Platform.OS === "web" ? ({ textShadow: "0 0 6px rgba(255,255,255,0.9)" } as object) : {}),
};

const CORNER_KEY = "videojuegoszaragoza:campanita_corner";
// El aviso de Blue sobre el selector de pestañas del Foro sale una sola vez por dispositivo
// (también cuenta como visto si se enseñó en la guía).
const SELECTOR_VISTO_KEY = "videojuegoszaragoza:blue_aviso_selector_visto";
const LIKED_PRODUCTS_KEY = "videojuegoszaragoza:liked_products";
const NOVEDADES_SEEN_KEY = "videojuegoszaragoza:novedades_seen_version";
const NOVEDADES_CONTENT_VERSION = 1;
// Avisos de Noticias Gaming sin sesión ("1" = activados) y fecha ISO de la última
// vez que se vieron las noticias (las escribe app/(tabs)/chat-global.tsx).
const NOTICIAS_AVISOS_KEY = "videojuegoszaragoza:noticias_avisos";
const NOTICIAS_VISTAS_KEY = "videojuegoszaragoza:noticias_vistas_hasta";
const DIA_MS = 24 * 60 * 60 * 1000;
// Avisos de artículos nuevos sin sesión ("1" = activados) y hasta cuándo se vieron.
const NOVEDADES_AVISOS_KEY = "videojuegoszaragoza:novedades_avisos";
const NOVEDADES_VISTAS_KEY = "videojuegoszaragoza:novedades_vistas_hasta";
// Precio visto de cada producto que gusta o está en la cesta ({ id: precio }).
const PRECIOS_VISTOS_KEY = "videojuegoszaragoza:precios_vistos";
// Misma clave de la cesta que app/(tabs)/cesta.tsx, app/checkout.tsx y la ficha.
const CART_KEY = "videojuegoos_cart_v1";

type ProductoAviso = { id: string; title: string; price: number };
type AvisoBusqueda = { id: string; texto: string; visto_hasta: string };
type Llegada = { aviso: AvisoBusqueda; productos: ProductoAviso[] };
type Bajada = { id: string; title: string; antes: number; ahora: number };

// Precio siempre con dos decimales, coma decimal y miles con punto (155,00€ · 1.299,00€).
function fmtEUR(value: number) {
  const v = Number(value);
  const cents = Math.round((Number.isFinite(v) ? v : 0) * 100);
  const [ent, dec] = (Math.abs(cents) / 100).toFixed(2).split(".");
  return `${cents < 0 ? "-" : ""}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}€`;
}

// Quien escucha cambios de «Avísame cuando llegue» (el catálogo crea avisos y Blue los relee).
const oyentesAvisos = new Set<() => void>();

// Crea un aviso «Avísame cuando llegue» para el cliente con sesión. Lo usa también el
// catálogo cuando una búsqueda no encuentra nada.
export async function crearAvisoBusqueda(texto: string): Promise<"ok" | "sin_sesion" | "limite" | "error"> {
  const limpio = texto.replace(/\s+/g, " ").trim().slice(0, 60);
  if (limpio.length < 2) return "error";
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) return "sin_sesion";
    const { error } = await supabase.from("avisos_busqueda").insert({ texto: limpio });
    if (error) return /10 avisos/.test(String(error.message)) ? "limite" : "error";
    oyentesAvisos.forEach((f) => f());
    return "ok";
  } catch {
    return "error";
  }
}

async function leerJsonLocal<T>(clave: string, porDefecto: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(clave);
    return raw ? (JSON.parse(raw) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
}

const BLUE_SIZE = 72;
const EDGE_INSET = 6;
const TOP_INSET = 40;
const BOTTOM_INSET = 84;
const TAP_THRESHOLD = 6;
const POLL_MS = 45000;
const PRODUCTO_ESPERA_MS = 8000;
const SEGUNDO_MENSAJE_MS = 7000;
const NOTICIA_ESPERA_MS = 12000;
// Blue aparece 10 s después de entrar en la web; el saludo se ve unos segundos.
const APARECER_MS = 10000;
// Guía de bienvenida: a los 15 s, una sola vez, para quien entra sin cuenta.
const GUIA_MS = 15000;
const GUIA_VISTA_KEY = "videojuegoszaragoza:guia_vista";
const SALUDO_MS = 2800;
// Scroll: píxeles mínimos para ocultar/mostrar (sin parpadeos) y zona de arriba
// en la que siempre se ve.
const SCROLL_UMBRAL = 12;
const SCROLL_ARRIBA = 40;
// Blue se esconde al bajar y reaparece cuando la pantalla lleva este tiempo quieta.
const PARADA_MS = 450;
// Cuánto se desliza hacia su borde al ocultarse.
const DESLIZ_OCULTO = BLUE_SIZE + EDGE_INSET + 16;
// Animaciones por el hilo nativo salvo en web (allí no existe).
const USA_NATIVO = Platform.OS !== "web";

// Dónde está Blue: pegado a un lado ("l" izquierda, "r" derecha) y a qué altura (fy: 0 =
// arriba del todo, 1 = abajo del todo, dentro de la zona útil). Antes solo había 4 esquinas.
type Lado = "l" | "r";
type Sitio = { lado: Lado; fy: number };
// Blue NUNCA se pone abajo a la derecha (petición del dueño): ahí están el botón de volver
// arriba, «Volver» y el de enviar, y es donde llega el pulgar. En el lado derecho solo
// puede estar de la mitad de la pantalla hacia arriba.
const FY_MAX_DERECHA = 0.5;
const SITIO_INICIAL: Sitio = { lado: "l", fy: 1 };
// Alturas que prueba cuando tiene que apartarse (se ordenan por cercanía a su sitio).
const ALTURAS_CANDIDATAS = [1, 0.85, 0.7, 0.55, 0.4, 0.25, 0.1, 0];
// Cada cuánto mira si está tapando algo y cuánto espera tras dejar de desplazarse o tras
// tocar algo (por ejemplo, al abrirse un desplegable). Se aparta en seguida.
const APARTARSE_CADA_MS = 1200;
const APARTARSE_TRAS_SCROLL_MS = 220;
// id del contenedor de Blue en la web (para no confundirse a sí mismo con el contenido).
const BLUE_DOM_ID = "blue-flotante";
// El mensaje que sale al lado de Blue (no el saludo, que dura unos segundos): se mide para que
// tampoco tape botones.
const BLUE_MENSAJE_DOM_ID = "blue-mensaje";

// Mensajes de Blue: al tocarlos llevan a lo que dicen. "chat" abre el chat de la tienda
// (Blue IA primero; desde ahí, el equipo), "ruta" va a esa pantalla, "vender" abre el
// formulario de venta, "panel" abre el panel de Blue.
type Bocadillo = {
  id: string;
  texto: string;
  accion?: "chat" | "ruta" | "vender" | "panel" | "instalar" | "conocimiento";
  ruta?: string;
  // «conocimiento»: tema de lib/conocimiento.ts que Blue le propone al dueño en el panel.
  tema?: string;
};

// --- Blue propone información de la tienda (solo el dueño, en el panel de administración) ---
// A lo largo del día (de 9 a 21 h), con huecos de 45 min y hasta 8 veces al día, Blue le propone
// un tema pendiente de «Lo que Blue sabe» (horario, envíos, garantía…). La respuesta la escribe
// el dueño y Blue IA la usa con los clientes. «Ahora no» lo aparca hasta mañana y «No aplica»
// no lo vuelve a proponer.
const PROP_KEY = "videojuegoszaragoza:blue_propuestas";
const PROP_HUECO_MS = 45 * 60 * 1000;
const PROP_MAX_DIA = 8;
type EstadoProp = { fecha: string; n: number; ultima: number; hoyNo: string[]; descartados: string[] };
function fechaHoy(): string {
  return new Date().toLocaleDateString("sv");
}
async function leerEstadoProp(): Promise<EstadoProp> {
  const base: EstadoProp = { fecha: fechaHoy(), n: 0, ultima: 0, hoyNo: [], descartados: [] };
  try {
    const raw = await AsyncStorage.getItem(PROP_KEY);
    if (!raw) return base;
    const e = JSON.parse(raw) as Partial<EstadoProp>;
    const descartados = Array.isArray(e.descartados) ? e.descartados : [];
    // Un día nuevo reinicia el contador y los «ahora no».
    if (e.fecha !== base.fecha) return { ...base, descartados };
    return { ...base, ...e, descartados, hoyNo: Array.isArray(e.hoyNo) ? e.hoyNo : [] };
  } catch {
    return base;
  }
}
async function guardarEstadoProp(e: EstadoProp): Promise<void> {
  try {
    await AsyncStorage.setItem(PROP_KEY, JSON.stringify(e));
  } catch {
    // sin memoria local: se vuelve a proponer, no pasa nada
  }
}

// Lo que ya dijo Blue en esta visita (no se repite al volver a la misma ficha).
const yaDicho = new Set<string>();

// --- Instalar la tienda como app (solo web) ----------------------------------------------
// Chrome/Android avisa con «beforeinstallprompt»: se guarda el evento y Blue ofrece un botón
// que abre el diálogo de instalación. En iPhone/iPad (Safari) no existe ese diálogo: Blue
// enseña los pasos de «Añadir a pantalla de inicio». Si ya está instalada, no se ofrece.
type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let eventoInstalar: EventoInstalar | null = null;
const oyentesInstalar = new Set<() => void>();
const INSTALAR_KEY = "videojuegoszaragoza:blue_instalar_visto";
const INSTALAR_ESPERA_MS = 7 * 24 * 60 * 60 * 1000;

function esWebConVentana(): boolean {
  return Platform.OS === "web" && typeof window !== "undefined";
}
function appYaInstalada(): boolean {
  if (!esWebConVentana()) return false;
  try {
    return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}
function esAppleMovil(): boolean {
  if (!esWebConVentana()) return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}
// "prompt" = diálogo propio del navegador; "ios" = pasos manuales; null = no se ofrece.
function modoInstalar(): "prompt" | "ios" | null {
  if (!esWebConVentana() || appYaInstalada()) return null;
  if (eventoInstalar) return "prompt";
  return esAppleMovil() ? "ios" : null;
}
if (esWebConVentana()) {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    eventoInstalar = e as EventoInstalar;
    oyentesInstalar.forEach((f) => f());
  });
  window.addEventListener("appinstalled", () => {
    eventoInstalar = null;
    trackEvent("app_instalada", "App instalada");
    oyentesInstalar.forEach((f) => f());
  });
}

function limitar(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

// Un sitio permitido: nunca abajo a la derecha. Si cae ahí, sube en el mismo lado.
function sitioPermitido(s: Sitio): Sitio {
  return s.lado === "r" && s.fy > FY_MAX_DERECHA ? { lado: "r", fy: FY_MAX_DERECHA } : s;
}

function sitioToXY(s: Sitio) {
  const { width, height } = Dimensions.get("window");
  const x = s.lado === "r" ? width - BLUE_SIZE - EDGE_INSET : EDGE_INSET;
  const yMin = TOP_INSET;
  const yMax = Math.max(yMin, height - BLUE_SIZE - BOTTOM_INSET);
  return { x, y: yMin + (yMax - yMin) * limitar(s.fy, 0, 1) };
}

// Posición guardada: la nueva ({lado, fy}) o la antigua de 4 esquinas ("tl", "br"…).
function leerSitio(raw: string | null): Sitio {
  if (!raw) return SITIO_INICIAL;
  const esquinas: Record<string, Sitio> = {
    tl: { lado: "l", fy: 0 },
    tr: { lado: "r", fy: 0 },
    bl: { lado: "l", fy: 1 },
    br: { lado: "r", fy: 1 },
  };
  if (esquinas[raw]) return sitioPermitido(esquinas[raw]);
  try {
    const s = JSON.parse(raw);
    if ((s?.lado === "l" || s?.lado === "r") && Number.isFinite(s?.fy)) {
      return sitioPermitido({ lado: s.lado, fy: limitar(Number(s.fy), 0, 1) });
    }
  } catch {
    // formato desconocido
  }
  return SITIO_INICIAL;
}

// --- Apartarse cuando tapa algo (solo web) --------------------------------------------
// ¿Lo que hay en ese punto es contenido (texto, botón, campo, imagen…) y no un fondo vacío?
function esContenido(el: Element): boolean {
  if (el.closest(`#${BLUE_DOM_ID}`)) return false;
  const tag = el.tagName;
  if (tag === "HTML" || tag === "BODY") return false;
  if (["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A", "IMG", "VIDEO", "CANVAS", "svg", "SVG", "path"].includes(tag)) return true;
  if (el.closest('button,a,input,textarea,select,[role="button"],[role="link"],[role="tab"],[role="switch"],[role="checkbox"]')) return true;
  // Botones de react-native-web (Pressable): no son <button> ni llevan rol, pero se pueden
  // enfocar (tabindex) y tienen cursor de mano. Sin esto, Blue se quedaba encima de la
  // parte de color de «Aceptar» del aviso de cookies.
  const tocable = el.closest('[tabindex]:not([tabindex="-1"])');
  if (tocable && tocable.getBoundingClientRect().width < window.innerWidth * 0.95) return true;
  if (typeof window !== "undefined" && window.getComputedStyle(el).cursor === "pointer") return true;
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 3 && (n.textContent ?? "").trim()) return true;
  }
  // Fotos de React Native Web (fondo con imagen).
  const fondo = typeof window !== "undefined" ? window.getComputedStyle(el).backgroundImage : "";
  return !!fondo && fondo.includes("url(");
}

// Cuántos puntos de la caja de Blue en (x, y) caen sobre contenido (0 = sitio libre).
// Cuánto «molesta» taparlo: los controles (botones, enlaces, campos, el botón de volver) pesan
// más que el texto, y el texto más que una foto. Así Blue prefiere quedarse sobre una foto antes
// que sobre un botón, aunque la foto ocupe más sitio.
function pesoContenido(el: Element): number {
  if (!esContenido(el)) return 0;
  if (el.closest('button,a,input,textarea,select,[role="button"],[role="link"],[role="tab"],[role="switch"],[role="checkbox"]')) return 6;
  const tocable = el.closest('[tabindex]:not([tabindex="-1"])');
  if (tocable && tocable.getBoundingClientRect().width < window.innerWidth * 0.95) return 6;
  if (window.getComputedStyle(el).cursor === "pointer") return 6;
  if (["IMG", "VIDEO", "CANVAS"].includes(el.tagName)) return 1;
  return 2;
}

// Puntuación de lo que hay debajo de la caja de Blue en (x, y): 0 = sitio libre; cuanto más alta,
// peor (controles > texto > fotos). Se mira con una rejilla de 4 × 4 puntos para no dejar escapar
// botones pequeños como el de volver (40 px).
function contenidoDebajo(x: number, y: number): number {
  if (typeof document === "undefined" || typeof document.elementsFromPoint !== "function") return 0;
  let tapados = 0;
  const pasos = [0.1, 0.37, 0.63, 0.9];
  for (const fx of pasos) {
    for (const fy of pasos) {
      const px = x + BLUE_SIZE * fx;
      const py = y + BLUE_SIZE * fy;
      // El primero que no sea el propio Blue es lo que se ve debajo.
      const debajo = document.elementsFromPoint(px, py).find((el) => !el.closest(`#${BLUE_DOM_ID}`));
      if (debajo) tapados += pesoContenido(debajo);
    }
  }
  return tapados;
}

// Lo mismo para el mensaje que sale al lado de Blue, si hay uno a la vista: sale hacia
// el centro de la pantalla (a la izquierda si Blue está a la derecha) y, según la altura, pegado
// arriba o abajo. Se mira con una rejilla de 6 × 3 puntos. Así Blue no se queda en un sitio donde
// su mensaje taparía «Comprar ya» (en escritorio el mensaje mide hasta 330 px).
// Solo cuentan los controles (botones, enlaces, campos): taparlos es lo grave; tapar texto o una
// foto con un mensaje que se cierra con la X no. Y un roce con un solo punto no justifica moverse.
// Esta puntuación pesa mucho menos que la de la propia Blue (ver PESO_BLUE): lo primero es que Blue
// no tape nada, y solo entre sitios igual de libres se prefiere el que deja libre el mensaje.
const PESO_BLUE = 1000;
function contenidoDebajoDelMensaje(s: Sitio, x: number, y: number): number {
  if (typeof document === "undefined" || typeof document.elementsFromPoint !== "function") return 0;
  const m = document.getElementById(BLUE_MENSAJE_DOM_ID);
  if (!m || !m.offsetWidth || !m.offsetHeight) return 0;
  const ancho = m.offsetWidth;
  const alto = m.offsetHeight;
  const izq = s.lado === "r" ? x - 6 - ancho : x + BLUE_SIZE + 6;
  const arriba = s.fy < 0.5;
  const sup = arriba ? y + 2 : y + BLUE_SIZE - 2 - alto;
  const { width, height } = Dimensions.get("window");
  let tapados = 0;
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 3; j++) {
      const px = izq + ancho * ((i + 0.5) / 6);
      const py = sup + alto * ((j + 0.5) / 3);
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const debajo = document.elementsFromPoint(px, py).find((el) => !el.closest(`#${BLUE_DOM_ID}`));
      const peso = debajo ? pesoContenido(debajo) : 0;
      if (peso >= 6) tapados += peso;
    }
  }
  return tapados >= 12 ? tapados : 0;
}

// Mejor sitio libre: primero el que eligió la persona; si tapa algo, el hueco más vacío
// (mismo lado antes que el otro, y lo más cerca posible de donde estaba).
function buscarSitioLibre(preferido: Sitio, actual: Sitio): Sitio | null {
  const puntuar = (s: Sitio) => {
    const { x, y } = sitioToXY(s);
    return contenidoDebajo(x, y) * PESO_BLUE + contenidoDebajoDelMensaje(s, x, y);
  };
  if (puntuar(preferido) === 0) return preferido;
  const enActual = puntuar(actual);
  if (enActual === 0) return actual;
  let mejor: { s: Sitio; tapados: number; distancia: number } | null = null;
  // De la altura más cercana a la preferida a la más lejana.
  const alturas = [...ALTURAS_CANDIDATAS, preferido.fy].sort((a, b) => Math.abs(a - preferido.fy) - Math.abs(b - preferido.fy));
  for (const lado of [preferido.lado, preferido.lado === "r" ? "l" : "r"] as Lado[]) {
    for (const fy of alturas) {
      const s = { lado, fy };
      // Abajo a la derecha no se pone nunca, ni siquiera para apartarse.
      if (sitioPermitido(s) !== s) continue;
      const tapados = puntuar(s);
      const distancia = Math.abs(fy - preferido.fy) + (lado === preferido.lado ? 0 : 0.5);
      if (!mejor || tapados < mejor.tapados || (tapados === mejor.tapados && distancia < mejor.distancia)) {
        mejor = { s, tapados, distancia };
      }
      if (tapados === 0 && lado === preferido.lado) break;
    }
    if (mejor?.tapados === 0) break;
  }
  return mejor && mejor.tapados < enActual ? mejor.s : null;
}

// A dónde lleva un aviso de «Noticias Flash» según lo que dice (lo escribe el dueño).
function destinoDeAviso(texto: string): Pick<Bocadillo, "accion" | "ruta"> {
  const t = texto.toLowerCase();
  if (/compramos|vend|tasa|véndenos|vendenos/.test(t)) return { accion: "vender" };
  if (/repar|limpieza|mantenimiento|arregl/.test(t)) return { accion: "ruta", ruta: "/servicios" };
  if (/envío|envio|entrega|recog/.test(t)) return { accion: "ruta", ruta: "/politicas/envios" };
  if (/devoluci/.test(t)) return { accion: "ruta", ruta: "/politicas/devoluciones" };
  if (/noticia/.test(t)) return { accion: "ruta", ruta: "/chat-global?tab=news" };
  if (/nuev|lleg|novedad|oferta|descuento|rebaj|cat[aá]logo/.test(t)) return { accion: "ruta", ruta: "/catalogo" };
  // Si no se sabe, Blue IA con ese aviso como tema (lo conoce y lo explica).
  return { accion: "ruta", ruta: `/blue-ia?tema=${encodeURIComponent(texto.slice(0, 120))}` };
}

async function getLikedProductIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(LIKED_PRODUCTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

// Fecha ISO → milisegundos (0 si falta o no es válida).
function isoAMs(iso: string | null | undefined): number {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? ms : 0;
}

// Frase de la descripción que habla de la garantía (la escribe la tienda en cada producto).
function fraseGarantia(descripcion: string | null | undefined): string | null {
  const texto = String(descripcion ?? "").replace(/\s+/g, " ").trim();
  if (!texto) return null;
  const f = texto.match(/[^.!?¡¿]*garant[ií]a[^.!?]*/i)?.[0];
  if (!f) return null;
  return f.replace(/^[\s,;:-]+/, "").trim().slice(0, 160);
}

function mensajeProducto(titulo: string, descripcion: string | null): string {
  const garantia = fraseGarantia(descripcion);
  if (garantia) {
    if (/^(incluye|tiene|viene|cuenta|lleva|está|esta)\b/i.test(garantia)) {
      return `¿Sabías que ${titulo} ${garantia.charAt(0).toLowerCase()}${garantia.slice(1)}?`;
    }
    return `Sobre ${titulo}: ${garantia}.`;
  }
  return `¿Te gusta ${titulo}? Es unidad única: si la añades a la cesta te la reservamos 15 minutos.`;
}

export default function Campanita() {
  const pathname = usePathname() ?? "";
  const enAdmin = pathname.startsWith("/admin");
  // En las pantallas de chat (y en el propio chat de Blue IA) no se muestra: taparía
  // el campo de escribir y el botón de enviar.
  const enChat =
    pathname.startsWith("/blue-ia") ||
    pathname.startsWith("/chat-global") ||
    pathname.startsWith("/chat/") ||
    // La página de venta es un formulario largo: Blue taparía los campos y el botón de enviar.
    pathname.startsWith("/vender");

  const [ready, setReady] = useState(false);
  // sitio = donde está ahora; preferidoRef = donde lo dejó la persona (vuelve ahí en cuanto
  // ese sitio no tapa nada).
  const sitioRef = useRef<Sitio>(SITIO_INICIAL);
  const preferidoRef = useRef<Sitio>(SITIO_INICIAL);
  const [sitio, setSitio] = useState<Sitio>(SITIO_INICIAL);
  const arrastrandoRef = useRef(false);
  const posRef = useRef({ x: 0, y: 0 });
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const [panelOpen, setPanelOpen] = useState(false);
  // «Vender» es una página (app/vender.tsx), no una ventana emergente.
  const abrirVender = useCallback(() => router.push("/vender" as Href), []);
  // Guía de bienvenida (GuiaBlue, al final de este archivo).
  const [guiaAbierta, setGuiaAbierta] = useState(false);
  const guiaPendienteRef = useRef(false);
  // Durante la guía Blue se esconde (no tapa la tarjeta ni sus botones) salvo en el paso
  // que le señala a él.
  const [guiaSenalaBlue, setGuiaSenalaBlue] = useState(false);
  // Aviso de Blue en el Foro: señala el botón del selector de pestañas (una vez por visita).
  const [avisoSelector, setAvisoSelector] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [unreadChats, setUnreadChats] = useState(0);
  const [likedUnavailable, setLikedUnavailable] = useState<string[]>([]);
  const [novedadesPending, setNovedadesPending] = useState(false);
  const [noticias, setNoticias] = useState<string[]>([]);
  // Avisos de Noticias Gaming: si están activados y cuántas hay sin ver.
  const [avisosNoticias, setAvisosNoticias] = useState(false);
  const [noticiasNuevas, setNoticiasNuevas] = useState(0);
  // Avisos de la tienda: artículos nuevos, «Avísame cuando llegue», bajadas de precio y,
  // solo el admin, ventas de VeoAura sin confirmar.
  const [avisosNovedades, setAvisosNovedades] = useState(false);
  const [novedadesTienda, setNovedadesTienda] = useState(0);
  const [avisosBusqueda, setAvisosBusqueda] = useState<AvisoBusqueda[]>([]);
  const [llegadas, setLlegadas] = useState<Llegada[]>([]);
  const [bajadas, setBajadas] = useState<Bajada[]>([]);
  const [salidaPendiente, setSalidaPendiente] = useState(0);
  const [textoAviso, setTextoAviso] = useState("");
  const [msgAviso, setMsgAviso] = useState<string | null>(null);
  const [bocadillo, setBocadillo] = useState<Bocadillo | null>(null);
  const bocadilloRef = useRef<Bocadillo | null>(null);
  bocadilloRef.current = bocadillo;
  const propuestaAbiertaRef = useRef(false);
  // Instalar la tienda como app: cómo se ofrece en este dispositivo y los pasos de iPhone.
  const [modoInst, setModoInst] = useState<"prompt" | "ios" | null>(null);
  const [pasosIosAbiertos, setPasosIosAbiertos] = useState(false);
  // Propuesta de Blue al dueño (panel de administración): tema abierto, su respuesta y estado.
  const [propuesta, setPropuesta] = useState<TemaConocimiento | null>(null);
  const [respuestaProp, setRespuestaProp] = useState("");
  const [guardandoProp, setGuardandoProp] = useState(false);
  const [errorProp, setErrorProp] = useState<string | null>(null);
  propuestaAbiertaRef.current = !!propuesta;
  const cerrarPropuesta = useCallback(
    async (como: "ahora-no" | "no-aplica" | "guardada") => {
      const tema = propuesta?.tema;
      setPropuesta(null);
      setRespuestaProp("");
      setErrorProp(null);
      if (!tema || como === "guardada") return;
      const e = await leerEstadoProp();
      if (como === "ahora-no") e.hoyNo = [...new Set([...e.hoyNo, tema])];
      else e.descartados = [...new Set([...e.descartados, tema])];
      await guardarEstadoProp(e);
    },
    [propuesta]
  );
  const guardarPropuesta = useCallback(async () => {
    if (!propuesta || guardandoProp) return;
    setGuardandoProp(true);
    setErrorProp(null);
    const error = await guardarConocimiento(propuesta.tema, respuestaProp);
    setGuardandoProp(false);
    if (error) {
      setErrorProp(error);
      return;
    }
    await cerrarPropuesta("guardada");
    setBocadillo({ id: "prop-ok", texto: "¡Guardado! Desde ahora lo uso al responder a tus clientes." });
  }, [propuesta, respuestaProp, guardandoProp, cerrarPropuesta]);
  useEffect(() => {
    const actualizar = () => setModoInst(modoInstalar());
    actualizar();
    oyentesInstalar.add(actualizar);
    return () => {
      oyentesInstalar.delete(actualizar);
    };
  }, []);
  const instalarApp = useCallback(async () => {
    setPanelOpen(false);
    trackEvent("instalar_toque", "Instalar app: toque");
    const ev = eventoInstalar;
    if (ev) {
      try {
        await ev.prompt();
        const r = await ev.userChoice;
        if (r.outcome === "accepted") trackEvent("instalar_aceptada", "Instalar app: aceptada");
      } catch {
        // el navegador no dejó abrir el diálogo
      }
      // El evento solo vale una vez.
      eventoInstalar = null;
      setModoInst(modoInstalar());
    } else if (esAppleMovil()) {
      setPasosIosAbiertos(true);
    }
  }, []);
  // Pestañas del panel de Blue: asistente, notificaciones (antes la campanita) y noticias.
  const [pestana, setPestana] = useState<"blue" | "avisos" | "noticias">("blue");
  // Aparición a los 10 s, mini saludo y oculto por scroll hacia abajo.
  const [aparecido, setAparecido] = useState(false);
  const [saludando, setSaludando] = useState(false);
  const [ocultoScroll, setOcultoScroll] = useState(false);

  // --- posición -------------------------------------------------------------
  useEffect(() => {
    let alive = true;
    (async () => {
      let initial: Sitio = SITIO_INICIAL;
      try {
        initial = leerSitio(await AsyncStorage.getItem(CORNER_KEY));
      } catch {
        // se queda abajo a la derecha
      }
      if (!alive) return;
      sitioRef.current = initial;
      preferidoRef.current = initial;
      setSitio(initial);
      const xy = sitioToXY(initial);
      posRef.current = xy;
      pan.setValue(xy);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [pan]);

  // Mueve a Blue (con un muelle suave) a otro sitio sin cambiar el que eligió la persona.
  const moverA = useCallback(
    (s: Sitio) => {
      sitioRef.current = s;
      setSitio(s);
      const xy = sitioToXY(s);
      posRef.current = xy;
      // overshootClamping: el muelle no se pasa del sitio (no asoma fuera de la pantalla).
      Animated.spring(pan, { toValue: xy, useNativeDriver: false, friction: 8, tension: 50, overshootClamping: true }).start();
    },
    [pan]
  );

  useEffect(() => {
    const sub = Dimensions.addEventListener("change", () => {
      const xy = sitioToXY(sitioRef.current);
      posRef.current = xy;
      pan.setValue(xy);
    });
    return () => {
      // @ts-ignore — API antigua (RN<0.65) devuelve undefined
      sub?.remove?.();
    };
  }, [pan]);

  // --- datos -----------------------------------------------------------------
  const refreshAuth = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user ?? null;
      setIsLoggedIn(!!user);
      if (!user) {
        setIsAdmin(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle<{ role: string | null }>();
      setIsAdmin(String(profile?.role ?? "").trim().toLowerCase() === "admin");
    } catch {
      setIsLoggedIn(false);
      setIsAdmin(false);
    }
  }, []);

  const refreshChats = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user) {
        setUnreadChats(0);
        return;
      }
      const { data, error } = await supabase.rpc("get_unread_chat_count");
      if (error) throw error;
      setUnreadChats(typeof data === "number" ? data : 0);
    } catch {
      setUnreadChats(0);
    }
  }, []);

  const refreshLikes = useCallback(async () => {
    const ids = await getLikedProductIds();
    if (ids.length === 0) {
      setLikedUnavailable([]);
      return;
    }
    try {
      const { data, error } = await supabase.from("products").select("id").in("id", ids);
      if (error) throw error;
      const stillThere = new Set((data ?? []).map((r: { id: string }) => r.id));
      setLikedUnavailable(ids.filter((id) => !stillThere.has(id)));
    } catch {
      // sin conexión: se deja como estaba
    }
  }, []);

  const refreshNovedades = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(NOVEDADES_SEEN_KEY);
      const seenVersion = raw ? parseInt(raw, 10) : 0;
      setNovedadesPending(!(seenVersion >= NOVEDADES_CONTENT_VERSION));
    } catch {
      setNovedadesPending(false);
    }
  }, []);

  const refreshNoticias = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("flash_news")
        .select("message,sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(5);
      if (error) throw error;
      setNoticias((data ?? []).map((r: { message: string | null }) => String(r.message ?? "").trim()).filter(Boolean));
    } catch {
      setNoticias([]);
    }
  }, []);

  // Noticias Gaming nuevas desde la última vez que se vieron (solo si hay avisos activados).
  const refreshNoticiasNuevas = useCallback(async () => {
    let avisoLocal: string | null = null;
    let vistasLocal: string | null = null;
    try {
      avisoLocal = await AsyncStorage.getItem(NOTICIAS_AVISOS_KEY);
      vistasLocal = await AsyncStorage.getItem(NOTICIAS_VISTAS_KEY);
    } catch {
      // sin almacenamiento local: se sigue con lo de la cuenta
    }

    let activado = avisoLocal === "1";
    let vistasCuenta: string | null = null;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (user) {
        const { data, error } = await supabase
          .from("preferencias_usuario")
          .select("avisos_noticias,noticias_vistas_hasta")
          .eq("user_id", user.id)
          .maybeSingle<{ avisos_noticias: boolean | null; noticias_vistas_hasta: string | null }>();
        if (error) throw error;
        // Con fila guardada manda la cuenta; sin fila, lo local.
        if (data) {
          activado = data.avisos_noticias === true;
          vistasCuenta = data.noticias_vistas_hasta;
        }
      }
    } catch {
      // la tabla puede no existir aún: solo lo local
    }

    setAvisosNoticias(activado);
    if (!activado) {
      setNoticiasNuevas(0);
      return;
    }

    const vistasMs = Math.max(isoAMs(vistasCuenta), isoAMs(vistasLocal));
    const desde = new Date(vistasMs || Date.now() - DIA_MS).toISOString();
    try {
      const { count, error } = await supabase
        .from("noticias_gaming")
        .select("id", { count: "exact", head: true })
        .eq("publicada", true)
        .gt("created_at", desde);
      if (error) throw error;
      setNoticiasNuevas(count ?? 0);
    } catch {
      setNoticiasNuevas(0);
    }
  }, []);

  // Artículos nuevos en la tienda desde la última vez que se vieron (solo si lo activó).
  const refreshNovedadesTienda = useCallback(async () => {
    let activado = false;
    let vistasLocal: string | null = null;
    let vistasCuenta: string | null = null;
    try {
      activado = (await AsyncStorage.getItem(NOVEDADES_AVISOS_KEY)) === "1";
      vistasLocal = await AsyncStorage.getItem(NOVEDADES_VISTAS_KEY);
    } catch {
      // sin almacenamiento local: se sigue con lo de la cuenta
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (user) {
        const { data, error } = await supabase
          .from("preferencias_usuario")
          .select("avisos_novedades,novedades_vistas_hasta")
          .eq("user_id", user.id)
          .maybeSingle<{ avisos_novedades: boolean | null; novedades_vistas_hasta: string | null }>();
        if (error) throw error;
        if (data) {
          activado = data.avisos_novedades === true;
          vistasCuenta = data.novedades_vistas_hasta;
        }
      }
    } catch {
      // la columna puede no existir aún: solo lo local
    }

    setAvisosNovedades(activado);
    if (!activado) {
      setNovedadesTienda(0);
      return;
    }
    const vistasMs = Math.max(isoAMs(vistasCuenta), isoAMs(vistasLocal));
    const desde = new Date(vistasMs || Date.now() - DIA_MS).toISOString();
    try {
      const { count, error } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("status", "PUBLISHED")
        .eq("is_active", true)
        .gt("novedad_en", desde);
      if (error) throw error;
      setNovedadesTienda(count ?? 0);
    } catch {
      setNovedadesTienda(0);
    }
  }, []);

  // «Avísame cuando llegue»: por cada búsqueda guardada, artículos con TODAS sus palabras
  // que han entrado (o vuelto a la venta) después de la última vez que se avisó.
  const refreshAvisosBusqueda = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user) {
        setAvisosBusqueda([]);
        setLlegadas([]);
        return;
      }
      const { data, error } = await supabase
        .from("avisos_busqueda")
        .select("id,texto,visto_hasta")
        .order("created_at", { ascending: true })
        .limit(10);
      if (error) throw error;
      const avisos = (data ?? []) as AvisoBusqueda[];
      setAvisosBusqueda(avisos);

      const encontradas = await Promise.all(
        avisos.map(async (aviso) => {
          const palabras = aviso.texto
            .toLowerCase()
            .replace(/[%_\\,()]/g, " ")
            .split(/\s+/)
            .filter((w) => w.length >= 2)
            .slice(0, 5);
          if (!palabras.length) return null;
          let consulta = supabase
            .from("products")
            .select("id,title,price_eur")
            .eq("status", "PUBLISHED")
            .eq("is_active", true)
            .gt("novedad_en", aviso.visto_hasta);
          for (const w of palabras) consulta = consulta.ilike("title", `%${w}%`);
          const { data: prods } = await consulta.order("novedad_en", { ascending: false }).limit(3);
          const productos = ((prods ?? []) as { id: string; title: string; price_eur: number | string | null }[]).map((p) => ({
            id: p.id,
            title: p.title,
            price: Number(p.price_eur ?? 0),
          }));
          return productos.length ? { aviso, productos } : null;
        })
      );
      setLlegadas(encontradas.filter((x): x is Llegada => x !== null));
    } catch {
      // la tabla puede no existir aún: sin avisos
      setLlegadas([]);
    }
  }, []);

  // Bajadas de precio de lo que gusta o está en la cesta (precio visto guardado en el móvil).
  const refreshBajadas = useCallback(async () => {
    try {
      const gustan = await getLikedProductIds();
      const cesta = await leerJsonLocal<unknown[]>(CART_KEY, []);
      const enCesta = (Array.isArray(cesta) ? cesta : [])
        .map((it: any) => String(it?.id ?? ""))
        .filter(Boolean);
      const ids = [...new Set([...gustan, ...enCesta])].slice(0, 60);
      if (!ids.length) {
        setBajadas([]);
        return;
      }
      const { data, error } = await supabase.from("products").select("id,title,price_eur").in("id", ids);
      if (error) throw error;
      const vistos = await leerJsonLocal<Record<string, number>>(PRECIOS_VISTOS_KEY, {});
      const nuevos: Record<string, number> = {};
      const lista: Bajada[] = [];
      for (const p of (data ?? []) as { id: string; title: string; price_eur: number | string | null }[]) {
        const ahora = Number(p.price_eur ?? 0);
        const antes = Number(vistos[p.id]);
        if (Number.isFinite(antes) && antes > 0 && ahora > 0 && ahora < antes - 0.004) {
          lista.push({ id: p.id, title: p.title, antes, ahora });
          nuevos[p.id] = antes; // se mantiene hasta que lo vea
        } else {
          nuevos[p.id] = ahora; // primera vez o sube: se apunta el precio actual
        }
      }
      await AsyncStorage.setItem(PRECIOS_VISTOS_KEY, JSON.stringify(nuevos)).catch(() => {});
      setBajadas(lista);
    } catch {
      // sin conexión: se deja como estaba
    }
  }, []);

  // Solo el admin: ventas de artículos de VeoAura que aún no se han confirmado a VeoAura.
  const refreshSalida = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user) {
        setSalidaPendiente(0);
        return;
      }
      const { count, error } = await supabase
        .from("escaparate_salida")
        .select("id", { count: "exact", head: true })
        .in("estado", ["pendiente", "error"]);
      // Para quien no es admin, RLS no devuelve filas: cuenta 0.
      setSalidaPendiente(error ? 0 : count ?? 0);
    } catch {
      setSalidaPendiente(0);
    }
  }, []);

  const refreshAvisosTienda = useCallback(() => {
    refreshNovedadesTienda();
    refreshAvisosBusqueda();
    refreshBajadas();
    refreshSalida();
  }, [refreshNovedadesTienda, refreshAvisosBusqueda, refreshBajadas, refreshSalida]);

  // El catálogo puede crear avisos: entonces se releen.
  useEffect(() => {
    const oyente = () => {
      refreshAvisosBusqueda();
    };
    oyentesAvisos.add(oyente);
    return () => {
      oyentesAvisos.delete(oyente);
    };
  }, [refreshAvisosBusqueda]);

  useEffect(() => {
    refreshAuth();
    refreshChats();
    refreshLikes();
    refreshNovedades();
    refreshNoticias();
    refreshAvisosTienda();
    // refreshNoticiasNuevas() al montar lo hace el efecto de la ruta (más abajo).

    const hasDocument = typeof document !== "undefined";
    const isPageVisible = () => !hasDocument || document.visibilityState !== "hidden";
    const interval = setInterval(() => {
      if (!isPageVisible()) {
        // En segundo plano solo se mira el chat, y solo si hay avisos del navegador activados.
        if (estadoNotificaciones() === "activadas") refreshChats();
        return;
      }
      refreshChats();
      refreshNoticiasNuevas();
      refreshNovedadesTienda();
    }, POLL_MS);

    let onVisibilityChange: (() => void) | null = null;
    if (hasDocument) {
      onVisibilityChange = () => {
        if (document.visibilityState !== "visible") return;
        refreshChats();
        refreshNoticiasNuevas();
        refreshAvisosTienda();
      };
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    const { data: authSub } = supabase.auth.onAuthStateChange(() => {
      refreshAuth();
      refreshChats();
      refreshNoticiasNuevas();
      refreshAvisosTienda();
    });

    return () => {
      clearInterval(interval);
      if (hasDocument && onVisibilityChange) document.removeEventListener("visibilitychange", onVisibilityChange);
      authSub?.subscription?.unsubscribe?.();
    };
  }, [
    refreshAuth,
    refreshChats,
    refreshLikes,
    refreshNovedades,
    refreshNoticias,
    refreshNoticiasNuevas,
    refreshNovedadesTienda,
    refreshAvisosTienda,
  ]);

  // Cuenta las noticias al montar y otra vez al salir del Foro (donde se ven y se
  // actualiza la clave local de "vistas"), para que el número rojo no se quede viejo.
  const enForo = pathname.startsWith("/chat-global");

  // En el Foro Blue no se queda en pantalla (taparía el campo de escribir), pero sale UNA sola
  // vez por dispositivo (queda guardado), a los 2,5 s, para señalar el botón azul del selector de
  // pestañas. Si ya lo vio en la guía de Blue, tampoco sale.
  useEffect(() => {
    if (!enForo || guiaAbierta || yaDicho.has("selector-pestanas") || Platform.OS !== "web") return;
    let vivo = true;
    const t = setTimeout(async () => {
      try {
        // Con el aviso de cookies sin contestar, Blue no habla (lo taparía).
        if (!vivo || (await getAnalyticsConsent()) === null || !vivo) return;
        if ((await AsyncStorage.getItem(SELECTOR_VISTO_KEY)) === "1" || !vivo) return;
        yaDicho.add("selector-pestanas");
        AsyncStorage.setItem(SELECTOR_VISTO_KEY, "1").catch(() => {});
        setAvisoSelector(true);
      } catch {
        // sin aviso si falla
      }
    }, 2500);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [enForo, guiaAbierta]);
  useEffect(() => {
    if (!enForo) setAvisoSelector(false);
  }, [enForo]);
  useEffect(() => {
    if (!enForo) refreshNoticiasNuevas();
  }, [enForo, refreshNoticiasNuevas]);

  // Aviso del navegador cuando llegan mensajes nuevos al chat y la pestaña está en segundo plano
  // (solo si la persona activó las notificaciones; lib/notificaciones.ts). Los primeros 8 s no
  // cuentan: son los mensajes que ya estaban sin leer al abrir la tienda.
  const montadoEnRef = useRef(Date.now());
  const chatsPrevRef = useRef(0);
  useEffect(() => {
    const antes = chatsPrevRef.current;
    chatsPrevRef.current = unreadChats;
    if (unreadChats <= antes || Date.now() - montadoEnRef.current < 8000) return;
    notificarMensajeNuevo(unreadChats - antes, () => router.push((isAdmin ? "/admin/chats" : "/chat-global?tab=privados") as Href));
  }, [unreadChats, isAdmin]);

  const totalCount =
    unreadChats +
    likedUnavailable.length +
    (novedadesPending ? 1 : 0) +
    noticiasNuevas +
    (novedadesTienda > 0 ? 1 : 0) +
    llegadas.length +
    bajadas.length +
    (isAdmin && salidaPendiente > 0 ? 1 : 0);
  const badgeLabel = totalCount > 9 ? "9+" : String(totalCount);

  // --- bocadillos según la pantalla --------------------------------------------
  useEffect(() => {
    setBocadillo(null);
    if (enAdmin || guiaAbierta || pathname.startsWith("/checkout") || pathname.startsWith("/blue-ia")) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    let vivo = true;
    const m = pathname.match(/^\/producto\/([0-9a-f-]{36})/i);

    if (m) {
      const id = m[1];
      if (yaDicho.has(`p:${id}`)) return;
      timers.push(
        setTimeout(async () => {
          try {
            const { data } = await supabase
              .from("products")
              .select("title,description")
              .eq("id", id)
              .maybeSingle<{ title: string; description: string | null }>();
            if (!vivo || !data?.title) return;
            // Con el aviso de cookies aún sin contestar, Blue no habla (lo taparía).
            if ((await getAnalyticsConsent()) === null || !vivo) return;
            yaDicho.add(`p:${id}`);
            const titulo = data.title.trim();
            const ruta = `/blue-ia?producto=${id}`;
            setBocadillo({ id: `p1:${id}`, texto: mensajeProducto(titulo, data.description), accion: "chat", ruta });
            timers.push(
              setTimeout(() => {
                if (!vivo) return;
                // Habla de entregas y envíos: al tocarlo, la política de envíos.
                setBocadillo({
                  id: `p2:${id}`,
                  texto: "Realizamos entregas en persona en la ciudad de Zaragoza o envíos a toda España.",
                  accion: "ruta",
                  ruta: "/politicas/envios",
                });
              }, SEGUNDO_MENSAJE_MS)
            );
          } catch {
            // sin bocadillo si falla
          }
        }, PRODUCTO_ESPERA_MS)
      );
    } else if (noticias.length) {
      const pendiente = noticias.find((n) => !yaDicho.has(`n:${n}`));
      if (pendiente) {
        timers.push(
          setTimeout(async () => {
            // Con el aviso de cookies aún sin contestar, Blue no habla (lo taparía).
            if (!vivo || (await getAnalyticsConsent()) === null || !vivo) return;
            yaDicho.add(`n:${pendiente}`);
            setBocadillo({ id: `n:${pendiente}`, texto: pendiente, ...destinoDeAviso(pendiente) });
          }, NOTICIA_ESPERA_MS)
        );
      }
    }

    return () => {
      vivo = false;
      timers.forEach(clearTimeout);
    };
  }, [pathname, enAdmin, noticias, guiaAbierta]);

  // Animación de entrada del bocadillo.
  const bocAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!bocadillo) return;
    bocAnim.setValue(0);
    Animated.timing(bocAnim, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [bocadillo, bocAnim]);

  // --- aparición, saludo y scroll ---------------------------------------------------
  // 10 s desde que se abrió la página (performance.now() cuenta desde la carga).
  useEffect(() => {
    const yaPasado = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : 0;
    const timer = setTimeout(() => setAparecido(true), Math.max(0, APARECER_MS - yaPasado));
    return () => clearTimeout(timer);
  }, []);

  const entrada = useRef(new Animated.Value(0)).current;
  const saludo = useRef(new Animated.Value(0)).current;
  const chipAnim = useRef(new Animated.Value(0)).current;
  const ocultar = useRef(new Animated.Value(0)).current;
  const entradaHechaRef = useRef(false);
  const enPantalla = aparecido && ready && !enChat;

  // Oferta de instalar la tienda como app: un mensaje de Blue, una vez cada 7 días como mucho,
  // cuando ya lleva un rato en pantalla, no está hablando de otra cosa y la persona ya
  // contestó el aviso de cookies. Siempre queda el botón en el panel de Blue.
  useEffect(() => {
    if (!modoInst || !enPantalla || enAdmin || guiaAbierta || pathname.startsWith("/checkout")) return;
    let vivo = true;
    let t: ReturnType<typeof setTimeout>;
    // Si Blue está diciendo otra cosa, espera 15 s y lo intenta de nuevo (hasta 8 veces).
    const intentar = async (veces: number) => {
      try {
        if (!vivo || (await getAnalyticsConsent()) === null) return;
        const visto = Number((await AsyncStorage.getItem(INSTALAR_KEY)) ?? 0);
        if (!vivo || (visto && Date.now() - visto < INSTALAR_ESPERA_MS)) return;
        if (bocadilloRef.current) {
          if (veces < 8) t = setTimeout(() => intentar(veces + 1), 15000);
          return;
        }
        await AsyncStorage.setItem(INSTALAR_KEY, String(Date.now()));
        if (!vivo) return;
        trackEvent("instalar_oferta", "Instalar app: oferta");
        setBocadillo({
          id: "instalar",
          texto: "Instala la tienda en tu móvil y ábrela con un toque desde la pantalla de inicio.",
          accion: "instalar",
        });
      } catch {
        // sin oferta si falla
      }
    };
    t = setTimeout(() => intentar(0), 40000);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [modoInst, enPantalla, enAdmin, guiaAbierta, pathname]);

  // Blue propone información de la tienda al dueño, dentro del panel de administración: a los
  // 25 s de entrar y después cada 10 min mira si toca (de 9 a 21 h, hueco de 45 min, hasta 8 al
  // día). Solo propone temas sin respuesta, sin «No aplica» y sin «Ahora no» de hoy.
  useEffect(() => {
    if (!enAdmin || !isAdmin || !enPantalla || guiaAbierta) return;
    let vivo = true;
    const intentar = async () => {
      try {
        const hora = new Date().getHours();
        if (!vivo || hora < 9 || hora >= 21 || bocadilloRef.current || propuestaAbiertaRef.current) return;
        const estado = await leerEstadoProp();
        if (estado.n >= PROP_MAX_DIA || Date.now() - estado.ultima < PROP_HUECO_MS) return;
        const respondidos = await temasRespondidos();
        const siguiente = TEMAS_CONOCIMIENTO.find(
          (t) => !respondidos.has(t.tema) && !estado.hoyNo.includes(t.tema) && !estado.descartados.includes(t.tema)
        );
        if (!vivo || !siguiente || bocadilloRef.current) return;
        await guardarEstadoProp({ ...estado, n: estado.n + 1, ultima: Date.now() });
        setBocadillo({
          id: `prop:${siguiente.tema}`,
          texto: `${siguiente.tema}: ¿me lo cuentas para responder mejor a tus clientes?`,
          accion: "conocimiento",
          tema: siguiente.tema,
        });
      } catch {
        // sin propuesta si falla
      }
    };
    const primera = setTimeout(intentar, 25000);
    const cada = setInterval(intentar, 10 * 60 * 1000);
    return () => {
      vivo = false;
      clearTimeout(primera);
      clearInterval(cada);
    };
  }, [enAdmin, isAdmin, enPantalla, guiaAbierta]);

  // Entrada (una sola vez, la primera vez que se ve): rebote de escala y saludo
  // moviéndose de lado a lado.
  useEffect(() => {
    if (!enPantalla || entradaHechaRef.current) return;
    entradaHechaRef.current = true;
    entrada.setValue(0);
    saludo.setValue(0);
    Animated.spring(entrada, { toValue: 1, friction: 4.2, tension: 70, useNativeDriver: USA_NATIVO }).start();
    const paso = (toValue: number, duration: number) =>
      Animated.timing(saludo, { toValue, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: USA_NATIVO });
    Animated.sequence([Animated.delay(420), paso(1, 130), paso(-1, 180), paso(0.7, 160), paso(-0.4, 140), paso(0, 130)]).start();
    setSaludando(true);
  }, [enPantalla, entrada, saludo]);

  // Mini bocadillo "¡Hola! Soy Blue": entra tras el rebote y se va solo.
  useEffect(() => {
    if (!saludando) return;
    chipAnim.setValue(0);
    Animated.timing(chipAnim, {
      toValue: 1,
      duration: 280,
      delay: 360,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: USA_NATIVO,
    }).start();
    const timer = setTimeout(() => {
      Animated.timing(chipAnim, { toValue: 0, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: USA_NATIVO }).start(() =>
        setSaludando(false)
      );
    }, SALUDO_MS);
    return () => clearTimeout(timer);
  }, [saludando, chipAnim]);

  // Con el panel abierto, un bocadillo o el saludo a la vista no se oculta (lo lee
  // el listener de scroll, que se registra una sola vez).
  // Un mensaje de Blue ya NO impide esconderlo: va pegado a Blue y se esconde con él al bajar el
  // scroll (y vuelve con él cuando la pantalla se queda quieta).
  const bocadilloVisible = aparecido && !!bocadillo;
  const noOcultarRef = useRef(false);
  noOcultarRef.current = panelOpen || saludando;

  const ocultoScrollRef = useRef(false);
  const ponerOcultoScroll = useCallback((oculto: boolean) => {
    if (ocultoScrollRef.current === oculto) return;
    ocultoScrollRef.current = oculto;
    setOcultoScroll(oculto);
  }, []);

  // Scroll de CUALQUIER contenedor (los ScrollView de la web son divs con su propio
  // scroll, que no burbujea: por eso capture). Se compara el scrollTop de ese mismo
  // elemento con el anterior: bajar ≥ 12 px oculta, subir ≥ 12 px muestra.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined" || !aparecido) return;
    // Último scrollTop de cada contenedor (WeakMap: no retiene los que se desmontan).
    const ultimos = new WeakMap<object, number>();
    // Pantalla parada: pasados PARADA_MS sin ningún movimiento de scroll, Blue vuelve a verse.
    let parada: ReturnType<typeof setTimeout> | null = null;
    const alHacerScroll = (ev: Event) => {
      if (parada) clearTimeout(parada);
      parada = setTimeout(() => {
        parada = null;
        ponerOcultoScroll(false);
      }, PARADA_MS);
      const t = ev.target;
      const elemento = t instanceof Element && t !== document.documentElement && t !== document.body ? t : null;
      const clave: object = elemento ?? document;
      const y = elemento ? elemento.scrollTop : window.scrollY || document.documentElement.scrollTop || 0;
      const previo = ultimos.get(clave);
      if (previo === undefined) {
        ultimos.set(clave, y);
        return;
      }
      // Scroll horizontal (carruseles): el scrollTop no cambia, no cuenta.
      if (y === previo) return;
      if (y < SCROLL_ARRIBA) {
        ultimos.set(clave, y);
        ponerOcultoScroll(false);
        return;
      }
      const delta = y - previo;
      if (Math.abs(delta) < SCROLL_UMBRAL) return;
      ultimos.set(clave, y);
      if (delta < 0) ponerOcultoScroll(false);
      else if (!noOcultarRef.current) ponerOcultoScroll(true);
    };
    document.addEventListener("scroll", alHacerScroll, { capture: true, passive: true });
    return () => {
      if (parada) clearTimeout(parada);
      document.removeEventListener("scroll", alHacerScroll, { capture: true });
    };
  }, [aparecido, ponerOcultoScroll]);

  // Al cambiar de pantalla vuelve a verse; también si sale un bocadillo.
  useEffect(() => {
    ponerOcultoScroll(false);
  }, [pathname, ponerOcultoScroll]);
  useEffect(() => {
    if (bocadilloVisible) ponerOcultoScroll(false);
  }, [bocadilloVisible, ponerOcultoScroll]);

  // Ocultar: se desliza hacia su borde y se desvanece; al volver, con un leve rebote.
  const oculto = ocultoScroll && !panelOpen && !saludando;
  useEffect(() => {
    Animated.timing(ocultar, {
      toValue: oculto ? 1 : 0,
      duration: oculto ? 220 : 280,
      easing: oculto ? Easing.in(Easing.cubic) : Easing.out(Easing.back(1.3)),
      useNativeDriver: USA_NATIVO,
    }).start();
  }, [oculto, ocultar]);

  // --- arrastrar / tocar --------------------------------------------------------
  const totalRef = useRef(0);
  totalRef.current = totalCount;

  const openPanel = useCallback((tab?: "blue" | "avisos" | "noticias") => {
    setBocadillo(null);
    setSaludando(false);
    // Si hay notificaciones pendientes, se abre directamente en esa pestaña.
    setPestana(tab ?? (totalRef.current > 0 ? "avisos" : "blue"));
    setPanelOpen(true);
    refreshChats();
    refreshLikes();
    refreshNovedades();
    refreshNoticiasNuevas();
    refreshAvisosTienda();
  }, [refreshChats, refreshLikes, refreshNovedades, refreshNoticiasNuevas, refreshAvisosTienda]);

  const openPanelRef = useRef(openPanel);
  openPanelRef.current = openPanel;
  const moverAReflejo = useRef(moverA);
  moverAReflejo.current = moverA;

  // Si Blue tapa texto, un botón, un campo o una foto, se aparta solo al hueco libre más
  // cercano; y vuelve a su sitio en cuanto ese sitio queda libre. Se mira al cambiar de
  // pantalla, al dejar de desplazarse y cada pocos segundos (solo web).
  const enPantallaRef = useRef(false);
  enPantallaRef.current = enPantalla && !oculto && !panelOpen && !guiaAbierta;
  const comprobarSitio = useCallback(() => {
    if (Platform.OS !== "web" || !enPantallaRef.current || arrastrandoRef.current) return;
    const libre = buscarSitioLibre(preferidoRef.current, sitioRef.current);
    if (!libre) return;
    const actual = sitioRef.current;
    if (libre.lado !== actual.lado || Math.abs(libre.fy - actual.fy) > 0.01) moverA(libre);
  }, [moverA]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    let espera: ReturnType<typeof setTimeout> | null = null;
    const trasScroll = () => {
      if (espera) clearTimeout(espera);
      espera = setTimeout(() => {
        espera = null;
        comprobarSitio();
      }, APARTARSE_TRAS_SCROLL_MS);
    };
    const cada = setInterval(() => {
      if (document.visibilityState !== "hidden") comprobarSitio();
    }, APARTARSE_CADA_MS);
    document.addEventListener("scroll", trasScroll, { capture: true, passive: true });
    window.addEventListener("resize", trasScroll);
    // En cuanto algo se toca (se abre un desplegable, un aviso…) o aparece contenido nuevo,
    // mira otra vez sin esperar a la vuelta de cada 1,2 s.
    document.addEventListener("click", trasScroll, { capture: true, passive: true });
    let observador: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined" && document.body) {
      observador = new MutationObserver(() => {
        if (!espera) espera = setTimeout(() => {
          espera = null;
          comprobarSitio();
        }, 300);
      });
      observador.observe(document.body, { childList: true, subtree: true });
    }
    return () => {
      if (espera) clearTimeout(espera);
      clearInterval(cada);
      observador?.disconnect();
      document.removeEventListener("scroll", trasScroll, { capture: true });
      document.removeEventListener("click", trasScroll, { capture: true });
      window.removeEventListener("resize", trasScroll);
    };
  }, [comprobarSitio]);

  // Al cambiar de pantalla, cuando el contenido nuevo ya está pintado.
  useEffect(() => {
    const t = setTimeout(comprobarSitio, 900);
    return () => clearTimeout(t);
  }, [pathname, comprobarSitio]);

  // Nada más aparecer (y otra vez al acabar el saludo): si cae encima de algo, por ejemplo
  // del botón «Aceptar» del aviso de cookies, se aparta ya, sin esperar a la siguiente vuelta.
  useEffect(() => {
    if (!enPantalla) return;
    const t1 = setTimeout(comprobarSitio, 150);
    const t2 = setTimeout(comprobarSitio, SALUDO_MS + 700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [enPantalla, comprobarSitio]);

  // --- guía de bienvenida -------------------------------------------------------------
  // A los 15 s de entrar, una sola vez por dispositivo y solo a quien no tiene sesión (es
  // nuevo). En el panel, en un chat o pagando se espera a que salga de ahí.
  const sitioSinGuia = enAdmin || enChat || pathname.startsWith("/checkout");
  const sitioSinGuiaRef = useRef(sitioSinGuia);
  sitioSinGuiaRef.current = sitioSinGuia;

  useEffect(() => {
    const yaPasado = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : 0;
    const t = setTimeout(async () => {
      try {
        if ((await AsyncStorage.getItem(GUIA_VISTA_KEY)) === "1") return;
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) return;
      } catch {
        return;
      }
      if (sitioSinGuiaRef.current) guiaPendienteRef.current = true;
      else setGuiaAbierta(true);
    }, Math.max(0, GUIA_MS - yaPasado));
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (guiaPendienteRef.current && !sitioSinGuia) {
      guiaPendienteRef.current = false;
      setGuiaAbierta(true);
    }
  }, [sitioSinGuia]);

  const cerrarGuia = useCallback(() => {
    setGuiaAbierta(false);
    setGuiaSenalaBlue(false);
    AsyncStorage.setItem(GUIA_VISTA_KEY, "1").catch(() => {});
  }, []);

  // Con la guía abierta Blue tiene que verse en su sitio (no escondido por el scroll).
  useEffect(() => {
    if (guiaAbierta) ponerOcultoScroll(false);
  }, [guiaAbierta, ponerOcultoScroll]);

  // El toque lo gestiona un Pressable (clic normal, fiable en Safari del iPhone). El
  // arrastre solo se activa cuando el dedo ya se ha movido unos píxeles: antes el
  // PanResponder se quedaba con todos los toques y en el móvil el navegador los
  // cancelaba, así que tocar a Blue no hacía nada.
  const empiezaArrastre = (_e: unknown, g: { dx: number; dy: number }) =>
    Math.abs(g.dx) + Math.abs(g.dy) >= TAP_THRESHOLD;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: empiezaArrastre,
      onMoveShouldSetPanResponderCapture: empiezaArrastre,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        arrastrandoRef.current = true;
        pan.setOffset(posRef.current);
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_evt, g) => {
        arrastrandoRef.current = false;
        pan.flattenOffset();
        if (Math.abs(g.dx) + Math.abs(g.dy) < TAP_THRESHOLD) {
          pan.setValue(posRef.current);
          openPanelRef.current();
          return;
        }
        // Se queda pegado al lado más cercano y a la altura donde se soltó: ese es ahora
        // su sitio preferido (se recuerda).
        const { width, height } = Dimensions.get("window");
        const cx = posRef.current.x + g.dx + BLUE_SIZE / 2;
        const y = posRef.current.y + g.dy;
        const yMax = Math.max(TOP_INSET + 1, height - BLUE_SIZE - BOTTOM_INSET);
        const next: Sitio = sitioPermitido({
          lado: cx < width / 2 ? "l" : "r",
          fy: limitar((y - TOP_INSET) / (yMax - TOP_INSET), 0, 1),
        });
        preferidoRef.current = next;
        AsyncStorage.setItem(CORNER_KEY, JSON.stringify(next)).catch(() => {});
        moverAReflejo.current(next);
      },
      onPanResponderTerminate: () => {
        arrastrandoRef.current = false;
      },
    })
  ).current;

  // --- acciones -----------------------------------------------------------------
  // Tocar un mensaje lleva directamente a lo que dice.
  const alTocarBocadillo = useCallback(() => {
    const b = bocadillo;
    setBocadillo(null);
    if (!b) return;
    if (b.accion === "chat" || b.accion === "ruta") router.push((b.ruta ?? "/blue-ia") as Href);
    else if (b.accion === "vender") {
      marcarOrigenVender("blue");
      abrirVender();
    } else if (b.accion === "instalar") instalarApp();
    else if (b.accion === "conocimiento") {
      const t = TEMAS_CONOCIMIENTO.find((x) => x.tema === b.tema);
      if (t) setPropuesta(t);
    } else openPanel("noticias");
  }, [bocadillo, openPanel, abrirVender, instalarApp]);

  const ir = useCallback((href: string) => {
    setPanelOpen(false);
    router.push(href as Href);
  }, []);

  const handleDismissLikes = useCallback(async () => {
    const removeIds = likedUnavailable;
    setLikedUnavailable([]);
    try {
      const current = await getLikedProductIds();
      await AsyncStorage.setItem(LIKED_PRODUCTS_KEY, JSON.stringify(current.filter((id) => !removeIds.includes(id))));
    } catch {
      // como mucho se vuelve a avisar
    }
  }, [likedUnavailable]);

  // Guarda en la cuenta (si hay sesión) los ajustes de avisos de artículos nuevos.
  const guardarPreferenciasNovedades = useCallback(async (campos: { avisos_novedades?: boolean; novedades_vistas_hasta?: string }) => {
    try {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) return;
      await supabase
        .from("preferencias_usuario")
        .upsert({ user_id: user.id, ...campos, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    } catch {
      // queda lo local
    }
  }, []);

  const cambiarAvisosNovedades = useCallback(
    async (activar: boolean) => {
      const ahora = new Date().toISOString();
      setAvisosNovedades(activar);
      setNovedadesTienda(0);
      try {
        await AsyncStorage.setItem(NOVEDADES_AVISOS_KEY, activar ? "1" : "0");
        // Al activarlos se empieza a contar desde ahora (sin avisar de lo que ya había).
        if (activar) await AsyncStorage.setItem(NOVEDADES_VISTAS_KEY, ahora);
      } catch {
        // sin almacenamiento local
      }
      await guardarPreferenciasNovedades(activar ? { avisos_novedades: true, novedades_vistas_hasta: ahora } : { avisos_novedades: false });
    },
    [guardarPreferenciasNovedades]
  );

  const verNovedades = useCallback(async () => {
    const ahora = new Date().toISOString();
    setNovedadesTienda(0);
    AsyncStorage.setItem(NOVEDADES_VISTAS_KEY, ahora).catch(() => {});
    guardarPreferenciasNovedades({ novedades_vistas_hasta: ahora });
    ir("/");
  }, [guardarPreferenciasNovedades, ir]);

  const verLlegada = useCallback(
    async (l: Llegada) => {
      setLlegadas((prev) => prev.filter((x) => x.aviso.id !== l.aviso.id));
      supabase
        .from("avisos_busqueda")
        .update({ visto_hasta: new Date().toISOString() })
        .eq("id", l.aviso.id)
        .then(() => {}, () => {});
      ir(l.productos.length === 1 ? `/producto/${l.productos[0].id}` : `/catalogo?query=${encodeURIComponent(l.aviso.texto)}`);
    },
    [ir]
  );

  const verBajada = useCallback(
    async (b: Bajada) => {
      setBajadas((prev) => prev.filter((x) => x.id !== b.id));
      const vistos = await leerJsonLocal<Record<string, number>>(PRECIOS_VISTOS_KEY, {});
      vistos[b.id] = b.ahora;
      AsyncStorage.setItem(PRECIOS_VISTOS_KEY, JSON.stringify(vistos)).catch(() => {});
      ir(`/producto/${b.id}`);
    },
    [ir]
  );

  const anadirAviso = useCallback(async () => {
    const r = await crearAvisoBusqueda(textoAviso);
    if (r === "ok") {
      setTextoAviso("");
      setMsgAviso("Hecho: te avisaremos en cuanto llegue.");
    } else if (r === "limite") {
      setMsgAviso("Ya tienes 10 avisos: quita alguno para añadir otro.");
    } else if (r === "sin_sesion") {
      setMsgAviso("Inicia sesión para crear avisos.");
    } else {
      setMsgAviso("Escribe al menos 2 letras de lo que buscas.");
    }
  }, [textoAviso]);

  const quitarAviso = useCallback(async (id: string) => {
    setAvisosBusqueda((prev) => prev.filter((a) => a.id !== id));
    setLlegadas((prev) => prev.filter((l) => l.aviso.id !== id));
    try {
      await supabase.from("avisos_busqueda").delete().eq("id", id);
    } catch {
      // se volverá a ver al recargar
    }
  }, []);

  // Antes de los 10 s (o en un chat) Blue no existe en pantalla.
  // Tampoco en el panel de administración (petición del dueño): allí no hace falta.
  if (avisoSelector && enForo && !enAdmin && !guiaAbierta) return <AvisoSelector onCerrar={() => setAvisoSelector(false)} />;
  // Con la guía abierta se sigue montando aunque la guía pase por una pantalla de chat (Foro,
  // Blue IA): Blue no se ve ahí (sigue escondido), pero la guía no puede desaparecer.
  // En el panel de administración Blue solo aparece para el dueño (propone información de la
  // tienda); a cualquier otra persona no se le monta nunca allí.
  if (!ready || (enChat && !guiaAbierta) || (enAdmin && !isAdmin) || !aparecido) return null;

  const derecha = sitio.lado === "r";
  // En la mitad de arriba el mensaje crece hacia abajo; en la de abajo, hacia arriba.
  const arriba = sitio.fy < 0.5;
  // Los mensajes salen AL LADO de Blue (hacia el centro), con el ancho que quepa.
  // Alargado (más ancho que alto): pocas líneas, sin título ni botón aparte.
  const anchoMensaje = Math.max(170, Math.min(330, Dimensions.get("window").width - BLUE_SIZE - EDGE_INSET * 2 - 14));
  const ladoMensaje = { [derecha ? "right" : "left"]: BLUE_SIZE + 6, [arriba ? "top" : "bottom"]: 2 };
  const pistaAccion =
    bocadillo?.accion === "chat"
      ? { icono: "chatbubble-ellipses-outline" as const, texto: "Escribir ahora" }
      : bocadillo?.accion === "vender"
        ? { icono: "cash-outline" as const, texto: "Vender ahora" }
        : bocadillo?.accion === "ruta"
          ? { icono: "arrow-forward-circle-outline" as const, texto: "Ver" }
          : bocadillo?.accion === "instalar"
            ? { icono: "download-outline" as const, texto: "Instalar" }
            : bocadillo?.accion === "conocimiento"
              ? { icono: "create-outline" as const, texto: "Responder" }
              : null;

  // Capa visible: fundido de entrada × fundido al ocultarse, y deslizamiento
  // hacia su borde. Cuerpo: rebote de escala y giro del saludo.
  const opacidadCapa = Animated.multiply(
    entrada.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
    ocultar.interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: "clamp" })
  );
  const deslizCapa = ocultar.interpolate({ inputRange: [0, 1], outputRange: [0, derecha ? DESLIZ_OCULTO : -DESLIZ_OCULTO] });
  const escalaCuerpo = entrada.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const giroSaludo = saludo.interpolate({ inputRange: [-1, 1], outputRange: ["-14deg", "14deg"] });

  return (
    <>
      {/* Capa del tamaño exacto de la pantalla que recorta: Blue y sus mensajes nunca se
          salen por un lado (en el iPhone eso ensanchaba toda la página).
          OJO: pointerEvents SIEMPRE como propiedad, nunca dentro de style. En la web,
          react-native-web descarta «box-none» en los estilos en línea y esta capa de pantalla
          completa se quedaba con todos los toques: la tienda parecía congelada al aparecer Blue.
          Durante la guía Blue no se pinta (no tapa su tarjeta), salvo en el paso que le señala. */}
      {guiaAbierta && !guiaSenalaBlue ? null : (
      <View
        pointerEvents="box-none"
        style={{
          position: (Platform.OS === "web" ? "fixed" : "absolute") as "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: "hidden",
          zIndex: 99999,
          elevation: 20,
        }}
      >
      <Animated.View
        nativeID={BLUE_DOM_ID}
        // Oculto por scroll o durante la guía: no recibe toques.
        pointerEvents={oculto || guiaAbierta ? "none" : "box-none"}
        style={{
          position: "absolute",
          zIndex: 99999,
          elevation: 20,
          width: BLUE_SIZE,
          height: BLUE_SIZE,
          transform: pan.getTranslateTransform(),
        }}
      >
        <Animated.View
          pointerEvents={oculto || guiaAbierta ? "none" : "box-none"}
          style={{
            width: BLUE_SIZE,
            height: BLUE_SIZE,
            opacity: opacidadCapa,
            transform: [{ translateX: deslizCapa }],
          }}
        >
          {/* Mensaje de Blue: a su lado, en cristal transparente que se lee bien. Al tocarlo
              lleva a lo que dice. */}
          {bocadillo ? (
            <Animated.View
              nativeID={BLUE_MENSAJE_DOM_ID}
              style={{
                position: "absolute",
                width: anchoMensaje,
                ...ladoMensaje,
                opacity: bocAnim,
                transform: [{ scale: bocAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
              }}
            >
              <Pressable
                onPress={alTocarBocadillo}
                accessibilityRole="button"
                accessibilityHint={pistaAccion?.texto}
                style={({ pressed }) => [CRISTAL, { paddingVertical: 8, paddingLeft: 13, paddingRight: 30, opacity: pressed ? 0.85 : 1 }]}
              >
                {/* Todo en un solo párrafo: «Blue», el mensaje y lo que pasa al tocar. */}
                <Text numberOfLines={3} style={[TEXTO_CRISTAL, { fontWeight: "800", fontSize: 13, lineHeight: 17 }]}>
                  <Text style={{ color: COLORS.accentDark, fontWeight: "900" }}>Blue · </Text>
                  {bocadillo.texto}
                  {pistaAccion ? <Text style={{ color: COLORS.accentDark, fontWeight: "900" }}>{`  ${pistaAccion.texto} ›`}</Text> : null}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setBocadillo(null)}
                hitSlop={10}
                accessibilityLabel="Cerrar mensaje de Blue"
                style={{ position: "absolute", top: 7, right: 9 }}
              >
                <Ionicons name="close" size={16} color={COLORS.muted} />
              </Pressable>
            </Animated.View>
          ) : saludando ? (
            // Mini saludo al aparecer (al tocarlo, abre el panel de Blue).
            <Animated.View
              pointerEvents="box-none"
              style={{
                position: "absolute",
                width: 176,
                alignItems: derecha ? "flex-end" : "flex-start",
                [derecha ? "right" : "left"]: BLUE_SIZE + 6,
                top: BLUE_SIZE / 2 - 18,
                opacity: chipAnim,
                transform: [{ scale: chipAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
              }}
            >
              <Pressable
                onPress={() => openPanel()}
                accessibilityRole="button"
                accessibilityLabel="Hola, soy Blue. Abrir el asistente"
                style={[CRISTAL, { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 }]}
              >
                <Ionicons name="hand-left-outline" size={15} color={COLORS.accent} />
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13 }}>
                  ¡Hola! Soy <Text style={{ color: COLORS.accentDark }}>Blue</Text>
                </Text>
              </Pressable>
            </Animated.View>
          ) : null}

          {/* Cuerpo de Blue: se arrastra y se toca como siempre. */}
          <Animated.View style={{ width: BLUE_SIZE, height: BLUE_SIZE, transform: [{ scale: escalaCuerpo }, { rotate: giroSaludo }] }}>
            <View
              {...panResponder.panHandlers}
              style={[
                { width: BLUE_SIZE, height: BLUE_SIZE, alignItems: "center", justifyContent: "center" },
                // En web: que el navegador no se quede el gesto (desplazar la página) al arrastrar.
                Platform.OS === "web" ? ({ touchAction: "none", cursor: "pointer" } as object) : null,
              ]}
            >
              <Pressable
                onPress={() => openPanelRef.current()}
                // En el paso de la guía que le señala, solo se mira: no abre el panel.
                disabled={guiaAbierta}
                accessibilityRole="button"
                accessibilityLabel="Abrir Blue, el asistente de la tienda"
                hitSlop={6}
                style={{ width: BLUE_SIZE, height: BLUE_SIZE, alignItems: "center", justifyContent: "center" }}
              >
                <MarcaAnimada cual="carga" ancho={BLUE_SIZE} tocable={false} />
              </Pressable>
              {totalCount > 0 ? (
                <View
                  style={{
                    position: "absolute",
                    top: 2,
                    right: 4,
                    minWidth: 20,
                    height: 20,
                    borderRadius: 10,
                    paddingHorizontal: 4,
                    backgroundColor: COLORS.danger,
                    borderWidth: 2,
                    borderColor: COLORS.bg,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "900" }}>{badgeLabel}</Text>
                </View>
              ) : null}
            </View>
          </Animated.View>
        </Animated.View>
      </Animated.View>
      </View>
      )}

      <Modal visible={panelOpen} transparent animationType="fade" onRequestClose={() => setPanelOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end", alignItems: "center" }}
          onPress={() => setPanelOpen(false)}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: "100%",
              maxWidth: 560,
              backgroundColor: COLORS.bg,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 18,
              paddingBottom: Platform.OS === "ios" ? 34 : 22,
              maxHeight: "80%",
            }}
          >
            <Pressable onPress={() => setPanelOpen(false)} hitSlop={10} style={{ position: "absolute", top: 14, right: 16, zIndex: 2 }}>
              <Ionicons name="close" size={22} color={COLORS.muted} />
            </Pressable>

            <View style={{ alignItems: "center", gap: 6, marginBottom: 12 }}>
              <MarcaAnimada cual="tienda" ancho={pestana === "blue" ? 104 : 64} />
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18, textAlign: "center" }}>Blue</Text>
            </View>

            {/* Pestañas: Blue (asistente) · Notificaciones · Noticias */}
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 14 }}>
              {(
                [
                  { key: "blue", label: "Asistente", icono: "sparkles-outline", n: 0 },
                  { key: "avisos", label: "Notificaciones", icono: "notifications-outline", n: totalCount },
                  { key: "noticias", label: "Noticias", icono: "megaphone-outline", n: 0 },
                ] as const
              ).map((p) => {
                const activa = pestana === p.key;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => setPestana(p.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: activa }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      borderBottomWidth: 2,
                      borderBottomColor: activa ? COLORS.accent : "transparent",
                    }}
                  >
                    <Ionicons name={p.icono} size={15} color={activa ? COLORS.accentDark : COLORS.muted} />
                    <Text style={{ color: activa ? COLORS.accentDark : COLORS.muted, fontWeight: "900", fontSize: 13 }}>
                      {p.label}
                    </Text>
                    {p.n > 0 ? (
                      <View
                        style={{
                          minWidth: 18,
                          height: 18,
                          borderRadius: 9,
                          paddingHorizontal: 4,
                          backgroundColor: COLORS.danger,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "900" }}>{badgeLabel}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <ScrollView contentContainerStyle={{ gap: 14, alignItems: "center", paddingBottom: 4 }} showsVerticalScrollIndicator={false}>
              {pestana === "blue" ? (
              <>
              <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 20 }}>
                Tu asistente de VideojuegosZaragoza.com. ¿En qué te ayudo?
              </Text>

              <View style={{ width: "100%", gap: 10, maxWidth: 380 }}>
                <BotonPanel icono="sparkles-outline" texto="Hablar con Blue IA" principal onPress={() => ir("/blue-ia")} />
                <BotonPanel
                  icono="map-outline"
                  texto="Ver la guía de la tienda"
                  onPress={() => {
                    setPanelOpen(false);
                    setGuiaAbierta(true);
                  }}
                />
                {/* Primero conversa Blue IA; desde ese chat se puede pasar a nuestro equipo. */}
                <BotonPanel icono="people-outline" texto="Hablar con nuestro equipo" onPress={() => ir("/blue-ia")} />
                <BotonPanel
                  icono="cash-outline"
                  texto="Vender mi consola o dispositivo"
                  onPress={() => {
                    setPanelOpen(false);
                    marcarOrigenVender("blue");
                    abrirVender();
                  }}
                />
                {/* Solo si se puede instalar en este dispositivo y aún no está instalada. */}
                {modoInst ? <BotonPanel icono="download-outline" texto="Instalar la tienda como app" onPress={instalarApp} /> : null}
              </View>

              </>
              ) : null}

              {pestana === "noticias" ? (
                <View style={{ width: "100%", gap: 12, alignItems: "center" }}>
                  {noticias.length ? (
                    noticias.map((n, i) => (
                      <Text
                        key={n}
                        style={{
                          color: COLORS.text,
                          fontWeight: "700",
                          textAlign: "center",
                          lineHeight: 21,
                          paddingTop: i ? 12 : 0,
                          borderTopWidth: i ? 1 : 0,
                          borderTopColor: COLORS.border,
                          alignSelf: "stretch",
                        }}
                      >
                        {n}
                      </Text>
                    ))
                  ) : (
                    <Text style={{ color: COLORS.muted, textAlign: "center" }}>No hay noticias ahora mismo.</Text>
                  )}
                </View>
              ) : null}

              {pestana === "avisos" ? (
              <View style={{ width: "100%", gap: 12, alignItems: "center" }}>
                {totalCount === 0 ? (
                  <Text style={{ color: COLORS.muted, textAlign: "center" }}>Estás al día: no tienes avisos nuevos.</Text>
                ) : (
                  <>
                    {unreadChats > 0 ? (
                      <Aviso
                        titulo={
                          isAdmin
                            ? unreadChats === 1
                              ? "Un cliente te ha escrito"
                              : `${unreadChats} clientes te han escrito`
                            : unreadChats === 1
                              ? "Tienes un mensaje nuevo"
                              : `Tienes ${unreadChats} mensajes nuevos`
                        }
                        accion="Ver mensajes"
                        onPress={() => ir(isAdmin ? "/admin/chats" : "/chat-global?tab=privados")}
                      />
                    ) : null}
                    {likedUnavailable.length > 0 ? (
                      <Aviso
                        titulo={
                          likedUnavailable.length === 1
                            ? "Un producto que te gustó ya no está disponible"
                            : `${likedUnavailable.length} productos que te gustaron ya no están disponibles`
                        }
                        accion="Quitar de favoritos"
                        onPress={handleDismissLikes}
                      />
                    ) : null}
                    {novedadesPending ? (
                      <Aviso titulo="Hay novedades en el Foro" accion="Ver novedades" onPress={() => ir("/chat-global?tab=novedades")} />
                    ) : null}
                    {noticiasNuevas > 0 ? (
                      <Aviso
                        titulo={noticiasNuevas === 1 ? "Hay 1 noticia nueva" : `Hay ${noticiasNuevas} noticias nuevas`}
                        accion="Ver noticias"
                        onPress={() => ir("/chat-global?tab=news")}
                      />
                    ) : null}
                    {isAdmin && salidaPendiente > 0 ? (
                      <Aviso
                        titulo={
                          salidaPendiente === 1
                            ? "Una venta de un artículo de VeoAura aún no se ha confirmado a VeoAura"
                            : `${salidaPendiente} ventas de artículos de VeoAura aún no se han confirmado a VeoAura`
                        }
                        accion="Ver escaparate"
                        onPress={() => ir("/admin/escaparate")}
                      />
                    ) : null}
                    {novedadesTienda > 0 ? (
                      <Aviso
                        titulo={novedadesTienda === 1 ? "Ha llegado 1 artículo nuevo" : `Han llegado ${novedadesTienda} artículos nuevos`}
                        accion="Ver novedades"
                        onPress={verNovedades}
                      />
                    ) : null}
                    {llegadas.map((l) => (
                      <Aviso
                        key={l.aviso.id}
                        titulo={`Ha llegado lo que buscabas («${l.aviso.texto}»): ${l.productos[0].title} · ${fmtEUR(l.productos[0].price)}${
                          l.productos.length > 1 ? ` y ${l.productos.length - 1} más` : ""
                        }`}
                        accion="Ver"
                        onPress={() => verLlegada(l)}
                      />
                    ))}
                    {bajadas.map((b) => (
                      <Aviso
                        key={b.id}
                        titulo={`Ha bajado de precio: ${b.title} · antes ${fmtEUR(b.antes)}, ahora ${fmtEUR(b.ahora)}`}
                        accion="Ver"
                        onPress={() => verBajada(b)}
                      />
                    ))}
                  </>
                )}
                {/* Sin avisos de noticias activados: cómo activarlos. */}
                {!avisosNoticias ? (
                  <Text style={{ color: COLORS.muted, fontSize: 12, textAlign: "center", lineHeight: 17 }}>
                    ¿Quieres avisos de noticias?{" "}
                    <Text
                      onPress={() => ir("/chat-global?tab=news")}
                      accessibilityRole="link"
                      style={{ color: COLORS.accent, fontWeight: "800" }}
                    >
                      Actívalos con la campana de Noticias Gaming.
                    </Text>
                  </Text>
                ) : null}
                {!isLoggedIn ? (
                  <Text style={{ color: COLORS.muted, fontSize: 12, textAlign: "center" }}>
                    Inicia sesión para ver también los avisos de tus conversaciones.
                  </Text>
                ) : null}

                {/* Ajustes de los avisos de la tienda. */}
                <View
                  style={{
                    alignSelf: "stretch",
                    borderTopWidth: 1,
                    borderTopColor: COLORS.border,
                    paddingTop: 14,
                    marginTop: 4,
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "800", textAlign: "center" }}>Avisarme de los artículos nuevos</Text>
                    <Switch
                      value={avisosNovedades}
                      onValueChange={cambiarAvisosNovedades}
                      trackColor={{ false: "#D9E3EC", true: COLORS.accentSoft }}
                      thumbColor={avisosNovedades ? COLORS.accent : "#F4F4F5"}
                      accessibilityLabel="Avisarme de los artículos nuevos"
                    />
                  </View>

                  <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center", marginTop: 4 }}>Avísame cuando llegue</Text>
                  {isLoggedIn ? (
                    <>
                      <Text style={{ color: COLORS.muted, fontSize: 12, textAlign: "center", lineHeight: 17 }}>
                        Escribe lo que buscas y te avisamos aquí en cuanto entre en la tienda.
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, width: "100%", maxWidth: 380 }}>
                        <TextInput
                          value={textoAviso}
                          onChangeText={(t) => {
                            setTextoAviso(t);
                            setMsgAviso(null);
                          }}
                          onSubmitEditing={anadirAviso}
                          placeholder="Ej.: Switch OLED"
                          placeholderTextColor="rgba(11,33,56,0.40)"
                          maxLength={60}
                          returnKeyType="done"
                          style={{
                            flex: 1,
                            borderWidth: 1,
                            borderColor: COLORS.border,
                            borderRadius: 999,
                            paddingHorizontal: 14,
                            paddingVertical: 9,
                            color: COLORS.text,
                            // 16px: evita el zoom automático de Safari/iOS al enfocar.
                            fontSize: 16,
                            textAlign: "center",
                          }}
                        />
                        <Pressable
                          onPress={anadirAviso}
                          accessibilityRole="button"
                          style={({ pressed }) => ({
                            opacity: pressed ? 0.85 : 1,
                            paddingVertical: 10,
                            paddingHorizontal: 16,
                            borderRadius: 999,
                            backgroundColor: COLORS.accent,
                          })}
                        >
                          <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Añadir</Text>
                        </Pressable>
                      </View>
                      {msgAviso ? (
                        <Text style={{ color: COLORS.muted, fontSize: 12, textAlign: "center" }}>{msgAviso}</Text>
                      ) : null}
                      {avisosBusqueda.map((a) => (
                        <View key={a.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
                          <Text style={{ color: COLORS.text, fontWeight: "700", textAlign: "center" }}>{a.texto}</Text>
                          <Pressable onPress={() => quitarAviso(a.id)} hitSlop={8} accessibilityLabel={`Quitar el aviso ${a.texto}`}>
                            <Text style={{ color: COLORS.accent, fontWeight: "900" }}>Quitar</Text>
                          </Pressable>
                        </View>
                      ))}
                    </>
                  ) : (
                    <Text style={{ color: COLORS.muted, fontSize: 12, textAlign: "center", lineHeight: 17 }}>
                      Inicia sesión para que te avisemos cuando llegue lo que buscas.
                    </Text>
                  )}
                </View>
              </View>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {guiaAbierta ? (
        <GuiaBlue
          onCerrar={cerrarGuia}
          onIr={(ruta) => {
            cerrarGuia();
            router.push(ruta as Href);
          }}
          onVender={() => {
            // El formulario recuerda que viene de la guía (para medir cuántos lo envían).
            marcarOrigenVender("guia");
            trackEvent("guia_vender", "Guía Blue: pulsa «Abrir el formulario»");
            cerrarGuia();
            abrirVender();
          }}
          onInstalar={() => {
            cerrarGuia();
            instalarApp();
          }}
          instalable={!!modoInst}
          onSenalaBlue={setGuiaSenalaBlue}
        />
      ) : null}

      {/* Blue le pregunta al dueño (panel de administración): la respuesta la escribe él. */}
      <Modal visible={!!propuesta} transparent animationType="fade" onRequestClose={() => cerrarPropuesta("ahora-no")}>
        <Pressable
          onPress={() => cerrarPropuesta("ahora-no")}
          style={{ flex: 1, backgroundColor: FONDO_GUIA, justifyContent: "center", alignItems: "center", padding: 14 }}
        >
          <Pressable
            onPress={() => undefined}
            style={{ width: "100%", maxWidth: 440, backgroundColor: COLORS.bg, borderRadius: 24, padding: 18, gap: 12, alignItems: "center" }}
          >
            <Ionicons name="bulb-outline" size={26} color={COLORS.accent} />
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18, textAlign: "center" }}>{propuesta?.tema}</Text>
            <Text style={{ color: COLORS.text, fontSize: 15, lineHeight: 22, fontWeight: "600", textAlign: "center" }}>
              {propuesta?.pregunta}
            </Text>
            <TextInput
              value={respuestaProp}
              onChangeText={setRespuestaProp}
              placeholder="Escribe la respuesta real de la tienda"
              placeholderTextColor={COLORS.muted}
              multiline
              maxLength={800}
              style={{
                alignSelf: "stretch",
                minHeight: 110,
                borderWidth: 1,
                borderColor: COLORS.border,
                borderRadius: 16,
                padding: 12,
                textAlign: "center",
                color: COLORS.text,
                backgroundColor: "#F6FAFD",
              }}
            />
            {errorProp ? <Text style={{ color: "#B91C1C", fontWeight: "800", textAlign: "center" }}>{errorProp}</Text> : null}
            <Pressable
              onPress={guardarPropuesta}
              disabled={guardandoProp}
              accessibilityRole="button"
              style={{ alignSelf: "stretch", minHeight: 52, borderRadius: 999, backgroundColor: COLORS.accent, alignItems: "center", justifyContent: "center", opacity: guardandoProp ? 0.6 : 1 }}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>{guardandoProp ? "Guardando…" : "Guardar"}</Text>
            </Pressable>
            <View style={{ flexDirection: "row", gap: 18, alignItems: "center" }}>
              <Pressable onPress={() => cerrarPropuesta("ahora-no")} hitSlop={8} accessibilityRole="button">
                <Text style={{ color: COLORS.muted, fontWeight: "800" }}>Ahora no</Text>
              </Pressable>
              <Pressable onPress={() => cerrarPropuesta("no-aplica")} hitSlop={8} accessibilityRole="button">
                <Text style={{ color: COLORS.muted, fontWeight: "800" }}>No aplica</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  cerrarPropuesta("ahora-no");
                  router.push("/admin/conocimiento" as Href);
                }}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text style={{ color: COLORS.accent, fontWeight: "900" }}>Ver lo que sé</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* iPhone/iPad: no hay botón de instalar; se enseñan los pasos de Safari. */}
      <Modal visible={pasosIosAbiertos} transparent animationType="fade" onRequestClose={() => setPasosIosAbiertos(false)}>
        <Pressable
          onPress={() => setPasosIosAbiertos(false)}
          style={{ flex: 1, backgroundColor: FONDO_GUIA, justifyContent: "flex-end", alignItems: "center", padding: 12 }}
        >
          <Pressable
            onPress={() => undefined}
            style={{ width: "100%", maxWidth: 420, backgroundColor: COLORS.bg, borderRadius: 24, padding: 20, gap: 12, alignItems: "center" }}
          >
            <Ionicons name="download-outline" size={26} color={COLORS.accent} />
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 19, textAlign: "center" }}>Instala la tienda en tu iPhone</Text>
            <Text style={{ color: COLORS.text, fontSize: 15, lineHeight: 22, fontWeight: "600", textAlign: "center" }}>
              {"1. Toca el botón Compartir de Safari (el cuadrado con una flecha hacia arriba).\n2. Elige «Añadir a pantalla de inicio».\n3. Toca «Añadir». Ya la tendrás como una app."}
            </Text>
            <Pressable
              onPress={() => setPasosIosAbiertos(false)}
              accessibilityRole="button"
              style={{ alignSelf: "stretch", minHeight: 52, borderRadius: 999, backgroundColor: COLORS.accent, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>Entendido</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function BotonPanel({
  icono,
  texto,
  principal,
  onPress,
}: {
  icono: React.ComponentProps<typeof Ionicons>["name"];
  texto: string;
  principal?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.88 : 1,
        minHeight: 48,
        borderRadius: 999,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        borderWidth: principal ? 0 : 1.5,
        borderColor: COLORS.accent,
        backgroundColor: principal ? COLORS.accentDark : COLORS.bg,
      })}
    >
      <Ionicons name={icono} size={17} color={principal ? "#FFFFFF" : COLORS.accentDark} />
      <Text style={{ color: principal ? "#FFFFFF" : COLORS.accentDark, fontWeight: "900", fontSize: 14.5 }}>{texto}</Text>
    </Pressable>
  );
}

// --- Aviso de Blue en el Foro --------------------------------------------------------------
// Señala el botón azul del selector de pestañas (data-testid "selector-pestanas", en
// app/(tabs)/chat-global.tsx) con un aro y una flecha, y explica qué hace y que las pestañas
// se pueden ordenar manteniendo pulsada una y arrastrándola. No bloquea nada: solo se cierra con
// «Entendido» (o a los 20 s).
function AvisoSelector({ onCerrar }: { onCerrar: () => void }) {
  const [caja, setCaja] = useState<Caja | null>(null);
  const { width, height } = Dimensions.get("window");
  const latido = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const medir = () => setCaja(medirObjetivo(['[data-testid="selector-pestanas"]']));
    const t1 = setTimeout(medir, 200);
    const t2 = setTimeout(medir, 900);
    const t3 = setTimeout(onCerrar, 20000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onCerrar]);

  useEffect(() => {
    const bucle = Animated.loop(
      Animated.sequence([
        Animated.timing(latido, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: USA_NATIVO }),
        Animated.timing(latido, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: USA_NATIVO }),
      ])
    );
    bucle.start();
    return () => bucle.stop();
  }, [latido]);

  // Sin el botón a la vista no hay nada que señalar.
  if (!caja) return null;
  // Mensaje alargado, como los de Blue flotante (no una tarjeta gorda).
  const ancho = Math.min(width - 24, 340);
  const bote = latido.interpolate({ inputRange: [0, 1], outputRange: [0, 7] });
  const escala = latido.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const flechaX = limitar(caja.x + caja.w / 2 - 16, 8, width - 40);

  return (
    <View pointerEvents="box-none" style={{ position: (Platform.OS === "web" ? "fixed" : "absolute") as "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999 }}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: caja.x - 6,
          top: caja.y - 6,
          width: caja.w + 12,
          height: caja.h + 12,
          borderRadius: (caja.h + 12) / 2,
          borderWidth: 3,
          borderColor: COLORS.accent,
          transform: [{ scale: escala }],
        }}
      />
      <Animated.View pointerEvents="none" style={{ position: "absolute", left: flechaX, top: caja.y - 46, transform: [{ translateY: bote }] }}>
        <Ionicons name="arrow-down-circle" size={32} color={COLORS.accent} />
      </Animated.View>
      {/* Mensaje de Blue: Blue pequeño a la izquierda y el texto en un párrafo alargado; al tocarlo
          se cierra. Sale una sola vez por dispositivo. */}
      <Pressable
        onPress={onCerrar}
        accessibilityRole="button"
        accessibilityLabel="Entendido"
        style={[
          CRISTAL,
          {
            position: "absolute",
            right: 12,
            bottom: Math.max(12, height - caja.y + 54),
            width: ancho,
            backgroundColor: "rgba(255,255,255,0.94)",
            paddingVertical: 8,
            paddingHorizontal: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          },
        ]}
      >
        <MarcaAnimada cual="carga" ancho={44} tocable={false} />
        <Text style={[TEXTO_CRISTAL, { flex: 1, fontWeight: "800", fontSize: 13, lineHeight: 18 }]}>
          <Text style={{ color: COLORS.accentDark, fontWeight: "900" }}>Blue · </Text>
          Toca el botón azul para cambiar de pestaña. Para ordenarlas, mantén pulsada una y arrástrala.
          <Text style={{ color: COLORS.accentDark, fontWeight: "900" }}>  Entendido ›</Text>
        </Text>
      </Pressable>
    </View>
  );
}

// --- Guía de bienvenida de Blue ----------------------------------------------------------
// Pasos cortos, cercanos y con datos reales de la tienda. Se usa con un solo dedo: deslizar
// la tarjeta o tocar «Siguiente» (abajo a la derecha, donde llega el pulgar derecho).
// En la web, cada paso puede SEÑALAR el botón del que habla: se oscurece todo menos ese
// botón, que queda dentro de un aro azul que late, con una flecha que lo apunta.
// «objetivo» son selectores CSS (si hay varios, se señala el conjunto); si no se encuentran
// en pantalla, el paso se explica sin señalar.
type PasoGuia = {
  icono: React.ComponentProps<typeof Ionicons>["name"];
  titulo: string;
  texto: string;
  objetivo?: string[];
  // Pantalla en la que se explica el paso: la guía navega sola hasta ella (como si te llevara
  // de la mano). Si no se indica, se queda en Inicio.
  ruta?: string;
  // Selector de lo que hay que traer a la vista (desplazando la pantalla) antes de señalarlo.
  desplazar?: string;
  accion?: { texto: string; ruta?: string; vender?: boolean; instalar?: boolean };
  cuenta?: boolean;
  // Solo se enseña si la tienda se puede instalar en este dispositivo.
  soloInstalable?: boolean;
};

const PESTANAS = ["index", "perfil", "cesta", "foro", "blue-ia"].map((p) => `[data-testid="pestana-${p}"]`);

const PASOS_GUIA: PasoGuia[] = [
  {
    icono: "hand-left-outline",
    titulo: "¡Hola! Soy Blue",
    texto: "Te enseño dónde está todo en un minuto. Toca «Siguiente» con el pulgar o desliza la tarjeta.",
  },
  {
    icono: "apps-outline",
    titulo: "Las 5 secciones",
    texto: "Abajo del todo están las secciones de la tienda. Toca una para ir a ella. Si la tocas 3 veces seguidas, se recarga.",
    objetivo: PESTANAS,
  },
  {
    icono: "home-outline",
    titulo: "Inicio",
    texto: "La Oferta de la semana, lo Recién llegado y las categorías: PlayStation, Nintendo Switch, Xbox y más. Desliza hacia abajo para verlo todo.",
    objetivo: [PESTANAS[0]],
    ruta: "/",
    desplazar: '[data-testid="boton-ver-categorias"]',
  },
  {
    icono: "apps-outline",
    titulo: "Ver categorías",
    texto: "Este botón te lleva directo a las categorías: PlayStation, Nintendo Switch, Xbox y más.",
    objetivo: ['[data-testid="boton-ver-categorias"]'],
    ruta: "/",
    desplazar: '[data-testid="boton-ver-categorias"]',
  },
  {
    icono: "grid-outline",
    titulo: "Aquí están las categorías",
    texto: "Así llegas con «Ver categorías»: toca la que te interese y verás sus artículos.",
    objetivo: ['[data-testid="seccion-categorias"]'],
    ruta: "/",
    desplazar: '[data-testid="seccion-categorias"]',
  },
  {
    icono: "cash-outline",
    titulo: "Vender ahora",
    texto: "¿Tienes una consola o un dispositivo que ya no usas? Toca este botón, cuéntanos lo básico y el equipo te da un precio.",
    objetivo: ['[data-testid="boton-vender-ahora"]'],
    ruta: "/",
    desplazar: '[data-testid="boton-vender-ahora"]',
    accion: { texto: "Abrir el formulario", vender: true },
  },
  {
    icono: "search-outline",
    titulo: "El buscador",
    texto: "Escribe aquí lo que buscas: productos o secciones como «Blog» o «Inicio de sesión». Puedes arrastrar el buscador arriba o abajo.",
    objetivo: ["#buscador-flotante"],
    ruta: "/",
    desplazar: '[data-testid="boton-ver-categorias"]',
  },
  {
    icono: "person-outline",
    titulo: "Perfil",
    texto: "Tu cuenta. Dentro hay dos pestañas: «Mi cuenta» y «Seguimientos», donde ves tus pedidos y reparaciones.",
    objetivo: [PESTANAS[1]],
    ruta: "/perfil",
  },
  {
    icono: "bag-handle-outline",
    titulo: "Cesta",
    texto: "Cada artículo es unidad única: al añadirlo te lo reservamos 15 minutos. Después eliges envío a toda España o entrega en persona en Zaragoza.",
    objetivo: [PESTANAS[2]],
    ruta: "/cesta",
  },
  {
    icono: "chatbubbles-outline",
    titulo: "Foro",
    texto: "Aquí está la comunidad: Foro, Noticias Gaming, Nuestras Novedades, Torneos y tus Chats.",
    objetivo: [PESTANAS[3]],
    ruta: "/chat-global",
  },
  {
    icono: "swap-vertical-outline",
    titulo: "Cambia de pestaña aquí",
    texto: "Toca este botón azul para ver Foro, Noticias Gaming, Nuestras Novedades, Torneos y Chat. Para ordenarlas a tu gusto, mantén pulsada una pestaña y arrástrala a su sitio.",
    objetivo: ['[data-testid="selector-pestanas"]'],
    ruta: "/chat-global",
  },
  {
    icono: "sparkles-outline",
    titulo: "Blue IA",
    texto: "Pregúntame lo que quieras. Las sugerencias se mueven solas: toca una. Si necesitas a una persona, toca «Hablar con el equipo».",
    objetivo: [PESTANAS[4]],
    ruta: "/blue-ia",
  },
  {
    icono: "happy-outline",
    titulo: "Este soy yo",
    texto: "Tócame y se abre mi panel con 3 pestañas: Asistente, Notificaciones y Noticias. Arrástrame a donde quieras; si tapo algo, me aparto solo.",
    objetivo: [`#${BLUE_DOM_ID}`],
    ruta: "/",
    desplazar: '[data-testid="boton-ver-categorias"]',
  },
  {
    icono: "download-outline",
    titulo: "Instala la tienda",
    texto: "Ten VideojuegosZaragoza como una app en tu pantalla de inicio: la abres con un toque, sin buscarla en el navegador.",
    ruta: "/",
    soloInstalable: true,
    accion: { texto: "Instalar la app", instalar: true },
  },
  {
    icono: "construct-outline",
    titulo: "Reparación y limpieza",
    texto: "En Servicios tienes reparación, limpieza y mantenimiento para tus dispositivos.",
    accion: { texto: "Ver servicios", ruta: "/servicios" },
  },
  {
    icono: "person-circle-outline",
    titulo: "Tu cuenta",
    texto: "Con tu cuenta guardas tus conversaciones, sigues tus pedidos y reparaciones y recibes avisos. Solo tardas un momento.",
    cuenta: true,
  },
];

type Caja = { x: number; y: number; w: number; h: number };

// Caja en pantalla de los elementos visibles que cumplen los selectores (unión si son varios).
function medirObjetivo(selectores?: string[]): Caja | null {
  if (!selectores?.length || Platform.OS !== "web" || typeof document === "undefined") return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const sel of selectores) {
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const r = el.getBoundingClientRect();
      // Solo lo que se ve (las pantallas de otras pestañas también existen, ocultas).
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > window.innerHeight) continue;
      x1 = Math.min(x1, r.left);
      y1 = Math.min(y1, r.top);
      x2 = Math.max(x2, r.right);
      y2 = Math.max(y2, r.bottom);
    }
  }
  return Number.isFinite(x1) ? { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } : null;
}

const FONDO_GUIA = "rgba(11,33,56,0.58)";
const MARGEN_ARO = 6;

function GuiaBlue({
  onCerrar: cerrarSinMedir,
  onIr,
  onVender,
  onInstalar,
  instalable,
  onSenalaBlue,
}: {
  onCerrar: () => void;
  onIr: (ruta: string) => void;
  onVender: () => void;
  onInstalar: () => void;
  // El paso «Instala la tienda» solo sale si se puede instalar en este dispositivo.
  instalable: boolean;
  // Avisa a Blue de si este paso le señala a él (mientras no, se esconde para no tapar la guía).
  onSenalaBlue: (si: boolean) => void;
}) {
  const [paso, setPaso] = useState(0);
  const pasos = React.useMemo(() => PASOS_GUIA.filter((x) => !x.soloInstalable || instalable), [instalable]);
  const total = pasos.length;
  const p = pasos[paso];

  // Embudo: en qué paso está cada visitante (con su consentimiento de analítica) y cómo
  // termina la guía. Así se ve en el panel dónde se pierde la gente y cuántos llegan al
  // formulario de Vender.
  useEffect(() => {
    trackEvent("guia_paso", `Guía Blue: ${String(paso + 1).padStart(2, "0")} ${p.titulo}`);
    if (paso === total - 1) trackEvent("guia_completada", "Guía Blue: completada");
    // Si la guía ya enseñó el selector de pestañas del Foro, el aviso suelto no vuelve a salir.
    if (p.objetivo?.some((o) => o.includes("selector-pestanas"))) {
      AsyncStorage.setItem(SELECTOR_VISTO_KEY, "1").catch(() => {});
    }
  }, [paso, p.titulo, p.objetivo, total]);
  const pasoActualRef = useRef(0);
  pasoActualRef.current = paso;
  const onCerrar = useCallback(() => {
    if (pasoActualRef.current < total - 1) trackEvent("guia_saltada", "Guía Blue: saltada");
    cerrarSinMedir();
  }, [cerrarSinMedir, total]);
  const anim = useRef(new Animated.Value(1)).current;
  const direccion = useRef(1);
  const pathname = usePathname() ?? "";
  const [caja, setCaja] = useState<Caja | null>(null);
  const [pantalla, setPantalla] = useState(() => Dimensions.get("window"));

  // La guía te lleva de la mano: en cada paso cambia sola a la pantalla de la que habla
  // (Inicio, Perfil, Cesta, Foro, Blue IA…). Al abrirse en otra pantalla, vuelve a Inicio.
  const destino = p.ruta ?? "/";
  useEffect(() => {
    if (pathname !== destino) router.navigate(destino as Href);
    // solo al cambiar de paso
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destino]);

  useEffect(() => {
    onSenalaBlue(!!p.objetivo?.includes(`#${BLUE_DOM_ID}`));
  }, [p, onSenalaBlue]);

  // Mide el botón del paso (tras un instante, para que la pantalla ya esté pintada) y
  // vuelve a medir si cambia el tamaño de la pantalla.
  useEffect(() => {
    setCaja(null);
    // Trae a la vista lo que hay que enseñar (desplaza Inicio hasta el botón o la sección).
    const traer = () => {
      if (!p.desplazar || Platform.OS !== "web" || typeof document === "undefined") return;
      const el = Array.from(document.querySelectorAll(p.desplazar)).find((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 4 && r.height > 4;
      });
      el?.scrollIntoView({ block: p.desplazar.includes("seccion") ? "start" : "center", behavior: "smooth" });
    };
    const t0 = setTimeout(traer, 200);
    if (!p.objetivo) {
      return () => clearTimeout(t0);
    }
    const medir = () => {
      setPantalla(Dimensions.get("window"));
      setCaja(medirObjetivo(p.objetivo));
    };
    const t1 = setTimeout(medir, 700);
    const t2 = setTimeout(medir, 1300);
    const t3 = setTimeout(medir, 2000);
    const sub = Dimensions.addEventListener("change", medir);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      // @ts-ignore — API antigua (RN<0.65) devuelve undefined
      sub?.remove?.();
    };
  }, [p, pathname]);

  // Aro que late y flecha que bota sobre el botón señalado.
  const latido = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const bucle = Animated.loop(
      Animated.sequence([
        Animated.timing(latido, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: USA_NATIVO }),
        Animated.timing(latido, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: USA_NATIVO }),
      ])
    );
    bucle.start();
    return () => bucle.stop();
  }, [latido]);

  const pasoRef = useRef(paso);
  pasoRef.current = paso;

  const irA = useCallback(
    (n: number) => {
      const actual = pasoRef.current;
      const destino = limitar(n, 0, total - 1);
      if (destino === actual) return;
      direccion.current = destino > actual ? 1 : -1;
      pasoRef.current = destino;
      anim.setValue(0);
      setPaso(destino);
      Animated.timing(anim, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: USA_NATIVO }).start();
    },
    [anim, total]
  );
  const siguienteRef = useRef(() => irA(pasoRef.current + 1));
  siguienteRef.current = () => irA(pasoRef.current + 1);
  const atrasRef = useRef(() => irA(pasoRef.current - 1));
  atrasRef.current = () => irA(pasoRef.current - 1);

  // Deslizar con un dedo: a la izquierda, siguiente; a la derecha, anterior.
  const deslizar = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_e, g) => {
        if (g.dx < -40) siguienteRef.current();
        else if (g.dx > 40) atrasRef.current();
      },
    })
  ).current;

  const { width, height } = pantalla;
  const ancho = Math.min(width - 24, 420);
  const desplazamiento = anim.interpolate({ inputRange: [0, 1], outputRange: [28 * direccion.current, 0] });

  // Hueco iluminado alrededor del botón y dónde va la tarjeta: abajo (para el pulgar) salvo
  // que el botón esté abajo; entonces justo encima de él, con la flecha apuntándolo.
  const hueco = caja
    ? {
        x: Math.max(0, caja.x - MARGEN_ARO),
        y: Math.max(0, caja.y - MARGEN_ARO),
        w: Math.min(width, caja.w + MARGEN_ARO * 2),
        h: caja.h + MARGEN_ARO * 2,
      }
    : null;
  const botonAbajo = !!hueco && hueco.y + hueco.h / 2 > height * 0.5;
  const ESPACIO_FLECHA = 44;
  const abajoTarjeta = hueco && botonAbajo ? Math.max(18, height - hueco.y + ESPACIO_FLECHA) : Platform.OS === "ios" ? 30 : 18;
  const flechaX = hueco ? limitar(hueco.x + hueco.w / 2 - 16, 8, width - 40) : 0;
  const flechaY = hueco ? (botonAbajo ? hueco.y - 38 : hueco.y + hueco.h + 6) : 0;
  const bote = latido.interpolate({ inputRange: [0, 1], outputRange: [0, botonAbajo ? 7 : -7] });
  const escalaAro = latido.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCerrar}>
      <View style={{ flex: 1 }}>
        {/* Oscurecido: todo menos el hueco del botón señalado. */}
        {hueco ? (
          <>
            <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: hueco.y, backgroundColor: FONDO_GUIA }} />
            <View style={{ position: "absolute", left: 0, right: 0, top: hueco.y + hueco.h, bottom: 0, backgroundColor: FONDO_GUIA }} />
            <View style={{ position: "absolute", left: 0, width: hueco.x, top: hueco.y, height: hueco.h, backgroundColor: FONDO_GUIA }} />
            <View
              style={{ position: "absolute", left: hueco.x + hueco.w, right: 0, top: hueco.y, height: hueco.h, backgroundColor: FONDO_GUIA }}
            />
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: hueco.x,
                top: hueco.y,
                width: hueco.w,
                height: hueco.h,
                // Poco redondeado: el hueco iluminado es rectangular y, con más radio, asoman
                // esquinas del fondo blanco de la barra por fuera del aro.
                borderRadius: Math.min(10, hueco.h / 2),
                borderWidth: 3,
                borderColor: COLORS.accent,
                transform: [{ scale: escalaAro }],
              }}
            />
            <Animated.View
              pointerEvents="none"
              style={{ position: "absolute", left: flechaX, top: flechaY, transform: [{ translateY: bote }] }}
            >
              <Ionicons name={botonAbajo ? "arrow-down-circle" : "arrow-up-circle"} size={32} color={COLORS.accent} />
            </Animated.View>
          </>
        ) : (
          <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: FONDO_GUIA }} />
        )}

        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: abajoTarjeta,
            // En pantallas anchas, a la derecha (pulgar derecho); en el móvil, a todo lo ancho.
            alignItems: width >= 700 ? "flex-end" : "center",
          }}
        >
        <Animated.View
          {...deslizar.panHandlers}
          accessibilityViewIsModal
          style={{
            width: ancho,
            backgroundColor: COLORS.bg,
            borderRadius: 24,
            paddingHorizontal: 18,
            paddingTop: 16,
            paddingBottom: 16,
            gap: 12,
            alignItems: "center",
            opacity: anim,
            transform: [{ translateX: desplazamiento }],
            shadowColor: "#0B2138",
            shadowOpacity: 0.18,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 8 },
            elevation: 12,
          }}
        >
          <Pressable
            onPress={onCerrar}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Saltar la guía"
            style={{ position: "absolute", top: 12, right: 14, zIndex: 2, paddingVertical: 4, paddingHorizontal: 6 }}
          >
            <Text style={{ color: COLORS.muted, fontWeight: "900", fontSize: 13 }}>Saltar</Text>
          </Pressable>

          <MarcaAnimada cual="carga" ancho={paso === 0 ? 92 : 64} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name={p.icono} size={20} color={COLORS.accent} />
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 19, textAlign: "center" }}>{p.titulo}</Text>
          </View>
          <Text style={{ color: COLORS.text, fontSize: 15, lineHeight: 22, textAlign: "center", fontWeight: "600" }}>{p.texto}</Text>

          {p.accion ? (
            <Pressable
              onPress={() =>
                p.accion?.vender ? onVender() : p.accion?.instalar ? onInstalar() : p.accion?.ruta ? onIr(p.accion.ruta) : undefined
              }
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={{ color: COLORS.accent, fontWeight: "900", fontSize: 14.5, textAlign: "center" }}>{p.accion.texto} →</Text>
            </Pressable>
          ) : null}

          {/* Progreso */}
          <View style={{ flexDirection: "row", gap: 6, marginTop: 2 }} accessibilityLabel={`Paso ${paso + 1} de ${total}`}>
            {pasos.map((_, i) => (
              <View
                key={i}
                style={{
                  width: i === paso ? 18 : 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: i === paso ? COLORS.accent : COLORS.border,
                }}
              />
            ))}
          </View>

          {p.cuenta ? (
            <View style={{ alignSelf: "stretch", gap: 10, marginTop: 4 }}>
              <BotonPanel icono="person-add-outline" texto="Crear cuenta" principal onPress={() => onIr("/perfil?acceso=registro")} />
              <BotonPanel icono="log-in-outline" texto="Ya tengo cuenta: iniciar sesión" onPress={() => onIr("/perfil?acceso=entrar")} />
              <Pressable onPress={onCerrar} hitSlop={8} accessibilityRole="button" style={{ paddingVertical: 6 }}>
                <Text style={{ color: COLORS.muted, fontWeight: "800", textAlign: "center" }}>Ahora no, gracias</Text>
              </Pressable>
            </View>
          ) : (
            // Botones grandes abajo; «Siguiente» a la derecha, donde llega el pulgar derecho.
            <View style={{ alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 }}>
              <Pressable
                onPress={() => atrasRef.current()}
                disabled={paso === 0}
                accessibilityRole="button"
                accessibilityLabel="Paso anterior"
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 52,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: paso === 0 ? 0 : pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ color: COLORS.accentDark, fontWeight: "900", fontSize: 15 }}>Atrás</Text>
              </Pressable>
              <Pressable
                onPress={() => siguienteRef.current()}
                accessibilityRole="button"
                accessibilityLabel="Paso siguiente"
                style={({ pressed }) => ({
                  flex: 2,
                  minHeight: 56,
                  borderRadius: 999,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  backgroundColor: COLORS.accent,
                  opacity: pressed ? 0.88 : 1,
                })}
              >
                <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>{paso === 0 ? "Empezar" : "Siguiente"}</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          )}
        </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

function Aviso({ titulo, accion, onPress }: { titulo: string; accion: string; onPress: () => void }) {
  return (
    <View style={{ alignItems: "center", gap: 4 }}>
      <Text style={{ color: COLORS.text, fontWeight: "800", textAlign: "center" }}>{titulo}</Text>
      <Pressable onPress={onPress} hitSlop={6}>
        <Text style={{ color: COLORS.accent, fontWeight: "900", textAlign: "center" }}>{accion}</Text>
      </Pressable>
    </View>
  );
}
