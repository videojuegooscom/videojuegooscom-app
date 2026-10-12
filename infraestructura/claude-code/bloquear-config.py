#!/usr/bin/env python3
# == VIDEOJUEGOSZARAGOZA =====================================================
# Archivo:  infraestructura/claude-code/bloquear-config.py
#           (se instala como hooks/bloquear-config.py de la política con instalar.sh)
# Función:  Hook ConfigChange: bloquea cualquier cambio en la configuración de Claude Code
#           (usuario, proyecto o local) durante una sesión, para que el agente no pueda relajar
#           las barreras mientras trabaja. Los cambios legítimos van por el instalador.
# ============================================================================
import json
import sys

try:
    datos = json.load(sys.stdin)
except Exception:
    datos = {}
origen = datos.get("source", "?") if isinstance(datos, dict) else "?"
print(json.dumps({
    "decision": "block",
    "reason": f"VZ: cambio de configuración bloqueado ({origen}). Se cambia con el instalador.",
}, ensure_ascii=False))
sys.exit(0)
