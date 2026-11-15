/**
 * pruebas/avisos-api.mjs — avisos al móvil del dueño (Web Push) de api/pago.ts.
 *
 * Qué hace: carga la función REAL (Node 24 ejecuta TypeScript sin compilar) y le manda peticiones simuladas. Supabase,
 * Stripe y los servicios de avisos de Google y Apple se simulan EN MEMORIA: no toca producción ni sale a Internet. Genera
 * en la propia prueba un par de claves VAPID y las claves de dos «móviles» suscritos. Comprueba:
 *  AV1) GET ?avisos=clave: sin las 3 variables (o con una pública que no es la de la privada), «sin configurar»; con
 *       ellas, la clave pública.
 *  AV2) Webhook de Stripe de un pedido pagado: un aviso a cada dispositivo activo (nunca al desactivado); el cuerpo
 *       cifrado (aes128gcm, RFC 8291) se DESCIFRA con la clave privada y el «auth» del suscriptor y dice «Pedido pagado ·
 *       349,99 €» / «PlayStation 5 Slim (+1 más) · Ana G. · Envío a Zaragoza 50001 · VZ-AB12-CD34», con icono, etiqueta
 *       por pedido y /admin/pedidos?buscar=VZ-…; sin el nombre completo, correo, teléfono ni dirección.
 *  AV3) La cabecera Authorization es «vapid t=<JWT>, k=<clave>» con un JWT ES256 válido (firma comprobada con la clave
 *       pública) para el ORIGEN del servicio de avisos, que caduca en ≤ 24 h, con el sujeto mailto; Content-Encoding
 *       aes128gcm y TTL.
 *  AV4) Una sola vez: repetir el aviso de Stripe, «confirmar» desde el navegador o los dos a la vez no repite el aviso.
 *  AV5) Registro (admin_avisos_registro): tipo, título, referencia y cuántos llegaron; sin datos del cliente.
 *  AV6) Un 410 desactiva esa suscripción (y deja de usarse); la buena apunta su último envío.
 *  AV7) Si el servicio de avisos no contesta (cuelga) o falla, el webhook responde 200 igual, en menos de 6 s, y el
 *       pedido queda pagado. Sin las variables VAPID, el pago se apunta igual y no sale nada.
 *  AV8) Pedido nuevo sin pago online («referencia», solo para quien lo hizo): «Pedido nuevo · pago en entrega», una vez;
 *       de hace 5 h o de otra persona, nada.
 *  AV9) Servicio pagado (webhook de una reparación): «Servicio pagado · 45,00 €» con el servicio, «Luis M.» y su código,
 *       una vez.
 *  AV10) «avisos_prueba»: un cliente 403; el administrador, solo a SU dispositivo activo (200); otro dispositivo 404; una
 *       dirección que no es de un servicio de avisos 400.
 *  CONTROL) Sin el reclamo de «una sola vez» o con el nombre completo, la prueba lo detecta.
 *
 * Uso: node pruebas/avisos-api.mjs
 * Sale con código 1 si algo falla.
 * Conectado con: api/pago.ts (avisos), supabase/migrations/20261115110000_avisos_movil.sql, public/sw-avisos.js; la lanza
 *   pruebas/todas.mjs (grupo api).
 */
