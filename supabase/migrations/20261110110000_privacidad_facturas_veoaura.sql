-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: la privacidad explica la factura de VeoAura en «Mis pedidos» (dueño, 2026-11-10: «sí, añádelo a
--            privacidad», tras publicar las facturas descargables, PR #218).
-- Qué hace: en la política de privacidad, «Con quién compartimos tus datos», justo después de «No le pasamos tu
--           dirección ni otros datos.» (la parte de VeoAura), añade que VeoAura emite la factura con esos datos y nos la
--           devuelve, y que guardamos una copia en un almacén privado para que el cliente la descargue en «Mis
--           pedidos» (solo él, con su sesión, y la tienda). Solo añade esa frase; lo demás queda como esté (también si
--           el dueño lo editó). Si la frase de VeoAura ya no está igual, no cambia nada.
-- Conectado con: public.policy_pages (privacidad); se ve en app/politicas/[slug].tsx y se edita en
--           app/admin/policies.tsx. Describe lo que hacen api/escaparate-veoaura.ts (evento «factura»), api/factura.ts y
--           public.pedido_facturas (migración 20261110100000_facturas_veoaura.sql).
-- Tipo:     solo cambia texto de policy_pages. No borra nada. Repetirla no cambia nada.
-- ============================================================================

update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Con quién compartimos tus datos'
                   then jsonb_set(s.sec, '{body}', to_jsonb(replace(
                     s.sec ->> 'body',
                     'No le pasamos tu dirección ni otros datos.',
                     'No le pasamos tu dirección ni otros datos. Con esos datos, VeoAura emite la factura de tu compra y nos la devuelve: guardamos una copia en un almacén privado para que puedas descargarla en «Mis pedidos», y solo tú, con tu sesión iniciada, y la tienda podemos abrirla.'
                   )))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'privacidad'
  and exists (
    select 1 from jsonb_array_elements(p.sections) as s (sec)
    where s.sec ->> 'heading' = 'Con quién compartimos tus datos'
      and s.sec ->> 'body' like '%No le pasamos tu dirección ni otros datos.%'
      and s.sec ->> 'body' not like '%VeoAura emite la factura de tu compra%'
  );
