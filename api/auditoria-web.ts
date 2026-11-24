/**
 * Archivo: api/auditoria-web.ts
 * Función: función de servidor en /api/auditoria-web (Vercel), lanzada por un cron.
 * Para qué sirve: revisa automáticamente la calidad de la web real (HTTPS, título, sitemap, políticas, velocidad…) los días 1 y 15 de cada mes y apunta el resultado en la tabla auditorias_web; solo lee la tienda y exige la cabecera Bearer CRON_SECRET.
 * Conectado con: Supabase (clave de servidor; tabla auditorias_web), vercel.json (cron), la tienda en producción.
 * Utilizado por: el cron de Vercel; app/admin/auditorias.tsx muestra los resultados.
 * Dependencias: @supabase/supabase-js.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: revisión de calidad web AUTOMÁTICA de la tienda real (la lista de 20 puntos de la
 * lección «Revisión de calidad web cada dos semanas»). La lanza el cron de Vercel los días 1 y 15
 * de cada mes (≈ cada dos semanas), sin que nadie tenga que tocar ni aceptar nada, y apunta en la
 * tabla «auditorias_web» cuándo se hizo, qué puntos miró y qué encontró. El panel de
 * administración lo enseña en «Revisiones» (app/admin/auditorias.tsx).
 *
 * Alcance real: solo LEE la tienda (no cambia nada, ni código ni datos). Mide desde el servidor
 * lo que se puede medir con peticiones: políticas sin marcas de relleno, HTTPS, título y
 * descripción, vista previa al compartir, favicon, robots y sitemap, fotos optimizadas, velocidad
 * del HTML, 404 propia, enlaces del sitemap y analítica activa. Los puntos que necesitan un
 * navegador o leer el código (secretos, cookies, texto alternativo, contraste, móvil,
 * formularios, spam, llamadas a la acción) se marcan «manual»: los repasa Claude cuando abre una
 * sesión y ve que han pasado más de 14 días. Arreglar lo que salga también lo hace Claude.
 *
 * Seguridad: solo responde con la cabecera «Authorization: Bearer CRON_SECRET» (la que manda
 * Vercel en sus crons). Escribe con la clave de servidor (SUPABASE_CLAVE_SERVIDOR).
 *
 * Conectado con: vercel.json (cron), supabase/migrations/…_auditorias_web.sql,
 * app/admin/auditorias.tsx, la lección de aprendizajes «Revisión de calidad web…».
 */
import { createClient } from "@supabase/supabase-js";

const codificar = new TextEncoder();

const DOMINIO = "https://videojuegoszaragoza.com";
type Estado = "ok" | "aviso" | "fallo" | "manual";
type Punto = { n: number; nombre: string; estado: Estado; detalle: string };

const MANUALES: { n: number; nombre: string; detalle: string }[] = [
  { n: 3, nombre: "API y secretos", detalle: "Se revisa el código con Claude: nada escrito en el repositorio, .env ignorado, endpoints protegidos." },
  { n: 5, nombre: "Aviso de cookies", detalle: "Necesita un navegador: lo comprueba Claude." },
  { n: 10, nombre: "Imágenes con texto alternativo (ALT)", detalle: "Necesita un navegador: lo comprueba Claude." },
  { n: 13, nombre: "Contraste de colores", detalle: "Decisión del dueño (2026-10-16): el azul de marca se deja como está." },
  { n: 14, nombre: "Web en móvil", detalle: "Necesita un navegador (360, 390 y 414 px): lo comprueba Claude." },
  { n: 17, nombre: "Formularios validados", detalle: "Necesita un navegador: lo comprueba Claude." },
  { n: 18, nombre: "Protección contra spam", detalle: "Se revisa con Claude (campo trampa, límites en la base de datos)." },
  { n: 20, nombre: "Llamadas a la acción claras", detalle: "Necesita un navegador: lo comprueba Claude." },
];

function iguales(a: string, b: string): boolean {
  // Comparación en tiempo constante (para la clave del cron).
  const x = codificar.encode(a);
  const y = codificar.encode(b);
  let diferencia = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diferencia |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diferencia === 0;
}

