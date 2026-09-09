-- sql/home_categories_seed.sql
-- ---------------------------------------------------------------------------
-- Qué hace: crea (o corrige) en "categories" las categorías EXACTAS que usa
-- la sección de Inicio (HOME_CATEGORIES en app/(tabs)/index.tsx) para que el
-- selector de categoría del panel de administración de productos
-- (app/admin/products.tsx) tenga algo real que mostrar y elegir.
--
-- Por qué hacía falta: el picker de categorías del formulario de producto
-- SIEMPRE ha leído de la tabla "categories" (filtrando is_active=true), pero
-- esa tabla es independiente de la lista fija de categorías que se ve en
-- Inicio. Si nunca se creó una fila en "categories" para, por ejemplo,
-- "PlayStation 5", el admin no podía asignársela a ningún producto — el
-- picker solo mostraba "Sin categoría". Este script siembra esas filas con
-- el mismo "slug" que usa Inicio para enlazar a app/catalogo.tsx?cat=..., de
-- forma que elegir una categoría aquí sea EXACTAMENTE la misma categoría que
-- el cliente ve al entrar desde la home.
--
-- Nota: "Reparación / Limpieza" no se incluye aquí a propósito — esa
-- categoría de Inicio ya no lleva a app/catalogo.tsx (productos), lleva a
-- app/servicios.tsx (sql/services.sql), que es un catálogo aparte sin
-- relación con la tabla "categories".
--
-- Es seguro volver a ejecutarlo (upsert por "slug", que ya es UNIQUE).
--
-- Conectado con:
-- - sql/products.sql → crea la tabla "categories" que rellena este script.
-- - app/(tabs)/index.tsx → HOME_CATEGORIES, origen de estos títulos/slugs.
-- - app/catalogo.tsx → resuelve ?cat=<slug> contra esta misma tabla.
-- - app/admin/products.tsx → selector "Categoría actual" del formulario.
-- ---------------------------------------------------------------------------

insert into public.categories (name, slug, sort_order, is_active)
values
  ('PlayStation 5', 'playstation-5', 0, true),
  ('PlayStation 4', 'playstation-4', 1, true),
  ('Nintendo Switch', 'nintendo-switch', 2, true),
  ('Xbox', 'xbox', 3, true),
  ('Electrónica y otros', 'electronica', 4, true)
on conflict (slug) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;
