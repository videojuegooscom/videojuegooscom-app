-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: lección del 2026-11-14 (mejora 6 «Productos parecidos y completa tu compra», aprobada por el dueño «si
--            tiene sentido»).
-- Qué hace: apunta la lección «Sugerir productos solo con una regla que se pueda explicar (nunca relleno)».
-- Conectado con: public.aprendizajes (Centro de Aprendizajes; se ve en app/admin/aprendizajes.tsx) y
--                components/CategoryProductsShelf.tsx (tipoDeArticulo, familiasDeProducto, complementosDe).
-- Tipo:     inserta la lección si no existe. No borra nada. Repetirla no cambia nada.
-- ============================================================================

insert into public.aprendizajes (titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
select v.titulo, v.categoria, v.prioridad, v.regla, v.ejemplo_mal, v.ejemplo_bien
from (values
  ('Sugerir productos solo con una regla que se pueda explicar (nunca relleno)', 'negocio', 2,
   'Las sugerencias de la tienda («Completa tu compra», «Productos parecidos», avisos de Blue) siguen una regla sencilla escrita en el código y comprobada con el catálogo real: un artículo solo se sugiere si se le reconoce de verdad (consola, mando o accesorio por palabras del título y la categoría, con los sinónimos de la búsqueda) y es de la misma familia (PS5 con PS5; Switch 2 aparte de Switch, porque su funda no vale para la otra). Si no hay nada que encaje, no se enseña la sección: nunca se rellena con otra consola, juegos o lo más caro. Las listas salen del índice ligero de la búsqueda y solo bajan las portadas pequeñas (cuota de Supabase).',
   'En la ficha de una Switch OLED sugerir la «Funda Nintendo Switch 2» y un videojuego para que salgan 3; en la de un mando, otra consola.',
   'Switch OLED → solo «Mando Pro Original Nintendo Switch»; mando PS5 o PS4 sin accesorios a la venta → no sale «Completa tu compra».')
) as v(titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien)
where not exists (select 1 from public.aprendizajes a where a.titulo = v.titulo);
