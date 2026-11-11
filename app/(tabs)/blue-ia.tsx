/**
 * app/(tabs)/blue-ia.tsx
 *
 * Qué hace: pantalla "Blue IA", el asistente de la tienda. Ahora es una
 * conversación de pantalla completa, estilo ChatGPT, con el mismo lenguaje
 * visual que usa "Chat Global" (app/(tabs)/chat-global.tsx): los mensajes
 * ocupan toda la pantalla, hay un compositor fijo abajo del todo con un
 * cuadro de texto redondeado + botón circular de enviar, y no hay ninguna
 * tarjeta grande de bienvenida estorbando — esa información (qué es Blue
 * IA y para qué sirve) vive en un modal accesible con el icono "ⓘ" de
 * arriba a la derecha, igual que en Chat Global.
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
 *   no se guardan). El icono del reloj (junto al ⓘ) abre el panel Historial:
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
 *   «Descargar factura F-…» (/api/factura?pedido=… y abrirDescarga de lib/openExternalLink.ts); sin
 *   factura, el plazo; sin sesión, «Inicia sesión para ver tus facturas». Analítica propia: «Blue: ver
 *   mis facturas» y «Blue: factura descargada» (app/admin/analytics.tsx, #analitica-facturas).
 * - Cada respuesta lleva al lado a Blue, la mascota de atención al cliente
 *   (la misma imagen que Blue flotante: AvatarBlue), quieta; mientras
 *   escribe, se mueve.
 *
 * Conectado con:
 * - components/ProductChatThread.tsx → abrirChatEquipo.
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
import { abrirChatEquipo } from "../../components/ProductChatThread";
import { trackEvent } from "../../lib/analytics";
import { estadoAtencion, HORARIO_CORTO, type EstadoAtencion } from "../../lib/horarioAtencion";
import { abrirDescarga, openExternalLink } from "../../lib/openExternalLink";
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

type HelpBlock = {
  id: string;
  title: string;
  desc: string;
  tone: "accent" | "success" | "gold";
};

// Un "chip" de red social que puede venir pegado a una respuesta de Blue IA
// (ver api/blue-ia.ts → pickSocialChips) — datos limpios, nunca texto: el
// enlace real lo abre BlueIASocialChips, nunca aparece escrito en el mensaje.
type SocialChip = { platform: string; label: string; href: string };

// Un artículo del catálogo que nombra la respuesta (api/blue-ia.ts → pickProductChips):
// se pinta como botón que abre su ficha.
type ProductChip = { id: string; title: string; price: number };

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
// de components/SocialLinks.tsx (mismo motivo que ya se explica ahí y en
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
    // Síncrono a propósito — ver la nota de components/SocialLinks.tsx: el
    // truco de abrir en Chrome (lib/openExternalLink.ts) necesita ocurrir
    // dentro del mismo toque del usuario.
    openExternalLink(href);
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
  const [infoModalOpen, setInfoModalOpen] = useState(false);
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
  const [cargandoLista, setCargandoLista] = useState(false);
  // Contexto de la conversación guardada que está abierta ("Preguntas por: …").
  const [contextoGuardado, setContextoGuardado] = useState<string | null>(null);
  // El contexto de la URL solo vale para la conversación con la que se entra.
  const [usarContextoUrl, setUsarContextoUrl] = useState(true);
  const conversacionIdRef = useRef<string | null>(null);
  const historialDisponibleRef = useRef(true);
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
    const { data, error } = await supabase
      .from("blue_ia_mensajes")
      .select("id,rol,texto")
      .eq("conversacion_id", conv.id)
      .order("created_at", { ascending: true });
    if (error) {
      if (tablaNoExiste(error)) historialDisponibleRef.current = false;
      else console.warn("Blue IA: no se han podido cargar los mensajes", error);
      return null;
    }
    const filas = (data ?? []) as { id: string; rol: "user" | "assistant"; texto: string }[];
    let primeraUser = true;
    return filas.map<BlueIAMessage>((f) => {
      const m: BlueIAMessage = { id: f.id, role: f.rol, text: f.texto };
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
        void trackEvent("blue_ia_conversacion_retomada", "Blue IA: conversación retomada");
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
    (pregunta: string, respuesta: string, contextoTexto: string | null) => {
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
            const { error } = await supabase
              .from("blue_ia_mensajes")
              .insert({ conversacion_id, rol, texto: texto.slice(0, 4000) });
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
      const { data, error } = await supabase
        .from("blue_ia_conversaciones")
        .select("id,titulo,contexto,updated_at")
        .eq("archivada", false)
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) {
        if (tablaNoExiste(error)) historialDisponibleRef.current = false;
        else console.warn("Blue IA: no se ha podido cargar la lista", error);
        return;
      }
      setConversaciones((data ?? []) as ConversacionGuardada[]);
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
      void trackEvent("blue_ia_conversacion_nueva", "Blue IA: nueva conversación", { metadata: { desde } });
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

  const helpBlocks = useMemo<HelpBlock[]>(
    () => [
      {
        id: "1",
        title: "Te ayuda a comprar mejor",
        desc: "Si no sabes qué elegir, Blue IA te orienta según lo que buscas, el dinero que quieres gastar y el tipo de uso que le vas a dar.",
        tone: "accent",
      },
      {
        id: "2",
        title: "Te orienta si quieres vender o cambiar",
        desc: "También puede ayudarte si quieres vender tu dispositivo o usarlo como parte de pago para abaratar otra compra.",
        tone: "success",
      },
      {
        id: "3",
        title: "Resuelve dudas de soporte",
        desc: "Puedes usarla para preguntar por garantía, compatibilidades, limpieza, reparaciones, mantenimiento o dudas generales de la tienda.",
        tone: "gold",
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
              .map((c: any) => ({ id: c.id, title: c.title, price: Number(c.price ?? 0) }))
          : undefined;

        // Botones de la tienda que encajan con la respuesta (vender, cambiar, reparar, buscar…).
        const accionChips = leerAccionChips(data.accionChips);
        if (accionChips) {
          for (const c of accionChips) {
            void trackEvent("blue_ia_boton", `Blue IA: botón mostrado · ${ACCIONES_BLUE[c.tipo].label({ tipo: c.tipo })}`, { metadata: { tipo: c.tipo } });
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
          contextoActivo ? `Preguntas por: ${contextoActivo.visible}` : null
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
    void trackEvent("blue_ia_equipo_fuera_horario", "Blue IA: fuera de horario, aviso", { metadata: { accion: "aviso" } });
  }, [handleHablarEquipo]);

  const seguirConBlue = useCallback(() => {
    setAvisoHorario(false);
    void trackEvent("blue_ia_equipo_fuera_horario", "Blue IA: fuera de horario, sigue con Blue", { metadata: { accion: "seguir_blue" } });
    campoRef.current?.focus();
  }, []);

  const escribirIgualmente = useCallback(() => {
    setAvisoHorario(false);
    void trackEvent("blue_ia_equipo_fuera_horario", "Blue IA: fuera de horario, escribe al equipo", { metadata: { accion: "escribir" } });
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
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
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
            paddingTop: 14,
            // Hueco para el compositor (crece con el horario y con el aviso fuera de horario).
            paddingBottom: Math.max(showQuickSuggestions ? 230 : 160, altoCompositor + 28),
            alignItems: "center",
          }}
        >
          {/* Columna centrada: no se pega a la izquierda en pantallas anchas */}
          <View style={{ width: "100%", maxWidth: 860, gap: 10 }}>
            {/*
              Icono "ⓘ" arriba, centrado: abre el modal con qué es Blue IA. Va dentro de
              la conversación (se desplaza con ella) para no tapar nunca los mensajes.
            */}
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 20 }}>
              <IconoCabecera
                icon="information-circle-outline"
                label="Qué es Blue IA"
                onPress={() => setInfoModalOpen(true)}
              />
              {/* Historial de conversaciones guardadas en la cuenta. */}
              <IconoCabecera icon="time-outline" label="Historial" onPress={abrirHistorial} />
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
        <View
          onLayout={(e) => setAltoCompositor(Math.round(e.nativeEvent.layout.height))}
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: 12,
            gap: 10,
          }}
        >
          {showQuickSuggestions && (
            <SugerenciasAutomaticas items={quickActions} onPress={(item) => handleAsk(item.prompt)} />
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

          {/* Horario del equipo, siempre a la vista (dueño, 2026-11-03). */}
          <Text nativeID="blue-ia-horario" style={{ color: COLORS.muted, fontSize: 11.5, lineHeight: 16, textAlign: "center" }}>
            <Text style={{ color: atencion.abierto ? "#1F9E52" : COLORS.muted, fontWeight: "900" }}>
              {atencion.abierto ? `● Equipo atendiendo hasta las ${atencion.hasta}` : `● Equipo fuera de horario · vuelve ${atencion.vuelve}`}
            </Text>
            {"\n"}
            {HORARIO_CORTO}
          </Text>

          {/* El único acceso al equipo, siempre a la vista junto al recuadro de escribir; con una conversación en marcha,
              a su lado «Nueva conversación» (la anterior queda en el Historial). */}
          <View style={{ flexDirection: "row", justifyContent: "center", flexWrap: "wrap", columnGap: 6 }}>
            {conversacionEmpezada ? <NuevaConversacionButton disabled={sending} onPress={() => nuevaConversacion("boton")} /> : null}
            <HablarEquipoButton busy={abriendoEquipo} onPress={pulsarHablarEquipo} />
          </View>

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

    <BlueIAInfoModal
      visible={infoModalOpen}
      onClose={() => setInfoModalOpen(false)}
      helpBlocks={helpBlocks}
    />

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
    />
    </>
  );
}

