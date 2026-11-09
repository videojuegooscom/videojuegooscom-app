-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: portadas de Nintendo Switch RECOMPUESTAS (dueño, 2026-11-07: «se ve raro, déjalo bien»).
-- Qué hace: cambia las portadas por las versiones -v2 que van en la propia web (public/categorias/):
--   - dentro de la categoría: Switch 2 y Switch OLED con el logo centrado en el hueco rojo (la consola sigue pegada a su
--     borde); la tercera (Nintendo) no cambia;
--   - recuadro de Inicio: la consola ocupa el 80 % del alto, pegada arriba a la derecha, y el logo centrado a su lado
--     (antes la foto entera quedaba arriba con una franja roja vacía debajo); la de Nintendo, más grande y centrada.
--   Solo si las portadas siguen siendo las de 20261107170000 (si el dueño las cambia antes, no hace nada).
-- Conectado con: public.categories (imagenes, image_url, portadas_inicio) y public/categorias/ (las fotos); se ven en
--           Inicio y Catálogo (components/PortadasCategoria.tsx) y se editan en app/admin/categories.tsx.
-- Tipo:     solo cambia datos de una categoría. No borra nada. Repetirla no cambia nada.
-- ============================================================================

update public.categories
set imagenes = '[
      "https://videojuegoszaragoza.com/categorias/nintendo-switch-1-v2.jpg",
      "https://videojuegoszaragoza.com/categorias/nintendo-switch-2-v2.jpg",
      "https://videojuegoszaragoza.com/categorias/nintendo-switch-3.jpg"
    ]'::jsonb,
    image_url = 'https://videojuegoszaragoza.com/categorias/nintendo-switch-1-v2.jpg',
    portadas_inicio = array[
      'https://videojuegoszaragoza.com/categorias/nintendo-switch-1-inicio-v2.jpg',
      'https://videojuegoszaragoza.com/categorias/nintendo-switch-2-inicio-v2.jpg',
      'https://videojuegoszaragoza.com/categorias/nintendo-switch-3-inicio-v2.jpg'
    ]::text[],
    updated_at = now()
where slug = 'nintendo-switch'
  and imagenes = '[
      "https://videojuegoszaragoza.com/categorias/nintendo-switch-1.jpg",
      "https://videojuegoszaragoza.com/categorias/nintendo-switch-2.jpg",
      "https://videojuegoszaragoza.com/categorias/nintendo-switch-3.jpg"
    ]'::jsonb;
