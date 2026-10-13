#!/usr/bin/env python3
# == VIDEOJUEGOSZARAGOZA =====================================================
# Archivo:  infraestructura/publicacion/controlador.py
#           (se instala como /usr/local/bin/vz-publicar, copia de root, con vz-instalar-claude)
# Función:  Controlador de publicación. Fusiona SOLO las PR seguras en main (= producción).
#           Comprueba, sobre el commit exacto de la PR:
#             1. PR abierta, no borrador, del propio repo, hacia main y sin conflictos.
#             2. Vista previa de Vercel en verde y ningún check de CI en rojo o pendiente.
#             3. No borra ni renombra archivos.
#             4. No toca rutas protegidas (infraestructura, workflows, dependencias,
#                configuración de despliegue).
#             5. Sin secretos en las líneas añadidas.
#             6. Sin SQL destructivo ni cambios de permisos delicados en las migraciones.
#           Si todo pasa, fusiona con --match-head-commit (si la PR cambia entre la revisión y la
#           fusión, GitHub la rechaza). Si algo falla, no fusiona y explica por qué: esa PR la
#           fusiona una persona.
# Uso:      vz-publicar revisar <número>    (solo comprueba)
#           vz-publicar publicar <número>   (comprueba y, si todo pasa, fusiona)
# Registro: ~/registros/vz-publicacion.log
# ============================================================================
import datetime
import json
import os
import re
import subprocess
import sys

REPO = "videojuegooscom/videojuegooscom-app"
RAMA_BASE = "main"
# Nombre del trabajo de .github/workflows/revision.yml que debe estar en verde.
CI_OBLIGATORIO = "revision"
REGISTRO = os.path.join(os.path.expanduser("~"), "registros", "vz-publicacion.log")

# Rutas que nunca se publican solas: cambian las barreras, las dependencias o el despliegue.
RUTAS_PROTEGIDAS = re.compile(
    r"^(infraestructura/|\.github/|\.claude/|\.mcp\.json$|\.npmrc$|package\.json$|package-lock\.json$|"
    r"yarn\.lock$|pnpm-lock\.yaml$|vercel\.json$|app\.json$|app\.config\.|eas\.json$|babel\.config\.|"
    r"metro\.config\.|scripts/|aPI/|api/|sql/)", re.I)

# Los prefijos se escriben con [_] para que el buscador de secretos del instalador no tome
# estos patrones por claves reales (es la misma expresión regular).
SECRETO_RE = re.compile(
    r"(sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github[_]pat[_][A-Za-z0-9_]{20,}|"
    r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|sb[_]secret[_][A-Za-z0-9_-]{10,}|service_role|"
    r"BEGIN [A-Z ]*PRIVATE KEY|SUPABASE_SERVICE_ROLE|OPENAI_API_KEY\s*[:=]\s*['\"][^'\"]{8,})")

SQL_DESTRUCTIVO = re.compile(
    r"\b(drop\s+\w+|truncate\b|delete\s+from\b|alter\s+table\s+[^;]*\bdrop\b|"
    r"disable\s+row\s+level\s+security|no\s+force\s+row\s+level|copy\s+[^;]*\b(program|from|to)\b|"
    r"pg_read_file|pg_ls_dir|lo_import|lo_export|dblink|pg_terminate_backend)", re.I | re.S)
# Cambios de permisos que abren datos o dan privilegios: los revisa una persona.
SQL_PERMISOS_DELICADOS = re.compile(
    r"\b(grant\b|revoke\b|security\s+definer|alter\s+(role|user|default\s+privileges)|"
    r"auth\.(users|identities|sessions|refresh_tokens)|vault\.|cron\.|"
    r"to\s+(anon|public)\b|using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\))", re.I | re.S)


def limpiar_sql(texto):
    texto = re.sub(r"--[^\n]*", " ", texto)
    texto = re.sub(r"/\*.*?\*/", " ", texto, flags=re.S)
    return re.sub(r"'(?:[^']|'')*'", "''", texto)


