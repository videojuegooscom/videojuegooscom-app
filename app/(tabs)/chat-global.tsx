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
 * (botón "Chat" de app/producto/[id].tsx) — ver sql/product_chats.sql y
 * components/ProductChatThread.tsx. No tiene nada que ver con el Foro
 * público: solo esa persona y los administradores ven esos mensajes.
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
 * - Noticias, Novedades y Torneos siguen siendo contenido de ejemplo fijo en
 *   este archivo (InfoPanel) — no era la parte pedida en esta ronda de
 *   cambios.
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
 * - components/PromoBanner.tsx → franja "Te compramos tu consola..." fija
 *   arriba del todo (misma franja que en el resto de pestañas).
 * - components/VenderAhoraModal.tsx → formulario que abre el botón "Vender
 *   Ya" de esa franja (sí usa lib/supabase.ts, para guardar la solicitud).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams, type Href } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import PromoBanner from "../../components/PromoBanner";
import VenderAhoraModal from "../../components/VenderAhoraModal";
import { supabase } from "../../lib/supabase";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  bg3: "#F6FAFD",
  card: "#EAF6FD",
  cardSoft: "#F8FBFE",
  border: "#E3EAF2",
  borderSoft: "#E3EAF2",
  text: "#0B2138",
  textDark: "#0B1726",
  muted: "rgba(11,33,56,0.62)",
  soft: "rgba(11,33,56,0.48)",
  accent: "#1EA7E8",
  accentSoft: "#EAF6FD",
  accentBorder: "#BEE6FA",
  accentGlow: "rgba(0,170,228,0.20)",
  success: "#22C55E",
  successSoft: "rgba(34,197,94,0.16)",
  successBorder: "rgba(34,197,94,0.30)",
  bubbleMine: "rgba(0,170,228,0.22)",
  bubbleOther: "#F1F6FA",
  bubbleSystem: "rgba(216,176,74,0.14)",
  gold: "#B8860B",
  danger: "#DC2626",
  dangerSoft: "rgba(255,107,107,0.14)",
  dangerBorder: "rgba(255,107,107,0.30)",
  overlay: "rgba(3,10,18,0.76)",
};