import { createDecipheriv, createECDH, createHmac, createPublicKey, randomBytes, verify as verificarFirma } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const fallos = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "OK   " : "FALLO"} ${msg}`);
  if (!cond) fallos.push(msg);
};

const FALSO = "https://falso.supabase.test";
const SECRETO_AVISO = "whsec_secretodeprueba";
process.env.EXPO_PUBLIC_SUPABASE_URL = FALSO;
process.env.SUPABASE_CLAVE_SERVIDOR = "clave-de-prueba";
process.env.LIMITE_PAUSA_MS = "0";
process.env.STRIPE_SECRET_KEY = "sk_test_clavedeprueba";
process.env.STRIPE_WEBHOOK_SECRET = SECRETO_AVISO;

const b64u = (b) => Buffer.from(b).toString("base64url");
// Claves VAPID de la tienda (como las genera el comando de la PR) y dos «móviles» suscritos.
const vapid = createECDH("prime256v1");
vapid.generateKeys();
const VAPID = { publica: b64u(vapid.getPublicKey()), privada: b64u(vapid.getPrivateKey()), sujeto: "mailto:dueno@example.com" };
const otroPar = createECDH("prime256v1");
otroPar.generateKeys();
const movil = () => {
  const e = createECDH("prime256v1");
  e.generateKeys();
  return { ecdh: e, p256dh: b64u(e.getPublicKey()), auth: b64u(randomBytes(16)) };
};
const MOVIL_A = movil();
const MOVIL_B = movil();
const MOVIL_C = movil();
const EP_A = "https://fcm.googleapis.com/fcm/send/dispositivo-a-0001";
const EP_B = "https://web.push.apple.com/QWxhZGRpbjpvcGVuIHNlc2FtZQ-dispositivo-b";
const EP_C = "https://fcm.googleapis.com/fcm/send/dispositivo-c-desactivado";
const MOVILES = { [EP_A]: MOVIL_A, [EP_B]: MOVIL_B, [EP_C]: MOVIL_C };

const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENTE = "11111111-1111-4111-8111-111111111111";
const sesiones = { "token-admin": ADMIN, "token-cliente": CLIENTE };
const roles = { [ADMIN]: "admin", [CLIENTE]: "user" };
const CLAVE_COMPRA = "c0000000-0000-4000-8000-0000000000c1";
const ID_P = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ID_S = "5e000000-0000-4000-8000-000000000045";

let db;
let stripe;
let push;
let modoPush;
const vapidEnEntorno = (si) => {
  for (const [k, v] of [["VAPID_PUBLIC_KEY", VAPID.publica], ["VAPID_PRIVATE_KEY", VAPID.privada], ["VAPID_SUBJECT", VAPID.sujeto]]) {
    if (si) process.env[k] = v;
    else delete process.env[k];
  }
};

function reiniciar() {
  const ahora = new Date().toISOString();
  const pedido = (n, extra) => ({
    id: ID_P(n), numero: n, created_at: ahora, estado: "pendiente", entrega: "envio", nombre: "Ana Gómez López", email: "ana.gomez@example.com",
    telefono: "600 123 456", direccion: "Calle Mayor 12, 3ºB", codigo_postal: "50001", ciudad: "Zaragoza", total_eur: 349.99, user_id: null,
    clave_unica: CLAVE_COMPRA, codigo_seguimiento: `VZ-AB${n}-CD34`, pago_estado: null, pago_modo: null, pago_sesion: null, pago_referencia: null,
    pagado_eur: null, pagado_en: null, origen: "web", aviso_admin_enviado_en: null, aviso_admin_tipo: null,
    items: [{ titulo: "PlayStation 5 Slim" }, { titulo: "Mando DualSense Midnight Black" }], ...extra,
  });
  db = {
    pedidos: [
      pedido(12, { pago_estado: "iniciado", pago_modo: "prueba", pago_sesion: "cs_test_pedido12aaaaaaaa", codigo_seguimiento: "VZ-AB12-CD34" }),
      pedido(13, { pago_estado: "iniciado", pago_modo: "prueba", pago_sesion: "cs_test_pedido13aaaaaaaa", total_eur: 59.9, items: [{ titulo: "Mando" }] }),
      pedido(14, { pago_estado: "iniciado", pago_modo: "prueba", pago_sesion: "cs_test_pedido14aaaaaaaa", total_eur: 20 }),
      pedido(15, { pago_estado: "iniciado", pago_modo: "prueba", pago_sesion: "cs_test_pedido15aaaaaaaa", total_eur: 30 }),
      pedido(16, { pago_estado: "iniciado", pago_modo: "prueba", pago_sesion: "cs_test_pedido16aaaaaaaa", total_eur: 40 }),
      pedido(21, { entrega: "recogida", direccion: null, codigo_postal: null, ciudad: null, total_eur: 129.9, items: [{ titulo: "Nintendo Switch OLED" }] }),
      pedido(22, { created_at: new Date(Date.now() - 5 * 3600_000).toISOString() }),
      pedido(23, { user_id: CLIENTE, clave_unica: null }),
    ],
    solicitudes: [
      {
        id: ID_S, customer_user_id: CLIENTE, codigo_seguimiento: "VZ-RP45-AB12", service_title: "Mantenimiento PlayStation 5", entrega_modo: "correos",
        seguimiento: "listo", etiqueta_eur: 6.9, etiqueta_pagada_en: ahora, presupuesto_eur: 45, presupuesto_aceptado_en: ahora, pago_estado: null,
        diagnostico_resultado: null, sin_arreglo_eleccion: null, vuelta_eur: null, stripe_sesion: "cs_test_servicio45aaaaaa", nombre: "Luis",
        apellido: "Martínez Ruiz", contacto: "luis@example.com", direccion: "Calle Alfonso 3", aviso_admin_sesion: null,
      },
    ],
    suscripciones: [
      { id: "a1", user_id: ADMIN, endpoint: EP_A, p256dh: MOVIL_A.p256dh, auth: MOVIL_A.auth, etiqueta: "Android · Chrome", activa: true, fallos: 0, ultimo_envio_ok: null, desactivada_en: null },
      { id: "b1", user_id: ADMIN, endpoint: EP_B, p256dh: MOVIL_B.p256dh, auth: MOVIL_B.auth, etiqueta: "iPhone · Safari", activa: true, fallos: 0, ultimo_envio_ok: null, desactivada_en: null },
      { id: "c1", user_id: ADMIN, endpoint: EP_C, p256dh: MOVIL_C.p256dh, auth: MOVIL_C.auth, etiqueta: "Android · Chrome", activa: false, fallos: 0, ultimo_envio_ok: null, desactivada_en: ahora },
    ],
    registro: [],
  };
  const sesion = (id, centimos, metadata, ref) => ({ id, object: "checkout.session", status: "complete", payment_status: "paid", amount_total: centimos, currency: "eur", livemode: false, client_reference_id: ref, metadata, payment_intent: `pi_${id.slice(8, 20)}` });
  stripe = new Map(
    [
      sesion("cs_test_pedido12aaaaaaaa", 34999, { pedido_id: ID_P(12) }, ID_P(12)),
      sesion("cs_test_pedido13aaaaaaaa", 5990, { pedido_id: ID_P(13) }, ID_P(13)),
      sesion("cs_test_pedido14aaaaaaaa", 2000, { pedido_id: ID_P(14) }, ID_P(14)),
      sesion("cs_test_pedido15aaaaaaaa", 3000, { pedido_id: ID_P(15) }, ID_P(15)),
      sesion("cs_test_pedido16aaaaaaaa", 4000, { pedido_id: ID_P(16) }, ID_P(16)),
      sesion("cs_test_servicio45aaaaaa", 4500, { solicitud_id: ID_S, concepto: "reparacion" }, ID_S),
    ].map((s) => [s.id, s])
  );
  push = [];
  modoPush = {};
}

const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });

// Filtros de PostgREST (lo justo): eq, neq, is, gte, lt y or=(…).
function cumple(fila, col, expr) {
  const i = expr.indexOf(".");
  const op = expr.slice(0, i);
  const v = expr.slice(i + 1);
  const x = fila[col];
  if (op === "eq") return String(x) === v;
  if (op === "neq") return x !== null && x !== undefined && String(x) !== v;
  if (op === "is") return v === "null" ? x === null || x === undefined : String(x) === v;
  if (op === "gte") return x !== null && x !== undefined && (typeof x === "number" ? x >= Number(v) : String(x) >= v);
  if (op === "lt") return x !== null && x !== undefined && Number(x) < Number(v);
  throw new Error(`filtro no simulado: ${col}=${expr}`);
}
function filtrar(filas, url) {
  return filas.filter((f) => {
    for (const [k, v] of url.searchParams) {
      if (["select", "order", "limit", "columns", "on_conflict"].includes(k)) continue;
      if (k === "or") {
        const partes = v.replace(/^\(|\)$/g, "").split(",");
        if (!partes.some((p) => cumple(f, p.slice(0, p.indexOf(".")), p.slice(p.indexOf(".") + 1)))) return false;
        continue;
      }
      if (!cumple(f, k, v)) return false;
    }
    return true;
  });
}
function proyectar(f, select) {
  if (!select || select === "*") return { ...f };
  const o = {};
  for (const c of select.split(",")) {
    if (c === "*") Object.assign(o, f);
    else if (c.startsWith("pedido_items(")) o.pedido_items = (f.items ?? []).map((it) => ({ titulo: it.titulo }));
    else o[c] = f[c] ?? null;
  }
  delete o.items;
  return o;
}

async function supabaseFalso(url, metodo, cabeceras, cuerpo) {
  const objeto = /vnd\.pgrst\.object/.test(cabeceras.get("accept") ?? "");
  const representar = /return=representation/.test(cabeceras.get("prefer") ?? "");
  const ruta = url.pathname;
  const select = url.searchParams.get("select");
  if (ruta === "/auth/v1/user") {
    const uid = sesiones[(cabeceras.get("authorization") ?? "").replace(/^Bearer\s+/i, "")];
    return uid ? json({ id: uid, aud: "authenticated", role: "authenticated" }) : json({ message: "invalid JWT" }, 401);
  }
  if (ruta === "/rest/v1/rpc/consumir_limite") return json({ permitido: true, reinicia_en: 600 });
  if (ruta === "/rest/v1/profiles") {
    const r = roles[(url.searchParams.get("id") ?? "").replace(/^eq\./, "")];
    return objeto ? json(r ? { role: r } : null) : json(r ? [{ role: r }] : []);
  }
  const tablas = { pedidos: db.pedidos, service_requests: db.solicitudes, admin_avisos_suscripciones: db.suscripciones };
  const tabla = ruta.replace("/rest/v1/", "");
  if (tabla === "admin_avisos_registro" && metodo === "POST") {
    db.registro.push(...[].concat(cuerpo));
    return new Response(null, { status: 201 });
  }
  if (tablas[tabla]) {
    if (tabla === "pedidos" && db.sinColumnasAviso && /aviso_admin/.test(JSON.stringify(cuerpo ?? {}) + url.search)) return json({ code: "42703", message: "column pedidos.aviso_admin_tipo does not exist" }, 400);
    const filas = filtrar(tablas[tabla], url);
    if (metodo === "GET") {
      const salida = filas.slice(0, Number(url.searchParams.get("limit") ?? 1000)).map((f) => proyectar(f, select));
      return objeto ? json(salida[0] ?? null) : json(salida);
    }
    if (metodo === "PATCH") {
      // Apuntar el pago tarda un poco (como la red): así, el aviso de Stripe y la vuelta del navegador a la vez leen
      // los dos el pedido sin pagar antes de que ninguno lo apunte, que es la carrera real.
      if (tabla === "pedidos" && cuerpo?.pago_estado === "pagado") {
        await new Promise((fin) => setTimeout(fin, 40));
        const siguen = filtrar(tablas[tabla], url);
        for (const f of siguen) Object.assign(f, cuerpo);
        return representar ? json(siguen.map((f) => proyectar(f, select))) : new Response(null, { status: 204 });
      }
      for (const f of filas) Object.assign(f, cuerpo);
      return representar ? json(filas.map((f) => proyectar(f, select))) : new Response(null, { status: 204 });
    }
  }
  return json([]);
}

function stripeFalso(url) {
  const id = decodeURIComponent(url.pathname.split("/")[4] ?? "");
  const s = stripe.get(id);
  return s ? json(s) : json({ error: { code: "resource_missing" } }, 404);
}

// Los servicios de avisos (Google y Apple): se apunta lo recibido y se contesta según `modoPush`.
async function servicioAvisos(url, opciones) {
  const endpoint = url.href;
  const cuerpo = Buffer.from(opciones.body ?? []);
  push.push({ endpoint, cabeceras: new Headers(opciones.headers ?? {}), cuerpo });
  const modo = modoPush[endpoint] ?? modoPush.todos ?? 201;
  if (modo === "cuelga") return new Promise(() => {});
  if (modo === "falla") throw new TypeError("fetch failed");
  return new Response(null, { status: modo });
}

const original = globalThis.fetch;
globalThis.fetch = async (entrada, opciones = {}) => {
  const url = new URL(typeof entrada === "string" ? entrada : entrada.url);
  const metodo = opciones.method ?? "GET";
  const cabeceras = new Headers(opciones.headers ?? {});
  if (url.origin === FALSO) return supabaseFalso(url, metodo, cabeceras, typeof opciones.body === "string" && opciones.body ? JSON.parse(opciones.body) : null);
  if (url.hostname === "api.stripe.com") return stripeFalso(url);
  if (url.hostname === "videojuegoszaragoza.com" && url.pathname === "/api/escaparate-retorno") return json({ ok: true });
  if (MOVILES[url.href]) return servicioAvisos(url, opciones);
  throw new Error(`prueba: salida de red inesperada a ${url.origin}`);
};

function respuesta() {
  const r = { codigo: 200, cuerpo: null };
  r.setHeader = () => {};
  r.status = (c) => ((r.codigo = c), r);
  r.json = (b) => ((r.cuerpo = b), r);
  return r;
}
async function pedir(manejador, metodo, { token, cuerpo, crudo, cabeceras = {}, url = "/api/pago" } = {}) {
  const texto = crudo ?? (cuerpo === undefined ? "" : JSON.stringify(cuerpo));
  const req = {
    method: metodo,
    url,
    query: Object.fromEntries(new URL(url, "https://x").searchParams),
    headers: { host: "videojuegoszaragoza.com", "x-vercel-forwarded-for": "203.0.113.7", ...(token ? { authorization: `Bearer ${token}` } : {}), ...cabeceras },
    async *[Symbol.asyncIterator]() {
      if (texto) yield Buffer.from(texto, "utf8");
    },
  };
  const res = respuesta();
  const [e, w] = [console.error, console.warn];
  console.error = () => {};
  console.warn = () => {};
  const t0 = Date.now();
  try {
    await manejador(req, res);
  } finally {
    console.error = e;
    console.warn = w;
  }
  res.ms = Date.now() - t0;
  return res;
}
const firmar = (cuerpo, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac("sha256", SECRETO_AVISO).update(`${t}.${cuerpo}`).digest("hex")}`;
const aviso = (sesion, evt = "evt_1") => {
  const c = JSON.stringify({ id: evt, type: "checkout.session.completed", livemode: false, data: { object: { id: sesion, object: "checkout.session" } } });
  return { crudo: c, cabeceras: { "stripe-signature": firmar(c) } };
};

