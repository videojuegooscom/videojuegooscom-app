# Pruebas SQL reales en una base aislada

Sirven para ejecutar de verdad las migraciones y sus vueltas atrás **sin tocar producción**: una base
PostgreSQL de usar y tirar, solo en el propio servidor (`127.0.0.1`), con el esqueleto mínimo de Supabase
(roles `anon`, `authenticated`, `service_role`, `auth.uid()` y los permisos por defecto de Supabase).

## Piezas

| Archivo | Qué es |
|---|---|
| `supabase/tests/aislado/00_supabase_stub.sql` | El esqueleto de Supabase y la tabla `products` con las columnas reales |
| `supabase/tests/aislado/10_tablas_ajenas.sql` | Tablas de otros temas que migraciones antiguas tocan de pasada |
| `pruebas/sql-aislado.mjs` | Crea bases, las clona y aplica archivos SQL. Se **niega** a trabajar si el servidor no es local, si su nombre contiene «supabase» o si la base no empieza por `vz_aislada_` |
| `pruebas/lecciones-sql.mjs` | Pruebas de las migraciones de lecciones (aplicar, repetir, deshacer, prioridades, límites, orden) |
| `pruebas/pedidos-sql.mjs` | (llega con la PR #77) Pruebas de `crear_pedido_idempotente` con peticiones concurrentes reales |

Nada de esto borra: cada ejecución usa una base nueva (`vz_aislada_<hora>`).

## Cómo se arranca el PostgreSQL de pruebas

Hace falta el cliente `psql` (ya está instalado) y los binarios de un PostgreSQL 17. La forma que se ha
usado (el 2026-10-18) es el paquete `embedded-postgres`, instalado **sin guardarlo** en `package.json`:

1. `npm install --no-save embedded-postgres@17.9.0-beta.16 playwright-core@1.64.1`
   (ojo: `npm install` elimina los paquetes «sobrantes» que no estén declarados, como `playwright-core`;
   por eso se reinstalan juntos).
2. El script de instalación del paquete (que crea los enlaces de las librerías) **no se ejecuta**: el guardián
   no deja ejecutar scripts de dependencias. Los enlaces se crean a mano en una carpeta temporal
   (`libicuuc.so.60`, `libicui18n.so.60`, `libicudata.so.60`, `libpq.so.5`, cada uno apuntando a su versión
   `.60.2` / `.5.17` dentro de `node_modules/@embedded-postgres/linux-x64/native/lib`) y se usa
   `LD_LIBRARY_PATH` apuntando a esa carpeta y a `native/lib`.
3. `initdb -D <carpeta> --username=postgres --auth=trust --encoding=UTF8 --locale=C`
4. `pg_ctl -D <carpeta> -l <registro> -o "-p 55432 -c listen_addresses=127.0.0.1 -c unix_socket_directories= -c fsync=off" start`
   (solo escucha en el bucle local; `--auth=trust` significa que cualquier usuario del servidor podría
   conectarse, por eso solo se deja arrancado mientras se prueba y solo contiene datos de prueba).
5. `node pruebas/sql-aislado.mjs postgresql://postgres@127.0.0.1:55432 base` crea una base con el esqueleto.
6. Al terminar: `pg_ctl -D <carpeta> stop`.

## Réplica de la tabla de lecciones

`conectar(...).crearBaseConHistorial()` repite en orden las migraciones de lecciones del repo. El 2026-10-18 la
réplica coincidió con producción en: 55 filas, suma de longitudes de reglas (19.569), de `ejemplo_mal` (3.626),
de `ejemplo_bien` (3.960), suma ponderada por prioridad (22.847), suma de longitud de título por longitud de regla
(846.694) y el principio y el final de cada regla. Esa comprobación se hizo con consultas de solo lectura a
producción; no hace falta repetirla salvo que cambien las lecciones.

## Qué NO prueban

- No sustituyen a una rama de Supabase para ensayar con el servicio real (Auth, PostgREST, Realtime).
- La RLS y los permisos se prueban con los roles y los permisos por defecto replicados, no con los de producción
  (se han leído de producción y copiado, pero no se comparan automáticamente).
