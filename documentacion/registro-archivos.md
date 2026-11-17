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
| `components/external-link.tsx` | Nadie lo importa; la tienda abre los enlaces con `lib/openExternalLink.ts`. |
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

**Ojo al borrarlos:** los exports `Colors` y `Fonts` de `constants/theme.ts` solo los usan estos candidatos; se pueden
quitar después, en la tanda 5 (código sin usar).

**No es candidato:** `components/lineapensadoraefectosiri.tsx` (lo usan `app/_layout.tsx`, `app/(tabs)/_layout.tsx` y
`BrandLoadingScreen.tsx`).

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

| Ahora | Propuesta |
|---|---|
| `components/ReviewModal.tsx` | `VentanaValoracion.tsx` |
| `components/SmartImage.tsx` | `ImagenInteligente.tsx` |
| `components/ImageLightbox.tsx` | `VisorFotos.tsx` |
| `components/SiteFooter.tsx` | `PieDePagina.tsx` |
| `components/SiteHead.tsx` | `EtiquetasCabeceraWeb.tsx` |
| `components/SocialLinks.tsx` | `EnlacesRedesSociales.tsx` |
| `components/ProductChatThread.tsx` | `ConversacionProducto.tsx` |
| `components/CatalogFilters.tsx` | `FiltrosCatalogo.tsx` |
| `components/CookieConsentBanner.tsx` | `AvisoAnaliticaCookies.tsx` |
| `components/CategoryProductsShelf.tsx` | `CarruselProductosCategoria.tsx` |
| `components/SellRequestMedia.tsx` | `FotosVideoVenta.tsx` |
| `components/BrandLoadingScreen.tsx` | `PantallaCargaMarca.tsx` |
| `components/Campanita.tsx` | `AsistenteBlue.tsx` |
| `components/Barramagic.tsx` | `BarraBusqueda.tsx` |
| `components/lineapensadoraefectosiri.tsx` | `EfectoPensando.tsx` |
| `components/admin/PanelUI.tsx` | `PiezasPanelAdmin.tsx` |
| `lib/loadingBus.ts` | `estadoCarga.ts` |
| `lib/tabBar.ts` | `barraPestanas.ts` |
| `lib/openExternalLink.ts` | `abrirEnlaceExterno.ts` |
| `lib/analytics.ts` | `analitica.ts` |
| `lib/admin/products.types.ts` | `lib/admin/productos.tipos.ts` |
| `lib/admin/products.utils.ts` | `lib/admin/productos.utilidades.ts` |
| `lib/admin/products.components.tsx` | `lib/admin/productos.componentes.tsx` |
| `lib/admin/products.constants.ts` | `lib/admin/productos.constantes.ts` |
| `constants/theme.ts` | `constants/tema.ts` |

Se quedan igual: `lib/supabase.ts` (nombre propio del servicio) y los archivos de `app/` y `api/`.
