-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-27.
--   Claude dijo «a las 23:12» siendo las 00:12 en Madrid (el servidor va en UTC) y el dueño pidió «actualiza tu zona
--   horaria» y «sí, apúntalo como lección».
-- Qué hace: apunta la lección (si no existe).
-- Conectado con: public.aprendizajes (Centro de Aprendizajes).
-- Tipo:     inserta una lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Todas las horas al dueño, en hora de Madrid', 'general', 1,
   'El servidor va en UTC y no se cambia su zona horaria (lo comparten otros proyectos). Antes de dar cualquier hora al dueño se mira ya en Madrid con TZ=Europe/Madrid date "+%H:%M %Z", y las tareas programadas (que van en la hora del servidor) se convierten: al dueño siempre se le dice la hora de Madrid.',
   'Decir «compruebo a las 23:12» leyendo la hora del servidor (UTC) cuando en Madrid son las 00:12.',
   'Mirar TZ=Europe/Madrid date, programar la tarea en UTC y decir «compruebo a las 00:12 de Madrid».')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
