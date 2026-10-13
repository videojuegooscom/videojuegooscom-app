/**
 * lib/loadingBus.ts
 *
 * Qué hace: cuenta cuántas cosas reales están en marcha AHORA MISMO en toda
 * la app — peticiones a Supabase Y fotos cargando — para encender el efecto
 * "Pensando" tipo Siri (marco de colores alrededor de la pantalla, ver
 * components/lineapensadoraefectosiri.tsx) y el brillo del icono de la
 * pestaña activa (app/(tabs)/_layout.tsx), sin tocar pantalla por pantalla.
 *
 * Cómo funciona: un contador simple + listas de "quién quiere enterarse"
 * (patrón pub/sub, sin librerías).
 * - lib/supabase.ts llama a markStart()/markEnd() alrededor de cada fetch
 *   real del cliente de Supabase (consultas, inserts, updates, rpc...).
 * - components/SmartImage.tsx llama a markStart()/markEnd() mientras SU
 *   foto está cargando de verdad.
 * - components/lineapensadoraefectosiri.tsx llama a pulseLoading() en cada
 *   cambio de ruta, para avisar siempre al cambiar de pestaña/sección.
 * - app/(tabs)/_layout.tsx llama a pulseLoading(ms, true) al recargar una
 *   pestaña con triple toque: "inmediato" se salta la espera de entrada
 *   (SHOW_DELAY_MS) porque es una acción que el usuario acaba de pedir.
 *
 * Dos hooks:
 * - useCargando() → el que deben usar los efectos visuales. Aplica los
 *   umbrales aquí, una sola vez para toda la app (así el marco y el icono
 *   se encienden y se apagan a la vez): solo pasa a true si la carga sigue
 *   pasados SHOW_DELAY_MS (no parpadea en cargas rapidísimas) y, una vez
 *   encendido, aguanta al menos MIN_VISIBLE_MS. Se apaga siempre en cuanto
 *   el contador vuelve a 0 (respetando ese mínimo).
 * - useGlobalLoading() → el valor en bruto (contador > 0), sin umbrales.
 *
 * Qué NO lo enciende (ver SILENT_URL_PARTS en lib/supabase.ts): llamadas
 * silenciosas de fondo (analítica, sumar una visita, sondeo de la
 * campanita...). Si contaran, el efecto parpadearía solo.
 *
 * Conectado con:
 * - lib/supabase.ts → markStart()/markEnd() en cada fetch real.
 * - components/SmartImage.tsx → markStart()/markEnd() por cada foto.
 * - components/lineapensadoraefectosiri.tsx → useCargando() para el marco y
 *   pulseLoading() en cada cambio de ruta.
 * - app/(tabs)/_layout.tsx → useCargando() para el brillo del icono activo y
 *   pulseLoading(ms, true) al recargar una pestaña (triple toque).
 */
import { useSyncExternalStore } from "react";

// Umbrales del estado visible (antes vivían dentro del componente del efecto).
const SHOW_DELAY_MS = 180;
const MIN_VISIBLE_MS = 500;

let activeCount = 0;
const listeners = new Set<() => void>();

// Estado "visible" ya filtrado por los umbrales (lo que lee useCargando()).
let visible = false;
let shownAt = 0;
let showTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
const visibleListeners = new Set<() => void>();

function setVisible(next: boolean) {
  if (visible === next) return;
  visible = next;
  visibleListeners.forEach((listener) => listener());
}

// Decide cuándo pasar visible <-> oculto según el contador y los umbrales.
function updateVisible() {
  if (activeCount > 0) {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (!visible && !showTimer) {
      showTimer = setTimeout(() => {
        showTimer = null;
        shownAt = Date.now();
        setVisible(true);
      }, SHOW_DELAY_MS);
    }
    return;
  }

  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  if (visible && !hideTimer) {
    const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt));
    hideTimer = setTimeout(() => {
      hideTimer = null;
      setVisible(false);
    }, remaining);
  }
}

function emit() {
  listeners.forEach((listener) => listener());
  updateVisible();
}

/** Llamar justo antes de lanzar una petición o carga real. */
export function markStart() {
  activeCount += 1;
  emit();
}

/** Llamar en cuanto esa petición o carga termina (con éxito o con error). */
export function markEnd() {
  activeCount = Math.max(0, activeCount - 1);
  emit();
}

/**
 * Enciende el efecto un instante fijo (durationMs) aunque no haya ninguna
 * petición ni foto real detrás — se usa en cada cambio de ruta para que el
 * usuario vea SIEMPRE una señal de "algo está pasando" al cambiar de
 * pestaña/sección, incluso cuando esa pantalla no necesita pedir nada nuevo.
 *
 * Con inmediato=true se enciende ya, sin la espera de SHOW_DELAY_MS (para
 * acciones que pide el usuario, como recargar una pestaña con triple toque);
 * el mínimo visible (MIN_VISIBLE_MS) se respeta igual.
 */
export function pulseLoading(durationMs = 450, inmediato = false) {
  markStart();
  if (inmediato) mostrarYa();
  setTimeout(markEnd, durationMs);
}

// Enciende el estado visible al momento (cancela la espera de entrada).
function mostrarYa() {
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (!visible) {
    shownAt = Date.now();
    setVisible(true);
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return activeCount > 0;
}

function subscribeVisible(listener: () => void) {
  visibleListeners.add(listener);
  return () => {
    visibleListeners.delete(listener);
  };
}

function getVisibleSnapshot(): boolean {
  return visible;
}

function getServerSnapshot(): boolean {
  return false;
}

/** true mientras haya algo en marcha (contador > 0), sin umbrales. */
export function useGlobalLoading(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * true mientras el efecto de carga deba verse (con umbral de entrada y
 * mínimo visible). Úsalo para cualquier indicador visual de "Pensando".
 */
export function useCargando(): boolean {
  return useSyncExternalStore(subscribeVisible, getVisibleSnapshot, getServerSnapshot);
}
