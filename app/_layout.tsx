// app/app/_layout.tsx
/**
 * Qué hace: layout raíz de toda la app (Expo Router). Muestra una pantalla
 * de carga de marca al arrancar y luego monta el Stack de navegación con
 * todas las rutas de nivel superior.
 *
 * Cómo funciona: usa expo-router Stack con headerShown:false (cada
 * pantalla dibuja su propia cabecera) y animación "fade" entre rutas.
 *
 * Pantalla de carga: es también la versión pre-generada de cada página (la tienda se
 * pinta solo ya montada en el dispositivo, con su ancho real; ver «montado» abajo).
 * Además espera a la fuente de Ionicons (la usa TODA la app),
 * vía useFonts() de expo-font, para que los iconos no salgan en blanco la
 * primera vez. Como mucho BOOT_FONT_TIMEOUT_MS (1,5 s): si la fuente tarda más
 * (conexión lenta), la tienda se muestra igualmente y los iconos aparecen al
 * llegar. Sin mínimo de tiempo: si la fuente ya está en caché, entra al
 * instante. MaterialIcons/MaterialCommunityIcons ya no se precargan aquí (solo
 * las usan pantallas secundarias, que las cargan solas al montarse).
 *
 * Conectado con:
 * - components/BrandLoadingScreen.tsx → pantalla de carga inicial.
 * - components/Campanita.tsx → campanita flotante de notificaciones, se
 *   monta aquí UNA sola vez (fuera y por encima del Stack) para que
 *   aparezca en todas las pantallas y no se reinicie al navegar.
 * - components/CookieConsentBanner.tsx → aviso de analítica/cookies, montado
 *   igual que la campanita (una sola vez, fuera del Stack); se oculta solo
 *   en /admin y desaparece en cuanto el visitante contesta.
 * - components/lineapensadoraefectosiri.tsx → barra de colores tipo "Siri"
 *   que se enciende sola, en toda la app, mientras haya algo cargando
 *   (peticiones a Supabase, fotos, o un simple cambio de pantalla — ver
 *   lib/loadingBus.ts). Montada igual que la campanita, fuera del Stack,
 *   para que aparezca en cualquier pantalla sin tocarlas una a una.
 * - components/SiteHead.tsx → aplica el título de pestaña, la descripción
 *   para Google y (si hay) el logo subido desde app/admin/marca-seo.tsx. No
 *   pinta nada en pantalla (return null), solo toca el <head> del documento
 *   en web.
 * - app/(tabs)/_layout.tsx → navegación por pestañas (inicio, catálogo,
 *   cesta, chat, blue-ia, perfil...).
 * - app/catalogo.tsx, app/servicios.tsx, app/checkout.tsx,
 *   app/producto/[id].tsx, app/servicio/[id].tsx, app/chat/[chatId].tsx,
 *   app/modal.tsx, app/reset-password.tsx → rutas públicas fuera de las
 *   pestañas.
 * - app/admin/_layout.tsx → todas las rutas /admin.
 */
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { Ionicons } from "@expo/vector-icons";
import BotonAtrasAlcance from "../components/BotonAtrasAlcance";
import BrandLoadingScreen from "../components/BrandLoadingScreen";
import Campanita from "../components/Campanita";
import CookieConsentBanner from "../components/CookieConsentBanner";
import LineaPensadoraEfectoSiri from "../components/lineapensadoraefectosiri";
import SiteHead from "../components/SiteHead";

// Máximo que se espera a la fuente de iconos antes de mostrar la tienda igualmente.
const BOOT_FONT_TIMEOUT_MS = 1500;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(Ionicons.font);
  const [fontTimedOut, setFontTimedOut] = useState(false);
  // La web se genera de antemano SIN saber el tamaño de la pantalla (ancho 1024 por
  // defecto). Si la tienda se pintara ya en esa versión, al arrancar en el móvil React no
  // corrige los estilos que no coinciden y se quedan medidas de ordenador (buscador de
  // 758 px en un móvil de 390, categorías una por fila…). Por eso la versión pre-generada
  // y el primer pintado son la pantalla de carga, y la tienda se pinta solo cuando ya está
  // montada en el dispositivo, con su ancho real.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  useEffect(() => {
    if (fontsLoaded || fontError) return;
    const timer = setTimeout(() => setFontTimedOut(true), BOOT_FONT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [fontsLoaded, fontError]);

  // Nunca se bloquea: si la fuente falla o tarda más de 1,5 s, se entra igual.
  const bootLoading = !montado || (!fontsLoaded && !fontError && !fontTimedOut);

  if (bootLoading) {
    return <BrandLoadingScreen message="Cargando tienda..." />;
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
        }}
      >
        {/* Navegación principal inferior */}
        <Stack.Screen name="(tabs)" />

        {/* Rutas públicas / complementarias fuera de tabs */}
        <Stack.Screen name="catalogo" />
        <Stack.Screen name="servicios" />
        <Stack.Screen name="checkout" />
        <Stack.Screen name="vender" />
        <Stack.Screen name="reset-password" />

        {/* Políticas (envíos, devoluciones, privacidad, términos) y Blog */}
        <Stack.Screen name="politicas/[slug]" />
        <Stack.Screen name="blog/index" />

        {/* Producto dinámico */}
        <Stack.Screen name="producto/[id]" />

        {/* Servicio dinámico */}
        <Stack.Screen name="servicio/[id]" />

        {/* Chat privado por producto (cliente) */}
        <Stack.Screen name="chat/[chatId]" />

        {/* Admin */}
        <Stack.Screen name="admin" />

        {/* Modal global */}
        <Stack.Screen
          name="modal"
          options={{
            presentation: "modal",
          }}
        />
      </Stack>

      {/* Blue, asistente flotante (antes campanita): por encima de TODO, en todas las pantallas. */}
      <Campanita />

      {/* «Volver» a mano del pulgar derecho en las páginas de lectura. */}
      <BotonAtrasAlcance />

      {/* Aviso de cookies/analítica: por encima de todo salvo /admin. */}
      <CookieConsentBanner />

      {/* Barra "Pensando": se enciende sola mientras algo carga. */}
      <LineaPensadoraEfectoSiri />

      {/* Título/descripción/logo para Google y el navegador. No pinta nada. */}
      <SiteHead />
    </View>
  );
}