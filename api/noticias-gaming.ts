/**
 * api/noticias-gaming.ts
 *
 * Qué hace: función serverless de Vercel (GET /api/noticias-gaming) que
 * recopila noticias recientes de gaming y electrónica (Google Noticias +
 * medios de videojuegos en español, por RSS), descarta repetidas y las que
 * ya están guardadas, y para cada una (máx. 8 por ejecución) pide a OpenAI
 * (gpt-4o-mini) un desglose en español: resumen, puntos clave, datos
 * concretos, por qué importa y a quién afecta. Solo se guardan las
 * relevantes para el mundo de la electrónica gaming.
 *
 * Imágenes (carrusel de la pestaña): hasta 6 por noticia. Salen del RSS
 * (media:content, media:thumbnail, enclosure, <img> de la descripción) y del
 * HTML del artículo (og:image, twitter:image e <img> grandes de <article> o
 * del cuerpo), sin logos, iconos, avatares, píxeles, svg, data: ni anuncios.
 * Se guardan en imagen_url (la principal) e imagenes (todas). Los enlaces de
 * Google Noticias se traducen a la URL real del medio (id en base64 o, en el
 * formato nuevo, la petición batchexecute de Google) y esa URL también se usa
 * para leer el texto del artículo. Si todo falla, la noticia sigue sin fotos.
 *
 * Cuándo actualiza:
 * - Cron diario de Vercel (vercel.json → "crons"), con la cabecera
 *   Authorization: Bearer ${CRON_SECRET}: siempre.
 * - Visitas a la pestaña "Noticias Gaming": solo si la última actualización
 *   (noticias_gaming_control, clave 'ultima') tiene más de 3 horas. Si no,
 *   no recoge noticias nuevas. La marca 'ultima' se reserva ANTES de procesar
 *   para que dos visitas a la vez no dupliquen el trabajo (ni el gasto de IA).
 * - Relleno de imágenes: en cada ejecución, como mucho cada 10 minutos
 *   (clave 'relleno'), busca fotos para hasta 6 noticias guardadas que no
 *   tienen, SIN llamar a OpenAI. La clave 'relleno_cursor' recuerda por qué
 *   fecha va, para recorrerlas todas poco a poco.
 *
 * Variables de entorno (Vercel → Settings → Environment Variables):
 * - OPENAI_API_KEY: clave de OpenAI (ya la usa api/blue-ia.ts).
 * - EXPO_PUBLIC_SUPABASE_URL: URL del proyecto de Supabase.
 * - SUPABASE_CLAVE_SERVIDOR: clave secreta del servidor de Supabase, SOLO servidor (escribe en
 *   las tablas, que no tienen políticas de escritura públicas).
 * - CRON_SECRET: secreto que Vercel manda en las llamadas del cron.
 *
 * Conectado con:
 * - supabase/migrations/20261013171000_noticias_gaming.sql → tablas.
 * - supabase/migrations/20261013190000_noticias_imagenes.sql → columna
 *   imagenes (si todavía no existe, se guarda solo imagen_url).
 * - app/(tabs)/chat-global.tsx → pestaña "Noticias Gaming" (lee la tabla y
 *   llama aquí en segundo plano al abrirse).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Vercel: margen máximo de ejecución (válido en plan Hobby).
export const config = { maxDuration: 60 };

const HORAS_ENTRE_ACTUALIZACIONES = 3;
const MINUTOS_ENTRE_RELLENOS = 10;
const MAX_NOTICIAS_POR_EJECUCION = 8;
const MAX_RELLENO_POR_EJECUCION = 6;
const MAX_IMAGENES = 6;
const CONCURRENCIA = 3;
const PRESUPUESTO_TOTAL_MS = 50_000;
const PRESUPUESTO_RELLENO_MS = 30_000;
const TIMEOUT_FEED_MS = 6_000;
const TIMEOUT_ARTICULO_MS = 6_000;
const TIMEOUT_GOOGLE_MS = 5_000;
const TIMEOUT_OPENAI_MS = 22_000;
const MAX_TEXTO_ARTICULO = 6_000;
const MAX_HTML = 1_500_000;
const MAX_ANTIGUEDAD_MS = 4 * 24 * 3600 * 1000;

const CATEGORIAS = [
  "Consolas",
  "Videojuegos",
  "PC gaming",
  "Móviles y tablets",
  "Accesorios",
  "Ofertas",
  "Gaming",
] as const;
type Categoria = (typeof CATEGORIAS)[number];

const UA =
  "Mozilla/5.0 (compatible; VideojuegosZaragozaNoticias/1.0; +https://videojuegoszaragoza.com)";

// Fuentes RSS. Si alguna falla o cambia de formato, simplemente se salta.
const CONSULTAS_GOOGLE = [
  "videojuegos",
  "PlayStation OR Xbox OR Nintendo",
  "PC gaming tarjeta gráfica",
  "móvil gaming",
  "ofertas consolas videojuegos",
];

const FEEDS: { url: string; fuente?: string }[] = [
  ...CONSULTAS_GOOGLE.map((q) => ({
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:2d`)}&hl=es&gl=ES&ceid=ES:es`,
  })),
  { url: "https://vandal.elespanol.com/xml.cgi", fuente: "Vandal" },
  { url: "https://www.3djuegos.com/feedburner.xml", fuente: "3DJuegos" },
  { url: "https://www.eurogamer.es/feed", fuente: "Eurogamer España" },
];

type Candidata = {
  url: string;
  fuente: string;
  titulo: string;
  descripcion: string;
  imagenes: string[];
  fecha: Date | null;
};

type Desglose = {
  relevante: boolean;
  categoria: Categoria;
  titulo: string;
  resumen: string;
  puntos_clave: string[];
  datos: string[];
  por_que_importa: string | null;
  afecta_a: string | null;
};

// --- Utilidades de texto ----------------------------------------------------

const ENTIDADES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  laquo: "«",
  raquo: "»",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  euro: "€",
  iexcl: "¡",
  iquest: "¿",
  ntilde: "ñ",
  Ntilde: "Ñ",
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  Aacute: "Á",
  Eacute: "É",
  Iacute: "Í",
  Oacute: "Ó",
  Uacute: "Ú",
  uuml: "ü",
};

function decodificarEntidades(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, ent: string) => {
    if (ent[0] === "#") {
      const code = ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTIDADES[ent] ?? m;
  });
}

function quitarCdata(texto: string): string {
  return texto.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

// HTML que llega escapado dentro del RSS (&lt;img …&gt;) se desescapa.
function desescaparHtml(html: string): string {
  const limpio = quitarCdata(html);
  return /&lt;[a-z]/i.test(limpio) ? decodificarEntidades(limpio) : limpio;
}

function textoPlano(html: string): string {
  return decodificarEntidades(
    quitarCdata(html)
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function etiqueta(xml: string, nombre: string): string {
  const re = new RegExp(`<${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</${nombre}>`, "i");
  const m = xml.match(re);
  return m ? quitarCdata(m[1]).trim() : "";
}

// Atributos de una etiqueta HTML/XML como mapa nombre → valor (ya desescapado).
function atributosDe(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag)) !== null) {
    const nombre = m[1].toLowerCase();
    if (!(nombre in attrs)) attrs[nombre] = decodificarEntidades(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

// Normaliza un título para comparar parecidos (sin tildes, sin signos).
function palabrasTitulo(titulo: string): Set<string> {
  const limpio = titulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ");
  return new Set(limpio.split(/\s+/).filter((p) => p.length > 2));
}

function titulosParecidos(a: Set<string>, b: Set<string>): boolean {
  if (!a.size || !b.size) return false;
  let comunes = 0;
  for (const p of a) if (b.has(p)) comunes++;
  return comunes / Math.min(a.size, b.size) >= 0.75;
}

function normalizarUrl(url: string): string {
  try {
    const u = new URL(url);
    // Quita parámetros de seguimiento (utm_*, fbclid…) y el ancla.
    const query = u.search
      .replace(/^\?/, "")
      .split("&")
      .filter((p) => p && !/^(utm_|fbclid|gclid|ocid)/i.test(p))
      .join("&");
    return `${u.origin}${u.pathname}${query ? `?${query}` : ""}`;
  } catch {
    return url.trim();
  }
}

function hostDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Web";
  }
}

function sinEscapes(texto: string): string {
  try {
    return decodeURIComponent(texto);
  } catch {
    return texto;
  }
}

// --- Red con límite de tiempo -----------------------------------------------

async function fetchConTimeout(url: string, ms: number, init: RequestInit = {}): Promise<Response> {
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), Math.max(500, ms));
  try {
    return await fetch(url, { ...init, signal: control.signal });
  } finally {
    clearTimeout(t);
  }
}

// Descarga un texto con un límite de tiempo que incluye leer el cuerpo.
// Nunca lanza: si falla o no hay tiempo, devuelve null.
async function pedirTexto(
  url: string,
  ms: number,
  init: RequestInit = {}
): Promise<{ ok: boolean; url: string; tipo: string; texto: string } | null> {
  if (!(ms >= 800)) return null;
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), ms);
  try {
    const r = await fetch(url, { redirect: "follow", ...init, signal: control.signal });
    const texto = await r.text();
    return {
      ok: r.ok,
      url: r.url || url,
      tipo: r.headers.get("content-type") ?? "",
      texto: r.ok ? texto.slice(0, MAX_HTML) : "",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// --- Imágenes -----------------------------------------------------------------

// Trozos de ruta que delatan logos, iconos, avatares, píxeles o publicidad.
const RUTA_DESCARTADA =
  /(?:^|[/_.-])(?:logos?|icons?|favicons?|avatars?|sprites?|pixel|spacer|blank|placeholder|emojis?|smilies|gravatar|badges?|ads?|adv|advert[a-z]*|publicidad|anuncios?|sponsors?|patrocinad[oa]s?|tracking|beacon|authors?|autor(?:es)?|profiles?|perfil(?:es)?|1x1)(?=[/_.-]|$)/;
// Imágenes genéricas de la web (la misma para todas las noticias).
const RUTA_GENERICA = /(?:og|share|social)[-_]?default|default[-_]?(?:og|share|social|image|thumb)/;
const HOST_DESCARTADO =
  /(?:doubleclick\.net|googlesyndication\.com|googleadservices\.com|google-analytics\.com|googletagmanager\.com|amazon-adsystem\.com|adnxs\.com|taboola\.com|outbrain\.com|scorecardresearch\.com|facebook\.com|facebook\.net|gravatar\.com|feedburner\.com|feedsportal\.com|^pixel\.|^ads?\.|^stats\.)/;
const EXTENSION_DESCARTADA = /\.(?:svg|gif|ico|bmp|mp4|webm|mov|m3u8|mp3|m4a|pdf|html?)$/;
const CLASE_DESCARTADA = /\b(?:avatar|logo|icon|author|autor|emoji|wp-smiley|ad|ads|advert|sponsor|publicidad)\b/i;

function medida(valor?: string): number | null {
  const m = valor?.trim().match(/^(\d+)(?:px)?$/i);
  return m ? Number(m[1]) : null;
}

// Tamaño declarado pequeño: miniaturas, iconos o píxeles de seguimiento.
function esPequena(ancho?: string, alto?: string): boolean {
  const w = medida(ancho);
  const h = medida(alto);
  return (w !== null && w < 400) || (h !== null && h < 200);
}

// URL absoluta https de una imagen válida, o null si hay que ignorarla.
function urlImagenLimpia(cruda: string, base?: string): string | null {
  let s = cruda.trim();
  if (!s || /^(?:data|blob|javascript):/i.test(s)) return null;
  if (s.startsWith("//")) s = `https:${s}`;
  let u: URL;
  try {
    u = base ? new URL(s, base) : new URL(s);
  } catch {
    return null;
  }
  if (u.protocol === "http:") u.protocol = "https:";
  if (u.protocol !== "https:") return null;

  const ruta = sinEscapes(u.pathname).toLowerCase();
  if (EXTENSION_DESCARTADA.test(ruta)) return null;
  if (HOST_DESCARTADO.test(u.hostname.toLowerCase())) return null;
  if (RUTA_DESCARTADA.test(ruta) || RUTA_GENERICA.test(ruta)) return null;

  // Tamaños pequeños en el nombre (foto-150x150.jpg) o en la consulta (?w=120).
  const enNombre = ruta.match(/[-_](\d{2,4})x(\d{2,4})\.[a-z0-9]+$/);
  if (enNombre && (Number(enNombre[1]) < 400 || Number(enNombre[2]) < 200)) return null;
  const enConsulta = u.search.match(/[?&](?:w|width)=(\d+)(?:&|$)/i);
  if (enConsulta && Number(enConsulta[1]) < 400) return null;

  u.hash = "";
  return u.toString();
}

// Clave para reconocer la misma foto aunque venga en otro tamaño o ruta.
function claveImagen(url: string): string {
  try {
    const u = new URL(url);
    const ruta = u.pathname.toLowerCase();
    const archivo = ruta.split("/").pop() ?? "";
    const raiz = archivo
      .replace(/\.[a-z0-9]+$/, "")
      .replace(/[-_](?:\d{2,4}x\d{2,4}|scaled|large|medium|small|thumb(?:nail)?|original|full)$/, "");
    if (/\.(?:jpe?g|png|webp|avif)$/.test(archivo) && raiz.length >= 8) return raiz;
    return `${u.hostname.replace(/^www\./, "")}${ruta}${u.search}`;
  } catch {
    return url;
  }
}

// Une listas de imágenes en orden, sin repetidas y con un máximo de 6.
function unirImagenes(...listas: (string | null | undefined)[][]): string[] {
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const lista of listas) {
    for (const url of lista) {
      if (!url || salida.length >= MAX_IMAGENES) continue;
      const clave = claveImagen(url);
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      salida.push(url);
    }
  }
  return salida;
}

// De un srcset («a.jpg 400w, b.jpg 1200w») se queda con la más grande.
function mejorDeSrcset(srcset: string): string {
  let mejor = "";
  let mejorTam = -1;
  for (const parte of srcset.split(/,\s+/)) {
    const [url, desc = ""] = parte.trim().split(/\s+/);
    if (!url) continue;
    const n = parseFloat(desc);
    const tam = Number.isFinite(n) ? (desc.endsWith("x") ? n * 1000 : n) : 0;
    if (tam >= mejorTam) {
      mejor = url;
      mejorTam = tam;
    }
  }
  return mejor;
}

// media:content, media:thumbnail y enclosure del RSS (solo si son imágenes).
function imagenesDeMedios(item: string, base: string): string[] {
  const salida: string[] = [];
  for (const tag of item.match(/<(?:media:content|media:thumbnail|enclosure)\b[^>]*>/gi) ?? []) {
    const a = atributosDe(tag);
    const tipo = `${a.type ?? ""} ${a.medium ?? ""}`.trim().toLowerCase();
    if (tipo && !tipo.includes("image")) continue;
    if (esPequena(a.width, a.height)) continue;
    const url = a.url ? urlImagenLimpia(a.url, base) : null;
    if (url) salida.push(url);
  }
  return salida;
}

// <img> y <source> (también las de carga diferida: data-src, data-srcset…).
function imagenesDeEtiquetas(html: string, base: string, max: number): string[] {
  const salida: string[] = [];
  for (const tag of html.match(/<(?:img|source)\b[^>]*>/gi) ?? []) {
    if (salida.length >= max) break;
    const a = atributosDe(tag);
    if (a.type && !/^image\//i.test(a.type)) continue;
    if (esPequena(a.width, a.height)) continue;
    if (CLASE_DESCARTADA.test(`${a.class ?? ""} ${a.id ?? ""}`)) continue;
    const opciones = [
      mejorDeSrcset(a["data-srcset"] || a["data-lazy-srcset"] || a.srcset || ""),
      a["data-src"],
      a["data-lazy-src"],
      a["data-original"],
      a["data-full-url"],
      a.src,
    ];
    for (const opcion of opciones) {
      const url = opcion ? urlImagenLimpia(opcion, base) : null;
      if (url) {
        salida.push(url);
        break;
      }
    }
  }
  return salida;
}

// og:image, twitter:image y similares: la foto de portada del artículo.
function imagenesDePortada(html: string, base: string): string[] {
  const salida: string[] = [];
  for (const tag of html.slice(0, 400_000).match(/<(?:meta|link)\b[^>]*>/gi) ?? []) {
    const a = atributosDe(tag);
    const clave = (a.property || a.name || a.itemprop || a.rel || "").toLowerCase();
    if (!/^(?:og:image(?::url|:secure_url)?|twitter:image(?::src)?|image|image_src|thumbnailurl)$/.test(clave)) {
      continue;
    }
    const valor = /^<link/i.test(tag) ? a.href : a.content;
    const url = valor ? urlImagenLimpia(valor, base) : null;
    if (url) salida.push(url);
  }
  return salida;
}

// --- Lectura de RSS ---------------------------------------------------------

function parsearRss(xml: string, fuentePorDefecto?: string): Candidata[] {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  const salida: Candidata[] = [];

  for (const item of items) {
    let titulo = textoPlano(etiqueta(item, "title"));
    const link = decodificarEntidades(etiqueta(item, "link")).trim();
    if (!titulo || !/^https?:\/\//i.test(link)) continue;

    const fuenteRss = textoPlano(etiqueta(item, "source"));
    const fuente = fuenteRss || fuentePorDefecto || "";
    // Google Noticias añade " - Medio" al final del título.
    if (fuenteRss && titulo.endsWith(` - ${fuenteRss}`)) {
      titulo = titulo.slice(0, -(fuenteRss.length + 3)).trim();
    }

    const descripcion = etiqueta(item, "description");
    const contenido = etiqueta(item, "content:encoded");
    const descripcionHtml = desescaparHtml(descripcion || contenido);
    const fechaTxt = etiqueta(item, "pubDate") || etiqueta(item, "dc:date");
    const fecha = fechaTxt ? new Date(fechaTxt) : null;

    salida.push({
      url: normalizarUrl(link),
      fuente: fuente || hostDe(link),
      titulo: titulo.slice(0, 300),
      descripcion: textoPlano(descripcionHtml).slice(0, 1200),
      imagenes: unirImagenes(
        imagenesDeMedios(item, link),
        imagenesDeEtiquetas(desescaparHtml(`${descripcion} ${contenido}`), link, MAX_IMAGENES)
      ),
      fecha: fecha && !Number.isNaN(fecha.getTime()) ? fecha : null,
    });
  }
  return salida;
}

async function leerFeed(feed: { url: string; fuente?: string }): Promise<Candidata[]> {
  try {
    const r = await fetchConTimeout(feed.url, TIMEOUT_FEED_MS, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml, */*" },
    });
    if (!r.ok) {
      console.warn("Noticias: feed sin respuesta válida:", feed.url, r.status);
      return [];
    }
    return parsearRss(await r.text(), feed.fuente);
  } catch (e) {
    console.warn("Noticias: feed saltado:", feed.url, e instanceof Error ? e.message : e);
    return [];
  }
}

