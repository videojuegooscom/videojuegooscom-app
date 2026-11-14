-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-14 (el dueño: «No quiero que me pidas permisos», tras otra ventana de permiso en el
--            móvil mientras Claude trabajaba solo).
-- Qué hace: apunta la lección «Trabajar solo sin abrir ventanas de permiso al dueño».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Trabajar solo sin abrir ventanas de permiso al dueño', 'general', 1,
   'Cuando el dueño encarga trabajo automático, ni Claude ni sus ayudantes lanzan comandos que abran una ventana de permiso en su móvil: nada de prefijos «env VAR=…», curl, cd, esperas (sleep, wait, tail --pid, bucles) ni Bash sobre archivos fuera del repo. La hora se mira con «date» a secas (el servidor va en UTC; Madrid +1 h en invierno, +2 h en verano), los archivos de fuera con Read y la web con list_deployments y get_runtime_errors. Cada encargo a un ayudante lo repite por escrito. Si algo solo se puede hacer con permiso, no se lanza: se apunta y se le cuenta al dueño en TRABAJO PENDIENTE.',
   'env TZ=Europe/Madrid date para saber la hora: ventana «Bash quiere ejecutar…» en el móvil del dueño.',
   'date "+%H:%M %Z" → 16:06 UTC = 17:06 en Madrid; sin ventanas.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
