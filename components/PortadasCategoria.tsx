// components/PortadasCategoria.tsx
/**
 * Qué hace: las portadas de una categoría (hasta 3 fotos) en un carrusel que se pasa solo: cada 5 s la foto se
 * desliza a la siguiente y de la última vuelve a la primera sin saltos (al final va una copia de la primera). Con una
 * sola foto se ve fija. No se mueve con «reducir movimiento», fuera de la vista ni con la pestaña oculta. Puntos
 * blancos abajo para saber cuál se ve.
 *
 * También:
 * - portadasDe(fila): las direcciones de las portadas de una fila de categories (columna imagenes y, si no hay, la
 *   antigua image_url), limpias y como mucho 3.
 * - usePortadasCategorias(): portadas de todas las categorías activas, por slug. Una sola consulta por visita,
 *   compartida entre pantallas; olvidarPortadasCategorias() la repite (el panel la llama al guardar).
 * - faltaColumnaPortadas(error): si Supabase dice que aún no existe la columna (la migración se aplica aparte).
 *
 * Conectado con: app/(tabs)/index.tsx (tarjetas de «Categorías»), app/catalogo.tsx (cabecera de la categoría),
 * app/admin/categories.tsx (lista y formulario) y supabase/migrations/20261030120000_categorias_portadas.sql.
 */
import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, View, type StyleProp, type ViewStyle } from "react-native";
import SmartImage from "./SmartImage";
import { supabase } from "../lib/supabase";

export const MAX_PORTADAS = 3;
const PASO_MS = 5000;
const DESLIZ_MS = 600;
// 1 px de separación entre fotos: con anchos con decimales, no asoma el borde de la siguiente.
const SEPARACION = 1;

export function portadasDe(fila: { imagenes?: unknown; image_url?: unknown } | null | undefined): string[] {
  const bruto = fila?.imagenes;
  const lista: unknown[] = Array.isArray(bruto) ? bruto : [];
  const urls = lista
    .filter((u): u is string => typeof u === "string")
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\/\S+$/i.test(u));
  const antigua = typeof fila?.image_url === "string" ? fila.image_url.trim() : "";
  if (!urls.length && /^https?:\/\/\S+$/i.test(antigua)) urls.push(antigua);
  return Array.from(new Set(urls)).slice(0, MAX_PORTADAS);
}

export function faltaColumnaPortadas(error: { message?: string } | null | undefined): boolean {
  const m = String(error?.message ?? "");
  return /imagenes|image_url/.test(m) && /column|does not exist|could not find/i.test(m);
}

type FilaPortadas = { slug: string; image_url?: string | null; imagenes?: unknown };
let cache: Promise<Record<string, string[]>> | null = null;

async function cargarPortadas(): Promise<Record<string, string[]>> {
  const conImagenes = await supabase.from("categories").select("slug,image_url,imagenes").eq("is_active", true);
  const res = conImagenes.error && faltaColumnaPortadas(conImagenes.error)
    ? await supabase.from("categories").select("slug,image_url").eq("is_active", true)
    : conImagenes;
  if (res.error) throw res.error;
  const mapa: Record<string, string[]> = {};
  for (const fila of (res.data ?? []) as FilaPortadas[]) {
    const fotos = portadasDe(fila);
    if (fila.slug && fotos.length) mapa[fila.slug] = fotos;
  }
  return mapa;
}

export function olvidarPortadasCategorias() {
  cache = null;
}

