# Registro de archivos

Qué es: el registro de los archivos **nuevos** que se crean al ordenar el proyecto y de los **candidatos a eliminar**.
Nadie borra nada desde aquí: los candidatos los revisa y los borra el dueño.
El índice completo de todos los archivos está en `estructura_proyecto.txt` (raíz del proyecto).

## Archivos nuevos

| Fecha | Archivo | Para qué | Tanda |
|---|---|---|---|
| 2026-11-17 | `estructura_proyecto.txt` | Índice de todos los archivos: función, conexiones, quién los usa y estado | 1 |
| 2026-11-17 | `documentacion/registro-archivos.md` | Este registro | 1 |

## Candidatos a eliminar

Todos vienen de la plantilla con la que se creó el proyecto en Expo y no los usa la tienda. Comprobado con búsquedas en
`app/`, `components/`, `lib/`, `hooks/` y `api/` el 2026-11-17.

| Archivo | Motivo |
|---|---|
| `app/modal.tsx` | Pantalla de ejemplo de la plantilla; ningún botón ni enlace la abre. Si se borra, quitar también su `Stack.Screen name="modal"` en `app/_layout.tsx`. |
| `components/external-link.tsx` | Nadie lo importa; la tienda abre los enlaces con `lib/abrirEnlaceExterno.ts`. |
| `components/hello-wave.tsx` | Nadie lo importa. |
| `components/parallax-scroll-view.tsx` | Nadie lo importa. |
| `components/haptic-tab.tsx` | Nadie lo importa. |
| `components/ui/collapsible.tsx` | Nadie lo importa. |
| `components/ui/icon-symbol.tsx` | Solo lo usa `collapsible.tsx` (candidato). |
| `components/ui/icon-symbol.ios.tsx` | Solo lo usa `collapsible.tsx` a través de `icon-symbol` (candidato). |
| `components/themed-text.tsx` | Solo lo usan `app/modal.tsx` y `collapsible.tsx` (candidatos). |
| `components/themed-view.tsx` | Solo lo usan `app/modal.tsx`, `parallax-scroll-view` y `collapsible` (candidatos). |
| `hooks/use-theme-color.ts` | Solo lo usan `themed-text`, `themed-view` y `parallax-scroll-view` (candidatos). |
| `hooks/use-color-scheme.ts` | Solo lo usan `use-theme-color`, `parallax-scroll-view` y `collapsible` (candidatos). |
| `hooks/use-color-scheme.web.ts` | Versión web del anterior; solo la usan candidatos. |
| `scripts/reset-project.js` | Script de la plantilla para «vaciar» un proyecto nuevo; la tienda no lo usa. Revisar antes de borrar: está en `scripts/`. |

**Ojo al borrarlos:** los exports `Colors` y `Fonts` de `constants/temaTienda.ts` solo los usan estos candidatos; se pueden
quitar después, en la tanda 5 (código sin usar).

**No es candidato:** `components/EfectoPensando.tsx` (antes `lineapensadoraefectosiri.tsx`; lo usan `app/_layout.tsx`,
`app/(tabs)/_layout.tsx` y `PantallaCargaMarca.tsx`).

## Zonas delicadas (no tocar sin revisión del dueño)

- `lib/supabase.ts`: inicio de sesión y conexión con la base de datos.
- `app/reset-password.tsx`: cambio de contraseña con el enlace del correo.
- `app/(tabs)/perfil.tsx`: parte de cuenta (acceso, registro, contraseña, pagos y facturas del cliente).
- `app/checkout.tsx` y `api/pago.ts`: pagos con Stripe, devoluciones y fianzas.
- `api/factura.ts`: facturas privadas, etiquetas y fotos de reparación.
- `api/escaparate-veoaura.ts` y `api/escaparate-retorno.ts`: mensajes firmados con VeoAura.
- `app/admin/_layout.tsx`: puerta del panel de administración.
- `supabase/migrations/`, `app.json`, `package.json`, `vercel.json`, `tsconfig.json` e `infraestructura/`.

