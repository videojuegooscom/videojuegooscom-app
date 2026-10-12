#!/usr/bin/env python3
# == VIDEOJUEGOSZARAGOZA =====================================================
# Archivo:        infraestructura/claude-code/guardian.py
#                 (se instala como hooks/guardian.py de la política con instalar.sh)
# Origen:         adaptado del guardián de VeoAura (copia propia, sin dependencias de aquel).
# Función:        Hook PreToolUse de Claude Code. Para cada herramienta decide:
#                   "deny"  → prohibido siempre (también en modo autónomo).
#                   "allow" → lectura demostrable (comandos de solo lectura, gh api GET, curl de
#                             solo lectura a nuestra web) o, en modo autónomo, una duda que no
#                             es crítica y no choca con ninguna regla deny de la política.
#                   "ask"   → duda, solo fuera del modo autónomo.
#                   nada    → sigue el flujo normal de permisos de la política.
#                 Ante un error o una entrada malformada, deniega (falla cerrado).
# Modo autónomo:  se activa con el archivo «modo-autonomo» junto a la política (un nivel por
#                 encima de hooks/), que debe ser de root y no escribible por otros. En ese modo
#                 las dudas no críticas pasan sin ventana y quedan anotadas como «auto».
# Registro:       ~/.claude/vz-guardian.log (fecha, decisión, regla, herramienta, sesión,
#                 categoría y SHA-256 de la entrada; nunca el contenido).
# Pruebas:        test_guardian.py y test_politica.py (misma carpeta).
# Dependencias:   python3 (biblioteca estándar), git.
# ============================================================================

import datetime
import fnmatch
import glob
import hashlib
import json
import os
import re
import shlex
import subprocess
import sys

PROYECTO = os.path.realpath(os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd())
HOME = os.path.realpath(os.path.expanduser("~"))
UID = os.getuid()
REGISTRO = os.path.join(HOME, ".claude", "vz-guardian.log")
RAMAS_PROTEGIDAS = {"main", "master"}
# Carpeta de la política instalada (…/claude-code): hooks/guardian.py está un nivel por debajo.
DIR_POLITICA = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
MARCA_AUTONOMO = os.path.join(DIR_POLITICA, "modo-autonomo")
POLITICA = os.path.join(DIR_POLITICA, "managed-settings.json")
# Worktrees del proyecto (git worktree add ../videojuegooscom-wt/<rama>).
WORKTREES = os.path.join(os.path.dirname(PROYECTO), "videojuegooscom-wt")
# Webs propias para curl de solo lectura.
HOSTS_PROPIOS = re.compile(
    r"^https://((www\.)?videojuegoszaragoza\.com|videojuegooscom-[a-z0-9-]+-daniels-projects-771407af\.vercel\.app)"
    r"(/[A-Za-z0-9._~/%-]*)?(\?[A-Za-z0-9._~=&%-]*)?$")
MAX_RUTAS_SIN_APROBACION = 5


class Denegar(Exception):
    def __init__(self, regla, motivo):
        super().__init__(motivo)
        self.regla, self.motivo = regla, motivo


PREGUNTAS = []  # (regla, motivo); un deny posterior siempre gana


def deny(regla, motivo):
    raise Denegar(regla, motivo)


def ask(regla, motivo):
    PREGUNTAS.append((regla, motivo))


# ================================================================ rutas =====

def dentro(ruta, base):
    return ruta == base or ruta.startswith(base.rstrip(os.sep) + os.sep)


def ruta_abs(p, cwd):
    p = os.path.expanduser(str(p).strip().strip("'\""))
    if not os.path.isabs(p):
        p = os.path.join(cwd, p)
    return os.path.realpath(p)


ENV_RUTA_RE = re.compile(r"(^|/)\.env(\.[^/]*)?$")
ENV_PLANTILLA_RE = re.compile(r"(^|/)\.env\.(example|sample|template)$")
ENV_TEXTO_RE = re.compile(r"(?<![\w.-])\.env(?:\.([\w.-]+))?(?![\w-])")
PLANTILLAS_ENV = {"example", "sample", "template"}
EXT_SECRETAS = re.compile(r"\.(pem|key|p8|p12|jks|keystore|mobileprovision)$")
DIRS_SECRETOS = [os.path.join(HOME, d) for d in (
    ".ssh", ".aws", ".gnupg", ".config/gh", ".supabase", ".local/share/com.vercel.cli", ".docker")]
ARCHIVOS_SECRETOS = [os.path.join(HOME, f) for f in (
    ".netrc", ".npmrc", ".git-credentials", ".claude/.credentials.json")]
# Configuración del servidor con credenciales (intermediario de base de datos) y de otros proyectos.
DIRS_SECRETOS_SISTEMA = ["/etc/videojuegoszaragoza-sql", "/etc/veoaura", "/etc/veoaura-github",
                         "/etc/veoaura" + "-sql"]
# Otros proyectos del servidor: nunca se leen ni se escriben desde esta sesión.
OTROS_PROYECTOS = ["/home/veoaura", "/home/tradeandoia"]
# Sistema: nunca se escribe ahí desde una sesión (lo instala una persona con sudo).
DIRS_SISTEMA = ["/etc", "/usr/local", "/usr", "/opt", "/boot", "/var/lib", "/root"]


def es_sistema(ruta):
    return any(dentro(ruta, d) for d in DIRS_SISTEMA)


def en_zona_escritura(ruta):
    # Únicas zonas donde se crea, edita o escribe sin preguntar: el repositorio, sus worktrees
    # y los temporales de la sesión. Lo demás pregunta; el sistema se deniega aparte.
    zonas = [PROYECTO, WORKTREES, f"/tmp/claude-{UID}",
             os.path.join(HOME, ".claude", "projects"), os.path.join(HOME, ".claude", "plans")]
    return (any(dentro(ruta, z) for z in zonas) or bool(re.match(r"^/tmp/vz-", ruta))
            or ruta in ("/dev/null", "/dev/stdout", "/dev/stderr", "/dev/tty"))


def es_otro_proyecto(ruta):
    return any(dentro(ruta, d) for d in OTROS_PROYECTOS)


def es_secreto(ruta):
    if ENV_RUTA_RE.search(ruta) and not ENV_PLANTILLA_RE.search(ruta):
        return True
    if EXT_SECRETAS.search(os.path.basename(ruta)):
        return True
    if ruta in ARCHIVOS_SECRETOS or any(dentro(ruta, d) for d in DIRS_SECRETOS):
        return True
    if dentro(ruta, os.path.join(PROYECTO, ".vercel")):
        return True
    if any(dentro(ruta, d) for d in DIRS_SECRETOS_SISTEMA) or es_otro_proyecto(ruta):
        return True
    return bool(re.match(r"^/proc/[^/]+/environ$", ruta)) or ruta in ("/etc/shadow", "/etc/gshadow")


def menciona_env_real(texto):
    return any(m.group(1) not in PLANTILLAS_ENV for m in ENV_TEXTO_RE.finditer(texto or ""))


def es_config_critica(ruta):
    """Configuración cuyo cambio podría desactivar las barreras o ejecutar código sin control:
    se deniega siempre (también en modo autónomo)."""
    claude_home = os.path.join(HOME, ".claude")
    return (
        ruta == os.path.join(PROYECTO, ".mcp.json")
        or (dentro(ruta, PROYECTO) and os.path.basename(ruta) in (".npmrc", ".yarnrc", ".yarnrc.yml", ".pnpmrc"))
        or bool(re.fullmatch(re.escape(os.path.join(PROYECTO, ".claude")) + r"/settings(\.local)?\.json", ruta))
        or dentro(ruta, os.path.join(PROYECTO, ".claude", "hooks"))
        or dentro(ruta, os.path.join(PROYECTO, ".git", "hooks"))
        or ruta == os.path.join(PROYECTO, ".git", "config")
        or bool(re.fullmatch(re.escape(claude_home) + r"/settings(\.local)?\.json", ruta))
        or dentro(ruta, os.path.join(claude_home, "hooks"))
        or ruta in (os.path.join(HOME, ".claude.json"), os.path.join(HOME, ".gitconfig"),
                    os.path.join(HOME, ".npmrc"))
        or dentro(ruta, "/etc/claude-code")
        or dentro(ruta, "/etc/videojuegoszaragoza")
    )


def es_config_protegida(ruta):
    claude_home = os.path.join(HOME, ".claude")
    return (
        ruta == os.path.join(PROYECTO, "CLAUDE.md")
        or ruta == os.path.join(PROYECTO, ".mcp.json")
        # Configuración del gestor de paquetes (registry, scripts): cambiarla requiere aprobación.
        or (dentro(ruta, PROYECTO) and os.path.basename(ruta) in (".npmrc", ".yarnrc", ".yarnrc.yml", ".pnpmrc"))
        or dentro(ruta, os.path.join(PROYECTO, ".claude"))
        or ruta == os.path.join(claude_home, "CLAUDE.md")
        or any(dentro(ruta, os.path.join(claude_home, d))
               for d in ("agents", "skills", "commands", "plugins", "output-styles"))
        or dentro(ruta, os.path.join(PROYECTO, ".git", "hooks"))
        or ruta == os.path.join(PROYECTO, ".git", "config")
        or bool(re.fullmatch(re.escape(os.path.join(HOME, ".claude")) + r"/settings(\.local)?\.json", ruta))
        or dentro(ruta, os.path.join(HOME, ".claude", "hooks"))
        or ruta in (os.path.join(HOME, ".claude.json"), os.path.join(HOME, ".gitconfig"))
        or dentro(ruta, "/etc/claude-code")
        or dentro(ruta, "/etc/videojuegoszaragoza")
        # Fuente de la política, del guardián, de sus baterías, del controlador y del intermediario
        # (en el repo y en cualquier worktree): las baterías se ejecutan sin preguntar, así que
        # cambiarlas es una tarea explícita.
        or bool(re.search(r"/infraestructura/(claude-code|publicacion|base-datos)(/|$)", ruta))
        or bool(re.search(r"/\.github/workflows(/|$)", ruta))
    )


# Zonas del código que afectan a Supabase, la API serverless, la administración o la base de datos.
SENSIBLES = ["lib/supabase.ts", "aPI/", "api/", "app/admin/_layout.tsx", "sql/", "supabase/"]

ZONAS_SEGURAS_RM = [os.path.join(PROYECTO, d) for d in (
    "dist", ".expo", "node_modules", "web-build", ".vercel/output")] + [f"/tmp/claude-{UID}"]


def en_zona_segura(objetivo, cwd):
    # Con comodines o variables solo cuenta la parte fija anterior al primero.
    fijo = re.split(r"[*?\[{$`]", objetivo, maxsplit=1)[0]
    if fijo != objetivo:
        fijo = fijo if fijo.endswith("/") else os.path.dirname(fijo)
        if not fijo:
            return False
    ruta = ruta_abs(fijo, cwd)
    if re.match(r"^/tmp/vz-[^/]+", ruta):
        return True
    return any(dentro(ruta, z) for z in ZONAS_SEGURAS_RM)


def tiene_comodin(texto):
    return bool(re.search(r"[*?\[]", texto))


# ================================================================ git =======

def rama_actual(cwd):
    # symbolic-ref funciona en ramas sin commits; con HEAD separado devuelve "".
    try:
        r = subprocess.run(["git", "-C", cwd, "symbolic-ref", "--short", "-q", "HEAD"],
                           capture_output=True, text=True, timeout=3)
        return r.stdout.strip()
    except Exception:
        return ""


def revisar_git(tokens, cwd):
    i, sub = 1, None
    while i < len(tokens):
        t = tokens[i]
        if t == "-C" and i + 1 < len(tokens):
            cwd = ruta_abs(tokens[i + 1], cwd)
            i += 2
            continue
        if t == "-c" and i + 1 < len(tokens):
            valor = tokens[i + 1].lower()
            if "hookspath" in valor:
                deny("git-hookspath", "Prohibido desactivar o cambiar los hooks de git.")
            if valor.startswith("alias."):
                deny("git-alias", "Prohibido definir alias de git en línea (pueden ejecutar comandos).")
            i += 2
            continue
        if t.startswith("-"):
            i += 1
            continue
        sub = t
        break
    if sub is None:
        return
    args = tokens[i + 1:]
    rama = rama_actual(cwd)
    en_main = rama in RAMAS_PROTEGIDAS

    # Red de git: solo el remoto origin y sin programas remotos ni repositorios alternativos.
    if sub in ("fetch", "pull", "push", "ls-remote"):
        if any(a.split("=", 1)[0] in ("--upload-pack", "--receive-pack", "--exec", "--repo") for a in args):
            deny("git-remoto", "Prohibido indicar programas remotos o repositorios alternativos.")
        remotos = [a for a in args if not a.startswith("-")]
        if remotos and remotos[0] != "origin":
            deny("git-remoto", "Solo se permite operar con el remoto origin.")

    if sub == "push":
        revisar_push(args, rama)
    elif sub == "reset" and "--hard" in args:
        deny("git-reset-hard", "Prohibido git reset --hard.")
    elif sub == "clean" and not any(a in ("-n", "--dry-run") for a in args):
        deny("git-clean", "Prohibido git clean sin --dry-run.")
    elif sub == "rm":
        revisar_git_rm(args, cwd)
    elif sub in ("commit", "rebase", "cherry-pick", "revert", "am") and en_main:
        deny("git-en-main", f"Prohibido git {sub} directamente en {rama}. Crea una rama.")
    elif sub == "merge" and en_main and "--ff-only" not in args:
        deny("git-en-main", "En main solo se permite fusionar con --ff-only.")
    elif sub == "pull" and en_main and "--ff-only" not in args:
        deny("git-en-main", "En main usa: git pull --ff-only origin main.")
    elif sub in ("merge", "rebase") or (sub == "pull" and "--ff-only" not in args):
        ask("git-merge-rebase", f"git {sub} combina o reescribe historial: requiere aprobación.")
    elif sub == "branch" and any(
            a in ("-d", "-D", "--delete", "-m", "-M", "--move", "-c", "-C", "--copy", "-f", "--force")
            or re.match(r"^-[a-zA-Z]*[dDmMfcC]", a) for a in args):
        ask("git-branch-borrar", "Borrar, renombrar o forzar una rama requiere aprobación.")
    elif sub == "stash" and args[:1] and args[0] in ("drop", "clear"):
        ask("git-stash-drop", "Borrar stashes puede eliminar trabajo ajeno.")
    elif sub == "restore" and not (set(args) & {"--staged", "-S"} and not set(args) & {"--worktree", "-W"}):
        ask("git-descartar", "git restore descarta cambios del árbol de trabajo: requiere aprobación.")
    elif sub == "checkout" and ("--" in args or any(
            a in (".", ":/", "-f", "--force", "-B", "-p", "--patch", "--ours", "--theirs") for a in args)):
        ask("git-descartar", "Este git checkout descarta cambios o fuerza una rama: requiere aprobación.")
    elif sub == "switch" and any(
            a in ("-f", "--force", "--discard-changes", "-C", "--force-create") for a in args):
        ask("git-descartar", "Este git switch descarta cambios o sobrescribe una rama: requiere aprobación.")
    elif sub == "mv":
        ask("git-mv", "Renombrar o mover archivos puede romper referencias: requiere aprobación.")
    elif sub == "tag" and any(a in ("-d", "--delete", "-f", "--force") for a in args):
        ask("git-tag", "Borrar o forzar etiquetas requiere aprobación.")
    elif sub == "config":
        texto = " ".join(args).lower()
        if "hookspath" in texto or "credential" in texto or re.search(r"(^|\s)alias\.", texto):
            deny("git-config", "Prohibido tocar core.hooksPath, alias o credenciales de git.")
        if any(a in ("--global", "--system") for a in args) and not any(
                a in ("--get", "--list", "-l", "--get-regexp") for a in args):
            ask("git-config-global", "Cambio de configuración global de git.")
    elif sub in ("filter-branch", "filter-repo", "replace"):
        deny("git-reescritura", "Prohibido reescribir el historial.")
    elif sub == "update-ref" and "-d" in args:
        deny("git-update-ref", "Prohibido borrar referencias.")
    elif sub == "credential":
        deny("secretos", "Prohibido leer credenciales de git.")
    elif sub == "worktree" and args[:1] and args[0] not in ("list", "add"):
        ask("git-worktree", f"git worktree {args[0]} puede borrar o mover trabajo: requiere aprobación.")


