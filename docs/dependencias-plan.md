# Plan de dependencias: vulnerabilidades de `npm audit`

Informe del 2026-10-18, **solo lectura**: no se ha cambiado ninguna dependencia ni se ha ejecutado
`npm audit fix`. Lo preparó un ayudante de solo lectura y yo reviso aquí lo que afecta a la tienda real.

## 1. Cifras (`npm audit`)

| Gravedad | Total | Solo producción (`--omit=dev`) |
|---|---|---|
| Crítica | 1 (`shell-quote`) | 1 |
| Alta | 33 | 32 |
| Moderada | 18 | 16 |
| Baja | 1 (`@babel/core`) | 1 |
| **Total** | **53** | **50** |

npm cuenta Expo y React Native como «producción» porque están en `dependencies`, aunque son herramientas de
construcción. Las 3 que solo salen sin `--omit=dev` son de ESLint: `@humanfs/node`, `ajv` y `flatted`.

## 2. Exposición real (qué puede alcanzar un visitante)

**A. Código que sí viaja al navegador** (buscado en `dist/_expo/.../entry-*.js` compilado el 17/10):

| Paquete | Cuelga de | Riesgo real |
|---|---|---|
| `decode-uri-component` 0.2.2 (moderada) | `query-string` 7.1.3 → `expo-router` y `@react-navigation/core` | En teoría un enlace con porcentajes mal formados gasta CPU en el navegador de quien lo abre. Bajo. |
| `nanoid` 3.3.11 (alta) | `@react-navigation/*`, `expo-router` | Improbable: los fallos exigen un tamaño o generador personalizado. No he leído el código de navegación para confirmarlo. |

**B. Funciones serverless (`api/`).** Las 7 importan solo `@supabase/supabase-js`. Su único paquete vulnerable es `ws`
8.19.0, que viene de `@supabase/realtime-js`; `api/` no usa canales en tiempo real y con Node 24 hay `WebSocket`
nativo, así que `ws` no entra en juego. Ningún dato de un visitante llega a `ws`.

**C. Solo construcción o desarrollo** (todo lo demás: Expo CLI, Metro, Babel, plugins de configuración móvil, servidor
de desarrollo, pruebas de React Native, ESLint). Se ejecuta en `expo export` / `expo start` con entradas que son
nuestro propio código; ningún visitante las controla. La crítica (`shell-quote`) es del servidor de desarrollo
(`react-devtools-core`): no está en producción, pero **nadie debe exponer `expo start` a internet**.

## 3. Qué arreglo existe

**NO usar `npm audit fix --force`:** instalaría `expo@44.0.6` (retroceso que rompe la tienda) y saltos mayores de
`react-native` y `expo-router`.

| Grupo | Corrección |
|---|---|
| `ws`, `shell-quote`, `nanoid`, `@xmldom/xmldom`, `compression`, `minimatch` 3.x, `brace-expansion` 1.x, `picomatch` 2.x, `source-map-js`, `js-yaml` 3.x, `@babel/core` | Solo lockfile: con `npm view` se comprobó que hay versión parcheada dentro del rango del paquete padre. |
| `yaml`, `ajv`, `flatted`, `@humanfs/node`, `minimatch` 8/9/10, `brace-expansion` 2.x/5.x | npm dice `fixAvailable: true`. **Versiones no verificadas una a una.** |
| `braces`, `node-forge`, `sprintf-js` | No hay parche publicado (las últimas versiones siguen vulnerables). Hay una contradicción: para `sprintf-js` npm dice `fix: true`. |
| `postcss`, `uuid`, `image-size`, `decode-uri-component` | Los fijan paquetes padre (`@expo/metro-config`, `xcode`, `metro`, `query-string`): sin parche dentro de rango. |
| Cadena Expo (`expo`, `@expo/cli`, …) | **Imposible en el SDK 54**: ya están en la última versión de ese SDK. Solo se arregla subiendo de SDK (el último es el 58). |

## 4. Lotes (de menos a más riesgo). Las dependencias las fusiona el dueño, no `vz-publicar`.

