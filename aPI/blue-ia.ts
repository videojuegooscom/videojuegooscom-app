/**
 * api/blue-ia.ts
 *
 * Qué hace: función serverless de Vercel que responde a las preguntas del
 * asistente "Blue IA" (app/(tabs)/blue-ia.tsx). El navegador nunca habla
 * directamente con OpenAI: manda la pregunta aquí (POST /api/blue-ia), esta
 * función añade contexto real de la tienda (catálogo de productos publicado
 * en Supabase) y las últimas frases de la conversación, se lo pasa a OpenAI
 * (modelo gpt-4o-mini) y devuelve solo el texto de la respuesta.
 *
 * Por qué así: la clave de OpenAI (OPENAI_API_KEY) es secreta y solo puede
 * vivir en el servidor — nunca en el código del navegador — así que hace
 * falta este endpoint intermedio. Se despliega solo con subir este archivo:
 * Vercel detecta automáticamente cualquier archivo dentro de /api como una
 * función serverless, sin tocar vercel.json ni el resto del build estático
 * (npx expo export --platform web).
 *
 * Variables de entorno que usa (Vercel → Settings → Environment Variables):
 * - OPENAI_API_KEY: clave de https://platform.openai.com/api-keys. Sin esto
 *   la función responde con un aviso claro en vez de romperse.
 * - EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY: las mismas que
 *   ya usa el resto de la app (son públicas a propósito, protegidas por las
 *   políticas RLS de sql/products.sql) — se reutilizan aquí para leer el
 *   catálogo real y que Blue IA no se invente productos ni precios.
 *
 * Conectado con:
 * - app/(tabs)/blue-ia.tsx → único sitio que llama a este endpoint
 *   (fetch("/api/blue-ia") en web).
 * - sql/products.sql / sql/categories → de aquí sale el contexto real de
 *   catálogo (solo productos con status="PUBLISHED" e is_active=true, que es
 *   justo lo que ve cualquier visitante sin sesión).
 */
import { createClient } from "@supabase/supabase-js";

type ChatTurn = { role: "user" | "assistant"; text: string };

const CONDITION_LABEL: Record<string, string> = {
  NEW: "nuevo",
  LIKE_NEW: "como nuevo",
  GOOD: "buen estado",
  FAIR: "estado aceptable",
  PARTS: "solo para piezas",
};

// Trae una muestra real del catálogo publicado (los últimos productos
// activos) para que Blue IA solo hable de cosas que de verdad existen en la
// tienda, con el precio real en euros. No hace falta más: al ser una tienda
// de segundas manos/reacondicionados, unas cuantas decenas de productos
// recientes ya dan una idea representativa de lo que hay disponible.
async function loadProductContext(): Promise<string> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return "";

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data, error } = await supabase
      .from("products")
      .select("title,price_eur,condition,categories(name)")
      .eq("status", "PUBLISHED")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(45);

    if (error) {
      console.error("Blue IA: error cargando el catálogo desde Supabase:", error);
      return "";
    }

    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) return "";

    return rows
      .map((p: any) => {
        const catName = Array.isArray(p.categories)
          ? p.categories[0]?.name
          : p.categories?.name;
        const cat = catName ? ` · ${catName}` : "";
        const cond = CONDITION_LABEL[p.condition] ?? p.condition;
        return `- ${p.title} — ${p.price_eur}€ (${cond}${cat})`;
      })
      .join("\n");
  } catch (e) {
    console.error("Blue IA: error inesperado cargando el catálogo:", e);
    return "";
  }
}

