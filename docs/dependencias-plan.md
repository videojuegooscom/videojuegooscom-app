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
