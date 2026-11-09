-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: topes AUTOMÁTICOS a la analítica pública (analytics_events).
-- Reescrita el 2026-11-05, antes de aplicarse en ningún sitio, porque el dueño quiere que el tope «se haga
-- automáticamente» si hay que subirlo («yo no tengo por qué decirte nada»): la versión anterior tenía topes fijos
-- (120 por minuto y 20.000 al día) que una campaña en redes podía alcanzar.
-- Problema: la política analytics_events_insert_anyone deja insertar a cualquiera (anon) sin límite de tamaño ni de
--           cantidad. Un script podía meter millones de filas, o filas de varios megabytes, y llenar la base de datos
--           (y con ella dejar sin servicio a toda la tienda). Comprobado en producción el 2026-11-05 (solo lectura):
--           1.914 filas, unas 45 al día, el minuto con más movimiento con 36 y textos de como máximo 112 caracteres.
-- Qué hace:
--   1) Restricciones de longitud (CHECK «not valid»: solo para las filas NUEVAS; las antiguas no se revisan):
--      session_id ≤ 100, event_name ≤ 60, step_label ≤ 300, path ≤ 300 y metadata ≤ 4.000 caracteres.
--   2) analitica_ritmo: una fila por día (hora de Madrid) con los eventos guardados y los cortados. La rellena sola el
--      disparador (y al aplicarla, con lo que ya había). Solo el administrador la lee (Administración → Analítica);
--      nadie la escribe desde la app.
--   3) analitica_topes(): los topes de hoy, que SE AJUSTAN SOLOS con las visitas reales:
--        por día     = el mayor de 20.000 y 3 × el día con más eventos de los últimos 30 (sin contar hoy), hasta
--                      200.000 como mucho (así un ataque sostenido no puede hacerlo crecer sin fin);
--        por minuto  = el mayor de 300 y el tope diario × 20 / 1.440 (20 veces la media por minuto);
--        por sesión  = 120 por minuto (una persona de verdad no llega; un programa sí).
--      Si la tienda crece, los topes crecen con ella sin tocar nada. La misma regla la usa Administración → Analítica
--      para enseñarlos (app/admin/analytics.tsx).
--   4) Disparador antes de insertar: si la fila se pasa de algún tope NO se guarda, sin error (la analítica nunca rompe
--      la tienda), y se suma a «cortados» del día; si no, se suma a «eventos». En un lote, entran las que caben.
-- Permisos: analytics_events_tope y analitica_topes no las puede ejecutar nadie desde la app (las usa el disparador,
--           que es SECURITY DEFINER para contar aunque el visitante no pueda leer la tabla). analitica_ritmo: solo
--           lectura del administrador (RLS). Lleva security definer y permisos: la revisa y aplica el dueño.
-- Tipo:     aditiva: restricciones, una tabla, dos funciones y un disparador nuevos. No borra ni modifica filas.
-- Idempotente: cada restricción, la tabla, la política y el disparador se crean solo si no existen; repetirla no
--           cambia nada.
-- Vuelta atrás: supabase/rollbacks/20261018150000_analitica_topes_revertir.sql (desactiva el disparador).
-- Pruebas:  pruebas/analitica-sql.mjs (SQL real en una base aislada) y pruebas/migraciones-cadena.mjs.
-- Conectado con: public.analytics_events (la escribe lib/analytics.ts desde toda la tienda) y public.analitica_ritmo
--           (la lee app/admin/analytics.tsx, Administración → Analítica).
-- ============================================================================

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('analytics_events_session_id_largo', 'length(session_id) <= 100'),
      ('analytics_events_event_name_largo', 'length(event_name) <= 60'),
      ('analytics_events_step_label_largo', 'length(step_label) <= 300'),
      ('analytics_events_path_largo', 'path is null or length(path) <= 300'),
      ('analytics_events_metadata_largo', 'length(metadata::text) <= 4000')
    ) as v(nombre, condicion)
  loop
    if not exists (select 1 from pg_constraint where conname = r.nombre and conrelid = 'public.analytics_events'::regclass) then
      execute format('alter table public.analytics_events add constraint %I check (%s) not valid', r.nombre, r.condicion);
    end if;
  end loop;
