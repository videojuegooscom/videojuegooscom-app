// lib/envio.ts
/**
 * Qué hace: tarifas de envío (dueño, 2026-11-04). Lee las zonas de la tabla tarifas_envio (las edita el dueño en
 * Administración → Tarifas de envío) y calcula el envío de una compra: la Cesta y «Finalizar compra» lo enseñan antes de
 * pedir. Al guardar el pedido, la base de datos lo calcula con LA MISMA regla (zona_envio / calcular_envio y el
 * disparador de pedidos, supabase/migrations/20261104210000_tarifas_envio.sql): lo que vale es lo de la base de datos.
 *
 * La regla: entrega en mano → zona «mano». A domicilio, por el código postal (5 cifras): primero un código exacto o un
 * rango («50001-50022»), después el prefijo más largo («07» = toda la provincia) y, si no hay ninguno, la zona «*». A
 * igualdad, la zona de menor orden. Sin código postal de 5 cifras aún no hay zona (la base de datos no cobra envío
 * automático; las ventas de VeoAura tampoco lo llevan). Si el importe de los artículos llega a «gratis desde», el envío es 0.
 * Envío por kilos (dueño, 2026-11-07: «Correos va por kg»): si la zona tiene tramos, el precio es el del primer tramo que
 * llega al peso de la compra (suma de products.peso_kg, con embalaje; un artículo sin peso cuenta PESO_SIN_DATO_KG).
 *
 * Sin la migración aplicada (la tabla no existe) o si falla la lectura, cargarTarifas devuelve null y el envío es gratis,
 * como antes.
 *
 * Reparación por envío (2026-11-11): cargarAjustesReparacionEnvio y calcularEtiquetaReparacion (la etiqueta de Correos
 * con la misma regla que el disparador trg_service_requests_envio, migración 20261111100000). Parte 2 (migración
 * 20261111130000): el peso por aparato es el del servicio (pesoAparatoReparacion, cargarPesoEnvioServicio), los datos de
 * Bizum/transferencia (datosPagoManual) y la garantía en meses.
 *
 * Conectado con: app/(tabs)/cesta.tsx, app/checkout.tsx, app/admin/envios.tsx, app/admin/pedidos.tsx,
 * components/ContratarServicioModal.tsx, app/(tabs)/perfil.tsx y app/admin/services.tsx.
 */
import { supabase } from "./supabase";

/** Un tramo por kilos: hasta este peso (con embalaje), este precio. */
export type TramoEnvio = { hasta_kg: number; precio_eur: number };

export type ZonaEnvio = {
  zona: string;
  nombre: string;
  codigos: string | null;
  precio_eur: number;
  gratis_desde_eur: number | null;
  activa: boolean;
  orden: number;
  /** Tramos por kilos (Correos, migración 20261107120000), de menor a mayor. null = precio fijo (precio_eur). */
  tramos: TramoEnvio[] | null;
};

/** Lo que cuenta un artículo sin peso (el mismo valor que pedido_items_peso y calcular_envio en la base de datos). */
export const PESO_SIN_DATO_KG = 2;

function deTramos(v: unknown): TramoEnvio[] | null {
  if (!Array.isArray(v)) return null;
  const t = v
    .map((x) => ({ hasta_kg: numero((x as Record<string, unknown>)?.hasta_kg), precio_eur: numero((x as Record<string, unknown>)?.precio_eur) }))
    .filter((x) => x.hasta_kg > 0)
    .sort((a, b) => a.hasta_kg - b.hasta_kg);
  return t.length ? t : null;
}

/** El precio de un peso en una zona con tramos: el primer tramo que llega; por encima del último, el del último. */
export function precioPorPeso(tramos: TramoEnvio[], pesoKg: number | null | undefined): number {
  const peso = pesoKg ?? PESO_SIN_DATO_KG;
  const tramo = tramos.find((t) => t.hasta_kg >= peso) ?? tramos[tramos.length - 1];
  return tramo.precio_eur;
}

/** «6,5 kg», «0,2 kg», «12 kg». */
export function fmtKg(kg: number): string {
  return `${(Math.round(kg * 100) / 100).toLocaleString("es-ES", { maximumFractionDigits: 2 })} kg`;
}

/** El peso de una compra: la suma de sus artículos (sin peso, PESO_SIN_DATO_KG cada uno). */
export function pesoDeCompra(pesos: (number | null | undefined)[]): number {
  return Math.round(pesos.reduce<number>((a, p) => a + (p && p > 0 ? p : PESO_SIN_DATO_KG), 0) * 1000) / 1000;
}

