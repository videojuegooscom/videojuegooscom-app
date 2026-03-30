import React from "react";
import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const COLORS = {
  bg: "#071E33",
  card: "#0B2742",
  border: "rgba(255,255,255,0.10)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.58)",
  accent: "#00AAE4",
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