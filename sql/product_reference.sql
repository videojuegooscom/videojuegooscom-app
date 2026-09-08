-- sql/product_reference.sql
--
-- Qué hace: añade un "número de referencia del artículo" a products —un
-- código corto que el admin asigna a mano al crear o editar un producto,
-- útil para identificar una unidad física concreta (por ejemplo al hablar
-- por WhatsApp o al gestionar el stock).
--
-- Cómo ejecutarlo: pégalo entero en el SQL Editor de Supabase (proyecto de
-- Videojuegos Zaragoza) y dale a "Run". Se puede ejecutar más de una vez sin
-- problema (usa "if not exists" en todo).
--
-- Cómo funciona:
-- - La columna es opcional (puede quedar vacía): no todos los productos
--   necesitan un número de referencia.
-- - El índice único de abajo solo se aplica a los productos que SÍ tienen
--   una referencia rellenada (where reference is not null and reference <> ''),
--   así que puedes dejar el campo en blanco en todos los que quieras sin que
--   choquen entre sí, pero si escribes uno, no podrá repetirse en otro
--   producto.
--
-- Conectado con:
-- - app/admin/products.tsx → campo "Número de referencia del artículo" en
--   el formulario de alta/edición (se guarda solo si esta migración ya se
--   ejecutó; si no, el campo se desactiva solo en vez de romper el panel).
-- - app/producto/[id].tsx → lo muestra dentro de "Información del
--   producto" cuando el producto tiene uno asignado.

alter table public.products add column if not exists reference text;

create unique index if not exists idx_products_reference_unique
  on public.products (reference)
  where reference is not null and reference <> '';
