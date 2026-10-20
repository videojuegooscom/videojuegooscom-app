/**
 * pruebas/guia-blue.mjs — recorre ENTERA la guía de bienvenida de Blue, paso a paso, como un iPhone (390×844).
 *
 * Qué hace: abre la tienda compilada (carpeta dist), abre Blue → «Ver la guía de la tienda» y va pulsando
 * «Siguiente» hasta el final, comprobando en cada paso lo que debe verse y haciendo una captura. Las consultas de
 * productos del buscador se SIMULAN (tres «recientes» y tres «antiguos») y toda escritura a la base de datos se corta.
 * Comprueba:
 *  - La tarjeta tiene SIEMPRE el mismo alto y «Siguiente» queda siempre en el mismo sitio, a la altura del pulgar
 *    derecho (entre el 60 % y el 90 % de la pantalla), sin tapar la barra de abajo ni salirse por los lados.
 *  - «Las 5 secciones»: los cinco nombres de la barra de abajo se escriben con el brillo de Siri y se puede pasar de
 *    una sección a otra desde la tarjeta sin salir de la guía.
 *  - «Vender ahora»: una mano pulsa el botón, la guía pasa sola al formulario «Vender mi artículo», el formulario se
 *    desplaza un poco, y el paso siguiente señala la flecha para salir (y al saltar la guía desde ahí se vuelve a Inicio).
 *  - «El buscador»: se escribe solo «lo último añadido» y «lo más antiguo» con letras de Siri y salen sus productos.
 *  - «Perfil»: el recuadro rodea las pestañas del perfil.
 *  - Los pasos de «tocar» llevan la mano; ninguna página se ensancha; no hay errores de JavaScript.
 * NO toca producción: las únicas peticiones a Supabase real son lecturas (GET) que no sean de la búsqueda.
 *
 * Uso: node pruebas/guia-blue.mjs [carpeta_dist] [carpeta_capturas]     (por defecto dist y sin capturas)
 * Requisitos: playwright-core y npm run build hecho.
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
const SALIDA = process.argv[3] ? resolve(process.argv[3]) : null;
if (SALIDA) mkdirSync(SALIDA, { recursive: true });

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
const info = (msg) => console.log(`INFO ${msg}`);

const fila = (n, titulo, precio) => ({ id: `00000000-0000-4000-8000-0000000000d${n}`, title: titulo, price_eur: precio, images: [] });
const RECIENTES = [fila(1, "Reciente Uno", 300), fila(2, "Reciente Dos", 200), fila(3, "Reciente Tres", 100)];
const ANTIGUOS = [fila(4, "Antiguo Uno", 40), fila(5, "Antiguo Dos", 30), fila(6, "Antiguo Tres", 20)];

const IPHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-ES" };
const capturar = (p, nombre) => (SALIDA ? p.screenshot({ path: join(SALIDA, `${nombre}.png`) }) : Promise.resolve());

async function contexto(navegador) {
  const ctx = await navegador.newContext(IPHONE);
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("videojuegoszaragoza:guia_vista", "1");
      localStorage.setItem("videojuegoos.analytics.consent", "declined");
    } catch {
      // sin almacenamiento
    }
  });
  await ctx.route("**/rest/v1/**", async (r) => {
    const peticion = r.request();
    if (!["GET", "HEAD"].includes(peticion.method())) return r.abort();
    const url = new URL(peticion.url());
    if (url.pathname.endsWith("/products") && url.searchParams.get("select") === "id,title,price_eur,images") {
      const filas = url.searchParams.get("or") ? [] : url.searchParams.get("order") === "created_at.asc" ? ANTIGUOS : RECIENTES;
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "content-range": filas.length ? `0-${filas.length - 1}/${filas.length}` : "*/0" },
        body: JSON.stringify(filas),
      });
    }
    if (url.pathname.endsWith("/product_media") && /00000000-0000-4000-8000-0000000000d/.test(url.search)) {
      return r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    return r.continue();
  });
  return ctx;
}

const rect = async (loc) => (await loc.first().boundingBox().catch(() => null)) ?? null;
const centro = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

async function abrirGuia(ctx) {
  const p = await ctx.newPage();
  p.errores = [];
  p.on("pageerror", (e) => p.errores.push(`error JS: ${e.message.slice(0, 160)}`));
  await p.goto(BASE + "/", { waitUntil: "load", timeout: 60000 });
  await p.waitForSelector("#blue-flotante", { timeout: 25000 });
  await p.waitForTimeout(1500);
  await p.locator('[aria-label="Abrir Blue, el asistente de la tienda"]').tap();
  await p.waitForTimeout(800);
  await p.getByRole("tab", { name: "Asistente" }).tap();
  await p.waitForTimeout(400);
  await p.getByText("Ver la guía de la tienda").tap();
  await p.locator("#guia-tarjeta").waitFor({ timeout: 15000 });
  return p;
}

