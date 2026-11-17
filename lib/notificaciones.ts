/**
 * Archivo: lib/notificaciones.ts
 * Función: utilidad de avisos del navegador y avisos push al móvil del dueño.
 * Para qué sirve: avisa al cliente de los mensajes nuevos del chat (Notification API) y gestiona el registro de dispositivos para los avisos push de pedidos y servicios del administrador.
 * Conectado con: public/sw-avisos.js, api/pago.ts (envía los avisos), components/AvisosMovil.tsx.
 * Utilizado por: components/VenderAhoraModal.tsx, components/Campanita.tsx y components/AvisosMovil.tsx.
 * Dependencias: react-native.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: avisos del navegador (Notification API) para que el cliente se entere en cuanto el
 * equipo le escribe por el chat de la tienda. Es lo que activa el formulario de «Vender mi
 * artículo» cuando se elige el chat como forma de contacto.
 *
 * Alcance real (sin inventar): son avisos locales del navegador. Llegan mientras la tienda esté
 * abierta, también en segundo plano, pero NO con la tienda cerrada: para eso haría falta un
 * servidor de notificaciones push (claves y librería propias), que aún no existe. En iPhone/iPad
 * el navegador solo permite avisos si la tienda está instalada en la pantalla de inicio.
 *
 * Conectado con:
 * - components/VenderAhoraModal.tsx → botón «Activar notificaciones» al elegir el chat.
 * - components/Campanita.tsx → cuando suben los mensajes sin leer y la pestaña está en segundo
 *   plano, lanza el aviso (notificarMensajeNuevo).
 * - Desde el 2026-11-15, abajo: los avisos push al móvil del DUEÑO (pedidos y servicios pagados o nuevos), que sí llegan
 *   con la tienda cerrada: components/AvisosMovil.tsx, public/sw-avisos.js y api/pago.ts.
 */
import { Platform } from "react-native";

export type EstadoNotificaciones =
  | "activadas" // ya concedido: no se muestra nada
  | "pendientes" // se puede pedir permiso
  | "bloqueadas" // la persona las bloqueó en el navegador
  | "instalar" // iPhone/iPad: antes hay que instalar la tienda en la pantalla de inicio
  | "no-disponibles"; // este navegador no tiene avisos

function esWeb(): boolean {
  return Platform.OS === "web" && typeof window !== "undefined";
}

function esAppleMovil(): boolean {
  return esWeb() && /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function estadoNotificaciones(): EstadoNotificaciones {
  if (!esWeb()) return "no-disponibles";
  if (typeof Notification === "undefined") return esAppleMovil() ? "instalar" : "no-disponibles";
  if (Notification.permission === "granted") return "activadas";
  if (Notification.permission === "denied") return "bloqueadas";
  return "pendientes";
}

/** Pide permiso al navegador (hay que llamarlo desde un toque) y devuelve el estado resultante. */
export async function activarNotificaciones(): Promise<EstadoNotificaciones> {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  } catch {
    // el navegador no dejó pedir el permiso
  }
  return estadoNotificaciones();
}

/** Aviso de mensaje nuevo en el chat: solo con permiso y con la pestaña en segundo plano. */
export function notificarMensajeNuevo(cuantos: number, alTocar: () => void): void {
  try {
    if (!esWeb() || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (document.visibilityState !== "hidden") return; // a la vista ya se ve el aviso de Blue
    const n = new Notification("VideojuegosZaragoza", {
      body: cuantos > 1 ? `Tienes ${cuantos} mensajes nuevos en el chat.` : "Tienes un mensaje nuevo en el chat.",
      icon: "/icono-192.png",
      tag: "chat-nuevo",
    });
    n.onclick = () => {
      try {
        window.focus();
        n.close();
      } catch {
        // ignorar
      }
      alTocar();
    };
  } catch {
    // sin aviso si el navegador no lo permite
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Avisos al móvil del DUEÑO (Web Push, dueño 2026-11-15; migración 20261115110000_avisos_movil). A diferencia de lo de
// arriba, estos SÍ llegan con la tienda cerrada: el servidor (api/pago.ts) los manda cifrados al servicio de avisos del
// navegador y el service worker public/sw-avisos.js los enseña. Solo en Administración (components/AvisosMovil.tsx).
// ---------------------------------------------------------------------------------------------------------------------

export type SoporteAvisosPush =
  | "ok" // se puede activar con un toque
  | "instalar" // iPhone/iPad sin la tienda en la pantalla de inicio: hay que añadirla y abrirla desde ahí
  | "bloqueadas" // la persona bloqueó los avisos de esta web
  | "no-disponible"; // este navegador no tiene avisos push

/** ¿La tienda está abierta como app instalada (desde la pantalla de inicio)? */
export function abiertaComoApp(): boolean {
  if (!esWeb()) return false;
  try {
    return !!window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

export function soporteAvisosPush(): SoporteAvisosPush {
  if (!esWeb()) return "no-disponible";
  const hay = "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
  if (!hay) return esAppleMovil() && !abiertaComoApp() ? "instalar" : "no-disponible";
  if (Notification.permission === "denied") return "bloqueadas";
  return "ok";
}

/** La clave pública de los avisos (GET /api/pago?avisos=clave). null = «Avisos sin configurar». */
export async function claveAvisosPush(): Promise<string | null> {
  try {
    const r = await fetch("/api/pago?avisos=clave", { cache: "no-store" });
    const d = (await r.json().catch(() => null)) as { configurado?: boolean; clave?: string } | null;
    return r.ok && d?.configurado === true && typeof d.clave === "string" && /^[A-Za-z0-9_-]{80,100}$/.test(d.clave) ? d.clave : null;
  } catch {
    return null;
  }
}

/** Registra el service worker de los avisos (alcance «/»). null si el navegador no puede. */
export async function registrarServiceWorkerAvisos(): Promise<ServiceWorkerRegistration | null> {
  if (!esWeb() || !("serviceWorker" in navigator)) return null;
  try {
    await navigator.serviceWorker.register("/sw-avisos.js", { scope: "/" });
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/** La suscripción de ESTE dispositivo, si ya la tiene (sin pedir nada). */
export async function suscripcionActual(): Promise<PushSubscription | null> {
  if (!esWeb() || !("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

function claveABytes(b64u: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (b64u.length % 4)) % 4);
  const bin = atob((b64u + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Se suscribe a los avisos con la clave pública (hay que llamarlo desde un toque: el navegador pide permiso aquí; en el
 * iPhone es obligatorio). Si ya había una suscripción con otra clave, la cambia. Devuelve la suscripción o el motivo.
 */
export async function suscribirAvisosPush(reg: ServiceWorkerRegistration, clave: string): Promise<PushSubscription | "bloqueadas" | "error"> {
  const opciones = { userVisibleOnly: true, applicationServerKey: claveABytes(clave) };
  try {
    return await reg.pushManager.subscribe(opciones);
  } catch (e) {
    if (typeof Notification !== "undefined" && Notification.permission === "denied") return "bloqueadas";
    if ((e as Error)?.name === "NotAllowedError") return "bloqueadas";
    // Otra clave guardada (InvalidStateError): se quita la antigua y se vuelve a intentar una vez.
    try {
      const antigua = await reg.pushManager.getSubscription();
      if (antigua) {
        await antigua.unsubscribe();
        return await reg.pushManager.subscribe(opciones);
      }
    } catch {
      // abajo
    }
    return "error";
  }
}