def revisar_git_rm(args, cwd):
    # Política de archivos (CLAUDE.md §6): todo git rm pregunta, sea un archivo o muchos.
    recursivo = any(a in ("-r", "-R", "--recursive") or re.match(r"^-[^-]*[rR]", a) for a in args)
    forzado = any(a in ("-f", "--force") or re.match(r"^-[^-]*f", a) for a in args)
    rutas = [a for a in args if not a.startswith("-")]
    amplio = (recursivo or forzado or not rutas or len(rutas) > MAX_RUTAS_SIN_APROBACION
              or any(tiene_comodin(r) or r in (".", "./", ":/", "*") for r in rutas)
              or any(os.path.isdir(ruta_abs(r, cwd)) for r in rutas))
    if amplio:
        ask("git-rm-amplio", "Borrado amplio, recursivo o forzado con git rm: requiere aprobación.")
    ask("git-rm", "Borrar archivos del proyecto requiere aprobación (política de archivos).")


PUSH_PROHIBIDAS = {"--force", "--force-with-lease", "--force-if-includes", "--mirror",
                   "--all", "--branches", "--delete", "--prune", "--no-verify"}


def revisar_push(args, rama):
    posicionales, i = [], 0
    while i < len(args):
        a = args[i]
        if a.startswith("--"):
            if a.split("=", 1)[0] in PUSH_PROHIBIDAS:
                deny("git-push-forzado", f"Prohibido git push {a.split('=', 1)[0]}.")
            if a in ("--repo", "--push-option", "--receive-pack", "--exec"):
                i += 1
        elif a.startswith("-") and len(a) > 1:
            letras = a[1:]
            if "f" in letras:
                deny("git-push-forzado", "Prohibido git push -f.")
            if "d" in letras:
                deny("git-push-borrado", "Prohibido borrar ramas remotas.")
            if letras.endswith("o"):
                i += 1
        else:
            posicionales.append(a)
        i += 1
    refspecs = posicionales[1:]
    if not refspecs:
        if rama in RAMAS_PROTEGIDAS:
            deny("git-push-main", f"Estás en {rama}: prohibido hacer push directo. Usa una rama y una PR.")
        if not rama:
            ask("git-push-rama-desconocida", "No se pudo determinar la rama actual.")
        return
    for r in refspecs:
        if r.startswith("+"):
            deny("git-push-forzado", "Prohibido push forzado con +refspec.")
        if r.startswith(":"):
            deny("git-push-borrado", "Prohibido borrar ramas remotas (:rama).")
        if "*" in r:
            deny("git-push-comodin", "Prohibido push con comodines en el refspec.")
        destino = r.split(":", 1)[1] if ":" in r else r
        if destino in ("HEAD", "@"):
            destino = rama
        if destino.startswith("refs/heads/"):
            destino = destino[len("refs/heads/"):]
        if destino in RAMAS_PROTEGIDAS:
            deny("git-push-main", "Prohibido push directo a main. Usa una rama y una PR.")


# ================================================================ gh ========

def revisar_gh(args, cwd):
    g = args[0] if args else ""
    s = args[1] if len(args) > 1 else ""
    if g in ("pr", "issue", "release") and s in ("create", "edit", "comment", "review"):
        # --body-file solo puede leer archivos del proyecto que no sean secretos (o "-", stdin).
        for k, a in enumerate(args):
            ruta = None
            if a in ("-F", "--body-file") and k + 1 < len(args):
                ruta = args[k + 1]
            elif a.startswith("--body-file="):
                ruta = a.split("=", 1)[1]
            if ruta and ruta != "-":
                abs_r = ruta_abs(ruta, cwd)
                if es_secreto(abs_r) or not dentro(abs_r, PROYECTO):
                    deny("gh-body-file", "--body-file solo puede leer archivos del proyecto que no sean secretos.")
    if g == "pr" and s == "merge":
        deny("gh-pr-merge", "No fusiones PRs con gh: las fusiona el controlador de publicación o una persona.")
    if g == "pr" and s == "review" and any(a in ("--approve", "-a") for a in args):
        deny("gh-pr-aprobar", "No apruebes PRs.")
    if g == "repo" and s in ("delete", "archive", "rename", "edit", "sync"):
        deny("gh-repo", f"Prohibido gh repo {s}.")
    if g in ("secret", "variable") and s not in ("list", "ls"):
        deny("gh-secretos", "Prohibido cambiar secretos o variables de GitHub.")
    if g == "auth" and (s == "token" or "--show-token" in args or "-t" in args):
        deny("secretos", "Prohibido mostrar tokens de GitHub.")
    if g == "release" and s.startswith("delete"):
        deny("gh-release", "Prohibido borrar releases.")
    if g == "ruleset" and s not in ("list", "view", "check"):
        deny("gh-proteccion", "Prohibido cambiar reglas de protección de ramas.")
    if g == "api":
        texto = " ".join(args)
        m = re.search(r"(?:-X\s*|--method[=\s]+)([A-Za-z]+)", texto)
        metodo = m.group(1).upper() if m else ""
        if metodo in ("DELETE", "PUT", "PATCH"):
            deny("gh-api-escritura", f"Prohibido gh api con {metodo}.")
        if re.search(r"/merges?\b|/pulls/\d+/merge|/git/refs|/branches/[^ ]*/protection|/collaborators|"
                     r"/actions/secrets|/hooks\b|/keys\b|/deployments", texto):
            if metodo != "GET" and (metodo or re.search(r"(^|\s)(-f|-F|--field|--raw-field|--input)(\s|=)", texto)):
                deny("gh-api-escritura", "Prohibido gh api que fusiona, cambia refs, protección, claves o despliegues.")
        if metodo == "POST" or re.search(r"(^|\s)(-f|-F|--field|--raw-field|--input)(\s|=)", texto):
            ask("gh-api-post", "gh api con escritura (POST).")
    if g == "workflow" and s in ("run", "enable", "disable"):
        ask("gh-workflow", f"gh workflow {s}.")


# ======================================================== dependencias ======

# Principio operativo: añadir una dependencia NORMAL del registro de npm es trabajo normal y no
# pregunta; el guardián es la barrera semántica. Solo pasa si TODOS los paquetes son nombres del
# registro (con o sin @scope) con versión, rango semver o etiqueta opcionales, y TODAS las opciones
# son inocuas. Cualquier otro origen (URL, git, github:, file:, rutas, tarballs, alias npm:) u
# opción (--force, --legacy-peer-deps, --ignore-scripts, --registry…) pregunta.
PAQUETE_REGISTRO_RE = re.compile(
    r"^(@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*"   # nombre, con @scope opcional
    r"(@[A-Za-z0-9.^~<>=*_+-]+)?$")                       # versión, rango semver o etiqueta
EXT_TARBALL = (".tgz", ".tar", ".tar.gz", ".tar.bz2", ".zip")
OPCIONES_INSTALACION_SEGURAS = {
    "--save", "-S", "--save-prod", "-P", "--save-dev", "-D", "--save-exact", "-E", "--save-optional", "-O",
    "--save-peer", "--no-save", "--no-audit", "--no-fund", "--prefer-offline", "--prefix",
}
# Opciones de npm que llevan el valor en el token siguiente (para no confundirlo con un paquete).
NPM_OPCIONES_CON_VALOR = {"--prefix", "-C", "--registry", "--userconfig", "--globalconfig", "--cache",
                          "--workspace", "-w", "--tag", "--omit", "--include", "--location",
                          "--install-strategy"}


def partir_npm(args):
    """Separa posicionales y opciones de npm; las opciones con valor aparte se unen como «--x=valor»."""
    pos, opciones = [], []
    k = 0
    while k < len(args):
        a = args[k]
        if a in NPM_OPCIONES_CON_VALOR and k + 1 < len(args):
            opciones.append(f"{a}={args[k + 1]}")
            k += 2
            continue
        (opciones if a.startswith("-") else pos).append(a)
        k += 1
    return pos, opciones


def revisar_instalacion(paquetes, opciones, cwd, que):
    """npm install / npx expo install: automático solo para paquetes normales del registro."""
    for o in opciones:
        nombre, _, valor = o.partition("=")
        if nombre not in OPCIONES_INSTALACION_SEGURAS:
            ask("deps-opcion", f"{que} con la opción {nombre}: solo pasan sin aprobación las opciones "
                               "normales (--save-dev, --save-exact…); force, peer deps, scripts o registry no.")
        if nombre == "--prefix" and not dentro(ruta_abs(valor or ".", cwd), PROYECTO):
            ask("deps-opcion", f"{que} fuera del proyecto.")
    for p in paquetes:
        if not PAQUETE_REGISTRO_RE.match(p) or p.lower().endswith(EXT_TARBALL):
            ask("deps-origen", f"{que} de «{p}»: solo pasan sin aprobación los paquetes normales del registro "
                               "de npm (no URLs, git, github:, file:, rutas locales, tarballs ni alias).")


def revisar_npm(tokens, cwd):
    args = tokens[1:]
    pos, opciones = partir_npm(args)
    sub = pos[0] if pos else ""
    if sub in ("config", "c") and pos[1:2] and pos[1] in ("set", "delete", "edit", "fix", "rm") \
            or sub == "set":
        ask("npm-config", "Cambiar la configuración de npm requiere aprobación.")
    if any(a.lower() in ("--no-ignore-scripts", "--ignore-scripts=false", "--ignore-scripts=0")
           or (a.lower().startswith("--dangerously-allow-all-scripts") and not a.lower().endswith("=false"))
           or a.lower().startswith("--allow-scripts") for a in args):
        deny("npm-scripts", "Prohibido reactivar o ampliar los scripts de instalación de npm.")
    if sub in ("approve-scripts", "deny-scripts"):
        ask("npm-politica-scripts", f"npm {sub} cambia la política allowScripts de package.json: requiere aprobación.")
    if sub == "audit" and "fix" in pos:
        if "--force" in args:
            deny("npm-audit-force", "Prohibido npm audit fix --force.")
        ask("npm-audit-fix", "npm audit fix cambia dependencias: requiere una razón concreta.")
    if sub in ("rebuild", "rb"):
        ask("npm-rebuild", "npm rebuild intenta ejecutar scripts de paquetes: requiere revisión humana "
                           "(el worker usa --ignore-scripts y no los reactiva).")
    if sub in ("explore", "install-test", "it"):
        ask("npm-scripts", f"npm {sub} ejecuta código de paquetes: requiere aprobación.")
    if sub in ("update", "up", "upgrade", "udpate"):
        deny("deps-masivas", "Prohibidas las actualizaciones masivas de dependencias.")
    if sub in ("install", "i", "in", "add", "isntall"):
        if any(a in ("-g", "--global") or a.startswith("--location=global") or a == "--location=global"
               for a in opciones):
            deny("npm-global", "Prohibido instalar paquetes globales.")
        revisar_instalacion(pos[1:], opciones, cwd, f"npm {sub}")
    if sub in ("uninstall", "remove", "rm", "un", "r"):
        ask("deps-cambio", "Eliminar dependencias requiere una razón concreta.")
    if sub in ("publish", "unpublish", "deprecate", "owner", "token", "adduser", "login"):
        deny("npm-registro", f"Prohibido npm {sub}.")
    if sub in ("exec", "x"):
        revisar_segmento(tokens[tokens.index(sub) + 1:], cwd)


def revisar_gestor_alternativo(tokens, cwd):
    t0 = os.path.basename(tokens[0])
    pos = [a for a in tokens[1:] if not a.startswith("-")]
    sub = pos[0] if pos else ""
    if sub in ("upgrade", "upgrade-interactive", "up", "update"):
        deny("deps-masivas", f"Prohibido {t0} {sub}.")
    if sub in ("add", "remove"):
        ask("deps-cambio", "Cambio de dependencias: requiere una razón concreta.")
    if sub == "dlx" and len(pos) > 1:
        revisar_segmento(tokens[tokens.index("dlx") + 1:], cwd)


def revisar_expo(args, cwd):
    pos = [a for a in args if not a.startswith("-")]
    sub = pos[0] if pos else ""
    if sub == "install":
        if "--fix" in args:
            deny("deps-masivas", "Prohibido expo install --fix (actualización masiva).")
        # Lo que va tras «--» lo recibe npm tal cual: mismas reglas que npm install.
        corte = args.index("--") if "--" in args else len(args)
        propios, para_npm = args[:corte], args[corte + 1:]
        paquetes = [a for a in propios if not a.startswith("-")][1:]
        opciones = [a for a in propios if a.startswith("-") and a not in ("--npm", "--check")]
        pos_npm, opc_npm = partir_npm(para_npm)
        revisar_instalacion(paquetes + pos_npm, opciones + opc_npm, cwd, "expo install")
    if sub == "upgrade":
        deny("deps-masivas", "Prohibido expo upgrade.")


# ===================================================== producción CLI =======

