-- ============================================================================
-- 05-usuarios-y-administracion.sql — Usuarios, administración y caja personal
-- ============================================================================
-- Qué contiene este archivo (tablas y funciones, una línea cada una):
-- - Bloque "do $$...$$" (promote_admin)  → convierte en admin al usuario del
--                                        email indicado dentro del bloque.
-- - public.admin_users_by_ids(ids)    → devuelve id/email/nombre de una
--                                        lista de usuarios (solo admin).
-- - personal_cash_state               → saldo de caja privado por usuario
--                                        (cash_on_hand), no usado todavía
--                                        por ninguna pantalla de la app.
--
-- IMPORTANTE: todo esto YA ESTÁ aplicado y funcionando en producción (en el
-- proyecto de Supabase de Videojuegos Zaragoza). NO hay que volver a
-- ejecutar nada de este archivo — está aquí solo como referencia y
-- documentación de lo que ya existe en la base de datos real.
--
-- OJO especial con promote_admin.sql: a diferencia del resto de bloques de
-- este archivo, ese script NO es un "correr sin pensar" — usa un email
-- concreto escrito a mano (ver el bloque de abajo) y NO se debe volver a
-- ejecutar tal cual sin cambiar antes ese email, o podría cambiar el rol de
-- otro usuario por error. Se deja aquí documentado tal y como se ejecutó la
-- vez que se usó, no como algo para repetir.
--
-- De qué archivos sueltos viene (nombres originales, por si buscas algo por
-- el nombre de antes):
--   promote_admin.sql, admin_users_by_ids.sql, personal_cash_state.sql
-- ============================================================================

-- ============================================================
-- De: promote_admin.sql — convertir un usuario en admin (bloque do $$...$$)
-- ============================================================
-- sql/promote_admin.sql
-- ---------------------------------------------------------------------------
-- Qué hace: convierte en administrador ('admin') al usuario cuyo email
-- indiques. Es la única forma de crear el primer admin: al registrarse,
-- todo el mundo entra como profiles.role = 'user' (ver sql/products.sql,
-- trigger on_auth_user_created) — nadie puede subirse el rol a sí mismo
-- desde la app (las políticas RLS de profiles solo dejan escribir "role" a
-- quien YA es admin).
--
-- IMPORTANTE — esto NO es como los demás archivos de sql/: no es idempotente
-- "de fábrica" para ejecutarlo sin pensar. Un script suelto anterior hacía
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users order by created_at desc limit 1)
-- es decir, "hazme admin al usuario más reciente" — si se vuelve a ejecutar
-- más adelante, promovería a admin a quien sea que se haya registrado
-- último en ese momento (¡puede que no sea quien tú quieres!). Por eso este
-- archivo pide el email en concreto: edita la línea que dice
-- 'CAMBIA_ESTE_EMAIL@ejemplo.com' antes de ejecutar, cada vez.
--
-- Cómo aplicarlo:
-- 1) Cambia el email de la línea de abajo por el del usuario que ya se
--    haya registrado en la app y que quieres convertir en admin.
-- 2) Ejecuta SOLO ese bloque (o el archivo entero) en el SQL Editor de
--    Supabase.
-- 3) Comprueba el resultado con la consulta final.
--
-- Conectado con: sql/products.sql (tabla profiles y su columna role).
-- ---------------------------------------------------------------------------

do $$
declare
  target_email text := 'CAMBIA_ESTE_EMAIL@ejemplo.com';
  target_id uuid;
begin
  select id into target_id from auth.users where email = target_email;

  if target_id is null then
    raise exception 'No existe ningún usuario registrado con el email %', target_email;
  end if;

  update public.profiles set role = 'admin' where id = target_id;

  raise notice 'Usuario % (id %) ahora es admin.', target_email, target_id;
end $$;

-- Comprobación: quién tiene rol admin ahora mismo.
select p.id, p.role, u.email
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'admin'
order by p.created_at desc;

-- ============================================================
-- De: admin_users_by_ids.sql — nombres reales por lista de id (admin_users_by_ids)
-- ============================================================
-- sql/admin_users_by_ids.sql
--
-- Qué hace: función para que app/admin/chats.tsx pueda mostrar el NOMBRE
-- REAL de cada cliente que ha abierto una conversación por un producto,
-- aunque esa persona todavía no haya escrito ni un solo mensaje (antes se
-- mostraba "Cliente" a secas en ese caso, porque el nombre solo se sabía
-- leyendo el remitente de sus propios mensajes en product_chat_messages).
--
-- Cómo funciona: auth.users no es legible directamente desde el cliente (ni
-- siquiera un admin), así que esta función security definer hace de puente
-- controlado: comprueba ella misma que quien llama es admin y, dada una
-- lista de user id (los customer_user_id de product_chats), devuelve
-- id/email/nombre de cada uno — nunca contraseñas ni nada más de la cuenta.
-- Mismo mecanismo que admin_search_users(q) en sql/product_sales.sql, pero
-- buscando por lista de id en vez de por texto libre.
--
-- Cómo ejecutarlo: pégalo entero en el SQL Editor de Supabase (proyecto de
-- Videojuegos Zaragoza) y dale a "Run", DESPUÉS de sql/products.sql (usa
-- public.is_admin()). Se puede ejecutar más de una vez sin problema.

create or replace function public.admin_users_by_ids(ids uuid[])
returns table (id uuid, email text, full_name text, username text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede consultar usuarios.';
  end if;

  return query
  select
    u.id,
    u.email::text,
    coalesce(u.raw_user_meta_data ->> 'full_name', '') as full_name,
    coalesce(u.raw_user_meta_data ->> 'username', '') as username
  from auth.users u
  where u.id = any(ids);
end;
$$;

grant execute on function public.admin_users_by_ids(uuid[]) to authenticated;

-- ============================================================
-- De: personal_cash_state.sql — saldo de caja personal (personal_cash_state)
-- ============================================================
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
