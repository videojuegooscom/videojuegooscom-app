// components/SiteHead.tsx
/**
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
 * páginas públicas principales (Catálogo, Servicios, Vender, Blog y las
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
 * - app/_layout.tsx → la monta una única vez, junto a Campanita/CookieConsentBanner.
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

type Ajustes = { title: string; description: string; logoUrl: string };

// Dirección oficial de cada página (canonical): la misma página también se abre por las direcciones de Vercel o con
// «?…» detrás, y así Google sabe cuál es la buena y no las cuenta como copias.
const DOMINIO = "https://videojuegoszaragoza.com";
const MARCA = "Videojuegoszaragoza.com";

// Cada noticia (app/noticias/[id].tsx) pone su propio título, descripción, og:* y datos estructurados al cargarse: aquí
// solo se pone su dirección oficial, para no pisarle el título cuando «Marca y SEO» llega después.
const RUTAS_CON_CABECERA_PROPIA = /^\/noticias\/[^/]+$/;

export function upsertMeta(attr: "name" | "property", key: string, content: string) {
  if (typeof document === "undefined") return;

  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function upsertLink(rel: string, href: string) {
  if (typeof document === "undefined") return;

  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export default function SiteHead() {
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
          upsertLink("icon", logoUrl);
          upsertLink("apple-touch-icon", logoUrl);
          upsertMeta("property", "og:image", logoUrl);
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
    upsertLink("canonical", `${DOMINIO}${ruta === "/" ? "/" : ruta}`);
    upsertMeta("property", "og:url", `${DOMINIO}${ruta === "/" ? "/" : ruta}`);
    if (RUTAS_CON_CABECERA_PROPIA.test(ruta)) return;
    const pagina = PAGINAS[ruta];
    if (!pagina && !ajustes) return;
    const marca = ajustes?.title || MARCA;
    const titulo = pagina ? `${pagina.titulo} | ${marca}` : marca;
    const descripcion = pagina?.descripcion ?? ajustes?.description;

    if (titulo) {
      document.title = titulo;
      upsertMeta("property", "og:title", titulo);
    }
    if (descripcion) {
      upsertMeta("name", "description", descripcion);
      upsertMeta("property", "og:description", descripcion);
    }
  }, [pathname, ajustes]);

  return null;
}
