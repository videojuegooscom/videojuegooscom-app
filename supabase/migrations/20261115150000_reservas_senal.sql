-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: «Reservar con señal» (dueño, 2026-11-15, mejora 14). APAGADA Y VACÍA: el dueño aún no ha dado su escala de
-- porcentajes, los días máximos, el tipo de arras ni qué pasa al vencer, y su gestor tiene que revisar el texto. Hasta que
-- el dueño lo active con todo puesto, ningún cliente ve nada ni se puede cobrar ninguna señal.
--   1) public.reserva_ajustes: UNA fila (id = 1) con el interruptor (activa, por defecto false) y las reglas, todas vacías:
--      escala (lista de {hasta_dias, porcentaje}: porcentaje entero de 1 a 70 y días crecientes), dias_max, tipo_arras
--      ('penitenciales' | 'confirmatorias'), al_vencer (texto del dueño), texto_condiciones y condiciones_revisadas («Revisado
--      por mi gestor», por defecto false). El disparador (normal, SIN permisos especiales) comprueba la escala y NO deja
--      activar si falta alguna regla, si el texto no está revisado o si aún dice «Pendiente de revisión del gestor».
--      Reglas (RLS): solo el administrador la lee y la cambia. La tienda sabe si está activa por GET /api/pago?reserva=ajustes
--      (con la clave de servidor), que solo devuelve las reglas públicas y solo si está activa y completa.
--   2) public.reservas: cada reserva (artículo, días, porcentaje, señal y precio calculados EN EL SERVIDOR, vencimiento,
--      estado, cobro de Stripe y una copia de las condiciones aceptadas con su huella SHA-256 y la hora). Reglas (RLS): cada
--      cliente lee SOLO las suyas y el administrador todas; NADIE escribe desde el navegador (las crea y cambia api/pago.ts).
--      Una sola reserva «activa» por artículo (índice único parcial).
--   3) public.products.reservado_hasta: hasta cuándo está reservado (null = no). La ficha deja de ofrecer «Comprar» y el
--      disparador de pedido_items no deja comprarlo a otro cliente mientras dure (el administrador y quien lo reservó, sí).
-- Qué hace: prepara la reserva con señal sin activarla.
-- Conectado con: api/pago.ts (GET ?reserva=ajustes, POST «reserva» y «reserva_estado», confirmación y aviso de Stripe),
--           lib/reservas.ts (cálculo de la señal), app/producto/[id].tsx («Reservar con señal»), app/(tabs)/perfil.tsx
--           («Mis reservas»), app/admin/reservas.tsx, pruebas/pago-api.mjs, pruebas/perfiles-sql.mjs y pruebas/perfil-datos.mjs
--           (sección RESEN).
-- Tipo:     SOLO AÑADE (dos tablas con sus reglas, una columna, dos funciones de disparador normales). No borra filas ni
--           columnas ni cambia permisos existentes. Se puede aplicar varias veces: repetirla no cambia nada.
-- ============================================================================

-- 1) Ajustes (una fila, todo vacío y apagado) ------------------------------------------------------------------------
create table if not exists public.reserva_ajustes (
  id smallint primary key default 1 check (id = 1),
  activa boolean not null default false,
  escala jsonb,
  dias_max integer check (dias_max is null or dias_max between 1 and 365),
  tipo_arras text check (tipo_arras is null or tipo_arras in ('penitenciales', 'confirmatorias')),
  al_vencer text check (al_vencer is null or char_length(al_vencer) <= 2000),
  texto_condiciones text check (texto_condiciones is null or char_length(texto_condiciones) <= 20000),
  condiciones_revisadas boolean not null default false,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid
);

insert into public.reserva_ajustes (id) values (1) on conflict (id) do nothing;

alter table public.reserva_ajustes enable row level security;

create or replace function public.reserva_ajustes_validar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_prev integer := 0;
  v_dias numeric;
  v_pct numeric;
  v_faltan text[] := '{}';
