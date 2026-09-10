// app/politicas/[slug].tsx
/**
 * Qué hace: página pública de una política legal/comercial (Envíos,
 * Devoluciones, Privacidad o Términos y condiciones). Es UNA sola pantalla
 * dinámica para las 4 — el contenido de cada una vive en el objeto POLICIES
 * de este mismo archivo, así no hay que duplicar la cabecera/estilo en 4
 * archivos distintos.
 *
 * IMPORTANTE — texto pendiente de revisar por Jefe antes de publicar:
 * el contenido de cada política está redactado con los datos reales que ya
 * usa el resto de la web (envíos a toda España + recogida en tienda,
 * garantía de tienda, revisión antes de vender...), pero los datos legales
 * de identificación (nombre/razón social, NIF/CIF, dirección fiscal, email
 * de contacto para protección de datos) NO los tengo — están marcados con
 * placeholders entre corchetes (buscar "[" en este archivo) y hay que
 * rellenarlos a mano antes de que esto sea de verdad público. El derecho de
 * desistimiento (14 días) y las menciones de RGPD siguen la base legal
 * estándar en España, pero conviene que un gestor/abogado lo revise antes de
 * darlo por definitivo — esto no sustituye asesoría legal real.
 *
 * Conectado con:
 * - app/(tabs)/index.tsx → el acordeón "Políticas" del pie de página enlaza
 *   aquí (uno por slug: envios, devoluciones, privacidad, terminos).
 */
import React from "react";
import { Pressable, ScrollView, StatusBar, Text, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  accent: "#1EA7E8",
};

const columnStyle = { width: "100%", maxWidth: 820, alignSelf: "center" } as const;

type PolicySection = { heading: string; body: string };
type Policy = { title: string; intro: string; sections: PolicySection[] };

const POLICIES: Record<string, Policy> = {
  envios: {
    title: "Política de envíos",
    intro:
      "Enviamos a toda España, bien protegido y con seguimiento. Si lo prefieres, también puedes recoger tu pedido en tienda sin coste.",
    sections: [
      {
        heading: "Zonas de envío",
        body:
          "Enviamos a toda la península. Para Baleares, Canarias, Ceuta y Melilla, escríbenos antes de comprar por WhatsApp para confirmar plazo y coste, ya que pueden variar.",
      },
      {
        heading: "Plazos de preparación y entrega",
        body:
          "Preparamos cada pedido en 24–48h laborables tras confirmarse el pago. El transporte añade normalmente 24–72h laborables adicionales en península. Te avisamos por email o WhatsApp en cuanto el pedido sale de tienda, con su número de seguimiento.",
      },
      {
        heading: "Coste de envío",
        body:
          "El coste se calcula automáticamente en el checkout según el destino y el peso/volumen del pedido, antes de confirmar la compra.",
      },
      {
        heading: "Recogida en tienda",
        body:
          "Puedes elegir recoger tu pedido en nuestra tienda física sin coste de envío. Te avisamos en cuanto esté listo para recoger.",
      },
      {
        heading: "Embalaje",
        body:
          "Todos los productos se envían protegidos con material adecuado para electrónica y videoconsolas, minimizando el riesgo de daños durante el transporte.",
      },
      {
        heading: "Incidencias en el transporte",
        body:
          "Si tu pedido llega dañado o no llega en el plazo indicado, contacta con nosotros por WhatsApp al [NÚMERO DE WHATSAPP] o desde tu Perfil en la app, y lo resolvemos contigo.",
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
          "[NOMBRE LEGAL / RAZÓN SOCIAL], con NIF/CIF [NIF/CIF] y domicilio en [DIRECCIÓN FISCAL], es el responsable del tratamiento de tus datos personales. Para cualquier consulta sobre privacidad, puedes escribir a [EMAIL DE CONTACTO PARA PROTECCIÓN DE DATOS].",
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
          "Solo compartimos los datos estrictamente necesarios con empresas de transporte (para entregar tu pedido) y con nuestro proveedor de pagos (Supabase/Stripe u otro que uses), bajo sus propias políticas de privacidad. No vendemos tus datos a terceros.",
      },
      {
        heading: "Cuánto tiempo conservamos tus datos",
        body:
          "Conservamos tus datos mientras mantengas una cuenta activa y, tras cerrarla, durante el plazo legalmente exigido para cumplir obligaciones fiscales y contables.",
      },
      {
        heading: "Tus derechos",
        body:
          "Puedes solicitar acceso, rectificación, supresión, oposición, limitación o portabilidad de tus datos escribiendo a [EMAIL DE CONTACTO PARA PROTECCIÓN DE DATOS]. También tienes derecho a reclamar ante la Agencia Española de Protección de Datos (aepd.es).",
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
          "Videojuegoszaragoza.com es una tienda de compraventa de videoconsolas y electrónica, operada por [NOMBRE LEGAL / RAZÓN SOCIAL], NIF/CIF [NIF/CIF], con domicilio en [DIRECCIÓN FISCAL].",
      },
      {
        heading: "Nuestros productos y servicios",
        body:
          "Vendemos consolas y electrónica nuevas y de segunda mano (todas revisadas antes de la venta), compramos tu consola o electrónica usada, y ofrecemos servicios de reparación y mantenimiento.",
      },
      {
        heading: "Precios y pago",
        body:
          "Los precios mostrados incluyen los impuestos aplicables. El pago se realiza a través de los métodos disponibles en el checkout de la app. Nos reservamos el derecho a corregir errores evidentes de precio antes de confirmar el pedido.",
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
};

export default function PoliticaScreen() {
  const { width } = useWindowDimensions();
  const widthSafe = width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const pagePadding = isMobile ? 16 : 24;

  const params = useLocalSearchParams<{ slug?: string }>();
  const slug = typeof params.slug === "string" ? params.slug : "";
  const policy = POLICIES[slug];

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: "#F6FAFD",
          paddingHorizontal: pagePadding,
          paddingTop: isMobile ? 12 : 14,
          paddingBottom: 14,
        }}
      >
        <View style={{ ...columnStyle, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            style={({ pressed }) => ({
              opacity: pressed ? 0.85 : 1,
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Ionicons name="chevron-back" size={22} color={COLORS.text} />
          </Pressable>
          <Text style={{ color: COLORS.text, fontSize: isMobile ? 20 : 22, fontWeight: "900" }}>
            {policy?.title ?? "Política"}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: pagePadding,
          paddingTop: 20,
          paddingBottom: 40,
        }}
      >
        <View style={{ ...columnStyle, gap: 18 }}>
          {!policy ? (
            <Text style={{ color: COLORS.muted, lineHeight: 22 }}>
              No hemos encontrado esta política.
            </Text>
          ) : (
            <>
              <Text style={{ color: COLORS.muted, lineHeight: 22, fontSize: 15 }}>
                {policy.intro}
              </Text>

              {policy.sections.map((section) => (
                <View key={section.heading} style={{ gap: 6 }}>
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
                    {section.heading}
                  </Text>
                  <Text style={{ color: COLORS.muted, lineHeight: 21, fontSize: 14.5 }}>
                    {section.body}
                  </Text>
                </View>
              ))}

              <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 8 }}>
                Última actualización: [FECHA]
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
