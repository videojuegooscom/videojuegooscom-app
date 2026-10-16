-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: la revisión de calidad web pasa a lanzarse sola y a quedar registrada; se anotan las
--            decisiones del dueño del 2026-10-17.
-- Tipo:     añade un párrafo a una lección existente (una sola fila, una sola vez). No borra nada.
-- ============================================================================

update public.aprendizajes
set regla = regla || ' ACTUALIZACIÓN 2026-10-17: la revisión ahora se lanza SOLA los días 1 y 15 de cada mes (cron de Vercel → api/auditoria-web.ts, sin que el dueño toque ni acepte nada) y cada vez queda apuntada en la tabla auditorias_web (Administración → Revisiones): fecha, puntos, hallazgos y qué se cambió (nada: la automática solo lee). Mide sola los puntos 1, 2, 4, 6, 7, 8, 9, 11, 12, 15, 16 y 19. Los puntos 3, 5, 10, 13, 14, 17, 18 y 20 los repasa Claude (con navegador o leyendo el código) cuando abre una sesión y han pasado más de 14 días desde su última revisión manual; Claude también arregla lo que salga y lo anota (origen «manual»). Al empezar una respuesta, Claude lee la última fila de auditorias_web: si tiene fallos, avisa y los corrige. La revisión automática no puede arreglar código por sí sola. DECISIONES DEL DUEÑO (2026-10-17): el contraste del azul de marca se deja como está (no volver a preguntarlo); ya están puestos en privacidad y términos el NIF Y4751659B y la dirección C. Miguel Servet, 3, 50410 Cuarte de Huerva (Zaragoza); falta el nombre legal o razón social del titular.',
    updated_at = now()
where titulo = 'Revisión de calidad web cada dos semanas'
  and regla not like '%ACTUALIZACIÓN 2026-10-17%';
