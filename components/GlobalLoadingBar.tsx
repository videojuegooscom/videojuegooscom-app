// components/GlobalLoadingBar.tsx
/**
 * Qué hace: barra multicolor (estilo "Siri": rosa → morado → azul → cian)
 * que aparece SOLA, en toda la app, cada vez que hay una petición real a
 * Supabase en marcha — para que cargar algo nunca se sienta como que la app
 * se ha quedado "congelada". Va pegada justo debajo de la franja de
 * Noticias Flash (a petición de Daniel: antes flotaba en un hueco calculado
 * a ojo; ahora usa la altura REAL de esa franja, medida en
 * components/PromoBanner.tsx). Nunca bloquea nada: es solo decorativa
 * (pointerEvents="none"), así que se puede seguir navegando y tocando la
 * pantalla mientras se ve.
 *
 * Cómo funciona:
 * - useGlobalLoading() (lib/loadingBus.ts) dice, en cada instante, si hay
 *   alguna petición real de Supabase en marcha (true/false). lib/supabase.ts
 *   es quien enciende/apaga ese contador en cada fetch real (y deja fuera
 *   las llamadas silenciosas de fondo, ver SILENT_URL_PARTS allí).
 * - useFlashBannerHeight() (lib/flashBannerBus.ts) da el alto real, ya
 *   pintado, de la Noticia Flash — la barra se coloca justo en ese punto
 *   ("top"), pegada a ella, sin superponerse. En pantallas sin Noticia
 *   Flash (p. ej. admin) se usa un alto de respaldo razonable.
 * - Para que NO parpadee en peticiones rapidísimas (una consulta de 80ms no
 *   debería llegar a verse), solo se hace visible si la carga sigue pasados
 *   SHOW_DELAY_MS. Y para que tampoco parpadee al revés (aparecer y
 *   desaparecer casi a la vez si dos peticiones casi seguidas terminan y
 *   empiezan), una vez visible se queda un mínimo de MIN_VISIBLE_MS antes de
 *   poder ocultarse, aunque la carga real ya haya terminado.
 * - Mientras está visible, un LinearGradient más ancho que la pantalla se
 *   desliza de un lado a otro en bucle (Animated.loop), dentro de una tira
 *   de overflow:"hidden" — el efecto de "barrido de color" tipo Siri. Grosor
 *   normal (5px, antes 3.5px) para que se note bien que algo está cargando.
 * - Se monta UNA sola vez en app/_layout.tsx (como la campanita o el aviso
 *   de cookies), fuera del Stack, con position:"absolute" — así aparece en
 *   cualquier pantalla sin tener que añadirlo pantalla por pantalla.
 *
 * Conectado con:
 * - lib/loadingBus.ts → de dónde saca si está cargando o no.
 * - lib/flashBannerBus.ts → de dónde saca a qué altura pegarse.
 * - lib/supabase.ts → quien realmente enciende/apaga el contador.
 * - components/PromoBanner.tsx → quien mide y publica su altura real.
 * - app/_layout.tsx → la monta una única vez, por encima del Stack.
 */
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useGlobalLoading } from "../lib/loadingBus";
import { useFlashBannerHeight } from "../lib/flashBannerBus";

const SHOW_DELAY_MS = 180;
const MIN_VISIBLE_MS = 500;
const BAR_HEIGHT = 5;
const SWEEP_MS = 1100;

const SIRI_COLORS = ["#FF3CAC", "#784BA0", "#2B86C5", "#00C9FF", "#FF3CAC"] as const;

export default function GlobalLoadingBar() {
  const isLoading = useGlobalLoading();
  const bannerHeight = useFlashBannerHeight();
  const { width } = useWindowDimensions();
  const widthSafe = width > 0 ? width : 1024;

  const [visible, setVisible] = useState(false);
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const sweepAnim = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownAtRef = useRef<number>(0);

  // Decide cuándo pasar visible <-> oculto, con el retraso/mínimo de arriba.
  useEffect(() => {
    if (isLoading) {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      if (!visible && !showTimerRef.current) {
        showTimerRef.current = setTimeout(() => {
          showTimerRef.current = null;
          shownAtRef.current = Date.now();
          setVisible(true);
        }, SHOW_DELAY_MS);
      }
    } else {
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
      if (visible && !hideTimerRef.current) {
        const elapsed = Date.now() - shownAtRef.current;
        const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
        hideTimerRef.current = setTimeout(() => {
          hideTimerRef.current = null;
          setVisible(false);
        }, remaining);
      }
    }
  }, [isLoading, visible]);

  // Limpieza de temporizadores al desmontar.
  useEffect(() => {
    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  // Fundido de entrada/salida + barrido de color en bucle mientras es visible.
  useEffect(() => {
    Animated.timing(opacityAnim, {
      toValue: visible ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    if (visible) {
      sweepAnim.setValue(0);
      loopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(sweepAnim, {
            toValue: 1,
            duration: SWEEP_MS,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(sweepAnim, {
            toValue: 0,
            duration: SWEEP_MS,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      loopRef.current.start();
    } else {
      loopRef.current?.stop();
      loopRef.current = null;
    }

    return () => {
      loopRef.current?.stop();
      loopRef.current = null;
    };
  }, [visible, opacityAnim, sweepAnim]);

  // Pegada justo debajo de la Noticia Flash: bannerHeight es su alto real,
  // medido en components/PromoBanner.tsx (ver lib/flashBannerBus.ts).
  const topPosition = bannerHeight;
  const gradientWidth = widthSafe * 1.6;

  const translateX = sweepAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-(gradientWidth - widthSafe), 0],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: topPosition,
        left: 0,
        right: 0,
        height: BAR_HEIGHT,
        overflow: "hidden",
        opacity: opacityAnim,
        zIndex: 998,
        elevation: 998,
      }}
    >
      <Animated.View
        style={{
          width: gradientWidth,
          height: BAR_HEIGHT,
          transform: [{ translateX }],
        }}
      >
        <LinearGradient
          colors={SIRI_COLORS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ width: "100%", height: "100%" }}
        />
      </Animated.View>
    </Animated.View>
  );
}