def revisar_vercel(args):
    texto = " ".join(args)
    if re.search(r"--prod\b|--production\b|--target[=\s]+production", texto):
        deny("vercel-produccion", "Prohibido desplegar a producción en Vercel.")
    pos = [a for a in args if not a.startswith("-")]
    ayuda = any(a in ("--help", "-h", "--version", "-v") for a in args)
    sub = pos[0] if pos else ("" if ayuda else "deploy")
    s2 = pos[1] if len(pos) > 1 else ""
    if sub in ("", "ls", "list", "inspect", "logs", "whoami", "help", "build", "dev", "teams", "switch"):
        return
    if sub in ("env", "pull"):
        if sub == "env" and s2 in ("ls", "list"):
            return
        deny("vercel-env", "Prohibido descargar o cambiar variables de entorno de Vercel.")
    if sub in ("domains", "dns", "certs", "alias", "project", "projects") and s2 in ("ls", "list", "inspect", ""):
        return
    if sub in ("promote", "rollback", "remove", "rm", "redeploy", "domains", "dns", "certs",
               "alias", "project", "projects", "integration", "blob", "git", "firewall"):
        deny("vercel-produccion", f"Prohibido «vercel {sub}» desde el agente: cambia producción.")
    ask("vercel-deploy", "Despliegue en Vercel (preview): requiere aprobación.")


def revisar_supabase_cli(args):
    pos = [a for a in args if not a.startswith("-")]
    s0 = pos[0] if pos else ""
    s1 = pos[1] if len(pos) > 1 else ""
    lectura = {("migration", "new"), ("migration", "list"), ("functions", "serve"),
               ("functions", "list"), ("functions", "new"), ("projects", "list"),
               ("secrets", "list"), ("db", "diff"), ("db", "lint")}
    # Claude solo cambia el Supabase real mediante el intermediario vz-sql; nunca con la CLI enlazada.
    if s0 == "link" or (s0 == "db" and s1 not in ("diff", "lint")) or "--linked" in args \
            or any(a.startswith(("--db-url", "--project-ref")) for a in args):
        deny("supabase-enlazada", "Prohibido usar la Supabase CLI contra el proyecto real: usa vz-sql.")
    if s0 in ("", "status", "start", "init", "help", "gen", "inspect") or (s0, s1) in lectura:
        return
    if s0 == "stop":
        if "--no-backup" in args:
            ask("supabase-local", "supabase stop --no-backup borra datos locales.")
        return
    if (s0 == "db" and s1 in ("push", "reset")) or (s0 == "migration" and s1 in ("up", "down", "repair", "squash")):
        deny("supabase-produccion", f"Prohibido supabase {s0} {s1}.")
    if s0 == "secrets" or s1 in ("delete", "rm", "remove") or (s0 == "storage" and s1 in ("rm", "mv", "cp")):
        deny("supabase-produccion", f"Prohibido supabase {s0} {s1}.")
    ask("supabase-cli", f"«supabase {' '.join(pos[:2])}» requiere aprobación.")


def revisar_psql(tokens):
    # Nada de clientes PostgreSQL contra servidores remotos; solo vz-sql. Se permite
    # un PostgreSQL local por socket Unix (pruebas de integración).
    args = tokens[1:]
    texto = " ".join(args)
    remoto = bool(re.search(r"supabase\.(co|com)|pooler\.supabase|postgres(ql)?://|\bPGHOST\b|\bhostaddr\s*=", texto))
    for k, a in enumerate(args):
        valor = None
        if a in ("-h", "--host") and k + 1 < len(args):
            valor = args[k + 1]
        elif a.startswith("--host="):
            valor = a.split("=", 1)[1]
        elif a.startswith("-h") and len(a) > 2:
            valor = a[2:]
        else:
            m = re.search(r"\bhost\s*=\s*(\S+)", a)
            valor = m.group(1) if m else None
        if valor is not None and not valor.startswith("/") and valor not in ("localhost", "127.0.0.1", "::1"):
            remoto = True
    if remoto:
        deny("bd-remota", "Prohibido conectar a una base de datos remota con psql/pg_dump/pgcli: usa vz-sql.")


def revisar_stripe_cli(args):
    if "--live" in args or any(a in ("delete", "rm") for a in args):
        deny("stripe", "Prohibido operar sobre Stripe en vivo o borrar recursos.")
    pos = [a for a in args if not a.startswith("-")]
    if not pos or pos[0] in ("help", "version", "completion"):
        return
    ask("stripe", "Comando de Stripe CLI: requiere aprobación explícita.")


HOSTS_PROD = re.compile(r"api\.stripe\.com|api\.vercel\.com|\.supabase\.(co|com)\b|api\.supabase\.com", re.I)
ESCRITURA_HTTP = re.compile(
    r"(-X\s*|--request[=\s]+|--method[=\s]+)(POST|PUT|PATCH|DELETE)|"
    r"(^|\s)(-d|--data\S*|-F|--form|--json|-T|--upload-file)(\s|=|$)", re.I)


# ================================================================ SQL =======

SQL_PROHIBIDO = re.compile(
    r"\b(drop\s+(table|schema|database|column|policy|function|trigger|view|materialized|index|"
    r"extension|role|type|sequence|publication|owned)|truncate\b|delete\s+from\b|"
    r"alter\s+table\s+[^;]*\bdrop\b|disable\s+row\s+level\s+security|no\s+force\s+row\s+level|"
    r"copy\s+[^;]*\b(program|from\s+'/|to\s+'/)|pg_read_file|pg_read_binary_file|pg_ls_dir|"
    r"lo_import|lo_export|dblink|pg_terminate_backend|storage\.(objects|buckets)[^;]*\bdelete\b|"
    r"delete\s+[^;]*storage\.(objects|buckets))", re.I | re.S)
SQL_SEGURIDAD = re.compile(
    r"\b((create|alter|drop)\s+policy|(enable|disable|force)\s+row\s+level\s+security|grant\b|"
    r"revoke\b|security\s+definer|auth\.(users|identities|sessions|refresh_tokens)|vault\.|"
    r"cron\.(schedule|unschedule|alter_job)|alter\s+(role|user|default\s+privileges))", re.I)
SQL_ESCRITURA = re.compile(
    r"\b(insert|update|delete|upsert|merge|create|alter|drop|truncate|grant|revoke|comment|copy|"
    r"call|do|refresh|reindex|vacuum|cluster|lock|listen|notify|prepare|execute|set|reset|"
    r"discard|security|into|nextval|setval|set_config)\b", re.I)
SQL_INICIO_LECTURA = re.compile(r"^\s*(select|with|show|values|table|explain(?!\s+[^;]*\banalyze\b))\b", re.I)
SQL_FUNCIONES_SEGURAS = {
    "count", "sum", "avg", "min", "max", "coalesce", "nullif", "greatest", "least", "lower", "upper",
    "length", "trim", "substring", "replace", "concat", "round", "abs", "floor", "ceil", "now",
    "date_trunc", "extract", "to_char", "to_date", "age", "cast", "array_agg", "string_agg",
    "json_agg", "jsonb_agg", "json_build_object", "jsonb_build_object", "jsonb_array_length",
    "row_number", "rank", "dense_rank", "lag", "lead", "in", "exists", "any", "all", "values",
    "over", "filter", "within", "pg_size_pretty", "pg_total_relation_size", "current_date",
    "current_setting", "has_table_privilege", "format_type", "obj_description", "col_description",
    "pg_get_functiondef", "pg_get_viewdef", "pg_get_constraintdef", "pg_get_indexdef", "unnest",
    "pg_get_function_identity_arguments", "pg_get_function_arguments", "pg_get_function_result",
    "pg_get_triggerdef", "pg_get_expr", "pg_get_userbyid", "pg_relation_size", "pg_table_size",
    "pg_indexes_size", "to_regclass", "quote_ident", "array_to_string", "regexp_replace", "split_part",
    "left", "right", "position", "starts_with", "jsonb_pretty", "jsonb_object_keys", "date_part",
    "generate_series", "distinct", "on", "as", "from", "where", "and", "or", "not", "using", "case",
}


def limpiar_sql(q):
    q = re.sub(r"--[^\n]*", " ", q)
    q = re.sub(r"/\*.*?\*/", " ", q, flags=re.S)
    return re.sub(r"'(?:[^']|'')*'", "''", q)  # literales fuera: no cuentan como palabras clave


def clasificar_sql(query, origen, es_migracion=False):
    if not isinstance(query, str) or not limpiar_sql(query).strip(" ;\n\t"):
        deny("mcp-entrada-invalida", f"{origen}: SQL ausente, vacío o con formato no reconocido.")
    q = limpiar_sql(query)
    if SQL_PROHIBIDO.search(q):
        deny("supabase-borrado", f"{origen}: prohibido borrar tablas, columnas, datos o buckets, "
                                 "desactivar RLS o acceder al servidor.")
    if SQL_SEGURIDAD.search(q):
        ask("supabase-seguridad", f"{origen}: cambia RLS, permisos, Auth, Vault o pg_cron. Requiere aprobación explícita.")
    if es_migracion:
        ask("supabase-escritura", f"{origen}: cambio en la base de datos de producción. Requiere aprobación.")
        return
    sentencias = [s for s in q.split(";") if s.strip()]
    for s in sentencias:
        if not SQL_INICIO_LECTURA.match(s) or SQL_ESCRITURA.search(s):
            ask("supabase-escritura", f"{origen}: no es una consulta de solo lectura demostrable. Requiere aprobación.")
            return
        for llamada in re.findall(r"([A-Za-z_][\w.]*)\s*\(", s):
            if llamada.lower() not in SQL_FUNCIONES_SEGURAS:
                ask("supabase-funcion", f"{origen}: llama a una función ({llamada}) que podría modificar datos. "
                                        "Requiere aprobación.")
                return


# ================================================================ Bash ======

ENVOLTORIOS = {"command", "builtin", "nohup", "time", "exec", "nice", "ionice", "stdbuf", "xargs"}
SHELLS = {"bash", "sh", "zsh", "dash", "ksh", "fish"}
INTERPRETE_RE = re.compile(r"^(python[0-9.]*|node|nodejs|perl|ruby|php|deno|bun|lua|Rscript)$")
FLAGS_CODIGO = {"-c", "-e", "--eval", "-p", "--print", "-E", "-r", "eval"}
PRIMITIVAS_RE = re.compile(
    r"subprocess|os\.system|os\.popen|os\.exec|os\.spawn|pty\.spawn|child_process|execSync|spawnSync|"
    r"execFile|\bexec\s*\(|\bspawn\s*\(|\beval\s*\(|Function\s*\(|base64|b64decode|atob\s*\(|"
    r"__import__|importlib|shutil\.|os\.remove|os\.unlink|os\.rename|unlinkSync|rmSync|rmdirSync|"
    r"renameSync|writeFile|appendFile|createWriteStream|open\s*\([^)]*['\"][wax+]|Deno\.(run|Command|"
    r"remove|writeTextFile)|`[^`]*`|system\s*\(|qx|urllib|requests\.|http\.client|socket|fetch\s*\(|"
    r"XMLHttpRequest|https?\.request|net\.connect", re.I)
HERRAMIENTAS_RED = {"curl", "wget", "aria2c", "nc", "ncat", "netcat", "socat", "telnet", "ssh", "scp", "sftp",
                    "ftp", "rsync", "http", "https", "xh", "httpie"}
SOLO_LECTURA = {"cat", "less", "more", "head", "tail", "grep", "egrep", "fgrep", "rg", "ls", "stat",
                "wc", "file", "diff", "cmp", "md5sum", "sha256sum", "realpath", "readlink", "test", "["}
GIT_LECTURA = {"diff", "log", "show", "status", "blame", "ls-files", "check-ignore", "grep", "add"}
NUNCA = {"dd", "shred", "wipefs", "fdisk", "sfdisk", "parted", "mkswap", "shutdown", "reboot",
         "poweroff", "halt", "telinit", "sudo", "su", "doas", "pkexec", "useradd", "userdel",
         "usermod", "passwd", "chpasswd", "visudo", "iptables", "nft", "ufw"}
PROTEGIDO_RE = re.compile(
    r"(\.claude/(settings[^/\s]*\.json|hooks|agents|skills|commands|plugins|output-styles)|CLAUDE\.md|"
    r"\.mcp\.json|\.git/hooks|\.git/config|/etc/claude-code|/etc/videojuegoszaragoza|/etc/veoaura|"
    r"managed-settings|managed-mcp|\.claude\.json|\.gitconfig|"
    r"infraestructura/(claude-code|publicacion|base-datos)|\.github/workflows|\.npmrc|\.yarnrc|\.pnpmrc|"
    r"modo-autonomo)")

PROTEGIDO_CRITICO_RE = re.compile(
    r"(\.claude/(settings[^/\s]*\.json|hooks)|\.mcp\.json|\.git/hooks|\.git/config|/etc/claude-code|"
    r"/etc/videojuegoszaragoza|/etc/veoaura|managed-settings|managed-mcp|\.claude\.json|\.gitconfig|"
    r"\.npmrc|\.yarnrc|\.pnpmrc|modo-autonomo)")

# Scripts de validación del repositorio que se ejecutan sin preguntar, SOLO así, exactamente:
# «python3 <ruta>» desde la raíz del proyecto, sin opciones ni argumentos y sin enlaces simbólicos.
# Mencionan .env y rutas protegidas porque las prueban; su carpeta está protegida
# (es_config_protegida), así que su contenido solo cambia en una tarea explícita.
SCRIPTS_VALIDACION = ("infraestructura/claude-code/test_guardian.py",
                      "infraestructura/claude-code/test_politica.py",
                      "infraestructura/publicacion/test_controlador.py",
                      "infraestructura/base-datos/test_vz_sql.py")
COMANDOS_VALIDACION = {f"python3 {s}" for s in SCRIPTS_VALIDACION}

# Controlador de publicación: única vía para fusionar PRs (nunca gh pr merge). Forma exacta.
CONTROLADOR = "infraestructura/publicacion/controlador.py"
CONTROLADOR_RE = re.compile(r"^python3 infraestructura/publicacion/controlador\.py (revisar|publicar) [0-9]{1,6}$")

# ============================================================== cliente vz-sql =====
# Única vía de Claude para CAMBIAR el Supabase real (la lectura va por MCP). Forma exacta, sin
# expansiones ni compuestos; el intermediario repite todas las comprobaciones.
CLIENTE_SQL = "/usr/local/bin/vz-sql"
MARCA_ACCION_MANUAL_RE = re.compile(r"--\s*VZ\s*:\s*ACCION_MANUAL", re.I)
OPS_SQL = {"estado", "consultar", "plan", "aplicar"}
INTENTO_SQL_RE = re.compile(r"(^|[;&|(`]\s*|=\S*\s+)(\S*/)?vz-sql(\s|$)")


