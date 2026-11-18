/**
 * Archivo: components/ficha/FichaProducto.tsx
 * Función: el bloque «Características · Mantenimiento básico realizado · Descripción» de una ficha: carrusel con
 *          pestañas, puntos y pase automático (se para al tocar y con «reducir movimiento»), lista de pares y descripción.
 * Para qué sirve: lo que antes estaba al final de app/producto/[id].tsx (FichaProducto y sus piezas). Lo usan la ficha de
 *          producto y la de servicio. Se separó en la tanda 6 de «ordenar el proyecto» (2026-11-18), sin cambiar nada.
 * Conectado con: components/ficha/DatosFicha.tsx (tipos Caracteristica y Mantenimiento), constants/temaTienda.ts.
 * Utilizado por: app/producto/[id].tsx y app/servicio/[id].tsx (este lo sigue importando de app/producto/[id], que lo
 *          reexporta).
 * Dependencias: react, react-native, @expo/vector-icons.
 * Estado: ACTIVO
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, ScrollView, Text, useWindowDimensions, View, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { sinEmojis } from "../../lib/admin/productos.utilidades";
import { COLORS, Caracteristica, Mantenimiento } from "./DatosFicha";

// --- Ficha: «Características», «Mantenimiento básico realizado» y «Descripción» ----------------------------------
// Con más de una, son pantallas de un carrusel horizontal: se pasa de una a otra deslizando el dedo (en la web, el
// desplazamiento con «encaje» por páginas), o con las pestañas de arriba (ratón y teclado); los puntos de debajo dicen
// en cuál se está y se van llenando mientras corre el pase automático (una pantalla cada 10 s, solo con el carrusel a
// la vista; se para mientras el dedo o el ratón están encima, con la pestaña del navegador oculta y con «reducir
// movimiento»; el botón de pausa lo detiene). Cuando el cliente cambia de pantalla él mismo, el pase automático se
// acaba y, a los 3 s, la página se recoloca sola para que la pantalla nueva se lea entera (salvo que el cliente ya se
// esté moviendo). Con solo la descripción, sin carrusel. Todo el texto con <Text> (nunca HTML).

const VERDE_OK = "#16A34A";
const PASE_MS = 10_000;
const RECOLOCAR_MS = 3_000;
const PISTA_PASE = "rgba(30,167,232,0.22)";

type PantallaFicha = "caracteristicas" | "mantenimiento" | "descripcion";

// Mueve con suavidad el contenedor con scroll de la página (el primero hacia arriba que se desplaza en vertical): si la
// ficha cabe, la deja entera y centrada; si no cabe, deja las pestañas arriba. Si ya se lee bien, no mueve nada. Web.
function recolocarParaLeer(nodo: HTMLElement, suave: boolean) {
  let contenedor: HTMLElement | null = null;
  for (let n = nodo.parentElement; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 1) {
      contenedor = n;
      break;
    }
  }
  const caja = contenedor ? contenedor.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  const arriba = Math.max(caja.top, 0) + 12;
  const abajo = Math.min(caja.bottom, window.innerHeight) - 24;
  const r = nodo.getBoundingClientRect();
  let mover = 0;
  if (r.height <= abajo - arriba) {
    if (r.top < arriba || r.bottom > abajo) mover = r.top - (arriba + (abajo - arriba - r.height) / 2);
  } else if (Math.abs(r.top - arriba) > 24) {
    mover = r.top - arriba;
  }
  if (Math.abs(mover) < 2) return;
  (contenedor ?? window).scrollBy({ top: mover, behavior: suave ? "smooth" : "auto" });
}

const SIN_DESCRIPCION_PRODUCTO =
  "Todavía no hay una descripción disponible para este producto. Aun así, puedes preguntarnos por su estado, contenido, compatibilidad o disponibilidad por el chat.";

// La descripción se enseña sin emojis aunque el dueño los escriba en el panel (sinEmojis; dueño, 2026-11-04).
function BloqueDescripcion({ descripcion, sinDescripcion }: { descripcion: string | null; sinDescripcion: string }) {
  const texto = sinEmojis(descripcion);
  return texto ? (
    <Text style={{ color: COLORS.muted, lineHeight: 22, textAlign: "center" }}>{texto}</Text>
  ) : (
    <Text style={{ color: COLORS.muted2, lineHeight: 22, textAlign: "center" }}>{sinDescripcion}</Text>
  );
}

function ListaPares({ pares }: { pares: Caracteristica[] }) {
  return (
    <View style={{ width: "100%" }}>
      {pares.map((c, i) => (
        <View
          key={`${i}-${c.etiqueta}`}
          accessible
          accessibilityLabel={`${c.etiqueta}: ${c.valor}`}
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 12,
            paddingVertical: 9,
            borderBottomWidth: i === pares.length - 1 ? 0 : 1,
            borderBottomColor: COLORS.borderSoft,
          }}
        >
          <Text style={{ flex: 1, color: COLORS.muted, fontWeight: "700", fontSize: 14, lineHeight: 20 }}>{c.etiqueta}</Text>
          <Text style={{ flex: 1, color: COLORS.text, fontWeight: "800", fontSize: 14, lineHeight: 20, textAlign: "right" }}>{c.valor}</Text>
        </View>
      ))}
    </View>
  );
}

// ✓ verde para «Sí»/«Completo»; indicador neutro para «Parcial» y «No»; el resto, solo el texto.
function iconoPunto(valor: string): { nombre: React.ComponentProps<typeof Ionicons>["name"]; color: string } | null {
  const v = valor.trim().toLowerCase();
  if (v === "sí" || v === "si" || v === "completo" || v === "completa") return { nombre: "checkmark-circle", color: VERDE_OK };
  if (v === "parcial") return { nombre: "contrast-outline", color: COLORS.muted };
  if (v === "no") return { nombre: "remove-circle-outline", color: COLORS.muted };
  return null;
}

// La pestaña dice «Mantenimiento» (tres pestañas caben así en el móvil); el título que envía VeoAura va aquí.
function BloqueMantenimiento({ m }: { m: Mantenimiento }) {
  return (
    <View style={{ width: "100%", gap: 10 }}>
      <Text accessibilityRole="header" {...({ "aria-level": 3 } as object)} style={{ color: COLORS.text, fontWeight: "900", fontSize: 15, lineHeight: 21, textAlign: "center" }}>
        {m.titulo}
      </Text>
      {!!m.nota && (
        <Text style={{ color: COLORS.muted, fontSize: 13.5, lineHeight: 20, textAlign: "center" }}>{m.nota}</Text>
      )}
      <View style={{ width: "100%" }}>
        {m.puntos.map((pt, i) => {
          const icono = iconoPunto(pt.valor);
          return (
            <View
              key={`${i}-${pt.etiqueta}`}
              accessible
              accessibilityLabel={`${pt.etiqueta}: ${pt.valor}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingVertical: 9,
                borderBottomWidth: i === m.puntos.length - 1 ? 0 : 1,
                borderBottomColor: COLORS.borderSoft,
              }}
            >
              <Text style={{ flex: 1, color: COLORS.muted, fontWeight: "700", fontSize: 14, lineHeight: 20 }}>{pt.etiqueta}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {icono && <Ionicons name={icono.nombre} size={18} color={icono.color} />}
                <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 14, lineHeight: 20 }}>{pt.valor}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// También la usa la ficha de servicio (app/servicio/[id].tsx, mismo formato que la de producto): «prefijo» da los id
// de sus partes (#servicio-ficha-carrusel…) y «sinDescripcion», el texto cuando no hay descripción.
export function FichaProducto({
  caracteristicas,
  mantenimiento,
  descripcion,
  prefijo = "producto",
  sinDescripcion = SIN_DESCRIPCION_PRODUCTO,
}: {
  caracteristicas: Caracteristica[];
  mantenimiento: Mantenimiento | null;
  descripcion: string | null;
  prefijo?: "producto" | "servicio";
  sinDescripcion?: string;
}) {
  const pantallas: PantallaFicha[] = [];
  if (caracteristicas.length) pantallas.push("caracteristicas");
  if (mantenimiento) pantallas.push("mantenimiento");
  pantallas.push("descripcion");
  const total = pantallas.length;
  const varias = total > 1;
  const web = Platform.OS === "web" && typeof window !== "undefined";

  const { width: anchoVentana } = useWindowDimensions();
  const [ancho, setAncho] = useState(0);
  const [activaGuardada, setActiva] = useState(0);
  const activa = Math.min(activaGuardada, total - 1);
  const [altos, setAltos] = useState<number[]>([]);
  const [parado, setParado] = useState(false); // pase automático detenido (por el cliente o por «reducir movimiento»)
  const [listo, setListo] = useState(false); // ya se sabe si el dispositivo pide «reducir movimiento»
  const [suave, setSuave] = useState(true);
  const [enPausa, setEnPausa] = useState(false); // dedo o ratón encima, o pestaña del navegador oculta
  const [aLaVista, setALaVista] = useState(!web);
  const cajaRef = useRef<View>(null);
  const paginasRef = useRef<View>(null);
  const carruselRef = useRef<ScrollView>(null);
  const anchoRef = useRef(0);
  const activaRef = useRef(activa);
  const suaveRef = useRef(true);
  const destinoRef = useRef<number | null>(null); // pantalla a la que va un desplazamiento hecho por código
  const destinoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelarRecolocar = useRef<(() => void) | null>(null);
  const [progreso] = useState(() => new Animated.Value(0));
  const restante = useRef(PASE_MS);

  useEffect(() => {
    let vivo = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reducir) => {
        if (!vivo) return;
        if (reducir) {
          setParado(true);
          setSuave(false);
          suaveRef.current = false;
        }
        setListo(true);
      })
      .catch(() => {
        if (vivo) setListo(true);
      });
    return () => {
      vivo = false;
    };
  }, []);

  // Cada pantalla, SIEMPRE entera en su sitio (dueño, 2026-11-04: al pasar de «Características» a «Descripción» se
  // quedaba a medias y había que acomodarla con el dedo). En el iPhone el deslizamiento animado se corta a veces (a la
  // vez cambia el alto del carrusel) y el dedo puede soltarlo entre dos pantallas: al pararse, se coloca en la que toca.
  const dedoRef = useRef(false);
  const totalRef = useRef(total);
  totalRef.current = total;
  const encajarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paradaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Dónde está de verdad el carrusel (en la web, el nodo que se desplaza; fuera de la web no hace falta).
  const xActual = useCallback((): number | null => {
    const nodo = (carruselRef.current as unknown as { getScrollableNode?: () => HTMLElement | null } | null)?.getScrollableNode?.();
    return nodo && typeof nodo.scrollLeft === "number" ? nodo.scrollLeft : null;
  }, []);
  // Si se quedó a medias, la pantalla «i» se coloca exacta, sin animación.
  const encajar = useCallback(
    (i: number) => {
      const x = xActual();
      const objetivo = i * anchoRef.current;
      if (x === null || Math.abs(x - objetivo) <= 1) return;
      destinoRef.current = i;
      carruselRef.current?.scrollTo({ x: objetivo, animated: false });
    },
    [xActual]
  );

  const moverA = useCallback(
    (i: number) => {
      destinoRef.current = i;
      if (destinoTimer.current) clearTimeout(destinoTimer.current);
      destinoTimer.current = setTimeout(() => {
        destinoRef.current = null;
      }, 1200);
      carruselRef.current?.scrollTo({ x: i * anchoRef.current, animated: suaveRef.current });
      // El deslizamiento animado tarda unos 300-500 ms: después se comprueba que llegó y, si no, se encaja.
      if (encajarTimer.current) clearTimeout(encajarTimer.current);
      encajarTimer.current = setTimeout(() => {
        encajarTimer.current = null;
        encajar(i);
      }, 650);
    },
    [encajar]
  );

  // Al dejar de desplazarse (y sin el dedo encima), si el carrusel está entre dos pantallas, va a la más cercana.
  const revisarParada = useCallback(() => {
    if (paradaTimer.current) clearTimeout(paradaTimer.current);
    paradaTimer.current = setTimeout(() => {
      paradaTimer.current = null;
      if (dedoRef.current || destinoRef.current !== null) return;
      const x = xActual();
      const w = anchoRef.current;
      if (x === null || !w) return;
      const i = Math.max(0, Math.min(totalRef.current - 1, Math.round(x / w)));
      if (Math.abs(x - i * w) > 1) moverA(i);
    }, 220);
  }, [xActual, moverA]);
  const revisarParadaRef = useRef(revisarParada);
  revisarParadaRef.current = revisarParada;

  // A los 3 s de cambiar de pantalla el cliente, se recoloca la página; si antes toca, teclea o mueve la página, no.
  const programarRecolocar = useCallback(() => {
    cancelarRecolocar.current?.();
    if (!web) return;
    const nodo = cajaRef.current as unknown as HTMLElement | null;
    if (!nodo?.getBoundingClientRect) return;
    let espera: ReturnType<typeof setTimeout> | undefined;
    function cancelar() {
      if (espera) clearTimeout(espera);
      window.removeEventListener("pointerdown", cancelar, true);
      window.removeEventListener("keydown", cancelar, true);
      window.removeEventListener("wheel", rueda, true);
      cancelarRecolocar.current = null;
    }
    function rueda(e: WheelEvent) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) cancelar();
    }
    window.addEventListener("pointerdown", cancelar, true);
    window.addEventListener("keydown", cancelar, true);
    window.addEventListener("wheel", rueda, { capture: true, passive: true });
    espera = setTimeout(() => {
      cancelar();
      recolocarParaLeer(nodo, suaveRef.current);
    }, RECOLOCAR_MS);
    cancelarRecolocar.current = cancelar;
  }, [web]);

  // El cliente ha cambiado de pantalla: se acaba el pase automático y se recoloca la página a los 3 s.
  const cambioDelCliente = useCallback(() => {
    setParado(true);
    programarRecolocar();
  }, [programarRecolocar]);

  useEffect(() => {
    const recolocar = cancelarRecolocar;
    const destino = destinoTimer;
    const encaje = encajarTimer;
    const parada = paradaTimer;
    return () => {
      recolocar.current?.();
      if (destino.current) clearTimeout(destino.current);
      if (encaje.current) clearTimeout(encaje.current);
      if (parada.current) clearTimeout(parada.current);
    };
  }, []);

  // Pausas: ratón o dedo sobre las pantallas, pestaña del navegador oculta y carrusel fuera de la vista.
  useEffect(() => {
    if (!web || !varias) return;
    const caja = cajaRef.current as unknown as HTMLElement | null;
    const paginas = paginasRef.current as unknown as HTMLElement | null;
    if (!caja?.addEventListener || !paginas?.addEventListener) return;
    const motivos = new Set<string>();
    const marcar = (motivo: string, si: boolean) => {
      if (si) motivos.add(motivo);
      else motivos.delete(motivo);
      setEnPausa(motivos.size > 0);
    };
    const entra = (e: PointerEvent) => {
      if (e.pointerType === "mouse") marcar("raton", true);
    };
    const sale = (e: PointerEvent) => {
      if (e.pointerType === "mouse") marcar("raton", false);
    };
    const toca = () => {
      destinoRef.current = null; // el dedo manda: lo que se mueva ahora lo mueve el cliente
      dedoRef.current = true;
      marcar("dedo", true);
    };
    const suelta = () => {
      dedoRef.current = false;
      marcar("dedo", false);
      revisarParadaRef.current(); // si lo soltó entre dos pantallas, va a la más cercana
    };
    const visibilidad = () => marcar("oculta", document.hidden);
    paginas.addEventListener("pointerenter", entra);
    paginas.addEventListener("pointerleave", sale);
    paginas.addEventListener("touchstart", toca, { passive: true });
    paginas.addEventListener("touchend", suelta);
    paginas.addEventListener("touchcancel", suelta);
    document.addEventListener("visibilitychange", visibilidad);
    visibilidad();
    const vigia =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            ([e]) => {
              const alto = e.rootBounds?.height ?? window.innerHeight;
              setALaVista(e.isIntersecting && (e.intersectionRatio >= 0.6 || e.intersectionRect.height >= alto * 0.5));
            },
            { threshold: Array.from({ length: 21 }, (_, i) => i / 20) }
          );
    if (vigia) vigia.observe(caja);
    else setALaVista(true);
    return () => {
      paginas.removeEventListener("pointerenter", entra);
      paginas.removeEventListener("pointerleave", sale);
      paginas.removeEventListener("touchstart", toca);
      paginas.removeEventListener("touchend", suelta);
      paginas.removeEventListener("touchcancel", suelta);
      document.removeEventListener("visibilitychange", visibilidad);
      vigia?.disconnect();
    };
  }, [web, varias]);

  // Pase automático: la barrita del punto activo se llena en 10 s y entonces pasa a la siguiente (y de la última, a
  // la primera). Al pausar se guarda lo que faltaba; al cambiar de pantalla vuelve a empezar.
  const corriendo = varias && listo && !parado && !enPausa && aLaVista && ancho > 0;
  useEffect(() => {
    progreso.setValue(0);
    restante.current = PASE_MS;
  }, [activa, progreso]);
  useEffect(() => {
    if (!corriendo) return;
    Animated.timing(progreso, { toValue: 1, duration: restante.current, easing: Easing.linear, useNativeDriver: false }).start(
      ({ finished }) => {
        if (!finished) return;
        const siguiente = (activa + 1) % total;
        moverA(siguiente);
        setActiva(siguiente);
      }
    );
    return () =>
      progreso.stopAnimation((v) => {
        restante.current = Math.max(0, (1 - v) * PASE_MS);
      });
  }, [corriendo, activa, total, moverA, progreso]);

  // Si cambia el ancho (giro del móvil), la pantalla que se ve sigue en su sitio.
  useEffect(() => {
    activaRef.current = activa;
  }, [activa]);
  useEffect(() => {
    if (ancho > 0) carruselRef.current?.scrollTo({ x: activaRef.current * ancho, animated: false });
  }, [ancho]);

  const seccion = { width: "100%", gap: 10, alignItems: "center", paddingTop: 16, borderTopWidth: 1, borderTopColor: COLORS.borderSoft } as const;

  // Solo la descripción: sin carrusel.
  if (!varias) {
    return (
      <View nativeID={`${prefijo}-descripcion`} style={[seccion, { gap: 8 }]}>
        <Text accessibilityRole="header" {...({ "aria-level": 2 } as object)} style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>
          Descripción
        </Text>
        <BloqueDescripcion descripcion={descripcion} sinDescripcion={sinDescripcion} />
      </View>
    );
  }

  const etiqueta = (cual: PantallaFicha) => (cual === "caracteristicas" ? "Características" : cual === "mantenimiento" ? "Mantenimiento" : "Descripción");
  const contenido = (cual: PantallaFicha) =>
    cual === "caracteristicas" ? (
      <ListaPares pares={caracteristicas} />
    ) : cual === "mantenimiento" ? (
      mantenimiento ? <BloqueMantenimiento m={mantenimiento} /> : null
    ) : (
      <BloqueDescripcion descripcion={descripcion} sinDescripcion={sinDescripcion} />
    );
  const estrecho = anchoVentana < 420;
  const diminuto = anchoVentana < 360;
  const ir = (i: number) => {
    if (i === activa) return;
    moverA(i);
    setActiva(i);
    cambioDelCliente();
  };
  // Cada pantalla con su alto natural; el carrusel toma el alto de la que se ve (con una transición suave en la web).
  const altoActiva = altos[activa];
  const estiloAlto = altoActiva
    ? ({
        height: altoActiva,
        ...(web && suave ? { transitionProperty: "height", transitionDuration: "280ms", transitionTimingFunction: "ease-out" } : null),
      } as ViewStyle)
    : undefined;

  return (
    <View ref={cajaRef} nativeID={`${prefijo}-ficha-carrusel`} style={seccion}>
      {/* Pestañas (ordenador, teclado y lectores de pantalla); en el móvil, además, se desliza con el dedo. */}
      <View accessibilityRole="tablist" style={{ width: "100%", maxWidth: 520, flexDirection: "row", justifyContent: "center", gap: 4 }}>
        {pantallas.map((cual, i) => {
          const sel = i === activa;
          return (
            <Pressable
              key={cual}
              accessibilityRole="tab"
              accessibilityState={{ selected: sel }}
              {...({ "aria-selected": sel } as object)}
              onPress={() => ir(i)}
              style={({ pressed }) => ({
                flexShrink: 1,
                minHeight: 44,
                paddingHorizontal: diminuto ? 4 : estrecho ? 7 : 10,
                justifyContent: "center",
                borderBottomWidth: 2,
                borderBottomColor: sel ? COLORS.accent : "transparent",
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text numberOfLines={1} style={{ color: sel ? COLORS.text : COLORS.muted, fontWeight: "900", fontSize: diminuto ? 12.5 : estrecho ? 14 : 15, textAlign: "center" }}>
                {etiqueta(cual)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View
        ref={paginasRef}
        style={{ width: "100%", maxWidth: 520 }}
        onLayout={(e) => {
          anchoRef.current = e.nativeEvent.layout.width;
          setAncho(e.nativeEvent.layout.width);
        }}
      >
        {ancho > 0 && (
          <ScrollView
            ref={carruselRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={32}
            onScroll={(e) => {
              const x = e.nativeEvent.contentOffset.x;
              // Un desplazamiento hecho por código (pestaña o pase automático) no cuenta como gesto del cliente.
              const destino = destinoRef.current;
              if (destino !== null) {
                if (Math.abs(x - destino * ancho) < 2) destinoRef.current = null;
                return;
              }
              const i = Math.round(x / ancho);
              if (i !== activa && i >= 0 && i < total) {
                setActiva(i);
                cambioDelCliente();
              }
              revisarParada();
            }}
            contentContainerStyle={{ alignItems: "flex-start" }}
            style={estiloAlto}
          >
            {pantallas.map((cual, i) => (
              <View
                key={cual}
                nativeID={`${prefijo}-${cual}`}
                {...({ role: "tabpanel" } as object)}
                // 1 px de margen: con el carrusel en una posición con decimales, no asoma el borde de la pantalla vecina.
                style={{ width: ancho, paddingHorizontal: 1 }}
                onLayout={(e) => {
                  const alto = Math.ceil(e.nativeEvent.layout.height);
                  setAltos((prev) => (prev[i] === alto ? prev : Object.assign([...prev], { [i]: alto })));
                }}
              >
                {contenido(cual)}
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Puntos indicadores (el activo se va llenando con el pase automático) y botón de pausa. Un hueco igual a la
          izquierda deja los puntos centrados. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
        <View style={{ width: 44 }} />
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          {pantallas.map((cual, i) => {
            const sel = i === activa;
            return (
              <View
                key={cual}
                style={{
                  width: sel ? 22 : 7,
                  height: 7,
                  borderRadius: 4,
                  overflow: "hidden",
                  backgroundColor: sel ? (parado ? COLORS.accent : PISTA_PASE) : COLORS.border,
                }}
              >
                {sel && !parado && (
                  <Animated.View
                    style={{
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: COLORS.accent,
                      width: progreso.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
                    }}
                  />
                )}
              </View>
            );
          })}
        </View>
        <Pressable
          nativeID={`${prefijo}-ficha-pausa`}
          onPress={() => setParado((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={parado ? "Reanudar el pase automático" : "Pausar el pase automático"}
          style={({ pressed }) => ({ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
        >
          <Ionicons name={parado ? "play" : "pause"} size={13} color={COLORS.muted} />
        </Pressable>
      </View>
    </View>
  );
}
