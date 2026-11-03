-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-03.
--   El dueño pidió mandar a VeoAura el nombre, el correo y el teléfono del cliente de los pedidos pagados («pagado» =
--   cuando marca el pedido «Entregado»), con la política de privacidad actualizada antes y sin publicarlo hasta que
--   VeoAura esté preparado para recibirlo. Es la forma de pasar cualquier dato de clientes a otro programa.
-- Tipo:     inserta la lección si no existe. No borra nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Datos de clientes a otro programa: primero la privacidad, lo mínimo y esperar al receptor', 'seguridad', 1,
   'Para pasar datos de clientes a otro programa (por ejemplo, la ficha del cliente a VeoAura por el puente de vuelta): 1) primero la política de privacidad dice a quién, qué datos y para qué, y esa migración se aplica antes de publicar el código; 2) solo los datos pedidos y del momento acordado (con VeoAura: nombre, correo y teléfono, solo de pedidos con artículos suyos y al marcarlos «Entregado»; nunca la dirección), y nada de un pedido cancelado; 3) el aviso nuevo va aparte, firmado igual y después del aviso del pedido, para que el receptor que aún no lo conoce no rompa lo que ya funciona; 4) en Administración se ve cuántas fichas se han enviado y cuántas faltan; 5) la PR queda abierta SIN publicar hasta que el dueño confirme que el receptor está preparado: se le da el formato exacto del mensaje para que lo prepare. Se prueba con un receptor falso que comprueba la firma y la prueba de las pruebas.',
   'Añadir el correo y el teléfono a los avisos de pedido de siempre y publicarlo en cuanto la vista previa sale en verde.',
   'Aviso nuevo «pedido_pagado» con el cliente, política actualizada en una migración, PR abierta sin publicar y el formato del mensaje para el dueño.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
