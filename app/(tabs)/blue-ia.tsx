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
 *   sola vez al entrar.
 * - BLUE_IA_API_URL es relativa ("/api/blue-ia") en web, porque ahí Vercel
 *   sirve la función serverless en el mismo dominio que la app. Esto solo
 *   funciona una vez desplegado en Vercel (no en `expo start --web` local,
 *   que no tiene funciones serverless).
 *
 * - Contexto por URL: ?producto=<id>, ?pedido=<nº>, ?reparacion=<id> o
 *   ?tema=<texto>. Se muestra "Preguntas por: …" arriba y se antepone al
 *   primer mensaje que se manda a la API (mismo formato {message, history}).
 * - "Hablar con el equipo": siempre junto al compositor y destacado bajo la
 *   respuesta tras 2+ respuestas o si la IA no ha podido ayudar. Abre el
 *   chat privado con la tienda (abrirChatEquipo) con un resumen de las
 *   últimas 6 vueltas; sin sesión, lleva a /perfil con un aviso.
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
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
import { openExternalLink } from "../../lib/openExternalLink";
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

type BlueIAMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  // Texto real enviado a la API (con el contexto antepuesto, si lo hay).
  apiText?: string;
  isError?: boolean;
  socialChips?: SocialChip[];
  productChips?: ProductChip[];
};

