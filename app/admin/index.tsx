// app/admin/index.tsx
/**
 * Qué hace: pantalla de inicio del panel admin. Comprueba que hay sesión y
 * que el usuario tiene rol "admin" en la tabla profiles; si no, cierra
 * sesión y redirige al login. Si todo está bien, muestra directamente los
 * accesos a Categorías, Productos, Inventario y Cotizaciones ("Gestión
 * principal"), sin nada más de por medio.
 *
 * Cómo funciona: la comprobación de sesión + rol "admin" la hace
 * app/admin/_layout.tsx antes de montar cualquier pantalla del panel, así
 * que esta pantalla ya no la repite (antes duplicaba esa misma consulta a
 * "profiles" en cada carga); aquí solo se lee el email de la sesión para
 * mostrarlo en la cabecera. Antes había además un bloque "Vista general"
 * (3 datos fijos sin utilidad real: Acceso/Rol/Objetivo), "Operativa
 * rápida", una checklist de publicación y un aviso "Regla importante": se
 * quitaron a petición de Jefe para que la pantalla vaya directa al grano y
 * "Gestión principal" ocupe el espacio nada más entrar. Tema claro (fondo
 * blanco, texto azul marino, acentos azul claro) con contenido centrado en
 * pantallas anchas (columnStyle, maxWidth 1040).
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase para sesión, perfil y logout.
 * - app/admin/categories.tsx, app/admin/products.tsx,
 *   app/admin/inventario.tsx, app/admin/cotizaciones.tsx → destino de las
 *   tarjetas de "Gestión principal".
 * - app/admin/login.tsx → destino cuando el acceso no es válido.
 */
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
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  cardSoft: "#F8FBFE",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.48)",
  accent: "#1EA7E8",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  successBg: "#DCFCE7",
  successBorder: "#86EFAC",
  warningBg: "#FEF3C7",
  warningBorder: "#FDE68A",
  dangerBg: "#FFE4E6",
  dangerBorder: "#FDA4AF",
};

// Ancho máximo centrado para pantallas grandes (web/tablet); en móvil ocupa el 100%.
const columnStyle = { width: "100%", maxWidth: 1040, alignSelf: "center" } as const;

type AdminUserState = {
  email: string | null;
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
  isMobile,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
  icon?: IoniconName;
  badge?: string;
  isMobile?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 20,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.card,
        padding: isMobile ? 14 : 16,
        opacity: pressed ? 0.9 : 1,
        ...softShadow(),
      })}
    >
      <View
        style={{
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "flex-start" : "flex-start",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {icon ? <Ionicons name={icon} size={16} color={COLORS.text} /> : null}
            <Text
              style={{
                color: COLORS.text,
                fontWeight: "900",
                fontSize: isMobile ? 15 : 16,
                lineHeight: 22,
              }}
            >
              {title}
            </Text>
          </View>

          <Text
            style={{
              color: COLORS.muted,
              marginTop: 6,
              lineHeight: 20,
              fontSize: isMobile ? 13 : 14,
            }}
          >
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
              alignSelf: isMobile ? "flex-start" : "flex-start",
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

function SectionTitle({
  title,
  subtitle,
  isMobile,
}: {
  title: string;
  subtitle?: string;
  isMobile?: boolean;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text
        style={{
          color: COLORS.text,
          fontWeight: "900",
          fontSize: isMobile ? 17 : 18,
          lineHeight: isMobile ? 22 : 24,
        }}
      >
        {title}
      </Text>
      {!!subtitle && (
        <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 19 }}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}

export default function AdminHome() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const pagePadding = isMobile ? 12 : 16;

  const [userState, setUserState] = useState<AdminUserState>({
    email: null,
  });
  const [loggingOut, setLoggingOut] = useState(false);

  // La comprobación de sesión + rol "admin" ya la hace app/admin/_layout.tsx
  // antes de montar esta pantalla (bloquea el Stack hasta que se valida), así
  // que aquí no se repite: solo se lee el email de la sesión activa para
  // mostrarlo en la cabecera.
  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (active) setUserState({ email: session?.user?.email ?? null });
      })
      .catch(() => {
        // Si falla, simplemente no se muestra el email; _layout.tsx es quien
        // decide si hay que expulsar al login.
      });

    return () => {
      active = false;
    };
  }, []);

  const actions = useMemo(
    () => [
      {
        key: "categories",
        title: "Categorías",
        subtitle:
          "Crear, ordenar, activar o desactivar las secciones que definen la navegación comercial de la tienda.",
        icon: "folder-outline" as IoniconName,
        badge: "Base",
        onPress: () => router.push("/admin/categories"),
      },
      {
        key: "products",
        title: "Productos",
        subtitle:
          "Crear, editar, publicar, revisar precio, imágenes, estado y visibilidad de cada producto.",
        icon: "pricetags-outline" as IoniconName,
        badge: "Ventas",
        onPress: () => router.push("/admin/products"),
      },
      {
        key: "inventario",
        title: "Inventario",
        subtitle:
          "Control interno de existencias y operativa de almacén.",
        icon: "cube-outline" as IoniconName,
        badge: "Stock",
        onPress: () => router.push("/admin/inventario"),
      },
      {
        key: "cotizaciones",
        title: "Cotizaciones",
        subtitle:
          "Solicitudes de \"Vender ahora\" enviadas por clientes: artículo, estado, ciudad y precio esperado.",
        icon: "document-text-outline" as IoniconName,
        badge: "Solicitudes",
        onPress: () => router.push("/admin/cotizaciones"),
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

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <View
          style={{
            backgroundColor: COLORS.bg2,
            borderBottomWidth: 1,
            borderBottomColor: "#F6FAFD",
            paddingHorizontal: pagePadding,
            paddingTop: isMobile ? 12 : 14,
            paddingBottom: 14,
            gap: 10,
          }}
        >
        <View style={{ ...columnStyle, gap: 10 }}>
          <Text
            style={{
              color: COLORS.text,
              fontSize: isMobile ? 22 : 24,
              fontWeight: "900",
              lineHeight: isMobile ? 28 : 30,
            }}
          >
            Panel de Administración
          </Text>

          <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
            Gestiona las categorías, los productos y la estructura comercial de la tienda.
            El contenido que publiques aquí es exactamente lo que verán tus clientes.
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
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
              Administrador activo{userState.email ? ` · ${userState.email}` : ""}
            </Text>
          </View>

          <View
            style={{
              flexDirection: isMobile ? "column" : "row",
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
                borderColor: "#E3EAF2",
                backgroundColor: "#F6FAFD",
                width: isMobile ? "100%" : undefined,
              })}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>
                Volver a la tienda
              </Text>
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
                width: isMobile ? "100%" : undefined,
              })}
            >
              {loggingOut ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <ActivityIndicator color={COLORS.text} />
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>Saliendo…</Text>
                </View>
              ) : (
                <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>
                  Cerrar sesión
                </Text>
              )}
            </Pressable>
          </View>
        </View>
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: pagePadding,
            paddingBottom: 28,
            alignItems: "center",
          }}
        >
        <View style={{ ...columnStyle, gap: 14 }}>
          <View>
            <SectionTitle
              title="Gestión principal"
              subtitle="Accede a las áreas principales de gestión de la tienda."
              isMobile={isMobile}
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
                  isMobile={isMobile}
                />
              ))}
            </View>
          </View>
        </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}