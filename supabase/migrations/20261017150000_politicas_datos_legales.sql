-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: datos legales del titular en las políticas de privacidad y de términos.
-- Tipo:     sustituye dos marcas de relleno por los datos que dio el dueño (NIF y dirección
--           fiscal) en las filas «privacidad» y «terminos». No borra nada. La marca
--           [NOMBRE LEGAL / RAZÓN SOCIAL] se deja tal cual hasta que el dueño dé el nombre.
-- ============================================================================

update public.policy_pages
set sections = replace(replace(sections::text, '[NIF/CIF]', 'Y4751659B'), '[DIRECCIÓN FISCAL]', 'C. Miguel Servet, 3, 50410 Cuarte de Huerva, Zaragoza')::jsonb,
    intro = replace(replace(intro, '[NIF/CIF]', 'Y4751659B'), '[DIRECCIÓN FISCAL]', 'C. Miguel Servet, 3, 50410 Cuarte de Huerva, Zaragoza'),
    updated_at = now()
where slug in ('privacidad', 'terminos')
  and (sections::text like '%[NIF/CIF]%'
    or sections::text like '%[DIRECCIÓN FISCAL]%'
    or intro like '%[NIF/CIF]%'
    or intro like '%[DIRECCIÓN FISCAL]%');
