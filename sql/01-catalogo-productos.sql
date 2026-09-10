-- ============================================================================
-- 01-catalogo-productos.sql — Catálogo de productos
-- ============================================================================
-- Qué contiene este archivo (tablas y funciones, una línea cada una):
-- - profiles                          → rol de cada usuario ('user'/'admin').
-- - categories                        → categorías del catálogo.
-- - products                          → los productos en venta (título,
--                                        precio, estado, fotos antiguas...).
-- - public.is_admin()                 → comprueba si quien llama es admin.
-- - public.touch_updated_at()         → trigger genérico que actualiza
--                                        "updated_at" en cada UPDATE.
-- - public.handle_new_user()          → crea el perfil al registrarse.
-- - storage.buckets "product-media"   → bucket público de fotos/vídeos.
-- - product_media                     → fotos y vídeos de cada producto.
-- - products.reference (columna)      → número de referencia del artículo.
-- - products.like_count (columna)     → contador de "me gusta".
-- - public.adjust_product_like(...)   → suma/resta 1 al like_count.
-- - products.view_count (columna)     → contador real de visitas.
-- - public.increment_product_view(...) → suma 1 al view_count.
-- - categories (filas sembradas)      → categorías fijas que usa Inicio.
--
-- IMPORTANTE: todo esto YA ESTÁ aplicado y funcionando en producción (en el
-- proyecto de Supabase de Videojuegos Zaragoza). NO hay que volver a
-- ejecutar nada de este archivo — está aquí solo como referencia y
-- documentación de lo que ya existe en la base de datos real.
--
-- De qué archivos sueltos viene (nombres originales, por si buscas algo por
-- el nombre de antes):
--   products.sql, product_media.sql, product_reference.sql,
--   product_likes.sql, product_views.sql, home_categories_seed.sql
-- ============================================================================

-- ============================================================
-- De: products.sql — esqueleto principal (profiles, categories, products)
-- ============================================================
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

-- ============================================================
-- De: product_media.sql — bucket "product-media" y fotos/vídeos de cada producto
-- ============================================================
-- sql/product_media.sql
-- ---------------------------------------------------------------------------
-- Qué hace: crea el bucket de Storage "product-media" (PÚBLICO, a diferencia
-- del bucket privado de sql/sell_request_media.sql) y la tabla
-- "product_media" donde se guardan las fotos y vídeos de cada producto del
-- catálogo (hasta varias fotos + vídeo por producto, gestionadas desde
-- app/admin/products.tsx).
--
-- Cómo funciona: cualquiera puede LEER estos archivos (es contenido del
-- escaparate de la tienda, tiene que verse en la web sin sesión), pero solo
-- un administrador puede subir, modificar o borrar.
--
-- Este archivo sustituye a dos scripts que se ejecutaron por separado en el
-- SQL Editor de Supabase: uno que creaba/reparaba la tabla, y otro posterior
-- de limpieza que unificó columnas antiguas con nombre distinto
-- ("media_type" → "kind", "duration_sec" → "duration_seconds") y las quitó.
-- Como esa limpieza ya se aplicó, aquí la tabla se define directamente con
-- los nombres definitivos — no hace falta repetir esa migración. Nota: por
-- compatibilidad hacia atrás, app/admin/products/products.utils.ts todavía
-- sabe leer "media_type"/"duration_sec" si alguna vez volvieran a aparecer,
-- pero una base de datos nueva o ya limpiada no las necesita.
--
-- Corrección de seguridad respecto al script original: las políticas de
-- escritura (insertar/modificar/borrar) de "product_media" y de sus
-- archivos en Storage comprobaban solo "to authenticated" — es decir,
-- CUALQUIER usuario con sesión iniciada (un cliente cualquiera que se haya
-- registrado en la tienda, no solo el admin) podía subir, cambiar o borrar
-- fotos/vídeos de cualquier producto llamando directamente a la API de
-- Supabase, sin pasar por el panel admin. Aquí se exige además
-- public.is_admin() (definida en sql/products.sql), igual que ya se exige
-- para escribir en "categories" y "products".
--
-- Cómo aplicarlo: copia y ejecuta este archivo completo en el SQL Editor de
-- tu proyecto de Supabase (Dashboard → SQL Editor → New query → Run) DESPUÉS
-- de haber ejecutado sql/products.sql (esta tabla depende de products). Es
-- seguro volver a ejecutarlo.
--
-- Conectado con:
-- - sql/products.sql → product_media.product_id apunta a products.id.
-- - app/admin/products/products.utils.ts → sube ficheros al bucket
--   (buildMediaPath, uploadRes) e inserta/lee filas de esta tabla.
-- - app/admin/products/products.constants.ts → MEDIA_BUCKET = "product-media".
-- - app/admin/products.tsx, app/admin/products/products.components.tsx →
--   gestionan y muestran esta media desde el panel.
-- - app/(tabs)/index.tsx, app/catalogo.tsx, app/producto/[id].tsx → si no
--   pueden leer product_media, caen en products.images como alternativa.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- --- Bucket público ------------------------------------------------------
-- file_size_limit/allowed_mime_types limitan lo que se puede subir incluso
-- llamando directamente a la API de Storage (no solo desde el formulario del
-- panel) — mismo criterio que en sql/sell_request_media.sql.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-media',
  'product-media',
  true,
  104857600, -- 100MB
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/avif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- --- Tabla -----------------------------------------------------------------
create table if not exists public.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  kind text not null default 'image',
  storage_path text not null default '',
  public_url text not null default '',
  file_name text,
  mime_type text,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  duration_seconds numeric null,
  created_at timestamptz not null default now()
);

