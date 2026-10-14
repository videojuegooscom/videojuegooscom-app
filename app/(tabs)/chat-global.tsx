/**
 * app/(tabs)/chat-global.tsx
 *
 * Qué hace: "Foro" (antes "Chat"), un hub social de la tienda con 5
 * pestañas: Foro, Noticias, Novedades, Torneos y Chat. La pestaña Foro
 * muestra los mensajes reales de la comunidad en tiempo real y un cuadro
 * para escribir — es el mismo chat público de siempre, solo con nombre
 * nuevo. Cualquiera puede leerlo sin iniciar sesión, pero solo un usuario
 * registrado y con la sesión iniciada puede escribir/enviar mensajes.
 *
 * La pestaña "Chat" (nueva) es distinta: es la bandeja PRIVADA del cliente
 * logueado, con una conversación por cada producto por el que ha escrito
 * (botón "Chat" de app/producto/[id].tsx), cada solicitud de "Vender ahora"
 * que se abrió sola con sesión iniciada (components/VenderAhoraModal.tsx,
 * get_or_create_sell_request_chat) y cualquier consulta general — ver
 * sql/product_chats.sql y components/ProductChatThread.tsx. No tiene nada
 * que ver con el Foro público: solo esa persona y los administradores ven
 * esos mensajes. Cada fila tiene su propio icono de papelera: borra la
 * conversación SOLO de esta bandeja (delete_chat_for_me); si el admin no la
 * ha borrado también, él la sigue viendo.
 *
 * Cómo funciona:
 * - Los mensajes viven en la tabla chat_messages de Supabase (ver
 *   sql/chat_messages.sql — hay que ejecutar ese archivo en el SQL Editor de
 *   Supabase antes de que esto funcione). Al entrar se cargan los últimos
 *   100 mensajes (fetchInitialMessages) y luego se escucha en tiempo real
 *   con supabase.channel(...).on("postgres_changes", { event: "INSERT" }, ...)
 *   para que los mensajes nuevos de cualquier usuario aparezcan al instante,
 *   sin recargar la página.
 * - Quién ha iniciado sesión se comprueba con supabase.auth.getSession() +
 *   onAuthStateChange(), igual que en app/admin/_layout.tsx. Si no hay
 *   sesión, tocar el cuadro de escribir o el botón de enviar abre
 *   AuthRequiredModal en vez de mandar el mensaje.
 * - handleSend() solo manda el texto (body) del mensaje: quién lo envía
 *   (user_id, username, display_name, role) lo rellena automáticamente un
 *   trigger en la base de datos a partir de la sesión real (auth.uid()) y
 *   del perfil, así nadie puede hacerse pasar por otra persona escribiendo
 *   datos falsos desde el propio navegador.
 * - "Noticias Gaming" (NoticiasGamingPanel, al final del archivo) lee la
 *   tabla noticias_gaming y, en segundo plano, llama a api/noticias-gaming.ts
 *   para que busque y resuma noticias nuevas si toca. Cada tarjeta muestra un
 *   carrusel de imágenes sin recortes (CarruselNoticia, pasa solo cada 5 s),
 *   el resumen completo y los botones Ver más / Like / Comentarios /
 *   Compartir. Los comentarios viven en noticias_comentarios; "Compartir en
 *   el Foro" publica un mensaje con la marca [noticia:<id>], que el Foro pinta
 *   como mini tarjeta (TarjetaNoticiaForo). Es la pestaña por defecto.
 *   Fotos rápidas (FotoNoticia): las del bucket «noticias» se piden en web a
 *   la optimización de Vercel (/_vercel/image, vercel.json → "images") con el
 *   ancho justo; el hueco se reserva con imagenes_meta (sin descargar antes la
 *   foto) y se ve un brillo suave mientras carga. En el carrusel solo se
 *   descarga la primera; las demás, al llegar a ellas (la siguiente se precarga
 *   justo antes de pasar).
 * - Campana de Noticias Gaming (AvisosNoticiasModal): avisos de noticias
 *   nuevas para Blue y consentimiento comercial, en preferencias_usuario (con
 *   sesión) o en el dispositivo (AsyncStorage) sin ella. Al ver la pestaña se
 *   guarda "noticias vistas hasta" (ver NOTICIAS_VISTAS_KEY).
 * - Novedades y Torneos todavía no tienen contenido real: muestran solo un
 *   mensaje centrado "PRÓXIMAMENTE" (ComingSoonPanel).
 * - El contador "X viendo ahora" de la cabecera es real: cada persona que
 *   tiene esta pantalla abierta (con sesión o sin ella) se cuenta con
 *   Supabase Realtime Presence (canal "chat_global_presence",
 *   channel.track(...) + presenceState()) — no hace falta ninguna tabla ni
 *   política RLS extra para esto, es solo por socket. El listado de
 *   "quién está conectado" que se despliega al tocarlo sigue siendo de
 *   ejemplo (array `viewers` fijo en este archivo).
 * - El botón de enviar solo se activa a partir de 4 caracteres escritos, y
 *   hace un pequeño "pop" al pulsarlo y otro más marcado (con un check)
 *   justo al enviarse, estilo WhatsApp.
 * - Rendimiento: MessageBubble está envuelto en React.memo para que escribir
 *   en el compositor no vuelva a pintar los ~100 mensajes del historial en
 *   cada tecla. Para que el memo funcione de verdad, onReact/onReply se le
 *   pasan tal cual (handleReact/handleReply, ya memorizadas con useCallback)
 *   en vez de envolverlas en una función nueva por mensaje en cada render.
 *   Los canales Realtime (mensajes, reacciones y presencia) solo están
 *   abiertos mientras la pestaña está enfocada (useFocusEffect).
 *
 * Conectado con:
 * - lib/supabase.ts → sesión, lectura y envío de mensajes.
 * - sql/chat_messages.sql → crea la tabla, el trigger que rellena el
 *   remitente y las políticas RLS (leer: todo el mundo; escribir: solo
 *   sesión iniciada) del Foro público.
 * - sql/product_chats.sql, components/ProductChatThread.tsx → la pestaña
 *   "Chat" (bandeja privada por producto).
 * - app/chat/[chatId].tsx → a donde lleva cada conversación de la bandeja.
 * - app/(tabs)/perfil.tsx (el modal de "inicia sesión" navega ahí; también
 *   es donde se registran full_name/username que el trigger usa para
 *   mostrar el nombre de cada mensaje).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  LayoutAnimation,
  Modal,
  PixelRatio,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar,
  Switch,
  Text,
  TextInput,
  UIManager,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import CargaMarca from "../../components/marca/CargaMarca";
import MarcaAnimada from "../../components/marca/MarcaAnimada";
import { markEnd, markStart } from "../../lib/loadingBus";
import { supabase } from "../../lib/supabase";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const COLORS = {
  bg: "#FFFFFF",
  bg3: "#F6FAFD",
  card: "#EAF6FD",
  border: "#E3EAF2",
  borderSoft: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  soft: "rgba(11,33,56,0.48)",
  accent: "#1EA7E8",
  accentSoft: "#EAF6FD",
  accentBorder: "#BEE6FA",
  bubbleMine: "rgba(0,170,228,0.22)",
  bubbleOther: "#F1F6FA",
  overlay: "rgba(3,10,18,0.76)",
};

type MessageItem = {
  id: string;
  type: "message" | "gif" | "system";
  userId: string;
  // username se guarda (llega de la base de datos) pero ya NO se muestra en
  // el chat: es un dato privado del usuario, solo pensado para que un
  // administrador pueda identificarlo si hace falta moderar.
  username: string;
  displayName: string;
  role?: "viewer" | "member" | "vip" | "admin";
  time: string;
  text: string;
  replyToId: string | null;
};

type HubTab = "chat" | "news" | "novedades" | "torneos" | "privados";

// Las 5 pestañas del hub, en el orden en que aparecen en el menú
// desplegable "🔼" (antes iban en una barra fija arriba de los mensajes).
// "chat" (la clave interna no cambia para no tocar el resto del archivo) es
// ahora el "Foro" público; "privados" es la bandeja de conversaciones
// privadas por producto.
const TAB_ITEMS: { key: HubTab; label: string }[] = [
  { key: "chat", label: "Foro" },
  { key: "news", label: "Noticias Gaming" },
  { key: "novedades", label: "Nuestras Novedades" },
  { key: "torneos", label: "Torneos" },
  { key: "privados", label: "Chat" },
];

// Los 6 emojis de reacción disponibles (ver sql/chat_message_reactions.sql —
// el check constraint de la tabla solo admite estos mismos).
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;
type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

// Fila tal cual la devuelve la tabla chat_message_reactions.
type ReactionRow = {
  message_id: string;
  user_id: string;
  emoji: string;
};

// Fila tal cual la devuelve la tabla chat_messages (ver sql/chat_messages.sql).
// username, display_name y role los rellena SIEMPRE un trigger en la base de
// datos a partir de la sesión real — nunca vienen de lo que escriba aquí el
// cliente.
type ChatMessageRow = {
  id: string;
  created_at: string;
  user_id: string;
  username: string;
  display_name: string;
  role: string;
  body: string;
  reply_to_id: string | null;
};

function isMissingRelationError(error: unknown, relationName: string) {
  const msg = String((error as { message?: string } | null)?.message ?? "").toLowerCase();
  const rel = relationName.toLowerCase();

  return (
    msg.includes(rel) &&
    (msg.includes("does not exist") ||
      msg.includes("relation") ||
      msg.includes("could not find the table"))
  );
}

function formatMessageTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function rowToMessageItem(row: ChatMessageRow): MessageItem {
  return {
    id: row.id,
    type: "message",
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    role: row.role === "admin" ? "admin" : "member",
    time: formatMessageTime(row.created_at),
    text: row.body,
    replyToId: row.reply_to_id ?? null,
  };
}

async function fetchInitialMessages(): Promise<MessageItem[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id,created_at,user_id,username,display_name,role,body,reply_to_id")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    // Si todavía no se ha ejecutado sql/chat_messages.sql en Supabase, no
    // rompemos la pantalla: el chat simplemente se ve vacío.
    if (isMissingRelationError(error, "chat_messages")) return [];
    throw error;
  }

  const rows = Array.isArray(data) ? (data as unknown as ChatMessageRow[]) : [];
  return rows.slice().reverse().map(rowToMessageItem);
}

async function fetchReactionsForMessages(messageIds: string[]): Promise<ReactionRow[]> {
  if (!messageIds.length) return [];

  const { data, error } = await supabase
    .from("chat_message_reactions")
    .select("message_id,user_id,emoji")
    .in("message_id", messageIds);

  if (error) {
    // Si todavía no se ha ejecutado sql/chat_message_reactions.sql, el chat
    // sigue funcionando igual, simplemente sin reacciones.
    if (isMissingRelationError(error, "chat_message_reactions")) return [];
    throw error;
  }

  return Array.isArray(data) ? (data as unknown as ReactionRow[]) : [];
}

const HUB_TAB_VALUES: HubTab[] = ["chat", "news", "novedades", "torneos", "privados"];

// Marca de "ya lo he visto" para la pestaña Nuestras Novedades: mismo
// número que NOVEDADES_CONTENT_VERSION en components/Campanita.tsx. Cuando
// el contenido de esta pestaña cambie de verdad, se sube el número ahí Y
// aquí — así la campanita vuelve a avisar una vez a cada dispositivo que no
// haya vuelto a entrar desde entonces.
const NOVEDADES_SEEN_KEY = "videojuegoszaragoza:novedades_seen_version";
const NOVEDADES_CONTENT_VERSION = 1;

// Claves del dispositivo que también lee Blue para contar noticias nuevas.
const NOTICIAS_AVISOS_KEY = "videojuegoszaragoza:noticias_avisos";
const NOTICIAS_VISTAS_KEY = "videojuegoszaragoza:noticias_vistas_hasta";

// Marca que deja «Compartir en el Foro» dentro del mensaje: [noticia:<uuid>].
const MARCA_NOTICIA_RE =
  /\[noticia:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/i;

function idNoticiaDeTexto(texto: string): string | null {
  const m = MARCA_NOTICIA_RE.exec(texto ?? "");
  return m ? m[1].toLowerCase() : null;
}

// Texto del mensaje sin la marca (para citas y respuestas).
function textoSinMarca(texto: string): string {
  return (texto ?? "").replace(new RegExp(MARCA_NOTICIA_RE.source, "gi"), "").trim();
}

// Tabla aún no creada (migración pendiente): la función se oculta sin errores.
function faltaTabla(error: unknown, tabla: string) {
  const code = String((error as { code?: string } | null)?.code ?? "");
  return code === "PGRST205" || code === "42P01" || isMissingRelationError(error, tabla);
}

// Se ponen a false en cuanto se detecta que la tabla no existe.
let tablaComentariosDisponible = true;
let tablaPreferenciasDisponible = true;

// Mismo nombre visible que pone el trigger de chat_messages en el Foro:
// full_name → username → parte del email antes de la @.
function nombreVisibleForo(
  user: { email?: string | null; user_metadata?: Record<string, any> } | null | undefined
) {
  const meta = user?.user_metadata ?? {};
  const completo = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  const usuario = typeof meta.username === "string" ? meta.username.trim() : "";
  const correo = (user?.email ?? "").split("@")[0] ?? "";
  return (completo || usuario || correo || "usuario").slice(0, 60);
}

async function leerAvisosDispositivo(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(NOTICIAS_AVISOS_KEY)) === "1";
  } catch {
    return false;
  }
}

// Guarda (upsert) mi fila de preferencias_usuario. Devuelve si se guardó.
async function guardarPreferencias(userId: string, cambios: Record<string, unknown>) {
  if (!tablaPreferenciasDisponible) return false;
  const { error } = await supabase
    .from("preferencias_usuario")
    .upsert(
      { user_id: userId, ...cambios, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  if (error) {
    if (faltaTabla(error, "preferencias_usuario")) tablaPreferenciasDisponible = false;
    return false;
  }
  return true;
}

export default function ChatGlobalScreen() {
  // Permite llegar directamente a una pestaña concreta, p. ej. desde la
  // campanita (components/Campanita.tsx) con /chat-global?tab=privados, o a
  // una noticia concreta con ?noticia=<id>. Sin ?tab, se abre Noticias Gaming.
  const params = useLocalSearchParams<{ tab?: string; noticia?: string }>();
  const tabParam = typeof params.tab === "string" ? params.tab : "";
  const noticiaParam =
    typeof params.noticia === "string" && /^[0-9a-f-]{36}$/i.test(params.noticia)
      ? params.noticia.toLowerCase()
      : "";
  const initialTab: HubTab =
    !noticiaParam && HUB_TAB_VALUES.includes(tabParam as HubTab) ? (tabParam as HubTab) : "news";

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // Noticia que hay que abrir y a la que desplazarse (enlace o mini tarjeta del Foro).
  const [noticiaPedida, setNoticiaPedida] = useState<string | null>(noticiaParam || null);
  // Cabecera flotante (info, «viendo ahora», campana) fuera del Foro.
  const [cabeceraVisible, setCabeceraVisible] = useState(true);
  // Campana de Noticias Gaming.
  const [showAvisosModal, setShowAvisosModal] = useState(false);
  const [avisosNoticias, setAvisosNoticias] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [preferenciasEnNube, setPreferenciasEnNube] = useState(tablaPreferenciasDisponible);
  // Datos de las noticias compartidas en el Foro (null = no disponible).
  const [noticiasForo, setNoticiasForo] = useState<Record<string, NoticiaMini | null>>({});
  const [hasCompletedCommunityProfile] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [activeTab, setActiveTab] = useState<HubTab>(initialTab);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [reactionRows, setReactionRows] = useState<ReactionRow[]>([]);
  const [replyTarget, setReplyTarget] = useState<MessageItem | null>(null);
  const [tabsMenuOpen, setTabsMenuOpen] = useState(false);
  // Al leer historial hacia arriba se ocultan el compositor, el botón de
  // enviar, el de información y el de "viendo ahora"; al volver a bajar
  // reaparecen. showScrollToBottom es el "⬇️" que aparece cuando te alejas
  // bastante del final del chat.
  const [composerVisible, setComposerVisible] = useState(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  // Copias en ref de los dos estados anteriores para compararlos en handleScroll.
  const composerVisibleRef = useRef(true);
  const showScrollToBottomRef = useRef(false);
  useEffect(() => {
    composerVisibleRef.current = composerVisible;
  }, [composerVisible]);
  useEffect(() => {
    showScrollToBottomRef.current = showScrollToBottom;
  }, [showScrollToBottom]);

  const scrollRef = useRef<ScrollView | null>(null);
  const mountedRef = useRef(true);
  const justSentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabsMenuAnim = useRef(new Animated.Value(0)).current;
  const uiVisibleAnim = useRef(new Animated.Value(1)).current;
  const lastScrollYRef = useRef(0);
  const isNearBottomRef = useRef(true);
  const hasScrolledInitialRef = useRef(false);
  const hasLoadedMessagesRef = useRef(false);
  const activeTabRef = useRef<HubTab>(initialTab);
  const cabeceraVisibleRef = useRef(true);
  // Desplazamiento acumulado en la misma dirección (para no ocultar por un tirón).
  const recorridoRef = useRef(0);
  // Posición de la columna de contenido dentro del ScrollView.
  const columnaYRef = useRef(0);
  const noticiasForoPedidasRef = useRef<Set<string>>(new Set());
  const cabeceraAnim = useRef(new Animated.Value(1)).current;

  const isLoggedIn = !!currentUserId;

  const canViewMedia = isLoggedIn && hasCompletedCommunityProfile;
  const trimmedDraftLength = draft.trim().length;
  // El botón de enviar solo se activa a partir de 4 caracteres. Si no hay
  // sesión lo dejamos siempre "activo" para que al pulsarlo se abra el aviso
  // de inicio de sesión en vez de quedarse mudo.
  const canSend = isLoggedIn ? trimmedDraftLength > 3 : true;

  const visibleMessages = useMemo(
    () => messages.filter((message) => message.type !== "system"),
    [messages]
  );

  // Agrupa las filas sueltas de chat_message_reactions en: cuántas veces
  // tiene cada mensaje cada emoji, y con cuál ha reaccionado YO (para
  // resaltarlo en el selector y poder "desmarcarlo" al volver a tocarlo).
  const { reactionCountsByMessage, myReactionByMessage } = useMemo(() => {
    const counts: Record<string, Partial<Record<string, number>>> = {};
    const mine: Record<string, string> = {};

    for (const row of reactionRows) {
      if (!counts[row.message_id]) counts[row.message_id] = {};
      const bucket = counts[row.message_id]!;
      bucket[row.emoji] = (bucket[row.emoji] ?? 0) + 1;

      if (currentUserId && row.user_id === currentUserId) {
        mine[row.message_id] = row.emoji;
      }
    }

    return { reactionCountsByMessage: counts, myReactionByMessage: mine };
  }, [reactionRows, currentUserId]);

  const toggleViewers = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowViewers((prev) => !prev);
  };

  // Sesión real: quién ha iniciado sesión ahora mismo (mismo patrón que
  // app/admin/_layout.tsx: getSession() al entrar + onAuthStateChange() para
  // reaccionar si el usuario inicia/cierra sesión mientras está en el chat).
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setCurrentUserId(session?.user?.id ?? null);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setCurrentUserId(session?.user?.id ?? null);
    });

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe?.();
    };
  }, []);

  // Si la URL cambia con la pantalla ya abierta (?tab=… o ?noticia=…), se obedece.
  useEffect(() => {
    if (noticiaParam) {
      setActiveTab("news");
      setNoticiaPedida(noticiaParam);
    } else if (HUB_TAB_VALUES.includes(tabParam as HubTab)) {
      setActiveTab(tabParam as HubTab);
    }
  }, [tabParam, noticiaParam]);

  // Preferencias de la campana: con sesión, de preferencias_usuario; sin
  // sesión (o sin la tabla), del dispositivo.
  useEffect(() => {
    let vivo = true;

    (async () => {
      const local = await leerAvisosDispositivo();
      if (!vivo) return;

      if (!tablaPreferenciasDisponible) {
        setPreferenciasEnNube(false);
        setAvisosNoticias(local);
        setMarketing(false);
        return;
      }

      if (!currentUserId) {
        setAvisosNoticias(local);
        setMarketing(false);
        // Sin sesión solo se comprueba que la tabla exista (RLS devuelve vacío).
        const { error } = await supabase.from("preferencias_usuario").select("user_id").limit(1);
        if (vivo && error && faltaTabla(error, "preferencias_usuario")) {
          tablaPreferenciasDisponible = false;
          setPreferenciasEnNube(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("preferencias_usuario")
        .select("avisos_noticias,marketing")
        .eq("user_id", currentUserId)
        .maybeSingle();
      if (!vivo) return;

      if (error) {
        if (faltaTabla(error, "preferencias_usuario")) {
          tablaPreferenciasDisponible = false;
          setPreferenciasEnNube(false);
        }
        setAvisosNoticias(local);
        return;
      }

      setPreferenciasEnNube(true);
      if (data) {
        const fila = data as { avisos_noticias?: boolean; marketing?: boolean };
        setAvisosNoticias(!!fila.avisos_noticias);
        setMarketing(!!fila.marketing);
        // Copia en el dispositivo para que Blue la tenga a mano.
        AsyncStorage.setItem(NOTICIAS_AVISOS_KEY, fila.avisos_noticias ? "1" : "0").catch(() => {});
      } else {
        // Primera vez con sesión: se sube lo que se eligió en el dispositivo.
        setAvisosNoticias(local);
        setMarketing(false);
        if (local) guardarPreferencias(currentUserId, { avisos_noticias: true });
      }
    })();

    return () => {
      vivo = false;
    };
  }, [currentUserId]);

  // Mini tarjetas del Foro: carga los datos de las noticias citadas con
  // [noticia:<id>] que aún no se tengan.
  useEffect(() => {
    const pedidas = noticiasForoPedidasRef.current;
    const nuevas = new Set<string>();
    for (const m of messages) {
      const id = idNoticiaDeTexto(m.text);
      if (id && !pedidas.has(id)) nuevas.add(id);
    }
    if (!nuevas.size) return;

    const ids = Array.from(nuevas);
    ids.forEach((id) => pedidas.add(id));
    leerNoticiasMini(ids).then((mapa) => {
      if (!mountedRef.current) return;
      if (!mapa) {
        // Fallo de red: se reintentará con el siguiente mensaje.
        ids.forEach((id) => pedidas.delete(id));
        return;
      }
      setNoticiasForo((prev) => {
        const next = { ...prev };
        for (const id of ids) if (!next[id]) next[id] = mapa[id] ?? null;
        return next;
      });
    });
  }, [messages]);

  // Al cambiar de pestaña: cabecera visible y, fuera del Foro, arriba del todo.
  useEffect(() => {
    activeTabRef.current = activeTab;
    recorridoRef.current = 0;
    cabeceraVisibleRef.current = true;
    setCabeceraVisible(true);
    if (activeTab !== "chat") {
      composerVisibleRef.current = true;
      setComposerVisible(true);
      showScrollToBottomRef.current = false;
      setShowScrollToBottom(false);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [activeTab]);

  // Mensajes reales: carga los últimos 100 al entrar (y sus reacciones) y
  // luego escucha en directo los mensajes y reacciones nuevos de cualquier
  // usuario (tiempo real).
  //
  // Rendimiento: los canales en tiempo real solo están abiertos mientras esta
  // pestaña está enfocada (useFocusEffect). Al irse a otra pantalla se cierran
  // con supabase.removeChannel (no gastan datos ni batería) y al volver se
  // reabren y se recargan los mensajes en silencio, para no perder los que
  // llegaron mientras tanto.
  useFocusEffect(
    useCallback(() => {
      let active = true;

      (async () => {
        setLoadError(null);
        // El indicador de carga solo se muestra la primera vez; al volver a
        // la pestaña se refresca sin vaciar la lista.
        if (!hasLoadedMessagesRef.current) setLoadingMessages(true);

        try {
          const initial = await fetchInitialMessages();
          if (!active) return;
          setMessages(initial);
          hasLoadedMessagesRef.current = true;

          const initialReactions = await fetchReactionsForMessages(initial.map((m) => m.id));
          if (active) setReactionRows(initialReactions);
        } catch (e: any) {
          console.error("Error cargando el chat:", e);
          if (active) setLoadError("No se pudo cargar el chat. Inténtalo de nuevo.");
        } finally {
          if (active) setLoadingMessages(false);
        }
      })();

      const channel = supabase
        .channel("chat_messages_live")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "chat_messages" },
          (payload) => {
            if (!active) return;
            const row = payload.new as unknown as ChatMessageRow;
            setMessages((prev) => {
              if (prev.some((m) => m.id === row.id)) return prev;
              return [...prev, rowToMessageItem(row)];
            });
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "chat_message_reactions" },
          (payload) => {
            if (!active) return;
            if (payload.eventType === "DELETE") {
              const old = payload.old as Partial<ReactionRow>;
              setReactionRows((prev) =>
                prev.filter(
                  (r) => !(r.message_id === old.message_id && r.user_id === old.user_id)
                )
              );
              return;
            }

            const row = payload.new as unknown as ReactionRow;
            setReactionRows((prev) => {
              const withoutOld = prev.filter(
                (r) => !(r.message_id === row.message_id && r.user_id === row.user_id)
              );
              return [...withoutOld, row];
            });
          }
        )
        .subscribe();

      return () => {
        active = false;
        supabase.removeChannel(channel);
      };
    }, [])
  );

  // Cuando llega un mensaje nuevo (o se entra en la pestaña Chat), baja la
  // pantalla para que se vea el mensaje más reciente — pero solo si ya
  // estabas cerca del final. Si has subido a leer historial, un mensaje
  // nuevo de otra persona ya no te arrastra hacia abajo (isNearBottomRef,
  // que actualiza handleScroll); enviar tú un mensaje sí fuerza el salto
  // (handleSend pone isNearBottomRef a true antes de que llegue por Realtime).
  useEffect(() => {
    if (activeTab !== "chat") return;
    const isInitialLoad = !hasScrolledInitialRef.current;
    if (!isInitialLoad && !isNearBottomRef.current) return;
    const id = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: !isInitialLoad });
      hasScrolledInitialRef.current = true;
    }, 60);
    return () => clearTimeout(id);
  }, [messages.length, activeTab]);

  // Contador real de "viendo ahora": Supabase Realtime Presence cuenta a
  // cualquiera que tenga esta pantalla abierta ahora mismo (con sesión o
  // sin ella), sin tocar ninguna tabla — es solo por socket. Igual que los
  // mensajes, el canal solo está abierto mientras la pestaña está enfocada.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const channel = supabase.channel("chat_global_presence");

      channel
        .on("presence", { event: "sync" }, () => {
          if (!active) return;
          const state = channel.presenceState();
          setViewerCount(Object.keys(state).length);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && active) {
            await channel.track({ online_at: new Date().toISOString() });
          }
        });

      return () => {
        active = false;
        supabase.removeChannel(channel);
      };
    }, [])
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (justSentTimeoutRef.current) clearTimeout(justSentTimeoutRef.current);
    };
  }, []);

  // Al entrar en Nuestras Novedades se guarda la versión actual del
  // contenido como "vista" — así la campanita (components/Campanita.tsx)
  // deja de avisar de esta pestaña hasta que el contenido cambie de verdad.
  useEffect(() => {
    if (activeTab !== "novedades") return;
    AsyncStorage.setItem(NOVEDADES_SEEN_KEY, String(NOVEDADES_CONTENT_VERSION)).catch(() => {});
  }, [activeTab]);

  // Animación del menú de pestañas: sube con un fundido cuando se abre,
  // baja con un fundido cuando se cierra.
  useEffect(() => {
    Animated.timing(tabsMenuAnim, {
      toValue: tabsMenuOpen ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [tabsMenuOpen, tabsMenuAnim]);

  // Compositor, botón de enviar, info y "viendo ahora" se ocultan/reaparecen
  // con un fundido + pequeño desplazamiento — igual de "natural" que el
  // menú de pestañas de arriba.
  useEffect(() => {
    Animated.timing(uiVisibleAnim, {
      toValue: composerVisible ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
    // Si el compositor se oculta mientras el menú de pestañas está abierto,
    // ciérralo también: no tiene sentido dejar el desplegable flotando sin
    // el botón que lo abrió.
    if (!composerVisible) setTabsMenuOpen(false);
  }, [composerVisible, uiVisibleAnim]);

  // Cabecera flotante: en el Foro va con el compositor; en las demás
  // pestañas se oculta al bajar y vuelve al subir un poco (como las apps de
  // noticias), con un fundido suave.
  const cabeceraMostrada = activeTab === "chat" ? composerVisible : cabeceraVisible;
  useEffect(() => {
    Animated.timing(cabeceraAnim, {
      toValue: cabeceraMostrada ? 1 : 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [cabeceraMostrada, cabeceraAnim]);

  // Detecta hacia dónde se desplaza el chat: subir (leer historial) oculta
  // la interfaz de escritura; bajar (volver a lo reciente), o estar ya
  // cerca del final, la vuelve a mostrar. También decide cuándo mostrar el
  // botón "⬇️" de volver al último mensaje.
  const handleScroll = useCallback((e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const y = contentOffset.y as number;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - y;
    const nearBottom = distanceFromBottom < 80;

    isNearBottomRef.current = nearBottom;

    const delta = y - lastScrollYRef.current;
    lastScrollYRef.current = y;

    // Fuera del Foro: bajar oculta la cabecera; subir ~24 px (o estar arriba) la muestra.
    if (activeTabRef.current !== "chat") {
      const mismoSentido = Math.sign(delta) === Math.sign(recorridoRef.current);
      recorridoRef.current = mismoSentido ? recorridoRef.current + delta : delta;
      let nextCabecera = cabeceraVisibleRef.current;
      if (y < 40) nextCabecera = true;
      else if (recorridoRef.current > 24) nextCabecera = false;
      else if (recorridoRef.current < -24) nextCabecera = true;
      if (nextCabecera !== cabeceraVisibleRef.current) {
        cabeceraVisibleRef.current = nextCabecera;
        setCabeceraVisible(nextCabecera);
      }
      return;
    }

    // Solo se toca el estado cuando cambia de verdad (no en cada evento de scroll),
    // para que el desplazamiento no vaya a tirones.
    let nextComposer = composerVisibleRef.current;
    if (nearBottom || delta > 6) nextComposer = true;
    else if (delta < -6) nextComposer = false;
    if (nextComposer !== composerVisibleRef.current) {
      composerVisibleRef.current = nextComposer;
      setComposerVisible(nextComposer);
    }

    const nextShowBottom = distanceFromBottom > 400;
    if (nextShowBottom !== showScrollToBottomRef.current) {
      showScrollToBottomRef.current = nextShowBottom;
      setShowScrollToBottom(nextShowBottom);
    }
  }, []);

  const handleScrollToLatest = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
    setShowScrollToBottom(false);
    setComposerVisible(true);
  }, []);

  const handleSelectTab = useCallback((tab: HubTab) => {
    setActiveTab(tab);
    setTabsMenuOpen(false);
  }, []);

  const handleComposerPress = () => {
    if (!isLoggedIn) {
      setShowAuthModal(true);
      return;
    }
  };

  const handleSend = useCallback(async () => {
    if (!isLoggedIn) {
      setShowAuthModal(true);
      return;
    }

    const clean = draft.trim();
    // El botón ya está desactivado por debajo de 4 caracteres, pero lo
    // comprobamos también aquí por si se llama a mano (p. ej. desde el
    // teclado).
    if (clean.length <= 3) return;

    if (clean.length > 500) {
      setSendError("El mensaje es demasiado largo (máximo 500 caracteres).");
      return;
    }

    setSendError(null);
    setSending(true);

    try {
      // Solo mandamos el texto (y, si se está respondiendo a algo, a qué
      // mensaje): quién lo escribe lo pone la base de datos (ver el trigger
      // en sql/chat_messages.sql), no el cliente.
      const { error } = await supabase.from("chat_messages").insert({
        body: clean,
        reply_to_id: replyTarget?.id ?? null,
      });
      if (error) throw error;

      if (!mountedRef.current) return;
      setDraft("");
      setReplyTarget(null);

      // Enviar tu propio mensaje siempre te lleva al final, aunque hubieras
      // subido a leer historial: fuerza isNearBottomRef antes de que el
      // mensaje llegue por Realtime, así el efecto de auto-scroll no lo ignora.
      isNearBottomRef.current = true;
      setComposerVisible(true);

      // Pequeño "enviado ✓" en el botón, estilo WhatsApp, que se apaga solo.
      setJustSent(true);
      if (justSentTimeoutRef.current) clearTimeout(justSentTimeoutRef.current);
      justSentTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) setJustSent(false);
      }, 900);
    } catch (e: any) {
      console.error("Error enviando mensaje al chat:", e);
      if (mountedRef.current) setSendError("No se pudo enviar el mensaje. Inténtalo de nuevo.");
    } finally {
      if (mountedRef.current) setSending(false);
    }
  }, [draft, isLoggedIn, replyTarget]);

  // Un toque en un mensaje = abrir el selector de reacciones para ESE
  // mensaje (ver MessageBubble); tocar un emoji del selector llama aquí.
  // Repetir el mismo emoji quita la reacción; tocar uno distinto la cambia.
  const handleReact = useCallback(
    async (messageId: string, emoji: ReactionEmoji) => {
      if (!isLoggedIn || !currentUserId) {
        setShowAuthModal(true);
        return;
      }

      const current = myReactionByMessage[messageId];

      try {
        if (current === emoji) {
          const { error } = await supabase
            .from("chat_message_reactions")
            .delete()
            .eq("message_id", messageId)
            .eq("user_id", currentUserId);
          if (error) throw error;
        } else if (current) {
          const { error } = await supabase
            .from("chat_message_reactions")
            .update({ emoji })
            .eq("message_id", messageId)
            .eq("user_id", currentUserId);
          if (error) throw error;
        } else {
          // user_id lo rellena el trigger (ver sql/chat_message_reactions.sql).
          const { error } = await supabase
            .from("chat_message_reactions")
            .insert({ message_id: messageId, emoji });
          if (error) throw error;
        }
      } catch (e: any) {
        console.error("Error al reaccionar al mensaje:", e);
      }
    },
    [isLoggedIn, currentUserId, myReactionByMessage]
  );

  // Doble toque en un mensaje = responder: deja el mensaje citado listo en
  // el cuadro de escribir.
  const handleReply = useCallback(
    (item: MessageItem) => {
      if (!isLoggedIn) {
        setShowAuthModal(true);
        return;
      }
      setReplyTarget(item);
    },
    [isLoggedIn]
  );

  // «Compartir en el Foro»: publica «📰 título + [noticia:id]» como un
  // mensaje normal del Foro (el remitente lo pone el trigger) y abre el Foro.
  const handleCompartirEnForo = useCallback(
    async (n: Noticia): Promise<boolean> => {
      if (!isLoggedIn) {
        setShowAuthModal(true);
        return false;
      }

      const body = `📰 ${n.titulo.trim().slice(0, 400)}\n[noticia:${n.id}]`;
      const { data, error } = await supabase
        .from("chat_messages")
        .insert({ body })
        .select("id,created_at,user_id,username,display_name,role,body,reply_to_id")
        .single();
      if (error) {
        console.error("Error compartiendo la noticia en el Foro:", error);
        return false;
      }
      if (!mountedRef.current) return true;

      const id = n.id.toLowerCase();
      noticiasForoPedidasRef.current.add(id);
      setNoticiasForo((prev) => ({
        ...prev,
        [id]: { id: n.id, titulo: n.titulo, categoria: n.categoria, imagen: n.imagenes[0] ?? null },
      }));
      if (data) {
        const row = data as unknown as ChatMessageRow;
        setMessages((prev) =>
          prev.some((m) => m.id === row.id) ? prev : [...prev, rowToMessageItem(row)]
        );
      }
      isNearBottomRef.current = true;
      setActiveTab("chat");
      return true;
    },
    [isLoggedIn]
  );

  // «Leer noticia» desde la mini tarjeta del Foro.
  const handleAbrirNoticia = useCallback((id: string) => {
    setNoticiaPedida(id);
    setActiveTab("news");
  }, []);

  const handleNoticiaAtendida = useCallback(() => setNoticiaPedida(null), []);

  // y = posición de la tarjeta dentro del panel de noticias.
  const handleDesplazarA = useCallback((y: number) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, columnaYRef.current + y - 16), animated: true });
  }, []);

  // Interruptor de avisos: siempre en el dispositivo y, con sesión, en la nube.
  const cambiarAvisos = useCallback(
    async (valor: boolean) => {
      setAvisosNoticias(valor);
      AsyncStorage.setItem(NOTICIAS_AVISOS_KEY, valor ? "1" : "0").catch(() => {});
      if (!currentUserId || !tablaPreferenciasDisponible) return true;

      const ok = await guardarPreferencias(currentUserId, { avisos_noticias: valor });
      if (!mountedRef.current) return ok;
      if (!tablaPreferenciasDisponible) {
        // Sin la tabla se queda guardado solo en el dispositivo.
        setPreferenciasEnNube(false);
        return true;
      }
      if (!ok) {
        setAvisosNoticias(!valor);
        AsyncStorage.setItem(NOTICIAS_AVISOS_KEY, valor ? "0" : "1").catch(() => {});
      }
      return ok;
    },
    [currentUserId]
  );

  // Consentimiento comercial: solo con sesión, con la fecha del cambio.
  const cambiarMarketing = useCallback(
    async (valor: boolean) => {
      if (!currentUserId) return false;
      setMarketing(valor);
      const ok = await guardarPreferencias(currentUserId, {
        marketing: valor,
        marketing_actualizado: new Date().toISOString(),
      });
      if (!ok && mountedRef.current) {
        setMarketing(!valor);
        if (!tablaPreferenciasDisponible) setPreferenciasEnNube(false);
      }
      return ok;
    },
    [currentUserId]
  );

  const handleGoPerfil = () => {
    router.push("/perfil" as Href);
  };

  const renderActiveTabContent = () => {
    if (activeTab === "news") {
      return (
        <NoticiasGamingPanel
          userId={currentUserId}
          noticiaPedida={noticiaPedida}
          onNoticiaAtendida={handleNoticiaAtendida}
          onDesplazarA={handleDesplazarA}
          onCompartirEnForo={handleCompartirEnForo}
        />
      );
    }

    if (activeTab === "novedades" || activeTab === "torneos") {
      return <ComingSoonPanel />;
    }

    if (activeTab === "privados") {
      return (
        <PrivateChatsInbox
          isLoggedIn={isLoggedIn}
          onLoginPress={() => setShowAuthModal(true)}
        />
      );
    }

    return (
      <View style={{ gap: 8 }}>
        {/* Solo el dato real (Supabase Presence), sin caja alrededor. */}
        {showViewers ? (
          <Text style={{ color: COLORS.muted, lineHeight: 21, textAlign: "center" }}>
            {viewerCount === 1
              ? "Ahora mismo hay 1 persona en el chat."
              : `Ahora mismo hay ${viewerCount} personas en el chat.`}
          </Text>
        ) : null}

        {!!loadError && (
          <View style={{ alignItems: "center", gap: 4 }}>
            <Text style={{ color: "#B91C1C", fontWeight: "900", textAlign: "center" }}>
              Atención
            </Text>
            <Text style={{ color: "#7A271A", textAlign: "center" }}>{loadError}</Text>
          </View>
        )}

        {loadingMessages ? (
          <View style={{ paddingVertical: 28, alignItems: "center", gap: 10 }}>
            <ActivityIndicator />
            <Text style={{ color: COLORS.muted }}>Cargando el chat…</Text>
          </View>
        ) : visibleMessages.length === 0 ? (
          <View style={{ paddingVertical: 20, alignItems: "center", gap: 6 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>
              Todavía no hay mensajes
            </Text>
            <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 21 }}>
              Sé el primero en escribir algo en el Chat Global.
            </Text>
          </View>
        ) : (
          <View
            style={{
              gap: 10,
            }}
          >
            {visibleMessages.map((message, index) => {
              const prev = visibleMessages[index - 1];
              const grouped =
                !!prev &&
                prev.type === "message" &&
                message.type === "message" &&
                prev.userId === message.userId;

              const replyPreview = message.replyToId
                ? messages.find((m) => m.id === message.replyToId) ?? null
                : null;
              const noticiaId = idNoticiaDeTexto(message.text);

              return (
                <MessageBubble
                  key={message.id}
                  item={message}
                  noticiaId={noticiaId}
                  noticiaCompartida={noticiaId ? noticiasForo[noticiaId] : undefined}
                  onAbrirNoticia={handleAbrirNoticia}
                  canViewMedia={canViewMedia}
                  grouped={grouped}
                  mine={message.userId === currentUserId}
                  isLoggedIn={isLoggedIn}
                  replyPreview={replyPreview}
                  hasReply={!!message.replyToId}
                  reactionCounts={reactionCountsByMessage[message.id]}
                  myReaction={myReactionByMessage[message.id]}
                  // onReact/onReply pasan las funciones YA memorizadas
                  // (handleReact/handleReply, con useCallback) tal cual, en
                  // vez de envolverlas aquí en una función nueva por mensaje
                  // en cada render — eso es lo que permite que
                  // React.memo(MessageBubble) funcione de verdad (ver más
                  // abajo): si la propiedad cambiara de referencia en cada
                  // render, memo nunca podría evitar el repintado.
                  onReact={handleReact}
                  onReply={handleReply}
                />
              );
            })}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <LinearGradient
          colors={["rgba(30,167,232,0.14)", "rgba(0,170,228,0.08)", "rgba(255,255,255,0)"]}
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
            paddingTop: 58,
            paddingBottom: 130,
            alignItems: "center",
          }}
        >
          {/* Columna centrada: no se pega a la izquierda en pantallas anchas */}
          <View
            style={{ width: "100%", maxWidth: 1040, gap: 16 }}
            onLayout={(e) => {
              columnaYRef.current = e.nativeEvent.layout.y;
            }}
          >
          {/*
            Las 4 pestañas (Chat Global, Noticias, Novedades, Torneos) ya no
            están fijas aquí arriba: ahora viven en el menú desplegable "🔼"
            justo encima del botón de enviar mensaje (ver BottomBar), para
            dejarle todo este espacio a los mensajes, que es lo importante.
          */}

          {renderActiveTabContent()}
          </View>
        </ScrollView>

        {/*
          Fondo atenuado detrás del menú de pestañas: al desplegarlo, todo
          lo demás (los mensajes) se oscurece un poco para que el foco quede
          en lo que se acaba de pulsar. Tocar fuera también cierra el menú.
        */}
        <Animated.View
          pointerEvents={tabsMenuOpen ? "auto" : "none"}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "#030A12",
            opacity: tabsMenuAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.35],
            }),
          }}
        >
          <Pressable style={{ flex: 1 }} onPress={() => setTabsMenuOpen(false)} />
        </Animated.View>

        {/*
          Antes había aquí una tarjeta grande con el título "Chat Global" y
          el párrafo de bienvenida ocupando espacio siempre. Ahora esa
          información vive en InfoModal (el "Pop" centrado) y aquí solo queda
          una barra estrecha con el icono de información y el contador real
          de "viendo ahora" — flotando arriba, centrada, y se oculta junto
          con el compositor al leer historial hacia arriba (mismo uiVisibleAnim).
        */}
        <Animated.View
          pointerEvents={cabeceraMostrada ? "box-none" : "none"}
          style={{
            position: "absolute",
            top: 14,
            left: 16,
            right: 16,
            alignItems: "center",
            opacity: cabeceraAnim,
            transform: [
              {
                translateY: cabeceraAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-18, 0],
                }),
              },
            ],
          }}
        >
          {/* Mismo ancho que las tarjetas de noticias: la campana queda en su esquina derecha. */}
          <View
            pointerEvents="box-none"
            style={{
              width: "100%",
              maxWidth: 680,
              minHeight: 30,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {/* Solo el icono, sin burbuja alrededor. */}
            <Pressable
              onPress={() => setShowInfoModal(true)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Información del Foro"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Ionicons name="information-circle-outline" size={20} color={COLORS.accent} />
            </Pressable>

            <Pressable
              onPress={toggleViewers}
              style={({ pressed }) => ({
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <Text
                style={{
                  color: "#15803D",
                  fontWeight: "900",
                  fontSize: 11,
                  lineHeight: 14,
                  textAlign: "center",
                }}
              >
                {`${viewerCount} viendo ahora ${showViewers ? "▲" : "▼"}`}
              </Text>
            </Pressable>

            {activeTab === "news" ? (
              <Pressable
                onPress={() => setShowAvisosModal(true)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={
                  avisosNoticias ? "Avisos de noticias activados" : "Activar avisos de noticias"
                }
                style={({ pressed }) => ({
                  position: "absolute",
                  right: 0,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Ionicons
                  name={avisosNoticias ? "notifications" : "notifications-outline"}
                  size={22}
                  color={COLORS.accent}
                />
              </Pressable>
            ) : null}
          </View>
        </Animated.View>

        {/*
          "⬇️" para volver al último mensaje: aparece cuando te alejas
          bastante del final del chat (ver handleScroll), independiente de si
          el compositor está oculto o no — siempre visible mientras haga
          falta, con su propio fundido de entrada/salida.
        */}
        {showScrollToBottom && (
          <Pressable
            onPress={handleScrollToLatest}
            style={({ pressed }) => ({
              position: "absolute",
              // A la izquierda: a la derecha está ahora el selector de pestañas.
              left: 16,
              bottom: 118,
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

        <BottomBar
          isChatTab={activeTab === "chat"}
          value={draft}
          onChangeText={setDraft}
          onPressInput={handleComposerPress}
          onPressSend={handleSend}
          isLoggedIn={isLoggedIn}
          sending={sending}
          justSent={justSent}
          canSend={canSend}
          errorText={sendError}
          replyTarget={replyTarget}
          onCancelReply={() => setReplyTarget(null)}
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          tabsMenuOpen={tabsMenuOpen}
          onToggleTabsMenu={() => setTabsMenuOpen((prev) => !prev)}
          tabsMenuAnim={tabsMenuAnim}
          visible={composerVisible}
          visibleAnim={uiVisibleAnim}
        />

        <AuthRequiredModal
          visible={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onLogin={() => {
            setShowAuthModal(false);
            handleGoPerfil();
          }}
          onRegister={() => {
            setShowAuthModal(false);
            handleGoPerfil();
          }}
        />

        <InfoModal visible={showInfoModal} onClose={() => setShowInfoModal(false)} />

        <AvisosNoticiasModal
          visible={showAvisosModal}
          onClose={() => setShowAvisosModal(false)}
          isLoggedIn={isLoggedIn}
          avisos={avisosNoticias}
          marketing={marketing}
          marketingDisponible={preferenciasEnNube}
          onCambiarAvisos={cambiarAvisos}
          onCambiarMarketing={cambiarMarketing}
        />
      </View>
    </SafeAreaView>
  );
}

function Tag({
  text,
  tone = "neutral",
}: {
  text: string;
  tone?: "neutral" | "success" | "warn" | "danger";
}) {
  // Solo texto de color, sin pastilla alrededor.
  const color = {
    neutral: "#0B2138",
    success: "#15803D",
    warn: "#92660B",
    danger: "#B91C1C",
  }[tone];

  return (
    <Text style={{ color, fontWeight: "900", fontSize: 12, textAlign: "center" }}>{text}</Text>
  );
}

function ActionButton({
  label,
  onPress,
  primary,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.92 : 1,
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 14,
        backgroundColor: primary ? COLORS.accent : "#F6FAFD",
        borderWidth: 1,
        borderColor: primary ? COLORS.accent : "#E3EAF2",
        alignItems: "center",
        justifyContent: "center",
      })}
    >
      <Text
        style={{ color: primary ? "#FFFFFF" : COLORS.text, fontWeight: "900", textAlign: "center" }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function HubTabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.92 : 1,
        borderRadius: 999,
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: active ? COLORS.accentSoft : "#F6FAFD",
        borderWidth: 1,
        borderColor: active ? COLORS.accentBorder : "#E3EAF2",
        shadowColor: active ? COLORS.accent : "transparent",
        shadowOpacity: active ? 0.18 : 0,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 0 },
        alignItems: "center",
      })}
    >
      <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>{label}</Text>
    </Pressable>
  );
}

function AvatarCircle({
  username,
  size = 42,
}: {
  username: string;
  size?: number;
}) {
  const palette = [
    "rgba(0,170,228,0.20)",
    "rgba(34,197,94,0.18)",
    "rgba(216,176,74,0.18)",
    "#E3EAF2",
  ];
  const index = username.length % palette.length;
  const bg = palette[index];

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: "#E3EAF2",
      }}
    >
      <Text style={{ color: COLORS.text, fontWeight: "900" }}>
        {username.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

// Cuánto puede pasar entre dos toques para que cuenten como "doble toque"
// (responder) en vez de dos toques sueltos (reaccionar, reaccionar).
const DOUBLE_TAP_WINDOW_MS = 280;

// Envuelto en React.memo: antes, cada tecla escrita en el compositor volvía
// a pintar los ~100 mensajes del chat, aunque ninguno hubiera cambiado — el
// componente entero (ChatGlobalScreen) se vuelve a ejecutar en cada cambio
// de estado, y como la lista se generaba con .map() en línea, React creaba
// elementos nuevos para cada burbuja. React.memo evita repintar una burbuja
// si sus propiedades no han cambiado de verdad. Para que esto funcione,
// onReact/onReply deben ser SIEMPRE la misma función entre renders (ver el
// punto de llamada: ahora se pasan handleReact/handleReply directamente en
// vez de envolverlas en una función nueva por mensaje).
const MessageBubble = React.memo(function MessageBubble({
  item,
  canViewMedia,
  grouped,
  mine,
  replyPreview,
  hasReply,
  reactionCounts,
  myReaction,
  onReact,
  onReply,
  noticiaId,
  noticiaCompartida,
  onAbrirNoticia,
}: {
  item: MessageItem;
  // Mensaje con [noticia:<id>]: se pinta como mini tarjeta de la noticia.
  noticiaId?: string | null;
  noticiaCompartida?: NoticiaMini | null;
  onAbrirNoticia?: (id: string) => void;
  canViewMedia: boolean;
  grouped?: boolean;
  mine?: boolean;
  isLoggedIn?: boolean;
  replyPreview?: MessageItem | null;
  hasReply?: boolean;
  reactionCounts?: Partial<Record<string, number>>;
  myReaction?: string;
  onReact: (messageId: string, emoji: ReactionEmoji) => void;
  onReply: (item: MessageItem) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const lastTapAtRef = useRef(0);
  const singleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (singleTapTimeoutRef.current) clearTimeout(singleTapTimeoutRef.current);
    };
  }, []);

  if (item.type === "system") {
    return null;
  }

  const roleTone =
    item.role === "admin"
      ? { text: "#1EA7E8", label: "ADMIN" }
      : item.role === "vip"
        ? { text: "#92660B", label: "VIP" }
        : { text: "#0B2138", label: "MIEMBRO" };

  const bubbleBg = mine ? COLORS.bubbleMine : COLORS.bubbleOther;
  const reactionEntries = Object.entries(reactionCounts ?? {}).filter(
    ([, count]) => (count ?? 0) > 0
  );

  // Un toque = abre/cierra el selector de reacciones. Dos toques seguidos
  // (dentro de DOUBLE_TAP_WINDOW_MS) = responder a este mensaje. No hay
  // "onDoublePress" nativo en Pressable, así que lo detectamos a mano
  // comparando cuándo llegó el toque anterior.
  const handleBubblePress = () => {
    const now = Date.now();
    const delta = now - lastTapAtRef.current;
    lastTapAtRef.current = now;

    if (delta > 0 && delta < DOUBLE_TAP_WINDOW_MS) {
      if (singleTapTimeoutRef.current) {
        clearTimeout(singleTapTimeoutRef.current);
        singleTapTimeoutRef.current = null;
      }
      setPickerOpen(false);
      onReply(item);
      return;
    }

    singleTapTimeoutRef.current = setTimeout(() => {
      setPickerOpen((prev) => !prev);
      singleTapTimeoutRef.current = null;
    }, DOUBLE_TAP_WINDOW_MS);
  };

  return (
    <View
      style={{
        alignSelf: mine ? "flex-end" : "stretch",
        maxWidth: "100%",
        gap: grouped ? 4 : 8,
        marginTop: grouped ? 2 : 6,
      }}
    >
      {!grouped ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <AvatarCircle username={item.displayName} />

          <View style={{ gap: 4 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>{item.displayName}</Text>

            {/*
              El "@usuario" se quitó del chat: es un dato privado, pensado
              solo para que un administrador pueda identificar a alguien si
              hace falta moderar — no para que lo vea todo el mundo. El rol
              (MIEMBRO/ADMIN) va debajo del nombre, como texto sin pastilla.
            */}
            <Text style={{ color: roleTone.text, fontSize: 10, fontWeight: "900" }}>
              {roleTone.label}
            </Text>
          </View>
        </View>
      ) : null}

      <Pressable onPress={handleBubblePress}>
        <View
          style={{
            borderRadius: 18,
            backgroundColor: bubbleBg,
            padding: 14,
            gap: 6,
          }}
        >
          {hasReply ? (
            <View
              style={{
                borderLeftWidth: 3,
                borderLeftColor: COLORS.accent,
                backgroundColor: "rgba(255,255,255,0.55)",
                borderRadius: 10,
                paddingVertical: 6,
                paddingHorizontal: 10,
                marginBottom: 2,
              }}
            >
              <Text style={{ color: COLORS.accent, fontWeight: "900", fontSize: 12 }}>
                {replyPreview ? replyPreview.displayName : "Mensaje original"}
              </Text>
              <Text
                numberOfLines={2}
                style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}
              >
                {replyPreview ? textoSinMarca(replyPreview.text) : "No disponible"}
              </Text>
            </View>
          ) : null}

          {item.type === "gif" ? (
            <View
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "#E3EAF2",
                backgroundColor: "#FAFCFE",
                padding: 14,
                alignItems: "center",
                justifyContent: "center",
                minHeight: 120,
              }}
            >
              {canViewMedia ? (
                <>
                  <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>
                    GIF
                  </Text>
                  <Text style={{ color: COLORS.muted, marginTop: 10, textAlign: "center" }}>
                    {item.text}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={{ color: "#B91C1C", fontWeight: "900", textAlign: "center" }}>
                    GIF bloqueado
                  </Text>
                  <Text
                    style={{
                      color: COLORS.muted,
                      marginTop: 10,
                      textAlign: "center",
                      lineHeight: 21,
                    }}
                  >
                    Inicia sesión y completa tu perfil para abrir multimedia del chat.
                  </Text>
                </>
              )}
            </View>
          ) : noticiaId ? (
            <TarjetaNoticiaForo
              noticia={noticiaCompartida}
              texto={textoSinMarca(item.text)}
              onLeer={() => onAbrirNoticia?.(noticiaId)}
            />
          ) : (
            <Text style={{ color: COLORS.text, lineHeight: 22 }}>{item.text}</Text>
          )}

          {/* La hora va dentro de la propia casilla del mensaje, esquina
              inferior derecha — como en WhatsApp. */}
          <Text
            style={{
              alignSelf: "flex-end",
              color: mine ? "rgba(11,33,56,0.45)" : COLORS.soft,
              fontSize: 11,
              marginTop: 2,
            }}
          >
            {item.time}
          </Text>
        </View>
      </Pressable>

      {reactionEntries.length > 0 ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 6,
            alignSelf: mine ? "flex-end" : "flex-start",
          }}
        >
          {reactionEntries.map(([emoji, count]) => {
            const isMine = myReaction === emoji;
            return (
              <Pressable
                key={emoji}
                onPress={() => onReact(item.id, emoji as ReactionEmoji)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  borderRadius: 999,
                  paddingVertical: 4,
                  paddingHorizontal: 8,
                  backgroundColor: isMine ? COLORS.accentSoft : "#F6FAFD",
                  borderWidth: 1,
                  borderColor: isMine ? COLORS.accentBorder : "#E3EAF2",
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text style={{ fontSize: 13 }}>{emoji}</Text>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "900",
                    color: isMine ? COLORS.text : COLORS.soft,
                  }}
                >
                  {count}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {pickerOpen ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            alignSelf: mine ? "flex-end" : "flex-start",
            backgroundColor: "#FFFFFF",
            borderRadius: 999,
            borderWidth: 1,
            borderColor: COLORS.border,
            paddingVertical: 6,
            paddingHorizontal: 8,
            shadowColor: "#000",
            shadowOpacity: 0.1,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          {REACTION_EMOJIS.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => {
                onReact(item.id, emoji);
                setPickerOpen(false);
              }}
              style={({ pressed }) => ({
                width: 32,
                height: 32,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? "#EAF6FD" : "transparent",
              })}
            >
              <Text style={{ fontSize: 18 }}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
});

// Botón de enviar con su propia animación: un "pop" al pulsarlo (como
// AnimatedPressable en app/(tabs)/perfil.tsx y cesta.tsx) y otro más
// marcado, con un check, justo cuando el mensaje se acaba de enviar —
// pensado para que se sienta como el de WhatsApp.
function ComposerSendButton({
  onPress,
  disabled,
  sending,
  justSent,
}: {
  onPress: () => void;
  disabled?: boolean;
  sending?: boolean;
  justSent?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scale, {
      toValue: 0.9,
      useNativeDriver: true,
      speed: 50,
      bounciness: 6,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 6,
    }).start();
  };

  useEffect(() => {
    if (!justSent) return;
    Animated.sequence([
      Animated.spring(scale, {
        toValue: 1.2,
        useNativeDriver: true,
        speed: 40,
        bounciness: 10,
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 18,
        bounciness: 8,
      }),
    ]).start();
  }, [justSent, scale]);

  const isActive = !disabled && !sending;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
    >
      <Animated.View
        style={{
          width: 42,
          height: 42,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isActive ? COLORS.accent : "#DCE6EF",
          transform: [{ scale }],
          shadowColor: COLORS.accent,
          shadowOpacity: isActive ? 0.22 : 0,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 2 },
        }}
      >
        {sending ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : justSent ? (
          <Ionicons name="checkmark" size={19} color="#FFFFFF" />
        ) : (
          <Text
            style={{
              color: isActive ? "#FFFFFF" : "#8FA3B8",
              fontWeight: "900",
              fontSize: 16,
            }}
          >
            ➤
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

function BottomBar({
  isChatTab,
  value,
  onChangeText,
  onPressInput,
  onPressSend,
  isLoggedIn,
  sending,
  justSent,
  canSend,
  errorText,
  replyTarget,
  onCancelReply,
  activeTab,
  onSelectTab,
  tabsMenuOpen,
  onToggleTabsMenu,
  tabsMenuAnim,
  visible,
  visibleAnim,
}: {
  isChatTab: boolean;
  value: string;
  onChangeText: (text: string) => void;
  onPressInput: () => void;
  onPressSend: () => void;
  isLoggedIn: boolean;
  sending?: boolean;
  justSent?: boolean;
  canSend?: boolean;
  errorText?: string | null;
  replyTarget?: MessageItem | null;
  onCancelReply?: () => void;
  activeTab: HubTab;
  onSelectTab: (tab: HubTab) => void;
  tabsMenuOpen: boolean;
  onToggleTabsMenu: () => void;
  tabsMenuAnim: Animated.Value;
  visible: boolean;
  visibleAnim: Animated.Value;
}) {
  // El botón se desactiva solo cuando SÍ hay sesión pero el mensaje es
  // demasiado corto (≤ 3 caracteres). Sin sesión se deja pulsable para que
  // abra el aviso de inicio de sesión.
  const sendDisabled = !!sending || canSend === false;

  return (
    <Animated.View
      // Todo este bloque (compositor + botón de enviar + menú de pestañas)
      // se oculta/reaparece al leer historial hacia arriba/abajo. La
      // animación va directamente en la raíz — que ya es position:"absolute"
      // — porque envolverla en otro Animated.View externo rompería ese
      // posicionamiento (el wrapper colapsaría a tamaño cero y el hijo
      // absoluto se ancoraría a él en vez de a toda la pantalla).
      pointerEvents={visible ? "box-none" : "none"}
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: 12,
        opacity: visibleAnim,
        transform: [
          {
            translateY: visibleAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [30, 0],
            }),
          },
        ],
      }}
    >
      {/*
        Menú de pestañas (Chat Global / Noticias / Novedades / Torneos):
        antes iba fijo arriba del todo, ocupando espacio siempre. Ahora se
        despliega hacia arriba, animado, justo encima del botón "🔼" — que a
        su vez está justo encima del botón de enviar mensaje.
      */}
      {/* Selector abajo a la derecha, justo encima del botón de enviar (petición del dueño). */}
      <Animated.View
        pointerEvents={tabsMenuOpen ? "auto" : "none"}
        style={{
          alignSelf: "flex-end",
          marginBottom: tabsMenuOpen ? 8 : 0,
          opacity: tabsMenuAnim,
          transform: [
            {
              translateY: tabsMenuAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [14, 0],
              }),
            },
            {
              scale: tabsMenuAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.94, 1],
              }),
            },
          ],
        }}
      >
        {/*
          Sin caja blanca alrededor: solo el título de cada pestaña dentro
          de su propia burbuja pequeña (HubTabButton ya trae su propio
          fondo/borde), centradas, una debajo de otra.
        */}
        <View style={{ alignItems: "flex-end", gap: 8 }}>
          {TAB_ITEMS.map((tabItem) => (
            <HubTabButton
              key={tabItem.key}
              active={activeTab === tabItem.key}
              label={tabItem.label}
              onPress={() => onSelectTab(tabItem.key)}
            />
          ))}
        </View>
      </Animated.View>

      <Pressable
        onPress={onToggleTabsMenu}
        accessibilityLabel="Cambiar de sección del chat"
        style={({ pressed }) => ({
          alignSelf: "flex-end",
          // Centrado sobre el botón de enviar (42 px de ancho).
          marginRight: 4,
          width: 34,
          height: 34,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#FFFFFF",
          borderWidth: 1,
          borderColor: COLORS.borderSoft,
          marginBottom: 8,
          opacity: pressed ? 0.85 : 1,
          shadowColor: COLORS.accent,
          shadowOpacity: 0.1,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
        })}
      >
        <Ionicons
          name={tabsMenuOpen ? "chevron-down" : "chevron-up"}
          size={18}
          color={COLORS.accent}
        />
      </Pressable>

      {!isChatTab ? null : (
      <>
      {!!errorText && (
        <Text
          style={{ color: "#B91C1C", fontWeight: "800", textAlign: "center", marginBottom: 8 }}
        >
          {errorText}
        </Text>
      )}

      {!!replyTarget && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "#D6ECFA",
            backgroundColor: "#EAF6FD",
            paddingVertical: 8,
            paddingHorizontal: 12,
            marginBottom: 8,
            gap: 10,
          }}
        >
          <View
            style={{
              width: 3,
              alignSelf: "stretch",
              borderRadius: 2,
              backgroundColor: COLORS.accent,
            }}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.accent, fontWeight: "800", fontSize: 12 }}>
              Respondiendo a {replyTarget.displayName || "usuario"}
            </Text>
            <Text
              numberOfLines={1}
              style={{ color: "rgba(11,33,56,0.6)", fontSize: 12, marginTop: 2 }}
            >
              {replyTarget.type === "gif" ? "GIF" : textoSinMarca(replyTarget.text)}
            </Text>
          </View>
          <Pressable
            onPress={onCancelReply}
            hitSlop={8}
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(11,33,56,0.08)",
            }}
          >
            <Ionicons name="close" size={15} color={COLORS.text} />
          </Pressable>
        </View>
      )}

      {/*
        Sin "manta blanca" alrededor: antes había un borde en degradado y una
        tarjeta blanca envolviendo todo el compositor. Ahora el recuadro que
        escribe el texto es translúcido (se lee perfectamente pero no es
        blanco puro) y no hay ninguna caja alrededor — solo el campo y, al
        lado, el botón de enviar tal cual estaba.
      */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Pressable
          onPress={onPressInput}
          style={{
            flex: 1,
          }}
        >
          {isLoggedIn ? (
            <TextInput
              value={value}
              onChangeText={onChangeText}
              placeholder="Escribe un mensaje…"
              placeholderTextColor="rgba(11,33,56,0.4)"
              editable={!sending}
              style={{
                minHeight: 42,
                maxHeight: 96,
                borderRadius: 14,
                backgroundColor: "rgba(255,255,255,0.42)",
                color: COLORS.text,
                // 16px es el mínimo que evita que Safari/iOS haga zoom
                // automático al enfocar el campo (por debajo de 16px lo
                // dispara siempre). No bajar de aquí.
                fontSize: 16,
                paddingHorizontal: 14,
                paddingVertical: 10,
                opacity: sending ? 0.6 : 1,
              }}
              multiline
            />
          ) : (
            <View
              style={{
                minHeight: 42,
                borderRadius: 14,
                backgroundColor: "rgba(255,255,255,0.42)",
                paddingHorizontal: 14,
                paddingVertical: 10,
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "rgba(11,33,56,0.4)", fontSize: 16 }}>
                Escribe un mensaje…
              </Text>
            </View>
          )}
        </Pressable>

        <ComposerSendButton
          onPress={onPressSend}
          disabled={sendDisabled}
          sending={sending}
          justSent={justSent}
        />
      </View>
      </>
      )}
    </Animated.View>
  );
}

