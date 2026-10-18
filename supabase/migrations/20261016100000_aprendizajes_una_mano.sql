-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección «Todo al alcance del pulgar derecho»
-- Tipo:     solo inserta una fila si no existe. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Todo al alcance del pulgar derecho', 'diseno', 1,
   'La tienda se usa con un solo dedo, el pulgar de la mano derecha: lo que se toca a menudo va abajo y a la derecha (buscador abajo en el móvil, botón de volver arriba a la derecha, botón «Volver» flotante en las páginas de lectura, selector de pestañas del Foro encima de enviar) y mide al menos 44 px. Las acciones no dependen de gestos de dos dedos: mover algo = mantener pulsado y arrastrar con un dedo.',
   'Flecha de volver solo arriba a la izquierda y buscador arriba, fuera del alcance del pulgar.', 'Buscador abajo, «volver arriba» y «Volver» abajo a la derecha, objetivos de 46-52 px.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