# ------------------------------------------------------------ comprobaciones puras -----

def revisar_metadatos(pr):
    fallos = []
    if pr.get("state") != "OPEN":
        fallos.append("la PR no está abierta")
    if pr.get("isDraft"):
        fallos.append("la PR es un borrador")
    if pr.get("baseRefName") != RAMA_BASE:
        fallos.append(f"la PR no va hacia {RAMA_BASE}")
    if pr.get("isCrossRepository"):
        fallos.append("la PR viene de otro repositorio")
    if pr.get("mergeable") != "MERGEABLE":
        fallos.append(f"GitHub no la marca como fusionable ({pr.get('mergeable')})")
    if not re.fullmatch(r"[0-9a-f]{40}", str(pr.get("headRefOid", ""))):
        fallos.append("no se conoce el commit exacto de la PR")
    return fallos


def revisar_archivos(archivos):
    fallos = []
    if not archivos:
        fallos.append("la PR no cambia ningún archivo")
    if len(archivos) >= 100:
        fallos.append("la PR cambia 100 archivos o más: la revisa una persona")
    for a in archivos:
        ruta, estado = a.get("filename", ""), a.get("status", "")
        if estado in ("removed", "renamed"):
            fallos.append(f"{'borra' if estado == 'removed' else 'renombra'} {ruta}")
        if RUTAS_PROTEGIDAS.search(ruta) or RUTAS_PROTEGIDAS.search(a.get("previous_filename") or ""):
            fallos.append(f"toca una ruta protegida: {ruta}")
    return fallos


def lineas_anadidas(diff):
    """{archivo: [líneas añadidas]} a partir de un diff unificado."""
    resultado, actual = {}, None
    for linea in diff.splitlines():
        if linea.startswith("+++ "):
            ruta = linea[4:].strip()
            actual = ruta[2:] if ruta.startswith("b/") else ruta
            resultado.setdefault(actual, [])
        elif actual and linea.startswith("+") and not linea.startswith("+++"):
            resultado[actual].append(linea[1:])
    return resultado


def revisar_contenido(diff):
    fallos = []
    for ruta, lineas in lineas_anadidas(diff).items():
        texto = "\n".join(lineas)
        if SECRETO_RE.search(texto):
            fallos.append(f"posible secreto en {ruta}")
        if ruta.lower().endswith(".sql"):
            sql = limpiar_sql(texto)
            if SQL_DESTRUCTIVO.search(sql):
                fallos.append(f"SQL destructivo en {ruta}")
            if SQL_PERMISOS_DELICADOS.search(sql):
                fallos.append(f"SQL con permisos delicados en {ruta} (lo revisa una persona)")
            if not ruta.startswith("supabase/migrations/"):
                fallos.append(f"SQL fuera de supabase/migrations/: {ruta}")
    return fallos


def revisar_checks(estados, check_runs):
    """estados: lista de commit statuses; check_runs: lista de check runs de GitHub Actions."""
    fallos = []
    vercel = [s for s in estados if "vercel" in str(s.get("context", "")).lower()]
    if not vercel:
        fallos.append("no hay vista previa de Vercel para este commit")
    elif any(s.get("state") != "success" for s in vercel):
        fallos.append("la vista previa de Vercel no está en verde")
    for s in estados:
        if s.get("state") in ("failure", "error", "pending") and s not in vercel:
            fallos.append(f"check «{s.get('context')}» en estado {s.get('state')}")
    # La revisión automática de GitHub (.github/workflows/revision.yml) es obligatoria:
    # si aún no ha empezado, tampoco se publica.
    if not any(c.get("name") == CI_OBLIGATORIO for c in check_runs):
        fallos.append(f"falta la revisión automática «{CI_OBLIGATORIO}» (aún no ha empezado o no existe)")
    for c in check_runs:
        if c.get("status") != "completed":
            fallos.append(f"CI «{c.get('name')}» todavía en curso")
        elif c.get("conclusion") not in ("success", "neutral", "skipped"):
            fallos.append(f"CI «{c.get('name')}» terminó en {c.get('conclusion')}")
    return fallos


