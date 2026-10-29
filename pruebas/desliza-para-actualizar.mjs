/**
 * pruebas/desliza-para-actualizar.mjs — «Desliza para actualizar» con la mascota (components/TirarParaActualizar.tsx).
 *
 * Qué hace: abre la tienda compilada (carpeta dist) en un móvil táctil (Chromium, 390 × 844) y desliza con un dedo
 * de verdad (eventos táctiles del navegador). Supabase se SIMULA (listas vacías y una ficha de producto) y se
 * cuentan sus peticiones; las fotos se sustituyen por una imagen falsa (no gasta la cuota de Supabase) y cualquier
 * escritura se corta. Comprueba:
 *  A) Inicio: deslizar poco enseña la mascota con «Desliza para actualizar» y, al soltar, no recarga nada.
 *  B) Inicio: deslizar más dice «Suelta para actualizar»; al soltar dice «Actualizando…», vuelve a pedir los
 *     productos SIN recargar la página, y el aviso desaparece.
 *  C) Un gesto horizontal (carrusel) o con la pantalla ya desplazada hacia abajo no hace nada.
 *  D) En Vender (formulario) el gesto no hace nada.
 *  E) Ficha de producto: vuelve a pedir el producto sin volver a la pantalla de carga.
 *  F) Mi cuenta (no recarga por partes): se recarga la página entera; con texto escrito, no.
 *  G) Sin errores de la página.
 *
 * Uso: node pruebas/desliza-para-actualizar.mjs [carpeta_dist]     (por defecto dist)
 * Requisitos: playwright-core y npm run build hecho.
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
const DINAMICAS = [[/^\/producto\/[^/]+$/, "producto/[id].html"]];
const buscar = (ruta) => {
  const limpia = normalize(decodeURIComponent(ruta)).replace(/^(\.\.[/\\])+/, "");
  for (const c of [limpia, `${limpia}.html`, join(limpia, "index.html")]) {
    const p = join(raiz, c);
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  for (const [re, destino] of DINAMICAS) {
    const p = join(raiz, destino);
    if (re.test(ruta) && existsSync(p)) return p;
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

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
const ID_PRODUCTO = "00000000-0000-4000-8000-0000000000d1";
const PRODUCTO = {
  id: ID_PRODUCTO, title: "Consola de prueba deslizar", description: "Texto", price_eur: 120, status: "PUBLISHED", is_active: true,
  category_id: null, images: [], updated_at: "2026-10-29T10:00:00Z", created_at: "2026-10-29T10:00:00Z", condition: "GOOD",
  like_count: 0, reference: null, category: null, caracteristicas: [],
};
const peticiones = { productos: 0, ficha: 0 };

async function contexto(navegador) {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: "es-ES" });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("videojuegoszaragoza:guia_vista", "1");
      localStorage.setItem("videojuegoos.analytics.consent", "declined");
    } catch {
      // sin almacenamiento
    }
  });
  // Fotos falsas: nunca se descarga nada del almacenamiento de Supabase.
  await ctx.route((u) => u.pathname.startsWith("/storage/v1/") || u.pathname === "/_vercel/image", (r) =>
    r.fulfill({ status: 200, contentType: "image/png", body: PNG })
  );
  await ctx.route("**/auth/v1/**", (r) => r.abort());
  await ctx.route("**/rest/v1/**", (r) => {
    const req = r.request();
    const url = new URL(req.url());
    if (req.method() === "OPTIONS") return r.fulfill({ status: 204, headers: CORS });
    if (req.method() !== "GET" && req.method() !== "HEAD") return r.abort();
    if (url.pathname.endsWith("/products")) {
      peticiones.productos += 1;
      if (url.searchParams.get("id") === `eq.${ID_PRODUCTO}`) {
        peticiones.ficha += 1;
        return r.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify([PRODUCTO]) });
      }
    }
    return r.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: "[]" });
  });
  return ctx;
}

// Un dedo de verdad: empieza en (x, y), baja `dy` píxeles (o se mueve `dx` en horizontal) en pasos y, si se pide, suelta.
// Con soltar=false devuelve también `levantar()` para soltar después (el mismo dedo, la misma sesión).
async function deslizar(p, { x = 195, y = 420, dy = 0, dx = 0, soltar = true } = {}) {
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 14; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (dx * i) / 14, y: y + (dy * i) / 14 }] });
    await p.waitForTimeout(16);
  }
  await p.waitForTimeout(120);
  const textoAntes = await textoAviso(p);
  const levantar = async () => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
  };
  if (soltar) {
    await levantar();
    return textoAntes;
  }
  return { texto: textoAntes, levantar };
}
const textoAviso = (p) => p.evaluate(() => document.getElementById("tirar-para-actualizar")?.innerText?.trim() ?? null);
const conMascota = (p) => p.evaluate(() => !!document.querySelector("#tirar-para-actualizar img"));
async function esperarSinAviso(p, ms = 9000) {
  return p.waitForFunction(() => !document.getElementById("tirar-para-actualizar"), null, { timeout: ms }).then(() => true, () => false);
}
async function abrir(ctx, ruta, esperar) {
  const p = await ctx.newPage();
  p.errores = [];
  p.on("pageerror", (e) => p.errores.push(String(e.message ?? e)));
  await p.goto(`${BASE}${ruta}`, { waitUntil: "load", timeout: 60000 });
  await esperar(p);
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    window.__marca = "sin recargar";
  });
  return p;
}

const navegador = await chromium.launch();
try {
  const ctx = await contexto(navegador);

  // A y B) Inicio
  const inicio = await abrir(ctx, "/", (p) => p.locator("#buscador-flotante").waitFor({ timeout: 40000 }));
  let antes = peticiones.productos;
  const poco = await deslizar(inicio, { dy: 90 });
  ok(poco === "Desliza para actualizar", `A: deslizando poco sale «Desliza para actualizar» (${poco})`);
  await inicio.waitForTimeout(800);
  ok((await textoAviso(inicio)) === null && peticiones.productos === antes, "A: al soltar antes del umbral no se recarga nada y el aviso se va");

  antes = peticiones.productos;
  const mucho = await deslizar(inicio, { dy: 260, soltar: false });
  ok(mucho.texto === "Suelta para actualizar", `B: deslizando más sale «Suelta para actualizar» (${mucho.texto})`);
  ok(await conMascota(inicio), "B: el aviso lleva la mascota de la tienda");
  const solape = await inicio.evaluate(() => {
    const aviso = document.getElementById("tirar-para-actualizar")?.getBoundingClientRect();
    const barra = document.getElementById("buscador-flotante")?.getBoundingClientRect();
    return aviso && barra ? Math.round(barra.bottom - aviso.top) : null;
  });
  ok(solape !== null && solape <= 0, `B: la mascota sale debajo de la barra de búsqueda, sin taparla (solape ${solape} px)`);
  await mucho.levantar();
  await inicio.waitForTimeout(250);
  const durante = await textoAviso(inicio);
  ok(durante === "Actualizando…" || durante === "¡Actualizado!", `B: al soltar dice «Actualizando…» (${durante})`);
  ok(await esperarSinAviso(inicio), "B: el aviso desaparece al terminar");
  ok(peticiones.productos > antes, `B: se vuelven a pedir los productos (${peticiones.productos - antes} peticiones)`);
  ok((await inicio.evaluate(() => window.__marca)) === "sin recargar", "B: sin recargar la página entera");
  // El contenedor que se desliza (el mayor con scroll vertical) vuelve a su sitio: sin transform puesto por el gesto.
  const transform = await inicio.evaluate(() => {
    const cajas = Array.from(document.querySelectorAll("div")).filter((d) => {
      const s = getComputedStyle(d).overflowY;
      return (s === "auto" || s === "scroll") && d.scrollHeight > d.clientHeight + 1;
    });
    return cajas.map((d) => d.style.transform).filter(Boolean);
  });
  ok(transform.length === 0, `B: el contenido vuelve a su sitio (sin desplazamientos colgados: ${JSON.stringify(transform)})`);

  // C) Horizontal y con la pantalla desplazada
  const horizontal = await deslizar(inicio, { dy: 30, dx: 200 });
  ok(horizontal === null, "C: un gesto horizontal no saca el aviso");
  await inicio.evaluate(() => {
    const cajas = Array.from(document.querySelectorAll("div")).filter((d) => {
      const s = getComputedStyle(d).overflowY;
      return (s === "auto" || s === "scroll") && d.scrollHeight > d.clientHeight + 1;
    });
    cajas.sort((a, b) => b.clientHeight - a.clientHeight);
    if (cajas[0]) cajas[0].scrollTop = 400;
  });
  await inicio.waitForTimeout(300);
  const desplazada = await deslizar(inicio, { dy: 260 });
  ok(desplazada === null, "C: con la pantalla desplazada hacia abajo, deslizar no saca el aviso (solo hace scroll)");
  ok(inicio.errores.length === 0, `G: Inicio sin errores (${inicio.errores.slice(0, 2).join(" | ")})`);
  await inicio.close();

  // D) Vender
  const vender = await abrir(ctx, "/vender", (p) => p.waitForLoadState("networkidle").catch(() => {}));
  const enVender = await deslizar(vender, { dy: 260 });
  ok(enVender === null && (await vender.evaluate(() => window.__marca)) === "sin recargar", "D: en Vender el gesto no hace nada");
  await vender.close();

  // E) Ficha de producto
  const ficha = await abrir(ctx, `/producto/${ID_PRODUCTO}`, (p) => p.getByText("Consola de prueba deslizar").first().waitFor({ timeout: 40000 }));
  antes = peticiones.ficha;
  const enFicha = await deslizar(ficha, { dy: 260 });
  ok(enFicha === "Suelta para actualizar", `E: en la ficha sale «Suelta para actualizar» (${enFicha})`);
  await ficha.waitForTimeout(300);
  const tituloVisible = await ficha.getByText("Consola de prueba deslizar").first().isVisible();
  ok(tituloVisible, "E: mientras se actualiza, la ficha sigue a la vista (sin pantalla de carga)");
  ok(await esperarSinAviso(ficha), "E: el aviso desaparece al terminar");
  ok(peticiones.ficha > antes && (await ficha.evaluate(() => window.__marca)) === "sin recargar", "E: se vuelve a pedir el producto sin recargar la página");
  ok(ficha.errores.length === 0, `G: ficha sin errores (${ficha.errores.slice(0, 2).join(" | ")})`);
  await ficha.close();

  // F) Mi cuenta: recarga entera; con texto escrito, no.
  const perfil = await abrir(ctx, "/perfil", (p) => p.waitForLoadState("networkidle").catch(() => {}));
  const recargada = perfil.waitForEvent("load", { timeout: 8000 }).then(() => true, () => false);
  await deslizar(perfil, { y: 360, dy: 260 });
  ok(await recargada, "F: en Mi cuenta (sin recarga por partes) se recarga la página entera");
  await perfil.close();
  // Con el formulario de entrar abierto y algo escrito, no se recarga.
  const entrar = await abrir(ctx, "/perfil?acceso=entrar", (p) => p.locator("input:not([type=hidden])").first().waitFor({ timeout: 40000 }));
  const campo = entrar.locator("input:not([type=hidden])").first();
  await campo.fill("algo escrito");
  await entrar.evaluate(() => document.activeElement?.blur?.());
  const gesto = await deslizar(entrar, { y: 200, dy: 260, soltar: false });
  ok(gesto.texto === "Suelta para actualizar", `F: con el formulario de entrar también sale el aviso (${gesto.texto})`);
  await gesto.levantar();
  await entrar.waitForTimeout(2000);
  ok(
    (await entrar.evaluate(() => window.__marca)) === "sin recargar" && (await campo.inputValue()) === "algo escrito",
    "F: con texto escrito no se recarga la página (no se pierde lo escrito)"
  );
  await entrar.close();
  await ctx.close();
} catch (e) {
  fallos.push(`la prueba se cortó: ${String(e.stack ?? e).slice(0, 900)}`);
} finally {
  await navegador.close();
  servidor.close();
}

for (const f of fallos) console.log(`FALLO ${f}`);
console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
process.exit(fallos.length ? 1 : 0);
