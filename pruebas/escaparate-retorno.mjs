/**
 * pruebas/escaparate-retorno.mjs — el puente de vuelta a VeoAura (api/escaparate-retorno.ts) y los datos del cliente.
 *
 * Qué hace: carga el manejador REAL (Node 24 ejecuta TypeScript sin compilar) y lo lanza como el cron (sin cupos).
 * Supabase se simula EN MEMORIA (products, pedidos con sus artículos, escaparate_salida, escaparate_registro) y el
 * receptor de VeoAura también: comprueba la firma de cada mensaje y apunta lo que recibe. No toca producción ni
 * Internet. Comprueba (dueño, 2026-11-03: «solo de los pedidos pagados»; pagado = «entregado»):
 *  A) Un pedido con un artículo de VeoAura: sale «pedido» firmado y SIN datos del cliente (ni nombre, ni correo, ni
 *     teléfono, ni dirección).
 *  B) En otros estados («enviado», «confirmado»…) tampoco salen.
 *  C) Al marcarlo «entregado»: sale el aviso de pagado, que según el contrato de VeoAura («Cliente del pedido») es un
 *     segundo «pedido» con el mismo número, id_mensaje nuevo y "cliente": {nombre, correo, telefono} DENTRO de
 *     "pedido" (limpios: espacios y mayúsculas del correo); nunca la dirección, el código postal, la ciudad ni las notas.
 *  D) Una sola vez: otra vuelta no lo repite.
 *  E) Un pedido entregado del que VeoAura aún no sabía nada: primero el «pedido» sin cliente y después el de pagado.
 *  F) Sin artículos de VeoAura, o cancelado: nada con datos del cliente.
 *  G) Si la migración de «pedido_pagado» aún no está aplicada (la base de datos lo rechaza), los avisos de siempre
 *     («pedido») de otros pedidos se siguen apuntando y enviando.
 *  H) Topes del contrato: nombre 120 y teléfono 40 (se recortan); un correo de más de 160 no se recorta, se queda
 *     fuera (uno de 160 va entero).
 *  I) Entregado y cancelado después con la ficha aún por enviar: no salen los datos del cliente, la ficha queda
 *     «descartado» y VeoAura solo recibe la anulación.
 *  J) Pagado con tarjeta (dueño, 2026-11-06): cuenta como pagado (sale la ficha sin esperar a «Entregado») solo cuando
 *     la privacidad ya lo dice; con el pago devuelto o el pedido cancelado, no. Su control: sin mirar la privacidad.
 *  K) Ventas en mano que llegan DE VeoAura (pedidos.origen = 'tienda_fisica', 2026-11-11): nunca se le devuelven (ni
 *     «pedido» ni el de pagado), un aviso apuntado de una de ellas se descarta y los pedidos web siguen igual. Su
 *     control: una copia que no las distingue se las devolvería con los datos del cliente.
 *  L–R) Productos creados a mano (sin id_veoaura; evento «producto_tienda», dueño, 2026-11-13): L se apunta en
 *     escaparate_salida_productos y se envía firmado con SOLO datos del producto (sin clientes ni pedidos); M el id_veoaura
 *     de la respuesta se guarda en el producto; N respuesta de error (o «ok» sin id): queda pendiente y se reintenta (1 min,
 *     y cada 6 h tras 12 intentos); O con id_veoaura no se envía; P un cambio de título, precio o fotos avisa otra vez y se
 *     espera a que el producto se estabilice; Q no pisa un id existente ni repite el de otro producto; R sin la migración
 *     no se rompe nada. Controles: copias con un fallo a propósito, que estas comprobaciones detectan.
 *  CONTROLES) Una copia del puente que considera «pagado» un pedido pendiente manda los datos del cliente antes de
 *     tiempo: la comprobación A lo detecta. Otra que manda el de pagado con otro nombre de evento: C lo detecta. Otra
 *     que no vuelve a mirar el estado al enviar los manda de un pedido cancelado: la comprobación I lo detecta.
 *
 * Uso: node pruebas/escaparate-retorno.mjs
 * Sale con código 1 si algo falla.
 * Conectado con: api/escaparate-retorno.ts; simula en memoria products, pedidos, escaparate_salida y escaparate_registro
 *   y el receptor de VeoAura. La lanza pruebas/todas.mjs (grupo api).
 */
