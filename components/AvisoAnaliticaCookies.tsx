/**
 * Archivo: components/AvisoAnaliticaCookies.tsx
 * Función: componente del aviso de analítica propia (consentimiento).
 * Para qué sirve: pide al visitante aceptar o rechazar la analítica (RGPD), guarda su respuesta con lib/analiticaPropia.ts y no se muestra en el panel de administración ni cuando ya contestó.
 * Conectado con: lib/analiticaPropia.ts (leerConsentimientoAnalitica, guardarConsentimientoAnalitica), lib/barraPestanas.ts (useMargenInferiorBarraPestanas), política de privacidad (app/politicas/[slug].tsx).
 * Utilizado por: app/_layout.tsx (se monta una vez).
 * Dependencias: react, react-native, expo-router, @expo/vector-icons.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: aviso discreto (no bloqueante) de que la tienda usa analítica
 * propia para registrar el recorrido de los visitantes (Inicio, Categoría,
 * Producto, Scroll, Reseñas...) y poder mejorar la tienda con esos datos. Se
 * monta una sola vez en app/_layout.tsx, así que aparece en cualquier
 * pantalla pública mientras el visitante no haya contestado.
 *
 * Texto: redactado en tono formal/corporativo (trato de "usted") a
 * propósito — Daniel pidió que este aviso concreto transmita seriedad y
 * confianza de empresa, aunque el resto de la tienda hable de "tú". Es un
 * contraste habitual en webs reales: el aviso legal/de privacidad suele ir
 * más formal que el resto del contenido comercial.
 *
 * Cómo funciona:
 * - Al montar, comprueba lib/analiticaPropia.ts → leerConsentimientoAnalitica(). Si ya
 *   contestó antes ("accepted" o "declined"), el aviso no se muestra nunca
 *   más en este dispositivo. Si todavía no ha contestado (null), aparece con
 *   una pequeña animación tras tres cuartos de segundo (para no interrumpir
 *   el primer vistazo a la pantalla).
 * - "Aceptar" y "Rechazar" llaman a guardarConsentimientoAnalitica() y cierran el
 *   aviso. Por RGPD, mientras el visitante no contesta NO se envía nada:
 *   medirEvento solo guarda en memoria los eventos de esta visita. "Aceptar"
 *   los envía y activa la analítica; "Rechazar" los descarta y no se envía
 *   ningún evento.
 * - No se muestra dentro del panel de administración (rutas /admin): ese
 *   aviso es para clientes, no para Jefe gestionando su propia tienda.
 * - Enlace "Política de privacidad" → app/politicas/[slug].tsx (privacidad),
 *   donde se explica con más detalle qué se registra.
 *
 * Conectado con:
 * - lib/analiticaPropia.ts → leerConsentimientoAnalitica()/guardarConsentimientoAnalitica().
 * - app/_layout.tsx → se monta aquí, junto a components/AsistenteBlue.tsx.
 * - app/politicas/[slug].tsx → destino del enlace "Política de privacidad".
 */
import React, { useEffect, useRef, useState } from "react";
import { Animated, Platform, Pressable, Text, View, useWindowDimensions } from "react-native";
import { router, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  leerConsentimientoAnalitica,
  guardarConsentimientoAnalitica,
  escucharPreferenciasAnalitica,
  medirEvento,
  type ConsentimientoAnalitica,
} from "../lib/analiticaPropia";
import { useMargenInferiorBarraPestanas } from "../lib/barraPestanas";

const COLORS = {
  card: "#FFFFFF",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.66)",
  accent: "#1EA7E8",
  accentDark: "#1EA7E8",
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

