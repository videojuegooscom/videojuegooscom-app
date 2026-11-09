-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: cuánto se ve la portada de cada categoría en su recuadro de Inicio (petición del dueño, 2026-11-01).
--   En Inicio, la portada llena el recuadro de la categoría y el nombre va encima. Desde el editor de la categoría
--   (Administración → Categorías) el dueño mueve una barra para que la foto se vea más fuerte o más suave y así el
--   nombre se lea más o menos (components/PortadasCategoria.tsx, PortadaConNombre). Sin esta migración (o sin valor),
--   la foto sale al 55 %.
-- Qué hace: guarda en cada categoría lo fuerte que se ve su portada (del 10 al 100 %).
-- Conectado con: public.categories.portada_opacidad; app/admin/categories.tsx, components/PortadasCategoria.tsx y
--           app/catalogo.tsx.
-- Tipo:     añade una columna (si no existe) y su comprobación. No borra nada ni cambia permisos: la tabla ya se lee en
--           público (categories_select_public_or_admin) y solo un administrador la cambia (categories_admin_update).
-- ============================================================================

alter table public.categories add column if not exists portada_opacidad smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'categories_portada_opacidad_check' and conrelid = 'public.categories'::regclass
  ) then
    alter table public.categories
      add constraint categories_portada_opacidad_check check (portada_opacidad is null or (portada_opacidad >= 10 and portada_opacidad <= 100));
  end if;
end $$;

comment on column public.categories.portada_opacidad is
  'Cuánto se ve la portada en el recuadro de Inicio (10-100 %); el nombre va encima. Vacío = 55 %.';
