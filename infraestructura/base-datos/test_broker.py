#!/usr/bin/env python3
# == VIDEOJUEGOSZARAGOZA ====================================================
# Archivo:        infraestructura/base-datos/test_broker.py (copia adaptada de VeoAura, commit eb5f74fc;
#                 añade 12c-12e: vigilantes, registro en schema_migrations, origin/main y tablas de la tienda)
# Función:        Pruebas del broker de vz-sql con una conexión simulada (sin base de datos):
#                 versionado obligatorio (D6), relectura y nuevo sha256 en cada «aplicar», rechazo
#                 de ACCION_MANUAL, bloqueo de lo destructivo sin ejecutar nada, límite de 100
#                 filas en UPDATE (D2), copia de estructura, errores y auditoría sin secretos ni
#                 valores, y el socket de extremo a extremo con el cliente real.
# Para qué sirve: Demostrar el comportamiento del broker antes de conectarlo al Supabase real.
# Conectado con:  broker.py, cliente.py, clasificador.py (misma carpeta).
# Utilizado por:  instalar-sql.sh; a mano: python3 infraestructura/hetzner/supabase/test_broker.py
#                 (opcional --lib <carpeta con pglast>).
# Dependencias:   python3, git, pglast 7.18.
# Estado:         ACTIVO
# ============================================================================
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading

AQUI = os.path.dirname(os.path.abspath(__file__))
if "--lib" in sys.argv:
    os.environ["VZ_SQL_LIB"] = sys.argv[sys.argv.index("--lib") + 1]
sys.dont_write_bytecode = True
sys.path.insert(0, AQUI)
import broker as b  # noqa: E402
import cliente  # noqa: E402

fallos = []
comprobaciones = 0


def comprobar(condicion, descripcion):
    global comprobaciones
    comprobaciones += 1
    if not condicion:
        fallos.append(descripcion)
        print("FALLO  " + descripcion)


# --------------------------------------------------------------- entorno ----
TMP = tempfile.mkdtemp(prefix="vz-sql-prueba-")
REPO = os.path.join(TMP, "repo")
FUERA = os.path.join(TMP, "fuera")
os.makedirs(REPO)
os.makedirs(FUERA)
AUD = os.path.join(TMP, "auditoria.jsonl")
EST = os.path.join(TMP, "estructura")
SECRETO = "ContrasenaSuperSecreta-9x7Q"
HOST = "aws-0-eu-west-1.pooler.supabase.com"
USUARIO = "vz_agente.proyectoabcd"
VALOR = "valor-confidencial-123"
GIT = ["git", "-c", "user.name=Pruebas", "-c", "user.email=pruebas@ejemplo.invalid", "-C", REPO]
subprocess.run(["git", "init", "-q", "-b", "main", REPO], check=True)


def escribir(rel, contenido, commit=True, base=REPO):
    ruta = os.path.join(base, rel)
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(contenido)
    if commit:
        subprocess.run(GIT + ["add", rel], check=True)
        subprocess.run(GIT + ["commit", "-q", "-m", f"prueba {rel}"], check=True)
        # Como si ya estuviera publicada y con «git fetch origin main» (regla de VideojuegosZaragoza).
        subprocess.run(GIT + ["update-ref", "refs/remotes/origin/main", "HEAD"], check=True)
    return ruta


class CatalogoSimulado:
    def existe_relacion(self, e, n):
        return n in ("vz_ops_prueba", "profiles")

    def es_del_agente(self, e, n):
        return n == "vz_ops_prueba"

    def puede(self, e, n, privilegio):  # profiles: tabla de contenido con INSERT y UPDATE
        return n == "profiles"

    def existe_funcion(self, e, n):
        return n in ("registrar_venta", "rpc_definer")

    def existe_trigger(self, e, t, n):
        return False

    # registrar_venta: RPC existente de la aplicación que escribe; rpc_definer: SECURITY DEFINER.
    def es_funcion_del_agente(self, e, n):
        return False

    def funcion_de_aplicacion(self, n):
        return n in ("registrar_venta", "rpc_definer")

    def operador_de_aplicacion(self, o):
        return False


