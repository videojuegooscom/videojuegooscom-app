-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: números de seguimiento (dueño, 2026-10-31, «parte 3»).
--   El dueño crea en VeoAura la ficha de un cliente (una reparación o mantenimiento, o un pedido) y VeoAura la manda a
--   la tienda por el puente firmado (api/escaparate-veoaura.ts, evento «seguimiento»). La tienda le da un número de
--   seguimiento («VZ-XXXX-XXXX») y se lo devuelve a VeoAura. El dueño se lo da al cliente; el cliente se registra en la
--   tienda y lo escribe en Perfil → «Mis seguimientos» («Mis pedidos» o «Reparaciones y Mantenimientos»): desde ese
--   momento lo ve en su cuenta con su etapa, como lo que compra o pide en la tienda.
--   Todos los pedidos y reparaciones tienen número (también los de la tienda: así un pedido hecho sin sesión se puede
--   añadir después a la cuenta).
--
--   1) Columnas nuevas en pedidos y service_requests: codigo_seguimiento (único, con formato), id_veoaura (único: la
--      ficha de VeoAura de la que viene) y vinculado_en (cuándo lo añadió el cliente a su cuenta).
--   2) generar_codigo_seguimiento(): 8 símbolos al azar de 32 (sin 0, O, 1 ni I, que se confunden): más de un billón
--      de combinaciones. Nadie lo ejecuta directamente.
--   3) Disparador seguimiento_campos_protegidos: el número lo pone SIEMPRE la base de datos al crear la fila (nadie
--      elige el suyo) y no se cambia después; id_veoaura solo lo pone o cambia el servidor (el puente de VeoAura), nunca
--      un formulario ni el panel.
--   4) Números para lo que ya existe, sin tocar su fecha de actualización (el aviso de «48 h sin cambios» la usa).
--   5) vincular_seguimiento(codigo): solo con sesión. Busca el número y, si no es de nadie, lo añade a la cuenta de quien
--      lo escribe. Como mucho 10 intentos fallidos por hora y persona (tabla seguimiento_intentos, que solo lee el
--      administrador para contarlos). Un número ya añadido a otra cuenta no se puede quitar desde fuera.
--   6) Política de privacidad: una frase sobre el número de seguimiento.
-- Tipo:     SOLO AÑADE (columnas, una tabla, tres funciones, dos disparadores y una frase en la privacidad). No borra
--           filas ni columnas. Se puede aplicar varias veces.
-- La aplica el dueño en Supabase → SQL Editor (funciones security definer y permisos).
-- ============================================================================

-- 1) Columnas.
alter table public.service_requests add column if not exists codigo_seguimiento text;
alter table public.service_requests add column if not exists id_veoaura text;
alter table public.service_requests add column if not exists vinculado_en timestamptz;
alter table public.pedidos add column if not exists codigo_seguimiento text;
alter table public.pedidos add column if not exists id_veoaura text;
alter table public.pedidos add column if not exists vinculado_en timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'service_requests_codigo_seguimiento_formato') then
    alter table public.service_requests add constraint service_requests_codigo_seguimiento_formato
      check (codigo_seguimiento is null or codigo_seguimiento ~ '^VZ-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'service_requests_id_veoaura_largo') then
    alter table public.service_requests add constraint service_requests_id_veoaura_largo
      check (id_veoaura is null or char_length(id_veoaura) between 1 and 64);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pedidos_codigo_seguimiento_formato') then
    alter table public.pedidos add constraint pedidos_codigo_seguimiento_formato
      check (codigo_seguimiento is null or codigo_seguimiento ~ '^VZ-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pedidos_id_veoaura_largo') then
    alter table public.pedidos add constraint pedidos_id_veoaura_largo
      check (id_veoaura is null or char_length(id_veoaura) between 1 and 64);
  end if;
end $$;

create unique index if not exists service_requests_codigo_seguimiento_key on public.service_requests (codigo_seguimiento);
create unique index if not exists service_requests_id_veoaura_key on public.service_requests (id_veoaura);
create unique index if not exists pedidos_codigo_seguimiento_key on public.pedidos (codigo_seguimiento);
create unique index if not exists pedidos_id_veoaura_key on public.pedidos (id_veoaura);

-- 2) Generador de números.
create or replace function public.generar_codigo_seguimiento()
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  azar bytea;
  simbolos text;
  posicion int;
  vueltas int := 0;
  codigo text;
