/**
 * pruebas/blue-panel.mjs — comprueba el PANEL de Blue (el que se abre al tocar a Blue), como un iPhone (390×844).
 *
 * Comprueba:
 *  - Guías rápidas: el panel ofrece una por pantalla (Inicio, Catálogo, Artículo, Vender, Perfil, Cesta, Foro, Blue IA,
 *    Servicios; la de la pantalla actual va resaltada) que enseña SOLO los pasos de esa pantalla y termina con «Terminar».
 *    Si es la pantalla donde estás no te mueves de ella; si es otra (Blue no se ve en Vender, el Foro ni Blue IA) la guía
 *    te lleva y al terminar vuelves. No marca la guía de bienvenida como vista; la guía completa sigue empezando por «Empezar».
 *  - Hay DOS pestañas, «Asistente» y «Noticias y avisos» (antes eran tres: Notificaciones y Noticias por separado).
 *  - «Asistente» tiene UN solo botón para hablar («Hablar con Blue IA o el equipo») que lleva a Blue IA, y ya no están
 *    «Hablar con Blue IA» ni «Hablar con nuestro equipo» por separado. Siguen «Ver la guía», «Vender…».
 *  - «Noticias y avisos» junta los avisos, las noticias y los ajustes («Mis avisos»): lo que se toca mide 48 px o más.
 *  - Sin sesión: «Inicia sesión…» lleva al acceso. Con sesión (--sesion, simulada): se ve el campo «Avísame cuando llegue»
 *    y un aviso de mensajes sin leer (simulado) con su fila.
 *  - Reservas de la cesta (15 min): con tiempo salen como «Reservado para ti» (sin número rojo) y las vencidas no; la que vence
 *    en 4 min suma al número rojo, Blue lo dice una vez (el mensaje lleva a la cesta) y la fila del panel también.
 *  - Nada se ensancha y no hay errores de JavaScript.
 * NO toca producción: solo lecturas (GET); toda escritura se corta. No añade ningún aviso.
 *
 * Uso: node pruebas/blue-panel.mjs [carpeta_dist] [carpeta_capturas] [--sesion]
 * Requisitos: playwright-core y npm run build hecho.
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright-core";

const argumentos = process.argv.slice(2);
const SESION = argumentos.includes("--sesion");
const posicionales = argumentos.filter((a) => !a.startsWith("--"));
const raiz = resolve(posicionales[0] ?? "dist");
if (!existsSync(join(raiz, "index.html"))) {
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
// Las fichas (/producto/<id>) las sirve la misma página para cualquier id.
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
const capturar = (p, nombre) => (SALIDA ? p.screenshot({ path: join(SALIDA, `${nombre}.png`) }) : Promise.resolve());

const USUARIO_FALSO = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "cliente@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };

// `carrito`: artículos ya en la cesta, con los minutos que les quedan de reserva (negativo = ya vencida).
async function contexto(navegador, carrito = null) {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-ES" });
  await ctx.addInitScript(([sesion, usuario, cesta]) => {
    try {
      localStorage.setItem("videojuegoszaragoza:guia_vista", "1");
      localStorage.setItem("videojuegoos.analytics.consent", "declined");
      if (cesta) {
        // Misma forma que guarda la Cesta (clave CART_KEY de app/(tabs)/cesta.tsx).
        localStorage.setItem(
          "videojuegoos_cart_v1",
          JSON.stringify(cesta.map((a) => ({ id: a.id, title: a.title, priceEUR: 100, qty: 1, reservedUntil: Date.now() + a.min * 60000 })))
        );
      }
      if (sesion) {
        // Sesión falsa (clave de lib/supabase.ts). Nunca llega a ningún servidor.
        const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
        const exp = Math.floor(Date.now() / 1000) + 3600;
        const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: usuario.id, role: "authenticated", exp, aud: "authenticated", email: usuario.email })}.firma`;
        localStorage.setItem("videojuegoos.supabase.auth", JSON.stringify({ access_token: jwt, refresh_token: "r", expires_at: exp, expires_in: 3600, token_type: "bearer", user: usuario }));
      }
    } catch {
      // sin almacenamiento
    }
  }, [SESION, USUARIO_FALSO, carrito]);
  await ctx.route("**/*", async (r) => {
    const url = new URL(r.request().url());
    const metodo = r.request().method();
    if (SESION && url.pathname.endsWith("/auth/v1/user")) return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(USUARIO_FALSO) });
    if (SESION && url.pathname.endsWith("/rest/v1/profiles")) return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: USUARIO_FALSO.id, role: "customer" }) });
    // Mensajes sin leer simulados (es una lectura: la función se llama con POST, pero no escribe nada).
    if (SESION && url.pathname.endsWith("/rpc/get_unread_chat_count")) return r.fulfill({ status: 200, contentType: "application/json", body: "3" });
    if (!["GET", "HEAD", "OPTIONS"].includes(metodo)) return r.abort();
    return r.continue();
  });
  return ctx;
}

