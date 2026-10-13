-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: historial de Blue IA por cuenta
-- Qué hace: guarda las conversaciones de cada cliente con Blue IA en su cuenta, para que
--           las encuentre al volver (app/(tabs)/blue-ia.tsx). Sin sesión no se guarda nada.
-- Acceso:   cada usuario solo ve, crea y actualiza las suyas (auth.uid()). Sin DELETE: se
--           archivan (archivada = true).
-- Tipo:     aditiva (solo CREATE).
-- ============================================================================

create table if not exists public.blue_ia_conversaciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  titulo text not null default 'Conversación' check (char_length(titulo) <= 120),
  contexto text check (contexto is null or char_length(contexto) <= 300),
  archivada boolean not null default false
);

create table if not exists public.blue_ia_mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.blue_ia_conversaciones(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  rol text not null check (rol in ('user', 'assistant')),
  texto text not null check (char_length(texto) <= 4000)
);

create index if not exists blue_ia_conversaciones_user_idx on public.blue_ia_conversaciones (user_id, updated_at desc);
create index if not exists blue_ia_mensajes_conv_idx on public.blue_ia_mensajes (conversacion_id, created_at);

alter table public.blue_ia_conversaciones enable row level security;
alter table public.blue_ia_mensajes enable row level security;

create policy blue_ia_conv_select on public.blue_ia_conversaciones
  for select to authenticated using (user_id = (select auth.uid()));
create policy blue_ia_conv_insert on public.blue_ia_conversaciones
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy blue_ia_conv_update on public.blue_ia_conversaciones
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy blue_ia_msg_select on public.blue_ia_mensajes
  for select to authenticated using (user_id = (select auth.uid()));
create policy blue_ia_msg_insert on public.blue_ia_mensajes
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.blue_ia_conversaciones c
       where c.id = conversacion_id and c.user_id = (select auth.uid())
    )
  );

-- Al añadir un mensaje, la conversación sube arriba de la lista.
create or replace function public.blue_ia_tocar_conversacion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.blue_ia_conversaciones set updated_at = now() where id = new.conversacion_id;
  return new;
end;
$$;

create trigger trg_blue_ia_tocar_conversacion
  after insert on public.blue_ia_mensajes
  for each row execute function public.blue_ia_tocar_conversacion();
