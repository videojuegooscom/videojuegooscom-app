-- sql/product_chats.sql
-- ---------------------------------------------------------------------------
-- Qué hace: crea el chat PRIVADO por producto (distinto del "Chat Global" de
-- sql/chat_messages.sql, que es público). Cuando un cliente pulsa "Chat" en
-- la ficha de un producto (app/producto/[id].tsx), se abre una conversación
-- de solo dos personas: ese cliente y cualquier administrador. Sirve para
-- que Jefe sepa quién le está escribiendo por cada anuncio y pueda marcarlo
-- como comprador (ver sql/product_sales.sql) desde app/admin/chats.tsx.
--
-- Cómo funciona:
-- - "product_chats" es UNA fila por combinación (producto, cliente): si el
--   mismo cliente vuelve a escribir por el mismo producto, se reutiliza la
--   misma conversación en vez de crear otra. get_or_create_product_chat(...)
--   se encarga de crearla la primera vez o devolver la que ya existe.
-- - "product_chat_messages" son los mensajes de cada conversación. Un
--   trigger rellena SIEMPRE quién escribe (sender_user_id, sender_name) a
--   partir de la sesión real y calcula sender_role ('customer' o 'admin')
--   comprobando public.is_admin() — igual que sql/store_reviews.sql, nadie
--   puede firmar un mensaje como otra persona ni hacerse pasar por Jefe.
-- - Solo pueden leer/escribir en una conversación: el cliente dueño de ella
--   y cualquier administrador. Nadie más, ni siquiera con sesión iniciada
--   (a diferencia del Chat Global, esto es privado).
-- - Cada mensaje nuevo actualiza product_chats.last_message_at y un resumen
--   corto (last_message_preview), para que app/admin/chats.tsx y la pestaña
--   "Chat" del cliente puedan listar las conversaciones ordenadas por
--   actividad reciente sin tener que leer todos los mensajes de cada una.
-- - Se añaden ambas tablas a la publicación "supabase_realtime" para que los
--   mensajes nuevos aparezcan al instante, igual que el Chat Global.
-- - Conversaciones GENERALES (sin producto): product_id admite null desde
--   septiembre, para el botón "Chatear con nosotros" de app/catalogo.tsx
--   ("¿No encuentras lo que buscas?") y, en el futuro, cualquier chat de
--   atención al cliente que no parta de la ficha de un producto concreto.
--   get_or_create_support_chat() crea o reutiliza la conversación general
--   del cliente logueado — no se puede usar "on conflict" para esto porque
--   dos valores NULL nunca cuentan como iguales para la restricción de
--   unicidad de product_chats, así que comprueba a mano si ya existe una
--   fila con product_id is null para ese cliente antes de insertar.
-- - Estado de lectura: product_chats guarda quién escribió el último
--   mensaje (last_sender_role) y cuándo abrió cada lado la conversación por
--   última vez (customer_last_read_at / admin_last_read_at).
--   mark_chat_read(chat_id) marca como leído el lado de quien llama, y
--   get_unread_chat_count() cuenta cuántas conversaciones tienen algo sin
--   leer para quien llama — es lo que alimenta el contador de
--   components/Campanita.tsx.
--
-- Cómo aplicarlo: copia y ejecuta este archivo completo en el SQL Editor de
-- tu proyecto de Supabase (Dashboard → SQL Editor → New query → Run) DESPUÉS
-- de sql/products.sql. Es seguro volver a ejecutarlo.
--
-- Conectado con:
-- - sql/products.sql → products.id, public.is_admin().
-- - app/producto/[id].tsx → botón "Chat": llama a get_or_create_product_chat.
-- - components/ProductChatThread.tsx → pantalla del hilo (lee/envía mensajes
--   de una conversación concreta), la usan tanto el cliente como el admin;
--   llama a mark_chat_read() al abrir el hilo.
-- - app/(tabs)/chat-global.tsx → pestaña "Chat" (bandeja del cliente): lista
--   sus propias conversaciones (product_chats donde customer_user_id = él).
-- - app/admin/chats.tsx → bandeja de admin: todas las conversaciones,
--   agrupadas por producto, con botón "Marcar como vendido" (usa
--   sql/product_sales.sql).
-- - components/Campanita.tsx → llama a get_unread_chat_count() para el
--   contador de la campanita flotante, en toda la app.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- --- product_chats -----------------------------------------------------

