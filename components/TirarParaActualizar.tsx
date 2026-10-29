// components/TirarParaActualizar.tsx
/**
 * Qué hace: «Desliza para actualizar» en toda la tienda. Arriba del todo de una pantalla, al deslizar el dedo
 * hacia abajo, el contenido baja y aparece la mascota de la tienda con «Desliza para actualizar»; pasado el
 * umbral dice «Suelta para actualizar» y, al soltar, se vuelve a cargar lo de ESA pantalla («Actualizando…» y
 * «¡Actualizado!»). Solo web y pantallas táctiles (la tienda instalada en el móvil no tiene el gesto del
 * navegador).
 *
 * Cómo se usa en una pantalla: `const recarga = useRecarga();` y se añade `recarga` a las dependencias del
 * efecto que carga sus datos (o un efecto aparte `if (recarga > 0) recargar()`). Solo sube con la pantalla a
 * la vista: las de detrás no recargan. Si la pantalla a la vista no usa useRecarga, al soltar se recarga la
 * página entera, salvo que haya texto escrito (no se pierde nada). `alRecargar(cb)` es para lo que vive fuera
 * de las pantallas (Blue: avisos y noticias).
 *
 * Cuándo NO actúa: en chats, Blue IA, Foro, Vender, Pago, Administración y recuperar contraseña (formularios y
 * conversaciones), si la pantalla no está arriba del todo, si el gesto es más horizontal que vertical (carruseles),
 * dentro de campos de texto, de ventanas modales o de Blue.
 *
 * Detalles: el contenido se mueve con transform sobre el contenedor que se desplaza (se quita al acabar); el
 * aviso es una capa fija con pointerEvents="none" como PROPIEDAD (lección: en estilo en línea no vale y bloquearía
 * la tienda). Espera a que terminen las peticiones (lib/loadingBus.ts): mínimo 0,9 s para que se vea y como mucho
 * 8 s.
 *
 * Conectado con: app/_layout.tsx (se monta una vez), components/Campanita.tsx (alRecargar), las pantallas que
 * usan useRecarga, components/marca/MarcaAnimada.tsx (mascota) y lib/loadingBus.ts (barra «Pensando»).
 */
import React, { useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { usePathname } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import MarcaAnimada from "./marca/MarcaAnimada";
import { estaCargando, pulseLoading } from "../lib/loadingBus";

// --- aviso a las pantallas ---------------------------------------------------------------------------

const oyentes = new Set<() => void>();
let pantallasQueRecargan = 0;

function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Para lo que vive fuera de las pantallas (p. ej. Blue): se llama en cada «Suelta para actualizar». */
export function alRecargar(oyente: () => void): () => void {
  return suscribir(oyente);
}

/**
 * Número que sube cada vez que se suelta «Suelta para actualizar» con esta pantalla a la vista (0 al entrar).
 * Añádelo a las dependencias del efecto que carga los datos. `parte: true` para piezas que se usan dentro de
 * varias pantallas (estantes, reseñas): se recargan, pero no cuentan como «esta pantalla ya sabe recargarse»
 * (si la pantalla en sí no usa useRecarga, se recarga entera).
 */
export function useRecarga(opciones?: { parte?: boolean }): number {
  const enFoco = useIsFocused();
  const parte = !!opciones?.parte;
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enFoco) return;
    if (!parte) pantallasQueRecargan += 1;
    const quitar = suscribir(() => setN((v) => v + 1));
    return () => {
      if (!parte) pantallasQueRecargan -= 1;
      quitar();
    };
  }, [enFoco, parte]);
  return n;
}

// --- gesto y aviso ----------------------------------------------------------------------------------

// Formularios y conversaciones: deslizar ahí tiene otro sentido o perdería lo escrito.
const RUTAS_SIN_GESTO = /^\/(chat|blue-ia|vender|checkout|admin|reset-password)/;
// Lo que se toca y no es la pantalla (Blue, su mensaje, la guía) ni algo que se escribe.
const ZONAS_SIN_GESTO =
  "input, textarea, select, [contenteditable='true'], [aria-modal='true'], #blue-flotante, #blue-mensaje, #guia-tarjeta";
