/**
 * app/(tabs)/blue-ia.tsx
 *
 * Qué hace: pantalla "Blue IA", el asistente de la tienda. Ya no es solo
 * maqueta: escribir una pregunta (o tocar una de las tarjetas rápidas) la
 * manda de verdad a un modelo de IA real (OpenAI, a través de
 * api/blue-ia.ts) y la respuesta aparece como una conversación tipo chat,
 * con burbujas de pregunta y respuesta una debajo de otra.
 *
 * Cómo funciona:
 * - El navegador nunca habla directamente con OpenAI (la clave es secreta):
 *   handleAsk() manda un POST a /api/blue-ia con la pregunta y las últimas
 *   vueltas de la conversación; esa función serverless añade contexto real
 *   del catálogo (Supabase) y devuelve solo el texto de la respuesta. Ver
 *   api/blue-ia.ts para el prompt exacto y las variables de entorno que
 *   necesita (sobre todo OPENAI_API_KEY en Vercel).
 * - La conversación vive solo en el estado de esta pantalla (useState): no
 *   se guarda en Supabase ni sobrevive a recargar la página — es un asistente
 *   de sesión, no un historial permanente como el Chat Global.
 * - Las 4 tarjetas rápidas (quickActions) tienen cada una su propia pregunta
 *   ya escrita: tocarlas la manda directamente a Blue IA, como si el usuario
 *   la hubiera escrito él mismo. Las preguntas frecuentes (suggestions) solo
 *   rellenan el cuadro de texto, para que el usuario pueda tocarla o
 *   editarla antes de enviar.
 * - BLUE_IA_API_URL es relativa ("/api/blue-ia") en web, porque ahí Vercel
 *   sirve la función serverless en el mismo dominio que la app. Esto solo
 *   funciona una vez desplegado en Vercel (no en `expo start --web` local,
 *   que no tiene funciones serverless).
 *
 * Conectado con:
 * - api/blue-ia.ts → el backend real de este asistente.
 * - components/PromoBanner.tsx → franja "Te compramos tu consola..." fija
 *   arriba del todo (misma franja que en el resto de pestañas).
 * - components/VenderAhoraModal.tsx → formulario que abre el botón "Vender
 *   Ya" de esa franja (sí usa lib/supabase.ts, para guardar la solicitud).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import PromoBanner from "../../components/PromoBanner";
import VenderAhoraModal from "../../components/VenderAhoraModal";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

// En web, Vercel sirve api/blue-ia.ts en el mismo dominio que la app, así
// que una ruta relativa basta. Fuera de web (una build nativa futura) no
// hay "dominio actual" al que apuntar una ruta relativa, así que se usa la
// URL completa de producción.
const BLUE_IA_API_URL =
  Platform.OS === "web" ? "/api/blue-ia" : "https://videojuegoszaragoza.com/api/blue-ia";

const MAX_QUESTION_LENGTH = 500;

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  bg3: "#F6FAFD",
  card: "#EAF6FD",
  cardSoft: "#F8FBFE",
  border: "#E3EAF2",
  borderSoft: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  soft: "rgba(11,33,56,0.48)",
  accent: "#1EA7E8",
  accentSoft: "#EAF6FD",
  accentBorder: "#BEE6FA",
  success: "#22C55E",
  successSoft: "#DCFCE7",
  successBorder: "#86EFAC",
  gold: "#B8860B",
  goldSoft: "#FBF3E0",
  goldBorder: "#F0DFB0",
  danger: "#DC2626",
  dangerSoft: "#FDECEC",
  dangerBorder: "#F5B5B5",
};

type QuickAction = {
  id: string;
  icon: IoniconName;
  title: string;
  desc: string;
  // Pregunta real que se manda a Blue IA al tocar la tarjeta — el usuario
  // no tiene que escribir nada, la tarjeta "pregunta por él".
  prompt: string;
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

type BlueIAMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  isError?: boolean;
};

const WELCOME_MESSAGE: BlueIAMessage = {
  id: "welcome",
  role: "assistant",
  text:
    "Hola, soy Blue IA. Pregúntame lo que necesites sobre productos, ventas, cambios, reparaciones o pago a plazos — o toca una de las opciones rápidas de abajo.",
};

export default function BlueIAScreen() {
  const [draft, setDraft] = useState("");
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [messages, setMessages] = useState<BlueIAMessage[]>([WELCOME_MESSAGE]);
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Copia siempre al día de messages, para poder mandar el historial real a
  // la API sin que handleAsk quede "atado" al estado del momento en que se
  // creó (evita mandar una conversación desactualizada si se piden varias
  // cosas seguidas).
  const messagesRef = useRef<BlueIAMessage[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const quickActions = useMemo<QuickAction[]>(
    () => [
      {
        id: "1",
        icon: "game-controller-outline",
        title: "Ayúdame a elegir",
        desc: "Dime tu presupuesto y te recomiendo lo que mejor te encaja.",
        prompt:
          "Quiero que me ayudes a elegir un producto. Pregúntame lo que necesites saber (presupuesto, qué busco, para qué lo quiero) antes de recomendarme algo.",
      },
      {
        id: "2",
        icon: "cash-outline",
        title: "Quiero vender",
        desc: "Te explico cómo vender tu consola, móvil o accesorio.",
        prompt: "Quiero vender un dispositivo. ¿Cómo funciona el proceso?",
      },
      {
        id: "3",
        icon: "swap-horizontal-outline",
        title: "Quiero cambiar",
        desc: "Te ayudo si quieres entregar algo como parte de pago.",
        prompt:
          "Quiero entregar un dispositivo como parte de pago para otra compra. ¿Cómo funciona?",
      },
      {
        id: "4",
        icon: "construct-outline",
        title: "Reparación o limpieza",
        desc: "Resuelvo dudas sobre averías, mantenimiento y servicios.",
        prompt: "Tengo una duda sobre reparación o limpieza de mi dispositivo. ¿Me puedes ayudar?",
      },
    ],
    []
  );

  const suggestions = useMemo<Suggestion[]>(
    () => [
      { id: "1", text: "Quiero una PS5 por unos 450€" },
      { id: "2", text: "Tengo una Nintendo Switch para vender" },
      { id: "3", text: "¿Cuánto cuesta limpiar una consola?" },
      { id: "4", text: "Busco un mando bueno y barato para PS4" },
      { id: "5", text: "¿Puedo pagar a plazos?" },
      { id: "6", text: "Quiero un pack completo para empezar a jugar" },
    ],
    []
  );

  const helpBlocks = useMemo<HelpBlock[]>(
    () => [
      {
        id: "1",
        title: "Te ayuda a comprar mejor",
        desc: "Si no sabes qué elegir, Blue IA te orienta según lo que buscas, el dinero que quieres gastar y el tipo de uso que le vas a dar.",
        tone: "accent",
      },
      {
        id: "2",
        title: "Te orienta si quieres vender o cambiar",
        desc: "También puede ayudarte si quieres vender tu dispositivo o usarlo como parte de pago para abaratar otra compra.",
        tone: "success",
      },
      {
        id: "3",
        title: "Resuelve dudas de soporte",
        desc: "Puedes usarla para preguntar por garantía, compatibilidades, limpieza, reparaciones, mantenimiento o dudas generales de la tienda.",
        tone: "gold",
      },
    ],
    []
  );

  // Único punto por el que sale cualquier pregunta hacia Blue IA: lo llaman
  // tanto el botón "Consultar Blue IA" (con el texto del cuadro) como las 4
  // tarjetas rápidas (con su propia pregunta ya escrita).
  const handleAsk = useCallback(
    async (rawText?: string) => {
      const clean = (rawText ?? draft).trim();
      if (!clean || sending) return;

      if (clean.length > MAX_QUESTION_LENGTH) {
        setErrorText(`Escribe una pregunta más corta (máximo ${MAX_QUESTION_LENGTH} caracteres).`);
        return;
      }

      setErrorText(null);

      const historyForApi = messagesRef.current
        .filter((m) => m.id !== WELCOME_MESSAGE.id && !m.isError)
        .map((m) => ({ role: m.role, text: m.text }));

      const userMessage: BlueIAMessage = {
        id: `${Date.now()}-u`,
        role: "user",
        text: clean,
      };
      setMessages((prev) => [...prev, userMessage]);
      setDraft("");
      setSending(true);

      try {
        const response = await fetch(BLUE_IA_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: clean, history: historyForApi }),
        });

        const data = await response.json().catch(() => null);

        if (!response.ok || !data?.reply) {
          throw new Error(data?.error || "Blue IA no ha podido responder.");
        }

        setMessages((prev) => [
          ...prev,
          { id: `${Date.now()}-a`, role: "assistant", text: String(data.reply) },
        ]);
      } catch (e: any) {
        console.error("Error consultando a Blue IA:", e);
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-err`,
            role: "assistant",
            text: "No he podido responder ahora mismo. Inténtalo de nuevo en unos segundos.",
            isError: true,
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [draft, sending]
  );

  const hasConversation = messages.length > 1 || sending;

  return (
    <>
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      <PromoBanner onPressVender={() => setSellModalOpen(true)} />

      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <LinearGradient
          colors={[
            "rgba(30,167,232,0.14)",
            "rgba(0,170,228,0.08)",
            "rgba(255,255,255,0)",
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
            alignItems: "center",
          }}
        >
          {/* Columna centrada: no se pega a la izquierda en pantallas anchas */}
          <View style={{ width: "100%", maxWidth: 1040, gap: 16 }}>
          <LinearGradient
            colors={[
              "rgba(30,167,232,0.10)",
              "rgba(0,170,228,0.08)",
              "#F4F9FD",
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
                backgroundColor: "#FFFFFF",
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
                <Text style={{ color: "#0F8FCC", fontWeight: "900", fontSize: 12 }}>
                  AYUDA RÁPIDA
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
                Tu asistente para resolver dudas sobre productos, compras, ventas,
                cambios, reparaciones, limpieza, envíos y mucho más.
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
                <MiniPill text="Ventas" tone="success" />
                <MiniPill text="Cambios" tone="gold" />
                <MiniPill text="Pago a plazos" tone="accent" />
              </View>
            </View>
          </LinearGradient>

          <LinearGradient
            colors={[
              "#E3EAF2",
              "rgba(0,170,228,0.06)",
              "rgba(30,167,232,0.02)",
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
                backgroundColor: "#FFFFFF",
                borderWidth: 1,
                borderColor: "#EAF6FD",
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
                Escribe tu duda
              </Text>

              <Text
                style={{
                  color: COLORS.muted,
                  lineHeight: 22,
                }}
              >
                Pregunta lo que necesites y Blue IA te orientará de forma rápida y clara.
              </Text>

              <View
                style={{
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: "#E3EAF2",
                  backgroundColor: "#F8FBFE",
                  padding: 10,
                  gap: 10,
                }}
              >
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Escribe tu consulta, por ejemplo una PS5 con mando y presupuesto de 450€"
                  placeholderTextColor="rgba(11,33,56,0.35)"
                  editable={!sending}
                  multiline
                  style={{
                    minHeight: 76,
                    color: COLORS.text,
                    paddingHorizontal: 8,
                    paddingVertical: 8,
                    textAlignVertical: "top",
                    opacity: sending ? 0.6 : 1,
                  }}
                />

                {!!errorText && (
                  <View
                    style={{
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: COLORS.dangerBorder,
                      backgroundColor: COLORS.dangerSoft,
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                    }}
                  >
                    <Text style={{ color: "#B91C1C", fontWeight: "800", fontSize: 12 }}>
                      {errorText}
                    </Text>
                  </View>
                )}

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
                    Puedes preguntar por compras, ventas, cambios, limpieza o soporte.
                  </Text>

                  <Pressable
                    onPress={() => handleAsk()}
                    disabled={sending || !draft.trim()}
                    style={({ pressed }) => ({
                      opacity: sending || !draft.trim() ? 0.6 : pressed ? 0.92 : 1,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
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
                    {sending && <ActivityIndicator size="small" color="#FFFFFF" />}
                    <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
                      {sending ? "Consultando…" : "Consultar Blue IA"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </LinearGradient>

          {hasConversation && (
            <View
              style={{
                borderRadius: 22,
                borderWidth: 1,
                borderColor: COLORS.borderSoft,
                backgroundColor: COLORS.bg3,
                padding: 14,
                gap: 12,
              }}
            >
              <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: "900" }}>
                Conversación con Blue IA
              </Text>

              <View style={{ gap: 10 }}>
                {messages.map((message) => (
                  <BlueIABubble key={message.id} message={message} />
                ))}
                {sending && <BlueIATypingBubble />}
              </View>
            </View>
          )}

          <SectionHeader
            title="¿En qué te puede ayudar?"
            subtitle="Toca una opción rápida para resolverlo de forma directa y eficiente."
          />

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            {quickActions.map((item) => (
              <QuickActionCard
                key={item.id}
                item={item}
                disabled={sending}
                onPress={() => handleAsk(item.prompt)}
              />
            ))}
          </View>

          <SectionHeader
            title="Preguntas frecuentes"
            subtitle="Pulsa una y se copiará arriba para ayudarte más rápido."
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
            title="Lo que puedes hacer aquí"
            subtitle="Blue IA te ayuda antes, durante y después de la compra."
          />

          <View style={{ gap: 12 }}>
            {helpBlocks.map((item) => (
              <HelpCard key={item.id} item={item} />
            ))}
          </View>

          <LinearGradient
            colors={[
              "#E3EAF2",
              "rgba(0,170,228,0.06)",
              "rgba(30,167,232,0.02)",
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
                backgroundColor: "#FFFFFF",
                borderWidth: 1,
                borderColor: "#EAF6FD",
                padding: 16,
                gap: 12,
              }}
            >
              <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "900" }}>
                Respuestas rápidas y claras
              </Text>

              <Text style={{ color: COLORS.muted, lineHeight: 22 }}>
                Encuentra ayuda sin perder tiempo. Si tienes dudas sobre una compra, una
                venta, una reparación o un envío, Blue IA te orienta de forma sencilla.
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <MiniPill text="Compra mejor" tone="accent" />
                <MiniPill text="Resuelve dudas" tone="success" />
                <MiniPill text="Ayuda rápida" tone="gold" />
              </View>
            </View>
          </LinearGradient>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>

    <VenderAhoraModal visible={sellModalOpen} onClose={() => setSellModalOpen(false)} />
    </>
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
          color: "#0B2138",
          fontSize: 24,
          fontWeight: "900",
          letterSpacing: 0.2,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          color: "rgba(11,33,56,0.60)",
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
          text: "#0F8FCC",
        }
      : tone === "success"
        ? {
            bg: COLORS.successSoft,
            border: COLORS.successBorder,
            text: "#15803D",
          }
        : {
            bg: COLORS.goldSoft,
            border: COLORS.goldBorder,
            text: "#92660B",
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

// Burbuja de conversación: a la derecha y en azul si la escribió el usuario,
// a la izquierda con un icono si la respondió Blue IA. Un error de red se ve
// igual que una respuesta normal pero con un aviso en rojo debajo, para no
// mezclar el tono de "algo falló" con el resto de la conversación.
function BlueIABubble({ message }: { message: BlueIAMessage }) {
  const mine = message.role === "user";

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: mine ? "flex-end" : "flex-start",
        alignItems: "flex-end",
        gap: 8,
      }}
    >
      {!mine && (
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: COLORS.accentSoft,
            borderWidth: 1,
            borderColor: COLORS.accentBorder,
          }}
        >
          <Ionicons name="sparkles-outline" size={14} color={COLORS.accent} />
        </View>
      )}

      <View
        style={{
          maxWidth: "82%",
          borderRadius: 18,
          borderWidth: 1,
          borderColor: message.isError
            ? COLORS.dangerBorder
            : mine
              ? "rgba(0,170,228,0.22)"
              : "#E3EAF2",
          backgroundColor: message.isError
            ? COLORS.dangerSoft
            : mine
              ? "rgba(0,170,228,0.16)"
              : "#F1F6FA",
          paddingVertical: 10,
          paddingHorizontal: 14,
        }}
      >
        <Text
          style={{
            color: message.isError ? "#B91C1C" : COLORS.text,
            lineHeight: 21,
          }}
        >
          {message.text}
        </Text>
      </View>
    </View>
  );
}

