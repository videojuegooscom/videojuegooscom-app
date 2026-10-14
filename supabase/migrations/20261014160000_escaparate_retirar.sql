-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: puente VeoAura → tienda, evento «retirar» y respuesta rápida
-- Qué hace: lo que necesita api/escaparate-veoaura.ts para el contrato nuevo:
--   1. products.retirado_en: cuándo pidió VeoAura retirarlo (queda oculto, sin borrarlo).
--      Un «publicar» posterior lo vuelve a poner a null y a la venta.
--   2. products.veoaura_envio: sello del último envío de VeoAura. Las fotos se copian
--      después de responder; si llega otro envío mientras tanto, gana el último.
-- Tipo:     aditiva. No borra datos.
-- ============================================================================

alter table public.products
  add column if not exists retirado_en timestamptz,
  add column if not exists veoaura_envio text;
