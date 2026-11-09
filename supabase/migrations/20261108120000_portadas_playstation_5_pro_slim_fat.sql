-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: portadas de PlayStation 5 con fotos reales (dueño, 2026-11-08: «la primera foto es de la PS5 Slim y la
--            segunda la Fat; adáptalas con el fondo como en la Pro y el mando rosa cámbialo por uno blanco normal»).
-- Qué hace: pone 3 portadas en la categoría (el máximo): PS5 Pro, PS5 Slim y PS5 Fat, servidas desde la propia web
--   (public/categorias/):
--   - dentro de la categoría (imagenes, image_url): playstation-5-pro.jpg, ps5-slim.jpg y ps5-fat.jpg, 1600 × 700;
--   - recuadro de Inicio (portadas_inicio): sus versiones -inicio, 960 × 800.
--   Slim y Fat: las fotos del dueño sin su fondo blanco, sobre el fondo azul oscuro con haz de luz de la Pro; en la Fat el
--   mando rosa se cambia por el mando blanco real de la foto de la Slim.
--   Solo si la portada sigue siendo la de 20261108100000 (solo la Pro); si el dueño la cambia antes, no hace nada.
-- Conectado con: public.categories (imagenes, image_url, portadas_inicio) y public/categorias/ (las fotos); se ven en
--           Inicio y Catálogo (components/PortadasCategoria.tsx) y se editan en app/admin/categories.tsx.
-- Tipo:     solo cambia datos de una categoría. No borra nada. Repetirla no cambia nada.
-- ============================================================================

update public.categories
set imagenes = '[
      "https://videojuegoszaragoza.com/categorias/playstation-5-pro.jpg",
      "https://videojuegoszaragoza.com/categorias/ps5-slim.jpg",
      "https://videojuegoszaragoza.com/categorias/ps5-fat.jpg"
    ]'::jsonb,
    image_url = 'https://videojuegoszaragoza.com/categorias/playstation-5-pro.jpg',
    portadas_inicio = array[
      'https://videojuegoszaragoza.com/categorias/playstation-5-pro-inicio.jpg',
      'https://videojuegoszaragoza.com/categorias/ps5-slim-inicio.jpg',
      'https://videojuegoszaragoza.com/categorias/ps5-fat-inicio.jpg'
    ]::text[],
    updated_at = now()
where slug = 'playstation-5'
  and imagenes = '["https://videojuegoszaragoza.com/categorias/playstation-5-pro.jpg"]'::jsonb;
