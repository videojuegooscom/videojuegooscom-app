#!/usr/bin/env bash
# == VIDEOJUEGOSZARAGOZA ========================================================
# Archivo:        infraestructura/base-datos/instalar-sql.sh (copia adaptada de VeoAura, commit eb5f74fc)
# Función:        Instala vz-sql en el servidor: usuario dedicado vz-sql, broker y clasificador en
#                 /opt/vz-sql, dependencias con hash verificado, cliente en /usr/local/bin/vz-sql,
#                 configuración SIN valores en /etc/videojuegoszaragoza-sql, auditoría de solo-añadir y
#                 unidades de systemd. Ejecuta las pruebas antes de activar.
# Para qué sirve: Un único paso humano (con sudo) para dar a Claude acceso controlado a Supabase.
# Utilizado por:  El dueño del servidor:
#                   sudo bash infraestructura/base-datos/instalar-sql.sh
#                   sudo bash infraestructura/base-datos/instalar-sql.sh --revertir
# Dependencias:   bash, python3, git, systemd, useradd/usermod, install, chattr (opcional).
#
# NO toca Supabase, NO escribe la contraseña, NO cambia la política de Claude (eso es
# vz-instalar-claude) y NO borra nada (--revertir solo desactiva). No toca VeoAura ni TradeandoIA.
# =============================================================================
set -euo pipefail

ORIGEN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPT=/opt/vz-sql
ETC=/etc/videojuegoszaragoza-sql
LOG=/var/log/vz-sql
LIB_ESTADO=/var/lib/vz-sql
CLIENTE=/usr/local/bin/vz-sql
GRUPO=videojuegoszaragoza
USUARIO_PRUEBAS="${SUDO_USER:-videojuegoszaragoza}"

rojo()  { printf '\033[31m%s\033[0m\n' "$*"; }
verde() { printf '\033[32m%s\033[0m\n' "$*"; }
paso()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
abortar() { rojo "ABORTADO: $*"; exit 1; }

[ "$(id -u)" -eq 0 ] || { rojo "Ejecuta con sudo: sudo bash $0"; exit 1; }
[ "$USUARIO_PRUEBAS" != "root" ] || USUARIO_PRUEBAS=videojuegoszaragoza

if [ "${1:-}" = "--revertir" ]; then
  paso "Desactivando vz-sql (no se borra nada)"
  systemctl disable --now vz-sql.socket vz-sql.service 2>/dev/null || true
  verde "vz-sql desactivado. Para cortar también el acceso en Supabase ejecuta allí:"
  echo "  alter role vz_agente nologin;"
  echo "La retirada de archivos (/opt/vz-sql, $CLIENTE, $ETC, unidades) es una acción manual."
  exit 0
