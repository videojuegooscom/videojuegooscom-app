-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-26.
--   El dueño, al ver el Historial de Blue IA con los textos alineados a la izquierda: «que todo el texto esté centrado
--   siguiendo nuestro diseño, ya lo tienes que saber siempre». Ya existía «Todo centrado» (prioridad 2) y no se aplicó
--   al rehacer una pantalla.
-- Qué hace: apunta la lección (si no existe), con prioridad 1.
-- Conectado con: public.aprendizajes (Centro de Aprendizajes); refuerza la lección «Todo centrado».
-- Tipo:     inserta una lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Texto centrado siempre, también al rehacer una pantalla o una hoja', 'diseno', 1,
   'Todo texto de la tienda va centrado (títulos, subtítulos, contadores, filas de listas y ayudas), también cuando se rehace una pantalla, una ventana o una hoja de abajo siguiendo otro patrón (listas tipo iPhone, filas con icono y flecha): el icono puede ir a un lado y la flecha al otro, pero el texto de en medio va centrado. Antes de entregar, se mira la captura buscando texto pegado a la izquierda. Los botones de abajo de las hojas dejan margen a los lados (que no queden pegados al borde) además de abajo. Refuerza la lección «Todo centrado».',
   'Rehacer el Historial de Blue IA como lista con título, contador y filas alineados a la izquierda y la X pegada al borde derecho.',
   'Cabecera con icono, título y contador centrados; filas con icono a la izquierda, texto centrado y flecha a la derecha; botones de abajo con margen a los lados.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
