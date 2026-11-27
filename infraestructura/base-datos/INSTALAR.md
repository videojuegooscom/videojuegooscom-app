<!-- == VIDEOJUEGOSZARAGOZA ====================================================
Archivo:        infraestructura/base-datos/INSTALAR.md (adaptado de la guía del intermediario SQL de VeoAura, commit eb5f74fc)
Función:        Qué es vz-sql, qué permite y qué bloquea, en qué se diferencia de VeoAura, cómo instalarlo y
                activarlo contra el Supabase real, cómo comprobarlo y cómo volver atrás.
Conectado con:  instalar-sql.sh, broker.py, clasificador.py, cliente.py, ACCION_MANUAL__rol_vz_agente_2026-11-27.sql,
                infraestructura/claude-code (política y guardián).
============================================================================ -->

# vz-sql: acceso directo y controlado al Supabase de VideojuegosZaragoza

Réplica del intermediario SQL de VeoAura. El propietario de VeoAura autorizó compartir el código el 27/11/2026. **No se comparte nada en tiempo de ejecución**: este proyecto tiene su propio usuario Unix, socket, credencial, rol y auditoría.

## Cómo funciona

```
Claude (usuario videojuegoszaragoza) ── /usr/local/bin/vz-sql <orden> ──► socket /run/vz-sql/sql.sock
                                                                          │ (usuario vz-sql y grupo videojuegoszaragoza)
vz-sql broker (usuario vz-sql, systemd endurecido)  ◄─────────────────────┘
   ├─ lee /etc/videojuegoszaragoza-sql/conexion.env (root:vz-sql 0640: Claude NO puede leerlo)
   ├─ clasifica cada sentencia con pglast (parser real de PostgreSQL 17); si duda, bloquea
   ├─ ejecuta solo lo permitido, en una transacción con límites de tiempo
   ├─ guarda una COPIA DE ESTRUCTURA (metadatos, no datos) antes de cada «aplicar»
   └─ audita en /var/log/vz-sql/auditoria.jsonl (solo añadir; sin SQL, valores ni secretos)
          ▼ TLS (verify-full)
Supabase · rol vz_agente (sin superusuario; los tres vigilantes de la segunda barrera)
```

## Órdenes

| Orden | Qué hace |
| --- | --- |
| `vz-sql estado` | Conexión, versión, usuario, vigilantes activos (deben ser 3) y `tablas_negocio_borrables` (debe ser 0) |
| `vz-sql diagnostico-d8` | Diagnóstico del esquema (solo lectura) |
| `vz-sql consultar --sql 'select …'` o `--archivo x.sql` | Solo lectura, en transacción `READ ONLY`, máximo 500 filas |
| `vz-sql plan --archivo x.sql` | Analiza sin ejecutar y propone los archivos ACCION_MANUAL |
| `vz-sql aplicar --archivo supabase/migrations/<fecha>_<nombre>.sql` | Ejecuta una migración versionada, publicada e igual a `origin/main`, y la registra |

## Qué es igual que en VeoAura

- El clasificador, el intermediario, el cliente, las unidades de systemd, la auditoría, las copias de estructura y los límites de tiempo: 60 s por sentencia, 5 s de espera por bloqueo y 60 s de transacción inactiva, fijados en el rol y con `set local`.
- El rol: sin superusuario, sin CREATEROLE ni CREATEDB, sin pertenencia a otros roles, `noinherit` y como mucho 3 conexiones. No tiene nada en `auth`, `storage`, `extensions` ni `vault`.
- **Los tres vigilantes** (event triggers de la segunda barrera):
  - `vz_bloquear_drop`: ningún DROP;
  - `vz_bloquear_borrado_de_objetos`: ningún ALTER … DROP;
  - `vz_proteger_tablas_nuevas`: ni DELETE ni TRUNCATE en las tablas que cree.
- Nunca se ejecutan: DELETE, DROP, TRUNCATE, MERGE, RENAME, DO, COPY, SET ROLE, SQL dinámico, `SECURITY DEFINER`, GRANT que amplíe acceso, RPC existentes y archivos `ACCION_MANUAL__` o con `-- VZ: ACCION_MANUAL`.
- **MCP de Supabase apagado**, como en VeoAura. La política lo quita de los servidores permitidos y prohíbe `mcp__supabase`.
- **Política y guardián:** solo la forma exacta de `vz-sql`, sin `$`, comillas invertidas, compuestos ni redirecciones.

## Diferencias aprobadas por el dueño (2026-11-27)

