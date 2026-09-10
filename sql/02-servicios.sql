-- ============================================================================
-- 02-servicios.sql — Catálogo de servicios
-- ============================================================================
-- Qué contiene este archivo (tablas y funciones, una línea cada una):
-- - services                          → catálogo de servicios (reparación,
--                                        limpieza, mantenimiento...).
-- - public.increment_service_view(...) → suma 1 al contador de visitas de
--                                        un servicio (services.view_count).
-- - service_media                     → fotos de cada servicio.
-- - service_requests                  → solicitudes de "Contratar servicio
--                                        ahora" que rellenan los clientes.
--
-- IMPORTANTE: todo esto YA ESTÁ aplicado y funcionando en producción (en el
-- proyecto de Supabase de Videojuegos Zaragoza). NO hay que volver a
-- ejecutar nada de este archivo — está aquí solo como referencia y
-- documentación de lo que ya existe en la base de datos real.
--
-- De qué archivos sueltos viene (nombres originales, por si buscas algo por
-- el nombre de antes):
--   services.sql, service_media.sql, service_requests.sql
-- ============================================================================

-- ============================================================
-- De: services.sql — catálogo de servicios (services)
-- ============================================================
-- sql/services.sql
-- ---------------------------------------------------------------------------
-- Qué hace: crea la tabla "services" — el catálogo de SERVICIOS de la tienda
-- (reparación, limpieza, mantenimiento...), gestionado desde
-- app/admin/services.tsx exactamente igual que "Categorías"/"Productos" se
-- gestionan desde sus propias pantallas. Es la contraparte de
-- sql/products.sql pero para servicios: mismo patrón (título, descripción,
-- precio, estado, fotos), sin nada relacionado con stock/cesta/condición de
-- segunda mano, porque un servicio no es un artículo que se agota.
--
-- Cómo funciona:
-- - Mismo esquema de visibilidad que products: el público (sin sesión) solo
--   ve servicios con status='PUBLISHED' + is_active=true; un admin ve y
--   gestiona todo (reutiliza public.is_admin(), definida en sql/products.sql
--   — este script debe ejecutarse DESPUÉS de ese).
-- - view_count: contador REAL de visitas a la ficha de cada servicio, mismo
--   mecanismo que products.view_count (ver sql/product_views.sql) vía
--   increment_service_view().
-- - La categoría "Reparación/Limpieza" de Inicio (app/(tabs)/index.tsx) deja
--   de abrir WhatsApp directamente y en su lugar lleva a app/servicios.tsx,
--   el catálogo de estos servicios.
--
-- Cómo aplicarlo: copia y ejecuta este archivo completo en el SQL Editor de
-- tu proyecto de Supabase (Dashboard → SQL Editor → New query → Run) DESPUÉS
-- de sql/products.sql (usa public.is_admin() y public.touch_updated_at()).
-- Es seguro volver a ejecutarlo.
--
-- Conectado con:
-- - sql/service_media.sql → fotos de cada servicio (service_media.service_id
--   apunta a services.id). Reutiliza el mismo bucket de Storage
--   "product-media" (no hace falta uno nuevo: las políticas de ese bucket ya
--   permiten a cualquier admin subir/editar/borrar y a cualquiera leer, sin
--   mirar la ruta del archivo).
-- - sql/service_requests.sql → solicitudes de "Contratar servicio ahora".
-- - app/admin/services.tsx → gestiona esta tabla desde el panel.
-- - app/servicios.tsx, app/servicio/[id].tsx → muestran servicios publicados
--   al público.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  price_eur int not null default 0,
  status text not null default 'DRAFT',
  is_active boolean not null default true,
  view_count integer not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.services drop constraint if exists services_status_check;
alter table public.services add constraint services_status_check
  check (status in ('DRAFT', 'PUBLISHED', 'REVIEW'));

drop trigger if exists trg_services_updated on public.services;
create trigger trg_services_updated
  before update on public.services
  for each row
  execute function public.touch_updated_at();

create index if not exists idx_services_status
  on public.services (status);

alter table public.services enable row level security;

drop policy if exists "services_select_public_or_admin" on public.services;
drop policy if exists "services_admin_insert" on public.services;
drop policy if exists "services_admin_update" on public.services;
drop policy if exists "services_admin_delete" on public.services;

create policy "services_select_public_or_admin"
  on public.services
  for select
  using ((status = 'PUBLISHED' and is_active = true) or public.is_admin());

create policy "services_admin_insert"
  on public.services
  for insert
  with check (public.is_admin());

create policy "services_admin_update"
  on public.services
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "services_admin_delete"
  on public.services
  for delete
  using (public.is_admin());

grant select on table public.services to anon, authenticated;

