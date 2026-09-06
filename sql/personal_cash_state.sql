-- sql/personal_cash_state.sql
-- ---------------------------------------------------------------------------
-- Qué hace: crea la tabla "personal_cash_state", una fila por usuario con un
-- saldo de caja ("cash_on_hand") que solo esa persona puede ver o cambiar.
--
-- Nota: en el código de la app (a fecha de este archivo) ningún archivo lee
-- ni escribe todavía esta tabla — no está conectada a ninguna pantalla. Se
-- deja documentada aquí, tal cual estaba creada en Supabase, por si es la
-- base de una función que aún no se ha construido en la app (p. ej. un
-- control de caja para el propio negocio). Si al final no se usa, se puede
-- borrar sin más con: drop table if exists public.personal_cash_state;
--
-- Cómo funciona: cada usuario autenticado solo puede ver, crear o actualizar
-- SU PROPIA fila (auth.uid() = user_id) — ni siquiera el admin tiene aquí un
-- acceso especial a las filas de otros, a diferencia de profiles/categories/
-- products. No hay política de borrado a propósito (normalmente no hace
-- falta poder borrar tu propio saldo).
--
-- Cómo aplicarlo: copia y ejecuta este archivo completo en el SQL Editor de
-- tu proyecto de Supabase (Dashboard → SQL Editor → New query → Run). Es
-- seguro volver a ejecutarlo. No depende de ningún otro archivo de sql/
-- salvo de que exista auth.users (siempre existe en Supabase).
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

create table if not exists public.personal_cash_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cash_on_hand numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_cash_state_cash_nonneg check (cash_on_hand >= 0)
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_personal_cash_state_updated_at on public.personal_cash_state;
create trigger trg_personal_cash_state_updated_at
  before update on public.personal_cash_state
  for each row
  execute function public.touch_updated_at();

alter table public.personal_cash_state enable row level security;

drop policy if exists "cash_select_own" on public.personal_cash_state;
drop policy if exists "cash_insert_own" on public.personal_cash_state;
drop policy if exists "cash_update_own" on public.personal_cash_state;

create policy "cash_select_own"
  on public.personal_cash_state
  for select
  using (auth.uid() = user_id);

create policy "cash_insert_own"
  on public.personal_cash_state
  for insert
  with check (auth.uid() = user_id);

create policy "cash_update_own"
  on public.personal_cash_state
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Grants mínimos: SOLO a "authenticated". Una versión anterior de este
-- script también se lo concedía a "anon" — en la práctica no suponía un
-- agujero (auth.uid() es NULL para peticiones sin sesión, así que RLS ya
-- bloqueaba el acceso igualmente), pero conceder permisos que nunca se van
-- a poder usar no aporta nada y solo genera confusión al leer los grants.
grant usage on schema public to authenticated;
grant select, insert, update on table public.personal_cash_state to authenticated;
