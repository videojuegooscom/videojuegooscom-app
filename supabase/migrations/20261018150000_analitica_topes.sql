-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Migración: topes a la analítica pública (analytics_events).
-- Problema: la política analytics_events_insert_anyone deja insertar a cualquiera (anon) sin límite de
--           tamaño ni de cantidad. Comprobado en producción el 2026-10-18: 1.306 filas en 38 días (unas 35 al
--           día) y textos de como máximo 88 caracteres. Un script podía meter millones de filas, o filas de
--           varios megabytes, y llenar la base de datos (y con ella dejar sin servicio a toda la tienda).
-- Qué hace:
--   1) Restricciones de longitud (CHECK, «not valid»: se aplican a las filas NUEVAS y no revisan las
--      existentes, así que no pueden fallar por datos antiguos): session_id ≤ 100, event_name ≤ 60,
--      step_label ≤ 300, path ≤ 300 y metadata ≤ 4.000 caracteres. Los máximos reales son 36, 15, 77, 46 y 88.
--   2) Un disparador (trigger) antes de insertar que corta la inserción si ya hay 120 filas en el último
--      minuto o 20.000 en las últimas 24 horas (3.400 veces el ritmo actual). Es SECURITY DEFINER para poder
--      contar aunque el visitante no pueda leer la tabla (RLS solo deja leer al admin); lo ejecuta solo el
--      disparador, nadie puede llamarlo directamente. Es un tope «blando»: con inserciones totalmente
--      simultáneas puede pasarse en tantas filas como conexiones haya, pero no crece sin límite.
--      Si se corta, el navegador lo ignora (la analítica nunca rompe la tienda); lo único que se pierde es
--      analítica durante un pico anormal.
-- Tipo:     aditiva: restricciones nuevas, función y disparador nuevos. No borra ni modifica filas. Añade una
--           función SECURITY DEFINER: la revisa y aplica el dueño.
-- Idempotente: cada restricción y el disparador se crean solo si no existen.
-- Vuelta atrás: supabase/rollbacks/20261018150000_analitica_topes_revertir.sql
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

create or replace function public.analytics_events_tope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from public.analytics_events where created_at > now() - interval '1 minute') >= 120 then
    raise exception 'analitica: demasiados eventos por minuto' using errcode = 'P0001';
  end if;
  if (select count(*) from public.analytics_events where created_at > now() - interval '24 hours') >= 20000 then
    raise exception 'analitica: demasiados eventos por día' using errcode = 'P0001';
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
