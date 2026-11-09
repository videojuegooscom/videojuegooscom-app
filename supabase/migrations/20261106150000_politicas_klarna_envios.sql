-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: Klarna en la privacidad y los términos, y la política de envíos con las entregas reales (dueño 2026-11-06:
--            «que en cada página no aparezca nada de textos extraños para los clientes» y «desde la pasarela de pago con
--            Stripe se puede pagar a plazos con la app de Klarna»).
-- Qué hace (solo texto; lo que el dueño ya haya cambiado a mano se queda como esté):
--   1) Privacidad, «Con quién compartimos tus datos»: si el cliente paga con Klarna, sus datos los trata Klarna. Hasta
--      que esta frase exista, api/pago.ts no ofrece Klarna (primero la privacidad).
--   2) Términos, «Precios y pago»: «el checkout de la app» pasa a «la página de pago de la tienda», y se nombra Klarna.
--   3) Envíos: sin «recoger en tienda» ni «tienda física» (la tienda es solo online), plazos reales (sale en 1-2 días y
--      llega en 72 horas como máximo) y coste según destino e importe. Cada texto solo se cambia si sigue siendo el
--      antiguo, palabra por palabra.
-- Conectado con: public.policy_pages (privacidad, términos y envíos); se ven en app/politicas/[slug].tsx, se editan en
--           app/admin/policies.tsx y api/pago.ts las lee antes de ofrecer Klarna.
-- Tipo:     solo cambia texto de policy_pages. No borra nada. Se puede aplicar varias veces (la segunda no cambia nada).
-- ============================================================================

-- 1) Política de privacidad: Klarna.
update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Con quién compartimos tus datos'
                   then jsonb_set(s.sec, '{body}', to_jsonb((s.sec ->> 'body') || ' Si eliges pagar con Klarna (por ejemplo, a plazos), Klarna Bank AB (publ) trata los datos que le des en su página para aprobar y gestionar ese pago, como responsable de ese tratamiento y según su propia política de privacidad; nosotros solo sabemos, por Stripe, si el pago se ha hecho, y para todo lo demás de esta política cuenta igual que pagar con tarjeta.'))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'privacidad'
  and exists (select 1 from jsonb_array_elements(p.sections) as s (sec) where s.sec ->> 'heading' = 'Con quién compartimos tus datos')
  and not exists (select 1 from jsonb_array_elements(p.sections) as s (sec) where s.sec ->> 'body' like '%Klarna%');

-- 2) Términos y condiciones: sin «checkout de la app» y con Klarna.
update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Precios y pago'
                   then jsonb_set(s.sec, '{body}', to_jsonb(
                          replace(
                            replace(s.sec ->> 'body',
                              'a través de los métodos disponibles en el checkout de la app.',
                              'a través de los métodos disponibles en la página de pago de la tienda.'),
                            'Si pagas con tarjeta, lo haces en la página de pago segura de Stripe (la tienda nunca ve los datos de tu tarjeta);',
                            'Si pagas con tarjeta o con Klarna (que permite pagar a plazos; la aprobación y sus condiciones las pone Klarna), lo haces en la página de pago segura de Stripe (la tienda nunca ve los datos de tu tarjeta);')))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'terminos'
  and exists (
        select 1 from jsonb_array_elements(p.sections) as s (sec)
        where s.sec ->> 'heading' = 'Precios y pago'
          and (s.sec ->> 'body' like '%checkout de la app%' or s.sec ->> 'body' like '%Si pagas con tarjeta, lo haces%'));

-- 3) Política de envíos: la entrada.
update public.policy_pages
set intro = 'Enviamos a toda España, bien protegido y con seguimiento. En Zaragoza te lo llevamos el mismo día, a domicilio o en mano en Cuarte de Huerva.',
    updated_at = now()
where slug = 'envios'
  and intro = 'Enviamos a toda España, bien protegido y con seguimiento. Si lo prefieres, también puedes recoger tu pedido en tienda sin coste.';

-- 3b) Política de envíos: plazos, coste y entregas en Zaragoza (cada apartado solo si sigue con el texto antiguo).
update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Plazos de preparación y entrega'
                  and s.sec ->> 'body' = 'Preparamos cada pedido en 24–48h laborables tras confirmarse el pago. El transporte añade normalmente 24–72h laborables adicionales en península. Te avisamos por email o WhatsApp en cuanto el pedido sale de tienda, con su número de seguimiento.'
                   then jsonb_set(s.sec, '{body}', to_jsonb('El pedido sale de nuestro almacén en 1-2 días tras confirmarse el pago y llega a destino en 72 horas como máximo. Te avisamos en cuanto sale, con su número de seguimiento.'::text))
                 when s.sec ->> 'heading' = 'Coste de envío'
                  and s.sec ->> 'body' = 'El coste se calcula automáticamente en el checkout según el destino y el peso/volumen del pedido, antes de confirmar la compra.'
                   then jsonb_set(s.sec, '{body}', to_jsonb('El coste se calcula automáticamente al finalizar la compra, según el destino y el importe del pedido, y lo ves antes de pagar o confirmar.'::text))
                 when s.sec ->> 'heading' = 'Recogida en tienda'
                  and s.sec ->> 'body' = 'Puedes elegir recoger tu pedido en nuestra tienda física sin coste de envío. Te avisamos en cuanto esté listo para recoger.'
                   then jsonb_build_object(
                          'heading', 'Entregas en Zaragoza',
                          'body', 'Somos una tienda online, sin tienda física. En Zaragoza te llevamos el pedido a casa el mismo día, o te lo entregamos en mano en Cuarte de Huerva. Te avisamos por el chat de la tienda cuando esté listo.')
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'envios'
  and exists (
        select 1 from jsonb_array_elements(p.sections) as s (sec)
        where (s.sec ->> 'heading' = 'Plazos de preparación y entrega' and s.sec ->> 'body' like 'Preparamos cada pedido en 24–48h%')
           or (s.sec ->> 'heading' = 'Coste de envío' and s.sec ->> 'body' like '%peso/volumen%')
           or (s.sec ->> 'heading' = 'Recogida en tienda'));
