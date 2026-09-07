/**
 * app/(tabs)/chat-global.tsx
 *
 * Qué hace: "Chat Global", un hub social de la tienda con 4 pestañas (Chat,
 * Noticias, Novedades, Torneos). La pestaña Chat muestra los mensajes reales
 * de la comunidad en tiempo real y un cuadro para escribir. Cualquiera puede
 * leer el chat sin iniciar sesión, pero solo un usuario registrado y con la
 * sesión iniciada puede escribir/enviar mensajes.
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
 *
 * Conectado con:
 * - lib/supabase.ts → sesión, lectura y envío de mensajes.
 * - sql/chat_messages.sql → crea la tabla, el trigger que rellena el
 *   remitente y las políticas RLS (leer: todo el mundo; escribir: solo
 *   sesión iniciada).
 * - app/(tabs)/perfil.tsx (el modal de "inicia sesión" navega ahí; también
 *   es donde se registran full_name/username que el trigger usa para
 *   mostrar el nombre de cada mensaje).
 * - components/PromoBanner.tsx → franja "Te compramos tu consola..." fija
 *   arriba del todo (misma franja que en el resto de pestañas).
 * - components/VenderAhoraModal.tsx → formulario que abre el botón "Vender
 *   Ya" de esa franja (sí usa lib/supabase.ts, para guardar la solicitud).
 */
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, type Href } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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
  username: string;
  displayName: string;
  role?: "viewer" | "member" | "vip" | "admin";
  time: string;
  text: string;
};

type HubTab = "chat" | "news" | "novedades" | "torneos";

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
  };
}