// El móvil descifra el aviso (RFC 8291, lado del que lo recibe) con SU clave privada y su «auth».
function descifrar(cuerpo, m) {
  const sal = cuerpo.subarray(0, 16);
  const rs = cuerpo.readUInt32BE(16);
  const n = cuerpo[20];
  const clavePub = cuerpo.subarray(21, 21 + n);
  const datos = cuerpo.subarray(21 + n);
  const h = (k, d) => createHmac("sha256", k).update(d).digest();
  const compartido = m.ecdh.computeSecret(clavePub);
  const ua = m.ecdh.getPublicKey();
  const ikm = h(h(Buffer.from(m.auth, "base64url"), compartido), Buffer.concat([Buffer.from("WebPush: info\0", "latin1"), ua, clavePub, Buffer.from([1])]));
  const prk = h(sal, ikm);
  const cek = h(prk, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm\0", "latin1"), Buffer.from([1])])).subarray(0, 16);
  const nonce = h(prk, Buffer.concat([Buffer.from("Content-Encoding: nonce\0", "latin1"), Buffer.from([1])])).subarray(0, 12);
  const d = createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(datos.subarray(datos.length - 16));
  const claro = Buffer.concat([d.update(datos.subarray(0, datos.length - 16)), d.final()]);
  let fin = claro.length - 1;
  while (fin >= 0 && claro[fin] === 0) fin--;
  return { rs, n, delimitador: claro[fin], json: JSON.parse(claro.subarray(0, fin).toString("utf8")) };
}

function jwtValido(autorizacion, endpoint) {
  const m = /^vapid t=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+), k=([A-Za-z0-9_-]+)$/.exec(autorizacion ?? "");
  if (!m) return { ok: false, motivo: "formato" };
  const cab = JSON.parse(Buffer.from(m[1], "base64url").toString());
  const carga = JSON.parse(Buffer.from(m[2], "base64url").toString());
  const pub = Buffer.from(m[4], "base64url");
  const clave = createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }, format: "jwk" });
  const firma = Buffer.from(m[3], "base64url");
  const firmaOk = firma.length === 64 && verificarFirma("sha256", Buffer.from(`${m[1]}.${m[2]}`), { key: clave, dsaEncoding: "ieee-p1363" }, firma);
  const ahora = Date.now() / 1000;
  return {
    ok: cab.alg === "ES256" && cab.typ === "JWT" && carga.aud === new URL(endpoint).origin && carga.exp > ahora && carga.exp <= ahora + 24 * 3600 && carga.sub === VAPID.sujeto && m[4] === VAPID.publica && firmaOk,
    cab, carga, firmaOk,
  };
}

