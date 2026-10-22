/**
 * pruebas/blue-ia-abuso.mjs — pruebas de api/blue-ia.ts frente al abuso y al gasto de OpenAI.
 *
 * Qué hace: carga api/blue-ia.ts tal cual está (Node 24 ejecuta TypeScript sin compilar) y le manda
 * peticiones simuladas CON la cabecera Origin bien puesta (como haría un script que la falsea: el
 * origen ya no es una defensa). La función consumir_limite se ejecuta de verdad contra la base AISLADA;
 * Supabase Auth y OpenAI son simulados y se CUENTAN las llamadas a OpenAI. Comprueba:
 *  1) Un anónimo (por IP) pasa 8 por minuto; el resto recibe 429 y NO llega nada a OpenAI.
 *  2) Cupo por hora (40) aunque se espere a que pase el minuto.
 *  3) Con sesión, el cupo es por USUARIO (15 por minuto); un token falso no da más cupo.
 *  4) Cambiar x-forwarded-for / x-real-ip no esquiva el límite; sin Origin, 403.
 *  5) Tope GLOBAL: con muchas IP, el total que llega a OpenAI queda acotado (BLUE_IA_MAX_DIA).
 *  6) Interruptor BLUE_IA_PAUSADA: 503 y ni se consume cupo ni se llama a OpenAI.
 *  7) 40 peticiones SIMULTÁNEAS de la misma IP: pasan exactamente 8 y a OpenAI llegan 8.
 *  8) Modo degradado (el límite compartido cae, tarda más de 2 s o no hay clave de servidor): cupos a la
 *     cuarta parte, una sola consulta fallida en vez de una por petición, ninguna espera larga, y vuelta al
 *     límite compartido cuando pasa la pausa y la base de datos regresa.
 *  9) El historial que se manda a OpenAI queda por debajo de 5.000 caracteres.
 * 10) Cuerpo vacío o no válido: 400, sin gastar ningún cupo (ni el de la persona ni el global) y sin OpenAI.
 * NO toca producción, ni Supabase real, ni OpenAI.
 *
 * Uso: node pruebas/blue-ia-abuso.mjs postgresql://postgres@127.0.0.1:55432 [--mutacion=divisor|espera|pausa]
 * Sale con código 1 si algo falla. Con --mutacion se prueba una copia a la que se le quita una defensa del modo
 * degradado (cupo reducido, tiempo máximo de espera o pausa tras el fallo): sale con 0 solo si las pruebas
 * lo detectan («prueba de las pruebas»).
 */
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { conectar } from "./sql-aislado.mjs";

