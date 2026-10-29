// app/quienes-somos.tsx
/**
 * Qué hace: página «Quiénes somos»: quién está detrás de la tienda, su historia, qué hacemos, cómo revisamos cada
 * consola, por qué elegirnos, cómo compramos en persona, entregas y horario, con botones para dar el siguiente paso.
 *
 * Reglas del contenido (lecciones «No inventar datos del negocio» y «Solo se menciona lo que existe»): sale de lo
 * que ha dicho el dueño (Marca y SEO, «Lo que Blue sabe», la descripción fija de los artículos, entregas y plazos
 * del 2026-10-28, historia, equipo, diferencias y compra en persona del 2026-10-29). El proceso de revisión
 * (REVISION) lo redactó Claude como un proceso estándar a petición del dueño («será prácticamente lo mismo que
 * haga yo»): si cambia lo que hacéis, se cambia aquí. Texto más desarrollado, como el de otras tiendas, también a
 * petición suya. La tienda es SOLO ONLINE: no hay tienda física ni se publica ninguna dirección (el domicilio
 * fiscal solo va en los textos legales). El dueño se llama «Daniel Enrique Gutiérrez Mejía» la primera vez y
 * «Daniel Gutiérrez» en el resto. Su edad se calcula sola con el mes y el año de nacimiento (no se publica la
 * fecha exacta: el repositorio es público).
 *
 * Para Google y las IA esta página es texto normal para personas; lo «técnico» (datos estructurados de la
 * tienda, resumen sin JavaScript) va aparte en app/+html.tsx y public/llms.txt, que deben decir lo mismo.
 *
 * Conectado con: components/SiteHead.tsx (título y descripción), components/SiteFooter.tsx y
 * components/Barramagic.tsx (enlaces), api/sitemap.ts (mapa del sitio), app/_layout.tsx (ruta).
 */
import React from "react";
import { Pressable, ScrollView, StatusBar, Text, useWindowDimensions, View } from "react-native";
import { router, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import CabeceraMarca from "../components/CabeceraMarca";

const COLORS = {
  bg: "#FFFFFF",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  line: "#E3EAF2",
  accent: "#1EA7E8",
  accentDark: "#0B2138",
};

const columnStyle = { width: "100%", maxWidth: 720, alignSelf: "center" } as const;

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];
type Punto = { icono: IoniconName; titulo: string; texto: string };

// Solo mes y año (agosto de 2003): la edad cambia el 1 de agosto, y no se publica el día exacto.
const NACIMIENTO_FUNDADOR = { anio: 2003, mes: 8 };
function edadFundador(hoy = new Date()): number {
  const mes = hoy.getMonth() + 1;
  return hoy.getFullYear() - NACIMIENTO_FUNDADOR.anio - (mes < NACIMIENTO_FUNDADOR.mes ? 1 : 0);
}

const INTRO = [
  "En Videojuegoszaragoza.com nos apasionan los videojuegos y la tecnología. Somos una tienda online de Zaragoza especializada en la compraventa de consolas, videojuegos y electrónica, y en su reparación y mantenimiento, con envíos a toda España.",
  "Nuestro objetivo es que comprar, vender o reparar tecnología de segunda mano sea fácil, seguro y rápido, con la tranquilidad de tratar con profesionales que conocen bien lo que venden.",
];

// El nombre completo sale UNA vez; después, siempre «Daniel Gutiérrez».
const HISTORIA = [
  "Videojuegoszaragoza.com nació en 2022 como una tienda de compraventa de videoconsolas y artículos de electrónica, fundada por Daniel Enrique Gutiérrez Mejía.",
  "A finales de 2023 dimos un paso más y empezamos a ofrecer reparación y mantenimiento. Hoy tenemos una amplia experiencia reparando electrónica de todo tipo: consolas, mandos, móviles, portátiles y PC.",
  "Con todo lo aprendido, también desarrollamos software propio y para otros negocios, algo que seguimos haciendo hoy. Esa misma forma de trabajar, cuidando cada detalle, es la que aplicamos a cada artículo que pasa por nuestras manos.",
];

const QUE_HACEMOS: Punto[] = [
  {
    icono: "swap-horizontal-outline",
    titulo: "Compramos y vendemos",
    texto: "Consolas, videojuegos y electrónica. Si tienes algo que ya no usas, te lo compramos al mejor precio o lo intercambiamos.",
  },
  {
    icono: "construct-outline",
    titulo: "Reparamos y mantenemos",
    texto: "Reparación, limpieza y mantenimiento de consolas, mandos, móviles, portátiles y PC.",
  },
];