class ErrorPG(Exception):
    def __init__(self, mensaje, sqlstate="42501"):
        super().__init__(mensaje)
        self.sqlstate = sqlstate
        self.diag = type("Diag", (), {"message_primary": mensaje})()


class OperationalError(Exception):
    pass


class Cursor:
    def __init__(self, con):
        self.con, self.description, self.rowcount, self._filas = con, None, -1, []

    def execute(self, sql, params=None):
        self.con.ejecutadas.append(sql)
        self.description, self.rowcount, self._filas = None, -1, []
        for patron, accion in self.con.reglas:
            if re.search(patron, sql, re.I | re.S):
                if isinstance(accion, Exception):
                    raise accion
                self.rowcount = accion.get("rowcount", -1)
                self._filas = accion.get("filas", [])
                if "columnas" in accion:
                    self.description = [(c,) for c in accion["columnas"]]
                break

    def fetchone(self):
        return self._filas[0] if self._filas else None

    def fetchmany(self, n):
        return self._filas[:n]

    def fetchall(self):
        return list(self._filas)


class Conexion:
    def __init__(self, reglas):
        self.reglas, self.ejecutadas = reglas, []
        self.commits = self.rollbacks = 0
        self.read_only = False
        self.autocommit = False
        self.cerrada = False

    def cursor(self):
        return Cursor(self)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def close(self):
        self.cerrada = True


REGLAS_BASE = [
    (r"current_setting\('server_version'\)", {"filas": [("17.6", "vz_agente", 0)], "columnas": ["v", "u", "b"]}),
    (r"^\s*--.*D8|with\s+pub\s+as", {"filas": [(1, "version", "{}")], "columnas": ["orden", "seccion", "datos"]}),
    (r"^\s*select 1\b", {"filas": [(1,)], "columnas": ["?column?"]}),
]


def servicio(reglas=None, conectar=None, conexiones=None):
    conexiones = conexiones if conexiones is not None else []

    def fabrica():
        con = Conexion(list(reglas or []) + REGLAS_BASE)
        conexiones.append(con)
        return con
    sanear = b.Saneador([SECRETO, HOST, USUARIO])
    return b.Servicio(conectar or fabrica, [REPO], b.Auditoria(AUD, sanear), sanear, EST,
                      ruta_d8=os.path.join(AQUI, "diagnostico_d8.sql"),
                      catalogo_de=lambda cur: CatalogoSimulado()), conexiones


# ================================================================= pruebas ====

# 1. aplicar un archivo versionado y aditivo: se ejecuta, se confirma y deja copia de estructura.
ruta = escribir("supabase/migrations/2026112700001_aditivo.sql",
                f"create table vz_ops_nueva (id int);\ninsert into vz_ops_prueba (id, nota) values (1, '{VALOR}');\n")
s, cons = servicio()
r = s.procesar({"orden": "aplicar", "archivo": ruta}, uid=1000, pid=1)
comprobar(r["estado"] == "ok", f"aplicar aditivo debería ir bien: {r}")
comprobar(cons and cons[-1].commits == 1, "aplicar aditivo debería confirmar una vez")
comprobar(any("create table vz_ops_nueva" in x for x in cons[-1].ejecutadas), "debería ejecutar el CREATE TABLE")
comprobar(r.get("copia_estructura") and os.path.exists(r["copia_estructura"]), "debería guardar copia de estructura")
if r.get("copia_estructura"):
    copia = json.load(open(r["copia_estructura"], encoding="utf-8"))
    comprobar("NO incluye datos" in copia["tipo"], "la copia debe declararse como estructura, no datos")
    comprobar(VALOR not in json.dumps(copia), "la copia de estructura no debe contener valores de datos")
