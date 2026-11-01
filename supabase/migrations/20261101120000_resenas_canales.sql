-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: reseñas en los canales de venta debajo del logo de Inicio (petición del dueño, 2026-11-01).
--   El dueño escribe cuántas reseñas lleva en sus canales de venta (Wallapop, Vinted, Facebook Marketplace…) en
--   Administración → Redes sociales, y Inicio lo enseña debajo del logo con una estrella (components/SocialLinks.tsx,
--   ResenasCanales). Sin esta migración o sin número, no sale nada.
-- Tipo:     añade dos columnas (si no existen) a la fila única de ajustes y su comprobación. No borra nada ni cambia
--           permisos: site_settings ya se lee en público (site_settings_public_read) y solo un administrador la cambia
--           (site_settings_admin_update).
-- ============================================================================

alter table public.site_settings add column if not exists resenas_canales integer;
alter table public.site_settings add column if not exists resenas_canales_actualizado timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'site_settings_resenas_canales_check' and conrelid = 'public.site_settings'::regclass
  ) then
    alter table public.site_settings
      add constraint site_settings_resenas_canales_check check (resenas_canales is null or (resenas_canales >= 0 and resenas_canales <= 2000000000));
  end if;
end $$;

comment on column public.site_settings.resenas_canales is
  'Reseñas que lleva la tienda en sus canales de venta (las escribe el dueño): se ven debajo del logo de Inicio. Vacío = no sale.';
comment on column public.site_settings.resenas_canales_actualizado is
  'Cuándo escribió el dueño el número de reseñas.';
