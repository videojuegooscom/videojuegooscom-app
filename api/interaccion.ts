/**
 * api/interaccion.ts
 *
 * Qué hace: función serverless de Vercel por la que pasan las VISITAS y los «ME GUSTA» de la tienda
 * (POST /api/interaccion). Antes el navegador llamaba directamente a funciones de la base de datos
 * (increment_product_view, increment_service_view y adjust_product_like) que cualquiera podía ejecutar
 * sin sesión y sin límite: un script subía o bajaba esas cifras a su gusto. Ahora esas funciones ya no
 * las ejecuta el navegador; este endpoint pone los límites y llama a funciones nuevas que solo puede
 * ejecutar el servidor (supabase/migrations/20261018130000_visitas_y_apoyos_protegidos.sql).
 *
 * Cuerpo (JSON):
 * - {accion: "vista_producto" | "vista_servicio", id: <uuid>}: suma 1 visita, pero SOLO la primera de cada
 *   visitante (cubo de IP) y página cada hora; las demás responden {ok:true, contado:false}.
 * - {accion: "apoyo", id: <uuid de producto>, activo: true|false, visitante?: <identificador del navegador>}:
 *   da o quita el «me gusta» de UNA persona (el usuario con sesión, si manda su token; si no, el
 *   identificador anónimo del navegador). El contador solo cambia si cambia el apunte de esa persona.
 * - {accion: "reservar", id: <uuid de producto>, token: <uuid del dispositivo>}: reserva 15 minutos el artículo
 *   para la cesta (reservar_producto_limitado, supabase/migrations/20261018140000_reservas_protegidas.sql).
 *   Responde {ok:true, hasta:<fecha>} o {ok:true, hasta:null} si lo tiene reservado otro cliente. Una persona
 *   (usuario con sesión o cubo de IP) no puede tener más de 8 / 4 reservas vivas a la vez: sin ese tope, un
 *   script dejaba toda la tienda «en la cesta de otro cliente» renovando reservas con tokens inventados.
 * Límites (compartidos entre instancias, función consumir_limite de 20261018120000_limite_peticiones.sql):
 * 60 peticiones por IP cada 10 minutos, 30 cambios de «me gusta» por persona cada hora y 12 reservas por IP
 * cada 10 minutos. Si el límite compartido no responde se usa uno en memoria con los cupos a la cuarta parte
 * (modo degradado): nunca se deja pasar todo.
 *
 * Variables de entorno (Vercel → Settings → Environment Variables, solo servidor):
 * - EXPO_PUBLIC_SUPABASE_URL y SUPABASE_CLAVE_SERVIDOR: llamar a las funciones de solo servidor.
 *
 * Conectado con: app/producto/[id].tsx (visitas y «me gusta»), app/servicio/[id].tsx (visitas). Si este
 * endpoint no responde, el navegador cae a las funciones antiguas (que dejan de funcionar al aplicar la
 * migración; entonces simplemente no se cuenta).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// --- Límite de peticiones COMPARTIDO entre instancias --------------------------------------------
// (El mismo bloque está en api/blue-ia.ts, api/escaparate-retorno.ts y api/noticias-gaming.ts: cada
// función es autónoma y no comparte archivos.)
type LimiteCuenta = { max: number; ventanaSegundos: number };

// La IP real del visitante: Vercel la pone en x-vercel-forwarded-for y no se puede falsear desde fuera;
// x-forwarded-for solo como último recurso (puede traer lo que mande el cliente).
function ipDelCliente(req: any): string {
  for (const nombre of ["x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"]) {
    const v = req.headers?.[nombre];
    const primero = Array.isArray(v) ? v[0] : v;
    if (typeof primero === "string" && primero.trim()) return primero.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "desconocida";
}

// «Cubo» de la IP: hash de IP + día, módulo 4.096. No se guarda la IP real y la tabla no crece sin límite.
async function cuboDeIp(ip: string): Promise<string> {
  const dia = new Date().toISOString().slice(0, 10);
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ip}|${dia}`)));
  return String(((h[0] << 8) | h[1]) % 4096);
}

const contadoresMemoria = new Map<string, { inicio: number; n: number }>();
function consumirEnMemoria(clave: string, { max, ventanaSegundos }: LimiteCuenta): { permitido: boolean; reiniciaEn: number } {
  const ahora = Date.now();
  const actual = contadoresMemoria.get(clave);
  const c = actual && ahora - actual.inicio < ventanaSegundos * 1000 ? actual : { inicio: ahora, n: 0 };
  c.n += 1;
  contadoresMemoria.set(clave, c);
  if (contadoresMemoria.size > 2000) {
    for (const [k, v] of contadoresMemoria) if (ahora - v.inicio > 3_600_000) contadoresMemoria.delete(k);
  }
  return { permitido: c.n <= max, reiniciaEn: Math.max(1, Math.ceil((c.inicio + ventanaSegundos * 1000 - ahora) / 1000)) };
}

// Modo degradado: sin límite compartido (la función aún no existe, la base de datos no responde o tarda
// demasiado) cada instancia de Vercel cuenta sola y una instancia nueva empieza de cero, así que lo que
// podría colarse crece con el número de instancias. Por eso, en ese modo: los cupos se reducen a la cuarta
// parte (mínimo 1), la consulta compartida no espera más de 2 s y, tras un fallo, no se vuelve a intentar
// durante 30 s para no frenar cada petición mientras dure la caída. (LIMITE_PAUSA_MS cambia esa pausa.)
const DIVISOR_DEGRADADO = 4;
const ESPERA_LIMITE_MS = 2000;
const PAUSA_TRAS_FALLO_MS = 30_000;
let sinLimiteCompartidoHasta = 0;
let ultimoAvisoDegradado = 0;

function cupoDegradado({ max, ventanaSegundos }: LimiteCuenta): LimiteCuenta {
  return { max: Math.max(1, Math.floor(max / DIVISOR_DEGRADADO)), ventanaSegundos };
}

async function consumirLimite(supabase: SupabaseClient, clave: string, limite: LimiteCuenta): Promise<{ permitido: boolean; reiniciaEn: number }> {
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
      if (!error && data && typeof data === "object") {
        const d = data as { permitido?: boolean; reinicia_en?: number };
        return { permitido: d.permitido === true, reiniciaEn: Number(d.reinicia_en ?? limite.ventanaSegundos) };
      }
    } catch {
      // sin límite compartido: modo degradado
    } finally {
      clearTimeout(temporizador);
    }
    const pausa = Number(process.env.LIMITE_PAUSA_MS);
    sinLimiteCompartidoHasta = Date.now() + (Number.isFinite(pausa) && pausa >= 0 ? pausa : PAUSA_TRAS_FALLO_MS);
    if (Date.now() - ultimoAvisoDegradado > 60_000) {
      ultimoAvisoDegradado = Date.now();
      console.warn("limite: el límite compartido no responde; se usa el de esta instancia con cupos reducidos");
    }
  }
  return consumirEnMemoria(clave, cupoDegradado(limite));
}

// ¿Quién pregunta? Si el navegador manda el token de sesión y Supabase lo da por bueno, el id del usuario;
// si no, null. Un token falso o caducado nunca da identidad.
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

// --- receptor ----------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VISITANTE_RE = /^[A-Za-z0-9_-]{8,80}$/;
const LIMITE_IP: LimiteCuenta = { max: 60, ventanaSegundos: 600 };
const LIMITE_APOYOS: LimiteCuenta = { max: 30, ventanaSegundos: 3600 };
const UNA_VISTA_POR_HORA: LimiteCuenta = { max: 1, ventanaSegundos: 3600 };
// Reservas de la cesta: 12 peticiones por IP cada 10 minutos y 600 en total; y, en la base de datos, como
// mucho 4 reservas vivas a la vez por IP (cubo) o 8 por usuario con sesión (reservar_producto_limitado).
const LIMITE_RESERVAS_IP: LimiteCuenta = { max: 12, ventanaSegundos: 600 };
const LIMITE_RESERVAS_GLOBAL: LimiteCuenta = { max: 600, ventanaSegundos: 600 };
const MAX_RESERVAS_ANONIMO = 4;
const MAX_RESERVAS_USUARIO = 8;

function responder(res: any, http: number, cuerpo: Record<string, unknown>) {
  res.setHeader("Cache-Control", "no-store");
  res.status(http).json(cuerpo);
}

// ¿La ficha existe y está publicada? Solo entonces se apunta algo (límite por ficha y persona, visita o
// «me gusta»). Es una lectura por clave primaria y va después del cupo por IP, que la acota.
async function fichaPublicada(supabase: SupabaseClient, tabla: "products" | "services", id: string): Promise<boolean> {
  const { data, error } = await supabase.from(tabla).select("id").eq("id", id).eq("status", "PUBLISHED").eq("is_active", true).limit(1);
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    responder(res, 405, { ok: false, error: "método no permitido" });
    return;
  }

  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
  const accion = typeof body.accion === "string" ? body.accion : "";
  const id = typeof body.id === "string" ? body.id.toLowerCase() : "";
  if (!["vista_producto", "vista_servicio", "apoyo", "reservar"].includes(accion) || !UUID_RE.test(id)) {
    responder(res, 400, { ok: false, error: "petición no válida" });
    return;
  }
  const visitante = typeof body.visitante === "string" && VISITANTE_RE.test(body.visitante) ? body.visitante : null;
  if (accion === "apoyo" && typeof body.activo !== "boolean") {
    responder(res, 400, { ok: false, error: "petición no válida" });
    return;
  }
  const tokenReserva = typeof body.token === "string" ? body.token.toLowerCase() : "";
  if (accion === "reservar" && !UUID_RE.test(tokenReserva)) {
    responder(res, 400, { ok: false, error: "petición no válida" });
    return;
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const claveServidor = process.env.SUPABASE_CLAVE_SERVIDOR;
  if (!supabaseUrl || !claveServidor) {
    responder(res, 503, { ok: false, error: "sin configurar" });
    return;
  }
  const supabase = createClient(supabaseUrl, claveServidor, { auth: { persistSession: false, autoRefreshToken: false } });

  // Cupo por IP para todo lo de este endpoint.
  const cubo = await cuboDeIp(ipDelCliente(req));
  const cupo = await consumirLimite(supabase, `interaccion:ip:${cubo}`, LIMITE_IP);
  if (!cupo.permitido) {
    res.setHeader("Retry-After", String(cupo.reiniciaEn));
    responder(res, 429, { ok: false, error: "demasiadas peticiones" });
    return;
  }

  try {
    if (accion === "reservar") {
      // Reserva de 15 minutos al añadir a la cesta. Dos topes: peticiones por IP y, en la base de datos,
      // reservas vivas por persona (usuario con sesión o cubo de IP): así un script no puede dejar toda la
      // tienda «en la cesta de otro cliente» renovando reservas con un token nuevo cada vez.
      const usuario = await usuarioDeLaPeticion(supabase, req);
      const porIp = await consumirLimite(supabase, `reserva:ip:${cubo}`, LIMITE_RESERVAS_IP);
      const global = porIp.permitido ? await consumirLimite(supabase, "reserva:global", LIMITE_RESERVAS_GLOBAL) : porIp;
      if (!global.permitido) {
        res.setHeader("Retry-After", String(global.reiniciaEn));
        responder(res, 429, { ok: false, error: "demasiadas reservas" });
        return;
      }
      const { data, error } = await supabase.rpc("reservar_producto_limitado", {
        p_product_id: id,
        p_token: tokenReserva,
        p_persona: usuario ? `usuario:${usuario}` : `ip:${cubo}`,
        p_max_activas: usuario ? MAX_RESERVAS_USUARIO : MAX_RESERVAS_ANONIMO,
      });
      if (error) {
        const mensaje = error.message ?? "";
        if (/demasiadas reservas activas/.test(mensaje)) {
          res.setHeader("Retry-After", "60");
          responder(res, 429, { ok: false, error: "demasiadas reservas activas" });
          return;
        }
        if (/foreign key|reservas_cesta_product_id_fkey/i.test(mensaje)) {
          responder(res, 404, { ok: false, error: "producto no encontrado" });
          return;
        }
        throw error;
      }
      // hasta = null: ese artículo lo tiene reservado ahora otro cliente.
      responder(res, 200, { ok: true, hasta: typeof data === "string" ? data : null });
      return;
    }

    if (accion === "vista_producto" || accion === "vista_servicio") {
      // Solo cuenta la primera visita de cada visitante (cubo de IP) a cada página cada hora.
      if (!(await fichaPublicada(supabase, accion === "vista_producto" ? "products" : "services", id))) {
        responder(res, 200, { ok: true, contado: false });
        return;
      }
      const primera =await consumirLimite(supabase, `vista:${accion}:${id}:${cubo}`, UNA_VISTA_POR_HORA);
      if (!primera.permitido) {
        responder(res, 200, { ok: true, contado: false });
        return;
      }
      const { data, error } =
        accion === "vista_producto"
          ? await supabase.rpc("sumar_vista_producto", { p_producto: id })
          : await supabase.rpc("sumar_vista_servicio", { p_servicio: id });
      if (error) throw error;
      responder(res, 200, { ok: true, contado: true, ...(typeof data === "number" ? { total: data } : {}) });
      return;
    }

    // «Me gusta»: por usuario con sesión o, si no, por el identificador anónimo del navegador.
    if (!(await fichaPublicada(supabase, "products", id))) {
      responder(res, 404, { ok: false, error: "producto no encontrado" });
      return;
    }
    const usuario = await usuarioDeLaPeticion(supabase, req);
    const persona = usuario ? `usuario:${usuario}` : visitante ? `visitante:${visitante}` : null;
    if (!persona) {
      responder(res, 400, { ok: false, error: "falta el identificador del visitante" });
      return;
    }
    const cambios = await consumirLimite(supabase, `apoyo:${persona}`, LIMITE_APOYOS);
    if (!cambios.permitido) {
      res.setHeader("Retry-After", String(cambios.reiniciaEn));
      responder(res, 429, { ok: false, error: "demasiados cambios" });
      return;
    }
    const { data, error } = await supabase.rpc("fijar_apoyo", { p_producto: id, p_persona: persona, p_activo: body.activo === true });
    if (error) {
      if (/no encontrado/.test(error.message ?? "")) {
        responder(res, 404, { ok: false, error: "producto no encontrado" });
        return;
      }
      throw error;
    }
    responder(res, 200, { ok: true, ...(typeof data === "number" ? { total: data } : {}) });
  } catch (e: unknown) {
    console.error("interaccion: error", e);
    responder(res, 502, { ok: false, error: "no se pudo registrar" });
  }
}
