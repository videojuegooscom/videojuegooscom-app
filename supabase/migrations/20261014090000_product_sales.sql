-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: ventas registradas (product_sales)
-- Qué hace: crea la tabla que la app ya usa y que nunca llegó a crearse en la base de datos
--           (el archivo antiguo sql/product_sales.sql no se aplicó). Por eso la portada
--           (components/Resenas.tsx) daba error 404 en cada visita y «Marcar como vendido»
--           del panel no funcionaba. Guarda a qué cliente se vendió cada producto, con una
--           foto fija del producto (título, estado, imagen) en el momento de la venta.
-- Acceso:   lectura pública (la miniatura sale junto a las reseñas); un cliente con sesión
--           solo puede registrarse a sí mismo (Comprar ya); el admin marca a cualquiera y
--           puede corregir o quitar ventas.
-- Tipo:     aditiva (solo CREATE). Respecto a sql/product_sales.sql: sin enlaces a la tabla
--           interna de usuarios y sin la búsqueda de usuarios admin_search_users (lee
--           auth.users: si se quiere, la aplica el dueño desde sql/product_sales.sql).
-- ============================================================================

create table if not exists public.product_sales (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  product_id uuid not null references public.products(id) on delete cascade,
  buyer_user_id uuid not null,
  marked_by uuid,
  source text not null default 'manual' check (source in ('manual', 'comprar_ya')),
  product_title text not null default '',
  product_condition text not null default '',
  product_image text not null default ''
);

create index if not exists product_sales_buyer_idx on public.product_sales (buyer_user_id, created_at desc);
create index if not exists product_sales_product_idx on public.product_sales (product_id);

-- Foto fija del producto y protección del comprador: un cliente solo se registra a sí mismo.
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

create trigger trg_product_sales_before_insert
  before insert on public.product_sales
  for each row execute function public.product_sales_before_insert();

alter table public.product_sales enable row level security;

create policy product_sales_select_public on public.product_sales
  for select to anon, authenticated using (true);
create policy product_sales_insert on public.product_sales
  for insert to authenticated with check (auth.uid() is not null);
create policy product_sales_update_admin on public.product_sales
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy product_sales_delete_admin on public.product_sales
  for delete to authenticated using ((select public.is_admin()));
