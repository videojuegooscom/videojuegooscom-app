// app/app/_layout.tsx
/**
 * Qué hace: layout raíz de toda la app (Expo Router). Muestra una pantalla
 * de carga de marca al arrancar y luego monta el Stack de navegación con
 * todas las rutas de nivel superior.
 *
 * Cómo funciona: usa expo-router Stack con headerShown:false (cada
 * pantalla dibuja su propia cabecera) y animación "fade" entre rutas.
 *
 * Pantalla de carga: es también la versión pre-generada de cada página (la tienda se
 * pinta solo ya montada en el dispositivo, con su ancho real; ver «montado» abajo).
 * Es la bienvenida (components/BrandLoadingScreen.tsx): la primera vez en cada visita se
 * queda al menos 3 s encima de la tienda, que carga debajo, y la tienda empieza en Inicio
 * (ver BIENVENIDA_* abajo).
 * Además espera a la fuente de Ionicons (la usa TODA la app),
 * vía useFonts() de expo-font, para que los iconos no salgan en blanco la
 * primera vez. Como mucho BOOT_FONT_TIMEOUT_MS (1,5 s): si la fuente tarda más
 * (conexión lenta), la tienda se muestra igualmente y los iconos aparecen al
 * llegar. Sin mínimo de tiempo: si la fuente ya está en caché, entra al
 * instante. MaterialIcons/MaterialCommunityIcons ya no se precargan aquí (solo
 * las usan pantallas secundarias, que las cargan solas al montarse).
 *
 * Actualización automática (solo web): al volver a una tienda que estaba en segundo plano, si ya hay
 * una versión nueva publicada, se recarga sola (reglas y límites en el comentario de ACTUALIZAR_*).
 *
 * Dispositivos (2026-11-12): con sesión, al abrir la tienda, al volver a ella (como mucho cada 15 min) y al iniciar
 * sesión, apunta el tipo de dispositivo y navegador y la hora (lib/supabase.ts → registrarDispositivo, tabla
 * cliente_dispositivos); lo ve Administración en la ficha del cliente, Usuarios y Analítica.
 *
 * Conectado con:
 * - components/BrandLoadingScreen.tsx → pantalla de carga inicial.
 * - components/Campanita.tsx → campanita flotante de notificaciones, se
 *   monta aquí UNA sola vez (fuera y por encima del Stack) para que
 *   aparezca en todas las pantallas y no se reinicie al navegar.
 * - components/PerfilPublico.tsx (PerfilObligatorio) → «Completa tu perfil»,
 *   montado igual que la campanita: con sesión y el perfil a medias tapa la
 *   tienda hasta guardarlo completo (no en Mi cuenta ni en las políticas).
 * - components/CookieConsentBanner.tsx → aviso de analítica/cookies, montado
 *   igual que la campanita (una sola vez, fuera del Stack); se oculta solo
 *   en /admin y desaparece en cuanto el visitante contesta.
 * - components/lineapensadoraefectosiri.tsx → barra de colores tipo "Siri"
 *   que se enciende sola, en toda la app, mientras haya algo cargando
 *   (peticiones a Supabase, fotos, o un simple cambio de pantalla — ver
 *   lib/loadingBus.ts). Montada igual que la campanita, fuera del Stack,
 *   para que aparezca en cualquier pantalla sin tocarlas una a una.
 * - components/SiteHead.tsx → aplica el título de pestaña, la descripción
 *   para Google y (si hay) el logo subido desde app/admin/marca-seo.tsx. No
 *   pinta nada en pantalla (return null), solo toca el <head> del documento
 *   en web.
 * - app/(tabs)/_layout.tsx → navegación por pestañas (inicio, catálogo,
 *   cesta, chat, blue-ia, perfil...).
 * - app/catalogo.tsx, app/servicios.tsx, app/checkout.tsx,
 *   app/producto/[id].tsx, app/servicio/[id].tsx, app/noticias/index.tsx,
 *   app/noticias/[id].tsx, app/chat/[chatId].tsx,
 *   app/modal.tsx, app/reset-password.tsx → rutas públicas fuera de las
 *   pestañas.
 * - app/admin/_layout.tsx → todas las rutas /admin.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, View, type ViewStyle } from "react-native";
import { Stack, router, usePathname } from "expo-router";
import Head from "expo-router/head";
import { useFonts } from "expo-font";
import { Ionicons } from "@expo/vector-icons";
import BotonAtrasAlcance from "../components/BotonAtrasAlcance";
import BrandLoadingScreen, { BIENVENIDA_MS, BIENVENIDA_RELLENO_ID } from "../components/BrandLoadingScreen";
import Campanita from "../components/Campanita";
import CookieConsentBanner from "../components/CookieConsentBanner";
import LineaPensadoraEfectoSiri from "../components/lineapensadoraefectosiri";
import { PerfilObligatorio } from "../components/PerfilPublico";
import SiteHead from "../components/SiteHead";
import TirarParaActualizar from "../components/TirarParaActualizar";
import { medirLlegadaDesdeRedes, trackEvent } from "../lib/analytics";
import { registrarDispositivo, supabase } from "../lib/supabase";

// Máximo que se espera a la fuente de iconos antes de mostrar la tienda igualmente.
const BOOT_FONT_TIMEOUT_MS = 1500;

// Actualización automática (solo web): una tienda abierta en segundo plano (sobre todo la instalada en la pantalla
// de inicio del móvil) sigue con el código viejo hasta que se recarga. Al volver a ella se compara el código que
// corre (el archivo «entry-<huella>.js», que cambia en cada publicación) con el de la portada publicada y, si hay
// uno nuevo, se recarga SOLA, pero solo si estuvo fuera al menos 30 s, no está en un formulario/chat/panel ni hay
// texto escrito en la pantalla. Como mucho una recarga cada 10 min, para no entrar nunca en un bucle.
const ENTRADA_RE = /_expo\/static\/js\/web\/entry-[A-Za-z0-9]+\.js/;
const ACTUALIZAR_FUERA_MS = 30_000;
const ACTUALIZAR_REVISAR_MS = 20 * 60_000;
const ACTUALIZAR_ENFRIAR_MS = 10 * 60_000;
const ACTUALIZAR_MIN_ENTRE_REVISIONES_MS = 60_000;
const ACTUALIZAR_RUTAS_OCUPADAS = /^\/(vender|contratar|checkout|chat|blue-ia|admin|reset-password)/;
const ACTUALIZAR_CLAVE = "videojuegoszaragoza:actualizada_en";

// Bienvenida (dueño, 2026-11-04): la primera vez en cada visita (cada pestaña del navegador, o cada vez que se abre la
// app instalada) la pantalla de bienvenida se queda al menos BIENVENIDA_MS, contados desde que se abrió la página,
// mientras la tienda carga debajo; luego se va con un fundido (un toque la quita antes, si la tienda ya está lista). Y la
// tienda empieza en Inicio si se abrió por otra sección de la barra de abajo sin un enlace concreto («?…»). Al recargar
// en la misma visita («Desliza para actualizar», la actualización automática) sale solo lo que tarde en cargar y se
// queda donde estaba. Los enlaces a fichas, noticias, políticas, correos o el panel se respetan siempre.
const BIENVENIDA_CLAVE = "videojuegoszaragoza:bienvenida_vista";
const BIENVENIDA_FUNDIDO_MS = 420;
const SECCIONES_A_INICIO = /^\/(perfil|cesta|chat-global|blue-ia)\/?$/;
// Fundido de salida en CSS (dueño, 2026-11-04: «que no haya tirones»): lo anima el navegador por su cuenta aunque la
// tienda se esté pintando debajo (antes era Animated de JavaScript, que en la web va con el hilo principal). Se
// desvanece y crece un poco, como si se abriera la puerta de la tienda.
const BIENVENIDA_TRANSICION = (Platform.OS === "web"
  ? {
      transitionProperty: "opacity, transform",
      transitionDuration: `${BIENVENIDA_FUNDIDO_MS}ms`,
      transitionTimingFunction: "cubic-bezier(.4,0,.2,1)",
      willChange: "opacity, transform",
    }
  : {}) as unknown as ViewStyle;

// Lo que le falta a la barra de la bienvenida para llenarse (ms). La barra es una animación CSS que empezó al pintarse
// la página (components/BrandLoadingScreen.tsx): la bienvenida se va justo cuando se llena. Sin ella (navegadores
// antiguos), lo que falte hasta BIENVENIDA_MS desde que se abrió la página.
function faltaParaLlenarse(): number {
  try {
    const relleno = document.getElementById(BIENVENIDA_RELLENO_ID) as (HTMLElement & { getAnimations?: () => Animation[] }) | null;
    const t = relleno?.getAnimations?.()[0]?.currentTime;
    if (typeof t === "number" && t >= 0) return Math.max(0, BIENVENIDA_MS - t);
  } catch {
    // sin animaciones: el reloj de la página
  }
  return Math.max(0, BIENVENIDA_MS - performance.now());
}

function hayTextoEscrito(): boolean {
  const campos = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
  for (const campo of Array.from(campos)) {
    const tipo = (campo as HTMLInputElement).type;
    if (["hidden", "checkbox", "radio", "button", "submit", "range", "file"].includes(tipo)) continue;
    if (campo.value.trim()) return true;
  }
  return false;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(Ionicons.font);
  const [fontTimedOut, setFontTimedOut] = useState(false);
  const pathname = usePathname();
  const rutaActual = useRef(pathname);
  rutaActual.current = pathname;
  // La web se genera de antemano SIN saber el tamaño de la pantalla (ancho 1024 por
  // defecto). Si la tienda se pintara ya en esa versión, al arrancar en el móvil React no
  // corrige los estilos que no coinciden y se quedan medidas de ordenador (buscador de
  // 758 px en un móvil de 390, categorías una por fila…). Por eso la versión pre-generada
  // y el primer pintado son la pantalla de carga, y la tienda se pinta solo cuando ya está
  // montada en el dispositivo, con su ancho real.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  // ¿Llega de Instagram o TikTok? Se mira una vez al abrir la tienda (lib/analytics.ts).
  useEffect(() => {
    if (Platform.OS === "web") medirLlegadaDesdeRedes();
  }, []);

  // Dispositivos y última conexión (lib/supabase.ts → registrarDispositivo): con sesión, al abrir la tienda y al volver a
  // ella (como mucho cada 15 min); al iniciar sesión de verdad (sesión nueva en este dispositivo), además, suma un inicio.
  useEffect(() => {
    let actual: { uid: string; token: string } | null = null;
    const { data } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      actual = sesion?.user?.id ? { uid: sesion.user.id, token: sesion.access_token } : null;
      const ahora = actual;
      // Fuera del aviso de Supabase (no se puede consultar la base de datos dentro de él).
      if (ahora) setTimeout(() => void registrarDispositivo(ahora.uid, ahora.token), 0);
    });
    const alVolver = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (actual) void registrarDispositivo(actual.uid, actual.token);
    };
    let sub: { remove: () => void } | null = null;
    if (Platform.OS === "web" && typeof document !== "undefined") document.addEventListener("visibilitychange", alVolver);
    else sub = AppState.addEventListener("change", (s) => s === "active" && alVolver());
    return () => {
      data.subscription.unsubscribe();
      if (Platform.OS === "web" && typeof document !== "undefined") document.removeEventListener("visibilitychange", alVolver);
      sub?.remove();
    };
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) return;
    const timer = setTimeout(() => setFontTimedOut(true), BOOT_FONT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const actual = Array.from(document.scripts)
      .map((s) => s.src.match(ENTRADA_RE)?.[0])
      .find(Boolean);
    if (!actual) return; // desarrollo local: no hay código con huella que comparar

    let hayNueva = false;
    let ocultoDesde = 0;
    let ultimaRevision = 0;

    const revisar = async () => {
      if (hayNueva || Date.now() - ultimaRevision < ACTUALIZAR_MIN_ENTRE_REVISIONES_MS) return;
      ultimaRevision = Date.now();
      try {
        const res = await fetch("/", { cache: "no-store", headers: { accept: "text/html" } });
        if (!res.ok) return;
        const publicada = (await res.text()).match(ENTRADA_RE)?.[0];
        if (publicada && publicada !== actual) hayNueva = true;
      } catch {
        // sin conexión: se vuelve a mirar la próxima vez
      }
    };

    const recargarSiProcede = async (fueraMs: number) => {
      if (!hayNueva || fueraMs < ACTUALIZAR_FUERA_MS) return;
      if (ACTUALIZAR_RUTAS_OCUPADAS.test(rutaActual.current) || hayTextoEscrito()) return;
      try {
        const ultima = Number(window.sessionStorage.getItem(ACTUALIZAR_CLAVE) ?? 0);
        if (Date.now() - ultima < ACTUALIZAR_ENFRIAR_MS) return;
        window.sessionStorage.setItem(ACTUALIZAR_CLAVE, String(Date.now()));
      } catch {
        // sin almacenamiento no se puede garantizar el límite: mejor no recargar nunca
        return;
      }
      // El aviso al panel de estadísticas no debe retrasar la recarga más de un instante.
      await Promise.race([
        trackEvent("app_actualizada", "App actualizada sola", { path: rutaActual.current }),
        new Promise((listo) => setTimeout(listo, 800)),
      ]);
      window.location.reload();
    };

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === "hidden") {
        ocultoDesde = Date.now();
        return;
      }
      const fuera = ocultoDesde ? Date.now() - ocultoDesde : 0;
      ocultoDesde = 0;
      revisar().then(() => recargarSiProcede(fuera));
    };
    // Al volver desde la caché de «atrás/adelante» del navegador la página lleva tiempo congelada.
    const alMostrar = (e: PageTransitionEvent) => {
      if (e.persisted) revisar().then(() => recargarSiProcede(Infinity));
    };
    // Con la pantalla a la vista solo se mira (no se recarga): se aplicará la próxima vez que vuelva de fuera.
    const intervalo = setInterval(() => {
      if (document.visibilityState === "visible") revisar();
    }, ACTUALIZAR_REVISAR_MS);

    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    window.addEventListener("pageshow", alMostrar);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      window.removeEventListener("pageshow", alMostrar);
    };
  }, []);

  // Nunca se bloquea: si la fuente falla o tarda más de 1,5 s, se entra igual.
  const bootLoading = !montado || (!fontsLoaded && !fontError && !fontTimedOut);

  // Bienvenida: «visible» (encima de la tienda), «saliendo» (fundido) o «fuera».
  const [bienvenida, setBienvenida] = useState<"visible" | "saliendo" | "fuera">("visible");
  const bienvenidaInfo = useRef({ listaMs: 0, desde: "/", aInicio: false, medida: false });

  const quitarBienvenida = useCallback(
    (porToque: boolean) => {
      const info = bienvenidaInfo.current;
      if (!info.medida) {
        info.medida = true;
        // Analítica propia (Administración → Analítica, «Pantalla de bienvenida»): sin ningún dato de la persona.
        const tramo = info.listaMs < 1000 ? "en menos de 1 s" : info.listaMs <= BIENVENIDA_MS ? "entre 1 y 3 s" : "en más de 3 s";
        const metadata = { lista_ms: info.listaMs, saltada: porToque, desde: info.desde };
        void trackEvent("bienvenida", "Bienvenida: vista", { path: info.desde, metadata });
        void trackEvent("bienvenida_lista", `Bienvenida: tienda lista ${tramo}`, { path: info.desde, metadata });
        if (porToque) void trackEvent("bienvenida_saltada", "Bienvenida: saltada con un toque", { path: info.desde, metadata });
        if (info.aInicio) void trackEvent("bienvenida_inicio", "Bienvenida: empieza en Inicio", { path: info.desde, metadata });
      }
      setBienvenida((b) => (b === "visible" ? "saliendo" : b));
      // El fundido lo hace el CSS (BIENVENIDA_TRANSICION); al terminar se quita la capa.
      setTimeout(() => setBienvenida("fuera"), BIENVENIDA_FUNDIDO_MS + 60);
    },
    []
  );

  useEffect(() => {
    if (bootLoading || bienvenida !== "visible") return;
    // La tienda ya está montada y lista debajo. ¿Es la primera vez en esta visita?
    if (Platform.OS !== "web" || typeof window === "undefined") {
      setBienvenida("fuera");
      return;
    }
    let primera = true;
    try {
      primera = window.sessionStorage.getItem(BIENVENIDA_CLAVE) !== "1";
      window.sessionStorage.setItem(BIENVENIDA_CLAVE, "1");
    } catch {
      // sin almacenamiento: se trata como primera vez
    }
    const navegacion = performance.getEntriesByType?.("navigation")?.[0] as PerformanceNavigationTiming | undefined;
    if (navegacion?.type === "reload") primera = false;
    if (!primera) {
      setBienvenida("fuera");
      return;
    }
    const info = bienvenidaInfo.current;
    info.listaMs = Math.round(performance.now());
    info.desde = window.location.pathname;
    // Empieza en Inicio si se abrió por otra sección de la barra de abajo sin un enlace concreto.
    if (SECCIONES_A_INICIO.test(window.location.pathname) && !window.location.search) {
      info.aInicio = true;
      setTimeout(() => {
        try {
          router.replace("/");
        } catch {
          // si la navegación aún no está lista, se queda donde estaba
        }
      }, 0);
    }
    // Se va cuando la barra se llena (y entonces se funde).
    const timer = setTimeout(() => quitarBienvenida(false), faltaParaLlenarse());
    return () => clearTimeout(timer);
  }, [bootLoading, bienvenida, quitarBienvenida]);

  // La bienvenida va encima de todo (también de Blue y del aviso de cookies) y bloquea los toques mientras se ve.
  const capaBienvenida =
    bienvenida !== "fuera" ? (
      <View
        key="bienvenida"
        pointerEvents={bienvenida === "visible" ? "auto" : "none"}
        style={[
          {
            position: (Platform.OS === "web" ? "fixed" : "absolute") as "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 2147483000,
            opacity: bienvenida === "saliendo" ? 0 : 1,
            transform: [{ scale: bienvenida === "saliendo" ? 1.03 : 1 }],
          },
          BIENVENIDA_TRANSICION,
        ]}
      >
        <BrandLoadingScreen onEntrar={!bootLoading && bienvenida === "visible" ? () => quitarBienvenida(true) : undefined} />
      </View>
    ) : null;

  if (bootLoading) {
    // Esta es la versión que se genera de antemano (HTML estático): lleva ya el título de la
    // tienda para que el <title> no salga vacío para Google y los lectores de enlaces. Cuando
    // la tienda arranca, SiteHead pone el título de «Marca y SEO» y el de cada página.
    // (La misma estructura que la de abajo: la bienvenida no se vuelve a montar al entrar.)
    return (
      <View style={{ flex: 1 }}>
        <Head>
          <title>Videojuegoszaragoza.com</title>
        </Head>
        {capaBienvenida}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
        }}
      >
        {/* Navegación principal inferior */}
        <Stack.Screen name="(tabs)" />

        {/* Rutas públicas / complementarias fuera de tabs */}
        <Stack.Screen name="catalogo" />
        <Stack.Screen name="servicios" />
        <Stack.Screen name="checkout" />
        <Stack.Screen name="vender" />
        <Stack.Screen name="quienes-somos" />
        <Stack.Screen name="reset-password" />

        {/* Políticas (envíos, devoluciones, privacidad, términos) y Blog */}
        <Stack.Screen name="politicas/[slug]" />
        <Stack.Screen name="blog/index" />

        {/* Noticias con página propia (índice y cada noticia, para Google) */}
        <Stack.Screen name="noticias/index" />
        <Stack.Screen name="noticias/[id]" />

        {/* Producto dinámico */}
        <Stack.Screen name="producto/[id]" />

        {/* Servicio dinámico y su página «Contratar servicio» */}
        <Stack.Screen name="servicio/[id]" />
        <Stack.Screen name="contratar/[id]" />

        {/* Chat privado por producto (cliente) */}
        <Stack.Screen name="chat/[chatId]" />

        {/* Admin */}
        <Stack.Screen name="admin" />

        {/* Modal global */}
        <Stack.Screen
          name="modal"
          options={{
            presentation: "modal",
          }}
        />
      </Stack>

      {/* Blue, asistente flotante (antes campanita): por encima de TODO, en todas las pantallas. */}
      <Campanita />

      {/* «Volver» a mano del pulgar derecho en las páginas de lectura. */}
      <BotonAtrasAlcance />

      {/* «Desliza para actualizar» con la mascota, en toda la tienda (cada pantalla dice qué recarga). */}
      <TirarParaActualizar />

      {/* Aviso de cookies/analítica: por encima de todo salvo /admin. */}
      <CookieConsentBanner />

      {/* «Completa tu perfil»: con sesión y el perfil sin completar, tapa la tienda hasta que se guarde (no en Mi cuenta). */}
      <PerfilObligatorio />

      {/* Barra "Pensando": se enciende sola mientras algo carga. */}
      <LineaPensadoraEfectoSiri />

      {/* Título/descripción/logo para Google y el navegador. No pinta nada. */}
      <SiteHead />

      {/* Bienvenida: encima de todo mientras la tienda termina de cargar debajo. */}
      {capaBienvenida}
    </View>
  );
}