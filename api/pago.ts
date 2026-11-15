/**
 * api/pago.ts
 *
 * Qué hace: pago con tarjeta de los pedidos de la tienda con Stripe Checkout (la página de pago segura de Stripe). El
 * cliente escribe su tarjeta en la página de Stripe: la tienda nunca ve ni guarda los datos de la tarjeta. Desde el
 * 2026-11-06 también Klarna (pagar a plazos) y desde el 2026-11-11 Bizum (dueño: «añade Bizum de Stripe»), en la misma
 * página; en pantalla se llama «pago online».
 *
 * Formas de pago de la página de Stripe (metodosOnline y tiposDePago, comunes a pedidos y reparaciones): siempre tarjeta
 * (con Apple Pay y Link); Klarna solo si la política de privacidad ya nombra a Klarna y Bizum solo si ya nombra a Bizum
 * (migración 20261111150000_privacidad_bizum_stripe: primero la privacidad), en índices seguidos (card, klarna, bizum).
 * Bizum lo tiene que activar el dueño en su panel de Stripe (Stripe verifica su DNI/NIE); mientras no esté activo, Stripe
 * rechaza la sesión que lo pide: entonces se reintenta UNA vez sin Bizum (el pago con tarjeta nunca se rompe), se avisa
 * en la consola sin datos personales y esa instancia deja de ofrecer Bizum durante una hora (BIZUM_PAUSA_MS). Bizum
 * confirma al momento, como la tarjeta: «pagado» sigue siendo complete + paid preguntado a Stripe (sesionCobrada).
 * Con qué se pagó de verdad (card, klarna o bizum) se lee de la sesión de Stripe pidiéndola con su pago y su forma de
 * pago desplegados (expand payment_intent.payment_method, solo lectura) y se guarda en pedidos.pago_metodo y
 * service_requests.pago_metodo / etiqueta_pago_metodo; si esas columnas aún no existen, el pago se apunta igual sin él.
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
 *   klarna, bizum } (klarna / bizum: si la página de pago también ofrece Klarna / Bizum).
 * - POST { accion: "crear", numero, clave? } → { ok, url } (la página de Stripe) o { ok, pagado: true } si ya está
 *   pagado. El pedido tiene que ser de quien llama: de su cuenta (sesión) o con la clave de la compra, que solo tiene el
 *   navegador que lo hizo (pedidos.clave_unica). Si no, 404 (no se dice si existe).
 * - POST { accion: "confirmar", sesion: "cs_…" } → { ok, pagado, numero, referencia }.
 * - POST { accion: "referencia", numero, clave? } → { ok, referencia } (dueño, 2026-11-11: el cliente ve su pedido como
 *   «Pedido VZ-XXXX-XXXX», nunca «Pedido nº 2»). Con la misma regla de dueño que «crear» (su cuenta o la clave de la
 *   compra; si no, 404) y sin necesitar Stripe. En la página de pago de Stripe, la línea y la descripción del cobro
 *   también llevan la referencia («Pedido VZ-… · VideojuegosZaragoza»); el número interno sigue en los metadatos.
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
 * Avisos al móvil del dueño (dueño, 2026-11-15: «quiero que me llegue una notificación a mi móvil, con el resumen del
 * pedido o servicio»; migración 20261115110000_avisos_movil). Van AQUÍ por el tope de 12 funciones de api/. Web Push
 * estándar hecho con node:crypto, sin librerías: el contenido va cifrado para cada dispositivo (RFC 8291, aes128gcm) y
 * firmado con la clave VAPID de la tienda (RFC 8292, JWT ES256), así que el servicio de avisos de Apple, Google o Mozilla
 * no puede leerlo.
 * - GET /api/pago?avisos=clave → { ok, configurado, clave } (la clave pública VAPID; sin las 3 variables, configurado
 *   false y la tarjeta de Administración dice «Avisos sin configurar»).
 * - POST { accion: "avisos_prueba", endpoint } (SOLO el administrador, a un dispositivo SUYO activo) → { ok, entregados }.
 * - Solos: al apuntar un pedido pagado (webhook, «confirmar» o «crear» con la sesión ya cobrada) sale «Pedido pagado ·
 *   349,99 €»; al apuntar un cobro de reparación, «Servicio pagado · 45,00 €» (o «Etiqueta pagada»); y en «referencia»
 *   (la pantalla de confirmación del pedido, que solo puede pedir quien lo hizo) de un pedido de las 3 últimas horas,
 *   pendiente y sin pagar online, «Pedido nuevo · pago en entrega» (o «· pago online sin terminar»). Cuerpo: «PlayStation 5
 *   Slim (+1 más) · Ana G. · Envío a Zaragoza 50001 · VZ-AB12-CD34» (nombre de pila e inicial; sin teléfono, correo ni
 *   dirección). Al tocarlo abre /admin/pedidos?buscar=VZ-… (o /admin/services). Una sola vez por pedido (nuevo y pagado)
 *   y por cobro de reparación: se reclama en la base de datos ANTES de enviar (pedidos.aviso_admin_* y
 *   service_requests.aviso_admin_sesion). Como mucho 4 s en total (ESPERA_AVISOS_MS) y nunca lanza: el cobro y la
 *   respuesta a Stripe no dependen de los avisos. Un dispositivo que contesta 404/410 (suscripción caducada) se desactiva.
 *   Cada envío se apunta en admin_avisos_registro (título, referencia y cuántos llegaron; sin datos de nadie).
 * Reservar con señal (dueño, 2026-11-15, mejora 14; migración 20261115150000_reservas_senal). APAGADA Y VACÍA hasta que el
 * dueño ponga sus reglas (escala de %, días máximos, tipo de arras, qué pasa al vencer) y marque «Revisado por mi gestor».
 * Va AQUÍ por el tope de 12 funciones de api/.
 * - GET /api/pago?reserva=ajustes[&producto=<uuid>] → { ok, activa } y, SOLO si está activa, completa y el pago online se
 *   puede usar (pagoDisponible), las reglas públicas (escala, dias_max, tipo_arras, al_vencer, texto_condiciones); con
 *   producto, también reservado_hasta (si está reservado ahora). La tabla de ajustes solo la lee el administrador (RLS):
 *   esta respuesta es la única puerta pública y no lleva nada más.
 * - POST { accion: "reserva", producto, dias, acepta: true } (con sesión) → { ok, url }. TODO se recalcula aquí con la
 *   configuración y el precio de la base de datos (lo que mande el navegador como importe o porcentaje no cuenta): el
 *   porcentaje es el del primer tramo de la escala que cubre esos días, la señal = precio × porcentaje (al céntimo), el
 *   producto tiene que estar a la venta y sin otra reserva (activa, o pendiente de pago de otra persona). Se guarda la
 *   reserva «pendiente_pago» con una copia de las condiciones aceptadas (y su SHA-256) y se abre Stripe por la señal; el
 *   artículo queda apartado mientras dura el pago (31 min). Rechazos: apagada o incompleta 403, sin sesión 401, sin aceptar
 *   las condiciones 400, días fuera de la escala 400, no está a la venta 409, ya reservado 409.
 * - La confirmación («confirmar» y el aviso de Stripe) reconoce la reserva por metadata[reserva_id]: si Stripe la cobró por
 *   el importe guardado, pasa a «activa» UNA sola vez (vence a los días elegidos desde el pago) y products.reservado_hasta =
 *   vence_en. Cobrada fuera de «pendiente_pago» (cancelada antes): no se toca y se avisa en la consola para devolverla.
 * - POST { accion: "reserva_estado", reserva, estado: "completada" | "cancelada" | "vencida" } (SOLO el administrador): cambia
 *   el estado y suelta el artículo. NO devuelve dinero: si procede, el reembolso se hace en Stripe.
 *
 * Variables de los avisos (las pone el dueño en Vercel): VAPID_PUBLIC_KEY (65 bytes, base64url sin relleno),
 * VAPID_PRIVATE_KEY (32 bytes, base64url sin relleno) y VAPID_SUBJECT (mailto:…). Si faltan o no casan, no se envía nada.
 *
 * Variables de entorno (Vercel → Settings → Environment Variables, solo servidor):
 * - STRIPE_SECRET_KEY: la clave secreta de Stripe (la pone el dueño; Claude no la ve). Sin ella no hay pago con tarjeta.
 * - STRIPE_WEBHOOK_SECRET (opcional): el secreto del aviso de Stripe (whsec_…).
 * - EXPO_PUBLIC_SUPABASE_URL y SUPABASE_CLAVE_SERVIDOR: leer el pedido y apuntar el pago.
 *
 * Conectado con: app/checkout.tsx («Pagar con tarjeta» y la vuelta de Stripe), app/admin/pedidos.tsx (pagados con
 * tarjeta), app/admin/analytics.tsx (pago_tarjeta y pago_tarjeta_ok; recuento por forma de pago de pago_metodo),
 * pruebas/pago-api.mjs; reparación por envío:
 * app/(tabs)/perfil.tsx («Pagar la etiqueta», «Pagar y enviármelo», «Devuélvemelo»), app/admin/services.tsx; avisos al
 * móvil: components/AvisosMovil.tsx, lib/notificaciones.ts, public/sw-avisos.js y pruebas/avisos-api.mjs.
 */
