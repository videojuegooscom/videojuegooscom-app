/**
 * pruebas/pedido-idempotente.mjs — el checkout no crea pedidos duplicados (parte del navegador).
 *
 * Qué hace: abre /checkout con un carrito de prueba, rellena el formulario y comprueba, con las
 * llamadas a Supabase SIMULADAS (page.route; nada se escribe de verdad, el resto de peticiones de
 * escritura a la base de datos se cortan):
 * 1. Doble toque en «Confirmar pedido»: sale UNA sola petición a crear_pedido_idempotente, con una
 *    clave (UUID), y el aviso a VeoAura (/api/escaparate-retorno) sale una sola vez.
 * 2. Fallo de red y reintento tras recargar la página: el segundo intento manda la MISMA clave.
 * 3. Si el servidor responde repetido = true: se muestra el mismo número y no se vuelve a avisar a
 *    VeoAura.
 * 4. Si la función nueva aún no existe en la base de datos (migración sin aplicar): cae a la antigua
 *    crear_pedido y el pedido sigue adelante.
 * 5. Tras un pedido hecho, la clave guardada se borra (la siguiente compra empieza con clave nueva).
 * NO prueba la base de datos: eso está en supabase/tests/crear_pedido_idempotente.sql.
 *
 * Uso:   node pruebas/pedido-idempotente.mjs [direccion_o_carpeta]
 *   p. ej. node pruebas/pedido-idempotente.mjs dist
 * Sale con código 1 si algo falla. Requisitos: playwright-core (PR #52, ver pruebas/blue-regresion.mjs).
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright-core";

const ARG = process.argv[2] ?? "dist";
const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".svg": "image/svg+xml", ".ttf": "font/ttf",
  ".woff": "font/woff", ".woff2": "font/woff2", ".webp": "image/webp", ".txt": "text/plain; charset=utf-8",
};

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
  const buscar = (ruta) => {
    const limpia = normalize(decodeURIComponent(ruta)).replace(/^(\.\.[/\\])+/, "");
    for (const c of [limpia, `${limpia}.html`, join(limpia, "index.html")]) {
      const p = join(raiz, c);
      if (existsSync(p) && statSync(p).isFile()) return p;
    }
    return null;
  };
  servidor = createServer((req, res) => {
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
  BASE = `http://127.0.0.1:${servidor.address().port}`;
}

const fallos = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "OK   " : "FALLO"} ${msg}`);
  if (!cond) fallos.push(msg);
};

const PRODUCTO = "00000000-0000-4000-8000-0000000000a1"; // id inventado: nada se pide a la base de datos real
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLAVE_KEY = "videojuegoszaragoza:pedido_clave";

// Una sesión de prueba: un navegador nuevo, el carrito sembrado y la base de datos simulada.
// `respuestas` decide qué contesta cada intento a crear_pedido_idempotente.
async function escenario(navegador, nombre, respuestas, { retraso = 0, antiguo = null } = {}) {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "es-ES" });
  await ctx.addInitScript(
    ({ id }) => {
      try {
        localStorage.setItem("videojuegoos.analytics.consent", "declined");
        localStorage.setItem("videojuegoszaragoza:guia_vista", "1");
        // Solo se siembra si no hay carrito (al recargar, el carrito sigue como lo dejó la página).
        if (!localStorage.getItem("videojuegoos_cart_v1") && !sessionStorage.getItem("sembrado")) {
          localStorage.setItem(
            "videojuegoos_cart_v1",
            JSON.stringify([{ id, title: "Producto de prueba", priceEUR: 100, qty: 1, imageUrl: null, reservedUntil: Date.now() + 20 * 60000 }])
          );
          sessionStorage.setItem("sembrado", "1");
        }
      } catch {
        // sin almacenamiento
      }
    },
    { id: PRODUCTO }
  );
  const llamadas = { nuevo: [], antiguo: [], retorno: 0 };
  // Todo lo que no sea lectura a la base de datos se corta; solo las dos funciones se simulan.
  await ctx.route("**/rest/v1/**", (r) => (["GET", "HEAD"].includes(r.request().method()) ? r.continue() : r.abort()));
  await ctx.route("**/rest/v1/rpc/crear_pedido_idempotente", async (r) => {
    llamadas.nuevo.push(r.request().postDataJSON());
    if (retraso) await new Promise((f) => setTimeout(f, retraso));
    const respuesta = respuestas[Math.min(llamadas.nuevo.length - 1, respuestas.length - 1)];
    if (respuesta === "red") return r.abort("failed");
    if (respuesta === "no-existe") {
      return r.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: "PGRST202", message: "Could not find the function public.crear_pedido_idempotente(p_clave, p_datos, p_productos) in the schema cache" }) });
    }
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(respuesta) });
  });
  await ctx.route("**/rest/v1/rpc/crear_pedido", async (r) => {
    llamadas.antiguo.push(r.request().postDataJSON());
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(antiguo ?? 999) });
  });
  await ctx.route("**/api/escaparate-retorno", (r) => {
    llamadas.retorno++;
    return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  return { ctx, llamadas, nombre };
}

async function rellenarYEnviar(p, { doble = false } = {}) {
  await p.getByRole("radio", { name: /Recogida en tienda/ }).click();
  await p.getByPlaceholder("Nombre completo").fill("Cliente de Prueba");
  await p.getByPlaceholder("tu@email.com").fill("prueba@example.com");
  await p.getByPlaceholder("627 748 741").fill("600123123");
  const boton = p.getByText(/Confirmar pedido/).last();
  await boton.scrollIntoViewIfNeeded();
  if (doble) await Promise.all([boton.click(), boton.click({ delay: 10 })]);
  else await boton.click();
}

const navegador = await chromium.launch();
try {
  // 1) Doble toque: una sola petición, una sola aviso a VeoAura.
  {
    const { ctx, llamadas } = await escenario(navegador, "doble toque", [{ numero: 101, repetido: false }], { retraso: 800 });
    const p = await ctx.newPage();
    await p.goto(BASE + "/checkout", { waitUntil: "load", timeout: 60000 });
    await rellenarYEnviar(p, { doble: true });
    await p.getByText(/Pedido nº 101 recibido/).waitFor({ timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(1500);
    ok(llamadas.nuevo.length === 1, `doble toque: una sola petición a crear_pedido_idempotente (${llamadas.nuevo.length})`);
    ok(UUID_RE.test(llamadas.nuevo[0]?.p_clave ?? ""), `doble toque: la petición lleva una clave UUID (${llamadas.nuevo[0]?.p_clave})`);
    ok(llamadas.retorno === 1, `doble toque: el aviso a VeoAura sale una sola vez (${llamadas.retorno})`);
    ok(await p.getByText(/Pedido nº 101 recibido/).count() > 0, "doble toque: se muestra «Pedido nº 101 recibido»");
    ok((await p.evaluate((k) => localStorage.getItem(k), CLAVE_KEY)) === null, "doble toque: tras el pedido, la clave guardada se borra");
    ok(llamadas.antiguo.length === 0, "doble toque: no se usa la función antigua");
    await ctx.close();
  }

  // 2) Fallo de red y reintento tras recargar: la misma clave.
  {
    const { ctx, llamadas } = await escenario(navegador, "reintento", ["red", { numero: 102, repetido: false }]);
    const p = await ctx.newPage();
    await p.goto(BASE + "/checkout", { waitUntil: "load", timeout: 60000 });
    await rellenarYEnviar(p);
    await p.waitForTimeout(2500); // el primer intento falla por red
    const clave1 = llamadas.nuevo[0]?.p_clave;
    const guardada = await p.evaluate((k) => localStorage.getItem(k), CLAVE_KEY);
    ok(!!clave1 && !!guardada && guardada.includes(clave1), "reintento: tras el fallo de red la clave queda guardada");
    await p.reload({ waitUntil: "load" });
    await rellenarYEnviar(p);
    await p.getByText(/Pedido nº 102 recibido/).waitFor({ timeout: 20000 }).catch(() => {});
    const clave2 = llamadas.nuevo[1]?.p_clave;
    ok(llamadas.nuevo.length === 2, `reintento: dos peticiones en total (${llamadas.nuevo.length})`);
    ok(!!clave1 && clave1 === clave2, `reintento: el segundo intento manda la MISMA clave (${clave1} / ${clave2})`);
    await ctx.close();
  }

  // 3) Repetido: mismo número y sin avisar otra vez a VeoAura.
  {
    const { ctx, llamadas } = await escenario(navegador, "repetido", [{ numero: 103, repetido: true }]);
    const p = await ctx.newPage();
    await p.goto(BASE + "/checkout", { waitUntil: "load", timeout: 60000 });
    await rellenarYEnviar(p);
    await p.getByText(/Pedido nº 103 recibido/).waitFor({ timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(1500);
    ok(await p.getByText(/Pedido nº 103 recibido/).count() > 0, "repetido: se muestra el número del pedido ya existente");
    ok(llamadas.retorno === 0, `repetido: no se avisa otra vez a VeoAura (${llamadas.retorno})`);
    await ctx.close();
  }

  // 4) La función nueva no existe todavía: cae a la antigua.
  {
    const { ctx, llamadas } = await escenario(navegador, "respaldo", ["no-existe"], { antiguo: 104 });
    const p = await ctx.newPage();
    await p.goto(BASE + "/checkout", { waitUntil: "load", timeout: 60000 });
    await rellenarYEnviar(p);
    await p.getByText(/Pedido nº 104 recibido/).waitFor({ timeout: 20000 }).catch(() => {});
    ok(llamadas.nuevo.length === 1 && llamadas.antiguo.length === 1, `respaldo: se intenta la nueva (${llamadas.nuevo.length}) y se usa la antigua (${llamadas.antiguo.length})`);
    ok(await p.getByText(/Pedido nº 104 recibido/).count() > 0, "respaldo: el pedido sigue adelante con la función antigua");
    await ctx.close();
  }
} catch (e) {
  fallos.push(`la prueba se cortó: ${String(e).slice(0, 300)}`);
} finally {
  await navegador.close();
  servidor?.close();
}

for (const f of fallos) console.log(`FALLO ${f}`);
console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
process.exit(fallos.length ? 1 : 0);
