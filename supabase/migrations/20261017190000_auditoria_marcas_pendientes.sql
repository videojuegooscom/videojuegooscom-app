-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: corrige el registro de la primera revisión y la lección: además del nombre legal,
--            falta el correo de contacto de protección de datos en la política de privacidad
--            ([EMAIL DE CONTACTO PARA PROTECCIÓN DE DATOS]); la primera comprobación no lo vio.
-- Tipo:     corrige texto en dos filas ya existentes, una sola vez. No borra nada.
-- ============================================================================

update public.auditorias_web
set resultado = replace(resultado::text, 'falta el nombre legal o razón social del titular ([NOMBRE LEGAL / RAZÓN SOCIAL]).', 'faltan el nombre legal o razón social del titular ([NOMBRE LEGAL / RAZÓN SOCIAL]) y, en privacidad, el correo de contacto de protección de datos ([EMAIL DE CONTACTO PARA PROTECCIÓN DE DATOS]).')::jsonb
where origen = 'manual'
  and resumen like 'Primera revisión%'
  and resultado::text like '%falta el nombre legal o razón social del titular ([NOMBRE LEGAL / RAZÓN SOCIAL]).%';

update public.aprendizajes
set regla = replace(regla, 'falta el nombre legal o razón social del titular.', 'faltan el nombre legal o razón social del titular y el correo de contacto de protección de datos (marcas [NOMBRE LEGAL / RAZÓN SOCIAL] y [EMAIL DE CONTACTO PARA PROTECCIÓN DE DATOS]). Las marcas de relleno se buscan con corchetes y mayúsculas de hasta 90 caracteres.'),
    updated_at = now()
where titulo = 'Revisión de calidad web cada dos semanas'
  and regla like '%falta el nombre legal o razón social del titular.%';
