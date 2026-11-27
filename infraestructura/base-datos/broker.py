#!/usr/bin/env python3
# == VIDEOJUEGOSZARAGOZA ====================================================
# Archivo:        infraestructura/base-datos/broker.py
#                 (copia adaptada de VeoAura, commit eb5f74fc, autorizada por su propietario el 2026-11-27.
#                 Diferencias aprobadas por el dueño el 2026-11-27: el rol lee y actualiza las tablas de la
#                 tienda, «estado» comprueba que no puede borrarlas y «aplicar» solo acepta migraciones de
#                 supabase/migrations/ iguales a origin/main y las registra en schema_migrations)
#                 (se instala en /opt/vz-sql/broker.py; lo arranca vz-sql.service)
# Función:        Broker de vz-sql: único proceso que conoce la credencial de Supabase.
#                 Atiende peticiones por un socket Unix (estado, diagnostico-d8, consultar, plan,
#                 aplicar), clasifica cada sentencia con clasificador.py y solo ejecuta lo
#                 permitido, en una transacción con límites de tiempo. Audita cada petición sin
#                 registrar secretos ni valores de datos.
# Para qué sirve: Que Claude trabaje con el Supabase real de VideojuegosZaragoza sin ver la contraseña y sin
#                 poder ejecutar nada destructivo.
# Conectado con:  clasificador.py, diagnostico_d8.sql, cliente.py (por el socket),
#                 /etc/videojuegoszaragoza-sql/conexion.env (credencial), /var/log/vz-sql/auditoria.jsonl,
#                 /var/lib/vz-sql/estructura/ (copias de estructura), git (versionado, D6).
# Utilizado por:  vz-sql.service (systemd, activado por vz-sql.socket); test_broker.py.
# Dependencias:   python3, pglast y psycopg (requisitos.txt), git.
# Estado:         ACTIVO
# ============================================================================
import datetime
import hashlib
import json
import os
import re
import socket
import struct
import subprocess
import sys
import time
import uuid

AQUI = os.path.dirname(os.path.abspath(__file__))
if AQUI not in sys.path:
    sys.path.insert(0, AQUI)
import clasificador as cl  # noqa: E402

VERSION = "1.0.0"
ORDENES = ("estado", "diagnostico-d8", "consultar", "plan", "aplicar")
LIMITE_PETICION = 1_000_000
LIMITE_ARCHIVO = 512 * 1024
LIMITE_FILAS_RESPUESTA = 500
RUTA_D8 = os.path.join(AQUI, "diagnostico_d8.sql")
RAICES_POR_DEFECTO = "/home/videojuegoszaragoza/apps/videojuegooscom-app:/home/videojuegoszaragoza/apps/videojuegooscom-wt"
MIGRACION_RE = re.compile(r"^supabase/migrations/(\d{14})_([a-z0-9_]+)\.sql$")
CLAVES_CONFIG = ("VZ_SQL_HOST", "VZ_SQL_PORT", "VZ_SQL_DB", "VZ_SQL_USUARIO",
                 "VZ_SQL_CONTRASENA")


class Rechazo(Exception):
    def __init__(self, motivo, estado="rechazada", **extra):
        super().__init__(motivo)
        self.motivo, self.estado, self.extra = motivo, estado, extra


# ============================================================ saneado y auditoría =====

