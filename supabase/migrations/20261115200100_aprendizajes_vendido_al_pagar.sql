-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-15 (fallo real: la Xbox Series S del pedido VZ-HDSF-5KKX, pagada con Klarna a las
--            09:45, siguió a la venta y otro cliente la volvió a pagar a las 18:35; el dueño tuvo que devolverlo).
-- Qué hace: apunta la lección «Un artículo único deja de venderse en cuanto se paga».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx),
--                supabase/migrations/20261115200000_vendido_al_pagar.sql y api/pago.ts (apartarArticulos).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Un artículo único deja de venderse en cuanto se paga', 'negocio', 1,
   'En la tienda cada artículo es UNA unidad de segunda mano. En el mismo sitio en que el servidor apunta el pago (webhook de Stripe, «confirmar» o «crear» con la sesión ya cobrada) sus artículos quedan vendidos (is_active = false, vendido_en y el pedido), una sola vez y sin borrar nada. Antes de abrir un cobro se comprueba que el artículo no esté vendido ni en otro pedido pagado («Este artículo se acaba de vender»). Si aun así llega un segundo cobro, el pedido queda marcado y Pedidos y el aviso al móvil dicen «Artículo ya vendido: devuelve el pago». Cancelar un pedido pagado no devuelve el artículo a la venta: lo decide el dueño con «Volver a poner a la venta».',
   'El pago se apunta en pedidos y el artículo sigue PUBLISHED e is_active = true: otro cliente lo vuelve a comprar y pagar horas después.',
   'Al apuntar el pago, la consola sale de la tienda con vendido_en y el pedido VZ-…; un segundo intento de pago recibe «Este artículo se acaba de vender» sin ir a Stripe.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
