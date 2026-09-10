// components/CookieConsentBanner.tsx
/**
 * Qué hace: aviso discreto (no bloqueante) de que la tienda usa analítica
 * propia para registrar el recorrido de los visitantes (Inicio, Categoría,
 * Producto, Scroll, Reseñas...) y poder mejorar la tienda con esos datos. Se
 * monta una sola vez en app/_layout.tsx, así que aparece en cualquier
 * pantalla pública mientras el visitante no haya contestado.
 *
 * Cómo funciona:
 * - Al montar, comprueba lib/analytics.ts → getAnalyticsConsent(). Si ya
 *   contestó antes ("accepted" o "declined"), el aviso no se muestra nunca
 *   más en este dispositivo. Si todavía no ha contestado (null), aparece con
 *   una pequeña animación tras tres cuartos de segundo (para no interrumpir
 *   el primer vistazo a la pantalla).
 * - "Aceptar" y "Rechazar" llaman a setAnalyticsConsent() y cierran el
 *   aviso. Jefe decidió "seguimiento completo con aviso de cookies": mientras
 *   el visitante no contesta SÍ se registra su recorrido (trackEvent ya lo
 *   hace así por defecto); "Rechazar" es lo que de verdad lo desactiva.
 * - No se muestra dentro del panel de administración (rutas /admin): ese
 *   aviso es para clientes, no para Jefe gestionando su propia tienda.
 * - Enlace "Política de privacidad" → app/politicas/[slug].tsx (privacidad),
 *   donde se explica con más detalle qué se registra.
 *
 * Conectado con:
 * - lib/analytics.ts → getAnalyticsConsent()/setAnalyticsConsent().
 * - app/_layout.tsx → se monta aquí, junto a components/Campanita.tsx.
 * - app/politicas/[slug].tsx → destino del enlace "Política de privacidad".
 */
import React, { useEffect, useRef, useState } from "react";
import { Animated, Platform, Pressable, Text, View, useWindowDimensions } from "react-native";
import { router, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getAnalyticsConsent, setAnalyticsConsent } from "../lib/analytics";

const COLORS = {
  card: "#FFFFFF",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.66)",
  accent: "#1EA7E8",
  accentDark: "#0F8FCC",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
};

function softShadow() {
  return Platform.select<any>({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.2,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
    },
    android: { elevation: 6 },
    default: { boxShadow: "0 8px 24px rgba(11,33,56,0.16)" },
  });
}

const SHOW_DELAY_MS = 750;

export default function CookieConsentBanner() {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;

  const [visible, setVisible] = useState(false);
  const [checked, setChecked] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;

    (async () => {
      const consent = await getAnalyticsConsent();
      if (!alive) return;
      setChecked(true);
      if (consent === null) {
        const timer = setTimeout(() => {
          if (alive) setVisible(true);
        }, SHOW_DELAY_MS);
        return () => clearTimeout(timer);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);

  const isAdminRoute = pathname?.startsWith("/admin");

  const handleDecision = async (value: "accepted" | "declined") => {
    setVisible(false);
    await setAnalyticsConsent(value);
  };

  // No se pinta nada en /admin (ese aviso es para clientes, no para Jefe
  // gestionando su tienda), antes de saber si hace falta preguntar, o una
  // vez que el visitante ya contestó (o todavía no ha pasado el retraso).
  if (isAdminRoute || !checked || !visible) return null;

  return (
    <Animated.View
      pointerEvents="auto"
      style={{
        position: "absolute",
        left: 14,
        right: 14,
        bottom: isMobile ? 96 : 104,
        maxWidth: 520,
        alignSelf: "center",
        opacity: anim,
        transform: [
          {
            translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }),
          },
        ],
      }}
    >
      <View
        style={{
          borderRadius: 20,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.card,
          padding: 16,
          gap: 12,
          ...softShadow(),
        }}
      >
        <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 12,
              backgroundColor: COLORS.accent2,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="shield-checkmark-outline" size={17} color={COLORS.accentDark} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 14.5, lineHeight: 19 }}>
              Usamos tu visita para mejorar la tienda
            </Text>
            <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 18, fontSize: 13 }}>
              Analítica propia (sin terceros) para entender cómo navegas: qué categorías miras,
              qué productos visitas... Puedes rechazarlo cuando quieras.{" "}
              <Text
                style={{ color: COLORS.accentDark, fontWeight: "800" }}
                onPress={() => router.push("/politicas/privacidad" as never)}
              >
                Ver política de privacidad
              </Text>
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => handleDecision("declined")}
            style={({ pressed }) => ({
              flex: 1,
              borderRadius: 14,
              borderWidth: 1.5,
              borderColor: COLORS.border,
              backgroundColor: "#FFFFFF",
              paddingVertical: 10,
              opacity: pressed ? 0.88 : 1,
              alignItems: "center",
            })}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13.5 }}>Rechazar</Text>
          </Pressable>

          <Pressable
            onPress={() => handleDecision("accepted")}
            style={({ pressed }) => ({
              flex: 1,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: COLORS.accentDark,
              backgroundColor: COLORS.accent,
              paddingVertical: 10,
              opacity: pressed ? 0.9 : 1,
              alignItems: "center",
            })}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 13.5 }}>Aceptar</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}
