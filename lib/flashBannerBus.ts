/**
 * lib/flashBannerBus.ts
 *
 * Qué hace: guarda la altura real, ya pintada en pantalla, de la franja de
 * Noticias Flash (components/PromoBanner.tsx) — para que la barra de carga
 * global (components/GlobalLoadingBar.tsx) pueda pegarse justo debajo de
 * ella, sin tener que adivinar un número de píxeles fijo (la franja cambia
 * de alto según el mensaje, el tamaño de letra en móvil/escritorio, si el
 * texto ocupa una o dos líneas, etc.).
 *
 * Cómo funciona: PromoBanner mide su propio alto con onLayout y llama a
 * setFlashBannerHeight() cada vez que cambia. GlobalLoadingBar se suscribe
 * con el hook useFlashBannerHeight() (useSyncExternalStore, mismo patrón
 * que lib/loadingBus.ts) y usa ese valor como su posición "top". Mientras
 * no ha llegado ninguna medida real (primer instante, o una pantalla que no
 * muestra la Noticia Flash), se usa DEFAULT_HEIGHT como valor razonable de
 * respaldo.
 *
 * Conectado con:
 * - components/PromoBanner.tsx → mide y publica su altura real.
 * - components/GlobalLoadingBar.tsx → la usa para pegarse justo debajo.
 */
import { useSyncExternalStore } from "react";

// Alto de respaldo mientras no se ha medido ninguna Noticia Flash real
// (por ejemplo, en pantallas que no la muestran, como el panel de admin).
const DEFAULT_HEIGHT = 44;

let currentHeight = DEFAULT_HEIGHT;
const listeners = new Set<() => void>();

export function setFlashBannerHeight(height: number) {
  if (!Number.isFinite(height) || height <= 0) return;
  if (Math.abs(height - currentHeight) < 0.5) return;

  currentHeight = height;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): number {
  return currentHeight;
}

function getServerSnapshot(): number {
  return DEFAULT_HEIGHT;
}

/** Alto actual, en píxeles, de la franja de Noticias Flash en pantalla. */
export function useFlashBannerHeight(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