/// <reference types="node" />
import { createCipheriv, createECDH, createHash, createHmac, createPrivateKey, randomBytes, sign as firmarEcdsa, type KeyObject } from "node:crypto";
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
const COLUMNAS_PEDIDO = "id,numero,codigo_seguimiento,estado,total_eur,user_id,clave_unica,pago_estado,pago_sesion";
const codificar = new TextEncoder();

type Modo = "prueba" | "real";

type FilaPedido = {
  id: string;
  numero: number;
  // La referencia del pedido que ve el cliente («VZ-XXXX-XXXX», la pone la base de datos). numero es solo interno.
  codigo_seguimiento: string | null;
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
  payment_intent?: string | { id?: string; payment_method?: string | { type?: string } | null } | null;
};

// Con qué se pagó (lo dice Stripe) y qué formas de pago se ofrecen además de la tarjeta.
type Metodo = "card" | "klarna" | "bizum";
const METODOS: readonly string[] = ["card", "klarna", "bizum"];
type MetodosOnline = { klarna: boolean; bizum: boolean };

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

// La sesión se pide con su pago y la forma de pago desplegados (solo lectura) para saber si fue tarjeta, Klarna o Bizum.
async function sesionDeStripe(clave: string, id: string): Promise<SesionStripe | null> {
  const r = await llamarStripe(clave, "GET", `/checkout/sessions/${encodeURIComponent(id)}?expand[]=payment_intent.payment_method`);
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

// Klarna (pagar a plazos, dueño 2026-11-06) y Bizum (dueño 2026-11-11) solo cuando la política de privacidad ya los
// nombra: si el cliente los elige, sus datos los tratan Klarna o Bizum y su banco (migraciones
// 20261106150000_politicas_klarna_envios y 20261111150000_privacidad_bizum_stripe). Primero la privacidad. Una sola
// lectura de la política para las dos.
const BIZUM_PAUSA_MS = 60 * 60 * 1000;
let bizumRechazadoHasta = 0;

async function metodosOnline(supabase: SupabaseClient): Promise<MetodosOnline> {
  const { data } = await supabase.from("policy_pages").select("sections").eq("slug", "privacidad").maybeSingle<{ sections: unknown }>();
  const texto = JSON.stringify(data?.sections ?? "");
  const klarna = texto.includes("Klarna");
  // Bizum, además, solo si Stripe no lo ha rechazado hace poco en esta instancia (el dueño aún no lo ha activado).
  const bizum = texto.includes("Bizum") && Date.now() >= bizumRechazadoHasta;
  return { klarna, bizum };
}

// Las formas de pago de la sesión, en índices seguidos: tarjeta siempre; después Klarna y Bizum si tocan.
function tiposDePago(m: MetodosOnline): Record<string, string> {
  const tipos: string[] = ["card"];
  if (m.klarna) tipos.push("klarna");
  if (m.bizum) tipos.push("bizum");
  return Object.fromEntries(tipos.map((t, i) => [`payment_method_types[${i}]`, t]));
}

// ¿Stripe ha rechazado la sesión por Bizum (no está activado en la cuenta)? Por el campo del error o por su mensaje.
function rechazoPorBizum(datos: any): boolean {
  const e = datos?.error;
  if (!e) return false;
  return /payment_method_types/.test(String(e.param ?? "")) || /bizum/i.test(String(e.message ?? ""));
}

// Abre la página de pago de Stripe. Si pide Bizum y Stripe lo rechaza, se reintenta UNA vez sin Bizum (con otra clave de
// idempotencia, porque los datos cambian) y esta instancia deja de ofrecerlo un rato: la tarjeta nunca se rompe.
// La clave de idempotencia lleva las formas de pago (-k Klarna, -b Bizum): si cambian dentro del mismo minuto, son datos
// distintos y Stripe no debe devolver la sesión de antes.
async function abrirSesionStripe(clave: string, campos: Record<string, string>, m: MetodosOnline, idempotencia: string) {
  const sufijo = (x: MetodosOnline) => `${x.klarna ? "-k" : ""}${x.bizum ? "-b" : ""}`;
  const r = await llamarStripe(clave, "POST", "/checkout/sessions", { ...campos, ...tiposDePago(m) }, `${idempotencia}${sufijo(m)}`);
  if (r.http === 200 || !m.bizum || !rechazoPorBizum(r.datos)) return r;
  console.warn("pago: Stripe no acepta Bizum en esta cuenta (¿sin activar en el panel de Stripe?); se abre el pago sin Bizum", r.http, r.datos?.error?.code ?? "");
  const pausa = Number(process.env.BIZUM_PAUSA_MS);
  bizumRechazadoHasta = Date.now() + (Number.isFinite(pausa) && pausa >= 0 ? pausa : BIZUM_PAUSA_MS);
  return llamarStripe(clave, "POST", "/checkout/sessions", { ...campos, ...tiposDePago({ ...m, bizum: false }) }, `${idempotencia}${sufijo({ ...m, bizum: false })}-sinbizum`);
}

// Con qué se pagó de verdad, según Stripe (la forma de pago del cobro). null si no se sabe.
function metodoDeLaSesion(s: SesionStripe): Metodo | null {
  const pi = s.payment_intent;
  const pm = pi && typeof pi === "object" ? pi.payment_method : null;
  const tipo = pm && typeof pm === "object" ? String(pm.type ?? "") : "";
  return METODOS.includes(tipo) ? (tipo as Metodo) : null;
}

// Sin la columna del método (migración 20261111150000 sin aplicar), se apunta igual sin él.
function faltaColumnaMetodo(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === "42703" || error.code === "PGRST204") && /pago_metodo/.test(String(error.message ?? ""));
}