begin
  loop
    -- 16 bytes al azar de un UUID v4; se usan solo bytes completamente aleatorios (no los de versión ni variante).
    azar := uuid_send(gen_random_uuid());
    simbolos := '';
    foreach posicion in array array[0, 1, 2, 3, 4, 5, 10, 11] loop
      simbolos := simbolos || substr(alfabeto, (get_byte(azar, posicion) % 32) + 1, 1);
    end loop;
    codigo := 'VZ-' || substr(simbolos, 1, 4) || '-' || substr(simbolos, 5, 4);
    exit when not exists (select 1 from public.service_requests where codigo_seguimiento = codigo)
          and not exists (select 1 from public.pedidos where codigo_seguimiento = codigo);
    vueltas := vueltas + 1;
    if vueltas > 20 then
      raise exception 'no se ha podido generar un número de seguimiento';
    end if;
  end loop;
  return codigo;
end;
$$;

revoke all on function public.generar_codigo_seguimiento() from public, anon, authenticated;

-- 3) Campos protegidos: el número y la ficha de VeoAura.
create or replace function public.seguimiento_campos_protegidos()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_servidor boolean := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role';
begin
  if tg_op = 'INSERT' then
    new.codigo_seguimiento := public.generar_codigo_seguimiento();
    new.vinculado_en := null;
    if not v_servidor then
      new.id_veoaura := null;
    end if;
  else
    new.codigo_seguimiento := old.codigo_seguimiento;
    if not v_servidor then
      new.id_veoaura := old.id_veoaura;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.seguimiento_campos_protegidos() from public, anon, authenticated;

-- 4) Números para lo que ya existe (antes de crear los disparadores; sin cambiar updated_at: se apagan un momento los
--    disparadores de la tabla y se vuelven a encender, todo dentro de la misma transacción).
do $$
begin
  if exists (select 1 from public.service_requests where codigo_seguimiento is null) then
    alter table public.service_requests disable trigger user;
    update public.service_requests set codigo_seguimiento = public.generar_codigo_seguimiento() where codigo_seguimiento is null;
    alter table public.service_requests enable trigger user;
  end if;
  if exists (select 1 from public.pedidos where codigo_seguimiento is null) then
    alter table public.pedidos disable trigger user;
    update public.pedidos set codigo_seguimiento = public.generar_codigo_seguimiento() where codigo_seguimiento is null;
    alter table public.pedidos enable trigger user;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_service_requests_seguimiento' and tgrelid = 'public.service_requests'::regclass) then
    create trigger trg_service_requests_seguimiento
      before insert or update on public.service_requests
      for each row execute function public.seguimiento_campos_protegidos();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_pedidos_seguimiento' and tgrelid = 'public.pedidos'::regclass) then
    create trigger trg_pedidos_seguimiento
      before insert or update on public.pedidos
      for each row execute function public.seguimiento_campos_protegidos();
  end if;
end $$;

-- 5) Añadir un número a la cuenta.
create table if not exists public.seguimiento_intentos (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  acierto boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.seguimiento_intentos is 'Intentos de añadir un número de seguimiento a la cuenta (para el límite por hora y para contarlos en Administración). Solo los escribe vincular_seguimiento; solo los lee el administrador.';

create index if not exists seguimiento_intentos_usuario_idx on public.seguimiento_intentos (user_id, created_at desc);

alter table public.seguimiento_intentos enable row level security;
revoke all on public.seguimiento_intentos from public, anon, authenticated;
grant select on public.seguimiento_intentos to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'seguimiento_intentos' and policyname = 'seguimiento_intentos_select_admin') then
    create policy seguimiento_intentos_select_admin on public.seguimiento_intentos
      for select to authenticated
      using ((select public.is_admin()));
  end if;
