-- ============================================================================
-- 04-chat-y-resenas.sql — Chat privado por producto y reseñas de la tienda
-- ============================================================================
-- Qué contiene este archivo (tablas y funciones, una línea cada una):
-- - product_chats                     → una fila por conversación privada
--                                        (producto, cliente).
-- - public.get_or_create_product_chat(...) → crea o reutiliza la
--                                        conversación de un producto/cliente.
-- - product_chat_messages             → mensajes de cada conversación.
-- - public.product_chat_messages_before_insert() → rellena quién escribe y
--                                        comprueba permisos antes de guardar
--                                        un mensaje.
-- - public.product_chat_messages_after_insert()  → actualiza el resumen
--                                        (last_message_at/preview) de la
--                                        conversación tras cada mensaje.
-- - public.mark_chat_read(chat_id)    → marca como leído el lado de quien
--                                        llama en una conversación.
-- - public.get_unread_chat_count()    → cuenta conversaciones con mensajes
--                                        sin leer para quien llama.
-- - store_reviews                     → reseñas reales de la tienda (1 a 5
--                                        estrellas + comentario).
-- - public.store_reviews_before_insert() → rellena quién escribe la reseña
--                                        a partir de la sesión real.
--
-- IMPORTANTE: todo esto YA ESTÁ aplicado y funcionando en producción (en el
-- proyecto de Supabase de Videojuegos Zaragoza). NO hay que volver a
-- ejecutar nada de este archivo — está aquí solo como referencia y
-- documentación de lo que ya existe en la base de datos real.
--
-- De qué archivos sueltos viene (nombres originales, por si buscas algo por
-- el nombre de antes):
--   product_chats.sql, store_reviews.sql
-- ============================================================================

-- ============================================================
-- De: product_chats.sql — chat privado por producto (product_chats, product_chat_messages)
-- ============================================================
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
  product_id uuid not null references public.products(id) on delete cascade,
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

-- ============================================================
-- De: store_reviews.sql — reseñas de la tienda (store_reviews)
-- ============================================================
-- sql/store_reviews.sql
-- ---------------------------------------------------------------------------
-- Qué hace: crea la tabla "store_reviews" que usa components/Resenas.tsx
-- (sección "Reseñas" de la pantalla de Inicio) para las reseñas reales de la
-- tienda: valoración de 1 a 5 estrellas + comentario opcional. Antes esa
-- sección era contenido de ejemplo escrito a mano; ahora son reseñas de
-- verdad que deja cualquier cliente con la sesión iniciada.
--
-- Cómo funciona:
-- - El cliente (components/ReviewModal.tsx) solo manda la valoración
--   ("rating") y el comentario ("comment") al hacer el INSERT. Quién la
--   escribe (user_id, username, display_name) lo rellena SIEMPRE el trigger
--   store_reviews_before_insert(), leyendo la sesión real (auth.uid()) y los
--   datos de la cuenta (auth.users.raw_user_meta_data: full_name/username,
--   los mismos que rellena app/(tabs)/perfil.tsx al registrarse, y que ya
--   usa sql/chat_messages.sql para el Chat Global). Así nadie puede publicar
--   una reseña haciéndose pasar por otra persona.
-- - Se permite más de una reseña por persona (igual que el chat permite
--   varios mensajes): no hay ninguna restricción de "una reseña por
--   usuario". Si en el futuro se quiere limitar a una sola reseña por
--   cliente (y que "Publicar" la actualice en vez de crear otra), se puede
--   añadir después un índice único sobre user_id sin tocar el resto.
-- - Row Level Security: SELECT abierto a todo el mundo (anon + authenticated)
--   — las reseñas se pueden leer sin cuenta, igual que el resto del
--   catálogo. INSERT solo a "authenticated" (hay que iniciar sesión para
--   publicar, como en el chat). DELETE solo para administradores
--   (public.is_admin()), por si hace falta moderar una reseña inapropiada.
-- - Se añade la tabla a la publicación "supabase_realtime" para que, si en
--   el futuro se quiere, las reseñas nuevas puedan aparecer al instante sin
--   recargar (hoy Resenas.tsx simplemente vuelve a pedir la lista tras
--   publicar, no hace falta más).
--
-- Cómo aplicarlo: copia y ejecuta este archivo completo en el SQL Editor de
-- tu proyecto de Supabase (Dashboard → SQL Editor → New query → Run). Es
-- seguro volver a ejecutarlo (usa IF NOT EXISTS / OR REPLACE / DROP...IF
-- EXISTS en todo lo que puede chocar). Necesita que sql/products.sql ya se
-- haya ejecutado antes (usa public.profiles/public.is_admin() indirectamente
-- a través del mismo patrón que sql/chat_messages.sql).
--
-- Conectado con:
-- - components/Resenas.tsx → lee la valoración media, el número de reseñas
--   y las últimas reseñas para mostrarlas en Inicio.
-- - components/ReviewModal.tsx → el "pop" donde el cliente elige estrellas,
--   escribe un comentario y publica (INSERT en esta tabla).
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

