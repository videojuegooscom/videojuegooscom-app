-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: quita la Noticia Flash «Te compramos tu electrónica hoy mismo» (petición del dueño, 2026-11-04: «Quitar
--            por completo lo de "Te compramos tu electrónica hoy mismo"»). Deja de salir en «Noticias» del panel de
--            Blue, en sus mensajes y en lo que Blue IA sabe de los avisos activos.
-- Tipo:     desactiva la fila (is_active = false); no borra nada. Para volver a usarla, se activa en Administración →
--           Noticias Flash. Repetirla no cambia nada.
-- ============================================================================

update public.flash_news
set is_active = false,
    updated_at = now()
where message = 'Te compramos tu electrónica hoy mismo'
  and is_active;
