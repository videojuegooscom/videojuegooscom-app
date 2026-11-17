-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: alquiler de artículos, FASE 1 (dueño, 2026-11-17). APAGADO: ningún cliente ve nada hasta que el dueño lo
-- active con el contrato revisado por su gestor. Solo Zaragoza. Planes de 1, 2, 3 y 4 meses con el IVA incluido, fianza
-- sin IVA, recargo por retraso con un día de cortesía y tope en la fianza, y «Alquílalo y, si te gusta, cómpralo».
--   1) public.alquiler_ajustes: UNA fila (id = 1) con el interruptor (activo, por defecto false), los cuatro porcentajes
--      del precio de venta (10, 18, 25 y 33 %: con una PS5 de 550 € dan 54,90 €, 99 €, 139 € y 179 € con el redondeo de
--      public.alquiler_redondear), la fianza (150 €, sin IVA) y su modo de cobro ('entrega': en efectivo o Bizum en la
--      entrega, por defecto; 'tarjeta': con tarjeta en la web), el recargo por día de retraso (3 €), los días de cortesía
--      (1), el «plus» de la compra tras el alquiler (50 €), los meses que se alquila como mucho cada unidad (3), el texto
--      del contrato (vacío) y «Revisado por mi gestor» (false). El disparador (normal, SIN permisos especiales, copia del de
--      reserva_ajustes) NO deja activar sin el contrato, sin la revisión del gestor o con notas internas del borrador
--      («[A DECIDIR», «NOTA PARA EL GESTOR», «PUNTO A REVISAR», «comprobar en el BOE», «BORRADOR», las dos variantes a la
--      vez o una marca {…} que no se rellene sola). Al apagarlo, la categoría «Alquílalo ahora» se oculta; al encenderlo, se
--      muestra. Reglas (RLS): el administrador la lee y la cambia; un cliente con sesión solo la lee cuando está activo.
--   2) public.products: modo ('venta' | 'alquiler', por defecto 'venta') y alquiler_precios (precios a mano por plan, p. ej.
--      {"1": 54.9, "4": 179}; sin él, se calcula con los porcentajes). El coste NO va en products (su lectura es pública):
--      va en public.alquiler_unidades, que solo lee y escribe el administrador (coste_eur, meses ya alquilada y nota).
--      Un artículo de alquiler no se puede comprar como venta normal (disparador de pedido_items; el administrador, sí).
--   3) public.alquileres: cada alquiler (cliente, artículo, plan, fechas, precios calculados POR LA BASE DE DATOS, fianza y
--      su estado, recargo, cambio de unidad del plan de 4 meses, compra tras el alquiler y la copia del contrato aceptado con
--      su huella SHA-256 y la hora, que pone la base de datos). Estados: reservado, pendiente_pago, activo, por_recoger,
--      revision, cerrado y cancelado; un solo alquiler en curso por unidad. Reglas (RLS): cada cliente lee y crea SOLO los
--      suyos (y solo con el alquiler activo, de un artículo de alquiler publicado y con los importes que pone el
--      disparador); el administrador los lee y los cambia todos. Nadie borra.
--   4) La categoría «Alquílalo ahora» (slug alquilalo-ahora), creada solo si no existe, OCULTA y al final del orden; no se
--      puede mostrar mientras el alquiler esté apagado.
-- Qué hace: prepara el alquiler sin activarlo.
-- Conectado con: lib/alquiler.ts (precios, recargo, compra tras alquiler y borrador del contrato), app/admin/alquileres.tsx,
--           docs/puente-veoaura-alquiler.md (lo que mandará VeoAura en la fase 3), pruebas/perfiles-sql.mjs y
--           pruebas/perfil-datos.mjs (sección ALQ1).
-- Tipo:     SOLO AÑADE (tres tablas con sus reglas, dos columnas, una categoría oculta, una función de cálculo y cinco
--           funciones de disparador normales). No borra filas ni columnas ni cambia permisos existentes. Se puede aplicar
--           varias veces: repetirla no cambia nada.
-- ============================================================================