def revisar_cliente_sql(comando, cwd):
    """True si es una llamada válida a vz-sql; deniega cualquier otra forma de invocarlo."""
    texto = comando.strip()
    if not INTENTO_SQL_RE.search(texto):
        return False
    if not texto.startswith(CLIENTE_SQL + " "):
        deny("sql-forma", f"Invoca el cliente solo como «{CLIENTE_SQL} <orden> …», sin prefijos, variables ni "
                          "rutas alternativas.")
    if "$" in texto or "`" in texto or "\n" in texto or "\\" in texto:
        deny("sql-expansion", "La llamada a vz-sql no admite $, `, \\ ni saltos de línea.")
    try:
        lex = shlex.shlex(texto, posix=True, punctuation_chars=";&|<>()")
        lex.whitespace_split = True
        tokens = list(lex)
    except ValueError:
        deny("sql-forma", "Comillas sin cerrar en la llamada a vz-sql.")
    if any(t and set(t) <= set(";&|<>()") for t in tokens):
        deny("sql-forma", "La llamada a vz-sql debe ir sola: sin ;, &&, |, redirecciones ni subshells.")
    if len(tokens) < 2 or tokens[1] not in OPS_SQL:
        deny("sql-orden", "Orden de vz-sql no permitida.")
    orden, resto, opciones, k = tokens[1], tokens[2:], {}, 0
    while k < len(resto):
        if resto[k] == "--json":
            opciones["--json"] = True
            k += 1
        elif resto[k] in ("--archivo", "--sql") and k + 1 < len(resto) and resto[k] not in opciones:
            opciones[resto[k]] = resto[k + 1]
            k += 2
        else:
            deny("sql-forma", f"Opción no reconocida en vz-sql: {resto[k]}")
    if orden == "estado" and ({"--archivo", "--sql"} & set(opciones)):
        deny("sql-forma", f"vz-sql {orden} no admite --archivo ni --sql.")
    if orden in ("plan", "aplicar") and ("--sql" in opciones or "--archivo" not in opciones):
        deny("sql-d6", f"vz-sql {orden} solo acepta --archivo con un .sql versionado en supabase/migrations/.")
    if orden == "consultar" and len({"--archivo", "--sql"} & set(opciones)) != 1:
        deny("sql-forma", "vz-sql consultar necesita exactamente --sql o --archivo.")
    if "--sql" in opciones:
        if MARCA_ACCION_MANUAL_RE.search(opciones["--sql"]):
            deny("accion-manual", "Ese SQL lleva la marca VZ: ACCION_MANUAL: nunca se ejecuta automáticamente.")
        clasificar_sql(opciones["--sql"], "vz-sql consultar")
    if "--archivo" in opciones:
        ruta = ruta_abs(opciones["--archivo"], cwd)
        if os.path.basename(opciones["--archivo"]).upper().startswith("ACCION_MANUAL__") \
                or os.path.basename(ruta).upper().startswith("ACCION_MANUAL__"):
            deny("accion-manual", "Los archivos ACCION_MANUAL__ nunca se ejecutan automáticamente.")
        if not ruta.endswith(".sql") or es_secreto(ruta) or not en_zona_lectura(ruta):
            deny("sql-archivo", "vz-sql solo acepta archivos .sql del repositorio o de sus worktrees.")
        try:
            with open(ruta, encoding="utf-8", errors="ignore") as f:
                contenido = f.read(512 * 1024)
        except OSError:
            contenido = ""
        if MARCA_ACCION_MANUAL_RE.search(contenido):
            deny("accion-manual", "El archivo lleva la marca VZ: ACCION_MANUAL: nunca se ejecuta automáticamente.")
        if orden == "aplicar" and SQL_PROHIBIDO.search(limpiar_sql(contenido)):
            deny("supabase-borrado", "El archivo contiene operaciones destructivas: crea un ACCION_MANUAL__ en su lugar.")
        if orden == "consultar" and contenido:
            clasificar_sql(contenido, "vz-sql consultar")
    return True


def es_script_validacion(t0, args, cwd):
    if t0 != "python3" or len(args) != 1:
        return False
    for rel in SCRIPTS_VALIDACION:
        esperado = os.path.join(PROYECTO, rel)
        if args[0] == rel and os.path.realpath(cwd) == PROYECTO and os.path.isfile(esperado) \
                and not os.path.islink(esperado) and ruta_abs(args[0], cwd) == os.path.realpath(esperado):
            return True
    return False

SYSTEMCTL_LECTURA = {"status", "show", "cat", "is-active", "is-enabled", "is-failed", "is-system-running",
                     "list-units", "list-unit-files", "list-timers", "list-sockets", "list-dependencies",
                     "help"}
FIND_EXEC_LECTURA = {"grep", "egrep", "fgrep", "rg", "cat", "head", "tail", "wc", "ls", "stat", "file",
                     "sha256sum", "md5sum", "basename", "dirname", "realpath", "echo", "printf", "du", "test"}

# Opciones cuyo valor es texto libre (mensaje, título, cuerpo), por comando.
TEXTO_LIBRE_GIT = {"commit": {"-m", "--message"}, "tag": {"-m", "--message"},
                   "notes": {"-m", "--message"}, "stash": {"-m", "--message"}}
TEXTO_LIBRE_GH = {"-t", "--title", "-b", "--body"}


def quitar_textos_libres(t0, args):
    """Quita de los argumentos los valores de texto libre: el mensaje de git commit/tag/notes/
    stash y el título o cuerpo de gh pr|issue create|edit|comment. Mencionar una ruta protegida
    en un mensaje no es escribir en ella. Todo lo demás se conserva y se revisa: rutas como
    -F/--file/--body-file, pathspecs y redirecciones. Si no aplica, devuelve la misma lista."""
    if t0 == "git":
        sub = next((a for a in args if not a.startswith("-")), "")
        opciones = TEXTO_LIBRE_GIT.get(sub)
        cortas = True
    elif t0 == "gh" and len(args) > 1 and args[0] in ("pr", "issue") and args[1] in ("create", "edit", "comment"):
        opciones, cortas = TEXTO_LIBRE_GH, False
    else:
        opciones = None
    if not opciones:
        return args
    salida, i = [], 0
    while i < len(args):
        a = args[i]
        if a in opciones:
            i += 2
            continue
        if a.startswith("--") and "=" in a and a.split("=", 1)[0] in opciones:
            i += 1
            continue
        if cortas and re.fullmatch(r"-[a-zA-Z]*m", a):  # -m texto, -am texto
            i += 2
            continue
        if cortas and re.match(r"^-[a-zA-Z]*m.", a) and not a.startswith("--"):  # -mtexto
            i += 1
            continue
        salida.append(a)
        i += 1
    return salida


def _redirecciones(seg):
    """(operador, destino) de cada redirección de salida SIN comillas del segmento original:
    «> f», «>f», «2>> f», «&> f», «>| f». Un «>» entre comillas (p. ej. grep '>') no cuenta."""
    salida, i, comilla = [], 0, None
    while i < len(seg):
        c = seg[i]
        if comilla:
            if c == "\\" and comilla == '"':
                i += 1
            elif c == comilla:
                comilla = None
        elif c in "'\"":
            comilla = c
        elif c == "\\":
            i += 1
        elif c == ">":
            op = ">>" if seg.startswith(">>", i) else ">"
            i += len(op)
            if seg.startswith("|", i):
                i += 1
            if seg.startswith("&", i):  # >&2: duplica un descriptor, no escribe en un archivo
                i += 1
                continue
            while i < len(seg) and seg[i] in " \t":
                i += 1
            j = i
            while j < len(seg) and seg[j] not in " \t;&|<>":
                j += 1
            destino = seg[i:j].strip("'\"")
            if destino:
                salida.append((op, destino))
            i = j
            continue
        i += 1
    return salida


def redirecciones_truncan(seg, cwd):
    return [ruta_abs(d, cwd) for op, d in _redirecciones(seg) if op == ">"]


ESCRITORES_TODOS = {"tee", "touch", "mkdir", "rmdir", "rm", "unlink", "truncate", "chmod", "chown", "chgrp",
                    "mv", "patch", "setfacl", "chattr"}
ESCRITORES_DESTINO = {"cp", "install", "ln", "rsync", "scp"}


def destinos_de_escritura(t0, args, seg, cwd):
    """Rutas en las que el comando escribiría: redirecciones de salida y argumentos de comandos
    que crean, cambian o borran archivos. Para cp/install/ln/rsync solo cuenta el destino."""
    redir = _redirecciones(seg)
    destinos = [d for _, d in redir]
    quitar = {d for _, d in redir}
    posicionales = [a for a in args if not a.startswith("-") and not a.startswith(">")
                    and not re.match(r"^\d*>", a) and a not in quitar]
    if t0 in ESCRITORES_TODOS or (t0 == "sed" and any(a.startswith("-i") or a == "--in-place" for a in args)):
        destinos += posicionales
    elif t0 in ESCRITORES_DESTINO:
        objetivo = next((args[k + 1] for k, a in enumerate(args)
                         if a in ("-t", "--target-directory") and k + 1 < len(args)), None)
        objetivo = objetivo or next((a.split("=", 1)[1] for a in args if a.startswith("--target-directory=")), None)
        destinos += [objetivo] if objetivo else posicionales[-1:]
    elif t0 == "dd":
        destinos += [a[3:] for a in args if a.startswith("of=")]
    elif t0 in ("curl", "wget"):
        destinos += [args[k + 1] for k, a in enumerate(args)
                     if a in ("-o", "--output", "-O", "--output-document") and k + 1 < len(args)]
    return [ruta_abs(d, cwd) for d in destinos if d and not re.search(r"[$`]", d)]

def revisar_controlador(comando, cwd):
    """True si es una llamada válida al controlador de publicación; deniega cualquier otra forma
    de invocarlo (con prefijos, variables, otra ruta, compuesto o desde otro directorio)."""
    if "controlador.py" not in comando:
        return False
    texto = comando.strip()
    ruta = os.path.join(PROYECTO, CONTROLADOR)
    if not CONTROLADOR_RE.fullmatch(texto) or os.path.realpath(cwd) != PROYECTO \
            or not os.path.isfile(ruta) or os.path.islink(ruta):
        deny("controlador-forma", "Invoca el controlador solo como «python3 infraestructura/publicacion/"
                                  "controlador.py revisar|publicar <número>» desde la raíz del proyecto.")
    return True


VAR_SECRETA_RE = re.compile(
    r"\$\{?[A-Za-z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|PRIVATE)[A-Za-z0-9_]*", re.I)
A_INTERPRETE_RE = re.compile(
    r"\|\s*(?:sudo\s+)?(?:\S*/)?(?:(?:ba|z|da|k|fi|tc|c)?sh|python[0-9.]*|node|perl|ruby|php|deno|bun)"
    r"(?:\s+-[A-Za-z]+)*\s*(?=$|[;&|)\n])")
DESCARGA_O_DECODIFICACION_RE = re.compile(r"\b(curl|wget|aria2c|fetch|base64|xxd|openssl\s+(enc|base64))\b")


def quitar_heredocs(cmd):
    return re.sub(r"<<-?\s*['\"]?(\w+)['\"]?([^\n]*)\n.*?\n\s*\1\s*(?=\n|$)",
                  lambda m: "<<HEREDOC" + m.group(2), cmd, flags=re.S)


def partir_segmentos(cmd):
    # Separa por ;, &&, ||, |, |&, & y saltos de línea, respetando comillas simples, dobles y escapes.
    segmentos, actual, i, comilla = [], [], 0, None
    while i < len(cmd):
        c = cmd[i]
        if comilla:
            actual.append(c)
            if c == "\\" and comilla == '"' and i + 1 < len(cmd):
                actual.append(cmd[i + 1])
                i += 1
            elif c == comilla:
                comilla = None
        elif c in "'\"":
            comilla = c
            actual.append(c)
        elif c == "\\" and i + 1 < len(cmd):
            actual.extend((c, cmd[i + 1]))
            i += 1
        elif cmd.startswith(("&&", "||", "|&"), i):
            segmentos.append("".join(actual))
            actual = []
            i += 2
            continue
        elif c in ";|\n" or (c == "&" and not (i > 0 and cmd[i - 1] in "<>") and not cmd.startswith("&>", i)):
            segmentos.append("".join(actual))
            actual = []
        else:
            actual.append(c)
        i += 1
    segmentos.append("".join(actual))
    return segmentos


def quitar_agrupacion(seg):
    """Quita los paréntesis y llaves de agrupación que quedan al partir «(a; b)» o «{ a; b; }»."""
    s = seg.strip()
    while s.startswith("(") or s.startswith("{ "):
        s = s[1:].lstrip()
    while s.endswith(")") and s.count(")") > s.count("("):
        s = s[:-1].rstrip()
    if s == "}" or (s.endswith(" }") and s.count("}") > s.count("{")):
        s = s[:-1].rstrip()
    return s


def tokenizar(seg):
    try:
        return shlex.split(seg, posix=True)
    except ValueError:
        return seg.split()


def normalizar(tokens):
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", t):
            i += 1
        elif os.path.basename(t) in ENVOLTORIOS:
            i += 1
            # Opciones del envoltorio, incluidas las que llevan un valor aparte (nice -n 5,
            # ionice -c 3, stdbuf -o L, xargs -I {}).
            while i < len(tokens) and tokens[i].startswith("-"):
                if tokens[i] in ("-n", "-c", "-p", "-t", "-i", "-o", "-e", "-I", "-L", "-P", "-d",
                                 "--adjustment", "--class", "--classdata") and i + 1 < len(tokens):
                    i += 1
                i += 1
        elif t == "timeout":
            i += 1
            while i < len(tokens) and (tokens[i].startswith("-") or re.match(r"^\d", tokens[i])):
                i += 1
        elif t == "env" and i + 1 < len(tokens):
            i += 1
            while i < len(tokens) and (tokens[i].startswith("-") or "=" in tokens[i]):
                i += 1
            if i >= len(tokens):
                deny("secretos", "Prohibido listar variables de entorno.")
        else:
            break
    return tokens[i:]