create table if not exists public.product_chats (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Admite null: conversación GENERAL de soporte, sin producto asociado
  -- (ver get_or_create_support_chat más abajo). Por si product_chats ya
  -- existía con product_id "not null" (desplegada antes de este cambio),
  -- el "alter column ... drop not null" de más abajo lo deja como aquí.
  product_id uuid references public.products(id) on delete cascade,
  customer_user_id uuid not null references auth.users(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  last_message_preview text not null default '',
  -- Estado de lectura para el contador de la campanita (components/Campanita.tsx):
  -- last_sender_role dice quién escribió el último mensaje ('customer' o
  -- 'admin'); *_last_read_at es la última vez que esa parte abrió la
  -- conversación. Si last_message_at es más reciente que su propio
  -- *_last_read_at Y el último mensaje NO es suyo, hay algo sin leer.
  -- admin_last_read_at es compartido por todos los admins (solo hay uno).
  last_sender_role text not null default 'customer',
  customer_last_read_at timestamptz not null default now(),
  admin_last_read_at timestamptz not null default now()
);

-- Por si product_chats ya existía (desplegada antes de añadir el estado de
-- lectura): añade las columnas nuevas sin tocar las filas que ya hay.
alter table public.product_chats
  add column if not exists last_sender_role text not null default 'customer';
alter table public.product_chats
  add column if not exists customer_last_read_at timestamptz not null default now();
alter table public.product_chats
  add column if not exists admin_last_read_at timestamptz not null default now();

-- Por si product_chats ya existía con product_id "not null" (desplegada
-- antes de admitir conversaciones generales sin producto): la deja
-- nullable. Seguro volver a ejecutarlo si ya lo es.
alter table public.product_chats alter column product_id drop not null;

alter table public.product_chats drop constraint if exists product_chats_unique_thread;
alter table public.product_chats add constraint product_chats_unique_thread
  unique (product_id, customer_user_id);

create index if not exists product_chats_customer_idx
  on public.product_chats (customer_user_id, last_message_at desc);

create index if not exists product_chats_product_idx
  on public.product_chats (product_id, last_message_at desc);

alter table public.product_chats enable row level security;

drop policy if exists product_chats_select on public.product_chats;
drop policy if exists product_chats_insert on public.product_chats;
drop policy if exists product_chats_delete_admin on public.product_chats;

create policy product_chats_select
  on public.product_chats
  for select
  to authenticated
  using (auth.uid() = customer_user_id or public.is_admin());

-- El INSERT normal pasa por get_or_create_product_chat() (más abajo), pero
-- se deja también esta política por si hiciera falta insertar directamente.
create policy product_chats_insert
  on public.product_chats
  for insert
  to authenticated
  with check (auth.uid() = customer_user_id or public.is_admin());

create policy product_chats_delete_admin
  on public.product_chats
  for delete
  to authenticated
  using (public.is_admin());

-- Crea la conversación de (producto, cliente logueado) si no existe todavía,
-- o devuelve la que ya hay. security definer para no depender de que el
-- INSERT directo pase las políticas de arriba.
create or replace function public.get_or_create_product_chat(p_product_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para escribir por este producto.';
  end if;

  insert into public.product_chats (product_id, customer_user_id)
  values (p_product_id, auth.uid())
  on conflict (product_id, customer_user_id) do nothing;

  select id into v_chat_id
    from public.product_chats
    where product_id = p_product_id and customer_user_id = auth.uid();

  return v_chat_id;
end;
$$;

grant execute on function public.get_or_create_product_chat(uuid) to authenticated;

-- Crea (o reutiliza) la conversación GENERAL del cliente logueado, sin
-- producto asociado — botón "Chatear con nosotros" de app/catalogo.tsx. No
-- se puede reutilizar el patrón "on conflict (product_id, customer_user_id)"
-- de arriba porque dos filas con product_id = null nunca cuentan como
-- iguales para esa restricción de unicidad; por eso aquí se busca a mano
-- antes de insertar.
create or replace function public.get_or_create_support_chat()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para escribirnos.';
  end if;

  select id into v_chat_id
    from public.product_chats
    where product_id is null and customer_user_id = auth.uid();

  if v_chat_id is null then
    insert into public.product_chats (product_id, customer_user_id)
    values (null, auth.uid())
    returning id into v_chat_id;
  end if;

  return v_chat_id;
end;
$$;

grant execute on function public.get_or_create_support_chat() to authenticated;

-- --- product_chat_messages -----------------------------------------------

create table if not exists public.product_chat_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  chat_id uuid not null references public.product_chats(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null default 'customer',
  sender_name text not null default '',
  body text not null default ''
);

alter table public.product_chat_messages drop constraint if exists product_chat_messages_role_check;
alter table public.product_chat_messages add constraint product_chat_messages_role_check
  check (sender_role in ('customer', 'admin'));

alter table public.product_chat_messages drop constraint if exists product_chat_messages_body_check;
alter table public.product_chat_messages add constraint product_chat_messages_body_check
  check (char_length(body) <= 2000);

create index if not exists product_chat_messages_chat_idx
  on public.product_chat_messages (chat_id, created_at asc);

-- Rellena SIEMPRE quién escribe (nunca lo que mande el cliente) y comprueba
-- que quien escribe es el dueño de la conversación o un admin.
create or replace function public.product_chat_messages_before_insert()
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
  v_is_admin boolean;
  v_is_owner boolean;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para escribir.';
  end if;

  select public.is_admin() into v_is_admin;

  if not v_is_admin then
    select exists (
      select 1 from public.product_chats c
      where c.id = new.chat_id and c.customer_user_id = auth.uid()
    ) into v_is_owner;

    if not v_is_owner then
      raise exception 'No puedes escribir en esta conversación.';
    end if;
  end if;

  new.sender_user_id := auth.uid();
  new.sender_role := case when v_is_admin then 'admin' else 'customer' end;

  select raw_user_meta_data, email
    into v_meta, v_email
    from auth.users
    where id = auth.uid();

  v_username := nullif(trim(coalesce(v_meta ->> 'username', '')), '');
  v_full_name := nullif(trim(coalesce(v_meta ->> 'full_name', '')), '');

  new.sender_name := case
    when v_is_admin then coalesce(v_full_name, v_username, 'Tienda')
    else coalesce(v_full_name, v_username, split_part(coalesce(v_email, ''), '@', 1), 'usuario')
  end;

  new.body := trim(coalesce(new.body, ''));

  if new.body = '' then
    raise exception 'El mensaje no puede estar vacío.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_product_chat_messages_before_insert on public.product_chat_messages;
create trigger trg_product_chat_messages_before_insert
  before insert on public.product_chat_messages
  for each row
  execute function public.product_chat_messages_before_insert();

-- Mantiene product_chats.last_message_at / last_message_preview al día para
-- que las bandejas (admin y cliente) se puedan ordenar por actividad sin
-- tener que leer todos los mensajes de cada conversación.
create or replace function public.product_chat_messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.product_chats
    set last_message_at = new.created_at,
        last_message_preview = left(new.body, 140),
        last_sender_role = new.sender_role
    where id = new.chat_id;
  return new;
end;
$$;

drop trigger if exists trg_product_chat_messages_after_insert on public.product_chat_messages;
create trigger trg_product_chat_messages_after_insert
  after insert on public.product_chat_messages
  for each row
  execute function public.product_chat_messages_after_insert();

alter table public.product_chat_messages enable row level security;

drop policy if exists product_chat_messages_select on public.product_chat_messages;
drop policy if exists product_chat_messages_insert on public.product_chat_messages;

create policy product_chat_messages_select
  on public.product_chat_messages
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.product_chats c
      where c.id = chat_id and c.customer_user_id = auth.uid()
    )
  );