comprobar(r.get("commit") and len(r["commit"]) == 40, "aplicar debería registrar el commit del archivo (D6)")

# 2. D6: un archivo sin versionar o con cambios sin commit no se aplica (ni siquiera se conecta).
ruta_nv = escribir("supabase/migrations/2026112700002_sin_versionar.sql", "create table vz_ops_x (id int);", commit=False)
s, cons = servicio()
r = s.procesar({"orden": "aplicar", "archivo": ruta_nv})
comprobar(r["estado"] == "rechazada" and "versionado" in r["motivo"] and not cons, f"sin versionar: {r}")
ruta_mod = escribir("supabase/migrations/2026112700003_modificado.sql", "create table vz_ops_y (id int);")
with open(ruta_mod, "a", encoding="utf-8") as f:
    f.write("\ncreate table vz_ops_z (id int);\n")
r = s.procesar({"orden": "aplicar", "archivo": ruta_mod})
comprobar(r["estado"] == "rechazada" and "sin commit" in r["motivo"] and not cons, f"con cambios sin commit: {r}")

# 3. ACCION_MANUAL: ni por nombre ni por marca, en ninguna orden.
ruta_am = escribir("documentacion/acciones-manuales/ACCION_MANUAL__BORRAR_X__2026-10-09.sql", "select 1;")
ruta_marca = escribir("supabase/migrations/2026112700004_marca.sql", "-- VZ: ACCION_MANUAL\ndrop table vz_ops_prueba;\n")
for orden in ("aplicar", "plan", "consultar"):
    for rr in (ruta_am, ruta_marca):
        s, cons = servicio()
        r = s.procesar({"orden": orden, "archivo": rr})
        comprobar(r["estado"] == "requiere_accion_manual" and not cons,
                  f"{orden} sobre {os.path.basename(rr)} no debe ejecutarse: {r}")
s, cons = servicio()
r = s.procesar({"orden": "consultar", "sql": "-- VZ: ACCION_MANUAL\nselect 1"})
comprobar(r["estado"] == "requiere_accion_manual" and not cons, "consultar --sql con la marca no debe ejecutarse")

# 4. Destructivo: no se ejecuta nada, se propone el archivo ACCION_MANUAL.
ruta_d = escribir("supabase/migrations/2026112700005_destructivo.sql", "create table vz_ops_w (id int);\ndrop table vz_ops_prueba;\n")
s, cons = servicio()
r = s.procesar({"orden": "aplicar", "archivo": ruta_d})
comprobar(r["estado"] == "requiere_accion_manual", f"destructivo debería requerir acción manual: {r}")
comprobar(cons and cons[-1].commits == 0 and not any(re.search(r"\b(drop|create) table", x, re.I)
                                                     for x in cons[-1].ejecutadas),
          "con una sentencia bloqueada no debe ejecutarse ninguna (ni las permitidas)")
nombres = [a["nombre"] for a in r.get("acciones_manuales", [])]
comprobar(nombres and nombres[0].startswith("ACCION_MANUAL__BORRAR_"), f"debería proponer ACCION_MANUAL__BORRAR_: {nombres}")
comprobar(all("VZ: ACCION_MANUAL" in a["contenido"] for a in r.get("acciones_manuales", [])),
          "el borrador de acción manual debe llevar la marca")

# 5. D2: UPDATE de más de 100 filas se deshace; de 50, se confirma.
ruta_u = escribir("supabase/migrations/2026112700006_update.sql", "update vz_ops_prueba set nota = 'x' where id > 0;\n")
s, cons = servicio(reglas=[(r"^\s*update", {"rowcount": 150})])
r = s.procesar({"orden": "aplicar", "archivo": ruta_u})
comprobar(r["estado"] == "requiere_accion_manual" and "150" in r.get("motivo", ""), f"UPDATE de 150 filas: {r}")
comprobar(cons[-1].commits == 0 and cons[-1].rollbacks >= 1, "UPDATE de 150 filas debe deshacerse sin confirmar")
s, cons = servicio(reglas=[(r"^\s*update", {"rowcount": 50})])
r = s.procesar({"orden": "aplicar", "archivo": ruta_u})
comprobar(r["estado"] == "ok" and cons[-1].commits == 1, f"UPDATE de 50 filas debería confirmarse: {r}")

