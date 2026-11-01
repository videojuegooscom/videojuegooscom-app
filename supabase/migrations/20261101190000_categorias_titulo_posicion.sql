-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: dónde va el nombre de cada categoría encima de su portada en Inicio (petición del dueño, 2026-11-01).
--   En el editor (Administración → Categorías → «Cómo se ve en Inicio»), el dueño mantiene pulsado el nombre y lo
--   arrastra adonde quiera; «Aplicar a otras» copia esa posición (y la transparencia) a las categorías que elija.
--   Se guarda el centro del nombre en % del recuadro: {"x": 0-100, "y": 0-100}. Vacío = en el centro, como hasta ahora.
-- Tipo:     añade una columna (si no existe) y su comprobación. No borra nada ni cambia permisos: la tabla ya se lee en
--           público (categories_select_public_or_admin) y solo un administrador la cambia (categories_admin_update).
-- ============================================================================

alter table public.categories add column if not exists titulo_posicion jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'categories_titulo_posicion_check' and conrelid = 'public.categories'::regclass
  ) then
    alter table public.categories
      -- coalesce: sin «x» o sin «y», jsonb_typeof da NULL y la comprobación lo dejaría pasar; así se rechaza.
      add constraint categories_titulo_posicion_check check (
        titulo_posicion is null or (
          jsonb_typeof(titulo_posicion) = 'object'
          and coalesce(jsonb_typeof(titulo_posicion -> 'x'), '') = 'number'
          and coalesce(jsonb_typeof(titulo_posicion -> 'y'), '') = 'number'
          and coalesce((titulo_posicion ->> 'x')::numeric between 0 and 100, false)
          and coalesce((titulo_posicion ->> 'y')::numeric between 0 and 100, false)
        )
      );
  end if;
end $$;

comment on column public.categories.titulo_posicion is
  'Dónde va el nombre encima de la portada en Inicio: su centro en % del recuadro, {"x": 0-100, "y": 0-100}. Vacío = en el centro.';
