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
 * Imágenes (carrusel de la pestaña): hasta 6 por noticia, y SOLO si son de la
 * noticia (más vale sin foto que con una equivocada):
 * 1) Candidatas (máx. 6): og:image / twitter:image del artículo (la portada que
 *    elige el medio), las del propio RSS (media:content, enclosure, <img> de la
 *    descripción) y las <img> que están DENTRO del cuerpo del artículo (el
 *    <article> con más texto o, si no hay, el bloque con más párrafos). Se
 *    descartan las de <aside>, <nav>, <footer>, <header>, bloques de
 *    «relacionadas», «te puede interesar», «más noticias», «lo más leído»,
 *    carruseles, redes sociales, publicidad y las que van dentro de un enlace
 *    a otra página (otra noticia). Sin logos, iconos, avatares, píxeles ni svg.
 * 2) Se descargan (las que no cargan, son diminutas o no son jpg/png/webp se
 *    descartan) y se hace UNA llamada a gpt-4o-mini con visión (detail «low»)
 *    con el título, el resumen y las candidatas: solo se guardan las que
 *    muestran claramente el tema de la noticia. Si la llamada falla o la
 *    respuesta no es válida, no se guarda ninguna foto.
 * 3) Las buenas se copian al bucket público «noticias» de Supabase Storage
 *    (ruta <id de la noticia>/<n>.<jpg|png|webp>, caché de 1 año) para
 *    servirlas desde nuestro CDN y no desde la web del periódico. Se guarda
 *    imagenes (URLs públicas del bucket), imagen_url (la primera o null),
 *    imagenes_meta ([{url, w, h}], medidas leídas de la cabecera del archivo,
 *    para que la app reserve el hueco sin descargarla antes) e
 *    imagenes_verificadas = true. La app solo enseña fotos verificadas. Si una
 *    subida falla, esa foto se queda con su URL original (nunca se pierde) e
 *    imagenes_meta se deja vacío: la revisión periódica lo reintenta.
 * Los enlaces de Google Noticias se traducen a la URL real del medio (id en
 * base64 o, en el formato nuevo, la petición batchexecute de Google) y esa URL
 * también se usa para leer el texto del artículo.
 *
 * Cuándo actualiza:
 * - Cron diario de Vercel (vercel.json → "crons"), con la cabecera
 *   Authorization: Bearer ${CRON_SECRET}: siempre.
 * - Visitas a la pestaña "Noticias Gaming": solo si la última actualización
 *   (noticias_gaming_control, clave 'ultima') tiene más de 3 horas. Si no,
 *   no recoge noticias nuevas. La marca 'ultima' se reserva ANTES de procesar
 *   para que dos visitas a la vez no dupliquen el trabajo (ni el gasto de IA).
 * - Revisión de fotos: en cada ejecución, como mucho cada 10 minutos (clave
 *   'relleno'), revisa hasta 6 noticias guardadas con imagenes_verificadas =
 *   false: vuelve a buscar candidatas con las reglas de arriba y las pasa por
 *   la comprobación con IA. La clave 'revision_cursor' recuerda por qué fecha
 *   va, para recorrerlas todas poco a poco.
 *   En esa misma revisión (sin IA) se copian al bucket las fotos de hasta 8
 *   noticias ya verificadas que aún no tienen imagenes_meta (las de antes del
 *   bucket o las que no se pudieron subir); la clave 'bucket_cursor' recuerda
 *   por dónde va.
 * - Límites por ejecución: 8 resúmenes + 6 comprobaciones de fotos (14
 *   llamadas a OpenAI como mucho) y menos de 55 s en total.
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
 * - supabase/migrations/20261013210000_noticias_imagenes_verificadas.sql →
 *   columna imagenes_verificadas (si todavía no existe, se guarda sin ella, no
 *   hay revisión y la app no enseña fotos).
 * - supabase/migrations/20261013220000_noticias_imagenes_rapidas.sql → bucket
 *   «noticias» y columna imagenes_meta (si todavía no existe, se guarda sin
 *   ella y no se copian fotos antiguas).
 * - vercel.json → "images": la app pide en web la versión optimizada
 *   (/_vercel/image) de las fotos del bucket.
 * - app/(tabs)/chat-global.tsx → pestaña "Noticias Gaming" (lee la tabla y
 *   llama aquí en segundo plano al abrirse).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Vercel: margen máximo de ejecución (válido en plan Hobby).
export const config = { maxDuration: 60 };

const HORAS_ENTRE_ACTUALIZACIONES = 3;
const MINUTOS_ENTRE_REVISIONES = 10;
// Llamadas a OpenAI por ejecución: 8 resúmenes + 6 comprobaciones de fotos = 14 como mucho.
const MAX_RESUMENES_IA = 8;
const MAX_COMPROBACIONES_IA = 6;
const MAX_REVISION_POR_EJECUCION = 6;
const MAX_IMAGENES = 6;
const CONCURRENCIA = 4;
const CONCURRENCIA_REVISION = 3;
// Tiempo de trabajo (Vercel corta a los 60 s): todo termina antes de 55 s.
const PRESUPUESTO_TOTAL_MS = 50_000;
const PRESUPUESTO_REVISION_MS = 30_000;
const TIMEOUT_FEED_MS = 6_000;
const TIMEOUT_ARTICULO_MS = 6_000;
const TIMEOUT_GOOGLE_MS = 5_000;
const TIMEOUT_OPENAI_MS = 22_000;
const TIMEOUT_VISION_MS = 15_000;
const TIMEOUT_IMAGEN_MS = 5_000;
const MAX_TEXTO_ARTICULO = 6_000;
const MAX_HTML = 1_500_000;
const MAX_ANTIGUEDAD_MS = 4 * 24 * 3600 * 1000;
// Fotos para la IA: las de más de 1,5 MB se le pasan por URL en vez de descargadas.
const MAX_BYTES_IMAGEN = 1_500_000;
const MIN_BYTES_IMAGEN = 3_000;
const MIN_ANCHO_IMAGEN = 300;
const MIN_ALTO_IMAGEN = 150;
// Copia de las fotos en nuestro Storage (bucket público, máx. 5 MB por foto).
const BUCKET_NOTICIAS = "noticias";
const MAX_BYTES_BUCKET = 5 * 1024 * 1024;
const MAX_BUCKET_POR_EJECUCION = 8;
const CONCURRENCIA_BUCKET = 2;
const TIMEOUT_SUBIDA_MS = 8_000;
const TIMEOUT_DESCARGA_BUCKET_MS = 8_000;
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

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

