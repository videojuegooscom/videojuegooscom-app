// components/PromoBanner.tsx
/**
 * Qué hace: franja promocional "Te compramos tu consola en menos de 24h" con
 * el botón "Vender Ya". Antes solo vivía en app/(tabs)/index.tsx; ahora es un
 * componente aparte para poder mostrarla arriba del todo en las 5 pestañas
 * principales de la app (Inicio, Perfil, Cesta, Chat, Blue IA), no solo en
 * Inicio, así la llamada a vender está siempre a mano.
 *
 * Cómo funciona: es un componente de presentación sin estado propio de
 * negocio — recibe onPressVender y cada pantalla decide qué hacer (en la
 * práctica, abrir su propio VenderAhoraModal con un estado local "sellModalOpen";
 * mismo patrón de duplicar un poco de estado sencillo por archivo que ya sigue
 * el resto del proyecto, en vez de compartir un store global). Calcula su
 * propio responsive (isMobile) con useWindowDimensions para no depender de
 * que cada pantalla se lo pase.
 *
 * Conectado con:
 * - app/(tabs)/index.tsx → la usa dentro de su propio Animated.View que la
 *   oculta/muestra al hacer scroll (esa animación de ocultar es solo de
 *   Inicio; aquí no hace falta reimplementarla).
 * - app/(tabs)/perfil.tsx, cesta.tsx, chat-global.tsx, blue-ia.tsx → la
 *   muestran fija arriba del todo, siempre visible.
 * - components/VenderAhoraModal.tsx → el formulario "Vender ahora" que cada
 *   pantalla abre desde onPressVender.
 */
import React from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const COLORS = {
  text: "#0B2138",
  warningBg: "rgba(255, 178, 0, 0.14)",
  warningBorder: "rgba(255, 178, 0, 0.45)",
};

export default function PromoBanner({
  onPressVender,
}: {
  onPressVender: () => void;
}) {
  const { width } = useWindowDimensions();
  const widthSafe = width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;

  return (
    <View
      style={{
        backgroundColor: COLORS.warningBg,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.warningBorder,
        paddingVertical: isMobile ? 7 : 10,
        paddingHorizontal: isMobile ? 16 : 24,
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 920,
          alignSelf: "center",
          flexDirection: isMobile ? "column" : "row",
          alignItems: "center",
          justifyContent: "center",
          gap: isMobile ? 6 : 12,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
          }}
        >
          <Ionicons name="flash-outline" size={isMobile ? 13 : 16} color={COLORS.text} />
          <Text
            numberOfLines={2}
            style={{
              color: COLORS.text,
              fontWeight: "900",
              fontSize: isMobile ? 12 : 15,
              lineHeight: isMobile ? 16 : 20,
              textAlign: "center",
            }}
          >
            Te compramos tu consola en menos de 24h
          </Text>
        </View>

        <Pressable
          onPress={onPressVender}
          style={({ pressed }) => ({
            opacity: pressed ? 0.85 : 1,
            paddingVertical: isMobile ? 6 : 8,
            paddingHorizontal: isMobile ? 11 : 14,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: COLORS.warningBorder,
            backgroundColor: COLORS.warningBg,
            flexShrink: 0,
          })}
        >
          <Text
            style={{
              color: COLORS.text,
              fontWeight: "900",
              fontSize: isMobile ? 12 : 14,
            }}
          >
            Vender Ya
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