type Viewer = {
  id: string;
  username: string;
  mode: "viewer" | "member" | "vip";
  city: string;
  country: string;
  game: string;
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

export default function ChatGlobalScreen() {
  // Permite llegar directamente a una pestaña concreta, p. ej. desde la
  // campanita (components/Campanita.tsx) con /chat-global?tab=privados.
  const params = useLocalSearchParams<{ tab?: string }>();
  const initialTab: HubTab = HUB_TAB_VALUES.includes(params.tab as HubTab)
    ? (params.tab as HubTab)
    : "chat";

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
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
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [tabsMenuOpen, setTabsMenuOpen] = useState(false);
  // Al leer historial hacia arriba se ocultan el compositor, el botón de
  // enviar, el de información y el de "viendo ahora"; al volver a bajar
  // reaparecen. showScrollToBottom es el "⬇️" que aparece cuando te alejas
  // bastante del final del chat.
  const [composerVisible, setComposerVisible] = useState(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const scrollRef = useRef<ScrollView | null>(null);
  const mountedRef = useRef(true);
  const justSentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabsMenuAnim = useRef(new Animated.Value(0)).current;
  const uiVisibleAnim = useRef(new Animated.Value(1)).current;
  const lastScrollYRef = useRef(0);
  const isNearBottomRef = useRef(true);
  const hasScrolledInitialRef = useRef(false);

  const isLoggedIn = !!currentUserId;

  const viewers = useMemo<Viewer[]>(
    () => [
      {
        id: "1",
        username: "alexzgz",
        mode: "member",
        city: "Zaragoza",
        country: "España",
        game: "Fortnite",
      },
      {
        id: "2",
        username: "mariaps5",
        mode: "viewer",
        city: "Madrid",
        country: "España",
        game: "Fortnite",
      },
      {
        id: "3",
        username: "otakuzone",
        mode: "vip",
        city: "Valencia",
        country: "España",
        game: "Warzone",
      },
      {
        id: "4",
        username: "retro_dani",
        mode: "member",
        city: "Sevilla",
        country: "España",
        game: "Fortnite",
      },
      {
        id: "5",
        username: "switchlover",
        mode: "viewer",
        city: "Bogotá",
        country: "Colombia",
        game: "Fortnite",
      },
      {
        id: "6",
        username: "capibara_tech",
        mode: "member",
        city: "Barcelona",
        country: "España",
        game: "EA FC",
      },
      {
        id: "7",
        username: "nutriafix",
        mode: "vip",
        city: "Bilbao",
        country: "España",
        game: "Fortnite",
      },
      {
        id: "8",
        username: "adri_xbox",
        mode: "viewer",
        city: "Lisboa",
        country: "Portugal",
        game: "Fortnite",
      },
    ],
    []
  );

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

  // Mensajes reales: carga los últimos 100 al entrar (y sus reacciones) y
  // luego escucha en directo los mensajes y reacciones nuevos de cualquier
  // usuario (tiempo real).
  useEffect(() => {
    let active = true;

    (async () => {
      setLoadError(null);
      setLoadingMessages(true);

      try {
        const initial = await fetchInitialMessages();
        if (!active) return;
        setMessages(initial);

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
  }, []);

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
  // sin ella), sin tocar ninguna tabla — es solo por socket.
  useEffect(() => {
    const channel = supabase.channel("chat_global_presence");

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setViewerCount(Object.keys(state).length);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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

    if (nearBottom) {
      setComposerVisible(true);
    } else if (delta < -6) {
      setComposerVisible(false);
    } else if (delta > 6) {
      setComposerVisible(true);
    }

    setShowScrollToBottom(distanceFromBottom > 400);
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

  const handleGoPerfil = () => {
    router.push("/perfil" as Href);
  };

  const renderActiveTabContent = () => {
    if (activeTab === "news") {
      return (
        <InfoPanel
          title="Noticias"
          subtitle="Titulares breves sobre el mundo del videojuego y la comunidad, pensados para leerse en unos segundos."
          items={[
            "Así se verán los titulares: novedades de lanzamientos, actualizaciones y grandes eventos del sector.",
            "Cobertura de la escena competitiva: torneos, resultados y tendencias que marcan la actualidad gamer.",
            "Un resumen claro y directo, sin relleno, para que estés al día en cada visita.",
          ]}
          badge="Vista previa"
          note="Esta sección está en construcción. El contenido de arriba es un ejemplo de cómo lucirán las noticias reales cuando publiquemos la primera."
        />
      );
    }

    if (activeTab === "novedades") {
      return (
        <InfoPanel
          title="Nuestras Novedades"
          subtitle="El canal oficial para anunciar lanzamientos de la tienda, restocks y mejoras de la plataforma."
          items={[
            "Nuevas incorporaciones al catálogo: consolas, packs y ediciones especiales según vayan llegando.",
            "Avisos de disponibilidad para artículos reacondicionados y accesorios de alta demanda.",
            "Mejoras de la web y la app: nuevas funciones, ajustes de rendimiento y novedades del servicio.",
          ]}
          badge="Vista previa"
          note="Esta sección está en construcción. El contenido de arriba es un ejemplo de cómo lucirán nuestros anuncios reales."
        />
      );
    }

    if (activeTab === "torneos") {
      return (
        <InfoPanel
          title="Torneos"
          subtitle="El espacio dedicado a la competición: torneos, retos y eventos organizados por la comunidad."
          items={[
            "Convocatorias de torneos con formato, fechas y premios detallados antes de cada inscripción.",
            "Retos semanales abiertos a toda la comunidad para ganar visibilidad y recompensas.",
            "Clasificaciones y rankings locales, organizados por ciudad o por sala de juego.",
          ]}
          badge="Vista previa"
          note="Esta sección está en construcción. El contenido de arriba es un ejemplo de cómo se anunciarán los torneos reales."
        />
      );
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
        {showViewers ? (
          <View
            style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: "#E3EAF2",
              backgroundColor: "#F8FBFE",
              padding: 12,
              gap: 12,
            }}
          >
            <Text style={{ color: COLORS.muted, lineHeight: 21 }}>
              Aquí puedes ver quién está conectado ahora mismo.
            </Text>

            <View style={{ gap: 10 }}>
              {viewers.map((viewer) => (
                <ViewerRow key={viewer.id} viewer={viewer} />
              ))}
            </View>
          </View>
        ) : null}

        {!!loadError && (
          <View
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#F5B5B5",
              backgroundColor: "#FDECEC",
              padding: 10,
            }}
          >
            <Text style={{ color: "#B91C1C", fontWeight: "900" }}>Atención</Text>
            <Text style={{ color: "#7A271A", marginTop: 4 }}>{loadError}</Text>
          </View>
        )}

        {loadingMessages ? (
          <View style={{ paddingVertical: 28, alignItems: "center", gap: 10 }}>
            <ActivityIndicator />
            <Text style={{ color: COLORS.muted }}>Cargando el chat…</Text>
          </View>
        ) : visibleMessages.length === 0 ? (
          <View
            style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: COLORS.borderSoft,
              backgroundColor: COLORS.card,
              padding: 20,
              alignItems: "center",
              gap: 6,
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>
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

              return (
                <MessageBubble
                  key={message.id}
                  item={message}
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
    <>
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      <PromoBanner onPressVender={() => setSellModalOpen(true)} />

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
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 58,
            paddingBottom: 130,
            alignItems: "center",
          }}
        >
          {/* Columna centrada: no se pega a la izquierda en pantallas anchas */}
          <View style={{ width: "100%", maxWidth: 1040, gap: 16 }}>
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
          una barra estrecha con el icono de información y el recuadro real
          de "viendo ahora" — flotando arriba a la derecha, y se oculta junto
          con el compositor al leer historial hacia arriba (mismo uiVisibleAnim).
        */}
        <Animated.View
          pointerEvents={composerVisible ? "box-none" : "none"}
          style={{
            position: "absolute",
            top: 14,
            right: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
            opacity: uiVisibleAnim,
            transform: [
              {
                translateY: uiVisibleAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-16, 0],
                }),
              },
            ],
          }}
        >
          {/* Sueltos, cada uno con su propia burbuja — ya no comparten
              una caja blanca común, y los dos son más pequeños para no
              competir visualmente con el resto de la pantalla. */}
          <Pressable
            onPress={() => setShowInfoModal(true)}
            style={({ pressed }) => ({
              width: 26,
              height: 26,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#FFFFFF",
              borderWidth: 1,
              borderColor: COLORS.accentBorder,
              opacity: pressed ? 0.85 : 1,
              shadowColor: COLORS.accent,
              shadowOpacity: 0.08,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 2 },
            })}
          >
            <Ionicons name="information-circle-outline" size={15} color={COLORS.accent} />
          </Pressable>

          <Pressable
            onPress={toggleViewers}
            style={({ pressed }) => ({
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <GlowPill
              text={`${viewerCount} viendo ahora ${showViewers ? "▲" : "▼"}`}
              tone="success"
              size="compact"
            />
          </Pressable>
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
              right: 16,
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
      </View>
    </SafeAreaView>

    <VenderAhoraModal visible={sellModalOpen} onClose={() => setSellModalOpen(false)} />
    </>
  );
}

function Tag({
  text,
  tone = "neutral",
}: {
  text: string;
  tone?: "neutral" | "success" | "warn" | "danger";
}) {
  const palette = {
    neutral: {
      bg: "#EEF3F8",
      border: "#E3EAF2",
      text: "#0B2138",
    },
    success: {
      bg: "rgba(34,197,94,0.14)",
      border: "rgba(34,197,94,0.30)",
      text: "#15803D",
    },
    warn: {
      bg: "rgba(245,158,11,0.14)",
      border: "rgba(245,158,11,0.30)",
      text: "#92660B",
    },
    danger: {
      bg: "rgba(255,107,107,0.12)",
      border: "rgba(255,107,107,0.30)",
      text: "#B91C1C",
    },
  }[tone];

  return (
    <View
      style={{
        borderRadius: 999,
        paddingVertical: 8,
        paddingHorizontal: 10,
        backgroundColor: palette.bg,
        borderWidth: 1,
        borderColor: palette.border,
      }}
    >
      <Text style={{ color: palette.text, fontWeight: "900", fontSize: 12 }}>
        {text}
      </Text>
    </View>
  );
}

function GlowPill({
  text,
  tone,
  size = "default",
}: {
  text: string;
  tone: "accent" | "success";
  size?: "default" | "hero" | "compact";
}) {
  const isHero = size === "hero";
  // "compact": versión pequeña para cuando el recuadro va suelto (sin caja
  // blanca alrededor), como el contador "viendo ahora" junto al icono de
  // información — para no romper el orden visual con algo demasiado grande.
  const isCompact = size === "compact";

  const style =
    tone === "success"
      ? {
          bg: COLORS.successSoft,
          border: COLORS.successBorder,
          text: "#15803D",
          shadow: COLORS.success,
        }
      : {
          bg: COLORS.accentSoft,
          border: COLORS.accentBorder,
          text: COLORS.text,
          shadow: COLORS.accent,
        };

  return (
    <View
      style={{
        borderRadius: 999,
        minHeight: isHero ? 46 : isCompact ? 28 : 34,
        paddingVertical: isHero ? 11 : isCompact ? 6 : 8,
        paddingHorizontal: isHero ? 16 : isCompact ? 10 : 12,
        backgroundColor: style.bg,
        borderWidth: 1.2,
        borderColor: style.border,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: style.shadow,
        shadowOpacity: isHero ? 0.22 : isCompact ? 0.12 : 0.16,
        shadowRadius: isHero ? 18 : isCompact ? 8 : 12,
        shadowOffset: { width: 0, height: 0 },
        elevation: isHero ? 4 : isCompact ? 1 : 2,
        maxWidth: "100%",
      }}
    >
      <Text
        style={{
          color: style.text,
          fontWeight: "900",
          fontSize: isHero ? 14 : isCompact ? 11 : 13,
          lineHeight: isHero ? 18 : isCompact ? 14 : 16,
          textAlign: "center",
          flexShrink: 1,
        }}
      >
        {text}
      </Text>
    </View>
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
      })}
    >
      <Text style={{ color: primary ? "#FFFFFF" : COLORS.text, fontWeight: "900" }}>{label}</Text>
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
      })}
    >
      <Text style={{ color: COLORS.text, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function ViewerRow({ viewer }: { viewer: Viewer }) {
  const modeMap = {
    viewer: {
      label: "Mirando",
      bg: "#EAF6FD",
      border: "#E3EAF2",
      text: "#0B2138",
    },
    member: {
      label: "Miembro",
      bg: "#EAF6FD",
      border: "rgba(0,170,228,0.30)",
      text: "#0F8FCC",
    },
    vip: {
      label: "VIP",
      bg: "rgba(216,176,74,0.16)",
      border: "rgba(216,176,74,0.30)",
      text: "#92660B",
    },
  }[viewer.mode];

  return (
    <View
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#E3EAF2",
        backgroundColor: "#F8FBFE",
        padding: 12,
        gap: 8,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          <AvatarCircle username={viewer.username} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>
              @{viewer.username}
            </Text>
            <Text style={{ color: COLORS.soft, fontSize: 12, marginTop: 2 }}>
              {viewer.city}, {viewer.country}
            </Text>
          </View>
        </View>

        <View
          style={{
            borderRadius: 999,
            paddingVertical: 7,
            paddingHorizontal: 10,
            backgroundColor: modeMap.bg,
            borderWidth: 1,
            borderColor: modeMap.border,
          }}
        >
          <Text style={{ color: modeMap.text, fontWeight: "900", fontSize: 12 }}>
            {modeMap.label}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <MiniInlineData label="Juego" value={viewer.game} />
        <MiniInlineData label="Zona" value={viewer.city} />
      </View>
    </View>
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

function MiniInlineData({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View
      style={{
        borderRadius: 999,
        paddingVertical: 6,
        paddingHorizontal: 10,
        backgroundColor: "#F6FAFD",
        borderWidth: 1,
        borderColor: "#E3EAF2",
      }}
    >
      <Text style={{ color: COLORS.soft, fontSize: 11, fontWeight: "700" }}>
        {label}: <Text style={{ color: COLORS.text, fontWeight: "900" }}>{value}</Text>
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
}: {
  item: MessageItem;
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
      ? {
          bg: "rgba(0,170,228,0.18)",
          text: "#0F8FCC",
          border: "rgba(0,170,228,0.30)",
          label: "ADMIN",
          accent: COLORS.accent,
        }
      : item.role === "vip"
        ? {
            bg: "rgba(216,176,74,0.16)",
            text: "#92660B",
            border: "rgba(216,176,74,0.30)",
            label: "VIP",
            accent: COLORS.gold,
          }
        : {
            bg: "#EAF6FD",
            text: "#0B2138",
            border: "#E3EAF2",
            label: "MIEMBRO",
            accent: "rgba(30,167,232,0.14)",
          };

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
              (MIEMBRO/ADMIN) ahora va debajo del nombre en vez de al lado.
            */}
            <View
              style={{
                alignSelf: "flex-start",
                borderRadius: 999,
                paddingVertical: 3,
                paddingHorizontal: 8,
                backgroundColor: roleTone.bg,
                borderWidth: 1,
                borderColor: roleTone.border,
              }}
            >
              <Text style={{ color: roleTone.text, fontSize: 10, fontWeight: "900" }}>
                {roleTone.label}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      <Pressable onPress={handleBubblePress}>
        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: mine ? "rgba(0,170,228,0.20)" : "#E3EAF2",
            backgroundColor: bubbleBg,
            padding: 14,
            gap: 6,
            shadowColor: mine ? COLORS.accent : roleTone.accent,
            shadowOpacity: mine ? 0.12 : 0.06,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 2 },
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
                {replyPreview ? replyPreview.text : "No disponible"}
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
                  <View
                    style={{
                      borderRadius: 999,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      backgroundColor: "#E3EAF2",
                      borderWidth: 1,
                      borderColor: "#E3EAF2",
                    }}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>GIF</Text>
                  </View>
                  <Text style={{ color: COLORS.muted, marginTop: 10, textAlign: "center" }}>
                    {item.text}
                  </Text>
                </>
              ) : (
                <>
                  <View
                    style={{
                      borderRadius: 999,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      backgroundColor: COLORS.dangerSoft,
                      borderWidth: 1,
                      borderColor: COLORS.dangerBorder,
                    }}
                  >
                    <Text style={{ color: "#B91C1C", fontWeight: "900" }}>
                      GIF bloqueado
                    </Text>
                  </View>
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
          fondo/borde), alineadas a la derecha, una debajo de otra.
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
        style={({ pressed }) => ({
          alignSelf: "flex-end",
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
        <View
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "#F5B5B5",
            backgroundColor: "#FDECEC",
            paddingVertical: 8,
            paddingHorizontal: 12,
            marginBottom: 8,
          }}
        >
          <Text style={{ color: "#B91C1C", fontWeight: "800", textAlign: "center" }}>
            {errorText}
          </Text>
        </View>
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
              {replyTarget.type === "gif" ? "GIF" : replyTarget.text}
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
            }}
          >
            <View
              style={{
                alignSelf: "flex-start",
                borderRadius: 999,
                paddingVertical: 6,
                paddingHorizontal: 10,
                backgroundColor: COLORS.accentSoft,
                borderWidth: 1,
                borderColor: COLORS.accentBorder,
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                ACCESO NECESARIO
              </Text>
            </View>

            <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "900" }}>
              Inicia sesión para enviar mensajes
            </Text>

            <Text style={{ color: COLORS.muted, lineHeight: 22 }}>
              Puedes explorar la sala libremente, pero para escribir o enviar mensajes
              necesitas iniciar sesión o crear tu cuenta.
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <Tag text="Chat visible" tone="success" />
              <Tag text="Inicio de sesión requerido" tone="warn" />
              <Tag text="Comunidad protegida" tone="neutral" />
            </View>

            <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
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
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: COLORS.accentSoft,
                  borderWidth: 1,
                  borderColor: COLORS.accentBorder,
                }}
              >
                <Ionicons name="chatbubbles-outline" size={22} color={COLORS.accent} />
              </View>

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