/** Los pesos de unos artículos (products.peso_kg). Sin la columna o si falla, todos sin peso. */
export async function cargarPesos(ids: string[]): Promise<Record<string, number | null>> {
  return (await cargarDatosEnvio(ids)).pesos;
}

/**
 * Lo que el envío necesita de cada artículo: su peso y si es «solo entrega en mano» (products.solo_entrega_mano: los
 * televisores sin su caja original no se envían; dueño, 2026-11-07). Sin esas columnas o si falla, sin peso y enviable.
 */
export async function cargarDatosEnvio(ids: string[]): Promise<{ pesos: Record<string, number | null>; soloMano: string[] }> {
  const pesos: Record<string, number | null> = {};
  const soloMano: string[] = [];
  for (const id of ids) pesos[id] = null;
  if (!ids.length) return { pesos, soloMano };
  try {
    const consultar = (columnas: string) => supabase.from("products").select(columnas).in("id", ids);
    let res: { data: unknown; error: unknown } = await consultar("id,peso_kg,solo_entrega_mano");
    if (res.error) res = await consultar("id,peso_kg");
    if (res.error || !Array.isArray(res.data)) return { pesos, soloMano };
    for (const r of res.data as { id: string; peso_kg: unknown; solo_entrega_mano?: unknown }[]) {
      pesos[r.id] = r.peso_kg === null || r.peso_kg === undefined ? null : numero(r.peso_kg);
      if (r.solo_entrega_mano === true) soloMano.push(r.id);
    }
  } catch {
    // sin red: sin peso
  }
  return { pesos, soloMano };
}

export type Entrega = "envio" | "recogida";

export type EnvioCalculado = {
  /** Lo que se cobra de envío (0 = gratis). */
  precio: number;
  /** La zona que le toca (null si aún no se sabe: sin código postal de 5 cifras y sin zona «*»). */
  zona: ZonaEnvio | null;
  /** Gratis porque los artículos llegan al importe de «gratis desde». */
  gratisPorImporte: boolean;
  /** false si la tienda no envía a esa zona desde la web. */
  disponible: boolean;
};

const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function deFila(r: Record<string, unknown>): ZonaEnvio {
  return {
    zona: String(r.zona ?? ""),
    nombre: String(r.nombre ?? ""),
    codigos: typeof r.codigos === "string" ? r.codigos : null,
    precio_eur: numero(r.precio_eur),
    gratis_desde_eur: r.gratis_desde_eur === null || r.gratis_desde_eur === undefined ? null : numero(r.gratis_desde_eur),
    activa: r.activa !== false,
    orden: numero(r.orden),
    tramos: deTramos(r.tramos),
  };
}

/** Las zonas, en su orden. null si la tabla aún no existe (migración sin aplicar) o falla la lectura. */
export async function cargarTarifas(): Promise<ZonaEnvio[] | null> {
  try {
    const { data, error } = await supabase.from("tarifas_envio").select("*").order("orden", { ascending: true });
    if (error || !Array.isArray(data) || data.length === 0) return null;
    return (data as Record<string, unknown>[]).map(deFila);
  } catch {
    return null;
  }
}

/** Solo las cifras del código postal. */
export function limpiarCodigoPostal(cp: string | null | undefined): string {
  return String(cp ?? "").replace(/[^0-9]/g, "");
}

/** La zona que le toca a una entrega (misma regla que zona_envio en la base de datos). */
export function zonaDeEntrega(zonas: ZonaEnvio[], entrega: Entrega, codigoPostal: string | null | undefined): ZonaEnvio | null {
  if (entrega === "recogida") return zonas.find((z) => z.zona === "mano") ?? null;
  const cp = limpiarCodigoPostal(codigoPostal);
  // A domicilio sin un código postal de 5 cifras: aún no hay zona.
  if (cp.length !== 5) return null;
  let mejor: ZonaEnvio | null = null;
  let puntos = -1;
  let defecto: ZonaEnvio | null = null;
  const ordenadas = zonas
    .filter((z) => z.zona !== "mano")
    .slice()
    .sort((a, b) => a.orden - b.orden || (a.zona < b.zona ? -1 : a.zona > b.zona ? 1 : 0));
  for (const z of ordenadas) {
    for (const bruto of (z.codigos ?? "").split(",")) {
      const t = bruto.trim();
      let p = -1;
      if (t === "*") {
        if (!defecto) defecto = z;
      } else if (/^[0-9]{5}-[0-9]{5}$/.test(t)) {
        const [desde, hasta] = t.split("-");
        if (cp >= desde && cp <= hasta) p = 5;
      } else if (/^[0-9]{1,5}$/.test(t) && cp.startsWith(t)) {
        p = t.length;
      }
      if (p > puntos || (p === puntos && p >= 0 && mejor && z.orden < mejor.orden)) {
        puntos = p;
        mejor = z;
      }
    }
  }
  if (puntos >= 0) return mejor;
  return defecto;
}