const servidor = process.argv[2];
if (!servidor) {
  console.error("Uso: node pruebas/blue-ia-abuso.mjs <servidor local de pruebas> [--mutacion=divisor|espera|pausa]");
  process.exit(2);
}
// «Prueba de las pruebas» del modo degradado: con --mutacion=<defensa> se prueba una copia de api/blue-ia.ts a la
// que se le quita esa defensa (cupos enteros, sin tiempo máximo de espera, sin pausa tras un fallo). Las pruebas
// DEBEN detectarlo (salir con fallos); si pasaran, no servirían. En ese modo sale con 0 solo si lo detectó.
const MUTACION = process.argv.find((a) => a.startsWith("--mutacion="))?.slice("--mutacion=".length) ?? null;
const MUTACIONES = {
  divisor: ["const DIVISOR_DEGRADADO = 4;", "const DIVISOR_DEGRADADO = 1;"],
  espera: ["const ESPERA_LIMITE_MS = 2000;", "const ESPERA_LIMITE_MS = 600000;"],
  pausa: ["const PAUSA_TRAS_FALLO_MS = 30_000;", "const PAUSA_TRAS_FALLO_MS = 0;"],
};
if (MUTACION && !MUTACIONES[MUTACION]) {
  console.error(`Mutación desconocida: ${MUTACION}`);
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

const FALSO = "https://falso.supabase.test";
process.env.EXPO_PUBLIC_SUPABASE_URL = FALSO;
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon-de-prueba";
process.env.SUPABASE_CLAVE_SERVIDOR = "clave-de-prueba";
process.env.OPENAI_API_KEY = "sk-de-prueba";
delete process.env.BLUE_IA_PAUSADA;
delete process.env.BLUE_IA_MAX_DIA;
delete process.env.BLUE_IA_MAX_HORA;

let bdCaida = false;
let bdLenta = 0; // milisegundos que tarda en contestar el límite compartido (0 = normal)
let llamadasLimite = 0; // cuántas veces se pregunta al límite compartido
let llamadasOpenAI = { moderacion: 0, chat: 0 };
let ultimoChat = null;
const USUARIOS = { "token-bueno-1": "11111111-1111-4111-8111-111111111111", "token-bueno-2": "22222222-2222-4222-8222-222222222222" };
const original = globalThis.fetch;
globalThis.fetch = async (entrada, opciones) => {
  const url = new URL(typeof entrada === "string" ? entrada : entrada.url);
  const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });
  if (url.origin === "https://api.openai.com") {
    if (url.pathname.endsWith("/moderations")) {
      llamadasOpenAI.moderacion++;
      return json({ results: [{ flagged: false }] });
    }
    llamadasOpenAI.chat++;
    ultimoChat = JSON.parse(opciones.body);
    return json({ choices: [{ message: { content: "Hola desde la prueba" } }] });
  }
  if (url.origin !== FALSO) throw new Error(`prueba: salida de red inesperada a ${url.origin}`);
  if (url.pathname === "/rest/v1/rpc/consumir_limite") {
    llamadasLimite++;
    if (bdLenta) await new Promise((f) => setTimeout(f, bdLenta));
    if (bdCaida) return json({ message: "caída simulada" }, 500);
    const a = JSON.parse(opciones.body);
    const sql = `select public.consumir_limite('${String(a.p_clave).replace(/'/g, "''")}', ${Number(a.p_max)}, ${Number(a.p_ventana_segundos)})`;
    const salida = await db.psql(base, ["-c", "set role service_role", "-A", "-t", "-c", sql]);
    return new Response(salida.trim(), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.pathname === "/auth/v1/user") {
    const token = String(new Headers(opciones?.headers).get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    return USUARIOS[token] ? json({ id: USUARIOS[token], aud: "authenticated", email: "u@example.com" }) : json({ message: "token no válido" }, 401);
  }
  return json([]); // catálogo, redes, noticias, conocimiento: vacíos
};
const consolaError = console.error;
const consolaAviso = console.warn;
console.error = () => {};
console.warn = () => {};

// Cada escenario del modo degradado usa su PROPIA copia del módulo (el estado de la pausa y de los contadores
// vive en el módulo): la etiqueta distinta en la dirección hace que Node la cargue de nuevo. Con --mutacion se
// carga una copia desde una carpeta temporal (con un enlace a node_modules para que encuentre sus paquetes).
let carpetaMutada = null;
async function cargarManejador(etiqueta) {
  if (!MUTACION) return (await import(`../api/blue-ia.ts?${etiqueta}`)).default;
  const [antes, despues] = MUTACIONES[MUTACION];
  const original = readFileSync("api/blue-ia.ts", "utf8");
  if (!original.includes(antes)) throw new Error(`la mutación «${MUTACION}» no encuentra «${antes}» en api/blue-ia.ts`);
  if (!carpetaMutada) {
    carpetaMutada = mkdtempSync(join(tmpdir(), "vz-blue-ia-mutada-"));
    symlinkSync(resolve("node_modules"), join(carpetaMutada, "node_modules"));
  }
  const archivo = join(carpetaMutada, `blue-ia-${etiqueta}.ts`);
  writeFileSync(archivo, original.replace(antes, despues));
  return (await import(`${pathToFileURL(archivo).href}?${etiqueta}`)).default;
}

const handler = await cargarManejador("normal");
const origenBueno = "https://videojuegoszaragoza.com";
let n = 0;
const ip = () => `203.0.113.${(n++ % 250) + 1}`;
const mensaje = (extra = {}) => ({ message: "¿Qué consolas tenéis?", history: [], ...extra });

async function preguntar({ cabeceras = {}, cuerpo = mensaje(), manejador = handler } = {}) {
  const req = { method: "POST", headers: { origin: origenBueno, ...cabeceras }, body: cuerpo, socket: { remoteAddress: "10.0.0.1" } };
  const res = { codigo: 200, cabeceras: {}, cuerpo: null };
  res.setHeader = (k, v) => void (res.cabeceras[k.toLowerCase()] = v);
  res.status = (c) => ((res.codigo = c), res);
  res.json = (b) => ((res.cuerpo = b), res);
  await manejador(req, res);
  return res;
}
const reiniciarMinuto = () => db.consulta(base, "update public.limites_peticiones set ventana_inicio = now() - interval '2 minutes' where clave like 'blue-ia:%:min'");
const reiniciarTodo = () => db.consulta(base, "update public.limites_peticiones set ventana_inicio = now() - interval '2 days'");
const contar = () => ({ ...llamadasOpenAI });
const reiniciarContadores = () => (llamadasOpenAI = { moderacion: 0, chat: 0 });

try {
  // 1) Anónimo por IP: 8 por minuto
  {
    reiniciarContadores();
    const ipFija = "198.51.100.7";
    const rs = [];
    for (let i = 0; i < 12; i++) rs.push(await preguntar({ cabeceras: { "x-vercel-forwarded-for": ipFija } }));
    ok(rs.slice(0, 8).every((r) => r.codigo === 200) && rs.slice(8).every((r) => r.codigo === 429), `anónimo: pasan 8 por minuto y las 4 siguientes reciben 429 (${rs.map((r) => r.codigo).join(",")})`);
    ok(Number(rs[11].cabeceras["retry-after"]) > 0, `el 429 lleva Retry-After (${rs[11].cabeceras["retry-after"]} s)`);
    ok(contar().chat === 8 && contar().moderacion === 8, `a OpenAI llegan solo las 8 permitidas (chat ${contar().chat}, moderación ${contar().moderacion}): lo bloqueado no cuesta nada`);
  }

  // 2) Cupo por hora aunque pase el minuto
  {
    await reiniciarTodo();
    reiniciarContadores();
    const ipFija = "198.51.100.8";
    let pasan = 0;
    let primeraBloqueada = null;
    for (let i = 0; i < 48; i++) {
      if (i % 8 === 0) await reiniciarMinuto(); // pasa un minuto cada 8 preguntas
      const r = await preguntar({ cabeceras: { "x-vercel-forwarded-for": ipFija } });
      if (r.codigo === 200) pasan++;
      else if (primeraBloqueada === null) primeraBloqueada = r.codigo;
    }
    ok(pasan === 40 && primeraBloqueada === 429, `anónimo: esperando a que pase cada minuto, el cupo por HORA corta en 40 (pasaron ${pasan} de 48)`);
  }

  // 3) Con sesión: cupo por usuario; un token falso no da más cupo
  {
    await reiniciarTodo();
    reiniciarContadores();
    const rs = [];
    for (let i = 0; i < 18; i++) rs.push(await preguntar({ cabeceras: { authorization: "Bearer token-bueno-1", "x-vercel-forwarded-for": ip() } }));
    ok(rs.slice(0, 15).every((r) => r.codigo === 200) && rs.slice(15).every((r) => r.codigo === 429), `con sesión: 15 por minuto por USUARIO aunque cambie de IP en cada petición (${rs.map((r) => r.codigo).join(",")})`);
    const otro = await preguntar({ cabeceras: { authorization: "Bearer token-bueno-2", "x-vercel-forwarded-for": ip() } });
    ok(otro.codigo === 200, "otro usuario tiene su propio cupo");
    const ipFalso = "198.51.100.9";
    const falsas = [];
    for (let i = 0; i < 12; i++) falsas.push(await preguntar({ cabeceras: { authorization: "Bearer token-inventado", "x-vercel-forwarded-for": ipFalso } }));
    ok(falsas.slice(0, 8).every((r) => r.codigo === 200) && falsas.slice(8).every((r) => r.codigo === 429), "un token inventado NO da más cupo: se trata como anónimo (8 por minuto)");
  }

  // 4) x-forwarded-for / x-real-ip no esquivan; sin Origin, 403
  {
    await reiniciarTodo();
    const ipReal = "198.51.100.10";
    const rs = [];
    for (let i = 0; i < 12; i++) rs.push(await preguntar({ cabeceras: { "x-vercel-forwarded-for": ipReal, "x-forwarded-for": `192.0.2.${i}`, "x-real-ip": `192.0.2.${100 + i}` } }));
    ok(rs.filter((r) => r.codigo === 429).length === 4, `cambiar x-forwarded-for y x-real-ip en cada petición no esquiva el límite (${rs.filter((r) => r.codigo === 429).length} bloqueadas de 12)`);
    const sinOrigen = await preguntar({ cabeceras: { origin: "" } });
    ok(sinOrigen.codigo === 403, "sin cabecera Origin: 403 (se mantiene como filtro barato, pero ya no es la defensa)");
  }

  // 5) Tope global
  {
    await reiniciarTodo();
    reiniciarContadores();
    process.env.BLUE_IA_MAX_DIA = "20";
    const rs = [];
    for (let i = 0; i < 40; i++) rs.push(await preguntar({ cabeceras: { "x-vercel-forwarded-for": `192.0.2.${i + 1}` } }));
    const pasan = rs.filter((r) => r.codigo === 200).length;
    const globales = rs.filter((r) => r.codigo === 429 && /mucha demanda/.test(r.cuerpo?.error ?? "")).length;
    ok(pasan === 20 && globales === 20, `tope global: con 40 IP distintas solo 20 llegan a la IA (BLUE_IA_MAX_DIA=20) y las otras 20 reciben el aviso de demanda (${pasan} / ${globales})`);
    ok(contar().chat === 20, `y a OpenAI llegan exactamente 20 llamadas de chat (${contar().chat}): el gasto máximo del día está acotado aunque haya miles de IP`);
    delete process.env.BLUE_IA_MAX_DIA;
  }

  // 6) Interruptor de emergencia
  {
    await reiniciarTodo();
    reiniciarContadores();
    const antes = Number(await db.consulta(base, "select coalesce(sum(n), 0) from public.limites_peticiones"));
    process.env.BLUE_IA_PAUSADA = "1";
    const r = await preguntar({ cabeceras: { "x-vercel-forwarded-for": "198.51.100.11" } });
    delete process.env.BLUE_IA_PAUSADA;
    const despues = Number(await db.consulta(base, "select coalesce(sum(n), 0) from public.limites_peticiones"));
    ok(r.codigo === 503 && /descansando/.test(r.cuerpo?.error ?? ""), "BLUE_IA_PAUSADA=1: 503 con mensaje amable");
    ok(contar().chat === 0 && contar().moderacion === 0 && antes === despues, "con el interruptor, no se llama a OpenAI ni se consume cupo");
  }

  // 7) Simultaneidad real: 40 a la vez de la misma IP
  {
    await reiniciarTodo();
    reiniciarContadores();
    const rs = await Promise.all(Array.from({ length: 40 }, () => preguntar({ cabeceras: { "x-vercel-forwarded-for": "198.51.100.12" } })));
    const pasan = rs.filter((r) => r.codigo === 200).length;
    ok(pasan === 8 && contar().chat === 8, `40 peticiones SIMULTÁNEAS de la misma IP: pasan exactamente 8 y a OpenAI llegan 8 (${pasan} / ${contar().chat})`);
  }

  // 8) Modo degradado: el límite compartido cae, tarda demasiado o no hay clave de servidor
  {
    // 8a) Caído: los cupos pasan a la cuarta parte y solo se pregunta una vez (no una por petición).
    await reiniciarTodo();
    reiniciarContadores();
    const caido = await cargarManejador("caido");
    bdCaida = true;
    llamadasLimite = 0;
    const rs = [];
    for (let i = 0; i < 12; i++) rs.push(await preguntar({ manejador: caido, cabeceras: { "x-vercel-forwarded-for": "198.51.100.13" } }));
    ok(rs.slice(0, 2).every((r) => r.codigo === 200) && rs.slice(2).every((r) => r.codigo === 429) && contar().chat === 2, `límite compartido caído: cupos a la cuarta parte (pasan 2, 10 bloqueadas, OpenAI ${contar().chat})`);
    ok(llamadasLimite === 1, `y tras el primer fallo no se vuelve a preguntar al límite compartido durante la pausa (consultas: ${llamadasLimite})`);

    // 8b) Lento: no se espera más de 2 s y las siguientes peticiones no esperan nada.
    reiniciarContadores();
    const lento = await cargarManejador("lento");
    bdCaida = true; // cuando por fin conteste, que sea con error: así no toca los contadores reales
    bdLenta = 4500;
    const t0 = Date.now();
    const primera = await preguntar({ manejador: lento, cabeceras: { "x-vercel-forwarded-for": "198.51.100.16" } });
    const tardo = Date.now() - t0;
    ok(primera.codigo === 200 && tardo < 3600, `límite compartido lento (4,5 s): no se espera más de 2 s, se contesta en ${tardo} ms con el modo degradado`);
    const t1 = Date.now();
    await preguntar({ manejador: lento, cabeceras: { "x-vercel-forwarded-for": "198.51.100.16" } });
    ok(Date.now() - t1 < 800, `y la siguiente petición no espera nada (${Date.now() - t1} ms)`);
    bdLenta = 0;

    // 8c) Con sesión y el límite compartido caído: 15 / 4 = 3 por minuto por usuario.
    reiniciarContadores();
    const conSesion = await cargarManejador("sesion");
    const rs3 = [];
    for (let i = 0; i < 6; i++) rs3.push(await preguntar({ manejador: conSesion, cabeceras: { authorization: "Bearer token-bueno-1", "x-vercel-forwarded-for": ip() } }));
    ok(rs3.slice(0, 3).every((r) => r.codigo === 200) && rs3.slice(3).every((r) => r.codigo === 429), `con sesión y el límite compartido caído: 3 por minuto por usuario (${rs3.map((r) => r.codigo).join(",")})`);

    // 8d) Pasada la pausa, si la base de datos vuelve, se usa otra vez el límite compartido.
    process.env.LIMITE_PAUSA_MS = "300";
    const recupera = await cargarManejador("recupera");
    await preguntar({ manejador: recupera, cabeceras: { "x-vercel-forwarded-for": "198.51.100.17" } });
    bdCaida = false;
    await new Promise((f) => setTimeout(f, 450));
    const antes = llamadasLimite;
    const trasPausa = await preguntar({ manejador: recupera, cabeceras: { "x-vercel-forwarded-for": "198.51.100.17" } });
    ok(trasPausa.codigo === 200 && llamadasLimite > antes, `pasada la pausa y con la base de datos de vuelta se usa otra vez el límite compartido (consultas ${antes} → ${llamadasLimite})`);
    delete process.env.LIMITE_PAUSA_MS;

    // 8e) Sin clave de servidor: también cupos a la cuarta parte, en memoria.
    reiniciarContadores();
    const sinClave = await cargarManejador("sinclave");
    const clave = process.env.SUPABASE_CLAVE_SERVIDOR;
    delete process.env.SUPABASE_CLAVE_SERVIDOR;
    const rs2 = [];
    for (let i = 0; i < 12; i++) rs2.push(await preguntar({ manejador: sinClave, cabeceras: { "x-vercel-forwarded-for": "198.51.100.14" } }));
    process.env.SUPABASE_CLAVE_SERVIDOR = clave;
    ok(rs2.slice(0, 2).every((r) => r.codigo === 200) && rs2.slice(2).every((r) => r.codigo === 429) && contar().chat === 2, `sin la clave de servidor configurada también frena, a la cuarta parte (pasan 2, OpenAI ${contar().chat})`);
  }

  // 9) Tope al historial que se manda a OpenAI
  {
    await reiniciarTodo();
    const turno = (i) => ({ role: i % 2 ? "assistant" : "user", text: "x".repeat(800) });
    const historial = Array.from({ length: 10 }, (_, i) => turno(i));
    await preguntar({ cabeceras: { "x-vercel-forwarded-for": "198.51.100.15" }, cuerpo: mensaje({ history: historial }) });
    const mensajes = ultimoChat.messages.filter((m) => m.role !== "system").slice(0, -1);
    const total = mensajes.reduce((a, m) => a + m.content.length, 0);
    ok(total <= 5000 && mensajes.length >= 5, `el historial que llega a OpenAI mide ${total} caracteres (máx. 5.000) y conserva los ${mensajes.length} turnos más recientes`);
  }

  // 10) Cuerpo vacío o no válido: se rechaza antes de tocar ningún cupo
  {
    await reiniciarTodo();
    reiniciarContadores();
    const sumaCupos = () => db.consulta(base, "select coalesce(sum(n), 0) || '/' || count(*) from public.limites_peticiones where ventana_inicio > now() - interval '1 day'");
    const antes = await sumaCupos();
    const ipFija = "198.51.100.20";
    const malos = [null, {}, { message: "" }, { message: "   " }, { message: 42 }, { message: "x".repeat(801) }];
    const rs = [];
    for (let i = 0; i < 30; i++) rs.push(await preguntar({ cabeceras: { "x-vercel-forwarded-for": ipFija }, cuerpo: malos[i % malos.length] }));
    const despues = await sumaCupos();
    ok(rs.every((r) => r.codigo === 400), `30 peticiones con el cuerpo vacío o no válido: todas 400 (${[...new Set(rs.map((r) => r.codigo))].join(",")})`);
    ok(antes === despues, `y no gastan ningún cupo, ni el de la persona ni el global (contadores ${antes} → ${despues})`);
    ok(contar().chat === 0 && contar().moderacion === 0, "ni llegan a OpenAI");
    const bueno = [];
    for (let i = 0; i < 8; i++) bueno.push(await preguntar({ cabeceras: { "x-vercel-forwarded-for": ipFija } }));
    ok(bueno.every((r) => r.codigo === 200), `después, esa misma IP conserva su cupo entero: sus 8 preguntas válidas del minuto pasan (${bueno.map((r) => r.codigo).join(",")})`);
  }
} catch (e) {
  fallos.push(`la prueba se cortó: ${String(e.stack ?? e).slice(0, 900)}`);
} finally {
  globalThis.fetch = original;
  console.error = consolaError;
  console.warn = consolaAviso;
  if (carpetaMutada) rmSync(carpetaMutada, { recursive: true, force: true });
}

if (MUTACION) {
  console.log(fallos.length
    ? `MUTACIÓN DETECTADA («${MUTACION}»): las pruebas fallaron ${fallos.length} veces sin esa defensa (lo esperado: son sensibles a ella)`
    : `MUTACIÓN NO DETECTADA («${MUTACION}»): las pruebas pasan sin esa defensa; NO la comprueban`);
  process.exit(fallos.length ? 0 : 1);
}
for (const f of fallos) console.log(`FALLO ${f}`);
console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
process.exit(fallos.length ? 1 : 0);
