-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: imágenes de noticias rápidas
-- Qué hace:
--   1. Bucket público "noticias" en Storage: api/noticias-gaming.ts guarda ahí una copia de
--      cada foto ya comprobada, para servirla desde nuestro CDN en vez de desde la web del
--      periódico (más rápido y siempre disponible). Solo imágenes, máx. 5 MB.
--   2. Columna imagenes_meta: ancho y alto de cada foto, para que la app reserve el hueco
--      exacto sin tener que descargarla antes (evita saltos y esperas).
-- Escribir en el bucket solo lo hace el servidor con su clave; leer, cualquiera (público).
-- Tipo:     aditiva. No borra ni modifica datos existentes.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('noticias', 'noticias', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

alter table public.noticias_gaming
  add column if not exists imagenes_meta jsonb not null default '[]'::jsonb;
