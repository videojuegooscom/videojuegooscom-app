-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-05 (pago con tarjeta con Stripe, «clave puesta y empieza Stripe»). Claude la apunta
--            al montar el pago: cómo se cobra sin fiarse del navegador y cómo se prueba sin tocar Stripe.
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Pagos con tarjeta: el importe lo pone la base de datos y «pagado» lo confirma el servidor preguntando a Stripe', 'seguridad', 1,
   'Lo que se cobra con tarjeta sale del total GUARDADO del pedido (pedidos.total_eur, con su envío), nunca de lo que mande el navegador, y a Stripe solo se le pasa el número del pedido y su importe (ningún dato del cliente: la tarjeta y el correo los escribe el cliente en la página de Stripe). «Pagado» solo lo apunta el servidor (api/pago.ts) después de leer la sesión en Stripe: terminada, cobrada, en euros y de ese pedido; la vuelta con ?pago=ok o un aviso de Stripe sin la firma buena no valen. Un pedido nunca tiene dos cobros abiertos (la sesión abierta se reutiliza y, si el total cambió, se cierra antes de abrir otra) y solo lo paga quien lo hizo (su cuenta o la clave de la compra). Con la clave de prueba de Stripe solo lo ve el administrador; el cobro real no se abre hasta que la política de privacidad nombra a Stripe. Administración → Pedidos enseña lo cobrado, lo de prueba y lo que hay que devolver. Las pruebas simulan Stripe sin nombrar su API real (el guardián para los scripts que la nombran) y cada defensa tiene su «prueba de las pruebas» (pruebas/pago-api.mjs).',
   'Marcar el pedido como pagado al volver de Stripe con ?pago=ok, o mandar a Stripe el total que calcula la página.',
   'POST /api/pago {accion: "confirmar", sesion}: el servidor lee la sesión en Stripe (complete, paid, eur y metadata.pedido_id) y solo entonces apunta pago_estado = ''pagado'' con lo cobrado de verdad.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
