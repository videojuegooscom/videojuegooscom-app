/**
 * pruebas/sin-fotos-reales.mjs — las pruebas de navegador NUNCA descargan fotos reales de Supabase.
 *
 * Por qué: el 2026-10-23 Supabase cortó la tienda (plan gratuito: «Salida en caché» 25,4 de 5 GB al mes). En las
 * pruebas locales (http://127.0.0.1) SmartImage no puede usar el optimizador de Vercel y pide la foto ORIGINAL al
 * almacenamiento de Supabase, y cada recorrido de pruebas bajaba decenas de MB. Ahora cada foto se sustituye por
 * una imagen falsa de 1 × 1 píxel que nunca sale del navegador.
 *
 * Cómo se usa (todas las pruebas de navegador): en vez de `chromium.launch()`,
 *   import { lanzarNavegador } from "./sin-fotos-reales.mjs";
 *   const navegador = await lanzarNavegador(ok);     // ok(cond, msg) de la propia prueba
 * Desde ahí, todo contexto (navegador.newContext) y toda página (contexto.newPage) responde con la imagen falsa a
 * cualquier petición de foto: /storage/v1/object/…, /storage/v1/render/… (de cualquier proyecto) y el optimizador
 * /_vercel/image. Las demás peticiones siguen igual. Aunque la prueba registre después sus propias rutas (p. ej.
 * «**\/*» con continue), la de las fotos se vuelve a poner la última y gana siempre (Playwright prueba las rutas de
 * la última registrada a la primera, y las de la página antes que las del contexto). Si aun así llegara una foto
 * real, se apunta y, al cerrar el navegador, la prueba FALLA con la dirección de la foto.
 *
 * Ejecutado solo (`node pruebas/sin-fotos-reales.mjs`) se comprueba a sí mismo, sin Internet:
 *  1. Ninguna prueba de pruebas/ abre el navegador sin pasar por aquí (salvo todas.mjs, que solo lo abre y cierra
 *     para ver si existe).
 *  2. Con una página local que pide dos fotos (una a este servidor y otra a un dominio inventado), con rutas
 *     «continue» de la prueba en el contexto y en la página: las dos fotos llegan falsas (1 × 1), el servidor no
 *     sirve ninguna y lo que no es foto sí pasa.
 *  3. Prueba de la prueba: sin esta protección la misma página SÍ descarga la foto del servidor y el vigilante lo
 *     detecta (si no, las comprobaciones de arriba no demostrarían nada).
 */
import { createServer } from "node:http";
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

// PNG de 1 × 1 píxel (67 bytes).
const PNG_FALSO = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const MARCA = "x-prueba-foto-falsa";

export function esFoto(url) {
  try {
    const { pathname } = new URL(url);
    return pathname.startsWith("/storage/v1/object/") || pathname.startsWith("/storage/v1/render/") || pathname === "/_vercel/image";
  } catch {
    return false;
  }
}

// Cuántas fotos se han sustituido y cuáles se han colado (todas las pruebas de este proceso).
export const fotos = { falsas: 0, reales: [] };

const coincide = (url) => esFoto(url.href);
const servirFalsa = (ruta) => {
  // Solo las descargas: una subida (POST/PUT, p. ej. la foto de perfil) sigue a las rutas de la prueba, que la simulan.
  if (!["GET", "HEAD"].includes(ruta.request().method())) return ruta.fallback();
  fotos.falsas += 1;
  return ruta.fulfill({
    status: 200,
    contentType: "image/png",
    headers: { [MARCA]: "1", "access-control-allow-origin": "*", "cache-control": "no-store" },
    body: PNG_FALSO,
  });
};

// Pone la ruta de las fotos en un contexto o una página y hace que siga siendo la última aunque la prueba añada otras.
async function proteger(objetivo) {
  const poner = objetivo.route.bind(objetivo);
  const quitar = objetivo.unroute.bind(objetivo);
  await poner(coincide, servirFalsa);
  objetivo.route = async (...args) => {
    const r = await poner(...args);
    await quitar(coincide, servirFalsa);
    await poner(coincide, servirFalsa);
    return r;
  };
}

// Apunta toda foto que llegue de la red (sin la marca de la falsa).
export function vigilarFugas(contexto, registro = fotos.reales) {
  contexto.on("response", (res) => {
    if (esFoto(res.url()) && res.request().method() === "GET" && res.headers()[MARCA] !== "1") registro.push(res.url());
  });
}

async function protegerContexto(contexto) {
  await proteger(contexto);
  vigilarFugas(contexto);
  const nuevaPagina = contexto.newPage.bind(contexto);
  contexto.newPage = async (...args) => {
    const pagina = await nuevaPagina(...args);
    await proteger(pagina);
    return pagina;
  };
}

/** Abre Chromium sin pantalla con las fotos de Supabase sustituidas. `ok(cond, msg)`: la de la prueba. */
export async function lanzarNavegador(ok, opciones) {
  const navegador = await chromium.launch(opciones);
  const nuevoContexto = navegador.newContext.bind(navegador);
  navegador.newContext = async (...args) => {
    const contexto = await nuevoContexto(...args);
    await protegerContexto(contexto);
    return contexto;
  };
  // navegador.newPage() crearía un contexto sin protección: se hace con uno protegido.
  navegador.newPage = async (...args) => {
    const contexto = await navegador.newContext(...args);
    const pagina = await contexto.newPage();
    pagina.on("close", () => contexto.close().catch(() => {}));
    return pagina;
  };
  const cerrar = navegador.close.bind(navegador);
  let comprobado = false;
  navegador.close = async (...args) => {
    if (!comprobado && typeof ok === "function") {
      comprobado = true;
      ok(
        fotos.reales.length === 0,
        fotos.reales.length
          ? `se descargaron ${fotos.reales.length} fotos reales de Supabase (p. ej. ${fotos.reales[0].slice(0, 120)})`
          : `ninguna foto real descargada de Supabase (${fotos.falsas} sustituidas por una falsa)`
      );
    }
    return cerrar(...args);
  };
  return navegador;
}