-- 1) Ajustes (una fila, APAGADO) -------------------------------------------------------------------------------------
create table if not exists public.alquiler_ajustes (
  id smallint primary key default 1 check (id = 1),
  activo boolean not null default false,
  pct_1_mes numeric(5, 2) not null default 10 check (pct_1_mes > 0 and pct_1_mes <= 100),
  pct_2_meses numeric(5, 2) not null default 18 check (pct_2_meses > 0 and pct_2_meses <= 100),
  pct_3_meses numeric(5, 2) not null default 25 check (pct_3_meses > 0 and pct_3_meses <= 100),
  pct_4_meses numeric(5, 2) not null default 33 check (pct_4_meses > 0 and pct_4_meses <= 100),
  fianza_eur numeric(10, 2) not null default 150 check (fianza_eur >= 0 and fianza_eur <= 5000),
  fianza_modo text not null default 'entrega' check (fianza_modo in ('entrega', 'tarjeta')),
  recargo_dia_eur numeric(10, 2) not null default 3 check (recargo_dia_eur >= 0 and recargo_dia_eur <= 100),
  cortesia_dias integer not null default 1 check (cortesia_dias between 0 and 30),
  plus_compra_eur numeric(10, 2) not null default 50 check (plus_compra_eur >= 0 and plus_compra_eur <= 5000),
  meses_max_unidad integer not null default 3 check (meses_max_unidad between 1 and 24),
  texto_contrato text check (texto_contrato is null or char_length(texto_contrato) <= 30000),
  contrato_revisado boolean not null default false,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid
);

insert into public.alquiler_ajustes (id) values (1) on conflict (id) do nothing;

alter table public.alquiler_ajustes enable row level security;

create or replace function public.alquiler_ajustes_validar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_faltan text[] := '{}';
  v_notas text[] := '{}';
  v_texto text;
  v_marca text;
begin
  new.id := 1;
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  new.texto_contrato := nullif(btrim(coalesce(new.texto_contrato, '')), '');

  -- Activar solo con el contrato, revisado por el gestor y sin notas internas en lo que verá el cliente.
  if new.activo then
    v_texto := coalesce(new.texto_contrato, '');
    if new.texto_contrato is null then v_faltan := array_append(v_faltan, 'el texto del contrato'); end if;
    if not new.contrato_revisado then v_faltan := array_append(v_faltan, 'la revisión del gestor'); end if;
    if v_texto ilike '%pendiente de revisión del gestor%' then v_faltan := array_append(v_faltan, 'quitar la marca de borrador del texto'); end if;
    if strpos(upper(v_texto), '[A DECIDIR') > 0 then v_notas := array_append(v_notas, 'los huecos «[A DECIDIR…]»'); end if;
    if strpos(upper(v_texto), 'NOTA PARA EL GESTOR') > 0 then v_notas := array_append(v_notas, 'la «NOTA PARA EL GESTOR»'); end if;
    if strpos(upper(v_texto), 'PUNTO A REVISAR') > 0 then v_notas := array_append(v_notas, 'el «PUNTO A REVISAR»'); end if;
    if strpos(upper(v_texto), 'COMPROBAR EN EL BOE') > 0 then v_notas := array_append(v_notas, 'las notas «comprobar en el BOE»'); end if;
    if strpos(upper(v_texto), 'BORRADOR') > 0 then v_notas := array_append(v_notas, 'la palabra «BORRADOR»'); end if;
    if v_texto ~* '(^|[^[:alnum:]])variante[[:space:]]+a([^[:alnum:]]|$)' and v_texto ~* '(^|[^[:alnum:]])variante[[:space:]]+b([^[:alnum:]]|$)' then
      v_notas := array_append(v_notas, 'una de las dos variantes (dejar solo la VARIANTE A o la B)');
    end if;
    for v_marca in select distinct m[1] from regexp_matches(v_texto, '[{]([^{}]*)[}]', 'g') as m loop
      if v_marca not in ('articulo', 'plan_meses', 'precio_plan_eur', 'precio_venta_eur', 'fianza_eur', 'modo_fianza',
                         'recargo_dia_eur', 'cortesia_dias', 'plus_compra_eur', 'fecha_inicio', 'fecha_fin') then
        v_notas := array_append(v_notas, format('la marca «{%s}» (no se rellena sola)', v_marca));
      end if;
    end loop;
    if array_length(v_notas, 1) > 0 then
      v_faltan := array_append(v_faltan, 'quitar del texto del contrato ' || array_to_string(v_notas, ', '));
    end if;
    if array_length(v_faltan, 1) > 0 then
      raise exception 'Para activar el alquiler falta: %.', array_to_string(v_faltan, ', ') using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- Precio de un plan con el redondeo de la tienda: por debajo de 90 €, al «,90» más cercano (54,90 €); desde 90 €, al
