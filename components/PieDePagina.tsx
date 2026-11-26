/**
 * Archivo: components/PieDePagina.tsx
 * Función: componente del pie de página de la tienda.
 * Para qué sirve: pinta el pie completo (navegación, políticas, blog, redes sociales, «Mejoras en la tienda» y copyright) con acordeones plegables, y se monta al final de Inicio, Perfil, Cesta, Quiénes somos y Noticias.
 * Conectado con: components/EnlacesRedesSociales.tsx, components/marca/MarcaAnimada.tsx, components/VentanaValoracion.tsx (MejorasModal).
 * Utilizado por: app/(tabs)/index.tsx, app/(tabs)/perfil.tsx, app/(tabs)/cesta.tsx, app/quienes-somos.tsx, app/noticias/index.tsx.
 * Dependencias: @expo/vector-icons, expo-router, react, react-native.
 * Estado: ACTIVO
 *
 * Notas: cabecera original conservada justo debajo.
 */
/**
 * Notas:
 * Qué hace: pie de página completo de la tienda — navegación, políticas,
 * blog, redes sociales y copyright — en una banda BLANCA de lado a lado,
 * separada del contenido solo por una línea fina superior (#E3EAF2). Sin
 * degradados ni recuadros: limpio, centrado y con el logo animado arriba.
 *
 * Antes este bloque vivía solo dentro de app/(tabs)/index.tsx (Inicio), así
 * que Perfil y Cesta se quedaban "cortadas" justo después de su propio
 * contenido, sin pie de página. Se sacó a un componente aparte para poder
 * montarlo también ahí sin duplicar el mismo bloque tres veces.
 *
 * Cómo funciona:
 * - sidePadding: el padding horizontal que ya usa la pantalla que lo monta.
 *   Se "rompe" con marginHorizontal negativo para que la línea superior
 *   llegue de borde a borde de la pantalla.
 * - contentMaxWidth: ancho máximo de la columna interior. Por defecto 640;
 *   Inicio pasa su propio ancho para que case con el resto de secciones.
 * - onPressCategorias: qué hacer al tocar "Categorías". En Inicio hace
 *   scroll hasta esa sección; si no se indica, lleva al catálogo.
 * - Navegación / Políticas / Blog son acordeones plegables (altura y flecha
 *   animadas con Animated), separados entre sí por líneas finas.
 * - «Mejoras en la tienda» (a la vista, debajo): abre la cajita de ideas
 *   (MejorasModal de components/VentanaValoracion.tsx, origen «pie»).
 *
 * Conectado con:
 * - components/EnlacesRedesSociales.tsx → fila de iconos de redes sociales.
 * - components/marca/MarcaAnimada.tsx → logo animado del pie.
 * - app/(tabs)/index.tsx, app/(tabs)/perfil.tsx, app/(tabs)/cesta.tsx →
 *   pantallas que lo montan al final de su scroll.
 * - app/noticias/index.tsx → «Noticias» (en Navegación), enlace de verdad para
 *   que Google llegue a las noticias.
 */
import { Ionicons } from "@expo/vector-icons";
import type { Href } from "expo-router";
import { Link, router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, PanResponder, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORES_TEXTO, TACTIL, TAMANOS } from "../constants/temaTienda";
import EnlacesRedesSociales from "./EnlacesRedesSociales";
import MarcaAnimada from "./marca/MarcaAnimada";
import { VentanaMejoras } from "./VentanaValoracion";

// --- «Compra con confianza» (antes solo en app/(tabs)/index.tsx; desde el 2026-11-26 también al final de cada categoría
// del catálogo, app/catalogo.tsx). Información sencilla (icono + texto, sin fondo ni borde); al tocar un aviso se abre
// VentanaInformacion con el detalle. Textos con las condiciones reales de la tienda.
export type DatoConfianza = { icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; detail: string };