fi
[ $# -eq 0 ] || abortar "argumento no reconocido: $1"

paso "1/8 Comprobaciones previas"
for f in broker.py clasificador.py cliente.py diagnostico_d8.sql requisitos.txt descargar_dependencias.py \
         vz-sql.socket vz-sql.service conexion.env.plantilla test_clasificador.py test_broker.py \
         test_integracion_pg.py test_vz_sql.py ACCION_MANUAL__rol_vz_agente_2026-11-27.sql; do
  [ -f "$ORIGEN/$f" ] || abortar "falta $ORIGEN/$f"
done
command -v git >/dev/null || abortar "falta git"
getent group "$GRUPO" >/dev/null || abortar "no existe el grupo $GRUPO"
if [ -n "$(runuser -u "$USUARIO_PRUEBAS" -- git -C "$ORIGEN" status --porcelain -- . 2>/dev/null)" ]; then
  abortar "hay cambios sin commit en $ORIGEN: instala solo una versión versionada"
fi
echo "Origen: $ORIGEN ($(runuser -u "$USUARIO_PRUEBAS" -- git -C "$ORIGEN" log -1 --format='%h %s' 2>/dev/null || echo '?'))"

paso "2/8 Usuario dedicado vz-sql"
if ! id vz-sql >/dev/null 2>&1; then
  useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin vz-sql
fi
usermod -aG "$GRUPO" vz-sql   # leer los .sql del repo y crear el socket para el grupo del proyecto
id vz-sql

paso "3/8 Carpetas y permisos"
install -d -o root -g root -m 0755 "$OPT" "$OPT/lib"
install -d -o root -g vz-sql -m 0750 "$ETC"
install -d -o vz-sql -g vz-sql -m 0750 "$LOG" "$LIB_ESTADO" "$LIB_ESTADO/estructura"

paso "4/8 Dependencias con hash verificado (pglast, psycopg)"
NUEVA_LIB="$(mktemp -d /tmp/vz-sql-lib-XXXXXX)"
trap 'rm -rf "$NUEVA_LIB"' EXIT
python3 -I "$ORIGEN/descargar_dependencias.py" "$NUEVA_LIB" || abortar "fallo al descargar o verificar dependencias"
cp -a "$NUEVA_LIB/." "$OPT/lib/"
chown -R root:root "$OPT/lib"
chmod -R u=rwX,go=rX "$OPT/lib"

paso "5/8 Broker, clasificador, D8 y cliente"
install -o root -g root -m 0644 "$ORIGEN/broker.py" "$ORIGEN/clasificador.py" "$ORIGEN/diagnostico_d8.sql" "$OPT/"
install -o root -g root -m 0755 "$ORIGEN/cliente.py" "$CLIENTE"
if [ ! -e "$ETC/conexion.env" ]; then
  install -o root -g vz-sql -m 0640 "$ORIGEN/conexion.env.plantilla" "$ETC/conexion.env"
  echo "Creado $ETC/conexion.env SIN valores (rellénalo con sudoedit)."
else
  chown root:vz-sql "$ETC/conexion.env"; chmod 0640 "$ETC/conexion.env"
  echo "$ETC/conexion.env ya existe: no se toca su contenido."
fi
touch "$LOG/auditoria.jsonl"
chown vz-sql:vz-sql "$LOG/auditoria.jsonl"
chmod 0640 "$LOG/auditoria.jsonl"
chattr +a "$LOG/auditoria.jsonl" 2>/dev/null && echo "auditoría en modo solo-añadir (chattr +a)" \
  || echo "AVISO: el sistema de archivos no admite chattr +a; la auditoría queda en 0640"

paso "6/8 Pruebas (como $USUARIO_PRUEBAS, sin privilegios)"
# test_vz_sql.py: comprobaciones propias y, con pglast, test_clasificador, test_broker y test_integracion_pg.
runuser -u "$USUARIO_PRUEBAS" -- env -i PATH=/usr/bin:/bin HOME="/home/$USUARIO_PRUEBAS" \
  python3 "$ORIGEN/test_vz_sql.py" --lib "$OPT/lib" || abortar "fallan las pruebas de vz-sql"
[ -d "$OPT/lib/pglast" ] || abortar "pglast no quedó instalado en $OPT/lib"

paso "7/8 Unidades de systemd"
install -o root -g root -m 0644 "$ORIGEN/vz-sql.socket" "$ORIGEN/vz-sql.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now vz-sql.socket
systemctl is-active vz-sql.socket

paso "8/8 Siguiente paso"
verde "vz-sql instalado. Supabase todavía NO está conectado."
cat <<FIN
1. Ejecuta infraestructura/base-datos/ACCION_MANUAL__rol_vz_agente_2026-11-27.sql en el SQL Editor de Supabase
   (como postgres), poniendo tú la contraseña SOLO en la copia que pegues.
2. Descarga el certificado CA de Supabase a $ETC/supabase-ca.crt (root:vz-sql 0640).
3. Rellena la conexión:  sudoedit $ETC/conexion.env
4. Instala la política de Claude:  sudo vz-instalar-claude
5. Prueba:  /usr/local/bin/vz-sql estado   y después   /usr/local/bin/vz-sql diagnostico-d8
Revertir (sin borrar nada):  sudo bash $ORIGEN/instalar-sql.sh --revertir
FIN
