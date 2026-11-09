-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: primeros precios de envío (dueño, 2026-11-07: «Pon tú automáticamente precios de las tarifas reales y luego,
--            si alguno no corresponde, te lo hago saber; yo trabajo con Correos»).
-- Qué hace (solo en las zonas que siguen como las dejó la migración 20261104210000: a 0 € y sin tocar por el dueño):
--   - Península: 6,90 € por pedido, como referencia de un paquete estándar de Correos a domicilio. Es una ESTIMACIÓN (no
--     hay acceso a la web de Correos desde el servidor); el dueño la ajusta en Administración → Tarifas de envío.
--   - Baleares, Canarias, Ceuta y Melilla: dejan de venderse con envío desde la web (activa = false). Al finalizar la
--     compra sale «Escríbenos por el chat para envíos a esta zona», que es lo que ya dice la política de envíos («escríbenos
--     antes de comprar para confirmar plazo y coste»). Canarias, Ceuta y Melilla además llevan trámites de aduana.
--   - Entrega en mano y Zaragoza a domicilio el mismo día (las hace el dueño, no Correos): siguen a 0 €.
-- Conectado con: public.tarifas_envio; la usan lib/envio.ts (cesta y app/checkout.tsx) y app/admin/envios.tsx.
-- Tipo:     solo cambia datos de tarifas_envio. No borra nada. Repetirla no cambia nada (ni pisa lo que el dueño ponga).
-- ============================================================================

update public.tarifas_envio
set precio_eur = 6.90,
    updated_at = now()
where zona = 'peninsula'
  and precio_eur = 0
  and updated_by is null;

update public.tarifas_envio
set activa = false,
    updated_at = now()
where zona in ('baleares', 'canarias', 'ceuta_melilla')
  and precio_eur = 0
  and activa
  and updated_by is null;
