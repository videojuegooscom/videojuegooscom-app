/**
 * Archivo: app/(tabs)/chat-global.tsx
 * Función: pantalla «Foro» (pestaña del Foro), en la dirección /chat-global (admite ?tab= y ?noticia=).
 * Para qué sirve: el cliente lee noticias gaming y comenta, participa en el chat público en tiempo real y, con sesión, ve su bandeja privada de conversaciones con la tienda; Novedades y Torneos aún dicen «Próximamente».
 * Conectado con: components/foro/NoticiasForo.tsx (pestaña Noticias, mini tarjeta y campana) y components/foro/PiezasForo.tsx (piezas comunes), separados en la tanda 6; lib/supabase.ts (tablas chat_messages, noticias_gaming, noticias_likes, noticias_comentarios, preferencias_usuario; Realtime), lib/analiticaPropia.ts, lib/estadoCarga.ts, constants/temaTienda.ts, components/PerfilPublico.tsx, ImagenInteligente.tsx, components/marca/*; api/noticias-gaming.ts; app/chat/[chatId].tsx y app/noticias/[id].tsx (enlaces).
 * Utilizado por: Expo Router (dirección /chat-global, pestaña de app/(tabs)/_layout.tsx); la abre también app/noticias/[id].tsx («Comentar en el Foro»).
 * Dependencias: react, react-native, expo-router, @expo/vector-icons, expo-image, expo-linear-gradient, @react-native-async-storage/async-storage.
 * Estado: ACTIVO
 */
