-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: portadas de PS5 Slim y PS5 Blu-Ray con las fotos promocionales del dueño (2026-11-08: «adapta estas dos y
--            sustituye las que hay»). Cambia sus portadas por las versiones -v5 (public/categorias/), hechas como la de la
--            Pro: sin «SONY»; en la Blu-Ray, «BLU-RAY» bajo el logo en vez de «DISC EDITION · Original / Fat Model»; en
--            Inicio, la consola y el mando a todo el alto y el logo en el hueco de la izquierda. La de la Pro no cambia.
--            Solo si las portadas siguen siendo las de 20261108180000 (si el dueño las cambia antes, no hace nada).
-- Qué hace: cambia las portadas de la PS5 Slim y la PS5 Blu-Ray por sus versiones -v5.
-- Conectado con: public.categories (imagenes, portadas_inicio) y public/categorias/ (las fotos); se ven en Inicio y
--           Catálogo (components/PortadasCategoria.tsx) y se editan en app/admin/categories.tsx.
-- Tipo:     solo cambia datos de una categoría. No borra nada. Repetirla no cambia nada.
-- ============================================================================

update public.categories
set imagenes = '[
      "https://videojuegoszaragoza.com/categorias/playstation-5-pro.jpg",
      "https://videojuegoszaragoza.com/categorias/ps5-slim-v5.jpg",
      "https://videojuegoszaragoza.com/categorias/ps5-blu-ray-v5.jpg"
    ]'::jsonb,
    portadas_inicio = array[
      'https://videojuegoszaragoza.com/categorias/playstation-5-pro-inicio.jpg',
      'https://videojuegoszaragoza.com/categorias/ps5-slim-v5-inicio.jpg',
      'https://videojuegoszaragoza.com/categorias/ps5-blu-ray-v5-inicio.jpg'
    ]::text[],
    updated_at = now()
where slug = 'playstation-5'
  and imagenes = '[
      "https://videojuegoszaragoza.com/categorias/playstation-5-pro.jpg",
      "https://videojuegoszaragoza.com/categorias/ps5-slim-v4.jpg",
      "https://videojuegoszaragoza.com/categorias/ps5-blu-ray-v4.jpg"
    ]'::jsonb;
