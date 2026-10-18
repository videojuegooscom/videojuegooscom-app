/**
 * pruebas/interaccion-cliente.mjs — la ficha de producto cuenta visitas y «me gusta» por api/interaccion.
 *
 * Qué hace: abre la tienda compilada (carpeta dist) en un navegador (Chromium, móvil 390×844) y entra en la
 * ficha del primer producto del catálogo. La función /api/interaccion se SIMULA (no existe en el servidor
 * estático) y las funciones antiguas de Supabase (rpc/increment_product_view y rpc/adjust_product_like) se
 * interceptan y se cuentan; cualquier otra escritura a la base de datos se corta. Comprueba, en tres
 * escenarios:
 *  A) El endpoint responde bien: la visita va a /api/interaccion con {accion:"vista_producto", id}; dar «me
 *     gusta» manda {accion:"apoyo", activo:true, visitante:<identificador>, id} y la pantalla enseña el total
 *     que devuelve el servidor; quitarlo manda activo:false; el identificador se guarda y se reutiliza;
 *     NO se llama a las funciones antiguas.
 *  B) El endpoint dice 429 (límite): no se cae a la vía antigua (sería saltarse el límite) y el «me gusta»
 *     se deshace en pantalla.
 *  C) El endpoint no existe (404, aún sin publicar): se cae a las funciones antiguas (la tienda no se rompe).
 *  D) «Añadir a la cesta» pide la reserva a /api/interaccion con {accion:"reservar", id, token:<uuid>} y usa la hora
 *     de fin que da el servidor; E) con 429 (tope de reservas) no se cae a la función antigua pero la compra no se
 *     bloquea; F) sin endpoint se cae a reservar_producto; G) si lo tiene reservado otro cliente (hasta:null) no
 *     entra en la cesta.
 * NO toca producción: las únicas peticiones a Supabase real son lecturas (GET).
 *
 * Uso: node pruebas/interaccion-cliente.mjs [carpeta_dist]     (por defecto dist)
 * Requisitos: playwright-core (PR #52, ver pruebas/blue-regresion.mjs) y npm run build hecho.
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASTA_ANTIGUA = new Date(Date.now() + 14 * 60000).toISOString(); // lo que contesta la función antigua de reservas
const VISITA_OK = { status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, contado: true, total: 42 }) };
const carrito = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("videojuegoos_cart_v1") ?? "[]"));

async function escenario(navegador, nombre, respuestaEndpoint) {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "es-ES" });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("videojuegoos.analytics.consent", "declined");
      localStorage.setItem("videojuegoszaragoza:guia_vista", "1");
    } catch {
      // sin almacenamiento
    }
  });
  const registro = { endpoint: [], viejas: [] };
  await ctx.route("**/rest/v1/**", (r) => (["GET", "HEAD"].includes(r.request().method()) ? r.continue() : r.abort()));
  await ctx.route("**/rest/v1/rpc/increment_product_view", (r) => {
    registro.viejas.push("increment_product_view");
    return r.fulfill({ status: 200, contentType: "application/json", body: "77" });
  });
  await ctx.route("**/rest/v1/rpc/adjust_product_like", (r) => {
    registro.viejas.push(`adjust_product_like:${r.request().postDataJSON()?.delta}`);
    return r.fulfill({ status: 200, contentType: "application/json", body: "88" });
  });
  await ctx.route("**/rest/v1/rpc/reservar_producto", (r) => {
    registro.viejas.push("reservar_producto");
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(HASTA_ANTIGUA) });
  });
  await ctx.route("**/api/interaccion", (r) => {
    const cuerpo = r.request().postDataJSON();
    registro.endpoint.push(cuerpo);
    return r.fulfill(respuestaEndpoint(cuerpo));
  });
  const p = await ctx.newPage();
  await p.goto(BASE + "/catalogo", { waitUntil: "load", timeout: 60000 });
  await p.getByText(/\d,\d\d€/).first().click({ timeout: 30000 });
  await p.waitForURL(/\/producto\//, { timeout: 20000 });
  const idProducto = new URL(p.url()).pathname.split("/").pop();
  await p.waitForTimeout(3500); // la visita se cuenta cuando la ficha ya está pintada
  return { ctx, p, registro, idProducto, nombre };
}
// El botón lleva un icono (que sale como un carácter raro en el texto) y el número: se queda con el número.
const texto = (p) => p.getByRole("button", { name: /me gusta/i }).first().innerText().then((t) => (t.match(/\d+/) ?? [""])[0]);

