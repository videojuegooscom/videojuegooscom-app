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
 *
 * Sin la migración aplicada (la tabla no existe) o si falla la lectura, cargarTarifas devuelve null y el envío es gratis,
 * como antes.
 *
 * Conectado con: app/(tabs)/cesta.tsx, app/checkout.tsx, app/admin/envios.tsx y app/admin/pedidos.tsx.
 */
import { supabase } from "./supabase";

export type ZonaEnvio = {
  zona: string;
  nombre: string;
  codigos: string | null;
  precio_eur: number;
  gratis_desde_eur: number | null;
  activa: boolean;
  orden: number;
};

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

/** El envío de una compra con las tarifas de la tienda. Sin tarifas (null), gratis como antes. */
export function calcularEnvio(
  zonas: ZonaEnvio[] | null,
  { entrega, codigoPostal, productos }: { entrega: Entrega; codigoPostal?: string | null; productos: number }
): EnvioCalculado {
  if (!zonas) return { precio: 0, zona: null, gratisPorImporte: false, disponible: true };
  const zona = zonaDeEntrega(zonas, entrega, codigoPostal);
  if (!zona) return { precio: 0, zona: null, gratisPorImporte: false, disponible: true };
  const gratisPorImporte = zona.gratis_desde_eur !== null && productos >= zona.gratis_desde_eur;
  return { precio: gratisPorImporte ? 0 : zona.precio_eur, zona, gratisPorImporte, disponible: zona.activa };
}

/** ¿Hay algún envío que cueste algo? (si todas las zonas están a 0, la cesta dice «Gratis» sin pedir el código postal) */
export function hayEnviosDePago(zonas: ZonaEnvio[] | null): boolean {
  return !!zonas && zonas.some((z) => z.activa && z.precio_eur > 0);
}

/** El menor importe a partir del cual alguna zona de envío a domicilio sale gratis (para el aviso de la cesta). */
export function gratisDesdeMinimo(zonas: ZonaEnvio[] | null): number | null {
  if (!zonas) return null;
  const importes = zonas
    .filter((z) => z.zona !== "mano" && z.activa && z.precio_eur > 0 && z.gratis_desde_eur !== null)
    .map((z) => z.gratis_desde_eur as number);
  return importes.length ? Math.min(...importes) : null;
}
