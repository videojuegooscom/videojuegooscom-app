-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: un artículo único deja de venderse en cuanto se paga (dueño, 2026-11-15)
-- Qué hace: el 2026-11-15 la «Xbox Series S + Mando Élite 2 Con estuche» se pagó con Klarna a las 09:45 (pedido
--           VZ-HDSF-5KKX) y siguió a la venta: otro cliente la volvió a pagar a las 18:35 (VZ-H3ZR-U6KU, devuelto y
--           cancelado). Desde ahora api/pago.ts, al apuntar el pago, marca sus artículos como vendidos (is_active = false
--           y vendido_en, lo mismo que el evento «vendido» de VeoAura) y apunta a qué pedido se vendieron; si el
--           artículo ya estaba vendido antes de ese pago, marca el pedido como doble venta para que el dueño devuelva el
--           pago. Esta migración:
--           1) products.vendido_pedido_id: el pedido pagado al que se vendió (Productos dice «Vendido (pedido VZ-…)»;
--              «Volver a poner a la venta» en Pedidos lo vacía). Sin enlace obligatorio: un pedido nunca se borra.
--           2) pedidos.doble_venta_en: cuándo se cobró un pedido con un artículo que ya estaba vendido (Pedidos dice
--              «Artículo ya vendido: devuelve el pago» y lo cuenta y filtra).
--           3) Arreglo de hoy: marca como vendido el artículo de VZ-HDSF-5KKX SOLO si sigue a la venta y ese pedido sigue
--              pagado y sin cancelar (si el dueño ya lo cambió, no toca nada).
-- Tipo:     aditiva (columnas e índice con «if not exists» y un update acotado a un artículo). Sin permisos nuevos ni
--           funciones: las columnas las escribe el servidor (clave del servidor) y el administrador con las reglas que
--           ya tienen products y pedidos. Se puede aplicar dos veces.
-- Conectado con: api/pago.ts (apartarArticulos, articuloYaVendido), app/admin/pedidos.tsx, app/admin/products.tsx,
--           app/admin/analytics.tsx, app/checkout.tsx; pruebas/pago-api.mjs, pruebas/perfil-datos.mjs (VENDP) y
--           pruebas/perfiles-sql.mjs.
-- ============================================================================

alter table public.products
  add column if not exists vendido_pedido_id uuid;

comment on column public.products.vendido_pedido_id is
  'Pedido pagado al que se vendió este artículo único (lo pone api/pago.ts al apuntar el pago). Vacío si se vendió fuera de la web o está a la venta.';

create index if not exists products_vendido_pedido_idx on public.products (vendido_pedido_id) where vendido_pedido_id is not null;

alter table public.pedidos
  add column if not exists doble_venta_en timestamptz;

comment on column public.pedidos.doble_venta_en is
  'Cuándo se cobró este pedido con un artículo que ya estaba vendido (a otro pedido pagado o fuera de la web): hay que devolver el pago.';

-- Arreglo de hoy (2026-11-15): la Xbox del pedido VZ-HDSF-5KKX, solo si sigue a la venta y el pedido sigue pagado.
update public.products pr
   set is_active = false,
       vendido_en = now(),
       vendido_pedido_id = pe.id,
       updated_at = now()
  from public.pedidos pe
 where pr.id = '60f1bafb-b4af-49c5-b074-984eb6677a08'
   and pr.is_active = true
   and pr.vendido_en is null
   and pe.codigo_seguimiento = 'VZ-HDSF-5KKX'
   and pe.pago_estado = 'pagado'
   and pe.estado <> 'cancelado'
   and exists (select 1 from public.pedido_items pi where pi.pedido_id = pe.id and pi.product_id = pr.id);
