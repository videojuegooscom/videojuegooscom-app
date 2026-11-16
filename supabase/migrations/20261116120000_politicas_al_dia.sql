-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: políticas al día con los últimos cambios de la tienda (dueño, 2026-11-16: «Recuerda ir actualizando las
--            políticas con los cambios que vamos realizando y últimos cambios»).
-- Qué hace: cambia el texto de algunos apartados (por su título) para que digan lo mismo que hace la tienda:
--   - Envíos → «Entregas en Zaragoza»: zonas y precios de la entrega propia el mismo día (9,97 € cerca de Cuarte y
--     Zaragoza hasta la Plaza España; 13,97 € resto de Zaragoza, Muel y La Muela), franjas 11:00-12:45 y 17:15-19:00
--     (pedido hasta 45 min antes; sábados mañana y tarde, domingos solo tarde) y entrega en mano gratis.
--   - Envíos → «Zonas de envío» e «Incidencias en el transporte»: contacto primero por el chat de la tienda.
--   - Devoluciones → «Derecho de desistimiento»: se pide por el chat de la tienda o desde Mis pedidos.
--   - Términos → «Disponibilidad»: si un artículo deja de estar disponible, el pedido se cancela con su motivo en Mis
--     pedidos, se devuelve el importe completo y se puede activar «Avisarme cuando haya otro».
--   Cada cambio solo se hace si el apartado existe; repetirla deja el mismo texto. No toca ningún otro apartado.
-- Conectado con: public.policy_pages (app/politicas/[slug].tsx), lib/envio.ts (zonas y franjas), app/admin/pedidos.tsx y
--           app/(tabs)/perfil.tsx (cancelación con motivo y aviso).
-- Tipo:     cambia textos de cuatro políticas. No borra nada.
-- ============================================================================

update public.policy_pages p
set sections = (
      select jsonb_agg(
               case s.sec ->> 'heading'
                 when 'Entregas en Zaragoza' then jsonb_set(s.sec, '{body}', to_jsonb(
                   'Somos una tienda online, sin tienda física. Entregamos nosotros mismos el mismo día, en dos franjas: de 11:00 a 12:45 y de 17:15 a 19:00 (puedes pedir para una franja hasta 45 minutos antes de que empiece; los sábados, mañana y tarde, y los domingos, solo por la tarde). Precio de la entrega a domicilio: 9,97 € en Cuarte de Huerva, Santa Fe, Cadrete, María de Huerva y Zaragoza hasta la Plaza España; 13,97 € en el resto de Zaragoza, Muel y La Muela. La entrega en mano es gratis. Eliges la franja al pagar y te avisamos por el chat de la tienda cuando salimos.'::text))
                 when 'Zonas de envío' then jsonb_set(s.sec, '{body}', to_jsonb(
                   'Enviamos con Correos a toda la península. Para Baleares, Canarias, Ceuta y Melilla, escríbenos antes de comprar por el chat de la tienda para confirmar plazo y coste, ya que pueden variar.'::text))
                 when 'Incidencias en el transporte' then jsonb_set(s.sec, '{body}', to_jsonb(
                   'Si tu pedido llega dañado o no llega en el plazo indicado, escríbenos por el chat de la tienda (o, si lo prefieres, por correo o WhatsApp al 627 748 741) y lo resolvemos contigo.'::text))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'envios';

update public.policy_pages p
set sections = (
      select jsonb_agg(
               case s.sec ->> 'heading'
                 when 'Derecho de desistimiento (14 días)' then jsonb_set(s.sec, '{body}', to_jsonb(
                   'Como consumidor, dispones de 14 días naturales desde que recibes el producto para desistir de la compra sin necesidad de justificar el motivo, conforme a la normativa española y europea de protección de consumidores. Para ejercerlo, escríbenos por el chat de la tienda o desde Mis pedidos indicando el pedido a devolver.'::text))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'devoluciones';

update public.policy_pages p
set sections = (
      select jsonb_agg(
               case s.sec ->> 'heading'
                 when 'Disponibilidad' then jsonb_set(s.sec, '{body}', to_jsonb(
                   'Cada artículo es una unidad única y está sujeto a disponibilidad: en cuanto se paga, deja de estar a la venta. Si un artículo deja de estar disponible tras tu pedido, cancelamos el pedido, verás el motivo en Mis pedidos, te devolvemos el importe completo por el mismo medio de pago y, si quieres, puedes activar «Avisarme cuando haya otro» para que te avisemos cuando llegue uno parecido.'::text))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'terminos';
