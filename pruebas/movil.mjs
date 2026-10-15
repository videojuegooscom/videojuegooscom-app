/**
 * pruebas/movil.mjs — revisión de la tienda como un iPhone, con un navegador de verdad.
 *
 * Qué hace: abre la tienda con Chromium sin pantalla (playwright-core) a tamaño de iPhone
 * (390 × 844, táctil) y, en cada página:
 * - espera a que cargue y hace una captura (PNG) en la carpeta de salida;
 * - comprueba que nada se sale por los lados (ancho de la página = ancho de la pantalla);
 * - apunta errores de la consola, errores de JavaScript y peticiones que fallan.
 * En Inicio, además:
 * - espera a que aparezca Blue (10 s) y comprueba que la tienda sigue respondiendo a los
 *   toques (toca la sección Perfil y mira que cambia de pantalla);
 * - abre la guía de Blue y captura cada paso.
 *
 * Uso (Claude lo lanza antes de publicar cambios visuales):
 *   node pruebas/movil.mjs [direccion] [carpeta_salida]
 *   p. ej. node pruebas/movil.mjs https://videojuegoszaragoza.com /tmp/capturas
 * Sale con código 1 si hay algún fallo.
 *
 * Requisitos: el paquete playwright-core (devDependency) y su navegador, que se descarga
 * una vez en el servidor: npx playwright-core install chromium-headless-shell
 * El navegador necesita librerías del sistema (libnss3, libnspr4, fuentes…): las instala el
 * dueño con sudo (apt-get install …, lista en `npx playwright-core install-deps --dry-run
 * chromium-headless-shell`).
 */
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

const BASE = (process.argv[2] ?? "https://videojuegoszaragoza.com").replace(/\/$/, "");
// Fuera del repositorio por defecto: las capturas no se suben.
const SALIDA = process.argv[3] ?? join(tmpdir(), "capturas-movil");
mkdirSync(SALIDA, { recursive: true });

const PAGINAS = [
  ["inicio", "/"],
  ["catalogo", "/catalogo"],
  ["cesta", "/cesta"],
  ["perfil", "/perfil"],
  ["blue-ia", "/blue-ia"],
  ["foro", "/chat-global"],
  ["servicios", "/servicios"],
  ["envios", "/politicas/envios"],
];

const IPHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: "es-ES",
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1",
};

const fallos = [];
const avisos = [];

async function revisarPagina(contexto, nombre, ruta) {
  const pagina = await contexto.newPage();
  const errores = [];
  pagina.on("pageerror", (e) => errores.push(`error JS: ${e.message.slice(0, 160)}`));
  pagina.on("console", (m) => {
    if (m.type() === "error") errores.push(`consola: ${m.text().slice(0, 160)}`);
  });
  pagina.on("requestfailed", (r) => {
    const url = r.url();
    // Analítica y fuentes externas no cuentan como fallo de la tienda.
    if (!/google|vercel-insights|_vercel\/insights/.test(url)) errores.push(`petición fallida: ${url.slice(0, 120)}`);
  });
  pagina.on("response", (r) => {
    if (r.status() >= 400 && !/favicon/.test(r.url())) errores.push(`HTTP ${r.status()}: ${r.url().slice(0, 120)}`);
  });

  const t0 = Date.now();
  await pagina.goto(BASE + ruta, { waitUntil: "networkidle", timeout: 45000 });
  const ms = Date.now() - t0;
  await pagina.waitForTimeout(1500);

  const anchos = await pagina.evaluate(() => ({
    pantalla: window.innerWidth,
    pagina: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  if (anchos.pagina > anchos.pantalla + 1) fallos.push(`${nombre}: la página (${anchos.pagina}px) es más ancha que la pantalla (${anchos.pantalla}px)`);

  await pagina.screenshot({ path: join(SALIDA, `${nombre}.png`) });
  for (const e of errores) (/(HTTP 4|petición fallida)/.test(e) ? avisos : fallos).push(`${nombre}: ${e}`);
  console.log(`${errores.length ? "AVISO" : "OK   "} ${nombre} (${ms} ms, ancho ${anchos.pagina}/${anchos.pantalla})`);
  return pagina;
}

async function revisarBlueYGuia(contexto) {
  const pagina = await contexto.newPage();
  await pagina.goto(BASE + "/", { waitUntil: "networkidle", timeout: 45000 });
  // Blue aparece a los 10 s.
  await pagina.waitForSelector("#blue-flotante", { timeout: 20000 }).catch(() => fallos.push("Blue no aparece en 20 s"));
  await pagina.waitForTimeout(1500);
  await pagina.screenshot({ path: join(SALIDA, "inicio-con-blue.png") });

  // ¿Sigue respondiendo a los toques con Blue en pantalla? (la guía automática se ha
  // marcado como vista antes de cargar, así que no tapa nada)
  await pagina.locator('[data-testid="pestana-perfil"]').tap();
  await pagina.waitForTimeout(1500);
  if (!pagina.url().includes("/perfil")) fallos.push("con Blue en pantalla, tocar la sección Perfil no hace nada (¿tienda bloqueada?)");
  else console.log("OK    con Blue en pantalla la tienda responde a los toques");
  await pagina.locator('[data-testid="pestana-index"]').tap();
  await pagina.waitForTimeout(1500);

  // Guía: Blue → panel → «Ver la guía de la tienda», y una captura por paso.
  await pagina.locator('[aria-label="Abrir Blue, el asistente de la tienda"]').tap();
  await pagina.waitForTimeout(800);
  await pagina.getByText("Ver la guía de la tienda").tap();
  for (let i = 1; i <= 12; i++) {
    await pagina.waitForTimeout(1300);
    await pagina.screenshot({ path: join(SALIDA, `guia-${String(i).padStart(2, "0")}.png`) });
    const siguiente = pagina.locator('[aria-label="Paso siguiente"]');
    if (!(await siguiente.count())) break;
    await siguiente.tap();
  }
  console.log("OK    guía capturada");
  await pagina.close();
}

const navegador = await chromium.launch();
try {
  const contexto = await navegador.newContext(IPHONE);
  // La guía automática ya vista y las cookies decididas: así no tapan las capturas.
  await contexto.addInitScript(() => {
    try {
      localStorage.setItem("videojuegoszaragoza:guia_vista", "1");
    } catch {
      // sin almacenamiento
    }
  });
  for (const [nombre, ruta] of PAGINAS) {
    const p = await revisarPagina(contexto, nombre, ruta);
    await p.close();
  }
  await revisarBlueYGuia(contexto);
} catch (e) {
  fallos.push(`la prueba se cortó: ${String(e).slice(0, 200)}`);
} finally {
  await navegador.close();
}

for (const a of avisos) console.log(`AVISO ${a}`);
for (const f of fallos) console.log(`FALLO ${f}`);
console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
console.log(`capturas en ${SALIDA}`);
process.exit(fallos.length ? 1 : 0);
