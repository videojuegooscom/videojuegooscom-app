// components/SiteFooter.tsx
/**
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
 *
 * Conectado con:
 * - components/SocialLinks.tsx → fila de iconos de redes sociales.
 * - components/marca/MarcaAnimada.tsx → logo animado del pie.
 * - app/(tabs)/index.tsx, app/(tabs)/perfil.tsx, app/(tabs)/cesta.tsx →
 *   pantallas que lo montan al final de su scroll.
 */
import { Ionicons } from "@expo/vector-icons";
import type { Href } from "expo-router";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import SocialLinks from "./SocialLinks";
import MarcaAnimada from "./marca/MarcaAnimada";

// Paleta del pie: fondo blanco, textos en azul marino y acento azul.
const FOOTER_BG = "#FFFFFF";
const NAVY = "#0B2138";
const ACCENT = "#1EA7E8";
const LINE = "#E3EAF2";
const BRAND_NAME = "Videojuegoszaragoza.com";

function pushRoute(route: Href) {
  router.push(route);
}

function FooterLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.7 : 1,
        paddingVertical: 6,
      })}
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

          <View style={{ marginTop: 4 }}>
            <SocialLinks titleColor={NAVY} />
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
