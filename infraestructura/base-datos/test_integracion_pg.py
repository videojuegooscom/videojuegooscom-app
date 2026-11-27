#!/usr/bin/env python3
# == VIDEOJUEGOSZARAGOZA ====================================================
# Archivo:        infraestructura/base-datos/test_integracion_pg.py (copia adaptada de VeoAura, commit eb5f74fc)
# Función:        Prueba de integración contra un PostgreSQL LOCAL de usar y tirar (initdb en una
#                 carpeta temporal, socket Unix, sin red): aplica ACCION_MANUAL__rol_vz_agente_2026-11-27.sql
#                 y demuestra que los tres vigilantes impiden a vz_agente DROP, ALTER … DROP, DELETE y
#                 TRUNCATE aunque el broker se saltara; que en las tablas de la tienda puede leer, insertar y
#                 actualizar pero nunca borrar ni vaciar; que el broker real deshace un UPDATE de más de 100
#                 filas, solo aplica migraciones iguales a origin/main y las registra una sola vez.
# Para qué sirve: Comprobar las barreras de la base de datos sin tocar el Supabase real.
# Conectado con:  broker.py, clasificador.py, ACCION_MANUAL__rol_vz_agente_2026-11-27.sql.
# Utilizado por:  instalar-sql.sh (si hay PostgreSQL local); a mano:
#                 python3 infraestructura/base-datos/test_integracion_pg.py [--lib carpeta]
# Dependencias:   python3, pglast y psycopg (requisitos.txt), binarios de PostgreSQL (initdb, pg_ctl)
#                 en /usr/lib/postgresql/*/bin o en VZ_PG_BIN. Si no hay, la prueba se OMITE.
# ============================================================================
import glob
import os
import shutil
import subprocess
import sys
import tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
if "--lib" in sys.argv:
    os.environ["VZ_SQL_LIB"] = sys.argv[sys.argv.index("--lib") + 1]
sys.dont_write_bytecode = True
sys.path.insert(0, AQUI)


def _argumento(nombre):
    return sys.argv[sys.argv.index(nombre) + 1] if nombre in sys.argv else ""


# --pg-bin carpeta con initdb y pg_ctl; --pg-lib carpeta de sus librerías (p. ej. los binarios de embedded-postgres,
# ver docs/pruebas-sql-aisladas.md). Así se prueba en un PostgreSQL de usar y tirar sin instalar nada en el sistema.
RAIZ_REPO = os.path.dirname(os.path.dirname(AQUI))
EMBEBIDO = os.path.join(RAIZ_REPO, "node_modules", "@embedded-postgres", "linux-x64", "native")


def binarios():
    candidatos = [_argumento("--pg-bin"), os.environ.get("VZ_PG_BIN", "")] + \
        sorted(glob.glob("/usr/lib/postgresql/*/bin"), reverse=True) + [os.path.join(EMBEBIDO, "bin")]
    for c in candidatos:
        if c and os.path.exists(os.path.join(c, "initdb")) and os.path.exists(os.path.join(c, "pg_ctl")):
            return c
    return None


BIN = binarios()
librerias = _argumento("--pg-lib")
if not librerias and BIN == os.path.join(EMBEBIDO, "bin"):
    # embedded-postgres sin su script de instalación: enlaces de .expo/vzsql-pglib y sus librerías.
    librerias = os.path.join(RAIZ_REPO, ".expo", "vzsql-pglib") + ":" + os.path.join(EMBEBIDO, "lib")
if librerias:
    os.environ["LD_LIBRARY_PATH"] = ":".join(os.path.abspath(p) for p in librerias.split(":") if p)
if not BIN:
    print("OMITIDA: no hay PostgreSQL local (initdb/pg_ctl). Instálalo para ejecutar esta prueba (ver INSTALAR.md).")
    sys.exit(0)

import broker as b  # noqa: E402
import psycopg  # noqa: E402