const rect = async (loc) => (await loc.first().boundingBox().catch(() => null)) ?? null;

const navegador = await chromium.launch();
try {
  const ctx = await contexto(navegador);
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(e.message.slice(0, 160)));
  await p.goto(BASE + "/", { waitUntil: "load", timeout: 60000 });
  await p.waitForSelector("#blue-flotante", { timeout: 25000 });
  await p.waitForTimeout(2500);
  await p.locator('[aria-label="Abrir Blue, el asistente de la tienda"]').tap();
  await p.waitForTimeout(1200);

  // --- Pestañas (la barra de abajo también son «tab»: se miran solo las del panel) --------------------------------
  const pestanas = await p.getByRole("tab").allInnerTexts();
  // (el icono de cada pestaña es una letra de la fuente de iconos: se quitan los signos que no son letras ni cifras)
  const nombres = pestanas
    .map((t) => t.replace(/[^A-Za-zÁÉÍÓÚáéíóúñÑ0-9 ]/g, "").replace(/\s+/g, " ").trim())
    .filter((t) => /(Asistente|Notificaciones|Noticias)/.test(t));
  // Número rojo de la pestaña sin nada en la cesta (para comparar con las pruebas de reservas, al final).
  const base = Number(/Noticias y avisos(\d+)/.exec(nombres.find((t) => t.startsWith("Noticias y avisos")) ?? "")?.[1] ?? 0);
  ok(nombres.length === 2, `El panel tiene 2 pestañas (${nombres.join(" · ")})`);
  ok(nombres.some((t) => t.startsWith("Asistente")) && nombres.some((t) => t.startsWith("Noticias y avisos")), "Las pestañas son «Asistente» y «Noticias y avisos»");
  ok(!nombres.some((t) => /^Notificaciones/.test(t)) && !nombres.some((t) => /^Noticias( \d+)?$/.test(t)), "Ya no hay pestañas «Notificaciones» ni «Noticias» sueltas");
  const tabsPanel = await p.evaluate(() =>
    Array.from(document.querySelectorAll('[role="tab"]'))
      .filter((e) => /Asistente|Noticias y avisos/.test(e.textContent ?? ""))
      .map((e) => Math.round(e.getBoundingClientRect().height))
  );
  ok(tabsPanel.length === 2 && tabsPanel.every((h) => h >= 44), `Las pestañas del panel miden 44 px o más de alto (${tabsPanel.join(", ")})`);

  // --- Asistente: un solo botón para hablar ---------------------------------------------------------------------
  // (Si hay avisos el panel se abre directamente en «Noticias y avisos»: se pasa a «Asistente».)
  await p.getByRole("tab", { name: /Asistente/ }).tap();
  await p.waitForTimeout(700);
  const textoPanel = await p.evaluate(() => document.body.innerText);
  ok((textoPanel.match(/Hablar con Blue IA o el equipo/g) ?? []).length === 1, "Asistente: hay UN solo botón «Hablar con Blue IA o el equipo»");
  ok(!/Hablar con nuestro equipo/.test(textoPanel) && !/Hablar con Blue IA(?! o el equipo)/.test(textoPanel), "Asistente: ya no están «Hablar con Blue IA» ni «Hablar con nuestro equipo» por separado");
  ok(/Ver la guía de la tienda/.test(textoPanel) && /Vender mi consola o dispositivo/.test(textoPanel), "Asistente: siguen «Ver la guía de la tienda» y «Vender mi consola o dispositivo»");
  await capturar(p, "01-asistente");
  // Los botones del panel son Pressable: se mide el elemento tocable (con tabindex) que contiene cada texto.
  const botonesAsistente = await p.evaluate(() =>
    ["Hablar con Blue IA o el equipo", "Ver la guía de la tienda", "Vender mi consola o dispositivo"].map((texto) => {
      const hoja = Array.from(document.querySelectorAll("div")).find((n) => n.children.length === 0 && (n.textContent ?? "").trim() === texto);
      const boton = hoja?.closest("[tabindex]") ?? hoja;
      return { t: texto, h: boton ? boton.getBoundingClientRect().height : 0 };
    })
  );
  ok(botonesAsistente.every((b) => b.h >= 43.5), `Asistente: los botones del panel miden 44 px o más (${botonesAsistente.map((b) => Math.round(b.h)).join(", ")})`);

  // --- Noticias y avisos ----------------------------------------------------------------------------------------
  await p.getByRole("tab", { name: /Noticias y avisos/ }).tap();
  await p.waitForTimeout(1200);
  const avisos = await p.evaluate(() => document.body.innerText);
  ok(/AVISOS/.test(avisos) && /NOTICIAS/.test(avisos) && /MIS AVISOS/.test(avisos), "Noticias y avisos: se ven los apartados Avisos, Noticias y Mis avisos");
  ok(/Avisarme de los artículos nuevos/.test(avisos) && /Avísame cuando llegue/.test(avisos), "Noticias y avisos: están los dos ajustes («Avisarme de los artículos nuevos» y «Avísame cuando llegue»)");
  ok((await p.locator('[aria-label="Avisarme de los artículos nuevos"]').count()) >= 1, "Noticias y avisos: el interruptor de artículos nuevos está");
  if (SESION) {
    ok(/Tienes 3 mensajes nuevos/.test(avisos), "Con sesión: sale el aviso «Tienes 3 mensajes nuevos» (simulado)");
    ok((await p.getByPlaceholder("Ej.: Switch OLED").count()) === 1, "Con sesión: se ve el campo de «Avísame cuando llegue»");
  } else {
    ok(/Inicia sesión para que te avisemos cuando llegue lo que buscas/.test(avisos), "Sin sesión: se ofrece iniciar sesión para recibir avisos");
  }
  await capturar(p, SESION ? "02-avisos-con-sesion" : "02-avisos");
  const filas = await p.evaluate(() =>
    Array.from(document.querySelectorAll('[role="button"]'))
      .filter((e) => /Ver mensajes|Activa los avisos|Avísame cuando llegue|Ver novedades/.test(e.getAttribute("aria-label") ?? ""))
      .map((e) => ({ t: (e.getAttribute("aria-label") ?? "").slice(0, 40), h: e.getBoundingClientRect().height }))
  );
  ok(filas.length >= 1 && filas.every((f) => f.h >= 47.5), `Noticias y avisos: las filas que se tocan miden 48 px o más (${filas.map((f) => Math.round(f.h)).join(", ")})`);

  // --- Sin sesión, «Iniciar sesión» lleva al acceso ---------------------------------------------------------------
  if (!SESION) {
    await p.getByRole("button", { name: /Avísame cuando llegue/ }).tap();
    await p.waitForTimeout(1500);
    ok(/\/perfil/.test(p.url()) && /acceso=entrar/.test(p.url()), `Sin sesión: tocar la fila lleva al acceso (${new URL(p.url()).pathname}${new URL(p.url()).search})`);
    ok((await p.locator('[aria-label="Abrir Blue, el asistente de la tienda"]').count()) >= 1, "Después de ir al acceso Blue sigue en su sitio");
    await p.locator('[aria-label="Abrir Blue, el asistente de la tienda"]').tap();
    await p.waitForTimeout(1000);
  }

  // --- El botón único lleva a Blue IA y cierra el panel ------------------------------------------------------------
  await p.getByRole("tab", { name: /Asistente/ }).tap();
  await p.waitForTimeout(500);
  await p.getByText("Hablar con Blue IA o el equipo").tap();
  await p.waitForTimeout(1800);
  ok(/\/blue-ia/.test(p.url()), `El botón único lleva a Blue IA (${new URL(p.url()).pathname})`);
  ok((await p.getByRole("tab", { name: /Asistente/ }).count()) === 0, "…y el panel se cierra");

  // --- Mini-guías: fila «Guías rápidas» del panel ----------------------------------------------------------------------
  // Cada guía rápida enseña SOLO los pasos de su pantalla. Si es la pantalla donde estás, no te mueves de ella; si es otra
  // (Blue no se ve en Vender, el Foro ni Blue IA, así que se eligen desde otra pantalla), la guía te lleva y al terminar vuelves.
  const PASOS_MINI = {
    Inicio: ["Inicio", "Ver categorías", "Las categorías", "Vender ahora", "El buscador"],
    Catálogo: ["Filtros y orden"],
    Artículo: ["Un artículo"],
    Vender: ["Vender mi artículo", "Para salir"],
    Perfil: SESION ? ["Perfil", "Seguimientos"] : ["Perfil"],
    Cesta: ["Cesta", "Cómo se compra"],
    Foro: ["Foro", "Las pestañas del Foro", "Reacciona y responde"],
    "Blue IA": ["Blue IA", "Hablar con el equipo"],
    Servicios: ["Reparación y limpieza"],
  };
  // Desde Inicio, a qué pantalla lleva cada guía (la del artículo, a una ficha: la más reciente).
  const RUTA_MINI = { Catálogo: "/catalogo", Artículo: /^\/producto\//, Vender: "/vender", Perfil: "/perfil", Cesta: "/cesta", Foro: "/chat-global", "Blue IA": "/blue-ia", Servicios: "/servicios" };
  const coincide = (ruta, esperada) => (esperada instanceof RegExp ? esperada.test(ruta) : ruta === esperada);
  const rutaDe = (q) => new URL(q.url()).pathname;
  // Espera a que la pantalla sea la esperada (la guía cambia de pantalla un instante después de enseñar el paso).
  const enRuta = (q, esperada) =>
    q
      .waitForFunction(([r, re]) => (re ? new RegExp(re).test(location.pathname) : location.pathname === r), esperada instanceof RegExp ? [null, esperada.source] : [esperada, null], { timeout: 12000 })
      .then(() => true, () => false);
  const abrirAsistente = async (q) => {
    await q.waitForSelector("#blue-flotante", { timeout: 25000 });
    await q.waitForTimeout(2500);
    await q.locator('[aria-label="Abrir Blue, el asistente de la tienda"]').tap();
    await q.waitForTimeout(900);
    await q.getByRole("tab", { name: /Asistente/ }).tap();
    await q.waitForTimeout(600);
  };
  // Espera a que la tarjeta de la guía muestre este título (en su propia línea: «Foro» no es «Las pestañas del Foro»).
  const tituloVisible = (q, titulo) =>
    q
      .waitForFunction(
        (t) => (document.getElementById("guia-tarjeta")?.innerText ?? "").split("\n").some((l) => l.trim() === t),
        titulo,
        { timeout: 15000 }
      )
      .then(() => true, () => false);
  // Recorre la mini-guía `nombre` desde la pantalla donde está `q`. `durante` = pantalla en la que debe estar la guía
  // (por defecto, la misma donde se abrió).
  const recorrerMini = async (q, nombre, durante) => {
    const origen = rutaDe(q);
    const pasos = PASOS_MINI[nombre];
    const donde = durante ?? origen;
    await abrirAsistente(q);
    const chip = q.getByRole("button", { name: `Guía rápida: ${nombre}`, exact: true });
    ok((await chip.count()) === 1, `Guía rápida ${nombre} (desde ${origen}): el panel ofrece la guía «${nombre}»`);
    const alto = (await chip.first().boundingBox().catch(() => null))?.height ?? 0;
    ok(alto >= 43.5, `Guía rápida ${nombre}: el botón mide 44 px o más (${Math.round(alto)})`);
    await chip.first().tap();
    await q.locator("#guia-tarjeta").waitFor({ timeout: 15000 }).catch(() => {});
    let rutaVista = null; // la pantalla donde estuvo la guía (para la ficha, la ruta del artículo que enseñó)
    for (let i = 0; i < pasos.length; i++) {
      const sale = await tituloVisible(q, pasos[i]);
      ok(sale, `Guía rápida ${nombre}: paso ${i + 1} de ${pasos.length} = «${pasos[i]}»`);
      ok(await enRuta(q, donde), `Guía rápida ${nombre}: en «${pasos[i]}» está en ${donde instanceof RegExp ? "una ficha" : donde} (${rutaDe(q)})`);
      rutaVista = rutaDe(q);
      const siguiente = q.locator('[aria-label="Paso siguiente"]');
      const ultimo = i === pasos.length - 1;
      const rotulo = ((await siguiente.innerText().catch(() => "")) ?? "").replace(/[^A-Za-zÁÉÍÓÚáéíóúñÑ]/g, "");
      if (i === 0 && (nombre === "Foro" || nombre === "Inicio")) {
        // (se espera un momento: el panel se desvanece y la pantalla nueva termina de cargar)
        await q.waitForTimeout(1500);
        const visible = await q.getByRole("tab", { name: /Asistente/ }).count();
        ok(visible === 0, `Guía rápida ${nombre}: con la guía en marcha el panel de Blue ya no se ve`);
        await capturar(q, nombre === "Foro" ? "06-guia-rapida-foro" : "07-guia-rapida-inicio");
      }
      ok(ultimo ? rotulo === "Terminar" : rotulo === "Siguiente", `Guía rápida ${nombre}: el botón dice «${ultimo ? "Terminar" : "Siguiente"}» (no «Empezar») en «${pasos[i]}» (${rotulo})`);
      await siguiente.tap();
      if (!ultimo) await q.waitForTimeout(500);
    }
    const cerrada = await q.locator("#guia-tarjeta").waitFor({ state: "detached", timeout: 8000 }).then(() => true, () => false);
    ok(cerrada, `Guía rápida ${nombre}: «Terminar» cierra la guía`);
    ok(await enRuta(q, origen), `Guía rápida ${nombre}: al terminar vuelve a ${origen} (${rutaDe(q)})`);
    return rutaVista;
  };
  const paginaMini = async (ruta) => {
    const q = await ctx.newPage();
    q.errores = [];
    q.on("pageerror", (e) => q.errores.push(e.message.slice(0, 160)));
    await q.goto(BASE + ruta, { waitUntil: "load", timeout: 60000 });
    return q;
  };
  const sinErrores = (q, etiqueta) => ok(q.errores.length === 0, `${etiqueta}: sin errores de JavaScript (${q.errores.length}${q.errores[0] ? ": " + q.errores[0] : ""})`);

  // 1) La guía de la pantalla donde estás: Inicio (con su chip resaltado) y Perfil. No te mueves de ella.
  {
    const q = await paginaMini("/");
    await recorrerMini(q, "Inicio");
    // (el chip de la pantalla actual va resaltado; los demás, sin relleno)
    await abrirAsistente(q);
    const fondo = (nombre) => q.getByRole("button", { name: `Guía rápida: ${nombre}`, exact: true }).first().evaluate((e) => getComputedStyle(e).backgroundColor);
    const [actual, otro] = [await fondo("Inicio"), await fondo("Catálogo")];
    ok(actual !== otro && /^rgba\(0, 0, 0, 0\)|transparent/.test(otro), `Guías rápidas: la de la pantalla actual va resaltada (Inicio ${actual}; Catálogo ${otro})`);
    sinErrores(q, "Guía rápida Inicio");
    await q.close();
    const r = await paginaMini("/perfil");
    await recorrerMini(r, "Perfil");
    sinErrores(r, "Guía rápida Perfil");
    await r.close();
  }

  // 2) Una guía de OTRA pantalla, desde Inicio: la guía te lleva allí y al terminar vuelves a Inicio.
  for (const nombre of ["Catálogo", "Vender", "Cesta", "Foro", "Blue IA", "Servicios"]) {
    const q = await paginaMini("/");
    await recorrerMini(q, nombre, RUTA_MINI[nombre]);
    sinErrores(q, `Guía rápida ${nombre}`);
    await q.close();
  }

  // 3) Una ficha de artículo: desde Inicio la guía del artículo te lleva a una ficha (la del artículo más reciente) y, estando
  // en una ficha, enseña «Un artículo» SIN llevarte a otro artículo.
  // (Con la sesión simulada de --sesion el token es falso y la tienda real no devuelve el artículo más reciente: ahí lo que se
  // comprueba es que la guía NO salta a la guía completa y se queda en Inicio con su único paso.)
  {
    const i = await paginaMini("/");
    const ficha = await recorrerMini(i, "Artículo", SESION ? /^(\/$|\/producto\/)/ : RUTA_MINI.Artículo);
    sinErrores(i, "Guía rápida Artículo (desde Inicio)");
    await i.close();
    if (SESION && ficha === "/") {
      console.log("INFO Guía rápida Artículo: con la sesión simulada no hay ficha que enseñar; se comprobó que no salta a la guía completa");
    } else if (!ficha || !/^\/producto\//.test(ficha)) {
      ok(false, `Guía rápida Artículo: la guía debía llevar a una ficha (${ficha})`);
    } else {
      const q = await paginaMini(ficha);
      await recorrerMini(q, "Artículo");
      ok(rutaDe(q) === ficha, `Guía rápida Artículo: se queda en el mismo artículo (${rutaDe(q)})`);
      sinErrores(q, "Guía rápida Artículo (desde la ficha)");
      await q.close();
    }
  }

  // 4) En una pantalla sin guía propia (Blog) el panel ofrece igualmente las guías, sin ninguna resaltada, y la guía
  // completa sigue como siempre.
  {
    const q = await ctx.newPage();
    await q.goto(BASE + "/blog", { waitUntil: "load", timeout: 60000 });
    await abrirAsistente(q);
    const chips = await q.getByRole("button", { name: /^Guía rápida: / }).evaluateAll((els) => els.map((e) => ({ t: e.getAttribute("aria-label"), fondo: getComputedStyle(e).backgroundColor, h: e.getBoundingClientRect().height })));
    ok(chips.length === 9, `Blog: el panel ofrece las 9 guías rápidas (${chips.length})`);
    ok(chips.every((c) => /^rgba\(0, 0, 0, 0\)|transparent/.test(c.fondo)), "Blog: ninguna va resaltada (no hay guía propia de esta pantalla)");
    ok(chips.every((c) => c.h >= 43.5), `Guías rápidas: los 9 botones miden 44 px o más (${chips.map((c) => Math.round(c.h)).join(", ")})`);
    ok((await q.getByText("Ver la guía de la tienda").count()) >= 1, "Blog: sigue «Ver la guía de la tienda»");
    await capturar(q, "08-guias-rapidas");
    await q.close();
    const c = await ctx.newPage();
    await c.goto(BASE + "/cesta", { waitUntil: "load", timeout: 60000 });
    await abrirAsistente(c);
    await c.getByText("Ver la guía de la tienda", { exact: true }).first().tap();
    await c.locator("#guia-tarjeta").waitFor({ timeout: 15000 }).catch(() => {});
    ok(await tituloVisible(c, "¡Hola! Soy Blue"), "Guía completa: «Ver la guía de la tienda» sigue empezando por «¡Hola! Soy Blue»");
    const txt = ((await c.locator('[aria-label="Paso siguiente"]').innerText().catch(() => "")) ?? "").replace(/[^A-Za-zÁÉÍÓÚáéíóúñÑ]/g, "");
    ok(txt === "Empezar", `Guía completa: el primer botón sigue diciendo «Empezar» (${txt})`);
    await c.close();
  }

  // Una mini-guía NO marca la guía de bienvenida como vista; la guía completa sí (así quien no la ha visto la sigue recibiendo).
  {
    const sinVista = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-ES" });
    await sinVista.addInitScript(() => {
      try {
        localStorage.setItem("videojuegoos.analytics.consent", "declined");
      } catch {
        // sin almacenamiento
      }
    });
    await sinVista.route("**/*", (r) => (["GET", "HEAD", "OPTIONS"].includes(r.request().method()) ? r.continue() : r.abort()));
    const q = await sinVista.newPage();
    await q.goto(BASE + "/", { waitUntil: "load", timeout: 60000 });
    await abrirAsistente(q);
    await q.getByRole("button", { name: "Guía rápida: Catálogo", exact: true }).first().tap();
    await q.locator("#guia-tarjeta").waitFor({ timeout: 15000 }).catch(() => {});
    await q.getByRole("button", { name: "Saltar la guía" }).tap();
    await q.locator("#guia-tarjeta").waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
    const tras = await q.evaluate(() => localStorage.getItem("videojuegoszaragoza:guia_vista"));
    ok(tras === null, `Guía rápida: saltarla NO marca la guía de bienvenida como vista (${tras})`);
    // Y quien aún no la ha visto la sigue recibiendo: a los 15 s de entrar, en Inicio, sale sola la guía de bienvenida.
    const bienvenida = await q.locator("#guia-tarjeta").waitFor({ timeout: 30000 }).then(() => true, () => false);
    ok(bienvenida, "Guía rápida: quien no ha visto la guía de bienvenida la sigue recibiendo sola, en Inicio");
    ok(await tituloVisible(q, "¡Hola! Soy Blue"), "Guía de bienvenida: empieza por «¡Hola! Soy Blue» (guía completa)");
    await q.getByRole("button", { name: "Saltar la guía" }).tap();
    await q.locator("#guia-tarjeta").waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
    const trasCompleta = await q.evaluate(() => localStorage.getItem("videojuegoszaragoza:guia_vista"));
    ok(trasCompleta === "1", `Guía completa: saltarla SÍ la marca como vista (${trasCompleta})`);
    await sinVista.close();
  }

  // --- Pantalla ----------------------------------------------------------------------------------------------------
  const anchos = await p.evaluate(() => ({ pantalla: window.innerWidth, pagina: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) }));
  ok(anchos.pagina <= anchos.pantalla + 1, `La página no se ensancha (${anchos.pagina}/${anchos.pantalla})`);
  ok(errores.length === 0, `Sin errores de JavaScript (${errores.length}${errores[0] ? ": " + errores[0] : ""})`);
  await ctx.close();

  // --- Reservas de la cesta (lib/reservas.ts, 15 minutos) -----------------------------------------------------------
  const abrirPanelAvisos = async (q) => {
    await q.locator('[aria-label="Abrir Blue, el asistente de la tienda"]').tap();
    await q.waitForTimeout(1000);
    await q.getByRole("tab", { name: /Noticias y avisos/ }).tap();
    await q.waitForTimeout(900);
  };
  const insignia = async (q) => {
    const textos = await q.getByRole("tab").allInnerTexts();
    const t = textos.map((x) => x.replace(/[^A-Za-zÁÉÍÓÚáéíóúñÑ0-9 ]/g, "").replace(/\s+/g, " ").trim()).find((x) => x.startsWith("Noticias y avisos"));
    return Number(/Noticias y avisos(\d+)/.exec(t ?? "")?.[1] ?? 0);
  };
  const paginaCon = async (cesta) => {
    const c = await contexto(navegador, cesta);
    const q = await c.newPage();
    q.errores = [];
    q.on("pageerror", (e) => q.errores.push(e.message.slice(0, 160)));
    await q.goto(BASE + "/", { waitUntil: "load", timeout: 60000 });
    await q.waitForSelector("#blue-flotante", { timeout: 25000 });
    return { c, q };
  };

  // R1) Una reserva con tiempo y otra vencida: la primera sale como información (sin número rojo) y la vencida no sale.
  {
    const { c, q } = await paginaCon([
      { id: "00000000-0000-4000-8000-0000000000a1", title: "Consola Con Tiempo", min: 12 },
      { id: "00000000-0000-4000-8000-0000000000a2", title: "Consola Vencida", min: -2 },
    ]);
    await q.waitForTimeout(2500);
    await abrirPanelAvisos(q);
    const suma = await insignia(q);
    ok(suma === base, `R1: una reserva con 12 min no suma al número rojo (${suma}, sin cesta: ${base})`);
    const texto = await q.evaluate(() => document.body.innerText);
    ok(/Reservado para ti: Consola Con Tiempo/.test(texto) && /Te quedan (11|12) min/.test(texto), "R1: sale «Reservado para ti: …» con lo que le queda");
    ok(!/Consola Vencida/.test(texto), "R1: la reserva ya vencida no sale");
    ok(!/vence en/.test(texto), "R1: no se dice «vence» si aún queda tiempo");
    await capturar(q, "03-reserva-con-tiempo");
    ok((await q.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth))) <= 391, "R1: la página no se ensancha");
    ok(q.errores.length === 0, `R1: sin errores de JavaScript (${q.errores.length}${q.errores[0] ? ": " + q.errores[0] : ""})`);
    await c.close();
  }

  // R2) Una reserva que vence en 4 minutos: suma al número rojo, Blue lo dice UNA vez y la fila lleva a la cesta.
  {
    const { c, q } = await paginaCon([{ id: "00000000-0000-4000-8000-0000000000a3", title: "Consola Urgente", min: 4 }]);
    // Blue sale a los 10 s de abrir la página: el mensaje llega después.
    const dicho = await q
      .waitForFunction(() => /Tu reserva de «Consola Urgente» vence en [1-5] min/.test(document.getElementById("blue-mensaje")?.textContent ?? ""), null, { timeout: 40000 })
      .then(() => true, () => false);
    ok(dicho, "R2: Blue dice «Tu reserva de «Consola Urgente» vence en N min»");
    if (dicho) await capturar(q, "04-reserva-mensaje");
    // Tocar el mensaje lleva a la cesta.
    if (dicho) {
      await q.locator("#blue-mensaje").tap();
      await q.waitForURL(/\/cesta/, { timeout: 15000 }).then(
        () => ok(true, "R2: tocar el mensaje lleva a la cesta"),
        () => ok(false, `R2: tocar el mensaje debía llevar a la cesta (está en ${q.url()})`)
      );
    }
    // En la Cesta Blue no repite el aviso (allí se ve la cuenta atrás) ni lo repite después: es UNA vez por reserva.
    await q.waitForTimeout(3000);
    ok(!/Tu reserva de/.test((await q.locator("#blue-mensaje").textContent({ timeout: 1000 }).catch(() => "")) ?? ""), "R2: en la Cesta Blue no repite el mensaje");
    await q.goto(BASE + "/", { waitUntil: "load", timeout: 60000 });
    await q.waitForSelector("#blue-flotante", { timeout: 25000 });
    await q.waitForTimeout(2500);
    await abrirPanelAvisos(q);
    const suma = await insignia(q);
    ok(suma === base + 1, `R2: la reserva que vence suma 1 al número rojo (${suma}, sin cesta: ${base})`);
    const texto = await q.evaluate(() => document.body.innerText);
    ok(/Tu reserva de «Consola Urgente» vence en [1-5] min/.test(texto) && /Termina el pedido para no perderlo/.test(texto), "R2: el panel dice que la reserva vence y qué hacer");
    const fila = q.getByRole("button", { name: /Tu reserva de «Consola Urgente»/ });
    const alto = (await fila.first().boundingBox())?.height ?? 0;
    ok(alto >= 47.5, `R2: la fila mide 48 px o más (${Math.round(alto)})`);
    await capturar(q, "05-reserva-vence");
    await fila.first().tap();
    await q.waitForURL(/\/cesta/, { timeout: 15000 }).then(
      () => ok(true, "R2: tocar la fila lleva a la cesta"),
      () => ok(false, `R2: tocar la fila debía llevar a la cesta (está en ${q.url()})`)
    );
    // (se espera: el panel se cierra con una breve animación mientras cambia la pantalla)
    ok(await q.getByRole("tab", { name: /Asistente/ }).first().waitFor({ state: "detached", timeout: 5000 }).then(() => true, () => false), "R2: y el panel se cierra");
    ok(q.errores.length === 0, `R2: sin errores de JavaScript (${q.errores.length}${q.errores[0] ? ": " + q.errores[0] : ""})`);
    await c.close();
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
