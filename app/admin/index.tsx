// app/admin/index.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  View,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";

const COLORS = {
  bg: "#071E33",
  bg2: "#061A2C",
  card: "rgba(255,255,255,0.06)",
  cardSoft: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.12)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.75)",
  muted2: "rgba(255,255,255,0.58)",
  accent: "#00AAE4",
  accent2: "rgba(0,170,228,0.16)",
  accentBorder: "rgba(0,170,228,0.45)",
  successBg: "rgba(34,197,94,0.14)",
  successBorder: "rgba(34,197,94,0.30)",
  warningBg: "rgba(250,204,21,0.12)",
  warningBorder: "rgba(250,204,21,0.30)",
  dangerBg: "rgba(255,59,48,0.12)",
  dangerBorder: "rgba(255,59,48,0.35)",
};

type AdminUserState = {
  checking: boolean;
  email: string | null;
  isAdmin: boolean;
};

function softShadow() {
  return Platform.select<any>({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.24,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 3 },
    default: {},
  });
}

function CardButton({
  title,
  subtitle,
  onPress,
  icon,
  badge,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
  icon?: string;
  badge?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 20,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.card,
        padding: 16,
        opacity: pressed ? 0.9 : 1,
        ...softShadow(),
      })}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
            {icon ? `${icon} ` : ""}
            {title}
          </Text>

          <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 20 }}>
            {subtitle}
          </Text>
        </View>

        {!!badge && (
          <View
            style={{
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: COLORS.accentBorder,
              backgroundColor: COLORS.accent2,
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
              {badge}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function SmallStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 140,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.cardSoft,
        padding: 14,
      }}
    >
      <Text style={{ color: COLORS.muted2, fontWeight: "700", fontSize: 12 }}>
        {icon ? `${icon} ` : ""}
        {label}
      </Text>
      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18, marginTop: 6 }}>
        {value}
      </Text>
    </View>
  );
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18 }}>{title}</Text>
      {!!subtitle && (
        <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 19 }}>{subtitle}</Text>
      )}
    </View>
  );
}