// Icono de la cabecera (ⓘ e Historial): solo el icono azul, sin burbuja ni
// sombra; hitSlop amplio para que sea fácil de tocar.
function IconoCabecera({
  icon,
  label,
  onPress,
}: {
  icon: IoniconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={12}
      style={({ pressed }) => ({
        padding: 2,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={icon} size={20} color={COLORS.accent} />
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
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: COLORS.overlay,
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: "100%",
            maxWidth: 480,
            maxHeight: 600,
            borderRadius: 24,
            backgroundColor: "#FFFFFF",
            paddingVertical: 22,
            paddingHorizontal: 20,
            gap: 14,
          }}
        >
          {/* Cerrar */}
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
            hitSlop={10}
            style={({ pressed }) => ({
              position: "absolute",
              top: 14,
              right: 14,
              zIndex: 2,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Ionicons name="close" size={22} color={COLORS.text} />
          </Pressable>

          <View style={{ alignItems: "center", gap: 6 }}>
            <Ionicons name="time-outline" size={24} color={COLORS.accent} />
            <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "900", textAlign: "center" }}>
              Historial
            </Text>
          </View>

          {!conSesion ? (
            <View style={{ alignItems: "center", gap: 14, paddingVertical: 6 }}>
              <Text style={{ color: COLORS.muted, lineHeight: 21, textAlign: "center" }}>
                Inicia sesión para guardar tus conversaciones con Blue IA
              </Text>
              <BotonPrincipal
                icon="person-circle-outline"
                texto="Iniciar sesión"
                onPress={() => {
                  onClose();
                  router.push(
                    `/perfil?aviso=${encodeURIComponent(AVISO_LOGIN_HISTORIAL)}` as never
                  );
                }}
              />
            </View>
          ) : (
            <>
              <View style={{ alignItems: "center" }}>
                <BotonPrincipal icon="add" texto="Nueva conversación" onPress={onNueva} />
              </View>

              {cargando && conversaciones.length === 0 ? (
                <ActivityIndicator color={COLORS.accent} style={{ paddingVertical: 16 }} />
              ) : conversaciones.length === 0 ? (
                <Text style={{ color: COLORS.muted, textAlign: "center", paddingVertical: 10 }}>
                  Aún no tienes conversaciones guardadas.
                </Text>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
                  {conversaciones.map((c, i) => {
                    const abierta = c.id === abiertaId;
                    return (
                      <View
                        key={c.id}
                        style={{
                          alignItems: "center",
                          gap: 4,
                          paddingVertical: 12,
                          borderTopWidth: i === 0 ? 0 : 1,
                          borderTopColor: COLORS.border,
                        }}
                      >
                        <Pressable
                          onPress={() => onAbrir(c)}
                          accessibilityRole="button"
                          accessibilityLabel={`Abrir: ${c.titulo}`}
                          style={({ pressed }) => ({ alignItems: "center", opacity: pressed ? 0.7 : 1 })}
                        >
                          <Text
                            numberOfLines={2}
                            style={{
                              color: abierta ? COLORS.primary : COLORS.text,
                              fontWeight: "800",
                              fontSize: 15,
                              textAlign: "center",
                            }}
                          >
                            {c.titulo}
                          </Text>
                          <Text style={{ color: COLORS.muted, fontSize: 12, textAlign: "center" }}>
                            {abierta ? "Abierta · " : ""}
                            {fechaMadrid(c.updated_at)}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => onArchivar(c)}
                          accessibilityRole="button"
                          accessibilityLabel={`Archivar: ${c.titulo}`}
                          hitSlop={6}
                          style={({ pressed }) => ({
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                            opacity: pressed ? 0.6 : 1,
                          })}
                        >
                          <Ionicons name="archive-outline" size={13} color={COLORS.muted} />
                          <Text style={{ color: COLORS.muted, fontSize: 12, fontWeight: "700" }}>
                            Archivar
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Botón principal en píldora (#1EA7E8).
function BotonPrincipal({
  icon,
  texto,
  onPress,
}: {
  icon: IoniconName;
  texto: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        borderRadius: 999,
        paddingVertical: 11,
        paddingHorizontal: 20,
        backgroundColor: COLORS.primary,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Ionicons name={icon} size={17} color="#FFFFFF" />
      <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>{texto}</Text>
    </Pressable>
  );
}

// Burbuja de conversación: a la derecha y en azul si la escribió el usuario,
// a la izquierda con un icono si la respondió Blue IA. Un error de red se ve
// igual que una respuesta normal pero con un aviso en rojo debajo, para no
// mezclar el tono de "algo falló" con el resto de la conversación. Si la
// respuesta trae "socialChips" (ver api/blue-ia.ts), se pintan como una fila
// de botones con icono justo debajo del texto — nunca como enlaces sueltos
// dentro del mensaje.
// Quién responde: Blue, la mascota de atención al cliente (la misma imagen que Blue flotante, components/Campanita.tsx),
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
    <View
      style={{
        flexDirection: "row",
        justifyContent: mine ? "flex-end" : "flex-start",
        alignItems: "flex-end",
        gap: 8,
      }}
    >
      {!mine && <AvatarBlue />}

      <View
        style={{
          maxWidth: "82%",
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

// Artículos que Blue IA recomienda en la respuesta: título y precio; al tocarlos se abre
// su ficha.
function BlueIAProductChips({ chips }: { chips: ProductChip[] }) {
  return (
    <View style={{ gap: 8 }}>
      {chips.map((chip) => (
        <Pressable
          key={chip.id}
          onPress={() => router.push(`/producto/${chip.id}` as never)}
          accessibilityRole="link"
          accessibilityLabel={`Ver ${chip.title}`}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingVertical: 9,
            paddingHorizontal: 12,
            borderRadius: 14,
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: COLORS.border,
            opacity: pressed ? 0.82 : 1,
          })}
        >
          <Ionicons name="pricetag-outline" size={15} color={COLORS.accent} />
          <Text style={{ flex: 1, color: COLORS.text, fontWeight: "800", fontSize: 12.5 }}>{chip.title}</Text>
          <Text style={{ color: COLORS.accent, fontWeight: "900", fontSize: 12.5 }}>{fmtEUR(chip.price)}</Text>
          <Ionicons name="chevron-forward" size={14} color={COLORS.accent} />
        </Pressable>
      ))}
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
          void trackEvent("blue_ia_boton", `Blue IA: botón tocado · ${def.label({ tipo: chip.tipo })}`, { metadata: { tipo: chip.tipo, con_datos: !!(chip.articulo || chip.busqueda) } });
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
    void trackEvent("blue_ver_facturas", "Blue: ver mis facturas", { metadata: { con_factura: info.estado === "listo" && !!info.factura } });
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
        void trackEvent("blue_factura_descargada", "Blue: factura descargada");
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
          void trackEvent("blue_ver_facturas", "Blue: ver mis facturas", { metadata: { sin_sesion: true } });
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
// del usuario (ver la nota larga en components/SocialLinks.tsx sobre por
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

// "Hablar con el equipo": discreto (enlace con auriculares) junto al recuadro de escribir; es el único. Se ve igual
// que antes, pero ahora toda su fila mide 44 px para tocarlo bien con el pulgar.
function HablarEquipoButton({ busy, onPress }: { busy?: boolean; onPress: () => void }) {
  const color = COLORS.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel="Hablar con el equipo"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        borderRadius: 999,
        minHeight: 44,
        paddingHorizontal: 12,
        opacity: busy ? 0.6 : pressed ? 0.85 : 1,
      })}
    >
      {busy ? <ActivityIndicator size="small" color={color} /> : <Ionicons name="headset-outline" size={15} color={color} />}
      <Text style={{ color, fontWeight: "900", fontSize: 13 }}>Hablar con el equipo</Text>
    </Pressable>
  );
}

// «Nueva conversación»: mismo estilo que «Hablar con el equipo», a su lado. La conversación de ahora se queda en el
// Historial (con sesión); mientras Blue IA contesta, espera.
function NuevaConversacionButton({ disabled, onPress }: { disabled?: boolean; onPress: () => void }) {
  const color = COLORS.primary;
  return (
    <Pressable
      nativeID="blue-ia-nueva"
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Nueva conversación"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        borderRadius: 999,
        minHeight: 44,
        paddingHorizontal: 12,
        opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
      })}
    >
      <Ionicons name="create-outline" size={15} color={color} />
      <Text style={{ color, fontWeight: "900", fontSize: 13 }}>Nueva conversación</Text>
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

// Modal "ⓘ": qué es Blue IA y para qué sirve. Sustituye a la tarjeta de
// bienvenida que antes ocupaba espacio siempre arriba de la pantalla — igual
// que hace Chat Global con su propio InfoModal.
function BlueIAInfoModal({
  visible,
  onClose,
  helpBlocks,
}: {
  visible: boolean;
  onClose: () => void;
  helpBlocks: HelpBlock[];
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: COLORS.overlay,
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        <Pressable onPress={() => {}} style={{ width: "100%", maxWidth: 480 }}>
          <LinearGradient
            colors={["rgba(30,167,232,0.14)", "rgba(0,170,228,0.10)", "rgba(30,167,232,0.02)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 28, padding: 1 }}
          >
            <View
              style={{
                borderRadius: 27,
                backgroundColor: "#FFFFFF",
                padding: 22,
                gap: 14,
                maxHeight: 560,
              }}
            >
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
                <View style={{ alignItems: "center", gap: 14 }}>
                  <Ionicons name="sparkles-outline" size={26} color={COLORS.accent} />

                  <Text
                    style={{
                      color: COLORS.text,
                      fontSize: 24,
                      fontWeight: "900",
                      textAlign: "center",
                    }}
                  >
                    Blue IA
                  </Text>

                  <Text style={{ color: COLORS.muted, lineHeight: 22, textAlign: "center" }}>
                    Tu asistente para resolver dudas sobre productos, compras, ventas, cambios,
                    reparaciones, limpieza, envíos y pago a plazos.
                  </Text>

                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 12,
                      justifyContent: "center",
                    }}
                  >
                    <MiniPill text="Productos" tone="accent" />
                    <MiniPill text="Ventas" tone="success" />
                    <MiniPill text="Cambios" tone="gold" />
                    <MiniPill text="Pago a plazos" tone="accent" />
                  </View>

                  <View style={{ width: "100%", gap: 16, marginTop: 4 }}>
                    {helpBlocks.map((item) => (
                      <HelpCard key={item.id} item={item} />
                    ))}
                  </View>

                  <Pressable
                    onPress={onClose}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.9 : 1,
                      alignSelf: "center",
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      backgroundColor: "#F6FAFD",
                      paddingVertical: 9,
                      paddingHorizontal: 16,
                      marginTop: 4,
                    })}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>Entendido</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </LinearGradient>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MiniPill({
  text,
  tone,
}: {
  text: string;
  tone: "accent" | "success" | "gold";
}) {
  // Solo texto de color, sin pastilla alrededor.
  const color = tone === "accent" ? "#1EA7E8" : tone === "success" ? "#15803D" : "#92660B";

  return (
    <Text style={{ color, fontWeight: "900", fontSize: 12, textAlign: "center" }}>{text}</Text>
  );
}

// Bloque de ayuda sin tarjeta: una rayita de color centrada + título y texto.
function HelpCard({ item }: { item: HelpBlock }) {
  const line =
    item.tone === "accent" ? COLORS.accent : item.tone === "success" ? COLORS.success : COLORS.gold;

  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      <View style={{ width: 28, height: 3, borderRadius: 2, backgroundColor: line }} />
      <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: "900", textAlign: "center" }}>
        {item.title}
      </Text>
      <Text style={{ color: COLORS.muted, lineHeight: 20, fontSize: 13, textAlign: "center" }}>
        {item.desc}
      </Text>
    </View>
  );
}
