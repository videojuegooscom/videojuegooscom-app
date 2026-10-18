-- == VIDEOJUEGOSZARAGOZA ====================================================
-- VUELTA ATRÁS de 20261018110000_pedidos_idempotencia.sql
-- NO es una migración: vive en supabase/rollbacks/ para que no se aplique sola.
-- Solo se ejecuta si el dueño lo autoriza expresamente, y después de haber aplicado la migración.
--
-- Qué hace (y nada más): quita el permiso de ejecutar crear_pedido_idempotente a anon y authenticated.
-- Con eso la función queda apagada al instante. El navegador, si recibe «permission denied» o
-- «function not found», cae a la función antigua crear_pedido (que no se ha tocado), así que la
-- tienda sigue aceptando pedidos, sin idempotencia, como antes de esta migración.
--
-- Qué NO hace, a propósito: no elimina las columnas clave_unica y clave_huella, el índice ni la función.
-- Son inofensivos (columnas nulas y una función sin permisos) y conservan las claves de los pedidos que
-- ya se hayan hecho. Si el dueño quiere limpiarlos del todo, es una decisión aparte y manual.
--
-- Comprobación previa (solo lectura): quién puede ejecutar la función ahora.
--   select proacl::text from pg_proc where proname = 'crear_pedido_idempotente';
-- Comprobación posterior: la lista ya no debe incluir anon ni authenticated.
-- ============================================================================

revoke execute on function public.crear_pedido_idempotente(uuid, jsonb, uuid[]) from anon, authenticated;
