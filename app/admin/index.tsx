import React from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";

const COLORS = {
  bg: "#071E33",
  card: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.12)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.75)",
  accent: "#00AAE4",
};

export default function AdminHome() {
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg, padding: 16, gap: 12 }}>
      <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "900" }}>Panel Admin</Text>
      <Text style={{ color: COLORS.muted }}>
        Aquí gestionas categorías, productos, fotos y publicación.
      </Text>

      <Pressable
        onPress={() => router.push("../categories")}
        style={{
          borderRadius: 18,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.card,
          padding: 16,
        }}
      >
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>Categorías</Text>
        <Text style={{ color: COLORS.muted, marginTop: 6 }}>Crear, ordenar, activar/desactivar</Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("../products")}
        style={{
          borderRadius: 18,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.card,
          padding: 16,
        }}
      >
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>Productos</Text>
        <Text style={{ color: COLORS.muted, marginTop: 6 }}>Crear, editar, publicar, fotos</Text>
      </Pressable>

      <Pressable
        onPress={async () => {
          await supabase.auth.signOut();
          router.replace("/admin/login");
        }}
        style={{ marginTop: 10, alignSelf: "flex-start" }}
      >
        <Text style={{ color: COLORS.accent, fontWeight: "900" }}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}