// --- Google Noticias: de su enlace a la URL real del medio ---------------------

function idGoogleNoticias(url: string): string | null {
  const m = url.match(/^https?:\/\/news\.google\.com\/(?:rss\/)?(?:articles|read)\/([A-Za-z0-9_-]{10,})/i);
  return m ? m[1] : null;
}

function base64UrlABytes(texto: string): Uint8Array | null {
  const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const limpio = texto.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const salida: number[] = [];
  let acumulado = 0;
  let bits = 0;
  for (const c of limpio) {
    const v = ALFABETO.indexOf(c);
    if (v < 0) return null;
    acumulado = ((acumulado << 6) | v) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      salida.push((acumulado >> bits) & 0xff);
    }
  }
  return Uint8Array.from(salida);
}

function bytesATexto(bytes: Uint8Array): string {
  let codificado = "";
  for (const b of bytes) codificado += `%${b.toString(16).padStart(2, "0")}`;
  try {
    return decodeURIComponent(codificado);
  } catch {
    return String.fromCharCode(...bytes);
  }
}

// Cadenas de primer nivel de un mensaje protobuf (campos de tipo «longitud»).
function cadenasProtobuf(buf: Uint8Array): string[] {
  const salida: string[] = [];
  let i = 0;
  const varint = (): number | null => {
    let valor = 0;
    let mult = 1;
    while (i < buf.length) {
      const b = buf[i++];
      valor += (b & 0x7f) * mult;
      if (!(b & 0x80)) return valor;
      mult *= 128;
      if (mult > 2 ** 35) return null;
    }
    return null;
  };
  while (i < buf.length) {
    const clave = varint();
    if (clave === null) break;
    const tipo = clave % 8;
    if (tipo === 0) {
      if (varint() === null) break;
    } else if (tipo === 2) {
      const largo = varint();
      if (largo === null || i + largo > buf.length) break;
      salida.push(bytesATexto(buf.subarray(i, i + largo)));
      i += largo;
    } else if (tipo === 1) {
      i += 8;
    } else if (tipo === 5) {
      i += 4;
    } else {
      break;
    }
  }
  return salida;
}

