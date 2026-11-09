-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: vídeos de «Nuestros Servicios» (dueño, 2026-11-09: «un espacio extra en la página de servicios que se
--            llame "Nuestros Servicios" donde pueda subir vídeos de hasta un minuto y el cliente vea cómo trabajamos»;
--            eligió enlazarlos desde Instagram o TikTok para no gastar la cuota de descarga de Supabase).
-- Qué hace: site_settings.videos_servicios, la lista de vídeos en orden, como
--           [{"url": "https://www.instagram.com/reel/…", "titulo": "Limpieza de una PS4"}, …] (de 0 a 12).
--           La escribe el administrador en Administración → Servicios; la lee cualquiera (la lectura de site_settings
--           ya es pública y su escritura ya es solo de administradores: no se toca ningún permiso).
-- Conectado con: public.site_settings.videos_servicios; la enseña app/servicios.tsx y la edita app/admin/services.tsx.
-- Tipo:     aditiva (una columna con valor por defecto y su comprobación de forma). No borra nada. Repetirla no cambia
--           nada.
-- ============================================================================

alter table public.site_settings add column if not exists videos_servicios jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'site_settings_videos_servicios_forma') then
    alter table public.site_settings add constraint site_settings_videos_servicios_forma
      check (jsonb_typeof(videos_servicios) = 'array' and jsonb_array_length(videos_servicios) <= 12);
  end if;
end $$;
