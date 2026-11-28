-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: noticias solo con euros
-- Qué hace: retira (publicada = false, NO las borra) las noticias publicadas que llevan precios o cifras en otra
--           moneda: símbolos ($, £, ¥, ₩, ₹), códigos (USD, MXN, GBP…), dólares, libras esterlinas, yenes, pesos
--           junto a una cifra o con su país y reales brasileños. Petición del dueño (2026-11-28): «no quiero que
--           aparezcan otras monedas que no sean euros». Las nuevas ya no entran (api/noticias-gaming.ts →
--           llevaOtraMoneda, con la misma lista).
-- Acceso:   sin cambios.
-- Tipo:     cambio de datos reversible: para deshacerlo, volver a poner publicada = true a esas noticias.
-- Conectado con: api/noticias-gaming.ts; app/noticias, el Foro y las tiras de noticias (solo enseñan las publicadas).
-- ============================================================================

update public.noticias_gaming
set publicada = false
where publicada
  and (
    concat_ws(' ', titulo, resumen, puntos_clave::text, datos::text, por_que_importa, contexto)
      ~* '[$£¥₩₹]|\md[oó]lar(es)?\M|\mlibras?\s+esterlinas?\M|[0-9]\s*yen\M|\myenes\M|[0-9]\s*pesos\M|\mpesos\s+(mexicanos|argentinos|chilenos|colombianos|uruguayos)\M|\mreales\s+brasile'
    or concat_ws(' ', titulo, resumen, puntos_clave::text, datos::text, por_que_importa, contexto)
      ~ '\m(USD|MXN|ARS|CLP|COP|PEN|GBP|JPY|CNY|KRW|INR|BRL|CAD|AUD)\M'
  );