// Formato antiguo («CBMi…»): el id es un protobuf en base64 con la URL dentro.
function urlDeIdAntiguo(id: string): string | null {
  const bytes = base64UrlABytes(id);
  if (!bytes) return null;
  const url = cadenasProtobuf(bytes).find((t) => /^https?:\/\/\S+$/i.test(t));
  if (url) return url;
  // Respaldo: una URL legible dentro de los bytes.
  return String.fromCharCode(...bytes).match(/https?:\/\/[\x21-\x7e]+/)?.[0] ?? null;
}

// En la respuesta de batchexecute, la URL va en la entrada «Fbv4je»:
// su tercer elemento es otro JSON («garturlres», URL, 1).
function urlDeRespuestaBatch(texto: string): string | null {
  for (const linea of texto.split("\n")) {
    const l = linea.trim();
    if (!l.startsWith("[")) continue;
    try {
      const datos: unknown = JSON.parse(l);
      if (!Array.isArray(datos)) continue;
      for (const e of datos) {
        if (!Array.isArray(e) || e[1] !== "Fbv4je" || typeof e[2] !== "string") continue;
        const interior: unknown = JSON.parse(e[2]);
        if (Array.isArray(interior) && typeof interior[1] === "string" && /^https?:\/\//i.test(interior[1])) {
          return interior[1];
        }
      }
    } catch {
      // Línea que no es JSON: se ignora.
    }
  }
  return null;
}

