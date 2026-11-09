-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: portadas de PS5 Slim y Fat bien perfiladas (dueño, 2026-11-08: «se ven muy mal recortadas, no están bien
--            perfiladas»). Cambia sus portadas por las versiones -v3 (public/categorias/): silueta suavizada como un trazado
--            y recortada a la resolución final con borde antialias, sin restos del fondo, y la Slim con su borde de arriba
--            trazado a mano (esquina en diagonal, hueco negro y punta del panel trasero). La de la Pro no cambia.
--            Solo si las portadas siguen siendo las de 20261108140000 (si el dueño las cambia antes, no hace nada).
-- Qué hace: cambia las portadas de la PS5 Slim y la Fat por sus versiones -v3.
-- Conectado con: public.categories (imagenes, portadas_inicio) y public/categorias/ (las fotos); se ven en Inicio y
--           Catálogo (components/PortadasCategoria.tsx) y se editan en app/admin/categories.tsx.
-- Tipo:     solo cambia datos de una categoría. No borra nada. Repetirla no cambia nada.
-- ============================================================================

update public.categories
set imagenes = '[
      "https://videojuegoszaragoza.com/categorias/playstation-5-pro.jpg",
      "https://videojuegoszaragoza.com/categorias/ps5-slim-v3.jpg",
      "https://videojuegoszaragoza.com/categorias/ps5-fat-v3.jpg"
    ]'::jsonb,
    portadas_inicio = array[
      'https://videojuegoszaragoza.com/categorias/playstation-5-pro-inicio.jpg',
      'https://videojuegoszaragoza.com/categorias/ps5-slim-v3-inicio.jpg',
      'https://videojuegoszaragoza.com/categorias/ps5-fat-v3-inicio.jpg'
    ]::text[],
    updated_at = now()
where slug = 'playstation-5'
  and imagenes = '[
      "https://videojuegoszaragoza.com/categorias/playstation-5-pro.jpg",
      "https://videojuegoszaragoza.com/categorias/ps5-slim-v2.jpg",
      "https://videojuegoszaragoza.com/categorias/ps5-fat-v2.jpg"
    ]'::jsonb;
