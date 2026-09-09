-- sql/product_views.sql
--
-- Qué hace: añade un contador de visitas REAL a products (view_count) y una
-- función para sumarle 1 de forma segura, sin dar acceso a modificar el
-- resto de la fila. app/producto/[id].tsx llama a esta función una vez cada
-- vez que alguien (que no sea el propio admin previsualizando) abre la
-- ficha de un producto, y pinta el número que devuelve como "X Visitas"
-- junto a "De segunda mano: ...". No es un número inventado ni aleatorio:
-- sube exactamente una vez por cada carga real de la ficha.
--
-- Cómo ejecutarlo: pégalo entero en el SQL Editor de Supabase (proyecto de
-- Videojuegos Zaragoza) y dale a "Run". Se puede ejecutar más de una vez sin
-- problema (usa "if not exists" / "or replace" en todo).
--
-- Por qué una función en vez de un UPDATE directo: products solo permite
-- UPDATE a los admins (ver sql/products.sql). Un visitante sin cuenta
-- también tiene que poder sumar una visita, así que en vez de abrir UPDATE
-- completo de la tabla a cualquiera, se da acceso únicamente a esta
-- función, que solo puede sumar 1 a view_count (nunca tocar título, precio,
-- estado, etc.). Mismo patrón que sql/product_likes.sql con like_count.

alter table public.products
  add column if not exists view_count integer not null default 0;

create or replace function public.increment_product_view(product_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count int;
begin
  update public.products
  set view_count = view_count + 1
  where id = product_id
  returning view_count into new_count;

  return new_count;
end;
$$;

grant execute on function public.increment_product_view(uuid) to anon, authenticated;
