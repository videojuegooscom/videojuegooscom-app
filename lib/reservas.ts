// lib/reservas.ts
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
 * Conectado con: app/producto/[id].tsx (al añadir/comprar), app/(tabs)/cesta.tsx
 * (cuenta atrás y caducidad) y app/checkout.tsx (renovación al confirmar). Usa
 * lib/interaccion.ts (dirección de api/interaccion.ts) y lib/supabase.ts.
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

// --- Reservar con señal (mejora 14, 2026-11-15; migración 20261115150000_reservas_senal) ------------------------------
// APAGADA Y VACÍA hasta que el dueño ponga sus reglas y su gestor revise el texto. La tienda pregunta a
// GET /api/pago?reserva=ajustes (la tabla de ajustes solo la lee el administrador): si no dice «activa», no se enseña nada.
// El cálculo de aquí es SOLO para enseñarlo: el importe que se cobra lo recalcula api/pago.ts con la base de datos.
// Conectado con: api/pago.ts (ajustesReservaPublicos, crearReserva), app/producto/[id].tsx (ReservarConSenal),
// app/(tabs)/perfil.tsx (MisReservasSenal) y app/admin/reservas.tsx.

export type TramoReservaSenal = { hasta_dias: number; porcentaje: number };
export type TipoArras = "penitenciales" | "confirmatorias";
export type AjustesReservaPublicos = {
  activa: boolean;
  escala?: TramoReservaSenal[];
  dias_max?: number;
  tipo_arras?: TipoArras;
  al_vencer?: string;
  texto_condiciones?: string;
  reservado_hasta?: string;
};

export const URL_PAGO = "/api/pago";
export const MARCA_BORRADOR_RESERVA = "BORRADOR · Pendiente de revisión del gestor";

// Explicación neutra de cada tipo de arras (orientativa; la confirma el gestor del dueño).
export const EXPLICACION_ARRAS: Record<TipoArras, { titulo: string; texto: string }> = {
  penitenciales: {
    titulo: "Arras penitenciales",
    texto:
      "Permiten echarse atrás (artículo 1454 del Código Civil): si el comprador desiste, pierde la señal; si desiste la tienda, devuelve la señal duplicada.",
  },
  confirmatorias: {
    titulo: "Arras confirmatorias",
    texto:
      "La señal es un adelanto del precio y confirma la compra: no permite desistir perdiéndola. Si una parte no cumple, la otra puede exigir que se cumpla o resolver la compra con indemnización.",
  },
};

// Borrador genérico y prudente (sin cifras: el porcentaje, los días y qué pasa al vencer salen de las reglas del dueño).
export const BORRADOR_CONDICIONES_RESERVA = `${MARCA_BORRADOR_RESERVA}

Condiciones de la reserva con señal

1. Qué es. Al pagar la señal, la tienda aparta el artículo para ti durante los días que elijas y no lo vende a otra persona mientras dure la reserva.
2. Importe. La señal es el porcentaje del precio que corresponde a los días elegidos según la escala de la tienda. Se te enseña antes de pagar y se paga en la página segura de Stripe.
3. Tipo de arras. La señal se entrega en concepto de arras del tipo indicado en la reserva, con los efectos que les da el Código Civil.
4. Resto del precio. Lo que falta se paga al completar la compra, de la forma que acuerdes con la tienda, antes de que venza la reserva.
5. Al vencer. Si la compra no se completa antes del vencimiento, se aplica lo indicado en «Qué pasa al vencer» de la reserva.
6. Cancelación por la tienda. Si la tienda no puede entregar el artículo reservado, te devuelve la señal según el tipo de arras.
7. Datos. Guardamos la reserva (artículo, importe, plazo y estas condiciones) unida a tu cuenta para gestionarla.

Este texto es un borrador: no se enseña a ningún cliente mientras las reservas estén desactivadas.`;

/** Valida la escala escrita: tramos con días enteros crecientes (1-365) y porcentaje entero del 1 al 70. */
export function validarEscalaReserva(escala: TramoReservaSenal[]): string | null {
  if (!escala.length) return "Añade al menos un tramo a la escala.";
  if (escala.length > 12) return "La escala admite como mucho 12 tramos.";
  let previo = 0;
  for (const [i, t] of escala.entries()) {
    if (!Number.isInteger(t.hasta_dias) || t.hasta_dias < 1 || t.hasta_dias > 365) return `Tramo ${i + 1}: los días tienen que ser un entero de 1 a 365.`;
    if (t.hasta_dias <= previo) return `Tramo ${i + 1}: los días tienen que ser mayores que los del tramo anterior.`;
    if (!Number.isInteger(t.porcentaje) || t.porcentaje < 1 || t.porcentaje > 70) return `Tramo ${i + 1}: el porcentaje tiene que ser un entero del 1 al 70.`;
    previo = t.hasta_dias;
  }
  return null;
}

/** El porcentaje de esos días (primer tramo que los cubre) o null si pasan del último. */
export function porcentajeReserva(escala: TramoReservaSenal[], dias: number): number | null {
  return escala.find((t) => dias <= t.hasta_dias)?.porcentaje ?? null;
}

/** La señal en euros, al céntimo, como la calcula el servidor. */
export function senalReserva(precioEur: number, porcentaje: number): number {
  const precioCts = Math.round(precioEur * 100);
  return Math.round((precioCts * porcentaje) / 100) / 100;
}

/** ¿La configuración pública está activa y completa? (si no, no se enseña nada). */
export function reservaDisponible(a: AjustesReservaPublicos | null): boolean {
  return !!a && a.activa === true && Array.isArray(a.escala) && a.escala.length > 0 && Number.isInteger(a.dias_max) && !!a.tipo_arras && !!a.al_vencer && !!a.texto_condiciones;
}

/** GET /api/pago?reserva=ajustes (con la sesión, si la hay). Ante cualquier fallo, apagada. */
export async function leerAjustesReserva(productId?: string): Promise<AjustesReservaPublicos> {
  try {
    let token: string | null = null;
    try {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token ?? null;
    } catch {
      // sin sesión
    }
    const q = productId ? `&producto=${encodeURIComponent(productId)}` : "";
    const r = await fetch(`${URL_PAGO}?reserva=ajustes${q}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const d = (await r.json().catch(() => null)) as AjustesReservaPublicos | null;
    if (!r.ok || !d || typeof d !== "object") return { activa: false };
    return { ...d, activa: d.activa === true };
  } catch {
    return { activa: false };
  }
}

/** «15 de diciembre de 2026». */
export function fechaReserva(iso: string | number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" });
}

/** «12,50 €». */
export function eurosReserva(n: number): string {
  const c = Math.round((Number.isFinite(n) ? n : 0) * 100);
  const [ent, dec] = (Math.abs(c) / 100).toFixed(2).split(".");
  return `${c < 0 ? "-" : ""}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec} €`;
}

/** "14:05" a partir de los milisegundos que faltan. */
export function formatoCuentaAtras(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(total / 60);
  const seg = total % 60;
  return `${min}:${String(seg).padStart(2, "0")}`;
}
