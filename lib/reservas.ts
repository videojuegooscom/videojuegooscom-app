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

// Borrador de condiciones (2026-11-15) para que lo revise el gestor del dueño: dos variantes del tipo de arras, huecos
// [A DECIDIR POR EL DUEÑO] y la base legal de cada apartado («comprobar en el BOE»: citada de memoria, sin consultar).
// Sin cifras del negocio: las marcas {porcentaje}, {dias}, {fecha_vencimiento}, {senal_eur} y {precio_eur} se rellenan
// solas con los datos de cada reserva (rellenarCondicionesReserva). Las notas internas impiden activarla.
export const BORRADOR_CONDICIONES_RESERVA = `${MARCA_BORRADOR_RESERVA}

Condiciones de la reserva con señal

NOTA PARA EL GESTOR (borrar antes de activar): el apartado 4 tiene dos variantes (A, arras penitenciales; B, arras confirmatorias); hay que dejar solo la que elija el dueño. Hay que rellenar o quitar cada [A DECIDIR POR EL DUEÑO]. Las marcas entre llaves ({porcentaje}, {dias}, {fecha_vencimiento}, {senal_eur}, {precio_eur}) se rellenan solas con los datos de cada reserva: no hay que tocarlas. Esta nota, los huecos, los «comprobar en el BOE», la palabra BORRADOR y la variante que no se use hay que quitarlos: mientras estén, la tienda no deja activar las reservas. Las citas legales son de memoria. PUNTO A REVISAR: el apartado 8 (desistimiento de 14 días naturales).

1. Quién vende. [A DECIDIR POR EL DUEÑO: nombre o razón social, NIF, dirección a efectos de notificaciones y correo de contacto.] (LGDCU, art. 97: información previa en contratos a distancia; comprobar en el BOE)

2. Qué es la reserva. Al pagar la señal, la tienda aparta para ti el artículo indicado en tu reserva durante {dias}, hasta el {fecha_vencimiento}, y no lo vende a otra persona mientras dure la reserva. (Código Civil, art. 1454, y LGDCU, art. 97; comprobar en el BOE)

3. Precio y señal. Precio total del artículo: {precio_eur}, impuestos incluidos. Gastos de envío o de entrega: [A DECIDIR POR EL DUEÑO: si los hay, cuánto y cuándo se pagan]. La señal es el {porcentaje} del precio: {senal_eur}. Se te enseña antes de pagar y se paga con tarjeta en la página segura de Stripe. (LGDCU, art. 97: precio total, gastos de envío y forma de pago; comprobar en el BOE)

4. Tipo de arras (dejar SOLO una variante).

VARIANTE A · Arras penitenciales. La señal se entrega como arras penitenciales del artículo 1454 del Código Civil: cada parte puede echarse atrás. Si tú decides no comprar, pierdes la señal ({senal_eur}). Si es la tienda la que se echa atrás o no te entrega el artículo, te devuelve el doble de la señal. (Código Civil, art. 1454; reciprocidad: LGDCU, art. 87.2; comprobar en el BOE)

VARIANTE B · Arras confirmatorias. La señal ({senal_eur}) es parte del precio y prueba de la compra: se descuenta del precio total y no sirve para echarse atrás perdiéndola. Si una de las partes no cumple, la otra puede exigir que se cumpla la compra o resolverla con indemnización de daños y perjuicios. Si es la tienda la que no te entrega el artículo, te devuelve toda la señal más los daños y perjuicios que procedan. [A DECIDIR POR EL DUEÑO: si el cliente no completa la compra, qué hace la tienda: exigir el pago, resolver y devolver la señal, o resolver y reclamar daños; revisarlo con el gestor.] (Código Civil, art. 1124; reciprocidad: LGDCU, art. 87.2; comprobar en el BOE)

5. Resto del precio. Lo que falta ({precio_eur} menos {senal_eur}) se paga [A DECIDIR POR EL DUEÑO: cómo (tarjeta en la tienda online, Bizum, al recoger…) y cuándo (antes del {fecha_vencimiento}, antes del envío o en la entrega)]. Plazo de entrega una vez pagado todo: [A DECIDIR POR EL DUEÑO]. (LGDCU, art. 97: forma de pago y plazo de entrega; comprobar en el BOE)

6. Al vencer. Si el {fecha_vencimiento} la compra no se ha completado: [A DECIDIR POR EL DUEÑO: qué pasa (la reserva se cancela y el artículo vuelve a la venta; si la señal se pierde o se devuelve según el tipo de arras; si se puede alargar la reserva)]. Lo mismo se enseña en «Qué pasa al vencer» antes de pagar. (Código Civil, arts. 1454 y 1124; comprobar en el BOE)

7. Devolución de dinero. Cuando proceda devolverte la señal (o el doble, con arras penitenciales), se devuelve por el mismo medio de pago en un plazo de [A DECIDIR POR EL DUEÑO: plazo; revisarlo con el gestor], sin gastos para ti. (LGDCU, arts. 87.2 y 107; comprobar en el BOE)

8. Derecho de desistimiento. Como es una compra a distancia, tienes 14 días naturales desde que recibes el artículo para desistir sin dar explicaciones y sin penalización; la tienda te devuelve todo lo pagado, señal incluida, en 14 días naturales como máximo, salvo las excepciones de la ley. [PUNTO A REVISAR POR EL GESTOR: cómo encaja la pérdida de la señal (arras penitenciales, o la indemnización con confirmatorias) con este desistimiento legal, que no admite penalización; desde cuándo cuenta si el cliente se echa atrás antes de recibir el artículo; y si aplica alguna excepción del art. 103.] (LGDCU, arts. 102 a 108; comprobar en el BOE)

9. Tus derechos. Nada de estas condiciones limita los derechos que te da la ley como consumidor; una cláusula abusiva se tendría por no puesta. (LGDCU, arts. 82 a 91; comprobar en el BOE)

10. Datos. Guardamos la reserva (artículo, importe, plazo y estas condiciones) unida a tu cuenta para gestionarla.

Este texto es un borrador: no se enseña a ningún cliente mientras las reservas estén desactivadas.`;