// Formato nuevo: firma y marca de tiempo de la página del artículo y luego la
// petición batchexecute (rpcid Fbv4je) que usa la propia web de Google Noticias.
async function urlDeIdNuevo(id: string, ms: number): Promise<string | null> {
  const fin = Date.now() + ms;
  const quedan = () => fin - Date.now();

  let firma = "";
  let marca = "";
  for (const pagina of [`https://news.google.com/articles/${id}`, `https://news.google.com/rss/articles/${id}`]) {
    const r = await pedirTexto(pagina, Math.min(TIMEOUT_GOOGLE_MS, quedan() - 1_500), {
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "es-ES,es;q=0.9" },
    });
    if (!r?.ok) continue;
    firma = decodificarEntidades(r.texto.match(/data-n-a-sg=["']([^"']+)["']/)?.[1] ?? "");
    marca = r.texto.match(/data-n-a-ts=["']([^"']+)["']/)?.[1] ?? "";
    if (firma && marca) break;
  }
  const ts = Number(marca);
  if (!firma || !marca || !Number.isFinite(ts)) return null;

  const solicitud = JSON.stringify([
    "garturlreq",
    [
      ["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1],
      "X",
      "X",
      1,
      [1, 1, 1],
      1,
      1,
      null,
      0,
      0,
      null,
      0,
    ],
    id,
    ts,
    firma,
  ]);
  const r = await pedirTexto(
    "https://news.google.com/_/DotsSplashUi/data/batchexecute",
    Math.min(TIMEOUT_GOOGLE_MS, quedan()),
    {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: `f.req=${encodeURIComponent(JSON.stringify([[["Fbv4je", solicitud]]]))}`,
    }
  );
  return r?.ok ? urlDeRespuestaBatch(r.texto) : null;
}

