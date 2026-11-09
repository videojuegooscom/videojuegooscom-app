-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: «Mejoras en la tienda» (dueño, 2026-11-01).
--   Una cajita para que los clientes nos digan qué mejorarían. Se abre desde Blue (Asistente), el pie de página y
--   Perfil → Mi cuenta, y solo envía con la sesión iniciada. El dueño las lee en Administración → Usuarios
--   («Ideas de mejora») y en la ficha de cada cliente, y las marca como leídas.
--
--   1) Tabla mejoras_tienda: quién (su cuenta), el texto (de 3 a 500 letras), desde dónde (blue, pie o perfil), si ya
--      está leída y cuándo. Va unida a la cuenta: si se borra la cuenta, se van con ella.
--   2) Permisos: los visitantes sin sesión no tocan nada. Cada cliente con sesión crea las suyas (sin marcarlas como
--      leídas) y solo ve las suyas; el administrador las ve todas y las marca como leídas. Nadie las borra desde la app.
--   3) Límite: como mucho 5 ideas al día por persona (para que nadie llene la caja).
--   4) Política de privacidad: una frase sobre las ideas (se añade una vez al final de «Para qué usamos tus datos»).
-- Tipo:     SOLO AÑADE (una tabla, una función, un disparador, tres políticas y una frase en la privacidad). No borra
--           filas ni columnas. Se puede aplicar varias veces.
-- La aplica el dueño en Supabase → SQL Editor (políticas con auth.uid() y permisos).
-- Qué hace: crea la caja de ideas de mejora de los clientes, con su límite diario y una frase en la privacidad.
-- Conectado con: public.mejoras_tienda y policy_pages; components/ReviewModal.tsx (envío), app/admin/users.tsx,
--           app/admin/cliente/[userId].tsx y app/admin/index.tsx (lectura).
-- ============================================================================

-- 1) La tabla.
create table if not exists public.mejoras_tienda (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  texto text not null check (char_length(btrim(texto)) between 3 and 500),
  origen text not null default 'blue' check (origen in ('blue', 'pie', 'perfil')),
  leida boolean not null default false,
  leida_en timestamptz
);

comment on table public.mejoras_tienda is 'Ideas de mejora que dejan los clientes con sesión (Blue, pie de página o Mi cuenta). Cada cliente ve las suyas; el administrador las ve todas y las marca como leídas.';

create index if not exists mejoras_tienda_fecha_idx on public.mejoras_tienda (created_at desc);
create index if not exists mejoras_tienda_usuario_idx on public.mejoras_tienda (user_id, created_at desc);

-- 2) Permisos.
alter table public.mejoras_tienda enable row level security;
revoke all on public.mejoras_tienda from public, anon, authenticated;
grant select, insert, update on public.mejoras_tienda to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mejoras_tienda' and policyname = 'mejoras_tienda_insert_propia') then
    create policy mejoras_tienda_insert_propia on public.mejoras_tienda
      for insert to authenticated
      with check (user_id = (select auth.uid()) and leida = false and leida_en is null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mejoras_tienda' and policyname = 'mejoras_tienda_select') then
    create policy mejoras_tienda_select on public.mejoras_tienda
      for select to authenticated
      using (user_id = (select auth.uid()) or (select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mejoras_tienda' and policyname = 'mejoras_tienda_update_admin') then
    create policy mejoras_tienda_update_admin on public.mejoras_tienda
      for update to authenticated
      using ((select public.is_admin()))
      with check ((select public.is_admin()));
  end if;
end $$;

-- 3) Como mucho 5 ideas al día por persona. Cuenta las suyas (las ve por su política), así que no necesita más permisos.
create or replace function public.mejoras_tienda_limite()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from public.mejoras_tienda
       where user_id = new.user_id and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Ya nos has enviado 5 ideas hoy. ¡Gracias! Mañana puedes mandarnos más.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'mejoras_tienda_limite_diario' and tgrelid = 'public.mejoras_tienda'::regclass) then
    create trigger mejoras_tienda_limite_diario
      before insert on public.mejoras_tienda
      for each row execute function public.mejoras_tienda_limite();
  end if;
end $$;

-- 4) Política de privacidad: qué pasa con las ideas (se añade una vez al final de «Para qué usamos tus datos»).
update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Para qué usamos tus datos'
                   then jsonb_set(s.sec, '{body}', to_jsonb((s.sec ->> 'body') || ' Si nos mandas una idea en «Mejoras en la tienda», la guardamos unida a tu cuenta para leerla y, si hace falta, contestarte; solo la ve la tienda y se borra con tu cuenta.'))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'privacidad'
  and exists (select 1 from jsonb_array_elements(p.sections) as s (sec) where s.sec ->> 'heading' = 'Para qué usamos tus datos')
  and not exists (select 1 from jsonb_array_elements(p.sections) as s (sec) where s.sec ->> 'body' like '%Mejoras en la tienda%');