**Lote 1: solo lockfile, sin tocar versiones de `package.json`.**
- `npm audit fix` sin `--force` en una rama (**lo ejecuta el dueño**: el guardián me lo bloquea).
- Subir `@supabase/supabase-js` de 2.95.3 a 2.118.0 (permitido por `^2.93.2`). Con esa versión se comprobó que ya
  no depende de `ws`, así que desaparece del árbol serverless.
- Probar a mano en la vista previa: inicio de sesión, chat en tiempo real, subida de imágenes, checkout y cada
  endpoint de `api/`.

**Lote 2: parches dentro del SDK 54.** `react-native-web` 0.21.4, `react-native-reanimated` 4.1.7,
`@react-navigation/*` (`native` 7.1.28 → 7.5.1 arrastra `core` 7.14 → 7.24: cambia código del navegador, probar a
fondo), `@expo/vector-icons` 15.1.1 y `eslint` 9.39.5. `react-native` 0.81.6 existe, pero Expo SDK 54 espera 0.81.5:
no se toca sin pasar `expo-doctor`.

**Lote 3: esperar o aceptar con justificación.** Migrar de SDK 54 a 55 y siguientes es una tarea aparte (de uno en
uno) y antes hay que comprobar si resuelve todo. Aceptar por ser solo build/desarrollo: `braces`, `node-forge`,
`sprintf-js`, `postcss`, `uuid`, `image-size`. Un `overrides` para `decode-uri-component` 0.5.0 o `postcss` es posible,
pero **no está probado**.

**Verificación tras cada lote:** `npx --no-install tsc --noEmit`, `npm run lint`, `npm run build`,
`node pruebas/movil.mjs` y la vista previa de Vercel en verde.

**Vuelta atrás:** `git revert` del commit de la PR. Para restaurar solo el lockfile:
`git checkout <commit-anterior> -- package-lock.json` y luego `npm ci` (los ejecuta el dueño).

## 5. Lo que no se ha comprobado

- Las correcciones **no están simuladas** (`npm audit fix --dry-run` estaba prohibido): «solo lockfile» se apoya en
  `fixAvailable` y en `npm view` de versiones concretas.
- El análisis del bundle usa el `dist/` local del 17/10, que puede diferir de lo publicado.
- No se leyeron los textos completos de los avisos GHSA ni el código de `react-navigation`/`expo-router` sobre `nanoid`.
- No se ejecutó `tsc`, `lint`, `build` ni `expo-doctor` con ninguna de las versiones nuevas.
- No se sabe si el SDK 58 limpia todo, ni qué Node usa realmente Vercel (solo `engines` 24.x de `package.json`).

## 6. Análisis ampliado (2026-10-18, solo lectura): qué es explotable de verdad en producción

Segunda pasada hecha por otro analista de solo lectura, leyendo el código de cada paquete y buscando sus marcas en
el único archivo JavaScript del navegador (`dist/_expo/static/js/web/entry-*.js`, 2,67 MB). Con controles
positivos (las marcas de xmldom, yaml, js-yaml, postcss, node-forge y picomatch sí aparecen donde deben).

**Resultado: de las 53, ninguna es explotable hoy por un visitante remoto.**

| Clase | Qué significa | Nº | Paquetes |
|---|---|---|---|
| P1 | Explotable hoy por un visitante remoto | **0** | — |
| P2 | Va en el navegador, alcanzable en teoría, efecto muy limitado | 5 | `nanoid`, `decode-uri-component`, `query-string`, `@react-navigation/core`, `expo-router` |
| P3 | Solo compilación o desarrollo; la entrada es nuestro propio código | 47 | cadena Expo/Metro/Babel, jest de React Native, ESLint, `shell-quote` (la crítica), `node-forge`, `postcss`… |
| P4 | Código que no llega a ejecutarse en producción | 1 | `ws` (ninguna función de `api/` ni el bundle lo cargan) |

Pruebas de los P2 (leídas en el código, no probadas con un navegador):
- `nanoid` 3.3.11: va la copia `non-secure`; todas las llamadas son `nanoid()` sin argumentos y `customAlphabet`
  no se llama en ningún sitio, que es lo que exigen los avisos. No se pudo leer el aviso de desbordamiento
  (GHSA-xwg4) por falta de red.
