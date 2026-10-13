// components/lineapensadoraefectosiri.tsx
/**
 * Qué hace: el efecto "Pensando" tipo Siri. Mientras algo carga (una
 * petición a Supabase, fotos, un cambio de pantalla o una pestaña recargada
 * con triple toque — ver lib/loadingBus.ts), el borde del área visible se
 * ilumina con un aro fino de 3 px, igual en los cuatro lados, con colores de
 * brillo parecido (azul de marca #1EA7E8, cian, lavanda, violeta, rosa y azul
 * cielo) que giran sin parar y un resplandor suave y simétrico hacia dentro.
 * Entra y sale con fundido y nunca bloquea toques (pointer-events: none).
 *
 * Encaje con la pantalla:
 * - Pestaña normal del navegador: esquinas rectas (radio 0), pegado a los
 *   bordes del área de la web.
 * - App instalada (display-mode: standalone/fullscreen o navigator.standalone)
 *   en un móvil con zona segura inferior (safe-area-inset-bottom > 0): las
 *   esquinas siguen las de la pantalla del iPhone (44-55 px según el ancho de
 *   la pantalla). Las de arriba solo se redondean si la web llega hasta arriba
 *   del todo (zona segura superior o lateral > 0); si hay barra de estado
 *   opaca, quedan rectas. Sin zona segura inferior: radio 0.
 * - Se coloca sobre window.visualViewport (posición y tamaño de lo que de
 *   verdad se ve), así que no queda debajo de las barras del navegador ni del
 *   teclado, ni se desplaza. Con zoom de pellizco el grosor se compensa para
 *   seguir viéndose de 3 px.
 * - No lo tapa la barra de pestañas inferior: en react-native-web cada View
 *   es un contexto de apilamiento (z-index 0), así que todo el Stack (barra
 *   incluida) queda por debajo de este marco (z-index 998), que se monta como
 *   hermano del Stack en app/_layout.tsx. Blue (z-index 99999) y los modales
 *   sí quedan por encima.
 *
 * Además exporta BrilloIconoSeccion: el halo azul que hace brillar el icono
 * de la pestaña activa de la barra inferior mientras dura la carga (lo usa
 * app/(tabs)/_layout.tsx).
 *
 * Cómo funciona:
 * - useCargando() (lib/loadingBus.ts) ya trae los umbrales: no se enciende
 *   en cargas de menos de 180 ms, aguanta al menos 500 ms y se apaga
 *   siempre al terminar. Marco e icono comparten ese mismo estado.
 * - En web todo es CSS inyectado una vez en el <head> (asegurarCssSiri): una
 *   capa con máscara que deja ver solo el aro (padding de 3 px) y una franja
 *   que se desvanece hacia dentro (el resplandor, igual en los 4 lados).
 *   Debajo gira un conic-gradient con la paleta dos veces (lados opuestos con
 *   los mismos colores). El giro va dentro de un cuadrado que se estira con
 *   scale(ancho, alto) hasta el tamaño del área: así cada lado recibe
 *   exactamente un cuarto de la vuelta (antes, en un móvil alto, los lados
 *   largos se llevaban casi todo el color y los cortos casi nada). Solo se
 *   anima transform y opacity, así que lo mueve la GPU y va fluido en Safari
 *   iOS aunque el hilo principal esté ocupado. Con prefers-reduced-motion
 *   queda un borde suave quieto, sin giro ni pulsos.
 * - La capa solo existe mientras se ve (se desmonta tras el fundido) y solo
 *   entonces escucha visualViewport, así que en reposo no cuesta nada.
 * - En la app nativa (si algún día se compila) se dibuja un borde azul
 *   sencillo con fundido.
 * - En cada cambio de ruta llama a pulseLoading() para que siempre se vea
 *   una señal al cambiar de sitio, aunque esa pantalla no pida nada.
 *
 * Conectado con:
 * - lib/loadingBus.ts → useCargando() y pulseLoading().
 * - lib/supabase.ts y components/SmartImage.tsx → encienden el contador.
 * - app/_layout.tsx → monta el marco una única vez, por encima del Stack.
 * - app/(tabs)/_layout.tsx → usa BrilloIconoSeccion en los iconos y enciende
 *   el efecto al recargar una pestaña con triple toque.
 */
