-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: envío gratis regalado a un cliente concreto (dueño, 2026-11-23: «activarle al cliente por individual envío
--            gratis con un botón… en "Este artículo" o "Hasta 5 artículos"»).
-- Qué hace:
--   1) public.envio_gratis_cliente: los regalos de envío gratis que el administrador da a un cliente desde su ficha
--      (Administración → Usuarios → ficha del cliente). Dos tipos:
--        · 'articulo': el envío de ESE artículo (product_id) le sale gratis, una vez.
--        · 'cupo': el envío de sus próximos N artículos (cupo_total, 1-50) le sale gratis; cada artículo comprado gasta 1
--          (un pedido con 2 artículos gasta 2) y un pedido solo sale gratis si le quedan bastantes para todos sus artículos.
--      Fecha de caducidad opcional (caduca_en). «Quitar» no borra: pone anulado_en. Vale en cualquier envío a domicilio
--      de España que se cobre (el dueño: «todos los de España»).
--      Reglas: el administrador lo ve y lo da o lo quita todo; el cliente solo VE los suyos (para el aviso de Blue, la
--      ficha, la cesta y su Perfil). Nadie más.
--   2) pedidos.envio_gratis_id: qué regalo usó cada pedido. Lo pone SOLO la base de datos al calcular el envío
--      (pedidos_calcular_envio); lo gastado se cuenta con los pedidos no cancelados, así que un pedido cancelado devuelve
--      el cupo solo.
--   3) Funciones normales (sin permisos especiales, con las reglas de quien llama):
--        · envio_gratis_usados(regalo, excluir_pedido): artículos ya enviados gratis con ese regalo.
--        · envio_gratis_aplicable(pedido, cliente, actual): el regalo que vale para ese pedido (o ninguno).
--        · mis_envios_gratis(): los regalos vigentes y con saldo del cliente que llama.
--        · envios_gratis_de_cliente(cliente): todos los regalos de un cliente con lo gastado (para su ficha; las reglas
--          de la tabla hacen que solo el administrador vea los de otro).
--   4) pedidos_calcular_envio: igual que antes y, si el envío cuesta algo y el cliente tiene un regalo que vale, lo deja
--      a 0 y apunta el regalo. El envío puesto a mano por el administrador sigue mandando.
--   5) Envíos (política): una frase sobre el envío gratis regalado, una sola vez.
-- Conectado con: components/panel/cliente-ficha.tsx (botón «Activar envío gratis»), components/panel/pedidos.tsx
--           («Envío regalado»), components/panel/analytics.tsx, lib/envio.ts (regalos del cliente), app/checkout.tsx,
--           app/producto/[id].tsx, app/(tabs)/perfil.tsx, components/AsistenteBlue.tsx (aviso), pruebas/perfiles-sql.mjs
--           (EGC) y pruebas/perfil-datos.mjs (EGC).
-- Tipo:     SOLO AÑADE (una tabla con sus reglas, una columna, funciones normales, la nueva versión de una función de
--           disparador y una frase en Envíos). No borra filas ni columnas ni cambia permisos existentes. Repetirla no
--           cambia nada.
-- ============================================================================

-- 1) Regalos de envío gratis.
create table if not exists public.envio_gratis_cliente (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  modo text not null check (modo in ('articulo', 'cupo')),
  product_id uuid references public.products (id),
  cupo_total int check (cupo_total is null or cupo_total between 1 and 50),
  caduca_en timestamptz,
  creado_en timestamptz not null default now(),
  creado_por uuid default auth.uid(),
  anulado_en timestamptz,
  check ((modo = 'articulo' and product_id is not null and cupo_total is null)
      or (modo = 'cupo' and cupo_total is not null and product_id is null))
);
comment on table public.envio_gratis_cliente is 'Envío gratis regalado por el administrador a un cliente: de un artículo o de sus próximos N artículos.';
create index if not exists envio_gratis_cliente_user on public.envio_gratis_cliente (user_id);

alter table public.envio_gratis_cliente enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'envio_gratis_cliente' and policyname = 'envio_gratis_cliente_select') then
    create policy envio_gratis_cliente_select on public.envio_gratis_cliente
      for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'envio_gratis_cliente' and policyname = 'envio_gratis_cliente_admin_insert') then
    create policy envio_gratis_cliente_admin_insert on public.envio_gratis_cliente
      for insert to authenticated with check ((select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'envio_gratis_cliente' and policyname = 'envio_gratis_cliente_admin_update') then
    create policy envio_gratis_cliente_admin_update on public.envio_gratis_cliente
      for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
  end if;
end $$;

-- 2) Qué regalo usó cada pedido.
alter table public.pedidos add column if not exists envio_gratis_id uuid references public.envio_gratis_cliente (id);
comment on column public.pedidos.envio_gratis_id is 'Regalo de envío gratis que usó este pedido (lo pone la base de datos al calcular el envío).';
create index if not exists pedidos_envio_gratis on public.pedidos (envio_gratis_id) where envio_gratis_id is not null;

-- 3) Funciones.
create or replace function public.envio_gratis_usados(p_regalo uuid, p_excluir uuid default null)
returns int
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((
    select count(*)
      from public.pedido_items i
      join public.pedidos p on p.id = i.pedido_id
     where p.envio_gratis_id = p_regalo
       and p.estado <> 'cancelado'
       and (p_excluir is null or p.id <> p_excluir)
  ), 0)::int;
$$;

