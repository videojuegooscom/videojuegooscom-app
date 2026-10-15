-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lecciones sobre Blue flotante, subtítulos y redes sociales
-- Tipo:     solo inserta filas si no existen. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Blue nunca tapa contenido', 'diseno', 1,
   'El asistente flotante Blue se aparta solo si tapa texto, botones, campos o fotos y busca un hueco libre; sus mensajes salen a su lado (no encima ni debajo), en cristal transparente que se lee bien, y al tocarlos llevan a lo que dicen.',
   'Blue encima del botón «Añadir a la cesta» y su mensaje en una caja blanca encima de él.', 'Blue se mueve a un hueco libre y su mensaje sale al lado; al tocarlo abre la pantalla de la que habla.'),
  ('Sin subtítulos innecesarios', 'textos', 2,
   'En la tienda y en el Panel de control no se ponen subtítulos que solo repiten el título o explican lo obvio («Explora las principales secciones…», «Áreas principales de gestión…»). Un título claro basta.',
   'Título «Categorías» con el subtítulo «Explora las principales secciones de la tienda.»', 'Solo «Categorías».'),
  ('Redes sociales una sola vez', 'diseno', 2,
   'Las redes sociales salen solo en el pie de página; ninguna pantalla repite otro bloque de «Nuestras redes sociales».',
   'Cesta con el bloque de redes y, debajo, el pie de página con las mismas redes.', 'Cesta con las redes solo en el pie de página.'),
  ('Pensado para una mano', 'diseno', 2,
   'Las guías y acciones principales se usan con el pulgar derecho: botón principal grande abajo a la derecha, deslizar para avanzar y textos cortos.',
   'Botón «Siguiente» pequeño arriba a la izquierda.', 'Botón «Siguiente» grande abajo a la derecha y deslizar con el dedo.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
