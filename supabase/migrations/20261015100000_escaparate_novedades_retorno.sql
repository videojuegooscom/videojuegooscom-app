-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: sacar más provecho al puente con VeoAura
-- Qué hace:
--   1. products.novedad_en: desde cuándo es «nuevo» en la tienda (al crearlo o al volver a
--      ponerlo a la venta). Lo usan el estante «Recién llegado», los avisos de novedades,
--      «Avísame cuando llegue» y Blue IA. Los productos que ya había se quedan con su fecha
--      de creación.
--   2. preferencias_usuario.avisos_novedades / novedades_vistas_hasta: el cliente decide si
--      Blue le avisa de los artículos nuevos (apagado por defecto) y hasta cuándo los vio.
--   3. avisos_busqueda: «Avísame cuando llegue». Cada cliente con sesión guarda hasta 10
--      búsquedas; solo ve, cambia y quita las suyas.
--   4. escaparate_salida: puente de vuelta tienda → VeoAura. Cada artículo de VeoAura pedido
--      en la tienda (y su anulación) se apunta aquí y api/escaparate-retorno.ts lo envía
--      firmado a VeoAura. Sin datos del cliente. Solo lo lee el admin.
-- Tipo:     aditiva. No borra datos.
-- ============================================================================

-- 1. Novedad
alter table public.products
  add column if not exists novedad_en timestamptz;

update public.products
set novedad_en = coalesce(created_at, now())
where novedad_en is null;

alter table public.products
  alter column novedad_en set default now();

create index if not exists products_novedad_en_idx on public.products (novedad_en desc);

-- 2. Avisos de novedades (cada usuario, su fila; las políticas ya existen)
alter table public.preferencias_usuario
  add column if not exists avisos_novedades boolean not null default false,
  add column if not exists novedades_vistas_hasta timestamptz;

-- 3. «Avísame cuando llegue»
create table if not exists public.avisos_busqueda (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  texto text not null check (char_length(btrim(texto)) between 2 and 60),
  created_at timestamptz not null default now(),
  visto_hasta timestamptz not null default now()
);

create index if not exists avisos_busqueda_user_idx on public.avisos_busqueda (user_id);

alter table public.avisos_busqueda enable row level security;

create policy avisos_busqueda_select on public.avisos_busqueda
  for select to authenticated using (user_id = (select auth.uid()));
create policy avisos_busqueda_insert on public.avisos_busqueda
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy avisos_busqueda_update on public.avisos_busqueda
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy avisos_busqueda_delete on public.avisos_busqueda
  for delete to authenticated using (user_id = (select auth.uid()));

-- El aviso siempre es del que lo crea y como mucho 10 por persona.
create or replace function public.avisos_busqueda_antes_de_crear()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  if new.user_id is null then
    raise exception 'inicia sesión para crear avisos';
  end if;
  new.texto := btrim(new.texto);
  new.created_at := now();
  new.visto_hasta := now();
  if (select count(*) from public.avisos_busqueda a where a.user_id = new.user_id) >= 10 then
    raise exception 'como mucho 10 avisos';
  end if;
  return new;
end;
$$;

create trigger avisos_busqueda_antes_de_crear
  before insert on public.avisos_busqueda
  for each row execute function public.avisos_busqueda_antes_de_crear();

-- 4. Puente de vuelta tienda → VeoAura
create table if not exists public.escaparate_salida (
  id uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null default now(),
  evento text not null check (evento in ('pedido', 'pedido_anulado')),
  id_veoaura uuid not null,
  pedido_id uuid not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviando', 'enviado', 'error', 'descartado')),
  intentos integer not null default 0,
  ultimo_intento timestamptz,
  enviado_en timestamptz,
  detalle text check (detalle is null or char_length(detalle) <= 300),
  unique (pedido_id, id_veoaura, evento)
);

create index if not exists escaparate_salida_estado_idx on public.escaparate_salida (estado, creado_en);

alter table public.escaparate_salida enable row level security;

create policy escaparate_salida_admin_select on public.escaparate_salida
  for select to authenticated using ((select public.is_admin()));
