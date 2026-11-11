// app/politicas/[slug].tsx
/**
 * Qué hace: página pública de una política legal/comercial (Envíos,
 * Devoluciones, Privacidad, Términos y condiciones...). Es UNA sola pantalla
 * dinámica para todas — el contenido de cada una ahora vive en la tabla
 * Supabase "policy_pages" y se edita desde app/admin/policies.tsx, así Jefe
 * puede corregir texto, añadir secciones o publicar/ocultar una política sin
 * tocar código.
 *
 * Cómo funciona:
 * - fetchPolicySafe(slug) busca en "policy_pages" la fila con ese slug y
 *   is_active=true (RLS ya lo filtra así para el público). Si Supabase falla
 *   (sin conexión, tabla no disponible...) o la política todavía no se ha
 *   creado en la base de datos, cae a FALLBACK_POLICIES — el mismo texto que
 *   tenía esta pantalla antes de tener panel de administración — para que la
 *   página nunca se quede vacía ni rota.
 * - "sections" en Supabase es un jsonb con forma [{heading, body}, ...],
 *   igual que el tipo PolicySection de este archivo.
 *
 * Datos legales (dueño, 2026-10-16/17 y 2026-11-03): titular Daniel Gutiérrez,
 * NIF Y4751659B, domicilio C. Miguel Servet, 3, 50410 Cuarte de Huerva,
 * Zaragoza, y correo de protección de datos VideojuegosZaragoza.com@gmail.com.
 * Los textos buenos viven en policy_pages (migraciones 20261017150000,
 * 20261017200000 y 20261103130000) y se editan desde app/admin/policies.tsx;
 * el respaldo de este archivo lleva los mismos datos. El derecho de
 * desistimiento (14 días) y las menciones de RGPD siguen la base legal
 * estándar en España, pero conviene que un gestor/abogado lo revise antes de
 * darlo por definitivo — esto no sustituye asesoría legal real.
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase para leer "policy_pages".
 * - app/admin/policies.tsx → editor de administración de estas políticas
 *   (crear, editar secciones, publicar/ocultar, borrar).
 * - app/(tabs)/index.tsx → el acordeón "Políticas" del pie de página enlaza
 *   aquí (uno por slug: envios, devoluciones, privacidad, terminos).
 * - app/(tabs)/chat-global.tsx → el aviso de silencio del Foro enlaza a
 *   /politicas/normas-foro (Normas del Foro).
 */
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "../../lib/supabase";
import CabeceraMarca from "../../components/CabeceraMarca";
import { useRecarga } from "../../components/TirarParaActualizar";

const COLORS = {
  bg: "#FFFFFF",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  accent: "#1EA7E8",
};

const columnStyle = { width: "100%", maxWidth: 820, alignSelf: "center" } as const;

type PolicySection = { heading: string; body: string };
type Policy = { title: string; intro: string; sections: PolicySection[] };

