#!/usr/bin/env python3
# == VEOAURA ================================================================
# Archivo:  .claude/hooks/bloquear-config.py
# Función:  Hook ConfigChange: bloquea cualquier cambio en la configuración de Claude Code
#           (usuario, proyecto o local) durante una sesión, para que el agente no pueda
#           relajar las barreras mientras trabaja. Los cambios legítimos los hace una
#           persona con Claude Code cerrado.
# Conectado con:
#   Lo carga:   .claude/settings.json y /etc/claude-code/managed-settings.json (hooks.ConfigChange)
# ============================================================================
import json
import sys

try:
    datos = json.load(sys.stdin)
except Exception:
    datos = {}
origen = datos.get("source", "?") if isinstance(datos, dict) else "?"
# Claude Code no muestra el motivo (solo lo anota en su registro de depuración).
print(json.dumps({
    "decision": "block",
    "reason": f"VEOAURA: cambio de configuración bloqueado ({origen}). Edítalo con Claude Code cerrado.",
}, ensure_ascii=False))
sys.exit(0)