const ARRANQUE_PX = 8; // lo que hay que mover el dedo antes de decidir que es este gesto
const RESISTENCIA = 0.55; // el contenido baja algo más de la mitad de lo que baja el dedo
const UMBRAL_PX = 72; // a partir de aquí: «Suelta para actualizar»
const MAXIMO_PX = 120;
const ALTO_ACTUALIZANDO_PX = 76; // hueco que se deja arriba mientras se actualiza
const MINIMO_MS = 900;
const MAXIMO_MS = 8000;

type Fase = "reposo" | "tirando" | "listo" | "actualizando" | "hecho";

const esperar = (ms: number) => new Promise<void>((listo) => setTimeout(listo, ms));

// El elemento que se desplaza bajo el dedo (los ScrollView de react-native-web son un div con overflow).
function contenedorConScroll(desde: Element | null): HTMLElement | null {
  for (let n = desde as HTMLElement | null; n && n !== document.body; n = n.parentElement) {
    const oy = window.getComputedStyle(n).overflowY;
    if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 1) return n;
  }
  return null;
}

// Como en app/_layout.tsx: si hay algo escrito en la pantalla, no se recarga la página entera.
function hayTextoEscrito(): boolean {
  const campos = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
  for (const campo of Array.from(campos)) {
    const tipo = (campo as HTMLInputElement).type;
    if (["hidden", "checkbox", "radio", "button", "submit", "range", "file"].includes(tipo)) continue;
    if (campo.value.trim()) return true;
  }
  return false;
}

function moverContenido(caja: HTMLElement | null, px: number, animado: boolean) {
  if (!caja) return;
  caja.style.transition = animado ? "transform 220ms ease-out" : "";
  caja.style.transform = px > 0 ? `translateY(${px}px)` : "";
  if (animado && px === 0) {
    setTimeout(() => {
      if (!caja.style.transform) caja.style.transition = "";
    }, 260);
  }
}

