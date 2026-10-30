/**
 * pruebas/escaparate-fotos.mjs — el puente de VeoAura copia hasta 30 fotos y deja la galería IGUAL que en VeoAura.
 *
 * Qué hace: carga el receptor REAL api/escaparate-veoaura.ts (Node 24 ejecuta TypeScript sin compilar) y le manda
 * mensajes «publicar» firmados como VeoAura. Supabase (products, product_media, el almacenamiento) y las fotos de
 * VeoAura se simulan EN MEMORIA: no toca producción ni Internet. Fuera de Vercel no hay waitUntil, así que la copia
 * de las fotos termina antes de que vuelva cada envío y se puede comprobar el resultado. Comprueba:
 *  F1) 30 fotos: se aceptan, se copian las 30 en su orden, la primera es la portada (una sola) y la respuesta sale
 *      antes de descargar ninguna foto.
 *  F2) Más de 30: el mensaje se acepta y se usan las 30 primeras.
 *  F3) Quitar una: desaparece de la galería y del almacenamiento; las demás no se vuelven a subir (llegan con
 *      enlaces nuevos, pero son las mismas fotos).
 *  F4) Reordenar: mismo orden que en VeoAura, sin subir nada.
 *  F5) Cambiar la portada: la nueva primera es la portada (y solo ella).
 *  F6) Una foto nueva y otra repetida en la lista: se sube solo la nueva y la repetida queda una vez.
 *  F7) Una foto que no se puede descargar: el resto se aplica y el registro lo dice.
 *  F8) Copias del sistema anterior (un nombre por envío): se sustituyen y sus archivos se borran.
 *  F9) Un enlace no válido entre las 30 primeras se sigue rechazando (400); en la posición 31 se ignora.
 *  F10) Si mientras se copian llega un envío más nuevo del mismo artículo, este no aplica nada.
 *  F11) Un «publicar» sin fotos deja la galería como estaba.
 *  CONTROL) La versión de origin/main (tope de 10 fotos) rechaza las 30: la prueba F1 fallaría con ella. Solo se
 *      ejecuta si origin/main aún no tiene el tope de 30 (si no, ya no demostraría nada).
 *
 * Uso: node pruebas/escaparate-fotos.mjs
 * Sale con código 1 si algo falla.
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
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
const FOTOS = "https://fotos.veoaura.test";
const SECRETO = "secreto-de-prueba-de-al-menos-32-caracteres-xxxxxxxx";
process.env.EXPO_PUBLIC_SUPABASE_URL = FALSO;
process.env.SUPABASE_CLAVE_SERVIDOR = "clave-de-prueba";
process.env.VEOAURA_ESCAPARATE_SECRETO = SECRETO;

// --- Supabase y VeoAura simulados ---------------------------------------------------------------------------
const productos = new Map(); // id → fila
const medios = new Map(); // id → fila de product_media
const almacen = new Map(); // ruta → texto de la foto
const registro = []; // filas de escaparate_registro
const cuenta = { subidas: 0, descargas: 0, descargasAntesDeResponder: 0 };
let respuestaActual = null;
const alDescargar = new Map(); // token → función (para simular un envío más nuevo a mitad de copia)

const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });
const contenidoDe = (n) => `foto-veoaura-${n}`.padEnd(80, ".");

// Filtros de PostgREST: eq, like, in.(…).
function cumple(fila, url) {
  for (const [campo, valor] of url.searchParams.entries()) {
    if (["select", "on_conflict", "order", "limit", "offset"].includes(campo)) continue;
    const v = fila[campo];
    if (valor.startsWith("eq.")) {
      if (String(v ?? "") !== valor.slice(3)) return false;
    } else if (valor.startsWith("like.")) {
      const re = new RegExp(`^${valor.slice(5).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`);
      if (!re.test(String(v ?? ""))) return false;
    } else if (valor.startsWith("in.(")) {
      const lista = valor.slice(4, -1).split(",").map((x) => x.replace(/^"|"$/g, ""));
      if (!lista.includes(String(v))) return false;
    }
  }
  return true;
}

const original = globalThis.fetch;
globalThis.fetch = async (entrada, opciones = {}) => {
  const url = new URL(typeof entrada === "string" ? entrada : entrada.url);
  const metodo = opciones.method ?? "GET";

  // Fotos de VeoAura: enlaces temporales (con token); el contenido depende solo del número de foto.
  if (url.origin === FOTOS) {
    cuenta.descargas++;
    if (!respuestaActual?.cuerpo) cuenta.descargasAntesDeResponder++;
    alDescargar.get(url.searchParams.get("token"))?.();
    const n = url.pathname.replace(/^\/|\.jpg$/g, "");
    if (n === "rota") return new Response("no", { status: 404 });
    return new Response(contenidoDe(n), { status: 200, headers: { "content-type": "image/jpeg" } });
  }
  if (url.origin !== FALSO) throw new Error(`prueba: salida de red inesperada a ${url.origin}`);
  const ruta = url.pathname;
  const cuerpoTexto = typeof opciones.body === "string" ? opciones.body : null;

  // Almacenamiento.
  if (ruta.startsWith("/storage/v1/object/list/product-media")) {
    const { prefix } = JSON.parse(cuerpoTexto);
    const nombres = [...almacen.keys()].filter((r) => r.startsWith(`${prefix}/`) && !r.slice(prefix.length + 1).includes("/"));
    return json(nombres.map((r) => ({ name: r.slice(prefix.length + 1), id: r })));
  }
  if (ruta === "/storage/v1/object/product-media" && metodo === "DELETE") {
    const { prefixes } = JSON.parse(cuerpoTexto);
    for (const r of prefixes) almacen.delete(r);
    return json(prefixes.map((name) => ({ name })));
  }
  if (ruta.startsWith("/storage/v1/object/product-media/") && metodo === "POST") {
    const r = decodeURIComponent(ruta.slice("/storage/v1/object/product-media/".length));
    almacen.set(r, Buffer.from(opciones.body).toString());
    cuenta.subidas++;
    return json({ Key: `product-media/${r}` });
  }

  // Base de datos.
  if (ruta === "/rest/v1/escaparate_registro") {
    registro.push(JSON.parse(cuerpoTexto));
    return new Response(null, { status: 201 });
  }
  if (ruta === "/rest/v1/escaparate_nonces") return new Response(null, { status: 201 });
  if (ruta === "/rest/v1/categories") return json([]);
  const cuerpo = cuerpoTexto ? JSON.parse(cuerpoTexto) : null;
  const conRespuesta = url.searchParams.has("select");

  if (ruta === "/rest/v1/products") {
    if (metodo === "GET") return json([...productos.values()].filter((f) => cumple(f, url)));
    if (metodo === "POST") {
      if ([...productos.values()].some((f) => f.id_veoaura === cuerpo.id_veoaura)) return json({ code: "23505", message: "duplicate key" }, 409);
      const fila = { ...cuerpo, id: randomUUID() };
      productos.set(fila.id, fila);
      return json({ id: fila.id }, 201);
    }
    if (metodo === "PATCH") {
      const tocadas = [...productos.values()].filter((f) => cumple(f, url));
      for (const f of tocadas) productos.set(f.id, { ...f, ...cuerpo });
      return conRespuesta ? json(tocadas.map((f) => ({ id: f.id }))) : new Response(null, { status: 204 });
    }
  }
  if (ruta === "/rest/v1/product_media") {
    if (metodo === "GET") return json([...medios.values()].filter((f) => cumple(f, url)));
    if (metodo === "POST") {
      // Con on_conflict=storage_path: si ya existe esa ruta, se actualiza (upsert).
      for (const fila of Array.isArray(cuerpo) ? cuerpo : [cuerpo]) {
        const existente = [...medios.values()].find((m) => m.storage_path === fila.storage_path);
        if (existente && !url.searchParams.has("on_conflict")) return json({ code: "23505", message: "duplicate key" }, 409);
        if (existente) medios.set(existente.id, { ...existente, ...fila });
        else {
          const id = randomUUID();
          medios.set(id, { ...fila, id });
        }
      }
      return new Response(null, { status: 201 });
    }
    if (metodo === "DELETE") {
      for (const f of [...medios.values()].filter((m) => cumple(m, url))) medios.delete(f.id);
      return new Response(null, { status: 204 });
    }
  }
  return json([]);
};

const consolaLog = console.log;
const silenciar = () => {
  console.log = () => {};
};
const hablar = () => {
  console.log = consolaLog;
};

function peticion(cabeceras, cuerpo) {
  const req = Readable.from([Buffer.from(cuerpo)]);
  req.method = "POST";
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
const firmar = (fecha, nonce, cuerpo) => "sha256=" + createHmac("sha256", SECRETO).update(`${fecha}.${nonce}.${cuerpo}`).digest("hex");
async function enviar(manejador, mensaje) {
  const cuerpo = JSON.stringify(mensaje);
  const fecha = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString("hex");
  const res = respuesta();
  respuestaActual = res;
  silenciar();
  try {
    await manejador(peticion({ "x-veoaura-fecha": fecha, "x-veoaura-nonce": nonce, "x-veoaura-firma": firmar(fecha, nonce, cuerpo) }, cuerpo), res);
  } finally {
    hablar();
  }
  return res;
}
const enlaces = (numeros, token) => numeros.map((n) => `${FOTOS}/${n}.jpg?token=${token}`);
const publicar = (idVeoaura, fotos) => ({
  version: 1,
  evento: "publicar",
  id_veoaura: idVeoaura,
  producto: { titulo: "PlayStation 5 Slim", modelo: "PS5 Slim", estado: "Como nuevo", precio: 399.99, moneda: "EUR", fotos },
});
const filaDe = (idVeoaura) => [...productos.values()].find((f) => f.id_veoaura === idVeoaura);
const numeroDe = (texto) => (texto ? texto.replace(/^foto-veoaura-|\.+$/g, "") : "?");
// Lo que ve la tienda: products.images (en orden) y la galería (product_media por sort_order).
function galeria(idVeoaura) {
  const fila = filaDe(idVeoaura);
  const rutaDe = (u) => decodeURIComponent(u.split("/object/public/product-media/")[1] ?? "");
  const imagenes = (fila?.images ?? []).map((u) => numeroDe(almacen.get(rutaDe(u))));
  const filas = [...medios.values()].filter((m) => m.product_id === fila?.id).sort((a, b) => a.sort_order - b.sort_order);
  return {
    imagenes,
    galeria: filas.map((m) => numeroDe(almacen.get(m.storage_path))),
    portadas: filas.filter((m) => m.is_cover).map((m) => numeroDe(almacen.get(m.storage_path))),
    archivos: [...almacen.keys()].filter((r) => r.startsWith(`veoaura/${idVeoaura}/`)).length,
  };
}
const rango = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ultimoRegistroFotos = () => [...registro].reverse().find((r) => r.evento === "fotos");

try {
  // CONTROL: solo si origin/main aún tiene el tope de 10 fotos.
  try {
    const viejo = execFileSync("git", ["show", "origin/main:api/escaparate-veoaura.ts"], { encoding: "utf8" });
    if (!viejo.includes("MAX_FOTOS_VEOAURA") && viejo !== readFileSync("api/escaparate-veoaura.ts", "utf8")) {
      const carpeta = mkdtempSync(join(tmpdir(), "vz-viejo-"));
      mkdirSync(join(carpeta, "api"));
      symlinkSync(resolve("node_modules"), join(carpeta, "node_modules"));
      writeFileSync(join(carpeta, "api", "escaparate-veoaura.ts"), viejo);
      const manejadorViejo = (await import(pathToFileURL(join(carpeta, "api", "escaparate-veoaura.ts")).href)).default;
      const r = await enviar(manejadorViejo, publicar(randomUUID(), enlaces(rango(1, 30), "c")));
      ok(r.codigo === 400, `CONTROL: la versión de origin/main rechaza 30 fotos (${r.codigo} ${JSON.stringify(r.cuerpo)}): la prueba lo detecta`);
      productos.clear();
      medios.clear();
      almacen.clear();
    } else {
      console.log("AVISO control omitido (origin/main ya acepta 30 fotos)");
    }
  } catch (e) {
    hablar();
    console.log(`AVISO no se pudo ejecutar el control contra origin/main: ${String(e.message).slice(0, 120)}`);
  }

  const manejador = (await import("../api/escaparate-veoaura.ts")).default;

  // F1) 30 fotos.
  const id = randomUUID();
  cuenta.subidas = 0;
  cuenta.descargasAntesDeResponder = 0;
  const r1 = await enviar(manejador, publicar(id, enlaces(rango(1, 30), "t1")));
  let g = galeria(id);
  ok(r1.codigo === 200 && r1.cuerpo?.ok === true && r1.cuerpo?.id_tienda === filaDe(id)?.id, `F1: 30 fotos se aceptan con {ok:true, id_tienda} (${r1.codigo} ${JSON.stringify(r1.cuerpo)})`);
  ok(igual(g.imagenes, rango(1, 30)) && igual(g.galeria, rango(1, 30)), `F1: se copian las 30 en su orden (${g.galeria.join(",")})`);
  ok(igual(g.portadas, ["1"]), `F1: la primera es la portada, y solo ella (${g.portadas.join(",")})`);
  ok(cuenta.subidas === 30 && g.archivos === 30, `F1: 30 archivos subidos (${cuenta.subidas})`);
  ok(cuenta.descargasAntesDeResponder === 0, "F1: la respuesta sale antes de descargar ninguna foto");
  ok(/30 fotos, 30 subidas/.test(ultimoRegistroFotos()?.detalle ?? ""), `F1: el registro lo apunta (${ultimoRegistroFotos()?.detalle})`);

  // F2) Más de 30.
  const id2 = randomUUID();
  const r2 = await enviar(manejador, publicar(id2, enlaces(rango(1, 35), "t1")));
  ok(r2.codigo === 200 && igual(galeria(id2).galeria, rango(1, 30)), `F2: con 35 fotos el mensaje se acepta y se usan las 30 primeras (${r2.codigo}, ${galeria(id2).galeria.length})`);

  // F3) Quitar una (la 5), con enlaces nuevos.
  cuenta.subidas = 0;
  const sinLa5 = rango(1, 30).filter((n) => n !== "5");
  const r3 = await enviar(manejador, publicar(id, enlaces(sinLa5, "t2")));
  g = galeria(id);
  ok(r3.codigo === 200 && igual(g.galeria, sinLa5) && igual(g.imagenes, sinLa5), "F3: la foto quitada desaparece de la galería y el resto sigue en su orden");
  ok(g.archivos === 29, `F3: y su archivo se borra del almacenamiento (${g.archivos} archivos)`);
  ok(cuenta.subidas === 0, `F3: las demás no se vuelven a subir aunque lleguen con otro enlace (${cuenta.subidas} subidas)`);

  // F4) Reordenar.
  cuenta.subidas = 0;
  const alReves = [...sinLa5].reverse();
  await enviar(manejador, publicar(id, enlaces(alReves, "t3")));
  g = galeria(id);
  ok(igual(g.galeria, alReves) && igual(g.imagenes, alReves) && cuenta.subidas === 0, `F4: el orden nuevo se respeta sin subir nada (${g.galeria.slice(0, 4).join(",")}…; ${cuenta.subidas} subidas)`);
  ok(igual(g.portadas, ["30"]), `F4: la portada pasa a ser la nueva primera (${g.portadas.join(",")})`);

  // F5) Cambiar la portada: la 12 delante.
  const portada12 = ["12", ...alReves.filter((n) => n !== "12")];
  await enviar(manejador, publicar(id, enlaces(portada12, "t4")));
  g = galeria(id);
  ok(igual(g.portadas, ["12"]) && igual(g.galeria, portada12) && igual(g.imagenes[0], "12"), `F5: la 12 es ahora la portada, y solo ella (${g.portadas.join(",")})`);

  // F6) Una nueva (31) y una repetida (la 2 dos veces).
  cuenta.subidas = 0;
  const conNuevaYRepetida = [...portada12.slice(0, 28), "2", "31"];
  await enviar(manejador, publicar(id, enlaces(conNuevaYRepetida, "t5")));
  g = galeria(id);
  const esperadaF6 = [...new Set(conNuevaYRepetida)];
  ok(igual(g.galeria, esperadaF6) && cuenta.subidas === 1, `F6: se sube solo la nueva y la repetida queda una vez (${g.galeria.length} fotos, ${cuenta.subidas} subida)`);

  // F7) Una foto que no se puede descargar.
  const conRota = ["1", "rota", "3"];
  const id7 = randomUUID();
  const r7 = await enviar(manejador, publicar(id7, enlaces(conRota, "t1")));
  ok(r7.codigo === 200 && igual(galeria(id7).galeria, ["1", "3"]), `F7: el resto se aplica (${galeria(id7).galeria.join(",")})`);
  ok(/1 sin descargar/.test(ultimoRegistroFotos()?.detalle ?? ""), `F7: el registro dice cuántas faltan (${ultimoRegistroFotos()?.detalle})`);

  // F8) Copias del sistema anterior (un nombre por envío).
  const id8 = randomUUID();
  await enviar(manejador, publicar(id8, []));
  const producto8 = filaDe(id8);
  for (let i = 1; i <= 3; i++) {
    const ruta = `veoaura/${id8}/1790000000000-abcd1234-${i}.jpg`;
    almacen.set(ruta, contenidoDe(`viejo-${i}`));
    const mid = randomUUID();
    medios.set(mid, { id: mid, product_id: producto8.id, kind: "image", storage_path: ruta, public_url: "", sort_order: i - 1, is_cover: i === 1 });
  }
  await enviar(manejador, publicar(id8, enlaces(["1", "2"], "t1")));
  g = galeria(id8);
  ok(igual(g.galeria, ["1", "2"]) && g.archivos === 2, `F8: las copias antiguas se sustituyen y sus archivos se borran (${g.galeria.join(",")}; ${g.archivos} archivos)`);

  // F9) Enlaces no válidos.
  const r9 = await enviar(manejador, publicar(randomUUID(), ["http://inseguro.test/1.jpg", ...enlaces(["2"], "t1")]));
  ok(r9.codigo === 400 && r9.cuerpo?.error === "foto con enlace no válido", "F9: un enlace no válido entre las 30 primeras se sigue rechazando con 400");
  const id9 = randomUUID();
  const r9b = await enviar(manejador, publicar(id9, [...enlaces(rango(1, 30), "t1"), "http://inseguro.test/31.jpg"]));
  ok(r9b.codigo === 200 && galeria(id9).galeria.length === 30, "F9: uno no válido en la posición 31 se ignora (se usan las 30 primeras)");

  // F10) Llega un envío más nuevo a mitad de copia.
  const antes = galeria(id).galeria;
  alDescargar.set("carrera", () => {
    const f = filaDe(id);
    productos.set(f.id, { ...f, veoaura_envio: "envio-mas-nuevo" });
  });
  await enviar(manejador, publicar(id, enlaces(["7", "8"], "carrera")));
  ok(igual(galeria(id).galeria, antes) && /descartadas/.test(ultimoRegistroFotos()?.detalle ?? ""), `F10: el envío viejo no aplica nada (${ultimoRegistroFotos()?.detalle})`);
  alDescargar.clear();

  // F11) Sin fotos: la galería no se toca.
  const r11 = await enviar(manejador, publicar(id7, []));
  ok(r11.codigo === 200 && igual(galeria(id7).galeria, ["1", "3"]), "F11: un «publicar» sin fotos deja la galería como estaba");

  ok([...productos.values()].filter((f) => f.id_veoaura === id).length === 1, "sin duplicar el producto en ningún envío");
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
