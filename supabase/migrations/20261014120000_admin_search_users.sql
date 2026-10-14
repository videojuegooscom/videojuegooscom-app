-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: buscador de clientes del panel (admin_search_users)
-- Qué hace: Productos → «Marcar como vendido» busca al comprador por nombre, usuario o
--           email. La función no existía (no se aplicó sql/product_sales.sql), así que el
--           buscador salía siempre vacío. Solo responde a un administrador y solo devuelve
--           id, email, nombre y usuario (nunca contraseñas ni nada más de la cuenta).
-- Quién la aplica: el dueño en el SQL Editor (lee auth.users; Claude no puede).
-- Tipo:     aditiva (crea una función). No borra datos.
-- ============================================================================

create or replace function public.admin_search_users(q text)
returns table (id uuid, email text, full_name text, username text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede buscar usuarios.';
  end if;

  return query
  select
    u.id,
    u.email::text,
    coalesce(u.raw_user_meta_data ->> 'full_name', '') as full_name,
    coalesce(u.raw_user_meta_data ->> 'username', '') as username
  from auth.users u
  where
    q is null or trim(q) = ''
    or u.email ilike '%' || q || '%'
    or coalesce(u.raw_user_meta_data ->> 'full_name', '') ilike '%' || q || '%'
    or coalesce(u.raw_user_meta_data ->> 'username', '') ilike '%' || q || '%'
  order by coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email) asc
  limit 20;
end;
$$;

revoke all on function public.admin_search_users(text) from public, anon;
grant execute on function public.admin_search_users(text) to authenticated;