// URL real del artículo: si es de Google Noticias se traduce; si no, la misma.
// Si no se consigue, devuelve la original (sin romper nada).
async function urlRealDe(url: string, ms: number): Promise<string> {
  const id = idGoogleNoticias(url);
  if (!id) return url;
  const antigua = urlDeIdAntiguo(id);
  if (antigua) return antigua;
  if (!(ms >= 2_000)) return url;
  try {
    return (await urlDeIdNuevo(id, ms)) ?? url;
  } catch {
    return url;
  }
}

// --- Artículo original: texto e imágenes --------------------------------------

type PaginaArticulo = { texto: string; portada: string[]; cuerpo: string[] };
const PAGINA_VACIA: PaginaArticulo = { texto: "", portada: [], cuerpo: [] };

function parrafosDe(html: string): string {
  return (html.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) ?? [])
    .map(textoPlano)
    .filter((p) => p.length > 40)
    .join("\n");
}

async function leerPaginaArticulo(url: string, ms: number): Promise<PaginaArticulo> {
  // Un enlace de Google Noticias sin traducir es una redirección con JavaScript: no sirve.
  if (/(^|\.)news\.google\.com$/i.test(hostDe(url))) return PAGINA_VACIA;
  const r = await pedirTexto(url, Math.min(TIMEOUT_ARTICULO_MS, ms), {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
  });
  if (!r || !r.ok || (r.tipo && !/html|xml/i.test(r.tipo))) return PAGINA_VACIA;
  const html = r.texto;
  const base = r.url || url;

  // Zona principal: el <article> más largo; si no hay, <main> o el cuerpo entero.
  const articulos = html.match(/<article\b[\s\S]*?<\/article>/gi) ?? [];
  let zona = articulos.reduce((a, b) => (b.length > a.length ? b : a), "");
  let esCuerpo = false;
  if (zona.length < 800) zona = html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] ?? "";
  if (zona.length < 800) {
    zona = html.match(/<body\b[\s\S]*<\/body>/i)?.[0] ?? html;
    esCuerpo = true;
  }
  zona = zona.replace(/<(script|style|aside|nav|footer|form|svg|iframe)\b[\s\S]*?<\/\1>/gi, " ");
  if (esCuerpo) zona = zona.replace(/<header\b[\s\S]*?<\/header>/gi, " ");

  let texto = parrafosDe(zona);
  if (texto.length < 400) texto = parrafosDe(html);

  return {
    texto: texto.slice(0, MAX_TEXTO_ARTICULO),
    portada: imagenesDePortada(html, base),
    // Sin <article> ni <main>, del cuerpo solo se cogen las primeras.
    cuerpo: imagenesDeEtiquetas(zona, base, esCuerpo ? 3 : MAX_IMAGENES * 2),
  };
}

