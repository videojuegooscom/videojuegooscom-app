/**
 * Plantilla HTML de la exportación web estática (solo web; no se ejecuta en el navegador).
 *
 * Es la misma que Expo usa por defecto (charset, viewport, X-UA-Compatible y el reset de
 * ScrollView), con dos cambios: el idioma del documento es español (`lang="es"`), para que
 * Google, los lectores de pantalla y el navegador traten la tienda como contenido en español,
 * y `viewport-fit=cover` para conocer la zona segura del iPhone. El título y las meta de SEO
 * los añaden scripts/inject-seo-html.js y SiteHead. Para cargar antes: preconnect/dns-prefetch
 * a Supabase (datos y fotos) y fondo blanco inline en body/#root (sin parpadeo inicial).
 */
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

const SUPABASE_ORIGIN = "https://rgvyvaineyodyxzwootl.supabase.co";
const SEO_TITULO = "Videojuegoszaragoza.com";
const SEO_DESCRIPCION = "Compramos tu electrónica al mejor precio o la intercambiamos. Mantenimiento y reparaciones.";
// Scroll en el móvil (se suma a ScrollViewStyleReset, que ya fija html/body/#root al 100 %
// y deja body con overflow:hidden para que solo se desplacen los ScrollView de la app):
// - overscroll-behavior-y:none → la página entera no rebota ni hace "tirar para recargar"
//   al llegar arriba/abajo de una lista; cada ScrollView sigue desplazándose normal.
// - tap-highlight transparente y touch-action:manipulation → sin destello gris al tocar y
//   sin la espera del doble toque (los toques responden al momento).
// No se usa scroll-behavior:smooth global: los ScrollView ya animan scrollTo cuando toca y
// en los saltos sin animación (animated:false) lo convertiría en un desplazamiento lento.
// - overflow-x:hidden y max-width:100% → nada puede ensanchar la página. En el iPhone, si
//   algo se sale por un lado (p. ej. Blue al esconderse), Safari agranda el ancho de la
//   ventana y la tienda entera se maqueta como si la pantalla fuera más ancha (buscador
//   cortado, categorías una por fila).
const BOOT_CSS =
  "html,body,#root{background-color:#FFFFFF;overflow-x:hidden;max-width:100%;}" +
  "html,body{overscroll-behavior-y:none;}" +
  "body{-webkit-tap-highlight-color:transparent;touch-action:manipulation;}";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        {/* viewport-fit=cover: el iPhone informa de la zona segura inferior (barra de inicio)
            para que la barra de pestañas la respete (lib/tabBar.ts). */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* Título y descripción por defecto ya escritos en el HTML (lo que ven Google en su primera
            pasada y WhatsApp/Facebook, que no ejecutan JavaScript). Si «Marca y SEO» tiene otros
            textos, scripts/inject-seo-html.js y SiteHead los sustituyen. */}
        <meta name="description" content={SEO_DESCRIPCION} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="VideojuegosZaragoza" />
        <meta property="og:title" content={SEO_TITULO} />
        <meta property="og:description" content={SEO_DESCRIPCION} />
        <meta property="og:image" content="https://videojuegoszaragoza.com/icono-512.png" />
        <meta property="og:locale" content="es_ES" />
        <meta name="twitter:card" content="summary" />
        {/* Tienda instalable como app (Android: botón de instalar; iPhone: «Añadir a pantalla
            de inicio»). Los iconos salen del logo de la marca (public/). */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1EA7E8" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="VideojuegosZaragoza" />
        <link rel="apple-touch-icon" href="/icono-192.png" />
        {/* Conexión anticipada con Supabase (API y fotos): ahorra DNS+TLS en la 1.ª petición. */}
        {/* Dos conexiones: la API va con CORS (fetch) y las fotos <img> sin CORS. */}
        <link rel="preconnect" href={SUPABASE_ORIGIN} crossOrigin="anonymous" />
        <link rel="preconnect" href={SUPABASE_ORIGIN} />
        <link rel="dns-prefetch" href={SUPABASE_ORIGIN} />
        <ScrollViewStyleReset />
        {/* Fondo blanco desde el primer pintado, para que no haya parpadeo antes de montar la app. */}
        <style dangerouslySetInnerHTML={{ __html: BOOT_CSS }} />
      </head>
      <body style={{ backgroundColor: "#FFFFFF" }}>{children}</body>
    </html>
  );
}
