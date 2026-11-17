/**
 * Archivo: lib/alquiler.ts
 * Función: utilidad con las cuentas y los textos del alquiler de artículos (funciones puras, sin red; apagado para clientes).
 * Para qué sirve: calcula precios por plan, compra tras alquiler, recargo por retraso, fianza, estado de cada unidad y rellena el borrador del contrato de alquiler.
 * Conectado con: lib/reservas.ts (eurosReserva, fechaReserva), migraciones de alquiler (20261117100000 y 20261117120000), docs/puente-veoaura-alquiler.md.
 * Utilizado por: app/admin/alquileres.tsx y app/admin/analytics.tsx.
 * Dependencias: ninguna externa.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: las cuentas y los textos del ALQUILER de artículos (dueño, 2026-11-17; FASE 1, APAGADO: ningún cliente ve
 * nada). Solo Zaragoza. Planes de 1, 2, 3 y 4 meses con el IVA incluido, fianza sin IVA, recargo por retraso y
 * «Alquílalo y, si te gusta, cómpralo».
 *
 * Cómo funciona (funciones puras, sin red):
 * - precioPlanAlquiler: el porcentaje del precio de venta de cada plan con el redondeo de la tienda (redondearPrecioAlquiler:
 *   por debajo de 90 €, al «,90» más cercano; desde 90 €, al entero acabado en 9 más cercano). Con los porcentajes de la
 *   migración (10, 18, 25 y 33 %) una PS5 de 550 € da 54,90 €, 99 €, 139 € y 179 €. Un precio a mano manda sobre el cálculo.
 *   La base de datos hace la misma cuenta (public.alquiler_redondear): lo que se cobra lo pone ella, no el navegador.
 * - compraTrasAlquiler: precio de venta − lo pagado en alquiler + el «plus» (50 €). Si saliera menos que el coste conocido
 *   de la unidad (o 0), no se ofrece.
 * - recargoRetraso: 3 € por día tras el día de cortesía, como mucho el importe de la fianza.
 * - BORRADOR_CONTRATO_ALQUILER: el contrato para que lo revise el gestor del dueño, con sus marcas {…} que se rellenan solas
 *   (rellenarContratoAlquiler) y las notas internas que impiden activar el alquiler (notasInternasAlquiler; la misma regla
 *   que el disparador alquiler_ajustes_validar).
 *
 * - Fase 2 (el día a día en Administración): sumarMeses (fin previsto y renovaciones), mesesContratados, mesesAlRecoger (lo
 *   que suma la unidad al recogerla, descontando lo que sumó la anterior si hubo cambio de unidad), estadoUnidad (Libre,
 *   Reservada, Alquilada, Por recoger, En revisión o «Toca venderla» al llegar al máximo de meses), recargoDeAlquiler,
 *   validarDescuentoFianza (motivo obligatorio y nunca más que lo que queda de la fianza) y fianzaADevolver.
 *
 * Conectado con: app/admin/alquileres.tsx, app/admin/analytics.tsx, supabase/migrations/20261117100000_alquiler_base.sql y
 * 20261117120000_alquiler_fase2.sql, docs/puente-veoaura-alquiler.md y pruebas/perfil-datos.mjs (secciones ALQ1 y ALQ2). Copia el patrón de lib/reservas.ts (BORRADOR_CONDICIONES_RESERVA).
 */
import { eurosReserva, fechaReserva } from "./reservas";

export type PlanAlquiler = 1 | 2 | 3 | 4;
export const PLANES_ALQUILER: readonly PlanAlquiler[] = [1, 2, 3, 4] as const;
export type ModoFianza = "entrega" | "tarjeta";
export type EstadoAlquiler = "reservado" | "pendiente_pago" | "activo" | "por_recoger" | "revision" | "cerrado" | "cancelado";
export type EstadoFianza = "pendiente" | "cobrada" | "devuelta" | "descontada";

export type PorcentajesAlquiler = Record<PlanAlquiler, number>;
export type PreciosManuales = Partial<Record<PlanAlquiler, number>>;

export type AjustesAlquiler = {
  activo: boolean;
  porcentajes: PorcentajesAlquiler;
  fianza_eur: number;
  fianza_modo: ModoFianza;
  recargo_dia_eur: number;
  cortesia_dias: number;
  plus_compra_eur: number;
  meses_max_unidad: number;
  texto_contrato: string | null;
  contrato_revisado: boolean;
};

