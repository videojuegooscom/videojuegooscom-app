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
 *   --sesion               con una sesión iniciada SIMULADA (cliente falso, sin tocar la base de datos): sale el paso
 *                          «Mis seguimientos», no sale «Tu cuenta» y el último botón es «Terminar»
 *   --sin-extra            solo el recorrido principal (sin atrás, deslizar, saltar ni primera visita)
 *   --envio                la reparación por envío SIMULADA como activa (reparacion_envio_ajustes.activo): sale el paso
 *                          «Reparación por envío» en el recorrido principal (por defecto se simula inactiva y no sale)
 * Guía completa al día (2026-11-13), además de lo anterior:
 *  - Con --sesion (pedidos simulados): «Mis pedidos» (recuadro en los filtros), «Tus facturas» (recuadro en «Facturas», plazos
 *    y botón «Ver mis facturas» que lleva a /perfil?tab=seguimientos&filtro=facturas) y «Me gusta» (la mano en su pestaña).
 *  - Siempre, al final: la reparación por envío activa (simulada) enseña «Reparación por envío» y la inactiva no la nombra; la
 *    cesta con artículos señala «Ir a pagar» y «Cómo se compra» nombra tarjeta, Bizum y Klarna (/api/pago simulado) y, sin ellas
 *    en el servidor, no las promete; y el paso «Un artículo» deja «Siguiente» en su sitio 3 veces seguidas (mientras la ficha
 *    se desplaza y después).
 *  - En CADA paso: ningún texto de la tarjeta, de «Estás aquí» ni de los nombres de secciones con menos de 13 px (mínimo
 *    exigido 12), nada de la tarjeta cortado con «…» ni fuera de ella.
 * Requisitos: playwright-core y, sin --real, npm run build hecho.
 * Conectado con: la guía de bienvenida de Blue, el buscador, Vender y Perfil en la tienda compilada (dist), la sesión
 *   de lib/supabase.ts (simulada) y pruebas/sin-fotos-reales.mjs. pruebas/todas.mjs la lanza tres veces: «guia-blue», «guia-blue sesion» y «guia-blue envio».
 */
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { lanzarNavegador } from "./sin-fotos-reales.mjs";

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
const SESION = !!opciones.sesion;
const ENVIO = !!opciones.envio;
if (SESION && REAL) {
  console.error("FALLO --sesion es una sesión falsa: no se puede usar con --real");
  process.exit(1);
}

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
const USUARIO_FALSO = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "cliente@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };

// Una cesta con dos artículos (misma forma que guarda la Cesta, clave videojuegoos_cart_v1) y la pasarela simulada.
const GIF = "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAACAkQBADs=";
const CESTA_LLENA = [
  { id: "00000000-0000-4000-8000-0000000000e1", title: "Consola de prueba uno", subtitle: "Consola · Nuevo", priceEUR: 300, qty: 1, imageUrl: GIF },
  { id: "00000000-0000-4000-8000-0000000000e2", title: "Mando de prueba dos", subtitle: "Accesorios", priceEUR: 50, qty: 1, imageUrl: GIF },
];
const PEDIDOS_FALSOS = [
  { id: "00000000-0000-4000-8000-0000000000f1", numero: 9001, created_at: "2026-11-10T10:00:00Z", estado: "pendiente", entrega: "envio", total_eur: 350 },
  { id: "00000000-0000-4000-8000-0000000000f2", numero: 9002, created_at: "2026-11-01T10:00:00Z", estado: "entregado", entrega: "recogida", total_eur: 40 },
];

