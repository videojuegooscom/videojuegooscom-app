#!/usr/bin/env python3
# == VIDEOJUEGOSZARAGOZA ====================================================
# Archivo:        infraestructura/base-datos/test_vz_sql.py
# Función:        Batería de vz-sql. Parte 1 (siempre, solo biblioteca estándar): aislamiento de VeoAura
#                 (ningún nombre, ruta, usuario, rol ni marca suyos), unidades de systemd endurecidas, SQL
#                 del rol con los tres vigilantes y sin contraseña real, plantilla sin valores y el cliente
#                 rechazando formas inválidas. Parte 2 (si hay pglast, con --lib o ya instalado): ejecuta
#                 test_clasificador.py, test_broker.py y test_integracion_pg.py.
# Para qué sirve: Que el guardián la pueda lanzar sin preguntar y que la instalación no siga si algo falla.
# Conectado con:  todos los archivos de esta carpeta; guardian.py (SCRIPTS_VALIDACION).
# Utilizado por:  python3 infraestructura/base-datos/test_vz_sql.py [--lib carpeta] [--pg-bin carpeta --pg-lib a:b]
# Dependencias:   python3 (parte 1); pglast y psycopg (parte 2).
# ============================================================================
import contextlib
import io
import os
import re
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True
sys.path.insert(0, AQUI)
fallos = []
comprobaciones = 0


def comprobar(condicion, descripcion):
    global comprobaciones
    comprobaciones += 1
    if not condicion:
        fallos.append(descripcion)
        print("FALLO  " + descripcion)


def leer(nombre):
    with open(os.path.join(AQUI, nombre), encoding="utf-8") as f:
        return f.read()


ARCHIVOS = ["broker.py", "cliente.py", "clasificador.py", "diagnostico_d8.sql", "requisitos.txt",
            "descargar_dependencias.py", "vz-sql.service", "vz-sql.socket", "conexion.env.plantilla",
            "instalar-sql.sh", "INSTALAR.md", "test_clasificador.py", "test_broker.py", "test_integracion_pg.py",
            "ACCION_MANUAL__rol_vz_agente_2026-11-27.sql"]

# 1. Están todos y no queda nada de VeoAura en tiempo de ejecución (solo la mención de su procedencia).
PROPIO_DE_VEOAURA = re.compile(r"veoaura[-_](sql|agente|ops|pruebas|guardia|app|wt)|/home/veoaura|/etc/veoaura|"
                               r"VEOAURA_|--\s*VEOAURA\s*:|SocketGroup=veoaura|SupplementaryGroups=veoaura", re.I)
for nombre in ARCHIVOS:
    existe = os.path.isfile(os.path.join(AQUI, nombre))
    comprobar(existe, f"falta {nombre}")
    if existe:
        sucios = [n for n, linea in enumerate(leer(nombre).splitlines(), 1) if PROPIO_DE_VEOAURA.search(linea)]
        comprobar(not sucios, f"{nombre} conserva nombres de VeoAura en las líneas {sucios}")

# 2. Unidades de systemd: usuario propio, socket solo para el proyecto y servicio endurecido.
servicio, enchufe = leer("vz-sql.service"), leer("vz-sql.socket")
for clave in ("User=vz-sql", "Group=vz-sql", "SupplementaryGroups=videojuegoszaragoza", "NoNewPrivileges=yes",
              "ProtectSystem=strict", "ProtectHome=read-only", "ReadWritePaths=/var/log/vz-sql /var/lib/vz-sql",
              "PrivateTmp=yes", "CapabilityBoundingSet=", "MemoryDenyWriteExecute=yes",
              "Environment=VZ_SQL_CONFIG=/etc/videojuegoszaragoza-sql/conexion.env",
              "Environment=VZ_SQL_REPOS=/home/videojuegoszaragoza/apps/videojuegooscom-app:"
              "/home/videojuegoszaragoza/apps/videojuegooscom-wt",
              "ExecStart=/usr/bin/python3 -I /opt/vz-sql/broker.py"):
    comprobar(clave in servicio.splitlines(), f"vz-sql.service sin «{clave}»")
for clave in ("ListenStream=/run/vz-sql/sql.sock", "SocketUser=vz-sql", "SocketGroup=videojuegoszaragoza",
              "SocketMode=0660", "Accept=no"):
    comprobar(clave in enchufe.splitlines(), f"vz-sql.socket sin «{clave}»")

# 3. SQL del rol: acción manual, sin contraseña real, sin borrar nada y con los tres vigilantes.
rol = leer("ACCION_MANUAL__rol_vz_agente_2026-11-27.sql")
sin_comentarios = "\n".join(linea.split("--", 1)[0] for linea in rol.splitlines())
comprobar(re.search(r"^--\s*VZ\s*:\s*ACCION_MANUAL", rol, re.M), "el SQL del rol debe llevar la marca VZ: ACCION_MANUAL")
comprobar("password '__CONTRASENA_DEL_AGENTE__'" in rol and len(re.findall(r"password\s+'", rol)) == 1,
          "el SQL del rol solo debe llevar el marcador de contraseña")
