/**
 * api/asignar-seguimiento.ts
 *
 * Qué hace: desde Administración → Chat, el administrador asigna un seguimiento al cliente de esa conversación: crea
 * su pedido o su reparación o mantenimiento YA en la cuenta de ese cliente (lo ve al momento en Perfil → «Mis
 * seguimientos», con su número de seguimiento y su etapa). Para escribir en el chat de la tienda hace falta cuenta, así
 * que el cliente de cualquier conversación ya está registrado y no tiene que escribir ningún número.
 *
 * Por qué en el servidor: un administrador no puede crear pedidos desde el navegador (la base de datos solo deja crearlos
 * al comprar) y una reparación creada desde el navegador quedaría a su nombre (el disparador pone la cuenta de quien la
 * crea). Aquí se hace con la clave del servidor y SOLO si quien llama es administrador (su sesión y su rol se comprueban
 * en Supabase). La cuenta del cliente sale de la conversación (product_chats.customer_user_id), no de lo que mande el
 * navegador, así que no se puede asignar a cualquiera. El número de seguimiento lo pone la base de datos (migración
 * 20261031170000). Se marca en nota_admin («Asignado desde el chat», nota interna que el cliente no ve) para contarlo en
 * Administración.
 *
 * Petición: POST con «Authorization: Bearer <sesión del administrador>» y
 *   { chat_id, tipo: "pedido" | "reparacion", titulo ≤ 120, etapa (las de «Mis seguimientos»), nota ≤ 500 (reparación),
 *     entrega: "envio" | "recogida", total_eur, telefono ≤ 30 (pedido) }.
 * Respuesta 200 { ok: true, tipo, titulo, codigo_seguimiento, numero_pedido? }; 400 datos no válidos, 401 sin sesión,
 * 403 no es administrador, 404 conversación no encontrada, 503 sin configurar o sin la migración de los números.
 *
 * Conectado con: app/admin/chats.tsx (botón «Asignar seguimiento»), app/admin/pedidos.tsx y app/admin/services.tsx
 * (cuentan los asignados desde el chat), app/(tabs)/perfil.tsx («Mis seguimientos»).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ETAPAS_REPARACION = ["solicitado", "recibido", "diagnostico", "reparando", "listo", "entregado", "cancelado"];
const ETAPAS_PEDIDO = ["pendiente", "confirmado", "preparado", "enviado", "entregado", "cancelado"];
export const NOTA_ASIGNADO_CHAT = "Asignado desde el chat";

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

function texto(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") throw new Rechazo(400, "campo de texto no válido");
  const limpio = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (limpio.length > max) throw new Rechazo(400, "texto demasiado largo");
  return limpio || null;
}

type Asignacion = {
  chatId: string;
  tipo: "pedido" | "reparacion";
  titulo: string;
  etapa: string;
  nota: string | null;
  entrega: "envio" | "recogida";
  total: number;
  telefono: string | null;
};

function validar(b: Record<string, unknown>): Asignacion {
  const chatId = typeof b.chat_id === "string" && UUID_RE.test(b.chat_id) ? b.chat_id.toLowerCase() : null;
  if (!chatId) throw new Rechazo(400, "conversación no válida");
  const tipo = b.tipo === "pedido" ? "pedido" : b.tipo === "reparacion" ? "reparacion" : null;
  if (!tipo) throw new Rechazo(400, "tipo no válido");
  const titulo = texto(b.titulo, 120);
  if (!titulo) throw new Rechazo(400, "falta el título");
  const etapas = tipo === "pedido" ? ETAPAS_PEDIDO : ETAPAS_REPARACION;
  const etapa = typeof b.etapa === "string" && etapas.includes(b.etapa) ? b.etapa : null;
  if (!etapa) throw new Rechazo(400, "etapa no válida");
  const nota = tipo === "reparacion" ? texto(b.nota, 500) : null;
  const entrega = b.entrega === "recogida" ? "recogida" : "envio";
  const total = tipo === "pedido" ? Number(b.total_eur) : 0;
  if (tipo === "pedido" && (typeof b.total_eur !== "number" || !Number.isFinite(total) || total < 0 || total > 1_000_000)) {
    throw new Rechazo(400, "importe no válido");
  }
  const telefono = tipo === "pedido" ? texto(b.telefono, 30) : null;
  if (telefono && telefono.length < 6) throw new Rechazo(400, "teléfono no válido");
  return { chatId, tipo, titulo, etapa, nota, entrega, total: Math.round(total * 100) / 100, telefono };
}

// ¿Quién llama? Solo un administrador con sesión válida.
async function administrador(supabase: SupabaseClient, req: any): Promise<string> {
  const cab = req.headers?.authorization;
  const valor = Array.isArray(cab) ? cab[0] : cab;
  if (typeof valor !== "string" || !/^Bearer\s+\S+$/i.test(valor.trim())) throw new Rechazo(401, "sin sesión");
  const { data, error } = await supabase.auth.getUser(valor.trim().replace(/^Bearer\s+/i, ""));
  const uid = !error && data?.user?.id ? data.user.id : null;
  if (!uid) throw new Rechazo(401, "sin sesión");
  const { data: perfil } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle<{ role: string }>();
  if (perfil?.role !== "admin") throw new Rechazo(403, "solo para administradores");
  return uid;
}

function faltaNumeros(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === "42703" || /codigo_seguimiento/.test(String(error.message ?? "")));
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") throw new Rechazo(405, "método no permitido");
    const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
    const a = validar(body);

    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const claveServidor = process.env.SUPABASE_CLAVE_SERVIDOR;
    if (!supabaseUrl || !claveServidor) throw new Rechazo(503, "sin configurar");
    const supabase = createClient(supabaseUrl, claveServidor, { auth: { persistSession: false, autoRefreshToken: false } });

    await administrador(supabase, req);

    // El cliente es el de la conversación (no lo elige el navegador).
    const { data: chat, error: errChat } = await supabase
      .from("product_chats")
      .select("id,customer_user_id,product_id")
      .eq("id", a.chatId)
      .maybeSingle<{ id: string; customer_user_id: string; product_id: string | null }>();
    if (errChat) throw new Rechazo(500, "no se pudo leer la conversación");
    if (!chat?.customer_user_id) throw new Rechazo(404, "conversación no encontrada");
    const cliente = chat.customer_user_id;

    // Nombre y correo del cliente (para el pedido y para reconocerlo en el panel).
    const [{ data: cuenta }, { data: perfilCliente }] = await Promise.all([
      supabase.auth.admin.getUserById(cliente),
      supabase.from("perfiles_cliente").select("nombre").eq("user_id", cliente).maybeSingle<{ nombre: string | null }>(),
    ]);
    const email = cuenta?.user?.email ?? "";
    const metadatos = (cuenta?.user?.user_metadata ?? {}) as { full_name?: unknown };
    const candidato = [perfilCliente?.nombre, typeof metadatos.full_name === "string" ? metadatos.full_name : null, email.split("@")[0]]
      .map((n) => (n ?? "").trim())
      .find((n) => n.length >= 2);
    const nombre = (candidato ?? "Cliente").slice(0, 120);
    const ahora = new Date().toISOString();

    if (a.tipo === "reparacion") {
      const { data, error } = await supabase
        .from("service_requests")
        .insert({ service_title: a.titulo, nombre, apellido: "", ciudad: "", contacto: email || null })
        .select("id,codigo_seguimiento")
        .single<{ id: string; codigo_seguimiento: string | null }>();
      if (faltaNumeros(error)) throw new Rechazo(503, "falta activar los números de seguimiento");
      if (error || !data) throw new Rechazo(500, "no se pudo crear la reparación");
      if (!data.codigo_seguimiento) throw new Rechazo(503, "falta activar los números de seguimiento");
      // Al crearla la base de datos la deja sin cliente y en su primera etapa: se pone en la cuenta del cliente.
      const { error: errCliente } = await supabase
        .from("service_requests")
        .update({
          customer_user_id: cliente,
          status: "revisado",
          seguimiento: a.etapa,
          seguimiento_nota: a.nota,
          seguimiento_actualizado: ahora,
          nota_admin: NOTA_ASIGNADO_CHAT,
        })
        .eq("id", data.id);
      if (errCliente) throw new Rechazo(500, "no se pudo asignar al cliente");
      responder(res, 200, { ok: true, tipo: "reparacion", titulo: a.titulo, codigo_seguimiento: data.codigo_seguimiento });
      return;
    }

    if (!email || email.length < 5) throw new Rechazo(400, "el cliente no tiene correo");
    const { data, error } = await supabase
      .from("pedidos")
      .insert({
        user_id: cliente,
        estado: a.etapa,
        entrega: a.entrega,
        nombre,
        email,
        // La tienda pide teléfono en cada pedido; si el cliente no lo ha dado aún, queda indicado.
        telefono: a.telefono ?? "sin teléfono",
        total_eur: a.total,
        nota_admin: NOTA_ASIGNADO_CHAT,
      })
      .select("id,numero,codigo_seguimiento")
      .single<{ id: string; numero: number; codigo_seguimiento: string | null }>();
    if (faltaNumeros(error)) throw new Rechazo(503, "falta activar los números de seguimiento");
    if (error || !data) throw new Rechazo(500, "no se pudo crear el pedido");
    if (!data.codigo_seguimiento) throw new Rechazo(503, "falta activar los números de seguimiento");
    const { error: errArticulo } = await supabase
      .from("pedido_items")
      .insert({ pedido_id: data.id, product_id: chat.product_id, titulo: a.titulo, precio_eur: a.total });
    if (errArticulo) throw new Rechazo(500, "no se pudo guardar el artículo");
    responder(res, 200, { ok: true, tipo: "pedido", titulo: a.titulo, codigo_seguimiento: data.codigo_seguimiento, numero_pedido: data.numero });
  } catch (e: unknown) {
    const r = e instanceof Rechazo ? e : new Rechazo(500, "error interno");
    if (!(e instanceof Rechazo)) console.error("asignar-seguimiento: error inesperado", e);
    responder(res, r.http, { ok: false, error: r.message });
  }
}
