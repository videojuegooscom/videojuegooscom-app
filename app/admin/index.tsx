// app/admin/index.tsx
/**
 * Qué hace: pantalla de inicio del panel admin. La comprobación de sesión y
 * rol "admin" la hace app/admin/_layout.tsx antes de montar esta pantalla,
 * así que aquí no hay lógica de sesión: solo la cabecera (título + volver a
 * la tienda) y, ocupando el resto de la pantalla, "Gestión principal" con
 * los accesos a Categorías, Productos, Servicios, Inventario, Cotizaciones,
 * Chat, Noticias Flash, Políticas, Blog, Visitas y métricas, y Usuarios y
 * participación (11 tarjetas: en móvil la rejilla de 2 columnas queda
 * 2-2-2-2-2-1).
 *
 * Cómo funciona: antes la cabecera incluía además un párrafo explicativo,
 * una insignia "Administrador activo · email" y el botón "Cerrar sesión";
 * se quitaron a petición de Jefe para que la cabecera sea mínima y ese
 * espacio lo aproveche directamente "Gestión principal". Las tarjetas de
 * acceso (CardButton) son ahora azulejos de un único color (el acento de la
 * marca) con animación al pulsar (escala + opacidad), sin la burbuja de
 * categoría ("Base"/"Ventas"/"Stock"/"Solicitudes") que tenían antes. En
 * móvil se apilan en rejilla de 2 columnas (igual que "Categorías" en
 * Inicio); en escritorio se quedan en lista de una columna con más detalle
 * (icono + título + subtítulo). Tema claro (fondo blanco, texto azul
 * marino, acentos azul claro) con contenido centrado en pantallas anchas
 * (columnStyle, maxWidth 1040).
 *
 * Conectado con:
 * - app/admin/categories.tsx, app/admin/products.tsx, app/admin/services.tsx,
 *   app/admin/inventario.tsx, app/admin/cotizaciones.tsx, app/admin/chats.tsx,
 *   app/admin/flash-news.tsx, app/admin/policies.tsx, app/admin/blog.tsx,
 *   app/admin/analytics.tsx, app/admin/users.tsx → destino de las tarjetas
 *   de "Gestión principal".
 * - app/admin/login.tsx → destino cuando el acceso no es válido
 *   (gestionado por app/admin/_layout.tsx).
 */
