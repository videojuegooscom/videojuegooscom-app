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
 *   móvil. Se lee bien: icono de 22, nombre de 11,5 px, gris con más
 *   contraste y una línea azul fina encima de la sección activa. Altura algo mayor fuera de iOS
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
 * - Triple toque = recargar la pestaña: si se toca 3 veces seguidas el icono
 *   de una pestaña (en menos de TRIPLE_TOQUE_MS, 900 ms), esa pantalla se
 *   vuelve a montar de verdad y por eso vuelve a pedir sus datos. Se hace con
 *   un RESET del navegador de pestañas en el que solo esa ruta cambia de
 *   clave (key): la barra (BottomTabView) pinta cada pantalla con
 *   key={route.key}, así que React desmonta la vieja y monta una nueva. Se
 *   conservan el resto de pestañas, los parámetros y el historial (con la
 *   clave nueva), así que la URL no cambia y el botón atrás sigue igual
 *   (expo-router hace replaceState, no añade entradas). Si por lo que sea la
 *   clave no cambia, como último recurso se recarga la página
 *   (window.location.reload, solo web). Respuesta visual: el icono da una
 *   vuelta rápida (360°) y se enciende el efecto Siri al momento
 *   (pulseLoading(…, true) de lib/loadingBus.ts). Los toques sueltos siguen
 *   igual: cambiar de pestaña o, en la activa, volver arriba.
 *
 * Conectado con:
 * - app/(tabs)/index.tsx, perfil.tsx, cesta.tsx, chat-global.tsx,
 *   blue-ia.tsx → las 5 pantallas que aparecen como pestañas aquí.
 * - app/_layout.tsx → layout raíz que monta este grupo "(tabs)".
 * - lib/loadingBus.ts → useCargando() para saber cuándo brillar y
 *   pulseLoading() al recargar una pestaña.
 * - components/lineapensadoraefectosiri.tsx → BrilloIconoSeccion (halo).
 */
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CommonActions, type ParamListBase, type TabNavigationState } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import {
  TAB_BAR_BASE_HEIGHT,
  TAB_BAR_BASE_PADDING_BOTTOM,
  useTabBarBottomInset,
} from "../../lib/tabBar";
import { pulseLoading, useCargando } from "../../lib/loadingBus";
import { BrilloIconoSeccion } from "../../components/lineapensadoraefectosiri";

const TAB_ICON_SIZE = 22;

// Triple toque: ventana para los 3 toques, vuelta del icono y efecto Siri.
const TRIPLE_TOQUE_MS = 900;
const GIRO_MS = 560;
const RECARGA_PULSO_MS = 900;

type NombreIcono = React.ComponentProps<typeof Ionicons>["name"];

// Última recarga por pestaña (nombre de ruta → instante). Vive fuera de React
// porque el icono también se vuelve a montar al cambiar la clave de la ruta.
const recargas = new Map<string, number>();
const oyentesRecarga = new Set<() => void>();

function avisarRecarga(ruta: string) {
  recargas.set(ruta, Date.now());
  oyentesRecarga.forEach((oyente) => oyente());
}

// Toques seguidos sobre el mismo icono.
let toques = { ruta: "", veces: 0, desde: 0 };

// Cuenta el toque y devuelve true al tercero seguido sobre la misma pestaña.
function esTripleToque(ruta: string): boolean {
  const ahora = Date.now();
  if (toques.ruta !== ruta || ahora - toques.desde > TRIPLE_TOQUE_MS) {
    toques = { ruta, veces: 1, desde: ahora };
    return false;
  }
  toques.veces += 1;
  if (toques.veces < 3) return false;
  toques = { ruta: "", veces: 0, desde: 0 };
  return true;
}

function recargarPagina() {
  if (Platform.OS === "web" && typeof window !== "undefined") window.location.reload();
}

/**
 * Vuelve a montar la pantalla de una pestaña: RESET del navegador de pestañas
 * con la misma estructura y solo esa ruta con una clave nueva (React la
 * desmonta y la monta de cero). Historial con la clave nueva para que la URL y
 * el botón atrás no cambien.
 */