const navegador = await chromium.launch();
try {
  // A) El endpoint responde bien
  {
    const { ctx, p, registro, idProducto } = await escenario(navegador, "A", (c) =>
      c.accion === "apoyo"
        ? { status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, total: c.activo ? 7 : 6 }) }
        : { status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, contado: true, total: 42 }) }
    );
    const vistas = registro.endpoint.filter((c) => c.accion === "vista_producto");
    ok(vistas.length === 1 && vistas[0].id === idProducto, `A: la visita va a /api/interaccion con la acción y el id de la ficha (${vistas.length} llamada)`);
    await p.getByRole("button", { name: "Dar me gusta" }).click();
    await p.waitForTimeout(1200);
    const dar = registro.endpoint.find((c) => c.accion === "apoyo" && c.activo === true);
    ok(!!dar && dar.id === idProducto && UUID_RE.test(dar.visitante), `A: dar «me gusta» manda {apoyo, activo:true, id, visitante:<uuid>} (${dar ? "visitante " + dar.visitante : "no se mandó"})`);
    ok((await texto(p)) === "7", `A: la pantalla enseña el total que devuelve el servidor (${await texto(p)})`);
    await p.getByRole("button", { name: "Quitar me gusta" }).click();
    await p.waitForTimeout(1200);
    const quitar = registro.endpoint.filter((c) => c.accion === "apoyo").pop();
    ok(quitar?.activo === false && quitar.visitante === dar.visitante, "A: quitarlo manda activo:false con el MISMO identificador de visitante");
    const guardado = await p.evaluate(() => localStorage.getItem("videojuegoszaragoza:visitante"));
    ok(guardado === dar.visitante, "A: el identificador de visitante se guarda en el navegador y se reutiliza");
    ok(registro.viejas.length === 0, "A: no se llama a las funciones antiguas de la base de datos");
    await ctx.close();
  }

  // B) El endpoint dice 429
  {
    const { ctx, p, registro } = await escenario(navegador, "B", () => ({ status: 429, contentType: "application/json", body: JSON.stringify({ ok: false, error: "demasiadas peticiones" }) }));
    const antes = await texto(p);
    await p.getByRole("button", { name: "Dar me gusta" }).click();
    await p.waitForTimeout(1500);
    ok(registro.viejas.length === 0, "B: con 429 NO se cae a la vía antigua (sería saltarse el límite)");
    ok((await texto(p)) === antes && (await p.getByRole("button", { name: "Dar me gusta" }).count()) > 0, `B: el «me gusta» se deshace en pantalla (contador ${antes}, botón «Dar me gusta»)`);
    await ctx.close();
  }

  // C) El endpoint no existe todavía (404)
  {
    const { ctx, p, registro } = await escenario(navegador, "C", () => ({ status: 404, contentType: "text/plain", body: "No encontrado" }));
    ok(registro.viejas.includes("increment_product_view"), "C: sin endpoint, la visita cae a la función antigua (la tienda no se rompe)");
    await p.getByRole("button", { name: "Dar me gusta" }).click();
    await p.waitForTimeout(1500);
    ok(registro.viejas.includes("adjust_product_like:1"), "C: y el «me gusta» cae a adjust_product_like con delta 1");
    ok((await texto(p)) === "88", `C: la pantalla enseña el total que devuelve la función antigua (${await texto(p)})`);
    await ctx.close();
  }

  // D) Reservas de la cesta: el endpoint responde bien
  {
    const hasta = new Date(Date.now() + 15 * 60000).toISOString();
    const { ctx, p, registro, idProducto } = await escenario(navegador, "D", (c) =>
      c.accion === "reservar" ? { status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, hasta }) } : VISITA_OK
    );
    await p.getByText("Añadir a la cesta").first().click();
    await p.waitForTimeout(1800);
    const reserva = registro.endpoint.find((c) => c.accion === "reservar");
    ok(!!reserva && reserva.id === idProducto && UUID_RE.test(reserva.token), `D: «Añadir a la cesta» pide la reserva a /api/interaccion con {reservar, id, token:<uuid>} (${reserva ? "token " + reserva.token : "no se mandó"})`);
    ok(!registro.viejas.includes("reservar_producto"), "D: no se llama a la función antigua reservar_producto");
    const items = await carrito(p);
    ok(items.length === 1 && Math.abs(items[0].reservedUntil - Date.parse(hasta)) < 2000, "D: el producto queda en la cesta con la hora de fin que da el servidor");
    await ctx.close();
  }

  // E) Reservas: el servidor dice 429 (tope): no se cae a la vía antigua, pero la compra no se bloquea
  {
    const { ctx, p, registro } = await escenario(navegador, "E", (c) =>
      c.accion === "reservar" ? { status: 429, contentType: "application/json", body: JSON.stringify({ ok: false, error: "demasiadas reservas activas" }) } : VISITA_OK
    );
    await p.getByText("Añadir a la cesta").first().click();
    await p.waitForTimeout(1800);
    ok(!registro.viejas.includes("reservar_producto"), "E: con 429 NO se cae a la función antigua (sería saltarse el tope)");
    const items = await carrito(p);
    ok(items.length === 1 && items[0].reservedUntil > Date.now() + 14 * 60000 && items[0].reservedUntil < Date.now() + 16 * 60000, "E: aun así el producto entra en la cesta, con la reserva solo en este dispositivo (15 min)");
    await ctx.close();
  }

  // F) Reservas: el endpoint no existe todavía (404): cae a la función antigua
  {
    const { ctx, p, registro } = await escenario(navegador, "F", (c) =>
      c.accion === "reservar" ? { status: 404, contentType: "text/plain", body: "No encontrado" } : VISITA_OK
    );
    await p.getByText("Añadir a la cesta").first().click();
    await p.waitForTimeout(1800);
    ok(registro.viejas.includes("reservar_producto"), "F: sin endpoint, la reserva cae a la función antigua (la tienda no se rompe según el orden en que se publique)");
    const items = await carrito(p);
    ok(items.length === 1 && Math.abs(items[0].reservedUntil - Date.parse(HASTA_ANTIGUA)) < 2000, "F: y usa la hora de fin que devuelve esa función");
    await ctx.close();
  }

  // G) Reservas: el artículo lo tiene reservado otro cliente (hasta:null)
  {
    const { ctx, p } = await escenario(navegador, "G", (c) =>
      c.accion === "reservar" ? { status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, hasta: null }) } : VISITA_OK
    );
    await p.getByText("Añadir a la cesta").first().click();
    await p.waitForTimeout(1800);
    ok((await carrito(p)).length === 0, "G: si el servidor dice que lo tiene otro cliente, el producto NO entra en la cesta");
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
