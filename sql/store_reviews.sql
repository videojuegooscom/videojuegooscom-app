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