// envio: reparación por envío activa (simulada). pago: lo que dice GET /api/pago. cesta: artículos ya en la cesta.
async function contexto(navegador, { conGuiaVista = true, conSesion = SESION, envio = ENVIO, pago = { ok: true, disponible: true, klarna: true, bizum: true }, cesta = null } = {}) {
  const ctx = await navegador.newContext(DISPOSITIVO);
  await ctx.addInitScript(([marcarGuia, sesion, usuario, articulos]) => {
    try {
      if (marcarGuia) localStorage.setItem("videojuegoszaragoza:guia_vista", "1");
      if (articulos) localStorage.setItem("videojuegoos_cart_v1", JSON.stringify(articulos.map((a) => ({ ...a, reservedUntil: Date.now() + 14 * 60000 }))));
      localStorage.setItem("videojuegoos.analytics.consent", "declined");
      if (sesion) {
        // Sesión falsa (la clave es la de lib/supabase.ts: storageKey). Nunca llega a ningún servidor.
        const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
        const exp = Math.floor(Date.now() / 1000) + 3600;
        const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: usuario.id, role: "authenticated", exp, aud: "authenticated", email: usuario.email })}.firma`;
        localStorage.setItem("videojuegoos.supabase.auth", JSON.stringify({ access_token: jwt, refresh_token: "r", expires_at: exp, expires_in: 3600, token_type: "bearer", user: usuario }));
      }
    } catch {
      // sin almacenamiento
    }
  }, [conGuiaVista, conSesion, USUARIO_FALSO, cesta]);
  if (REAL) {
    // Tienda real: solo lecturas. Cualquier otra petición (analítica, escrituras…) se corta.
    await ctx.route("**/*", (r) => (["GET", "HEAD", "OPTIONS"].includes(r.request().method()) ? r.continue() : r.abort()));
    return ctx;
  }
  if (conSesion) {
    await ctx.route("**/auth/v1/user", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(USUARIO_FALSO) }));
  }
  // La pasarela de pago (GET /api/pago): lo que el servidor ofrece (en dist no hay servidor).
  await ctx.route("**/api/pago", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(pago) }));
  await ctx.route("**/rest/v1/**", async (r) => {
    const peticion = r.request();
    if (!["GET", "HEAD"].includes(peticion.method())) return r.abort();
    const url = new URL(peticion.url());
    // Reparación por envío: activa o no (la guía solo la enseña si está activa).
    if (url.pathname.endsWith("/reparacion_envio_ajustes")) {
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: 1, activo: envio, direccion_taller: "Taller de prueba", peso_aparato_kg: 2, peso_estimado: true, plazo_horas: 72 }) });
    }
    // Con sesión: dos pedidos FICTICIOS (así «Mis pedidos» enseña sus filtros) y la tabla de facturas existe y está vacía.
    if (conSesion && url.pathname.endsWith("/pedidos")) {
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PEDIDOS_FALSOS) });
    }
    if (conSesion && (url.pathname.endsWith("/pedido_items") || url.pathname.endsWith("/pedido_facturas") || url.pathname.endsWith("/service_requests"))) {
      return r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    if (conSesion && url.pathname.endsWith("/profiles")) {
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: USUARIO_FALSO.id, role: "customer" }) });
    }
    // La guía lee el NOMBRE del último artículo añadido y el del más antiguo.
    if (url.pathname.endsWith("/products") && url.searchParams.get("select") === "title") {
      const cual = url.searchParams.get("order") === "created_at.asc" ? ANTIGUOS[0] : RECIENTES[0];
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ title: cual.title }]) });
    }
    if (url.pathname.endsWith("/products") && url.searchParams.get("select") === "id,title,price_eur,images") {
      // Búsqueda por nombre: el buscador escribe «Reciente Uno» / «Antiguo Uno» y salen esos artículos.
      const buscado = url.searchParams.get("or") ?? "";
      const porNombre = /Reciente Uno/i.test(buscado) ? [RECIENTES[0]] : /Antiguo Uno/i.test(buscado) ? [ANTIGUOS[0]] : [];
      const todas = buscado ? porNombre : url.searchParams.get("order") === "created_at.asc" ? ANTIGUOS : RECIENTES;
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

async function abrirGuia(ctx, ruta = "/") {
  const p = await ctx.newPage();
  p.errores = [];
  p.on("pageerror", (e) => p.errores.push(`error JS: ${e.message.slice(0, 160)}`));
  // Con ratón no hay «tap»: se usa el clic.
  if (ESCRITORIO) {
    const Localizador = Object.getPrototypeOf(p.locator("body"));
    Localizador.tap = Localizador.click;
  }
  await p.goto(BASE + ruta, { waitUntil: "load", timeout: 60000 });
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

const navegador = await lanzarNavegador(ok);
try {
  const ctx = await contexto(navegador);
  const p = await abrirGuia(ctx);
  const siguiente = p.locator('[aria-label="Paso siguiente"]');
  const tarjeta = p.locator("#guia-tarjeta");
  // El puntero que enseña dónde tocar es SIEMPRE un icono (nunca un emoji): huella táctil blanca en un círculo azul.
  const manos = p.locator('[data-testid="guia-toque"]');
  const emojiMano = p.getByText("👆");

  const TITULOS = [
    "¡Hola! Soy Blue", "Las 5 secciones", "Inicio", "Ver categorías", "Las categorías", "Filtros y orden", "Un artículo", "Vender ahora",
    "Vender mi artículo", "Para salir", "El buscador", "Perfil", "Mis seguimientos", "Mis pedidos", "Tus facturas", "Me gusta", "Cesta", "Cómo se compra",
    "Las pestañas del Foro", "Reacciona y responde", "Foro", "Blue IA", "Hablar con el equipo", "Este soy yo", "Instala la tienda",
    "Reparación y limpieza", "Reparación por envío", "Tu cuenta",
  ]; // los que contienen otro título («Las pestañas del Foro», «Foro»…) van antes: sus botones se llaman igual
  const GESTO_TOQUE = ["Inicio", "Ver categorías", "Vender ahora", "Para salir", "Mis seguimientos", "Mis pedidos", "Tus facturas", "Me gusta", "Cesta", "Foro", "Las pestañas del Foro", "Blue IA", "Hablar con el equipo", "Este soy yo"];
  // Los pasos que enseñan OTRA página llevan la tarjeta baja (para que se vea la página); el resto, la grande.
  const COMPACTAS = ["Filtros y orden", "Un artículo", "Vender mi artículo", "Para salir", "Perfil", "Mis seguimientos", "Mis pedidos", "Tus facturas", "Me gusta", "Cesta", "Foro", "Blue IA", "Hablar con el equipo", "Reparación y limpieza", "Reparación por envío"];
  const ALTO_GRANDE = 292;
  const ALTO_COMPACTA = 212;
  const ALTO_COMPACTA_ACCION = 256; // la compacta con botón de acción («Ver mis facturas»)
  // Qué se enmarca como título de cada página («Estás aquí»): su nombre en la barra de abajo o su h1.
  const TITULO_DE = {
    "Inicio": '[data-testid="pestana-index"]', "Ver categorías": '[data-testid="pestana-index"]', "Las categorías": '[data-testid="pestana-index"]',
    "Vender ahora": '[data-testid="pestana-index"]', "Vender mi artículo": "h1", "Para salir": "h1", "El buscador": '[data-testid="pestana-index"]',
    "Perfil": '[data-testid="pestana-perfil"]', "Mis seguimientos": '[data-testid="pestana-perfil"]', "Cesta": '[data-testid="pestana-cesta"]',
    "Mis pedidos": '[data-testid="pestana-perfil"]', "Tus facturas": '[data-testid="pestana-perfil"]', "Me gusta": '[data-testid="pestana-perfil"]',
    "Reparación por envío": "h1",
    "Foro": '[data-testid="pestana-foro"]', "Las pestañas del Foro": '[data-testid="pestana-foro"]', "Blue IA": '[data-testid="pestana-blue-ia"]',
    "Este soy yo": '[data-testid="pestana-index"]', "Reparación y limpieza": "h1", "Filtros y orden": "h1", "Un artículo": "h1",
    "Cómo se compra": '[data-testid="pestana-cesta"]', "Reacciona y responde": '[data-testid="pestana-foro"]', "Hablar con el equipo": '[data-testid="pestana-blue-ia"]',
  };
  // Letra y desbordes de lo que dibuja la guía: la tarjeta, el «Estás aquí» y los nombres de secciones escritos con Siri.
  const letraYDesborde = (pagina) =>
    pagina.evaluate(() => {
      const propio = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
      const tarjeta = document.getElementById("guia-tarjeta");
      const caja = tarjeta?.getBoundingClientRect();
      const candidatos = [...document.querySelectorAll("#guia-tarjeta *, .vz-siri-texto")];
      for (const el of document.querySelectorAll("div, span")) if (propio(el) === "Estás aquí") candidatos.push(el);
      const chicas = [];
      const cortados = [];
      const fuera = [];
      let minimo = 99;
      let n = 0;
      for (const el of new Set(candidatos)) {
        const t = propio(el);
        const r = el.getBoundingClientRect();
        if (!t || r.width <= 0 || r.height <= 0) continue;
        const cs = getComputedStyle(el);
        if (/ionicons/i.test(cs.fontFamily)) continue;
        n++;
        const fs = parseFloat(cs.fontSize);
        minimo = Math.min(minimo, fs);
        if (fs < 13) chicas.push(`«${t.slice(0, 24)}» ${fs}`);
        if (cs.textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1) cortados.push(`«${t.slice(0, 24)}»`);
        if (caja && tarjeta.contains(el) && (r.left < caja.left - 1 || r.right > caja.right + 1 || r.top < caja.top - 2 || r.bottom > caja.bottom + 2)) fuera.push(`«${t.slice(0, 24)}»`);
      }
      return { chicas, cortados, fuera, minimo: n ? minimo : 99, n };
    });
  let referencia = null; // dónde está «Siguiente» y cuánto mide la tarjeta (en el paso 1)
  let vistos = 0;
  let titulo = "";
  // Los pasos cuyo objetivo es un botón FLOTANTE (no se puede desplazar) pueden obligar a mover la tarjeta. En pantallas
  // BAJAS (menos de 720 px: iPhone SE, algunos Android) lo señalado a media altura (Perfil) o el propio Blue (abajo a la
  // izquierda) no caben a la vez que una tarjeta de 292 px: ahí también se acepta que la tarjeta se aparte.
  const PANTALLA_BAJA = VH < 720;
  // «Este soy yo» señala al propio Blue, que flota donde se haya apartado (a veces a media altura, bajo la tarjeta).
  // «Hablar con el equipo» queda abajo, en el sitio de la tarjeta: la tarjeta se aparta de él.
  const PUEDE_MOVER_TARJETA = ["Las pestañas del Foro", "Este soy yo", "Hablar con el equipo", ...(PANTALLA_BAJA ? ["Perfil"] : [])];

  // El último paso: sin sesión, «Tu cuenta»; con sesión, el último de Servicios (con --envio, «Reparación por envío»).
  const ULTIMO = SESION ? (ENVIO ? "Reparación por envío" : "Reparación y limpieza") : "Tu cuenta";

  for (let i = 0; i < 30; i++) {
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
    // La tarjeta compacta (pasos que enseñan otra página) es más baja, pero va pegada abajo igual: «Siguiente» no se mueve.
    const altoEsperado = COMPACTAS.includes(titulo) ? (titulo === "Tus facturas" ? ALTO_COMPACTA_ACCION : ALTO_COMPACTA) : ALTO_GRANDE;
    if (titulo !== "Tu cuenta") {
      if (!referencia) referencia = { s };
      const c = centro(s);
      ok(!!t && !!s && Math.abs(t.height - altoEsperado) < 2, `${titulo}: la tarjeta ${COMPACTAS.includes(titulo) ? "compacta" : "grande"} mide ${Math.round(t?.height ?? 0)} px (esperado ${altoEsperado})`);
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

    // Letra de 13 px o más (mínimo exigido 12) en la tarjeta, en «Estás aquí» y en los nombres de secciones; nada cortado ni fuera.
    {
      const l = await letraYDesborde(p);
      ok(l.chicas.length === 0, `${titulo}: ningún texto de la guía con menos de 13 px (${l.n} textos mirados${l.chicas.length ? " — pequeños: " + l.chicas.join(", ") : ""})`);
      ok(l.minimo >= 12, `${titulo}: la letra mínima de la guía es ${l.minimo} px (exigido 12 o más)`);
      ok(l.cortados.length === 0 && l.fuera.length === 0, `${titulo}: nada de la tarjeta queda cortado ni fuera de ella${l.cortados.length ? " — cortado: " + l.cortados.join(", ") : ""}${l.fuera.length ? " — fuera: " + l.fuera.join(", ") : ""}`);
    }

    // Lo señalado cabe en la pantalla y la tarjeta no lo tapa (salvo los botones flotantes, que no se pueden mover).
    let aroPaso = await rect(p.locator("#guia-aro"));
    if (aroPaso && !PUEDE_MOVER_TARJETA.includes(titulo)) {
      // El recuadro late (crece un 5 %): un margen para que eso no se cuente como «fuera de la pantalla».
      const margen = Math.max(12, VW * 0.04);
      const evaluar = (a) => ({
        dentro: a.x >= -margen && a.y >= -margen && a.x + a.width <= VW + margen && a.y + a.height <= alto + margen,
        tapa: a.x < t.x + t.width && a.x + a.width > t.x && a.y < t.y + t.height - 4 && a.y + a.height > t.y + 4,
      });
      // Si la guía acaba de desplazar la página hasta lo señalado (la ficha, Inicio), se espera a que termine (hasta 4 s).
      let { dentro, tapa } = evaluar(aroPaso);
      for (let k = 0; k < 10 && (!dentro || tapa); k++) {
        await p.waitForTimeout(400);
        aroPaso = (await rect(p.locator("#guia-aro"))) ?? aroPaso;
        ({ dentro, tapa } = evaluar(aroPaso));
      }
      const donde = `recuadro ${Math.round(aroPaso.x)},${Math.round(aroPaso.y)} ${Math.round(aroPaso.width)}×${Math.round(aroPaso.height)}; tarjeta y ${Math.round(t.y)}–${Math.round(t.y + t.height)}`;
      ok(dentro, `${titulo}: lo señalado cabe en la pantalla (${donde})`);
      ok(!tapa, `${titulo}: la tarjeta no tapa lo señalado (${donde})`);
    }
    // El título de la página está enmarcado («Estás aquí») para que se sepa siempre dónde se está.
    if (TITULO_DE[titulo]) {
      const selTitulo = TITULO_DE[titulo];
      // Si la página se desplaza sola (la ficha, hasta los botones) el recuadro tarda un instante en seguir al título.
      let enmarcado = false;
      for (let k = 0; k < 8 && !enmarcado; k++) {
        const elTitulo = await p.evaluate((s) => {
          const r = Array.from(document.querySelectorAll(s)).map((x) => x.getBoundingClientRect()).find((b) => b.width > 4 && b.height > 4 && b.top >= -b.height * 0.4 && b.top < window.innerHeight);
          return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
        }, selTitulo);
        // Sin título a la vista (la página se desplazó y se fue arriba): no hay nada que enmarcar.
        if (!elTitulo) {
          enmarcado = true;
          break;
        }
        const marcos = [await rect(p.locator("#guia-titulo")), await rect(p.locator("#guia-aro"))].filter(Boolean);
        const c = { x: elTitulo.x + elTitulo.w / 2, y: elTitulo.y + elTitulo.h / 2 };
        enmarcado = marcos.some((m) => c.x >= m.x - 6 && c.x <= m.x + m.width + 6 && c.y >= m.y - 6 && c.y <= m.y + m.height + 6);
        if (!enmarcado) await p.waitForTimeout(300);
      }
      ok(enmarcado, `${titulo}: el título de la página (${selTitulo}) queda enmarcado`);
      if ((await p.locator("#guia-titulo").count()) > 0) {
        ok((await p.getByText("Estás aquí").count()) > 0, `${titulo}: el recuadro del título dice «Estás aquí»`);
      }
    }
    ok((await emojiMano.count()) === 0, `${titulo}: ningún emoji de mano (siempre un icono)`);
    if (GESTO_TOQUE.includes(titulo) && titulo !== "Para salir" && titulo !== "Vender ahora") {
      ok((await manos.count()) >= 1, `${titulo}: un icono de toque enseña dónde tocar`);
    }

    // --- cada paso con su demostración ---------------------------------------------------------
    if (titulo === "¡Hola! Soy Blue") {
      ok((await manos.count()) >= 1, "primer paso: un icono de toque señala «Empezar» (más intuitivo)");
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
      ok((await manos.count()) >= 1, "Vender ahora: un icono de toque pulsa el botón");
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
      // (la ficha de producto ya visitada deja en el documento otras flechas «Volver atrás» ocultas: se coge la que se ve)
      const flechaVisible = await p.evaluate(() => {
        const r = Array.from(document.querySelectorAll('[aria-label="Volver atrás"]')).map((e) => e.getBoundingClientRect()).find((b) => b.width > 4 && b.height > 4);
        return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
      });
      const flecha = flechaVisible;
      const aro = await rect(p.locator("#guia-aro"));
      ok(!!flecha && !!aro && Math.abs(centro(aro).x - centro(flecha).x) < 30 && Math.abs(centro(aro).y - centro(flecha).y) < 30,
        `Para salir: el recuadro rodea la flecha de volver (aro ${aro ? Math.round(centro(aro).x) + "," + Math.round(centro(aro).y) : "—"}, flecha ${flecha ? Math.round(centro(flecha).x) + "," + Math.round(centro(flecha).y) : "—"})`);
      ok((await manos.count()) >= 1, "Para salir: una mano toca la flecha");
    }

    if (titulo === "El buscador") {
      ok(new URL(p.url()).pathname === "/", "El buscador: la guía ha vuelto a Inicio al salir del formulario");
      // Se escribe solo el NOMBRE del último artículo añadido y, después, el del más antiguo (con letras de Siri).
      const leerBarra = () => p.evaluate(() => document.querySelector("#buscador-flotante .vz-siri-texto")?.textContent.trim() ?? "");
      const esperarBarra = async (cumple, ms = 16000) => {
        const fin = Date.now() + ms;
        while (Date.now() < fin) {
          const t = await leerBarra();
          if (cumple(t)) return t;
          await p.waitForTimeout(150);
        }
        return null;
      };
      // Real: el texto ya escrito del todo (se queda quieto unos segundos mostrando los resultados).
      const barraEstable = async (distintaDe, ms) => {
        const fin = Date.now() + ms;
        let anterior = "";
        while (Date.now() < fin) {
          const t = await leerBarra();
          if (t.length >= 8 && t === anterior && t !== distintaDe) return t;
          anterior = t;
          await p.waitForTimeout(700);
        }
        return null;
      };
      // Simulado: «Reciente Uno» y «Antiguo Uno». Real: dos nombres de artículos reales, distintos.
      const nombreUno = REAL ? await barraEstable(null, 20000) : await esperarBarra((t) => t === "Reciente Uno");
      ok(nombreUno !== null && !/^lo (último|más)/i.test(nombreUno), `El buscador: se escribe solo el nombre del último artículo añadido con letras de Siri («${nombreUno ?? "nada"}»)`);
      const resultados = p.locator("#buscador-resultados");
      // Simulado: sale ese artículo. Real: sale algún producto con su precio (123,45€).
      const hayProductos = (nombre) =>
        REAL
          ? p.waitForFunction(() => /\d+,\d{2}\s?€/.test(document.querySelector("#buscador-resultados")?.innerText ?? ""), null, { timeout: 12000 }).then(() => true, () => false)
          : resultados.getByText(nombre).first().waitFor({ timeout: 8000 }).then(() => true, () => false);
      const recientes = await hayProductos("Reciente Uno");
      ok(recientes, `El buscador: al escribir el nombre del último añadido sale ese artículo${REAL ? " (real)" : ""}`);
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
      // De segundo ejemplo, el nombre del artículo MÁS ANTIGUO.
      const nombreDos = REAL ? await barraEstable(nombreUno, 24000) : await esperarBarra((t) => t === "Antiguo Uno", 24000);
      ok(nombreDos !== null && nombreDos !== nombreUno, `El buscador: de segundo ejemplo se escribe el nombre del artículo más antiguo («${nombreDos ?? "nada"}»)`);
      const antiguos = await hayProductos("Antiguo Uno");
      ok(antiguos, `El buscador: al escribir el nombre del más antiguo sale ese artículo${REAL ? " (real)" : ""}`);
      await p.waitForTimeout(600);
      await capturar(p, "09b-buscador-antiguo");
      await p.getByRole("button", { name: "Ejemplo: último añadido" }).tap();
      const otraVez = await esperarBarra((t) => t === nombreUno, 12000);
      ok(otraVez !== null, "El buscador: tocar «Último añadido» vuelve a escribir su nombre");
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
      const textoPerfil = await tarjeta.innerText();
      if (SESION) {
        ok(await p.evaluate(() => !!document.getElementById("perfil-pestanas")), "Perfil (con sesión): se ven las pestañas «Mi cuenta» y «Mis seguimientos»");
        ok(textoPerfil.includes("Mi cuenta"), "Perfil (con sesión): la tarjeta habla de «Mi cuenta»");
      } else {
        ok(textoPerfil.includes("entras o creas tu cuenta") && /pedidos y facturas/.test(textoPerfil), "Perfil (sin sesión): la tarjeta habla de entrar o crear la cuenta y de que con ella se ven pedidos y facturas");
      }
    }

    if (titulo === "Mis seguimientos") {
      // La guía pulsa la pestaña «Mis seguimientos» y se ve su contenido; el puntero apunta a esa pestaña.
      // (con el cliente falso la lista puede quedarse en «Cargando tus seguimientos…»: también es su contenido)
      const visto = await p.waitForFunction(() => /Cargando tus seguimientos|Reparaciones y Mantenimientos|Pedidos/.test(document.getElementById("root")?.innerText ?? ""), null, { timeout: 8000 }).then(() => true, () => false);
      ok(visto, "Mis seguimientos: la guía pulsa la pestaña y se ve su contenido (seguimientos de reparaciones y pedidos)");
      await capturar(p, "10b-seguimientos");
      const pestana = await p.evaluate(() => {
        // (la página de Perfil existe dos veces en el documento: una oculta de 0×0)
        const r = Array.from(document.querySelectorAll("#perfil-pestanas *"))
          .filter((n) => n.children.length === 0 && n.textContent.trim() === "Mis seguimientos")
          .map((n) => n.getBoundingClientRect())
          .find((b) => b.width > 4);
        return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
      });
      const mano = await rect(manos);
      ok(!!pestana && !!mano && Math.abs(centro(mano).x - centro(pestana).x) < 60 && Math.abs(centro(mano).y - centro(pestana).y) < 60,
        `Mis seguimientos: el puntero apunta a la pestaña (puntero ${mano ? Math.round(centro(mano).x) + "," + Math.round(centro(mano).y) : "—"}, pestaña ${pestana ? Math.round(centro(pestana).x) + "," + Math.round(centro(pestana).y) : "—"})`);
    }

    // El elemento visible de la página (la de Perfil existe dos veces en el documento, una oculta de 0×0).
    const visible = (selector) =>
      p.evaluate((s) => {
        const r = Array.from(document.querySelectorAll(s)).map((e) => e.getBoundingClientRect()).find((b) => b.width > 4 && b.height > 4);
        return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
      }, selector);
    const rodea = (aro, b) => !!aro && !!b && aro.x <= b.x + 2 && aro.y <= b.y + 2 && aro.x + aro.width >= b.x + b.width - 2 && aro.y + aro.height >= b.y + b.height - 2;
    // Espera (hasta 5 s) a que el recuadro rodee lo que debe: la lista de pedidos tarda en cargar y el recuadro la sigue.
    const esperarRodea = async (selector) => {
      let b = null;
      let aro = null;
      for (let k = 0; k < 14; k++) {
        b = await visible(selector);
        aro = await rect(p.locator("#guia-aro"));
        if (rodea(aro, b)) break;
        await p.waitForTimeout(400);
      }
      return { b, aro, bien: rodea(aro, b) };
    };

    if (titulo === "Mis pedidos") {
      ok(SESION, "Mis pedidos: solo se enseña con sesión iniciada");
      const f = await esperarRodea("#seguimiento-filtros");
      ok(f.bien, `Mis pedidos: el recuadro rodea los filtros de «Mis pedidos» (filtros ${f.b ? Math.round(f.b.x) + "," + Math.round(f.b.y) + " " + Math.round(f.b.width) + "×" + Math.round(f.b.height) : "—"})`);
      const textoFiltros = await p.evaluate(() => Array.from(document.querySelectorAll("#seguimiento-filtros")).map((e) => e.innerText).join(" "));
      ok(["Todos", "En curso", "Completados", "Cancelados"].every((n) => textoFiltros.includes(n)), `Mis pedidos: se ven los filtros Todos, En curso, Completados y Cancelados (${textoFiltros.replace(/\s+/g, " ").trim()})`);
      ok(/Filtra tus pedidos/.test(await tarjeta.innerText()), "Mis pedidos: la tarjeta lo explica en una frase");
      await capturar(p, "12a-mis-pedidos");
    }

    if (titulo === "Tus facturas") {
      ok(SESION, "Tus facturas: solo se enseña con sesión iniciada");
      const f = await esperarRodea("#seguimiento-filtro-facturas");
      ok(f.bien, `Tus facturas: el recuadro rodea el filtro «Facturas» (filtro ${f.b ? Math.round(f.b.x) + "," + Math.round(f.b.y) + " " + Math.round(f.b.width) + "×" + Math.round(f.b.height) : "—"})`);
      const t = await tarjeta.innerText();
      ok(/Mis pedidos → Facturas/.test(t) && /24 h/.test(t) && /24-48 h/.test(t), `Tus facturas: dice dónde están y el plazo (24 h con tarjeta, 24-48 h en efectivo)`);
      ok((await tarjeta.getByRole("button", { name: /Ver mis facturas/ }).count()) === 1, "Tus facturas: la tarjeta tiene el botón «Ver mis facturas»");
      await capturar(p, "12b-tus-facturas");
    }

    if (titulo === "Me gusta") {
      ok(SESION, "Me gusta: solo se enseña con sesión iniciada");
      const visto = await p.waitForFunction(() => Array.from(document.querySelectorAll("#perfil-me-gusta")).some((e) => e.getBoundingClientRect().width > 4), null, { timeout: 8000 }).then(() => true, () => false);
      ok(visto, "Me gusta: la guía pulsa la pestaña y se ve su contenido");
      const pestana = await p.evaluate(() => {
        const r = Array.from(document.querySelectorAll("#perfil-pestanas *"))
          .filter((n) => n.children.length === 0 && n.textContent.trim() === "Me gusta")
          .map((n) => n.getBoundingClientRect())
          .find((b) => b.width > 4);
        return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
      });
      const mano = await rect(manos);
      ok(!!pestana && !!mano && Math.abs(centro(mano).x - centro(pestana).x) < 60 && Math.abs(centro(mano).y - centro(pestana).y) < 60, "Me gusta: el puntero apunta a la pestaña «Me gusta»");
      await capturar(p, "12c-me-gusta");
    }

    if (titulo === "Reparación por envío") {
      ok(ENVIO, "Reparación por envío: solo sale si la reparación por envío está activa");
      ok(/Correos/.test(await tarjeta.innerText()) && /Mis seguimientos/.test(await tarjeta.innerText()), "Reparación por envío: la tarjeta cuenta lo de Correos, la etiqueta y Mis seguimientos");
      await capturar(p, "18c-reparacion-envio");
    }

    if (titulo === "Las pestañas del Foro") {
      // La guía despliega el selector y va enseñando cada pestaña: el contenido de la página cambia solo.
      const fotos = new Set();
      for (let k = 0; k < 26; k++) {
        // Lo que se VE de la página: una foto de la mitad de arriba de la pantalla (encima de la tarjeta de la guía).
        // (Las pantallas de las otras pestañas siguen en el documento, tapadas; por eso no se mira el texto.)
        const foto = await p.screenshot({ clip: { x: 0, y: 0, width: VW, height: Math.round(VH * 0.5) } });
        fotos.add(createHash("sha1").update(foto).digest("hex").slice(0, 10));
        await p.waitForTimeout(500);
      }
      ok(fotos.size >= 3, `Las pestañas del Foro: la guía las va enseñando solas (${fotos.size} imágenes distintas de la página en 13 s)`);
      await capturar(p, "14b-foro-pestanas");
      const glifo = () =>
        p.evaluate(() => Array.from(document.querySelectorAll('[data-testid="selector-pestanas"]')).find((e) => e.getBoundingClientRect().width > 4)?.textContent ?? "");
      // Tocar el botón señalado lo pulsa de verdad: el menú del Foro se abre o se cierra.
      const antes = await glifo();
      await p.getByRole("button", { name: "Probar el botón" }).tap();
      await p.waitForTimeout(800);
      ok((await glifo()) !== antes, "Las pestañas del Foro: tocar el botón azul señalado lo pulsa de verdad (el menú cambia)");
      // Tocar una pestaña en la tarjeta la abre.
      await p.getByRole("button", { name: "Ver Torneos" }).tap();
      const torneos = await p.waitForFunction(() => /PRÓXIMAMENTE/.test(document.body.innerText), null, { timeout: 6000 }).then(() => true, () => false);
      ok(torneos, "Las pestañas del Foro: tocar «Torneos» en la tarjeta abre esa pestaña");
    }

    if (titulo === "Filtros y orden") {
      ok(/\/catalogo/.test(p.url()), `Filtros y orden: la guía lleva al catálogo (${new URL(p.url()).pathname})`);
      // El catálogo recoloca sus botones cuando cargan los artículos: el recuadro los sigue (se espera hasta 4 s).
      let rodea = false;
      for (let k = 0; k < 14 && !rodea; k++) {
        const boton = await p.evaluate(() => {
          const r = Array.from(document.querySelectorAll('[aria-label^="Filtros"]')).map((e) => e.getBoundingClientRect()).find((b) => b.width > 4);
          return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
        });
        const aroF = await rect(p.locator("#guia-aro"));
        rodea = !!boton && !!aroF && aroF.x <= boton.x + 2 && aroF.y <= boton.y + 2 && aroF.x + aroF.width >= boton.x + boton.width - 2;
        if (!rodea) await p.waitForTimeout(300);
      }
      ok(rodea, "Filtros y orden: el recuadro rodea el botón «Filtros»");
      await capturar(p, "06b-filtros");
    }

    if (titulo === "Un artículo") {
      const url = new URL(p.url());
      ok(/^\/producto\//.test(url.pathname) && url.searchParams.get("guia") === "1", `Un artículo: la guía enseña la ficha de un artículo sin contar visita (${url.pathname}${url.search})`);
      const anadir = await rect(p.locator('[aria-label^="Añadir "]'));
      const comprar = await rect(p.locator('[aria-label^="Comprar ya "]'));
      const aroA = await rect(p.locator("#guia-aro"));
      if (anadir && comprar) {
        ok(!!aroA && aroA.x <= Math.min(anadir.x, comprar.x) + 2 && aroA.x + aroA.width >= Math.max(anadir.x + anadir.width, comprar.x + comprar.width) - 2 && aroA.y <= Math.min(anadir.y, comprar.y) + 2,
          "Un artículo: el recuadro rodea «Añadir a la cesta» y «Comprar ya»");
      } else {
        info("Un artículo: este artículo no muestra «Añadir» y «Comprar ya» (reservado por otro cliente o ya vendido): no hay botones que enmarcar");
      }
      await capturar(p, "07a-ficha");
    }

    if (titulo === "Cómo se compra") {
      const textoCompra = await tarjeta.innerText();
      ok(["Añadir", "Reserva", "Entrega", "Pagas", "Chat"].every((n) => textoCompra.includes(n)), "Cómo se compra: la tarjeta enseña con iconos los pasos de una compra");
      // Las formas de pago salen de /api/pago (simulado con tarjeta, Bizum y Klarna): solo se nombran las que ofrece el servidor.
      ok(REAL || (/Pago seguro online \(tarjeta, Bizum y Klarna\)/.test(textoCompra) && /otras formas de pago/.test(textoCompra)), `Cómo se compra: dice pago seguro online (tarjeta, Bizum y Klarna) y otras formas de pago («${textoCompra.replace(/\n/g, " | ").slice(0, 150)}»)`);
      ok((await p.locator("#guia-aro").count()) === 0 && /\/cesta/.test(p.url()), "Cómo se compra: se ve la cesta entera (no se oscurece)");
    }

    if (titulo === "Reacciona y responde") {
      const textoGestos = await tarjeta.innerText();
      ok(["1 toque", "2 toques", "Escribir"].every((n) => textoGestos.includes(n)), "Reacciona y responde: la tarjeta enseña con iconos los gestos de los mensajes");
      ok((await p.locator("#guia-aro").count()) === 0 && /\/chat-global/.test(p.url()), "Reacciona y responde: se ve el Foro entero (no se oscurece)");
      await p.waitForTimeout(2500);
      await capturar(p, "17b-foro-mensajes");
    }

    if (titulo === "Hablar con el equipo") {
      ok(/\/blue-ia/.test(p.url()), `Hablar con el equipo: la guía lleva a Blue IA (${new URL(p.url()).pathname})`);
      const enlace = await rect(p.locator('[aria-label="Hablar con el equipo"]'));
      const aroE = await rect(p.locator("#guia-aro"));
      ok(!!enlace && !!aroE && aroE.x <= enlace.x + 2 && aroE.y <= enlace.y + 2, "Hablar con el equipo: el recuadro rodea el botón «Hablar con el equipo»");
    }

    if (titulo === "Este soy yo") {
      // Qué sabe hacer Blue, con iconos (sale de su panel: Blue IA, avisos, Vender, el equipo y las noticias).
      const textoYo = await tarjeta.innerText();
      ok(["Dudas", "Avisos", "Vender", "Equipo", "Noticias"].every((n) => textoYo.includes(n)), "Este soy yo: la tarjeta enseña con iconos lo que sabe hacer Blue (Dudas, Avisos, Vender, Equipo, Noticias)");
      ok(/Respondo dudas/.test(textoYo), "Este soy yo: la tarjeta lo explica en una frase");
    }

    if (titulo === "Reparación y limpieza") {
      ok(/\/servicios/.test(p.url()), `Reparación y limpieza: la guía lleva a la página de servicios (${new URL(p.url()).pathname})`);
      ok(await p.getByText("Servicios profesionales para tus dispositivos").first().isVisible().catch(() => false), "Reparación y limpieza: se ve la página de servicios");
      if ((await p.locator("#servicios-lista").count()) > 0) {
        const primero = await rect(p.locator("#servicios-lista"));
        const aroS = await rect(p.locator("#guia-aro"));
        if (!aroS) {
          // En pantallas bajas el primer servicio empieza donde empieza la tarjeta de la guía: no se enmarca, se ve la página.
          info(`Reparación y limpieza: sin recuadro en el primer servicio (empieza en y ${Math.round(primero?.y ?? 0)}, donde llega la tarjeta de la guía); se ve la página con su título enmarcado`);
        } else {
          ok(!!primero && aroS.x <= primero.x + 2 && aroS.y <= primero.y + 2, "Reparación y limpieza: el recuadro rodea la parte de arriba del primer servicio");
        }
      } else {
        info("Reparación y limpieza: la tienda no tiene servicios publicados ahora mismo (no hay primer servicio que enmarcar)");
      }
      await capturar(p, "18b-servicios");
    }

    // Pantalla: nada se ensancha
    const anchos = await p.evaluate(() => ({ pantalla: window.innerWidth, pagina: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) }));
    ok(anchos.pagina <= anchos.pantalla + 1, `${titulo}: la página no se ensancha (${anchos.pagina}/${anchos.pantalla})`);

    // Sin sesión la guía acaba en «Tu cuenta»; con sesión (no se ofrece crear cuenta) en «Reparación y limpieza».
    if (titulo === "Tu cuenta" || (SESION && titulo === ULTIMO)) break;
    // «Vender ahora» pasa solo al formulario: no hay que tocar nada (si se tocara, se saltaría «Vender mi artículo»).
    if (titulo === "Vender ahora") continue;
    if (!(await siguiente.count())) break;
    await siguiente.tap();
  }

  // 22 pasos (23 si se puede instalar la tienda), con o sin sesión; uno menos si la tienda no tiene ningún artículo.
  ok(vistos >= 21, `se recorren ${vistos} pasos de la guía (22 o 23 según se pueda instalar la tienda; con o sin sesión)`);
  ok(titulo === ULTIMO, `el último paso es «${ULTIMO}»`);
  if (SESION) {
    ok((await siguiente.innerText()).includes("Terminar"), "con sesión el último botón dice «Terminar»");
    ok(vistos === (await p.evaluate(() => Number(document.querySelector('[aria-label^="Paso "][aria-label*=" de "]')?.getAttribute("aria-label")?.match(/de (\d+)/)?.[1] ?? 0))), "el contador de pasos coincide con los pasos vistos");
    await siguiente.tap();
  } else {
    await p.getByText("Ahora no, gracias").tap();
  }
  await p.locator("#guia-tarjeta").waitFor({ state: "detached", timeout: 8000 }).then(
    () => ok(true, SESION ? "«Terminar» cierra la guía" : "«Ahora no, gracias» cierra la guía"),
    () => ok(false, SESION ? "«Terminar» debía cerrar la guía" : "«Ahora no, gracias» debía cerrar la guía")
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
    for (let i = 0; i < 28; i++) {
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
    ok(/^Paso 1[12] de (2[1-9])$/.test(etiqueta ?? ""), `Atrás: en «Perfil» el contador dice «${etiqueta}» (paso 12; de 22 o 23 pasos sin sesión, con más con sesión o con reparación por envío)`);
    const vuelta = [];
    let seQuedaEnVender = true;
    for (let i = 0; i < 22; i++) {
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
    for (let i = 0; i < 28; i++) {
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
    ok(new URL(q.url()).pathname === "/", `Saltar en la Cesta: se vuelve a la pantalla donde se abrió la guía, Inicio (${new URL(q.url()).pathname})`);
    ok(q.errores.length === 0, `Atrás, deslizar y saltar: sin errores de JavaScript (${q.errores.length}${q.errores[0] ? ": " + q.errores[0] : ""})`);
    await q.close();
  }

  // Saltar con el formulario de Vender abierto (era solo una demostración): se vuelve a Inicio.
  {
    const q = await abrirGuia(ctx);
    const siguienteQ = q.locator('[aria-label="Paso siguiente"]');
    for (let i = 0; i < 10; i++) {
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
    // Abierta desde una ficha de producto: al saltar se vuelve a ESA ficha (no a Inicio ni a donde la guía te llevó).
    const ficha = "/producto/3436a5a6-1c47-40f5-9d93-e8572b7caccc";
    const q = await abrirGuia(ctx, ficha);
    const siguienteQ = q.locator('[aria-label="Paso siguiente"]');
    await q.waitForTimeout(1200);
    await siguienteQ.tap();
    await q.waitForTimeout(1500);
    ok(new URL(q.url()).pathname === "/", "Desde una ficha: la guía te lleva a Inicio para enseñar (y la ficha queda atrás)");
    await q.getByRole("button", { name: "Saltar la guía" }).tap();
    await q.waitForFunction((f) => location.pathname === f, ficha, { timeout: 8000 }).catch(() => {});
    ok(new URL(q.url()).pathname === ficha && (await q.locator("#guia-tarjeta").count()) === 0, `Desde una ficha: al saltar se vuelve a la ficha donde se abrió (${new URL(q.url()).pathname})`);
    await q.close();
  }

  if (EXTRA) {
    // --- Primera visita: la guía se ofrece sola y UNA vez por dispositivo ----------------------------------
    // (siempre sin sesión: la guía solo se ofrece sola a quien aún no ha entrado)
    const nuevo = await contexto(navegador, { conGuiaVista: false, conSesion: false });
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
    const directo = await contexto(navegador, { conGuiaVista: false, conSesion: false });
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
  // --- Guía completa al día (2026-11-13): reparación por envío, cesta con «Ir a pagar», formas de pago, facturas, ficha estable -----
  // Avanza con «Siguiente» hasta el paso con ese título (sin pasarse de «Tu cuenta»). «Vender ahora» pasa solo al formulario.
  const avanzarHasta = async (pagina, objetivo, tope = 30) => {
    const sig = pagina.locator('[aria-label="Paso siguiente"]');
    for (let i = 0; i < tope; i++) {
      await pagina.waitForTimeout(650);
      const t = await tituloActual(pagina);
      if (t === objetivo) return true;
      if (t === "Tu cuenta") return false;
      if (t === "Vender ahora") {
        await pagina.waitForFunction(() => location.pathname.startsWith("/vender"), null, { timeout: 12000 }).catch(() => {});
        continue;
      }
      // Con sesión el último paso termina la guía («Terminar»): si ya no hay tarjeta, no hay más pasos.
      if (!(await sig.count())) return false;
      await sig.tap();
    }
    return false;
  };

  // La reparación por envío ACTIVA (simulada): sale «Reparación por envío» en Servicios; INACTIVA: la guía ni la nombra.
  {
    const c = await contexto(navegador, { conGuiaVista: true, envio: true });
    const q = await abrirGuia(c);
    const llego = await avanzarHasta(q, "Reparación por envío");
    ok(llego, "Reparación por envío activa: la guía enseña el paso «Reparación por envío»");
    if (llego) {
      await q.waitForTimeout(1200);
      const t = await q.locator("#guia-tarjeta").innerText();
      ok(/Correos/.test(t) && /etiqueta/.test(t) && /presupuesto/.test(t) && /Mis seguimientos/.test(t), `Reparación por envío activa: la tarjeta cuenta Correos, etiqueta, presupuesto y Mis seguimientos («${t.replace(/\n/g, " | ").slice(0, 140)}»)`);
      ok(/\/servicios/.test(q.url()), `Reparación por envío activa: se enseña en la página de servicios (${new URL(q.url()).pathname})`);
      ok(((await tituloActual(q)) === "Reparación por envío") && (await letraYDesborde(q)).chicas.length === 0, "Reparación por envío activa: sin letra de menos de 13 px");
      await capturar(q, "22-reparacion-envio");
    }
    ok(q.errores.length === 0, `Reparación por envío activa: sin errores de JavaScript (${q.errores.length})`);
    await c.close();
  }
  if (ENVIO) {
    const c = await contexto(navegador, { conGuiaVista: true, envio: false });
    const q = await abrirGuia(c);
    const llego = await avanzarHasta(q, "Reparación por envío");
    ok(!llego, "Reparación por envío inactiva: la guía no la menciona (no sale el paso)");
    await c.close();
  }

  // La cesta con artículos: se señala «Ir a pagar»; «Cómo se compra» nombra solo las formas de pago que ofrece /api/pago.
  for (const [nombre, pago, esperado, prohibido] of [
    ["tarjeta, Bizum y Klarna", { ok: true, disponible: true, klarna: true, bizum: true }, /Pago seguro online \(tarjeta, Bizum y Klarna\) u otras formas de pago/, null],
    ["solo tarjeta y Bizum", { ok: true, disponible: true, klarna: false, bizum: true }, /Pago seguro online \(tarjeta y Bizum\) u otras formas de pago/, /Klarna/],
    ["sin pago online en el servidor", { ok: true, disponible: false, klarna: false, bizum: false }, /confirmas el pedido y te hablamos/, /Bizum|Klarna|tarjeta/],
  ]) {
    const c = await contexto(navegador, { conGuiaVista: true, conSesion: false, cesta: CESTA_LLENA, pago });
    const q = await abrirGuia(c);
    const llego = await avanzarHasta(q, "Cesta");
    ok(llego, `Cesta con artículos (${nombre}): la guía llega al paso «Cesta»`);
    if (llego) {
      await q.locator("#cesta-pagar").first().waitFor({ timeout: 20000 }).catch(() => {});
      await q.waitForTimeout(1800);
      if (nombre === "tarjeta, Bizum y Klarna") {
        const tj = await rect(q.locator("#guia-tarjeta"));
        const sg = await rect(q.locator('[aria-label="Paso siguiente"]'));
        const pagar = await q.evaluate(() => {
          // (el nativeID cesta-pagar está en el contenido del botón: el botón entero es su padre)
          const r = Array.from(document.querySelectorAll("div:has(> #cesta-pagar)")).map((e) => e.getBoundingClientRect()).find((b) => b.width > 4 && b.height > 4);
          return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
        });
        const aro = await rect(q.locator("#guia-aro"));
        ok(!!pagar && !!aro && aro.x <= pagar.x + 2 && aro.y <= pagar.y + 2 && aro.x + aro.width >= pagar.x + pagar.width - 2 && aro.y + aro.height >= pagar.y + pagar.height - 2,
          `Cesta con artículos: el recuadro rodea «Ir a pagar» (botón ${pagar ? Math.round(pagar.x) + "," + Math.round(pagar.y) + " " + Math.round(pagar.width) + "×" + Math.round(pagar.height) : "—"}, recuadro ${aro ? Math.round(aro.x) + "," + Math.round(aro.y) + " " + Math.round(aro.width) + "×" + Math.round(aro.height) : "—"})`);
        ok(!!aro && !!tj && !(aro.x < tj.x + tj.width && aro.x + aro.width > tj.x && aro.y < tj.y + tj.height - 4 && aro.y + aro.height > tj.y + 4), "Cesta con artículos: la tarjeta no tapa «Ir a pagar»");
        ok(/Ir a pagar/.test(await q.locator("#guia-tarjeta").innerText()), "Cesta con artículos: la tarjeta nombra «Ir a pagar»");
        ok((await q.locator('[data-testid="guia-toque"]').count()) >= 1, "Cesta con artículos: un icono de toque enseña «Ir a pagar»");
        ok(!!sg && sg.y / VH > 0.3 && sg.y + sg.height <= VH, `Cesta con artículos: «Siguiente» sigue a mano (y ${Math.round(sg?.y ?? 0)} de ${VH})`);
        const l = await letraYDesborde(q);
        ok(l.chicas.length === 0 && l.cortados.length === 0 && l.fuera.length === 0, `Cesta con artículos: letra de 13 px o más y nada cortado (${l.chicas.concat(l.cortados, l.fuera).join(", ")})`);
        await capturar(q, "15-cesta-ir-a-pagar");
      }
      await q.locator('[aria-label="Paso siguiente"]').tap();
      await q.waitForTimeout(1500);
      const t = await q.locator("#guia-tarjeta").innerText();
      ok((await tituloActual(q)) === "Cómo se compra" && esperado.test(t) && !(prohibido && prohibido.test(t)), `Cómo se compra (${nombre}): «${t.replace(/\n/g, " | ").slice(0, 150)}»`);
      if (nombre === "tarjeta, Bizum y Klarna") await capturar(q, "15b-como-se-compra");
    }
    ok(q.errores.length === 0, `Cesta con artículos (${nombre}): sin errores de JavaScript (${q.errores.length})`);
    await c.close();
  }

  // «Ver mis facturas» (con sesión): cierra la guía y lleva a Mis pedidos con el filtro «Facturas» ya puesto.
  if (SESION) {
    const q = await abrirGuia(ctx);
    const llego = await avanzarHasta(q, "Tus facturas");
    ok(llego, "Ver mis facturas: la guía llega al paso «Tus facturas»");
    if (llego) {
      await q.getByRole("button", { name: /Ver mis facturas/ }).tap();
      await q.locator("#guia-tarjeta").waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
      await q.waitForFunction(() => /filtro=facturas/.test(location.search), null, { timeout: 8000 }).catch(() => {});
      ok((await q.locator("#guia-tarjeta").count()) === 0 && /tab=seguimientos/.test(q.url()) && /filtro=facturas/.test(q.url()), `Ver mis facturas: cierra la guía y lleva a ${new URL(q.url()).pathname}${new URL(q.url()).search}`);
      const elegido = await q.waitForFunction(
        () => Array.from(document.querySelectorAll("#seguimiento-filtro-facturas")).some((e) => e.getBoundingClientRect().width > 4 && e.getAttribute("aria-selected") === "true"),
        null,
        { timeout: 8000 }
      ).then(() => true, () => false);
      ok(elegido, "Ver mis facturas: el filtro «Facturas» queda elegido");
      await capturar(q, "12d-ver-mis-facturas");
    }
    await q.close();
  }

  // «Un artículo»: «Siguiente» queda en su sitio 3 veces seguidas, también MIENTRAS la ficha se desplaza hasta los botones.
  {
    let enLaFicha = 0;
    // (sin sesión: con la sesión simulada el token es falso y la tienda real no devuelve el artículo más reciente)
    const sinSesion = await contexto(navegador, { conGuiaVista: true, conSesion: false });
    for (let v = 1; v <= 3; v++) {
      const q = await abrirGuia(sinSesion);
      const sig = q.locator('[aria-label="Paso siguiente"]');
      const refY = (await rect(sig))?.y ?? 0;
      let llegado = false;
      for (let i = 0; i < 12; i++) {
        await q.waitForTimeout(900);
        const t = await tituloActual(q);
        if (t === "Un artículo") {
          llegado = true;
          break;
        }
        if (t === "Vender ahora") break; // la tienda no tiene artículos que enseñar
        await sig.tap();
      }
      if (!llegado) {
        info(`Un artículo (vez ${v}): la tienda no tiene artículos que enseñar, no hay ficha que medir`);
        await q.close();
        continue;
      }
      enLaFicha++;
      const ys = [];
      for (let k = 0; k < 40; k++) {
        ys.push(Math.round((await rect(sig))?.y ?? 0));
        await q.waitForTimeout(100);
      }
      const peor = Math.max(...ys.map((y) => Math.abs(y - refY)));
      ok(peor < 2, `Un artículo (vez ${v} de 3): «Siguiente» no se mueve de su sitio (y ${refY}) durante 4 s de desplazamiento y después (desvío máximo ${peor} px; y ${[...new Set(ys)].join(", ")})`);
      if (v === 1) await capturar(q, "07c-ficha-estable");
      await q.close();
    }
    info(`Un artículo: medido en ${enLaFicha} de 3 vueltas`);
    await sinSesion.close();
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
