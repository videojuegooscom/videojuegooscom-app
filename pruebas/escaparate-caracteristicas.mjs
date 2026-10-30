/**
 * pruebas/escaparate-caracteristicas.mjs — el puente de VeoAura guarda la ficha técnica («caracteristicas») y el
 * «Mantenimiento básico realizado» («mantenimiento»).
 *
 * Qué hace: carga el receptor REAL api/escaparate-veoaura.ts (Node 24 ejecuta TypeScript sin compilar) y le
 * manda mensajes «publicar» firmados como VeoAura. Supabase se simula EN MEMORIA (una tabla products), así que
 * no toca producción ni Internet. Comprueba:
 *  A) Un «publicar» con caracteristicas: se guardan tal cual, en su orden, y responde {ok:true, id_tienda}.
 *  B) Un «publicar» sin el campo (mensaje antiguo): se acepta y la lista queda vacía.
 *  C) Elementos mal formados (tipos, vacíos, demasiado largos, null, texto suelto, listas, sin valor…): se
 *     descartan, el mensaje se acepta y de cada elemento solo se guardan etiqueta y valor. Más de 30: solo 30.
 *     Una «lista» que no es lista cuenta como vacía.
 *  D) Un segundo «publicar» del mismo id_veoaura SUSTITUYE la lista (quitando y renombrando un recuadro) y no
 *     duplica el producto.
 *  E) Los campos desconocidos (en el mensaje y en el producto) se ignoran.
 *  F) Si la columna aún no existe en la base de datos (migración sin aplicar), el producto se guarda igual.
 *  G) Lo demás se sigue validando igual (un precio no válido se rechaza con 400).
 *  Mantenimiento:
 *  M1) Con mantenimiento: se guarda título, nota y puntos tal cual, en su orden.
 *  M2) Sin el campo, o con null: no hay mantenimiento (null), y null QUITA uno anterior.
 *  M3) Puntos mal formados (tipos, vacíos, etiqueta > 60, valor > 20, null, texto suelto…) se descartan; un título
 *      > 60 o una nota > 300 se quedan en null; el mensaje se acepta. Más de 30 puntos: solo 30. Lo desconocido se
 *      ignora. Un bloque que no es objeto o se queda vacío es null.
 *  M4) Un segundo «publicar» SUSTITUYE el bloque entero (otra nota, un punto quitado y otro renombrado).
 *  M5) Si la columna aún no existe (migración sin aplicar), el producto se guarda igual (y la ficha también).
 *  CONTROL) Las versiones de origin/main sin estas funciones no guardan la ficha / el mantenimiento: las pruebas A
 *     y M1 fallarían con ellas. Cada control solo se ejecuta si origin/main aún no tiene esa función (si no,
 *     ya no demostraría nada).
 *
 * Uso: node pruebas/escaparate-caracteristicas.mjs
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
const SECRETO = "secreto-de-prueba-de-al-menos-32-caracteres-xxxxxxxx";
process.env.EXPO_PUBLIC_SUPABASE_URL = FALSO;
process.env.SUPABASE_CLAVE_SERVIDOR = "clave-de-prueba";
process.env.VEOAURA_ESCAPARATE_SECRETO = SECRETO;

// --- Supabase simulado: products en memoria ------------------------------------------------------------
const productos = new Map(); // id → fila
const columnasAusentes = new Set(); // simula migraciones aún sin aplicar («caracteristicas», «mantenimiento»)
let escriturasConFicha = 0;
const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });
const filtro = (url, campo) => (url.searchParams.get(campo) ?? "").replace(/^eq\./, "");

const original = globalThis.fetch;
globalThis.fetch = async (entrada, opciones = {}) => {
  const url = new URL(typeof entrada === "string" ? entrada : entrada.url);
  if (url.origin !== FALSO) throw new Error(`prueba: salida de red inesperada a ${url.origin}`);
  const metodo = opciones.method ?? "GET";
  const ruta = url.pathname;
  if (ruta === "/rest/v1/escaparate_nonces" || ruta === "/rest/v1/escaparate_registro") return new Response(null, { status: 201 });
  if (ruta === "/rest/v1/categories") return json([]);
  if (ruta !== "/rest/v1/products") return json([]);

  const cuerpo = opciones.body ? JSON.parse(opciones.body) : null;
  for (const columna of columnasAusentes) {
    if (cuerpo && columna in cuerpo) return json({ code: "PGRST204", message: `Could not find the '${columna}' column of 'products' in the schema cache` }, 400);
  }
  if (cuerpo && "caracteristicas" in cuerpo) escriturasConFicha++;
  if (metodo === "GET") {
    const idV = filtro(url, "id_veoaura");
    const filas = [...productos.values()].filter((f) => !idV || f.id_veoaura === idV);
    return json(filas.map((f) => ({ id: f.id, is_active: f.is_active ?? null })));
  }
  if (metodo === "POST") {
    if ([...productos.values()].some((f) => f.id_veoaura === cuerpo.id_veoaura)) return json({ code: "23505", message: "duplicate key" }, 409);
    const fila = { ...cuerpo, id: randomUUID() };
    productos.set(fila.id, fila);
    return json({ id: fila.id }, 201);
  }
  if (metodo === "PATCH") {
    const id = filtro(url, "id");
    const fila = productos.get(id);
    if (fila) productos.set(id, { ...fila, ...cuerpo });
    return new Response(null, { status: 204 });
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
  silenciar();
  try {
    await manejador(peticion({ "x-veoaura-fecha": fecha, "x-veoaura-nonce": nonce, "x-veoaura-firma": firmar(fecha, nonce, cuerpo) }, cuerpo), res);
  } finally {
    hablar();
  }
  return res;
}
const publicar = (idVeoaura, extra = {}, mensajeExtra = {}) => ({
  version: 1,
  evento: "publicar",
  id_veoaura: idVeoaura,
  producto: { titulo: "PlayStation 5 Slim", modelo: "PS5 Slim", estado: "Como nuevo", precio: 399.99, moneda: "EUR", fotos: [], ...extra },
  ...mensajeExtra,
});
const filaDe = (idVeoaura) => [...productos.values()].find((f) => f.id_veoaura === idVeoaura);
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const FICHA = [
  { etiqueta: "Modelo", valor: "PS5 Slim" },
  { etiqueta: "Capacidad", valor: "1 TB" },
  { etiqueta: "Caja", valor: "Con caja" },
];
const MANTENIMIENTO = {
  titulo: "Mantenimiento básico realizado",
  nota: "Limpieza de mugre, polvo y manchas superficiales. Puede quedar alguna marca que no se haya podido quitar, pero el artículo siempre está como en las imágenes.",
  puntos: [
    { etiqueta: "Ventilador", valor: "Sí" },
    { etiqueta: "Cables de HDMI", valor: "Completo" },
    { etiqueta: "Pasta térmica", valor: "Parcial" },
    { etiqueta: "Mandos", valor: "No" },
  ],
};

try {
  // CONTROLES: cada uno solo si origin/main aún NO tiene esa función (marca en el código); si ya la tiene, ese
  // control no demostraría nada y se omite con un aviso (lección «Los controles de las pruebas caducan…»).
  try {
    const viejo = execFileSync("git", ["show", "origin/main:api/escaparate-veoaura.ts"], { encoding: "utf8" });
    const controles = [
      ["caracteristicasValidas", "ficha", { caracteristicas: FICHA }, (f) => !igual(f?.caracteristicas, FICHA)],
      ["mantenimientoValido", "mantenimiento", { mantenimiento: MANTENIMIENTO }, (f) => !igual(f?.mantenimiento, MANTENIMIENTO)],
    ].filter(([marca]) => !viejo.includes(marca));
    if (controles.length && viejo !== readFileSync("api/escaparate-veoaura.ts", "utf8")) {
      const carpeta = mkdtempSync(join(tmpdir(), "vz-viejo-"));
      mkdirSync(join(carpeta, "api"));
      symlinkSync(resolve("node_modules"), join(carpeta, "node_modules"));
      writeFileSync(join(carpeta, "api", "escaparate-veoaura.ts"), viejo);
      const manejadorViejo = (await import(pathToFileURL(join(carpeta, "api", "escaparate-veoaura.ts")).href)).default;
      for (const [, nombre, extra, noLoGuarda] of controles) {
        const idControl = randomUUID();
        await enviar(manejadorViejo, publicar(idControl, extra));
        ok(noLoGuarda(filaDe(idControl)), `CONTROL: la versión de origin/main no guarda ${nombre === "ficha" ? "la ficha" : "el mantenimiento"} (la prueba lo detecta)`);
      }
      productos.clear();
    } else {
      console.log("AVISO controles omitidos (origin/main ya tiene estas funciones)");
    }
  } catch (e) {
    hablar();
    console.log(`AVISO no se pudo ejecutar el control contra origin/main: ${String(e.message).slice(0, 120)}`);
  }

  const manejador = (await import("../api/escaparate-veoaura.ts")).default;

  // A) Con características.
  const idA = randomUUID();
  const rA = await enviar(manejador, publicar(idA, { caracteristicas: FICHA }));
  const filaA = filaDe(idA);
  ok(rA.codigo === 200 && rA.cuerpo?.ok === true && rA.cuerpo?.id_tienda === filaA?.id, `A: responde {ok:true, id_tienda} (${rA.codigo} ${JSON.stringify(rA.cuerpo)})`);
  ok(igual(filaA?.caracteristicas, FICHA), "A: la ficha se guarda tal cual y en su orden");

  // B) Sin el campo.
  const idB = randomUUID();
  const rB = await enviar(manejador, publicar(idB));
  ok(rB.codigo === 200 && rB.cuerpo?.ok === true, "B: un «publicar» sin caracteristicas se acepta");
  ok(igual(filaDe(idB)?.caracteristicas, []), "B: sin el campo la lista queda vacía");

  // C) Mal formados.
  const idC = randomUUID();
  const largo40 = "E".repeat(39) + "🎮"; // 40 caracteres (el emoji cuenta como uno)
  const mezcla = [
    { etiqueta: "Modelo", valor: "PS5 Slim" },
    { etiqueta: 5, valor: "número" },
    { etiqueta: "", valor: "sin etiqueta" },
    { etiqueta: "   ", valor: "solo espacios" },
    { etiqueta: "A".repeat(41), valor: "etiqueta de 41" },
    { etiqueta: "Valor largo", valor: "v".repeat(81) },
    null,
    "texto suelto",
    ["Modelo", "PS5"],
    { etiqueta: "Sin valor" },
    { valor: "Sin etiqueta" },
    { etiqueta: "Extra", valor: "ok", imei: "000000000000000", html: "<b>x</b>" },
    { etiqueta: "Mod\u0007elo\n2", valor: "  con espacios  " },
    { etiqueta: largo40, valor: "V".repeat(80) },
    { etiqueta: "<script>alert(1)</script>", valor: "<b>negrita</b>" },
  ];
  const rC = await enviar(manejador, publicar(idC, { caracteristicas: mezcla }));
  const esperadaC = [
    { etiqueta: "Modelo", valor: "PS5 Slim" },
    { etiqueta: "Extra", valor: "ok" },
    { etiqueta: "Modelo 2", valor: "con espacios" },
    { etiqueta: largo40, valor: "V".repeat(80) },
    { etiqueta: "<script>alert(1)</script>", valor: "<b>negrita</b>" },
  ];
  ok(rC.codigo === 200 && rC.cuerpo?.ok === true, `C: con elementos mal formados el mensaje se acepta (${rC.codigo})`);
  ok(igual(filaDe(idC)?.caracteristicas, esperadaC), `C: solo quedan los válidos, con solo etiqueta y valor: ${JSON.stringify(filaDe(idC)?.caracteristicas)}`);
  ok(!JSON.stringify(filaDe(idC)).includes("imei"), "C: los campos de más de un elemento (p. ej. imei) no se guardan");
  const treintaYCinco = Array.from({ length: 35 }, (_, i) => ({ etiqueta: `Campo ${i + 1}`, valor: `Valor ${i + 1}` }));
  const idC2 = randomUUID();
  await enviar(manejador, publicar(idC2, { caracteristicas: treintaYCinco }));
  ok(igual(filaDe(idC2)?.caracteristicas, treintaYCinco.slice(0, 30)), "C: de 35 elementos se guardan los 30 primeros, en su orden");
  const idC3 = randomUUID();
  const rC3 = await enviar(manejador, publicar(idC3, { caracteristicas: { etiqueta: "Modelo", valor: "PS5" } }));
  ok(rC3.codigo === 200 && igual(filaDe(idC3)?.caracteristicas, []), "C: si «caracteristicas» no es una lista, el mensaje se acepta con la lista vacía");

  // D) Sustituye la lista entera, sin duplicar el producto.
  const rD = await enviar(manejador, publicar(idA, { caracteristicas: [{ etiqueta: "Modelo", valor: "PS5 Slim" }, { etiqueta: "Almacenamiento", valor: "1 TB" }] }));
  const filasA = [...productos.values()].filter((f) => f.id_veoaura === idA);
  ok(rD.codigo === 200 && rD.cuerpo?.id_tienda === filaA?.id, "D: el segundo «publicar» del mismo id_veoaura responde el mismo id_tienda");
  ok(filasA.length === 1, `D: no se duplica el producto (${filasA.length} fila)`);
  ok(
    igual(filasA[0]?.caracteristicas, [{ etiqueta: "Modelo", valor: "PS5 Slim" }, { etiqueta: "Almacenamiento", valor: "1 TB" }]),
    "D: la lista se sustituye entera («Capacidad» renombrado a «Almacenamiento» y «Caja» quitado)"
  );
  await enviar(manejador, publicar(idA));
  ok(igual(filaDe(idA)?.caracteristicas, []), "D: un «publicar» posterior sin el campo deja la lista vacía (no conserva la anterior)");

  // E) Campos desconocidos.
  const idE = randomUUID();
  const rE = await enviar(manejador, publicar(idE, { caracteristicas: FICHA, campo_nuevo: { lo: "que sea" }, otra_cosa: [1, 2] }, { extra: true, version_menor: 7 }));
  ok(rE.codigo === 200 && igual(filaDe(idE)?.caracteristicas, FICHA), "E: los campos desconocidos se ignoran y el mensaje se acepta");
  ok(!("campo_nuevo" in (filaDe(idE) ?? {})) && !("extra" in (filaDe(idE) ?? {})), "E: los campos desconocidos no se guardan");

  // F) Columna aún sin crear.
  columnasAusentes.add("caracteristicas");
  const idF = randomUUID();
  const rF = await enviar(manejador, publicar(idF, { caracteristicas: FICHA }));
  ok(rF.codigo === 200 && rF.cuerpo?.ok === true && !!filaDe(idF), "F: sin la columna en la base de datos el producto se crea igual (responde ok)");
  const rF2 = await enviar(manejador, publicar(idF, { caracteristicas: FICHA, precio: 349.99 }));
  ok(rF2.codigo === 200 && filaDe(idF)?.price_eur === 349.99, "F: y también se actualiza");
  columnasAusentes.clear();

  // M1) Con mantenimiento.
  const idM = randomUUID();
  const rM = await enviar(manejador, publicar(idM, { caracteristicas: FICHA, mantenimiento: MANTENIMIENTO }));
  ok(rM.codigo === 200 && rM.cuerpo?.ok === true, `M1: con mantenimiento el mensaje se acepta (${rM.codigo})`);
  ok(igual(filaDe(idM)?.mantenimiento, MANTENIMIENTO), "M1: título, nota y puntos se guardan tal cual y en su orden");
  ok(igual(filaDe(idM)?.caracteristicas, FICHA), "M1: la ficha técnica se guarda a la vez");

  // M2) Sin el campo y con null.
  const idM2 = randomUUID();
  await enviar(manejador, publicar(idM2));
  ok(filaDe(idM2)?.mantenimiento === null, "M2: sin el campo no hay mantenimiento (null)");
  const rNull = await enviar(manejador, publicar(idM, { caracteristicas: FICHA, mantenimiento: null }));
  ok(rNull.codigo === 200 && filaDe(idM)?.mantenimiento === null, "M2: un «publicar» con mantenimiento null QUITA el anterior");

  // M3) Mal formados.
  const idM3 = randomUUID();
  const rM3 = await enviar(manejador, publicar(idM3, {
    mantenimiento: {
      titulo: "T".repeat(61),
      nota: "n".repeat(301),
      puntos: [
        { etiqueta: "Ventilador", valor: "Sí" },
        { etiqueta: 3, valor: "Sí" },
        { etiqueta: "", valor: "No" },
        { etiqueta: "E".repeat(61), valor: "Sí" },
        { etiqueta: "Valor largo", valor: "v".repeat(21) },
        null,
        "texto suelto",
        ["Ventilador", "Sí"],
        { etiqueta: "Sin valor" },
        { etiqueta: "<b>Tapa</b>", valor: "Completo", serie: "XYZ123" },
        { etiqueta: "E".repeat(60), valor: "V".repeat(20) },
      ],
      campo_nuevo: "se ignora",
    },
  }));
  ok(rM3.codigo === 200 && rM3.cuerpo?.ok === true, `M3: con un mantenimiento mal formado el mensaje se acepta (${rM3.codigo})`);
  ok(
    igual(filaDe(idM3)?.mantenimiento, {
      titulo: null,
      nota: null,
      puntos: [
        { etiqueta: "Ventilador", valor: "Sí" },
        { etiqueta: "<b>Tapa</b>", valor: "Completo" },
        { etiqueta: "E".repeat(60), valor: "V".repeat(20) },
      ],
    }),
    `M3: título > 60 y nota > 300 quedan en null, los puntos mal formados se descartan y no se guardan campos de más: ${JSON.stringify(filaDe(idM3)?.mantenimiento)}`
  );
  const idM3b = randomUUID();
  await enviar(manejador, publicar(idM3b, { mantenimiento: { puntos: Array.from({ length: 35 }, (_, i) => ({ etiqueta: `Punto ${i + 1}`, valor: "Sí" })) } }));
  ok(filaDe(idM3b)?.mantenimiento?.puntos?.length === 30 && filaDe(idM3b)?.mantenimiento?.puntos?.[29]?.etiqueta === "Punto 30", "M3: de 35 puntos se guardan los 30 primeros");
  const idM3c = randomUUID();
  await enviar(manejador, publicar(idM3c, { mantenimiento: "Mantenimiento hecho" }));
  const idM3d = randomUUID();
  await enviar(manejador, publicar(idM3d, { mantenimiento: { titulo: "", puntos: [{ etiqueta: 1 }] } }));
  ok(filaDe(idM3c)?.mantenimiento === null && filaDe(idM3d)?.mantenimiento === null, "M3: un bloque que no es objeto, o que se queda vacío, es null");

  // M4) Sustituye el bloque entero.
  await enviar(manejador, publicar(idM, { mantenimiento: MANTENIMIENTO }));
  const nuevo = { titulo: "Mantenimiento básico realizado", nota: "Limpieza completa.", puntos: [{ etiqueta: "Ventilador", valor: "Sí" }, { etiqueta: "Cable HDMI", valor: "Parcial" }] };
  const rM4 = await enviar(manejador, publicar(idM, { mantenimiento: nuevo }));
  ok(rM4.codigo === 200 && igual(filaDe(idM)?.mantenimiento, nuevo), "M4: el bloque se sustituye entero (nota nueva, punto renombrado y otros quitados)");
  ok([...productos.values()].filter((f) => f.id_veoaura === idM).length === 1, "M4: sin duplicar el producto");

  // M5) Columna de mantenimiento aún sin crear (la de la ficha sí existe).
  columnasAusentes.add("mantenimiento");
  const idM5 = randomUUID();
  const rM5 = await enviar(manejador, publicar(idM5, { caracteristicas: FICHA, mantenimiento: MANTENIMIENTO }));
  ok(rM5.codigo === 200 && igual(filaDe(idM5)?.caracteristicas, FICHA) && !("mantenimiento" in (filaDe(idM5) ?? {})), "M5: sin la columna de mantenimiento el producto se guarda igual, con su ficha");
  columnasAusentes.add("caracteristicas");
  const idM6 = randomUUID();
  const rM6 = await enviar(manejador, publicar(idM6, { caracteristicas: FICHA, mantenimiento: MANTENIMIENTO }));
  ok(rM6.codigo === 200 && !!filaDe(idM6), "M5: y sin ninguna de las dos columnas, también");
  columnasAusentes.clear();

  // G) El resto de validaciones sigue igual.
  const rG = await enviar(manejador, publicar(randomUUID(), { caracteristicas: FICHA, precio: -5 }));
  ok(rG.codigo === 400 && rG.cuerpo?.error === "precio no válido", "G: un precio no válido se sigue rechazando con 400");
  ok(escriturasConFicha > 0, `la base de datos simulada recibió la ficha en ${escriturasConFicha} escrituras`);
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
