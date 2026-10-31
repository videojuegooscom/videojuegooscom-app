-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-10-31.
--   Al buscar en el código, Claude escribió sin comillas la ruta app/(tabs)/_layout.tsx en un comando: el intérprete
--   no lo entendió (los paréntesis tienen otro significado) y al dueño le salió una ventana de permiso en el móvil.
-- Tipo:     solo inserta la fila si no existe. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Rutas con paréntesis, siempre entre comillas en los comandos', 'codigo', 1,
   'Las carpetas de Expo Router llevan paréntesis (app/(tabs)/…). En un comando, una ruta así va SIEMPRE entre comillas dobles: sin ellas el intérprete lo toma como otra cosa, el comando falla y al dueño le sale una ventana de permiso en el móvil. Lo mismo para cualquier ruta con espacios, corchetes o paréntesis (app/admin/cliente/[userId].tsx).',
   'git grep -n -e "#DC2626" -- components/Campanita.tsx app/(tabs)/_layout.tsx',
   'git grep -n -e "#DC2626" -- components/Campanita.tsx "app/(tabs)/_layout.tsx"')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
