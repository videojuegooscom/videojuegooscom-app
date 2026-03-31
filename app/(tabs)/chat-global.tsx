import React, { useMemo, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  UIManager,
  View,
} from "react-native";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const COLORS = {
  bg: "#071E33",
  bg2: "#061A2C",
  card: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.12)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.74)",
  soft: "rgba(255,255,255,0.52)",
  accent: "#00AAE4",
  accentSoft: "rgba(0,170,228,0.16)",
  accentBorder: "rgba(0,170,228,0.34)",
  bubbleMine: "rgba(0,170,228,0.18)",
  bubbleOther: "rgba(255,255,255,0.06)",
  bubbleSystem: "rgba(216,176,74,0.14)",
  gold: "#D8B04A",
};

type Viewer = {
  id: string;
  username: string;
  mode: "viewer" | "member" | "vip";
  city: string;
  country: string;
  game: string;
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

type HubTab = "chat" | "news" | "novedades" | "torneos";

export default function ChatGlobalScreen() {
  const [isLoggedIn] = useState(false);
  const [hasCompletedCommunityProfile] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [activeTab, setActiveTab] = useState<HubTab>("chat");

  const viewers = useMemo<Viewer[]>(
    () => [
      {
        id: "1",
        username: "alexzgz",
        mode: "member",
        city: "Zaragoza",
        country: "España",
        game: "Fortnite",
      },
      {
        id: "2",
        username: "mariaps5",
        mode: "viewer",
        city: "Madrid",
        country: "España",
        game: "Fortnite",
      },
      {
        id: "3",
        username: "otakuzone",
        mode: "vip",
        city: "Valencia",
        country: "España",
        game: "Warzone",
      },
      {
        id: "4",
        username: "retro_dani",
        mode: "member",
        city: "Sevilla",
        country: "España",
        game: "Fortnite",
      },
      {
        id: "5",
        username: "switchlover",
        mode: "viewer",
        city: "Bogotá",
        country: "Colombia",
        game: "Fortnite",
      },
      {
        id: "6",
        username: "capibara_tech",
        mode: "member",
        city: "Barcelona",
        country: "España",
        game: "EA FC",
      },
      {
        id: "7",
        username: "nutriafix",
        mode: "vip",
        city: "Bilbao",
        country: "España",
        game: "Fortnite",
      },
      {
        id: "8",
        username: "adri_xbox",
        mode: "viewer",
        city: "Lisboa",
        country: "Portugal",
        game: "Fortnite",
      },
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
        text: "Bienvenido al Chat Global. Esta sala está pensada para conectar gamers, encontrar gente para jugar y seguir noticias, novedades y torneos.",
      },
      {
        id: "m2",
        type: "message",
        username: "mariaps5",
        displayName: "María",
        role: "member",
        time: "12:08",
        text: "¿Hay alguien de Madrid para jugar Fortnite esta tarde? 🎮",
      },
      {
        id: "m3",
        type: "message",
        username: "videojuegoos",
        displayName: "Videojuegoos",
        role: "admin",
        time: "12:09",
        text: "La idea es esa: que podáis encontrar gente por ciudad, país y juego, además de enteraros de novedades y torneos.",
      },
      {
        id: "m4",
        type: "gif",
        username: "retro_dani",
        displayName: "Dani Retro",
        role: "member",
        time: "12:10",
        text: "GIF: victoria épica en Fortnite",
      },
      {
        id: "m5",
        type: "message",
        username: "otakuzone",
        displayName: "Otaku Zone",
        role: "vip",
        time: "12:11",
        text: "Esto puede funcionar muy bien si luego permitís filtrar por país, plataforma y juego principal.",
      },
      {
        id: "m6",
        type: "message",
        username: "capibara_tech",
        displayName: "Capibara Tech",
        role: "member",
        time: "12:12",
        text: "También molaría destacar torneos y nuevas entradas de consolas dentro del mismo hub.",
      },
    ],
    []
  );

  const canViewMedia = isLoggedIn && hasCompletedCommunityProfile;
  const totalViewers = viewers.length + 21;

  const toggleViewers = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowViewers((prev) => !prev);
  };

  const renderActiveTabContent = () => {
    if (activeTab === "news") {
      return (
        <InfoPanel
          title="Noticias Gaming"
          subtitle="Noticias rápidas de gaming y comunidad para mantener el hub vivo."
          items={[
            "Fortnite prepara nuevas rotaciones y eventos semanales.",
            "La escena competitiva sigue empujando el juego cruzado y el contenido en directo.",
            "El objetivo aquí sería mostrar noticias breves, claras y muy visuales.",
          ]}
        />
      );
    }

    if (activeTab === "novedades") {
      return (
        <InfoPanel
          title="Nuestras Novedades"
          subtitle="Entradas nuevas de tienda, packs, reacondicionados y avisos importantes."
          items={[
            "Nuevos packs de consola disponibles.",
            "Entradas recientes de mandos, accesorios y reacondicionados.",
            "Próximas mejoras del chat, perfiles gamer y búsqueda por ciudad.",
          ]}
        />
      );
    }

    if (activeTab === "torneos") {
      return (
        <InfoPanel
          title="Torneos"
          subtitle="Torneos, retos, clasificatorias y eventos comunitarios."
          items={[
            "Torneo Fortnite dúos — próximamente.",
            "Retos semanales para activar comunidad.",
            "Ranking local por ciudad o por sala más adelante.",
          ]}
        />
      );
    }

    return (
      <View
        style={{
          borderRadius: 22,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.card,
          overflow: "hidden",
        }}
      >
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
                Sala principal para conectar gamers, encontrar gente para jugar a Fortnite
                y hablar con personas de tu misma ciudad o país.
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
                Aquí puedes ver quién está conectado ahora mismo. Más adelante esto
                debería poder filtrarse por ciudad, país, juego y plataforma.
              </Text>

              <View style={{ gap: 10 }}>
                {viewers.map((viewer) => (
                  <ViewerRow key={viewer.id} viewer={viewer} />
                ))}
              </View>
            </View>
          ) : null}
        </View>

        <View style={{ padding: 14, gap: 12 }}>
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              item={message}
              canViewMedia={canViewMedia}
            />
          ))}
        </View>
      </View>
    );
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
        <View
          style={{
            borderRadius: 24,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            backgroundColor: COLORS.bg2,
            paddingHorizontal: 18,
            paddingVertical: 18,
            gap: 10,
          }}
        >
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
              maxWidth: 980,
            }}
          >
            Hub social para conectar gamers, encontrar gente para jugar a Fortnite,
            descubrir personas de tu misma ciudad o país y seguir noticias gaming,
            novedades de la tienda y torneos.
          </Text>
        </View>

        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.card,
            paddingHorizontal: 10,
            paddingVertical: 10,
            gap: 10,
          }}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 6 }}>
              <HubTabButton
                active={activeTab === "chat"}
                label="Chat Global"
                onPress={() => setActiveTab("chat")}
              />
              <HubTabButton
                active={activeTab === "news"}
                label="Noticias Gaming"
                onPress={() => setActiveTab("news")}
              />
              <HubTabButton
                active={activeTab === "novedades"}
                label="Nuestras Novedades"
                onPress={() => setActiveTab("novedades")}
              />
              <HubTabButton
                active={activeTab === "torneos"}
                label="Torneos"
                onPress={() => setActiveTab("torneos")}
              />
            </View>
          </ScrollView>
        </View>

        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.card,
            padding: 14,
            gap: 10,
          }}
        >
          <Text style={{ color: COLORS.text, fontSize: 17, fontWeight: "900" }}>
            Tu estado en el hub
          </Text>

          {!isLoggedIn ? (
            <>
              <Text style={{ color: COLORS.muted, lineHeight: 22 }}>
                Estás entrando como visitante. Puedes mirar el contenido y la sala, pero no
                puedes comentar ni abrir imágenes, GIFs o vídeos.
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
                Ya has iniciado sesión, pero para comentar y conectar con otros jugadores
                necesitas completar tu perfil comunitario.
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
                Perfil validado. Ya puedes comentar, conectar con otros jugadores y entrar
                de verdad en la comunidad.
              </Text>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                <Tag text="Cuenta validada" tone="success" />
                <Tag text="Puede comentar" tone="success" />
                <Tag text="Multimedia habilitada" tone="success" />
              </View>
            </>
          )}
        </View>

        {renderActiveTabContent()}
      </ScrollView>
    </SafeAreaView>
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

function HubTabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.9 : 1,
        borderRadius: 999,
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: active ? COLORS.accentSoft : "rgba(255,255,255,0.05)",
        borderWidth: 1,
        borderColor: active ? COLORS.accentBorder : "rgba(255,255,255,0.10)",
      })}
    >
      <Text style={{ color: COLORS.text, fontWeight: "900" }}>{label}</Text>
    </Pressable>
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
        gap: 8,
      }}
    >
      <View
        style={{
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
              {viewer.city}, {viewer.country}
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

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <MiniInlineData label="Juego" value={viewer.game} />
        <MiniInlineData label="Zona" value={viewer.city} />
      </View>
    </View>
  );
}

function MiniInlineData({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View
      style={{
        borderRadius: 999,
        paddingVertical: 6,
        paddingHorizontal: 10,
        backgroundColor: "rgba(255,255,255,0.05)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <Text style={{ color: COLORS.soft, fontSize: 11, fontWeight: "700" }}>
        {label}: <Text style={{ color: COLORS.text, fontWeight: "900" }}>{value}</Text>
      </Text>
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

function InfoPanel({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: string[];
}) {
  return (
    <View
      style={{
        borderRadius: 22,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.card,
        padding: 16,
        gap: 12,
      }}
    >
      <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "900" }}>
        {title}
      </Text>
      <Text style={{ color: COLORS.muted, lineHeight: 22 }}>{subtitle}</Text>

      <View style={{ gap: 10 }}>
        {items.map((item, index) => (
          <View
            key={`${title}-${index}`}
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.04)",
              padding: 12,
            }}
          >
            <Text style={{ color: COLORS.text, lineHeight: 22 }}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}