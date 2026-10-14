-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: puente VeoAura → tienda (escaparate)
-- Qué hace: lo que necesita el receptor api/escaparate-veoaura.ts para cumplir el contrato
--           «Puente VeoAura → VideojuegosZaragoza (escaparate)»:
--   1. products.id_veoaura (único): el mismo artículo de VeoAura siempre es el mismo
--      producto de la tienda (se actualiza, nunca se duplica). products.vendido_en: cuándo
--      avisó VeoAura de que se vendió (el producto queda inactivo, no comprable).
--   2. escaparate_nonces: nonces ya usados, para rechazar un mensaje repetido en los
--      10 minutos siguientes. Solo el servidor (RLS sin políticas).
--   3. escaparate_registro: registro de cada mensaje (fecha, evento, id_veoaura, resultado);
--      nunca la firma ni el secreto. Solo lo lee el admin.
-- Las dos aplicaciones siguen separadas: aquí no hay nada de VeoAura salvo su id de artículo.
-- Tipo:     aditiva. No borra datos.
-- ============================================================================

alter table public.products
  add column if not exists id_veoaura uuid,
  add column if not exists vendido_en timestamptz;

create unique index if not exists products_id_veoaura_key on public.products (id_veoaura);

create table if not exists public.escaparate_nonces (
  nonce text primary key check (nonce ~ '^[0-9a-f]{32}$'),
  usado_en timestamptz not null default now()
);

-- Sin políticas: solo el servidor de la tienda (clave de servidor) la lee y la escribe.
alter table public.escaparate_nonces enable row level security;

create table if not exists public.escaparate_registro (
  id bigint generated always as identity primary key,
  recibido_en timestamptz not null default now(),
  evento text,
  id_veoaura text,
  resultado text not null,
  http integer,
  detalle text check (detalle is null or char_length(detalle) <= 300)
);

create index if not exists escaparate_registro_fecha_idx on public.escaparate_registro (recibido_en desc);

alter table public.escaparate_registro enable row level security;

create policy escaparate_registro_admin_select on public.escaparate_registro
  for select to authenticated using ((select public.is_admin()));
