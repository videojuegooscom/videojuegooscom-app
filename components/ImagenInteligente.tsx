/**
 * Archivo: components/ImagenInteligente.tsx
 * Función: componente de imagen remota de toda la tienda.
 * Para qué sirve: sustituye a Image con caché en memoria y disco, fundido de entrada, carga perezosa y prioridad en web (img del navegador) y expo-image en nativo; avisa a lib/estadoCarga.ts de las cargas para el efecto «Pensando».
 * Conectado con: lib/estadoCarga.ts.
 * Utilizado por: casi todas las pantallas con fotos (catálogo, producto, servicio, cesta, noticias, Inicio, Foro, admin/categories, admin/services, admin/users…) y los componentes VisorFotos, ConversacionProducto, PerfilPublico, ContratarServicioModal, BarraBusqueda, CarruselProductosCategoria, Resenas y PortadasCategoria.
 * Dependencias: react, react-native, expo-image.
 * Estado: ACTIVO
 *
 * Notas: cabecera original conservada justo debajo.
 */
/**
 * Notas:
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
 * En la web (carga rápida, mejora 7 del 2026-11-14) se pinta un <img> del navegador con lo mismo (fundido, encuadre,
 * tamaño justo del optimizador) y además loading="lazy", decoding="async" y fetchpriority: la foto con priority="high"
 * (la primera visible de cada pantalla) se pide ya y con prioridad; las demás, solo al acercarse a la pantalla (ver
 * FotoWeb y MARGEN_CERCA). En el móvil y la tableta nativos sigue siendo expo-image.
 * onFallo (opcional): avisa si la foto no se ha podido cargar ni en su versión original (Usuarios y la ficha del cliente
 * vuelven entonces a las iniciales).
 * Si no hay URL (uri vacío/null/undefined), no pinta nada — igual que antes
 * hacían las pantallas que envolvían su <Image> en `{p.imageUrl ? ... : ...}`.
 *
 * Barra de carga global ("Pensando"): cada ImagenInteligente avisa a
 * lib/estadoCarga.ts (marcarInicioCarga/marcarFinCarga) mientras SU foto está cargando de
 * verdad, igual que lib/supabase.ts avisa por cada petición — así
 * components/EfectoPensando.tsx se queda encendida hasta que TODAS
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
 * app/admin/services.tsx, components/VisorFotos.tsx,
 * components/Resenas.tsx — cualquier sitio que antes usaba <Image> de
 * "react-native" para pintar una foto remota (uri) ahora usa <ImagenInteligente>.
 * lib/estadoCarga.ts → a quien avisa mientras carga.
 */
import React, { useEffect, useRef, useState } from "react";
import { Image, type ImageContentFit, type ImageProps, type ImageStyle } from "expo-image";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";
import { marcarFinCarga, marcarInicioCarga } from "../lib/estadoCarga";

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

export type PropsImagenInteligente = {
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
  /** La foto no se ha podido cargar (ni la original): quien la pinta puede enseñar otra cosa (p. ej. las iniciales). */
  onFallo?: () => void;
};

// En la web (carga rápida, mejora 7 del 2026-11-14) la foto es un <img> del navegador, para poder decirle lo que expo-image
// no deja: loading="lazy" (las de más abajo no se bajan hasta acercarse a la pantalla), decoding="async" y fetchpriority
// (alta para la primera foto visible: priority="high", que además no espera). El hueco es la caja de la foto (`style`, con
// su alto o su proporción), que ya existe antes de que llegue: nada salta. Mismo fundido, mismo encuadre (contentFit →
// object-fit), mismo aviso de tamaño (onTamano) y la barra de carga solo cuenta las fotos que se bajan a la vista.
//
// Cerca de la pantalla: loading="lazy" del navegador se adelanta mucho (Chrome baja todo lo que quede a 1.250-2.500 px,
// que en el móvil es la página entera del catálogo). Donde el navegador sabe vigilar también dentro de las listas que se
// desplazan (IntersectionObserver con scrollMargin), la foto se pide solo a MARGEN_CERCA de verse: ~una pantalla más
// abajo y media a los lados. Donde no lo sabe, se queda en loading="lazy" (como siempre).
const MARGEN_CERCA = "700px 400px";
function puedeEsperarCerca(): boolean {
  return typeof window !== "undefined" && typeof IntersectionObserver !== "undefined" && "scrollMargin" in IntersectionObserver.prototype;
}