-- --- Contador de visitas REAL (mismo patrón que sql/product_views.sql) -----
create or replace function public.increment_service_view(service_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count int;
begin
  update public.services
  set view_count = view_count + 1
  where id = service_id
  returning view_count into new_count;

  return new_count;
end;
$$;

grant execute on function public.increment_service_view(uuid) to anon, authenticated;

-- ============================================================
-- De: service_media.sql — fotos de cada servicio (service_media)
-- ============================================================
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

-- ============================================================
-- De: service_requests.sql — solicitudes de "Contratar servicio ahora"
-- ============================================================
-- sql/service_requests.sql
-- ---------------------------------------------------------------------------
-- Qué hace: crea la tabla "service_requests" donde se guardan los
-- formularios de "Contratar servicio ahora" que rellenan los clientes desde
-- la ficha de un servicio (ver components/ContratarServicioModal.tsx). Es la
-- contraparte de sql/sell_requests.sql (el formulario de "Vender ahora")
-- pero para contratar un servicio en vez de vender un artículo: mismo
-- mecanismo (guardado directo en Supabase, sin email), con los datos propios
-- de "contratar" en vez de "vender" (qué servicio, cuándo, dónde) y sin los
-- campos que no aplican aquí (artículo, si funciona bien, precio esperado).
--
-- Cómo funciona: cualquier persona (incluso sin sesión, rol "anon") puede
-- INSERTAR una solicitud, porque el formulario es público. Solo un admin
-- puede leer, actualizar o borrar filas — se revisan desde
-- app/admin/services.tsx (pestaña "Solicitudes"). Un trigger mantiene
-- "updated_at" al día en cada UPDATE.
--
-- service_title es una "foto fija" del nombre del servicio en el momento de
-- la solicitud (igual que product_title en sql/product_sales.sql): si el
-- servicio se edita o se borra más adelante, la solicitud ya guardada sigue
-- mostrando qué pidió el cliente de verdad. service_id se queda a NULL si el
-- servicio se borra (no se pierde la solicitud).
--
-- Cómo aplicarlo: copia y ejecuta este archivo completo en el SQL Editor de
-- tu proyecto de Supabase (Dashboard → SQL Editor → New query → Run) DESPUÉS
-- de sql/services.sql (referencia services.id) y sql/products.sql (usa
-- public.profiles para las políticas de admin). Es seguro volver a
-- ejecutarlo.
--
-- Conectado con:
-- - components/ContratarServicioModal.tsx → hace el INSERT público al
--   enviar el formulario.
-- - sql/services.sql → service_requests.service_id apunta a services.id.
-- - app/admin/services.tsx → lee, actualiza el estado y borra filas.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  service_id uuid references public.services(id) on delete set null,
  service_title text not null,

  -- Datos del cliente (ver ContratarServicioModal.tsx):
  nombre text not null,
  apellido text not null,
  metodo_contacto text,
  contacto text,
  ciudad text not null,
  direccion text,
  disponibilidad text,
  comentario text,

  -- Flujo de trabajo interno del panel admin:
  status text not null default 'nuevo',
  nota_admin text,

  constraint service_requests_status_check
    check (status in ('nuevo', 'revisado', 'contactado', 'descartado'))
);

alter table public.service_requests drop constraint if exists service_requests_metodo_contacto_check;
alter table public.service_requests add constraint service_requests_metodo_contacto_check
  check (metodo_contacto is null or metodo_contacto in ('whatsapp', 'gmail', 'instagram', 'facebook', 'tiktok'));

alter table public.service_requests drop constraint if exists service_requests_disponibilidad_check;
alter table public.service_requests add constraint service_requests_disponibilidad_check
  check (disponibilidad is null or disponibilidad in ('manana', 'mediodia', 'tardenoche'));

create index if not exists service_requests_status_idx
  on public.service_requests (status);

create index if not exists service_requests_created_at_idx
  on public.service_requests (created_at desc);

create or replace function public.set_service_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_service_requests_updated_at on public.service_requests;

create trigger trg_service_requests_updated_at
  before update on public.service_requests
  for each row
  execute function public.set_service_requests_updated_at();

-- Row Level Security ---------------------------------------------------------
alter table public.service_requests enable row level security;

drop policy if exists service_requests_insert_public on public.service_requests;
drop policy if exists service_requests_select_admin on public.service_requests;
drop policy if exists service_requests_update_admin on public.service_requests;
drop policy if exists service_requests_delete_admin on public.service_requests;

-- Cualquiera (incluso sin sesión) puede enviar una solicitud desde la web.
create policy service_requests_insert_public
  on public.service_requests
  for insert
  to anon, authenticated
  with check (true);

-- Solo administradores pueden ver, actualizar o borrar solicitudes.
create policy service_requests_select_admin
  on public.service_requests
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy service_requests_update_admin
  on public.service_requests
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

create policy service_requests_delete_admin
  on public.service_requests
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );
