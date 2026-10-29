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
 * Conectado con:
 * - components/BrandLoadingScreen.tsx → pantalla de carga inicial.
 * - components/Campanita.tsx → campanita flotante de notificaciones, se
 *   monta aquí UNA sola vez (fuera y por encima del Stack) para que
 *   aparezca en todas las pantallas y no se reinicie al navegar.
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
 *   app/producto/[id].tsx, app/servicio/[id].tsx, app/chat/[chatId].tsx,
 *   app/modal.tsx, app/reset-password.tsx → rutas públicas fuera de las
 *   pestañas.
 * - app/admin/_layout.tsx → todas las rutas /admin.
 */
import React, { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { Stack, usePathname } from "expo-router";
import Head from "expo-router/head";
import { useFonts } from "expo-font";
import { Ionicons } from "@expo/vector-icons";
import BotonAtrasAlcance from "../components/BotonAtrasAlcance";
import BrandLoadingScreen from "../components/BrandLoadingScreen";
import Campanita from "../components/Campanita";
import CookieConsentBanner from "../components/CookieConsentBanner";
import LineaPensadoraEfectoSiri from "../components/lineapensadoraefectosiri";
import SiteHead from "../components/SiteHead";
import TirarParaActualizar from "../components/TirarParaActualizar";
import { trackEvent } from "../lib/analytics";

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
const ACTUALIZAR_RUTAS_OCUPADAS = /^\/(vender|checkout|chat|blue-ia|admin|reset-password)/;
const ACTUALIZAR_CLAVE = "videojuegoszaragoza:actualizada_en";

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

  if (bootLoading) {
    // Esta es la versión que se genera de antemano (HTML estático): lleva ya el título de la
    // tienda para que el <title> no salga vacío para Google y los lectores de enlaces. Cuando
    // la tienda arranca, SiteHead pone el título de «Marca y SEO» y el de cada página.
    return (
      <>
        <Head>
          <title>Videojuegoszaragoza.com</title>
        </Head>
        <BrandLoadingScreen message="Cargando tienda..." />
      </>
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
        <Stack.Screen name="reset-password" />

        {/* Políticas (envíos, devoluciones, privacidad, términos) y Blog */}
        <Stack.Screen name="politicas/[slug]" />
        <Stack.Screen name="blog/index" />

        {/* Producto dinámico */}
        <Stack.Screen name="producto/[id]" />

        {/* Servicio dinámico */}
        <Stack.Screen name="servicio/[id]" />

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

      {/* Barra "Pensando": se enciende sola mientras algo carga. */}
      <LineaPensadoraEfectoSiri />

      {/* Título/descripción/logo para Google y el navegador. No pinta nada. */}
      <SiteHead />
    </View>
  );
}