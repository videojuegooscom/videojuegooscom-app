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
- **Publicar = `/usr/local/bin/vz-publicar publicar <número>`** cuando la vista previa de Vercel y la revisión automática de GitHub estén en verde (antes, `revisar`). Nunca `gh pr merge`. El controlador publica casi todo; solo rechaza las barreras (infraestructura, `.github`, `.claude`, `.mcp.json`), dependencias, `scripts/`, más de 10 borrados y SQL destructivo: esas las fusiona el usuario. Las migraciones con permisos delicados se fusionan, pero aplicarlas en Supabase sigue siendo del usuario.
- **Toda rama pasa `tsc --noEmit` antes del push**, aunque solo toque `api/` o un texto.
- **Textos largos de PR** con `--body-file` (un archivo del repo), para que el comando quepa en una línea.
- **Secretos:** nunca leer ni mostrar `.env*`, claves ni tokens, ni nombrar archivos `.env` en comandos.
- **Base de datos:** consultas de lectura por MCP (`execute_sql`). Los cambios van como SQL aditivo en `supabase/migrations/<fecha>_<nombre>.sql` dentro de una rama; tras publicarla, `git fetch origin main` y `apply_migration` con `name=<nombre>` y el contenido EXACTO del archivo (el guardián lo compara con origin/main). Nunca `DELETE`, `DROP` ni `TRUNCATE`; los cambios de permisos delicados (grant, security definer, anon, using (true)) los aplica el usuario.
- Si algo se bloquea, no se rodea: se explica qué hace falta y se da al usuario el comando para Termius (como `veoaura`, con `python3`, nunca `jq`).

## Asesor de modelos (en cada respuesta)

Para gastar menos tokens, cada respuesta termina con "Modelo recomendado": qué modelo y esfuerzo
conviene para lo siguiente. Si el usuario manda varias tareas, se clasifican una por una con esta tabla
(se elige el más barato que la resuelva bien; Claude no puede cambiar de modelo solo: lo cambia el
usuario con `/model` y el esfuerzo con `/effort`, o en el selector de la app).

| Modelo · esfuerzo | Para qué |
|---|---|
| Haiku 5.5 | Preguntas rápidas, consultar estado (PR, Vercel, datos), explicar algo, textos cortos, publicar una PR ya hecha. |
| Sonnet 5.5 · medio | Cambios pequeños en 1-2 pantallas: textos, colores, espaciados, iconos, arreglos de un fallo localizado. |
| Opus 5.5 · medio | Funciones nuevas que tocan varias pantallas o la base de datos (tablas, migraciones normales), rediseños de una sección. |
| Opus 5.5 · alto | Varias funciones a la vez con ayudantes en paralelo, revisiones completas de la tienda o del panel, fallos difíciles de encontrar, rendimiento. |
| Opus 5.5 · extra | Seguridad, permisos y migraciones delicadas, infraestructura (guardián, política, controlador), pagos y datos de clientes. |

Criterios para bajar de nivel: tarea clara y acotada, sin base de datos ni seguridad, y que no requiera
investigar el código. Criterios para subir: afecta a dinero, datos de clientes, permisos o a muchas pantallas.

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
