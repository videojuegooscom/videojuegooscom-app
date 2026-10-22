# Pruebas de la tienda: cómo ejecutarlas desde una instalación limpia

Todas las pruebas son archivos de `pruebas/` que se lanzan con `node` (Node 24, el de `engines`). Ninguna toca
producción para escribir: las de navegador cortan cualquier petición de escritura a la base de datos y las de SQL
solo hablan con un PostgreSQL local de usar y tirar.

## Qué hace falta (y cómo se instala)

| Para… | Hace falta | Cómo |
|---|---|---|
| Pruebas de navegador (`movil`, `blue-regresion`, y las que lleguen con otras PR) | `playwright-core` | Ya está declarado en `package.json` (`devDependencies`, versión exacta 1.64.1): lo instala `npm ci`. **Antes no lo estaba**: solo existía en una copia local y `npm install` lo borraba por «sobrante». |
| … el navegador en sí | Chromium sin pantalla | `playwright-core` no lo descarga. `npx playwright-core install chromium-headless-shell` (una vez) o apuntar `PLAYWRIGHT_BROWSERS_PATH` a uno ya instalado (en este servidor hay uno en `/opt/pw-browsers`). Las librerías del sistema (libnss3, libnspr4, fuentes…) las instala el dueño con sudo: `npx playwright-core install-deps --dry-run chromium-headless-shell` muestra la lista. |
| Pruebas sobre la tienda compilada | La carpeta `dist` | `npm run build` (usa `.env.local`, que no se lee ni se sube). Algunas pruebas aceptan también una dirección (`https://videojuegoszaragoza.com`). |
| Pruebas SQL (`*-sql.mjs`, `pedidos`, `lecciones`…) | `psql` y un PostgreSQL de pruebas | **No salen de `npm ci`**: ver `docs/pruebas-sql-aisladas.md` (llega con otras PR). |

Comprobación de que `package.json` y `package-lock.json` están sincronizados y que una instalación limpia
funcionaría (no modifica nada): `npm ci --dry-run`.

## Pruebas de navegador

| Prueba | Qué comprueba | Comando |
|---|---|---|
| `pruebas/movil.mjs` | Cada página a tamaño de iPhone: sin desbordes, sin errores de consola, Blue responde a los toques, guía de Blue | `node pruebas/movil.mjs [dirección] [carpeta_de_capturas]` |
| `pruebas/blue-regresion.mjs` | Blue (y su mensaje) no tapa ningún botón, en 4 tamaños de pantalla; Blue no cae abajo a la derecha y se aparta de un botón | `node pruebas/blue-regresion.mjs dist` o `node pruebas/blue-regresion.mjs https://videojuegoszaragoza.com` (escenario opcional como 4.º argumento: `posicion`, `paginas`, `primera`) |

Si una prueba no puede comprobar nada (por ejemplo, Blue no se pinta en una página), lo dice con `AVISO` y falla si
no llegó a medir ninguna página: un «todo bien» sin haber medido no vale.

## Pruebas que llegan con otras PR

Cada una se documenta en su cabecera: `pruebas/pedido-idempotente.mjs` (checkout), `pruebas/interaccion-cliente.mjs`
(visitas y «me gusta» en la ficha), `pruebas/api-limite.mjs`, `pruebas/blue-ia-abuso.mjs`,
`pruebas/escaparate-registro.mjs` e `pruebas/interaccion-api.mjs` (manejadores de `api/`; Node 24 ejecuta
TypeScript sin compilar), y las de SQL real.

## Qué NO está verificado de esta instalación

- No se ha ejecutado una instalación limpia completa (`npm ci` borraría `node_modules`, que el servidor usa para
  compilar); se ha comprobado con `npm ci --dry-run` y `npm ls playwright-core`.
- Safari y iPhone reales: todas las pruebas de navegador usan Chromium emulado.
