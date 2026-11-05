-- == VIDEOJUEGOSZARAGOZA ====================================================
-- VUELTA ATRÁS de 20261018150000_analitica_topes.sql
-- NO es una migración: vive en supabase/rollbacks/ para que no se aplique sola.
-- Solo se ejecuta si el dueño lo autoriza expresamente, y después de haber aplicado la migración.
--
-- Qué deshace (y nada más):
--   1) DESACTIVA el disparador analytics_events_tope: la analítica vuelve a no tener tope de cantidad.
--      No se borra (así se puede volver a activar con «alter table … enable trigger analytics_events_tope»).
-- Lo que NO toca: las restricciones de longitud (analytics_events_*_largo) se quedan, porque con datos
-- normales no molestan y quitarlas es un «drop constraint» que debe autorizar el dueño aparte. Tampoco se
-- borran las funciones (analytics_events_tope, analitica_topes), la tabla analitica_ritmo ni ninguna fila:
-- con el disparador desactivado, analitica_ritmo deja de sumar y nadie más la usa.
-- ============================================================================

alter table public.analytics_events disable trigger analytics_events_tope;