import { createHmac, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const fallos = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "OK   " : "FALLO"} ${msg}`);
  if (!cond) fallos.push(msg);
};

const FALSO = "https://falso.supabase.test";
const VEOAURA = "https://veoaura.test/api/despachador?accion=escaparate-retorno";
const SECRETO = "secreto-de-vuelta-de-prueba-con-mas-de-32-caracteres";
process.env.EXPO_PUBLIC_SUPABASE_URL = FALSO;
process.env.SUPABASE_CLAVE_SERVIDOR = "clave-de-prueba";
process.env.CRON_SECRET = "cron-de-prueba";
process.env.VEOAURA_RETORNO_URL = VEOAURA;
process.env.VEOAURA_RETORNO_SECRETO = SECRETO;

// --- Supabase simulado en memoria -------------------------------------------------------------------------------
const tablas = { products: [], pedidos: [], escaparate_salida: [], escaparate_registro: [], policy_pages: [], escaparate_salida_productos: [], product_media: [], categories: [] };
let sinMigracionProductos = false; // la tabla escaparate_salida_productos aún no existe
// Lo que responde VeoAura a cada mensaje (por defecto, {ok:true}; a «producto_tienda», además, un id_veoaura nuevo).
const respuestaNormal = (mensaje) => (mensaje.evento === "producto_tienda" ? { estado: 200, cuerpo: { ok: true, id_veoaura: randomUUID() } } : { estado: 200, cuerpo: { ok: true } });
let responderVeoaura = respuestaNormal;
process.env.VEOAURA_PRODUCTOS_ESPERA_MS = "0"; // sin espera para que el producto «se estabilice» (se prueba aparte)
// La privacidad: sin la frase de la tarjeta (antes de la migración 20261106110000) o con ella.
const PRIV_ANTES = "le comunicamos ese pedido y, cuando te lo entregamos, también tu nombre, tu correo electrónico y tu teléfono";
const PRIV_TARJETA = "le comunicamos ese pedido y, cuando lo pagas con tarjeta o te lo entregamos, también tu nombre, tu correo electrónico y tu teléfono";
const privacidad = (texto) => ({ slug: "privacidad", sections: [{ heading: "Con quién compartimos tus datos", body: texto }] });
let sinMigracionPagado = false; // la base de datos aún no admite «pedido_pagado»
const recibidos = []; // lo que llega a VeoAura: { cuerpo, firmaOk, mensaje }

const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });
// Filtros de PostgREST que usa el puente: eq., in.(…), lt., gte., not.is.null.
function cumple(fila, campo, filtro) {
  const v = fila[campo];
  if (filtro.startsWith("eq.")) return String(v) === filtro.slice(3);
  if (filtro.startsWith("in.(")) return filtro.slice(4, -1).split(",").map((x) => x.replace(/^"|"$/g, "")).includes(String(v));
  if (filtro.startsWith("neq.")) return String(v) !== filtro.slice(4);
  if (filtro.startsWith("lt.")) return Number(v) < Number(filtro.slice(3));
  if (filtro.startsWith("gte.")) return String(v) >= filtro.slice(4);
  if (filtro === "not.is.null") return v !== null && v !== undefined;
  if (filtro === "is.null") return v === null || v === undefined;
  throw new Error(`prueba: filtro no simulado ${campo}=${filtro}`);
}
const RESERVADOS = new Set(["select", "order", "limit", "on_conflict", "columns"]);
function filtrar(filas, url) {
  let r = filas;
  for (const [campo, filtro] of url.searchParams) if (!RESERVADOS.has(campo)) r = r.filter((f) => cumple(f, campo, filtro));
  const orden = url.searchParams.get("order");
  if (orden) {
    const [campo, sentido] = orden.split(".");
    r = [...r].sort((a, b) => (String(a[campo]) < String(b[campo]) ? -1 : String(a[campo]) > String(b[campo]) ? 1 : 0) * (sentido === "desc" ? -1 : 1));
  }
  const limite = Number(url.searchParams.get("limit"));
  return Number.isFinite(limite) && limite > 0 ? r.slice(0, limite) : r;
}
let reloj = Date.parse("2026-11-03T10:00:00Z");
const ahoraIso = () => new Date((reloj += 1000)).toISOString();

const original = globalThis.fetch;
globalThis.fetch = async (entrada, opciones = {}) => {
  const url = new URL(typeof entrada === "string" ? entrada : entrada.url);
  const metodo = opciones.method ?? "GET";
  const cabeceras = new Headers(opciones.headers);
  if (url.href === VEOAURA) {
    const cuerpo = String(opciones.body);
    const firma = `sha256=${createHmac("sha256", SECRETO).update(`${cabeceras.get("x-tienda-fecha")}.${cabeceras.get("x-tienda-nonce")}.${cuerpo}`).digest("hex")}`;
    recibidos.push({ cuerpo, firmaOk: firma === cabeceras.get("x-tienda-firma"), mensaje: JSON.parse(cuerpo) });
    const r = responderVeoaura(JSON.parse(cuerpo));
    return json(r.cuerpo, r.estado);
  }
  if (url.origin !== FALSO) throw new Error(`prueba: salida de red inesperada a ${url.origin}`);
  const tabla = url.pathname.replace("/rest/v1/", "");
  const filas = tablas[tabla];
  if (!filas) throw new Error(`prueba: tabla no simulada ${tabla}`);
  if (tabla === "escaparate_salida_productos" && sinMigracionProductos) {
    return json({ code: "42P01", message: 'relation "public.escaparate_salida_productos" does not exist' }, 404);
  }
  const objeto = (cabeceras.get("accept") ?? "").includes("vnd.pgrst.object");
  if (metodo === "GET" || metodo === "HEAD") {
    const r = filtrar(filas, url);
    if (objeto) return r.length ? json(r[0]) : json({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: "The result contains 0 rows" }, 406);
    return json(r);
  }
  if (metodo === "POST") {
    const nuevas = [].concat(JSON.parse(String(opciones.body)));
    if (tabla === "escaparate_salida") {
      if (sinMigracionPagado && nuevas.some((n) => n.evento === "pedido_pagado")) {
        return json({ code: "23514", message: 'new row for relation "escaparate_salida" violates check constraint "escaparate_salida_evento_check"' }, 400);
      }
      for (const n of nuevas) {
        if (filas.some((f) => f.pedido_id === n.pedido_id && f.id_veoaura === n.id_veoaura && f.evento === n.evento)) continue;
        filas.push({ id: randomUUID(), creado_en: ahoraIso(), estado: "pendiente", intentos: 0, ultimo_intento: null, enviado_en: null, detalle: null, ...n });
      }
    } else if (tabla === "escaparate_salida_productos") {
      for (const n of nuevas) if (!filas.some((f) => f.producto_id === n.producto_id)) filas.push({ id_mensaje: randomUUID(), detalle: null, enviado_en: null, ...n });
    } else {
      filas.push(...nuevas);
    }
    return new Response(null, { status: 201 });
  }
  if (metodo === "PATCH") {
    const cambio = JSON.parse(String(opciones.body));
    const tocadas = filtrar(filas, url);
    // Índice único de products.id_veoaura.
    if (tabla === "products" && cambio.id_veoaura && tocadas.length && filas.some((f) => f.id_veoaura === cambio.id_veoaura)) {
      return json({ code: "23505", message: 'duplicate key value violates unique constraint "products_id_veoaura_key"' }, 409);
    }
    for (const f of tocadas) Object.assign(f, cambio);
    return json(tocadas.map((f) => ({ id: f.id })));
  }
  throw new Error(`prueba: método no simulado ${metodo} ${tabla}`);
};
const consolaError = console.error;
const consolaAviso = console.warn;
const consolaLog = console.log;
console.error = () => {};
console.warn = () => {};

async function cargar(etiqueta, cambio) {
  if (!cambio) return (await import(`../api/escaparate-retorno.ts?${etiqueta}`)).default;
  const carpeta = mkdtempSync(join(tmpdir(), "vz-retorno-mutado-"));
  symlinkSync(resolve("node_modules"), join(carpeta, "node_modules"));
  const codigo = readFileSync("api/escaparate-retorno.ts", "utf8");
  if (!codigo.includes(cambio[0])) throw new Error(`prueba: la copia no encuentra «${cambio[0]}»`);
  const archivo = join(carpeta, `retorno-${etiqueta}.ts`);
  writeFileSync(archivo, codigo.replace(cambio[0], cambio[1]));
  return { manejador: (await import(`${pathToFileURL(archivo).href}?${etiqueta}`)).default, carpeta };
}
// Una vuelta del cron (sin cupos ni pausa) y lo que llegó a VeoAura en ella (sin las estadísticas).
async function vuelta(manejador) {
  const antes = recibidos.length;
  const res = { codigo: 200, cuerpo: null };
  res.setHeader = () => {};
  res.status = (c) => ((res.codigo = c), res);
  res.json = (b) => ((res.cuerpo = b), res);
  console.log = () => {};
  await manejador({ method: "GET", headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, body: {} }, res);
  console.log = consolaLog;
  return { res, nuevos: recibidos.slice(antes).filter((r) => r.mensaje.evento !== "estadisticas") };
}
const PII = /Ana López|ana@example|600 111 222|Calle Mayor|50410|Cuarte|Déjalo en portería/i;
// El aviso de pagado viaja como un segundo «pedido» con "cliente" dentro de "pedido" (contrato de VeoAura).
const esPagado = (n) => n.mensaje.evento === "pedido" && !!n.mensaje.pedido?.cliente;
const tipo = (n) => (esPagado(n) ? "pagado" : n.mensaje.evento);

function reiniciar() {
  for (const t of Object.values(tablas)) t.length = 0;
  recibidos.length = 0;
  sinMigracionPagado = false;
  sinMigracionProductos = false;
  responderVeoaura = respuestaNormal;
  tablas.products.push(
    { id: "p-veo-1", id_veoaura: "VEO-1", view_count: 3, like_count: 1, is_active: true },
    { id: "p-veo-2", id_veoaura: "VEO-2", view_count: 0, like_count: 0, is_active: true },
    // Del catálogo anterior (creado antes del 2026-11-13): no se avisa a VeoAura.
    { id: "p-tienda", id_veoaura: null, view_count: 0, like_count: 0, is_active: true, created_at: "2026-01-01T00:00:00.000Z" }
  );
  tablas.policy_pages.push(privacidad(PRIV_ANTES));
}
const pedido = (id, numero, estado, items, extra = {}) => ({
  id, numero, estado, entrega: "envio", created_at: new Date(reloj).toISOString(),
  nombre: "  Ana   López ", email: " Ana@Example.com ", telefono: " 600 111 222 ", direccion: "Calle Mayor 5", codigo_postal: "50410", ciudad: "Cuarte", notas: "Déjalo en portería",
  pedido_items: items, ...extra,
});

try {
  const retorno = await cargar("normal");

  // A–D) Un pedido de un artículo de VeoAura, por sus estados.
  {
    reiniciar();
    tablas.pedidos.push(pedido("ped-1", 101, "pendiente", [{ product_id: "p-veo-1", precio_eur: "149.90" }]));
    const a = await vuelta(retorno);
    const m = a.nuevos[0];
    ok(a.res.codigo === 200 && a.nuevos.length === 1 && m.mensaje.evento === "pedido" && m.firmaOk, `A: sale «pedido» firmado (${a.nuevos.map((n) => n.mensaje.evento).join(",")})`);
    ok(!("cliente" in m.mensaje) && !("cliente" in m.mensaje.pedido) && !PII.test(m.cuerpo), "A: «pedido» no lleva ningún dato del cliente");
    ok(m.mensaje.pedido.numero === 101 && m.mensaje.pedido.precio === 149.9 && m.mensaje.id_veoaura === "VEO-1", "A: lleva el número, el precio y el artículo");

    const sinDatos = [];
    for (const estado of ["confirmado", "preparado", "enviado"]) {
      tablas.pedidos[0].estado = estado;
      const b = await vuelta(retorno);
      sinDatos.push(`${estado}:${b.nuevos.length}`);
      if (b.nuevos.some((n) => PII.test(n.cuerpo))) sinDatos.push("¡con datos!");
    }
    ok(sinDatos.join(",") === "confirmado:0,preparado:0,enviado:0", `B: en otros estados no sale nada (${sinDatos.join(", ")})`);

    tablas.pedidos[0].estado = "entregado";
    const c = await vuelta(retorno);
    const pagado = c.nuevos.find(esPagado);
    ok(!!pagado && pagado.firmaOk && c.nuevos.length === 1, `C: al entregarlo sale el aviso de pagado firmado (${c.nuevos.map(tipo).join(",")})`);
    ok(
      pagado?.mensaje.evento === "pedido" && pagado.mensaje.pedido.numero === m.mensaje.pedido.numero && pagado.mensaje.id_mensaje !== m.mensaje.id_mensaje,
      `C: viaja como un segundo «pedido»: mismo número y id_mensaje nuevo (${pagado?.mensaje.evento})`
    );
    ok(
      JSON.stringify(pagado?.mensaje.pedido.cliente) === JSON.stringify({ nombre: "Ana López", correo: "ana@example.com", telefono: "600 111 222" }) && !("cliente" in (pagado?.mensaje ?? {})),
      `C: con "cliente" {nombre, correo, telefono} dentro de "pedido", limpios (${JSON.stringify(pagado?.mensaje.pedido.cliente)})`
    );
    ok(!!pagado && !/Calle Mayor|50410|Cuarte|portería|direccion|codigo_postal|ciudad|notas/i.test(pagado.cuerpo), "C: nunca la dirección, el código postal, la ciudad ni las notas");
    ok(pagado?.mensaje.pedido.numero === 101 && pagado?.mensaje.id_veoaura === "VEO-1" && pagado?.mensaje.version === 1, "C: y el pedido y el artículo de siempre");
    ok(tablas.escaparate_salida.find((s) => s.evento === "pedido_pagado")?.estado === "enviado", "C: el aviso queda «enviado» (Administración → Escaparate lo cuenta)");

    const d = await vuelta(retorno);
    ok(d.nuevos.length === 0, `D: una sola vez: otra vuelta no lo repite (${d.nuevos.length})`);
  }

  // E) Entregado sin que VeoAura supiera nada: primero «pedido», luego «pedido_pagado».
  {
    reiniciar();
    tablas.pedidos.push(pedido("ped-2", 102, "entregado", [{ product_id: "p-veo-2", precio_eur: 60 }]));
    const orden = [];
    for (let i = 0; i < 3; i++) orden.push(...(await vuelta(retorno)).nuevos.map(tipo));
    ok(orden.join(",") === "pedido,pagado", `E: primero el «pedido» sin cliente y después el de pagado (${orden.join(",")})`);
  }

  // F) Sin artículos de VeoAura, o cancelado: nada con datos del cliente.
  {
    reiniciar();
    tablas.pedidos.push(pedido("ped-3", 103, "entregado", [{ product_id: "p-tienda", precio_eur: 20 }]));
    tablas.pedidos.push(pedido("ped-4", 104, "cancelado", [{ product_id: "p-veo-1", precio_eur: 20 }]));
    const todos = [];
    for (let i = 0; i < 2; i++) todos.push(...(await vuelta(retorno)).nuevos);
    ok(todos.length === 0 && !tablas.escaparate_salida.some((s) => s.evento === "pedido_pagado"), `F: sin artículos de VeoAura o cancelado no sale nada (${todos.length})`);
  }

  // G) Sin la migración de «pedido_pagado»: los avisos de siempre siguen saliendo.
  {
    reiniciar();
    sinMigracionPagado = true;
    tablas.pedidos.push(pedido("ped-5", 105, "entregado", [{ product_id: "p-veo-1", precio_eur: 30 }]));
    tablas.pedidos.push(pedido("ped-6", 106, "pendiente", [{ product_id: "p-veo-2", precio_eur: 40 }]));
    const g = [];
    for (let i = 0; i < 2; i++) g.push(...(await vuelta(retorno)).nuevos);
    const numeros = g.filter((n) => tipo(n) === "pedido").map((n) => n.mensaje.pedido.numero).sort();
    ok(numeros.join(",") === "105,106" && !g.some(esPagado), `G: sin la migración, los «pedido» de siempre salen igual (${numeros.join(",")}) y los datos del cliente esperan`);
    sinMigracionPagado = false;
    const tras = (await vuelta(retorno)).nuevos.map(tipo);
    ok(tras.join(",") === "pagado", `G: aplicada la migración, sale el que esperaba (${tras.join(",")})`);
  }

  // H) Datos muy largos: se recortan.
  {
    reiniciar();
    tablas.pedidos.push(pedido("ped-7", 107, "entregado", [{ product_id: "p-veo-1", precio_eur: 10 }], { nombre: "N".repeat(300), email: `${"c".repeat(300)}@x.es`, telefono: "6".repeat(80) }));
    tablas.pedidos.push(pedido("ped-7b", 117, "entregado", [{ product_id: "p-veo-2", precio_eur: 10 }], { email: `${"d".repeat(155)}@x.es` }));
    const fichas = {};
    for (let i = 0; i < 3; i++) for (const n of (await vuelta(retorno)).nuevos) if (esPagado(n)) fichas[n.mensaje.pedido.numero] = n.mensaje.pedido.cliente;
    const largo = fichas[107];
    ok(
      !!largo && largo.nombre.length === 120 && largo.telefono.length === 40 && !("correo" in largo),
      `H: topes del contrato: nombre 120, teléfono 40 y un correo de más de 160 se queda fuera sin recortar (${largo?.nombre?.length}, ${largo?.telefono?.length}, ${largo?.correo ?? "fuera"})`
    );
    ok(fichas[117]?.correo?.length === 160, `H: un correo de 160 va entero (${fichas[117]?.correo?.length})`);
  }

  // I) Entregado y cancelado después, con «pedido_pagado» aún por enviar (la vuelta anterior se quedó sin tiempo):
  //    los datos del cliente no salen y el aviso queda «descartado».
  const casoI = async (manejador) => {
    reiniciar();
    tablas.pedidos.push(pedido("ped-9", 109, "cancelado", [{ product_id: "p-veo-1", precio_eur: 25 }]));
    for (const [evento, estado] of [["pedido", "enviado"], ["pedido_pagado", "pendiente"]]) {
      tablas.escaparate_salida.push({ id: randomUUID(), creado_en: ahoraIso(), evento, id_veoaura: "VEO-1", pedido_id: "ped-9", estado, intentos: estado === "enviado" ? 1 : 0, ultimo_intento: null, enviado_en: null, detalle: null });
    }
    const todos = [];
    for (let i = 0; i < 2; i++) todos.push(...(await vuelta(manejador)).nuevos);
    return todos;
  };
  {
    const i = await casoI(retorno);
    const ficha = tablas.escaparate_salida.find((s) => s.evento === "pedido_pagado");
    ok(!i.some((n) => PII.test(n.cuerpo)) && ficha?.estado === "descartado", `I: entregado y cancelado después: sin datos del cliente y la ficha queda «descartado» (${ficha?.estado})`);
    ok(i.map((n) => n.mensaje.evento).join(",") === "pedido_anulado", `I: VeoAura solo recibe la anulación (${i.map((n) => n.mensaje.evento).join(",")})`);
  }

  // J) Pagado con tarjeta (dueño, 2026-11-06): cuenta como pagado para VeoAura, pero solo cuando la privacidad ya lo
  //    dice; un pago devuelto o un pedido cancelado, no.
  const casoJ = async (manejador, textoPrivacidad, extra = {}) => {
    reiniciar();
    tablas.policy_pages[0] = privacidad(textoPrivacidad);
    tablas.pedidos.push(pedido("ped-11", 111, "pendiente", [{ product_id: "p-veo-1", precio_eur: 240 }], { pago_estado: "pagado", devuelto_en: null, ...extra }));
    const todos = [];
    for (let i = 0; i < 3; i++) todos.push(...(await vuelta(manejador)).nuevos);
    return todos;
  };
  {
    const sinPrivacidad = await casoJ(retorno, PRIV_ANTES);
    ok(sinPrivacidad.map(tipo).join(",") === "pedido" && !sinPrivacidad.some((n) => PII.test(n.cuerpo)), `J: pagado con tarjeta pero sin la privacidad al día: solo el «pedido», sin datos del cliente (${sinPrivacidad.map(tipo).join(",")})`);
    const conPrivacidad = await casoJ(retorno, PRIV_TARJETA);
    const ficha = conPrivacidad.find(esPagado);
    ok(conPrivacidad.map(tipo).join(",") === "pedido,pagado" && ficha?.mensaje.pedido.cliente?.correo === "ana@example.com", `J: con la privacidad al día, pagado con tarjeta = pagado: sale la ficha del cliente sin esperar a «Entregado» (${conPrivacidad.map(tipo).join(",")})`);
    const devuelto = await casoJ(retorno, PRIV_TARJETA, { devuelto_en: "2026-11-06T08:00:00Z" });
    const cancelado = await casoJ(retorno, PRIV_TARJETA, { estado: "cancelado" });
    ok(!devuelto.some(esPagado) && !cancelado.some(esPagado), `J: con el pago devuelto o el pedido cancelado, no (${devuelto.map(tipo).join(",") || "nada"} · ${cancelado.map(tipo).join(",") || "nada"})`);
  }

  // K) Ventas en mano que llegan DE VeoAura (origen 'tienda_fisica', evento «venta_tienda», 2026-11-11): entregadas y con
  //    un artículo de VeoAura, pero nunca se le devuelven (ni «pedido» ni el de pagado con los datos del cliente); un
  //    aviso que hubiera quedado apuntado de una de ellas se descarta sin enviarse. Los pedidos web siguen igual.
  const casoK = async (manejador) => {
    reiniciar();
    tablas.pedidos.push(pedido("ped-k1", 121, "entregado", [{ product_id: "p-veo-1", precio_eur: 229.9 }], { origen: "tienda_fisica", entrega: "recogida" }));
    tablas.pedidos.push(pedido("ped-k2", 122, "pendiente", [{ product_id: "p-veo-2", precio_eur: 50 }], { origen: "web" }));
    tablas.escaparate_salida.push({ id: randomUUID(), creado_en: ahoraIso(), evento: "pedido", id_veoaura: "VEO-1", pedido_id: "ped-k1", estado: "pendiente", intentos: 0, ultimo_intento: null, enviado_en: null, detalle: null });
    const todos = [];
    for (let i = 0; i < 3; i++) todos.push(...(await vuelta(manejador)).nuevos);
    return todos;
  };
  {
    const k = await casoK(retorno);
    const deTienda = k.filter((n) => n.mensaje.pedido?.numero === 121);
    const web = k.filter((n) => n.mensaje.pedido?.numero === 122);
    ok(deTienda.length === 0 && !tablas.escaparate_salida.some((s) => s.pedido_id === "ped-k1" && s.evento === "pedido_pagado"), `K: una venta en mano (de VeoAura) no se le devuelve: ni «pedido» ni el de pagado (${deTienda.map(tipo).join(",") || "nada"})`);
    ok(tablas.escaparate_salida.find((s) => s.pedido_id === "ped-k1")?.estado === "descartado", `K: el aviso que hubiera quedado apuntado se descarta sin enviarse (${tablas.escaparate_salida.find((s) => s.pedido_id === "ped-k1")?.estado})`);
    ok(web.map(tipo).join(",") === "pedido", `K: el pedido web de al lado sigue saliendo como siempre (${web.map(tipo).join(",")})`);
  }
  // CONTROL) Una copia que no distingue las ventas en mano se las devuelve a VeoAura (con los datos del cliente): K lo detecta.
  {
    const { manejador, carpeta } = await cargar("mutado-tienda", ['const esDeVeoaura = (p: PedidoFila | undefined) => p?.origen === "tienda_fisica";', "const esDeVeoaura = (_p: PedidoFila | undefined) => false;"]);
    const fuga = await casoK(manejador);
    ok(fuga.some((n) => n.mensaje.pedido?.numero === 121 && esPagado(n) && PII.test(n.cuerpo)), "(control) sin distinguir las ventas en mano, se le devolverían a VeoAura con los datos del cliente: la comprobación K SÍ lo detecta");
    rmSync(carpeta, { recursive: true, force: true });
  }

  // CONTROL) Una copia que no mira la privacidad manda los datos de un pago con tarjeta antes de tiempo: J lo detecta.
  {
    const { manejador, carpeta } = await cargar("mutado-privacidad", ['return tarjetaCuenta && p.pago_estado === "pagado"', 'return p.pago_estado === "pagado"']);
    const fuga = await casoJ(manejador, PRIV_ANTES);
    ok(fuga.some((n) => PII.test(n.cuerpo)), "(control) sin mirar la privacidad salen los datos de un pago con tarjeta: la comprobación J SÍ lo detecta");
    rmSync(carpeta, { recursive: true, force: true });
  }

  // CONTROL) Una copia que da por pagado un pedido pendiente manda los datos antes de tiempo: A lo detecta.
  {
    reiniciar();
    const { manejador, carpeta } = await cargar("mutado", ['const ESTADO_PAGADO = "entregado";', 'const ESTADO_PAGADO = "pendiente";']);
    tablas.pedidos.push(pedido("ped-8", 108, "pendiente", [{ product_id: "p-veo-1", precio_eur: 10 }]));
    const fuga = [];
    for (let i = 0; i < 2; i++) fuga.push(...(await vuelta(manejador)).nuevos);
    ok(fuga.some((n) => PII.test(n.cuerpo)), "(control) con «pagado» mal puesto salen datos de un pedido pendiente: la comprobación A SÍ lo detecta");
    rmSync(carpeta, { recursive: true, force: true });
  }
  // CONTROL) Una copia que manda el de pagado con otro nombre de evento (VeoAura no lo admite): C lo detecta.
  {
    reiniciar();
    const { manejador, carpeta } = await cargar("mutado-evento", ['evento: pagado ? "pedido" : s.evento,', "evento: s.evento,"]);
    tablas.pedidos.push(pedido("ped-10", 110, "entregado", [{ product_id: "p-veo-1", precio_eur: 10 }]));
    const todos = [];
    for (let i = 0; i < 3; i++) todos.push(...(await vuelta(manejador)).nuevos);
    ok(!todos.some(esPagado), `(control) con el evento «${todos.at(-1)?.mensaje.evento}» la comprobación C SÍ lo detecta (no lo reconoce como el de pagado)`);
    rmSync(carpeta, { recursive: true, force: true });
  }
  // CONTROL) Una copia que no vuelve a mirar el estado antes de enviar la ficha la manda de un pedido cancelado: I lo detecta.
  {
    const { manejador, carpeta } = await cargar("mutado-cancelado", ["if (!estaPagado(ahora, tarjetaCuenta)) {", "if (!ahora) {"]);
    const fuga = await casoI(manejador);
    ok(fuga.some((n) => PII.test(n.cuerpo)), "(control) sin mirar el estado al enviar salen los datos de un pedido cancelado: la comprobación I SÍ lo detecta");
    rmSync(carpeta, { recursive: true, force: true });
  }

  // L–S) Productos creados a mano en la tienda (sin id_veoaura) → evento «producto_tienda» (dueño, 2026-11-13). Solo datos
  //    del producto; VeoAura responde {ok:true, id_veoaura} y la tienda lo guarda; sin respuesta válida queda pendiente.
  const FOTO = "https://rgvyvaineyodyxzwootl.supabase.co/storage/v1/object/public/product-media/p-mano-1/1.jpg";
  const productoMano = (id, extra = {}) => ({
    id, id_veoaura: null, title: "  Mando PS5 DualSense  ", description: "Como nuevo, con caja.", price_eur: "49.5", status: "PUBLISHED",
    condition: "GOOD", category_id: "cat-1", created_at: "2026-11-13T09:00:00.000Z", is_active: true, view_count: 0, like_count: 0, ...extra,
  });
  const prepararProducto = (extra = {}) => {
    reiniciar();
    tablas.categories.push({ id: "cat-1", name: "Mandos" });
    tablas.products.push(productoMano("p-mano-1", extra));
    tablas.product_media.push(
      { product_id: "p-mano-1", public_url: FOTO, sort_order: 0, mime_type: "image/jpeg" },
      { product_id: "p-mano-1", public_url: "https://rgvyvaineyodyxzwootl.supabase.co/storage/v1/object/public/product-media/p-mano-1/v.mp4", sort_order: 1, mime_type: "video/mp4" }
    );
    // Hay un pedido entregado con datos de cliente en la tienda: nada de eso debe viajar en los avisos de productos.
    tablas.pedidos.push(pedido("ped-p", 150, "entregado", [{ product_id: "p-veo-1", precio_eur: 10 }]));
  };
  const deProducto = (r) => r.nuevos.filter((n) => n.mensaje.evento === "producto_tienda");
  const fila = () => tablas.escaparate_salida_productos.find((f) => f.producto_id === "p-mano-1");
  const mano = () => tablas.products.find((p) => p.id === "p-mano-1");
  const vueltasProducto = async (manejador, n = 3) => {
    const todos = [];
    for (let i = 0; i < n; i++) todos.push(...deProducto(await vuelta(manejador)));
    return todos;
  };
  {
    // L) Se apunta y se envía firmado, con solo datos del producto.
    prepararProducto();
    const l = await vueltasProducto(retorno);
    const m = l[0];
    ok(l.length === 1 && !!m && m.firmaOk && fila()?.estado === "enviado", `L: un producto a mano se apunta y se envía firmado, una sola vez (${l.length}, ${fila()?.estado})`);
    const p = m?.mensaje.producto;
    ok(
      m?.mensaje.version === 1 && !!m.mensaje.id_mensaje && p?.id_tienda === "p-mano-1" && p?.titulo === "Mando PS5 DualSense" && p?.precio === 49.5 && p?.moneda === "EUR" &&
        p?.categoria === "Mandos" && p?.condicion === "GOOD" && p?.estado === "PUBLISHED" && p?.creado_en === "2026-11-13T09:00:00.000Z",
      `L: lleva id de la tienda, título, precio, estado, condición, categoría y fecha (${JSON.stringify(p)?.slice(0, 160)})`
    );
    ok(JSON.stringify(p?.fotos) === JSON.stringify([FOTO]), `L: solo las URL de las fotos (sin el vídeo): ${JSON.stringify(p?.fotos)}`);
    ok(!!m && !PII.test(m.cuerpo) && !("pedido" in m.mensaje) && !("cliente" in m.mensaje), "L: nada de datos de clientes ni de pedidos");
    ok(!tablas.escaparate_salida.some((s) => s.evento === "producto_tienda"), "L: no se usa escaparate_salida (su lista de eventos no se toca)");
    // M) Con id_veoaura en la respuesta, se guarda en el producto.
    ok(/^[0-9a-f-]{36}$/.test(mano()?.id_veoaura ?? ""), `M: el id_veoaura devuelto por VeoAura se guarda en el producto (${mano()?.id_veoaura})`);
  }
  {
    // N) Respuesta de error («evento desconocido»): queda pendiente, se reintenta como los demás y sin romper los pedidos.
    prepararProducto();
    responderVeoaura = (mensaje) => (mensaje.evento === "producto_tienda" ? { estado: 400, cuerpo: { ok: false, error: "evento desconocido" } } : { estado: 200, cuerpo: { ok: true } });
    const primera = await vuelta(retorno);
    ok(primera.res.codigo === 200 && fila()?.estado === "error" && fila()?.intentos === 1 && mano()?.id_veoaura === null, `N: VeoAura no lo acepta: queda pendiente («error», 1 intento) y sin id (${fila()?.estado}, ${fila()?.intentos})`);
    ok(/evento desconocido/.test(fila()?.detalle ?? ""), `N: el motivo queda apuntado (${fila()?.detalle})`);
    ok(primera.nuevos.some((n) => n.mensaje.evento === "pedido"), "N: los avisos de pedidos salen igual");
    const seguida = await vueltasProducto(retorno, 1);
    ok(seguida.length === 0, `N: no se reintenta antes de un minuto (${seguida.length})`);
    fila().ultimo_intento = new Date(Date.now() - 61_000).toISOString();
    responderVeoaura = respuestaNormal;
    const reintento = await vueltasProducto(retorno, 1);
    ok(reintento.length === 1 && fila()?.estado === "enviado" && fila()?.intentos === 2 && !!mano()?.id_veoaura && reintento[0].mensaje.id_mensaje === primera.nuevos.find((n) => n.mensaje.evento === "producto_tienda")?.mensaje.id_mensaje,
      `N: pasado el minuto se reintenta con el mismo id_mensaje y, al aceptarlo, guarda el id (${fila()?.estado}, ${fila()?.intentos})`);
    // Una respuesta ok sin id_veoaura tampoco vale: sigue pendiente.
    prepararProducto();
    responderVeoaura = () => ({ estado: 200, cuerpo: { ok: true } });
    await vuelta(retorno);
    ok(fila()?.estado === "error" && mano()?.id_veoaura === null, `N: «ok» sin id_veoaura no vale: sigue pendiente (${fila()?.estado})`);
    // Tras 12 intentos, uno cada 6 horas (no se abandona del todo).
    fila().intentos = 12;
    fila().ultimo_intento = new Date(Date.now() - 3_600_000).toISOString();
    const antes = fila().intentos;
    await vuelta(retorno);
    ok(fila().intentos === antes, "N: agotados los 12 intentos espera 6 horas antes del siguiente");
    fila().ultimo_intento = new Date(Date.now() - 7 * 3_600_000).toISOString();
    responderVeoaura = respuestaNormal;
    await vuelta(retorno);
    ok(fila().estado === "enviado" && !!mano().id_veoaura, "N: pasadas las 6 horas se vuelve a intentar y, aceptado, queda enviado");
  }
  {
    // O) Un producto que ya tiene id_veoaura (o del catálogo anterior) no se envía.
    prepararProducto({ id_veoaura: "11111111-1111-4111-8111-111111111111" });
    tablas.escaparate_salida_productos.push({ producto_id: "p-mano-1", id_mensaje: randomUUID(), huella: "x", estado: "pendiente", intentos: 0, ultimo_intento: null, actualizado_en: ahoraIso() });
    const o = await vueltasProducto(retorno);
    ok(o.length === 0 && fila()?.estado === "descartado", `O: con id_veoaura no se envía y su aviso pendiente se descarta (${o.length}, ${fila()?.estado})`);
    ok(!tablas.escaparate_salida_productos.some((f) => f.producto_id === "p-tienda") && mano()?.id_veoaura === "11111111-1111-4111-8111-111111111111", "O: el catálogo anterior (p-tienda) no se apunta y el id existente no cambia");
  }
  {
    // P) Si cambia el título, el precio o las fotos antes de aceptarlo, se vuelve a avisar con id_mensaje nuevo; y se espera a que
    //    el producto deje de cambiar (las fotos se suben después de crearlo).
    prepararProducto();
    responderVeoaura = (mensaje) => (mensaje.evento === "producto_tienda" ? { estado: 404, cuerpo: { ok: false } } : { estado: 200, cuerpo: { ok: true } });
    await vuelta(retorno);
    const idAntes = fila().id_mensaje;
    const huellaAntes = fila().huella;
    mano().title = "Mando PS5 DualSense blanco";
    mano().price_eur = "45";
    tablas.product_media.push({ product_id: "p-mano-1", public_url: FOTO.replace("1.jpg", "2.jpg"), sort_order: 2, mime_type: "image/jpeg" });
    fila().ultimo_intento = new Date(Date.now() - 61_000).toISOString();
    responderVeoaura = respuestaNormal;
    const p = await vueltasProducto(retorno, 1);
    ok(p.length === 1 && fila().id_mensaje !== idAntes && fila().huella !== huellaAntes, "P: tras cambiar título, precio y fotos, se avisa otra vez con id_mensaje nuevo");
    ok(p[0]?.mensaje.producto.titulo === "Mando PS5 DualSense blanco" && p[0]?.mensaje.producto.precio === 45 && p[0]?.mensaje.producto.fotos.length === 2, "P: con los datos nuevos");
    prepararProducto();
    process.env.VEOAURA_PRODUCTOS_ESPERA_MS = "60000";
    const reciente = await vueltasProducto(retorno, 1);
    ok(reciente.length === 0 && fila()?.estado === "pendiente", `P: recién creado espera a que se suban las fotos antes de enviarse (${reciente.length}, ${fila()?.estado})`);
    fila().actualizado_en = new Date(Date.now() - 61_000).toISOString();
    const estable = await vueltasProducto(retorno, 1);
    process.env.VEOAURA_PRODUCTOS_ESPERA_MS = "0";
    ok(estable.length === 1 && fila()?.estado === "enviado", `P: pasado ese tiempo se envía (${estable.length}, ${fila()?.estado})`);
  }
  {
    // Q) El id devuelto no pisa uno existente ni repite el de otro producto (índice único).
    prepararProducto();
    responderVeoaura = (mensaje) => {
      if (mensaje.evento !== "producto_tienda") return { estado: 200, cuerpo: { ok: true } };
      mano().id_veoaura = "22222222-2222-4222-8222-222222222222"; // alguien se lo puso mientras tanto
      return { estado: 200, cuerpo: { ok: true, id_veoaura: "33333333-3333-4333-8333-333333333333" } };
    };
    await vuelta(retorno);
    ok(mano().id_veoaura === "22222222-2222-4222-8222-222222222222" && fila()?.estado === "enviado", `Q: no pisa un id_veoaura que el producto ya tuviera (${mano().id_veoaura})`);
    prepararProducto();
    tablas.products.push(productoMano("p-mano-2", { created_at: "2026-01-01T00:00:00.000Z", id_veoaura: "44444444-4444-4444-8444-444444444444" }));
    responderVeoaura = (mensaje) => (mensaje.evento === "producto_tienda" ? { estado: 200, cuerpo: { ok: true, id_veoaura: "44444444-4444-4444-8444-444444444444" } } : { estado: 200, cuerpo: { ok: true } });
    await vuelta(retorno);
    ok(mano().id_veoaura === null && fila()?.estado === "error" && /otro producto/.test(fila()?.detalle ?? ""), `Q: un id que ya tiene otro producto no se guarda y queda pendiente (${fila()?.estado}, ${fila()?.detalle})`);
  }
  {
    // R) Sin la migración (la tabla aún no existe): no se rompe nada, los pedidos salen igual y los productos esperan.
    prepararProducto();
    sinMigracionProductos = true;
    const r = await vuelta(retorno);
    ok(r.res.codigo === 200 && r.nuevos.some((n) => n.mensaje.evento === "pedido") && !deProducto(r).length, "R: sin la migración, los pedidos salen igual y el producto espera");
    sinMigracionProductos = false;
    const tras = await vueltasProducto(retorno, 2);
    ok(tras.length === 1 && !!mano().id_veoaura, "R: aplicada la migración, el producto sale");
  }
  // CONTROLES) Copias del puente con un fallo a propósito: las comprobaciones L–Q lo detectan.
  {
    const controles = [
      ["mutado-con-id", "const propios = productos.filter((p) => !p.id_veoaura);", "const propios = productos;", "O", async (m) => { prepararProducto({ id_veoaura: "11111111-1111-4111-8111-111111111111" }); return (await vueltasProducto(m, 2)).length > 0; }],
      ["mutado-sin-guardar", '.update({ id_veoaura: idDevuelto })', '.update({ view_count: 0 })', "M", async (m) => { prepararProducto(); await vuelta(m); return mano().id_veoaura === null; }],
      [
        "mutado-pisar", '.is("id_veoaura", null)', '.neq("id", "")', "Q",
        async (m) => {
          prepararProducto();
          responderVeoaura = (mensaje) => {
            if (mensaje.evento !== "producto_tienda") return { estado: 200, cuerpo: { ok: true } };
            mano().id_veoaura = "22222222-2222-4222-8222-222222222222";
            return { estado: 200, cuerpo: { ok: true, id_veoaura: "33333333-3333-4333-8333-333333333333" } };
          };
          await vuelta(m);
          return mano().id_veoaura !== "22222222-2222-4222-8222-222222222222";
        },
      ],
      ["mutado-sin-id", 'let estado = "error";', 'let estado = r.ok ? "enviado" : "error";', "N", async (m) => { prepararProducto(); responderVeoaura = () => ({ estado: 200, cuerpo: { ok: true } }); await vuelta(m); return fila()?.estado === "enviado" && mano().id_veoaura === null; }],
    ];
    for (const [etiqueta, buscar, poner, cual, falla] of controles) {
      const { manejador, carpeta } = await cargar(etiqueta, [buscar, poner]);
      const detectado = await falla(manejador);
      responderVeoaura = respuestaNormal;
      ok(detectado, `(control) copia con el fallo «${etiqueta}»: la comprobación ${cual} SÍ lo detecta`);
      rmSync(carpeta, { recursive: true, force: true });
    }
    // Una copia que envía datos de pedidos junto al producto sería detectada por L (PII): se simula añadiendo el cliente.
    const { manejador, carpeta } = await cargar("mutado-cliente", ["producto: fichas.get(p.id),", "producto: fichas.get(p.id), cliente: { nombre: 'Ana López', correo: 'ana@example.com' },"]);
    prepararProducto();
    const fuga = await vueltasProducto(manejador, 2);
    ok(fuga.some((n) => PII.test(n.cuerpo)), "(control) con datos de cliente en el aviso del producto: la comprobación L SÍ lo detecta");
    rmSync(carpeta, { recursive: true, force: true });
  }
} catch (e) {
  fallos.push(`la prueba se cortó: ${String(e.stack ?? e).slice(0, 900)}`);
} finally {
  globalThis.fetch = original;
  console.error = consolaError;
  console.warn = consolaAviso;
  console.log = consolaLog;
}

for (const f of fallos) console.log(`FALLO ${f}`);
console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
process.exit(fallos.length ? 1 : 0);
