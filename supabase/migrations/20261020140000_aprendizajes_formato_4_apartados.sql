-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: la lección «Formato de respuesta en 7 apartados» pasa a 4 apartados
--            (petición del dueño, 2026-10-20).
-- Tipo:     actualiza el texto de una sola fila (por título), una única vez. No borra nada.
-- ============================================================================

update public.aprendizajes
set titulo = 'Formato de respuesta en 4 apartados',
    regla = 'Toda respuesta final del chat va en SOLO 4 apartados, con estos títulos en mayúsculas y en viñetas de una línea: RESUMEN, RECOMENDACIONES, TRABAJO PENDIENTE y MODELO RECOMENDADO. Los pasos o autorizaciones que necesita el dueño y los comandos de Termius van en TRABAJO PENDIENTE; la lección apuntada (que queda pendiente de aplicar) y los permisos especiales usados, en una línea del RESUMEN.',
    ejemplo_mal = 'Siete apartados, con «Lo que tiene que hacer el dueño», «Repaso de aprendizaje» y «Permisos especiales» como secciones aparte, o un texto largo sin apartados.',
    ejemplo_bien = 'RESUMEN, RECOMENDACIONES, TRABAJO PENDIENTE y MODELO RECOMENDADO, cada uno con viñetas de una línea.',
    updated_at = now()
where titulo = 'Formato de respuesta en 7 apartados';
