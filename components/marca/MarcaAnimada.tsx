/**
 * Qué hace: logo y mascotas de VideojuegosZaragoza animados. En reposo "respiran"
 * y flotan suavemente; cada toque lanza una de 10 animaciones distintas, en orden
 * (salto, giro, saludo, latido, gelatina, sacudida, voltereta, rebote, péndulo y
 * doble salto con giro), y vuelve a empezar.
 *
 * Cómo funciona: Animated de React Native (sin dependencias nuevas), solo
 * transformaciones (rápidas también en web). Las imágenes viven en assets/brand/,
 * reducidas y sin fondo (ver comentario de cada una en IMAGENES).
 *
 * Usado por: components/BrandLoadingScreen.tsx, components/marca/CargaMarca.tsx y
 * las pantallas de la tienda (portada, cesta, pago, servicios, pie de página…).
 */
import React, { useCallback, useEffect, useRef } from "react";
import { Animated, Easing, Image, Platform, Pressable, type ImageSourcePropType } from "react-native";

export type Marca = "logo" | "logo-mini" | "pareja" | "tienda" | "taller" | "carga";

// Proporción ancho/alto de cada imagen, para que nunca se deforme.
const IMAGENES: Record<Marca, { src: ImageSourcePropType; ratio: number; nombre: string }> = {
  logo: { src: require("../../assets/brand/logo.png"), ratio: 1, nombre: "Logo de VideojuegosZaragoza.com" },
  "logo-mini": { src: require("../../assets/brand/logo-mini.png"), ratio: 1, nombre: "Logo de VideojuegosZaragoza.com" },
  pareja: { src: require("../../assets/brand/mascotas.png"), ratio: 1536 / 1024, nombre: "Mascotas de la tienda" },
  tienda: { src: require("../../assets/brand/mascota-tienda.png"), ratio: 1, nombre: "Mascota de la tienda" },
  taller: { src: require("../../assets/brand/mascota-taller.png"), ratio: 1, nombre: "Mascota del taller de reparaciones" },
  carga: { src: require("../../assets/brand/mascota-carga.png"), ratio: 1, nombre: "Mascota de la tienda" },
};

const NATIVO = Platform.OS !== "web";
const TOTAL_ANIMACIONES = 10;

type Props = {
  cual: Marca;
  /** Ancho en píxeles; el alto sale de la proporción de la imagen. */
  ancho: number;
  /** Movimiento suave en reposo (por defecto sí). */
  reposo?: boolean;
  /** Si es false, no reacciona a toques (p. ej. dentro de un botón). */
  tocable?: boolean;
};

