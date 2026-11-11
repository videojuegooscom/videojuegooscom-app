-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: ventas en mano registradas en VeoAura, en «Mis pedidos» (dueño, 2026-11-11, opción A: las ventas en
--            persona se registran en VeoAura, que hace la factura (REBU) y las manda a la tienda por el puente firmado).
-- Qué hace:
--   1) public.pedidos.origen: 'web' (lo de siempre, también todo lo que ya hay) o 'tienda_fisica' (una venta en mano que
--      llega de VeoAura con el evento «venta_tienda» de api/escaparate-veoaura.ts). Se guarda como un pedido más, ya
--      entregado, con su referencia VZ- (la pone la base de datos, como a todos) y sus líneas en pedido_items.
--   2) public.pedidos.veoaura_venta_id: el id de la venta en VeoAura (único cuando no es nulo): un reenvío de la misma
--      venta nunca la duplica, y un evento «factura» posterior puede referirse a ella por ese id.
--   3) public.pedidos.venta_forma_pago: cómo se pagó en mano (efectivo, tarjeta, bizum, transferencia u otro). Aparte de
--      pago_metodo, que es solo del pago online y lo dice Stripe.
--      El correo del comprador va en pedidos.email (como en cualquier pedido): mientras no haya cuenta con ese correo,
--      user_id queda nulo («pendiente»); el servidor la une a la cuenta al recibirla (si ya existe) o cuando el cliente
--      entra con ese correo (api/factura.ts, accion «unir_compras_tienda»). Sin funciones ni permisos nuevos: lo hace
--      el servidor con su clave.
--   4) Privacidad, «Con quién compartimos tus datos»: una frase sobre estas compras (solo una vez).
-- Quién escribe: solo el servidor (api/escaparate-veoaura.ts y api/factura.ts, con la clave del servidor). Las reglas de
--           pedidos NO cambian: el cliente sigue viendo solo los suyos (user_id) y el administrador todos.
-- Conectado con: public.pedidos, public.pedido_items, public.pedido_facturas, public.policy_pages;
--           api/escaparate-veoaura.ts, api/factura.ts, api/escaparate-retorno.ts (no reenvía estas ventas a VeoAura),
--           app/(tabs)/perfil.tsx («Compra en tienda»), app/admin/pedidos.tsx («En tienda»), app/admin/analytics.tsx;
--           docs/puente-veoaura-ventas-en-mano.md; pruebas/perfiles-sql.mjs, pruebas/escaparate-fotos.mjs,
--           pruebas/escaparate-retorno.mjs y pruebas/perfil-datos.mjs (sección VT).
-- Tipo:     aditiva: 3 columnas (origen con valor por defecto 'web'), sus comprobaciones, 2 índices y una frase de la
--           privacidad. No borra nada, no cambia permisos ni crea funciones. Se puede aplicar varias veces.
-- ============================================================================

-- 1-3) Columnas.
alter table public.pedidos add column if not exists origen text not null default 'web';
alter table public.pedidos add column if not exists veoaura_venta_id text;
alter table public.pedidos add column if not exists venta_forma_pago text;

comment on column public.pedidos.origen is 'web (pedido de la tienda online) o tienda_fisica (venta en mano registrada en VeoAura, evento venta_tienda). Solo lo escribe el servidor.';
comment on column public.pedidos.veoaura_venta_id is 'Id de la venta en VeoAura (evento venta_tienda): único, para no duplicarla.';
comment on column public.pedidos.venta_forma_pago is 'Cómo se pagó una venta en mano: efectivo, tarjeta, bizum, transferencia u otro.';

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('pedidos_origen_valido', 'origen in (''web'', ''tienda_fisica'')'),
      ('pedidos_veoaura_venta_id_largo', 'veoaura_venta_id is null or char_length(veoaura_venta_id) between 1 and 64'),
      ('pedidos_venta_forma_pago_valida', 'venta_forma_pago is null or venta_forma_pago in (''efectivo'', ''tarjeta'', ''bizum'', ''transferencia'', ''otro'')')
    ) as v(nombre, condicion)
  loop
    if not exists (select 1 from pg_constraint where conname = r.nombre and conrelid = 'public.pedidos'::regclass) then
      execute format('alter table public.pedidos add constraint %I check (%s)', r.nombre, r.condicion);
    end if;
  end loop;
end;
$$;

create unique index if not exists pedidos_veoaura_venta_id_key on public.pedidos (veoaura_venta_id) where veoaura_venta_id is not null;
create index if not exists pedidos_origen_idx on public.pedidos (origen);

-- 4) Política de privacidad: las compras en persona que manda VeoAura (al final de «Con quién compartimos tus datos»).
update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Con quién compartimos tus datos'
                   then jsonb_set(s.sec, '{body}', to_jsonb((s.sec ->> 'body') || ' Si nos compras en persona y nos das tu correo, nuestro programa de gestión (VeoAura) nos envía esa compra y su factura para que las veas en «Mis pedidos» de tu cuenta; tu correo solo se usa para unirla a tu cuenta.'))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'privacidad'
  and exists (select 1 from jsonb_array_elements(p.sections) as s (sec) where s.sec ->> 'heading' = 'Con quién compartimos tus datos')
  and p.sections::text not like '%Si nos compras en persona y nos das tu correo%';
