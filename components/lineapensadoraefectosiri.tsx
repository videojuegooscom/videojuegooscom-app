// components/lineapensadoraefectosiri.tsx
/**
 * Qué hace: el efecto "Pensando" tipo Siri. Mientras algo carga (una
 * petición a Supabase, fotos, o un cambio de pantalla — ver
 * lib/loadingBus.ts), TODO el borde de la pantalla se ilumina con un marco
 * fino (3 px en móvil, 4 px en escritorio) de colores suaves (azul de marca
 * #1EA7E8, cian, violeta y rosa) que giran sin parar, con un resplandor
 * suave hacia dentro. Las esquinas siguen las del móvil (radio 40) y en
 * escritorio son casi rectas (radio 12). Entra y sale con fundido y nunca
 * bloquea toques (pointer-events: none).
 *
 * Además exporta BrilloIconoSeccion: el halo azul que hace brillar el icono
 * de la pestaña activa de la barra inferior mientras dura la carga (lo usa
 * app/(tabs)/_layout.tsx).
 *
 * Cómo funciona:
 * - useCargando() (lib/loadingBus.ts) ya trae los umbrales: no se enciende
 *   en cargas de menos de 180 ms, aguanta al menos 500 ms y se apaga
 *   siempre al terminar. Marco e icono comparten ese mismo estado.
 * - En web todo es CSS inyectado una vez en el <head> (asegurarCssSiri):
 *   una capa con máscara que deja ver solo el aro del borde (y una franja
 *   que se desvanece hacia dentro, el resplandor) y, debajo, un
 *   conic-gradient que gira con transform. Solo se anima transform y
 *   opacity, así que lo mueve la GPU y va fluido en Safari iOS aunque el
 *   hilo principal esté ocupado cargando. Con prefers-reduced-motion queda
 *   un borde suave quieto, sin giro ni pulsos.
 * - La capa solo existe mientras se ve (se desmonta tras el fundido), así
 *   que en reposo no cuesta nada.
 * - En la app nativa (si algún día se compila) se dibuja un borde azul
 *   sencillo con fundido.
 * - En cada cambio de ruta llama a pulseLoading() para que siempre se vea
 *   una señal al cambiar de sitio, aunque esa pantalla no pida nada.
 * - Ya no depende de lib/flashBannerBus.ts (la franja de Noticias Flash ya
 *   no está en la tienda).
 *
 * Conectado con:
 * - lib/loadingBus.ts → useCargando() y pulseLoading().
 * - lib/supabase.ts y components/SmartImage.tsx → encienden el contador.
 * - app/_layout.tsx → monta el marco una única vez, por encima del Stack.
 * - app/(tabs)/_layout.tsx → usa BrilloIconoSeccion en los iconos.
 */
