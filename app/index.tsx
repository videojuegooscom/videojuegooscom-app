// app/index.tsx
import React from "react";
import { Pressable, StatusBar, Text, View } from "react-native";
import { router } from "expo-router";

const COLORS = {
  bg: "#071E33",
  bg2: "#061A2C",
  card: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.12)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.75)",
  accent: "#00AAE4",
};

export default function HomeScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="light-content" />

      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.06)",
          paddingHorizontal: 16,
          paddingTop: 18,
          paddingBottom: 16,
          gap: 6,
        }}
      >
        <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "900" }}>
          Videojuegoos
        </Text>
        <Text style={{ color: COLORS.muted }}>
          Catálogo público estilo Shopify (pero sin pagarle el alquiler a Shopify).
        </Text>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <Pressable
          onPress={() => router.push("/catalogo")}
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: "rgba(0,170,228,0.45)",
            backgroundColor: "rgba(0,170,228,0.16)",
            paddingVertical: 14,
            paddingHorizontal: 16,
          }}
        >
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
            Ver catálogo
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.80)", marginTop: 4 }}>
            Productos publicados y activos.
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/admin/login")}
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.card,
            paddingVertical: 14,
            paddingHorizontal: 16,
          }}
        >
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
            Panel admin
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.70)", marginTop: 4 }}>
            Inicia sesión para subir/editar productos.
          </Text>
        </Pressable>

        <View
          style={{
            marginTop: 8,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.card,
            padding: 14,
          }}
        >
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>
            Siguiente paso recomendado
          </Text>
          <Text style={{ color: COLORS.muted, marginTop: 6 }}>
            1) Crea tu usuario admin en Supabase Auth
            {"\n"}2) Pon tu role=admin en profiles
            {"\n"}3) Entra a /admin y crea categorías y productos
            {"\n"}4) Publica (status=PUBLISHED) y listo: se ven en /catalogo
          </Text>
        </View>
      </View>
    </View>
  );
}
