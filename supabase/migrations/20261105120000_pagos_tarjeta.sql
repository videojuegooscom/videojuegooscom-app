-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: pago con tarjeta de los pedidos (Stripe). Dueño, 2026-11-05: «clave puesta y empieza Stripe».
-- Qué hace: añade a pedidos las columnas del pago con tarjeta (todas nulas: los pedidos de antes quedan igual):
--   pago_estado      'iniciado' (el cliente abrió la página de pago de Stripe) o 'pagado' (Stripe lo ha confirmado);
--   pago_modo        'prueba' (clave de prueba de Stripe: no se cobra nada) o 'real';
--   pago_sesion      la sesión de pago de Stripe (cs_…): así un pedido nunca tiene dos cobros abiertos;
--   pago_referencia  el pago en Stripe (pi_…), para encontrarlo y devolverlo desde Stripe;
--   pagado_eur       lo que Stripe ha cobrado de verdad (si después cambia el total del pedido, se ve la diferencia);
--   pago_iniciado_en y pagado_en.
-- Quién las escribe: solo el servidor (api/pago.ts, con la clave del servidor) y solo después de preguntárselo a
--           Stripe. El administrador las ve en Administración → Pedidos; un cliente solo ve sus pedidos, como hasta ahora.
-- Permisos: no cambia ninguno (las reglas de pedidos siguen igual). Sin security definer ni grants.
-- Tipo:     aditiva: 7 columnas nulas y sus comprobaciones. No borra ni cambia filas. Repetirla no cambia nada.
-- La política de privacidad y los términos (Stripe) van aparte, en 20261105121000_politicas_pago_tarjeta.sql, para
--           aplicarla al pasar al cobro real: mientras la clave sea de prueba, solo el administrador ve el pago.
-- Pruebas:  pruebas/perfiles-sql.mjs (apartado «Pago con tarjeta», SQL real en una base aislada) y pruebas/pago-api.mjs.
-- ============================================================================

alter table public.pedidos add column if not exists pago_estado text;
alter table public.pedidos add column if not exists pago_modo text;
alter table public.pedidos add column if not exists pago_sesion text;
alter table public.pedidos add column if not exists pago_referencia text;
alter table public.pedidos add column if not exists pagado_eur numeric(10, 2);
alter table public.pedidos add column if not exists pago_iniciado_en timestamptz;
alter table public.pedidos add column if not exists pagado_en timestamptz;

comment on column public.pedidos.pago_estado is 'Pago con tarjeta (Stripe): iniciado o pagado. Solo lo escribe api/pago.ts tras preguntárselo a Stripe.';
comment on column public.pedidos.pago_modo is 'prueba (clave de prueba de Stripe, sin cobro) o real.';
comment on column public.pedidos.pago_sesion is 'Sesión de pago de Stripe Checkout (cs_…).';
comment on column public.pedidos.pago_referencia is 'Pago en Stripe (pi_…), para encontrarlo o devolverlo.';
comment on column public.pedidos.pagado_eur is 'Lo que Stripe ha cobrado de verdad.';

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('pedidos_pago_estado_valido', 'pago_estado is null or pago_estado in (''iniciado'', ''pagado'')'),
      ('pedidos_pago_modo_valido', 'pago_modo is null or pago_modo in (''prueba'', ''real'')'),
      ('pedidos_pago_sesion_largo', 'pago_sesion is null or char_length(pago_sesion) <= 255'),
      ('pedidos_pago_referencia_largo', 'pago_referencia is null or char_length(pago_referencia) <= 255'),
      ('pedidos_pagado_eur_valido', 'pagado_eur is null or pagado_eur >= 0'),
      ('pedidos_pagado_completo', 'pago_estado is distinct from ''pagado'' or (pagado_eur is not null and pagado_en is not null and pago_modo is not null)')
    ) as v(nombre, condicion)
  loop
    if not exists (select 1 from pg_constraint where conname = r.nombre and conrelid = 'public.pedidos'::regclass) then
      execute format('alter table public.pedidos add constraint %I check (%s)', r.nombre, r.condicion);
    end if;
  end loop;
end;
$$;
