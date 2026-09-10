-- ============================================================================
-- 06-inventario.sql — Inventario interno del panel admin
-- ============================================================================
-- Qué contiene este archivo (tabla, una línea):
-- - inventory_items                   → inventario interno real del panel
--                                        admin (código, título y estado de
--                                        cada unidad física en gestión).
--
-- IMPORTANTE: todo esto YA ESTÁ aplicado y funcionando en producción (en el
-- proyecto de Supabase de Videojuegos Zaragoza). NO hay que volver a
-- ejecutar nada de este archivo — está aquí solo como referencia y
-- documentación de lo que ya existe en la base de datos real.
--
-- De qué archivo suelto viene (nombre original, por si buscas algo por el
-- nombre de antes):
--   inventory_items.sql (único archivo de origen, re-encabezado aquí solo
--   por coherencia con el resto de archivos consolidados)
-- ============================================================================

-- ============================================================
-- De: inventory_items.sql — inventario interno (inventory_items)
-- ============================================================
-- sql/inventory_items.sql
-- ---------------------------------------------------------------------------
-- Qué hace: crea la tabla "inventory_items", el inventario interno real del
-- panel admin (app/admin/inventario.tsx). Antes esa pantalla solo mostraba
-- 3 artículos de ejemplo fijos en el código (MOCK); ahora lee y escribe en
-- esta tabla como el resto del panel (categorías, productos, cotizaciones).
--
-- Cómo funciona:
-- - Cada fila es una unidad física en gestión interna (una consola, un
--   mando...), identificada por un código corto ("001", "002"...) y un
--   título, con un estado de tres posibles: TO_REVIEW (por revisar),
--   READY_TO_LIST (listo para publicar) o IN_REPAIR (en reparación).
-- - Es una tabla puramente interna: no la ve nadie salvo un admin (a
--   diferencia de categories/products, aquí no hay política de lectura
--   pública). Usa el mismo helper is_admin() que ya usan categories y
--   products (definido en sql/products.sql, que debe ejecutarse antes que
--   este archivo si aún no existe en tu proyecto).
-- - No está enlazada todavía con "products" ni con "sell_requests": es una
--   lista de gestión de stock independiente, tal y como se pidió. Se puede
--   conectar más adelante si hace falta.
--
-- Cómo aplicarlo: copia y ejecuta este archivo completo en el SQL Editor de
-- tu proyecto de Supabase (Dashboard → SQL Editor → New query → Run), después
-- de haber ejecutado sql/products.sql al menos una vez. Es seguro volver a
-- ejecutarlo cuando quieras (usa IF NOT EXISTS / DROP...IF EXISTS en todo lo
-- que puede chocar).
--
-- Conectado con:
-- - sql/products.sql → de aquí vienen public.is_admin() y
--   public.touch_updated_at(), que reutiliza esta tabla.
-- - app/admin/inventario.tsx → lee, crea, edita y borra filas de esta tabla.
-- - app/admin/index.tsx → tarjeta "Inventario" que lleva a esa pantalla.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  title text not null,
  status text not null default 'TO_REVIEW',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inventory_items drop constraint if exists inventory_items_status_check;
alter table public.inventory_items add constraint inventory_items_status_check
  check (status in ('TO_REVIEW', 'READY_TO_LIST', 'IN_REPAIR'));

drop trigger if exists trg_inventory_items_updated on public.inventory_items;
create trigger trg_inventory_items_updated
  before update on public.inventory_items
  for each row
  execute function public.touch_updated_at();

create index if not exists idx_inventory_items_status
  on public.inventory_items (status);

create index if not exists idx_inventory_items_created_at
  on public.inventory_items (created_at desc);

-- Row Level Security ---------------------------------------------------------
alter table public.inventory_items enable row level security;

drop policy if exists "inventory_items_admin_select" on public.inventory_items;
drop policy if exists "inventory_items_admin_insert" on public.inventory_items;
drop policy if exists "inventory_items_admin_update" on public.inventory_items;
drop policy if exists "inventory_items_admin_delete" on public.inventory_items;

-- Solo un admin puede ver o gestionar el inventario interno (no es público).
create policy "inventory_items_admin_select"
  on public.inventory_items
  for select
  to authenticated
  using (public.is_admin());

create policy "inventory_items_admin_insert"
  on public.inventory_items
  for insert
  to authenticated
  with check (public.is_admin());

create policy "inventory_items_admin_update"
  on public.inventory_items
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "inventory_items_admin_delete"
  on public.inventory_items
  for delete
  to authenticated
  using (public.is_admin());

-- Grants mínimos --------------------------------------------------------
-- RLS ya manda (esto solo evita "permission denied" raros a nivel de tabla).
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.inventory_items to authenticated;