// Mismo contenido que tenía esta pantalla antes del panel de administración:
// se usa solo si Supabase falla o la política aún no existe en la base de
// datos, para que la página nunca aparezca vacía o rota.
const FALLBACK_POLICIES: Record<string, Policy> = {
  envios: {
    title: "Política de envíos",
    intro:
      "Enviamos a toda España, bien protegido y con seguimiento. En Zaragoza te lo llevamos el mismo día, a domicilio o en mano en Cuarte de Huerva.",
    sections: [
      {
        heading: "Zonas de envío",
        body:
          "Enviamos a toda la península. Para Baleares, Canarias, Ceuta y Melilla, escríbenos antes de comprar por WhatsApp para confirmar plazo y coste, ya que pueden variar.",
      },
      {
        heading: "Plazos de preparación y entrega",
        body:
          "El pedido sale de nuestro almacén en 1-2 días tras confirmarse el pago y llega a destino en 72 horas como máximo. Te avisamos en cuanto sale, con su número de seguimiento.",
      },
      {
        heading: "Coste de envío",
        body:
          "Enviamos con Correos. El coste se calcula automáticamente al finalizar la compra, según el destino y el peso del pedido con su embalaje, y lo ves antes de pagar o confirmar.",
      },
      {
        heading: "Entregas en Zaragoza",
        body:
          "Somos una tienda online, sin tienda física. En Zaragoza te llevamos el pedido a casa el mismo día, o te lo entregamos en mano en Cuarte de Huerva. Te avisamos por el chat de la tienda cuando esté listo.",
      },
      {
        heading: "Embalaje",
        body:
          "Todos los productos se envían protegidos con material adecuado para electrónica y videoconsolas, minimizando el riesgo de daños durante el transporte. Los televisores que no conservan su caja original no se envían: se entregan solo en mano, en Zaragoza o en Cuarte de Huerva.",
      },
      {
        heading: "Incidencias en el transporte",
        body:
          "Si tu pedido llega dañado o no llega en el plazo indicado, contacta con nosotros por WhatsApp al 627 748 741 o escríbenos directamente desde el chat de la tienda, y lo resolvemos contigo.",
      },
    ],
  },
  devoluciones: {
    title: "Política de devoluciones",
    intro:
      "Queremos que compres con confianza. Además de la garantía de tienda que incluye todo lo que vendemos, tienes derecho legal a devolver tu compra si cambias de opinión.",
    sections: [
      {
        heading: "Derecho de desistimiento (14 días)",
        body:
          "Como consumidor, dispones de 14 días naturales desde que recibes el producto para desistir de la compra sin necesidad de justificar el motivo, conforme a la normativa española y europea de protección de consumidores. Para ejercerlo, contáctanos por WhatsApp o desde tu Perfil indicando el pedido a devolver.",
      },
      {
        heading: "Estado del producto a devolver",
        body:
          "El producto debe devolverse en el mismo estado en que se entregó, con todos sus accesorios y, en la medida de lo posible, su embalaje original. Si el producto presenta un uso o desgaste superior al necesario para comprobar su funcionamiento, podremos descontar la pérdida de valor correspondiente del importe a reembolsar.",
      },
      {
        heading: "Gastos de la devolución",
        body:
          "Los gastos de envío de vuelta corren por cuenta del cliente, salvo que la devolución se deba a un error nuestro o a un producto defectuoso, en cuyo caso los asumimos nosotros.",
      },
      {
        heading: "Reembolso",
        body:
          "Una vez recibido y comprobado el producto, procesamos el reembolso por el mismo método de pago utilizado en la compra en un plazo máximo de 14 días naturales.",
      },
      {
        heading: "Garantía de tienda (distinta de la devolución)",
        body:
          "Todo lo que vendemos incluye garantía de tienda: cada producto pasa una revisión de funcionamiento antes de ponerse a la venta, y si algo falla dentro del periodo de garantía, te lo solucionamos sin líos. Esto aplica independientemente del plazo de desistimiento de 14 días.",
      },
    ],
  },
  privacidad: {
    title: "Política de privacidad",
    intro:
      "En Videojuegoszaragoza.com nos tomamos en serio la protección de tus datos personales. Aquí te explicamos qué datos tratamos, para qué y qué derechos tienes.",
    sections: [
      {
        heading: "Responsable del tratamiento",
        body:
          "Daniel Gutiérrez, con NIF/CIF Y4751659B y domicilio en C. Miguel Servet, 3, 50410 Cuarte de Huerva, Zaragoza, es el responsable del tratamiento de tus datos personales. Para cualquier consulta sobre privacidad, puedes escribir a VideojuegosZaragoza.com@gmail.com.",
      },
      {
        heading: "Qué datos tratamos",
        body:
          "Datos de contacto (nombre, email, teléfono, dirección de envío), datos de tu cuenta, historial de pedidos y solicitudes de venta, y los mensajes que nos envías por el chat de la app o por WhatsApp.",
      },
      {
        heading: "Para qué usamos tus datos",
        body:
          "Para gestionar tu pedido o solicitud de venta, comunicarnos contigo sobre su estado, ofrecerte soporte, y mejorar nuestros productos y servicios. No usamos tus datos para fines distintos a estos.",
      },
      {
        heading: "Base legal",
        body:
          "Tratamos tus datos porque son necesarios para ejecutar el contrato de compraventa (tu pedido), por tu consentimiento cuando nos contactas voluntariamente, o por nuestro interés legítimo en mejorar el servicio.",
      },
      {
        heading: "Con quién compartimos tus datos",
        body:
          "Solo compartimos los datos estrictamente necesarios con empresas de transporte (para entregar tu pedido) y con los proveedores técnicos que hacen funcionar la tienda: Supabase (base de datos, cuentas y fotos), Vercel (alojamiento de la web) y OpenAI (procesa los mensajes que escribes a Blue IA para poder responderte). Cada uno trata los datos según sus propias condiciones de privacidad. No vendemos tus datos a terceros. Los correos de tu cuenta (por ejemplo, el de recuperar la contraseña) los envía Resend en nombre de la tienda, desde no-responder@videojuegoszaragoza.com; para ello recibe tu correo electrónico y el contenido de ese mensaje. Si tu pedido incluye artículos que gestionamos con VeoAura, el programa de gestión del negocio, le comunicamos ese pedido (número, artículo, forma de entrega y precio) y, cuando lo pagas con tarjeta o te lo entregamos, también tu nombre, tu correo electrónico y tu teléfono, para tener tu ficha de cliente. No le pasamos tu dirección ni otros datos. Si pagas con tarjeta, el pago lo gestiona Stripe (Stripe Payments Europe, Ltd.), nuestro proveedor de pagos: escribes tu tarjeta y tu correo electrónico directamente en su página de pago segura y la tienda nunca ve ni guarda los datos de tu tarjeta. A Stripe solo le pasamos el número de tu pedido y su importe, y Stripe nos dice si el pago se ha hecho y su referencia, para poder devolvértelo si hace falta. Si eliges pagar con Klarna (por ejemplo, a plazos), Klarna Bank AB (publ) trata los datos que le des en su página para aprobar y gestionar ese pago, como responsable de ese tratamiento y según su propia política de privacidad; nosotros solo sabemos, por Stripe, si el pago se ha hecho, y para todo lo demás de esta política cuenta igual que pagar con tarjeta.",
      },
      {
        heading: "Cuánto tiempo conservamos tus datos",
        body:
          "Conservamos tus datos mientras mantengas una cuenta activa y, tras cerrarla, durante el plazo legalmente exigido para cumplir obligaciones fiscales y contables.",
      },
      {
        heading: "Tus derechos",
        body:
          "Puedes solicitar acceso, rectificación, supresión, oposición, limitación o portabilidad de tus datos escribiendo a VideojuegosZaragoza.com@gmail.com. También tienes derecho a reclamar ante la Agencia Española de Protección de Datos (aepd.es).",
      },
    ],
  },
  // Normas del Foro (2026-10-31): el aviso de silencio del Foro enlaza aquí. El texto bueno vive en policy_pages
  // (migración 20261031150000) y se edita en Administración → Políticas; este es el mismo, por si la base de datos falla.
  "normas-foro": {
    title: "Normas del Foro",
    intro:
      "El Foro es el sitio para hablar de videojuegos y consolas con otros clientes de la tienda. Estas normas valen para el Foro y para los comentarios de las noticias. Son pocas y sencillas.",
    sections: [
      {
        heading: "Respeto ante todo",
        body: "Nada de insultos, amenazas, acoso ni mensajes que ataquen a alguien por quién es. Se puede no estar de acuerdo sin faltar a nadie.",
      },
      {
        heading: "Sin spam ni publicidad",
        body: "No publiques anuncios, enlaces repetidos ni promociones de otras tiendas o servicios. Si quieres vendernos tu consola, usa «Vender» en la tienda.",
      },
      {
        heading: "Tus datos, a salvo",
        body: "No compartas teléfonos, direcciones, correos ni otros datos personales, tuyos o de otras personas. Para hablar de un pedido o de una reparación, escríbenos desde «Hablar con Blue IA o el equipo».",
      },
      {
        heading: "Contenido apropiado",
        body: "Nada de contenido sexual, violento u ofensivo, ni nada ilegal, como piratería o cuentas robadas.",
      },
      {
        heading: "Si no se cumplen",
        body: "Un administrador puede eliminar mensajes y comentarios y, si hace falta, silenciar a una persona durante unos días (1, 3 o 7): mientras dure no podrá escribir en el Foro ni comentar noticias, aunque sí seguir usando la tienda con normalidad. Si crees que ha sido un error, escríbenos desde «Hablar con Blue IA o el equipo».",
      },
    ],
  },
  terminos: {
    title: "Términos y condiciones",
    intro:
      "Al usar Videojuegoszaragoza.com y comprar o vender con nosotros, aceptas estas condiciones. Te las resumimos de forma clara.",
    sections: [
      {
        heading: "Quiénes somos",
        body:
          "Videojuegoszaragoza.com es una tienda de compraventa de videoconsolas y electrónica, operada por Daniel Gutiérrez, NIF/CIF Y4751659B, con domicilio en C. Miguel Servet, 3, 50410 Cuarte de Huerva, Zaragoza.",
      },
      {
        heading: "Nuestros productos y servicios",
        body:
          "Vendemos consolas y electrónica nuevas y de segunda mano (todas revisadas antes de la venta), compramos tu consola o electrónica usada, y ofrecemos servicios de reparación y mantenimiento.",
      },
      {
        heading: "Precios y pago",
        body:
          "Los precios mostrados incluyen los impuestos aplicables. El pago se realiza a través de los métodos disponibles en la página de pago de la tienda. Nos reservamos el derecho a corregir errores evidentes de precio antes de confirmar el pedido. Si pagas con tarjeta o con Klarna (que permite pagar a plazos; la aprobación y sus condiciones las pone Klarna), lo haces en la página de pago segura de Stripe (la tienda nunca ve los datos de tu tarjeta); también puedes confirmar el pedido sin pagar y acordar el pago con nosotros por el chat de la tienda. Si ya lo has pagado y no podemos servirlo, te devolvemos el importe completo por el mismo medio de pago.",
      },
      {
        heading: "Edad mínima",
        body:
          "Para comprar o vender en Videojuegoszaragoza.com debes ser mayor de edad, o contar con la autorización de tu tutor legal.",
      },
      {
        heading: "Disponibilidad",
        body:
          "Todos los productos están sujetos a disponibilidad de stock. Si un producto deja de estar disponible tras tu pedido, te lo comunicaremos y te ofreceremos una alternativa o el reembolso completo.",
      },
      {
        heading: "Responsabilidad",
        body:
          "Hacemos todo lo posible por que la información de cada producto sea precisa. No nos hacemos responsables de daños derivados de un uso indebido de los productos vendidos, sin perjuicio de la garantía legal que corresponda.",
      },
      {
        heading: "Ley aplicable",
        body:
          "Estas condiciones se rigen por la legislación española. Para cualquier controversia, las partes se someten a los juzgados y tribunales que correspondan según la normativa de protección de consumidores.",
      },
    ],
  },
  // Reparación por envío (dueño, 2026-11-11): el mismo texto que pone la migración 20261111100000 (el bueno vive en
  // policy_pages y lo edita el dueño). Sin cifras inventadas: el plazo y la custodia los indica el seguimiento.
  "reparacion-envio": {
    title: "Reparación por envío",
    intro:
      "Si no estás en Zaragoza o Cuarte de Huerva, puedes mandarnos tu consola, mando, móvil o portátil por Correos desde cualquier punto de la España peninsular y te lo devolvemos reparado.",
    sections: [
      {
        heading: "Cómo funciona",
        body:
          "1. Pide la reparación desde «Contratar servicio ahora» en la ficha del servicio, eligiendo «Envío por Correos», con tu sesión iniciada. 2. Te preparamos la etiqueta de Correos: su coste lo ves antes de enviar la solicitud y depende de tu código postal y del peso. 3. Descarga la etiqueta en Perfil → Mis seguimientos, embala el aparato y llévalo a Correos. 4. Te avisamos cuando llegue, te enseñamos las fotos de cómo lo recibimos y lo diagnosticamos. 5. Te mandamos el presupuesto y solo reparamos cuando lo aceptas desde Mis seguimientos. 6. Te lo devolvemos reparado y puedes seguir cada paso en Mis seguimientos.",
      },
      {
        heading: "Cómo embalarlo",
        body:
          "Quita discos, tarjetas, fundas y accesorios que no hagan falta para la reparación. Si puedes, apaga y desvincula la cuenta del aparato. Envuélvelo en plástico de burbujas o papel y mételo en una caja rígida, sin que se mueva al agitarla (rellena los huecos). Cierra bien la caja con cinta y pega la etiqueta de Correos en una cara lisa. Dentro, una nota con tu nombre y tu número de seguimiento VZ-.",
      },
      {
        heading: "Plazos",
        body:
          "La reparación se hace en el plazo que te indicamos en tu seguimiento, contado desde que el aparato llega a nuestro taller, si no hay que pedir piezas. Si hace falta una pieza, te avisamos en Mis seguimientos con la fecha aproximada de llegada.",
      },
      { heading: "Garantía", body: "La reparación tiene la garantía que figura en tu presupuesto o en tu factura." },
      {
        heading: "La vuelta",
        body: "El envío de vuelta a tu casa va incluido en el precio de la reparación. Solo pagas aparte la etiqueta para mandárnoslo.",
      },
      {
        heading: "Si no tiene arreglo",
        body: "Si tras el diagnóstico tu aparato no tiene arreglo, te ofrecemos comprártelo o devolvértelo pagando solo el envío de vuelta.",
      },
      {
        heading: "Custodia",
        body:
          "Cuando tu aparato esté listo, o si no tiene arreglo, lo guardamos durante el plazo que te indicamos en tu seguimiento mientras decides qué hacer.",
      },
      { heading: "Dudas", body: "Escríbenos desde Blue IA o el chat de la tienda y lo vemos contigo." },
    ],
  },
};