begin
  new.id := 1;
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  new.al_vencer := nullif(btrim(coalesce(new.al_vencer, '')), '');
  new.texto_condiciones := nullif(btrim(coalesce(new.texto_condiciones, '')), '');
  if new.escala is not null and new.escala = '[]'::jsonb then
    new.escala := null;
  end if;

  -- La escala: lista de 1 a 12 tramos {hasta_dias, porcentaje}, días enteros crecientes (1-365) y porcentaje entero 1-70.
  if new.escala is not null then
    if jsonb_typeof(new.escala) <> 'array' or jsonb_array_length(new.escala) > 12 then
      raise exception 'La escala tiene que ser una lista de 1 a 12 tramos.' using errcode = 'P0001';
    end if;
    for v_item in select value from jsonb_array_elements(new.escala) loop
      if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(v_item -> 'hasta_dias') <> 'number' or jsonb_typeof(v_item -> 'porcentaje') <> 'number' then
        raise exception 'Cada tramo de la escala necesita días y porcentaje.' using errcode = 'P0001';
      end if;
      v_dias := (v_item ->> 'hasta_dias')::numeric;
      v_pct := (v_item ->> 'porcentaje')::numeric;
      if v_dias <> trunc(v_dias) or v_dias < 1 or v_dias > 365 or v_dias <= v_prev then
        raise exception 'Los días de la escala tienen que ser enteros, de 1 a 365 y crecientes.' using errcode = 'P0001';
      end if;
      if v_pct <> trunc(v_pct) or v_pct < 1 or v_pct > 70 then
        raise exception 'El porcentaje de cada tramo tiene que ser un entero del 1 al 70.' using errcode = 'P0001';
      end if;
      v_prev := v_dias::integer;
    end loop;
    if new.dias_max is not null and new.dias_max > v_prev then
      raise exception 'Los días máximos no pueden pasar del último tramo de la escala.' using errcode = 'P0001';
    end if;
  end if;

  -- Activar solo con todas las reglas y el texto revisado por el gestor (y sin la marca de borrador).
  if new.activa then
    if new.escala is null then v_faltan := array_append(v_faltan, 'la escala'); end if;
    if new.dias_max is null then v_faltan := array_append(v_faltan, 'los días máximos'); end if;
    if new.tipo_arras is null then v_faltan := array_append(v_faltan, 'el tipo de arras'); end if;
    if new.al_vencer is null then v_faltan := array_append(v_faltan, 'qué pasa al vencer'); end if;
    if new.texto_condiciones is null then v_faltan := array_append(v_faltan, 'el texto de las condiciones'); end if;
    if not new.condiciones_revisadas then v_faltan := array_append(v_faltan, 'la revisión del gestor'); end if;
    if new.texto_condiciones ilike '%pendiente de revisión del gestor%' then v_faltan := array_append(v_faltan, 'quitar la marca de borrador del texto'); end if;
    if array_length(v_faltan, 1) > 0 then
      raise exception 'Para activar las reservas con señal falta: %.', array_to_string(v_faltan, ', ') using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- 2) Reservas -----------------------------------------------------------------------------------------------------------
create table if not exists public.reservas (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products (id) on delete set null,
  producto_titulo text check (producto_titulo is null or char_length(producto_titulo) <= 300),
  user_id uuid not null default auth.uid(),
  dias integer not null check (dias between 1 and 365),
  porcentaje numeric(5, 2) not null check (porcentaje between 1 and 70),
  senal_eur numeric(10, 2) not null check (senal_eur > 0),
  precio_eur numeric(10, 2) not null check (precio_eur > 0),
  vence_en timestamptz not null,
  estado text not null default 'pendiente_pago' check (estado in ('pendiente_pago', 'activa', 'completada', 'vencida', 'cancelada')),
  pago_sesion text check (pago_sesion is null or char_length(pago_sesion) <= 300),
  pago_modo text check (pago_modo is null or pago_modo in ('prueba', 'real')),
  pago_referencia text check (pago_referencia is null or char_length(pago_referencia) <= 300),
  pagado_en timestamptz,
  tipo_arras text not null check (tipo_arras in ('penitenciales', 'confirmatorias')),
  al_vencer_texto text not null check (char_length(al_vencer_texto) <= 2000),
  condiciones_texto text not null check (char_length(condiciones_texto) <= 20000),
  condiciones_hash text not null check (condiciones_hash ~ '^[0-9a-f]{64}$'),
  aceptadas_condiciones_en timestamptz not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (senal_eur <= precio_eur)
);

create index if not exists reservas_usuario_idx on public.reservas (user_id);
create index if not exists reservas_producto_idx on public.reservas (product_id, estado);
create index if not exists reservas_fecha_idx on public.reservas (creado_en desc);
create unique index if not exists reservas_una_activa_idx on public.reservas (product_id) where estado = 'activa';

alter table public.reservas enable row level security;

-- 3) Hasta cuándo está reservado cada artículo, y que otro cliente no lo compre mientras --------------------------------
alter table public.products add column if not exists reservado_hasta timestamptz;

create or replace function public.pedido_items_reserva_senal()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.product_id is not null then
    if exists (select 1 from public.products p where p.id = new.product_id and p.reservado_hasta > now()) then
      if not coalesce(public.is_admin(), false)
         and not exists (
           select 1 from public.reservas r
            where r.product_id = new.product_id and r.estado = 'activa' and r.vence_en > now() and r.user_id = auth.uid()
         ) then
        raise exception 'Este artículo está reservado con señal por otro cliente.' using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'reserva_ajustes_validar' and tgrelid = 'public.reserva_ajustes'::regclass) then
    create trigger reserva_ajustes_validar
      before insert or update on public.reserva_ajustes
      for each row execute function public.reserva_ajustes_validar();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'pedido_items_reserva_senal' and tgrelid = 'public.pedido_items'::regclass) then
    create trigger pedido_items_reserva_senal
      before insert on public.pedido_items
      for each row execute function public.pedido_items_reserva_senal();
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reserva_ajustes' and policyname = 'reserva_ajustes_admin_select') then
    create policy reserva_ajustes_admin_select on public.reserva_ajustes
      for select to authenticated using ((select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reserva_ajustes' and policyname = 'reserva_ajustes_admin_update') then
    create policy reserva_ajustes_admin_update on public.reserva_ajustes
      for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reservas' and policyname = 'reservas_select') then
    create policy reservas_select on public.reservas
      for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
  end if;
end $$;

comment on table public.reserva_ajustes is '«Reservar con señal»: interruptor y reglas del dueño (una fila). Apagada y vacía hasta que el dueño ponga sus reglas y su gestor revise el texto.';
comment on table public.reservas is '«Reservar con señal»: cada reserva con su señal calculada en el servidor y copia de las condiciones aceptadas. Solo la escribe api/pago.ts.';
comment on column public.products.reservado_hasta is 'Reservado con señal hasta esta hora (null = no). Lo pone api/pago.ts al cobrar la señal.';
