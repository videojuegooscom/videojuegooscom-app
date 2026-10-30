# VideojuegosZaragoza: instrucciones para Claude Code

Tienda web de videojuegos: Expo Router 6 + React Native Web (export estático), desplegada en
Vercel por Git (`main` = producción) y con Supabase (project_ref `rgvyvaineyodyxzwootl`).
Usuario del servidor: `videojuegoszaragoza`. No tocar nada de otros proyectos (VeoAura, Tradeandoia).

## Centro de Aprendizajes (obligatorio antes de CADA respuesta)

Antes de cada respuesta (no solo antes de un cambio), consulta las lecciones guardadas y aplícalas:

```sql
select titulo, categoria, prioridad, regla, ejemplo_mal, ejemplo_bien
from public.aprendizajes where activa order by prioridad, categoria, updated_at desc
```

(por MCP de Supabase, solo lectura). Prioridad 1 = imprescindible, 2 = importante, 3 = preferencia.
Si una lección choca con lo que pide el usuario ahora, avísale antes de seguir. Cuando el usuario
te corrija algo, te pida aprender algo o tú detectes algo que debes aprender, **apúntalo tú** en la
tabla (no se lo pidas al usuario): añade un insert idempotente (`where not exists` por título) en una
migración `supabase/migrations/<fecha>_aprendizajes_<tema>.sql`, ábrela con su PR y déjala pendiente:
aplicarla con `apply_migration` (execute_sql no puede escribir) exige la autorización expresa del
dueño (regla permanente de «Hábitos obligatorios»). En el RESUMEN de la respuesta di qué lección
has apuntado y que queda pendiente de aplicar.

## Hábitos obligatorios

- **Formato de respuesta (dueño, 2026-10-20): SOLO 4 apartados, con estos títulos en mayúsculas y en viñetas de una línea: RESUMEN, RECOMENDACIONES, TRABAJO PENDIENTE, MODELO RECOMENDADO.** Los pasos y autorizaciones que necesita el dueño y los comandos de Termius van en TRABAJO PENDIENTE; la lección apuntada (pendiente de aplicar) y los permisos especiales usados, en una línea del RESUMEN.
- **Toda novedad de la tienda tiene su parte en Administración (dueño, 2026-10-30, OBLIGATORIO).** Cada cambio que toque a los clientes (datos que rellenan, pantallas o pasos obligatorios nuevos, funciones, avisos) se refleja en la MISMA PR en su apartado de Administración (p. ej. Usuarios y la ficha del cliente para el perfil): verlo, contarlo, filtrarlo y medir su uso con la analítica propia. Siempre dentro de lo legal: solo datos que cubre la política de privacidad, edad en vez de fecha de nacimiento, agregados cuando basten y nada de quien rechazó la analítica. Si no hay apartado, va al más afín. Se prueba igual que la tienda.
- **Un comando simple por llamada.** Nada de `cd … &&`, tuberías `|`, `;`, heredocs (`python3 -`, `cat >>`) ni `sed -i`. Si hacen falta varios pasos, varias llamadas.
- **Editar archivos solo con las herramientas Edit y Write**, nunca desde Bash.
- **Leer archivos fuera del repo con la herramienta Read**, no con Bash (la política solo está en `/etc/claude-code`).
- **Sin bucles de espera** (`sleep`, `while true`, `watch`). Si algo tarda, se vuelve a mirar después.
- **Todo cambio va en una rama con su PR**, para que siempre haya vuelta atrás. Nunca trabajar ni hacer push en `main`.
- **FUSIÓN AUTOMÁTICA (dueño, 2026-10-29: «quiero que siempre fusiones automáticamente sin que me pidas confirmación»; sustituye a la regla del 2026-10-18 en lo que decía de fusionar y publicar).** Claude fusiona y publica él mismo, SIN pedir confirmación, cada PR suya en cuanto la vista previa de Vercel y la revisión automática de GitHub estén en verde, y después comprueba producción (despliegue listo, errores, la web real) y lo cuenta. No se pregunta «¿fusiono?» ni se espera un «fusiona #N». **Sigue necesitando la autorización expresa del dueño:** aplicar migraciones (una a una; los permisos delicados los aplica él) y cualquier cosa destructiva. Lo que el controlador rechaza lo fusiona el dueño (no se rodea). Tras cada bloque importante se informa de: qué se ha completado y publicado, qué se ha verificado de verdad, qué falta y qué está bloqueado y por qué. No se toca VeoAura, TradeandoIA ni el Supervisor Central.
- **Publicar = `/usr/local/bin/vz-publicar publicar <número>`** cuando la vista previa de Vercel y la revisión automática de GitHub estén en verde (antes, `revisar`). **Sin tardar (dueño, 2026-10-30): las comprobaciones tardan unos 4 min (más si Vercel tiene otro despliegue en cola); nada más abrir la PR se programa una revisión CADA 3 MINUTOS (CronCreate recurrente `*/3`, que no es un bucle de espera) que publica en cuanto esté en verde y después se borra (CronDelete); sin escribir al dueño mientras no esté en verde.** Nunca `gh pr merge`. El controlador publica casi todo; solo rechaza las barreras (infraestructura, `.github`, `.claude`, `.mcp.json`), dependencias, `scripts/`, más de 10 borrados y SQL destructivo: esas las fusiona el usuario. Las migraciones con permisos delicados se fusionan, pero aplicarlas en Supabase sigue siendo del usuario.
- **Toda rama pasa `tsc --noEmit` antes del push**, aunque solo toque `api/` o un texto.
- **Textos largos de PR** con `--body-file` (un archivo del repo), para que el comando quepa en una línea. El cuerpo hay que dejarlo bien al crear la PR: `gh pr edit` falla (Projects classic) y el guardián bloquea `gh api` con PATCH; las correcciones posteriores van como comentario (`gh pr comment`).
- **Secretos:** nunca leer ni mostrar `.env*`, claves ni tokens, ni nombrar archivos `.env` en comandos.
- **Base de datos:** consultas de lectura por MCP (`execute_sql`). Los cambios van como SQL aditivo en `supabase/migrations/<fecha>_<nombre>.sql` dentro de una rama; tras publicarla y con la autorización expresa del dueño para esa migración, `git fetch origin main` y `apply_migration` con `name=<nombre>` y el contenido EXACTO del archivo (el guardián lo compara con origin/main). Nunca `DELETE`, `DROP` ni `TRUNCATE`; los cambios de permisos delicados (grant, security definer, anon, using (true)) los aplica el usuario.
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
