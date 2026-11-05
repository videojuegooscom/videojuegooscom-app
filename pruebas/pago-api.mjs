/**
 * pruebas/pago-api.mjs — pago con tarjeta con Stripe (api/pago.ts).
 *
 * Qué hace: carga la función REAL (Node 24 ejecuta TypeScript sin compilar) y le manda peticiones simuladas. Supabase
 * (sesiones, perfiles, pedidos, políticas y el límite compartido) y Stripe (sesiones de pago, su caducidad y la clave de
 * idempotencia) se simulan EN MEMORIA. No toca producción, ni Stripe, ni Internet. Comprueba:
 *  P1) GET: sin clave de Stripe no hay pago; con la clave de PRUEBA solo lo ve el administrador; sin las columnas de
 *      pago, nadie; con la clave REAL, todos, pero solo cuando la privacidad ya nombra a Stripe.
 *  P2) Crear: con la clave de prueba, un cliente no puede (403, sin llamar a Stripe). El administrador sí: el importe sale
 *      del total GUARDADO del pedido (lo que mande el navegador no cuenta), en euros, con tarjeta, con el pedido en la
 *      sesión y vuelta a la tienda; queda «iniciado».
 *  P3) El pedido tiene que ser de quien paga: de su cuenta o con la clave de la compra. Si no, 404.
 *  P4) Dos toques: la misma sesión, sin abrir otra. Si el total cambia, la sesión antigua se cierra y se abre otra.
 *  P5) Cancelado, entregado o de menos de 0,50 €: no se puede pagar (409).
 *  P6) Confirmar: una sesión sin pagar no apunta nada; pagada, apunta «pagado», lo cobrado, la referencia y el modo, una
 *      sola vez. Una sesión de otro modo o sin pedido: 404. Formato no válido: 400.
 *  P7) Un pedido ya pagado no abre otro cobro.
 *  P8) Aviso de Stripe (webhook): sin secreto 503; firma mala o vieja 400 sin apuntar nada; bien firmada, apunta el pago;
 *      un aviso de un pago que no es de la tienda se da por recibido (200).
 *  P9) Límite por IP: 429.
 *  CONTROL) Sin la comprobación de administrador, sin la de «paid», sin la de la firma o sin la del dueño del pedido,
 *      las pruebas lo detectan.
 *
 * Uso: node pruebas/pago-api.mjs
 * Sale con código 1 si algo falla.
 */
import { createHmac, randomBytes } from "node:crypto";
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
const CLAVE_PRUEBA = "sk_test_clavedeprueba";
const CLAVE_REAL = "sk_live_clavedeprueba";
const SECRETO_AVISO = "whsec_secretodeprueba";
process.env.EXPO_PUBLIC_SUPABASE_URL = FALSO;
process.env.SUPABASE_CLAVE_SERVIDOR = "clave-de-prueba";
process.env.LIMITE_PAUSA_MS = "0";

const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENTE = "11111111-1111-4111-8111-111111111111";
const CLAVE_A = "a0000000-0000-4000-8000-0000000000a1";
const CLAVE_C = "c0000000-0000-4000-8000-0000000000c1";
const CLAVE_ANON = "e0000000-0000-4000-8000-0000000000e1";
const sesiones = { "token-admin": ADMIN, "token-cliente": CLIENTE };
const roles = { [ADMIN]: "admin", [CLIENTE]: "user" };

const fila = (numero, extra) => ({
  id: `00000000-0000-4000-8000-${String(numero).padStart(12, "0")}`,
  numero,
  estado: "pendiente",
  total_eur: 100,
  user_id: ADMIN,
  clave_unica: null,
  pago_estado: null,
  pago_modo: null,
  pago_sesion: null,
  pago_referencia: null,
  pagado_eur: null,
  pagado_en: null,
  pago_iniciado_en: null,
  ...extra,
});
let pedidos;
let politica;
let sinColumnas;
let limitePermitido;
const stripeSesiones = new Map();
const idempotencia = new Map();
const registro = { stripePost: 0, crearSesion: [], expiradas: [], patch: 0 };