export default function TirarParaActualizar() {
  const pathname = usePathname();
  const ruta = useRef(pathname);
  ruta.current = pathname;
  const [fase, setFase] = useState<Fase>("reposo");
  const [distancia, setDistancia] = useState(0);
  // Dónde empieza el hueco que deja el contenido al bajar: arriba del contenedor que se desplaza y, en Inicio,
  // debajo de la barra de búsqueda flotante si está arriba (para que la mascota no la tape).
  const [base, setBase] = useState(0);
  const faseRef = useRef<Fase>("reposo");
  faseRef.current = fase;

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    let activo = false;
    let decidido = false;
    let y0 = 0;
    let x0 = 0;
    let d = 0;
    let caja: HTMLElement | null = null;

    const volver = (c: HTMLElement | null) => {
      moverContenido(c, 0, true);
      setDistancia(0);
      setFase("reposo");
    };

    const actualizar = async (c: HTMLElement | null) => {
      setFase("actualizando");
      setDistancia(ALTO_ACTUALIZANDO_PX);
      moverContenido(c, ALTO_ACTUALIZANDO_PX, true);
      if (pantallasQueRecargan === 0) {
        // Esta pantalla no sabe recargar sus datos: se recarga la página (salvo con texto escrito).
        if (hayTextoEscrito()) {
          volver(c);
          return;
        }
        window.location.reload();
        return;
      }
      const inicio = Date.now();
      pulseLoading(600, true);
      oyentes.forEach((oyente) => oyente());
      await esperar(MINIMO_MS);
      while (estaCargando() && Date.now() - inicio < MAXIMO_MS) await esperar(150);
      setFase("hecho");
      await esperar(550);
      volver(c);
    };

    const alEmpezar = (e: TouchEvent) => {
      activo = false;
      decidido = false;
      if (faseRef.current !== "reposo" || e.touches.length !== 1) return;
      if (RUTAS_SIN_GESTO.test(ruta.current)) return;
      const objetivo = e.target instanceof Element ? e.target : null;
      if (!objetivo || objetivo.closest(ZONAS_SIN_GESTO)) return;
      caja = contenedorConScroll(objetivo);
      if (caja ? caja.scrollTop > 0 : (document.scrollingElement?.scrollTop ?? 0) > 0) return;
      y0 = e.touches[0].clientY;
      x0 = e.touches[0].clientX;
      d = 0;
      activo = true;
      const arriba = caja ? Math.max(0, caja.getBoundingClientRect().top) : 0;
      const buscador = document.getElementById("buscador-flotante")?.getBoundingClientRect();
      setBase(buscador && buscador.height > 0 && buscador.top < arriba + 40 && buscador.bottom > arriba ? buscador.bottom + 4 : arriba);
    };

    const alMover = (e: TouchEvent) => {
      if (!activo || e.touches.length !== 1) return;
      const dy = e.touches[0].clientY - y0;
      const dx = e.touches[0].clientX - x0;
      if (!decidido) {
        if (dy < -4 || (Math.abs(dx) > 12 && Math.abs(dx) > dy)) {
          activo = false;
          return;
        }
        if (dy < ARRANQUE_PX) return;
        if (caja && caja.scrollTop > 0) {
          activo = false;
          return;
        }
        decidido = true;
      }
      // Desde aquí el gesto es nuestro: que la página no se desplace ni rebote.
      if (e.cancelable) e.preventDefault();
      d = Math.max(0, Math.min(MAXIMO_PX, (dy - ARRANQUE_PX) * RESISTENCIA));
      moverContenido(caja, d, false);
      setDistancia(d);
      setFase(d >= UMBRAL_PX ? "listo" : "tirando");
    };

    const alSoltar = () => {
      if (!activo) return;
      activo = false;
      if (!decidido) return;
      if (d >= UMBRAL_PX) actualizar(caja);
      else volver(caja);
    };

    const alCancelar = () => {
      if (activo && decidido) volver(caja);
      activo = false;
    };

    document.addEventListener("touchstart", alEmpezar, { passive: true });
    document.addEventListener("touchmove", alMover, { passive: false });
    document.addEventListener("touchend", alSoltar);
    document.addEventListener("touchcancel", alCancelar);
    return () => {
      document.removeEventListener("touchstart", alEmpezar);
      document.removeEventListener("touchmove", alMover);
      document.removeEventListener("touchend", alSoltar);
      document.removeEventListener("touchcancel", alCancelar);
    };
  }, []);

  if (Platform.OS !== "web" || fase === "reposo") return null;

  const progreso = Math.min(1, distancia / UMBRAL_PX);
  const texto =
    fase === "listo"
      ? "Suelta para actualizar"
      : fase === "actualizando"
      ? "Actualizando…"
      : fase === "hecho"
      ? "¡Actualizado!"
      : "Desliza para actualizar";

  return (
    <View
      pointerEvents="none"
      nativeID="tirar-para-actualizar"
      style={{
        position: "fixed" as "absolute",
        top: base + Math.max(4, distancia - 74),
        left: 0,
        right: 0,
        alignItems: "center",
        zIndex: 2147483000,
      }}
    >
      <View style={{ alignItems: "center", gap: 2, opacity: 0.35 + 0.65 * progreso, transform: [{ scale: 0.75 + 0.25 * progreso }] }}>
        <MarcaAnimada cual="carga" ancho={50} reposo={fase === "actualizando"} tocable={false} />
        <Text
          accessibilityLiveRegion="polite"
          style={{
            color: "#0B2138",
            fontWeight: "800",
            fontSize: 12.5,
            paddingHorizontal: 10,
            paddingVertical: 3,
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.92)",
            overflow: "hidden",
          }}
        >
          {texto}
        </Text>
      </View>
    </View>
  );
}
