-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: portadas de PS5 Slim y Fat retocadas (dueño, 2026-11-08: «puedes mejorarlo más… hazlo perfecto»).
-- Qué hace: cambia las portadas de la Slim y la Fat por sus versiones -v2 (public/categorias/): borde limpio sin halo
--   blanco, Slim ampliada con enfoque y sin su base rota, luz de la escena (sombreado azul, luz de contorno, contraluz,
--   sombra de contacto y reflejo) y el mando entero dentro del recuadro. La de la Pro no cambia.
--   Solo si las portadas siguen siendo las de 20261108120000 (si el dueño las cambia antes, no hace nada).
-- Conectado con: public.categories (imagenes, portadas_inicio) y public/categorias/ (las fotos); se ven en Inicio y
--           Catálogo (components/PortadasCategoria.tsx) y se editan en app/admin/categories.tsx.
-- Tipo:     solo cambia datos de una categoría. No borra nada. Repetirla no cambia nada.
-- ============================================================================

update public.categories
set imagenes = '[
      "https://videojuegoszaragoza.com/categorias/playstation-5-pro.jpg",
      "https://videojuegoszaragoza.com/categorias/ps5-slim-v2.jpg",
      "https://videojuegoszaragoza.com/categorias/ps5-fat-v2.jpg"
    ]'::jsonb,
    portadas_inicio = array[
      'https://videojuegoszaragoza.com/categorias/playstation-5-pro-inicio.jpg',
      'https://videojuegoszaragoza.com/categorias/ps5-slim-v2-inicio.jpg',
      'https://videojuegoszaragoza.com/categorias/ps5-fat-v2-inicio.jpg'
    ]::text[],
    updated_at = now()
where slug = 'playstation-5'
  and imagenes = '[
      "https://videojuegoszaragoza.com/categorias/playstation-5-pro.jpg",
      "https://videojuegoszaragoza.com/categorias/ps5-slim.jpg",
      "https://videojuegoszaragoza.com/categorias/ps5-fat.jpg"
    ]'::jsonb;
