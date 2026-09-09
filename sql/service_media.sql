-- sql/service_media.sql
-- ---------------------------------------------------------------------------
-- Qué hace: crea la tabla "service_media" donde se guardan las fotos de cada
-- servicio del catálogo (gestionadas desde app/admin/services.tsx). Es la
-- contraparte de sql/product_media.sql pero para servicios — mismo patrón,
-- solo con "service_id" en vez de "product_id".
--
-- Por qué NO hace falta un bucket de Storage nuevo: las fotos se guardan en
-- el mismo bucket público "product-media" (creado en sql/product_media.sql),
-- bajo una ruta que empieza por "services/" en vez del id del producto. Las
-- políticas de ese bucket ("public can read product media objects",
-- "authenticated can insert/update/delete product media objects") comprueban
-- solo bucket_id = 'product-media' y public.is_admin() — no miran la ruta
-- del archivo — así que ya cubren también las fotos de servicios sin tocar
-- nada de Storage.
--
-- Cómo aplicarlo: copia y ejecuta este archivo completo en el SQL Editor de
-- tu proyecto de Supabase (Dashboard → SQL Editor → New query → Run) DESPUÉS
-- de sql/services.sql y sql/product_media.sql (necesita el bucket
-- "product-media" ya creado). Es seguro volver a ejecutarlo.
--
-- Conectado con:
-- - sql/services.sql → service_media.service_id apunta a services.id.
-- - app/admin/services.tsx → sube fotos a Storage e inserta/lee filas de
--   esta tabla (reutiliza pickMediaFilesWeb/buildMediaPath de
--   app/admin/products/products.utils.ts).
-- - app/servicios.tsx, app/servicio/[id].tsx → muestran estas fotos al
--   público.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

create table if not exists public.service_media (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  storage_path text not null default '',
  public_url text not null default '',
  file_name text,
  mime_type text,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_service_media_service_id
  on public.service_media (service_id);

create index if not exists idx_service_media_service_sort
  on public.service_media (service_id, sort_order, created_at);

alter table public.service_media enable row level security;

drop policy if exists "public can read service_media" on public.service_media;
drop policy if exists "authenticated can insert service_media" on public.service_media;
drop policy if exists "authenticated can update service_media" on public.service_media;
drop policy if exists "authenticated can delete service_media" on public.service_media;

create policy "public can read service_media"
  on public.service_media
  for select
  to public
  using (true);

create policy "authenticated can insert service_media"
  on public.service_media
  for insert
  to authenticated
  with check (public.is_admin());

create policy "authenticated can update service_media"
  on public.service_media
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "authenticated can delete service_media"
  on public.service_media
  for delete
  to authenticated
  using (public.is_admin());
