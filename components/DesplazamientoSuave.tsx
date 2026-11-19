/**
 * Archivo: components/DesplazamientoSuave.tsx
 * Función: piezas comunes del desplazamiento de la tienda: AparecerAlVer (cada apartado aparece con un fundido suave al
 *          entrar en pantalla) y BotonVolverArriba (flecha flotante para subir, que sale tras bajar bastante).
 * Para qué sirve: que bajar por la tienda se sienta moderno y cuidado en todas las pantallas largas (dueño, 2026-11-19:
 *          «que se sienta futurista y moderno, como si lo hubiera hecho un diseñador con experiencia»), con las mismas
 *          piezas en todas partes.
 * Conectado con: app/(tabs)/index.tsx (Inicio), app/catalogo.tsx, app/servicios.tsx, app/producto/[id].tsx.
 * Utilizado por: esas pantallas.
 * Dependencias: react, react-native, @expo/vector-icons.
 * Estado: ACTIVO
 *
 * Notas:
 * - AparecerAlVer: solo en la web y solo para lo que empieza FUERA de la pantalla: lo que ya se ve al abrir no se anima
 *   (la primera pantalla sale entera y quieta). Al entrar en pantalla sube 14 px y se funde en ~0,4 s, una sola vez, con
 *   lo que pinta el navegador (opacity y transform: no frena el móvil). Con «Reducir movimiento» del sistema no se anima
 *   nada, nunca. En el navegador de las pruebas automáticas (navigator.webdriver) tampoco, para que sus medidas no cambien
 *   a mitad de animación, salvo que la prueba lo pida con window.__vzAnimarDesplazamiento = true (sección DESPL).
 * - BotonVolverArriba: 46 px (cómodo para el pulgar), abajo a la derecha, oscuro translúcido como el de Inicio; aparece
 *   y desaparece con un fundido. La pantalla decide cuándo se ve (tras bajar 480 px, como Inicio) y a qué altura va (en el
 *   catálogo y Servicios, encima de la flecha «Volver» azul de components/BotonAtrasAlcance.tsx, sin taparla).
 */
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Platform, Pressable, View, type StyleProp, type ViewStyle } from "react-native";

const SUBIDA_PX = 14;
const DURACION_MS = 420;

function animacionesPermitidas(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  if (typeof IntersectionObserver === "undefined") return false;
  // «Reducir movimiento» del sistema manda siempre (también en las pruebas).
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  } catch {
    // sin matchMedia: se anima
  }
  const w = window as unknown as { __vzAnimarDesplazamiento?: boolean };
  if (w.__vzAnimarDesplazamiento === true) return true;
  return !(typeof navigator !== "undefined" && (navigator as { webdriver?: boolean }).webdriver);
}

/** Envuelve un apartado: si empieza fuera de la pantalla, aparece con un fundido suave al llegar a él (una vez). */
export function AparecerAlVer({
  children,
  style,
  nativeID,
  retrasoMs = 0,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  nativeID?: string;
  /** Para escalonar varios que entran a la vez (p. ej. tarjetas de una fila): 0-240 ms. */
  retrasoMs?: number;
}) {
  const ref = useRef<View>(null);

  useEffect(() => {
    if (!animacionesPermitidas()) return;
    const nodo = ref.current as unknown as HTMLElement | null;
    if (!nodo || typeof nodo.getBoundingClientRect !== "function") return;
    const caja = nodo.getBoundingClientRect();
    // Lo que ya se ve (o está en una pantalla oculta, sin medidas) no se anima: la primera pantalla sale quieta.
    if (caja.height === 0 || caja.top < window.innerHeight) return;
    nodo.style.opacity = "0";
    nodo.style.transform = `translateY(${SUBIDA_PX}px)`;
    nodo.style.willChange = "opacity, transform";
    let hecho = false;
    const mostrar = () => {
      if (hecho) return;
      hecho = true;
      nodo.style.transition = `opacity ${DURACION_MS}ms ease-out ${retrasoMs}ms, transform ${DURACION_MS + 80}ms cubic-bezier(.2,.7,.2,1) ${retrasoMs}ms`;
      nodo.style.opacity = "1";
      nodo.style.transform = "none";
      // Terminado, sin rastro: ni will-change (gasta memoria) ni transición pendiente.
      window.setTimeout(() => {
        nodo.style.willChange = "";
        nodo.style.transition = "";
      }, DURACION_MS + 120 + retrasoMs);
    };
    const vigia = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          mostrar();
          vigia.disconnect();
        }
      },
      { threshold: 0.06, rootMargin: "0px 0px -6% 0px" }
    );
    vigia.observe(nodo);
    return () => {
      vigia.disconnect();
      // Si se desmonta a medias, que nunca quede invisible.
      nodo.style.opacity = "";
      nodo.style.transform = "";
      nodo.style.willChange = "";
      nodo.style.transition = "";
    };
  }, [retrasoMs]);

  return (
    <View ref={ref} nativeID={nativeID} style={style}>
      {children}
    </View>
  );
}

/** Flecha flotante «Volver arriba», abajo a la derecha. `abajo`: distancia al borde inferior (encima de la barra de pestañas o de «Comparar»). */
export function BotonVolverArriba({ visible, onPress, abajo, nativeID = "volver-arriba" }: { visible: boolean; onPress: () => void; abajo: number; nativeID?: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: visible ? 1 : 0, duration: 200, useNativeDriver: Platform.OS !== "web" }).start();
  }, [visible, anim]);
  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={{
        position: "absolute",
        right: 14,
        bottom: abajo,
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
      }}
    >
      <Pressable
        nativeID={nativeID}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Volver arriba"
        style={({ pressed }) => ({
          width: 46,
          height: 46,
          borderRadius: 23,
          backgroundColor: "rgba(11,33,56,0.75)",
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.85 : 1,
          ...(Platform.OS === "web" ? ({ boxShadow: "0 6px 18px rgba(11,33,56,0.22)" } as object) : {}),
        })}
      >
        <Ionicons name="arrow-up" size={17} color="#FFFFFF" />
      </Pressable>
    </Animated.View>
  );
}
