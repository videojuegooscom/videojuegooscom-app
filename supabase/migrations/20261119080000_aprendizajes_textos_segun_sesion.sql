-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lecciones del 2026-11-18/19.
--   1) En «Mis seguimientos», sin reparaciones, se leía «Solicita un servicio con tu sesión iniciada…» a quien YA tiene la
--      sesión iniciada (el dueño: «no entiendo por qué dice esto si tengo ya la sesión iniciada»).
--   2) En una propuesta de «Mi cuenta» salió «Comprar otra vez» (el dueño: «no tiene sentido: son artículos únicos, de
--      segunda mano»).
-- Qué hace: apunta las dos lecciones (si no existen).
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; app/admin/aprendizajes.tsx), app/(tabs)/perfil.tsx.
-- Tipo:     inserta lecciones si no existen. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Los textos para el cliente encajan con su situación: con la sesión iniciada no se le pide iniciarla', 'textos', 2,
   'Antes de escribir un texto que ve el cliente se piensa quién lo verá en ese sitio: si la pantalla solo la ve quien tiene la sesión iniciada, no se le dice «con tu sesión iniciada», «inicia sesión» ni «crea una cuenta»; si la ven las dos personas (con y sin sesión), el texto cambia según el caso. Lo mismo con pedidos, reparaciones o avisos: nunca un texto genérico que no encaja con lo que tiene delante.',
   '«No tienes ninguna reparación ni mantenimiento en curso. Solicita un servicio con tu sesión iniciada y podrás seguir aquí su estado.» en Mis seguimientos, que solo se ve con la sesión iniciada.',
   '«No tienes ninguna reparación ni mantenimiento en curso. Cuando solicites uno, podrás seguir aquí su estado.»'),
  ('Cada artículo es único (segunda mano): nada de «Comprar otra vez», «Repetir pedido» ni cantidades', 'negocio', 1,
   'Los artículos de la tienda son unidades únicas de segunda mano (consolas, mandos, móviles…): una vez vendido, no hay otro igual. Nunca se ofrece «Comprar otra vez», «Repetir pedido», «Añadir 2» ni nada que dé a entender que hay existencias. Lo que sí encaja: «Ver artículos parecidos», «Avisarme cuando haya otro» y, en un pedido cancelado, «Volver a comprar» SOLO si ese mismo artículo sigue a la venta.',
   'Atajo «Comprar otra vez» en Mi cuenta (propuesta del 2026-11-18).',
   '«Vender o cambiar», «Me gusta» o «Avisarme cuando haya otro»; «Volver a comprar» solo en el pedido cancelado cuyo artículo sigue a la venta.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
