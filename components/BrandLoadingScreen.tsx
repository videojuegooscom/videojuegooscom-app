/**
 * Qué hace: pantalla de bienvenida de la tienda (dueño, 2026-11-04): «VideojuegosZaragoza.com», las dos mascotas
 * sonriendo, «Tu tienda de electrónica en Zaragoza» y una barra que se llena hasta los 3 s. Es también la pantalla de
 * carga y la versión que se genera de antemano (HTML estático) de todas las páginas, así que sale al instante.
 *
 * Fluida y con el efecto Siri (dueño, 2026-11-04: «que la barra de cargando sea fluida y aparezca el efecto Siri en los
 * bordes, nuestro diseño», «que no haya tirones»):
 * - En la web TODO lo que se mueve es CSS de transform y opacity, que el navegador anima por su cuenta (en la GPU)
 *   aunque la tienda esté arrancando debajo y el JavaScript vaya ocupado. Antes la barra avanzaba a saltos de 0,1 s con
 *   un reloj de JavaScript (y se paraba mientras la tienda arrancaba) y las mascotas se movían con Animated.
 * - La barra: pista azul clara y un relleno con los colores de Siri que se descubre de izquierda a derecha (dos capas
 *   que se desplazan en sentidos contrarios, así los colores no se estiran), con una chispa de luz en la punta. Tarda
 *   BIENVENIDA_MS con una curva suave al empezar y al acabar; cuando se llena, app/_layout.tsx quita la bienvenida.
 * - El marco Siri en los bordes: el mismo aro de colores que gira de «Pensando» (components/lineapensadoraefectosiri.tsx:
 *   misma paleta y misma máscara), aquí dibujado solo con CSS para que gire desde el primer pintado. Cada lado recibe más
 *   o menos el mismo trozo de la vuelta (media queries por proporción de pantalla, sin medir nada con JavaScript).
 * - Las mascotas entran con un pequeño fundido y luego flotan suavemente (CSS); el texto entra justo después.
 * - Las animaciones empiezan al pintarse el HTML estático. Al arrancar, la tienda reutiliza esos mismos elementos y
 *   siguen sin cortes; si el navegador tuviera que volver a crearlos, se colocan donde iban (desde el primer pintado)
 *   antes de que se vea nada, así que nunca vuelven a empezar.
 * - Con «reducir movimiento» del sistema: sin giro, sin flotar y sin chispa; la barra sí se llena (es información).
 *
 * Todo centrado y con medidas fijas: la versión pre-generada no conoce la pantalla, así que nada depende del ancho medido
 * con JavaScript (lección «Medidas de pantalla solo con la tienda montada»). Con `onEntrar` (la tienda ya está lista), un
 * toque en cualquier parte entra antes.
 *
 * Conectado con:
 * - app/_layout.tsx → la muestra al arrancar, decide cuánto tiempo (lee el avance de la barra) y la funde al salir.
 * - components/marca/MarcaAnimada.tsx → las mascotas (en la web sin su movimiento de JavaScript: lo pone el CSS).
 * - components/lineapensadoraefectosiri.tsx → paleta y máscara del marco Siri.
 */
import React, { useEffect, useLayoutEffect, type ReactNode } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import MarcaAnimada from "./marca/MarcaAnimada";
import { COLORES_SIRI, MASCARA_MARCO_SIRI, PALETA_SIRI } from "./lineapensadoraefectosiri";

/** Lo que dura la bienvenida la primera vez en cada visita (lo que tarda la barra en llenarse). */
export const BIENVENIDA_MS = 3000;
/** El elemento cuya animación marca el avance de la barra (app/_layout.tsx lo lee para saber cuándo se llena). */
export const BIENVENIDA_RELLENO_ID = "bienvenida-relleno";

const WEB = Platform.OS === "web";
const AZUL = "#1EA7E8";
const MARINO = "#0B2138";
const GRIS = "rgba(11,33,56,0.62)";
const HALO = "#EAF6FD";
/** Ancho fijo de la barra (px). */
const PISTA = 200;
// Curva suave al empezar y al acabar (casi recta en medio): avanza de forma natural, sin acelerones.
const CURVA = "cubic-bezier(.4,0,.6,1)";
const DURACION = `${BIENVENIDA_MS}ms`;

// Cuánto se estrecha (retrato) o se aplasta (apaisado) el cuadrado que gira para que cada lado reciba un trozo parecido
// de la vuelta de colores (lo mismo que hace el marco de «Pensando», pero sin JavaScript: por proporción de pantalla).
const ESCALAS: [string, string][] = [
  ["(min-aspect-ratio:1/1)", "scale(1,.8)"],
  ["(min-aspect-ratio:3/2)", "scale(1,.62)"],
  ["(min-aspect-ratio:2/1)", "scale(1,.5)"],
  ["(max-aspect-ratio:1/1)", "scale(.8,1)"],
  ["(max-aspect-ratio:3/4)", "scale(.68,1)"],
  ["(max-aspect-ratio:2/3)", "scale(.6,1)"],
  ["(max-aspect-ratio:9/16)", "scale(.52,1)"],
  ["(max-aspect-ratio:1/2)", "scale(.46,1)"],
];