export default function AdminHome() {
  const [userState, setUserState] = useState<AdminUserState>({
    checking: true,
    email: null,
    isAdmin: false,
  });
  const [loggingOut, setLoggingOut] = useState(false);

  const validateAdminAccess = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setUserState({
          checking: false,
          email: null,
          isAdmin: false,
        });
        router.replace("/admin/login");
        return;
      }

      const userId = session.user.id;
      const email = session.user.email ?? null;

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle<{ role: string | null }>();

      if (error) {
        try {
          await supabase.auth.signOut();
        } catch {
          // ignore
        }
        setUserState({
          checking: false,
          email: null,
          isAdmin: false,
        });
        router.replace("/admin/login");
        return;
      }

      const role = String(profile?.role ?? "").trim().toLowerCase();
      const isAdmin = role === "admin";

      if (!isAdmin) {
        try {
          await supabase.auth.signOut();
        } catch {
          // ignore
        }
        setUserState({
          checking: false,
          email,
          isAdmin: false,
        });
        router.replace("/admin/login");
        return;
      }

      setUserState({
        checking: false,
        email,
        isAdmin: true,
      });
    } catch {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
      setUserState({
        checking: false,
        email: null,
        isAdmin: false,
      });
      router.replace("/admin/login");
    }
  }, []);

  useEffect(() => {
    validateAdminAccess();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      validateAdminAccess();
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [validateAdminAccess]);

  const actions = useMemo(
    () => [
      {
        key: "categories",
        title: "Categorías",
        subtitle:
          "Crear, ordenar, activar o desactivar las secciones que definen la navegación comercial de la tienda.",
        icon: "🗂️",
        badge: "Base",
        onPress: () => router.push("/admin/categories"),
      },
      {
        key: "products",
        title: "Productos",
        subtitle:
          "Crear, editar, publicar, revisar precio, imágenes, estado y visibilidad de cada producto.",
        icon: "🧩",
        badge: "Ventas",
        onPress: () => router.push("/admin/products"),
      },
      {
        key: "inventario",
        title: "Inventario",
        subtitle:
          "Control interno de stock y operativa. Si todavía no lo usas, puede quedarse como fase posterior.",
        icon: "📦",
        badge: "Opcional",
        onPress: () => router.push("/admin/inventario"),
      },
    ],
    []
  );

  const quickActions = useMemo(
    () => [
      {
        key: "go-store",
        label: "Ver tienda pública",
        onPress: () => router.replace("/"),
      },
      {
        key: "go-catalog",
        label: "Abrir catálogo",
        onPress: () => router.push("/catalogo"),
      },
      {
        key: "go-products",
        label: "Gestionar productos",
        onPress: () => router.push("/admin/products"),
      },
    ],
    []
  );

  const logout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);

    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    } finally {
      setLoggingOut(false);
      router.replace("/admin/login");
    }
  }, [loggingOut]);

  if (userState.checking) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <StatusBar barStyle="light-content" />
        <SafeAreaView style={{ flex: 1 }}>
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
              gap: 12,
            }}
          >
            <ActivityIndicator color={COLORS.text} />
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
              Comprobando acceso admin…
            </Text>
            <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 20 }}>
              Validando sesión y permisos antes de abrir el panel.
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="light-content" />

      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <View
          style={{
            backgroundColor: COLORS.bg2,
            borderBottomWidth: 1,
            borderBottomColor: "rgba(255,255,255,0.06)",
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 14,
            gap: 10,
          }}
        >
          <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "900" }}>
            Panel Admin
          </Text>

          <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
            Gestiona categorías, productos y estructura comercial. Lo que publiques aquí
            es lo que el cliente percibe fuera.
          </Text>

          <View
            style={{
              alignSelf: "flex-start",
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: COLORS.successBorder,
              backgroundColor: COLORS.successBg,
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>
              Admin activo{userState.email ? ` · ${userState.email}` : ""}
            </Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 10,
              marginTop: 2,
            }}
          >
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
                  <ActivityIndicator color={COLORS.text} />
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>Saliendo…</Text>
                </View>
              ) : (
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Cerrar sesión</Text>
              )}
            </Pressable>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28, gap: 14 }}>
          <View
            style={{
              borderRadius: 22,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.card,
              padding: 16,
              gap: 12,
              ...softShadow(),
            }}
          >
            <SectionTitle
              title="Vista general"
              subtitle="Este panel debe servir para operar rápido, publicar bien y no convertir la tienda en un mercadillo desordenado."
            />

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <SmallStat label="Acceso" value="Protegido" icon="🔐" />
              <SmallStat label="Rol" value="Admin" icon="👤" />
              <SmallStat label="Objetivo" value="Publicar bien" icon="🚀" />
            </View>
          </View>

          <View>
            <SectionTitle
              title="Gestión principal"
              subtitle="Las tres piezas clave del sistema. Aquí está el núcleo operativo."
            />

            <View style={{ gap: 12 }}>
              {actions.map((a) => (
                <CardButton
                  key={a.key}
                  title={a.title}
                  subtitle={a.subtitle}
                  icon={a.icon}
                  badge={a.badge}
                  onPress={a.onPress}
                />
              ))}
            </View>
          </View>

          <View
            style={{
              borderRadius: 22,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.cardSoft,
              padding: 16,
              gap: 10,
            }}
          >
            <SectionTitle
              title="Operativa rápida"
              subtitle="Atajos directos para no perder tiempo navegando por el panel."
            />

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {quickActions.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={item.onPress}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.88 : 1,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: COLORS.accentBorder,
                    backgroundColor: COLORS.accent2,
                  })}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View
            style={{
              borderRadius: 22,
              borderWidth: 1,
              borderColor: COLORS.warningBorder,
              backgroundColor: COLORS.warningBg,
              padding: 16,
              gap: 10,
            }}
          >
            <SectionTitle
              title="Checklist de publicación"
              subtitle="Esto es lo mínimo para que la tienda pública deje de parecer vacía o rota."
            />

            <Text style={{ color: COLORS.text, lineHeight: 21 }}>
              1) Crear o activar categorías útiles{"\n"}
              2) Crear productos con título, precio e imagen{"\n"}
              3) Asignar categoría correcta{"\n"}
              4) Poner <Text style={{ fontWeight: "900" }}>status = PUBLISHED</Text> y{" "}
              <Text style={{ fontWeight: "900" }}>is_active = true</Text>
              {"\n"}
              5) Revisar ficha pública en <Text style={{ fontWeight: "900" }}>/catalogo</Text> y{" "}
              <Text style={{ fontWeight: "900" }}>/producto/[id]</Text>
            </Text>
          </View>

          <View
            style={{
              borderRadius: 22,
              borderWidth: 1,
              borderColor: COLORS.dangerBorder,
              backgroundColor: COLORS.dangerBg,
              padding: 16,
              gap: 8,
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
              Regla importante
            </Text>
            <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
              No publiques por publicar. Un catálogo con cuatro productos bien montados vende
              más que veinte fichas mediocres. Aquí o queda serio o queda cutre, no hay término medio.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}