# 6. plan no vale para aplicar: aplicar relee, recalcula el sha256 y vuelve a analizar.
ruta_p = escribir("supabase/migrations/2026112700007_plan.sql", "create table vz_ops_plan (id int);\n")
s, cons = servicio()
r_plan = s.procesar({"orden": "plan", "archivo": ruta_p})
comprobar(r_plan["estado"] == "ok" and not any(c.commits for c in cons), "plan no debe confirmar nada")
escribir("supabase/migrations/2026112700007_plan.sql", "drop table vz_ops_prueba;\n")
r = s.procesar({"orden": "aplicar", "archivo": ruta_p})
comprobar(r["estado"] == "requiere_accion_manual", "aplicar debe analizar el contenido nuevo, no el del plan")
ultima = json.loads(open(AUD, encoding="utf-8").read().splitlines()[-1])
comprobar(ultima.get("sha256") and ultima["sha256"] != r_plan["sha256"], "aplicar debe registrar el sha256 nuevo")

# 7. Rutas: fuera del repo, enlaces simbólicos que salen, extensión, ruta relativa.
ruta_fuera = escribir("x.sql", "select 1;", commit=False, base=FUERA)
os.symlink(ruta_fuera, os.path.join(REPO, "enlace.sql"))
for ruta_mala, texto in [(ruta_fuera, "fuera del repositorio"), (os.path.join(REPO, "enlace.sql"), "fuera del repositorio"),
                         (escribir("notas.txt", "select 1;"), ".sql"), ("supabase/migrations/2026112700001_aditivo.sql", "absoluta")]:
    s, cons = servicio()
    r = s.procesar({"orden": "plan", "archivo": ruta_mala})
    comprobar(r["estado"] == "rechazada" and texto in r["motivo"] and not cons, f"ruta {ruta_mala}: {r}")

# 8. consultar: lectura sí; escritura no.
s, cons = servicio()
r = s.procesar({"orden": "consultar", "sql": "select 1"})
comprobar(r["estado"] == "ok" and r["resultados"][0]["filas"] == [[1]], f"consultar select: {r}")
comprobar(cons[-1].read_only and cons[-1].commits == 0, "consultar debe ir en transacción de solo lectura")
for sql in ("create table vz_ops_q (id int)", f"insert into vz_ops_prueba values (1, '{VALOR}')",
            "delete from vz_ops_prueba", "drop table vz_ops_prueba"):
    s, cons = servicio()
    r = s.procesar({"orden": "consultar", "sql": sql})
    comprobar(r["estado"] == "requiere_accion_manual" and not any(c.commits for c in cons), f"consultar {sql!r}: {r}")

# 9. diagnostico-d8: el D8 aprobado pasa el clasificador como lectura y se ejecuta.
s, cons = servicio()
r = s.procesar({"orden": "diagnostico-d8"})
comprobar(r["estado"] == "ok" and cons[-1].read_only, f"diagnostico-d8 debería ejecutarse en solo lectura: {r}")

# 10. Errores saneados: ni contraseña, ni host, ni usuario, ni DSN.
mensaje = f"fallo password={SECRETO} en {HOST} usando postgres://{USUARIO}:{SECRETO}@{HOST}:5432/postgres"
ruta_e = escribir("supabase/migrations/2026112700008_error.sql", f"insert into vz_ops_prueba (id, nota) values (2, '{VALOR}');\n")
s, cons = servicio(reglas=[(r"^\s*insert", ErrorPG(mensaje))])
r = s.procesar({"orden": "aplicar", "archivo": ruta_e})
texto = json.dumps(r)
comprobar(r["estado"] == "error" and not any(x in texto for x in (SECRETO, HOST, USUARIO, "postgres://")),
          f"el error debe salir saneado: {r}")