end $$;

create or replace function public.vincular_seguimiento(p_codigo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_limpio text;
  v_codigo text;
  v_id uuid;
  v_dueno uuid;
  v_titulo text;
  v_numero bigint;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'motivo', 'sin_sesion');
  end if;

  if (select count(*) from public.seguimiento_intentos
       where user_id = v_uid and not acierto and created_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'motivo', 'demasiados_intentos');
  end if;

  -- Se aceptan minúsculas, espacios y guiones: «vz 7k3m 9qpd» vale igual que «VZ-7K3M-9QPD».
  v_limpio := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_limpio !~ '^VZ[A-HJ-NP-Z2-9]{8}$' then
    insert into public.seguimiento_intentos (user_id) values (v_uid);
    return jsonb_build_object('ok', false, 'motivo', 'formato');
  end if;
  v_codigo := 'VZ-' || substr(v_limpio, 3, 4) || '-' || substr(v_limpio, 7, 4);

  select r.id, r.customer_user_id, r.service_title into v_id, v_dueno, v_titulo
    from public.service_requests r
   where r.codigo_seguimiento = v_codigo
   for update;
  if found then
    if v_dueno is not null and v_dueno <> v_uid then
      insert into public.seguimiento_intentos (user_id) values (v_uid);
      return jsonb_build_object('ok', false, 'motivo', 'otra_cuenta');
    end if;
    if v_dueno is null then
      update public.service_requests set customer_user_id = v_uid, vinculado_en = now() where id = v_id;
    end if;
    insert into public.seguimiento_intentos (user_id, acierto) values (v_uid, true);
    return jsonb_build_object('ok', true, 'tipo', 'reparacion', 'titulo', v_titulo, 'ya_estaba', v_dueno is not null);
  end if;

  select p.id, p.user_id, p.numero into v_id, v_dueno, v_numero
    from public.pedidos p
   where p.codigo_seguimiento = v_codigo
   for update;
  if found then
    if v_dueno is not null and v_dueno <> v_uid then
      insert into public.seguimiento_intentos (user_id) values (v_uid);
      return jsonb_build_object('ok', false, 'motivo', 'otra_cuenta');
    end if;
    if v_dueno is null then
      update public.pedidos set user_id = v_uid, vinculado_en = now() where id = v_id;
    end if;
    insert into public.seguimiento_intentos (user_id, acierto) values (v_uid, true);
    return jsonb_build_object('ok', true, 'tipo', 'pedido', 'numero', v_numero, 'ya_estaba', v_dueno is not null);
  end if;

  insert into public.seguimiento_intentos (user_id) values (v_uid);
  return jsonb_build_object('ok', false, 'motivo', 'no_existe');
end;
$$;

revoke all on function public.vincular_seguimiento(text) from public, anon, authenticated;
grant execute on function public.vincular_seguimiento(text) to authenticated;

-- 6) Política de privacidad: qué pasa con el número de seguimiento (se añade una vez al final de «Para qué usamos tus datos»).
update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Para qué usamos tus datos'
                   then jsonb_set(s.sec, '{body}', to_jsonb((s.sec ->> 'body') || ' Si te damos un número de seguimiento y lo añades en Mis seguimientos, ese pedido o esa reparación quedan unidos a tu cuenta para que veas su estado; solo lo ves tú y la tienda.'))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'privacidad'
  and exists (select 1 from jsonb_array_elements(p.sections) as s (sec) where s.sec ->> 'heading' = 'Para qué usamos tus datos')
  and not exists (select 1 from jsonb_array_elements(p.sections) as s (sec) where s.sec ->> 'body' like '%número de seguimiento%');
