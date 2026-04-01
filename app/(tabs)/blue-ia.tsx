import React, { useMemo, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const COLORS = {
  bg: "#071E33",
  bg2: "#061A2C",
  bg3: "#0A2743",
  card: "rgba(255,255,255,0.06)",
  cardSoft: "rgba(255,255,255,0.035)",
  border: "rgba(255,255,255,0.12)",
  borderSoft: "rgba(255,255,255,0.08)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.74)",
  soft: "rgba(255,255,255,0.52)",
  accent: "#00AAE4",
  accentSoft: "rgba(0,170,228,0.16)",
  accentBorder: "rgba(0,170,228,0.34)",
  success: "#22C55E",
  successSoft: "rgba(34,197,94,0.16)",
  successBorder: "rgba(34,197,94,0.28)",
  gold: "#D8B04A",
  goldSoft: "rgba(216,176,74,0.14)",
  goldBorder: "rgba(216,176,74,0.26)",
};

type QuickAction = {
  id: string;
  icon: string;
  title: string;
  desc: string;
};

type Suggestion = {
  id: string;
  text: string;
};

type HelpBlock = {
  id: string;
  title: string;
  desc: string;
  tone: "accent" | "success" | "gold";
};

export default function BlueIAScreen() {
  const [draft, setDraft] = useState("");

  const quickActions = useMemo<QuickAction[]>(
    () => [
      {
        id: "1",
        icon: "🛒",
        title: "Ayúdame a elegir",
        desc: "Te orienta según presupuesto, consola, accesorio o uso real.",
      },
      {
        id: "2",
        icon: "🔁",
        title: "Quiero vender o cambiar",
        desc: "Te guía para valoración, intercambio y siguientes pasos.",
      },
      {
        id: "3",
        icon: "🧰",
        title: "Reparación y limpieza",
        desc: "Te orienta sobre averías, mantenimiento y servicio técnico.",
      },
      {
        id: "4",
        icon: "📦",
        title: "Envíos y garantía",
        desc: "Resuelve dudas sobre envíos, devoluciones y cobertura.",
      },
    ],
    []
  );

  const suggestions = useMemo<Suggestion[]>(
    () => [
      { id: "1", text: "¿Qué PS5 me recomiendas por mi presupuesto?" },
      { id: "2", text: "Quiero vender una Nintendo Switch, ¿cómo lo hago?" },
      { id: "3", text: "¿Cuánto cuesta una limpieza interna de consola?" },
      { id: "4", text: "Busco mando barato y bueno para PS4" },
      { id: "5", text: "¿Aceptáis Klarna o pago a plazos?" },
      { id: "6", text: "Quiero un pack completo para empezar a jugar" },
    ],
    []
  );

  const helpBlocks = useMemo<HelpBlock[]>(
    () => [
      {
        id: "1",
        title: "Compra inteligente",
        desc: "Blue IA puede ayudarte a decidir qué consola, pack o accesorio te conviene de verdad según tu presupuesto y tu tipo de uso.",
        tone: "accent",
      },
      {
        id: "2",
        title: "Venta e intercambio",
        desc: "También puede orientarte sobre cómo vender tus dispositivos o usarlos como parte de pago para reducir el coste de una compra nueva.",
        tone: "success",
      },
      {
        id: "3",
        title: "Soporte y postventa",
        desc: "Úsala para resolver dudas sobre garantía, mantenimiento, limpieza, reparaciones, compatibilidades y recomendaciones de uso.",
        tone: "gold",
      },
    ],
    []
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="light-content" />

      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <LinearGradient
          colors={[
            "rgba(255,255,255,0.18)",
            "rgba(0,170,228,0.08)",
            "rgba(7,30,51,0.00)",
          ]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 280,
          }}
        />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 18,
            paddingBottom: 120,
            gap: 16,
          }}
        >
          <LinearGradient
            colors={[
              "rgba(255,255,255,0.13)",
              "rgba(0,170,228,0.08)",
              "rgba(6,26,44,0.94)",
            ]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{
              borderRadius: 28,
              padding: 1,
            }}
          >
            <View
              style={{
                borderRadius: 27,
                backgroundColor: "rgba(3,18,31,0.92)",
                paddingHorizontal: 18,
                paddingVertical: 18,
                gap: 14,
              }}
            >
              <View
                style={{
                  alignSelf: "flex-start",
                  borderRadius: 999,
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  backgroundColor: COLORS.accentSoft,
                  borderWidth: 1,
                  borderColor: COLORS.accentBorder,
                }}
              >
                <Text style={{ color: "#BAE6FD", fontWeight: "900", fontSize: 12 }}>
                  ASISTENTE INTELIGENTE
                </Text>
              </View>

              <Text
                style={{
                  color: COLORS.text,
                  fontSize: 34,
                  lineHeight: 38,
                  fontWeight: "900",
                  letterSpacing: 0.2,
                }}
              >
                Blue IA
              </Text>

              <Text
                style={{
                  color: COLORS.muted,
                  fontSize: 15,
                  lineHeight: 23,
                  maxWidth: 980,
                }}
              >
                Tu asistente de tienda para resolver dudas, orientarte en compras,
                ayudarte a vender o intercambiar dispositivos y guiarte con soporte,
                mantenimiento y servicios.
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 10,
                  marginTop: 2,
                }}
              >
                <MiniPill text="Productos" tone="accent" />
                <MiniPill text="Soporte" tone="success" />
                <MiniPill text="Intercambios" tone="gold" />
                <MiniPill text="Pago a plazos" tone="accent" />
              </View>
            </View>
          </LinearGradient>

          <LinearGradient
            colors={[
              "rgba(255,255,255,0.10)",
              "rgba(0,170,228,0.06)",
              "rgba(255,255,255,0.02)",
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 24,
              padding: 1,
            }}
          >
            <View
              style={{
                borderRadius: 23,
                backgroundColor: "rgba(6,26,44,0.92)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.06)",
                padding: 14,
                gap: 12,
              }}
            >
              <Text
                style={{
                  color: COLORS.text,
                  fontSize: 20,
                  fontWeight: "900",
                }}
              >
                Pregunta a Blue IA
              </Text>

              <Text
                style={{
                  color: COLORS.muted,
                  lineHeight: 22,
                }}
              >
                Escríbele lo que necesitas y úsala como puerta rápida para comprar
                mejor, vender con criterio o resolver dudas del cliente.
              </Text>

              <View
                style={{
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  padding: 10,
                  gap: 10,
                }}
              >
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Ejemplo: quiero una PS5 con mando y presupuesto de 450€"
                  placeholderTextColor="rgba(255,255,255,0.42)"
                  multiline
                  style={{
                    minHeight: 76,
                    color: COLORS.text,
                    paddingHorizontal: 8,
                    paddingVertical: 8,
                    textAlignVertical: "top",
                  }}
                />

                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 10,
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: COLORS.soft, fontSize: 12 }}>
                    Respuestas orientadas a producto, soporte y atención al cliente.
                  </Text>

                  <Pressable
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.92 : 1,
                      borderRadius: 999,
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      backgroundColor: COLORS.accent,
                      shadowColor: COLORS.accent,
                      shadowOpacity: 0.2,
                      shadowRadius: 12,
                      shadowOffset: { width: 0, height: 2 },
                    })}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
                      Consultar Blue IA
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </LinearGradient>

          <SectionHeader
            title="Accesos rápidos"
            subtitle="Atajos útiles para que esta sección sirva de verdad."
          />

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            {quickActions.map((item) => (
              <QuickActionCard key={item.id} item={item} />
            ))}
          </View>

          <SectionHeader
            title="Preguntas que puede resolver"
            subtitle="Deja visibles casos reales para que el usuario entienda rápido para qué sirve."
          />

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            {suggestions.map((item) => (
              <SuggestionChip
                key={item.id}
                text={item.text}
                onPress={() => setDraft(item.text)}
              />
            ))}
          </View>

          <SectionHeader
            title="Qué hace por el cliente"
            subtitle="No es una sección decorativa: debe ayudar a convertir, filtrar y orientar."
          />

          <View style={{ gap: 12 }}>
            {helpBlocks.map((item) => (
              <HelpCard key={item.id} item={item} />
            ))}
          </View>

          <LinearGradient
            colors={[
              "rgba(255,255,255,0.10)",
              "rgba(0,170,228,0.06)",
              "rgba(255,255,255,0.02)",
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 22,
              padding: 1,
            }}
          >
            <View
              style={{
                borderRadius: 21,
                backgroundColor: "rgba(6,26,44,0.92)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.06)",
                padding: 16,
                gap: 12,
              }}
            >
              <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "900" }}>
                Enfoque recomendado
              </Text>

              <Text style={{ color: COLORS.muted, lineHeight: 22 }}>
                Esta pantalla debe acabar siendo una mezcla entre buscador inteligente,
                centro de ayuda, recomendador de productos y filtro comercial. No solo
                una IA que “habla”, sino una herramienta que empuja a comprar, vender,
                reparar o contactar.
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <MiniPill text="Conversión" tone="accent" />
                <MiniPill text="Soporte útil" tone="success" />
                <MiniPill text="Experiencia premium" tone="gold" />
              </View>
            </View>
          </LinearGradient>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{
          color: "#FFFFFF",
          fontSize: 24,
          fontWeight: "900",
          letterSpacing: 0.2,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          color: "rgba(255,255,255,0.72)",
          lineHeight: 22,
        }}
      >
        {subtitle}
      </Text>
    </View>
  );
}

