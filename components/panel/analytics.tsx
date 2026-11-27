/**
 * Archivo: components/panel/analytics.tsx (antes app/admin/analytics.tsx, que ahora solo la descarga al abrirla)
 * Función: pantalla de administración «Visitas y métricas» (analítica propia), en la dirección /admin/analytics.
 * Para qué sirve: el administrador mide visitas, recorrido del cliente, búsquedas, pagos, reparaciones, alquiler y el uso de cada función nueva de la tienda, solo con datos agregados y respetando a quien rechazó la analítica.
 * Conectado con: lib/supabase.ts (tabla analytics_events y funciones SQL analytics_*), lib/envio.ts, lib/alquiler.ts, constants/temaTienda.ts, components/marca/CargaMarca.tsx, lib/admin/productos.componentes.tsx, components/admin/PiezasPanelAdmin.tsx; los eventos los escribe lib/analiticaPropia.ts desde casi todas las pantallas.
 * Utilizado por: Expo Router (dirección /admin/analytics, protegida por app/admin/_layout.tsx); la enlaza la tarjeta «Visitas y métricas» de app/admin/index.tsx.
 * Dependencias: react, react-native.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: panel de métricas de visitas del panel de administración. Muestra
 * cuántas personas visitan la tienda, el recorrido que hacen (Inicio →
 * Categoría → Producto → Reseñas, con "Scroll" como señal de enganche
 * aparte), un calendario de crecimiento (visitantes por día) filtrable por
 * fechas, y un ranking de las categorías y productos más vistos.
 * Bloque «Alquiler» (fase 2 del alquiler, 2026-11-17): unidades, ocupación, ingresos del mes, fianzas retenidas y
 * renovaciones, solo números (lib/alquiler.ts y app/admin/alquileres.tsx; sección ALQ2 de pruebas/perfil-datos.mjs).
 *
 * Cómo funciona:
 * - Todo sale de la tabla analytics_events (que rellena lib/analiticaPropia.ts
 *   desde Inicio, Catálogo y la ficha de producto) a través de 4 funciones
 *   SQL ya creadas en Supabase: analytics_totals, analytics_daily_visitors,
 *   analytics_funnel y (no usada aquí directamente) analytics_top_metadata.
 *   Las cuatro son SECURITY INVOKER, así que si algún día alguien sin rol
 *   admin llamara a esta pantalla por error, simplemente no vería datos (la
 *   RLS de analytics_events ya exige is_admin() para el SELECT).
 * - Rango de fechas: chips rápidos (Hoy/7 días/30 días/90 días/Todo) o un
 *   rango a medida escribiendo dos fechas (AAAA-MM-DD). Por defecto, últimos
 *   30 días. Tamaños (grupo 2 de la auditoría móvil, 2026-11-12): los dos
 *   campos de fecha y «Aplicar» miden 48 px (CAMPO) y los chips 44 (TACTIL),
 *   con letra de 13 como mínimo (constants/temaTienda.ts). Las fechas se tratan como días completos en hora de España
 *   (Europe/Madrid, de 00:00 a 00:00 del día siguiente, con horario de
 *   verano). Ojo: la agrupación por día de "Crecimiento de visitantes" la
 *   hace la función SQL analytics_daily_visitors en la zona del servidor.
 * - "Conversiones por día": lee directamente analytics_events (RLS exige
 *   is_admin()) los eventos add_to_cart, buy_now, begin_checkout,
 *   order_whatsapp, pago_tarjeta (se abre la página de pago de Stripe) y
 *   pago_tarjeta_ok (pago confirmado) del rango y los cuenta por día de
 *   Madrid en el cliente.
 * - "Recorrido principal": agrupa analytics_funnel por prefijo de
 *   step_label ("Categoría ..." → Categoría, "Producto ..." → Producto) para
 *   armar un embudo de 4 pasos (Inicio, Categoría, Producto, Reseñas), con el
 *   % de caída respecto a Inicio en cada paso. "Scroll" se muestra aparte,
 *   como señal de cuánta gente se queda mirando contenido, no como un paso
 *   del embudo (puede pasar en cualquier punto del recorrido).
 * - "Categorías más vistas" / "Productos más vistos": mismos datos de
 *   analytics_funnel, filtrando los step_label que empiezan por "Categoría "
 *   o "Producto " (con nombre concreto detrás), ordenados por sesiones.
 * - «Clientes conectados en los últimos 7 días» y «con la app instalada» (2026-11-12, #analitica-conectados): dos
 *   recuentos de personas distintas de la tabla cliente_dispositivos (sin el administrador ni datos de nadie); sin la
 *   migración 20261112120000 no sale.
 * - «Teléfono en Mi perfil» (2026-11-13, #analitica-telefono-perfil): cuántos perfiles tienen teléfono (solo el número, sin
 *   el administrador ni ningún teléfono) y los eventos propios «Perfil: teléfono guardado» y «Pago: teléfono del perfil
 *   usado» (sesiones); sin la columna (migración 20261113120000) pone «sin datos».
 * - Vercel: este proyecto no tiene activado Vercel Web Analytics (se
 *   comprobó con el MCP de Vercel), así que estos datos son 100% propios,
 *   con el detalle de recorrido que Vercel no podría dar aunque estuviera
 *   activado (sus páginas vistas no distinguen "Categoría PS5" de
 *   "Categoría Xbox", por ejemplo — para Vercel ambas son la misma URL
 *   /catalogo). Se explica brevemente al final de la pantalla.
 *
 * Conectado con:
 * - lib/supabase.ts → cliente para llamar a las funciones RPC.
 * - lib/analiticaPropia.ts → quien registra los eventos que esta pantalla resume.
 * - app/noticias/[id].tsx, app/noticias/index.tsx → «Noticias: visitas desde Google»
 *   (#analitica-noticias-organicas): páginas vistas por categoría y entradas desde buscadores.
 * - app/(tabs)/blue-ia.tsx → «Blue: ver mis facturas» y «Blue: factura descargada» (#analitica-facturas, 2026-11-11).
 * - app/(tabs)/perfil.tsx → «Pedidos: factura descargada» (#analitica-facturas): facturas de VeoAura
 *   descargadas desde «Mis pedidos» (api/factura.ts).
 * - Reparación por envío (#analitica-reparacion-envio, migración 20261111100000): el embudo contado en
 *   service_requests (solicitadas → etiqueta pagada → recibidas → presupuesto aceptado, solo números) y
 *   las sesiones de components/ContratarServicioModal.tsx y app/(tabs)/perfil.tsx. Parte 2 (migración
 *   20261111130000, si los ajustes ya traen garantia_meses): el embudo sigue con pagadas → enviadas, más «sin
 *   arreglo: compradas / devueltas» y «garantías abiertas» (recuentos, sin datos de nadie), y las sesiones de
 *   pago con tarjeta, avisos de pago, «Te lo compramos», «Devuélvemelo» y garantías pedidas.
 * - api/pago.ts → «Pagos online por forma de pago» (#analitica-pago-metodos, migración 20261111150000, Bizum de
 *   Stripe 2026-11-11): cuántos pedidos y cuántas reparaciones/etiquetas se pagaron con tarjeta, Bizum o Klarna según
 *   Stripe (recuentos de pedidos.pago_metodo y service_requests.pago_metodo / etiqueta_pago_metodo, solo números,
 *   sin datos de nadie). Sin la migración, no sale.
 * - api/escaparate-veoaura.ts (evento «venta_tienda») → «Ventas en tienda frente a online» (#analitica-ventas-tienda,
 *   migración 20261111170000, dueño 2026-11-11): cuántos pedidos y qué importe en tienda (en mano, de VeoAura) y online,
 *   sin cancelados; solo lee origen, estado y total (ningún dato de nadie). Sin la migración, no sale.
 * - components/AsistenteBlue.tsx → «Avisos de Blue solo con cuenta» (#analitica-blue-avisos-cuenta): cuentas con los
 *   avisos de artículos nuevos (recuento de preferencias_usuario, sin filas ni la del administrador), toques en
 *   «Crear cuenta gratis» y cuentas creadas después (lib/analiticaPropia.ts → marcarOrigenRegistro).
 * - Tamaños del móvil (grupo 4, 2026-11-12; constants/temaTienda.ts): ningún texto de menos de 13 px y grises desde
 *   COLORES_TEXTO.secundario (antes 12/12,5 px y gris 0,48), sin tocar los gráficos ni los datos.
 * - «Búsquedas (30 días)» (#analitica-busquedas, mejora 3 del 2026-11-14): lee los eventos busqueda,
 *   busqueda_sin_resultados, busqueda_sugerencia_tocada y catalogo_filtro de components/BarraBusqueda.tsx y
 *   app/catalogo.tsx (siempre 30 días): lo más buscado, lo que no dio resultados (lo que piden y no hay), sinónimos y
 *   correcciones usados, sugerencias tocadas y el uso de los filtros de precio y estado. Texto normalizado, sin datos.
 * - «Ficha del producto (30 días)» (#analitica-ficha-producto, mejora 4 «Ficha de confianza» del 2026-11-14): eventos
 *   ficha_foto_zoom (visor abierto, con zoom, cerrado deslizando) y ficha_entrega_estimada (por tipo: mismo día, resto de
 *   España, islas y sin código postal; nunca el código) de app/producto/[id].tsx, y el recuento de productos revisados y con
 *   garantía (migración 20261114140000; sin ella, esa línea no sale).
 * - «Seguimiento de pedidos y avisos de precio (30 días)» (#analitica-avisos-precio, mejora 5 del 2026-11-14): eventos
 *   pedido_aviso_estado_mostrado / _tocado, seguir_envio y aviso_precio_activado / _desactivado / _mostrado / _tocado /
 *   _invitacion (components/AsistenteBlue.tsx, app/producto/[id].tsx, app/(tabs)/perfil.tsx; sin datos personales) y cuántos
 *   clientes siguen cada producto (avisos_precio, migración 20261114160100: solo recuentos, sin nombres; sin ella, no sale).
 *   Y «Avisos de reposición» (#analitica-avisos-reposicion, dueño 2026-11-16, migración 20261116100000): activos por canal,
 *   avisados y los eventos aviso_reposicion_activado (canal) / _desactivado / _tocado; sin la tabla, no sale.
 * - «Parecidos y complementos (30 días)» (#analitica-parecidos, mejora 6 del 2026-11-14): eventos parecidos_mostrado,
 *   parecido_tocado, complemento_mostrado (ficha o cesta), complemento_tocado y complemento_anadido de
 *   components/CarruselProductosCategoria.tsx (solo ids de producto) y los 5 productos que más se añaden desde ahí.
 * - «Comparador (30 días)» (#analitica-comparador, mejora 8 «Comparar 2-3 productos» del 2026-11-14): eventos
 *   comparar_abierto (n e ids), comparar_anadir_cesta (app/comparar.tsx), comparar_anadido y comparar_quitado
 *   (components/CarruselProductosCategoria.tsx); veces abierto, media de productos, añadidos a la cesta y los 5 más comparados.
 * - «Consejos de Blue (30 días)» (#analitica-consejos, mejora 12 «Blue en momentos clave» del 2026-11-15): eventos
 *   consejo_mostrado, consejo_seguido y consejo_cerrado (solo el momento: cesta, catálogo, ficha, comparar, cuenta) y
 *   consejos_desactivados de components/AsistenteBlue.tsx; por momento, mostrados, seguidos y cerrados, y cuántos los apagaron.
 * - «Cambio de consola desde la cesta (30 días)» (#analitica-cambio-cesta, mejora 13 del 2026-11-15): cambio_cesta_mostrado
 *   y cambio_cesta_tocado (app/(tabs)/cesta.tsx) y cambio_cesta_enviado (components/VenderAhoraModal.tsx); solo recuentos.
 * - «Pedidos cancelados: recuperación (30 días)» (#analitica-cancelados-recuperacion, 2026-11-16): cancelado_volver_comprar
 *   y cancelado_ver_parecidos de la tarjeta del pedido cancelado (app/(tabs)/perfil.tsx; solo el id del artículo); recuentos.
 * - «Vender ahora: autorrelleno y fotos (30 días)» (#analitica-vender-media, 2026-11-16): vender_autorrelleno (metadata
 *   campos) y vender_sin_media de components/VenderAhoraModal.tsx; solo recuentos y la media de campos rellenados.
 * - «Vistos recientemente (30 días)» (#analitica-vistos, mejora 9 del 2026-11-14): eventos vistos_mostrado (n),
 *   visto_tocado (id y posición), visto_quitado y vistos_borrados de Inicio (components/CarruselProductosCategoria.tsx →
 *   VistosRecientemente; solo ids); veces mostrado, toques, quitados/borrados y los 5 productos más revisitados.
 * - «Preguntas por artículos (30 días)» (#analitica-chat-producto, mejora 10 «Chat con el producto adjunto» del
 *   2026-11-15): eventos chat_producto_abierto (productId), chat_producto_sugerencia (qué pregunta sugerida),
 *   chat_producto_enviado (primera o no) y chat_producto_invitacion (sin cuenta) de app/producto/[id].tsx y
 *   components/ConversacionProducto.tsx; conversaciones abiertas, preguntas sugeridas más usadas y los 5 productos por los que
 *   más se pregunta. Solo ids de producto, nunca el texto de los mensajes.
 * - «Valoraciones (30 días)» (#analitica-valoraciones, mejora 11 «Valoración tras la entrega» del 2026-11-15): de
 *   pedido_valoraciones (migración 20261115100000; sin ella, un aviso) media, número, reparto por nota, filtro por nota y la
 *   lista con las bajas (1-2) arriba y «Ver pedido» (Pedidos con ?buscar=VZ-…); eventos valoracion_pedida (origen blue o
 *   mis_pedidos), valoracion_abierta y valoracion_baja_chat (valoracion_enviada lleva la nota), sin datos personales.
 * - «Velocidad de la tienda (30 días)» (#analitica-velocidad, mejora 7 «Carga más rápida» del 2026-11-14): evento
 *   rendimiento_carga (lib/analiticaPropia.ts → medirCargaPantalla, una vez por visita: ms hasta la primera pantalla útil de
 *   Inicio, Catálogo o la ficha, ancho por tramos y tipo de conexión; sin datos de nadie). Mediana y percentil 75 por
 *   pantalla y por móvil/tableta/ordenador.
 * - Rediseño PANRED5 (tanda 5, 2026-11-16; components/admin/PiezasPanelAdmin.tsx): las cuatro cifras del rango (Visitantes, Páginas
 *   vistas, Eventos totales y Con cuenta) arriba del todo con FilaCifras, las pastillas de fechas comunes (44 px; en el móvil,
 *   deslizables) y cada apartado en un bloque limpio con su título y su explicación a la izquierda; mismos datos y consultas.
 * - app/admin/index.tsx → tarjeta "Visitas y métricas" que lleva aquí.
 * - app/admin/_layout.tsx → registra esta ruta ("analytics") en el Stack.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CAMPO, COLORES_TEXTO, TACTIL, TAMANOS } from "../../constants/temaTienda";
import { supabase } from "../../lib/supabase";
import { cargarAjustesReparacionEnvio } from "../../lib/envio";
import { eurosAlquiler, mesesContratados } from "../../lib/alquiler";
import CargaMarca from "../../components/marca/CargaMarca";
import { CabeceraPanel, AvisoPanel } from "../../lib/admin/productos.componentes";
import { Chip, Cifra, Detalle, FilaCifras, FilaPastillas, PANEL } from "../../components/admin/PiezasPanelAdmin";

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  cardSoft: "#F8FBFE",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: COLORES_TEXTO.secundario,
  muted2: COLORES_TEXTO.secundario,
  accent: "#1EA7E8",
  // Azul oscuro de la tienda (botón principal, mismo que "Comprar"/"Confirmar pedido").
  accentDark: "#1EA7E8",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  success: "#15803D",
  successBg: "#DCFCE7",
  successBorder: "#86EFAC",
  warning: "#92660B",
  warningBg: "#FEF3C7",
  warningBorder: "#FDE68A",
  danger: "#B91C1C",
  dangerBg: "#FFE4E6",
  dangerBorder: "#FDA4AF",
};

type TotalsRow = {
  total_sessions: number;
  total_pageviews: number;
  total_events: number;
  registered_visitors: number;
};

type DailyRow = { day: string; visitors: number; pageviews: number };
type FunnelRow = { step_label: string; sessions: number };

type DatePreset = "today" | "7d" | "30d" | "90d" | "all" | "custom";

// "on-drag" en web cierra el teclado con CUALQUIER desplazamiento, también el que hace el
// propio navegador al enfocar un campo (el campo se cerraba solo): solo se usa en nativo.
const CIERRE_TECLADO: "none" | "on-drag" = Platform.OS === "web" ? "none" : "on-drag";

// «Velocidad de la tienda (30 días)»: pantallas y tramos de ancho que mide lib/analiticaPropia.ts (medirCargaPantalla).
// Momentos de los consejos de Blue (components/AsistenteBlue.tsx → MomentoBlue) y su nombre en la tarjeta.
const MOMENTOS_CONSEJO: [string, string][] = [
  ["cesta", "Primera compra (cesta)"],
  ["catalogo", "Catálogo"],
  ["ficha", "Ficha de producto"],
  ["comparar", "Comparar"],
  ["cuenta", "Cuenta nueva"],
];
const PANTALLAS_VELOCIDAD = ["inicio", "catalogo", "producto"];
const ANCHOS_VELOCIDAD = ["movil", "tableta", "ordenador"];
const NOMBRE_PANTALLA_VELOCIDAD: Record<string, string> = { inicio: "Inicio", catalogo: "Catálogo", producto: "Ficha" };
const NOMBRE_ANCHO_VELOCIDAD: Record<string, string> = { movil: "Móvil", tableta: "Tableta", ordenador: "Ordenador" };
// En segundos con un decimal y coma (1.234 ms → «1,2 s»).
const segundos = (ms: number) => `${(Math.round(ms / 100) / 10).toFixed(1).replace(".", ",")} s`;

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

// Las fechas del panel son días de calendario de España (Europe/Madrid).
// Internamente cada día se representa como un Date a las 00:00 UTC de ese
// día de calendario (solo para sumar/restar días), y al consultar Supabase
// se convierte al instante real de las 00:00 en Madrid (con su horario de
// verano/invierno).
const TZ = "Europe/Madrid";

const madridPartsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function madridParts(instant: Date) {
  const out: Record<string, number> = {};
  for (const p of madridPartsFmt.formatToParts(instant)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** "AAAA-MM-DD" del día de calendario en Madrid para un instante dado. */