def revisar_bash(comando, cwd, profundidad=0):
    if not isinstance(comando, str):
        deny("entrada-invalida", "Comando con formato no reconocido.")
    if profundidad > 5:
        deny("anidamiento", "Demasiados niveles de shells anidadas.")
    if profundidad == 0 and revisar_controlador(comando, cwd):
        return
    if revisar_cliente_sql(comando, cwd):
        return
    cmd = quitar_heredocs(comando)
    if re.search(r"npm_config_(ignore|dangerously[_-]allow[_-]all|strict[_-]allow|allow)[_-]scripts\s*=", cmd, re.I):
        deny("npm-scripts", "Prohibido cambiar la configuración de scripts de npm (están desactivados).")
    if re.search(r"(^|[\s;&|(])npm_config_\w+\s*=", cmd, re.I):
        ask("npm-config", "Cambiar la configuración de npm por variables de entorno (registry, scripts…) "
                          "requiere aprobación.")

    # Código descargado o decodificado que se ejecuta.
    if re.search(r"\b(curl|wget|aria2c|fetch)\b[^\n;&]*?\|\s*(sudo\s+)?(\S*/)?((ba|z|da|k|fi|tc|c)?sh|"
                 r"python[0-9.]*|node|perl|ruby|php|deno|bun)\b", cmd) \
            or re.search(r"<\(\s*(curl|wget)\b", cmd) \
            or re.search(r"(eval|(ba|z)?sh\s+-c)\s+[\"']?\$\(\s*(curl|wget)\b", cmd):
        deny("remoto-a-shell", "Prohibido ejecutar código descargado (curl|sh, wget|sh y equivalentes).")
    for m in A_INTERPRETE_RE.finditer(cmd):
        if DESCARGA_O_DECODIFICACION_RE.search(cmd[:m.start()]):
            deny("remoto-a-shell", "Prohibido ejecutar código descargado o decodificado (base64|sh…).")
        ask("codigo-por-tuberia", "Pasar código por tubería a un intérprete requiere aprobación.")
    if re.search(r":\(\)\s*\{", cmd) or re.search(r">\s*/dev/(sd|nvme|hd)", cmd):
        deny("destructivo", "Comando destructivo del sistema.")
    if "/proc/" in cmd and "environ" in cmd:
        deny("secretos", "Prohibido leer el entorno de procesos.")

    for interno in re.findall(r"\$\(([^()]*)\)", cmd) + re.findall(r"`([^`]*)`", cmd):
        revisar_bash(interno, cwd, profundidad + 1)

    descarga_previa = False
    for seg in partir_segmentos(cmd):
        seg = quitar_agrupacion(seg)
        if not seg.strip():
            continue
        tokens = normalizar(tokenizar(seg))
        if not tokens:
            continue
        t0 = os.path.basename(tokens[0])
        if t0 == "cd" and len(tokens) > 1:
            cwd = ruta_abs(tokens[1], cwd)
            continue
        if t0 in ("curl", "wget", "aria2c") and any(a in ("-o", "-O", "--output") or a.startswith("-o") for a in tokens):
            descarga_previa = True
        elif descarga_previa and (t0 in SHELLS or INTERPRETE_RE.match(t0) or (t0 == "chmod" and "+x" in tokens)):
            deny("remoto-a-shell", "Prohibido descargar y ejecutar un script.")
        revisar_segmento(tokens, cwd, seg, profundidad)


def revisar_codigo_en_linea(t0, args, cwd):
    codigo = None
    for k, a in enumerate(args):
        if a in FLAGS_CODIGO and k + 1 < len(args):
            codigo = args[k + 1]
            break
        if not a.startswith("-"):
            break
    if codigo is not None:
        if PRIMITIVAS_RE.search(codigo):
            ask("ejecucion-indirecta", f"Código en línea ({t0}) que ejecuta comandos, decodifica, borra o escribe "
                                       "archivos: requiere aprobación. Usa comandos directos o un script del repo.")
        return
    # Script local: se revisa su contenido por si menciona secretos, configuración o producción.
    # Excepción: los scripts de validación conocidos, invocados exactamente (ver SCRIPTS_VALIDACION).
    if es_script_validacion(t0, args, cwd):
        return
    archivo = next((a for a in args if not a.startswith("-")), None)
    if not archivo:
        return
    ruta = ruta_abs(archivo, cwd)
    try:
        if os.path.isfile(ruta) and os.path.getsize(ruta) <= 512 * 1024 and "node_modules" not in ruta:
            with open(ruta, encoding="utf-8", errors="ignore") as f:
                contenido = f.read()
            if menciona_env_real(contenido) or PROTEGIDO_RE.search(contenido) or HOSTS_PROD.search(contenido):
                ask("script-sensible", "El script ejecutado menciona secretos, configuración protegida o APIs de "
                                       "producción: requiere aprobación.")
    except OSError:
        pass


def revisar_segmento(tokens, cwd, seg=None, profundidad=0):
    if not tokens:
        return
    seg = seg if seg is not None else " ".join(tokens)
    t0 = os.path.basename(tokens[0])
    args = tokens[1:]
    sub_git = next((a for a in args if not a.startswith("-")), "") if t0 == "git" else ""

    # Comandos que no se ejecutan nunca o que tocan el sistema.
    if t0 in NUNCA or t0.startswith("mkfs"):
        deny("destructivo", f"Prohibido ejecutar {t0}.")
    if t0 in ("kill", "pkill", "killall") and "-1" in args:
        deny("destructivo", "Prohibido matar todos los procesos.")
    if t0 == "crontab" and args != ["-l"]:
        ask("sistema", "Cambiar tareas programadas del sistema requiere aprobación.")
    if t0 == "systemctl":
        orden = next((a for a in args if not a.startswith("-")), "")
        if orden and orden not in SYSTEMCTL_LECTURA:
            ask("sistema", "Cambiar servicios del sistema requiere aprobación.")
    if t0 == "service" and args[1:2] != ["status"]:
        ask("sistema", "Cambiar servicios del sistema requiere aprobación.")
    if t0 == "journalctl" and any(a.startswith(("--vacuum", "--rotate", "--flush")) for a in args):
        ask("sistema", "Limpiar o rotar el registro del sistema requiere aprobación.")

    # Los mensajes de commit y los títulos o cuerpos de PR/issue son texto libre: no se tratan
    # como rutas ni como destinos de escritura. Las rutas reales (-F, --body-file) y las
    # redirecciones se siguen revisando (ver quitar_textos_libres).
    args_eval = quitar_textos_libres(t0, args)
    seg_eval = " ".join([tokens[0]] + args_eval) if args_eval is not args else seg

    # Secretos.
    if t0 in ("printenv", "env") or (t0 in ("export", "declare", "typeset") and (
            not args or any(a in ("-p", "-x") for a in args))) \
            or (t0 == "set" and not args) or (t0 == "compgen" and "-e" in args):
        deny("secretos", "Prohibido listar variables de entorno.")
    # Sobre el comando completo: dentro de comillas dobles la shell expandiría la variable.
    if VAR_SECRETA_RE.search(seg):
        deny("secretos", "Prohibido usar o mostrar variables con claves o secretos en comandos.")
    for tok in args:
        limpio = tok.lstrip("<>&|0123456789=").split("=", 1)[-1]
        if limpio.startswith(("/", "~")) and es_otro_proyecto(ruta_abs(limpio, cwd)):
            deny("otro-proyecto", "Prohibido acceder a archivos de otros proyectos del servidor.")
    if t0 in HERRAMIENTAS_RED:
        try:
            if t0 != "curl":
                _no("herramienta de red")
            _curl_lectura(args, cwd)
        except NoDemostrable:
            ask("red", f"{t0} fuera de una lectura de nuestra web: podría enviar datos fuera o gastar servicios.")
    if t0 == "git":
        # «rev:ruta» (git show HEAD:.env, git cat-file -p main:.env.local): la ruta tras «:» cuenta.
        for tok in args_eval:
            if ":" in tok and not tok.startswith("-"):
                parte = tok.split(":", 1)[1]
                if parte and (es_secreto(ruta_abs(parte, cwd)) or menciona_env_real(parte)):
                    deny("secretos", "Prohibido leer archivos con secretos desde el historial de git.")
    solo_nombres = t0 in ("ls", "stat", "test", "[") or (t0 == "git" and sub_git in ("check-ignore", "ls-files", "status"))
    if not solo_nombres:
        for tok in args_eval:
            limpio = tok.lstrip("<>&|0123456789")
            if ("/" in limpio or limpio.startswith(".")) and es_secreto(ruta_abs(limpio, cwd)):
                deny("secretos", "Prohibido leer, copiar o versionar archivos con secretos (.env, claves, credenciales).")
        if t0 != "git" and menciona_env_real(seg_eval):
            deny("secretos", "El comando hace referencia a un archivo .env real.")

    # Escritura en el sistema (/etc, /usr/local…): nunca desde una sesión.
    for destino in destinos_de_escritura(t0, args, seg, cwd):
        if es_sistema(destino):
            deny("sistema-escritura", "Prohibido escribir en /etc, /usr, /opt u otras rutas del sistema: "
                                      "lo instala una persona con sudo.")
        if not en_zona_escritura(destino):
            ask("fuera-proyecto", "Escritura fuera del proyecto, de los worktrees y de las zonas temporales.")
        if es_config_critica(destino):
            deny("config-critica", "Prohibido modificar la configuración de Claude, de git o de npm, sus hooks o "
                                   "la política desde la shell.")
        if es_config_protegida(destino):  # también con rutas relativas tras un cd
            ask("config-protegida", "Modificar CLAUDE.md, .claude/ o la infraestructura desde la shell: usa "
                                    "las herramientas de edición.")

    # Escritura en la configuración protegida desde Bash.
    if PROTEGIDO_RE.search(seg_eval):
        lectura = (t0 in SOLO_LECTURA and ">" not in seg_eval) \
            or (t0 == "sed" and "-i" not in " ".join(args) and ">" not in seg_eval) \
            or (t0 == "git" and sub_git in GIT_LECTURA) \
            or (t0 == "cd" and len(args) == 1) \
            or (t0 in SHELLS and "-n" in args and "-c" not in args and ">" not in seg_eval) \
            or (INTERPRETE_RE.match(t0) and args[:2] == ["-m", "py_compile"] and ">" not in seg_eval) \
            or (seg.strip() in COMANDOS_VALIDACION and es_script_validacion(t0, args, cwd))
        if not lectura:
            if PROTEGIDO_CRITICO_RE.search(seg_eval):
                deny("config-critica", "Prohibido tocar la configuración de Claude, de git o de npm, sus hooks o "
                                       "la política desde la shell (solo lectura con cat, grep, sed -n…).")
            ask("config-protegida", "Modificar CLAUDE.md, .claude/ o la infraestructura desde la shell: usa "
                                    "las herramientas de edición.")

    # Vaciado o sobrescritura de archivos existentes con una redirección «>».
    for destino in redirecciones_truncan(seg, cwd):
        if os.path.isfile(destino) and os.path.getsize(destino) > 0 and not en_zona_segura(destino, cwd):
            ask("vaciar-archivo", "Sobrescribir o vaciar un archivo existente desde la shell requiere aprobación "
                                  "(usa la herramienta de edición).")

    # Movimientos y renombrados: pueden romper referencias (política de archivos).
    if t0 == "mv":
        rutas_mv = [a for a in args if not a.startswith("-")]
        if not rutas_mv or not all(en_zona_segura(r, cwd) for r in rutas_mv):
            ask("mover", "Renombrar o mover archivos puede romper referencias: requiere aprobación.")

    # Borrados de archivos sueltos y vaciados (política de archivos).
    if t0 in ("rmdir", "unlink", "truncate"):
        objetivos = [a for a in args if not a.startswith("-")]
        if not objetivos or not all(en_zona_segura(o, cwd) for o in objetivos):
            ask("borrar", f"{t0} borra o vacía archivos del proyecto: requiere aprobación.")

    # Borrados.
    if t0 == "rm":
        recursivo = any(a in ("-r", "-R", "--recursive") or re.match(r"^-[^-]*[rR]", a) for a in args)
        objetivos = [a for a in args if not a.startswith("-")]
        if recursivo and not objetivos:
            deny("rm-rf", "rm recursivo sin objetivo claro.")
        for o in objetivos:
            abs_o = None if re.search(r"[*?$`{]", o) else ruta_abs(o, cwd)
            if o in ("/", "/*", "~", "~/", ".", "..", "*") or (abs_o and abs_o in (PROYECTO, HOME, "/")):
                deny("rm-rf", "Prohibido borrar la raíz, el home o el proyecto completo.")
            if abs_o and dentro(abs_o, os.path.join(PROYECTO, ".git")):
                deny("rm-rf", "Prohibido borrar .git.")
            if recursivo and not en_zona_segura(o, cwd):
                deny("rm-rf", "rm recursivo solo se permite en zonas temporales seguras "
                              "(dist, .expo, node_modules, /tmp/claude-*).")
        if not recursivo:
            fuera = [o for o in objetivos if not en_zona_segura(o, cwd)]
            if len(fuera) > MAX_RUTAS_SIN_APROBACION or any(tiene_comodin(o) for o in fuera):
                ask("rm-amplio", f"Borrado de más de {MAX_RUTAS_SIN_APROBACION} archivos o con comodines: "
                                 "requiere aprobación.")
            if fuera or not objetivos:
                ask("borrar", "Borrar archivos del proyecto requiere aprobación (política de archivos).")
    if t0 == "find" and ("-delete" in args or ("-exec" in args and any(os.path.basename(a) == "rm" for a in args))):
        fin = next((k for k, a in enumerate(args) if a.startswith("-")), len(args))
        for r in (args[:fin] or ["."]):
            if not en_zona_segura(r if r.endswith("/") else r + "/", cwd):
                deny("rm-rf", "find -delete o -exec rm solo se permite en zonas temporales seguras.")
    if t0 == "find":
        for k, a in enumerate(args):
            if a in ("-exec", "-execdir", "-ok", "-okdir"):
                orden = os.path.basename(args[k + 1]) if k + 1 < len(args) else ""
                if orden not in FIND_EXEC_LECTURA:
                    ask("find-exec", f"find {a} {orden or '?'} puede modificar archivos: requiere aprobación.")
            elif a in ("-fprint", "-fprint0", "-fprintf", "-fls"):
                ask("find-exec", f"find {a} escribe archivos: requiere aprobación.")
    if t0 in ("chmod", "chown", "chgrp") and any(a in ("-R", "--recursive") for a in args):
        if any(not dentro(ruta_abs(o, cwd), PROYECTO) for o in args[1:] if not o.startswith("-")):
            ask("permisos", "Cambio recursivo de permisos fuera del proyecto.")
    if t0 == "rsync" and any(a.startswith("--delete") for a in args):
        ask("rsync-delete", "rsync --delete puede borrar archivos.")

    # Ejecución indirecta: shells anidadas, eval, intérpretes y ejecutores de paquetes.
    if t0 in SHELLS and "-c" in args:
        k = args.index("-c")
        if k + 1 < len(args):
            interno = args[k + 1]
            if re.search(r"\$\(|`|\$\{?\w", interno):
                ask("ejecucion-indirecta", "Shell anidada con contenido dinámico: requiere aprobación.")
            revisar_bash(interno, cwd, profundidad + 1)
    if t0 == "eval" or t0 == "source" or t0 == ".":
        ask("ejecucion-indirecta", f"{t0} ejecuta código que el guardián no puede ver: requiere aprobación.")
    if INTERPRETE_RE.match(t0):
        revisar_codigo_en_linea(t0, args, cwd)
    # «bash -n script» solo comprueba la sintaxis: no ejecuta nada, así que no se revisa su contenido.
    if t0 in SHELLS and "-c" not in args and "-n" not in args:
        revisar_codigo_en_linea(t0, args, cwd)
    if t0 in ("npx", "bunx", "pnpx"):
        k = 0
        while k < len(args) and args[k].startswith("-"):
            k += 2 if args[k] in ("-p", "--package") else 1
        if k < len(args):
            nombre = re.sub(r"(?<!^)@[^/]*$", "", args[k])
            if not os.path.exists(os.path.join(PROYECTO, "node_modules", ".bin", os.path.basename(nombre))):
                ask("npx-remoto", "npx descargaría y ejecutaría un paquete que no está instalado en el proyecto: "
                                  "requiere aprobación.")
            revisar_segmento([nombre] + args[k + 1:], cwd, None, profundidad)

    # Herramientas concretas.
    if t0 == "git":
        revisar_git(tokens, cwd)
    elif t0 == "gh":
        revisar_gh(args, cwd)
    elif t0 == "npm":
        revisar_npm(tokens, cwd)
    elif t0 in ("yarn", "pnpm"):
        revisar_gestor_alternativo(tokens, cwd)
    elif t0 in ("ncu", "npm-check-updates") and any(a in ("-u", "--upgrade") for a in args):
        deny("deps-masivas", "Prohibido npm-check-updates -u.")
    elif t0 == "expo":
        revisar_expo(args, cwd)
    elif t0 in ("vercel", "vc"):
        revisar_vercel(args)
    elif t0 == "supabase":
        revisar_supabase_cli(args)
    elif t0 in ("psql", "pg_dump", "pg_restore", "pgcli"):
        revisar_psql(tokens)
    elif t0 == "stripe":
        revisar_stripe_cli(args)
    elif t0 in ("curl", "wget", "http", "https", "xh") and HOSTS_PROD.search(seg):
        if ESCRITURA_HTTP.search(seg):
            deny("api-produccion", "Prohibido escribir en las APIs de Stripe, Vercel o Supabase desde la terminal.")
        ask("api-produccion", "Llamada directa a una API de producción: requiere aprobación.")


