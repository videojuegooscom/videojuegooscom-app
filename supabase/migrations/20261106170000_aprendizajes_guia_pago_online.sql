-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: la lección «La guía enseña también las funciones que cuestan» decía que la guía enseña «que no hay pago
--            online». Desde el 2026-11-05 sí lo hay (tarjeta y, desde el 2026-11-06, Klarna), y la guía ya dice «Reservas,
--            pagas online o confirmas y te hablamos». Se corrige esa frase para que la lección no mande decir algo falso.
-- Tipo:     cambia solo esa frase de esa lección, si sigue igual. No borra nada. Repetirla no cambia nada.
-- ============================================================================

update public.aprendizajes
set regla = replace(regla, 'cómo se compra y que no hay pago online', 'cómo se compra (pagar online con tarjeta o Klarna, o confirmar sin pagar)'),
    updated_at = now()
where titulo = 'La guía enseña también las funciones que cuestan'
  and regla like '%cómo se compra y que no hay pago online%';
