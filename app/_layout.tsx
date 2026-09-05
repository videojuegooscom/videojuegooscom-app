// app/app/_layout.tsx
/**
 * Qué hace: layout raíz de toda la app (Expo Router). Muestra una pantalla
 * de carga de marca durante 1 segundo al arrancar y luego monta el Stack
 * de navegación con todas las rutas de nivel superior.
 *
 * Cómo funciona: usa expo-router Stack con headerShown:false (cada
 * pantalla dibuja su propia cabecera) y animación "fade" entre rutas.
 *
 * Conectado con:
 * - components/BrandLoadingScreen.tsx → pantalla de carga inicial.
 * - app/(tabs)/_layout.tsx → navegación por pestañas (inicio, catálogo,
 *   cesta, chat, blue-ia, perfil...).
 * - app/catalogo.tsx, app/checkout.tsx, app/producto/[id].tsx,
 *   app/modal.tsx → rutas públicas fuera de las pestañas.
 * - app/admin/_layout.tsx → todas las rutas /admin.
 */
import React, { useEffect, useState } from "react";
import { Stack } from "expo-router";
import BrandLoadingScreen from "../components/BrandLoadingScreen";

export default function RootLayout() {
  const [bootLoading, setBootLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setBootLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  if (bootLoading) {
    return <BrandLoadingScreen message="Cargando tienda..." />;
  }

  return (
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
      <Stack.Screen name="checkout" />

      {/* Producto dinámico */}
      <Stack.Screen name="producto/[id]" />

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
  );
}