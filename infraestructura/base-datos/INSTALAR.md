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
- El rol: sin superusuario, sin CREATEROLE ni CREATEDB, **sin BYPASSRLS** (la protección RLS sigue activa también para él), sin pertenencia a otros roles, `noinherit` y como mucho 3 conexiones. No tiene nada en `auth`, `storage`, `extensions` ni `vault`.
- **Los tres vigilantes** (event triggers de la segunda barrera), con el mismo código que VeoAura; solo cambian los nombres (comprobado con `diff` el 2026-11-27):
  - `vz_bloquear_drop`: ningún DROP;
  - `vz_bloquear_borrado_de_objetos`: ningún ALTER … DROP;
  - `vz_proteger_tablas_nuevas`: ni DELETE ni TRUNCATE en las tablas que cree.
- Nunca se ejecutan: DELETE, DROP, TRUNCATE, MERGE, RENAME, DO, COPY, SET ROLE, SQL dinámico, `SECURITY DEFINER`, GRANT que amplíe acceso, RPC existentes y archivos `ACCION_MANUAL__` o con `-- VZ: ACCION_MANUAL`.
- **MCP de Supabase:** se apagará como en VeoAura, pero **en una PR aparte y solo cuando vz-sql esté comprobado en producción**. Hasta entonces sigue encendido.
- **Política y guardián:** solo la forma exacta de `vz-sql`, sin `$`, comillas invertidas, compuestos ni redirecciones.

## Diferencias aprobadas por el dueño (2026-11-27)

| Diferencia | Por qué |
| --- | --- |
| **Permisos tabla a tabla**, sin `on all tables`. CONTENIDO: 14 tablas (lecciones, políticas, categorías, productos, servicios, tarifas y ajustes) con SELECT, INSERT y UPDATE. LECTURA: 46 tablas (pedidos, clientes, analítica, noticias…) solo con SELECT. Fuera quedan 10: claves y nonces, dispositivos, límites de peticiones, conversaciones privadas, notas internas y cuentas personales. Nunca DELETE, TRUNCATE, REFERENCES ni TRIGGER | Nuestras migraciones de datos cambian esas 14 tablas. Los datos de clientes solo se leen: sus correcciones son ACCIÓN MANUAL |
| **Políticas RLS propias**, `vz_agente_leer`, `vz_agente_insertar` y `vz_agente_actualizar`, solo `to vz_agente` y solo en sus tablas | Con RLS activa, sin ellas vería 0 filas. No cambian nada para la tienda ni para otros roles |
| Una tabla nueva **no recibe nada sola** | Se añade a una lista del SQL del rol y el dueño lo vuelve a ejecutar (es repetible) |
| INSERT y UPDATE en la tienda solo como sentencia principal, **como mucho 100 filas por sentencia** (si no, se deshace TODO el archivo); sin `ON CONFLICT DO UPDATE` y sin INSERT/UPDATE dentro de CTEs o de funciones | Así el límite de filas siempre se puede medir |
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
4. **Política de Claude.** `sudo vz-instalar-claude` (permite las cinco órdenes de vz-sql; el MCP de Supabase sigue encendido).
5. **Prueba de humo.**
   - `/usr/local/bin/vz-sql estado` debe dar `estado: ok`, `usuario: vz_agente`, `disponible (3 de 3 vigilantes activos)` y `tablas_negocio_borrables: 0`.
   - Después `/usr/local/bin/vz-sql diagnostico-d8`.

## Volver atrás

- `sudo bash infraestructura/base-datos/instalar-sql.sh --revertir`: desactiva el socket y el servicio, sin borrar nada.
- En Supabase: `alter role vz_agente nologin;`.
- La política anterior se recupera revirtiendo la PR y ejecutando `sudo vz-instalar-claude`.

## Pruebas en un entorno aislado (antes de instalar)

```bash
python3 infraestructura/base-datos/test_vz_sql.py
```

Sin opciones, la batería busca sola:
- pglast, en `/opt/vz-sql/lib` o, si no está instalado, en `.expo/vzsql-lib`;
- los binarios de PostgreSQL, en `/usr/lib/postgresql` o, si no los hay, en `node_modules/@embedded-postgres` con los enlaces de `.expo/vzsql-pglib`.

También admite `--lib`, `--pg-bin` y `--pg-lib`.

- **pglast y psycopg:** en `.expo/vzsql-lib`, una carpeta que git ignora, descargados con `descargar_dependencias.py` y su hash verificado.
- **PostgreSQL de usar y tirar:** el de `embedded-postgres` (ver `docs/pruebas-sql-aisladas.md`), en una carpeta temporal, solo por socket y sin red. Al terminar se para y se borra.

## Cómo se aplica el límite de 100 filas

- **Medición:** el broker ejecuta cada sentencia en la misma transacción y mira `rowcount` justo después.
- **Si una pasa de 100:** hace `rollback` de la transacción entera. Se deshacen las sentencias anteriores del archivo y también el registro en `schema_migrations`, que va al final. No queda nada.
- **Comprobación:** lo prueban `test_broker.py` (12e) y `test_integracion_pg.py` («mixta», contra un PostgreSQL real).

## Riesgos residuales

- **Políticas `using (true)` para `vz_agente`:** en sus 60 tablas ve todas las filas, como antes el MCP (que entraba como `postgres`). Para cualquier otro rol no cambian nada. `auth`, `storage`, `vault` y las 10 tablas privadas siguen cerradas.
- **Triggers de la app:** el límite de 100 filas cuenta las filas de la sentencia, no las que cambien después los triggers de la app sobre otras tablas.
- **pglast:** VeoAura usa la 7.18, que ya no está en PyPI. Aquí se fija la 7.23, de la misma serie y con el mismo parser de PostgreSQL 17; su hash se comprobó con `--consultar` el 2026-11-27. Si PyPI retira alguna versión fijada, el instalador se detiene sin cambiar nada; se busca otra con `--consultar`.
