-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: protección contra contracargos, parte 1 (dueño, 2026-11-18, aprobada; «Empieza», 2026-11-20).
-- Qué hace:
--   1) public.pedidos.pago_3ds: si el banco verificó el pago con tarjeta (3D Secure), como lo dice Stripe
--      («authenticated», «attempt_acknowledged», «exempted», «failed», «not_supported», «processing_error»). Lo apunta el
--      servidor (api/pago.ts) al confirmar el cobro; el cliente no puede escribirlo (RLS de pedidos de siempre). Es la
--      prueba principal ante una reclamación «yo no hice este pago»: con la tarjeta verificada, la asume el banco.
--   2) public.pedidos.condiciones_aceptadas_en, condiciones_version y condiciones_copia: cuándo aceptó el cliente las
--      condiciones al pedir («Al pagar aceptas las Condiciones…»), qué versión era (la fecha de la última actualización de
--      Condiciones, Devoluciones o Envíos) y una copia de esas tres páginas tal y como estaban (unos 6 KB). Las pone la
--      base de datos al crear el pedido, con un disparador normal (sin permisos especiales), SOLO en los pedidos que hace
--      un cliente en la tienda (peticiones de visitante o con sesión; no las ventas de VeoAura ni lo que asigna el
--      servidor desde el chat). Nadie puede cambiarlas después: el disparador deja siempre las de antes.
--   3) Número de Correos obligatorio al marcar «Enviado»: un pedido a domicilio que va por Correos (fuera de la entrega en
--      mano y de las zonas del mismo día de Zaragoza y Cuarte: mano, local y local_lejos) no puede pasar a «Enviado» sin
--      envio_seguimiento (el número de Correos o el enlace del transportista). Sin él, la base de datos lo rechaza con
--      «falta_numero_envio» y Administración → Pedidos lo dice antes. No se aplica a los pedidos de VeoAura (id_veoaura),
--      que siguen su propio camino.
-- Conectado con: api/pago.ts (3DS siempre en la página de pago y pago_3ds al confirmar), app/admin/pedidos.tsx (insignia
--           «Verificado por el banco», condiciones aceptadas con su copia, número obligatorio al enviar y recuento),
--           app/checkout.tsx (texto de lo que se acepta), public.policy_pages, pruebas/perfiles-sql.mjs (CONTRA1) y
--           pruebas/perfil-datos.mjs (sección CONTRA).
-- Tipo:     SOLO AÑADE (cuatro columnas con su comprobación y dos funciones de disparador normales). No borra filas ni
--           columnas ni cambia permisos. Repetirla no cambia nada. Más una frase de la privacidad, una sola vez.
--   4) Privacidad: en «Para qué usamos tus datos», que guardamos cuándo aceptaste las condiciones (con su copia) y si tu
--      banco verificó el pago con tarjeta, para poder defender el cobro ante una reclamación.
-- ============================================================================

-- 1) Verificación del banco (3DS).
alter table public.pedidos add column if not exists pago_3ds text
  check (pago_3ds is null or pago_3ds in ('authenticated', 'attempt_acknowledged', 'exempted', 'failed', 'not_supported', 'processing_error'));
comment on column public.pedidos.pago_3ds is 'Resultado de la verificación del banco (3D Secure) del cobro con tarjeta, según Stripe. Lo apunta api/pago.ts.';

-- 2) Condiciones aceptadas al pedir.
alter table public.pedidos add column if not exists condiciones_aceptadas_en timestamptz;
alter table public.pedidos add column if not exists condiciones_version timestamptz;
alter table public.pedidos add column if not exists condiciones_copia jsonb;
comment on column public.pedidos.condiciones_aceptadas_en is 'Cuándo aceptó el cliente las condiciones al hacer el pedido en la tienda (lo pone la base de datos).';
comment on column public.pedidos.condiciones_version is 'Versión de las condiciones aceptadas: la última actualización de Condiciones, Devoluciones o Envíos en ese momento.';
comment on column public.pedidos.condiciones_copia is 'Copia de Condiciones, Devoluciones y Envíos tal y como estaban al hacer el pedido (prueba ante una reclamación).';

create or replace function public.pedidos_condiciones_aceptadas()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_rol text;
  v_version timestamptz;
  v_copia jsonb;
begin
  if tg_op = 'UPDATE' then
    -- Nadie las cambia después de crear el pedido.
    new.condiciones_aceptadas_en := old.condiciones_aceptadas_en;
    new.condiciones_version := old.condiciones_version;
    new.condiciones_copia := old.condiciones_copia;
    return new;
  end if;
  begin
    v_rol := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  exception when others then
    v_rol := null;
  end;
  if v_rol in ('anon', 'authenticated') and new.id_veoaura is null and new.veoaura_venta_id is null then
    select max(updated_at), jsonb_object_agg(slug, jsonb_build_object('actualizada', updated_at, 'secciones', sections))
      into v_version, v_copia
      from public.policy_pages
     where slug in ('terminos', 'devoluciones', 'envios') and is_active;
    new.condiciones_aceptadas_en := now();
    new.condiciones_version := v_version;
    new.condiciones_copia := v_copia;
  else
    new.condiciones_aceptadas_en := null;
    new.condiciones_version := null;
    new.condiciones_copia := null;
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'pedidos_condiciones_aceptadas' and tgrelid = 'public.pedidos'::regclass) then
    create trigger pedidos_condiciones_aceptadas
      before insert or update on public.pedidos
      for each row
      execute function public.pedidos_condiciones_aceptadas();
  end if;
end $$;

-- 3) Número de Correos obligatorio al pasar a «Enviado».
create or replace function public.pedidos_enviado_con_numero()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.estado = 'enviado' and old.estado is distinct from 'enviado'
     and new.entrega = 'envio'
     and coalesce(new.zona_envio, '') not in ('mano', 'local', 'local_lejos')
     and new.id_veoaura is null
     and nullif(btrim(coalesce(new.envio_seguimiento, '')), '') is null then
    raise exception 'falta_numero_envio' using hint = 'Escribe el número de Correos antes de marcar el pedido como enviado.';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'pedidos_enviado_con_numero' and tgrelid = 'public.pedidos'::regclass) then
    create trigger pedidos_enviado_con_numero
      before update of estado on public.pedidos
      for each row
      when (old.estado is distinct from new.estado)
      execute function public.pedidos_enviado_con_numero();
  end if;
end $$;

-- 4) Privacidad: en «Para qué usamos tus datos», al final, una sola vez (si el apartado no está, no cambia nada).
update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Para qué usamos tus datos'
                   then jsonb_set(s.sec, '{body}', to_jsonb(
                     rtrim(s.sec ->> 'body') || ' En cada pedido guardamos cuándo aceptaste las condiciones de compra (con una copia de las condiciones de ese momento) y, si pagas con tarjeta, si tu banco verificó el pago; lo usamos solo para poder demostrar la compra si el cobro se reclama al banco.'
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
      and s.sec ->> 'body' not like '%si el cobro se reclama al banco%'
  );
