#!/usr/bin/env bash
# == VIDEOJUEGOSZARAGOZA =====================================================
# Archivo:  infraestructura/claude-code/instalar.sh
# Función:  Instala la política de Claude Code, el guardián y los servidores MCP de
#           VideojuegosZaragoza en /etc/videojuegoszaragoza/claude-code (que el servicio
#           videojuegoszaragoza-remote ve como /etc/claude-code). Nunca toca /etc/claude-code
#           del sistema ni nada de otros proyectos.
# Uso (como veoaura, con sudo):
#   sudo vz-instalar-claude                 instala desde el repo (rama main al día)
#   sudo vz-instalar-claude --autonomo      instala y activa el modo sin confirmaciones
#   sudo vz-instalar-claude --sin-autonomo  instala y desactiva el modo sin confirmaciones
#   sudo vz-instalar-claude --revertir <respaldo>   vuelve a un respaldo anterior
#   sudo vz-instalar-claude --respaldos             lista los respaldos
# Seguridad: el instalador se ejecuta desde una copia de root (/usr/local/sbin/vz-instalar-claude),
#   no desde el repo, para que el agente no pueda cambiar lo que root ejecuta. Solo instala
#   archivos de un repo limpio cuyo HEAD sea exactamente origin/main.
# ============================================================================
set -euo pipefail
umask 022

USUARIO="videojuegoszaragoza"
REPO="/home/$USUARIO/apps/videojuegooscom-app"
ORIGEN="$REPO/infraestructura/claude-code"
DESTINO="/etc/videojuegoszaragoza/claude-code"
RESPALDOS="/etc/videojuegoszaragoza/respaldos"
SERVICIO="videojuegoszaragoza-remote.service"
ARCHIVOS=("politica.json:managed-settings.json:644" "mcp.json:managed-mcp.json:644"
          "guardian.py:hooks/guardian.py:755" "bloquear-config.py:hooks/bloquear-config.py:755")
# Controlador de publicación: copia de root fuera del repo (el agente no puede cambiarla).
CONTROLADOR_SRC="$REPO/infraestructura/publicacion/controlador.py"
CONTROLADOR_DST="/usr/local/bin/vz-publicar"

rojo() { printf '\033[31m%s\033[0m\n' "$*"; }
verde() { printf '\033[32m%s\033[0m\n' "$*"; }
paso() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
abortar() { rojo "ABORTADO: $*"; exit 1; }

[ "$(id -u)" -eq 0 ] || abortar "ejecútalo con sudo."
[ -d "$DESTINO" ] || abortar "no existe $DESTINO."

como_usuario() { sudo -u "$USUARIO" -H env -i HOME="/home/$USUARIO" PATH="/usr/bin:/bin" "$@"; }

confirmar() {
  local palabra="$1" respuesta
  printf '\nEscribe %s para continuar (cualquier otra cosa cancela): ' "$palabra"
  read -r respuesta
  [ "$respuesta" = "$palabra" ] || abortar "cancelado por el usuario."
}

verificar_sha() {
  local origen_dir="$1" ok=0 entrada src dst
  for entrada in "${ARCHIVOS[@]}"; do
    IFS=: read -r src dst _ <<<"$entrada"
    if [ "$(sha256sum <"$origen_dir/$src" | cut -d' ' -f1)" != "$(sha256sum <"$DESTINO/$dst" | cut -d' ' -f1)" ]; then
      rojo "sha256 distinto en $dst"; ok=1
    fi
  done
  if [ "$(sha256sum <"$origen_dir/controlador.py" | cut -d' ' -f1)" != "$(sha256sum <"$CONTROLADOR_DST" | cut -d' ' -f1)" ]; then
    rojo "sha256 distinto en $CONTROLADOR_DST"; ok=1
  fi
  return $ok
}

respaldar() {
  local dir="$RESPALDOS/$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$RESPALDOS"; chmod 700 "$RESPALDOS"
  cp -a "$DESTINO" "$dir"
  [ -f "$CONTROLADOR_DST" ] && cp -a "$CONTROLADOR_DST" "$dir/vz-publicar"
  echo "$dir"
}

# ------------------------------------------------------------------ revertir --
if [ "${1:-}" = "--respaldos" ]; then
  ls -1 "$RESPALDOS" 2>/dev/null || echo "(sin respaldos)"
  exit 0