// "Blue IA está escribiendo…" mientras se espera la respuesta del servidor.
function BlueIATypingBubble() {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: COLORS.accentSoft,
          borderWidth: 1,
          borderColor: COLORS.accentBorder,
        }}
      >
        <Ionicons name="sparkles-outline" size={14} color={COLORS.accent} />
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: "#E3EAF2",
          backgroundColor: "#F1F6FA",
          paddingVertical: 10,
          paddingHorizontal: 14,
        }}
      >
        <ActivityIndicator size="small" color={COLORS.accent} />
        <Text style={{ color: COLORS.muted, fontSize: 13 }}>Blue IA está escribiendo…</Text>
      </View>
    </View>
  );
}

function QuickActionCard({
  item,
  disabled,
  onPress,
}: {
  item: QuickAction;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        opacity: disabled ? 0.6 : pressed ? 0.94 : 1,
        flexBasis: 260,
        flexGrow: 1,
      })}
    >
      <LinearGradient
        colors={[
          "#E3EAF2",
          "rgba(0,170,228,0.06)",
          "rgba(30,167,232,0.02)",
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
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: "#EAF6FD",
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
              backgroundColor: "#EAF6FD",
              borderWidth: 1,
              borderColor: "#E3EAF2",
            }}
          >
            <Ionicons name={item.icon} size={22} color={COLORS.text} />
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
          backgroundColor: "#F6FAFD",
          borderWidth: 1,
          borderColor: "#E3EAF2",
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
