// app/_layout.tsx
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
      {/* Public */}
      <Stack.Screen name="index" />
      <Stack.Screen name="catalogo" />
      <Stack.Screen name="carrito" />
      <Stack.Screen name="checkout" />

      {/* Producto (ruta /producto/[id]) */}
      <Stack.Screen name="producto/[id]" />

      {/* Admin (carpeta app/admin) */}
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
