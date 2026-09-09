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