fallos = []
comprobaciones = 0


def comprobar(condicion, descripcion):
    global comprobaciones
    comprobaciones += 1
    if not condicion:
        fallos.append(descripcion)
        print("FALLO  " + descripcion)


TMP = tempfile.mkdtemp(prefix="vz-sql-pg-")
DATOS, SOCK = os.path.join(TMP, "datos"), os.path.join(TMP, "sock")
os.makedirs(SOCK)
CONTRASENA = "prueba-" + os.urandom(12).hex()
subprocess.run([os.path.join(BIN, "initdb"), "-D", DATOS, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--locale=C"],
               check=True, capture_output=True)
subprocess.run([os.path.join(BIN, "pg_ctl"), "-D", DATOS, "-l", os.path.join(TMP, "pg.log"), "-w", "start",
                "-o", f"-k {SOCK} -c listen_addresses=''"], check=True, capture_output=True)


def conectar(usuario="postgres"):
    return psycopg.connect(host=SOCK, dbname="postgres", user=usuario, autocommit=False)


def rechaza(conexion, sql):
    try:
        conexion.execute(sql)
        return False
    except psycopg.Error:
        return True


try:
    with conectar() as con:
        con.autocommit = True
        for rol in ("anon", "authenticated", "service_role"):
            con.execute(f"create role {rol} nologin")
        for esquema in ("auth", "storage", "extensions", "supabase_migrations"):
            con.execute(f"create schema {esquema}")
        con.execute("create table supabase_migrations.schema_migrations (version text primary key, statements text[], "
                    "name text, created_by text, idempotency_key text, rollback text[])")
        con.execute("create table auth.users (id int)")
        con.execute("create table public.profiles (id int primary key, plan text)")
        con.execute("insert into public.profiles values (7, 'basico')")
        con.execute("alter table public.profiles enable row level security")
        con.execute("create table public.policy_pages (slug text primary key, cuerpo text)")
        con.execute("insert into public.policy_pages select 'p' || g, 'viejo' from generate_series(1, 150) g")
        con.execute("alter table public.policy_pages enable row level security")
        # Tabla de contenido con identidad (necesita la secuencia) y tabla fuera de las listas (conversaciones).
        con.execute("create table public.aprendizajes (id bigint generated always as identity primary key, "
                    "titulo text unique)")
        con.execute("alter table public.aprendizajes enable row level security")
        con.execute("create table public.chat_messages (id int primary key, texto text)")
        con.execute("insert into public.chat_messages values (1, 'privado')")
        con.execute("alter table public.chat_messages enable row level security")
        # Política de la app que NO debe valer para vz_agente.
        con.execute("create policy de_la_app on public.chat_messages for select to authenticated using (true)")
        # RPC existente de la aplicación que escribe en una tabla de negocio (SECURITY DEFINER).
        con.execute("create function public.registrar_venta(p int) returns int language sql security definer "
                    "as $$ update public.profiles set plan = 'pro' where id = p returning id $$")
        sql_rol = open(os.path.join(AQUI, "ACCION_MANUAL__rol_vz_agente_2026-11-27.sql"),
                       encoding="utf-8").read().replace("__CONTRASENA_DEL_AGENTE__", CONTRASENA)
        con.execute(sql_rol)
        barreras = con.execute("select count(*) from pg_event_trigger where evtname like 'vz\\_%'").fetchone()[0]
        comprobar(barreras == 3, f"deberían existir los 3 vigilantes de la segunda barrera (hay {barreras})")
        atributos = con.execute("select rolsuper, rolcreaterole, rolcreatedb, rolinherit, rolbypassrls, rolconnlimit "
                                "from pg_roles where rolname = 'vz_agente'").fetchone()
        comprobar(atributos == (False, False, False, False, False, 3), f"atributos del rol (sin BYPASSRLS): {atributos}")
        politicas = con.execute("select tablename || '.' || policyname from pg_policies where 'vz_agente' = any(roles) "
                                "order by 1").fetchall()
        comprobar([p[0] for p in politicas] == [
            "aprendizajes.vz_agente_actualizar", "aprendizajes.vz_agente_insertar", "aprendizajes.vz_agente_leer",
            "policy_pages.vz_agente_actualizar", "policy_pages.vz_agente_insertar", "policy_pages.vz_agente_leer",
            "profiles.vz_agente_leer"], f"políticas RLS solo para vz_agente y solo en sus tablas: {politicas}")
        # Repetible: ejecutarlo otra vez no cambia nada ni falla.
        con.execute(sql_rol)
        n = con.execute("select count(*) from pg_policies where 'vz_agente' = any(roles)").fetchone()[0]
        comprobar(n == 7, f"repetir el SQL del rol no debe duplicar políticas (hay {n})")

    # --- Segunda barrera y permisos: aunque se saltara el broker, el rol no puede destruir nada.
    with conectar("vz_agente") as ag:
        ag.autocommit = True
        ag.execute("create table vz_pruebas.t (id int, nota text)")
        ag.execute("insert into vz_pruebas.t select g, 'x' from generate_series(1, 150) g")
        ag.execute("alter table vz_pruebas.t add constraint t_id check (id > 0)")
        ag.execute("create function vz_pruebas.f() returns int language sql as $$ select 1 $$")
        disparadores = ag.execute("select string_agg(tgname, ',' order by tgname) from pg_trigger "
                                  "where tgrelid = 'vz_pruebas.t'::regclass").fetchone()[0]
        comprobar(disparadores == "vz_sin_delete,vz_sin_truncate",
                  f"el tercer vigilante debe poner sus dos triggers en la tabla nueva (hay {disparadores})")
        # Los tres vigilantes, caso a caso (mismos casos que VeoAura y alguno más).
        for sql in ("drop table vz_pruebas.t", "alter table vz_pruebas.t drop column nota",
                    "alter table vz_pruebas.t drop constraint t_id", "drop function vz_pruebas.f()",
                    "drop schema vz_pruebas cascade", "drop trigger vz_sin_delete on vz_pruebas.t",
                    "delete from vz_pruebas.t where id = 1", "truncate vz_pruebas.t",
                    "delete from public.profiles where id = 7", "truncate public.profiles",
                    "drop table public.profiles", "alter table public.profiles drop column plan",
                    "alter table public.profiles disable row level security",
                    "select * from auth.users", "delete from supabase_migrations.schema_migrations",
                    "update supabase_migrations.schema_migrations set name = 'x'", "set role postgres"):
            comprobar(rechaza(ag, sql), f"la base de datos debería rechazar a vz_agente: {sql}")
        n = ag.execute("select count(*) from vz_pruebas.t").fetchone()[0]
        comprobar(n == 150, f"no debe haberse borrado ninguna fila (hay {n})")
        n = ag.execute("select count(*) from pg_trigger where tgrelid = 'vz_pruebas.t'::regclass").fetchone()[0]
        comprobar(n == 2, f"los triggers del vigilante siguen en su sitio (hay {n})")
        # RLS sigue activa para vz_agente: lee por SU política, no por saltársela.
        comprobar(ag.execute("select count(*) from public.policy_pages").fetchone()[0] == 150,
                  "vz_agente lee las tablas de contenido por su política vz_agente_leer")
        comprobar(ag.execute("select count(*) from public.profiles").fetchone()[0] == 1,
                  "vz_agente lee las tablas de lectura por su política vz_agente_leer")
        comprobar(rechaza(ag, "select * from public.chat_messages"),
                  "vz_agente no lee tablas fuera de sus listas (conversaciones privadas)")
        # Contenido: inserta (con su secuencia de identidad) y actualiza; nunca borra.
        comprobar(not rechaza(ag, "insert into public.aprendizajes (titulo) values ('leccion')"), "INSERT en contenido")
        comprobar(not rechaza(ag, "update public.policy_pages set cuerpo = 'x' where slug = 'p150'"), "UPDATE en contenido")
        # Lectura: ni inserta ni actualiza (datos de clientes).
        for sql in ("insert into public.profiles values (1, 'pro')", "update public.profiles set plan = 'x' where id = 7",
                    "insert into public.chat_messages values (2, 'x')", "delete from public.policy_pages where slug = 'p1'",
                    "truncate public.policy_pages"):
            comprobar(rechaza(ag, sql), f"la base de datos debería rechazar a vz_agente: {sql}")
        n = ag.execute("select count(*) from public.policy_pages").fetchone()[0]
        comprobar(n == 150, f"public.policy_pages debe conservar sus filas (hay {n})")
    with conectar() as con:
        plan = con.execute("select plan from public.profiles where id = 7").fetchone()[0]
        comprobar(plan == "basico", f"profiles no debe haber cambiado (plan={plan})")
        con.execute("update public.policy_pages set cuerpo = 'viejo' where slug = 'p150'")
        con.commit()

    # --- Broker real contra la base real.
    repo = os.path.join(TMP, "repo")
    os.makedirs(os.path.join(repo, "supabase", "migrations"))
    subprocess.run(["git", "init", "-q", "-b", "main", repo], check=True)
    git = ["git", "-c", "user.name=Pruebas", "-c", "user.email=pruebas@ejemplo.invalid", "-C", repo]
    secuencia = [20261127000000]

    def versionar(nombre, sql, publicar=True):
        secuencia[0] += 1
        ruta = os.path.join(repo, "supabase", "migrations", f"{secuencia[0]}_{nombre}.sql")
        open(ruta, "w", encoding="utf-8").write(sql)
        subprocess.run(git + ["add", ruta], check=True)
        subprocess.run(git + ["commit", "-q", "-m", nombre], check=True)
        if publicar:  # como si ya estuviera fusionada y con «git fetch origin main»
            subprocess.run(git + ["update-ref", "refs/remotes/origin/main", "HEAD"], check=True)
        return ruta

    def registradas():
        with conectar() as con:
            return con.execute("select count(*) from supabase_migrations.schema_migrations").fetchone()[0]

    sanear = b.Saneador([CONTRASENA])
    servicio = b.Servicio(lambda: conectar("vz_agente"), [repo], b.Auditoria(os.path.join(TMP, "a.jsonl"), sanear),
                          sanear, os.path.join(TMP, "estructura"), ruta_d8=os.path.join(AQUI, "diagnostico_d8.sql"))
    # La RPC existente no se ejecuta por vz-sql, ni en consultar ni en aplicar.
    r = servicio.procesar({"orden": "consultar", "sql": "select public.registrar_venta(7)"})
    comprobar(r["estado"] == "requiere_accion_manual", f"consultar una RPC existente: {r}")
    r = servicio.procesar({"orden": "aplicar", "archivo": versionar("rpc", "select registrar_venta(7);\n")})
    comprobar(r["estado"] == "requiere_accion_manual", f"aplicar una RPC existente: {r}")
    with conectar() as con:
        plan = con.execute("select plan from public.profiles where id = 7").fetchone()[0]
    comprobar(plan == "basico", f"la RPC no debe haber cambiado datos (plan={plan})")
    r = servicio.procesar({"orden": "consultar", "sql": "select count(*) from public.policy_pages"})
    comprobar(r["estado"] == "ok" and r["resultados"][0]["filas"] == [[150]], f"consultar la tienda: {r}")
    r = servicio.procesar({"orden": "diagnostico-d8"})
    comprobar(r["estado"] == "ok", f"el D8 debe funcionar: {r}")
    r = servicio.procesar({"orden": "estado"})
    comprobar(r.get("tablas_negocio_borrables") == 0, f"estado: el rol no debe poder borrar la tienda: {r}")
    comprobar(r.get("salta_rls") is False and "aviso" not in r, f"estado: sin BYPASSRLS y sin avisos: {r}")
    comprobar(str(r.get("segunda_barrera", "")).startswith("disponible (3"), f"estado debe ver los 3 vigilantes: {r}")

    # Aditivo y registrado.
    r = servicio.procesar({"orden": "aplicar", "archivo": versionar("crear_ops", (
        "create table vz_ops_prueba (id int primary key, nota text);\n"
        "insert into vz_ops_prueba select g, 'x' from generate_series(1, 150) g;\n"))})
    comprobar(r["estado"] == "ok", f"aplicar aditivo contra PostgreSQL real: {r}")
    comprobar(registradas() == 1, "la migración aplicada debe quedar en schema_migrations")
    ruta_ops = os.path.join(repo, "supabase", "migrations", f"{secuencia[0]}_crear_ops.sql")
    r = servicio.procesar({"orden": "aplicar", "archivo": ruta_ops})
    comprobar(r["estado"] == "rechazada" and "ya está registrada" in r.get("motivo", ""), f"repetir: {r}")
    comprobar(registradas() == 1, "repetir no debe registrar otra vez")

    # UPDATE de 150 filas: se deshace, sin registrar (D2).
    r = servicio.procesar({"orden": "aplicar", "archivo": versionar(
        "update_grande", "update vz_ops_prueba set nota = 'y' where id > 0;\n")})
    comprobar(r["estado"] == "requiere_accion_manual", f"UPDATE de 150 filas debe deshacerse: {r}")
    with conectar() as con:
        cambiadas = con.execute("select count(*) from vz_ops_prueba where nota = 'y'").fetchone()[0]
    comprobar(cambiadas == 0, f"el UPDATE deshecho no debe haber cambiado filas (hay {cambiadas})")
    comprobar(registradas() == 1, "un UPDATE deshecho no se registra")

    # Tienda: UPDATE pequeño sí (como la migración de policy_pages); grande se deshace.
    r = servicio.procesar({"orden": "aplicar", "archivo": versionar(
        "texto_politica", "update public.policy_pages set cuerpo = 'nuevo' where slug = 'p1';\n")})
    comprobar(r["estado"] == "ok", f"UPDATE de 1 fila de la tienda: {r}")
    comprobar(registradas() == 2, "la migración de la tienda queda registrada")
    r = servicio.procesar({"orden": "aplicar", "archivo": versionar(
        "texto_todas", "update public.policy_pages set cuerpo = 'todo' where slug like 'p%';\n")})
    comprobar(r["estado"] == "requiere_accion_manual", f"UPDATE de 150 filas de la tienda: {r}")
    with conectar() as con:
        n = con.execute("select count(*) from public.policy_pages where cuerpo = 'todo'").fetchone()[0]
    comprobar(n == 0, f"el UPDATE grande de la tienda no debe quedar (hay {n})")
    # Límite dentro de la transacción: una sentencia que se pasa deshace también las anteriores y el registro.
    r = servicio.procesar({"orden": "aplicar", "archivo": versionar("mixta", (
        "create table vz_ops_antes (id int);\n"
        "update public.policy_pages set cuerpo = 'mixta' where slug = 'p3';\n"
        "insert into public.aprendizajes (titulo) select 'masiva ' || g from generate_series(1, 101) g;\n"))})
    comprobar(r["estado"] == "requiere_accion_manual" and "101" in r.get("motivo", ""), f"INSERT de 101 filas: {r}")
    with conectar() as con:
        quedan = con.execute("select (select count(*) from public.aprendizajes where titulo like 'masiva%'), "
                             "(select count(*) from public.policy_pages where cuerpo = 'mixta'), "
                             "to_regclass('public.vz_ops_antes') is not null").fetchone()
    comprobar(quedan == (0, 0, False), f"todo el archivo debe deshacerse (insertadas, cambiadas, tabla): {quedan}")
    comprobar(registradas() == 2, "un archivo deshecho no se registra")
    # Lección (como las del Centro de Aprendizajes): INSERT … WHERE NOT EXISTS de una fila.
    leccion = ("insert into public.aprendizajes (titulo) select v.t from (values ('nueva')) as v(t) "
               "where not exists (select 1 from public.aprendizajes a where a.titulo = v.t);\n")
    r = servicio.procesar({"orden": "aplicar", "archivo": versionar("aprendizajes_nueva", leccion)})
    comprobar(r["estado"] == "ok" and registradas() == 3, f"lección nueva: {r}")
    # Tablas solo de lectura: vz-sql no las escribe (lo dice el clasificador antes de tocar nada).
    r = servicio.procesar({"orden": "aplicar", "archivo": versionar(
        "cliente", "update public.profiles set plan = 'pro' where id = 7;\n")})
    comprobar(r["estado"] == "requiere_accion_manual", f"UPDATE en una tabla solo de lectura: {r}")
    # Consultas habituales.
    r = servicio.procesar({"orden": "consultar", "sql": "select version, name from supabase_migrations.schema_migrations "
                                                       "order by version"})
    comprobar(r["estado"] == "ok" and len(r["resultados"][0]["filas"]) == 3, f"leer el registro de migraciones: {r}")
    r = servicio.procesar({"orden": "consultar", "sql": "select count(*) from public.chat_messages"})
    comprobar(r["estado"] == "error", f"leer una tabla fuera de las listas debe fallar: {r}")
    r = servicio.procesar({"orden": "aplicar", "archivo": versionar(
        "borrar", "delete from public.policy_pages where slug = 'p2';\n")})
    comprobar(r["estado"] == "requiere_accion_manual", f"DELETE en la tienda: {r}")

    # Solo lo publicado e igual a origin/main.
    r = servicio.procesar({"orden": "aplicar", "archivo": versionar(
        "sin_publicar", "create table vz_ops_b (id int);\n", publicar=False)})
    comprobar(r["estado"] == "rechazada" and "origin/main" in r.get("motivo", ""), f"sin publicar: {r}")
    subprocess.run(git + ["update-ref", "refs/remotes/origin/main", "HEAD"], check=True)
    ruta_b = os.path.join(repo, "supabase", "migrations", f"{secuencia[0]}_sin_publicar.sql")
    open(ruta_b, "w", encoding="utf-8").write("create table vz_ops_c (id int);\n")
    subprocess.run(git + ["commit", "-q", "-am", "cambio local"], check=True)
    r = servicio.procesar({"orden": "aplicar", "archivo": ruta_b})
    comprobar(r["estado"] == "rechazada" and "origin/main" in r.get("motivo", ""), f"distinta de origin/main: {r}")
    otra = os.path.join(repo, "supabase", "suelta.sql")
    open(otra, "w", encoding="utf-8").write("create table vz_ops_d (id int);\n")
    subprocess.run(git + ["add", otra], check=True)
    subprocess.run(git + ["commit", "-q", "-m", "suelta"], check=True)
    r = servicio.procesar({"orden": "aplicar", "archivo": otra})
    comprobar(r["estado"] == "rechazada" and "supabase/migrations" in r.get("motivo", ""), f"fuera de migrations: {r}")
    comprobar(registradas() == 3, "nada de lo rechazado se registra")
finally:
    subprocess.run([os.path.join(BIN, "pg_ctl"), "-D", DATOS, "-m", "fast", "stop"], capture_output=True)
    shutil.rmtree(TMP, ignore_errors=True)

print(f"{comprobaciones - len(fallos)}/{comprobaciones} comprobaciones correctas (PostgreSQL local en {BIN})")
sys.exit(1 if fallos else 0)