const CSS_BIENVENIDA = [
  // Marco Siri en los bordes: aro de 3 px y resplandor hacia dentro (la máscara deja ver solo eso) con los colores
  // girando debajo. Entra con un fundido y luego «respira».
  `.vzb-marco{position:absolute;top:0;right:0;bottom:0;left:0;padding:3px;box-sizing:border-box;overflow:hidden;pointer-events:none;-webkit-mask:${MASCARA_MARCO_SIRI};-webkit-mask-composite:source-over,source-over,source-over,source-over,xor,source-over;mask:${MASCARA_MARCO_SIRI};mask-composite:add,add,add,add,exclude,add;animation:vzb-aparece .6s ease-out both,vzb-respira 2.4s ease-in-out .6s infinite alternate;}`,
  ".vzb-escala{position:absolute;left:50%;top:50%;width:100vmax;height:100vmax;margin:-50vmax 0 0 -50vmax;}",
  ...ESCALAS.map(([media, t]) => `@media ${media}{.vzb-escala{transform:${t};}}`),
  // Sin máscaras compuestas no se pinta el degradado (taparía la pantalla en vez de quedarse en el borde).
  ".vzb-giro{display:none;}",
  `@supports (mask-composite:exclude) or (-webkit-mask-composite:xor){.vzb-giro{display:block;position:absolute;left:-25%;top:-25%;width:150%;height:150%;background:conic-gradient(from 0deg,${COLORES_SIRI});animation:vzb-giro 6s linear infinite;will-change:transform;}}`,
  // Contenido: las mascotas entran y flotan; el texto entra justo después.
  ".vzb-columna{display:flex;flex-direction:column;align-items:center;}",
  ".vzb-flota{display:flex;animation:vzb-entra .7s cubic-bezier(.2,.8,.2,1) both,vzb-flota 3.2s ease-in-out .7s infinite alternate;will-change:transform;}",
  ".vzb-textos{display:flex;flex-direction:column;align-items:center;animation:vzb-entra .7s cubic-bezier(.2,.8,.2,1) .12s both;}",
  // Barra: la pista, el avance (se desplaza de -100 % a 0) y los colores (al revés: quedan quietos y se van descubriendo).
  `.vzb-barra{position:relative;width:${PISTA}px;height:6px;margin-top:28px;}`,
  `.vzb-pista{position:absolute;top:0;right:0;bottom:0;left:0;border-radius:3px;background:${HALO};overflow:hidden;box-shadow:0 0 10px rgba(111,140,247,.18);}`,
  `.vzb-avance{position:absolute;top:0;right:0;bottom:0;left:0;border-radius:3px;overflow:hidden;transform:translateX(-100%);animation:vzb-avance ${DURACION} ${CURVA} forwards;will-change:transform;}`,
  `.vzb-color{position:absolute;top:0;right:0;bottom:0;left:0;background:linear-gradient(90deg,${PALETA_SIRI.slice(0, 5).join(",")});transform:translateX(100%);animation:vzb-color ${DURACION} ${CURVA} forwards;will-change:transform;}`,
  // Chispa de luz en la punta del avance (va con la misma curva).
  `.vzb-chispa{position:absolute;left:-8px;top:50%;width:16px;height:16px;margin-top:-8px;border-radius:50%;pointer-events:none;background:radial-gradient(circle,rgba(255,255,255,.95) 0,rgba(167,116,242,.55) 38%,rgba(167,116,242,0) 70%);animation:vzb-chispa ${DURACION} ${CURVA} forwards,vzb-chispa-luz ${DURACION} linear forwards;will-change:transform,opacity;}`,
  "@keyframes vzb-giro{to{transform:rotate(360deg)}}",
  "@keyframes vzb-aparece{from{opacity:0}to{opacity:1}}",
  "@keyframes vzb-respira{from{opacity:1}to{opacity:.82}}",
  "@keyframes vzb-entra{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}",
  "@keyframes vzb-flota{from{transform:translateY(0)}to{transform:translateY(-6px) scale(1.015)}}",
  "@keyframes vzb-avance{to{transform:translateX(0)}}",
  "@keyframes vzb-color{to{transform:translateX(0)}}",
  `@keyframes vzb-chispa{to{transform:translateX(${PISTA}px)}}`,
  "@keyframes vzb-chispa-luz{0%{opacity:0}8%{opacity:1}90%{opacity:1}100%{opacity:0}}",
  // Reducir movimiento: sin giro, sin flotar, sin entradas ni chispa; la barra sí se llena.
  "@media (prefers-reduced-motion: reduce){.vzb-marco,.vzb-giro,.vzb-flota,.vzb-textos{animation:none}.vzb-marco{opacity:.85}.vzb-chispa{display:none}}",
].join("");

