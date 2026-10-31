// components/ImageLightbox.tsx
/**
 * Qué hace: visor de fotos a pantalla completa con zoom y navegación entre
 * imágenes. Se usa en la ficha de producto (app/producto/[id].tsx) al tocar
 * la foto principal.
 *
 * Cómo funciona: en vez del componente Modal de React Native (da problemas
 * en web) usa una capa absoluta que cubre toda la pantalla, así que hay que
 * montarlo dentro de un contenedor con flex:1 que ya ocupe toda la altura
 * visible (la pantalla raíz de producto/[id].tsx cumple esto).
 *
 * Gestos: pellizcar con dos dedos acerca o aleja justo entre los dedos; un doble toque (o doble clic) acerca donde se
 * toca o vuelve al tamaño normal; la rueda del ratón (o el pellizco del panel táctil) acerca donde está el puntero. Con
 * zoom, un dedo (o el ratón) mueve la foto hasta sus bordes, con un poco de inercia. Sin zoom, la foto sigue al dedo
 * hacia los lados y, al soltar, pasa a la siguiente o a la anterior (también con las flechas, y con las del teclado
 * en escritorio). Pasarse del zoom mínimo o máximo, o de los bordes, se nota como un muelle y vuelve solo.
 *
 * Sin tirones (dueño, 2026-10-31: «siento que da tirones al hacer zoom»):
 * - El navegador ya no hace su propio zoom a la vez que el visor: la capa lleva touch-action:none (el body tiene
 *   «manipulation», que sí deja pellizcar la página) y, en Safari del iPhone, se cancelan sus gestos de pellizco.
 * - Mover y acercar no pasa por React: la transformación se escribe directamente en la capa de la foto, como mucho
 *   una vez por fotograma. Antes cada movimiento del dedo volvía a pintar el visor entero, foto incluida.
 * - Al soltar uno de los dos dedos se toma la posición de nuevo (antes la foto saltaba) y el zoom se hace alrededor
 *   de los dedos, no del centro de la foto.
 * - Se abre con la versión de la foto del tamaño de la pantalla (la misma que ya bajó la ficha: sale al instante) y
 *   solo al acercar se descarga la original, para ver el detalle.
 *
 * Blue: mientras el visor está abierto, components/Campanita.tsx lo esconde (suscribirVisorFotos) y guarda sus
 * mensajes para cuando se cierre. No usa ninguna librería nueva: los gestos son PanResponder de React Native.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Platform, Pressable, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import SmartImage from "./SmartImage";
import { trackEvent } from "../lib/analytics";

export type LightboxImage = {
  id: string;
  url: string;
};

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 40;
const SWIPE_THRESHOLD = 60;
const TAP_MOVE_TOLERANCE = 8;
// Con este zoom o más se descarga la foto original (más detalle que la del tamaño de la pantalla).
const ZOOM_ORIGINAL = 1.4;
// Parte del alto que ocupa la foto sin zoom (deja sitio al contador de arriba y a los puntos de abajo).
const ALTO_FOTO = 0.86;
// Fondo opaco: con transparencia se veía la ficha por detrás y el navegador tenía que mezclarla en cada fotograma.
const FONDO = "#04080F";

// --- ¿Está abierto el visor? (Blue se esconde mientras tanto) -------------------------------------------------------
let visorAbierto = false;
const oyentesVisor = new Set<() => void>();

export function visorFotosAbierto(): boolean {
  return visorAbierto;
}

export function suscribirVisorFotos(oyente: () => void): () => void {
  oyentesVisor.add(oyente);
  return () => {
    oyentesVisor.delete(oyente);
  };
}

function avisarVisor(abierto: boolean) {
  if (visorAbierto === abierto) return;
  visorAbierto = abierto;
  oyentesVisor.forEach((o) => o());
}

type Vista = { s: number; x: number; y: number };
type Punto = { x: number; y: number };
type Toque = { pageX: number; pageY: number };
type Gesto = {
  n: number;
  base: Vista;
  centro: Punto; // centro del visor en la página
  c0: Punto; // dedos al empezar, respecto al centro del visor
  d0: number; // distancia entre los dos dedos al empezar
  ultimo: Punto; // dedos ahora, respecto al centro del visor
  pellizco: boolean;
  movido: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

// Al pasarse de un límite se puede tirar un poco más, con resistencia; al soltar vuelve.
function conMuelle(v: number, min: number, max: number, k = 0.35) {
  if (v < min) return min - (min - v) * k;
  if (v > max) return max + (v - max) * k;
  return v;
}

function dedos(toques: readonly Toque[]): { c: Punto; d: number } {
  const [a, b] = toques;
  if (!b) return { c: { x: a.pageX, y: a.pageY }, d: 0 };
  return {
    c: { x: (a.pageX + b.pageX) / 2, y: (a.pageY + b.pageY) / 2 },
    d: Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY),
  };
}

type NodoCapa = { style?: CSSStyleDeclaration; setNativeProps?: (p: object) => void; getBoundingClientRect?: () => DOMRect };

export default function ImageLightbox({
  visible,
  images,
  initialIndex,
  onClose,
}: {
  visible: boolean;
  images: LightboxImage[];
  initialIndex: number;
  onClose: () => void;
}) {
  const abierto = visible && images.length > 0;

  useEffect(() => {
    if (!abierto) return;
    avisarVisor(true);
    return () => avisarVisor(false);
  }, [abierto]);

  // Se monta de nuevo en cada apertura: empieza siempre en la foto tocada y sin zoom.
  if (!abierto) return null;
  return <Visor images={images} initialIndex={initialIndex} onClose={onClose} />;
}

function Visor({ images, initialIndex, onClose }: { images: LightboxImage[]; initialIndex: number; onClose: () => void }) {
  const ventana = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [marco, setMarco] = useState({ w: ventana.width, h: ventana.height });
  const [index, setIndex] = useState(() => clamp(initialIndex, 0, images.length - 1));
  const [verOriginal, setVerOriginal] = useState(false);
  const fondoRef = useRef<View>(null);
  const capaRef = useRef<View>(null);

  // Lo que necesitan los gestos (se crean una sola vez): siempre los valores de ahora.
  const datos = useRef({ index, total: images.length, marco, onClose, verOriginal });
  useEffect(() => {
    datos.current = { index, total: images.length, marco, onClose, verOriginal };
  });

  const motor = useMemo(() => {
    const vista: Vista = { s: 1, x: 0, y: 0 };
    let tamFoto: { w: number; h: number } | null = null;
    let fotograma: number | null = null;
    let animacion: number | null = null;
    let gesto: Gesto | null = null;
    let ultimoToque = { t: 0, x: 0, y: 0 };
    let entrada: 0 | 1 | -1 = 0;
    let zoomContado = false;

    const nodo = (r: React.RefObject<View | null>) => r.current as unknown as NodoCapa | null;

    // Escribe la transformación en la capa de la foto (sin pasar por React).
    function pintarYa() {
      fotograma = null;
      const n = nodo(capaRef);
      if (!n) return;
      if (Platform.OS === "web" && n.style) n.style.transform = `translate3d(${vista.x}px, ${vista.y}px, 0) scale(${vista.s})`;
      else n.setNativeProps?.({ style: { transform: [{ translateX: vista.x }, { translateY: vista.y }, { scale: vista.s }] } });
    }
    function poner(v: Vista) {
      vista.s = v.s;
      vista.x = v.x;
      vista.y = v.y;
      if (fotograma == null) fotograma = requestAnimationFrame(pintarYa);
    }
    // Durante el gesto la foto va en su propia capa (fluido); al acabar se quita para que el navegador la vuelva a
    // dibujar nítida al tamaño nuevo.
    function capaViva(si: boolean) {
      const n = nodo(capaRef);
      if (Platform.OS === "web" && n?.style) n.style.willChange = si ? "transform" : "auto";
    }

    // Hasta dónde se puede mover la foto con un zoom dado: lo que sobresale del visor, por cada lado.
    function limites(s: number) {
      const { w, h } = datos.current.marco;
      const cajaH = h * ALTO_FOTO;
      let fw = w;
      let fh = cajaH;
      if (tamFoto && tamFoto.w > 0 && tamFoto.h > 0) {
        const k = Math.min(w / tamFoto.w, cajaH / tamFoto.h);
        fw = tamFoto.w * k;
        fh = tamFoto.h * k;
      }
      return { mx: Math.max(0, (s * fw - w) / 2), my: Math.max(0, (s * fh - h) / 2) };
    }
    function dentro(v: Vista): Vista {
      const s = clamp(v.s, 1, MAX_SCALE);
      if (s <= 1.001) return { s: 1, x: 0, y: 0 };
      const { mx, my } = limites(s);
      return { s, x: clamp(v.x, -mx, mx), y: clamp(v.y, -my, my) };
    }

    function parar() {
      if (animacion != null) cancelAnimationFrame(animacion);
      animacion = null;
    }
    function animarA(destino: Vista, ms: number, alAcabar?: () => void) {
      parar();
      const desde = { ...vista };
      const t0 = Date.now();
      capaViva(true);
      const paso = () => {
        const p = Math.min(1, (Date.now() - t0) / ms);
        const e = 1 - Math.pow(1 - p, 3);
        vista.s = desde.s + (destino.s - desde.s) * e;
        vista.x = desde.x + (destino.x - desde.x) * e;
        vista.y = desde.y + (destino.y - desde.y) * e;
        pintarYa();
        if (p < 1) {
          animacion = requestAnimationFrame(paso);
          return;
        }
        animacion = null;
        capaViva(false);
        alAcabar?.();
      };
      animacion = requestAnimationFrame(paso);
    }

    function contarZoom(como: "pellizco" | "doble_toque" | "rueda") {
      if (zoomContado) return;
      zoomContado = true;
      trackEvent("foto_zoom", "Ficha: zoom en la foto", { metadata: { como } });
    }
    function pedirOriginal(s: number) {
      if (s < ZOOM_ORIGINAL || datos.current.verOriginal) return;
      datos.current.verOriginal = true;
      setVerOriginal(true);
    }

    // Vuelve a un sitio válido: zoom entre 1 y el máximo (alrededor de `foco`) y sin huecos en los bordes.
    function asentar(foco?: Punto, empuje?: Punto) {
      let { s, x, y } = vista;
      if (empuje) {
        x = empuje.x;
        y = empuje.y;
      }
      if (s > MAX_SCALE) {
        const f = foco ?? { x: 0, y: 0 };
        const k = MAX_SCALE / s;
        x = f.x - k * (f.x - x);
        y = f.y - k * (f.y - y);
        s = MAX_SCALE;
      }
      const destino = dentro({ s, x, y });
      pedirOriginal(destino.s);
      if (destino.s === vista.s && destino.x === vista.x && destino.y === vista.y) {
        capaViva(false);
        return;
      }
      animarA(destino, empuje ? 320 : 240);
    }

    function irA(i: number, desde: 0 | 1 | -1) {
      const total = datos.current.total;
      if (total < 1) return;
      const nuevo = ((i % total) + total) % total;
      parar();
      tamFoto = null;
      entrada = desde;
      datos.current.index = nuevo;
      datos.current.verOriginal = false;
      setVerOriginal(false);
      setIndex(nuevo);
    }
    // Flechas y teclado: la foto nueva entra desde su lado.
    function pasar(dir: 1 | -1) {
      if (datos.current.total < 2) return;
      irA(datos.current.index + dir, dir);
    }
    // Deslizar con el dedo: la foto actual termina de salir y la nueva entra.
    function deslizar(dir: 1 | -1) {
      animarA({ s: 1, x: -dir * datos.current.marco.w, y: 0 }, 150, () => irA(datos.current.index + dir, dir));
    }
    // Ya se ve la foto nueva (después de que React la pinte): sin zoom y, si viene de un lado, entrando.
    function fotoNueva() {
      parar();
      vista.s = 1;
      vista.y = 0;
      vista.x = entrada * datos.current.marco.w * 0.25;
      pintarYa();
      if (entrada) animarA({ s: 1, x: 0, y: 0 }, 200);
      entrada = 0;
    }
    function tamano(w: number, h: number) {
      if (w > 0 && h > 0) tamFoto = { w, h };
    }

    function centroVisor(): Punto {
      const n = nodo(fondoRef);
      if (Platform.OS === "web" && n?.getBoundingClientRect && typeof window !== "undefined") {
        const r = n.getBoundingClientRect();
        return { x: r.left + window.scrollX + r.width / 2, y: r.top + window.scrollY + r.height / 2 };
      }
      return { x: datos.current.marco.w / 2, y: datos.current.marco.h / 2 };
    }
    function nuevoGesto(toques: readonly Toque[], previo: Gesto | null): Gesto {
      const n = Math.min(2, toques.length);
      const centro = previo?.centro ?? centroVisor();
      const { c, d } = dedos(toques);
      const c0 = { x: c.x - centro.x, y: c.y - centro.y };
      return {
        n,
        base: { ...vista },
        centro,
        c0,
        d0: d,
        ultimo: c0,
        pellizco: (previo?.pellizco ?? false) || n === 2,
        movido: (previo?.movido ?? false) || n === 2,
      };
    }

    // Se pone o se quita un dedo: se sigue desde donde está la foto, sin saltos.
    function cambiarDedos(toques: readonly Toque[]) {
      if (gesto && toques.length && Math.min(2, toques.length) !== gesto.n) gesto = nuevoGesto(toques, gesto);
    }

    function mover(toques: readonly Toque[]) {
      if (!gesto || !toques.length) return;
      if (Math.min(2, toques.length) !== gesto.n) {
        cambiarDedos(toques);
        return;
      }
      const g = gesto;
      const { c, d } = dedos(toques);
      const p = { x: c.x - g.centro.x, y: c.y - g.centro.y };
      g.ultimo = p;
      if (g.n === 2) {
        if (g.d0 <= 0) return;
        const s = Math.max(0.5, conMuelle(g.base.s * (d / g.d0), 1, MAX_SCALE, 0.3));
        const k = s / g.base.s;
        // El punto de la foto que estaba entre los dedos sigue entre los dedos.
        poner({ s, x: p.x - k * (g.c0.x - g.base.x), y: p.y - k * (g.c0.y - g.base.y) });
        return;
      }
      const dx = p.x - g.c0.x;
      const dy = p.y - g.c0.y;
      if (Math.abs(dx) > TAP_MOVE_TOLERANCE || Math.abs(dy) > TAP_MOVE_TOLERANCE) g.movido = true;
      if (g.base.s > 1.001) {
        // Si la foto ya estaba pasada del borde (al soltar un dedo tras pellizcar), el muelle empieza donde está.
        const { mx, my } = limites(g.base.s);
        poner({
          s: g.base.s,
          x: conMuelle(g.base.x + dx, Math.min(-mx, g.base.x), Math.max(mx, g.base.x)),
          y: conMuelle(g.base.y + dy, Math.min(-my, g.base.y), Math.max(my, g.base.y)),
        });
      } else if (!g.pellizco) {
        // Sin zoom, la foto sigue al dedo hacia los lados (con una sola foto, apenas).
        poner({ s: 1, x: dx * (datos.current.total > 1 ? 1 : 0.25), y: 0 });
      }
    }

    function tocar(p: Punto) {
      const ahora = Date.now();
      const doble = ahora - ultimoToque.t < DOUBLE_TAP_MS && Math.hypot(p.x - ultimoToque.x, p.y - ultimoToque.y) < DOUBLE_TAP_PX;
      if (!doble) {
        ultimoToque = { t: ahora, x: p.x, y: p.y };
        asentar();
        return;
      }
      ultimoToque = { t: 0, x: 0, y: 0 };
      if (vista.s > 1.001) {
        animarA({ s: 1, x: 0, y: 0 }, 240);
        return;
      }
      // Acerca justo donde se ha tocado.
      const s = DOUBLE_TAP_SCALE;
      contarZoom("doble_toque");
      pedirOriginal(s);
      animarA(dentro({ s, x: p.x * (1 - s), y: p.y * (1 - s) }), 260);
    }

    function soltar(v: { vx: number; vy: number }) {
      const g = gesto;
      gesto = null;
      if (!g) return asentar();
      if (g.pellizco) {
        if (vista.s > 1.001) contarZoom("pellizco");
        return asentar(g.ultimo);
      }
      if (!g.movido) return tocar(g.c0);
      if (g.base.s > 1.001) {
        // Un poco de inercia al soltar con velocidad (las velocidades van en px por ms).
        const rapido = Math.abs(v.vx) > 0.25 || Math.abs(v.vy) > 0.25;
        return asentar(undefined, rapido ? { x: vista.x + v.vx * 140, y: vista.y + v.vy * 140 } : undefined);
      }
      const dx = vista.x;
      if (datos.current.total > 1 && (Math.abs(dx) > SWIPE_THRESHOLD || (Math.abs(dx) > 20 && Math.abs(v.vx) > 0.4))) {
        deslizar(dx < 0 ? 1 : -1);
      } else {
        animarA({ s: 1, x: 0, y: 0 }, 180);
      }
    }

    // Rueda del ratón o pellizco del panel táctil (llega como rueda con Ctrl): acerca donde está el puntero.
    function rueda(ev: WheelEvent) {
      ev.preventDefault();
      parar();
      const n = nodo(fondoRef);
      if (!n?.getBoundingClientRect) return;
      const r = n.getBoundingClientRect();
      const p = { x: ev.clientX - (r.left + r.width / 2), y: ev.clientY - (r.top + r.height / 2) };
      const delta = ev.deltaY * (ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? r.height : 1);
      const s = clamp(vista.s * Math.exp(-delta * (ev.ctrlKey ? 0.01 : 0.002)), 1, MAX_SCALE);
      const k = s / vista.s;
      const destino = dentro({ s, x: p.x - k * (p.x - vista.x), y: p.y - k * (p.y - vista.y) });
      if (destino.s > 1) contarZoom("rueda");
      pedirOriginal(destino.s);
      poner(destino);
    }

    const gestos = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Nada le quita el gesto al visor a medias (ni el scroll de la ficha que queda debajo).
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        parar();
        capaViva(true);
        const toques = evt.nativeEvent.touches;
        gesto = toques && toques.length ? nuevoGesto(toques, null) : null;
      },
      onPanResponderStart: (evt) => cambiarDedos(evt.nativeEvent.touches ?? []),
      onPanResponderEnd: (evt) => cambiarDedos(evt.nativeEvent.touches ?? []),
      onPanResponderMove: (evt) => mover(evt.nativeEvent.touches ?? []),
      onPanResponderRelease: (_evt, g) => soltar(g),
      onPanResponderTerminate: (_evt, g) => soltar(g),
    });

    return { panHandlers: gestos.panHandlers, pasar, fotoNueva, tamano, rueda };
  }, []);

  // Foto nueva en pantalla (también al abrir): se coloca antes de que se vea.
  useLayoutEffect(() => {
    motor.fotoNueva();
  }, [index, motor]);

  // Teclado (escritorio): Escape cierra y las flechas cambian de foto.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") datos.current.onClose();
      else if (e.key === "ArrowLeft") motor.pasar(-1);
      else if (e.key === "ArrowRight") motor.pasar(1);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [motor]);

  // Gestos que el navegador haría por su cuenta encima del visor: la rueda (que movería la ficha de debajo) y, en el
  // iPhone, el pellizco que acerca la página entera. Hace falta registrarlos a mano para poder cancelarlos.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const n = fondoRef.current as unknown as HTMLElement | null;
    if (!n?.addEventListener) return;
    const sinMoverPagina = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };
    const sinZoomSafari = (e: Event) => e.preventDefault();
    n.addEventListener("wheel", motor.rueda, { passive: false });
    n.addEventListener("touchmove", sinMoverPagina, { passive: false });
    document.addEventListener("gesturestart", sinZoomSafari);
    document.addEventListener("gesturechange", sinZoomSafari);
    return () => {
      n.removeEventListener("wheel", motor.rueda);
      n.removeEventListener("touchmove", sinMoverPagina);
      document.removeEventListener("gesturestart", sinZoomSafari);
      document.removeEventListener("gesturechange", sinZoomSafari);
    };
  }, [motor]);

  const current = images[Math.min(index, images.length - 1)];
  const cajaW = marco.w;
  const cajaH = Math.round(marco.h * ALTO_FOTO);
  const web = Platform.OS === "web";
  const arriba = 16 + insets.top;

  const botonRedondo = {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  } as const;

  return (
    <View
      ref={fondoRef}
      nativeID="visor-fotos"
      role="dialog"
      aria-modal
      accessibilityLabel="Visor de fotos"
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        if (w > 0 && h > 0) setMarco((m) => (m.w === w && m.h === h ? m : { w, h }));
      }}
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: FONDO,
          zIndex: 9999,
          elevation: 20,
        },
        web ? ({ touchAction: "none", userSelect: "none", overscrollBehavior: "contain" } as object) : null,
      ]}
      {...motor.panHandlers}
    >
      {/* Las fotos no reciben toques: todos los gestos los lleva la capa (y en escritorio no se arrastra la imagen). */}
      <View pointerEvents="none" style={{ flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <View ref={capaRef} nativeID="visor-fotos-capa" style={{ width: cajaW, height: cajaH }}>
          <SmartImage
            key={current.id}
            uri={current.url}
            ancho={cajaW}
            alt={`Foto ${index + 1} de ${images.length}`}
            contentFit="contain"
            priority="high"
            style={{ width: cajaW, height: cajaH }}
            onTamano={motor.tamano}
          />
          {verOriginal ? (
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
              <SmartImage
                key={`${current.id}-original`}
                uri={current.url}
                alt=""
                contentFit="contain"
                transitionMs={200}
                style={{ width: cajaW, height: cajaH }}
                onTamano={motor.tamano}
              />
            </View>
          ) : null}
        </View>
      </View>

      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Cerrar el visor de fotos"
        style={{ ...botonRedondo, position: "absolute", top: arriba, right: 16, zIndex: 2 }}
      >
        <Ionicons name="close" size={22} color="#FFFFFF" />
      </Pressable>

      {images.length > 1 ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: arriba + 7,
            left: 16,
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.14)",
          }}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 12 }}>
            {index + 1} / {images.length}
          </Text>
        </View>
      ) : null}

      {images.length > 1 ? (
        <>
          <Pressable
            onPress={() => motor.pasar(-1)}
            accessibilityRole="button"
            accessibilityLabel="Foto anterior"
            style={{ ...botonRedondo, position: "absolute", left: 8, top: "50%", marginTop: -22 }}
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </Pressable>

          <Pressable
            onPress={() => motor.pasar(1)}
            accessibilityRole="button"
            accessibilityLabel="Foto siguiente"
            style={{ ...botonRedondo, position: "absolute", right: 8, top: "50%", marginTop: -22 }}
          >
            <Ionicons name="chevron-forward" size={24} color="#FFFFFF" />
          </Pressable>

          {/* Puntos solo con pocas fotos: con muchas (VeoAura manda hasta 30) no caben en un móvil estrecho y ya
              está el contador «n / N» arriba. */}
          {images.length <= 12 ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                bottom: 20 + insets.bottom,
                left: 0,
                right: 0,
                flexDirection: "row",
                justifyContent: "center",
                gap: 6,
              }}
            >
              {images.map((img, i) => (
                <View
                  key={img.id}
                  style={{
                    width: i === index ? 18 : 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: i === index ? "#FFFFFF" : "rgba(255,255,255,0.4)",
                  }}
                />
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
