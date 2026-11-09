-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: VeoAura en la política de privacidad (dueño, 2026-11-03).
--   Los pedidos con artículos de VeoAura (el programa de gestión del negocio) ya se le comunican sin datos del cliente
--   (número, artículo, forma de entrega y precio). A partir de ahora, cuando el pedido se entrega (en la tienda cuenta
--   como pagado), también el nombre, el correo y el teléfono del cliente, para su ficha de clientes en VeoAura
--   (api/escaparate-retorno.ts, aviso «pedido_pagado»). La política lo dice ANTES de que empiece: se añade una frase al
--   final de «Con quién compartimos tus datos» (una sola vez).
-- Qué hace: añade a la política de privacidad la frase sobre lo que se comunica a VeoAura.
-- Conectado con: public.policy_pages; app/politicas/[slug].tsx, app/admin/policies.tsx y api/escaparate-retorno.ts
--           (el aviso «pedido_pagado» que la frase explica).
-- Tipo:     solo cambia el texto de la política de privacidad. No borra nada. Se puede aplicar varias veces.
-- ============================================================================

update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Con quién compartimos tus datos'
                   then jsonb_set(s.sec, '{body}', to_jsonb((s.sec ->> 'body') || ' Si tu pedido incluye artículos que gestionamos con VeoAura, el programa de gestión del negocio, le comunicamos ese pedido (número, artículo, forma de entrega y precio) y, cuando te lo entregamos, también tu nombre, tu correo electrónico y tu teléfono, para tener tu ficha de cliente. No le pasamos tu dirección ni otros datos.'))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'privacidad'
  and exists (select 1 from jsonb_array_elements(p.sections) as s (sec) where s.sec ->> 'heading' = 'Con quién compartimos tus datos')
  and not exists (select 1 from jsonb_array_elements(p.sections) as s (sec) where s.sec ->> 'body' like '%VeoAura%');
