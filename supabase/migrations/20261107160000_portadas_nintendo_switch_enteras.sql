-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: las 3 portadas de Nintendo Switch, enteras en el recuadro de Inicio (dueño, 2026-11-07: «adáptame estas
--            imágenes para que en el recuadro de categorías y dentro de categorías donde ve el cliente se vean
--            perfectamente»). Sus encuadres cortaban el logo («2», «NINTENDO») y la consola.
-- Qué hace: marca las 3 portadas de Nintendo Switch como «entera» (portadas_inicio = 'entera' en cada una, en lugar de
--           su encuadre). Desde esta versión de la tienda (components/PortadasCategoria.tsx, PORTADA_ENTERA), una portada
--           «entera» se ve completa en el recuadro de Inicio y dentro de la categoría, con la misma foto desenfocada
--           detrás, sin recortar nada. Las fotos (imagenes) no se tocan. Las demás categorías siguen igual. Solo si los
--           encuadres siguen siendo los de hoy (si el dueño los cambia antes, no hace nada). Es lo mismo que pulsar
--           «Entera» en las tres portadas en Administración → Categorías.
-- Conectado con: public.categories (portadas_inicio; las fotos siguen en el almacén de Supabase); se ven en Inicio y
--           Catálogo (components/PortadasCategoria.tsx) y se editan en app/admin/categories.tsx.
-- Tipo:     solo cambia un dato de una categoría. No borra archivos ni filas. Repetirla no cambia nada.
-- ============================================================================

update public.categories
set portadas_inicio = array['entera', 'entera', 'entera']::text[],
    updated_at = now()
where slug = 'nintendo-switch'
  and portadas_inicio = array[
        'https://rgvyvaineyodyxzwootl.supabase.co/storage/v1/object/public/product-media/categorias/inicio-1794046192833-npoc4g.jpg',
        'https://rgvyvaineyodyxzwootl.supabase.co/storage/v1/object/public/product-media/categorias/inicio-1794046158764-9sierl.jpg',
        'https://rgvyvaineyodyxzwootl.supabase.co/storage/v1/object/public/product-media/categorias/inicio-1794046169482-3jvc2i.jpg'
      ]::text[];
