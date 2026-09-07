-- sql/chat_messages.sql
-- ---------------------------------------------------------------------------
-- Qué hace: crea la tabla "chat_messages" que usa app/(tabs)/chat-global.tsx
-- para el Chat Global de la tienda. Cualquiera (incluso sin sesión) puede
-- LEER los mensajes; solo un usuario con la sesión iniciada puede ESCRIBIR
-- uno nuevo.
--
-- Cómo funciona:
-- - El cliente (chat-global.tsx) solo manda el texto del mensaje (columna
--   "body") al hacer el INSERT. Quién lo envía (user_id, username,
--   display_name, role) lo rellena SIEMPRE el trigger
--   chat_messages_before_insert(), leyendo la sesión real (auth.uid()) y los
--   datos del registro (auth.users.raw_user_meta_data: full_name/username,
--   rellenados al crear la cuenta en app/(tabs)/perfil.tsx) y el rol del
--   usuario (public.profiles.role). Así nadie puede escribir un mensaje
--   haciéndose pasar por otra persona, ni ponerse a sí mismo como "admin",
--   aunque manipule la petición desde el navegador.
-- - Row Level Security: SELECT abierto a todo el mundo (anon + authenticated)
--   — el chat se puede leer sin cuenta, igual que ya explica el aviso
--   "Inicia sesión para enviar mensajes" en la propia pantalla. INSERT solo
--   a "authenticated", y solo si el user_id de la fila (ya fijado por el
--   trigger) coincide con auth.uid(). DELETE solo para administradores
--   (public.is_admin(), moderación básica: borrar un mensaje inapropiado).
-- - Se añade la tabla a la publicación "supabase_realtime" para que
--   chat-global.tsx reciba los mensajes nuevos al instante con
--   supabase.channel(...).on("postgres_changes", ...), sin recargar la
--   página.
--
-- - reply_to_id apunta a otro mensaje de la misma tabla cuando alguien
--   responde a uno (doble toque en chat-global.tsx). No hace falta ningún
--   trigger para esta columna: el cliente la manda tal cual, no es un dato
--   sensible (solo es una referencia a qué mensaje se está citando).
--
-- Cómo aplicarlo: copia y ejecuta este archivo completo en el SQL Editor de
-- tu proyecto de Supabase (Dashboard → SQL Editor → New query → Run). Es
-- seguro volver a ejecutarlo (usa IF NOT EXISTS / OR REPLACE / DROP...IF
-- EXISTS en todo lo que puede chocar). Necesita que sql/products.sql ya se
-- haya ejecutado antes (usa public.profiles y public.is_admin()).
--
-- Conectado con:
-- - app/(tabs)/chat-global.tsx → lee, envía y escucha mensajes nuevos.
-- - sql/chat_message_reactions.sql → reacciones (👍❤️😂...) a cada mensaje,
--   tabla aparte que depende de esta.
-- - sql/products.sql → public.profiles (rol) y public.is_admin(), que ya
--   deben existir antes de ejecutar este archivo.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null default '',
  display_name text not null default '',
  role text not null default 'member',
  body text not null
);

alter table public.chat_messages drop constraint if exists chat_messages_role_check;
alter table public.chat_messages add constraint chat_messages_role_check
  check (role in ('member', 'admin'));

alter table public.chat_messages drop constraint if exists chat_messages_body_check;
alter table public.chat_messages add constraint chat_messages_body_check
  check (char_length(trim(body)) > 0 and char_length(body) <= 500);

create index if not exists chat_messages_created_at_idx
  on public.chat_messages (created_at);

create index if not exists chat_messages_user_id_idx
  on public.chat_messages (user_id);

-- Responder a un mensaje: apunta a otro mensaje de esta misma tabla. Si el
-- mensaje original se borra, la respuesta se queda sin cita (no se borra).
alter table public.chat_messages add column if not exists reply_to_id uuid;

alter table public.chat_messages drop constraint if exists chat_messages_reply_to_id_fkey;
alter table public.chat_messages add constraint chat_messages_reply_to_id_fkey
  foreign key (reply_to_id) references public.chat_messages(id) on delete set null;

create index if not exists chat_messages_reply_to_id_idx
  on public.chat_messages (reply_to_id);

-- Rellena SIEMPRE quién envía el mensaje a partir de la sesión real (nunca
-- de lo que mande el cliente), para que el remitente no se pueda falsear.
create or replace function public.chat_messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb;
  v_username text;
  v_full_name text;
  v_email text;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para escribir en el chat.';
  end if;

  new.user_id := auth.uid();

  select raw_user_meta_data, email
    into v_meta, v_email
    from auth.users
    where id = auth.uid();

  v_username := nullif(trim(coalesce(v_meta ->> 'username', '')), '');
  v_full_name := nullif(trim(coalesce(v_meta ->> 'full_name', '')), '');

  new.username := coalesce(v_username, split_part(coalesce(v_email, ''), '@', 1), 'usuario');
  new.display_name := coalesce(v_full_name, new.username);

  select p.role into v_role from public.profiles p where p.id = auth.uid();
  new.role := case when v_role = 'admin' then 'admin' else 'member' end;

  new.body := trim(new.body);

  return new;
end;
$$;

drop trigger if exists trg_chat_messages_before_insert on public.chat_messages;
create trigger trg_chat_messages_before_insert
  before insert on public.chat_messages
  for each row
  execute function public.chat_messages_before_insert();

-- Row Level Security ---------------------------------------------------------
alter table public.chat_messages enable row level security;

drop policy if exists chat_messages_select_public on public.chat_messages;
drop policy if exists chat_messages_insert_authenticated on public.chat_messages;
drop policy if exists chat_messages_delete_admin on public.chat_messages;

-- Cualquiera puede leer el chat, incluso sin sesión.
create policy chat_messages_select_public
  on public.chat_messages
  for select
  to anon, authenticated
  using (true);

-- Solo con sesión iniciada se puede escribir, y solo como uno mismo (el
-- trigger de arriba ya se encarga de que user_id sea siempre auth.uid()).
create policy chat_messages_insert_authenticated
  on public.chat_messages
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Solo un administrador puede borrar un mensaje (moderación).
create policy chat_messages_delete_admin
  on public.chat_messages
  for delete
  to authenticated
  using (public.is_admin());

-- Grants mínimos --------------------------------------------------------
-- RLS ya manda (esto solo evita "permission denied" raros a nivel de tabla).
grant usage on schema public to anon, authenticated;
grant select on table public.chat_messages to anon, authenticated;
grant insert on table public.chat_messages to authenticated;
grant delete on table public.chat_messages to authenticated;

-- Tiempo real: añade la tabla a la publicación que usa Supabase Realtime
-- para avisar al instante de los mensajes nuevos a quien esté escuchando.
do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception
  when duplicate_object then null;
end $$;
