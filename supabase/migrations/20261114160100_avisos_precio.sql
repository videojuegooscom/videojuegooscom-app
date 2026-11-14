-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: «Avísame si baja de precio» en la ficha del producto (dueño, 2026-11-14, mejora 5). SOLO CON CUENTA.
--   1) public.avisos_precio: una fila por cliente y producto que sigue, con el precio que tenía al activarlo
--      (precio_inicial, lo pone la base de datos con el de products: nadie lo elige) y el último precio del que Blue ya le
--      avisó (precio_avisado). Blue avisa cuando el precio baja del más bajo de los dos, una vez por bajada.
--   2) El disparador (sin permisos especiales, con los de quien llama) pone de quién es (la sesión), el precio y la hora;
--      no deja seguir un producto que no está a la venta ni más de 50 por cliente; al cambiar una fila solo se puede
--      cambiar precio_avisado (ni el producto, ni el dueño, ni el precio inicial).
--   3) Reglas (RLS): cada cliente crea, lee, cambia y quita SOLO sus filas; el administrador las lee todas (recuentos por
--      producto en Analítica y lo que sigue cada cliente en su ficha); nadie cambia las de otro. Visitantes: nada.
--   4) Privacidad: una frase en «Para qué usamos tus datos», una sola vez.
-- Qué hace: guarda qué productos sigue cada cliente para avisarle si bajan de precio.
-- Conectado con: public.products, public.is_admin(); app/producto/[id].tsx (interruptor), components/Campanita.tsx (Blue
--           avisa), app/(tabs)/perfil.tsx («Avisos de precio» en Me gusta), app/admin/analytics.tsx («Avisos de bajada de
--           precio»), app/admin/cliente/[userId].tsx, pruebas/perfiles-sql.mjs y pruebas/perfil-datos.mjs (sección SEGP).
-- Tipo:     SOLO AÑADE (una tabla con sus reglas, una función de disparador normal y una frase de la privacidad). No borra
--           filas ni columnas ni cambia permisos existentes. Se puede aplicar varias veces: repetirla no cambia nada.
-- ============================================================================

create table if not exists public.avisos_precio (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  product_id uuid not null references public.products (id) on delete cascade,
  precio_inicial numeric(10, 2) not null check (precio_inicial > 0),
  precio_avisado numeric(10, 2) check (precio_avisado is null or precio_avisado > 0),
  creado_en timestamptz not null default now(),
  unique (user_id, product_id)
);

create index if not exists avisos_precio_producto_idx on public.avisos_precio (product_id);

alter table public.avisos_precio enable row level security;

create or replace function public.avisos_precio_normalizar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_precio numeric;
begin
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    if new.user_id is null then
      raise exception 'Inicia sesión para activar los avisos de precio.' using errcode = 'P0001';
    end if;
    select p.price_eur into v_precio from public.products p
     where p.id = new.product_id and p.status = 'PUBLISHED' and p.is_active;
    if v_precio is null or v_precio <= 0 then
      raise exception 'Ese producto no está a la venta.' using errcode = 'P0001';
    end if;
    if (select count(*) from public.avisos_precio a where a.user_id = new.user_id) >= 50 then
      raise exception 'Como mucho 50 avisos de precio.' using errcode = 'P0001';
    end if;
    new.precio_inicial := v_precio;
    new.precio_avisado := null;
    new.creado_en := now();
    return new;
  end if;
  new.id := old.id;
  new.user_id := old.user_id;
  new.product_id := old.product_id;
  new.precio_inicial := old.precio_inicial;
  new.creado_en := old.creado_en;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'avisos_precio_normalizar' and tgrelid = 'public.avisos_precio'::regclass) then
    create trigger avisos_precio_normalizar
      before insert or update on public.avisos_precio
      for each row execute function public.avisos_precio_normalizar();
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'avisos_precio' and policyname = 'avisos_precio_select') then
    create policy avisos_precio_select on public.avisos_precio
      for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'avisos_precio' and policyname = 'avisos_precio_insert_propio') then
    create policy avisos_precio_insert_propio on public.avisos_precio
      for insert to authenticated with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'avisos_precio' and policyname = 'avisos_precio_update_propio') then
    create policy avisos_precio_update_propio on public.avisos_precio
      for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'avisos_precio' and policyname = 'avisos_precio_quitar_propio') then
    create policy avisos_precio_quitar_propio on public.avisos_precio
      for delete to authenticated using (user_id = (select auth.uid()));
  end if;
end $$;

comment on table public.avisos_precio is '«Avísame si baja de precio»: qué productos sigue cada cliente (solo con cuenta), con el precio al activarlo y el último del que Blue ya le avisó.';

-- Privacidad: en «Para qué usamos tus datos», al final, una sola vez (si el apartado no está, no cambia nada).
update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Para qué usamos tus datos'
                   then jsonb_set(s.sec, '{body}', to_jsonb(
                     rtrim(s.sec ->> 'body') || ' Si activas «Avísame si baja de precio» en un artículo, guardamos ese artículo y su precio unidos a tu cuenta para avisarte si baja; puedes quitarlo cuando quieras en Mi perfil y solo lo ves tú y la tienda.'
                   ))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'privacidad'
  and exists (
    select 1 from jsonb_array_elements(p.sections) as s (sec)
    where s.sec ->> 'heading' = 'Para qué usamos tus datos'
      and s.sec ->> 'body' not like '%Avísame si baja de precio%'
  );
