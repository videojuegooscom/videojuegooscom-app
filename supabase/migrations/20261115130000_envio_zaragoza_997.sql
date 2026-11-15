-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: precio de la entrega a domicilio en Zaragoza y Cuarte de Huerva (dueño, 2026-11-15: «A domicilio en Zaragoza
--            (50001-50022) y Cuarte (50410), el mismo día: tiene que salir 9,97 €»; la entrega en mano sigue gratis).
-- Qué hace: pone 9,97 € a la zona «local» de las tarifas de envío (estaba a 0 €). Solo si sigue a 0 €: si el dueño ya
--           le ha puesto otro precio en Administración → Tarifas de envío, no lo pisa. La tienda (lib/envio.ts) y la base
--           de datos (calcular_envio, al guardar el pedido) lo leen de aquí: a partir de ahora el pago enseña «Envío (A
--           domicilio en Zaragoza y Cuarte de Huerva) 9,97 €» y Stripe cobra artículos + 9,97 €. La entrega en mano
--           (zona «mano») sigue a 0 € y el pago la enseña como «Gratis». Los pedidos ya hechos no cambian.
-- Conectado con: public.tarifas_envio (Administración → Tarifas de envío, app/admin/envios.tsx), public.calcular_envio,
--           lib/envio.ts, app/checkout.tsx y app/(tabs)/cesta.tsx.
-- Tipo:     cambia un precio (una fila). No borra nada. Repetirla no cambia nada.
-- ============================================================================

update public.tarifas_envio
set precio_eur = 9.97
where zona = 'local'
  and precio_eur = 0;
