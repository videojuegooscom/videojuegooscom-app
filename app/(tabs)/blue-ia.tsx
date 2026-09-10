/**
 * app/(tabs)/blue-ia.tsx
 *
 * Qué hace: pantalla "Blue IA", el asistente de la tienda. Ahora es una
 * conversación de pantalla completa, estilo ChatGPT, con el mismo lenguaje
 * visual que usa "Chat Global" (app/(tabs)/chat-global.tsx): los mensajes
 * ocupan toda la pantalla, hay un compositor fijo abajo del todo con un
 * cuadro de texto redondeado + botón circular de enviar, y no hay ninguna
 * tarjeta grande de bienvenida estorbando — esa información (qué es Blue
 * IA y para qué sirve) vive en un modal accesible con el icono "ⓘ" de
 * arriba a la derecha, igual que en Chat Global.
 *
 * Cómo funciona:
 * - El navegador nunca habla directamente con OpenAI (la clave es secreta):
 *   handleAsk() manda un POST a /api/blue-ia con la pregunta y las últimas
 *   vueltas de la conversación; esa función serverless añade contexto real
 *   del catálogo (Supabase) y devuelve el texto de la respuesta junto con,
 *   si encaja, una lista de "socialChips" (redes sociales activas a
 *   mostrar como botones — ver más abajo BlueIASocialChips). Ver
 *   api/blue-ia.ts para el prompt exacto y las variables de entorno que
 *   necesita (sobre todo OPENAI_API_KEY en Vercel).
 * - La conversación vive solo en el estado de esta pantalla (useState): no
 *   se guarda en Supabase ni sobrevive a recargar la página — es un asistente
 *   de sesión, no un historial permanente como el Chat Global.
 * - Las respuestas de Blue IA nunca traen enlaces ni markdown escrito por el
 *   modelo (antes se veía feo, tipo "[texto](url)", porque este texto se
 *   pinta en un <Text> normal sin ningún intérprete de markdown): cuando la
 *   respuesta habla de seguir a la tienda en redes sociales, el servidor
 *   manda aparte "socialChips" con los datos limpios de cada red activa que
 *   encaje, y BlueIABubble los pinta como una fila de botones de verdad con
 *   su icono — nunca como texto suelto.
 * - Las "sugerencias rápidas" (antes eran 4 tarjetas grandes) ahora son una
 *   fila de chips que se desliza en horizontal justo ENCIMA del compositor,
 *   y solo se ven antes de la primera pregunta (antes de que haya
 *   conversación de verdad) — exactamente igual que las sugerencias
 *   iniciales de ChatGPT: en cuanto se manda la primera pregunta,
 *   desaparecen para dejarle todo el sitio a la conversación. Tocar una
 *   sugerencia manda esa pregunta directamente, como si el usuario la
 *   hubiera escrito él mismo.
 * - "Preguntas frecuentes" ya NO vive aquí: se movió a la portada (Inicio),
 *   entre reseñas y el pie de página (ver app/(tabs)/index.tsx). Desde ahí,
 *   tocar una pregunta frecuente trae a la persona directamente a esta
 *   pantalla con esa pregunta ya enviada — se detecta con el parámetro de
 *   navegación "q" (useLocalSearchParams) y se manda automáticamente una
 *   sola vez al entrar.
 * - BLUE_IA_API_URL es relativa ("/api/blue-ia") en web, porque ahí Vercel
 *   sirve la función serverless en el mismo dominio que la app. Esto solo
 *   funciona una vez desplegado en Vercel (no en `expo start --web` local,
 *   que no tiene funciones serverless).
 *
 * Conectado con:
 * - api/blue-ia.ts → el backend real de este asistente (prompt + selección
 *   de qué redes sociales mandar como "socialChips").
 * - app/(tabs)/index.tsx → la sección "Preguntas frecuentes" de Inicio
 *   enlaza aquí con "/blue-ia?q=..." para preguntar directamente.
 * - components/PromoBanner.tsx → franja "Te compramos tu consola..." fija
 *   arriba del todo (misma franja que en el resto de pestañas).
 * - components/VenderAhoraModal.tsx → formulario que abre el botón "Vender
 *   Ya" de esa franja (sí usa lib/supabase.ts, para guardar la solicitud).
 */
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import PromoBanner from "../../components/PromoBanner";
import VenderAhoraModal from "../../components/VenderAhoraModal";
import { openExternalLink } from "../../lib/openExternalLink";

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
  overlay: "rgba(3,10,18,0.76)",
};