alter table public.product_media drop constraint if exists product_media_kind_check;
alter table public.product_media add constraint product_media_kind_check
  check (kind in ('image', 'video'));

create index if not exists idx_product_media_product_id
  on public.product_media (product_id);

create index if not exists idx_product_media_product_sort
  on public.product_media (product_id, sort_order, created_at);

create index if not exists idx_product_media_kind
  on public.product_media (kind);

-- --- RLS (tabla) -----------------------------------------------------------
alter table public.product_media enable row level security;

drop policy if exists "public can read product_media" on public.product_media;
drop policy if exists "authenticated can insert product_media" on public.product_media;
drop policy if exists "authenticated can update product_media" on public.product_media;
drop policy if exists "authenticated can delete product_media" on public.product_media;

create policy "public can read product_media"
  on public.product_media
  for select
  to public
  using (true);

create policy "authenticated can insert product_media"
  on public.product_media
  for insert
  to authenticated
  with check (public.is_admin());

create policy "authenticated can update product_media"
  on public.product_media
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "authenticated can delete product_media"
  on public.product_media
  for delete
  to authenticated
  using (public.is_admin());

-- --- RLS (Storage) -----------------------------------------------------
drop policy if exists "public can read product media objects" on storage.objects;
drop policy if exists "authenticated can insert product media objects" on storage.objects;
drop policy if exists "authenticated can update product media objects" on storage.objects;
drop policy if exists "authenticated can delete product media objects" on storage.objects;

create policy "public can read product media objects"
  on storage.objects
  for select
  to public
  using (bucket_id = 'product-media');

create policy "authenticated can insert product media objects"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'product-media' and public.is_admin());

create policy "authenticated can update product media objects"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'product-media' and public.is_admin())
  with check (bucket_id = 'product-media' and public.is_admin());

create policy "authenticated can delete product media objects"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'product-media' and public.is_admin());

