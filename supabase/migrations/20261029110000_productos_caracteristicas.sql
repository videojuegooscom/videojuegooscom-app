-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: «características» (ficha técnica) de cada producto, la que envía VeoAura por el puente.
-- Qué hace: products.caracteristicas (jsonb, por defecto []): lista ordenada de
--           {"etiqueta": texto ≤ 40, "valor": texto ≤ 80}, como mucho 30. La escribe
--           api/escaparate-veoaura.ts (cada «publicar» sustituye la lista entera) y la enseña
--           app/producto/[id].tsx en el apartado «Características».
-- Tipo:     SOLO AÑADE (una columna con valor por defecto y una comprobación de forma). No borra ni
--           cambia ninguna columna, fila, permiso ni función. La columna hereda los permisos que ya
--           tiene la tabla products (la leen quienes ya leen products; la escribe el servidor).
-- Vuelta atrás: dejar de usarla basta (el receptor y la ficha funcionan sin ella).
-- ============================================================================

alter table public.products
  add column if not exists caracteristicas jsonb not null default '[]'::jsonb;

comment on column public.products.caracteristicas is
  'Ficha técnica del producto: lista ordenada de {etiqueta (≤ 40), valor (≤ 80)}, como mucho 30. La envía VeoAura y cada «publicar» la sustituye entera.';

-- Siempre una lista y como mucho 30 elementos (el formato de cada elemento lo valida el receptor).
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'products_caracteristicas_lista'
       and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_caracteristicas_lista
      check (jsonb_typeof(caracteristicas) = 'array' and jsonb_array_length(caracteristicas) <= 30);
  end if;
end $$;
