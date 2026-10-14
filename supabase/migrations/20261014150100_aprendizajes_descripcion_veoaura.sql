-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección «Descripción fija en artículos de VeoAura»
-- Tipo:     solo inserta una fila si no existe. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Descripción fija en artículos de VeoAura', 'negocio', 1,
   'Todo artículo que llega de VeoAura se publica con la descripción del dueño, siempre la misma: «Estado Funcional : 10 / 10 · 1 Año de GARANTÍA. · ¡Probado y testeado antes de entregarlo o enviarlo! · Limpieza realizada para un estado impecable. · Envíos y Entregas Rápidas.» (un párrafo por frase). No se sustituye por datos automáticos.',
   'Descripción «Estado: Bueno» generada a partir de los datos de VeoAura.', 'El texto del dueño, idéntico en todos los artículos de VeoAura.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
