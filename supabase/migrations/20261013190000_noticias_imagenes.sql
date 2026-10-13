-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: varias imágenes por noticia
-- Qué hace: guarda todas las imágenes encontradas de cada noticia (portada del artículo,
--           imágenes del RSS y del texto) para mostrarlas en un carrusel en
--           Foro → Noticias Gaming. imagen_url sigue siendo la principal.
-- Tipo:     aditiva (solo ADD COLUMN). No borra ni modifica datos existentes.
-- ============================================================================

alter table public.noticias_gaming
  add column if not exists imagenes jsonb not null default '[]'::jsonb;
