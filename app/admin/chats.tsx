// app/admin/chats.tsx
/**
 * Qué hace: bandeja de admin de las conversaciones PRIVADAS por producto
 * (ver sql/product_chats.sql). Es donde Jefe ve quién le ha escrito por
 * cada anuncio y, cuando corresponde, lo marca como "vendido" a esa persona
 * (ver sql/product_sales.sql) — la otra mitad de esa acción vive en
 * app/admin/products.tsx, que la hace buscando directamente a un usuario
 * registrado, sin pasar por el chat.
 *
 * Cómo funciona:
 * - Carga TODAS las conversaciones (la política RLS de product_chats ya
 *   deja ver todo a un admin) y las agrupa por producto: un mismo producto
 *   puede tener varias personas distintas escribiendo por él, y hay que
 *   poder elegir la correcta.
 * - Master-detail en una sola pantalla: lista de productos con
 *   conversaciones a la izquierda (o arriba en móvil) y, al elegir una
 *   conversación, su hilo completo (components/ProductChatThread.tsx) a la
 *   derecha, con el botón "Marcar como vendido a este cliente" añadido por
 *   fuera del componente compartido (headerRight).
 * - "Marcar como vendido" hace un INSERT directo en product_sales con
 *   buyer_user_id = el cliente de esa conversación; el trigger de esa tabla
 *   ya sabe que un admin puede elegir libremente a quién marca (a
 *   diferencia de un cliente normal, que solo puede marcarse a sí mismo
 *   desde "Comprar ya"). Si ese producto ya tiene una venta registrada para
 *   esa misma persona, el botón se sustituye por un aviso "Ya vendido ✓" en
 *   vez de dejar duplicar la fila sin querer.
 * - Nombre del cliente en la lista: se pide con admin_users_by_ids (ver
 *   sql/admin_users_by_ids.sql), que devuelve el nombre real aunque esa
 *   persona no haya escrito ni un mensaje. Si esa función todavía no existe
 *   en Supabase (falta ejecutar el script), se cae al nombre sacado del
 *   primer mensaje del cliente y, si tampoco hay, a "Cliente".
 *
 * Conectado con:
 * - sql/product_chats.sql → product_chats, product_chat_messages.
 * - sql/product_sales.sql → marcar como vendido.
 * - sql/admin_users_by_ids.sql → nombre real del cliente en la lista.
 * - components/ProductChatThread.tsx → el hilo de mensajes en sí.
 * - app/admin/products.tsx → la otra forma de marcar "vendido" (buscando al
 *   usuario registrado, sin depender de que haya escrito por chat).
 * - app/admin/index.tsx → origen habitual de la navegación a esta pantalla.
 * - app/admin/_layout.tsx → registra esta ruta ("chats") dentro del Stack
 *   protegido del panel admin.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import ProductChatThread from "../../components/ProductChatThread";

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  cardSoft: "#F8FBFE",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.48)",
  accent: "#1EA7E8",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  successBg: "#DCFCE7",
  successBorder: "#86EFAC",
  success: "#15803D",
};

const columnStyle = { width: "100%", maxWidth: 1160, alignSelf: "center" } as const;

type ChatRow = {
  id: string;
  product_id: string;
  customer_user_id: string;
  last_message_at: string;
  last_message_preview: string;
  customer_name: string;
};

type ProductGroup = {
  product_id: string;
  product_title: string;
  product_image: string | null;
  chats: ChatRow[];
};

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AdminChats() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 900;
  const pagePadding = isMobile ? 12 : 16;

  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [soldKeys, setSoldKeys] = useState<Set<string>>(new Set());
  const [selectedChat, setSelectedChat] = useState<ChatRow | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductGroup | null>(null);
  const [markingSold, setMarkingSold] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: chats, error } = await supabase
        .from("product_chats")
        .select("id,product_id,customer_user_id,last_message_at,last_message_preview")
        .order("last_message_at", { ascending: false });

      if (error) throw error;

      const chatRows = (chats ?? []) as Omit<ChatRow, "customer_name">[];
      if (chatRows.length === 0) {
        setGroups([]);
        return;
      }

      const chatIds = chatRows.map((c) => c.id);
      const productIds = Array.from(new Set(chatRows.map((c) => c.product_id)));
      const customerIds = Array.from(new Set(chatRows.map((c) => c.customer_user_id)));

      const [{ data: products }, { data: media }, { data: firstMsgs }, { data: sales }, { data: realUsers }] =
        await Promise.all([
          supabase.from("products").select("id,title,images").in("id", productIds),
          supabase
            .from("product_media")
            .select("product_id,public_url,is_cover,sort_order")
            .in("product_id", productIds)
            .eq("kind", "image")
            .order("is_cover", { ascending: false })
            .order("sort_order", { ascending: true }),
          supabase
            .from("product_chat_messages")
            .select("chat_id,sender_role,sender_name,created_at")
            .in("chat_id", chatIds)
            .eq("sender_role", "customer")
            .order("created_at", { ascending: true }),
          supabase.from("product_sales").select("product_id,buyer_user_id").in("product_id", productIds),
          // Nombre REAL del cliente aunque todavía no haya escrito ningún
          // mensaje (ver sql/admin_users_by_ids.sql). Si esa función todavía
          // no existe en el proyecto de Supabase (falta ejecutar el script),
          // esto falla en silencio y se cae al nombre sacado de los mensajes.
          supabase.rpc("admin_users_by_ids", { ids: customerIds }).then(
            (res) => res,
            () => ({ data: null })
          ),
        ]);

      const titleById: Record<string, string> = {};
      const imageById: Record<string, string | null> = {};
      for (const row of (products ?? []) as any[]) {
        titleById[row.id] = row.title ?? "Producto";
        imageById[row.id] = row.images?.[0] ?? null;
      }
      for (const row of (media ?? []) as any[]) {
        if (!imageById[row.product_id]) imageById[row.product_id] = row.public_url;
      }

      // Nombre por chat, sacado del primer mensaje del cliente (solo existe
      // si ya ha escrito algo).
      const nameByChat: Record<string, string> = {};
      for (const row of (firstMsgs ?? []) as any[]) {
        if (!nameByChat[row.chat_id]) nameByChat[row.chat_id] = row.sender_name || "";
      }

      // Nombre real por cliente (id de auth.users), disponible aunque no
      // haya escrito nada todavía. Tiene prioridad sobre el anterior.
      const nameByCustomer: Record<string, string> = {};
      for (const row of (realUsers ?? []) as any[]) {
        const name = (row.full_name || row.username || row.email || "").trim();
        if (name) nameByCustomer[row.id] = name;
      }

      const sold = new Set<string>();
      for (const row of (sales ?? []) as any[]) {
        sold.add(`${row.product_id}:${row.buyer_user_id}`);
      }
      setSoldKeys(sold);

      const byProduct: Record<string, ProductGroup> = {};
      for (const c of chatRows) {
        const group =
          byProduct[c.product_id] ??
          (byProduct[c.product_id] = {
            product_id: c.product_id,
            product_title: titleById[c.product_id] ?? "Producto",
            product_image: imageById[c.product_id] ?? null,
            chats: [],
          });
        const customerName = nameByCustomer[c.customer_user_id] || nameByChat[c.id] || "Cliente";
        group.chats.push({ ...c, customer_name: customerName });
      }

      const groupList = Object.values(byProduct).sort((a, b) => {
        const aLatest = a.chats[0]?.last_message_at ?? "";
        const bLatest = b.chats[0]?.last_message_at ?? "";
        return aLatest < bLatest ? 1 : -1;
      });

      setGroups(groupList);
    } catch (e) {
      console.error("Error cargando las conversaciones:", e);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalChats = useMemo(() => groups.reduce((sum, g) => sum + g.chats.length, 0), [groups]);

  async function markSold() {
    if (!selectedChat || !selectedProduct || markingSold) return;

    setMarkingSold(true);
    try {
      const { error } = await supabase.from("product_sales").insert({
        product_id: selectedChat.product_id,
        buyer_user_id: selectedChat.customer_user_id,
      });
      if (error) throw error;

      setSoldKeys((prev) => new Set(prev).add(`${selectedChat.product_id}:${selectedChat.customer_user_id}`));
    } catch (e) {
      console.error("Error marcando como vendido:", e);
    } finally {
      setMarkingSold(false);
    }
  }

  const selectedKey = selectedChat ? `${selectedChat.product_id}:${selectedChat.customer_user_id}` : "";
  const alreadySold = selectedKey ? soldKeys.has(selectedKey) : false;

  const list = (
    <ScrollView contentContainerStyle={{ padding: pagePadding, gap: 12 }}>
      {loading ? (
        <View style={{ alignItems: "center", paddingVertical: 30 }}>
          <ActivityIndicator color={COLORS.accent} />
        </View>
      ) : groups.length === 0 ? (
        <View
          style={{
            borderRadius: 18,
            backgroundColor: COLORS.card,
            padding: 20,
            alignItems: "center",
            gap: 6,
          }}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={24} color={COLORS.muted} />
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>Sin conversaciones todavía</Text>
          <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 19 }}>
            Aquí aparecerán los clientes que escriban por "Chat" en la ficha de un producto.
          </Text>
        </View>
      ) : (
        groups.map((group) => (
          <View
            key={group.product_id}
            style={{
              borderRadius: 18,
              backgroundColor: COLORS.card,
              padding: 12,
              gap: 8,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              {group.product_image ? (
                <Image
                  source={{ uri: group.product_image }}
                  style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.cardSoft }}
                />
              ) : (
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: COLORS.cardSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="cube-outline" size={18} color={COLORS.muted} />
                </View>
              )}
              <Text numberOfLines={1} style={{ flex: 1, color: COLORS.text, fontWeight: "900", fontSize: 14 }}>
                {group.product_title}
              </Text>
              <Text style={{ color: COLORS.muted2, fontSize: 12 }}>
                {group.chats.length} {group.chats.length === 1 ? "persona" : "personas"}
              </Text>
            </View>

            <View style={{ gap: 6 }}>
              {group.chats.map((chat) => {
                const key = `${chat.product_id}:${chat.customer_user_id}`;
                const sold = soldKeys.has(key);
                const active = selectedChat?.id === chat.id;
                return (
                  <Pressable
                    key={chat.id}
                    onPress={() => {
                      setSelectedChat(chat);
                      setSelectedProduct(group);
                    }}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.9 : 1,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      borderRadius: 12,
                      backgroundColor: active ? COLORS.accent2 : COLORS.cardSoft,
                      padding: 10,
                    })}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: "700", fontSize: 13 }}>
                        {chat.customer_name}
                      </Text>
                      <Text numberOfLines={1} style={{ color: COLORS.muted, fontSize: 12 }}>
                        {chat.last_message_preview || "Sin mensajes"}
                      </Text>
                    </View>
                    {sold ? (
                      <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
                    ) : (
                      <Text style={{ color: COLORS.muted2, fontSize: 11 }}>{formatDate(chat.last_message_at)}</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );

  const detail = selectedChat ? (
    <View style={{ flex: 1 }}>
      <ProductChatThread
        chatId={selectedChat.id}
        headerRight={
          alreadySold ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: COLORS.successBorder,
                backgroundColor: COLORS.successBg,
                paddingVertical: 8,
                paddingHorizontal: 12,
              }}
            >
              <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
              <Text style={{ color: COLORS.success, fontWeight: "900", fontSize: 12 }}>Ya vendido</Text>
            </View>
          ) : (
            <Pressable
              onPress={markSold}
              disabled={markingSold}
              style={({ pressed }) => ({
                opacity: markingSold ? 0.6 : pressed ? 0.88 : 1,
                borderRadius: 999,
                paddingVertical: 8,
                paddingHorizontal: 12,
                backgroundColor: COLORS.accent,
              })}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 12 }}>
                {markingSold ? "Marcando…" : "Marcar como vendido"}
              </Text>
            </Pressable>
          )
        }
      />
    </View>
  ) : (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20 }}>
      <Text style={{ color: COLORS.muted, textAlign: "center" }}>
        Elige una conversación para ver los mensajes.
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingHorizontal: pagePadding,
            paddingVertical: Platform.OS === "web" ? 12 : 8,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
            backgroundColor: COLORS.bg2,
          }}
        >
          <Pressable
            onPress={() => {
              if (isMobile && selectedChat) {
                setSelectedChat(null);
                setSelectedProduct(null);
                return;
              }
              router.push("/admin");
            }}
            style={({ pressed }) => ({
              opacity: pressed ? 0.85 : 1,
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Ionicons name="chevron-back" size={22} color={COLORS.text} />
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>Chat</Text>
            <Text style={{ color: COLORS.muted2, fontSize: 12 }}>
              {totalChats} conversación{totalChats === 1 ? "" : "es"}
            </Text>
          </View>
        </View>

        {isMobile ? (
          selectedChat ? detail : list
        ) : (
          <View style={{ ...columnStyle, flex: 1, flexDirection: "row" }}>
            <View style={{ width: 360, borderRightWidth: 1, borderRightColor: COLORS.border }}>{list}</View>
            {detail}
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}
