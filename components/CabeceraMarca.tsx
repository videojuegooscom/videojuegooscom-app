// components/CabeceraMarca.tsx
/**
 * Qué hace: la barra de arriba de las páginas con «volver»: a la izquierda el botón de volver con
 * el diseño de la tienda (círculo azul de marca con la flecha blanca, un aro fino por dentro y un
 * resplandor azul suave) y, siempre centrado, el nombre «VideojuegosZaragoza». Sustituye a las
 * flechas sueltas de cada página para que todas se vean y se comporten igual.
 *
 * Cómo funciona: sin pasar nada, «volver» regresa en el historial y, si no lo hay, va a Inicio.
 * Con `onBack` se usa esa acción. BotonVolver también se exporta por si hace falta solo.
 *
 * Conectado con: app/catalogo.tsx, app/servicios.tsx, app/servicio/[id].tsx, app/producto/[id].tsx,
 * app/blog/index.tsx, app/politicas/[slug].tsx, app/checkout.tsx, app/chat/[chatId].tsx y
 * components/VenderAhoraModal.tsx (página «Vender»).
 */
import React from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

const AZUL = "#1EA7E8";
const MARINO = "#0B2138";

export function volverAtras() {
  try {
    if (typeof router.canGoBack === "function" && router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // sin historial: Inicio
  }
  router.replace("/");
}

export function BotonVolver({ onPress, tamano = 40 }: { onPress?: () => void; tamano?: number }) {
  return (
    <Pressable
      onPress={onPress ?? volverAtras}
      accessibilityRole="button"
      accessibilityLabel="Volver atrás"
      hitSlop={8}
      style={({ pressed }) => ({
        width: tamano,
        height: tamano,
        borderRadius: tamano / 2,
        backgroundColor: AZUL,
        alignItems: "center",
        justifyContent: "center",
        transform: [{ scale: pressed ? 0.92 : 1 }],
        shadowColor: AZUL,
        shadowOpacity: 0.38,
        shadowRadius: 9,
        shadowOffset: { width: 0, height: 3 },
        elevation: 4,
        ...(Platform.OS === "web" ? ({ cursor: "pointer", transitionProperty: "transform", transitionDuration: "120ms" } as object) : {}),
      })}
    >
      {/* Aro fino por dentro: el sello de la tienda. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 3,
          left: 3,
          right: 3,
          bottom: 3,
          borderRadius: (tamano - 6) / 2,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.5)",
        }}
      />
      <Ionicons name="chevron-back" size={Math.round(tamano * 0.55)} color="#FFFFFF" style={{ marginLeft: -1 }} />
    </Pressable>
  );
}

export default function CabeceraMarca({ onBack }: { onBack?: () => void }) {
  return (
    <View style={{ width: "100%", height: 44, justifyContent: "center", alignItems: "center" }}>
      <View style={{ position: "absolute", left: 0, top: 2 }}>
        <BotonVolver onPress={onBack} />
      </View>
      <Text
        numberOfLines={1}
        style={{ color: MARINO, fontSize: 17, fontWeight: "900", letterSpacing: -0.2, textAlign: "center", paddingHorizontal: 52 }}
      >
        Videojuegos<Text style={{ color: AZUL }}>Zaragoza</Text>
      </Text>
    </View>
  );
}
