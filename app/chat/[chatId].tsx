/**
 * Archivo: app/chat/[chatId].tsx
 * Función: pantalla de una conversación privada con la tienda, en la dirección /chat/<chatId> (admite ?borrador=).
 * Para qué sirve: el cliente (con sesión iniciada) escribe y lee mensajes del equipo sobre un producto, una venta o atención general.
 * Conectado con: components/ConversacionProducto.tsx (mensajes y tiempo real), components/CabeceraMarca.tsx, lib/supabase.ts (comprobación de sesión; las tablas del chat, product_chats, las usa ProductChatThread).
 * Utilizado por: Expo Router (dirección /chat/<chatId>); la abren abrirChatEquipo y abrirChatProducto (components/ConversacionProducto.tsx), app/(tabs)/chat-global.tsx, app/(tabs)/index.tsx, app/catalogo.tsx y components/VenderAhoraModal.tsx.
 * Dependencias: react, react-native, expo-router.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: pantalla del cliente para una conversación privada con la
 * tienda: de un producto, de una venta o general ("Atención al cliente").
 * La abre abrirChatEquipo (components/ConversacionProducto.tsx) desde Blue IA
 * o la confirmación de pedido, o la pestaña "Chat" de
 * app/(tabs)/chat-global.tsx. Solo cabecera + la conversación en sí — toda
 * la lógica de mensajes vive en components/ConversacionProducto.tsx, que
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
 * - components/ConversacionProducto.tsx → mensajes, envío, tiempo real.
 * - app/(tabs)/blue-ia.tsx, app/checkout.tsx → "Hablar con el equipo/nosotros".
 * - lib/supabase.ts → comprobación de sesión.
 */
import React, { useEffect, useState } from "react";
import { Platform, SafeAreaView, StatusBar, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "../../lib/supabase";
import ConversacionProducto from "../../components/ConversacionProducto";
import CabeceraMarca from "../../components/CabeceraMarca";

const COLORS = {
  bg: "#FFFFFF",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
};

export default function ChatScreen() {
  // borrador: texto que sale escrito en la casilla sin enviar (valoración baja de un pedido, components/VentanaValoracion.tsx).
  const params = useLocalSearchParams<{ chatId: string; borrador?: string }>();
  const chatId = String(params.chatId ?? "").trim();
  const borrador = typeof params.borrador === "string" ? params.borrador.slice(0, 300) : "";
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!alive) return;
      if (!session?.user) {
        router.replace(`/perfil?aviso=${encodeURIComponent("Inicia sesión para hablar con nuestro equipo")}` as any);
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
      <View style={{ paddingHorizontal: 12, paddingVertical: Platform.OS === "web" ? 10 : 6, gap: 2 }}>
        <CabeceraMarca onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
        <Text numberOfLines={1} style={{ color: COLORS.muted, fontWeight: "800", fontSize: 13, textAlign: "center" }}>
          Chat con la tienda
        </Text>
      </View>

      {checking || !chatId ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: COLORS.muted }}>Cargando…</Text>
        </View>
      ) : allowed ? (
        <ConversacionProducto
          chatId={chatId}
          borradorInicial={borrador}
          onDeleted={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/chat-global" as any))}
        />
      ) : null}
    </SafeAreaView>
  );
}
