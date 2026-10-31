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
 * - transition: fundido de entrada corto (150ms) en vez de aparición brusca.
 * - priority: "normal" por defecto; "high" opcional para la foto principal.
 *   Las fotos se descargan siempre en segundo plano (nunca bloquean pantalla
 *   ni toques), así que las que quedan fuera de pantalla no frenan nada.
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
import React, { useEffect, useRef, useState } from "react";
import { Image, type ImageContentFit, type ImageProps, type ImageStyle } from "expo-image";
import { Platform, type StyleProp } from "react-native";
import { markEnd, markStart } from "../lib/loadingBus";

type ImagePriority = NonNullable<ImageProps["priority"]>;

// Fotos de la tienda: las subidas originales pesan varios MB. Con `ancho` (el ancho en pantalla,
// en px) la web pide a Vercel una versión del tamaño justo (320, 480, 640, 960 o 1280 px, calidad
// 75, WebP/AVIF), que se guarda 30 días en su caché (vercel.json → images). Si el optimizador no
// responde (en local, por ejemplo) se vuelve a la foto original. Solo fotos de nuestro
// almacenamiento público de productos y noticias.
const TAMANOS_OPTIMIZADOR = [320, 480, 640, 960, 1280];
const FOTO_TIENDA_RE = /^https:\/\/rgvyvaineyodyxzwootl\.supabase\.co\/storage\/v1\/object\/public\/(product-media|noticias)\//;

function urlOptimizada(uri: string, ancho: number | undefined): string {
  if (!ancho || Platform.OS !== "web" || typeof window === "undefined") return uri;
  if (!FOTO_TIENDA_RE.test(uri) || !/^https:$/.test(window.location.protocol)) return uri;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pedido = Math.ceil(ancho * dpr);
  const w = TAMANOS_OPTIMIZADOR.find((t) => t >= pedido) ?? TAMANOS_OPTIMIZADOR[TAMANOS_OPTIMIZADOR.length - 1];
  return `/_vercel/image?url=${encodeURIComponent(uri)}&w=${w}&q=75`;
}

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
  /** Texto alternativo de la foto (para lectores de pantalla y buscadores). */
  alt?: string;
  /** Ancho en pantalla en px: pide una versión del tamaño justo en vez de la foto original. */
  ancho?: number;
  /** Prioridad de descarga (opcional): "high" para la foto principal visible al entrar. */
  priority?: ImagePriority;
  /** Al cargar, el tamaño real de la foto en px (el visor lo usa para saber hasta dónde se puede mover). */
  onTamano?: (ancho: number, alto: number) => void;
};

export default function SmartImage({
  uri,
  style,
  contentFit = "cover",
  transitionMs = 150,
  accessibilityLabel,
  alt,
  ancho,
  priority = "normal",
  onTamano,
}: SmartImageProps) {
  // Si la versión optimizada falla, se vuelve a la foto original.
  const [usarOriginal, setUsarOriginal] = useState(false);
  useEffect(() => setUsarOriginal(false), [uri]);
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
  }, [uri]);

  if (!uri) return null;

  const origen = usarOriginal ? uri : urlOptimizada(uri, ancho);

  return (
    <Image
      source={{ uri: origen }}
      style={style}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      transition={transitionMs}
      priority={priority}
      recyclingKey={uri}
      alt={alt ?? accessibilityLabel ?? ""}
      accessibilityLabel={accessibilityLabel ?? alt}
      onLoadStart={handleLoadStart}
      onLoad={onTamano ? (e) => onTamano(e.source.width, e.source.height) : undefined}
      onLoadEnd={handleLoadEnd}
      onError={() => {
        if (origen !== uri) setUsarOriginal(true);
      }}
    />
  );
}