// URL de una etiqueta <img>/<source> ya leída (también las de carga diferida:
// data-src, data-srcset…), o null si es pequeña, un logo, un avatar…
function urlDeEtiquetaImagen(a: Record<string, string>, base: string): string | null {
  if (a.type && !/^image\//i.test(a.type)) return null;
  if (esPequena(a.width, a.height)) return null;
  if (CLASE_DESCARTADA.test(`${a.class ?? ""} ${a.id ?? ""}`)) return null;
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
    if (url) return url;
  }
  return null;
}

// <img> y <source> de un trozo de HTML (la descripción del RSS).
function imagenesDeEtiquetas(html: string, base: string, max: number): string[] {
  const salida: string[] = [];
  for (const tag of html.match(/<(?:img|source)\b[^>]*>/gi) ?? []) {
    if (salida.length >= max) break;
    const url = urlDeEtiquetaImagen(atributosDe(tag), base);
    if (url) salida.push(url);
  }
  return salida;
}

// og:image y twitter:image de la cabecera: la portada que elige el propio medio.
function imagenesDePortada(html: string, base: string): string[] {
  const cabecera = html.match(/<head\b[\s\S]*?<\/head>/i)?.[0] ?? html.slice(0, 200_000);
  const salida: string[] = [];
  for (const tag of cabecera.match(/<meta\b[^>]*>/gi) ?? []) {
    const a = atributosDe(tag);
    const clave = (a.property || a.name || "").toLowerCase();
    if (!/^(?:og:image(?::url|:secure_url)?|twitter:image(?::src)?)$/.test(clave)) continue;
    const url = a.content ? urlImagenLimpia(a.content, base) : null;
    if (url) salida.push(url);
  }
  return salida;
}

// --- Cuerpo del artículo: árbol mínimo de etiquetas ---------------------------

type Nodo = {
  tag: string;
  crudo: string; // atributos sin leer (se leen solo si hacen falta)
  inicio: number; // posición de «<» de la etiqueta de apertura
  finApertura: number; // justo después de su «>»
  fin: number; // justo después de su cierre (o donde se cierra su padre)
  padre: number; // índice del padre en la lista, -1 si no tiene
};

const ETIQUETAS_VACIAS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

// Lista de elementos en orden de aparición (los padres siempre antes que sus hijos).
// Tolera HTML mal cerrado: un cierre sin apertura se ignora; uno que salta
// elementos abiertos los cierra también.
function analizarHtml(html: string): Nodo[] {
  const nodos: Nodo[] = [];
  const abiertos: number[] = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[2].toLowerCase();
    if (m[1]) {
      for (let k = abiertos.length - 1; k >= 0; k--) {
        if (nodos[abiertos[k]].tag !== tag) continue;
        for (let j = abiertos.length - 1; j > k; j--) nodos[abiertos[j]].fin = m.index;
        nodos[abiertos[k]].fin = re.lastIndex;
        abiertos.length = k;
        break;
      }
      continue;
    }
    nodos.push({
      tag,
      crudo: m[3],
      inicio: m.index,
      finApertura: re.lastIndex,
      fin: html.length,
      padre: abiertos.length ? abiertos[abiertos.length - 1] : -1,
    });
    if (!ETIQUETAS_VACIAS.has(tag) && !m[3].trim().endsWith("/")) abiertos.push(nodos.length - 1);
  }
  return nodos;
}

function textoDeNodo(html: string, n: Nodo, max: number): string {
  return textoPlano(html.slice(n.finApertura, Math.min(n.fin, n.finApertura + max)));
}

