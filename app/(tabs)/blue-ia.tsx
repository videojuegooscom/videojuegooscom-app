/**
 * Archivo: app/(tabs)/blue-ia.tsx
 * Función: pantalla «Blue IA» (pestaña del asistente), en la dirección /blue-ia (admite ?q=, ?producto=, ?servicio=, ?pedido=, ?reparacion=, ?tema=).
 * Para qué sirve: el cliente conversa con el asistente de la tienda, que responde con datos reales del catálogo, enlaza a páginas útiles, enseña facturas y pasa la conversación al equipo cuando hace falta.
 * Conectado con: api/blue-ia.ts (respuestas), api/factura.ts (descarga de facturas), lib/supabase.ts (tablas blue_ia_conversaciones, blue_ia_mensajes, pedidos y facturas), lib/analiticaPropia.ts, lib/horarioAtencion.ts, lib/abrirEnlaceExterno.ts, components/ConversacionProducto.tsx (abrirChatEquipo), components/marca/MarcaAnimada.tsx.
 * Utilizado por: Expo Router (dirección /blue-ia, pestaña de app/(tabs)/_layout.tsx); la abren app/(tabs)/index.tsx (preguntas frecuentes), app/(tabs)/cesta.tsx («Blue, ayúdame a elegir»), app/servicio/[id].tsx y app/producto/[id].tsx (preguntar) y components/AsistenteBlue.tsx.
 * Dependencias: react, react-native, expo-router, @expo/vector-icons, expo-linear-gradient, @react-native-async-storage/async-storage.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: pantalla "Blue IA", el asistente de la tienda. Ahora es una
 * conversación de pantalla completa, estilo ChatGPT, con el mismo lenguaje
 * visual que usa "Chat Global" (app/(tabs)/chat-global.tsx): los mensajes
 * ocupan toda la pantalla, hay un compositor fijo abajo del todo con un
 * cuadro de texto redondeado + botón circular de enviar, y no hay ninguna
 * tarjeta grande de bienvenida estorbando (la ventana «Qué es Blue IA» del
 * icono "ⓘ" se quitó por completo a petición del dueño, 2026-11-26).
 *
 * Cómo funciona:
 * - El navegador nunca habla directamente con OpenAI (la clave es secreta):
 *   handleAsk() manda un POST a /api/blue-ia con la pregunta y las últimas
 *   vueltas de la conversación; esa función serverless añade contexto real
 *   del catálogo (Supabase) y devuelve el texto de la respuesta junto con,
 *   si encaja, una lista de "socialChips" (redes sociales activas a
 *   mostrar como botones — ver más abajo BlueIASocialChips). Ver
 *   api/blue-ia.ts para el prompt exacto y las variables de entorno que
 *   necesita (sobre todo OPENAI_API_KEY en Vercel).
 * - Historial por cuenta (tablas blue_ia_conversaciones y blue_ia_mensajes,
 *   ver supabase/migrations/20261013170000_historial_blue_ia.sql; RLS: cada
 *   usuario solo ve las suyas). Con sesión, al entrar se abre la última
 *   conversación no archivada; cada pregunta + respuesta se guarda al llegar
 *   la respuesta (la conversación se crea con el primer mensaje; los errores
 *   no se guardan). El icono del reloj (arriba) abre el panel Historial:
 *   abrir, archivar o empezar una nueva. Sin sesión no se guarda nada y el
 *   panel invita a iniciar sesión. Si llegan ?producto/?pedido/?reparacion/
 *   ?tema o ?q, se empieza una conversación nueva en vez de abrir la última.
 *   Si las tablas aún no existen, la pantalla funciona igual, sin guardar.
 * - Horario del equipo (dueño, 2026-11-03): siempre a la vista junto a
 *   «Hablar con el equipo» (si atiende ahora o cuándo vuelve, hora de España,
 *   lib/horarioAtencion.ts). Fuera de horario, al pulsarlo sale antes un aviso
 *   que recomienda esperar y ofrece «Seguir con Blue» o «Escribir al equipo
 *   igualmente»; Blue IA también lo recuerda en sus respuestas (api/blue-ia.ts).
 *   Analítica propia: blue_ia_equipo_fuera_horario {accion}.
 * - Saludo y «Nueva conversación» (dueño, 2026-11-03): hasta saber si hay una
 *   conversación guardada que abrir no se saluda (antes el saludo se escribía
 *   letra a letra y luego aparecía la conversación debajo, como si Blue IA
 *   reescribiera el primer mensaje). Con una conversación en marcha, el saludo
 *   se queda quieto y junto a «Hablar con el equipo» sale «Nueva conversación»
 *   (la anterior queda en el Historial). Analítica propia:
 *   blue_ia_conversacion_retomada y blue_ia_conversacion_nueva {desde}, en
 *   Administración → Analítica.
 * - Las respuestas de Blue IA nunca traen enlaces ni markdown escrito por el
 *   modelo (antes se veía feo, tipo "[texto](url)", porque este texto se
 *   pinta en un <Text> normal sin ningún intérprete de markdown): cuando la
 *   respuesta habla de seguir a la tienda en redes sociales, el servidor
 *   manda aparte "socialChips" con los datos limpios de cada red activa que
 *   encaje, y BlueIABubble los pinta como una fila de botones de verdad con
 *   su icono — nunca como texto suelto.
 * - Las "sugerencias rápidas" (antes eran 4 tarjetas grandes) ahora son una
 *   fila de chips que se desliza en horizontal justo ENCIMA del compositor,
 *   y solo se ven antes de la primera pregunta (antes de que haya
 *   conversación de verdad) — exactamente igual que las sugerencias
 *   iniciales de ChatGPT: en cuanto se manda la primera pregunta,
 *   desaparecen para dejarle todo el sitio a la conversación. Tocar una
 *   sugerencia manda esa pregunta directamente, como si el usuario la
 *   hubiera escrito él mismo.
 * - "Preguntas frecuentes" ya NO vive aquí: se movió a la portada (Inicio),
 *   entre reseñas y el pie de página (ver app/(tabs)/index.tsx). Desde ahí,
 *   tocar una pregunta frecuente trae a la persona directamente a esta
 *   pantalla con esa pregunta ya enviada — se detecta con el parámetro de
 *   navegación "q" (useLocalSearchParams) y se manda automáticamente una
 *   sola vez al entrar. Lo mismo hace «Blue, ayúdame a elegir un artículo»
 *   de la Cesta (app/(tabs)/cesta.tsx).
 * - BLUE_IA_API_URL es relativa ("/api/blue-ia") en web, porque ahí Vercel
 *   sirve la función serverless en el mismo dominio que la app. Esto solo
 *   funciona una vez desplegado en Vercel (no en `expo start --web` local,
 *   que no tiene funciones serverless).
 *
 * - Contexto por URL: ?producto=<id>, ?servicio=<id>, ?pedido=<referencia VZ-XXXX-XXXX>,
 *   ?reparacion=<id> o ?tema=<texto>. Se muestra "Preguntas por: …" arriba y
 *   se antepone al primer mensaje que se manda a la API (mismo formato
 *   {message, history}). ?servicio lo manda «Preguntar por este servicio» de
 *   app/servicio/[id].tsx; desde aquí, «Hablar con el equipo» abre el chat de
 *   la tienda con el resumen, que nombra el servicio.
 * - "Hablar con el equipo": un solo botón, siempre junto al recuadro de
 *   escribir (ya no se repite bajo la respuesta con «¿Prefieres que te
 *   atienda una persona?»; petición del dueño, 2026-11-01). Abre el chat
 *   privado con la tienda (abrirChatEquipo) con un resumen de las últimas 6
 *   vueltas; sin sesión, lleva a /perfil con un aviso.
 * - «Ver mis facturas» (botón «facturas», dueño, 2026-11-11): abre Perfil → «Mis pedidos» con el
 *   filtro «Facturas» (/perfil?tab=seguimientos&filtro=facturas). BlueIAFacturas consulta con la
 *   sesión del cliente sus pedidos y facturas (no se fía del modelo) y, si alguna tiene PDF, añade
 *   «Descargar factura F-…» (/api/factura?pedido=… y abrirDescarga de lib/abrirEnlaceExterno.ts); sin
 *   factura, el plazo; sin sesión, «Inicia sesión para ver tus facturas». Analítica propia: «Blue: ver
 *   mis facturas» y «Blue: factura descargada» (app/admin/analytics.tsx, #analitica-facturas).
 * - Cada respuesta lleva al lado a Blue, la mascota de atención al cliente
 *   (la misma imagen que Blue flotante: AvatarBlue), quieta; mientras
 *   escribe, se mueve.
 *
 * Conectado con:
 * - components/ConversacionProducto.tsx → abrirChatEquipo.
 * - api/blue-ia.ts → el backend real de este asistente (prompt + selección
 *   de qué redes sociales mandar como "socialChips").
 * - app/(tabs)/index.tsx → la sección "Preguntas frecuentes" de Inicio
 *   enlaza aquí con "/blue-ia?q=..." para preguntar directamente.
 */
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import MarcaAnimada from "../../components/marca/MarcaAnimada";
import { abrirChatEquipo } from "../../components/ConversacionProducto";
import { portadasDeProductos } from "../../components/BarraBusqueda";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ImagenInteligente from "../../components/ImagenInteligente";
import { medirEvento } from "../../lib/analiticaPropia";
import { estadoAtencion, HORARIO_CORTO, type EstadoAtencion } from "../../lib/horarioAtencion";
import { abrirDescarga, abrirEnlaceExterno } from "../../lib/abrirEnlaceExterno";
import { supabase } from "../../lib/supabase";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

// En web, Vercel sirve api/blue-ia.ts en el mismo dominio que la app, así
// que una ruta relativa basta. Fuera de web (una build nativa futura) no
// hay "dominio actual" al que apuntar una ruta relativa, así que se usa la
// URL completa de producción.
const BLUE_IA_API_URL =
  Platform.OS === "web" ? "/api/blue-ia" : "https://videojuegoszaragoza.com/api/blue-ia";

const MAX_QUESTION_LENGTH = 500;

const COLORS = {
  bg: "#FFFFFF",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  accent: "#1EA7E8",
  primary: "#1EA7E8",
  accentSoft: "#EAF6FD",
  accentBorder: "#BEE6FA",
  success: "#22C55E",
  gold: "#B8860B",
  dangerSoft: "#FDECEC",
  dangerBorder: "#F5B5B5",
  overlay: "rgba(3,10,18,0.76)",
};

type QuickAction = {
  id: string;
  icon: IoniconName;
  title: string;
  // Pregunta real que se manda a Blue IA al tocar la sugerencia — el
  // usuario no tiene que escribir nada, la sugerencia "pregunta por él".
  prompt: string;
};


// Un "chip" de red social que puede venir pegado a una respuesta de Blue IA
// (ver api/blue-ia.ts → pickSocialChips) — datos limpios, nunca texto: el
// enlace real lo abre BlueIASocialChips, nunca aparece escrito en el mensaje.
type SocialChip = { platform: string; label: string; href: string };

// Un artículo del catálogo que nombra la respuesta (api/blue-ia.ts → pickProductChips):
// se pinta como botón con su miniatura que abre su ficha. similar: no es el nombrado sino uno parecido.
type ProductChip = { id: string; title: string; price: number; similar?: boolean };

// Un botón de la tienda que Blue IA ofrece en su respuesta (api/blue-ia.ts → accionChips; dueño, 2026-11-07): el
// servidor solo manda el tipo (de una lista cerrada) y, si encaja, el artículo o la búsqueda que contó la persona;
// aquí se pone el nombre, el icono y la pantalla (ACCIONES_BLUE). Nunca se abre una ruta que mande el servidor.
type AccionChip = { tipo: string; articulo?: string; busqueda?: string };

const ACCIONES_BLUE: Record<
  string,
  { label: (c: AccionChip) => string; icono: React.ComponentProps<typeof Ionicons>["name"]; ruta: (c: AccionChip) => string }
> = {
  vender: {
    label: (c) => (c.articulo ? `Vender ${c.articulo}` : "Vender ahora"),
    icono: "cash-outline",
    ruta: (c) => `/vender${c.articulo ? `?articulo=${encodeURIComponent(c.articulo)}` : ""}`,
  },
  cambio: {
    label: (c) => (c.articulo ? `Cambiar ${c.articulo}` : "Cambiar mi artículo"),
    icono: "swap-horizontal-outline",
    ruta: (c) => `/vender?cambio=1${c.articulo ? `&articulo=${encodeURIComponent(c.articulo)}` : ""}`,
  },
  reparar: { label: () => "Reparación y limpieza", icono: "construct-outline", ruta: () => "/servicios" },
  catalogo: {
    label: (c) => (c.busqueda ? `Buscar «${c.busqueda}»` : "Ver el catálogo"),
    icono: "search-outline",
    ruta: (c) => `/catalogo${c.busqueda ? `?query=${encodeURIComponent(c.busqueda)}` : ""}`,
  },
  seguimientos: { label: () => "Mis seguimientos", icono: "receipt-outline", ruta: () => "/perfil?tab=seguimientos" },
  // «Mis pedidos» con el filtro «Facturas» ya puesto; la descarga directa la añade BlueIAFacturas con la sesión.
  facturas: { label: () => "Ver mis facturas", icono: "document-text-outline", ruta: () => "/perfil?tab=seguimientos&filtro=facturas" },
  megusta: { label: () => "Mis me gusta", icono: "heart-outline", ruta: () => "/perfil?tab=megusta" },
  perfil: { label: () => "Mi perfil", icono: "person-circle-outline", ruta: () => "/perfil" },
  cesta: { label: () => "Ver mi cesta", icono: "bag-outline", ruta: () => "/cesta" },
  foro: { label: () => "Ir al Foro", icono: "chatbubbles-outline", ruta: () => "/chat-global" },
  envios: { label: () => "Política de envíos", icono: "cube-outline", ruta: () => "/politicas/envios" },
  devoluciones: { label: () => "Devoluciones y garantía", icono: "shield-checkmark-outline", ruta: () => "/politicas/devoluciones" },
  quienes: { label: () => "Quiénes somos", icono: "people-outline", ruta: () => "/quienes-somos" },
};

