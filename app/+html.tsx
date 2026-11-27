/**
 * Archivo: app/+html.tsx
 * Función: plantilla HTML de la exportación web estática (solo se usa al exportar, no se ejecuta en el navegador).
 * Para qué sirve: fija idioma español, viewport, datos estructurados para Google (JSON-LD), resumen sin JavaScript y precarga de Supabase; mejora el SEO y la carga inicial para el cliente.
 * Conectado con: scripts/inject-seo-html.js, components/EtiquetasCabeceraWeb.tsx, lib/barraPestanas.ts, lib/horarioAtencion.ts y public/llms.txt (mismos datos); no llama a Supabase (solo hace preconnect a su dominio).
 * Utilizado por: Expo Router (la usa sola al exportar la web; ningún archivo la importa).
 * Dependencias: expo-router/html, react (tipos).
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: plantilla HTML de la exportación web estática (solo web; no se ejecuta en el navegador).
 *
 * Es la misma que Expo usa por defecto (charset, viewport, X-UA-Compatible y el reset de
 * ScrollView), con dos cambios: el idioma del documento es español (`lang="es"`), para que
 * Google, los lectores de pantalla y el navegador traten la tienda como contenido en español,
 * y `viewport-fit=cover` para conocer la zona segura del iPhone. Además, para Google y las IA:
 * la ficha de la tienda en datos estructurados (JSON-LD) y un resumen en <noscript> para quien
 * no ejecuta JavaScript (sin él solo verían la pantalla de carga). El título y las meta de SEO
 * los añaden scripts/inject-seo-html.js y EtiquetasCabeceraWeb. Para cargar antes: preconnect/dns-prefetch
 * a Supabase (datos y fotos) y fondo blanco inline en body/#root (sin parpadeo inicial).
 *
 * Conectado con: Expo Router (la usa sola al exportar; ningún archivo la importa), scripts/inject-seo-html.js y
 * components/EtiquetasCabeceraWeb.tsx (título y meta), lib/barraPestanas.ts (usa su viewport-fit=cover) y los mismos datos que
 * app/quienes-somos.tsx, public/llms.txt y lib/horarioAtencion.ts.
 */
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

const SUPABASE_ORIGIN = "https://rgvyvaineyodyxzwootl.supabase.co";
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
// - --vz-arriba (2026-11-23): con viewport-fit=cover el iPhone dibuja la tienda también debajo de la hora y la batería,
//   y Safari (iOS 26) difumina esa franja: la cabecera (flecha, logo) y Blue se veían borrosos. #root deja ese hueco
//   arriba y Blue baja lo mismo (components/blue/AyudasBlue.tsx → zonaSeguraArriba). Es una variable para que las
//   pruebas puedan simular un iPhone (sección ZSA de pruebas/perfil-datos.mjs); en el ordenador vale 0.
const BOOT_CSS =
  ":root{--vz-arriba:env(safe-area-inset-top,0px);}" +
  "html,body,#root{background-color:#FFFFFF;overflow-x:hidden;max-width:100%;}" +
  "#root{box-sizing:border-box;padding-top:var(--vz-arriba);}" +
  "html,body{overscroll-behavior-y:none;}" +
  "body{-webkit-tap-highlight-color:transparent;touch-action:manipulation;}";

