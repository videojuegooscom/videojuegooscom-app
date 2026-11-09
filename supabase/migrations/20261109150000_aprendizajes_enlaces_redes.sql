-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-09 (el dueño: «no me deja añadir el enlace del vídeo de Instagram y TikTok»; el
--            editor de «Nuestros Servicios» solo aceptaba el enlace largo y las apps copian uno corto).
-- Qué hace: apunta la lección «Los enlaces de redes se aceptan como los copian sus apps».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Los enlaces de redes se aceptan como los copian sus apps', 'codigo', 1,
   'Todo campo donde el dueño o un cliente pegue un enlace de una red (Instagram, TikTok, YouTube, WhatsApp…) acepta el enlace tal como lo da «Compartir → Copiar enlace» en el MÓVIL, que suele ser corto (vm.tiktok.com/…, tiktok.com/t/…, instagram.com/share/…, youtu.be/…) o llevar parámetros (?igsh=…, ?_r=…). Si hace falta el enlace largo, se convierte solo (api/video-enlace.ts) y, si no se puede, se explica cómo copiarlo. Las pruebas usan enlaces copiados de las apps, no solo los del navegador; y cuando el dueño dice que «no le deja», se miran primero los registros de Supabase (si llegó a guardar o no).',
   'Un editor que solo acepta https://www.tiktok.com/@usuario/video/123… y rechaza el enlace corto que copia la app.',
   'Aceptar el enlace corto, avisar de que se completa al guardar y convertirlo con api/video-enlace.ts.')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