// Los valores que deja la migración (decisión del dueño, 2026-11-17).
export const PORCENTAJES_ALQUILER_INICIALES: PorcentajesAlquiler = { 1: 10, 2: 18, 3: 25, 4: 33 };
export const AJUSTES_ALQUILER_INICIALES: AjustesAlquiler = {
  activo: false,
  porcentajes: PORCENTAJES_ALQUILER_INICIALES,
  fianza_eur: 150,
  fianza_modo: "entrega",
  recargo_dia_eur: 3,
  cortesia_dias: 1,
  plus_compra_eur: 50,
  meses_max_unidad: 3,
  texto_contrato: null,
  contrato_revisado: false,
};
export const PRECIO_EJEMPLO_ALQUILER = 550;

export const ESTADOS_ALQUILER: Record<EstadoAlquiler, string> = {
  reservado: "Reservado",
  pendiente_pago: "Pendiente de pago",
  activo: "En curso",
  por_recoger: "Por recoger",
  revision: "En revisión",
  cerrado: "Cerrado",
  cancelado: "Cancelado",
};

export const MODOS_FIANZA: Record<ModoFianza, { titulo: string; texto: string }> = {
  entrega: { titulo: "En efectivo o Bizum en la entrega", texto: "Se paga al recibir el artículo, sin comisiones." },
  tarjeta: { titulo: "Con tarjeta en la web", texto: "Se paga junto al alquiler en la página segura de pago." },
};

const cents = (n: number) => Math.round(n * 100);

/** El redondeo de la tienda: por debajo de 90 €, al «,90» más cercano; desde 90 €, al entero acabado en 9 más cercano. */
export function redondearPrecioAlquiler(importe: number): number {
  if (!Number.isFinite(importe) || importe <= 0) return 0;
  const x = cents(importe) / 100;
  if (x < 90) return cents(Math.max(0, Math.round(x - 0.9)) + 0.9) / 100;
  return Math.round((x + 1) / 10) * 10 - 1;
}

/** El precio de un plan: el precio a mano si lo hay; si no, el porcentaje del precio de venta, redondeado. */
export function precioPlanAlquiler(precioVenta: number, porcentaje: number, manual?: number | null): number {
  if (manual != null && Number.isFinite(manual) && manual > 0) return cents(manual) / 100;
  if (!Number.isFinite(precioVenta) || precioVenta <= 0 || !Number.isFinite(porcentaje) || porcentaje <= 0) return 0;
  return redondearPrecioAlquiler((precioVenta * porcentaje) / 100);
}

/** Los cuatro precios de un artículo (1, 2, 3 y 4 meses). */
export function preciosAlquiler(precioVenta: number, porcentajes: PorcentajesAlquiler, manuales: PreciosManuales = {}): Record<PlanAlquiler, number> {
  return {
    1: precioPlanAlquiler(precioVenta, porcentajes[1], manuales[1]),
    2: precioPlanAlquiler(precioVenta, porcentajes[2], manuales[2]),
    3: precioPlanAlquiler(precioVenta, porcentajes[3], manuales[3]),
    4: precioPlanAlquiler(precioVenta, porcentajes[4], manuales[4]),
  };
}

/** El precio de cada mes del plan (para enseñar «equivale a … al mes»). */
export function precioMensualAlquiler(precioPlan: number, meses: PlanAlquiler): number {
  return Math.round(cents(precioPlan) / meses) / 100;
}

export type CompraTrasAlquiler = { ofrecer: true; importe: number } | { ofrecer: false; motivo: "sin_precio" | "por_debajo_del_coste" };

/**
 * «Alquílalo y, si te gusta, cómpralo»: precio de venta − lo pagado en alquiler + el plus. Ejemplo: 550 − 139 + 50 = 461 €.
 * Nunca por debajo del coste conocido de la unidad: si saliera menos (o nada), no se ofrece.
 */
export function compraTrasAlquiler(precioVenta: number, pagadoAlquiler: number, plus: number, costeConocido?: number | null): CompraTrasAlquiler {
  if (!Number.isFinite(precioVenta) || precioVenta <= 0) return { ofrecer: false, motivo: "sin_precio" };
  const importe = (cents(precioVenta) - cents(Math.max(0, pagadoAlquiler || 0)) + cents(Math.max(0, plus || 0))) / 100;
  if (importe <= 0) return { ofrecer: false, motivo: "por_debajo_del_coste" };
  if (costeConocido != null && Number.isFinite(costeConocido) && importe < costeConocido) return { ofrecer: false, motivo: "por_debajo_del_coste" };
  return { ofrecer: true, importe };
}