// Solo los botones conocidos, con su texto corto y sin nada raro (como mucho 3).
function leerAccionChips(v: unknown): AccionChip[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const limpio = (t: unknown, max: number) =>
    typeof t === "string" && !/[<>{}[\]`\\]|https?:/i.test(t) ? t.replace(/\s+/g, " ").trim().slice(0, max) || undefined : undefined;
  const salida = v
    .filter((c: any) => c && typeof c.tipo === "string" && ACCIONES_BLUE[c.tipo])
    .map((c: any) => ({ tipo: c.tipo as string, articulo: limpio(c.articulo, 60), busqueda: limpio(c.busqueda, 40) }))
    .slice(0, 3);
  return salida.length ? salida : undefined;
}

type BlueIAMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  // Texto real enviado a la API (con el contexto antepuesto, si lo hay).
  apiText?: string;
  isError?: boolean;
  socialChips?: SocialChip[];
  productChips?: ProductChip[];
  accionChips?: AccionChip[];
  // Referencia VZ- que nombró la persona (o la respuesta), para «Descargar factura» de ese pedido si es suyo.
  refPedido?: string;
};


const AVISO_LOGIN = "Inicia sesión para hablar con nuestro equipo";
const AVISO_LOGIN_HISTORIAL = "Inicia sesión para guardar tus conversaciones";

// Conversación guardada (lista del panel Historial).
type ConversacionGuardada = {
  id: string;
  titulo: string;
  contexto: string | null;
  updated_at: string;
};

// Botones de una respuesta de Blue guardados con el mensaje (columna blue_ia_mensajes.botones, dueño 2026-11-26): solo
// los artículos (id, nombre, precio, si es parecido), las acciones de la tienda y la referencia del pedido. Al volver a
// abrir la conversación se leen con las mismas comprobaciones que al llegar de la API, y los artículos se comprueban
// contra el catálogo (los vendidos o retirados no salen).
type BotonesGuardados = { productChips?: ProductChip[]; accionChips?: AccionChip[]; refPedido?: string };
function botonesParaGuardar(b: BotonesGuardados): BotonesGuardados | null {
  const salida: BotonesGuardados = {};
  if (b.productChips?.length)
    salida.productChips = b.productChips.slice(0, 6).map((c) => ({ id: c.id, title: c.title.slice(0, 120), price: c.price, ...(c.similar ? { similar: true } : {}) }));
  if (b.accionChips?.length) salida.accionChips = b.accionChips.slice(0, 3);
  if (b.refPedido) salida.refPedido = b.refPedido;
  return Object.keys(salida).length ? salida : null;
}
function leerBotonesGuardados(v: unknown): BotonesGuardados {
  if (!v || typeof v !== "object") return {};
  const o = v as Record<string, unknown>;
  const productChips = Array.isArray(o.productChips)
    ? o.productChips
        .filter((c: any) => c && typeof c.id === "string" && /^[0-9a-f-]{36}$/i.test(c.id) && typeof c.title === "string")
        .slice(0, 6)
        .map((c: any) => ({ id: c.id, title: String(c.title).slice(0, 120), price: Number(c.price ?? 0), similar: c.similar === true }))
    : undefined;
  const refPedido = typeof o.refPedido === "string" && /^VZ-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(o.refPedido) ? o.refPedido : undefined;
  return { productChips: productChips?.length ? productChips : undefined, accionChips: leerAccionChips(o.accionChips), refPedido };
}
// La columna «botones» aún no existe (migración sin aplicar): se sigue guardando y leyendo solo el texto.
function sinColumnaBotones(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /botones/i.test(error.message ?? "");
}

// La migración del historial aún no aplicada: se sigue sin guardar y sin avisar.
function tablaNoExiste(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|could not find the table/i.test(error.message ?? "")
  );
}

// Fecha en hora de Madrid, corta: "13 oct, 17:05".
function fechaMadrid(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-ES", {
      timeZone: "Europe/Madrid",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function paramTexto(v: unknown): string {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" ? s.trim().slice(0, 140) : "";
}

// Siempre dos decimales y punto de miles, igual que en la tienda: 1.299,00€.
function fmtEUR(n: number) {
  const safe = Number.isFinite(n) ? n : 0;
  const [entero, cent] = (Math.round(safe * 100) / 100).toFixed(2).split(".");
  return `${entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cent}€`;
}

// Resumen para el equipo: contexto + últimas 6 vueltas, recortado a ~1200 caracteres.
function construirResumen(contexto: string, mensajes: BlueIAMessage[]): string {
  const cabecera = "Resumen de mi conversación con Blue IA:";
  const lineas = mensajes
    .filter((m) => m.id !== "welcome" && !m.isError)
    .slice(-12)
    .map((m) => {
      const t = m.text.replace(/\s+/g, " ").trim();
      const corto = t.length > 220 ? `${t.slice(0, 219)}…` : t;
      return `${m.role === "user" ? "Yo" : "Blue IA"}: ${corto}`;
    });
  const partes = [cabecera, ...(contexto ? [contexto] : []), ...lineas];
  let texto = partes.join("\n");
  // Si no cabe, se quitan las vueltas más antiguas.
  while (texto.length > 1200 && lineas.length > 1) {
    lineas.shift();
    texto = [cabecera, ...(contexto ? [contexto] : []), ...lineas].join("\n");
  }
  return texto.slice(0, 1200);
}

const WELCOME_MESSAGE: BlueIAMessage = {
  id: "welcome",
  role: "assistant",
  text:
    "Hola, soy Blue IA. Pregúntame lo que necesites sobre productos, ventas, cambios, reparaciones o pago a plazos — o toca una de las sugerencias de abajo.",
};

// Saludos de Blue IA: se escriben letra a letra al entrar en la sección y cambian cada vez que
// se vuelve a entrar (se guarda por dónde va la rotación). Solo hablan de lo que la tienda
// hace de verdad. El primero es el de siempre.
const SALUDO_KEY = "videojuegoszaragoza:blue_ia_saludo";

function momentoDelDia(): string {
  const h = new Date().getHours();
  return h < 6 || h >= 21 ? "Buenas noches" : h < 14 ? "Buenos días" : "Buenas tardes";
}

const SALUDOS: (() => string)[] = [
  () => WELCOME_MESSAGE.text,
  () => `${momentoDelDia()}. ¿Buscas una consola, un videojuego o un accesorio? Dime tu presupuesto y te recomiendo lo que mejor encaja.`,
  () => "¡Hola de nuevo! ¿Tienes algo que vender o cambiar? Cuéntame qué es y cómo está, y te explico cómo hacerlo.",
  () => "¿Algo no funciona como debe? Cuéntame qué le pasa a tu consola y te oriento sobre reparación, limpieza o mantenimiento.",
  () => "¿Quieres ver lo último que ha llegado? Pregúntame «¿qué hay nuevo?» y te lo enseño.",
  () => "¿Dudas con el envío, la recogida en Zaragoza o la reserva de 15 minutos de la cesta? Pregúntame.",
  () => "Dime qué buscas, por ejemplo una Switch OLED. Si ahora no está, te aviso en cuanto llegue.",
  () => "Estoy aquí para lo que necesites: elegir, vender, cambiar, reparar o pagar a plazos. ¿Por dónde empezamos?",
];

// Icono + color de marca por plataforma, para pintar los "socialChips" que
// puede traer una respuesta de Blue IA. Deliberadamente duplicado del mapa
// de components/EnlacesRedesSociales.tsx (mismo motivo que ya se explica ahí y en
// api/blue-ia.ts: cada archivo vive en su propio mundo — este es pantalla,
// aquel es un componente compartido, y api/blue-ia.ts es una función
// serverless aparte — así que mantenerlo en tres sitios pequeños es más
// simple que forzar una importación cruzada solo para un mapa de iconos).
const SOCIAL_CHIP_ICONS: Record<
  string,
  { render: (color: string, size: number) => React.ReactNode; color: string }
> = {
  instagram: {
    render: (color, size) => <Ionicons name="logo-instagram" size={size} color={color} />,
    color: "#C1327A",
  },
  tiktok: {
    render: (color, size) => <MaterialIcons name="tiktok" size={size} color={color} />,
    color: "#0B2138",
  },
  whatsapp: {
    render: (color, size) => <Ionicons name="logo-whatsapp" size={size} color={color} />,
    color: "#1F9E52",
  },
  youtube: {
    render: (color, size) => <Ionicons name="logo-youtube" size={size} color={color} />,
    color: "#D6291D",
  },
  gmail: {
    render: (color, size) => <MaterialCommunityIcons name="gmail" size={size} color={color} />,
    color: "#C5382B",
  },
  apple_maps: {
    render: (color, size) => <Ionicons name="logo-apple" size={size} color={color} />,
    color: "#0B2138",
  },
  facebook_marketplace: {
    render: (color, size) => <Ionicons name="logo-facebook" size={size} color={color} />,
    color: "#1461D2",
  },
  wallapop: {
    render: (color, size) => (
      <Text style={{ color, fontWeight: "900", fontSize: Math.round(size * 0.75) }}>W</Text>
    ),
    color: "#00C298",
  },
  vinted: {
    render: (color, size) => (
      <Text style={{ color, fontWeight: "900", fontSize: Math.round(size * 0.75) }}>V</Text>
    ),
    color: "#09B1BA",
  },
};

function openSocialChip(href: string) {
  try {
    // Síncrono a propósito — ver la nota de components/EnlacesRedesSociales.tsx: el
    // truco de abrir en Chrome (lib/abrirEnlaceExterno.ts) necesita ocurrir
    // dentro del mismo toque del usuario.
    abrirEnlaceExterno(href);
  } catch {
    // Silencioso: un enlace mal formado no debe romper la conversación.
  }
}

export default function BlueIAScreen() {
  const params = useLocalSearchParams<{
    q?: string;
    producto?: string;
    servicio?: string;
    pedido?: string;
    reparacion?: string;
    tema?: string;
  }>();
  const productoId = paramTexto(params.producto);
  const servicioId = paramTexto(params.servicio);
  const pedido = paramTexto(params.pedido);
  const reparacion = paramTexto(params.reparacion);
  const tema = paramTexto(params.tema);

  // Producto por el que se pregunta (si se llega desde su ficha).
  const [producto, setProducto] = useState<{ title: string; price: number | null } | null>(null);
  useEffect(() => {
    if (!productoId) {
      setProducto(null);
      return;
    }
    let vivo = true;
    supabase
      .from("products")
      .select("title,price_eur")
      .eq("id", productoId)
      .maybeSingle<{ title: string; price_eur: number | null }>()
      .then(
        ({ data }) => {
          if (vivo && data) {
            setProducto({
              title: data.title,
              price: data.price_eur == null ? null : Number(data.price_eur),
            });
          }
        },
        () => {}
      );
    return () => {
      vivo = false;
    };
  }, [productoId]);

  // Servicio por el que se pregunta (si se llega desde su ficha, «Preguntar por este servicio»).
  const [servicio, setServicio] = useState<{ title: string; price: number | null } | null>(null);
  useEffect(() => {
    if (!servicioId) {
      setServicio(null);
      return;
    }
    let vivo = true;
    supabase
      .from("services")
      .select("title,price_eur")
      .eq("id", servicioId)
      .maybeSingle<{ title: string; price_eur: number | null }>()
      .then(
        ({ data }) => {
          if (vivo && data) setServicio({ title: data.title, price: data.price_eur == null ? null : Number(data.price_eur) });
        },
        () => {}
      );
    return () => {
      vivo = false;
    };
  }, [servicioId]);

  // Texto visible ("Preguntas por: …") y prefijo para el primer mensaje a la IA.
  const contexto = useMemo(() => {
    if (productoId) {
      if (!producto) return { visible: "este producto", prefijo: "" };
      const precio = producto.price != null && producto.price > 0 ? `, ${fmtEUR(producto.price)}` : "";
      return {
        visible: `${producto.title}${precio}`,
        prefijo: `[Sobre el producto: ${producto.title}${precio}]`,
      };
    }
    if (servicioId) {
      if (!servicio) return { visible: "este servicio", prefijo: "" };
      const precio = servicio.price != null && servicio.price > 0 ? `, ${fmtEUR(servicio.price)}` : "";
      return {
        visible: `el servicio ${servicio.title}${precio}`,
        prefijo: `[Sobre el servicio: ${servicio.title}${precio}]`,
      };
    }
    // ?pedido=VZ-XXXX-XXXX: la referencia del pedido (dueño, 2026-11-11: nunca el número interno). Un enlace antiguo con
    // el número se queda en «tu pedido», sin enseñarlo.
    if (pedido) {
      const ref = /^VZ-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(pedido) ? pedido.toUpperCase() : "";
      return ref
        ? { visible: `tu pedido ${ref}`, prefijo: `[Sobre mi pedido ${ref}]` }
        : { visible: "tu pedido", prefijo: "[Sobre mi pedido]" };
    }
    if (reparacion)
      return { visible: `tu reparación ${reparacion}`, prefijo: `[Sobre mi reparación: ${reparacion}]` };
    if (tema) return { visible: tema, prefijo: `[Tema: ${tema}]` };
    return null;
  }, [productoId, producto, servicioId, servicio, pedido, reparacion, tema]);

  const [draft, setDraft] = useState("");
  const [abriendoEquipo, setAbriendoEquipo] = useState(false);
  const [messages, setMessages] = useState<BlueIAMessage[]>([WELCOME_MESSAGE]);

  // Saludo: cada vez que se entra en la sección se elige el siguiente (la primera vez, el de
  // siempre) y se escribe letra a letra. Con la conversación empezada no se toca; con el
  // movimiento reducido activado se muestra entero y al instante.
  const [saludoMostrado, setSaludoMostrado] = useState(WELCOME_MESSAGE.text);
  const [escribiendo, setEscribiendo] = useState(false);
  const mensajesRef = useRef(messages);
  mensajesRef.current = messages;
  const escrituraRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const escribirSaludo = useCallback(async (texto: string) => {
    if (escrituraRef.current) clearInterval(escrituraRef.current);
    let reducido = false;
    try {
      reducido = await AccessibilityInfo.isReduceMotionEnabled();
    } catch {
      // se escribe normal
    }
    if (reducido) {
      setSaludoMostrado(texto);
      setEscribiendo(false);
      return;
    }
    let n = 0;
    setSaludoMostrado("");
    setEscribiendo(true);
    escrituraRef.current = setInterval(() => {
      n += 2;
      setSaludoMostrado(texto.slice(0, n));
      if (n >= texto.length) {
        if (escrituraRef.current) clearInterval(escrituraRef.current);
        escrituraRef.current = null;
        setEscribiendo(false);
      }
    }, 24);
  }, []);

  // Elige el siguiente saludo de la rotación y lo escribe.
  const saludarSiguiente = useCallback(
    async (sigue: () => boolean = () => true) => {
      let previo: number | null = null;
      try {
        const raw = await AsyncStorage.getItem(SALUDO_KEY);
        const n = raw === null ? NaN : Number(raw);
        previo = Number.isFinite(n) ? n : null;
      } catch {
        // sin almacenamiento: siempre el primero
      }
      if (!sigue()) return;
      const idx = previo === null ? 0 : (previo + 1) % SALUDOS.length;
      AsyncStorage.setItem(SALUDO_KEY, String(idx)).catch(() => {});
      escribirSaludo(SALUDOS[idx]());
    },
    [escribirSaludo]
  );

  // Al abrir una conversación guardada, el saludo queda quieto y entero (no se vuelve a escribir encima de ella).
  const dejarSaludoQuieto = useCallback(() => {
    if (escrituraRef.current) clearInterval(escrituraRef.current);
    escrituraRef.current = null;
    setEscribiendo(false);
    setSaludoMostrado(WELCOME_MESSAGE.text);
  }, []);

  // false mientras se mira si hay una conversación guardada que abrir (con sesión): hasta saberlo no se saluda. Antes se
  // escribía el saludo y luego aparecía la conversación debajo: parecía que Blue IA reescribía el primer mensaje (dueño,
  // 2026-11-03). Una vez true, ya no vuelve a false.
  const [historialListo, setHistorialListo] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!historialListo) return;
      let vivo = true;
      // Con una conversación en marcha (o la última, recién abierta), el saludo no se vuelve a escribir.
      if (mensajesRef.current.length <= 1) saludarSiguiente(() => vivo);
      return () => {
        vivo = false;
        if (escrituraRef.current) {
          clearInterval(escrituraRef.current);
          escrituraRef.current = null;
        }
        // Al salir se deja completo el que estaba, para que al volver no parpadee.
        setEscribiendo(false);
      };
    }, [historialListo, saludarSiguiente])
  );
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const showScrollToBottomRef = useRef(false);

  const scrollRef = useRef<ScrollView | null>(null);
  // Última pregunta llegada por la URL (?q=) que ya se mandó. La pestaña se queda montada: antes, tras la primera, ninguna
  // otra se mandaba (p. ej. «Blue, ayúdame a elegir un artículo» desde la Cesta después de una pregunta frecuente).
  const autoAskedRef = useRef("");

  // Copia siempre al día de messages, para poder mandar el historial real a
  // la API sin que handleAsk quede "atado" al estado del momento en que se
  // creó (evita mandar una conversación desactualizada si se piden varias
  // cosas seguidas).
  const messagesRef = useRef<BlueIAMessage[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // ---- Historial por cuenta ----
  // undefined = aún comprobando; null = sin sesión.
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [historialOpen, setHistorialOpen] = useState(false);
  const [conversaciones, setConversaciones] = useState<ConversacionGuardada[]>([]);
  // Archivadas (dueño, 2026-11-26): se ven en «Archivadas» del Historial y se pueden recuperar. Tras archivar, unos
  // segundos de «Deshacer».
  const [archivadas, setArchivadas] = useState<ConversacionGuardada[]>([]);
  const [deshacer, setDeshacer] = useState<ConversacionGuardada | null>(null);
  const deshacerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cargandoLista, setCargandoLista] = useState(false);
  // Contexto de la conversación guardada que está abierta ("Preguntas por: …").
  const [contextoGuardado, setContextoGuardado] = useState<string | null>(null);
  // El contexto de la URL solo vale para la conversación con la que se entra.
  const [usarContextoUrl, setUsarContextoUrl] = useState(true);
  const conversacionIdRef = useRef<string | null>(null);
  const historialDisponibleRef = useRef(true);
  // ¿Existe ya la columna «botones» de los mensajes? (se descubre al usarla).
  const columnaBotonesRef = useRef(true);
  // Cola de guardado: cada vuelta se guarda en orden, y cambiar de conversación espera a que acabe.
  const guardadoRef = useRef<Promise<void>>(Promise.resolve());
  const ultimaCargadaRef = useRef(false);

  const contextoActivo = usarContextoUrl ? contexto : null;
  const entraConContexto = !!(productoId || servicioId || pedido || reparacion || tema || paramTexto(params.q));

  useEffect(() => {
    let vivo = true;
    supabase.auth.getSession().then(
      ({ data }) => {
        if (vivo) setUserId(data.session?.user?.id ?? null);
      },
      () => {
        if (vivo) setUserId(null);
      }
    );
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => {
      vivo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Pasa los mensajes guardados al formato de la pantalla.
  const cargarMensajes = useCallback(async (conv: ConversacionGuardada) => {
    const pedir = (columnas: string) =>
      supabase.from("blue_ia_mensajes").select(columnas).eq("conversacion_id", conv.id).order("created_at", { ascending: true });
    let { data, error } = await pedir(columnaBotonesRef.current ? "id,rol,texto,botones" : "id,rol,texto");
    // Sin la columna «botones» (migración aún sin aplicar): solo el texto, como siempre.
    if (error && columnaBotonesRef.current && sinColumnaBotones(error)) {
      columnaBotonesRef.current = false;
      ({ data, error } = await pedir("id,rol,texto"));
    }
    if (error) {
      if (tablaNoExiste(error)) historialDisponibleRef.current = false;
      else console.warn("Blue IA: no se han podido cargar los mensajes", error);
      return null;
    }
    const filas = (data ?? []) as unknown as { id: string; rol: "user" | "assistant"; texto: string; botones?: unknown }[];
    const guardados = new Map(filas.map((f) => [f.id, f.rol === "assistant" ? leerBotonesGuardados(f.botones) : {}]));
    // Los artículos se comprueban contra el catálogo: solo los que siguen a la venta, con su nombre y precio de ahora.
    const ids = [...new Set([...guardados.values()].flatMap((b) => (b.productChips ?? []).map((c) => c.id)))];
    const vigentes = new Map<string, { title: string; price: number }>();
    if (ids.length) {
      const { data: prods } = await supabase.from("products").select("id,title,price_eur").in("id", ids).eq("status", "PUBLISHED").eq("is_active", true);
      for (const p of (prods ?? []) as { id: string; title: string; price_eur: number }[]) vigentes.set(p.id, { title: p.title, price: Number(p.price_eur ?? 0) });
    }
    let primeraUser = true;
    return filas.map<BlueIAMessage>((f) => {
      const m: BlueIAMessage = { id: f.id, role: f.rol, text: f.texto };
      const b = guardados.get(f.id) ?? {};
      const productChips = (b.productChips ?? []).filter((c) => vigentes.has(c.id)).map((c) => ({ ...c, ...vigentes.get(c.id)! }));
      if (productChips.length) m.productChips = productChips;
      if (b.accionChips) m.accionChips = b.accionChips;
      if (b.refPedido) m.refPedido = b.refPedido;
      // La primera pregunta vuelve a llevar el contexto delante para la API.
      if (f.rol === "user" && primeraUser) {
        primeraUser = false;
        if (conv.contexto) m.apiText = `[${conv.contexto}] ${f.texto}`;
      }
      return m;
    });
  }, []);

  // Sin sesión o con una pregunta/contexto de entrada no hay conversación guardada que esperar: se saluda ya.
  useEffect(() => {
    if (userId === null || entraConContexto) setHistorialListo(true);
  }, [userId, entraConContexto]);

  // Con la red muy lenta no se deja la pantalla esperando: a los 4 s se saluda igual (si la conversación llega después
  // y la persona aún no ha escrito, se abre y el saludo se queda quieto).
  useEffect(() => {
    if (historialListo) return;
    const t = setTimeout(() => setHistorialListo(true), 4000);
    return () => clearTimeout(t);
  }, [historialListo]);

  // Con sesión y sin contexto de entrada: abre la última conversación no archivada (sin volver a escribir el saludo).
  useEffect(() => {
    if (!userId || ultimaCargadaRef.current || entraConContexto) return;
    ultimaCargadaRef.current = true;
    let vivo = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("blue_ia_conversaciones")
          .select("id,titulo,contexto,updated_at")
          .eq("archivada", false)
          .order("updated_at", { ascending: false })
          .limit(1);
        if (error) {
          if (tablaNoExiste(error)) historialDisponibleRef.current = false;
          else console.warn("Blue IA: no se ha podido cargar el historial", error);
          return;
        }
        const conv = (data?.[0] ?? null) as ConversacionGuardada | null;
        if (!conv || !vivo) return;
        const msgs = await cargarMensajes(conv);
        // Si la persona ya ha empezado a escribir aquí, no se pisa su conversación.
        if (!vivo || !msgs || !msgs.length || messagesRef.current.some((m) => m.role === "user")) return;
        conversacionIdRef.current = conv.id;
        setContextoGuardado(conv.contexto);
        dejarSaludoQuieto();
        setMessages([WELCOME_MESSAGE, ...msgs]);
        void medirEvento("blue_ia_conversacion_retomada", "Blue IA: conversación retomada");
      } catch (e) {
        console.warn("Blue IA: error abriendo la última conversación", e);
      } finally {
        setHistorialListo(true);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [userId, entraConContexto, cargarMensajes, dejarSaludoQuieto]);

  // Guarda una vuelta (pregunta + respuesta); crea la conversación si es la primera.
  const guardarVuelta = useCallback(
    (pregunta: string, respuesta: string, contextoTexto: string | null, botones: BotonesGuardados | null = null) => {
      if (!userId || !historialDisponibleRef.current) return;
      guardadoRef.current = guardadoRef.current.then(async () => {
        if (!historialDisponibleRef.current) return;
        try {
          if (!conversacionIdRef.current) {
            const titulo = pregunta.replace(/\s+/g, " ").trim();
            const { data, error } = await supabase
              .from("blue_ia_conversaciones")
              .insert({
                titulo: titulo.length > 60 ? `${titulo.slice(0, 59)}…` : titulo || "Conversación",
                contexto: contextoTexto ? contextoTexto.slice(0, 300) : null,
              })
              .select("id")
              .single<{ id: string }>();
            if (error || !data) {
              if (tablaNoExiste(error)) historialDisponibleRef.current = false;
              else console.warn("Blue IA: no se ha podido crear la conversación", error);
              return;
            }
            conversacionIdRef.current = data.id;
            setContextoGuardado(contextoTexto);
          }
          const conversacion_id = conversacionIdRef.current;
          // Dos inserciones seguidas para que el orden por fecha sea exacto.
          for (const [rol, texto] of [
            ["user", pregunta],
            ["assistant", respuesta],
          ] as const) {
            const fila = { conversacion_id, rol, texto: texto.slice(0, 4000) };
            const conBotones = rol === "assistant" && botones && columnaBotonesRef.current;
            let { error } = await supabase.from("blue_ia_mensajes").insert(conBotones ? { ...fila, botones } : fila);
            // Sin la columna (migración aún sin aplicar): se guarda el texto como siempre.
            if (error && conBotones && sinColumnaBotones(error)) {
              columnaBotonesRef.current = false;
              ({ error } = await supabase.from("blue_ia_mensajes").insert(fila));
            }
            if (error) {
              if (tablaNoExiste(error)) historialDisponibleRef.current = false;
              else console.warn("Blue IA: no se ha podido guardar el mensaje", error);
              return;
            }
          }
        } catch (e) {
          console.warn("Blue IA: error guardando la conversación", e);
        }
      });
    },
    [userId]
  );

  const cargarLista = useCallback(async () => {
    if (!userId || !historialDisponibleRef.current) return;
    setCargandoLista(true);
    try {
      await guardadoRef.current;
      // Las de la lista y, aparte, las archivadas (apartado «Archivadas», para poder recuperarlas).
      const [activas, guardadas] = await Promise.all([
        supabase.from("blue_ia_conversaciones").select("id,titulo,contexto,updated_at").eq("archivada", false).order("updated_at", { ascending: false }).limit(50),
        supabase.from("blue_ia_conversaciones").select("id,titulo,contexto,updated_at").eq("archivada", true).order("updated_at", { ascending: false }).limit(50),
      ]);
      if (activas.error) {
        if (tablaNoExiste(activas.error)) historialDisponibleRef.current = false;
        else console.warn("Blue IA: no se ha podido cargar la lista", activas.error);
        return;
      }
      setConversaciones((activas.data ?? []) as ConversacionGuardada[]);
      if (!guardadas.error) setArchivadas((guardadas.data ?? []) as ConversacionGuardada[]);
    } finally {
      setCargandoLista(false);
    }
  }, [userId]);

  const abrirHistorial = useCallback(() => {
    setHistorialOpen(true);
    cargarLista();
  }, [cargarLista]);

  // Deja la pantalla como recién abierta (sin contexto de URL) y Blue IA saluda de nuevo. La conversación anterior
  // sigue guardada en el Historial. «desde»: el botón junto al recuadro de escribir o el Historial (analítica propia).
  const nuevaConversacion = useCallback(
    async (desde: "boton" | "historial" = "historial") => {
      await guardadoRef.current;
      conversacionIdRef.current = null;
      setUsarContextoUrl(false);
      setContextoGuardado(null);
      setErrorText(null);
      setMessages([WELCOME_MESSAGE]);
      setHistorialOpen(false);
      saludarSiguiente();
      void medirEvento("blue_ia_conversacion_nueva", "Blue IA: nueva conversación", { metadata: { desde } });
    },
    [saludarSiguiente]
  );

  const abrirConversacion = useCallback(
    async (conv: ConversacionGuardada) => {
      await guardadoRef.current;
      const msgs = await cargarMensajes(conv);
      if (!msgs) return;
      conversacionIdRef.current = conv.id;
      setUsarContextoUrl(false);
      setContextoGuardado(conv.contexto);
      setErrorText(null);
      dejarSaludoQuieto();
      setMessages([WELCOME_MESSAGE, ...msgs]);
      setHistorialOpen(false);
    },
    [cargarMensajes, dejarSaludoQuieto]
  );

  // Archivar (no se borra nada); si era la abierta, se empieza una nueva.
  const archivarConversacion = useCallback(
    async (conv: ConversacionGuardada) => {
      await guardadoRef.current;
      const { error } = await supabase
        .from("blue_ia_conversaciones")
        .update({ archivada: true })
        .eq("id", conv.id);
      if (error) {
        console.warn("Blue IA: no se ha podido archivar", error);
        return;
      }
      setConversaciones((prev) => prev.filter((c) => c.id !== conv.id));
      setArchivadas((prev) => [conv, ...prev.filter((c) => c.id !== conv.id)]);
      void medirEvento("blue_ia_archivar", "Blue IA: conversación archivada");
      // «Conversación archivada · Deshacer» durante 6 s.
      if (deshacerTimer.current) clearTimeout(deshacerTimer.current);
      setDeshacer(conv);
      deshacerTimer.current = setTimeout(() => setDeshacer(null), 6000);
      if (conversacionIdRef.current === conv.id) {
        conversacionIdRef.current = null;
        setUsarContextoUrl(false);
        setContextoGuardado(null);
        setMessages([WELCOME_MESSAGE]);
        saludarSiguiente();
      }
    },
    [saludarSiguiente]
  );

  // Recuperar una archivada (desde «Archivadas» o con «Deshacer»): vuelve a la lista en su sitio por fecha.
  const recuperarConversacion = useCallback(async (conv: ConversacionGuardada, desde: "archivadas" | "deshacer") => {
    const { error } = await supabase.from("blue_ia_conversaciones").update({ archivada: false }).eq("id", conv.id);
    if (error) {
      console.warn("Blue IA: no se ha podido recuperar", error);
      return;
    }
    if (deshacerTimer.current) clearTimeout(deshacerTimer.current);
    setDeshacer(null);
    setArchivadas((prev) => prev.filter((c) => c.id !== conv.id));
    setConversaciones((prev) =>
      [...prev.filter((c) => c.id !== conv.id), conv].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    );
    void medirEvento("blue_ia_recuperar", `Blue IA: conversación recuperada · ${desde}`, { metadata: { desde } });
  }, []);
  useEffect(
    () => () => {
      if (deshacerTimer.current) clearTimeout(deshacerTimer.current);
    },
    []
  );

  const quickActions = useMemo<QuickAction[]>(
    () => [
      {
        id: "1",
        icon: "game-controller-outline",
        title: "Ayúdame a elegir",
        prompt:
          "Quiero que me ayudes a elegir un producto. Pregúntame lo que necesites saber (presupuesto, qué busco, para qué lo quiero) antes de recomendarme algo.",
      },
      {
        // El horario ya no va fijo abajo (dueño, 2026-11-26): se pregunta solo con esta sugerencia.
        id: "horario",
        icon: "time-outline",
        title: "¿Cuál es el horario de atención?",
        prompt: "¿Cuál es el horario de atención?",
      },
      {
        id: "2",
        icon: "cash-outline",
        title: "Quiero vender",
        prompt: "Quiero vender un dispositivo. ¿Cómo funciona el proceso?",
      },
      {
        id: "3",
        icon: "swap-horizontal-outline",
        title: "Quiero cambiar",
        prompt:
          "Quiero entregar un dispositivo como parte de pago para otra compra. ¿Cómo funciona?",
      },
      {
        id: "4",
        icon: "construct-outline",
        title: "Reparación o limpieza",
        prompt: "Tengo una duda sobre reparación o limpieza de mi dispositivo. ¿Me puedes ayudar?",
      },
      {
        id: "5",
        icon: "sparkles-outline",
        title: "¿Qué ha llegado nuevo?",
        prompt: "¿Qué artículos han llegado nuevos a la tienda?",
      },
      {
        id: "6",
        icon: "logo-playstation",
        title: "¿Tenéis PS5?",
        prompt: "¿Qué tenéis de PlayStation 5 ahora mismo?",
      },
      {
        id: "7",
        icon: "game-controller-outline",
        title: "¿Tenéis Nintendo Switch?",
        prompt: "¿Qué tenéis de Nintendo Switch ahora mismo?",
      },
      {
        id: "8",
        icon: "logo-xbox",
        title: "¿Tenéis Xbox?",
        prompt: "¿Qué tenéis de Xbox ahora mismo?",
      },
      {
        id: "9",
        icon: "bag-handle-outline",
        title: "¿Cómo compro?",
        prompt: "¿Cómo funciona comprar en la tienda, desde la cesta hasta el pedido?",
      },
      {
        id: "10",
        icon: "cube-outline",
        title: "Envíos y entregas",
        prompt: "¿Cómo son los envíos y las entregas?",
      },
      {
        id: "11",
        icon: "card-outline",
        title: "Pago a plazos",
        prompt: "¿Se puede pagar a plazos?",
      },
      {
        id: "12",
        icon: "notifications-outline",
        title: "Avísame cuando llegue",
        prompt: "Busco algo que ahora no tenéis. ¿Cómo hago para que me aviséis cuando llegue?",
      },
    ],
    []
  );

  // Único punto por el que sale cualquier pregunta hacia Blue IA: lo llaman
  // el compositor de abajo, las sugerencias rápidas y el autoenvío al
  // llegar desde "Preguntas frecuentes" de Inicio.
  const handleAsk = useCallback(
    async (rawText?: string) => {
      const clean = (rawText ?? draft).trim();
      if (!clean || sending) return;

      if (clean.length > MAX_QUESTION_LENGTH) {
        setErrorText(`Escribe una pregunta más corta (máximo ${MAX_QUESTION_LENGTH} caracteres).`);
        return;
      }

      setErrorText(null);

      const historyForApi = messagesRef.current
        .filter((m) => m.id !== WELCOME_MESSAGE.id && !m.isError)
        .map((m) => ({ role: m.role, text: m.apiText ?? m.text }));

      // El contexto (producto, pedido…) va delante del primer mensaje del
      // usuario; la API sigue recibiendo solo { message, history }.
      const esPrimero = !messagesRef.current.some((m) => m.role === "user");
      const apiText =
        esPrimero && contextoActivo?.prefijo ? `${contextoActivo.prefijo} ${clean}` : clean;

      const userMessage: BlueIAMessage = {
        id: `${Date.now()}-u`,
        role: "user",
        text: clean,
        apiText,
      };
      setMessages((prev) => [...prev, userMessage]);
      setDraft("");
      setSending(true);

      try {
        // Con sesión se manda el token: el servidor da un cupo por USUARIO (más holgado) en vez de por IP.
        let token: string | null = null;
        try {
          const { data: s } = await supabase.auth.getSession();
          token = s.session?.access_token ?? null;
        } catch {
          // sin sesión: se pregunta como visitante
        }
        const response = await fetch(BLUE_IA_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ message: apiText, history: historyForApi }),
        });

        const data = await response.json().catch(() => null);

        if (!response.ok || !data?.reply) {
          // data?.error viene de nuestra propia api/blue-ia.ts (límite de
          // peticiones, origen no permitido, falta la clave de OpenAI...) y
          // ya está escrito para que la persona lo lea tal cual — se marca
          // con isApiError para poder distinguirlo abajo de un fallo de red
          // real (donde e.message trae texto técnico en inglés, no apto
          // para mostrar).
          const err: any = new Error(data?.error || "Blue IA no ha podido responder.");
          err.isApiError = true;
          throw err;
        }

        // socialChips es opcional: solo viene cuando api/blue-ia.ts decide
        // que la respuesta encaja con alguna red social activa (ver
        // pickSocialChips ahí) — se pintan como botones aparte, nunca como
        // texto dentro de la respuesta.
        const socialChips: SocialChip[] | undefined = Array.isArray(data.socialChips)
          ? data.socialChips
          : undefined;

        const productChips: ProductChip[] | undefined = Array.isArray(data.productChips)
          ? data.productChips
              .filter((c: any) => c && typeof c.id === "string" && typeof c.title === "string")
              .map((c: any) => ({ id: c.id, title: c.title, price: Number(c.price ?? 0), similar: c.similar === true }))
          : undefined;

        // Modelo mixto: cuántas respuestas da cada modelo (Administración → Analítica).
        const modeloRespuesta = data.modelo === "avanzado" ? "avanzado" : "base";
        void medirEvento("blue_ia_respuesta", `Blue IA: respuesta · modelo ${modeloRespuesta}`, { metadata: { modelo: modeloRespuesta } });

        // Botones de la tienda que encajan con la respuesta (vender, cambiar, reparar, buscar…).
        const accionChips = leerAccionChips(data.accionChips);
        if (accionChips) {
          for (const c of accionChips) {
            void medirEvento("blue_ia_boton", `Blue IA: botón mostrado · ${ACCIONES_BLUE[c.tipo].label({ tipo: c.tipo })}`, { metadata: { tipo: c.tipo } });
          }
        }

        // «Ver mis facturas»: la referencia VZ- del pedido por el que pregunta (primero lo que escribió, luego la respuesta).
        // Solo sirve para elegir entre SUS pedidos (BlueIAFacturas los consulta con su sesión).
        const RE_REF = /VZ-[A-Z0-9]{4}-[A-Z0-9]{4}/i;
        const refPedido = accionChips?.some((c) => c.tipo === "facturas")
          ? (apiText.match(RE_REF)?.[0] ?? String(data.reply).match(RE_REF)?.[0])?.toUpperCase()
          : undefined;

        setMessages((prev) => [
          ...prev,
          { id: `${Date.now()}-a`, role: "assistant", text: String(data.reply), socialChips, productChips, accionChips, refPedido },
        ]);

        // Con sesión, la vuelta se guarda en su cuenta (los errores no).
        guardarVuelta(
          clean,
          String(data.reply),
          // Solo se usa al crear la conversación.
          contextoActivo ? `Preguntas por: ${contextoActivo.visible}` : null,
          // Sus botones, para que sigan al volver a la conversación (dueño, 2026-11-26).
          botonesParaGuardar({ productChips, accionChips, refPedido })
        );
      } catch (e: any) {
        console.error("Error consultando a Blue IA:", e);
        const friendlyText =
          e?.isApiError && typeof e.message === "string" && e.message
            ? e.message
            : "No he podido responder ahora mismo. Inténtalo de nuevo en unos segundos.";
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-err`,
            role: "assistant",
            text: friendlyText,
            isError: true,
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [draft, sending, contextoActivo, guardarVuelta]
  );

  // Horario del equipo (dueño, 2026-11-03): siempre a la vista junto a «Hablar con el equipo», al día (se mira cada
  // minuto). Fuera de horario, al pulsarlo sale antes un aviso que recomienda esperar y ofrece seguir con Blue.
  const [atencion, setAtencion] = useState<EstadoAtencion>(() => estadoAtencion());
  const [avisoHorario, setAvisoHorario] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setAtencion(estadoAtencion()), 60_000);
    return () => clearInterval(t);
  }, []);
  const campoRef = useRef<TextInput | null>(null);
  // Alto real del compositor (sugerencias, aviso, botones, horario y recuadro): la conversación deja ese hueco abajo.
  const [altoCompositor, setAltoCompositor] = useState(0);

  // Pasa la conversación al equipo: chat privado de la tienda con un resumen.
  const handleHablarEquipo = useCallback(async () => {
    if (abriendoEquipo) return;
    setAbriendoEquipo(true);
    setErrorText(null);
    try {
      const resumen = construirResumen(
        contextoActivo
          ? `Pregunto por: ${contextoActivo.visible}`
          : (contextoGuardado ?? "").replace(/^Preguntas por:/, "Pregunto por:"),
        messagesRef.current
      );
      const r = await abrirChatEquipo({
        productId: (usarContextoUrl && productoId) || null,
        resumen,
      });
      if (r === "login") {
        setErrorText(AVISO_LOGIN);
        router.push(`/perfil?aviso=${encodeURIComponent(AVISO_LOGIN)}` as never);
      }
    } catch (e) {
      console.error("Error abriendo el chat con el equipo:", e);
      setErrorText("No hemos podido abrir el chat ahora mismo. Inténtalo de nuevo.");
    } finally {
      setAbriendoEquipo(false);
    }
  }, [abriendoEquipo, contextoActivo, contextoGuardado, usarContextoUrl, productoId]);

  // «Hablar con el equipo»: en horario, directo; fuera de horario, primero el aviso (se mide en Administración →
  // Analítica: aviso, siguen con Blue o escriben igualmente).
  const pulsarHablarEquipo = useCallback(() => {
    const ahora = estadoAtencion();
    setAtencion(ahora);
    if (ahora.abierto) {
      handleHablarEquipo();
      return;
    }
    setAvisoHorario(true);
    void medirEvento("blue_ia_equipo_fuera_horario", "Blue IA: fuera de horario, aviso", { metadata: { accion: "aviso" } });
  }, [handleHablarEquipo]);

  const seguirConBlue = useCallback(() => {
    setAvisoHorario(false);
    void medirEvento("blue_ia_equipo_fuera_horario", "Blue IA: fuera de horario, sigue con Blue", { metadata: { accion: "seguir_blue" } });
    campoRef.current?.focus();
  }, []);

  const escribirIgualmente = useCallback(() => {
    setAvisoHorario(false);
    void medirEvento("blue_ia_equipo_fuera_horario", "Blue IA: fuera de horario, escribe al equipo", { metadata: { accion: "escribir" } });
    handleHablarEquipo();
  }, [handleHablarEquipo]);

  // Si se llega aquí desde "Preguntas frecuentes" (Inicio → /blue-ia?q=...),
  // manda esa pregunta automáticamente una sola vez al entrar — igual que
  // tocar una sugerencia rápida, pero disparado por la navegación en vez de
  // por un toque en esta misma pantalla.
  useEffect(() => {
    const incoming = typeof params.q === "string" ? params.q.trim() : "";
    if (!incoming || autoAskedRef.current === incoming) return;
    autoAskedRef.current = incoming;
    handleAsk(incoming);
    // Solo debe dispararse al entrar con el parámetro, no cada vez que
    // cambie handleAsk (que se recrea con cada tecla escrita en el cuadro).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q]);

  // Las sugerencias rápidas solo tienen sentido antes de que exista una
  // conversación real: en cuanto hay alguna pregunta (o se está esperando
  // respuesta), desaparecen para dejar toda la pantalla a la conversación.
  // Mientras se mira si hay una conversación guardada, ni sugerencias ni saludo: así no aparecen y desaparecen al abrirla.
  const showQuickSuggestions = historialListo && messages.length <= 1 && !sending;
  // Con una conversación en marcha, junto al recuadro de escribir sale «Nueva conversación» (dueño, 2026-11-03).
  const conversacionEmpezada = messages.length > 1;

  // Autoscroll: cada vez que llega un mensaje nuevo (o empieza/termina la
  // espera de respuesta), baja la conversación hasta el final.
  useEffect(() => {
    const id = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 60);
    return () => clearTimeout(id);
  }, [messages.length, sending]);

  const handleScroll = useCallback((e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom =
      contentSize.height - layoutMeasurement.height - (contentOffset.y as number);
    // Solo se actualiza el estado al cruzar el umbral, no en cada evento de scroll.
    const next = distanceFromBottom > 260;
    if (next !== showScrollToBottomRef.current) {
      showScrollToBottomRef.current = next;
      setShowScrollToBottom(next);
    }
  }, []);

  const handleScrollToLatest = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
    showScrollToBottomRef.current = false;
    setShowScrollToBottom(false);
  }, []);

  return (
    <>
    // paddingBottom 0: el hueco de abajo del iPhone ya lo deja la barra de secciones (si no, trozo blanco encima; 2026-11-28).
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg, paddingBottom: 0 }}>
      <StatusBar barStyle="dark-content" />

      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <LinearGradient
          colors={[
            "rgba(30,167,232,0.14)",
            "rgba(0,170,228,0.08)",
            "rgba(255,255,255,0)",
          ]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 260,
          }}
        />

        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{
            paddingHorizontal: 16,
            // Margen arriba (dueño, 2026-11-26): en el iPhone la barra de la hora difumina lo que queda debajo y los
            // botones de arriba se veían borrosos.
            paddingTop: 48,
            // Hueco para el compositor (crece con el horario y con el aviso fuera de horario).
            paddingBottom: Math.max(showQuickSuggestions ? 230 : 160, altoCompositor + 28),
            alignItems: "center",
          }}
        >
          {/* Columna centrada: no se pega a la izquierda en pantallas anchas */}
          <View style={{ width: "100%", maxWidth: 860, gap: 10 }}>
            {/* Arriba, centrados (dueño, 2026-11-26): Historial, «Nueva conversación» (con una empezada) y «Hablar con el
                equipo». Van dentro de la conversación (se desplazan con ella) para no tapar nunca los mensajes. La
                ventana «Qué es Blue IA» (ⓘ) se quitó por completo a petición del dueño. */}
            <View nativeID="blue-ia-cabecera" style={{ flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 4 }}>
              {/* Historial de conversaciones guardadas en la cuenta. */}
              <IconoCabecera icon="time-outline" label="Historial" texto="Historial" onPress={abrirHistorial} />
              {conversacionEmpezada ? (
                <IconoCabecera
                  id="blue-ia-nueva"
                  icon="create-outline"
                  label="Nueva conversación"
                  texto="Nueva"
                  disabled={sending}
                  onPress={() => nuevaConversacion("boton")}
                />
              ) : null}
              <IconoCabecera
                id="blue-ia-equipo"
                icon="headset-outline"
                label="Hablar con el equipo"
                texto="Equipo"
                busy={abriendoEquipo}
                onPress={pulsarHablarEquipo}
              />
            </View>
            {/* Contexto: el de la URL (producto, pedido…) o el de la conversación guardada. */}
            {contextoActivo ? (
              <Text
                numberOfLines={2}
                style={{ color: COLORS.muted, fontSize: 13, textAlign: "center", paddingBottom: 4 }}
              >
                Preguntas por:{" "}
                <Text style={{ color: COLORS.text, fontWeight: "800" }}>{contextoActivo.visible}</Text>
              </Text>
            ) : contextoGuardado ? (
              <Text
                numberOfLines={2}
                style={{ color: COLORS.muted, fontSize: 13, textAlign: "center", paddingBottom: 4 }}
              >
                {contextoGuardado}
              </Text>
            ) : null}
            {/* Bienvenida: la mascota de la tienda, solo antes de la primera pregunta. */}
            {showQuickSuggestions && (
              <View style={{ alignItems: "center", paddingBottom: 4 }}>
                <MarcaAnimada cual="tienda" ancho={120} />
              </View>
            )}
            {!historialListo ? (
              <ActivityIndicator nativeID="blue-ia-cargando" color={COLORS.accent} style={{ paddingVertical: 24 }} />
            ) : (
              messages.map((message) => (
                <BlueIABubble
                  key={message.id}
                  // El saludo se escribe letra a letra (cursor mientras escribe).
                  message={message.id === WELCOME_MESSAGE.id ? { ...message, text: saludoMostrado + (escribiendo ? "▍" : "") } : message}
                />
              ))
            )}
            {sending && <BlueIATypingBubble />}
            {/* «Hablar con el equipo» sale una sola vez, junto al recuadro de escribir (petición del dueño, 2026-11-01):
                antes se repetía bajo la respuesta con «¿Prefieres que te atienda una persona?». */}
          </View>
        </ScrollView>

        {/* "⬇️" para volver al último mensaje, igual que en Chat Global. */}
        {showScrollToBottom && (
          <Pressable
            onPress={handleScrollToLatest}
            style={({ pressed }) => ({
              position: "absolute",
              right: 16,
              bottom: Math.max(showQuickSuggestions ? 208 : 148, altoCompositor + 20),
              width: 40,
              height: 40,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#FFFFFF",
              borderWidth: 1,
              borderColor: COLORS.accentBorder,
              opacity: pressed ? 0.85 : 1,
              shadowColor: COLORS.accent,
              shadowOpacity: 0.16,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 4,
            })}
          >
            <Ionicons name="arrow-down-circle" size={26} color={COLORS.accent} />
          </Pressable>
        )}

        {/* Compositor fijo abajo del todo, con las sugerencias rápidas justo
            encima (solo antes de la primera pregunta) — mismo estilo que el
            compositor de Chat Global. */}
        {/* Panel blanco con esquinas arriba (dueño, 2026-11-26): al subir por el chat los mensajes pasaban por detrás
            del horario y de los botones sin fondo y se mezclaban las letras. */}
        <View
          nativeID="blue-ia-compositor"
          onLayout={(e) => setAltoCompositor(Math.round(e.nativeEvent.layout.height))}
          style={[
            {
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              gap: 10,
              paddingTop: 12,
              paddingHorizontal: 12,
              paddingBottom: 12,
              backgroundColor: "rgba(255,255,255,0.97)",
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              borderTopWidth: 1,
              borderColor: COLORS.border,
              shadowColor: "#0B2138",
              shadowOpacity: 0.08,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: -4 },
              elevation: 8,
            },
            Platform.OS === "web" ? ({ backdropFilter: "blur(10px)" } as any) : null,
          ]}
        >
          {showQuickSuggestions && (
            <SugerenciasAutomaticas
              items={quickActions}
              onPress={(item) => {
                // El horario solo se pregunta desde esta sugerencia (dueño, 2026-11-26): se cuenta en Analítica.
                if (item.id === "horario") void medirEvento("blue_ia_horario", "Blue IA: pastilla del horario");
                handleAsk(item.prompt);
              }}
            />
          )}

          {!!errorText && (
            <Text style={{ color: "#B91C1C", fontWeight: "800", textAlign: "center" }}>
              {errorText}
            </Text>
          )}

          {/* Fuera de horario, antes de escribir al equipo: recomienda esperar al horario y ofrece seguir con Blue. */}
          {avisoHorario && !atencion.abierto ? (
            <View nativeID="blue-ia-aviso-horario" style={{ alignItems: "center", gap: 8, paddingHorizontal: 4 }}>
              <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 14, lineHeight: 20, textAlign: "center" }}>
                Ahora estamos fuera del horario de atención. El equipo vuelve {atencion.vuelve}.
              </Text>
              <Text style={{ color: COLORS.muted, fontSize: 13, lineHeight: 18, textAlign: "center" }}>{HORARIO_CORTO}</Text>
              <Text style={{ color: COLORS.muted, fontSize: 13, lineHeight: 19, textAlign: "center", maxWidth: 520 }}>
                Te recomendamos esperar a ese horario para que te atendamos. Mientras, Blue puede intentar ayudarte con tu
                problema.
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 8, rowGap: 6 }}>
                <Pressable
                  nativeID="blue-ia-seguir-blue"
                  onPress={seguirConBlue}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    minHeight: 44,
                    paddingHorizontal: 18,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: COLORS.accent,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>Seguir con Blue</Text>
                </Pressable>
                <Pressable
                  nativeID="blue-ia-escribir-igualmente"
                  onPress={escribirIgualmente}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    minHeight: 44,
                    paddingHorizontal: 14,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ color: COLORS.primary, fontWeight: "900", fontSize: 13 }}>Escribir al equipo igualmente</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TextInput
              ref={campoRef}
              value={draft}
              onChangeText={setDraft}
              placeholder="Pregúntale a Blue IA…"
              placeholderTextColor="rgba(11,33,56,0.4)"
              editable={!sending}
              multiline
              style={{
                flex: 1,
                minHeight: 42,
                maxHeight: 96,
                borderRadius: 14,
                backgroundColor: "rgba(255,255,255,0.85)",
                borderWidth: 1,
                borderColor: COLORS.border,
                color: COLORS.text,
                // 16px es el mínimo que evita que Safari/iOS haga zoom
                // automático al enfocar el campo.
                fontSize: 16,
                paddingHorizontal: 14,
                paddingVertical: 10,
                opacity: sending ? 0.6 : 1,
              }}
            />

            <BlueIASendButton
              onPress={() => handleAsk()}
              disabled={sending || !draft.trim()}
              sending={sending}
            />
          </View>
        </View>
      </View>
    </SafeAreaView>

    <BlueIAHistorialModal
      visible={historialOpen}
      onClose={() => setHistorialOpen(false)}
      conSesion={!!userId}
      cargando={cargandoLista}
      conversaciones={conversaciones}
      abiertaId={conversacionIdRef.current}
      onNueva={() => nuevaConversacion("historial")}
      onAbrir={abrirConversacion}
      onArchivar={archivarConversacion}
      archivadas={archivadas}
      onRecuperar={(c) => recuperarConversacion(c, "archivadas")}
      deshacer={deshacer}
      onDeshacer={() => deshacer && recuperarConversacion(deshacer, "deshacer")}
    />
    </>
  );
}

