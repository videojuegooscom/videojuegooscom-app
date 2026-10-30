-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del dueño (2026-10-30) — «no tardes tanto en realizar las fusiones».
-- Tipo:     solo inserta filas si no existen. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Fusionar en cuanto la PR está en verde, sin esperas fijas', 'general', 1,
   'La vista previa de Vercel y la revisión de GitHub tardan unos 4 minutos. Nada más abrir una PR se programa una revisión CADA MINUTO (CronCreate recurrente */1; no es un bucle de espera) que ejecuta vz-publicar revisar y, en cuanto está en verde, vz-publicar publicar; después se borra esa revisión (CronDelete) y se comprueba producción. Nunca una sola revisión a los 6 minutos ni esperar a que el dueño escriba.',
   'Abrir la PR y programar una única revisión 6 minutos después: el dueño espera de más.',
   'Abrir la PR y programar «*/1 * * * *» con revisar → publicar; la PR #115 quedó fusionada a los 4,5 min de abrirse.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
