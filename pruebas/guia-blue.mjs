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
 *  - En CADA paso y tamaño de pantalla: lo señalado cabe en la pantalla y la tarjeta no lo tapa, y todo lo que se
 *    toca en la tarjeta mide al menos 44 px (regla «Todo al alcance del pulgar derecho»).
 *  - Después del recorrido: volver atrás paso a paso, deslizar con un dedo, «Saltar» a mitad de la guía y la primera
 *    visita (la guía se ofrece sola UNA vez por dispositivo: regla «Los avisos y pistas de Blue salen una sola vez»).
 * NO toca producción: las únicas peticiones a Supabase real son lecturas (GET) que no sean de la búsqueda.
 *
 * Uso: node pruebas/guia-blue.mjs [carpeta_dist] [carpeta_capturas] [opciones]
 *      (por defecto dist, sin capturas, iPhone 390×844 y productos del buscador simulados)
 * Opciones:
 *   --vista=375x667        otro tamaño de pantalla (ancho×alto)
 *   --escritorio           ratón en vez de dedo (por defecto 1280x800)
 *   --real=https://…       prueba la tienda REAL (solo lecturas: toda petición que no sea GET se corta) en vez de dist
 *   --movimiento-reducido  el navegador pide «reducir movimiento»
 *   --sin-extra            solo el recorrido principal (sin atrás, deslizar, saltar ni primera visita)
 * Requisitos: playwright-core y, sin --real, npm run build hecho.
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright-core";

const argumentos = process.argv.slice(2);
const opciones = Object.fromEntries(
  argumentos.filter((a) => a.startsWith("--")).map((a) => {
    const [k, ...v] = a.slice(2).split("=");
    return [k, v.length ? v.join("=") : true];
  })
);
const posicionales = argumentos.filter((a) => !a.startsWith("--"));
const REAL = opciones.real ? String(opciones.real).replace(/\/$/, "") : null;
const ESCRITORIO = !!opciones.escritorio;
const [VW, VH] = String(opciones.vista ?? (ESCRITORIO ? "1280x800" : "390x844")).split("x").map(Number);
const MOVIL = !ESCRITORIO && VW < 700; // en el móvil «Siguiente» debe quedar a la altura del pulgar
const REDUCIR = !!opciones["movimiento-reducido"];
const EXTRA = !opciones["sin-extra"];

