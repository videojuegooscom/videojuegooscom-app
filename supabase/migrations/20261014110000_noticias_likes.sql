-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: «Me gusta» de noticias, 1 por persona y solo con cuenta
-- Qué hace: cada cliente con sesión puede dar como mucho un «me gusta» a cada noticia
--           (clave única noticia + usuario) y quitarlo. El total se guarda en
--           noticias_gaming.me_gusta (lo mantiene un disparador), así la lista lo muestra sin
--           contar filas. Antes el «me gusta» solo vivía en el móvil y no contaba para nadie.
-- Acceso:   ver «me gusta», cualquiera; dar o quitar el suyo, solo con sesión.
-- Tipo:     aditiva. No borra datos.
-- ============================================================================

alter table public.noticias_gaming
  add column if not exists me_gusta integer not null default 0;

create table if not exists public.noticias_likes (
  noticia_id uuid not null references public.noticias_gaming(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (noticia_id, user_id)
);

alter table public.noticias_likes enable row level security;

create policy noticias_likes_lectura on public.noticias_likes
  for select to anon, authenticated using (true);
create policy noticias_likes_insert on public.noticias_likes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy noticias_likes_quitar_propio on public.noticias_likes
  for delete to authenticated using (user_id = (select auth.uid()));

create or replace function public.noticias_likes_contar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    update public.noticias_gaming set me_gusta = me_gusta + 1 where id = new.noticia_id;
    return new;
  end if;
  update public.noticias_gaming set me_gusta = greatest(0, me_gusta - 1) where id = old.noticia_id;
  return old;
end;
$$;

revoke execute on function public.noticias_likes_contar() from public, anon, authenticated;

create trigger trg_noticias_likes_contar
  after insert or delete on public.noticias_likes
  for each row execute function public.noticias_likes_contar();
