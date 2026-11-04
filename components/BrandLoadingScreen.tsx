/**
 * Qué hace: pantalla de bienvenida de la tienda (dueño, 2026-11-04): «VideojuegosZaragoza.com», las dos mascotas
 * sonriendo, «Tu tienda de electrónica en Zaragoza» y una barra que se llena hasta los 3 s. Es también la pantalla de
 * carga y la versión que se genera de antemano (HTML estático) de todas las páginas, así que sale al instante.
 *
 * Cómo funciona: app/_layout.tsx la pone encima de la tienda mientras esta carga debajo; la primera vez en cada visita
 * se queda al menos BIENVENIDA_MS (contados desde que se abrió la página) y luego se va con un fundido. Todo centrado
 * y con medidas fijas: la versión pre-generada no conoce la pantalla, así que nada depende del ancho (lección
 * «Medidas de pantalla solo con la tienda montada»). La barra marca lo que ha pasado desde que se abrió la página, hasta los 3 s. Con
 * `onEntrar` (la tienda ya está lista), un toque en cualquier parte entra antes.
 *
 * Conectado con:
 * - app/_layout.tsx → la muestra al arrancar y decide cuánto tiempo.
 * - components/marca/MarcaAnimada.tsx → las mascotas, que respiran y hacen algún gesto.
 */
import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import MarcaAnimada from "./marca/MarcaAnimada";

/** Lo que dura la bienvenida la primera vez en cada visita (desde que se abre la página). */
export const BIENVENIDA_MS = 3000;

const AZUL = "#1EA7E8";
const MARINO = "#0B2138";
const GRIS = "rgba(11,33,56,0.62)";
const HALO = "#EAF6FD";

type BrandLoadingScreenProps = {
  /** Si se pasa, un toque en cualquier parte entra en la tienda antes de tiempo. */
  onEntrar?: () => void;
};

export default function BrandLoadingScreen({ onEntrar }: BrandLoadingScreenProps) {
  // La barra va con el reloj de la página (lo que ha pasado desde que se abrió), no con una animación que empiece al
  // montarse: así marca lo mismo aunque la pantalla se vuelva a pintar al arrancar la tienda.
  const [pct, setPct] = useState(0);
  useEffect(() => {
    if (typeof performance === "undefined") return;
    const medir = () => setPct(Math.min(100, Math.round((performance.now() / BIENVENIDA_MS) * 100)));
    medir();
    const reloj = setInterval(medir, 100);
    return () => clearInterval(reloj);
  }, []);

  return (
    <Pressable
      nativeID="bienvenida"
      onPress={onEntrar}
      disabled={!onEntrar}
      accessibilityRole={onEntrar ? "button" : undefined}
      accessibilityLabel={onEntrar ? "Entrar en la tienda" : "Cargando VideojuegosZaragoza.com"}
      style={{ flex: 1, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}
    >
      <View
        style={{
          width: 300,
          height: 300,
          borderRadius: 150,
          backgroundColor: HALO,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MarcaAnimada cual="pareja" ancho={270} tocable={false} />
      </View>

      {/* En dos líneas: «VideojuegosZaragoza.com» es una sola palabra y en un móvil pequeño no cabría en una. */}
      <Text
        nativeID="bienvenida-marca"
        accessibilityRole="header"
        style={{ marginTop: 22, color: MARINO, fontSize: 32, lineHeight: 36, fontWeight: "900", letterSpacing: -0.5, textAlign: "center" }}
      >
        Videojuegos{"\n"}
        <Text style={{ color: AZUL }}>Zaragoza</Text>
        <Text style={{ color: GRIS, fontWeight: "800" }}>.com</Text>
      </Text>
      <Text style={{ marginTop: 6, color: GRIS, fontSize: 16, fontWeight: "600", textAlign: "center" }}>
        Tu tienda de electrónica en Zaragoza
      </Text>

      <View
        nativeID="bienvenida-progreso"
        accessibilityRole="progressbar"
        style={{ marginTop: 28, width: 180, height: 5, borderRadius: 3, backgroundColor: HALO, overflow: "hidden" }}
      >
        <View style={{ width: `${pct}%`, height: "100%", borderRadius: 3, backgroundColor: AZUL }} />
      </View>
      <Text style={{ marginTop: 10, color: GRIS, fontSize: 12.5, fontWeight: "600", textAlign: "center" }}>
        {onEntrar ? "Toca para entrar" : "Preparando la tienda…"}
      </Text>
    </Pressable>
  );
}
