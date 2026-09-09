-- sql/admin_users_by_ids.sql
--
-- Qué hace: función para que app/admin/chats.tsx pueda mostrar el NOMBRE
-- REAL de cada cliente que ha abierto una conversación por un producto,
-- aunque esa persona todavía no haya escrito ni un solo mensaje (antes se
-- mostraba "Cliente" a secas en ese caso, porque el nombre solo se sabía
-- leyendo el remitente de sus propios mensajes en product_chat_messages).
--
-- Cómo funciona: auth.users no es legible directamente desde el cliente (ni
-- siquiera un admin), así que esta función security definer hace de puente
-- controlado: comprueba ella misma que quien llama es admin y, dada una
-- lista de user id (los customer_user_id de product_chats), devuelve
-- id/email/nombre de cada uno — nunca contraseñas ni nada más de la cuenta.
-- Mismo mecanismo que admin_search_users(q) en sql/product_sales.sql, pero
-- buscando por lista de id en vez de por texto libre.
--
-- Cómo ejecutarlo: pégalo entero en el SQL Editor de Supabase (proyecto de
-- Videojuegos Zaragoza) y dale a "Run", DESPUÉS de sql/products.sql (usa
-- public.is_admin()). Se puede ejecutar más de una vez sin problema.

create or replace function public.admin_users_by_ids(ids uuid[])
returns table (id uuid, email text, full_name text, username text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede consultar usuarios.';
  end if;

  return query
  select
    u.id,
    u.email::text,
    coalesce(u.raw_user_meta_data ->> 'full_name', '') as full_name,
    coalesce(u.raw_user_meta_data ->> 'username', '') as username
  from auth.users u
  where u.id = any(ids);
end;
$$;

grant execute on function public.admin_users_by_ids(uuid[]) to authenticated;