create policy product_chat_messages_insert
  on public.product_chat_messages
  for insert
  to authenticated
  with check (
    public.is_admin()
    or exists (
      select 1 from public.product_chats c
      where c.id = chat_id and c.customer_user_id = auth.uid()
    )
  );

-- Grants mínimos --------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert on table public.product_chats to authenticated;
grant select, insert on table public.product_chat_messages to authenticated;

-- Tiempo real: mensajes nuevos al instante, igual que el Chat Global.
do $$
begin
  alter publication supabase_realtime add table public.product_chats;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.product_chat_messages;
exception
  when duplicate_object then null;
end $$;

-- --- Estado de lectura (para components/Campanita.tsx) -------------------
--
-- mark_chat_read(chat_id): al abrir una conversación, el cliente o el admin
-- (según quien llame) marca SU lado como leído hasta ahora mismo.
--
-- get_unread_chat_count(): cuántas conversaciones tienen un mensaje sin
-- leer para quien llama. Un admin ve TODAS las conversaciones con el
-- último mensaje de un cliente que no ha abierto todavía; un cliente ve
-- solo las suyas con el último mensaje de un admin que no ha abierto. Es
-- security definer para poder contar sobre product_chats directamente sin
-- depender de qué exponga cada política de RLS a cada lado.

create or replace function public.mark_chat_read(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  if public.is_admin() then
    update public.product_chats
      set admin_last_read_at = now()
      where id = p_chat_id;
  else
    update public.product_chats
      set customer_last_read_at = now()
      where id = p_chat_id and customer_user_id = auth.uid();
  end if;
end;
$$;

grant execute on function public.mark_chat_read(uuid) to authenticated;

create or replace function public.get_unread_chat_count()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    return 0;
  end if;

  if public.is_admin() then
    select count(*) into v_count
      from public.product_chats
      where last_sender_role = 'customer'
        and last_message_at > admin_last_read_at;
  else
    select count(*) into v_count
      from public.product_chats
      where customer_user_id = auth.uid()
        and last_sender_role = 'admin'
        and last_message_at > customer_last_read_at;
  end if;

  return coalesce(v_count, 0);
end;
$$;

grant execute on function public.get_unread_chat_count() to authenticated;