def conectar_falla():
    raise OperationalError(f"connection to server at {HOST} failed for user {USUARIO} password {SECRETO}")


s, _ = servicio(conectar=conectar_falla)
r = s.procesar({"orden": "estado"})
texto = json.dumps(r)
comprobar(r["estado"] == "error" and not any(x in texto for x in (SECRETO, HOST, USUARIO)), f"conexión fallida: {r}")

# 11. Órdenes y peticiones no reconocidas.
s, cons = servicio()
for p in ({"orden": "ejecutar", "sql": "drop table x"}, ["estado"], {"orden": "aplicar"}):
    r = s.procesar(p)
    comprobar(r["estado"] == "rechazada" and not cons, f"petición {p!r} debería rechazarse: {r}")

# 12. CREATE INDEX CONCURRENTLY va solo y fuera de transacción.
ruta_c = escribir("supabase/migrations/2026112700009_concurrente.sql", "create index concurrently if not exists i on vz_ops_prueba (id);\n")
s, cons = servicio()
r = s.procesar({"orden": "aplicar", "archivo": ruta_c})
comprobar(r["estado"] == "ok" and cons[-1].autocommit, f"CREATE INDEX CONCURRENTLY: {r}")

# 12b. RPC y funciones existentes (F1.2): ni consultar ni aplicar las ejecutan; no se confirma nada.
for sql in ("select public.registrar_venta(1)", "select registrar_venta(1)", "select * from rpc_definer()",
            "select count(*) from vz_ops_prueba where registrar_venta(id) > 0"):
    s, cons = servicio()
    r = s.procesar({"orden": "consultar", "sql": sql})
    comprobar(r["estado"] == "requiere_accion_manual" and not any(c.commits for c in cons)
              and not any("registrar_venta" in x or "rpc_definer" in x for c in cons for x in c.ejecutadas),
              f"consultar {sql!r} no debe ejecutar la RPC: {r}")
ruta_rpc = escribir("supabase/migrations/2026112700010_rpc.sql", "insert into vz_ops_prueba (id) select public.registrar_venta(1);\n")
s, cons = servicio()
r = s.procesar({"orden": "aplicar", "archivo": ruta_rpc})
comprobar(r["estado"] == "requiere_accion_manual" and not any(c.commits for c in cons)
          and not any("registrar_venta" in x for c in cons for x in c.ejecutadas),
          f"aplicar con una RPC existente no debe ejecutar nada: {r}")
ruta_def = escribir("supabase/migrations/2026112700011_definer.sql",
                    "create function vz_ops_f() returns int language sql security definer as $$ select 1 $$;\n")
s, cons = servicio()
r = s.procesar({"orden": "aplicar", "archivo": ruta_def})
comprobar(r["estado"] == "requiere_accion_manual" and not any(c.commits for c in cons),
          f"SECURITY DEFINER siempre requiere acción manual: {r}")

# 12c. estado avisa si el rol puede borrar o vaciar tablas de la tienda, o si faltan vigilantes.
TRES = (r"current_setting\('server_version'\)", {"filas": [("17.6", "vz_agente", 3)], "columnas": ["v", "u", "b"]})
s, cons = servicio(reglas=[TRES])
r = s.procesar({"orden": "estado"})
comprobar(r["estado"] == "ok" and r.get("tablas_negocio_borrables") == 0 and "aviso" not in r
          and r.get("segunda_barrera", "").startswith("disponible (3"), f"estado con los 3 vigilantes: {r}")
