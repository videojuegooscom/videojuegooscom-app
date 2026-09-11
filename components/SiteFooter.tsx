// components/SiteFooter.tsx
/**
 * Qué hace: pie de página completo de la tienda — navegación, políticas,
 * blog, redes sociales y copyright — en una franja oscura de lado a lado,
 * con un difuminado suave en la parte de arriba en vez de un corte brusco de
 * color (antes empezaba de golpe con una línea recta; ahora se funde desde
 * el fondo de la pantalla, más moderno, como pidió Daniel).
 *
 * Antes este bloque vivía solo dentro de app/(tabs)/index.tsx (Inicio), así
 * que Perfil y Cesta se quedaban "cortadas" justo después de su propio
 * contenido, sin pie de página, y con pinta de página incompleta. Se sacó a
 * un componente aparte para poder montarlo también ahí sin duplicar el
 * mismo bloque tres veces.
 *
 * Cómo funciona:
 * - sidePadding: el padding horizontal que ya usa la pantalla que lo monta.
 *   Se usa para "romper" ese padding con marginHorizontal negativo, de forma
 *   que la franja oscura y su difuminado lleguen de verdad de borde a borde
 *   de la pantalla, no solo hasta donde llega la columna de contenido.
 * - contentMaxWidth: ancho máximo de la columna interior (título, acordeones,
 *   redes sociales, copyright), para que en pantallas anchas no quede todo
 *   estirado de lado a lado. Por defecto 640 (igual que usan ya Perfil y
 *   Cesta); Inicio pasa su propio containerMaxWidth para que el pie de
 *   página case con el ancho del resto de sus secciones.
 * - onPressCategorias: qué hacer al tocar el enlace "Categorías" del
 *   acordeón de navegación. En Inicio se pasa un scroll hasta esa sección;
 *   si no se indica nada, lleva al catálogo completo (app/catalogo.tsx).
 * - Navegación / Políticas / Blog son acordeones plegables — mismo patrón
 *   que ya usaba Inicio (altura y flecha animadas con Animated, sin
 *   librerías nuevas) — con su propio estado, independiente en cada
 *   pantalla que monte este componente.
 * - El difuminado de arriba es un LinearGradient (expo-linear-gradient, ya
 *   era dependencia del proyecto) de una altura fija — así no cambia aunque
 *   el contenido de debajo (acordeones abiertos, etc.) sí lo haga. Pasa por
 *   los azules claros de la propia marca (ver FADE_COLORS) antes de llegar
 *   al azul marino del pie, en vez de simplemente diluir ese azul marino
 *   con transparencia — eso último da gris, no azul claro (ver el
 *   comentario junto a FADE_COLORS).
 *
 * Conectado con:
 * - components/SocialLinks.tsx → fila de iconos de redes sociales.
 * - app/(tabs)/index.tsx, app/(tabs)/perfil.tsx, app/(tabs)/cesta.tsx →
 *   pantallas que lo montan al final de su scroll.
 */
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { Href } from "expo-router";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import SocialLinks from "./SocialLinks";

const BAND_BG = "#0B2138";
const CARD_BG = "#FFFFFF";
const CARD_TEXT = "#0B2138";
const BRAND_NAME = "Videojuegoszaragoza.com";

// Altura fija del difuminado de entrada, independiente de cuánto ocupe
// luego el contenido del pie (acordeones abiertos, etc.). Más alto que un
// simple degradado de dos colores (que con poca altura se ve como una
// mancha borrosa, no como una transición cuidada): con más recorrido y más
// paradas de color de por medio se lee como un fundido intencionado, típico
// de una web con más cuidado en el detalle.
const FADE_HEIGHT = 120;

// Paradas de color del difuminado. La primera versión iba de "azul marino
// transparente" a "azul marino sólido": mezclar un color muy oscuro con muy
// poca opacidad sobre un fondo blanco no da un azul claro, da un GRIS (la
// mezcla "diluye" el azul junto con el oscuro, así que a poca opacidad se
// ve neutra, sin color) — de ahí la pinta de mancha borrosa. Ahora se pasa
// por los azules claros de verdad que ya usa el resto de la tienda (el
// celeste muy claro de las insignias, el borde celeste de los inputs, el
// azul de acento) antes de llegar al azul marino del pie — así se ve un
// degradado de azul a azul, no de gris a azul.
const FADE_COLORS = [
  "#FFFFFF", // blanco, igual que el fondo de la pantalla
  "#EAF6FD", // celeste muy claro (mismo tono que las insignias de la app)
  "#BEE6FA", // celeste (mismo tono que los bordes de acento de la app)
  "#1EA7E8", // azul de acento de la marca
  "#123A5C", // azul intermedio, ya cerca del tono del pie
  BAND_BG, // azul marino del pie de página
] as const;
const FADE_LOCATIONS = [0, 0.2, 0.4, 0.58, 0.78, 1] as const;

