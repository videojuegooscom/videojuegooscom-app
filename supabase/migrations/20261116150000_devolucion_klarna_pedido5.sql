-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: apunta la referencia de la devolución del pedido nº 5 (VZ-HDSF-5KKX, pagado con Klarna) y la lección.
--            El 2026-11-16 el dueño pulsó «Devolver el pago»: Stripe devolvió los 270 € con la referencia
--            pyr_1UcR9dRxzwL9sEpJ4iz3lyXY (las devoluciones de Klarna empiezan por «pyr_», no por «re_»), pero
--            api/pago.ts solo daba por buena una referencia «re_…» y enseñó «Stripe no ha podido hacer la devolución».
--            El aviso de Stripe sí apuntó lo devuelto y la hora, pero sin la referencia.
-- Qué hace: 1) pone la referencia en ese pedido (solo si sigue sin ella y su pago es el de Stripe);
--           2) apunta la lección (si no existe).
-- Conectado con: api/pago.ts (REFERENCIA_DEVOLUCION, devolverPago, apuntarDevolucionDeAviso), public.pedidos,
--                public.aprendizajes y pruebas/pago-api.mjs (P10 y su control).
-- Tipo:     corrige un dato y añade una lección. No borra nada. Repetirla no cambia nada.
-- ============================================================================

update public.pedidos
   set devolucion_referencia = 'pyr_1UcR9dRxzwL9sEpJ4iz3lyXY'
 where codigo_seguimiento = 'VZ-HDSF-5KKX'
   and pago_referencia = 'pi_3Ubz0FRxzwL9sEpJ1rf5lbwe'
   and devuelto_en is not null
   and devolucion_referencia is null;

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Las referencias de Stripe cambian según el método de pago: no se da por fallido lo que Stripe ha hecho', 'codigo', 1,
   'Antes de comprobar el formato de un identificador de Stripe, se mira en la documentación o en un pago real de cada método (tarjeta, Klarna, Bizum): las devoluciones de tarjeta empiezan por «re_» y las de Klarna por «pyr_». Lo que decide si salió bien es la respuesta de Stripe (código 200 y estado succeeded o pending), y la prueba cubre cada método que la tienda acepta, con su control.',
   'Fallo del 2026-11-16, pedido 5 (Klarna, 270 €): Stripe devolvió el dinero con «pyr_…», la tienda solo aceptaba «re_…» y le dijo al dueño «Stripe no ha podido hacer la devolución».',
   'api/pago.ts acepta «re_» y «pyr_» (REFERENCIA_DEVOLUCION) en el botón y en el aviso de Stripe; pruebas/pago-api.mjs P10 devuelve un pago de Klarna y su control falla si se vuelve a aceptar solo «re_».')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
