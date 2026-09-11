/**
 * components/ProductChatThread.tsx
 *
 * Qué hace: la conversación PRIVADA de un producto concreto entre un
 * cliente y la tienda (distinta del Chat Global, que es público). La usan
 * dos pantallas distintas sin duplicar la lógica:
 * - app/chat/[chatId].tsx → el cliente ve y escribe en SU propia
 *   conversación sobre un producto.
 * - app/admin/chats.tsx → Jefe abre cualquier conversación desde la
 *   bandeja de admin (ahí además se le añade, por fuera de este
 *   componente vía `headerRight`, el botón "Marcar como vendido").
 *
 * Cómo funciona:
 * - Recibe solo el `chatId` (fila de product_chats, ver
 *   sql/product_chats.sql). Con eso carga el producto (título, foto de
 *   portada) y los mensajes, y se suscribe en tiempo real a los mensajes
 *   nuevos de esa conversación con supabase.channel(...).on("postgres_changes",
 *   { event: "INSERT", filter: "chat_id=eq.<chatId>" }, ...), igual que hace
 *   app/(tabs)/chat-global.tsx con el chat público.
 * - "¿Es mío este mensaje?" se decide comparando message.sender_user_id con
 *   la sesión actual (auth.uid()), no con el rol — así funciona igual tanto
 *   si lo abre el cliente como si lo abre un admin.
 * - Enviar un mensaje solo manda el texto: quién escribe (nombre, rol) lo
 *   rellena siempre un trigger en la base de datos a partir de la sesión
 *   real (ver sql/product_chats.sql), igual que en Chat Global y en las
 *   reseñas.
 * - Tres "tipos" de conversación, según qué columna tenga rellena la fila
 *   de product_chats: product_id → chat de un producto (título/foto real);
 *   sell_request_id → chat de una solicitud de "Vender ahora" (título
 *   "Venta: <artículo>", ver components/VenderAhoraModal.tsx y la migración
 *   get_or_create_sell_request_chat); ninguno de los dos → "Consulta
 *   general" (botón "Chatear con nosotros" de app/catalogo.tsx, vía
 *   get_or_create_support_chat). chatKind decide qué título/icono mostrar.
 * - Borrar conversación (icono de papelera en la cabecera): llama a
 *   delete_chat_for_me(chat_id), que marca SOLO el lado de quien la borra
 *   (cliente o admin, la función lo decide sola con is_admin()) — el otro
 *   lado sigue viéndola hasta que también la borre. Cuando ambos lados la
 *   han borrado, un trigger en la base de datos la elimina de verdad. Pide
 *   confirmación con una franja bajo la cabecera antes de llamar a la
 *   función, y avisa al padre (prop onDeleted) para que salga de la
 *   pantalla o refresque su lista.
 *
 * Conectado con:
 * - lib/supabase.ts → sesión, lectura/envío de mensajes, tiempo real.
 * - sql/product_chats.sql → tablas y función get_or_create_product_chat
 *   (get_or_create_support_chat, get_or_create_sell_request_chat y
 *   delete_chat_for_me viven ya solo como migración de Supabase, no en
 *   ningún archivo .sql local — ver sql/README.md).
 * - components/VenderAhoraModal.tsx → crea chats con sell_request_id.
 * - app/chat/[chatId].tsx, app/admin/chats.tsx → lo incrustan.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.48)",
  accent: "#1EA7E8",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  bubbleMine: "rgba(0,170,228,0.16)",
  bubbleOther: "#F1F6FA",
};

const MESSAGE_MAX = 2000;

type ChatMessage = {
  id: string;
  created_at: string;
  chat_id: string;
  sender_user_id: string;
  sender_role: "customer" | "admin";
  sender_name: string;
  body: string;
};

type ProductInfo = {
  title: string;
  imageUrl: string | null;
};

function formatMsgTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function AnimatedPressable({
  onPress,
  disabled,
  style,
  children,
}: {
  onPress?: () => void;
  disabled?: boolean;
  style?: any;
  children?: React.ReactNode;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 50, bounciness: 6 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }).start()}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

type ChatKind = "product" | "sell" | "support";

export default function ProductChatThread({
  chatId,
  headerRight,
  onDeleted,
}: {
  chatId: string;
  headerRight?: React.ReactNode;
  /** Se llama justo después de borrar la conversación (por mi lado) con
   * éxito, para que la pantalla que incrusta este componente pueda salir o
   * refrescar su lista (ver app/chat/[chatId].tsx, app/admin/chats.tsx). */
  onDeleted?: () => void;
}) {
  const [meId, setMeId] = useState<string | null>(null);
  const [product, setProduct] = useState<ProductInfo | null>(null);
  const [sellArticulo, setSellArticulo] = useState<string | null>(null);
  const [chatKind, setChatKind] = useState<ChatKind | null>(null);
  const [customerName, setCustomerName] = useState<string>("Cliente");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      setMeId(sessionData.session?.user?.id ?? null);

      const { data: chatRow } = await supabase
        .from("product_chats")
        .select("id,product_id,sell_request_id,customer_user_id")
        .eq("id", chatId)
        .maybeSingle<{
          id: string;
          product_id: string | null;
          sell_request_id: string | null;
          customer_user_id: string;
        }>();

      if (chatRow?.product_id) {
        setChatKind("product");

        const { data: productRow } = await supabase
          .from("products")
          .select("title,images")
          .eq("id", chatRow.product_id)
          .maybeSingle<{ title: string; images: string[] | null }>();

        let cover: string | null = productRow?.images?.[0] ?? null;
        const { data: mediaRow } = await supabase
          .from("product_media")
          .select("public_url")
          .eq("product_id", chatRow.product_id)
          .eq("kind", "image")
          .order("is_cover", { ascending: false })
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle<{ public_url: string }>();
        if (mediaRow?.public_url) cover = mediaRow.public_url;

        setProduct({ title: productRow?.title ?? "Producto", imageUrl: cover });
      } else if (chatRow?.sell_request_id) {
        setChatKind("sell");

        const { data: sellRow } = await supabase
          .from("sell_requests")
          .select("articulo")
          .eq("id", chatRow.sell_request_id)
          .maybeSingle<{ articulo: string }>();
        setSellArticulo(sellRow?.articulo ?? null);
      } else {
        setChatKind("support");
      }

      const { data: msgRows, error } = await supabase
        .from("product_chat_messages")
        .select("id,created_at,chat_id,sender_user_id,sender_role,sender_name,body")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true })
        .limit(300);

      if (error) throw error;

      const rows = (msgRows ?? []) as ChatMessage[];
      setMessages(rows);

      const firstCustomerMsg = rows.find((m) => m.sender_role === "customer");
      if (firstCustomerMsg) setCustomerName(firstCustomerMsg.sender_name || "Cliente");
    } catch {
      // Sin datos: se queda vacío en vez de romper la pantalla.
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    load();
  }, [load]);

  // Al abrir la conversación se marca como leída del lado de quien la abre
  // (cliente o admin, lo decide sql/product_chats.sql). Así el contador de
  // components/Campanita.tsx baja en cuanto se lee, sin esperar a nada más.
  useEffect(() => {
    if (!chatId) return;
    supabase.rpc("mark_chat_read", { p_chat_id: chatId }).then(
      () => {},
      () => {}
    );
  }, [chatId]);

  useEffect(() => {
    if (!chatId) return;

    const channel = supabase
      .channel(`product_chat_${chatId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "product_chat_messages", filter: `chat_id=eq.${chatId}` },
        (payload) => {
          const row = payload.new as ChatMessage;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          if (row.sender_role === "customer") setCustomerName(row.sender_name || "Cliente");
          // Mensaje ajeno mientras el hilo está abierto: se marca leído al
          // instante para que la campanita no lo cuente.
          if (row.sender_user_id !== meId) {
            supabase.rpc("mark_chat_read", { p_chat_id: chatId }).then(
              () => {},
              () => {}
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, meId]);

  useEffect(() => {
    if (!loading) requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length, loading]);

  async function handleSend() {
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    try {
      const { error } = await supabase.from("product_chat_messages").insert({ chat_id: chatId, body });
      if (error) throw error;
      setDraft("");
    } catch {
      // Se deja el texto escrito para que la persona pueda reintentar.
    } finally {
      setSending(false);
    }
  }

  const headerTitle = useMemo(() => {
    if (chatKind === "sell") return sellArticulo ? `Venta: ${sellArticulo}` : "Venta de un artículo";
    if (chatKind === "support") return "Consulta general";
    return product?.title ?? "Conversación";
  }, [chatKind, sellArticulo, product]);

  async function handleDeleteChat() {
    if (deleting) return;
    setDeleting(true);
    try {
      const { error } = await supabase.rpc("delete_chat_for_me", { p_chat_id: chatId });
      if (error) throw error;
      onDeleted?.();
    } catch (e) {
      console.error("Error borrando la conversación:", e);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          padding: 14,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
          backgroundColor: COLORS.bg2,
        }}
      >
        {product?.imageUrl ? (
          <Image
            source={{ uri: product.imageUrl }}
            style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.card }}
          />
        ) : (
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: COLORS.card,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name={
                chatKind === "sell"
                  ? "pricetag-outline"
                  : chatKind === "support"
                    ? "chatbubble-ellipses-outline"
                    : "cube-outline"
              }
              size={18}
              color={COLORS.muted}
            />
          </View>
        )}

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: "900", fontSize: 15 }}>
            {headerTitle}
          </Text>
          <Text numberOfLines={1} style={{ color: COLORS.muted2, fontSize: 12 }}>
            Con {customerName}
          </Text>
        </View>

        <Pressable
          onPress={() => setConfirmDelete(true)}
          hitSlop={8}
          style={({ pressed }) => ({
            opacity: pressed ? 0.7 : 1,
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <Ionicons name="trash-outline" size={18} color={COLORS.muted} />
        </Pressable>

        {headerRight}
      </View>

      {confirmDelete ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            padding: 12,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
            backgroundColor: "#FFF1F0",
          }}
        >
          <Ionicons name="trash-outline" size={16} color="#B91C1C" />
          <Text style={{ flex: 1, color: "#7A271A", fontSize: 12.5, lineHeight: 17 }}>
            ¿Borrar esta conversación? Se te dejará de mostrar a ti; si el otro lado no la ha
            borrado también, seguirá viéndola.
          </Text>
          <Pressable
            onPress={() => setConfirmDelete(false)}
            disabled={deleting}
            style={({ pressed }) => ({
              opacity: pressed ? 0.85 : 1,
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 999,
              backgroundColor: "#FFFFFF",
              borderWidth: 1,
              borderColor: COLORS.border,
            })}
          >
            <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 12 }}>Cancelar</Text>
          </Pressable>
          <Pressable
            onPress={handleDeleteChat}
            disabled={deleting}
            style={({ pressed }) => ({
              opacity: deleting ? 0.6 : pressed ? 0.88 : 1,
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 999,
              backgroundColor: "#DC2626",
            })}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 12 }}>
              {deleting ? "Borrando…" : "Borrar"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={COLORS.accent} />
        </View>
      ) : (
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 14, gap: 8 }}>
          {messages.length === 0 ? (
            <Text style={{ color: COLORS.muted, textAlign: "center", marginTop: 20 }}>
              Todavía no hay mensajes. Escribe el primero.
            </Text>
          ) : (
            messages.map((m) => {
              const mine = m.sender_user_id === meId;
              return (
                <View
                  key={m.id}
                  style={{
                    alignSelf: mine ? "flex-end" : "flex-start",
                    maxWidth: "82%",
                    gap: 2,
                  }}
                >
                  <View
                    style={{
                      borderRadius: 16,
                      paddingVertical: 9,
                      paddingHorizontal: 13,
                      backgroundColor: mine ? COLORS.bubbleMine : COLORS.bubbleOther,
                    }}
                  >
                    <Text style={{ color: COLORS.text, fontSize: 14, lineHeight: 20 }}>{m.body}</Text>
                  </View>
                  <Text
                    style={{
                      color: COLORS.muted2,
                      fontSize: 10,
                      textAlign: mine ? "right" : "left",
                      marginHorizontal: 4,
                    }}
                  >
                    {mine ? "Tú" : m.sender_name} · {formatMsgTime(m.created_at)}
                  </Text>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 8,
          padding: 12,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          backgroundColor: COLORS.bg,
        }}
      >
        <TextInput
          value={draft}
          onChangeText={(t) => setDraft(t.slice(0, MESSAGE_MAX))}
          placeholder="Escribe un mensaje…"
          placeholderTextColor="rgba(11,33,56,0.40)"
          multiline
          style={{
            flex: 1,
            maxHeight: 100,
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: 16,
            paddingVertical: 10,
            paddingHorizontal: 14,
            color: COLORS.text,
            backgroundColor: COLORS.card,
            // 16px es el mínimo que iOS/Android no consideran "hay que
            // acercar la cámara para leer esto": con menos, el navegador
            // hace zoom automático al tocar la casilla y, como es una app
            // de una sola página, ese zoom se queda puesto al navegar a
            // otras pantallas — es lo que se veía como "toda la app mal
            // encuadrada". Por eso TODOS los TextInput de la tienda deben
            // ir a fontSize 16 o más, nunca menos.
            fontSize: 16,
          }}
        />

        <AnimatedPressable
          onPress={handleSend}
          disabled={!draft.trim() || sending}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: COLORS.accent,
            opacity: !draft.trim() || sending ? 0.5 : 1,
          }}
        >
          <Ionicons name="send" size={18} color="#FFFFFF" />
        </AnimatedPressable>
      </View>
    </KeyboardAvoidingView>
  );
}
