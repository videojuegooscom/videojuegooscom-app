-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: fotos de noticias comprobadas
-- Qué hace: marca si las imágenes de cada noticia ya se han comprobado con IA (que de verdad
--           muestren lo que cuenta la noticia). Las noticias que ya existen quedan sin
--           comprobar y api/noticias-gaming.ts las revisa poco a poco.
-- Tipo:     aditiva (solo ADD COLUMN). No borra ni modifica datos existentes.
-- ============================================================================

alter table public.noticias_gaming
  add column if not exists imagenes_verificadas boolean not null default false;