// --- IA -----------------------------------------------------------------

const PROMPT_SISTEMA = `Eres el redactor de noticias de VideojuegosZaragoza.com, una tienda de consolas, videojuegos, accesorios y electrónica gaming en Zaragoza (España).
Recibes una noticia (título, fuente, fecha y el texto disponible) y devuelves SOLO un objeto JSON con esta forma exacta:
{"relevante": boolean, "categoria": "Consolas" | "Videojuegos" | "PC gaming" | "Móviles y tablets" | "Accesorios" | "Ofertas" | "Gaming", "titulo": string, "resumen": string, "puntos_clave": string[], "datos": string[], "por_que_importa": string, "afecta_a": string}

Reglas:
- "relevante" es true solo si la noticia trata del mundo de la electrónica gaming: consolas, videojuegos, PC gaming (tarjetas gráficas, procesadores, periféricos), móviles y tablets para jugar, accesorios u ofertas de estos productos. Política, sucesos, deportes o tecnología sin relación con el gaming → false.
- "titulo": en español de España, claro e informativo, sin clickbait, sin mayúsculas exageradas ni emojis. Máximo 120 caracteres.
- "resumen": 3 a 5 frases en español.
- "puntos_clave": 3 a 5 frases cortas.
- "datos": solo cifras, fechas, precios o especificaciones concretas que APAREZCAN LITERALMENTE en el texto recibido. Si no hay, [].
- "por_que_importa": 2 o 3 frases pensando en un jugador o comprador en España.
- "afecta_a": quién o qué se ve afectado, muy breve (p. ej. "Consolas Nintendo", "Jugadores de PC").
- PROHIBIDO inventar datos, precios, fechas, nombres o declaraciones que no estén en el texto. Si el texto es escaso, sé breve y general en vez de rellenar.
- Nunca incluyas URLs ni markdown.`;

function listaDeTextos(valor: unknown, max: number, largo: number): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().slice(0, largo))
    .filter(Boolean)
    .slice(0, max);
}

function textoOpcional(valor: unknown, largo: number): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim().slice(0, largo) : null;
}

async function desglosarConIA(
  openaiKey: string,
  noticia: Candidata,
  textoArticulo: string,
  ms: number
): Promise<Desglose | null> {
  const contenido = [
    `Título: ${noticia.titulo}`,
    `Fuente: ${noticia.fuente}`,
    `Fecha: ${noticia.fecha ? noticia.fecha.toISOString() : "desconocida"}`,
    `Descripción: ${noticia.descripcion || "(sin descripción)"}`,
    textoArticulo ? `Texto del artículo:\n${textoArticulo}` : "Texto del artículo: (no disponible)",
  ].join("\n");

  try {
    const r = await fetchConTimeout("https://api.openai.com/v1/chat/completions", ms, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: PROMPT_SISTEMA },
          { role: "user", content: contenido },
        ],
      }),
    });
    if (!r.ok) {
      const err = await r.text().catch(() => "");
      console.error("Noticias: error de OpenAI:", r.status, err.slice(0, 300));
      return null;
    }
    const data = (await r.json()) as any;
    const json = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");

    const resumen = textoOpcional(json.resumen, 2000);
    const titulo = textoOpcional(json.titulo, 300) ?? noticia.titulo;
    if (!resumen) return null;

    const categoria: Categoria = CATEGORIAS.includes(json.categoria) ? json.categoria : "Gaming";
    return {
      relevante: json.relevante === true,
      categoria,
      titulo,
      resumen,
      puntos_clave: listaDeTextos(json.puntos_clave, 5, 300),
      datos: listaDeTextos(json.datos, 8, 300),
      por_que_importa: textoOpcional(json.por_que_importa, 1500),
      afecta_a: textoOpcional(json.afecta_a, 200),
    };
  } catch (e) {
    console.error("Noticias: fallo al desglosar con IA:", e instanceof Error ? e.message : e);
    return null;
  }
}

// --- Control de frecuencia ----------------------------------------------------