import React, { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCargando, pulseLoading } from "../lib/loadingBus";

const AZUL_MARCA = "#1EA7E8";

// Cuánto dura el "pulso" al cambiar de ruta.
const NAV_PULSE_MS = 450;
const FADE_IN_MS = 240;
const FADE_OUT_MS = 320;

// Grosor del aro: el mismo en los cuatro lados y en cualquier pantalla.
const GROSOR = 3;

// Paleta con brillo y saturación parecidos (ninguno "desaparece" sobre blanco):
// azul de marca, cian, lavanda, violeta, rosa y azul cielo. Va dos veces en la
// vuelta, así los lados opuestos llevan los mismos colores a la vez.
const PALETA = ["#1EA7E8", "#3FC6F0", "#6F8CF7", "#A774F2", "#EE7DBA", "#5B9DF9"];
const COLORES_SIRI = [...PALETA, ...PALETA, PALETA[0]].join(",");

// Máscara del marco: 4 franjas iguales que se desvanecen hacia dentro
// (resplandor simétrico) + el aro opaco (caja completa menos la caja de
// contenido = el padding de 3 px).
const DESVANECIDO = "rgba(0,0,0,.46),rgba(0,0,0,.2) 9px,rgba(0,0,0,.07) 19px,rgba(0,0,0,0) 30px";
const MASCARA = [
  `linear-gradient(to bottom,${DESVANECIDO})`,
  `linear-gradient(to top,${DESVANECIDO})`,
  `linear-gradient(to right,${DESVANECIDO})`,
  `linear-gradient(to left,${DESVANECIDO})`,
  "linear-gradient(#000,#000) content-box",
  "linear-gradient(#000,#000)",
].join(",");

const CSS_SIRI = [
  // Capa fija con fundido. Por defecto cubre el viewport; el componente le pone
  // la posición y el tamaño exactos del área visible (visualViewport).
  ".vz-siri{position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:998;opacity:0;transition:opacity 320ms ease-in;contain:strict;}",
  '.vz-siri[data-on="1"]{opacity:1;transition:opacity 240ms ease-out;}',
  // -webkit- primero (Safari antiguo) y luego el estándar, que lo sustituye donde exista.
  `.vz-siri-marco{position:absolute;top:0;right:0;bottom:0;left:0;box-sizing:border-box;overflow:hidden;-webkit-mask:${MASCARA};-webkit-mask-composite:source-over,source-over,source-over,source-over,xor,source-over;mask:${MASCARA};mask-composite:add,add,add,add,exclude,add;animation:vz-siri-respira 2.4s ease-in-out infinite alternate;}`,
  // Cuadrado que se estira (scale) hasta el área: reparte la vuelta por igual entre los 4 lados.
  ".vz-siri-escala{position:absolute;left:50%;top:50%;}",
  // Salvaguarda: sin soporte de máscaras compuestas no se pinta el degradado
  // (si no, taparía toda la pantalla en vez de quedarse en el borde).
  ".vz-siri-giro{display:none;}",
  `@supports (mask-composite:exclude) or (-webkit-mask-composite:xor){.vz-siri-giro{display:block;position:absolute;left:-25%;top:-25%;width:150%;height:150%;background:conic-gradient(from 0deg,${COLORES_SIRI});animation:vz-siri-giro 6s linear infinite;will-change:transform;}}`,
  "@keyframes vz-siri-giro{to{transform:rotate(360deg)}}",
  "@keyframes vz-siri-respira{from{opacity:1}to{opacity:.82}}",
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

// Área que de verdad se ve (respecto al viewport de diseño, que es la
// referencia de position: fixed) y el zoom de pellizco.
type Area = { x: number; y: number; ancho: number; alto: number; zoom: number };

function leerArea(): Area {
  const vv = window.visualViewport;
  if (vv && vv.width > 0 && vv.height > 0) {
    return { x: vv.offsetLeft, y: vv.offsetTop, ancho: vv.width, alto: vv.height, zoom: vv.scale > 0 ? vv.scale : 1 };
  }
  return { x: 0, y: 0, ancho: window.innerWidth || 1024, alto: window.innerHeight || 768, zoom: 1 };
}

function mismaArea(a: Area | null, b: Area): boolean {
  return !!a && a.x === b.x && a.y === b.y && a.ancho === b.ancho && a.alto === b.alto && a.zoom === b.zoom;
}

// Sigue el área visible solo mientras el marco existe (activo = montado).
function useAreaVisible(activo: boolean): Area | null {
  const [area, setArea] = useState<Area | null>(null);

  useEffect(() => {
    if (!activo || Platform.OS !== "web" || typeof window === "undefined") return;
    let frame = 0;
    const medir = () => {
      const nueva = leerArea();
      setArea((previa) => (mismaArea(previa, nueva) ? previa : nueva));
    };
    // Barras del navegador, teclado, giro o zoom: se mide en el siguiente frame.
    const programar = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(medir);
    };
    medir();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", programar);
    vv?.addEventListener("scroll", programar);
    window.addEventListener("resize", programar);
    return () => {
      cancelAnimationFrame(frame);
      vv?.removeEventListener("resize", programar);
      vv?.removeEventListener("scroll", programar);
      window.removeEventListener("resize", programar);
    };
  }, [activo]);

  return area;
}

