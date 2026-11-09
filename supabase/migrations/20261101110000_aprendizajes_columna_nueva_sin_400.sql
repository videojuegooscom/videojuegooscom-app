-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-01.
--   TikTok e Instagram junto al logo (PR #129) pedían la columna nueva «seguidores» por su nombre y, sin la migración
--   aplicada, cada visita a Inicio dejaba un error 400 en la consola del navegador antes de repetir la consulta sin ella.
--   La tienda se veía bien, pero pruebas/movil.mjs lo marcó como fallo en la web real.
-- Qué hace: añade esa lección al Centro de Aprendizajes (la consulta Claude antes de cada respuesta).
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx)
-- Tipo:     solo inserta la fila si no existe. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Columna nueva sin errores en la consola antes de la migración', 'codigo', 2,
   'Mientras una migración no está aplicada, el código no pide la columna nueva por su nombre en cada visita: en una tabla pequeña y pública se lee con select(''*'') (trae las columnas que existan) y se mira si la fila trae el dato; si no se puede, se pregunta una sola vez y se recuerda. Repetir la consulta tras un 400 funciona, pero deja un error en la consola de cada cliente y pruebas/movil.mjs lo marca como fallo. La prueba del navegador cuenta las peticiones fallidas (las respuestas 40x no salen como errores de JavaScript) y se comprueba que lo detecta con la consulta antigua.',
   'select(''platform,label,url,enabled,seguidores'') y, si falla, otra vez sin «seguidores»: un 400 en la consola en cada visita a Inicio.',
   'select(''*'') y «seguidores» in fila: una sola petición que nunca falla, antes y después de la migración.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