// Ficha de la tienda para Google y las IA (datos estructurados de schema.org), en todas las páginas. La
// tienda es SOLO ONLINE: sin dirección (el domicilio fiscal solo va en los textos legales). Solo datos que ha
// dado el dueño; lo mismo que dicen app/quienes-somos.tsx y public/llms.txt. El fundador tiene su propia ficha
// (Person) y «Quiénes somos» es su página (AboutPage): el dueño quiere salir al buscar «Daniel Gutiérrez»
// (2026-11-03). Sin fecha de nacimiento ni foto (no las ha dado para publicar).
const DOMINIO = "https://videojuegoszaragoza.com";
const FUNDADOR_ID = `${DOMINIO}/quienes-somos#daniel-gutierrez`;
const DATOS_ESTRUCTURADOS = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "OnlineStore",
      "@id": `${DOMINIO}/#tienda`,
      name: "Videojuegoszaragoza.com",
      url: `${DOMINIO}/`,
      logo: `${DOMINIO}/icono-512.png`,
      description:
        "Tienda online de Zaragoza: compraventa de consolas, videojuegos y electrónica desde 2022, con reparación y mantenimiento de consolas, mandos, móviles, portátiles y PC. Envíos a toda España.",
      foundingDate: "2022",
      founder: { "@id": FUNDADOR_ID },
      numberOfEmployees: { "@type": "QuantitativeValue", value: 4 },
      areaServed: { "@type": "Country", name: "España" },
      sameAs: [
        "https://www.instagram.com/videojuegoszaragoza/",
        "https://www.tiktok.com/@videojuegoszaragoza",
        "https://www.wallapop.com/user/enriquem-481793070",
      ],
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer service",
        availableLanguage: "es",
        url: `${DOMINIO}/blue-ia`,
        hoursAvailable: [
          { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], opens: "10:00", closes: "14:00" },
          { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], opens: "17:00", closes: "19:00" },
          { "@type": "OpeningHoursSpecification", dayOfWeek: "Sunday", opens: "10:00", closes: "13:00" },
        ],
      },
      makesOffer: [
        "Compraventa de consolas, videojuegos y electrónica",
        "Reparación de consolas, mandos, móviles, portátiles y PC",
        "Limpieza y mantenimiento de consolas y electrónica",
      ].map((name) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name } })),
    },
    {
      "@type": "Person",
      "@id": FUNDADOR_ID,
      name: "Daniel Gutiérrez",
      alternateName: "Daniel Enrique Gutiérrez Mejía",
      givenName: "Daniel",
      familyName: "Gutiérrez",
      jobTitle: "Fundador de Videojuegoszaragoza.com",
      description:
        "Fundó Videojuegoszaragoza.com en 2022 y la dirige junto a un equipo de tres profesionales: compraventa de consolas y electrónica, reparación y mantenimiento, y desarrollo de software propio y para otros negocios.",
      url: `${DOMINIO}/quienes-somos`,
      worksFor: { "@id": `${DOMINIO}/#tienda` },
      knowsAbout: ["Videoconsolas", "Videojuegos", "Electrónica", "Reparación de consolas", "Desarrollo de software"],
    },
    {
      "@type": "AboutPage",
      "@id": `${DOMINIO}/quienes-somos#pagina`,
      url: `${DOMINIO}/quienes-somos`,
      name: "Quiénes somos · Daniel Gutiérrez, fundador",
      inLanguage: "es",
      isPartOf: { "@id": `${DOMINIO}/#web` },
      about: { "@id": `${DOMINIO}/#tienda` },
      mainEntity: { "@id": FUNDADOR_ID },
    },
    { "@type": "WebSite", "@id": `${DOMINIO}/#web`, name: "Videojuegoszaragoza.com", url: `${DOMINIO}/`, inLanguage: "es", publisher: { "@id": `${DOMINIO}/#tienda` } },
  ],
};
// En JSON dentro de <script>, «<» se escapa para que ningún texto pueda cerrar la etiqueta.
const DATOS_ESTRUCTURADOS_JSON = JSON.stringify(DATOS_ESTRUCTURADOS).replace(/</g, "\\u003c");

