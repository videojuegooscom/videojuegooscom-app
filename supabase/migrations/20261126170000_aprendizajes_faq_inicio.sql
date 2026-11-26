-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-26.
--   Claude propuso añadir a «Preguntas frecuentes» de Inicio «¿Dónde vender mi consola en Zaragoza?» (una pregunta para
--   Google). El dueño: «las preguntas que aparecen en Preguntas frecuentes es para el uso o dudas de lo que nosotros
--   hacemos en la app, así que no pegaría esta pregunta allí».
-- Qué hace: apunta la lección (si no existe).
-- Conectado con: public.aprendizajes (Centro de Aprendizajes), app/(tabs)/index.tsx (PREGUNTAS_INICIO).
-- Tipo:     inserta una lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('«Preguntas frecuentes» de Inicio: solo dudas de uso de la tienda, no preguntas para Google', 'diseno', 2,
   'Las preguntas frecuentes de Inicio responden cómo se usa la tienda y qué hace (comprar, envíos, garantía, vender, reparar, pagar). Las preguntas pensadas para salir en Google («dónde vender mi consola en Zaragoza») van en sus páginas («Compramos tu…», guías del blog), no ahí.',
   'Proponer añadir «¿Dónde vender mi consola en Zaragoza?» a las preguntas frecuentes de Inicio.',
   'Mantener en Inicio las dudas de uso y poner las preguntas para Google en las páginas «Compramos tu…» o en una guía.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