comprobar(rol.count("nosuperuser nocreatedb nocreaterole noreplication nobypassrls noinherit connection limit 3") == 2,
          "atributos del rol al crearlo y al repetir (NOBYPASSRLS, como VeoAura)")
comprobar(not re.search(r"(?<![a-z])bypassrls", sin_comentarios, re.I), "el rol nunca recibe BYPASSRLS")
comprobar(not re.search(r"on all (tables|sequences)", sin_comentarios, re.I),
          "permisos tabla a tabla: nada de «on all tables» ni «on all sequences»")
comprobar(not re.search(r"alter default privileges for role postgres", sin_comentarios, re.I),
          "las tablas nuevas del dueño no reciben permisos solas")
# Las políticas RLS propias van solo a vz_agente.
politicas = re.findall(r"create policy (\w+) on public\.%I for (\w+) to (\w+)", rol)
comprobar(sorted(politicas) == [("vz_agente_actualizar", "update", "vz_agente"),
                                ("vz_agente_insertar", "insert", "vz_agente"),
                                ("vz_agente_leer", "select", "vz_agente")], f"políticas RLS del rol: {politicas}")
listas = {nombre: re.findall(r"'([a-z_]+)'", cuerpo)
          for nombre, cuerpo in re.findall(r"(contenido|lectura) text\[\] := array\[(.*?)\];", rol, re.S)}
comprobar(len(listas.get("contenido", [])) == 14 and len(listas.get("lectura", [])) == 46
          and not set(listas["contenido"]) & set(listas["lectura"]), f"listas de tablas: {listas}")
PRIVADAS = {"escaparate_nonces", "admin_avisos_suscripciones", "cliente_dispositivos", "limites_peticiones",
            "chat_messages", "chat_message_reactions", "product_chat_messages", "blue_ia_mensajes", "customer_notes",
            "personal_cash_state"}
comprobar(not PRIVADAS & set(listas.get("contenido", []) + listas.get("lectura", [])),
          "claves, dispositivos, conversaciones privadas y notas internas fuera de las listas")
CLIENTES = {"pedidos", "pedido_items", "profiles", "perfiles_cliente", "reservas", "sell_requests", "service_requests"}
comprobar(not CLIENTES & set(listas.get("contenido", [])), "los datos de clientes solo se leen, nunca se escriben")
for ajuste in ("statement_timeout = '60s'", "lock_timeout = '5s'", "idle_in_transaction_session_timeout = '60s'"):
    comprobar(f"alter role vz_agente set {ajuste};" in rol, f"el rol debe fijar {ajuste}")
for vigilante, evento in (("vz_bloquear_drop", "ddl_command_start"), ("vz_bloquear_borrado_de_objetos", "sql_drop"),
                          ("vz_proteger_tablas_nuevas", "ddl_command_end")):
    comprobar(re.search(rf"create event trigger {vigilante} on {evento}", rol), f"falta el vigilante {vigilante}")
for linea in sin_comentarios.splitlines():
    if re.search(r"\b(drop|truncate)\s+(table|schema|role|function|owned|database)\b|\bdelete\s+from\b", linea, re.I):
        comprobar(False, f"el SQL del rol no debe borrar nada: {linea.strip()}")
comprobar("execute format('grant select on public.%I to vz_agente', t);" in rol
          and "execute format('grant insert, update on public.%I to vz_agente', t);" in rol,
          "el rol lee sus tablas y solo inserta/actualiza las de contenido")
comprobar("execute format('revoke all on %s from vz_agente', r.tabla);" in rol, "repetible: retira lo anterior")
comprobar(not re.search(r"grant\s+(all|[a-z, ]*\b(delete|truncate|references|trigger)\b)[^;']*to vz_agente",
                        sin_comentarios, re.I), "ningún GRANT de DELETE, TRUNCATE, REFERENCES, TRIGGER ni ALL al agente")
# Los tres vigilantes, idénticos a VeoAura salvo los nombres (comprobado con diff el 2026-11-27).
for cuerpo in ("if (session_user = 'vz_agente' or current_user = 'vz_agente') and tg_tag like 'DROP %' then",
               "where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') and object_type = 'table'",
               "execute format('create trigger vz_sin_delete before delete on %s for each statement '",
               "execute format('create trigger vz_sin_truncate before truncate on %s for each statement '"):
    comprobar(cuerpo in rol, f"vigilantes como VeoAura: falta «{cuerpo}»")
comprobar("grant select, insert on supabase_migrations.schema_migrations to vz_agente;" in rol,
          "registro de migraciones solo lectura y añadir")
