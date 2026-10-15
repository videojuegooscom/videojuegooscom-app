-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lecciones «Medir antes de culpar al móvil» y «Solo se menciona lo que existe»
-- Tipo:     solo inserta filas si no existen. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Medir antes de culpar al móvil', 'codigo', 1,
   'Cuando algo se ve cortado o descolocado en el móvil, primero se mide con el navegador de pruebas (alto real de cada elemento y de sus contenedores) y solo después se cambian valores. Los nombres de la barra de secciones salían cortados no por la barra del navegador sino porque el espacio de los botones (50 px) no daba para icono y nombre: el nombre se encogía a 9 px.',
   'Subir el margen inferior de la barra «por si la tapa el navegador» sin medir (empeoró el recorte).', 'Medir el nombre (9 px de alto en vez de 13), ver que lo recorta su contenedor y dar espacio a los botones.'),
  ('Solo se menciona lo que existe', 'general', 1,
   'Blue, los textos y las guías solo explican funciones que de verdad existen. Si el dueño pide mencionar algo que aún no está hecho (p. ej. ordenar las pestañas del Foro), primero se construye y luego se explica; nunca se promete.',
   'Decir «ordénalas a tu gusto» sin que exista esa función.', 'Crear la flecha ↑ de cada pestaña, guardar el orden y entonces avisarlo.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
