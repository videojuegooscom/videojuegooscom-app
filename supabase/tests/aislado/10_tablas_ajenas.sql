-- == VIDEOJUEGOSZARAGOZA ====================================================
-- supabase/tests/aislado/10_tablas_ajenas.sql
-- Qué hace: crea tablas vacías de relleno que necesitan algunas migraciones antiguas en la base de pruebas.
-- Conectado con: lo carga pruebas/sql-aislado.mjs; explicado en docs/pruebas-sql-aisladas.md; hoy crea site_settings.
-- Tablas AJENAS a lo que se prueba, que algunas migraciones antiguas tocan de pasada y que hay que tener
-- para poder repetir toda la historia en la base aislada. Solo columnas mínimas; sin datos.
-- ============================================================================

-- 20261017120000_aprendizajes_revision_calidad_web.sql corrige una errata en la descripción SEO.
create table public.site_settings (
  id integer primary key,
  seo_description text
);