PATRONES_SECRETOS = [
    (re.compile(r"postgres(ql)?://\S+", re.I), "[DSN-REDACTADO]"),
    (re.compile(r"\b(password|passwd|pwd|contrasena|contraseña)\s*[=:]\s*\S+", re.I), r"\1=[REDACTADO]"),
    (re.compile(r"\b(host|hostaddr|user|usuario)\s*=\s*\S+", re.I), r"\1=[REDACTADO]"),
    (re.compile(r"(sk_(live|test)_|rk_(live|test)_|whsec_)[A-Za-z0-9]+"), r"\1[REDACTADO]"),
    (re.compile(r"sk-[A-Za-z0-9_-]{16,}"), "sk-[REDACTADO]"),
    (re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"), "[JWT-REDACTADO]"),
    (re.compile(r"(gh[pousr]_)[A-Za-z0-9]{20,}"), r"\1[REDACTADO]"),
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*", re.S), "[CLAVE-PRIVADA-REDACTADA]"),
]


class Saneador:
    """Quita de cualquier texto la credencial, el host, el usuario y patrones de secretos."""

    def __init__(self, secretos=()):
        self.secretos = sorted({s for s in secretos if isinstance(s, str) and len(s) >= 4}, key=len, reverse=True)

    def __call__(self, texto, limite=1000):
        t = str(texto)
        for s in self.secretos:
            t = t.replace(s, "[REDACTADO]")
        for patron, sustituto in PATRONES_SECRETOS:
            t = patron.sub(sustituto, t)
        return t[:limite]


class Auditoria:
    """JSONL de solo-añadir. Solo metadatos: nunca SQL, valores, DSN, contraseñas ni entorno."""

    CLAVES_PROHIBIDAS = {"sql", "texto", "contenido", "valores", "filas_datos", "dsn", "password", "contrasena",
                         "entorno", "env"}

    def __init__(self, ruta, sanear):
        self.ruta, self.sanear = ruta, sanear

    def _limpiar(self, valor, clave=""):
        if clave in self.CLAVES_PROHIBIDAS:
            return "[OMITIDO]"
        if isinstance(valor, dict):
            return {k: self._limpiar(v, k) for k, v in valor.items()}
        if isinstance(valor, (list, tuple)):
            return [self._limpiar(v) for v in valor]
        if isinstance(valor, str):
            return self.sanear(valor, 2000)
        return valor

    def registrar(self, registro):
        linea = json.dumps(self._limpiar(registro), ensure_ascii=False, sort_keys=True, default=str)
        fd = os.open(self.ruta, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o640)
        try:
            os.write(fd, (linea + "\n").encode("utf-8"))
        finally:
            os.close(fd)


# =================================================================== catálogo =====

class CatalogoPG:
    """Consultas de solo lectura al catálogo, dentro de la misma transacción que la ejecución."""

    def __init__(self, cursor):
        self.cur = cursor

    def _uno(self, consulta, parametros):
        self.cur.execute(consulta, parametros)
        fila = self.cur.fetchone()
        return bool(fila and fila[0])

    def existe_relacion(self, esquema, nombre):
        return self._uno("select to_regclass(format('%%I.%%I', %s::text, %s::text)) is not null", (esquema, nombre))

    def es_del_agente(self, esquema, nombre):
        return self._uno(
            "select exists (select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n "
            "on n.oid = c.relnamespace where n.nspname = %s and c.relname = %s and c.relowner = "
            "(select oid from pg_catalog.pg_roles where rolname = current_user))", (esquema, nombre))

    def existe_funcion(self, esquema, nombre):
        return self._uno(
            "select exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n "
            "on n.oid = p.pronamespace where n.nspname = %s and p.proname = %s)", (esquema, nombre))

    def existe_trigger(self, esquema, tabla, nombre):
        return self._uno(
            "select exists (select 1 from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid = t.tgrelid "
            "join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = %s and c.relname = %s "
            "and t.tgname = %s and not t.tgisinternal)", (esquema, tabla, nombre))

    def es_funcion_del_agente(self, esquema, nombre):
        """Existe y TODAS sus variantes son del agente y sin SECURITY DEFINER (creadas por vz-sql)."""
        return self._uno(
            "select exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n "
            "on n.oid = p.pronamespace where n.nspname = %s and p.proname = %s) and not exists ("
            "select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace "
            "where n.nspname = %s and p.proname = %s and (p.prosecdef or p.proowner <> "
            "(select oid from pg_catalog.pg_roles where rolname = current_user)))",
            (esquema, nombre, esquema, nombre))

    def funcion_de_aplicacion(self, nombre):
        """Hay fuera de pg_catalog una función con ese nombre que no es de una extensión ni del agente
        (o es SECURITY DEFINER): una llamada sin esquema podría acabar en ella."""
        return self._uno(
            "select exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n "
            "on n.oid = p.pronamespace where p.proname = %s "
            "and n.nspname not in ('pg_catalog', 'information_schema') "
            "and not exists (select 1 from pg_catalog.pg_depend d where d.classid = 'pg_catalog.pg_proc'::regclass "
            "and d.objid = p.oid and d.deptype = 'e') "
            "and (p.prosecdef or p.proowner <> (select oid from pg_catalog.pg_roles where rolname = current_user)))",
            (nombre,))

    def operador_de_aplicacion(self, simbolo):
        """La aplicación (no pg_catalog ni una extensión) define un operador con ese símbolo."""
        return self._uno(
            "select exists (select 1 from pg_catalog.pg_operator o join pg_catalog.pg_namespace n "
            "on n.oid = o.oprnamespace where o.oprname = %s "
            "and n.nspname not in ('pg_catalog', 'information_schema') "
            "and not exists (select 1 from pg_catalog.pg_depend d where d.classid = 'pg_catalog.pg_operator'::regclass "
            "and d.objid = o.oid and d.deptype = 'e'))", (simbolo,))


# Tablas de la tienda (ni del agente ni vz_ops_*) que el rol podría borrar o vaciar, o cuya estructura
# podría cambiar (por ser de un rol del que es miembro). Debe ser 0: el rol solo lee, inserta y
# actualiza (dueño, 2026-11-27; ver ACCION_MANUAL__rol_vz_agente_2026-11-27.sql).
CONSULTA_BORRADO_NEGOCIO = (
    "select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace "
    "where n.nspname = 'public' and c.relkind in ('r', 'p') "
    "and c.relowner <> (select oid from pg_catalog.pg_roles where rolname = current_user) "
    "and left(c.relname, 7) <> 'vz_ops_' "
    "and (has_table_privilege(c.oid, 'DELETE') or has_table_privilege(c.oid, 'TRUNCATE') "
    "or pg_catalog.pg_has_role(c.relowner, 'USAGE'))")


# ==================================================================== servicio =====

class Servicio:
    def __init__(self, conectar, raices, auditoria, sanear, dir_estructura, ruta_d8=RUTA_D8,
                 catalogo_de=CatalogoPG, limite_update=cl.LIMITE_FILAS_UPDATE):
        self.conectar, self.auditoria, self.sanear = conectar, auditoria, sanear
        self.raices = [os.path.realpath(r) for r in raices if r]
        self.dir_estructura, self.ruta_d8 = dir_estructura, ruta_d8
        self.catalogo_de, self.limite_update = catalogo_de, limite_update

    # ------------------------------------------------------------------ archivos
    def _dentro_de_raices(self, real):
        return any(real == r or real.startswith(r.rstrip("/") + "/") for r in self.raices)

    def leer_archivo(self, ruta, exigir_versionado):
        """Siempre relee el archivo y recalcula su sha256: nunca se confía en un plan anterior."""
        if not isinstance(ruta, str) or not ruta or "\x00" in ruta or not os.path.isabs(ruta):
            raise Rechazo("indica la ruta absoluta de un archivo .sql")
        if os.path.basename(ruta).upper().startswith(cl.PREFIJO_ARCHIVO_MANUAL):
            raise Rechazo("los archivos ACCION_MANUAL__ nunca se ejecutan automáticamente", "requiere_accion_manual")
        real = os.path.realpath(ruta)
        if not self._dentro_de_raices(real):
            raise Rechazo("el archivo está fuera del repositorio y de sus worktrees")
        if os.path.basename(real).upper().startswith(cl.PREFIJO_ARCHIVO_MANUAL):
            raise Rechazo("los archivos ACCION_MANUAL__ nunca se ejecutan automáticamente", "requiere_accion_manual")
        if not real.endswith(".sql"):
            raise Rechazo("solo se aceptan archivos .sql")
        try:
            estado = os.stat(real)
        except OSError:
            raise Rechazo("no se puede leer el archivo")
        if not os.path.isfile(real) or estado.st_size > LIMITE_ARCHIVO:
            raise Rechazo(f"el archivo no es un archivo regular o supera {LIMITE_ARCHIVO // 1024} KB")
        with open(real, "rb") as f:
            datos = f.read(LIMITE_ARCHIVO + 1)
        try:
            texto = datos.decode("utf-8")
        except UnicodeDecodeError:
            raise Rechazo("el archivo no está en UTF-8")
        if cl.MARCA_ACCION_MANUAL_RE.search(texto):
            raise Rechazo("el archivo lleva la marca VZ: ACCION_MANUAL: nunca se ejecuta automáticamente",
                          "requiere_accion_manual")
        info = {"archivo": real, "sha256": hashlib.sha256(datos).hexdigest()}
        if exigir_versionado:
            info.update(self._versionado(real, texto))
        return texto, info

    def _git(self, carpeta, *args, texto=True):
        entorno = {"PATH": "/usr/bin:/bin", "HOME": "/nonexistent", "LC_ALL": "C", "GIT_CONFIG_NOSYSTEM": "1",
                   "GIT_OPTIONAL_LOCKS": "0", "GIT_TERMINAL_PROMPT": "0"}
        return subprocess.run(["git", "--no-optional-locks", "-c", "safe.directory=*", "-C", carpeta, *args],
                              capture_output=True, text=texto, timeout=20, env=entorno)

    def _versionado(self, real, texto):
        """D6: el DDL automático solo sale de un archivo versionado y sin cambios pendientes. Además (regla de
        VideojuegosZaragoza): solo migraciones de supabase/migrations/ ya publicadas e iguales a origin/main."""
        carpeta = os.path.dirname(real)
        r = self._git(carpeta, "rev-parse", "--show-toplevel")
        if r.returncode != 0:
            raise Rechazo("el archivo no está dentro de un repositorio git (D6)")
        raiz = os.path.realpath(r.stdout.strip())
        relativa = os.path.relpath(real, raiz)
        if self._git(raiz, "ls-files", "--error-unmatch", "--", relativa).returncode != 0:
            raise Rechazo("el archivo no está versionado: haz commit antes de aplicarlo (D6)")
        if self._git(raiz, "diff", "--quiet", "HEAD", "--", relativa).returncode != 0:
            raise Rechazo("el archivo tiene cambios sin commit: haz commit antes de aplicarlo (D6)")
        commit = self._git(raiz, "log", "-1", "--format=%H", "--", relativa).stdout.strip()
        rama = self._git(raiz, "rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
        migracion = MIGRACION_RE.match(relativa.replace(os.sep, "/"))
        if not migracion:
            raise Rechazo("aplicar solo acepta migraciones supabase/migrations/<14 cifras>_<nombre>.sql")
        principal = self._git(raiz, "show", f"origin/main:{relativa}", texto=False)
        if principal.returncode != 0:
            raise Rechazo("la migración no está en origin/main: publícala y haz «git fetch origin main» antes")
        if principal.stdout != texto.encode("utf-8"):
            raise Rechazo("la migración no es igual a la de origin/main: aplica solo la versión publicada")
        return {"commit": commit, "rama": rama, "ruta_en_repo": relativa, "version": migracion.group(1),
                "nombre": migracion.group(2)}

    @staticmethod
    def _ya_registrada(cur, version):
        cur.execute("select exists (select 1 from supabase_migrations.schema_migrations where version = %s)",
                    (version,))
        fila = cur.fetchone()
        return bool(fila and fila[0])

    @staticmethod
    def _registrar(cur, info, sentencias):
        """Como apply_migration: la migración queda en supabase_migrations.schema_migrations."""
        cur.execute("insert into supabase_migrations.schema_migrations (version, name, statements, created_by) "
                    "values (%s, %s, %s, %s)", (info["version"], info["nombre"], [s.texto for s in sentencias],
                                                "vz-sql"))

    # ----------------------------------------------------------------- conexión
    def _abrir(self, solo_lectura):
        conn = self.conectar()
        if solo_lectura:
            conn.read_only = True
        cur = conn.cursor()
        cur.execute("set local statement_timeout = '60s'")
        cur.execute("set local lock_timeout = '5s'")
        cur.execute("set local idle_in_transaction_session_timeout = '60s'")
        cur.execute("set local search_path = public, extensions")
        return conn, cur

    @staticmethod
    def _cerrar(conn):
        try:
            conn.rollback()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass

    # ------------------------------------------------------------------- órdenes
    def _estado(self, peticion, registro):
        conn, cur = self._abrir(True)
        try:
            cur.execute("select current_setting('server_version'), current_user, "
                        "(select count(*) from pg_catalog.pg_event_trigger where left(evtname, 3) = 'vz_' "
                        "and evtenabled <> 'D')")
            version, usuario, barreras = cur.fetchone()
            cur.execute(CONSULTA_BORRADO_NEGOCIO)
            borrado_negocio = int((cur.fetchone() or (0,))[0] or 0)
        finally:
            self._cerrar(conn)
        respuesta = {"estado": "ok", "postgres": version, "usuario": usuario, "broker": VERSION,
                     "pglast": cl.pglast.__version__,
                     "segunda_barrera": (f"disponible ({barreras} de 3 vigilantes activos)" if barreras
                                         else "segunda barrera PostgreSQL no disponible"),
                     "tablas_negocio_borrables": borrado_negocio}
        if borrado_negocio:
            respuesta["aviso"] = (f"el rol podría borrar, vaciar o cambiar {borrado_negocio} tablas de la tienda: "
                                  "no debería; revisa ACCION_MANUAL__rol_vz_agente_2026-11-27.sql")
        elif barreras < 3:
            respuesta["aviso"] = "faltan vigilantes de la segunda barrera: revisa ACCION_MANUAL__rol_vz_agente_2026-11-27.sql"
        return respuesta

    def _ejecutar_lectura(self, sql, registro):
        conn, cur = self._abrir(True)
        try:
            resultado = cl.clasificar(sql, self.catalogo_de(cur), "lectura")
            registro["sentencias"] = [s.resumen() for s in resultado.sentencias]
            if resultado.error or not resultado.permitido:
                raise Rechazo(resultado.error or "consultar solo admite lectura demostrable",
                              "requiere_accion_manual", sentencias=registro["sentencias"])
            salidas = []
            for s in resultado.sentencias:
                cur.execute(s.texto)
                if cur.description:
                    filas = cur.fetchmany(LIMITE_FILAS_RESPUESTA + 1)
                    salidas.append({"columnas": [d.name if hasattr(d, "name") else d[0] for d in cur.description],
                                    "filas": [list(f) for f in filas[:LIMITE_FILAS_RESPUESTA]],
                                    "truncado": len(filas) > LIMITE_FILAS_RESPUESTA})
                else:
                    salidas.append({"columnas": [], "filas": [], "truncado": False})
            registro["filas_devueltas"] = [len(x["filas"]) for x in salidas]
            return {"estado": "ok", "resultados": salidas, "sentencias": registro["sentencias"]}
        finally:
            self._cerrar(conn)

    def _consultar(self, peticion, registro):
        if peticion.get("archivo"):
            sql, info = self.leer_archivo(peticion["archivo"], exigir_versionado=False)
            registro.update(info)
        else:
            sql = peticion.get("sql")
            if not isinstance(sql, str) or not sql.strip():
                raise Rechazo("consultar necesita --sql o --archivo")
            if cl.MARCA_ACCION_MANUAL_RE.search(sql):
                raise Rechazo("el SQL lleva la marca VZ: ACCION_MANUAL", "requiere_accion_manual")
            registro["sha256"] = hashlib.sha256(sql.encode("utf-8")).hexdigest()
        return self._ejecutar_lectura(sql, registro)

    def _diagnostico_d8(self, peticion, registro):
        with open(self.ruta_d8, encoding="utf-8") as f:
            sql = f.read()
        registro["sha256"] = hashlib.sha256(sql.encode("utf-8")).hexdigest()
        return self._ejecutar_lectura(sql, registro)

    def _acciones_manuales(self, resultado, archivo):
        fecha = datetime.date.today().isoformat()
        return [{"nombre": cl.nombre_archivo_accion_manual(s, fecha), "motivo": s.motivo,
                 "contenido": cl.plantilla_accion_manual(s, archivo, fecha)} for s in resultado.bloqueadas()]

    def _plan(self, peticion, registro):
        texto, info = self.leer_archivo(peticion.get("archivo"), exigir_versionado=False)
        registro.update(info)
        conn, cur = self._abrir(True)
        try:
            resultado = cl.clasificar(texto, self.catalogo_de(cur), "aplicar")
        finally:
            self._cerrar(conn)
        registro["sentencias"] = [s.resumen() for s in resultado.sentencias]
        if resultado.error:
            raise Rechazo(resultado.error)
        return {"estado": "ok" if resultado.permitido else "requiere_accion_manual", "sha256": info["sha256"],
                "sentencias": registro["sentencias"],
                "acciones_manuales": self._acciones_manuales(resultado, info.get("archivo")),
                "aviso": "plan no ejecuta nada; aplicar vuelve a leer, calcular el sha256 y analizar el archivo"}

    def _copia_estructura(self, cur, info):
        """Copia de ESTRUCTURA (metadatos del esquema) antes de cambiarla. NO es una copia de datos."""
        with open(self.ruta_d8, encoding="utf-8") as f:
            cur.execute(f.read())
        secciones = cur.fetchall() or []
        os.makedirs(self.dir_estructura, exist_ok=True)
        marca = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        ruta = os.path.join(self.dir_estructura, f"{marca}__{info['sha256'][:12]}__{uuid.uuid4().hex[:8]}.json")
        fd = os.open(ruta, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o640)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump({"tipo": "copia de estructura (metadatos del esquema); NO incluye datos ni permite "
                               "recuperar datos",
                       "archivo_aplicado": info.get("archivo"), "sha256": info["sha256"],
                       "commit": info.get("commit"), "secciones": [list(x) for x in secciones]},
                      f, ensure_ascii=False, default=str)
        return ruta

    def _aplicar(self, peticion, registro):
        texto, info = self.leer_archivo(peticion.get("archivo"), exigir_versionado=True)
        registro.update(info)
        conn, cur = self._abrir(False)
        try:
            if self._ya_registrada(cur, info["version"]):
                raise Rechazo(f"la migración {info['version']} ya está registrada en schema_migrations: no se "
                              "vuelve a aplicar")
            resultado = cl.clasificar(texto, self.catalogo_de(cur), "aplicar")
            registro["sentencias"] = [s.resumen() for s in resultado.sentencias]
            if resultado.error:
                raise Rechazo(resultado.error)
            if not resultado.permitido:
                raise Rechazo("hay sentencias que requieren acción manual: no se ha ejecutado nada",
                              "requiere_accion_manual", sentencias=registro["sentencias"],
                              acciones_manuales=self._acciones_manuales(resultado, info.get("archivo")))
            registro["copia_estructura"] = self._copia_estructura(cur, info)
            filas = []
            if any(s.fuera_de_transaccion for s in resultado.sentencias):  # CREATE INDEX CONCURRENTLY, solo
                conn.rollback()
                conn.autocommit = True
                cur = conn.cursor()
                cur.execute("set lock_timeout = '5s'")
                cur.execute(resultado.sentencias[0].texto)
                filas.append(cur.rowcount)
                self._registrar(cur, info, resultado.sentencias)
            else:
                for s in resultado.sentencias:
                    cur.execute(s.texto)
                    filas.append(cur.rowcount)
                    if s.es_update and cur.rowcount > self.limite_update:
                        conn.rollback()
                        registro["filas_afectadas"] = filas
                        s.veredicto, s.categoria = cl.MANUAL, "destructiva"
                        s.motivo = (f"UPDATE afecta a {cur.rowcount} filas (máximo {self.limite_update}, D2): "
                                    "deshecho, no se ha aplicado nada")
                        registro["sentencias"] = [x.resumen() for x in resultado.sentencias]
                        raise Rechazo(s.motivo, "requiere_accion_manual", sentencias=registro["sentencias"],
                                      acciones_manuales=self._acciones_manuales(resultado, info.get("archivo")))
                self._registrar(cur, info, resultado.sentencias)
                conn.commit()
            registro["filas_afectadas"] = filas
            return {"estado": "ok", "sha256": info["sha256"], "commit": info.get("commit"),
                    "registrada": f"{info['version']}_{info['nombre']}",
                    "sentencias": registro["sentencias"], "filas_afectadas": filas,
                    "copia_estructura": registro["copia_estructura"]}
        finally:
            self._cerrar(conn)

    # ------------------------------------------------------------------ entrada
    def procesar(self, peticion, uid=None, pid=None):
        inicio = time.monotonic()
        registro = {"fecha": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
                    "peticion": uuid.uuid4().hex, "uid": uid, "pid": pid, "broker": VERSION}
        try:
            if not isinstance(peticion, dict):
                raise Rechazo("petición no reconocida")
            orden = peticion.get("orden")
            registro["orden"] = orden if orden in ORDENES else "desconocida"
            if orden not in ORDENES:
                raise Rechazo("orden no reconocida")
            respuesta = {"estado": self._estado, "diagnostico-d8": self._diagnostico_d8, "consultar": self._consultar,
                         "plan": self._plan, "aplicar": self._aplicar}[orden](peticion, registro)
        except Rechazo as e:
            respuesta = {"estado": e.estado, "motivo": self.sanear(e.motivo), **e.extra}
        except Exception as e:  # errores de PostgreSQL, de conexión o internos: siempre saneados
            sqlstate = getattr(e, "sqlstate", None)
            diag = getattr(e, "diag", None)
            mensaje = getattr(diag, "message_primary", None) if diag is not None else None
            if not mensaje:
                mensaje = (f"error de {type(e).__name__}" if sqlstate is None
                           else "error de PostgreSQL sin detalle")
            if type(e).__name__ in ("OperationalError", "ConnectionTimeout", "InterfaceError"):
                mensaje = "no se pudo conectar o la conexión se interrumpió (detalle omitido por seguridad)"
            respuesta = {"estado": "error", "error": {"sqlstate": sqlstate, "mensaje": self.sanear(mensaje)}}
        registro["resultado"] = respuesta.get("estado")
        if "motivo" in respuesta:
            registro["motivo"] = respuesta["motivo"]
        if "error" in respuesta:
            registro["error"] = respuesta["error"]
        registro["duracion_ms"] = int((time.monotonic() - inicio) * 1000)
        self.auditoria.registrar(registro)
        return respuesta


# ===================================================================== socket =====

def _leer_peticion(conn):
    datos = b""
    while b"\n" not in datos:
        trozo = conn.recv(65536)
        if not trozo:
            break
        datos += trozo
        if len(datos) > LIMITE_PETICION:
            raise Rechazo("petición demasiado grande")
    return json.loads(datos.split(b"\n", 1)[0].decode("utf-8"))


def servir(escucha, servicio, uids_permitidos=None, una_vez=False):
    while True:
        conn, _ = escucha.accept()
        with conn:
            conn.settimeout(30)
            pid, uid, _gid = struct.unpack("3i", conn.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED,
                                                                  struct.calcsize("3i")))
            try:
                if uids_permitidos and uid not in uids_permitidos:
                    respuesta = {"estado": "rechazada", "motivo": "usuario no autorizado"}
                    servicio.auditoria.registrar({"fecha": datetime.datetime.now(datetime.timezone.utc).isoformat(
                        timespec="seconds"), "uid": uid, "pid": pid, "resultado": "rechazada",
                        "motivo": "usuario no autorizado"})
                else:
                    respuesta = servicio.procesar(_leer_peticion(conn), uid=uid, pid=pid)
            except Rechazo as e:
                respuesta = {"estado": "rechazada", "motivo": e.motivo}
            except (ValueError, UnicodeDecodeError):
                respuesta = {"estado": "rechazada", "motivo": "petición no reconocida (JSON inválido)"}
            try:
                conn.sendall(json.dumps(respuesta, ensure_ascii=False, default=str).encode("utf-8") + b"\n")
            except OSError:
                pass
        if una_vez:
            return


def leer_configuracion(ruta):
    cfg = {}
    with open(ruta, encoding="utf-8") as f:
        for linea in f:
            linea = linea.strip()
            if not linea or linea.startswith("#") or "=" not in linea:
                continue
            clave, valor = linea.split("=", 1)
            cfg[clave.strip()] = valor.strip().strip("'\"")
    return cfg


def main():
    ruta_cfg = os.environ.get("VZ_SQL_CONFIG", "/etc/videojuegoszaragoza-sql/conexion.env")
    cfg = leer_configuracion(ruta_cfg)
    faltan = [k for k in CLAVES_CONFIG if not cfg.get(k)]
    if faltan:
        sys.exit(f"vz-sql: faltan variables en {ruta_cfg}: {', '.join(faltan)}")
    sanear = Saneador([cfg[k] for k in CLAVES_CONFIG if k != "VZ_SQL_PORT"])

    def conectar():
        import psycopg
        return psycopg.connect(host=cfg["VZ_SQL_HOST"], port=int(cfg["VZ_SQL_PORT"]),
                               dbname=cfg["VZ_SQL_DB"], user=cfg["VZ_SQL_USUARIO"],
                               password=cfg["VZ_SQL_CONTRASENA"],
                               sslmode=cfg.get("VZ_SQL_SSLMODE", "verify-full"),
                               sslrootcert=cfg.get("VZ_SQL_SSLROOTCERT") or None,
                               application_name="vz-sql", connect_timeout=10, autocommit=False)

    auditoria = Auditoria(os.environ.get("VZ_SQL_AUDITORIA", "/var/log/vz-sql/auditoria.jsonl"), sanear)
    servicio = Servicio(conectar, os.environ.get("VZ_SQL_REPOS", RAICES_POR_DEFECTO).split(":"), auditoria,
                        sanear, os.environ.get("VZ_SQL_ESTRUCTURA", "/var/lib/vz-sql/estructura"))
    uids = {int(u) for u in os.environ.get("VZ_SQL_UIDS", "").split(",") if u.strip().isdigit()}
    if os.environ.get("LISTEN_FDS") == "1" and os.environ.get("LISTEN_PID") == str(os.getpid()):
        escucha = socket.socket(fileno=3)
    else:
        sys.exit("vz-sql: se arranca con systemd (vz-sql.socket)")
    servir(escucha, servicio, uids or None)


if __name__ == "__main__":
    main()
