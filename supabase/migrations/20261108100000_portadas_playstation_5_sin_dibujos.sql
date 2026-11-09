-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: PlayStation 5 sin portadas dibujadas (dueño, 2026-11-08: «quiero que sean de verdad las PlayStation 5:
--            Pro, Slim y Fat»). Quita las dos portadas dibujadas (Slim Con Lector y Slim Digital) y deja solo la PS5 Pro,
--            que es foto real, hasta que el dueño mande las fotos de la Slim y la Fat.
-- Qué hace: deja en la categoría PlayStation 5 solo la portada de la PS5 Pro.
-- Conectado con: public.categories (imagenes, image_url, portadas_inicio) y public/categorias/ (las fotos); se ven en
--           Inicio y Catálogo (components/PortadasCategoria.tsx) y se editan en app/admin/categories.tsx.
-- Tipo:     solo cambia datos de una categoría. No borra nada. Repetirla no cambia nada.
--           Solo si las portadas siguen siendo las de 20261107200000 (si el dueño las cambia antes, no hace nada).
-- ============================================================================

update public.categories
set imagenes = '["https://videojuegoszaragoza.com/categorias/playstation-5-pro.jpg"]'::jsonb,
    image_url = 'https://videojuegoszaragoza.com/categorias/playstation-5-pro.jpg',
    portadas_inicio = array['https://videojuegoszaragoza.com/categorias/playstation-5-pro-inicio.jpg']::text[],
    updated_at = now()
where slug = 'playstation-5'
  and imagenes = '[
      "https://videojuegoszaragoza.com/categorias/playstation-5-pro.jpg",
      "https://videojuegoszaragoza.com/categorias/playstation-5-slim-lector.jpg",
      "https://videojuegoszaragoza.com/categorias/playstation-5-slim-digital.jpg"
    ]'::jsonb;
