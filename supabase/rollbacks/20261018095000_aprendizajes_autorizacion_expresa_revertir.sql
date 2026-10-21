-- == VIDEOJUEGOSZARAGOZA ====================================================
-- VUELTA ATRÁS de 20261018095000_aprendizajes_autorizacion_expresa.sql
-- NO es una migración: vive en supabase/rollbacks/ para que no se aplique sola.
-- Solo se ejecuta si el dueño lo autoriza expresamente, y después de haber aplicado la migración.
--
-- Qué deshace (y nada más):
--   1) Desactiva la lección nueva (no se borra: la tabla no admite borrados).
--   2) Quita de las tres lecciones antiguas (regla y ejemplos) las líneas «ACTUALIZADA 2026-10-18…» que
--      añadió la migración, con un reemplazo del texto EXACTO que añadió: el texto original vuelve a
--      quedar tal cual.
-- Si ya se aplicó la reorganización en grupos (20261018100000), primero hay que deshacer esa con su
-- archivo de supabase/rollbacks/: si no, las filas «Grupo · …» seguirían copiando las líneas que aquí se quitan.
-- ============================================================================

update public.aprendizajes
set activa = false
where activa
  and titulo = 'Autorización expresa del dueño antes de fusionar, desplegar o migrar';

update public.aprendizajes
set regla = replace(regla, ' ACTUALIZADA 2026-10-18: publicar y aplicar migraciones ya NO se hacen sin autorización expresa del dueño; ver «Autorización expresa del dueño antes de fusionar, desplegar o migrar».', '')
where titulo = 'Claude ejecuta, el dueño solo da la orden';

update public.aprendizajes
set regla = replace(regla, ' ACTUALIZADA 2026-10-18: el verde ya no basta para publicar; hace falta la autorización expresa del dueño para esa PR (ver «Autorización expresa del dueño antes de fusionar, desplegar o migrar»).', '')
where titulo = 'Publicar en cuanto la vista previa esté en verde';

update public.aprendizajes
set regla = replace(regla, ' ACTUALIZADA 2026-10-18: Claude prepara la migración, la vuelta atrás y la simulación, pero solo la aplica con autorización expresa del dueño para esa migración; las que cambian permisos delicados (grant, revoke, security definer, anon, using (true)) o son destructivas las aplica siempre el dueño, como dice CLAUDE.md (ver «Autorización expresa del dueño antes de fusionar, desplegar o migrar»).', '')
where titulo = 'Supabase lo aplica Claude';

update public.aprendizajes
set ejemplo_bien = replace(ejemplo_bien, ' ACTUALIZADA 2026-10-18: publicar en main solo con la autorización expresa del dueño para ese cambio.', '')
where titulo = 'Claude ejecuta, el dueño solo da la orden';

update public.aprendizajes
set ejemplo_bien = replace(ejemplo_bien, ' ACTUALIZADA 2026-10-18: solo tras la autorización expresa del dueño para esa PR («fusiona la #N»).', '')
where titulo = 'Publicar en cuanto la vista previa esté en verde';

update public.aprendizajes
set ejemplo_mal = replace(ejemplo_mal, ' ACTUALIZADA 2026-10-18: pedirle la autorización expresa para esa PR sí es obligatorio; lo que está mal es pasarle a él el trabajo de fusionar.', '')
where titulo = 'Publicar en cuanto la vista previa esté en verde';

update public.aprendizajes
set ejemplo_bien = replace(ejemplo_bien, ' ACTUALIZADA 2026-10-18: solo con la autorización expresa del dueño para esa migración, y nunca si cambia permisos delicados o es destructiva (esa la aplica el dueño).', '')
where titulo = 'Supabase lo aplica Claude';