## Propuesta de nombres para la tanda 2

Solo `components/`, `lib/` y `constants/` (los de `app/` y `api/` son direcciones de la web). Comprobado que ningún
nombre nuevo existe ya.

| Ahora | Propuesta | Estado |
|---|---|---|
| `components/ReviewModal.tsx` | `VentanaValoracion.tsx` | Hecho en la tanda 2a (2026-11-17) |
| `components/SmartImage.tsx` | `ImagenInteligente.tsx` | Hecho en la tanda 2a (2026-11-17) |
| `components/ImageLightbox.tsx` | `VisorFotos.tsx` | Hecho en la tanda 2a (2026-11-17) |
| `components/SiteFooter.tsx` | `PieDePagina.tsx` | Hecho en la tanda 2a (2026-11-17) |
| `components/SiteHead.tsx` | `EtiquetasCabeceraWeb.tsx` | Hecho en la tanda 2a (2026-11-17) |
| `components/SocialLinks.tsx` | `EnlacesRedesSociales.tsx` | Hecho en la tanda 2a (2026-11-17) |
| `components/ProductChatThread.tsx` | `ConversacionProducto.tsx` | Hecho en la tanda 2a (2026-11-17) |
| `components/CatalogFilters.tsx` | `FiltrosCatalogo.tsx` | Hecho en la tanda 2a (2026-11-17) |
| `components/CookieConsentBanner.tsx` | `AvisoAnaliticaCookies.tsx` | Hecho en la tanda 2a (2026-11-17) |
| `components/CategoryProductsShelf.tsx` | `CarruselProductosCategoria.tsx` | Hecho en la tanda 2a (2026-11-17) |
| `components/SellRequestMedia.tsx` | `FotosVideoVenta.tsx` | Hecho en la tanda 2a (2026-11-17) |
| `components/BrandLoadingScreen.tsx` | `PantallaCargaMarca.tsx` | Hecho en la tanda 2a (2026-11-17) |
| `components/Campanita.tsx` | `AsistenteBlue.tsx` | Hecho en la tanda 2a (2026-11-17) |
| `components/Barramagic.tsx` | `BarraBusqueda.tsx` | Hecho en la tanda 2a (2026-11-17) |
| `components/lineapensadoraefectosiri.tsx` | `EfectoPensando.tsx` | Hecho en la tanda 2a (2026-11-17) |
| `components/admin/PanelUI.tsx` | `PiezasPanelAdmin.tsx` | Hecho en la tanda 2a (2026-11-17) |
| `lib/loadingBus.ts` | `estadoCarga.ts` | Hecho en la tanda 2b (2026-11-17) |
| `lib/tabBar.ts` | `barraPestanas.ts` | Hecho en la tanda 2b (2026-11-17) |
| `lib/openExternalLink.ts` | `abrirEnlaceExterno.ts` | Hecho en la tanda 2b (2026-11-17) |
| `lib/analytics.ts` | `analiticaPropia.ts` (la propuesta era `analitica.ts`, pero «analitica» ya existía como palabra en el proyecto: `AvisoAnaliticaCookies`, `analitica_ritmo`, `pruebas/analitica-sql.mjs`…; `analiticaPropia` evita confusiones) | Hecho en la tanda 2b (2026-11-17) |
| `lib/admin/products.types.ts` | `lib/admin/productos.tipos.ts` | Hecho en la tanda 2b (2026-11-17) |
| `lib/admin/products.utils.ts` | `lib/admin/productos.utilidades.ts` | Hecho en la tanda 2b (2026-11-17) |
| `lib/admin/products.components.tsx` | `lib/admin/productos.componentes.tsx` | Hecho en la tanda 2b (2026-11-17) |
| `lib/admin/products.constants.ts` | `lib/admin/productos.constantes.ts` | Hecho en la tanda 2b (2026-11-17) |
| `constants/theme.ts` | `constants/temaTienda.ts` (la propuesta era `tema.ts`, pero «tema» ya existía como palabra en el proyecto: temas de conocimiento de Blue, tema claro/oscuro, variables `tema` en las pruebas…; `temaTienda` evita confusiones) | Hecho en la tanda 2c (2026-11-17) |