// Lo que ve quien abre la tienda SIN JavaScript (muchos lectores de IA y algunos buscadores): sin esto solo
// verían «Cargando tienda…». Con JavaScript no se muestra nunca. Lo mismo que dice app/quienes-somos.tsx.
const ENLACES_SIN_JS: [string, string][] = [
  ["/catalogo", "Catálogo"],
  ["/servicios", "Reparación y mantenimiento"],
  ["/vender", "Vender o intercambiar tu consola"],
  ["/compramos/consolas", "Vender tu consola (PS5, Switch, Xbox)"],
  ["/compramos/moviles", "Vender tu móvil (iPhone y Android)"],
  ["/compramos/portatiles", "Vender tu portátil o MacBook"],
  ["/compramos/pc", "Vender tu PC, gráfica o monitor"],
  ["/compramos/tablets", "Vender tu iPad o tablet"],
  ["/compramos/televisores", "Vender tu televisión"],
  ["/compramos/camaras", "Vender tu cámara de fotos"],
  ["/compramos/drones", "Vender tu dron"],
  ["/quienes-somos", "Quiénes somos: Daniel Gutiérrez y el equipo"],
  ["/blog", "Blog"],
  ["/noticias", "Noticias de consolas, videojuegos y tecnología"],
  ["/politicas/envios", "Envíos"],
  ["/politicas/devoluciones", "Devoluciones"],
];

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        {/* viewport-fit=cover: el iPhone informa de la zona segura inferior (barra de inicio)
            para que la barra de pestañas la respete (lib/barraPestanas.ts). */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* El título, la descripción y og:title / og:description ya escritos en el HTML los pone app/_layout.tsx (con
            <Head>), una sola vez por página: los de la propia página («Compramos», 2026-11-25) o, si no tiene, los
            generales (SEO_TITULO_GENERAL / SEO_DESCRIPCION_GENERAL de app/_layout.tsx). Aquí ya no van: salían dos
            descripciones. Al
            arrancar, EtiquetasCabeceraWeb pone los de «Marca y SEO» y los de cada página. */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="VideojuegosZaragoza" />
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
        {/* Icono de la tienda para Google y los navegadores (2026-11-24): el logo en PNG, en nuestro dominio y con medidas
            múltiplo de 48 px. Antes solo estaba /favicon.ico, que era el icono por defecto de Expo (una «A» azul), y Google
            enseñaba el globo gris. El /favicon.ico ahora sale también del logo (app.json → web.favicon). */}
        <link rel="icon" type="image/png" sizes="192x192" href="/icono-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icono-512.png" />
        {/* Conexión anticipada con Supabase (API y fotos): ahorra DNS+TLS en la 1.ª petición. */}
        {/* Dos conexiones: la API va con CORS (fetch) y las fotos <img> sin CORS. */}
        <link rel="preconnect" href={SUPABASE_ORIGIN} crossOrigin="anonymous" />
        <link rel="preconnect" href={SUPABASE_ORIGIN} />
        <link rel="dns-prefetch" href={SUPABASE_ORIGIN} />
        <ScrollViewStyleReset />
        {/* Fondo blanco desde el primer pintado, para que no haya parpadeo antes de montar la app. */}
        <style dangerouslySetInnerHTML={{ __html: BOOT_CSS }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: DATOS_ESTRUCTURADOS_JSON }} />
      </head>
      <body style={{ backgroundColor: "#FFFFFF" }}>
        {children}
        <noscript>
          <main style={{ maxWidth: 640, margin: "0 auto", padding: 16, fontFamily: "system-ui, sans-serif", color: "#0B2138", textAlign: "center" }}>
            <h1>Videojuegoszaragoza.com</h1>
            <p>
              Tienda online de Zaragoza fundada en 2022 por Daniel Gutiérrez: compramos y vendemos consolas, videojuegos
              y electrónica, y reparamos y mantenemos consolas, mandos, móviles, portátiles y PC. Cada artículo se prueba
              y se limpia antes de entregarlo, y la mayoría tienen 1 año de garantía.
            </p>
            <p>
              En Zaragoza entregamos el mismo día, a domicilio o en mano en Cuarte de Huerva. Al resto de España el
              pedido sale en 1-2 días y llega en 72 horas como máximo.
            </p>
            <ul style={{ listStyle: "none", padding: 0 }}>
              {ENLACES_SIN_JS.map(([ruta, texto]) => (
                <li key={ruta}>
                  <a href={ruta}>{texto}</a>
                </li>
              ))}
            </ul>
            <p>Para comprar, vender o hablar con nosotros, activa JavaScript en tu navegador.</p>
          </main>
        </noscript>
      </body>
    </html>
  );
}