// Reserva un turno (clave 'ultima' o 'relleno'): true si esta ejecución debe
// hacer el trabajo. Con forzar, siempre (cron).
async function reservarTurno(
  supabase: SupabaseClient,
  clave: string,
  intervaloMs: number,
  forzar: boolean
): Promise<boolean> {
  const ahora = new Date().toISOString();

  if (forzar) {
    const { error } = await supabase
      .from("noticias_gaming_control")
      .upsert({ clave, valor: ahora }, { onConflict: "clave" });
    if (error) throw error;
    return true;
  }

  // Actualización condicional: solo una petición a la vez puede "ganar".
  const limite = new Date(Date.now() - intervaloMs).toISOString();
  const { data, error } = await supabase
    .from("noticias_gaming_control")
    .update({ valor: ahora })
    .eq("clave", clave)
    .lt("valor", limite)
    .select("clave");
  if (error) throw error;
  if (data && data.length) return true;

  // ¿No existe aún la fila? Primera vez: se crea (si otra petición se adelanta, falla y no toca).
  const { data: fila, error: errLectura } = await supabase
    .from("noticias_gaming_control")
    .select("clave")
    .eq("clave", clave)
    .maybeSingle();
  if (errLectura) throw errLectura;
  if (fila) return false;

  const { error: errInsert } = await supabase.from("noticias_gaming_control").insert({ clave, valor: ahora });
  return !errInsert;
}

// --- Noticias nuevas ------------------------------------------------------------

type Resultado = { candidatas: number; analizadas: number; nuevas: number };

async function recogerNuevas(
  supabase: SupabaseClient,
  openaiKey: string,
  restante: () => number
): Promise<Resultado> {
  // 1) Recopilar de todas las fuentes en paralelo (las que fallen, se saltan)
  const porFeed = await Promise.all(FEEDS.map(leerFeed));
  const ahora = Date.now();
  const todas = porFeed
    .flat()
    .filter((n) => !n.fecha || ahora - n.fecha.getTime() < MAX_ANTIGUEDAD_MS)
    .sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0));

  // 2) Quitar las que ya están guardadas (por url o por título parecido)
  const { data: existentes } = await supabase
    .from("noticias_gaming")
    .select("url,titulo")
    .order("created_at", { ascending: false })
    .limit(400);
  const urlsVistas = new Set<string>((existentes ?? []).map((r: any) => String(r.url)));
  const titulosVistos: Set<string>[] = (existentes ?? []).map((r: any) => palabrasTitulo(String(r.titulo)));

  // 3) Quitar duplicados entre fuentes y quedarse con las más recientes
  const elegidas: Candidata[] = [];
  for (const n of todas) {
    if (elegidas.length >= MAX_NOTICIAS_POR_EJECUCION) break;
    if (urlsVistas.has(n.url)) continue;
    const palabras = palabrasTitulo(n.titulo);
    if (titulosVistos.some((t) => titulosParecidos(t, palabras))) continue;
    urlsVistas.add(n.url);
    titulosVistos.push(palabras);
    elegidas.push(n);
  }

  // 4) Por cada una: URL real, artículo (texto + fotos) y desglose con IA,
  //    de 3 en 3, sin pasarse del tiempo total
  const filas: Record<string, unknown>[] = [];
  let llamadasIA = 0;
  let siguiente = 0;

  const trabajador = async () => {
    while (siguiente < elegidas.length) {
      if (restante() < 15_000 || llamadasIA >= MAX_NOTICIAS_POR_EJECUCION) return;
      const n = elegidas[siguiente++];
      const urlReal = await urlRealDe(n.url, Math.min(2 * TIMEOUT_GOOGLE_MS, restante() - 14_000));
      const pagina = await leerPaginaArticulo(urlReal, Math.min(TIMEOUT_ARTICULO_MS, restante() - 10_000));
      const ms = Math.min(TIMEOUT_OPENAI_MS, restante() - 2_000);
      if (ms < 5_000) return;
      llamadasIA++;
      const d = await desglosarConIA(openaiKey, n, pagina.texto, ms);
      if (!d || !d.relevante) continue;
      // Portada del artículo primero, luego las del RSS y las del cuerpo.
      const imagenes = unirImagenes(pagina.portada, n.imagenes, pagina.cuerpo);
      filas.push({
        url: n.url,
        fuente: n.fuente.slice(0, 120),
        titulo: d.titulo,
        imagen_url: imagenes[0] ?? null,
        imagenes,
        categoria: d.categoria,
        resumen: d.resumen,
        puntos_clave: d.puntos_clave,
        datos: d.datos,
        por_que_importa: d.por_que_importa,
        afecta_a: d.afecta_a,
        publicada_en: (n.fecha ?? new Date()).toISOString(),
        publicada: true,
      });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador));

  // 5) Guardar (si otra ejecución ya guardó la misma url, se ignora)
  let nuevas = 0;
  if (filas.length) {
    const guardar = (lista: Record<string, unknown>[]) =>
      supabase.from("noticias_gaming").upsert(lista, { onConflict: "url", ignoreDuplicates: true }).select("id");
    let { data, error } = await guardar(filas);
    // Si la columna imagenes aún no existe (migración pendiente), se guarda sin ella.
    if (error && /imagenes/i.test(error.message)) {
      const sinColumna = filas.map((f) => {
        const copia = { ...f };
        delete copia.imagenes;
        return copia;
      });
      ({ data, error } = await guardar(sinColumna));
    }
    if (error) {
      console.error("Noticias: error guardando en Supabase:", error.message);
    } else {
      nuevas = data?.length ?? 0;
    }
  }

  return { candidatas: todas.length, analizadas: llamadasIA, nuevas };
}

// --- Relleno de imágenes de noticias ya guardadas (sin IA) ----------------------

type FilaRelleno = { id: string; url: string; imagen_url: string | null; publicada_en: string | null };