fi
if [ "${1:-}" = "--revertir" ]; then
  nombre="${2:-}"
  [[ "$nombre" =~ ^[0-9]{8}-[0-9]{6}$ ]] || abortar "indica un respaldo como 20261012-101500 (usa --respaldos)."
  dir="$RESPALDOS/$nombre"
  [ -f "$dir/managed-settings.json" ] && [ -f "$dir/hooks/guardian.py" ] || abortar "respaldo incompleto: $dir"
  python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$dir/managed-settings.json" || abortar "respaldo con JSON inválido."
  paso "Se volverá a $dir"
  confirmar REVERTIR
  actual=$(respaldar)
  echo "Estado actual guardado en $actual"
  install -m 644 -o root -g root "$dir/managed-settings.json" "$DESTINO/managed-settings.json"
  [ -f "$dir/managed-mcp.json" ] && install -m 644 -o root -g root "$dir/managed-mcp.json" "$DESTINO/managed-mcp.json"
  install -m 755 -o root -g root "$dir/hooks/guardian.py" "$DESTINO/hooks/guardian.py"
  install -m 755 -o root -g root "$dir/hooks/bloquear-config.py" "$DESTINO/hooks/bloquear-config.py"
  if [ -f "$dir/modo-autonomo" ]; then install -m 644 -o root -g root /dev/null "$DESTINO/modo-autonomo"; else rm -f "$DESTINO/modo-autonomo"; fi
  if [ -f "$dir/vz-publicar" ]; then install -m 755 -o root -g root "$dir/vz-publicar" "$CONTROLADOR_DST"; else rm -f "$CONTROLADOR_DST"; fi
  for f in managed-settings.json hooks/guardian.py hooks/bloquear-config.py; do
    cmp -s "$dir/$f" "$DESTINO/$f" || abortar "la copia de $f no coincide tras revertir."
  done
  verde "Revertido a $nombre. Reinicia el servicio: sudo systemctl restart $SERVICIO"
  exit 0
fi

MODO=""
case "${1:-}" in
  "") ;;
  --autonomo) MODO="activar" ;;
  --sin-autonomo) MODO="desactivar" ;;
  *) abortar "opción desconocida: $1" ;;
esac

# ------------------------------------------------------------------ 1. repo --
paso "1/7 Comprobando el repositorio"
[ -d "$ORIGEN" ] || abortar "no existe $ORIGEN."
como_usuario git -C "$REPO" fetch --quiet origin main || abortar "no se pudo actualizar origin/main."
CABEZA=$(como_usuario git -C "$REPO" rev-parse HEAD)
REMOTO=$(como_usuario git -C "$REPO" rev-parse origin/main)
[ "$CABEZA" = "$REMOTO" ] || abortar "el repo no está en origin/main (HEAD=$CABEZA, origin/main=$REMOTO). Haz git switch main && git pull --ff-only."
[ -z "$(como_usuario git -C "$REPO" status --porcelain -- infraestructura)" ] || abortar "hay cambios sin confirmar en infraestructura/."
for entrada in "${ARCHIVOS[@]}"; do
  IFS=: read -r src _ _ <<<"$entrada"
  [ -f "$ORIGEN/$src" ] && [ ! -L "$ORIGEN/$src" ] || abortar "falta o es un enlace: $src"
done
[ -f "$CONTROLADOR_SRC" ] && [ ! -L "$CONTROLADOR_SRC" ] || abortar "falta o es un enlace: $CONTROLADOR_SRC"
verde "Repo limpio en origin/main ($CABEZA)."

# ------------------------------------------------------------------ 2. trabajo --
TRABAJO=$(mktemp -d /tmp/vz-instalar.XXXXXX)
trap 'rm -rf "$TRABAJO"' EXIT
for entrada in "${ARCHIVOS[@]}"; do
  IFS=: read -r src _ _ <<<"$entrada"
  install -m 644 "$ORIGEN/$src" "$TRABAJO/$src"