// ¿Web añadida a la pantalla de inicio (app instalada) o pestaña normal?
function esAppInstalada(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
    if (window.matchMedia?.("(display-mode: fullscreen)").matches) return true;
  } catch {
    // sin matchMedia: se mira navigator.standalone
  }
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// Radio de las esquinas de la pantalla del iPhone según su lado corto (en
// puntos): 393-440 → 55 (14 Pro en adelante), 390 → 47 (12/13/14), más
// estrechos → 44 (mini, X, 11 Pro).
function radioPantallaMovil(): number {
  const s = typeof window !== "undefined" ? window.screen : undefined;
  const corto = Math.min(s?.width || 0, s?.height || 0);
  if (corto >= 393) return 55;
  if (corto >= 390) return 47;
  return 44;
}

export default function LineaPensadoraEfectoSiri() {
  const cargando = useCargando();
  const insets = useSafeAreaInsets();

  // montado: la capa existe; encendido: opacidad 1. Se separan para que el
  // fundido funcione al entrar (montar a 0 y subir) y al salir (bajar y desmontar).
  const [montado, setMontado] = useState(false);
  const [encendido, setEncendido] = useState(false);
  const area = useAreaVisible(montado);

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

  if (Platform.OS !== "web") {
    return <MarcoNativo encendido={encendido} radio={insets.bottom > 0 ? 44 : 0} grosor={GROSOR} />;
  }

  // Medidas del área visible (si aún no se ha medido, la ventana entera).
  const ancho = area?.ancho ?? (window.innerWidth || 1024);
  const alto = area?.alto ?? (window.innerHeight || 768);
  const zoom = area?.zoom ?? 1;

  // Pestaña del navegador: esquinas rectas. App instalada con zona segura
  // inferior: las de la pantalla (arriba solo si la web llega hasta arriba).
  const radio = esAppInstalada() && insets.bottom > 0 ? radioPantallaMovil() : 0;
  const radioArriba = insets.top > 0 || insets.left > 0 || insets.right > 0 ? radio : 0;
  const rArriba = radioArriba / zoom;
  const rAbajo = radio / zoom;

  // El degradado gira dentro de un cuadrado que luego se estira al área.
  const lado = Math.max(ancho, alto, 1);
  const posicion: CSSProperties | undefined = area
    ? { top: area.y, left: area.x, width: area.ancho, height: area.alto }
    : undefined;

  return (
    <div className="vz-siri" data-on={encendido ? "1" : "0"} aria-hidden="true" style={posicion}>
      <div
        className="vz-siri-marco"
        style={{
          padding: GROSOR / zoom,
          borderRadius: `${rArriba}px ${rArriba}px ${rAbajo}px ${rAbajo}px`,
        }}
      >
        <div
          className="vz-siri-escala"
          style={{
            width: lado,
            height: lado,
            marginLeft: -lado / 2,
            marginTop: -lado / 2,
            transform: `scale(${ancho / lado},${alto / lado})`,
          }}
        >
          <div className="vz-siri-giro" />
        </div>
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
