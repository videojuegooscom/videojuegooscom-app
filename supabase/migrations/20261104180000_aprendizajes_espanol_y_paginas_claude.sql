-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lecciones del 2026-11-04. El dueño mandó una captura del móvil mientras se preparaba la página del
--            carrusel: los avisos de avance salían en inglés y le apareció una ventana «Artifact solicita permiso»
--            (además de otra de un intento que falló porque la página no admite archivos .zip).
--   1) «Todo en español, también los avisos mientras se trabaja»: se añade que vale también cuando el recordatorio del
--      sistema que pide contar qué se está haciendo llega en inglés (fue la causa).
--   2) Nueva: cada publicación de una página de Claude (Artifact) es una ventana de permiso en el móvil del dueño.
-- Tipo:     actualiza una lección e inserta otra si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

-- 1) Los avisos, en español aunque el recordatorio llegue en inglés.
update public.aprendizajes
set regla = regla || ' Vale también cuando el recordatorio del sistema que pide contar qué se está haciendo llega en inglés («The user hasn''t heard from you…»): el aviso se escribe igualmente en español, y lo mismo las descripciones de los comandos, que el dueño lee en la ventana de permiso.',
    ejemplo_mal = ejemplo_mal || ' O, el 2026-11-04, «The page with download buttons is ready. I''m publishing it…» mientras se preparaba el carrusel.',
    updated_at = now()
where titulo = 'Todo en español, también los avisos mientras se trabaja'
  and regla not like '%recordatorio del sistema%';

-- 2) Páginas de Claude (Artifact): una sola publicación por petición, comprobada antes.
insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Cada página de Claude que se publica es una ventana de permiso en el móvil', 'general', 1,
   'Publicar o actualizar una página privada de claude.ai (herramienta Artifact, como la del carrusel de Instagram y TikTok) le saca al dueño una ventana «Artifact solicita permiso · Permitir una vez» en el móvil, también cuando la publicación falla. Por eso se publica UNA sola vez por petición, con todo junto, y antes se comprueba lo que la página no admite: solo tipos servidos (html, css, js, json, txt, md, csv, imágenes, fuentes, mp3/mp4/webm, pdf; nunca .zip, .docx ni .xlsx: un .zip se monta en la propia página con JSZip) y que el script no tenga errores. Para que el dueño se lleve archivos, la página declara la capacidad downloads (botón «Descargar» con confirmación); en esta sesión no se pueden adjuntar archivos al chat. Al publicar se le avisa en una línea de que le va a salir la ventana y que es la de la página.',
   'Publicar la página con dos .zip adjuntos (falla: primera ventana) y volver a publicarla sin ellos (segunda ventana), sin avisar al dueño.',
   'Comprobar los tipos y el script, avisar «te va a salir una ventana para actualizar la página del carrusel» y publicar una sola vez.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
