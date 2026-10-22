-- == VIDEOJUEGOSZARAGOZA ====================================================
-- VUELTA ATRÁS de 20261018090000_aprendizajes_lecciones_nuevas.sql
-- NO es una migración: vive en supabase/rollbacks/ para que no se aplique sola.
-- Solo se ejecuta si el dueño lo autoriza expresamente, y después de haber aplicado la migración.
--
-- Qué hace (y nada más): desactiva las dos lecciones que creó (activa = false). No se borran: la tabla
-- no admite borrados y así queda constancia. Si ya se aplicó la reorganización en grupos
-- (20261018100000), primero hay que deshacer esa con su archivo de supabase/rollbacks/.
--
-- Comprobación previa (solo lectura):
--   select titulo, activa from public.aprendizajes
--    where titulo in ('Mínimo 10 recomendaciones de mejoría en cada respuesta',
--                     'Comprobar los límites de la tabla antes de añadir texto');
-- ============================================================================

update public.aprendizajes
set activa = false
where activa
  and titulo in (
    'Mínimo 10 recomendaciones de mejoría en cada respuesta',
    'Comprobar los límites de la tabla antes de añadir texto'
  );