export default function MarcaAnimada({ cual, ancho, reposo = true, tocable = true }: Props) {
  const img = IMAGENES[cual];
  const alto = Math.round(ancho / img.ratio);

  // Reposo
  const flotar = useRef(new Animated.Value(0)).current;
  // Toques
  const y = useRef(new Animated.Value(0)).current;
  const x = useRef(new Animated.Value(0)).current;
  const giro = useRef(new Animated.Value(0)).current; // grados
  const giroY = useRef(new Animated.Value(0)).current; // grados (voltereta)
  const escala = useRef(new Animated.Value(1)).current;
  const escalaX = useRef(new Animated.Value(1)).current;
  const escalaY = useRef(new Animated.Value(1)).current;

  const siguiente = useRef(0);
  const animando = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!reposo) return;
    const bucle = Animated.loop(
      Animated.sequence([
        Animated.timing(flotar, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVO }),
        Animated.timing(flotar, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVO }),
      ])
    );
    bucle.start();
    return () => bucle.stop();
  }, [reposo, flotar]);

  const t = useCallback(
    (v: Animated.Value, toValue: number, duration: number, easing = Easing.out(Easing.quad)) =>
      Animated.timing(v, { toValue, duration, easing, useNativeDriver: NATIVO }),
    []
  );

  const reiniciar = useCallback(() => {
    y.setValue(0);
    x.setValue(0);
    giro.setValue(0);
    giroY.setValue(0);
    escala.setValue(1);
    escalaX.setValue(1);
    escalaY.setValue(1);
  }, [y, x, giro, giroY, escala, escalaX, escalaY]);

  const animacion = useCallback(
    (n: number): Animated.CompositeAnimation => {
      const h = Math.max(12, alto * 0.18);
      switch (n) {
        case 0: // salto
          return Animated.sequence([t(y, -h, 220), t(y, 0, 420, Easing.bounce)]);
        case 1: // giro completo
          return Animated.sequence([t(giro, 360, 700, Easing.inOut(Easing.cubic)), t(giro, 360, 1)]);
        case 2: // saludo (bamboleo)
          return Animated.sequence([
            t(giro, -12, 120), t(giro, 12, 160), t(giro, -10, 160), t(giro, 8, 140), t(giro, 0, 120),
          ]);
        case 3: // latido
          return Animated.sequence([
            t(escala, 1.15, 130), t(escala, 0.97, 130), t(escala, 1.12, 130), t(escala, 1, 220),
          ]);
        case 4: // gelatina
          return Animated.sequence([
            Animated.parallel([t(escalaX, 1.2, 140), t(escalaY, 0.82, 140)]),
            Animated.parallel([t(escalaX, 0.88, 140), t(escalaY, 1.14, 140)]),
            Animated.parallel([t(escalaX, 1.06, 120), t(escalaY, 0.95, 120)]),
            Animated.parallel([t(escalaX, 1, 160), t(escalaY, 1, 160)]),
          ]);
        case 5: // sacudida
          return Animated.sequence([
            t(x, -10, 60), t(x, 10, 70), t(x, -8, 70), t(x, 8, 70), t(x, -4, 60), t(x, 0, 60),
          ]);
        case 6: // voltereta (giro en vertical)
          return Animated.sequence([t(giroY, 360, 800, Easing.inOut(Easing.cubic)), t(giroY, 360, 1)]);
        case 7: // rebote con zoom
          return Animated.sequence([t(escala, 0.8, 140), t(escala, 1.2, 200), t(escala, 1, 420, Easing.elastic(1.4))]);
        case 8: // péndulo
          return Animated.sequence([
            t(giro, 18, 260, Easing.inOut(Easing.sin)),
            t(giro, -16, 420, Easing.inOut(Easing.sin)),
            t(giro, 10, 360, Easing.inOut(Easing.sin)),
            t(giro, 0, 300, Easing.inOut(Easing.sin)),
          ]);
        default: // doble salto con giro
          return Animated.sequence([
            Animated.parallel([t(y, -h, 220), t(giro, 180, 440, Easing.inOut(Easing.quad))]),
            t(y, 0, 220, Easing.in(Easing.quad)),
            Animated.parallel([t(y, -h * 0.7, 200), t(giro, 360, 400, Easing.inOut(Easing.quad))]),
            t(y, 0, 300, Easing.bounce),
          ]);
      }
    },
    [alto, t, y, x, giro, giroY, escala, escalaX, escalaY]
  );

  const alTocar = useCallback(() => {
    animando.current?.stop();
    reiniciar();
    const n = siguiente.current;
    siguiente.current = (n + 1) % TOTAL_ANIMACIONES;
    const a = animacion(n);
    animando.current = a;
    a.start(() => {
      if (animando.current === a) reiniciar();
    });
  }, [animacion, reiniciar]);

  useEffect(() => () => animando.current?.stop(), []);

  const flotarY = flotar.interpolate({ inputRange: [0, 1], outputRange: [0, -Math.max(3, alto * 0.025)] });
  const respirar = flotar.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] });
  const rotar = giro.interpolate({ inputRange: [-360, 360], outputRange: ["-360deg", "360deg"] });
  const rotarY = giroY.interpolate({ inputRange: [0, 360], outputRange: ["0deg", "360deg"] });

  const imagen = (
    <Animated.View
      style={{
        width: ancho,
        height: alto,
        transform: [
          { translateY: Animated.add(flotarY, y) },
          { translateX: x },
          { perspective: 800 },
          { rotateY: rotarY },
          { rotate: rotar },
          { scale: Animated.multiply(escala, respirar) },
          { scaleX: escalaX },
          { scaleY: escalaY },
        ],
      }}
    >
      <Image
        source={img.src}
        style={{ width: ancho, height: alto }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </Animated.View>
  );

  if (!tocable) return imagen;

  return (
    <Pressable
      onPress={alTocar}
      accessibilityRole="imagebutton"
      accessibilityLabel={img.nombre}
      style={{ alignSelf: "center" }}
      hitSlop={8}
    >
      {imagen}
    </Pressable>
  );
}
