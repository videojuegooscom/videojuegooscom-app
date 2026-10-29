/**
 * pruebas/todas.mjs — la batería de regresión completa, con un solo comando y sin tocar producción.
 *
 * Qué hace: lanza una detrás de otra (nunca a la vez: la carga falsearía las de navegador) todas las
 * pruebas de `pruebas/` que existan en la rama, más `tsc` y `lint`, y al final resume qué pasó. Guarda la
 * salida completa de cada una en una carpeta (por defecto en el directorio temporal) y, si una falla,
 * enseña sus últimas líneas.
 *
 * Reglas para que un «todo bien» valga algo:
 *  - Una prueba que sale bien pero no comprobó nada (cero líneas «OK») cuenta como fallo.
 *  - Una prueba que no se puede lanzar (falta su archivo, la base de pruebas, `dist` o el navegador) NO se
 *    da por buena: sale como OMITIDA con el motivo, y con --estricto es un fallo. Así, en una rama que aún
 *    no trae todas las pruebas, la batería lo dice en vez de aparentar que todo está cubierto.
 *  - Con --controles se lanzan además las «pruebas de las pruebas»: versiones a las que se les quita la
 *    corrección y que DEBEN fallar (si pasan, esas pruebas no detectarían el fallo real).
 *
 * Qué toca y qué no: las pruebas de SQL solo hablan con un PostgreSQL local de usar y tirar (se niega a
 * usar cualquier servidor que no sea 127.0.0.1/localhost o que contenga «supabase»); las de navegador cortan
 * las escrituras a la base de datos; las de `api/` ejecutan los manejadores reales contra una base falsa.
 * No usa claves ni lee secretos de ningún tipo, y no se conecta a ningún servicio externo.
 *
 * Uso (desde la raíz del repositorio, con Node 24):
 *   node pruebas/todas.mjs --postgres-propio --compilar     (instalación limpia: arranca y para su propio PostgreSQL y compila dist)
 *   node pruebas/todas.mjs --servidor postgresql://postgres@127.0.0.1:55432 --dist dist
 *   node pruebas/todas.mjs --lista                          (muestra las pruebas y si existen en esta rama)
 *   node pruebas/todas.mjs --sin-sql --sin-navegador        (solo tsc, lint y las de api/ que no necesitan base)
 * Opciones:
 *   --servidor <url>     PostgreSQL local de pruebas ya en marcha.        --postgres-propio  arranca uno propio (ver abajo)
 *   --dist <carpeta>     tienda compilada (por defecto dist).             --compilar         ejecuta `npm run build` antes
 *   --url <dirección>    para movil.mjs, en vez de servir dist.           --salida <carpeta> dónde guardar la salida
 *   --solo <texto,…>     solo las pruebas cuyo nombre contenga el texto.  --tiempo <minutos> límite por prueba (por defecto 15)
 *   --sin-estaticas | --sin-sql | --sin-navegador | --controles | --estricto | --lista
 * Sale con código 1 si algo falla (o si algo se omite con --estricto) y 0 si todo lo lanzado pasó.
 *
 * PostgreSQL propio (--postgres-propio): busca initdb/pg_ctl/postgres en $VZ_PG_BIN, en
 * node_modules/@embedded-postgres/*\/native/bin (se instala con `npm install --no-save
 * embedded-postgres@17.9.0-beta.16`, sin tocar package.json) y en /usr/lib/postgresql/*\/bin. Si el paquete
 * trae sus librerías sin los enlaces de versión (porque los scripts de instalación no se ejecutaron), crea
 * los enlaces en una carpeta temporal. Necesita además `psql` en el PATH. Todo vive en una carpeta temporal
 * que se borra al terminar. Detalle en docs/pruebas-sql-aisladas.md y docs/pruebas.md si existen en la rama.
 *
 * Requisitos de las de navegador: playwright-core (devDependency) y un Chromium sin pantalla.
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(RAIZ);

// --- argumentos -----------------------------------------------------------------------------------

const argv = process.argv.slice(2);
const bandera = (n) => argv.includes(`--${n}`);
const valor = (n, defecto) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : defecto;
};
const OPC = {
  servidor: valor("servidor"),
  propio: bandera("postgres-propio"),
  dist: resolve(valor("dist", "dist")),
  compilar: bandera("compilar"),
  url: valor("url"),
  salida: resolve(valor("salida", join(tmpdir(), `vz-bateria-${Date.now()}`))),
  solo: valor("solo")?.split(",").map((s) => s.trim()).filter(Boolean),
  minutos: Number(valor("tiempo", "15")),
  sinEstaticas: bandera("sin-estaticas"),
  sinSql: bandera("sin-sql"),
  sinNavegador: bandera("sin-navegador"),
  controles: bandera("controles"),
  estricto: bandera("estricto"),
  lista: bandera("lista"),
};

// --- catálogo de pruebas ---------------------------------------------------------------------------
// grupo: estatica | api (sin base) | sql (necesita el PostgreSQL de pruebas) | navegador (necesita dist y Chromium)
// args(ctx) devuelve los argumentos; `controlFallo` marca una «prueba de las pruebas» que debe fallar.

const P = (n) => `pruebas/${n}.mjs`;
const CATALOGO = [
  { nombre: "tipos (tsc)", grupo: "estatica", cmd: ["npx", ["--no-install", "tsc", "--noEmit"]] },
  { nombre: "lint", grupo: "estatica", cmd: ["npm", ["run", "lint"]] },
  { nombre: "escaparate-registro", grupo: "api", archivo: P("escaparate-registro") },
  { nombre: "escaparate-caracteristicas", grupo: "api", archivo: P("escaparate-caracteristicas") },
  // Ninguna prueba de navegador descarga fotos reales de Supabase (cuota de salida del plan): se comprueba aquí.
  { nombre: "sin-fotos-reales", grupo: "api", archivo: P("sin-fotos-reales") },
  { nombre: "lecciones-sql", grupo: "sql", archivo: P("lecciones-sql"), args: (c) => [c.servidor] },
  {
    nombre: "lecciones-orden", grupo: "sql", archivo: P("lecciones-orden"), args: (c) => [c.servidor],
    requiere: ["pruebas/sql-aislado.mjs", ...["090000_aprendizajes_lecciones_nuevas", "095000_aprendizajes_autorizacion_expresa", "096000_aprendizajes_blue_publico_y_admin", "097000_aprendizajes_pruebas_y_permisos", "100000_aprendizajes_reorganizar_en_grupos"].map((m) => `supabase/migrations/20261018${m}.sql`)],
  },
  { nombre: "pedidos-sql", grupo: "sql", archivo: P("pedidos-sql"), args: (c) => [c.servidor] },
  { nombre: "limite-sql", grupo: "sql", archivo: P("limite-sql"), args: (c) => [c.servidor] },
  { nombre: "interaccion-sql", grupo: "sql", archivo: P("interaccion-sql"), args: (c) => [c.servidor] },
  { nombre: "reservas-sql", grupo: "sql", archivo: P("reservas-sql"), args: (c) => [c.servidor] },
  { nombre: "analitica-sql", grupo: "sql", archivo: P("analitica-sql"), args: (c) => [c.servidor] },
  { nombre: "permisos-chat-sql", grupo: "sql", archivo: P("permisos-chat-sql"), args: (c) => [c.servidor] },
  {
    // Todas las migraciones preparadas, juntas, dos veces y deshechas en orden inverso: necesita las de todas las PR.
    nombre: "migraciones-cadena", grupo: "sql", archivo: P("migraciones-cadena"), args: (c) => [c.servidor],
    requiere: [
      "pruebas/sql-aislado.mjs", "supabase/migrations/20261013090000_reservas_cesta.sql", "supabase/migrations/20261013120000_pedidos.sql",
      ...["090000_aprendizajes_lecciones_nuevas", "095000_aprendizajes_autorizacion_expresa", "096000_aprendizajes_blue_publico_y_admin", "097000_aprendizajes_pruebas_y_permisos",
        "100000_aprendizajes_reorganizar_en_grupos", "110000_pedidos_idempotencia", "120000_limite_peticiones", "130000_visitas_y_apoyos_protegidos", "140000_reservas_protegidas",
        "150000_analitica_topes", "160000_funciones_chat_sin_public"].map((m) => `supabase/migrations/20261018${m}.sql`),
    ],
  },
  { nombre: "api-limite", grupo: "sql", archivo: P("api-limite"), args: (c) => [c.servidor] },
  { nombre: "blue-ia-abuso", grupo: "sql", archivo: P("blue-ia-abuso"), args: (c) => [c.servidor] },
  { nombre: "interaccion-api", grupo: "sql", archivo: P("interaccion-api"), args: (c) => [c.servidor] },
  { nombre: "blue-regresion", grupo: "navegador", archivo: P("blue-regresion"), args: (c) => [c.dist, join(c.salida, "capturas-blue")] },
  { nombre: "pedido-idempotente", grupo: "navegador", archivo: P("pedido-idempotente"), args: (c) => [c.dist] },
  { nombre: "interaccion-cliente", grupo: "navegador", archivo: P("interaccion-cliente"), args: (c) => [c.dist] },
  { nombre: "desliza-para-actualizar", grupo: "navegador", archivo: P("desliza-para-actualizar"), args: (c) => [c.dist] },
  { nombre: "movil", grupo: "navegador", archivo: P("movil"), args: (c) => [c.urlMovil, join(c.salida, "capturas-movil")], necesitaUrl: true },
  {
    nombre: "control: pedidos-sql sin bloqueos",
    grupo: "sql", control: true, archivo: P("pedidos-sql"), args: (c) => [c.servidor, "--mutacion-sin-bloqueos"], esperaTexto: "MUTACIÓN DETECTADA",
  },
  {
    nombre: "control: reservas-sql sin bloqueo por persona",
    grupo: "sql", control: true, archivo: P("reservas-sql"), args: (c) => [c.servidor, "--mutacion-sin-bloqueo"], esperaTexto: "MUTACIÓN DETECTADA",
    requiereTexto: [[P("reservas-sql"), "--mutacion-sin-bloqueo"]],
  },
  ...["divisor", "espera", "pausa"].map((m) => ({
    nombre: `control: blue-ia-abuso sin la defensa «${m}»`,
    grupo: "sql", control: true, archivo: P("blue-ia-abuso"), args: (c) => [c.servidor, `--mutacion=${m}`], esperaTexto: "MUTACIÓN DETECTADA",
    requiereTexto: [[P("blue-ia-abuso"), "--mutacion="]],
  })),
];

// --- utilidades --------------------------------------------------------------------------------------

const ayuda = (t) => process.stdout.write(`${t}\n`);
const segundos = (ms) => (ms / 1000).toFixed(1);

function comprobarServidorLocal(url) {
  let u;
  try { u = new URL(url); } catch { throw new Error(`«${url}» no es una dirección de PostgreSQL válida`); }
  if (!["127.0.0.1", "localhost"].includes(u.hostname) || /supabase/i.test(url)) {
    throw new Error(`RECHAZADO: «${u.hostname}» no es un servidor local de pruebas. Esta batería nunca toca producción.`);
  }
}

function puertoLibre() {
  return new Promise((ok, mal) => {
    const s = createServer();
    s.once("error", mal);
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); });
  });
}

// --- PostgreSQL propio, de usar y tirar --------------------------------------------------------------

function buscarBinariosPostgres() {
  const candidatos = [];
  if (process.env.VZ_PG_BIN) candidatos.push(process.env.VZ_PG_BIN);
  const emb = join(RAIZ, "node_modules/@embedded-postgres");
  if (existsSync(emb)) for (const d of readdirSync(emb)) candidatos.push(join(emb, d, "native", "bin"));
  const sis = "/usr/lib/postgresql";
  if (existsSync(sis)) for (const v of readdirSync(sis).sort().reverse()) candidatos.push(join(sis, v, "bin"));
  return candidatos.find((b) => ["initdb", "pg_ctl", "postgres"].every((x) => existsSync(join(b, x))));
}

async function arrancarPostgresPropio() {
  const bin = buscarBinariosPostgres();
  if (!bin) throw new Error("no encuentro initdb/pg_ctl/postgres: instala `npm install --no-save embedded-postgres@17.9.0-beta.16` o define VZ_PG_BIN");
  if (spawnSync("psql", ["--version"]).status !== 0) throw new Error("falta el cliente psql en el PATH");
  const carpeta = mkdtempSync(join(tmpdir(), "vz-pg-"));
  const env = { ...process.env };
  // Librerías del paquete embebido: si faltan los enlaces de versión (.so.60 → .so.60.2), se crean aquí.
  const lib = join(bin, "..", "lib");
  if (existsSync(lib) && /embedded-postgres/.test(bin)) {
    const enlaces = join(carpeta, "lib");
    mkdirSync(enlaces);
    for (const f of readdirSync(lib)) {
      const m = /^(lib.+\.so\.\d+)(?:\.\d+)+$/.exec(f);
      if (m && !existsSync(join(lib, m[1]))) symlinkSync(join(lib, f), join(enlaces, m[1]));
    }
    env.LD_LIBRARY_PATH = [enlaces, lib, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");
  }
  const datos = join(carpeta, "datos");
  const ini = spawnSync(join(bin, "initdb"), ["-D", datos, "-U", "postgres", "--auth=trust", "-E", "UTF8"], { env, encoding: "utf8" });
  if (ini.status !== 0) throw new Error(`initdb falló: ${String(ini.stderr || ini.stdout).slice(0, 600)}`);
  const puerto = await puertoLibre();
  const opciones = `-p ${puerto} -c listen_addresses=127.0.0.1 -c unix_socket_directories= -c fsync=off -c max_connections=200`;
  const arr = spawnSync(join(bin, "pg_ctl"), ["start", "-D", datos, "-w", "-l", join(carpeta, "postgres.log"), "-o", opciones], { env, encoding: "utf8" });
  if (arr.status !== 0) throw new Error(`pg_ctl start falló: ${String(arr.stderr || arr.stdout).slice(0, 600)}`);
  const parar = () => {
    spawnSync(join(bin, "pg_ctl"), ["stop", "-D", datos, "-m", "fast"], { env, encoding: "utf8" });
    if (basename(carpeta).startsWith("vz-pg-")) rmSync(carpeta, { recursive: true, force: true });
  };
  return { url: `postgresql://postgres@127.0.0.1:${puerto}`, parar };
}

// --- servidor estático para movil.mjs (rutas dinámicas y 404.html como en Vercel) ----------------------

const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ico": "image/x-icon", ".svg": "image/svg+xml",
  ".ttf": "font/ttf", ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".webp": "image/webp",
};
const PNG_VACIO = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const DINAMICAS = [
  [/^\/producto\/[^/]+$/, "producto/[id].html"],
  [/^\/servicio\/[^/]+$/, "servicio/[id].html"],
  [/^\/politicas\/[^/]+$/, "politicas/[slug].html"],
  [/^\/chat\/[^/]+$/, "chat/[chatId].html"],
];
function servirDist(raiz) {
  const buscar = (ruta) => {
    const limpia = normalize(decodeURIComponent(ruta)).replace(/^(\.\.[/\\])+/, "");
    for (const c of [limpia, `${limpia}.html`, join(limpia, "index.html")]) {
      const p = join(raiz, c);
      if (existsSync(p) && statSync(p).isFile()) return p;
    }
    for (const [re, destino] of DINAMICAS) if (re.test(ruta) && existsSync(join(raiz, destino))) return join(raiz, destino);
    return null;
  };
  const servidor = createServer((req, res) => {
    const ruta = (req.url ?? "/").split("?")[0];
    // dist es solo estático: las funciones de api/ y el optimizador de imágenes de Vercel no existen aquí. Se
    // contestan vacías para que su ausencia no cuente como un fallo de la tienda (en producción sí existen).
    if (ruta.startsWith("/api/")) { res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); return; }
    if (ruta.startsWith("/_vercel/image")) { res.writeHead(200, { "content-type": "image/png" }); res.end(PNG_VACIO); return; }
    const p = ruta === "/" ? join(raiz, "index.html") : buscar(ruta);
    if (p) { res.writeHead(200, { "content-type": TIPOS[extname(p)] ?? "application/octet-stream" }); res.end(readFileSync(p)); return; }
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end(existsSync(join(raiz, "404.html")) ? readFileSync(join(raiz, "404.html")) : "No encontrado");
  });
  return new Promise((ok) => servidor.listen(0, "127.0.0.1", () => ok({ servidor, url: `http://127.0.0.1:${servidor.address().port}` })));
}

// --- lanzar una prueba ----------------------------------------------------------------------------------

function lanzar(p, ctx) {
  const [programa, args] = p.cmd ?? [process.execPath, [p.archivo, ...(p.args ? p.args(ctx) : [])]];
  const archivoSalida = join(OPC.salida, `${p.nombre.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`);
  const flujo = createWriteStream(archivoSalida);
  const t0 = Date.now();
  return new Promise((ok) => {
    let texto = "";
    const hijo = spawn(programa, args, { cwd: RAIZ, env: { ...process.env, ...ctx.entorno }, timeout: OPC.minutos * 60_000 });
    const recoger = (d) => { texto += d; flujo.write(d); };
    hijo.stdout.on("data", recoger);
    hijo.stderr.on("data", recoger);
    hijo.on("error", (e) => { flujo.end(); ok({ codigo: 127, texto: `no se pudo lanzar: ${e.message}`, ms: Date.now() - t0, archivoSalida }); });
    hijo.on("close", (codigo, senal) => {
      flujo.end();
      ok({ codigo: codigo ?? 1, senal, texto, ms: Date.now() - t0, archivoSalida });
    });
  });
}

function veredicto(p, r) {
  const lineas = r.texto.split("\n").map((l) => l.trimEnd()).filter(Boolean);
  const comprobaciones = lineas.filter((l) => /^OK\b/.test(l)).length;
  const avisos = lineas.filter((l) => /^AVISO\b/.test(l)).length;
  const ultima = lineas.at(-1) ?? "";
  if (r.senal) return { ok: false, motivo: `cortada por el límite de tiempo (${OPC.minutos} min)`, comprobaciones, avisos };
  if (p.control) {
    const detectada = r.codigo === 0 && r.texto.includes(p.esperaTexto);
    return { ok: detectada, motivo: detectada ? "detecta la corrección quitada" : `NO detectó la corrección quitada (código ${r.codigo})`, comprobaciones, avisos };
  }
  if (r.codigo !== 0) return { ok: false, motivo: `código de salida ${r.codigo}`, comprobaciones, avisos };
  if (p.grupo !== "estatica") {
    if (!r.texto.includes("todo bien")) return { ok: false, motivo: "salió bien pero no dijo «todo bien»", comprobaciones, avisos };
    if (comprobaciones === 0) return { ok: false, motivo: "no comprobó nada (cero líneas OK): un «todo bien» sin medir no vale", comprobaciones, avisos };
  }
  return { ok: true, motivo: p.grupo === "estatica" ? (ultima.slice(0, 80) || "sin errores") : `${comprobaciones} comprobaciones${avisos ? `, ${avisos} avisos` : ""}`, comprobaciones, avisos };
}

// --- principal ---------------------------------------------------------------------------------------------

const seleccionadas = CATALOGO.filter((p) => {
  if (p.control && !OPC.controles) return false;
  if (p.grupo === "estatica" && OPC.sinEstaticas) return false;
  if (p.grupo === "sql" && OPC.sinSql) return false;
  if (p.grupo === "navegador" && OPC.sinNavegador) return false;
  if (OPC.solo && !OPC.solo.some((t) => p.nombre.includes(t))) return false;
  return true;
});

if (OPC.lista) {
  for (const p of CATALOGO) ayuda(`${p.cmd || existsSync(p.archivo) ? "existe " : "FALTA  "} ${p.grupo.padEnd(9)} ${p.nombre}${p.control ? "  (solo con --controles)" : ""}`);
  process.exit(0);
}

if (Number(process.versions.node.split(".")[0]) < 24) ayuda(`AVISO Node ${process.versions.node}: las pruebas de api/ necesitan Node 24 (ejecuta TypeScript sin compilar).`);
mkdirSync(OPC.salida, { recursive: true });

const resultados = [];
let pgPropio = null;
let servidorDist = null;
const limpiar = () => { try { pgPropio?.parar(); } catch { /* ya parado */ } pgPropio = null; try { servidorDist?.servidor.close(); } catch { /* ya cerrado */ } servidorDist = null; };
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { limpiar(); process.exit(130); });

