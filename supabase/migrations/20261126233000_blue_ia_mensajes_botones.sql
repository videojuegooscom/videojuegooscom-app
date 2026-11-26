-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: los botones de las respuestas de Blue IA se guardan con el mensaje (2026-11-26).
--   El dueño: «¿por qué luego de un tiempo las opciones que me daba Blue desaparecen?». Al volver a una conversación
--   guardada solo se recuperaba el texto; los botones (artículos con miniatura, «Ver el catálogo», «Vender ahora»…)
--   se perdían. Autorizado por el dueño: «OK, guarda los botones de Blue».
-- Qué hace: añade a public.blue_ia_mensajes la columna «botones» (jsonb, opcional) con un tope de tamaño.
-- Conectado con: app/(tabs)/blue-ia.tsx (los guarda con cada respuesta y los vuelve a enseñar, comprobando los
--   artículos contra el catálogo), components/panel/cliente-ficha.tsx (los nombra en la conversación del cliente).
-- Tipo:     aditiva. No borra ni cambia datos ni permisos: las reglas de filas de la tabla siguen igual (cada cliente
--           solo escribe y lee los suyos). Repetirla no cambia nada.
-- ============================================================================

alter table public.blue_ia_mensajes
  add column if not exists botones jsonb;

-- Solo un objeto pequeño (ids y nombres de artículos y tipos de acción): como mucho 4 KB.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'blue_ia_mensajes_botones_tamano' and conrelid = 'public.blue_ia_mensajes'::regclass
  ) then
    alter table public.blue_ia_mensajes
      add constraint blue_ia_mensajes_botones_tamano
      check (botones is null or (jsonb_typeof(botones) = 'object' and pg_column_size(botones) <= 4096));
  end if;
end $$;

comment on column public.blue_ia_mensajes.botones is
  'Botones de la respuesta de Blue IA (artículos, acciones de la tienda, referencia de pedido) para volver a enseñarlos al abrir la conversación. Solo en mensajes de Blue (rol assistant).';
