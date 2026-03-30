// app/app/_layout.tsx
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