/** Recargo por retraso: por cada día pasado el de cortesía, el importe por día; como mucho, la fianza. */
export function recargoRetraso(diasRetraso: number, porDia: number, cortesiaDias: number, fianza: number): number {
  const dias = Math.max(0, Math.floor(Number(diasRetraso) || 0) - Math.max(0, Math.floor(Number(cortesiaDias) || 0)));
  const total = dias * cents(Math.max(0, porDia || 0));
  return Math.min(total, cents(Math.max(0, fianza || 0))) / 100;
}

/** Días de retraso (enteros, por días empezados) entre la fecha prevista de devolución y la de hoy. */
export function diasRetraso(finPrevisto: string | number | Date, ahora: number = Date.now()): number {
  const t = new Date(finPrevisto).getTime();
  if (!Number.isFinite(t) || ahora <= t) return 0;
  return Math.ceil((ahora - t) / 86_400_000);
}

// --- Contrato ------------------------------------------------------------------------------------------------------------
export const MARCA_BORRADOR_ALQUILER = "BORRADOR · Pendiente de revisión del gestor";
export const MARCAS_ALQUILER = [
  "articulo",
  "plan_meses",
  "precio_plan_eur",
  "precio_venta_eur",
  "fianza_eur",
  "modo_fianza",
  "recargo_dia_eur",
  "cortesia_dias",
  "plus_compra_eur",
  "fecha_inicio",
  "fecha_fin",
] as const;

