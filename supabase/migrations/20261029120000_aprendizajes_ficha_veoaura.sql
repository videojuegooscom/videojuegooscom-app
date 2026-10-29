-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lecciones de la ficha técnica de VeoAura (código que no depende del orden de la migración) y de
--            los «controles» de las pruebas que caducan.
-- Tipo:     solo inserta filas si no existen. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Columnas nuevas: el código funciona antes y después de la migración', 'codigo', 1,
   'Cuando una función usa una columna nueva (p. ej. products.caracteristicas, la ficha técnica de VeoAura), el código tiene que seguir funcionando si la migración aún no está aplicada, porque el código y la migración no se publican a la vez: el receptor del puente repite la escritura sin esa columna si PostgREST dice que no la encuentra (PGRST204/42703), y la ficha del producto la pide y, si falla por eso, repite la consulta sin ella. Se prueba simulando la columna ausente. Lo que llega de VeoAura se valida sin rechazar el mensaje por un campo opcional: lo mal formado se descarta, lo desconocido se ignora y cada «publicar» sustituye la lista entera.',
   'Añadir la columna al select de la ficha y publicar el código antes que la migración: la ficha de todos los productos da error.', 'Select con la columna y, si no existe, otra vez sin ella; probado con la columna ausente.'),
  ('Los controles de las pruebas caducan al fusionar su corrección', 'codigo', 2,
   'Un «control» que ejecuta la versión de origin/main para demostrar que el fallo existía solo tiene sentido mientras origin/main no tenga la corrección. Debe comprobar una marca de la corrección en origin/main y omitirse si ya está (con un AVISO), no solo comparar si el archivo cambió: si no, cualquier cambio posterior en ese archivo hace fallar la prueba sin motivo (pasó con pruebas/escaparate-registro.mjs el 2026-10-29).',
   'if (viejo !== nuevo) ejecutar el control: falla con cualquier rama que toque el receptor.', 'if (viejo !== nuevo && !viejo.includes(marca de la corrección)) ejecutar el control.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
