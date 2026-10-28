// app/quienes-somos.tsx
/**
 * Qué hace: página «Quiénes somos»: quién está detrás de la tienda, qué hacemos, cómo trabajamos, cómo
 * entregamos y cuándo atendemos, con botones para dar el siguiente paso (catálogo, vender, servicios, hablar).
 *
 * Reglas del contenido (lecciones «No inventar datos del negocio» y «Solo se menciona lo que existe»): cada
 * frase sale de lo que ha dicho el dueño (Marca y SEO, «Lo que Blue sabe», la descripción fija de los artículos,
 * entregas y plazos del 2026-10-28). La tienda es SOLO ONLINE: no hay tienda física y no se publica ninguna
 * dirección (el domicilio fiscal solo va en los textos legales). La historia y el equipo los escribe el dueño:
 * mientras HISTORIA y EQUIPO estén vacíos, esas partes no salen.
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

// Lo escribe el dueño (cómo empezó, desde cuándo, qué nos diferencia). Vacío = no sale.
const HISTORIA: string[] = [];
// Quién está detrás y qué hace cada uno. Vacío = no sale.
const EQUIPO: { nombre: string; papel: string }[] = [];

const QUE_HACEMOS: Punto[] = [
  {
    icono: "swap-horizontal-outline",
    titulo: "Compramos y vendemos",
    texto: "Consolas, videojuegos y electrónica. Si tienes algo que ya no usas, te lo compramos al mejor precio o lo intercambiamos.",
  },
  {
    icono: "construct-outline",
    titulo: "Reparamos y mantenemos",
    texto: "Reparación, limpieza y mantenimiento de consolas y dispositivos.",
  },
];

const COMO_TRABAJAMOS: Punto[] = [
  {
    icono: "checkmark-done-outline",
    titulo: "Probado antes de entregarlo",
    texto: "Cada artículo se prueba y se testea antes de entregarlo o enviarlo.",
  },
  {
    icono: "sparkles-outline",
    titulo: "Limpio y a punto",
    texto: "Lo limpiamos para que te llegue en un estado impecable.",
  },
  {
    icono: "shield-checkmark-outline",
    titulo: "1 año de garantía",
    texto: "La mayoría de nuestros artículos tienen 1 año de garantía, salvo que su descripción diga lo contrario.",
  },
];

const ENTREGAS: Punto[] = [
  {
    icono: "home-outline",
    titulo: "En Zaragoza, el mismo día",
    texto: "Te lo llevamos a casa en el mismo día, o te lo entregamos en mano en Cuarte de Huerva.",
  },
  {
    icono: "cube-outline",
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

function Puntos({ puntos, enFila }: { puntos: Punto[]; enFila: boolean }) {
  return (
    <View style={{ flexDirection: enFila ? "row" : "column", gap: enFila ? 24 : 18, width: "100%" }}>
      {puntos.map((p) => (
        <View key={p.titulo} style={{ flex: enFila ? 1 : undefined, alignItems: "center", gap: 6 }}>
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
            <Text style={{ color: COLORS.muted, fontSize: 16, lineHeight: 24, textAlign: "center", maxWidth: 560 }}>
              Somos Videojuegoszaragoza.com, una tienda online de Zaragoza: compramos y vendemos consolas, videojuegos
              y electrónica, y los reparamos y mantenemos. Enviamos a toda España.
            </Text>
          </View>

          {HISTORIA.length > 0 && (
            <Seccion titulo="Nuestra historia">
              {HISTORIA.map((parrafo) => (
                <Text
                  key={parrafo}
                  style={{ color: COLORS.muted, fontSize: 15, lineHeight: 23, textAlign: "center", maxWidth: 560 }}
                >
                  {parrafo}
                </Text>
              ))}
            </Seccion>
          )}

          {EQUIPO.length > 0 && (
            <Seccion titulo="Quién está detrás">
              <View style={{ flexDirection: isMobile ? "column" : "row", gap: 18, justifyContent: "center" }}>
                {EQUIPO.map((persona) => (
                  <View key={persona.nombre} style={{ alignItems: "center", gap: 4 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>{persona.nombre}</Text>
                    <Text style={{ color: COLORS.muted, fontSize: 14.5, textAlign: "center" }}>{persona.papel}</Text>
                  </View>
                ))}
              </View>
            </Seccion>
          )}

          <Seccion titulo="Qué hacemos">
            <Puntos puntos={QUE_HACEMOS} enFila={!isMobile} />
          </Seccion>

          <Seccion titulo="Cómo trabajamos">
            <Puntos puntos={COMO_TRABAJAMOS} enFila={!isMobile} />
          </Seccion>

          <Seccion titulo="Entregas">
            <Puntos puntos={ENTREGAS} enFila={!isMobile} />
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
            <Text style={{ color: COLORS.muted, fontSize: 15, lineHeight: 22, textAlign: "center", maxWidth: 480 }}>
              Pregunta lo que quieras a Blue, nuestro asistente, o habla directamente con nosotros por el chat de la tienda.
            </Text>
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