export function usePortadasCategorias(): Record<string, string[]> {
  const [mapa, setMapa] = useState<Record<string, string[]>>({});
  useEffect(() => {
    let vivo = true;
    if (!cache) {
      cache = cargarPortadas().catch(() => {
        cache = null; // sin portadas esta vez; se reintenta en la próxima pantalla
        return {};
      });
    }
    cache.then((m) => {
      if (vivo) setMapa(m);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return mapa;
}

export default function PortadasCategoria({
  imagenes,
  alt,
  style,
  prioridad,
}: {
  imagenes: string[];
  /** Texto alternativo (nombre de la categoría). */
  alt: string;
  /** Tamaño y forma de la caja (ancho, alto o aspectRatio, bordes redondeados). */
  style?: StyleProp<ViewStyle>;
  /** "high" si es lo primero que se ve al entrar (cabecera del catálogo). */
  prioridad?: "high" | "normal" | "low";
}) {
  const fotos = imagenes.slice(0, MAX_PORTADAS);
  const total = fotos.length;
  const web = Platform.OS === "web" && typeof window !== "undefined";
  const cajaRef = useRef<View>(null);
  const [ancho, setAncho] = useState(0);
  const [actual, setActual] = useState(0);
  const [x] = useState(() => new Animated.Value(0));
  const [quieto, setQuieto] = useState(true); // hasta saber si el dispositivo pide «reducir movimiento»
  const [aLaVista, setALaVista] = useState(!web);
  const [oculta, setOculta] = useState(false);

  useEffect(() => {
    let vivo = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reducir) => {
        if (vivo) setQuieto(reducir);
      })
      .catch(() => {
        if (vivo) setQuieto(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (!web || total < 2) return;
    const nodo = cajaRef.current as unknown as HTMLElement | null;
    const visibilidad = () => setOculta(document.hidden);
    document.addEventListener("visibilitychange", visibilidad);
    visibilidad();
    let vigia: IntersectionObserver | null = null;
    if (nodo?.getBoundingClientRect && typeof IntersectionObserver !== "undefined") {
      vigia = new IntersectionObserver(([e]) => setALaVista(e.isIntersecting), { threshold: 0.35 });
      vigia.observe(nodo);
    } else {
      setALaVista(true);
    }
    return () => {
      document.removeEventListener("visibilitychange", visibilidad);
      vigia?.disconnect();
    };
  }, [web, total]);

  const paso = ancho + SEPARACION;
  const corre = total > 1 && ancho > 0 && !quieto && aLaVista && !oculta;
  useEffect(() => {
    if (!corre) return;
    const espera = setTimeout(() => {
      const siguiente = actual + 1;
      Animated.timing(x, {
        toValue: -siguiente * paso,
        duration: DESLIZ_MS,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }).start(({ finished }) => {
        if (!finished) return;
        // Tras la copia de la primera, se vuelve al principio sin que se note.
        if (siguiente >= total) {
          x.setValue(0);
          setActual(0);
        } else {
          setActual(siguiente);
        }
      });
    }, PASO_MS);
    return () => clearTimeout(espera);
  }, [corre, actual, total, paso, x]);

  if (!total) return null;
  const tira = total > 1 ? [...fotos, fotos[0]] : fotos;

  return (
    <View
      ref={cajaRef}
      style={[{ overflow: "hidden", backgroundColor: "#F4F9FD" }, style]}
      onLayout={(e) => {
        const nuevo = e.nativeEvent.layout.width;
        if (Math.abs(nuevo - ancho) < 0.5) return;
        // Si cambia el ancho (giro del móvil), se vuelve a la primera foto.
        x.setValue(0);
        setActual(0);
        setAncho(nuevo);
      }}
    >
      {ancho > 0 && (
        <Animated.View style={{ flexDirection: "row", height: "100%", width: tira.length * paso, transform: [{ translateX: x }] }}>
          {tira.map((uri, k) => (
            <SmartImage
              key={`${k}-${uri}`}
              uri={uri}
              ancho={ancho}
              contentFit="cover"
              alt={k >= total ? "" : total > 1 ? `${alt} · foto ${k + 1} de ${total}` : alt}
              priority={k === 0 ? prioridad : "low"}
              style={{ width: ancho, height: "100%", marginRight: SEPARACION }}
            />
          ))}
        </Animated.View>
      )}

      {total > 1 && (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ position: "absolute", left: 0, right: 0, bottom: 8, flexDirection: "row", justifyContent: "center", gap: 5 }}
        >
          {fotos.map((uri, k) => (
            <View
              key={`${k}-${uri}`}
              style={{
                width: k === actual ? 14 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: k === actual ? "#FFFFFF" : "rgba(255,255,255,0.62)",
                shadowColor: "#0B2138",
                shadowOpacity: 0.35,
                shadowRadius: 2,
                shadowOffset: { width: 0, height: 1 },
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}