function pushRoute(route: Href) {
  router.push(route);
}

function FooterLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.85 : 1,
        paddingVertical: 6,
      })}
    >
      <Text
        style={{
          color: "rgba(11,33,56,0.72)",
          fontWeight: "700",
          lineHeight: 20,
        }}
      >
        {label}
      </Text>
    </Pressable>
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
    <View
      style={{
        borderRadius: 18,
        backgroundColor: CARD_BG,
        overflow: "hidden",
      }}
    >
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => ({
          opacity: pressed ? 0.9 : 1,
          paddingVertical: 14,
          paddingHorizontal: 14,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        })}
      >
        <Text style={{ color: CARD_TEXT, fontWeight: "900", fontSize: 15 }}>{title}</Text>

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
          <Ionicons name="chevron-down" size={17} color={CARD_TEXT} />
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
          style={{
            paddingHorizontal: 14,
            paddingBottom: 14,
            borderTopWidth: 1,
            borderTopColor: "rgba(11,33,56,0.08)",
          }}
        >
          <View style={{ paddingTop: 8, gap: 2 }}>{children}</View>
        </View>
      </Animated.View>
    </View>
  );
}

export default function SiteFooter({
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
  const [footerBlogOpen, setFooterBlogOpen] = useState(false);

  const handlePressCategorias =
    onPressCategorias ?? (() => pushRoute("/catalogo" as Href));

  return (
    // width:"100%" + alignSelf:"stretch" a propósito: si la pantalla que
    // monta este componente centra el contenido de su ScrollView
    // (alignItems:"center", como app/(tabs)/perfil.tsx), un View sin ancho
    // explícito se encogería a su contenido en vez de ocupar todo el ancho
    // disponible, y el marginHorizontal negativo de más abajo (el truco para
    // que la franja llegue de borde a borde) se calcularía sobre ese ancho
    // encogido en vez del ancho real de la pantalla.
    <View style={{ width: "100%", alignSelf: "stretch", marginTop: 8 }}>
      {/* Difuminado de entrada: de transparente (deja ver el fondo blanco
          de la pantalla) al azul oscuro del pie, en varias paradas de color
          (no un simple "de A a B") para que se lea como una transición
          cuidada y no como una mancha borrosa. */}
      <LinearGradient
        pointerEvents="none"
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        colors={FADE_COLORS}
        locations={FADE_LOCATIONS}
        style={{ height: FADE_HEIGHT, marginHorizontal: -sidePadding }}
      />

      {/* Pie de página en banda completa (de lado a lado), en vez de ir
          metido dentro de la columna centrada como el resto de secciones —
          así se lee de verdad como el pie de una web, no como una tarjeta
          más. */}
      <View
        style={{
          marginHorizontal: -sidePadding,
          marginTop: -1, // evita una línea de 1px entre el difuminado y la franja
          paddingHorizontal: sidePadding,
          paddingTop: 20,
          paddingBottom: 34,
          backgroundColor: BAND_BG,
        }}
      >
        <View style={{ width: "100%", maxWidth: contentMaxWidth, alignSelf: "center", gap: 12 }}>
          <Text
            style={{
              color: "#FFFFFF",
              fontWeight: "900",
              fontSize: 16,
              textAlign: "center",
            }}
          >
            {BRAND_NAME}
          </Text>

          <View style={{ gap: 12 }}>
            <FooterAccordionSection
              title="Navegación"
              open={footerNavOpen}
              onToggle={() => setFooterNavOpen((value) => !value)}
            >
              <FooterLink label="Inicio" onPress={() => pushRoute("/" as Href)} />
              <FooterLink label="Categorías" onPress={handlePressCategorias} />
              <FooterLink label="Catálogo" onPress={() => pushRoute("/catalogo" as Href)} />
              <FooterLink label="Cesta" onPress={() => pushRoute("/cesta" as Href)} />
              <FooterLink label="Checkout" onPress={() => pushRoute("/checkout" as Href)} />
              <FooterLink label="Perfil" onPress={() => pushRoute("/perfil" as Href)} />
              <FooterLink label="Foro" onPress={() => pushRoute("/chat-global" as Href)} />
              <FooterLink label="Blue IA" onPress={() => pushRoute("/blue-ia" as Href)} />
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
                label="Privacidad"
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

          <View style={{ marginTop: 4 }}>
            <SocialLinks titleColor="#FFFFFF" />
          </View>

          <Text
            style={{
              color: "rgba(255,255,255,0.55)",
              marginTop: 6,
              lineHeight: 18,
              fontSize: 12,
            }}
          >
            © {new Date().getFullYear()} {BRAND_NAME}. Todos los derechos reservados.
          </Text>
        </View>
      </View>
    </View>
  );
}
