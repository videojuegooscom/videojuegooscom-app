-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: «Lo que Blue sabe de la tienda» (tabla blue_conocimiento)
-- Tipo:     SOLO AÑADE una tabla nueva con sus políticas. No toca nada existente.
-- Para qué: el dueño escribe aquí respuestas reales de la tienda (horario, plazos de envío,
--           garantía…) y Blue IA las usa al contestar a los clientes. Blue, desde el panel de
--           administración, le propone temas a lo largo del día.
-- Acceso:   misma pauta que flash_news: lectura de las activas para cualquiera (Blue IA las lee
--           desde el servidor con la clave pública) y escritura solo del administrador.
-- ============================================================================

create table if not exists public.blue_conocimiento (
  id          uuid primary key default gen_random_uuid(),
  tema        text not null check (char_length(tema) between 2 and 80),
  respuesta   text not null check (char_length(respuesta) between 2 and 800),
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint blue_conocimiento_tema_unico unique (tema)
);

alter table public.blue_conocimiento enable row level security;

create policy blue_conocimiento_select_activo_o_admin on public.blue_conocimiento
  for select using (activo = true or public.is_admin());

create policy blue_conocimiento_admin_insert on public.blue_conocimiento
  for insert with check (public.is_admin());

create policy blue_conocimiento_admin_update on public.blue_conocimiento
  for update using (public.is_admin()) with check (public.is_admin());

create policy blue_conocimiento_admin_delete on public.blue_conocimiento
  for delete using (public.is_admin());