const navegador = await chromium.launch();
try {
  const ctx = await contexto(navegador);
  const p = await abrirGuia(ctx);
  const siguiente = p.locator('[aria-label="Paso siguiente"]');
  const tarjeta = p.locator("#guia-tarjeta");
  const manos = p.getByText("👆");

  const TITULOS = [
    "¡Hola! Soy Blue", "Las 5 secciones", "Inicio", "Ver categorías", "Las categorías", "Vender ahora", "Vender mi artículo",
    "Para salir", "El buscador", "Perfil", "Cesta", "Foro", "Cambia de pestaña", "Blue IA", "Este soy yo", "Instala la tienda",
    "Reparación y limpieza", "Tu cuenta",
  ];
  const GESTO_TOQUE = ["Inicio", "Ver categorías", "Vender ahora", "Para salir", "Cesta", "Foro", "Cambia de pestaña", "Blue IA", "Este soy yo"];
  let referencia = null; // dónde está «Siguiente» y cuánto mide la tarjeta (en el paso 1)
  let vistos = 0;
  let titulo = "";
  // Los pasos cuyo objetivo es un botón FLOTANTE (no se puede desplazar) pueden obligar a mover la tarjeta.
  const PUEDE_MOVER_TARJETA = ["Cambia de pestaña"];

  for (let i = 0; i < 20; i++) {
    await p.waitForTimeout(1200);
    const texto = await tarjeta.innerText().catch(() => "");
    titulo = TITULOS.find((t) => texto.split("\n").some((l) => l.trim() === t)) ?? "";
    if (!titulo) {
      ok(false, `paso ${i + 1}: no se reconoce el título de la tarjeta («${texto.replace(/\n/g, " | ").slice(0, 80)}»)`);
      break;
    }
    vistos++;
    await capturar(p, `${String(i + 1).padStart(2, "0")}-${titulo.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`);
    const t = await rect(tarjeta);
    const s = await rect(siguiente);
    const alto = 844;

    // --- la tarjeta y «Siguiente» -------------------------------------------------------------
    if (titulo !== "Tu cuenta") {
      if (!referencia) referencia = { s, alto: t.height };
      const c = centro(s);
      ok(!!t && !!s && Math.abs(t.height - referencia.alto) < 2, `${titulo}: la tarjeta mide ${Math.round(t?.height ?? 0)} px (siempre lo mismo)`);
      if (!PUEDE_MOVER_TARJETA.includes(titulo)) {
        ok(Math.abs(s.y - referencia.s.y) < 2 && Math.abs(s.x - referencia.s.x) < 2, `${titulo}: «Siguiente» está en el mismo sitio de siempre (y ${Math.round(c.y)})`);
      } else {
        info(`${titulo}: lo señalado es un botón flotante y la tarjeta se aparta de él (Siguiente en y ${Math.round(c.y)})`);
      }
      ok(c.y / alto > 0.6 && c.y / alto < 0.9, `${titulo}: «Siguiente» está a la altura del pulgar (${Math.round((c.y / alto) * 100)} % de la pantalla)`);
    }
    ok(t.x >= 0 && t.x + t.width <= 390.5, `${titulo}: la tarjeta cabe en el ancho (${Math.round(t.x)}–${Math.round(t.x + t.width)})`);
    if (GESTO_TOQUE.includes(titulo) && titulo !== "Para salir" && titulo !== "Vender ahora") {
      ok((await manos.count()) >= 1, `${titulo}: una mano enseña dónde tocar`);
    }

    // --- cada paso con su demostración ---------------------------------------------------------
    if (titulo === "¡Hola! Soy Blue") {
      ok((await manos.count()) >= 1, "primer paso: una mano toca «Empezar» (más intuitivo)");
      ok((await p.locator("#guia-aro").count()) === 0, "primer paso: sin recuadro (no señala nada)");
    }

    if (titulo === "Las 5 secciones") {
      await p.waitForTimeout(7500);
      const escritos = await p.evaluate(() => Array.from(document.querySelectorAll(".vz-siri-texto")).map((e) => e.textContent.trim()));
      ok(["Inicio", "Perfil", "Cesta", "Foro", "Blue IA"].every((n) => escritos.includes(n)), `Las 5 secciones: los 5 nombres de la barra de abajo se escriben con el brillo de Siri (${escritos.join(", ")})`);
      const aro = await rect(p.locator("#guia-aro"));
      ok(!!aro && aro.y > 700 && aro.width > 300, `Las 5 secciones: el recuadro rodea la barra de abajo (y ${Math.round(aro?.y ?? 0)}, ancho ${Math.round(aro?.width ?? 0)})`);
      for (const [nombre, ruta] of [["Cesta", /\/cesta/], ["Foro", /\/chat-global/], ["Perfil", /\/perfil/]]) {
        await p.getByRole("button", { name: `Ir a ${nombre}` }).tap();
        await p.waitForTimeout(1300);
        ok(ruta.test(p.url()) && (await tarjeta.innerText()).includes("Las 5 secciones"), `Las 5 secciones: «Ir a ${nombre}» cambia a esa sección (${new URL(p.url()).pathname}) y la guía sigue en este paso`);
      }
      await capturar(p, "02b-secciones-cambiando");
    }

    if (titulo === "Vender ahora") {
      ok((await manos.count()) >= 1, "Vender ahora: una mano pulsa el botón");
      const seguir = await p.getByText("Vender mi artículo").first().waitFor({ timeout: 8000 }).then(() => true, () => false);
      ok(seguir && /\/vender/.test(p.url()), `Vender ahora: la guía pasa sola al formulario (${new URL(p.url()).pathname})`);
      await p.waitForTimeout(500);
    }

    if (titulo === "Vender mi artículo") {
      let maximo = 0;
      let medidas = null;
      for (let k = 0; k < 14; k++) {
        medidas = await p.evaluate(() => {
          const h = document.getElementById("vender-scroll");
          return h ? { arriba: h.scrollTop, contenido: h.scrollHeight, visible: h.clientHeight } : null;
        });
        maximo = Math.max(maximo, medidas?.arriba ?? 0);
        if (maximo > 150) break;
        await p.waitForTimeout(400);
      }
      ok(maximo > 150, `Vender mi artículo: el formulario se desplaza un poco hacia abajo (${Math.round(maximo)} px; formulario ${medidas ? `${medidas.contenido} px de alto en ${medidas.visible}` : "no encontrado"})`);
      ok((await p.locator("#guia-aro").count()) === 0, "Vender mi artículo: no se oscurece el formulario");
      await capturar(p, "07b-formulario-desplazado");
    }

    if (titulo === "Para salir") {
      const flecha = await rect(p.locator('[aria-label="Volver atrás"]'));
      const aro = await rect(p.locator("#guia-aro"));
      ok(!!flecha && !!aro && Math.abs(centro(aro).x - centro(flecha).x) < 30 && Math.abs(centro(aro).y - centro(flecha).y) < 30,
        `Para salir: el recuadro rodea la flecha de volver (aro ${aro ? Math.round(centro(aro).x) + "," + Math.round(centro(aro).y) : "—"}, flecha ${flecha ? Math.round(centro(flecha).x) + "," + Math.round(centro(flecha).y) : "—"})`);
      ok((await manos.count()) >= 1, "Para salir: una mano toca la flecha");
    }

    if (titulo === "El buscador") {
      ok(new URL(p.url()).pathname === "/", "El buscador: la guía ha vuelto a Inicio al salir del formulario");
      const escribiendo = await p.waitForFunction(() => {
        const e = document.querySelector("#buscador-flotante .vz-siri-texto");
        return !!e && e.textContent.trim().length >= 3;
      }, null, { timeout: 12000 }).then(() => true, () => false);
      ok(escribiendo, "El buscador: se escribe solo un ejemplo en la barra con letras de Siri");
      const panelUno = await p.locator("#buscador-resultados").getByText("Lo último añadido").waitFor({ timeout: 12000 }).then(() => true, () => false);
      const recientes = await p.locator("#buscador-resultados").getByText("Reciente Uno").waitFor({ timeout: 8000 }).then(() => true, () => false);
      ok(panelUno && recientes, "El buscador: «lo último añadido» enseña los productos más recientes");
      await capturar(p, "09a-buscador-ultimo");
      const aro = await rect(p.locator("#guia-aro"));
      const panel = await rect(p.locator("#buscador-resultados"));
      ok(!!aro && !!panel && aro.y + aro.height >= panel.y + panel.height - 2, "El buscador: el recuadro ilumina también los resultados");
      const panelDos = await p.locator("#buscador-resultados").getByText("Lo más antiguo").waitFor({ timeout: 16000 }).then(() => true, () => false);
      const antiguos = await p.locator("#buscador-resultados").getByText("Antiguo Uno").waitFor({ timeout: 8000 }).then(() => true, () => false);
      ok(panelDos && antiguos, "El buscador: «lo más antiguo» enseña los productos más antiguos");
      await p.waitForTimeout(600);
      await capturar(p, "09b-buscador-antiguo");
      await p.getByRole("button", { name: "Ejemplo: lo último añadido" }).tap();
      const otraVez = await p.locator("#buscador-resultados").getByText("Reciente Uno").waitFor({ timeout: 10000 }).then(() => true, () => false);
      ok(otraVez, "El buscador: tocar un ejemplo lo repite");
    }

    if (titulo === "Perfil") {
      ok(/\/perfil/.test(p.url()), "Perfil: la guía lleva a Perfil");
      const aro = await rect(p.locator("#guia-aro"));
      // Se mide el que se ve (otras pantallas ya visitadas pueden dejar uno oculto de 0×0 en la página).
      const pestanas = await p.evaluate(() => {
        const r = Array.from(document.querySelectorAll("#perfil-acceso, #perfil-pestanas"))
          .map((e) => e.getBoundingClientRect())
          .find((b) => b.width > 4 && b.height > 4);
        return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
      });
      const cuantos = await p.locator("#perfil-acceso, #perfil-pestanas").count();
      info(`Perfil: hay ${cuantos} elemento(s) de pestañas en la página`);
      const caja = (b) => (b ? `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}×${Math.round(b.height)}` : "—");
      ok(!!aro && !!pestanas && aro.x <= pestanas.x + 2 && aro.y <= pestanas.y + 2 && aro.x + aro.width >= pestanas.x + pestanas.width - 2 && aro.y + aro.height >= pestanas.y + pestanas.height - 2,
        `Perfil: el recuadro rodea las pestañas de la cuenta (recuadro ${caja(aro)}, pestañas ${caja(pestanas)})`);
    }

    // Pantalla: nada se ensancha
    const anchos = await p.evaluate(() => ({ pantalla: window.innerWidth, pagina: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) }));
    ok(anchos.pagina <= anchos.pantalla + 1, `${titulo}: la página no se ensancha (${anchos.pagina}/${anchos.pantalla})`);

    if (titulo === "Tu cuenta") break;
    // «Vender ahora» pasa solo al formulario: no hay que tocar nada (si se tocara, se saltaría «Vender mi artículo»).
    if (titulo === "Vender ahora") continue;
    if (!(await siguiente.count())) break;
    await siguiente.tap();
  }

  ok(vistos >= 17, `se recorren ${vistos} pasos de la guía (17 o 18 según se pueda instalar la tienda)`);
  ok(titulo === "Tu cuenta", "el último paso es «Tu cuenta»");
  await p.getByText("Ahora no, gracias").tap();
  await p.locator("#guia-tarjeta").waitFor({ state: "detached", timeout: 8000 }).then(
    () => ok(true, "«Ahora no, gracias» cierra la guía"),
    () => ok(false, "«Ahora no, gracias» debía cerrar la guía")
  );
  ok(p.errores.length === 0, `sin errores de JavaScript en toda la guía (${p.errores.length}${p.errores[0] ? ": " + p.errores[0] : ""})`);
  await p.close();

  // Saltar con el formulario de Vender abierto (era solo una demostración): se vuelve a Inicio.
  {
    const q = await abrirGuia(ctx);
    const siguienteQ = q.locator('[aria-label="Paso siguiente"]');
    for (let i = 0; i < 6; i++) {
      await q.waitForTimeout(900);
      if (/\/vender/.test(q.url())) break;
      await siguienteQ.tap();
    }
    await q.waitForFunction(() => location.pathname.startsWith("/vender"), null, { timeout: 12000 }).catch(() => {});
    ok(/\/vender/.test(q.url()), "para probar «Saltar», la guía llegó al formulario de Vender");
    await q.getByRole("button", { name: "Saltar la guía" }).tap();
    await q.waitForTimeout(1500);
    ok(new URL(q.url()).pathname === "/" && (await q.locator("#guia-tarjeta").count()) === 0, `«Saltar» desde el formulario cierra la guía y vuelve a Inicio (${new URL(q.url()).pathname})`);
    await q.close();
  }
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
