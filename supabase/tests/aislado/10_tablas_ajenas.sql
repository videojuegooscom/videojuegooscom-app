-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Tablas AJENAS a lo que se prueba, que algunas migraciones antiguas tocan de pasada y que hay que tener
-- para poder repetir toda la historia en la base aislada. Solo columnas mínimas; sin datos.
-- ============================================================================

-- 20261017120000_aprendizajes_revision_calidad_web.sql corrige una errata en la descripción SEO.
create table public.site_settings (
  id integer primary key,
  seo_description text
);
