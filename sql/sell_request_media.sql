-- sql/sell_request_media.sql
-- ---------------------------------------------------------------------------
-- Qué hace: crea el bucket de Storage "sell-request-media" y la tabla
-- "sell_request_media" donde se guardan las fotos (hasta 10) y el vídeo
-- (hasta 20s) que el cliente adjunta en el formulario de "Vender ahora"
-- (ver components/SellRequestMedia.tsx y components/VenderAhoraModal.tsx).
--
-- Cómo funciona: a diferencia del bucket "product-media" (público, para
-- mostrar productos en la tienda), este bucket es PRIVADO. Las fotos/vídeo
-- que envía un cliente son datos suyos, no contenido para el escaparate:
-- nadie puede verlos por URL directa. El admin solo puede descargarlos uno
-- a uno desde app/admin/cotizaciones.tsx, que pide una URL firmada de
-- validez muy corta (60s) justo al pulsar "Descargar" — no hay galería ni
-- vista previa, tal y como se pidió.
--
-- Igual que en sell_requests.sql: cualquiera (rol "anon") puede subir
-- ficheros y crear filas (el formulario es público), pero solo un usuario
-- autenticado con profiles.role = 'admin' puede leer, descargar o borrar.
--
-- Seguridad importante: los límites de "hasta 10 fotos", "vídeo de hasta
-- 20s" y "12MB/60MB por archivo" que aplica components/SellRequestMedia.tsx
-- son solo del lado del cliente (JavaScript en el navegador) — cualquiera
-- que conozca la URL y la clave pública (anon key) de este proyecto de
-- Supabase (ambas van dentro del propio código de la web, es normal y no es
-- un fallo) podría saltárselos llamando directamente a la API de Supabase.
-- Por eso este archivo impone los mismos límites otra vez, pero donde no se
-- pueden saltar: en el propio bucket (tamaño y tipo de archivo permitido) y
-- con un trigger en la tabla (máximo de fotos/vídeo por solicitud).
--
-- Cómo aplicarlo: copia y ejecuta este archivo completo en el SQL Editor de
-- tu proyecto de Supabase (Dashboard → SQL Editor → New query → Run) DESPUÉS
-- de haber ejecutado sql/sell_requests.sql (esta tabla depende de esa). Es
-- seguro volver a ejecutarlo.
--
-- Conectado con:
-- - components/SellRequestMedia.tsx → sube ficheros al bucket e inserta
--   filas aquí (uploadSellRequestMedia), y genera la URL firmada de
--   descarga (downloadSellRequestMedia).
-- - components/VenderAhoraModal.tsx → deja elegir hasta 10 fotos + 1 vídeo
--   antes de enviar el formulario.
-- - app/admin/cotizaciones.tsx → lista los ficheros de cada solicitud y
--   deja descargarlos uno a uno.
-- - sql/sell_requests.sql → sell_request_media.sell_request_id apunta a
--   sell_requests.id (on delete cascade: al borrar una cotización se
--   borran también sus filas de media; el fichero en Storage no se borra
--   solo, ver nota al final).
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- Bucket privado --------------------------------------------------------
-- file_size_limit y allowed_mime_types hacen de "muro" en el propio Storage
-- de Supabase: aunque alguien suba directamente por API sin pasar por la
-- app, Supabase rechaza el archivo si pesa más de 60MB (el límite más
-- grande de los dos, el del vídeo) o si no es uno de los formatos que
-- realmente usa la app (las fotos HEIC/HEIF de iPhone se convierten a JPEG
-- ANTES de subir, así que no hace falta permitirlas aquí).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sell-request-media',
  'sell-request-media',
  false,
  62914560, -- 60MB en bytes
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/avif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 62914560,
  allowed_mime_types = array[
    'image/jpeg', 'image/png', 'image/webp', 'image/avif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ];

-- Tabla -------------------------------------------------------------------
create table if not exists public.sell_request_media (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  sell_request_id uuid not null references public.sell_requests(id) on delete cascade,

  kind text not null,
  storage_path text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  duration_seconds numeric,
  sort_order integer not null default 0,

  constraint sell_request_media_kind_check
    check (kind in ('image', 'video'))
);

create index if not exists sell_request_media_sell_request_id_idx
  on public.sell_request_media (sell_request_id, sort_order);

-- Límite de cantidad, también server-side --------------------------------
-- La política de INSERT de abajo es "with check (true)" (necesario porque
-- el formulario es público, sin sesión), así que por sí sola no impide que
-- alguien inserte miles de filas para una misma solicitud saltándose el
-- límite de "10 fotos + 1 vídeo" del formulario. Este trigger lo impide
-- también aquí, contando cuántas filas de cada tipo ya existen antes de
-- aceptar una nueva.
create or replace function public.enforce_sell_request_media_limits()
returns trigger
language plpgsql
as $$
declare
  image_count integer;
  video_count integer;
begin
  select
    count(*) filter (where kind = 'image'),
    count(*) filter (where kind = 'video')
  into image_count, video_count
  from public.sell_request_media
  where sell_request_id = new.sell_request_id;

  if new.kind = 'image' and image_count >= 10 then
    raise exception 'Máximo 10 fotos por solicitud.';
  end if;

  if new.kind = 'video' and video_count >= 1 then
    raise exception 'Máximo 1 vídeo por solicitud.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sell_request_media_limits on public.sell_request_media;

create trigger trg_sell_request_media_limits
  before insert on public.sell_request_media
  for each row
  execute function public.enforce_sell_request_media_limits();

-- Row Level Security (tabla) ------------------------------------------------
alter table public.sell_request_media enable row level security;

drop policy if exists sell_request_media_insert_public on public.sell_request_media;
drop policy if exists sell_request_media_select_admin on public.sell_request_media;
drop policy if exists sell_request_media_delete_admin on public.sell_request_media;

-- Cualquiera puede registrar los ficheros que sube desde el formulario público.
create policy sell_request_media_insert_public
  on public.sell_request_media
  for insert
  to anon, authenticated
  with check (true);

-- Solo administradores pueden ver o borrar filas.
create policy sell_request_media_select_admin
  on public.sell_request_media
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy sell_request_media_delete_admin
  on public.sell_request_media
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Row Level Security (Storage) ------------------------------------------
-- Estas políticas van sobre storage.objects, filtradas por bucket_id, para
-- no afectar a otros buckets (p.ej. product-media).
drop policy if exists sell_request_media_objects_insert_public on storage.objects;
drop policy if exists sell_request_media_objects_select_admin on storage.objects;
drop policy if exists sell_request_media_objects_delete_admin on storage.objects;

-- Cualquiera puede subir un fichero (el formulario "Vender ahora" es público).
create policy sell_request_media_objects_insert_public
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'sell-request-media');

-- Solo administradores pueden leer (necesario para generar la URL firmada
-- de descarga) o borrar ficheros del bucket.
create policy sell_request_media_objects_select_admin
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'sell-request-media'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy sell_request_media_objects_delete_admin
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'sell-request-media'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- Nota: borrar una cotización (sell_requests) borra en cascada sus filas de
-- sell_request_media, pero NO borra automáticamente los ficheros físicos
-- del bucket en Storage (Postgres no puede borrar objetos de Storage desde
-- un trigger de cascada). Si en el futuro esto importa (espacio ocupado),
-- se puede añadir una función programada que limpie ficheros huérfanos.