create or replace function public.envio_gratis_aplicable(p_pedido uuid, p_user uuid, p_actual uuid default null)
returns uuid
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_items int;
  v_id uuid;
begin
  if p_pedido is null or p_user is null then
    return null;
  end if;
  select count(*) into v_items from public.pedido_items where pedido_id = p_pedido;
  if v_items = 0 then
    return null;
  end if;
  -- El que ya tenía el pedido sigue valiendo aunque después se quite o caduque (el pedido ya se hizo con él).
  select g.id into v_id
    from public.envio_gratis_cliente g
   where g.user_id = p_user
     and (g.id = p_actual or (g.anulado_en is null and (g.caduca_en is null or g.caduca_en > now())))
     and case g.modo
           when 'articulo' then
             exists (select 1 from public.pedido_items i where i.pedido_id = p_pedido and i.product_id = g.product_id)
             and public.envio_gratis_usados(g.id, p_pedido) = 0
           else
             g.cupo_total - public.envio_gratis_usados(g.id, p_pedido) >= v_items
         end
   order by (g.id = p_actual) desc nulls last, (g.modo = 'articulo') desc, g.caduca_en nulls last, g.creado_en
   limit 1;
  return v_id;
end;
$$;

create or replace function public.mis_envios_gratis()
returns table (id uuid, modo text, product_id uuid, cupo_total int, usados int, caduca_en timestamptz, creado_en timestamptz)
language sql
stable
set search_path = public, pg_temp
as $$
  select g.id, g.modo, g.product_id, g.cupo_total, u.usados, g.caduca_en, g.creado_en
    from public.envio_gratis_cliente g
    cross join lateral (select public.envio_gratis_usados(g.id) as usados) u
   where g.user_id = (select auth.uid())
     and g.anulado_en is null
     and (g.caduca_en is null or g.caduca_en > now())
     and case g.modo when 'articulo' then u.usados = 0 else u.usados < g.cupo_total end
   order by g.creado_en;
$$;

create or replace function public.envios_gratis_de_cliente(p_user uuid)
returns table (id uuid, modo text, product_id uuid, cupo_total int, usados int, caduca_en timestamptz, creado_en timestamptz, anulado_en timestamptz)
language sql
stable
set search_path = public, pg_temp
as $$
  select g.id, g.modo, g.product_id, g.cupo_total, public.envio_gratis_usados(g.id), g.caduca_en, g.creado_en, g.anulado_en
    from public.envio_gratis_cliente g
   where g.user_id = p_user
   order by g.creado_en desc;
$$;

-- 4) El envío del pedido, con el regalo.
create or replace function public.pedidos_calcular_envio()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  -- Una venta de VeoAura (api/escaparate-veoaura.ts) trae su total, lo que se cobró allí: nunca envío automático. Se lee
  -- con to_jsonb para que el disparador funcione también donde aún no exista esa columna.
  v_veoaura boolean := (to_jsonb(new) ->> 'id_veoaura') is not null;
  v_actual uuid;
begin
  if tg_op = 'INSERT' then
    -- La función del pedido guarda en total_eur la suma de los artículos (con los precios reales).
    new.productos_eur := coalesce(new.productos_eur, new.total_eur, 0);
    new.envio_eur := 0;
    new.envio_manual := v_veoaura;
    new.envio_gratis_id := null;
  else
    v_actual := old.envio_gratis_id;
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
    -- El regalo usado solo lo pone la base de datos (abajo).
    new.envio_gratis_id := old.envio_gratis_id;
  end if;

  if not new.envio_manual and not v_veoaura and (
       tg_op = 'INSERT'
       or new.entrega is distinct from old.entrega
       or new.codigo_postal is distinct from old.codigo_postal
       or new.productos_eur is distinct from old.productos_eur
       or new.peso_kg is distinct from old.peso_kg
       or (old.envio_manual and not new.envio_manual)
     ) then
    new.zona_envio := public.zona_envio(new.entrega, new.codigo_postal);
    new.envio_eur := public.calcular_envio(new.entrega, new.codigo_postal, new.productos_eur, new.peso_kg);
    -- Envío gratis regalado al cliente (si el envío cuesta algo y tiene un regalo que vale para este pedido).
    new.envio_gratis_id := null;
    if new.entrega = 'envio' and coalesce(new.envio_eur, 0) > 0 and new.user_id is not null then
      new.envio_gratis_id := public.envio_gratis_aplicable(new.id, new.user_id, v_actual);
      if new.envio_gratis_id is not null then
        new.envio_eur := 0;
      end if;
    end if;
  end if;

  new.total_eur := coalesce(new.productos_eur, 0) + coalesce(new.envio_eur, 0);
  return new;
end;
$$;

-- 5) Envíos: el envío gratis regalado, una sola vez (al final de la última sección).
update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.ord = (select max(s2.ord) from jsonb_array_elements(p.sections) with ordinality as s2 (sec, ord))
                   then jsonb_set(s.sec, '{body}', to_jsonb(
                     rtrim(s.sec ->> 'body') || ' A veces la tienda regala a un cliente el envío de un artículo concreto o de sus próximos artículos: si te lo regalamos, lo verás en tu Perfil, en la ficha del artículo y en la cesta, y el envío de esa compra te saldrá gratis (si cancelas el pedido, el regalo vuelve a estar disponible). Puede tener fecha de caducidad, que verás junto al regalo.'
                   ))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'envios'
  and jsonb_typeof(p.sections) = 'array'
  and jsonb_array_length(p.sections) > 0
  and p.sections::text not like '%la tienda regala a un cliente el envío%';