// --- comprobación propia (solo si se ejecuta este archivo) ---------------------------------------------------------

async function comprobar() {
  const fallos = [];
  const ok = (cond, msg) => {
    console.log(`${cond ? "OK   " : "FALLO"} ${msg}`);
    if (!cond) fallos.push(msg);
  };

  // 1. Ninguna prueba abre el navegador por su cuenta.
  const carpeta = dirname(fileURLToPath(import.meta.url));
  const propio = basename(fileURLToPath(import.meta.url));
  for (const archivo of readdirSync(carpeta).filter((f) => f.endsWith(".mjs") && f !== propio).sort()) {
    const texto = readFileSync(join(carpeta, archivo), "utf8");
    const abreNavegador = /playwright-core/.test(texto) || /chromium\.launch/.test(texto);
    if (!abreNavegador) continue;
    if (archivo === "todas.mjs") {
      // Solo abre y cierra Chromium para saber si está instalado: no carga ninguna página.
      ok(!/newPage|goto\(/.test(texto), "todas.mjs solo abre y cierra el navegador (no carga páginas)");
      continue;
    }
    ok(
      texto.includes("./sin-fotos-reales.mjs") && texto.includes("lanzarNavegador(") && !/chromium\.launch/.test(texto),
      `${archivo} abre el navegador con lanzarNavegador (fotos falsas)`
    );
  }

  // 2 y 3. Una página local que pide dos fotos y un recurso que no es foto.
  let servidasReales = 0;
  let pings = 0;
  const servidor = createServer((req, res) => {
    const ruta = (req.url ?? "/").split("?")[0];
    if (ruta.startsWith("/storage/v1/object/")) {
      servidasReales += 1;
      // Foto «real» de 2 × 2 para distinguirla de la falsa.
      res.writeHead(200, { "content-type": "image/svg+xml" });
      res.end('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#1EA7E8"/></svg>');
      return;
    }
    if (ruta === "/ping") {
      pings += 1;
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(
      '<!doctype html><html><body><img id="a" src="/storage/v1/object/public/product-media/prueba.png">' +
        '<img id="b" src="https://fotos.ejemplo.invalid/storage/v1/object/public/noticias/prueba.png">' +
        '<script>fetch("/ping")</script></body></html>'
    );
  });
  await new Promise((listo) => servidor.listen(0, "127.0.0.1", listo));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const anchos = (p) =>
    p.evaluate(async () => {
      const imgs = [document.getElementById("a"), document.getElementById("b")];
      await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))));
      return imgs.map((i) => i.naturalWidth);
    });

  try {
    const protegido = await lanzarNavegador(null);
    try {
      const ctx = await protegido.newContext();
      // Como hacen muchas pruebas: una ruta «todo pasa» registrada DESPUÉS, en el contexto y en la página.
      await ctx.route("**/*", (r) => r.continue());
      const p = await ctx.newPage();
      await p.route("**/*", (r) => r.continue());
      await p.goto(`${base}/pagina`, { waitUntil: "load" });
      await p.waitForTimeout(500);
      const [a, b] = await anchos(p);
      ok(a === 1 && b === 1, `con la protección las dos fotos llegan falsas (1 × 1 px; recibidas ${a} y ${b})`);
      ok(servidasReales === 0, `con la protección el servidor no sirve ninguna foto (${servidasReales})`);
      ok(fotos.reales.length === 0 && fotos.falsas >= 2, `el vigilante no ve fugas y cuenta las falsas (${fotos.falsas})`);
      ok(pings >= 1, "lo que no es foto sigue llegando al servidor");
      // navegador.newPage() también va protegido.
      const suelta = await protegido.newPage();
      await suelta.goto(`${base}/pagina`, { waitUntil: "load" });
      const [c] = await anchos(suelta);
      ok(c === 1 && servidasReales === 0, "navegador.newPage() también sustituye las fotos");
    } finally {
      await protegido.close();
    }

    // Prueba de la prueba: sin protección la foto SÍ se descarga y el vigilante lo detecta.
    const sinProteger = await chromium.launch();
    try {
      const ctx = await sinProteger.newContext();
      const fugas = [];
      vigilarFugas(ctx, fugas);
      // La foto del dominio inventado no debe salir a Internet ni aquí: se corta.
      await ctx.route((u) => u.hostname.endsWith(".invalid"), (r) => r.abort());
      const p = await ctx.newPage();
      await p.goto(`${base}/pagina`, { waitUntil: "load" });
      await p.waitForTimeout(500);
      const [a] = await anchos(p);
      ok(servidasReales >= 1 && a === 2, `control: sin la protección la foto se descarga de verdad (${servidasReales}, ${a} px)`);
      ok(fugas.length >= 1, "control: el vigilante detecta la foto real descargada");
    } finally {
      await sinProteger.close();
    }
  } catch (e) {
    fallos.push(`la comprobación se cortó: ${String(e.stack ?? e).slice(0, 600)}`);
  } finally {
    servidor.close();
  }

  for (const f of fallos) console.log(`FALLO ${f}`);
  console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
  process.exit(fallos.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await comprobar();
