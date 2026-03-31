import React, { useMemo, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { router } from "expo-router";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const COLORS = {
  bg: "#071E33",
  bg2: "#061A2C",
  card: "rgba(255,255,255,0.06)",
  cardStrong: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.12)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.74)",
  soft: "rgba(255,255,255,0.52)",
  accent: "#00AAE4",
  accentSoft: "rgba(0,170,228,0.16)",
  accentBorder: "rgba(0,170,228,0.34)",
  success: "#22C55E",
  warn: "#F59E0B",
  danger: "#FF3B30",
  bubbleMine: "rgba(0,170,228,0.18)",
  bubbleOther: "rgba(255,255,255,0.06)",
  bubbleSystem: "rgba(216,176,74,0.14)",
  gold: "#D8B04A",
};

type Viewer = {
  id: string;
  username: string;
  mode: "viewer" | "member" | "vip";
};

type MessageItem = {
  id: string;
  type: "message" | "gif" | "system";
  username: string;
  displayName: string;
  role?: "viewer" | "member" | "vip" | "admin";
  time: string;
  text: string;
  mine?: boolean;
};

export default function ChatGlobalScreen() {
  const [isLoggedIn] = useState(false);
  const [hasCompletedCommunityProfile] = useState(false);
  const [draft, setDraft] = useState("");
  const [showViewers, setShowViewers] = useState(false);

  const viewers = useMemo<Viewer[]>(
    () => [
      { id: "1", username: "alexzgz", mode: "member" },
      { id: "2", username: "mariaps5", mode: "viewer" },
      { id: "3", username: "otakuzone", mode: "vip" },
      { id: "4", username: "retro_dani", mode: "member" },
      { id: "5", username: "switchlover", mode: "viewer" },
      { id: "6", username: "capibara_tech", mode: "member" },
      { id: "7", username: "nutriafix", mode: "vip" },
      { id: "8", username: "adri_xbox", mode: "viewer" },
    ],
    []
  );

  const messages = useMemo<MessageItem[]>(
    () => [
      {
        id: "m1",
        type: "system",
        username: "system",
        displayName: "Sistema",
        time: "12:06",
        text: "Bienvenido al Chat Global. Los visitantes pueden mirar. Para comentar necesitas cuenta y perfil completo.",
      },
      {
        id: "m2",
        type: "message",
        username: "mariaps5",
        displayName: "María",
        role: "member",
        time: "12:08",
        text: "¿Sabéis si entrarán más mandos de PS5 esta semana? 🔥",
      },
      {
        id: "m3",
        type: "message",
        username: "videojuegoos",
        displayName: "Videojuegoos",
        role: "admin",
        time: "12:09",
        text: "Sí. En principio entran varias unidades revisadas. Cuando estén listas se publicarán en catálogo.",
      },
      {
        id: "m4",
        type: "gif",
        username: "retro_dani",
        displayName: "Dani Retro",
        role: "member",
        time: "12:10",
        text: "GIF: reacción gamer celebrando oferta",
      },
      {
        id: "m5",
        type: "message",
        username: "otakuzone",
        displayName: "Otaku Zone",
        role: "vip",
        time: "12:11",
        text: "La verdad, esta sección tiene muchísimo potencial si hacéis directos + avisos de stock en tiempo real.",
      },
      {
        id: "m6",
        type: "message",
        username: "capibara_tech",
        displayName: "Capibara Tech",
        role: "member",
        time: "12:12",
        text: "Un chat así puede empujar mucho la conversión si enlaza packs, reparaciones y ofertas del día.",
      },
    ],
    []
  );

  const canWrite = isLoggedIn && hasCompletedCommunityProfile;
  const profileMissing = isLoggedIn && !hasCompletedCommunityProfile;

  const totalViewers = viewers.length + 21;
  const totalMessages = messages.length;
  const registeredOnline = viewers.filter((v) => v.mode !== "viewer").length;

  const toggleViewers = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowViewers((prev) => !prev);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 18,
          paddingBottom: 30,
          gap: 16,
        }}
      >
        {/* HERO MÁS COMPACTO */}
        <View
          style={{
            borderRadius: 24,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            backgroundColor: COLORS.bg2,
            padding: 18,
            gap: 16,
          }}
        >
          <View style={{ gap: 10 }}>
            <View
              style={{
                alignSelf: "flex-start",
                borderRadius: 999,
                paddingVertical: 6,
                paddingHorizontal: 10,
                backgroundColor: "rgba(34,197,94,0.16)",
                borderWidth: 1,
                borderColor: "rgba(34,197,94,0.30)",
              }}
            >
              <Text style={{ color: "#BBF7D0", fontWeight: "900", fontSize: 12 }}>
                EN DIRECTO
              </Text>
            </View>

            <Text
              style={{
                color: COLORS.text,
                fontSize: 30,
                lineHeight: 34,
                fontWeight: "900",
              }}
            >
              Chat Global
            </Text>

            <Text
              style={{
                color: COLORS.muted,
                fontSize: 15,
                lineHeight: 23,
                maxWidth: 920,
              }}
            >
              Una única sala global para hablar de stock, ofertas, soporte público,
              reparaciones y movimiento de la tienda. Mirar puede mirar cualquiera.
              Participar, no.
            </Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <StatPill label="Viendo ahora" value={String(totalViewers)} />
            <StatPill label="Registrados online" value={String(registeredOnline)} />
            <StatPill label="Mensajes" value={String(totalMessages)} />
            <StatPill label="Modo actual" value={canWrite ? "Participando" : "Solo lectura"} />
          </View>
        </View>

        {/* ESTADO DEL USUARIO */}
        <View
          style={{
            borderRadius: 20,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.card,
            padding: 16,
            gap: 12,
          }}
        >
          <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "900" }}>
            Tu estado en el chat
          </Text>

          {!isLoggedIn ? (
            <>
              <Text style={{ color: COLORS.muted, lineHeight: 22 }}>
                Estás entrando como visitante. Puedes ver la sala y quién está dentro,
                pero no puedes comentar ni abrir imágenes, GIFs o vídeos.
              </Text>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                <Tag text="Modo visitante" tone="neutral" />
                <Tag text="Solo lectura" tone="warn" />
                <Tag text="Multimedia bloqueada" tone="danger" />
              </View>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                <ActionButton
                  label="Crear cuenta"
                  onPress={() => router.push("/perfil")}
                  primary
                />
                <ActionButton
                  label="Iniciar sesión"
                  onPress={() => router.push("/perfil")}
                />
              </View>
            </>
          ) : profileMissing ? (
            <>
              <Text style={{ color: COLORS.muted, lineHeight: 22 }}>
                Ya has iniciado sesión, pero para escribir en la sala tienes que completar
                tu perfil comunitario con nombre, apellidos, fecha de nacimiento, país,
                nombre de usuario, 2 fotos de perfil y 1 imagen de portada.
              </Text>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                <Tag text="Cuenta iniciada" tone="success" />
                <Tag text="Perfil incompleto" tone="warn" />
                <Tag text="Chat bloqueado" tone="danger" />
              </View>

              <ActionButton
                label="Completar perfil del chat"
                onPress={() => router.push("/perfil")}
                primary
              />
            </>
          ) : (
            <>
              <Text style={{ color: COLORS.muted, lineHeight: 22 }}>
                Perfil validado. Puedes participar en el chat, usar emojis, abrir GIFs y
                construir reputación dentro de la comunidad.
              </Text>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                <Tag text="Cuenta validada" tone="success" />
                <Tag text="Puede comentar" tone="success" />
                <Tag text="Multimedia habilitada" tone="success" />
              </View>
            </>
          )}
        </View>

        {/* SALA ÚNICA */}
        <View
          style={{
            borderRadius: 22,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.card,
            overflow: "hidden",
          }}
        >
          {/* HEADER DE LA SALA */}
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 16,
              paddingBottom: 14,
              borderBottomWidth: 1,
              borderBottomColor: "rgba(255,255,255,0.08)",
              gap: 12,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <View style={{ flex: 1, minWidth: 220 }}>
                <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "900" }}>
                  Sala · Chat Global
                </Text>
                <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 21 }}>
                  Una única sala principal. Todo el mundo puede mirar. Solo los usuarios
                  verificados pueden hablar.
                </Text>
              </View>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                <View
                  style={{
                    borderRadius: 999,
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    backgroundColor: "rgba(34,197,94,0.12)",
                    borderWidth: 1,
                    borderColor: "rgba(34,197,94,0.30)",
                  }}
                >
                  <Text style={{ color: "#BBF7D0", fontWeight: "900" }}>
                    {totalViewers} conectados
                  </Text>
                </View>

                <Pressable
                  onPress={toggleViewers}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.9 : 1,
                    borderRadius: 999,
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    backgroundColor: COLORS.accentSoft,
                    borderWidth: 1,
                    borderColor: COLORS.accentBorder,
                  })}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                    Viendo ahora · {totalViewers} {showViewers ? "▲" : "▼"}
                  </Text>
                </Pressable>
              </View>
            </View>

            {showViewers ? (
              <View
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                  backgroundColor: "rgba(255,255,255,0.035)",
                  padding: 12,
                  gap: 12,
                }}
              >
                <Text style={{ color: COLORS.muted, lineHeight: 21 }}>
                  Los usuarios del chat pueden ver tanto a quienes participan como a quienes
                  están mirando en silencio.
                </Text>

                <View style={{ gap: 10 }}>
                  {viewers.map((viewer) => (
                    <ViewerRow key={viewer.id} viewer={viewer} />
                  ))}
                </View>
              </View>
            ) : null}
          </View>

          {/* MENSAJES */}
          <View style={{ padding: 14, gap: 12 }}>
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                item={message}
                canViewMedia={canWrite}
              />
            ))}
          </View>
        </View>

        {/* COMPOSER */}
        <View
          style={{
            borderRadius: 20,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.cardStrong,
            padding: 14,
            gap: 12,
          }}
        >
          <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "900" }}>
            Escribir en la sala
          </Text>

          {!canWrite ? (
            <View
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(245,158,11,0.30)",
                backgroundColor: "rgba(245,158,11,0.10)",
                padding: 14,
                gap: 10,
              }}
            >
              <Text style={{ color: "#FDE68A", fontWeight: "900" }}>
                Chat bloqueado para este perfil
              </Text>

              <Text style={{ color: COLORS.text, lineHeight: 22 }}>
                Para comentar necesitas:
              </Text>

              <View style={{ gap: 8 }}>
                <Requirement text="Cuenta registrada en la tienda online" ok={isLoggedIn} />
                <Requirement text="Nombre y apellidos" ok={false} />
                <Requirement text="Fecha de nacimiento" ok={false} />
                <Requirement text="País" ok={false} />
                <Requirement text="Nombre de usuario público" ok={false} />
                <Requirement text="2 fotos de perfil" ok={false} />
                <Requirement text="1 imagen de portada" ok={false} />
              </View>

              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 10,
                  marginTop: 4,
                }}
              >
                <ActionButton
                  label={!isLoggedIn ? "Registrarme ahora" : "Completar mi perfil"}
                  onPress={() => router.push("/perfil")}
                  primary
                />
                <ActionButton
                  label="Ver mis datos"
                  onPress={() => router.push("/perfil")}
                />
              </View>
            </View>
          ) : (
            <>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Escribe tu mensaje…"
                placeholderTextColor="rgba(255,255,255,0.42)"
                multiline
                style={{
                  minHeight: 110,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: "rgba(0,0,0,0.12)",
                  padding: 14,
                  color: COLORS.text,
                  textAlignVertical: "top",
                }}
              />

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  <MiniPill text="😀 Emoji" />
                  <MiniPill text="GIF" />
                  <MiniPill text="Foto" />
                  <MiniPill text="Vídeo" />
                </View>

                <ActionButton label="Enviar mensaje" onPress={() => {}} primary />
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        borderRadius: 999,
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: "rgba(255,255,255,0.05)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
      }}
    >
      <Text style={{ color: "rgba(255,255,255,0.58)", fontSize: 11, fontWeight: "800" }}>
        {label}
      </Text>
      <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: "900", marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
}