done
cp "$ORIGEN/test_guardian.py" "$ORIGEN/test_politica.py" "$ORIGEN/deny-retiradas.json" "$TRABAJO/"
cp "$CONTROLADOR_SRC" "$REPO/infraestructura/publicacion/test_controlador.py" "$TRABAJO/"
mkdir -p "$TRABAJO/origen"
cp "$ORIGEN/origen/politica_actual.json" "$TRABAJO/origen/"
chmod 755 "$TRABAJO" "$TRABAJO/origen"; chmod 644 "$TRABAJO"/*.* "$TRABAJO/origen"/*

# ------------------------------------------------------------------ 3. deny --
paso "2/7 Comparando reglas deny con la política instalada"
python3 - "$DESTINO/managed-settings.json" "$TRABAJO/politica.json" "$TRABAJO/deny-retiradas.json" <<'PY' || abortar "la política nueva elimina reglas deny sin documentar."
import json, sys
viejo = json.load(open(sys.argv[1]))["permissions"]["deny"]
nuevo = json.load(open(sys.argv[2]))["permissions"]["deny"]
retiradas = {r["regla"]: r for r in json.load(open(sys.argv[3]))["retiradas"]
             if all(str(r.get(k, "")).strip() for k in ("regla", "fecha", "motivo", "sustituida_por"))}
faltan = [r for r in viejo if r not in nuevo and "claude_ai_" not in r]
sin_documentar = [r for r in faltan if r not in retiradas]
for r in faltan:
    if r in retiradas:
        print(f"  RETIRADA a propósito: {r}\n      motivo: {retiradas[r]['motivo']}\n      la sustituye: {retiradas[r]['sustituida_por']}")
    else:
        print("  desaparece SIN documentar:", r)
print(f"  deny instaladas: {len(viejo)} · nuevas: {len(nuevo)} · retiradas documentadas: {len(faltan) - len(sin_documentar)} · sin documentar: {len(sin_documentar)}")
sys.exit(1 if sin_documentar else 0)
PY
verde "Ninguna regla deny desaparece sin documentar (las mcp__claude_ai_* ya no aplican: conectores desactivados)."

# ------------------------------------------------------------------ 4. pruebas --
paso "3/7 Ejecutando las baterías de pruebas"
como_usuario env CLAUDE_PROJECT_DIR="$REPO" python3 "$TRABAJO/test_politica.py" || abortar "falla test_politica."
if ! ( cd "$REPO" && como_usuario env CLAUDE_PROJECT_DIR="$REPO" python3 "$TRABAJO/test_guardian.py" ) >"$TRABAJO/pruebas.txt" 2>&1; then
  tail -40 "$TRABAJO/pruebas.txt"
  abortar "falla test_guardian (detalles arriba)."
fi
tail -1 "$TRABAJO/pruebas.txt"
como_usuario python3 "$TRABAJO/test_controlador.py" || abortar "falla test_controlador."
verde "Pruebas superadas."

# ------------------------------------------------------------------ 5. secretos --
paso "4/7 Buscando secretos en lo que se va a instalar"
if grep -nE '(sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_|eyJ[A-Za-z0-9_-]{30,}\.|sb_secret_|BEGIN [A-Z ]*PRIVATE KEY|password\s*=\s*\S{6,})' \
     "$TRABAJO/politica.json" "$TRABAJO/mcp.json" "$TRABAJO/guardian.py" "$TRABAJO/bloquear-config.py" \
     "$TRABAJO/controlador.py"; then
  abortar "hay algo que parece un secreto."
fi
verde "Sin secretos."

# ------------------------------------------------------------------ 6. resumen --
paso "5/7 Resumen"
for entrada in "${ARCHIVOS[@]}"; do
  IFS=: read -r src dst _ <<<"$entrada"
  printf '  %-28s %s\n' "$dst" "$(sha256sum <"$TRABAJO/$src" | cut -c1-16)"
done
printf '  %-28s %s\n' "$CONTROLADOR_DST" "$(sha256sum <"$TRABAJO/controlador.py" | cut -c1-16)"
case "$MODO" in
  activar) echo "  Modo sin confirmaciones: SE ACTIVA" ;;
  desactivar) echo "  Modo sin confirmaciones: SE DESACTIVA" ;;
  *) [ -f "$DESTINO/modo-autonomo" ] && echo "  Modo sin confirmaciones: sigue activo" || echo "  Modo sin confirmaciones: sigue desactivado" ;;
esac
confirmar INSTALAR

# ------------------------------------------------------------------ 7. instalar --
paso "6/7 Instalando"
RESPALDO=$(respaldar)
echo "Respaldo: $RESPALDO"
mkdir -p "$DESTINO/hooks"
rm -rf "$DESTINO/hooks/__pycache__"
for entrada in "${ARCHIVOS[@]}"; do
  IFS=: read -r src dst modo <<<"$entrada"
  install -m "$modo" -o root -g root "$TRABAJO/$src" "$DESTINO/$dst.nuevo"
  mv -f "$DESTINO/$dst.nuevo" "$DESTINO/$dst"
done
install -m 755 -o root -g root "$TRABAJO/controlador.py" "$CONTROLADOR_DST.nuevo"
mv -f "$CONTROLADOR_DST.nuevo" "$CONTROLADOR_DST"
case "$MODO" in
  activar) install -m 644 -o root -g root /dev/null "$DESTINO/modo-autonomo" ;;
  desactivar) rm -f "$DESTINO/modo-autonomo" ;;
esac

paso "7/7 Verificando"
if ! verificar_sha "$TRABAJO"; then
  rojo "La verificación falló: vuelvo al respaldo."
  cp -a "$RESPALDO/." "$DESTINO/"
  rm -f "$DESTINO/vz-publicar"
  if [ -f "$RESPALDO/vz-publicar" ]; then install -m 755 -o root -g root "$RESPALDO/vz-publicar" "$CONTROLADOR_DST"; else rm -f "$CONTROLADOR_DST"; fi
  abortar "instalación revertida a $(basename "$RESPALDO")."
fi
verde "sha256 verificado. Instalado desde $CABEZA."
echo
echo "Último paso: reinicia el servicio (corta la conversación abierta):"
echo "  sudo systemctl restart $SERVICIO"
echo "Para volver atrás: sudo vz-instalar-claude --revertir $(basename "$RESPALDO")"