const raiz = resolve(posicionales[0] ?? "dist");
if (!REAL && !existsSync(join(raiz, "index.html"))) {
  console.error(`FALLO ${raiz} no tiene index.html: ¿has hecho npm run build?`);
  process.exit(1);
}
const SALIDA = posicionales[1] ? resolve(posicionales[1]) : null;
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
const servidor = REAL ? null : createServer((req, res) => {
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
if (servidor) await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
const BASE = REAL ?? `http://127.0.0.1:${servidor.address().port}`;

const fallos = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "OK   " : "FALLO"} ${msg}`);
  if (!cond) fallos.push(msg);
};
const info = (msg) => console.log(`INFO ${msg}`);

const fila = (n, titulo, precio) => ({ id: `00000000-0000-4000-8000-0000000000d${n}`, title: titulo, price_eur: precio, images: [] });
const RECIENTES = [fila(1, "Reciente Uno", 300), fila(2, "Reciente Dos", 200), fila(3, "Reciente Tres", 100)];
const ANTIGUOS = [fila(4, "Antiguo Uno", 40), fila(5, "Antiguo Dos", 30), fila(6, "Antiguo Tres", 20)];

const DISPOSITIVO = {
  viewport: { width: VW, height: VH },
  deviceScaleFactor: ESCRITORIO ? 1 : 2,
  isMobile: !ESCRITORIO,
  hasTouch: !ESCRITORIO,
  locale: "es-ES",
  reducedMotion: REDUCIR ? "reduce" : "no-preference",
};
const capturar = (p, nombre) => (SALIDA ? p.screenshot({ path: join(SALIDA, `${nombre}.png`) }) : Promise.resolve());

// conGuiaVista: false = visitante nuevo (la guía aún no se le ha ofrecido nunca).
async function contexto(navegador, { conGuiaVista = true } = {}) {
  const ctx = await navegador.newContext(DISPOSITIVO);
  await ctx.addInitScript((marcarGuia) => {
    try {
      if (marcarGuia) localStorage.setItem("videojuegoszaragoza:guia_vista", "1");
      localStorage.setItem("videojuegoos.analytics.consent", "declined");
    } catch {
      // sin almacenamiento
    }
  }, conGuiaVista);
  if (REAL) {
    // Tienda real: solo lecturas. Cualquier otra petición (analítica, escrituras…) se corta.
    await ctx.route("**/*", (r) => (["GET", "HEAD", "OPTIONS"].includes(r.request().method()) ? r.continue() : r.abort()));
    return ctx;
  }
  await ctx.route("**/rest/v1/**", async (r) => {
    const peticion = r.request();
    if (!["GET", "HEAD"].includes(peticion.method())) return r.abort();
    const url = new URL(peticion.url());
    if (url.pathname.endsWith("/products") && url.searchParams.get("select") === "id,title,price_eur,images") {
      const todas = url.searchParams.get("or") ? [] : url.searchParams.get("order") === "created_at.asc" ? ANTIGUOS : RECIENTES;
      // Como PostgREST: .range(0, n - 1) llega como limit=n.
      const filas = todas.slice(0, Number(url.searchParams.get("limit") ?? todas.length));
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
  // Con ratón no hay «tap»: se usa el clic.
  if (ESCRITORIO) {
    const Localizador = Object.getPrototypeOf(p.locator("body"));
    Localizador.tap = Localizador.click;
  }
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
  // Los pasos cuyo objetivo es un botón FLOTANTE (no se puede desplazar) pueden obligar a mover la tarjeta. En pantallas
  // BAJAS (menos de 720 px: iPhone SE, algunos Android) lo señalado a media altura (Perfil) o el propio Blue (abajo a la
  // izquierda) no caben a la vez que una tarjeta de 292 px: ahí también se acepta que la tarjeta se aparte.
  const PANTALLA_BAJA = VH < 720;
  // «Este soy yo» señala al propio Blue, que flota donde se haya apartado (a veces a media altura, bajo la tarjeta).
  const PUEDE_MOVER_TARJETA = ["Cambia de pestaña", "Este soy yo", ...(PANTALLA_BAJA ? ["Perfil"] : [])];

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
    const alto = VH;

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
      if (MOVIL) {
        // Si la tarjeta tiene que apartarse, «Siguiente» sigue al alcance del pulgar (entre el 35 % y el 90 %).
        const desde = PUEDE_MOVER_TARJETA.includes(titulo) ? 0.35 : 0.6;
        ok(c.y / alto > desde && c.y / alto < 0.9, `${titulo}: «Siguiente» está a la altura del pulgar (${Math.round((c.y / alto) * 100)} % de la pantalla)`);
      } else {
        ok(s.y >= 0 && s.y + s.height <= alto, `${titulo}: «Siguiente» se ve entero en la pantalla (y ${Math.round(s.y)}–${Math.round(s.y + s.height)} de ${alto})`);
      }
    }
    ok(t.x >= 0 && t.x + t.width <= VW + 0.5, `${titulo}: la tarjeta cabe en el ancho (${Math.round(t.x)}–${Math.round(t.x + t.width)} de ${VW})`);
    ok(t.y >= 0 && t.y + t.height <= alto + 0.5, `${titulo}: la tarjeta cabe en el alto (${Math.round(t.y)}–${Math.round(t.y + t.height)} de ${alto})`);

    // Lo que se toca en la tarjeta mide 44 px o más (regla «Todo al alcance del pulgar derecho»).
    const botones = await p.evaluate(() =>
      Array.from(document.querySelectorAll('#guia-tarjeta [role="button"]'))
        .map((e) => {
          // El margen táctil (hitSlop) de react-native-web son elementos hijos que sobresalen del botón: cuentan.
          let x1 = Infinity;
          let y1 = Infinity;
          let x2 = -Infinity;
          let y2 = -Infinity;
          for (const n of [e, ...Array.from(e.querySelectorAll("*"))]) {
            const r = n.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) continue;
            x1 = Math.min(x1, r.left);
            y1 = Math.min(y1, r.top);
            x2 = Math.max(x2, r.right);
            y2 = Math.max(y2, r.bottom);
          }
          return { nombre: e.getAttribute("aria-label") || e.textContent.trim().slice(0, 24), w: x2 - x1, h: y2 - y1 };
        })
        .filter((b) => Number.isFinite(b.w) && b.w > 0)
    );
    const pequenos = botones.filter((b) => Math.min(b.w, b.h) < 43.5);
    ok(botones.length > 0 && pequenos.length === 0, `${titulo}: los ${botones.length} botones de la tarjeta miden 44 px o más${pequenos.length ? " — pequeños: " + pequenos.map((b) => `${b.nombre} ${Math.round(b.w)}×${Math.round(b.h)}`).join(", ") : ""}`);

    // Lo señalado cabe en la pantalla y la tarjeta no lo tapa (salvo los botones flotantes, que no se pueden mover).
    const aroPaso = await rect(p.locator("#guia-aro"));
    if (aroPaso && !PUEDE_MOVER_TARJETA.includes(titulo)) {
      // El recuadro late (crece un 5 %): un margen para que eso no se cuente como «fuera de la pantalla».
      const margen = Math.max(12, VW * 0.04);
      const dentro = aroPaso.x >= -margen && aroPaso.y >= -margen && aroPaso.x + aroPaso.width <= VW + margen && aroPaso.y + aroPaso.height <= alto + margen;
      const tapa = aroPaso.x < t.x + t.width && aroPaso.x + aroPaso.width > t.x && aroPaso.y < t.y + t.height - 4 && aroPaso.y + aroPaso.height > t.y + 4;
      const donde = `recuadro ${Math.round(aroPaso.x)},${Math.round(aroPaso.y)} ${Math.round(aroPaso.width)}×${Math.round(aroPaso.height)}; tarjeta y ${Math.round(t.y)}–${Math.round(t.y + t.height)}`;
      ok(dentro, `${titulo}: lo señalado cabe en la pantalla (${donde})`);
      ok(!tapa, `${titulo}: la tarjeta no tapa lo señalado (${donde})`);
    }
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
      ok(!!aro && aro.y > VH * 0.8 && aro.width > Math.min(300, VW * 0.7), `Las 5 secciones: el recuadro rodea la barra de abajo (y ${Math.round(aro?.y ?? 0)}, ancho ${Math.round(aro?.width ?? 0)})`);
      if (REDUCIR) {
        const animaciones = await p.evaluate(() => Array.from(document.querySelectorAll(".vz-siri-texto")).map((e) => getComputedStyle(e).animationName));
        ok(animaciones.length > 0 && animaciones.every((a) => a === "none"), `Las 5 secciones: con «reducir movimiento» las letras de Siri no se animan (${animaciones.join(", ")})`);
      }
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
      // Desde que se abre el formulario, la propia página apunta lo más que se desplaza (así la prueba no depende de
      // cuándo mire: el formulario baja y sube solo, dos veces, en unos 8 s).
      await p.evaluate(() => {
        window.__maxVender = 0;
        const inicio = performance.now();
        const mirar = () => {
          const h = document.getElementById("vender-scroll");
          if (h) window.__maxVender = Math.max(window.__maxVender, h.scrollTop);
          if (performance.now() - inicio < 20000) requestAnimationFrame(mirar);
        };
        mirar();
      });
      await p.waitForTimeout(500);
    }

    if (titulo === "Vender mi artículo") {
      let maximo = 0;
      let medidas = null;
      for (let k = 0; k < 14; k++) {
        medidas = await p.evaluate(() => {
          const h = document.getElementById("vender-scroll");
          return h ? { arriba: Math.max(h.scrollTop, window.__maxVender ?? 0), contenido: h.scrollHeight, visible: h.clientHeight } : null;
        });
        maximo = Math.max(maximo, medidas?.arriba ?? 0);
        if (maximo > 150) break;
        await p.waitForTimeout(400);
      }
      if (medidas && medidas.contenido <= medidas.visible + 8) {
        // Pantalla alta (tableta, escritorio): el formulario cabe entero, no hay nada más abajo que enseñar.
        info(`Vender mi artículo: el formulario cabe entero (${medidas.contenido} px en ${medidas.visible}), no hace falta desplazarlo`);
      } else {
        // Lo que haya de más abajo (máximo 150 px si hay mucho): en pantallas medianas solo sobran unas decenas de px.
        const sobra = medidas ? medidas.contenido - medidas.visible : 150;
        ok(maximo >= Math.min(150, sobra - 8), `Vender mi artículo: el formulario se desplaza un poco hacia abajo (${Math.round(maximo)} px de ${Math.round(sobra)} que sobran; formulario ${medidas ? `${medidas.contenido} px de alto en ${medidas.visible}` : "no encontrado"})`);
      }
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
      const resultados = p.locator("#buscador-resultados");
      // Simulado: productos «Reciente Uno…» / «Antiguo Uno…». Real: cualquier producto con su precio (123,45€).
      const hayProductos = (cual) =>
        REAL
          ? p.waitForFunction(() => /\d+,\d{2}\s?€/.test(document.querySelector("#buscador-resultados")?.innerText ?? ""), null, { timeout: 12000 }).then(() => true, () => false)
          : resultados.getByText(`${cual} Uno`).waitFor({ timeout: 8000 }).then(() => true, () => false);
      const panelUno = await resultados.getByText("Lo último añadido").waitFor({ timeout: 12000 }).then(() => true, () => false);
      const recientes = await hayProductos("Reciente");
      ok(panelUno && recientes, `El buscador: «lo último añadido» enseña los productos más recientes${REAL ? " (reales)" : ""}`);
      const textoUno = await resultados.innerText().catch(() => "");
      // La demostración enseña solo las filas que caben encima de la tarjeta (en pantallas bajas, menos de tres).
      const filasVistas = (textoUno.match(/\d+,\d{2}\s?€/g) ?? []).length;
      info(`El buscador: la demostración enseña ${filasVistas} producto(s) en una pantalla de ${VH} px de alto`);
      await capturar(p, "09a-buscador-ultimo");
      // El recuadro sigue a los resultados según van apareciendo (tarda un instante en ponerse al día).
      let aro = null;
      let panel = null;
      let alcanza = false;
      for (let k = 0; k < 10 && !alcanza; k++) {
        aro = await rect(p.locator("#guia-aro"));
        panel = await rect(resultados);
        alcanza = !!aro && !!panel && aro.y + aro.height >= panel.y + panel.height - 2;
        if (!alcanza) await p.waitForTimeout(300);
      }
      ok(alcanza, "El buscador: el recuadro ilumina también los resultados");
      const panelDos = await resultados.getByText("Lo más antiguo").waitFor({ timeout: 16000 }).then(() => true, () => false);
      const antiguos = await hayProductos("Antiguo");
      ok(panelDos && antiguos, `El buscador: «lo más antiguo» enseña los productos más antiguos${REAL ? " (reales)" : ""}`);
      if (REAL) {
        const textoDos = await resultados.innerText().catch(() => "");
        ok(textoDos !== textoUno, "El buscador (real): lo más antiguo y lo más reciente son productos distintos");
      }
      await p.waitForTimeout(600);
      await capturar(p, "09b-buscador-antiguo");
      await p.getByRole("button", { name: "Ejemplo: lo último añadido" }).tap();
      const otraVez = await resultados.getByText("Lo último añadido").waitFor({ timeout: 10000 }).then(() => true, () => false);
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

  const tituloActual = async (pagina) => {
    const txt = await pagina.locator("#guia-tarjeta").innerText().catch(() => "");
    return TITULOS.find((t) => txt.split("\n").some((l) => l.trim() === t)) ?? "";
  };
  // Un dedo que se desliza de (x1, y) a (x2, y) con toques reales (CDP), como en un iPhone.
  const deslizar = async (pagina, x1, y, x2) => {
    const dedo = await pagina.context().newCDPSession(pagina);
    const toque = (tipo, x) => dedo.send("Input.dispatchTouchEvent", { type: tipo, touchPoints: tipo === "touchEnd" ? [] : [{ x, y }] });
    await toque("touchStart", x1);
    for (let k = 1; k <= 8; k++) {
      await toque("touchMove", x1 + ((x2 - x1) * k) / 8);
      await pagina.waitForTimeout(16);
    }
    await toque("touchEnd", x2);
  };

  if (EXTRA) {
    // --- Volver atrás: de «Perfil» al primer paso, paso a paso, y lo mismo con un dedo ---------------
    const q = await abrirGuia(ctx);
    const sig = q.locator('[aria-label="Paso siguiente"]');
    const atras = q.locator('[aria-label="Paso anterior"]');
    const ida = [];
    for (let i = 0; i < 20; i++) {
      await q.waitForTimeout(900);
      const t = await tituloActual(q);
      ida.push(t);
      if (t === "Perfil") break;
      if (t === "Vender ahora") {
        await q.waitForFunction(() => location.pathname.startsWith("/vender"), null, { timeout: 12000 }).catch(() => {});
        continue; // pasa sola al formulario
      }
      await sig.tap();
    }
    const etiqueta = await q.locator('[aria-label^="Paso "][aria-label*=" de "]').first().getAttribute("aria-label").catch(() => null);
    ok(/^Paso 10 de 1[78]$/.test(etiqueta ?? ""), `Atrás: en «Perfil» el contador dice «${etiqueta}» (paso 10)`);
    const vuelta = [];
    let seQuedaEnVender = true;
    for (let i = 0; i < 14; i++) {
      await q.waitForTimeout(1100);
      const t = await tituloActual(q);
      vuelta.push(t);
      if (t === "Vender ahora") {
        // Yendo hacia ATRÁS la mano no debe pulsar el botón ni la guía saltar sola al formulario.
        await q.waitForTimeout(4200);
        seQuedaEnVender = (await tituloActual(q)) === "Vender ahora" && new URL(q.url()).pathname === "/";
      }
      if (t === "¡Hola! Soy Blue") break;
      await atras.tap();
    }
    ok(JSON.stringify(vuelta) === JSON.stringify([...ida].reverse()), `Atrás: se recorre la guía hacia atrás en el mismo orden (${vuelta.join(" › ")})`);
    ok(seQuedaEnVender, "Atrás: al volver a «Vender ahora» la guía se queda ahí (no salta sola al formulario)");
    ok(new URL(q.url()).pathname === "/", `Atrás: en el primer paso la guía vuelve a Inicio (${new URL(q.url()).pathname})`);

    if (!ESCRITORIO) {
      // --- Deslizar con un dedo: a la izquierda siguiente, a la derecha anterior --------------------------
      const tt = await rect(q.locator("#guia-tarjeta"));
      const yDedo = tt.y + tt.height * 0.5;
      await deslizar(q, VW * 0.82, yDedo, VW * 0.18);
      await q.waitForTimeout(900);
      ok((await tituloActual(q)) === "Las 5 secciones", `Deslizar: un dedo a la izquierda pasa a «${await tituloActual(q)}» (esperado «Las 5 secciones»)`);
      await deslizar(q, VW * 0.18, yDedo, VW * 0.82);
      await q.waitForTimeout(900);
      ok((await tituloActual(q)) === "¡Hola! Soy Blue", `Deslizar: un dedo a la derecha vuelve a «${await tituloActual(q)}» (esperado el primer paso)`);
    }

    // --- Saltar a mitad de la guía (en la Cesta) --------------------------------------------------------
    for (let i = 0; i < 16; i++) {
      await q.waitForTimeout(900);
      const t = await tituloActual(q);
      if (t === "Cesta") break;
      if (t === "Vender ahora") {
        await q.waitForFunction(() => location.pathname.startsWith("/vender"), null, { timeout: 12000 }).catch(() => {});
        continue;
      }
      await sig.tap();
    }
    ok((await tituloActual(q)) === "Cesta", "Saltar: la guía llegó al paso «Cesta»");
    await q.getByRole("button", { name: "Saltar la guía" }).tap();
    await q.waitForTimeout(1500);
    ok((await q.locator("#guia-tarjeta").count()) === 0 && (await q.locator("#guia-aro").count()) === 0, "Saltar en la Cesta: se cierra la guía y no queda nada oscurecido");
    ok(await q.locator("#blue-flotante").isVisible().catch(() => false), "Saltar en la Cesta: Blue vuelve a verse en su sitio");
    info(`Saltar en la Cesta: la persona se queda en ${new URL(q.url()).pathname} (no vuelve a la pantalla donde abrió la guía)`);
    ok(q.errores.length === 0, `Atrás, deslizar y saltar: sin errores de JavaScript (${q.errores.length}${q.errores[0] ? ": " + q.errores[0] : ""})`);
    await q.close();
  }

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

  if (EXTRA) {
    // --- Primera visita: la guía se ofrece sola y UNA vez por dispositivo ----------------------------------
    const nuevo = await contexto(navegador, { conGuiaVista: false });
    const v = await nuevo.newPage();
    v.errores = [];
    v.on("pageerror", (e) => v.errores.push(`error JS: ${e.message.slice(0, 160)}`));
    await v.goto(BASE + "/", { waitUntil: "load", timeout: 60000 });
    const t0 = Date.now();
    const sola = await v.locator("#guia-tarjeta").waitFor({ timeout: 30000 }).then(() => true, () => false);
    ok(sola, `Primera visita en Inicio: la guía se ofrece sola (a los ${Math.round((Date.now() - t0) / 1000)} s de cargar)`);
    if (sola) {
      await capturar(v, "20-primera-visita");
      await v.getByRole("button", { name: "Saltar la guía" }).tap();
      await v.waitForTimeout(800);
      await v.reload({ waitUntil: "load" });
      const otraVez = await v.locator("#guia-tarjeta").waitFor({ timeout: 22000 }).then(() => true, () => false);
      ok(!otraVez, "Primera visita: una vez cerrada, no vuelve a ofrecerse al recargar (una sola vez por dispositivo)");
    }
    ok(v.errores.length === 0, `Primera visita: sin errores de JavaScript (${v.errores.length})`);
    await nuevo.close();

    // Visitante nuevo que llega directo a la ficha de un producto (enlace de Google o de una red social): la guía
    // no debe llevárselo de ahí sin que lo pida.
    const directo = await contexto(navegador, { conGuiaVista: false });
    const f = await directo.newPage();
    const ficha = "/producto/3436a5a6-1c47-40f5-9d93-e8572b7caccc";
    await f.goto(BASE + ficha, { waitUntil: "load", timeout: 60000 });
    await f.waitForTimeout(22000);
    const guiaEncima = (await f.locator("#guia-tarjeta").count()) > 0;
    const rutaFinal = new URL(f.url()).pathname;
    ok(!guiaEncima && rutaFinal === ficha, `Visitante nuevo en una ficha de producto: la guía no lo interrumpe ni lo lleva a otra pantalla (guía ${guiaEncima ? "abierta" : "cerrada"}, ruta ${rutaFinal})`);
    await capturar(f, "21-ficha-primera-visita");
    // La flecha de volver de la ficha lleva al catálogo: la guía sigue sin salir (no es Inicio).
    await f.locator('[aria-label="Volver atrás"]').first().tap();
    await f.waitForTimeout(2500);
    ok((await f.locator("#guia-tarjeta").count()) === 0, `Visitante nuevo: al volver al catálogo (${new URL(f.url()).pathname}) la guía sigue sin interrumpir`);
    // Cuando llega a Inicio (la flecha de volver del catálogo), entonces sí se le ofrece la guía.
    await f.locator('[aria-label="Volver atrás"]').first().tap();
    await f.waitForFunction(() => location.pathname === "/", null, { timeout: 10000 }).catch(() => {});
    const alLlegarAInicio = await f.locator("#guia-tarjeta").waitFor({ timeout: 8000 }).then(() => true, () => false);
    ok(alLlegarAInicio && new URL(f.url()).pathname === "/", `Visitante nuevo: al llegar a Inicio se le ofrece la guía que quedó pendiente (ruta ${new URL(f.url()).pathname})`);
    await directo.close();
  }
  await ctx.close();
} catch (e) {
  fallos.push(`la prueba se cortó: ${String(e.stack ?? e).slice(0, 900)}`);
} finally {
  await navegador.close();
  servidor?.close();
}

for (const f of fallos) console.log(`FALLO ${f}`);
console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
process.exit(fallos.length ? 1 : 0);
