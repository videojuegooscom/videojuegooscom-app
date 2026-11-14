-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: «Revisado por nuestro equipo» y garantía por producto (mejora 4 «Ficha de confianza», aprobada por el dueño
--            el 2026-11-14, opción A: lo marca el dueño en cada producto).
-- Qué hace:
--   1) products.revisado (por defecto false): el dueño lo marca en Administración → Productos («Revisado por nuestro
--      equipo»). Solo si está marcado, la ficha del producto enseña la insignia; si no, no sale nada.
--   2) products.garantia_meses (vacío o entre 1 y 36): los meses de garantía que el dueño indica para ese producto.
--      Vacío = «Sin indicar»: la ficha no promete ninguna garantía.
--   Ningún producto se marca al aplicarla: todos empiezan sin revisar y sin garantía indicada.
-- Conectado con: app/admin/products.tsx (interruptor, selector, indicador y filtro «Revisados»), app/producto/[id].tsx
--           (insignias), app/admin/analytics.tsx («Ficha del producto (30 días)») y pruebas/perfil-datos.mjs (sección
--           FCONF). api/escaparate-veoaura.ts no escribe estas columnas: «publicar» desde VeoAura no las pisa.
-- Tipo:     AÑADE dos columnas y una comprobación. No borra nada. Sin permisos nuevos ni políticas nuevas (las columnas
--           quedan bajo las de products: todos leen los publicados y solo el administrador escribe). Repetirla no cambia nada.
-- ============================================================================

alter table public.products add column if not exists revisado boolean not null default false;
alter table public.products add column if not exists garantia_meses integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'products_garantia_meses_rango'
       and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_garantia_meses_rango
      check (garantia_meses is null or (garantia_meses between 1 and 36));
  end if;
end $$;

comment on column public.products.revisado is 'Revisado por nuestro equipo: lo marca el dueño en Administración → Productos; solo entonces la ficha lo enseña.';
comment on column public.products.garantia_meses is 'Meses de garantía de este producto (1-36) que indica el dueño; vacío = sin indicar (la ficha no muestra garantía).';