async function pedir(url: string, opciones: { manual?: boolean; agente?: string; ms?: number } = {}) {
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), opciones.ms ?? 7000);
  const inicio = Date.now();
  try {
    const r = await fetch(url, {
      redirect: opciones.manual ? "manual" : "follow",
      signal: control.signal,
      headers: opciones.agente ? { "user-agent": opciones.agente } : undefined,
    });
    const buf = new Uint8Array(await r.arrayBuffer());
    return { status: r.status, location: r.headers.get("location") ?? "", texto: new TextDecoder().decode(buf), bytes: buf.length, ms: Date.now() - inicio };
  } catch {
    return { status: 0, location: "", texto: "", bytes: 0, ms: Date.now() - inicio };
  } finally {
    clearTimeout(t);
  }
}

// Reparte las peticiones de a pocas a la vez para no saturar la tienda ni agotar el tiempo.
async function enLotes<T, R>(items: T[], lote: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const salida: R[] = [];
  for (let i = 0; i < items.length; i += lote) {
    salida.push(...(await Promise.all(items.slice(i, i + lote).map(f))));
  }
  return salida;
}

// --- Google Search Console (dueño, 2026-11-24: «trackearlo desde el panel… con nuestro diseño») ------------------------
// Administración → Google (components/panel/google.tsx) pide aquí, con la sesión del administrador, lo que da Search
// Console de la propiedad https://videojuegoszaragoza.com/: clics, veces que sale, porcentaje de clics y posición media
// (y por día), las búsquedas, las páginas, los países, los mapas de la web y «Comprobar una página en Google» (URL
// Inspection). Va en esta función porque api/ está en el tope de 12 de Vercel Hobby.
// La llave es una cuenta de servicio de Google con permiso «Restringido» (solo lectura) en Search Console; su JSON lo
// guarda el dueño en Vercel como GOOGLE_SEARCH_CONSOLE_CREDENCIALES (nunca sale de aquí ni se escribe en el registro).
const SITIO_GOOGLE = "https://videojuegoszaragoza.com/";
type MotivoGoogle = "sin_llave" | "llave_mal" | "sin_permiso" | "error";
class FalloGoogle extends Error {
  constructor(public motivo: MotivoGoogle) {
    super(motivo);
  }
}

async function tokenGoogle(): Promise<string> {
  const bruto = process.env.GOOGLE_SEARCH_CONSOLE_CREDENCIALES;
  if (!bruto) throw new FalloGoogle("sin_llave");
  let cred: { client_email?: string; private_key?: string };
  try {
    cred = JSON.parse(bruto);
  } catch {
    throw new FalloGoogle("llave_mal");
  }
  if (!cred.client_email || !cred.private_key) throw new FalloGoogle("llave_mal");
  const { createSign } = await import("node:crypto");
  const ahora = Math.floor(Date.now() / 1000);
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const cuerpo = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: cred.client_email,
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: ahora,
    exp: ahora + 3600,
  })}`;
  let firma: string;
  try {
    firma = createSign("RSA-SHA256").update(cuerpo).sign(cred.private_key.replace(/\\n/g, "\n"), "base64url");
  } catch {
    throw new FalloGoogle("llave_mal");
  }
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${cuerpo}.${firma}` }).toString(),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string };
  if (!r.ok || !j.access_token) throw new FalloGoogle("llave_mal");
  return j.access_token;
}

