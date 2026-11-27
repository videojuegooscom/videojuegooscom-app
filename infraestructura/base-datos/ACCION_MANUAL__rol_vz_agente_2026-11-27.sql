-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Archivo:        infraestructura/base-datos/ACCION_MANUAL__rol_vz_agente_2026-11-27.sql
-- Función:        Crea en el Supabase REAL de VideojuegosZaragoza el rol limitado «vz_agente» que usa el
--                 broker vz-sql: sin superusuario ni CREATEROLE/CREATEDB, con tiempos máximos fijados en el
--                 rol, sin pertenencia a otros roles, nada en auth, storage ni extensions; y la SEGUNDA
--                 BARRERA de tres event triggers («los tres vigilantes») que le impiden borrar objetos,
--                 columnas o restricciones y borrar o vaciar las tablas que cree.
--                 Copia adaptada de documentacion/supabase_rol_agente_2026-10-09.sql de VeoAura.
-- Diferencias con VeoAura (aprobadas por el dueño el 2026-11-27):
--   · Lee, inserta y actualiza las tablas de la tienda (public), NUNCA DELETE ni TRUNCATE: nuestras
--     migraciones cambian datos de tablas existentes (p. ej. textos de policy_pages) y, con el MCP de
--     Supabase apagado, toda lectura pasa por vz-sql.
--   · BYPASSRLS: sin él, la lectura y los UPDATE de tablas con RLS verían 0 filas en silencio. No da más
--     permisos sobre tablas: solo hace que no se apliquen las políticas de filas.
--   · Puede leer y añadir filas en supabase_migrations.schema_migrations (registra cada «aplicar», como
--     hacía apply_migration). No puede borrarlas ni cambiarlas.
-- Para qué sirve: Activar vz-sql. Lo ejecuta EL DUEÑO, como «postgres», en el SQL Editor.
--                 vz-sql y el guardián lo rechazan (crea roles, usa DO y SQL dinámico): es a propósito.
-- Conectado con:  infraestructura/base-datos/ (broker, INSTALAR.md, test_integracion_pg.py).
-- Dependencias:   PostgreSQL 15+ (Supabase).
-- Estado:         PENDIENTE (repetible; no borra nada)
-- ============================================================================
-- VZ: ACCION_MANUAL
-- ANTES DE EJECUTAR:
--  1. Genera una contraseña larga (p. ej. «openssl rand -base64 48») y sustituye __CONTRASENA_DEL_AGENTE__
--     SOLO en la copia que pegues en el SQL Editor. Nunca la guardes en el repositorio. Después borra esa
--     consulta del historial o de los snippets del SQL Editor.
--  2. Ejecuta el archivo completo. Es repetible: si el rol ya existe no cambia su contraseña.
--  3. Mira el resultado de las comprobaciones del final (apartado 6).

-- 1) Rol limitado ---------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'vz_agente') then
    create role vz_agente login password '__CONTRASENA_DEL_AGENTE__'
      nosuperuser nocreatedb nocreaterole noreplication bypassrls noinherit connection limit 3;
  end if;
end $$;
alter role vz_agente bypassrls;

alter role vz_agente set statement_timeout = '60s';
alter role vz_agente set lock_timeout = '5s';
alter role vz_agente set idle_in_transaction_session_timeout = '60s';

-- 2) Permisos -----------------------------------------------------------------------
-- · Crear objetos nuevos en public (es su propietario).
-- · Tablas de la tienda: SELECT, INSERT y UPDATE. Nunca DELETE ni TRUNCATE (se retiran por si acaso).
-- · Nada en auth, storage, vault, cron, net ni extensions.
grant usage, create on schema public to vz_agente;
grant select, insert, update on all tables in schema public to vz_agente;
revoke delete, truncate, references, trigger on all tables in schema public from vz_agente;
grant usage, select on all sequences in schema public to vz_agente;
-- Las tablas que cree el dueño más adelante (como postgres) reciben lo mismo.
alter default privileges for role postgres in schema public
  grant select, insert, update on tables to vz_agente;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to vz_agente;

-- Registro de migraciones: leer y añadir, nada más.
grant usage on schema supabase_migrations to vz_agente;
grant select, insert on supabase_migrations.schema_migrations to vz_agente;

-- Lo que cree el agente: el backend (service_role) puede usarlo; el público no.
grant vz_agente to postgres;  -- necesario para ALTER DEFAULT PRIVILEGES FOR ROLE
alter default privileges for role vz_agente in schema public
  grant select, insert, update on tables to service_role;
alter default privileges for role vz_agente in schema public
  grant usage, select on sequences to service_role;
alter default privileges for role vz_agente in schema public
  grant execute on functions to service_role;
alter default privileges for role vz_agente in schema public
  revoke execute on functions from public;

-- 3) Esquema de pruebas (prueba de humo de la activación) ------------------------
create schema if not exists vz_pruebas;
grant usage, create on schema vz_pruebas to vz_agente;

