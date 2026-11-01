-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: el encuadre de cada portada para el recuadro de su categoría en Inicio (petición del dueño, 2026-11-01).
--   En el editor de la categoría (Administración → Categorías), al subir una foto el dueño la encuadra con la forma
--   exacta del recuadro de Inicio y ve cómo quedará antes de subirla. Se guardan la foto entera (columna imagenes, la
--   que usa la cabecera de dentro de la categoría) y su encuadre (esta columna, en el mismo orden; '' = sin encuadrar).
--   Inicio enseña el encuadre (components/PortadasCategoria.tsx, portadasInicioDe). Sin esta migración, Inicio recorta
--   las fotos por el centro, como hasta ahora.
-- Tipo:     añade una columna (si no existe). No borra nada ni cambia permisos: la tabla ya se lee en público
--           (categories_select_public_or_admin) y solo un administrador la cambia (categories_admin_update).
-- ============================================================================

alter table public.categories add column if not exists portadas_inicio text[] not null default '{}'::text[];

comment on column public.categories.portadas_inicio is
  'Encuadre de cada portada para el recuadro de Inicio (mismo orden que imagenes; vacío = sin encuadrar).';
