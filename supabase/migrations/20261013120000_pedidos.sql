-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: Pedidos
-- Qué hace: guarda cada pedido que el cliente confirma en app/checkout.tsx (antes solo
--           quedaba en WhatsApp). El total se calcula aquí con los precios reales de
--           products, no con lo que mande el navegador.
-- Acceso:   el cliente crea su pedido SOLO con la función crear_pedido (anon y
--           authenticated). Leer: el admin todo; un cliente con sesión, los suyos.
--           Cambiar estado: solo el admin. Sin DELETE.
-- Tipo:     aditiva (solo CREATE). No borra ni modifica datos existentes.
-- Pantallas: app/checkout.tsx, app/admin/pedidos.tsx
-- ============================================================================

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'confirmado', 'preparado', 'enviado', 'entregado', 'cancelado')),
  entrega text not null default 'envio' check (entrega in ('envio', 'recogida')),
  nombre text not null check (char_length(btrim(nombre)) between 2 and 120),
  email text not null check (char_length(email) between 5 and 200),
  telefono text not null check (char_length(telefono) between 6 and 30),
  direccion text check (direccion is null or char_length(direccion) <= 300),
  codigo_postal text check (codigo_postal is null or char_length(codigo_postal) <= 12),
  ciudad text check (ciudad is null or char_length(ciudad) <= 120),
  notas text check (notas is null or char_length(notas) <= 1000),
  total_eur numeric(10, 2) not null default 0,
  -- Nota interna del admin (no la ve el cliente en la tienda).
  nota_admin text check (nota_admin is null or char_length(nota_admin) <= 2000)
);

create table if not exists public.pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  titulo text not null,
  precio_eur numeric(10, 2) not null default 0
);

create index if not exists pedidos_created_idx on public.pedidos (created_at desc);
create index if not exists pedidos_user_idx on public.pedidos (user_id);
create index if not exists pedido_items_pedido_idx on public.pedido_items (pedido_id);

alter table public.pedidos enable row level security;
alter table public.pedido_items enable row level security;

create policy pedidos_admin_select on public.pedidos
  for select to authenticated using ((select public.is_admin()));
create policy pedidos_cliente_select on public.pedidos
  for select to authenticated using (user_id = (select auth.uid()));
create policy pedidos_admin_update on public.pedidos
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy pedido_items_admin_select on public.pedido_items
  for select to authenticated using ((select public.is_admin()));
create policy pedido_items_cliente_select on public.pedido_items
  for select to authenticated using (
    exists (select 1 from public.pedidos p where p.id = pedido_id and p.user_id = (select auth.uid()))
  );

create or replace function public.set_pedidos_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_pedidos_updated_at
  before update on public.pedidos
  for each row execute function public.set_pedidos_updated_at();

-- Crea el pedido con los productos publicados de la lista. Devuelve el número de pedido.
-- p_datos: {nombre, email, telefono, entrega, direccion, codigo_postal, ciudad, notas}
create or replace function public.crear_pedido(p_datos jsonb, p_productos uuid[])
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entrega text := coalesce(nullif(p_datos->>'entrega', ''), 'envio');
  v_id uuid;
  v_numero bigint;
  v_total numeric(10, 2);
  v_count int;
begin
  if p_productos is null or array_length(p_productos, 1) is null or array_length(p_productos, 1) > 20 then
    raise exception 'pedido sin productos';
  end if;
  if v_entrega not in ('envio', 'recogida') then
    raise exception 'entrega no válida';
  end if;

  select count(*), coalesce(sum(price_eur), 0)
    into v_count, v_total
    from public.products
   where id = any(p_productos) and status = 'PUBLISHED' and is_active;

  if v_count = 0 then
    raise exception 'productos no disponibles';
  end if;

  insert into public.pedidos (user_id, entrega, nombre, email, telefono, direccion, codigo_postal, ciudad, notas, total_eur)
  values (
    auth.uid(),
    v_entrega,
    btrim(p_datos->>'nombre'),
    btrim(p_datos->>'email'),
    btrim(p_datos->>'telefono'),
    nullif(btrim(p_datos->>'direccion'), ''),
    nullif(btrim(p_datos->>'codigo_postal'), ''),
    nullif(btrim(p_datos->>'ciudad'), ''),
    nullif(btrim(p_datos->>'notas'), ''),
    v_total
  )
  returning id, numero into v_id, v_numero;

  insert into public.pedido_items (pedido_id, product_id, titulo, precio_eur)
  select v_id, id, title, coalesce(price_eur, 0)
    from public.products
   where id = any(p_productos) and status = 'PUBLISHED' and is_active;

  return v_numero;
end;
$$;

revoke all on function public.crear_pedido(jsonb, uuid[]) from public;
grant execute on function public.crear_pedido(jsonb, uuid[]) to anon, authenticated;
