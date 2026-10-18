-- == VIDEOJUEGOSZARAGOZA ====================================================
-- VUELTA ATRÁS de 20261018140000_reservas_protegidas.sql
-- NO es una migración: vive en supabase/rollbacks/ para que no se aplique sola.
-- Solo se ejecuta si el dueño lo autoriza expresamente, y después de haber aplicado la migración.
--
-- Qué deshace (y nada más):
--   1) Devuelve a reservar_producto(uuid, uuid) el permiso de anon y authenticated que tenía (en producción
--      el 2026-10-18: postgres, anon, authenticated y service_role; NO tenía el permiso de PUBLIC).
--   2) Quita a service_role el permiso de la función nueva reservar_producto_limitado.
-- No borra la función nueva, ni la columna persona, ni el índice, ni ninguna reserva: son inofensivos sin
-- permisos y así no se pierde nada. Si se vuelve a aplicar la migración, simplemente se vuelven a conceder.
-- ============================================================================

grant execute on function public.reservar_producto(uuid, uuid) to anon, authenticated;

revoke all on function public.reservar_producto_limitado(uuid, uuid, text, integer) from service_role;
