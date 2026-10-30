-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del dueño (2026-10-30) — «no tardes tanto en realizar las fusiones» y, después, «compruebas cada
--            3 minutos».
-- Tipo:     solo inserta filas si no existen. No borra ni modifica nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Fusionar en cuanto la PR está en verde, revisando cada 3 minutos', 'general', 1,
   'La vista previa de Vercel y la revisión de GitHub tardan unos 4 minutos (más si Vercel tiene otro despliegue en cola: construye de uno en uno). Nada más abrir una PR se programa una revisión CADA 3 MINUTOS (CronCreate recurrente */3; no es un bucle de espera) que ejecuta vz-publicar revisar y, en cuanto está en verde, vz-publicar publicar; mientras no esté en verde no se escribe al dueño. Después se borra esa revisión (CronDelete) y se comprueba producción. Ni una única revisión a los 6 minutos (tarda de más) ni cada minuto (demasiados avisos).',
   'Abrir la PR y programar una única revisión 6 minutos después, o revisarla cada minuto escribiendo «aún no» cada vez.',
   'Abrir la PR y programar «*/3 * * * *» con revisar → publicar; al publicar, CronDelete y comprobar el despliegue.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