Se quedan igual: `lib/supabase.ts` (nombre propio del servicio) y los archivos de `app/` y `api/`.

## Renombrados

Tanda 2a (2026-11-17): solo cambian el nombre del archivo y las rutas de los imports, cabeceras y pruebas; las funciones,
componentes y tipos de dentro conservan su nombre (eso va en otra tanda).

| Antes | Después |
|---|---|
| `components/ReviewModal.tsx` | `components/VentanaValoracion.tsx` |
| `components/SmartImage.tsx` | `components/ImagenInteligente.tsx` |
| `components/ImageLightbox.tsx` | `components/VisorFotos.tsx` |
| `components/SiteFooter.tsx` | `components/PieDePagina.tsx` |
| `components/SiteHead.tsx` | `components/EtiquetasCabeceraWeb.tsx` |
| `components/SocialLinks.tsx` | `components/EnlacesRedesSociales.tsx` |
| `components/ProductChatThread.tsx` | `components/ConversacionProducto.tsx` |
| `components/CatalogFilters.tsx` | `components/FiltrosCatalogo.tsx` |
| `components/CookieConsentBanner.tsx` | `components/AvisoAnaliticaCookies.tsx` |
| `components/CategoryProductsShelf.tsx` | `components/CarruselProductosCategoria.tsx` |
| `components/SellRequestMedia.tsx` | `components/FotosVideoVenta.tsx` |
| `components/BrandLoadingScreen.tsx` | `components/PantallaCargaMarca.tsx` |
| `components/Campanita.tsx` | `components/AsistenteBlue.tsx` |
| `components/Barramagic.tsx` | `components/BarraBusqueda.tsx` |
| `components/lineapensadoraefectosiri.tsx` | `components/EfectoPensando.tsx` |
| `components/admin/PanelUI.tsx` | `components/admin/PiezasPanelAdmin.tsx` |

Tanda 2b (2026-11-17): igual que la 2a, solo el nombre del archivo y las rutas de imports, cabeceras, índice y registro;
las funciones, tipos y constantes conservan su nombre, y también los valores guardados (tablas, eventos de analítica,
claves). `app/admin/analytics.tsx` no cambia: es una dirección de la web.

| Antes | Después |
|---|---|
| `lib/loadingBus.ts` | `lib/estadoCarga.ts` |
| `lib/tabBar.ts` | `lib/barraPestanas.ts` |
| `lib/openExternalLink.ts` | `lib/abrirEnlaceExterno.ts` |
| `lib/analytics.ts` | `lib/analiticaPropia.ts` |
| `lib/admin/products.types.ts` | `lib/admin/productos.tipos.ts` |
| `lib/admin/products.utils.ts` | `lib/admin/productos.utilidades.ts` |
| `lib/admin/products.components.tsx` | `lib/admin/productos.componentes.tsx` |
| `lib/admin/products.constants.ts` | `lib/admin/productos.constantes.ts` |

Tanda 2c (2026-11-17): igual que la 2a y la 2b, solo el nombre del archivo y las rutas de imports, cabeceras, índice,
registro y pruebas; las constantes (`TAMANOS`, `TACTIL`, `CAMPO`, `COLORES_TEXTO`, `colorTextoAzul`, `Colors`, `Fonts`)
y sus valores no cambian. Se llama `temaTienda` y no `tema` porque «tema» ya existía como palabra en el proyecto.

| Antes | Después |
|---|---|
| `constants/theme.ts` | `constants/temaTienda.ts` |