/**
 * Notas:
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
 * sql/product_chats.sql y components/ConversacionProducto.tsx. No tiene nada
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
 * - "Noticias Gaming" (NoticiasGamingPanel, en components/foro/NoticiasForo.tsx) lee la
 *   tabla noticias_gaming y, en segundo plano, llama a api/noticias-gaming.ts
 *   para que busque y resuma noticias nuevas si toca. Cada tarjeta muestra un
 *   carrusel de imágenes sin recortes (CarruselNoticia, pasa solo cada 5 s),
 *   el resumen completo y los botones Ver más / Like / Comentarios /
 *   Compartir. Los «me gusta» van en noticias_likes (1 por noticia y cuenta;
 *   el total, en noticias_gaming.me_gusta). Los comentarios viven en noticias_comentarios; "Compartir en
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
 * - Moderación: un administrador toca un mensaje y, en el selector de
 *   reacciones, tiene una papelera «Eliminar mensaje»; tras confirmarlo
 *   (ConfirmarEliminar) se borra de chat_messages (solo los administradores
 *   pueden, por su política) y desaparece al momento para todos (evento
 *   DELETE en tiempo real). Los comentarios de noticias tienen su papelera
 *   para administradores y se ocultan (oculto = true). Administración →
 *   Usuarios cuenta lo eliminado («Moderación del Foro»).
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
 * - Tamaños (grupo 2 de la auditoría móvil, 2026-11-12): letra mínima 13
 *   (TAMANOS), todo lo que se toca mide 44 px (TACTIL: «viendo ahora», la
 *   campanita, «Abrir la noticia», me gusta/comentarios, reacciones…) y los
 *   campos 16 px y 48 de alto (CAMPO). Grises de texto COLORES_TEXTO.secundario
 *   y el texto azul pequeño (categorías, enlaces) en COLORS.accentText
 *   (#0A78B4); el azul de marca sigue en botones, iconos y fondos.
 *
 * Conectado con:
 * - constants/temaTienda.ts → TAMANOS, TACTIL, CAMPO y COLORES_TEXTO.
 * - pruebas/perfil-datos.mjs (sección TM2) → comprueba esos tamaños.
 * - lib/supabase.ts → sesión, lectura y envío de mensajes.
 * - sql/chat_messages.sql → crea la tabla, el trigger que rellena el
 *   remitente y las políticas RLS (leer: todo el mundo; escribir: solo
 *   sesión iniciada) del Foro público.
 * - sql/product_chats.sql, components/ConversacionProducto.tsx → la pestaña
 *   "Chat" (bandeja privada por producto).
 * - app/chat/[chatId].tsx → a donde lleva cada conversación de la bandeja.
 * - app/noticias/[id].tsx → página propia de cada noticia: «Abrir la noticia» en cada tarjeta y el
 *   enlace que se comparte (URL_NOTICIA_TIENDA); su «Comentar en el Foro» vuelve aquí con ?noticia=.
 * - app/(tabs)/perfil.tsx (el modal de "inicia sesión" navega ahí; también
 *   es donde se registran full_name/username que el trigger usa para
 *   mostrar el nombre de cada mensaje).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Image, LayoutAnimation, Modal, PanResponder, Platform, Pressable, SafeAreaView, ScrollView, StatusBar, Text, TextInput, UIManager, useWindowDimensions, View } from "react-native";
import { perfilesPublicos, type PerfilForo } from "../../components/PerfilPublico";
import { CAMPO, TACTIL, TAMANOS } from "../../constants/temaTienda";
import { supabase } from "../../lib/supabase";
import { AvatarCircle, COLORS, ConfirmarEliminar, EnlaceNormasForo, NOTICIAS_AVISOS_KEY, NOVEDADES_CONTENT_VERSION, NOVEDADES_SEEN_KEY, SilenciarUsuario, faltaTabla, faltaTablaSilencios, guardarPreferencias, idNoticiaDeTexto, isMissingRelationError, leerAvisosDispositivo, tablaPreferencias, textoSilencio, textoSinMarca, useEsAdminForo } from "../../components/foro/PiezasForo";
import { AvisosNoticiasModal, Noticia, NoticiaMini, NoticiasGamingPanel, TarjetaNoticiaForo, leerNoticiasMini } from "../../components/foro/NoticiasForo";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type MessageItem = {
  id: string;
  type: "message" | "gif" | "system";
  userId: string;
  // username es el que guardó el trigger al escribir (si la persona no tenía
  // usuario, es la parte de su email antes de la @): por eso NO se muestra.
  // Lo que se enseña es displayName: el usuario de «Mi perfil» cuando lo hay
  // (perfilesPublicos, components/PerfilPublico.tsx) y, si no, el nombre.
  username: string;
  displayName: string;
  // Foto de «Mi perfil» (si tiene); sin ella, la inicial.
  foto?: string;
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

// Orden de las pestañas que elige cada persona (mantener pulsada y arrastrar). Se guarda en el
// dispositivo; si falta alguna pestaña o hay una desconocida, se usa el orden de siempre.
const ORDEN_TABS_KEY = "videojuegoszaragoza:foro_orden_pestanas";
// La pista «Mantén pulsada una pestaña para moverla» sale UNA sola vez por dispositivo (la
// primera vez que se abre el desplegable); después ya no vuelve.
const PISTA_ORDEN_KEY = "videojuegoszaragoza:foro_pista_orden_vista";

function ordenarTabs(orden: string[] | null): { key: HubTab; label: string }[] {
  if (!orden) return TAB_ITEMS;
  const validas = orden.filter((k) => TAB_ITEMS.some((t) => t.key === k));
  const faltan = TAB_ITEMS.filter((t) => !validas.includes(t.key));
  return [...validas.map((k) => TAB_ITEMS.find((t) => t.key === k)!), ...faltan];
}

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

export default function ChatGlobalScreen() {
  // Permite llegar directamente a una pestaña concreta, p. ej. desde la
  // campanita (components/AsistenteBlue.tsx) con /chat-global?tab=privados, o a
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
  const [preferenciasEnNube, setPreferenciasEnNube] = useState(tablaPreferencias.disponible);
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
  // Si un administrador ha silenciado a esta persona en el Foro: hasta cuándo (null = no está silenciada). Se avisa
  // junto al cuadro de escribir; quien de verdad lo impide es la base de datos.
  const [miSilencio, setMiSilencio] = useState<string | null>(null);
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

  // Usuario y foto de «Mi perfil» de quien escribe (se piden solo los que faltan; si la función de la base de datos aún no
  // existe, no llega nada y se ve el nombre con la inicial, como antes).
  const [perfilesForo, setPerfilesForo] = useState<Record<string, PerfilForo>>({});
  useEffect(() => {
    const ids = messages.map((m) => m.userId);
    if (!ids.length) return;
    let vivo = true;
    perfilesPublicos(ids)
      .then((encontrados) => {
        if (!vivo) return;
        setPerfilesForo((prev) => {
          let cambia = false;
          const sig = { ...prev };
          for (const [id, p] of encontrados) {
            if (prev[id]?.usuario === p.usuario && prev[id]?.foto === p.foto) continue;
            sig[id] = p;
            cambia = true;
          }
          return cambia ? sig : prev;
        });
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [messages]);
  const mensajesConPerfil = useMemo(
    () =>
      messages.map((m) => {
        const p = perfilesForo[m.userId];
        return p ? { ...m, displayName: p.usuario, foto: p.foto || undefined } : m;
      }),
    [messages, perfilesForo]
  );

  const visibleMessages = useMemo(
    () => mensajesConPerfil.filter((message) => message.type !== "system"),
    [mensajesConPerfil]
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

  // ¿Está silenciada esta persona en el Foro? (solo ve su propia fila; sin la tabla, nada)
  useEffect(() => {
    if (!currentUserId) {
      setMiSilencio(null);
      return;
    }
    let vivo = true;
    Promise.resolve(supabase.from("foro_silencios").select("hasta").eq("user_id", currentUserId).maybeSingle<{ hasta: string }>())
      .then(({ data }) => {
        if (!vivo) return;
        const hasta = data?.hasta ?? null;
        setMiSilencio(hasta && new Date(hasta).getTime() > Date.now() ? hasta : null);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [currentUserId]);

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

      if (!tablaPreferencias.disponible) {
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
          tablaPreferencias.disponible = false;
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
          tablaPreferencias.disponible = false;
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

  // Un mensaje eliminado (por un administrador, aquí o en otro dispositivo) se
  // quita de la lista con sus reacciones; las respuestas a él se quedan sin cita
  // (como en la base de datos: reply_to_id pasa a vacío).
  const quitarMensaje = useCallback((id: string) => {
    setMessages((prev) =>
      prev.some((m) => m.id === id || m.replyToId === id)
        ? prev.filter((m) => m.id !== id).map((m) => (m.replyToId === id ? { ...m, replyToId: null } : m))
        : prev
    );
    setReactionRows((prev) => (prev.some((r) => r.message_id === id) ? prev.filter((r) => r.message_id !== id) : prev));
    setReplyTarget((prev) => (prev?.id === id ? null : prev));
  }, []);

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
        // Nombre propio en cada suscripción: si se pide uno igual mientras el anterior se cierra (volver rápido a la
        // pestaña), Supabase devuelve el que se está cerrando y se dejan de recibir mensajes (2026-11-18).
        .channel(`chat_messages_live_${Math.random().toString(36).slice(2, 10)}`)
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
          { event: "DELETE", schema: "public", table: "chat_messages" },
          (payload) => {
            if (!active) return;
            const id = (payload.old as { id?: string } | null)?.id;
            if (id) quitarMensaje(id);
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
    }, [quitarMensaje])
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
  // contenido como "vista" — así la campanita (components/AsistenteBlue.tsx)
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
    if (miSilencio && new Date(miSilencio).getTime() > Date.now()) {
      setSendError(textoSilencio(miSilencio));
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
      // 42501 = la base de datos no lo deja: la persona está silenciada en el Foro.
      if (mountedRef.current) {
        setSendError(
          String(e?.code ?? "") === "42501"
            ? "Ahora mismo no puedes escribir en el Foro: un administrador te ha silenciado durante unos días."
            : "No se pudo enviar el mensaje. Inténtalo de nuevo."
        );
      }
    } finally {
      if (mountedRef.current) setSending(false);
    }
  }, [draft, isLoggedIn, replyTarget, miSilencio]);

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

  // Administradores: tocar un mensaje → «Eliminar» (en el selector de reacciones) → confirmar. Se borra de verdad en la
  // base de datos (solo se lo permite a ellos) y desaparece para todos al momento (tiempo real).
  const esAdmin = useEsAdminForo();
  // «Silenciar usuario»: solo si ya existe la tabla de silencios (migración aplicada).
  const [silenciosDisponibles, setSilenciosDisponibles] = useState(false);
  const [aSilenciar, setASilenciar] = useState<MessageItem | null>(null);
  useEffect(() => {
    if (!esAdmin) {
      setSilenciosDisponibles(false);
      return;
    }
    let vivo = true;
    // (una lectura normal, no «head»: sin cuerpo no se sabría si falta la tabla)
    Promise.resolve(supabase.from("foro_silencios").select("user_id").limit(1))
      .then(({ error }) => {
        if (vivo) setSilenciosDisponibles(!error || !faltaTablaSilencios(error));
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [esAdmin]);
  const pedirSilenciar = useCallback((item: MessageItem) => setASilenciar(item), []);
  const [aEliminar, setAEliminar] = useState<MessageItem | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);
  const pedirEliminar = useCallback((item: MessageItem) => {
    setErrorEliminar(null);
    setAEliminar(item);
  }, []);
  const confirmarEliminar = async () => {
    if (!aEliminar || eliminando) return;
    setEliminando(true);
    setErrorEliminar(null);
    try {
      const { data, error } = await supabase.from("chat_messages").delete().eq("id", aEliminar.id).select("id");
      if (error) throw error;
      // Sin filas borradas = la base de datos no lo ha permitido (no es administrador o ya no existía).
      if (!Array.isArray(data) || data.length === 0) throw new Error("no borrado");
      quitarMensaje(aEliminar.id);
      setAEliminar(null);
    } catch (e) {
      console.error("Error eliminando el mensaje del Foro:", e);
      if (mountedRef.current) setErrorEliminar("No se ha podido eliminar el mensaje. Inténtalo de nuevo.");
    } finally {
      if (mountedRef.current) setEliminando(false);
    }
  };

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
      if (!currentUserId || !tablaPreferencias.disponible) return true;

      const ok = await guardarPreferencias(currentUserId, { avisos_noticias: valor });
      if (!mountedRef.current) return ok;
      if (!tablaPreferencias.disponible) {
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
        if (!tablaPreferencias.disponible) setPreferenciasEnNube(false);
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
                ? mensajesConPerfil.find((m) => m.id === message.replyToId) ?? null
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
                  onEliminar={esAdmin ? pedirEliminar : undefined}
                  onSilenciar={esAdmin && silenciosDisponibles ? pedirSilenciar : undefined}
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
              minHeight: TACTIL.minimo,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: TACTIL.separacion,
            }}
          >
            {/* Solo el icono, sin burbuja alrededor (zona táctil de 44 px). */}
            <Pressable
              onPress={() => setShowInfoModal(true)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Información del Foro"
              style={({ pressed }) => ({
                minWidth: TACTIL.minimo,
                minHeight: TACTIL.minimo,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Ionicons name="information-circle-outline" size={20} color={COLORS.accent} />
            </Pressable>

            <Pressable
              onPress={toggleViewers}
              accessibilityRole="button"
              style={({ pressed }) => ({
                minHeight: TACTIL.minimo,
                justifyContent: "center",
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <Text
                style={{
                  color: "#15803D",
                  fontWeight: "900",
                  fontSize: TAMANOS.minimo,
                  lineHeight: 18,
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
                  minWidth: TACTIL.minimo,
                  minHeight: TACTIL.minimo,
                  alignItems: "center",
                  justifyContent: "center",
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
              width: TACTIL.minimo,
              height: TACTIL.minimo,
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
          errorText={sendError ?? (miSilencio ? textoSilencio(miSilencio) : null)}
          normasForo={!!miSilencio || /silenciad/.test(sendError ?? "")}
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

        {aSilenciar ? (
          <SilenciarUsuario usuario={aSilenciar.displayName} userId={aSilenciar.userId} onCerrar={() => setASilenciar(null)} />
        ) : null}

        {aEliminar ? (
          <ConfirmarEliminar
            que="mensaje"
            autor={aEliminar.displayName}
            texto={textoSinMarca(aEliminar.text) || aEliminar.text}
            eliminando={eliminando}
            error={errorEliminar}
            onCancelar={() => {
              if (!eliminando) setAEliminar(null);
            }}
            onConfirmar={confirmarEliminar}
          />
        ) : null}

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
    <Text style={{ color, fontWeight: "900", fontSize: TAMANOS.minimo, textAlign: "center" }}>{text}</Text>
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
        minHeight: TACTIL.minimo,
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
  onLongPress,
  onPressOut,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  onPressOut?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressOut={onPressOut}
      delayLongPress={320}
      style={({ pressed }) => ({
        opacity: pressed ? 0.92 : 1,
        minHeight: TACTIL.minimo,
        justifyContent: "center",
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
  onEliminar,
  onSilenciar,
  noticiaId,
  noticiaCompartida,
  onAbrirNoticia,
}: {
  item: MessageItem;
  // Solo para administradores: «Eliminar» en el selector que se abre al tocar el mensaje.
  onEliminar?: (item: MessageItem) => void;
  // Solo para administradores (y nunca sobre un administrador ni sobre uno mismo): «Silenciar a esta persona».
  onSilenciar?: (item: MessageItem) => void;
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
      ? { text: COLORS.accentText, label: "ADMIN" }
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
      {...({ dataSet: { burbujaForo: mine ? "mia" : "otro" } } as object)}
      style={{
        // Como en WhatsApp (dueño, 2026-11-26): los de los demás a la izquierda y los propios a la derecha, cada uno como
        // mucho al 80 % del ancho, con el mismo hueco en el lado contrario.
        alignSelf: mine ? "flex-end" : "flex-start",
        maxWidth: "80%",
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
          <AvatarCircle username={item.displayName} foto={item.foto} />

          <View style={{ gap: 4 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>{item.displayName}</Text>

            {/*
              Nombre: el usuario de «Mi perfil» (público, lo elige la persona)
              y, si aún no tiene, el nombre de su cuenta. El rol
              (MIEMBRO/ADMIN) va debajo, como texto sin pastilla.
            */}
            <Text style={{ color: roleTone.text, fontSize: TAMANOS.minimo, fontWeight: "900" }}>
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
              <Text style={{ color: COLORS.accentText, fontWeight: "900", fontSize: TAMANOS.minimo }}>
                {replyPreview ? replyPreview.displayName : "Mensaje original"}
              </Text>
              <Text
                numberOfLines={2}
                style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, marginTop: 2 }}
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
              color: COLORS.soft,
              fontSize: TAMANOS.minimo,
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
            gap: TACTIL.separacion,
            alignSelf: mine ? "flex-end" : "flex-start",
          }}
        >
          {reactionEntries.map(([emoji, count]) => {
            const isMine = myReaction === emoji;
            // Zona táctil de 44 px; la pastilla de dentro conserva su tamaño de siempre.
            return (
              <Pressable
                key={emoji}
                onPress={() => onReact(item.id, emoji as ReactionEmoji)}
                style={({ pressed }) => ({
                  minHeight: TACTIL.minimo,
                  minWidth: TACTIL.minimo,
                  justifyContent: "center",
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    borderRadius: 999,
                    paddingVertical: 4,
                    paddingHorizontal: 8,
                    backgroundColor: isMine ? COLORS.accentSoft : "#F6FAFD",
                    borderWidth: 1,
                    borderColor: isMine ? COLORS.accentBorder : "#E3EAF2",
                  }}
                >
                  <Text style={{ fontSize: TAMANOS.minimo }}>{emoji}</Text>
                  <Text
                    style={{
                      fontSize: TAMANOS.minimo,
                      fontWeight: "900",
                      color: isMine ? COLORS.text : COLORS.soft,
                    }}
                  >
                    {count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {pickerOpen ? (
        <View
          style={{
            flexDirection: "row",
            // Con las herramientas del administrador no cabe en un móvil estrecho: pasa a dos filas sin salirse.
            flexWrap: "wrap",
            maxWidth: "100%",
            alignItems: "center",
            gap: TACTIL.separacion,
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
                width: TACTIL.minimo,
                height: TACTIL.minimo,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? "#EAF6FD" : "transparent",
              })}
            >
              <Text style={{ fontSize: 18 }}>{emoji}</Text>
            </Pressable>
          ))}
          {onEliminar ? (
            <>
              <View style={{ width: 1, height: 22, backgroundColor: COLORS.border, marginHorizontal: 2 }} />
              <Pressable
                onPress={() => {
                  setPickerOpen(false);
                  onEliminar(item);
                }}
                accessibilityRole="button"
                accessibilityLabel="Eliminar mensaje"
                hitSlop={6}
                style={({ pressed }) => ({
                  width: TACTIL.minimo,
                  height: TACTIL.minimo,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: pressed ? "rgba(220,38,38,0.12)" : "transparent",
                })}
              >
                <Ionicons name="trash-outline" size={19} color="#DC2626" />
              </Pressable>
            </>
          ) : null}
          {onSilenciar && !mine && item.role !== "admin" ? (
            <Pressable
              onPress={() => {
                setPickerOpen(false);
                onSilenciar(item);
              }}
              accessibilityRole="button"
              accessibilityLabel="Silenciar a esta persona"
              hitSlop={6}
              style={({ pressed }) => ({
                width: TACTIL.minimo,
                height: TACTIL.minimo,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? "rgba(30,167,232,0.12)" : "transparent",
              })}
            >
              <Ionicons name="volume-mute-outline" size={19} color="#1EA7E8" />
            </Pressable>
          ) : null}
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
      accessibilityRole="button"
      accessibilityLabel="Enviar mensaje"
    >
      <Animated.View
        style={{
          width: TACTIL.minimo,
          height: TACTIL.minimo,
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
  normasForo,
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
  // Con el aviso de silencio, el enlace a las Normas del Foro.
  normasForo?: boolean;
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
  // Orden de las pestañas elegido por la persona (guardado en el dispositivo).
  const [ordenTabs, setOrdenTabs] = useState<string[] | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(ORDEN_TABS_KEY)
      .then((raw) => {
        const parsed = raw ? JSON.parse(raw) : null;
        if (Array.isArray(parsed)) setOrdenTabs(parsed.filter((k): k is string => typeof k === "string"));
      })
      .catch(() => {});
  }, []);
  const tabsOrdenadas = ordenarTabs(ordenTabs);
  // Pista de «mantén pulsada para mover»: null = aún no se sabe, false = no se ha visto, true = ya vista.
  const [pistaVista, setPistaVista] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(PISTA_ORDEN_KEY)
      .then((raw) => setPistaVista(raw === "1"))
      .catch(() => setPistaVista(true));
  }, []);
  // Se marca como vista a los 9 s de tenerla delante o al cerrar el desplegable.
  const mostrandoPista = tabsMenuOpen && pistaVista === false;
  useEffect(() => {
    if (!mostrandoPista) return;
    const marcar = () => {
      setPistaVista(true);
      AsyncStorage.setItem(PISTA_ORDEN_KEY, "1").catch(() => {});
    };
    const t = setTimeout(marcar, 9000);
    return () => {
      clearTimeout(t);
      marcar();
    };
  }, [mostrandoPista]);
  // Mover una pestaña: se mantiene pulsada (0,3 s), se arrastra arriba o abajo con el dedo y
  // al soltar queda en su nuevo sitio. Las demás se apartan mientras tanto.
  const [arrastre, setArrastre] = useState<{ key: HubTab; dy: number } | null>(null);
  const arrastreRef = useRef(arrastre);
  arrastreRef.current = arrastre;
  const tabsRef = useRef(tabsOrdenadas);
  tabsRef.current = tabsOrdenadas;
  const altoFilaRef = useRef(54);
  const movioRef = useRef(false);

  const destinoArrastre = (key: HubTab, dy: number) => {
    const claves = tabsRef.current.map((t) => t.key);
    const i = claves.indexOf(key);
    const destino = Math.max(0, Math.min(claves.length - 1, i + Math.round(dy / altoFilaRef.current)));
    return { i, destino };
  };

  const soltarArrastre = () => {
    const a = arrastreRef.current;
    if (a) {
      const { i, destino } = destinoArrastre(a.key, a.dy);
      if (destino !== i) {
        const claves: string[] = tabsRef.current.map((t) => t.key);
        claves.splice(i, 1);
        claves.splice(destino, 0, a.key);
        setOrdenTabs(claves);
        AsyncStorage.setItem(ORDEN_TABS_KEY, JSON.stringify(claves)).catch(() => {});
      }
    }
    movioRef.current = false;
    setArrastre(null);
  };
  const soltarArrastreRef = useRef(soltarArrastre);
  soltarArrastreRef.current = soltarArrastre;

  const panArrastre = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      // Con el arrastre activo (tras la pulsación larga), este contenedor se queda con el gesto.
      onMoveShouldSetPanResponder: () => !!arrastreRef.current,
      onMoveShouldSetPanResponderCapture: () => !!arrastreRef.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        movioRef.current = true;
      },
      onPanResponderMove: (_e, g) => {
        const a = arrastreRef.current;
        if (a) setArrastre({ key: a.key, dy: g.dy });
      },
      onPanResponderRelease: () => soltarArrastreRef.current(),
      onPanResponderTerminate: () => {
        movioRef.current = false;
        setArrastre(null);
      },
    })
  ).current;

  const empezarArrastre = (key: HubTab) => {
    movioRef.current = false;
    setArrastre({ key, dy: 0 });
    // Vibración corta (donde el móvil la permite) para notar que ya se puede mover.
    try {
      (navigator as any)?.vibrate?.(14);
    } catch {
      // sin vibración
    }
  };

  // Aro que late alrededor del botón del selector de pestañas.
  const pulso = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const bucle = Animated.loop(
      Animated.timing(pulso, { toValue: 1, duration: 1700, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== "web" })
    );
    bucle.start();
    return () => bucle.stop();
  }, [pulso]);

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
        <View
          // userSelect: sin esto, al arrastrar el navegador selecciona las letras de la pestaña.
          style={[{ alignItems: "flex-end", gap: 8 }, Platform.OS === "web" ? ({ userSelect: "none", WebkitUserSelect: "none", touchAction: "none" } as object) : null]}
          {...panArrastre.panHandlers}
        >
          {/* Mensaje de Blue, igual que los de Blue flotante (cristal, «Blue · …»), UNA sola vez:
              la primera vez que se abre el desplegable. Con fondo claro para leerse sobre el texto. */}
          {mostrandoPista ? (
            <View
              style={{
                backgroundColor: "rgba(255,255,255,0.94)",
                borderRadius: 18,
                borderWidth: 1,
                borderColor: "rgba(227,234,242,0.9)",
                paddingVertical: 7,
                paddingHorizontal: 12,
                shadowColor: "#0B2138",
                shadowOpacity: 0.1,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
              }}
            >
              <Text style={{ color: "#0B2138", fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 18, textAlign: "center" }}>
                <Text style={{ color: COLORS.accentText, fontWeight: "900" }}>Blue · </Text>
                Mantén pulsada una pestaña para moverla
              </Text>
            </View>
          ) : null}
          {tabsOrdenadas.map((tabItem, j) => {
            const claves = tabsOrdenadas.map((t) => t.key);
            const esta = arrastre?.key === tabItem.key;
            let ty = 0;
            if (arrastre) {
              const alto = altoFilaRef.current;
              const { i: origen, destino } = destinoArrastre(arrastre.key, arrastre.dy);
              if (esta) ty = Math.max(-j * alto, Math.min((claves.length - 1 - j) * alto, arrastre.dy));
              else if (origen < destino && j > origen && j <= destino) ty = -alto;
              else if (origen > destino && j >= destino && j < origen) ty = alto;
            }
            return (
              <View
                key={tabItem.key}
                onLayout={j === 0 ? (e) => (altoFilaRef.current = e.nativeEvent.layout.height + 8) : undefined}
                style={[
                  {
                    zIndex: esta ? 10 : 0,
                    transform: [{ translateY: ty }, { scale: esta ? 1.06 : 1 }],
                    shadowColor: "#0B2138",
                    shadowOpacity: esta ? 0.22 : 0,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 6 },
                  },
                  // En la web, las pestañas que se apartan lo hacen con un deslizamiento suave.
                  Platform.OS === "web"
                    ? ({ transitionProperty: "transform", transitionDuration: esta ? "0ms" : "170ms" } as object)
                    : null,
                ]}
              >
                <HubTabButton
                  active={activeTab === tabItem.key}
                  label={tabItem.label}
                  onPress={() => onSelectTab(tabItem.key)}
                  onLongPress={() => empezarArrastre(tabItem.key)}
                  onPressOut={() =>
                    // Si se soltó sin arrastrar, se cancela el modo mover.
                    setTimeout(() => {
                      if (arrastreRef.current && !movioRef.current) setArrastre(null);
                    }, 80)
                  }
                />
              </View>
            );
          })}
        </View>
      </Animated.View>

      {/* Botón del selector de pestañas: azul de marca y con un aro que late, para que se
          vea que es AQUÍ donde se cambia de pestaña (Blue lo señala la primera vez). */}
      <View
        style={{ alignSelf: "flex-end", marginRight: 1, marginBottom: 8, width: TACTIL.minimo, height: TACTIL.minimo, alignItems: "center", justifyContent: "center" }}
      >
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            width: TACTIL.minimo,
            height: TACTIL.minimo,
            borderRadius: TACTIL.minimo / 2,
            borderWidth: 2,
            borderColor: COLORS.accent,
            opacity: pulso.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
            transform: [{ scale: pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }) }],
          }}
        />
        <Pressable
          onPress={onToggleTabsMenu}
          testID="selector-pestanas"
          accessibilityLabel="Cambiar de pestaña del Foro: Foro, Noticias Gaming, Nuestras Novedades, Torneos y Chat"
          style={({ pressed }) => ({
            width: TACTIL.minimo,
            height: TACTIL.minimo,
            borderRadius: TACTIL.minimo / 2,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: COLORS.accent,
            opacity: pressed ? 0.85 : 1,
            shadowColor: COLORS.accent,
            shadowOpacity: 0.35,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 3 },
          })}
        >
          <Ionicons name={tabsMenuOpen ? "chevron-down" : "chevron-up"} size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      {!isChatTab ? null : (
      <>
      {!!errorText && (
        <Text
          style={{ color: "#B91C1C", fontWeight: "800", textAlign: "center", marginBottom: normasForo ? 0 : 8 }}
        >
          {errorText}
        </Text>
      )}
      {normasForo ? <EnlaceNormasForo desde="foro" /> : null}

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
            <Text style={{ color: COLORS.accentText, fontWeight: "800", fontSize: TAMANOS.minimo }}>
              Respondiendo a {replyTarget.displayName || "usuario"}
            </Text>
            <Text
              numberOfLines={1}
              style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, marginTop: 2 }}
            >
              {replyTarget.type === "gif" ? "GIF" : textoSinMarca(replyTarget.text)}
            </Text>
          </View>
          {/* Zona táctil de 44 px; el círculo gris de dentro sigue midiendo 24. */}
          <Pressable
            onPress={onCancelReply}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Cancelar la respuesta"
            style={{
              width: TACTIL.minimo,
              height: TACTIL.minimo,
              marginVertical: -10,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
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
            </View>
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
                minHeight: CAMPO.alto,
                maxHeight: 96,
                borderRadius: 14,
                backgroundColor: "rgba(255,255,255,0.42)",
                color: COLORS.text,
                // 16px es el mínimo que evita que Safari/iOS haga zoom
                // automático al enfocar el campo (por debajo de 16px lo
                // dispara siempre). No bajar de aquí.
                fontSize: CAMPO.letra,
                paddingHorizontal: 14,
                paddingVertical: 10,
                opacity: sending ? 0.6 : 1,
              }}
              multiline
            />
          ) : (
            <View
              style={{
                minHeight: CAMPO.alto,
                borderRadius: 14,
                backgroundColor: "rgba(255,255,255,0.42)",
                paddingHorizontal: 14,
                paddingVertical: 10,
                justifyContent: "center",
              }}
            >
              <Text style={{ color: COLORS.muted, fontSize: CAMPO.letra }}>
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
              style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.minimo, textAlign: "center" }}
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
            {/* La ventaja de tener cuenta (dueño, 2026-11-11). */}
            <Text style={{ color: COLORS.text, fontWeight: "700", lineHeight: 20, textAlign: "center" }}>
              Con tu cuenta, Blue te avisa de bajadas de precio y artículos nuevos.
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
                minHeight: TACTIL.minimo,
                justifyContent: "center",
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
                  minHeight: TACTIL.minimo,
                  justifyContent: "center",
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
// donde vive la conversación de verdad (components/ConversacionProducto.tsx).
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
          // Solo la portada (marcada o la primera), no las filas de todas las fotos (hasta 30 por producto).
          .or("is_cover.eq.true,sort_order.eq.0")
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
          Escríbenos desde Blue IA con «Hablar con el equipo» o con «Chatear con nosotros» en el catálogo.
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
            <Text numberOfLines={1} style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, marginTop: 2 }}>
              {row.last_message_preview || "Sin mensajes todavía"}
            </Text>
          </View>

          <View style={{ alignItems: "flex-end", gap: 0 }}>
            <Text style={{ color: COLORS.soft, fontSize: TAMANOS.minimo }}>{formatInboxDate(row.last_message_at)}</Text>
            {/* Zonas táctiles de 44 px; el margen negativo evita que la fila crezca. */}
            {confirmDeleteId === row.id ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: TACTIL.separacion, marginBottom: -12 }}>
                <Pressable
                  onPress={() => setConfirmDeleteId(null)}
                  hitSlop={6}
                  accessibilityRole="button"
                  style={{ minHeight: TACTIL.minimo, minWidth: TACTIL.minimo, alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ color: COLORS.soft, fontSize: TAMANOS.minimo, fontWeight: "700" }}>Cancelar</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleDeleteChat(row.id)}
                  disabled={deletingId === row.id}
                  hitSlop={6}
                  accessibilityRole="button"
                  style={{ minHeight: TACTIL.minimo, minWidth: TACTIL.minimo, alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ color: "#DC2626", fontSize: TAMANOS.minimo, fontWeight: "900" }}>
                    {deletingId === row.id ? "Borrando…" : "Confirmar"}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => setConfirmDeleteId(row.id)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Borrar esta conversación"
                style={{ minHeight: TACTIL.minimo, minWidth: TACTIL.minimo, alignItems: "flex-end", justifyContent: "center", marginBottom: -12 }}
              >
                <Ionicons name="trash-outline" size={14} color={COLORS.soft} />
              </Pressable>
            )}
          </View>
        </Pressable>
      ))}
    </View>
  );
}