function MiniPill({
  text,
  tone,
}: {
  text: string;
  tone: "accent" | "success" | "gold";
}) {
  const palette =
    tone === "accent"
      ? {
          bg: COLORS.accentSoft,
          border: COLORS.accentBorder,
          text: "#BAE6FD",
        }
      : tone === "success"
        ? {
            bg: COLORS.successSoft,
            border: COLORS.successBorder,
            text: "#BBF7D0",
          }
        : {
            bg: COLORS.goldSoft,
            border: COLORS.goldBorder,
            text: "#FDE68A",
          };

  return (
    <View
      style={{
        borderRadius: 999,
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: palette.bg,
        borderWidth: 1,
        borderColor: palette.border,
      }}
    >
      <Text style={{ color: palette.text, fontWeight: "900", fontSize: 12 }}>
        {text}
      </Text>
    </View>
  );
}

function QuickActionCard({ item }: { item: QuickAction }) {
  return (
    <Pressable
      style={({ pressed }) => ({
        opacity: pressed ? 0.94 : 1,
        flexBasis: 260,
        flexGrow: 1,
      })}
    >
      <LinearGradient
        colors={[
          "rgba(255,255,255,0.10)",
          "rgba(0,170,228,0.06)",
          "rgba(255,255,255,0.02)",
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 22,
          padding: 1,
        }}
      >
        <View
          style={{
            borderRadius: 21,
            backgroundColor: "rgba(6,26,44,0.90)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.06)",
            padding: 16,
            gap: 10,
            minHeight: 148,
          }}
        >
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
            }}
          >
            <Text style={{ fontSize: 22 }}>{item.icon}</Text>
          </View>

          <Text
            style={{
              color: COLORS.text,
              fontSize: 18,
              fontWeight: "900",
            }}
          >
            {item.title}
          </Text>

          <Text
            style={{
              color: COLORS.muted,
              lineHeight: 21,
            }}
          >
            {item.desc}
          </Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function SuggestionChip({
  text,
  onPress,
}: {
  text: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <View
        style={{
          borderRadius: 999,
          paddingVertical: 12,
          paddingHorizontal: 14,
          backgroundColor: "rgba(255,255,255,0.05)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
          maxWidth: 420,
        }}
      >
        <Text
          style={{
            color: COLORS.text,
            fontWeight: "800",
            lineHeight: 20,
          }}
        >
          {text}
        </Text>
      </View>
    </Pressable>
  );
}

function HelpCard({ item }: { item: HelpBlock }) {
  const palette =
    item.tone === "accent"
      ? {
          line: COLORS.accent,
          bg: "rgba(0,170,228,0.08)",
          border: "rgba(0,170,228,0.20)",
        }
      : item.tone === "success"
        ? {
            line: COLORS.success,
            bg: "rgba(34,197,94,0.08)",
            border: "rgba(34,197,94,0.20)",
          }
        : {
            line: COLORS.gold,
            bg: "rgba(216,176,74,0.08)",
            border: "rgba(216,176,74,0.20)",
          };

  return (
    <View
      style={{
        borderRadius: 20,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.bg,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          height: 3,
          backgroundColor: palette.line,
        }}
      />

      <View
        style={{
          padding: 16,
          gap: 8,
        }}
      >
        <Text
          style={{
            color: COLORS.text,
            fontSize: 18,
            fontWeight: "900",
          }}
        >
          {item.title}
        </Text>

        <Text
          style={{
            color: COLORS.muted,
            lineHeight: 22,
          }}
        >
          {item.desc}
        </Text>
      </View>
    </View>
  );
}