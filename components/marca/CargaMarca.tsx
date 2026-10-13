/**
 * Qué hace: estado de "cargando…" con la mascota de la tienda dando saltitos,
 * en lugar de la ruedita gris. Centrado, ligero (imagen pequeña de assets/brand).
 *
 * Usado por: pantallas de la tienda mientras cargan (catálogo, ficha, cesta,
 * pago, servicios…).
 */
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, Text, View } from "react-native";
import MarcaAnimada from "./MarcaAnimada";

const NATIVO = Platform.OS !== "web";

export default function CargaMarca({ texto = "Cargando…", ancho = 96 }: { texto?: string; ancho?: number }) {
  const salto = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const bucle = Animated.loop(
      Animated.sequence([
        Animated.timing(salto, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: NATIVO }),
        Animated.timing(salto, { toValue: 0, duration: 380, easing: Easing.bounce, useNativeDriver: NATIVO }),
        Animated.delay(180),
      ])
    );
    bucle.start();
    return () => bucle.stop();
  }, [salto]);

  const y = salto.interpolate({ inputRange: [0, 1], outputRange: [0, -14] });
  const sombra = salto.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] });

  return (
    <View style={{ alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16 }}>
      <Animated.View style={{ transform: [{ translateY: y }] }}>
        <MarcaAnimada cual="carga" ancho={ancho} reposo={false} />
      </Animated.View>
      <Animated.View
        style={{
          width: ancho * 0.55,
          height: 6,
          borderRadius: 999,
          backgroundColor: "rgba(11,33,56,0.10)",
          transform: [{ scaleX: sombra }],
        }}
      />
      <Text style={{ color: "rgba(11,33,56,0.62)", fontWeight: "700", textAlign: "center" }}>{texto}</Text>
    </View>
  );
}
