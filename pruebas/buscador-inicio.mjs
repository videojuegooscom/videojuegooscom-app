/**
 * pruebas/buscador-inicio.mjs — el buscador de Inicio se puede usar: se escribe en él y salen productos y secciones.
 *
 * Qué hace: abre la tienda compilada (carpeta dist) en un navegador (Chromium, móvil 390×844) y usa de verdad el
 * buscador flotante de Inicio. Las consultas de productos a Supabase se SIMULAN (dos productos «Consola…» y nada
 * más; cualquier otra escritura a la base de datos se corta), así que no depende de los datos reales. Comprueba:
 *  A) «Inicio de sesión»: sin productos, avisa y ofrece «Iniciar sesión» (que lleva a /perfil?acceso=entrar).
 *  B) «Blog»: ofrece «Blog» (lleva a /blog); con Intro va directo a /blog.
 *  C) «consola»: salen los dos productos (título y precio con céntimos) y, MÁS ABAJO, la sección «Catálogo»;
 *     tocar un producto abre su ficha; con Intro se abre /catalogo?query=consola.
 *  D) Algo que no existe: «No hay productos para…», «Preguntar a Blue IA» (lleva a /blue-ia?q=…) y «Avísame cuando
 *     llegue» (solo aquí: no sale si hay productos ni si encaja una sección como «Blog»).
 *  H) Sin sesión, «Avísame cuando llegue» lleva a iniciar sesión (/perfil?aviso=…) y no crea nada.
 *  I) Con sesión (SIMULADA), «Avísame cuando llegue» crea el aviso con lo escrito (la escritura se corta y se simula),
 *     confirma en el panel y el panel se cierra solo; también se prueba el límite de 10 avisos y un error.
 *  E) Diseño en 390 px: el panel cabe en la pantalla, queda debajo de la barra, cada fila mide 44 px o más, la página
 *     no se ensancha y no hay errores de consola; la «x» borra y cierra; Escape cierra.
 *  F) Con la barra arrastrada ABAJO, el panel sale encima de ella.
 * NO toca producción: las únicas peticiones a Supabase real son lecturas (GET) que no sean de la búsqueda.
 *
 * Uso: node pruebas/buscador-inicio.mjs [carpeta_dist]     (por defecto dist)
 * Requisitos: playwright-core (PR #52) y npm run build hecho.
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
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
  // dist es solo estático: las funciones de api/ y el optimizador de imágenes de Vercel no existen aquí.
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
// Capturas para mirarlas a ojo (la carpeta es el 2.º argumento; sin él no se guarda nada).
const SALIDA = process.argv[3] ? resolve(process.argv[3]) : null;
if (SALIDA) mkdirSync(SALIDA, { recursive: true });
const capturar = (p, nombre) => (SALIDA ? p.screenshot({ path: join(SALIDA, `${nombre}.png`) }) : Promise.resolve());

const P1 = "00000000-0000-4000-8000-0000000000c1";
const P2 = "00000000-0000-4000-8000-0000000000c2";
const PRODUCTOS = [
  { id: P1, title: "Consola Prueba Uno", price_eur: 120, images: [] },
  { id: P2, title: "Consola Prueba Dos", price_eur: 89.5, images: [] },
];
const buscadas = []; // textos que la tienda ha buscado en la base de datos
const creados = []; // textos de «Avísame cuando llegue» que la tienda ha intentado crear (simulado: no se escribe nada)
const respuestaAviso = { status: 201, cuerpo: "" }; // lo que «responde» la base de datos simulada al crear un aviso
const USUARIO_FALSO = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "cliente@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };

async function contexto(navegador, sesion = false) {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "es-ES" });
  await ctx.addInitScript(([conSesion, usuario]) => {
    try {
      localStorage.setItem("videojuegoos.analytics.consent", "declined");
      localStorage.setItem("videojuegoszaragoza:guia_vista", "1");
      if (conSesion) {
        // Sesión falsa (clave de lib/supabase.ts). Nunca llega a ningún servidor.
        const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
        const exp = Math.floor(Date.now() / 1000) + 3600;
        const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: usuario.id, role: "authenticated", exp, aud: "authenticated", email: usuario.email })}.firma`;
        localStorage.setItem("videojuegoos.supabase.auth", JSON.stringify({ access_token: jwt, refresh_token: "r", expires_at: exp, expires_in: 3600, token_type: "bearer", user: usuario }));
      }
    } catch {
      // sin almacenamiento
    }
  }, [sesion, USUARIO_FALSO]);
  if (sesion) {
    await ctx.route("**/auth/v1/user", (r) => r.fulfill({ status: 200, contentType: "application/json", headers: CORS, body: JSON.stringify(USUARIO_FALSO) }));
  }
  await ctx.route("**/rest/v1/**", async (r) => {
    const peticion = r.request();
    const url = new URL(peticion.url());
    if (peticion.method() === "OPTIONS") return r.fulfill({ status: 204, headers: CORS });
    if (sesion && url.pathname.endsWith("/profiles")) {
      return r.fulfill({ status: 200, contentType: "application/json", headers: CORS, body: JSON.stringify({ id: USUARIO_FALSO.id, role: "customer" }) });
    }
    // Crear un aviso (la única escritura que se deja «pasar», y solo hacia esta respuesta simulada).
    if (peticion.method() === "POST" && url.pathname.endsWith("/avisos_busqueda")) {
      try {
        creados.push(String(JSON.parse(peticion.postData() ?? "{}").texto ?? ""));
      } catch {
        creados.push("(ilegible)");
      }
      return r.fulfill({ status: respuestaAviso.status, contentType: "application/json", headers: CORS, body: respuestaAviso.cuerpo });
    }
    if (!["GET", "HEAD"].includes(peticion.method())) return r.abort();
    const o = url.searchParams.get("or") ?? "";
    if (url.pathname.endsWith("/products") && /ilike/.test(o)) {
      const texto = (o.match(/title\.ilike\.%(.*?)%/) ?? [])[1] ?? "";
      buscadas.push(decodeURIComponent(texto));
      const filas = /consola/i.test(texto) ? PRODUCTOS : [];
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "content-range": filas.length ? `0-${filas.length - 1}/${filas.length}` : "*/0" },
        body: JSON.stringify(filas),
      });
    }
    if (url.pathname.endsWith("/product_media") && /00000000-0000-4000-8000-0000000000c/.test(url.search)) {
      return r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    return r.continue();
  });
  return ctx;
}

