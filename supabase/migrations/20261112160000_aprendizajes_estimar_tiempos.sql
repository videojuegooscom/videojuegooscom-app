-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-12 (el dueño: «quiero que me digas a partir de ahora cuánto tiempo te llevará
--            aproximadamente realizar cualquier cambio que te pido, con el mejor escenario y el peor escenario»).
-- Qué hace: apunta la lección «Cada encargo con su tiempo estimado: mejor y peor escenario».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Cada encargo con su tiempo estimado: mejor y peor escenario', 'general', 1,
   'Al aceptar cualquier cambio que pide el dueño, decir en el RESUMEN cuánto tardará aproximadamente, con el mejor y el peor escenario («Tiempo estimado: mejor 20 min · peor 1 h 30 min»), contando hacerlo, probarlo y publicarlo (la vista previa de Vercel y la revisión de GitHub suman 5-10 min). Decir también qué lo puede alargar: la pasada completa de pruebas de pantallas (40-60 min), el límite de uso de la sesión, una cola atascada de GitHub o una migración que tiene que pegar el dueño. Si la estimación cambia por el camino, avisar.',
   'Empezar un cambio grande sin decir cuánto tardará y que el dueño tenga que preguntar «¿por qué tardas tanto?».',
   '«Tiempo estimado: mejor 30 min · peor 2 h (si toca pasar todas las pruebas o se llega al límite de uso)».')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
