-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: VeoAura recibe la ficha del cliente también al pagar con tarjeta (dueño, 2026-11-06: «que para VeoAura
--            pagar con tarjeta, cuando llega que ya se ha pagado, sea como pagado»).
-- Qué hace: en la política de privacidad, «Con quién compartimos tus datos», donde dice que a VeoAura se le pasan el
--           nombre, el correo y el teléfono «cuando te lo entregamos», pasa a decir «cuando lo pagas con tarjeta o te lo
--           entregamos». Solo cambia esas palabras; lo demás queda como esté (también si el dueño lo editó).
-- Por qué antes que el código: api/escaparate-retorno.ts solo cuenta el pago con tarjeta como «pagado» para VeoAura
--           cuando la privacidad ya lo dice (primero la privacidad, luego los datos).
-- Tipo:     solo cambia texto de policy_pages. No borra nada. Repetirla no cambia nada.
-- Pruebas:  pruebas/perfiles-sql.mjs (apartado «VeoAura y la tarjeta») y pruebas/escaparate-retorno.mjs.
-- ============================================================================

update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Con quién compartimos tus datos'
                   then jsonb_set(s.sec, '{body}', to_jsonb(replace(s.sec ->> 'body', 'y, cuando te lo entregamos, también tu nombre', 'y, cuando lo pagas con tarjeta o te lo entregamos, también tu nombre')))
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
      and s.sec ->> 'body' like '%y, cuando te lo entregamos, también tu nombre%'
  );