end;
$$;

-- Eventos guardados y cortados por día (hora de Madrid).
create table if not exists public.analitica_ritmo (
  dia date primary key,
  eventos integer not null default 0 check (eventos >= 0),
  cortados integer not null default 0 check (cortados >= 0),
  actualizado timestamptz not null default now()
);

comment on table public.analitica_ritmo is 'Analítica propia: eventos guardados y cortados por día (hora de Madrid). La rellena el disparador analytics_events_tope; los topes automáticos salen de aquí (analitica_topes).';

alter table public.analitica_ritmo enable row level security;
revoke all on table public.analitica_ritmo from public, anon, authenticated;
grant select on table public.analitica_ritmo to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'analitica_ritmo' and policyname = 'analitica_ritmo_admin') then
    create policy analitica_ritmo_admin on public.analitica_ritmo for select to authenticated using ((select public.is_admin()));
  end if;
end;
$$;

-- Lo que ya había: cada día con sus eventos (solo la primera vez; si el día ya está, no se toca).
insert into public.analitica_ritmo (dia, eventos)
select (created_at at time zone 'Europe/Madrid')::date, count(*)::integer
  from public.analytics_events
 group by 1
on conflict (dia) do nothing;

-- Los topes de hoy (ver arriba). SECURITY INVOKER: la llama el disparador con sus permisos.
create or replace function public.analitica_topes(out por_dia integer, out por_minuto integer, out por_sesion integer)
language sql
stable
set search_path = public, pg_temp
as $$
  select d, greatest(300, ceil(d * 20 / 1440.0)::integer), 120
    from (
      select least(200000, greatest(20000, 3 * coalesce(max(eventos), 0)))::integer as d
        from public.analitica_ritmo
       where dia >= (now() at time zone 'Europe/Madrid')::date - 30
         and dia < (now() at time zone 'Europe/Madrid')::date
    ) t;
$$;

revoke all on function public.analitica_topes() from public, anon, authenticated;

create or replace function public.analytics_events_tope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dia date := (now() at time zone 'Europe/Madrid')::date;
  v_topes record;
  v_hoy integer;
  v_cortar boolean := false;
begin
  select * into v_topes from public.analitica_topes();

  -- Una misma sesión (un programa repitiendo envíos) no pasa de su tope por minuto.
  if (select count(*) from public.analytics_events where session_id = new.session_id and created_at > now() - interval '1 minute') >= v_topes.por_sesion then
    v_cortar := true;
  -- Toda la tienda, por minuto.
  elsif (select count(*) from public.analytics_events where created_at > now() - interval '1 minute') >= v_topes.por_minuto then
    v_cortar := true;
  else
    -- Toda la tienda, por día.
    select eventos into v_hoy from public.analitica_ritmo where dia = v_dia;
    if coalesce(v_hoy, 0) >= v_topes.por_dia then
      v_cortar := true;
    end if;
  end if;

  insert into public.analitica_ritmo as r (dia, eventos, cortados)
  values (v_dia, case when v_cortar then 0 else 1 end, case when v_cortar then 1 else 0 end)
  on conflict (dia) do update
    set eventos = r.eventos + excluded.eventos,
        cortados = r.cortados + excluded.cortados,
        actualizado = now();

  -- Cortada: no se guarda y no da error (la tienda sigue igual; solo se pierde ese dato).
  if v_cortar then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function public.analytics_events_tope() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'analytics_events_tope' and tgrelid = 'public.analytics_events'::regclass) then
    create trigger analytics_events_tope
      before insert on public.analytics_events
      for each row execute function public.analytics_events_tope();
  end if;
end;
$$;

-- Si la vuelta atrás lo dejó desactivado, «aplicar, deshacer, aplicar» debe terminar activo.
alter table public.analytics_events enable trigger analytics_events_tope;
