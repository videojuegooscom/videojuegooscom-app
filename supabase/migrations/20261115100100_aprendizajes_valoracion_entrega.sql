-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-15 (mejora 11 «Valoración tras la entrega», aprobada por el dueño).
-- Qué hace: apunta la lección «Valoración del pedido: privada, a los 3 días de la entrega real y una nota baja abre el chat
--           con el texto escrito, nunca enviado».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx),
--                supabase/migrations/20261115100000_pedido_valoraciones.sql, components/ReviewModal.tsx
--                (ValorarPedidoModal), components/ProductChatThread.tsx (abrirChatEquipo con borrador),
--                components/Campanita.tsx, app/(tabs)/perfil.tsx, app/admin/pedidos.tsx, app/admin/cliente/[userId].tsx,
--                app/admin/analytics.tsx y pruebas/perfil-datos.mjs (sección VALOR).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Valoración del pedido: privada, a los 3 días de la entrega real y la nota baja abre el chat sin enviar nada', 'diseno', 2,
   'La valoración de un pedido (pedido_valoraciones) es PRIVADA: la ven el cliente y Administración, nunca se publica (las reseñas públicas de servicios son otra cosa). Se pide solo a los 3 días o más de la hora REAL del paso «entregado» (pedido_estados); sin esa fila no se pide, aunque el pedido diga «entregado» (compras en tienda o anteriores a la migración). Blue la pide UNA vez por pedido (queda dicha al enseñarse) y Mis pedidos ofrece «Valorar compra» (44 px); una por pedido (único en la base de datos, que pone el dueño y comprueba que es suyo y entregado). Con nota 1-2, mensaje empático y «Hablar con el equipo», que abre el chat de la tienda con «Sobre mi pedido VZ-…: » ESCRITO en la casilla (parámetro borrador de abrirChatEquipo) y nunca enviado en nombre del cliente. Administración lo ve en Pedidos, la ficha del cliente y Analítica con las bajas arriba; la analítica solo lleva el origen o la nota, nunca el comentario.',
   'Se pide la valoración a todos los entregados al día siguiente, se repite en cada visita y, con una nota baja, se manda al chat un mensaje automático en nombre del cliente.',
   'Tres días después de entregar el pedido VZ-AB2C-DE01, Blue dice una vez «¿Qué tal tu pedido VZ-AB2C-DE01? Valóralo en 10 segundos»; con 2 estrellas se abre el chat con «Sobre mi pedido VZ-AB2C-DE01: » listo para que el cliente lo complete, y el equipo lo ve arriba en Analítica con «Ver pedido».')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