/**
 * El envío de una compra con las tarifas de la tienda. Sin tarifas (null), gratis como antes. Con tramos por kilos, el
 * del peso de la compra (pesoKg; sin peso, PESO_SIN_DATO_KG), como calcular_envio en la base de datos.
 */
export function calcularEnvio(
  zonas: ZonaEnvio[] | null,
  { entrega, codigoPostal, productos, pesoKg }: { entrega: Entrega; codigoPostal?: string | null; productos: number; pesoKg?: number | null }
): EnvioCalculado {
  if (!zonas) return { precio: 0, zona: null, gratisPorImporte: false, disponible: true };
  const zona = zonaDeEntrega(zonas, entrega, codigoPostal);
  if (!zona) return { precio: 0, zona: null, gratisPorImporte: false, disponible: true };
  const gratisPorImporte = zona.gratis_desde_eur !== null && productos >= zona.gratis_desde_eur;
  const tarifa = zona.tramos ? precioPorPeso(zona.tramos, pesoKg) : zona.precio_eur;
  return { precio: gratisPorImporte ? 0 : tarifa, zona, gratisPorImporte, disponible: zona.activa };
}

/** ¿Hay algún envío que cueste algo? (si todas las zonas están a 0, la cesta dice «Gratis» sin pedir el código postal) */
export function hayEnviosDePago(zonas: ZonaEnvio[] | null): boolean {
  return !!zonas && zonas.some((z) => z.activa && (z.precio_eur > 0 || !!z.tramos?.some((t) => t.precio_eur > 0)));
}

// --- Reparación por envío (dueño, 2026-11-11; migración 20261111100000_reparacion_envio.sql) ---------------------------
// El cliente del resto de España nos manda su aparato por Correos con una etiqueta. Su precio lo pone la base de datos al
// crear la solicitud (disparador trg_service_requests_envio) con LA MISMA regla que aquí: peso = aparatos × peso por
// aparato (reparacion_envio_ajustes.peso_aparato_kg, con embalaje) y precio = el tramo de Correos de su zona por código
// postal (calcularEnvio, como calcular_envio). Si la zona no tiene tramos de Correos, no se ofrece.

export type AjustesReparacionEnvio = {
  activo: boolean;
  direccion_taller: string | null;
  peso_aparato_kg: number;
  /** true mientras el peso por aparato sea el estimado inicial (el dueño aún no ha puesto el real). */
  peso_estimado: boolean;
  dias_custodia: number | null;
  bizum: string | null;
  iban: string | null;
  titular: string | null;
  plazo_horas: number;
  /** Meses de garantía de la reparación (parte 2, migración 20261111130000; 12 si aún no existe la columna). */
  garantia_meses: number;
  /** true si la parte 2 ya está aplicada (la fila trae garantia_meses): cobros, «sin arreglo» y garantía. */
  parte2: boolean;
};

/**
 * El peso de UN aparato para la etiqueta (parte 2, dueño 2026-11-11: «un mando no pesa como una consola»): el del servicio
 * (services.envio_peso_kg, con su caja) si lo tiene y, si no, el peso por defecto de los ajustes. La misma regla que el
 * disparador reparacion_envio_al_crear de la base de datos.
 */
export function pesoAparatoReparacion(pesoServicioKg: number | null | undefined, ajustes: Pick<AjustesReparacionEnvio, "peso_aparato_kg"> | null): number {
  if (pesoServicioKg && pesoServicioKg > 0) return pesoServicioKg;
  return ajustes?.peso_aparato_kg ?? PESO_SIN_DATO_KG;
}

