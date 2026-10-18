-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lecciones «Probar en el navegador antes de publicar» y «Medidas de pantalla
-- solo con la tienda montada»
-- Tipo:     solo inserta filas si no existen. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Probar en el navegador antes de publicar', 'codigo', 1,
   'Antes de publicar un cambio visual, Claude genera la tienda (npm run build), la sirve en el servidor y pasa node pruebas/movil.mjs (iPhone 390 × 844): capturas de cada página, nada más ancho que la pantalla, sin errores, la tienda responde con Blue en pantalla, Blue no tapa botones y la guía se recorre entera. Mira las capturas antes de dar el cambio por bueno.',
   'Publicar un arreglo de Blue sin verlo y que la tienda se congele en los móviles.', 'Ver en las capturas que Blue se aparta del aviso de cookies antes de publicar.'),
  ('Medidas de pantalla solo con la tienda montada', 'codigo', 1,
   'La web se genera de antemano sin conocer la pantalla (ancho 1024). Si algo depende del ancho en esa versión, al arrancar en el móvil React no corrige esos estilos y quedan medidas de ordenador. Por eso la versión pre-generada es la pantalla de carga y la tienda se pinta ya montada en el dispositivo (app/_layout.tsx, «montado»). No quitar esa espera.',
   'Buscador de 758 px en un móvil de 390 y categorías una por fila.', 'Buscador al 86 % del móvil y categorías de dos en dos.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
