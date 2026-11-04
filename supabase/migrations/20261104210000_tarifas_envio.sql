-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: tarifas de envío (dueño, 2026-11-04: «crear ese apartado en el panel del administrador para poder editar las
--            tarifas de envío manualmente, pero que siga haciéndose automáticamente; que pueda hacerse de ambas maneras»).
-- Qué hace:
--   1) Tabla tarifas_envio: una fila por zona (entrega en mano, Zaragoza y Cuarte, resto de la península, Baleares,
--      Canarias, Ceuta y Melilla) con su precio, desde qué importe sale gratis y si se envía allí. Todas empiezan a 0 €
--      (como hoy, gratis): nada cambia hasta que el dueño ponga sus precios en Administración → Tarifas de envío.
--      Cualquiera la lee (el precio se enseña en la cesta y al pagar); solo el administrador la cambia; nadie crea ni
--      borra zonas desde la app.
--   2) zona_envio() y calcular_envio(): la regla de siempre, la misma que usa la página (lib/envio.ts). Entrega en mano →
--      zona «mano»; a domicilio, por el código postal (5 cifras): primero el código exacto o un rango (50001-50022),
--      después el prefijo más largo (07 = toda la provincia) y, si no, la zona «*». Sin código postal no hay zona (no se
--      cobra envío automático: lo pone el administrador si hace falta).
--   3) Pedidos: columnas productos_eur (los artículos), envio_eur, zona_envio y envio_manual. Un disparador calcula el
--      envío AUTOMÁTICAMENTE al crear el pedido (con la función antigua o la nueva, sin tocarlas) y total_eur pasa a ser
--      artículos + envío. El administrador puede poner a mano el envío de un pedido (Administración → Pedidos): entonces
--      queda «manual» y ya no se recalcula; «Volver al automático» lo devuelve a la tarifa. Las ventas que llegan de
--      VeoAura (id_veoaura) traen su total y nunca llevan envío automático.
-- Tipo:     SOLO AÑADE (una tabla, tres funciones, un disparador, cuatro columnas y dos políticas). No borra filas ni
--           columnas. Lleva permisos (revoke/grant y una lectura pública): la pega el dueño en Supabase → SQL Editor.
--           Repetirla no cambia nada.
-- Vuelta atrás: quitar el disparador (drop trigger trg_pedidos_envio on public.pedidos) deja los pedidos como hoy; las
--           columnas y la tabla se quedan sin uso. (Eso lo decide y lo hace el dueño.)
-- ============================================================================

-- 1) Las zonas y sus tarifas.
create table if not exists public.tarifas_envio (
  zona text primary key check (zona ~ '^[a-z_]{2,30}$'),
  nombre text not null check (length(btrim(nombre)) between 2 and 90),
  -- Códigos postales de la zona, separados por comas: «50410» (uno), «50001-50022» (rango), «07» (prefijo: toda la
  -- provincia), «*» (todo lo demás). Vacío en la entrega en mano.
  codigos text check (codigos is null or length(codigos) <= 300),
  precio_eur numeric(10,2) not null default 0 check (precio_eur >= 0 and precio_eur <= 999),
  -- A partir de este importe en artículos, el envío a esta zona es gratis (vacío = nunca).
  gratis_desde_eur numeric(10,2) check (gratis_desde_eur is null or (gratis_desde_eur >= 0 and gratis_desde_eur <= 99999)),
  -- Si es false, la tienda no envía a esa zona desde la web (al pagar se pide escribir antes).
  activa boolean not null default true,
  orden integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.tarifas_envio is 'Tarifas de envío por zona (Administración → Tarifas de envío). La tienda calcula el envío de cada pedido con ellas (zona_envio / calcular_envio y el disparador de pedidos).';

insert into public.tarifas_envio (zona, nombre, codigos, precio_eur, gratis_desde_eur, activa, orden) values
  ('mano', 'Entrega en mano (Cuarte de Huerva o un punto acordado)', null, 0, null, true, 10),
  ('local', 'A domicilio en Zaragoza y Cuarte de Huerva (el mismo día)', '50001-50022, 50410', 0, null, true, 20),
  ('peninsula', 'Resto de la España peninsular (sale en 1-2 días, llega en 72 h como máximo)', '*', 0, null, true, 30),
  ('baleares', 'Islas Baleares', '07', 0, null, true, 40),
  ('canarias', 'Islas Canarias', '35, 38', 0, null, true, 50),
  ('ceuta_melilla', 'Ceuta y Melilla', '51, 52', 0, null, true, 60)
on conflict (zona) do nothing;

alter table public.tarifas_envio enable row level security;
revoke all on public.tarifas_envio from public, anon, authenticated;
grant select on public.tarifas_envio to anon, authenticated;
grant update (nombre, codigos, precio_eur, gratis_desde_eur, activa, updated_at, updated_by) on public.tarifas_envio to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tarifas_envio' and policyname = 'tarifas_envio_leer') then
    create policy tarifas_envio_leer on public.tarifas_envio for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tarifas_envio' and policyname = 'tarifas_envio_admin') then
    create policy tarifas_envio_admin on public.tarifas_envio for update to authenticated
      using ((select public.is_admin())) with check ((select public.is_admin()));
  end if;
end $$;

-- 2) La regla: qué zona le toca a una entrega y cuánto cuesta. La misma que lib/envio.ts (la página la enseña antes de
--    pedir; la base de datos es la que manda al guardar el pedido).
create or replace function public.zona_envio(p_entrega text, p_codigo_postal text)
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_cp text := regexp_replace(coalesce(p_codigo_postal, ''), '[^0-9]', '', 'g');
  v_mejor text;
  v_puntos integer := -1;
  v_orden integer;
  v_defecto text;
  r record;
  t text;
  v_desde text;
  v_hasta text;
  v_p integer;
