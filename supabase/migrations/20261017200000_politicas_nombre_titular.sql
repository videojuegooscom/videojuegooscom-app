-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: nombre del titular en las políticas de privacidad y de términos.
-- Tipo:     sustituye la marca [NOMBRE LEGAL / RAZÓN SOCIAL] por el nombre que dio el dueño
--           (Daniel Gutiérrez) en las filas «privacidad» y «terminos». No borra nada.
-- Corrección 2026-10-18: se quitó la segunda sentencia (anotar en la lección «Revisión de calidad
--           web cada dos semanas»). Esa lección ya tiene 3.923 de los 4.000 caracteres que admite
--           aprendizajes_regla_check, así que el párrafo habría hecho fallar toda la migración.
-- ============================================================================

update public.policy_pages
set sections = replace(sections::text, '[NOMBRE LEGAL / RAZÓN SOCIAL]', 'Daniel Gutiérrez')::jsonb,
    intro = replace(intro, '[NOMBRE LEGAL / RAZÓN SOCIAL]', 'Daniel Gutiérrez'),
    updated_at = now()
where slug in ('privacidad', 'terminos')
  and (sections::text like '%[NOMBRE LEGAL / RAZÓN SOCIAL]%'
    or intro like '%[NOMBRE LEGAL / RAZÓN SOCIAL]%');
