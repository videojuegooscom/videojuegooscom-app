/**
 * pruebas/escaparate-registro.mjs — api/escaparate-veoaura.ts ya no deja escribir sin límite en escaparate_registro.
 *
 * Qué hace: carga el receptor REAL (Node 24 ejecuta TypeScript sin compilar) y le manda peticiones
 * simuladas; las llamadas a Supabase se interceptan y se CUENTAN las filas que se intentan insertar en
 * escaparate_registro. Comprueba:
 *  CONTROL) La versión de origin/main (antes de esta corrección), con 200 peticiones de un anónimo sin firma
 *     válida, apunta ~200 filas. Es el problema. (Solo tiene sentido antes de fusionar esta rama.)
 *  1) La versión corregida, con las mismas 200 peticiones (método incorrecto, cabeceras mal, firma falsa,
 *     cuerpo enorme), apunta 0 filas en la base de datos.
 *  2) Con firma VÁLIDA (es VeoAura) un rechazo sí se apunta (1 fila) y conserva la respuesta.
 *  3) Aun con firma válida, un fallo repetido no pasa de 30 filas de error por minuto y por instancia.
 *  4) Los mensajes correctos (resultado ok) no se limitan.
 * NO toca producción, ni Supabase real.
 *
 * Uso: node pruebas/escaparate-registro.mjs
 * Sale con código 1 si algo falla.
 */