function reiniciar() {
  pedidos = [
    fila(101, { total_eur: 106.9, clave_unica: CLAVE_A }),
    fila(102, { user_id: CLIENTE, total_eur: 50, clave_unica: CLAVE_C }),
    fila(103, { user_id: null, total_eur: 30.5, clave_unica: CLAVE_ANON }),
    fila(104, { estado: "cancelado" }),
    fila(105, { estado: "entregado" }),
    fila(106, { total_eur: 0.3 }),
    fila(107, { total_eur: 20 }),
  ];
  politica = [{ heading: "Con quién compartimos tus datos", body: "Supabase, Vercel y OpenAI." }];
  sinColumnas = false;
  limitePermitido = true;
  stripeSesiones.clear();
  idempotencia.clear();
  registro.stripePost = 0;
  registro.crearSesion = [];
  registro.expiradas = [];
  registro.patch = 0;
}

const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });
const eq = (url, campo) => {
  const v = url.searchParams.get(campo);
  return v === null ? null : v.replace(/^eq\./, "");
};

function supabaseFalso(url, metodo, cabeceras, cuerpo) {
  const objeto = /vnd\.pgrst\.object/.test(cabeceras.get("accept") ?? "");
  const ruta = url.pathname;
  if (ruta === "/auth/v1/user") {
    const uid = sesiones[(cabeceras.get("authorization") ?? "").replace(/^Bearer\s+/i, "")];
    return uid ? json({ id: uid, aud: "authenticated", role: "authenticated" }) : json({ message: "invalid JWT" }, 401);
  }
  if (ruta === "/rest/v1/rpc/consumir_limite") return json({ permitido: limitePermitido, reinicia_en: 600 });
  if (ruta === "/rest/v1/profiles") {
    const r = roles[eq(url, "id")];
    return objeto ? json(r ? { role: r } : null) : json(r ? [{ role: r }] : []);
  }
  if (ruta === "/rest/v1/policy_pages") {
    const f = eq(url, "slug") === "privacidad" ? { sections: politica } : null;
    return objeto ? json(f) : json(f ? [f] : []);
  }
  if (ruta === "/rest/v1/pedidos") {
    if (sinColumnas && /pago_/.test(url.searchParams.get("select") ?? "")) return json({ code: "42703", message: "column pedidos.pago_estado does not exist" }, 400);
    const numero = eq(url, "numero");
    const id = eq(url, "id");
    const filas = pedidos.filter((p) => (numero === null || String(p.numero) === numero) && (id === null || p.id === id));
    if (metodo === "GET") return objeto ? json(filas[0] ?? null) : json(filas.slice(0, Number(url.searchParams.get("limit") ?? 1000)));
    if (metodo === "PATCH") {
      registro.patch++;
      // Como PostgREST: el filtro «or=(pago_estado.is.null,pago_estado.neq.pagado)».
      const or = url.searchParams.get("or") ?? "";
      for (const p of filas) {
        if (or.includes("pago_estado.neq.pagado") && p.pago_estado === "pagado") continue;
        Object.assign(p, cuerpo);
      }
      return new Response(null, { status: 204 });
    }
  }
  return json([]);
}