try {
  const ctx = { salida: OPC.salida, dist: OPC.dist, servidor: OPC.servidor, urlMovil: OPC.url, entorno: {} };
  const necesitaSql = seleccionadas.some((p) => p.grupo === "sql" && p.args && (p.cmd || existsSync(p.archivo)));
  if (necesitaSql) {
    if (OPC.propio && !OPC.servidor) {
      ayuda("Arrancando un PostgreSQL de pruebas propio (carpeta temporal)…");
      try { pgPropio = await arrancarPostgresPropio(); ctx.servidor = pgPropio.url; ayuda(`PostgreSQL de pruebas en ${ctx.servidor}`); } catch (e) { ayuda(`AVISO no se pudo arrancar PostgreSQL propio: ${e.message}`); }
    }
    if (ctx.servidor) comprobarServidorLocal(ctx.servidor);
  }

  if (OPC.compilar && seleccionadas.some((p) => p.grupo === "navegador")) {
    ayuda("Compilando la tienda (npm run build)…");
    const r = await lanzar({ nombre: "compilar (npm run build)", grupo: "estatica", cmd: ["npm", ["run", "build"]] }, ctx);
    resultados.push({ nombre: "compilar (npm run build)", estado: r.codigo === 0 ? "OK" : "FALLO", detalle: `${segundos(r.ms)} s`, salida: r.archivoSalida, cola: r.codigo === 0 ? "" : r.texto });
  }

  const hayDist = existsSync(join(OPC.dist, "index.html"));
  // Se comprueba de verdad: abrir y cerrar el navegador (executablePath() no sirve, apunta a Chromium completo
  // aunque en modo sin pantalla se use el «headless shell»). Solo se hace si hay alguna prueba de navegador.
  let hayNavegador = false;
  let motivoNavegador = "falta playwright-core (npm ci) o Chromium (docs/pruebas.md)";
  if (seleccionadas.some((p) => p.grupo === "navegador" && (p.cmd || existsSync(p.archivo)))) {
    try {
      const { chromium } = createRequire(join(RAIZ, "package.json"))("playwright-core");
      const b = await chromium.launch();
      await b.close();
      hayNavegador = true;
    } catch (e) {
      motivoNavegador = `no se pudo abrir Chromium: ${String(e.message).split("\n")[0].slice(0, 160)}`;
    }
  }
  if (!ctx.urlMovil && hayDist && seleccionadas.some((p) => p.necesitaUrl && existsSync(p.archivo))) {
    servidorDist = await servirDist(OPC.dist);
    ctx.urlMovil = servidorDist.url;
  }

  for (const p of seleccionadas) {
    const omitir = (motivo) => { resultados.push({ nombre: p.nombre, estado: "OMITIDA", detalle: motivo }); ayuda(`OMITIDA ${p.nombre} — ${motivo}`); };
    if (!p.cmd && !existsSync(p.archivo)) { omitir("la prueba no está en esta rama"); continue; }
    const sinArchivos = (p.requiere ?? []).filter((f) => !existsSync(f));
    if (sinArchivos.length) { omitir(`faltan archivos que llegan con otras PR (${sinArchivos.length}): ${sinArchivos.map((f) => basename(f)).slice(0, 2).join(", ")}…`); continue; }
    // «requiereTexto»: la prueba existe pero esta rama aún no trae la opción que necesita este control.
    const sinOpcion = (p.requiereTexto ?? []).filter(([f, t]) => !existsSync(f) || !readFileSync(f, "utf8").includes(t));
    if (sinOpcion.length) { omitir(`la prueba de esta rama aún no tiene la opción «${sinOpcion[0][1]}» (llega con otra PR)`); continue; }
    if (p.grupo === "sql" && !ctx.servidor) { omitir("falta el PostgreSQL de pruebas (--servidor o --postgres-propio)"); continue; }
    if (p.grupo === "navegador") {
      if (!hayNavegador) { omitir(motivoNavegador); continue; }
      if (p.necesitaUrl ? !ctx.urlMovil : !hayDist) { omitir(`falta la tienda compilada en ${OPC.dist} (--compilar o npm run build)`); continue; }
    }
    ayuda(`… ${p.nombre}`);
    const r = await lanzar(p, ctx);
    const v = veredicto(p, r);
    resultados.push({ nombre: p.nombre, estado: v.ok ? "OK" : "FALLO", detalle: `${v.motivo} · ${segundos(r.ms)} s`, salida: r.archivoSalida, cola: v.ok ? "" : r.texto, comprobaciones: v.comprobaciones });
    ayuda(`${v.ok ? "OK    " : "FALLO "} ${p.nombre} — ${v.motivo} (${segundos(r.ms)} s)`);
  }
} catch (e) {
  resultados.push({ nombre: "batería", estado: "FALLO", detalle: String(e.message).slice(0, 500), cola: "" });
} finally {
  limpiar();
}