async function fetchInitialMessages(): Promise<MessageItem[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id,created_at,user_id,username,display_name,role,body")
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

export default function ChatGlobalScreen() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [hasCompletedCommunityProfile] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [activeTab, setActiveTab] = useState<HubTab>("chat");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [sellModalOpen, setSellModalOpen] = useState(false);

  const scrollRef = useRef<ScrollView | null>(null);
  const mountedRef = useRef(true);
  const justSentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Mensajes reales: carga los últimos 100 al entrar y luego escucha en
  // directo los mensajes nuevos de cualquier usuario (tiempo real).
  useEffect(() => {
    let active = true;

    (async () => {
      setLoadError(null);
      setLoadingMessages(true);

      try {
        const initial = await fetchInitialMessages();
        if (active) setMessages(initial);
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
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // Cuando llega un mensaje nuevo (o se entra en la pestaña Chat), baja la
  // pantalla para que se vea el mensaje más reciente.
  useEffect(() => {
    if (activeTab !== "chat") return;
    const id = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
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
      // Solo mandamos el texto: quién lo escribe lo pone la base de datos
      // (ver el trigger en sql/chat_messages.sql), no el cliente.
      const { error } = await supabase.from("chat_messages").insert({ body: clean });
      if (error) throw error;

      if (!mountedRef.current) return;
      setDraft("");

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
  }, [draft, isLoggedIn]);

  const handleGoPerfil = () => {
    router.push("/perfil" as Href);
  };

  const renderActiveTabContent = () => {
    if (activeTab === "news") {
      return (
        <InfoPanel
          title="Noticias Gaming"
          subtitle="Noticias rápidas de gaming y comunidad para mantener el hub vivo."
          items={[
            "Fortnite prepara nuevas rotaciones y eventos semanales.",
            "La escena competitiva sigue empujando el juego cruzado y el contenido en directo.",
            "Publicamos noticias breves, claras y muy visuales para que estés al día en un vistazo.",
          ]}
        />
      );
    }

    if (activeTab === "novedades") {
      return (
        <InfoPanel
          title="Nuestras Novedades"
          subtitle="Entradas nuevas de tienda, packs, reacondicionados y avisos importantes."
          items={[
            "Nuevos packs de consola disponibles.",
            "Entradas recientes de mandos, accesorios y reacondicionados.",
            "Próximas mejoras del chat, perfiles gamer y búsqueda por ciudad.",
          ]}
        />
      );
    }

    if (activeTab === "torneos") {
      return (
        <InfoPanel
          title="Torneos"
          subtitle="Torneos, retos, clasificatorias y eventos comunitarios."
          items={[
            "Torneo Fortnite dúos — próximamente.",
            "Retos semanales para activar comunidad.",
            "Ranking local por ciudad o por sala más adelante.",
          ]}
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

              return (
                <MessageBubble
                  key={message.id}
                  item={message}
                  canViewMedia={canViewMedia}
                  grouped={grouped}
                  mine={message.userId === currentUserId}
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
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 18,
            paddingBottom: 130,
            alignItems: "center",
          }}
        >
          {/* Columna centrada: no se pega a la izquierda en pantallas anchas */}
          <View style={{ width: "100%", maxWidth: 1040, gap: 16 }}>
          <LinearGradient
            colors={["rgba(30,167,232,0.10)", "rgba(0,170,228,0.08)", "#FFFFFF"]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{
              borderRadius: 28,
              padding: 1,
            }}
          >
            <View
              style={{
                borderRadius: 27,
                backgroundColor: "#FFFFFF",
                paddingHorizontal: 18,
                paddingVertical: 18,
                gap: 10,
              }}
            >
              {/*
                Un único recuadro con el conteo real de gente que tiene esta
                pantalla abierta ahora mismo (Supabase Presence), en la
                esquina superior derecha y a tamaño normal — sustituye a los
                tres avisos ("EN DIRECTO" + "conectados" + "Viendo ahora")
                que había antes.
              */}
              <View style={{ position: "relative" }}>
                <Pressable
                  onPress={toggleViewers}
                  style={({ pressed }) => ({
                    position: "absolute",
                    top: 0,
                    right: 0,
                    opacity: pressed ? 0.9 : 1,
                    zIndex: 2,
                  })}
                >
                  <GlowPill
                    text={`${viewerCount} viendo ahora ${showViewers ? "▲" : "▼"}`}
                    tone="success"
                    size="default"
                  />
                </Pressable>

                <Text
                  style={{
                    color: COLORS.text,
                    fontSize: 34,
                    lineHeight: 38,
                    fontWeight: "900",
                    letterSpacing: 0.2,
                    paddingRight: 132,
                  }}
                >
                  Chat Global
                </Text>
              </View>

              <Text
                style={{
                  color: COLORS.muted,
                  fontSize: 15,
                  lineHeight: 23,
                  maxWidth: 980,
                }}
              >
                Conecta con otros gamers, encuentra gente para jugar a
                Fortnite, descubre personas de tu misma ciudad o país y sigue
                noticias gaming, novedades de la tienda y torneos.
              </Text>
            </View>
          </LinearGradient>

          <View
            style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: COLORS.borderSoft,
              backgroundColor: COLORS.card,
              paddingHorizontal: 10,
              paddingVertical: 10,
            }}
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 6 }}>
                <HubTabButton
                  active={activeTab === "chat"}
                  label="Chat Global"
                  onPress={() => setActiveTab("chat")}
                />
                <HubTabButton
                  active={activeTab === "news"}
                  label="Noticias Gaming"
                  onPress={() => setActiveTab("news")}
                />
                <HubTabButton
                  active={activeTab === "novedades"}
                  label="Nuestras Novedades"
                  onPress={() => setActiveTab("novedades")}
                />
                <HubTabButton
                  active={activeTab === "torneos"}
                  label="Torneos"
                  onPress={() => setActiveTab("torneos")}
                />
              </View>
            </ScrollView>
          </View>

          {renderActiveTabContent()}
          </View>
        </ScrollView>

        {activeTab === "chat" ? (
          <FloatingComposer
            value={draft}
            onChangeText={setDraft}
            onPressInput={handleComposerPress}
            onPressSend={handleSend}
            isLoggedIn={isLoggedIn}
            sending={sending}
            justSent={justSent}
            canSend={canSend}
            errorText={sendError}
          />
        ) : null}

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
  size?: "default" | "hero";
}) {
  const isHero = size === "hero";

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
        minHeight: isHero ? 46 : 34,
        paddingVertical: isHero ? 11 : 8,
        paddingHorizontal: isHero ? 16 : 12,
        backgroundColor: style.bg,
        borderWidth: 1.2,
        borderColor: style.border,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: style.shadow,
        shadowOpacity: isHero ? 0.22 : 0.16,
        shadowRadius: isHero ? 18 : 12,
        shadowOffset: { width: 0, height: 0 },
        elevation: isHero ? 4 : 2,
        maxWidth: "100%",
      }}
    >
      <Text
        style={{
          color: style.text,
          fontWeight: "900",
          fontSize: isHero ? 14 : 13,
          lineHeight: isHero ? 18 : 16,
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

function MessageBubble({
  item,
  canViewMedia,
  grouped,
  mine,
}: {
  item: MessageItem;
  canViewMedia: boolean;
  grouped?: boolean;
  mine?: boolean;
}) {
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
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <AvatarCircle username={item.username} />
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>{item.displayName}</Text>
          <Text style={{ color: COLORS.soft, fontSize: 12 }}>@{item.username}</Text>

          <View
            style={{
              borderRadius: 999,
              paddingVertical: 4,
              paddingHorizontal: 8,
              backgroundColor: roleTone.bg,
              borderWidth: 1,
              borderColor: roleTone.border,
            }}
          >
            <Text style={{ color: roleTone.text, fontSize: 11, fontWeight: "900" }}>
              {roleTone.label}
            </Text>
          </View>

          <Text style={{ color: COLORS.soft, fontSize: 12 }}>{item.time}</Text>
        </View>
      ) : null}

      <View
        style={{
          borderRadius: 18,
          borderWidth: 1,
          borderColor: mine ? "rgba(0,170,228,0.20)" : "#E3EAF2",
          backgroundColor: bubbleBg,
          padding: 14,
          gap: 10,
          shadowColor: mine ? COLORS.accent : roleTone.accent,
          shadowOpacity: mine ? 0.12 : 0.06,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 2 },
        }}
      >
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
      </View>
    </View>
  );
}

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

