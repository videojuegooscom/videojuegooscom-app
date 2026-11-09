-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: las 3 portadas de Nintendo Switch, EDITADAS para su recuadro (dueño, 2026-11-07: «quiero que edites las
--            imágenes para adaptarlas a lo que se ve en el recuadro dentro de la categoría y en Categorías, y no que
--            adaptes ese recuadro para la imagen»).
-- Qué hace: cambia sus portadas por las versiones editadas que van en la propia web (public/categorias/):
--   - dentro de la categoría (imagenes, image_url): nintendo-switch-1/2/3.jpg, 1600 × 700 (16:7, la forma de la cabecera
--     en el móvil), con el logo y la consola enteros y el resto rellenado con el rojo de la propia foto;
--   - recuadro de Inicio (portadas_inicio, su encuadre): nintendo-switch-1/2/3-inicio.jpg, 960 × 800 (6:5).
--   Así los recuadros llenan con la foto sin recortar nada y sin la marca «entera» (que deja de usarse aquí).
--   Las fotos que subió el dueño siguen en el almacén (no se borran).
--   Solo si las portadas siguen siendo las de hoy (si el dueño las cambia antes, no hace nada).
-- Conectado con: public.categories (imagenes, image_url, portadas_inicio) y public/categorias/ (las fotos); se ven en
--           Inicio y Catálogo (components/PortadasCategoria.tsx) y se editan en app/admin/categories.tsx.
-- Tipo:     solo cambia datos de una categoría. No borra nada. Repetirla no cambia nada.
-- ============================================================================

update public.categories
set imagenes = '[
      "https://videojuegoszaragoza.com/categorias/nintendo-switch-1.jpg",
      "https://videojuegoszaragoza.com/categorias/nintendo-switch-2.jpg",
      "https://videojuegoszaragoza.com/categorias/nintendo-switch-3.jpg"
    ]'::jsonb,
    image_url = 'https://videojuegoszaragoza.com/categorias/nintendo-switch-1.jpg',
    portadas_inicio = array[
      'https://videojuegoszaragoza.com/categorias/nintendo-switch-1-inicio.jpg',
      'https://videojuegoszaragoza.com/categorias/nintendo-switch-2-inicio.jpg',
      'https://videojuegoszaragoza.com/categorias/nintendo-switch-3-inicio.jpg'
    ]::text[],
    updated_at = now()
where slug = 'nintendo-switch'
  and imagenes = '[
      "https://rgvyvaineyodyxzwootl.supabase.co/storage/v1/object/public/product-media/categorias/1793551623152-nvd656.jpg",
      "https://rgvyvaineyodyxzwootl.supabase.co/storage/v1/object/public/product-media/categorias/1794046159201-lmqc0m.jpg",
      "https://rgvyvaineyodyxzwootl.supabase.co/storage/v1/object/public/product-media/categorias/1794046169783-ircgzk.jpg"
    ]'::jsonb;
