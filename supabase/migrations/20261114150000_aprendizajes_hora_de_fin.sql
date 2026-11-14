-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-14 (el dueño: «Quiero que en vez de que me digas cuánto tardas me digas a qué hora
--            exactamente terminas»).
-- Qué hace: apunta la lección «Decir a qué hora termino, no cuánto tardo» (completa la de estimar tiempos).
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Decir a qué hora termino, no cuánto tardo', 'general', 1,
   'En cada encargo y cada vez que el dueño pregunte cómo va, se mira antes la hora de Madrid y se da la HORA a la que estará terminado y publicado, con el mejor y el peor escenario (hacer + pruebas + publicación). Se dice qué puede retrasarlo (pasada completa de pruebas, límite de uso, cola de GitHub o Vercel, una migración que pega él) y, si cambia, se avisa con la hora nueva.',
   '«Tiempo estimado: mejor 1 h 30 min · peor 3 h 30 min».',
   '«Termino: mejor a las 17:30 · peor a las 19:30 (hora de Madrid)».')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
