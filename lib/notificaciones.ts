// lib/notificaciones.ts
/**
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