export const DATOS_CONFIANZA: DatoConfianza[] = [
  {
    icon: "checkmark-circle-outline",
    title: "Garantía",
    detail: "Todo lo que vendemos incluye garantía de tienda: si algo falla, te lo solucionamos sin líos.",
  },
  {
    icon: "cube-outline",
    title: "Envíos en España",
    detail:
      "Enviamos a toda España bien protegido y con seguimiento: sale en 1-2 días y llega en 72 horas como máximo. En Zaragoza te lo llevamos el mismo día, a domicilio o en mano en Cuarte de Huerva.",
  },
  {
    icon: "shield-checkmark-outline",
    title: "Productos revisados",
    detail: "Cada producto pasa una revisión de funcionamiento antes de ponerse a la venta.",
  },
  {
    icon: "flash-outline",
    title: "Pago rápido",
    // Condiciones de compra del 2026-11-26 (las de las páginas «Compramos»).
    detail: "Si nos vendes tu consola o electrónica, te la tasamos en menos de 30 minutos y te pagamos al momento.",
  },
];

export function FilaConfianza({ isMobile, onPressItem }: { isMobile?: boolean; onPressItem: (item: DatoConfianza) => void }) {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "center",
        columnGap: isMobile ? 12 : 28,
        rowGap: TACTIL.separacion,
      }}
    >
      {DATOS_CONFIANZA.map((item) => (
        <Pressable
          key={item.title}
          onPress={() => onPressItem(item)}
          accessibilityRole="button"
          style={({ pressed }) => ({
            opacity: pressed ? 0.65 : 1,
            flexDirection: "row",
            alignItems: "center",
            // 44 px de alto para el dedo y 8 px de separación entre avisos.
            minHeight: TACTIL.minimo,
            paddingHorizontal: 4,
            gap: 8,
          })}
        >
          <Ionicons name={item.icon} size={19} color={ACCENT_CONFIANZA} />
          <Text style={{ color: COLORES_TEXTO.secundario, fontWeight: "700", fontSize: TAMANOS.cuerpo }}>{item.title}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * El detalle de un aviso de «Compra con confianza», como hoja que sube desde abajo (dueño, 2026-11-26: «que se pueda
 * usar perfectamente con el dedo gordo de la mano derecha»): abajo, «‹» anterior, «Entendido» y «›» siguiente (48 px
 * de alto); también se pasa deslizando a izquierda o derecha, con las flechas del teclado, y se cierra tocando fuera o
 * con Escape. `onCambiar` recibe el aviso al que se pasa.
 */
export function VentanaInformacion({ item, onClose, onCambiar }: { item: DatoConfianza | null; onClose: () => void; onCambiar?: (item: DatoConfianza) => void }) {
  const insets = useSafeAreaInsets();
  const i = item ? DATOS_CONFIANZA.findIndex((d) => d.title === item.title) : -1;
  const total = DATOS_CONFIANZA.length;
  const ir = (paso: number) => {
    if (i < 0) return;
    const siguiente = DATOS_CONFIANZA[(i + paso + total) % total];
    if (onCambiar) onCambiar(siguiente);
  };
  const irRef = useRef(ir);
  irRef.current = ir;
  const arrastre = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_e, g) => {
        if (g.dx <= -50) irRef.current(1);
        else if (g.dx >= 50) irRef.current(-1);
      },
    })
  ).current;
  useEffect(() => {
    if (!item || Platform.OS !== "web" || typeof window === "undefined") return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") irRef.current(1);
      else if (e.key === "ArrowLeft") irRef.current(-1);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [item]);

  const flecha = (paso: number, nombre: string, icono: "chevron-back" | "chevron-forward") => (
    <Pressable
      nativeID={`confianza-${paso < 0 ? "anterior" : "siguiente"}`}
      onPress={() => ir(paso)}
      accessibilityRole="button"
      accessibilityLabel={nombre}
      style={({ pressed }) => ({ width: 56, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF6FD", opacity: pressed ? 0.75 : 1 })}
    >
      <Ionicons name={icono} size={24} color={COLORES_TEXTO.azulTexto} />
    </Pressable>
  );

  return (
    <Modal visible={!!item} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable nativeID="confianza-fondo" style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end", alignItems: "center" }} onPress={onClose}>
        <Pressable
          nativeID="confianza-ventana"
          onPress={() => {}}
          {...arrastre.panHandlers}
          style={{
            width: "100%",
            maxWidth: 520,
            backgroundColor: "#FFFFFF",
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            paddingTop: 10,
            paddingHorizontal: 20,
            paddingBottom: 16 + Math.round(insets.bottom),
            gap: 12,
            alignItems: "center",
          }}
        >
          {/* Asa de la hoja. */}
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: "#D6E2EE" }} />
          {item ? <Ionicons name={item.icon} size={28} color={ACCENT_CONFIANZA} /> : null}
          <Text accessibilityRole="header" style={{ color: "#0B2138", fontWeight: "900", fontSize: 18, textAlign: "center" }}>
            {item?.title ?? ""}
          </Text>
          <Text style={{ color: COLORES_TEXTO.secundario, fontSize: TAMANOS.cuerpo, lineHeight: 22, textAlign: "center", minHeight: 66 }}>{item?.detail ?? ""}</Text>
          {/* Dónde estás: un punto por aviso. */}
          <View nativeID="confianza-puntos" accessibilityLabel={`${i + 1} de ${total}`} style={{ flexDirection: "row", gap: 6 }}>
            {DATOS_CONFIANZA.map((d, k) => (
              <View key={d.title} style={{ width: k === i ? 18 : 7, height: 7, borderRadius: 4, backgroundColor: k === i ? ACCENT_CONFIANZA : "#D6E2EE" }} />
            ))}
          </View>
          {/* Abajo, al alcance del pulgar: anterior, «Entendido» (cierra) y siguiente. */}
          <View style={{ width: "100%", flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 }}>
            {flecha(-1, "Aviso anterior", "chevron-back")}
            <Pressable
              nativeID="confianza-cerrar"
              onPress={onClose}
              accessibilityRole="button"
              style={({ pressed }) => ({ flex: 1, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: ACCENT_CONFIANZA, opacity: pressed ? 0.85 : 1 })}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>Entendido</Text>
            </Pressable>
            {flecha(1, "Aviso siguiente", "chevron-forward")}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
const ACCENT_CONFIANZA = "#1EA7E8";

// Paleta del pie: fondo blanco, textos en azul marino y acento azul.
const FOOTER_BG = "#FFFFFF";
const NAVY = "#0B2138";
const ACCENT = "#1EA7E8";
const LINE = "#E3EAF2";
const BRAND_NAME = "Videojuegoszaragoza.com";

function pushRoute(route: Href) {
  router.push(route);
}

type IconoPie = React.ComponentProps<typeof Ionicons>["name"];

// Cada enlace es una casilla de la rejilla (dueño, 2026-11-26: «más profesional, como si lo hiciera un diseñador»):
// icono azul y nombre, fondo azul muy suave, 48 px de alto. Con `href`, es un enlace de verdad (<a href> en la web,
// para que Google lo siga), como «Noticias» y las páginas «Compramos».
function FooterLink({ label, icon, onPress, href, nativeID }: { label: string; icon: IconoPie; onPress?: () => void; href?: Href; nativeID?: string }) {
  const casilla = { minHeight: 48, borderRadius: 14, backgroundColor: "#F4F9FD", paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row" as const, alignItems: "center" as const, gap: 8 };
  const boton = (
    <Pressable
      nativeID={nativeID}
      onPress={onPress}
      accessibilityRole={href ? "link" : "button"}
      // Dentro de <Link asChild> el estilo tiene que ser un objeto (con una función, Link lo pierde).
      style={href ? casilla : ({ pressed }) => ({ ...casilla, opacity: pressed ? 0.7 : 1 })}
    >
      <Ionicons name={icon} size={18} color={ACCENT} />
      <Text numberOfLines={2} style={{ flexShrink: 1, color: NAVY, fontWeight: "700", fontSize: TAMANOS.minimo + 1, lineHeight: 18 }}>
        {label}
      </Text>
    </Pressable>
  );
  return href ? (
    <Link href={href} asChild>
      {boton}
    </Link>
  ) : (
    boton
  );
}

// Desplegable del pie: icono, título y flecha; dentro, los enlaces en rejilla de dos columnas (tres en el ordenador).
// Solo uno abierto a la vez (lo lleva PieDePagina) y, al abrirse, se encuadra solo en la pantalla, como las preguntas
// frecuentes de Inicio (dueño, 2026-11-26).
function FooterAccordionSection({
  id,
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  icon: IconoPie;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const [contentHeight, setContentHeight] = useState(0);
  const openAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(openAnim, {
      toValue: open ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // animamos "height", que no admite el driver nativo
    }).start();
    if (!open || Platform.OS !== "web" || typeof document === "undefined") return;
    const t = setTimeout(() => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.scrollMarginTop = "96px";
      el.style.scrollMarginBottom = "96px";
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 300);
    return () => clearTimeout(t);
  }, [open, openAnim, id]);

  return (
    <View nativeID={id} style={{ borderBottomWidth: 1, borderBottomColor: LINE, overflow: "hidden" }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => ({
          opacity: pressed ? 0.8 : 1,
          minHeight: 52,
          paddingVertical: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        })}
      >
        <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: open ? ACCENT : "#EAF6FD" }}>
          <Ionicons name={icon} size={16} color={open ? "#FFFFFF" : ACCENT} />
        </View>
        <Text style={{ color: NAVY, fontWeight: "900", fontSize: 16 }}>{title}</Text>

        <Animated.View
          style={{
            transform: [
              {
                rotate: openAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0deg", "180deg"],
                }),
              },
            ],
          }}
        >
          <Ionicons name="chevron-down" size={16} color={ACCENT} />
        </Animated.View>
      </Pressable>

      <Animated.View
        style={{
          height: openAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, contentHeight],
          }),
          opacity: openAnim,
          overflow: "hidden",
        }}
      >
        <View
          onLayout={(e) => setContentHeight(e.nativeEvent.layout.height)}
          style={{ position: "absolute", left: 0, right: 0, top: 0, paddingBottom: 14, paddingTop: 2 }}
        >
          <View nativeID={`${id}-enlaces`} style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
            {React.Children.map(children, (hijo) => (hijo ? <View style={{ width: "48%", minWidth: 0 }}>{hijo}</View> : null))}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