function AuthRequiredModal({
  visible,
  onClose,
  onLogin,
  onRegister,
}: {
  visible: boolean;
  onClose: () => void;
  onLogin: () => void;
  onRegister: () => void;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.overlay,
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        <LinearGradient
          colors={["rgba(30,167,232,0.14)", "rgba(0,170,228,0.10)", "rgba(30,167,232,0.02)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: "100%",
            maxWidth: 460,
            borderRadius: 28,
            padding: 1,
          }}
        >
          <View
            style={{
              borderRadius: 27,
              backgroundColor: "#FFFFFF",
              padding: 20,
              gap: 14,
              alignItems: "center",
            }}
          >
            <Text
              style={{ color: COLORS.text, fontWeight: "900", fontSize: 12, textAlign: "center" }}
            >
              ACCESO NECESARIO
            </Text>

            <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "900", textAlign: "center" }}>
              Inicia sesión para enviar mensajes
            </Text>

            <Text style={{ color: COLORS.muted, lineHeight: 22, textAlign: "center" }}>
              Puedes explorar la sala libremente, pero para escribir o enviar mensajes
              necesitas iniciar sesión o crear tu cuenta.
            </Text>

            <View
              style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" }}
            >
              <Tag text="Chat visible" tone="success" />
              <Tag text="Inicio de sesión requerido" tone="warn" />
              <Tag text="Comunidad protegida" tone="neutral" />
            </View>

            <View
              style={{
                flexDirection: "row",
                gap: 10,
                flexWrap: "wrap",
                justifyContent: "center",
                marginTop: 4,
              }}
            >
              <ActionButton label="Iniciar sesión" onPress={onLogin} primary />
              <ActionButton label="Crear cuenta" onPress={onRegister} />
            </View>

            <Pressable
              onPress={onClose}
              style={({ pressed }) => ({
                opacity: pressed ? 0.88 : 1,
                alignSelf: "center",
                paddingVertical: 8,
                paddingHorizontal: 10,
                marginTop: 2,
              })}
            >
              <Text style={{ color: COLORS.muted, fontWeight: "800" }}>Cerrar</Text>
            </Pressable>
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
}