-- ============================================================
-- De: product_reference.sql — número de referencia del artículo
-- ============================================================
-- sql/product_reference.sql
--
-- Qué hace: añade un "número de referencia del artículo" a products —un
-- código corto que el admin asigna a mano al crear o editar un producto,
-- útil para identificar una unidad física concreta (por ejemplo al hablar
-- por WhatsApp o al gestionar el stock).
--
-- Cómo ejecutarlo: pégalo entero en el SQL Editor de Supabase (proyecto de
-- Videojuegos Zaragoza) y dale a "Run". Se puede ejecutar más de una vez sin
-- problema (usa "if not exists" en todo).
--
-- Cómo funciona:
-- - La columna es opcional (puede quedar vacía): no todos los productos
--   necesitan un número de referencia.
-- - El índice único de abajo solo se aplica a los productos que SÍ tienen
--   una referencia rellenada (where reference is not null and reference <> ''),
--   así que puedes dejar el campo en blanco en todos los que quieras sin que
--   choquen entre sí, pero si escribes uno, no podrá repetirse en otro
--   producto.
--
-- Conectado con:
-- - app/admin/products.tsx → campo "Número de referencia del artículo" en
--   el formulario de alta/edición (se guarda solo si esta migración ya se
--   ejecutó; si no, el campo se desactiva solo en vez de romper el panel).
-- - app/producto/[id].tsx → lo muestra dentro de "Información del
--   producto" cuando el producto tiene uno asignado.

alter table public.products add column if not exists reference text;

create unique index if not exists idx_products_reference_unique
  on public.products (reference)
  where reference is not null and reference <> '';

-- ============================================================
-- De: product_likes.sql — contador de "me gusta" (like_count)
-- ============================================================
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

-- ============================================================
-- De: product_views.sql — contador real de visitas (view_count)
-- ============================================================
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

-- ============================================================
-- De: home_categories_seed.sql — categorías fijas sembradas para Inicio
-- ============================================================
-- sql/home_categories_seed.sql
-- ---------------------------------------------------------------------------
-- Qué hace: crea (o corrige) en "categories" las categorías EXACTAS que usa
-- la sección de Inicio (HOME_CATEGORIES en app/(tabs)/index.tsx) para que el
-- selector de categoría del panel de administración de productos
-- (app/admin/products.tsx) tenga algo real que mostrar y elegir.
--
-- Por qué hacía falta: el picker de categorías del formulario de producto
-- SIEMPRE ha leído de la tabla "categories" (filtrando is_active=true), pero
-- esa tabla es independiente de la lista fija de categorías que se ve en
-- Inicio. Si nunca se creó una fila en "categories" para, por ejemplo,
-- "PlayStation 5", el admin no podía asignársela a ningún producto — el
-- picker solo mostraba "Sin categoría". Este script siembra esas filas con
-- el mismo "slug" que usa Inicio para enlazar a app/catalogo.tsx?cat=..., de
-- forma que elegir una categoría aquí sea EXACTAMENTE la misma categoría que
-- el cliente ve al entrar desde la home.
--
-- Nota: "Reparación / Limpieza" no se incluye aquí a propósito — esa
-- categoría de Inicio ya no lleva a app/catalogo.tsx (productos), lleva a
-- app/servicios.tsx (sql/services.sql), que es un catálogo aparte sin
-- relación con la tabla "categories".
--
-- Es seguro volver a ejecutarlo (upsert por "slug", que ya es UNIQUE).
--
-- Conectado con:
-- - sql/products.sql → crea la tabla "categories" que rellena este script.
-- - app/(tabs)/index.tsx → HOME_CATEGORIES, origen de estos títulos/slugs.
-- - app/catalogo.tsx → resuelve ?cat=<slug> contra esta misma tabla.
-- - app/admin/products.tsx → selector "Categoría actual" del formulario.
-- ---------------------------------------------------------------------------

insert into public.categories (name, slug, sort_order, is_active)
values
  ('PlayStation 5', 'playstation-5', 0, true),
  ('PlayStation 4', 'playstation-4', 1, true),
  ('Nintendo Switch', 'nintendo-switch', 2, true),
  ('Xbox', 'xbox', 3, true),
  ('Electrónica y otros', 'electronica', 4, true)
on conflict (slug) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;
