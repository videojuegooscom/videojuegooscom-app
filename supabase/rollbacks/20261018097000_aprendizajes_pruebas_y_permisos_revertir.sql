-- == VIDEOJUEGOSZARAGOZA ====================================================
-- VUELTA ATRÁS de 20261018097000_aprendizajes_pruebas_y_permisos.sql
-- NO es una migración: vive en supabase/rollbacks/ para que no se aplique sola.
-- Solo se ejecuta si el dueño lo autoriza expresamente, y después de haber aplicado la migración.
--
-- Qué hace (y nada más): desactiva las cuatro lecciones nuevas (activa = false). No se borran: la tabla no
-- admite borrados y así queda constancia. Si ya se aplicó la reorganización en grupos (20261018100000,
-- PR #75) y metió estas lecciones en un grupo, primero hay que deshacer esa con su archivo.
-- ============================================================================

update public.aprendizajes
set activa = false
where activa
  and titulo in (
    'Una prueba debe fallar sin la corrección',
    'Quitar permisos de una función: revisar también PUBLIC',
    'npm audit no equivale a «llega al navegador»',
    'Probar los ciclos y las condiciones reales, no solo el camino feliz'
  );