// --- Texto que ve el cliente (dueño, 2026-11-15: «que no ponga nada extraño») --------------------------------------------
// Las cinco marcas se rellenan solas con los datos de CADA reserva (en la hoja de la ficha, en Mis reservas y en la copia
// que guarda el servidor). Cualquier nota interna del borrador impide activar y enseñar: lo comprueban esta función (en
// Administración), api/pago.ts (misma lógica) y el disparador reserva_ajustes_validar (migración
// 20261115190000_reserva_texto_cliente).
export const MARCAS_RESERVA = ["porcentaje", "dias", "fecha_vencimiento", "senal_eur", "precio_eur"] as const;
export type DatosCondicionesReserva = { porcentaje: number; dias: number; vence: string | number; senal_eur: number; precio_eur: number };

/** El texto con las marcas ya rellenadas: «20 %», «14 días», «30 de noviembre de 2026», «90,00 €». */
export function rellenarCondicionesReserva(texto: string, d: DatosCondicionesReserva): string {
  const pct = Number(d.porcentaje);
  const dias = Number(d.dias);
  const pctTxt = `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(".", ",")} %`;
  // Si el texto ya trae la unidad detrás («{precio_eur} €»), no se repite.
  return texto
    .replace(/\{porcentaje\}(?:[  ]?%)?/g, () => pctTxt)
    .replace(/\{dias\}(?:[  ]d[ií]as?\b)?/g, () => `${dias} ${dias === 1 ? "día" : "días"}`)
    .replace(/\{fecha_vencimiento\}/g, () => fechaReserva(d.vence))
    .replace(/\{senal_eur\}(?:[  ]?€)?/g, () => eurosReserva(Number(d.senal_eur)))
    .replace(/\{precio_eur\}(?:[  ]?€)?/g, () => eurosReserva(Number(d.precio_eur)));
}

const NOTAS_INTERNAS_RESERVA: { re: RegExp; que: string }[] = [
  { re: /\[A DECIDIR/i, que: "los huecos «[A DECIDIR…]»" },
  { re: /NOTA PARA EL GESTOR/i, que: "la «NOTA PARA EL GESTOR»" },
  { re: /PUNTO A REVISAR/i, que: "el «PUNTO A REVISAR»" },
  { re: /comprobar en el BOE/i, que: "las notas «comprobar en el BOE»" },
  { re: /BORRADOR/i, que: "la palabra «BORRADOR»" },
];

/** Las notas internas que tiene un texto (vacío = se puede enseñar al cliente). */
export function notasInternasReserva(texto: string | null | undefined): string[] {
  const t = texto ?? "";
  const f = NOTAS_INTERNAS_RESERVA.filter((n) => n.re.test(t)).map((n) => n.que);
  if (/\bVARIANTE\s+A\b/i.test(t) && /\bVARIANTE\s+B\b/i.test(t)) f.push("una de las dos variantes (dejar solo la VARIANTE A o la B)");
  const raras = [...new Set([...t.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]).filter((m) => !(MARCAS_RESERVA as readonly string[]).includes(m)))];
  for (const m of raras) f.push(`la marca «{${m}}» (solo se rellenan solas {porcentaje}, {dias}, {fecha_vencimiento}, {senal_eur} y {precio_eur})`);
  return f;
}

/** Lo que hay que quitar del texto de las condiciones y de «Qué pasa al vencer» antes de activar (lista para el dueño). */
export function problemasTextoClienteReserva(condiciones: string | null | undefined, alVencer: string | null | undefined): string[] {
  const salida: string[] = [];
  const c = notasInternasReserva(condiciones);
  const v = notasInternasReserva(alVencer);
  if (c.length) salida.push(`quitar del texto de las condiciones ${c.join(", ")}`);
  if (v.length) salida.push(`quitar de «Qué pasa al vencer» ${v.join(", ")}`);
  return salida;
}

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
  return (
    !!a &&
    a.activa === true &&
    Array.isArray(a.escala) &&
    a.escala.length > 0 &&
    Number.isInteger(a.dias_max) &&
    !!a.tipo_arras &&
    !!a.al_vencer &&
    !!a.texto_condiciones &&
    // Con una nota interna, nada (el servidor y la base de datos ya lo impiden; esto es la última red).
    problemasTextoClienteReserva(a.texto_condiciones, a.al_vencer).length === 0
  );
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
