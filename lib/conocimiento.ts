// lib/conocimiento.ts
/**
 * Qué hace: temas que Blue le propone al dueño para que escriba información real de la tienda
 * («Lo que Blue sabe», tabla blue_conocimiento) y las funciones para guardarla. Blue IA usa esas
 * respuestas al contestar a los clientes (api/blue-ia.ts).
 *
 * Reglas: Blue solo hace la PREGUNTA; la respuesta la escribe siempre el dueño. Nunca se
 * inventan datos del negocio (horarios, plazos, precios, condiciones).
 *
 * Conectado con:
 * - components/Campanita.tsx → Blue propone un tema en el panel de administración y recoge la
 *   respuesta en una ventana.
 * - app/admin/conocimiento.tsx → lista, edita y activa/desactiva lo que Blue sabe.
 */
import { supabase } from "./supabase";

export type TemaConocimiento = { tema: string; pregunta: string };

// Orden = prioridad con la que Blue los propone.
export const TEMAS_CONOCIMIENTO: TemaConocimiento[] = [
  { tema: "Horario de atención", pregunta: "¿Cuál es el horario de atención de la tienda y de las entregas en persona?" },
  { tema: "Entregas en persona en Zaragoza", pregunta: "¿Cómo y dónde se hacen las entregas en persona en Zaragoza?" },
  { tema: "Plazo de los envíos", pregunta: "¿En cuántos días llegan los envíos a toda España y cómo se envían?" },
  { tema: "Coste de los envíos", pregunta: "¿Cuánto cuesta el envío? ¿Hay envío gratis a partir de algún importe?" },
  { tema: "Garantía", pregunta: "¿Qué cubre la garantía de 1 año y cómo se tramita si algo falla?" },
  { tema: "Devoluciones y cambios", pregunta: "¿Se pueden devolver o cambiar los artículos? ¿En qué plazo y condiciones?" },
  { tema: "Métodos de pago", pregunta: "¿Qué métodos de pago aceptáis?" },
  { tema: "Pago a plazos", pregunta: "¿Cómo funciona el pago a plazos? ¿Hay importe mínimo, cuotas o comisiones?" },
  { tema: "Qué compráis y cómo tasáis", pregunta: "¿Qué consolas y dispositivos compráis, cuáles no, y cómo calculáis el precio?" },
  { tema: "Cambio como parte de pago", pregunta: "¿Cómo funciona entregar un dispositivo como parte de pago de otro?" },
  { tema: "Reparaciones", pregunta: "¿Qué reparáis y en cuánto tiempo suele estar listo?" },
  { tema: "Segunda mano y reacondicionado", pregunta: "¿Qué significa «segunda mano» y «reacondicionado» en vuestros artículos? ¿Cómo los revisáis?" },
  { tema: "Tiempo de respuesta", pregunta: "¿En cuánto tiempo responde el equipo a un mensaje del chat?" },
];

export type ItemConocimiento = {
  id: string;
  tema: string;
  respuesta: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

/** Temas ya respondidos (activos o no), para no volver a preguntarlos. */
export async function temasRespondidos(): Promise<Set<string>> {
  try {
    const { data } = await supabase.from("blue_conocimiento").select("tema");
    return new Set((Array.isArray(data) ? data : []).map((r: { tema: string }) => r.tema));
  } catch {
    return new Set();
  }
}

/** Guarda (o actualiza) la respuesta de un tema. Devuelve un texto de error o null si fue bien. */
export async function guardarConocimiento(tema: string, respuesta: string): Promise<string | null> {
  const t = tema.trim();
  const r = respuesta.trim();
  if (t.length < 2) return "Escribe un tema.";
  if (r.length < 2) return "Escribe la respuesta.";
  if (r.length > 800) return "La respuesta es demasiado larga (máximo 800 caracteres).";
  const { error } = await supabase
    .from("blue_conocimiento")
    .upsert({ tema: t, respuesta: r, activo: true, updated_at: new Date().toISOString() }, { onConflict: "tema" });
  return error ? "No se pudo guardar. Inténtalo de nuevo." : null;
}
