/**
 * api/compartir.ts
 *
 * Qué hace: vista previa de un producto al compartir su enlace (WhatsApp, Instagram,
 * Telegram, Facebook, X…). Esas apps no ejecutan la web: leen las etiquetas «og:» del HTML.
 * Como la tienda es una web estática, vercel.json manda aquí SOLO a sus lectores de enlaces
 * (por su User-Agent) cuando piden /producto/<id>; las personas siguen viendo la ficha normal.
 * Devuelve un HTML mínimo con título, precio, la frase de garantía y la foto de portada, y si
 * alguien llega a abrirlo, lo lleva a la ficha.
 *
 * Datos: solo lo público (clave anónima y RLS): un producto oculto o vendido no se enseña.
 * La foto pasa por el optimizador de imágenes de Vercel (1280 px) para que pese poco.
 *
 * Variables: EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY (las de la web).
 * Conectado con: vercel.json (rewrite con «has» user-agent e images.remotePatterns),
 * app/producto/[id].tsx (botón Compartir).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DOMINIO = "https://videojuegoszaragoza.com";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Precio siempre con dos decimales, coma decimal y miles con punto (155,00€ · 1.299,00€).
function fmtEUR(value: number) {
  const v = Number(value);
  const cents = Math.round((Number.isFinite(v) ? v : 0) * 100);
  const [ent, dec] = (Math.abs(cents) / 100).toFixed(2).split(".");
  return `${cents < 0 ? "-" : ""}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}€`;
}

function pagina(o: { titulo: string; descripcion: string; imagen: string | null; url: string; precio?: number }): string {
  const t = escapar(o.titulo);
  const d = escapar(o.descripcion);
  const u = escapar(o.url);
  const img = o.imagen ? escapar(o.imagen) : "";
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${u}">
<meta property="og:site_name" content="VideojuegosZaragoza">
<meta property="og:type" content="product">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${u}">
${img ? `<meta property="og:image" content="${img}">\n<meta property="og:image:alt" content="${t}">` : ""}
${o.precio !== undefined ? `<meta property="product:price:amount" content="${o.precio.toFixed(2)}">\n<meta property="product:price:currency" content="EUR">` : ""}
<meta name="twitter:card" content="${img ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
${img ? `<meta name="twitter:image" content="${img}">` : ""}
<meta http-equiv="refresh" content="0;url=${u}">
</head>
<body style="font-family:system-ui,sans-serif;text-align:center;padding:40px 16px;color:#0B2138;background:#FFFFFF">
<p><a href="${u}" style="color:#1EA7E8;font-weight:800">${t}</a></p>
</body>
</html>`;
}

async function portada(supabase: SupabaseClient, id: string, images: unknown): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("product_media")
      .select("public_url,kind,is_cover,sort_order")
      .eq("product_id", id)
      .eq("kind", "image")
      .order("is_cover", { ascending: false })
      .order("sort_order", { ascending: true })
      .limit(1);
    const url = (data as { public_url: string | null }[] | null)?.[0]?.public_url;
    if (url) return url;
  } catch {
    // sin product_media: se prueba con products.images
  }
  const lista = Array.isArray(images) ? images : [];
  const primera = lista.find((v): v is string => typeof v === "string" && v.startsWith("https://"));
  return primera ?? null;
}

export default async function handler(req: any, res: any) {
  const id = String(req.query?.id ?? "").trim();
  const urlFicha = UUID_RE.test(id) ? `${DOMINIO}/producto/${id.toLowerCase()}` : `${DOMINIO}/catalogo`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  const generica = () =>
    pagina({ titulo: "VideojuegosZaragoza", descripcion: "Consolas, videojuegos y accesorios en Zaragoza.", imagen: null, url: urlFicha });

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!UUID_RE.test(id) || !supabaseUrl || !anon) {
    res.setHeader("Cache-Control", "public, s-maxage=300");
    res.status(200).send(generica());
    return;
  }

  try {
    const supabase = createClient(supabaseUrl, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data } = await supabase
      .from("products")
      .select("id,title,price_eur,description,images")
      .eq("id", id)
      .eq("status", "PUBLISHED")
      .eq("is_active", true)
      .maybeSingle<{ id: string; title: string; price_eur: number | string | null; description: string | null; images: unknown }>();

    if (!data?.title) {
      res.setHeader("Cache-Control", "public, s-maxage=300");
      res.status(200).send(generica());
      return;
    }

    const precio = Number(data.price_eur ?? 0);
    const foto = await portada(supabase, data.id, data.images);
    // Primeras frases de la descripción (p. ej. «Estado Funcional : 10 / 10 · 1 Año de GARANTÍA.»).
    const frases = String(data.description ?? "")
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(" · ")
      .slice(0, 200);
    const html = pagina({
      titulo: `${data.title.trim()} · ${fmtEUR(precio)}`,
      descripcion: frases || "Disponible en VideojuegosZaragoza.",
      imagen: foto ? `${DOMINIO}/_vercel/image?url=${encodeURIComponent(foto)}&w=1280&q=75` : null,
      url: urlFicha,
      precio: Number.isFinite(precio) ? precio : undefined,
    });
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
    res.status(200).send(html);
  } catch (e) {
    console.error("compartir: error", e);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(generica());
  }
}