// Antes de pintar en el navegador (useLayoutEffect); en el servidor que genera el HTML no hace nada.
const useAntesDePintar = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Cuándo empezó la barra (en el reloj de la página), la primera vez que se ve. Todas las animaciones de la bienvenida
// van a ese mismo compás.
let inicioBarra: number | null = null;

/** Un contenedor con su clase CSS en la web; en la app nativa, un View normal. */
function Capa({ clase, id, children }: { clase: string; id?: string; children?: ReactNode }) {
  if (WEB) {
    return (
      <div className={clase} id={id}>
        {children}
      </div>
    );
  }
  return <View style={{ alignItems: "center" }}>{children}</View>;
}

type BrandLoadingScreenProps = {
  /** Si se pasa, un toque en cualquier parte entra en la tienda antes de tiempo. */
  onEntrar?: () => void;
};

export default function BrandLoadingScreen({ onEntrar }: BrandLoadingScreenProps) {
  // Las animaciones empezaron al pintarse el HTML estático. Si el navegador volviera a crear estos elementos (al
  // arrancar la tienda o más tarde), empezarían de cero (un salto atrás): se les pone el mismo comienzo que tenía la
  // barra, antes de que se pinte nada. Se mira en cada pintado (es barato y solo toca algo si van desfasadas).
  useAntesDePintar(() => {
    if (!WEB || typeof document === "undefined" || typeof performance === "undefined") return;
    type ConAnimaciones = HTMLElement & { getAnimations?: (o?: { subtree?: boolean }) => Animation[] };
    const capa = document.getElementById("bienvenida") as ConAnimaciones | null;
    if (!capa?.getAnimations) return;
    const barra = (document.getElementById(BIENVENIDA_RELLENO_ID) as ConAnimaciones | null)?.getAnimations?.()[0];
    const inicio = typeof barra?.startTime === "number" ? barra.startTime : null;
    if (inicioBarra === null) {
      // Si ya al montarse la barra empezó bastante después de pintarse la página (el HTML estático se volvió a crear),
      // cuenta desde el pintado.
      const pintado = performance.getEntriesByName?.("first-contentful-paint")[0]?.startTime;
      inicioBarra = typeof pintado === "number" && inicio !== null && inicio - pintado > 250 ? pintado : inicio;
    }
    if (inicioBarra === null) return;
    for (const a of capa.getAnimations({ subtree: true })) {
      if (typeof a.startTime === "number" && Math.abs(a.startTime - inicioBarra) > 250) a.startTime = inicioBarra;
    }
  });

  return (
    // Sin accessibilityRole: con «button», react-native-web cambia el <div> por un <button> en cuanto se puede tocar y
    // vuelve a crear todo lo de dentro (la barra y el marco empezarían de cero: un tirón). Así el elemento es siempre el
    // mismo y solo cambian su etiqueta y si está desactivado.
    <Pressable
      nativeID="bienvenida"
      onPress={onEntrar}
      disabled={!onEntrar}
      accessibilityState={{ disabled: !onEntrar }}
      accessibilityLabel={onEntrar ? "Entrar en la tienda" : "Cargando VideojuegosZaragoza.com"}
      style={{ flex: 1, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", paddingHorizontal: 24, overflow: "hidden" }}
    >
      {WEB ? <style dangerouslySetInnerHTML={{ __html: CSS_BIENVENIDA }} /> : null}

      {/* Marco Siri en los bordes de la pantalla. */}
      {WEB ? (
        <div className="vzb-marco" aria-hidden="true">
          <div className="vzb-escala">
            <div className="vzb-giro" />
          </div>
        </div>
      ) : null}

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
        <Capa clase="vzb-flota">
          {/* En la web, quieta: la flotación la pone el CSS (sin tirones mientras arranca la tienda). */}
          <MarcaAnimada cual="pareja" ancho={270} tocable={false} reposo={!WEB} />
        </Capa>
      </View>

      <Capa clase="vzb-textos">
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

        {WEB ? (
          <div className="vzb-barra" id="bienvenida-progreso" role="progressbar" aria-label="Preparando la tienda">
            <div className="vzb-pista">
              <div className="vzb-avance" id={BIENVENIDA_RELLENO_ID}>
                <div className="vzb-color" />
              </div>
            </div>
            <div className="vzb-chispa" aria-hidden="true" />
          </div>
        ) : (
          <View
            nativeID="bienvenida-progreso"
            accessibilityRole="progressbar"
            style={{ marginTop: 28, width: PISTA, height: 6, borderRadius: 3, backgroundColor: HALO, overflow: "hidden" }}
          >
            <View style={{ width: "100%", height: "100%", backgroundColor: AZUL }} />
          </View>
        )}
        <Text nativeID="bienvenida-estado" style={{ marginTop: 12, color: GRIS, fontSize: 12.5, fontWeight: "600", textAlign: "center" }}>
          {onEntrar ? "Toca para entrar" : "Preparando la tienda…"}
        </Text>
      </Capa>
    </Pressable>
  );
}