function Tag({
  text,
  tone = "neutral",
}: {
  text: string;
  tone?: "neutral" | "success" | "warn" | "danger";
}) {
  const palette = {
    neutral: {
      bg: "rgba(255,255,255,0.07)",
      border: "rgba(255,255,255,0.12)",
      text: "#FFFFFF",
    },
    success: {
      bg: "rgba(34,197,94,0.14)",
      border: "rgba(34,197,94,0.30)",
      text: "#BBF7D0",
    },
    warn: {
      bg: "rgba(245,158,11,0.14)",
      border: "rgba(245,158,11,0.30)",
      text: "#FDE68A",
    },
    danger: {
      bg: "rgba(255,59,48,0.12)",
      border: "rgba(255,59,48,0.30)",
      text: "#FCA5A5",
    },
  }[tone];

  return (
    <View
      style={{
        borderRadius: 999,
        paddingVertical: 8,
        paddingHorizontal: 10,
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

function ActionButton({
  label,
  onPress,
  primary,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.9 : 1,
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 14,
        backgroundColor: primary ? COLORS.accent : "rgba(255,255,255,0.05)",
        borderWidth: 1,
        borderColor: primary ? COLORS.accent : "rgba(255,255,255,0.12)",
      })}
    >
      <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

function Requirement({ text, ok }: { text: string; ok: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: ok ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.08)",
          borderWidth: 1,
          borderColor: ok ? "rgba(34,197,94,0.30)" : "rgba(255,255,255,0.12)",
        }}
      >
        <Text style={{ color: ok ? "#BBF7D0" : "rgba(255,255,255,0.62)", fontWeight: "900" }}>
          {ok ? "✓" : "•"}
        </Text>
      </View>

      <Text style={{ color: COLORS.text, flex: 1, lineHeight: 21 }}>{text}</Text>
    </View>
  );
}