// El "Pop" centrado que sustituye al título y párrafo que antes estaban
// siempre visibles en la cabecera. Se abre al tocar el icono de información
// (i) junto al recuadro de "viendo ahora". Tocar fuera de la tarjeta también
// lo cierra: el fondo es un Pressable, y la tarjeta interior absorbe el
// toque con su propio Pressable para que tocar dentro no lo cierre.
function InfoModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
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
        <Pressable onPress={() => {}}>
          <LinearGradient
            colors={["rgba(30,167,232,0.14)", "rgba(0,170,228,0.10)", "rgba(30,167,232,0.02)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: "100%",
              maxWidth: 460,
              borderRadius: 28,
              padding: 1,
            }}
          >
            <View
              style={{
                borderRadius: 27,
                backgroundColor: "#FFFFFF",
                padding: 22,
                gap: 14,
                alignItems: "center",
              }}
            >
              <Ionicons name="chatbubbles-outline" size={26} color={COLORS.accent} />

              <Text
                style={{
                  color: COLORS.text,
                  fontSize: 24,
                  fontWeight: "900",
                  textAlign: "center",
                }}
              >
                Chat Global
              </Text>

              <Text style={{ color: COLORS.muted, lineHeight: 22, textAlign: "center" }}>
                Conecta con otros gamers, encuentra gente para jugar a Fortnite,
                descubre personas de tu misma ciudad o país y sigue noticias
                gaming, novedades de la tienda y torneos.
              </Text>

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
                  marginTop: 2,
                })}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Entendido</Text>
              </Pressable>
            </View>
          </LinearGradient>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Pestañas "Nuestras Novedades" y "Torneos": todavía sin
