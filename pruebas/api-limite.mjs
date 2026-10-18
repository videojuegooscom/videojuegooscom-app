/**
 * pruebas/api-limite.mjs — pruebas de los manejadores REALES de api/ con el límite compartido REAL.
 *
 * Qué hace: carga api/escaparate-retorno.ts y api/noticias-gaming.ts tal cual están (Node 24 ejecuta
 * TypeScript sin compilar) y les manda peticiones simuladas. Las llamadas a Supabase se interceptan: la
 * función consumir_limite se ejecuta de verdad contra la base AISLADA (psql como service_role) y todo lo
 * demás responde vacío. Comprueba:
 *  1) Pasado el cupo por IP, 429 con Retry-After; otra IP sigue pasando; el bloqueado no gasta el cupo global.
 *  2) La IP sale de x-vercel-forwarded-for: cambiar x-forwarded-for en cada petición NO esquiva el límite.
 *  3) Cupo global: muchas IP distintas juntas también se frenan.
 *  4) El cron (Authorization: Bearer CRON_SECRET) no tiene cupo.
 *  5) Simultaneidad real: 40 peticiones a la vez de la misma IP dejan pasar exactamente el cupo.
 *  6) Si la base de datos del límite no responde, se usa el límite en memoria (no se deja pasar todo).
 *  7) En la tabla solo hay cubos (no la IP real) y como mucho 4.096 por tipo.
 * NO toca producción ni envía nada a Supabase real ni a OpenAI.
 *
 * Uso: node pruebas/api-limite.mjs postgresql://postgres@127.0.0.1:55432
 * Sale con código 1 si algo falla.
 */
import { conectar } from "./sql-aislado.mjs";

const servidor = process.argv[2];
if (!servidor) {
  console.error("Uso: node pruebas/api-limite.mjs <servidor local de pruebas>");
  process.exit(2);
}
const db = conectar(servidor);
const fallos = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "OK   " : "FALLO"} ${msg}`);
  if (!cond) fallos.push(msg);
};

const base = await db.crearBase();
await db.aplicar(base, ["supabase/migrations/20261018120000_limite_peticiones.sql"]);

// --- Supabase de mentira: solo consumir_limite es real ---------------------------------------------
const FALSO = "https://falso.supabase.test";
process.env.EXPO_PUBLIC_SUPABASE_URL = FALSO;
process.env.SUPABASE_CLAVE_SERVIDOR = "clave-de-prueba";
process.env.CRON_SECRET = "secreto-de-cron-de-prueba";
process.env.OPENAI_API_KEY = "sk-de-prueba";
let bdCaida = false;
let llamadasLimite = 0;
const original = globalThis.fetch;
globalThis.fetch = async (entrada, opciones) => {
  const url = new URL(typeof entrada === "string" ? entrada : entrada.url);
  if (url.origin !== FALSO) throw new Error(`prueba: salida de red inesperada a ${url.origin}`);
  if (url.pathname === "/rest/v1/rpc/consumir_limite") {
    llamadasLimite++;
    if (bdCaida) return new Response(JSON.stringify({ message: "caída simulada" }), { status: 500, headers: { "content-type": "application/json" } });
    const a = JSON.parse(opciones.body);
    const sql = `select public.consumir_limite('${String(a.p_clave).replace(/'/g, "''")}', ${Number(a.p_max)}, ${Number(a.p_ventana_segundos)})`;
    const salida = await db.psql(base, ["-c", "set role service_role", "-A", "-t", "-c", sql]);
    return new Response(salida.trim(), { status: 200, headers: { "content-type": "application/json" } });
  }
  // El control de Noticias «no existe»: tras pasar el límite, el manejador corta enseguida con 503 y no
  // sale a buscar noticias por internet (esta prueba solo mira el límite).
  if (url.pathname.includes("noticias_gaming_control")) return new Response(JSON.stringify({ message: "tabla no disponible en la prueba" }), { status: 500, headers: { "content-type": "application/json" } });
  return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
};
const consolaError = console.error;
console.error = () => {}; // los manejadores registran errores esperados en estas pruebas

const retorno = (await import("../api/escaparate-retorno.ts")).default;
const noticias = (await import("../api/noticias-gaming.ts")).default;

function peticion(metodo, cabeceras = {}) {
  return { method: metodo, headers: cabeceras, body: {}, socket: { remoteAddress: "10.0.0.1" } };
}
function respuesta() {
  const r = { codigo: 200, cabeceras: {}, cuerpo: null };
  r.setHeader = (k, v) => void (r.cabeceras[k.toLowerCase()] = v);
  r.status = (c) => ((r.codigo = c), r);
  r.json = (b) => ((r.cuerpo = b), r);
  return r;
}
async function lanzar(manejador, metodo, cabeceras) {
  const res = respuesta();
  await manejador(peticion(metodo, cabeceras), res);
  return res;
}
const ip = (n) => `203.0.113.${n}`;
const bloqueadas = (rs) => rs.filter((r) => r.codigo === 429).length;

