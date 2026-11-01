-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-01.
--   Al buscar en el código, Claude puso una comilla invertida (`) dentro de un texto a buscar: el intérprete la tomó
--   como el principio de otro comando, el comando falló y al dueño le salió una ventana de permiso en el ordenador.
--   Es la segunda vez en dos días (la anterior, por unos paréntesis sin comillas).
-- Tipo:     solo inserta la fila si no existe. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Buscar con textos sencillos: sin comillas invertidas ni signos raros', 'codigo', 1,
   'Lo que se busca con git grep es un texto sencillo: palabras y signos normales. Nunca comillas invertidas (`), ni $, ni llaves o barras invertidas en el patrón: el intérprete los toma como parte del comando, falla y al dueño le sale una ventana de permiso. Para encontrar algo con esos signos se busca un trozo sin ellos (por ejemplo «Editar» en vez de «accessibilityLabel={`Editar»). Va junto a la lección de las rutas con paréntesis, siempre entre comillas.',
   'git grep -n -e "accessibilityLabel={`Editar" -- app/admin/categories.tsx',
   'git grep -n -e "Editar" -- app/admin/categories.tsx')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
