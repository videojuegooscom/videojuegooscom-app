/**
 * pruebas/blue-panel.mjs — comprueba el PANEL de Blue (el que se abre al tocar a Blue), como un iPhone (390×844).
 *
 * Comprueba:
 *  - Hay DOS pestañas, «Asistente» y «Noticias y avisos» (antes eran tres: Notificaciones y Noticias por separado).
 *  - «Asistente» tiene UN solo botón para hablar («Hablar con Blue IA o el equipo») que lleva a Blue IA, y ya no están
 *    «Hablar con Blue IA» ni «Hablar con nuestro equipo» por separado. Siguen «Ver la guía», «Vender…».
 *  - «Noticias y avisos» junta los avisos, las noticias y los ajustes («Mis avisos»): lo que se toca mide 48 px o más.
 *  - Sin sesión: «Inicia sesión…» lleva al acceso. Con sesión (--sesion, simulada): se ve el campo «Avísame cuando llegue»
 *    y un aviso de mensajes sin leer (simulado) con su fila.
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
const capturar = (p, nombre) => (SALIDA ? p.screenshot({ path: join(SALIDA, `${nombre}.png`) }) : Promise.resolve());

const USUARIO_FALSO = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "cliente@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };

async function contexto(navegador) {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-ES" });
  await ctx.addInitScript(([sesion, usuario]) => {
    try {
      localStorage.setItem("videojuegoszaragoza:guia_vista", "1");
      localStorage.setItem("videojuegoos.analytics.consent", "declined");
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
  }, [SESION, USUARIO_FALSO]);
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

  // --- Pantalla ----------------------------------------------------------------------------------------------------
  const anchos = await p.evaluate(() => ({ pantalla: window.innerWidth, pagina: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) }));
  ok(anchos.pagina <= anchos.pantalla + 1, `La página no se ensancha (${anchos.pagina}/${anchos.pantalla})`);
  ok(errores.length === 0, `Sin errores de JavaScript (${errores.length}${errores[0] ? ": " + errores[0] : ""})`);
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