function InfoPanel({
  title,
  subtitle,
  items,
  badge,
  note,
}: {
  title: string;
  subtitle: string;
  items: string[];
  // "Vista previa": deja claro que el contenido de abajo es un ejemplo de
  // cómo lucirá la sección, no una publicación real todavía.
  badge?: string;
  note?: string;
}) {
  return (
    <View
      style={{
        borderRadius: 22,
        borderWidth: 1,
        borderColor: COLORS.borderSoft,
        backgroundColor: COLORS.card,
        padding: 16,
        gap: 12,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "900" }}>
          {title}
        </Text>

        {badge ? (
          <View
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: COLORS.accentBorder,
              backgroundColor: COLORS.accentSoft,
              paddingHorizontal: 10,
              paddingVertical: 5,
            }}
          >
            <Text
              style={{
                color: COLORS.accent,
                fontWeight: "900",
                fontSize: 11,
                letterSpacing: 0.3,
                textTransform: "uppercase",
              }}
            >
              {badge}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={{ color: COLORS.muted, lineHeight: 22 }}>{subtitle}</Text>

      <View style={{ gap: 10 }}>
        {items.map((item, index) => (
          <View
            key={`${title}-${index}`}
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#E3EAF2",
              backgroundColor: "#F8FBFE",
              padding: 12,
            }}
          >
            <Text style={{ color: COLORS.text, lineHeight: 22 }}>{item}</Text>
          </View>
        ))}
      </View>

      {note ? (
        <View
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: COLORS.borderSoft,
            backgroundColor: "rgba(11,33,56,0.04)",
            padding: 10,
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <Ionicons name="information-circle-outline" size={16} color={COLORS.muted} />
          <Text style={{ color: COLORS.muted, lineHeight: 19, fontSize: 12.5, flex: 1 }}>
            {note}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// --- Pestaña "Chat": bandeja privada por producto -------------------------

type PrivateChatRow = {
  id: string;
  product_id: string;
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

  useEffect(() => {
    if (!isLoggedIn) {
      setLoading(false);
      return;
    }

    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user?.id;
        if (!userId) return;

        const { data: chats, error } = await supabase
          .from("product_chats")
          .select("id,product_id,last_message_at,last_message_preview")
          .eq("customer_user_id", userId)
          .order("last_message_at", { ascending: false });

        if (error) throw error;
        if (!alive) return;

        const chatRows = (chats ?? []) as {
          id: string;
          product_id: string;
          last_message_at: string;
          last_message_preview: string;
        }[];

        const productIds = Array.from(new Set(chatRows.map((c) => c.product_id)));
        let titleById: Record<string, string> = {};
        let imageById: Record<string, string | null> = {};

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

        if (!alive) return;
        setRows(
          chatRows.map((c) => ({
            ...c,
            product_title: titleById[c.product_id] ?? "Producto",
            product_image: imageById[c.product_id] ?? null,
          }))
        );
      } catch (e) {
        console.error("Error cargando tus conversaciones:", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isLoggedIn]);

  if (!isLoggedIn) {
    return (
      <View
        style={{
          borderRadius: 22,
          borderWidth: 1,
          borderColor: COLORS.borderSoft,
          backgroundColor: COLORS.card,
          padding: 20,
          gap: 10,
          alignItems: "center",
        }}
      >
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
      <View
        style={{
          borderRadius: 22,
          borderWidth: 1,
          borderColor: COLORS.borderSoft,
          backgroundColor: COLORS.card,
          padding: 20,
          gap: 6,
          alignItems: "center",
        }}
      >
        <Ionicons name="chatbubble-ellipses-outline" size={26} color={COLORS.muted} />
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>
          Todavía no tienes conversaciones
        </Text>
        <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 20 }}>
          Pulsa "Chat" en la ficha de un producto para escribirnos por él.
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
              <Ionicons name="cube-outline" size={20} color={COLORS.muted} />
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

          <Text style={{ color: COLORS.muted2, fontSize: 11 }}>{formatInboxDate(row.last_message_at)}</Text>
        </Pressable>
      ))}
    </View>
  );
}