// Borrador (2026-11-17) para el gestor del dueño. Las cifras van como marcas: se rellenan solas con los ajustes y los datos de
// cada alquiler. Las citas legales son de memoria («comprobar en el BOE»). Las notas internas impiden activar el alquiler.
export const BORRADOR_CONTRATO_ALQUILER = `${MARCA_BORRADOR_ALQUILER}

Contrato de alquiler de artículos

NOTA PARA EL GESTOR (borrar antes de activar): hay que confirmar o completar cada [A DECIDIR POR EL DUEÑO] y cada [A DECIDIR POR EL GESTOR]. Las marcas entre llaves ({articulo}, {plan_meses}, {precio_plan_eur}, {precio_venta_eur}, {fianza_eur}, {modo_fianza}, {recargo_dia_eur}, {cortesia_dias}, {plus_compra_eur}, {fecha_inicio}, {fecha_fin}) se rellenan solas con los ajustes de la tienda y los datos de cada alquiler: no hay que tocarlas. Esta nota, los huecos, los «comprobar en el BOE», los «PUNTO A REVISAR» y la palabra BORRADOR hay que quitarlos: mientras estén, la tienda no deja activar el alquiler. PUNTOS A REVISAR: el IVA del alquiler (21 %) y que la fianza no lleve IVA mientras sea una garantía; el tratamiento fiscal del recargo por retraso y de los descuentos de la fianza por daños; el epígrafe del IAE de la actividad de alquiler; el desistimiento de 14 días con inicio anticipado.

1. Partes. De una parte, Daniel Gutiérrez, con NIF/CIF Y4751659B y domicilio en C. Miguel Servet, 3, 50410 Cuarte de Huerva (Zaragoza), que actúa con el nombre comercial VideojuegosZaragoza (en adelante, «la tienda»). De otra, la persona titular de la cuenta que solicita el alquiler (en adelante, «tú» o «el cliente»), mayor de edad y con domicilio de entrega en la ciudad de Zaragoza. (LGDCU, art. 97: información previa en contratos a distancia; comprobar en el BOE)

2. Objeto. La tienda te cede el uso temporal del artículo {articulo}, revisado y en buen estado de funcionamiento, a cambio del precio indicado en el apartado 4. El artículo sigue siendo propiedad de la tienda durante todo el alquiler, salvo que lo compres según el apartado 11. (Código Civil, arts. 1543 y siguientes, arrendamiento de cosas; comprobar en el BOE)

3. Plazo y renovación. El alquiler dura {plan_meses}, desde el {fecha_inicio} hasta el {fecha_fin}. Antes de que termine puedes solicitar renovarlo por otro plan disponible, con el precio vigente en ese momento; la renovación no es automática y nunca se cobra sin tu confirmación. [A DECIDIR POR EL DUEÑO: con cuántos días de antelación se pide la renovación y si una renovación cuenta para el tope de meses de cada unidad.]

4. Precio. El precio del plan es {precio_plan_eur}, IVA incluido, y se paga [A DECIDIR POR EL DUEÑO: de una vez al empezar o por meses]. El precio incluye la entrega y la recogida en la ciudad de Zaragoza. (LGDCU, art. 97: precio total con impuestos; comprobar en el BOE)

5. Fianza. Al recibir el artículo entregas una fianza de {fianza_eur}, que no lleva IVA porque es una garantía y no un pago por el alquiler. Forma de pago de la fianza: {modo_fianza}. La tienda te la devuelve íntegra después de recoger el artículo y comprobar que funciona y está completo, en un plazo de [A DECIDIR POR EL DUEÑO: número de días] y por el mismo medio con el que la pagaste, salvo los descuentos de los apartados 9 y 10, que se te explican por escrito con su motivo. [PUNTO A REVISAR POR EL GESTOR: IVA de la fianza y de los descuentos aplicados sobre ella.]

6. Estado en la entrega. El artículo se entrega limpio, revisado y con los accesorios que figuran en la ficha. En la entrega se comprueba contigo que funciona y que está completo; si notas cualquier fallo en las primeras [A DECIDIR POR EL DUEÑO: horas o días], avísanos por los canales de la tienda y lo revisamos o lo cambiamos sin coste.

7. Uso. Te comprometes a usar el artículo con cuidado y para su uso normal, a no abrirlo, repararlo ni modificarlo, a no cederlo ni realquilarlo a otras personas y a no sacarlo de España. Las averías por uso normal corren a cargo de la tienda: avísanos y lo revisamos o lo cambiamos. (Código Civil, arts. 1555 y 1563; comprobar en el BOE)

8. Cambio de unidad en el plan de 4 meses. Cada unidad se alquila un tiempo limitado para que siempre recibas un artículo en perfecto estado. Por eso, en el plan de 4 meses, durante el tercer mes la tienda te cambia el artículo por otra unidad revisada del mismo modelo, sin ningún coste para ti, en la fecha y hora que acordemos contigo. El plazo, el precio y la fianza no cambian.

9. Retraso en la devolución. El artículo se devuelve el {fecha_fin}. Para que el recargo sea justo y proporcionado, hay {cortesia_dias} de cortesía sin recargo; pasado ese plazo, el recargo es de {recargo_dia_eur} por cada día de retraso y en ningún caso supera el importe de la fianza. Si necesitas más tiempo, avísanos antes y te ofrecemos renovar el alquiler. [PUNTO A REVISAR POR EL GESTOR: si el recargo se trata como indemnización o como precio, y su IVA.] (LGDCU, arts. 85 y 87: proporcionalidad y reciprocidad; comprobar en el BOE)

10. Daños y pérdida. Si al recoger el artículo falta algún accesorio o tiene daños que no se deben a un uso normal, la tienda descuenta de la fianza el coste razonable de la reparación o de la pieza, con su motivo por escrito. En caso de pérdida, robo o daño que impida repararlo, el descuento puede ser la fianza completa [A DECIDIR POR EL GESTOR: si se puede reclamar más allá de la fianza y con qué límite, por ejemplo el valor del artículo según su precio de venta menos lo ya pagado]. En caso de robo, te pedimos la copia de la denuncia. (Código Civil, arts. 1561 a 1563; comprobar en el BOE)

11. Alquílalo y, si te gusta, cómpralo. Durante el alquiler puedes comprar el artículo. Todo lo que hayas pagado de alquiler se descuenta de su precio de venta ({precio_venta_eur}) y solo se añaden {plus_compra_eur}. Por ejemplo, si has pagado 139 € de alquiler de un artículo de 550 €, la compra te cuesta 550 − 139 + 50 = 461 €. Al comprarlo, la fianza se te devuelve o se descuenta del importe, como prefieras, y el artículo pasa a ser tuyo con la garantía de la tienda para los artículos revisados. La factura de la compra y la de cada pago de alquiler te las emite la tienda con su programa de gestión.

12. Desistimiento. Como el contrato se celebra a distancia, tienes 14 días naturales desde que lo aceptas para desistir sin dar explicaciones y sin penalización; la tienda te devuelve todo lo pagado en 14 días naturales como máximo por el mismo medio de pago. Si pides expresamente que el alquiler empiece antes de que acaben esos 14 días y después desistes, pagarás solo la parte proporcional del tiempo que hayas tenido el artículo y se te devuelve el resto, junto con la fianza. [PUNTO A REVISAR POR EL GESTOR: si el alquiler de bienes se trata como servicio a efectos del desistimiento, cómo se calcula el prorrateo y la forma de pedir el inicio anticipado.] (LGDCU, arts. 102 a 108; comprobar en el BOE)

13. Zona. El alquiler solo está disponible con entrega y recogida en la ciudad de Zaragoza [A DECIDIR POR EL DUEÑO: si incluye Cuarte de Huerva y otras localidades cercanas].

14. Protección de datos. Para gestionar el alquiler tratamos tus datos de contacto, la dirección de entrega y los datos del contrato, como se explica en la política de privacidad de la tienda. El responsable es Daniel Gutiérrez, con los datos del apartado 1. Puedes ejercer tus derechos de acceso, rectificación, supresión y los demás que te reconoce la ley escribiendo a los canales de la tienda. (RGPD y Ley Orgánica 3/2018; comprobar en el BOE)

15. Tus derechos y ley aplicable. Nada de este contrato limita los derechos que te da la ley como consumidor; una cláusula abusiva se tendría por no puesta. El contrato se rige por la ley española. Para cualquier conflicto son competentes los juzgados de tu domicilio. (LGDCU, arts. 82 a 91 y 90.2; comprobar en el BOE)

Este texto es un borrador: no se enseña a ningún cliente mientras el alquiler esté desactivado.`;

