-- == VIDEOJUEGOSZARAGOZA ====================================================
-- VUELTA ATRÁS de 20261018096000_aprendizajes_blue_publico_y_admin.sql
-- NO es una migración: vive en supabase/rollbacks/ para que no se aplique sola.
-- Solo se ejecuta si el dueño lo autoriza expresamente, y después de haber aplicado la migración.
--
-- Qué deshace (y nada más):
--   1) Desactiva la lección nueva «Blue: interfaz pública y Administración» (no se borra).
--   2) Quita de «Blue fuera del panel» la nota «SUSTITUIDA…» (reemplazo del texto EXACTO que añadió la
--      migración) y la vuelve a activar: su texto original queda tal cual.
-- Si ya se aplicó la reorganización en grupos (20261018100000), primero hay que deshacer esa con su archivo.
-- ============================================================================

update public.aprendizajes
set activa = false
where activa
  and titulo = 'Blue: interfaz pública y Administración';

update public.aprendizajes
set regla = replace(regla, ' SUSTITUIDA 2026-10-18 por «Blue: interfaz pública y Administración»: hoy Blue sí aparece en Administración, pero solo para el dueño. Se conserva como historial.', ''),
    activa = true
where titulo = 'Blue fuera del panel';