// contenido real, así que de momento muestran solo este mensaje centrado en
// la pantalla en vez de una vista previa de ejemplo (antes era InfoPanel,
// con títulos y párrafos de muestra — se quitó a petición de Jefe).
function ComingSoonPanel() {
  const { height } = useWindowDimensions();

  return (
    <View
      style={{
        minHeight: Math.max(260, height - 320),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: COLORS.text,
          fontWeight: "900",
          fontSize: 22,
          letterSpacing: 1,
          textAlign: "center",
        }}
      >
        PRÓXIMAMENTE
      </Text>
    </View>
  );
}

// --- Pestaña "Chat": bandeja privada por producto -------------------------

type PrivateChatRow = {
  id: string;
  // null = conversación general de soporte, sin producto asociado (botón
  // "Chatear con nosotros" de app/catalogo.tsx, ver
  // get_or_create_support_chat en sql/product_chats.sql).
  product_id: string | null;
  // Solo relleno si esta conversación se abrió sola al enviar "Vender
  // ahora" con sesión iniciada (ver components/VenderAhoraModal.tsx,
  // get_or_create_sell_request_chat en la migración de Supabase).
  sell_request_id: string | null;
  last_message_at: string;
  last_message_preview: string;
  product_title: string;
  product_image: string | null;
};

function formatInboxDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

// Bandeja del cliente logueado: una fila por producto en el que ha escrito
// (ver sql/product_chats.sql). Tocar una fila abre app/chat/[chatId].tsx,
// donde vive la conversación de verdad (components/ProductChatThread.tsx).
function PrivateChatsInbox({
  isLoggedIn,
  onLoginPress,
}: {
  isLoggedIn: boolean;
  onLoginPress: () => void;
}) {
  const [rows, setRows] = useState<PrivateChatRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Papelera por fila: primer toque pide confirmación, segundo la borra de
  // verdad (delete_chat_for_me) — solo desaparece de MI bandeja; si el
  // admin no la ha borrado también, él la sigue viendo.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isLoggedIn) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) return;

      const { data: chats, error } = await supabase
        .from("product_chats")
        .select("id,product_id,sell_request_id,last_message_at,last_message_preview")
        .eq("customer_user_id", userId)
        // Solo las que NO he borrado yo de mi bandeja — ver
        // delete_chat_for_me. Si el admin la borró de la suya pero yo no,
        // aquí sigue apareciendo.
        .is("customer_deleted_at", null)
        .order("last_message_at", { ascending: false });

      if (error) throw error;

      const chatRows = (chats ?? []) as {
        id: string;
        product_id: string | null;
        sell_request_id: string | null;
        last_message_at: string;
        last_message_preview: string;
      }[];

      // product_id/sell_request_id pueden ser null: se filtran antes de
      // pedir por id, que no admite null en el .in(...).
      const productIds = Array.from(
        new Set(chatRows.map((c) => c.product_id).filter((id): id is string => !!id))
      );
      const sellRequestIds = Array.from(
        new Set(chatRows.map((c) => c.sell_request_id).filter((id): id is string => !!id))
      );
      let titleById: Record<string, string> = {};
      let imageById: Record<string, string | null> = {};
      let articuloBySellRequest: Record<string, string> = {};

      if (productIds.length > 0) {
        const { data: products } = await supabase
          .from("products")
          .select("id,title,images")
          .in("id", productIds);

        for (const row of (products ?? []) as any[]) {
          titleById[row.id] = row.title ?? "Producto";
          imageById[row.id] = row.images?.[0] ?? null;
        }

        const { data: media } = await supabase
          .from("product_media")
          .select("product_id,public_url,is_cover,sort_order")
          .in("product_id", productIds)
          .eq("kind", "image")
          .order("is_cover", { ascending: false })
          .order("sort_order", { ascending: true });

        for (const row of (media ?? []) as any[]) {
          if (!imageById[row.product_id]) imageById[row.product_id] = row.public_url;
        }
      }

      if (sellRequestIds.length > 0) {
        const { data: sellRequests } = await supabase
          .from("sell_requests")
          .select("id,articulo")
          .in("id", sellRequestIds);

        for (const row of (sellRequests ?? []) as any[]) {
          articuloBySellRequest[row.id] = row.articulo ?? "Artículo";
        }
      }

      setRows(
        chatRows.map((c) => ({
          ...c,
          product_title: c.product_id
            ? titleById[c.product_id] ?? "Producto"
            : c.sell_request_id
              ? `Venta: ${articuloBySellRequest[c.sell_request_id] ?? "Artículo"}`
              : "Atención al cliente",
          product_image: c.product_id ? imageById[c.product_id] ?? null : null,
        }))
      );
    } catch (e) {
      console.error("Error cargando tus conversaciones:", e);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    load();
  }, [load]);

  // Borra una conversación SOLO de mi bandeja (ver delete_chat_for_me).
  async function handleDeleteChat(chatId: string) {
    if (deletingId) return;
    setDeletingId(chatId);
    try {
      const { error } = await supabase.rpc("delete_chat_for_me", { p_chat_id: chatId });
      if (error) throw error;
      setRows((prev) => prev.filter((r) => r.id !== chatId));
    } catch (e) {
      console.error("Error borrando la conversación:", e);
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  if (!isLoggedIn) {
    return (
      <View style={{ paddingVertical: 20, gap: 10, alignItems: "center" }}>
        <Ionicons name="chatbubble-ellipses-outline" size={26} color={COLORS.muted} />
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>
          Inicia sesión para ver tus conversaciones
        </Text>
        <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 20 }}>
          Aquí aparecen tus conversaciones privadas con la tienda sobre productos concretos.
        </Text>
        <Pressable
          onPress={onLoginPress}
          style={({ pressed }) => ({
            opacity: pressed ? 0.9 : 1,
            marginTop: 4,
            borderRadius: 999,
            paddingVertical: 12,
            paddingHorizontal: 20,
            backgroundColor: COLORS.accent,
          })}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Iniciar sesión</Text>
        </Pressable>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 30 }}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={{ paddingVertical: 20, gap: 6, alignItems: "center" }}>
        <Ionicons name="chatbubble-ellipses-outline" size={26} color={COLORS.muted} />
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>
          Todavía no tienes conversaciones
        </Text>
        <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 20 }}>
          Pulsa «Chat» en la ficha de un producto para escribirnos por él.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      {rows.map((row) => (
        <Pressable
          key={row.id}
          onPress={() => router.push({ pathname: "/chat/[chatId]", params: { chatId: row.id } } as any)}
          style={({ pressed }) => ({
            opacity: pressed ? 0.9 : 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: COLORS.borderSoft,
            backgroundColor: COLORS.card,
            padding: 12,
          })}
        >
          {row.product_image ? (
            <Image
              source={{ uri: row.product_image }}
              style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: COLORS.bg3 }}
            />
          ) : (
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                backgroundColor: COLORS.bg3,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name={
                  row.product_id
                    ? "cube-outline"
                    : row.sell_request_id
                      ? "pricetag-outline"
                      : "chatbubble-ellipses-outline"
                }
                size={20}
                color={COLORS.muted}
              />
            </View>
          )}

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: "900", fontSize: 14 }}>
              {row.product_title}
            </Text>
            <Text numberOfLines={1} style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>
              {row.last_message_preview || "Sin mensajes todavía"}
            </Text>
          </View>

          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <Text style={{ color: COLORS.soft, fontSize: 11 }}>{formatInboxDate(row.last_message_at)}</Text>
            {confirmDeleteId === row.id ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Pressable onPress={() => setConfirmDeleteId(null)} hitSlop={6}>
                  <Text style={{ color: COLORS.soft, fontSize: 10, fontWeight: "700" }}>Cancelar</Text>
                </Pressable>
                <Pressable onPress={() => handleDeleteChat(row.id)} disabled={deletingId === row.id} hitSlop={6}>
                  <Text style={{ color: "#DC2626", fontSize: 10, fontWeight: "900" }}>
                    {deletingId === row.id ? "Borrando…" : "Confirmar"}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => setConfirmDeleteId(row.id)} hitSlop={6}>
                <Ionicons name="trash-outline" size={14} color={COLORS.soft} />
              </Pressable>
            )}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

// --- Pestaña "Noticias Gaming" ----------------------------------------------
// Lee las noticias ya resumidas de la tabla noticias_gaming (lectura pública)
// y, en segundo plano, pide a api/noticias-gaming.ts que busque nuevas si
// toca (la propia función decide si han pasado 3 horas). Si la tabla aún no
// existe o falla algo, se muestra el estado vacío, nunca un error.

const NOTICIAS_POR_PAGINA = 20;
const NOTICIAS_LIKES_KEY = "videojuegoszaragoza:noticias_gaming_likes";
const NOTICIAS_API_URL =
  Platform.OS === "web" ? "/api/noticias-gaming" : "https://videojuegoszaragoza.com/api/noticias-gaming";
const AZUL_NOTICIAS = "#1EA7E8";
const AZUL_OSCURO_NOTICIAS = "#1EA7E8";
const COLUMNAS_NOTICIA =
  "id,fuente,titulo,imagen_url,categoria,resumen,puntos_clave,datos,por_que_importa,afecta_a,publicada_en,created_at";
// Si la columna «imagenes» aún no existe en la base de datos, se deja de pedir.
let columnaImagenesDisponible = true;
// Igual con «imagenes_meta» (sin ella, las fotos se miden con Image.getSize).
let columnaMetaDisponible = true;

// Columnas de una noticia, con las opcionales que existan.
function columnasNoticia(): string {
  if (!columnaImagenesDisponible) return COLUMNAS_NOTICIA;
  return `${COLUMNAS_NOTICIA},imagenes,imagenes_verificadas${columnaMetaDisponible ? ",imagenes_meta" : ""}`;
}

// Lee con las columnas opcionales; si el error dice que falta alguna, la deja
// de pedir y lo reintenta (primero imagenes_meta, luego imagenes).
async function leerConColumnasOpcionales<R extends { error: { message?: string } | null }>(
  consulta: (columnas: string) => PromiseLike<R>
): Promise<R> {
  let r = await consulta(columnasNoticia());
  for (let i = 0; i < 2 && r.error; i++) {
    const mensaje = r.error.message ?? "";
    if (columnaImagenesDisponible && columnaMetaDisponible && /imagenes_meta/i.test(mensaje)) {
      columnaMetaDisponible = false;
    } else if (columnaImagenesDisponible && /imagenes/i.test(mensaje)) {
      columnaImagenesDisponible = false;
    } else {
      break;
    }
    r = await consulta(columnasNoticia());
  }
  return r;
}

// Ancho y alto reales de una foto (de imagenes_meta).
type MedidaFoto = { w: number; h: number };

type Noticia = {
  id: string;
  fuente: string;
  titulo: string;
  imagenes: string[];
  // Medidas de cada foto por URL (imagenes_meta); las que faltan se miden con getSize.
  medidas: Record<string, MedidaFoto>;
  categoria: string;
  resumen: string;
  puntosClave: string[];
  datos: string[];
  porQueImporta: string | null;
  afectaA: string | null;
  publicadaEn: string | null;
  // created_at real: sirve para «noticias vistas hasta».
  creadaEn: string | null;
};

// Lo justo para la mini tarjeta de una noticia compartida en el Foro.
type NoticiaMini = { id: string; titulo: string; categoria: string; imagen: string | null };

function aListaDeTextos(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string" && !!v.trim()) : [];
}

