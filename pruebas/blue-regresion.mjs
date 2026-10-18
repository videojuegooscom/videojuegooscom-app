/**
 * pruebas/blue-regresion.mjs — Blue no puede tapar ningún botón, en móvil ni en escritorio.
 *
 * Qué hace: abre la tienda con Chromium sin pantalla (playwright-core) en cuatro tamaños de
 * pantalla (iPhone pequeño, iPhone, tableta y escritorio) y comprueba:
 * 1. Con una posición antigua guardada abajo a la derecha, Blue no aparece abajo a la derecha.
 * 2. Si se pone un botón justo debajo de Blue, Blue se aparta en menos de 2,5 s.
 * 3. En cada página y tamaño, ningún elemento tocable (botón, enlace, campo, pestaña…) tiene
 *    a Blue encima: se mira qué elemento recibe el toque en el centro de cada uno
 *    (document.elementFromPoint) y se falla si ese elemento es Blue.
 * 4. El botón «Volver atrás» de la cabecera no se solapa con Blue ni un píxel.
 * Se repite el punto 3 en una primera visita de verdad (sin nada guardado: sale el aviso de
 * cookies y Blue aparece a los 10 s).
 *
 * Uso (Claude lo lanza antes de publicar cambios que afecten a Blue o a las cabeceras):
 *   node pruebas/blue-regresion.mjs [direccion_o_carpeta] [carpeta_salida]
 *   p. ej. node pruebas/blue-regresion.mjs dist               (sirve la carpeta dist en local)
 *         node pruebas/blue-regresion.mjs https://videojuegoszaragoza.com
 * Sale con código 1 si hay algún fallo. Solo lee: no envía formularios ni crea datos.
 *
 * Requisitos: el paquete playwright-core y su navegador, que llegan con la PR #52
 * («Navegador de pruebas», pruebas/movil.mjs). Sin esa PR este script no se puede lanzar.
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright-core";

const ARG = process.argv[2] ?? "https://videojuegoszaragoza.com";
const SALIDA = process.argv[3] ?? join(tmpdir(), "capturas-blue");
// Escenario opcional (cuarto argumento): todo | posicion | paginas | primera. Por defecto, todo.
const SOLO = process.argv[4] ?? "todo";
const toca = (nombre) => SOLO === "todo" || SOLO === nombre;
mkdirSync(SALIDA, { recursive: true });

// --- servidor local para una carpeta dist (rutas dinámicas y 404.html como en Vercel) ------

const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ico": "image/x-icon", ".svg": "image/svg+xml",
  ".ttf": "font/ttf", ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml", ".webp": "image/webp", ".map": "application/json",
};
const DINAMICAS = [
  [/^\/producto\/[^/]+$/, "producto/[id].html"],
  [/^\/servicio\/[^/]+$/, "servicio/[id].html"],
  [/^\/politicas\/[^/]+$/, "politicas/[slug].html"],
  [/^\/chat\/[^/]+$/, "chat/[chatId].html"],
];

function servirCarpeta(raiz) {
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
    const p = ruta === "/" ? join(raiz, "index.html") : buscar(ruta);
    if (p) {
      res.writeHead(200, { "content-type": TIPOS[extname(p)] ?? "application/octet-stream" });
      res.end(readFileSync(p));
      return;
    }
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end(existsSync(join(raiz, "404.html")) ? readFileSync(join(raiz, "404.html")) : "No encontrado");
  });
  return new Promise((ok) => servidor.listen(0, "127.0.0.1", () => ok({ servidor, base: `http://127.0.0.1:${servidor.address().port}` })));
}

let servidor = null;
let BASE;
if (/^https?:\/\//.test(ARG)) {
  BASE = ARG.replace(/\/$/, "");
} else {
  const raiz = resolve(ARG);
  if (!existsSync(join(raiz, "index.html"))) {
    console.error(`FALLO ${raiz} no tiene index.html: ¿has hecho npm run build?`);
    process.exit(1);
  }
  const s = await servirCarpeta(raiz);
  servidor = s.servidor;
  BASE = s.base;
}

// --- utilidades --------------------------------------------------------------------------

const TAMANOS = [
  { nombre: "iphone-pequeno", w: 360, h: 740, movil: true },
  { nombre: "iphone", w: 390, h: 844, movil: true },
  { nombre: "tableta", w: 768, h: 1024, movil: true },
  { nombre: "escritorio", w: 1280, h: 800, movil: false },
];
const RUTAS = ["/", "/catalogo", "/servicios", "/blog", "/politicas/envios", "/cesta", "/perfil"];

const fallos = [];
let comprobadas = 0; // páginas en las que Blue estaba en pantalla y se midió de verdad
let fichasConMensaje = 0; // fichas de producto medidas con el mensaje de Blue a la vista
const ok = (cond, msg) => {
  console.log(`${cond ? "OK   " : "FALLO"} ${msg}`);
  if (!cond) fallos.push(msg);
};

// guardado = false simula una primera visita de verdad (sin nada guardado: sale el aviso de
// cookies y, a los 15 s, la guía automática). Aun así la prueba NUNCA escribe datos: cualquier
// petición que no sea de lectura a la base de datos (analítica incluida) se corta.
async function contexto(navegador, t, { guardado = true, esquina = null } = {}) {
  const ctx = await navegador.newContext({
    viewport: { width: t.w, height: t.h },
    deviceScaleFactor: 1,
    isMobile: t.movil,
    hasTouch: t.movil,
    locale: "es-ES",
  });
  await ctx.route("**/rest/v1/**", (ruta) => (ruta.request().method() === "GET" || ruta.request().method() === "HEAD" ? ruta.continue() : ruta.abort()));
  await ctx.addInitScript(
    ({ guardado, esquina }) => {
      try {
        if (guardado) {
          // La analítica rechazada y la guía ya vista: así no tapan nada ni cuentan visitas.
          localStorage.setItem("videojuegoos.analytics.consent", "declined");
          localStorage.setItem("videojuegoszaragoza:guia_vista", "1");
        }
        if (esquina) localStorage.setItem("videojuegoszaragoza:campanita_corner", esquina);
      } catch {
        // sin almacenamiento
      }
    },
    { guardado, esquina }
  );
  return ctx;
}

const cajaBlue = (p) =>
  p.evaluate(() => {
    const e = document.getElementById("blue-flotante");
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, W: innerWidth, H: innerHeight };
  });

// Elementos tocables visibles cuyo centro recibe el toque Blue y no ellos mismos.
// El «Volver atrás» además se mide por solape de cajas.
function medirTapados() {
  const blue = document.getElementById("blue-flotante");
  if (!blue) return { sinBlue: true };
  const b = blue.getBoundingClientRect();
  const SEL = 'button,a[href],input,textarea,select,[role="button"],[role="link"],[role="tab"],[role="switch"],[role="checkbox"],[tabindex="0"]';
  const tapados = [];
  for (const el of document.querySelectorAll(SEL)) {
    if (el.closest("#blue-flotante")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (r.width >= window.innerWidth * 0.95) continue; // contenedores que ocupan toda la pantalla
    const dentro = r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight;
    if (!dentro) continue;
    const ancho = Math.min(b.right, r.right) - Math.max(b.left, r.left);
    const alto = Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top);
    if (ancho <= 0 || alto <= 0) continue;
    // Se prueban varios puntos del elemento: si Blue recibe el toque en alguno, lo tapa. Solo
    // cuenta si SIN Blue ese punto sí sería del elemento (si ya lo tapaba otra cosa, por ejemplo
    // el aviso de cookies, no es culpa de Blue).
    const puntos = [[0.5, 0.5], [0.2, 0.5], [0.8, 0.5], [0.5, 0.2], [0.5, 0.8]];
    let encima = false;
    for (const [fx, fy] of puntos) {
      const x = r.left + r.width * fx;
      const y = r.top + r.height * fy;
      if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) continue;
      const tope = document.elementFromPoint(x, y);
      if (!tope || !tope.closest("#blue-flotante")) continue;
      const antes = blue.style.visibility;
      blue.style.visibility = "hidden";
      const sinBlue = document.elementFromPoint(x, y);
      blue.style.visibility = antes;
      if (sinBlue && el.contains(sinBlue)) encima = true;
    }
    if (encima) tapados.push((el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40));
  }
  const volver = document.querySelector('[aria-label="Volver atrás"]');
  let solapeVolver = null;
  if (volver) {
    const v = volver.getBoundingClientRect();
    const w = Math.max(0, Math.min(b.right, v.right) - Math.max(b.left, v.left));
    const h = Math.max(0, Math.min(b.bottom, v.bottom) - Math.max(b.top, v.top));
    solapeVolver = Math.round(((w * h) / (v.width * v.height)) * 100);
  }
  return { tapados, solapeVolver, blue: [Math.round(b.x), Math.round(b.y)] };
}

// espera: ms entre que Blue aparece y se mide. En una primera visita la guía automática se abre
// 5 s después de Blue y lo esconde, así que ahí se mide antes (Blue se aparta en menos de 2 s).
async function revisarPagina(ctx, t, ruta, etiqueta, espera = 6000) {
  const p = await ctx.newPage();
  await p.goto(BASE + ruta, { waitUntil: "load", timeout: 60000 });
  const hay = await p.waitForSelector("#blue-flotante", { timeout: 25000 }).then(() => true).catch(() => false);
  if (!hay) {
    console.log(`AVISO ${etiqueta} ${t.nombre} ${ruta}: Blue no aparece en 25 s; esta página no cuenta como comprobada`);
    await p.close();
    return;
  }
  // La ficha de producto saca un mensaje de Blue pasados unos segundos: se espera a que esté a la
  // vista, porque es el caso en que el mensaje (y no solo Blue) podía tapar «Comprar ya».
  let conMensaje = false;
  if (ruta.startsWith("/producto/")) {
    conMensaje = await p.waitForSelector("#blue-mensaje", { timeout: 25000 }).then(() => true).catch(() => false);
  }
  await p.waitForTimeout(espera); // Blue se aparta cada 1,2 s: dejarlo asentarse
  const m = await p.evaluate(medirTapados);
  if (m.sinBlue) {
    // Blue se oculta a propósito en algunas situaciones (guía abierta, scroll…): no se cuenta como
    // comprobada, y por eso se avisa y se lleva la cuenta (al final falla si no se comprobó ninguna).
    console.log(`AVISO ${etiqueta} ${t.nombre} ${ruta}: Blue no estaba en pantalla al medir; esta página no cuenta como comprobada`);
    await p.close();
    return;
  }
  comprobadas++;
  if (conMensaje && (await p.evaluate(() => !!document.getElementById("blue-mensaje")))) fichasConMensaje++;
  ok(m.tapados.length === 0, `${etiqueta} ${t.nombre} ${ruta}: Blue no tapa ningún botón${conMensaje ? " (con su mensaje a la vista)" : ""}${m.tapados.length ? ` (tapa: ${m.tapados.join(" · ")})` : ""}`);
  if (m.solapeVolver !== null) ok(m.solapeVolver === 0, `${etiqueta} ${t.nombre} ${ruta}: Blue no se solapa con «Volver atrás» (${m.solapeVolver} %)`);
  if (m.tapados.length || (m.solapeVolver ?? 0) > 0) await p.screenshot({ path: join(SALIDA, `${etiqueta}-${t.nombre}-${ruta.replace(/\W+/g, "_")}.png`) });
  await p.close();
}

// --- pruebas -----------------------------------------------------------------------------

const navegador = await chromium.launch();
try {
  // 1) y 2) con una posición antigua abajo a la derecha, en móvil y escritorio.
  for (const t of toca("posicion") ? [TAMANOS[1], TAMANOS[3]] : []) {
    const ctx = await contexto(navegador, t, { esquina: JSON.stringify({ lado: "r", fy: 1 }) });
    const p = await ctx.newPage();
    await p.goto(BASE + "/", { waitUntil: "load", timeout: 60000 });
    await p.waitForSelector("#blue-flotante", { timeout: 40000 });
    await p.waitForTimeout(4000);
    const c = await cajaBlue(p);
    ok(c && !(c.x + c.w / 2 > c.W / 2 && c.y + c.h / 2 > c.H / 2), `${t.nombre}: con la posición antigua abajo a la derecha, Blue no aparece abajo a la derecha`);
    await p.evaluate(() => {
      const e = document.getElementById("blue-flotante").getBoundingClientRect();
      const b = document.createElement("button");
      b.textContent = "Botón de prueba";
      b.style.cssText = `position:fixed;left:${e.left - 20}px;top:${e.top - 10}px;width:${e.width + 40}px;height:${e.height + 20}px;z-index:50;background:#ddd;`;
      document.body.appendChild(b);
    });
    const antes = await cajaBlue(p);
    const t0 = Date.now();
    let tarda = null;
    while (Date.now() - t0 < 4000) {
      await p.waitForTimeout(100);
      const c2 = await cajaBlue(p);
      if (c2 && (Math.abs(c2.x - antes.x) > 30 || Math.abs(c2.y - antes.y) > 30)) {
        tarda = Date.now() - t0;
        break;
      }
    }
    ok(tarda !== null && tarda < 2500, `${t.nombre}: Blue se aparta en menos de 2,5 s de un botón puesto debajo (${tarda ?? "no se movió"} ms)`);
    await ctx.close();
  }

  // 3) y 4) todas las páginas en todos los tamaños, con la guía ya vista.
  for (const t of toca("paginas") ? TAMANOS : []) {
    const ctx = await contexto(navegador, t);
    // La ficha de producto: se toca el primer producto del catálogo (las tarjetas no son
    // enlaces <a>, así que se pulsa el primer precio y se lee la dirección a la que lleva).
    const p0 = await ctx.newPage();
    await p0.goto(BASE + "/catalogo", { waitUntil: "load", timeout: 60000 });
    let enlace = null;
    try {
      await p0.getByText(/\d,\d\d€/).first().click({ timeout: 25000 });
      await p0.waitForURL(/\/producto\//, { timeout: 15000 });
      enlace = new URL(p0.url()).pathname;
    } catch {
      enlace = null;
    }
    await p0.close();
    const rutas = enlace ? [...RUTAS, enlace] : RUTAS;
    if (!enlace) console.log(`AVISO ${t.nombre}: no se encontró ningún producto en el catálogo; se omite la ficha`);
    await Promise.all(rutas.map((r) => revisarPagina(ctx, t, r, "guía vista")));
    await ctx.close();
  }

  // 3) primera visita de verdad (aviso de cookies y Blue a los 10 s), móvil y escritorio.
  for (const t of toca("primera") ? [TAMANOS[1], TAMANOS[3]] : []) {
    const ctx = await contexto(navegador, t, { guardado: false });
    await Promise.all(["/", "/catalogo"].map((r) => revisarPagina(ctx, t, r, "primera visita", 2500)));
    await ctx.close();
  }
} catch (e) {
  fallos.push(`la prueba se cortó: ${String(e).slice(0, 200)}`);
} finally {
  await navegador.close();
  servidor?.close();
}

if (comprobadas === 0 && (SOLO === "todo" || SOLO === "paginas" || SOLO === "primera")) fallos.push("no se midió ninguna página (Blue no apareció en ninguna)");
if (comprobadas > 0 && (SOLO === "todo" || SOLO === "paginas") && fichasConMensaje === 0) fallos.push("no se vio ningún mensaje de Blue en las fichas de producto: el caso del mensaje no se probó");
console.log(`páginas medidas con Blue en pantalla: ${comprobadas} (fichas con el mensaje de Blue a la vista: ${fichasConMensaje})`);
for (const f of fallos) console.log(`FALLO ${f}`);
console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
console.log(`capturas de los fallos en ${SALIDA}`);
process.exit(fallos.length ? 1 : 0);