# ================================================== lectura compuesta =======
# Claude Code compara cada parte de un comando compuesto (|, ;, &&, ||) con sus reglas y, si
# una sola parte no encaja (p. ej. «sort» sin argumentos o «sed -E»), pregunta por todo el
# comando. Esta es la ÚNICA situación en la que el guardián devuelve "allow": un comando
# compuesto en el que se demuestra que CADA parte es lectura pura dentro de las zonas de
# trabajo. Ante cualquier duda devuelve False y Claude Code pregunta como siempre (falla
# cerrado). Se evalúa después de todas las reglas deny/ask: si alguna saltó, nunca se llega aquí.

# Comandos de lectura cuyos argumentos posicionales son archivos a leer.
LECTURA_ARCHIVOS = {"ls", "cat", "head", "tail", "wc", "stat", "file", "du", "tree", "diff", "cmp",
                    "sha256sum", "md5sum", "nl", "tac", "sort", "uniq", "cut", "column", "fold", "comm"}
# Comandos cuyos argumentos son solo texto (no leen archivos indicados por el usuario).
LECTURA_TEXTO = {"echo", "printf", "tr", "basename", "dirname", "realpath", "which", "true", "pwd"}
# Opciones que convierten un lector en escritor, siguen sin fin o leen listas de archivos ocultas.
OPCIONES_NO_LECTURA = {
    "sort": ("-o", "--output"), "tree": ("-o",), "tail": ("-f", "-F", "--follow"),
    "file": ("-C", "--compile"), "wc": ("--files0-from",), "du": ("--files0-from",),
    "sha256sum": ("-c", "--check"), "md5sum": ("-c", "--check"),
}
GREP = {"grep", "egrep", "fgrep"}
FIND_PREDICADOS = {  # predicado -> número de valores que lo acompañan
    "-name": 1, "-iname": 1, "-path": 1, "-ipath": 1, "-wholename": 1, "-regex": 1, "-iregex": 1,
    "-type": 1, "-maxdepth": 1, "-mindepth": 1, "-size": 1, "-mtime": 1, "-mmin": 1, "-newer": 1,
    "-printf": 1, "-empty": 0, "-not": 0, "!": 0, "-o": 0, "-or": 0, "-a": 0, "-and": 0,
    "-print": 0, "-print0": 0, "-prune": 0, "(": 0, ")": 0}
GIT_LECTURA_COMPUESTA = {"status", "diff", "log", "show", "rev-parse", "ls-files", "blame", "merge-base",
                         "rev-list", "cat-file", "check-ignore", "shortlog", "describe", "branch",
                         "stash", "worktree", "remote"}
GH_LECTURA_COMPUESTA = {("pr", "view"), ("pr", "list"), ("pr", "checks"), ("pr", "diff"), ("pr", "status"),
                        ("issue", "view"), ("issue", "list"), ("run", "view"), ("run", "list"),
                        ("repo", "view")}


class NoDemostrable(Exception):
    """No se puede demostrar que el comando sea solo lectura: se deja preguntar."""


def _no(motivo=""):
    raise NoDemostrable(motivo)


def _partir_crudo(cmd):
    """Separa por |, ;, && y || respetando comillas y rechaza todo lo que la shell expandiría
    o redirigiría: $, `, $(), <(), >(), >, <, &, (, ), {, }, \\ fuera de comillas, # y saltos
    de línea. Devuelve (partes, hay_separador)."""
    partes, actual, i, comilla, separador = [], [], 0, None, False
    while i < len(cmd):
        c = cmd[i]
        if comilla == "'":
            if c == "'":
                comilla = None
            actual.append(c)
        elif comilla == '"':
            if c in "$`":
                _no("expansión dentro de comillas dobles")
            if c == "\\" and i + 1 < len(cmd):
                if cmd[i + 1] == "\n":
                    _no("continuación de línea")
                actual.extend((c, cmd[i + 1]))
                i += 2
                continue
            if c == '"':
                comilla = None
            actual.append(c)
        elif c in "'\"":
            comilla = c
            actual.append(c)
        elif c in "$`<>(){}\\#\n\r!":
            _no(f"carácter especial fuera de comillas: {c!r}")
        elif cmd.startswith(("&&", "||"), i):
            partes.append("".join(actual))
            actual, separador = [], True
            i += 2
            continue
        elif c == "&":
            _no("ejecución en segundo plano o redirección con &")
        elif c in "|;":
            if cmd.startswith("|&", i):
                _no("|& redirige errores")
            partes.append("".join(actual))
            actual, separador = [], True
        else:
            actual.append(c)
        i += 1
    if comilla:
        _no("comillas sin cerrar")
    partes.append("".join(actual))
    return partes, separador


def en_zona_lectura(ruta):
    # Además del repo: la memoria del agente y el registro del guardián (nunca credenciales).
    zonas = [PROYECTO, WORKTREES, f"/tmp/claude-{UID}", os.path.join(HOME, ".claude", "projects")]
    return (any(dentro(ruta, z) for z in zonas) or bool(re.match(r"^/tmp/vz-", ruta))
            or ruta in ("/dev/null", REGISTRO))


def _ruta_leible(token, cwd):
    if token == "-":
        return
    if token.startswith("~"):
        _no("ruta con ~")
    if re.search(r"[*?\[]", token):
        base = ruta_abs(re.split(r"[*?\[]", token, maxsplit=1)[0] or ".", cwd)
        if not en_zona_lectura(base if os.path.isdir(base) else os.path.dirname(base)):
            _no("comodín fuera de las zonas de trabajo")
        objetivo = token if os.path.isabs(token) else os.path.join(cwd, token)
        rutas = [os.path.realpath(r) for r in glob.glob(objetivo)]
    else:
        rutas = [ruta_abs(token, cwd)]
    for r in rutas:
        if es_secreto(r) or es_sistema(r) or not en_zona_lectura(r):
            _no("ruta secreta, del sistema o fuera de las zonas de trabajo")


def _opciones_y_posicionales(args):
    # A propósito NO se interpreta qué opciones llevan valor: un valor tomado por archivo se
    # comprueba como ruta (falla del lado seguro); un archivo tomado por valor escaparía.
    opciones, posicionales, solo_posicionales = [], [], False
    for a in args:
        if solo_posicionales or not a.startswith("-") or a == "-":
            posicionales.append(a)
        elif a == "--":
            solo_posicionales = True
        else:
            opciones.append(a)
    return opciones, posicionales


def _valores_de_opcion(opciones, cwd):
    # El valor de «--opcion=valor» se comprueba como ruta (p. ej. --from-file=.env); un valor que
    # no sea ruta (--color=auto) queda dentro del cwd y pasa. Las listas indirectas de archivos
    # (--files0-from) no se pueden comprobar: se rechazan.
    for o in opciones:
        if "files0-from" in o:
            _no("lista indirecta de archivos")
        if o.startswith("--") and "=" in o:
            _ruta_leible(o.split("=", 1)[1], cwd)


def _opcion_corta(opciones, letras):
    # True si alguna opción corta (sola o agrupada, p. ej. -uo) contiene una de las letras.
    return any(re.match(rf"^-[a-zA-Z0-9]*[{letras}]", o) and not o.startswith("--") for o in opciones)


def _sed_solo_imprime(script):
    """Acepta solo guiones de impresión: [dirección[,dirección]][!]p|=|q separados por ;.
    Direcciones: número, $, /regex/ (+N y ~N como segunda). Cualquier otro comando
    (s, w, r, e, y, i, a, c…) no es demostrablemente lectura."""
    i, n = 0, len(script)

    def direccion(i):
        if i < n and script[i].isdigit():
            while i < n and script[i].isdigit():
                i += 1
        elif i < n and script[i] == "$":
            i += 1
        elif i < n and script[i] == "/":
            i += 1
            while i < n and script[i] != "/":
                i += 2 if script[i] == "\\" else 1
            if i >= n:
                _no("regex de sed sin cerrar")
            i += 1
        return i

    if not script.strip():
        _no("guion de sed vacío")
    while i < n:
        while i < n and script[i] in " \t":
            i += 1
        j = direccion(i)
        if j < n and script[j] == ",":
            j += 1
            if j < n and script[j] in "+~":
                k = j = j + 1
                while j < n and script[j].isdigit():
                    j += 1
                if j == k:
                    _no("dirección de sed incompleta")
            else:
                k, j = j, direccion(j)
                if j == k:
                    _no("dirección de sed incompleta")
        while j < n and script[j] in " \t":
            j += 1
        if j < n and script[j] == "!":
            j += 1
        if j >= n or script[j] not in "p=q":
            _no("comando de sed que no es de impresión")
        j += 1
        while j < n and script[j] in " \t":
            j += 1
        if j < n and script[j] != ";":
            _no("guion de sed con más comandos")
        i = j + 1


def _parte_es_lectura(tokens, cwd):
    """Devuelve el cwd resultante si la parte es lectura demostrable; si no, NoDemostrable."""
    if not tokens:
        _no("parte vacía")
    t0, args = tokens[0], tokens[1:]
    if "/" in t0 or "=" in t0:
        _no("comando con ruta o asignación de variable")

    if t0 == "cd":
        if len(args) != 1:
            _no("cd sin un único destino")
        destino = ruta_abs(args[0], cwd)
        if not en_zona_lectura(destino) or not os.path.isdir(destino):
            _no("cd fuera de las zonas de trabajo")
        return destino

    if t0 in LECTURA_TEXTO:
        if t0 in ("true", "pwd") and args:
            _no(f"{t0} con argumentos")
        return cwd

    if t0 == "date":
        if any(not (a.startswith("+") or a in ("-u", "--utc", "-R", "--rfc-2822") or a.startswith("-I"))
               for a in args):
            _no("date con opciones que no son de formato")
        return cwd

    if t0 in LECTURA_ARCHIVOS:
        opciones, posicionales = _opciones_y_posicionales(args)
        largas = OPCIONES_NO_LECTURA.get(t0, ())
        if any(o.split("=", 1)[0] in largas for o in opciones):
            _no(f"{t0} con una opción que escribe, no termina o lee listas de archivos")
        cortas = {"sort": "o", "tree": "o", "tail": "fF", "file": "C", "sha256sum": "c", "md5sum": "c"}.get(t0)
        if cortas and _opcion_corta(opciones, cortas):
            _no(f"{t0} con una opción que escribe, no termina o lee listas de archivos")
        if t0 == "uniq" and len(posicionales) > 1:
            _no("uniq con archivo de salida")
        _valores_de_opcion(opciones, cwd)
        for p in posicionales:
            _ruta_leible(p, cwd)
        return cwd

    if t0 in GREP or t0 == "rg":
        if t0 in GREP and (_opcion_corta([a for a in args if a.startswith("-")], "rRd")
                           or any(a.startswith(("--recursive", "--dereference-recursive", "--directories"))
                                  for a in args)):
            _no("grep recursivo puede leer .env: usa rg (ignora archivos ocultos)")
        if t0 == "rg" and (_opcion_corta([a for a in args if a.startswith("-")], "uLz.")
                           or any(a.startswith(("--hidden", "--no-ignore", "--follow", "--pre", "--search-zip"))
                                  for a in args)):
            _no("rg con opciones que leen archivos ocultos o ejecutan preprocesadores")
        opciones, posicionales = _opciones_y_posicionales(args)
        # Patrones o listas de patrones dados como opción: -e/-f, sueltos o pegados (-fARCHIVO).
        patrones_en_opcion = any(re.match(r"^-[a-zA-Z0-9]*[ef]", o) or o.startswith(("--regexp", "--file"))
                                 for o in opciones)
        for o in opciones:
            pegado = re.match(r"^-[a-zA-Z0-9]*f(.+)$", o)
            if pegado:
                _ruta_leible(pegado.group(1), cwd)
        _valores_de_opcion(opciones, cwd)
        if not posicionales and not patrones_en_opcion:
            _no("grep sin patrón")
        # Sin -e/-f el primer posicional es el patrón; TODO lo demás se comprueba como ruta.
        for p in (posicionales if patrones_en_opcion else posicionales[1:]):
            _ruta_leible(p, cwd)
        return cwd

    if t0 == "sed":
        guiones, archivos, i = [], [], 0
        while i < len(args):
            a = args[i]
            if a in ("-e", "--expression") and i + 1 < len(args):
                guiones.append(args[i + 1])
                i += 2
                continue
            if a.startswith("--expression="):
                guiones.append(a.split("=", 1)[1])
            elif a.startswith("-") and a != "-":
                if not re.fullmatch(r"-[nErsuz]+|--quiet|--silent|--regexp-extended|--posix|--separate"
                                    r"|--unbuffered|--null-data", a):
                    _no(f"sed {a} no es demostrablemente lectura")
            else:
                archivos.append(a)
            i += 1
        if not guiones:
            if not archivos:
                _no("sed sin guion")
            guiones.append(archivos.pop(0))
        for g in guiones:
            _sed_solo_imprime(g)
        for p in archivos:
            _ruta_leible(p, cwd)
        return cwd

    if t0 == "jq":
        opciones, posicionales = _opciones_y_posicionales(args)
        # Solo opciones sin valor: las que llevan valor (--arg, --rawfile, -f, -L…) desplazarían
        # el filtro o leerían archivos sin comprobar.
        if any(not re.fullmatch(r"-[rcesSnjaCM]+|--(raw-output|compact-output|exit-status|sort-keys|slurp|"
                                r"null-input|tab|join-output|ascii-output|color-output|monochrome-output)", o)
               for o in opciones):
            _no("jq con opciones que no son de formato")
        if not posicionales:
            _no("jq sin filtro")
        if re.search(r"env|input_filename|\$__prog|import|include", posicionales[0], re.I):
            _no("jq que lee variables de entorno o módulos")
        for p in posicionales[1:]:
            _ruta_leible(p, cwd)
        return cwd

    if t0 == "find":
        k = 0
        while k < len(args) and not args[k].startswith("-") and args[k] not in ("(", "!"):
            _ruta_leible(args[k], cwd)
            k += 1
        while k < len(args):
            pred = args[k]
            if pred not in FIND_PREDICADOS:
                _no(f"find {pred} no es demostrablemente lectura")
            if pred == "-newer" and k + 1 < len(args):
                _ruta_leible(args[k + 1], cwd)
            k += 1 + FIND_PREDICADOS[pred]
        return cwd

    if t0 == "git":
        i = 0
        while i < len(args) and args[i].startswith("-"):
            if args[i] == "-C" and i + 1 < len(args):
                cwd_git = ruta_abs(args[i + 1], cwd)
                if not en_zona_lectura(cwd_git):
                    _no("git -C fuera de las zonas de trabajo")
                cwd = cwd_git
                i += 2
                continue
            if args[i] in ("--no-pager", "-P"):
                i += 1
                continue
            _no(f"opción global de git {args[i]}")
        sub, resto = (args[i], args[i + 1:]) if i < len(args) else ("", [])
        if sub not in GIT_LECTURA_COMPUESTA:
            _no(f"git {sub or '(sin orden)'} no es de lectura")
        if any(a.startswith(("--output", "--ext-diff", "--exec", "--upload-pack")) for a in resto):
            _no("git con opciones que escriben o ejecutan")
        if sub == "branch":
            if any(a in ("-d", "-D", "--delete", "-m", "-M", "--move", "-c", "-C", "--copy", "-f", "--force",
                         "-u", "--set-upstream-to", "--unset-upstream", "--edit-description", "-t", "--track")
                   or re.match(r"^-[a-zA-Z]*[dDmMcCfu]", a) for a in resto):
                _no("git branch que modifica ramas")
            if [a for a in resto if not a.startswith("-")] and not ({"--list", "-l"} & set(resto)):
                _no("git branch con nombre crea una rama")
        if sub == "stash" and resto[:1] not in (["list"], ["show"]):
            _no("git stash que no es list/show")
        if sub == "worktree" and resto[:1] != ["list"]:
            _no("git worktree que no es list")
        if sub == "remote" and resto not in ([], ["-v"], ["--verbose"]):
            _no("git remote que no es de lectura")
        # Todo argumento no opción (refs, rutas, «rev:ruta») se comprueba como ruta: una ref como
        # «main» queda dentro del repo y pasa; «HEAD:.env», «:/.env» o «/etc/x» no.
        _valores_de_opcion([a for a in resto if a.startswith("-")], cwd)
        for a in resto:
            if a.startswith("-"):
                continue
            ruta = ruta_abs(a.split(":", 1)[-1] or ".", cwd)
            if es_secreto(ruta) or es_sistema(ruta) or not en_zona_lectura(ruta):
                _no("git con ruta secreta o fuera de las zonas de trabajo")
        return cwd

    if t0 == "gh":
        if args[:1] == ["api"]:
            return _gh_api_lectura(args[1:], cwd)
        if tuple(args[:2]) not in GH_LECTURA_COMPUESTA:
            _no("gh que no es de consulta")
        if any(a in ("-w", "--web") for a in args):
            _no("gh --web abre el navegador")
        return cwd

    if t0 == "curl":
        return _curl_lectura(args, cwd)

    if t0 == "systemctl":
        orden = next((a for a in args if not a.startswith("-")), "")
        if orden not in ("status", "show", "is-active", "is-enabled", "is-failed", "list-units", "list-timers"):
            _no("systemctl que no es de lectura")
        return cwd

    _no(f"{t0} no está en la lista de lectura")


