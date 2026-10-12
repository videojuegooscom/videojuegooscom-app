# VideojuegosZaragoza: instrucciones para Claude Code

Tienda web de videojuegos: Expo Router 6 + React Native Web (export estático), desplegada en
Vercel por Git (`main` = producción) y con Supabase (project_ref `rgvyvaineyodyxzwootl`).
Usuario del servidor: `videojuegoszaragoza`. No tocar nada de otros proyectos (VeoAura, Tradeandoia).

## Centro de Aprendizajes (obligatorio antes de cualquier cambio)

Antes de empezar cualquier cambio que pida el usuario, consulta sus correcciones guardadas y aplícalas:

```sql
select titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien
from public.aprendizajes where activa order by prioridad, categoria, updated_at desc
```

(por MCP de Supabase, solo lectura). Prioridad 1 = imprescindible, 2 = importante, 3 = preferencia.
Si una lección choca con lo que pide el usuario ahora, avísale antes de seguir. Cuando el usuario
te corrija algo, al terminar dale la lección ya redactada (título, categoría, prioridad, regla y
ejemplos) para que la guarde en Panel → Centro De Aprendizajes.

## Hábitos obligatorios

- **Un comando simple por llamada.** Nada de `cd … &&`, tuberías `|`, `;`, heredocs (`python3 -`, `cat >>`) ni `sed -i`. Si hacen falta varios pasos, varias llamadas.
- **Editar archivos solo con las herramientas Edit y Write**, nunca desde Bash.
- **Leer archivos fuera del repo con la herramienta Read**, no con Bash (la política solo está en `/etc/claude-code`).
- **Sin bucles de espera** (`sleep`, `while true`, `watch`). Si algo tarda, se vuelve a mirar después.
- **Todo cambio va en una rama con su PR**, para que siempre haya vuelta atrás. Nunca trabajar ni hacer push en `main`.
- **Publicar = `/usr/local/bin/vz-publicar publicar <número>`** cuando la vista previa de Vercel esté en verde (antes, `revisar`). Nunca `gh pr merge`. Si el controlador rechaza la PR (rutas protegidas, borrados, permisos delicados…), la fusiona el usuario.
- **Textos largos de PR** con `--body-file` (un archivo del repo), para que el comando quepa en una línea.
- **Secretos:** nunca leer ni mostrar `.env*`, claves ni tokens, ni nombrar archivos `.env` en comandos.
- **Base de datos:** consultas de lectura por MCP (`execute_sql`). Los cambios van como SQL aditivo en `supabase/migrations/<fecha>_<nombre>.sql` dentro de una rama; tras publicarla, `git fetch origin main` y `apply_migration` con `name=<nombre>` y el contenido EXACTO del archivo (el guardián lo compara con origin/main). Nunca `DELETE`, `DROP` ni `TRUNCATE`; los cambios de permisos delicados (grant, security definer, anon, using (true)) los aplica el usuario.
- Si algo se bloquea, no se rodea: se explica qué hace falta y se da al usuario el comando para Termius (como `veoaura`, con `python3`, nunca `jq`).

## Validaciones

- `npx --no-install tsc --noEmit`
- `npm run lint`
- `npm run build` (usa `.env.local`, ya creado en el servidor; no leerlo)
- `python3 infraestructura/claude-code/test_guardian.py` y `test_politica.py` si se toca la infraestructura.

## Entorno de seguridad

La política, el guardián y el modo sin confirmaciones se describen en `infraestructura/claude-code/README.md`.
Se instalan con `sudo vz-instalar-claude` (copia de root) desde `main`. El registro de decisiones del
guardián está en `~/registros/vz-guardian.log` (las dudas aprobadas en modo autónomo aparecen como `auto`).
No leer nada dentro de `~/.claude` desde Bash: Claude Code siempre pregunta. La memoria se lee con Read.
