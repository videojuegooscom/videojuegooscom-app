/**
 * Qué hace: layout de la barra de pestañas inferior (Inicio, Perfil,
 * Cesta, Chat, Blue IA). Define iconos, colores y comportamiento de la
 * tab bar para las 5 pantallas principales de la app.
 *
 * Cómo funciona: usa expo-router Tabs con headerShown:false (cada pantalla
 * pinta su propia cabecera). COLORS aquí ya sigue el tema claro global
 * (fondo blanco, azul claro de acento, texto azul marino oscuro).
 * - La tab bar es deliberadamente compacta (altura y paddings reducidos,
 *   iconos a tamaño fijo TAB_ICON_SIZE y etiqueta más pequeña) para dejar
 *   más hueco visible al contenido con scroll de cada pantalla. Si se
 *   cambia aquí, conviene revisar SEARCH_LAYOUT.mobileTabBarHeight /
 *   desktopTabBarHeight en app/(tabs)/index.tsx, que asumen esta altura
 *   para colocar la barra de búsqueda flotante en su posición "abajo".
 *
 * Conectado con:
 * - app/(tabs)/index.tsx, perfil.tsx, cesta.tsx, chat-global.tsx,
 *   blue-ia.tsx → las 5 pantallas que aparecen como pestañas aquí.
 * - app/_layout.tsx → layout raíz que monta este grupo "(tabs)".
 */
import React from "react";
import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const TAB_ICON_SIZE = 22;

const COLORS = {
  bg: "#FFFFFF",
  card: "#FFFFFF",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.55)",
  accent: "#1EA7E8",
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          backgroundColor: COLORS.bg,
        },
        tabBarShowLabel: true,
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: COLORS.card,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 68 : 58,
          paddingTop: 6,
          paddingBottom: Platform.OS === "ios" ? 16 : 8,
          ...Platform.select({
            web: { boxShadow: "0 -6px 20px rgba(11,33,56,0.06)" },
            default: {},
          }),
        },
        tabBarItemStyle: {
          paddingVertical: 1,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "800",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Inicio",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={TAB_ICON_SIZE}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="perfil"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "person" : "person-outline"}
              size={TAB_ICON_SIZE}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="cesta"
        options={{
          title: "Cesta",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "bag-handle" : "bag-handle-outline"}
              size={TAB_ICON_SIZE}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="chat-global"
        options={{
          title: "Chat",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "chatbubbles" : "chatbubbles-outline"}
              size={TAB_ICON_SIZE}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="blue-ia"
        options={{
          title: "Blue IA",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "sparkles" : "sparkles-outline"}
              size={TAB_ICON_SIZE}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}