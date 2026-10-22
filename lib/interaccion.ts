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
 * Conectado con: app/producto/[id].tsx (visitas y «me gusta»), app/servicio/[id].tsx (visitas),
 * api/interaccion.ts, lib/supabase.ts.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { supabase } from "./supabase";

const URL_INTERACCION = Platform.OS === "web" ? "/api/interaccion" : "https://videojuegoszaragoza.com/api/interaccion";
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
