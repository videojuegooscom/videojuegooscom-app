/**
 * api/factura.ts
 *
 * Qué hace: descarga de la factura de un pedido (dueño, 2026-11-10). Las facturas las emite VeoAura.com y llegan por el
 * puente firmado (evento «factura» de api/escaparate-veoaura.ts); su PDF está en el almacén PRIVADO «facturas», que el
 * navegador nunca lee directamente. Aquí se comprueba quién pregunta y se da un enlace firmado de 60 s para bajarlo.
 *
 * Petición: GET /api/factura?pedido=<uuid del pedido> con «Authorization: Bearer <sesión>».
 * - 200 { ok: true, url, numero_factura }: url es un enlace firmado de 60 s que descarga el PDF (como archivo).
 * - 400 pedido no válido · 401 sin sesión · 404 no hay factura todavía (o el pedido no es de quien llama: no se dice
 *   si existe) · 409 «La factura está llegando, prueba en unos minutos» (la fila existe y el PDF aún no) · 429 demasiadas
 *   peticiones · 503 sin configurar o sin la migración 20261110100000.
 * Solo el cliente dueño del pedido (pedidos.user_id) o un administrador (profiles.role = 'admin').
 * Límite por IP (consumir_limite, compartido; en memoria con cupos reducidos si no responde): 30 cada 10 minutos.
 *
 * También descarga los archivos de una reparación por envío (dueño, 2026-11-11), en esta misma función porque el plan
 * gratis de Vercel admite 12 funciones como máximo: la etiqueta de Correos (PDF) y las fotos de cómo llegó el aparato,
 * del almacén PRIVADO «reparaciones».
 * Petición: GET /api/factura?solicitud=<uuid>&tipo=etiqueta|fotos con «Authorization: Bearer <sesión>».
 * - tipo=etiqueta → 200 { ok: true, url }: enlace firmado de 60 s que descarga el PDF (como archivo).
 * - tipo=fotos → 200 { ok: true, fotos: [{ id, url }] }: enlaces firmados de 5 minutos (para verlas y ampliarlas).
 * - 400 · 401 · 404 (no hay archivo, o la solicitud no es de quien llama) · 429 · 503 sin la migración 20261111100000.
 * Solo el cliente dueño de la solicitud (service_requests.customer_user_id) o un administrador. 60 cada 10 minutos.
 *
 * Variables de entorno (solo servidor): EXPO_PUBLIC_SUPABASE_URL y SUPABASE_CLAVE_SERVIDOR.
 *
 * Conectado con: supabase/migrations/20261111100000_reparacion_envio.sql (etiqueta_path, recepcion_fotos y el almacén
 * «reparaciones»; los sube app/admin/services.tsx y se ven en «Mis seguimientos» de app/(tabs)/perfil.tsx, sección RE2
 * de pruebas/perfil-datos.mjs),
 * supabase/migrations/20261110100000_facturas_veoaura.sql (pedido_facturas y el almacén «facturas»),
 * api/escaparate-veoaura.ts (guarda la factura y su PDF), app/(tabs)/perfil.tsx («Descargar factura» en «Mis pedidos»),
 * app/admin/pedidos.tsx («Descargar» de cada pedido), api/pago.ts (mismo bloque de límite y de sesión),
 * pruebas/perfil-datos.mjs (sección FA, con esta API simulada).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "facturas";
const SEGUNDOS_ENLACE = 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const codificar = new TextEncoder();

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

// --- Límite de peticiones COMPARTIDO entre instancias (el mismo bloque que api/pago.ts) ---------------------------
type LimiteCuenta = { max: number; ventanaSegundos: number };
const LIMITE_DESCARGAR: LimiteCuenta = { max: 30, ventanaSegundos: 600 };
const LIMITE_REPARACION: LimiteCuenta = { max: 60, ventanaSegundos: 600 };
const BUCKET_REPARACIONES = "reparaciones";
const SEGUNDOS_FOTOS = 300;

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

async function esAdministrador(supabase: SupabaseClient, uid: string): Promise<boolean> {
  const { data } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle<{ role: string }>();
  return data?.role === "admin";
}

function parametro(req: any, nombre: string): string {
  const q = req.query?.[nombre];
  if (typeof q === "string") return q;
  if (Array.isArray(q)) return String(q[0] ?? "");
  try {
    return new URL(String(req.url ?? ""), "https://videojuegoszaragoza.com").searchParams.get(nombre) ?? "";
  } catch {
    return "";
  }
}

// El nombre con el que se guarda el PDF: «factura-F-2026-0012.pdf» (solo letras, cifras y guiones).
function nombreArchivo(numero: string | null): string {
  const limpio = String(numero ?? "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `factura${limpio ? `-${limpio}` : ""}.pdf`;
}

// Solo rutas de esa misma solicitud dentro del almacén («<solicitud>/archivo.ext»): nada de «..» ni de otras carpetas.
function rutaValida(ruta: unknown, solicitudId: string): ruta is string {
  return typeof ruta === "string" && ruta.startsWith(`${solicitudId}/`) && /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,120}$/i.test(ruta) && !ruta.includes("..");
}

// Etiqueta de Correos o fotos de recepción de una reparación por envío (ver la cabecera).
async function archivoDeReparacion(supabase: SupabaseClient, req: any, res: any, solicitudParam: string) {
  const solicitudId = solicitudParam.trim().toLowerCase();
  const tipo = parametro(req, "tipo").trim();
  if (!UUID_RE.test(solicitudId) || (tipo !== "etiqueta" && tipo !== "fotos")) throw new Rechazo(400, "petición no válida");
  if (!(await consumirLimite(supabase, `reparacion-archivo:${await cuboDeIp(ipDelCliente(req))}`, LIMITE_REPARACION)).permitido) {
    throw new Rechazo(429, "demasiadas descargas; espera unos minutos");
  }
  const uid = await usuarioDeLaPeticion(supabase, req);
  if (!uid) throw new Rechazo(401, "inicia sesión para descargarlo");

  const { data: fila, error } = await supabase
    .from("service_requests")
    .select("id,customer_user_id,codigo_seguimiento,etiqueta_path,recepcion_fotos")
    .eq("id", solicitudId)
    .maybeSingle<{ id: string; customer_user_id: string | null; codigo_seguimiento: string | null; etiqueta_path: string | null; recepcion_fotos: unknown }>();
  if (error) {
    const sinColumnas = error.code === "42703" || /etiqueta_path|recepcion_fotos/.test(String(error.message ?? ""));
    throw sinColumnas ? new Rechazo(503, "la reparación por envío aún no está activada") : new Rechazo(500, "no se pudo leer la solicitud");
  }
  // Si la solicitud no es suya (y no es administrador), lo mismo que si no existiera.
  if (!fila || (fila.customer_user_id !== uid && !(await esAdministrador(supabase, uid)))) throw new Rechazo(404, "no hay archivo todavía");

  if (tipo === "etiqueta") {
    if (!rutaValida(fila.etiqueta_path, fila.id)) throw new Rechazo(404, "la etiqueta aún no está lista");
    const nombre = `etiqueta-correos${fila.codigo_seguimiento ? `-${String(fila.codigo_seguimiento).replace(/[^A-Za-z0-9_-]+/g, "")}` : ""}.pdf`;
    const { data: firmado, error: errFirma } = await supabase.storage.from(BUCKET_REPARACIONES).createSignedUrl(fila.etiqueta_path, SEGUNDOS_ENLACE, { download: nombre });
    if (errFirma || !firmado?.signedUrl) throw new Rechazo(502, "no se pudo preparar la descarga");
    responder(res, 200, { ok: true, url: firmado.signedUrl });
    return;
  }

  const rutas = (Array.isArray(fila.recepcion_fotos) ? fila.recepcion_fotos : []).filter((r): r is string => rutaValida(r, fila.id)).slice(0, 3);
  if (!rutas.length) throw new Rechazo(404, "aún no hay fotos");
  const { data: firmados, error: errFotos } = await supabase.storage.from(BUCKET_REPARACIONES).createSignedUrls(rutas, SEGUNDOS_FOTOS);
  if (errFotos || !firmados) throw new Rechazo(502, "no se pudieron preparar las fotos");
  const fotos = firmados.map((f, i) => ({ id: String(i + 1), url: f.signedUrl ?? "" })).filter((f) => !!f.url);
  responder(res, 200, { ok: true, fotos });
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") throw new Rechazo(405, "método no permitido");
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const claveServidor = process.env.SUPABASE_CLAVE_SERVIDOR;
    if (!supabaseUrl || !claveServidor) throw new Rechazo(503, "descarga de facturas sin configurar");
    const supabase = createClient(supabaseUrl, claveServidor, { auth: { persistSession: false, autoRefreshToken: false } });

    const solicitud = parametro(req, "solicitud");
    if (solicitud) {
      await archivoDeReparacion(supabase, req, res, solicitud);
      return;
    }

    const pedidoId = parametro(req, "pedido").trim().toLowerCase();
    if (!UUID_RE.test(pedidoId)) throw new Rechazo(400, "pedido no válido");
    if (!(await consumirLimite(supabase, `factura:${await cuboDeIp(ipDelCliente(req))}`, LIMITE_DESCARGAR)).permitido) {
      throw new Rechazo(429, "demasiadas descargas; espera unos minutos");
    }
    const uid = await usuarioDeLaPeticion(supabase, req);
    if (!uid) throw new Rechazo(401, "inicia sesión para descargar la factura");

    const { data: pedido, error: errPedido } = await supabase.from("pedidos").select("id,user_id").eq("id", pedidoId).maybeSingle<{ id: string; user_id: string | null }>();
    if (errPedido) throw new Rechazo(500, "no se pudo leer el pedido");
    // Si el pedido no es suyo (y no es administrador), lo mismo que si no existiera.
    if (!pedido || (pedido.user_id !== uid && !(await esAdministrador(supabase, uid)))) throw new Rechazo(404, "no hay factura todavía");

    const { data: facturas, error } = await supabase
      .from("pedido_facturas")
      .select("numero_factura,pdf_path,fecha,recibida_en")
      .eq("pedido_id", pedido.id)
      .order("fecha", { ascending: false })
      .order("recibida_en", { ascending: false })
      .limit(1);
    if (error) {
      const sinTabla = error.code === "42P01" || error.code === "PGRST205" || /pedido_facturas/.test(String(error.message ?? ""));
      throw sinTabla ? new Rechazo(503, "las facturas aún no están activadas") : new Rechazo(500, "no se pudo leer la factura");
    }
    const factura = (facturas ?? [])[0] as { numero_factura: string | null; pdf_path: string | null } | undefined;
    if (!factura) throw new Rechazo(404, "no hay factura todavía");
    if (!factura.pdf_path) throw new Rechazo(409, "La factura está llegando, prueba en unos minutos");

    const { data: firmado, error: errFirma } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(factura.pdf_path, SEGUNDOS_ENLACE, { download: nombreArchivo(factura.numero_factura) });
    if (errFirma || !firmado?.signedUrl) throw new Rechazo(502, "no se pudo preparar la descarga");
    responder(res, 200, { ok: true, url: firmado.signedUrl, numero_factura: factura.numero_factura });
  } catch (e: unknown) {
    const r = e instanceof Rechazo ? e : new Rechazo(500, "error interno");
    if (!(e instanceof Rechazo)) console.error("factura: error inesperado", e);
    responder(res, r.http, { ok: false, error: r.message });
  }
}
