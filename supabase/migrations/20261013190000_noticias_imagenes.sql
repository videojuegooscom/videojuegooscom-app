-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: varias imágenes por noticia
-- Qué hace: guarda todas las imágenes encontradas de cada noticia (portada del artículo,
--           imágenes del RSS y del texto) para mostrarlas en un carrusel en
--           Foro → Noticias Gaming. imagen_url sigue siendo la principal.
-- Tipo:     aditiva (solo ADD COLUMN). No borra ni modifica datos existentes.
-- Conectado con: noticias_gaming.imagenes; api/noticias-gaming.ts (la rellena) y app/(tabs)/chat-global.tsx.
-- ============================================================================

alter table public.noticias_gaming
  add column if not exists imagenes jsonb not null default '[]'::jsonb;
