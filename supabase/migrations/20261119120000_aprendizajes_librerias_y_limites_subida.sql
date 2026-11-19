-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-19. Un cliente reclamó que en «Vender» no podía subir las fotos ni el vídeo: el
--            conversor de fotos HEIC del iPhone se cargaba con `new Function("return import(m)")("heic2any")`, que el
--            navegador no sabe resolver en la web publicada (toda foto HEIC fallaba), y el formulario dejaba vídeos de hasta
--            60 MB cuando Supabase solo acepta 50 MB por archivo.
-- Qué hace: apunta la lección (si no existe).
-- Conectado con: public.aprendizajes; components/FotosVideoVenta.tsx, lib/admin/productos.utilidades.ts; pruebas VENFOT.
-- Tipo:     inserta una lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Las librerías se cargan con import("nombre") y los límites de subida son los del servidor', 'codigo', 1,
   'Una librería que se carga cuando hace falta se escribe `await import("nombre")` (así la web la empaqueta en su propio trozo); nunca con `new Function("return import(m)")` ni con el nombre en una variable: en la web publicada el navegador no sabe resolver «nombre» y falla siempre, aunque en pruebas parezca ir. Y cualquier límite de tamaño o formato del formulario sale del límite REAL del servidor (Supabase acepta 50 MB por archivo en el plan actual), nunca más alto, o el cliente rellena todo y la subida falla al final. Se prueba con el archivo real (foto HEIC del iPhone, vídeo grande) en la prueba del formulario.',
   '«Vender»: fotos HEIC del iPhone rechazadas siempre («Falta la librería de conversión HEIC») y vídeos de 50-60 MB admitidos que luego no se podían subir.',
   '`await import("heic2any")` (trozo heic2any-….js que solo se descarga con una foto HEIC) y vídeo hasta 50 MB con un aviso que dice cómo grabarlo en 1080p.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
