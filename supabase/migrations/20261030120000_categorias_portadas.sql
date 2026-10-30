-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: portadas de las categorías (hasta 3 fotos que se pasan solas en la tienda).
-- Qué hace: categories.imagenes (jsonb, lista de direcciones de las fotos, [] por defecto, como mucho 3). La escribe
--           el panel (app/admin/categories.tsx, que además deja la primera en image_url) y la enseñan Inicio, el
--           catálogo y el propio panel (components/PortadasCategoria.tsx). Las fotos se suben al almacenamiento
--           product-media (carpeta categorias/), que ya solo admite subidas del administrador.
-- Tipo:     SOLO AÑADE (una columna con valor por defecto y una comprobación de forma). No borra ni cambia
--           ninguna columna, fila, permiso ni función. La columna hereda los permisos de la tabla categories.
-- Vuelta atrás: dejar de usarla basta (sin ella, la tienda enseña la primera portada desde image_url).
-- ============================================================================

alter table public.categories
  add column if not exists imagenes jsonb not null default '[]'::jsonb;

comment on column public.categories.imagenes is
  'Portadas de la categoría: lista de direcciones de fotos (como mucho 3), en orden; la primera también va en image_url. Las pone el administrador desde el panel.';

-- Siempre una lista de como mucho 3 fotos.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'categories_imagenes_forma'
       and conrelid = 'public.categories'::regclass
  ) then
    alter table public.categories
      add constraint categories_imagenes_forma
      check (jsonb_typeof(imagenes) = 'array' and jsonb_array_length(imagenes) <= 3);
  end if;
end $$;
