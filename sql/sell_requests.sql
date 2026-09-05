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
