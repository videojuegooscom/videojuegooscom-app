-- == VIDEOJUEGOSZARAGOZA ====================================================
-- Archivo:        infraestructura/base-datos/diagnostico_d8.sql (copia adaptada de VeoAura, commit eb5f74fc;
--                 la sección 17 muestra los tres vigilantes en lugar de las tablas de VeoAura)
--                 (se instala en /opt/vz-sql/diagnostico_d8.sql)
-- Función:        D8 · Diagnóstico del esquema real de VideojuegosZaragoza. SOLO LECTURA: un único SELECT
--                 sobre metadatos del sistema. No lee filas de negocio, auth.users, secretos,
--                 claves ni variables de entorno. No muestra cuerpos ni configuración de
--                 funciones. De pg_cron solo indica si está instalado (no lee cron.job).
-- Para qué sirve: «vz-sql diagnostico-d8» (primera consulta real tras instalar) y la copia
--                 de ESTRUCTURA que el broker guarda antes de aplicar cambios (no copia datos).
-- Conectado con:  broker.py.
-- Utilizado por:  vz-sql (órdenes diagnostico-d8 y aplicar).
-- Dependencias:   PostgreSQL 15+ (Supabase).
-- Estado:         ACTIVO
-- ============================================================================
with
pub as (select oid from pg_namespace where nspname = 'public'),
rel as (
  select c.oid, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.relacl
  from pg_class c join pub on c.relnamespace = pub.oid
  where c.relkind in ('r','p','v','m','f')
),
s01 as (select 1 as o, 'version' as s,
  json_build_object('version', version(), 'num', current_setting('server_version_num'))::text as d),
s02 as (select 2, 'schemas', json_agg(nspname order by nspname)::text
  from pg_namespace where nspname not like 'pg\_%' and nspname <> 'information_schema'),
s03 as (select 3, 'relaciones [nombre, tipo r=tabla v=vista m=vista_mat p=particionada f=foránea]',
  json_agg(json_build_array(relname, relkind) order by relname)::text from rel),
s04 as (select 4, 'columnas {tabla: [[columna, tipo, not_null, default]]}', json_object_agg(t, cols)::text from (
  select r.relname as t,
         json_agg(json_build_array(a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull,
                                   pg_get_expr(ad.adbin, ad.adrelid)) order by a.attnum) as cols
  from rel r
  join pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
  group by r.relname) x),
s05 as (select 5, 'restricciones [tabla, nombre, tipo p=PK u=unique f=FK c=check, definición]',
  json_agg(json_build_array(co.conrelid::regclass::text, co.conname, co.contype, pg_get_constraintdef(co.oid))
           order by co.conrelid::regclass::text, co.conname)::text
  from pg_constraint co join pub on co.connamespace = pub.oid where co.conrelid <> 0),
s06 as (select 6, 'indices [tabla, definición]',
  json_agg(json_build_array(tablename, indexdef) order by tablename, indexname)::text
  from pg_indexes where schemaname = 'public'),
s07 as (select 7, 'rls [tabla, rls_activo, rls_forzado]',
  json_agg(json_build_array(relname, relrowsecurity, relforcerowsecurity) order by relname)::text
  from rel where relkind in ('r','p')),
s08 as (select 8, 'politicas [tabla, nombre, permissive, roles, comando, using, with_check]',
  json_agg(json_build_array(tablename, policyname, permissive, roles, cmd, qual, with_check)
           order by tablename, policyname)::text
  from pg_policies where schemaname = 'public'),
s09 as (select 9, 'permisos [tabla, rol, privilegios]',
  json_agg(json_build_array(table_name, grantee, privs) order by table_name, grantee)::text from (
  -- Desde pg_class.relacl (metadatos): information_schema solo mostraría permisos de roles
  -- relacionados con el agente, que no tiene SELECT sobre las tablas de negocio.
  select r.relname as table_name, g.rolname as grantee,
         string_agg(a.privilege_type, ',' order by a.privilege_type) as privs
  from rel r cross join lateral aclexplode(r.relacl) a
  join pg_roles g on g.oid = a.grantee
  where g.rolname in ('anon','authenticated','service_role')
  group by r.relname, g.rolname) g),
