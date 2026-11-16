-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-16. El dueño pidió el pedido cancelado «estilo Amazon»; se publicó (PR #290) y al verlo
--            en su iPhone dijo que aún no estaba bien adaptado al móvil ni al ordenador: cabecera repetida («Cancelado» y
--            «Cancelado el…»), total tachado, «Motivo» con texto genérico, «Reembolso» cuando no se cobró nada y, en el
--            ordenador, una columna estrecha de 520 px con mucho hueco.
-- Qué hace: apunta la lección (si no existe).
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx), app/(tabs)/perfil.tsx
--                y pruebas/perfil-datos.mjs (CANDIS).
-- Tipo:     inserta una lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Un diseño «estilo Amazon» se revisa con ojo crítico en las capturas de móvil y de ordenador antes de publicarlo', 'diseno', 1,
   'Que las pruebas pasen (sin desbordes, 44 px, 13 px) no basta: antes de publicar se miran las capturas de 360, 390 y 1280 como lo vería el cliente y se buscan repeticiones (la misma palabra dos veces), datos que confunden (un total tachado parece un descuento), bloques con texto de relleno (mejor quitarlos) y etiquetas que no encajan con el caso (no «Reembolso» si no se cobró). En el ordenador, una tarjeta de pedido aprovecha el ancho (hasta unos 960 px) con el contenido a la izquierda y las acciones en una columna a la derecha, como Amazon; nunca una columna estrecha con mucho hueco.',
   'PR #290: «Cancelado» y «Cancelado el 15 de noviembre» juntos, «Total 55,00 €» tachado, «Motivo: Este pedido se ha cancelado…» y «Reembolso: No se te ha cobrado nada»; en 1280 px, una columna de 520 px con letra pequeña.',
   'Un solo título «Cancelado el 15 de noviembre», el total sin tachar, sin «Motivo» si no lo hay, «Pago · No se te ha cobrado nada»; en el ordenador, franja de datos arriba, contenido a la izquierda y botones a la derecha.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
