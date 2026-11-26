-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-26.
--   El dueño, tras ver una PR por cada retoque pequeño: «lo retoques pequeños en una sola PR: si te envío cada 1 o 2
--   minutos cambios por hacer, coges y rehaces el PR para hacer un único PR».
-- Qué hace: apunta la lección (si no existe).
-- Conectado con: public.aprendizajes (Centro de Aprendizajes), CLAUDE.md («Todo cambio va en una rama con su PR»).
-- Tipo:     inserta una lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Retoques pequeños seguidos: se añaden a la PR abierta, no una PR nueva por cada uno', 'general', 1,
   'Si hay una PR de Claude abierta y sin publicar y el dueño manda otro retoque pequeño (texto, diseño, botón, colocación), se añade como commit a esa misma rama, se prueba, se sube y se comenta en la PR lo añadido. La misma revisión cada 3 minutos la publica cuando esté en verde: así se espera a Vercel una sola vez. Solo se abre otra PR si la anterior ya se publicó, si el cambio necesita una autorización aparte (migraciones que no sean de aprendizajes) o si es urgente.',
   'Abrir una PR por cada mensaje del dueño aunque lleguen cada 1-2 minutos (#363 a #373 el 2026-11-26), con una espera de Vercel por cada una.',
   'Mientras la PR siga abierta, cada retoque nuevo es un commit más en ella y un comentario en la PR; se publica una sola vez.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
