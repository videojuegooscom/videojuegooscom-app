// scripts/inject-seo-html.js
/**
 * Qué hace: después de "expo export --platform web" (carpeta dist/), escribe
 * el título y la descripción de Marca y SEO (tabla site_settings, editada
 * desde app/admin/marca-seo.tsx) DIRECTAMENTE dentro de cada archivo .html
 * exportado — antes de que Vercel lo sirva.
 *
 * Por qué hace falta esto (y por qué components/SiteHead.tsx NO era
 * suficiente): SiteHead.tsx pone el título/descripción con JavaScript, una
 * vez la app ya ha arrancado en el navegador. Eso funciona perfecto para
 * cualquier visitante humano y para Google en su segunda pasada (cuando
 * ejecuta el JavaScript de la página) — pero el HTML que Vercel sirve tal
 * cual, ANTES de que se ejecute nada, tenía el título completamente VACÍO
 * (<title data-rh="true"></title>) y sin ninguna etiqueta de descripción.
 * Esa es la versión que Google guarda primero y la que tarda mucho más en
 * "refrescar" con el resultado de ejecutar JavaScript — normalmente días o
 * semanas, y a veces Google directamente decide no renderizar todas las
 * páginas. Con este script, el título y la descripción correctos ya están
 * escritos en el propio HTML desde el primer segundo, en cuanto Daniel
 * guarda cambios en Marca y SEO y vuelve a desplegar.
 *
 * Cuándo se ejecuta: automáticamente, como parte de "vercel-build" (ver
 * package.json) — es decir, en cada despliegue normal en Vercel, sin ningún
 * paso manual adicional para Daniel.
 *
 * Si algo falla (sin conexión, tabla vacía, variables de entorno ausentes...)
 * este script NUNCA debe romper el despliegue: avisa por consola y termina
 * sin tocar los archivos, dejando el HTML tal y como lo generó Expo.
 *
 * Conectado con:
 * - app/admin/marca-seo.tsx → desde donde Daniel edita seo_title,
 *   seo_description y logo_url en la tabla "site_settings".
 * - components/SiteHead.tsx → hace lo mismo pero con JavaScript, en el
 *   navegador, para cuando el visitante ya está usando la app (por ejemplo,
 *   al navegar de una pantalla a otra sin recargar).
 * - package.json → "vercel-build" ejecuta este script justo después de
 *   generar dist/.
 */
const fs = require("fs");
const path = require("path");

const DIST_DIR = path.join(__dirname, "..", "dist");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function listHtmlFiles(dir) {
  let results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(listHtmlFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      results.push(full);
    }
  }
  return results;
}

async function fetchSiteSettings() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.warn(
      "[inject-seo-html] Faltan EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY: se deja el HTML tal cual."
    );
    return null;
  }

  const endpoint = `${url.replace(/\/+$/, "")}/rest/v1/site_settings?id=eq.1&select=seo_title,seo_description,logo_url`;

  const res = await fetch(endpoint, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });

  if (!res.ok) {
    console.warn(`[inject-seo-html] Supabase respondió ${res.status}: se deja el HTML tal cual.`);
    return null;
  }

  const rows = await res.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) {
    console.warn("[inject-seo-html] No hay fila en site_settings: se deja el HTML tal cual.");
    return null;
  }

  return {
    title: String(row.seo_title ?? "").trim(),
    description: String(row.seo_description ?? "").trim(),
    logoUrl: String(row.logo_url ?? "").trim(),
  };
}

function applyToHtml(html, settings) {
  let out = html;
  const { title, description, logoUrl } = settings;

  if (title) {
    const safeTitle = escapeHtml(title);
    if (/<title[^>]*>[\s\S]*?<\/title>/.test(out)) {
      out = out.replace(/<title[^>]*>[\s\S]*?<\/title>/, `<title data-rh="true">${safeTitle}</title>`);
    } else {
      out = out.replace("<head>", `<head><title data-rh="true">${safeTitle}</title>`);
    }
    if (/<meta property="og:title"[^>]*>/.test(out)) {
      out = out.replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${safeTitle}"/>`);
    } else {
      out = out.replace("</title>", `</title><meta property="og:title" content="${safeTitle}"/>`);
    }
  }

  if (description) {
    const safeDescription = escapeHtml(description);
    if (/<meta name="description"[^>]*>/.test(out)) {
      out = out.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${safeDescription}"/>`);
    } else {
      out = out.replace("</title>", `</title><meta name="description" content="${safeDescription}"/>`);
    }
    if (/<meta property="og:description"[^>]*>/.test(out)) {
      out = out.replace(
        /<meta property="og:description"[^>]*>/,
        `<meta property="og:description" content="${safeDescription}"/>`
      );
    } else {
      out = out.replace("</title>", `</title><meta property="og:description" content="${safeDescription}"/>`);
    }
  }

  if (logoUrl) {
    const safeLogoUrl = escapeHtml(logoUrl);
    if (/<link rel="icon"[^>]*>/.test(out)) {
      out = out.replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="${safeLogoUrl}"/>`);
    }
    if (/<link rel="apple-touch-icon"[^>]*>/.test(out)) {
      out = out.replace(/<link rel="apple-touch-icon"[^>]*>/, `<link rel="apple-touch-icon" href="${safeLogoUrl}"/>`);
    } else {
      out = out.replace("</head>", `<link rel="apple-touch-icon" href="${safeLogoUrl}"/></head>`);
    }
    if (/<meta property="og:image"[^>]*>/.test(out)) {
      out = out.replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${safeLogoUrl}"/>`);
    } else {
      out = out.replace("</head>", `<meta property="og:image" content="${safeLogoUrl}"/></head>`);
    }
  }

  return out;
}

async function main() {
  try {
    const settings = await fetchSiteSettings();
    if (!settings || (!settings.title && !settings.description && !settings.logoUrl)) {
      console.warn("[inject-seo-html] Nada que aplicar todavía: se deja el HTML tal cual.");
      return;
    }

    const files = listHtmlFiles(DIST_DIR);
    if (files.length === 0) {
      console.warn(`[inject-seo-html] No se encontró ningún .html en ${DIST_DIR}.`);
      return;
    }

    let changed = 0;
    for (const file of files) {
      const original = fs.readFileSync(file, "utf8");
      const updated = applyToHtml(original, settings);
      if (updated !== original) {
        fs.writeFileSync(file, updated, "utf8");
        changed += 1;
      }
    }

    console.log(`[inject-seo-html] Título/descripción de Marca y SEO aplicados en ${changed}/${files.length} archivos HTML.`);
  } catch (e) {
    console.warn("[inject-seo-html] Error inesperado, se deja el HTML tal cual:", e && e.message ? e.message : e);
  }
}

main();
