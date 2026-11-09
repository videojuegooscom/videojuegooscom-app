-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-09 (el dueño: «quiero saber si tenemos todos nuestros archivos en Git claros con su
--            título y para qué sirven y con cuáles están conectados; no quiero ningún archivo sin eso»).
-- Qué hace: apunta la lección «Cada archivo con su cabecera: título, qué hace y con qué se conecta».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Cada archivo con su cabecera: título, qué hace y con qué se conecta', 'codigo', 1,
   'Todo archivo del repositorio empieza con un comentario de cabecera con su ruta como título, «Qué hace:» en palabras sencillas (que lo entienda el dueño) y «Conectado con:» (quién lo usa y qué usa él, comprobado con una búsqueda en el repo, nunca inventado); en las migraciones, «Migración:», «Qué hace:», «Conectado con:» y «Tipo:». Al crear un archivo se escribe su cabecera en el mismo momento, y al cambiar sus conexiones se pone al día. Los archivos que no admiten comentarios (imágenes, JSON, .txt) se explican en la tabla «Mapa de archivos sin comentarios» de README.md, que se actualiza en la misma PR al añadir o quitar uno. Las categorías válidas de una lección son general, diseno, textos, negocio, codigo, seguridad, seo y panel.',
   'Un componente o una migración nuevos sin decir para qué sirven ni qué pantallas los usan; una foto nueva en public/ que no sale en el mapa de README.md.',
   'Primeras líneas: «// components/X.tsx», «Qué hace: …», «Conectado con: app/…, lib/…»; y la foto nueva con su fila en el mapa de README.md.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
