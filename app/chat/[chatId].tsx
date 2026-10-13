/**
 * app/chat/[chatId].tsx
 *
 * Qué hace: pantalla del cliente para una conversación privada de un
 * producto concreto (la que abre el botón "Chat" de app/producto/[id].tsx,
 * o cualquiera de sus conversaciones desde la pestaña "Chat" de
 * app/(tabs)/chat-global.tsx). Solo cabecera + la conversación en sí — toda
 * la lógica de mensajes vive en components/ProductChatThread.tsx, que
 * también reutiliza app/admin/chats.tsx para la vista de admin.
 *
 * Cómo funciona: exige sesión iniciada (si no hay, manda a /perfil); si la
 * hay pero la conversación (chatId de la URL) no le pertenece ni es admin,
 * la propia RLS de sql/product_chats.sql hace que no vea mensajes — aquí
 * solo se comprueba que haya sesión, el resto lo filtra la base de datos.
 * Si el cliente borra la conversación (icono de papelera dentro de
 * ProductChatThread), onDeleted vuelve a la pantalla anterior.
 *
 * Conectado con:
 * - components/ProductChatThread.tsx → mensajes, envío, tiempo real.
 * - app/producto/[id].tsx → botón "Chat" que crea/abre esta conversación.
 * - lib/supabase.ts → comprobación de sesión.
 */
import React, { useEffect, useState } from "react";
import { Platform, Pressable, SafeAreaView, StatusBar, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import ProductChatThread from "../../components/ProductChatThread";

const COLORS = {
  bg: "#FFFFFF",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
};

export default function ChatScreen() {
  const params = useLocalSearchParams<{ chatId: string }>();
  const chatId = String(params.chatId ?? "").trim();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!alive) return;
      if (!session?.user) {
        router.replace("/perfil" as any);
        return;
      }
      setAllowed(true);
      setChecking(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      {/* Cabecera limpia: volver a la izquierda, título centrado y un hueco
          igual a la derecha para que el título quede en el centro exacto. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          paddingHorizontal: 12,
          paddingVertical: Platform.OS === "web" ? 12 : 8,
        }}
      >
        <Pressable
          onPress={() => router.back()}
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

        <Text
          numberOfLines={1}
          style={{ flex: 1, color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}
        >
          Chat con la tienda
        </Text>

        <View style={{ width: 36 }} />
      </View>

      {checking || !chatId ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: COLORS.muted }}>Cargando…</Text>
        </View>
      ) : allowed ? (
        <ProductChatThread
          chatId={chatId}
          onDeleted={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/chat-global" as any))}
        />
      ) : null}
    </SafeAreaView>
  );
}
