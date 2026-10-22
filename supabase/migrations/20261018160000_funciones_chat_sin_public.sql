-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: seis funciones del chat dejan de ser ejecutables por PUBLIC (todo el mundo).
-- Qué pasa hoy (comprobado en producción, solo lectura, 2026-10-18): estas seis funciones SECURITY DEFINER tienen
--           «=X/postgres» en su lista de permisos (proacl), o sea que las puede ejecutar cualquier rol, además
--           de los permisos explícitos de anon, authenticated y service_role. Las seis empiezan comprobando
--           auth.uid() (sin sesión devuelven 0, no hacen nada o lanzan «Debes iniciar sesión»), así que NO se
--           ha encontrado ninguna fuga ni ningún abuso: es higiene, para que el permiso sea explícito y no
--           dependa de PUBLIC (lección «Quitar permisos de una función: revisar también PUBLIC»).
-- Qué hace:  «revoke … from public» en las seis y reafirma los permisos de anon, authenticated y service_role
--           (son los que ya tienen; no cambia nada para la tienda: un visitante sin sesión sigue recibiendo
--           los mismos mensajes que antes, porque la comprobación de sesión está dentro de cada función).
-- Funciones: delete_chat_for_me(uuid), get_or_create_product_chat(uuid), get_or_create_sell_request_chat(uuid),
--           get_or_create_support_chat(), get_unread_chat_count(), mark_chat_read(uuid).
-- Tipo:     solo cambia permisos (no toca datos ni el cuerpo de las funciones). Cambia permisos de funciones
--           SECURITY DEFINER: la revisa y aplica el dueño.
-- Vuelta atrás: supabase/rollbacks/20261018160000_funciones_chat_sin_public_revertir.sql
-- ============================================================================

revoke all on function public.delete_chat_for_me(uuid) from public;
revoke all on function public.get_or_create_product_chat(uuid) from public;
revoke all on function public.get_or_create_sell_request_chat(uuid) from public;
revoke all on function public.get_or_create_support_chat() from public;
revoke all on function public.get_unread_chat_count() from public;
revoke all on function public.mark_chat_read(uuid) from public;

grant execute on function public.delete_chat_for_me(uuid) to anon, authenticated, service_role;
grant execute on function public.get_or_create_product_chat(uuid) to anon, authenticated, service_role;
grant execute on function public.get_or_create_sell_request_chat(uuid) to anon, authenticated, service_role;
grant execute on function public.get_or_create_support_chat() to anon, authenticated, service_role;
grant execute on function public.get_unread_chat_count() to anon, authenticated, service_role;
grant execute on function public.mark_chat_read(uuid) to anon, authenticated, service_role;