async function bateria(manejador) {
  const r = {};
  reiniciar();
  // AV1
  vapidEnEntorno(false);
  r.claveSin = await pedir(manejador, "GET", { url: "/api/pago?avisos=clave" });
  vapidEnEntorno(true);
  process.env.VAPID_PUBLIC_KEY = b64u(otroPar.getPublicKey());
  r.claveMezclada = await pedir(manejador, "GET", { url: "/api/pago?avisos=clave" });
  vapidEnEntorno(true);
  r.claveCon = await pedir(manejador, "GET", { url: "/api/pago?avisos=clave" });

  // AV2-AV5: el webhook de un pedido pagado.
  r.webhook = await pedir(manejador, "POST", aviso("cs_test_pedido12aaaaaaaa"));
  r.push12 = [...push];
  r.fila12 = { ...db.pedidos[0] };
  r.registro12 = db.registro.map((x) => ({ ...x }));
  r.suscripciones12 = db.suscripciones.map((x) => ({ ...x }));
  // Repetido, «confirmar» desde el navegador, y dos a la vez (pedido 13).
  r.webhookOtraVez = await pedir(manejador, "POST", aviso("cs_test_pedido12aaaaaaaa", "evt_2"));
  r.confirmar = await pedir(manejador, "POST", { cuerpo: { accion: "confirmar", sesion: "cs_test_pedido12aaaaaaaa" } });
  r.pushTrasRepetir = push.length;
  const antes13 = push.length;
  await Promise.all([pedir(manejador, "POST", aviso("cs_test_pedido13aaaaaaaa", "evt_3")), pedir(manejador, "POST", { cuerpo: { accion: "confirmar", sesion: "cs_test_pedido13aaaaaaaa" } })]);
  r.push13 = push.length - antes13;

  // AV6: el iPhone contesta 410 (suscripción caducada) → se desactiva y deja de usarse.
  modoPush = { [EP_B]: 410 };
  await pedir(manejador, "POST", aviso("cs_test_pedido14aaaaaaaa", "evt_4"));
  r.susTras410 = db.suscripciones.map((x) => ({ ...x }));
  modoPush = {};
  const antes15 = push.length;
  // AV7: el servicio de avisos cuelga: el webhook contesta igual.
  modoPush = { todos: "cuelga" };
  r.webhookCuelga = await pedir(manejador, "POST", aviso("cs_test_pedido15aaaaaaaa", "evt_5"));
  r.fila15 = { ...db.pedidos[3] };
  r.push15 = push.slice(antes15).map((p) => p.endpoint);
  modoPush = { todos: "falla" };
  vapidEnEntorno(false);
  const antes16 = push.length;
  r.webhookSinVapid = await pedir(manejador, "POST", aviso("cs_test_pedido16aaaaaaaa", "evt_6"));
  r.fila16 = { ...db.pedidos[4] };
  r.push16 = push.length - antes16;
  vapidEnEntorno(true);
  modoPush = { todos: "falla" };
  db.pedidos[4].pago_estado = "iniciado";
  r.webhookFalla = await pedir(manejador, "POST", aviso("cs_test_pedido16aaaaaaaa", "evt_7"));
  r.fila16b = { ...db.pedidos[4] };
  modoPush = {};
  // Vuelve a activar el iPhone para lo siguiente.
  Object.assign(db.suscripciones[1], { activa: true, desactivada_en: null });

  // AV8: pedido nuevo sin pago online.
  const antes21 = push.length;
  r.ref21 = await pedir(manejador, "POST", { cuerpo: { accion: "referencia", numero: 21, clave: CLAVE_COMPRA } });
  r.push21 = push.slice(antes21);
  r.ref21b = await pedir(manejador, "POST", { cuerpo: { accion: "referencia", numero: 21, clave: CLAVE_COMPRA } });
  r.push21b = push.length - antes21;
  const antes22 = push.length;
  r.ref22 = await pedir(manejador, "POST", { cuerpo: { accion: "referencia", numero: 22, clave: CLAVE_COMPRA } });
  r.ref23ajena = await pedir(manejador, "POST", { cuerpo: { accion: "referencia", numero: 23 } });
  r.push22 = push.length - antes22;
  r.fila22 = { ...db.pedidos[6] };

  // AV9: servicio pagado.
  const antesS = push.length;
  r.webhookServicio = await pedir(manejador, "POST", aviso("cs_test_servicio45aaaaaa", "evt_8"));
  r.pushS = push.slice(antesS);
  await pedir(manejador, "POST", aviso("cs_test_servicio45aaaaaa", "evt_9"));
  r.pushS2 = push.length - antesS;

  // AV10: aviso de prueba.
  const antesP = push.length;
  r.pruebaCliente = await pedir(manejador, "POST", { token: "token-cliente", cuerpo: { accion: "avisos_prueba", endpoint: EP_A } });
  r.pruebaAdmin = await pedir(manejador, "POST", { token: "token-admin", cuerpo: { accion: "avisos_prueba", endpoint: EP_A } });
  r.pushP = push.slice(antesP).map((p) => p.endpoint);
  r.pruebaInactivo = await pedir(manejador, "POST", { token: "token-admin", cuerpo: { accion: "avisos_prueba", endpoint: EP_C } });
  r.pruebaRara = await pedir(manejador, "POST", { token: "token-admin", cuerpo: { accion: "avisos_prueba", endpoint: "https://evil.example.com/push" } });
  r.registroFinal = db.registro.map((x) => ({ ...x }));
  return r;
}

