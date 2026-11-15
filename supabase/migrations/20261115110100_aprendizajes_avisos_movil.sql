-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-15 (avisos al móvil del dueño, «Notificación de la app», elegido por él).
-- Qué hace: apunta la lección «Avisos al móvil del dueño: Web Push propio (node:crypto), una vez por pedido y sin frenar
--           nunca el cobro».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx), api/pago.ts (avisos),
--                public/sw-avisos.js, components/AvisosMovil.tsx, lib/notificaciones.ts, migración
--                20261115110000_avisos_movil.sql, pruebas/avisos-api.mjs, pruebas/perfiles-sql.mjs y
--                pruebas/perfil-datos.mjs (sección AVISOM).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Avisos al móvil del dueño: Web Push propio, una vez por pedido y sin frenar nunca el cobro', 'codigo', 2,
   'Los avisos al móvil del dueño son Web Push estándar hecho con node:crypto (RFC 8291 aes128gcm + RFC 8292 VAPID ES256), sin librerías (el controlador rechaza dependencias) y DENTRO de api/pago.ts (api/ está en el tope de 12 funciones). Claves en Vercel (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY base64url sin relleno y VAPID_SUBJECT mailto:); sin ellas todo dice «Avisos sin configurar» y no se rompe nada. El aviso se RECLAMA en la base de datos antes de enviarlo (pedidos.aviso_admin_tipo/_enviado_en, service_requests.aviso_admin_sesion) para que el webhook de Stripe y la vuelta del navegador a la vez no lo dupliquen; el envío tiene un tope de 4 s y nunca lanza (el cobro y la respuesta a Stripe no dependen de él); 404/410 desactiva la suscripción. El contenido se previsualiza en la pantalla de bloqueo: «Pedido pagado · 349,99 €» y «artículo (+N más) · Nombre I. · Envío a Ciudad CP · VZ-…», nunca nombre completo, correo, teléfono ni dirección; etiqueta por pedido y al tocar abre /admin/pedidos?buscar=VZ-…. En el iPhone solo funciona con la tienda añadida a la pantalla de inicio (iOS 16.4+) y pidiendo permiso con un toque: la tarjeta lo explica. Un «Pedido nuevo» sin pago online sale desde la acción «referencia» (solo quien hizo el pedido), nunca desde un endpoint abierto. Las cifras de Administración salen de admin_avisos_registro y de las fechas de los dispositivos, porque la analítica de la tienda no cuenta al administrador.',
   'Un endpoint público «notificar» que cualquiera puede llamar, o el aviso enviado dentro del webhook sin tope ni reclamo: Stripe reintenta, el aviso llega dos veces o el cobro tarda; y el aviso dice «Ana Gómez López, 600 123 456, Calle Mayor 12».',
   'Pagan un pedido: el webhook apunta el pago, reclama el aviso y en menos de 4 s llega al iPhone «Pedido pagado · 349,99 €» / «PlayStation 5 Slim (+1 más) · Ana G. · Envío a Zaragoza 50001 · VZ-AB12-CD34»; tocarlo abre Pedidos con esa referencia ya buscada.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
