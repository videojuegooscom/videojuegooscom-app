/**
 * pruebas/actualizacion-automatica.mjs — la tienda abierta en segundo plano se actualiza sola al volver a ella.
 *
 * Qué hace: abre la tienda compilada (carpeta dist) en un navegador (Chromium, móvil 390×844) y SIMULA que la persona
 * deja la tienda en segundo plano y vuelve (cambia document.visibilityState y adelanta el reloj, sin esperar de
 * verdad). La portada «publicada» que ve la tienda al comprobar versiones se simula: unas veces igual y otras con un
 * archivo «entry-<huella>.js» distinto (= hay publicación nueva). Cualquier escritura a la base de datos se corta.
 * Comprueba (en app/_layout.tsx):
 *  A) Ya está la última versión: al volver no se recarga (y sí se comprobó la portada).
 *  B) Hay versión nueva pero estuvo fuera menos de 30 s: no se recarga.
 *  C) Hay versión nueva y estuvo fuera 30 s o más, en Inicio: se recarga SOLA; si vuelve a irse y volver al momento
 *     no se recarga otra vez (máximo una cada 10 min) y pasados 10 min sí.
 *  D) Hay versión nueva pero está en /vender (formulario): no se recarga.
 *  E) Hay versión nueva pero hay texto escrito en el buscador: no se recarga.
 *  F) Si la portada no responde (error 500) no se recarga ni se rompe nada.
 * NO toca producción: no hay peticiones a ningún servidor que no sea el de esta prueba (las lecturas de Supabase se
 * simulan vacías).
 *
 * Uso: node pruebas/actualizacion-automatica.mjs [carpeta_dist]     (por defecto dist)
 * Requisitos: playwright-core (PR #52) y npm run build hecho.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright-core";

const raiz = resolve(process.argv[2] ?? "dist");
if (!existsSync(join(raiz, "index.html"))) {
  console.error(`FALLO ${raiz} no tiene index.html: ¿has hecho npm run build?`);
  process.exit(1);
}
const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".svg": "image/svg+xml", ".ttf": "font/ttf",
  ".woff": "font/woff", ".woff2": "font/woff2", ".webp": "image/webp", ".txt": "text/plain; charset=utf-8",
};
const buscar = (ruta) => {
  const limpia = normalize(decodeURIComponent(ruta)).replace(/^(\.\.[/\\])+/, "");
  for (const c of [limpia, `${limpia}.html`, join(limpia, "index.html")]) {
    const p = join(raiz, c);
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
};
const servidor = createServer((req, res) => {
  const ruta = (req.url ?? "/").split("?")[0];
  if (ruta.startsWith("/api/")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
    return;
  }
  const p = ruta === "/" ? join(raiz, "index.html") : buscar(ruta);
  if (p) {
    res.writeHead(200, { "content-type": TIPOS[extname(p)] ?? "application/octet-stream" });
    res.end(readFileSync(p));
  } else {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("No encontrado");
  }
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
const BASE = `http://127.0.0.1:${servidor.address().port}`;

const fallos = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "OK   " : "FALLO"} ${msg}`);
  if (!cond) fallos.push(msg);
};

const ENTRADA_RE = /_expo\/static\/js\/web\/entry-[A-Za-z0-9]+\.js/;
const HTML_REAL = readFileSync(join(raiz, "index.html"), "utf8");
const ENTRADA_REAL = HTML_REAL.match(ENTRADA_RE)?.[0];
if (!ENTRADA_REAL) {
  console.error("FALLO la portada compilada no lleva ningún «entry-<huella>.js»: la comprobación de versión no tendría qué comparar");
  process.exit(1);
}
const HTML_NUEVA = HTML_REAL.replace(ENTRADA_REAL, "_expo/static/js/web/entry-ffffffffffffffffffffffffffffffff.js");

// Lo que «publica» la portada simulada: "igual" (la misma versión), "nueva" (otra huella) o "error" (500).
const portada = { modo: "igual", comprobaciones: 0 };

async function contexto(navegador) {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "es-ES" });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("videojuegoos.analytics.consent", "declined");
      localStorage.setItem("videojuegoszaragoza:guia_vista", "1");
    } catch {
      // sin almacenamiento
    }
    // Reloj adelantable y visibilidad controlada a mano: así no hay que esperar 30 s ni 10 min de verdad.
    const real = Date.now.bind(Date);
    let desfase = 0;
    Date.now = () => real() + desfase;
    window.__avanzar = (ms) => {
      desfase += ms;
    };
    let visibilidad = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibilidad });
    window.__visibilidad = (v) => {
      visibilidad = v;
      document.dispatchEvent(new Event("visibilitychange"));
    };
  });
  // La comprobación de versión es un fetch a «/»; la carga normal de la página (document) pasa tal cual.
  await ctx.route((url) => url.origin === BASE && url.pathname === "/", (r) => {
    if (r.request().resourceType() !== "fetch") return r.continue();
    portada.comprobaciones += 1;
    if (portada.modo === "error") return r.fulfill({ status: 500, contentType: "text/plain", body: "error" });
    return r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: portada.modo === "nueva" ? HTML_NUEVA : HTML_REAL });
  });
  await ctx.route("**/rest/v1/**", (r) => {
    const m = r.request().method();
    if (m === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    if (!["GET", "HEAD"].includes(m)) return r.abort();
    return r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "[]" });
  });
  await ctx.route("**/auth/v1/**", (r) => r.abort());
  return ctx;
}

// Abre una ruta y espera a que la tienda esté montada (el efecto de _layout.tsx ya tiene sus oyentes).
async function abrir(ctx, ruta) {
  const p = await ctx.newPage();
  p.errores = [];
  p.on("pageerror", (e) => p.errores.push(String(e.message ?? e)));
  await p.goto(`${BASE}${ruta}`, { waitUntil: "load", timeout: 60000 });
  await p.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  if (ruta === "/") await p.locator("#buscador-flotante").waitFor({ timeout: 40000 });
  else await p.waitForTimeout(3500);
  await p.evaluate(() => {
    window.__marca = "sin recargar";
  });
  return p;
}

// Se va y vuelve tras `ms` milisegundos de «ausencia». Devuelve true si la página se recargó sola.
async function irseYVolver(p, ms) {
  const recargada = p.waitForEvent("load", { timeout: 3500 }).then(() => true, () => false);
  await p.evaluate((fuera) => {
    window.__visibilidad("hidden");
    window.__avanzar(fuera);
    window.__visibilidad("visible");
  }, ms);
  return recargada;
}

const navegador = await chromium.launch();
try {
  // A) Ya está la última versión.
  {
    const ctx = await contexto(navegador);
    portada.modo = "igual";
    portada.comprobaciones = 0;
    const p = await abrir(ctx, "/");
    const recargo = await irseYVolver(p, 40_000);
    ok(!recargo, "A: con la última versión publicada, al volver no se recarga");
    ok(portada.comprobaciones >= 1, `A: al volver se comprobó la portada publicada (${portada.comprobaciones} comprobaciones)`);
    await ctx.close();
  }

  // B) Versión nueva pero fuera poco rato.
  {
    const ctx = await contexto(navegador);
    portada.modo = "nueva";
    const p = await abrir(ctx, "/");
    const recargo = await irseYVolver(p, 10_000);
    ok(!recargo, "B: con versión nueva pero solo 10 s fuera, no se recarga");
    await ctx.close();
  }

  // C) Versión nueva, fuera 40 s, en Inicio: se recarga sola; no dos veces seguidas; sí pasados 10 min.
  {
    const ctx = await contexto(navegador);
    portada.modo = "nueva";
    const p = await abrir(ctx, "/");
    const recargo = await irseYVolver(p, 40_000);
    ok(recargo, "C: con versión nueva y 40 s fuera, en Inicio, la tienda se recarga sola");
    if (recargo) {
      await p.locator("#buscador-flotante").waitFor({ timeout: 40000 });
      await p.waitForTimeout(1500);
      const marca = await p.evaluate(() => window.__marca ?? null);
      ok(marca === null, "C: tras recargar la página es una carga nueva (se perdió la marca de la anterior)");
      await p.evaluate(() => {
        window.__marca = "sin recargar";
      });
      const otra = await irseYVolver(p, 40_000);
      ok(!otra, "C: si se va y vuelve enseguida otra vez, no se recarga de nuevo (máximo una cada 10 min)");
      const tras10 = await irseYVolver(p, 11 * 60_000);
      ok(tras10, "C: pasados 10 min, con versión nueva, sí se recarga otra vez");
    }
    ok(p.errores.length === 0, `C: sin errores de la página (${p.errores.slice(0, 2).join(" | ")})`);
    await ctx.close();
  }

  // D) Versión nueva, fuera 40 s, pero en el formulario de Vender.
  {
    const ctx = await contexto(navegador);
    portada.modo = "nueva";
    const p = await abrir(ctx, "/vender");
    portada.comprobaciones = 0;
    const recargo = await irseYVolver(p, 40_000);
    ok(!recargo && portada.comprobaciones >= 1, `D: en /vender (formulario) se comprueba la versión pero no se recarga (${portada.comprobaciones} comprobaciones)`);
    await ctx.close();
  }

  // E) Versión nueva, fuera 40 s, con texto escrito en el buscador.
  {
    const ctx = await contexto(navegador);
    portada.modo = "nueva";
    const p = await abrir(ctx, "/");
    const campo = p.getByRole("textbox", { name: /^Buscar/ });
    await campo.click();
    await campo.fill("consola");
    const escrito = await campo.inputValue();
    portada.comprobaciones = 0;
    const recargo = await irseYVolver(p, 40_000);
    ok(escrito === "consola" && !recargo && portada.comprobaciones >= 1, `E: con texto escrito se comprueba la versión pero no se recarga (${portada.comprobaciones} comprobaciones)`);
    await ctx.close();
  }

  // F) La portada no responde.
  {
    const ctx = await contexto(navegador);
    portada.modo = "error";
    const p = await abrir(ctx, "/");
    const recargo = await irseYVolver(p, 40_000);
    ok(!recargo && p.errores.length === 0, `F: si la portada da error 500 no se recarga ni salta ningún fallo (${p.errores.slice(0, 2).join(" | ")})`);
    await ctx.close();
  }
} catch (e) {
  fallos.push(`la prueba se cortó: ${String(e.stack ?? e).slice(0, 900)}`);
} finally {
  await navegador.close();
  servidor.close();
}

for (const f of fallos) console.log(`FALLO ${f}`);
console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
process.exit(fallos.length ? 1 : 0);