// Proceso estándar redactado a petición del dueño (ver cabecera).
const REVISION: Punto[] = [
  {
    icono: "document-text-outline",
    titulo: "1. Procedencia y estado",
    texto: "Comprobamos que la consola tiene una procedencia legal, revisamos su estado exterior y que puede conectarse a sus servicios online.",
  },
  {
    icono: "pulse-outline",
    titulo: "2. Diagnóstico completo",
    texto: "Probamos el encendido, la imagen y el sonido, los puertos HDMI y USB, el wifi y el bluetooth, el lector de discos, el almacenamiento y los mandos.",
  },
  {
    icono: "sparkles-outline",
    titulo: "3. Limpieza a fondo",
    texto: "Limpiamos el exterior y el interior: polvo, ventiladores y rejillas. Si hace falta, renovamos la pasta térmica para que trabaje fresca y silenciosa.",
  },
  {
    icono: "refresh-outline",
    titulo: "4. Datos borrados y sistema al día",
    texto: "Restablecemos la consola de fábrica, borramos cualquier dato del anterior propietario y la actualizamos a la última versión del sistema.",
  },
  {
    icono: "game-controller-outline",
    titulo: "5. Prueba de juego",
    texto: "La ponemos a prueba jugando durante un buen rato para asegurarnos de que no se calienta, no hace ruidos extraños y no se apaga.",
  },
  {
    icono: "cube-outline",
    titulo: "6. Lista para ti",
    texto: "La preparamos y embalamos con cuidado para que te llegue en perfecto estado, con su garantía.",
  },
];

const POR_QUE: Punto[] = [
  {
    icono: "shield-checkmark-outline",
    titulo: "Damos la cara",
    texto: "Nos hacemos responsables de todo lo que compramos y vendemos. Si algo no va bien, lo solucionamos contigo.",
  },
  {
    icono: "chatbubble-ellipses-outline",
    titulo: "Te asesoramos",
    texto: "¿Dudas antes de comprar? Te asesoramos de forma personalizada y rápida para que aciertes a la primera.",
  },
  {
    icono: "ribbon-outline",
    titulo: "1 año de garantía",
    texto: "La mayoría de nuestros artículos tienen 1 año de garantía, salvo que su descripción diga lo contrario.",
  },
  {
    icono: "heart-outline",
    titulo: "Para que vuelvas",
    texto: "Cuidamos cada compra, cada reparación y cada mantenimiento para que tu experiencia sea la mejor y te acuerdes de nosotros.",
  },
];

const VENDER = [
  "Compramos consolas, videojuegos y electrónica: cuéntanos qué tienes desde «Vender mi artículo» y te damos un precio. En Zaragoza, además, lo hacemos en persona: puedes traernos tu artículo al punto que acordemos o vamos nosotros a tu domicilio.",
  "Te pagamos en el momento y como te resulte más cómodo (efectivo, Bizum, transferencia o PayPal) y firmamos un contrato de compraventa para que todo quede claro y por escrito.",
];

const ENTREGAS: Punto[] = [
  {
    icono: "home-outline",
    titulo: "En Zaragoza, el mismo día",
    texto: "Te lo llevamos a casa en el mismo día, o te lo entregamos en mano en Cuarte de Huerva.",
  },
  {
    icono: "map-outline",
    titulo: "A toda España",
    texto: "Sale de nuestro almacén en 1-2 días y llega a destino en 72 horas como máximo.",
  },
];

const HORARIO = [
  { dias: "De lunes a sábado", horas: "10:00 – 14:00 y 17:00 – 19:00" },
  { dias: "Domingos", horas: "10:00 – 13:00" },
];

const BOTONES: { texto: string; ruta: string; icono: IoniconName; principal?: boolean }[] = [
  { texto: "Ver el catálogo", ruta: "/catalogo", icono: "grid-outline", principal: true },
  { texto: "Vender mi artículo", ruta: "/vender", icono: "cash-outline" },
  { texto: "Reparaciones", ruta: "/servicios", icono: "construct-outline" },
  { texto: "Hablar con nosotros", ruta: "/blue-ia", icono: "chatbubbles-outline" },
];

function Titulo({ children }: { children: string }) {
  return (
    <Text
      accessibilityRole="header"
      {...({ "aria-level": 2 } as object)}
      style={{ color: COLORS.text, fontWeight: "900", fontSize: 18, textAlign: "center" }}
    >
      {children}
    </Text>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 16, paddingTop: 26, borderTopWidth: 1, borderTopColor: COLORS.line, alignItems: "center" }}>
      <Titulo>{titulo}</Titulo>
      {children}
    </View>
  );
}

function Parrafos({ textos }: { textos: string[] }) {
  return (
    <>
      {textos.map((t) => (
        <Text key={t} style={{ color: COLORS.muted, fontSize: 15, lineHeight: 23, textAlign: "center", maxWidth: 560 }}>
          {t}
        </Text>
      ))}
    </>
  );
}

