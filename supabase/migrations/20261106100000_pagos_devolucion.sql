-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: devoluciones del pago con tarjeta (Stripe). Dueño, 2026-11-06: «quiero un botón para devolver el pago y
--            otro para cancelar el pedido desde Pedidos».
-- Qué hace: añade a pedidos lo devuelto (todas nulas: los pedidos de antes quedan igual):
--   devuelto_eur           lo que Stripe ha devuelto de verdad;
--   devuelto_en            cuándo;
--   devolucion_referencia  la devolución en Stripe (re_…), si Stripe la da.
-- Quién las escribe: solo el servidor (api/pago.ts): el botón «Devolver el pago» de Administración → Pedidos (solo el
--           administrador) y el aviso firmado de Stripe cuando se devuelve desde el propio Stripe (charge.refunded).
-- Conectado con: columnas devuelto_* de public.pedidos; api/pago.ts, app/admin/pedidos.tsx,
--           app/admin/cliente/[userId].tsx y app/(tabs)/perfil.tsx.
-- Permisos: no cambia ninguno. Sin security definer ni grants.
-- Tipo:     aditiva: 3 columnas nulas y 2 comprobaciones. No borra ni cambia filas. Repetirla no cambia nada.
-- Pruebas:  pruebas/perfiles-sql.mjs (apartado «Devoluciones») y pruebas/pago-api.mjs.
-- ============================================================================

alter table public.pedidos add column if not exists devuelto_eur numeric(10, 2);
alter table public.pedidos add column if not exists devuelto_en timestamptz;
alter table public.pedidos add column if not exists devolucion_referencia text;

comment on column public.pedidos.devuelto_eur is 'Pago con tarjeta: lo que Stripe ha devuelto de verdad. Solo lo escribe api/pago.ts.';
comment on column public.pedidos.devolucion_referencia is 'Devolución en Stripe (re_…).';

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('pedidos_devuelto_eur_valido', 'devuelto_eur is null or (devuelto_eur > 0 and devuelto_en is not null)'),
      ('pedidos_devolucion_referencia_largo', 'devolucion_referencia is null or char_length(devolucion_referencia) <= 255')
    ) as v(nombre, condicion)
  loop
    if not exists (select 1 from pg_constraint where conname = r.nombre and conrelid = 'public.pedidos'::regclass) then
      execute format('alter table public.pedidos add constraint %I check (%s)', r.nombre, r.condicion);
    end if;
  end loop;
end;
$$;