| Diferencia | Por qué |
| --- | --- |
| El rol **lee, inserta y actualiza** las tablas de la tienda (`public`), nunca DELETE ni TRUNCATE | Nuestras migraciones cambian datos de tablas que ya existen (p. ej. los textos de `policy_pages`) y, con el MCP apagado, toda lectura pasa por vz-sql |
| `UPDATE` en la tienda solo como sentencia principal, con `WHERE` y como mucho 100 filas (si no, se deshace); sin `ON CONFLICT DO UPDATE` y sin INSERT/UPDATE dentro de CTEs o de funciones | Así el límite de filas siempre se puede medir |
| `BYPASSRLS` | Sin él, la lectura y los UPDATE de tablas con RLS verían 0 filas sin avisar. No da más permisos sobre las tablas |
| `aplicar` solo acepta `supabase/migrations/<14 cifras>_<nombre>.sql` igual a `origin/main`, una sola vez, y la registra en `supabase_migrations.schema_migrations` | Era nuestra regla con `apply_migration`. VeoAura no la tiene |
| `estado` comprueba `tablas_negocio_borrables` = 0 y los 3 vigilantes | Sustituye a la comprobación de VeoAura de no leer tablas de negocio |
| En modo autónomo, las dudas del guardián se **bloquean** (en VeoAura pasan) | Se conserva nuestro guardián, más estricto |

Las tablas de la tienda pertenecen a `postgres`. Por eso, aunque el clasificador las acepte, la base de datos rechaza en ellas ALTER TABLE, CREATE POLICY, CREATE TRIGGER y CREATE INDEX: hay que ser el dueño de la tabla. Esas migraciones se quedan como ACCIÓN MANUAL que aplica el dueño en el SQL Editor. Los permisos delicados (grant, security definer, anon, `using (true)`) también siguen siendo suyos.

## Instalación (una vez, tras fusionar la PR)

```bash
cd /home/videojuegoszaragoza/apps/videojuegooscom-app && git pull --ff-only
sudo bash infraestructura/base-datos/instalar-sql.sh
```

El instalador:
- crea el usuario `vz-sql`;
- descarga pglast y psycopg con hash verificado;
- ejecuta las pruebas, y si alguna falla se detiene sin activar nada;
- activa solo `vz-sql.socket`.

No reinicia ningún otro servicio: tampoco Claude Remote Control. La prueba de integración necesita un PostgreSQL local; si no lo hay, se marca como **OMITIDA**.

## Activación contra el Supabase real

1. **Rol.** En el SQL Editor, como `postgres`:
   - pega `infraestructura/base-datos/ACCION_MANUAL__rol_vz_agente_2026-11-27.sql`, cambiando `__CONTRASENA_DEL_AGENTE__` solo en la copia;
   - ejecútalo y borra la consulta del historial;
   - las comprobaciones del final deben salir como dice cada comentario.
2. **Certificado.** *Settings → Database → SSL Configuration → Download*. Después:
   ```bash
   sudo install -o root -g vz-sql -m 0640 prod-ca-2021.crt /etc/videojuegoszaragoza-sql/supabase-ca.crt
   ```
3. **Conexión.** Ejecuta `sudoedit /etc/videojuegoszaragoza-sql/conexion.env` y rellena:
   - el host del *Session pooler* (puerto 5432);
   - el usuario `vz_agente.<project_ref>`;
   - la contraseña.
4. **Política de Claude.** `sudo vz-instalar-claude` (apaga el MCP de Supabase y permite las cinco órdenes de vz-sql).
5. **Prueba de humo.**
   - `/usr/local/bin/vz-sql estado` debe dar `estado: ok`, `usuario: vz_agente`, `disponible (3 de 3 vigilantes activos)` y `tablas_negocio_borrables: 0`.
   - Después `/usr/local/bin/vz-sql diagnostico-d8`.

## Volver atrás

- `sudo bash infraestructura/base-datos/instalar-sql.sh --revertir`: desactiva el socket y el servicio, sin borrar nada.
- En Supabase: `alter role vz_agente nologin;`.
- La política anterior se recupera revirtiendo la PR y ejecutando `sudo vz-instalar-claude`.

## Riesgos residuales

- **`BYPASSRLS`:** el rol lee todas las filas de `public`, igual que hacía el MCP (que entraba como `postgres`). `auth`, `storage` y `vault` siguen cerrados.
- **INSERT en la tienda:** no tiene límite de filas. Añadir filas no borra nada, pero un INSERT grande se nota; se revisa en la PR de la migración.
- **pglast 7.18:** desde la sesión de Claude, PyPI devolvió 404 al pedir esa versión. Si la descarga falla, el instalador se detiene sin cambiar nada y hay que revisar `requisitos.txt`.
