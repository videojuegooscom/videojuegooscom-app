/**
 * Qué hace: layout de la barra de pestañas inferior (Inicio, Perfil,
 * Cesta, Foro, Blue IA). Define iconos, colores y comportamiento de la
 * tab bar para las 5 pantallas principales de la app.
 *
 * Cómo funciona: usa expo-router Tabs con headerShown:false (cada pantalla
 * pinta su propia cabecera). COLORS aquí ya sigue el tema claro global
 * (fondo blanco, azul claro de acento, texto azul marino oscuro).
 * - La tab bar es deliberadamente compacta (altura y paddings reducidos,
 *   iconos a tamaño fijo TAB_ICON_SIZE y etiqueta más pequeña) para dejar
 *   más hueco visible al contenido con scroll de cada pantalla, pero con
 *   aire suficiente para que el nombre de cada pestaña no se recorte en
 *   móvil: icono un poco más pequeño (20), altura algo mayor fuera de iOS
 *   (donde antes iba muy justa) y el icono desplazado hacia arriba
 *   (paddingTop menor) para dejarle más hueco debajo a la etiqueta. Si se
 *   cambia aquí, conviene revisar SEARCH_LAYOUT.mobileTabBarHeight /
 *   desktopTabBarHeight en app/(tabs)/index.tsx, que asumen esta altura
 *   para colocar la barra de búsqueda flotante en su posición "abajo".
 * - Mientras hay algo cargando (useCargando() de lib/loadingBus.ts, el
 *   mismo estado que enciende el marco Siri), el icono de la pestaña activa
 *   brilla: halo azul #1EA7E8 que pulsa y el icono crece un 8 % (ver
 *   BrilloIconoSeccion). React Navigation pinta cada icono dos veces (capa
 *   "focused" y capa normal) y solo deja visible la capa "focused" de la
 *   pestaña activa, así que el brillo solo se ve en esa.
 *
 * Conectado con:
 * - app/(tabs)/index.tsx, perfil.tsx, cesta.tsx, chat-global.tsx,
 *   blue-ia.tsx → las 5 pantallas que aparecen como pestañas aquí.
 * - app/_layout.tsx → layout raíz que monta este grupo "(tabs)".
 * - lib/loadingBus.ts → useCargando() para saber cuándo brillar.
 * - components/lineapensadoraefectosiri.tsx → BrilloIconoSeccion (halo).
 */
import React from "react";
import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  TAB_BAR_BASE_HEIGHT,
  TAB_BAR_BASE_PADDING_BOTTOM,
  useTabBarBottomInset,
} from "../../lib/tabBar";
import { useCargando } from "../../lib/loadingBus";
import { BrilloIconoSeccion } from "../../components/lineapensadoraefectosiri";

const TAB_ICON_SIZE = 20;

type NombreIcono = React.ComponentProps<typeof Ionicons>["name"];

// Icono de pestaña: brilla mientras hay carga si es la capa "focused".
function IconoPestana({
  nombre,
  color,
  focused,
}: {
  nombre: NombreIcono;
  color: string;
  focused: boolean;
}) {
  const cargando = useCargando();
  return (
    <BrilloIconoSeccion brillando={focused && cargando}>
      <Ionicons name={nombre} size={TAB_ICON_SIZE} color={color} />
    </BrilloIconoSeccion>
  );
}

const COLORS = {
  bg: "#FFFFFF",
  card: "#FFFFFF",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.55)",
  accent: "#1EA7E8",
};

export default function TabsLayout() {
  // Zona segura inferior del iPhone en la web (ver lib/tabBar.ts): se suma a la altura y al
  // margen inferior para que los nombres de las secciones no queden cortados por abajo.
  const bottomInset = useTabBarBottomInset();

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
          height: TAB_BAR_BASE_HEIGHT + bottomInset,
          paddingTop: 4,
          paddingBottom: TAB_BAR_BASE_PADDING_BOTTOM + bottomInset,
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
            <IconoPestana
              nombre={focused ? "home" : "home-outline"}
              color={color}
              focused={focused}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="perfil"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color, focused }) => (
            <IconoPestana
              nombre={focused ? "person" : "person-outline"}
              color={color}
              focused={focused}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="cesta"
        options={{
          title: "Cesta",
          tabBarIcon: ({ color, focused }) => (
            <IconoPestana
              nombre={focused ? "bag-handle" : "bag-handle-outline"}
              color={color}
              focused={focused}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="chat-global"
        options={{
          title: "Foro",
          tabBarIcon: ({ color, focused }) => (
            <IconoPestana
              nombre={focused ? "chatbubbles" : "chatbubbles-outline"}
              color={color}
              focused={focused}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="blue-ia"
        options={{
          title: "Blue IA",
          tabBarIcon: ({ color, focused }) => (
            <IconoPestana
              nombre={focused ? "sparkles" : "sparkles-outline"}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
    </Tabs>
  );
}