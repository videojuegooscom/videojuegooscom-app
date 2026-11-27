/**
 * Archivo: components/EtiquetasCabeceraWeb.tsx
 * Función: componente invisible que escribe título, descripción, icono y enlace canónico en el head del navegador.
 * Para qué sirve: aplica el título y la descripción editados en «Marca y SEO», el logo como favicon/og:image y el título propio de cada página pública, leyendo la fila única de site_settings.
 * Conectado con: lib/supabase.ts, tabla site_settings, app/admin/marca-seo.tsx (la edita).
 * Utilizado por: app/_layout.tsx (se monta una vez); otras pantallas (comparar, noticias, quiénes somos) lo mencionan.
 * Dependencias: react, react-native, expo-router.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: aplica, en cualquier pantalla de la app, el título de pestaña y
 * la <meta name="description"> que se editan desde el panel de
 * administración (app/admin/marca-seo.tsx) — y, si hay un logo subido, lo
 * usa también como icono de la pestaña (favicon) y como imagen al compartir
 * el enlace (og:image). Es la mitad "aplicar" de esa pantalla: ella guarda
 * en la tabla "site_settings", este componente la lee y la pone en el
 * <head> real del documento.
 *
 * Por qué DOM directo y no <Head> de expo-router: el componente <Head> de
 * expo-router (react-helmet por debajo) solo pinta algo cuando la pantalla
 * donde vive está "enfocada" (usa useIsFocused() de React Navigation) — está
 * pensado para poner un título DISTINTO en cada pantalla, montado dentro de
 * cada una. Aquí el ajuste global («Marca y SEO») se aplica desde la raíz
 * (app/_layout.tsx, junto a la campanita) escribiendo directamente en el
 * <head> del navegador — sin depender de en qué pantalla esté el visitante
 * ni de si esa pantalla tiene foco — y, según la ruta (usePathname), las
 * páginas públicas principales (Catálogo, Servicios, Vender, Blog, Comparar y las
 * políticas) llevan además su propio título y descripción (tabla PAGINAS).
 *
 * Cómo funciona: en cuanto la app arranca en web, pide la fila única de
 * "site_settings" (lectura pública, no hace falta estar logueado) y:
 * - pone document.title y <meta property="og:title">.
 * - pone/actualiza <meta name="description"> y <meta property="og:description">.
 * - si hay logo_url, lo pone como <link rel="icon">,
 *   <link rel="apple-touch-icon"> y <meta property="og:image">.
 * - en cada ruta, <link rel="canonical"> y og:url con la dirección oficial
 *   (https://videojuegoszaragoza.com + la ruta, sin «?…»).
 * upsertMeta()/upsertLink() reutilizan la etiqueta si ya existe (a partir
 * del favicon fijo que trae app.json) en vez de duplicarla.
 *
 * IMPORTANTE — alcance real (decisión tomada con Daniel): esto es lo que ve
 * cualquier persona con el navegador abierto y lo que indexa Google (su
 * rastreador SÍ ejecuta JavaScript, así que ve este cambio). Lo que NO
 * cubre es la tarjeta que WhatsApp o Facebook arman al pegar el enlace —
 * esos programas NO ejecutan JavaScript y necesitarían las etiquetas ya
 * escritas en el HTML antes de esto (una función de Vercel aparte). Si en
 * algún momento se quiere ese nivel, es un paso siguiente, no está aquí.
 *
 * Conectado con:
 * - lib/supabase.ts → lee "site_settings".
 * - app/admin/marca-seo.tsx → desde donde se edita seo_title,
 *   seo_description y logo_url.
 * - app/_layout.tsx → la monta una única vez, junto a AsistenteBlue/AvisoAnaliticaCookies.
 * - app/noticias/[id].tsx → usa upsertMeta/upsertLink para su propia cabecera (título, descripción, og:* y
 *   NewsArticle); aquí esas rutas solo reciben la dirección oficial (RUTAS_CON_CABECERA_PROPIA).
 */
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { usePathname } from "expo-router";
import { supabase } from "../lib/supabase";

