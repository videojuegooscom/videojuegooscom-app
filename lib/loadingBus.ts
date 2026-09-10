/**
 * lib/loadingBus.ts
 *
 * Qué hace: cuenta cuántas peticiones reales a Supabase están en marcha
 * AHORA MISMO, en toda la app, para poder mostrar una barra de "Pensando"
 * (ver components/GlobalLoadingBar.tsx) sin tener que tocar pantalla por
 * pantalla ni acordarse de encenderla/apagarla a mano en cada sitio nuevo
 * donde se pida algo a Supabase.
 *
 * Cómo funciona: es un contador simple + una lista de "quién quiere
 * enterarse" (patrón pub/sub, sin ninguna librería nueva). lib/supabase.ts
 * llama a markStart()/markEnd() alrededor de cada fetch real que hace el
 * cliente de Supabase (consultas, inserts, updates, llamadas rpc...). El
 * hook useGlobalLoading() (usado por GlobalLoadingBar) se suscribe con
 * useSyncExternalStore para saber, en cada instante, si el contador es
 * mayor que 0.
 *
 * Qué NO enciende la barra (ver SILENT_URL_PARTS en lib/supabase.ts):
 * llamadas silenciosas de fondo que no bloquean nada que el usuario esté
 * esperando ver — analítica propia, sumar una visita a un producto, el
 * sondeo de mensajes sin leer de la campanita cada 45s. Si contaran, la
 * barra parpadearía sola sin que el usuario haya hecho nada.
 *
 * Conectado con:
 * - lib/supabase.ts → llama a markStart()/markEnd() en cada fetch real.
 * - components/GlobalLoadingBar.tsx → usa useGlobalLoading() para saber
 *   cuándo pintarse.
 */
import { useSyncExternalStore } from "react";

let activeCount = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

/** Llamar justo antes de lanzar una petición real. */
export function markStart() {
  activeCount += 1;
  emit();
}

/** Llamar en cuanto esa petición termina (con éxito o con error). */
export function markEnd() {
  activeCount = Math.max(0, activeCount - 1);
  emit();
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
