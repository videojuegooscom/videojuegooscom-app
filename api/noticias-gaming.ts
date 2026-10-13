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
 * Cuándo actualiza:
 * - Cron diario de Vercel (vercel.json → "crons"), con la cabecera
 *   Authorization: Bearer ${CRON_SECRET}: siempre.
 * - Visitas a la pestaña "Noticias Gaming": solo si la última actualización
 *   (noticias_gaming_control, clave 'ultima') tiene más de 3 horas. Si no,
 *   responde enseguida {ok:true, actualizado:false}. La marca 'ultima' se
 *   reserva ANTES de procesar para que dos visitas a la vez no dupliquen
 *   el trabajo (ni el gasto de IA).
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
 * - app/(tabs)/chat-global.tsx → pestaña "Noticias Gaming" (lee la tabla y
 *   llama aquí en segundo plano al abrirse).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Vercel: margen máximo de ejecución (válido en plan Hobby).
export const config = { maxDuration: 60 };

const HORAS_ENTRE_ACTUALIZACIONES = 3;
const MAX_NOTICIAS_POR_EJECUCION = 8;
const CONCURRENCIA = 3;
const PRESUPUESTO_TOTAL_MS = 50_000;
const TIMEOUT_FEED_MS = 6_000;
const TIMEOUT_ARTICULO_MS = 6_000;
const TIMEOUT_OPENAI_MS = 22_000;
const MAX_TEXTO_ARTICULO = 6_000;
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
  imagen: string | null;
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

function atributo(xml: string, nombreEtiqueta: string, attr: string): string {
  const re = new RegExp(`<${nombreEtiqueta}\\b[^>]*\\b${attr}=["']([^"']+)["']`, "i");
  const m = xml.match(re);
  return m ? decodificarEntidades(m[1]) : "";
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

    const descripcionHtml = etiqueta(item, "description") || etiqueta(item, "content:encoded");
    const fechaTxt = etiqueta(item, "pubDate") || etiqueta(item, "dc:date");
    const fecha = fechaTxt ? new Date(fechaTxt) : null;

    const imagen =
      atributo(item, "media:content", "url") ||
      atributo(item, "media:thumbnail", "url") ||
      atributo(item, "enclosure", "url") ||
      (quitarCdata(descripcionHtml + etiqueta(item, "content:encoded")).match(
        /<img\b[^>]*\bsrc=["']([^"']+)["']/i
      )?.[1] ?? "");

    salida.push({
      url: normalizarUrl(link),
      fuente: fuente || hostDe(link),
      titulo: titulo.slice(0, 300),
      descripcion: textoPlano(descripcionHtml).slice(0, 1200),
      imagen: /^https:\/\//i.test(imagen) ? decodificarEntidades(imagen) : null,
      fecha: fecha && !Number.isNaN(fecha.getTime()) ? fecha : null,
    });
  }
  return salida;
}

function hostDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Web";
  }
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

// Texto del artículo original: solo los párrafos, sin etiquetas.
async function leerArticulo(url: string, ms: number): Promise<string> {
  // Los enlaces de Google Noticias son redirecciones con JavaScript: no sirven.
  if (/(^|\.)news\.google\.com$/i.test(hostDe(url))) return "";
  try {
    const r = await fetchConTimeout(url, ms, {
      headers: { "User-Agent": UA, Accept: "text/html" },
    });
    if (!r.ok) return "";
    const html = await r.text();
    const parrafos = (html.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) ?? [])
      .map(textoPlano)
      .filter((p) => p.length > 40);
    return parrafos.join("\n").slice(0, MAX_TEXTO_ARTICULO);
  } catch {
    return "";
  }
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