function sinTildes(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Elementos que nunca son el cuerpo de la noticia.
const ETIQUETAS_AJENAS = new Set([
  "aside",
  "nav",
  "footer",
  "header",
  "form",
  "button",
  "dialog",
  "menu",
  "select",
  "iframe",
  "object",
  "video",
  "audio",
  "canvas",
  "map",
  "source",
]);
// Clases, ids, roles… de bloques que no son la noticia: relacionadas, lo más
// leído, carruseles, barras laterales, redes sociales, publicidad, autor…
const BLOQUE_AJENO = new RegExp(
  [
    "related",
    "relacionad",
    "recomend",
    "recommend",
    "interesa",
    "leid[oa]s?",
    "most-?read",
    "most-?viewed",
    "mas-?vist",
    "popular",
    "trending",
    "tendencia",
    "sidebar",
    "lateral",
    "widget",
    "newsletter",
    "suscri",
    "subscri",
    "outbrain",
    "taboola",
    "carousel",
    "carrusel",
    "slider",
    "swiper",
    "slick",
    "splide",
    "breadcrumb",
    "comment",
    "comentario",
    "yarpp",
    "tambien",
    "also-?read",
    "read-?more",
    "leer-?mas",
    "ver-?mas",
    "more-?(?:news|stories|articles|posts)",
    "mas-?noticias",
    "otras-?noticias",
    "ultimas",
    "ultima-?hora",
    "next-?(?:post|article)",
    "prev(?:ious)?-?(?:post|article)",
    "post-?nav",
    "pagination",
    "paginacion",
    "social",
    "share",
    "compartir",
    "tweet",
    "twitter",
    "instagram",
    "tiktok",
    "facebook",
    "author",
    "autor",
    "byline",
    "advert",
    "publicidad",
    "anuncio",
    "sponsor",
    "patrocin",
    "promo",
    "teaser",
    "banner",
    "footer",
    "header",
    "masthead",
    "cookie",
    "modal",
    "popup",
    "menu",
    "navigation",
    "navegacion",
    "complementary",
    "contentinfo",
    "playlist",
    "listado",
    "listing",
    "feed",
  ].join("|") + "|(?:^|[\\s_-])(?:ad|ads|nav|tags?|etiquetas|cards?|aside|list|more)(?=$|[\\s_-])"
);
// Títulos de secciones que no son la noticia («Te puede interesar», «Lo más leído»…).
const TITULO_AJENO =
  /^[^a-z0-9]*(?:tambien )?(?:te puede interesar|puede interesarte|te interesa|quiza te interese|te recomendamos|recomendad[oa]s|noticias relacionadas|articulos relacionados|contenido relacionado|relacionad[oa]s|mas noticias|otras noticias|ultimas noticias|lo mas leido|mas leid[oa]s|lo mas visto|mas vist[oa]s|tendencias|lo ultimo|sigue leyendo|lee tambien|leer tambien|ver tambien|no te pierdas|mas sobre|related|more news|read more|you may also like|most read|trending)\b/;
const TITULOS_POSIBLES = new Set(["h2", "h3", "h4", "h5", "h6", "p", "div", "span", "strong", "b", "section"]);

// Señas de un elemento (clase, id, rol…) sin tildes y en minúsculas.
function senasDe(a: Record<string, string>): string {
  return sinTildes(
    [
      a.class,
      a.id,
      a.role,
      a["aria-label"],
      a.itemtype,
      a["data-component"],
      a["data-module"],
      a["data-section"],
      a["data-type"],
      a["data-testid"],
      a["data-block"],
      a["data-name"],
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function rutaDe(url: URL): string {
  return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}`;
}

// Enlace que lleva a otra página (otra noticia, otra sección, otra web):
// lo que va dentro no es de esta noticia. Sí valen anclas, la misma página o
// el enlace a la propia foto en grande.
function llevaAOtraPagina(href: string | undefined, base: string): boolean {
  const destino = (href ?? "").trim();
  if (!destino || destino.startsWith("#") || /^(?:javascript|mailto|tel):/i.test(destino)) return false;
  try {
    const u = new URL(destino, base);
    if (!/^https?:$/.test(u.protocol)) return false;
    if (/\.(?:jpe?g|png|webp|avif|gif)$/i.test(u.pathname)) return false;
    return rutaDe(u) !== rutaDe(new URL(base));
  } catch {
    return false;
  }
}

type CuerpoArticulo = { texto: string; imagenes: string[] };

// Cuerpo de la noticia: el <article> con más texto en párrafos o, si no hay,
// el bloque con más párrafos. De él salen el texto (para la IA) y las fotos
// que están DENTRO, sin las de bloques ajenos ni las enlazadas a otra página.
function cuerpoDelArticulo(htmlOriginal: string, base: string): CuerpoArticulo | null {
  const html = htmlOriginal
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|template|svg)\b[\s\S]*?<\/\1>/gi, " ");
  const nodos = analizarHtml(html);

  // Texto en párrafos: total dentro de cada <article> y puntos por bloque
  // (el padre de cada párrafo suma su largo y el abuelo, la mitad).
  const enArticulo = new Map<number, number>();
  const puntos = new Map<number, number>();
  for (const n of nodos) {
    if (n.tag !== "p") continue;
    const largo = textoDeNodo(html, n, 20_000).length;
    if (largo <= 40 || n.padre < 0) continue;
    puntos.set(n.padre, (puntos.get(n.padre) ?? 0) + largo);
    const abuelo = nodos[n.padre].padre;
    if (abuelo >= 0) puntos.set(abuelo, (puntos.get(abuelo) ?? 0) + largo / 2);
    for (let a = n.padre; a >= 0; a = nodos[a].padre) {
      if (nodos[a].tag === "article") enArticulo.set(a, (enArticulo.get(a) ?? 0) + largo);
    }
  }

  const tamano = (i: number) => nodos[i].fin - nodos[i].inicio;
  let zona = -1;
  let mejor = 0;
  for (const [i, t] of enArticulo) {
    if (t > mejor || (t === mejor && zona >= 0 && tamano(i) < tamano(zona))) {
      zona = i;
      mejor = t;
    }
  }
  if (mejor < 300) {
    zona = -1;
    mejor = 0;
    for (const [i, p] of puntos) {
      if (p > mejor && !["body", "html"].includes(nodos[i].tag)) {
        zona = i;
        mejor = p;
      }
    }
    if (mejor < 200) return null;
  }

  const z = nodos[zona];
  const textoZona = enArticulo.get(zona) ?? 0;
  const fuera = new Uint8Array(nodos.length);
  const cortes: [number, number][] = [];
  const imagenes: string[] = [];

  for (let i = zona + 1; i < nodos.length; i++) {
    const n = nodos[i];
    if (n.inicio >= z.fin) break;
    if (fuera[n.padre] || cortes.some(([desde, hasta]) => n.inicio >= desde && n.inicio < hasta)) {
      fuera[i] = 1;
      continue;
    }
    const a = atributosDe(n.crudo);
    if (
      ETIQUETAS_AJENAS.has(n.tag) ||
      BLOQUE_AJENO.test(senasDe(a)) ||
      (n.tag === "a" && llevaAOtraPagina(a.href, base)) ||
      // Otro <article> dentro: tarjeta de otra noticia.
      (n.tag === "article" && (enArticulo.get(i) ?? 0) < textoZona / 2)
    ) {
      fuera[i] = 1;
      continue;
    }
    if (n.tag === "img") {
      const url = urlDeEtiquetaImagen(a, base);
      if (url && imagenes.length < MAX_IMAGENES * 2) imagenes.push(url);
      continue;
    }
    // Título de una sección ajena: fuera desde él hasta el final de su sección
    // (subiendo por los envoltorios que solo contienen ese título).
    if (TITULOS_POSIBLES.has(n.tag) && n.fin - n.finApertura < 2_000) {
      const titulo = sinTildes(textoDeNodo(html, n, 2_000));
      if (titulo.length >= 4 && titulo.length <= 80 && TITULO_AJENO.test(titulo)) {
        let envoltorio = i;
        while (nodos[envoltorio].padre > zona) {
          const padre = nodos[nodos[envoltorio].padre];
          if (padre.fin - padre.finApertura > 3_000 || textoDeNodo(html, padre, 3_000).length > 120) break;
          envoltorio = nodos[envoltorio].padre;
        }
        const seccion = nodos[envoltorio].padre;
        cortes.push([n.inicio, seccion >= 0 ? nodos[seccion].fin : z.fin]);
        fuera[i] = 1;
      }
    }
  }

  const zonaHtml = html
    .slice(z.inicio, z.fin)
    .replace(/<(aside|nav|footer|form|iframe)\b[\s\S]*?<\/\1>/gi, " ");
  return { texto: parrafosDe(zonaHtml), imagenes };
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

// leida: se pudo descargar la página (si no, no se sabe qué fotos tiene).
type PaginaArticulo = { leida: boolean; texto: string; portada: string[]; cuerpo: string[] };
const PAGINA_VACIA: PaginaArticulo = { leida: false, texto: "", portada: [], cuerpo: [] };

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

  let cuerpo: CuerpoArticulo | null = null;
  try {
    cuerpo = cuerpoDelArticulo(html, base);
  } catch (e) {
    console.warn("Noticias: no se pudo analizar el artículo:", e instanceof Error ? e.message : e);
  }
  let texto = cuerpo?.texto ?? "";
  if (texto.length < 400) texto = parrafosDe(html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " "));

  return {
    leida: true,
    texto: texto.slice(0, MAX_TEXTO_ARTICULO),
    portada: imagenesDePortada(html, base),
    // Sin cuerpo claro de la noticia, solo vale la portada (og:image).
    cuerpo: cuerpo?.imagenes ?? [],
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
    const r = await fetchConTimeout(OPENAI_URL, ms, {
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

// --- Comprobación de fotos con IA (visión) --------------------------------------

// Cupo de llamadas a OpenAI de esta ejecución (compartido por todo el proceso).
type CupoIA = { resumenes: number; comprobaciones: number };

type TipoImagen = "image/jpeg" | "image/png" | "image/webp";
const EXTENSION_DE_TIPO: Record<TipoImagen, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// Foto descargada. archivo: los bytes completos (null si pasa de 5 MB o no
// terminó de bajar a tiempo); grande: pasa de 5 MB (no cabe en el bucket);
// medidas: ancho y alto de la cabecera (null si no se encuentran).
type FotoDescargada = {
  tipo: TipoImagen;
  archivo: Uint8Array | null;
  grande: boolean;
  medidas: { ancho: number; alto: number } | null;
};

// url: la de la foto (la que se guarda); dato: lo que se manda a la IA
// (la foto descargada en base64 o, si pesa mucho, la propia URL); foto: la
// descarga, para copiarla al bucket si la IA la da por buena.
type ImagenParaIA = { url: string; dato: string; foto: FotoDescargada };

function textoAscii(b: Uint8Array, desde: number, hasta: number): string {
  return String.fromCharCode(...b.subarray(desde, hasta));
}

// Tipo real por los primeros bytes (la IA acepta jpeg, png y webp; gif, avif o
// svg se descartan).
function tipoDeImagen(b: Uint8Array): TipoImagen | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 24 && b[0] === 0x89 && textoAscii(b, 1, 4) === "PNG") return "image/png";
  if (b.length > 30 && textoAscii(b, 0, 4) === "RIFF" && textoAscii(b, 8, 12) === "WEBP") return "image/webp";
  return null;
}

// Ancho y alto leídos de la cabecera del archivo (null si no se encuentran).
function medidasDeImagen(b: Uint8Array, tipo: string): { ancho: number; alto: number } | null {
  if (tipo === "image/png") {
    return {
      ancho: ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0,
      alto: ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0,
    };
  }
  if (tipo === "image/webp") {
    const trozo = textoAscii(b, 12, 16);
    if (trozo === "VP8X") {
      return { ancho: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), alto: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    }
    if (trozo === "VP8L") {
      return {
        ancho: 1 + (((b[22] & 0x3f) << 8) | b[21]),
        alto: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)),
      };
    }
    if (trozo === "VP8 ") return { ancho: (b[26] | (b[27] << 8)) & 0x3fff, alto: (b[28] | (b[29] << 8)) & 0x3fff };
    return null;
  }
  // JPEG: se recorren los segmentos hasta el marcador SOF, que lleva las medidas.
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marca = b[i + 1];
    if (marca === 0xff) {
      i++;
      continue;
    }
    if (marca === 0xd8 || marca === 0x01 || (marca >= 0xd0 && marca <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc) {
      return { alto: (b[i + 5] << 8) | b[i + 6], ancho: (b[i + 7] << 8) | b[i + 8] };
    }
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return null;
}

function aBase64(b: Uint8Array): string {
  let binario = "";
  for (let i = 0; i < b.length; i += 0x8000) binario += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(binario);
}

// Descarga una foto como la vería un visitante de la tienda (hasta 5 MB, lo
// que cabe en el bucket). null si no carga, no es jpg/png/webp o es diminuta.
// Si el tiempo se acaba a medias y ya llevaba más de 1,5 MB, vale igual (sin
// archivo: la IA la descarga ella misma), como cuando solo se bajaba 1,5 MB.
async function descargarFoto(url: string, ms: number): Promise<FotoDescargada | null> {
  if (!(ms >= 500)) return null;
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), ms);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: control.signal,
      headers: {
        "User-Agent": UA,
        Accept: "image/webp,image/jpeg,image/png;q=0.9,*/*;q=0.5",
        Referer: "https://videojuegoszaragoza.com/",
      },
    });
    if (!r.ok || !r.body) return null;
    const lector = r.body.getReader();
    const trozos: Uint8Array[] = [];
    let total = 0;
    let completa = true;
    let grande = false;
    try {
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        trozos.push(value);
        total += value.length;
        if (total > MAX_BYTES_BUCKET) {
          completa = false;
          grande = true;
          lector.cancel().catch(() => {});
          break;
        }
      }
    } catch {
      // Cortada por tiempo: solo vale si ya pasaba de 1,5 MB.
      if (total <= MAX_BYTES_IMAGEN) return null;
      completa = false;
    }
    const bytes = new Uint8Array(total);
    let pos = 0;
    for (const trozo of trozos) {
      bytes.set(trozo, pos);
      pos += trozo.length;
    }
    if (completa && bytes.length < MIN_BYTES_IMAGEN) return null;
    const tipo = tipoDeImagen(bytes);
    if (!tipo) return null;
    const medidas = medidasDeImagen(bytes, tipo);
    if (medidas && (medidas.ancho < MIN_ANCHO_IMAGEN || medidas.alto < MIN_ALTO_IMAGEN)) return null;
    const conMedidas = medidas && medidas.ancho > 0 && medidas.alto > 0 ? medidas : null;
    return { tipo, archivo: completa ? bytes : null, grande, medidas: conMedidas };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Descarga una foto candidata y prepara lo que se manda a la IA, o null si no vale.
async function imagenParaIA(url: string, ms: number): Promise<ImagenParaIA | null> {
  const foto = await descargarFoto(url, ms);
  if (!foto) return null;
  // Muy pesada (más de 1,5 MB): la IA la descarga ella misma (ya se ha visto que carga).
  const dato =
    foto.archivo && foto.archivo.length <= MAX_BYTES_IMAGEN
      ? `data:${foto.tipo};base64,${aBase64(foto.archivo)}`
      : url;
  return { url, dato, foto };
}

// Prepara las candidatas en paralelo (en su orden). null si no hay tiempo.
async function prepararImagenes(urls: string[], ms: number): Promise<ImagenParaIA[] | null> {
  if (!urls.length) return [];
  if (!(ms >= 2_500)) return null;
  const datos = await Promise.all(urls.map((u) => imagenParaIA(u, ms)));
  return datos.filter((d): d is ImagenParaIA => d !== null);
}

const PROMPT_IMAGENES = `Revisas las fotos de una noticia de VideojuegosZaragoza.com antes de publicarla.
Recibes el título y el resumen de la noticia y varias imágenes numeradas (Imagen 1, Imagen 2…). Devuelve SOLO un objeto JSON con esta forma exacta:
{"relevantes": number[]}
con los números de las imágenes que muestran CLARAMENTE el tema de ESTA noticia: el juego, la consola, el producto, la persona o el evento de los que habla; carátulas, capturas o arte oficial del juego, y logotipos del juego o de la marca de la noticia.

Descarta:
- Fotos genéricas o de archivo sin relación clara con la noticia.
- Imágenes que parecen de otra noticia (otro juego, otro producto, otro tema).
- Personas o lugares que no aparecen en la noticia.
- Anuncios, banners, logotipos o portadas del propio medio, iconos y gráficos sin relación.
Si varias imágenes son la misma foto (aunque cambie el tamaño o el recorte), incluye solo la primera.
Ante la duda, descártala. Si ninguna vale, devuelve {"relevantes": []}.`;

// Una llamada a gpt-4o-mini con visión. Devuelve las fotos que muestran el
// tema de la noticia (puede ser []), o null si la llamada falla o la respuesta
// no es válida (entonces no se guarda ninguna foto).
async function comprobarImagenesConIA(
  openaiKey: string,
  titulo: string,
  resumen: string,
  imagenes: ImagenParaIA[],
  ms: number
): Promise<ImagenParaIA[] | null> {
  const contenido: unknown[] = [
    { type: "text", text: `Título: ${titulo}\nResumen: ${resumen}\nNúmero de imágenes: ${imagenes.length}` },
  ];
  imagenes.forEach((img, i) => {
    contenido.push({ type: "text", text: `Imagen ${i + 1}:` });
    contenido.push({ type: "image_url", image_url: { url: img.dato, detail: "low" } });
  });

  try {
    const r = await fetchConTimeout(OPENAI_URL, ms, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 120,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: PROMPT_IMAGENES },
          { role: "user", content: contenido },
        ],
      }),
    });
    if (!r.ok) {
      const err = await r.text().catch(() => "");
      console.error("Noticias: error de OpenAI comprobando fotos:", r.status, err.slice(0, 300));
      return null;
    }
    const data = (await r.json()) as any;
    const json: unknown = JSON.parse(data?.choices?.[0]?.message?.content ?? "");
    const lista = json && typeof json === "object" ? (json as { relevantes?: unknown }).relevantes : undefined;
    if (!Array.isArray(lista)) return null;
    const elegidas = new Set<number>();
    for (const v of lista) {
      const n = typeof v === "number" ? v : typeof v === "string" && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN;
      if (!Number.isInteger(n) || n < 1 || n > imagenes.length) return null;
      elegidas.add(n - 1);
    }
    return imagenes.filter((_, i) => elegidas.has(i));
  } catch (e) {
    console.error("Noticias: fallo al comprobar fotos con IA:", e instanceof Error ? e.message : e);
    return null;
  }
}

// Fotos comprobadas de una noticia: [] si no hay ninguna que comprobar, las
// buenas si la IA responde bien, o null si no se pudo comprobar (sin tiempo,
// sin cupo de llamadas o fallo de la IA).
async function fotosComprobadas(
  openaiKey: string,
  cupo: CupoIA,
  titulo: string,
  resumen: string,
  listas: ImagenParaIA[] | null,
  ms: number
): Promise<ImagenParaIA[] | null> {
  if (!listas) return null;
  if (!listas.length) return [];
  if (ms < 4_000 || cupo.comprobaciones >= MAX_COMPROBACIONES_IA) return null;
  cupo.comprobaciones++;
  return comprobarImagenesConIA(openaiKey, titulo, resumen, listas, ms);
}

// --- Copia de las fotos en nuestro Storage (bucket «noticias») -----------------

type MetaFoto = { url: string; w: number; h: number };
// imagenes: URLs finales (del bucket o, si no se pudo subir, la original);
// meta: [{url, w, h}] en el mismo orden (w/h = 0 si no se conocen);
// completas: todas están en el bucket (o pesan más de 5 MB y no caben). Si no,
// imagenes_meta se guarda vacío y la revisión periódica lo reintenta.
type FotosGuardadas = { imagenes: string[]; meta: MetaFoto[]; completas: boolean };

const SIN_FOTOS: FotosGuardadas = { imagenes: [], meta: [], completas: true };

// Id nuevo para una noticia (hace falta antes de guardarla: es la carpeta de sus fotos).
function nuevoId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const b = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Espera una promesa como mucho «ms» (null si no llega a tiempo).
async function conLimiteDeTiempo<T>(promesa: PromiseLike<T>, ms: number): Promise<T | null> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promesa),
      new Promise<null>((resolver) => {
        t = setTimeout(() => resolver(null), ms);
      }),
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}

// Sube una foto al bucket y devuelve su URL pública, o null si falla.
async function subirFoto(supabase: SupabaseClient, ruta: string, foto: FotoDescargada, ms: number): Promise<string | null> {
  if (!foto.archivo || !(ms >= 1_000)) return null;
  try {
    const subida = supabase.storage.from(BUCKET_NOTICIAS).upload(ruta, foto.archivo, {
      contentType: foto.tipo,
      cacheControl: "31536000",
      upsert: true,
    });
    const r = await conLimiteDeTiempo(subida, ms);
    if (!r || r.error) {
      console.warn("Noticias: no se pudo subir la foto al bucket:", ruta, r ? r.error?.message : "sin tiempo");
      return null;
    }
    return supabase.storage.from(BUCKET_NOTICIAS).getPublicUrl(ruta).data.publicUrl;
  } catch (e) {
    console.warn("Noticias: fallo subiendo la foto al bucket:", ruta, e instanceof Error ? e.message : e);
    return null;
  }
}

// Copia al bucket las fotos (ya comprobadas) de una noticia, en paralelo, en
// la ruta <id>/<n>.<ext>. Las que ya están en el bucket solo aportan medidas;
// foto = null (no se pudo descargar ahora) o de más de 5 MB: se queda la URL
// original (nunca se pierde una foto).
async function guardarFotosEnBucket(
  supabase: SupabaseClient,
  prefijoBucket: string,
  noticiaId: string,
  fotos: { url: string; foto: FotoDescargada | null }[],
  ms: number
): Promise<FotosGuardadas> {
  if (!fotos.length) return SIN_FOTOS;
  const fin = Date.now() + ms;
  const resultado = await Promise.all(
    fotos.map(async ({ url, foto }, i) => {
      if (url.startsWith(prefijoBucket) || !foto || foto.grande) return { url, foto, ok: true };
      const subida = await subirFoto(supabase, `${noticiaId}/${i}.${EXTENSION_DE_TIPO[foto.tipo]}`, foto, fin - Date.now());
      return { url: subida ?? url, foto, ok: subida !== null };
    })
  );
  return {
    imagenes: resultado.map((r) => r.url),
    meta: resultado.map((r) => ({ url: r.url, w: r.foto?.medidas?.ancho ?? 0, h: r.foto?.medidas?.alto ?? 0 })),
    completas: resultado.every((r) => r.ok),
  };
}

// --- Columnas que quizá aún no existen (migraciones pendientes) -----------------

const COLUMNAS_OPCIONALES = ["imagenes_verificadas", "imagenes", "imagenes_meta"] as const;
// Se vacía al empezar cada ejecución (por si la migración se aplica entre medias).
const columnasQueFaltan = new Set<string>();

function sinColumnasQueFaltan(fila: Record<string, unknown>): Record<string, unknown> {
  const copia = { ...fila };
  for (const c of columnasQueFaltan) delete copia[c];
  return copia;
}

// Si el error dice que falta una de esas columnas, la apunta y devuelve true.
function apuntarColumnaQueFalta(error: { message?: string } | null): boolean {
  const mensaje = error?.message ?? "";
  for (const c of COLUMNAS_OPCIONALES) {
    if (!columnasQueFaltan.has(c) && new RegExp(`\\b${c}\\b`).test(mensaje)) {
      columnasQueFaltan.add(c);
      return true;
    }
  }
  return false;
}

// Repite una escritura quitando las columnas que aún no existen.
async function conColumnasOpcionales<R extends { error: { message: string } | null }>(
  escribir: (limpiar: (fila: Record<string, unknown>) => Record<string, unknown>) => PromiseLike<R>
): Promise<R> {
  let r = await escribir(sinColumnasQueFaltan);
  for (let i = 0; i < COLUMNAS_OPCIONALES.length && r.error && apuntarColumnaQueFalta(r.error); i++) {
    r = await escribir(sinColumnasQueFaltan);
  }
  return r;
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
  cupo: CupoIA,
  prefijoBucket: string,
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
    if (elegidas.length >= MAX_RESUMENES_IA) break;
    if (urlsVistas.has(n.url)) continue;
    const palabras = palabrasTitulo(n.titulo);
    if (titulosVistos.some((t) => titulosParecidos(t, palabras))) continue;
    urlsVistas.add(n.url);
    titulosVistos.push(palabras);
    elegidas.push(n);
  }

  // 4) Por cada una: URL real, artículo (texto + fotos), desglose con IA y
  //    comprobación de las fotos con IA, de 4 en 4, sin pasarse del tiempo total
  const filas: Record<string, unknown>[] = [];
  const resumenesAntes = cupo.resumenes;
  let siguiente = 0;

  const trabajador = async () => {
    while (siguiente < elegidas.length) {
      if (restante() < 15_000 || cupo.resumenes >= MAX_RESUMENES_IA) return;
      const n = elegidas[siguiente++];
      const urlReal = await urlRealDe(n.url, Math.min(2 * TIMEOUT_GOOGLE_MS, restante() - 14_000));
      const pagina = await leerPaginaArticulo(urlReal, Math.min(TIMEOUT_ARTICULO_MS, restante() - 10_000));
      const ms = Math.min(TIMEOUT_OPENAI_MS, restante() - 4_000);
      if (ms < 5_000) return;
      cupo.resumenes++;
      // Candidatas: portada del artículo, las del RSS y las del cuerpo (máx. 6).
      // Se descargan mientras la IA hace el resumen.
      const candidatas = unirImagenes(pagina.portada, n.imagenes, pagina.cuerpo);
      const descargas = prepararImagenes(candidatas, Math.min(TIMEOUT_IMAGEN_MS, restante() - 8_000));
      const d = await desglosarConIA(openaiKey, n, pagina.texto, ms);
      const listas = await descargas;
      if (!d || !d.relevante) continue;
      const fotos = await fotosComprobadas(
        openaiKey,
        cupo,
        d.titulo,
        d.resumen,
        listas,
        Math.min(TIMEOUT_VISION_MS, restante() - 1_500)
      );
      // Sin comprobar (fallo, sin cupo o sin tiempo) se guarda sin fotos y la
      // revisión lo vuelve a intentar. Si no se pudo leer la página y el RSS no
      // traía fotos, también queda pendiente.
      const verificadas = fotos !== null && (pagina.leida || candidatas.length > 0);
      // Las buenas se copian al bucket (ya están descargadas). Sin tiempo, se
      // guardan con su URL original y la revisión periódica las copia después.
      const id = nuevoId();
      const guardadas = fotos?.length
        ? await guardarFotosEnBucket(
            supabase,
            prefijoBucket,
            id,
            fotos.map((f) => ({ url: f.url, foto: f.foto })),
            Math.min(TIMEOUT_SUBIDA_MS, restante() - 3_000)
          )
        : SIN_FOTOS;
      filas.push({
        id,
        url: n.url,
        fuente: n.fuente.slice(0, 120),
        titulo: d.titulo,
        imagen_url: guardadas.imagenes[0] ?? null,
        imagenes: guardadas.imagenes,
        imagenes_meta: guardadas.completas ? guardadas.meta : [],
        imagenes_verificadas: verificadas,
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

  // 5) Guardar (si otra ejecución ya guardó la misma url, se ignora; sus fotos
  //    copiadas al bucket se quedan sin usar, no molestan)
  let nuevas = 0;
  if (filas.length) {
    // Si imagenes, imagenes_verificadas o imagenes_meta aún no existen
    // (migración pendiente), se guarda sin ellas. Las fotos ya están comprobadas.
    const { data, error } = await conColumnasOpcionales((limpiar) =>
      supabase
        .from("noticias_gaming")
        .upsert(filas.map(limpiar), { onConflict: "url", ignoreDuplicates: true })
        .select("id")
    );
    if (error) {
      console.error("Noticias: error guardando en Supabase:", error.message);
    } else {
      nuevas = data?.length ?? 0;
    }
  }

  return { candidatas: todas.length, analizadas: cupo.resumenes - resumenesAntes, nuevas };
}

// --- Revisión de fotos de noticias ya guardadas (con IA) ------------------------

type FilaRevision = {
  id: string;
  url: string;
  titulo: string;
  resumen: string;
  imagen_url: string | null;
  imagenes?: unknown;
  publicada_en: string | null;
};

// Revisión periódica (como mucho cada 10 minutos, clave 'relleno'): a la vez,
// la comprobación con IA de las fotos sin verificar y la copia al bucket de
// las ya verificadas (sin IA). Devuelve cuántas noticias se han actualizado.
async function revisarImagenes(
  supabase: SupabaseClient,
  openaiKey: string,
  cupo: CupoIA,
  prefijoBucket: string,
  fin: number
): Promise<number> {
  if (columnasQueFaltan.has("imagenes_verificadas")) return 0;
  try {
    if (!(await reservarTurno(supabase, "relleno", MINUTOS_ENTRE_REVISIONES * 60_000, false))) return 0;
  } catch (e: any) {
    console.warn("Noticias: revisión de fotos saltada:", e?.message ?? e);
    return 0;
  }
  const [revisadas, copiadas] = await Promise.all([
    revisarSinVerificar(supabase, openaiKey, cupo, prefijoBucket, fin),
    pasarFotosAlBucket(supabase, prefijoBucket, fin),
  ]);
  return revisadas + copiadas;
}

// Revisa hasta 6 noticias con imagenes_verificadas = false: busca candidatas
// con las reglas nuevas (si no se puede leer la página, usa las que ya tenía)
// y las pasa por la comprobación con IA; las buenas se copian al bucket.
// Devuelve cuántas se han actualizado.
async function revisarSinVerificar(
  supabase: SupabaseClient,
  openaiKey: string,
  cupo: CupoIA,
  prefijoBucket: string,
  fin: number
): Promise<number> {
  const quedan = () => fin - Date.now();
  const maxFilas = Math.min(MAX_REVISION_POR_EJECUCION, MAX_COMPROBACIONES_IA - cupo.comprobaciones);
  if (maxFilas <= 0 || columnasQueFaltan.has("imagenes_verificadas")) return 0;
  try {
    // Por dónde va el recorrido (fecha de la última noticia revisada).
    const { data: control } = await supabase
      .from("noticias_gaming_control")
      .select("valor")
      .eq("clave", "revision_cursor")
      .maybeSingle();
    const cursor: string | null = typeof control?.valor === "string" ? control.valor : null;

    // null: falta la columna imagenes_verificadas (migración pendiente) → no hay revisión.
    const buscar = async (antesDe: string | null): Promise<FilaRevision[] | null> => {
      for (let intento = 0; intento <= COLUMNAS_OPCIONALES.length; intento++) {
        const columnas = `id,url,titulo,resumen,imagen_url,publicada_en${columnasQueFaltan.has("imagenes") ? "" : ",imagenes"}`;
        let q = supabase
          .from("noticias_gaming")
          .select(columnas)
          .eq("imagenes_verificadas", false)
          .eq("publicada", true)
          .not("publicada_en", "is", null)
          .order("publicada_en", { ascending: false })
          .limit(maxFilas);
        if (antesDe) q = q.lt("publicada_en", antesDe);
        const { data, error } = await q;
        if (!error) return (data ?? []) as unknown as FilaRevision[];
        if (!apuntarColumnaQueFalta(error)) throw error;
        if (columnasQueFaltan.has("imagenes_verificadas")) return null;
      }
      return null;
    };

    let filas = await buscar(cursor);
    // Se llegó al final: vuelve a empezar por las más recientes.
    if (filas && !filas.length && cursor) filas = await buscar(null);
    if (!filas) {
      console.warn("Noticias: falta la columna imagenes_verificadas; revisión de fotos saltada.");
      return 0;
    }
    if (!filas.length) return 0;
    const lista = filas;

    let revisadas = 0;
    let siguiente = 0;
    const trabajador = async () => {
      while (siguiente < lista.length && quedan() > 15_000 && cupo.comprobaciones < MAX_COMPROBACIONES_IA) {
        const fila = lista[siguiente++];
        const urlReal = await urlRealDe(fila.url, Math.min(2 * TIMEOUT_GOOGLE_MS, quedan() - 11_000));
        const pagina = await leerPaginaArticulo(urlReal, Math.min(TIMEOUT_ARTICULO_MS, quedan() - 9_000));
        const guardadas = Array.isArray(fila.imagenes)
          ? fila.imagenes.filter((u): u is string => typeof u === "string")
          : [];
        const candidatas = pagina.leida
          ? unirImagenes(pagina.portada, pagina.cuerpo)
          : unirImagenes([fila.imagen_url], guardadas);
        // Sin página y sin fotos guardadas: nada que comprobar todavía (otra vuelta).
        if (!pagina.leida && !candidatas.length) continue;
        const listas = await prepararImagenes(candidatas, Math.min(TIMEOUT_IMAGEN_MS, quedan() - 6_000));
        const fotos = await fotosComprobadas(
          openaiKey,
          cupo,
          String(fila.titulo ?? ""),
          String(fila.resumen ?? ""),
          listas,
          Math.min(TIMEOUT_VISION_MS, quedan() - 1_000)
        );
        // Sin comprobar: sigue sin enseñar fotos y se reintenta en otra vuelta.
        if (fotos === null) continue;
        // Las buenas se copian al bucket (ya están descargadas).
        const copia = await guardarFotosEnBucket(
          supabase,
          prefijoBucket,
          fila.id,
          fotos.map((f) => ({ url: f.url, foto: f.foto })),
          Math.min(TIMEOUT_SUBIDA_MS, quedan() - 1_000)
        );
        const { error } = await conColumnasOpcionales((limpiar) =>
          supabase
            .from("noticias_gaming")
            .update(
              limpiar({
                imagen_url: copia.imagenes[0] ?? null,
                imagenes: copia.imagenes,
                imagenes_meta: copia.completas ? copia.meta : [],
                imagenes_verificadas: true,
              })
            )
            .eq("id", fila.id)
        );
        if (error) console.warn("Noticias: no se pudo guardar la revisión de fotos:", error.message);
        else revisadas++;
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCIA_REVISION }, trabajador));

    // La próxima vez sigue por debajo de la última revisada.
    const ultima = siguiente > 0 ? lista[siguiente - 1]?.publicada_en : null;
    if (ultima) {
      await supabase
        .from("noticias_gaming_control")
        .upsert({ clave: "revision_cursor", valor: ultima }, { onConflict: "clave" });
    }
    return revisadas;
  } catch (e: any) {
    console.warn("Noticias: revisión de fotos saltada:", e?.message ?? e);
    return 0;
  }
}

// --- Copia al bucket de las fotos ya verificadas (sin IA) ------------------------

type FilaBucket = { id: string; imagen_url: string | null; imagenes?: unknown; publicada_en: string | null };

// Fotos guardadas de una noticia: la principal + las del carrusel, sin
// repetidas y solo https (máx. 6), en el mismo orden que las enseña la app.
function fotosDeFila(fila: { imagen_url: string | null; imagenes?: unknown }): string[] {
  const todas: unknown[] = [fila.imagen_url, ...(Array.isArray(fila.imagenes) ? fila.imagenes : [])];
  const salida: string[] = [];
  for (const u of todas) {
    if (typeof u === "string" && /^https:\/\//i.test(u) && !salida.includes(u)) salida.push(u);
  }
  return salida.slice(0, MAX_IMAGENES);
}

// Copia al bucket las fotos de hasta 8 noticias ya verificadas que aún no
// tienen imagenes_meta (anteriores al bucket o con alguna subida pendiente) y
// rellena imagenes_meta. No llama a la IA: las fotos ya están comprobadas. Una
// foto que ahora no se puede descargar se queda con su URL original. La clave
// 'bucket_cursor' recuerda por qué fecha va, para que una noticia que no se
// deja copiar no bloquee a las demás. Devuelve cuántas se han actualizado.
async function pasarFotosAlBucket(supabase: SupabaseClient, prefijoBucket: string, fin: number): Promise<number> {
  const quedan = () => fin - Date.now();
  if (["imagenes", "imagenes_meta", "imagenes_verificadas"].some((c) => columnasQueFaltan.has(c))) return 0;
  try {
    const { data: control } = await supabase
      .from("noticias_gaming_control")
      .select("valor")
      .eq("clave", "bucket_cursor")
      .maybeSingle();
    const cursor: string | null = typeof control?.valor === "string" ? control.valor : null;

    // null: falta la columna imagenes_meta (migración pendiente) → no se copia nada.
    const buscar = async (antesDe: string | null): Promise<FilaBucket[] | null> => {
      let q = supabase
        .from("noticias_gaming")
        .select("id,imagen_url,imagenes,publicada_en")
        .eq("imagenes_verificadas", true)
        .eq("imagenes_meta", "[]")
        .eq("publicada", true)
        .not("imagen_url", "is", null)
        .not("publicada_en", "is", null)
        .order("publicada_en", { ascending: false })
        .limit(MAX_BUCKET_POR_EJECUCION);
      if (antesDe) q = q.lt("publicada_en", antesDe);
      const { data, error } = await q;
      if (!error) return (data ?? []) as unknown as FilaBucket[];
      if (apuntarColumnaQueFalta(error)) return null;
      throw error;
    };

    let filas = await buscar(cursor);
    // Se llegó al final: vuelve a empezar por las más recientes.
    if (filas && !filas.length && cursor) filas = await buscar(null);
    if (!filas || !filas.length) return 0;
    const lista = filas;

    let copiadas = 0;
    let siguiente = 0;
    const trabajador = async () => {
      // Cada noticia: descarga (máx. 8 s) y subida (máx. 8 s), siempre con margen.
      while (siguiente < lista.length && quedan() > TIMEOUT_DESCARGA_BUCKET_MS + 4_000) {
        const fila = lista[siguiente++];
        const urls = fotosDeFila(fila);
        if (!urls.length) continue;
        // También las que ya están en el bucket: de ellas solo se leen las medidas.
        const descargas = await Promise.all(
          urls.map(async (url) => ({
            url,
            foto: await descargarFoto(url, Math.min(TIMEOUT_DESCARGA_BUCKET_MS, quedan() - 3_000)),
          }))
        );
        const guardadas = await guardarFotosEnBucket(
          supabase,
          prefijoBucket,
          fila.id,
          descargas,
          Math.min(TIMEOUT_SUBIDA_MS, quedan() - 1_000)
        );
        const cambian = guardadas.imagenes.some((u, i) => u !== urls[i]);
        // Nada copiado y todavía pendiente: se reintenta en otra vuelta.
        if (!guardadas.completas && !cambian) continue;
        const { error } = await supabase
          .from("noticias_gaming")
          .update({
            imagen_url: guardadas.imagenes[0] ?? null,
            imagenes: guardadas.imagenes,
            imagenes_meta: guardadas.completas ? guardadas.meta : [],
          })
          .eq("id", fila.id);
        if (error) console.warn("Noticias: no se pudo guardar la copia de fotos:", error.message);
        else copiadas++;
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCIA_BUCKET }, trabajador));

    // La próxima vez sigue por debajo de la última tratada.
    const ultima = siguiente > 0 ? lista[siguiente - 1]?.publicada_en : null;
    if (ultima) {
      await supabase
        .from("noticias_gaming_control")
        .upsert({ clave: "bucket_cursor", valor: ultima }, { onConflict: "clave" });
    }
    return copiadas;
  } catch (e: any) {
    console.warn("Noticias: copia de fotos al bucket saltada:", e?.message ?? e);
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

  // Se vuelve a comprobar en cada ejecución qué columnas existen.
  columnasQueFaltan.clear();

  try {
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Principio de las URLs públicas del bucket (…/storage/v1/object/public/noticias/).
    const prefijoBucket = supabase.storage.from(BUCKET_NOTICIAS).getPublicUrl("x").data.publicUrl.slice(0, -1);

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

    // Cupo de llamadas a OpenAI de esta ejecución: 8 resúmenes + 6 comprobaciones.
    const cupo: CupoIA = { resumenes: 0, comprobaciones: 0 };
    const resultado = toca ? await recogerNuevas(supabase, openaiKey, cupo, prefijoBucket, restante) : null;

    // 2) Revisión de fotos de las ya guardadas, si queda tiempo: las sin verificar
    //    (con IA, si queda cupo) y la copia al bucket de las verificadas (sin IA).
    //    («rellenadas»: noticias actualizadas; la app recarga si hay alguna.)
    let rellenadas = 0;
    if (restante() > 20_000) {
      const fin = Date.now() + Math.min(PRESUPUESTO_REVISION_MS, restante() - 2_000);
      rellenadas = await revisarImagenes(supabase, openaiKey, cupo, prefijoBucket, fin);
    }

    res.status(200).json(
      resultado ? { ok: true, actualizado: true, ...resultado, rellenadas } : { ok: true, actualizado: false, rellenadas }
    );
  } catch (e: any) {
    console.error("Noticias: error inesperado:", e?.message ?? e);
    res.status(500).json({ ok: false, error: "Error inesperado actualizando las noticias." });
  }
}