import { createHmac, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";

const fallos = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "OK   " : "FALLO"} ${msg}`);
  if (!cond) fallos.push(msg);
};

const FALSO = "https://falso.supabase.test";
const SECRETO = "secreto-de-prueba-de-al-menos-32-caracteres-xxxxxxxx";
process.env.EXPO_PUBLIC_SUPABASE_URL = FALSO;
process.env.SUPABASE_CLAVE_SERVIDOR = "clave-de-prueba";
process.env.VEOAURA_ESCAPARATE_SECRETO = SECRETO;

let filasRegistro = [];
const original = globalThis.fetch;
globalThis.fetch = async (entrada, opciones) => {
  const url = new URL(typeof entrada === "string" ? entrada : entrada.url);
  if (url.origin !== FALSO) throw new Error(`prueba: salida de red inesperada a ${url.origin}`);
  const metodo = opciones?.method ?? "GET";
  if (url.pathname === "/rest/v1/escaparate_registro" && metodo === "POST") {
    filasRegistro.push(JSON.parse(opciones.body));
    return new Response(null, { status: 201 });
  }
  if (url.pathname === "/rest/v1/escaparate_nonces" && metodo === "POST") return new Response(null, { status: 201 });
  return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
};
const consolaLog = console.log;
const consolaError = console.error;
const silenciar = () => {
  console.log = () => {};
  console.error = () => {};
};
const hablar = () => {
  console.log = consolaLog;
  console.error = consolaError;
};

function peticion(metodo, cabeceras, cuerpo = "") {
  const req = Readable.from(cuerpo ? [Buffer.from(cuerpo)] : []);
  req.method = metodo;
  req.headers = { "x-forwarded-proto": "https", ...cabeceras };
  return req;
}
function respuesta() {
  const r = { codigo: 200, cuerpo: null };
  r.setHeader = () => {};
  r.status = (c) => ((r.codigo = c), r);
  r.json = (b) => ((r.cuerpo = b), r);
  return r;
}
async function lanzar(manejador, metodo, cabeceras, cuerpo) {
  const res = respuesta();
  await manejador(peticion(metodo, cabeceras, cuerpo), res);
  return res;
}
const firmar = (fecha, nonce, cuerpo) => "sha256=" + createHmac("sha256", SECRETO).update(`${fecha}.${nonce}.${cuerpo}`).digest("hex");
const cabecerasFirmadas = (cuerpo) => {
  const fecha = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString("hex");
  return { "x-veoaura-fecha": fecha, "x-veoaura-nonce": nonce, "x-veoaura-firma": firmar(fecha, nonce, cuerpo) };
};
// 200 peticiones de un anónimo: ninguna lleva firma válida.
async function inundacionAnonima(manejador) {
  filasRegistro = [];
  const falsa = { "x-veoaura-fecha": String(Math.floor(Date.now() / 1000)), "x-veoaura-nonce": "a".repeat(32), "x-veoaura-firma": "sha256=" + "b".repeat(64) };
  for (let i = 0; i < 50; i++) await lanzar(manejador, "GET", {});
  for (let i = 0; i < 50; i++) await lanzar(manejador, "POST", {}, "{}");
  for (let i = 0; i < 50; i++) await lanzar(manejador, "POST", falsa, "{}");
  for (let i = 0; i < 50; i++) await lanzar(manejador, "POST", { "content-length": "999999" }, "{}");
  return filasRegistro.length;
}

try {
  // CONTROL: la versión de origin/main
  let controlHecho = false;
  try {
    const viejo = execFileSync("git", ["show", "origin/main:api/escaparate-veoaura.ts"], { encoding: "utf8" });
    const nuevo = (await import("node:fs")).readFileSync("api/escaparate-veoaura.ts", "utf8");
    if (viejo !== nuevo) {
      const carpeta = mkdtempSync(join(tmpdir(), "vz-viejo-"));
      mkdirSync(join(carpeta, "api"));
      symlinkSync(resolve("node_modules"), join(carpeta, "node_modules"));
      writeFileSync(join(carpeta, "api", "escaparate-veoaura.ts"), viejo);
      const manejadorViejo = (await import(pathToFileURL(join(carpeta, "api", "escaparate-veoaura.ts")).href)).default;
      silenciar();
      const filas = await inundacionAnonima(manejadorViejo);
      hablar();
      ok(filas >= 150, `CONTROL (versión de origin/main): 200 peticiones sin firma válida apuntan ${filas} filas en escaparate_registro: el problema es real`);
      controlHecho = true;
    }
  } catch (e) {
    hablar();
    console.log(`AVISO no se pudo ejecutar el control contra origin/main: ${String(e.message).slice(0, 120)}`);
  }
  if (!controlHecho) console.log("AVISO control omitido (origin/main ya tiene esta corrección o no está disponible)");

  const manejador = (await import("../api/escaparate-veoaura.ts")).default;

  // 1) Anónimo: 0 filas
  silenciar();
  const anonimas = await inundacionAnonima(manejador);
  hablar();
  ok(anonimas === 0, `corregida: 200 peticiones de un anónimo (método incorrecto, sin cabeceras, firma falsa, cuerpo enorme) apuntan ${anonimas} filas`);
  silenciar();
  const rFalsa = await lanzar(manejador, "POST", { "x-veoaura-fecha": String(Math.floor(Date.now() / 1000)), "x-veoaura-nonce": "a".repeat(32), "x-veoaura-firma": "sha256=" + "b".repeat(64) }, "{}");
  hablar();
  ok(rFalsa.codigo === 401 && rFalsa.cuerpo?.error === "firma no válida", "la respuesta al anónimo no cambia (401 firma no válida)");

  // 2) Firma válida con JSON roto: se apunta 1 fila
  filasRegistro = [];
  silenciar();
  const cuerpoRoto = "esto no es json";
  const r1 = await lanzar(manejador, "POST", cabecerasFirmadas(cuerpoRoto), cuerpoRoto);
  hablar();
  ok(r1.codigo === 400 && filasRegistro.length === 1 && filasRegistro[0].resultado === "error" && filasRegistro[0].http === 400, `con firma válida un rechazo sí se apunta (código ${r1.codigo}, ${filasRegistro.length} fila)`);
  ok(!JSON.stringify(filasRegistro).includes(SECRETO) && !/sha256=/.test(JSON.stringify(filasRegistro)), "la fila no contiene el secreto ni la firma");

  // 3) Firma válida, fallo repetido: tope de 30 por minuto
  filasRegistro = [];
  silenciar();
  for (let i = 0; i < 100; i++) await lanzar(manejador, "POST", cabecerasFirmadas(cuerpoRoto), cuerpoRoto);
  hablar();
  ok(filasRegistro.length <= 30, `con firma válida, 100 fallos seguidos apuntan ${filasRegistro.length} filas (tope de 30 por minuto)`);

  // 4) Lo correcto no se limita
  filasRegistro = [];
  silenciar();
  const id = "11111111-1111-4111-8111-111111111111";
  let correctos = 0;
  for (let i = 0; i < 40; i++) {
    const cuerpo = JSON.stringify({ version: 1, evento: "retirar", id_veoaura: id });
    const r = await lanzar(manejador, "POST", cabecerasFirmadas(cuerpo), cuerpo);
    if (r.codigo === 200) correctos++;
  }
  hablar();
  ok(correctos === 40 && filasRegistro.filter((f) => f.resultado === "ok").length === 40, `los mensajes correctos no se limitan: ${correctos} respondidos 200 y ${filasRegistro.filter((f) => f.resultado === "ok").length} filas «ok»`);
} catch (e) {
  hablar();
  fallos.push(`la prueba se cortó: ${String(e.stack ?? e).slice(0, 900)}`);
} finally {
  globalThis.fetch = original;
  hablar();
}

for (const f of fallos) console.log(`FALLO ${f}`);
console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
process.exit(fallos.length ? 1 : 0);
