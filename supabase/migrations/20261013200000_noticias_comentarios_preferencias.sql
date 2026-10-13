-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: comentarios de noticias y preferencias de avisos/marketing
-- Qué hace:
--   1. noticias_comentarios: cada noticia de Foro → Noticias Gaming puede tener
--      comentarios de clientes con sesión. Todo el mundo los lee; cada uno escribe los
--      suyos; el admin puede ocultarlos (oculto = true). Sin DELETE.
--   2. preferencias_usuario: si el cliente quiere avisos de noticias nuevas en las
--      notificaciones de Blue, y si acepta comunicaciones comerciales (marketing), con la
--      fecha en que lo aceptó o lo retiró (prueba del consentimiento).
-- Tipo:     aditiva (solo CREATE).
-- ============================================================================

create table if not exists public.noticias_comentarios (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  noticia_id uuid not null references public.noticias_gaming(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  autor text not null default 'Cliente' check (char_length(autor) between 1 and 60),
  texto text not null check (char_length(btrim(texto)) between 1 and 1000),
  oculto boolean not null default false
);

create index if not exists noticias_comentarios_noticia_idx on public.noticias_comentarios (noticia_id, created_at);

alter table public.noticias_comentarios enable row level security;

create policy noticias_comentarios_lectura on public.noticias_comentarios
  for select to anon, authenticated using (not oculto or (select public.is_admin()));
create policy noticias_comentarios_insert on public.noticias_comentarios
  for insert to authenticated with check (user_id = (select auth.uid()) and not oculto);
create policy noticias_comentarios_admin_update on public.noticias_comentarios
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create table if not exists public.preferencias_usuario (
  user_id uuid primary key default auth.uid(),
  updated_at timestamptz not null default now(),
  avisos_noticias boolean not null default false,
  noticias_vistas_hasta timestamptz,
  marketing boolean not null default false,
  marketing_actualizado timestamptz
);

alter table public.preferencias_usuario enable row level security;

create policy preferencias_usuario_select on public.preferencias_usuario
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy preferencias_usuario_insert on public.preferencias_usuario
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy preferencias_usuario_update on public.preferencias_usuario
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
