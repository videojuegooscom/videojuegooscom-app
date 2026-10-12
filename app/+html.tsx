/**
 * Plantilla HTML de la exportación web estática (solo web; no se ejecuta en el navegador).
 *
 * Es la misma que Expo usa por defecto (charset, viewport, X-UA-Compatible y el reset de
 * ScrollView), con un único cambio: el idioma del documento es español (`lang="es"`), para
 * que Google, los lectores de pantalla y el navegador traten la tienda como contenido en
 * español. El título y las meta de SEO los añaden scripts/inject-seo-html.js y SiteHead.
 */
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
