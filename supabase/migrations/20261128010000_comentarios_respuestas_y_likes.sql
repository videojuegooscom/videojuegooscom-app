-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: respuestas y «me gusta» en los comentarios de las noticias
-- Qué hace: 1) noticias_comentarios.respuesta_a: un comentario puede responder a otro (un solo nivel,
--           como Instagram; la respuesta a una respuesta cuelga del comentario de arriba). Un disparador
--           comprueba que el comentario respondido es de la misma noticia y no es ya una respuesta.
--           2) noticias_comentarios_likes: cada cliente con sesión da como mucho un «me gusta» a cada
--           comentario y puede quitarlo (mismo patrón que noticias_likes).
-- Acceso:   ver respuestas y «me gusta», cualquiera; responder y dar o quitar el suyo, solo con sesión.
--           vz_agente solo lee.
-- Tipo:     aditiva. No borra datos. ACCIÓN MANUAL (ALTER en tabla de la tienda y políticas using (true)
--           para anon): la aplica el dueño en el SQL Editor.
-- Conectado con: components/foro/NoticiasForo.tsx (HojaComentariosNoticia), app/noticias/[id].tsx y
--           Administración → Analítica (barra de la noticia).
-- ============================================================================

alter table public.noticias_comentarios
  add column if not exists respuesta_a uuid references public.noticias_comentarios(id) on delete cascade;

create index if not exists noticias_comentarios_respuesta_a_idx
  on public.noticias_comentarios (respuesta_a) where respuesta_a is not null;

create or replace function public.noticias_comentarios_validar_respuesta()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  padre record;
begin
  if new.respuesta_a is null then
    return new;
  end if;
  select noticia_id, respuesta_a into padre from public.noticias_comentarios where id = new.respuesta_a;
  if not found or padre.noticia_id <> new.noticia_id or padre.respuesta_a is not null then
    raise exception 'La respuesta debe ser a un comentario de la misma noticia';
  end if;
  return new;
end;
$$;

create or replace trigger trg_noticias_comentarios_validar_respuesta
  before insert on public.noticias_comentarios
  for each row execute function public.noticias_comentarios_validar_respuesta();

create table if not exists public.noticias_comentarios_likes (
  comentario_id uuid not null references public.noticias_comentarios(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (comentario_id, user_id)
);

create index if not exists noticias_comentarios_likes_user_idx
  on public.noticias_comentarios_likes (user_id);

alter table public.noticias_comentarios_likes enable row level security;

create policy noticias_comentarios_likes_lectura on public.noticias_comentarios_likes
  for select to anon, authenticated using (true);
create policy noticias_comentarios_likes_insert on public.noticias_comentarios_likes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy noticias_comentarios_likes_quitar_propio on public.noticias_comentarios_likes
  for delete to authenticated using (user_id = (select auth.uid()));

grant select on public.noticias_comentarios_likes to anon;
grant select, insert, delete on public.noticias_comentarios_likes to authenticated;

-- Lectura para el agente (vz-sql), como el resto de tablas de contenido de solo lectura.
grant select on public.noticias_comentarios_likes to vz_agente;
create policy vz_agente_leer on public.noticias_comentarios_likes
  for select to vz_agente using (true);
