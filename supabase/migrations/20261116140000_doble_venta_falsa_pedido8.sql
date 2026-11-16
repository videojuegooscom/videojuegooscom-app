-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: quita la «doble venta» puesta por error al pedido nº 8 (VZ-ZHUJ-57ME, PlayStation 5 Pro, pagado con Klarna
--            el 2026-11-16). Al hacer el pedido, VeoAura recibió el aviso y devolvió «vendido» 11 segundos después; al
--            llegar el cobro, la tienda vio el artículo ya vendido y lo marcó como doble venta. Era la misma venta.
-- Qué hace: 1) borra la marca doble_venta_en de ese pedido (solo si sigue pagado y sin cancelar);
--           2) apunta en el artículo que se vendió a ese pedido (solo si no tiene pedido apuntado).
--           api/pago.ts ya no lo confunde: solo cuenta como doble venta lo vendido ANTES de hacer el pedido.
-- Conectado con: api/pago.ts (apartarArticulos, articuloYaVendido), public.pedidos, public.products.
-- Tipo:     corrige dos datos de una venta. No borra filas. Repetirla no cambia nada.
-- ============================================================================

update public.pedidos
   set doble_venta_en = null
 where codigo_seguimiento = 'VZ-ZHUJ-57ME'
   and pago_estado = 'pagado'
   and estado <> 'cancelado'
   and doble_venta_en is not null;

update public.products pr
   set vendido_pedido_id = pe.id
  from public.pedidos pe
 where pe.codigo_seguimiento = 'VZ-ZHUJ-57ME'
   and pr.vendido_pedido_id is null
   and pr.vendido_en is not null
   and pr.vendido_en >= pe.created_at
   and exists (select 1 from public.pedido_items pi where pi.pedido_id = pe.id and pi.product_id = pr.id);
