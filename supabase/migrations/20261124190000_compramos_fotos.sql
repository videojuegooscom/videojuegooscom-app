-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: fotos propias de las páginas «Compramos tu…» (dueño, 2026-11-24: «poder cambiarlas o añadir más, hasta 10»).
-- Qué hace: añade a public.site_settings la columna compramos_fotos: un objeto con, por página (consolas, moviles,
--   portatiles, pc, tablets), la lista de direcciones de sus fotos, en orden, como mucho 10. Vacía = las de siempre.
--   Las fotos se suben a product-media/compramos/ (el administrador ya puede subir ahí). La lee la tienda con la
--   lectura pública que ya tiene site_settings y la cambia el administrador con su regla de siempre (is_admin()).
-- Conectado con: app/compramos/[tipo].tsx (las enseña), components/panel/google.tsx (bloque «Páginas Compramos» →
--   «Fotos»), pruebas/perfil-datos.mjs (CMP y GSC).
-- Tipo:     aditiva: una columna con valor por defecto y su comprobación. No borra nada, no cambia permisos ni crea
--           funciones. Se puede aplicar varias veces.
-- ============================================================================

alter table if exists public.site_settings add column if not exists compramos_fotos jsonb not null default '{}'::jsonb;

do $$
begin
  if to_regclass('public.site_settings') is not null then
    comment on column public.site_settings.compramos_fotos is 'Fotos propias de cada página «Compramos tu…» ({"consolas": ["https://…"], …}), en orden, máximo 10 por página. Vacío: las de siempre.';
    if not exists (select 1 from pg_constraint where conname = 'site_settings_compramos_fotos_forma' and conrelid = 'public.site_settings'::regclass) then
      alter table public.site_settings add constraint site_settings_compramos_fotos_forma check (
        jsonb_typeof(compramos_fotos) = 'object'
        and (compramos_fotos -> 'consolas' is null or (jsonb_typeof(compramos_fotos -> 'consolas') = 'array' and jsonb_array_length(compramos_fotos -> 'consolas') <= 10))
        and (compramos_fotos -> 'moviles' is null or (jsonb_typeof(compramos_fotos -> 'moviles') = 'array' and jsonb_array_length(compramos_fotos -> 'moviles') <= 10))
        and (compramos_fotos -> 'portatiles' is null or (jsonb_typeof(compramos_fotos -> 'portatiles') = 'array' and jsonb_array_length(compramos_fotos -> 'portatiles') <= 10))
        and (compramos_fotos -> 'pc' is null or (jsonb_typeof(compramos_fotos -> 'pc') = 'array' and jsonb_array_length(compramos_fotos -> 'pc') <= 10))
        and (compramos_fotos -> 'tablets' is null or (jsonb_typeof(compramos_fotos -> 'tablets') = 'array' and jsonb_array_length(compramos_fotos -> 'tablets') <= 10))
      );
    end if;
  end if;
end;
$$;
