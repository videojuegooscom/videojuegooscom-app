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
import { Animated, Easing, Modal, Pressable, Text, View } from "react-native";
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

export function VentanaInformacion({ item, onClose }: { item: DatoConfianza | null; onClose: () => void }) {
  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 20 }}
        onPress={onClose}
      >
        <Pressable
          onPress={() => {}}
          style={{ width: "100%", maxWidth: 380, backgroundColor: "#FFFFFF", borderRadius: 20, padding: 20, gap: 12, alignItems: "center" }}
        >
          {/* Cerrar en la esquina (absoluto) para no descentrar icono y título. */}
          <Pressable onPress={onClose} hitSlop={10} style={{ position: "absolute", top: 16, right: 16 }}>
            <Ionicons name="close" size={20} color={COLORES_TEXTO.secundario} />
          </Pressable>
          {item ? <Ionicons name={item.icon} size={24} color={ACCENT_CONFIANZA} /> : null}
          <Text style={{ color: "#0B2138", fontWeight: "900", fontSize: 16, textAlign: "center" }}>{item?.title ?? ""}</Text>
          <Text style={{ color: COLORES_TEXTO.secundario, lineHeight: 20, textAlign: "center" }}>{item?.detail ?? ""}</Text>
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

// Con `href`, es un enlace de verdad (<a href> en la web, para que Google lo siga), como «Noticias».
function FooterLink({ label, onPress, href, nativeID }: { label: string; onPress?: () => void; href?: Href; nativeID?: string }) {
  const boton = (
    <Pressable
      nativeID={nativeID}
      onPress={onPress}
      accessibilityRole={href ? "link" : undefined}
      // Dentro de <Link asChild> el estilo tiene que ser un objeto (con una función, Link lo pierde).
      style={href ? { paddingVertical: 6 } : ({ pressed }) => ({ opacity: pressed ? 0.7 : 1, paddingVertical: 6 })}
    >
      <Text
        style={{
          color: "rgba(11,33,56,0.72)",
          fontWeight: "700",
          lineHeight: 20,
          textAlign: "center",
        }}
      >
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

function FooterAccordionSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
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
  }, [open, openAnim]);

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: LINE, overflow: "hidden" }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => ({
          opacity: pressed ? 0.8 : 1,
          paddingVertical: 14,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        })}
      >
        <Text style={{ color: NAVY, fontWeight: "900", fontSize: 15 }}>{title}</Text>

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
          style={{ paddingBottom: 12, alignItems: "center", gap: 2 }}
        >
          {children}
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
  const [footerNavOpen, setFooterNavOpen] = useState(false);
  const [footerPoliciesOpen, setFooterPoliciesOpen] = useState(false);
  const [footerCompramosOpen, setFooterCompramosOpen] = useState(false);
  const [footerBlogOpen, setFooterBlogOpen] = useState(false);
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
            <FooterAccordionSection
              title="Navegación"
              open={footerNavOpen}
              onToggle={() => setFooterNavOpen((value) => !value)}
            >
              <FooterLink label="Inicio" onPress={() => pushRoute("/" as Href)} />
              <FooterLink label="Categorías" onPress={handlePressCategorias} />
              <FooterLink label="Catálogo" onPress={() => pushRoute("/catalogo" as Href)} />
              <FooterLink label="Cesta" onPress={() => pushRoute("/cesta" as Href)} />
              <FooterLink label="Finalizar compra" onPress={() => pushRoute("/checkout" as Href)} />
              <FooterLink label="Perfil" onPress={() => pushRoute("/perfil" as Href)} />
              <FooterLink label="Foro" onPress={() => pushRoute("/chat-global" as Href)} />
              <FooterLink label="Noticias" nativeID="pie-noticias" href={"/noticias" as Href} />
              <FooterLink label="Blue IA" onPress={() => pushRoute("/blue-ia" as Href)} />
              <FooterLink label="Quiénes somos" onPress={() => pushRoute("/quienes-somos" as Href)} />
            </FooterAccordionSection>

            {/* «Compramos tu…» (2026-11-24): enlaces de verdad para que Google encuentre las 5 páginas. */}
            <FooterAccordionSection
              title="Te lo compramos"
              open={footerCompramosOpen}
              onToggle={() => setFooterCompramosOpen((value) => !value)}
            >
              <FooterLink label="Tu consola" href={"/compramos/consolas" as Href} />
              <FooterLink label="Tu móvil" href={"/compramos/moviles" as Href} />
              <FooterLink label="Tu portátil" href={"/compramos/portatiles" as Href} />
              <FooterLink label="Tu PC y periféricos" href={"/compramos/pc" as Href} />
              <FooterLink label="Tu iPad o tablet" href={"/compramos/tablets" as Href} />
            </FooterAccordionSection>

            <FooterAccordionSection
              title="Políticas"
              open={footerPoliciesOpen}
              onToggle={() => setFooterPoliciesOpen((value) => !value)}
            >
              <FooterLink
                label="Política de envíos"
                onPress={() => pushRoute("/politicas/envios" as Href)}
              />
              <FooterLink
                label="Política de devoluciones"
                onPress={() => pushRoute("/politicas/devoluciones" as Href)}
              />
              <FooterLink
                label="Política de privacidad"
                onPress={() => pushRoute("/politicas/privacidad" as Href)}
              />
              <FooterLink
                label="Términos y condiciones"
                onPress={() => pushRoute("/politicas/terminos" as Href)}
              />
            </FooterAccordionSection>

            <FooterAccordionSection
              title="Blog"
              open={footerBlogOpen}
              onToggle={() => setFooterBlogOpen((value) => !value)}
            >
              <FooterLink label="Últimos artículos" onPress={() => pushRoute("/blog" as Href)} />
              <FooterLink
                label="Guías de compra"
                onPress={() => pushRoute("/blog?open=elegir-consola-segunda-mano" as Href)}
              />
              <FooterLink
                label="Consejos y mantenimiento"
                onPress={() => pushRoute("/blog?open=mantenimiento-consola" as Href)}
              />
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
