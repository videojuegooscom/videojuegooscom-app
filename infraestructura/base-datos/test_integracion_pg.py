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


def binarios():
    candidatos = [os.environ.get("VZ_PG_BIN", "")] + sorted(glob.glob("/usr/lib/postgresql/*/bin"), reverse=True)
    for c in candidatos:
        if c and os.path.exists(os.path.join(c, "initdb")) and os.path.exists(os.path.join(c, "pg_ctl")):
            return c
    return None


BIN = binarios()
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
subprocess.run([os.path.join(BIN, "initdb"), "-D", DATOS, "-U", "postgres", "--auth=trust", "-E", "UTF8"],
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
        con.execute("create table public.policy_pages (slug text primary key, cuerpo text)")
        con.execute("insert into public.policy_pages select 'p' || g, 'viejo' from generate_series(1, 150) g")
        con.execute("alter table public.policy_pages enable row level security")
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
        comprobar(atributos == (False, False, False, False, True, 3), f"atributos del rol: {atributos}")

    # --- Segunda barrera y permisos: aunque se saltara el broker, el rol no puede destruir nada.
    with conectar("vz_agente") as ag:
        ag.autocommit = True
        ag.execute("create table vz_pruebas.t (id int, nota text)")
        ag.execute("insert into vz_pruebas.t select g, 'x' from generate_series(1, 150) g")
        for sql in ("drop table vz_pruebas.t", "alter table vz_pruebas.t drop column nota",
                    "delete from vz_pruebas.t where id = 1", "truncate vz_pruebas.t",
                    "delete from public.profiles where id = 7", "truncate public.profiles",
                    "drop table public.profiles", "alter table public.profiles drop column plan",
                    "alter table public.profiles disable row level security",
                    "select * from auth.users", "delete from supabase_migrations.schema_migrations",
                    "update supabase_migrations.schema_migrations set name = 'x'", "set role postgres"):
            comprobar(rechaza(ag, sql), f"la base de datos debería rechazar a vz_agente: {sql}")
        n = ag.execute("select count(*) from vz_pruebas.t").fetchone()[0]
        comprobar(n == 150, f"no debe haberse borrado ninguna fila (hay {n})")
        # Tablas de la tienda: lee (también con RLS), inserta y actualiza.
        comprobar(ag.execute("select count(*) from public.policy_pages").fetchone()[0] == 150,
                  "vz_agente debe leer las tablas de la tienda aunque tengan RLS")
        comprobar(not rechaza(ag, "insert into public.profiles values (1, 'basico')"), "INSERT en la tienda")
        comprobar(not rechaza(ag, "update public.profiles set plan = 'x' where id = 1"), "UPDATE en la tienda")
        n = ag.execute("select count(*) from public.profiles").fetchone()[0]
        comprobar(n == 2, f"public.profiles debe conservar sus filas (hay {n})")

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
    comprobar(registradas() == 2, "nada de lo rechazado se registra")
finally:
    subprocess.run([os.path.join(BIN, "pg_ctl"), "-D", DATOS, "-m", "fast", "stop"], capture_output=True)
    shutil.rmtree(TMP, ignore_errors=True)

print(f"{comprobaciones - len(fallos)}/{comprobaciones} comprobaciones correctas (PostgreSQL local en {BIN})")
sys.exit(1 if fallos else 0)