- `decode-uri-component`/`query-string`: `expo-router` lee la dirección con `new URL().searchParams`; el
  `queryString.parse` vulnerable solo está en un respaldo que no se usa. Aunque se alcanzara, el daño (CPU) sería solo
  en la pestaña de quien abra un enlace manipulado.

**Trampas del arreglo automático:** `npm audit --omit=dev` marca 50 de 53 solo porque `expo` y `react-native` están
en `dependencies`; eso no significa que lleguen al navegador. `fixAvailable` apunta a `expo@44.0.6` en 19 paquetes:
es una **bajada** del SDK 54 al 44 y rompería la tienda. **Nunca `npm audit fix --force`.** Otros 9 piden
`react-native@0.88.0` y 6 un salto al SDK 58. Solo 19 se arreglan tocando el lockfile.

### Lo que sí merece atención: `api/`, base de datos y cabeceras (de más a menos riesgo real)

1. **`api/blue-ia.ts` (coste, riesgo medio-bajo):** la defensa es la cabecera `Origin`, que cualquier script puede
   falsificar; el límite de 8 peticiones por minuto vive en memoria de cada instancia. Un script podría gastar la
   clave de OpenAI. No expone datos. Mejora: límite compartido en Supabase.
2. **`api/escaparate-veoaura.ts` (escritura anónima, riesgo medio-bajo):** cada petición rechazada, incluidas las de
   firma inválida, inserta una fila en `escaparate_registro`. Un anónimo puede inflar esa tabla. Lo demás (HMAC en
   tiempo constante, nonce, límite de 100 KB) está bien.
3. **`api/escaparate-retorno.ts` (riesgo bajo):** el POST no pide autenticación (diseño documentado) y trabaja con
   la clave de servidor; la pausa entre vueltas es por instancia. Revela cuántos avisos se enviaron.
4. **`api/noticias-gaming.ts` (riesgo bajo):** sondeo ciego de direcciones internas (descarga fotos y páginas de
   terceros sin filtrar IP privadas; solo GET y no devuelve el contenido) y comparación del secreto del cron con
   `===` en lugar de tiempo constante.
5. **Cabeceras (`vercel.json`):** hay `nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy` y
   `Permissions-Policy`; **no hay CSP** ni se comprobó HSTS (Vercel suele añadirlo).
6. **Base de datos (avisos de seguridad de Supabase, 2026-10-18):**
   - 14 funciones `security definer` las puede ejecutar el visitante sin sesión; son las que la tienda necesita
     (pedidos, reservas, chats, contadores). Las tres de administración (`admin_list_users_with_stats`,
     `admin_search_users`, `admin_users_by_ids`) **sí comprueban `is_admin()`** (leídas).
   - `adjust_product_like` e `increment_product_view/service_view` las puede llamar cualquiera sin límite: se pueden
     inflar «me gusta» y visitas de un producto (integridad de métricas, sin datos expuestos).
   - Protección contra contraseñas filtradas desactivada en Supabase Auth (es un ajuste del panel, lo cambia el dueño).
   - Tres tablas con RLS y sin políticas (`escaparate_nonces`, `noticias_gaming_control`, `reservas_cesta`): es lo
     esperado, solo las toca el servidor.
7. **Higiene:** en la raíz del repositorio hay una copia extra de variables de entorno (`.env.local.save`). Está
   cubierta por `.gitignore`, pero es una copia más de secretos en disco; conviene borrarla (lo decide el dueño; no se
   ha abierto ni se ha tocado).

Nada de esto se ha cambiado. Propuesta de siguiente paso, sin actualizaciones masivas: (a) el dueño ejecuta
`npm audit fix` sin `--force` en una rama (Lote 1) y yo pruebo y abro la PR; (b) una PR aparte de endurecimiento de
`api/` (límite compartido, no registrar firmas inválidas sin tope, tiempo constante en el cron) cuando el dueño lo
autorice.

Lección sugerida: `npm audit --omit=dev` no equivale a «llega al navegador», y un `fixAvailable` con `expo@44.0.6`
es una bajada: nunca `audit fix --force`.
