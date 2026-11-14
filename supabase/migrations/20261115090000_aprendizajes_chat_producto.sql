-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-15 (mejora 10 «Chat con el producto adjunto», aprobada por el dueño).
-- Qué hace: apunta la lección «Preguntar por un artículo: directo al chat de la tienda con la tarjeta del producto y
--           primeras preguntas que no se envían solas».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx),
--                app/producto/[id].tsx (PreguntarArticulo), components/ProductChatThread.tsx (TarjetaArticuloChat,
--                SUGERENCIAS_CHAT_PRODUCTO, cargarArticulosChat), app/admin/chats.tsx, app/admin/cliente/[userId].tsx,
--                app/admin/analytics.tsx y pruebas/perfil-datos.mjs (sección CHATP).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Preguntar por un artículo: directo al chat de la tienda con la tarjeta del producto', 'diseno', 2,
   'En la ficha de PRODUCTO, «Preguntar por este artículo» (44 px, secundario, tras los botones de comprar) abre directamente el chat de la tienda de ese producto: la conversación que ya hay o una nueva (get_or_create_product_chat, una fila por producto y cliente: nunca se duplica). Arriba del hilo, fija, la tarjeta del producto (foto pequeña con SmartImage, título, precio actual y estado: a la venta / vendido si tiene venta en product_sales / retirado si no está publicado y visible), con «Ver el artículo» para el cliente y «Ver la ficha» y «Editar en Productos» (/admin/products?editar=<id>) para el administrador. Mientras el cliente no ha escrito, chips de 44 px con primeras preguntas que RELLENAN el campo de 16 px y nunca se envían solas; sin «¿Puedo verlo en persona?» porque la tienda es solo online (se usa «¿Tiene garantía?»). Sin cuenta, se explica la ventaja («te contestamos aquí y te avisamos cuando respondamos») con «Crear cuenta gratis» y «Entrar», y al entrar se vuelve a la ficha con ?chat=1 y se abre el chat solo. La analítica (chat_producto_abierto, _sugerencia, _enviado, _invitacion) lleva solo el producto y nunca el texto. La ficha de SERVICIO sigue preguntando por Blue IA (product_chats solo admite productos): si algún día hay chat de servicios, se iguala. Completa la lección de la ficha de servicio (FS compara el botón por su forma, ahora «Preguntar por este artículo»).',
   'El botón de la ficha manda a Blue IA y el cliente tiene que pedir «Hablar con el equipo»; en el chat no se ve de qué producto habla, y una sugerencia se envía sola al tocarla.',
   'Un toque en «Preguntar por este artículo» abre el chat con la tarjeta de la PlayStation (foto, 349,99 €, «Ver el artículo»); «¿Sigue disponible?» queda escrito en el campo para completarlo y el equipo ve en Chat la misma tarjeta con «A la venta», «Ver la ficha» y «Editar en Productos».')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
