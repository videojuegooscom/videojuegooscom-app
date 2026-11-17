-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: alquiler de artículos, FASE 2 (dueño, 2026-11-17): la Administración del día a día de unidades y alquileres.
-- SIGUE APAGADO: ningún cliente ve nada. Lo que necesita el panel para hacerlo bien:
--   1) public.alquiler_unidades.categoria_anterior_id: la categoría que tenía el artículo antes de pasarlo «Para alquilar»
--      (Productos), para devolverlo a ella con «Pasar a la venta» (Alquileres). Si la categoría se borra, queda vacía y el
--      dueño elige otra.
--   2) public.alquiler_pagos: el registro de cada cobro (alquiler, renovación, recargo y compra tras el alquiler) con su
--      importe, cómo se cobró (efectivo, Bizum, Stripe o de la fianza), su referencia, la hora y quién lo apuntó (los pone la
--      base de datos). Sirve para los ingresos del mes y las renovaciones de Alquileres y Analítica. Reglas (RLS): solo el
--      administrador lo lee y lo apunta; nadie lo cambia ni lo borra (no hay reglas para eso).
--   3) public.alquileres: el recargo y el descuento JUNTOS nunca pasan de la fianza, y un descuento de la fianza siempre
--      lleva su motivo (lo verá el cliente). Y deja escrito qué es cambio_product_id: en el cambio de unidad del plan de 4
--      meses, la unidad DEVUELTA (product_id pasa a ser la entregada).
-- Qué hace: completa la base de datos del alquiler para la fase 2, sin activarlo.
-- Conectado con: app/admin/alquileres.tsx, app/admin/products.tsx («Para alquilar»), app/admin/analytics.tsx (bloque
--           «Alquiler»), supabase/migrations/20261117100000_alquiler_base.sql (fase 1), pruebas/perfiles-sql.mjs y
--           pruebas/perfil-datos.mjs (sección ALQ2).
-- Tipo:     SOLO AÑADE (una columna, una tabla con sus reglas, una función de disparador normal sin permisos especiales y dos
--           comprobaciones). No borra filas ni columnas ni cambia permisos existentes. Se puede aplicar varias veces.
-- ============================================================================

-- 1) La categoría de antes de cada unidad ----------------------------------------------------------------------------
alter table public.alquiler_unidades add column if not exists categoria_anterior_id uuid
  references public.categories (id) on delete set null;

comment on column public.alquiler_unidades.categoria_anterior_id is
  'Categoría del artículo antes de pasarlo a alquiler (Productos → «Para alquilar»); «Pasar a la venta» lo devuelve a ella.';

-- 2) Registro de cobros --------------------------------------------------------------------------------------------------
create table if not exists public.alquiler_pagos (
  id uuid primary key default gen_random_uuid(),
  alquiler_id uuid not null references public.alquileres (id),
  concepto text not null check (concepto in ('alquiler', 'renovacion', 'recargo', 'compra')),
  meses smallint check (meses is null or meses between 1 and 12),
  importe_eur numeric(10, 2) not null check (importe_eur > 0 and importe_eur <= 100000),
  modo text not null check (modo in ('efectivo', 'bizum', 'stripe', 'fianza')),
  referencia text check (referencia is null or char_length(referencia) <= 300),
  creado_en timestamptz not null default now(),
  creado_por uuid default auth.uid()
);

create index if not exists alquiler_pagos_alquiler_idx on public.alquiler_pagos (alquiler_id);
create index if not exists alquiler_pagos_fecha_idx on public.alquiler_pagos (creado_en desc);

alter table public.alquiler_pagos enable row level security;

-- La hora y quién lo apunta los pone la base de datos (lo que mande el navegador no cuenta).
create or replace function public.alquiler_pagos_validar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.creado_en := now();
  new.creado_por := auth.uid();
  new.referencia := nullif(btrim(coalesce(new.referencia, '')), '');
  return new;
end;
$$;

-- El disparador, las reglas del registro y 3) la fianza: recargo más descuento como mucho la fianza, y el descuento con
-- su motivo ----------------------------------------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'alquiler_pagos_validar' and tgrelid = 'public.alquiler_pagos'::regclass) then
    create trigger alquiler_pagos_validar
      before insert on public.alquiler_pagos
      for each row execute function public.alquiler_pagos_validar();
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'alquiler_pagos' and policyname = 'alquiler_pagos_admin_select') then
    create policy alquiler_pagos_admin_select on public.alquiler_pagos
      for select to authenticated using ((select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'alquiler_pagos' and policyname = 'alquiler_pagos_admin_insert') then
    create policy alquiler_pagos_admin_insert on public.alquiler_pagos
      for insert to authenticated with check ((select public.is_admin()));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'alquileres_fianza_suma_check' and conrelid = 'public.alquileres'::regclass) then
    alter table public.alquileres add constraint alquileres_fianza_suma_check
      check (fianza_descuento_eur + recargo_eur <= fianza_eur);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'alquileres_descuento_motivo_check' and conrelid = 'public.alquileres'::regclass) then
    alter table public.alquileres add constraint alquileres_descuento_motivo_check
      check (fianza_descuento_eur = 0 or char_length(btrim(coalesce(fianza_descuento_motivo, ''))) >= 3);
  end if;
end $$;

comment on column public.alquileres.cambio_product_id is
  'Cambio de unidad del plan de 4 meses: la unidad DEVUELTA. product_id pasa a ser la unidad entregada (así la regla de un alquiler en curso por unidad protege la nueva y la devuelta queda libre).';

comment on table public.alquiler_pagos is 'Alquiler: cada cobro (alquiler, renovación, recargo y compra) con su importe y cómo se cobró. Solo el administrador; nadie lo cambia ni lo borra.';