// --- resumen -----------------------------------------------------------------------------------------------

ayuda("\n========== RESUMEN ==========");
for (const r of resultados) {
  ayuda(`${r.estado.padEnd(7)} ${r.nombre} — ${r.detalle}`);
  if (r.estado === "FALLO" && r.cola) for (const l of r.cola.split("\n").filter(Boolean).slice(-6)) ayuda(`          ${l.slice(0, 200)}`);
}
const fallos = resultados.filter((r) => r.estado === "FALLO");
const omitidas = resultados.filter((r) => r.estado === "OMITIDA");
const buenas = resultados.filter((r) => r.estado === "OK");
const total = buenas.reduce((n, r) => n + (r.comprobaciones ?? 0), 0);
ayuda(`\n${buenas.length} pruebas bien (${total} comprobaciones), ${fallos.length} fallos, ${omitidas.length} omitidas. Salida completa en ${OPC.salida}`);
if (omitidas.length) ayuda(`ATENCIÓN: ${omitidas.length} pruebas NO se lanzaron; lo que cubrían no está comprobado${OPC.estricto ? " (--estricto: cuenta como fallo)" : ""}.`);
const malo = fallos.length > 0 || (OPC.estricto && omitidas.length > 0) || buenas.length === 0;
ayuda(!malo ? "todo bien" : fallos.length ? "HAY FALLOS" : buenas.length === 0 ? "NADA COMPROBADO" : "INCOMPLETA: hay pruebas sin lanzar (--estricto)");
process.exit(malo ? 1 : 0);