function recargarPestana(navigation: BottomTabNavigationProp<ParamListBase>, clave: string, ruta: string) {
  avisarRecarga(ruta);
  pulseLoading(RECARGA_PULSO_MS, true);
  try {
    const estado = navigation.getState();
    const nuevaClave = `${ruta}-recarga-${Date.now().toString(36)}`;
    // Mismo estado (stale: false, mismas rutas e índice) con la clave nueva.
    const nuevo: TabNavigationState<ParamListBase> = {
      ...estado,
      routes: estado.routes.map((r) => (r.key === clave ? { ...r, key: nuevaClave } : r)),
      history: estado.history.map((h) => (h.key === clave ? { ...h, key: nuevaClave } : h)),
      preloadedRouteKeys: estado.preloadedRouteKeys.filter((k) => k !== clave),
    };
    navigation.dispatch({ ...CommonActions.reset(nuevo), target: estado.key });
    // Comprobación: si la ruta no tiene la clave nueva, no se remontó → página entera.
    setTimeout(() => {
      try {
        if (!navigation.getState().routes.some((r) => r.key === nuevaClave)) recargarPagina();
      } catch {
        recargarPagina();
      }
    }, 120);
  } catch {
    recargarPagina();
  }
}

// Icono de pestaña: brilla mientras hay carga si es la capa "focused" y da una
// vuelta al recargar su pestaña con triple toque.
function IconoPestana({
  ruta,
  nombre,
  color,
  focused,
}: {
  ruta: string;
  nombre: NombreIcono;
  color: string;
  focused: boolean;
}) {
  const cargando = useCargando();
  const giro = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const girar = () => {
      // También al montarse: tras la recarga el icono es uno nuevo.
      if (Date.now() - (recargas.get(ruta) ?? 0) > GIRO_MS) return;
      giro.setValue(0);
      Animated.timing(giro, {
        toValue: 1,
        duration: GIRO_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }).start();
    };
    girar();
    oyentesRecarga.add(girar);
    return () => {
      oyentesRecarga.delete(girar);
    };
  }, [ruta, giro]);

  const rotacion = giro.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Animated.View style={{ transform: [{ rotate: rotacion }], alignItems: "center" }}>
      {/* Marca de la sección activa: una línea azul fina encima del icono. */}
      <Animated.View
        style={{
          position: "absolute",
          top: -7,
          width: 22,
          height: 3,
          borderRadius: 2,
          backgroundColor: focused ? COLORS.accent : "transparent",
        }}
      />
      <BrilloIconoSeccion brillando={focused && cargando}>
        <Ionicons name={nombre} size={TAB_ICON_SIZE} color={color} />
      </BrilloIconoSeccion>
    </Animated.View>
  );
}

const COLORS = {
  bg: "#FFFFFF",
  card: "#FFFFFF",
  border: "#E3EAF2",
  text: "#0B2138",
  // Más contraste en las secciones no activas: antes 0.55 se leía mal al sol.
  muted: "rgba(11,33,56,0.72)",
  accent: "#1EA7E8",
};

export default function TabsLayout() {
  // Zona segura inferior del iPhone en la web (ver lib/tabBar.ts): se suma a la altura y al
  // margen inferior para que los nombres de las secciones no queden cortados por abajo.
  const bottomInset = useTabBarBottomInset();

  return (
    <Tabs
      // Triple toque en un icono → recargar esa pestaña (el toque normal no cambia).
      screenListeners={({ navigation, route }) => ({
        tabPress: () => {
          if (esTripleToque(route.name)) recargarPestana(navigation, route.key, route.name);
        },
      })}
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
          paddingTop: 7,
          paddingBottom: TAB_BAR_BASE_PADDING_BOTTOM + bottomInset,
          ...Platform.select({
            web: { boxShadow: "0 -6px 20px rgba(11,33,56,0.06)" },
            default: {},
          }),
        },
        tabBarItemStyle: {
          paddingVertical: 1,
        },
        // Nombre de la sección más grande y sin recortes (antes 10 px).
        tabBarLabelStyle: {
          fontSize: 11.5,
          lineHeight: 15,
          fontWeight: "800",
          marginTop: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Inicio",
          tabBarIcon: ({ color, focused }) => (
            <IconoPestana
              ruta="index"
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
              ruta="perfil"
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
              ruta="cesta"
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
              ruta="chat-global"
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
              ruta="blue-ia"
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