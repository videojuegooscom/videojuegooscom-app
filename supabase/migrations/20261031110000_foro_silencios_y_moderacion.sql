-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: Foro, parte 2.
--   1) perfiles_publicos: el usuario y la foto de «Mi perfil» también de quien comenta noticias o escribe reseñas de la
--      tienda (antes, solo de quien había escrito en el Foro). Sigue dando SOLO id, usuario y foto, como mucho 200 a la vez.
--   2) «Silenciar usuario»: tabla foro_silencios (hasta cuándo una persona no puede escribir en el Foro ni comentar
--      noticias). Lo hace cumplir la base de datos con dos políticas RESTRICTIVAS de inserción. Solo un administrador
--      silencia o quita el silencio, y nunca a otro administrador ni a sí mismo. La persona silenciada ve su fila (para
--      saber hasta cuándo) y nadie más salvo el administrador.
--   3) Registro de moderación: tabla foro_moderacion que se rellena SOLA (disparadores) cuando un administrador elimina un
--      mensaje del Foro, elimina (oculta) un comentario de una noticia, silencia o quita un silencio. Solo la lee el
--      administrador y nadie puede escribir en ella a mano ni borrarla.
-- Tipo:     SOLO AÑADE: dos tablas nuevas con sus permisos y políticas, una función de disparador, tres disparadores, dos
--           políticas nuevas en chat_messages y noticias_comentarios y la función perfiles_publicos ampliada. No borra ni
--           cambia filas, columnas ni otras funciones.
-- La aplica el dueño en Supabase → SQL Editor (toca permisos y funciones security definer). Se puede aplicar varias veces
-- sin error. Antes de aplicarla la tienda funciona igual: sin la tabla no sale «Silenciar» y el usuario y la foto salen
-- solo en el Foro.
-- ============================================================================

-- 1) Usuario y foto de «Mi perfil» para el Foro, los comentarios de noticias y las reseñas de la tienda.
create or replace function public.perfiles_publicos(ids uuid[])
returns table (user_id uuid, usuario text, foto_url text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.user_id, p.usuario, p.foto_url
  from public.perfiles_cliente p
  where p.user_id = any (ids[1:200])
    and p.usuario is not null
    and (
      exists (select 1 from public.chat_messages m where m.user_id = p.user_id)
      or exists (select 1 from public.noticias_comentarios c where c.user_id = p.user_id and not c.oculto)
      or exists (select 1 from public.store_reviews r where r.user_id = p.user_id)
    );
$$;

comment on function public.perfiles_publicos(uuid[]) is
  'Usuario y foto de «Mi perfil» de quien ha escrito en el Foro, comentado una noticia o escrito una reseña (máximo 200 ids). Nada más.';

revoke all on function public.perfiles_publicos(uuid[]) from public;
grant execute on function public.perfiles_publicos(uuid[]) to anon, authenticated;

-- 2) Silencios del Foro.
create table if not exists public.foro_silencios (
  user_id uuid primary key references auth.users (id) on delete cascade,
  hasta timestamptz not null,
  motivo text,
  creado_por uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint foro_silencios_motivo_largo check (motivo is null or char_length(motivo) <= 200),
  -- Como mucho un mes de silencio de una vez.
  constraint foro_silencios_hasta_razonable check (hasta <= now() + interval '31 days')
);

comment on table public.foro_silencios is 'Quién no puede escribir en el Foro ni comentar noticias y hasta cuándo (lo pone un administrador). Con hasta en el pasado ya no está silenciado.';

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_foro_silencios_updated' and tgrelid = 'public.foro_silencios'::regclass
  ) then
    create trigger trg_foro_silencios_updated
      before update on public.foro_silencios
      for each row execute function public.touch_updated_at();
  end if;
end $$;

