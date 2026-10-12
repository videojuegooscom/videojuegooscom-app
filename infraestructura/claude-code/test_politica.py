#!/usr/bin/env python3
# == VIDEOJUEGOSZARAGOZA =====================================================
# Archivo:  infraestructura/claude-code/test_politica.py
# Función:  Comprueba la estructura de politica.json: barreras globales, reglas deny
#           imprescindibles, ausencia de «ask», hooks apuntando al guardián instalado y que la
#           lista allow no abre nada peligroso.
# Uso:      python3 infraestructura/claude-code/test_politica.py   (desde la raíz del repo)
# ============================================================================
import json
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(AQUI, "politica.json"), encoding="utf-8") as f:
    POL = json.load(f)
P = POL["permissions"]
fallos = []


def comprobar(nombre, valor):
    if not valor:
        fallos.append(nombre)


comprobar("allowManagedPermissionRulesOnly", POL.get("allowManagedPermissionRulesOnly") is True)
comprobar("allowManagedHooksOnly", POL.get("allowManagedHooksOnly") is True)
comprobar("allowManagedMcpServersOnly", POL.get("allowManagedMcpServersOnly") is True)
comprobar("solo MCP supabase y vercel",
          sorted(s.get("serverName") for s in POL.get("allowedMcpServers", [])) == ["supabase", "vercel"])
comprobar("conectores de claude.ai desactivados", POL.get("disableClaudeAiConnectors") is True)
comprobar("scripts de npm desactivados", POL.get("env", {}).get("npm_config_ignore_scripts") == "true")
comprobar("defaultMode acceptEdits", P.get("defaultMode") == "acceptEdits")
comprobar("bypass desactivado", P.get("disableBypassPermissionsMode") == "disable")
comprobar("lecturas fuera bloqueadas", P.get("blockReadsOutsideWorkingDirectories") is True)
comprobar("directorios extra solo la política y los registros",
          P.get("additionalDirectories") == ["/etc/claude-code", "/home/videojuegoszaragoza/registros"])
comprobar("sin reglas ask", P.get("ask") == [])
comprobar("sin duplicados en deny", len(P["deny"]) == len(set(P["deny"])))
comprobar("sin duplicados en allow", len(P["allow"]) == len(set(P["allow"])))
comprobar("nada a la vez en allow y deny", not set(P["allow"]) & set(P["deny"]))

IMPRESCINDIBLES = [
    "Bash(git push --force *)", "Bash(git push origin main)", "Bash(git push * --delete *)", "Bash(git push * +*)",
    "Bash(git reset --hard *)", "Bash(git clean *)", "Bash(gh pr merge *)", "Bash(gh pr merge)", "Bash(sudo *)",
    "Bash(su *)", "Bash(printenv *)", "Bash(vercel --prod *)", "Bash(vercel env *)", "Bash(supabase db *)",
    "Bash(supabase link*)", "Read(.env)", "Read(.env.*)", "Read(~/.ssh/**)", "Read(~/.claude/.credentials.json)",
    "Read(~/.config/gh/**)", "Read(//home/veoaura/**)", "Edit(.env.*)", "Edit(//etc/**)", "Edit(.git/**)",
    "Edit(~/.claude/settings.json)", "Edit(.claude/**)", "Edit(//home/veoaura/**)", "WebFetch",
    "mcp__supabase__apply_migration", "mcp__vercel__get_project_env", "mcp__vercel__request_promote",
    "Bash(git stash drop*)", "Bash(git branch -D *)", "Bash(gh auth *)", "Bash(gh secret *)",
]
for r in IMPRESCINDIBLES:
    comprobar(f"deny imprescindible: {r}", r in P["deny"])

# Ninguna regla deny de la política que había antes desaparece (lo mismo que exige el instalador).
_anterior = os.path.join(AQUI, "origen", "politica_actual.json")
if os.path.isfile(_anterior):
    with open(_anterior, encoding="utf-8") as f:
        for r in json.load(f)["permissions"]["deny"]:
            if "claude_ai_" not in r:
                comprobar(f"deny anterior conservada: {r}", r in P["deny"])

# La lista allow no puede abrir comandos genéricos ni peligrosos.
PROHIBIDOS_EN_ALLOW = re.compile(
    r"^(Bash|Edit|Read|Write)$|Bash\((sudo|su|rm|mv|curl|wget|ssh|scp|eval|bash -c|sh -c|python3 -c|node -e|"
    r"git reset|git clean|git push --force|git push -f|gh pr merge|gh api|vercel|supabase|psql|npx \*)")
for r in P["allow"]:
    comprobar(f"allow peligroso: {r}", not PROHIBIDOS_EN_ALLOW.search(r))
comprobar("push solo a ramas con -u origin", "Bash(git push -u origin *)" in P["allow"])

ganchos = POL.get("hooks", {})
pre = ganchos.get("PreToolUse", [])
comprobar("un único PreToolUse", len(pre) == 1)
comprobar("el guardián cubre Bash, lectura, edición y MCP",
          pre and all(h in pre[0]["matcher"] for h in ("Bash", "Read", "Grep", "Edit", "Write", "mcp__")))
comprobar("el guardián es el instalado",
          pre and pre[0]["hooks"][0]["command"] == "/usr/bin/python3 /etc/claude-code/hooks/guardian.py")
comprobar("ConfigChange bloquea cambios",
          ganchos.get("ConfigChange", [{}])[0].get("hooks", [{}])[0].get("command", "").endswith("bloquear-config.py"))

texto = json.dumps(POL)
comprobar("sin rastros de rutas de VeoAura en reglas allow", "veoaura" not in json.dumps(P["allow"]).lower())
comprobar("sin secretos en la política", not re.search(r"(sk-|ghp_|gho_|eyJ[A-Za-z0-9_-]{20}|sb_secret_)", texto))

for f in fallos:
    print("FALLO", f)
print(f"test_politica: {len(fallos)} fallos")
sys.exit(1 if fallos else 0)
