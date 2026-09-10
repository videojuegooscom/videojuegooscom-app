/**
 * lib/loadingBus.ts
 *
 * Qué hace: cuenta cuántas cosas reales están en marcha AHORA MISMO en toda
 * la app — peticiones a Supabase Y fotos cargando — para poder mostrar una
 * barra de "Pensando" (ver components/lineapensadoraefectosiri.tsx) sin
 * tener que tocar pantalla por pantalla ni acordarse de encenderla/apagarla
 * a mano en cada sitio nuevo que pida datos o pinte una imagen.
 *
 * Cómo funciona: es un contador simple + una lista de "quién quiere
 * enterarse" (patrón pub/sub, sin ninguna librería nueva).
 * - lib/supabase.ts llama a markStart()/markEnd() alrededor de cada fetch
 *   real que hace el cliente de Supabase (consultas, inserts, updates,
 *   llamadas rpc...).
 * - components/SmartImage.tsx llama a markStart()/markEnd() mientras SU
 *   foto está cargando de verdad — así la barra se queda encendida hasta
 *   que todas las fotos en pantalla han terminado, no solo mientras llegan
 *   los datos.
 * - components/lineapensadoraefectosiri.tsx además llama a pulseLoading()
 *   cada vez que cambia de ruta (cambio de pestaña/sección), para que la
 *   barra avise siempre de que "está pasando algo", incluso en una
 *   navegación que no dispara ninguna petición nueva.
 * El hook useGlobalLoading() (usado por lineapensadoraefectosiri) se
 * suscribe con useSyncExternalStore para saber, en cada instante, si el
 * contador es mayor que 0.
 *
 * Qué NO enciende la barra (ver SILENT_URL_PARTS en lib/supabase.ts):
 * llamadas silenciosas de fondo que no bloquean nada que el usuario esté
 * esperando ver — analítica propia, sumar una visita a un producto, el
 * sondeo de mensajes sin leer de la campanita cada 45s. Si contaran, la
 * barra parpadearía sola sin que el usuario haya hecho nada.
 *
 * Conectado con:
 * - lib/supabase.ts → llama a markStart()/markEnd() en cada fetch real.
 * - components/SmartImage.tsx → llama a markStart()/markEnd() por cada
 *   foto que está cargando.
 * - components/lineapensadoraefectosiri.tsx → usa useGlobalLoading() para
 *   saber cuándo pintarse, y llama a pulseLoading() en cada cambio de ruta.
 */
import { useSyncExternalStore } from "react";

let activeCount = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
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
 * Enciende la barra un instante fijo (durationMs) aunque no haya ninguna
 * petición ni foto real detrás — se usa en cada cambio de ruta para que el
 * usuario vea SIEMPRE una señal de "algo está pasando" al cambiar de
 * pestaña/sección, incluso cuando esa pantalla no necesita pedir nada nuevo
 * (datos ya en caché, sin fotos nuevas que cargar, etc.).
 */
export function pulseLoading(durationMs = 450) {
  markStart();
  setTimeout(markEnd, durationMs);
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

function getServerSnapshot(): boolean {
  return false;
}

/** true mientras haya, al menos, una petición real de Supabase en marcha. */
export function useGlobalLoading(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