async function marcarPagado(supabase: SupabaseClient, p: Pick<FilaPedido, "id" | "numero" | "pago_estado" | "pago_sesion">, s: SesionStripe, modo: Modo) {
  if (p.pago_estado === "pagado") {
    if (p.pago_sesion !== s.id) console.error(`pago: el pedido ${p.numero} ya estaba pagado y llega otro cobro (${s.id}): devuélvelo desde Stripe`);
    return;
  }
  const referencia = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null;
  const metodo = metodoDeLaSesion(s);
  const datos: Record<string, unknown> = {
    pago_estado: "pagado",
    pago_modo: modo,
    pago_sesion: s.id,
    pago_referencia: referencia,
    pagado_eur: Number(s.amount_total ?? 0) / 100,
    pagado_en: new Date().toISOString(),
  };
  const apuntar = (d: Record<string, unknown>) =>
    supabase
      .from("pedidos")
      .update(d)
      .eq("id", p.id)
      // Si a la vez llegan la vuelta del navegador y el aviso de Stripe, solo apunta el primero.
      .or("pago_estado.is.null,pago_estado.neq.pagado");
  let { error } = await apuntar(metodo ? { ...datos, pago_metodo: metodo } : datos);
  if (metodo && faltaColumnaMetodo(error)) ({ error } = await apuntar(datos));
  if (error) {
    console.error("pago: no se pudo apuntar el pago del pedido", p.numero, error.code ?? "");
    throw new Rechazo(500, "no se pudo apuntar el pago");
  }
  // A la vez: el puente de VeoAura (3 s como mucho) y el aviso al móvil del dueño (4 s como mucho, una vez por pedido).
  await Promise.all([despertarVeoaura(), avisarConTope(() => avisarPedido(supabase, p.id, "pagado"))]);
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

// --- Avisos al móvil del dueño (Web Push con node:crypto) -----------------------------------------------------------

const ESPERA_AVISOS_MS = 4000;
// Solo a los servicios de avisos de los navegadores (Google/Chrome y Android, Apple/Safari, Mozilla/Firefox y Microsoft).
const ENDPOINT_PUSH_RE =
  /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)\//i;
type Vapid = { publica: string; privada: KeyObject; sujeto: string };
type TipoAviso = "pedido_pagado" | "pedido_nuevo" | "servicio_pagado" | "prueba";
type Aviso = { tipo: TipoAviso; titulo: string; cuerpo: string; url: string; tag: string; referencia: string | null };
type FilaSuscripcion = { id: string; endpoint: string; p256dh: string; auth: string; fallos: number | null };

const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url");
const hmac256 = (clave: Uint8Array, datos: Uint8Array) => createHmac("sha256", clave).update(datos).digest();

// Las 3 variables de Vercel. Sin ellas, mal escritas o si la pública no es la de la privada: null (no se envía nada).
function vapidDelEntorno(): Vapid | null {
  const publica = String(process.env.VAPID_PUBLIC_KEY ?? "").trim().replace(/=+$/, "");
  const privada = String(process.env.VAPID_PRIVATE_KEY ?? "").trim().replace(/=+$/, "");
  const sujeto = String(process.env.VAPID_SUBJECT ?? "").trim();
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(publica) || !/^[A-Za-z0-9_-]{40,50}$/.test(privada) || !/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/.test(sujeto)) return null;
  try {
    const pub = Buffer.from(publica, "base64url");
    const d = Buffer.from(privada, "base64url");
    if (pub.length !== 65 || pub[0] !== 4 || d.length !== 32) return null;
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(d);
    if (!ecdh.getPublicKey().equals(pub)) return null;
    const clave = createPrivateKey({ key: { kty: "EC", crv: "P-256", d: b64u(d), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }, format: "jwk" });
    return { publica: b64u(pub), privada: clave, sujeto };
  } catch {
    return null;
  }
}

// RFC 8292: «vapid t=<JWT ES256 para el origen del servicio de avisos, 12 h>, k=<clave pública>».
function cabeceraVapid(v: Vapid, endpoint: string): string {
  const cab = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const carga = b64u(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: v.sujeto })));
  const firma = firmarEcdsa("sha256", Buffer.from(`${cab}.${carga}`), { key: v.privada, dsaEncoding: "ieee-p1363" });
  return `vapid t=${cab}.${carga}.${b64u(firma)}, k=${v.publica}`;
}