# gh api: solo GET a la API REST, con una lista cerrada de opciones sin valor o con valor inocuo.
GH_API_OPCIONES = {"--paginate", "--silent", "-i", "--include", "--verbose", "--slurp"}
GH_API_OPCIONES_VALOR = {"--jq", "-q", "--template", "-t", "-H", "--header", "--cache"}
GH_API_RUTA_RE = re.compile(r"^/?(repos/videojuegooscom/videojuegooscom-app|repos/\{owner\}/\{repo\})"
                            r"(/[A-Za-z0-9._~%/-]*)?(\?[A-Za-z0-9._~=&%,-]*)?$|^/?(user|rate_limit)$")


def _gh_api_lectura(args, cwd):
    ruta, i = None, 0
    while i < len(args):
        a = args[i]
        if a in GH_API_OPCIONES:
            i += 1
            continue
        if a in GH_API_OPCIONES_VALOR and i + 1 < len(args):
            if a in ("-H", "--header") and not re.fullmatch(r"(Accept|X-GitHub-Api-Version):\s*[\w./+-]+", args[i + 1]):
                _no("gh api con una cabecera no permitida")
            i += 2
            continue
        if a in ("-X", "--method") and i + 1 < len(args):
            if args[i + 1].upper() != "GET":
                _no("gh api con un método que no es GET")
            i += 2
            continue
        if a.startswith("-"):
            _no(f"gh api {a} no está en la lista de opciones de lectura")
        if ruta is not None:
            _no("gh api con más de una ruta")
        ruta = a
        i += 1
    if not ruta or "graphql" in ruta or not GH_API_RUTA_RE.match(ruta):
        _no("gh api fuera de la API REST de este repositorio")
    return cwd


# curl: solo GET/HEAD a nuestra propia web, con una lista cerrada de opciones.
CURL_OPCIONES = {"-s", "--silent", "-S", "--show-error", "-I", "--head", "-L", "--location", "-f", "--fail",
                 "-i", "--include", "-sS", "-sI", "-sL", "-fsS", "-fsSL", "-sSL", "-v", "--compressed"}
CURL_OPCIONES_VALOR = {"-m", "--max-time", "--connect-timeout", "-w", "--write-out", "-A", "--user-agent",
                       "--max-redirs"}


def _curl_lectura(args, cwd):
    urls, i = [], 0
    while i < len(args):
        a = args[i]
        if a in CURL_OPCIONES:
            i += 1
            continue
        if a in CURL_OPCIONES_VALOR and i + 1 < len(args):
            if a in ("-w", "--write-out") and "@" in args[i + 1]:
                _no("curl -w que lee archivos")
            i += 2
            continue
        if a.startswith("-"):
            _no(f"curl {a} no está en la lista de opciones de lectura")
        urls.append(a)
        i += 1
    if not urls or not all(HOSTS_PROPIOS.match(u) for u in urls):
        _no("curl fuera de nuestra propia web")
    return cwd


def lectura_simple_especial(comando, cwd):
    """Comando simple de lectura demostrable (cat, tail, grep, git log, gh api GET, curl a
    nuestra web…): el guardián lo aprueba él mismo, para que Claude Code no pregunte cuando lee
    algo de las zonas de lectura que está fuera del directorio de trabajo (memoria, registro)."""
    try:
        if not isinstance(comando, str) or len(comando) > 4000 or comando != quitar_heredocs(comando):
            return False
        # {owner}/{repo} lo sustituye gh (no la shell, que no expande llaves sin coma).
        partes, separador = _partir_crudo(comando.replace("{owner}/{repo}", "videojuegooscom/videojuegooscom-app"))
        if separador:
            return False
        tokens = shlex.split(partes[0], posix=True)
        if not tokens:
            return False
        _parte_es_lectura(tokens, cwd)
        return True
    except (NoDemostrable, ValueError, IndexError):
        return False


def lectura_compuesta_segura(comando, cwd):
    """True solo si el comando es compuesto y CADA parte es lectura demostrable."""
    try:
        if not isinstance(comando, str) or len(comando) > 4000 or comando != quitar_heredocs(comando):
            return False
        partes, separador = _partir_crudo(comando.replace("{owner}/{repo}", "videojuegooscom/videojuegooscom-app"))
        if not separador:
            return False  # un comando simple lo deciden las reglas de la política, no el guardián
        for parte in partes:
            tokens = shlex.split(parte, posix=True)
            cwd = _parte_es_lectura(tokens, cwd)
        return True
    except (NoDemostrable, ValueError):
        return False


# ============================================== herramientas de archivo =====

def revisar_edicion(entrada):
    ruta = entrada.get("file_path") or entrada.get("notebook_path")
    if not isinstance(ruta, str) or not ruta:
        deny("entrada-invalida", "Edición sin ruta reconocible.")
    abs_r = ruta_abs(ruta, PROYECTO)
    if es_secreto(abs_r):
        deny("secretos", "Prohibido escribir archivos con secretos.")
    if es_sistema(abs_r):
        deny("sistema-escritura", "Prohibido escribir en /etc, /usr, /opt u otras rutas del sistema: "
                                  "lo instala una persona con sudo.")
    contenido = entrada.get("content")
    if isinstance(contenido, str) and not contenido.strip() and os.path.isfile(abs_r) \
            and os.path.getsize(abs_r) > 0:
        ask("vaciar-archivo", "Vaciar un archivo existente equivale a borrarlo: requiere aprobación "
                              "(política de archivos).")
    if es_config_critica(abs_r):
        deny("config-critica", "Prohibido modificar la configuración de Claude, de git o de npm, sus hooks o la "
                               "política: lo cambia una persona con el instalador.")
    if es_config_protegida(abs_r):
        ask("config-protegida", "Modificar CLAUDE.md, .claude/, la infraestructura de Claude o los workflows "
                                "es una tarea explícita.")
        return
    rel = os.path.relpath(abs_r, PROYECTO)
    if any(rel == s or rel.startswith(s) for s in SENSIBLES):
        ask("zona-sensible", f"{rel} afecta a Stripe, autenticación, administración o funciones de Supabase: "
                             "requiere aprobación explícita.")
    if not en_zona_escritura(abs_r):
        ask("fuera-proyecto", "Escritura fuera del proyecto y de las zonas temporales.")


def revisar_lectura(entrada):
    for clave in ("file_path", "path", "notebook_path"):
        ruta = entrada.get(clave)
        if isinstance(ruta, str) and ruta and es_secreto(ruta_abs(ruta, PROYECTO)):
            deny("secretos", "Prohibido leer archivos con secretos (.env, claves, credenciales).")
    glob = entrada.get("glob") or ""
    if isinstance(glob, str) and (menciona_env_real(glob) or EXT_SECRETAS.search(glob)):
        deny("secretos", "Prohibido buscar dentro de archivos con secretos.")


# ================================================================ MCP =======

SUPABASE_LECTURA = {
    "get_advisors", "get_edge_function", "get_organization", "get_project", "get_project_url",
    "get_publishable_keys", "list_branches", "list_edge_functions", "list_extensions",
    "list_migrations", "list_organizations", "list_projects", "list_tables", "query_logs",
    "search_docs", "generate_typescript_types",
}
SUPABASE_NUNCA = {"delete_branch", "reset_branch", "merge_branch", "rebase_branch", "pause_project"}
SUPABASE_SQL = {"execute_sql": {"query"}, "apply_migration": {"name", "query"}}

VERCEL_LECTURA = {
    "aggregate_events", "aggregate_pageviews", "artifact_query", "count_events", "count_pageviews",
    "get_active_attack_status", "get_agent_run", "get_agent_run_trace", "get_alias", "get_auth_user",
    "get_bulk_availability", "get_bulk_price", "get_cert_by_id", "get_configuration", "get_connector",
    "get_connector_project_connection", "get_contact_info_schema", "get_custom_environment",
    "get_deployment", "get_deployment_file_contents", "get_domain_availability",
    "get_domain_contact_verification", "get_domain_order", "get_domain_price",
    "get_domains_records_by_record_id", "get_drain", "get_firewall_config", "get_flag",
    "get_flag_settings", "get_git_deployment_context", "get_kms_issuer", "get_microfrontends_config",
    "get_microfrontends_config_for_project", "get_named_sandbox", "get_observability_schema",
    "get_order", "get_project", "get_project_trace", "get_purchase_quote", "get_records",
    "get_remote_cache_status", "get_rolling_release", "get_rolling_release_billing_status",
    "get_rolling_release_config", "get_runtime_errors", "get_runtime_logs", "get_session",
    "get_session_command", "get_session_command_logs", "get_session_snapshot",
    "get_storage_stores_by_id", "get_team", "get_tld", "get_tld_price", "get_toolbar_thread",
    "get_vercel_ci_invocation", "get_vercel_ci_invocation_logs", "get_vercel_ci_invocation_tree",
    "get_vercel_ci_job_definition", "get_vercel_ci_job_run", "get_vercel_ci_job_run_logs",
    "get_vercel_ci_task_logs", "get_vercel_ci_task_run_logs", "get_webhooks",
    "list_access_group_members", "list_access_group_projects", "list_access_groups",
    "list_agent_run_projects", "list_agent_runs", "list_aliases", "list_billing_charges",
    "list_bulk_redirect_versions", "list_bulk_redirects", "list_certs", "list_connectors",
    "list_contract_commitments", "list_deployment_aliases", "list_deployment_events",
    "list_deployment_files", "list_deployments", "list_domains", "list_drains", "list_event_types",
    "list_flags", "list_flags_v2", "list_integration_billing_plans",
    "list_integration_configurations", "list_kms_issuers", "list_named_sandboxes",
    "list_project_connector_connections", "list_project_custom_environments",
    "list_project_domains", "list_project_route_versions", "list_project_routes", "list_projects",
    "list_promote_aliases", "list_session_commands", "list_session_snapshots", "list_sessions",
    "list_supported_tlds", "list_team_members", "list_teams", "list_toolbar_threads",
    "list_user_events", "list_vercel_ci_invocation_attempts", "list_vercel_ci_invocations",
    "list_vercel_ci_job_definitions", "list_vercel_ci_job_runs", "list_vercel_ci_task_definitions",
    "list_vercel_ci_task_runs", "read_access_group", "read_access_group_project", "read_session_file",
    "search_domains", "search_repo", "search_vercel_documentation", "web_fetch_vercel_url",
}
VERCEL_NUNCA = {
    "buy_domain", "buy_domains", "buy_single_domain", "create_or_transfer_domain",
    "get_project_deletion_link", "get_project_env", "get_shared_env_var", "create_project_env",
    "edit_project_env", "request_promote", "request_rollback", "assign_alias", "add_project_domain",
    "update_project", "pause_project", "unpause_project", "accept_project_transfer_request",
    "replace_domain_dns_records", "update_record", "put_firewall_config", "update_firewall_config",
    "update_attack_challenge_mode", "update_project_protection_bypass", "patch_url_protection_bypass",
    "revoke_kms_signing_key", "start_rolling_release", "approve_rolling_release_stage",
    "complete_rolling_release", "update_rolling_release_config", "invalidate_by_tags",
    "invalidate_by_src_images", "add_route", "edit_route", "stage_routes", "update_route_versions",
    "stage_redirects", "update_bulk_redirect_version", "create_flag", "update_flag",
    "update_flag_settings", "create_sdk_key", "list_feature_flag_sdk_keys", "create_kms_signing_key",
    "activate_kms_signing_key", "create_kms_issuer", "create_kms_issuer_policy", "update_kms_issuer",
    "update_kms_issuer_policy", "issue_cert", "create_drain", "update_drain", "update_connector",
    "upsert_connector_project_connection",
}
VERCEL_PATRON_NUNCA = re.compile(
    r"delete|deletion|buy_|purchase|transfer|revoke|promote|rollback|(^|_)envs?(_|$)|env_var|"
    r"secret|firewall|protection_bypass|dns|alias|domain|rolling_release", re.I)