// Abre Inicio y escribe en el buscador. Con la CPU justa la página tarda en hidratar y lo escrito antes se pierde:
// se repite hasta que sale el panel.
async function escribir(p, texto) {
  const campo = p.getByRole("textbox", { name: /^Buscar/ });
  await campo.waitFor({ timeout: 30000 });
  for (let intento = 0; intento < 8; intento++) {
    await campo.click();
    await campo.fill("");
    await campo.fill(texto);
    if (await p.locator("#buscador-resultados").waitFor({ timeout: 2500 }).then(() => true, () => false)) {
      // y que haya terminado de buscar
      await p.getByText("Buscando…").waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
      return campo;
    }
  }
  throw new Error(`el panel de resultados no salió al escribir «${texto}»`);
}
const nueva = async (ctx) => {
  const p = await ctx.newPage();
  p.errores = [];
  p.on("pageerror", (e) => p.errores.push(`error JS: ${e.message.slice(0, 160)}`));
  p.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|net::ERR_FAILED/.test(m.text())) p.errores.push(`consola: ${m.text().slice(0, 160)}`);
  });
  await p.goto(BASE + "/", { waitUntil: "load", timeout: 60000 });
  return p;
};
const y = async (loc) => (await loc.first().boundingBox())?.y ?? NaN;