// Imagen principal + carrusel, sin repetidas y solo https (máx. 6).
function imagenesDeFila(r: any): string[] {
  // Solo fotos comprobadas por el servidor (sin la columna imagenes_verificadas, ninguna).
  const todas: unknown[] = r.imagenes_verificadas === true ? [r.imagen_url, ...(Array.isArray(r.imagenes) ? r.imagenes : [])] : [];
  const salida: string[] = [];
  for (const u of todas) {
    if (typeof u === "string" && /^https:\/\//i.test(u) && !salida.includes(u)) salida.push(u);
  }
  return salida.slice(0, 6);
}

// Medidas válidas de imagenes_meta ([{url, w, h}]), por URL.
function medidasDeFila(r: any): Record<string, MedidaFoto> {
  const salida: Record<string, MedidaFoto> = {};
  if (!Array.isArray(r.imagenes_meta)) return salida;
  for (const m of r.imagenes_meta) {
    const w = Number(m?.w);
    const h = Number(m?.h);
    if (typeof m?.url === "string" && w > 0 && h > 0) salida[m.url] = { w, h };
  }
  return salida;
}

function filaANoticia(r: any): Noticia {
  return {
    id: String(r.id),
    fuente: String(r.fuente ?? ""),
    titulo: String(r.titulo ?? ""),
    imagenes: imagenesDeFila(r),
    medidas: medidasDeFila(r),
    categoria: String(r.categoria ?? "Gaming"),
    resumen: String(r.resumen ?? ""),
    puntosClave: aListaDeTextos(r.puntos_clave),
    datos: aListaDeTextos(r.datos),
    porQueImporta: r.por_que_importa ?? null,
    afectaA: r.afecta_a ?? null,
    publicadaEn: r.publicada_en ?? r.created_at ?? null,
    creadaEn: r.created_at ?? null,
  };
}

// Datos de varias noticias por id (para las mini tarjetas del Foro).
// Devuelve null si falla la lectura (se reintenta más tarde).
async function leerNoticiasMini(ids: string[]): Promise<Record<string, NoticiaMini> | null> {
  const basicas = "id,titulo,categoria,imagen_url";
  const consulta = (columnas: string) =>
    supabase.from("noticias_gaming").select(columnas).in("id", ids).eq("publicada", true);

  let { data, error } = await consulta(columnaImagenesDisponible ? `${basicas},imagenes,imagenes_verificadas` : basicas);
  if (error && columnaImagenesDisponible && /imagenes/i.test(error.message ?? "")) {
    columnaImagenesDisponible = false;
    ({ data, error } = await consulta(basicas));
  }
  if (error) return null;

  const mapa: Record<string, NoticiaMini> = {};
  for (const r of (data ?? []) as any[]) {
    mapa[String(r.id).toLowerCase()] = {
      id: String(r.id),
      titulo: String(r.titulo ?? ""),
      categoria: String(r.categoria ?? "Gaming"),
      imagen: imagenesDeFila(r)[0] ?? null,
    };
  }
  return mapa;
}

// "hace 5 min", "hace 3 horas", "hace 2 días" o la fecha si es más antigua.
function haceTiempo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const min = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return horas === 1 ? "hace 1 hora" : `hace ${horas} horas`;
  const dias = Math.floor(horas / 24);
  if (dias < 7) return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function fechaLarga(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

// Enlace a la noticia dentro de la tienda (no a la fuente original).
const URL_NOTICIA_TIENDA = "https://videojuegoszaragoza.com/chat-global?tab=news&noticia=";

// «Compartir fuera»: hoja nativa, navigator.share o, si no hay, copiar el enlace.
async function compartirFuera(n: Noticia): Promise<"compartido" | "copiado" | "nada"> {
  const enlace = `${URL_NOTICIA_TIENDA}${n.id}`;
  const nav: any = typeof navigator !== "undefined" ? navigator : null;
  const copiar = async () => {
    if (!nav?.clipboard?.writeText) return "nada" as const;
    await nav.clipboard.writeText(enlace);
    return "copiado" as const;
  };

  try {
    if (Platform.OS === "web") {
      if (nav?.share) {
        try {
          await nav.share({ title: n.titulo, url: enlace });
          return "compartido";
        } catch (e: any) {
          // Cancelado por el usuario: nada más. Otro fallo: se copia el enlace.
          if (e?.name === "AbortError") return "nada";
          return await copiar();
        }
      }
      return await copiar();
    }
    await Share.share({ title: n.titulo, message: `${n.titulo}\n${enlace}`, url: enlace });
    return "compartido";
  } catch {
    return "nada";
  }
}

// Una noticia suelta (p. ej. una antigua que llega por enlace y no está en la primera página).
async function leerNoticiaPorId(id: string): Promise<Noticia | null> {
  const consulta = (columnas: string) =>
    supabase.from("noticias_gaming").select(columnas).eq("id", id).eq("publicada", true).maybeSingle();

  // Sin imagenes_meta o sin imagenes (migraciones pendientes) se reintenta sin ellas.
  const { data, error } = await leerConColumnasOpcionales(consulta);
  return !error && data ? filaANoticia(data) : null;
}

// La fecha (created_at, tal cual llega) de la noticia más reciente de la lista.
function creadaMasReciente(noticias: Noticia[]): string {
  let mejor = "";
  let mejorT = -Infinity;
  for (const n of noticias) {
    if (!n.creadaEn) continue;
    const t = Date.parse(n.creadaEn);
    const valor = Number.isNaN(t) ? -Infinity : t;
    if (valor > mejorT || (valor === mejorT && n.creadaEn > mejor)) {
      mejor = n.creadaEn;
      mejorT = valor;
    }
  }
  return mejor;
}

function NoticiasGamingPanel({
  userId,
  noticiaPedida,
  onNoticiaAtendida,
  onDesplazarA,
  onCompartirEnForo,
}: {
  userId: string | null;
  // Noticia a desplegar y mostrar (enlace ?noticia= o mini tarjeta del Foro).
  noticiaPedida: string | null;
  onNoticiaAtendida: () => void;
  onDesplazarA: (y: number) => void;
  onCompartirEnForo: (n: Noticia) => Promise<boolean>;
}) {
  const { height } = useWindowDimensions();
  const [noticias, setNoticias] = useState<Noticia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [hayMas, setHayMas] = useState(false);
  const [abiertaId, setAbiertaId] = useState<string | null>(null);
  const [likes, setLikes] = useState<Record<string, true>>({});
  // Nº de comentarios por noticia; null = función oculta (tabla aún no creada).
  const [comentarios, setComentarios] = useState<Record<string, number> | null>(null);
  const [aCompartir, setACompartir] = useState<Noticia | null>(null);
  const montado = useRef(true);
  // Posición (y) de cada tarjeta dentro del panel, para desplazarse a ella.
  const posiciones = useRef<Record<string, number>>({});
  const temporizadores = useRef<ReturnType<typeof setTimeout>[]>([]);
  const enfocado = useRef(false);
  const ultimaVista = useRef("");
  const abiertaIdRef = useRef<string | null>(null);
  // Cuántas noticias se han leído por páginas (sin contar una suelta abierta por enlace).
  const leidas = useRef(0);
  const isLoggedIn = !!userId;

  useEffect(() => {
    abiertaIdRef.current = abiertaId;
  }, [abiertaId]);

  // Página "desde" (0 = primera). Devuelve las noticias leídas.
  const leerPagina = useCallback(async (desde: number): Promise<Noticia[] | null> => {
    const consulta = (columnas: string) =>
      supabase
        .from("noticias_gaming")
        .select(columnas)
        .eq("publicada", true)
        .order("publicada_en", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(desde, desde + NOTICIAS_POR_PAGINA - 1);

    // Sin imagenes_meta o sin imagenes (migraciones pendientes) se reintenta sin ellas.
    let { data, error } = await leerConColumnasOpcionales(consulta);
    if (error && columnaImagenesDisponible) {
      // Otro fallo: un último intento solo con las columnas básicas.
      ({ data, error } = await consulta(COLUMNAS_NOTICIA));
    }
    if (error) return null;
    return ((data ?? []) as any[]).map(filaANoticia);
  }, []);

  // Cuenta los comentarios visibles de las noticias indicadas.
  const contarComentarios = useCallback(async (ids: string[]) => {
    if (!ids.length || !tablaComentariosDisponible) return;
    const { data, error } = await supabase
      .from("noticias_comentarios")
      .select("noticia_id")
      .in("noticia_id", ids)
      .eq("oculto", false)
      .limit(5000);
    if (!montado.current) return;
    if (error) {
      if (faltaTabla(error, "noticias_comentarios")) {
        tablaComentariosDisponible = false;
        setComentarios(null);
      }
      return;
    }
    setComentarios((prev) => {
      const next = { ...(prev ?? {}) };
      for (const id of ids) next[id] = 0;
      for (const r of (data ?? []) as { noticia_id: string }[]) {
        next[r.noticia_id] = (next[r.noticia_id] ?? 0) + 1;
      }
      return next;
    });
  }, []);

  const recargar = useCallback(async () => {
    const primera = await leerPagina(0);
    if (!montado.current) return;
    setNoticias((prev) => {
      const lista = primera ?? [];
      // Conserva una noticia antigua abierta por enlace que no esté en la primera página.
      const extra = prev.filter((p) => p.id === abiertaIdRef.current && !lista.some((n) => n.id === p.id));
      return [...extra, ...lista];
    });
    leidas.current = primera?.length ?? 0;
    setHayMas((primera?.length ?? 0) === NOTICIAS_POR_PAGINA);
    setCargando(false);
    if (primera?.length) contarComentarios(primera.map((n) => n.id));
  }, [leerPagina, contarComentarios]);

  useEffect(() => {
    montado.current = true;
    recargar();

    // En segundo plano: si la función trae noticias nuevas o rellena
    // imágenes de las que ya había, se recarga la lista.
    fetch(NOTICIAS_API_URL)
      .then((r) => r.json())
      .then((json: any) => {
        const nuevas = json?.actualizado ? Number(json?.nuevas) || 0 : 0;
        const rellenadas = Number(json?.rellenadas) || 0;
        if (montado.current && (nuevas > 0 || rellenadas > 0)) recargar();
      })
      .catch(() => {});

    // Me gusta guardados solo en este dispositivo.
    AsyncStorage.getItem(NOTICIAS_LIKES_KEY)
      .then((raw) => {
        const ids: unknown = raw ? JSON.parse(raw) : [];
        if (!montado.current || !Array.isArray(ids)) return;
        const mapa: Record<string, true> = {};
        for (const id of ids) if (typeof id === "string") mapa[id] = true;
        setLikes(mapa);
      })
      .catch(() => {});

    const pendientes = temporizadores.current;
    return () => {
      montado.current = false;
      pendientes.forEach(clearTimeout);
    };
  }, [recargar]);

  const verMasNoticias = async () => {
    if (cargandoMas) return;
    setCargandoMas(true);
    const siguientes = await leerPagina(leidas.current);
    if (!montado.current) return;
    if (siguientes) {
      leidas.current += siguientes.length;
      setNoticias((prev) => {
        const vistos = new Set(prev.map((n) => n.id));
        return [...prev, ...siguientes.filter((n) => !vistos.has(n.id))];
      });
      setHayMas(siguientes.length === NOTICIAS_POR_PAGINA);
      contarComentarios(siguientes.map((n) => n.id));
    } else {
      setHayMas(false);
    }
    setCargandoMas(false);
  };

  // Despliega una noticia y se desplaza a ella. Dos intentos: el segundo
  // corrige si las fotos de las tarjetas de arriba cambiaron la altura.
  const desplegarYMostrar = useCallback(
    (id: string) => {
      setAbiertaId(id);
      temporizadores.current.forEach(clearTimeout);
      temporizadores.current.length = 0;
      for (const ms of [350, 1200]) {
        temporizadores.current.push(
          setTimeout(() => {
            const y = posiciones.current[id];
            if (montado.current && y != null) onDesplazarA(y);
          }, ms)
        );
      }
    },
    [onDesplazarA]
  );

  // Noticia pedida desde un enlace (?noticia=) o desde la mini tarjeta del Foro.
  useEffect(() => {
    if (!noticiaPedida || cargando) return;
    const id = noticiaPedida;
    onNoticiaAtendida();

    const yaEsta = noticias.find((n) => n.id.toLowerCase() === id);
    if (yaEsta) {
      desplegarYMostrar(yaEsta.id);
      return;
    }
    // No está en la primera página: se trae suelta y se pone arriba.
    leerNoticiaPorId(id).then((n) => {
      if (!n || !montado.current) return;
      setNoticias((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev]));
      contarComentarios([n.id]);
      desplegarYMostrar(n.id);
    });
  }, [noticiaPedida, cargando, noticias, onNoticiaAtendida, desplegarYMostrar, contarComentarios]);

  // «Noticias vistas hasta»: cada vez que se ve esta pestaña se guarda la
  // fecha (created_at) de la noticia más reciente; siempre en el dispositivo
  // y, con sesión, también en preferencias_usuario. Blue la usa para contar
  // las noticias nuevas.
  const masReciente = useMemo(() => creadaMasReciente(noticias), [noticias]);
  // Las 2 primeras noticias con foto: su primera foto se descarga con prioridad alta.
  const prioritarias = useMemo(
    () => new Set(noticias.filter((n) => n.imagenes.length).slice(0, 2).map((n) => n.id)),
    [noticias]
  );
  const guardarVistas = useCallback(() => {
    if (!masReciente || !enfocado.current) return;
    const clave = `${userId ?? ""}|${masReciente}`;
    if (ultimaVista.current === clave) return;
    ultimaVista.current = clave;
    AsyncStorage.setItem(NOTICIAS_VISTAS_KEY, masReciente).catch(() => {});
    if (userId) guardarPreferencias(userId, { noticias_vistas_hasta: masReciente });
  }, [masReciente, userId]);

  useFocusEffect(
    useCallback(() => {
      enfocado.current = true;
      guardarVistas();
      return () => {
        enfocado.current = false;
      };
    }, [guardarVistas])
  );

  const guardarPosicion = useCallback((id: string, y: number) => {
    posiciones.current[id] = y;
  }, []);

  const sumarComentario = useCallback((id: string) => {
    setComentarios((prev) => (prev ? { ...prev, [id]: (prev[id] ?? 0) + 1 } : prev));
  }, []);

  const abrirCompartir = useCallback((n: Noticia) => setACompartir(n), []);

  const alternar = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAbiertaId((actual) => (actual === id ? null : id));
  }, []);

  const alternarLike = useCallback((id: string) => {
    setLikes((prev) => {
      const nuevo = { ...prev };
      if (nuevo[id]) delete nuevo[id];
      else nuevo[id] = true;
      AsyncStorage.setItem(NOTICIAS_LIKES_KEY, JSON.stringify(Object.keys(nuevo))).catch(() => {});
      return nuevo;
    });
  }, []);

  if (cargando) {
    return (
      <View style={{ minHeight: Math.max(260, height - 320), alignItems: "center", justifyContent: "center" }}>
        <CargaMarca texto="Buscando noticias…" />
      </View>
    );
  }

  if (!noticias.length) {
    return (
      <View
        style={{
          minHeight: Math.max(260, height - 320),
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
        }}
      >
        <MarcaAnimada cual="tienda" ancho={140} />
        <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 22, fontSize: 15 }}>
          Todavía no hay noticias. Vuelve en un rato.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ width: "100%", alignItems: "center", gap: 18 }}>
      {noticias.map((n) => (
        <TarjetaNoticia
          key={n.id}
          noticia={n}
          prioritaria={prioritarias.has(n.id)}
          abierta={abiertaId === n.id}
          meGusta={!!likes[n.id]}
          numComentarios={comentarios ? comentarios[n.id] ?? 0 : undefined}
          isLoggedIn={isLoggedIn}
          onAlternar={alternar}
          onLike={alternarLike}
          onCompartir={abrirCompartir}
          onComentado={sumarComentario}
          onPosicion={guardarPosicion}
        />
      ))}

      <MenuCompartirNoticia
        noticia={aCompartir}
        isLoggedIn={isLoggedIn}
        onCerrar={() => setACompartir(null)}
        onCompartirEnForo={onCompartirEnForo}
      />

      {hayMas ? (
        <Pressable
          onPress={verMasNoticias}
          disabled={cargandoMas}
          style={({ pressed }) => ({
            opacity: pressed || cargandoMas ? 0.7 : 1,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: COLORS.accentBorder,
            paddingVertical: 10,
            paddingHorizontal: 22,
            marginTop: 4,
          })}
        >
          <Text style={{ color: AZUL_OSCURO_NOTICIAS, fontWeight: "800" }}>
            {cargandoMas ? "Cargando…" : "Ver más noticias"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const TarjetaNoticia = React.memo(function TarjetaNoticia({
  noticia: n,
  prioritaria,
  abierta,
  meGusta,
  numComentarios,
  isLoggedIn,
  onAlternar,
  onLike,
  onCompartir,
  onComentado,
  onPosicion,
}: {
  noticia: Noticia;
  // Una de las 2 primeras con foto: su primera foto va con prioridad alta.
  prioritaria: boolean;
  abierta: boolean;
  meGusta: boolean;
  // undefined = comentarios no disponibles (se oculta el botón).
  numComentarios?: number;
  isLoggedIn: boolean;
  onAlternar: (id: string) => void;
  onLike: (id: string) => void;
  onCompartir: (n: Noticia) => void;
  onComentado: (id: string) => void;
  onPosicion: (id: string, y: number) => void;
}) {
  const [verComentarios, setVerComentarios] = useState(false);
  const meta = [n.fuente, haceTiempo(n.publicadaEn)].filter(Boolean).join(" · ");
  const origen = [n.fuente, fechaLarga(n.publicadaEn)].filter(Boolean).join(" · ");
  const hayComentarios = numComentarios !== undefined;

  const alternarComentarios = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setVerComentarios((v) => !v);
  };

  return (
    <View
      onLayout={(e) => onPosicion(n.id, e.nativeEvent.layout.y)}
      style={{
        width: "100%",
        maxWidth: 680,
        backgroundColor: "#FFFFFF",
        borderRadius: 22,
        padding: 16,
        gap: 10,
        alignItems: "center",
        shadowColor: "#0B2138",
        shadowOpacity: 0.06,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 6 },
        elevation: 2,
      }}
    >
      {n.imagenes.length ? (
        <CarruselNoticia imagenes={n.imagenes} medidas={n.medidas} titulo={n.titulo} prioritaria={prioritaria} />
      ) : null}

      <Text
        style={{
          color: AZUL_NOTICIAS,
          fontSize: 11,
          fontWeight: "900",
          letterSpacing: 1.2,
          textTransform: "uppercase",
          textAlign: "center",
          marginTop: 2,
        }}
      >
        {n.categoria}
      </Text>

      <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "900", lineHeight: 24, textAlign: "center" }}>
        {n.titulo}
      </Text>

      {meta ? <Text style={{ color: COLORS.soft, fontSize: 12, textAlign: "center" }}>{meta}</Text> : null}

      {/* Resumen completo, siempre visible (sin cortar) */}
      {n.resumen ? (
        <Text style={[estiloTextoNoticia, { maxWidth: 560, marginTop: 2 }]}>{n.resumen}</Text>
      ) : null}

      {/* Resto del desglose: solo al pulsar «Ver más» */}
      {abierta ? (
        <View style={{ width: "100%", alignItems: "center", gap: 18, marginTop: 8 }}>
          {n.puntosClave.length ? (
            <SeccionNoticia titulo="Puntos clave">
              <ListaVinetas items={n.puntosClave} />
            </SeccionNoticia>
          ) : null}

          {n.datos.length ? (
            <SeccionNoticia titulo="Datos concretos">
              <ListaVinetas items={n.datos} />
            </SeccionNoticia>
          ) : null}

          {n.porQueImporta ? (
            <SeccionNoticia titulo="Por qué importa">
              <Text style={estiloTextoNoticia}>{n.porQueImporta}</Text>
            </SeccionNoticia>
          ) : null}

          <Text style={{ color: COLORS.soft, fontSize: 11, textAlign: "center", lineHeight: 16 }}>
            Redactado a partir del texto del artículo original{origen ? ` (${origen})` : ""}
          </Text>

          {n.afectaA ? (
            <SeccionNoticia titulo="Afecta a">
              <Text style={estiloTextoNoticia}>{n.afectaA}</Text>
            </SeccionNoticia>
          ) : null}
        </View>
      ) : null}

      {/* Acciones, siempre visibles y separadas por una línea fina */}
      <View
        style={{
          width: "100%",
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          paddingTop: 14,
          marginTop: 4,
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <BotonNoticia
          onPress={() => onAlternar(n.id)}
          etiqueta={abierta ? "Ver menos" : "Ver más"}
          icono={abierta ? "chevron-up" : "chevron-down"}
          iconoDetras
        />
        <BotonNoticia
          onPress={() => onLike(n.id)}
          etiqueta={meGusta ? "1" : "0"}
          icono={meGusta ? "heart" : "heart-outline"}
          colorIcono={meGusta ? "#E0245E" : undefined}
          accesible={meGusta ? "Quitar me gusta" : "Me gusta"}
        />
        {hayComentarios ? (
          <BotonNoticia
            onPress={alternarComentarios}
            etiqueta={String(numComentarios)}
            icono="chatbubble-outline"
            accesible={verComentarios ? "Ocultar comentarios" : "Comentarios"}
            activo={verComentarios}
          />
        ) : null}
        <BotonNoticia onPress={() => onCompartir(n)} icono="share-social-outline" accesible="Compartir" />
      </View>

      {hayComentarios && verComentarios ? (
        <ComentariosNoticia noticiaId={n.id} isLoggedIn={isLoggedIn} onComentado={onComentado} />
      ) : null}
    </View>
  );
});

// --- Carrusel de imágenes de una noticia ------------------------------------
// Paginado en horizontal, cada foto entera (contain, nunca recortada) en una
// caja con su proporción real y como mucho 320 px de alto. La proporción sale
// de imagenes_meta (al instante, sin descargar la foto); solo si falta se mide
// con Image.getSize, como antes. Las fotos que no cargan o son diminutas
// (iconos, píxeles) se descartan; si no queda ninguna, no se pinta nada (sin
// huecos). Solo se descarga la primera foto; las demás, cuando el carrusel
// llega a ellas (la siguiente se precarga 1,5 s antes de pasar). Pasa sola a
// la siguiente foto cada 5 s (en bucle), se pausa mientras se toca o arrastra
// y, si el sistema pide reducir movimiento, cambia de foto sin animación.

const ALTO_MAX_CARRUSEL = 320;
const PASO_CARRUSEL_MS = 5000;
const PRECARGA_ANTES_MS = 1500;

// «Reducir movimiento» del sistema. Una sola suscripción para todos los
// carruseles (en web, varios oyentes con el mismo código se pisan entre sí).
let reducirMovimientoActual = false;
let reducirMovimientoIniciado = false;
const oyentesMovimiento = new Set<(valor: boolean) => void>();

function iniciarReducirMovimiento() {
  if (reducirMovimientoIniciado) return;
  reducirMovimientoIniciado = true;
  const avisar = (valor: boolean) => {
    reducirMovimientoActual = !!valor;
    oyentesMovimiento.forEach((f) => f(reducirMovimientoActual));
  };
  AccessibilityInfo.isReduceMotionEnabled().then(avisar).catch(() => {});
  AccessibilityInfo.addEventListener("reduceMotionChanged", avisar);
}

function useReducirMovimiento() {
  const [reducir, setReducir] = useState(reducirMovimientoActual);
  useEffect(() => {
    iniciarReducirMovimiento();
    oyentesMovimiento.add(setReducir);
    setReducir(reducirMovimientoActual);
    return () => {
      oyentesMovimiento.delete(setReducir);
    };
  }, []);
  return reducir;
}

// Proporción (ancho/alto) de una foto; 0 = diminuta (icono o píxel de
// seguimiento): se descarta.
function proporcionDe(w: number, h: number): number {
  return w >= 160 && h >= 90 ? w / h : 0;
}

// Proporciones ya conocidas por imagenes_meta. claveMedidas lleva «WxH» (o
// nada) por cada URL de clave, en el mismo orden.
function proporcionesConocidas(clave: string, claveMedidas: string): Record<string, number> {
  const salida: Record<string, number> = {};
  if (!clave) return salida;
  const tamanos = claveMedidas.split("\n");
  clave.split("\n").forEach((uri, i) => {
    const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(tamanos[i] ?? "");
    if (m) salida[uri] = proporcionDe(Number(m[1]), Number(m[2]));
  });
  return salida;
}

function CarruselNoticia({
  imagenes,
  medidas,
  titulo,
  prioritaria,
}: {
  imagenes: string[];
  medidas: Record<string, MedidaFoto>;
  titulo: string;
  prioritaria: boolean;
}) {
  const clave = imagenes.join("\n");
  const claveMedidas = imagenes.map((u) => (medidas[u] ? `${medidas[u].w}x${medidas[u].h}` : "")).join("\n");
  const [ancho, setAncho] = useState(0);
  const [proporciones, setProporciones] = useState<Record<string, number>>(() =>
    proporcionesConocidas(clave, claveMedidas)
  );
  const [pagina, setPagina] = useState(0);
  // Hasta qué foto ha llegado el carrusel: las de después aún no se descargan.
  const [alcanzada, setAlcanzada] = useState(0);
  // Sube al soltar el carrusel: vuelve a contar los 5 s desde ese momento.
  const [reinicio, setReinicio] = useState(0);
  const tocando = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const reducirMovimiento = useReducirMovimiento();

  // Proporción de cada foto: la de imagenes_meta y, solo si falta, Image.getSize.
  useEffect(() => {
    let vivo = true;
    const lista = clave ? clave.split("\n") : [];
    const conocidas = proporcionesConocidas(clave, claveMedidas);
    setProporciones((prev) => {
      const next = { ...conocidas };
      for (const uri of lista) if (!(uri in next) && uri in prev) next[uri] = prev[uri];
      return next;
    });
    for (const uri of lista) {
      if (uri in conocidas) continue;
      Image.getSize(
        uri,
        (w, h) => {
          if (vivo) setProporciones((prev) => ({ ...prev, [uri]: proporcionDe(w, h) }));
        },
        () => {
          if (vivo) setProporciones((prev) => ({ ...prev, [uri]: 0 }));
        }
      );
    }
    return () => {
      vivo = false;
    };
  }, [clave, claveMedidas]);

  // Una foto que no carga (ni la optimizada ni la original) se quita del carrusel.
  const descartar = useCallback((uri: string) => {
    setProporciones((prev) => ({ ...prev, [uri]: 0 }));
  }, []);

  const listas = imagenes.filter((u) => (proporciones[u] ?? 0) > 0);
  const total = listas.length;
  const actual = Math.min(pagina, Math.max(0, total - 1));

  // Caja de cada foto: todo el ancho, salvo si pasaría de 320 px de alto.
  const caja = (uri: string) => {
    const r = proporciones[uri];
    let w = ancho;
    let h = ancho / r;
    if (h > ALTO_MAX_CARRUSEL) {
      h = ALTO_MAX_CARRUSEL;
      w = ALTO_MAX_CARRUSEL * r;
    }
    return { w: Math.round(w), h: Math.round(h) };
  };

  // Foto que toca después, si aún no se ha descargado: se precarga antes de pasar.
  const siguienteIndice = total > 1 ? (actual + 1) % total : -1;
  const precargar =
    ancho > 0 && siguienteIndice > alcanzada
      ? urlFotoNoticia(listas[siguienteIndice], anchoOptimizado(caja(listas[siguienteIndice]).w))
      : "";

  // Avance automático: cada 5 s a la siguiente (y de la última a la primera).
  // Mientras se toca no avanza; al soltar se vuelve a contar desde cero.
  useEffect(() => {
    if (total < 2 || !ancho) return;
    const tPrecarga = precargar
      ? setTimeout(() => {
          ExpoImage.prefetch(precargar, "memory-disk").catch(() => {});
        }, PASO_CARRUSEL_MS - PRECARGA_ANTES_MS)
      : undefined;
    const t = setTimeout(() => {
      if (tocando.current) return;
      const siguiente = (actual + 1) % total;
      setAlcanzada((a) => Math.max(a, siguiente));
      scrollRef.current?.scrollTo({ x: siguiente * ancho, animated: !reducirMovimiento });
      setPagina(siguiente);
    }, PASO_CARRUSEL_MS);
    return () => {
      clearTimeout(t);
      if (tPrecarga) clearTimeout(tPrecarga);
    };
  }, [actual, total, ancho, reinicio, reducirMovimiento, precargar]);

  const pausar = () => {
    tocando.current = true;
  };
  const reanudar = () => {
    tocando.current = false;
    setReinicio((r) => r + 1);
  };

  if (!total) return null;

  const alto = ancho ? Math.max(...listas.map((u) => caja(u).h)) : 0;
  const varias = total > 1;

  const irA = (i: number) => {
    const destino = Math.max(0, Math.min(total - 1, i));
    setAlcanzada((a) => Math.max(a, destino));
    scrollRef.current?.scrollTo({ x: destino * ancho, animated: !reducirMovimiento });
    setPagina(destino);
  };

  return (
    <View
      style={{ width: "100%", alignItems: "center", gap: 10, marginBottom: 4 }}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w && w !== ancho) setAncho(w);
      }}
    >
      {ancho > 0 ? (
        <View
          style={{ width: ancho, height: alto }}
          onTouchStart={pausar}
          onTouchEnd={reanudar}
          onTouchCancel={reanudar}
        >
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScrollBeginDrag={pausar}
            onMomentumScrollEnd={reanudar}
            onScroll={(e) => {
              const x = e.nativeEvent.contentOffset.x;
              const i = Math.round(x / ancho);
              setPagina((prev) => (prev === i ? prev : i));
              // Al empezar a arrastrar hacia una foto, se empieza a descargar.
              const hasta = Math.min(total - 1, Math.ceil(x / ancho - 0.01));
              setAlcanzada((a) => (hasta > a ? hasta : a));
            }}
            style={{ width: ancho, height: alto }}
          >
            {listas.map((uri, i) => {
              const { w, h } = caja(uri);
              return (
                <View
                  key={uri}
                  style={{ width: ancho, height: alto, alignItems: "center", justifyContent: "center" }}
                >
                  <FotoNoticia
                    uri={uri}
                    anchoPedido={anchoOptimizado(w)}
                    estiloCaja={{ width: w, height: h, borderRadius: 16 }}
                    cargar={i <= alcanzada}
                    prioridad={i === 0 ? (prioritaria ? "high" : "normal") : "low"}
                    etiqueta={`Imagen ${i + 1} de ${listas.length}: ${titulo}`}
                    onFallo={descartar}
                  />
                </View>
              );
            })}
          </ScrollView>

          {/* En web (ratón) flechas para pasar de foto */}
          {varias && Platform.OS === "web" ? (
            <>
              {actual > 0 ? <FlechaCarrusel lado="izquierda" onPress={() => irA(actual - 1)} /> : null}
              {actual < listas.length - 1 ? (
                <FlechaCarrusel lado="derecha" onPress={() => irA(actual + 1)} />
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}

      {/* Puntos indicadores (también sirven para saltar a una foto) */}
      {varias ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {listas.map((uri, i) => (
            <Pressable
              key={uri}
              onPress={() => irA(i)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Ver imagen ${i + 1}`}
            >
              <View
                style={{
                  width: i === actual ? 18 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: i === actual ? AZUL_NOTICIAS : COLORS.accentBorder,
                }}
              />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function FlechaCarrusel({ lado, onPress }: { lado: "izquierda" | "derecha"; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={lado === "izquierda" ? "Imagen anterior" : "Imagen siguiente"}
      style={({ pressed }) => ({
        position: "absolute",
        top: "50%",
        marginTop: -17,
        left: lado === "izquierda" ? 8 : undefined,
        right: lado === "derecha" ? 8 : undefined,
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(255,255,255,0.92)",
        opacity: pressed ? 0.7 : 1,
        shadowColor: "#0B2138",
        shadowOpacity: 0.12,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      })}
    >
      <Ionicons
        name={lado === "izquierda" ? "chevron-back" : "chevron-forward"}
        size={18}
        color={AZUL_OSCURO_NOTICIAS}
      />
    </Pressable>
  );
}

// --- Fotos de noticias: versión optimizada, hueco exacto y brillo de carga ---
// Las fotos del bucket «noticias» (las copia api/noticias-gaming.ts) se piden
// en web a la optimización de imágenes de Vercel (vercel.json → "images"):
// /_vercel/image?url=…&w=…&q=72, con el ancho de la lista más cercano al de la
// caja × densidad de píxeles (máx. 1280), en avif/webp si el navegador puede.
// Si falla (p. ej. en local, sin Vercel), se usa la URL original. Las fotos
// antiguas (web del periódico) y las de la app nativa se piden tal cual.

const RE_BUCKET_NOTICIAS =
  /^https:\/\/rgvyvaineyodyxzwootl\.supabase\.co\/storage\/v1\/object\/public\/noticias\//;
const ANCHOS_OPTIMIZADOS = [320, 480, 640, 960, 1280];
const FONDO_CARGA_FOTO = "#F1F6FB";
const FUNDIDO_FOTO_MS = 200;
// Si una foto nunca avisa de que terminó, la barra de carga global se cierra igual.
const AVISO_CARGA_MAX_MS = 20000;

// Ancho de la lista más cercano al de la caja en píxeles reales (máx. 1280).
function anchoOptimizado(anchoCaja: number): number {
  const objetivo = Math.min(1280, anchoCaja * (PixelRatio.get() || 1));
  let mejor = ANCHOS_OPTIMIZADOS[0];
  for (const a of ANCHOS_OPTIMIZADOS) {
    if (Math.abs(a - objetivo) <= Math.abs(mejor - objetivo)) mejor = a;
  }
  return mejor;
}

// URL que se pinta: la optimizada (solo en web y solo fotos de nuestro bucket) o la original.
function urlFotoNoticia(url: string, ancho: number): string {
  if (Platform.OS !== "web" || !RE_BUCKET_NOTICIAS.test(url)) return url;
  return `/_vercel/image?url=${encodeURIComponent(url)}&w=${ancho}&q=72`;
}

// Brillo de carga: una sola animación compartida por todos los huecos.
const brilloCarga = new Animated.Value(0);
let usosBrillo = 0;
let animacionBrillo: Animated.CompositeAnimation | null = null;

function useBrilloCarga(activo: boolean) {
  useEffect(() => {
    if (!activo) return;
    usosBrillo++;
    if (!animacionBrillo) {
      brilloCarga.setValue(0);
      animacionBrillo = Animated.loop(
        Animated.timing(brilloCarga, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== "web",
        })
      );
      animacionBrillo.start();
    }
    return () => {
      usosBrillo = Math.max(0, usosBrillo - 1);
      if (!usosBrillo && animacionBrillo) {
        animacionBrillo.stop();
        animacionBrillo = null;
      }
    };
  }, [activo]);
}

// Hueco gris azulado muy claro del tamaño exacto de la foto, con un brillo
// suave que lo cruza mientras carga (sin brillo si se pide reducir movimiento).
function HuecoFoto({ brillo }: { brillo: boolean }) {
  const [ancho, setAncho] = useState(0);
  useBrilloCarga(brillo && ancho > 0);
  const franja = Math.max(60, Math.round(ancho * 0.45));
  return (
    <View
      pointerEvents="none"
      onLayout={(e) => setAncho(Math.round(e.nativeEvent.layout.width))}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: FONDO_CARGA_FOTO,
        overflow: "hidden",
      }}
    >
      {brillo && ancho > 0 ? (
        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: franja,
            transform: [
              { translateX: brilloCarga.interpolate({ inputRange: [0, 1], outputRange: [-franja, ancho] }) },
            ],
          }}
        >
          <LinearGradient
            colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.7)", "rgba(255,255,255,0)"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

// Avisa a la barra de carga global (lib/loadingBus) mientras la foto se
// descarga, igual que SmartImage.
function useAvisoCargaFoto(activo: boolean, clave: string) {
  useEffect(() => {
    if (!activo) return;
    let abierto = true;
    markStart();
    const cerrar = () => {
      if (!abierto) return;
      abierto = false;
      markEnd();
    };
    const t = setTimeout(cerrar, AVISO_CARGA_MAX_MS);
    return () => {
      clearTimeout(t);
      cerrar();
    };
  }, [activo, clave]);
}

// Una foto de noticia (entera, sin recortar) en una caja de tamaño fijo: hueco
// con brillo mientras carga, fundido corto al aparecer, caché en memoria y
// disco, versión optimizada en web y, si falla, la URL original; si también
// falla, avisa con onFallo. cargar = false: solo el hueco (aún no se descarga).
function FotoNoticia({
  uri,
  anchoPedido,
  estiloCaja,
  cargar = true,
  prioridad = "normal",
  etiqueta,
  onFallo,
}: {
  uri: string;
  // Ancho que se pide a la optimización (uno de ANCHOS_OPTIMIZADOS).
  anchoPedido: number;
  estiloCaja: ViewStyle;
  cargar?: boolean;
  prioridad?: "low" | "normal" | "high";
  etiqueta: string;
  onFallo?: (uri: string) => void;
}) {
  const reducirMovimiento = useReducirMovimiento();
  const [original, setOriginal] = useState(false);
  const [estado, setEstado] = useState<"cargando" | "fundido" | "lista" | "fallida">("cargando");
  const fuente = original ? uri : urlFotoNoticia(uri, anchoPedido);
  const cargando = cargar && estado === "cargando";
  useAvisoCargaFoto(cargando, fuente);

  // Tras el fundido se quita el hueco (por si la foto tiene transparencias).
  useEffect(() => {
    if (estado !== "fundido") return;
    const t = setTimeout(() => setEstado("lista"), FUNDIDO_FOTO_MS + 80);
    return () => clearTimeout(t);
  }, [estado]);

  return (
    <View style={[{ overflow: "hidden", backgroundColor: "#FFFFFF" }, estiloCaja]}>
      {estado !== "lista" ? <HuecoFoto brillo={cargando && !reducirMovimiento} /> : null}
      {cargar && estado !== "fallida" ? (
        <ExpoImage
          source={{ uri: fuente }}
          style={{ width: "100%", height: "100%" }}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={reducirMovimiento ? 0 : FUNDIDO_FOTO_MS}
          priority={prioridad}
          recyclingKey={fuente}
          accessibilityLabel={etiqueta}
          onLoad={() => setEstado((e) => (e === "cargando" ? "fundido" : e))}
          onError={() => {
            // La optimizada falla: se prueba con la original.
            if (!original && fuente !== uri) {
              setOriginal(true);
              return;
            }
            setEstado("fallida");
            onFallo?.(uri);
          }}
        />
      ) : null}
    </View>
  );
}

const estiloTextoNoticia = {
  color: COLORS.text,
  fontSize: 15,
  lineHeight: 23,
  textAlign: "center" as const,
};

function SeccionNoticia({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <View style={{ width: "100%", maxWidth: 560, alignItems: "center", gap: 8 }}>
      <Text
        style={{
          color: AZUL_NOTICIAS,
          fontSize: 11,
          fontWeight: "900",
          letterSpacing: 1.2,
          textTransform: "uppercase",
          textAlign: "center",
        }}
      >
        {titulo}
      </Text>
      {children}
    </View>
  );
}

function ListaVinetas({ items }: { items: string[] }) {
  return (
    <View style={{ alignItems: "center", gap: 8, width: "100%" }}>
      {items.map((t, i) => (
        <View key={`${i}-${t.slice(0, 12)}`} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, maxWidth: "100%" }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: AZUL_NOTICIAS, marginTop: 9 }} />
          <Text style={[estiloTextoNoticia, { flexShrink: 1 }]}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

function BotonNoticia({
  onPress,
  etiqueta,
  icono,
  colorIcono,
  iconoDetras,
  accesible,
  activo,
}: {
  onPress: () => void;
  etiqueta?: string;
  icono: React.ComponentProps<typeof Ionicons>["name"];
  colorIcono?: string;
  iconoDetras?: boolean;
  accesible?: string;
  // Resaltado suave (p. ej. comentarios abiertos).
  activo?: boolean;
}) {
  const icon = <Ionicons name={icono} size={15} color={colorIcono ?? AZUL_OSCURO_NOTICIAS} />;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accesible ?? etiqueta}
      accessibilityState={activo === undefined ? undefined : { expanded: activo }}
      style={({ pressed }) => ({
        opacity: pressed ? 0.7 : 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: COLORS.accentBorder,
        backgroundColor: activo ? COLORS.accentSoft : "transparent",
        paddingVertical: 8,
        paddingHorizontal: 14,
      })}
    >
      {!iconoDetras ? icon : null}
      {etiqueta ? (
        <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13 }}>{etiqueta}</Text>
      ) : null}
      {iconoDetras ? icon : null}
    </Pressable>
  );
}

// --- Comentarios de una noticia ---------------------------------------------
// Se abren bajo la tarjeta. Leer es público (noticias_comentarios); escribir
// pide sesión. El autor es el mismo nombre visible que usa el Foro.

type ComentarioNoticia = { id: string; created_at: string; autor: string; texto: string };

const MAX_COMENTARIO = 1000;

function ComentariosNoticia({
  noticiaId,
  isLoggedIn,
  onComentado,
}: {
  noticiaId: string;
  isLoggedIn: boolean;
  onComentado: (id: string) => void;
}) {
  const [lista, setLista] = useState<ComentarioNoticia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    (async () => {
      const { data, error: fallo } = await supabase
        .from("noticias_comentarios")
        .select("id,created_at,autor,texto")
        .eq("noticia_id", noticiaId)
        .eq("oculto", false)
        .order("created_at", { ascending: true })
        .limit(200);
      if (!vivo.current) return;
      if (fallo) setError("No se pudieron cargar los comentarios.");
      else setLista((data ?? []) as ComentarioNoticia[]);
      setCargando(false);
    })();
    return () => {
      vivo.current = false;
    };
  }, [noticiaId]);

  const limpio = texto.trim();
  const puedeEnviar = limpio.length >= 1 && limpio.length <= MAX_COMENTARIO && !enviando;

  const enviar = async () => {
    if (!puedeEnviar) return;
    setEnviando(true);
    setError(null);
    try {
      const { data: sesion } = await supabase.auth.getSession();
      const user = sesion.session?.user;
      if (!user) {
        setError("Inicia sesión para comentar.");
        return;
      }
      const { data, error: fallo } = await supabase
        .from("noticias_comentarios")
        .insert({ noticia_id: noticiaId, autor: nombreVisibleForo(user), texto: limpio })
        .select("id,created_at,autor,texto")
        .single();
      if (fallo) throw fallo;
      if (!vivo.current) return;
      setLista((prev) => [...prev, data as ComentarioNoticia]);
      setTexto("");
      onComentado(noticiaId);
    } catch (e) {
      console.error("Error enviando el comentario:", e);
      if (vivo.current) setError("No se pudo enviar el comentario. Inténtalo de nuevo.");
    } finally {
      if (vivo.current) setEnviando(false);
    }
  };

  return (
    <View style={{ width: "100%", maxWidth: 560, gap: 10, marginTop: 4 }}>
      <Text
        style={{
          color: AZUL_NOTICIAS,
          fontSize: 11,
          fontWeight: "900",
          letterSpacing: 1.2,
          textTransform: "uppercase",
          textAlign: "center",
        }}
      >
        Comentarios
      </Text>

      {cargando ? (
        <ActivityIndicator color={AZUL_NOTICIAS} style={{ marginVertical: 8 }} />
      ) : lista.length === 0 && !error ? (
        <Text style={{ color: COLORS.muted, textAlign: "center", fontSize: 14 }}>
          Todavía no hay comentarios. ¡Sé el primero!
        </Text>
      ) : (
        lista.map((c) => (
          <View
            key={c.id}
            style={{
              backgroundColor: COLORS.bg3,
              borderRadius: 16,
              paddingVertical: 10,
              paddingHorizontal: 14,
              gap: 4,
            }}
          >
            <Text numberOfLines={1} style={{ color: COLORS.soft, fontSize: 12 }}>
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>{c.autor}</Text>
              {` · ${haceTiempo(c.created_at)}`}
            </Text>
            <Text style={{ color: COLORS.text, fontSize: 15, lineHeight: 21 }}>{c.texto}</Text>
          </View>
        ))
      )}

      {error ? (
        <Text style={{ color: "#B91C1C", fontSize: 13, fontWeight: "700", textAlign: "center" }}>
          {error}
        </Text>
      ) : null}

      {isLoggedIn ? (
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
            <TextInput
              value={texto}
              onChangeText={setTexto}
              placeholder="Escribe un comentario…"
              placeholderTextColor="rgba(11,33,56,0.4)"
              maxLength={MAX_COMENTARIO}
              multiline
              editable={!enviando}
              accessibilityLabel="Escribe un comentario"
              style={{
                flex: 1,
                minHeight: 44,
                maxHeight: 120,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: "#FFFFFF",
                color: COLORS.text,
                // 16 px: evita el zoom automático de Safari en iOS.
                fontSize: 16,
                paddingHorizontal: 14,
                paddingVertical: 11,
              }}
            />
            <Pressable
              onPress={enviar}
              disabled={!puedeEnviar}
              accessibilityRole="button"
              accessibilityLabel="Enviar comentario"
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: puedeEnviar ? AZUL_NOTICIAS : "#DCE6EF",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              {enviando ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Ionicons name="send" size={17} color={puedeEnviar ? "#FFFFFF" : "#8FA3B8"} />
              )}
            </Pressable>
          </View>
          {texto.length > MAX_COMENTARIO - 100 ? (
            <Text style={{ color: COLORS.soft, fontSize: 11, textAlign: "right" }}>
              {`${texto.length}/${MAX_COMENTARIO}`}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={{ alignItems: "center", gap: 10, paddingVertical: 4 }}>
          <Text style={{ color: COLORS.muted, textAlign: "center", fontSize: 14 }}>
            Inicia sesión para comentar
          </Text>
          <Pressable
            onPress={() => router.push("/perfil?aviso=Inicia%20sesión%20para%20comentar" as Href)}
            accessibilityRole="button"
            style={({ pressed }) => ({
              opacity: pressed ? 0.85 : 1,
              borderRadius: 999,
              paddingVertical: 10,
              paddingHorizontal: 20,
              backgroundColor: AZUL_NOTICIAS,
            })}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Iniciar sesión</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// --- Menú «Compartir» de una noticia ----------------------------------------
// Dos opciones: publicarla en el Foro (con sesión) o compartir el enlace a la
// noticia dentro de la tienda por otras apps.

function MenuCompartirNoticia({
  noticia,
  isLoggedIn,
  onCerrar,
  onCompartirEnForo,
}: {
  noticia: Noticia | null;
  isLoggedIn: boolean;
  onCerrar: () => void;
  onCompartirEnForo: (n: Noticia) => Promise<boolean>;
}) {
  const [enviando, setEnviando] = useState(false);
  const [nota, setNota] = useState<{ texto: string; bien: boolean } | null>(null);
  const cierre = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setEnviando(false);
    setNota(null);
  }, [noticia]);

  useEffect(
    () => () => {
      if (cierre.current) clearTimeout(cierre.current);
    },
    []
  );

  const alForo = async () => {
    if (!noticia || enviando) return;
    if (!isLoggedIn) {
      // Sin sesión: se cierra el menú y se pide iniciar sesión.
      onCerrar();
      onCompartirEnForo(noticia);
      return;
    }
    setEnviando(true);
    setNota(null);
    const ok = await onCompartirEnForo(noticia);
    // Si sale bien se abre el Foro y este menú desaparece con la pestaña.
    if (!ok) {
      setEnviando(false);
      setNota({ texto: "No se pudo compartir en el Foro. Inténtalo de nuevo.", bien: false });
    }
  };

  const alExterior = async () => {
    if (!noticia) return;
    const resultado = await compartirFuera(noticia);
    if (resultado === "copiado") {
      setNota({ texto: "Enlace copiado", bien: true });
      if (cierre.current) clearTimeout(cierre.current);
      cierre.current = setTimeout(onCerrar, 1200);
      return;
    }
    onCerrar();
  };

  return (
    <Modal transparent visible={!!noticia} animationType="fade" onRequestClose={onCerrar}>
      <Pressable
        onPress={onCerrar}
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
            maxWidth: 380,
            backgroundColor: "#FFFFFF",
            borderRadius: 24,
            padding: 20,
            gap: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "900", textAlign: "center" }}>
            Compartir noticia
          </Text>
          {noticia ? (
            <Text
              numberOfLines={2}
              style={{ color: COLORS.muted, fontSize: 13, lineHeight: 18, textAlign: "center" }}
            >
              {noticia.titulo}
            </Text>
          ) : null}

          <OpcionMenu
            icono="chatbubbles-outline"
            texto="Compartir en el Foro"
            detalle={isLoggedIn ? "Para hablar de ella con la comunidad" : "Necesitas iniciar sesión"}
            onPress={alForo}
            cargando={enviando}
          />
          <OpcionMenu
            icono="share-outline"
            texto="Compartir fuera"
            detalle="Enviar el enlace por otras apps"
            onPress={alExterior}
          />

          {nota ? (
            <Text
              style={{
                color: nota.bien ? "#15803D" : "#B91C1C",
                fontSize: 13,
                fontWeight: "800",
                textAlign: "center",
              }}
            >
              {nota.texto}
            </Text>
          ) : null}

          <Pressable
            onPress={onCerrar}
            hitSlop={6}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, paddingVertical: 6, paddingHorizontal: 12 })}
          >
            <Text style={{ color: COLORS.muted, fontWeight: "800" }}>Cancelar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function OpcionMenu({
  icono,
  texto,
  detalle,
  onPress,
  cargando,
}: {
  icono: React.ComponentProps<typeof Ionicons>["name"];
  texto: string;
  detalle?: string;
  onPress: () => void;
  cargando?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={cargando}
      accessibilityRole="button"
      accessibilityLabel={texto}
      style={({ pressed }) => ({
        width: "100%",
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.accentBorder,
        backgroundColor: pressed ? COLORS.accentSoft : "#FFFFFF",
        paddingVertical: 12,
        paddingHorizontal: 14,
      })}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: COLORS.accentSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {cargando ? (
          <ActivityIndicator color={AZUL_NOTICIAS} />
        ) : (
          <Ionicons name={icono} size={18} color={AZUL_OSCURO_NOTICIAS} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 15 }}>{texto}</Text>
        {detalle ? (
          <Text style={{ color: COLORS.soft, fontSize: 12, marginTop: 2 }}>{detalle}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// --- Mini tarjeta de noticia dentro del Foro ---------------------------------
// Sustituye al texto crudo de los mensajes con [noticia:<id>]. «Leer noticia»
// abre Noticias Gaming con esa noticia desplegada. Mientras carga (o si ya no
// existe) se ve el texto del mensaje sin la marca.

function TarjetaNoticiaForo({
  noticia,
  texto,
  onLeer,
}: {
  // undefined = cargando; null = ya no está disponible.
  noticia: NoticiaMini | null | undefined;
  texto: string;
  onLeer: () => void;
}) {
  // Foto que no carga (ni la pequeña optimizada ni la original): se quita.
  const [fotoFallida, setFotoFallida] = useState<string | null>(null);
  const boton = (
    <Pressable
      onPress={onLeer}
      accessibilityRole="button"
      accessibilityLabel="Leer noticia"
      style={({ pressed }) => ({
        opacity: pressed ? 0.85 : 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        paddingVertical: 8,
        paddingHorizontal: 16,
        backgroundColor: AZUL_NOTICIAS,
        alignSelf: "center",
      })}
    >
      <Ionicons name="newspaper-outline" size={14} color="#FFFFFF" />
      <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 13 }}>Leer noticia</Text>
    </Pressable>
  );

  if (!noticia) {
    return (
      <View style={{ gap: 8 }}>
        <Text style={{ color: COLORS.text, lineHeight: 22 }}>{texto || "📰 Noticia"}</Text>
        {noticia === null ? (
          <Text style={{ color: COLORS.soft, fontSize: 12 }}>Esta noticia ya no está disponible.</Text>
        ) : (
          boton
        )}
      </View>
    );
  }

  return (
    <View
      style={{
        width: "100%",
        minWidth: 240,
        maxWidth: 380,
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        overflow: "hidden",
      }}
    >
      {noticia.imagen && noticia.imagen !== fotoFallida ? (
        // Versión pequeña (w=320): la tarjeta mide como mucho 380 px.
        <FotoNoticia
          key={noticia.imagen}
          uri={noticia.imagen}
          anchoPedido={320}
          estiloCaja={{ width: "100%", aspectRatio: 16 / 9 }}
          prioridad="low"
          etiqueta={noticia.titulo}
          onFallo={setFotoFallida}
        />
      ) : null}
      <View style={{ padding: 12, gap: 6, alignItems: "center" }}>
        <Text
          style={{
            color: AZUL_NOTICIAS,
            fontSize: 10,
            fontWeight: "900",
            letterSpacing: 1.1,
            textTransform: "uppercase",
            textAlign: "center",
          }}
        >
          {noticia.categoria}
        </Text>
        <Text
          numberOfLines={3}
          style={{ color: COLORS.text, fontSize: 15, fontWeight: "900", lineHeight: 20, textAlign: "center" }}
        >
          {noticia.titulo}
        </Text>
        <View style={{ marginTop: 4 }}>{boton}</View>
      </View>
    </View>
  );
}

// --- Campana de Noticias Gaming: avisos y consentimiento comercial -----------
// Interruptor de avisos (para las notificaciones de Blue) y, aparte e
// independiente, la casilla de comunicaciones comerciales. Con sesión se
// guardan en preferencias_usuario; sin sesión los avisos van al dispositivo y
// la casilla pide iniciar sesión.

function AvisosNoticiasModal({
  visible,
  onClose,
  isLoggedIn,
  avisos,
  marketing,
  marketingDisponible,
  onCambiarAvisos,
  onCambiarMarketing,
}: {
  visible: boolean;
  onClose: () => void;
  isLoggedIn: boolean;
  avisos: boolean;
  marketing: boolean;
  // false si la tabla preferencias_usuario aún no existe: se oculta la casilla.
  marketingDisponible: boolean;
  onCambiarAvisos: (valor: boolean) => Promise<boolean>;
  onCambiarMarketing: (valor: boolean) => Promise<boolean>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [pideSesion, setPideSesion] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setPideSesion(false);
  }, [visible]);

  const alternarAvisos = async (valor: boolean) => {
    setError(null);
    const ok = await onCambiarAvisos(valor);
    if (!ok) setError("No se pudo guardar. Inténtalo de nuevo.");
  };

  const alternarMarketing = async () => {
    if (!isLoggedIn) {
      setPideSesion(true);
      return;
    }
    if (guardando) return;
    setGuardando(true);
    setError(null);
    const ok = await onCambiarMarketing(!marketing);
    setGuardando(false);
    if (!ok) setError("No se pudo guardar. Inténtalo de nuevo.");
  };

  const irAIniciarSesion = () => {
    onClose();
    router.push("/perfil?aviso=Inicia%20sesión%20para%20recibir%20ofertas" as Href);
  };

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
            maxWidth: 420,
            backgroundColor: "#FFFFFF",
            borderRadius: 24,
            padding: 22,
            gap: 16,
            alignItems: "center",
          }}
        >
          <Ionicons name={avisos ? "notifications" : "notifications-outline"} size={26} color={AZUL_NOTICIAS} />
          <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "900", textAlign: "center" }}>
            Avisos de noticias
          </Text>

          <View style={{ width: "100%", flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 15 }}>
                Avisarme de noticias nuevas
              </Text>
              <Text style={{ color: COLORS.muted, fontSize: 13, lineHeight: 18, marginTop: 2 }}>
                Aparecerán en las notificaciones de Blue, el asistente flotante.
              </Text>
            </View>
            <Switch
              value={avisos}
              onValueChange={alternarAvisos}
              trackColor={{ false: "#DCE6EF", true: AZUL_NOTICIAS }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#DCE6EF"
              accessibilityLabel="Avisarme de noticias nuevas"
            />
          </View>

          {marketingDisponible ? (
            <View
              style={{
                width: "100%",
                borderTopWidth: 1,
                borderTopColor: COLORS.border,
                paddingTop: 16,
                gap: 8,
              }}
            >
              <Pressable
                onPress={alternarMarketing}
                disabled={guardando}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: marketing, disabled: guardando }}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 10,
                  opacity: pressed || guardando ? 0.7 : 1,
                })}
              >
                <Ionicons
                  name={marketing ? "checkbox" : "square-outline"}
                  size={22}
                  color={AZUL_NOTICIAS}
                />
                <Text style={{ flex: 1, color: COLORS.text, fontSize: 14, lineHeight: 20 }}>
                  Acepto recibir ofertas y novedades comerciales de VideojuegosZaragoza.com
                </Text>
              </Pressable>
              <Text style={{ color: COLORS.soft, fontSize: 11, marginLeft: 32 }}>
                Puedes retirarlo cuando quieras desde aquí
              </Text>

              {pideSesion ? (
                <View style={{ alignItems: "center", gap: 8, marginTop: 4 }}>
                  <Text style={{ color: COLORS.muted, fontSize: 13, textAlign: "center" }}>
                    Inicia sesión para aceptar las comunicaciones comerciales.
                  </Text>
                  <Pressable
                    onPress={irAIniciarSesion}
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.85 : 1,
                      borderRadius: 999,
                      paddingVertical: 9,
                      paddingHorizontal: 18,
                      backgroundColor: AZUL_NOTICIAS,
                    })}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Iniciar sesión</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}

          {error ? (
            <Text style={{ color: "#B91C1C", fontSize: 13, fontWeight: "700", textAlign: "center" }}>
              {error}
            </Text>
          ) : null}

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            style={({ pressed }) => ({
              opacity: pressed ? 0.9 : 1,
              borderRadius: 999,
              paddingVertical: 10,
              paddingHorizontal: 26,
              backgroundColor: AZUL_OSCURO_NOTICIAS,
            })}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>Listo</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
