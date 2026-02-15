// app/admin/index.tsx
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StatusBar, Text, View } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";

const COLORS = {
  bg: "#071E33",
  bg2: "#061A2C",
  card: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.12)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.75)",
  accent: "#00AAE4",
  accent2: "rgba(0,170,228,0.16)",
  accentBorder: "rgba(0,170,228,0.45)",
};

function CardButton({
  title,
  subtitle,
  onPress,
  icon,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
  icon?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.card,
        padding: 16,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
        {icon ? `${icon} ` : ""}
        {title}
      </Text>
      <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 18 }}>{subtitle}</Text>
    </Pressable>
  );
}

export default function AdminHome() {
  const [loggingOut, setLoggingOut] = useState(false);

  const actions = useMemo(
    () => [
      {
        key: "categories",
        title: "Categorías",
        subtitle: "Crear, ordenar, activar/desactivar (lo que define el catálogo).",
        icon: "🗂️",
        onPress: () => router.push("/admin/categories"),
      },
      {
        key: "products",
        title: "Productos",
        subtitle: "Crear, editar, publicar, precio e imagen (lo que vende).",
        icon: "🧩",
        onPress: () => router.push("/admin/products"),
      },
      {
        key: "inventario",
        title: "Inventario (opcional)",
        subtitle: "Si lo usas: control interno. Si no, lo dejamos para luego.",
        icon: "📦",
        onPress: () => router.push("/admin/inventario"),
      },
    ],
    []
  );

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    } finally {
      router.replace("/admin/login");
      setLoggingOut(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.06)",
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 12,
          gap: 8,
        }}
      >
        <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "900" }}>Panel Admin</Text>
        <Text style={{ color: COLORS.muted }}>
          Gestiona categorías y productos. Publica y se ven en /catalogo.
        </Text>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
          <Pressable
            onPress={() => router.replace("/")}
            style={({ pressed }) => ({
              opacity: pressed ? 0.85 : 1,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.14)",
              backgroundColor: "rgba(255,255,255,0.06)",
            })}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>← Tienda</Text>
          </Pressable>

          <Pressable
            onPress={logout}
            disabled={loggingOut}
            style={({ pressed }) => ({
              opacity: loggingOut ? 0.55 : pressed ? 0.85 : 1,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: COLORS.accentBorder,
              backgroundColor: COLORS.accent2,
            })}
          >
            {loggingOut ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ActivityIndicator />
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Saliendo…</Text>
              </View>
            ) : (
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>Cerrar sesión</Text>
            )}
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28, gap: 12 }}>
        {/* Acciones */}
        {actions.map((a) => (
          <CardButton
            key={a.key}
            title={a.title}
            subtitle={a.subtitle}
            icon={a.icon}
            onPress={a.onPress}
          />
        ))}

        {/* Operativa rápida */}
        <View
          style={{
            marginTop: 4,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: "rgba(255,255,255,0.04)",
            padding: 14,
            gap: 8,
          }}
        >
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>Checklist rápido</Text>
          <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
            1) Crea/activa categorías{"\n"}
            2) Crea productos (precio + imagen){"\n"}
            3) Pon status=PUBLISHED + is_active=true{"\n"}
            4) Comprueba en /catalogo y en /producto/[id]
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
