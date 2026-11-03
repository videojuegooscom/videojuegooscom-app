-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: correo de contacto de protección de datos en las políticas (dueño, 2026-11-03: «email de contacto el de la
--           tienda VideojuegosZaragoza.com@gmail.com»).
-- Tipo:     sustituye la marca [EMAIL DE CONTACTO PARA PROTECCIÓN DE DATOS] por ese correo allí donde esté (hoy, dos
--           veces en «privacidad»: «Responsable del tratamiento» y «Tus derechos»). No borra nada. Repetible: si ya no
--           queda la marca, no toca ninguna fila. El nombre del titular lo puso 20261017200000_politicas_nombre_titular.
-- Vuelta atrás (solo con el OK del dueño; el correo no aparecía antes en ninguna política):
--   update public.policy_pages set sections = replace(sections::text, 'VideojuegosZaragoza.com@gmail.com',
--     '[EMAIL DE CONTACTO PARA PROTECCIÓN DE DATOS]')::jsonb, intro = replace(intro, 'VideojuegosZaragoza.com@gmail.com',
--     '[EMAIL DE CONTACTO PARA PROTECCIÓN DE DATOS]'), updated_at = now()
--   where sections::text like '%VideojuegosZaragoza.com@gmail.com%' or intro like '%VideojuegosZaragoza.com@gmail.com%';
-- ============================================================================

update public.policy_pages
set sections = replace(sections::text, '[EMAIL DE CONTACTO PARA PROTECCIÓN DE DATOS]', 'VideojuegosZaragoza.com@gmail.com')::jsonb,
    intro = replace(intro, '[EMAIL DE CONTACTO PARA PROTECCIÓN DE DATOS]', 'VideojuegosZaragoza.com@gmail.com'),
    updated_at = now()
where sections::text like '%[EMAIL DE CONTACTO PARA PROTECCIÓN DE DATOS]%'
   or intro like '%[EMAIL DE CONTACTO PARA PROTECCIÓN DE DATOS]%';
