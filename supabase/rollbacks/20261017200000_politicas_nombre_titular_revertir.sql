-- == VIDEOJUEGOSZARAGOZA ====================================================
-- VUELTA ATRÁS de 20261017200000_politicas_nombre_titular.sql
-- NO es una migración: vive en supabase/rollbacks/ para que no se aplique sola.
-- Solo se ejecuta si el dueño lo autoriza expresamente, y después de haber aplicado la migración.
--
-- Qué deshace (y nada más):
--   En las filas «privacidad» y «terminos» de policy_pages, vuelve a poner la marca
--   [NOMBRE LEGAL / RAZÓN SOCIAL] donde la migración puso «Daniel Gutiérrez».
--
-- Por qué es seguro (comprobado en solo lectura el 2026-10-18, antes de aplicar nada):
--   - Hoy esas dos filas NO contienen «Daniel Gutiérrez» (ni en sections ni en intro), así que
--     el reemplazo inverso solo puede tocar lo que puso la migración.
--   - Ida y vuelta exacta: reemplazar la marca por el nombre y luego el nombre por la marca devuelve
--     un sections idéntico (comparación jsonb) y un intro idéntico, en las dos filas.
--   - Solo toca 2 filas de policy_pages. No toca ninguna otra tabla.
--
-- Límites que hay que conocer:
--   - updated_at no se puede restaurar por reemplazo. Valor original de las dos filas:
--     2026-10-16 18:49:06.979043+00. Este script lo pone a now(); si quieres el original, usa el
--     bloque opcional del final.
--   - Si después de aplicar la migración alguien escribe «Daniel Gutiérrez» a mano en otro punto de
--     esas políticas, este reemplazo también lo convertiría en la marca. Ejecútalo cuanto antes tras
--     decidir la vuelta atrás, o revisa antes con la consulta de comprobación.
--
-- Comprobación previa (solo lectura): qué filas tocaría la vuelta atrás.
--   select slug, sections::text like '%Daniel Gutiérrez%' as sections_tiene_nombre,
--          intro like '%Daniel Gutiérrez%' as intro_tiene_nombre
--     from public.policy_pages where slug in ('privacidad', 'terminos');
-- ============================================================================

update public.policy_pages
set sections = replace(sections::text, 'Daniel Gutiérrez', '[NOMBRE LEGAL / RAZÓN SOCIAL]')::jsonb,
    intro = replace(intro, 'Daniel Gutiérrez', '[NOMBRE LEGAL / RAZÓN SOCIAL]'),
    updated_at = now()
where slug in ('privacidad', 'terminos')
  and (sections::text like '%Daniel Gutiérrez%'
    or intro like '%Daniel Gutiérrez%');

-- Opcional: devolver también updated_at al valor que tenían antes de la migración.
-- update public.policy_pages
-- set updated_at = '2026-10-16 18:49:06.979043+00'
-- where slug in ('privacidad', 'terminos');
