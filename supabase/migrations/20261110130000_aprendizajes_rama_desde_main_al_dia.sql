-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-10 (Claude creó la rama de la PR #221 desde una copia de main sin actualizar, sin la
--            #220; al recuperar los cambios guardados con «git stash» hubo conflicto y el primer commit subió con las
--            marcas «<<<<<<<» dentro; se paró la publicación y se arregló antes de publicar).
-- Qué hace: apunta la lección «Cada rama sale de un main recién traído y nunca se sube con marcas de conflicto».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Cada rama sale de un main recién traído y nunca se sube con marcas de conflicto', 'codigo', 1,
   'Antes de crear cada rama se ejecuta «git fetch origin main» y la rama sale de origin/main recién traído (justo después de publicar una PR, main ya es otro). Si se guardan cambios con «git stash» y «git stash pop» avisa de CONFLICT, se para: no se hace «git add» ni commit hasta resolverlo a mano. Antes de cada commit se buscan marcas de conflicto («grep -c -e "^<<<<<<<" -e "^>>>>>>>"» en los archivos tocados debe dar 0) y se mira «git diff origin/main --stat» para comprobar que solo va lo que se quería. Si una PR sube mal, primero se para su publicación automática (CronDelete) y se arregla en la misma rama, con un comentario en la PR.',
   'Crear la rama desde un origin/main de hace una hora, hacer «git stash pop» con conflicto, «git add» y commit: la PR sube con «<<<<<<< Updated upstream» dentro del código.',
   '«git fetch origin main», rama desde origin/main, cambios, búsqueda de marcas (0), «git diff origin/main --stat» y entonces commit y PR.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