// Reserva la actualización: devuelve true si esta ejecución debe procesar.
async function reservarTurno(supabase: SupabaseClient, esCron: boolean): Promise<boolean> {
  const ahora = new Date().toISOString();

  if (esCron) {
    const { error } = await supabase
      .from("noticias_gaming_control")
      .upsert({ clave: "ultima", valor: ahora }, { onConflict: "clave" });
    if (error) throw error;
    return true;
  }

  // Actualización condicional: solo una petición a la vez puede "ganar".
  const limite = new Date(Date.now() - HORAS_ENTRE_ACTUALIZACIONES * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from("noticias_gaming_control")
    .update({ valor: ahora })
    .eq("clave", "ultima")
    .lt("valor", limite)
    .select("clave");
  if (error) throw error;
  if (data && data.length) return true;

  // ¿No existe aún la fila? Primera vez: se crea (si otra petición se adelanta, falla y no toca).
  const { data: fila, error: errLectura } = await supabase
    .from("noticias_gaming_control")
    .select("clave")
    .eq("clave", "ultima")
    .maybeSingle();
  if (errLectura) throw errLectura;
  if (fila) return false;

  const { error: errInsert } = await supabase
    .from("noticias_gaming_control")
    .insert({ clave: "ultima", valor: ahora });
  return !errInsert;
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

    // 1) ¿Toca actualizar? (se marca 'ultima' antes de procesar)
    let toca: boolean;
    try {
      toca = await reservarTurno(supabase, esCron);
    } catch (e: any) {
      console.error("Noticias: no se pudo leer/marcar el control:", e?.message ?? e);
      res.status(503).json({
        ok: false,
        error: "Las tablas de Noticias Gaming todavía no están disponibles.",
      });
      return;
    }
    if (!toca) {
      res.status(200).json({ ok: true, actualizado: false });
      return;
    }

    // 2) Recopilar de todas las fuentes en paralelo (las que fallen, se saltan)
    const porFeed = await Promise.all(FEEDS.map(leerFeed));
    const ahora = Date.now();
    const todas = porFeed
      .flat()
      .filter((n) => !n.fecha || ahora - n.fecha.getTime() < MAX_ANTIGUEDAD_MS)
      .sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0));

    // 3) Quitar las que ya están guardadas (por url o por título parecido)
    const { data: existentes } = await supabase
      .from("noticias_gaming")
      .select("url,titulo")
      .order("created_at", { ascending: false })
      .limit(400);
    const urlsVistas = new Set<string>((existentes ?? []).map((r: any) => String(r.url)));
    const titulosVistos: Set<string>[] = (existentes ?? []).map((r: any) => palabrasTitulo(String(r.titulo)));

    // 4) Quitar duplicados entre fuentes y quedarse con las más recientes
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

    // 5) Desglose con IA, de 3 en 3, sin pasarse del tiempo total
    const filas: Record<string, unknown>[] = [];
    let llamadasIA = 0;
    let siguiente = 0;

    const trabajador = async () => {
      while (siguiente < elegidas.length) {
        if (restante() < 12_000 || llamadasIA >= MAX_NOTICIAS_POR_EJECUCION) return;
        const n = elegidas[siguiente++];
        const texto = await leerArticulo(n.url, Math.min(TIMEOUT_ARTICULO_MS, restante() - 10_000));
        const ms = Math.min(TIMEOUT_OPENAI_MS, restante() - 2_000);
        if (ms < 5_000) return;
        llamadasIA++;
        const d = await desglosarConIA(openaiKey, n, texto, ms);
        if (!d || !d.relevante) continue;
        filas.push({
          url: n.url,
          fuente: n.fuente.slice(0, 120),
          titulo: d.titulo,
          imagen_url: n.imagen,
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

    // 6) Guardar (si otra ejecución ya guardó la misma url, se ignora)
    let nuevas = 0;
    if (filas.length) {
      const { data, error } = await supabase
        .from("noticias_gaming")
        .upsert(filas, { onConflict: "url", ignoreDuplicates: true })
        .select("id");
      if (error) {
        console.error("Noticias: error guardando en Supabase:", error.message);
      } else {
        nuevas = data?.length ?? 0;
      }
    }

    res.status(200).json({
      ok: true,
      actualizado: true,
      candidatas: todas.length,
      analizadas: llamadasIA,
      nuevas,
    });
  } catch (e: any) {
    console.error("Noticias: error inesperado:", e?.message ?? e);
    res.status(500).json({ ok: false, error: "Error inesperado actualizando las noticias." });
  }
}