-- 4) SEGUNDA BARRERA: los tres vigilantes de vz_agente -----------------------------
--    · DROP de cualquier objeto (ddl_command_start)
--    · ALTER … DROP COLUMN / DROP CONSTRAINT / DROP DEFAULT (sql_drop)
--    · DELETE y TRUNCATE en las tablas que cree el agente (triggers añadidos al crearlas)
create schema if not exists vz_guardia;
revoke all on schema vz_guardia from public;
grant usage on schema vz_guardia to vz_agente;

create or replace function vz_guardia.bloquear_drop() returns event_trigger
language plpgsql set search_path = '' as $$
begin
  if (session_user = 'vz_agente' or current_user = 'vz_agente') and tg_tag like 'DROP %' then
    raise exception 'VZ (segunda barrera): % bloqueado para vz_agente', tg_tag;
  end if;
end $$;

create or replace function vz_guardia.bloquear_borrado_de_objetos() returns event_trigger
language plpgsql set search_path = '' as $$
begin
  if session_user = 'vz_agente' or current_user = 'vz_agente' then
    raise exception 'VZ (segunda barrera): % elimina objetos y está bloqueado para vz_agente', tg_tag;
  end if;
end $$;

create or replace function vz_guardia.rechazar_borrado() returns trigger
language plpgsql set search_path = '' as $$
begin
  if session_user = 'vz_agente' or current_user = 'vz_agente' then
    raise exception 'VZ (segunda barrera): % bloqueado para vz_agente en %', tg_op, tg_table_name;
  end if;
  return null;
end $$;
revoke all on function vz_guardia.rechazar_borrado() from public;
grant execute on function vz_guardia.rechazar_borrado() to vz_agente;

create or replace function vz_guardia.proteger_tablas_nuevas() returns event_trigger
language plpgsql set search_path = '' as $$
declare r record;
begin
  if session_user <> 'vz_agente' then
    return;
  end if;
  for r in select * from pg_event_trigger_ddl_commands()
           where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') and object_type = 'table'
  loop
    execute format('create trigger vz_sin_delete before delete on %s for each statement '
                   'execute function vz_guardia.rechazar_borrado()', r.object_identity);
    execute format('create trigger vz_sin_truncate before truncate on %s for each statement '
                   'execute function vz_guardia.rechazar_borrado()', r.object_identity);
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'vz_bloquear_drop') then
    create event trigger vz_bloquear_drop on ddl_command_start
      execute function vz_guardia.bloquear_drop();
  end if;
  if not exists (select 1 from pg_event_trigger where evtname = 'vz_bloquear_borrado_de_objetos') then
    create event trigger vz_bloquear_borrado_de_objetos on sql_drop
      execute function vz_guardia.bloquear_borrado_de_objetos();
  end if;
  if not exists (select 1 from pg_event_trigger where evtname = 'vz_proteger_tablas_nuevas') then
    create event trigger vz_proteger_tablas_nuevas on ddl_command_end
      execute function vz_guardia.proteger_tablas_nuevas();
  end if;
  raise notice 'VZ: segunda barrera PostgreSQL ACTIVA';
exception when insufficient_privilege or feature_not_supported or object_not_in_prerequisite_state then
  raise notice 'VZ: segunda barrera PostgreSQL no disponible (%). Se sigue con broker, rol limitado, '
               'guardián y auditoría.', sqlerrm;
end $$;

-- 5) (nada más: no se borra nada) -------------------------------------------------

-- 6) Comprobación (solo lectura) -------------------------------------------------
-- Debe decir: rolsuper, rolcreaterole, rolcreatedb, rolinherit = false; rolbypassrls = true; rolconnlimit = 3.
select rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolinherit, rolconnlimit, rolconfig
from pg_roles where rolname = 'vz_agente';
-- Debe devolver 0: roles de los que es miembro.
select count(*) as pertenencias from pg_auth_members where member = (select oid from pg_roles where rolname = 'vz_agente');
-- Debe devolver 0: tablas de la tienda que el agente podría borrar o vaciar.
select count(*) as tablas_negocio_borrables
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
  and c.relowner <> (select oid from pg_roles where rolname = 'vz_agente')
  and (has_table_privilege('vz_agente', c.oid, 'DELETE') or has_table_privilege('vz_agente', c.oid, 'TRUNCATE'));
-- Debe devolver false en las cuatro: sin acceso a auth, storage, extensions ni vault.
select has_schema_privilege('vz_agente', 'auth', 'USAGE') as auth,
       has_schema_privilege('vz_agente', 'storage', 'USAGE') as storage,
       has_schema_privilege('vz_agente', 'extensions', 'USAGE') as extensions,
       coalesce(has_schema_privilege('vz_agente', to_regnamespace('vault'), 'USAGE'), false) as vault;
-- Deben salir los tres vigilantes con evtenabled = 'O'.
select evtname, evtevent, evtenabled from pg_event_trigger where evtname like 'vz\_%' order by evtname;
