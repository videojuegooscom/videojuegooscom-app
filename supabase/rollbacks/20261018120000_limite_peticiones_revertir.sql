-- == VIDEOJUEGOSZARAGOZA ====================================================
-- VUELTA ATRÁS de 20261018120000_limite_peticiones.sql
-- NO es una migración: vive en supabase/rollbacks/ para que no se aplique sola.
-- Solo se ejecuta si el dueño lo autoriza expresamente, y después de haber aplicado la migración.
--
-- Qué hace (y nada más): quita a service_role el permiso de ejecutar consumir_limite. Las funciones de api/
-- reciben «permission denied», lo tratan como «el límite compartido no responde» y siguen con su límite en
-- memoria (el de antes de esta migración), sin romperse.
--
-- Qué NO hace, a propósito: no elimina la tabla ni la función. Son inofensivas (la función sin permisos y la
-- tabla sin acceso desde el navegador). Limpiarlas del todo es una decisión aparte y manual del dueño.
--
-- Comprobación posterior (solo lectura):
--   select proacl::text from pg_proc where proname = 'consumir_limite';   -- ya no debe incluir service_role
-- ============================================================================

revoke execute on function public.consumir_limite(text, integer, integer) from service_role;
