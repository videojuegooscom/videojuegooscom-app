-- sql/chat_message_reactions.sql
-- ---------------------------------------------------------------------------
-- Qué hace: crea la tabla "chat_message_reactions" — las reacciones (👍 ❤️ 😂
-- 😮 😢 🙏) que un usuario deja al tocar una vez un mensaje del Chat Global
-- (ver app/(tabs)/chat-global.tsx). Cada persona solo puede tener UNA
-- reacción activa por mensaje: tocar un emoji distinto la cambia, tocar el
-- mismo la quita (como en WhatsApp/Slack).
--
-- Cómo funciona:
-- - La clave primaria es (message_id, user_id): como mucho una fila por
--   persona y mensaje. El cliente hace INSERT (reacción nueva), UPDATE (para
--   cambiar de emoji) o DELETE (para quitarla) según lo que ya tenga
--   guardado localmente — no hace falta UPSERT.
-- - user_id lo rellena SIEMPRE el trigger
--   chat_message_reactions_before_insert() a partir de la sesión real
--   (auth.uid()), igual que en sql/chat_messages.sql — así nadie puede
--   reaccionar haciéndose pasar por otra persona. Para el UPDATE no hace
--   falta trigger: el cliente nunca cambia user_id, así que la política de
--   RLS de UPDATE ya lo comprueba con el valor que ya tenía la fila.
-- - Row Level Security: SELECT abierto a todo el mundo (para que los
--   contadores de reacciones se vean sin sesión). INSERT/UPDATE/DELETE solo
--   para el propio usuario autenticado, sobre su propia fila.
-- - Se añade la tabla a la publicación "supabase_realtime" para que los
--   contadores se actualicen al instante en todas las pantallas abiertas.
--
-- Cómo aplicarlo: copia y ejecuta este archivo completo en el SQL Editor de
-- tu proyecto de Supabase (Dashboard → SQL Editor → New query → Run). Es
-- seguro volver a ejecutarlo. Necesita que sql/chat_messages.sql ya se haya
-- ejecutado antes (chat_message_reactions.message_id apunta a esa tabla).
--
-- Conectado con:
-- - app/(tabs)/chat-global.tsx → lee, añade, cambia y quita reacciones.
-- - sql/chat_messages.sql → tabla chat_messages, que ya debe existir.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

create table if not exists public.chat_message_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.chat_message_reactions drop constraint if exists chat_message_reactions_emoji_check;
alter table public.chat_message_reactions add constraint chat_message_reactions_emoji_check
  check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🙏'));

create index if not exists chat_message_reactions_message_id_idx
  on public.chat_message_reactions (message_id);

-- Rellena SIEMPRE quién reacciona a partir de la sesión real, igual que en
-- sql/chat_messages.sql — el cliente nunca manda user_id.
create or replace function public.chat_message_reactions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para reaccionar a un mensaje.';
  end if;

  new.user_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_chat_message_reactions_before_insert on public.chat_message_reactions;
create trigger trg_chat_message_reactions_before_insert
  before insert on public.chat_message_reactions
  for each row
  execute function public.chat_message_reactions_before_insert();

-- Row Level Security ---------------------------------------------------------
alter table public.chat_message_reactions enable row level security;

drop policy if exists chat_message_reactions_select_public on public.chat_message_reactions;
drop policy if exists chat_message_reactions_insert_authenticated on public.chat_message_reactions;
drop policy if exists chat_message_reactions_update_own on public.chat_message_reactions;
drop policy if exists chat_message_reactions_delete_own on public.chat_message_reactions;

-- Cualquiera puede ver los contadores de reacciones, incluso sin sesión.
create policy chat_message_reactions_select_public
  on public.chat_message_reactions
  for select
  to anon, authenticated
  using (true);

-- Solo con sesión iniciada, y solo como uno mismo (el trigger de arriba ya
-- se encarga de que user_id sea siempre auth.uid()).
create policy chat_message_reactions_insert_authenticated
  on public.chat_message_reactions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Cambiar de emoji: solo tu propia reacción.
create policy chat_message_reactions_update_own
  on public.chat_message_reactions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Quitar tu reacción: solo la tuya.
create policy chat_message_reactions_delete_own
  on public.chat_message_reactions
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Grants mínimos --------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on table public.chat_message_reactions to anon, authenticated;
grant insert, update, delete on table public.chat_message_reactions to authenticated;

-- Tiempo real: añade la tabla a la publicación que usa Supabase Realtime
-- para que los contadores de reacciones se actualicen al instante.
do $$
begin
  alter publication supabase_realtime add table public.chat_message_reactions;
exception
  when duplicate_object then null;
end $$;