begin
  if p_entrega = 'recogida' then
    return 'mano';
  end if;
  -- A domicilio sin un código postal de 5 cifras (un pedido asignado desde el chat, por ejemplo): sin zona.
  if length(v_cp) <> 5 then
    return null;
  end if;
  for r in select zona, codigos, orden from public.tarifas_envio where zona <> 'mano' order by orden, zona loop
    foreach t in array string_to_array(coalesce(r.codigos, ''), ',') loop
      t := btrim(t);
      v_p := -1;
      if t = '*' then
        if v_defecto is null then v_defecto := r.zona; end if;
      elsif t ~ '^[0-9]{5}-[0-9]{5}$' then
        v_desde := split_part(t, '-', 1);
        v_hasta := split_part(t, '-', 2);
        if v_cp between v_desde and v_hasta then v_p := 5; end if;
      elsif t ~ '^[0-9]{1,5}$' and left(v_cp, length(t)) = t then
        v_p := length(t);
      end if;
      -- Gana lo más concreto (código o rango antes que prefijo, prefijo largo antes que corto); a igualdad, el orden.
      if v_p > v_puntos or (v_p = v_puntos and v_p >= 0 and r.orden < v_orden) then
        v_puntos := v_p;
        v_mejor := r.zona;
        v_orden := r.orden;
      end if;
    end loop;
  end loop;
  if v_puntos >= 0 then
    return v_mejor;
  end if;
  -- Sin zona concreta: la zona «*» (si la hay).
  return v_defecto;
end;
$$;

create or replace function public.calcular_envio(p_entrega text, p_codigo_postal text, p_productos_eur numeric)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((
    select case
             when t.gratis_desde_eur is not null and coalesce(p_productos_eur, 0) >= t.gratis_desde_eur then 0
             else t.precio_eur
           end
    from public.tarifas_envio t
    where t.zona = public.zona_envio(p_entrega, p_codigo_postal)
  ), 0)::numeric(10,2);
$$;

revoke all on function public.zona_envio(text, text) from public, anon, authenticated;
revoke all on function public.calcular_envio(text, text, numeric) from public, anon, authenticated;
grant execute on function public.zona_envio(text, text) to anon, authenticated;
grant execute on function public.calcular_envio(text, text, numeric) to anon, authenticated;

-- 3) Pedidos: artículos, envío, zona y si el envío lo puso el administrador a mano.
alter table public.pedidos add column if not exists productos_eur numeric(10,2);
alter table public.pedidos add column if not exists envio_eur numeric(10,2) not null default 0;
alter table public.pedidos add column if not exists zona_envio text;
alter table public.pedidos add column if not exists envio_manual boolean not null default false;
-- Los pedidos que ya había: sus artículos son su total (hasta hoy el envío era gratis).
update public.pedidos set productos_eur = total_eur where productos_eur is null;

create or replace function public.pedidos_calcular_envio()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  -- Una venta de VeoAura (api/escaparate-veoaura.ts) trae su total, lo que se cobró allí: nunca envío automático. Se lee
  -- con to_jsonb para que el disparador funcione también donde aún no exista esa columna.
  v_veoaura boolean := (to_jsonb(new) ->> 'id_veoaura') is not null;
begin
  if tg_op = 'INSERT' then
    -- La función del pedido guarda en total_eur la suma de los artículos (con los precios reales).
    new.productos_eur := coalesce(new.productos_eur, new.total_eur, 0);
    new.envio_eur := 0;
    new.envio_manual := v_veoaura;
  else
    -- Un reintento del pedido vuelve a calcular los artículos en total_eur: se toman como artículos.
    if new.total_eur is distinct from old.total_eur
       and new.envio_eur is not distinct from old.envio_eur
       and new.productos_eur is not distinct from old.productos_eur then
      new.productos_eur := new.total_eur;
    end if;
    -- El administrador pone el envío a mano: desde ahí ya no se recalcula.
    if new.envio_eur is distinct from old.envio_eur then
      new.envio_manual := true;
    end if;
  end if;

  if not new.envio_manual and not v_veoaura and (
       tg_op = 'INSERT'
       or new.entrega is distinct from old.entrega
       or new.codigo_postal is distinct from old.codigo_postal
       or new.productos_eur is distinct from old.productos_eur
       or (old.envio_manual and not new.envio_manual)
     ) then
    new.zona_envio := public.zona_envio(new.entrega, new.codigo_postal);
    new.envio_eur := public.calcular_envio(new.entrega, new.codigo_postal, new.productos_eur);
  end if;

  new.total_eur := coalesce(new.productos_eur, 0) + coalesce(new.envio_eur, 0);
  return new;
end;
$$;

revoke all on function public.pedidos_calcular_envio() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_pedidos_envio' and tgrelid = 'public.pedidos'::regclass) then
    create trigger trg_pedidos_envio
      before insert or update on public.pedidos
      for each row execute function public.pedidos_calcular_envio();
  end if;
end $$;