export type DatosContratoAlquiler = {
  articulo: string;
  plan_meses: number;
  precio_plan_eur: number;
  precio_venta_eur: number;
  fianza_eur: number;
  modo_fianza: ModoFianza;
  recargo_dia_eur: number;
  cortesia_dias: number;
  plus_compra_eur: number;
  inicio: string | number;
  fin: string | number;
};

/** El contrato con las marcas rellenadas: «3 meses», «139,00 €», «1 día», «15 de diciembre de 2026». */
export function rellenarContratoAlquiler(texto: string, d: DatosContratoAlquiler): string {
  const meses = Number(d.plan_meses);
  const cortesia = Number(d.cortesia_dias);
  const eur = (n: number) => eurosReserva(Number(n));
  return texto
    .replace(/\{articulo\}/g, () => d.articulo)
    .replace(/\{plan_meses\}(?:[  ]mes(?:es)?\b)?/g, () => `${meses} ${meses === 1 ? "mes" : "meses"}`)
    .replace(/\{precio_plan_eur\}(?:[  ]?€)?/g, () => eur(d.precio_plan_eur))
    .replace(/\{precio_venta_eur\}(?:[  ]?€)?/g, () => eur(d.precio_venta_eur))
    .replace(/\{fianza_eur\}(?:[  ]?€)?/g, () => eur(d.fianza_eur))
    .replace(/\{modo_fianza\}/g, () => {
      const t = MODOS_FIANZA[d.modo_fianza]?.titulo ?? "";
      return t.charAt(0).toLowerCase() + t.slice(1);
    })
    .replace(/\{recargo_dia_eur\}(?:[  ]?€)?/g, () => eur(d.recargo_dia_eur))
    .replace(/\{cortesia_dias\}(?:[  ]d[ií]as?\b)?/g, () => `${cortesia} ${cortesia === 1 ? "día" : "días"}`)
    .replace(/\{plus_compra_eur\}(?:[  ]?€)?/g, () => eur(d.plus_compra_eur))
    .replace(/\{fecha_inicio\}/g, () => fechaReserva(d.inicio))
    .replace(/\{fecha_fin\}/g, () => fechaReserva(d.fin));
}