const navegador = await chromium.launch();
try {
  const ctx = await contexto(navegador);

  // A) «Inicio de sesión»
  {
    const p = await nueva(ctx);
    await escribir(p, "Inicio de sesión");
    const panel = p.locator("#buscador-resultados");
    ok((await panel.getByText("No hay productos para «Inicio de sesión»").count()) === 1, "A: sin productos, el panel lo dice («No hay productos para «Inicio de sesión»»)");
    const fila = panel.getByRole("link", { name: /Iniciar sesión/ });
    ok((await fila.count()) === 1, "A: ofrece la opción «Iniciar sesión»");
    ok((await y(panel.getByText("No hay productos para"))) < (await y(fila)), "A: la opción sale debajo del aviso");
    ok((await panel.getByText(/Avísame cuando llegue/).count()) === 0, "A: no ofrece «Avísame cuando llegue» (encaja una sección)");
    await capturar(p, "A-inicio-de-sesion");
    await fila.click();
    await p.waitForURL(/\/perfil\?acceso=entrar/, { timeout: 15000 }).then(
      () => ok(true, "A: tocarla lleva a /perfil?acceso=entrar"),
      () => ok(false, `A: tocarla debía llevar a /perfil?acceso=entrar (está en ${p.url()})`)
    );
    await p.close();
  }

  // B) «Blog»
  {
    const p = await nueva(ctx);
    await escribir(p, "Blog");
    const fila = p.locator("#buscador-resultados").getByRole("link", { name: /^Blog/ });
    ok((await fila.count()) === 1, "B: «Blog» ofrece la sección Blog");
    ok((await p.locator("#buscador-resultados").getByText(/Avísame cuando llegue/).count()) === 0, "B: no ofrece «Avísame cuando llegue» (encaja una sección)");
    await fila.click();
    await p.waitForURL(/\/blog$/, { timeout: 15000 }).then(
      () => ok(true, "B: tocarla lleva a /blog"),
      () => ok(false, `B: tocarla debía llevar a /blog (está en ${p.url()})`)
    );
    await p.close();

    const q = await nueva(ctx);
    const campo = await escribir(q, "Blog");
    await campo.press("Enter");
    await q.waitForURL(/\/blog$/, { timeout: 15000 }).then(
      () => ok(true, "B: con Intro, sin productos y con una sección que encaja, va directo a /blog"),
      () => ok(false, `B: con Intro debía ir a /blog (está en ${q.url()})`)
    );
    await q.close();
  }

  // C) «consola»: productos y, más abajo, la sección
  {
    const p = await nueva(ctx);
    await escribir(p, "consola");
    const panel = p.locator("#buscador-resultados");
    const f1 = panel.getByRole("link", { name: /Consola Prueba Uno/ });
    const f2 = panel.getByRole("link", { name: /Consola Prueba Dos/ });
    ok((await f1.count()) === 1 && (await f2.count()) === 1, "C: salen los dos productos");
    ok((await f1.innerText()).includes("120,00€") && (await f2.innerText()).includes("89,50€"), "C: con el precio y los céntimos («120,00€» y «89,50€»)");
    const seccion = panel.getByRole("link", { name: /^Catálogo/ });
    ok((await seccion.count()) === 1, "C: y la opción de la sección «Catálogo»");
    ok((await y(seccion)) > (await y(f2)), "C: la sección sale MÁS ABAJO que los productos");
    ok((await panel.getByText("No hay productos").count()) === 0, "C: sin el aviso de «no hay productos»");
    ok((await panel.getByText(/Preguntar a Blue IA/).count()) === 0, "C: ni «Preguntar a Blue IA» (hay productos)");
    ok((await panel.getByText(/Avísame cuando llegue/).count()) === 0, "C: ni «Avísame cuando llegue» (hay productos)");
    await capturar(p, "C-consola");
    await f1.click();
    await p.waitForURL(new RegExp(`/producto/${P1}`), { timeout: 15000 }).then(
      () => ok(true, "C: tocar un producto abre su ficha"),
      () => ok(false, `C: tocar el producto debía abrir su ficha (está en ${p.url()})`)
    );
    await p.close();

    const q = await nueva(ctx);
    const campo = await escribir(q, "consola");
    await campo.press("Enter");
    await q.waitForURL(/\/catalogo\?query=consola/, { timeout: 15000 }).then(
      () => ok(true, "C: con Intro, abre el catálogo con lo escrito (/catalogo?query=consola)"),
      () => ok(false, `C: con Intro debía abrir /catalogo?query=consola (está en ${q.url()})`)
    );
    await q.close();
  }

  // D) Algo que no existe
  {
    const p = await nueva(ctx);
    await escribir(p, "zzzxx");
    const panel = p.locator("#buscador-resultados");
    ok((await panel.getByText("No hay productos para «zzzxx»").count()) === 1, "D: «No hay productos para «zzzxx»»");
    ok((await panel.getByRole("link", { name: /Iniciar sesión|Blog|Catálogo/ }).count()) === 0, "D: y ninguna sección que no encaje");
    const preguntar = panel.getByRole("link", { name: /Preguntar a Blue IA/ });
    ok((await preguntar.count()) === 1, "D: ofrece «Preguntar a Blue IA»");
    const avisar = panel.getByRole("link", { name: /Avísame cuando llegue: zzzxx/ });
    ok((await avisar.count()) === 1, "D: ofrece «Avísame cuando llegue: «zzzxx»»");
    ok((await y(preguntar)) < (await y(avisar)), "D: «Avísame cuando llegue» sale debajo de «Preguntar a Blue IA»");
    ok(((await avisar.first().boundingBox())?.height ?? 0) >= 44, `D: la fila de «Avísame cuando llegue» mide 44 px o más (${Math.round((await avisar.first().boundingBox())?.height ?? 0)})`);
    await capturar(p, "D-sin-resultados");
    await preguntar.click();
    await p.waitForURL(/\/blue-ia\?q=zzzxx/, { timeout: 15000 }).then(
      () => ok(true, "D: lleva a /blue-ia?q=zzzxx"),
      () => ok(false, `D: debía llevar a /blue-ia?q=zzzxx (está en ${p.url()})`)
    );
    await p.close();
  }

  // H) Sin sesión: «Avísame cuando llegue» lleva a iniciar sesión y no crea nada
  {
    const antes = creados.length;
    const p = await nueva(ctx);
    await escribir(p, "zzzxx");
    await p.locator("#buscador-resultados").getByRole("link", { name: /Avísame cuando llegue: zzzxx/ }).click();
    await p.waitForURL(/\/perfil\?aviso=/, { timeout: 15000 }).then(
      () => ok(true, "H: sin sesión, tocarla lleva a /perfil?aviso=… (iniciar sesión)"),
      () => ok(false, `H: sin sesión debía llevar a /perfil?aviso=… (está en ${p.url()})`)
    );
    ok(creados.length === antes, "H: sin sesión no se crea ningún aviso");
    await p.close();
  }

  // I) Con sesión (simulada): crea el aviso, lo confirma y el panel se cierra solo; límite de 10 y error
  {
    const conSesion = await contexto(navegador, true);
    const casos = [
      { texto: "zzzxx", respuesta: { status: 201, cuerpo: "" }, mensaje: "Hecho: Blue te avisará en cuanto llegue.", nombre: "se crea" },
      { texto: "zzzyy", respuesta: { status: 400, cuerpo: JSON.stringify({ code: "P0001", message: "Solo puedes tener 10 avisos", details: null, hint: null }) }, mensaje: "Ya tienes 10 avisos", nombre: "límite de 10" },
      { texto: "zzzww", respuesta: { status: 500, cuerpo: JSON.stringify({ message: "fallo simulado" }) }, mensaje: "No se ha podido crear el aviso", nombre: "error" },
    ];
    for (const caso of casos) {
      Object.assign(respuestaAviso, caso.respuesta);
      const antes = creados.length;
      const p = await nueva(conSesion);
      const campo = await escribir(p, caso.texto);
      const panel = p.locator("#buscador-resultados");
      const fila = panel.getByRole("link", { name: new RegExp(`Avísame cuando llegue: ${caso.texto}`) });
      ok((await fila.count()) === 1, `I (${caso.nombre}): con sesión sale la fila «Avísame cuando llegue»`);
      await fila.click();
      const dicho = await panel.getByText(caso.mensaje).waitFor({ timeout: 8000 }).then(() => true, () => false);
      ok(dicho, `I (${caso.nombre}): el panel confirma «${caso.mensaje}…»`);
      ok(creados.length === antes + 1 && creados[creados.length - 1] === caso.texto, `I (${caso.nombre}): la tienda intentó crear el aviso con lo escrito («${creados[creados.length - 1] ?? ""}»)`);
      if (caso.nombre === "se crea") await capturar(p, "I-aviso-creado");
      ok(await panel.waitFor({ state: "detached", timeout: 7000 }).then(() => true, () => false), `I (${caso.nombre}): el panel se cierra solo`);
      ok((await campo.inputValue()) === "", `I (${caso.nombre}): y el campo queda vacío`);
      ok(p.errores.length === 0, `I (${caso.nombre}): sin errores de consola ni de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
      await p.close();
    }
    Object.assign(respuestaAviso, { status: 201, cuerpo: "" });
    await conSesion.close();
  }

  // E) Diseño en 390 px, «x» y Escape
  {
    const p = await nueva(ctx);
    const campo = await escribir(p, "inicio de sesion");
    const panel = p.locator("#buscador-resultados");
    const caja = await panel.boundingBox();
    const barra = await p.locator("#buscador-flotante").boundingBox();
    ok(!!caja && !!barra && caja.x >= 0 && caja.x + caja.width <= 390 + 0.5, `E: el panel cabe en el ancho de la pantalla (x ${Math.round(caja?.x ?? -1)}, ancho ${Math.round(caja?.width ?? -1)} de 390)`);
    ok(!!caja && !!barra && caja.y >= barra.y + barra.height - 1, "E: queda debajo de la barra (la barra está arriba por defecto)");
    const alturas = await panel.getByRole("link").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    ok(alturas.length > 0 && alturas.every((h) => h >= 44), `E: cada fila mide 44 px o más (${alturas.join(", ")})`);
    const anchos = await p.evaluate(() => ({ pantalla: window.innerWidth, pagina: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) }));
    ok(anchos.pagina <= anchos.pantalla + 1, `E: la página no se ensancha (${anchos.pagina}/${anchos.pantalla})`);
    await campo.press("Escape");
    ok(await panel.waitFor({ state: "detached", timeout: 3000 }).then(() => true, () => false), "E: Escape cierra el panel");
    await campo.fill("blog");
    await panel.waitFor({ timeout: 5000 }).catch(() => {});
    await p.getByRole("button", { name: "Borrar búsqueda" }).click();
    ok(await panel.waitFor({ state: "detached", timeout: 3000 }).then(() => true, () => false) && (await campo.inputValue()) === "", "E: la «x» borra lo escrito y cierra el panel");
    ok(p.errores.length === 0, `E: sin errores de consola ni de JavaScript (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
    await p.close();
  }

  // F) Con la barra abajo, el panel sale encima
  {
    const p = await nueva(ctx);
    const campo = p.getByRole("textbox", { name: /^Buscar/ });
    await campo.waitFor({ timeout: 30000 });
    const b0 = await p.locator("#buscador-flotante").boundingBox();
    // Se arrastra con UN DEDO (eventos táctiles reales) desde el icono de la lupa, a la izquierda de la barra.
    const x = b0.x + b0.width * 0.1;
    const y0 = b0.y + b0.height / 2;
    const dedo = await ctx.newCDPSession(p);
    const toque = (tipo, yy) => dedo.send("Input.dispatchTouchEvent", { type: tipo, touchPoints: tipo === "touchEnd" ? [] : [{ x, y: yy }] });
    await toque("touchStart", y0);
    for (let i = 1; i <= 20; i++) await toque("touchMove", y0 + ((740 - y0) * i) / 20);
    await toque("touchEnd", 740);
    await p.waitForTimeout(900);
    const b1 = await p.locator("#buscador-flotante").boundingBox();
    ok(b1.y > b0.y + 200, `F: la barra se arrastra abajo (de y=${Math.round(b0.y)} a y=${Math.round(b1.y)})`);
    await escribir(p, "consola");
    const caja = await p.locator("#buscador-resultados").boundingBox();
    const b2 = await p.locator("#buscador-flotante").boundingBox();
    ok(!!caja && caja.y + caja.height <= b2.y + 1 && caja.y >= 0, `F: el panel sale ENCIMA de la barra (panel hasta y=${Math.round((caja?.y ?? 0) + (caja?.height ?? 0))}, barra en y=${Math.round(b2.y)})`);
    await capturar(p, "F-barra-abajo");
    await p.close();
  }

  // G) Escritorio (1280×800): el panel tiene el ancho de la barra, no se estira
  {
    const escritorio = await navegador.newContext({ viewport: { width: 1280, height: 800 }, locale: "es-ES" });
    await escritorio.addInitScript(() => {
      try {
        localStorage.setItem("videojuegoos.analytics.consent", "declined");
        localStorage.setItem("videojuegoszaragoza:guia_vista", "1");
      } catch {
        // sin almacenamiento
      }
    });
    await escritorio.route("**/rest/v1/**", async (r) => {
      const peticion = r.request();
      if (!["GET", "HEAD"].includes(peticion.method())) return r.abort();
      const url = new URL(peticion.url());
      if (url.pathname.endsWith("/products") && /ilike/.test(url.searchParams.get("or") ?? "")) {
        return r.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "0-1/2" }, body: JSON.stringify(PRODUCTOS) });
      }
      if (url.pathname.endsWith("/product_media") && /00000000-0000-4000-8000-0000000000c/.test(url.search)) return r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return r.continue();
    });
    const p = await nueva(escritorio);
    await escribir(p, "consola");
    const caja = await p.locator("#buscador-resultados").boundingBox();
    const barra = await p.locator("#buscador-flotante").boundingBox();
    ok(!!caja && caja.width <= 761 && caja.y >= barra.y + barra.height - 1, `G: en escritorio el panel mide ${Math.round(caja?.width ?? 0)} px (máx. 760) y queda bajo la barra`);
    await capturar(p, "G-escritorio");
    await p.close();
    await escritorio.close();
  }

  ok(buscadas.length > 0 && buscadas.every((t) => t.length >= 2), `la tienda solo buscó con 2 letras o más (${buscadas.length} búsquedas)`);
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