def revisar_supabase_mcp(herramienta, entrada):
    if herramienta in SUPABASE_LECTURA:
        return
    if herramienta in SUPABASE_NUNCA:
        deny("supabase-produccion", f"Prohibido {herramienta} en Supabase.")
    if herramienta in SUPABASE_SQL:
        esperados = SUPABASE_SQL[herramienta]
        if not esperados.issubset(entrada.keys()):
            deny("mcp-entrada-invalida", f"{herramienta}: faltan campos obligatorios.")
        if set(entrada.keys()) - esperados - {"project_id"}:
            ask("mcp-campos-desconocidos", f"{herramienta}: campos no reconocidos en la entrada.")
        clasificar_sql(entrada.get("query"), herramienta, es_migracion=(herramienta == "apply_migration"))
        return
    if herramienta == "deploy_edge_function":
        ask("supabase-edge", "Desplegar una Edge Function en Supabase requiere aprobación explícita.")
        return
    ask("mcp-desconocida", f"Supabase {herramienta}: herramienta no clasificada; se trata como escritura.")


def revisar_vercel_mcp(herramienta, entrada):
    # Orden: lectura exacta → casos especiales → prohibidas (lista y patrón) → resto pide aprobación.
    if herramienta in VERCEL_LECTURA:
        return
    if herramienta == "filter_project_envs":
        if str(entrada.get("decrypt", "")).lower() == "true":
            deny("secretos", "Prohibido descifrar variables de entorno de Vercel.")
        ask("vercel-env", "Listar variables de entorno de Vercel requiere aprobación.")
        return
    if herramienta in VERCEL_NUNCA or VERCEL_PATRON_NUNCA.search(herramienta):
        deny("vercel-produccion", f"Prohibido {herramienta} en Vercel: cambia producción, expone secretos o es irreversible.")
    if herramienta == "create_deployment":
        cuerpo = entrada.get("requestBody")
        if not isinstance(cuerpo, dict):
            deny("mcp-entrada-invalida", "create_deployment sin requestBody reconocible.")
        destino = str(cuerpo.get("target") or "").lower()
        ref = str((cuerpo.get("gitSource") or {}).get("ref") or "") if isinstance(cuerpo.get("gitSource"), dict) else ""
        if destino == "production" or ref in RAMAS_PROTEGIDAS or (cuerpo.get("deploymentId") and destino != "preview") \
                or cuerpo.get("customEnvironmentSlugOrId"):
            deny("vercel-produccion", "Prohibido desplegar o volver a desplegar en producción.")
        ask("vercel-deploy", "Despliegue de preview en Vercel: requiere aprobación.")
        return
    ask("mcp-desconocida", f"Vercel {herramienta}: herramienta no clasificada como lectura; requiere aprobación.")


def revisar_mcp(nombre, entrada):
    m = re.match(r"^mcp__(.+?)__(.+)$", nombre)
    if not m:
        return
    servidor, herramienta = m.group(1).lower(), m.group(2)
    if "supabase" in servidor:
        revisar_supabase_mcp(herramienta, entrada)
    elif "vercel" in servidor:
        revisar_vercel_mcp(herramienta, entrada)
    elif "stripe" in servidor:
        if re.search(r"delete|refund|cancel|void|payout|transfer", herramienta, re.I):
            deny("stripe", f"Prohibido {herramienta} en Stripe.")
        ask("stripe", f"Stripe {herramienta}: requiere aprobación explícita.")


# ============================================================== salida ======

def categoria(herramienta, entrada):
    if herramienta == "Bash":
        try:
            primero = normalizar(tokenizar(quitar_heredocs(str(entrada.get("command", ""))).split("\n")[0]))
            programa = os.path.basename(primero[0]) if primero else "?"
        except Exception:
            programa = "?"
        return "bash:" + (re.sub(r"[^a-z0-9._-]", "", programa.lower())[:20] or "?")
    m = re.match(r"^mcp__(.+?)__(.+)$", herramienta or "")
    if m:
        return f"mcp:{m.group(1)[:30]}:{m.group(2)[:40]}"
    return (herramienta or "?").lower()[:20]


def registrar(decision, regla, datos):
    try:
        entrada = datos.get("tool_input")
        huella = hashlib.sha256(json.dumps(entrada, sort_keys=True, ensure_ascii=False, default=str)
                                .encode("utf-8")).hexdigest()
        linea = json.dumps({
            "fecha": datetime.datetime.now().isoformat(timespec="seconds"),
            "decision": decision,
            "regla": regla,
            "herramienta": str(datos.get("tool_name", "?"))[:80],
            "sesion": str(datos.get("session_id", "?"))[:64],
            "categoria": categoria(datos.get("tool_name", ""), entrada if isinstance(entrada, dict) else {}),
            "sha256": huella,
        }, ensure_ascii=False)
        os.makedirs(os.path.dirname(REGISTRO), exist_ok=True)
        fd = os.open(REGISTRO, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        with os.fdopen(fd, "a") as f:
            f.write(linea + "\n")
    except Exception:
        pass


# ======================================================= modo autónomo =====
# Dudas que NUNCA pasan solas, ni en modo autónomo: ejecutan código no visible, descargan
# paquetes, cambian dependencias o producción, escriben fuera del proyecto o descartan trabajo.
NUNCA_AUTO = {
    "codigo-por-tuberia", "ejecucion-indirecta", "script-sensible", "find-exec",
    "npx-remoto", "deps-origen", "deps-opcion", "npm-scripts", "npm-politica-scripts", "npm-rebuild",
    "npm-config", "npm-audit-fix",
    "supabase-escritura", "supabase-seguridad", "supabase-funcion", "supabase-cli", "supabase-edge",
    "supabase-local", "vercel-deploy", "vercel-env", "api-produccion", "stripe",
    "sistema", "fuera-proyecto", "permisos", "rsync-delete",
    "gh-api-post", "gh-workflow", "git-descartar", "red", "git-config-global", "git-push-rama-desconocida",
    "mcp-desconocida", "mcp-campos-desconocidos",
}


def modo_autonomo():
    """Activo solo si existe la marca, es un archivo normal de root y nadie más puede escribirla."""
    try:
        st = os.lstat(MARCA_AUTONOMO)
        import stat as _stat
        return (_stat.S_ISREG(st.st_mode) and st.st_uid == 0 and not st.st_mode & 0o022
                and os.lstat(DIR_POLITICA).st_uid == 0)
    except OSError:
        return False


# ======================================================= reglas de la política =====
# Comprobación propia de las reglas deny/allow de la política, para que una aprobación del
# guardián nunca contradiga una regla deny (aunque Claude Code ya las aplique por su cuenta).

def cargar_politica():
    try:
        with open(POLITICA, encoding="utf-8") as f:
            p = json.load(f).get("permissions", {})
        return list(p.get("deny", [])), list(p.get("allow", []))
    except (OSError, ValueError, AttributeError):
        return None, None


def _patron_bash(patron):
    if patron.endswith(":*"):  # sintaxis antigua de prefijo
        patron = patron[:-2] + " *"
    rx = re.escape(patron).replace(r"\*", ".*")
    if patron.endswith(" *"):
        rx = re.escape(patron[:-2]).replace(r"\*", ".*") + r"( .*)?"
    return re.compile(rf"^{rx}$", re.S)


def _patron_ruta(patron):
    if patron.startswith("//"):
        base = patron[1:]
    elif patron.startswith("~/"):
        base = os.path.join(HOME, patron[2:])
    elif patron.startswith("/"):
        base = os.path.join(PROYECTO, patron[1:])
    elif "/" not in patron.rstrip("/"):
        base = "**/" + patron
    else:
        base = os.path.join(PROYECTO, patron)
    rx = ""
    i = 0
    while i < len(base):
        if base.startswith("**/", i):
            rx += "(.*/)?"
            i += 3
        elif base.startswith("**", i):
            rx += ".*"
            i += 2
        elif base[i] == "*":
            rx += "[^/]*"
            i += 1
        elif base[i] == "?":
            rx += "[^/]"
            i += 1
        else:
            rx += re.escape(base[i])
            i += 1
    if rx.startswith("(.*/)?"):
        return re.compile(rf"^(.*/)?{rx[6:]}$")
    return re.compile(rf"^{rx}$")


def _candidatos_bash(comando, profundidad=0):
    """Formas en las que se compara un comando con las reglas Bash(...) de la política: el
    comando entero, cada segmento normalizado (sin envoltorios ni agrupaciones) y, de forma
    recursiva, lo que va dentro de $(...), `...` y bash|sh -c '...'."""
    candidatos = [comando.strip()]
    if profundidad > 5:
        return candidatos
    cmd = quitar_heredocs(comando)
    for interno in re.findall(r"\$\(([^()]*)\)", cmd) + re.findall(r"`([^`]*)`", cmd):
        candidatos += _candidatos_bash(interno, profundidad + 1)
    for seg in partir_segmentos(cmd):
        tokens = normalizar(tokenizar(quitar_agrupacion(seg)))
        if not tokens:
            continue
        candidatos.append(" ".join(tokens))
        if os.path.basename(tokens[0]) in SHELLS and "-c" in tokens[1:-1]:
            candidatos += _candidatos_bash(tokens[tokens.index("-c") + 1], profundidad + 1)
    return candidatos


def coincide_regla(regla, herramienta, entrada):
    m = re.fullmatch(r"([A-Za-z_]+)\((.*)\)", regla, re.S)
    if not m:  # herramienta completa o servidor MCP completo
        return herramienta == regla or herramienta.startswith(regla + "__")
    tipo, patron = m.groups()
    if patron.startswith("!"):
        return False
    if tipo == "Bash":
        if herramienta != "Bash" or not isinstance(entrada.get("command"), str):
            return False
        rx = _patron_bash(patron)
        return any(rx.match(c) for c in _candidatos_bash(entrada["command"]))
    if tipo in ("Read", "Edit", "Write"):
        familia = {"Read": ("Read", "Grep", "Glob"), "Edit": ("Edit", "Write", "MultiEdit", "NotebookEdit"),
                   "Write": ("Write",)}[tipo]
        if herramienta not in familia:
            return False
        ruta = entrada.get("file_path") or entrada.get("notebook_path") or entrada.get("path")
        return isinstance(ruta, str) and bool(_patron_ruta(patron).match(ruta_abs(ruta, PROYECTO)))
    return False


def coincide_alguna(reglas, herramienta, entrada):
    return next((r for r in reglas if coincide_regla(r, herramienta, entrada)), None)


# ================================================================ salida ======

def decidir(datos, autonomo, reglas_deny=None, reglas_allow=None):
    """Decisión pura (sin efectos): devuelve (decision, regla, motivo) o (None, None, None)."""
    del PREGUNTAS[:]
    try:
        if not isinstance(datos, dict):
            deny("entrada-invalida", "Entrada del hook no reconocida.")
        herramienta = datos.get("tool_name")
        entrada = datos.get("tool_input")
        if not isinstance(herramienta, str) or not isinstance(entrada, dict):
            deny("entrada-invalida", "Herramienta o entrada con formato no reconocido.")
        cwd = datos.get("cwd") if isinstance(datos.get("cwd"), str) else PROYECTO
        if herramienta == "Bash":
            revisar_bash(entrada.get("command"), cwd)
        elif herramienta in ("Edit", "Write", "MultiEdit", "NotebookEdit"):
            revisar_edicion(entrada)
        elif herramienta in ("Read", "Grep", "Glob"):
            revisar_lectura(entrada)
        elif herramienta.startswith("mcp__"):
            revisar_mcp(herramienta, entrada)

        if reglas_deny is None:
            # Sin política legible no se aprueba nada por cuenta propia (falla cerrado).
            reglas_deny = []
            sin_politica = True
        else:
            sin_politica = False
        regla_deny = coincide_alguna(reglas_deny, herramienta, entrada)
        if regla_deny:
            deny("politica-deny", f"Coincide con la regla deny de la política «{regla_deny}».")

        if PREGUNTAS:
            regla, motivo = PREGUNTAS[0][0], " | ".join(dict.fromkeys(m for _, m in PREGUNTAS))
            criticas = [r for r, _ in PREGUNTAS if r in NUNCA_AUTO]
            if not autonomo:
                return "ask", regla, motivo
            if criticas or sin_politica:
                return "deny", criticas[0] if criticas else regla, \
                    motivo + " (modo autónomo: esta duda nunca pasa sola; hazlo a mano o pide permiso)."
            return "allow", "auto:" + regla, motivo

        if herramienta == "Bash" and (lectura_compuesta_segura(entrada.get("command"), cwd)
                                      or lectura_simple_especial(entrada.get("command"), cwd)):
            return "allow", "lectura", "Solo lectura demostrable dentro de las zonas de trabajo."
        if herramienta == "Bash" and revisar_controlador(entrada.get("command"), cwd):
            return "allow", "controlador", "Llamada exacta al controlador de publicación."

        if autonomo and not sin_politica and not coincide_alguna(reglas_allow or [], herramienta, entrada):
            return "allow", "auto:sin-regla", "Fuera de la lista allow; sin ninguna duda del guardián."
        return None, None, None
    except Denegar as d:
        return "deny", d.regla, d.motivo


def emitir(decision, regla, motivo, datos):
    registrar("auto" if regla.startswith("auto:") else decision, regla, datos)
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": decision,
        "permissionDecisionReason": f"[VZ guardián · {regla}] {motivo}",
    }}, ensure_ascii=False))
    sys.exit(0)


def main():
    datos = {}
    try:
        datos = json.load(sys.stdin)
        deny_p, allow_p = cargar_politica()
        decision, regla, motivo = decidir(datos, modo_autonomo(), deny_p, allow_p)
        if decision:
            emitir(decision, regla, motivo, datos)
    except SystemExit:
        raise
    except Exception as e:  # falla cerrado
        emitir("deny", "error-guardian", f"El guardián falló ({type(e).__name__}); se bloquea por seguridad.", datos)


if __name__ == "__main__":
    main()
