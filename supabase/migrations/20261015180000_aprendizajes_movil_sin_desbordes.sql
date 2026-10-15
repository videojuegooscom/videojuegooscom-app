-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección «Nada se sale por los lados en el móvil»
-- Tipo:     solo inserta una fila si no existe. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Nada se sale por los lados en el móvil', 'diseno', 1,
   'Ningún elemento (flotantes, animaciones, mensajes) puede salirse por un lado de la pantalla: en el iPhone Safari ensancha toda la página y la tienda se descoloca (buscador cortado, categorías una por fila, nombres de la barra cortados). Los flotantes van dentro de una capa del tamaño de la pantalla que recorta, y cada cambio visual se revisa a 375 px de ancho antes de publicarlo.',
   'Blue se esconde deslizándose fuera de la pantalla y la página entera se ensancha.', 'Blue se esconde dentro de una capa que recorta y la página mantiene el ancho del móvil.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
