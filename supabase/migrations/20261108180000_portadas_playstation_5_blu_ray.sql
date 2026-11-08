-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: portadas de PlayStation 5, la «Fat» pasa a llamarse «Blu-Ray» y perfilado más fino (dueño, 2026-11-08:
--            «no llames a la Fat de esa manera, llámala PlayStation 5 Blu Ray; y perfila más las imágenes y edítalas para
--            que se vean perfectamente»).
-- Qué hace: cambia las portadas de la Slim y la Blu-Ray por sus versiones -v4 (public/categorias/): pone «Blu-Ray» en vez
--   de «Fat», bordes laterales rectos (sin ondas en los paneles blancos), sin el halo azul alrededor de la silueta, y el
--   mando blanco sale del mando de la foto de la Blu-Ray (más nítido) pasado de rosa a blanco. La de la Pro no cambia.
--   Solo si las portadas siguen siendo las de 20261108160000 (si el dueño las cambia antes, no hace nada).
-- Tipo:     solo cambia datos de una categoría. No borra nada. Repetirla no cambia nada.
-- ============================================================================

update public.categories
set imagenes = '[
      "https://videojuegoszaragoza.com/categorias/playstation-5-pro.jpg",
      "https://videojuegoszaragoza.com/categorias/ps5-slim-v4.jpg",
      "https://videojuegoszaragoza.com/categorias/ps5-blu-ray-v4.jpg"
    ]'::jsonb,
    portadas_inicio = array[
      'https://videojuegoszaragoza.com/categorias/playstation-5-pro-inicio.jpg',
      'https://videojuegoszaragoza.com/categorias/ps5-slim-v4-inicio.jpg',
      'https://videojuegoszaragoza.com/categorias/ps5-blu-ray-v4-inicio.jpg'
    ]::text[],
    updated_at = now()
where slug = 'playstation-5'
  and imagenes = '[
      "https://videojuegoszaragoza.com/categorias/playstation-5-pro.jpg",
      "https://videojuegoszaragoza.com/categorias/ps5-slim-v3.jpg",
      "https://videojuegoszaragoza.com/categorias/ps5-fat-v3.jpg"
    ]'::jsonb;