// En el ordenador, `columnas` por fila; en el móvil, uno debajo de otro.
function Puntos({ puntos, columnas }: { puntos: Punto[]; columnas: number }) {
  const enFila = columnas > 1;
  return (
    <View
      style={{
        flexDirection: enFila ? "row" : "column",
        flexWrap: enFila ? "wrap" : "nowrap",
        justifyContent: "center",
        rowGap: enFila ? 22 : 18,
        width: "100%",
      }}
    >
      {puntos.map((p) => (
        <View
          key={p.titulo}
          style={{ width: enFila ? `${100 / columnas}%` : "100%", paddingHorizontal: enFila ? 10 : 0, alignItems: "center", gap: 6 }}
        >
          <Ionicons name={p.icono} size={24} color={COLORS.accent} />
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 15.5, textAlign: "center" }}>{p.titulo}</Text>
          <Text style={{ color: COLORS.muted, fontSize: 14.5, lineHeight: 21, textAlign: "center", maxWidth: 420 }}>
            {p.texto}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function QuienesSomosScreen() {
  const { width } = useWindowDimensions();
  const widthSafe = width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const pagePadding = isMobile ? 16 : 24;
  const cols = (n: number) => (isMobile ? 1 : n);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: pagePadding,
          paddingTop: isMobile ? 12 : 14,
          // 96: el final queda por encima del asistente flotante Blue.
          paddingBottom: 96,
        }}
      >
        <View style={{ ...columnStyle, gap: 26 }}>
          <View style={{ alignItems: "center", gap: 14 }}>
            <CabeceraMarca />
            <Text
              accessibilityRole="header"
              {...({ "aria-level": 1 } as object)}
              style={{ color: COLORS.text, fontSize: isMobile ? 24 : 28, fontWeight: "900", textAlign: "center" }}
            >
              Quiénes somos
            </Text>
            {INTRO.map((t, i) => (
              <Text
                key={t}
                style={{
                  color: i === 0 ? COLORS.text : COLORS.muted,
                  fontSize: i === 0 ? 16.5 : 15,
                  lineHeight: i === 0 ? 25 : 23,
                  textAlign: "center",
                  maxWidth: 580,
                }}
              >
                {t}
              </Text>
            ))}
          </View>

          <Seccion titulo="Nuestra historia">
            <Parrafos textos={HISTORIA} />
          </Seccion>

          <Seccion titulo="Quién está detrás">
            <View style={{ alignItems: "center", gap: 4 }}>
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 17 }}>Daniel Gutiérrez</Text>
              <Text style={{ color: COLORS.accent, fontWeight: "800", fontSize: 14 }}>Fundador</Text>
            </View>
            <Parrafos
              textos={[
                `Con ${edadFundador()} años, Daniel Gutiérrez dirige la tienda junto a un equipo de tres profesionales. Entre todos nos encargamos de cada compra, cada venta, cada reparación y de atenderte cuando lo necesites.`,
              ]}
            />
          </Seccion>

          <Seccion titulo="Qué hacemos">
            <Puntos puntos={QUE_HACEMOS} columnas={cols(2)} />
          </Seccion>

          <Seccion titulo="Cómo revisamos cada consola">
            <Parrafos
              textos={["Antes de ponerla a la venta, cada consola de segunda mano pasa por nuestra revisión. Así es como la preparamos:"]}
            />
            <Puntos puntos={REVISION} columnas={cols(3)} />
          </Seccion>

          <Seccion titulo="Por qué elegirnos">
            <Puntos puntos={POR_QUE} columnas={cols(2)} />
          </Seccion>

          <Seccion titulo="¿Quieres vendernos tu consola?">
            <Parrafos textos={VENDER} />
          </Seccion>

          <Seccion titulo="Entregas">
            <Puntos puntos={ENTREGAS} columnas={cols(2)} />
          </Seccion>

          <Seccion titulo="Horario de atención">
            <View style={{ gap: 10 }}>
              {HORARIO.map((h) => (
                <View key={h.dias} style={{ alignItems: "center", gap: 2 }}>
                  <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 15 }}>{h.dias}</Text>
                  <Text style={{ color: COLORS.muted, fontSize: 14.5 }}>{h.horas}</Text>
                </View>
              ))}
            </View>
          </Seccion>

          <Seccion titulo="¿Hablamos?">
            <Parrafos
              textos={["Pregunta lo que quieras a Blue, nuestro asistente, o habla directamente con nosotros por el chat de la tienda. Te respondemos encantados."]}
            />
            <View style={{ width: "100%", maxWidth: 420, gap: 10 }}>
              {BOTONES.map((b) => (
                <Pressable
                  key={b.ruta}
                  accessibilityRole="link"
                  onPress={() => router.push(b.ruta as Href)}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.88 : 1,
                    minHeight: 50,
                    borderRadius: 999,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    paddingHorizontal: 18,
                    backgroundColor: b.principal ? COLORS.accent : "#FFFFFF",
                    borderWidth: b.principal ? 0 : 1.5,
                    borderColor: COLORS.line,
                  })}
                >
                  <Ionicons name={b.icono} size={18} color={b.principal ? "#FFFFFF" : COLORS.accentDark} />
                  <Text style={{ color: b.principal ? "#FFFFFF" : COLORS.text, fontWeight: "900", fontSize: 15 }}>
                    {b.texto}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Seccion>
        </View>
      </ScrollView>
    </View>
  );
}
