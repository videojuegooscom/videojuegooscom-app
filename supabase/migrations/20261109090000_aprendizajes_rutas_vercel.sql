-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-09 (lo detecta Claude: la página nueva /contratar/<id> funcionaba desde la ficha pero
--            daba 404 al abrirla directamente, porque faltaba su reescritura en vercel.json).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Toda ruta nueva con [id] lleva su reescritura en vercel.json', 'codigo', 1,
   'La tienda es una exportación estática: una ruta con parámetro (app/contratar/[id].tsx, app/servicio/[id].tsx…) solo existe como el archivo «[id]» y Vercel no la encuentra al abrirla directamente, recargarla o compartirla (404), aunque navegando desde la tienda sí funcione. Por eso, cada ruta nueva con parámetro añade en la MISMA PR su línea en vercel.json → rewrites ({"source": "/contratar/:id", "destination": "/contratar/[id]"}) y, tras publicar, se comprueba con curl -sI la dirección directa (200). Las pruebas locales con el servidor de pruebas no lo detectan.',
   'Publicar app/contratar/[id].tsx sin su reescritura: desde la ficha funciona y abierta directamente da 404.',
   'Añadir la reescritura en la misma PR y comprobar después con curl -sI https://videojuegoszaragoza.com/contratar/<id> que responde 200.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