const NOTAS_INTERNAS_ALQUILER: { re: RegExp; que: string }[] = [
  { re: /\[A DECIDIR/i, que: "los huecos «[A DECIDIR…]»" },
  { re: /NOTA PARA EL GESTOR/i, que: "la «NOTA PARA EL GESTOR»" },
  { re: /PUNTO A REVISAR/i, que: "el «PUNTO A REVISAR»" },
  { re: /comprobar en el BOE/i, que: "las notas «comprobar en el BOE»" },
  { re: /BORRADOR/i, que: "la palabra «BORRADOR»" },
];

/** Las notas internas que tiene el contrato (vacío = se puede enseñar al cliente). Misma regla que la base de datos. */
export function notasInternasAlquiler(texto: string | null | undefined): string[] {
  const t = texto ?? "";
  const f = NOTAS_INTERNAS_ALQUILER.filter((n) => n.re.test(t)).map((n) => n.que);
  if (/\bVARIANTE\s+A\b/i.test(t) && /\bVARIANTE\s+B\b/i.test(t)) f.push("una de las dos variantes (dejar solo la VARIANTE A o la B)");
  const raras = [...new Set([...t.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]).filter((m) => !(MARCAS_ALQUILER as readonly string[]).includes(m)))];
  for (const m of raras) f.push(`la marca «{${m}}» (no se rellena sola)`);
  return f;
}

/** Lo que falta para poder activar el alquiler (la misma lista que el disparador alquiler_ajustes_validar). */
export function faltaParaActivarAlquiler(texto: string | null | undefined, revisado: boolean): string[] {
  const t = (texto ?? "").trim();
  const f: string[] = [];
  if (!t) f.push("el texto del contrato");
  if (!revisado) f.push("marcar «Revisado por mi gestor»");
  if (/pendiente de revisión del gestor/i.test(t)) f.push("quitar la marca «BORRADOR · Pendiente de revisión del gestor» del texto");
  const n = notasInternasAlquiler(t);
  if (n.length) f.push(`quitar del texto del contrato ${n.join(", ")}`);
  return f;
}

/** Comprueba los porcentajes escritos (de 0,01 a 100, con dos decimales como mucho). */
export function validarPorcentajesAlquiler(p: Record<PlanAlquiler, number | null>): string | null {
  for (const m of PLANES_ALQUILER) {
    const v = p[m];
    if (v == null || !Number.isFinite(v) || v <= 0 || v > 100) return `El porcentaje de ${m} ${m === 1 ? "mes" : "meses"} tiene que estar entre 0,01 y 100.`;
    if (Math.round(v * 100) !== v * 100) return `El porcentaje de ${m} ${m === 1 ? "mes" : "meses"} admite como mucho dos decimales.`;
  }
  return null;
}

/** «1 mes», «3 meses». */
export const textoPlan = (m: number) => `${m} ${m === 1 ? "mes" : "meses"}`;

/** Un importe como en la tabla del dueño: «54,90 €», «99 €» (sin «,00» si es entero). */
export function eurosAlquiler(n: number): string {
  const c = cents(Number.isFinite(n) ? n : 0);
  // Con espacio de no separación delante de «€»: el importe nunca se parte en dos líneas.
  return c % 100 === 0 ? `${(c / 100).toLocaleString("es-ES")} €` : eurosReserva(c / 100).replace(/ €$/, " €");
}

// --- Fase 2: el día a día en Administración (unidades y alquileres) --------------------------------------------------------
const DIA_MS = 86_400_000;
const MES_MEDIO_DIAS = 30.4375;

/** La fecha de dentro de `meses` meses (el mismo día; si ese mes no lo tiene, el último: 31 ene + 1 = 28 o 29 feb). */
export function sumarMeses(fecha: string | number | Date, meses: number): string {
  const t = new Date(fecha).getTime();
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + Math.trunc(meses));
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d.toISOString();
}

/** Los meses contratados entre el inicio y el fin previsto (plan más renovaciones): 3 de 17 nov a 17 feb. */
export function mesesContratados(inicio: string | null | undefined, fin: string | null | undefined): number {
  const a = inicio ? Date.parse(inicio) : NaN;
  const b = fin ? Date.parse(fin) : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / DIA_MS / MES_MEDIO_DIAS);
}

/** Los meses que han pasado de verdad (con dos decimales), p. ej. hasta el cambio de unidad del mes 3. */
export function mesesTranscurridos(inicio: string | null | undefined, hasta: string | number | null | undefined): number {
  const a = inicio ? Date.parse(inicio) : NaN;
  const b = typeof hasta === "number" ? hasta : hasta ? Date.parse(hasta) : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round(((b - a) / DIA_MS / MES_MEDIO_DIAS) * 100) / 100;
}