-- entero acabado en 9 más cercano (99 €, 139 €, 179 €). La misma cuenta que redondearPrecioAlquiler de lib/alquiler.ts.
create or replace function public.alquiler_redondear(p_importe numeric)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_importe is null or p_importe <= 0 then 0::numeric
    when p_importe < 90 then greatest(round(p_importe - 0.9), 0) + 0.9
    else round((p_importe + 1) / 10) * 10 - 1
  end
$$;

-- 2) Artículos de alquiler ----------------------------------------------------------------------------------------------
alter table public.products add column if not exists modo text not null default 'venta'
  check (modo in ('venta', 'alquiler'));
alter table public.products add column if not exists alquiler_precios jsonb
  check (alquiler_precios is null or jsonb_typeof(alquiler_precios) = 'object');

-- Lo que solo ve el administrador de cada unidad (el coste no puede ir en products: su lectura es pública).
create table if not exists public.alquiler_unidades (
  product_id uuid primary key references public.products (id) on delete cascade,
  coste_eur numeric(10, 2) check (coste_eur is null or (coste_eur >= 0 and coste_eur <= 1000000)),
  meses_alquilada numeric(5, 2) not null default 0 check (meses_alquilada >= 0 and meses_alquilada <= 120),
  nota text check (nota is null or char_length(nota) <= 1000),
  actualizado_en timestamptz not null default now()
);

alter table public.alquiler_unidades enable row level security;

-- Un artículo de alquiler no se compra como venta normal (el administrador, sí).
create or replace function public.pedido_items_alquiler()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.product_id is not null
     and not coalesce(public.is_admin(), false)
     and exists (select 1 from public.products p where p.id = new.product_id and p.modo = 'alquiler') then
    raise exception 'Este artículo es de alquiler: no se puede comprar como venta.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- 3) Alquileres ---------------------------------------------------------------------------------------------------------