function buildSystemPrompt(productContext: string): string {
  const catalogBlock = productContext
    ? `Aquí tienes una muestra REAL y actual del catálogo de la tienda (título — precio en euros, estado, categoría). Solo puedes recomendar o mencionar productos de esta lista, con su precio tal cual aparece. Si nada encaja con lo que pide la persona, dilo con sinceridad y sugiere mirar el catálogo completo en la pestaña "Inicio" o "Catálogo", o preguntar por otra cosa:\n${productContext}`
    : "No se ha podido cargar el catálogo real en este momento. No inventes productos ni precios concretos: invita a la persona a mirar el catálogo de la tienda directamente o a preguntar por otra cosa.";

  return `Eres "Blue IA", la asistente virtual de videojuegoszaragoza.com, una tienda de compraventa de consolas, videojuegos, móviles y accesorios de segunda mano y reacondicionados.

Tu trabajo:
- Ayudar a elegir productos según presupuesto y necesidad, preguntando primero lo que haga falta (presupuesto, tipo de dispositivo, para qué lo quiere) si no está claro.
- Explicar cómo vender un dispositivo o entregarlo como parte de pago (cambio).
- Resolver dudas de soporte: garantía, limpieza, reparaciones, envíos, pago a plazos.

Cómo debes responder:
- Siempre en español de España, tono cercano, profesional y directo, sin rodeos innecesarios.
- Respuestas cortas y claras (2 a 5 frases, o una lista breve si ayuda) — nunca un muro de texto.
- Los precios siempre en euros con el símbolo €, tal cual aparecen en el catálogo.
- Nunca inventes productos, precios, plazos ni políticas que no tengas aquí abajo.
- Si preguntan por vender o cambiar un dispositivo, explica que pueden usar el botón "Vender Ya" de la tienda para que el equipo revise su caso y les dé un precio real.
- Si preguntan por pago a plazos, confirma que está disponible en el proceso de compra, sin inventar condiciones concretas (comisiones, cuotas, meses) que no conoces.
- Si te falta información para responder con seguridad, dilo con naturalidad en vez de inventar una respuesta.

${catalogBlock}`;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido." });
    return;
  }

  try {
    const body = (req.body ?? {}) as { message?: unknown; history?: unknown };
    const cleanMessage = typeof body.message === "string" ? body.message.trim() : "";

    if (!cleanMessage) {
      res.status(400).json({ error: "Falta el mensaje." });
      return;
    }
    if (cleanMessage.length > 800) {
      res.status(400).json({ error: "El mensaje es demasiado largo (máximo 800 caracteres)." });
      return;
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      res.status(500).json({
        error:
          "Blue IA no está configurada todavía: falta la variable de entorno OPENAI_API_KEY en Vercel.",
      });
      return;
    }

    const productContext = await loadProductContext();
    const systemPrompt = buildSystemPrompt(productContext);

    // Como mucho las últimas 10 vueltas de la conversación: suficiente para
    // que Blue IA recuerde el hilo (p. ej. el presupuesto que ya dijiste)
    // sin mandar la conversación entera cada vez.
    const historyTurns: ChatTurn[] = Array.isArray(body.history)
      ? (body.history as any[])
          .filter(
            (t) =>
              t &&
              typeof t.text === "string" &&
              (t.role === "user" || t.role === "assistant")
          )
          .slice(-10)
      : [];

    const openaiMessages = [
      { role: "system", content: systemPrompt },
      ...historyTurns.map((t) => ({ role: t.role, content: t.text.slice(0, 800) })),
      { role: "user", content: cleanMessage },
    ];

    const completion = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: openaiMessages,
        temperature: 0.4,
        max_tokens: 420,
      }),
    });

    if (!completion.ok) {
      const errText = await completion.text().catch(() => "");
      console.error("Blue IA: error de OpenAI:", completion.status, errText);
      res.status(502).json({
        error: "Blue IA no ha podido responder ahora mismo. Inténtalo de nuevo en unos segundos.",
      });
      return;
    }

    const data = (await completion.json()) as any;
    const reply: string =
      data?.choices?.[0]?.message?.content?.trim() ||
      "No he podido generar una respuesta. ¿Puedes reformular tu pregunta?";

    res.status(200).json({ reply });
  } catch (e: any) {
    console.error("Blue IA: error inesperado en /api/blue-ia:", e);
    res.status(500).json({ error: "Ha ocurrido un error inesperado. Inténtalo de nuevo." });
  }
}