// Título y descripción propios de cada página pública (los ve Google tras ejecutar la web y quien
// comparte el enlace desde el navegador). El título lleva detrás el nombre de la marca de «Marca y
// SEO». Las fichas de producto y de servicio mantienen el título general.
const PAGINAS: Record<string, { titulo: string; descripcion?: string }> = {
  "/catalogo": { titulo: "Catálogo", descripcion: "Consolas, videojuegos y dispositivos de segunda mano y reacondicionados." },
  "/servicios": { titulo: "Servicios de reparación y mantenimiento", descripcion: "Reparación, limpieza y mantenimiento de consolas y dispositivos." },
  "/vender": { titulo: "Vender mi artículo", descripcion: "Vende o intercambia tu consola o dispositivo: cuéntanos qué tienes y te damos un precio." },
  "/blog": { titulo: "Blog", descripcion: "Novedades y artículos de la tienda." },
  // «Compramos tu…» (app/compramos/[tipo].tsx, 2026-11-24). Desde el 2026-11-25, con las palabras que busca la gente
  // («vender mi consola», «vender consola online»): «Vende tu…» delante, Zaragoza y toda España, sin repetir de más.
  "/compramos/consolas": {
    titulo: "Vende tu consola: PS5, Switch y Xbox · Zaragoza y toda España",
    descripcion: "¿Quieres vender tu consola? Te compramos tu PS5, Nintendo Switch o Xbox: tasación en menos de 30 minutos y pago al momento por Bizum o en efectivo. Recogida en Zaragoza o envío gratis.",
  },
  "/compramos/moviles": {
    titulo: "Vende tu móvil: iPhone y Android · Zaragoza y toda España",
    descripcion: "¿Quieres vender tu móvil? Te compramos tu iPhone, Samsung, Xiaomi o Pixel, también averiado: tasación en menos de 30 minutos y pago al momento. Recogida en Zaragoza o envío gratis.",
  },
  "/compramos/portatiles": {
    titulo: "Vende tu portátil o MacBook · Zaragoza y toda España",
    descripcion: "¿Quieres vender tu portátil? Te compramos tu MacBook, portátil gaming o Windows: tasación en menos de 30 minutos y pago al momento por Bizum o en efectivo. Recogida en Zaragoza o envío gratis.",
  },
  "/compramos/pc": {
    titulo: "Vende tu PC, gráfica o monitor · Zaragoza y toda España",
    descripcion: "¿Quieres vender tu PC? Te compramos tu PC gaming, tarjeta gráfica, monitor o periféricos: tasación en menos de 30 minutos y pago al momento. Recogida en Zaragoza o envío gratis.",
  },
  "/compramos/tablets": {
    titulo: "Vende tu iPad o tablet · Zaragoza y toda España",
    descripcion: "¿Quieres vender tu iPad o tu tablet? Te la compramos: tasación en menos de 30 minutos y pago al momento por Bizum o en efectivo. Recogida en Zaragoza o envío gratis desde toda España.",
  },
  // Televisión, cámara y dron (2026-11-27).
  "/compramos/televisores": {
    titulo: "Vende tu televisión o Smart TV · Zaragoza y toda España",
    descripcion: "¿Quieres vender tu televisión? Te compramos tu Smart TV Samsung, LG, Sony y más, también averiada: tasación en menos de 30 minutos y pago al momento. Recogida en Zaragoza o envío gratis.",
  },
  "/compramos/camaras": {
    titulo: "Vende tu cámara de fotos o GoPro · Zaragoza y toda España",
    descripcion: "¿Quieres vender tu cámara? Te compramos tu réflex, sin espejo o GoPro de Canon, Nikon, Sony o Fujifilm: tasación en menos de 30 minutos y pago al momento. Recogida en Zaragoza o envío gratis.",
  },
  "/compramos/drones": {
    titulo: "Vende tu dron DJI · Zaragoza y toda España",
    descripcion: "¿Quieres vender tu dron? Te compramos tu DJI Mini, Air, Mavic o Avata, también averiado: tasación en menos de 30 minutos y pago al momento por Bizum o en efectivo. Recogida en Zaragoza o envío gratis.",
  },
  // «Comparar 2-3 productos» (mejora 8, 2026-11-14): el enlace con ?ids= se comparte; la dirección oficial va sin ellos.
  "/comparar": { titulo: "Comparar productos", descripcion: "Compara hasta 3 consolas, móviles o accesorios: precio, estado, categoría y entrega estimada." },
  "/noticias": {
    titulo: "Noticias de consolas, videojuegos y tecnología",
    descripcion: "Las últimas noticias de consolas, videojuegos, PC, móviles y accesorios, resumidas en español por Videojuegoszaragoza.com.",
  },
  // El dueño quiere salir en Google al buscar «Daniel Gutiérrez» (2026-11-03): su nombre va en el título y en la
  // descripción, igual que en la página y en sus datos estructurados (app/+html.tsx).
  "/quienes-somos": {
    titulo: "Daniel Gutiérrez, fundador · Quiénes somos",
    descripcion:
      "Daniel Gutiérrez fundó Videojuegoszaragoza.com en 2022: compraventa de consolas y electrónica, con reparación de consolas, mandos, móviles, portátiles y PC. Tienda online de Zaragoza con envíos a toda España.",
  },
  "/politicas/envios": { titulo: "Política de envíos" },
  "/politicas/devoluciones": { titulo: "Política de devoluciones" },
  "/politicas/privacidad": { titulo: "Política de privacidad" },
  "/politicas/terminos": { titulo: "Términos y condiciones" },
  "/politicas/normas-foro": { titulo: "Normas del Foro", descripcion: "Cómo participar en el Foro y en los comentarios de las noticias." },
};