create table if not exists public.alquileres (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  product_id uuid references public.products (id) on delete set null,
  producto_titulo text check (producto_titulo is null or char_length(producto_titulo) <= 300),
  plan_meses smallint not null check (plan_meses between 1 and 4),
  estado text not null default 'reservado'
    check (estado in ('reservado', 'pendiente_pago', 'activo', 'por_recoger', 'revision', 'cerrado', 'cancelado')),
  precio_venta_eur numeric(10, 2) not null check (precio_venta_eur > 0),
  precio_plan_eur numeric(10, 2) not null check (precio_plan_eur > 0),
  pagado_alquiler_eur numeric(10, 2) not null default 0 check (pagado_alquiler_eur >= 0),
  fianza_eur numeric(10, 2) not null check (fianza_eur >= 0),
  fianza_modo text not null check (fianza_modo in ('entrega', 'tarjeta')),
  fianza_estado text not null default 'pendiente' check (fianza_estado in ('pendiente', 'cobrada', 'devuelta', 'descontada')),
  fianza_descuento_eur numeric(10, 2) not null default 0 check (fianza_descuento_eur >= 0),
  fianza_descuento_motivo text check (fianza_descuento_motivo is null or char_length(fianza_descuento_motivo) <= 500),
  recargo_eur numeric(10, 2) not null default 0 check (recargo_eur >= 0),
  inicio_en timestamptz,
  fin_previsto_en timestamptz,
  devuelto_en timestamptz,
  cambio_unidad_en timestamptz,
  cambio_product_id uuid references public.products (id) on delete set null,
  compra_eur numeric(10, 2) check (compra_eur is null or compra_eur > 0),
  comprado_en timestamptz,
  pago_modo text check (pago_modo is null or pago_modo in ('prueba', 'real', 'efectivo', 'bizum')),
  pago_referencia text check (pago_referencia is null or char_length(pago_referencia) <= 300),
  contrato_texto text not null check (char_length(btrim(contrato_texto)) between 1 and 30000),
  contrato_hash text not null check (contrato_hash ~ '^[0-9a-f]{64}$'),
  contrato_aceptado_en timestamptz not null default now(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (fianza_descuento_eur <= fianza_eur),
  check (recargo_eur <= fianza_eur)
);

create index if not exists alquileres_usuario_idx on public.alquileres (user_id);
create index if not exists alquileres_fecha_idx on public.alquileres (creado_en desc);
create unique index if not exists alquileres_uno_en_curso_idx on public.alquileres (product_id)
  where estado in ('reservado', 'pendiente_pago', 'activo', 'por_recoger', 'revision');

alter table public.alquileres enable row level security;

-- Lo que pone la base de datos: con la sesión de un cliente, el dueño, el estado inicial, los importes (del artículo y de
-- los ajustes) y la hora de aceptación; siempre, la huella SHA-256 del contrato. Al cambiarlo (solo el administrador o el
-- servidor), el contrato aceptado y su huella no cambian.
create or replace function public.alquileres_validar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_aj public.alquiler_ajustes%rowtype;
  v_titulo text;
  v_precio numeric;
  v_modo text;
  v_manuales jsonb;
  v_publicado boolean;
  v_pct numeric;
  v_manual numeric;
  v_confiable boolean := coalesce(public.is_admin(), false) or current_user not in ('anon', 'authenticated');
begin
  new.actualizado_en := now();
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.creado_en := old.creado_en;
    new.contrato_texto := old.contrato_texto;
    new.contrato_hash := old.contrato_hash;
    new.contrato_aceptado_en := old.contrato_aceptado_en;
    return new;
  end if;

  if not v_confiable then
    select * into v_aj from public.alquiler_ajustes where id = 1 and activo;
    if not found then
      raise exception 'El alquiler no está disponible en este momento.' using errcode = 'P0001';
    end if;
    select p.title, p.price_eur, p.modo, p.alquiler_precios, (p.status = 'PUBLISHED' and p.is_active)
      into v_titulo, v_precio, v_modo, v_manuales, v_publicado
      from public.products p where p.id = new.product_id;
    if not found or v_modo is distinct from 'alquiler' or not coalesce(v_publicado, false) or coalesce(v_precio, 0) <= 0 then
      raise exception 'Este artículo no está disponible para alquilar.' using errcode = 'P0001';
    end if;
    v_pct := case new.plan_meses when 1 then v_aj.pct_1_mes when 2 then v_aj.pct_2_meses when 3 then v_aj.pct_3_meses else v_aj.pct_4_meses end;
    if v_manuales is not null and jsonb_typeof(v_manuales -> new.plan_meses::text) = 'number' then
      v_manual := (v_manuales ->> new.plan_meses::text)::numeric;
    end if;
    new.user_id := auth.uid();
    new.estado := 'reservado';
    new.producto_titulo := v_titulo;
    new.precio_venta_eur := v_precio;
    new.precio_plan_eur := case when v_manual > 0 then round(v_manual, 2) else public.alquiler_redondear(v_precio * v_pct / 100) end;
    new.pagado_alquiler_eur := 0;
    new.fianza_eur := v_aj.fianza_eur;
    new.fianza_modo := v_aj.fianza_modo;
    new.fianza_estado := 'pendiente';
    new.fianza_descuento_eur := 0;
    new.fianza_descuento_motivo := null;
    new.recargo_eur := 0;
    new.inicio_en := null;
    new.fin_previsto_en := null;
    new.devuelto_en := null;
    new.cambio_unidad_en := null;
    new.cambio_product_id := null;
    new.compra_eur := null;
    new.comprado_en := null;
    new.pago_modo := null;
    new.pago_referencia := null;
    new.creado_en := now();
    new.contrato_aceptado_en := now();
  end if;
  new.contrato_texto := btrim(coalesce(new.contrato_texto, ''));
  new.contrato_hash := encode(sha256(convert_to(new.contrato_texto, 'UTF8')), 'hex');
  return new;
end;
$$;

-- 4) La categoría «Alquílalo ahora»: oculta mientras el alquiler esté apagado ------------------------------------------
insert into public.categories (name, slug, sort_order, is_active)
select 'Alquílalo ahora', 'alquilalo-ahora', coalesce((select max(c.sort_order) from public.categories c), 0) + 1, false
where not exists (select 1 from public.categories c where c.slug = 'alquilalo-ahora');

