-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: nombre del titular en las políticas de privacidad y de términos.
-- Tipo:     sustituye la marca [NOMBRE LEGAL / RAZÓN SOCIAL] por el nombre que dio el dueño
--           (Daniel Gutiérrez) en las filas «privacidad» y «terminos», y anota en la lección que
--           ya solo falta el correo de contacto de protección de datos. No borra nada.
-- ============================================================================

update public.policy_pages
set sections = replace(sections::text, '[NOMBRE LEGAL / RAZÓN SOCIAL]', 'Daniel Gutiérrez')::jsonb,
    intro = replace(intro, '[NOMBRE LEGAL / RAZÓN SOCIAL]', 'Daniel Gutiérrez'),
    updated_at = now()
where slug in ('privacidad', 'terminos')
  and (sections::text like '%[NOMBRE LEGAL / RAZÓN SOCIAL]%'
    or intro like '%[NOMBRE LEGAL / RAZÓN SOCIAL]%');

update public.aprendizajes
set regla = regla || ' ACTUALIZACIÓN 2026-10-16 (tarde): el dueño dio su nombre (Daniel Gutiérrez) y ya está en privacidad y términos; solo falta el correo de contacto de protección de datos ([EMAIL DE CONTACTO PARA PROTECCIÓN DE DATOS]). El dueño pidió no repetir en «Trabajo que queda» la próxima revisión ni la comprobación de las 08:30 de VeoAura. Las 53 vulnerabilidades de dependencias están en herramientas de construcción (Expo, Babel, Metro…), no en lo que descarga el cliente; arreglarlas con «npm audit fix» (sin --force, que instalaría expo 44 y rompería la tienda) lo ejecuta el dueño porque cambia dependencias.',
    updated_at = now()
where titulo = 'Revisión de calidad web cada dos semanas'
  and regla not like '%ACTUALIZACIÓN 2026-10-16 (tarde)%';
