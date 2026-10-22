-- == VIDEOJUEGOSZARAGOZA ====================================================
-- VUELTA ATRÁS de 20261018130000_visitas_y_apoyos_protegidos.sql
-- NO es una migración: vive en supabase/rollbacks/ para que no se aplique sola.
-- Solo se ejecuta si el dueño lo autoriza expresamente, y después de haber aplicado la migración.
--
-- Qué hace (y nada más):
--   1) Devuelve a PUBLIC, anon y authenticated el permiso de ejecutar las tres funciones antiguas
--      (adjust_product_like, increment_product_view, increment_service_view), que no se tocaron:
--      «me gusta» y visitas vuelven a funcionar como antes desde cualquier navegador.
--   2) Quita a service_role el permiso de ejecutar las tres funciones nuevas (quedan apagadas).
-- Qué NO hace, a propósito: no elimina la tabla producto_apoyos ni las funciones nuevas (conservan los «me
-- gusta» ya apuntados; sin permisos son inofensivas). Los contadores like_count y view_count no se tocan.
--
-- Comprobación posterior (solo lectura):
--   select proname, proacl::text from pg_proc where proname in ('adjust_product_like','increment_product_view',
--     'increment_service_view','fijar_apoyo','sumar_vista_producto','sumar_vista_servicio');
-- ============================================================================

-- Se restituye el estado EXACTO de producción antes de la migración: permiso de PUBLIC («=X/postgres») y el
-- de anon y authenticated.
grant execute on function public.adjust_product_like(uuid, integer) to public, anon, authenticated;
grant execute on function public.increment_product_view(uuid) to public, anon, authenticated;
grant execute on function public.increment_service_view(uuid) to public, anon, authenticated;

revoke execute on function public.fijar_apoyo(uuid, text, boolean) from service_role;
revoke execute on function public.sumar_vista_producto(uuid) from service_role;
revoke execute on function public.sumar_vista_servicio(uuid) from service_role;
