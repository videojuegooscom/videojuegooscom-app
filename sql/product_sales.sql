-- sql/product_sales.sql
-- ---------------------------------------------------------------------------
-- Qué hace: crea la tabla "product_sales", que guarda a qué cliente
-- registrado se le ha vendido cada producto ("marcar como vendido"). Se usa
-- para dos cosas:
-- - components/Resenas.tsx: junto a cada reseña, si la persona que la
--   escribió tiene una venta registrada, se muestra la miniatura, el título
--   y el estado del producto que compró.
-- - app/admin/chats.tsx y app/admin/products.tsx: desde ahí Jefe marca
--   manualmente "vendido a [cliente]", eligiendo entre quien le escribió por
--   ese producto (chat) o buscando directamente a un usuario registrado.
-- - app/checkout.tsx: cuando el cliente compra con el botón "Comprar ya"
--   (que ahora exige sesión iniciada), al confirmar el pedido se inserta
--   aquí automáticamente (source='comprar_ya'), sin pasar por el admin.
--
-- Cómo funciona:
-- - El cliente solo puede insertar una fila PARA SÍ MISMO (autocompra al
--   confirmar "Comprar ya"): el trigger de abajo ignora cualquier
--   buyer_user_id que mande alguien que no sea admin y lo sustituye siempre
--   por auth.uid(), y fuerza source='comprar_ya' en ese caso — igual que
--   sql/store_reviews.sql impide que un cliente firme como otra persona. Un
--   admin sí puede insertar/editar cualquier fila (elegir cualquier
--   comprador, cualquier producto, source='manual').
-- - product_title / product_condition / product_image son una "foto fija"
--   del producto en el momento de la venta (se copian solas del producto y
--   de su primera foto en product_media, o de products.images si esa tabla
--   no tiene fotos): así, si el producto se edita o se borra más adelante,
--   la reseña ya publicada sigue mostrando lo que la persona compró de
--   verdad, no lo que sea que haya ahora en el catálogo.
-- - No hay restricción de una venta por producto: un mismo producto no
--   debería venderse dos veces en una tienda de artículos usados, pero si
--   Jefe se equivoca al marcarlo puede simplemente borrar la fila o
--   actualizar buyer_user_id (solo admin) en vez de quedar bloqueado.
-- - admin_search_users(q): función aparte, para que app/admin/products.tsx
--   pueda buscar "¿qué usuario registrado es este?" por nombre/usuario/email
--   y marcarlo como comprador sin depender de que haya escrito por el chat.
--
-- Cómo aplicarlo: copia y ejecuta este archivo completo en el SQL Editor de
-- tu proyecto de Supabase (Dashboard → SQL Editor → New query → Run) DESPUÉS
-- de sql/products.sql y sql/product_media.sql (los necesita). Es seguro
-- volver a ejecutarlo.
--
-- Conectado con:
-- - sql/products.sql → products.id, public.is_admin().
-- - sql/product_media.sql → product_media (foto de portada para el snapshot).
-- - components/Resenas.tsx → lee la venta más reciente de cada autor de
--   reseña para mostrar la miniatura.
-- - app/admin/chats.tsx, app/admin/products.tsx → INSERT/UPDATE/DELETE como
--   admin ("marcar como vendido").
-- - app/producto/[id].tsx, app/checkout.tsx → "Comprar ya" exige sesión y
--   hace el INSERT como el propio cliente al confirmar el pedido.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

create table if not exists public.product_sales (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  product_id uuid not null references public.products(id) on delete cascade,
  buyer_user_id uuid not null references auth.users(id) on delete cascade,
  marked_by uuid references auth.users(id) on delete set null,
  source text not null default 'manual',

  -- "Foto fija" del producto en el momento de la venta.
  product_title text not null default '',
  product_condition text not null default '',
  product_image text not null default ''
);

alter table public.product_sales drop constraint if exists product_sales_source_check;
alter table public.product_sales add constraint product_sales_source_check
  check (source in ('manual', 'comprar_ya'));

create index if not exists product_sales_buyer_idx
  on public.product_sales (buyer_user_id, created_at desc);

create index if not exists product_sales_product_idx
  on public.product_sales (product_id);

-- Rellena SIEMPRE el snapshot del producto, y protege quién es el
-- comprador: un cliente normal solo puede marcarse a sí mismo (autocompra
-- desde "Comprar ya"); solo un admin puede marcar a otra persona.
create or replace function public.product_sales_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_condition text;
  v_cover text;
  v_legacy_images text[];
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  if not public.is_admin() then
    new.buyer_user_id := auth.uid();
    new.source := 'comprar_ya';
  end if;

  new.marked_by := auth.uid();

  select title, condition, images
    into v_title, v_condition, v_legacy_images
    from public.products
    where id = new.product_id;

  if v_title is null then
    raise exception 'Producto no encontrado.';
  end if;

  select public_url
    into v_cover
    from public.product_media
    where product_id = new.product_id and kind = 'image'
    order by is_cover desc, sort_order asc, created_at asc
    limit 1;

  new.product_title := v_title;
  new.product_condition := coalesce(v_condition, '');
  new.product_image := coalesce(v_cover, v_legacy_images[1], '');

  return new;
end;
$$;

drop trigger if exists trg_product_sales_before_insert on public.product_sales;
create trigger trg_product_sales_before_insert
  before insert on public.product_sales
  for each row
  execute function public.product_sales_before_insert();

-- Row Level Security ---------------------------------------------------------
alter table public.product_sales enable row level security;

drop policy if exists product_sales_select_public on public.product_sales;
drop policy if exists product_sales_insert on public.product_sales;
drop policy if exists product_sales_update_admin on public.product_sales;
drop policy if exists product_sales_delete_admin on public.product_sales;

-- Lectura pública: la miniatura del producto vendido se muestra junto a la
-- reseña en la pantalla de Inicio, que cualquiera puede ver sin sesión.
create policy product_sales_select_public
  on public.product_sales
  for select
  to anon, authenticated
  using (true);

-- Un cliente con sesión puede insertar (el trigger ya obliga a que sea para
-- sí mismo salvo que sea admin, que puede marcar a cualquiera).
create policy product_sales_insert
  on public.product_sales
  for insert
  to authenticated
  with check (true);

create policy product_sales_update_admin
  on public.product_sales
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy product_sales_delete_admin
  on public.product_sales
  for delete
  to authenticated
  using (public.is_admin());

-- Grants mínimos --------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on table public.product_sales to anon, authenticated;
grant insert on table public.product_sales to authenticated;
grant update on table public.product_sales to authenticated;
grant delete on table public.product_sales to authenticated;

-- --- Buscador de usuarios registrados (solo admin) ------------------------
-- app/admin/products.tsx necesita poder buscar "¿qué usuario registrado es
-- este?" por nombre, usuario o email para marcarlo como comprador sin pasar
-- por el chat. auth.users no es legible directamente desde el cliente (ni
-- siquiera un admin), así que esta función security definer hace de puente
-- controlado: comprueba ella misma que quien llama es admin y solo entonces
-- devuelve id/email/nombre — nunca contraseñas ni nada más de la cuenta.
create or replace function public.admin_search_users(q text)
returns table (id uuid, email text, full_name text, username text)
language plpgsql
security definer
set search_path = public
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

grant execute on function public.admin_search_users(text) to authenticated;
