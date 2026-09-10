// components/lineapensadoraefectosiri.tsx
/**
 * Qué hace: la barra "Pensando" — una línea multicolor (efecto Siri: rosa →
 * morado → azul → cian) que se enciende SOLA, en TODA la app, para avisar
 * de que algo está pasando: una petición a Supabase, unas fotos cargando, o
 * simplemente que se acaba de cambiar de pestaña/sección. Va pegada justo
 * debajo de la franja de Noticias Flash. Nunca bloquea nada: es solo
 * decorativa (pointerEvents="none"), así que se puede seguir navegando y
 * tocando la pantalla mientras se ve.
 *
 * (Este archivo se llamaba components/GlobalLoadingBar.tsx — se renombró a
 * petición de Daniel. Ese archivo antiguo ya no se usa en ningún sitio;
 * puede borrarse cuando quieras, esta sesión no tiene forma de borrarlo por
 * ti.)
 *
 * Tres cosas distintas la encienden — las tres suman al MISMO contador
 * (lib/loadingBus.ts), así que la barra se queda encendida mientras
 * CUALQUIERA de ellas siga activa:
 * 1. Una petición real a Supabase en marcha (lib/supabase.ts llama a
 *    markStart()/markEnd() en cada fetch, salvo las llamadas silenciosas de
 *    fondo listadas en SILENT_URL_PARTS allí).
 * 2. Una foto cargando de verdad (components/SmartImage.tsx llama a
 *    markStart()/markEnd() por cada una) — así la barra no se apaga hasta
 *    que TODAS las fotos en pantalla han terminado de cargar, no solo
 *    cuando llegan los datos.
 * 3. Un cambio de ruta: cada vez que cambia la pantalla (pestaña, sección,
 *    volver atrás...) este componente llama a pulseLoading() para encender
 *    la barra un instante fijo — para que el usuario vea SIEMPRE una señal
 *    de "está cargando" al cambiar de sitio, aunque esa pantalla en
 *    concreto no necesite pedir nada nuevo (datos ya en caché, sin fotos
 *    que cargar, etc.) y así nunca parezca que la app "no está haciendo
 *    nada" o "está rota".
 *
 * Cómo se ve:
 * - useGlobalLoading() (lib/loadingBus.ts) dice, en cada instante, si hay
 *   algo de lo anterior en marcha (true/false).
 * - useFlashBannerHeight() (lib/flashBannerBus.ts) da el alto real, ya
 *   pintado, de la Noticia Flash — la barra se coloca justo ahí ("top"),
 *   pegada a ella, sin superponerse. En pantallas sin Noticia Flash (p. ej.
 *   admin) se usa un alto de respaldo razonable.
 * - Para que NO parpadee en cargas rapidísimas, solo se hace visible si
 *   sigue activa pasados SHOW_DELAY_MS. Y para que tampoco parpadee al
 *   revés, una vez visible se queda un mínimo de MIN_VISIBLE_MS antes de
 *   poder ocultarse.
 * - Mientras está visible, un LinearGradient más ancho que la pantalla se
 *   desliza de un lado a otro en bucle — el efecto de "barrido de color"
 *   tipo Siri. Grosor normal (5px) para que se note bien.
 * - Se monta UNA sola vez en app/_layout.tsx (como la campanita o el aviso
 *   de cookies), fuera del Stack, con position:"absolute" — así aparece en
 *   cualquier pantalla sin tener que añadirlo pantalla por pantalla.
 *
 * Conectado con:
 * - lib/loadingBus.ts → de dónde saca si hay algo cargando, y a quién avisa
 *   en cada cambio de ruta (pulseLoading()).
 * - lib/flashBannerBus.ts → de dónde saca a qué altura pegarse.
 * - lib/supabase.ts → enciende el contador por cada petición real.
 * - components/SmartImage.tsx → enciende el contador por cada foto cargando.
 * - components/PromoBanner.tsx → quien mide y publica su altura real.
 * - app/_layout.tsx → la monta una única vez, por encima del Stack.
 */
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { usePathname } from "expo-router";
import { useGlobalLoading, pulseLoading } from "../lib/loadingBus";
import { useFlashBannerHeight } from "../lib/flashBannerBus";

const SHOW_DELAY_MS = 180;
const MIN_VISIBLE_MS = 500;
const BAR_HEIGHT = 5;
const SWEEP_MS = 1100;

// Cuánto dura el "pulso" al cambiar de ruta (ver punto 3 de arriba).
const NAV_PULSE_MS = 450;

const SIRI_COLORS = ["#FF3CAC", "#784BA0", "#2B86C5", "#00C9FF", "#FF3CAC"] as const;

export default function LineaPensadoraEfectoSiri() {
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

  // Punto 3: un pulso fijo en cada cambio de ruta (pestaña/sección/volver
  // atrás...). No se pulsa en el primer render (esa pantalla ya tiene su
  // propia pantalla de carga inicial, BrandLoadingScreen).
  const pathname = usePathname();
  const isFirstPathRef = useRef(true);

  useEffect(() => {
    if (isFirstPathRef.current) {
      isFirstPathRef.current = false;
      return;
    }
    pulseLoading(NAV_PULSE_MS);
  }, [pathname]);

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
