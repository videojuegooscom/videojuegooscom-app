<!--
infraestructura/claude-code/README.md
Qué hace: explica qué es cada pieza de las barreras de Claude Code en el servidor (política,
  guardián, pruebas, instalador, controlador de publicación) y cómo se instalan.
Conectado con: lo cita CLAUDE.md («Entorno de seguridad»). Describe politica.json, mcp.json,
  guardian.py, bloquear-config.py, test_guardian.py, test_politica.py, instalar.sh,
  deny-retiradas.json, origen/ y ../publicacion/controlador.py.
-->

# Infraestructura de Claude Code (VideojuegosZaragoza)

Fuentes versionadas de la política gestionada, el guardián, las pruebas y el instalador. Se
instalan en `/etc/videojuegoszaragoza/claude-code`, que el servicio `videojuegoszaragoza-remote`
monta como `/etc/claude-code`. El `/etc/claude-code` real del sistema (de VeoAura) no se toca.

| Archivo | Se instala como | Qué hace |
|---|---|---|
| `politica.json` | `managed-settings.json` | Reglas allow (trabajo normal) y deny (irreversible). Sin «ask». |
| `mcp.json` | `managed-mcp.json` | Supabase (solo lectura) y Vercel, limitados a este proyecto, y Stripe (solo lectura, ver abajo). |
| `guardian.py` | `hooks/guardian.py` | Hook PreToolUse: deniega lo peligroso aunque llegue disfrazado, aprueba la lectura demostrable y, en modo autónomo, deja pasar las dudas no críticas anotándolas como «auto». |
| `bloquear-config.py` | `hooks/bloquear-config.py` | Hook ConfigChange: impide cambiar la configuración durante una sesión. |
| `test_guardian.py`, `test_politica.py` | — | Baterías que ejecuta el instalador antes de instalar. |
| `instalar.sh` | `/usr/local/sbin/vz-instalar-claude` | Instalador (copia de root). |
| `../publicacion/controlador.py` | `/usr/local/bin/vz-publicar` | Controlador de publicación: fusiona solo PR seguras (Vercel en verde, sin borrados, sin rutas protegidas, sin secretos ni SQL peligroso). |
| `deny-retiradas.json` | — | Reglas deny retiradas a propósito, con motivo y protección que las sustituye (el instalador no acepta otras). |
| `origen/` | — | Copia de lo que había instalado antes de este cambio, para comparar. |

## Modo sin confirmaciones

Se activa con el archivo `modo-autonomo` (de root) junto a la política: `sudo vz-instalar-claude --autonomo`.
En ese modo las dudas del guardián no muestran ventana: pasan y quedan en `~/registros/vz-guardian.log`
como `"decision": "auto"`. Las reglas deny se mantienen siempre, y las dudas críticas (ejecutar
código no visible, red, dependencias de origen raro, escrituras en la base de datos o en producción,
escribir fuera del proyecto, descartar trabajo) se deniegan.

## Supabase

La conexión MCP ya no es de solo lectura, pero el guardián solo deja escribir con `apply_migration`
cuando el SQL es idéntico a un archivo de `supabase/migrations/` que ya está en `origin/main`, es
aditivo y no cambia permisos delicados. `execute_sql` sigue siendo solo lectura.

## Stripe (desde 2026-11-06)

Para comprobar pagos, devoluciones y avisos (webhooks) sin depender de capturas. **Solo lectura**:
`revisar_stripe_mcp` del guardián clasifica una a una las herramientas reales del servidor de Stripe. Pasan:
- ver las cuentas conectadas y buscar en la documentación;
- buscar y describir operaciones de la API;
- `stripe_api_read`, solo con operaciones GET (`Get…`);
- en informes y analítica, solo consultar lo que ya existe.

Se **deniega** siempre, también en modo autónomo: `stripe_api_write`, gestionar cuentas, enviar comentarios a Stripe,
crear informes o lanzar consultas, y cualquier herramienta nueva sin clasificar. Los cobros y las devoluciones siguen solo en la tienda (`api/pago.ts`, botón de Pedidos con la sesión del
administrador). No hay ninguna clave en el repositorio: el acceso se da iniciando sesión con `/mcp` (como Vercel),
primero en el **entorno de prueba** de Stripe.

## Instalación (como veoaura)

```bash
# Una vez, tras revisar instalar.sh en main:
sudo install -m 700 -o root -g root /home/videojuegoszaragoza/apps/videojuegooscom-app/infraestructura/claude-code/instalar.sh /usr/local/sbin/vz-instalar-claude
# Cada instalación (el repo debe estar limpio y en origin/main):
sudo vz-instalar-claude --autonomo
sudo systemctl restart videojuegoszaragoza-remote.service
# Volver atrás:
sudo vz-instalar-claude --respaldos
sudo vz-instalar-claude --revertir 20261012-101500
```
