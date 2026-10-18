-- == VIDEOJUEGOSZARAGOZA ====================================================
-- VUELTA ATRÁS de 20261018095000_aprendizajes_autorizacion_y_blue_panel.sql
-- NO es una migración: vive en supabase/rollbacks/ para que no se aplique sola.
-- Solo se ejecuta si el dueño lo autoriza expresamente, y después de haber aplicado la migración.
--
-- Qué deshace (y nada más):
--   1) Desactiva las dos lecciones nuevas (no se borran: la tabla no admite borrados).
--   2) Quita de las tres lecciones antiguas la línea «ACTUALIZADA 2026-10-18…» que añadió la migración.
--   3) Quita de «Blue fuera del panel» la nota «SUSTITUIDA…» y la vuelve a activar.
-- Cada quitado es un reemplazo del texto EXACTO que añadió la migración, así que el texto original de
-- cada lección vuelve a quedar tal cual estaba.
--
-- Importante: si ya se aplicó también 20261018100000 (reorganizar en grupos), primero hay que deshacer
-- esa con su archivo de supabase/rollbacks/. Si no, las filas «Grupo · …» seguirían copiando las líneas
-- que aquí se quitan.
--
-- Comprobación previa (solo lectura):
--   select titulo, activa from public.aprendizajes
--    where titulo in ('Autorización expresa del dueño antes de fusionar, desplegar o migrar',
--                     'Blue: interfaz pública y Administración', 'Blue fuera del panel');
-- ============================================================================

update public.aprendizajes
set activa = false
where activa
  and titulo in (
    'Autorización expresa del dueño antes de fusionar, desplegar o migrar',
    'Blue: interfaz pública y Administración'
  );

update public.aprendizajes
set regla = replace(regla, ' ACTUALIZADA 2026-10-18: publicar y aplicar migraciones ya NO se hacen sin autorización expresa del dueño; ver «Autorización expresa del dueño antes de fusionar, desplegar o migrar».', '')
where titulo = 'Claude ejecuta, el dueño solo da la orden';

update public.aprendizajes
set regla = replace(regla, ' ACTUALIZADA 2026-10-18: el verde ya no basta para publicar; hace falta la autorización expresa del dueño para esa PR (ver «Autorización expresa del dueño antes de fusionar, desplegar o migrar»).', '')
where titulo = 'Publicar en cuanto la vista previa esté en verde';

update public.aprendizajes
set regla = replace(regla, ' ACTUALIZADA 2026-10-18: Claude prepara la migración, la vuelta atrás y la simulación, pero solo la aplica con autorización expresa del dueño (ver «Autorización expresa del dueño antes de fusionar, desplegar o migrar»).', '')
where titulo = 'Supabase lo aplica Claude';

update public.aprendizajes
set regla = replace(regla, ' SUSTITUIDA 2026-10-18 por «Blue: interfaz pública y Administración»: hoy Blue sí aparece en Administración, pero solo para el dueño. Se conserva como historial.', ''),
    activa = true
where titulo = 'Blue fuera del panel';
