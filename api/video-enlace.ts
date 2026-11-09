/**
 * api/video-enlace.ts
 *
 * Qué hace: convierte un enlace CORTO de TikTok o Instagram (el que copian sus apps con «Compartir → Copiar enlace»:
 * vm.tiktok.com/…, vt.tiktok.com/…, tiktok.com/t/…, instagram.com/share/…) en el enlace largo del vídeo, que es el que
 * lleva su número y permite enseñarlo en «Nuestros Servicios» (dueño, 2026-11-09: «no me deja añadir el enlace del vídeo
 * de Instagram y TikTok»). El navegador no puede seguir esas redirecciones él solo (las redes no lo permiten).
 *
 * Cómo funciona: GET /api/video-enlace?url=<enlace corto> → { url: <enlace largo> } o 400. Solo sigue redirecciones
 * (como mucho 5) y solo entre direcciones https de tiktok.com e instagram.com; no descarga ni devuelve el contenido de
 * ninguna página, así que no sirve para pedir nada a otros sitios.
 *
 * Conectado con: app/admin/services.tsx (editor de vídeos, al guardar), app/servicios.tsx (enlaceVideo).
 */

const PERMITIDO = /^https:\/\/((www|m|vm|vt)\.)?(tiktok\.com|instagram\.com)(\/|$)/i;
// Enlaces cortos que hay que seguir (el resto ya son largos o no son de vídeo).
const CORTO = /^https:\/\/((vm|vt)\.tiktok\.com\/|(www\.|m\.)?tiktok\.com\/t\/|(www\.)?instagram\.com\/share\/)/i;

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "public, s-maxage=86400");
  const inicial = String(req.query?.url ?? "").trim();
  if (!CORTO.test(inicial) || inicial.length > 300) {
    res.status(400).json({ error: "Solo enlaces cortos de TikTok o Instagram." });
    return;
  }
  let actual = inicial;
  try {
    for (let i = 0; i < 5; i++) {
      const r = await fetch(actual, {
        method: "GET",
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148" },
        signal: AbortSignal.timeout(6000),
      });
      const destino = r.headers.get("location");
      // Sin más redirecciones: este es el enlace largo (no se lee su contenido).
      if (r.status < 300 || r.status >= 400 || !destino) break;
      const siguiente = new URL(destino, actual).toString();
      if (!PERMITIDO.test(siguiente)) break;
      actual = siguiente;
      if (!CORTO.test(actual)) break;
    }
  } catch {
    // red o tiempo agotado: se devuelve lo conseguido hasta aquí
  }
  if (actual === inicial) {
    res.status(400).json({ error: "No se ha podido abrir el enlace." });
    return;
  }
  // Sin los parámetros de seguimiento de la red (?_r=…, ?igsh=…).
  const limpio = actual.split("?")[0];
  res.status(200).json({ url: limpio });
}