export default function PieDePagina({
  sidePadding,
  contentMaxWidth = 640,
  onPressCategorias,
}: {
  sidePadding: number;
  contentMaxWidth?: number;
  onPressCategorias?: () => void;
}) {
  // Solo un desplegable abierto a la vez (dueño, 2026-11-26).
  const [abierto, setAbierto] = useState<"nav" | "compramos" | "politicas" | "blog" | null>(null);
  const alternar = (cual: "nav" | "compramos" | "politicas" | "blog") => setAbierto((a) => (a === cual ? null : cual));
  const [mejorasAbierta, setMejorasAbierta] = useState(false);

  const handlePressCategorias =
    onPressCategorias ?? (() => pushRoute("/catalogo" as Href));

  return (
    // width:"100%" + alignSelf:"stretch": si la pantalla centra su contenido
    // (alignItems:"center"), sin esto el pie se encogería a su contenido y el
    // marginHorizontal negativo no llegaría de borde a borde.
    <View style={{ width: "100%", alignSelf: "stretch", marginTop: 8 }}>
      <View
        style={{
          marginHorizontal: -sidePadding,
          paddingHorizontal: sidePadding,
          paddingTop: 24,
          paddingBottom: 34,
          backgroundColor: FOOTER_BG,
          borderTopWidth: 1,
          borderTopColor: LINE,
        }}
      >
        <View style={{ width: "100%", maxWidth: contentMaxWidth, alignSelf: "center", gap: 12 }}>
          {/* Logo pequeño animado encima del nombre (se anima al tocarlo). */}
          <View style={{ alignItems: "center" }}>
            <MarcaAnimada cual="logo-mini" ancho={80} />
          </View>

          <Text
            style={{
              color: NAVY,
              fontWeight: "900",
              fontSize: 16,
              textAlign: "center",
            }}
          >
            {BRAND_NAME}
          </Text>

          <View style={{ borderTopWidth: 1, borderTopColor: LINE }}>
            <FooterAccordionSection id="pie-nav" title="Navegación" icon="compass-outline" open={abierto === "nav"} onToggle={() => alternar("nav")}>
              <FooterLink label="Inicio" icon="home-outline" onPress={() => pushRoute("/" as Href)} />
              <FooterLink label="Categorías" icon="grid-outline" onPress={handlePressCategorias} />
              <FooterLink label="Catálogo" icon="pricetags-outline" nativeID="pie-catalogo" href={"/catalogo" as Href} />
              <FooterLink label="Servicios" icon="construct-outline" nativeID="pie-servicios" href={"/servicios" as Href} />
              <FooterLink label="Cesta" icon="bag-handle-outline" onPress={() => pushRoute("/cesta" as Href)} />
              <FooterLink label="Finalizar compra" icon="card-outline" onPress={() => pushRoute("/checkout" as Href)} />
              <FooterLink label="Perfil" icon="person-outline" onPress={() => pushRoute("/perfil" as Href)} />
              <FooterLink label="Foro" icon="chatbubbles-outline" onPress={() => pushRoute("/chat-global" as Href)} />
              <FooterLink label="Noticias" icon="newspaper-outline" nativeID="pie-noticias" href={"/noticias" as Href} />
              <FooterLink label="Blue IA" icon="sparkles-outline" onPress={() => pushRoute("/blue-ia" as Href)} />
              <FooterLink label="Quiénes somos" icon="people-outline" onPress={() => pushRoute("/quienes-somos" as Href)} />
            </FooterAccordionSection>

            {/* «Compramos tu…» (2026-11-24): enlaces de verdad para que Google encuentre las 5 páginas. */}
            <FooterAccordionSection id="pie-compramos" title="Te lo compramos" icon="cash-outline" open={abierto === "compramos"} onToggle={() => alternar("compramos")}>
              <FooterLink label="Tu consola" icon="game-controller-outline" href={"/compramos/consolas" as Href} />
              <FooterLink label="Tu móvil" icon="phone-portrait-outline" href={"/compramos/moviles" as Href} />
              <FooterLink label="Tu portátil" icon="laptop-outline" href={"/compramos/portatiles" as Href} />
              <FooterLink label="Tu PC y periféricos" icon="desktop-outline" href={"/compramos/pc" as Href} />
              <FooterLink label="Tu iPad o tablet" icon="tablet-portrait-outline" href={"/compramos/tablets" as Href} />
            </FooterAccordionSection>

            <FooterAccordionSection id="pie-politicas" title="Políticas" icon="document-text-outline" open={abierto === "politicas"} onToggle={() => alternar("politicas")}>
              <FooterLink label="Envíos" icon="cube-outline" onPress={() => pushRoute("/politicas/envios" as Href)} />
              <FooterLink label="Devoluciones" icon="return-down-back-outline" onPress={() => pushRoute("/politicas/devoluciones" as Href)} />
              <FooterLink label="Privacidad" icon="lock-closed-outline" onPress={() => pushRoute("/politicas/privacidad" as Href)} />
              <FooterLink label="Términos y condiciones" icon="reader-outline" onPress={() => pushRoute("/politicas/terminos" as Href)} />
            </FooterAccordionSection>

            <FooterAccordionSection id="pie-blog" title="Blog" icon="book-outline" open={abierto === "blog"} onToggle={() => alternar("blog")}>
              <FooterLink label="Últimos artículos" icon="newspaper-outline" onPress={() => pushRoute("/blog" as Href)} />
              <FooterLink label="Guías de compra" icon="compass-outline" onPress={() => pushRoute("/blog?open=elegir-consola-segunda-mano" as Href)} />
              <FooterLink label="Consejos y mantenimiento" icon="construct-outline" onPress={() => pushRoute("/blog?open=mantenimiento-consola" as Href)} />
            </FooterAccordionSection>
          </View>

          {/* «Mejoras en la tienda»: a la vista (no dentro de un desplegable); abre la cajita de ideas. */}
          <Pressable
            nativeID="pie-mejoras"
            onPress={() => setMejorasAbierta(true)}
            accessibilityRole="button"
            accessibilityLabel="Mejoras en la tienda: cuéntanos qué mejorarías"
            style={({ pressed }) => ({
              minHeight: 44,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="bulb-outline" size={19} color={ACCENT} />
            <Text style={{ color: NAVY, fontWeight: "900", fontSize: 15 }}>Mejoras en la tienda</Text>
            <Ionicons name="chevron-forward" size={16} color={ACCENT} />
          </Pressable>
          <VentanaMejoras visible={mejorasAbierta} onClose={() => setMejorasAbierta(false)} origen="pie" />

          <View style={{ marginTop: 4 }}>
            <EnlacesRedesSociales titleColor={NAVY} />
          </View>

          <Text
            style={{
              color: "rgba(11,33,56,0.55)",
              marginTop: 6,
              lineHeight: 18,
              fontSize: 12,
              textAlign: "center",
            }}
          >
            © {new Date().getFullYear()} {BRAND_NAME}. Todos los derechos reservados.
          </Text>
        </View>
      </View>
    </View>
  );
}
