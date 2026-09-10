-- ============================================================================
-- 03-ventas-y-cotizaciones.sql — Ventas y cotizaciones ("Vender ahora")
-- ============================================================================
-- Qué contiene este archivo (tablas y funciones, una línea cada una):
-- - sell_requests                     → formularios de "Vender ahora" que
--                                        rellenan los clientes.
-- - sell_request_media                → fotos/vídeo adjuntos a cada
--                                        solicitud de "Vender ahora".
-- - storage.buckets "sell-request-media" → bucket privado de esas fotos/vídeo.
-- - public.enforce_sell_request_media_limits() → limita cuántas fotos/vídeo
--                                        puede tener cada solicitud.
-- - product_sales                     → registro de a qué cliente se le ha
--                                        vendido cada producto.
-- - public.product_sales_before_insert() → rellena la "foto fija" del
--                                        producto vendido y protege quién
--                                        puede ser el comprador.
-- - public.admin_search_users(q)      → busca usuarios registrados por
--                                        nombre/usuario/email (solo admin).
--
-- IMPORTANTE: todo esto YA ESTÁ aplicado y funcionando en producción (en el
-- proyecto de Supabase de Videojuegos Zaragoza). NO hay que volver a
-- ejecutar nada de este archivo — está aquí solo como referencia y
-- documentación de lo que ya existe en la base de datos real.
--
-- De qué archivos sueltos viene (nombres originales, por si buscas algo por
-- el nombre de antes):
--   sell_requests.sql, sell_request_media.sql, product_sales.sql
-- ============================================================================

-- ============================================================
-- De: sell_requests.sql — formularios de "Vender ahora" (sell_requests)
-- ============================================================
-- sql/sell_requests.sql
-- ---------------------------------------------------------------------------
-- Qué hace: crea la tabla "sell_requests" donde se guardan los formularios
-- de "Vender ahora" que rellenan los clientes desde la app (ver
-- components/VenderAhoraModal.tsx). Sustituye el envío por email: todo queda
-- almacenado aquí y se revisa desde app/admin/cotizaciones.tsx.
--
-- Cómo funciona: cualquier persona (incluso sin sesión, rol "anon") puede
-- INSERTAR una solicitud, porque el formulario es público. Solo un usuario
-- autenticado con profiles.role = 'admin' puede leer, actualizar o borrar
-- filas, igual que ya funciona en el resto del panel admin (categorías,
-- productos). Un trigger mantiene "updated_at" al día en cada UPDATE.
--
-- Además de los datos del artículo, guarda datos del cliente: nombre,
-- apellido, género, confirmación de mayoría de edad, método de contacto
-- preferido (whatsapp/gmail/instagram/facebook/tiktok) con su valor, y cómo
-- entrega el artículo (domicilio con dirección, o él mismo con
-- disponibilidad horaria).
--
-- Cómo aplicarlo: copia y ejecuta este archivo completo en el SQL Editor de
-- tu proyecto de Supabase (Dashboard → SQL Editor → New query → Run). Es
-- seguro volver a ejecutarlo (usa IF NOT EXISTS / OR REPLACE / DROP...IF
-- EXISTS en todo lo que puede chocar).
--
-- Conectado con:
-- - components/VenderAhoraModal.tsx → hace el INSERT público al enviar el
--   formulario.
-- - app/admin/cotizaciones.tsx → lee, actualiza el estado y borra filas.
-- - public.profiles(role) → ya debe existir (la usa app/admin/_layout.tsx
--   para proteger todo el panel admin).
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

create table if not exists public.sell_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Respuestas del formulario público (ver VenderAhoraModal.tsx):
  articulo text not null,
  funciona_bien boolean not null,
  motivo_venta text,
  descripcion_problema text,
  ciudad text not null,
  precio_estimado text not null,
  contacto text,

  -- Flujo de trabajo interno del panel admin:
  status text not null default 'nuevo',
  nota_admin text,

  constraint sell_requests_status_check
    check (status in ('nuevo', 'revisado', 'contactado', 'descartado'))
);

-- Columnas añadidas después de la primera versión (datos del cliente, cómo
-- contactarle y cómo entrega el artículo). ADD COLUMN IF NOT EXISTS hace
-- seguro volver a ejecutar este archivo tanto si la tabla es nueva como si
-- ya existía con la versión anterior.
alter table public.sell_requests add column if not exists nombre text not null default '';
alter table public.sell_requests add column if not exists apellido text not null default '';
alter table public.sell_requests add column if not exists metodo_contacto text;
alter table public.sell_requests add column if not exists opcion_venta text not null default 'domicilio';
alter table public.sell_requests add column if not exists direccion text;
alter table public.sell_requests add column if not exists disponibilidad text;
alter table public.sell_requests add column if not exists mayor_edad boolean not null default false;
alter table public.sell_requests add column if not exists genero text not null default 'masculino';

alter table public.sell_requests drop constraint if exists sell_requests_metodo_contacto_check;
alter table public.sell_requests add constraint sell_requests_metodo_contacto_check
  check (metodo_contacto is null or metodo_contacto in ('whatsapp', 'gmail', 'instagram', 'facebook', 'tiktok'));

alter table public.sell_requests drop constraint if exists sell_requests_opcion_venta_check;
alter table public.sell_requests add constraint sell_requests_opcion_venta_check
  check (opcion_venta in ('domicilio', 'entrega'));

alter table public.sell_requests drop constraint if exists sell_requests_disponibilidad_check;
alter table public.sell_requests add constraint sell_requests_disponibilidad_check
  check (disponibilidad is null or disponibilidad in ('manana', 'mediodia', 'tardenoche'));

alter table public.sell_requests drop constraint if exists sell_requests_genero_check;
alter table public.sell_requests add constraint sell_requests_genero_check
  check (genero in ('masculino', 'femenino'));

create index if not exists sell_requests_status_idx
  on public.sell_requests (status);

create index if not exists sell_requests_created_at_idx
  on public.sell_requests (created_at desc);

-- updated_at automático en cada UPDATE ------------------------------------
create or replace function public.set_sell_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sell_requests_updated_at on public.sell_requests;

create trigger trg_sell_requests_updated_at
  before update on public.sell_requests
  for each row
  execute function public.set_sell_requests_updated_at();

-- Row Level Security ---------------------------------------------------------
alter table public.sell_requests enable row level security;

drop policy if exists sell_requests_insert_public on public.sell_requests;
drop policy if exists sell_requests_select_admin on public.sell_requests;
drop policy if exists sell_requests_update_admin on public.sell_requests;
drop policy if exists sell_requests_delete_admin on public.sell_requests;

-- Cualquiera (incluso sin sesión) puede enviar una solicitud desde la web.
create policy sell_requests_insert_public
  on public.sell_requests
  for insert
  to anon, authenticated
  with check (true);

-- Solo administradores pueden ver, actualizar o borrar solicitudes.
create policy sell_requests_select_admin
  on public.sell_requests
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy sell_requests_update_admin
  on public.sell_requests
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy sell_requests_delete_admin
  on public.sell_requests
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- ============================================================
-- De: sell_request_media.sql — fotos/vídeo de cada solicitud (sell_request_media)
-- ============================================================
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

-- ============================================================
-- De: product_sales.sql — registro de ventas (product_sales) y admin_search_users
-- ============================================================
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
