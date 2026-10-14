/**
 * api/escaparate-veoaura.ts
 *
 * Qué hace: receptor del puente VeoAura → tienda («escaparate»). VeoAura envía aquí, firmado,
 * un artículo de su Stock para publicarlo (o actualizarlo) en la tienda, o el aviso de que se ha
 * vendido. Sigue el contrato «Puente VeoAura → VideojuegosZaragoza (escaparate)» y hace sus 11
 * comprobaciones obligatorias, en este orden:
 *   1. Solo POST por HTTPS y cuerpo de como mucho 100 KB.
 *   2. Cabeceras X-Veoaura-Fecha (10 cifras), X-Veoaura-Nonce (32 hex) y X-Veoaura-Firma
 *      (sha256=64 hex); si faltan o no tienen formato → 401.
 *   3. |ahora − fecha| ≤ 300 s; si no → 401.
 *   4. HMAC-SHA256 de «fecha.nonce.cuerpo» con el secreto, comparado en tiempo constante → 401.
 *   5. Nonce no usado en los últimos 10 minutos (tabla public.escaparate_nonces) → 401.
 *   6. version = 1 y evento «publicar» o «vendido» → 400.
 *   7. Campos válidos: título ≤ 200, precio > 0, fotos solo https:// (texto guardado como texto
 *      plano: la app lo muestra con <Text>, nunca como HTML).
 *   8. Guarda por id_veoaura: crea o actualiza, nunca duplica (índice único).
 *   9. Responde 200 {ok:true, id_tienda} solo después de guardar; si falla, {ok:false, error}.
 *  10. Nunca redirige (la dirección buena es sin www: https://videojuegoszaragoza.com/...).
 *  11. Registra cada mensaje (fecha, evento, id_veoaura, resultado) en public.escaparate_registro,
 *      nunca la firma ni el secreto.
 * Fotos: llegan como enlaces temporales (1 h); se descargan y se guarda una copia propia en el
 * bucket product-media (carpeta veoaura/<id_veoaura>/) con su fila en product_media.
 *
 * Variables de entorno (Vercel → Settings → Environment Variables, solo servidor):
 * - VEOAURA_ESCAPARATE_SECRETO: el secreto del puente (lo pone el dueño; Claude no lo ve).
 * - EXPO_PUBLIC_SUPABASE_URL y SUPABASE_CLAVE_SERVIDOR: escribir en la base de datos de la tienda.
 *
 * Conectado con: supabase/migrations/20261014140000_escaparate_veoaura.sql (id_veoaura,
 * vendido_en, nonces y registro), products / product_media / categories de la tienda.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Web Crypto y TextEncoder estándar (Node 24 en Vercel): sin dependencias nuevas.
const codificar = new TextEncoder();

const MAX_CUERPO = 100 * 1024;
const MAX_FOTO = 10 * 1024 * 1024;
const VENTANA_SEGUNDOS = 300;
const BUCKET = "product-media";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPOS_FOTO: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

type Evento = "publicar" | "vendido";

type Producto = {
  titulo: string;
  categoria: string | null;
  modelo: string | null;
  estado: string | null;
  accesorios: string[];
  precio: number;
  fotos: string[];
};

class Rechazo extends Error {
  http: number;
  motivo: string;
  constructor(http: number, motivo: string) {
    super(motivo);
    this.http = http;
    this.motivo = motivo;
  }
}

// --- respuesta y registro -----------------------------------------------------------

function responder(res: any, http: number, cuerpo: Record<string, unknown>) {
  res.setHeader("Cache-Control", "no-store");
  res.status(http).json(cuerpo);
}

async function registrar(
  supabase: SupabaseClient | null,
  datos: { evento?: string | null; id_veoaura?: string | null; resultado: string; http: number; detalle?: string }
) {
  // Nunca se registra la firma ni el secreto: solo qué llegó y cómo terminó.
  const fila = {
    evento: datos.evento ?? null,
    id_veoaura: datos.id_veoaura ? String(datos.id_veoaura).slice(0, 64) : null,
    resultado: datos.resultado,
    http: datos.http,
    detalle: datos.detalle ? datos.detalle.slice(0, 300) : null,
  };
  console.log("escaparate-veoaura:", JSON.stringify(fila));
  if (!supabase) return;
  try {
    await supabase.from("escaparate_registro").insert(fila);
  } catch {
    // el registro nunca debe tumbar la respuesta
  }
}

// --- comprobaciones ---------------------------------------------------------------

async function leerCuerpo(req: any): Promise<string> {
  // Texto EXACTO recibido (la firma se calcula sobre él, sin volver a formatear el JSON).
  // Se lee del flujo de la petición SIN tocar req.body: en Vercel, req.body es un lector
  // perezoso que convierte el JSON y perdería el texto original.
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
  return new TextDecoder("utf-8").decode(todo);
}

function cabecera(req: any, nombre: string): string {
  const v = req.headers?.[nombre];
  return typeof v === "string" ? v.trim() : Array.isArray(v) ? String(v[0] ?? "").trim() : "";
}

async function firmaValida(secreto: string, fecha: string, nonce: string, cuerpo: string, firma: string): Promise<boolean> {
  const clave = await crypto.subtle.importKey(
    "raw",
    codificar.encode(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const esperada = new Uint8Array(await crypto.subtle.sign("HMAC", clave, codificar.encode(`${fecha}.${nonce}.${cuerpo}`)));
  const hex = firma.slice("sha256=".length);
  if (hex.length !== esperada.length * 2) return false;
  // Comparación en tiempo constante: se recorre siempre entero, sin salir al primer fallo.
  let diferencia = 0;
  for (let i = 0; i < esperada.length; i++) {
    diferencia |= esperada[i] ^ parseInt(hex.substr(i * 2, 2), 16);
  }
  return diferencia === 0;
}

function texto(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") throw new Rechazo(400, "campo de texto no válido");
  // Texto plano: se quitan caracteres de control; la app nunca lo interpreta como HTML.
  const limpio = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (limpio.length > max) throw new Rechazo(400, "texto demasiado largo");
  return limpio || null;
}

function urlFotoSegura(u: string): boolean {
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const h = url.hostname.toLowerCase();
  // Nada de direcciones internas (por si un día el contenido no viniera de VeoAura).
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(h)) return false;
  if (h.includes(":")) return false; // IPv6 literal
  return true;
}

function validarProducto(p: any): Producto {
  if (!p || typeof p !== "object") throw new Rechazo(400, "falta producto");
  const titulo = texto(p.titulo, 200);
  if (!titulo) throw new Rechazo(400, "título no válido");
  const precio = Number(p.precio);
  if (typeof p.precio !== "number" || !Number.isFinite(precio) || precio <= 0 || precio > 1_000_000) {
    throw new Rechazo(400, "precio no válido");
  }
  if (p.moneda !== undefined && p.moneda !== "EUR") throw new Rechazo(400, "moneda no admitida");
  const accesorios = Array.isArray(p.accesorios) ? p.accesorios : [];
  if (accesorios.length > 50) throw new Rechazo(400, "demasiados accesorios");
  const fotos = Array.isArray(p.fotos) ? p.fotos : [];
  if (fotos.length > 10) throw new Rechazo(400, "más de 10 fotos");
  for (const f of fotos) {
    if (typeof f !== "string" || !f.startsWith("https://") || !urlFotoSegura(f)) {
      throw new Rechazo(400, "foto con enlace no válido");
    }
  }
  return {
    titulo,
    categoria: texto(p.categoria, 100),
    modelo: texto(p.modelo, 120),
    estado: texto(p.estado, 60),
    accesorios: accesorios.map((a: unknown) => texto(a, 100)).filter((a: string | null): a is string => !!a),
    precio: Math.round(precio * 100) / 100,
    fotos,
  };
}

async function usarNonce(supabase: SupabaseClient, nonce: string): Promise<boolean> {
  const { error } = await supabase.from("escaparate_nonces").insert({ nonce });
  if (!error) return true;
  if (error.code !== "23505") throw new Rechazo(503, "no se pudo comprobar el nonce");
  const haceDiez = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data, error: errRenovar } = await supabase
    .from("escaparate_nonces")
    .update({ usado_en: new Date().toISOString() })
    .eq("nonce", nonce)
    .lt("usado_en", haceDiez)
    .select("nonce");
  if (errRenovar) throw new Rechazo(503, "no se pudo comprobar el nonce");
  return (data ?? []).length > 0;
}

// --- traducción a la tienda ----------------------------------------------------------

function condicionTienda(estado: string | null): string {
  const e = (estado ?? "").toLowerCase();
  if (/pieza|averiad|no funciona|roto/.test(e)) return "PARTS";
  if (/como nuevo|precintad[oa] abiert|seminuevo|impecable/.test(e)) return "LIKE_NEW";
  if (/^nuev[oa]|precintad/.test(e)) return "NEW";
  if (/aceptable|regular|desgaste|usad[oa] con/.test(e)) return "FAIR";
  return "GOOD";
}

async function categoriaTienda(supabase: SupabaseClient, p: Producto): Promise<string | null> {
  const { data } = await supabase.from("categories").select("id,name,slug");
  const cats = (data ?? []) as { id: string; name: string; slug: string }[];
  const buscar = (slug: string) => cats.find((c) => c.slug === slug)?.id ?? null;
  const pista = `${p.titulo} ${p.modelo ?? ""} ${p.categoria ?? ""}`.toLowerCase();
  if (/ps5|playstation ?5/.test(pista)) return buscar("playstation-5");
  if (/ps4|playstation ?4/.test(pista)) return buscar("playstation-4");
  if (/switch|nintendo/.test(pista)) return buscar("nintendo-switch");
  if (/xbox/.test(pista)) return buscar("xbox");
  const porNombre = p.categoria ? cats.find((c) => c.name.toLowerCase() === p.categoria!.toLowerCase())?.id : null;
  return porNombre ?? buscar("electronica");
}

function descripcion(p: Producto): string {
  const lineas: string[] = [];
  if (p.modelo) lineas.push(`Modelo: ${p.modelo}`);
  if (p.estado) lineas.push(`Estado: ${p.estado}`);
  if (p.accesorios.length) lineas.push(`Incluye: ${p.accesorios.join(", ")}`);
  return lineas.join("\n");
}

type FotoDescargada = { datos: Uint8Array; tipo: string; ext: string };

async function descargarFoto(url: string): Promise<FotoDescargada | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: "error" });
    if (!r.ok) return null;
    const tipo = String(r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const ext = TIPOS_FOTO[tipo];
    if (!ext) return null;
    const largo = Number(r.headers.get("content-length") ?? 0);
    if (largo > MAX_FOTO) return null;
    const datos = new Uint8Array(await r.arrayBuffer());
    if (!datos.length || datos.length > MAX_FOTO) return null;
    return { datos, tipo, ext };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// --- eventos ---------------------------------------------------------------------------

async function publicar(supabase: SupabaseClient, idVeoaura: string, p: Producto): Promise<string> {
  // Primero las fotos (los enlaces caducan en 1 h): si había fotos y no se pudo copiar
  // ninguna, no se guarda nada y VeoAura lo verá como error para reintentarlo.
  const descargadas = (await Promise.all(p.fotos.map(descargarFoto))).filter(
    (f): f is FotoDescargada => !!f
  );
  if (p.fotos.length && !descargadas.length) throw new Rechazo(502, "no se pudieron descargar las fotos");

  const campos = {
    title: p.titulo,
    description: descripcion(p),
    price_eur: p.precio,
    condition: condicionTienda(p.estado),
    category_id: await categoriaTienda(supabase, p),
    status: "PUBLISHED",
    is_active: true,
    vendido_en: null,
    updated_at: new Date().toISOString(),
  };

  const { data: existente, error: errBuscar } = await supabase
    .from("products")
    .select("id")
    .eq("id_veoaura", idVeoaura)
    .maybeSingle<{ id: string }>();
  if (errBuscar) throw new Rechazo(500, "no se pudo leer el producto");

  let idTienda = existente?.id ?? null;
  if (idTienda) {
    const { error } = await supabase.from("products").update(campos).eq("id", idTienda);
    if (error) throw new Rechazo(500, "no se pudo actualizar el producto");
  } else {
    const { data, error } = await supabase
      .from("products")
      .insert({ ...campos, id_veoaura: idVeoaura })
      .select("id")
      .single<{ id: string }>();
    if (error) {
      // Dos mensajes a la vez: el índice único lo impide; se usa el que ya se creó.
      const { data: otro } = await supabase.from("products").select("id").eq("id_veoaura", idVeoaura).maybeSingle<{ id: string }>();
      if (!otro?.id) throw new Rechazo(500, "no se pudo crear el producto");
      idTienda = otro.id;
      await supabase.from("products").update(campos).eq("id", idTienda);
    } else {
      idTienda = data.id;
    }
  }

  // Fotos: se sustituyen las copias anteriores de VeoAura por las nuevas.
  if (descargadas.length) {
    const sello = Date.now();
    const nuevas: { storage_path: string; public_url: string; mime_type: string }[] = [];
    for (let i = 0; i < descargadas.length; i++) {
      const f = descargadas[i];
      const ruta = `veoaura/${idVeoaura}/${sello}-${i + 1}.${f.ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(ruta, f.datos, {
        contentType: f.tipo,
        cacheControl: "31536000",
        upsert: true,
      });
      if (error) continue;
      nuevas.push({ storage_path: ruta, public_url: supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl, mime_type: f.tipo });
    }
    if (!nuevas.length) throw new Rechazo(502, "no se pudieron guardar las fotos");

    const { data: anteriores } = await supabase
      .from("product_media")
      .select("id,storage_path")
      .eq("product_id", idTienda)
      .like("storage_path", "veoaura/%");

    const { error: errMedia } = await supabase.from("product_media").insert(
      nuevas.map((n, i) => ({
        product_id: idTienda,
        kind: "image",
        storage_path: n.storage_path,
        public_url: n.public_url,
        mime_type: n.mime_type,
        file_name: n.storage_path.split("/").pop(),
        sort_order: i,
        is_cover: i === 0,
      }))
    );
    if (errMedia) throw new Rechazo(500, "no se pudieron registrar las fotos");

    const viejas = (anteriores ?? []) as { id: string; storage_path: string }[];
    if (viejas.length) {
      await supabase.from("product_media").delete().in("id", viejas.map((v) => v.id));
      await supabase.storage.from(BUCKET).remove(viejas.map((v) => v.storage_path));
    }
    await supabase.from("products").update({ images: nuevas.map((n) => n.public_url) }).eq("id", idTienda);
  }

  return idTienda as string;
}

async function vendido(supabase: SupabaseClient, idVeoaura: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("products")
    .update({ is_active: false, vendido_en: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id_veoaura", idVeoaura)
    .select("id");
  if (error) throw new Rechazo(500, "no se pudo marcar como vendido");
  return (data ?? [])[0]?.id ?? null; // si no existe, no hay nada que hacer (ok igualmente)
}

// --- receptor ----------------------------------------------------------------------------

export default async function handler(req: any, res: any) {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const claveServidor = process.env.SUPABASE_CLAVE_SERVIDOR;
  const secreto = process.env.VEOAURA_ESCAPARATE_SECRETO;
  const supabase =
    supabaseUrl && claveServidor
      ? createClient(supabaseUrl, claveServidor, { auth: { persistSession: false, autoRefreshToken: false } })
      : null;

  let evento: string | null = null;
  let idVeoaura: string | null = null;

  try {
    // 1. Solo POST, por HTTPS y como mucho 100 KB.
    if (req.method !== "POST") throw new Rechazo(405, "método no permitido");
    const proto = cabecera(req, "x-forwarded-proto").split(",")[0].trim();
    if (proto && proto !== "https") throw new Rechazo(400, "solo HTTPS");
    if (Number(cabecera(req, "content-length") || 0) > MAX_CUERPO) throw new Rechazo(413, "cuerpo demasiado grande");
    if (!secreto || !supabase) throw new Rechazo(503, "receptor sin configurar");
    const cuerpo = await leerCuerpo(req);
    if (codificar.encode(cuerpo).length > MAX_CUERPO) throw new Rechazo(413, "cuerpo demasiado grande");

    // 2. Cabeceras con su formato.
    const fecha = cabecera(req, "x-veoaura-fecha");
    const nonce = cabecera(req, "x-veoaura-nonce").toLowerCase();
    const firma = cabecera(req, "x-veoaura-firma").toLowerCase();
    if (!/^\d{10}$/.test(fecha) || !/^[0-9a-f]{32}$/.test(nonce) || !/^sha256=[0-9a-f]{64}$/.test(firma)) {
      throw new Rechazo(401, "cabeceras no válidas");
    }

    // 3. Mensaje dentro de la ventana de 5 minutos.
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(fecha)) > VENTANA_SEGUNDOS) {
      throw new Rechazo(401, "mensaje caducado");
    }

    // 4. Firma, comparada en tiempo constante.
    if (!(await firmaValida(secreto, fecha, cabecera(req, "x-veoaura-nonce"), cuerpo, firma))) {
      throw new Rechazo(401, "firma no válida");
    }

    // 5. Nonce de un solo uso (10 minutos): se intenta apuntar; si ya existía, solo vale
    //    si se usó hace más de 10 minutos (y entonces se renueva).
    if (!(await usarNonce(supabase, nonce))) throw new Rechazo(401, "mensaje repetido");

    // 6. Versión y evento.
    let mensaje: any;
    try {
      mensaje = JSON.parse(cuerpo);
    } catch {
      throw new Rechazo(400, "JSON no válido");
    }
    evento = typeof mensaje?.evento === "string" ? mensaje.evento.slice(0, 20) : null;
    if (mensaje?.version !== 1 || (evento !== "publicar" && evento !== "vendido")) {
      throw new Rechazo(400, "versión o evento no admitidos");
    }

    // 7. Campos.
    idVeoaura = typeof mensaje.id_veoaura === "string" ? mensaje.id_veoaura : null;
    if (!idVeoaura || !UUID_RE.test(idVeoaura)) throw new Rechazo(400, "id_veoaura no válido");
    idVeoaura = idVeoaura.toLowerCase();

    // 8 y 9. Guardar y, solo después, responder.
    let idTienda: string | null;
    if ((evento as Evento) === "publicar") {
      const producto = validarProducto(mensaje.producto);
      idTienda = await publicar(supabase, idVeoaura, producto);
    } else {
      idTienda = await vendido(supabase, idVeoaura);
    }

    await registrar(supabase, { evento, id_veoaura: idVeoaura, resultado: "ok", http: 200, detalle: idTienda ? undefined : "no existía en la tienda" });
    responder(res, 200, idTienda ? { ok: true, id_tienda: idTienda } : { ok: true });
  } catch (e: unknown) {
    const r = e instanceof Rechazo ? e : new Rechazo(500, "error interno");
    if (!(e instanceof Rechazo)) console.error("escaparate-veoaura: error inesperado", e);
    await registrar(supabase, { evento, id_veoaura: idVeoaura, resultado: "error", http: r.http, detalle: r.motivo });
    responder(res, r.http, { ok: false, error: r.motivo });
  }
}