# ------------------------------------------------------------ acceso a GitHub ------

def gh(*args):
    r = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args[:3])}…: {r.stderr.strip()[:300]}")
    return r.stdout


def datos_pr(numero):
    pr = json.loads(gh("pr", "view", str(numero), "--repo", REPO, "--json",
                       "number,title,state,isDraft,baseRefName,headRefName,headRefOid,mergeable,isCrossRepository"))
    # Una sola página de 100 (gh 2.45 del servidor no tiene --slurp). Una PR con 100 archivos o
    # más no se publica sola: revisar_archivos la rechaza por tamaño.
    archivos = json.loads(gh("api", f"repos/{REPO}/pulls/{numero}/files?per_page=100"))
    sha = pr["headRefOid"]
    estados = json.loads(gh("api", f"repos/{REPO}/commits/{sha}/status")).get("statuses", [])
    runs = json.loads(gh("api", f"repos/{REPO}/commits/{sha}/check-runs")).get("check_runs", [])
    diff = gh("pr", "diff", str(numero), "--repo", REPO)
    return pr, archivos, estados, runs, diff


def registrar(datos):
    try:
        os.makedirs(os.path.dirname(REGISTRO), exist_ok=True)
        fd = os.open(REGISTRO, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        with os.fdopen(fd, "a") as f:
            f.write(json.dumps({"fecha": datetime.datetime.now().isoformat(timespec="seconds"), **datos},
                               ensure_ascii=False) + "\n")
    except OSError:
        pass


def evaluar(numero):
    pr, archivos, estados, runs, diff = datos_pr(numero)
    fallos = (revisar_metadatos(pr) + revisar_archivos(archivos) + revisar_contenido(diff)
              + revisar_checks(estados, runs))
    return pr, fallos


def main(argv):
    if len(argv) != 3 or argv[1] not in ("revisar", "publicar") or not re.fullmatch(r"[0-9]{1,6}", argv[2]):
        print("Uso: vz-publicar revisar|publicar <número de PR>")
        return 2
    orden, numero = argv[1], int(argv[2])
    try:
        pr, fallos = evaluar(numero)
    except Exception as e:  # falla cerrado
        print(f"No se pudo revisar la PR #{numero}: {e}")
        registrar({"pr": numero, "orden": orden, "resultado": "error", "detalle": str(e)[:300]})
        return 1
    titulo = pr.get("title", "")
    if fallos:
        print(f"PR #{numero} «{titulo}»: NO se publica automáticamente.")
        for f in fallos:
            print(f"  - {f}")
        print("La fusiona una persona (o se corrige y se vuelve a intentar).")
        registrar({"pr": numero, "orden": orden, "resultado": "rechazada", "fallos": fallos})
        return 1
    if orden == "revisar":
        print(f"PR #{numero} «{titulo}»: lista para publicar (todas las comprobaciones en verde).")
        registrar({"pr": numero, "orden": orden, "resultado": "apta", "sha": pr["headRefOid"]})
        return 0
    try:
        gh("pr", "merge", str(numero), "--repo", REPO, "--merge", "--match-head-commit", pr["headRefOid"])
    except Exception as e:
        print(f"GitHub rechazó la fusión de la PR #{numero}: {e}")
        registrar({"pr": numero, "orden": orden, "resultado": "error-fusion", "detalle": str(e)[:300]})
        return 1
    print(f"PR #{numero} «{titulo}» fusionada en {RAMA_BASE} (commit {pr['headRefOid'][:7]}). Vercel la publicará.")
    registrar({"pr": numero, "orden": orden, "resultado": "fusionada", "sha": pr["headRefOid"]})
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