function FotoWeb({
  src,
  style,
  contentFit,
  transitionMs,
  alt,
  priority,
  onTamano,
  onInicio,
  onFin,
  onFallo,
}: {
  src: string;
  style?: StyleProp<ImageStyle>;
  contentFit: ImageContentFit;
  transitionMs: number;
  alt: string;
  priority: ImagePriority;
  onTamano?: (ancho: number, alto: number) => void;
  onInicio: () => void;
  onFin: () => void;
  onFallo: () => void;
}) {
  const ref = useRef<HTMLImageElement | null>(null);
  const [lista, setLista] = useState(false);
  const alta = priority === "high";
  // ¿Ya está cerca de la pantalla? Hasta entonces el <img> no lleva src (nada se descarga). Ver MARGEN_CERCA.
  const [cerca, setCerca] = useState(alta || !puedeEsperarCerca());
  const avisos = useRef({ onTamano, onInicio, onFin });
  useEffect(() => {
    avisos.current = { onTamano, onInicio, onFin };
  });

  useEffect(() => {
    if (cerca) return;
    const img = ref.current;
    if (!img) return;
    const io = new IntersectionObserver(
      (entradas) => {
        if (!entradas.some((e) => e.isIntersecting)) return;
        io.disconnect();
        setCerca(true);
      },
      { rootMargin: MARGEN_CERCA, scrollMargin: MARGEN_CERCA } as IntersectionObserverInit
    );
    io.observe(img);
    return () => io.disconnect();
  }, [cerca]);

  useEffect(() => {
    setLista(false);
    const img = ref.current;
    if (!img || !cerca) return;
    if (img.complete && img.naturalWidth > 0) {
      // Ya estaba en la caché del navegador.
      setLista(true);
      avisos.current.onTamano?.(img.naturalWidth, img.naturalHeight);
      return;
    }
    const b = img.getBoundingClientRect();
    if (alta || (b.bottom > 0 && b.top < window.innerHeight)) avisos.current.onInicio();
  }, [src, alta, cerca]);

  return (
    <View style={[{ overflow: "hidden" }, style as StyleProp<ViewStyle>]}>
      <img
        ref={ref}
        src={cerca ? src : undefined}
        data-src={cerca ? undefined : src}
        alt={alt}
        loading={alta ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={alta ? "high" : priority === "low" ? "low" : "auto"}
        onLoad={(e) => {
          setLista(true);
          avisos.current.onTamano?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight);
          avisos.current.onFin();
        }}
        onError={() => {
          avisos.current.onFin();
          onFallo();
        }}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: contentFit,
          opacity: lista ? 1 : 0,
          transition: `opacity ${transitionMs}ms ease-out`,
        }}
      />
    </View>
  );
}

export default function ImagenInteligente({
  uri,
  style,
  contentFit = "cover",
  transitionMs = 150,
  accessibilityLabel,
  alt,
  ancho,
  priority = "normal",
  onTamano,
  onFallo,
}: PropsImagenInteligente) {
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
      marcarFinCarga();
    }
  }

  function handleLoadStart() {
    loadingRef.current = true;
    marcarInicioCarga();
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

  if (Platform.OS === "web") {
    return (
      <FotoWeb
        key={uri}
        src={origen}
        style={style}
        contentFit={contentFit}
        transitionMs={transitionMs}
        alt={alt ?? accessibilityLabel ?? ""}
        priority={priority}
        onTamano={onTamano}
        onInicio={handleLoadStart}
        onFin={handleLoadEnd}
        onFallo={() => {
          if (origen !== uri) setUsarOriginal(true);
          else onFallo?.();
        }}
      />
    );
  }

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
        else onFallo?.();
      }}
    />
  );
}