comprobar(not re.search(r"\bon schema (auth|storage|extensions|vault)\b[^;]*to vz_agente", sin_comentarios, re.I),
          "nada en auth, storage, extensions ni vault")

# 3b. Dependencias fijadas: nombre==versión, wheel de esa versión para Python 3.12 Linux x86_64 y sha256 completo.
import descargar_dependencias as dd  # noqa: E402
fijadas = dd.leer_requisitos()
comprobar({n for n, *_ in fijadas} == {"pglast", "psycopg", "psycopg-binary", "typing_extensions"},
          f"dependencias fijadas: {[n for n, *_ in fijadas]}")
for nombre, version, archivo, sha in fijadas:
    comprobar(archivo.startswith(f"{nombre.replace('-', '_')}-{version}-") and dd.RUEDA_VALIDA.search(archivo)
              and re.fullmatch(r"[0-9a-f]{64}", sha), f"línea de requisitos mal formada: {nombre}=={version}")

# 4. Plantilla de la conexión sin valores secretos.
for linea in leer("conexion.env.plantilla").splitlines():
    if linea.startswith(("VZ_SQL_HOST=", "VZ_SQL_USUARIO=", "VZ_SQL_CONTRASENA=")):
        comprobar(linea.endswith("="), f"la plantilla no debe llevar valores: {linea.split('=')[0]}")

# 5. Instalador: sintaxis, sin tocar otros proyectos y con las pruebas antes de activar.
instalar = leer("instalar-sql.sh")
comprobar(subprocess.run(["bash", "-n", os.path.join(AQUI, "instalar-sql.sh")]).returncode == 0,
          "instalar-sql.sh con errores de sintaxis")
comprobar(instalar.index("6/8 Pruebas") < instalar.index("systemctl enable --now vz-sql.socket"),
          "las pruebas deben ir antes de activar el socket")
comprobar("rm -rf /" not in instalar and "userdel" not in instalar and "systemctl restart" not in instalar,
          "el instalador no borra usuarios ni reinicia servicios")

# 6. El cliente rechaza formas inválidas sin hablar con el broker.
import cliente  # noqa: E402
for argumentos in (["plan"], ["aplicar", "--sql", "select 1"], ["consultar"], ["estado", "--sql", "select 1"],
                   ["diagnostico-d8", "--archivo", "x.sql"], ["borrar"], ["consultar", "--sql", "x", "--archivo", "y"]):
    with contextlib.redirect_stderr(io.StringIO()):
        try:
            cliente.main(argumentos)
            comprobar(False, f"el cliente debería rechazar {argumentos}")
        except SystemExit as e:
            comprobar(e.code == 2, f"el cliente debería rechazar {argumentos} (salida {e.code})")
comprobar(cliente.SOCKET == "/run/vz-sql/sql.sock" or os.environ.get("VZ_SQL_SOCKET"), "socket del cliente")
comprobar(cliente.ORDENES == ("estado", "diagnostico-d8", "consultar", "plan", "aplicar"), "órdenes del cliente")

print(f"parte 1: {comprobaciones - len(fallos)}/{comprobaciones} comprobaciones correctas")

# 7. Parte 2: pruebas que necesitan pglast (y psycopg / PostgreSQL local para la de integración).
# Sin --lib: la instalada (/opt/vz-sql/lib) o, para probar ANTES de instalar, la copia aislada del proyecto
# (.expo/vzsql-lib, que git ignora; ver INSTALAR.md «Pruebas en un entorno aislado»).
RAIZ_REPO = os.path.dirname(os.path.dirname(AQUI))
candidatas = ([sys.argv[sys.argv.index("--lib") + 1]] if "--lib" in sys.argv else
              [os.environ.get("VZ_SQL_LIB", ""), "/opt/vz-sql/lib", os.path.join(RAIZ_REPO, ".expo", "vzsql-lib")])
lib = next((c for c in candidatas if c and os.path.isdir(os.path.join(c, "pglast"))), candidatas[-1])
hay_pglast = os.path.isdir(os.path.join(lib, "pglast"))
if not hay_pglast:
    print(f"parte 2 OMITIDA: falta pglast en {lib} (se ejecuta en instalar-sql.sh, que se detiene si falla)")
else:
    extra = []  # --pg-bin y --pg-lib pasan a la de integración (PostgreSQL de usar y tirar sin instalar)
    for opcion in ("--pg-bin", "--pg-lib"):
        if opcion in sys.argv:
            extra += [opcion, sys.argv[sys.argv.index(opcion) + 1]]
    for prueba in ("test_clasificador.py", "test_broker.py", "test_integracion_pg.py"):
        r = subprocess.run([sys.executable, os.path.join(AQUI, prueba), "--lib", lib]
                           + (extra if prueba == "test_integracion_pg.py" else []))
        comprobar(r.returncode == 0, f"falla {prueba}")
sys.exit(1 if fallos else 0)
