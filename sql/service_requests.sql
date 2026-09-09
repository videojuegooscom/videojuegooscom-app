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
