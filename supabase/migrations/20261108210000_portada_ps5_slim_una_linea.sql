-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: portada de la PS5 Slim que ya no se parece a la Pro (dueño, 2026-11-08: «la PS5 Pro y la PS5 Slim se
--            parecen mucho, arréglalo»). La foto de la Slim traía la consola con las 3 rayas negras de la Pro; en la
--            versión -v6 (public/categorias/) se han borrado y la consola lleva la línea única fina de la Slim real.
--            Solo cambia la portada de la Slim (dentro de la categoría y en Inicio); la Pro y la Blu-Ray no cambian.
--            Solo si las portadas siguen siendo las de 20261108200000 (si el dueño las cambia antes, no hace nada).
-- Qué hace: cambia la portada de la PS5 Slim por su versión -v6.
-- Conectado con: public.categories (imagenes, portadas_inicio) y public/categorias/ (las fotos); se ven en Inicio y
--           Catálogo (components/PortadasCategoria.tsx) y se editan en app/admin/categories.tsx.
-- Tipo:     solo cambia datos de una categoría. No borra nada. Repetirla no cambia nada.
-- ============================================================================

update public.categories
set imagenes = '[
      "https://videojuegoszaragoza.com/categorias/playstation-5-pro.jpg",
      "https://videojuegoszaragoza.com/categorias/ps5-slim-v6.jpg",
      "https://videojuegoszaragoza.com/categorias/ps5-blu-ray-v5.jpg"
    ]'::jsonb,
    portadas_inicio = array[
      'https://videojuegoszaragoza.com/categorias/playstation-5-pro-inicio.jpg',
      'https://videojuegoszaragoza.com/categorias/ps5-slim-v6-inicio.jpg',
      'https://videojuegoszaragoza.com/categorias/ps5-blu-ray-v5-inicio.jpg'
    ]::text[],
    updated_at = now()
where slug = 'playstation-5'
  and imagenes = '[
      "https://videojuegoszaragoza.com/categorias/playstation-5-pro.jpg",
      "https://videojuegoszaragoza.com/categorias/ps5-slim-v5.jpg",
      "https://videojuegoszaragoza.com/categorias/ps5-blu-ray-v5.jpg"
    ]'::jsonb;
