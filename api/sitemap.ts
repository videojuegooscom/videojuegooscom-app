/**
 * api/sitemap.ts
 *
 * Qué hace: genera /sitemap.xml (vercel.json lo redirige aquí) con las páginas públicas de la
 * tienda: portada, catálogo, servicios, blog, vender, las políticas y cada ficha de producto y de
 * servicio publicada. Los buscadores lo usan para descubrir las fichas, que en la web no son
 * enlaces normales. robots.txt (public/) apunta a este archivo.
 *
 * Datos: solo lo público (clave anónima y RLS): lo oculto, sin publicar o vendido no aparece.
 * Se guarda una hora en la caché de Vercel (s-maxage) para no consultar la base de datos en cada
 * visita del rastreador.
 *
 * Variables: EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY (las de la web).
 * Conectado con: vercel.json (rewrite /sitemap.xml), public/robots.txt.
 */
import { createClient } from "@supabase/supabase-js";

const DOMINIO = "https://videojuegoszaragoza.com";

const PAGINAS_FIJAS: { ruta: string; prioridad: string; cambio: string }[] = [
  { ruta: "/", prioridad: "1.0", cambio: "daily" },
  { ruta: "/catalogo", prioridad: "0.9", cambio: "daily" },
  { ruta: "/servicios", prioridad: "0.8", cambio: "weekly" },
  { ruta: "/vender", prioridad: "0.8", cambio: "monthly" },
  { ruta: "/blog", prioridad: "0.6", cambio: "weekly" },
  { ruta: "/quienes-somos", prioridad: "0.7", cambio: "monthly" },
  { ruta: "/politicas/envios", prioridad: "0.4", cambio: "monthly" },
  { ruta: "/politicas/devoluciones", prioridad: "0.4", cambio: "monthly" },
  { ruta: "/politicas/privacidad", prioridad: "0.3", cambio: "yearly" },
  { ruta: "/politicas/terminos", prioridad: "0.3", cambio: "yearly" },
  { ruta: "/politicas/normas-foro", prioridad: "0.3", cambio: "yearly" },
];

function escapar(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function fecha(valor: unknown): string | null {
  const d = new Date(String(valor ?? ""));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function entrada(ruta: string, prioridad: string, cambio: string, ultima?: string | null): string {
  return `  <url>\n    <loc>${escapar(DOMINIO + ruta)}</loc>${ultima ? `\n    <lastmod>${ultima}</lastmod>` : ""}\n    <changefreq>${cambio}</changefreq>\n    <priority>${prioridad}</priority>\n  </url>`;
}

export default async function handler(_req: any, res: any) {
  const entradas = PAGINAS_FIJAS.map((p) => entrada(p.ruta, p.prioridad, p.cambio));

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const clave = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (url && clave) {
    try {
      const supabase = createClient(url, clave);
      const [productos, servicios] = await Promise.all([
        supabase.from("products").select("id,updated_at").eq("status", "PUBLISHED").eq("is_active", true).order("updated_at", { ascending: false }).limit(2000),
        supabase.from("services").select("id,updated_at").eq("is_active", true).limit(500),
      ]);
      for (const p of Array.isArray(productos.data) ? productos.data : []) {
        entradas.push(entrada(`/producto/${p.id}`, "0.7", "weekly", fecha(p.updated_at)));
      }
      for (const s of Array.isArray(servicios.data) ? servicios.data : []) {
        entradas.push(entrada(`/servicio/${s.id}`, "0.6", "monthly", fecha(s.updated_at)));
      }
    } catch (e) {
      // Sin base de datos se devuelven al menos las páginas fijas.
      console.error("sitemap: error leyendo productos o servicios:", e);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entradas.join("\n")}\n</urlset>\n`;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).send(xml);
}
