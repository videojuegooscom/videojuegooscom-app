-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: portadas de PlayStation 5, una por modelo (dueño, 2026-11-07: «quiero hacer lo mismo pero para PlayStation 5,
--            que aparezca el modelo: Pro, Slim Con Lector, Slim Digital, Fat y Digital; crea las imágenes que hagan falta»).
-- Qué hace: pone 3 portadas en la categoría (la tienda admite hasta 3: restricción categories_imagenes_forma; el dueño
--   eligió el 2026-11-08 «Dejar 3 modelos»): Pro, Slim Con Lector y Slim Digital, servidas desde la propia web
--   (public/categorias/):
--   - dentro de la categoría (imagenes, image_url): playstation-5-<modelo>.jpg, 1600 × 700;
--   - recuadro de Inicio (portadas_inicio): playstation-5-<modelo>-inicio.jpg, 960 × 800.
--   La Pro sale de la foto que ya tenía la categoría, sin «SONY», «PRESENTATION TEMPLATES» ni los textos de abajo; las Slim
--   son dibujos con el mismo estilo (el dueño eligió que se dibujaran). Las de Fat y Digital quedan en la web sin usar.
--   La foto anterior sigue en el almacén (no se borra).
--   Solo si la portada sigue siendo la de hoy (si el dueño la cambia antes, no hace nada).
--   (La primera versión de este archivo ponía 5 y la base de datos la rechazó entera: no llegó a cambiar nada.)
-- Tipo:     solo cambia datos de una categoría. No borra nada. Repetirla no cambia nada.
-- ============================================================================

update public.categories
set imagenes = '[
      "https://videojuegoszaragoza.com/categorias/playstation-5-pro.jpg",
      "https://videojuegoszaragoza.com/categorias/playstation-5-slim-lector.jpg",
      "https://videojuegoszaragoza.com/categorias/playstation-5-slim-digital.jpg"
    ]'::jsonb,
    image_url = 'https://videojuegoszaragoza.com/categorias/playstation-5-pro.jpg',
    portadas_inicio = array[
      'https://videojuegoszaragoza.com/categorias/playstation-5-pro-inicio.jpg',
      'https://videojuegoszaragoza.com/categorias/playstation-5-slim-lector-inicio.jpg',
      'https://videojuegoszaragoza.com/categorias/playstation-5-slim-digital-inicio.jpg'
    ]::text[],
    updated_at = now()
where slug = 'playstation-5'
  and imagenes = '[
      "https://rgvyvaineyodyxzwootl.supabase.co/storage/v1/object/public/product-media/categorias/1793548838922-en8ltz.jpg"
    ]'::jsonb;
