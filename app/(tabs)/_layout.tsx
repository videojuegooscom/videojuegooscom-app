/**
 * Qué hace: layout de la barra de pestañas inferior (Inicio, Perfil,
 * Cesta, Chat, Blue IA). Define iconos, colores y comportamiento de la
 * tab bar para las 5 pantallas principales de la app.
 *
 * Cómo funciona: usa expo-router Tabs con headerShown:false (cada pantalla
 * pinta su propia cabecera). COLORS aquí ya sigue el tema claro global
 * (fondo blanco, azul claro de acento, texto azul marino oscuro).
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
          height: Platform.OS === "ios" ? 84 : 72,
          paddingTop: 8,
          paddingBottom: Platform.OS === "ios" ? 22 : 10,
          ...Platform.select({
            web: { boxShadow: "0 -6px 20px rgba(11,33,56,0.06)" },
            default: {},
          }),
        },
        tabBarItemStyle: {
          paddingVertical: 2,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "800",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Inicio",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="perfil"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "person" : "person-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="cesta"
        options={{
          title: "Cesta",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "bag-handle" : "bag-handle-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="chat-global"
        options={{
          title: "Chat",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "chatbubbles" : "chatbubbles-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="blue-ia"
        options={{
          title: "Blue IA",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "sparkles" : "sparkles-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}