// Respuestas en las que la IA reconoce que no puede resolverlo sola.
const NO_PUEDE_AYUDAR = /no (puedo|sé|se|tengo|dispongo)|equipo|contact|whatsapp|llamar|llámanos/i;

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
    pedido?: string;
    reparacion?: string;
    tema?: string;
  }>();
  const productoId = paramTexto(params.producto);
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
    if (pedido) return { visible: `tu pedido nº ${pedido}`, prefijo: `[Sobre mi pedido nº ${pedido}]` };
    if (reparacion)
      return { visible: `tu reparación ${reparacion}`, prefijo: `[Sobre mi reparación: ${reparacion}]` };
    if (tema) return { visible: tema, prefijo: `[Tema: ${tema}]` };
    return null;
  }, [productoId, producto, pedido, reparacion, tema]);

  const [draft, setDraft] = useState("");
  const [abriendoEquipo, setAbriendoEquipo] = useState(false);
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [messages, setMessages] = useState<BlueIAMessage[]>([WELCOME_MESSAGE]);
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const showScrollToBottomRef = useRef(false);

  const scrollRef = useRef<ScrollView | null>(null);
  const autoAskedRef = useRef(false);

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
  const entraConContexto = !!(productoId || pedido || reparacion || tema || paramTexto(params.q));

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

  // Con sesión y sin contexto de entrada: abre la última conversación no archivada.
  useEffect(() => {
    if (!userId || ultimaCargadaRef.current || entraConContexto) return;
    ultimaCargadaRef.current = true;
    let vivo = true;
    (async () => {
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
      if (!vivo || !msgs || messagesRef.current.some((m) => m.role === "user")) return;
      conversacionIdRef.current = conv.id;
      setContextoGuardado(conv.contexto);
      setMessages([WELCOME_MESSAGE, ...msgs]);
    })();
    return () => {
      vivo = false;
    };
  }, [userId, entraConContexto, cargarMensajes]);

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

  // Deja la pantalla como recién abierta (sin contexto de URL).
  const nuevaConversacion = useCallback(async () => {
    await guardadoRef.current;
    conversacionIdRef.current = null;
    setUsarContextoUrl(false);
    setContextoGuardado(null);
    setErrorText(null);
    setMessages([WELCOME_MESSAGE]);
    setHistorialOpen(false);
  }, []);

  const abrirConversacion = useCallback(
    async (conv: ConversacionGuardada) => {
      await guardadoRef.current;
      const msgs = await cargarMensajes(conv);
      if (!msgs) return;
      conversacionIdRef.current = conv.id;
      setUsarContextoUrl(false);
      setContextoGuardado(conv.contexto);
      setErrorText(null);
      setMessages([WELCOME_MESSAGE, ...msgs]);
      setHistorialOpen(false);
    },
    [cargarMensajes]
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
      }
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
        const response = await fetch(BLUE_IA_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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

        setMessages((prev) => [
          ...prev,
          { id: `${Date.now()}-a`, role: "assistant", text: String(data.reply), socialChips, productChips },
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

  // Destacar "Hablar con el equipo" tras 2+ respuestas o si la IA no ha podido ayudar.
  const respuestasIA = messages.filter((m) => m.role === "assistant" && m.id !== WELCOME_MESSAGE.id);
  const ultimaIA = respuestasIA[respuestasIA.length - 1];
  const destacarEquipo =
    !sending &&
    !!ultimaIA &&
    messages[messages.length - 1]?.id === ultimaIA.id &&
    (respuestasIA.length >= 2 || !!ultimaIA.isError || NO_PUEDE_AYUDAR.test(ultimaIA.text));

  // Si se llega aquí desde "Preguntas frecuentes" (Inicio → /blue-ia?q=...),
  // manda esa pregunta automáticamente una sola vez al entrar — igual que
  // tocar una sugerencia rápida, pero disparado por la navegación en vez de
  // por un toque en esta misma pantalla.
  useEffect(() => {
    const incoming = typeof params.q === "string" ? params.q.trim() : "";
    if (!incoming || autoAskedRef.current) return;
    autoAskedRef.current = true;
    handleAsk(incoming);
    // Solo debe dispararse al entrar con el parámetro, no cada vez que
    // cambie handleAsk (que se recrea con cada tecla escrita en el cuadro).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q]);

  // Las sugerencias rápidas solo tienen sentido antes de que exista una
  // conversación real: en cuanto hay alguna pregunta (o se está esperando
  // respuesta), desaparecen para dejar toda la pantalla a la conversación.
  const showQuickSuggestions = messages.length <= 1 && !sending;

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
            paddingBottom: showQuickSuggestions ? 230 : 160,
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
            {messages.map((message) => (
              <BlueIABubble key={message.id} message={message} />
            ))}
            {sending && <BlueIATypingBubble />}
            {destacarEquipo && (
              <View style={{ alignItems: "center", gap: 6, paddingTop: 6 }}>
                <Text style={{ color: COLORS.muted, fontSize: 13, textAlign: "center" }}>
                  ¿Prefieres que te atienda una persona?
                </Text>
                <HablarEquipoButton
                  variant="primary"
                  busy={abriendoEquipo}
                  onPress={handleHablarEquipo}
                />
              </View>
            )}
          </View>
        </ScrollView>

        {/* "⬇️" para volver al último mensaje, igual que en Chat Global. */}
        {showScrollToBottom && (
          <Pressable
            onPress={handleScrollToLatest}
            style={({ pressed }) => ({
              position: "absolute",
              right: 16,
              bottom: showQuickSuggestions ? 208 : 148,
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
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: 12,
            gap: 10,
          }}
        >
          {showQuickSuggestions && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              // flexGrow + center: centradas si caben; si no, se deslizan.
              contentContainerStyle={{ gap: 8, flexGrow: 1, justifyContent: "center" }}
            >
              {quickActions.map((item) => (
                <QuickSuggestionChip
                  key={item.id}
                  item={item}
                  onPress={() => handleAsk(item.prompt)}
                />
              ))}
            </ScrollView>
          )}

          {!!errorText && (
            <Text style={{ color: "#B91C1C", fontWeight: "800", textAlign: "center" }}>
              {errorText}
            </Text>
          )}

          {/* Acceso siempre visible al equipo (además del destacado bajo la respuesta). */}
          <View style={{ alignItems: "center" }}>
            <HablarEquipoButton variant="link" busy={abriendoEquipo} onPress={handleHablarEquipo} />
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TextInput
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
      onNueva={nuevaConversacion}
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
      {!mine && (
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: COLORS.accentSoft,
            borderWidth: 1,
            borderColor: COLORS.accentBorder,
          }}
        >
          <Ionicons name="sparkles-outline" size={14} color={COLORS.accent} />
        </View>
      )}

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
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: COLORS.accentSoft,
          borderWidth: 1,
          borderColor: COLORS.accentBorder,
        }}
      >
        <Ionicons name="sparkles-outline" size={14} color={COLORS.accent} />
      </View>

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
        <MarcaAnimada cual="carga" ancho={48} tocable={false} />
        <Text style={{ color: COLORS.muted, fontSize: 13 }}>Blue IA está escribiendo…</Text>
      </View>
    </View>
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

// "Hablar con el equipo": discreto (enlace) junto al compositor o destacado
// (píldora azul) bajo la respuesta de la IA.
function HablarEquipoButton({
  variant,
  busy,
  onPress,
}: {
  variant: "link" | "primary";
  busy?: boolean;
  onPress: () => void;
}) {
  const primary = variant === "primary";
  const color = primary ? "#FFFFFF" : COLORS.primary;
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
        paddingVertical: primary ? 11 : 4,
        paddingHorizontal: primary ? 20 : 8,
        backgroundColor: primary ? COLORS.primary : "transparent",
        opacity: busy ? 0.6 : pressed ? 0.85 : 1,
        shadowColor: COLORS.primary,
        shadowOpacity: primary ? 0.22 : 0,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
      })}
    >
      {busy ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Ionicons name="headset-outline" size={primary ? 17 : 15} color={color} />
      )}
      <Text style={{ color, fontWeight: "900", fontSize: primary ? 14 : 13 }}>
        Hablar con el equipo
      </Text>
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
    <Pressable onPress={onPress} disabled={disabled}>
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