/**
 * Título (con la marca) y descripción propios de una página pública, o null. Lo usa también app/_layout.tsx para
 * escribirlos ya en el HTML que se genera al publicar (páginas «Compramos», 2026-11-25).
 */
export function cabeceraDeRuta(ruta: string): { titulo: string; descripcion: string | null } | null {
  const p = PAGINAS[ruta.replace(/\/+$/, "") || "/"];
  return p ? { titulo: `${p.titulo} | ${MARCA}`, descripcion: p.descripcion ?? null } : null;
}

type Ajustes = { title: string; description: string; logoUrl: string };

// Dirección oficial de cada página (canonical): la misma página también se abre por las direcciones de Vercel o con
// «?…» detrás, y así Google sabe cuál es la buena y no las cuenta como copias.
const DOMINIO = "https://videojuegoszaragoza.com";
const MARCA = "Videojuegoszaragoza.com";
// La misma que «Marca y SEO» (2026-11-25): app/_layout.tsx la escribe en el HTML ya generado, porque Vercel no publica lo
// que scripts/inject-seo-html.js cambia en dist/. Si el dueño cambia la de Marca y SEO, se cambia también aquí.
export const DESCRIPCION_GENERAL = "Compramos tu consola, móvil u ordenador en Zaragoza y toda España: tasación en menos de 30 minutos y pago al momento. Venta y reparación de electrónica.";

// Cada noticia (app/noticias/[id].tsx) pone su propio título, descripción, og:* y datos estructurados al cargarse: aquí
// solo se pone su dirección oficial, para no pisarle el título cuando «Marca y SEO» llega después.
// Las fichas de producto y de servicio (2026-11-24, Search Console) también ponen la suya con ponerCabeceraFicha.
const RUTAS_CON_CABECERA_PROPIA = /^\/(noticias|producto|servicio)\/[^/]+$/;

/** Recorta un texto a `max` letras sin cortar palabras, con «…». */
export function recortarTexto(texto: string, max = 158): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (limpio.length <= max) return limpio;
  return `${limpio.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

/**
 * Título, descripción, og:* y dirección oficial propios de una ficha (producto o servicio), en el <head> (solo web).
 * Google lee lo que pone la página tras ejecutarse: así cada ficha sale en Google con su nombre y no con el de la
 * tienda. Devuelve cómo dejarlo al salir de la ficha.
 */
export function ponerCabeceraFicha(f: { ruta: string; titulo: string; descripcion: string; imagen?: string | null }): () => void {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const direccion = `${DOMINIO}${f.ruta}`;
  const titulo = `${f.titulo} | ${MARCA}`;
  const descripcion = recortarTexto(f.descripcion);
  const meta = (attr: "name" | "property", clave: string) => document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${clave}"]:not([data-rh])`)?.getAttribute("content") ?? null;
  const antes = { titulo: document.title, descripcion: meta("name", "description"), ogTitle: meta("property", "og:title"), ogDescription: meta("property", "og:description"), ogImage: meta("property", "og:image") };
  document.title = titulo;
  ponerEtiquetaMeta("name", "description", descripcion);
  ponerEtiquetaMeta("property", "og:title", titulo);
  ponerEtiquetaMeta("property", "og:description", descripcion);
  if (f.imagen) ponerEtiquetaMeta("property", "og:image", f.imagen);
  ponerEtiquetaMeta("property", "og:url", direccion);
  ponerEnlaceCabecera("canonical", direccion);
  return () => {
    if (document.title === titulo) document.title = antes.titulo;
    if (antes.descripcion !== null) ponerEtiquetaMeta("name", "description", antes.descripcion);
    if (antes.ogTitle !== null) ponerEtiquetaMeta("property", "og:title", antes.ogTitle);
    if (antes.ogDescription !== null) ponerEtiquetaMeta("property", "og:description", antes.ogDescription);
    if (antes.ogImage !== null) ponerEtiquetaMeta("property", "og:image", antes.ogImage);
  };
}

