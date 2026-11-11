/**
 * api/pago.ts
 *
 * Qué hace: pago con tarjeta de los pedidos de la tienda con Stripe Checkout (la página de pago segura de Stripe). El
 * cliente escribe su tarjeta en la página de Stripe: la tienda nunca ve ni guarda los datos de la tarjeta. Desde el
 * 2026-11-06 también Klarna (pagar a plazos), en la misma página; en pantalla se llama «pago online».
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
 * - GET /api/pago (con «Authorization: Bearer <sesión>» si la hay) → { ok, disponible, modo: "prueba" | "real" | null,
 *   klarna } (klarna: si la página de pago también ofrece Klarna).
 * - POST { accion: "crear", numero, clave? } → { ok, url } (la página de Stripe) o { ok, pagado: true } si ya está
 *   pagado. El pedido tiene que ser de quien llama: de su cuenta (sesión) o con la clave de la compra, que solo tiene el
 *   navegador que lo hizo (pedidos.clave_unica). Si no, 404 (no se dice si existe).
 * - POST { accion: "confirmar", sesion: "cs_…" } → { ok, pagado, numero }.
 * - POST { accion: "devolver", numero } (SOLO el administrador, dueño 2026-11-06) → { ok, devuelto_eur }: devuelve en
 *   Stripe el pago entero de ese pedido (una sola vez: clave de idempotencia por pedido) y lo apunta (migración
 *   20261106100000_pagos_devolucion). No cancela el pedido: eso es otro botón de Pedidos.
 * - POST de Stripe con la cabecera Stripe-Signature (checkout.session.completed; charge.refunded, si se devuelve desde
 *   el propio Stripe): firma comprobada en tiempo constante y con 5 minutos de margen → 200.
 * - POST { accion: "crear", solicitud: "<uuid>", concepto: "etiqueta" | "reparacion" } (reparación por envío, parte 2,
 *   dueño 2026-11-11; migración 20261111130000_reparacion_envio_parte2). Va AQUÍ y no en un archivo nuevo porque Vercel
 *   gratis admite como mucho 12 funciones en api/ y ya hay 12. Con sesión y solo sobre una solicitud SUYA
 *   (service_requests.customer_user_id), con la MISMA regla de quién puede pagar con tarjeta que los pedidos
 *   (pagoDisponible: con la clave de prueba, solo el administrador). El importe lo pone la base de datos: «etiqueta» =
 *   etiqueta_eur (sin pagar aún); «reparacion» = presupuesto_eur con la reparación «listo» y el presupuesto aceptado o,
 *   si no tiene arreglo y eligió «Devuélvemelo», vuelta_eur. → { ok, url } o { ok, pagado: true }. El último cobro
 *   abierto se guarda en stripe_sesion (se reutiliza o se cierra, como en los pedidos). La confirmación («confirmar» y el
 *   aviso de Stripe) reconoce la solicitud por los metadatos de la sesión, comprueba que lo cobrado es el importe de la
 *   base de datos y apunta etiqueta_pagada_en (+ etiqueta_pago_modo) o pago_estado = 'pagado' (pagado_eur lo pone el
 *   disparador de la base de datos). Vuelve a Perfil → Mis seguimientos (?pago=ok&sesion=…).
 * Límites por IP (consumir_limite, compartido; en memoria con cupos reducidos si no responde): 10 pagos nuevos y 30
 * confirmaciones cada 10 minutos.
 *
 * Variables de entorno (Vercel → Settings → Environment Variables, solo servidor):
 * - STRIPE_SECRET_KEY: la clave secreta de Stripe (la pone el dueño; Claude no la ve). Sin ella no hay pago con tarjeta.
 * - STRIPE_WEBHOOK_SECRET (opcional): el secreto del aviso de Stripe (whsec_…).
 * - EXPO_PUBLIC_SUPABASE_URL y SUPABASE_CLAVE_SERVIDOR: leer el pedido y apuntar el pago.
 *
 * Conectado con: app/checkout.tsx («Pagar con tarjeta» y la vuelta de Stripe), app/admin/pedidos.tsx (pagados con
 * tarjeta), app/admin/analytics.tsx (pago_tarjeta y pago_tarjeta_ok), pruebas/pago-api.mjs; reparación por envío:
 * app/(tabs)/perfil.tsx («Pagar la etiqueta», «Pagar y enviármelo», «Devuélvemelo»), app/admin/services.tsx.
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
// (El mismo bloque está en api/interaccion.ts, api/blue-ia.ts, api/escaparate-retorno.ts y api/factura.ts: cada función es autónoma y
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

// Klarna (pagar a plazos, dueño 2026-11-06) solo cuando la política de privacidad ya lo nombra: si el cliente lo elige,
// sus datos los trata Klarna (migración 20261106150000_politicas_klarna_envios). Primero la privacidad.
async function klarnaDisponible(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.from("policy_pages").select("sections").eq("slug", "privacidad").maybeSingle<{ sections: unknown }>();
  return JSON.stringify(data?.sections ?? "").includes("Klarna");
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
  await despertarVeoaura();
}

// Pagado con tarjeta cuenta como pagado para VeoAura (dueño, 2026-11-06): se despierta el puente de vuelta para que, si
// el pedido lleva artículos suyos, salga ya su aviso (si no, lo hace la vuelta diaria). Nunca rompe el pago.
async function despertarVeoaura() {
  try {
    await fetch(`${WEB}/api/escaparate-retorno`, { method: "POST", signal: AbortSignal.timeout(3000) });
  } catch {
    // lo hará la vuelta diaria del cron
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
  const conKlarna = await klarnaDisponible(supabase);
  const campos: Record<string, string> = {
    mode: "payment",
    locale: "es",
    submit_type: "pay",
    // Tarjeta (con Apple Pay y Link) y, si la privacidad ya lo nombra, Klarna, que permite pagar a plazos (dueño,
    // 2026-11-06). Klarna confirma al momento, como la tarjeta: «pagado» sigue siendo complete + paid preguntado a Stripe.
    "payment_method_types[0]": "card",
    ...(conKlarna ? { "payment_method_types[1]": "klarna" } : {}),
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

// --- Reparación por envío (parte 2): la etiqueta y la reparación (o la vuelta) de una solicitud ---------------------

type ConceptoSolicitud = "etiqueta" | "reparacion";

type FilaSolicitud = {
  id: string;
  customer_user_id: string | null;
  codigo_seguimiento: string | null;
  service_title: string | null;
  entrega_modo: string | null;
  seguimiento: string | null;
  etiqueta_eur: number | string | null;
  etiqueta_pagada_en: string | null;
  presupuesto_eur: number | string | null;
  presupuesto_aceptado_en: string | null;
  pago_estado: string | null;
  diagnostico_resultado: string | null;
  sin_arreglo_eleccion: string | null;
  vuelta_eur: number | string | null;
  stripe_sesion: string | null;
};

const COLUMNAS_SOLICITUD =
  "id,customer_user_id,codigo_seguimiento,service_title,entrega_modo,seguimiento,etiqueta_eur,etiqueta_pagada_en,presupuesto_eur,presupuesto_aceptado_en,pago_estado,diagnostico_resultado,sin_arreglo_eleccion,vuelta_eur,stripe_sesion";

// Lo que hay que cobrar de una solicitud por ese concepto, en céntimos, sacado de la base de datos (null = nada que cobrar
// ahora), y si ya está pagado.
function importeSolicitud(f: FilaSolicitud, concepto: ConceptoSolicitud): { centimos: number | null; pagado: boolean } {
  const cts = (v: unknown) => {
    const n = Math.round(Number(v) * 100);
    return v === null || v === undefined || !Number.isFinite(n) ? null : n;
  };
  if (concepto === "etiqueta") {
    if (f.etiqueta_pagada_en) return { centimos: cts(f.etiqueta_eur), pagado: true };
    if (f.entrega_modo !== "correos" || f.seguimiento === "cancelado") return { centimos: null, pagado: false };
    return { centimos: cts(f.etiqueta_eur), pagado: false };
  }
  if (f.diagnostico_resultado === "sin_arreglo") {
    const c = f.sin_arreglo_eleccion === "devolver" ? cts(f.vuelta_eur) : null;
    return { centimos: c, pagado: f.pago_estado === "pagado" };
  }
  const listo = f.seguimiento === "listo" && !!f.presupuesto_aceptado_en;
  return { centimos: listo || f.pago_estado === "pagado" ? cts(f.presupuesto_eur) : null, pagado: f.pago_estado === "pagado" };
}

async function leerSolicitud(supabase: SupabaseClient, id: string): Promise<FilaSolicitud | null> {
  const { data, error } = await supabase.from("service_requests").select(COLUMNAS_SOLICITUD).eq("id", id).maybeSingle<FilaSolicitud>();
  if (error) {
    // Sin la migración de la parte 2 (columnas que faltan) no se ofrece el pago.
    if (error.code === "42703" || /stripe_sesion|diagnostico_resultado|vuelta_eur|sin_arreglo/.test(String(error.message ?? ""))) {
      throw new Rechazo(503, "falta activar el pago de las reparaciones");
    }
    throw new Rechazo(500, "no se pudo leer la solicitud");
  }
  return data ?? null;
}

async function marcarSolicitudPagada(supabase: SupabaseClient, f: FilaSolicitud, concepto: ConceptoSolicitud, s: SesionStripe, modo: Modo) {
  const forma = modo === "real" ? "tarjeta" : "prueba";
  const ahora = new Date().toISOString();
  const q =
    concepto === "etiqueta"
      ? supabase.from("service_requests").update({ etiqueta_pagada_en: ahora, etiqueta_pago_modo: forma, stripe_sesion: s.id }).eq("id", f.id).is("etiqueta_pagada_en", null)
      : // pagado_eur lo pone el disparador de la base de datos (el presupuesto o la vuelta).
        supabase.from("service_requests").update({ pago_estado: "pagado", pago_modo: forma, pagado_en: ahora, stripe_sesion: s.id }).eq("id", f.id).or("pago_estado.is.null,pago_estado.neq.pagado");
  const { error } = await q;
  if (error) {
    console.error("pago: no se pudo apuntar el pago de la solicitud", f.codigo_seguimiento ?? "", concepto, error.code ?? "");
    throw new Rechazo(500, "no se pudo apuntar el pago");
  }
}

async function crearPagoSolicitud(supabase: SupabaseClient, clave: string, modo: Modo, req: any, b: Record<string, unknown>) {
  const id = typeof b.solicitud === "string" && UUID_RE.test(b.solicitud) ? b.solicitud.toLowerCase() : null;
  const concepto: ConceptoSolicitud | null = b.concepto === "etiqueta" || b.concepto === "reparacion" ? b.concepto : null;
  if (!id || !concepto) throw new Rechazo(400, "solicitud no válida");
  const uid = await usuarioDeLaPeticion(supabase, req);
  if (!uid) throw new Rechazo(401, "inicia sesión para pagar");
  if (!(await pagoDisponible(supabase, modo, uid))) throw new Rechazo(403, "el pago con tarjeta no está disponible");
  const f = await leerSolicitud(supabase, id);
  if (!f || f.customer_user_id !== uid) throw new Rechazo(404, "solicitud no encontrada");
  const { centimos, pagado } = importeSolicitud(f, concepto);
  if (pagado) return { ok: true, pagado: true };
  if (centimos === null) throw new Rechazo(409, "aún no hay nada que pagar");
  if (centimos < MINIMO_CENTIMOS || centimos > MAXIMO_CENTIMOS) throw new Rechazo(409, "este importe no se puede pagar con tarjeta");

  // ¿Ya hay un cobro abierto de esta solicitud? Del mismo concepto e importe se reutiliza; si no, se cierra.
  if (f.stripe_sesion && SESION_RE.test(f.stripe_sesion)) {
    const previa = await sesionDeStripe(clave, f.stripe_sesion);
    if (previa && previa.metadata?.solicitud_id === f.id) {
      const mismo = previa.metadata?.concepto === concepto;
      if (mismo && previa.status === "complete" && previa.payment_status === "paid" && previa.amount_total === centimos) {
        await marcarSolicitudPagada(supabase, f, concepto, previa, modo);
        return { ok: true, pagado: true };
      }
      if (mismo && previa.status === "open" && previa.amount_total === centimos && previa.url) return { ok: true, url: previa.url };
      if (previa.status === "open") await llamarStripe(clave, "POST", `/checkout/sessions/${encodeURIComponent(previa.id)}/expire`);
    }
  }

  const minuto = Math.floor(Date.now() / 60_000);
  const origen = origenDe(req);
  const conKlarna = await klarnaDisponible(supabase);
  const codigo = f.codigo_seguimiento ?? "";
  const nombre =
    concepto === "etiqueta"
      ? `Etiqueta de Correos ${codigo} · VideojuegosZaragoza`
      : f.diagnostico_resultado === "sin_arreglo"
        ? `Envío de vuelta ${codigo} · VideojuegosZaragoza`
        : `Reparación ${codigo} · VideojuegosZaragoza`;
  const campos: Record<string, string> = {
    mode: "payment",
    locale: "es",
    submit_type: "pay",
    "payment_method_types[0]": "card",
    ...(conKlarna ? { "payment_method_types[1]": "klarna" } : {}),
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(centimos),
    "line_items[0][price_data][product_data][name]": nombre.trim(),
    client_reference_id: f.id,
    "metadata[solicitud_id]": f.id,
    "metadata[concepto]": concepto,
    "metadata[codigo]": codigo,
    "payment_intent_data[description]": nombre.trim(),
    "payment_intent_data[metadata][solicitud_id]": f.id,
    "payment_intent_data[metadata][concepto]": concepto,
    success_url: `${origen}/perfil?tab=seguimientos&pago=ok&sesion={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origen}/perfil?tab=seguimientos&pago=cancelado`,
    expires_at: String((minuto + 31) * 60),
  };
  const r = await llamarStripe(clave, "POST", "/checkout/sessions", campos, `vz-rep-${f.id}-${concepto}-${centimos}-${minuto}`);
  if (r.http !== 200 || typeof r.datos?.id !== "string" || typeof r.datos?.url !== "string") {
    console.error("pago: Stripe no abrió el pago de la solicitud", r.http, r.datos?.error?.code ?? "");
    throw new Rechazo(502, "no se pudo abrir el pago");
  }
  const { error: errApunte } = await supabase.from("service_requests").update({ stripe_sesion: r.datos.id }).eq("id", f.id);
  if (errApunte) console.error("pago: no se pudo apuntar el cobro abierto de la solicitud", codigo, errApunte.code ?? "");
  return { ok: true, url: r.datos.url as string };
}

// ¿Stripe dice que esa sesión está cobrada de verdad (en euros y por más de 0)? La misma regla para pedidos y solicitudes.
function sesionCobrada(s: SesionStripe): boolean {
  return (
    s.status === "complete" &&
    s.payment_status === "paid" &&
    s.currency === "eur" &&
    Number.isInteger(s.amount_total) &&
    Number(s.amount_total) > 0
  );
}

// Una sesión de Stripe de una solicitud: lo cobrado tiene que ser el importe de la base de datos.
async function confirmarPagoSolicitud(supabase: SupabaseClient, modo: Modo, s: SesionStripe) {
  const id = s.metadata?.solicitud_id ?? "";
  const concepto = s.metadata?.concepto;
  if (!UUID_RE.test(id) || s.client_reference_id !== id || (concepto !== "etiqueta" && concepto !== "reparacion")) throw new Rechazo(404, "pago no encontrado");
  const f = await leerSolicitud(supabase, id);
  if (!f) throw new Rechazo(404, "pago no encontrado");
  const cobrado = sesionCobrada(s);
  const { centimos, pagado: ya } = importeSolicitud(f, concepto);
  if (ya) return { pagado: true, solicitud: f.id, concepto };
  if (!cobrado) return { pagado: false, solicitud: f.id, concepto };
  if (centimos !== s.amount_total) {
    console.error(`pago: la solicitud ${f.codigo_seguimiento ?? f.id} cobró ${s.amount_total} céntimos y la base de datos dice ${centimos}: revísalo en Stripe`);
    return { pagado: false, solicitud: f.id, concepto };
  }
  await marcarSolicitudPagada(supabase, f, concepto, s, modo);
  return { pagado: true, solicitud: f.id, concepto };
}

async function confirmarPago(supabase: SupabaseClient, clave: string, modo: Modo, sesionId: string) {
  const s = await sesionDeStripe(clave, sesionId);
  if (s && s.livemode === (modo === "real") && s.metadata?.solicitud_id) return confirmarPagoSolicitud(supabase, modo, s);
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
  const pagado = sesionCobrada(s);
  if (pagado) await marcarPagado(supabase, p, s, modo);
  return { pagado, numero: p.numero };
}

async function esAdministrador(supabase: SupabaseClient, uid: string | null): Promise<boolean> {
  if (!uid) return false;
  const { data } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle<{ role: string }>();
  return data?.role === "admin";
}

// Devolver el pago entero de un pedido (botón de Administración → Pedidos). Solo el administrador; una sola vez.
async function devolverPago(supabase: SupabaseClient, clave: string, modo: Modo, req: any, b: Record<string, unknown>) {
  if (!(await esAdministrador(supabase, await usuarioDeLaPeticion(supabase, req)))) throw new Rechazo(403, "solo para administradores");
  const numero = Number(b.numero);
  if (!Number.isInteger(numero) || numero <= 0 || numero > 1e12) throw new Rechazo(400, "pedido no válido");
  const { data: p, error } = await supabase
    .from("pedidos")
    .select("id,numero,pago_estado,pago_modo,pago_referencia,pagado_eur,devuelto_en,devuelto_eur")
    .eq("numero", numero)
    .maybeSingle<{ id: string; numero: number; pago_estado: string | null; pago_modo: string | null; pago_referencia: string | null; pagado_eur: number | string | null; devuelto_en: string | null; devuelto_eur: number | string | null }>();
  if (error) throw faltanColumnas(error) || /devuelto|devolucion/.test(String(error.message ?? "")) ? new Rechazo(503, "falta activar las devoluciones") : new Rechazo(500, "no se pudo leer el pedido");
  if (!p) throw new Rechazo(404, "pedido no encontrado");
  if (p.devuelto_en) return { ok: true, devuelto_eur: Number(p.devuelto_eur), ya: true };
  if (p.pago_estado !== "pagado" || !p.pago_referencia || !/^pi_[A-Za-z0-9]+$/.test(p.pago_referencia)) throw new Rechazo(409, "este pedido no tiene un pago con tarjeta que devolver");
  if (p.pago_modo !== modo) throw new Rechazo(409, `este pago es ${p.pago_modo === "prueba" ? "de prueba" : "real"} y la clave de Stripe puesta no lo es`);
  const r = await llamarStripe(
    clave,
    "POST",
    "/refunds",
    { payment_intent: p.pago_referencia, "metadata[pedido_id]": p.id, "metadata[numero]": String(p.numero) },
    `vz-devolver-${p.id}`
  );
  const estado = String(r.datos?.status ?? "");
  if (r.http !== 200 || !/^re_/.test(String(r.datos?.id ?? "")) || !["succeeded", "pending"].includes(estado)) {
    console.error("pago: Stripe no hizo la devolución", r.http, r.datos?.error?.code ?? "", estado);
    throw new Rechazo(502, r.datos?.error?.code === "charge_already_refunded" ? "Stripe dice que ese pago ya estaba devuelto" : "Stripe no ha podido hacer la devolución");
  }
  const devuelto = Number(r.datos.amount ?? 0) / 100;
  const { error: errApunte } = await supabase
    .from("pedidos")
    .update({ devuelto_eur: devuelto, devuelto_en: new Date().toISOString(), devolucion_referencia: String(r.datos.id) })
    .eq("id", p.id)
    .is("devuelto_en", null);
  if (errApunte) {
    console.error("pago: devolución hecha en Stripe pero sin apuntar, pedido", p.numero, errApunte.code ?? "");
    throw new Rechazo(500, "devuelto en Stripe, pero no se pudo apuntar: míralo en Stripe");
  }
  return { ok: true, devuelto_eur: devuelto };
}

// Aviso de Stripe de una devolución (también las hechas desde el propio Stripe): se apunta en su pedido, una vez.
async function apuntarDevolucionDeAviso(supabase: SupabaseClient, cargo: any) {
  const intento = typeof cargo?.payment_intent === "string" ? cargo.payment_intent : cargo?.payment_intent?.id;
  const devuelto = Number(cargo?.amount_refunded ?? 0);
  if (typeof intento !== "string" || !/^pi_[A-Za-z0-9]+$/.test(intento) || !Number.isInteger(devuelto) || devuelto <= 0) return;
  const referencia = cargo?.refunds?.data?.[0]?.id;
  const { error } = await supabase
    .from("pedidos")
    .update({
      devuelto_eur: devuelto / 100,
      devuelto_en: new Date().toISOString(),
      devolucion_referencia: typeof referencia === "string" && /^re_/.test(referencia) ? referencia : null,
    })
    .eq("pago_referencia", intento)
    .is("devuelto_en", null);
  if (error) throw new Rechazo(500, "no se pudo apuntar la devolución");
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
      const klarna = disponible && (await klarnaDisponible(supabase));
      responder(res, 200, { ok: true, disponible, modo: disponible ? modo : null, klarna });
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
      if (evento?.type === "charge.refunded" && evento?.livemode === (modo === "real")) {
        await apuntarDevolucionDeAviso(supabase, evento?.data?.object);
      }
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
      responder(res, 200, b.solicitud !== undefined ? await crearPagoSolicitud(supabase, clave, modo, req, b) : await crearPago(supabase, clave, modo, req, b));
      return;
    }
    if (b.accion === "confirmar") {
      const sesion = typeof b.sesion === "string" && SESION_RE.test(b.sesion) ? b.sesion : null;
      if (!sesion) throw new Rechazo(400, "pago no válido");
      if (!(await consumirLimite(supabase, `pago:confirmar:${cubo}`, LIMITE_CONFIRMAR)).permitido) throw new Rechazo(429, "demasiados intentos; espera unos minutos");
      responder(res, 200, { ok: true, ...(await confirmarPago(supabase, clave, modo, sesion)) });
      return;
    }
    if (b.accion === "devolver") {
      if (!(await consumirLimite(supabase, `pago:devolver:${cubo}`, LIMITE_CREAR)).permitido) throw new Rechazo(429, "demasiados intentos; espera unos minutos");
      responder(res, 200, await devolverPago(supabase, clave, modo, req, b));
      return;
    }
    throw new Rechazo(400, "acción no válida");
  } catch (e: unknown) {
    const r = e instanceof Rechazo ? e : new Rechazo(500, "error interno");
    if (!(e instanceof Rechazo)) console.error("pago: error inesperado", e);
    responder(res, r.http, { ok: false, error: r.message });
  }
}
