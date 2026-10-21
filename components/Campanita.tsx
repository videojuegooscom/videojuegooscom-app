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
 * - Guía de bienvenida (GuiaBlue): a los 15 s, una vez por dispositivo, solo sin
 *   sesión y solo si está en Inicio (en una ficha, el catálogo, un chat… espera a que
 *   llegue a Inicio, sin interrumpirle). 17 pasos (18 si se puede instalar la tienda), con más imagen que letra: una mano
 *   enseña dónde tocar y la guía hace las cosas (cambiar de sección desde la tarjeta, pulsar
 *   «Vender ahora» y abrir el formulario, desplazarlo y salir con la flecha, escribir ejemplos
 *   en el buscador con letras Siri, enmarcar las pestañas de Perfil). SEÑALA cada botón (se
 *   oscurece todo menos él, aro azul que late y flecha) con data-testid "pestana-*" en
 *   app/(tabs)/_layout.tsx, id "buscador-flotante" en components/Barramagic.tsx y los
 *   nativeID "vender-scroll", "perfil-pestanas" y "perfil-acceso". Va a Inicio al empezar y
 *   se usa con un dedo: la tarjeta mide siempre lo mismo y «Siguiente» queda siempre a la
 *   altura del pulgar derecho (lo señalado se desplaza hacia arriba para no quedar tapado).
 *   Al final ayuda a crear cuenta o a iniciar sesión (/perfil?acceso=registro|entrar).
 *   Se puede repetir desde el panel de Blue. Se prueba entera con pruebas/guia-blue.mjs.
 *   MINI-GUÍAS: el panel de Blue (pestaña Asistente) tiene una fila «Guías rápidas» con Inicio, Catálogo,
 *   Artículo, Vender, Perfil, Cesta, Foro, Blue IA y Servicios (la de la pantalla actual, resaltada): la
 *   misma guía, pero solo con los pasos de ESA pantalla (campo `seccion` de cada paso). Si es otra pantalla
 *   la guía lleva hasta allí y al terminar vuelve; no marca la guía de bienvenida como vista y se mide
 *   aparte (miniguia_*). Van en el panel porque Blue no se ve en Vender, el Foro ni Blue IA.
 *   Se prueba con pruebas/blue-panel.mjs.
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
 * - Al tocar a Blue se abre su panel con 2 pestañas: "Asistente" (UN solo botón «Hablar con
 *   Blue IA o el equipo» —Blue IA responde primero y desde ese chat se pasa al equipo—, la guía,
 *   "Vender", instalar) y "Noticias y avisos" (antes eran dos pestañas, «Notificaciones» y «Noticias»:
 *   avisos —mensajes sin leer, favoritos que ya no están, novedades, con su número—, Noticias Flash y
 *   los ajustes de avisos, en filas con icono). Si hay avisos, abre en esa pestaña.
 * - Avisos de Noticias Gaming: si el cliente los activó (con sesión,
 *   preferencias_usuario.avisos_noticias; sin sesión o si esa tabla falla, la clave
 *   local NOTICIAS_AVISOS_KEY = "1"), cuenta las noticias publicadas desde la última
 *   vez que las vio (lo más reciente entre preferencias_usuario.noticias_vistas_hasta
 *   y NOTICIAS_VISTAS_KEY; si no hay ninguna, las de las últimas 24 h). Se suman al
 *   número rojo y salen en «Noticias y avisos» ("Ver noticias"). Si no están activados,
 *   ahí mismo se explica cómo activarlos (campana de Noticias Gaming).
 * - Avisos de la tienda (en «Noticias y avisos», con sus ajustes en «Mis avisos»):
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
import { asegurarCssSiriTexto, escribirEnBuscadorDemo, TextoSiri } from "./Barramagic";

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
  const guiaAbiertaRef = useRef(false);
  guiaAbiertaRef.current = guiaAbierta;
  // Mini-guía («Guía rápida» del panel): solo los pasos de la pantalla donde está la persona, sin salir de ella. null = guía completa.
  const [guiaMini, setGuiaMini] = useState<{ seccion: SeccionGuia; ruta?: string } | null>(null);
  const guiaMiniRef = useRef<{ seccion: SeccionGuia; ruta?: string } | null>(null);
  guiaMiniRef.current = guiaMini;
  const guiaPendienteRef = useRef(false);
  // Pantalla donde estaba la persona al abrirse la guía: al saltarla o cerrarla se vuelve allí (la guía te lleva por
  // otras pantallas y, sin esto, te dejaba en la última).
  const guiaOrigenRef = useRef<string | null>(null);
  const pathnameActualRef = useRef(pathname);
  pathnameActualRef.current = pathname;
  // (Si ya hay una guía abierta no se abre otra: p. ej. la de bienvenida, a los 15 s, no pisa una mini-guía.)
  const abrirGuia = useCallback(() => {
    if (guiaAbiertaRef.current) return;
    guiaOrigenRef.current = pathnameActualRef.current;
    setGuiaMini(null);
    setGuiaAbierta(true);
  }, []);
  // Si la mini-guía es de la pantalla donde está la persona, no se mueve de ella (`ruta`); si es de otra, la guía la lleva
  // hasta allí (cada paso sabe su pantalla) y al terminar vuelve a donde estaba.
  const abrirMiniGuia = useCallback((seccion: SeccionGuia) => {
    if (guiaAbiertaRef.current) return;
    const aqui = pathnameActualRef.current;
    guiaOrigenRef.current = aqui;
    setGuiaMini({ seccion, ruta: seccionDeGuia(aqui) === seccion ? aqui : undefined });
    setGuiaAbierta(true);
  }, []);
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
  // Panel de Blue: «blue» = Asistente; «avisos» = «Noticias y avisos» (las notificaciones y las noticias, juntas).
  const [pestana, setPestana] = useState<"blue" | "avisos">("blue");
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

  const openPanel = useCallback((tab?: "blue" | "avisos") => {
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
  // nuevo). Solo se ofrece sola en Inicio: quien llega a una ficha, al catálogo, a un chat, al pago o al panel
  // (p. ej. desde un enlace compartido) no es interrumpido ni llevado a otra pantalla; se espera a que llegue a Inicio.
  const sitioSinGuia = pathname !== "/";
  // Pantalla con mini-guía («Guía rápida» en el panel), si la tiene.
  const seccionGuiaActual = seccionDeGuia(pathname);
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
      else abrirGuia();
    }, Math.max(0, GUIA_MS - yaPasado));
    return () => clearTimeout(t);
  }, [abrirGuia]);

  useEffect(() => {
    if (guiaPendienteRef.current && !sitioSinGuia) {
      guiaPendienteRef.current = false;
      abrirGuia();
    }
  }, [sitioSinGuia, abrirGuia]);

  // volver = true (Saltar, «Ahora no», atrás del móvil): se vuelve a la pantalla donde estaba la persona al abrirse la
  // guía. Con una acción (Crear cuenta, Instalar…) no: esa acción lleva a otro sitio.
  const cerrarGuia = useCallback((volver?: boolean) => {
    setGuiaAbierta(false);
    setGuiaSenalaBlue(false);
    // Una mini-guía no cuenta como «la guía de bienvenida vista»: quien aún no la ha visto la sigue recibiendo.
    if (!guiaMiniRef.current) AsyncStorage.setItem(GUIA_VISTA_KEY, "1").catch(() => {});
    const origen = guiaOrigenRef.current;
    guiaOrigenRef.current = null;
    if (volver === true && origen && origen !== pathnameActualRef.current) router.navigate(origen as Href);
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
    } else openPanel("avisos");
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

            {/* Pestañas: Asistente · Noticias y avisos (las notificaciones y las noticias, en una sola) */}
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 14 }}>
              {(
                [
                  { key: "blue", label: "Asistente", icono: "sparkles-outline", n: 0 },
                  { key: "avisos", label: "Noticias y avisos", icono: "notifications-outline", n: totalCount },
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
                      // 44 px de alto (regla del pulgar)
                      minHeight: 44,
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
                {/* Un solo botón para hablar: primero conversa Blue IA y, desde ese chat, se pasa al equipo
                    («Hablar con el equipo», app/(tabs)/blue-ia.tsx). Antes eran dos botones que llevaban al mismo sitio. */}
                <BotonPanel icono="chatbubbles-outline" texto="Hablar con Blue IA o el equipo" principal onPress={() => ir("/blue-ia")} />
                <BotonPanel
                  icono="map-outline"
                  texto="Ver la guía de la tienda"
                  onPress={() => {
                    setPanelOpen(false);
                    abrirGuia();
                  }}
                />
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

                {/* Guías rápidas: una por pantalla, solo con lo de esa pantalla. Aquí (y no en la propia pantalla) porque
                    Blue no se ve en Vender, el Foro ni Blue IA. La de la pantalla donde estás va resaltada. */}
                <TituloSeccionBlue texto="Guías rápidas" />
                <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
                  {(Object.keys(NOMBRE_SECCION_GUIA) as SeccionGuia[]).map((s) => {
                    const actual = s === seccionGuiaActual;
                    return (
                      <Pressable
                        key={s}
                        onPress={() => {
                          setPanelOpen(false);
                          abrirMiniGuia(s);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Guía rápida: ${NOMBRE_SECCION_GUIA[s]}`}
                        style={({ pressed }) => ({
                          minHeight: 44,
                          paddingHorizontal: 16,
                          borderRadius: 999,
                          borderWidth: 1.5,
                          borderColor: COLORS.accent,
                          backgroundColor: actual ? COLORS.accentSoft : "transparent",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <Text style={{ color: COLORS.accentDark, fontWeight: actual ? "900" : "800", fontSize: 14 }}>{NOMBRE_SECCION_GUIA[s]}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              </>
              ) : null}

              {/* «Noticias y avisos»: lo que ha pasado (avisos y noticias) y los ajustes de avisos, en una sola pestaña. */}
              {pestana === "avisos" ? (
              <View style={{ width: "100%", maxWidth: 460, gap: 2 }}>
                <TituloSeccionBlue texto="Avisos" />
                {totalCount === 0 ? (
                  <FilaBlue icono="checkmark-circle-outline" titulo="Estás al día: no tienes avisos nuevos." />
                ) : (
                  <>
                    {unreadChats > 0 ? (
                      <Aviso
                        icono="chatbubbles-outline"
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
                        icono="heart-dislike-outline"
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
                      <Aviso icono="newspaper-outline" titulo="Hay novedades en el Foro" accion="Ver novedades" onPress={() => ir("/chat-global?tab=novedades")} />
                    ) : null}
                    {noticiasNuevas > 0 ? (
                      <Aviso
                        icono="megaphone-outline"
                        titulo={noticiasNuevas === 1 ? "Hay 1 noticia nueva" : `Hay ${noticiasNuevas} noticias nuevas`}
                        accion="Ver noticias"
                        onPress={() => ir("/chat-global?tab=news")}
                      />
                    ) : null}
                    {isAdmin && salidaPendiente > 0 ? (
                      <Aviso
                        icono="alert-circle-outline"
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
                        icono="bag-add-outline"
                        titulo={novedadesTienda === 1 ? "Ha llegado 1 artículo nuevo" : `Han llegado ${novedadesTienda} artículos nuevos`}
                        accion="Ver novedades"
                        onPress={verNovedades}
                      />
                    ) : null}
                    {llegadas.map((l) => (
                      <Aviso
                        icono="checkmark-done-outline"
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
                        icono="trending-down-outline"
                        key={b.id}
                        titulo={`Ha bajado de precio: ${b.title} · antes ${fmtEUR(b.antes)}, ahora ${fmtEUR(b.ahora)}`}
                        accion="Ver"
                        onPress={() => verBajada(b)}
                      />
                    ))}
                  </>
                )}
                {!isLoggedIn ? (
                  <Text style={{ color: COLORS.muted, fontSize: 12, lineHeight: 17, paddingVertical: 4 }}>
                    Inicia sesión para ver también los avisos de tus conversaciones.
                  </Text>
                ) : null}

                <TituloSeccionBlue texto="Noticias" />
                {noticias.length ? (
                  noticias.map((n) => <FilaBlue key={n} icono="megaphone-outline" titulo={n} />)
                ) : (
                  <FilaBlue icono="megaphone-outline" titulo="No hay noticias ahora mismo." apagada />
                )}
                {/* Sin avisos de noticias activados: cómo activarlos (con la campana de Noticias Gaming). */}
                {!avisosNoticias ? (
                  <Aviso
                    icono="notifications-outline"
                    titulo="Activa los avisos de noticias"
                    detalle="Con la campana de Noticias Gaming"
                    accion="Ir a Noticias Gaming"
                    onPress={() => ir("/chat-global?tab=news")}
                  />
                ) : null}

                {/* Ajustes de los avisos de la tienda. */}
                <TituloSeccionBlue texto="Mis avisos" />
                <View style={{ alignSelf: "stretch", gap: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 }}>
                    <IconoCirculoBlue icono="bag-add-outline" />
                    <Text style={{ color: COLORS.text, fontWeight: "800", flex: 1 }}>Avisarme de los artículos nuevos</Text>
                    <Switch
                      value={avisosNovedades}
                      onValueChange={cambiarAvisosNovedades}
                      trackColor={{ false: "#D9E3EC", true: COLORS.accentSoft }}
                      thumbColor={avisosNovedades ? COLORS.accent : "#F4F4F5"}
                      accessibilityLabel="Avisarme de los artículos nuevos"
                    />
                  </View>

                  {isLoggedIn ? (
                    <>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                        <IconoCirculoBlue icono="search-outline" />
                        <Text style={{ color: COLORS.text, fontWeight: "900", flex: 1 }}>Avísame cuando llegue</Text>
                      </View>
                      <Text style={{ color: COLORS.muted, fontSize: 12, lineHeight: 17 }}>
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
                      {msgAviso ? <Text style={{ color: COLORS.muted, fontSize: 12 }}>{msgAviso}</Text> : null}
                      {avisosBusqueda.map((a) => (
                        <View key={a.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
                          <Ionicons name="pricetag-outline" size={16} color={COLORS.muted} />
                          <Text style={{ color: COLORS.text, fontWeight: "700", flex: 1 }}>{a.texto}</Text>
                          <Pressable
                            onPress={() => quitarAviso(a.id)}
                            accessibilityRole="button"
                            accessibilityLabel={`Quitar el aviso ${a.texto}`}
                            style={{ minHeight: 44, minWidth: 64, alignItems: "center", justifyContent: "center" }}
                          >
                            <Text style={{ color: COLORS.accent, fontWeight: "900" }}>Quitar</Text>
                          </Pressable>
                        </View>
                      ))}
                    </>
                  ) : (
                    <Aviso
                      icono="search-outline"
                      titulo="Avísame cuando llegue"
                      detalle="Inicia sesión para que te avisemos cuando llegue lo que buscas"
                      accion="Iniciar sesión"
                      onPress={() => ir("/perfil?acceso=entrar")}
                    />
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
          onInstalar={() => {
            cerrarGuia();
            instalarApp();
          }}
          instalable={!!modoInst}
          conSesion={isLoggedIn}
          onSenalaBlue={setGuiaSenalaBlue}
          seccion={guiaMini?.seccion}
          rutaFija={guiaMini?.ruta}
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
// Más imagen que letra: cada paso lleva un texto de una línea y, además, se ENSEÑA con movimiento: una mano que
// toca lo señalado («gesto»), las secciones de la barra de abajo escribiéndose con el brillo de Siri, un ejemplo
// que se escribe solo en el buscador, el botón «Vender ahora» que se pulsa solo y el formulario que se desplaza…
type DemoGuia =
  | "secciones" // los nombres de las 5 secciones se escriben con brillo Siri y se puede pasar de una a otra
  | "buscador" // escribe «lo último añadido» y «lo más antiguo» en el buscador
  | "vender-toque" // la mano pulsa «Vender ahora» y la guía pasa sola al formulario
  | "formulario" // el formulario se desplaza un poco para enseñar que hay más abajo
  | "salir-formulario" // se señala cómo salir del formulario
  | "perfil-cuenta" // en Perfil con sesión, se pone la pestaña «Mi cuenta»
  | "perfil-seguimientos" // en Perfil con sesión, la guía pulsa la pestaña «Seguimientos» y se ve su contenido
  | "foro-pestanas" // la guía despliega el selector del Foro y enseña cada pestaña, una por una
  | "foro-chat" // la guía abre la pestaña «Foro» (los mensajes) y la tarjeta enseña cómo reaccionar y responder
  | "capacidades" // lo que Blue sabe hacer (iconos en la tarjeta)
  | "como-se-compra"; // los pasos de una compra (iconos en la tarjeta)

// Pantallas que tienen mini-guía (botón «Guía rápida» en el panel de Blue): cada una enseña solo los pasos de ESA pantalla.
type SeccionGuia = "inicio" | "catalogo" | "producto" | "vender" | "perfil" | "cesta" | "foro" | "blue-ia" | "servicios";

type PasoGuia = {
  icono: React.ComponentProps<typeof Ionicons>["name"];
  titulo: string;
  // Mini-guía a la que pertenece el paso (la pantalla donde se enseña). Sin ella, solo sale en la guía completa.
  seccion?: SeccionGuia;
  texto: string | ((conSesion: boolean) => string);
  objetivo?: string[];
  // Tarjeta baja (sin la mascota): deja ver la página que se enseña (el formulario, Perfil, Servicios…).
  compacta?: boolean;
  // No enmarca el título de la página (primer paso, instalar y cuenta no hablan de ninguna página).
  sinTitulo?: boolean;
  // Solo se enseña con sesión iniciada / solo sin ella.
  soloConSesion?: boolean;
  soloSinSesion?: boolean;
  // Solo se enseña si la tienda tiene algún artículo publicado al que llevar a la persona (la ruta lleva «{producto}»).
  soloConProducto?: boolean;
  // No oscurece la página (se quiere ver entera, p. ej. los mensajes del Foro).
  sinOscurecer?: boolean;
  // Si lo señalado es muy alto (la tarjeta de un servicio), solo se enmarca su parte de arriba, para que la tarjeta de la
  // guía no lo tape.
  limiteAlto?: number;
  // Selector del botón señalado: tocar dentro del recuadro lo pulsa de verdad (la guía tapa la página, así que
  // sin esto «probarlo» no hacía nada).
  probar?: string;
  // Pantalla en la que se explica el paso: la guía navega sola hasta ella (como si te llevara
  // de la mano). Si no se indica, se queda en Inicio.
  ruta?: string;
  // Selector de lo que hay que traer a la vista (desplazando la pantalla) antes de señalarlo.
  desplazar?: string;
  // Lleva Inicio arriba del todo antes de señalar (p. ej. para que se vea el buscador).
  arriba?: boolean;
  accion?: { texto: string; ruta?: string; instalar?: boolean };
  cuenta?: boolean;
  // Solo se enseña si la tienda se puede instalar en este dispositivo.
  soloInstalable?: boolean;
  // Mano animada: «toque» sobre lo señalado; «siguiente» sobre el botón «Siguiente» de la tarjeta.
  gesto?: "toque" | "siguiente";
  demo?: DemoGuia;
};

const PESTANAS = ["index", "perfil", "cesta", "foro", "blue-ia"].map((p) => `[data-testid="pestana-${p}"]`);

const PASOS_GUIA: PasoGuia[] = [
  {
    icono: "hand-left-outline",
    titulo: "¡Hola! Soy Blue",
    texto: "Toca «Siguiente» para empezar.",
    gesto: "siguiente",
    sinTitulo: true,
  },
  {
    icono: "apps-outline",
    titulo: "Las 5 secciones",
    texto: "Toca una para cambiar de sección.",
    objetivo: PESTANAS,
    demo: "secciones",
    sinTitulo: true, // ya se enmarca toda la barra
  },
  {
    icono: "home-outline",
    titulo: "Inicio",
    seccion: "inicio",
    texto: "Ofertas, novedades y categorías.",
    objetivo: [PESTANAS[0]],
    ruta: "/",
    desplazar: '[data-testid="boton-ver-categorias"]',
    gesto: "toque",
  },
  {
    icono: "apps-outline",
    titulo: "Ver categorías",
    seccion: "inicio",
    texto: "Te lleva directo a las categorías.",
    objetivo: ['[data-testid="boton-ver-categorias"]'],
    ruta: "/",
    desplazar: '[data-testid="boton-ver-categorias"]',
    gesto: "toque",
  },
  {
    icono: "grid-outline",
    titulo: "Las categorías",
    seccion: "inicio",
    texto: "Toca una y verás sus artículos.",
    objetivo: ['[data-testid="seccion-categorias"]'],
    ruta: "/",
    desplazar: '[data-testid="seccion-categorias"]',
  },
  {
    icono: "options-outline",
    titulo: "Filtros y orden",
    seccion: "catalogo",
    texto: "Filtra por plataforma, estado y precio, y ordena.",
    objetivo: ['[aria-label^="Filtros"]'],
    ruta: "/catalogo",
    compacta: true,
  },
  {
    icono: "bag-add-outline",
    titulo: "Un artículo",
    seccion: "producto",
    // «Añadir» reserva el artículo 15 minutos (lib/reservas.ts); «Comprar ya» lleva directo a pedir, con sesión.
    texto: "«Añadir» lo reserva 15 minutos. «Comprar ya» va directo a pedir.",
    objetivo: ['[aria-label^="Añadir "]', '[aria-label^="Comprar ya "]'],
    // ?guia=1: la ficha no suma una visita ni un evento de analítica por esta demostración.
    ruta: "/producto/{producto}?guia=1",
    desplazar: '[aria-label^="Comprar ya "]',
    soloConProducto: true,
    compacta: true,
  },
  {
    icono: "cash-outline",
    titulo: "Vender ahora",
    seccion: "inicio",
    texto: "Mira: lo pulso y se abre el formulario.",
    objetivo: ['[data-testid="boton-vender-ahora"]'],
    ruta: "/",
    desplazar: '[data-testid="boton-vender-ahora"]',
    gesto: "toque",
    demo: "vender-toque",
  },
  {
    icono: "create-outline",
    titulo: "Vender mi artículo",
    seccion: "vender",
    texto: "Rellenas tus datos y bajas para ver el resto.",
    objetivo: ["#vender-scroll"],
    ruta: "/vender",
    demo: "formulario",
    compacta: true,
  },
  {
    icono: "arrow-back-circle-outline",
    titulo: "Para salir",
    seccion: "vender",
    texto: "Toca la flecha para volver.",
    objetivo: ['[aria-label="Volver atrás"]'],
    ruta: "/vender",
    gesto: "toque",
    demo: "salir-formulario",
    compacta: true,
  },
  {
    icono: "search-outline",
    titulo: "El buscador",
    seccion: "inicio",
    texto: "Escribe lo que buscas. Prueba con estos.",
    objetivo: ["#buscador-flotante", "#buscador-resultados"],
    ruta: "/",
    arriba: true,
    demo: "buscador",
  },
  {
    icono: "person-outline",
    titulo: "Perfil",
    seccion: "perfil",
    // Con sesión se enseña la pestaña «Mi cuenta» (y en el paso siguiente «Seguimientos»); sin sesión, el acceso.
    texto: (conSesion) => (conSesion ? "«Mi cuenta»: tu sesión iniciada." : "Aquí entras o creas tu cuenta."),
    objetivo: ["#perfil-pestanas", "#perfil-acceso"],
    ruta: "/perfil",
    demo: "perfil-cuenta",
    compacta: true,
  },
  {
    icono: "file-tray-full-outline",
    titulo: "Seguimientos",
    seccion: "perfil",
    texto: "Aquí ves tus reparaciones y pedidos.",
    objetivo: ["#perfil-pestanas"],
    ruta: "/perfil",
    gesto: "toque",
    demo: "perfil-seguimientos",
    soloConSesion: true,
    compacta: true,
  },
  {
    icono: "bag-handle-outline",
    titulo: "Cesta",
    seccion: "cesta",
    texto: "Te reservamos cada artículo 15 minutos.",
    objetivo: [PESTANAS[2]],
    ruta: "/cesta",
    gesto: "toque",
    compacta: true,
  },
  {
    icono: "receipt-outline",
    titulo: "Cómo se compra",
    seccion: "cesta",
    // Verificado en app/checkout.tsx: se elige envío o recogida, no hay pago online y al confirmar se habla por chat
    // o WhatsApp.
    texto: "Reservas, confirmas y te hablamos. Sin pago online.",
    ruta: "/cesta",
    demo: "como-se-compra",
    sinOscurecer: true,
  },
  {
    icono: "chatbubbles-outline",
    titulo: "Foro",
    seccion: "foro",
    texto: "Comunidad, noticias, torneos y chats.",
    objetivo: [PESTANAS[3]],
    ruta: "/chat-global",
    gesto: "toque",
    compacta: true,
  },
  {
    icono: "swap-vertical-outline",
    titulo: "Las pestañas del Foro",
    seccion: "foro",
    texto: "Toca el botón azul y elige una. Mantén pulsada una para moverla.",
    objetivo: ['[data-testid="selector-pestanas"]'],
    ruta: "/chat-global",
    gesto: "toque",
    demo: "foro-pestanas",
    probar: '[data-testid="selector-pestanas"]',
  },
  {
    icono: "chatbox-ellipses-outline",
    titulo: "Reacciona y responde",
    seccion: "foro",
    // chat-global.tsx: un toque en un mensaje abre las reacciones, dos toques seguidos responden (con sesión).
    texto: "Un toque en un mensaje reacciona; dos, responden. Con sesión.",
    ruta: "/chat-global",
    demo: "foro-chat",
    sinOscurecer: true,
  },
  {
    icono: "sparkles-outline",
    titulo: "Blue IA",
    seccion: "blue-ia",
    texto: "Pregúntame lo que quieras.",
    objetivo: [PESTANAS[4]],
    ruta: "/blue-ia",
    gesto: "toque",
    compacta: true,
  },
  {
    icono: "headset-outline",
    titulo: "Hablar con el equipo",
    seccion: "blue-ia",
    // blue-ia.tsx: primero responde Blue IA; «Hablar con el equipo» pide sesión y le manda un resumen al equipo.
    texto: "Primero te ayudo yo. Si quieres, te paso con el equipo (con sesión).",
    objetivo: ['[aria-label="Hablar con el equipo"]'],
    ruta: "/blue-ia",
    gesto: "toque",
    compacta: true,
  },
  {
    icono: "happy-outline",
    titulo: "Este soy yo",
    texto: "Respondo dudas, aviso de lo nuevo y te paso con el equipo.",
    objetivo: [`#${BLUE_DOM_ID}`],
    ruta: "/",
    desplazar: '[data-testid="boton-ver-categorias"]',
    gesto: "toque",
    demo: "capacidades",
  },
  {
    icono: "download-outline",
    titulo: "Instala la tienda",
    texto: "Ábrela con un toque, sin navegador.",
    ruta: "/",
    soloInstalable: true,
    accion: { texto: "Instalar la app", instalar: true },
    sinTitulo: true,
  },
  {
    icono: "construct-outline",
    titulo: "Reparación y limpieza",
    seccion: "servicios",
    texto: "Elige un servicio y te lo explicamos.",
    objetivo: ["#servicios-lista"],
    ruta: "/servicios",
    compacta: true,
    sinOscurecer: true, // la página se ve entera (cargue ya o no sus servicios)
    limiteAlto: 130, // el primer servicio es una tarjeta alta: se enmarca su parte de arriba
  },
  {
    icono: "person-circle-outline",
    titulo: "Tu cuenta",
    texto: "Guarda tus chats, pedidos y avisos.",
    cuenta: true,
    soloSinSesion: true,
    sinTitulo: true,
  },
];

// Mini-guías: qué pantalla tiene guía rápida y cómo se llama en la fila «Guías rápidas» del panel de Blue. Las demás
// (Blog, políticas, chats, pedido…) no la tienen. Blue no se ve en Vender, el Foro ni Blue IA, por eso las guías se
// eligen desde el panel de Blue (en otra pantalla) y no desde la propia pantalla.
function seccionDeGuia(pathname: string): SeccionGuia | null {
  if (pathname === "/") return "inicio";
  if (pathname === "/catalogo") return "catalogo";
  if (pathname.startsWith("/producto/")) return "producto";
  if (pathname === "/vender") return "vender";
  if (pathname === "/perfil") return "perfil";
  if (pathname === "/cesta") return "cesta";
  if (pathname === "/chat-global") return "foro";
  if (pathname === "/blue-ia") return "blue-ia";
  if (pathname === "/servicios") return "servicios";
  return null;
}
const NOMBRE_SECCION_GUIA: Record<SeccionGuia, string> = {
  inicio: "Inicio",
  catalogo: "Catálogo",
  producto: "Artículo",
  vender: "Vender",
  perfil: "Perfil",
  cesta: "Cesta",
  foro: "Foro",
  "blue-ia": "Blue IA",
  servicios: "Servicios",
};

// Dónde está el TÍTULO de cada página, para enmarcarlo en cada paso («Estás aquí»): en las cinco secciones es su
// nombre en la barra de abajo (Foro, Cesta y Blue IA no tienen otro título arriba) y en Vender y Servicios su h1.
const TITULO_DE_PAGINA: Record<string, string[]> = {
  "/": [PESTANAS[0]],
  "/perfil": [PESTANAS[1]],
  "/cesta": [PESTANAS[2]],
  "/chat-global": [PESTANAS[3]],
  "/blue-ia": [PESTANAS[4]],
  "/vender": ["h1"],
  "/servicios": ["h1"],
  "/catalogo": ["h1"],
};
// Las fichas de producto (/producto/<id>) tienen su nombre como h1.
const tituloDePagina = (pathname: string): string[] | null =>
  TITULO_DE_PAGINA[pathname] ?? (pathname.startsWith("/producto/") ? ["h1"] : null);

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

// Rectángulos que oscurecen TODA la pantalla menos los huecos (uno o dos recuadros iluminados): se corta la pantalla en
// franjas horizontales y, en cada una, se tapa lo que no cae dentro de ningún hueco.
function panesOscuros(huecos: Caja[], ancho: number, alto: number): Caja[] {
  const ys = Array.from(
    new Set([0, alto, ...huecos.flatMap((h) => [limitar(h.y, 0, alto), limitar(h.y + h.h, 0, alto)])])
  ).sort((a, b) => a - b);
  const panes: Caja[] = [];
  for (let i = 0; i < ys.length - 1; i++) {
    const y1 = ys[i];
    const y2 = ys[i + 1];
    if (y2 - y1 < 0.5) continue;
    const medio = (y1 + y2) / 2;
    const tramos = huecos
      .filter((h) => h.y <= medio && h.y + h.h >= medio)
      .map((h) => [Math.max(0, h.x), Math.min(ancho, h.x + h.w)] as const)
      .sort((a, b) => a[0] - b[0]);
    let x = 0;
    for (const [a, b] of tramos) {
      if (a > x) panes.push({ x, y: y1, w: a - x, h: y2 - y1 });
      x = Math.max(x, b);
    }
    if (x < ancho) panes.push({ x, y: y1, w: ancho - x, h: y2 - y1 });
  }
  return panes;
}

// Desplaza un elemento con el scrollTo/scrollBy del navegador (solo web). react-native-web cambia el scrollTo de sus
// ScrollView por uno que espera { y, animated } e ignora { top }: el desplazamiento no se hace y no avisa de nada.
function desplazarDom(el: Element, opciones: ScrollToOptions, relativo = false) {
  const metodo = relativo ? Element.prototype.scrollBy : Element.prototype.scrollTo;
  (metodo as (this: Element, o: ScrollToOptions) => void).call(el, opciones);
}

// --- Ayudas visuales de la guía (menos letras, más imagen) -------------------------------------

// Mano que enseña dónde tocar: sube hasta el sitio, lo «pulsa» (se encoge un poco) y de ahí sale un círculo que
// se abre. (x, y) es el punto que se toca.
function ManoToque({ x, y, tamano = 40 }: { x: number; y: number; tamano?: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    t.setValue(0);
    const bucle = Animated.loop(Animated.timing(t, { toValue: 1, duration: 1500, easing: Easing.linear, useNativeDriver: USA_NATIVO }));
    bucle.start();
    return () => bucle.stop();
  }, [t]);
  const sube = t.interpolate({ inputRange: [0, 0.25, 0.7, 1], outputRange: [22, 0, 0, 12] });
  const escala = t.interpolate({ inputRange: [0, 0.3, 0.4, 0.55, 1], outputRange: [1, 1, 0.84, 1, 1] });
  const opacidad = t.interpolate({ inputRange: [0, 0.12, 0.85, 1], outputRange: [0, 1, 1, 0] });
  const circulo = t.interpolate({ inputRange: [0.35, 0.85], outputRange: [0.3, 1.5], extrapolate: "clamp" });
  const brilloCirculo = t.interpolate({ inputRange: [0.35, 0.5, 0.85], outputRange: [0, 0.6, 0], extrapolate: "clamp" });
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: x - 28,
          top: y - 28,
          width: 56,
          height: 56,
          borderRadius: 28,
          borderWidth: 3,
          borderColor: COLORS.accent,
          backgroundColor: "rgba(30,167,232,0.18)",
          opacity: brilloCirculo,
          transform: [{ scale: circulo }],
        }}
      />
      {/* Siempre un ICONO de la app (nunca un emoji): huella táctil blanca en un círculo azul de marca. */}
      <Animated.View
        testID="guia-toque"
        pointerEvents="none"
        style={{
          position: "absolute",
          // La esquina de arriba a la izquierda toca el punto señalado (como la punta de un cursor).
          left: x - 10,
          top: y - 10,
          width: tamano + 6,
          height: tamano + 6,
          borderRadius: (tamano + 6) / 2,
          backgroundColor: COLORS.accent,
          borderWidth: 3,
          borderColor: "#FFFFFF",
          alignItems: "center",
          justifyContent: "center",
          opacity: opacidad,
          transform: [{ translateY: sube }, { scale: escala }],
          shadowColor: "#0B2138",
          shadowOpacity: 0.3,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
        }}
      >
        <Ionicons name="finger-print" size={Math.round(tamano * 0.7)} color="#FFFFFF" />
      </Animated.View>
    </>
  );
}

// Las 5 secciones de la barra de abajo (ids de data-testid="pestana-*" en app/(tabs)/_layout.tsx).
const SECCIONES_GUIA = [
  { id: "index", nombre: "Inicio", ruta: "/", icono: "home-outline" },
  { id: "perfil", nombre: "Perfil", ruta: "/perfil", icono: "person-outline" },
  { id: "cesta", nombre: "Cesta", ruta: "/cesta", icono: "bag-handle-outline" },
  { id: "foro", nombre: "Foro", ruta: "/chat-global", icono: "chatbubbles-outline" },
  { id: "blue-ia", nombre: "Blue IA", ruta: "/blue-ia", icono: "sparkles-outline" },
] as const;

// Caja en pantalla del NOMBRE de cada sección en la barra de abajo (el último texto suelto dentro de su botón).
function medirNombresSecciones(): (Caja | null)[] {
  if (Platform.OS !== "web" || typeof document === "undefined") return SECCIONES_GUIA.map(() => null);
  return SECCIONES_GUIA.map((s) => {
    const boton = document.querySelector(`[data-testid="pestana-${s.id}"]`);
    if (!boton) return null;
    const hoja = Array.from(boton.querySelectorAll("*")).find((n) => n.children.length === 0 && (n.textContent ?? "").trim() === s.nombre);
    const r = (hoja ?? boton).getBoundingClientRect();
    return r.width > 4 && r.height > 4 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
  });
}

// Paso «Las 5 secciones»: los nombres de la barra de abajo se van ESCRIBIENDO uno tras otro con el brillo de Siri
// (una mano toca cada uno), y se repite cada pocos segundos. Si se elige una sección en la tarjeta, solo se
// vuelve a escribir su nombre.
function NombresSeccionesSiri({ pathname, elegida }: { pathname: string; elegida: { i: number; n: number } }) {
  const [cajas, setCajas] = useState<(Caja | null)[]>(() => SECCIONES_GUIA.map(() => null));
  const [escritas, setEscritas] = useState<number[]>(() => SECCIONES_GUIA.map(() => 0));
  const [activa, setActiva] = useState(-1);

  useEffect(() => {
    asegurarCssSiriTexto();
    const medir = () => setCajas(medirNombresSecciones());
    const t0 = setTimeout(medir, 250);
    const t1 = setTimeout(medir, 900);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
    };
  }, [pathname]);

  // Mientras nadie elige nada: se escriben los cinco, se quedan brillando y vuelven a empezar.
  useEffect(() => {
    if (elegida.n > 0) return;
    let cancelado = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const espera = (ms: number) => new Promise<void>((ok) => timers.push(setTimeout(ok, ms)));
    (async () => {
      await espera(600);
      while (!cancelado) {
        setEscritas(SECCIONES_GUIA.map(() => 0));
        for (let i = 0; i < SECCIONES_GUIA.length && !cancelado; i++) {
          setActiva(i);
          for (let k = 1; k <= SECCIONES_GUIA[i].nombre.length && !cancelado; k++) {
            setEscritas((prev) => prev.map((v, j) => (j === i ? k : v)));
            await espera(95);
          }
          await espera(650);
        }
        setActiva(-1);
        await espera(4500);
      }
    })();
    return () => {
      cancelado = true;
      timers.forEach(clearTimeout);
    };
  }, [elegida.n]);

  // Al elegir una sección: todos los nombres a la vista y solo se vuelve a escribir el elegido.
  useEffect(() => {
    if (elegida.n === 0 || elegida.i < 0) return;
    let cancelado = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const espera = (ms: number) => new Promise<void>((ok) => timers.push(setTimeout(ok, ms)));
    (async () => {
      setEscritas(SECCIONES_GUIA.map((s, j) => (j === elegida.i ? 0 : s.nombre.length)));
      setActiva(elegida.i);
      await espera(350);
      for (let k = 1; k <= SECCIONES_GUIA[elegida.i].nombre.length && !cancelado; k++) {
        setEscritas((prev) => prev.map((v, j) => (j === elegida.i ? k : v)));
        await espera(95);
      }
      await espera(500);
      if (!cancelado) setActiva(-1);
    })();
    return () => {
      cancelado = true;
      timers.forEach(clearTimeout);
    };
  }, [elegida]);

  const caja = activa >= 0 ? cajas[activa] : null;
  return (
    <>
      {cajas.map((c, i) =>
        c ? (
          <View
            key={SECCIONES_GUIA[i].id}
            pointerEvents="none"
            // Un parche blanco tapa el nombre de siempre y encima se escribe el nuevo.
            style={{ position: "absolute", left: c.x - 3, top: c.y - 1, width: c.w + 6, height: c.h + 2, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}
          >
            <TextoSiri
              texto={SECCIONES_GUIA[i].nombre.slice(0, escritas[i])}
              cursor={activa === i && escritas[i] < SECCIONES_GUIA[i].nombre.length}
              style={{ fontSize: 11, lineHeight: 13, fontWeight: "800" }}
            />
          </View>
        ) : null
      )}
      {caja ? <ManoToque x={caja.x + caja.w / 2} y={caja.y - 14} tamano={34} /> : null}
    </>
  );
}

// Fila de 5 botones redondos para pasar de una sección a otra sin salir de la guía.
function SelectorSecciones({ activa, ancho, onElegir }: { activa: number; ancho: number; onElegir: (i: number) => void }) {
  const lado = Math.min(50, Math.floor((ancho - 36 - 4 * 8) / 5));
  return (
    <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
      {SECCIONES_GUIA.map((s, i) => (
        <Pressable
          key={s.id}
          onPress={() => onElegir(i)}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`Ir a ${s.nombre}`}
          style={({ pressed }) => ({
            width: lado,
            height: lado,
            borderRadius: lado / 2,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: i === activa ? COLORS.accent : COLORS.accentSoft,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Ionicons name={s.icono} size={Math.round(lado * 0.48)} color={i === activa ? "#FFFFFF" : COLORS.accent} />
        </Pressable>
      ))}
    </View>
  );
}

// Ejemplos que la guía escribe sola en el buscador: el NOMBRE del último artículo añadido y el del más antiguo (se
// leen de la tienda). Si no se pueden leer, se escribe «lo último añadido» y «lo más antiguo», que el buscador entiende.
type EjemploBuscador = { texto: string; etiqueta: string; icono: React.ComponentProps<typeof Ionicons>["name"] };
const EJEMPLOS_POR_DEFECTO: EjemploBuscador[] = [
  { texto: "lo último añadido", etiqueta: "Último añadido", icono: "time-outline" },
  { texto: "lo más antiguo", etiqueta: "Más antiguo", icono: "hourglass-outline" },
];

// Un nombre largo se recorta a unas pocas palabras: buscarlo así encuentra el artículo igual.
function recortarNombre(nombre: string): string {
  const t = nombre.replace(/\s+/g, " ").trim();
  if (t.length <= 40) return t;
  return t.slice(0, 40).replace(/\s+\S*$/, "") || t.slice(0, 40);
}

// Nombre del artículo publicado más reciente (o más antiguo). Vacío si no se puede leer.
async function nombreDeArticulo(masAntiguo: boolean): Promise<string> {
  const { data, error } = await supabase
    .from("products")
    .select("title")
    .eq("is_active", true)
    .eq("status", "PUBLISHED")
    .order("created_at", { ascending: masAntiguo })
    .limit(1);
  if (error || !Array.isArray(data)) return "";
  const t = (data[0] as { title?: unknown } | undefined)?.title;
  return typeof t === "string" ? recortarNombre(t) : "";
}

// Id del artículo publicado más reciente (null si no se puede leer o no hay): la guía enseña con él la ficha.
async function idDeArticuloReciente(): Promise<string | null> {
  const { data, error } = await supabase
    .from("products")
    .select("id")
    .eq("is_active", true)
    .eq("status", "PUBLISHED")
    .order("created_at", { ascending: false })
    .limit(1);
  const id = Array.isArray(data) ? (data[0] as { id?: unknown } | undefined)?.id : null;
  return !error && typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

function EjemplosBuscador({
  ejemplos,
  activo,
  onElegir,
}: {
  ejemplos: EjemploBuscador[];
  activo: number | null;
  onElegir: (i: number | null) => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
      {ejemplos.map((e, i) => (
        <Pressable
          key={e.etiqueta}
          onPress={() => onElegir(activo === i ? null : i)}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`Ejemplo: ${e.etiqueta.toLowerCase()}`}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: 48,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            borderRadius: 999,
            borderWidth: 1.5,
            borderColor: activo === i ? COLORS.accent : COLORS.border,
            backgroundColor: activo === i ? COLORS.accentSoft : COLORS.bg,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Ionicons name={e.icono} size={18} color={COLORS.accent} />
          <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13.5 }}>{e.etiqueta}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// Las pestañas del Foro tal como se llaman en su menú (app/(tabs)/chat-global.tsx).
const PESTANAS_FORO = [
  { nombre: "Foro", corto: "Foro" },
  { nombre: "Noticias Gaming", corto: "Noticias" },
  { nombre: "Nuestras Novedades", corto: "Novedades" },
  { nombre: "Torneos", corto: "Torneos" },
  { nombre: "Chat", corto: "Chat" },
] as const;

// Pulsa de verdad un elemento de la página (la guía tapa la página: no se le puede tocar con el dedo).
function pulsarEnPagina(el: Element | null | undefined) {
  (el as HTMLElement | null | undefined)?.click?.();
}
// Ojo: las pantallas de las pestañas existen DOS veces en el documento (una oculta): siempre se usa la que se ve.
const seVe = (e: Element) => {
  const r = e.getBoundingClientRect();
  return r.width > 4 && r.height > 4;
};
const primeroVisible = (selector: string): Element | null =>
  typeof document === "undefined" ? null : Array.from(document.querySelectorAll(selector)).find(seVe) ?? null;
const botonSelectorForo = () => primeroVisible('[data-testid="selector-pestanas"]');
// El menú del Foro está desplegado cuando se ven sus pestañas.
const menuForoAbierto = () => !!pestanaDelMenuForo("Torneos");
// La pestaña del menú del Foro con ese nombre (no la de la barra de abajo, que también se llama «Foro»).
const pestanaDelMenuForo = (nombre: string) =>
  typeof document === "undefined"
    ? null
    : Array.from(document.querySelectorAll("div")).find(
        (n) =>
          n.children.length === 0 &&
          (n.textContent ?? "").trim() === nombre &&
          // ni la barra de abajo ni los botones de la propia tarjeta de la guía, que se llaman igual
          !n.closest('[data-testid^="pestana-"]') &&
          !n.closest("#guia-tarjeta") &&
          seVe(n)
      );

// Fila de 5 botones con las pestañas del Foro: la activa se ilumina mientras la guía las va enseñando; tocar una la abre.
function ChipsForo({ activa, onElegir }: { activa: number; onElegir: (i: number) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 4, alignSelf: "stretch" }}>
      {PESTANAS_FORO.map((t, i) => (
        <Pressable
          key={t.nombre}
          onPress={() => onElegir(i)}
          accessibilityRole="button"
          accessibilityLabel={`Ver ${t.nombre}`}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: 44,
            borderRadius: 999,
            borderWidth: 1.5,
            borderColor: i === activa ? COLORS.accent : COLORS.border,
            backgroundColor: i === activa ? COLORS.accent : COLORS.bg,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 2,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text numberOfLines={1} style={{ color: i === activa ? "#FFFFFF" : COLORS.text, fontWeight: "900", fontSize: 11.5 }}>
            {t.corto}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

type IconoGuia = React.ComponentProps<typeof Ionicons>["name"];
type ItemIcono = { icono: IconoGuia; texto: string };

// Lo que Blue sabe hacer (de su panel: Blue IA, avisos de artículos nuevos, Vender, el equipo y las noticias).
const CAPACIDADES_BLUE: ItemIcono[] = [
  { icono: "sparkles-outline", texto: "Dudas" },
  { icono: "notifications-outline", texto: "Avisos" },
  { icono: "cash-outline", texto: "Vender" },
  { icono: "people-outline", texto: "Equipo" },
  { icono: "megaphone-outline", texto: "Noticias" },
];
// Los pasos de una compra (app/checkout.tsx): se añade y se reserva, se elige envío o recogida, se confirma el pedido
// (no hay pago online) y la tienda habla con la persona por chat o WhatsApp.
const PASOS_DE_COMPRA: ItemIcono[] = [
  { icono: "bag-add-outline", texto: "Añadir" },
  { icono: "time-outline", texto: "Reserva" },
  { icono: "car-outline", texto: "Entrega" },
  { icono: "checkmark-circle-outline", texto: "Confirma" },
  { icono: "chatbubbles-outline", texto: "Hablamos" },
];
// Gestos de los mensajes del Foro (chat-global.tsx).
const GESTOS_DEL_FORO: ItemIcono[] = [
  { icono: "happy-outline", texto: "1 toque" },
  { icono: "arrow-undo-outline", texto: "2 toques" },
  { icono: "create-outline", texto: "Escribir" },
];

// Fila de iconos con su nombre debajo; se iluminan uno tras otro (más imagen y menos letras).
function FilaIconos({ items }: { items: ItemIcono[] }) {
  const [activa, setActiva] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setActiva((a) => (a + 1) % items.length), 1300);
    return () => clearInterval(t);
  }, [items.length]);
  return (
    <View style={{ flexDirection: "row", gap: 8, justifyContent: "center", alignItems: "flex-start" }}>
      {items.map((c, i) => (
        <View key={c.texto} style={{ width: 56, alignItems: "center", gap: 3 }}>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: i === activa ? COLORS.accent : COLORS.accentSoft,
            }}
          >
            <Ionicons name={c.icono} size={20} color={i === activa ? "#FFFFFF" : COLORS.accent} />
          </View>
          <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 11 }}>{c.texto}</Text>
        </View>
      ))}
    </View>
  );
}

// Altura fija de la tarjeta de la guía: así «Siguiente» está SIEMPRE en el mismo sitio y el pulgar no lo busca.
// La tarjeta GRANDE lleva la mascota o los iconos del paso; la COMPACTA (pasos que enseñan otra página: el formulario,
// Perfil, Servicios…) es 80 px más baja para dejar ver la página. Las dos pegadas abajo: «Siguiente» no se mueve.
const ALTO_TARJETA = 292;
const ALTO_COMPACTA = 212;

// Dónde empieza la tarjeta de la guía cuando no tiene que apartarse (la misma cuenta que hace GuiaBlue más abajo).
const arribaTarjeta = (alto: number) => alto - (Math.round(alto * 0.15) + (Platform.OS === "ios" ? 8 : 0)) - ALTO_TARJETA;

// Cuántos productos de «lo último añadido» caben en el panel del buscador SIN quedar bajo la tarjeta: el panel empieza
// hacia los 78 px, y mide 40 de cabecera, 65 por producto y 45 de «Ver todo el catálogo». Entre 1 y 3.
const filasBuscadorQueCaben = (alto: number) => limitar(Math.floor((arribaTarjeta(alto) - 6 - (78 + 40 + 45)) / 65), 1, 3);

function GuiaBlue({
  onCerrar: cerrarSinMedir,
  onIr,
  onInstalar,
  instalable,
  conSesion,
  onSenalaBlue,
  seccion,
  rutaFija,
}: {
  // volver = true: se cierra sin más (Saltar, «Ahora no», atrás del móvil) y la persona vuelve a la pantalla donde
  // abrió la guía. Con una acción (Crear cuenta, Instalar…) no se vuelve: esa acción lleva a otro sitio.
  onCerrar: (volver?: boolean) => void;
  onIr: (ruta: string) => void;
  onInstalar: () => void;
  // El paso «Instala la tienda» solo sale si se puede instalar en este dispositivo.
  instalable: boolean;
  // Con sesión iniciada: sale «Seguimientos» y no sale «Tu cuenta» (crear cuenta).
  conSesion: boolean;
  // Avisa a Blue de si este paso le señala a él (mientras no, se esconde para no tapar la guía).
  onSenalaBlue: (si: boolean) => void;
  // Mini-guía: solo los pasos de esa pantalla. Si es la pantalla donde ya está la persona, la guía no se mueve de ella
  // (`rutaFija`); si es otra, cada paso la lleva hasta allí. Sin `seccion` es la guía completa.
  seccion?: SeccionGuia;
  rutaFija?: string;
}) {
  const [paso, setPaso] = useState(0);
  // Artículo publicado más reciente: con él se enseña la ficha (undefined = leyéndolo, null = la tienda no tiene).
  const [productoId, setProductoId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    idDeArticuloReciente().then(
      (id) => vivo && setProductoId(id),
      () => vivo && setProductoId(null)
    );
    return () => {
      vivo = false;
    };
  }, []);
  const pasos = React.useMemo(() => {
    const aplicables = PASOS_GUIA.filter(
      (x) =>
        (!x.soloInstalable || instalable) &&
        (!x.soloConSesion || conSesion) &&
        (!x.soloSinSesion || !conSesion) &&
        (!x.soloConProducto || productoId !== null)
    );
    if (!seccion) return aplicables;
    // Mini-guía: solo los pasos de esa pantalla.
    const deLaSeccion = aplicables.filter((x) => x.seccion === seccion);
    if (deLaSeccion.length) return deLaSeccion;
    // Si no queda ninguno (p. ej. la tienda aún no tiene artículos que enseñar) NO se cambia a la guía completa: se enseña
    // el paso de esa pantalla tal cual, sin llevar a ninguna ficha.
    const sinArticulo = PASOS_GUIA.filter((x) => x.seccion === seccion && (!x.soloConSesion || conSesion) && (!x.soloSinSesion || !conSesion));
    return sinArticulo.length ? sinArticulo : aplicables;
  }, [instalable, conSesion, productoId, seccion]);
  const total = pasos.length;
  const p = pasos[Math.min(paso, pasos.length - 1)];
  // Si la lista de pasos cambia a mitad de la guía (p. ej. se quita «Un artículo» porque no hay artículos), la persona
  // sigue en el MISMO paso.
  const pasoObjRef = useRef<PasoGuia>(PASOS_GUIA[0]);
  useEffect(() => {
    const i = pasos.indexOf(pasoObjRef.current);
    if (i >= 0) {
      setPaso((actual) => (actual === i ? actual : i));
    } else {
      const j = Math.min(pasoRef.current, pasos.length - 1);
      pasoObjRef.current = pasos[j];
      setPaso(j);
    }
  }, [pasos]);
  const textoPaso = typeof p.texto === "function" ? p.texto(conSesion) : p.texto;
  // Número del paso SIEMPRE el mismo (con o sin sesión), para que la analítica no mezcle pasos distintos.
  const numeroPaso = (s: PasoGuia) => String(PASOS_GUIA.indexOf(s) + 1).padStart(2, "0");
  // Quien ha visto el paso de «Vender ahora» y luego abre el formulario (en la hora siguiente) cuenta «desde la guía».
  const vioVenderRef = useRef(false);
  useEffect(() => {
    const i = pasos.findIndex((s) => s.demo === "vender-toque");
    if (i >= 0 && paso >= i) vioVenderRef.current = true;
  }, [paso, pasos]);
  useEffect(
    () => () => {
      if (vioVenderRef.current) marcarOrigenVender("guia", 60);
    },
    []
  );

  // Embudo: en qué paso está cada visitante (con su consentimiento de analítica) y cómo
  // termina la guía. Así se ve en el panel dónde se pierde la gente y cuántos llegan al
  // formulario de Vender.
  // (Las mini-guías se miden aparte —miniguia_*— para no mezclarlas con el embudo de la guía completa.)
  const eventoGuia = seccion ? "miniguia" : "guia";
  const rotuloGuia = seccion ? `Mini-guía ${NOMBRE_SECCION_GUIA[seccion]}` : "Guía Blue";
  useEffect(() => {
    trackEvent(`${eventoGuia}_paso`, `${rotuloGuia}: ${numeroPaso(p)} ${p.titulo}`);
    if (paso === total - 1) trackEvent(`${eventoGuia}_completada`, `${rotuloGuia}: completada`);
    // Si la guía ya enseñó el selector de pestañas del Foro, el aviso suelto no vuelve a salir.
    if (p.objetivo?.some((o) => o.includes("selector-pestanas"))) {
      AsyncStorage.setItem(SELECTOR_VISTO_KEY, "1").catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, p.titulo, p.objetivo, total]);
  const pasoActualRef = useRef(0);
  pasoActualRef.current = paso;
  const pathname = usePathname() ?? "";
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  // Para las demostraciones: sección elegida en el paso «Las 5 secciones» y ejemplo elegido en «El buscador».
  const [seccionElegida, setSeccionElegida] = useState<{ i: number; n: number }>({ i: -1, n: 0 });
  const [ejemploElegido, setEjemploElegido] = useState<number | null>(null);
  // Ejemplos del buscador: null = aún se están leyendo los nombres de la tienda.
  const [ejemplos, setEjemplos] = useState<EjemploBuscador[] | null>(null);
  // Pestaña del Foro que se está enseñando y si la persona ha tomado el mando (entonces la guía deja de moverlas).
  const [pestanaForo, setPestanaForo] = useState(0);
  const [foroManual, setForoManual] = useState(false);
  // Dónde apunta el puntero en los pasos de «tocar» cuando no es el centro del recuadro (la pestaña «Seguimientos»).
  const [puntoToque, setPuntoToque] = useState<{ x: number; y: number } | null>(null);
  const [anchoSiguiente, setAnchoSiguiente] = useState(0);
  useEffect(() => {
    setSeccionElegida({ i: -1, n: 0 });
    setEjemploElegido(null);
    setPestanaForo(0);
    setForoManual(false);
    setPuntoToque(null);
  }, [paso]);
  const onCerrar = useCallback(() => {
    const i = pasoActualRef.current;
    if (i < total - 1) {
      trackEvent(`${eventoGuia}_saltada`, `${rotuloGuia}: saltada`);
      trackEvent(`${eventoGuia}_saltada_en`, `${rotuloGuia}: saltada en el paso ${numeroPaso(pasos[i])} ${pasos[i].titulo}`);
    }
    escribirEnBuscadorDemo(null);
    cerrarSinMedir(true);
  }, [cerrarSinMedir, total, pasos, eventoGuia, rotuloGuia]);
  const anim = useRef(new Animated.Value(1)).current;
  const direccion = useRef(1);
  const [caja, setCaja] = useState<Caja | null>(null);
  // Caja del TÍTULO de la página en la que está la guía (se enmarca con «Estás aquí»).
  const [cajaTitulo, setCajaTitulo] = useState<Caja | null>(null);
  const [pantalla, setPantalla] = useState(() => Dimensions.get("window"));

  // La guía te lleva de la mano: en cada paso cambia sola a la pantalla de la que habla
  // (Inicio, Perfil, Cesta, Foro, Blue IA…). Al abrirse en otra pantalla, vuelve a Inicio.
  // («{producto}» es el artículo más reciente; con ?guia=1 la ficha no cuenta la visita.)
  // (La mini-guía de la pantalla donde ya está la persona no cambia de pantalla: se queda donde estaba.)
  const destino = seccion && rutaFija ? rutaFija : (p.ruta ?? "/").replace("{producto}", productoId ?? "");
  useEffect(() => {
    // En cada paso (aunque la pantalla sea la misma que la del paso anterior: en «Las 5 secciones» se puede haber
    // cambiado de sección desde la tarjeta). El pathname no lleva «?guia=1», por eso se compara sin él.
    if (destino.endsWith("/producto/") || destino.includes("/producto/?")) return; // aún no se sabe qué artículo enseñar
    if (pathnameRef.current !== destino.split("?")[0]) router.navigate(destino as Href);
    // solo al cambiar de paso
  }, [destino, paso]);

  useEffect(() => {
    onSenalaBlue(!!p.objetivo?.includes(`#${BLUE_DOM_ID}`));
  }, [p, onSenalaBlue]);

  // Mide el botón del paso (tras un instante, para que la pantalla ya esté pintada) y
  // vuelve a medir si cambia el tamaño de la pantalla.
  useEffect(() => {
    setCaja(null);
    setCajaTitulo(null);
    // Trae a la vista lo que hay que enseñar (desplaza Inicio hasta el botón o la sección).
    const traer = (primera = true) => {
      if (Platform.OS !== "web" || typeof document === "undefined") return;
      // Inicio arriba del todo (cualquier contenedor desplazado vuelve al principio).
      if (p.arriba && primera) {
        for (const el of Array.from(document.querySelectorAll("*"))) {
          if (el.scrollTop > 0) desplazarDom(el, { top: 0, behavior: "smooth" });
        }
      }
      if (!p.desplazar) return;
      const el = Array.from(document.querySelectorAll(p.desplazar)).find((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 4 && r.height > 4;
      });
      if (!el) return;
      // Lo señalado se deja en la parte de ARRIBA de la pantalla (hacia el 22 %): así la tarjeta, que va fija a la
      // altura del pulgar, no lo tapa y «Siguiente» no tiene que cambiar de sitio.
      // (si ya está donde toca, no se vuelve a desplazar: lo señalado puede tardar en aparecer, p. ej. los botones de la
      // ficha mientras carga el artículo, y por eso se reintenta unas veces)
      const faltan = el.getBoundingClientRect().top - window.innerHeight * 0.22;
      if (Math.abs(faltan) < 40) return;
      let contenedor: HTMLElement | null = el.parentElement;
      while (contenedor && !(contenedor.scrollHeight > contenedor.clientHeight + 40 && /(auto|scroll)/.test(getComputedStyle(contenedor).overflowY))) {
        contenedor = contenedor.parentElement;
      }
      if (contenedor) {
        desplazarDom(contenedor, { top: faltan, behavior: "smooth" }, true);
      } else {
        el.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    };
    const t0 = setTimeout(() => traer(true), 200);
    const reintentos = p.desplazar ? [1000, 1900, 2900].map((ms) => setTimeout(() => traer(false), ms)) : [];
    // Sin recuadro ni título que enmarcar (primer paso, instalar, crear cuenta): no hay nada que medir.
    if (!p.objetivo && p.sinTitulo) {
      return () => {
        clearTimeout(t0);
        reintentos.forEach(clearTimeout);
      };
    }
    const selectoresTitulo = p.sinTitulo ? null : tituloDePagina(pathname);
    // (Solo se actualiza lo que de verdad ha cambiado de sitio: así medir a menudo no vuelve a pintar la guía en balde.)
    const cambio = (a: Caja | null, b: Caja | null) =>
      a === b || (!!a && !!b && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.w - b.w) < 1 && Math.abs(a.h - b.h) < 1) ? a : b;
    const medir = () => {
      setPantalla(Dimensions.get("window"));
      const c = medirObjetivo(p.objetivo);
      const nueva = c && p.limiteAlto ? { ...c, h: Math.min(c.h, p.limiteAlto) } : c;
      setCaja((antes) => cambio(antes, nueva));
      const t = selectoresTitulo ? medirObjetivo(selectoresTitulo) : null;
      setCajaTitulo((antes) => cambio(antes, t));
    };
    const t1 = setTimeout(medir, 700);
    const t2 = setTimeout(medir, 1300);
    const t3 = setTimeout(medir, 2000);
    // El buscador enseña resultados que van apareciendo: el hueco iluminado los sigue.
    // Lo mismo donde la página se mueve sola durante el paso (el formulario que baja y sube, las pestañas de Perfil).
    // Y donde la guía desplaza la página hasta lo señalado (la ficha, Inicio): el recuadro sigue a lo que se mueve.
    // En los demás pasos también, más despacio: la página puede acabar de colocarse después de medir (p. ej. el
    // catálogo, que recoloca sus botones al cargar los artículos).
    const vigilar =
      p.demo === "buscador"
        ? setInterval(medir, 400)
        : p.demo === "formulario" || p.demo === "perfil-seguimientos" || p.desplazar
        ? setInterval(medir, 250)
        : setInterval(medir, 500);
    const sub = Dimensions.addEventListener("change", medir);
    return () => {
      clearTimeout(t0);
      reintentos.forEach(clearTimeout);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      if (vigilar) clearInterval(vigilar);
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
      pasoObjRef.current = pasos[destino];
      anim.setValue(0);
      setPaso(destino);
      Animated.timing(anim, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: USA_NATIVO }).start();
    },
    [anim, total, pasos]
  );
  const siguienteRef = useRef(() => irA(pasoRef.current + 1));
  siguienteRef.current = () => irA(pasoRef.current + 1);
  const atrasRef = useRef(() => irA(pasoRef.current - 1));
  atrasRef.current = () => irA(pasoRef.current - 1);

  // --- Demostraciones: la guía hace las cosas para que se vean, en vez de explicarlas con letras ---------------

  // «El buscador»: primero se lee de la tienda el nombre del último artículo añadido y el del más antiguo.
  useEffect(() => {
    if (p.demo !== "buscador") return;
    let vivo = true;
    const lectura = Promise.race([
      Promise.all([nombreDeArticulo(false), nombreDeArticulo(true)]),
      new Promise<[string, string]>((ok) => setTimeout(() => ok(["", ""]), 3000)),
    ]);
    lectura
      .then(([nuevo, viejo]) => {
        if (!vivo) return;
        setEjemplos(
          nuevo && viejo && nuevo !== viejo
            ? [
                { texto: nuevo, etiqueta: "Último añadido", icono: "time-outline" },
                { texto: viejo, etiqueta: "Más antiguo", icono: "hourglass-outline" },
              ]
            : EJEMPLOS_POR_DEFECTO
        );
      })
      .catch(() => {
        if (vivo) setEjemplos(EJEMPLOS_POR_DEFECTO);
      });
    return () => {
      vivo = false;
    };
  }, [p.demo]);

  // …y se escriben solos en el buscador (con el brillo de Siri), dejando ver los resultados de cada uno.
  useEffect(() => {
    if (p.demo !== "buscador" || !ejemplos) return;
    let cancelado = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const espera = (ms: number) => new Promise<void>((ok) => timers.push(setTimeout(ok, ms)));
    const filas = filasBuscadorQueCaben(Dimensions.get("window").height);
    (async () => {
      await espera(900);
      while (!cancelado) {
        const lista = ejemploElegido === null ? ejemplos.map((_, i) => i) : [ejemploElegido];
        for (const i of lista) {
          const texto = ejemplos[i].texto;
          for (let k = 1; k <= texto.length && !cancelado; k++) {
            escribirEnBuscadorDemo(texto.slice(0, k), filas);
            await espera(70);
          }
          await espera(3600); // los resultados, a la vista
          if (cancelado) return;
          escribirEnBuscadorDemo("", filas);
          await espera(600);
        }
      }
    })();
    return () => {
      cancelado = true;
      timers.forEach(clearTimeout);
      escribirEnBuscadorDemo(null);
    };
  }, [p.demo, ejemploElegido, ejemplos]);

  // Perfil con sesión: se pulsa de verdad «Mi cuenta» o «Seguimientos» para que se vea el contenido de cada una.
  useEffect(() => {
    if ((p.demo !== "perfil-cuenta" && p.demo !== "perfil-seguimientos") || Platform.OS !== "web" || typeof document === "undefined") return;
    const nombre = p.demo === "perfil-seguimientos" ? "Seguimientos" : "Mi cuenta";
    // Ojo: la página de Perfil existe dos veces en el documento (una oculta): se coge la pestaña que se ve.
    const pestana = () =>
      Array.from(document.querySelectorAll("#perfil-pestanas *")).find((n) => {
        if (n.children.length !== 0 || (n.textContent ?? "").trim() !== nombre) return false;
        const r = n.getBoundingClientRect();
        return r.width > 4 && r.height > 4;
      });
    const t1 = setTimeout(() => pulsarEnPagina(pestana()), 700);
    // El puntero apunta justo a esa pestaña (no al centro de las dos).
    const t2 = setTimeout(() => {
      const el = pestana();
      if (!el || p.demo !== "perfil-seguimientos") return;
      const r = el.getBoundingClientRect();
      setPuntoToque({ x: r.left + r.width / 2 - 10, y: r.top + r.height / 2 - 6 });
    }, 800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [p.demo]);

  // El Foro: la guía despliega el selector y enseña cada pestaña, una por una (hasta que la persona toma el mando).
  useEffect(() => {
    if (p.demo !== "foro-pestanas" || foroManual || Platform.OS !== "web" || typeof document === "undefined") return;
    let cancelado = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const espera = (ms: number) => new Promise<void>((ok) => timers.push(setTimeout(ok, ms)));
    (async () => {
      await espera(1500);
      while (!cancelado) {
        for (let i = 0; i < PESTANAS_FORO.length && !cancelado; i++) {
          setPestanaForo(i);
          if (!menuForoAbierto()) pulsarEnPagina(botonSelectorForo()); // se despliega el menú (si no lo estaba ya)
          await espera(1200);
          if (cancelado) return;
          pulsarEnPagina(pestanaDelMenuForo(PESTANAS_FORO[i].nombre)); // y se elige la pestaña
          await espera(1900);
        }
        await espera(1200);
      }
    })();
    return () => {
      cancelado = true;
      timers.forEach(clearTimeout);
    };
  }, [p.demo, foroManual]);

  // Tocar una pestaña en la tarjeta (o el botón azul de la página): la guía despliega el menú y abre esa pestaña.
  const elegirPestanaForo = useCallback((i: number) => {
    setForoManual(true);
    setPestanaForo(i);
    if (!menuForoAbierto()) pulsarEnPagina(botonSelectorForo());
    setTimeout(() => pulsarEnPagina(pestanaDelMenuForo(PESTANAS_FORO[i].nombre)), 900);
  }, []);

  // «Reacciona y responde»: la guía abre la pestaña «Foro» (la de los mensajes) para que se vean.
  useEffect(() => {
    if (p.demo !== "foro-chat" || Platform.OS !== "web" || typeof document === "undefined") return;
    const t1 = setTimeout(() => {
      if (!menuForoAbierto()) pulsarEnPagina(botonSelectorForo());
    }, 500);
    const t2 = setTimeout(() => pulsarEnPagina(pestanaDelMenuForo("Foro")), 1500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [p.demo]);

  // «Vender ahora»: la mano pulsa el botón y, tras verlo, la guía pasa sola al formulario (solo yendo hacia delante).
  useEffect(() => {
    if (p.demo !== "vender-toque" || direccion.current !== 1) return;
    const miPaso = pasoRef.current;
    const t = setTimeout(() => {
      if (pasoRef.current === miPaso) siguienteRef.current();
    }, 3000);
    return () => clearTimeout(t);
  }, [p.demo, paso]);

  // El formulario: se desplaza un poco hacia abajo y vuelve, para enseñar que hay más.
  useEffect(() => {
    if (p.demo !== "formulario" || Platform.OS !== "web" || typeof document === "undefined") return;
    let cancelado = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const espera = (ms: number) => new Promise<void>((ok) => timers.push(setTimeout(ok, ms)));
    const ir = (top: number, behavior: ScrollBehavior) => {
      const hoja = document.getElementById("vender-scroll");
      if (hoja) desplazarDom(hoja, { top, behavior });
    };
    (async () => {
      // Primero se ve el título del formulario enmarcado; después baja un poco y vuelve a subir.
      await espera(3000);
      for (let vuelta = 0; vuelta < 2 && !cancelado; vuelta++) {
        ir(360, "smooth");
        await espera(1500);
        ir(0, "smooth");
        await espera(1600);
      }
    })();
    return () => {
      cancelado = true;
      timers.forEach(clearTimeout);
      ir(0, "auto");
    };
  }, [p.demo]);

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

  // Dónde va la tarjeta: un poco MÁS ARRIBA que antes (a la altura del pulgar de la mano derecha, no pegada al borde
  // de abajo) y siempre del mismo tamaño, así «Siguiente» no cambia de sitio. Si lo señalado cae justo en esa franja,
  // la tarjeta se pone encima (o debajo, si encima no cabe) con la flecha entre las dos cosas.
  const altoTarjeta = p.compacta ? ALTO_COMPACTA : ALTO_TARJETA;
  const fondoNormal = Math.round(height * 0.15) + (Platform.OS === "ios" ? 8 : 0);
  const franjaArriba = height - fondoNormal - altoTarjeta;

  // Hueco iluminado alrededor del botón señalado.
  const huecoBruto = caja
    ? {
        x: Math.max(0, caja.x - MARGEN_ARO),
        y: Math.max(0, caja.y - MARGEN_ARO),
        w: Math.min(width, caja.w + MARGEN_ARO * 2),
        h: caja.h + MARGEN_ARO * 2,
      }
    : null;
  // Lo señalado muy alto (limiteAlto: la tarjeta de un servicio): solo se enmarca lo que queda POR ENCIMA de la tarjeta de
  // la guía; si no queda sitio ni para un poco, no se enmarca nada (la página se ve entera con su título enmarcado).
  let hueco = huecoBruto;
  if (huecoBruto && p.limiteAlto) {
    const libre = franjaArriba - 14 - huecoBruto.y;
    hueco = libre >= 48 ? { ...huecoBruto, h: Math.min(huecoBruto.h, libre) } : null;
  }
  // Si lo señalado ocupa casi toda la pantalla (el formulario), no se mueve nada por ello: ni tarjeta ni flecha.
  const enorme = !!hueco && hueco.h > height * 0.45;
  const objetivo = hueco && !enorme ? hueco : null;
  const botonAbajo = !!objetivo && objetivo.y + objetivo.h / 2 > height * 0.5;
  const ESPACIO_FLECHA = 44;
  const estorba = !!objetivo && objetivo.y + objetivo.h > franjaArriba - 6 && objetivo.y < height - fondoNormal;
  let abajoTarjeta = fondoNormal;
  if (objetivo && estorba) {
    const encima = height - objetivo.y + ESPACIO_FLECHA; // «bottom» de la tarjeta puesta justo encima de lo señalado
    const debajoSitio = height - (objetivo.y + objetivo.h + ESPACIO_FLECHA) - altoTarjeta; // «bottom» si va justo debajo
    abajoTarjeta = height - encima - altoTarjeta >= 24 ? encima : debajoSitio >= 8 ? debajoSitio : Math.max(18, encima);
  }

  // Título de la página en la que está la guía, enmarcado con «Estás aquí» (y sin oscurecer, para que se lea). Si ya
  // queda dentro de lo señalado no se repite.
  const tituloHueco: Caja | null =
    cajaTitulo && !p.sinTitulo
      ? { x: Math.max(0, cajaTitulo.x - 5), y: Math.max(0, cajaTitulo.y - 4), w: Math.min(width, cajaTitulo.w + 10), h: cajaTitulo.h + 8 }
      : null;
  const solapan = (a: Caja, b: Caja) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const titulo = tituloHueco && !(objetivo && solapan(tituloHueco, objetivo)) ? tituloHueco : null;
  // Se oscurece todo menos lo señalado (y el título); si lo señalado es toda la pantalla (el formulario) no se oscurece nada.
  const oscurece = !p.sinOscurecer && (!hueco || !enorme);
  const panes = oscurece ? panesOscuros([objetivo, titulo].filter((h): h is Caja => !!h), width, height) : [];
  const flechaX = objetivo ? limitar(objetivo.x + objetivo.w / 2 - 16, 8, width - 40) : 0;
  const flechaY = objetivo ? (botonAbajo ? objetivo.y - 38 : objetivo.y + objetivo.h + 6) : 0;
  const bote = latido.interpolate({ inputRange: [0, 1], outputRange: [0, botonAbajo ? 7 : -7] });
  const escalaAro = latido.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  // «Siguiente»: aro que late, flecha que empuja hacia la derecha.
  const aroSiguiente = latido.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });
  const escalaSiguiente = latido.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] });
  const empujeFlecha = latido.interpolate({ inputRange: [0, 1], outputRange: [0, 6] });
  const seccionActiva = SECCIONES_GUIA.findIndex((s) => (s.ruta === "/" ? pathname === "/" : pathname.startsWith(s.ruta)));
  // Cada sección enseñada con su dedo: la mano toca justo en el centro de lo señalado (excepto en el paso de las 5
  // secciones, donde la mano va de una a otra, y en los que no son un botón).
  // En los botones anchos el puntero se pone hacia la derecha (a las tres cuartas partes y media): así no tapa el nombre.
  const manoEn =
    hueco && p.gesto === "toque"
      ? puntoToque ?? { x: hueco.x + hueco.w * (hueco.w > 160 ? 0.85 : 0.5), y: hueco.y + hueco.h / 2 - 8 }
      : null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCerrar}>
      <View style={{ flex: 1 }}>
        {/* Oscurecido: todo menos lo señalado y el título de la página (los rectángulos que quedan por fuera). */}
        {panes.map((r, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              left: r.x,
              top: r.y,
              // Los que llegan al borde se alargan un poco: así no queda ninguna rendija en el borde de la pantalla.
              width: r.x + r.w >= width - 0.5 ? r.w + 80 : r.w,
              height: r.y + r.h >= height - 0.5 ? r.h + 240 : r.h,
              backgroundColor: FONDO_GUIA,
            }}
          />
        ))}
        {/* Título de la página: recuadro fijo y «Estás aquí» (para que siempre se sepa dónde se está). */}
        {titulo ? (
          <>
            <View
              nativeID="guia-titulo"
              pointerEvents="none"
              style={{
                position: "absolute",
                left: titulo.x,
                top: titulo.y,
                width: titulo.w,
                height: titulo.h,
                borderRadius: 10,
                borderWidth: 2.5,
                borderColor: COLORS.accent,
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: limitar(titulo.x + titulo.w / 2 - 36, 6, width - 78),
                top: Math.max(4, titulo.y - 21),
                paddingHorizontal: 8,
                height: 17,
                borderRadius: 9,
                backgroundColor: COLORS.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 10.5 }}>Estás aquí</Text>
            </View>
          </>
        ) : null}
        {/* Tocar el botón señalado lo pulsa de verdad (la guía tapa la página: sin esto no se podía «probar»). */}
        {p.probar && objetivo ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Probar el botón"
            onPress={() => {
              setForoManual(true);
              pulsarEnPagina(primeroVisible(p.probar as string));
            }}
            style={{ position: "absolute", left: objetivo.x, top: objetivo.y, width: objetivo.w, height: objetivo.h }}
          />
        ) : null}
        {objetivo ? (
          <>
            <Animated.View
              nativeID="guia-aro"
              pointerEvents="none"
              style={{
                position: "absolute",
                left: objetivo.x,
                top: objetivo.y,
                width: objetivo.w,
                height: objetivo.h,
                // Poco redondeado: el hueco iluminado es rectangular y, con más radio, asoman
                // esquinas del fondo blanco de la barra por fuera del aro.
                borderRadius: Math.min(10, objetivo.h / 2),
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
        ) : null}

        {/* Paso «Las 5 secciones»: los nombres de la barra de abajo se escriben con el brillo de Siri. */}
        {p.demo === "secciones" ? <NombresSeccionesSiri pathname={pathname} elegida={seccionElegida} /> : null}
        {/* Mano que toca lo señalado. */}
        {manoEn ? <ManoToque x={manoEn.x} y={manoEn.y} /> : null}

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
          nativeID="guia-tarjeta"
          {...deslizar.panHandlers}
          accessibilityViewIsModal
          style={{
            width: ancho,
            height: altoTarjeta,
            backgroundColor: COLORS.bg,
            borderRadius: 24,
            paddingHorizontal: 18,
            // Arriba cabe «Saltar» (esquina derecha) sin pisar lo de debajo.
            paddingTop: 32,
            paddingBottom: 14,
            // Altura fija y el contenido repartido: «Siguiente» queda SIEMPRE en el mismo sitio.
            justifyContent: "space-between",
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
            // Zona táctil de 44 px REAL (en la web el hitSlop no llega ni a la mitad de lo que declara).
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Saltar la guía"
            style={{ position: "absolute", top: 2, right: 8, zIndex: 2, minHeight: 44, minWidth: 56, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: COLORS.muted, fontWeight: "900", fontSize: 13 }}>Saltar</Text>
          </Pressable>

          {/* Zona visual: según el paso, las secciones para cambiar, los ejemplos del buscador, las pestañas del Foro,
              lo que sabe hacer Blue o Blue. La tarjeta compacta no la lleva (deja ver la página). */}
          {p.cuenta || p.compacta ? null : (
            <View style={{ alignSelf: "stretch", height: 64, alignItems: "center", justifyContent: "center" }}>
              {p.demo === "secciones" ? (
                <SelectorSecciones
                  activa={seccionElegida.i >= 0 ? seccionElegida.i : seccionActiva}
                  ancho={ancho}
                  onElegir={(i) => {
                    setSeccionElegida((a) => ({ i, n: a.n + 1 }));
                    router.navigate(SECCIONES_GUIA[i].ruta as Href);
                  }}
                />
              ) : p.demo === "buscador" ? (
                <EjemplosBuscador ejemplos={ejemplos ?? EJEMPLOS_POR_DEFECTO} activo={ejemploElegido} onElegir={setEjemploElegido} />
              ) : p.demo === "foro-pestanas" ? (
                <ChipsForo activa={pestanaForo} onElegir={elegirPestanaForo} />
              ) : p.demo === "capacidades" ? (
                <FilaIconos items={CAPACIDADES_BLUE} />
              ) : p.demo === "como-se-compra" ? (
                <FilaIconos items={PASOS_DE_COMPRA} />
              ) : p.demo === "foro-chat" ? (
                <FilaIconos items={GESTOS_DEL_FORO} />
              ) : (
                <MarcaAnimada cual="carga" ancho={paso === 0 ? 76 : 56} />
              )}
            </View>
          )}
          <View style={{ alignItems: "center", gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name={p.icono} size={20} color={COLORS.accent} />
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 19, textAlign: "center" }}>{p.titulo}</Text>
            </View>
            <Text style={{ color: COLORS.text, fontSize: 15, lineHeight: 21, textAlign: "center", fontWeight: "600" }}>{textoPaso}</Text>
          </View>

          {p.accion ? (
            <Pressable
              onPress={() => (p.accion?.instalar ? onInstalar() : p.accion?.ruta ? onIr(p.accion.ruta) : undefined)}
              accessibilityRole="button"
              // 44 px de alto REALES (regla del pulgar): en la web el hitSlop no llega ni a la mitad de lo que declara.
              style={{ minHeight: 44, justifyContent: "center" }}
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
              <Pressable onPress={onCerrar} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center" }}>
                <Text style={{ color: COLORS.muted, fontWeight: "800", textAlign: "center" }}>Ahora no, gracias</Text>
              </Pressable>
            </View>
          ) : (
            // Botones grandes abajo; «Siguiente» a la derecha, donde llega el pulgar derecho: más grande, con un
            // aro que late y una flecha que empuja hacia delante (en los dos primeros pasos, además, una mano lo toca).
            <View style={{ alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 10 }}>
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
              <View style={{ flex: 2, minHeight: 60 }} onLayout={(e) => setAnchoSiguiente(Math.round(e.nativeEvent.layout.width))}>
                <Animated.View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: -3,
                    right: -3,
                    top: -3,
                    bottom: -3,
                    borderRadius: 999,
                    borderWidth: 3,
                    borderColor: COLORS.accent,
                    opacity: aroSiguiente,
                    transform: [{ scale: escalaSiguiente }],
                  }}
                />
                <Pressable
                  // En el último paso (sin sesión sale «Tu cuenta», con sesión este) el botón termina la guía.
                  onPress={() => (paso === total - 1 ? onCerrar() : siguienteRef.current())}
                  accessibilityRole="button"
                  accessibilityLabel="Paso siguiente"
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 60,
                    borderRadius: 999,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    backgroundColor: COLORS.accent,
                    opacity: pressed ? 0.88 : 1,
                  })}
                >
                  <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 17 }}>{paso === 0 && !seccion ? "Empezar" : paso === total - 1 ? "Terminar" : "Siguiente"}</Text>
                  <Animated.View style={{ transform: [{ translateX: empujeFlecha }] }}>
                    <Ionicons name="arrow-forward" size={22} color="#FFFFFF" />
                  </Animated.View>
                </Pressable>
                {p.gesto === "siguiente" && anchoSiguiente > 0 ? <ManoToque x={anchoSiguiente * 0.62} y={26} tamano={36} /> : null}
              </View>
            </View>
          )}
        </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