function MiniPill({ text }: { text: string }) {
  return (
    <View
      style={{
        borderRadius: 999,
        paddingVertical: 8,
        paddingHorizontal: 10,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
      }}
    >
      <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: "800" }}>{text}</Text>
    </View>
  );
}

function ViewerRow({ viewer }: { viewer: Viewer }) {
  const modeMap = {
    viewer: {
      label: "Mirando",
      bg: "rgba(255,255,255,0.06)",
      border: "rgba(255,255,255,0.12)",
      text: "#FFFFFF",
    },
    member: {
      label: "Miembro",
      bg: "rgba(0,170,228,0.16)",
      border: "rgba(0,170,228,0.30)",
      text: "#BAE6FD",
    },
    vip: {
      label: "VIP",
      bg: "rgba(216,176,74,0.16)",
      border: "rgba(216,176,74,0.30)",
      text: "#FDE68A",
    },
  }[viewer.mode];

  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: "rgba(255,255,255,0.04)",
        padding: 12,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(255,255,255,0.10)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>
            {viewer.username.slice(0, 1).toUpperCase()}
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>
            @{viewer.username}
          </Text>
          <Text style={{ color: COLORS.soft, fontSize: 12, marginTop: 2 }}>
            conectado ahora
          </Text>
        </View>
      </View>

      <View
        style={{
          borderRadius: 999,
          paddingVertical: 7,
          paddingHorizontal: 10,
          backgroundColor: modeMap.bg,
          borderWidth: 1,
          borderColor: modeMap.border,
        }}
      >
        <Text style={{ color: modeMap.text, fontWeight: "900", fontSize: 12 }}>
          {modeMap.label}
        </Text>
      </View>
    </View>
  );
}

