-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: dispositivos y última conexión de cada cliente (dueño, 2026-11-12: «quiero que en la ficha de cliente
--            aparezcan los inicios de sesión en diferentes dispositivos y la última vez que se conectó a la tienda»).
-- Qué hace: public.cliente_dispositivos guarda, por cliente y dispositivo, SOLO el tipo y el navegador legibles
--           («iPhone · Safari», «Windows · Chrome»; como mucho 60 letras), si usa la app instalada (pantalla de inicio),
--           la primera y la última vez que entró desde él y cuántas veces ha iniciado sesión en él. NUNCA la IP, la
--           ubicación ni el identificador completo del navegador. Una fila por (cliente, dispositivo).
--           Lo escribe la propia tienda con la sesión del cliente (lib/supabase.ts, registrarDispositivo): al abrir la
--           tienda o volver a ella (como mucho cada 15 min) y al iniciar sesión.
--           El disparador (sin permisos especiales, con los de quien llama) pone las fechas con el reloj de la base de
--           datos (nadie se inventa una), no deja cambiar de quién es la fila, su dispositivo ni la primera vez, y cada
--           inicio de sesión suma exactamente 1 (el cliente manda «inicios» distinto del guardado = un inicio más; nunca
--           elige el número). «App instalada» se queda marcada una vez vista. Como mucho 30 dispositivos por cliente.
--           Reglas (RLS): el cliente crea, cambia y lee solo SUS filas; el administrador las lee todas (is_admin());
--           nadie las borra desde el navegador (se van solas al borrar la cuenta). Visitantes sin sesión: nada.
--           Y una frase en la política de privacidad («Qué datos tratamos», al final), una sola vez.
-- Conectado con: auth.users (on delete cascade), public.is_admin(); lib/supabase.ts (registrarDispositivo,
--           nombreDispositivo), app/_layout.tsx (lo llama), app/admin/cliente/[userId].tsx («Última conexión» y
--           «Dispositivos»), app/admin/users.tsx («Última conexión» y «Activos 7 días»), app/admin/analytics.tsx
--           (recuentos), public.policy_pages (privacidad), pruebas/perfiles-sql.mjs y pruebas/perfil-datos.mjs (DV).
-- Tipo:     aditiva (una tabla nueva con sus reglas, una función de disparador normal y una frase de la privacidad). No
--           borra ni cambia datos ni permisos existentes. Repetirla no cambia nada.
-- ============================================================================

create table if not exists public.cliente_dispositivos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  dispositivo text not null check (char_length(btrim(dispositivo)) between 2 and 60),
  app_instalada boolean not null default false,
  primera_vez timestamptz not null default now(),
  ultima_vez timestamptz not null default now(),
  inicios integer not null default 1 check (inicios between 0 and 1000000),
  unique (user_id, dispositivo)
);

create index if not exists cliente_dispositivos_ultima_idx on public.cliente_dispositivos (ultima_vez desc);

alter table public.cliente_dispositivos enable row level security;

-- Fechas del reloj de la base de datos, la fila no cambia de dueño ni de dispositivo y cada inicio suma 1.
create or replace function public.cliente_dispositivos_normalizar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.cliente_dispositivos where user_id = new.user_id) >= 30 then
      raise exception 'Demasiados dispositivos guardados para esta cuenta.' using errcode = 'P0001';
    end if;
    new.primera_vez := now();
    new.ultima_vez := now();
    new.inicios := 1;
    return new;
  end if;
  new.id := old.id;
  new.user_id := old.user_id;
  new.dispositivo := old.dispositivo;
  new.primera_vez := old.primera_vez;
  new.ultima_vez := now();
  new.app_instalada := coalesce(old.app_instalada, false) or coalesce(new.app_instalada, false);
  new.inicios := case when new.inicios is distinct from old.inicios then old.inicios + 1 else old.inicios end;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'cliente_dispositivos_normalizar' and tgrelid = 'public.cliente_dispositivos'::regclass) then
    create trigger cliente_dispositivos_normalizar
      before insert or update on public.cliente_dispositivos
      for each row execute function public.cliente_dispositivos_normalizar();
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cliente_dispositivos' and policyname = 'cliente_dispositivos_select') then
    create policy cliente_dispositivos_select on public.cliente_dispositivos
      for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cliente_dispositivos' and policyname = 'cliente_dispositivos_insert_propia') then
    create policy cliente_dispositivos_insert_propia on public.cliente_dispositivos
      for insert to authenticated with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cliente_dispositivos' and policyname = 'cliente_dispositivos_update_propia') then
    create policy cliente_dispositivos_update_propia on public.cliente_dispositivos
      for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
end $$;

-- Privacidad: en «Qué datos tratamos», al final, una sola vez (si el apartado no está, no cambia nada).
update public.policy_pages p
set sections = (
      select jsonb_agg(
               case
                 when s.sec ->> 'heading' = 'Qué datos tratamos'
                   then jsonb_set(s.sec, '{body}', to_jsonb(
                     rtrim(s.sec ->> 'body') || ' Para la seguridad de tu cuenta, cuando tienes la sesión iniciada guardamos el tipo de dispositivo y el navegador con el que entras (por ejemplo, «iPhone · Safari»), si usas la app instalada, cuántas veces has iniciado sesión en él y cuándo fue la primera y la última vez (sin tu IP ni tu ubicación). Solo lo ve el equipo de la tienda.'
                   ))
                 else s.sec
               end
               order by s.ord)
      from jsonb_array_elements(p.sections) with ordinality as s (sec, ord)
    ),
    updated_at = now()
where p.slug = 'privacidad'
  and exists (
    select 1 from jsonb_array_elements(p.sections) as s (sec)
    where s.sec ->> 'heading' = 'Qué datos tratamos'
      and s.sec ->> 'body' not like '%tipo de dispositivo y el navegador con el que entras%'
  );