s, cons = servicio(reglas=[TRES, (r"has_table_privilege", {"filas": [(3,)], "columnas": ["n"]})])
r = s.procesar({"orden": "estado"})
comprobar(r.get("tablas_negocio_borrables") == 3 and "borrar" in r.get("aviso", ""),
          f"estado debe avisar si puede borrar la tienda: {r}")
s, cons = servicio(reglas=[TRES, (r"rolbypassrls", {"filas": [(True,)], "columnas": ["b"]})])
r = s.procesar({"orden": "estado"})
comprobar(r.get("salta_rls") is True and "BYPASSRLS" in r.get("aviso", ""), f"estado debe avisar de BYPASSRLS: {r}")
s, cons = servicio(reglas=[(r"current_setting\('server_version'\)", {"filas": [("17.6", "vz_agente", 2)],
                                                                    "columnas": ["v", "u", "b"]})])
r = s.procesar({"orden": "estado"})
comprobar("vigilantes" in r.get("aviso", ""), f"estado debe avisar si falta un vigilante: {r}")

# 12d. Reglas de VideojuegosZaragoza en «aplicar»: solo supabase/migrations/, igual a origin/main,
#      una sola vez y registrada en schema_migrations.
ruta_reg = escribir("supabase/migrations/20261127000012_registro.sql", "create table vz_ops_reg (id int);\n")
s, cons = servicio()
r = s.procesar({"orden": "aplicar", "archivo": ruta_reg})
comprobar(r["estado"] == "ok" and r.get("registrada") == "20261127000012_registro"
          and any("schema_migrations" in x and x.lstrip().lower().startswith("insert") for x in cons[-1].ejecutadas),
          f"aplicar debe registrar la migración: {r}")
s, cons = servicio(reglas=[(r"from supabase_migrations\.schema_migrations where version", {"filas": [(True,)],
                                                                                          "columnas": ["e"]})])
r = s.procesar({"orden": "aplicar", "archivo": ruta_reg})
comprobar(r["estado"] == "rechazada" and "ya está registrada" in r.get("motivo", "") and cons[-1].commits == 0
          and not any("create table" in x for x in cons[-1].ejecutadas), f"repetir no debe ejecutar nada: {r}")
ruta_suelta = escribir("supabase/suelta.sql", "create table vz_ops_s (id int);\n")
s, cons = servicio()
r = s.procesar({"orden": "aplicar", "archivo": ruta_suelta})
comprobar(r["estado"] == "rechazada" and "supabase/migrations" in r["motivo"] and not cons, f"fuera de migrations: {r}")
ruta_np = escribir("supabase/migrations/20261127000013_sin_publicar.sql", "create table vz_ops_np (id int);\n")
subprocess.run(GIT + ["update-ref", "refs/remotes/origin/main", "HEAD~1"], check=True)
s, cons = servicio()
r = s.procesar({"orden": "aplicar", "archivo": ruta_np})
comprobar(r["estado"] == "rechazada" and "origin/main" in r["motivo"] and not cons, f"sin publicar: {r}")
subprocess.run(GIT + ["update-ref", "refs/remotes/origin/main", "HEAD"], check=True)
with open(ruta_np, "w", encoding="utf-8") as f:
    f.write("create table vz_ops_otra (id int);\n")
subprocess.run(GIT + ["commit", "-q", "-am", "cambio sin publicar"], check=True)
r = s.procesar({"orden": "aplicar", "archivo": ruta_np})
comprobar(r["estado"] == "rechazada" and "igual" in r["motivo"] and not cons, f"distinta de origin/main: {r}")
subprocess.run(GIT + ["update-ref", "refs/remotes/origin/main", "HEAD"], check=True)

# 12e. Tablas de la tienda (dueño, 2026-11-27): UPDATE pequeño sí; grande se deshace; DELETE nunca.
ruta_t = escribir("supabase/migrations/20261127000014_tienda.sql",
                  "update public.profiles set plan = 'pro' where id = 7;\n")