function MessageBubble({
  item,
  canViewMedia,
}: {
  item: MessageItem;
  canViewMedia: boolean;
}) {
  if (item.type === "system") {
    return (
      <View
        style={{
          alignSelf: "stretch",
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "rgba(216,176,74,0.25)",
          backgroundColor: COLORS.bubbleSystem,
          padding: 12,
          gap: 6,
        }}
      >
        <Text style={{ color: COLORS.gold, fontWeight: "900" }}>
          Aviso del sistema · {item.time}
        </Text>
        <Text style={{ color: COLORS.text, lineHeight: 21 }}>{item.text}</Text>
      </View>
    );
  }

  const roleTone =
    item.role === "admin"
      ? {
          bg: "rgba(0,170,228,0.18)",
          text: "#BAE6FD",
          border: "rgba(0,170,228,0.30)",
          label: "ADMIN",
        }
      : item.role === "vip"
      ? {
          bg: "rgba(216,176,74,0.16)",
          text: "#FDE68A",
          border: "rgba(216,176,74,0.30)",
          label: "VIP",
        }
      : {
          bg: "rgba(255,255,255,0.06)",
          text: "#FFFFFF",
          border: "rgba(255,255,255,0.12)",
          label: "MIEMBRO",
        };

  const bubbleBg = item.mine ? COLORS.bubbleMine : COLORS.bubbleOther;

  return (
    <View
      style={{
        alignSelf: item.mine ? "flex-end" : "stretch",
        maxWidth: "100%",
        gap: 6,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <Text style={{ color: COLORS.text, fontWeight: "900" }}>{item.displayName}</Text>
        <Text style={{ color: COLORS.soft, fontSize: 12 }}>@{item.username}</Text>

        <View
          style={{
            borderRadius: 999,
            paddingVertical: 4,
            paddingHorizontal: 8,
            backgroundColor: roleTone.bg,
            borderWidth: 1,
            borderColor: roleTone.border,
          }}
        >
          <Text style={{ color: roleTone.text, fontSize: 11, fontWeight: "900" }}>
            {roleTone.label}
          </Text>
        </View>

        <Text style={{ color: COLORS.soft, fontSize: 12 }}>{item.time}</Text>
      </View>

      <View
        style={{
          borderRadius: 18,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
          backgroundColor: bubbleBg,
          padding: 14,
          gap: 10,
        }}
      >
        {item.type === "gif" ? (
          <View
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(0,0,0,0.16)",
              padding: 14,
              alignItems: "center",
              justifyContent: "center",
              minHeight: 120,
            }}
          >
            {canViewMedia ? (
              <>
                <View
                  style={{
                    borderRadius: 999,
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    backgroundColor: "rgba(255,255,255,0.08)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>GIF</Text>
                </View>
                <Text style={{ color: COLORS.muted, marginTop: 10, textAlign: "center" }}>
                  {item.text}
                </Text>
              </>
            ) : (
              <>
                <View
                  style={{
                    borderRadius: 999,
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    backgroundColor: "rgba(255,59,48,0.12)",
                    borderWidth: 1,
                    borderColor: "rgba(255,59,48,0.30)",
                  }}
                >
                  <Text style={{ color: "#FCA5A5", fontWeight: "900" }}>
                    GIF bloqueado
                  </Text>
                </View>
                <Text
                  style={{
                    color: COLORS.muted,
                    marginTop: 10,
                    textAlign: "center",
                    lineHeight: 21,
                  }}
                >
                  Regístrate y completa tu perfil para abrir multimedia del chat.
                </Text>
              </>
            )}
          </View>
        ) : (
          <Text style={{ color: COLORS.text, lineHeight: 22 }}>{item.text}</Text>
        )}
      </View>
    </View>
  );
}