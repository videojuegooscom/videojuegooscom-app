-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-25.
--   La página «Compramos tu consola» decía que la tienda compra «consolas retro» (PlayStation 2 y 3, Wii, DS…). Lo
--   propuso Claude en una lista y lo dio por confirmado; el dueño: «consolas retro no compramos».
-- Qué hace: apunta la lección (si no existe).
-- Conectado con: public.aprendizajes (Centro de Aprendizajes), app/compramos/[tipo].tsx.
-- Tipo:     inserta una lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Qué compra o vende la tienda lo dice el dueño, punto por punto: nada de añadirlo desde una propuesta propia', 'negocio', 1,
   'Cada tipo de artículo que la tienda dice que compra, vende o repara (y cada modelo o marca concreta) tiene que haberlo nombrado el dueño. Si Claude propone una lista y el dueño responde en general («todo lo que te menciono es de verdad»), solo vale lo que él mencionó: lo que añadió Claude se le pregunta una a una antes de publicarlo. Al escribir una página para clientes, se repasa cada categoría contra lo que dijo el dueño.',
   'En «Compramos tu consola» se publicó «Consolas retro: PlayStation 2 y 3, Wii, Nintendo DS y 3DS, Game Boy…» porque estaba en la propuesta de Claude; la tienda no las compra.',
   'Antes de publicar: «¿Compras también consolas retro, mandos sueltos o videojuegos?», y solo se ponen las que el dueño confirma.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
