/**
 * Qué hace: reserva 15 minutos cada artículo que el cliente añade a la cesta
 * (son unidades únicas de segunda mano), para que nadie más lo compre mientras.
 *
 * Cómo funciona: cada dispositivo guarda un token aleatorio. Reservar pasa por
 * api/interaccion.ts (que limita las reservas por IP y por persona: antes cualquiera
 * podía acaparar toda la tienda con tokens inventados) y soltar/consultar llaman a las
 * funciones de Supabase de supabase/migrations/20261013090000_reservas_cesta.sql.
 * Si el servidor o esas funciones no responden, no se bloquea la compra: la
 * reserva cuenta solo en este dispositivo (mismos 15 minutos).
 *
 * Usado por: app/producto/[id].tsx (al añadir/comprar), app/(tabs)/cesta.tsx
 * (cuenta atrás y caducidad) y app/checkout.tsx (renovación al confirmar).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { URL_INTERACCION } from "./interaccion";
import { supabase } from "./supabase";

export const RESERVA_MINUTOS = 15;
export const RESERVA_MS = RESERVA_MINUTOS * 60 * 1000;

const TOKEN_KEY = "videojuegoos_reserva_token_v1";

function nuevoUuid(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

let tokenCache: string | null = null;

async function tokenDispositivo(): Promise<string> {
  if (tokenCache) return tokenCache;
  try {
    const guardado = await AsyncStorage.getItem(TOKEN_KEY);
    if (guardado) {
      tokenCache = guardado;
      return guardado;
    }
  } catch {
    // Sin almacenamiento: token solo para esta sesión.
  }
  const nuevo = nuevoUuid();
  tokenCache = nuevo;
  try {
    await AsyncStorage.setItem(TOKEN_KEY, nuevo);
  } catch {
    // no-op
  }
  return nuevo;
}

export type ResultadoReserva =
  | { ok: true; hasta: number }
  | { ok: false; motivo: "reservado" };

// Reserva por el endpoint del servidor (api/interaccion.ts), que pone los topes por IP y por persona.
// «rechazado»: el servidor dijo que no (límite, petición no válida): no se usa la vía antigua, sería saltarse
// el tope. «no disponible»: el endpoint no responde (sin red, 404 porque aún no está publicado, error del
// servidor): se cae a la función antigua de la base de datos, que deja de poder ejecutarse al aplicar
// supabase/migrations/20261018140000_reservas_protegidas.sql (entonces la reserva cuenta solo en este dispositivo).
type ReservaServidor = { estado: "ok"; hasta: string | null } | { estado: "rechazado" } | { estado: "no disponible" };

async function reservarPorServidor(productId: string, token: string): Promise<ReservaServidor> {
  try {
    let sesion: string | null = null;
    try {
      const { data } = await supabase.auth.getSession();
      sesion = data.session?.access_token ?? null;
    } catch {
      // sin sesión
    }
    const r = await fetch(URL_INTERACCION, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(sesion ? { Authorization: `Bearer ${sesion}` } : {}) },
      body: JSON.stringify({ accion: "reservar", id: productId, token }),
    });
    const datos = await r.json().catch(() => null);
    if (r.ok && datos?.ok) return { estado: "ok", hasta: typeof datos.hasta === "string" ? datos.hasta : null };
    // 400 y 429: el servidor dijo que no. Un 404 puede ser que el endpoint aún no exista (vista previa, desarrollo):
    // se cae a la vía antigua, que con un producto inexistente falla sin consecuencias.
    if (r.status === 400 || r.status === 429) return { estado: "rechazado" };
    return { estado: "no disponible" };
  } catch {
    return { estado: "no disponible" };
  }
}

/** Reserva (o renueva) el producto 15 minutos para este dispositivo. */
export async function reservarProducto(productId: string): Promise<ResultadoReserva> {
  const local = Date.now() + RESERVA_MS;
  try {
    const token = await tokenDispositivo();
    const servidor = await reservarPorServidor(productId, token);
    if (servidor.estado === "ok") {
      if (servidor.hasta === null) return { ok: false, motivo: "reservado" };
      const hasta = new Date(servidor.hasta).getTime();
      return { ok: true, hasta: Number.isFinite(hasta) ? hasta : local };
    }
    // El servidor puso un tope: la compra no se bloquea, la reserva cuenta solo en este dispositivo.
    if (servidor.estado === "rechazado") return { ok: true, hasta: local };
    const { data, error } = await supabase.rpc("reservar_producto", {
      p_product_id: productId,
      p_token: token,
    });
    if (error) return { ok: true, hasta: local };
    if (data == null) return { ok: false, motivo: "reservado" };
    const hasta = new Date(String(data)).getTime();
    return { ok: true, hasta: Number.isFinite(hasta) ? hasta : local };
  } catch {
    return { ok: true, hasta: local };
  }
}

/** Suelta la reserva propia (al quitar el artículo o al caducar). */
export async function liberarReserva(productId: string): Promise<void> {
  try {
    const token = await tokenDispositivo();
    await supabase.rpc("liberar_reserva", { p_product_id: productId, p_token: token });
  } catch {
    // Si falla, la reserva caduca sola a los 15 minutos.
  }
}

/** De una lista de productos, los que tiene reservados ahora otro cliente. */
export async function productosReservadosPorOtros(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  try {
    const token = await tokenDispositivo();
    const { data, error } = await supabase.rpc("productos_reservados", {
      p_ids: ids,
      p_token: token,
    });
    if (error || !Array.isArray(data)) return new Set();
    return new Set(
      data.map((row: unknown) =>
        typeof row === "string" ? row : String((row as Record<string, unknown>)?.productos_reservados ?? "")
      )
    );
  } catch {
    return new Set();
  }
}

/** "14:05" a partir de los milisegundos que faltan. */
export function formatoCuentaAtras(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(total / 60);
  const seg = total % 60;
  return `${min}:${String(seg).padStart(2, "0")}`;
}
