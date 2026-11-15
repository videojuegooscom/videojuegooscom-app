-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: franjas horarias de la entrega en el mismo día y dos zonas de entrega propia (dueño, 2026-11-15:
--            «entregas inmediatas el mismo día entre las 11:00 y las 12:45 por las mañanas y de 17:15 a 19:00 por las
--            tardes, y así podemos gestionar mejor los costes»; margen de 45 minutos, sábado mañana y tarde, domingo solo
--            tarde; zona cercana a 9,97 € y resto de Zaragoza, Muel y La Muela a 13,97 €).
-- Qué hace:
--   1) public.entrega_franjas_ajustes (una sola fila): las dos franjas, el margen de corte (minutos antes de que empiece
--      cada franja hasta los que se puede pedir para ella) y qué franjas hay el sábado y el domingo (de lunes a viernes,
--      las dos). Solo el administrador la lee y la cambia (Administración → Tarifas de envío). La tienda no la lee
--      directamente: se la da el servidor (api/pago.ts, GET ?franjas=ajustes, con la clave del servidor) y, sin
--      respuesta, usa los mismos valores de lib/envio.ts (FRANJAS_POR_DEFECTO). Así no hace falta ninguna lectura
--      pública ni permisos nuevos.
--   2) public.pedidos: entrega_franja ('manana' | 'tarde') y entrega_fecha (el día elegido). Las apunta el servidor
--      (api/pago.ts, accion «franja») una sola vez, solo a quien hizo el pedido; el cliente no puede cambiarlas.
--   3) Tarifas: la zona «local» (9,97 €, el precio no se toca) pasa a cubrir solo Cuarte y Santa Fe (50410), Cadrete
--      (50420), María de Huerva (50430) y Zaragoza hasta la Plaza España; y la zona nueva «local_lejos» (13,97 €) el
--      resto de Zaragoza, Muel (50450) y La Muela (50196). Las dos son entrega propia el mismo día (con franja); nunca
--      Correos. zona_envio/calcular_envio ya eligen la zona por sus códigos: no cambian.
-- Conectado con: lib/envio.ts (opcionesFranja, entregaEstimada, esZonaMismoDia), app/checkout.tsx (selector «¿Cuándo te
--           viene bien?»), app/producto/[id].tsx, app/admin/envios.tsx (editor), app/admin/pedidos.tsx («Reparto de
--           hoy»), app/admin/analytics.tsx (entrega_franja_elegida) y api/pago.ts.
-- Tipo:     aditiva (tabla y columnas nuevas, una fila nueva y un cambio de códigos en una fila). No borra nada.
--           Repetirla no cambia nada.
-- ============================================================================

-- 1) Ajustes de las franjas.
create table if not exists public.entrega_franjas_ajustes (
  id smallint primary key default 1 check (id = 1),
  manana_desde time not null default '11:00',
  manana_hasta time not null default '12:45',
  tarde_desde time not null default '17:15',
  tarde_hasta time not null default '19:00',
  -- Hasta cuántos minutos antes de que empiece una franja se puede pedir para ese mismo día (45: mañana hasta las 10:15,
  -- tarde hasta las 16:30).
  margen_minutos smallint not null default 45 check (margen_minutos between 0 and 240),
  sabado_manana boolean not null default true,
  sabado_tarde boolean not null default true,
  domingo_manana boolean not null default false,
  domingo_tarde boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint entrega_franjas_manana_orden check (manana_desde < manana_hasta),
  constraint entrega_franjas_tarde_orden check (tarde_desde < tarde_hasta),
  constraint entrega_franjas_no_se_pisan check (manana_hasta <= tarde_desde)
);

comment on table public.entrega_franjas_ajustes is 'Franjas de la entrega en el mismo día (Administración → Tarifas de envío): horas, margen de corte y franjas del fin de semana. Solo el administrador; la tienda la recibe del servidor (api/pago.ts).';

insert into public.entrega_franjas_ajustes (id) values (1) on conflict (id) do nothing;

alter table public.entrega_franjas_ajustes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'entrega_franjas_ajustes' and policyname = 'entrega_franjas_ajustes_admin_leer') then
    create policy entrega_franjas_ajustes_admin_leer on public.entrega_franjas_ajustes
      for select to authenticated using ((select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'entrega_franjas_ajustes' and policyname = 'entrega_franjas_ajustes_admin') then
    create policy entrega_franjas_ajustes_admin on public.entrega_franjas_ajustes
      for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
  end if;
end $$;

-- 2) La franja elegida en cada pedido.
alter table public.pedidos add column if not exists entrega_franja text check (entrega_franja in ('manana', 'tarde'));
alter table public.pedidos add column if not exists entrega_fecha date;

comment on column public.pedidos.entrega_franja is 'Franja de la entrega en el mismo día que eligió el cliente (manana | tarde). La apunta el servidor (api/pago.ts) una vez.';
comment on column public.pedidos.entrega_fecha is 'Día de la entrega en el mismo día que eligió el cliente (fecha de Madrid).';

create index if not exists pedidos_entrega_fecha_idx on public.pedidos (entrega_fecha) where entrega_fecha is not null;

-- 3) Zonas de entrega propia el mismo día.
update public.tarifas_envio
set codigos = '50410, 50420, 50430, 50001, 50004-50009, 50012, 50019',
    nombre = 'A domicilio cerca de Cuarte y Zaragoza sur (el mismo día)',
    updated_at = now()
where zona = 'local'
  and codigos is distinct from '50410, 50420, 50430, 50001, 50004-50009, 50012, 50019';

insert into public.tarifas_envio (zona, nombre, codigos, precio_eur, gratis_desde_eur, activa, orden)
select 'local_lejos', 'A domicilio en el resto de Zaragoza, Muel y La Muela (el mismo día)',
       '50450, 50196, 50002, 50003, 50010, 50011, 50013-50018, 50020-50022', 13.97, null, true, 25
where not exists (select 1 from public.tarifas_envio where zona = 'local_lejos');