/** El peso para el envío de un servicio (services.envio_peso_kg). null sin la columna, sin dato o si falla. */
export async function cargarPesoEnvioServicio(serviceId: string): Promise<number | null> {
  try {
    // select("*"): trae la columna si existe, sin un 400 en la consola antes de la migración.
    const { data, error } = await supabase.from("services").select("*").eq("id", serviceId).maybeSingle();
    if (error || !data) return null;
    const n = numero((data as { envio_peso_kg?: unknown }).envio_peso_kg);
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Datos para pagar por Bizum o transferencia: solo los que el dueño ha rellenado (si no hay ninguno, null). */
export function datosPagoManual(a: AjustesReparacionEnvio | null): { bizum: string | null; iban: string | null; titular: string | null } | null {
  if (!a || (!a.bizum && !a.iban)) return null;
  return { bizum: a.bizum, iban: a.iban, titular: a.titular };
}

/** Los ajustes (fila única). null sin sesión, sin la migración o si falla la lectura (entonces todo sigue como siempre). */
export async function cargarAjustesReparacionEnvio(): Promise<AjustesReparacionEnvio | null> {
  try {
    const { data, error } = await supabase.from("reparacion_envio_ajustes").select("*").eq("id", 1).maybeSingle();
    if (error || !data) return null;
    const r = data as Record<string, unknown>;
    const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    return {
      activo: r.activo === true,
      direccion_taller: texto(r.direccion_taller),
      peso_aparato_kg: numero(r.peso_aparato_kg) || PESO_SIN_DATO_KG,
      peso_estimado: r.peso_estimado !== false,
      dias_custodia: r.dias_custodia == null ? null : numero(r.dias_custodia) || null,
      bizum: texto(r.bizum),
      iban: texto(r.iban),
      titular: texto(r.titular),
      plazo_horas: numero(r.plazo_horas) || 72,
      garantia_meses: r.garantia_meses == null ? 12 : numero(r.garantia_meses) || 12,
      parte2: "garantia_meses" in r,
    };
  } catch {
    return null;
  }
}

export type EtiquetaReparacion =
  | { estado: "sin_cp" }
  /** Zaragoza y Cuarte: allí se recoge (no hay tarifa de Correos). */
  | { estado: "local" }
  /** Zona sin tramos de Correos o desactivada (islas, Ceuta y Melilla hoy): se pide escribir. */
  | { estado: "sin_tarifa"; zona: ZonaEnvio | null }
  | { estado: "ok"; precio: number; pesoKg: number; zona: ZonaEnvio };

/** La etiqueta de Correos de una reparación por envío (la misma cuenta que el disparador de la base de datos). */
export function calcularEtiquetaReparacion(
  zonas: ZonaEnvio[] | null,
  codigoPostal: string | null | undefined,
  aparatos: number,
  pesoAparatoKg: number
): EtiquetaReparacion {
  const cp = limpiarCodigoPostal(codigoPostal);
  if (cp.length !== 5) return { estado: "sin_cp" };
  if (!zonas) return { estado: "sin_tarifa", zona: null };
  const zona = zonaDeEntrega(zonas, "envio", cp);
  if (zona?.zona === "local") return { estado: "local" };
  if (!zona || !zona.activa || !zona.tramos) return { estado: "sin_tarifa", zona };
  const pesoKg = Math.round(Math.max(1, Math.min(10, Math.round(aparatos))) * pesoAparatoKg * 1000) / 1000;
  return { estado: "ok", precio: calcularEnvio(zonas, { entrega: "envio", codigoPostal: cp, productos: 0, pesoKg }).precio, pesoKg, zona };
}

/** ¿Alguna zona tiene tramos de Correos activos? (sin ninguna, la reparación por envío no se puede ofrecer) */
export function hayTarifaCorreos(zonas: ZonaEnvio[] | null): boolean {
  return !!zonas && zonas.some((z) => z.activa && z.zona !== "mano" && z.zona !== "local" && !!z.tramos);
}

/** El menor importe a partir del cual alguna zona de envío a domicilio sale gratis (para el aviso de la cesta). */
export function gratisDesdeMinimo(zonas: ZonaEnvio[] | null): number | null {
  if (!zonas) return null;
  const importes = zonas
    .filter((z) => z.zona !== "mano" && z.activa && (z.precio_eur > 0 || !!z.tramos) && z.gratis_desde_eur !== null)
    .map((z) => z.gratis_desde_eur as number);
  return importes.length ? Math.min(...importes) : null;
}