// Las etiquetas del HTML ya generado que pone app/_layout.tsx con <Head> (data-rh) se quitan solas cuando la tienda
// arranca: aquí no se reutilizan (se perdería lo escrito), se usa o se crea una propia (2026-11-25).
export function ponerEtiquetaMeta(attr: "name" | "property", key: string, content: string) {
  if (typeof document === "undefined") return;

  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]:not([data-rh])`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function ponerEnlaceCabecera(rel: string, href: string) {
  if (typeof document === "undefined") return;

  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]:not([data-rh])`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export default function EtiquetasCabeceraWeb() {
  const pathname = usePathname() ?? "/";
  const [ajustes, setAjustes] = useState<Ajustes | null>(null);

  // Una sola vez: lee «Marca y SEO» y pone el icono y la imagen al compartir.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;

    let alive = true;

    async function applySiteHead() {
      try {
        const { data, error } = await supabase
          .from("site_settings")
          .select("seo_title, seo_description, logo_url")
          .eq("id", 1)
          .maybeSingle();

        if (!alive || error || !data) return;

        const title = String((data as any).seo_title ?? "").trim();
        const description = String((data as any).seo_description ?? "").trim();
        const logoUrl = String((data as any).logo_url ?? "").trim();

        if (logoUrl) {
          ponerEnlaceCabecera("icon", logoUrl);
          ponerEnlaceCabecera("apple-touch-icon", logoUrl);
          ponerEtiquetaMeta("property", "og:image", logoUrl);
        }
        setAjustes({ title, description, logoUrl });
      } catch {
        // Silencioso: si falla, la app se queda con el título/favicon
        // estáticos de siempre (app.json) — nunca debe romper la pantalla.
      }
    }

    applySiteHead();

    return () => {
      alive = false;
    };
  }, []);

  // En cada página: su título, su descripción (o los generales de «Marca y SEO») y su dirección oficial. Las páginas
  // de PAGINAS llevan los suyos aunque «Marca y SEO» no haya cargado (con el nombre de la marca de siempre).
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const ruta = pathname.replace(/\/+$/, "") || "/";
    ponerEnlaceCabecera("canonical", `${DOMINIO}${ruta === "/" ? "/" : ruta}`);
    ponerEtiquetaMeta("property", "og:url", `${DOMINIO}${ruta === "/" ? "/" : ruta}`);
    if (RUTAS_CON_CABECERA_PROPIA.test(ruta)) return;
    const pagina = PAGINAS[ruta];
    const marca = ajustes?.title || MARCA;
    const titulo = pagina ? `${pagina.titulo} | ${marca}` : marca;
    // Sin la suya ni «Marca y SEO» (aún cargando o sin respuesta), la general: el HTML generado ya no la trae fija
    // (2026-11-25) y la de <Head> se quita al arrancar, así que siempre hay una.
    const descripcion = pagina?.descripcion || ajustes?.description || DESCRIPCION_GENERAL;

    if (titulo) {
      document.title = titulo;
      ponerEtiquetaMeta("property", "og:title", titulo);
    }
    if (descripcion) {
      ponerEtiquetaMeta("name", "description", descripcion);
      ponerEtiquetaMeta("property", "og:description", descripcion);
    }
  }, [pathname, ajustes]);

  return null;
}
