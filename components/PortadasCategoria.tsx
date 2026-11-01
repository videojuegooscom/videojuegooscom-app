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
 * - usePortadasCategorias() / useOpacidadesPortadas(): portadas de todas las categorías activas y cuánto se ve cada
 *   una en Inicio, por slug. Una sola consulta por visita, compartida entre pantallas; olvidarPortadasCategorias() la
 *   repite y avisa a las pantallas abiertas (el panel la llama al guardar: Inicio se queda montado al cambiar de
 *   pestaña y antes no se enteraba de una portada nueva). También se repite al volver a la tienda (visibilitychange)
 *   si han pasado más de 15 s: una portada cambiada desde otro aparato se ve sin cerrar la tienda.
 * - PortadaConNombre: la portada llenando el recuadro de la categoría en Inicio, con el nombre encima y la foto al
 *   porcentaje que elige el dueño en el editor (portada_opacidad, 10-100 %; sin valor, 55 %).
 * - faltaColumnaPortadas(error): si Supabase dice que aún no existe la columna (la migración se aplica aparte).
 *
 * Conectado con: app/(tabs)/index.tsx (tarjetas de «Categorías»), app/catalogo.tsx (cabecera de la categoría),
 * app/admin/categories.tsx (lista, formulario y vista previa), supabase/migrations/20261030120000_categorias_portadas.sql
 * y 20261101140000_categorias_opacidad_portada.sql.
 */
import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, Text, View, type StyleProp, type ViewStyle } from "react-native";
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

// Cuánto se ve la portada en el recuadro de Inicio (10-100 %; columna portada_opacidad, migración 20261101140000):
// el nombre de la categoría va encima. Sin valor, o sin la migración, al 55 %.
export const OPACIDAD_PORTADA_DEFECTO = 55;
export const OPACIDAD_PORTADA_MIN = 10;
export function opacidadDe(fila: { portada_opacidad?: unknown } | null | undefined): number {
  const n = Number(fila?.portada_opacidad);
  if (fila?.portada_opacidad == null || !Number.isFinite(n)) return OPACIDAD_PORTADA_DEFECTO;
  return Math.min(100, Math.max(OPACIDAD_PORTADA_MIN, Math.round(n)));
}

type FilaPortadas = { slug: string; image_url?: string | null; imagenes?: unknown; portada_opacidad?: unknown };
type DatosPortadas = { fotos: Record<string, string[]>; opacidad: Record<string, number> };
const SIN_DATOS: DatosPortadas = { fotos: {}, opacidad: {} };
let cache: Promise<DatosPortadas> | null = null;
// Pantallas que enseñan portadas (Inicio se queda montado al cambiar de pestaña): al guardar una categoría en el panel
// se avisa a todas para que vuelvan a pedirlas. Antes Inicio seguía con las de cuando se abrió.
const oyentes = new Set<() => void>();
// Al volver a la tienda (otra app, el móvil bloqueado, la tienda instalada que sigue abierta…) se vuelven a pedir si
// hace más de VOLVER_A_PEDIR_MS: así una portada cambiada desde otro aparato (el panel en el ordenador) se ve sin
// cerrar la tienda. Antes, en el móvil, Inicio seguía con las portadas de cuando se abrió.
const VOLVER_A_PEDIR_MS = 15000;
let cargadoEn = 0;
let vigilandoVuelta = false;
function vigilarVuelta() {
  if (vigilandoVuelta || Platform.OS !== "web" || typeof document === "undefined") return;
  vigilandoVuelta = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && cargadoEn && Date.now() - cargadoEn > VOLVER_A_PEDIR_MS) olvidarPortadasCategorias();
  });
}

async function cargarPortadas(): Promise<DatosPortadas> {
  cargadoEn = Date.now();
  // «*»: así una columna que aún no existe (migración pendiente) no da un error 400; si no viene, se usa lo de siempre.
  const res = await supabase.from("categories").select("*").eq("is_active", true);
  if (res.error) throw res.error;
  const datos: DatosPortadas = { fotos: {}, opacidad: {} };
  for (const fila of (res.data ?? []) as FilaPortadas[]) {
    const fotos = portadasDe(fila);
    if (!fila.slug || !fotos.length) continue;
    datos.fotos[fila.slug] = fotos;
    datos.opacidad[fila.slug] = opacidadDe(fila);
  }
  return datos;
}

export function olvidarPortadasCategorias() {
  cache = null;
  oyentes.forEach((avisar) => avisar());
}

function useDatosPortadas(): DatosPortadas {
  const [datos, setDatos] = useState<DatosPortadas>(SIN_DATOS);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    vigilarVuelta();
    const avisar = () => setVersion((v) => v + 1);
    oyentes.add(avisar);
    return () => {
      oyentes.delete(avisar);
    };
  }, []);
  useEffect(() => {
    let vivo = true;
    if (!cache) {
      cache = cargarPortadas().catch(() => {
        cache = null; // sin portadas esta vez; se reintenta en la próxima pantalla
        return SIN_DATOS;
      });
    }
    cache.then((d) => {
      if (vivo) setDatos(d);
    });
    return () => {
      vivo = false;
    };
  }, [version]);
  return datos;
}

/** Portadas de todas las categorías activas, por slug. */
export function usePortadasCategorias(): Record<string, string[]> {
  return useDatosPortadas().fotos;
}

/** Cuánto se ve la portada de cada categoría activa en Inicio (10-100), por slug. */
export function useOpacidadesPortadas(): Record<string, number> {
  return useDatosPortadas().opacidad;
}

/**
 * La portada llenando el recuadro de una categoría, con el nombre (y su enlace) encima: lo que se ve en Inicio y en la
 * vista previa del editor. `opacidad` (10-100) es cuánto se ve la foto: menos, más suave y el nombre se lee mejor.
 */
export function PortadaConNombre({
  imagenes,
  opacidad,
  titulo,
  subtitulo,
  alto,
  radio = 17,
}: {
  imagenes: string[];
  opacidad: number;
  titulo: string;
  subtitulo?: string;
  alto: number;
  radio?: number;
}) {
  // Un halo blanco alrededor de las letras: se leen sobre cualquier foto sin poner un recuadro encima.
  const halo = { textShadowColor: "rgba(255,255,255,0.95)", textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 } };
  return (
    <View style={{ width: "100%", height: alto, borderRadius: radio, overflow: "hidden", backgroundColor: "#F6FAFD" }}>
      <View
        nativeID="portada-foto"
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: Math.min(100, Math.max(OPACIDAD_PORTADA_MIN, opacidad)) / 100 }}
      >
        <PortadasCategoria imagenes={imagenes} alt={titulo} style={{ width: "100%", height: "100%" }} />
      </View>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 10, gap: 4 }}>
        <Text numberOfLines={2} style={[{ color: "#0B2138", fontWeight: "900", fontSize: 16, lineHeight: 21, textAlign: "center" }, halo]}>
          {titulo}
        </Text>
        {subtitulo ? (
          <Text numberOfLines={1} style={[{ color: "#0B2138", fontWeight: "800", fontSize: 12.5, textAlign: "center" }, halo]}>
            {subtitulo}
          </Text>
        ) : null}
      </View>
    </View>
  );
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