/** Días que quedan hasta el fin previsto (por días empezados); 0 si ya ha pasado. */
export function diasRestantes(fin: string | null | undefined, ahora: number = Date.now()): number {
  const t = fin ? Date.parse(fin) : NaN;
  if (!Number.isFinite(t) || t <= ahora) return 0;
  return Math.ceil((t - ahora) / DIA_MS);
}

/**
 * Los meses que suma la unidad al recogerla: los contratados (plan y renovaciones) menos los que ya sumó la unidad
 * anterior si hubo cambio de unidad (los que pasaron hasta el cambio).
 */
export function mesesAlRecoger(a: { inicio_en: string | null; fin_previsto_en: string | null; cambio_unidad_en: string | null }): number {
  const total = mesesContratados(a.inicio_en, a.fin_previsto_en);
  const antes = a.cambio_unidad_en ? mesesTranscurridos(a.inicio_en, a.cambio_unidad_en) : 0;
  return Math.max(0, Math.round((total - antes) * 100) / 100);
}

export type EstadoUnidad = "libre" | "reservada" | "alquilada" | "por_recoger" | "revision" | "vender";
export const ESTADOS_UNIDAD: Record<EstadoUnidad, string> = {
  libre: "Libre",
  reservada: "Reservada",
  alquilada: "Alquilada",
  por_recoger: "Por recoger",
  revision: "En revisión",
  vender: "Toca venderla",
};

/** El estado de una unidad: lo que diga su alquiler en curso; sin él, «Toca venderla» al llegar al máximo de meses o «Libre». */
export function estadoUnidad(enCurso: { estado: string } | null | undefined, mesesAlquilada: number, mesesMax: number): EstadoUnidad {
  if (enCurso) {
    if (enCurso.estado === "activo") return "alquilada";
    if (enCurso.estado === "por_recoger") return "por_recoger";
    if (enCurso.estado === "revision") return "revision";
    if (enCurso.estado === "reservado" || enCurso.estado === "pendiente_pago") return "reservada";
  }
  return mesesMax > 0 && mesesAlquilada >= mesesMax ? "vender" : "libre";
}

/** El recargo de un alquiler: días de retraso hasta la devolución (o hasta hoy), con la cortesía y como mucho la fianza. */
export function recargoDeAlquiler(
  a: { fin_previsto_en: string | null; devuelto_en: string | null; fianza_eur: number },
  ajustes: { recargo_dia_eur: number; cortesia_dias: number },
  ahora: number = Date.now()
): { dias: number; importe: number } {
  if (!a.fin_previsto_en) return { dias: 0, importe: 0 };
  const hasta = a.devuelto_en ? Date.parse(a.devuelto_en) : ahora;
  const dias = diasRetraso(a.fin_previsto_en, Number.isFinite(hasta) ? hasta : ahora);
  return { dias, importe: recargoRetraso(dias, ajustes.recargo_dia_eur, ajustes.cortesia_dias, a.fianza_eur) };
}

/**
 * Comprueba un descuento de la fianza: importe mayor que 0 y, junto al recargo ya cobrado, nunca más que la fianza; el
 * motivo, obligatorio (lo verá el cliente). Devuelve el error o null.
 */
export function validarDescuentoFianza(importe: number | null, motivo: string, fianza: number, recargo: number): string | null {
  if (importe === null || !Number.isFinite(importe) || importe <= 0) return "Escribe el importe que se descuenta de la fianza.";
  const queda = Math.max(0, cents(fianza) - cents(recargo || 0)) / 100;
  if (cents(importe) > cents(queda)) return `El descuento no puede pasar de lo que queda de la fianza (${eurosAlquiler(queda)}).`;
  if (motivo.replace(/\s+/g, " ").trim().length < 3) return "Escribe el motivo del descuento: lo verá el cliente.";
  return null;
}

/** Lo que queda de la fianza para devolver: la fianza menos el recargo y el descuento. */
export function fianzaADevolver(fianza: number, recargo: number, descuento: number): number {
  return Math.max(0, cents(fianza) - cents(recargo || 0) - cents(descuento || 0)) / 100;
}

/** Lee un número escrito con coma o punto («54,90», «10.5»); vacío = null; mal escrito = NaN. */
export function leerNumero(t: string): number | null {
  const s = t.trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  return /^\d{1,7}(\.\d{1,2})?$/.test(s) ? Number(s) : NaN;
}
