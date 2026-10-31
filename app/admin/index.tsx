// app/admin/index.tsx
/**
 * Qué hace: pantalla de inicio del panel admin. La comprobación de sesión y
 * rol "admin" la hace app/admin/_layout.tsx antes de montar esta pantalla,
 * así que aquí no hay lógica de sesión: solo la cabecera (título "Panel de
 * Administración" + subtítulo "Áreas principales de gestión de la tienda" +
 * volver a la tienda) y, ocupando el resto de la pantalla, la rejilla de
 * accesos a Categorías, Productos, Servicios, Pedidos, Inventario,
 * Cotizaciones, Chat, Noticias Flash, Políticas, Blog, Visitas y métricas,
 * Usuarios y participación, Marca y SEO, Redes sociales y Centro De
 * Aprendizajes (15 tarjetas: en móvil la rejilla de 2 columnas).
 *
 * Cómo funciona: antes la cabecera incluía además un párrafo explicativo,
 * una insignia "Administrador activo · email" y el botón "Cerrar sesión";
 * se quitaron a petición de Jefe para que la cabecera sea mínima. El
 * antiguo encabezado de sección "Gestión principal" (con su propio
 * subtítulo repetido) se quitó a petición de Jefe: el título y subtítulo
 * ahora viven una sola vez, en la cabecera de arriba, y la rejilla de
 * tarjetas empieza justo debajo. Las tarjetas de acceso (CardButton) son
 * azulejos de un único color (el acento de la marca) con animación al
 * pulsar (escala + opacidad), sin la burbuja de categoría
 * ("Base"/"Ventas"/"Stock"/"Solicitudes") que tenían antes. En móvil se
 * apilan en rejilla de 2 columnas (igual que "Categorías" en Inicio); en
 * escritorio se quedan en lista de una columna con más detalle (icono +
 * título + subtítulo). Tema claro (fondo blanco, texto azul marino,
 * acentos azul claro) con contenido centrado en pantallas anchas
 * (columnStyle, maxWidth 1040).
 *
 * Novedades: cada recuadro con movimiento de fuera lleva en su esquina un
 * número rojo (como el de Blue) con lo nuevo desde la última vez que se abrió
 * esa sección en este móvil: pedidos, solicitudes de servicio, cotizaciones,
 * artículos llegados de VeoAura, ventas o errores de VeoAura, usuarios y
 * reseñas nuevos y revisiones; el chat, las conversaciones sin leer. Se
 * cuenta al abrir el panel, al volver a él y cada 2 minutos (contarNovedades)
 * y la sección queda vista al entrar (app/admin/_layout.tsx). Los recuadros
 * sin movimiento de fuera (Categorías, Inventario, Políticas…) no llevan
 * número.
 *
 * Cabecera y scroll: la cabecera es la misma franja fija y compacta que en
 * el resto de pestañas del panel (AdminHeader: flecha para volver —aquí, a
 * la tienda— y título centrado); el subtítulo y la rejilla van debajo, en
 * un único ScrollView (flex 1, margen final 48 px + zona segura).
 *
 * Conectado con:
 * - app/admin/categories.tsx, app/admin/products.tsx, app/admin/services.tsx,
 *   app/admin/inventario.tsx, app/admin/cotizaciones.tsx, app/admin/chats.tsx,
 *   app/admin/flash-news.tsx, app/admin/policies.tsx, app/admin/blog.tsx,
 *   app/admin/analytics.tsx, app/admin/users.tsx, app/admin/marca-seo.tsx,
 *   app/admin/redes-sociales.tsx, app/admin/aprendizajes.tsx,
 *   app/admin/pedidos.tsx, app/admin/escaparate.tsx → destino de las tarjetas de "Gestión principal".
 * - app/admin/_layout.tsx → si el acceso no es válido redirige a /perfil
 *   (sin sesión) o a / (sesión sin rol admin).
 * - app/admin/products/products.components.tsx → AdminHeader (cabecera común).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { AdminHeader } from "../../lib/admin/products.components";
import { leerPanelVistos, type SeccionConNovedades } from "../../lib/admin/products.utils";
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
  // El rojo del número de novedades (el mismo que el de Blue).
  danger: "#DC2626",
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

// ---------------------------------------------------------------------------------------------------------------------
// Novedades de cada recuadro: solo lo que llega de fuera (clientes, VeoAura o la revisión automática) desde la última vez
// que se abrió esa sección en este móvil (lib/admin/products.utils.ts; la primera vez, lo de los últimos 7 días). El chat
// cuenta las conversaciones con mensajes del cliente sin leer, como la campanita (get_unread_chat_count), se haya abierto
// o no la sección. Se cuenta sin descargar filas (solo el número). Si algo falla, ese recuadro no enseña nada: nunca un
// número inventado. Los recuadros sin movimiento de fuera (Categorías, Inventario, Políticas…) no llevan contador.
// ---------------------------------------------------------------------------------------------------------------------
type Novedad = { n: number; texto: string };
type Novedades = Partial<Record<SeccionConNovedades, Novedad>>;

const DIAS_PRIMERA_VEZ = 7;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

async function contarNovedades(): Promise<Novedades> {
  const vistos = await leerPanelVistos();
  const haceDias = new Date(Date.now() - DIAS_PRIMERA_VEZ * 86400000).toISOString();
  const desde = (s: SeccionConNovedades) => vistos[s] ?? haceDias;
  const cuantos = async (consulta: PromiseLike<{ count: number | null; error: unknown }>) => {
    try {
      const { count, error } = await consulta;
      return error ? 0 : Math.max(0, count ?? 0);
    } catch {
      return 0;
    }
  };
  const solo = { count: "exact" as const, head: true };
  const [pedidos, servicios, cotizaciones, chats, productos, escaparate, registros, resenas, revisiones] = await Promise.all([
    cuantos(supabase.from("pedidos").select("id", solo).gt("created_at", desde("pedidos"))),
    cuantos(supabase.from("service_requests").select("id", solo).gt("created_at", desde("services"))),
    cuantos(supabase.from("sell_requests").select("id", solo).gt("created_at", desde("cotizaciones"))),
    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_unread_chat_count");
        return error ? 0 : Math.max(0, Number(data) || 0);
      } catch {
        return 0;
      }
    })(),
    // Artículos que han llegado de VeoAura (los que crea el administrador no son novedad para él).
    cuantos(supabase.from("products").select("id", solo).not("id_veoaura", "is", null).gt("created_at", desde("products"))),
    // De VeoAura: artículos vendidos allí y avisos que no se pudieron guardar.
    cuantos(supabase.from("escaparate_registro").select("id", solo).or("resultado.eq.error,evento.eq.vendido").gt("recibido_en", desde("escaparate"))),
    cuantos(supabase.from("profiles").select("id", solo).or("role.is.null,role.neq.admin").gt("created_at", desde("users"))),
    cuantos(supabase.from("store_reviews").select("id", solo).gt("created_at", desde("users"))),
    cuantos(supabase.from("auditorias_web").select("id", solo).gt("ejecutada_en", desde("auditorias"))),
  ]);
  const novedad = (n: number, texto: string): Novedad | undefined => (n > 0 ? { n, texto } : undefined);
  const participacion = [
    registros ? plural(registros, "usuario nuevo", "usuarios nuevos") : "",
    resenas ? plural(resenas, "reseña nueva", "reseñas nuevas") : "",
  ].filter(Boolean);
  return {
    pedidos: novedad(pedidos, plural(pedidos, "pedido nuevo", "pedidos nuevos")),
    services: novedad(servicios, plural(servicios, "solicitud de servicio nueva", "solicitudes de servicio nuevas")),
    cotizaciones: novedad(cotizaciones, plural(cotizaciones, "cotización nueva", "cotizaciones nuevas")),
    chats: novedad(chats, plural(chats, "conversación sin leer", "conversaciones sin leer")),
    products: novedad(productos, plural(productos, "artículo nuevo de VeoAura", "artículos nuevos de VeoAura")),
    escaparate: novedad(escaparate, plural(escaparate, "aviso de VeoAura (venta o error)", "avisos de VeoAura (ventas o errores)")),
    users: novedad(registros + resenas, participacion.join(" y ")),
    auditorias: novedad(revisiones, plural(revisiones, "revisión nueva", "revisiones nuevas")),
  };
}

// El número rojo de un recuadro (como el de Blue): aparece con un pequeño salto y vuelve a saltar si cambia.
function InsigniaNovedades({ seccion, n, enLinea }: { seccion: string; n: number; enLinea?: boolean }) {
  const escala = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    escala.setValue(0.4);
    Animated.spring(escala, { toValue: 1, useNativeDriver: Platform.OS !== "web", speed: 14, bounciness: 12 }).start();
  }, [n, escala]);
  return (
    <Animated.View
      nativeID={`novedades-${seccion}`}
      pointerEvents="none"
      // Lo dice el propio recuadro («Pedidos, 3 pedidos nuevos»): el número no se lee dos veces.
      aria-hidden
      style={{
        ...(enLinea ? {} : { position: "absolute" as const, top: 8, right: 8 }),
        minWidth: 26,
        height: 26,
        borderRadius: 13,
        paddingHorizontal: 6,
        backgroundColor: COLORS.danger,
        borderWidth: 2,
        borderColor: "#FFFFFF",
        alignItems: "center",
        justifyContent: "center",
        transform: [{ scale: escala }],
      }}
    >
      <Text style={{ color: "#FFFFFF", fontSize: 12.5, fontWeight: "900" }}>{n > 99 ? "99+" : String(n)}</Text>
    </Animated.View>
  );
}

function CardButton({
  seccion,
  title,
  subtitle,
  onPress,
  icon,
  isMobile,
  novedad,
}: {
  seccion: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  icon?: IoniconName;
  isMobile?: boolean;
  novedad?: Novedad;
}) {
  return (
    <Pressable
      onPress={onPress}
      // La descripción ya no se pinta (el panel va limpio); queda para lectores de pantalla, igual que lo nuevo.
      accessibilityRole="button"
      accessibilityLabel={novedad ? `${title}, ${novedad.texto}` : title}
      accessibilityHint={subtitle}
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

        </View>
      </View>

      {/* En el móvil, el número va en la esquina del recuadro; en pantallas anchas, antes de la flecha. */}
      {novedad && isMobile ? <InsigniaNovedades seccion={seccion} n={novedad.n} /> : null}
      {!isMobile ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {novedad ? <InsigniaNovedades seccion={seccion} n={novedad.n} enLinea /> : null}
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.85)" />
        </View>
      ) : null}
    </Pressable>
  );
}

