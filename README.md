# Welcome to your Expo app 👋

**Qué hace:** presentación del proyecto (texto de la plantilla de Expo con los pasos para instalar y arrancar) y, al final, el mapa de los archivos que no admiten comentarios. **Conectado con:** nada lo importa; habla de los scripts de package.json (`npm run reset-project` usa scripts/reset-project.js) y la sección final documenta imágenes, JSON, .txt y .gitignore del repo. Las instrucciones del proyecto están en CLAUDE.md.

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Mapa de archivos sin comentarios

Imágenes, JSON, `.txt` y `.gitignore` no admiten cabecera, así que se documentan aquí (comprobado con Grep el 2026-11-09 y, para las portadas, con la tabla `public.categories` de producción). «Sin uso (candidata a borrar)» solo es un aviso: nada se ha borrado y lo decide el dueño.

| Archivo | Qué es | Conectado con |
|---|---|---|
| `.gitignore` | Lista de lo que Git no debe subir (node_modules, dist, .expo, archivos de entorno y claves). | Lo usa Git en cada `git add`/`commit`. |
| `.vscode/extensions.json` | Extensión recomendada para el editor VS Code (herramientas de Expo). | Solo VS Code; la tienda no lo usa. |
| `.vscode/settings.json` | Ajustes de VS Code: arregla, ordena importaciones y miembros al guardar. | Solo VS Code; la tienda no lo usa. |
| `app.json` | Configuración de Expo: nombre, iconos, pantalla de arranque, salida web estática y rutas tipadas. | Lo lee Expo al compilar (`npm run build`); usa `assets/images/icon.png`, `favicon.png`, `splash-icon.png` y `android-icon-*.png`. El controlador lo trata como ruta protegida (`infraestructura/publicacion/test_controlador.py`). |
| `package.json` | Dependencias, scripts (`build`, `lint`, `vercel-build`…) y versión de Node. | Lo usan npm, Vercel (`vercel-build`) y Expo (`main: expo-router/entry`); sus scripts usan `scripts/reset-project.js` y `scripts/inject-seo-html.js`. |
| `package-lock.json` | Versiones exactas instaladas de cada dependencia. | Lo usan `npm ci` y Vercel al instalar; va con `package.json`. Lo analiza `docs/dependencias-plan.md`. |
| `tsconfig.json` | Configuración de TypeScript: modo estricto y atajo `@/` a la raíz; excluye `Claude outputs`. | Lo usa `npx tsc --noEmit` y el editor; el atajo `@/` es el mismo que el de `babel.config.js`. |
| `vercel.json` | Configuración de Vercel: carpeta `dist`, tareas programadas, optimizador de imágenes, redirecciones internas y cabeceras de seguridad. | Lo lee Vercel al desplegar; llama a `api/noticias-gaming.ts`, `api/escaparate-retorno.ts`, `api/auditoria-web.ts` (crons), `api/compartir.ts` y `api/sitemap.ts`. |
| `public/manifest.json` | Ficha de la web instalable (nombre, colores, iconos). | La enlaza `app/+html.tsx`; la comprueba `api/auditoria-web.ts`; usa `public/icono-192.png` y `public/icono-512.png`. |
| `public/robots.txt` | Indica a los buscadores qué no indexar (admin, cesta, perfil…) y dónde está el mapa del sitio. | Apunta a `/sitemap.xml` (`api/sitemap.ts`); lo comprueba `api/auditoria-web.ts`. |
| `public/llms.txt` | Resumen en texto de la tienda para buscadores con IA (quiénes somos, servicios). | Debe decir lo mismo que `app/+html.tsx` y `app/quienes-somos.tsx` (lo indican sus comentarios). |
| `infraestructura/claude-code/politica.json` | Política de permisos de Claude Code (allow/deny). | Se instala como `managed-settings.json` con `instalar.sh`; la prueban `test_politica.py` y `test_guardian.py`. |
| `infraestructura/claude-code/mcp.json` | Servidores MCP permitidos (Supabase, Vercel y Stripe de solo lectura). | Se instala como `managed-mcp.json` con `instalar.sh`; descrito en `infraestructura/claude-code/README.md`. |
| `infraestructura/claude-code/deny-retiradas.json` | Reglas deny retiradas a propósito, con su motivo. | Lo exigen `instalar.sh` y `test_politica.py`. |
| `infraestructura/claude-code/origen/politica_actual.json` | Copia de la política que había instalada antes, para comparar. | La usan `instalar.sh` y `test_politica.py`. |
| `infraestructura/claude-code/origen/mcp_actual.json` | Copia de la configuración MCP que había instalada antes. | Solo la describe `infraestructura/claude-code/README.md` (carpeta `origen/`); ningún script la lee. |
| `assets/brand/logo.png` | Logotipo completo de la marca. | `components/marca/MarcaAnimada.tsx`. |
| `assets/brand/logo-mini.png` | Logotipo pequeño. | `components/marca/MarcaAnimada.tsx`. |
| `assets/brand/mascotas.png` | Ilustración con las mascotas de la marca. | `components/marca/MarcaAnimada.tsx`. |
| `assets/brand/mascota-tienda.png` | Mascota de la tienda. | `components/marca/MarcaAnimada.tsx`. |
| `assets/brand/mascota-taller.png` | Mascota del taller de reparaciones. | `components/marca/MarcaAnimada.tsx`. |
| `assets/brand/mascota-carga.png` | Mascota de la pantalla de carga. | `components/marca/MarcaAnimada.tsx`. |
| `assets/images/icon.png` | Icono de la aplicación. | `app.json` (`icon`). |
| `assets/images/favicon.png` | Icono de la pestaña del navegador. | `app.json` (`web.favicon`). |
| `assets/images/splash-icon.png` | Imagen de la pantalla de arranque. | `app.json` (complemento `expo-splash-screen`). |
| `assets/images/android-icon-foreground.png` | Icono adaptable de Android (primer plano). | `app.json` (`android.adaptiveIcon`). |
| `assets/images/android-icon-background.png` | Icono adaptable de Android (fondo). | `app.json` (`android.adaptiveIcon`). |
| `assets/images/android-icon-monochrome.png` | Icono adaptable de Android (monocromo). | `app.json` (`android.adaptiveIcon`). |
| `assets/images/react-logo.png` | Logo de React de la plantilla de Expo. | Sin uso (candidata a borrar). |
| `assets/images/react-logo@2x.png` | Logo de React de la plantilla (doble resolución). | Sin uso (candidata a borrar). |
| `assets/images/react-logo@3x.png` | Logo de React de la plantilla (triple resolución). | Sin uso (candidata a borrar). |
| `assets/images/partial-react-logo.png` | Logo de React recortado de la plantilla. | Sin uso (candidata a borrar). |
| `public/icono-192.png` | Icono de la web de 192 px. | `public/manifest.json`, `app/+html.tsx`, `public/404.html` y `lib/notificaciones.ts`. |
| `public/icono-512.png` | Icono de la web de 512 px. | `public/manifest.json` y `app/+html.tsx`. |
| `public/categorias/playstation-5-pro.jpg` | Portada de la PS5 Pro dentro de la categoría PlayStation 5. | En uso: `public.categories` (`playstation-5`), puesta por `supabase/migrations/20261108210000_portada_ps5_slim_una_linea.sql`. |
| `public/categorias/playstation-5-pro-inicio.jpg` | Portada de la PS5 Pro en el recuadro de Inicio. | En uso: igual que la anterior (`portadas_inicio`). |
| `public/categorias/ps5-slim-v6.jpg` | Portada de la PS5 Slim (línea única) dentro de la categoría. | En uso: `20261108210000_portada_ps5_slim_una_linea.sql`. |
| `public/categorias/ps5-slim-v6-inicio.jpg` | Portada de la PS5 Slim en Inicio. | En uso: `20261108210000_portada_ps5_slim_una_linea.sql`. |
| `public/categorias/ps5-blu-ray-v5.jpg` | Portada de la PS5 con lector Blu-Ray dentro de la categoría. | En uso: `20261108200000_portadas_playstation_5_promo.sql` y `20261108210000`. |
| `public/categorias/ps5-blu-ray-v5-inicio.jpg` | Portada de la PS5 Blu-Ray en Inicio. | En uso: `20261108200000` y `20261108210000`. |
| `public/categorias/ps5-slim-v5.jpg` | Versión anterior de la portada de la PS5 Slim. | Sin uso (candidata a borrar): la sustituyó `ps5-slim-v6.jpg` (`20261108210000`). |
| `public/categorias/ps5-slim-v5-inicio.jpg` | Versión anterior de la PS5 Slim en Inicio. | Sin uso (candidata a borrar): la sustituyó `ps5-slim-v6-inicio.jpg`. |
| `public/categorias/ps5-slim-v4.jpg` | Versión antigua de la portada de la PS5 Slim. | Sin uso (candidata a borrar): la sustituyó `-v5` (`20261108200000`). |
| `public/categorias/ps5-slim-v4-inicio.jpg` | Versión antigua de la PS5 Slim en Inicio. | Sin uso (candidata a borrar). |
| `public/categorias/ps5-blu-ray-v4.jpg` | Versión antigua de la portada de la PS5 Blu-Ray. | Sin uso (candidata a borrar): la sustituyó `-v5` (`20261108200000`). |
| `public/categorias/ps5-blu-ray-v4-inicio.jpg` | Versión antigua de la PS5 Blu-Ray en Inicio. | Sin uso (candidata a borrar). |
| `public/categorias/nintendo-switch-1-v2.jpg` | Portada de la Switch 2 dentro de la categoría Nintendo Switch (también su imagen principal). | En uso: `public.categories` (`nintendo-switch`), puesta por `supabase/migrations/20261107190000_portadas_nintendo_switch_recompuestas.sql`. |
| `public/categorias/nintendo-switch-2-v2.jpg` | Portada de la Switch OLED dentro de la categoría. | En uso: `20261107190000_portadas_nintendo_switch_recompuestas.sql`. |
| `public/categorias/nintendo-switch-3.jpg` | Tercera portada (Nintendo) dentro de la categoría. | En uso: `20261107170000` y `20261107190000`. |
| `public/categorias/nintendo-switch-1-inicio-v2.jpg` | Portada de la Switch 2 en Inicio. | En uso: `20261107190000_portadas_nintendo_switch_recompuestas.sql`. |
| `public/categorias/nintendo-switch-2-inicio-v2.jpg` | Portada de la Switch OLED en Inicio. | En uso: `20261107190000`. |
| `public/categorias/nintendo-switch-3-inicio-v2.jpg` | Portada de Nintendo en Inicio. | En uso: `20261107190000`. |
| `public/categorias/nintendo-switch-1.jpg` | Versión anterior de la portada de la Switch 2. | Sin uso (candidata a borrar): la sustituyó `-v2` (`20261107190000`). |
| `public/categorias/nintendo-switch-2.jpg` | Versión anterior de la portada de la Switch OLED. | Sin uso (candidata a borrar): la sustituyó `-v2` (`20261107190000`). |
| `public/categorias/nintendo-switch-1-inicio.jpg` | Versión anterior de la Switch 2 en Inicio. | Sin uso (candidata a borrar): la sustituyó `-inicio-v2`. |
| `public/categorias/nintendo-switch-2-inicio.jpg` | Versión anterior de la Switch OLED en Inicio. | Sin uso (candidata a borrar): la sustituyó `-inicio-v2`. |
| `public/categorias/nintendo-switch-3-inicio.jpg` | Versión anterior de Nintendo en Inicio. | Sin uso (candidata a borrar): la sustituyó `-inicio-v2`. |