create or replace function public.categories_alquiler_oculta()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.slug = 'alquilalo-ahora' and new.is_active
     and not exists (select 1 from public.alquiler_ajustes a where a.id = 1 and a.activo) then
    raise exception 'La categoría «Alquílalo ahora» se muestra sola al activar el alquiler en Administración → Alquileres.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Al encender o apagar el alquiler, la categoría se muestra u oculta con él.
create or replace function public.alquiler_ajustes_categoria()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.activo is distinct from old.activo then
    update public.categories set is_active = new.activo where slug = 'alquilalo-ahora' and is_active is distinct from new.activo;
  end if;
  return null;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'alquiler_ajustes_validar' and tgrelid = 'public.alquiler_ajustes'::regclass) then
    create trigger alquiler_ajustes_validar
      before insert or update on public.alquiler_ajustes
      for each row execute function public.alquiler_ajustes_validar();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'alquiler_ajustes_categoria' and tgrelid = 'public.alquiler_ajustes'::regclass) then
    create trigger alquiler_ajustes_categoria
      after update on public.alquiler_ajustes
      for each row execute function public.alquiler_ajustes_categoria();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'alquileres_validar' and tgrelid = 'public.alquileres'::regclass) then
    create trigger alquileres_validar
      before insert or update on public.alquileres
      for each row execute function public.alquileres_validar();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'pedido_items_alquiler' and tgrelid = 'public.pedido_items'::regclass) then
    create trigger pedido_items_alquiler
      before insert on public.pedido_items
      for each row execute function public.pedido_items_alquiler();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'categories_alquiler_oculta' and tgrelid = 'public.categories'::regclass) then
    create trigger categories_alquiler_oculta
      before insert or update on public.categories
      for each row execute function public.categories_alquiler_oculta();
  end if;

  -- Ajustes: el administrador los lee y los cambia; un cliente con sesión solo los lee cuando el alquiler está activo.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'alquiler_ajustes' and policyname = 'alquiler_ajustes_select') then
    create policy alquiler_ajustes_select on public.alquiler_ajustes
      for select to authenticated using (activo or (select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'alquiler_ajustes' and policyname = 'alquiler_ajustes_admin_update') then
    create policy alquiler_ajustes_admin_update on public.alquiler_ajustes
      for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
  end if;

  -- Unidades (coste): solo el administrador.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'alquiler_unidades' and policyname = 'alquiler_unidades_admin_select') then
    create policy alquiler_unidades_admin_select on public.alquiler_unidades
      for select to authenticated using ((select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'alquiler_unidades' and policyname = 'alquiler_unidades_admin_insert') then
    create policy alquiler_unidades_admin_insert on public.alquiler_unidades
      for insert to authenticated with check ((select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'alquiler_unidades' and policyname = 'alquiler_unidades_admin_update') then
    create policy alquiler_unidades_admin_update on public.alquiler_unidades
      for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
  end if;

  -- Alquileres: cada cliente lee y crea los suyos; el administrador los lee y los cambia todos.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'alquileres' and policyname = 'alquileres_select') then
    create policy alquileres_select on public.alquileres
      for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'alquileres' and policyname = 'alquileres_insert') then
    create policy alquileres_insert on public.alquileres
      for insert to authenticated with check (user_id = (select auth.uid()) or (select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'alquileres' and policyname = 'alquileres_admin_update') then
    create policy alquileres_admin_update on public.alquileres
      for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
  end if;
end $$;

comment on table public.alquiler_ajustes is 'Alquiler: interruptor y reglas del dueño (una fila). Apagado hasta que el gestor revise el contrato.';
comment on table public.alquiler_unidades is 'Alquiler: datos internos de cada unidad (coste, meses ya alquilada). Solo el administrador.';
comment on table public.alquileres is 'Alquiler: cada alquiler con sus importes calculados por la base de datos y la copia del contrato aceptado.';
comment on column public.products.modo is 'venta (lo de siempre) o alquiler (unidad de la categoría «Alquílalo ahora»; no se compra como venta).';
comment on column public.products.alquiler_precios is 'Precios a mano por plan ({"1": 54.9, ...}); sin él, los porcentajes de alquiler_ajustes.';