s, cons = servicio(reglas=[(r"^\s*update", {"rowcount": 1})])
r = s.procesar({"orden": "aplicar", "archivo": ruta_t})
comprobar(r["estado"] == "ok" and cons[-1].commits == 1, f"UPDATE de 1 fila de la tienda: {r}")
s, cons = servicio(reglas=[(r"^\s*update", {"rowcount": 101})])
r = s.procesar({"orden": "aplicar", "archivo": ruta_t})
comprobar(r["estado"] == "requiere_accion_manual" and cons[-1].commits == 0, f"UPDATE de 101 filas de la tienda: {r}")
# Varias sentencias y una se pasa del límite: se deshace TODO el archivo (también lo anterior) y no se registra.
ruta_tm = escribir("supabase/migrations/20261127000016_tienda_mixta.sql",
                   "create table vz_ops_antes (id int);\nupdate public.profiles set plan = 'a' where id = 7;\n"
                   "insert into public.profiles (id) select g from generate_series(1, 101) g;\n")
s, cons = servicio(reglas=[(r"^\s*insert into public\.profiles", {"rowcount": 101}), (r"^\s*update", {"rowcount": 1})])
r = s.procesar({"orden": "aplicar", "archivo": ruta_tm})
comprobar(r["estado"] == "requiere_accion_manual" and "101" in r.get("motivo", "") and cons[-1].commits == 0
          and cons[-1].rollbacks >= 1
          and not any("schema_migrations" in x and x.lstrip().lower().startswith("insert") for x in cons[-1].ejecutadas),
          f"INSERT de 101 filas en la tienda: todo deshecho y sin registrar: {r}")
ruta_td = escribir("supabase/migrations/20261127000015_tienda_borrar.sql", "delete from public.profiles where id = 7;\n")
s, cons = servicio()
r = s.procesar({"orden": "aplicar", "archivo": ruta_td})
comprobar(r["estado"] == "requiere_accion_manual" and cons[-1].commits == 0, f"DELETE en la tienda: {r}")

# 13. Socket de extremo a extremo con el cliente real; usuario no autorizado rechazado.
ruta_sock = os.path.join(TMP, "sql.sock")
for permitidos, esperado in ((None, "ok"), ({os.getuid() + 12345}, "rechazada")):
    if os.path.exists(ruta_sock):
        os.unlink(ruta_sock)
    escucha = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    escucha.bind(ruta_sock)
    escucha.listen(1)
    s, _ = servicio()
    hilo = threading.Thread(target=b.servir, args=(escucha, s, permitidos, True), daemon=True)
    hilo.start()
    r = cliente.enviar({"orden": "estado"}, ruta_sock, tiempo=10)
    hilo.join(10)
    escucha.close()
    comprobar(r.get("estado") == esperado, f"socket (permitidos={permitidos}): {r}")
    if esperado == "ok":
        comprobar(r.get("segunda_barrera") == "segunda barrera PostgreSQL no disponible",
                  "estado debe avisar si falta la segunda barrera")

# 14. La auditoría nunca contiene secretos, DSN, valores de datos ni texto SQL.
auditoria = open(AUD, encoding="utf-8").read()
for prohibido in (SECRETO, HOST, USUARIO, "postgres://", VALOR, "create table", "drop table", "insert into"):
    comprobar(prohibido not in auditoria, f"la auditoría contiene «{prohibido}»")
lineas = [json.loads(x) for x in auditoria.splitlines()]
comprobar(all({"fecha", "resultado", "duracion_ms"} <= set(x) for x in lineas if "peticion" in x),
          "cada petición auditada debe tener fecha, resultado y duración")
comprobar(any(x.get("commit") and x.get("sentencias") for x in lineas), "aplicar debe auditar commit y sentencias")

shutil.rmtree(TMP, ignore_errors=True)
print(f"{comprobaciones - len(fallos)}/{comprobaciones} comprobaciones correctas")
sys.exit(1 if fallos else 0)