import React, { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { usePathname } from "expo-router";
import { useCargando, pulseLoading } from "../lib/loadingBus";

const AZUL_MARCA = "#1EA7E8";

// Cuánto dura el "pulso" al cambiar de ruta.
const NAV_PULSE_MS = 450;
const FADE_IN_MS = 240;
const FADE_OUT_MS = 320;

// Colores del giro: azul de marca, cian, lavanda, violeta, rosa y azul cielo.
const COLORES_SIRI = "#1EA7E8,#5CD3F5,#8A8CF6,#B07CF0,#F28AC0,#7FB6FF,#1EA7E8";

// Máscara del marco: 4 franjas que se desvanecen hacia dentro (resplandor)
// + el aro opaco (caja completa menos la caja de contenido = el padding).
const DESVANECIDO = "rgba(0,0,0,.5),rgba(0,0,0,.22) 10px,rgba(0,0,0,.07) 20px,rgba(0,0,0,0) 30px";
const MASCARA = [
  `linear-gradient(to bottom,${DESVANECIDO})`,
  `linear-gradient(to top,${DESVANECIDO})`,
  `linear-gradient(to right,${DESVANECIDO})`,
  `linear-gradient(to left,${DESVANECIDO})`,
  "linear-gradient(#000,#000) content-box",
  "linear-gradient(#000,#000)",
].join(",");

const CSS_SIRI = [
  // Marco a pantalla completa con fundido.
  ".vz-siri{position:fixed;top:0;right:0;bottom:0;left:0;pointer-events:none;z-index:998;opacity:0;transition:opacity 320ms ease-in;contain:strict;}",
  '.vz-siri[data-on="1"]{opacity:1;transition:opacity 240ms ease-out;}',
  // -webkit- primero (Safari antiguo) y luego el estándar, que lo sustituye donde exista.
  `.vz-siri-marco{position:absolute;top:0;right:0;bottom:0;left:0;box-sizing:border-box;overflow:hidden;-webkit-mask:${MASCARA};-webkit-mask-composite:source-over,source-over,source-over,source-over,xor,source-over;mask:${MASCARA};mask-composite:add,add,add,add,exclude,add;animation:vz-siri-respira 2.4s ease-in-out infinite alternate;}`,
  // Salvaguarda: sin soporte de máscaras compuestas no se pinta el degradado
  // (si no, taparía toda la pantalla en vez de quedarse en el borde).
  ".vz-siri-giro{display:none;}",
  `@supports (mask-composite:exclude) or (-webkit-mask-composite:xor){.vz-siri-giro{display:block;position:absolute;left:50%;top:50%;background:conic-gradient(from 0deg,${COLORES_SIRI});animation:vz-siri-giro 4s linear infinite;will-change:transform;}}`,
  "@keyframes vz-siri-giro{to{transform:rotate(360deg)}}",
  "@keyframes vz-siri-respira{from{opacity:1}to{opacity:.8}}",
  // Icono de la pestaña activa: halo azul que pulsa + icono que crece un 8 %.
  ".vz-ico-halo{background:radial-gradient(circle,rgba(30,167,232,.42) 0%,rgba(30,167,232,.16) 45%,rgba(30,167,232,0) 70%);opacity:0;transform:scale(.7);transition:opacity 240ms ease,transform 240ms ease;}",
  ".vz-ico>:last-child{position:relative;z-index:1;transition:transform 240ms ease;}",
  ".vz-ico--brilla .vz-ico-halo{opacity:1;transform:scale(1);animation:vz-ico-halo 1.3s ease-in-out infinite alternate;}",
  ".vz-ico--brilla>:last-child{filter:drop-shadow(0 0 5px rgba(30,167,232,.7));animation:vz-ico-late 1.3s ease-in-out infinite alternate;}",
  "@keyframes vz-ico-halo{from{opacity:.55;transform:scale(.85)}to{opacity:1;transform:scale(1.18)}}",
  "@keyframes vz-ico-late{from{transform:scale(1)}to{transform:scale(1.08)}}",
  // Movimiento reducido: sin giro ni pulsos, solo un borde suave quieto.
  "@media (prefers-reduced-motion: reduce){.vz-siri-marco,.vz-siri-giro,.vz-ico--brilla .vz-ico-halo,.vz-ico--brilla>:last-child{animation:none}.vz-siri-marco{opacity:.85}.vz-ico-halo,.vz-ico>:last-child{transition:none}}",
].join("");

const ID_CSS = "vz-siri-css";

// Inyecta (o actualiza) la hoja de estilos del efecto una sola vez, solo en web.
function asegurarCssSiri() {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  let el = document.getElementById(ID_CSS);
  if (!el) {
    el = document.createElement("style");
    el.id = ID_CSS;
    document.head.appendChild(el);
  }
  if (el.textContent !== CSS_SIRI) el.textContent = CSS_SIRI;
}

export default function LineaPensadoraEfectoSiri() {
  const cargando = useCargando();
  const { width, height } = useWindowDimensions();

  // montado: la capa existe; encendido: opacidad 1. Se separan para que el
  // fundido funcione al entrar (montar a 0 y subir) y al salir (bajar y desmontar).
  const [montado, setMontado] = useState(false);
  const [encendido, setEncendido] = useState(false);

  // Pulso en cada cambio de ruta (no en el primer render: ahí ya está la
  // pantalla de carga inicial, BrandLoadingScreen).
  const pathname = usePathname();
  const isFirstPathRef = useRef(true);

  useEffect(() => {
    if (isFirstPathRef.current) {
      isFirstPathRef.current = false;
      return;
    }
    pulseLoading(NAV_PULSE_MS);
  }, [pathname]);

  useEffect(() => {
    asegurarCssSiri();
  }, []);

  useEffect(() => {
    if (cargando) {
      setMontado(true);
      // Doble frame: que el navegador pinte la capa a 0 antes de subirla a 1.
      let segundo = 0;
      const primero = requestAnimationFrame(() => {
        segundo = requestAnimationFrame(() => setEncendido(true));
      });
      return () => {
        cancelAnimationFrame(primero);
        cancelAnimationFrame(segundo);
      };
    }
    setEncendido(false);
    const timer = setTimeout(() => setMontado(false), FADE_OUT_MS + 80);
    return () => clearTimeout(timer);
  }, [cargando]);

  if (!montado) return null;

  // Móvil (lado corto < 600): esquinas como las del teléfono. Escritorio: casi rectas.
  const esMovil = Math.min(width, height) < 600;
  const radio = esMovil ? 40 : 12;
  const grosor = esMovil ? 3 : 4;

  if (Platform.OS !== "web") {
    return <MarcoNativo encendido={encendido} radio={radio} grosor={grosor} />;
  }

  // El degradado que gira es un cuadrado del tamaño de la diagonal (con
  // margen) para cubrir todo el borde en cualquier ángulo.
  const lado = Math.ceil(Math.hypot(width || 1024, height || 768) * 1.06) + 8;

  return (
    <div className="vz-siri" data-on={encendido ? "1" : "0"} aria-hidden="true">
      <div className="vz-siri-marco" style={{ borderRadius: radio, padding: grosor }}>
        <div
          className="vz-siri-giro"
          style={{ width: lado, height: lado, marginLeft: -lado / 2, marginTop: -lado / 2 }}
        />
      </div>
    </div>
  );
}

// Respaldo nativo: borde azul de marca con un resplandor interior y fundido.
function MarcoNativo({
  encendido,
  radio,
  grosor,
}: {
  encendido: boolean;
  radio: number;
  grosor: number;
}) {
  const opacidad = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacidad, {
      toValue: encendido ? 1 : 0,
      duration: encendido ? FADE_IN_MS : FADE_OUT_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [encendido, opacidad]);

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        estilos.marcoNativo,
        { opacity: opacidad, borderRadius: radio, borderWidth: grosor },
      ]}
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          estilos.resplandorNativo,
          { borderRadius: Math.max(0, radio - grosor) },
        ]}
      />
    </Animated.View>
  );
}

