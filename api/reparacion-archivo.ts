/**
 * api/reparacion-archivo.ts
 *
 * Qué hace: descarga de los archivos de una reparación por envío (dueño, 2026-11-11): la etiqueta de Correos (PDF) y las
 * fotos de cómo llegó el aparato. Están en el almacén PRIVADO «reparaciones», que el navegador del cliente nunca lee
 * directamente: aquí se comprueba quién pregunta y se dan enlaces firmados de corta duración. El mismo patrón que
 * api/factura.ts.
 *
 * Petición: GET /api/reparacion-archivo?solicitud=<uuid>&tipo=etiqueta|fotos con «Authorization: Bearer <sesión>».
 * - tipo=etiqueta → 200 { ok: true, url }: enlace firmado de 60 s que descarga el PDF (como archivo).
 * - tipo=fotos → 200 { ok: true, fotos: [{ id, url }] }: enlaces firmados de 5 minutos (para verlas y ampliarlas).
 * - 400 datos no válidos · 401 sin sesión · 404 no hay archivo todavía (o la solicitud no es de quien llama: no se dice
 *   si existe) · 429 demasiadas peticiones · 503 sin configurar o sin la migración 20261111100000.
 * Solo el cliente dueño de la solicitud (service_requests.customer_user_id) o un administrador (profiles.role = 'admin').
 * Límite por IP (consumir_limite, compartido; en memoria con cupos reducidos si no responde): 60 cada 10 minutos.
 *
 * Variables de entorno (solo servidor): EXPO_PUBLIC_SUPABASE_URL y SUPABASE_CLAVE_SERVIDOR.
 *
 * Conectado con: supabase/migrations/20261111100000_reparacion_envio.sql (columnas etiqueta_path y recepcion_fotos, y el
 * almacén «reparaciones»), app/admin/services.tsx (sube los archivos), app/(tabs)/perfil.tsx («Descargar etiqueta» y las
 * fotos de recepción en «Mis seguimientos»), api/factura.ts (mismo bloque de límite y de sesión), pruebas/perfil-datos.mjs
 * (sección RE2, con esta API simulada).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "reparaciones";
const SEGUNDOS_ETIQUETA = 60;
const SEGUNDOS_FOTOS = 300;
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

// --- Límite de peticiones COMPARTIDO entre instancias (el mismo bloque que api/factura.ts) -------------------------
type LimiteCuenta = { max: number; ventanaSegundos: number };
const LIMITE: LimiteCuenta = { max: 60, ventanaSegundos: 600 };

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

// Solo rutas de esa misma solicitud dentro del almacén («<solicitud>/archivo.ext»): nada de «..» ni de otras carpetas.
function rutaValida(ruta: unknown, solicitudId: string): ruta is string {
  return typeof ruta === "string" && ruta.startsWith(`${solicitudId}/`) && /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,120}$/i.test(ruta) && !ruta.includes("..");
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") throw new Rechazo(405, "método no permitido");
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const claveServidor = process.env.SUPABASE_CLAVE_SERVIDOR;
    if (!supabaseUrl || !claveServidor) throw new Rechazo(503, "descargas de reparaciones sin configurar");
    const supabase = createClient(supabaseUrl, claveServidor, { auth: { persistSession: false, autoRefreshToken: false } });

    const solicitudId = parametro(req, "solicitud").trim().toLowerCase();
    const tipo = parametro(req, "tipo").trim();
    if (!UUID_RE.test(solicitudId) || (tipo !== "etiqueta" && tipo !== "fotos")) throw new Rechazo(400, "petición no válida");
    if (!(await consumirLimite(supabase, `reparacion-archivo:${await cuboDeIp(ipDelCliente(req))}`, LIMITE)).permitido) {
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
      const nombre = `etiqueta-correos${fila.codigo_seguimiento ? `-${fila.codigo_seguimiento}` : ""}.pdf`;
      const { data: firmado, error: errFirma } = await supabase.storage.from(BUCKET).createSignedUrl(fila.etiqueta_path, SEGUNDOS_ETIQUETA, { download: nombre });
      if (errFirma || !firmado?.signedUrl) throw new Rechazo(502, "no se pudo preparar la descarga");
      responder(res, 200, { ok: true, url: firmado.signedUrl });
      return;
    }

    const rutas = (Array.isArray(fila.recepcion_fotos) ? fila.recepcion_fotos : []).filter((r): r is string => rutaValida(r, fila.id)).slice(0, 3);
    if (!rutas.length) throw new Rechazo(404, "aún no hay fotos");
    const { data: firmados, error: errFotos } = await supabase.storage.from(BUCKET).createSignedUrls(rutas, SEGUNDOS_FOTOS);
    if (errFotos || !firmados) throw new Rechazo(502, "no se pudieron preparar las fotos");
    const fotos = firmados
      .map((f, i) => ({ id: String(i + 1), url: f.signedUrl ?? "" }))
      .filter((f) => !!f.url);
    responder(res, 200, { ok: true, fotos });
  } catch (e: unknown) {
    const r = e instanceof Rechazo ? e : new Rechazo(500, "error interno");
    if (!(e instanceof Rechazo)) console.error("reparacion-archivo: error inesperado", e);
    responder(res, r.http, { ok: false, error: r.message });
  }
}
