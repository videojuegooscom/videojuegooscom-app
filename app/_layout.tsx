// app/app/_layout.tsx
/**
 * Qué hace: layout raíz de toda la app (Expo Router). Muestra una pantalla
 * de carga de marca al arrancar y luego monta el Stack de navegación con
 * todas las rutas de nivel superior.
 *
 * Cómo funciona: usa expo-router Stack con headerShown:false (cada
 * pantalla dibuja su propia cabecera) y animación "fade" entre rutas.
 *
 * Pantalla de carga: se mantiene hasta que se cumplen DOS condiciones a la
 * vez — un mínimo de 1 segundo (para que la marca se vea, no sea un parpadeo)
 * Y que la fuente de iconos (Ionicons, usada por TODA la app: cabeceras,
 * botones, tarjetas...) haya terminado de descargarse, vía useFonts() de
 * expo-font. Antes solo dependía del segundo fijo: en la primera visita en
 * la web (o con conexión lenta/caché fría), si la fuente tardaba más de 1s
 * en llegar, la pantalla de carga desaparecía igualmente y la app real
 * aparecía con todos los iconos en blanco/invisibles durante un instante —
 * eso es lo que se veía "raro" hasta refrescar la página (momento en el que
 * la fuente ya estaba en la caché del navegador y cargaba al instante). Con
 * este cambio, la pantalla de carga no se quita hasta que los iconos ya
 * están listos para pintarse bien a la primera, sin depender de refrescar.
 *
 * Conectado con:
 * - components/BrandLoadingScreen.tsx → pantalla de carga inicial.
 * - components/Campanita.tsx → campanita flotante de notificaciones, se
 *   monta aquí UNA sola vez (fuera y por encima del Stack) para que
 *   aparezca en todas las pantallas y no se reinicie al navegar.
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
import BrandLoadingScreen from "../components/BrandLoadingScreen";
import Campanita from "../components/Campanita";

const MIN_BOOT_MS = 1000;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
  });
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, MIN_BOOT_MS);

    return () => clearTimeout(timer);
  }, []);

  // Si la fuente falla en cargar (fontError), no nos quedamos bloqueados
  // para siempre: se deja pasar igualmente pasado el segundo mínimo.
  const bootLoading = !minTimeElapsed || (!fontsLoaded && !fontError);

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

      {/* Campanita flotante: por encima de TODO, en todas las pantallas. */}
      <Campanita />
    </View>
  );
}