// RFC 8291 (aes128gcm, un solo registro): clave efímera P-256, secreto ECDH con la clave del dispositivo, HKDF con su
// «auth» y la sal, y AES-128-GCM. Cabecera: sal (16) | tamaño de registro (4) | longitud (1) | clave efímera (65).
function cifrarAviso(texto: Uint8Array, p256dh: string, auth: string): Buffer {
  const ua = Buffer.from(p256dh, "base64url");
  const secreto = Buffer.from(auth, "base64url");
  if (ua.length !== 65 || ua[0] !== 4 || secreto.length !== 16) throw new Error("suscripción no válida");
  const ecdh = createECDH("prime256v1");
  const efimera = ecdh.generateKeys();
  const compartido = ecdh.computeSecret(ua);
  const ikm = hmac256(hmac256(secreto, compartido), Buffer.concat([Buffer.from("WebPush: info\0", "latin1"), ua, efimera, Buffer.from([1])]));
  const sal = randomBytes(16);
  const prk = hmac256(sal, ikm);
  const cek = hmac256(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01", "latin1")).subarray(0, 16);
  const nonce = hmac256(prk, Buffer.from("Content-Encoding: nonce\0\x01", "latin1")).subarray(0, 12);
  const cifrador = createCipheriv("aes-128-gcm", cek, nonce);
  const cifrado = Buffer.concat([cifrador.update(Buffer.concat([texto, Buffer.from([2])])), cifrador.final(), cifrador.getAuthTag()]);
  const tam = Buffer.alloc(4);
  tam.writeUInt32BE(4096);
  return Buffer.concat([sal, tam, Buffer.from([efimera.length]), efimera, cifrado]);
}

async function enviarAUnDispositivo(v: Vapid, s: FilaSuscripcion, carga: Uint8Array): Promise<"ok" | "caducada" | "fallo"> {
  if (!ENDPOINT_PUSH_RE.test(s.endpoint)) return "fallo";
  try {
    const r = await fetch(s.endpoint, {
      method: "POST",
      headers: {
        TTL: "86400",
        Urgency: "high",
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        Authorization: cabeceraVapid(v, s.endpoint),
      },
      body: new Uint8Array(cifrarAviso(carga, s.p256dh, s.auth)),
      signal: AbortSignal.timeout(ESPERA_AVISOS_MS - 500),
    });
    if (r.status >= 200 && r.status < 300) return "ok";
    if (r.status === 404 || r.status === 410) return "caducada";
    console.warn("avisos: el servicio de avisos no lo aceptó", r.status);
    return "fallo";
  } catch {
    return "fallo";
  }
}

// Manda el aviso a los dispositivos activos (o solo a uno, para la prueba), apunta cómo fue y lo registra.
async function repartirAviso(supabase: SupabaseClient, v: Vapid, aviso: Aviso, solo?: { endpoint: string; uid: string }) {
  let consulta = supabase.from("admin_avisos_suscripciones").select("id,endpoint,p256dh,auth,fallos").eq("activa", true).lt("fallos", 50).limit(20);
  if (solo) consulta = consulta.eq("endpoint", solo.endpoint).eq("user_id", solo.uid);
  const { data, error } = await consulta;
  if (error) {
    console.warn("avisos: no se pudieron leer los dispositivos", error.code ?? "");
    return { entregados: 0, fallidos: 0, dispositivos: 0 };
  }
  const filas = (data ?? []) as FilaSuscripcion[];
  if (!filas.length) return { entregados: 0, fallidos: 0, dispositivos: 0 };
  const carga = Buffer.from(
    JSON.stringify({ title: aviso.titulo, body: aviso.cuerpo, url: aviso.url, tag: aviso.tag, icon: "/icono-192.png", badge: "/icono-192.png", ts: Date.now() })
  );
  const resultados = await Promise.all(filas.map((s) => enviarAUnDispositivo(v, s, carga)));
  const ahora = new Date().toISOString();
  await Promise.all(
    filas.map((s, i) =>
      supabase
        .from("admin_avisos_suscripciones")
        .update(
          resultados[i] === "ok"
            ? { ultimo_envio_ok: ahora, fallos: 0 }
            : resultados[i] === "caducada"
              ? { activa: false, desactivada_en: ahora }
              : { fallos: Number(s.fallos ?? 0) + 1 }
        )
        .eq("id", s.id)
        .then(() => null, () => null)
    )
  );
  const entregados = resultados.filter((r) => r === "ok").length;
  await supabase
    .from("admin_avisos_registro")
    .insert({ tipo: aviso.tipo, titulo: aviso.titulo.slice(0, 120), referencia: aviso.referencia, entregados, fallidos: filas.length - entregados })
    .then(() => null, () => null);
  return { entregados, fallidos: filas.length - entregados, dispositivos: filas.length };
}

// Como mucho ESPERA_AVISOS_MS y nunca lanza: el cobro y la respuesta a Stripe no dependen de los avisos.
async function avisarConTope(tarea: () => Promise<unknown>): Promise<void> {
  // (any: con los tipos de Node y del navegador a la vez, setTimeout devuelve uno u otro según la sobrecarga)
  let temporizador: any = undefined;
  try {
    await Promise.race([
      tarea().catch((e) => console.warn("avisos: no se pudo avisar", String((e as Error)?.message ?? e).slice(0, 120))),
      new Promise((fin) => {
        temporizador = setTimeout(fin, ESPERA_AVISOS_MS);
      }),
    ]);
  } catch {
    // nunca rompe nada
  } finally {
    clearTimeout(temporizador);
  }
}

// «349,99 €» · «1.299,00 €».
function eurosAviso(n: number): string {
  const c = Math.round((Number.isFinite(n) ? n : 0) * 100);
  const [ent, dec] = (Math.abs(c) / 100).toFixed(2).split(".");
  return `${c < 0 ? "-" : ""}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec} €`;
}

// «Ana Gómez López» → «Ana G.» (nombre de pila e inicial; nunca el nombre completo).
function nombreCorto(nombre: unknown): string {
  const partes = String(nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "";
  const pila = partes[0].slice(0, 20);
  const inicial = partes[1]?.[0] ? ` ${partes[1][0].toUpperCase()}.` : "";
  return `${pila.charAt(0).toUpperCase()}${pila.slice(1)}${inicial}`;
}

const corta = (t: unknown, max: number) => {
  const s = String(t ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
};

// El aviso de un pedido: «pagado» (al apuntar el cobro) o «nuevo» (al enseñar la confirmación al cliente). Se reclama
// en la base de datos ANTES de enviar: si otro ya lo hizo (aviso de Stripe y vuelta del navegador a la vez), no se repite.
async function avisarPedido(supabase: SupabaseClient, pedidoId: string, tipo: "pagado" | "nuevo") {
  const v = vapidDelEntorno();
  if (!v || !UUID_RE.test(pedidoId)) return;
  let reclamo = supabase.from("pedidos").update({ aviso_admin_tipo: tipo, aviso_admin_enviado_en: new Date().toISOString() }).eq("id", pedidoId);
  reclamo =
    tipo === "pagado"
      ? reclamo.or("aviso_admin_tipo.is.null,aviso_admin_tipo.neq.pagado")
      : // Nuevo: solo si aún no salió ningún aviso, pendiente, de las 3 últimas horas y sin pagar online.
        reclamo
          .is("aviso_admin_enviado_en", null)
          .eq("estado", "pendiente")
          .gte("created_at", new Date(Date.now() - 3 * 3600_000).toISOString())
          .or("pago_estado.is.null,pago_estado.neq.pagado");
  const { data: reclamado, error } = await reclamo.select("id");
  // Sin las columnas (migración sin aplicar) o ya avisado: nada.
  if (error || !Array.isArray(reclamado) || reclamado.length === 0) return;
  const { data: p } = await supabase.from("pedidos").select("*, pedido_items(titulo)").eq("id", pedidoId).maybeSingle<Record<string, any>>();
  if (!p || p.origen === "tienda_fisica") return;
  const items: { titulo?: string }[] = Array.isArray(p.pedido_items) ? p.pedido_items : [];
  const referencia = typeof p.codigo_seguimiento === "string" && p.codigo_seguimiento ? p.codigo_seguimiento : null;
  const articulos = items.length ? `${corta(items[0]?.titulo, 48)}${items.length > 1 ? ` (+${items.length - 1} más)` : ""}` : "";
  const lugar = p.entrega === "recogida" ? "Recogida en mano" : `Envío a ${[corta(p.ciudad, 30), corta(p.codigo_postal, 10)].filter(Boolean).join(" ")}`.trim();
  const titulo =
    tipo === "pagado"
      ? `Pedido pagado · ${eurosAviso(Number(p.pagado_eur ?? p.total_eur))}`
      : p.pago_estado
        ? "Pedido nuevo · pago online sin terminar"
        : "Pedido nuevo · pago en entrega";
  const cuerpo = [articulos, nombreCorto(p.nombre), lugar === "Envío a" ? "" : lugar, referencia ?? (p.numero ? `Nº interno ${p.numero}` : "")]
    .filter(Boolean)
    .join(" · ");
  await repartirAviso(supabase, v, {
    tipo: tipo === "pagado" ? "pedido_pagado" : "pedido_nuevo",
    titulo,
    cuerpo: corta(cuerpo, 180),
    url: `/admin/pedidos?buscar=${encodeURIComponent(referencia ?? String(p.numero ?? ""))}`,
    tag: `pedido-${pedidoId}`,
    referencia,
  });
}

// El aviso de un cobro de reparación (la etiqueta o la reparación / la vuelta): uno por sesión de Stripe.
async function avisarSolicitud(supabase: SupabaseClient, f: FilaSolicitud, concepto: ConceptoSolicitud, s: SesionStripe) {
  const v = vapidDelEntorno();
  if (!v || !SESION_RE.test(s.id)) return;
  const { data: reclamado, error } = await supabase
    .from("service_requests")
    .update({ aviso_admin_sesion: s.id })
    .eq("id", f.id)
    .or(`aviso_admin_sesion.is.null,aviso_admin_sesion.neq.${s.id}`)
    .select("id");
  if (error || !Array.isArray(reclamado) || reclamado.length === 0) return;
  const { data: r } = await supabase.from("service_requests").select("*").eq("id", f.id).maybeSingle<Record<string, any>>();
  const importe = eurosAviso(Number(s.amount_total ?? 0) / 100);
  const referencia = f.codigo_seguimiento ?? null;
  const que = concepto === "etiqueta" ? "Etiqueta de Correos" : f.diagnostico_resultado === "sin_arreglo" ? "Envío de vuelta" : "";
  const cuerpo = [corta(f.service_title ?? r?.service_title, 48), que, nombreCorto(`${r?.nombre ?? ""} ${r?.apellido ?? ""}`), referencia].filter(Boolean).join(" · ");
  await repartirAviso(supabase, v, {
    tipo: "servicio_pagado",
    titulo: `${concepto === "etiqueta" ? "Etiqueta pagada" : "Servicio pagado"} · ${importe}`,
    cuerpo: corta(cuerpo, 180),
    url: "/admin/services",
    tag: `servicio-${f.id}-${concepto}`,
    referencia,
  });
}

// «Enviar aviso de prueba» (Administración → Pedidos): solo el administrador, a un dispositivo SUYO y activo.
async function avisoDePrueba(supabase: SupabaseClient, req: any, b: Record<string, unknown>) {
  const uid = await usuarioDeLaPeticion(supabase, req);
  if (!(await esAdministrador(supabase, uid)) || !uid) throw new Rechazo(403, "solo para administradores");
  const v = vapidDelEntorno();
  if (!v) throw new Rechazo(503, "Avisos sin configurar");
  const endpoint = typeof b.endpoint === "string" && b.endpoint.length <= 1000 && ENDPOINT_PUSH_RE.test(b.endpoint) ? b.endpoint : null;
  if (!endpoint) throw new Rechazo(400, "dispositivo no válido");
  const r = await repartirAviso(
    supabase,
    v,
    {
      tipo: "prueba",
      titulo: "Aviso de prueba · VideojuegosZaragoza",
      cuerpo: "Así te llegará cada pedido: «Pedido pagado · 349,99 €» con el artículo, el cliente y la entrega. Toca para abrir Pedidos.",
      url: "/admin/pedidos",
      tag: "prueba",
      referencia: null,
    },
    { endpoint, uid }
  );
  if (r.dispositivos === 0) throw new Rechazo(404, "este dispositivo no tiene los avisos activados");
  return { ok: true, entregados: r.entregados, fallidos: r.fallidos };
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
  const referencia = p.codigo_seguimiento ?? null;
  if (p.pago_estado === "pagado") return { ok: true, pagado: true, numero, referencia };
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
        return { ok: true, pagado: true, numero, referencia };
      }
      if (previa.status === "open" && previa.amount_total === centimos && previa.url) return { ok: true, url: previa.url };
      if (previa.status === "open") await llamarStripe(clave, "POST", `/checkout/sessions/${encodeURIComponent(previa.id)}/expire`);
    }
  }

  // Misma petición en el mismo minuto (dos toques a la vez) = la misma sesión: la clave de idempotencia y los datos no
  // cambian dentro del minuto. Caduca a los 30-31 minutos (el mínimo de Stripe).
  const minuto = Math.floor(Date.now() / 60_000);
  const origen = origenDe(req);
  // Tarjeta (con Apple Pay y Link) y, si la privacidad ya los nombra, Klarna (a plazos, 2026-11-06) y Bizum (2026-11-11),
  // en tiposDePago. Confirman al momento, como la tarjeta: «pagado» sigue siendo complete + paid preguntado a Stripe.
  const metodos = await metodosOnline(supabase);
  // Lo que ve el cliente en la página de pago y en su banco: la referencia del pedido, como una empresa (dueño,
  // 2026-11-11: nunca «Pedido nº 2»). El número interno solo va en los metadatos (devoluciones, VeoAura).
  const concepto = referencia ? `Pedido ${referencia}` : "Pedido";
  const campos: Record<string, string> = {
    mode: "payment",
    locale: "es",
    submit_type: "pay",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(centimos),
    "line_items[0][price_data][product_data][name]": `${concepto} · VideojuegosZaragoza`,
    client_reference_id: p.id,
    "metadata[pedido_id]": p.id,
    "metadata[numero]": String(p.numero),
    ...(referencia ? { "metadata[referencia]": referencia } : {}),
    "payment_intent_data[description]": `${concepto} · VideojuegosZaragoza`,
    "payment_intent_data[metadata][pedido_id]": p.id,
    "payment_intent_data[metadata][numero]": String(p.numero),
    success_url: `${origen}/checkout?pago=ok&sesion={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origen}/checkout?pago=cancelado&pedido=${p.numero}`,
    expires_at: String((minuto + 31) * 60),
  };
  const r = await abrirSesionStripe(clave, campos, metodos, `vz-pago-${p.id}-${centimos}-${minuto}`);
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
  // pago_modo sigue siendo «tarjeta» (o «prueba») para todo lo que se paga en la página de Stripe (sus valores no cambian);
  // con qué se pagó de verdad (tarjeta, Klarna o Bizum) va aparte, en pago_metodo / etiqueta_pago_metodo.
  const forma = modo === "real" ? "tarjeta" : "prueba";
  const ahora = new Date().toISOString();
  const metodo = metodoDeLaSesion(s);
  const apuntar = (conMetodo: boolean) =>
    concepto === "etiqueta"
      ? supabase
          .from("service_requests")
          .update({ etiqueta_pagada_en: ahora, etiqueta_pago_modo: forma, stripe_sesion: s.id, ...(conMetodo ? { etiqueta_pago_metodo: metodo } : {}) })
          .eq("id", f.id)
          .is("etiqueta_pagada_en", null)
      : // pagado_eur lo pone el disparador de la base de datos (el presupuesto o la vuelta).
        supabase
          .from("service_requests")
          .update({ pago_estado: "pagado", pago_modo: forma, pagado_en: ahora, stripe_sesion: s.id, ...(conMetodo ? { pago_metodo: metodo } : {}) })
          .eq("id", f.id)
          .or("pago_estado.is.null,pago_estado.neq.pagado");
  let { error } = await apuntar(!!metodo);
  if (metodo && faltaColumnaMetodo(error)) ({ error } = await apuntar(false));
  if (error) {
    console.error("pago: no se pudo apuntar el pago de la solicitud", f.codigo_seguimiento ?? "", concepto, error.code ?? "");
    throw new Rechazo(500, "no se pudo apuntar el pago");
  }
  // Aviso al móvil del dueño (4 s como mucho, uno por cobro de Stripe; nunca rompe el pago).
  await avisarConTope(() => avisarSolicitud(supabase, f, concepto, s));
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
  const metodos = await metodosOnline(supabase);
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
  const r = await abrirSesionStripe(clave, campos, metodos, `vz-rep-${f.id}-${concepto}-${centimos}-${minuto}`);
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
  if (s && s.livemode === (modo === "real") && s.metadata?.reserva_id) return confirmarPagoReserva(supabase, modo, s);
  const pedidoId = s?.metadata?.pedido_id ?? "";
  if (!s || !UUID_RE.test(pedidoId) || s.client_reference_id !== pedidoId || s.livemode !== (modo === "real")) {
    throw new Rechazo(404, "pago no encontrado");
  }
  const { data: p, error } = await supabase
    .from("pedidos")
    .select("id,numero,codigo_seguimiento,pago_estado,pago_sesion")
    .eq("id", pedidoId)
    .maybeSingle<Pick<FilaPedido, "id" | "numero" | "codigo_seguimiento" | "pago_estado" | "pago_sesion">>();
  if (error) throw faltanColumnas(error) ? new Rechazo(503, "falta activar el pago con tarjeta") : new Rechazo(500, "no se pudo leer el pedido");
  if (!p) throw new Rechazo(404, "pago no encontrado");
  const pagado = sesionCobrada(s);
  if (pagado) await marcarPagado(supabase, p, s, modo);
  // numero (interno) para que la tienda pueda volver a intentar el pago; referencia, lo que se le enseña al cliente.
  return { pagado, numero: p.numero, referencia: p.codigo_seguimiento ?? null };
}

