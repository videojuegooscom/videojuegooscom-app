// components/SmartImage.tsx
/**
 * Qué hace: sustituto de <Image> de "react-native" para TODAS las fotos
 * remotas de la app (catálogo, producto, servicios, reseñas, lightbox,
 * categorías/servicios del admin...). El objetivo es que cargar fotos nunca
 * se sienta como que la app se ha quedado "congelada": en vez de un hueco en
 * blanco que aparece de golpe cuando la foto por fin llega, se ve un fundido
 * suave — y la navegación y los toques siguen funcionando con normalidad
 * mientras tanto, porque la carga de imágenes siempre ha sido asíncrona (el
 * "congelado" que se notaba era el salto visual brusco, no un bloqueo real).
 *
 * Cómo funciona: es una envoltura fina sobre expo-image (ya era una
 * dependencia del proyecto — "expo-image" en package.json —, no se ha
 * instalado nada nuevo). Aporta, con los mismos valores en todos los sitios:
 * - cachePolicy="memory-disk": una foto que ya se vio una vez (por ejemplo
 *   en catálogo) no se vuelve a descargar al verla otra vez en la ficha de
 *   producto o en el carrito — aparece al instante.
 * - transition: fundido de entrada de 250ms en vez de aparición brusca.
 * - recyclingKey={uri}: si una tarjeta cambia de foto (p. ej. al recorrer
 *   una lista), no se ve un instante la foto anterior antes de la nueva.
 * - contentFit en vez de resizeMode (nombre que usa expo-image), con los
 *   mismos valores de siempre ("cover", "contain", etc.).
 * Si no hay URL (uri vacío/null/undefined), no pinta nada — igual que antes
 * hacían las pantallas que envolvían su <Image> en `{p.imageUrl ? ... : ...}`.
 *
 * Barra de carga global ("Pensando"): cada SmartImage avisa a
 * lib/loadingBus.ts (markStart/markEnd) mientras SU foto está cargando de
 * verdad, igual que lib/supabase.ts avisa por cada petición — así
 * components/lineapensadoraefectosiri.tsx se queda encendida hasta que TODAS
 * las fotos en pantalla han terminado de cargar, no solo mientras llegan
 * los datos. Dos redes de seguridad para que esto nunca se quede "pegado":
 * - si la "uri" cambia o el componente desaparece de pantalla mientras
 *   seguía cargando (el usuario navegó fuera antes de que terminase), se
 *   cierra esa cuenta en el cleanup del efecto.
 * - si por lo que sea nunca llega el aviso de "terminé" (fallo raro de red
 *   en una miniatura que nadie está mirando), un timeout de seguridad
 *   (LOAD_SAFETY_TIMEOUT_MS) cierra la cuenta igualmente pasados 20s.
 *
 * Conectado con: app/catalogo.tsx, app/producto/[id].tsx,
 * app/(tabs)/index.tsx, app/servicios.tsx, app/admin/categories.tsx,
 * app/admin/services.tsx, components/ImageLightbox.tsx,
 * components/Resenas.tsx — cualquier sitio que antes usaba <Image> de
 * "react-native" para pintar una foto remota (uri) ahora usa <SmartImage>.
 * lib/loadingBus.ts → a quien avisa mientras carga.
 */
import React, { useEffect, useRef } from "react";
import { Image, type ImageContentFit, type ImageStyle } from "expo-image";
import type { StyleProp } from "react-native";
import { markEnd, markStart } from "../lib/loadingBus";

// Si una foto concreta nunca llega a avisar de que terminó (fallo raro de
// red), se cierra su cuenta igualmente pasado este tiempo — para que la
// barra de carga global nunca se quede encendida para siempre por una sola
// foto perdida.
const LOAD_SAFETY_TIMEOUT_MS = 20000;

export type SmartImageProps = {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  /** Duración del fundido de entrada, en ms. */
  transitionMs?: number;
  accessibilityLabel?: string;
};

export default function SmartImage({
  uri,
  style,
  contentFit = "cover",
  transitionMs = 250,
  accessibilityLabel,
}: SmartImageProps) {
  const loadingRef = useRef(false);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function endTrackedLoad() {
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
    if (loadingRef.current) {
      loadingRef.current = false;
      markEnd();
    }
  }

  function handleLoadStart() {
    loadingRef.current = true;
    markStart();
    safetyTimerRef.current = setTimeout(endTrackedLoad, LOAD_SAFETY_TIMEOUT_MS);
  }

  function handleLoadEnd() {
    endTrackedLoad();
  }

  // Cierra la cuenta si la foto cambia o el componente se desmonta a medio
  // cargar (ver nota de "redes de seguridad" arriba). Se declara antes del
  // "return null" de abajo porque los hooks de React no pueden ser
  // condicionales.
  useEffect(() => {
    return () => {
      endTrackedLoad();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  if (!uri) return null;

  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      transition={transitionMs}
      recyclingKey={uri}
      accessibilityLabel={accessibilityLabel}
      onLoadStart={handleLoadStart}
      onLoadEnd={handleLoadEnd}
    />
  );
}