import React, { useMemo } from "react";
import {
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
  isMobile,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
  icon?: IoniconName;
  isMobile?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={
        ({ pressed }) =>
          ({
            width: "100%",
            minHeight: isMobile ? 132 : undefined,
            borderRadius: 20,
            backgroundColor: COLORS.accent,
            padding: isMobile ? 14 : 18,
            opacity: pressed ? 0.78 : 1,
            transform: [{ scale: pressed ? 0.93 : 1 }],
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "center" : "center",
            justifyContent: isMobile ? "flex-start" : "space-between",
            gap: isMobile ? 8 : 14,
            transitionProperty: "transform, opacity, box-shadow",
            transitionDuration: "160ms",
            transitionTimingFunction: "ease-out",
            ...softShadow(),
          } as any)
      }
    >
      <View
        style={{
          flexDirection: isMobile ? "column" : "row",
          alignItems: "center",
          gap: isMobile ? 8 : 14,
          flex: isMobile ? undefined : 1,
        }}
      >
        <View
          style={{
            width: isMobile ? 44 : 46,
            height: isMobile ? 44 : 46,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(255,255,255,0.22)",
          }}
        >
          {icon ? <Ionicons name={icon} size={22} color="#FFFFFF" /> : null}
        </View>

        <View style={{ flex: isMobile ? undefined : 1, alignItems: isMobile ? "center" : "flex-start" }}>
          <Text
            style={{
              color: "#FFFFFF",
              fontWeight: "900",
              fontSize: isMobile ? 14.5 : 16,
              lineHeight: isMobile ? 19 : 22,
              textAlign: isMobile ? "center" : "left",
            }}
          >
            {title}
          </Text>

          {!isMobile && (
            <Text
              style={{
                color: "rgba(255,255,255,0.85)",
                marginTop: 4,
                lineHeight: 19,
                fontSize: 13,
              }}
            >
              {subtitle}
            </Text>
          )}
        </View>
      </View>

      {!isMobile && <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.85)" />}
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
    <View style={{ marginBottom: 10, alignItems: "center" }}>
      <Text
        style={{
          color: COLORS.text,
          fontWeight: "900",
          fontSize: isMobile ? 17 : 18,
          lineHeight: isMobile ? 22 : 24,
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      {!!subtitle && (
        <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 19, textAlign: "center" }}>
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

  const actions = useMemo(
    () => [
      {
        key: "categories",
        title: "Categorías",
        subtitle:
          "Crear, ordenar, activar o desactivar las secciones que definen la navegación comercial de la tienda.",
        icon: "folder-outline" as IoniconName,
        onPress: () => router.push("/admin/categories"),
      },
      {
        key: "products",
        title: "Productos",
        subtitle:
          "Crear, editar, publicar, revisar precio, imágenes, estado y visibilidad de cada producto.",
        icon: "pricetags-outline" as IoniconName,
        onPress: () => router.push("/admin/products"),
      },
      {
        key: "services",
        title: "Servicios",
        subtitle:
          "Reparación, limpieza y mantenimiento: ficha, precio, fotos y solicitudes de contratación.",
        icon: "construct-outline" as IoniconName,
        onPress: () => router.push("/admin/services"),
      },
      {
        key: "inventario",
        title: "Inventario",
        subtitle:
          "Control interno de existencias y operativa de almacén.",
        icon: "cube-outline" as IoniconName,
        onPress: () => router.push("/admin/inventario"),
      },
      {
        key: "cotizaciones",
        title: "Cotizaciones",
        subtitle:
          "Solicitudes de \"Vender ahora\" enviadas por clientes: artículo, estado, ciudad y precio esperado.",
        icon: "document-text-outline" as IoniconName,
        onPress: () => router.push("/admin/cotizaciones"),
      },
      {
        key: "chats",
        title: "Chat",
        subtitle:
          "Conversaciones privadas de clientes por producto: elige a la persona correcta y márcala como vendida.",
        icon: "chatbubbles-outline" as IoniconName,
        onPress: () => router.push("/admin/chats"),
      },
      {
        key: "flash-news",
        title: "Noticias Flash",
        subtitle:
          "Hasta 5 mensajes rotando en la franja superior: texto, color y segundos en pantalla de cada uno.",
        icon: "flash-outline" as IoniconName,
        onPress: () => router.push("/admin/flash-news"),
      },
      {
        key: "policies",
        title: "Políticas",
        subtitle:
          "Envíos, devoluciones, privacidad y términos: título, texto y secciones de cada página legal.",
        icon: "document-text-outline" as IoniconName,
        onPress: () => router.push("/admin/policies"),
      },
      {
        key: "blog",
        title: "Blog",
        subtitle:
          "Crea, edita, publica o pasa a borrador los artículos del Blog de la app.",
        icon: "newspaper-outline" as IoniconName,
        onPress: () => router.push("/admin/blog"),
      },
      {
        key: "analytics",
        title: "Visitas y métricas",
        subtitle:
          "Visitantes, recorrido por la tienda (Inicio, Categoría, Producto, Reseñas) y crecimiento por fechas.",
        icon: "stats-chart-outline" as IoniconName,
        onPress: () => router.push("/admin/analytics"),
      },
      {
        key: "users",
        title: "Usuarios y participación",
        subtitle:
          "Usuarios registrados, mensajes en el foro, chats de producto y reseñas de cada uno.",
        icon: "people-outline" as IoniconName,
        onPress: () => router.push("/admin/users"),
      },
    ],
    []
  );

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
              textAlign: "center",
            }}
          >
            Panel de Administración
          </Text>
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

            <View
              style={
                isMobile
                  ? ({
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    } as any)
                  : { flexDirection: "column", gap: 12 }
              }
            >
              {actions.map((a) => (
                <CardButton
                  key={a.key}
                  title={a.title}
                  subtitle={a.subtitle}
                  icon={a.icon}
                  onPress={a.onPress}
                  isMobile={isMobile}
                />
              ))}
            </View>

            <Pressable
              onPress={() => router.replace("/")}
              style={({ pressed }) => ({
                alignSelf: isMobile ? "stretch" : "flex-start",
                opacity: pressed ? 0.85 : 1,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "#E3EAF2",
                backgroundColor: "#F6FAFD",
                marginTop: 16,
              })}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>
                Volver a la tienda
              </Text>
            </Pressable>
          </View>
        </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}