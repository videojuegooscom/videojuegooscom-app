/**
 * lib/interaccion.ts
 *
 * Qué hace: cuenta las VISITAS de productos y servicios y da o quita el «ME GUSTA», pasando por
 * api/interaccion.ts (que pone los límites: una visita por visitante y página cada hora, un «me gusta»
 * por persona y producto). Antes las pantallas llamaban directamente a funciones de la base de datos que
 * cualquiera podía ejecutar sin límite (supabase/migrations/20261018130000_visitas_y_apoyos_protegidos.sql).
 *
 * Cómo funciona:
 * - «Me gusta»: se manda el token de sesión si hay (el servidor lo valida y cuenta por USUARIO); si no, un
 *   identificador anónimo de este navegador (se crea una vez y se guarda en AsyncStorage).
 * - Si el endpoint no responde (sin red, 404 porque aún no está publicado, error del servidor), se cae a las
 *   funciones antiguas de la base de datos: así la tienda no se rompe según el orden en que se publique y
 *   se aplique la migración. Cuando la migración esté aplicada, esas funciones ya no las puede ejecutar el
 *   navegador y simplemente no se cuenta. Si el endpoint responde que NO (límite, petición no válida), no se
 *   usa la vía antigua: sería saltarse el límite.
 *
 * - «Avísame si baja de precio» (2026-11-14): misAvisosPrecio, fijarAvisoPrecio y marcarBajadaAvisada sobre la tabla
 *   avisos_precio (con la sesión del cliente; solo con cuenta).
 *
 * Conectado con: app/producto/[id].tsx (visitas, «me gusta» y aviso de precio), app/servicio/[id].tsx (visitas y «me
 * gusta»), app/(tabs)/perfil.tsx (pestaña «Me gusta» y sus avisos de precio), components/Campanita.tsx (Blue avisa de las
 * bajadas), api/interaccion.ts, lib/supabase.ts.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { supabase } from "./supabase";

export const URL_INTERACCION = Platform.OS === "web" ? "/api/interaccion" : "https://videojuegoszaragoza.com/api/interaccion";
const VISITANTE_KEY = "videojuegoszaragoza:visitante";

function nuevoIdentificador(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Sin crypto.randomUUID (móvil nativo): identificador aleatorio de 32 caracteres.
  let s = "";
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

// El identificador anónimo de este navegador: se crea una vez y se reutiliza.
async function identificadorDeVisitante(): Promise<string> {
  try {
    const guardado = await AsyncStorage.getItem(VISITANTE_KEY);
    if (guardado && /^[A-Za-z0-9_-]{8,80}$/.test(guardado)) return guardado;
  } catch {
    // sin almacenamiento
  }
  const nuevo = nuevoIdentificador();
  try {
    await AsyncStorage.setItem(VISITANTE_KEY, nuevo);
  } catch {
    // sin almacenamiento: vale para esta sesión
  }
  return nuevo;
}

type Respuesta = { ok: true; total?: number; contado?: boolean } | { ok: false; usarViaAntigua: boolean };

async function llamar(cuerpo: Record<string, unknown>): Promise<Respuesta> {
  try {
    let token: string | null = null;
    try {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token ?? null;
    } catch {
      // sin sesión
    }
    const r = await fetch(URL_INTERACCION, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(cuerpo),
    });
    const datos = await r.json().catch(() => null);
    if (r.ok && datos?.ok) return { ok: true, total: typeof datos.total === "number" ? datos.total : undefined, contado: datos.contado };
    // 400 (petición no válida) y 429 (límite): el servidor dijo que no; no se usa la vía antigua.
    return { ok: false, usarViaAntigua: !(r.status === 400 || r.status === 429) };
  } catch {
    return { ok: false, usarViaAntigua: true };
  }
}

async function viaAntigua(funcion: string, argumentos: Record<string, unknown>): Promise<number | null> {
  try {
    const { data, error } = await supabase.rpc(funcion, argumentos);
    return !error && typeof data === "number" ? data : null;
  } catch {
    return null;
  }
}

// Cuenta una visita a una ficha de producto. Devuelve el total si el servidor lo da (null si esta visita no
// cuenta, por ejemplo por repetida, o si no se pudo).
export async function contarVistaProducto(id: string): Promise<number | null> {
  const r = await llamar({ accion: "vista_producto", id });
  if (r.ok) return r.total ?? null;
  return r.usarViaAntigua ? viaAntigua("increment_product_view", { product_id: id }) : null;
}

export async function contarVistaServicio(id: string): Promise<number | null> {
  const r = await llamar({ accion: "vista_servicio", id });
  if (r.ok) return r.total ?? null;
  return r.usarViaAntigua ? viaAntigua("increment_service_view", { service_id: id }) : null;
}

// Da (activo = true) o quita (false) el «me gusta» de esta persona. Devuelve el total de «me gusta» o null si
// no se pudo (la pantalla deshace entonces el cambio que había hecho al instante).
export async function fijarMeGusta(id: string, activo: boolean): Promise<number | null> {
  const r = await llamar({ accion: "apoyo", id, activo, visitante: await identificadorDeVisitante() });
  if (r.ok) return r.total ?? null;
  return r.usarViaAntigua ? viaAntigua("adjust_product_like", { product_id: id, delta: activo ? 1 : -1 }) : null;
}

// Lo mismo para un servicio (supabase/migrations/20261103200000_servicios_me_gusta.sql). No hay vía antigua: si
// el servidor no puede, null (la ficha deshace el cambio).
export async function fijarMeGustaServicio(id: string, activo: boolean): Promise<number | null> {
  const r = await llamar({ accion: "apoyo_servicio", id, activo, visitante: await identificadorDeVisitante() });
  return r.ok ? r.total ?? null : null;
}

// «Me gusta» de ESTE dispositivo (también sin sesión): la ficha de producto guarda los suyos en
// LIKED_PRODUCTS_KEY (app/producto/[id].tsx, la misma clave) y la de servicio, en LIKED_SERVICES_KEY.
export const LIKED_PRODUCTS_KEY = "videojuegoszaragoza:liked_products";
export const LIKED_SERVICES_KEY = "videojuegoszaragoza:liked_services";

export async function meGustaLocales(clave: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(clave);
    const lista = raw ? JSON.parse(raw) : [];
    return Array.isArray(lista) ? lista.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export async function guardarMeGustaLocal(clave: string, id: string, activo: boolean): Promise<void> {
  const ids = new Set(await meGustaLocales(clave));
  if (activo) ids.add(id);
  else ids.delete(id);
  try {
    await AsyncStorage.setItem(clave, JSON.stringify([...ids]));
  } catch {
    // sin almacenamiento: el «me gusta» ya se apuntó en el servidor
  }
}

// «Me gusta» del usuario con sesión guardados en el servidor (los da en cualquier dispositivo). null sin sesión o si
// no se pudo; la pestaña «Me gusta» de Perfil junta esto con los del dispositivo.
export async function misMeGustaServidor(): Promise<{ productos: string[]; servicios: string[] } | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const r = await fetch(URL_INTERACCION, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ accion: "mis_me_gusta" }),
    });
    const datos = await r.json().catch(() => null);
    if (!r.ok || !datos?.ok) return null;
    const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    return { productos: ids(datos.productos), servicios: ids(datos.servicios) };
  } catch {
    return null;
  }
}

// --- «Avísame si baja de precio» (mejora 5, 2026-11-14; migración 20261114160100_avisos_precio.sql) ----------------
// SOLO CON CUENTA. Cada cliente sigue los productos que quiere (tabla avisos_precio, RLS: solo los suyos). El precio al
// activarlo lo pone la base de datos; Blue (components/Campanita.tsx) avisa cuando baja y apunta en precio_avisado el
// precio del que ya avisó (una vez por bajada). Sin la migración, la tabla no existe: se pregunta una vez por carga de la
// tienda y se recuerda (sin repetir el 404), y la ficha no ofrece el interruptor.
export type AvisoPrecio = { id: string; product_id: string; precio_inicial: number; precio_avisado: number | null; creado_en: string };
let sinAvisosPrecio = false;
const oyentesAvisosPrecio = new Set<() => void>();
const esFaltaTabla = (e: unknown) => ["42P01", "PGRST205"].includes(String((e as { code?: string } | null)?.code ?? ""));

/** Quien escucha cambios (Blue relee sus avisos al activarse o quitarse uno). Devuelve cómo dejar de escuchar. */
export function alCambiarAvisosPrecio(f: () => void): () => void {
  oyentesAvisosPrecio.add(f);
  return () => {
    oyentesAvisosPrecio.delete(f);
  };
}