alter table public.foro_silencios enable row level security;
revoke all on public.foro_silencios from public, anon, authenticated;
grant select, insert, update on public.foro_silencios to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'foro_silencios' and policyname = 'foro_silencios_select') then
    create policy foro_silencios_select on public.foro_silencios
      for select to authenticated
      using (user_id = (select auth.uid()) or (select public.is_admin()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'foro_silencios' and policyname = 'foro_silencios_insert_admin') then
    create policy foro_silencios_insert_admin on public.foro_silencios
      for insert to authenticated
      with check (
        (select public.is_admin())
        and foro_silencios.user_id <> (select auth.uid())
        and not exists (select 1 from public.profiles pr where pr.id = foro_silencios.user_id and pr.role = 'admin')
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'foro_silencios' and policyname = 'foro_silencios_update_admin') then
    create policy foro_silencios_update_admin on public.foro_silencios
      for update to authenticated
      using ((select public.is_admin()))
      with check (
        (select public.is_admin())
        and foro_silencios.user_id <> (select auth.uid())
        and not exists (select 1 from public.profiles pr where pr.id = foro_silencios.user_id and pr.role = 'admin')
      );
  end if;

  -- Quien está silenciado no puede escribir en el Foro ni comentar noticias (políticas RESTRICTIVAS: se suman a las que
  -- ya hay, no las sustituyen).
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_messages' and policyname = 'chat_messages_insert_no_silenciado') then
    create policy chat_messages_insert_no_silenciado on public.chat_messages
      as restrictive
      for insert to authenticated
      with check (not exists (select 1 from public.foro_silencios s where s.user_id = (select auth.uid()) and s.hasta > now()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'noticias_comentarios' and policyname = 'noticias_comentarios_insert_no_silenciado') then
    create policy noticias_comentarios_insert_no_silenciado on public.noticias_comentarios
      as restrictive
      for insert to authenticated
      with check (not exists (select 1 from public.foro_silencios s where s.user_id = (select auth.uid()) and s.hasta > now()));
  end if;
end $$;

-- 3) Registro de moderación (solo lo escriben los disparadores de abajo; solo lo lee el administrador).
create table if not exists public.foro_moderacion (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  accion text not null,
  admin_id uuid references auth.users (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  detalle text,
  constraint foro_moderacion_accion check (accion in ('mensaje_eliminado', 'comentario_eliminado', 'silenciado', 'silencio_quitado')),
  constraint foro_moderacion_detalle_largo check (detalle is null or char_length(detalle) <= 300)
);

comment on table public.foro_moderacion is 'Registro de moderación del Foro: qué eliminó o silenció un administrador, a quién y cuándo. Lo rellenan disparadores; solo lo lee el administrador.';

create index if not exists foro_moderacion_fecha_idx on public.foro_moderacion (created_at desc);

alter table public.foro_moderacion enable row level security;
revoke all on public.foro_moderacion from public, anon, authenticated;
grant select on public.foro_moderacion to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'foro_moderacion' and policyname = 'foro_moderacion_select_admin') then
    create policy foro_moderacion_select_admin on public.foro_moderacion
      for select to authenticated
      using ((select public.is_admin()));
  end if;
end $$;

create or replace function public.foro_moderacion_apuntar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quien uuid := auth.uid();
begin
  if tg_table_name = 'chat_messages' then
    -- Solo lo que borra una persona con sesión (el administrador, por su política): no lo que desaparece al eliminarse
    -- una cuenta.
    if v_quien is not null then
      insert into public.foro_moderacion (accion, admin_id, user_id, detalle)
      values ('mensaje_eliminado', v_quien, old.user_id, left(coalesce(old.body, ''), 200));
    end if;
    return old;
  elsif tg_table_name = 'noticias_comentarios' then
    if new.oculto and not old.oculto then
      insert into public.foro_moderacion (accion, admin_id, user_id, detalle)
      values ('comentario_eliminado', v_quien, new.user_id, left(coalesce(new.texto, ''), 200));
    end if;
    return new;
  elsif tg_table_name = 'foro_silencios' then
    insert into public.foro_moderacion (accion, admin_id, user_id, detalle)
    values (
      case when new.hasta > now() then 'silenciado' else 'silencio_quitado' end,
      v_quien,
      new.user_id,
      case
        when new.hasta > now()
          then left('Hasta el ' || to_char(new.hasta at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI') || coalesce(' · ' || new.motivo, ''), 300)
        else null
      end
    );
    return new;
  end if;
  return null;
end;
$$;

revoke all on function public.foro_moderacion_apuntar() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_chat_messages_moderacion' and tgrelid = 'public.chat_messages'::regclass) then
    create trigger trg_chat_messages_moderacion
      after delete on public.chat_messages
      for each row execute function public.foro_moderacion_apuntar();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_noticias_comentarios_moderacion' and tgrelid = 'public.noticias_comentarios'::regclass) then
    create trigger trg_noticias_comentarios_moderacion
      after update of oculto on public.noticias_comentarios
      for each row execute function public.foro_moderacion_apuntar();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_foro_silencios_moderacion' and tgrelid = 'public.foro_silencios'::regclass) then
    create trigger trg_foro_silencios_moderacion
      after insert or update of hasta on public.foro_silencios
      for each row execute function public.foro_moderacion_apuntar();
  end if;
end $$;