function normalizeSections(value: unknown): PolicySection[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((row): PolicySection | null => {
      if (!row || typeof row !== "object") return null;
      const heading = String((row as any).heading ?? "").trim();
      const body = String((row as any).body ?? "").trim();
      if (!heading || !body) return null;
      return { heading, body };
    })
    .filter((s): s is PolicySection => s !== null);
}

async function fetchPolicySafe(slug: string): Promise<Policy | null> {
  if (!slug) return null;

  try {
    const { data, error } = await supabase
      .from("policy_pages")
      .select("title,intro,sections")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const title = String((data as any).title ?? "").trim();
    if (!title) return null;

    return {
      title,
      intro: String((data as any).intro ?? "").trim(),
      sections: normalizeSections((data as any).sections),
    };
  } catch {
    return null;
  }
}

export default function PoliticaScreen() {
  const { width } = useWindowDimensions();
  const widthSafe = width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const pagePadding = isMobile ? 16 : 24;

  const params = useLocalSearchParams<{ slug?: string }>();
  const slug = typeof params.slug === "string" ? params.slug : "";

  const [loading, setLoading] = useState(true);
  const [policy, setPolicy] = useState<Policy | null>(null);

  // También con «Desliza para actualizar» (recarga), sin volver a la carga.
  const recarga = useRecarga();
  const ultimaRecarga = useRef(0);
  useEffect(() => {
    let alive = true;
    const porRecarga = recarga !== ultimaRecarga.current;
    ultimaRecarga.current = recarga;
    if (!porRecarga) setLoading(true);

    fetchPolicySafe(slug).then((fromDb) => {
      if (!alive) return;
      setPolicy(fromDb ?? FALLBACK_POLICIES[slug] ?? null);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [slug, recarga]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      {/* Cabecera limpia (sin franja de fondo): título centrado y el botón
          de volver fijo a la izquierda sin desplazar el título. */}
      <View
        style={{
          paddingHorizontal: pagePadding,
          paddingTop: isMobile ? 12 : 14,
          paddingBottom: 14,
        }}
      >
        <View style={{ ...columnStyle, gap: 12, alignItems: "center", justifyContent: "center" }}>
          <CabeceraMarca />
          <Text
            accessibilityRole="header"
            {...({ "aria-level": 1 } as object)}
            style={{
              color: COLORS.text,
              fontSize: isMobile ? 20 : 22,
              fontWeight: "900",
              textAlign: "center",
              paddingHorizontal: 44,
            }}
          >
            {policy?.title ?? "Política"}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator color={COLORS.text} />
          <Text style={{ color: COLORS.muted }}>Cargando…</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: pagePadding,
            paddingTop: 20,
            // 96: el final del texto queda por encima del asistente flotante Blue.
            paddingBottom: 96,
          }}
        >
          <View style={{ ...columnStyle, gap: 18 }}>
            {!policy ? (
              <Text style={{ color: COLORS.muted, lineHeight: 22, textAlign: "center" }}>
                No hemos encontrado esta política.
              </Text>
            ) : (
              <>
                <Text style={{ color: COLORS.muted, lineHeight: 22, fontSize: 15, textAlign: "center" }}>
                  {policy.intro}
                </Text>

                {policy.sections.map((section) => (
                  <View key={section.heading} style={{ gap: 6, alignItems: "center" }}>
                    <Text
                      style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}
                    >
                      {section.heading}
                    </Text>
                    <Text
                      style={{ color: COLORS.muted, lineHeight: 21, fontSize: 14.5, textAlign: "center" }}
                    >
                      {section.body}
                    </Text>
                  </View>
                ))}
              </>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