function madridDateStr(instant: Date) {
  const p = madridParts(instant);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

// Diferencia (ms) entre la hora de Madrid y UTC en ese instante (+1h o +2h).
function madridOffsetMs(instantMs: number) {
  const p = madridParts(new Date(instantMs));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

/** Instante ISO de las 00:00 (hora de Madrid) del día "AAAA-MM-DD". */
function madridMidnightIso(dateStr: string) {
  const wallAsUtc = Date.parse(`${dateStr}T00:00:00.000Z`);
  let utc = wallAsUtc - madridOffsetMs(wallAsUtc);
  utc = wallAsUtc - madridOffsetMs(utc);
  return new Date(utc).toISOString();
}

// Topes automáticos de la analítica (dueño, 2026-11-05: «quiero que automáticamente se haga si hay que subir el tope»):
// la MISMA regla que analitica_topes() en supabase/migrations/20261018150000_analitica_topes.sql. Por día, el mayor de
// 20.000 y 3 × el día con más eventos de los últimos 30 (sin hoy), como mucho 200.000; por minuto, el mayor de 300 y el
// diario × 20 / 1.440; por sesión, 120 por minuto.
type DiaRitmo = { dia: string; eventos: number; cortados: number };
function topesAnalitica(ritmo: DiaRitmo[], hoy: string) {
  const hace30 = madridDateStr(new Date(Date.parse(`${hoy}T12:00:00Z`) - 30 * 86400000));
  const maximo = ritmo.filter((r) => r.dia < hoy && r.dia >= hace30).reduce((m, r) => Math.max(m, r.eventos), 0);
  const porDia = Math.min(200000, Math.max(20000, 3 * maximo));
  return { porDia, porMinuto: Math.max(300, Math.ceil((porDia * 20) / 1440)), porSesion: 120 };
}

function toDateOnly(d: Date) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function todayMadrid() {
  return new Date(`${madridDateStr(new Date())}T00:00:00.000Z`);
}

function addDaysUTC(d: Date, days: number) {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function isValidDateStr(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) && !Number.isNaN(Date.parse(`${v.trim()}T00:00:00.000Z`));
}

// created_at >= p_from and < p_to (ver analytics_totals y compañía en
// Supabase): p_from es el inicio del día elegido y p_to es el inicio del día
// SIGUIENTE al final del rango, para incluir el día final completo.
function rangeToIso(fromStr: string, toStr: string) {
  const toExclusive = toDateOnly(addDaysUTC(new Date(`${toStr}T00:00:00.000Z`), 1));
  return { pFrom: madridMidnightIso(fromStr), pTo: madridMidnightIso(toExclusive) };
}

// Eventos de conversión que registran la ficha, la cesta y el checkout.
const CONVERSION_EVENTS = [
  { key: "add_to_cart", label: "Añadir a la cesta" },
  { key: "buy_now", label: "Comprar ya" },
  { key: "begin_checkout", label: "Inicio de pago" },
  { key: "order_whatsapp", label: "Pedido por WhatsApp" },
  // Pago con tarjeta (Stripe, app/checkout.tsx): se abre la página de pago y el pago confirmado por Stripe.
  { key: "pago_tarjeta", label: "Pago online" },
  { key: "pago_tarjeta_ok", label: "Pagado online" },
] as const;

// Importe de «Ventas en tienda frente a online»: 1.299,00€.
function fmtEurCanal(n: number) {
  const [ent, dec] = (Math.round((Number.isFinite(n) ? n : 0) * 100) / 100).toFixed(2).split(".");
  return `${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}€`;
}

// Formas de pago online que dice Stripe (pedidos.pago_metodo y service_requests.pago_metodo / etiqueta_pago_metodo).
const METODOS_PAGO = ["card", "bizum", "klarna"] as const;
type MetodoPago = (typeof METODOS_PAGO)[number];

type ConversionKey = (typeof CONVERSION_EVENTS)[number]["key"];
type ConversionDay = { day: string } & Record<ConversionKey, number>;

function emptyConversionCounts(): Record<ConversionKey, number> {
  return { add_to_cart: 0, buy_now: 0, begin_checkout: 0, order_whatsapp: 0, pago_tarjeta: 0, pago_tarjeta_ok: 0 };
}

function fmtDayLabel(dayStr: string) {
  // dayStr viene como "2026-09-10" (o con hora si el driver lo trae como
  // timestamp): nos quedamos solo con los 10 primeros caracteres.
  const clean = String(dayStr ?? "").slice(0, 10);
  const parts = clean.split("-");
  if (parts.length !== 3) return clean;
  return `${parts[2]}/${parts[1]}`;
}

// Un filtro de la pantalla (rango de fechas, nota de las valoraciones): la pastilla común del panel (PiezasPanelAdmin, 44 px).
function ChipButton({ label, onPress, active }: { label: string; onPress: () => void; active?: boolean; isMobile?: boolean }) {
  return <Chip label={label} onPress={onPress} activo={active} />;
}

// Un bloque de la pantalla (rediseño PANRED5): fondo suave, título y explicación a la izquierda (como los bloques del
// resto del panel) y su contenido debajo.
function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        borderRadius: 16,
        backgroundColor: PANEL.card,
        padding: 14,
        gap: 12,
      }}
    >
      <View style={{ gap: 3, borderBottomWidth: 1, borderBottomColor: PANEL.border, paddingBottom: 10 }}>
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.destacado }}>{title}</Text>
        {!!subtitle && (
          <Text style={{ color: COLORS.muted, lineHeight: 18, fontSize: TAMANOS.minimo }}>
            {subtitle}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

// Barra horizontal simple (sin librería de gráficos): un View cuyo ancho en
// % representa el valor respecto al máximo de la serie.
function BarRow({
  label,
  value,
  maxValue,
  color,
  valueSuffix,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  valueSuffix?: string;
}) {
  const pct = maxValue > 0 ? Math.max(2, Math.round((value / maxValue) * 100)) : 0;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }} numberOfLines={1}>
          {label}
        </Text>
        <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo }}>
          {value}
          {valueSuffix ?? ""}
        </Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: "#EEF3F8", overflow: "hidden" }}>
        <View style={{ width: `${pct}%`, height: "100%", borderRadius: 4, backgroundColor: color }} />
      </View>
    </View>
  );
}

