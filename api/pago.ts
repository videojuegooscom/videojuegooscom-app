/**
 * api/pago.ts
 *
 * Qué hace: pago con tarjeta de los pedidos de la tienda con Stripe Checkout (la página de pago segura de Stripe). El
 * cliente escribe su tarjeta en la página de Stripe: la tienda nunca ve ni guarda los datos de la tarjeta.
 *
 * Por qué así (dueño, 2026-11-05: «clave puesta y empieza Stripe»):
 * - El importe sale de la base de datos (pedidos.total_eur: artículos + envío, calculados al guardar el pedido), nunca
 *   del navegador. A Stripe solo se le pasa el número del pedido y su importe.
 * - «Pagado» solo lo apunta el servidor después de preguntárselo a Stripe (la sesión de pago está «complete» y «paid»,
 *   en euros y de ese pedido); la vuelta del navegador con ?pago=ok no basta. Si el cliente cierra la página antes de
 *   volver, lo apunta el aviso de Stripe (webhook), si está configurado.
 * - Un pedido nunca tiene dos cobros abiertos: si ya hay una sesión abierta con el mismo importe se reutiliza (dos
 *   toques, volver atrás); si el importe cambió, la antigua se cierra antes de abrir otra.
 * - Con la clave de PRUEBA de Stripe (sk_test_/rk_test_, no cobra) solo puede pagar el administrador: así se prueba en
 *   la tienda real sin que los clientes vean un pago que no cobra. Con la clave REAL, todos, pero solo cuando la
 *   política de privacidad ya nombra a Stripe (migración 20261105121000_politicas_pago_tarjeta: primero la privacidad).
 * - Sin las columnas de pago (migración 20261105120000_pagos_tarjeta sin aplicar) no se ofrece el pago.
 *
 * Peticiones:
 * - GET /api/pago (con «Authorization: Bearer <sesión>» si la hay) → { ok, disponible, modo: "prueba" | "real" | null }.
 * - POST { accion: "crear", numero, clave? } → { ok, url } (la página de Stripe) o { ok, pagado: true } si ya está
 *   pagado. El pedido tiene que ser de quien llama: de su cuenta (sesión) o con la clave de la compra, que solo tiene el
 *   navegador que lo hizo (pedidos.clave_unica). Si no, 404 (no se dice si existe).
 * - POST { accion: "confirmar", sesion: "cs_…" } → { ok, pagado, numero }.
 * - POST de Stripe con la cabecera Stripe-Signature (checkout.session.completed): firma comprobada en tiempo
 *   constante y con 5 minutos de margen → 200.
 * Límites por IP (consumir_limite, compartido; en memoria con cupos reducidos si no responde): 10 pagos nuevos y 30
 * confirmaciones cada 10 minutos.
 *
 * Variables de entorno (Vercel → Settings → Environment Variables, solo servidor):
 * - STRIPE_SECRET_KEY: la clave secreta de Stripe (la pone el dueño; Claude no la ve). Sin ella no hay pago con tarjeta.
 * - STRIPE_WEBHOOK_SECRET (opcional): el secreto del aviso de Stripe (whsec_…).
 * - EXPO_PUBLIC_SUPABASE_URL y SUPABASE_CLAVE_SERVIDOR: leer el pedido y apuntar el pago.
 *
 * Conectado con: app/checkout.tsx («Pagar con tarjeta» y la vuelta de Stripe), app/admin/pedidos.tsx (pagados con
 * tarjeta), app/admin/analytics.tsx (pago_tarjeta y pago_tarjeta_ok), pruebas/pago-api.mjs.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const STRIPE = "https://api.stripe.com/v1";
const WEB = "https://videojuegoszaragoza.com";
const ESPERA_STRIPE_MS = 8000;
const MAX_CUERPO = 128 * 1024;
// Stripe no cobra menos de 0,50 €; y un pedido de la tienda no pasa de 20.000 €.
const MINIMO_CENTIMOS = 50;
const MAXIMO_CENTIMOS = 2_000_000;
// «Entregado» ya cuenta como pagado (dueño, 2026-11-03) y un pedido cancelado no se cobra.
const ESTADOS_PAGABLES = ["pendiente", "confirmado", "preparado", "enviado"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESION_RE = /^cs_(test|live)_[A-Za-z0-9]{8,240}$/;
const COLUMNAS_PEDIDO = "id,numero,estado,total_eur,user_id,clave_unica,pago_estado,pago_sesion";
const codificar = new TextEncoder();

type Modo = "prueba" | "real";

type FilaPedido = {
  id: string;
  numero: number;
  estado: string;
  total_eur: number | string;
  user_id: string | null;
  clave_unica: string | null;
  pago_estado: string | null;
  pago_sesion: string | null;
};

type SesionStripe = {
  id: string;
  status?: string;
  payment_status?: string;
  amount_total?: number | null;
  currency?: string;
  url?: string | null;
  livemode?: boolean;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
  payment_intent?: string | { id?: string } | null;
};

class Rechazo extends Error {
  http: number;
  constructor(http: number, motivo: string) {
    super(motivo);
    this.http = http;
  }
}

function responder(res: any, http: number, cuerpo: Record<string, unknown>) {
  res.setHeader("Cache-Control", "no-store");
  res.status(http).json(cuerpo);
}

function modoDeLaClave(clave: string): Modo | null {
  if (/^(sk|rk)_test_\S+$/.test(clave)) return "prueba";
  if (/^(sk|rk)_live_\S+$/.test(clave)) return "real";
  return null;
}

// --- Límite de peticiones COMPARTIDO entre instancias --------------------------------------------
// (El mismo bloque está en api/interaccion.ts, api/blue-ia.ts y api/escaparate-retorno.ts: cada función es autónoma y
// no comparte archivos.)
type LimiteCuenta = { max: number; ventanaSegundos: number };

const LIMITE_CREAR: LimiteCuenta = { max: 10, ventanaSegundos: 600 };
const LIMITE_CONFIRMAR: LimiteCuenta = { max: 30, ventanaSegundos: 600 };

// La IP real del visitante: Vercel la pone en x-vercel-forwarded-for y no se puede falsear desde fuera.
function ipDelCliente(req: any): string {
  for (const nombre of ["x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"]) {
    const v = req.headers?.[nombre];
    const primero = Array.isArray(v) ? v[0] : v;
    if (typeof primero === "string" && primero.trim()) return primero.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "desconocida";
}

// «Cubo» de la IP: hash de IP + día, módulo 4.096. No se guarda la IP real.
async function cuboDeIp(ip: string): Promise<string> {
  const dia = new Date().toISOString().slice(0, 10);
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", codificar.encode(`${ip}|${dia}`)));
  return String(((h[0] << 8) | h[1]) % 4096);
}

const contadoresMemoria = new Map<string, { inicio: number; n: number }>();
function consumirEnMemoria(clave: string, { max, ventanaSegundos }: LimiteCuenta): { permitido: boolean } {
  const ahora = Date.now();
  const actual = contadoresMemoria.get(clave);
  const c = actual && ahora - actual.inicio < ventanaSegundos * 1000 ? actual : { inicio: ahora, n: 0 };
  c.n += 1;
  contadoresMemoria.set(clave, c);
  if (contadoresMemoria.size > 2000) {
    for (const [k, v] of contadoresMemoria) if (ahora - v.inicio > 3_600_000) contadoresMemoria.delete(k);
  }
  return { permitido: c.n <= max };
}

// Sin límite compartido (no responde en 2 s o falla): cupos a la cuarta parte en esta instancia y 30 s sin reintentar.
const ESPERA_LIMITE_MS = 2000;
const PAUSA_TRAS_FALLO_MS = 30_000;
let sinLimiteCompartidoHasta = 0;

async function consumirLimite(supabase: SupabaseClient, clave: string, limite: LimiteCuenta): Promise<{ permitido: boolean }> {
  if (Date.now() >= sinLimiteCompartidoHasta) {
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    try {
      const esperar = new Promise<never>((_, rechazar) => {
        temporizador = setTimeout(() => rechazar(new Error("el límite compartido tardó demasiado")), ESPERA_LIMITE_MS);
      });
      const { data, error } = await Promise.race([
        supabase.rpc("consumir_limite", { p_clave: clave, p_max: limite.max, p_ventana_segundos: limite.ventanaSegundos }),
        esperar,
      ]);
      if (!error && data && typeof data === "object") return { permitido: (data as { permitido?: boolean }).permitido === true };
    } catch {
      // sin límite compartido: modo degradado
    } finally {
      clearTimeout(temporizador);
    }
    const pausa = Number(process.env.LIMITE_PAUSA_MS);
    sinLimiteCompartidoHasta = Date.now() + (Number.isFinite(pausa) && pausa >= 0 ? pausa : PAUSA_TRAS_FALLO_MS);
  }
  return consumirEnMemoria(clave, { max: Math.max(1, Math.floor(limite.max / 4)), ventanaSegundos: limite.ventanaSegundos });
}

// ¿Quién pregunta? Con un token de sesión válido, el id del usuario; si no, null (un token falso nunca da identidad).
async function usuarioDeLaPeticion(supabase: SupabaseClient, req: any): Promise<string | null> {
  const cab = req.headers?.authorization;
  const valor = Array.isArray(cab) ? cab[0] : cab;
  if (typeof valor !== "string" || !/^Bearer\s+\S+$/i.test(valor.trim())) return null;
  try {
    const { data, error } = await supabase.auth.getUser(valor.trim().replace(/^Bearer\s+/i, ""));
    return !error && data?.user?.id ? data.user.id : null;
  } catch {
    return null;
  }
}

// --- cuerpo y firma de Stripe --------------------------------------------------------------------

async function leerCuerpo(req: any): Promise<Uint8Array> {
  // Bytes EXACTOS recibidos (la firma de Stripe se calcula sobre ellos). Se leen del flujo SIN tocar req.body: en
  // Vercel, req.body convierte el JSON y perdería el texto original.
  if (typeof req?.[Symbol.asyncIterator] !== "function") {
    return codificar.encode(typeof req?.body === "string" ? req.body : req?.body ? JSON.stringify(req.body) : "");
  }
  const trozos: Uint8Array[] = [];
  let total = 0;
  for await (const trozo of req) {
    const b: Uint8Array = typeof trozo === "string" ? codificar.encode(trozo) : new Uint8Array(trozo);
    total += b.length;
    if (total > MAX_CUERPO) throw new Rechazo(413, "cuerpo demasiado grande");
    trozos.push(b);
  }
  const todo = new Uint8Array(total);
  let pos = 0;
  for (const t of trozos) {
    todo.set(t, pos);
    pos += t.length;
  }
  return todo;
}

function cabecera(req: any, nombre: string): string {
  const v = req.headers?.[nombre];
  return typeof v === "string" ? v.trim() : Array.isArray(v) ? String(v[0] ?? "").trim() : "";
}

// Stripe-Signature: «t=<segundos>,v1=<hex>[,v1=<hex>…]». HMAC-SHA256 de «t.cuerpo» con el secreto del aviso, comparado
// en tiempo constante, y como mucho 5 minutos de diferencia (un aviso viejo repetido no vale).
async function firmaDeStripeValida(secreto: string, cuerpo: Uint8Array, firma: string): Promise<boolean> {
  const partes = firma.split(",").map((p) => p.trim().split("="));
  const t = partes.find(([k]) => k === "t")?.[1] ?? "";
  const firmas = partes.filter(([k, v]) => k === "v1" && /^[0-9a-f]{64}$/.test(v ?? "")).map(([, v]) => v);
  if (!/^\d{10}$/.test(t) || firmas.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const prefijo = codificar.encode(`${t}.`);
  const firmado = new Uint8Array(prefijo.length + cuerpo.length);
  firmado.set(prefijo, 0);
  firmado.set(cuerpo, prefijo.length);
  const clave = await crypto.subtle.importKey("raw", codificar.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const esperada = new Uint8Array(await crypto.subtle.sign("HMAC", clave, firmado));
  let alguna = false;
  for (const hex of firmas) {
    // Se recorre siempre entera, sin salir al primer fallo.
    let diferencia = 0;
    for (let i = 0; i < esperada.length; i++) diferencia |= esperada[i] ^ parseInt(hex.substr(i * 2, 2), 16);
    if (diferencia === 0) alguna = true;
  }
  return alguna;
}

// --- Stripe ----------------------------------------------------------------------------------------

async function llamarStripe(
  clave: string,
  metodo: "GET" | "POST",
  ruta: string,
  campos?: Record<string, string>,
  idempotencia?: string
): Promise<{ http: number; datos: any }> {
  const cabeceras: Record<string, string> = { Authorization: `Bearer ${clave}` };
  if (metodo === "POST") cabeceras["Content-Type"] = "application/x-www-form-urlencoded";
  if (idempotencia) cabeceras["Idempotency-Key"] = idempotencia;
  let r: Response;
  try {
    r = await fetch(`${STRIPE}${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: metodo === "POST" ? new URLSearchParams(campos ?? {}).toString() : undefined,
      signal: AbortSignal.timeout(ESPERA_STRIPE_MS),
    });
  } catch {
    throw new Rechazo(502, "el proveedor de pagos no responde");
  }
  const datos = await r.json().catch(() => null);
  return { http: r.status, datos };
}

async function sesionDeStripe(clave: string, id: string): Promise<SesionStripe | null> {
  const r = await llamarStripe(clave, "GET", `/checkout/sessions/${encodeURIComponent(id)}`);
  if (r.http === 404) return null;
  if (r.http !== 200 || !r.datos || typeof r.datos.id !== "string") {
    console.error("pago: Stripe no devolvió la sesión", r.http, r.datos?.error?.code ?? "");
    throw new Rechazo(502, "el proveedor de pagos no responde");
  }
  return r.datos as SesionStripe;
}

// Solo vuelve a la propia tienda (o a su vista previa de Vercel); cualquier otra cosa, a la web pública.
function origenDe(req: any): string {
  const host = (cabecera(req, "x-forwarded-host") || cabecera(req, "host")).split(",")[0].trim().toLowerCase();
  if (/^(www\.)?videojuegoszaragoza\.com$/.test(host) || /^[a-z0-9-]{1,80}\.vercel\.app$/.test(host)) return `https://${host}`;
  return WEB;
}

function faltanColumnas(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === "42703" || /pago_estado|pago_sesion|pago_modo|pago_referencia|pagado_eur|pagado_en/.test(String(error.message ?? "")));
}

// ¿Puede pagar con tarjeta quien pregunta? Hacen falta las columnas de pago; con la clave de prueba, ser administrador;
// con la real, que la política de privacidad ya nombre a Stripe.
async function pagoDisponible(supabase: SupabaseClient, modo: Modo, uid: string | null): Promise<boolean> {
  const { error } = await supabase.from("pedidos").select("pago_estado").limit(1);
  if (error) return false;
  if (modo === "prueba") {
    if (!uid) return false;
    const { data } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle<{ role: string }>();
    return data?.role === "admin";
  }
  const { data } = await supabase.from("policy_pages").select("sections").eq("slug", "privacidad").maybeSingle<{ sections: unknown }>();
  return JSON.stringify(data?.sections ?? "").includes("Stripe");
}

async function marcarPagado(supabase: SupabaseClient, p: Pick<FilaPedido, "id" | "numero" | "pago_estado" | "pago_sesion">, s: SesionStripe, modo: Modo) {
  if (p.pago_estado === "pagado") {
    if (p.pago_sesion !== s.id) console.error(`pago: el pedido ${p.numero} ya estaba pagado y llega otro cobro (${s.id}): devuélvelo desde Stripe`);
    return;
  }
  const referencia = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null;
  const { error } = await supabase
    .from("pedidos")
    .update({
      pago_estado: "pagado",
      pago_modo: modo,
      pago_sesion: s.id,
      pago_referencia: referencia,
      pagado_eur: Number(s.amount_total ?? 0) / 100,
      pagado_en: new Date().toISOString(),
    })
    .eq("id", p.id)
    // Si a la vez llegan la vuelta del navegador y el aviso de Stripe, solo apunta el primero.
    .or("pago_estado.is.null,pago_estado.neq.pagado");
  if (error) {
    console.error("pago: no se pudo apuntar el pago del pedido", p.numero, error.code ?? "");
    throw new Rechazo(500, "no se pudo apuntar el pago");
  }
}

async function crearPago(supabase: SupabaseClient, clave: string, modo: Modo, req: any, b: Record<string, unknown>) {
  const numero = Number(b.numero);
  if (!Number.isInteger(numero) || numero <= 0 || numero > 1e12) throw new Rechazo(400, "pedido no válido");
  const claveCompra = typeof b.clave === "string" && UUID_RE.test(b.clave) ? b.clave.toLowerCase() : null;
  const uid = await usuarioDeLaPeticion(supabase, req);
  if (!(await pagoDisponible(supabase, modo, uid))) throw new Rechazo(403, "el pago con tarjeta no está disponible");

  const { data: p, error } = await supabase.from("pedidos").select(COLUMNAS_PEDIDO).eq("numero", numero).maybeSingle<FilaPedido>();
  if (error) throw faltanColumnas(error) ? new Rechazo(503, "falta activar el pago con tarjeta") : new Rechazo(500, "no se pudo leer el pedido");
  const suyo = !!p && ((!!claveCompra && String(p.clave_unica ?? "").toLowerCase() === claveCompra) || (!!uid && p.user_id === uid));
  if (!p || !suyo) throw new Rechazo(404, "pedido no encontrado");
  if (p.pago_estado === "pagado") return { ok: true, pagado: true, numero };
  if (!ESTADOS_PAGABLES.includes(p.estado)) throw new Rechazo(409, "este pedido ya no se puede pagar con tarjeta");
  const centimos = Math.round(Number(p.total_eur) * 100);
  if (!Number.isFinite(centimos) || centimos < MINIMO_CENTIMOS || centimos > MAXIMO_CENTIMOS) {
    throw new Rechazo(409, "este importe no se puede pagar con tarjeta");
  }

  // ¿Ya hay un pago abierto de este pedido? Con el mismo importe se reutiliza; si el importe cambió, se cierra.
  if (p.pago_sesion) {
    const previa = await sesionDeStripe(clave, p.pago_sesion);
    if (previa && previa.metadata?.pedido_id === p.id) {
      if (previa.status === "complete" && previa.payment_status === "paid") {
        await marcarPagado(supabase, p, previa, modo);
        return { ok: true, pagado: true, numero };
      }
      if (previa.status === "open" && previa.amount_total === centimos && previa.url) return { ok: true, url: previa.url };
      if (previa.status === "open") await llamarStripe(clave, "POST", `/checkout/sessions/${encodeURIComponent(previa.id)}/expire`);
    }
  }

  // Misma petición en el mismo minuto (dos toques a la vez) = la misma sesión: la clave de idempotencia y los datos no
  // cambian dentro del minuto. Caduca a los 30-31 minutos (el mínimo de Stripe).
  const minuto = Math.floor(Date.now() / 60_000);
  const origen = origenDe(req);
  const campos: Record<string, string> = {
    mode: "payment",
    locale: "es",
    submit_type: "pay",
    "payment_method_types[0]": "card",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(centimos),
    "line_items[0][price_data][product_data][name]": `Pedido nº ${p.numero} · VideojuegosZaragoza`,
    client_reference_id: p.id,
    "metadata[pedido_id]": p.id,
    "metadata[numero]": String(p.numero),
    "payment_intent_data[description]": `Pedido nº ${p.numero}`,
    "payment_intent_data[metadata][pedido_id]": p.id,
    "payment_intent_data[metadata][numero]": String(p.numero),
    success_url: `${origen}/checkout?pago=ok&sesion={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origen}/checkout?pago=cancelado&pedido=${p.numero}`,
    expires_at: String((minuto + 31) * 60),
  };
  const r = await llamarStripe(clave, "POST", "/checkout/sessions", campos, `vz-pago-${p.id}-${centimos}-${minuto}`);
  if (r.http !== 200 || typeof r.datos?.id !== "string" || typeof r.datos?.url !== "string") {
    console.error("pago: Stripe no abrió el pago", r.http, r.datos?.error?.code ?? "", String(r.datos?.error?.message ?? "").slice(0, 200));
    throw new Rechazo(502, "no se pudo abrir el pago");
  }
  const { error: errApunte } = await supabase
    .from("pedidos")
    .update({ pago_estado: "iniciado", pago_modo: modo, pago_sesion: r.datos.id, pago_iniciado_en: new Date().toISOString() })
    .eq("id", p.id)
    .or("pago_estado.is.null,pago_estado.neq.pagado");
  // Sin el apunte el pago sigue valiendo (la sesión lleva el pedido); solo se pierde reutilizarla.
  if (errApunte) console.error("pago: no se pudo apuntar el pago empezado del pedido", p.numero, errApunte.code ?? "");
  return { ok: true, url: r.datos.url as string };
}

async function confirmarPago(supabase: SupabaseClient, clave: string, modo: Modo, sesionId: string) {
  const s = await sesionDeStripe(clave, sesionId);
  const pedidoId = s?.metadata?.pedido_id ?? "";
  if (!s || !UUID_RE.test(pedidoId) || s.client_reference_id !== pedidoId || s.livemode !== (modo === "real")) {
    throw new Rechazo(404, "pago no encontrado");
  }
  const { data: p, error } = await supabase
    .from("pedidos")
    .select("id,numero,pago_estado,pago_sesion")
    .eq("id", pedidoId)
    .maybeSingle<Pick<FilaPedido, "id" | "numero" | "pago_estado" | "pago_sesion">>();
  if (error) throw faltanColumnas(error) ? new Rechazo(503, "falta activar el pago con tarjeta") : new Rechazo(500, "no se pudo leer el pedido");
  if (!p) throw new Rechazo(404, "pago no encontrado");
  const pagado =
    s.status === "complete" &&
    s.payment_status === "paid" &&
    s.currency === "eur" &&
    Number.isInteger(s.amount_total) &&
    Number(s.amount_total) > 0;
  if (pagado) await marcarPagado(supabase, p, s, modo);
  return { pagado, numero: p.numero };
}

export default async function handler(req: any, res: any) {
  try {
    const clave = String(process.env.STRIPE_SECRET_KEY ?? "").trim();
    const modo = modoDeLaClave(clave);
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const claveServidor = process.env.SUPABASE_CLAVE_SERVIDOR;
    const supabase =
      supabaseUrl && claveServidor ? createClient(supabaseUrl, claveServidor, { auth: { persistSession: false, autoRefreshToken: false } }) : null;

    if (req.method === "GET") {
      if (!modo || !supabase) {
        responder(res, 200, { ok: true, disponible: false, modo: null });
        return;
      }
      // La sesión solo hace falta con la clave de prueba (para saber si es el administrador).
      const uid = modo === "prueba" ? await usuarioDeLaPeticion(supabase, req) : null;
      const disponible = await pagoDisponible(supabase, modo, uid);
      responder(res, 200, { ok: true, disponible, modo: disponible ? modo : null });
      return;
    }
    if (req.method !== "POST") throw new Rechazo(405, "método no permitido");
    if (!modo || !supabase) throw new Rechazo(503, "el pago con tarjeta no está configurado");

    const crudo = await leerCuerpo(req);
    const texto = new TextDecoder("utf-8").decode(crudo);

    // Aviso de Stripe (webhook): firmado con el secreto del aviso.
    const firma = cabecera(req, "stripe-signature");
    if (firma) {
      const secreto = String(process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();
      if (!secreto) throw new Rechazo(503, "aviso de Stripe sin configurar");
      if (!(await firmaDeStripeValida(secreto, crudo, firma))) throw new Rechazo(400, "firma no válida");
      let evento: any = null;
      try {
        evento = JSON.parse(texto);
      } catch {
        throw new Rechazo(400, "aviso no válido");
      }
      const sesion = evento?.data?.object?.id;
      const deCobro = evento?.type === "checkout.session.completed" || evento?.type === "checkout.session.async_payment_succeeded";
      if (deCobro && typeof sesion === "string" && SESION_RE.test(sesion) && evento?.livemode === (modo === "real")) {
        try {
          await confirmarPago(supabase, clave, modo, sesion);
        } catch (e) {
          // Un pago que no es de un pedido de la tienda se da por recibido (si no, Stripe lo repetiría días).
          if (!(e instanceof Rechazo && e.http === 404)) throw e;
        }
      }
      responder(res, 200, { ok: true, recibido: true });
      return;
    }

    let b: Record<string, unknown> = {};
    try {
      const j = texto.trim() ? JSON.parse(texto) : {};
      if (j && typeof j === "object" && !Array.isArray(j)) b = j as Record<string, unknown>;
    } catch {
      throw new Rechazo(400, "cuerpo no válido");
    }
    const cubo = await cuboDeIp(ipDelCliente(req));

    if (b.accion === "crear") {
      if (!(await consumirLimite(supabase, `pago:crear:${cubo}`, LIMITE_CREAR)).permitido) throw new Rechazo(429, "demasiados intentos; espera unos minutos");
      responder(res, 200, await crearPago(supabase, clave, modo, req, b));
      return;
    }
    if (b.accion === "confirmar") {
      const sesion = typeof b.sesion === "string" && SESION_RE.test(b.sesion) ? b.sesion : null;
      if (!sesion) throw new Rechazo(400, "pago no válido");
      if (!(await consumirLimite(supabase, `pago:confirmar:${cubo}`, LIMITE_CONFIRMAR)).permitido) throw new Rechazo(429, "demasiados intentos; espera unos minutos");
      responder(res, 200, { ok: true, ...(await confirmarPago(supabase, clave, modo, sesion)) });
      return;
    }
    throw new Rechazo(400, "acción no válida");
  } catch (e: unknown) {
    const r = e instanceof Rechazo ? e : new Rechazo(500, "error interno");
    if (!(e instanceof Rechazo)) console.error("pago: error inesperado", e);
    responder(res, r.http, { ok: false, error: r.message });
  }
}