// --- Panel de Blue, pestaña «Noticias y avisos»: filas con icono (más imagen y menos letras) -------------------------

// Círculo con el icono de una fila.
function IconoCirculoBlue({ icono }: { icono: React.ComponentProps<typeof Ionicons>["name"] }) {
  return (
    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.accentSoft, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={icono} size={18} color={COLORS.accent} />
    </View>
  );
}

// Título pequeño de cada apartado de la pestaña («Avisos», «Noticias», «Mis avisos»).
function TituloSeccionBlue({ texto }: { texto: string }) {
  return (
    <Text accessibilityRole="header" style={{ color: COLORS.muted, fontSize: 12, fontWeight: "900", letterSpacing: 0.6, marginTop: 12, marginBottom: 2 }}>
      {texto.toUpperCase()}
    </Text>
  );
}

// Fila que solo informa (no se toca): icono y texto.
function FilaBlue({ icono, titulo, apagada }: { icono: React.ComponentProps<typeof Ionicons>["name"]; titulo: string; apagada?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingVertical: 4 }}>
      <IconoCirculoBlue icono={icono} />
      <Text style={{ color: apagada ? COLORS.muted : COLORS.text, fontWeight: apagada ? "600" : "700", lineHeight: 20, flex: 1 }}>{titulo}</Text>
    </View>
  );
}

// Fila que se toca (≥ 48 px de alto): icono, aviso y una flecha; toda la fila es el botón.
function Aviso({
  icono = "notifications-outline",
  titulo,
  detalle,
  accion,
  onPress,
}: {
  icono?: React.ComponentProps<typeof Ionicons>["name"];
  titulo: string;
  detalle?: string;
  accion: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${titulo}. ${accion}`}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingVertical: 6, opacity: pressed ? 0.7 : 1 })}
    >
      <IconoCirculoBlue icono={icono} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ color: COLORS.text, fontWeight: "800", lineHeight: 20 }}>{titulo}</Text>
        {detalle ? <Text style={{ color: COLORS.muted, fontSize: 12, lineHeight: 16 }}>{detalle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.accent} />
    </Pressable>
  );
}
