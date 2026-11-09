-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-03.
--   El dueño pidió mandar a VeoAura el nombre, el correo y el teléfono del cliente de los pedidos pagados («pagado» =
--   cuando marca el pedido «Entregado»), con la política de privacidad actualizada antes y sin publicarlo hasta que
--   VeoAura esté preparado para recibirlo. Es la forma de pasar cualquier dato de clientes a otro programa.
-- Qué hace: apunta la lección «Datos de clientes a otro programa: primero la privacidad, lo mínimo y esperar al receptor».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx).
-- Tipo:     inserta la lección si no existe. No borra nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Datos de clientes a otro programa: primero la privacidad, lo mínimo y esperar al receptor', 'seguridad', 1,
   'Para pasar datos de clientes a otro programa (por ejemplo, la ficha del cliente a VeoAura por el puente de vuelta): 1) primero la política de privacidad dice a quién, qué datos y para qué, y esa migración se aplica antes de publicar el código; 2) solo los datos pedidos y del momento acordado (con VeoAura: nombre, correo y teléfono, solo de pedidos con artículos suyos y al marcarlos «Entregado»; nunca la dirección), y nada de un pedido cancelado; 3) el formato y el nombre del aviso los marca el contrato del receptor, que pega o resume el dueño: si no dice algo (por ejemplo, con qué evento llega un dato que aparece días después), se le pregunta al dueño en palabras sencillas antes de programarlo, nunca se supone (con VeoAura: un segundo «pedido» con el mismo número, id_mensaje nuevo y "cliente" dentro de "pedido"; nombre ≤ 120, correo ≤ 160 y teléfono ≤ 40; un correo más largo no se recorta, se queda fuera); 4) en Administración se ve cuántas fichas se han enviado y cuántas faltan; 5) la PR queda abierta SIN publicar hasta que el dueño confirme que el receptor está publicado. Se prueba con un receptor falso que comprueba la firma y la prueba de las pruebas.',
   'Añadir el correo y el teléfono a los avisos de pedido de siempre, inventar un evento nuevo que el receptor no conoce y publicarlo en cuanto la vista previa sale en verde.',
   'Preguntar con qué aviso llega el cliente, mandarlo como dice el contrato de VeoAura, política actualizada en una migración y PR abierta sin publicar hasta que VeoAura esté publicado.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