async function rellenarImagenes(supabase: SupabaseClient, fin: number): Promise<number> {
  const quedan = () => fin - Date.now();
  try {
    if (!(await reservarTurno(supabase, "relleno", MINUTOS_ENTRE_RELLENOS * 60_000, false))) return 0;

    // Por dónde va el recorrido (fecha de la última noticia revisada).
    const { data: control } = await supabase
      .from("noticias_gaming_control")
      .select("valor")
      .eq("clave", "relleno_cursor")
      .maybeSingle();
    const cursor: string | null = typeof control?.valor === "string" ? control.valor : null;

    // Con la columna imagenes: las que la tienen vacía. Si aún no existe: las que no tienen imagen_url.
    let conColumna = true;
    const buscar = async (antesDe: string | null): Promise<FilaRelleno[]> => {
      for (let intento = 0; intento < 2; intento++) {
        let q = supabase
          .from("noticias_gaming")
          .select("id,url,imagen_url,publicada_en")
          .not("publicada_en", "is", null)
          .order("publicada_en", { ascending: false })
          .limit(MAX_RELLENO_POR_EJECUCION);
        q = conColumna ? q.eq("imagenes", "[]") : q.is("imagen_url", null);
        if (antesDe) q = q.lt("publicada_en", antesDe);
        const { data, error } = await q;
        if (!error) return (data ?? []) as FilaRelleno[];
        if (!conColumna) throw error;
        conColumna = false;
      }
      return [];
    };

    let filas = await buscar(cursor);
    // Se llegó al final: vuelve a empezar por las más recientes.
    if (!filas.length && cursor) filas = await buscar(null);
    if (!filas.length) return 0;

    let rellenadas = 0;
    let siguiente = 0;
    const trabajador = async () => {
      while (siguiente < filas.length && quedan() > 4_000) {
        const fila = filas[siguiente++];
        const urlReal = await urlRealDe(fila.url, Math.min(2 * TIMEOUT_GOOGLE_MS, quedan() - 3_000));
        const pagina = await leerPaginaArticulo(urlReal, Math.min(TIMEOUT_ARTICULO_MS, quedan() - 500));
        const imagenes = unirImagenes([fila.imagen_url], pagina.portada, pagina.cuerpo);
        if (!imagenes.length) continue;
        const cambios = conColumna ? { imagen_url: imagenes[0], imagenes } : { imagen_url: imagenes[0] };
        const { error } = await supabase.from("noticias_gaming").update(cambios).eq("id", fila.id);
        if (error) console.warn("Noticias: no se pudo guardar el relleno:", error.message);
        else rellenadas++;
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador));

    // La próxima vez sigue por debajo de la última revisada.
    const ultima = siguiente > 0 ? filas[siguiente - 1]?.publicada_en : null;
    if (ultima) {
      await supabase
        .from("noticias_gaming_control")
        .upsert({ clave: "relleno_cursor", valor: ultima }, { onConflict: "clave" });
    }
    return rellenadas;
  } catch (e: any) {
    console.warn("Noticias: relleno de imágenes saltado:", e?.message ?? e);
    return 0;
  }
}

// --- Handler ----------------------------------------------------------------

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Método no permitido." });
    return;
  }

  const inicio = Date.now();
  const restante = () => PRESUPUESTO_TOTAL_MS - (Date.now() - inicio);

  const cronSecret = process.env.CRON_SECRET;
  const auth = typeof req.headers?.authorization === "string" ? req.headers.authorization : "";
  const esCron = !!cronSecret && auth === `Bearer ${cronSecret}`;

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_CLAVE_SERVIDOR;
  const openaiKey = process.env.OPENAI_API_KEY;
  const faltan = [
    !supabaseUrl && "EXPO_PUBLIC_SUPABASE_URL",
    !serviceKey && "SUPABASE_CLAVE_SERVIDOR",
    !openaiKey && "OPENAI_API_KEY",
  ].filter(Boolean);
  if (faltan.length || !supabaseUrl || !serviceKey || !openaiKey) {
    res.status(500).json({
      ok: false,
      error: `Noticias Gaming no está configurado: faltan variables de entorno en Vercel (${faltan.join(", ")}).`,
    });
    return;
  }

  try {
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1) ¿Toca recoger noticias nuevas? (se marca 'ultima' antes de procesar)
    let toca: boolean;
    try {
      toca = await reservarTurno(supabase, "ultima", HORAS_ENTRE_ACTUALIZACIONES * 3_600_000, esCron);
    } catch (e: any) {
      console.error("Noticias: no se pudo leer/marcar el control:", e?.message ?? e);
      res.status(503).json({
        ok: false,
        error: "Las tablas de Noticias Gaming todavía no están disponibles.",
      });
      return;
    }

    const resultado = toca ? await recogerNuevas(supabase, openaiKey, restante) : null;

    // 2) Relleno de imágenes de las ya guardadas (sin IA), si queda tiempo.
    let rellenadas = 0;
    if (restante() > 12_000) {
      const fin = Date.now() + Math.min(PRESUPUESTO_RELLENO_MS, restante() - 2_000);
      rellenadas = await rellenarImagenes(supabase, fin);
    }

    res.status(200).json(
      resultado ? { ok: true, actualizado: true, ...resultado, rellenadas } : { ok: true, actualizado: false, rellenadas }
    );
  } catch (e: any) {
    console.error("Noticias: error inesperado:", e?.message ?? e);
    res.status(500).json({ ok: false, error: "Error inesperado actualizando las noticias." });
  }
}
