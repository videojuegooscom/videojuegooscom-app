-- sql/product_likes.sql
--
-- Qué hace: añade el contador de "me gusta" a products y una función para
-- moverlo de forma segura, sin dar acceso a modificar el resto de la fila.
--
-- Cómo ejecutarlo: pégalo entero en el SQL Editor de Supabase (proyecto de
-- Videojuegos Zaragoza) y dale a "Run". Se puede ejecutar más de una vez sin
-- problema (usa "if not exists" / "or replace" en todo).
--
-- Por qué una función en vez de un UPDATE directo: products solo permite
-- UPDATE a los admins (ver sql/products.sql). Un visitante sin cuenta
-- también tiene que poder dar like, así que en vez de abrir UPDATE completo
-- de la tabla a cualquiera, se da acceso únicamente a esta función, que solo
-- puede sumar o restar 1 al contador like_count (nunca tocar título, precio,
-- estado, etc.).

alter table public.products
  add column if not exists like_count integer not null default 0;

create index if not exists idx_products_like_count
  on public.products (like_count desc);

create or replace function public.adjust_product_like(product_id uuid, delta int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count int;
begin
  if delta not in (1, -1) then
    raise exception 'delta must be 1 or -1';
  end if;

  update public.products
  set like_count = greatest(0, like_count + delta)
  where id = product_id
  returning like_count into new_count;

  return new_count;
end;
$$;

grant execute on function public.adjust_product_like(uuid, int) to anon, authenticated;