function stripeFalso(url, metodo, cabeceras, cuerpoTexto) {
  const clave = (cabeceras.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const real = clave.startsWith("sk_live_");
  if (!/^sk_(test|live)_/.test(clave)) return json({ error: { type: "invalid_request_error", code: "api_key_invalid" } }, 401);
  const partes = url.pathname.split("/").filter(Boolean); // v1, checkout, sessions, [id], [expire]
  if (metodo === "POST") registro.stripePost++;
  if (metodo === "POST" && partes.length === 3) {
    const k = cabeceras.get("idempotency-key");
    if (k && idempotencia.has(k)) return json(stripeSesiones.get(idempotencia.get(k)));
    const c = Object.fromEntries(new URLSearchParams(cuerpoTexto));
    const id = `cs_${real ? "live" : "test"}_${randomBytes(12).toString("hex")}`;
    const s = {
      id,
      object: "checkout.session",
      status: "open",
      payment_status: "unpaid",
      amount_total: Number(c["line_items[0][price_data][unit_amount]"]),
      currency: c["line_items[0][price_data][currency]"],
      url: `https://checkout.stripe.com/c/pay/${id}`,
      livemode: real,
      client_reference_id: c.client_reference_id,
      metadata: { pedido_id: c["metadata[pedido_id]"], numero: c["metadata[numero]"] },
      payment_intent: null,
    };
    stripeSesiones.set(id, s);
    if (k) idempotencia.set(k, id);
    registro.crearSesion.push({ campos: c, clave: k, id });
    return json(s);
  }
  const s = stripeSesiones.get(decodeURIComponent(partes[3] ?? ""));
  // Una sesión de prueba no existe con la clave real (y al revés).
  if (!s || s.livemode !== real) return json({ error: { type: "invalid_request_error", code: "resource_missing" } }, 404);
  if (metodo === "POST" && partes[4] === "expire") {
    if (s.status !== "open") return json({ error: { code: "checkout_session_expired" } }, 400);
    s.status = "expired";
    registro.expiradas.push(s.id);
    return json(s);
  }
  if (metodo === "GET") return json(s);
  return json({ error: { code: "unknown" } }, 400);
}

const original = globalThis.fetch;
globalThis.fetch = async (entrada, opciones = {}) => {
  const url = new URL(typeof entrada === "string" ? entrada : entrada.url);
  const metodo = opciones.method ?? "GET";
  const cabeceras = new Headers(opciones.headers ?? {});
  if (url.origin === FALSO) return supabaseFalso(url, metodo, cabeceras, opciones.body ? JSON.parse(opciones.body) : null);
  // Stripe se reconoce por la ruta (/v1/checkout/…) y lo contesta el Stripe simulado: la prueba nunca sale a Internet.
  if (url.protocol === "https:" && url.pathname.startsWith("/v1/checkout/")) return stripeFalso(url, metodo, cabeceras, typeof opciones.body === "string" ? opciones.body : "");
  throw new Error(`prueba: salida de red inesperada a ${url.origin}`);
};

function respuesta() {
  const r = { codigo: 200, cuerpo: null };
  r.setHeader = () => {};
  r.status = (c) => ((r.codigo = c), r);
  r.json = (b) => ((r.cuerpo = b), r);
  return r;
}
// La petición como la recibe Vercel: un flujo con los bytes del cuerpo.
async function pedir(manejador, metodo, { token, cuerpo, crudo, cabeceras = {} } = {}) {
  const texto = crudo ?? (cuerpo === undefined ? "" : JSON.stringify(cuerpo));
  const req = {
    method: metodo,
    headers: { host: "videojuegoszaragoza.com", "x-vercel-forwarded-for": "203.0.113.7", ...(token ? { authorization: `Bearer ${token}` } : {}), ...cabeceras },
    async *[Symbol.asyncIterator]() {
      if (texto) yield Buffer.from(texto, "utf8");
    },
  };
  const res = respuesta();
  const consolaError = console.error;
  console.error = () => {};
  try {
    await manejador(req, res);
  } finally {
    console.error = consolaError;
  }
  return res;
}
const firmar = (cuerpo, t = Math.floor(Date.now() / 1000), secreto = SECRETO_AVISO) =>
  `t=${t},v1=${createHmac("sha256", secreto).update(`${t}.${cuerpo}`).digest("hex")}`;
const pedido = (n) => pedidos.find((p) => p.numero === n);
const pagarEnStripe = (id, intento = "pi_3Prueba123") => Object.assign(stripeSesiones.get(id), { status: "complete", payment_status: "paid", payment_intent: intento });

async function bateria(manejador) {
  const r = {};
  reiniciar();
  // P1
  delete process.env.STRIPE_SECRET_KEY;
  r.sinClave = await pedir(manejador, "GET", { token: "token-admin" });
  process.env.STRIPE_SECRET_KEY = CLAVE_PRUEBA;
  r.anonPrueba = await pedir(manejador, "GET");
  r.clientePrueba = await pedir(manejador, "GET", { token: "token-cliente" });
  r.adminPrueba = await pedir(manejador, "GET", { token: "token-admin" });
  sinColumnas = true;
  r.adminSinColumnas = await pedir(manejador, "GET", { token: "token-admin" });
  sinColumnas = false;
  process.env.STRIPE_SECRET_KEY = CLAVE_REAL;
  r.realSinPrivacidad = await pedir(manejador, "GET");
  politica[0].body += " Si pagas con tarjeta, el pago lo gestiona Stripe.";
  r.realConPrivacidad = await pedir(manejador, "GET");
  process.env.STRIPE_SECRET_KEY = CLAVE_PRUEBA;

  // P2
  r.clienteCrea = await pedir(manejador, "POST", { token: "token-cliente", cuerpo: { accion: "crear", numero: 102, clave: CLAVE_C } });
  r.postTrasCliente = registro.stripePost;
  r.adminCrea = await pedir(manejador, "POST", { token: "token-admin", cuerpo: { accion: "crear", numero: 101, total_eur: 1, importe: 1 } });
  r.sesion101 = registro.crearSesion[0];
  r.fila101 = { ...pedido(101) };

  // P3
  r.ajeno = await pedir(manejador, "POST", { token: "token-admin", cuerpo: { accion: "crear", numero: 103 } });
  r.claveMala = await pedir(manejador, "POST", { token: "token-admin", cuerpo: { accion: "crear", numero: 103, clave: CLAVE_C } });
  r.conClave = await pedir(manejador, "POST", { token: "token-admin", cuerpo: { accion: "crear", numero: 103, clave: CLAVE_ANON } });

  // P4
  const antes = registro.crearSesion.length;
  r.otraVez = await pedir(manejador, "POST", { token: "token-admin", cuerpo: { accion: "crear", numero: 101 } });
  r.sesionesTrasOtraVez = registro.crearSesion.length - antes;
  pedido(101).total_eur = 112.4;
  r.otroTotal = await pedir(manejador, "POST", { token: "token-admin", cuerpo: { accion: "crear", numero: 101 } });
  r.sesionNueva = registro.crearSesion[registro.crearSesion.length - 1];
  r.expiradas = [...registro.expiradas];

  // P5
  r.cancelado = await pedir(manejador, "POST", { token: "token-admin", cuerpo: { accion: "crear", numero: 104 } });
  r.entregado = await pedir(manejador, "POST", { token: "token-admin", cuerpo: { accion: "crear", numero: 105 } });
  r.barato = await pedir(manejador, "POST", { token: "token-admin", cuerpo: { accion: "crear", numero: 106 } });

  // P6
  const idNueva = pedido(101).pago_sesion;
  r.confirmarSinPagar = await pedir(manejador, "POST", { cuerpo: { accion: "confirmar", sesion: idNueva } });
  r.filaSinPagar = { ...pedido(101) };
  // Terminada pero aún sin cobrar (un pago que tarda): tampoco se apunta.
  const id103 = pedido(103).pago_sesion;
  Object.assign(stripeSesiones.get(id103), { status: "complete", payment_status: "unpaid" });
  r.confirmarSinCobrar = await pedir(manejador, "POST", { cuerpo: { accion: "confirmar", sesion: id103 } });
  r.fila103 = { ...pedido(103) };
  pagarEnStripe(idNueva);
  r.confirmar = await pedir(manejador, "POST", { cuerpo: { accion: "confirmar", sesion: idNueva } });
  r.filaPagada = { ...pedido(101) };
  const pagadoEn = pedido(101).pagado_en;
  r.confirmarOtraVez = await pedir(manejador, "POST", { cuerpo: { accion: "confirmar", sesion: idNueva } });
  r.pagadoEnIgual = pedido(101).pagado_en === pagadoEn;
  process.env.STRIPE_SECRET_KEY = CLAVE_REAL;
  r.otroModo = await pedir(manejador, "POST", { cuerpo: { accion: "confirmar", sesion: idNueva } });
  process.env.STRIPE_SECRET_KEY = CLAVE_PRUEBA;
  stripeSesiones.set("cs_test_ajenaajenaajena", { id: "cs_test_ajenaajenaajena", status: "complete", payment_status: "paid", amount_total: 500, currency: "eur", livemode: false, metadata: {} });
  r.ajena = await pedir(manejador, "POST", { cuerpo: { accion: "confirmar", sesion: "cs_test_ajenaajenaajena" } });
  r.formato = await pedir(manejador, "POST", { cuerpo: { accion: "confirmar", sesion: "https://otra.web/cs_test_x" } });

  // P7
  const postAntes7 = registro.crearSesion.length;
  r.yaPagado = await pedir(manejador, "POST", { token: "token-admin", cuerpo: { accion: "crear", numero: 101 } });
  r.sesionesTrasPagado = registro.crearSesion.length - postAntes7;

  // P8 (con el pedido 107: se abre su pago y se paga en Stripe; el aviso lo apunta)
  await pedir(manejador, "POST", { token: "token-admin", cuerpo: { accion: "crear", numero: 107 } });
  const id107 = pedido(107).pago_sesion;
  pagarEnStripe(id107, "pi_3Aviso456");
  const aviso = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", livemode: false, data: { object: { id: id107, object: "checkout.session" } } });
  delete process.env.STRIPE_WEBHOOK_SECRET;
  r.avisoSinSecreto = await pedir(manejador, "POST", { crudo: aviso, cabeceras: { "stripe-signature": firmar(aviso) } });
  process.env.STRIPE_WEBHOOK_SECRET = SECRETO_AVISO;
  r.avisoFirmaMala = await pedir(manejador, "POST", { crudo: aviso, cabeceras: { "stripe-signature": firmar(aviso, undefined, "whsec_otro") } });
  r.avisoViejo = await pedir(manejador, "POST", { crudo: aviso, cabeceras: { "stripe-signature": firmar(aviso, Math.floor(Date.now() / 1000) - 3600) } });
  r.avisoCambiado = await pedir(manejador, "POST", { crudo: aviso.replace("evt_1", "evt_2"), cabeceras: { "stripe-signature": firmar(aviso) } });
  r.fila107SinAviso = { ...pedido(107) };
  r.avisoBueno = await pedir(manejador, "POST", { crudo: aviso, cabeceras: { "stripe-signature": firmar(aviso) } });
  r.fila107 = { ...pedido(107) };
  const ajeno = JSON.stringify({ id: "evt_3", type: "checkout.session.completed", livemode: false, data: { object: { id: "cs_test_ajenaajenaajena" } } });
  r.avisoAjeno = await pedir(manejador, "POST", { crudo: ajeno, cabeceras: { "stripe-signature": firmar(ajeno) } });

  // P9
  limitePermitido = false;
  r.limite = await pedir(manejador, "POST", { token: "token-admin", cuerpo: { accion: "crear", numero: 107 } });
  limitePermitido = true;
  return r;
}

try {
  const manejador = (await import("../api/pago.ts")).default;
  const r = await bateria(manejador);

  ok(r.sinClave.codigo === 200 && r.sinClave.cuerpo?.disponible === false, "P1: sin clave de Stripe no hay pago con tarjeta");
  ok(r.anonPrueba.cuerpo?.disponible === false && r.clientePrueba.cuerpo?.disponible === false, "P1: con la clave de prueba, ni un visitante ni un cliente ven el pago");
  ok(r.adminPrueba.cuerpo?.disponible === true && r.adminPrueba.cuerpo?.modo === "prueba", `P1: con la clave de prueba, el administrador sí, en modo prueba (${JSON.stringify(r.adminPrueba.cuerpo)})`);
  ok(r.adminSinColumnas.cuerpo?.disponible === false, "P1: sin las columnas de pago (migración sin aplicar), nadie");
  ok(r.realSinPrivacidad.cuerpo?.disponible === false && r.realConPrivacidad.cuerpo?.disponible === true && r.realConPrivacidad.cuerpo?.modo === "real", "P1: con la clave real, todos, pero solo cuando la privacidad ya nombra a Stripe");

  ok(r.clienteCrea.codigo === 403 && r.postTrasCliente === 0, `P2: con la clave de prueba un cliente no puede pagar y no se llama a Stripe (${r.clienteCrea.codigo})`);
  const c = r.sesion101?.campos ?? {};
  ok(r.adminCrea.codigo === 200 && /^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_/.test(r.adminCrea.cuerpo?.url ?? ""), `P2: el administrador abre el pago (${r.adminCrea.codigo} ${r.adminCrea.cuerpo?.url ?? r.adminCrea.cuerpo?.error})`);
  ok(c["line_items[0][price_data][unit_amount]"] === "10690" && c["line_items[0][price_data][currency]"] === "eur" && c["payment_method_types[0]"] === "card" && c.mode === "payment", `P2: el importe es el total GUARDADO (106,90 € → 10690), en euros y con tarjeta, aunque el navegador mande otro (${c["line_items[0][price_data][unit_amount]"]})`);
  ok(c["metadata[pedido_id]"] === pedido(101).id && c.client_reference_id === pedido(101).id && c["metadata[numero]"] === "101", "P2: la sesión lleva el pedido");
  ok(c.success_url === "https://videojuegoszaragoza.com/checkout?pago=ok&sesion={CHECKOUT_SESSION_ID}" && c.cancel_url === "https://videojuegoszaragoza.com/checkout?pago=cancelado&pedido=101", `P2: vuelve a la tienda (${c.success_url})`);
  ok(!Object.keys(c).some((k) => /email|customer|phone|address|name\]$/.test(k) && !/product_data/.test(k)), "P2: a Stripe no se le manda ningún dato del cliente");
  ok(/^vz-pago-.+-10690-\d+$/.test(r.sesion101?.clave ?? "") && Number(c.expires_at) - Date.now() / 1000 > 29 * 60, `P2: con clave de idempotencia y caducidad de unos 30 minutos (${r.sesion101?.clave})`);
  ok(r.fila101.pago_estado === "iniciado" && r.fila101.pago_modo === "prueba" && r.fila101.pago_sesion === r.sesion101?.id && !!r.fila101.pago_iniciado_en, "P2: el pedido queda «iniciado», de prueba, con su sesión");

  ok(r.ajeno.codigo === 404 && r.claveMala.codigo === 404, `P3: el pedido de otra persona no se puede pagar, ni con otra clave (${r.ajeno.codigo}, ${r.claveMala.codigo})`);
  ok(r.conClave.codigo === 200 && !!r.conClave.cuerpo?.url, "P3: con la clave de la compra (sin cuenta) sí");

  ok(r.otraVez.codigo === 200 && r.otraVez.cuerpo?.url === r.adminCrea.cuerpo?.url && r.sesionesTrasOtraVez === 0, "P4: dos toques = la misma sesión, sin abrir otra");
  ok(r.otroTotal.codigo === 200 && r.sesionNueva?.campos["line_items[0][price_data][unit_amount]"] === "11240" && r.expiradas.includes(r.sesion101?.id) && r.otroTotal.cuerpo?.url !== r.adminCrea.cuerpo?.url, "P4: si el total cambia, la sesión antigua se cierra y la nueva lleva el total nuevo");

  ok(r.cancelado.codigo === 409 && r.entregado.codigo === 409 && r.barato.codigo === 409, `P5: cancelado, entregado o de menos de 0,50 € no se paga (${r.cancelado.codigo}, ${r.entregado.codigo}, ${r.barato.codigo})`);

  ok(r.confirmarSinPagar.codigo === 200 && r.confirmarSinPagar.cuerpo?.pagado === false && r.filaSinPagar.pago_estado === "iniciado", "P6: una sesión sin pagar no apunta nada");
  ok(r.confirmarSinCobrar.cuerpo?.pagado === false && r.fila103.pago_estado === "iniciado", "P6: terminada pero aún sin cobrar (un pago que tarda), tampoco");
  ok(r.confirmar.cuerpo?.pagado === true && r.confirmar.cuerpo?.numero === 101, `P6: pagada en Stripe, se confirma (${JSON.stringify(r.confirmar.cuerpo)})`);
  ok(r.filaPagada.pago_estado === "pagado" && r.filaPagada.pagado_eur === 112.4 && r.filaPagada.pago_referencia === "pi_3Prueba123" && r.filaPagada.pago_modo === "prueba" && !!r.filaPagada.pagado_en, `P6: apunta «pagado», lo cobrado, la referencia y el modo (${JSON.stringify({ e: r.filaPagada.pago_estado, eur: r.filaPagada.pagado_eur, ref: r.filaPagada.pago_referencia })})`);
  ok(r.confirmarOtraVez.cuerpo?.pagado === true && r.pagadoEnIgual, "P6: confirmarlo otra vez no lo apunta dos veces");
  ok(r.otroModo.codigo === 404 && r.ajena.codigo === 404 && r.formato.codigo === 400, `P6: otra clave (real), un pago sin pedido o un formato raro no valen (${r.otroModo.codigo}, ${r.ajena.codigo}, ${r.formato.codigo})`);

  ok(r.yaPagado.cuerpo?.pagado === true && r.sesionesTrasPagado === 0, "P7: un pedido ya pagado no abre otro cobro");

  ok(r.avisoSinSecreto.codigo === 503 && r.avisoFirmaMala.codigo === 400 && r.avisoViejo.codigo === 400 && r.avisoCambiado.codigo === 400 && r.fila107SinAviso.pago_estado === "iniciado", `P8: sin secreto 503; firma mala, vieja o de otro cuerpo 400 y nada apuntado (${r.avisoSinSecreto.codigo}, ${r.avisoFirmaMala.codigo}, ${r.avisoViejo.codigo}, ${r.avisoCambiado.codigo})`);
  ok(r.avisoBueno.codigo === 200 && r.fila107.pago_estado === "pagado" && r.fila107.pago_referencia === "pi_3Aviso456" && r.fila107.pagado_eur === 20, `P8: un aviso bien firmado apunta el pago aunque el cliente no vuelva (${r.avisoBueno.codigo} ${r.fila107.pago_estado})`);
  ok(r.avisoAjeno.codigo === 200, "P8: un aviso de un pago que no es de un pedido se da por recibido");

  ok(r.limite.codigo === 429, `P9: pasado el límite por IP, 429 (${r.limite.codigo})`);

  // CONTROL: cada defensa quitada en una copia de la función; la batería tiene que notarlo.
  const fuente = readFileSync("api/pago.ts", "utf8");
  const carpeta = mkdtempSync(join(tmpdir(), "vz-pago-"));
  mkdirSync(join(carpeta, "api"));
  symlinkSync(resolve("node_modules"), join(carpeta, "node_modules"));
  const mutaciones = [
    ["administrador", 'return data?.role === "admin";', "return true;", (m) => m.clienteCrea.codigo === 200, "un cliente abre el pago con la clave de prueba (P2)"],
    ["pagado", 's.payment_status === "paid" &&', "", (m) => m.confirmarSinCobrar.cuerpo?.pagado === true, "una sesión terminada sin cobrar se apunta como pagada (P6)"],
    ["firma", "if (!(await firmaDeStripeValida(secreto, crudo, firma))) throw", "if (false) throw", (m) => m.avisoFirmaMala.codigo === 200, "un aviso mal firmado se acepta (P8)"],
    ["dueño", "if (!p || !suyo) throw", "if (!p) throw", (m) => m.ajeno.codigo === 200, "se abre el pago del pedido de otra persona (P3)"],
  ];
  for (const [nombre, buscar, poner, detecta, texto] of mutaciones) {
    const roto = fuente.replace(buscar, poner);
    ok(roto !== fuente, `(control) se ha podido quitar la comprobación «${nombre}» en la copia de prueba`);
    const archivo = join(carpeta, "api", `pago-control-${mutaciones.findIndex((x) => x[0] === nombre)}.ts`);
    writeFileSync(archivo, roto);
    const m = await bateria((await import(pathToFileURL(archivo).href)).default);
    ok(detecta(m), `(control) sin la comprobación «${nombre}», ${texto}: la prueba SÍ lo detecta`);
  }
} catch (e) {
  fallos.push(`la prueba se cortó: ${String(e.stack ?? e).slice(0, 900)}`);
} finally {
  globalThis.fetch = original;
}

for (const f of fallos) console.log(`FALLO ${f}`);
console.log(fallos.length ? `${fallos.length} fallos` : "todo bien");
process.exit(fallos.length ? 1 : 0);
