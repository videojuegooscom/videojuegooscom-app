/*
 * public/sw-avisos.js
 *
 * Qué hace: el «service worker» de los avisos al móvil del dueño (dueño, 2026-11-15: «quiero que me llegue una
 * notificación a mi móvil, con el resumen del pedido o servicio»). Solo sirve para eso: recibe el aviso cifrado que manda
 * el servidor (api/pago.ts, Web Push) y lo enseña con su título («Pedido pagado · 349,99 €»), el resumen, el icono de la
 * tienda y una etiqueta por pedido (si llega otro del mismo pedido, sustituye al anterior). Al tocarlo abre la tienda en
 * la pantalla de ese pedido (/admin/pedidos?buscar=VZ-…), reutilizando la ventana de la tienda si ya está abierta.
 * No guarda nada, no intercepta las páginas (no tiene «fetch») y nunca abre otra web: solo direcciones de la tienda.
 * En el iPhone funciona con la tienda añadida a la pantalla de inicio (iOS 16.4 o posterior); cada aviso que llega se
 * enseña siempre (Safari lo exige).
 * Conectado con: lib/notificaciones.ts (lo registra con alcance «/»), components/AvisosMovil.tsx (Administración →
 * Pedidos), api/pago.ts (manda los avisos) y pruebas/perfil-datos.mjs (sección AVISOM).
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(self.clients.claim());
});

self.addEventListener("push", (evento) => {
  let d = {};
  try {
    d = evento.data ? evento.data.json() : {};
  } catch {
    d = { body: evento.data ? evento.data.text() : "" };
  }
  const titulo = typeof d.title === "string" && d.title ? d.title : "VideojuegosZaragoza";
  const opciones = {
    body: typeof d.body === "string" ? d.body : "",
    icon: typeof d.icon === "string" ? d.icon : "/icono-192.png",
    badge: typeof d.badge === "string" ? d.badge : "/icono-192.png",
    data: { url: typeof d.url === "string" ? d.url : "/admin/pedidos" },
    timestamp: typeof d.ts === "number" ? d.ts : Date.now(),
  };
  if (typeof d.tag === "string" && d.tag) {
    opciones.tag = d.tag;
    opciones.renotify = true;
  }
  evento.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  let destino;
  try {
    destino = new URL((evento.notification.data && evento.notification.data.url) || "/admin/pedidos", self.location.origin);
  } catch {
    destino = new URL("/admin/pedidos", self.location.origin);
  }
  // Solo direcciones de la propia tienda.
  if (destino.origin !== self.location.origin) destino = new URL("/admin/pedidos", self.location.origin);
  evento.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const v of ventanas) {
        if (new URL(v.url).origin !== self.location.origin) continue;
        try {
          if ("navigate" in v) await v.navigate(destino.href);
        } catch {
          // sin navegar: se enfoca igual
        }
        if ("focus" in v) return v.focus();
      }
      return self.clients.openWindow(destino.href);
    })()
  );
});
