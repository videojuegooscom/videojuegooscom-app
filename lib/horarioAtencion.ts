// lib/horarioAtencion.ts
/**
 * Horario de atención del equipo (lo dio el dueño: «Lo que Blue sabe», Quiénes somos): de lunes a sábado de 10:00 a
 * 14:00 y de 17:00 a 19:00, y los domingos de 10:00 a 13:00, siempre en hora de España (Europe/Madrid), esté donde
 * esté quien mira.
 *
 * estadoAtencion(fecha) dice si el equipo atiende ahora («hasta las 14:00») y, si no, cuándo vuelve («hoy a las
 * 17:00», «mañana a las 10:00», «el lunes a las 10:00»). Lo usa Blue IA (app/(tabs)/blue-ia.tsx): línea del horario
 * junto a «Hablar con el equipo» y aviso al pulsarlo fuera de horario (dueño, 2026-11-03).
 *
 * La misma tabla está en api/blue-ia.ts (las funciones del servidor no comparten archivos con la app) y, como texto,
 * en app/quienes-somos.tsx y app/+html.tsx: si cambia el horario, se cambia en los cuatro sitios.
 */

export const HORARIO_TEXTO = "de lunes a sábado de 10:00 a 14:00 y de 17:00 a 19:00, y los domingos de 10:00 a 13:00";
export const HORARIO_CORTO = "Lunes a sábado 10:00–14:00 y 17:00–19:00 · Domingos 10:00–13:00";

// Tramos de cada día en minutos desde medianoche (0 = domingo … 6 = sábado).
const TRAMOS: Record<number, [number, number][]> = {
  0: [[600, 780]],
  1: [[600, 840], [1020, 1140]],
  2: [[600, 840], [1020, 1140]],
  3: [[600, 840], [1020, 1140]],
  4: [[600, 840], [1020, 1140]],
  5: [[600, 840], [1020, 1140]],
  6: [[600, 840], [1020, 1140]],
};
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const CORTOS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

// Día de la semana y minuto del día en España.
function enEspana(fecha: Date): { dia: number; minuto: number } {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(fecha);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  const dia = Math.max(0, CORTOS.indexOf(valor("weekday")));
  return { dia, minuto: Number(valor("hour")) * 60 + Number(valor("minute")) };
}

export type EstadoAtencion = { abierto: true; hasta: string } | { abierto: false; vuelve: string };

export function estadoAtencion(fecha: Date = new Date()): EstadoAtencion {
  const { dia, minuto } = enEspana(fecha);
  const hoy = TRAMOS[dia] ?? [];
  const tramo = hoy.find(([desde, hasta]) => minuto >= desde && minuto < hasta);
  if (tramo) return { abierto: true, hasta: hhmm(tramo[1]) };
  for (let salto = 0; salto < 8; salto++) {
    const d = (dia + salto) % 7;
    const inicio = (TRAMOS[d] ?? []).map(([desde]) => desde).find((desde) => salto > 0 || desde > minuto);
    if (inicio === undefined) continue;
    const cuando = salto === 0 ? "hoy" : salto === 1 ? "mañana" : `el ${DIAS[d]}`;
    return { abierto: false, vuelve: `${cuando} a las ${hhmm(inicio)}` };
  }
  return { abierto: false, vuelve: "en nuestro horario de atención" };
}
