/**
 * api/escaparate-retorno.ts
 *
 * Qué hace: puente de vuelta tienda → VeoAura (el de ida es api/escaparate-veoaura.ts).
 * 1. Pedidos: cuando alguien pide en la tienda un artículo que vino de VeoAura, se avisa a
 *    VeoAura («pedido») para que no lo venda también en la tienda física; si el pedido se
 *    cancela, se le avisa otra vez («pedido_anulado»). Nunca se envían datos del cliente:
 *    solo el id del artículo, el número de pedido, la forma de entrega y el precio.
 * 2. Estadísticas (una vez al día, con el cron): visitas y «me gusta» de cada artículo de
 *    VeoAura en la tienda, para decidir allí qué rebajar.
 *
 * Cómo funciona:
 * - Cada aviso se apunta en public.escaparate_salida (uno por pedido, artículo y evento: nunca
 *   se duplica) y se envía firmado igual que el puente de ida: cabeceras X-Tienda-Fecha
 *   (segundos Unix), X-Tienda-Nonce (32 hex de un solo uso) y X-Tienda-Firma = «sha256=» +
 *   HMAC-SHA256 de «fecha.nonce.cuerpo» con el secreto del puente de vuelta. Cuerpo con
 *   version 1, evento, id_mensaje (para que VeoAura no lo procese dos veces), id_veoaura…
 * - VeoAura responde {ok:true}; si no responde, falla o redirige, se reintenta (como mínimo un
 *   minuto entre intentos, hasta 12 intentos). El panel (app/admin/escaparate.tsx) enseña el
 *   estado de cada aviso.
 * - Se pone en marcha: al confirmar un pedido (app/checkout.tsx), al cambiar el estado de un
 *   pedido (app/admin/pedidos.tsx), al abrir el panel Escaparate y cada día con el cron de
 *   vercel.json (este también envía las estadísticas). Las llamadas sin cron solo procesan lo
 *   que ya está en la base de datos, así que no hace falta sesión para «despertarlo».
 *
 * Variables de entorno (Vercel → Settings → Environment Variables, solo servidor):
 * - VEOAURA_RETORNO_URL: dirección HTTPS del receptor de VeoAura (la pone el dueño).
 * - VEOAURA_RETORNO_SECRETO: secreto del puente de vuelta (lo pone el dueño; Claude no lo ve).
 *   Es distinto del de ida (VEOAURA_ESCAPARATE_SECRETO).
 * - CRON_SECRET: lo manda Vercel en el cron diario.
 * - EXPO_PUBLIC_SUPABASE_URL y SUPABASE_CLAVE_SERVIDOR: leer pedidos y apuntar los avisos.
 * Sin VEOAURA_RETORNO_URL o su secreto los avisos se apuntan igual y quedan pendientes.
 *
 * Conectado con: supabase/migrations/20261015100000_escaparate_novedades_retorno.sql
 * (escaparate_salida), escaparate_registro (estadísticas), pedidos / pedido_items / products.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const codificar = new TextEncoder();

const MAX_INTENTOS = 12;
const ESPERA_REINTENTO_MS = 60 * 1000;
const ENVIANDO_CADUCA_MS = 2 * 60 * 1000;
const DIAS_PEDIDOS = 30;
const TIEMPO_ENVIO_MS = 8000;
const PRESUPUESTO_MS = 20000;
const MAX_POR_VUELTA = 5;
const LOTE_ESTADISTICAS = 200;
const PAUSA_SIN_CRON_MS = 5000;

type Evento = "pedido" | "pedido_anulado";

type Salida = {
  id: string;
  evento: Evento;
  id_veoaura: string;
  pedido_id: string;
  estado: "pendiente" | "enviando" | "enviado" | "error" | "descartado";
  intentos: number;
  ultimo_intento: string | null;
};

type PedidoFila = {
  id: string;
  numero: number | null;
  estado: string;
  entrega: string | null;
  pedido_items: { product_id: string | null; precio_eur: number | string | null }[] | null;
};

// Última vuelta sin cron en esta instancia: evita que muchas llamadas seguidas repitan el trabajo.
let ultimaVuelta = 0;

function responder(res: any, http: number, cuerpo: Record<string, unknown>) {
  res.setHeader("Cache-Control", "no-store");
  res.status(http).json(cuerpo);
}

function cabecera(req: any, nombre: string): string {
  const v = req.headers?.[nombre];
  return typeof v === "string" ? v.trim() : Array.isArray(v) ? String(v[0] ?? "").trim() : "";
}

function iguales(a: string, b: string): boolean {
  // Comparación en tiempo constante (para la clave del cron).
  const x = codificar.encode(a);
  const y = codificar.encode(b);
  let diferencia = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diferencia |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diferencia === 0;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function firmar(secreto: string, fecha: string, nonce: string, cuerpo: string): Promise<string> {
  const clave = await crypto.subtle.importKey("raw", codificar.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firma = new Uint8Array(await crypto.subtle.sign("HMAC", clave, codificar.encode(`${fecha}.${nonce}.${cuerpo}`)));
  return `sha256=${hex(firma)}`;
}

async function enviar(url: string, secreto: string, mensaje: Record<string, unknown>): Promise<{ ok: boolean; detalle?: string }> {
  const cuerpo = JSON.stringify(mensaje);
  const fecha = String(Math.floor(Date.now() / 1000));
  const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
  const firma = await firmar(secreto, fecha, nonce, cuerpo);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIEMPO_ENVIO_MS);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Tienda-Fecha": fecha, "X-Tienda-Nonce": nonce, "X-Tienda-Firma": firma },
      body: cuerpo,
      redirect: "error",
      signal: ctrl.signal,
    });
    const datos: any = await r.json().catch(() => null);
    if (r.ok && datos?.ok === true) return { ok: true };
    const motivo = typeof datos?.error === "string" ? `: ${datos.error.slice(0, 120)}` : "";
    return { ok: false, detalle: `VeoAura respondió ${r.status}${motivo}` };
  } catch {
    return { ok: false, detalle: ctrl.signal.aborted ? "VeoAura no respondió a tiempo" : "no se pudo conectar con VeoAura" };
  } finally {
    clearTimeout(t);
  }
}

async function registrar(supabase: SupabaseClient, resultado: string, http: number, detalle?: string) {
  const fila = { evento: "salida:estadisticas", id_veoaura: null, resultado, http, detalle: detalle ? detalle.slice(0, 300) : null };
  console.log("escaparate-retorno:", JSON.stringify(fila));
  try {
    await supabase.from("escaparate_registro").insert(fila);
  } catch {
    // el registro nunca debe tumbar el envío
  }
}

// Artículos de VeoAura: id de la tienda → id de VeoAura.
async function articulosVeoaura(supabase: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("products").select("id,id_veoaura").not("id_veoaura", "is", null).limit(5000);
  if (error) throw new Error("no se pudieron leer los artículos de VeoAura");
  return new Map(((data ?? []) as { id: string; id_veoaura: string }[]).map((p) => [p.id, p.id_veoaura]));
}

async function pedidosRecientes(supabase: SupabaseClient): Promise<PedidoFila[]> {
  const desde = new Date(Date.now() - DIAS_PEDIDOS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("pedidos")
    .select("id,numero,estado,entrega,pedido_items(product_id,precio_eur)")
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error("no se pudieron leer los pedidos");
  return (data ?? []) as PedidoFila[];
}

// Apunta en escaparate_salida lo que haya que avisar a VeoAura (sin enviarlo todavía).
async function apuntarAvisos(supabase: SupabaseClient, articulos: Map<string, string>, pedidos: PedidoFila[]) {
  const pares: { pedido: PedidoFila; idVeoaura: string }[] = [];
  for (const p of pedidos) {
    for (const it of p.pedido_items ?? []) {
      const idVeoaura = it.product_id ? articulos.get(it.product_id) : undefined;
      if (idVeoaura) pares.push({ pedido: p, idVeoaura });
    }
  }
  if (!pares.length) return;

  const ids = [...new Set(pares.map((x) => x.pedido.id))];
  const { data, error } = await supabase.from("escaparate_salida").select("id,evento,id_veoaura,pedido_id,estado").in("pedido_id", ids);
  if (error) throw new Error("no se pudieron leer los avisos");
  const existentes = (data ?? []) as Pick<Salida, "id" | "evento" | "id_veoaura" | "pedido_id" | "estado">[];
  const buscar = (pedidoId: string, idVeoaura: string, evento: Evento) =>
    existentes.find((s) => s.pedido_id === pedidoId && s.id_veoaura === idVeoaura && s.evento === evento);

  const nuevos: { evento: Evento; id_veoaura: string; pedido_id: string }[] = [];
  for (const { pedido, idVeoaura } of pares) {
    const aviso = buscar(pedido.id, idVeoaura, "pedido");
    const cancelado = pedido.estado === "cancelado";
    if (!aviso) {
      // Cancelado antes de avisar: VeoAura nunca lo supo, no hay nada que enviar.
      if (!cancelado) nuevos.push({ evento: "pedido", id_veoaura: idVeoaura, pedido_id: pedido.id });
      continue;
    }
    if (!cancelado) continue;
    if (aviso.estado === "enviado" || aviso.estado === "enviando") {
      if (!buscar(pedido.id, idVeoaura, "pedido_anulado")) {
        nuevos.push({ evento: "pedido_anulado", id_veoaura: idVeoaura, pedido_id: pedido.id });
      }
    } else if (aviso.estado === "pendiente" || aviso.estado === "error") {
      await supabase.from("escaparate_salida").update({ estado: "descartado", detalle: "pedido cancelado antes de avisar" }).eq("id", aviso.id).in("estado", ["pendiente", "error"]);
    }
  }
  if (nuevos.length) {
    await supabase.from("escaparate_salida").upsert(nuevos, { onConflict: "pedido_id,id_veoaura,evento", ignoreDuplicates: true });
  }
}

async function enviarAvisos(supabase: SupabaseClient, url: string, secreto: string, articulos: Map<string, string>, pedidos: PedidoFila[]) {
  const inicio = Date.now();
  let enviados = 0;
  let fallidos = 0;
  const { data, error } = await supabase
    .from("escaparate_salida")
    .select("id,evento,id_veoaura,pedido_id,estado,intentos,ultimo_intento")
    .in("estado", ["pendiente", "error", "enviando"])
    .lt("intentos", MAX_INTENTOS)
    .order("creado_en", { ascending: true })
    .limit(50);
  if (error) throw new Error("no se pudieron leer los avisos pendientes");

  const porVeoaura = new Map([...articulos.entries()].map(([idTienda, idV]) => [idV, idTienda]));
  for (const s of (data ?? []) as Salida[]) {
    if (enviados + fallidos >= MAX_POR_VUELTA || Date.now() - inicio > PRESUPUESTO_MS) break;
    const ultimo = s.ultimo_intento ? Date.parse(s.ultimo_intento) : 0;
    if (s.estado === "error" && Date.now() - ultimo < ESPERA_REINTENTO_MS) continue;
    if (s.estado === "enviando" && Date.now() - ultimo < ENVIANDO_CADUCA_MS) continue;
    if (s.evento === "pedido_anulado") {
      // La anulación solo sale cuando VeoAura ya recibió el pedido.
      const { data: previo } = await supabase
        .from("escaparate_salida")
        .select("estado")
        .eq("pedido_id", s.pedido_id)
        .eq("id_veoaura", s.id_veoaura)
        .eq("evento", "pedido")
        .maybeSingle<{ estado: string }>();
      if (previo?.estado !== "enviado") continue;
    }

    // Se reserva el aviso (si otra llamada lo cogió antes, no se envía dos veces).
    const { data: reservado } = await supabase
      .from("escaparate_salida")
      .update({ estado: "enviando", intentos: s.intentos + 1, ultimo_intento: new Date().toISOString() })
      .eq("id", s.id)
      .eq("estado", s.estado)
      .eq("intentos", s.intentos)
      .select("id");
    if (!(reservado ?? []).length) continue;

    const pedido = pedidos.find((p) => p.id === s.pedido_id);
    const idTienda = porVeoaura.get(s.id_veoaura);
    const linea = pedido?.pedido_items?.find((it) => it.product_id === idTienda);
    const precio = Number(linea?.precio_eur);
    const r = await enviar(url, secreto, {
      version: 1,
      evento: s.evento,
      id_mensaje: s.id,
      id_veoaura: s.id_veoaura,
      pedido: {
        numero: pedido?.numero ?? null,
        entrega: pedido?.entrega ?? null,
        precio: Number.isFinite(precio) ? Math.round(precio * 100) / 100 : null,
        moneda: "EUR",
      },
      enviado_en: new Date().toISOString(),
    });
    await supabase
      .from("escaparate_salida")
      .update(r.ok ? { estado: "enviado", enviado_en: new Date().toISOString(), detalle: null } : { estado: "error", detalle: r.detalle ?? "error" })
      .eq("id", s.id);
    if (r.ok) enviados++;
    else fallidos++;
  }
  return { enviados, fallidos };
}

async function enviarEstadisticas(supabase: SupabaseClient, url: string, secreto: string) {
  const { data, error } = await supabase
    .from("products")
    .select("id_veoaura,view_count,like_count,is_active")
    .not("id_veoaura", "is", null)
    .limit(5000);
  if (error) {
    await registrar(supabase, "error", 500, "no se pudieron leer las estadísticas");
    return;
  }
  const articulos = ((data ?? []) as { id_veoaura: string; view_count: number | null; like_count: number | null; is_active: boolean | null }[]).map((p) => ({
    id_veoaura: p.id_veoaura,
    visitas: Number(p.view_count ?? 0),
    me_gusta: Number(p.like_count ?? 0),
    a_la_venta: p.is_active === true,
  }));
  for (let i = 0; i < articulos.length; i += LOTE_ESTADISTICAS) {
    const r = await enviar(url, secreto, {
      version: 1,
      evento: "estadisticas",
      id_mensaje: crypto.randomUUID(),
      articulos: articulos.slice(i, i + LOTE_ESTADISTICAS),
      enviado_en: new Date().toISOString(),
    });
    await registrar(supabase, r.ok ? "ok" : "error", r.ok ? 200 : 502, r.ok ? `${Math.min(LOTE_ESTADISTICAS, articulos.length - i)} artículos` : r.detalle);
    if (!r.ok) return;
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST" && req.method !== "GET") {
    responder(res, 405, { ok: false, error: "método no permitido" });
    return;
  }
  const cronSecret = process.env.CRON_SECRET;
  const esCron = !!cronSecret && iguales(cabecera(req, "authorization"), `Bearer ${cronSecret}`);
  if (req.method === "GET" && !esCron) {
    responder(res, 401, { ok: false, error: "no autorizado" });
    return;
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const claveServidor = process.env.SUPABASE_CLAVE_SERVIDOR;
  if (!supabaseUrl || !claveServidor) {
    responder(res, 503, { ok: false, error: "sin configurar" });
    return;
  }
  if (!esCron) {
    if (Date.now() - ultimaVuelta < PAUSA_SIN_CRON_MS) {
      responder(res, 200, { ok: true, omitido: true });
      return;
    }
    ultimaVuelta = Date.now();
  }
  const supabase = createClient(supabaseUrl, claveServidor, { auth: { persistSession: false, autoRefreshToken: false } });

  const url = String(process.env.VEOAURA_RETORNO_URL ?? "").trim();
  const secreto = process.env.VEOAURA_RETORNO_SECRETO ?? "";
  const configurado = url.startsWith("https://") && secreto.length >= 32;

  try {
    const articulos = await articulosVeoaura(supabase);
    const pedidos = articulos.size ? await pedidosRecientes(supabase) : [];
    await apuntarAvisos(supabase, articulos, pedidos);
    let resultado = { enviados: 0, fallidos: 0 };
    if (configurado) {
      resultado = await enviarAvisos(supabase, url, secreto, articulos, pedidos);
      if (esCron && articulos.size) await enviarEstadisticas(supabase, url, secreto);
    }
    responder(res, 200, { ok: true, configurado, ...resultado });
  } catch (e: unknown) {
    console.error("escaparate-retorno: error", e);
    responder(res, 500, { ok: false, error: "error interno" });
  }
}
