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
const BOOT_CSS = "html,body,#root{background-color:#FFFFFF;}";

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
