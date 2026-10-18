-- == VIDEOJUEGOSZARAGOZA ====================================================
-- ESQUELETO MÍNIMO DE SUPABASE para probar migraciones SQL en una base AISLADA (nunca en producción).
-- Reproduce lo que las migraciones de la tienda necesitan de Supabase y de nada más:
--   · los roles anon, authenticated y service_role (este último salta RLS, como en Supabase);
--   · el esquema auth con auth.users y auth.uid() (lee la identidad del token como lo hace Supabase:
--     request.jwt.claims -> sub);
--   · los PERMISOS POR DEFECTO de Supabase en el esquema public: toda tabla, función y secuencia nueva es
--     accesible a anon, authenticated y service_role (por eso en producción las funciones nuevas salen
--     ejecutables por anon aunque se haga «revoke ... from public»);
--   · public.profiles y public.is_admin() (rol admin en profiles);
--   · public.products con las columnas y restricciones reales de producción (leídas el 2026-10-18).
-- Se aplica sobre una base recién creada con el runner pruebas/sql-aislado.mjs.
-- ============================================================================

-- Los roles son del servidor entero, no de una base: se crean solo si faltan.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

-- Igual que auth.uid() de Supabase: el sub del token (request.jwt.claims), o null sin token.
create function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

-- Permisos por defecto de Supabase para lo que se cree después en public.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user',
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create function public.is_admin() returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
$$;

-- Productos: columnas y restricciones reales de producción (solo lo que usan las funciones de pedidos).
create table public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  price_eur numeric not null default 0,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED', 'REVIEW')),
  condition text not null default 'GOOD' check (condition in ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'PARTS')),
  images text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_featured_home boolean not null default false,
  like_count integer not null default 0,
  view_count integer not null default 0
);
alter table public.products enable row level security;
create policy products_publicos on public.products for select to anon, authenticated using (status = 'PUBLISHED' and is_active);
