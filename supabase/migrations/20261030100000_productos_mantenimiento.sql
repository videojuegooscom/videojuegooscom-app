-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: «Mantenimiento básico realizado» de cada producto, el que envía VeoAura por el puente.
-- Qué hace: products.mantenimiento (jsonb, null por defecto): {"titulo": texto ≤ 60, "nota": texto ≤ 300,
--           "puntos": [{"etiqueta": texto ≤ 60, "valor": texto ≤ 20}, … como mucho 30]}. La escribe
--           api/escaparate-veoaura.ts (cada «publicar» sustituye el bloque entero o lo quita con null) y la
--           enseña app/producto/[id].tsx junto a «Características».
-- Tipo:     SOLO AÑADE (una columna, null por defecto, y una comprobación de forma). No borra ni cambia
--           ninguna columna, fila, permiso ni función. La columna hereda los permisos de la tabla products.
-- Vuelta atrás: dejar de usarla basta (el receptor y la ficha funcionan sin ella).
-- ============================================================================

alter table public.products
  add column if not exists mantenimiento jsonb default null;

comment on column public.products.mantenimiento is
  'Mantenimiento básico realizado: {titulo (≤ 60), nota (≤ 300), puntos [{etiqueta (≤ 60), valor (≤ 20)}] (≤ 30)}. Lo envía VeoAura; cada «publicar» lo sustituye entero o lo quita con null.';

-- Si hay bloque, es un objeto con una lista de como mucho 30 puntos (el resto lo valida el receptor).
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'products_mantenimiento_forma'
       and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_mantenimiento_forma
      check (
        mantenimiento is null
        or (
          jsonb_typeof(mantenimiento) = 'object'
          and jsonb_typeof(mantenimiento -> 'puntos') = 'array'
          and jsonb_array_length(mantenimiento -> 'puntos') <= 30
        )
      );
  end if;
end $$;