function FloatingComposer({
  value,
  onChangeText,
  onPressInput,
  onPressSend,
  isLoggedIn,
  sending,
  justSent,
  canSend,
  errorText,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onPressInput: () => void;
  onPressSend: () => void;
  isLoggedIn: boolean;
  sending?: boolean;
  justSent?: boolean;
  canSend?: boolean;
  errorText?: string | null;
}) {
  // El botón se desactiva solo cuando SÍ hay sesión pero el mensaje es
  // demasiado corto (≤ 3 caracteres). Sin sesión se deja pulsable para que
  // abra el aviso de inicio de sesión.
  const sendDisabled = !!sending || canSend === false;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: 12,
      }}
    >
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

      <LinearGradient
        colors={["rgba(30,167,232,0.12)", "rgba(0,170,228,0.06)", "rgba(30,167,232,0.02)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 20,
          padding: 1,
        }}
      >
        <View
          style={{
            borderRadius: 19,
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: "#EAF6FD",
            padding: 6,
            shadowColor: COLORS.accent,
            shadowOpacity: 0.1,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 3 },
          }}
        >
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
                  placeholderTextColor="rgba(11,33,56,0.35)"
                  editable={!sending}
                  style={{
                    minHeight: 40,
                    maxHeight: 96,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: "#E3EAF2",
                    backgroundColor: "#F8FBFE",
                    color: COLORS.text,
                    fontSize: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    opacity: sending ? 0.6 : 1,
                  }}
                  multiline
                />
              ) : (
                <View
                  style={{
                    minHeight: 40,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: "#E3EAF2",
                    backgroundColor: "#F8FBFE",
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "rgba(11,33,56,0.35)", fontSize: 14 }}>
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
        </View>
      </LinearGradient>
    </View>
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

function InfoPanel({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: string[];
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
      <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "900" }}>
        {title}
      </Text>
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
    </View>
  );
}