export default function AvisoAnaliticaCookies() {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;

  const [visible, setVisible] = useState(false);
  const [checked, setChecked] = useState(false);
  // Abierto desde «Preferencias de cookies» del pie (2026-11-27): sale aunque ya hubiera contestado, también en
  // Privacidad, y enseña lo que tiene elegido ahora mismo.
  const [reabierto, setReabierto] = useState(false);
  const [actual, setActual] = useState<ConsentimientoAnalitica>(null);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(
    () =>
      escucharPreferenciasAnalitica(() => {
        void leerConsentimientoAnalitica().then((c) => {
          setActual(c);
          setChecked(true);
          setReabierto(true);
          setVisible(true);
        });
      }),
    []
  );

  useEffect(() => {
    let alive = true;

    (async () => {
      const consent = await leerConsentimientoAnalitica();
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

  // Si decide desde Privacidad («Aceptar la analítica» / «Rechazar la analítica», 2026-11-27), el aviso ya no vuelve a
  // salir al cambiar de pantalla.
  useEffect(() => {
    if (!visible || reabierto) return;
    let vivo = true;
    void leerConsentimientoAnalitica().then((c) => {
      if (vivo && c !== null) setVisible(false);
    });
    return () => {
      vivo = false;
    };
  }, [pathname, visible, reabierto]);

  const isAdminRoute = pathname?.startsWith("/admin");
  // En Privacidad no sale: la página tiene sus propios botones para decidir y el aviso los taparía.
  const enPrivacidad = pathname === "/politicas/privacidad";
  // Se coloca encima de la barra de pestañas, que crece con la zona segura del iPhone.
  const tabBarInset = useMargenInferiorBarraPestanas();

  const handleDecision = async (value: "accepted" | "declined") => {
    const desdePie = reabierto;
    setVisible(false);
    setReabierto(false);
    await guardarConsentimientoAnalitica(value);
    // Solo se cuenta si acepta: con «No, gracias» medirEvento no envía nada (Administración → Analítica).
    if (desdePie && value === "accepted") {
      void medirEvento("preferencias_cookies", "Pie: analítica aceptada desde las preferencias", { path: pathname ?? undefined });
    }
  };

  // No se pinta nada en /admin (ese aviso es para clientes, no para Jefe
  // gestionando su tienda), antes de saber si hace falta preguntar, o una
  // vez que el visitante ya contestó (o todavía no ha pasado el retraso).
  // En Privacidad solo sale si se abre a propósito desde el pie.
  if (isAdminRoute || (enPrivacidad && !reabierto) || !checked || !visible) return null;

  return (
    <Animated.View
      pointerEvents="auto"
      style={{
        position: "absolute",
        left: 14,
        right: 14,
        bottom: (isMobile ? 96 : 104) + tabBarInset,
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
        {/* Mismos textos que el recuadro del final de Privacidad (dueño, 2026-11-27: «Ayúdanos a mejorar tu experiencia»):
            qué se apunta, para qué, que es opcional y cómo cambiarlo. Todo centrado. */}
        <View style={{ alignItems: "center", gap: 6 }}>
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
          <Text nativeID="aviso-cookies-titulo" style={{ color: COLORS.text, fontWeight: "900", fontSize: 15, lineHeight: 20, textAlign: "center" }}>
            Ayúdanos a mejorar tu experiencia
          </Text>
          <Text style={{ color: COLORS.muted, lineHeight: 19, fontSize: 13.5, textAlign: "center" }}>
            Si nos dejas, apuntamos qué páginas visitas y qué tocas en la tienda, solo para mejorar tu experiencia. No lo
            vendemos ni lo cedemos a nadie. Es opcional y puedes cambiarlo cuando quieras en nuestra{" "}
            <Text
              style={{ color: COLORS.accentDark, fontWeight: "800" }}
              onPress={() => router.push("/politicas/privacidad" as never)}
            >
              Política de privacidad
            </Text>
            .
          </Text>
          {reabierto ? (
            <Text nativeID="aviso-cookies-actual" style={{ color: COLORS.text, fontWeight: "800", lineHeight: 19, fontSize: 13.5, textAlign: "center" }}>
              {actual === "accepted"
                ? "Ahora mismo nos estás ayudando. ¡Gracias!"
                : actual === "declined"
                  ? "Ahora mismo no compartes tu uso de la tienda."
                  : "Todavía no has elegido: mientras tanto no apuntamos nada."}
            </Text>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            nativeID="aviso-cookies-no"
            onPress={() => handleDecision("declined")}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 46,
              borderRadius: 14,
              borderWidth: 1.5,
              borderColor: COLORS.border,
              backgroundColor: "#FFFFFF",
              paddingVertical: 10,
              opacity: pressed ? 0.88 : 1,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 14, textAlign: "center" }}>No, gracias</Text>
          </Pressable>

          <Pressable
            nativeID="aviso-cookies-si"
            onPress={() => handleDecision("accepted")}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 46,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: COLORS.accentDark,
              backgroundColor: COLORS.accent,
              paddingVertical: 10,
              opacity: pressed ? 0.9 : 1,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14, textAlign: "center" }}>Sí, quiero ayudar</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}