// Estilos fijos del envoltorio del icono en web (en línea para que el icono
// quede igual de centrado aunque la hoja CSS aún no se haya inyectado).
const ICO_WEB: CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const HALO_WEB: CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "50%",
  width: 36,
  height: 36,
  marginLeft: -18,
  marginTop: -18,
  borderRadius: "50%",
  pointerEvents: "none",
};

/**
 * Envuelve el icono de una pestaña: con brillando=true le pone un halo azul
 * que pulsa y lo agranda un poco (en web con CSS; en nativo, fijo).
 */
export function BrilloIconoSeccion({
  brillando,
  children,
}: {
  brillando: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    asegurarCssSiri();
  }, []);

  if (Platform.OS === "web") {
    return (
      <div className={brillando ? "vz-ico vz-ico--brilla" : "vz-ico"} style={ICO_WEB}>
        <span className="vz-ico-halo" aria-hidden="true" style={HALO_WEB} />
        {children}
      </div>
    );
  }

  return (
    <View style={estilos.icoCaja}>
      <View style={[estilos.icoHalo, { opacity: brillando ? 1 : 0 }]} />
      <View style={brillando ? estilos.icoGrande : undefined}>{children}</View>
    </View>
  );
}

const estilos = StyleSheet.create({
  marcoNativo: {
    borderColor: AZUL_MARCA,
    pointerEvents: "none",
    zIndex: 998,
    elevation: 998,
  },
  resplandorNativo: {
    borderWidth: 8,
    borderColor: "rgba(30,167,232,0.14)",
  },
  icoCaja: {
    alignItems: "center",
    justifyContent: "center",
  },
  icoHalo: {
    position: "absolute",
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(30,167,232,0.16)",
  },
  icoGrande: {
    transform: [{ scale: 1.08 }],
  },
});
