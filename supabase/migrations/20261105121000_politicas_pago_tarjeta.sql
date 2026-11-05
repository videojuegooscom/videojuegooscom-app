-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: Stripe en la política de privacidad y en los términos (pago con tarjeta, dueño 2026-11-05).
-- CUÁNDO: al pasar al cobro REAL (antes de poner la clave sk_live_ en Vercel). Mientras la clave sea de prueba, el pago
--         con tarjeta solo lo ve el administrador y las políticas no deben hablar de algo que los clientes no tienen.
--         Con la clave real, api/pago.ts no ofrece el pago hasta que la privacidad nombra a Stripe (primero la privacidad).
-- Qué hace (una sola vez, añadiendo una frase al final; lo demás queda como esté, también si el dueño lo editó):
--   1) Privacidad, «Con quién compartimos tus datos»: Stripe es el proveedor de pagos; la tarjeta se escribe en su página
--      y la tienda nunca la ve; a Stripe solo se le pasa el número del pedido y su importe.
--   2) Términos, «Precios y pago»: pagar con tarjeta en la página segura de Stripe o confirmar sin pagar y hablarlo por
--      el chat; si un pedido pagado no se puede servir, se devuelve el importe completo por el mismo medio.
-- Tipo:     solo cambia texto de policy_pages. No borra nada. Se puede aplicar varias veces (si ya nombra a Stripe, no
--           toca nada).
-- Pruebas:  pruebas/perfiles-sql.mjs (apartado «Pago con tarjeta»).
-- ============================================================================

-- 1) Política de privacidad.
update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Con quién compartimos tus datos'
                   then jsonb_set(s.sec, '{body}', to_jsonb((s.sec ->> 'body') || ' Si pagas con tarjeta, el pago lo gestiona Stripe (Stripe Payments Europe, Ltd.), nuestro proveedor de pagos: escribes tu tarjeta y tu correo electrónico directamente en su página de pago segura y la tienda nunca ve ni guarda los datos de tu tarjeta. A Stripe solo le pasamos el número de tu pedido y su importe, y Stripe nos dice si el pago se ha hecho y su referencia, para poder devolvértelo si hace falta.'))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'privacidad'
  and exists (select 1 from jsonb_array_elements(p.sections) as s (sec) where s.sec ->> 'heading' = 'Con quién compartimos tus datos')
  and not exists (select 1 from jsonb_array_elements(p.sections) as s (sec) where s.sec ->> 'body' like '%Stripe%');

-- 2) Términos y condiciones.
update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Precios y pago'
                   then jsonb_set(s.sec, '{body}', to_jsonb((s.sec ->> 'body') || ' Si pagas con tarjeta, lo haces en la página de pago segura de Stripe (la tienda nunca ve los datos de tu tarjeta); también puedes confirmar el pedido sin pagar y acordar el pago con nosotros por el chat de la tienda. Si ya lo has pagado y no podemos servirlo, te devolvemos el importe completo por el mismo medio de pago.'))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'terminos'
  and exists (select 1 from jsonb_array_elements(p.sections) as s (sec) where s.sec ->> 'heading' = 'Precios y pago')
  and not exists (select 1 from jsonb_array_elements(p.sections) as s (sec) where s.sec ->> 'body' like '%Stripe%');
