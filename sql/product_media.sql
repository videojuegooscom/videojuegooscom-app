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