/** Los avisos de precio del cliente con sesión. null sin sesión, sin la tabla o si la lectura falla (no es «ninguno»). */
export async function misAvisosPrecio(): Promise<AvisoPrecio[] | null> {
  if (sinAvisosPrecio) return null;
  try {
    const { data: s } = await supabase.auth.getSession();
    const uid = s.session?.user?.id;
    if (!uid) return null;
    const { data, error } = await supabase
      .from("avisos_precio")
      .select("id,product_id,precio_inicial,precio_avisado,creado_en")
      .eq("user_id", uid)
      .order("creado_en", { ascending: false })
      .limit(50);
    if (error) {
      if (esFaltaTabla(error)) sinAvisosPrecio = true;
      return null;
    }
    return ((data ?? []) as { id: string; product_id: string; precio_inicial: number | string; precio_avisado: number | string | null; creado_en: string }[]).map((f) => ({
      id: f.id,
      product_id: f.product_id,
      precio_inicial: Number(f.precio_inicial),
      precio_avisado: f.precio_avisado === null ? null : Number(f.precio_avisado),
      creado_en: f.creado_en,
    }));
  } catch {
    return null;
  }
}

/** Activa (true) o quita (false) el aviso de este producto. "sin_sesion" sin cuenta; "error" si no se pudo. */
export async function fijarAvisoPrecio(productId: string, activo: boolean): Promise<"ok" | "sin_sesion" | "limite" | "error"> {
  try {
    const { data: s } = await supabase.auth.getSession();
    const uid = s.session?.user?.id;
    if (!uid) return "sin_sesion";
    const { error } = activo
      ? await supabase.from("avisos_precio").insert({ product_id: productId })
      : await supabase.from("avisos_precio").delete().eq("user_id", uid).eq("product_id", productId);
    // Ya estaba activado (otra pestaña): cuenta como hecho.
    if (error && !(activo && String((error as { code?: string }).code) === "23505")) {
      if (esFaltaTabla(error)) sinAvisosPrecio = true;
      return /50 avisos/.test(String(error.message)) ? "limite" : "error";
    }
    oyentesAvisosPrecio.forEach((f) => f());
    return "ok";
  } catch {
    return "error";
  }
}

/** Blue ya avisó de esta bajada: se apunta el precio para no repetirla (en cualquier dispositivo). */
export async function marcarBajadaAvisada(productId: string, precio: number): Promise<void> {
  try {
    const { data: s } = await supabase.auth.getSession();
    const uid = s.session?.user?.id;
    if (!uid || !(precio > 0)) return;
    await supabase.from("avisos_precio").update({ precio_avisado: precio }).eq("user_id", uid).eq("product_id", productId);
  } catch {
    // sin red: se volverá a avisar, no pasa nada
  }
}

/** El precio a partir del cual hay bajada: el más bajo entre el de activarlo y el último avisado. */
export function precioReferenciaAviso(a: Pick<AvisoPrecio, "precio_inicial" | "precio_avisado">): number {
  return a.precio_avisado !== null && a.precio_avisado > 0 ? Math.min(a.precio_inicial, a.precio_avisado) : a.precio_inicial;
}