try {
  // 1) Cupo por IP en el puente de vuelta (20 por IP cada 10 min)
  {
    const rs = [];
    for (let i = 0; i < 25; i++) rs.push(await lanzar(retorno, "POST", { "x-vercel-forwarded-for": ip(1) }));
    ok(rs.slice(0, 20).every((r) => r.codigo !== 429), "retorno: las 20 primeras peticiones de una IP pasan");
    ok(rs.slice(20).every((r) => r.codigo === 429), `retorno: desde la 21.ª la misma IP recibe 429 (${bloqueadas(rs)} bloqueadas de 25)`);
    ok(Number(rs[24].cabeceras["retry-after"]) > 0, `retorno: el 429 lleva Retry-After (${rs[24].cabeceras["retry-after"]} s)`);
    const otra = await lanzar(retorno, "POST", { "x-vercel-forwarded-for": ip(2) });
    ok(otra.codigo !== 429, "retorno: otra IP sigue pasando aunque la primera esté bloqueada");
    const global = Number(await db.consulta(base, "select n from public.limites_peticiones where clave = 'retorno:global'"));
    ok(global === 21, `retorno: las 5 peticiones bloqueadas NO gastaron el cupo global (cuenta ${global}: 20 de la primera IP + 1 de la segunda)`);
  }

  // 2) La IP no se puede falsear con x-forwarded-for
  {
    const rs = [];
    for (let i = 0; i < 25; i++) rs.push(await lanzar(retorno, "POST", { "x-vercel-forwarded-for": ip(3), "x-forwarded-for": `198.51.100.${i}`, "x-real-ip": `198.51.100.${100 + i}` }));
    ok(bloqueadas(rs) === 5, `retorno: cambiar x-forwarded-for y x-real-ip en cada petición NO esquiva el límite (${bloqueadas(rs)} bloqueadas de 25)`);
  }

  // 3) Cupo global (60 cada 10 min): muchas IP distintas
  {
    const rs = [];
    for (let i = 10; i < 80; i++) rs.push(await lanzar(retorno, "POST", { "x-vercel-forwarded-for": ip(i) }));
    const pasan = rs.filter((r) => r.codigo !== 429).length;
    ok(pasan + 21 + 20 <= 60 + 1 && bloqueadas(rs) > 0, `retorno: con 70 IP distintas se llega al cupo global y se corta (pasaron ${pasan}, bloqueadas ${bloqueadas(rs)})`);
    ok(/demasiadas peticiones/.test(JSON.stringify(rs[rs.length - 1].cuerpo)), "retorno: el mensaje de bloqueo no revela nada interno");
  }

  // 4) El cron no tiene cupo
  {
    const rs = [];
    for (let i = 0; i < 5; i++) rs.push(await lanzar(retorno, "GET", { authorization: `Bearer ${process.env.CRON_SECRET}`, "x-vercel-forwarded-for": ip(200) }));
    ok(rs.every((r) => r.codigo === 200), "retorno: el cron (Bearer CRON_SECRET) pasa aunque el cupo global esté agotado");
    const sinSecreto = await lanzar(retorno, "GET", { "x-vercel-forwarded-for": ip(201) });
    ok(sinSecreto.codigo === 401, "retorno: un GET sin el secreto del cron sigue dando 401");
  }

  // 5) Noticias: 12 por IP; el cron no cuenta
  {
    const rs = [];
    for (let i = 0; i < 15; i++) rs.push(await lanzar(noticias, "GET", { "x-vercel-forwarded-for": ip(50) }));
    ok(rs.slice(0, 12).every((r) => r.codigo !== 429) && rs.slice(12).every((r) => r.codigo === 429), `noticias: 12 por IP y desde la 13.ª, 429 (${bloqueadas(rs)} bloqueadas de 15)`);
    const cron = await lanzar(noticias, "GET", { authorization: `Bearer ${process.env.CRON_SECRET}`, "x-vercel-forwarded-for": ip(50) });
    ok(cron.codigo !== 429, "noticias: el cron pasa aunque su IP esté bloqueada");
  }

  // 6) Simultaneidad real: 40 peticiones a la vez de la misma IP
  {
    const rs = await Promise.all(Array.from({ length: 40 }, () => lanzar(noticias, "GET", { "x-vercel-forwarded-for": ip(60) })));
    const pasan = rs.filter((r) => r.codigo !== 429).length;
    ok(pasan === 12, `noticias: 40 peticiones SIMULTÁNEAS de la misma IP dejan pasar exactamente 12 (${pasan})`);
  }

  // 7) Si la base de datos del límite no responde, se usa el límite en memoria
  {
    bdCaida = true;
    const rs = [];
    for (let i = 0; i < 15; i++) rs.push(await lanzar(noticias, "GET", { "x-vercel-forwarded-for": ip(70) }));
    ok(rs.slice(0, 12).every((r) => r.codigo !== 429) && rs.slice(12).every((r) => r.codigo === 429), `noticias: con el límite compartido caído, el de memoria sigue frenando (${bloqueadas(rs)} bloqueadas de 15)`);
    bdCaida = false;
  }

  // 8) La tabla guarda cubos, no IP reales, y es pequeña
  {
    const claves = await db.consulta(base, "select string_agg(clave, ',') from public.limites_peticiones");
    ok(!/203\.0\.113|198\.51\.100|10\.0\.0\.1/.test(claves), "la tabla de contadores no contiene ninguna IP real (solo cubos)");
    ok(/^(retorno|noticias):ip:\d+$|^(retorno|noticias):global$/.test(claves.split(",")[0]), "las claves tienen la forma «servicio:ip:<cubo>» o «servicio:global»");
    const maximo = Number(await db.consulta(base, "select count(*) from public.limites_peticiones"));
    ok(maximo <= 8200, `la tabla tiene ${maximo} filas (como mucho 4.096 cubos por servicio más los globales)`);
  }
} catch (e) {
  fallos.push(`la prueba se cortó: ${String(e.stack ?? e).slice(0, 900)}`);
} finally {
  globalThis.fetch = original;
  console.error = consolaError;
}

for (const f of fallos) console.log(`FALLO ${f}`);
console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
process.exit(fallos.length ? 1 : 0);