export default function AdminHome() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const pagePadding = isMobile ? 12 : 16;
  const insets = useSafeAreaInsets();

  // Novedades: se cuentan al abrir el panel, al volver a él desde una sección y cada 2 minutos mientras está abierto.
  const [novedades, setNovedades] = useState<Novedades>({});
  useFocusEffect(
    useCallback(() => {
      let vivo = true;
      const contar = () => {
        void contarNovedades().then((n) => {
          if (vivo) setNovedades(n);
        });
      };
      contar();
      const cada = setInterval(contar, 120000);
      return () => {
        vivo = false;
        clearInterval(cada);
      };
    }, [])
  );
  // Al tocar un recuadro su número se va enseguida (al entrar, la sección queda vista: app/admin/_layout.tsx).
  const abrir = useCallback((seccion: string, abrirSeccion: () => void) => {
    setNovedades((v) => ({ ...v, [seccion]: undefined }));
    abrirSeccion();
  }, []);

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
        key: "pedidos",
        title: "Pedidos",
        subtitle: "Pedidos de la tienda: estado, entrega y datos del cliente",
        icon: "receipt-outline" as IoniconName,
        onPress: () => router.push("/admin/pedidos"),
      },
      {
        key: "escaparate",
        title: "Escaparate VeoAura",
        subtitle: "Lo que llega de VeoAura, sus visitas y las ventas de la tienda avisadas a VeoAura",
        icon: "swap-horizontal-outline" as IoniconName,
        onPress: () => router.push("/admin/escaparate"),
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
          "Hasta 5 avisos para Blue IA: el asistente flotante los muestra y los usa al responder.",
        icon: "flash-outline" as IoniconName,
        onPress: () => router.push("/admin/flash-news"),
      },
      {
        key: "auditorias",
        title: "Revisiones",
        subtitle:
          "La tienda se revisa sola los días 1 y 15 con la lista de 20 puntos de calidad web: aquí queda cuándo se hizo y qué se encontró.",
        icon: "clipboard-outline" as IoniconName,
        onPress: () => router.push("/admin/auditorias"),
      },
      {
        key: "conocimiento",
        title: "Lo que Blue sabe",
        subtitle:
          "Horario, envíos, garantía, pagos…: respuestas reales que Blue IA usa con tus clientes. Blue te propone temas durante el día.",
        icon: "bulb-outline" as IoniconName,
        onPress: () => router.push("/admin/conocimiento"),
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
      {
        key: "marca-seo",
        title: "Marca y SEO",
        subtitle:
          "Logo de la tienda y el título/descripción que se ven al buscarla en Google y en el navegador.",
        icon: "image-outline" as IoniconName,
        onPress: () => router.push("/admin/marca-seo"),
      },
      {
        key: "redes-sociales",
        title: "Redes sociales",
        subtitle:
          "Instagram, TikTok, WhatsApp, YouTube y Gmail: añade o quita los enlaces que se ven en el pie de página, Perfil y la Cesta.",
        icon: "share-social-outline" as IoniconName,
        onPress: () => router.push("/admin/redes-sociales"),
      },
      {
        key: "aprendizajes",
        title: "Centro De Aprendizajes",
        subtitle:
          "Lo que le corriges a Claude: reglas de diseño, textos, negocio y código que consulta antes de cada cambio.",
        icon: "school-outline" as IoniconName,
        onPress: () => router.push("/admin/aprendizajes"),
      },
    ],
    []
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

        {/* Misma cabecera fija y compacta que el resto del panel; aquí la
            flecha vuelve a la tienda. */}
        <AdminHeader
          title="Panel de control"
          isMobile={isMobile}
          onBack={() => router.replace("/")}
          backLabel="Volver a la tienda"
        />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: pagePadding,
            // Margen final + zona segura: el botón "Volver a la tienda" nunca queda pegado abajo.
            paddingBottom: 48 + insets.bottom,
            alignItems: "center",
          }}
          showsVerticalScrollIndicator={false}
        >
        <View style={{ ...columnStyle, gap: isMobile ? 16 : 20 }}>
          <View>
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
                  seccion={a.key}
                  title={a.title}
                  subtitle={a.subtitle}
                  icon={a.icon}
                  onPress={() => abrir(a.key, a.onPress)}
                  isMobile={isMobile}
                  novedad={novedades[a.key as SeccionConNovedades]}
                />
              ))}
            </View>

            <Pressable
              onPress={() => router.replace("/")}
              style={({ pressed }) => ({
                alignSelf: "center",
                width: "100%",
                maxWidth: 420,
                opacity: pressed ? 0.85 : 1,
                paddingVertical: 12,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "#E3EAF2",
                backgroundColor: "#F6FAFD",
                marginTop: 24,
              })}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>
                Volver a la tienda
              </Text>
            </Pressable>
          </View>
        </View>
        </ScrollView>
    </View>
  );
}