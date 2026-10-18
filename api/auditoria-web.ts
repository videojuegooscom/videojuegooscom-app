/**
 * api/auditoria-web.ts
 *
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

export default async function handler(req: any, res: any) {
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
