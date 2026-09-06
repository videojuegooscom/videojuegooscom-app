-- sql/products.sql
-- ---------------------------------------------------------------------------
-- Qué hace: crea/repara el esqueleto principal de la tienda: "profiles"
-- (roles de usuario), "categories" y "products". Incluye los ayudantes
-- reutilizables (is_admin(), touch_updated_at(), el trigger que crea el
-- perfil al registrarse) que también usan otras tablas del proyecto.
--
-- Cómo funciona:
-- - profiles.role guarda si un usuario es 'user' o 'admin'. Se crea solo al
--   registrarse (trigger on_auth_user_created) con role='user' por defecto;
--   subir a alguien a 'admin' es un paso manual, ver sql/promote_admin.sql.
-- - public.is_admin() centraliza la comprobación "¿el usuario que hace la
--   petición es admin?" leyendo profiles.role = 'admin'. Las políticas RLS
--   de categories/products/profiles la usan en vez de repetir la misma
--   subconsulta en cada una.
-- - categories/products: el público (sin sesión) solo ve categorías activas
--   y productos con status='PUBLISHED' + is_active=true; un admin ve y
--   gestiona todo.
-- - products.images (text[]) es el sistema antiguo de fotos (una lista de
--   URLs directas en la propia fila). Se mantiene por compatibilidad: la
--   app primero intenta leer las fotos desde la tabla product_media (ver
--   sql/product_media.sql) y solo si esa consulta falla cae en "images"
--   (comprueba isMissingColumnError en el código). No hace falta rellenarla
--   a mano en productos nuevos.
-- - products.is_featured_home marca el producto destacado en la home. La
--   app (app/admin/products.tsx) ya se encarga de que solo haya UNO marcado
--   a la vez al activarlo desde el panel; aquí no hay una constraint que lo
--   fuerce a nivel de base de datos.
--
-- Este archivo consolida y sustituye a varios scripts sueltos que se habían
-- ido ejecutando directamente en el SQL Editor de Supabase (base de
-- profiles/categories/products, el añadido de is_featured_home, y una
-- versión anterior y más simple de las políticas de categories/products).
-- Al ser idempotente, se puede ejecutar entero sin miedo aunque ya tengas
-- estas tablas creadas: de paso limpia los nombres de políticas antiguos
-- que hayan quedado duplicados.
--
-- Cómo aplicarlo: copia y ejecuta este archivo completo en el SQL Editor de
-- tu proyecto de Supabase (Dashboard → SQL Editor → New query → Run). Es
-- seguro volver a ejecutarlo cuando quieras.
--
-- Conectado con:
-- - sql/product_media.sql → product_media.product_id apunta a products.id.
-- - sql/sell_requests.sql / sql/sell_request_media.sql → tablas
--   independientes (no dependen de esta), pero comparten el mismo patrón de
--   "solo admin" comprobando profiles.role directamente en vez de con
--   is_admin() (ambas formas son equivalentes).
-- - sql/promote_admin.sql → convierte a un usuario concreto en admin.
-- - app/admin/products.tsx, app/admin/categories.tsx → gestionan estas
--   tablas desde el panel.
-- - app/(tabs)/index.tsx, app/catalogo.tsx, app/producto/[id].tsx →
--   muestran categorías/productos publicados al público.
-- - app/admin/_layout.tsx, app/(tabs)/perfil.tsx → leen profiles.role para
--   saber si el usuario logueado es admin.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- --- Ayudantes comunes -------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

-- --- profiles ------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated
  before update on public.profiles
  for each row
  execute function public.touch_updated_at();

-- Crea automáticamente la fila de perfil (role='user') al registrarse.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

alter table public.profiles enable row level security;

-- Nombres de políticas usados en versiones anteriores de este script: se
-- borran para que no quede ninguna duplicada por debajo de la canónica.
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_update_admin_only" on public.profiles;

create policy "profiles_select_own_or_admin"
  on public.profiles
  for select
  using (auth.uid() = id or public.is_admin());

create policy "profiles_update_admin_only"
  on public.profiles
  for update
  using (public.is_admin())
  with check (public.is_admin());

-- --- categories ------------------------------------------------------------

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order int not null default 0,
  is_active boolean not null default true,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_categories_updated on public.categories;
create trigger trg_categories_updated
  before update on public.categories
  for each row
  execute function public.touch_updated_at();

alter table public.categories enable row level security;

drop policy if exists "categories public read active" on public.categories;
drop policy if exists "categories admin full access" on public.categories;
drop policy if exists "categories_select_public" on public.categories;
drop policy if exists "categories_select_public_or_admin" on public.categories;
drop policy if exists "categories_admin_insert" on public.categories;
drop policy if exists "categories_admin_update" on public.categories;
drop policy if exists "categories_admin_delete" on public.categories;

create policy "categories_select_public_or_admin"
  on public.categories
  for select
  using (is_active = true or public.is_admin());

create policy "categories_admin_insert"
  on public.categories
  for insert
  with check (public.is_admin());

create policy "categories_admin_update"
  on public.categories
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "categories_admin_delete"
  on public.categories
  for delete
  using (public.is_admin());

-- --- products ------------------------------------------------------------

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  price_eur int not null default 0,
  status text not null default 'DRAFT',
  condition text not null default 'GOOD',
  category_id uuid references public.categories(id) on delete set null,
  images text[] not null default '{}',
  is_active boolean not null default true,
  is_featured_home boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Columnas añadidas después de la primera versión de la tabla.
alter table public.products add column if not exists is_featured_home boolean not null default false;

alter table public.products drop constraint if exists products_status_check;
alter table public.products add constraint products_status_check
  check (status in ('DRAFT', 'PUBLISHED', 'REVIEW'));

alter table public.products drop constraint if exists products_condition_check;
alter table public.products add constraint products_condition_check
  check (condition in ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'PARTS'));

drop trigger if exists trg_products_updated on public.products;
create trigger trg_products_updated
  before update on public.products
  for each row
  execute function public.touch_updated_at();

create index if not exists idx_products_is_featured_home
  on public.products (is_featured_home);

create index if not exists idx_products_category_id
  on public.products (category_id);

alter table public.products enable row level security;

drop policy if exists "products public read published" on public.products;
drop policy if exists "products admin full access" on public.products;
drop policy if exists "products_select_public" on public.products;
drop policy if exists "products_select_public_or_admin" on public.products;
drop policy if exists "products_admin_insert" on public.products;
drop policy if exists "products_admin_update" on public.products;
drop policy if exists "products_admin_delete" on public.products;

create policy "products_select_public_or_admin"
  on public.products
  for select
  using ((status = 'PUBLISHED' and is_active = true) or public.is_admin());

create policy "products_admin_insert"
  on public.products
  for insert
  with check (public.is_admin());

create policy "products_admin_update"
  on public.products
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "products_admin_delete"
  on public.products
  for delete
  using (public.is_admin());

-- --- Grants mínimos --------------------------------------------------------
-- RLS ya manda (esto solo evita "permission denied" raros a nivel de tabla).
grant usage on schema public to anon, authenticated;
grant select on table public.categories to anon, authenticated;
grant select on table public.products to anon, authenticated;
grant select on table public.profiles to authenticated;