async function llamarGoogle(token: string, url: string, cuerpo?: unknown): Promise<any> {
  const r = await fetch(url, {
    method: cuerpo ? "POST" : "GET",
    headers: { authorization: `Bearer ${token}`, ...(cuerpo ? { "content-type": "application/json" } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  if (r.status === 403 || r.status === 401) throw new FalloGoogle("sin_permiso");
  if (!r.ok) throw new FalloGoogle("error");
  return r.json();
}

const diaISO = (d: Date) => d.toISOString().slice(0, 10);

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
// Un periodo elegido en Administración → Google («Rango personalizado», 2026-11-24): AAAA-MM-DD a AAAA-MM-DD, ambos
// incluidos, nunca en el futuro y como mucho 16 meses (lo que guarda Search Console). Si no vale, null.
function rangoPedido(desdeTxt: unknown, hastaTxt: unknown): { desde: Date; hasta: Date } | null {
  if (typeof desdeTxt !== "string" || typeof hastaTxt !== "string" || !FECHA_RE.test(desdeTxt) || !FECHA_RE.test(hastaTxt)) return null;
  let desde = new Date(`${desdeTxt}T00:00:00Z`);
  let hasta = new Date(`${hastaTxt}T00:00:00Z`);
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) return null;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  const hoy = new Date(`${diaISO(new Date())}T00:00:00Z`);
  if (hasta > hoy) hasta = hoy;
  const limite = new Date(hoy.getTime() - 486 * 86400000);
  if (desde < limite) desde = limite;
  if (desde > hasta) return null;
  return { desde, hasta };
}

// El periodo con el que se compara (2026-11-24): si empieza el día 1 y acaba en ese mismo mes, los mismos días del mes
// anterior (1-24 nov frente a 1-24 oct); si no, los mismos días justo antes.
function periodoAnterior(desde: Date, hasta: Date): { desde: Date; hasta: Date } {
  const dias = Math.round((hasta.getTime() - desde.getTime()) / 86400000) + 1;
  const y = desde.getUTCFullYear();
  const m = desde.getUTCMonth();
  if (desde.getUTCDate() === 1 && hasta.getUTCFullYear() === y && hasta.getUTCMonth() === m) {
    const finMesAnterior = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { desde: new Date(Date.UTC(y, m - 1, 1)), hasta: new Date(Date.UTC(y, m - 1, Math.min(dias, finMesAnterior))) };
  }
  return { desde: new Date(desde.getTime() - dias * 86400000), hasta: new Date(desde.getTime() - 86400000) };
}

async function datosGoogle(dias: number, rango: { desde: Date; hasta: Date } | null = null) {
  const token = await tokenGoogle();
  const base = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITIO_GOOGLE)}`;
  // Con un rango elegido, ese; si no, los últimos `dias` hasta hace 2 días (Google da los datos con 2-3 días de retraso).
  const hasta = rango?.hasta ?? new Date(Date.now() - 2 * 86400000);
  const desde = rango?.desde ?? new Date(hasta.getTime() - (dias - 1) * 86400000);
  const antes = periodoAnterior(desde, hasta);
  const consulta = (dimensiones: string[], filas: number, d = desde, h = hasta) =>
    llamarGoogle(token, `${base}/searchAnalytics/query`, { startDate: diaISO(d), endDate: diaISO(h), dimensions: dimensiones, rowLimit: filas, dataState: "all" });
  // Las búsquedas, hasta 250: la pantalla enseña las 15 primeras, las «casi en la primera página» y los filtros.
  // Las páginas, también hasta 250: las 15 primeras y, aparte, las de «Compramos tu…» aunque no estén entre ellas.
  const [totales, totalesAntes, porDia, busquedas, paginas, paises, dispositivos, mapas] = await Promise.all([
    consulta([], 1),
    consulta([], 1, antes.desde, antes.hasta),
    consulta(["date"], 120),
    consulta(["query"], 250),
    consulta(["page"], 250),
    consulta(["country"], 8),
    consulta(["device"], 5),
    llamarGoogle(token, `${base}/sitemaps`),
  ]);
  const fila = (f: any) => ({ clics: Number(f?.clicks ?? 0), impresiones: Number(f?.impressions ?? 0), ctr: Number(f?.ctr ?? 0), posicion: Number(f?.position ?? 0) });
  const vacia = { clics: 0, impresiones: 0, ctr: 0, posicion: 0 };
  const t = (totales?.rows ?? [])[0];
  const ta = (totalesAntes?.rows ?? [])[0];
  return {
    conectado: true,
    desde: diaISO(desde),
    hasta: diaISO(hasta),
    totales: t ? fila(t) : vacia,
    anterior: { desde: diaISO(antes.desde), hasta: diaISO(antes.hasta), totales: ta ? fila(ta) : vacia },
    porDia: (porDia?.rows ?? []).map((f: any) => ({ fecha: String(f.keys?.[0] ?? ""), ...fila(f) })),
    busquedas: (busquedas?.rows ?? []).map((f: any) => ({ texto: String(f.keys?.[0] ?? ""), ...fila(f) })),
    dispositivos: (dispositivos?.rows ?? []).map((f: any) => ({ dispositivo: String(f.keys?.[0] ?? "").toUpperCase(), ...fila(f) })),
    paginas: (paginas?.rows ?? []).map((f: any) => ({ url: String(f.keys?.[0] ?? ""), ...fila(f) })),
    paises: (paises?.rows ?? []).map((f: any) => ({ pais: String(f.keys?.[0] ?? "").toUpperCase(), ...fila(f) })),
    mapas: (mapas?.sitemap ?? []).map((m: any) => ({
      ruta: String(m.path ?? "").replace(SITIO_GOOGLE.replace(/\/$/, ""), "") || String(m.path ?? ""),
      ultimaLectura: m.lastDownloaded ?? null,
      enviadoEn: m.lastSubmitted ?? null,
      pendiente: !!m.isPending,
      errores: Number(m.errors ?? 0),
      avisos: Number(m.warnings ?? 0),
      paginas: (m.contents ?? []).reduce((s: number, c: any) => s + Number(c.submitted ?? 0), 0),
    })),
  };
}

async function inspeccionarGoogle(ruta: string) {
  const token = await tokenGoogle();
  const j = await llamarGoogle(token, "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
    inspectionUrl: `${SITIO_GOOGLE.replace(/\/$/, "")}${ruta}`,
    siteUrl: SITIO_GOOGLE,
    languageCode: "es-ES",
  });
  const r = j?.inspectionResult?.indexStatusResult ?? {};
  return {
    ruta,
    enGoogle: r.verdict === "PASS",
    veredicto: String(r.verdict ?? "VERDICT_UNSPECIFIED"),
    estado: String(r.coverageState ?? ""),
    ultimaVisita: r.lastCrawlTime ?? null,
    canonicaGoogle: r.googleCanonical ?? null,
    robots: String(r.robotsTxtState ?? ""),
    descarga: String(r.pageFetchState ?? ""),
  };
}

async function respuestaGoogle(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_CLAVE_SERVIDOR;
  if (!url || !clave) {
    res.status(503).json({ ok: false, error: "sin configurar" });
    return;
  }
  // Solo el administrador, con su sesión.
  const supabase = createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });
  const cab = typeof req.headers?.authorization === "string" ? req.headers.authorization.trim() : "";
  let uid: string | null = null;
  if (/^Bearer\s+\S+$/i.test(cab)) {
    try {
      const { data } = await supabase.auth.getUser(cab.replace(/^Bearer\s+/i, ""));
      uid = data?.user?.id ?? null;
    } catch {
      uid = null;
    }
  }
  const { data: perfil } = uid ? await supabase.from("profiles").select("role").eq("id", uid).maybeSingle<{ role: string }>() : { data: null };
  if (perfil?.role !== "admin") {
    res.status(403).json({ ok: false, error: "solo para administradores" });
    return;
  }
  try {
    const ruta = typeof req.query?.inspeccionar === "string" ? req.query.inspeccionar : "";
    if (ruta) {
      // Solo páginas de la tienda: una ruta que empieza por «/», sin dominio ni nada raro.
      if (!/^\/[\w\-./%]*$/.test(ruta) || ruta.length > 300) {
        res.status(400).json({ ok: false, error: "ruta no válida" });
        return;
      }
      res.status(200).json({ ok: true, ...(await inspeccionarGoogle(ruta)) });
      return;
    }
    const dias = [7, 28, 90].includes(Number(req.query?.dias)) ? Number(req.query.dias) : 28;
    res.status(200).json({ ok: true, ...(await datosGoogle(dias, rangoPedido(req.query?.desde, req.query?.hasta))) });
  } catch (e) {
    const motivo: MotivoGoogle = e instanceof FalloGoogle ? e.motivo : "error";
    if (motivo === "error") console.error("google: fallo al pedir a Search Console");
    res.status(200).json({ ok: true, conectado: false, motivo });
  }
}

export default async function handler(req: any, res: any) {
  if (req.query?.accion === "google") {
    await respuestaGoogle(req, res);
    return;
  }
  const cronSecret = process.env.CRON_SECRET;
  const auth = typeof req.headers?.authorization === "string" ? req.headers.authorization : "";
  if (!cronSecret || !iguales(auth, `Bearer ${cronSecret}`)) {
    res.status(401).json({ ok: false, error: "no autorizado" });
    return;
  }
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_CLAVE_SERVIDOR;
  if (!url || !clave) {
    res.status(503).json({ ok: false, error: "sin configurar" });
    return;
  }
  const supabase = createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });
  const inicio = Date.now();
  const puntos: Punto[] = [];
  const poner = (n: number, nombre: string, estado: Estado, detalle: string) => puntos.push({ n, nombre, estado, detalle });

  // Datos públicos de apoyo.
  const { data: productos } = await supabase.from("products").select("id").eq("status", "PUBLISHED").eq("is_active", true).limit(2000);
  const idsProductos = (productos ?? []).map((p: { id: string }) => p.id);

  // 1 y 2) Políticas sin marcas de relleno
  try {
    const { data } = await supabase.from("policy_pages").select("slug,intro,sections").in("slug", ["privacidad", "terminos"]);
    for (const [n, slug, nombre] of [[1, "privacidad", "Política de privacidad"], [2, "terminos", "Términos y condiciones"]] as const) {
      const fila = (data ?? []).find((f: { slug: string }) => f.slug === slug) as { intro?: string; sections?: unknown } | undefined;
      if (!fila) { poner(n, nombre, "fallo", "No existe la página."); continue; }
      const texto = `${fila.intro ?? ""} ${JSON.stringify(fila.sections ?? "")}`;
      const marcas = Array.from(new Set(texto.match(/\[[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 /.\-]{2,90}\]/g) ?? []));
      poner(n, nombre, marcas.length ? "fallo" : "ok", marcas.length ? `Tiene marcas sin rellenar: ${marcas.join(", ")}` : "Publicada y sin marcas de relleno.");
    }
  } catch {
    poner(1, "Política de privacidad", "aviso", "No se pudo leer.");
    poner(2, "Términos y condiciones", "aviso", "No se pudo leer.");
  }

  // 4) HTTPS
  {
    const r = await pedir("http://videojuegoszaragoza.com/", { manual: true });
    const bien = [301, 302, 307, 308].includes(r.status) && r.location.startsWith("https://");
    poner(4, "Forzar HTTPS", bien ? "ok" : "fallo", bien ? `http:// redirige a https:// (${r.status}).` : `http:// responde ${r.status}.`);
  }

  // 6, 8, 12) Portada: título, descripción, velocidad, favicon
  {
    const r = await pedir(`${DOMINIO}/`);
    const titulo = (r.texto.match(/<title[^>]*>([^<]*)<\/title>/) || [])[1]?.trim() ?? "";
    const descripcion = /<meta name="description" content="[^"]{10,}/.test(r.texto);
    poner(6, "Título y descripción en el HTML", titulo && descripcion ? "ok" : "fallo", titulo && descripcion ? `Título «${titulo}» y descripción presentes.` : `Falta ${titulo ? "" : "el título "}${descripcion ? "" : "la descripción"}.`);
    poner(12, "Velocidad de la portada (HTML)", r.status !== 200 ? "fallo" : r.ms < 1500 ? "ok" : "aviso", `El HTML tardó ${r.ms} ms (${Math.round(r.bytes / 1024)} KB).`);
    const [fav, man] = await Promise.all([pedir(`${DOMINIO}/favicon.ico`), pedir(`${DOMINIO}/manifest.json`)]);
    poner(8, "Favicon e iconos", fav.status === 200 && man.status === 200 ? "ok" : "fallo", `favicon.ico ${fav.status}, manifest.json ${man.status}.`);
  }

  // 7) Vista previa al compartir una ficha
  if (idsProductos.length) {
    const r = await pedir(`${DOMINIO}/producto/${idsProductos[0]}`, { agente: "WhatsApp/2.23" });
    const titulo = /property="og:title" content="[^"]+/.test(r.texto);
    const imagen = /property="og:image" content="[^"]+/.test(r.texto);
    poner(7, "Vista previa al compartir", r.status === 200 && titulo && imagen ? "ok" : "fallo", r.status === 200 ? `Ficha de producto: og:title ${titulo ? "sí" : "NO"}, og:image ${imagen ? "sí" : "NO"}.` : `La ficha respondió ${r.status}.`);
  } else {
    poner(7, "Vista previa al compartir", "aviso", "No hay productos publicados que probar.");
  }

  // 9) robots.txt y sitemap.xml
  let urlsSitemap: string[] = [];
  {
    const [robots, sitemap] = await Promise.all([pedir(`${DOMINIO}/robots.txt`), pedir(`${DOMINIO}/sitemap.xml`)]);
    urlsSitemap = Array.from(sitemap.texto.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
    const enSitemap = urlsSitemap.filter((u) => u.includes("/producto/")).length;
    const ok = robots.status === 200 && /sitemap:/i.test(robots.texto) && sitemap.status === 200 && enSitemap >= idsProductos.length;
    poner(9, "robots.txt y sitemap.xml", ok ? "ok" : sitemap.status === 200 && robots.status === 200 ? "aviso" : "fallo", `robots ${robots.status}, sitemap ${sitemap.status} con ${urlsSitemap.length} direcciones (${enSitemap} de ${idsProductos.length} productos publicados).`);
  }

  // 11) Fotos: la versión optimizada responde y pesa poco
  try {
    const { data } = await supabase.from("product_media").select("public_url,product_id,is_cover").eq("kind", "image").eq("is_cover", true).in("product_id", idsProductos.slice(0, 40)).limit(3);
    const fotos = (data ?? []) as { public_url: string }[];
    if (!fotos.length) {
      poner(11, "Fotos comprimidas", "aviso", "No se encontraron portadas que probar.");
    } else {
      const medidas = await Promise.all(fotos.map((f) => pedir(`${DOMINIO}/_vercel/image?url=${encodeURIComponent(f.public_url)}&w=640&q=75`, { ms: 10000 })));
      const fallan = medidas.filter((m) => m.status !== 200).length;
      const pesadas = medidas.filter((m) => m.status === 200 && m.bytes > 400 * 1024).length;
      const media = Math.round(medidas.reduce((a: number, m: { bytes: number }) => a + m.bytes, 0) / medidas.length / 1024);
      poner(11, "Fotos comprimidas", fallan ? "fallo" : pesadas ? "aviso" : "ok", fallan ? `El optimizador falló en ${fallan} de ${medidas.length} fotos.` : `Versión de 640 px: ${media} KB de media${pesadas ? `, ${pesadas} por encima de 400 KB` : ""}.`);
    }
  } catch {
    poner(11, "Fotos comprimidas", "aviso", "No se pudo medir.");
  }

  // 15) 404 propia
  {
    const r = await pedir(`${DOMINIO}/ruta-que-no-existe-${Date.now()}`);
    const propia = r.texto.includes("Esta página no existe");
    poner(15, "Página 404 propia", r.status === 404 && propia ? "ok" : "fallo", `Estado ${r.status}; ${propia ? "es la página de la tienda" : "NO es la página de la tienda"}.`);
  }

  // 16) Enlaces del sitemap (todas las páginas que anuncia)
  {
    const lista = urlsSitemap.slice(0, 80);
    const respuestas = await enLotes(lista, 8, async (u) => ({ u, s: (await pedir(u, { ms: 6000 })).status }));
    const rotos = respuestas.filter((r) => r.s !== 200);
    poner(16, "Enlaces rotos", lista.length === 0 ? "aviso" : rotos.length ? "fallo" : "ok", lista.length === 0 ? "No hay direcciones en el sitemap." : rotos.length ? `Fallan ${rotos.length} de ${lista.length}: ${rotos.slice(0, 5).map((r) => `${r.u.replace(DOMINIO, "")} (${r.s})`).join(", ")}` : `Las ${lista.length} páginas del sitemap responden 200.`);
  }

  // 19) Analítica propia activa
  try {
    const desde = new Date(Date.now() - 14 * 86400000).toISOString();
    const { count } = await supabase.from("analytics_events").select("id", { count: "exact", head: true }).gte("created_at", desde);
    poner(19, "Analítica propia", (count ?? 0) > 0 ? "ok" : "aviso", `${count ?? 0} eventos en los últimos 14 días (la tienda usa analítica propia con consentimiento, no GA4).`);
  } catch {
    poner(19, "Analítica propia", "aviso", "No se pudo leer.");
  }

  for (const m of MANUALES) poner(m.n, m.nombre, "manual", m.detalle);
  puntos.sort((a, b) => a.n - b.n);

  const cuenta = (e: Estado) => puntos.filter((p) => p.estado === e).length;
  const fallos = cuenta("fallo");
  const avisos = cuenta("aviso");
  const ok = cuenta("ok");
  const manuales = cuenta("manual");
  const resumen = fallos || avisos ? `${fallos} fallo(s) y ${avisos} aviso(s): ${puntos.filter((p) => p.estado === "fallo" || p.estado === "aviso").map((p) => p.nombre).join(", ")}.` : `Todo en orden en los ${ok} puntos que se miden solos.`;

  const { error } = await supabase.from("auditorias_web").insert({
    origen: "automatica",
    resumen,
    ok,
    avisos,
    fallos,
    manuales,
    duracion_ms: Date.now() - inicio,
    resultado: puntos,
  });
  if (error) console.error("auditoria-web: no se pudo guardar el registro:", error);

  res.status(200).json({ ok: !error, resumen, fallos, avisos, manuales, guardado: !error });
}
