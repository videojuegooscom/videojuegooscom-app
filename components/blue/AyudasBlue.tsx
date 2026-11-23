/**
 * Archivo: components/blue/AyudasBlue.tsx
 * Función: ayudas de Blue (el asistente flotante): «Avisarme cuando haya otro», tiempos y medidas, propuestas del día,
 *          dónde se coloca Blue en cada pantalla, qué tiene debajo, a dónde lleva cada aviso y el mensaje de un producto.
 * Para qué sirve: que Blue (components/AsistenteBlue.tsx) y sus partes usen las mismas piezas sin copiarlas. Se separó
 *          de components/AsistenteBlue.tsx en la tanda 6 de «ordenar el proyecto» (2026-11-18), sin cambiar nada.
 * Conectado con: components/blue/DatosBlue.tsx, lib/supabase.ts, components/BarraBusqueda.tsx y la analítica propia.
 * Utilizado por: components/AsistenteBlue.tsx y components/blue/*.
 * Dependencias: react-native.
 * Estado: ACTIVO
 */
import { Dimensions, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";
import { medirEvento } from "../../lib/analiticaPropia";
import { misAvisosReposicion } from "../../lib/interaccion";
import { sinEmojis } from "../../lib/admin/productos.utilidades";
import { palabrasBusqueda } from "../BarraBusqueda";
import { ContenidoConsejo, LIKED_PRODUCTS_KEY, Llegada, MomentoBlue } from "./DatosBlue";

/**
 * «Avisarme cuando haya otro» (dueño, 2026-11-16; avisos_reposicion, lib/interaccion.ts): por cada aviso encendido y aún
 * sin avisar, los artículos a la venta que han entrado (o vuelto) desde que se encendió y son de la misma familia o
 * modelo, con las mismas palabras que la búsqueda tolerante (palabrasBusqueda de BarraBusqueda, GRUPOS_SINONIMOS: «Xbox
 * Series S» = xboxseries + «s»; «PlayStation 5» = ps5). Sin el artículo cancelado. Blue avisa en la app sea cual sea el
 * canal (el correo aún no se manda).
 */
export function encajaReposicion(texto: string, titulo: string): boolean {
  const aviso = palabrasBusqueda(texto);
  const prod = palabrasBusqueda(titulo);
  const claves = aviso.canon.filter((t) => t.length >= 2 || /\d/.test(t));
  if (!claves.length) return false;
  if (!claves.every((t) => prod.set.has(t))) return false;
  // Una letra suelta del modelo («Series S» frente a «Series X») tiene que estar también.
  return aviso.raw.filter((t) => /^[a-z]$/.test(t)).every((t) => prod.raw.includes(t));
}

export async function llegadasReposicion(): Promise<Llegada[]> {
  const avisos = await misAvisosReposicion();
  const pendientes = (avisos ?? []).filter((a) => a.activo && !a.avisado_en).slice(0, 10);
  if (!pendientes.length) return [];
  const desde = new Date(Math.min(...pendientes.map((a) => Date.parse(a.activado_en)))).toISOString();
  const { data, error } = await supabase
    .from("products")
    .select("id,title,price_eur,novedad_en")
    .eq("status", "PUBLISHED")
    .eq("is_active", true)
    .gt("novedad_en", desde)
    .order("novedad_en", { ascending: false })
    .limit(60);
  if (error) return [];
  const prods = (data ?? []) as { id: string; title: string; price_eur: number | string | null; novedad_en: string }[];
  const res: Llegada[] = [];
  for (const a of pendientes) {
    const encajan = prods
      .filter((p) => p.id !== a.product_id && Date.parse(p.novedad_en) > Date.parse(a.activado_en) && encajaReposicion(a.texto, p.title))
      .slice(0, 3)
      .map((p) => ({ id: p.id, title: p.title, price: Number(p.price_eur ?? 0) }));
    if (encajan.length) res.push({ aviso: { id: a.id, texto: a.texto, visto_hasta: a.activado_en }, productos: encajan, reposicion: true });
  }
  return res;
}

// 52 px (antes 72): fijo en la esquina de arriba a la derecha cabe en la cabecera de las fichas y, en Inicio, bajo el
// buscador sin tapar el bloque de Instagram (dueño, 2026-11-04). Sigue siendo más de 44 px para el dedo.
export const BLUE_SIZE = 52;
export const EDGE_INSET = 6;
// Altura de Blue fijo cuando no hay buscador arriba: centrado en la cabecera de las fichas (a la altura de la flecha
// de volver, al otro lado).
const ARRIBA_FIJO = 9;
export const POLL_MS = 45000;
export const PRODUCTO_ESPERA_MS = 8000;
export const SEGUNDO_MENSAJE_MS = 7000;
export const NOTICIA_ESPERA_MS = 12000;
// Mensajes de Blue (petición del dueño, 2026-10-30): ninguno antes de 15 s en la pantalla (primero se lee lo que hay) y
// al menos 15 s entre uno y el siguiente. Los que llegan antes esperan su turno, en orden (cola de «decir»).
export const MENSAJE_TRAS_ENTRAR_MS = 15000;
export const ENTRE_MENSAJES_MS = 15000;
// Blue aparece 10 s después de entrar en la web; el saludo se ve unos segundos.
export const APARECER_MS = 10000;
// Guía de bienvenida: a los 15 s, una sola vez, para quien entra sin cuenta.
export const GUIA_MS = 15000;
export const GUIA_VISTA_KEY = "videojuegoszaragoza:guia_vista";
export const SALUDO_MS = 2800;
// Scroll: píxeles mínimos para ocultar/mostrar (sin parpadeos) y zona de arriba
// en la que siempre se ve.
export const SCROLL_UMBRAL = 12;
export const SCROLL_ARRIBA = 40;
// Blue se esconde al bajar y reaparece cuando la pantalla lleva este tiempo quieta.
export const PARADA_MS = 450;
// Cuánto se desliza hacia su borde al ocultarse.
export const DESLIZ_OCULTO = BLUE_SIZE + EDGE_INSET + 16;
// Animaciones por el hilo nativo salvo en web (allí no existe).
export const USA_NATIVO = Platform.OS !== "web";

// Dónde está Blue: a un lado ("l" izquierda, "r" derecha) y a qué altura (fy: 0 = arriba). Desde 2026-11-04 siempre
// fijo arriba a la derecha (SITIO_FIJO): el mensaje sale debajo de él y crece hacia abajo.
type Lado = "l" | "r";
export type Sitio = { lado: Lado; fy: number };
const esFichaProducto = (pathname: string) => pathname.startsWith("/producto/") || pathname.startsWith("/servicio/");
// Cada cuánto mira si su sitio fijo ha cambiado (en Inicio, bajo el buscador) y cuánto espera tras dejar de
// desplazarse o tras tocar algo.
export const APARTARSE_CADA_MS = 1200;
export const APARTARSE_TRAS_SCROLL_MS = 220;
// id del contenedor de Blue en la web (para no confundirse a sí mismo con el contenido).
export const BLUE_DOM_ID = "blue-flotante";
// El mensaje que sale al lado de Blue (no el saludo, que dura unos segundos): se mide para que
// tampoco tape botones.
export const BLUE_MENSAJE_DOM_ID = "blue-mensaje";

// Mensajes de Blue: al tocarlos llevan a lo que dicen. "chat" abre el chat de la tienda
// (Blue IA primero; desde ahí, el equipo), "ruta" va a esa pantalla, "vender" abre el
// formulario de venta, "panel" abre el panel de Blue.
export type Bocadillo = {
  id: string;
  texto: string;
  accion?: "chat" | "ruta" | "vender" | "panel" | "instalar" | "conocimiento";
  ruta?: string;
  // «conocimiento»: tema de lib/conocimiento.ts que Blue le propone al dueño en el panel.
  tema?: string;
  // Mensaje de Administración (pedidos olvidados, temas de «Lo que Blue sabe»…). Dentro del panel solo salen estos y
  // fuera del panel nunca (filtro central en la cola y al pintarlo: aunque un mensaje de la tienda se quede esperando
  // turno al entrar en el panel, no se ve allí).
  panel?: boolean;
  // Consejo de un primer momento (mejora 12): espera su turno en la misma cola, pero se enseña en su propia tarjeta
  // (ConsejoBlue), también en pantallas sin Blue (la cesta, el catálogo). `trasAccion`: lo pide un toque («Comparar»), así
  // que no espera los 15 s de leer la pantalla (sí los 15 s tras el mensaje anterior).
  consejo?: MomentoBlue;
  trasAccion?: boolean;
  detalle?: ContenidoConsejo;
};

// --- Blue propone información de la tienda (solo el dueño, en el panel de administración) ---
// A lo largo del día (de 9 a 21 h), con huecos de 45 min y hasta 8 veces al día, Blue le propone
// un tema pendiente de «Lo que Blue sabe» (horario, envíos, garantía…). La respuesta la escribe
// el dueño y Blue IA la usa con los clientes. «Ahora no» lo aparca hasta mañana y «No aplica»
// no lo vuelve a proponer.
const PROP_KEY = "videojuegoszaragoza:blue_propuestas";
export const PROP_HUECO_MS = 45 * 60 * 1000;
export const PROP_MAX_DIA = 8;
type EstadoProp = { fecha: string; n: number; ultima: number; hoyNo: string[]; descartados: string[] };
function fechaHoy(): string {
  return new Date().toLocaleDateString("sv");
}
export async function leerEstadoProp(): Promise<EstadoProp> {
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
export async function guardarEstadoProp(e: EstadoProp): Promise<void> {
  try {
    await AsyncStorage.setItem(PROP_KEY, JSON.stringify(e));
  } catch {
    // sin memoria local: se vuelve a proponer, no pasa nada
  }
}

// Lo que ya dijo Blue en esta visita (no se repite al volver a la misma ficha).
export const yaDicho = new Set<string>();

export function limitar(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

// --- Blue fijo arriba a la derecha (dueño, 2026-11-04) -----------------------------------------------------------
// Blue solo sale en Inicio, en las fichas de producto y de servicio y, para el dueño, en el panel; y va FIJO en la
// esquina de arriba a la derecha, donde no estorba: ya no se arrastra ni se aparta solo.
export const SITIO_FIJO: Sitio = { lado: "r", fy: 0 };
export function pantallaConBlue(pathname: string) {
  return pathname === "/" || esFichaProducto(pathname) || pathname.startsWith("/admin");
}
// En Inicio el buscador va arriba: Blue se pone justo debajo (nunca encima de él), también mientras el buscador está
// escondido un momento por el scroll (se mide donde volverá a salir). Si la persona lo ha bajado, Blue va arriba del todo.
// En el móvil, debajo del buscador están TikTok e Instagram junto al logo (components/EnlacesRedesSociales.tsx): si ese sitio cae
// encima de uno, Blue va justo debajo de él. Se mide donde están con la página arriba del todo (sumando lo desplazado),
// para que Blue no se mueva al desplazarla.
const JUNTO_AL_LOGO = ["inicio-instagram", "inicio-tiktok"];
function desplazado(el: Element): number {
  let total = window.scrollY || 0;
  for (let n = el.parentElement; n; n = n.parentElement) total += n.scrollTop || 0;
  return total;
}
// Alto de la franja de la hora del iPhone (--vz-arriba de app/+html.tsx): la tienda empieza debajo y Blue también.
// 0 en el ordenador y fuera de la web.
export function zonaSeguraArriba(): number {
  if (Platform.OS !== "web" || typeof document === "undefined" || !document.body) return 0;
  const sonda = document.createElement("div");
  sonda.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;height:var(--vz-arriba,0px)";
  document.body.appendChild(sonda);
  const alto = sonda.getBoundingClientRect().height;
  sonda.remove();
  return Number.isFinite(alto) ? Math.max(0, Math.round(alto)) : 0;
}
export function posicionFija(enInicio: boolean) {
  const { width } = Dimensions.get("window");
  const x = width - BLUE_SIZE - EDGE_INSET;
  let y = ARRIBA_FIJO;
  if (Platform.OS !== "web" || typeof document === "undefined") return { x, y };
  y += zonaSeguraArriba();
  const barra = barraDelBuscador();
  if (barra && barra.arriba < 160) y = Math.max(y, Math.round(barra.abajo + 4));
  if (!enInicio) return { x, y };
  for (const id of JUNTO_AL_LOGO) {
    const el = document.getElementById(id);
    const r = el?.getBoundingClientRect();
    if (!el || !r?.width || !r.height) continue;
    const d = desplazado(el);
    if (r.left < x + BLUE_SIZE && r.right > x && r.top + d < y + BLUE_SIZE && r.bottom + d > y) y = Math.round(r.bottom + d + 4);
  }
  return { x, y };
}

// Los mensajes de Blue se cierran solos (dueño, 2026-11-04) a los 12 s a la vista: sin contar el tiempo en que Blue está
// escondido (scroll, un botón debajo, el visor de fotos) ni con su panel abierto. Antes se quedaban hasta tocar la X.
export const MENSAJE_VISIBLE_MS = 12000;
// Cómo acaba cada mensaje (tarjeta «Blue flotante» de Analítica): «tocado», «cerrado con la X» o «se cierra solo». Los del
// panel del dueño no cuentan; medirEvento ya respeta a quien rechazó la analítica.
export function contarMensaje(b: Bocadillo, como: "tocado" | "cerrado con la X" | "se cierra solo") {
  if (b.panel) return;
  void medirEvento("blue_mensaje", `Blue: mensaje ${como}`, { metadata: { tipo: b.id.split(":")[0] } });
  // Mejora 5: los avisos de estado del pedido y de bajada de precio tocados (sin datos personales).
  if (como === "tocado" && b.id.startsWith("s:p:")) {
    void medirEvento("pedido_aviso_estado_tocado", "Blue: aviso de estado del pedido tocado", { metadata: { estado: (b.id.split(":")[3] ?? "").split("|")[0] } });
  } else if (como === "tocado" && b.id.startsWith("ap:")) {
    void medirEvento("aviso_precio_tocado", "Blue: bajada de precio tocada", { metadata: { productId: b.id.split(":")[1] } });
  }
}

// Analítica propia (Administración → Analítica, tarjeta «Blue flotante»): en qué pantalla se abre Blue. Solo en la tienda
// (el dueño en el panel no cuenta); medirEvento ya respeta a quien rechazó la analítica.
export function contarBlueAbierto(pathname: string) {
  const donde = pathname === "/" ? "Inicio" : pathname.startsWith("/producto/") ? "la ficha de producto" : pathname.startsWith("/servicio/") ? "la ficha de servicio" : null;
  if (donde) void medirEvento("blue_flotante_abierto", `Blue flotante: abierto en ${donde}`, { metadata: { pantalla: donde } });
}

// Lo que se toca (botones, enlaces, campos y, en react-native-web, lo enfocable con tabindex 0) y que Blue no debe tapar.
const TOCABLES = 'button,a[href],input,textarea,select,[role="button"],[role="link"],[role="tab"],[role="switch"],[role="checkbox"],[tabindex="0"]';
// Blue va fijo: si al desplazar la página queda un botón debajo de su sitio (o la lista de resultados del buscador), en
// vez de taparlo se esconde hasta que quede libre. Se mira en 9 puntos de su sitio qué hay debajo de él.
export function algoDebajoDeBlue(xy: { x: number; y: number }): boolean {
  if (typeof document === "undefined" || typeof document.elementsFromPoint !== "function") return false;
  if (listaEncimaDeBlue(xy)) return true;
  for (const fx of [0.2, 0.5, 0.8]) {
    for (const fy of [0.2, 0.5, 0.8]) {
      const debajo = document.elementsFromPoint(xy.x + BLUE_SIZE * fx, xy.y + BLUE_SIZE * fy).find((e) => !e.closest(`#${BLUE_DOM_ID}`));
      const tocable = debajo?.closest(TOCABLES);
      // (lo que ocupa todo el ancho es un contenedor, no un botón)
      if (tocable && tocable.getBoundingClientRect().width < window.innerWidth * 0.95) return true;
    }
  }
  return false;
}

// --- La barra de búsqueda: Blue nunca encima (solo web) ----------------------------------
// Blue no se pone NUNCA encima de la barra de búsqueda flotante (components/BarraBusqueda.tsx): en Inicio va justo debajo
// (posicionFija), también mientras la barra está escondida un momento por el scroll (vuelve a salir en cuanto se sube).
// Se mide la barra de verdad (el hijo de #buscador-flotante: la capa de fuera ocupa todo el ancho). La lista de
// resultados baja por debajo de la barra: mientras está abierta encima del sitio de Blue, Blue se esconde.
const BUSCADOR_DOM_ID = "buscador-flotante";
const BUSCADOR_RESULTADOS_DOM_ID = "buscador-resultados";
type Borde = { izq: number; arriba: number; der: number; abajo: number };
function barraDelBuscador(): Borde | undefined {
  if (typeof document === "undefined") return undefined;
  const capa = document.getElementById(BUSCADOR_DOM_ID);
  const barra = capa?.firstElementChild?.getBoundingClientRect();
  if (!capa || !barra?.width || !barra.height) return undefined;
  // Escondida por el scroll sube un poco (y se vuelve transparente): se cuenta donde estará al volver a salir.
  let dy = 0;
  try {
    const t = window.getComputedStyle(capa).transform;
    if (t && t !== "none") dy = new DOMMatrixReadOnly(t).m42;
  } catch {
    dy = 0;
  }
  return { izq: barra.left, arriba: barra.top - dy, der: barra.right, abajo: barra.bottom - dy };
}
function listaEncimaDeBlue(xy: { x: number; y: number }): boolean {
  if (typeof document === "undefined") return false;
  const l = document.getElementById(BUSCADOR_RESULTADOS_DOM_ID)?.getBoundingClientRect();
  if (!l?.width || !l.height) return false;
  return l.left < xy.x + BLUE_SIZE && l.right > xy.x && l.top < xy.y + BLUE_SIZE && l.bottom > xy.y;
}

// A dónde lleva un aviso de «Noticias Flash» según lo que dice (lo escribe el dueño).
export function destinoDeAviso(texto: string): Pick<Bocadillo, "accion" | "ruta"> {
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

export async function getLikedProductIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(LIKED_PRODUCTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

// Fecha ISO → milisegundos (0 si falta o no es válida).
export function isoAMs(iso: string | null | undefined): number {
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

export function mensajeProducto(titulo: string, descripcion: string | null): string {
  // (sin los emojis que pueda llevar la descripción: en la tienda no salen; dueño, 2026-11-04)
  const garantia = fraseGarantia(sinEmojis(descripcion));
  if (garantia) {
    if (/^(incluye|tiene|viene|cuenta|lleva|está|esta)\b/i.test(garantia)) {
      return `¿Sabías que ${titulo} ${garantia.charAt(0).toLowerCase()}${garantia.slice(1)}?`;
    }
    return `Sobre ${titulo}: ${garantia}.`;
  }
  return `¿Te gusta ${titulo}? Es unidad única: si la añades a la cesta te la reservamos 15 minutos.`;
}
