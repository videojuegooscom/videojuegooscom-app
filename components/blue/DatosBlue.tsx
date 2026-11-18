/**
 * Archivo: components/blue/DatosBlue.tsx
 * Función: datos de Blue (el asistente flotante): colores, claves guardadas en el dispositivo, avisos de seguimiento
 *          de pedidos y reparaciones, avisos ya dichos, consejos (encendidos o apagados) y «Avísame cuando llegue».
 * Para qué sirve: que Blue (components/AsistenteBlue.tsx) y sus partes usen las mismas piezas sin copiarlas. Se separó
 *          de components/AsistenteBlue.tsx en la tanda 6 de «ordenar el proyecto» (2026-11-18), sin cambiar nada.
 * Conectado con: lib/supabase.ts y el almacenamiento del dispositivo.
 * Utilizado por: components/AsistenteBlue.tsx y components/blue/*.
 * Dependencias: react, react-native.
 * Estado: ACTIVO
 */
import { useEffect, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";
import { medirEvento } from "../../lib/analiticaPropia";

export const COLORS = {
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
export const CRISTAL = {
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
export const TEXTO_CRISTAL = {
  color: "#0B2138",
  ...(Platform.OS === "web" ? ({ textShadow: "0 0 6px rgba(255,255,255,0.9)" } as object) : {}),
};

// El aviso de Blue sobre el selector de pestañas del Foro sale una sola vez por dispositivo
// (también cuenta como visto si se enseñó en la guía).
export const SELECTOR_VISTO_KEY = "videojuegoszaragoza:blue_aviso_selector_visto";
export const LIKED_PRODUCTS_KEY = "videojuegoszaragoza:liked_products";
export const NOVEDADES_SEEN_KEY = "videojuegoszaragoza:novedades_seen_version";
export const NOVEDADES_CONTENT_VERSION = 1;
// Avisos de Noticias Gaming sin sesión ("1" = activados) y fecha ISO de la última
// vez que se vieron las noticias (las escribe app/(tabs)/chat-global.tsx).
export const NOTICIAS_AVISOS_KEY = "videojuegoszaragoza:noticias_avisos";
export const NOTICIAS_VISTAS_KEY = "videojuegoszaragoza:noticias_vistas_hasta";
export const DIA_MS = 24 * 60 * 60 * 1000;
// Ajuste antiguo de avisos de artículos nuevos en el dispositivo ("1" = activados; desde 2026-11-11 solo se lee para
// pasarlo a la cuenta una vez) y hasta cuándo se vieron.
export const NOVEDADES_AVISOS_KEY = "videojuegoszaragoza:novedades_avisos";
export const NOVEDADES_VISTAS_KEY = "videojuegoszaragoza:novedades_vistas_hasta";
// Pantalla a la que volver al entrar con la cuenta (la lee app/(tabs)/perfil.tsx; misma clave que «Comprar ya»).
export const VOLVER_TRAS_ACCESO_KEY = "videojuegoszaragoza:volver_tras_acceso";
// Precio visto de cada producto que gusta o está en la cesta ({ id: precio }).
export const PRECIOS_VISTOS_KEY = "videojuegoszaragoza:precios_vistos";
// Misma clave de la cesta que app/(tabs)/cesta.tsx, app/checkout.tsx y la ficha.
export const CART_KEY = "videojuegoos_cart_v1";

type ProductoAviso = { id: string; title: string; price: number };
export type AvisoBusqueda = { id: string; texto: string; visto_hasta: string };
// reposicion: «Avisarme cuando haya otro» de un pedido cancelado (tabla avisos_reposicion, no avisos_busqueda).
export type Llegada = { aviso: AvisoBusqueda; productos: ProductoAviso[]; reposicion?: boolean };
// seguido: el cliente activó «Avísame si baja de precio» en la ficha (tabla avisos_precio); antes = precio de referencia.
export type Bajada = { id: string; title: string; antes: number; ahora: number; seguido?: boolean };
// Artículo de la cesta con su reserva en marcha (lib/reservas.ts: 15 minutos); `hasta` = fin de la reserva (ms).
export type ReservaAviso = { id: string; title: string; hasta: number };
// Blue avisa de una reserva cuando le quedan 5 minutos o menos.
export const RESERVA_AVISO_MS = 5 * 60 * 1000;
// Cada cuánto se relee la cesta y se actualiza la cuenta atrás (todo en el móvil, sin red).
export const RELOJ_RESERVAS_MS = 15000;
// Minutos que quedan, redondeando hacia arriba (nunca «0 min»).
export const minutosQueQuedan = (ms: number) => Math.max(1, Math.ceil(ms / 60000));

// --- Avisos de estado de pedidos y reparaciones (las etapas que ve el cliente en Perfil → Seguimientos) -------------
// Blue guarda en el móvil, por cuenta, la etapa que la persona ya ha visto de cada pedido y reparación; si la tienda la
// cambia, sale un aviso hasta que la persona abre «Seguimientos» (marcarSeguimientosVistos). La primera vez que se mira
// en un dispositivo solo se apunta lo que hay (no se avisa de lo antiguo).
export type VistosSeg = { p: Record<string, string>; r: Record<string, string> };
export type SegAviso = { clave: string; tipo: "pedido" | "reparacion"; texto: string };
// referencia: el código del pedido que ve el cliente (pedidos.codigo_seguimiento, «VZ-XXXX-XXXX»); el número interno
// (numero) ya no se le enseña (dueño, 2026-11-11: «como una empresa profesional»).
export type PedidoSegDato = { id: string; numero: number | null; referencia?: string | null; estado: string; entrega: string | null };
// porEnvio: reparación por envío (entrega_modo = 'correos'; migración 20261111100000).
export type ReparacionSegDato = { id: string; titulo: string; etapa: string; actualizado: string; porEnvio?: boolean };
const SEG_VISTOS_PREFIJO = "videojuegoszaragoza:seguimientos_vistos:";
export const RELOJ_SEGUIMIENTOS_MS = 120000;

// Solo el admin: un pedido o una reparación en curso sin ningún cambio en 48 h se le recuerda (en el panel de Blue y, una
// vez al día, en un mensaje dentro de Administración), para que ninguno se quede olvidado.
export const OLVIDO_MS = 48 * 60 * 60 * 1000;
export const OLVIDADOS_DICHO_KEY = "videojuegoszaragoza:olvidados_dicho";
export function textoOlvidados(o: { pedidos: number; reparaciones: number }): string {
  const partes = [
    o.pedidos ? (o.pedidos === 1 ? "1 pedido" : `${o.pedidos} pedidos`) : "",
    o.reparaciones ? (o.reparaciones === 1 ? "1 reparación" : `${o.reparaciones} reparaciones`) : "",
  ].filter(Boolean);
  return partes.join(" y ");
}
// Quien escucha cuando el cliente ya ha visto sus seguimientos (Perfil), para quitar el aviso sin volver a pedir nada.
export const oyentesSeguimientos = new Set<() => void>();

// La «etapa» de un pedido lleva «|devuelto» si se le devolvió el pago con tarjeta (dueño, 2026-11-06): así una devolución
// también es una novedad, aunque la etapa no cambie.
export function firmaPedidoSeg(estado: string | null | undefined, devueltoEn: string | null | undefined): string {
  return `${estado ?? "pendiente"}${devueltoEn ? "|devuelto" : ""}`;
}

function avisoPedido(p: PedidoSegDato): string | null {
  // «tu pedido VZ-AB2C-D3EF»; sin la referencia, «tu pedido» a secas (nunca el número interno).
  const n = p.referencia ? ` ${p.referencia}` : "";
  const [estado, devuelto] = p.estado.split("|");
  if (devuelto) {
    return estado === "cancelado"
      ? `Tu pedido${n} se ha cancelado y te hemos devuelto el pago`
      : `Te hemos devuelto el pago de tu pedido${n}`;
  }
  switch (estado) {
    case "confirmado":
      return `Tu pedido${n} está confirmado`;
    case "preparado":
      return `Estamos preparando tu pedido${n}`;
    case "enviado":
      return p.entrega === "recogida" ? `Tu pedido${n} está listo para recoger` : `Tu pedido${n} está enviado`;
    case "entregado":
      return `Tu pedido${n} está entregado`;
    case "cancelado":
      return `Tu pedido${n} se ha cancelado`;
    default:
      return null; // «pendiente»: es como queda al pedirlo, no es una novedad
  }
}

function avisoReparacion(r: ReparacionSegDato, soloNota: boolean): string | null {
  const t = `«${r.titulo}»`;
  if (soloNota) return `El taller ha dejado una nota sobre tu ${t}`;
  switch (r.etapa) {
    // Reparación por envío (migración 20261111100000).
    case "etiqueta":
      return `La etiqueta de Correos de tu ${t} está lista: descárgala en «Mis seguimientos»`;
    case "en_camino":
      return `Tu ${t} va de camino a nuestro taller`;
    case "presupuesto":
      return `Tienes el presupuesto de tu ${t}: acéptalo en «Mis seguimientos»`;
    case "esperando_pieza":
      return `Estamos esperando una pieza para tu ${t}`;
    case "enviada":
      return `Te hemos enviado de vuelta tu ${t}`;
    case "recibido":
      return `Hemos recibido tu ${t}`;
    case "diagnostico":
      return `Estamos diagnosticando tu ${t}`;
    case "reparando":
      return `Tu ${t} está en reparación`;
    case "listo":
      return r.porEnvio ? `Tu ${t} está lista: te la enviamos pronto` : `Tu ${t} está lista para recoger`;
    case "entregado":
      // Se pide la valoración: el aviso lleva a «Mis seguimientos», donde está «Valorar el servicio».
      return `Tu ${t} está entregada. ¿Nos cuentas qué tal? Valórala en «Mis seguimientos»`;
    case "cancelado":
      return `Tu solicitud de ${t} se ha cancelado`;
    default:
      return null; // «solicitado»: es como queda al pedirla
  }
}

// Qué ha cambiado respecto a lo que la persona ya vio. `adoptar` = lo nuevo que no es novedad (un pedido o una reparación
// recién creados) y que se da por visto para no volver a mirarlo.
export function calcularSegAvisos(
  pedidos: PedidoSegDato[],
  reparaciones: ReparacionSegDato[],
  vistos: VistosSeg
): { avisos: SegAviso[]; adoptar: VistosSeg } {
  const avisos: SegAviso[] = [];
  const adoptar: VistosSeg = { p: {}, r: {} };
  for (const p of pedidos) {
    const antes = vistos.p[p.id];
    if (antes === p.estado) continue;
    const texto = avisoPedido(p);
    if (antes === undefined && !texto) {
      adoptar.p[p.id] = p.estado;
      continue;
    }
    if (texto) avisos.push({ clave: `p:${p.id}:${p.estado}`, tipo: "pedido", texto });
  }
  for (const r of reparaciones) {
    const firma = `${r.etapa}|${r.actualizado}`;
    const antes = vistos.r[r.id];
    if (antes === firma) continue;
    const etapaAntes = antes?.split("|")[0];
    const soloNota = antes !== undefined && etapaAntes === r.etapa;
    const texto = avisoReparacion(r, soloNota);
    if (antes === undefined && !texto) {
      adoptar.r[r.id] = firma;
      continue;
    }
    if (texto) avisos.push({ clave: `r:${r.id}:${firma}`, tipo: "reparacion", texto });
  }
  return { avisos, adoptar };
}

export async function leerVistosSeg(uid: string): Promise<VistosSeg | null> {
  try {
    const raw = await AsyncStorage.getItem(SEG_VISTOS_PREFIJO + uid);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<VistosSeg>;
    return { p: v.p && typeof v.p === "object" ? v.p : {}, r: v.r && typeof v.r === "object" ? v.r : {} };
  } catch {
    return null;
  }
}

export async function guardarVistosSeg(uid: string, v: VistosSeg): Promise<void> {
  try {
    await AsyncStorage.setItem(SEG_VISTOS_PREFIJO + uid, JSON.stringify(v));
  } catch {
    // sin memoria local: el aviso saldrá otra vez, no pasa nada
  }
}

// Perfil → Seguimientos llama aquí con lo que acaba de enseñar: eso ya está visto y se quitan los avisos.
export async function marcarSeguimientosVistos(
  uid: string,
  pedidos: { id: string; estado: string }[],
  reparaciones: { id: string; etapa: string; actualizado: string }[]
): Promise<void> {
  const vistos: VistosSeg = { p: {}, r: {} };
  for (const p of pedidos) vistos.p[p.id] = p.estado;
  for (const r of reparaciones) vistos.r[r.id] = `${r.etapa}|${r.actualizado}`;
  await guardarVistosSeg(uid, vistos);
  oyentesSeguimientos.forEach((f) => f());
}

// --- Lo que Blue ya dijo en este dispositivo (mejora 5, 2026-11-14) ---------------------------------------------------
// El aviso de un cambio de estado de un pedido y el de una bajada de precio seguida salen UNA vez por cambio, también
// entre visitas: se guarda en el móvil la clave de cada uno cuando se enseña (como mucho las 200 últimas).
const DICHOS_KEY = "videojuegoszaragoza:blue_avisos_dichos";
// Pedidos entregados cuya valoración ya está resuelta en esta visita (valorados o ya pedidos por Blue): no se vuelven a
// consultar en cada repaso de los seguimientos.
export const valorarResueltos = new Set<string>();
// Y los entregados hace menos de 3 días: desde cuándo se pueden pedir (hasta entonces, ni se consultan).
export const valorarDesde = new Map<string, number>();
let dichosGuardados: Set<string> | null = null;
export async function cargarDichos(): Promise<Set<string>> {
  if (dichosGuardados) return dichosGuardados;
  const lista = await leerJsonLocal<unknown>(DICHOS_KEY, []);
  dichosGuardados = new Set(Array.isArray(lista) ? lista.filter((x): x is string => typeof x === "string") : []);
  return dichosGuardados;
}
export async function apuntarDicho(clave: string): Promise<void> {
  const s = await cargarDichos();
  if (s.has(clave)) return;
  s.add(clave);
  try {
    await AsyncStorage.setItem(DICHOS_KEY, JSON.stringify([...s].slice(-200)));
  } catch {
    // sin memoria local: puede repetirse en otra visita, no pasa nada
  }
}

// --- Blue en momentos clave (mejora 12, 2026-11-15) -----------------------------------------------------------------
// Consejos de los primeros momentos: la primera vez en la cesta con artículos (la primera compra en 3 pasos, con «Ir a
// pagar»), en el catálogo, en una ficha, al tocar «Comparar» por primera vez y tras crear la cuenta. Cada uno UNA vez por
// dispositivo (queda dicho al enseñarse: «consejo:<momento>» en DICHOS_KEY), nunca con la guía abierta ni dos a la vez:
// esperan su turno en la cola de «decir», como los demás mensajes. «No volver a mostrar consejos» (en el propio consejo y
// en «Mis avisos» del panel de Blue) los apaga todos en el dispositivo (CONSEJOS_OFF_KEY); los avisos importantes
// (pedidos, precio, valoración) siguen. Se miden consejo_mostrado / _seguido / _cerrado (solo el momento) y
// consejos_desactivados en Administración → Analítica («Consejos de Blue»). Se prueba con la sección MOMB de
// pruebas/perfil-datos.mjs.
export type MomentoBlue = "cesta" | "catalogo" | "ficha" | "comparar" | "cuenta";
const CONSEJOS_OFF_KEY = "videojuegoszaragoza:blue_consejos_off";
// Una cuenta es nueva si se creó hace menos de un día (user.created_at de Supabase Auth): así se reconoce su primer inicio.
export const CUENTA_NUEVA_MS = 24 * 60 * 60 * 1000;
// Lo que el consejo se deja a la vista antes de cerrarse solo (más que un mensaje: la cesta trae 3 pasos y dos botones).
export const CONSEJO_VISIBLE_MS = 20000;
let consejosApagados: boolean | null = null;
const oyentesConsejos = new Set<() => void>();
function avisarConsejos() {
  for (const f of [...oyentesConsejos]) f();
}
function suscribirConsejos(f: () => void) {
  oyentesConsejos.add(f);
  return () => {
    oyentesConsejos.delete(f);
  };
}
export async function leerConsejosApagados(): Promise<boolean> {
  if (consejosApagados === null) {
    try {
      consejosApagados = (await AsyncStorage.getItem(CONSEJOS_OFF_KEY)) === "1";
    } catch {
      consejosApagados = false;
    }
    avisarConsejos();
  }
  return consejosApagados;
}
export function useConsejosApagados(): boolean {
  const apagados = useSyncExternalStore(suscribirConsejos, () => consejosApagados === true, () => false);
  useEffect(() => {
    void leerConsejosApagados();
  }, []);
  return apagados;
}
export function cambiarConsejos(apagar: boolean, desde: "consejo" | "panel") {
  consejosApagados = apagar;
  avisarConsejos();
  if (apagar) AsyncStorage.setItem(CONSEJOS_OFF_KEY, "1").catch(() => {});
  else AsyncStorage.removeItem(CONSEJOS_OFF_KEY).catch(() => {});
  if (apagar) void medirEvento("consejos_desactivados", "Blue: consejos desactivados", { metadata: { desde } });
}

export type ContenidoConsejo = { titulo: string; texto?: string; pasos?: string[]; accion?: { texto: string; ruta: string } };
export function contenidoConsejo(m: MomentoBlue, pago: PagoOnlineGuia | null): ContenidoConsejo {
  if (m === "cesta") {
    // Las formas de pago, solo si el servidor ofrece el pago online (GET /api/pago, como el checkout: Apple Pay y Google
    // Pay van con la tarjeta en la página de Stripe). Si no se sabe, no se promete ninguna.
    const pagar = pago?.disponible ? "Paga seguro (tarjeta, Apple Pay o Google Pay)" : "Confirma y paga tu pedido";
    return { titulo: "Tu compra en 3 pasos", pasos: ["Revisa tu cesta", "Tus datos de entrega", pagar], accion: { texto: "Ir a pagar", ruta: "/checkout" } };
  }
  if (m === "catalogo") return { titulo: "Encuentra lo tuyo", texto: "Con el icono de filtros eliges precio y estado. O busca: prueba «play 5»." };
  if (m === "ficha") return { titulo: "Antes de decidirte", texto: "Puedes ampliar las fotos, ver cuándo te llega y preguntarnos por este artículo." };
  if (m === "comparar") return { titulo: "Comparar", texto: "Elige hasta 3 y pulsa «Comparar» abajo." };
  return {
    titulo: "¡Ya tienes cuenta!",
    texto: "Te avisamos si baja de precio lo que sigues, ves el seguimiento de tu pedido y lo tienes todo en Mis pedidos.",
    accion: { texto: "Ver Mis pedidos", ruta: "/perfil?tab=seguimientos" },
  };
}
// Dónde tiene sentido cada consejo (la cola se vacía al cambiar de pantalla; «cuenta», en cualquiera de la tienda).
export function momentoEnPantalla(m: MomentoBlue, pathname: string): boolean {
  if (m === "cesta") return pathname.startsWith("/cesta");
  if (m === "catalogo") return pathname.startsWith("/catalogo");
  if (m === "ficha") return pathname.startsWith("/producto/");
  if (m === "comparar") return pathname.startsWith("/catalogo") || pathname.startsWith("/producto/");
  return !/^\/(admin|checkout|blue-ia|chat|vender|perfil)/.test(pathname);
}
// Formas de pago online que ofrece el servidor (GET /api/pago, la misma consulta que el checkout). null = no se sabe.
export async function consultarPagoOnline(): Promise<PagoOnlineGuia | null> {
  if (Platform.OS !== "web") return null;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const r = await fetch("/api/pago", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const d = (await r.json().catch(() => null)) as { ok?: boolean; disponible?: boolean; klarna?: boolean; bizum?: boolean } | null;
    return r.ok && d?.ok ? { disponible: d.disponible === true, klarna: d.klarna === true, bizum: d.bizum === true } : null;
  } catch {
    return null;
  }
}
// Lo que un consejo nunca tapa: «Comprar ya» / «Añadir a la cesta», «Ir a pagar», la barra de comparar y su «Comparar»,
// el «Volver» flotante, el buscador de Inicio y las pestañas.
const NO_TAPAR = [
  "#ficha-comprar-ya",
  "#ficha-anadir-cesta",
  // (el botón «Ir a pagar» entero, como BOTON_IR_A_PAGAR de la guía)
  "div:has(> #cesta-pagar)",
  "#comparar-barra",
  "#boton-atras-flotante",
  '[aria-label="Volver atrás"]',
  "#buscador-flotante > *",
  '[data-testid^="pestana-"]',
  "#blue-flotante",
];
// Sitio del consejo (solo web): abajo (sobre las pestañas, la barra de comparar y el «Volver» flotante) o, si ahí tapa algo
// de NO_TAPAR, arriba bajo la cabecera; si tapa en los dos, se esconde hasta que quede libre (como Blue).
export function sitioConsejo(alto: number): { top: number } | null {
  if (typeof document === "undefined" || typeof window === "undefined") return { top: 80 };
  const vh = window.innerHeight;
  const cajas: DOMRect[] = [];
  for (const sel of NO_TAPAR) {
    try {
      document.querySelectorAll(sel).forEach((e) => {
        const r = e.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh) cajas.push(r);
      });
    } catch {
      // selector no admitido por el navegador (:has): se ignora
    }
  }
  // Abajo: por encima de lo fijo de la parte de abajo (pestañas, barra de comparar, «Volver» flotante).
  let suelo = vh - 12;
  for (const r of cajas) if (r.top > vh * 0.6) suelo = Math.min(suelo, r.top - 10);
  const cruza = (top: number) => cajas.some((r) => r.left < window.innerWidth && r.right > 0 && r.top < top + alto && r.bottom > top);
  const abajo = Math.round(suelo - alto);
  if (abajo > 70 && !cruza(abajo)) return { top: abajo };
  // Arriba: bajo la cabecera (y bajo lo fijo de arriba que no se debe tapar).
  let techo = 72;
  for (const r of cajas) if (r.bottom < vh * 0.3) techo = Math.max(techo, r.bottom + 8);
  if (techo + alto < vh - 12 && !cruza(techo)) return { top: Math.round(techo) };
  return null;
}

// Quien escucha cambios de «Avísame cuando llegue» (el catálogo crea avisos y Blue los relee).
export const oyentesAvisos = new Set<() => void>();

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

export async function leerJsonLocal<T>(clave: string, porDefecto: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(clave);
    return raw ? (JSON.parse(raw) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
}

// Formas de pago online que ofrece el servidor (GET /api/pago, como el checkout). null = no se sabe: no se promete ninguna.
export type PagoOnlineGuia = { disponible: boolean; klarna: boolean; bizum: boolean };