// La referencia de un pedido (VZ-XXXX-XXXX) para enseñársela al cliente al terminar la compra, también sin cuenta y sin
// pago online. Solo a quien hizo el pedido: con su cuenta o con la clave de la compra que guarda su navegador (la misma
// regla que «crear»). Si no es suyo, 404 (no se dice si existe). No hace falta Stripe.
async function referenciaPedido(supabase: SupabaseClient, req: any, b: Record<string, unknown>) {
  const numero = Number(b.numero);
  if (!Number.isInteger(numero) || numero <= 0 || numero > 1e12) throw new Rechazo(400, "pedido no válido");
  const claveCompra = typeof b.clave === "string" && UUID_RE.test(b.clave) ? b.clave.toLowerCase() : null;
  const uid = await usuarioDeLaPeticion(supabase, req);
  if (!claveCompra && !uid) throw new Rechazo(404, "pedido no encontrado");
  const { data: p, error } = await supabase
    .from("pedidos")
    .select("id,numero,user_id,clave_unica,codigo_seguimiento")
    .eq("numero", numero)
    .maybeSingle<{ id: string; numero: number; user_id: string | null; clave_unica: string | null; codigo_seguimiento: string | null }>();
  if (error) throw new Rechazo(500, "no se pudo leer el pedido");
  const suyo = !!p && ((!!claveCompra && String(p.clave_unica ?? "").toLowerCase() === claveCompra) || (!!uid && p.user_id === uid));
  if (!p || !suyo) throw new Rechazo(404, "pedido no encontrado");
  // Pedido sin pago online (o con el pago sin terminar) recién hecho: aviso «Pedido nuevo» al móvil del dueño, una sola
  // vez y solo si es de las 3 últimas horas y sigue pendiente (lo comprueba avisarPedido en la base de datos).
  if (typeof p.id === "string") await avisarConTope(() => avisarPedido(supabase, p.id, "nuevo"));
  return { ok: true, referencia: p.codigo_seguimiento ?? null };
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

// --- Reservar con señal (mejora 14; migración 20261115150000_reservas_senal) ------------------------------------------
// APAGADA Y VACÍA hasta que el dueño ponga sus reglas y su gestor revise el texto. Nada de lo de aquí cobra si los ajustes
// no están activos y completos (la misma regla que el disparador reserva_ajustes_validar de la base de datos).

type TramoReserva = { hasta_dias: number; porcentaje: number };
type TipoArras = "penitenciales" | "confirmatorias";
type AjustesReserva = { escala: TramoReserva[]; dias_max: number; tipo_arras: TipoArras; al_vencer: string; texto_condiciones: string };
type FilaReserva = {
  id: string;
  product_id: string | null;
  user_id: string;
  dias: number;
  senal_eur: number | string;
  estado: string;
  vence_en: string;
  creado_en: string;
  pago_sesion: string | null;
};

// El artículo queda apartado mientras dura la página de pago de la señal (la sesión de Stripe caduca a los 31 minutos).
const RESERVA_PAGO_MINUTOS = 31;
const DIA_MS = 86_400_000;
const MARCA_BORRADOR_RE = /pendiente de revisión del gestor/i;
const ESTADOS_RESERVA_ADMIN = ["completada", "cancelada", "vencida"];

// La escala del dueño: de 1 a 12 tramos, días enteros crecientes (1-365) y porcentaje entero del 1 al 70. Si no, null.
function escalaReservaValida(e: unknown): TramoReserva[] | null {
  if (!Array.isArray(e) || e.length === 0 || e.length > 12) return null;
  const salida: TramoReserva[] = [];
  let previo = 0;
  for (const t of e) {
    const d = Number((t as Record<string, unknown>)?.hasta_dias);
    const p = Number((t as Record<string, unknown>)?.porcentaje);
    if (!Number.isInteger(d) || d < 1 || d > 365 || d <= previo || !Number.isInteger(p) || p < 1 || p > 70) return null;
    salida.push({ hasta_dias: d, porcentaje: p });
    previo = d;
  }
  return salida;
}

// El porcentaje de esos días: el del primer tramo que los cubre. null si pasan del último.
function porcentajeDeReserva(escala: TramoReserva[], dias: number): number | null {
  return escala.find((t) => dias <= t.hasta_dias)?.porcentaje ?? null;
}

// Los ajustes SOLO si están activos y completos (si falta algo, null: no se ofrece ni se cobra nada).
async function ajustesReservaActivos(supabase: SupabaseClient): Promise<AjustesReserva | null> {
  const { data, error } = await supabase.from("reserva_ajustes").select("*").eq("id", 1).maybeSingle<Record<string, unknown>>();
  if (error || !data || data.activa !== true || data.condiciones_revisadas !== true) return null;
  const escala = escalaReservaValida(data.escala);
  const diasMax = Number(data.dias_max);
  const tipo = data.tipo_arras === "penitenciales" || data.tipo_arras === "confirmatorias" ? (data.tipo_arras as TipoArras) : null;
  const alVencer = typeof data.al_vencer === "string" ? data.al_vencer.trim() : "";
  const texto = typeof data.texto_condiciones === "string" ? data.texto_condiciones.trim() : "";
  if (!escala || !Number.isInteger(diasMax) || diasMax < 1 || diasMax > escala[escala.length - 1].hasta_dias || !tipo || !alVencer || !texto || MARCA_BORRADOR_RE.test(texto)) {
    return null;
  }
  return { escala, dias_max: diasMax, tipo_arras: tipo, al_vencer: alVencer, texto_condiciones: texto };
}

function parametroDeLaUrl(req: any, nombre: string): string {
  const q = req.query?.[nombre];
  if (typeof q === "string") return q;
  try {
    return new URL(String(req.url ?? ""), "http://x").searchParams.get(nombre) ?? "";
  } catch {
    return "";
  }
}

// GET ?reserva=ajustes[&producto=…]: si está activa (y el pago online se puede usar), las reglas públicas; con el producto,
// hasta cuándo está reservado (también apagada: un artículo ya reservado no se ofrece).
async function ajustesReservaPublicos(supabase: SupabaseClient | null, modo: Modo | null, req: any) {
  if (!supabase) return { ok: true, activa: false };
  const a = await ajustesReservaActivos(supabase);
  const uid = a && modo === "prueba" ? await usuarioDeLaPeticion(supabase, req) : null;
  const activa = !!a && !!modo && (await pagoDisponible(supabase, modo, uid));
  const salida: Record<string, unknown> = { ok: true, activa };
  if (activa && a) Object.assign(salida, a);
  const producto = parametroDeLaUrl(req, "producto");
  if (UUID_RE.test(producto)) {
    const { data } = await supabase.from("products").select("reservado_hasta").eq("id", producto.toLowerCase()).maybeSingle<{ reservado_hasta: string | null }>();
    const hasta = data?.reservado_hasta ? Date.parse(data.reservado_hasta) : NaN;
    if (Number.isFinite(hasta) && hasta > Date.now()) salida.reservado_hasta = new Date(hasta).toISOString();
  }
  return salida;
}

// Las reservas de un artículo que aún cuentan (activas o pendientes de pago); las caducadas se ponen al día aquí.
async function reservasVigentes(supabase: SupabaseClient, productId: string): Promise<FilaReserva[]> {
  const { data, error } = await supabase
    .from("reservas")
    .select("id,product_id,user_id,dias,senal_eur,estado,vence_en,creado_en,pago_sesion")
    .eq("product_id", productId)
    .in("estado", ["pendiente_pago", "activa"]);
  if (error) throw new Rechazo(503, "falta preparar las reservas con señal");
  const ahora = Date.now();
  const vigentes: FilaReserva[] = [];
  for (const r of (data ?? []) as FilaReserva[]) {
    if (r.estado === "activa" && Date.parse(r.vence_en) <= ahora) {
      await supabase.from("reservas").update({ estado: "vencida", actualizado_en: new Date().toISOString() }).eq("id", r.id).eq("estado", "activa");
    } else if (r.estado === "pendiente_pago" && Date.parse(r.creado_en) <= ahora - (RESERVA_PAGO_MINUTOS + 1) * 60_000) {
      await supabase.from("reservas").update({ estado: "cancelada", actualizado_en: new Date().toISOString() }).eq("id", r.id).eq("estado", "pendiente_pago");
    } else vigentes.push(r);
  }
  return vigentes;
}

async function crearReserva(supabase: SupabaseClient, clave: string, modo: Modo, req: any, b: Record<string, unknown>) {
  const uid = await usuarioDeLaPeticion(supabase, req);
  if (!uid) throw new Rechazo(401, "inicia sesión para reservar");
  const a = await ajustesReservaActivos(supabase);
  if (!a) throw new Rechazo(403, "las reservas con señal no están activas");
  if (!(await pagoDisponible(supabase, modo, uid))) throw new Rechazo(403, "el pago online no está disponible");
  const productId = typeof b.producto === "string" && UUID_RE.test(b.producto) ? b.producto.toLowerCase() : null;
  if (!productId) throw new Rechazo(400, "artículo no válido");
  const dias = Number(b.dias);
  if (!Number.isInteger(dias) || dias < 1 || dias > a.dias_max) throw new Rechazo(400, `elige de 1 a ${a.dias_max} días`);
  if (b.acepta !== true) throw new Rechazo(400, "tienes que aceptar las condiciones de la reserva");
  const porcentaje = porcentajeDeReserva(a.escala, dias);
  if (porcentaje === null) throw new Rechazo(400, `elige de 1 a ${a.dias_max} días`);

  // El precio y el estado, de la base de datos (nunca del navegador).
  const { data: p, error } = await supabase
    .from("products")
    .select("id,title,price_eur,status,is_active,reservado_hasta")
    .eq("id", productId)
    .maybeSingle<{ id: string; title: string | null; price_eur: number | string | null; status: string | null; is_active: boolean | null; reservado_hasta: string | null }>();
  if (error) throw /reservado_hasta/.test(String(error.message ?? "")) ? new Rechazo(503, "falta preparar las reservas con señal") : new Rechazo(500, "no se pudo leer el artículo");
  if (!p || p.status !== "PUBLISHED" || p.is_active !== true) throw new Rechazo(409, "este artículo no está a la venta");
  const precioCts = Math.round(Number(p.price_eur) * 100);
  if (!Number.isFinite(precioCts) || precioCts <= 0 || precioCts > MAXIMO_CENTIMOS) throw new Rechazo(409, "este artículo no se puede reservar");

  // ¿Ya lo tiene reservado alguien (o lo está pagando otra persona ahora)? Una reserva propia sin pagar se cierra y se rehace.
  for (const r of await reservasVigentes(supabase, productId)) {
    if (r.estado === "activa") throw new Rechazo(409, "este artículo ya está reservado");
    if (r.user_id !== uid) throw new Rechazo(409, "otra persona está reservando este artículo ahora; vuelve a mirar en media hora");
    if (r.pago_sesion && SESION_RE.test(r.pago_sesion)) {
      const previa = await sesionDeStripe(clave, r.pago_sesion);
      if (previa?.status === "open") await llamarStripe(clave, "POST", `/checkout/sessions/${encodeURIComponent(previa.id)}/expire`);
      if (previa?.status === "complete") throw new Rechazo(409, "ya has pagado la señal de este artículo: mírala en Mis reservas");
    }
    await supabase.from("reservas").update({ estado: "cancelada", actualizado_en: new Date().toISOString() }).eq("id", r.id).eq("estado", "pendiente_pago");
  }

  const senalCts = Math.round((precioCts * porcentaje) / 100);
  if (senalCts < MINIMO_CENTIMOS) throw new Rechazo(409, "la señal de este artículo sería de menos de 0,50 €");
  const ahora = Date.now();
  const titulo = corta(p.title ?? "Artículo", 120);
  const { data: fila, error: errAlta } = await supabase
    .from("reservas")
    .insert({
      product_id: p.id,
      producto_titulo: titulo,
      user_id: uid,
      dias,
      porcentaje,
      senal_eur: senalCts / 100,
      precio_eur: precioCts / 100,
      vence_en: new Date(ahora + dias * DIA_MS).toISOString(),
      estado: "pendiente_pago",
      tipo_arras: a.tipo_arras,
      al_vencer_texto: a.al_vencer,
      condiciones_texto: a.texto_condiciones,
      condiciones_hash: createHash("sha256").update(a.texto_condiciones, "utf8").digest("hex"),
      aceptadas_condiciones_en: new Date(ahora).toISOString(),
    })
    .select("id")
    .single<{ id: string }>();
  if (errAlta || !fila?.id) {
    console.error("pago: no se pudo guardar la reserva", errAlta?.code ?? "");
    throw new Rechazo(500, "no se pudo guardar la reserva");
  }

  const minuto = Math.floor(ahora / 60_000);
  const caduca = (minuto + RESERVA_PAGO_MINUTOS) * 60;
  const origen = origenDe(req);
  const nombre = `Señal de reserva · ${corta(titulo, 60)} · VideojuegosZaragoza`;
  const campos: Record<string, string> = {
    mode: "payment",
    locale: "es",
    submit_type: "pay",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(senalCts),
    "line_items[0][price_data][product_data][name]": nombre,
    client_reference_id: fila.id,
    "metadata[reserva_id]": fila.id,
    "metadata[producto_id]": p.id,
    "payment_intent_data[description]": nombre,
    "payment_intent_data[metadata][reserva_id]": fila.id,
    success_url: `${origen}/perfil?tab=seguimientos&reserva=ok&sesion={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origen}/producto/${p.id}?reserva=cancelada`,
    expires_at: String(caduca),
  };
  const r = await abrirSesionStripe(clave, campos, await metodosOnline(supabase), `vz-reserva-${fila.id}-${senalCts}`);
  if (r.http !== 200 || typeof r.datos?.id !== "string" || typeof r.datos?.url !== "string") {
    console.error("pago: Stripe no abrió el pago de la señal", r.http, r.datos?.error?.code ?? "");
    await supabase.from("reservas").update({ estado: "cancelada", actualizado_en: new Date().toISOString() }).eq("id", fila.id);
    throw new Rechazo(502, "no se pudo abrir el pago");
  }
  await supabase.from("reservas").update({ pago_sesion: r.datos.id, pago_modo: modo }).eq("id", fila.id);
  // Apartado mientras dura el pago (si no paga, se suelta solo al pasar la hora).
  await supabase.from("products").update({ reservado_hasta: new Date(caduca * 1000).toISOString() }).eq("id", p.id);
  return { ok: true, url: r.datos.url as string };
}

// Una sesión de Stripe de una reserva: si está cobrada por el importe guardado, la reserva pasa a «activa» una sola vez.
async function confirmarPagoReserva(supabase: SupabaseClient, modo: Modo, s: SesionStripe) {
  const id = s.metadata?.reserva_id ?? "";
  if (!UUID_RE.test(id) || s.client_reference_id !== id) throw new Rechazo(404, "pago no encontrado");
  const { data: r, error } = await supabase.from("reservas").select("id,product_id,user_id,dias,senal_eur,estado,vence_en,creado_en,pago_sesion").eq("id", id).maybeSingle<FilaReserva>();
  if (error) throw new Rechazo(503, "falta preparar las reservas con señal");
  if (!r) throw new Rechazo(404, "pago no encontrado");
  if (r.estado === "activa" || r.estado === "completada") return { pagado: true, reserva: r.id };
  if (!sesionCobrada(s)) return { pagado: false, reserva: r.id };
  if (Math.round(Number(r.senal_eur) * 100) !== s.amount_total) {
    console.error(`pago: la reserva ${r.id} cobró ${s.amount_total} céntimos y la base de datos dice ${r.senal_eur} €: revísalo en Stripe`);
    return { pagado: false, reserva: r.id };
  }
  if (r.estado !== "pendiente_pago") {
    console.error(`pago: la señal de la reserva ${r.id} se ha cobrado pero la reserva estaba «${r.estado}»: devuélvela desde Stripe`);
    return { pagado: false, reserva: r.id };
  }
  const vence = new Date(Date.now() + Number(r.dias) * DIA_MS).toISOString();
  const { data: hecho, error: errApunte } = await supabase
    .from("reservas")
    .update({
      estado: "activa",
      pagado_en: new Date().toISOString(),
      pago_sesion: s.id,
      pago_modo: modo,
      pago_referencia: typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null,
      vence_en: vence,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", r.id)
    .eq("estado", "pendiente_pago")
    .select("id");
  if (errApunte) {
    // 23505: el artículo ya tiene otra reserva activa (dos pagos a la vez). El cobro hay que devolverlo desde Stripe.
    console.error(`pago: no se pudo activar la reserva ${r.id}`, errApunte.code ?? "", errApunte.code === "23505" ? "(ya había otra activa: devuélvela desde Stripe)" : "");
    if (errApunte.code === "23505") return { pagado: false, reserva: r.id };
    throw new Rechazo(500, "no se pudo apuntar el pago");
  }
  if (Array.isArray(hecho) && hecho.length && r.product_id) {
    await supabase.from("products").update({ reservado_hasta: vence }).eq("id", r.product_id);
  }
  return { pagado: true, reserva: r.id };
}

// Administración → Reservas: «Marcar completada», «Cancelar» o «Marcar vencida». Solo cambia el estado y suelta el
// artículo; NO devuelve dinero (si procede, el reembolso se hace en Stripe).
async function cambiarEstadoReserva(supabase: SupabaseClient, req: any, b: Record<string, unknown>) {
  if (!(await esAdministrador(supabase, await usuarioDeLaPeticion(supabase, req)))) throw new Rechazo(403, "solo para administradores");
  const id = typeof b.reserva === "string" && UUID_RE.test(b.reserva) ? b.reserva.toLowerCase() : null;
  const estado = typeof b.estado === "string" && ESTADOS_RESERVA_ADMIN.includes(b.estado) ? b.estado : null;
  if (!id || !estado) throw new Rechazo(400, "reserva no válida");
  const { data: r, error } = await supabase.from("reservas").select("id,product_id,estado,vence_en").eq("id", id).maybeSingle<Pick<FilaReserva, "id" | "product_id" | "estado" | "vence_en">>();
  if (error) throw new Rechazo(503, "falta preparar las reservas con señal");
  if (!r) throw new Rechazo(404, "reserva no encontrada");
  if (r.estado !== "activa" && r.estado !== "pendiente_pago") return { ok: true, estado: r.estado, ya: true };
  if (estado === "vencida" && Date.parse(r.vence_en) > Date.now()) throw new Rechazo(409, "esta reserva aún no ha vencido");
  const { error: errCambio } = await supabase.from("reservas").update({ estado, actualizado_en: new Date().toISOString() }).eq("id", r.id).in("estado", ["activa", "pendiente_pago"]);
  if (errCambio) throw new Rechazo(500, "no se pudo cambiar la reserva");
  if (r.product_id) await supabase.from("products").update({ reservado_hasta: null }).eq("id", r.product_id);
  return { ok: true, estado };
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
      // La clave pública de los avisos al móvil (es pública: la necesita el navegador para suscribirse).
      if (/[?&]avisos=clave(&|$)/.test(String(req.url ?? "")) || req.query?.avisos === "clave") {
        const v = vapidDelEntorno();
        responder(res, 200, { ok: true, configurado: !!v, clave: v ? v.publica : null });
        return;
      }
      // Reservar con señal: si está activa, sus reglas públicas (y si el artículo está reservado).
      if (parametroDeLaUrl(req, "reserva") === "ajustes") {
        responder(res, 200, await ajustesReservaPublicos(supabase, modo, req));
        return;
      }
      if (!modo || !supabase) {
        responder(res, 200, { ok: true, disponible: false, modo: null });
        return;
      }
      // La sesión solo hace falta con la clave de prueba (para saber si es el administrador).
      const uid = modo === "prueba" ? await usuarioDeLaPeticion(supabase, req) : null;
      const disponible = await pagoDisponible(supabase, modo, uid);
      const m = disponible ? await metodosOnline(supabase) : { klarna: false, bizum: false };
      responder(res, 200, { ok: true, disponible, modo: disponible ? modo : null, klarna: m.klarna, bizum: m.bizum });
      return;
    }
    if (req.method !== "POST") throw new Rechazo(405, "método no permitido");
    if (!supabase) throw new Rechazo(503, "el pago con tarjeta no está configurado");

    const crudo = await leerCuerpo(req);
    const texto = new TextDecoder("utf-8").decode(crudo);

    // Aviso de Stripe (webhook): firmado con el secreto del aviso.
    const firma = cabecera(req, "stripe-signature");
    if (firma) {
      if (!modo) throw new Rechazo(503, "el pago con tarjeta no está configurado");
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

    // La referencia del pedido (no necesita Stripe: también vale con el pago online sin configurar).
    if (b.accion === "referencia") {
      if (!(await consumirLimite(supabase, `pago:referencia:${cubo}`, LIMITE_CONFIRMAR)).permitido) throw new Rechazo(429, "demasiados intentos; espera unos minutos");
      responder(res, 200, await referenciaPedido(supabase, req, b));
      return;
    }
    // Aviso de prueba al móvil del dueño (tampoco necesita Stripe).
    if (b.accion === "avisos_prueba") {
      if (!(await consumirLimite(supabase, `pago:avisos:${cubo}`, LIMITE_CREAR)).permitido) throw new Rechazo(429, "demasiados intentos; espera unos minutos");
      responder(res, 200, await avisoDePrueba(supabase, req, b));
      return;
    }
    // Administración → Reservas: cambiar el estado (no necesita Stripe; no devuelve dinero).
    if (b.accion === "reserva_estado") {
      if (!(await consumirLimite(supabase, `pago:reserva_estado:${cubo}`, LIMITE_CONFIRMAR)).permitido) throw new Rechazo(429, "demasiados intentos; espera unos minutos");
      responder(res, 200, await cambiarEstadoReserva(supabase, req, b));
      return;
    }
    if (!modo) throw new Rechazo(503, "el pago con tarjeta no está configurado");

    if (b.accion === "reserva") {
      if (!(await consumirLimite(supabase, `pago:crear:${cubo}`, LIMITE_CREAR)).permitido) throw new Rechazo(429, "demasiados intentos; espera unos minutos");
      responder(res, 200, await crearReserva(supabase, clave, modo, req, b));
      return;
    }

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
