// app/app/_layout.tsx
import React from "react";
import { Stack } from "expo-router";

export default function RootLayout() {
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