s10 as (select 10, 'enums [schema.tipo, valores]',
  json_agg(json_build_array(n.nspname || '.' || t.typname,
           (select json_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid))
           order by n.nspname, t.typname)::text
  from pg_type t join pg_namespace n on n.oid = t.typnamespace
  where t.typtype = 'e' and n.nspname not in ('pg_catalog','information_schema')),
s11 as (select 11, 'funciones public [nombre, tipo f=función p=procedimiento a=agregado w=ventana, argumentos, retorno, security, volatilidad i=immutable s=stable v=volatile]',
  json_agg(json_build_array(p.proname, p.prokind, pg_get_function_identity_arguments(p.oid),
           pg_get_function_result(p.oid), case when p.prosecdef then 'DEFINER' else 'INVOKER' end,
           p.provolatile)
           order by p.proname, pg_get_function_identity_arguments(p.oid))::text
  from pg_proc p join pub on p.pronamespace = pub.oid
  where not exists (select 1 from pg_depend dp where dp.objid = p.oid and dp.deptype = 'e')),
s12 as (select 12, 'triggers public/auth/storage [tabla, nombre, activo, definición]',
  json_agg(json_build_array(n.nspname || '.' || c.relname, tg.tgname, tg.tgenabled, pg_get_triggerdef(tg.oid))
           order by n.nspname, c.relname, tg.tgname)::text
  from pg_trigger tg join pg_class c on c.oid = tg.tgrelid join pg_namespace n on n.oid = c.relnamespace
  where not tg.tgisinternal and n.nspname in ('public','auth','storage')),
s13 as (select 13, 'extensiones [nombre, versión, schema]',
  json_agg(json_build_array(e.extname, e.extversion, n.nspname) order by e.extname)::text
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace),
s14 as (select 14, 'cron (solo metadatos: no se lee cron.job)', json_build_object(
  'pg_cron_instalado', exists (select 1 from pg_extension where extname = 'pg_cron'),
  'pg_cron_version', (select extversion from pg_extension where extname = 'pg_cron'),
  -- Solo pg_catalog: to_regclass('cron.job') exigiría USAGE sobre el esquema cron, que
  -- vz_agente no tiene ni debe tener.
  'tabla_cron_job_existe', exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                                   where n.nspname = 'cron' and c.relname = 'job'))::text),
s15 as (select 15, 'realtime', json_build_object(
  'publicaciones', (select json_agg(json_build_array(pubname, puballtables, pubinsert, pubupdate, pubdelete)
                                    order by pubname) from pg_publication),
  'tablas', (select json_agg(json_build_array(pubname, schemaname || '.' || tablename)
                             order by pubname, schemaname, tablename) from pg_publication_tables))::text),
s16 as (select 16, 'objetos vz_ops_ / ops_ existentes', coalesce(json_agg(x order by x)::text, '[]') from (
  select 'rel:' || n.nspname || '.' || c.relname as x
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relname like 'vz\_ops\_%'
  union all
  select 'tipo:' || n.nspname || '.' || t.typname
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname like 'vz\_ops\_%' or t.typname like 'ops\_%'
  union all
  select 'funcion:' || n.nspname || '.' || p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.proname like 'vz\_ops\_%' or p.proname like 'ops\_%'
  union all
  select 'politica:' || tablename || '.' || policyname from pg_policies where policyname like 'vz\_ops\_%') v),
s17 as (select 17, 'vigilantes de la segunda barrera [nombre, evento, estado O=activo D=desactivado]',
  coalesce(json_agg(json_build_array(evtname, evtevent, evtenabled) order by evtname)::text, '[]')
  from pg_event_trigger where evtname like 'vz\_%')
select o as orden, s as seccion, d as datos
from (
  select * from s01 union all select * from s02 union all select * from s03 union all select * from s04
  union all select * from s05 union all select * from s06 union all select * from s07 union all select * from s08
  union all select * from s09 union all select * from s10 union all select * from s11 union all select * from s12
  union all select * from s13 union all select * from s14 union all select * from s15 union all select * from s16
  union all select * from s17
) r
order by o;