// Icono de la cabecera (Historial, Nueva conversación y Hablar con el equipo): icono azul con su nombre corto
// debajo, sin burbuja ni sombra; cada uno mide al menos 44 × 56 px para tocarlo bien con el pulgar.
function IconoCabecera({
  id,
  icon,
  label,
  texto,
  disabled,
  busy,
  onPress,
}: {
  id?: string;
  icon: IoniconName;
  label: string;
  texto: string;
  disabled?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      nativeID={id}
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        minWidth: 64,
        minHeight: 44,
        paddingHorizontal: 6,
        paddingVertical: 4,
        gap: 2,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.45 : pressed ? 0.6 : 1,
      })}
    >
      {busy ? <ActivityIndicator size="small" color={COLORS.accent} /> : <Ionicons name={icon} size={20} color={COLORS.accent} />}
      <Text style={{ color: "#0A78B4", fontWeight: "800", fontSize: 13 }}>{texto}</Text>
    </Pressable>
  );
}

// Panel "Historial": conversaciones guardadas del usuario (abrir, archivar o
// empezar una nueva). Sin sesión, invita a iniciarla.
function BlueIAHistorialModal({
  visible,
  onClose,
  conSesion,
  cargando,
  conversaciones,
  abiertaId,
  onNueva,
  onAbrir,
  onArchivar,
  archivadas,
  onRecuperar,
  deshacer,
  onDeshacer,
}: {
  visible: boolean;
  onClose: () => void;
  conSesion: boolean;
  cargando: boolean;
  conversaciones: ConversacionGuardada[];
  abiertaId: string | null;
  onNueva: () => void;
  onAbrir: (c: ConversacionGuardada) => void;
  onArchivar: (c: ConversacionGuardada) => void;
  archivadas: ConversacionGuardada[];
  onRecuperar: (c: ConversacionGuardada) => void;
  deshacer: ConversacionGuardada | null;
  onDeshacer: () => void;
}) {
  const insets = useSafeAreaInsets();
  // «Archivadas» se ve en la misma hoja, en lugar de la lista; al cerrar la hoja vuelve a la lista.
  const [verArchivadas, setVerArchivadas] = useState(false);
  useEffect(() => {
    if (!visible) setVerArchivadas(false);
  }, [visible]);
  useEffect(() => {
    if (verArchivadas && archivadas.length === 0) setVerArchivadas(false);
  }, [verArchivadas, archivadas.length]);
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* Hoja que sube desde abajo (dueño, 2026-11-26: «profesional y práctico para el dedo gordo de la mano derecha»):
          la lista y los botones quedan en la mitad de abajo, al alcance del pulgar; se cierra tocando fuera o con
          «Cerrar», abajo, en vez de la X de arriba a la derecha. */}
      <Pressable
        nativeID="blue-ia-historial-fondo"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: COLORS.overlay, justifyContent: "flex-end", alignItems: "center" }}
      >
        <Pressable
          nativeID="blue-ia-historial"
          onPress={() => {}}
          style={{
            width: "100%",
            maxWidth: 520,
            maxHeight: "86%",
            backgroundColor: "#FFFFFF",
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            paddingTop: 10,
            paddingHorizontal: 16,
            paddingBottom: 16 + Math.round(insets.bottom),
            gap: 12,
          }}
        >
          {/* Asa de la hoja. */}
          <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: "#D6E2EE" }} />

          {/* Cabecera centrada, como todo en la tienda (lección «Todo centrado»). */}
          <View nativeID="blue-ia-historial-cabecera" style={{ alignItems: "center", gap: 4 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.accentSoft, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={verArchivadas ? "archive-outline" : "time-outline"} size={22} color="#0A78B4" />
            </View>
            <Text accessibilityRole="header" style={{ color: COLORS.text, fontSize: 20, fontWeight: "900", textAlign: "center" }}>
              {verArchivadas ? "Archivadas" : "Historial"}
            </Text>
            {verArchivadas ? (
              <Text style={{ color: "rgba(11,33,56,0.72)", fontSize: 13, textAlign: "center" }}>
                Recupera una para que vuelva a tu Historial
              </Text>
            ) : conSesion && conversaciones.length ? (
              <Text style={{ color: "rgba(11,33,56,0.72)", fontSize: 13, textAlign: "center" }}>
                {conversaciones.length === 1 ? "1 conversación guardada" : `${conversaciones.length} conversaciones guardadas`}
              </Text>
            ) : null}
          </View>

          {!conSesion ? (
            <Text style={{ color: COLORS.muted, lineHeight: 21, textAlign: "center", paddingVertical: 6 }}>
              Inicia sesión para guardar tus conversaciones con Blue IA
            </Text>
          ) : verArchivadas ? (
            <ListaArchivadas archivadas={archivadas} onRecuperar={onRecuperar} />
          ) : cargando && conversaciones.length === 0 ? (
            <ActivityIndicator color={COLORS.accent} style={{ paddingVertical: 16 }} />
          ) : conversaciones.length === 0 ? (
            <Text style={{ color: COLORS.muted, textAlign: "center", paddingVertical: 10 }}>
              Aún no tienes conversaciones guardadas.
            </Text>
          ) : (
            <ListaHistorial conversaciones={conversaciones} abiertaId={abiertaId} onAbrir={onAbrir} onArchivar={onArchivar} />
          )}

          {/* «Archivadas (N)»: al final de la lista, centrado; abre las archivadas para recuperarlas. En «Archivadas»,
              «Volver al Historial». */}
          {conSesion && (verArchivadas || archivadas.length > 0) ? (
            <Pressable
              nativeID="blue-ia-historial-archivadas"
              onPress={() => setVerArchivadas((v) => !v)}
              accessibilityRole="button"
              style={({ pressed }) => ({
                alignSelf: "center",
                minHeight: 44,
                paddingHorizontal: 16,
                borderRadius: 22,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                backgroundColor: pressed ? COLORS.accentSoft : "transparent",
              })}
            >
              <Ionicons name={verArchivadas ? "chevron-back" : "archive-outline"} size={18} color="#0A78B4" />
              <Text style={{ color: "#0A78B4", fontWeight: "800", fontSize: 15, textAlign: "center" }}>
                {verArchivadas ? "Volver al Historial" : `Archivadas (${archivadas.length})`}
              </Text>
            </Pressable>
          ) : null}

          {/* Tras archivar: «Conversación archivada · Deshacer» unos segundos, centrado y de 44 px. */}
          {deshacer && !verArchivadas ? (
            <View
              nativeID="blue-ia-historial-deshacer"
              accessibilityLiveRegion="polite"
              style={{
                alignSelf: "center",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                minHeight: 54,
                paddingLeft: 18,
                paddingRight: 5,
                borderRadius: 27,
                backgroundColor: COLORS.text,
              }}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 14, textAlign: "center" }}>Conversación archivada</Text>
              <Pressable
                nativeID="blue-ia-historial-deshacer-boton"
                onPress={onDeshacer}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  minHeight: 44,
                  paddingHorizontal: 16,
                  borderRadius: 22,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: pressed ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.12)",
                })}
              >
                <Text style={{ color: "#7FD3FA", fontWeight: "900", fontSize: 14, textAlign: "center" }}>Deshacer</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Abajo, al alcance del pulgar y con margen (dueño, 2026-11-26): la acción principal y, a la DERECHA, cerrar
              con el icono de la X. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4, marginBottom: 12, paddingHorizontal: 12 }}>
            <Pressable
              nativeID="blue-ia-historial-principal"
              onPress={
                conSesion
                  ? onNueva
                  : () => {
                      onClose();
                      router.push(`/perfil?aviso=${encodeURIComponent(AVISO_LOGIN_HISTORIAL)}` as never);
                    }
              }
              accessibilityRole="button"
              style={({ pressed }) => ({
                flex: 1,
                height: 48,
                borderRadius: 24,
                flexDirection: "row",
                gap: 8,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: COLORS.accent,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Ionicons name={conSesion ? "add" : "person-circle-outline"} size={20} color="#FFFFFF" />
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>{conSesion ? "Nueva conversación" : "Iniciar sesión"}</Text>
            </Pressable>
            <Pressable
              nativeID="blue-ia-historial-cerrar"
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cerrar el historial"
              style={({ pressed }) => ({
                width: 48,
                height: 48,
                borderRadius: 24,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#F1F6FA",
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Ionicons name="close" size={24} color={COLORS.text} />
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// «Archivadas» (dueño, 2026-11-26): cada conversación archivada con su título y fecha centrados y «Recuperar» (44 px),
// que la devuelve al Historial.
function ListaArchivadas({ archivadas, onRecuperar }: { archivadas: ConversacionGuardada[]; onRecuperar: (c: ConversacionGuardada) => void }) {
  return (
    <ScrollView nativeID="blue-ia-archivadas-lista" style={{ flexShrink: 1, maxHeight: 460 }}>
      {archivadas.map((c, i) => (
        <View
          key={c.id}
          {...({ dataSet: { filaArchivada: "1" } } as object)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            minHeight: 68,
            paddingVertical: 12,
            paddingHorizontal: 6,
            borderTopWidth: i === 0 ? 0 : 1,
            borderTopColor: COLORS.border,
          }}
        >
          <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#F1F6FA" }}>
            <Ionicons name="archive-outline" size={20} color="rgba(11,33,56,0.62)" />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2, alignItems: "center" }}>
            <Text numberOfLines={2} style={{ color: COLORS.text, fontWeight: "800", fontSize: 15, lineHeight: 20, textAlign: "center" }}>
              {c.titulo}
            </Text>
            <Text style={{ color: "rgba(11,33,56,0.72)", fontSize: 13, textAlign: "center" }}>{fechaMadrid(c.updated_at)}</Text>
          </View>
          <Pressable
            onPress={() => onRecuperar(c)}
            accessibilityRole="button"
            accessibilityLabel={`Recuperar: ${c.titulo}`}
            {...({ dataSet: { recuperar: "1" } } as object)}
            style={({ pressed }) => ({
              minHeight: 44,
              paddingHorizontal: 14,
              borderRadius: 22,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: pressed ? "#D8EFFC" : COLORS.accentSoft,
            })}
          >
            <Ionicons name="arrow-undo-outline" size={16} color="#0A78B4" />
            <Text style={{ color: "#0A78B4", fontWeight: "900", fontSize: 14, textAlign: "center" }}>Recuperar</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

// Lista del Historial (dueño, 2026-11-26): cada conversación se desliza a la izquierda, como en el iPhone, para enseñar
// «Archivar» (solo una abierta a la vez), y la ventana lleva su propia barra de desplazamiento a la izquierda cuando la
// lista no cabe.
const ANCHO_ARCHIVAR = 96;
const CLAVE_DEMO_ARCHIVAR = "vz_blueia_historial_demo_archivar_v1";
// Con ratón (ordenador) no se puede deslizar: cada fila enseña su botón de archivar.
function conRaton(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  try {
    return !!window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
  } catch {
    return false;
  }
}
function ListaHistorial({
  conversaciones,
  abiertaId,
  onAbrir,
  onArchivar,
}: {
  conversaciones: ConversacionGuardada[];
  abiertaId: string | null;
  onAbrir: (c: ConversacionGuardada) => void;
  onArchivar: (c: ConversacionGuardada) => void;
}) {
  const [deslizada, setDeslizada] = useState<string | null>(null);
  const [medidas, setMedidas] = useState({ alto: 0, contenido: 0 });
  const desplazado = useRef(new Animated.Value(0)).current;
  const sobra = medidas.contenido - medidas.alto;
  const altoPulgar = sobra > 0 ? Math.max(32, (medidas.alto * medidas.alto) / medidas.contenido) : 0;
  const [raton] = useState(conRaton);

  // En el móvil, en vez de explicarlo con letras (dueño, 2026-11-26): la primera conversación sale deslizada enseñando
  // «Archivar» 7 s y vuelve despacio a su sitio, para que se entienda el gesto. Una sola vez por dispositivo (lección
  // «Los avisos y pistas de Blue salen una sola vez»): queda guardado al enseñarse.
  const [demoId, setDemoId] = useState<string | null>(null);
  const primeraId = conversaciones[0]?.id ?? null;
  useEffect(() => {
    if (raton || !primeraId) return;
    let vivo = true;
    (async () => {
      try {
        if (await AsyncStorage.getItem(CLAVE_DEMO_ARCHIVAR)) return;
        await AsyncStorage.setItem(CLAVE_DEMO_ARCHIVAR, "1");
      } catch {
        // sin almacenamiento: se enseña igual
      }
      if (vivo) setDemoId(primeraId);
    })();
    return () => {
      vivo = false;
    };
    // Solo al abrir el Historial con conversaciones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raton, !!primeraId]);

  return (
    <View style={{ flexShrink: 1, maxHeight: 460 }}>
      {/* En el ordenador (con ratón) no hay gesto: se explica el botón de cada fila. */}
      {raton ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 6, marginBottom: 4 }}>
          <Ionicons name="archive-outline" size={14} color="rgba(11,33,56,0.62)" />
          <Text style={{ color: "rgba(11,33,56,0.72)", fontSize: 13, textAlign: "center" }}>Archiva una conversación con su botón de la derecha</Text>
        </View>
      ) : null}
      <View style={{ flexShrink: 1 }}>
        <ScrollView
          nativeID="blue-ia-historial-lista"
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onLayout={(e) => {
            const alto = Math.round(e.nativeEvent.layout.height);
            setMedidas((m) => (m.alto === alto ? m : { ...m, alto }));
          }}
          onContentSizeChange={(_w, h) => {
            const contenido = Math.round(h);
            setMedidas((m) => (m.contenido === contenido ? m : { ...m, contenido }));
          }}
          onScroll={(e) => desplazado.setValue(e.nativeEvent.contentOffset.y)}
          style={{ paddingLeft: sobra > 0 ? 12 : 0 }}
        >
          {conversaciones.map((c, i) => (
            <FilaHistorial
              key={c.id}
              conversacion={c}
              primera={i === 0}
              abierta={c.id === abiertaId}
              deslizada={deslizada === c.id}
              demo={demoId === c.id}
              raton={raton}
              onDeslizar={(si) => setDeslizada(si ? c.id : null)}
              onAbrir={() => onAbrir(c)}
              onArchivar={() => {
                setDeslizada(null);
                onArchivar(c);
              }}
            />
          ))}
        </ScrollView>
        {/* Barra de desplazamiento propia, a la IZQUIERDA como la de progreso de las páginas (dueño, 2026-11-26); también
            en el iPhone, donde la del sistema casi no se ve. */}
        {sobra > 0 ? (
          <View
            nativeID="blue-ia-historial-barra"
            pointerEvents="none"
            {...({ "aria-hidden": true } as object)}
            style={{ position: "absolute", left: 0, top: 4, bottom: 4, width: 5, borderRadius: 3, backgroundColor: "rgba(11,33,56,0.10)" }}
          >
            <Animated.View
              style={{
                width: 5,
                height: altoPulgar,
                borderRadius: 3,
                backgroundColor: COLORS.accent,
                transform: [
                  {
                    translateY: desplazado.interpolate({
                      inputRange: [0, sobra],
                      outputRange: [0, Math.max(0, medidas.alto - 8 - altoPulgar)],
                      extrapolate: "clamp",
                    }),
                  },
                ],
              }}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function FilaHistorial({
  conversacion: c,
  primera,
  abierta,
  deslizada,
  demo,
  raton,
  onDeslizar,
  onAbrir,
  onArchivar,
}: {
  conversacion: ConversacionGuardada;
  primera: boolean;
  abierta: boolean;
  deslizada: boolean;
  demo: boolean;
  raton: boolean;
  onDeslizar: (si: boolean) => void;
  onAbrir: () => void;
  onArchivar: () => void;
}) {
  const x = useRef(new Animated.Value(0)).current;
  const base = useRef(0);

  // Si se desliza otra, esta vuelve a su sitio.
  useEffect(() => {
    const destino = deslizada ? -ANCHO_ARCHIVAR : 0;
    base.current = destino;
    Animated.spring(x, { toValue: destino, useNativeDriver: Platform.OS !== "web", bounciness: 0, speed: 18 }).start();
  }, [deslizada, x]);

  // Demostración del gesto (una vez por dispositivo): se abre enseñando «Archivar», se queda 7 s y vuelve despacio. Si
  // la persona toca la fila mientras tanto, manda ella.
  const tocada = useRef(false);
  useEffect(() => {
    if (!demo) return;
    const nativo = Platform.OS !== "web";
    const abrir = setTimeout(() => {
      if (tocada.current) return;
      Animated.timing(x, { toValue: -ANCHO_ARCHIVAR, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: nativo }).start();
    }, 400);
    const cerrar = setTimeout(() => {
      if (tocada.current) return;
      Animated.timing(x, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.cubic), useNativeDriver: nativo }).start();
    }, 400 + 450 + 7000);
    return () => {
      clearTimeout(abrir);
      clearTimeout(cerrar);
    };
  }, [demo, x]);

  // El dedo: dónde tocó y hacia dónde va (se decide con sus primeros 8 px). Solo el gesto horizontal mueve la fila; el
  // vertical sigue desplazando la lista. Con los eventos de toque, que llegan igual en la web y en el móvil.
  const dedo = useRef<{ x0: number; y0: number; eje: "h" | "v" | null; dx: number }>({ x0: 0, y0: 0, eje: null, dx: 0 });
  // En la web llega el evento del navegador (la posición va en su primer dedo); en el móvil, en el propio evento.
  const punto = (e: { nativeEvent: any }) => {
    const ne = e.nativeEvent;
    const t = ne?.touches?.[0] ?? ne?.changedTouches?.[0] ?? ne;
    return { x: Number(t?.pageX ?? 0), y: Number(t?.pageY ?? 0) };
  };
  const gesto = {
    onTouchStart: (e: { nativeEvent: any }) => {
      tocada.current = true;
      // Si la demostración la tenía abierta, se sigue desde donde está.
      x.stopAnimation((v) => {
        base.current = v;
      });
      const p = punto(e);
      dedo.current = { x0: p.x, y0: p.y, eje: null, dx: 0 };
    },
    onTouchMove: (e: { nativeEvent: any }) => {
      const d = dedo.current;
      const p = punto(e);
      const dx = p.x - d.x0;
      const dy = p.y - d.y0;
      if (d.eje === null && Math.hypot(dx, dy) >= 8) d.eje = Math.abs(dx) > Math.abs(dy) * 1.2 ? "h" : "v";
      if (d.eje !== "h") return;
      d.dx = dx;
      x.setValue(Math.min(0, Math.max(-ANCHO_ARCHIVAR, base.current + dx)));
    },
    onTouchEnd: () => {
      const d = dedo.current;
      if (d.eje !== "h") return;
      const abrir = base.current + d.dx < -ANCHO_ARCHIVAR / 2;
      base.current = abrir ? -ANCHO_ARCHIVAR : 0;
      Animated.spring(x, { toValue: base.current, useNativeDriver: Platform.OS !== "web", bounciness: 0, speed: 18 }).start();
      onDeslizar(abrir);
      // El toque siguiente (sin deslizar) ya vuelve a abrir la conversación.
      setTimeout(() => {
        dedo.current.eje = null;
      }, 400);
    },
  };

  return (
    <View
      {...({ dataSet: { filaHistorial: "1" } } as object)}
      style={{ overflow: "hidden", borderTopWidth: primera ? 0 : 1, borderTopColor: COLORS.border }}
    >
      {/* Detrás, a la derecha: «Archivar» (no borra nada; la conversación deja de salir en la lista). */}
      <Pressable
        onPress={onArchivar}
        accessibilityRole="button"
        accessibilityLabel={`Archivar: ${c.titulo}`}
        {...({ dataSet: { archivarHistorial: "1" } } as object)}
        style={({ pressed }) => ({
          position: "absolute",
          top: 0,
          bottom: 0,
          right: 0,
          width: ANCHO_ARCHIVAR,
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          backgroundColor: COLORS.accent,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Ionicons name="archive-outline" size={20} color="#FFFFFF" />
        <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 13, textAlign: "center" }}>Archivar</Text>
      </Pressable>

      <Animated.View
        onTouchStart={gesto.onTouchStart}
        onTouchMove={gesto.onTouchMove}
        onTouchEnd={gesto.onTouchEnd}
        onTouchCancel={gesto.onTouchEnd}
        style={[
          { backgroundColor: "#FFFFFF", transform: [{ translateX: x }] },
          // En la web, el navegador deja el gesto horizontal a la fila y sigue desplazando la lista en vertical.
          Platform.OS === "web" ? ({ touchAction: "pan-y" } as any) : null,
        ]}
      >
        <Pressable
          onPress={() => {
            // Al soltar tras deslizar no se abre la conversación.
            if (dedo.current.eje === "h") return;
            if (deslizada) onDeslizar(false);
            else if (base.current < 0) {
              // Abierta por la demostración: un toque la cierra.
              base.current = 0;
              Animated.spring(x, { toValue: 0, useNativeDriver: Platform.OS !== "web", bounciness: 0, speed: 18 }).start();
            } else onAbrir();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Abrir: ${c.titulo}`}
          accessibilityActions={[{ name: "archivar", label: "Archivar" }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === "archivar") onArchivar();
          }}
          // Fila de lista profesional: icono, título y fecha alineados a la izquierda y flecha; toda la fila se toca.
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingVertical: 12,
            paddingHorizontal: 6,
            minHeight: 68,
            backgroundColor: pressed ? "#F4F9FD" : "#FFFFFF",
          })}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: abierta ? COLORS.accent : COLORS.accentSoft,
            }}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={abierta ? "#FFFFFF" : "#0A78B4"} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2, alignItems: "center" }}>
            <Text numberOfLines={2} style={{ color: COLORS.text, fontWeight: "800", fontSize: 15, lineHeight: 20, textAlign: "center" }}>
              {c.titulo}
            </Text>
            <Text style={{ color: "rgba(11,33,56,0.72)", fontSize: 13, textAlign: "center" }}>
              {abierta ? <Text style={{ color: "#0A78B4", fontWeight: "800" }}>Abierta ahora · </Text> : null}
              {fechaMadrid(c.updated_at)}
            </Text>
          </View>
          {raton ? (
            // En el ordenador: botón de archivar a la vista (con ratón no se desliza).
            <Pressable
              onPress={onArchivar}
              accessibilityRole="button"
              accessibilityLabel={`Archivar: ${c.titulo}`}
              {...({ dataSet: { archivarRaton: "1" } } as object)}
              style={({ pressed, hovered }: any) => ({
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: hovered || pressed ? COLORS.accentSoft : "transparent",
              })}
            >
              <Ionicons name="archive-outline" size={20} color="#0A78B4" />
            </Pressable>
          ) : (
            <Ionicons name="chevron-forward" size={18} color="rgba(11,33,56,0.4)" />
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

// Burbuja de conversación: a la derecha y en azul si la escribió el usuario,
// a la izquierda con un icono si la respondió Blue IA. Un error de red se ve
// igual que una respuesta normal pero con un aviso en rojo debajo, para no
// mezclar el tono de "algo falló" con el resto de la conversación. Si la
// respuesta trae "socialChips" (ver api/blue-ia.ts), se pintan como una fila
// de botones con icono justo debajo del texto — nunca como enlaces sueltos
// dentro del mensaje.
// Quién responde: Blue, la mascota de atención al cliente (la misma imagen que Blue flotante, components/AsistenteBlue.tsx),
// quieta en cada mensaje para no distraer; mientras escribe, se mueve. Para un lector de pantalla no se repite en cada
// mensaje.
function AvatarBlue({ escribiendo }: { escribiendo?: boolean }) {
  return (
    <View
      nativeID={escribiendo ? "blue-ia-avatar-escribiendo" : undefined}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      {...({ "aria-hidden": true, dataSet: { avatarBlue: "1" } } as object)}
      style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
    >
      <MarcaAnimada cual="carga" ancho={36} reposo={!!escribiendo} tocable={false} />
    </View>
  );
}

function BlueIABubble({ message }: { message: BlueIAMessage }) {
  const mine = message.role === "user";

  return (
    // Como en WhatsApp (dueño, 2026-11-26): cada mensaje deja el mismo hueco (20 % del ancho) en el lado contrario, así
    // los de Blue y los de la persona se ven escalonados.
    <View
      {...({ dataSet: { burbujaBlue: mine ? "persona" : "blue" } } as object)}
      style={{
        flexDirection: "row",
        justifyContent: mine ? "flex-end" : "flex-start",
        alignItems: "flex-end",
        gap: 8,
        paddingLeft: mine ? "20%" : 0,
        // Con botones de artículos, algo menos de hueco para que su nombre quepa entero en el móvil.
        paddingRight: mine ? 0 : message.productChips?.length ? "10%" : "20%",
      }}
    >
      {!mine && <AvatarBlue />}

      <View
        style={{
          flexShrink: 1,
          maxWidth: "100%",
          borderRadius: 18,
          borderWidth: 1,
          borderColor: message.isError
            ? COLORS.dangerBorder
            : mine
              ? "rgba(0,170,228,0.22)"
              : "#E3EAF2",
          backgroundColor: message.isError
            ? COLORS.dangerSoft
            : mine
              ? "rgba(0,170,228,0.16)"
              : "#F1F6FA",
          paddingVertical: 10,
          paddingHorizontal: 14,
          gap: 10,
        }}
      >
        <Text
          style={{
            color: message.isError ? "#B91C1C" : COLORS.text,
            lineHeight: 21,
          }}
        >
          {message.text}
        </Text>

        {!!message.productChips?.length && <BlueIAProductChips chips={message.productChips} />}
        {!!message.accionChips?.length && <BlueIAAccionChips chips={message.accionChips} refPedido={message.refPedido} />}
        {!!message.socialChips?.length && <BlueIASocialChips chips={message.socialChips} />}
      </View>
    </View>
  );
}

// Artículos que Blue IA nombra en la respuesta y, debajo, los parecidos («También tenemos estas opciones similares»):
// miniatura, título y precio; al tocarlos se abre su ficha. La miniatura es la portada pequeña (como en el buscador).
function BlueIAProductChips({ chips }: { chips: ProductChip[] }) {
  const [portadas, setPortadas] = useState<Map<string, string>>(() => new Map());
  const ids = chips.map((c) => c.id).join(",");
  useEffect(() => {
    let vivo = true;
    portadasDeProductos(ids.split(","))
      .then((m) => {
        if (vivo) setPortadas(m);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [ids]);

  const nombrados = chips.filter((c) => !c.similar);
  const similares = chips.filter((c) => c.similar);
  const fila = (chip: ProductChip, i: number) => {
    const portada = portadas.get(chip.id);
    return (
      <Pressable
        key={chip.id}
        nativeID={`blue-ia-articulo-${chip.similar ? "similar" : "nombrado"}-${i}`}
        onPress={() => {
          void medirEvento("blue_ia_articulo", `Blue IA: artículo tocado · ${chip.similar ? "similar" : "nombrado"}`, {
            metadata: { producto: chip.id },
          });
          router.push(`/producto/${chip.id}` as never);
        }}
        accessibilityRole="link"
        accessibilityLabel={`Ver ${chip.title}, ${fmtEUR(chip.price)}`}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          minHeight: 64,
          paddingVertical: 8,
          paddingLeft: 8,
          paddingRight: 12,
          borderRadius: 14,
          backgroundColor: "#FFFFFF",
          borderWidth: 1,
          borderColor: COLORS.border,
          opacity: pressed ? 0.82 : 1,
        })}
      >
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 10,
            overflow: "hidden",
            flexShrink: 0,
            backgroundColor: "#F4F9FD",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {portada ? (
            <ImagenInteligente uri={portada} alt={chip.title} ancho={96} contentFit="contain" style={{ width: "100%", height: "100%" }} />
          ) : (
            <Ionicons name="pricetag-outline" size={18} color={COLORS.accent} />
          )}
        </View>
        {/* Nombre entero (con el precio debajo) para distinguir «Switch 2» de «Switch Oled» en el móvil. */}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text numberOfLines={3} style={{ color: COLORS.text, fontWeight: "800", fontSize: 14, lineHeight: 18 }}>
            {chip.title}
          </Text>
          <Text style={{ color: "#0A78B4", fontWeight: "900", fontSize: 14 }}>{fmtEUR(chip.price)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color={COLORS.accent} />
      </Pressable>
    );
  };

  return (
    <View nativeID="blue-ia-articulos" style={{ gap: 8 }}>
      {nombrados.map(fila)}
      {similares.length ? (
        <>
          <Text nativeID="blue-ia-similares-titulo" style={{ color: "rgba(11,33,56,0.72)", fontWeight: "800", fontSize: 13, marginTop: 4 }}>
            También tenemos estas opciones similares
          </Text>
          {similares.map(fila)}
        </>
      ) : null}
    </View>
  );
}

// Botones de la tienda que ofrece Blue IA (vender, cambiar, reparar, buscar, mis seguimientos…): icono, nombre (con lo
// que contó la persona, «Vender PS4 Pro») y flecha, como los de artículos. Al tocarlos se abre esa pantalla, con lo
// contado ya escrito en el formulario de Vender o en el buscador del catálogo.
function BlueIAAccionChips({ chips, refPedido }: { chips: AccionChip[]; refPedido?: string }) {
  return (
    <View nativeID="blue-ia-acciones" style={{ gap: 8 }}>
      {chips.map((chip) => {
        const def = ACCIONES_BLUE[chip.tipo];
        if (!def) return null;
        const tocar = () => {
          void medirEvento("blue_ia_boton", `Blue IA: botón tocado · ${def.label({ tipo: chip.tipo })}`, { metadata: { tipo: chip.tipo, con_datos: !!(chip.articulo || chip.busqueda) } });
          router.push(def.ruta(chip) as never);
        };
        if (chip.tipo === "facturas") return <BlueIAFacturas key={chip.tipo} refPedido={refPedido} onVer={tocar} />;
        return <ChipTienda key={chip.tipo} nativeID={`blue-ia-accion-${chip.tipo}`} icono={def.icono} label={def.label(chip)} onPress={tocar} />;
      })}
    </View>
  );
}

// Un botón de la tienda bajo la respuesta: icono sin burbuja, texto y flecha (o rueda mientras trabaja), 44 px.
function ChipTienda({
  nativeID,
  icono,
  label,
  onPress,
  boton,
  ocupado,
}: {
  nativeID: string;
  icono: IoniconName;
  label: string;
  onPress: () => void;
  // true: hace algo aquí mismo (descargar), no abre otra pantalla.
  boton?: boolean;
  ocupado?: boolean;
}) {
  return (
    <Pressable
      nativeID={nativeID}
      onPress={onPress}
      disabled={ocupado}
      accessibilityRole={boton ? "button" : "link"}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        minHeight: 44,
        paddingVertical: 9,
        paddingHorizontal: 12,
        borderRadius: 14,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: COLORS.border,
        opacity: pressed || ocupado ? 0.7 : 1,
      })}
    >
      <Ionicons name={icono} size={16} color={COLORS.accent} />
      <Text style={{ flex: 1, color: COLORS.text, fontWeight: "800", fontSize: 12.5 }}>{label}</Text>
      {ocupado ? <ActivityIndicator size="small" color={COLORS.accent} /> : <Ionicons name={boton ? "download-outline" : "chevron-forward"} size={14} color={COLORS.accent} />}
    </Pressable>
  );
}

// «Ver mis facturas» (dueño, 2026-11-11: «que Blue IA le dé la opción de redirigirlo a la pestaña donde está la factura o
// directamente descargarla si está disponible»). Lo decide la app, no el modelo (lección «lo que llega del navegador no es
// de fiar»): con la sesión del cliente se consultan SUS pedidos y sus facturas (RLS, como «Mis pedidos» de
// app/(tabs)/perfil.tsx). Con alguna factura con PDF, «Descargar factura F-…» (la del pedido VZ- que nombró si es suyo y
// la tiene; si no nombró uno suyo, la del más reciente) con /api/factura?pedido=… y abrirDescarga, igual que «Mis
// pedidos». Sin factura aún: «Ver mis facturas» y el plazo. Sin sesión: «Inicia sesión para ver tus facturas».
// Analítica propia: «Blue: ver mis facturas» y «Blue: factura descargada» (Administración → Analítica, #analitica-facturas).
const RE_REF_PEDIDO = /^VZ-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const AVISO_LOGIN_FACTURAS = "Inicia sesión para ver tus facturas";
type FacturasDeBlue = { estado: "cargando" } | { estado: "sin_sesion" } | { estado: "listo"; factura: { pedidoId: string; numero: string } | null };
function BlueIAFacturas({ refPedido, onVer }: { refPedido?: string; onVer: () => void }) {
  const [info, setInfo] = useState<FacturasDeBlue>({ estado: "cargando" });
  const [pidiendo, setPidiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const uid = data.session?.user?.id;
        if (!uid) {
          if (vivo) setInfo({ estado: "sin_sesion" });
          return;
        }
        // Sus pedidos, del más reciente al más antiguo (la referencia puede no existir aún: sin ella, sin elegir por VZ-).
        const pedidosCon = (columnas: string) =>
          supabase.from("pedidos").select(columnas).eq("user_id", uid).order("created_at", { ascending: false }).limit(50);
        let ped: { data: any[] | null; error: any } = await pedidosCon("id,codigo_seguimiento");
        if (ped.error) ped = await pedidosCon("id");
        const pedidos = (ped.error ? [] : ped.data ?? []) as { id: string; codigo_seguimiento?: string | null }[];
        let factura: { pedidoId: string; numero: string } | null = null;
        if (pedidos.length) {
          const fac = await supabase
            .from("pedido_facturas")
            .select("pedido_id,numero_factura,pdf_path,fecha,recibida_en")
            .in("pedido_id", pedidos.map((p) => p.id));
          // La más reciente de cada pedido, solo con su PDF (la misma que da api/factura.ts).
          const porPedido: Record<string, { numero: string; pdf: boolean; orden: string }> = {};
          for (const f of (fac.error ? [] : fac.data ?? []) as { pedido_id: string; numero_factura: string | null; pdf_path: string | null; fecha: string | null; recibida_en: string | null }[]) {
            const orden = `${f.fecha ?? ""}|${f.recibida_en ?? ""}`;
            if (!porPedido[f.pedido_id] || orden > porPedido[f.pedido_id].orden) porPedido[f.pedido_id] = { numero: f.numero_factura ?? "", pdf: !!f.pdf_path, orden };
          }
          const conPdf = (id: string) => (porPedido[id]?.pdf ? { pedidoId: id, numero: porPedido[id].numero } : null);
          const ref = refPedido && RE_REF_PEDIDO.test(refPedido) ? refPedido : null;
          const nombrado = ref ? pedidos.find((p) => (p.codigo_seguimiento ?? "").toUpperCase() === ref) : undefined;
          // Si nombró un pedido suyo, solo el de ese pedido (si aún no tiene, ninguno); si no, el más reciente con factura.
          factura = nombrado ? conPdf(nombrado.id) : pedidos.map((p) => conPdf(p.id)).find(Boolean) ?? null;
        }
        if (vivo) setInfo({ estado: "listo", factura });
      } catch {
        if (vivo) setInfo({ estado: "listo", factura: null });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [refPedido]);

  const ver = () => {
    void medirEvento("blue_ver_facturas", "Blue: ver mis facturas", { metadata: { con_factura: info.estado === "listo" && !!info.factura } });
    onVer();
  };

  async function descargar(pedidoId: string) {
    if (pidiendo) return;
    setPidiendo(true);
    setAviso(null);
    try {
      const { data } = await supabase.auth.getSession();
      const r = await fetch(`/api/factura?pedido=${encodeURIComponent(pedidoId)}`, {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
      const d = (await r.json().catch(() => null)) as { ok?: boolean; url?: string } | null;
      if (r.ok && d?.ok && d.url) {
        void medirEvento("blue_factura_descargada", "Blue: factura descargada");
        abrirDescarga(d.url);
      } else if (r.status === 409) {
        setAviso("La factura está llegando, prueba en unos minutos.");
      } else {
        setAviso("No hemos podido descargar la factura. Pulsa «Ver mis facturas» o inténtalo en un rato.");
      }
    } catch {
      setAviso("No hemos podido descargar la factura: revisa tu conexión.");
    } finally {
      setPidiendo(false);
    }
  }

  if (info.estado === "sin_sesion") {
    return (
      <ChipTienda
        nativeID="blue-ia-accion-facturas-entrar"
        icono="log-in-outline"
        label={AVISO_LOGIN_FACTURAS}
        onPress={() => {
          void medirEvento("blue_ver_facturas", "Blue: ver mis facturas", { metadata: { sin_sesion: true } });
          router.push(`/perfil?acceso=entrar&aviso=${encodeURIComponent(AVISO_LOGIN_FACTURAS)}` as never);
        }}
      />
    );
  }
  const factura = info.estado === "listo" ? info.factura : null;
  return (
    <View style={{ gap: 8 }}>
      {factura ? (
        <ChipTienda
          nativeID="blue-ia-accion-factura-descargar"
          icono="document-text-outline"
          label={`Descargar factura${factura.numero ? ` ${factura.numero}` : ""}`}
          onPress={() => descargar(factura.pedidoId)}
          boton
          ocupado={pidiendo}
        />
      ) : null}
      <ChipTienda nativeID="blue-ia-accion-facturas" icono="receipt-outline" label="Ver mis facturas" onPress={ver} />
      {aviso ? (
        <Text accessibilityRole="alert" style={{ color: COLORS.muted, fontSize: 12.5, lineHeight: 18 }}>
          {aviso}
        </Text>
      ) : info.estado === "listo" && !factura ? (
        // Aún sin factura: el plazo (regla del dueño, 2026-11-11), aunque la respuesta no lo diga.
        <Text nativeID="blue-ia-facturas-plazo" style={{ color: COLORS.muted, fontSize: 12.5, lineHeight: 18 }}>
          Tu factura saldrá en «Mis pedidos»: con tarjeta, en un máximo de 24 horas; en efectivo u otra forma de pago, entre 24 y 48 horas.
        </Text>
      ) : null}
    </View>
  );
}

// Fila de botones "premium" para las redes sociales que Blue IA recomienda
// en una respuesta concreta: icono de la red + nombre, en una píldora con
// borde suave — nada de URLs ni corchetes de markdown a la vista. Cada uno
// abre el enlace real (el mismo que guarda Daniel en
// app/admin/redes-sociales.tsx) tal y como lo resuelve el sistema operativo
// del usuario (ver la nota larga en components/EnlacesRedesSociales.tsx sobre por
// qué no hace falta ningún truco extra para "abrir la app o descargarla").
function BlueIASocialChips({ chips }: { chips: SocialChip[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {chips.map((chip) => {
        const meta = SOCIAL_CHIP_ICONS[chip.platform];
        return (
          <Pressable
            key={chip.platform}
            onPress={() => openSocialChip(chip.href)}
            accessibilityRole="link"
            accessibilityLabel={chip.label}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingVertical: 7,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor: "#FFFFFF",
              borderWidth: 1,
              borderColor: COLORS.border,
              opacity: pressed ? 0.82 : 1,
              shadowColor: "#0B2138",
              shadowOpacity: 0.06,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 2 },
            })}
          >
            {meta ? meta.render(meta.color, 15) : null}
            <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 12.5 }}>
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// "Blue IA está escribiendo…" mientras se espera la respuesta del servidor.
function BlueIATypingBubble() {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
      {/* La mascota ya está al lado (moviéndose): dentro de la burbuja, solo el texto. */}
      <AvatarBlue escribiendo />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: "#E3EAF2",
          backgroundColor: "#F1F6FA",
          paddingVertical: 10,
          paddingHorizontal: 14,
        }}
      >
        <Text style={{ color: COLORS.muted, fontSize: 13 }}>Blue IA está escribiendo…</Text>
      </View>
    </View>
  );
}

// Cada cuánto avanza solo la fila de sugerencias (tiempo de sobra para leer una) y cuánto
// espera tras tocarla o deslizarla a mano antes de volver a moverse.
const SUGERENCIA_PASO_MS = 3800;
const SUGERENCIA_PAUSA_MS = 9000;

// Fila de sugerencias que se desplaza sola, de una en una y en bucle. Si la persona la
// desliza con el dedo, se para un rato para no quitarle lo que está leyendo.
function SugerenciasAutomaticas({ items, onPress }: { items: QuickAction[]; onPress: (item: QuickAction) => void }) {
  const ref = useRef<ScrollView>(null);
  const posiciones = useRef<number[]>([]);
  const indice = useRef(0);
  const pausaHasta = useRef(0);
  const anchoVisible = useRef(0);
  const anchoTotal = useRef(0);

  useEffect(() => {
    const t = setInterval(() => {
      if (Date.now() < pausaHasta.current) return;
      // Si todas caben en pantalla, no hace falta moverse.
      if (anchoTotal.current <= anchoVisible.current + 4) return;
      const maxX = anchoTotal.current - anchoVisible.current;
      const actual = posiciones.current[indice.current] ?? 0;
      const siguiente = indice.current + 1;
      const x = posiciones.current[siguiente];
      if (actual >= maxX - 2 || x === undefined) {
        indice.current = 0;
        ref.current?.scrollTo({ x: 0, animated: true });
        return;
      }
      indice.current = siguiente;
      ref.current?.scrollTo({ x: Math.min(maxX, Math.max(0, x - 12)), animated: true });
    }, SUGERENCIA_PASO_MS);
    return () => clearInterval(t);
  }, []);

  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      onLayout={(e) => (anchoVisible.current = e.nativeEvent.layout.width)}
      onContentSizeChange={(w) => (anchoTotal.current = w)}
      onScrollBeginDrag={() => (pausaHasta.current = Date.now() + SUGERENCIA_PAUSA_MS)}
      onTouchStart={() => (pausaHasta.current = Date.now() + SUGERENCIA_PAUSA_MS)}
      // flexGrow + center: centradas si caben; si no, se deslizan.
      contentContainerStyle={{ gap: 8, flexGrow: 1, justifyContent: "center", paddingHorizontal: 4 }}
    >
      {items.map((item, i) => (
        <View key={item.id} onLayout={(e) => (posiciones.current[i] = e.nativeEvent.layout.x)}>
          <QuickSuggestionChip item={item} onPress={() => onPress(item)} />
        </View>
      ))}
    </ScrollView>
  );
}

// Chip compacto de sugerencia rápida, pensado para ir en una fila horizontal
// justo encima del compositor (a diferencia de las tarjetas grandes de
// antes, aquí solo hay sitio para icono + título).
function QuickSuggestionChip({
  item,
  onPress,
}: {
  item: QuickAction;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          borderRadius: 999,
          paddingVertical: 10,
          paddingHorizontal: 14,
          backgroundColor: "#FFFFFF",
          borderWidth: 1,
          borderColor: COLORS.border,
          shadowColor: COLORS.accent,
          shadowOpacity: 0.08,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
        }}
      >
        <Ionicons name={item.icon} size={16} color={COLORS.accent} />
        <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13 }}>{item.title}</Text>
      </View>
    </Pressable>
  );
}

// Botón redondo de enviar, mismo tamaño y espíritu que el de Chat Global
// (círculo azul con flecha), simplificado sin la animación de "enviado ✓"
// porque aquí no hace falta ese matiz.
function BlueIASendButton({
  onPress,
  disabled,
  sending,
}: {
  onPress: () => void;
  disabled?: boolean;
  sending?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel="Enviar la pregunta">
      {({ pressed }) => (
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: disabled ? "rgba(0,170,228,0.35)" : COLORS.accent,
            opacity: pressed ? 0.9 : 1,
            shadowColor: COLORS.accent,
            shadowOpacity: disabled ? 0 : 0.28,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 3 },
          }}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
          )}
        </View>
      )}
    </Pressable>
  );
}

