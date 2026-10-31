/**
 * api/escaparate-veoaura.ts
 *
 * Qué hace: receptor del puente VeoAura → tienda («escaparate»). VeoAura envía aquí, firmado,
 * un artículo de su Stock para publicarlo (o actualizarlo) en la tienda, el aviso de que se ha
 * vendido o la orden de retirarlo (ocultarlo sin borrarlo). Un «publicar» de algo vendido o
 * retirado lo vuelve a poner a la venta. Sigue el contrato «Puente VeoAura → VideojuegosZaragoza (escaparate)» y hace sus 11
 * comprobaciones obligatorias, en este orden:
 *   1. Solo POST por HTTPS y cuerpo de como mucho 100 KB.
 *   2. Cabeceras X-Veoaura-Fecha (10 cifras), X-Veoaura-Nonce (32 hex) y X-Veoaura-Firma
 *      (sha256=64 hex); si faltan o no tienen formato → 401.
 *   3. |ahora − fecha| ≤ 300 s; si no → 401.
 *   4. HMAC-SHA256 de «fecha.nonce.cuerpo» con el secreto, comparado en tiempo constante → 401.
 *   5. Nonce no usado en los últimos 10 minutos (tabla public.escaparate_nonces) → 401.
 *   6. version = 1 y evento «publicar», «vendido», «retirar» o «seguimiento» → 400.
 *   7. Campos válidos: título ≤ 200, precio > 0, fotos solo https:// y como mucho 30 en orden (la
 *      primera es la portada; si llegan más se usan las 30 primeras, sin rechazar el mensaje) (texto
 *      guardado como texto plano: la app lo muestra con <Text>, nunca como HTML). «caracteristicas» (ficha técnica,
 *      ≤ 30 de { etiqueta ≤ 40, valor ≤ 80 }) y «mantenimiento» ({ titulo ≤ 60, nota ≤ 300, ≤ 30 puntos
 *      de { etiqueta ≤ 60, valor ≤ 20 } } o null) nunca rechazan el mensaje: lo que no cumple se descarta
 *      y cada «publicar» los sustituye enteros (null quita el mantenimiento). Los campos desconocidos se ignoran.
 *   8. Guarda por id_veoaura: crea o actualiza, nunca duplica (índice único).
 *   9. Responde 200 {ok:true, id_tienda} solo después de guardar; si falla, {ok:false, error}.
 *  10. Nunca redirige (la dirección buena es sin www: https://videojuegoszaragoza.com/...).
 *  11. Registra cada mensaje (fecha, evento, id_veoaura, resultado) en public.escaparate_registro,
 *      nunca la firma ni el secreto.
 *
 * Evento «seguimiento» (2026-10-31, ampliación del contrato; el mismo sobre firmado, version 1): la ficha de un cliente
 * creada en VeoAura. La tienda le pone un número de seguimiento («VZ-XXXX-XXXX») y lo devuelve; el dueño se lo da al
 * cliente, que lo escribe en Perfil → «Mis seguimientos» y desde entonces ve su etapa en su cuenta. Cuerpo:
 *   { version: 1, evento: "seguimiento", id_veoaura: <uuid de la ficha en VeoAura>, seguimiento: {
 *       tipo: "reparacion" | "pedido",
 *       titulo: ≤ 120 (reparación: el servicio, p. ej. «Reparación de mando PS5»; pedido: el artículo si no hay lista),
 *       etapa: reparación «solicitado|recibido|diagnostico|reparando|listo|entregado|cancelado»,
 *              pedido «pendiente|confirmado|preparado|enviado|entregado|cancelado»,
 *       nota: ≤ 500 o null (solo reparación: la «nota del taller» que ve el cliente),
 *       cliente: { nombre ≤ 120, apellido ≤ 120, telefono ≤ 30, email ≤ 200 } (pedido: nombre, teléfono y email
 *                obligatorios, como al comprar en la tienda; reparación: opcionales, para reconocerla en el panel),
 *       entrega: "envio" | "recogida" (solo pedido; por defecto envío),
 *       articulos: ≤ 20 de { titulo ≤ 200, precio_eur ≥ 0 } y total_eur (solo pedido; se guardan al crearlo) } }
 *   Respuesta 200 { ok: true, id_tienda, tipo, codigo_seguimiento, vinculado (si el cliente ya lo añadió a su cuenta),
 *   numero_pedido (solo pedido) }. Cada envío con el mismo id_veoaura pone al día la etapa (y la nota o la entrega) sin
 *   duplicar ni cambiar el número. 409 si ese id_veoaura ya existe con el otro tipo; 503 si la tienda aún no tiene
 *   activado el seguimiento (migración 20261031170000 sin aplicar: reintentar más tarde).
 * Responder rápido: VeoAura espera como mucho 8 s. Se guarda el producto, se responde y las
 * fotos (enlaces temporales de 1 h) se descargan justo después, con waitUntil de Vercel (6 a la
 * vez, con un reintento). Cada «publicar» trae la lista COMPLETA de fotos y la galería queda
 * igual que en VeoAura: mismas fotos, mismo orden y misma portada; las que ya no vienen se
 * quitan. La copia propia va al bucket product-media (carpeta veoaura/<id_veoaura>/) con su fila
 * en product_media, y cada archivo se llama por la huella de su contenido: la misma foto (aunque
 * llegue con otro enlace) no se duplica ni se vuelve a subir y su dirección no cambia. Cada envío
 * lleva un sello (products.veoaura_envio): si mientras se copian las fotos llega otro envío del
 * mismo artículo, gana el último y el anterior no aplica nada, así un reintento nunca mezcla fotos.
 *
 * Variables de entorno (Vercel → Settings → Environment Variables, solo servidor):
 * - VEOAURA_ESCAPARATE_SECRETO: el secreto del puente (lo pone el dueño; Claude no lo ve).
 * - EXPO_PUBLIC_SUPABASE_URL y SUPABASE_CLAVE_SERVIDOR: escribir en la base de datos de la tienda.
 *
 * Conectado con: supabase/migrations/20261014140000_escaparate_veoaura.sql (id_veoaura,
 * vendido_en, nonces y registro), 20261014160000_escaparate_retirar.sql (retirado_en,
 * veoaura_envio), 20261015100000_escaparate_novedades_retorno.sql (novedad_en; el puente de
 * vuelta tienda → VeoAura está en api/escaparate-retorno.ts), products / product_media / categories de la tienda.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Web Crypto y TextEncoder estándar (Node 24 en Vercel): sin dependencias nuevas.
const codificar = new TextEncoder();

const MAX_CUERPO = 100 * 1024;
const MAX_FOTO = 10 * 1024 * 1024;
const MAX_FOTOS_VEOAURA = 30;
const FOTOS_A_LA_VEZ = 6;
const VENTANA_SEGUNDOS = 300;
const BUCKET = "product-media";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPOS_FOTO: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

type Evento = "publicar" | "vendido" | "retirar" | "seguimiento";
const EVENTOS: Evento[] = ["publicar", "vendido", "retirar", "seguimiento"];

// «seguimiento»: la ficha de un cliente creada en VeoAura (una reparación o mantenimiento, o un pedido). Las etapas son las
// mismas que ve el cliente en Perfil → «Mis seguimientos».
const ETAPAS_REPARACION = ["solicitado", "recibido", "diagnostico", "reparando", "listo", "entregado", "cancelado"];
const ETAPAS_PEDIDO = ["pendiente", "confirmado", "preparado", "enviado", "entregado", "cancelado"];
const MAX_ARTICULOS = 20;

type FichaSeguimiento = {
  tipo: "reparacion" | "pedido";
  titulo: string;
  etapa: string;
  nota: string | null;
  cliente: { nombre: string | null; apellido: string | null; telefono: string | null; email: string | null };
  entrega: "envio" | "recogida";
  articulos: { titulo: string; precio_eur: number }[];
  total: number;
};

type Caracteristica = { etiqueta: string; valor: string };
type Mantenimiento = { titulo: string | null; nota: string | null; puntos: Caracteristica[] };

type Producto = {
  titulo: string;
  categoria: string | null;
  modelo: string | null;
  estado: string | null;
  accesorios: string[];
  precio: number;
  fotos: string[];
  caracteristicas: Caracteristica[];
  mantenimiento: Mantenimiento | null;
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

// Tope de filas de ERROR que una instancia apunta en la base de datos por minuto. Aun siendo mensajes
// con la firma válida (de VeoAura), un fallo repetido no debe llenar la tabla: pasado el tope solo queda
// el registro de Vercel (console.log de abajo).
const MAX_ERRORES_POR_MINUTO = 30;
const erroresApuntados: number[] = [];
function cabeOtroError(): boolean {
  const ahora = Date.now();
  while (erroresApuntados.length && ahora - erroresApuntados[0] > 60_000) erroresApuntados.shift();
  if (erroresApuntados.length >= MAX_ERRORES_POR_MINUTO) return false;
  erroresApuntados.push(ahora);
  return true;
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
  if (datos.resultado !== "ok" && !cabeOtroError()) return;
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

// «caracteristicas» (ficha técnica): lista ordenada de { etiqueta ≤ 40, valor ≤ 80 }, como mucho 30. Las
// etiquetas NO son fijas (cambian por categoría y el dueño las edita en VeoAura): se guarda la lista tal
// cual llega, en su orden. Si falta o no es una lista, es []. Un elemento que no cumple el formato se
// descarta SIN rechazar el mensaje, y de cada elemento solo se guardan etiqueta y valor (cualquier otro
// campo se ignora). Texto plano: sin caracteres de control ni saltos de línea; la app lo muestra con
// <Text>, nunca como HTML.
const MAX_CARACTERISTICAS = 30;
function textoFicha(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const limpio = v.replace(/[\t\r\n]+/g, " ").replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!limpio || Array.from(limpio).length > max) return null;
  return limpio;
}
function paresValidos(v: unknown, maxEtiqueta: number, maxValor: number): Caracteristica[] {
  if (!Array.isArray(v)) return [];
  const lista: Caracteristica[] = [];
  for (const el of v) {
    if (lista.length >= MAX_CARACTERISTICAS) break;
    if (!el || typeof el !== "object" || Array.isArray(el)) continue;
    const etiqueta = textoFicha((el as Record<string, unknown>).etiqueta, maxEtiqueta);
    const valor = textoFicha((el as Record<string, unknown>).valor, maxValor);
    if (etiqueta && valor) lista.push({ etiqueta, valor });
  }
  return lista;
}
function caracteristicasValidas(v: unknown): Caracteristica[] {
  return paresValidos(v, 40, 80);
}

// «mantenimiento» («Mantenimiento básico realizado»): { titulo ≤ 60, nota ≤ 300, puntos ≤ 30 de { etiqueta ≤ 60,
// valor ≤ 20 } }. Los puntos NO son fijos: se guardan tal cual llegan. null, ausente o algo que no es un objeto =
// sin mantenimiento. Nunca rechaza el mensaje: un título o una nota que no cumplen se quedan en null y los
// puntos mal formados se descartan; los campos desconocidos se ignoran. Si no queda nada que enseñar, null.
function mantenimientoValido(v: unknown): Mantenimiento | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const m = v as Record<string, unknown>;
  const bloque: Mantenimiento = {
    titulo: textoFicha(m.titulo, 60),
    nota: textoFicha(m.nota, 300),
    puntos: paresValidos(m.puntos, 60, 20),
  };
  return bloque.titulo || bloque.nota || bloque.puntos.length ? bloque : null;
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
  // Hasta 30 fotos, en orden (la primera es la portada). Si llegan más, se usan las 30 primeras: nunca se rechaza
  // el mensaje por eso.
  const fotos = (Array.isArray(p.fotos) ? p.fotos : []).slice(0, MAX_FOTOS_VEOAURA);
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
    caracteristicas: caracteristicasValidas(p.caracteristicas),
    mantenimiento: mantenimientoValido(p.mantenimiento),
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

// Texto del dueño: todos los artículos que llegan de VeoAura llevan esta misma descripción.
const DESCRIPCION_VEOAURA = [
  "Estado Funcional : 10 / 10",
  "1 Año de GARANTÍA.",
  "¡Probado y testeado antes de entregarlo o enviarlo!",
  "Limpieza realizada para un estado impecable.",
  "Envíos y Entregas Rápidas.",
].join("\n\n");

type FotoDescargada = { datos: Uint8Array<ArrayBuffer>; tipo: string; ext: string };

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

// Columnas que llegan con su propia migración (products.caracteristicas: 20261029110000_productos_caracteristicas.sql;
// products.mantenimiento: 20261030100000_productos_mantenimiento.sql). Si alguna aún no está aplicada, PostgREST
// responde que no la encuentra: entonces se guarda el resto igualmente, para que el puente nunca se caiga por el
// orden en que se publiquen el código y la migración. Devuelve la columna que falta (o null).
const COLUMNAS_OPCIONALES = ["caracteristicas", "mantenimiento"] as const;
function columnaQueFalta(error: { code?: string; message?: string } | null | undefined): string | null {
  if (!error) return null;
  const m = String(error.message ?? "");
  if (!(error.code === "PGRST204" || error.code === "42703" || /could not find|does not exist/i.test(m))) return null;
  return COLUMNAS_OPCIONALES.find((c) => m.includes(c)) ?? null;
}

async function publicar(supabase: SupabaseClient, idVeoaura: string, p: Producto, sello: string): Promise<string> {
  // Solo los datos del producto (rápido). Las fotos se copian después de responder.
  // Si estaba vendido o retirado, vuelve a estar a la venta y visible.
  // La ficha técnica y el mantenimiento se SUSTITUYEN enteros en cada «publicar» (nunca se mezclan con lo
  // anterior): si en VeoAura se quita o renombra un recuadro, desaparece o cambia aquí. Sin el campo, la lista
  // queda vacía y el mantenimiento en null (se quita).
  const ahora = new Date().toISOString();
  let campos: Record<string, unknown> = {
    title: p.titulo,
    description: DESCRIPCION_VEOAURA,
    price_eur: p.precio,
    condition: condicionTienda(p.estado),
    category_id: await categoriaTienda(supabase, p),
    status: "PUBLISHED",
    is_active: true,
    vendido_en: null,
    retirado_en: null,
    caracteristicas: p.caracteristicas,
    mantenimiento: p.mantenimiento,
    ...(p.fotos.length ? { veoaura_envio: sello } : {}),
    updated_at: ahora,
  };
  // Escribe con la ficha y el mantenimiento y, si alguna de esas columnas aún no existe, repite sin ella (y ya
  // sin ella en adelante). Como mucho una vez por columna opcional.
  async function escribir<T extends { error: { code?: string; message?: string } | null }>(
    hacer: (c: Record<string, unknown>) => PromiseLike<T>
  ): Promise<T> {
    let r = await hacer(campos);
    for (let i = 0; i < COLUMNAS_OPCIONALES.length; i++) {
      const falta = columnaQueFalta(r.error);
      if (!falta || !(falta in campos)) return r;
      const { [falta]: _sinColumna, ...resto } = campos;
      campos = resto;
      r = await hacer(campos);
    }
    return r;
  }

  const { data: existente, error: errBuscar } = await supabase
    .from("products")
    .select("id,is_active")
    .eq("id_veoaura", idVeoaura)
    .maybeSingle<{ id: string; is_active: boolean | null }>();
  if (errBuscar) throw new Rechazo(500, "no se pudo leer el producto");

  let idTienda = existente?.id ?? null;
  if (idTienda) {
    // Si vuelve a la venta (estaba vendido o retirado), cuenta otra vez como novedad
    // (estante «Recién llegado», avisos de novedades y «Avísame cuando llegue»).
    const vuelve = existente?.is_active === false ? { novedad_en: ahora } : {};
    const id = idTienda;
    const { error } = await escribir((c) => supabase.from("products").update({ ...c, ...vuelve }).eq("id", id));
    if (error) throw new Rechazo(500, "no se pudo actualizar el producto");
  } else {
    const { data, error } = await escribir((c) =>
      supabase
        .from("products")
        .insert({ ...c, id_veoaura: idVeoaura })
        .select("id")
        .single<{ id: string }>()
    );
    if (error || !data) {
      // Dos mensajes a la vez: el índice único lo impide; se usa el que ya se creó.
      const { data: otro } = await supabase.from("products").select("id").eq("id_veoaura", idVeoaura).maybeSingle<{ id: string }>();
      if (!otro?.id) throw new Rechazo(500, "no se pudo crear el producto");
      idTienda = otro.id;
      const id = idTienda;
      await escribir((c) => supabase.from("products").update(c).eq("id", id));
    } else {
      idTienda = data.id;
    }
  }

  return idTienda as string;
}

async function envioVigente(supabase: SupabaseClient, idTienda: string, sello: string): Promise<boolean> {
  const { data } = await supabase.from("products").select("veoaura_envio").eq("id", idTienda).maybeSingle<{ veoaura_envio: string | null }>();
  return data?.veoaura_envio === sello;
}

// Huella del contenido (SHA-256, 32 cifras hex): es el nombre del archivo. La misma foto, aunque llegue con otro
// enlace temporal, se llama siempre igual: no se duplica, no se vuelve a subir y su dirección no cambia (la caché
// del optimizador de fotos de Vercel sigue valiendo).
async function huella(datos: Uint8Array<ArrayBuffer>): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", datos));
  return Array.from(h.subarray(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Ejecuta la tarea sobre cada elemento, como mucho `cuantos` a la vez, y devuelve los resultados en su orden.
async function enParalelo<T, R>(lista: T[], cuantos: number, tarea: (x: T) => Promise<R>): Promise<R[]> {
  const salida = new Array<R>(lista.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < lista.length) {
      const i = siguiente++;
      salida[i] = await tarea(lista[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(cuantos, lista.length) }, trabajador));
  return salida;
}

type FotoGuardada = { ruta: string; tipo: string };

// Se ejecuta DESPUÉS de responder a VeoAura. La lista que llega es la COMPLETA: la galería queda igual que en
// VeoAura (mismas fotos, mismo orden, la primera de portada) y las que ya no vienen se quitan. Solo se suben las
// fotos que el producto aún no tiene. Si entretanto llegó otro envío del mismo artículo (otro sello), este no aplica
// nada (el nuevo pondrá las suyas). Devuelve un resumen para el registro.
async function copiarFotos(supabase: SupabaseClient, idTienda: string, idVeoaura: string, fotos: string[], sello: string): Promise<string> {
  const carpeta = `veoaura/${idVeoaura}`;
  const { data: previas, error: errPrevias } = await supabase
    .from("product_media")
    .select("id,storage_path")
    .eq("product_id", idTienda)
    .like("storage_path", "veoaura/%");
  if (errPrevias) throw new Error("no se pudieron leer las fotos anteriores");
  const anteriores = (previas ?? []) as { id: string; storage_path: string }[];
  const yaEstan = new Set(anteriores.map((f) => f.storage_path));

  // Descargar (con un reintento si aún hay tiempo), nombrar por huella y subir solo las que no estén ya.
  const inicio = Date.now();
  let subidas = 0;
  const resultado = await enParalelo(fotos, FOTOS_A_LA_VEZ, async (url): Promise<FotoGuardada | null> => {
    let f = await descargarFoto(url);
    if (!f && Date.now() - inicio < 30_000) f = await descargarFoto(url);
    if (!f) return null;
    const ruta = `${carpeta}/${await huella(f.datos)}.${f.ext}`;
    if (!yaEstan.has(ruta)) {
      const { error } = await supabase.storage.from(BUCKET).upload(ruta, f.datos, {
        contentType: f.tipo,
        cacheControl: "31536000",
        upsert: true,
      });
      if (error) return null;
      subidas++;
    }
    return { ruta, tipo: f.tipo };
  });

  // En el orden de VeoAura y sin repetidas.
  const vistas = new Set<string>();
  const lista: FotoGuardada[] = [];
  for (const x of resultado) {
    if (x && !vistas.has(x.ruta)) {
      vistas.add(x.ruta);
      lista.push(x);
    }
  }
  if (!lista.length) throw new Error("no se pudieron descargar las fotos");
  const fallidas = resultado.filter((x) => !x).length;
  const rutas = lista.map((x) => x.ruta);
  const urlDe = (ruta: string) => supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;

  // Solo si este envío sigue siendo el último.
  const { data: aplicado, error: errAplicar } = await supabase
    .from("products")
    .update({ images: rutas.map(urlDe) })
    .eq("id", idTienda)
    .eq("veoaura_envio", sello)
    .select("id");
  if (errAplicar) throw new Error("no se pudieron aplicar las fotos");
  if (!(aplicado ?? []).length) return "descartadas: llegó un envío más nuevo del mismo artículo";

  // Galería: las que siguen se reordenan, las nuevas se crean (una sola escritura) y las que ya no vienen se quitan.
  const { error: errFilas } = await supabase.from("product_media").upsert(
    lista.map((x, i) => ({
      product_id: idTienda,
      kind: "image",
      storage_path: x.ruta,
      public_url: urlDe(x.ruta),
      mime_type: x.tipo,
      file_name: x.ruta.split("/").pop(),
      sort_order: i,
      is_cover: i === 0,
    })),
    { onConflict: "storage_path" }
  );
  if (errFilas) throw new Error("no se pudieron registrar las fotos");

  const quitar = anteriores.filter((f) => !vistas.has(f.storage_path));
  let sobran: string[] = [];
  // Antes de borrar nada, se comprueba otra vez que no ha llegado un envío más nuevo (que podría usar esos archivos).
  if (await envioVigente(supabase, idTienda, sello)) {
    if (quitar.length) await supabase.from("product_media").delete().in("id", quitar.map((f) => f.id));
    // Archivos de la carpeta que ya no usa la galería: fotos quitadas, copias antiguas o de envíos descartados.
    const { data: archivos } = await supabase.storage.from(BUCKET).list(carpeta, { limit: 1000 });
    sobran = ((archivos ?? []) as { name: string }[]).map((a) => `${carpeta}/${a.name}`).filter((r) => !vistas.has(r));
    if (sobran.length) await supabase.storage.from(BUCKET).remove(sobran);
  }

  return [
    `${lista.length} fotos`,
    `${subidas} subidas`,
    fallidas ? `${fallidas} sin descargar` : "",
    quitar.length ? `${quitar.length} quitadas` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

// --- seguimiento: fichas de clientes con número de seguimiento ------------------------------------------------------

function validarSeguimiento(s: any): FichaSeguimiento {
  if (!s || typeof s !== "object" || Array.isArray(s)) throw new Rechazo(400, "falta seguimiento");
  const tipo = s.tipo === "pedido" ? "pedido" : s.tipo === "reparacion" ? "reparacion" : null;
  if (!tipo) throw new Rechazo(400, "tipo no válido");
  const titulo = texto(s.titulo, 120);
  if (!titulo) throw new Rechazo(400, "título no válido");
  const etapas = tipo === "pedido" ? ETAPAS_PEDIDO : ETAPAS_REPARACION;
  const etapa = typeof s.etapa === "string" && etapas.includes(s.etapa) ? s.etapa : null;
  if (!etapa) throw new Rechazo(400, "etapa no válida");
  // La nota es la «nota del taller» que ve el cliente: solo en reparaciones.
  const nota = tipo === "reparacion" ? texto(s.nota, 500) : null;
  const c = s.cliente && typeof s.cliente === "object" && !Array.isArray(s.cliente) ? s.cliente : {};
  const cliente = {
    nombre: texto(c.nombre, 120),
    apellido: texto(c.apellido, 120),
    telefono: texto(c.telefono, 30),
    email: texto(c.email, 200),
  };
  // Un pedido necesita los mismos datos de contacto que pide la tienda al comprar.
  if (tipo === "pedido") {
    if (!cliente.nombre || cliente.nombre.length < 2) throw new Rechazo(400, "falta el nombre del cliente");
    if (!cliente.telefono || cliente.telefono.length < 6) throw new Rechazo(400, "falta el teléfono del cliente");
    if (!cliente.email || cliente.email.length < 5 || !cliente.email.includes("@")) throw new Rechazo(400, "falta el email del cliente");
  }
  const entrega = s.entrega === "recogida" ? "recogida" : "envio";
  const redondear = (n: number) => Math.round(n * 100) / 100;
  const articulos: { titulo: string; precio_eur: number }[] = [];
  for (const a of Array.isArray(s.articulos) ? s.articulos.slice(0, MAX_ARTICULOS) : []) {
    if (!a || typeof a !== "object") continue;
    const t = typeof a.titulo === "string" ? texto(a.titulo, 200) : null;
    const precio = Number(a.precio_eur);
    if (t && typeof a.precio_eur === "number" && Number.isFinite(precio) && precio >= 0 && precio <= 1_000_000) {
      articulos.push({ titulo: t, precio_eur: redondear(precio) });
    }
  }
  const totalDado = Number(s.total_eur);
  const total =
    typeof s.total_eur === "number" && Number.isFinite(totalDado) && totalDado >= 0 && totalDado <= 1_000_000
      ? redondear(totalDado)
      : redondear(articulos.reduce((suma, a) => suma + a.precio_eur, 0));
  return { tipo, titulo, etapa, nota, cliente, entrega, articulos, total };
}

// ¿Faltan las columnas del seguimiento? (la migración 20261031170000 aún no está aplicada)
function faltaSeguimiento(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === "42703" || /codigo_seguimiento|id_veoaura/.test(String(error.message ?? "")));
}

type ResultadoSeguimiento = { idTienda: string; codigo: string; vinculado: boolean; numero?: number };

// Crea la ficha la primera vez (la base de datos le pone el número) y la pone al día en los siguientes envíos, siempre
// por id_veoaura: nunca duplica. El número no cambia nunca.
async function guardarSeguimiento(supabase: SupabaseClient, idVeoaura: string, f: FichaSeguimiento): Promise<ResultadoSeguimiento> {
  const ahora = new Date().toISOString();
  const [rep, ped] = await Promise.all([
    supabase.from("service_requests").select("id,codigo_seguimiento,customer_user_id,seguimiento,seguimiento_nota").eq("id_veoaura", idVeoaura).limit(1),
    supabase.from("pedidos").select("id,numero,codigo_seguimiento,user_id,estado,entrega").eq("id_veoaura", idVeoaura).limit(1),
  ]);
  if (faltaSeguimiento(rep.error) || faltaSeguimiento(ped.error)) throw new Rechazo(503, "seguimiento aún no activado en la tienda");
  if (rep.error || ped.error) throw new Rechazo(500, "no se pudo leer la ficha");
  const existeRep = (rep.data ?? [])[0] as
    | { id: string; codigo_seguimiento: string; customer_user_id: string | null; seguimiento: string | null; seguimiento_nota: string | null }
    | undefined;
  const existePed = (ped.data ?? [])[0] as
    | { id: string; numero: number; codigo_seguimiento: string; user_id: string | null; estado: string; entrega: string }
    | undefined;
  if ((existeRep && f.tipo === "pedido") || (existePed && f.tipo === "reparacion")) {
    throw new Rechazo(409, "esa ficha ya existe con otro tipo");
  }

  if (f.tipo === "reparacion") {
    if (existeRep) {
      const cambia = existeRep.seguimiento !== f.etapa || (existeRep.seguimiento_nota ?? null) !== f.nota;
      const { error } = await supabase
        .from("service_requests")
        .update({
          service_title: f.titulo,
          seguimiento: f.etapa,
          seguimiento_nota: f.nota,
          ...(cambia ? { seguimiento_actualizado: ahora } : {}),
        })
        .eq("id", existeRep.id);
      if (error) throw new Rechazo(500, "no se pudo actualizar la ficha");
      return { idTienda: existeRep.id, codigo: existeRep.codigo_seguimiento, vinculado: !!existeRep.customer_user_id };
    }
    const { data, error } = await supabase
      .from("service_requests")
      .insert({
        service_title: f.titulo,
        nombre: f.cliente.nombre ?? "Cliente",
        apellido: f.cliente.apellido ?? "",
        ciudad: "",
        contacto: f.cliente.telefono ?? f.cliente.email,
        id_veoaura: idVeoaura,
      })
      .select("id,codigo_seguimiento")
      .single();
    if (faltaSeguimiento(error)) throw new Rechazo(503, "seguimiento aún no activado en la tienda");
    if (error || !data) throw new Rechazo(500, "no se pudo crear la ficha");
    // Al crearla, la base de datos la deja en su primera etapa (como cualquier solicitud): se pone la que dice VeoAura.
    const { error: errEtapa } = await supabase
      .from("service_requests")
      .update({ status: "revisado", seguimiento: f.etapa, seguimiento_nota: f.nota, seguimiento_actualizado: ahora })
      .eq("id", data.id);
    if (errEtapa) throw new Rechazo(500, "no se pudo guardar la etapa");
    return { idTienda: data.id, codigo: data.codigo_seguimiento, vinculado: false };
  }

  if (existePed) {
    const { error } = await supabase.from("pedidos").update({ estado: f.etapa, entrega: f.entrega }).eq("id", existePed.id);
    if (error) throw new Rechazo(500, "no se pudo actualizar la ficha");
    return { idTienda: existePed.id, codigo: existePed.codigo_seguimiento, vinculado: !!existePed.user_id, numero: existePed.numero };
  }
  const { data, error } = await supabase
    .from("pedidos")
    .insert({
      estado: f.etapa,
      entrega: f.entrega,
      nombre: f.cliente.nombre,
      email: f.cliente.email,
      telefono: f.cliente.telefono,
      total_eur: f.total,
      id_veoaura: idVeoaura,
    })
    .select("id,numero,codigo_seguimiento")
    .single();
  if (faltaSeguimiento(error)) throw new Rechazo(503, "seguimiento aún no activado en la tienda");
  if (error || !data) throw new Rechazo(500, "no se pudo crear la ficha");
  const articulos = f.articulos.length ? f.articulos : [{ titulo: f.titulo, precio_eur: f.total }];
  const { error: errArticulos } = await supabase
    .from("pedido_items")
    .insert(articulos.map((a) => ({ pedido_id: data.id, product_id: null, titulo: a.titulo, precio_eur: a.precio_eur })));
  if (errArticulos) throw new Rechazo(500, "no se pudieron guardar los artículos");
  return { idTienda: data.id, codigo: data.codigo_seguimiento, vinculado: false, numero: data.numero };
}

// vendido: sin stock y no comprable. retirar: oculto (no se ve ni se compra), sin borrarlo.
async function ocultar(supabase: SupabaseClient, idVeoaura: string, motivo: "vendido" | "retirar"): Promise<string | null> {
  const ahora = new Date().toISOString();
  const marca = motivo === "vendido" ? { vendido_en: ahora } : { retirado_en: ahora };
  const { data, error } = await supabase
    .from("products")
    .update({ is_active: false, ...marca, updated_at: ahora })
    .eq("id_veoaura", idVeoaura)
    .select("id");
  if (error) throw new Rechazo(500, motivo === "vendido" ? "no se pudo marcar como vendido" : "no se pudo retirar");
  return (data ?? [])[0]?.id ?? null; // si no existe, no hay nada que hacer (ok igualmente)
}

// Trabajo después de responder. En Vercel se usa su waitUntil (el mismo que expone
// @vercel/functions, sin añadir la dependencia); si no existe, se espera aquí mismo.
async function despuesDeResponder(tarea: () => Promise<void>): Promise<void> {
  const contexto = (globalThis as any)[Symbol.for("@vercel/request-context")]?.get?.();
  const promesa = tarea();
  if (typeof contexto?.waitUntil === "function") {
    contexto.waitUntil(promesa);
    return;
  }
  await promesa;
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
  // Solo pasa a true cuando la firma ya está comprobada: a partir de ahí quien escribe conoce el secreto
  // (es VeoAura), y solo entonces un rechazo se apunta en la base de datos. Lo que llega sin firma válida
  // (cualquiera en internet) queda únicamente en el registro de Vercel, no en escaparate_registro: así un
  // anónimo ya no puede llenar esa tabla ni los registros con peticiones basura.
  let autenticado = false;

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
    autenticado = true;

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
    if (mensaje?.version !== 1 || !EVENTOS.includes(evento as Evento)) {
      throw new Rechazo(400, "versión o evento no admitidos");
    }

    // 7. Campos.
    idVeoaura = typeof mensaje.id_veoaura === "string" ? mensaje.id_veoaura : null;
    if (!idVeoaura || !UUID_RE.test(idVeoaura)) throw new Rechazo(400, "id_veoaura no válido");
    idVeoaura = idVeoaura.toLowerCase();

    // Fichas con número de seguimiento: se guardan y se responde con el número (VeoAura se lo da al cliente).
    if ((evento as Evento) === "seguimiento") {
      const ficha = validarSeguimiento(mensaje.seguimiento);
      const r = await guardarSeguimiento(supabase, idVeoaura, ficha);
      await registrar(supabase, { evento, id_veoaura: idVeoaura, resultado: "ok", http: 200, detalle: `${ficha.tipo} · ${r.codigo}${r.vinculado ? " · vinculado" : ""}` });
      responder(res, 200, {
        ok: true,
        id_tienda: r.idTienda,
        tipo: ficha.tipo,
        codigo_seguimiento: r.codigo,
        vinculado: r.vinculado,
        ...(r.numero !== undefined ? { numero_pedido: r.numero } : {}),
      });
      return;
    }

    // 8 y 9. Guardar y, solo después, responder (las fotos, justo después de responder).
    let idTienda: string | null;
    let fotos: string[] = [];
    const sello = `${Date.now()}-${nonce.slice(0, 8)}`;
    if ((evento as Evento) === "publicar") {
      const producto = validarProducto(mensaje.producto);
      idTienda = await publicar(supabase, idVeoaura, producto, sello);
      fotos = producto.fotos;
    } else {
      idTienda = await ocultar(supabase, idVeoaura, evento as "vendido" | "retirar");
    }

    await registrar(supabase, { evento, id_veoaura: idVeoaura, resultado: "ok", http: 200, detalle: idTienda ? undefined : "no existía en la tienda" });
    responder(res, 200, idTienda ? { ok: true, id_tienda: idTienda } : { ok: true });

    if (idTienda && fotos.length) {
      const id = idTienda;
      const idV = idVeoaura;
      await despuesDeResponder(async () => {
        try {
          const resumen = await copiarFotos(supabase, id, idV, fotos, sello);
          await registrar(supabase, { evento: "fotos", id_veoaura: idV, resultado: "ok", http: 200, detalle: resumen });
        } catch (e: unknown) {
          const motivo = e instanceof Error ? e.message : "error al copiar las fotos";
          await registrar(supabase, { evento: "fotos", id_veoaura: idV, resultado: "error", http: 502, detalle: motivo });
        }
      });
    }
  } catch (e: unknown) {
    const r = e instanceof Rechazo ? e : new Rechazo(500, "error interno");
    if (!(e instanceof Rechazo)) console.error("escaparate-veoaura: error inesperado", e);
    await registrar(autenticado ? supabase : null, { evento, id_veoaura: idVeoaura, resultado: "error", http: r.http, detalle: r.motivo });
    responder(res, r.http, { ok: false, error: r.motivo });
  }
}