type QuickAction = {
  id: string;
  icon: IoniconName;
  title: string;
  // Pregunta real que se manda a Blue IA al tocar la sugerencia — el
  // usuario no tiene que escribir nada, la sugerencia "pregunta por él".
  prompt: string;
};

type HelpBlock = {
  id: string;
  title: string;
  desc: string;
  tone: "accent" | "success" | "gold";
};

// Un "chip" de red social que puede venir pegado a una respuesta de Blue IA
// (ver api/blue-ia.ts → pickSocialChips) — datos limpios, nunca texto: el
// enlace real lo abre BlueIASocialChips, nunca aparece escrito en el mensaje.
type SocialChip = { platform: string; label: string; href: string };

type BlueIAMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  isError?: boolean;
  socialChips?: SocialChip[];
};

const WELCOME_MESSAGE: BlueIAMessage = {
  id: "welcome",
  role: "assistant",
  text:
    "Hola, soy Blue IA. Pregúntame lo que necesites sobre productos, ventas, cambios, reparaciones o pago a plazos — o toca una de las sugerencias de abajo.",
};

// Icono + color de marca por plataforma, para pintar los "socialChips" que
// puede traer una respuesta de Blue IA. Deliberadamente duplicado del mapa
// de components/SocialLinks.tsx (mismo motivo que ya se explica ahí y en
// api/blue-ia.ts: cada archivo vive en su propio mundo — este es pantalla,
// aquel es un componente compartido, y api/blue-ia.ts es una función
// serverless aparte — así que mantenerlo en tres sitios pequeños es más
// simple que forzar una importación cruzada solo para un mapa de iconos).
const SOCIAL_CHIP_ICONS: Record<
  string,
  { render: (color: string, size: number) => React.ReactNode; color: string }
> = {
  instagram: {
    render: (color, size) => <Ionicons name="logo-instagram" size={size} color={color} />,
    color: "#C1327A",
  },
  tiktok: {
    render: (color, size) => <MaterialIcons name="tiktok" size={size} color={color} />,
    color: "#0B2138",
  },
  whatsapp: {
    render: (color, size) => <Ionicons name="logo-whatsapp" size={size} color={color} />,
    color: "#1F9E52",
  },
  youtube: {
    render: (color, size) => <Ionicons name="logo-youtube" size={size} color={color} />,
    color: "#D6291D",
  },
  gmail: {
    render: (color, size) => <MaterialCommunityIcons name="gmail" size={size} color={color} />,
    color: "#C5382B",
  },
  apple_maps: {
    render: (color, size) => <Ionicons name="logo-apple" size={size} color={color} />,
    color: "#0B2138",
  },
  facebook_marketplace: {
    render: (color, size) => <Ionicons name="logo-facebook" size={size} color={color} />,
    color: "#1461D2",
  },
  wallapop: {
    render: (color, size) => (
      <Text style={{ color, fontWeight: "900", fontSize: Math.round(size * 0.75) }}>W</Text>
    ),
    color: "#00C298",
  },
  vinted: {
    render: (color, size) => (
      <Text style={{ color, fontWeight: "900", fontSize: Math.round(size * 0.75) }}>V</Text>
    ),
    color: "#09B1BA",
  },
};

function openSocialChip(href: string) {
  try {
    // Síncrono a propósito — ver la nota de components/SocialLinks.tsx: el
    // truco de abrir en Chrome (lib/openExternalLink.ts) necesita ocurrir
    // dentro del mismo toque del usuario.
    openExternalLink(href);
  } catch {
    // Silencioso: un enlace mal formado no debe romper la conversación.
  }
}