export default function AdminAnalytics() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const insets = useSafeAreaInsets();

  const [preset, setPreset] = useState<DatePreset>("30d");
  const today = useMemo(() => todayMadrid(), []);
  const [fromDate, setFromDate] = useState(toDateOnly(addDaysUTC(today, -29)));
  const [toDate, setToDate] = useState(toDateOnly(today));
  const [fromDraft, setFromDraft] = useState(fromDate);
  const [toDraft, setToDraft] = useState(toDate);
  const [dateErr, setDateErr] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [screenErr, setScreenErr] = useState<string | null>(null);

  const [totals, setTotals] = useState<TotalsRow | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);
  const [conversions, setConversions] = useState<ConversionDay[]>([]);
  // Ritmo de la analítica (tabla analitica_ritmo, últimos 31 días). null = la migración de los topes aún no está.
  const [ritmo, setRitmo] = useState<DiaRitmo[] | null>(null);
  // Reparación por envío (migración 20261111100000): el embudo contado en la base de datos (solo números, sin datos de
  // nadie). null = la migración aún no está aplicada (o no se pudo contar).
  const [embudoEnvio, setEmbudoEnvio] = useState<{ solicitadas: number; pagadas: number; recibidas: number; aceptadas: number } | null>(null);
  // Parte 2 (migración 20261111130000): reparaciones pagadas y enviadas, sin arreglo (compradas / devueltas) y garantías
  // abiertas. null = aún no está (o no se pudo contar).
  const [embudoEnvio2, setEmbudoEnvio2] = useState<{ cobradas: number; enviadas: number; sinArreglo: number; compradas: number; devueltas: number; garantias: number } | null>(null);
  // Pagos online por forma de pago (tarjeta, Bizum, Klarna; lo dice Stripe, migración 20261111150000): recuentos de la
  // base de datos, solo números. null = la migración aún no está (o no se pudo contar).
  const [pagosPorMetodo, setPagosPorMetodo] = useState<{ pedidos: Record<MetodoPago, number>; reparaciones: Record<MetodoPago, number> } | null>(null);
  // Ventas en tienda (en mano, llegan de VeoAura; migración 20261111170000) frente a pedidos online: recuento e importe,
  // sin cancelados. Solo se leen origen, estado y total (ningún dato de nadie). null = la migración aún no está.
  const [ventasCanal, setVentasCanal] = useState<{ tienda: { n: number; eur: number }; online: { n: number; eur: number } } | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data, error } = await supabase.from("pedidos").select("origen,estado,total_eur").neq("estado", "cancelado").limit(10000);
        if (!vivo) return;
        if (error) return setVentasCanal(null);
        const r = { tienda: { n: 0, eur: 0 }, online: { n: 0, eur: 0 } };
        for (const f of (data ?? []) as { origen: string | null; total_eur: number | string | null }[]) {
          const c = f.origen === "tienda_fisica" ? r.tienda : r.online;
          c.n += 1;
          c.eur += Number(f.total_eur ?? 0);
        }
        setVentasCanal(r);
      } catch {
        // sin conexión: sin el recuento
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const contar = (tabla: "pedidos" | "service_requests", columna: string, metodo: MetodoPago) =>
          supabase.from(tabla).select("id", { count: "exact", head: true }).eq(columna, metodo);
        // Primero una (sin la migración falla una sola vez) y, si existe, las demás.
        const primera = await contar("pedidos", "pago_metodo", "card");
        if (primera.error) {
          if (vivo) setPagosPorMetodo(null);
          return;
        }
        const r = await Promise.all(
          METODOS_PAGO.flatMap((m, i) => [
            i === 0 ? Promise.resolve(primera) : contar("pedidos", "pago_metodo", m),
            contar("service_requests", "pago_metodo", m),
            contar("service_requests", "etiqueta_pago_metodo", m),
          ])
        );
        if (!vivo) return;
        if (r.some((x) => x.error)) return setPagosPorMetodo(null);
        const pedidos = { card: 0, bizum: 0, klarna: 0 } as Record<MetodoPago, number>;
        const reparaciones = { card: 0, bizum: 0, klarna: 0 } as Record<MetodoPago, number>;
        METODOS_PAGO.forEach((m, i) => {
          pedidos[m] = r[i * 3].count ?? 0;
          reparaciones[m] = (r[i * 3 + 1].count ?? 0) + (r[i * 3 + 2].count ?? 0);
        });
        setPagosPorMetodo({ pedidos, reparaciones });
      } catch {
        // sin conexión: sin el recuento
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);
  useEffect(() => {
    let vivo = true;
    type Cuenta = { count: number | null; error: unknown };
    const contarTodas = (filtro: (q: any) => any): Promise<Cuenta> => filtro(supabase.from("service_requests").select("id", { count: "exact", head: true }));
    const contar = (filtro: (q: any) => any): Promise<Cuenta> => contarTodas((q) => filtro(q.eq("entrega_modo", "correos")));
    (async () => {
      try {
        // Primero una (sin la migración falla una sola vez) y, si existe, las otras tres.
        const primera = await contar((q) => q);
        if (primera.error) {
          if (vivo) setEmbudoEnvio(null);
          return;
        }
        const r = await Promise.all([
          contar((q) => q.not("etiqueta_pagada_en", "is", null)),
          contar((q) => q.in("seguimiento", ["recibido", "diagnostico", "presupuesto", "esperando_pieza", "reparando", "listo", "enviada", "entregado"])),
          contar((q) => q.not("presupuesto_aceptado_en", "is", null)),
        ]);
        if (!vivo) return;
        if (r.some((x) => x.error)) return setEmbudoEnvio(null);
        setEmbudoEnvio({ solicitadas: primera.count ?? 0, pagadas: r[0].count ?? 0, recibidas: r[1].count ?? 0, aceptadas: r[2].count ?? 0 });
        // Parte 2: solo si la base de datos ya la tiene (sin errores antes de la migración).
        if (!(await cargarAjustesReparacionEnvio())?.parte2) return;
        const r2 = await Promise.all([
          contar((q) => q.eq("pago_estado", "pagado").or("diagnostico_resultado.is.null,diagnostico_resultado.eq.reparable")),
          contar((q) => q.in("seguimiento", ["enviada", "entregado"]).or("diagnostico_resultado.is.null,diagnostico_resultado.eq.reparable")),
          contarTodas((q) => q.eq("diagnostico_resultado", "sin_arreglo")),
          contarTodas((q) => q.eq("diagnostico_resultado", "sin_arreglo").eq("sin_arreglo_eleccion", "comprar")),
          contarTodas((q) => q.eq("diagnostico_resultado", "sin_arreglo").eq("sin_arreglo_eleccion", "devolver")),
          contarTodas((q) => q.not("garantia_de", "is", null).not("seguimiento", "in", "(entregado,cancelado)")),
        ]);
        if (!vivo || r2.some((x) => x.error)) return;
        const [cobradas, enviadas, sinArreglo, compradas, devueltas, garantias] = r2.map((x) => x.count ?? 0);
        setEmbudoEnvio2({ cobradas, enviadas, sinArreglo, compradas, devueltas, garantias });
      } catch {
        // sin conexión: sin el embudo
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  function applyPreset(p: DatePreset) {
    setDateErr(null);
    setPreset(p);
    if (p === "custom") return;

    let from = today;
    if (p === "today") from = today;
    else if (p === "7d") from = addDaysUTC(today, -6);
    else if (p === "30d") from = addDaysUTC(today, -29);
    else if (p === "90d") from = addDaysUTC(today, -89);
    else if (p === "all") from = new Date(Date.UTC(2020, 0, 1));

    const f = toDateOnly(from);
    const t = toDateOnly(today);
    setFromDate(f);
    setToDate(t);
    setFromDraft(f);
    setToDraft(t);
  }

  function applyCustomRange() {
    if (!isValidDateStr(fromDraft) || !isValidDateStr(toDraft)) {
      setDateErr("Escribe las dos fechas en formato AAAA-MM-DD.");
      return;
    }
    if (fromDraft > toDraft) {
      setDateErr("La fecha de inicio no puede ser posterior a la de fin.");
      return;
    }
    setDateErr(null);
    setPreset("custom");
    setFromDate(fromDraft.trim());
    setToDate(toDraft.trim());
  }

  const load = useCallback(async () => {
    setLoading(true);
    setScreenErr(null);

    try {
      const { pFrom, pTo } = rangeToIso(fromDate, toDate);

      const [totalsRes, dailyRes, funnelRes, convRes] = await Promise.all([
        supabase.rpc("analytics_totals", { p_from: pFrom, p_to: pTo }),
        supabase.rpc("analytics_daily_visitors", { p_from: pFrom, p_to: pTo }),
        supabase.rpc("analytics_funnel", { p_from: pFrom, p_to: pTo }),
        supabase
          .from("analytics_events")
          .select("event_name, created_at")
          .in(
            "event_name",
            CONVERSION_EVENTS.map((c) => c.key)
          )
          .gte("created_at", pFrom)
          .lt("created_at", pTo)
          .order("created_at", { ascending: false })
          .limit(5000),
      ]);

      if (totalsRes.error) throw totalsRes.error;
      if (dailyRes.error) throw dailyRes.error;
      if (funnelRes.error) throw funnelRes.error;

      // Conversiones por día (de Madrid). Si la consulta falla, el resto del
      // panel se muestra igual y este bloque queda vacío.
      const byDay = new Map<string, Record<ConversionKey, number>>();
      if (!convRes.error) {
        for (const r of (convRes.data ?? []) as { event_name: string; created_at: string }[]) {
          const key = r.event_name as ConversionKey;
          const day = madridDateStr(new Date(r.created_at));
          const counts = byDay.get(day) ?? emptyConversionCounts();
          if (key in counts) counts[key] += 1;
          byDay.set(day, counts);
        }
      } else {
        console.error("Error cargando conversiones:", convRes.error);
      }
      setConversions(
        Array.from(byDay.entries())
          .sort((a, b) => (a[0] < b[0] ? 1 : -1))
          .map(([day, counts]) => ({ day, ...counts }))
      );

      const totalsRow = Array.isArray(totalsRes.data) ? totalsRes.data[0] : totalsRes.data;
      setTotals(
        totalsRow
          ? {
              total_sessions: Number(totalsRow.total_sessions ?? 0),
              total_pageviews: Number(totalsRow.total_pageviews ?? 0),
              total_events: Number(totalsRow.total_events ?? 0),
              registered_visitors: Number(totalsRow.registered_visitors ?? 0),
            }
          : { total_sessions: 0, total_pageviews: 0, total_events: 0, registered_visitors: 0 }
      );

      setDaily(
        (Array.isArray(dailyRes.data) ? dailyRes.data : []).map((r: any) => ({
          day: String(r.day ?? ""),
          visitors: Number(r.visitors ?? 0),
          pageviews: Number(r.pageviews ?? 0),
        }))
      );

      setFunnel(
        (Array.isArray(funnelRes.data) ? funnelRes.data : []).map((r: any) => ({
          step_label: String(r.step_label ?? ""),
          sessions: Number(r.sessions ?? 0),
        }))
      );
    } catch (e: any) {
      console.error("Error cargando analítica:", e);
      setScreenErr(
        "No se han podido cargar las métricas. Comprueba tu conexión o vuelve a intentarlo."
      );
      setTotals(null);
      setDaily([]);
      setFunnel([]);
      setConversions([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    load();
  }, [load]);

  // Topes automáticos: el ritmo de los últimos 31 días (no depende de las fechas elegidas arriba).
  useEffect(() => {
    let vivo = true;
    (async () => {
      const desde = madridDateStr(new Date(Date.now() - 31 * 86400000));
      const { data, error } = await supabase.from("analitica_ritmo").select("dia,eventos,cortados").gte("dia", desde).order("dia", { ascending: false });
      if (!vivo) return;
      setRitmo(
        error
          ? null
          : ((data ?? []) as { dia: string; eventos: number | string; cortados: number | string }[]).map((r) => ({
              dia: String(r.dia),
              eventos: Number(r.eventos) || 0,
              cortados: Number(r.cortados) || 0,
            }))
      );
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Búsquedas (mejora 3, 2026-11-14): los últimos 30 días, aparte de las fechas de arriba. Solo eventos propios de quien
  // aceptó la analítica (lib/analiticaPropia.ts), con el texto normalizado y sin datos personales.
  const [busquedas, setBusquedas] = useState<{
    total: number;
    top: { texto: string; n: number; resultados: number }[];
    sinResultados: { texto: string; n: number; sugerencia: string | null }[];
    nSinResultados: number;
    sinonimo: number;
    correccion: number;
    sugerenciasTocadas: number;
    desde: { inicio: number; catalogo: number };
    filtros: { precio: number; estado: number; quitados: number; borrados: number };
    estados: { valor: string; n: number }[];
    tramos: { tramo: string; n: number }[];
    // «Compartir» de una categoría (dueño, 2026-11-19): cuántas veces y de cuáles (solo el nombre de la categoría).
    compartidas: { total: number; porCategoria: { nombre: string; n: number }[] };
    // Final de cada categoría (catalogo_final, 2026-11-26): toques en servicios, en otras categorías y en los avisos de
    // «Compra con confianza» (solo el nombre del servicio o de la categoría).
    finalCategoria: { servicios: number; categorias: number; confianza: number; porServicio: { nombre: string; n: number }[] };
  } | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const desde = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data, error } = await supabase
        .from("analytics_events")
        .select("event_name, metadata")
        .in("event_name", ["busqueda", "busqueda_sin_resultados", "busqueda_sugerencia_tocada", "catalogo_filtro", "categoria_compartida", "catalogo_final"])
        .gte("created_at", desde)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (!vivo) return;
      if (error || !Array.isArray(data)) {
        setBusquedas(null);
        return;
      }
      type Fila = { event_name: string; metadata: Record<string, unknown> | null };
      const filas = data as Fila[];
      const texto = (m: Record<string, unknown> | null) => (typeof m?.texto === "string" ? m.texto : "");
      const contar = <T,>(lista: T[], clave: (x: T) => string) => {
        const mapa = new Map<string, { n: number; ultimo: T }>();
        for (const x of lista) {
          const k = clave(x);
          if (!k) continue;
          const v = mapa.get(k);
          mapa.set(k, { n: (v?.n ?? 0) + 1, ultimo: v?.ultimo ?? x });
        }
        return [...mapa.entries()].sort((a, b) => b[1].n - a[1].n);
      };
      const hechas = filas.filter((f) => f.event_name === "busqueda");
      const vacias = filas.filter((f) => f.event_name === "busqueda_sin_resultados");
      const filtros = filas.filter((f) => f.event_name === "catalogo_filtro");
      const NOMBRES_ESTADO: Record<string, string> = { NEW: "Nuevo", USED: "Segunda mano", LIKE_NEW: "Como nuevo", GOOD: "Bueno", FAIR: "Regular", PARTS: "Para piezas" };
      const tramo = (m: Record<string, unknown> | null) => {
        const min = Number(m?.min ?? 1);
        const max = m?.max == null ? null : Number(m.max);
        return `${min} € – ${max == null ? "1000 € o más" : `${max} €`}`;
      };
      setBusquedas({
        total: hechas.length,
        top: contar(hechas, (f) => texto(f.metadata))
          .slice(0, 10)
          .map(([k, v]) => ({ texto: k, n: v.n, resultados: Number(v.ultimo.metadata?.resultados ?? 0) })),
        sinResultados: contar(vacias, (f) => texto(f.metadata))
          .slice(0, 10)
          .map(([k, v]) => ({ texto: k, n: v.n, sugerencia: typeof v.ultimo.metadata?.sugerencia === "string" ? (v.ultimo.metadata.sugerencia as string) : null })),
        nSinResultados: vacias.length,
        sinonimo: hechas.filter((f) => f.metadata?.sinonimo === true).length,
        correccion: hechas.filter((f) => f.metadata?.correccion === true).length,
        sugerenciasTocadas: filas.filter((f) => f.event_name === "busqueda_sugerencia_tocada").length,
        desde: { inicio: hechas.filter((f) => f.metadata?.origen === "inicio").length, catalogo: hechas.filter((f) => f.metadata?.origen === "catalogo").length },
        filtros: {
          precio: filtros.filter((f) => f.metadata?.filtro === "precio" && f.metadata?.accion == null).length,
          estado: filtros.filter((f) => f.metadata?.filtro === "estado" && f.metadata?.accion == null).length,
          quitados: filtros.filter((f) => f.metadata?.accion === "quitar").length,
          borrados: filtros.filter((f) => f.metadata?.accion === "borrar").length,
        },
        estados: contar(
          filtros.filter((f) => f.metadata?.filtro === "estado" && f.metadata?.accion == null),
          (f) => String(f.metadata?.valor ?? "")
        ).map(([k, v]) => ({ valor: NOMBRES_ESTADO[k] ?? k, n: v.n })),
        tramos: contar(
          filtros.filter((f) => f.metadata?.filtro === "precio" && f.metadata?.accion == null),
          (f) => tramo(f.metadata)
        )
          .slice(0, 5)
          .map(([k, v]) => ({ tramo: k, n: v.n })),
        compartidas: (() => {
          const lista = filas.filter((f) => f.event_name === "categoria_compartida");
          return {
            total: lista.length,
            porCategoria: contar(lista, (f) => (typeof f.metadata?.nombre === "string" ? f.metadata.nombre : String(f.metadata?.cat ?? "")))
              .slice(0, 5)
              .map(([k, v]) => ({ nombre: k, n: v.n })),
          };
        })(),
        finalCategoria: (() => {
          const lista = filas.filter((f) => f.event_name === "catalogo_final");
          const deBloque = (b: string) => lista.filter((f) => f.metadata?.bloque === b);
          return {
            servicios: deBloque("servicio").length,
            categorias: deBloque("categoria").length,
            confianza: deBloque("confianza").length,
            porServicio: contar(deBloque("servicio"), (f) => (typeof f.metadata?.nombre === "string" ? f.metadata.nombre : ""))
              .slice(0, 3)
              .map(([k, v]) => ({ nombre: k, n: v.n })),
          };
        })(),
      });
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Ficha del producto (mejora 4 «Ficha de confianza», 2026-11-14): los últimos 30 días del visor de fotos
  // (ficha_foto_zoom: abrir, zoom y cerrar deslizando) y de la entrega estimada mostrada por tipo (ficha_entrega_estimada,
  // sin códigos postales), más cuántos productos ha marcado el dueño como revisados o con garantía (solo recuentos; sin la
  // migración 20261114140000, null y no se enseñan).
  const [fichaConfianza, setFichaConfianza] = useState<{
    abiertos: number;
    zoom: number;
    cerradosDeslizando: number;
    entregas: { mismo_dia: number; peninsula: number; islas: number; sin_cp: number };
    // Franja elegida al pagar (entrega_franja_elegida, dueño 2026-11-15): solo la franja y si es hoy o mañana.
    franjas: { manana: number; tarde: number; hoy: number; otroDia: number };
    // Artículos únicos (dueño, 2026-11-15): intentos de comprar algo que otro acababa de pagar (al guardar el pedido o al
    // ir a pagar; pago_articulo_vendido), dobles ventas de 30 días y artículos vendidos al pagar por la web (null sin la
    // migración 20261115200000).
    unicos: { vendidoAlPedir: number; vendidoAlPagar: number; dobles: number | null; vendidosWeb: number | null };
    revisados: number | null;
    conGarantia: number | null;
  } | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const desde = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data, error } = await supabase
        .from("analytics_events")
        .select("event_name, metadata")
        .in("event_name", ["ficha_foto_zoom", "ficha_entrega_estimada", "entrega_franja_elegida", "pago_articulo_vendido"])
        .gte("created_at", desde)
        .limit(5000);
      if (!vivo) return;
      if (error || !Array.isArray(data)) {
        setFichaConfianza(null);
        return;
      }
      const filas = data as { event_name: string; metadata: Record<string, unknown> | null }[];
      const visor = filas.filter((f) => f.event_name === "ficha_foto_zoom");
      const entregas = filas.filter((f) => f.event_name === "ficha_entrega_estimada");
      const deTipo = (t: string) => entregas.filter((f) => f.metadata?.tipo === t).length;
      const elegidas = filas.filter((f) => f.event_name === "entrega_franja_elegida");
      // Revisados y con garantía: primero se mira con «*» en una fila si la columna existe (sin un 400 antes de la migración).
      let revisados: number | null = null;
      let conGarantia: number | null = null;
      let dobles: number | null = null;
      let vendidosWeb: number | null = null;
      try {
        const muestra = await supabase.from("products").select("*").limit(1);
        const fila = !muestra.error && Array.isArray(muestra.data) ? (muestra.data[0] as Record<string, unknown> | undefined) : undefined;
        if (fila && "revisado" in fila && "garantia_meses" in fila) {
          const [r, g] = await Promise.all([
            supabase.from("products").select("id", { count: "exact", head: true }).eq("revisado", true),
            supabase.from("products").select("id", { count: "exact", head: true }).not("garantia_meses", "is", null),
          ]);
          revisados = r.error ? null : r.count ?? 0;
          conGarantia = g.error ? null : g.count ?? 0;
        }
        // Artículos únicos: dobles ventas de 30 días (pedidos.doble_venta_en) y artículos vendidos al pagar por la web
        // (products.vendido_pedido_id). Solo recuentos y solo con la migración 20261115200000 (se mira en la misma fila).
        if (fila && "vendido_pedido_id" in fila) {
          const [d, v] = await Promise.all([
            supabase.from("pedidos").select("id", { count: "exact", head: true }).gte("doble_venta_en", desde),
            supabase.from("products").select("id", { count: "exact", head: true }).not("vendido_pedido_id", "is", null),
          ]);
          dobles = d.error ? null : d.count ?? 0;
          vendidosWeb = v.error ? null : v.count ?? 0;
        }
      } catch {
        // sin recuentos
      }
      if (!vivo) return;
      setFichaConfianza({
        abiertos: visor.filter((f) => f.metadata?.accion === "abrir").length,
        zoom: visor.filter((f) => f.metadata?.accion === "zoom").length,
        cerradosDeslizando: visor.filter((f) => f.metadata?.accion === "cerrar_deslizando").length,
        entregas: { mismo_dia: deTipo("mismo_dia"), peninsula: deTipo("peninsula"), islas: deTipo("islas"), sin_cp: deTipo("sin_cp") },
        franjas: {
          manana: elegidas.filter((f) => f.metadata?.franja === "manana").length,
          tarde: elegidas.filter((f) => f.metadata?.franja === "tarde").length,
          hoy: elegidas.filter((f) => f.metadata?.cuando === "hoy").length,
          otroDia: elegidas.filter((f) => f.metadata?.cuando !== "hoy").length,
        },
        unicos: {
          vendidoAlPedir: filas.filter((f) => f.event_name === "pago_articulo_vendido" && f.metadata?.momento === "pedido").length,
          vendidoAlPagar: filas.filter((f) => f.event_name === "pago_articulo_vendido" && f.metadata?.momento === "pago").length,
          dobles,
          vendidosWeb,
        },
        revisados,
        conGarantia,
      });
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Seguimiento y avisos de precio (mejora 5, 2026-11-14): cuántos clientes siguen cada producto con «Avísame si baja de
  // precio» (avisos_precio, solo recuentos por producto, sin nombres; sin la migración 20261114160100, null) y, en 30 días,
  // los avisos de Blue mostrados y tocados (estado del pedido y bajadas) y los avisos activados y quitados.
  const [avisosPrecio, setAvisosPrecio] = useState<{
    porProducto: { id: string; titulo: string; clientes: number }[] | null;
    clientes: number | null;
    ev: Record<string, number>;
    // «Avisarme cuando haya otro» (avisos_reposicion, migración 20261116100000; null sin ella): solo recuentos.
    repo: { activos: number; app: number; correo: number; ambas: number; avisados: number } | null;
  } | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const NOMBRES = [
        "pedido_aviso_estado_mostrado",
        "pedido_aviso_estado_tocado",
        "aviso_precio_activado",
        "aviso_precio_desactivado",
        "aviso_precio_mostrado",
        "aviso_precio_tocado",
        "aviso_precio_invitacion",
        "seguir_envio",
        "aviso_reposicion_activado",
        "aviso_reposicion_desactivado",
        "aviso_reposicion_tocado",
      ];
      const desde = new Date(Date.now() - 30 * 86400000).toISOString();
      const [ev, filas, repoFilas] = await Promise.all([
        supabase.from("analytics_events").select("event_name").in("event_name", NOMBRES).gte("created_at", desde).limit(5000),
        supabase.from("avisos_precio").select("product_id,user_id").limit(5000),
        supabase.from("avisos_reposicion").select("canal,activo,avisado_en").limit(5000),
      ]);
      const listaRepo = repoFilas.error || !Array.isArray(repoFilas.data) ? null : (repoFilas.data as { canal: string; activo: boolean; avisado_en: string | null }[]);
      const repo = listaRepo
        ? {
            activos: listaRepo.filter((a) => a.activo).length,
            app: listaRepo.filter((a) => a.activo && a.canal === "app").length,
            correo: listaRepo.filter((a) => a.activo && a.canal === "correo").length,
            ambas: listaRepo.filter((a) => a.activo && a.canal === "ambas").length,
            avisados: listaRepo.filter((a) => !!a.avisado_en).length,
          }
        : null;
      const cuenta: Record<string, number> = Object.fromEntries(NOMBRES.map((n) => [n, 0]));
      for (const f of (ev.error ? [] : ev.data ?? []) as { event_name: string }[]) cuenta[f.event_name] = (cuenta[f.event_name] ?? 0) + 1;
      let porProducto: { id: string; titulo: string; clientes: number }[] | null = null;
      let clientes: number | null = null;
      if (!filas.error && Array.isArray(filas.data)) {
        const lista = filas.data as { product_id: string; user_id: string }[];
        const n = new Map<string, number>();
        for (const f of lista) n.set(f.product_id, (n.get(f.product_id) ?? 0) + 1);
        clientes = new Set(lista.map((f) => f.user_id)).size;
        const ids = [...n.keys()];
        const titulos = new Map<string, string>();
        if (ids.length) {
          const { data: prods } = await supabase.from("products").select("id,title").in("id", ids.slice(0, 200));
          for (const p of (prods ?? []) as { id: string; title: string }[]) titulos.set(p.id, p.title);
        }
        porProducto = ids
          .map((id) => ({ id, titulo: titulos.get(id) ?? "Producto retirado", clientes: n.get(id) ?? 0 }))
          .sort((a, b) => b.clientes - a.clientes)
          .slice(0, 10);
      }
      if (vivo) setAvisosPrecio({ porProducto, clientes, ev: cuenta, repo });
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Parecidos y complementos (mejora 6, 2026-11-14): en 30 días, veces que se enseñan «Productos parecidos» (ficha) y
  // «Completa tu compra» (ficha y cesta), cuántas se tocan, cuántos complementos se añaden a la cesta y cuáles se añaden
  // más (metadata.id, solo ids de producto; los títulos se piden aparte).
  const [parecidos, setParecidos] = useState<{
    ev: Record<string, number>;
    mostradosFicha: number;
    mostradosCesta: number;
    masAnadidos: { id: string; titulo: string; n: number }[];
  } | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const NOMBRES = ["parecidos_mostrado", "parecido_tocado", "complemento_mostrado", "complemento_tocado", "complemento_anadido"];
      const desde = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data, error } = await supabase
        .from("analytics_events")
        .select("event_name, metadata")
        .in("event_name", NOMBRES)
        .gte("created_at", desde)
        .limit(5000);
      if (!vivo) return;
      if (error || !Array.isArray(data)) {
        setParecidos(null);
        return;
      }
      const filas = data as { event_name: string; metadata: Record<string, unknown> | null }[];
      const ev: Record<string, number> = Object.fromEntries(NOMBRES.map((n) => [n, 0]));
      for (const f of filas) ev[f.event_name] = (ev[f.event_name] ?? 0) + 1;
      const mostrados = filas.filter((f) => f.event_name === "complemento_mostrado");
      const n = new Map<string, number>();
      for (const f of filas) {
        const id = f.event_name === "complemento_anadido" && typeof f.metadata?.id === "string" ? f.metadata.id : null;
        if (id) n.set(id, (n.get(id) ?? 0) + 1);
      }
      const ids = [...n.keys()].sort((a, b) => (n.get(b) ?? 0) - (n.get(a) ?? 0)).slice(0, 5);
      const titulos = new Map<string, string>();
      if (ids.length) {
        const { data: prods } = await supabase.from("products").select("id,title").in("id", ids);
        for (const p of (prods ?? []) as { id: string; title: string }[]) titulos.set(p.id, p.title);
      }
      if (!vivo) return;
      setParecidos({
        ev,
        mostradosFicha: mostrados.filter((f) => f.metadata?.origen === "ficha").length,
        mostradosCesta: mostrados.filter((f) => f.metadata?.origen === "cesta").length,
        masAnadidos: ids.map((id) => ({ id, titulo: titulos.get(id) ?? "Producto retirado", n: n.get(id) ?? 0 })),
      });
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Comparador (mejora 8, 2026-11-14): en 30 días, veces que se abre /comparar, cuántos productos se comparan de media,
  // cuántos se añaden a la cesta desde ahí, cuántos se eligen y se quitan, y los productos que más se comparan (ids de
  // comparar_abierto; los títulos se piden aparte). Sin datos de nadie.
  const [comparador, setComparador] = useState<{
    abiertos: number;
    media: number | null;
    cesta: number;
    anadidos: number;
    quitados: number;
    top: { id: string; titulo: string; n: number }[];
  } | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const NOMBRES = ["comparar_abierto", "comparar_anadir_cesta", "comparar_anadido", "comparar_quitado"];
      const desde = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data, error } = await supabase
        .from("analytics_events")
        .select("event_name, metadata")
        .in("event_name", NOMBRES)
        .gte("created_at", desde)
        .limit(5000);
      if (!vivo) return;
      if (error || !Array.isArray(data)) {
        setComparador(null);
        return;
      }
      const filas = (data as { event_name: string; metadata: Record<string, unknown> | null }[]).filter((f) => NOMBRES.includes(f.event_name));
      const abiertos = filas.filter((f) => f.event_name === "comparar_abierto");
      const cuantos = abiertos.map((f) => Number(f.metadata?.n)).filter((x) => Number.isFinite(x) && x > 0);
      const veces = new Map<string, number>();
      for (const f of abiertos) {
        const lista = Array.isArray(f.metadata?.ids) ? (f.metadata?.ids as unknown[]) : [];
        for (const id of lista) if (typeof id === "string") veces.set(id, (veces.get(id) ?? 0) + 1);
      }
      const ids = [...veces.keys()].sort((a, b) => (veces.get(b) ?? 0) - (veces.get(a) ?? 0)).slice(0, 5);
      const titulos = new Map<string, string>();
      if (ids.length) {
        const { data: prods } = await supabase.from("products").select("id,title").in("id", ids);
        for (const p of (prods ?? []) as { id: string; title: string }[]) titulos.set(p.id, p.title);
      }
      if (!vivo) return;
      setComparador({
        abiertos: abiertos.length,
        media: cuantos.length ? cuantos.reduce((s, x) => s + x, 0) / cuantos.length : null,
        cesta: filas.filter((f) => f.event_name === "comparar_anadir_cesta").length,
        anadidos: filas.filter((f) => f.event_name === "comparar_anadido").length,
        quitados: filas.filter((f) => f.event_name === "comparar_quitado").length,
        top: ids.map((id) => ({ id, titulo: titulos.get(id) ?? "Producto retirado", n: veces.get(id) ?? 0 })),
      });
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Consejos de Blue en momentos clave (mejora 12, 2026-11-15): en 30 días, por momento, cuántas veces se enseña el consejo,
  // cuántas se sigue (su botón) y cuántas se cierra (X o «Ahora no»), y cuántos dispositivos los apagaron. Solo el momento.
  const [consejos, setConsejos] = useState<{ filas: { momento: string; mostrados: number; seguidos: number; cerrados: number }[]; desactivados: number } | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const NOMBRES = ["consejo_mostrado", "consejo_seguido", "consejo_cerrado", "consejos_desactivados"];
      const desde = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data, error } = await supabase
        .from("analytics_events")
        .select("event_name, metadata")
        .in("event_name", NOMBRES)
        .gte("created_at", desde)
        .limit(5000);
      if (!vivo) return;
      if (error || !Array.isArray(data)) {
        setConsejos(null);
        return;
      }
      const filas = (data as { event_name: string; metadata: Record<string, unknown> | null }[]).filter((f) => NOMBRES.includes(f.event_name));
      const cuenta = (nombre: string, m: string) => filas.filter((f) => f.event_name === nombre && f.metadata?.momento === m).length;
      setConsejos({
        filas: MOMENTOS_CONSEJO.map(([m, nombre]) => ({ momento: nombre, mostrados: cuenta("consejo_mostrado", m), seguidos: cuenta("consejo_seguido", m), cerrados: cuenta("consejo_cerrado", m) })),
        desactivados: filas.filter((f) => f.event_name === "consejos_desactivados").length,
      });
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Cambio de consola desde la cesta (mejora 13, 2026-11-15): en 30 días, veces que la cesta enseña la línea, toques y
  // solicitudes enviadas desde ahí. Solo recuentos.
  const [cambioCesta, setCambioCesta] = useState<{ mostrado: number; tocado: number; enviados: number } | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const NOMBRES = ["cambio_cesta_mostrado", "cambio_cesta_tocado", "cambio_cesta_enviado"];
      const desde = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data, error } = await supabase.from("analytics_events").select("event_name").in("event_name", NOMBRES).gte("created_at", desde).limit(5000);
      if (!vivo) return;
      if (error || !Array.isArray(data)) {
        setCambioCesta(null);
        return;
      }
      const cuenta = (n: string) => (data as { event_name: string }[]).filter((f) => f.event_name === n).length;
      setCambioCesta({ mostrado: cuenta("cambio_cesta_mostrado"), tocado: cuenta("cambio_cesta_tocado"), enviados: cuenta("cambio_cesta_enviado") });
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Alquiler (fase 2, 2026-11-17; apagado para el cliente): unidades, ocupación (% de unidades alquiladas), ingresos de
  // alquiler del mes (registro alquiler_pagos, migración 20261117120000; sin él, lo pagado en los alquileres empezados este
  // mes), fianzas retenidas (cobradas y aún sin devolver) y alquileres renovados. Solo números, sin datos de nadie.
  const [alquilerCifras, setAlquilerCifras] = useState<{ unidades: number; ocupacion: number; ingresos: number; fianzas: number; nFianzas: number; renovados: number } | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [un, al, pa] = await Promise.all([
          // Solo el recuento (sin descargar filas): las unidades de alquiler.
          supabase.from("products").select("id", { count: "exact", head: true }).eq("modo", "alquiler"),
          supabase.from("alquileres").select("product_id,estado,plan_meses,inicio_en,fin_previsto_en,fianza_estado,fianza_eur,recargo_eur,fianza_descuento_eur,pagado_alquiler_eur").limit(5000),
          supabase.from("alquiler_pagos").select("concepto,importe_eur,creado_en").limit(5000),
        ]);
        if (!vivo) return;
        if (un.error || al.error) {
          setAlquilerCifras(null);
          return;
        }
        const unidades = un.count ?? 0;
        const filas = (al.data ?? []) as { product_id: string | null; estado: string; plan_meses: number; inicio_en: string | null; fin_previsto_en: string | null; fianza_estado: string; fianza_eur: number; recargo_eur: number; fianza_descuento_eur: number; pagado_alquiler_eur: number }[];
        // Un solo alquiler en curso por unidad (lo asegura la base de datos): los activos y por recoger son las alquiladas.
        const alquiladas = new Set(filas.filter((a) => (a.estado === "activo" || a.estado === "por_recoger") && a.product_id).map((a) => a.product_id));
        const d = new Date();
        const desde = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
        const c = (n: unknown) => Math.round((Number(n) || 0) * 100);
        const ingresos = !pa.error
          ? ((pa.data ?? []) as { concepto: string; importe_eur: number; creado_en: string }[]).filter((p) => (p.concepto === "alquiler" || p.concepto === "renovacion") && Date.parse(p.creado_en) >= desde).reduce((s, p) => s + c(p.importe_eur), 0)
          : filas.filter((a) => a.inicio_en && Date.parse(a.inicio_en) >= desde).reduce((s, a) => s + c(a.pagado_alquiler_eur), 0);
        const retenidas = filas.filter((a) => a.fianza_estado === "cobrada");
        setAlquilerCifras({
          unidades,
          ocupacion: unidades ? Math.min(100, Math.round((alquiladas.size / unidades) * 100)) : 0,
          ingresos: ingresos / 100,
          fianzas: retenidas.reduce((s, a) => s + c(a.fianza_eur) - c(a.recargo_eur) - c(a.fianza_descuento_eur), 0) / 100,
          nFianzas: retenidas.length,
          renovados: filas.filter((a) => mesesContratados(a.inicio_en, a.fin_previsto_en) > Number(a.plan_meses)).length,
        });
      } catch {
        if (vivo) setAlquilerCifras(null);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Pedidos cancelados: recuperación (dueño, 2026-11-16): en 30 días, toques en «Volver a comprar» y «Ver artículos
  // parecidos» de la tarjeta del pedido cancelado (Mis pedidos). Solo recuentos.
  const [recuperacionCancel, setRecuperacionCancel] = useState<{ recomprar: number; parecidos: number } | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const NOMBRES = ["cancelado_volver_comprar", "cancelado_ver_parecidos"];
      const desde = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data, error } = await supabase.from("analytics_events").select("event_name").in("event_name", NOMBRES).gte("created_at", desde).limit(5000);
      if (!vivo) return;
      if (error || !Array.isArray(data)) {
        setRecuperacionCancel(null);
        return;
      }
      const cuenta = (n: string) => (data as { event_name: string }[]).filter((f) => f.event_name === n).length;
      setRecuperacionCancel({ recomprar: cuenta("cancelado_volver_comprar"), parecidos: cuenta("cancelado_ver_parecidos") });
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // «Vender ahora» con fotos y vídeo obligatorios (2026-11-16): en 30 días, veces que el formulario se rellenó solo con
  // los datos de la cuenta (vender_autorrelleno, con cuántos campos) e intentos de enviarlo sin las fotos o el vídeo
  // (vender_sin_media). Solo recuentos.
  // Y, desde el 2026-11-19, las subidas en segundo plano (vender_subida: archivos, segundos y fallidos).
  const [venderMedia, setVenderMedia] = useState<{ autorrelleno: number; mediaCampos: string; sinMedia: number; subidas: number; segundosMedia: number; conFallos: number } | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const NOMBRES = ["vender_autorrelleno", "vender_sin_media", "vender_subida"];
      const desde = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data, error } = await supabase.from("analytics_events").select("event_name, metadata").in("event_name", NOMBRES).gte("created_at", desde).limit(5000);
      if (!vivo) return;
      if (error || !Array.isArray(data)) {
        setVenderMedia(null);
        return;
      }
      const filas = data as { event_name: string; metadata: Record<string, unknown> | null }[];
      const auto = filas.filter((f) => f.event_name === "vender_autorrelleno");
      const suma = auto.reduce((t, f) => t + (Number(f.metadata?.campos) || 0), 0);
      setVenderMedia({
        autorrelleno: auto.length,
        mediaCampos: auto.length ? (suma / auto.length).toFixed(1).replace(".", ",") : "0",
        sinMedia: filas.filter((f) => f.event_name === "vender_sin_media").length,
        ...(() => {
          const subidas = filas.filter((f) => f.event_name === "vender_subida");
          const total = subidas.reduce((t, f) => t + (Number(f.metadata?.segundos) || 0), 0);
          return {
            subidas: subidas.length,
            segundosMedia: subidas.length ? Math.round(total / subidas.length) : 0,
            conFallos: subidas.filter((f) => Number(f.metadata?.fallidos) > 0).length,
          };
        })(),
      });
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Vistos recientemente (mejora 9, 2026-11-14): en 30 días, veces que Inicio enseña el estante, toques, quitados y
  // historiales borrados, y los productos más revisitados desde ahí (ids de visto_tocado; los títulos se piden aparte).
  const [vistosUso, setVistosUso] = useState<{
    mostrado: number;
    toques: number;
    quitados: number;
    borrados: number;
    top: { id: string; titulo: string; n: number }[];
  } | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const NOMBRES = ["vistos_mostrado", "visto_tocado", "visto_quitado", "vistos_borrados"];
      const desde = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data, error } = await supabase
        .from("analytics_events")
        .select("event_name, metadata")
        .in("event_name", NOMBRES)
        .gte("created_at", desde)
        .limit(5000);
      if (!vivo) return;
      if (error || !Array.isArray(data)) {
        setVistosUso(null);
        return;
      }
      const filas = (data as { event_name: string; metadata: Record<string, unknown> | null }[]).filter((f) => NOMBRES.includes(f.event_name));
      const toques = filas.filter((f) => f.event_name === "visto_tocado");
      const veces = new Map<string, number>();
      for (const f of toques) if (typeof f.metadata?.id === "string") veces.set(f.metadata.id, (veces.get(f.metadata.id) ?? 0) + 1);
      const ids = [...veces.keys()].sort((a, b) => (veces.get(b) ?? 0) - (veces.get(a) ?? 0)).slice(0, 5);
      const titulos = new Map<string, string>();
      if (ids.length) {
        const { data: prods } = await supabase.from("products").select("id,title").in("id", ids);
        for (const p of (prods ?? []) as { id: string; title: string }[]) titulos.set(p.id, p.title);
      }
      if (!vivo) return;
      setVistosUso({
        mostrado: filas.filter((f) => f.event_name === "vistos_mostrado").length,
        toques: toques.length,
        quitados: filas.filter((f) => f.event_name === "visto_quitado").length,
        borrados: filas.filter((f) => f.event_name === "vistos_borrados").length,
        top: ids.map((id) => ({ id, titulo: titulos.get(id) ?? "Producto retirado", n: veces.get(id) ?? 0 })),
      });
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Preguntas por artículos (mejora 10, 2026-11-15): en 30 días, conversaciones abiertas desde «Preguntar por este
  // artículo», mensajes enviados, invitaciones sin cuenta, las primeras preguntas sugeridas que más se usan y los productos
  // por los que más se pregunta (ids de chat_producto_abierto; los títulos se piden aparte). Sin datos de nadie.
  const [preguntasArticulos, setPreguntasArticulos] = useState<{
    abiertos: number;
    enviados: number;
    primeras: number;
    invitaciones: number;
    enlaces: number;
    sugerencias: { texto: string; n: number }[];
    top: { id: string; titulo: string; n: number }[];
  } | null>(null);
  // Envío gratis regalado a clientes (dueño, 2026-11-23; migración 20261123160000): regalos activos, dados en 30 días,
  // pedidos que lo usaron y avisos de Blue vistos. De la base de datos (lo que hace el administrador no se mide con la
  // analítica), salvo los avisos, que son de clientes. null = sin la migración o sin poder leerlo.
  const [envioGratis, setEnvioGratis] = useState<{ activos: number; dados30: number; pedidos: number; avisos: number } | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const desde = new Date(Date.now() - 30 * 86400000).toISOString();
      const [regalos, pedidosRegalo, avisos] = await Promise.all([
        supabase.from("envio_gratis_cliente").select("id,modo,cupo_total,caduca_en,anulado_en,creado_en").limit(2000),
        supabase.from("pedidos").select("id", { count: "exact", head: true }).not("envio_gratis_id", "is", null).neq("estado", "cancelado"),
        supabase.from("analytics_events").select("id", { count: "exact", head: true }).eq("event_name", "envio_gratis_aviso").gte("created_at", desde),
      ]);
      if (!vivo) return;
      if (regalos.error || !Array.isArray(regalos.data)) {
        setEnvioGratis(null);
        return;
      }
      const filas = regalos.data as { anulado_en: string | null; caduca_en: string | null; creado_en: string }[];
      setEnvioGratis({
        activos: filas.filter((f) => !f.anulado_en && (!f.caduca_en || Date.parse(f.caduca_en) > Date.now())).length,
        dados30: filas.filter((f) => f.creado_en >= desde).length,
        pedidos: pedidosRegalo.error ? 0 : pedidosRegalo.count ?? 0,
        avisos: avisos.error ? 0 : avisos.count ?? 0,
      });
    })();
    return () => {
      vivo = false;
    };
  }, []);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const NOMBRES = ["chat_producto_abierto", "chat_producto_sugerencia", "chat_producto_enviado", "chat_producto_invitacion", "chat_enlace_tienda"];
      const desde = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data, error } = await supabase
        .from("analytics_events")
        .select("event_name, metadata")
        .in("event_name", NOMBRES)
        .gte("created_at", desde)
        .limit(5000);
      if (!vivo) return;
      if (error || !Array.isArray(data)) {
        setPreguntasArticulos(null);
        return;
      }
      const filas = (data as { event_name: string; metadata: Record<string, unknown> | null }[]).filter((f) => NOMBRES.includes(f.event_name));
      const abiertos = filas.filter((f) => f.event_name === "chat_producto_abierto");
      const enviados = filas.filter((f) => f.event_name === "chat_producto_enviado");
      const veces = new Map<string, number>();
      for (const f of abiertos) if (typeof f.metadata?.productId === "string") veces.set(f.metadata.productId, (veces.get(f.metadata.productId) ?? 0) + 1);
      const usos = new Map<string, number>();
      for (const f of filas) {
        if (f.event_name !== "chat_producto_sugerencia" || typeof f.metadata?.sugerencia !== "string") continue;
        usos.set(f.metadata.sugerencia, (usos.get(f.metadata.sugerencia) ?? 0) + 1);
      }
      const ids = [...veces.keys()].sort((a, b) => (veces.get(b) ?? 0) - (veces.get(a) ?? 0)).slice(0, 5);
      const titulos = new Map<string, string>();
      if (ids.length) {
        const { data: prods } = await supabase.from("products").select("id,title").in("id", ids);
        for (const p of (prods ?? []) as { id: string; title: string }[]) titulos.set(p.id, p.title);
      }
      if (!vivo) return;
      setPreguntasArticulos({
        abiertos: abiertos.length,
        enviados: enviados.length,
        primeras: enviados.filter((f) => f.metadata?.primera === true).length,
        invitaciones: filas.filter((f) => f.event_name === "chat_producto_invitacion").length,
        enlaces: filas.filter((f) => f.event_name === "chat_enlace_tienda").length,
        sugerencias: [...usos.entries()].sort((a, b) => b[1] - a[1]).map(([texto, n]) => ({ texto, n })),
        top: ids.map((id) => ({ id, titulo: titulos.get(id) ?? "Producto retirado", n: veces.get(id) ?? 0 })),
      });
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Valoraciones de pedidos (mejora 11, 2026-11-15): las de 30 días (pedido_valoraciones, el administrador las lee todas;
  // sin la migración 20261115100000, null y no sale) con la referencia de su pedido para el enlace, y los eventos
  // valoracion_pedida (origen), valoracion_abierta, valoracion_enviada y valoracion_baja_chat. Sin nombres de nadie.
  const [valoraciones, setValoraciones] = useState<{
    filas: { pedidoId: string; ref: string; nota: number; comentario: string | null; creado_en: string }[];
    pedidas: { blue: number; mis_pedidos: number };
    abiertas: number;
    chats: number;
  } | null>(null);
  const [filtroNota, setFiltroNota] = useState<number | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const desde = new Date(Date.now() - 30 * 86400000).toISOString();
      const NOMBRES = ["valoracion_pedida", "valoracion_abierta", "valoracion_baja_chat"];
      const [vals, ev] = await Promise.all([
        supabase
          .from("pedido_valoraciones")
          .select("pedido_id,nota,comentario,creado_en,pedidos(numero,codigo_seguimiento)")
          .gte("creado_en", desde)
          .order("creado_en", { ascending: false })
          .limit(1000),
        supabase.from("analytics_events").select("event_name, metadata").in("event_name", NOMBRES).gte("created_at", desde).limit(5000),
      ]);
      if (!vivo) return;
      if (vals.error) {
        setValoraciones(null);
        return;
      }
      const eventos = (ev.error ? [] : ev.data ?? []) as { event_name: string; metadata: Record<string, unknown> | null }[];
      const pedida = eventos.filter((f) => f.event_name === "valoracion_pedida");
      setValoraciones({
        filas: ((vals.data ?? []) as unknown as {
          pedido_id: string;
          nota: number;
          comentario: string | null;
          creado_en: string;
          pedidos: { numero: number | null; codigo_seguimiento: string | null } | { numero: number | null; codigo_seguimiento: string | null }[] | null;
        }[]).map((v) => {
          const p = Array.isArray(v.pedidos) ? v.pedidos[0] : v.pedidos;
          return {
            pedidoId: v.pedido_id,
            ref: p?.codigo_seguimiento || (p?.numero != null ? String(p.numero) : ""),
            nota: Number(v.nota),
            comentario: v.comentario,
            creado_en: v.creado_en,
          };
        }),
        pedidas: {
          blue: pedida.filter((f) => f.metadata?.origen === "blue").length,
          mis_pedidos: pedida.filter((f) => f.metadata?.origen === "mis_pedidos").length,
        },
        abiertas: eventos.filter((f) => f.event_name === "valoracion_abierta").length,
        chats: eventos.filter((f) => f.event_name === "valoracion_baja_chat").length,
      });
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Velocidad de la tienda (carga rápida, mejora 7 del 2026-11-14): eventos rendimiento_carga de 30 días (lib/analiticaPropia.ts →
  // medirCargaPantalla: ms hasta la primera pantalla útil, pantalla y ancho por tramos). Mediana y percentil 75 (por rango:
  // el valor que deja por debajo la mitad o tres cuartos de las visitas) por pantalla y por móvil/tableta/ordenador; solo
  // las combinaciones con visitas.
  const [velocidad, setVelocidad] = useState<{ pantalla: string; ancho: string; n: number; mediana: number; p75: number }[] | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const desde = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data, error } = await supabase
        .from("analytics_events")
        .select("event_name, metadata")
        .eq("event_name", "rendimiento_carga")
        .gte("created_at", desde)
        .limit(5000);
      if (!vivo) return;
      if (error || !Array.isArray(data)) {
        setVelocidad(null);
        return;
      }
      const grupos = new Map<string, number[]>();
      for (const f of data as { event_name: string; metadata: Record<string, unknown> | null }[]) {
        const ms = Number(f.metadata?.ms);
        const pantalla = String(f.metadata?.pantalla ?? "");
        const ancho = String(f.metadata?.ancho ?? "");
        if (f.event_name !== "rendimiento_carga" || !(ms > 0) || !PANTALLAS_VELOCIDAD.includes(pantalla) || !ANCHOS_VELOCIDAD.includes(ancho)) continue;
        const clave = `${pantalla}|${ancho}`;
        grupos.set(clave, [...(grupos.get(clave) ?? []), ms]);
      }
      const rango = (lista: number[], q: number) => lista[Math.max(0, Math.ceil(q * lista.length) - 1)];
      const filas = [];
      for (const pantalla of PANTALLAS_VELOCIDAD) {
        for (const ancho of ANCHOS_VELOCIDAD) {
          const lista = (grupos.get(`${pantalla}|${ancho}`) ?? []).sort((a, b) => a - b);
          if (lista.length) filas.push({ pantalla, ancho, n: lista.length, mediana: rango(lista, 0.5), p75: rango(lista, 0.75) });
        }
      }
      setVelocidad(filas);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Avisos de Blue solo con cuenta (dueño, 2026-11-11): cuántas cuentas tienen activados los avisos de artículos nuevos.
  // Solo el número (HEAD, sin filas ni datos de nadie) y sin la cuenta del administrador. null = no se ha podido contar.
  const [cuentasAvisosNovedades, setCuentasAvisosNovedades] = useState<number | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        let consulta = supabase.from("preferencias_usuario").select("user_id", { count: "exact", head: true }).eq("avisos_novedades", true);
        if (s.session?.user?.id) consulta = consulta.neq("user_id", s.session.user.id);
        const { count, error } = await consulta;
        if (vivo) setCuentasAvisosNovedades(error ? null : count ?? 0);
      } catch {
        if (vivo) setCuentasAvisosNovedades(null);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Perfiles con teléfono (dueño, 2026-11-13): solo el número (HEAD, sin filas ni teléfonos) y sin la cuenta del
  // administrador. null = la columna aún no existe (migración 20261113120000_perfil_telefono.sql).
  const [perfilesConTelefono, setPerfilesConTelefono] = useState<number | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        let consulta = supabase.from("perfiles_cliente").select("user_id", { count: "exact", head: true }).not("telefono", "is", null);
        if (s.session?.user?.id) consulta = consulta.neq("user_id", s.session.user.id);
        const { count, error } = await consulta;
        if (vivo) setPerfilesConTelefono(error ? null : count ?? 0);
      } catch {
        if (vivo) setPerfilesConTelefono(null);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Clientes conectados en los últimos 7 días y cuántos con la app instalada (tabla cliente_dispositivos, migración
  // 20261112120000): solo dos recuentos de personas distintas, sin la cuenta del administrador. null = aún no existe.
  const [conectados7, setConectados7] = useState<{ clientes: number; app: number } | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        const yo = s.session?.user?.id ?? "";
        const desde = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data, error } = await supabase.from("cliente_dispositivos").select("user_id,app_instalada").gte("ultima_vez", desde).limit(10000);
        if (!vivo) return;
        if (error) return setConectados7(null);
        const filas = ((data ?? []) as { user_id: string; app_instalada: boolean }[]).filter((f) => f.user_id !== yo);
        setConectados7({
          clientes: new Set(filas.map((f) => f.user_id)).size,
          app: new Set(filas.filter((f) => f.app_instalada).map((f) => f.user_id)).size,
        });
      } catch {
        if (vivo) setConectados7(null);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const topes = useMemo(() => {
    if (!ritmo) return null;
    const hoy = madridDateStr(new Date());
    const deHoy = ritmo.find((r) => r.dia === hoy);
    return {
      ...topesAnalitica(ritmo, hoy),
      hoy: deHoy?.eventos ?? 0,
      cortadosHoy: deHoy?.cortados ?? 0,
      cortados30: ritmo.filter((r) => r.dia > madridDateStr(new Date(Date.now() - 30 * 86400000))).reduce((s, r) => s + r.cortados, 0),
    };
  }, [ritmo]);

  // «Contratar servicio» (components/ContratarServicioModal.tsx): por servicio, cuántas sesiones abren la ventana, cuántas
  // envían y cuántas la cierran sin enviar; qué faltaba al intentar enviar y qué opción (Básica, Completa…) se elige más.
  const contratarServicio = useMemo(() => {
    const porPrefijo = (prefijo: string) =>
      funnel.filter((f) => f.step_label.startsWith(prefijo)).map((f) => ({ clave: f.step_label.slice(prefijo.length), n: f.sessions }));
    const abiertas = porPrefijo("Contratar: ventana abierta · ");
    const enviadas = new Map(porPrefijo("Contratar: solicitud enviada · ").map((x) => [x.clave, x.n]));
    const cerradas = new Map(porPrefijo("Contratar: cerrada sin enviar · ").map((x) => [x.clave, x.n]));
    const servicios = abiertas
      .map((a) => {
        const env = enviadas.get(a.clave) ?? 0;
        return { titulo: a.clave, abiertas: a.n, enviadas: env, cerradas: cerradas.get(a.clave) ?? 0, pct: a.n ? Math.round((env / a.n) * 100) : 0 };
      })
      .sort((x, y) => y.abiertas - x.abiertas);
    const faltaba = porPrefijo("Contratar: le faltaba · ").sort((x, y) => y.n - x.n);
    const opciones = porPrefijo("Servicio: opción elegida · ").sort((x, y) => y.n - x.n);
    // «Nuestros Servicios» (app/servicios.tsx): qué vídeos se ven (cada uno por su título o su red).
    const videos = porPrefijo("Nuestros Servicios: vídeo visto · ").sort((x, y) => y.n - x.n);
    // Reparación por envío (components/ContratarServicioModal.tsx y app/(tabs)/perfil.tsx), en sesiones.
    const exacto = (l: string) => funnel.find((f) => f.step_label === l)?.sessions ?? 0;
    const envio = {
      correosElegido: exacto("Contratar: envío por Correos elegido"),
      solicitada: exacto("Reparación por envío: solicitada"),
      etiquetaDescargada: exacto("Reparación por envío: etiqueta descargada"),
      presupuestoAceptado: exacto("Reparación por envío: presupuesto aceptado"),
      // Parte 2 (app/(tabs)/perfil.tsx).
      tarjeta:
        exacto("Reparación por envío: pago con tarjeta · etiqueta") + exacto("Reparación por envío: pago con tarjeta · reparación"),
      tarjetaOk: exacto("Reparación por envío: pago con tarjeta confirmado"),
      avisos: exacto("Reparación por envío: aviso de pago · etiqueta") + exacto("Reparación por envío: aviso de pago · reparación"),
      comprar: exacto("Reparación por envío: sin arreglo · te lo compramos"),
      devolver: exacto("Reparación por envío: sin arreglo · devuélvemelo"),
      garantia: exacto("Reparación por envío: garantía pedida"),
    };
    return { servicios, faltaba, opciones, videos, envio };
  }, [funnel]);

  // Recorrido principal: agrupa por prefijo de step_label para armar un
  // embudo de 4 pasos fijos, sin que cada categoría/producto distinto rompa
  // el embudo en decenas de filas.
  const coreFunnel = useMemo(() => {
    const findExact = (label: string) => funnel.find((f) => f.step_label === label)?.sessions ?? 0;
    const sumStartingWith = (prefix: string) =>
      funnel.filter((f) => f.step_label.startsWith(prefix)).reduce((acc, f) => acc + f.sessions, 0);

    const inicio = findExact("Inicio");
    const categoria = sumStartingWith("Categoría");
    const producto = sumStartingWith("Producto");
    const resenas = findExact("Reseñas");
    const scroll = findExact("Scroll");

    const steps = [
      { label: "Inicio", sessions: inicio },
      { label: "Categoría", sessions: categoria },
      { label: "Producto", sessions: producto },
      { label: "Reseñas", sessions: resenas },
    ];

    const top = steps[0].sessions;
    return {
      steps: steps.map((s) => ({
        ...s,
        dropPct: top > 0 ? Math.round((1 - s.sessions / top) * 100) : 0,
      })),
      scroll,
      // Bienvenida al abrir la tienda (app/_layout.tsx): cuántas sesiones la ven, en cuánto estaba lista la tienda debajo,
      // quién la quita antes con un toque y cuántas empiezan en Inicio aunque se abrieran por otra sección.
      bienvenida: findExact("Bienvenida: vista"),
      bienvenidaRapida: findExact("Bienvenida: tienda lista en menos de 1 s"),
      bienvenidaMedia: findExact("Bienvenida: tienda lista entre 1 y 3 s"),
      bienvenidaLenta: findExact("Bienvenida: tienda lista en más de 3 s"),
      bienvenidaSaltada: findExact("Bienvenida: saltada con un toque"),
      bienvenidaInicio: findExact("Bienvenida: empieza en Inicio"),
      // Visor de fotos de la ficha (components/VisorFotos.tsx): quién amplía y quién llega a usar el zoom.
      fotoAmpliada: findExact("Ficha: foto ampliada"),
      fotoZoom: findExact("Ficha: zoom en la foto"),
      // Ficha de servicio (app/servicio/[id].tsx, con el formato de la de producto): fotos ampliadas y sus dos botones.
      servicioFoto: findExact("Servicio: foto ampliada"),
      // Filtros del catálogo (components/FiltrosCatalogo.tsx, icono junto al buscador): abiertos y aplicados.
      // Botones de la tienda que ofrece Blue IA (app/(tabs)/blue-ia.tsx): mostrados, tocados y cuáles se tocan más.
      blueBotonesMostrados: sumStartingWith("Blue IA: botón mostrado"),
      blueBotonesTocados: sumStartingWith("Blue IA: botón tocado"),
      blueBotonesTop: funnel
        .filter((f) => f.step_label.startsWith("Blue IA: botón tocado · "))
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 4)
        .map((f) => `${f.step_label.replace("Blue IA: botón tocado · ", "")} ${f.sessions}`),
      filtrosAbiertos: findExact("Filtros: abiertos"),
      filtrosCategoria: findExact("Filtros: aplicados en una categoría"),
      filtrosCatalogo: findExact("Filtros: aplicados en el catálogo"),
      servicioContratar: findExact("Servicio: Contratar servicio ahora"),
      servicioPreguntar: findExact("Servicio: Preguntar por este servicio"),
      // «Me gusta»: la pestaña de Perfil (app/(tabs)/perfil.tsx) y los dados a servicios (app/servicio/[id].tsx).
      meGustaPestana: findExact("Perfil: Me gusta"),
      meGustaServicio: findExact("Servicio: me gusta"),
      // Facturas de VeoAura descargadas por los clientes en «Mis pedidos» (app/(tabs)/perfil.tsx).
      facturaDescargada: findExact("Pedidos: factura descargada"),
      // Las facturas desde Blue IA (app/(tabs)/blue-ia.tsx, 2026-11-11): «Ver mis facturas» y «Descargar factura» ahí mismo.
      blueVerFacturas: findExact("Blue: ver mis facturas"),
      blueFacturaDescargada: findExact("Blue: factura descargada"),
      // «Mis seguimientos» en el móvil (2026-11-10): el campo del número va plegado; cuántos lo abren y cuántos lo añaden.
      numeroAbierto: findExact("Perfil: abre «añadir número de seguimiento»"),
      numeroAnadido: findExact("Perfil: número de seguimiento añadido"),
      // Teléfono opcional de Mi perfil (2026-11-13): quién lo guarda y quién paga con el del perfil ya rellenado.
      telefonoGuardado: findExact("Perfil: teléfono guardado"),
      telefonoPago: findExact("Pago: teléfono del perfil usado"),
      // Filtros de «Mis pedidos» (2026-11-10): cuántas sesiones usan cada uno.
      filtrosPedidos: funnel
        .filter((f) => f.step_label.startsWith("Perfil: filtro de pedidos · "))
        .map((f) => `${f.step_label.slice("Perfil: filtro de pedidos · ".length)} ${f.sessions}`)
        .join(" · "),
      // Reseñas de servicios terminados: «Valorar el servicio» en «Mis seguimientos» y las publicadas.
      resenaServicioPedida: findExact("Seguimientos: valorar el servicio"),
      resenaServicioPublicada: findExact("Reseña de servicio publicada"),
      // «Blue, ayúdame a elegir un artículo» de la Cesta (app/(tabs)/cesta.tsx): abre Blue IA con la pregunta enviada.
      blueElegir: findExact("Cesta: Blue, ayúdame a elegir"),
      // Blue flotante (components/AsistenteBlue.tsx): solo sale en Inicio y en las fichas; en cuál lo abren.
      blueInicio: findExact("Blue flotante: abierto en Inicio"),
      blueFichaProducto: findExact("Blue flotante: abierto en la ficha de producto"),
      blueFichaServicio: findExact("Blue flotante: abierto en la ficha de servicio"),
      // «Activa los avisos de noticias» del panel de Blue (se activan con un toque).
      blueAvisosNoticias: findExact("Blue: avisos de noticias activados"),
      // Avisos de bajadas de precio y artículos nuevos solo con cuenta: «Crear cuenta gratis» y las cuentas creadas después.
      blueCuentaAvisos: findExact("Blue: crear cuenta por avisos"),
      blueCuentaAvisosCreada: findExact("Blue: cuenta creada tras «Crear cuenta gratis» (avisos)"),
      // El aviso de una noticia nueva abre esa noticia; y cómo acaban los mensajes de Blue (se cierran solos a los 12 s).
      blueAvisoNoticia: findExact("Blue: noticia abierta desde el aviso"),
      blueMensajeTocado: findExact("Blue: mensaje tocado"),
      blueMensajeCerrado: findExact("Blue: mensaje cerrado con la X"),
      blueMensajeSolo: findExact("Blue: mensaje se cierra solo"),
      // Blue IA (app/(tabs)/blue-ia.tsx): quién vuelve y sigue su última conversación y quién empieza una nueva.
      blueRetomada: findExact("Blue IA: conversación retomada"),
      blueNueva: findExact("Blue IA: nueva conversación"),
      // Modelo mixto (api/blue-ia.ts, 2026-11-26): qué modelo ha contestado.
      blueModeloAvanzado: findExact("Blue IA: respuesta · modelo avanzado"),
      blueModeloBase: findExact("Blue IA: respuesta · modelo base"),
      // Botones de artículos de Blue IA (2026-11-26): el nombrado en la respuesta o uno de los «similares».
      blueArticuloNombrado: findExact("Blue IA: artículo tocado · nombrado"),
      blueArticuloSimilar: findExact("Blue IA: artículo tocado · similar"),
      // Pastilla «¿Cuál es el horario de atención?» (2026-11-26): sustituye al horario fijo junto al recuadro.
      bluePastillaHorario: findExact("Blue IA: pastilla del horario"),
      // Historial de Blue IA (2026-11-26): archivar, recuperar desde «Archivadas» y «Deshacer».
      blueArchivadas: findExact("Blue IA: conversación archivada"),
      blueRecuperadas: findExact("Blue IA: conversación recuperada · archivadas"),
      blueDeshechas: findExact("Blue IA: conversación recuperada · deshacer"),
      // «Quiénes somos» (app/quienes-somos.tsx): quién la ve y cuántos llegan desde Inicio o desde entrar/crear cuenta.
      quienesVista: findExact("Quiénes somos: vista"),
      quienesInicio: findExact("Quiénes somos: desde Inicio"),
      quienesAcceso: findExact("Quiénes somos: desde el acceso"),
      // Desde el 2026-11-26, en ese sitio de Perfil va «¿Tienes una consola…? Te lo tasamos en menos de 30 minutos».
      perfilVender: findExact("Vender: desde Perfil"),
      // Cierre de Inicio (2026-11-26): la franja antes del pie, «Vender ahora» y «Ver catálogo».
      cierreVender: findExact("Cierre de Inicio: Vender ahora"),
      cierreCatalogo: findExact("Cierre de Inicio: Ver catálogo"),
      // Oferta de la semana (Inicio, 2026-11-26): qué se toca en la tarjeta (como en la ficha de producto).
      ofertaComprar: findExact("Oferta de la semana: comprar ya"),
      ofertaCesta: findExact("Oferta de la semana: añadir a la cesta"),
      ofertaFotos: findExact("Oferta de la semana: ver fotos en grande"),
      ofertaCompartir: findExact("Oferta de la semana: compartir"),
      ofertaMeGusta: findExact("Oferta de la semana: me gusta"),
      ofertaFicha: findExact("Oferta de la semana: ver ficha"),
      // Tira de noticias en Inicio, Perfil y Cesta (2026-11-27): cuántos la ven y cuántos entran a una noticia.
      noticiasRecientesVistas: findExact("Noticias en estantes: recientes que podrían interesarte · vistas"),
      noticiasRecientesTocadas: findExact("Noticias en estantes: recientes que podrían interesarte · tocada"),
      // Barra fija de abajo en la página de cada noticia (app/noticias/[id].tsx, 2026-11-27).
      noticiaBarraMeGusta: findExact("Noticias: barra · me gusta"),
      noticiaBarraComentar: findExact("Noticias: comentar en el Foro"),
      noticiaBarraCompartir: findExact("Noticias: barra · compartir"),
      noticiaBarraVolver: findExact("Noticias: barra · volver"),
      // Blue IA fuera del horario del equipo (app/(tabs)/blue-ia.tsx): quién pulsa «Hablar con el equipo» y qué hace.
      fueraHorarioAviso: findExact("Blue IA: fuera de horario, aviso"),
      fueraHorarioBlue: findExact("Blue IA: fuera de horario, sigue con Blue"),
      fueraHorarioEscribe: findExact("Blue IA: fuera de horario, escribe al equipo"),
    };
  }, [funnel]);

  // Redes sociales (lib/analiticaPropia.ts → medirLlegadaDesdeRedes / medirCuentaCreada): visitas que llegan de Instagram y de
  // TikTok, cuántas de ellas crean una cuenta y todas las cuentas creadas, para ver qué red funciona mejor.
  const redes = useMemo(() => {
    const exacto = (label: string) => funnel.find((f) => f.step_label === label)?.sessions ?? 0;
    const fila = (red: string, nombre: string) => {
      const llegadas = exacto(`Redes: llegada desde ${nombre}`);
      const registros = exacto(`Redes: registro desde ${nombre}`);
      return { red, nombre, llegadas, registros, pct: llegadas > 0 ? Math.round((registros / llegadas) * 100) : 0 };
    };
    const filas = [fila("instagram", "Instagram"), fila("tiktok", "TikTok")];
    const [a, b] = filas;
    const mejor =
      a.registros !== b.registros
        ? (a.registros > b.registros ? a : b).nombre
        : a.llegadas !== b.llegadas
          ? (a.llegadas > b.llegadas ? a : b).nombre
          : null;
    return { filas, mejor, cuentas: exacto("Registro: cuenta creada") };
  }, [funnel]);

  // Noticias con página propia (app/noticias/[id].tsx): páginas vistas por categoría, el índice, «Comentar en el Foro»
  // y las visitas que ENTRAN por una noticia desde un buscador (solo el nombre del buscador, lib/analiticaPropia.ts).
  const noticiasOrganicas = useMemo(() => {
    const porPrefijo = (prefijo: string) =>
      funnel
        .filter((f) => f.step_label.startsWith(prefijo))
        .map((f) => ({ clave: f.step_label.slice(prefijo.length), n: f.sessions }))
        .sort((a, b) => b.n - a.n);
    const exacto = (label: string) => funnel.find((f) => f.step_label === label)?.sessions ?? 0;
    const categorias = porPrefijo("Noticias: página vista · ");
    const buscadores = porPrefijo("Noticias: llegada desde buscador · ");
    return {
      categorias,
      vistas: categorias.reduce((s, c) => s + c.n, 0),
      buscadores,
      google: buscadores.find((b) => b.clave === "Google")?.n ?? 0,
      desdeBuscadores: buscadores.reduce((s, b) => s + b.n, 0),
      indice: exacto("Noticias: índice visto"),
      comentar: exacto("Noticias: comentar en el Foro"),
    };
  }, [funnel]);

  // Guía de Blue y formulario de Vender: pasos de la guía (en orden), cómo termina y qué pasa
  // después en el formulario (abierto y enviado, y de ellos cuántos venían de la guía).
  const guiaVender = useMemo(() => {
    const filas = (prefijo: string) =>
      funnel
        .filter((f) => f.step_label.startsWith(prefijo))
        .sort((a, b) => a.step_label.localeCompare(b.step_label));
    const pasos = filas("Guía Blue: ").filter((f) => /^Guía Blue: \d\d /.test(f.step_label));
    const exacto = (label: string) => funnel.find((f) => f.step_label === label)?.sessions ?? 0;
    const empiezan = pasos[0]?.sessions ?? 0;
    const desdeGuia = exacto("Vender: abierto desde la guía");
    // En qué paso se salta la guía (los que más gente pierden, primero).
    const prefijoSalto = "Guía Blue: saltada en el paso ";
    const saltadaEn = funnel
      .filter((f) => f.step_label.startsWith(prefijoSalto))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 6);
    return {
      pasos,
      empiezan,
      saltadaEn,
      completada: exacto("Guía Blue: completada"),
      saltada: exacto("Guía Blue: saltada"),
      abierto: exacto("Vender: abierto"),
      abiertoGuia: desdeGuia,
      enviado: exacto("Vender: enviado"),
      enviadoGuia: exacto("Vender: enviado desde la guía"),
    };
  }, [funnel]);

  const topCategories = useMemo(
    () =>
      funnel
        .filter((f) => f.step_label.startsWith("Categoría ") && f.step_label !== "Categoría")
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 8),
    [funnel]
  );

  const topProducts = useMemo(
    () =>
      funnel
        .filter((f) => f.step_label.startsWith("Producto "))
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 8),
    [funnel]
  );

  const maxDailyVisitors = useMemo(
    () => daily.reduce((acc, d) => Math.max(acc, d.visitors), 0),
    [daily]
  );

  const conversionTotals = useMemo(() => {
    const totalsAcc = emptyConversionCounts();
    for (const d of conversions) {
      for (const c of CONVERSION_EVENTS) totalsAcc[c.key] += d[c.key];
    }
    return totalsAcc;
  }, [conversions]);

  const rangeLabel = useMemo(() => {
    if (fromDate === toDate) return `${fromDate} (hora de Madrid)`;
    return `${fromDate} → ${toDate} (hora de Madrid)`;
  }, [fromDate, toDate]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      {/* Cabecera fija y compacta (volver al panel + título centrado). El filtro de fechas
          va dentro del scroll: fijo arriba ocupaba casi media pantalla del móvil. */}
      <CabeceraPanel title="Visitas y métricas" isMobile={isMobile} />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 48 + insets.bottom, alignItems: "center" }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={CIERRE_TECLADO}
        >
        <View style={{ width: "100%", maxWidth: 1040, gap: isMobile ? 18 : 22 }}>
          {/* 1) Las cifras del rango elegido (lo primero que se ve; mientras cargan, «…»). */}
          <FilaCifras nativeID="analitica-cifras">
            {(
              [
                ["visitantes", "Visitantes", totals?.total_sessions, "people-outline"],
                ["paginas", "Páginas vistas", totals?.total_pageviews, "eye-outline"],
                ["eventos", "Eventos totales", totals?.total_events, "pulse-outline"],
                ["cuenta", "Con cuenta", totals?.registered_visitors, "person-circle-outline"],
              ] as const
            ).map(([id, etiqueta, valor, icono]) => (
              <Cifra key={id} nativeID={`analitica-cifra-${id}`} valor={loading ? "…" : String(valor ?? 0)} etiqueta={etiqueta} icono={icono} ancho={isMobile ? "45%" : 0} />
            ))}
          </FilaCifras>

          <Detalle>Visitantes, recorrido por la tienda y crecimiento en el rango de fechas elegido.</Detalle>

          <View
            nativeID="analitica-fechas"
            // Sin recuadro: las pastillas del móvil se deslizan de borde a borde (FilaPastillas).
            style={{ gap: 12 }}
          >
            <FilaPastillas isMobile={isMobile} nativeID="analitica-rangos">
              <ChipButton label="Hoy" active={preset === "today"} onPress={() => applyPreset("today")} />
              <ChipButton label="7 días" active={preset === "7d"} onPress={() => applyPreset("7d")} />
              <ChipButton label="30 días" active={preset === "30d"} onPress={() => applyPreset("30d")} />
              <ChipButton label="90 días" active={preset === "90d"} onPress={() => applyPreset("90d")} />
              <ChipButton label="Todo" active={preset === "all"} onPress={() => applyPreset("all")} />
            </FilaPastillas>

            <View style={{ flexDirection: isMobile ? "column" : "row", gap: 8, alignItems: isMobile ? "stretch" : "center" }}>
              <TextInput
                value={fromDraft}
                onChangeText={setFromDraft}
                placeholder="Desde (AAAA-MM-DD)"
                placeholderTextColor="rgba(11,33,56,0.40)"
                autoCapitalize="none"
                style={{
                  flex: 1,
                  // 48 px de alto (CAMPO, grupo 2 de tamaños): antes 40.
                  minHeight: CAMPO.alto,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: COLORS.text,
                  backgroundColor: "#F8FBFE",
                  // 16 px: con menos, Safari (iPhone) hace zoom al enfocar y la pantalla
                  // se queda ampliada y "descuadrada".
                  fontSize: CAMPO.letra,
                }}
              />
              <TextInput
                value={toDraft}
                onChangeText={setToDraft}
                placeholder="Hasta (AAAA-MM-DD)"
                placeholderTextColor="rgba(11,33,56,0.40)"
                autoCapitalize="none"
                style={{
                  flex: 1,
                  minHeight: CAMPO.alto,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: COLORS.text,
                  backgroundColor: "#F8FBFE",
                  fontSize: CAMPO.letra,
                }}
              />
              <Pressable
                onPress={applyCustomRange}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  opacity: pressed ? 0.9 : 1,
                  minHeight: CAMPO.alto,
                  justifyContent: "center",
                  borderRadius: 999,
                  paddingVertical: 11,
                  paddingHorizontal: 18,
                  backgroundColor: COLORS.accentDark,
                  alignItems: "center",
                })}
              >
                <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>Aplicar</Text>
              </Pressable>
            </View>

            {!!dateErr && (
              <Text style={{ color: COLORS.danger, fontWeight: "700", fontSize: TAMANOS.minimo }}>
                {dateErr}
              </Text>
            )}

            <Text nativeID="analitica-rango" style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, fontWeight: "700" }}>
              Rango actual: {rangeLabel}
            </Text>
          </View>

          {!!screenErr && <AvisoPanel tone="danger" text={screenErr} />}

          {/* Al cambiar el rango solo se recargan los datos: el filtro sigue a la vista. */}
          {loading ? (
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 32 }}>
              <CargaMarca texto="Cargando métricas…" />
            </View>
          ) : (
          <>

            <SectionCard
              title="Crecimiento de visitantes"
              subtitle="Visitantes distintos por día en el rango elegido."
            >
              {daily.length === 0 ? (
                <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
                  Todavía no hay visitas registradas en este rango de fechas.
                </Text>
              ) : (
                <View style={{ gap: 8 }}>
                  {daily.map((d) => (
                    <BarRow
                      key={d.day}
                      label={fmtDayLabel(d.day)}
                      value={d.visitors}
                      maxValue={maxDailyVisitors}
                      color={COLORS.accent}
                    />
                  ))}
                </View>
              )}
            </SectionCard>

            <SectionCard
              title="Recorrido principal"
              subtitle="Sesiones que llegan a cada paso del recorrido (Inicio → Categoría → Producto → Reseñas). El % es la caída respecto a Inicio."
            >
              {coreFunnel.steps[0].sessions === 0 ? (
                <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
                  Todavía no hay recorrido registrado en este rango de fechas.
                </Text>
              ) : (
                <View style={{ gap: 10 }}>
                  {coreFunnel.steps.map((s) => (
                    <BarRow
                      key={s.label}
                      label={s.dropPct > 0 ? `${s.label} (-${s.dropPct}%)` : s.label}
                      value={s.sessions}
                      maxValue={coreFunnel.steps[0].sessions}
                      color={COLORS.accentDark}
                    />
                  ))}

                  <View
                    style={{
                      marginTop: 4,
                      borderRadius: 14,
                      backgroundColor: COLORS.accent2,
                      padding: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="swap-vertical-outline" size={15} color={COLORS.accentDark} />
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Sesiones con scroll (en cualquier punto del recorrido): {coreFunnel.scroll}
                    </Text>
                  </View>
                  <View
                    nativeID="analitica-bienvenida"
                    style={{
                      borderRadius: 14,
                      backgroundColor: COLORS.accent2,
                      padding: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="hand-left-outline" size={15} color={COLORS.accentDark} />
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Pantalla de bienvenida: la ven {coreFunnel.bienvenida} {coreFunnel.bienvenida === 1 ? "sesión" : "sesiones"} · la
                      tienda estaba lista en menos de 1 s: {coreFunnel.bienvenidaRapida} · entre 1 y 3 s: {coreFunnel.bienvenidaMedia} · en más
                      de 3 s: {coreFunnel.bienvenidaLenta} · la quitan antes con un toque: {coreFunnel.bienvenidaSaltada} · empiezan en Inicio
                      aunque la abrieran por otra sección: {coreFunnel.bienvenidaInicio}
                    </Text>
                  </View>
                  {/* Topes automáticos de la analítica: cuánto se ha guardado hoy, los topes de hoy (se ajustan solos con las
                      visitas) y lo que se ha cortado. Sin la migración, lo dice. */}
                  <View
                    nativeID="analitica-topes"
                    style={{
                      borderRadius: 14,
                      backgroundColor: COLORS.accent2,
                      padding: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="speedometer-outline" size={15} color={COLORS.accentDark} />
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      {topes
                        ? `Topes automáticos de la analítica: hoy ${topes.hoy.toLocaleString("es-ES")} eventos guardados de un máximo de ${topes.porDia.toLocaleString("es-ES")} · ${topes.porMinuto.toLocaleString("es-ES")} por minuto · ${topes.porSesion} por persona y minuto · cortados hoy ${topes.cortadosHoy} (30 días: ${topes.cortados30}). Se ajustan solos: 3 veces el día con más visitas del último mes.`
                        : "Topes automáticos de la analítica: aún sin activar (falta pegar en Supabase la migración 20261018150000_analitica_topes.sql)."}
                    </Text>
                  </View>
                  <View
                    nativeID="analitica-visor-fotos"
                    style={{
                      borderRadius: 14,
                      backgroundColor: COLORS.accent2,
                      padding: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="expand-outline" size={15} color={COLORS.accentDark} />
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Fotos de la ficha ampliadas: {coreFunnel.fotoAmpliada} sesiones · con zoom: {coreFunnel.fotoZoom}
                    </Text>
                  </View>
                  <View
                    nativeID="analitica-ficha-servicio"
                    style={{
                      borderRadius: 14,
                      backgroundColor: COLORS.accent2,
                      padding: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="construct-outline" size={15} color={COLORS.accentDark} />
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Fichas de servicio: fotos ampliadas {coreFunnel.servicioFoto} · «Contratar servicio ahora» {coreFunnel.servicioContratar} · «Preguntar por este servicio» {coreFunnel.servicioPreguntar} · «Valorar el servicio» {coreFunnel.resenaServicioPedida} · reseñas publicadas {coreFunnel.resenaServicioPublicada} (sesiones)
                    </Text>
                  </View>
                  <View
                    nativeID="analitica-contratar-servicio"
                    style={{
                      borderRadius: 14,
                      backgroundColor: COLORS.accent2,
                      padding: 10,
                      flexDirection: "row",
                      alignItems: "flex-start",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="funnel-outline" size={15} color={COLORS.accentDark} />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo }}>
                        Contratar servicio: abrió la ventana → envió (sesiones)
                      </Text>
                      {contratarServicio.servicios.length ? (
                        contratarServicio.servicios.slice(0, 8).map((s) => (
                          <Text key={s.titulo} style={{ color: COLORS.text, fontSize: TAMANOS.minimo }}>
                            {s.titulo}: {s.abiertas} → {s.enviadas} ({s.pct} %) · cerradas sin enviar {s.cerradas}
                          </Text>
                        ))
                      ) : (
                        <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo }}>Aún nadie ha abierto la ventana en este periodo.</Text>
                      )}
                      {contratarServicio.faltaba.length ? (
                        <Text style={{ color: COLORS.text, fontSize: TAMANOS.minimo }}>
                          Lo que faltaba al intentar enviar: {contratarServicio.faltaba.map((f) => `${f.clave} ${f.n}`).join(" · ")}
                        </Text>
                      ) : null}
                      {contratarServicio.opciones.length ? (
                        <Text style={{ color: COLORS.text, fontSize: TAMANOS.minimo }}>
                          Opciones elegidas en la ficha: {contratarServicio.opciones.map((o) => `${o.clave} ${o.n}`).join(" · ")}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View
                    nativeID="analitica-reparacion-envio"
                    style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}
                  >
                    <Ionicons name="cube-outline" size={15} color={COLORS.accentDark} />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo }}>Reparación por envío</Text>
                      {embudoEnvio ? (
                        <Text nativeID="analitica-reparacion-envio-bd" style={{ color: COLORS.text, fontSize: TAMANOS.minimo }}>
                          En total: solicitadas {embudoEnvio.solicitadas} → etiqueta pagada {embudoEnvio.pagadas} → recibidas {embudoEnvio.recibidas} → presupuesto aceptado {embudoEnvio.aceptadas}
                        </Text>
                      ) : (
                        <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo }}>Aún sin datos (falta aplicar su migración o no hay ninguna).</Text>
                      )}
                      <Text nativeID="analitica-reparacion-envio-sesiones" style={{ color: COLORS.text, fontSize: TAMANOS.minimo }}>
                        En este periodo (sesiones): eligen Correos {contratarServicio.envio.correosElegido} · la solicitan {contratarServicio.envio.solicitada} · descargan la etiqueta {contratarServicio.envio.etiquetaDescargada} · aceptan el presupuesto {contratarServicio.envio.presupuestoAceptado}
                      </Text>
                      {embudoEnvio2 ? (
                        <>
                          <Text nativeID="analitica-reparacion-envio-bd2" style={{ color: COLORS.text, fontSize: TAMANOS.minimo }}>
                            Después: pagadas {embudoEnvio2.cobradas} → enviadas {embudoEnvio2.enviadas} · sin arreglo {embudoEnvio2.sinArreglo} (compradas {embudoEnvio2.compradas}, devueltas {embudoEnvio2.devueltas}) · garantías abiertas {embudoEnvio2.garantias}
                          </Text>
                          <Text nativeID="analitica-reparacion-envio-sesiones2" style={{ color: COLORS.text, fontSize: TAMANOS.minimo }}>
                            Cobros (sesiones): abren el pago con tarjeta {contratarServicio.envio.tarjeta} · confirmados {contratarServicio.envio.tarjetaOk} · avisan de Bizum o transferencia {contratarServicio.envio.avisos} · «Te lo compramos» {contratarServicio.envio.comprar} · «Devuélvemelo» {contratarServicio.envio.devolver} · garantías pedidas {contratarServicio.envio.garantia}
                          </Text>
                        </>
                      ) : null}
                    </View>
                  </View>
                  <View
                    nativeID="analitica-videos-servicios"
                    style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}
                  >
                    <Ionicons name="play-circle-outline" size={15} color={COLORS.accentDark} />
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Nuestros Servicios (vídeos vistos, sesiones):{" "}
                      {contratarServicio.videos.length
                        ? contratarServicio.videos.map((v) => `${v.clave} ${v.n}`).join(" · ")
                        : "aún nadie ha visto un vídeo en este periodo."}
                    </Text>
                  </View>
                  <View
                    nativeID="analitica-blue-botones"
                    style={{
                      borderRadius: 14,
                      backgroundColor: COLORS.accent2,
                      padding: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="sparkles-outline" size={15} color={COLORS.accentDark} />
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Botones de Blue IA: mostrados {coreFunnel.blueBotonesMostrados} · tocados {coreFunnel.blueBotonesTocados}
                      {coreFunnel.blueBotonesTop.length ? ` · más tocados: ${coreFunnel.blueBotonesTop.join(", ")}` : ""} (sesiones)
                    </Text>
                  </View>
                  <View
                    nativeID="analitica-filtros"
                    style={{
                      borderRadius: 14,
                      backgroundColor: COLORS.accent2,
                      padding: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="options-outline" size={15} color={COLORS.accentDark} />
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Filtros del catálogo: abiertos {coreFunnel.filtrosAbiertos} · aplicados dentro de una categoría {coreFunnel.filtrosCategoria} · en el catálogo {coreFunnel.filtrosCatalogo} (sesiones)
                    </Text>
                  </View>
                  <View
                    nativeID="analitica-me-gusta"
                    style={{
                      borderRadius: 14,
                      backgroundColor: COLORS.accent2,
                      padding: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="heart-outline" size={15} color={COLORS.accentDark} />
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      «Me gusta»: abren su pestaña de Perfil {coreFunnel.meGustaPestana} sesiones · dan «me gusta» a un servicio {coreFunnel.meGustaServicio}
                    </Text>
                  </View>
                  {/* Pagos online por forma de pago (lo dice Stripe; migración 20261111150000): solo números, sin datos de nadie. */}
                  {pagosPorMetodo ? (
                    <View
                      nativeID="analitica-pago-metodos"
                      style={{
                        borderRadius: 14,
                        backgroundColor: COLORS.accent2,
                        padding: 10,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Ionicons name="card-outline" size={15} color={COLORS.accentDark} />
                      <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                        Pagos online por forma de pago (desde que se guarda, todos los tiempos): tarjeta {pagosPorMetodo.pedidos.card + pagosPorMetodo.reparaciones.card} · Bizum{" "}
                        {pagosPorMetodo.pedidos.bizum + pagosPorMetodo.reparaciones.bizum} · Klarna {pagosPorMetodo.pedidos.klarna + pagosPorMetodo.reparaciones.klarna} (pedidos:{" "}
                        {pagosPorMetodo.pedidos.card}/{pagosPorMetodo.pedidos.bizum}/{pagosPorMetodo.pedidos.klarna} · reparaciones y etiquetas: {pagosPorMetodo.reparaciones.card}/
                        {pagosPorMetodo.reparaciones.bizum}/{pagosPorMetodo.reparaciones.klarna})
                      </Text>
                    </View>
                  ) : null}
                  {/* Ventas en tienda (en mano, de VeoAura) frente a online: recuento e importe, sin datos de nadie. */}
                  {ventasCanal ? (
                    <View
                      nativeID="analitica-ventas-tienda"
                      style={{
                        borderRadius: 14,
                        backgroundColor: COLORS.accent2,
                        padding: 10,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Ionicons name="storefront-outline" size={15} color={COLORS.accentDark} />
                      <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                        Ventas en tienda (de VeoAura) frente a online, sin cancelados: en tienda {ventasCanal.tienda.n} ({fmtEurCanal(ventasCanal.tienda.eur)}) · online{" "}
                        {ventasCanal.online.n} ({fmtEurCanal(ventasCanal.online.eur)})
                      </Text>
                    </View>
                  ) : null}
                  {/* Clientes conectados (tabla cliente_dispositivos): solo recuentos, sin datos de nadie. */}
                  {conectados7 ? (
                    <View
                      nativeID="analitica-conectados"
                      style={{
                        borderRadius: 14,
                        backgroundColor: COLORS.accent2,
                        padding: 10,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Ionicons name="phone-portrait-outline" size={15} color={COLORS.accentDark} />
                      <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                        Clientes conectados en los últimos 7 días: {conectados7.clientes} · con la app instalada: {conectados7.app}
                      </Text>
                    </View>
                  ) : null}
                  {/* Teléfono de Mi perfil (opcional): cuántos perfiles lo tienen (solo el número) y los eventos propios. */}
                  <View
                    nativeID="analitica-telefono-perfil"
                    style={{
                      borderRadius: 14,
                      backgroundColor: COLORS.accent2,
                      padding: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="call-outline" size={15} color={COLORS.accentDark} />
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Teléfono en «Mi perfil» (opcional): perfiles con teléfono {perfilesConTelefono ?? "sin datos"} · «Perfil: teléfono guardado»{" "}
                      {coreFunnel.telefonoGuardado} · «Pago: teléfono del perfil usado» {coreFunnel.telefonoPago} (sesiones)
                    </Text>
                  </View>
                  {/* Facturas (las emite VeoAura y llegan por api/escaparate-veoaura.ts): descargas desde «Mis pedidos». */}
                  <View
                    nativeID="analitica-facturas"
                    style={{
                      borderRadius: 14,
                      backgroundColor: COLORS.accent2,
                      padding: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="document-text-outline" size={15} color={COLORS.accentDark} />
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Facturas descargadas desde «Mis pedidos»: {coreFunnel.facturaDescargada} {coreFunnel.facturaDescargada === 1 ? "sesión" : "sesiones"} ·
                      desde Blue IA: «Ver mis facturas» {coreFunnel.blueVerFacturas} · «Descargar factura» {coreFunnel.blueFacturaDescargada} (sesiones) ·
                      «Añadir un número de seguimiento» (al final de Mis seguimientos): lo abren {coreFunnel.numeroAbierto} → lo añaden {coreFunnel.numeroAnadido} ·
                      filtros de «Mis pedidos»: {coreFunnel.filtrosPedidos || "aún sin usar"}
                    </Text>
                  </View>
                  <View
                    nativeID="analitica-cesta-blue"
                    style={{
                      borderRadius: 14,
                      backgroundColor: COLORS.accent2,
                      padding: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="sparkles-outline" size={15} color={COLORS.accentDark} />
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Cesta → «Blue, ayúdame a elegir un artículo»: {coreFunnel.blueElegir}{" "}
                      {coreFunnel.blueElegir === 1 ? "sesión" : "sesiones"}
                    </Text>
                  </View>
                  <View
                    nativeID="analitica-blue-flotante"
                    style={{
                      borderRadius: 14,
                      backgroundColor: COLORS.accent2,
                      padding: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="happy-outline" size={15} color={COLORS.accentDark} />
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Blue flotante (fijo arriba a la derecha), lo abren: en Inicio {coreFunnel.blueInicio} · en la ficha de producto{" "}
                      {coreFunnel.blueFichaProducto} · en la ficha de servicio {coreFunnel.blueFichaServicio} · activan desde su panel los
                      avisos de noticias {coreFunnel.blueAvisosNoticias} · abren una noticia nueva desde su aviso{" "}
                      {coreFunnel.blueAvisoNoticia}. Sus mensajes: los tocan {coreFunnel.blueMensajeTocado} · los cierran con la X{" "}
                      {coreFunnel.blueMensajeCerrado} · se cierran solos {coreFunnel.blueMensajeSolo} (sesiones)
                    </Text>
                  </View>
                  <View
                    nativeID="analitica-blue-avisos-cuenta"
                    style={{
                      borderRadius: 14,
                      backgroundColor: COLORS.accent2,
                      padding: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="notifications-outline" size={15} color={COLORS.accentDark} />
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Avisos de Blue solo con cuenta (bajadas de precio y artículos nuevos) → cuentas con los avisos de artículos
                      nuevos activados: {cuentasAvisosNovedades ?? "sin datos"} · tocan «Crear cuenta gratis»: {coreFunnel.blueCuentaAvisos}{" "}
                      {coreFunnel.blueCuentaAvisos === 1 ? "sesión" : "sesiones"} · crean la cuenta después: {coreFunnel.blueCuentaAvisosCreada}
                    </Text>
                  </View>
                  <View
                    nativeID="analitica-blue-conversaciones"
                    style={{
                      borderRadius: 14,
                      backgroundColor: COLORS.accent2,
                      padding: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="chatbubbles-outline" size={15} color={COLORS.accentDark} />
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Blue IA → siguen su última conversación: {coreFunnel.blueRetomada}{" "}
                      {coreFunnel.blueRetomada === 1 ? "sesión" : "sesiones"} · empiezan una nueva: {coreFunnel.blueNueva}
                    </Text>
                  </View>
                  {/* Modelo mixto de Blue IA (2026-11-26): qué modelo contesta. */}
                  <View
                    nativeID="analitica-blue-modelo"
                    style={{
                      borderRadius: 14,
                      backgroundColor: COLORS.accent2,
                      padding: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="sparkles-outline" size={15} color={COLORS.accentDark} />
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Blue IA → respuestas del modelo avanzado: {coreFunnel.blueModeloAvanzado} · de gpt-4o-mini:{" "}
                      {coreFunnel.blueModeloBase} (sesiones) · artículos tocados: el nombrado {coreFunnel.blueArticuloNombrado} ·
                      «opciones similares» {coreFunnel.blueArticuloSimilar} · pastilla del horario {coreFunnel.bluePastillaHorario}
                    </Text>
                  </View>
                  {/* Historial de Blue IA (2026-11-26): archivar, «Archivadas» → «Recuperar» y «Deshacer». */}
                  <View
                    nativeID="analitica-blue-archivadas"
                    style={{
                      borderRadius: 14,
                      backgroundColor: COLORS.accent2,
                      padding: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="archive-outline" size={15} color={COLORS.accentDark} />
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Blue IA → conversaciones archivadas: {coreFunnel.blueArchivadas} · recuperadas desde «Archivadas»:{" "}
                      {coreFunnel.blueRecuperadas} · con «Deshacer»: {coreFunnel.blueDeshechas} (sesiones)
                    </Text>
                  </View>
                  <View
                    nativeID="analitica-quienes-somos"
                    style={{
                      borderRadius: 14,
                      backgroundColor: COLORS.accent2,
                      padding: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="people-outline" size={15} color={COLORS.accentDark} />
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Quiénes somos → la ven {coreFunnel.quienesVista} {coreFunnel.quienesVista === 1 ? "sesión" : "sesiones"} · llegan
                      desde Inicio: {coreFunnel.quienesInicio} · desde entrar o crear cuenta: {coreFunnel.quienesAcceso}
                    </Text>
                  </View>
                  {/* «¿Tienes una consola…? Te lo tasamos» en Perfil, antes de entrar o crear la cuenta (2026-11-26). */}
                  <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="cash-outline" size={15} color={COLORS.accentDark} />
                    <Text nativeID="analitica-perfil-vender" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Vender desde Perfil («Te lo tasamos en menos de 30 minutos») → {coreFunnel.perfilVender}{" "}
                      {coreFunnel.perfilVender === 1 ? "sesión" : "sesiones"}
                    </Text>
                  </View>
                  {/* Cierre de Inicio, antes del pie (2026-11-26). */}
                  <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="flag-outline" size={15} color={COLORS.accentDark} />
                    <Text nativeID="analitica-inicio-cierre" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Cierre de Inicio («¿Tienes una consola o un móvil que ya no usas?») → «Vender ahora»: {coreFunnel.cierreVender} · «Ver catálogo»:{" "}
                      {coreFunnel.cierreCatalogo} sesiones
                    </Text>
                  </View>
                  {/* Oferta de la semana de Inicio (2026-11-26): lo que se toca en la tarjeta. */}
                  <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="pricetag-outline" size={15} color={COLORS.accentDark} />
                    <Text nativeID="analitica-oferta-semana" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Oferta de la semana → «Comprar ya»: {coreFunnel.ofertaComprar} · «Añadir a la cesta»: {coreFunnel.ofertaCesta} · fotos en
                      grande: {coreFunnel.ofertaFotos} · compartir: {coreFunnel.ofertaCompartir} · me gusta: {coreFunnel.ofertaMeGusta} · «Ver
                      ficha completa»: {coreFunnel.ofertaFicha} sesiones
                    </Text>
                  </View>
                  {/* Tira de noticias en Inicio, Perfil y Cesta (2026-11-27: una sola, «Recientes noticias…»). */}
                  <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="newspaper-outline" size={15} color={COLORS.accentDark} />
                    <Text nativeID="analitica-noticias-estantes" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Noticias en Inicio, Perfil y Cesta («Recientes noticias que creemos que podrían interesarte») → {coreFunnel.noticiasRecientesVistas}{" "}
                      las ven · {coreFunnel.noticiasRecientesTocadas} entran (sesiones)
                    </Text>
                  </View>
                  {/* Barra fija de la página de cada noticia (2026-11-27): volver, me gusta, comentar y compartir. */}
                  <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="heart-outline" size={15} color={COLORS.accentDark} />
                    <Text nativeID="analitica-noticia-barra" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Página de noticia, barra de abajo → me gusta: {coreFunnel.noticiaBarraMeGusta} · comentar: {coreFunnel.noticiaBarraComentar} ·
                      compartir: {coreFunnel.noticiaBarraCompartir} · volver: {coreFunnel.noticiaBarraVolver} sesiones
                    </Text>
                  </View>
                  <View
                    nativeID="analitica-blue-horario"
                    style={{
                      borderRadius: 14,
                      backgroundColor: COLORS.accent2,
                      padding: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="time-outline" size={15} color={COLORS.accentDark} />
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Blue IA → «Hablar con el equipo» fuera de horario: {coreFunnel.fueraHorarioAviso}{" "}
                      {coreFunnel.fueraHorarioAviso === 1 ? "sesión" : "sesiones"} · siguen con Blue: {coreFunnel.fueraHorarioBlue} ·
                      escriben igualmente: {coreFunnel.fueraHorarioEscribe}
                    </Text>
                  </View>
                </View>
              )}
            </SectionCard>

            <SectionCard
              title="Búsquedas (30 días)"
              subtitle="Lo que buscan los clientes en Inicio y en el catálogo, lo que no encuentran (productos que piden y no hay) y el uso de los filtros de precio y estado. Siempre los últimos 30 días; solo visitantes que aceptaron la analítica y sin datos personales."
            >
              {!busquedas ? (
                <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, textAlign: "center" }}>No se han podido cargar las búsquedas.</Text>
              ) : (
                <View nativeID="analitica-busquedas" style={{ gap: 10 }}>
                  <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Ionicons name="search-outline" size={16} color={COLORS.accentDark} />
                    <Text nativeID="analitica-busquedas-resumen" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      {busquedas.total} {busquedas.total === 1 ? "búsqueda" : "búsquedas"} (Inicio {busquedas.desde.inicio} · catálogo {busquedas.desde.catalogo}) ·
                      sin resultados {busquedas.nSinResultados} · con sinónimo {busquedas.sinonimo} · con corrección {busquedas.correccion} ·
                      sugerencias tocadas {busquedas.sugerenciasTocadas}
                    </Text>
                  </View>
                  <View style={{ gap: 6 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.minimo }}>Lo más buscado</Text>
                    {busquedas.top.length ? (
                      <View nativeID="analitica-busquedas-top" style={{ gap: 8 }}>
                        {busquedas.top.map((b) => (
                          <BarRow
                            key={b.texto}
                            label={`«${b.texto}» · ${b.resultados} ${b.resultados === 1 ? "resultado" : "resultados"}`}
                            value={b.n}
                            maxValue={busquedas.top[0]?.n ?? 1}
                            color={COLORS.accentDark}
                          />
                        ))}
                      </View>
                    ) : (
                      <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo }}>Todavía no hay búsquedas en estos 30 días.</Text>
                    )}
                  </View>
                  <View style={{ gap: 6 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.minimo }}>Sin resultados (lo que piden y no tienes)</Text>
                    {busquedas.sinResultados.length ? (
                      <View nativeID="analitica-busquedas-sin-resultados" style={{ gap: 8 }}>
                        {busquedas.sinResultados.map((b) => (
                          <BarRow
                            key={b.texto}
                            label={`«${b.texto}»${b.sugerencia ? ` · se le propuso «${b.sugerencia}»` : ""}`}
                            value={b.n}
                            maxValue={busquedas.sinResultados[0]?.n ?? 1}
                            color={COLORS.warning}
                          />
                        ))}
                      </View>
                    ) : (
                      <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo }}>Ninguna búsqueda se ha quedado sin resultados.</Text>
                    )}
                  </View>
                  <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Ionicons name="options-outline" size={16} color={COLORS.accentDark} />
                    <Text nativeID="analitica-busquedas-filtros" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Filtros: precio {busquedas.filtros.precio}
                      {busquedas.tramos.length ? ` (${busquedas.tramos.map((t) => `${t.tramo} ×${t.n}`).join(" · ")})` : ""} · estado {busquedas.filtros.estado}
                      {busquedas.estados.length ? ` (${busquedas.estados.map((e) => `${e.valor} ×${e.n}`).join(" · ")})` : ""} · quitados{" "}
                      {busquedas.filtros.quitados} · «Borrar filtros» {busquedas.filtros.borrados}
                    </Text>
                  </View>
                  {/* «Compartir» de una categoría desde el catálogo (dueño, 2026-11-19). */}
                  <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Ionicons name="share-social-outline" size={16} color={COLORS.accentDark} />
                    <Text nativeID="analitica-categorias-compartidas" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Categorías compartidas: {busquedas.compartidas.total}
                      {busquedas.compartidas.porCategoria.length
                        ? ` (${busquedas.compartidas.porCategoria.map((c) => `${c.nombre} ×${c.n}`).join(" · ")})`
                        : ""}
                    </Text>
                  </View>
                  {/* Final de cada categoría (dueño, 2026-11-26): qué se toca de los carruseles y de «Compra con confianza». */}
                  <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Ionicons name="albums-outline" size={16} color={COLORS.accentDark} />
                    <Text nativeID="analitica-final-categoria" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Final de categoría: servicios tocados {busquedas.finalCategoria.servicios}
                      {busquedas.finalCategoria.porServicio.length
                        ? ` (${busquedas.finalCategoria.porServicio.map((c) => `${c.nombre} ×${c.n}`).join(" · ")})`
                        : ""}{" "}
                      · otras categorías {busquedas.finalCategoria.categorias} · «Compra con confianza» {busquedas.finalCategoria.confianza}
                    </Text>
                  </View>
                </View>
              )}
            </SectionCard>

            <SectionCard
              title="Ficha del producto (30 días)"
              subtitle="Uso del visor de fotos, entregas estimadas que se han enseñado (por tipo, sin códigos postales) y cuántos productos has marcado como revisados o con garantía. Siempre los últimos 30 días; solo visitantes que aceptaron la analítica."
            >
              {!fichaConfianza ? (
                <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, textAlign: "center" }}>No se ha podido cargar la ficha del producto.</Text>
              ) : (
                <View nativeID="analitica-ficha-producto" style={{ gap: 10 }}>
                  <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Ionicons name="expand-outline" size={16} color={COLORS.accentDark} />
                    <Text nativeID="analitica-ficha-zoom" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Visor de fotos: abierto {fichaConfianza.abiertos} {fichaConfianza.abiertos === 1 ? "vez" : "veces"} · con zoom {fichaConfianza.zoom} ·
                      cerrado deslizando {fichaConfianza.cerradosDeslizando}
                    </Text>
                  </View>
                  <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Ionicons name="cube-outline" size={16} color={COLORS.accentDark} />
                    <Text nativeID="analitica-ficha-entregas" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Entregas estimadas mostradas: mismo día {fichaConfianza.entregas.mismo_dia} · resto de España {fichaConfianza.entregas.peninsula} ·
                      islas, Ceuta y Melilla {fichaConfianza.entregas.islas} · sin código postal {fichaConfianza.entregas.sin_cp}
                    </Text>
                  </View>
                  <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Ionicons name="time-outline" size={16} color={COLORS.accentDark} />
                    <Text nativeID="analitica-franjas" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Franja de entrega elegida al pagar (30 días): mañana {fichaConfianza.franjas.manana} · tarde {fichaConfianza.franjas.tarde} · para hoy{" "}
                      {fichaConfianza.franjas.hoy} · para otro día {fichaConfianza.franjas.otroDia}
                    </Text>
                  </View>
                  <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Ionicons name="pricetag-outline" size={16} color={COLORS.accentDark} />
                    <Text nativeID="analitica-vendido-al-pagar" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Artículos únicos (30 días): «se acaba de vender» al hacer el pedido {fichaConfianza.unicos.vendidoAlPedir} · al ir a pagar{" "}
                      {fichaConfianza.unicos.vendidoAlPagar}
                      {fichaConfianza.unicos.dobles !== null ? ` · dobles ventas ${fichaConfianza.unicos.dobles}` : ""}
                      {fichaConfianza.unicos.vendidosWeb !== null ? ` · vendidos al pagar por la web ${fichaConfianza.unicos.vendidosWeb}` : ""}
                    </Text>
                  </View>
                  {fichaConfianza.revisados !== null ? (
                    <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                      <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.accentDark} />
                      <Text nativeID="analitica-ficha-revisados" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                        Productos revisados por el equipo: {fichaConfianza.revisados} · con garantía indicada: {fichaConfianza.conGarantia ?? 0}
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}
            </SectionCard>

            <SectionCard
              title="Seguimiento de pedidos y avisos de precio (30 días)"
              subtitle="Cuántos clientes siguen cada producto con «Avísame si baja de precio» (recuentos, sin nombres) y los avisos de Blue sobre el estado de los pedidos y las bajadas: mostrados y tocados. Solo visitantes que aceptaron la analítica."
            >
              {!avisosPrecio ? (
                <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, textAlign: "center" }}>Cargando…</Text>
              ) : (
                <View nativeID="analitica-avisos-precio" style={{ gap: 10 }}>
                  <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Ionicons name="cube-outline" size={16} color={COLORS.accentDark} />
                    <Text nativeID="analitica-aviso-estado" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Avisos de Blue del estado del pedido: mostrados {avisosPrecio.ev.pedido_aviso_estado_mostrado} · tocados {avisosPrecio.ev.pedido_aviso_estado_tocado} ·
                      «Seguir el envío» tocado {avisosPrecio.ev.seguir_envio}
                    </Text>
                  </View>
                  <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Ionicons name="trending-down-outline" size={16} color={COLORS.accentDark} />
                    <Text nativeID="analitica-aviso-precio-uso" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Avisos de bajada de precio: activados {avisosPrecio.ev.aviso_precio_activado} · quitados {avisosPrecio.ev.aviso_precio_desactivado} · bajadas
                      avisadas por Blue {avisosPrecio.ev.aviso_precio_mostrado} · tocadas {avisosPrecio.ev.aviso_precio_tocado} · sin cuenta (invitados a crearla){" "}
                      {avisosPrecio.ev.aviso_precio_invitacion}
                    </Text>
                  </View>
                  {/* «Avisarme cuando haya otro» tras cancelar un pedido (sin datos personales: recuentos y canal). */}
                  {avisosPrecio.repo ? (
                    <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                      <Ionicons name="notifications-outline" size={16} color={COLORS.accentDark} />
                      <Text nativeID="analitica-avisos-reposicion" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                        {`Avisos de reposición: ${avisosPrecio.repo.activos} activos · por app ${avisosPrecio.repo.app} · por correo ${avisosPrecio.repo.correo} · ambas ${avisosPrecio.repo.ambas} · avisados ${avisosPrecio.repo.avisados}`}
                        {` · en 30 días: activados ${avisosPrecio.ev.aviso_reposicion_activado} · apagados ${avisosPrecio.ev.aviso_reposicion_desactivado} · avisos tocados ${avisosPrecio.ev.aviso_reposicion_tocado}`}
                        {avisosPrecio.repo.correo + avisosPrecio.repo.ambas > 0 ? " · Correo pendiente de activar en la tienda (de momento Blue les avisa en la app)" : ""}
                      </Text>
                    </View>
                  ) : null}
                  {avisosPrecio.porProducto ? (
                    <View nativeID="analitica-avisos-precio-productos" style={{ gap: 6 }}>
                      <Text nativeID="analitica-avisos-precio-total" style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.minimo }}>
                        Ahora: {avisosPrecio.clientes ?? 0} {avisosPrecio.clientes === 1 ? "cliente sigue" : "clientes siguen"} algún producto
                      </Text>
                      {avisosPrecio.porProducto.length === 0 ? (
                        <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo }}>Aún nadie sigue ningún producto.</Text>
                      ) : (
                        avisosPrecio.porProducto.map((f) => (
                          <View key={f.id} nativeID={`analitica-aviso-precio-${f.id}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <Text numberOfLines={1} style={{ color: COLORS.text, fontSize: TAMANOS.minimo, fontWeight: "700", flex: 1 }}>{f.titulo}</Text>
                            <Text style={{ color: COLORES_TEXTO.azulTexto, fontSize: TAMANOS.minimo, fontWeight: "900" }}>
                              {f.clientes} {f.clientes === 1 ? "cliente" : "clientes"}
                            </Text>
                          </View>
                        ))
                      )}
                    </View>
                  ) : null}
                </View>
              )}
            </SectionCard>

            <SectionCard
              title="Parecidos y complementos (30 días)"
              subtitle="«Productos parecidos» al final de la ficha y «Completa tu compra» (mandos y accesorios de la misma consola, en la ficha y en la cesta): veces mostrados, tocados y añadidos a la cesta. Solo ids de producto, sin datos de nadie; solo visitantes que aceptaron la analítica."
            >
              {!parecidos ? (
                <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, textAlign: "center" }}>No se han podido cargar los parecidos y complementos.</Text>
              ) : (
                <View nativeID="analitica-parecidos" style={{ gap: 10 }}>
                  <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Ionicons name="albums-outline" size={16} color={COLORS.accentDark} />
                    <Text nativeID="analitica-parecidos-uso" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Productos parecidos: mostrados {parecidos.ev.parecidos_mostrado} {parecidos.ev.parecidos_mostrado === 1 ? "vez" : "veces"} · tocados{" "}
                      {parecidos.ev.parecido_tocado}
                    </Text>
                  </View>
                  <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Ionicons name="add-circle-outline" size={16} color={COLORS.accentDark} />
                    <Text nativeID="analitica-complementos-uso" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Completa tu compra: mostrado {parecidos.ev.complemento_mostrado} (ficha {parecidos.mostradosFicha} · cesta {parecidos.mostradosCesta}) · tocados{" "}
                      {parecidos.ev.complemento_tocado} · añadidos a la cesta {parecidos.ev.complemento_anadido}
                    </Text>
                  </View>
                  <View nativeID="analitica-complementos-top" style={{ gap: 6 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.minimo }}>Lo que más se añade desde «Completa tu compra»</Text>
                    {parecidos.masAnadidos.length === 0 ? (
                      <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo }}>Aún no se ha añadido ninguno.</Text>
                    ) : (
                      parecidos.masAnadidos.map((f) => (
                        <View key={f.id} nativeID={`analitica-complemento-${f.id}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text numberOfLines={1} style={{ color: COLORS.text, fontSize: TAMANOS.minimo, fontWeight: "700", flex: 1 }}>{f.titulo}</Text>
                          <Text style={{ color: COLORES_TEXTO.azulTexto, fontSize: TAMANOS.minimo, fontWeight: "900" }}>
                            {f.n} {f.n === 1 ? "vez" : "veces"}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                </View>
              )}
            </SectionCard>

            <SectionCard
              title="Comparador (30 días)"
              subtitle="«Comparar» en el catálogo y en la ficha (hasta 3 productos, guardados solo en el dispositivo): veces que se abre la comparación, cuántos productos se comparan de media, cuántos se añaden a la cesta desde ahí y lo que más se compara. Solo ids de producto, sin datos de nadie; solo visitantes que aceptaron la analítica."
            >
              {!comparador ? (
                <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, textAlign: "center" }}>No se ha podido cargar el comparador.</Text>
              ) : (
                <View nativeID="analitica-comparador" style={{ gap: 10 }}>
                  <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Ionicons name="git-compare-outline" size={16} color={COLORS.accentDark} />
                    <Text nativeID="analitica-comparador-uso" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Abierto {comparador.abiertos} {comparador.abiertos === 1 ? "vez" : "veces"} · media de{" "}
                      {comparador.media === null ? "—" : comparador.media.toFixed(1).replace(".", ",")} productos comparados · añadidos a la cesta desde ahí{" "}
                      {comparador.cesta}
                    </Text>
                  </View>
                  <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Ionicons name="checkbox-outline" size={16} color={COLORS.accentDark} />
                    <Text nativeID="analitica-comparador-elegidos" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Productos elegidos para comparar {comparador.anadidos} · quitados {comparador.quitados}
                    </Text>
                  </View>
                  <View nativeID="analitica-comparador-top" style={{ gap: 6 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.minimo }}>Lo que más se compara</Text>
                    {comparador.top.length === 0 ? (
                      <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo }}>Aún no se ha comparado nada.</Text>
                    ) : (
                      comparador.top.map((f) => (
                        <View key={f.id} nativeID={`analitica-comparado-${f.id}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text numberOfLines={1} style={{ color: COLORS.text, fontSize: TAMANOS.minimo, fontWeight: "700", flex: 1 }}>{f.titulo}</Text>
                          <Text style={{ color: COLORES_TEXTO.azulTexto, fontSize: TAMANOS.minimo, fontWeight: "900" }}>
                            {f.n} {f.n === 1 ? "vez" : "veces"}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                </View>
              )}
            </SectionCard>

            <SectionCard
              title="Consejos de Blue (30 días)"
              subtitle="Los consejos que Blue da una vez por dispositivo en los primeros momentos (primera compra, catálogo, ficha, comparar y cuenta nueva): cuántas veces se enseñan, se siguen y se cierran, y cuántos los desactivaron. Solo el momento, sin datos de nadie; solo visitantes que aceptaron la analítica."
            >
              {!consejos ? (
                <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, textAlign: "center" }}>No se han podido cargar los consejos.</Text>
              ) : (
                <View nativeID="analitica-consejos" style={{ gap: 8 }}>
                  {consejos.filas.map((f, i) => (
                    <View
                      key={f.momento}
                      nativeID={`analitica-consejo-${MOMENTOS_CONSEJO[i][0]}`}
                      style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, gap: 2 }}
                    >
                      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.minimo }}>{f.momento}</Text>
                      <Text style={{ color: COLORS.text, fontWeight: "700", fontSize: TAMANOS.minimo }}>
                        Mostrados {f.mostrados} · seguidos {f.seguidos} · cerrados {f.cerrados}
                      </Text>
                    </View>
                  ))}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="notifications-off-outline" size={16} color={COLORS.accentDark} />
                    <Text nativeID="analitica-consejos-desactivados" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Los desactivaron {consejos.desactivados} {consejos.desactivados === 1 ? "vez" : "veces"}
                    </Text>
                  </View>
                </View>
              )}
            </SectionCard>

            <SectionCard
              title="Cambio de consola desde la cesta (30 días)"
              subtitle="La línea «¿Tienes una consola que ya no usas?» que sale en la cesta con una consola (o si el cliente ya compró una): veces que se enseña, toques en «Ver cuánto me dais» y solicitudes de cambio enviadas desde ahí (en Cotizaciones, con su filtro). Solo recuentos; solo visitantes que aceptaron la analítica."
            >
              {!cambioCesta ? (
                <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, textAlign: "center" }}>No se ha podido cargar el cambio de consola.</Text>
              ) : (
                <View nativeID="analitica-cambio-cesta" style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10 }}>
                  <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, textAlign: "center" }}>
                    Mostrado {cambioCesta.mostrado} · tocado {cambioCesta.tocado} · enviados {cambioCesta.enviados}
                  </Text>
                </View>
              )}
            </SectionCard>

            <SectionCard
              title="Alquiler"
              subtitle="Unidades de alquiler, ocupación (unidades alquiladas ahora), ingresos de alquiler de este mes, fianzas que tienes cobradas y aún sin devolver y alquileres renovados. Solo números; el detalle está en Administración → Alquileres."
            >
              {!alquilerCifras ? (
                <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, textAlign: "center" }}>No se han podido cargar los datos del alquiler.</Text>
              ) : (
                <View nativeID="analitica-alquiler" style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, gap: 4 }}>
                  <Text nativeID="analitica-alquiler-unidades" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, textAlign: "center" }}>
                    Unidades {alquilerCifras.unidades} · ocupación {alquilerCifras.ocupacion} % · ingresos del mes {eurosAlquiler(alquilerCifras.ingresos)}
                  </Text>
                  <Text nativeID="analitica-alquiler-fianzas" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, textAlign: "center" }}>
                    Fianzas retenidas {eurosAlquiler(alquilerCifras.fianzas)} ({alquilerCifras.nFianzas}) · renovaciones {alquilerCifras.renovados}
                  </Text>
                </View>
              )}
            </SectionCard>

            <SectionCard
              title="Pedidos cancelados: recuperación (30 días)"
              subtitle="Toques en «Volver a comprar» (si el artículo sigue a la venta) y en «Ver artículos parecidos» desde la tarjeta de un pedido cancelado en Mis pedidos. Solo recuentos, sin datos de nadie; solo visitantes que aceptaron la analítica."
            >
              {!recuperacionCancel ? (
                <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, textAlign: "center" }}>No se ha podido cargar la recuperación de pedidos cancelados.</Text>
              ) : (
                <View nativeID="analitica-cancelados-recuperacion" style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10 }}>
                  <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, textAlign: "center" }}>
                    Volver a comprar {recuperacionCancel.recomprar} · ver artículos parecidos {recuperacionCancel.parecidos}
                  </Text>
                </View>
              )}
            </SectionCard>

            <SectionCard
              title="Vender ahora: autorrelleno y fotos (30 días)"
              subtitle="Veces que el formulario «Vender ahora» se rellenó solo con los datos de la cuenta y de Mi perfil (y cuántos campos de media), e intentos de enviarlo sin las 7 fotos o sin un vídeo válido. Solo recuentos, sin datos de nadie; solo visitantes que aceptaron la analítica."
            >
              {!venderMedia ? (
                <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, textAlign: "center" }}>No se ha podido cargar el uso de «Vender ahora».</Text>
              ) : (
                <View nativeID="analitica-vender-media" style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, gap: 4 }}>
                  <Text nativeID="analitica-vender-autorrelleno" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, textAlign: "center" }}>
                    Autorrellenado {venderMedia.autorrelleno} {venderMedia.autorrelleno === 1 ? "vez" : "veces"}
                    {venderMedia.autorrelleno > 0 ? ` · ${venderMedia.mediaCampos} campos de media` : ""}
                  </Text>
                  <Text nativeID="analitica-vender-sin-media" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, textAlign: "center" }}>
                    Intentos sin fotos o vídeo {venderMedia.sinMedia}
                  </Text>
                  {/* Subida en segundo plano (2026-11-19): cuántas, cuánto tardan de media y con fallos. */}
                  <Text nativeID="analitica-vender-subidas" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, textAlign: "center" }}>
                    Subidas de fotos y vídeo {venderMedia.subidas}
                    {venderMedia.subidas > 0 ? ` · ${venderMedia.segundosMedia} s de media · con fallos ${venderMedia.conFallos}` : ""}
                  </Text>
                </View>
              )}
            </SectionCard>

            <SectionCard
              title="Vistos recientemente (30 días)"
              subtitle="El estante de Inicio con lo último que cada visitante ha mirado (guardado solo en su dispositivo, sale con 3 o más a la venta): veces que se enseña, toques, productos quitados e historiales borrados, y lo que más se vuelve a abrir desde ahí. Solo ids de producto, sin datos de nadie; solo visitantes que aceptaron la analítica."
            >
              {!vistosUso ? (
                <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, textAlign: "center" }}>No se han podido cargar los vistos recientemente.</Text>
              ) : (
                <View nativeID="analitica-vistos" style={{ gap: 10 }}>
                  <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Ionicons name="time-outline" size={16} color={COLORS.accentDark} />
                    <Text nativeID="analitica-vistos-uso" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Mostrado {vistosUso.mostrado} {vistosUso.mostrado === 1 ? "vez" : "veces"} · {vistosUso.toques}{" "}
                      {vistosUso.toques === 1 ? "toque" : "toques"}
                    </Text>
                  </View>
                  <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Ionicons name="close-circle-outline" size={16} color={COLORS.accentDark} />
                    <Text nativeID="analitica-vistos-quitados" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Productos quitados {vistosUso.quitados} · historiales borrados {vistosUso.borrados}
                    </Text>
                  </View>
                  <View nativeID="analitica-vistos-top" style={{ gap: 6 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.minimo }}>Lo más revisitado</Text>
                    {vistosUso.top.length === 0 ? (
                      <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo }}>Aún nadie ha vuelto a un producto desde aquí.</Text>
                    ) : (
                      vistosUso.top.map((f) => (
                        <View key={f.id} nativeID={`analitica-visto-${f.id}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text numberOfLines={1} style={{ color: COLORS.text, fontSize: TAMANOS.minimo, fontWeight: "700", flex: 1 }}>{f.titulo}</Text>
                          <Text style={{ color: COLORES_TEXTO.azulTexto, fontSize: TAMANOS.minimo, fontWeight: "900" }}>
                            {f.n} {f.n === 1 ? "vez" : "veces"}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                </View>
              )}
            </SectionCard>

            {envioGratis ? (
              <SectionCard
                title="Envío gratis regalado"
                subtitle="El envío gratis que das a un cliente desde su ficha (Usuarios → cliente → «Activar envío gratis»): regalos sin quitar ni caducar (aunque ya se hayan gastado), los dados en los últimos 30 días, los pedidos que lo han usado (sin contar cancelados) y las veces que Blue se lo ha dicho al cliente (30 días, solo quien aceptó la analítica)."
              >
                <View nativeID="analitica-envio-gratis" style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <Ionicons name="gift-outline" size={16} color={COLORS.accentDark} />
                  <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                    Sin quitar ni caducar {envioGratis.activos} · dados en 30 días {envioGratis.dados30} · pedidos con envío regalado {envioGratis.pedidos} · avisos de Blue vistos {envioGratis.avisos}
                  </Text>
                </View>
              </SectionCard>
            ) : null}

            <SectionCard
              title="Preguntas por artículos (30 días)"
              subtitle="«Preguntar por este artículo» en la ficha abre el chat de la tienda con el producto adjunto: conversaciones abiertas, mensajes enviados (y cuántos fueron la primera pregunta), invitaciones a crear cuenta, enlaces de la tienda que el cliente abre desde un mensaje, las preguntas sugeridas más usadas y los productos por los que más se pregunta. Solo ids de producto, sin datos de nadie; solo visitantes que aceptaron la analítica."
            >
              {!preguntasArticulos ? (
                <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, textAlign: "center" }}>No se han podido cargar las preguntas por artículos.</Text>
              ) : (
                <View nativeID="analitica-chat-producto" style={{ gap: 10 }}>
                  <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Ionicons name="chatbubbles-outline" size={16} color={COLORS.accentDark} />
                    <Text nativeID="analitica-chat-producto-uso" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      Conversaciones abiertas {preguntasArticulos.abiertos} · mensajes enviados {preguntasArticulos.enviados} (primera pregunta{" "}
                      {preguntasArticulos.primeras}) · sin cuenta, invitados a crearla {preguntasArticulos.invitaciones} · enlaces de la
                      tienda abiertos desde el chat {preguntasArticulos.enlaces}
                    </Text>
                  </View>
                  <View nativeID="analitica-chat-producto-sugerencias" style={{ gap: 6 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.minimo }}>Primeras preguntas más usadas</Text>
                    {preguntasArticulos.sugerencias.length === 0 ? (
                      <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo }}>Aún nadie ha usado una pregunta sugerida.</Text>
                    ) : (
                      preguntasArticulos.sugerencias.map((f) => (
                        <View key={f.texto} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text numberOfLines={1} style={{ color: COLORS.text, fontSize: TAMANOS.minimo, fontWeight: "700", flex: 1 }}>{f.texto}</Text>
                          <Text style={{ color: COLORES_TEXTO.azulTexto, fontSize: TAMANOS.minimo, fontWeight: "900" }}>
                            {f.n} {f.n === 1 ? "vez" : "veces"}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                  <View nativeID="analitica-chat-producto-top" style={{ gap: 6 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.minimo }}>Por lo que más se pregunta</Text>
                    {preguntasArticulos.top.length === 0 ? (
                      <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo }}>Aún nadie ha preguntado por un artículo.</Text>
                    ) : (
                      preguntasArticulos.top.map((f) => (
                        <View key={f.id} nativeID={`analitica-chat-producto-${f.id}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text numberOfLines={1} style={{ color: COLORS.text, fontSize: TAMANOS.minimo, fontWeight: "700", flex: 1 }}>{f.titulo}</Text>
                          <Text style={{ color: COLORES_TEXTO.azulTexto, fontSize: TAMANOS.minimo, fontWeight: "900" }}>
                            {f.n} {f.n === 1 ? "vez" : "veces"}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                </View>
              )}
            </SectionCard>

            <SectionCard
              title="Valoraciones (30 días)"
              subtitle="Valoración tras la entrega: a los 3 días de entregar un pedido, Blue y Mis pedidos piden una nota de 1 a 5 (con comentario opcional; no se publica en la tienda). Media, número y reparto por nota; las bajas (1-2) arriba con su pedido. Debajo, cuántas veces se pidió (Blue o Mis pedidos), se abrió y, tras una nota baja, se abrió el chat. Los eventos, solo de visitantes que aceptaron la analítica."
            >
              {!valoraciones ? (
                <Text nativeID="analitica-valoraciones" style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, textAlign: "center" }}>
                  Las valoraciones de pedidos aún no están activadas (falta aplicar su migración).
                </Text>
              ) : (
                <View nativeID="analitica-valoraciones" style={{ gap: 10 }}>
                  <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Ionicons name="star-outline" size={16} color={COLORS.accentDark} />
                    <Text nativeID="analitica-valoraciones-resumen" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      {valoraciones.filas.length
                        ? `Media ${(valoraciones.filas.reduce((s, v) => s + v.nota, 0) / valoraciones.filas.length).toFixed(1).replace(".", ",")} de 5 · ${valoraciones.filas.length} ${valoraciones.filas.length === 1 ? "valoración" : "valoraciones"}`
                        : "Aún no hay valoraciones"}{" "}
                      · pedidas por Blue {valoraciones.pedidas.blue} · en Mis pedidos {valoraciones.pedidas.mis_pedidos} · abiertas {valoraciones.abiertas} · nota baja con chat{" "}
                      {valoraciones.chats}
                    </Text>
                  </View>
                  <View nativeID="analitica-valoraciones-reparto" style={{ gap: 4 }}>
                    {[5, 4, 3, 2, 1].map((n) => {
                      const cuantas = valoraciones.filas.filter((v) => v.nota === n).length;
                      const total = valoraciones.filas.length || 1;
                      return (
                        <View key={n} nativeID={`analitica-valoraciones-nota-${n}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text style={{ color: COLORS.text, fontSize: TAMANOS.minimo, fontWeight: "800", width: 26 }}>{n} ★</Text>
                          <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: "#EEF3F8", overflow: "hidden" }}>
                            <View style={{ width: `${Math.round((cuantas / total) * 100)}%`, height: 8, backgroundColor: n <= 2 ? COLORS.danger : COLORS.accent }} />
                          </View>
                          <Text style={{ color: COLORES_TEXTO.azulTexto, fontSize: TAMANOS.minimo, fontWeight: "900", minWidth: 24, textAlign: "right" }}>{cuantas}</Text>
                        </View>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    <ChipButton label="Todas" active={filtroNota === null} onPress={() => setFiltroNota(null)} />
                    {[5, 4, 3, 2, 1].map((n) => (
                      <ChipButton key={n} label={`${n} ★`} active={filtroNota === n} onPress={() => setFiltroNota(n)} />
                    ))}
                  </View>
                  <View nativeID="analitica-valoraciones-lista" style={{ gap: 6 }}>
                    {(() => {
                      // Las bajas (1-2) primero; dentro, las más recientes.
                      const lista = valoraciones.filas
                        .filter((v) => filtroNota === null || v.nota === filtroNota)
                        .sort((a, b) => Number(b.nota <= 2) - Number(a.nota <= 2) || b.creado_en.localeCompare(a.creado_en))
                        .slice(0, 20);
                      if (!lista.length) return <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo }}>Ninguna con ese filtro.</Text>;
                      return lista.map((v) => (
                        <Pressable
                          key={v.pedidoId}
                          nativeID={`analitica-valoracion-${v.ref || v.pedidoId}`}
                          onPress={() => router.push(`/admin/pedidos${v.ref ? `?buscar=${encodeURIComponent(v.ref)}` : ""}` as never)}
                          accessibilityRole="link"
                          accessibilityLabel={`Ver el pedido ${v.ref}: ${v.nota} de 5`}
                          style={({ pressed }) => ({ minHeight: TACTIL.minimo, justifyContent: "center", gap: 2, opacity: pressed ? 0.75 : 1 })}
                        >
                          <Text style={{ color: v.nota <= 2 ? COLORS.danger : COLORS.text, fontSize: TAMANOS.minimo, fontWeight: "800" }}>
                            {"★".repeat(v.nota)}
                            {"☆".repeat(5 - v.nota)} · Pedido {v.ref || "sin referencia"} ·{" "}
                            <Text style={{ color: COLORES_TEXTO.azulTexto, fontWeight: "900" }}>Ver pedido</Text>
                          </Text>
                          {v.comentario ? (
                            <Text numberOfLines={2} style={{ color: COLORES_TEXTO.secundario, fontSize: TAMANOS.minimo, lineHeight: 18 }}>
                              «{v.comentario}»
                            </Text>
                          ) : null}
                        </Pressable>
                      ));
                    })()}
                  </View>
                </View>
              )}
            </SectionCard>

            <SectionCard
              title="Velocidad de la tienda (30 días)"
              subtitle="Cuánto tarda en verse la primera pantalla útil (las primeras tarjetas o la ficha) al abrir la tienda: la mediana (la mitad de las visitas tarda menos) y el percentil 75 (tres de cada cuatro tardan menos), por pantalla y por móvil, tableta u ordenador. Una vez por visita y sin datos de nadie; solo visitantes que aceptaron la analítica."
            >
              {!velocidad ? (
                <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, textAlign: "center" }}>No se ha podido cargar la velocidad de la tienda.</Text>
              ) : velocidad.length === 0 ? (
                <Text nativeID="analitica-velocidad" style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, textAlign: "center" }}>
                  Aún no hay visitas medidas.
                </Text>
              ) : (
                <View nativeID="analitica-velocidad" style={{ gap: 8 }}>
                  {velocidad.map((f) => (
                    <View
                      key={`${f.pantalla}-${f.ancho}`}
                      nativeID={`analitica-velocidad-${f.pantalla}-${f.ancho}`}
                      style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}
                    >
                      <Ionicons name={f.ancho === "ordenador" ? "desktop-outline" : f.ancho === "tableta" ? "tablet-portrait-outline" : "phone-portrait-outline"} size={16} color={COLORS.accentDark} />
                      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.minimo, flexGrow: 1 }}>
                        {NOMBRE_PANTALLA_VELOCIDAD[f.pantalla]} · {NOMBRE_ANCHO_VELOCIDAD[f.ancho]}
                      </Text>
                      <Text style={{ color: COLORS.text, fontSize: TAMANOS.minimo, fontWeight: "700" }}>
                        mediana {segundos(f.mediana)} · p75 {segundos(f.p75)} · {f.n} {f.n === 1 ? "visita" : "visitas"}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </SectionCard>

            <SectionCard
              title="Redes sociales: Instagram y TikTok"
              subtitle="Visitas que llegan desde cada red y cuántas de ellas crean una cuenta (solo visitantes que aceptaron la analítica)."
            >
              <View nativeID="analitica-redes" style={{ gap: 10 }}>
                {redes.filas.map((f) => (
                  <View
                    key={f.red}
                    nativeID={`analitica-redes-${f.red}`}
                    style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "center", gap: 8 }}
                  >
                    <Ionicons name={f.red === "instagram" ? "logo-instagram" : "logo-tiktok"} size={18} color={COLORS.accentDark} />
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                      {f.nombre}: {f.llegadas} {f.llegadas === 1 ? "visita" : "visitas"} · {f.registros}{" "}
                      {f.registros === 1 ? "cuenta creada" : "cuentas creadas"}
                      {f.llegadas > 0 ? ` (${f.pct} % de sus visitas)` : ""}
                    </Text>
                  </View>
                ))}
                <Text nativeID="analitica-redes-resumen" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, textAlign: "center" }}>
                  {redes.mejor ? `Funciona mejor: ${redes.mejor}` : "Todavía no hay visitas desde las redes en estas fechas"} · cuentas
                  creadas en total: {redes.cuentas}
                </Text>
                <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, lineHeight: 17, textAlign: "center" }}>
                  Para que no se escape ninguna visita, pon en la biografía de Instagram videojuegoszaragoza.com/?utm_source=instagram y
                  en la de TikTok videojuegoszaragoza.com/?utm_source=tiktok.
                </Text>
              </View>
            </SectionCard>

            <SectionCard
              title="Noticias: visitas desde Google"
              subtitle="Páginas de noticias vistas por categoría y cuántas visitas entran por una noticia desde un buscador (sesiones; solo visitantes que aceptaron la analítica, sin guardar qué buscaron)."
            >
              <View nativeID="analitica-noticias-organicas" style={{ gap: 10 }}>
                <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <Ionicons name="logo-google" size={16} color={COLORS.accentDark} />
                  <Text nativeID="analitica-noticias-buscadores" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, flex: 1 }}>
                    Entran por una noticia desde Google: {noticiasOrganicas.google}{" "}
                    {noticiasOrganicas.google === 1 ? "sesión" : "sesiones"} · desde cualquier buscador: {noticiasOrganicas.desdeBuscadores}
                    {noticiasOrganicas.buscadores.length > 1
                      ? ` (${noticiasOrganicas.buscadores.map((b) => `${b.clave} ${b.n}`).join(" · ")})`
                      : ""}
                  </Text>
                </View>
                <View style={{ borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <Ionicons name="newspaper-outline" size={16} color={COLORS.accentDark} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text nativeID="analitica-noticias-vistas" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo }}>
                      Páginas de noticias vistas: {noticiasOrganicas.vistas} · índice de noticias: {noticiasOrganicas.indice} · «Comentar en el
                      Foro»: {noticiasOrganicas.comentar}
                    </Text>
                    {noticiasOrganicas.categorias.length ? (
                      <Text nativeID="analitica-noticias-categorias" style={{ color: COLORS.text, fontSize: TAMANOS.minimo }}>
                        Por categoría: {noticiasOrganicas.categorias.map((c) => `${c.clave} ${c.n}`).join(" · ")}
                      </Text>
                    ) : (
                      <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo }}>Aún nadie ha abierto la página de una noticia en estas fechas.</Text>
                    )}
                  </View>
                </View>
              </View>
            </SectionCard>

            <SectionCard
              title="Guía de Blue y Vender"
              subtitle="Sesiones que llegan a cada paso de la guía y qué pasa después con el formulario de Vender (solo visitantes que aceptaron la analítica)."
            >
              {guiaVender.empiezan === 0 ? (
                <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
                  Todavía no hay datos de la guía en este rango de fechas.
                </Text>
              ) : (
                <View style={{ gap: 10 }}>
                  {guiaVender.pasos.map((s) => (
                    <BarRow
                      key={s.step_label}
                      label={s.step_label.replace(/^Guía Blue: \d\d /, "")}
                      value={s.sessions}
                      maxValue={guiaVender.empiezan}
                      color={COLORS.accentDark}
                    />
                  ))}
                  <BarRow label="Guía completada" value={guiaVender.completada} maxValue={guiaVender.empiezan} color={COLORS.accentDark} />
                  <BarRow label="Guía saltada" value={guiaVender.saltada} maxValue={guiaVender.empiezan} color={COLORS.accentDark} />
                  {guiaVender.saltadaEn.length > 0 ? (
                    <View style={{ gap: 8, marginTop: 2 }}>
                      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.minimo }}>Dónde se salta la guía (los pasos que más gente pierden)</Text>
                      {guiaVender.saltadaEn.map((s) => (
                        <BarRow
                          key={s.step_label}
                          label={s.step_label.replace("Guía Blue: saltada en el paso ", "Paso ")}
                          value={s.sessions}
                          maxValue={guiaVender.empiezan}
                          color={COLORS.accentDark}
                        />
                      ))}
                    </View>
                  ) : null}
                  <BarRow label="Formulario abierto tras ver la guía (hasta 1 h después)" value={guiaVender.abiertoGuia} maxValue={guiaVender.empiezan} color={COLORS.accentDark} />
                  <BarRow label="Formulario enviado tras ver la guía" value={guiaVender.enviadoGuia} maxValue={guiaVender.empiezan} color={COLORS.accentDark} />
                  <View style={{ marginTop: 4, borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, gap: 4 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo }}>
                      Formulario de Vender (todas las vías): abierto {guiaVender.abierto} · enviado {guiaVender.enviado}
                    </Text>
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo }}>
                      De cada 100 que empiezan la guía, {Math.round((guiaVender.abiertoGuia / guiaVender.empiezan) * 100)} abren el formulario y{" "}
                      {Math.round((guiaVender.enviadoGuia / guiaVender.empiezan) * 100)} lo envían.
                    </Text>
                  </View>
                </View>
              )}
            </SectionCard>

            <SectionCard
              title="Conversiones por día"
              subtitle="Veces que se pulsó cada acción de compra, por día (hora de Madrid)."
            >
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {CONVERSION_EVENTS.map((c) => (
                  <View
                    key={c.key}
                    style={{
                      borderRadius: 12,
                      backgroundColor: COLORS.accent2,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                    }}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo }}>
                      {c.label}: {conversionTotals[c.key]}
                    </Text>
                  </View>
                ))}
              </View>

              {conversions.length === 0 ? (
                <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
                  Todavía no hay conversiones registradas en este rango de fechas.
                </Text>
              ) : (
                <View style={{ gap: 6 }}>
                  {conversions.map((d) => (
                    <View
                      key={d.day}
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: 10,
                        paddingVertical: 6,
                        borderTopWidth: 1,
                        borderTopColor: COLORS.border,
                      }}
                    >
                      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.minimo, minWidth: 48 }}>
                        {fmtDayLabel(d.day)}
                      </Text>
                      {CONVERSION_EVENTS.map((c) => (
                        <Text key={c.key} style={{ color: COLORS.muted, fontWeight: "700", fontSize: TAMANOS.minimo }}>
                          {c.label}: {d[c.key]}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              )}
            </SectionCard>

            <View style={{ flexDirection: isMobile ? "column" : "row", gap: 14 }}>
              <View style={{ flex: 1 }}>
                <SectionCard title="Categorías más vistas" subtitle="Sesiones que entraron en cada categoría.">
                  {topCategories.length === 0 ? (
                    <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>Sin datos en este rango.</Text>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {topCategories.map((c) => (
                        <BarRow
                          key={c.step_label}
                          label={c.step_label.replace(/^Categoría /, "")}
                          value={c.sessions}
                          maxValue={topCategories[0].sessions}
                          color="#22C55E"
                        />
                      ))}
                    </View>
                  )}
                </SectionCard>
              </View>

              <View style={{ flex: 1 }}>
                <SectionCard title="Productos más vistos" subtitle="Sesiones que abrieron la ficha de cada producto.">
                  {topProducts.length === 0 ? (
                    <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>Sin datos en este rango.</Text>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {topProducts.map((p) => (
                        <BarRow
                          key={p.step_label}
                          label={p.step_label.replace(/^Producto /, "")}
                          value={p.sessions}
                          maxValue={topProducts[0].sessions}
                          color="#8B5CF6"
                        />
                      ))}
                    </View>
                  )}
                </SectionCard>
              </View>
            </View>

            {/* Nota final como texto suelto, sin recuadro decorativo. */}
            <Detalle>
              Estos datos son de analítica propia (tabla analytics_events en Supabase), no de Vercel: Vercel Web Analytics no está
              activado en este proyecto y, aunque lo estuviera, solo vería la URL de cada página (por ejemplo /catalogo), no el
              detalle de qué categoría o producto se está viendo. Tus propias visitas como administrador no se cuentan en estas
              cifras.
            </Detalle>
          </>
          )}
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
