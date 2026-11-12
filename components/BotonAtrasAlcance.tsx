// components/BotonAtrasAlcance.tsx
/**
 * Qué hace: botón «Volver» flotante, abajo a la derecha, donde llega el pulgar de la mano
 * derecha. La flecha de volver de cada página está arriba a la izquierda (lejos del pulgar);
 * este botón hace lo mismo sin tener que estirar la mano.
 *
 * Cómo funciona: se monta una sola vez en app/_layout.tsx. Solo aparece en las páginas de
 * lectura (catálogo, servicios, políticas, blog y noticias, app/noticias/): en las fichas de producto y de servicio (que
 * terminan en «Volver atrás»), el pago y «Vender» ya hay botones abajo y taparían. Vuelve atrás
 * en el historial o, si no lo hay, a Inicio.
 * Blue (que se aparta solo de los botones) se coloca en otro sitio. «Contratar servicio» usa
 * BotonAtrasFlotante con su propia acción y deja hueco abajo para no tapar «Enviar solicitud».
 *
 * Hueco abajo (2026-11-12, grupo 3): el botón ocupa los últimos 68 px de la pantalla (52 + 16 de margen); las páginas
 * que lo muestran (Políticas, Noticias y su ficha) terminan con 96 px de relleno para que no tape su último contenido,
 * y «Contratar servicio» deja su propia franja. Lo comprueba la prueba TM3 de pruebas/perfil-datos.mjs.
 *
 * Conectado con: app/_layout.tsx (lo monta), components/Campanita.tsx (se aparta de él).
 */
import React from "react";
import { Platform, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const RUTAS = /^\/(catalogo|servicios|politicas\/|blog|noticias)/;

function volver() {
  try {
    if (typeof router.canGoBack === "function" && router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // sin historial: Inicio
  }
  router.replace("/");
}

export default function BotonAtrasAlcance() {
  const pathname = usePathname() ?? "";
  if (Platform.OS !== "web" || !RUTAS.test(pathname)) return null;
  return <BotonAtrasFlotante onPress={volver} />;
}

// El mismo botón con su propia acción: «Contratar servicio» lo pone con la suya (dueño, 2026-11-09: «el botón para
// volver, abajo a la derecha, para tocarlo con el dedo gordo»), que cuenta en Analítica si se fue sin enviar.
export function BotonAtrasFlotante({ onPress }: { onPress: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      nativeID="boton-atras-flotante"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Volver"
      style={({ pressed }) => ({
        position: "fixed" as "absolute",
        right: 14,
        bottom: 16 + Math.round(insets.bottom),
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#1EA7E8",
        opacity: pressed ? 0.85 : 1,
        zIndex: 9000,
        shadowColor: "#0B2138",
        shadowOpacity: 0.22,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      })}
    >
      <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
    </Pressable>
  );
}