export default function BlueIAScreen() {
  const params = useLocalSearchParams<{ q?: string }>();

  const [draft, setDraft] = useState("");
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [messages, setMessages] = useState<BlueIAMessage[]>([WELCOME_MESSAGE]);
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const scrollRef = useRef<ScrollView | null>(null);
  const autoAskedRef = useRef(false);

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
        prompt:
          "Quiero que me ayudes a elegir un producto. Pregúntame lo que necesites saber (presupuesto, qué busco, para qué lo quiero) antes de recomendarme algo.",
      },
      {
        id: "2",
        icon: "cash-outline",
        title: "Quiero vender",
        prompt: "Quiero vender un dispositivo. ¿Cómo funciona el proceso?",
      },
      {
        id: "3",
        icon: "swap-horizontal-outline",
        title: "Quiero cambiar",
        prompt:
          "Quiero entregar un dispositivo como parte de pago para otra compra. ¿Cómo funciona?",
      },
      {
        id: "4",
        icon: "construct-outline",
        title: "Reparación o limpieza",
        prompt: "Tengo una duda sobre reparación o limpieza de mi dispositivo. ¿Me puedes ayudar?",
      },
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
  // el compositor de abajo, las sugerencias rápidas y el autoenvío al
  // llegar desde "Preguntas frecuentes" de Inicio.
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
          // data?.error viene de nuestra propia api/blue-ia.ts (límite de
          // peticiones, origen no permitido, falta la clave de OpenAI...) y
          // ya está escrito para que la persona lo lea tal cual — se marca
          // con isApiError para poder distinguirlo abajo de un fallo de red
          // real (donde e.message trae texto técnico en inglés, no apto
          // para mostrar).
          const err: any = new Error(data?.error || "Blue IA no ha podido responder.");
          err.isApiError = true;
          throw err;
        }

        // socialChips es opcional: solo viene cuando api/blue-ia.ts decide
        // que la respuesta encaja con alguna red social activa (ver
        // pickSocialChips ahí) — se pintan como botones aparte, nunca como
        // texto dentro de la respuesta.
        const socialChips: SocialChip[] | undefined = Array.isArray(data.socialChips)
          ? data.socialChips
          : undefined;

        setMessages((prev) => [
          ...prev,
          { id: `${Date.now()}-a`, role: "assistant", text: String(data.reply), socialChips },
        ]);
      } catch (e: any) {
        console.error("Error consultando a Blue IA:", e);
        const friendlyText =
          e?.isApiError && typeof e.message === "string" && e.message
            ? e.message
            : "No he podido responder ahora mismo. Inténtalo de nuevo en unos segundos.";
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-err`,
            role: "assistant",
            text: friendlyText,
            isError: true,
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [draft, sending]
  );

  // Si se llega aquí desde "Preguntas frecuentes" (Inicio → /blue-ia?q=...),
  // manda esa pregunta automáticamente una sola vez al entrar — igual que
  // tocar una sugerencia rápida, pero disparado por la navegación en vez de
  // por un toque en esta misma pantalla.
  useEffect(() => {
    const incoming = typeof params.q === "string" ? params.q.trim() : "";
    if (!incoming || autoAskedRef.current) return;
    autoAskedRef.current = true;
    handleAsk(incoming);
    // Solo debe dispararse al entrar con el parámetro, no cada vez que
    // cambie handleAsk (que se recrea con cada tecla escrita en el cuadro).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q]);

  // Las sugerencias rápidas solo tienen sentido antes de que exista una
  // conversación real: en cuanto hay alguna pregunta (o se está esperando
  // respuesta), desaparecen para dejar toda la pantalla a la conversación.
  const showQuickSuggestions = messages.length <= 1 && !sending;

  // Autoscroll: cada vez que llega un mensaje nuevo (o empieza/termina la
  // espera de respuesta), baja la conversación hasta el final.
  useEffect(() => {
    const id = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 60);
    return () => clearTimeout(id);
  }, [messages.length, sending]);

  const handleScroll = useCallback((e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom =
      contentSize.height - layoutMeasurement.height - (contentOffset.y as number);
    setShowScrollToBottom(distanceFromBottom > 260);
  }, []);

  const handleScrollToLatest = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
    setShowScrollToBottom(false);
  }, []);

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
            height: 260,
          }}
        />

        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 58,
            paddingBottom: showQuickSuggestions ? 190 : 120,
            alignItems: "center",
          }}
        >
          {/* Columna centrada: no se pega a la izquierda en pantallas anchas */}
          <View style={{ width: "100%", maxWidth: 860, gap: 10 }}>
            {messages.map((message) => (
              <BlueIABubble key={message.id} message={message} />
            ))}
            {sending && <BlueIATypingBubble />}
          </View>
        </ScrollView>

        {/*
          Icono "ⓘ" flotante arriba a la derecha: abre el modal con qué es
          Blue IA y para qué sirve — el mismo patrón que usa Chat Global en
          vez de tener una tarjeta de bienvenida ocupando espacio siempre.
        */}
        <Pressable
          onPress={() => setInfoModalOpen(true)}
          style={({ pressed }) => ({
            position: "absolute",
            top: 14,
            right: 16,
            width: 26,
            height: 26,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: COLORS.accentBorder,
            opacity: pressed ? 0.85 : 1,
            shadowColor: COLORS.accent,
            shadowOpacity: 0.08,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
          })}
        >
          <Ionicons name="information-circle-outline" size={15} color={COLORS.accent} />
        </Pressable>

        {/* "⬇️" para volver al último mensaje, igual que en Chat Global. */}
        {showScrollToBottom && (
          <Pressable
            onPress={handleScrollToLatest}
            style={({ pressed }) => ({
              position: "absolute",
              right: 16,
              bottom: showQuickSuggestions ? 168 : 108,
              width: 40,
              height: 40,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#FFFFFF",
              borderWidth: 1,
              borderColor: COLORS.accentBorder,
              opacity: pressed ? 0.85 : 1,
              shadowColor: COLORS.accent,
              shadowOpacity: 0.16,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 4,
            })}
          >
            <Ionicons name="arrow-down-circle" size={26} color={COLORS.accent} />
          </Pressable>
        )}

        {/* Compositor fijo abajo del todo, con las sugerencias rápidas justo
            encima (solo antes de la primera pregunta) — mismo estilo que el
            compositor de Chat Global. */}
        <View
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: 12,
            gap: 10,
          }}
        >
          {showQuickSuggestions && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingRight: 4 }}
            >
              {quickActions.map((item) => (
                <QuickSuggestionChip
                  key={item.id}
                  item={item}
                  onPress={() => handleAsk(item.prompt)}
                />
              ))}
            </ScrollView>
          )}

          {!!errorText && (
            <View
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: COLORS.dangerBorder,
                backgroundColor: COLORS.dangerSoft,
                paddingVertical: 8,
                paddingHorizontal: 12,
              }}
            >
              <Text style={{ color: "#B91C1C", fontWeight: "800", textAlign: "center" }}>
                {errorText}
              </Text>
            </View>
          )}

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Pregúntale a Blue IA…"
              placeholderTextColor="rgba(11,33,56,0.4)"
              editable={!sending}
              multiline
              style={{
                flex: 1,
                minHeight: 42,
                maxHeight: 96,
                borderRadius: 14,
                backgroundColor: "rgba(255,255,255,0.85)",
                borderWidth: 1,
                borderColor: COLORS.border,
                color: COLORS.text,
                // 16px es el mínimo que evita que Safari/iOS haga zoom
                // automático al enfocar el campo.
                fontSize: 16,
                paddingHorizontal: 14,
                paddingVertical: 10,
                opacity: sending ? 0.6 : 1,
              }}
            />

            <BlueIASendButton
              onPress={() => handleAsk()}
              disabled={sending || !draft.trim()}
              sending={sending}
            />
          </View>
        </View>
      </View>
    </SafeAreaView>

    <VenderAhoraModal visible={sellModalOpen} onClose={() => setSellModalOpen(false)} />

    <BlueIAInfoModal
      visible={infoModalOpen}
      onClose={() => setInfoModalOpen(false)}
      helpBlocks={helpBlocks}
    />
    </>
  );
}

// Burbuja de conversación: a la derecha y en azul si la escribió el usuario,
// a la izquierda con un icono si la respondió Blue IA. Un error de red se ve
// igual que una respuesta normal pero con un aviso en rojo debajo, para no
// mezclar el tono de "algo falló" con el resto de la conversación. Si la
// respuesta trae "socialChips" (ver api/blue-ia.ts), se pintan como una fila
// de botones con icono justo debajo del texto — nunca como enlaces sueltos
// dentro del mensaje.
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
          gap: 10,
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

        {!!message.socialChips?.length && <BlueIASocialChips chips={message.socialChips} />}
      </View>
    </View>
  );
}

// Fila de botones "premium" para las redes sociales que Blue IA recomienda
// en una respuesta concreta: icono de la red + nombre, en una píldora con
// borde suave — nada de URLs ni corchetes de markdown a la vista. Cada uno
// abre el enlace real (el mismo que guarda Daniel en
// app/admin/redes-sociales.tsx) tal y como lo resuelve el sistema operativo
// del usuario (ver la nota larga en components/SocialLinks.tsx sobre por
// qué no hace falta ningún truco extra para "abrir la app o descargarla").
function BlueIASocialChips({ chips }: { chips: SocialChip[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {chips.map((chip) => {
        const meta = SOCIAL_CHIP_ICONS[chip.platform];
        return (
          <Pressable
            key={chip.platform}
            onPress={() => openSocialChip(chip.href)}
            accessibilityRole="link"
            accessibilityLabel={chip.label}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingVertical: 7,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor: "#FFFFFF",
              borderWidth: 1,
              borderColor: COLORS.border,
              opacity: pressed ? 0.82 : 1,
              shadowColor: "#0B2138",
              shadowOpacity: 0.06,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 2 },
            })}
          >
            {meta ? meta.render(meta.color, 15) : null}
            <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 12.5 }}>
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
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

// Chip compacto de sugerencia rápida, pensado para ir en una fila horizontal
// justo encima del compositor (a diferencia de las tarjetas grandes de
// antes, aquí solo hay sitio para icono + título).
function QuickSuggestionChip({
  item,
  onPress,
}: {
  item: QuickAction;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          borderRadius: 999,
          paddingVertical: 10,
          paddingHorizontal: 14,
          backgroundColor: "#FFFFFF",
          borderWidth: 1,
          borderColor: COLORS.border,
          shadowColor: COLORS.accent,
          shadowOpacity: 0.08,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
        }}
      >
        <Ionicons name={item.icon} size={16} color={COLORS.accent} />
        <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13 }}>{item.title}</Text>
      </View>
    </Pressable>
  );
}

// Botón redondo de enviar, mismo tamaño y espíritu que el de Chat Global
// (círculo azul con flecha), simplificado sin la animación de "enviado ✓"
// porque aquí no hace falta ese matiz.
function BlueIASendButton({
  onPress,
  disabled,
  sending,
}: {
  onPress: () => void;
  disabled?: boolean;
  sending?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled}>
      {({ pressed }) => (
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: disabled ? "rgba(0,170,228,0.35)" : COLORS.accent,
            opacity: pressed ? 0.9 : 1,
            shadowColor: COLORS.accent,
            shadowOpacity: disabled ? 0 : 0.28,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 3 },
          }}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
          )}
        </View>
      )}
    </Pressable>
  );
}

// Modal "ⓘ": qué es Blue IA y para qué sirve. Sustituye a la tarjeta de
// bienvenida que antes ocupaba espacio siempre arriba de la pantalla — igual
// que hace Chat Global con su propio InfoModal.
function BlueIAInfoModal({
  visible,
  onClose,
  helpBlocks,
}: {
  visible: boolean;
  onClose: () => void;
  helpBlocks: HelpBlock[];
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: COLORS.overlay,
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        <Pressable onPress={() => {}} style={{ width: "100%", maxWidth: 480 }}>
          <LinearGradient
            colors={["rgba(30,167,232,0.14)", "rgba(0,170,228,0.10)", "rgba(30,167,232,0.02)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 28, padding: 1 }}
          >
            <View
              style={{
                borderRadius: 27,
                backgroundColor: "#FFFFFF",
                padding: 22,
                gap: 14,
                maxHeight: 560,
              }}
            >
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
                <View style={{ alignItems: "center", gap: 14 }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 999,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: COLORS.accentSoft,
                      borderWidth: 1,
                      borderColor: COLORS.accentBorder,
                    }}
                  >
                    <Ionicons name="sparkles-outline" size={22} color={COLORS.accent} />
                  </View>

                  <Text
                    style={{
                      color: COLORS.text,
                      fontSize: 24,
                      fontWeight: "900",
                      textAlign: "center",
                    }}
                  >
                    Blue IA
                  </Text>

                  <Text style={{ color: COLORS.muted, lineHeight: 22, textAlign: "center" }}>
                    Tu asistente para resolver dudas sobre productos, compras, ventas, cambios,
                    reparaciones, limpieza, envíos y pago a plazos.
                  </Text>

                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 8,
                      justifyContent: "center",
                    }}
                  >
                    <MiniPill text="Productos" tone="accent" />
                    <MiniPill text="Ventas" tone="success" />
                    <MiniPill text="Cambios" tone="gold" />
                    <MiniPill text="Pago a plazos" tone="accent" />
                  </View>

                  <View style={{ width: "100%", gap: 10, marginTop: 4 }}>
                    {helpBlocks.map((item) => (
                      <HelpCard key={item.id} item={item} />
                    ))}
                  </View>

                  <Pressable
                    onPress={onClose}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.9 : 1,
                      alignSelf: "center",
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      backgroundColor: "#F6FAFD",
                      paddingVertical: 9,
                      paddingHorizontal: 16,
                      marginTop: 4,
                    })}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>Entendido</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </LinearGradient>
        </Pressable>
      </Pressable>
    </Modal>
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
      <Text style={{ color: palette.text, fontWeight: "900", fontSize: 12 }}>{text}</Text>
    </View>
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
        borderRadius: 18,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.bg,
        overflow: "hidden",
      }}
    >
      <View style={{ height: 3, backgroundColor: palette.line }} />

      <View style={{ padding: 14, gap: 6 }}>
        <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: "900" }}>{item.title}</Text>
        <Text style={{ color: COLORS.muted, lineHeight: 20, fontSize: 13 }}>{item.desc}</Text>
      </View>
    </View>
  );
}
