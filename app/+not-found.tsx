/**
 * Qué hace: página para direcciones que no existen (Expo Router la usa sola).
 * Mascota del taller animada, un texto breve y un botón para volver a la portada.
 * Sobria y centrada, con la paleta de la tienda.
 */
import type { Href } from "expo-router";
import { router, Stack } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import MarcaAnimada from "../components/marca/MarcaAnimada";

const COLORS = {
  bg: "#FFFFFF",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  accent: "#1EA7E8",
  onAccent: "#FFFFFF",
};

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Página no encontrada" }} />
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.bg,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          gap: 14,
        }}
      >
        <MarcaAnimada cual="taller" ancho={180} />

        <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "900", textAlign: "center" }}>
          Esta página no existe
        </Text>
        <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center", maxWidth: 360 }}>
          Puede que el enlace esté mal escrito o que la página ya no esté disponible.
        </Text>

        {/* Vuelta a la portada (replace: no deja la página rota en el historial). */}
        <Pressable
          onPress={() => router.replace("/" as Href)}
          accessibilityRole="button"
          style={({ pressed }) => ({
            marginTop: 6,
            borderRadius: 18,
            backgroundColor: COLORS.accent,
            paddingVertical: 13,
            paddingHorizontal: 22,
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <Text style={{ color: COLORS.onAccent, fontWeight: "900", fontSize: 15, textAlign: "center" }}>
            Volver a la portada
          </Text>
        </Pressable>
      </View>
    </>
  );
}
