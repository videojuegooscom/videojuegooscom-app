-- == VIDEOJUEGOSZARAGOZA ====================================================
-- VUELTA ATRÁS de 20261018160000_funciones_chat_sin_public.sql
-- NO es una migración: vive en supabase/rollbacks/ para que no se aplique sola.
-- Solo se ejecuta si el dueño lo autoriza expresamente, y después de haber aplicado la migración.
--
-- Qué deshace (y nada más): devuelve a las seis funciones el permiso de PUBLIC (=X/postgres) que tenían el
-- 2026-10-18. Los permisos explícitos de anon, authenticated y service_role no se tocan (la migración no
-- los cambió).
-- ============================================================================

grant execute on function public.delete_chat_for_me(uuid) to public;
grant execute on function public.get_or_create_product_chat(uuid) to public;
grant execute on function public.get_or_create_sell_request_chat(uuid) to public;
grant execute on function public.get_or_create_support_chat() to public;
grant execute on function public.get_unread_chat_count() to public;
grant execute on function public.mark_chat_read(uuid) to public;
