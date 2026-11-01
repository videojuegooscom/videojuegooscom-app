-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: seguidores de TikTok e Instagram junto al logo de Inicio (petición del dueño, 2026-11-01).
--   El dueño escribe el número en Administración → Redes sociales y Inicio lo enseña junto al logo
--   (components/SocialLinks.tsx, RedJuntoAlLogo). Sin esta migración, Inicio dice «Síguenos».
-- Tipo:     añade dos columnas (si no existen) y su comprobación. No borra nada ni cambia permisos: la tabla ya se lee
--           en público (social_links_public_read) y solo un administrador la puede cambiar (social_links_admin_update).
-- ============================================================================

alter table public.social_links add column if not exists seguidores integer;
alter table public.social_links add column if not exists seguidores_actualizado timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'social_links_seguidores_check' and conrelid = 'public.social_links'::regclass
  ) then
    alter table public.social_links
      add constraint social_links_seguidores_check check (seguidores is null or (seguidores >= 0 and seguidores <= 2000000000));
  end if;
end $$;

comment on column public.social_links.seguidores is
  'Seguidores que escribe el dueño (TikTok e Instagram): se ven junto al logo de Inicio. Vacío = «Síguenos».';
comment on column public.social_links.seguidores_actualizado is
  'Cuándo escribió el dueño el número de seguidores.';