create table if not exists public.store_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null default '',
  display_name text not null default '',
  rating smallint not null,
  comment text not null default ''
);

alter table public.store_reviews drop constraint if exists store_reviews_rating_check;
alter table public.store_reviews add constraint store_reviews_rating_check
  check (rating between 1 and 5);

alter table public.store_reviews drop constraint if exists store_reviews_comment_check;
alter table public.store_reviews add constraint store_reviews_comment_check
  check (char_length(comment) <= 600);

create index if not exists store_reviews_created_at_idx
  on public.store_reviews (created_at desc);

create index if not exists store_reviews_user_id_idx
  on public.store_reviews (user_id);

-- Rellena SIEMPRE quién deja la reseña a partir de la sesión real (nunca de
-- lo que mande el cliente), exactamente igual que sql/chat_messages.sql.
create or replace function public.store_reviews_before_insert()
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
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para dejar una reseña.';
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

  new.comment := trim(coalesce(new.comment, ''));

  if new.rating is null or new.rating < 1 or new.rating > 5 then
    raise exception 'La valoración debe ser de 1 a 5 estrellas.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_store_reviews_before_insert on public.store_reviews;
create trigger trg_store_reviews_before_insert
  before insert on public.store_reviews
  for each row
  execute function public.store_reviews_before_insert();

-- Row Level Security ---------------------------------------------------------
alter table public.store_reviews enable row level security;

drop policy if exists store_reviews_select_public on public.store_reviews;
drop policy if exists store_reviews_insert_authenticated on public.store_reviews;
drop policy if exists store_reviews_delete_admin on public.store_reviews;

-- Cualquiera puede leer las reseñas, incluso sin sesión.
create policy store_reviews_select_public
  on public.store_reviews
  for select
  to anon, authenticated
  using (true);

-- Solo con sesión iniciada se puede publicar, y solo como uno mismo (el
-- trigger de arriba ya se encarga de que user_id sea siempre auth.uid()).
create policy store_reviews_insert_authenticated
  on public.store_reviews
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Solo un administrador puede borrar una reseña (moderación).
create policy store_reviews_delete_admin
  on public.store_reviews
  for delete
  to authenticated
  using (public.is_admin());

-- Grants mínimos --------------------------------------------------------
-- RLS ya manda (esto solo evita "permission denied" raros a nivel de tabla).
grant usage on schema public to anon, authenticated;
grant select on table public.store_reviews to anon, authenticated;
grant insert on table public.store_reviews to authenticated;
grant delete on table public.store_reviews to authenticated;

-- Tiempo real (opcional, por si en el futuro se quiere usar): añade la tabla
-- a la publicación que usa Supabase Realtime.
do $$
begin
  alter publication supabase_realtime add table public.store_reviews;
exception
  when duplicate_object then null;
end $$;
