-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: contexto, tema e interés de las noticias (dueño, 2026-11-09: «mejorar la sección de noticias dando más
--            contexto o añadiendo noticias más interesantes, pero sin que se repitan; quiero atraer usuarios orgánicos»).
-- Qué hace: añade a public.noticias_gaming tres columnas que rellena la IA al desglosar cada noticia:
--           - contexto (text): 2-4 frases de antecedentes para quien no sigue la actualidad (o null).
--           - tema (text): clave corta del suceso concreto («zelda-ocarina-remake-lanzamiento»), para no publicar
--             dos veces el mismo suceso aunque cambie el título.
--           - interes (smallint, de 1 a 10): interés para el lector de la tienda; solo se guardan las de 6 o más.
--           Más la comprobación de que interes va de 1 a 10 y un índice por (tema, created_at) para buscar repetidas.
--           Las noticias ya guardadas se quedan con las tres a null.
-- Conectado con: api/noticias-gaming.ts (las escribe y lee tema de las últimas 72 h; si aún no existen, guarda sin
--           ellas); las páginas públicas app/noticias/ y la pestaña app/(tabs)/chat-global.tsx (enseñan el contexto).
-- Tipo:     aditiva (tres columnas que admiten null, una comprobación y un índice). No borra nada ni toca permisos,
--           políticas ni funciones. Repetirla no cambia nada.
-- ============================================================================

alter table public.noticias_gaming add column if not exists contexto text;
alter table public.noticias_gaming add column if not exists tema text;
alter table public.noticias_gaming add column if not exists interes smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'noticias_gaming_interes_rango') then
    alter table public.noticias_gaming add constraint noticias_gaming_interes_rango
      check (interes is null or interes between 1 and 10);
  end if;
end $$;

create index if not exists noticias_gaming_tema_created_at_idx
  on public.noticias_gaming (tema, created_at desc);