try {
  const manejador = (await import("../api/pago.ts")).default;
  const r = await bateria(manejador);

  ok(r.claveSin.codigo === 200 && r.claveSin.cuerpo?.configurado === false && r.claveSin.cuerpo?.clave === null, `AV1: sin las variables, «sin configurar» (${JSON.stringify(r.claveSin.cuerpo)})`);
  ok(r.claveMezclada.cuerpo?.configurado === false, "AV1: con una clave pública que no es la de la privada, tampoco");
  ok(r.claveCon.cuerpo?.configurado === true && r.claveCon.cuerpo?.clave === VAPID.publica && !JSON.stringify(r.claveCon.cuerpo).includes(VAPID.privada), "AV1: con las variables, la clave pública (y nunca la privada)");

  ok(r.webhook.codigo === 200 && r.fila12.pago_estado === "pagado", `AV2: el webhook apunta el pago (${r.webhook.codigo} ${r.fila12.pago_estado})`);
  const destinos = r.push12.map((p) => p.endpoint).sort();
  ok(destinos.length === 2 && destinos.join(",") === [EP_A, EP_B].sort().join(","), `AV2: un aviso a cada dispositivo activo y ninguno al desactivado (${destinos.length})`);
  const pA = r.push12.find((p) => p.endpoint === EP_A);
  const pB = r.push12.find((p) => p.endpoint === EP_B);
  let dA = null;
  let dB = null;
  try {
    dA = descifrar(pA.cuerpo, MOVIL_A);
    dB = descifrar(pB.cuerpo, MOVIL_B);
  } catch (e) {
    console.log(String(e.message));
  }
  ok(!!dA && !!dB && dA.rs === 4096 && dA.n === 65 && dA.delimitador === 2, `AV2: el cuerpo aes128gcm se descifra con la clave del suscriptor (rs ${dA?.rs}, clave ${dA?.n}, delimitador ${dA?.delimitador})`);
  let cruzado = false;
  try {
    descifrar(pA.cuerpo, MOVIL_B);
    cruzado = true;
  } catch {
    // bien: con la clave de otro móvil no se puede leer
  }
  ok(!cruzado, "AV2: con la clave de OTRO móvil no se puede descifrar");
  const j = dA?.json ?? {};
  ok(j.title === "Pedido pagado · 349,99 €", `AV2: título «Pedido pagado · 349,99 €» (${j.title})`);
  ok(j.body === "PlayStation 5 Slim (+1 más) · Ana G. · Envío a Zaragoza 50001 · VZ-AB12-CD34", `AV2: resumen que se previsualiza bien (${j.body})`);
  ok(j.url === "/admin/pedidos?buscar=VZ-AB12-CD34" && j.tag === `pedido-${ID_P(12)}` && j.icon === "/icono-192.png", `AV2: abre Pedidos con la referencia, etiqueta por pedido e icono de la tienda (${j.url} ${j.tag} ${j.icon})`);
  const todo = JSON.stringify([dA?.json, dB?.json]);
  ok(!/Gómez|López|ana\.gomez|600 123 456|Calle Mayor|3ºB/.test(todo), "AV2: sin nombre completo, correo, teléfono ni dirección");
  ok(pA.cabeceras.get("content-encoding") === "aes128gcm" && pA.cabeceras.get("ttl") === "86400" && pA.cabeceras.get("content-type") === "application/octet-stream", "AV3: Content-Encoding aes128gcm, TTL y tipo de contenido");
  const jA = jwtValido(pA.cabeceras.get("authorization"), EP_A);
  const jB = jwtValido(pB.cabeceras.get("authorization"), EP_B);
  ok(jA.ok && jB.ok, `AV3: JWT ES256 válido y firmado con la clave VAPID, para el origen de cada servicio (${jA.carga?.aud} · ${jB.carga?.aud}; firma ${jA.firmaOk})`);
  ok(jB.carga?.aud === "https://web.push.apple.com" && jA.carga?.aud === "https://fcm.googleapis.com", "AV3: «aud» es solo el origen (sin la ruta del dispositivo)");

  ok(r.webhookOtraVez.codigo === 200 && r.confirmar.codigo === 200 && r.pushTrasRepetir === 2, `AV4: repetir el aviso de Stripe o «confirmar» no repite el aviso (${r.pushTrasRepetir})`);
  ok(r.push13 === 2, `AV4: webhook y vuelta del navegador A LA VEZ: un solo aviso por dispositivo (${r.push13})`);
  ok(r.fila12.aviso_admin_tipo === "pagado" && !!r.fila12.aviso_admin_enviado_en, "AV4: el pedido queda marcado como avisado");

  const reg = r.registro12[0] ?? {};
  ok(r.registro12.length === 1 && reg.tipo === "pedido_pagado" && reg.titulo === "Pedido pagado · 349,99 €" && reg.referencia === "VZ-AB12-CD34" && reg.entregados === 2 && reg.fallidos === 0, `AV5: el registro apunta tipo, título, referencia y entregados (${JSON.stringify(reg)})`);
  ok(!/Ana|Gómez|example\.com|600|Calle/.test(JSON.stringify(r.registroFinal)), "AV5: el registro no lleva datos del cliente");
  ok(r.suscripciones12.filter((s) => s.activa).every((s) => !!s.ultimo_envio_ok && s.fallos === 0), "AV5: cada dispositivo apunta su último envío bueno");

  const b410 = r.susTras410.find((s) => s.endpoint === EP_B);
  const a410 = r.susTras410.find((s) => s.endpoint === EP_A);
  ok(b410?.activa === false && !!b410?.desactivada_en && a410?.activa === true, `AV6: un 410 desactiva esa suscripción y no la otra (${b410?.activa}, ${a410?.activa})`);
  ok(!r.push15.includes(EP_B), `AV6: la desactivada deja de usarse (${r.push15.join(", ")})`);

  ok(r.webhookCuelga.codigo === 200 && r.webhookCuelga.ms < 6000 && r.fila15.pago_estado === "pagado", `AV7: si el servicio de avisos cuelga, el webhook contesta 200 en menos de 6 s y el pago queda apuntado (${r.webhookCuelga.ms} ms)`);
  ok(r.webhookSinVapid.codigo === 200 && r.fila16.pago_estado === "pagado" && r.push16 === 0 && r.fila16.aviso_admin_tipo === null, `AV7: sin las variables VAPID, el pago se apunta y no sale nada (${r.push16})`);
  ok(r.webhookFalla.codigo === 200 && r.fila16b.pago_estado === "pagado", `AV7: si el envío falla, el webhook responde 200 igual (${r.webhookFalla.codigo})`);

  let d21 = null;
  try {
    d21 = descifrar(r.push21[0].cuerpo, MOVILES[r.push21[0].endpoint]).json;
  } catch {
    // abajo
  }
  ok(r.ref21.codigo === 200 && r.ref21.cuerpo?.referencia === "VZ-AB21-CD34" && r.push21.length === 2 && d21?.title === "Pedido nuevo · pago en entrega", `AV8: pedido nuevo sin pago online, «Pedido nuevo · pago en entrega» (${d21?.title})`);
  ok(d21?.body === "Nintendo Switch OLED · Ana G. · Recogida en mano · VZ-AB21-CD34", `AV8: con su resumen (${d21?.body})`);
  ok(r.ref21b.codigo === 200 && r.push21b === 2, `AV8: pedir otra vez la referencia no lo repite (${r.push21b})`);
  ok(r.ref22.codigo === 200 && r.ref23ajena.codigo === 404 && r.push22 === 0 && r.fila22.aviso_admin_tipo === null, `AV8: un pedido de hace 5 h o de otra persona no avisa (${r.push22})`);

  let dS = null;
  try {
    dS = descifrar(r.pushS[0].cuerpo, MOVILES[r.pushS[0].endpoint]).json;
  } catch {
    // abajo
  }
  ok(r.webhookServicio.codigo === 200 && r.pushS.length === 2 && dS?.title === "Servicio pagado · 45,00 €", `AV9: «Servicio pagado · 45,00 €» (${dS?.title})`);
  ok(dS?.body === "Mantenimiento PlayStation 5 · Luis M. · VZ-RP45-AB12" && dS?.url === "/admin/services" && !/Martínez|luis@|Alfonso/.test(JSON.stringify(dS)), `AV9: con el servicio, «Luis M.» y su código, sin datos de más (${dS?.body})`);
  ok(r.pushS2 === 2, `AV9: un solo aviso por cobro (${r.pushS2})`);

  ok(r.pruebaCliente.codigo === 403, `AV10: un cliente no puede mandar avisos (${r.pruebaCliente.codigo})`);
  ok(r.pruebaAdmin.codigo === 200 && r.pruebaAdmin.cuerpo?.entregados === 1 && r.pushP.length === 1 && r.pushP[0] === EP_A, `AV10: el administrador, solo a ese dispositivo suyo (${JSON.stringify(r.pruebaAdmin.cuerpo)}; ${r.pushP.length})`);
  ok(r.pruebaInactivo.codigo === 404 && r.pruebaRara.codigo === 400, `AV10: un dispositivo desactivado 404 y una dirección rara 400 (${r.pruebaInactivo.codigo}, ${r.pruebaRara.codigo})`);
  ok(r.registroFinal.some((x) => x.tipo === "prueba") && r.registroFinal.some((x) => x.tipo === "pedido_nuevo") && r.registroFinal.some((x) => x.tipo === "servicio_pagado"), "AV10: la prueba, el pedido nuevo y el servicio quedan en el registro");

  // CONTROL: cada defensa quitada en una copia de la función; la batería tiene que notarlo.
  const fuente = readFileSync("api/pago.ts", "utf8");
  const carpeta = mkdtempSync(join(tmpdir(), "vz-avisos-"));
  mkdirSync(join(carpeta, "api"));
  symlinkSync(resolve("node_modules"), join(carpeta, "node_modules"));
  const mutaciones = [
    ["una sola vez", '? reclamo.or("aviso_admin_tipo.is.null,aviso_admin_tipo.neq.pagado")', "? reclamo", (m) => m.push13 > 2, "webhook y vuelta a la vez mandan dos avisos (AV4)"],
    ["nombre corto", "return `${pila.charAt(0).toUpperCase()}${pila.slice(1)}${inicial}`;", 'return partes.join(" ");', (m) => {
      try {
        return /Gómez/.test(descifrar(m.push12[0].cuerpo, MOVILES[m.push12[0].endpoint]).json.body);
      } catch {
        return false;
      }
    }, "el aviso lleva el nombre completo (AV2)"],
  ];
  for (const [nombre, buscar, poner, detecta, texto] of mutaciones) {
    const roto = fuente.replace(buscar, poner);
    ok(roto !== fuente, `(control) se ha podido quitar «${nombre}» en la copia de prueba`);
    const archivo = join(carpeta, "api", `pago-avisos-control-${mutaciones.findIndex((x) => x[0] === nombre)}.ts`);
    writeFileSync(archivo, roto);
    const m = await bateria((await import(pathToFileURL(archivo).href)).default);
    ok(detecta(m), `(control) sin «${nombre}», ${texto}: la prueba SÍ lo detecta`);
  }
} catch (e) {
  fallos.push(`la prueba se cortó: ${String(e.stack ?? e).slice(0, 900)}`);
} finally {
  globalThis.fetch = original;
}

for (const f of fallos) console.log(`FALLO ${f}`);
console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
process.exit(fallos.length ? 1 : 0);
