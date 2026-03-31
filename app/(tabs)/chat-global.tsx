import React, { useMemo, useState } from "react";
import {
  LayoutAnimation,
  Modal,
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
import { LinearGradient } from "expo-linear-gradient";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const COLORS = {
  bg: "#071E33",
  bg2: "#061A2C",
  bg3: "#0A2743",
  card: "rgba(255,255,255,0.06)",
  cardSoft: "rgba(255,255,255,0.035)",
  border: "rgba(255,255,255,0.12)",
  borderSoft: "rgba(255,255,255,0.08)",
  text: "#FFFFFF",
  textDark: "#0B1726",
  muted: "rgba(255,255,255,0.74)",
  soft: "rgba(255,255,255,0.52)",
  accent: "#00AAE4",
  accentSoft: "rgba(0,170,228,0.16)",
  accentBorder: "rgba(0,170,228,0.34)",
  accentGlow: "rgba(0,170,228,0.20)",
  success: "#22C55E",
  successSoft: "rgba(34,197,94,0.16)",
  successBorder: "rgba(34,197,94,0.30)",
  bubbleMine: "rgba(0,170,228,0.22)",
  bubbleOther: "rgba(255,255,255,0.055)",
  bubbleSystem: "rgba(216,176,74,0.14)",
  gold: "#D8B04A",
  danger: "#FF6B6B",
  dangerSoft: "rgba(255,107,107,0.14)",
  dangerBorder: "rgba(255,107,107,0.30)",
  overlay: "rgba(3,10,18,0.76)",
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

const INITIAL_MESSAGES: MessageItem[] = [
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
];

export default function ChatGlobalScreen() {
  const [isLoggedIn] = useState(false);
  const [hasCompletedCommunityProfile] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [activeTab, setActiveTab] = useState<HubTab>("chat");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<MessageItem[]>(INITIAL_MESSAGES);

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

  const canViewMedia = isLoggedIn && hasCompletedCommunityProfile;
  const totalViewers = viewers.length + 21;

  const toggleViewers = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowViewers((prev) => !prev);
  };

  const handleComposerPress = () => {
    if (!isLoggedIn) {
      setShowAuthModal(true);
      return;
    }
  };

  const handleSend = () => {
    if (!isLoggedIn) {
      setShowAuthModal(true);
      return;
    }

    const clean = draft.trim();
    if (!clean) return;

    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes()
    ).padStart(2, "0")}`;

    const newMessage: MessageItem = {
      id: `local-${Date.now()}`,
      type: "message",
      username: "tu_usuario",
      displayName: "Tú",
      role: "member",
      time,
      text: clean,
      mine: true,
    };

    setMessages((prev) => [...prev, newMessage]);
    setDraft("");
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
          borderRadius: 26,
          borderWidth: 1,
          borderColor: COLORS.borderSoft,
          backgroundColor: "rgba(6,26,44,0.72)",
          overflow: "hidden",
        }}
      >
        <LinearGradient
          colors={[
            "rgba(255,255,255,0.16)",
            "rgba(0,170,228,0.10)",
            "rgba(7,30,51,0.00)",
          ]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 220,
          }}
        />

        <View
          style={{
            paddingHorizontal: 18,
            paddingTop: 18,
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
              alignItems: "flex-start",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <View style={{ flex: 1, minWidth: 220 }}>
              <Text
                style={{
                  color: COLORS.text,
                  fontSize: 24,
                  fontWeight: "900",
                  letterSpacing: 0.2,
                }}
              >
                Sala · Chat Global
              </Text>

              <Text
                style={{
                  color: COLORS.muted,
                  marginTop: 6,
                  lineHeight: 22,
                  maxWidth: 800,
                }}
              >
                Sala principal para conectar gamers, encontrar gente para jugar a
                Fortnite y hablar con personas de tu misma ciudad o país.
              </Text>
            </View>
          </View>

          {showViewers ? (
            <View
              style={{
                borderRadius: 18,
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

        <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 20, gap: 10 }}>
          {messages.map((message, index) => {
            const prev = messages[index - 1];
            const grouped =
              prev &&
              prev.type === "message" &&
              message.type === "message" &&
              prev.username === message.username;

            return (
              <MessageBubble
                key={message.id}
                item={message}
                canViewMedia={canViewMedia}
                grouped={!!grouped}
              />
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="light-content" />

      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <LinearGradient
          colors={["rgba(255,255,255,0.20)", "rgba(0,170,228,0.08)", "rgba(7,30,51,0.00)"]}
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
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 18,
            paddingBottom: 130,
            gap: 16,
          }}
        >
          <LinearGradient
            colors={["rgba(255,255,255,0.13)", "rgba(0,170,228,0.08)", "rgba(6,26,44,0.94)"]}
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
                  flexDirection: "row",
                  alignItems: "center",
                  flexWrap: "wrap",
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

                <GlowPill text={`${totalViewers} conectados`} tone="success" size="hero" />

                <Pressable
                  onPress={toggleViewers}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.92 : 1,
                  })}
                >
                  <GlowPill
                    text={`Viendo ahora · ${totalViewers} ${showViewers ? "▲" : "▼"}`}
                    tone="accent"
                    size="hero"
                  />
                </Pressable>
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
                Hub social para conectar gamers, encontrar gente para jugar a
                Fortnite, descubrir personas de tu misma ciudad o país y seguir
                noticias gaming, novedades de la tienda y torneos.
              </Text>
            </View>
          </LinearGradient>

          <View
            style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: COLORS.borderSoft,
              backgroundColor: COLORS.card,
              paddingHorizontal: 10,
              paddingVertical: 10,
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

          {renderActiveTabContent()}
        </ScrollView>

        {activeTab === "chat" ? (
          <FloatingComposer
            value={draft}
            onChangeText={setDraft}
            onPressInput={handleComposerPress}
            onPressSend={handleSend}
            isLoggedIn={isLoggedIn}
          />
        ) : null}

        <AuthRequiredModal
          visible={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onLogin={() => {
            setShowAuthModal(false);
            router.push("/perfil");
          }}
          onRegister={() => {
            setShowAuthModal(false);
            router.push("/perfil");
          }}
        />
      </View>
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
      bg: "rgba(255,107,107,0.12)",
      border: "rgba(255,107,107,0.30)",
      text: "#FFC0C0",
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

function GlowPill({
  text,
  tone,
  size = "default",
}: {
  text: string;
  tone: "accent" | "success";
  size?: "default" | "hero";
}) {
  const isHero = size === "hero";

  const style =
    tone === "success"
      ? {
          bg: COLORS.successSoft,
          border: COLORS.successBorder,
          text: "#BBF7D0",
          shadow: COLORS.success,
        }
      : {
          bg: COLORS.accentSoft,
          border: COLORS.accentBorder,
          text: COLORS.text,
          shadow: COLORS.accent,
        };

  return (
    <View
      style={{
        borderRadius: 999,
        minHeight: isHero ? 46 : 34,
        paddingVertical: isHero ? 11 : 8,
        paddingHorizontal: isHero ? 16 : 12,
        backgroundColor: style.bg,
        borderWidth: 1.2,
        borderColor: style.border,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: style.shadow,
        shadowOpacity: isHero ? 0.22 : 0.16,
        shadowRadius: isHero ? 18 : 12,
        shadowOffset: { width: 0, height: 0 },
        elevation: isHero ? 4 : 2,
        maxWidth: "100%",
      }}
    >
      <Text
        style={{
          color: style.text,
          fontWeight: "900",
          fontSize: isHero ? 14 : 13,
          lineHeight: isHero ? 18 : 16,
          textAlign: "center",
          flexShrink: 1,
        }}
      >
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
        opacity: pressed ? 0.92 : 1,
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
        opacity: pressed ? 0.92 : 1,
        borderRadius: 999,
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: active ? COLORS.accentSoft : "rgba(255,255,255,0.05)",
        borderWidth: 1,
        borderColor: active ? COLORS.accentBorder : "rgba(255,255,255,0.10)",
        shadowColor: active ? COLORS.accent : "transparent",
        shadowOpacity: active ? 0.18 : 0,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 0 },
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
        borderRadius: 16,
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
          <AvatarCircle username={viewer.username} size={40} />
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

function AvatarCircle({
  username,
  size = 42,
}: {
  username: string;
  size?: number;
}) {
  const palette = [
    "rgba(0,170,228,0.20)",
    "rgba(34,197,94,0.18)",
    "rgba(216,176,74,0.18)",
    "rgba(255,255,255,0.12)",
  ];
  const index = username.length % palette.length;
  const bg = palette[index];

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
      }}
    >
      <Text style={{ color: COLORS.text, fontWeight: "900" }}>
        {username.slice(0, 1).toUpperCase()}
      </Text>
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
  grouped,
}: {
  item: MessageItem;
  canViewMedia: boolean;
  grouped?: boolean;
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
          accent: COLORS.accent,
        }
      : item.role === "vip"
      ? {
          bg: "rgba(216,176,74,0.16)",
          text: "#FDE68A",
          border: "rgba(216,176,74,0.30)",
          label: "VIP",
          accent: COLORS.gold,
        }
      : {
          bg: "rgba(255,255,255,0.06)",
          text: "#FFFFFF",
          border: "rgba(255,255,255,0.12)",
          label: "MIEMBRO",
          accent: "rgba(255,255,255,0.18)",
        };

  const bubbleBg = item.mine ? COLORS.bubbleMine : COLORS.bubbleOther;

  return (
    <View
      style={{
        alignSelf: item.mine ? "flex-end" : "stretch",
        maxWidth: "100%",
        gap: grouped ? 4 : 8,
        marginTop: grouped ? 2 : 6,
      }}
    >
      {!grouped ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <AvatarCircle username={item.username} />
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
      ) : null}

      <View
        style={{
          borderRadius: 18,
          borderWidth: 1,
          borderColor: item.mine ? "rgba(0,170,228,0.20)" : "rgba(255,255,255,0.08)",
          backgroundColor: bubbleBg,
          padding: 14,
          gap: 10,
          shadowColor: item.mine ? COLORS.accent : roleTone.accent,
          shadowOpacity: item.mine ? 0.12 : 0.06,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 2 },
        }}
      >
        {item.type === "gif" ? (
          <View
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
              backgroundColor: "rgba(255,255,255,0.03)",
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
                    backgroundColor: COLORS.dangerSoft,
                    borderWidth: 1,
                    borderColor: COLORS.dangerBorder,
                  }}
                >
                  <Text style={{ color: "#FFC0C0", fontWeight: "900" }}>
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
                  Inicia sesión y completa tu perfil para abrir multimedia del chat.
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

function FloatingComposer({
  value,
  onChangeText,
  onPressInput,
  onPressSend,
  isLoggedIn,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onPressInput: () => void;
  onPressSend: () => void;
  isLoggedIn: boolean;
}) {
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: 12,
      }}
    >
      <LinearGradient
        colors={["rgba(255,255,255,0.16)", "rgba(0,170,228,0.08)", "rgba(255,255,255,0.02)"]}
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
            backgroundColor: "rgba(6,26,44,0.94)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.06)",
            padding: 10,
            shadowColor: COLORS.accent,
            shadowOpacity: 0.14,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Pressable
              onPress={onPressInput}
              style={{
                flex: 1,
              }}
            >
              {isLoggedIn ? (
                <TextInput
                  value={value}
                  onChangeText={onChangeText}
                  placeholder="Escribe un mensaje…"
                  placeholderTextColor="rgba(255,255,255,0.42)"
                  style={{
                    minHeight: 48,
                    maxHeight: 110,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.08)",
                    backgroundColor: "rgba(255,255,255,0.04)",
                    color: COLORS.text,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                  }}
                  multiline
                />
              ) : (
                <View
                  style={{
                    minHeight: 48,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.08)",
                    backgroundColor: "rgba(255,255,255,0.04)",
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "rgba(255,255,255,0.42)" }}>
                    Escribe un mensaje…
                  </Text>
                </View>
              )}
            </Pressable>

            <Pressable
              onPress={onPressSend}
              style={({ pressed }) => ({
                width: 50,
                height: 50,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: COLORS.accent,
                opacity: pressed ? 0.9 : 1,
                shadowColor: COLORS.accent,
                shadowOpacity: 0.24,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 2 },
              })}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 18 }}>➤</Text>
            </Pressable>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

function AuthRequiredModal({
  visible,
  onClose,
  onLogin,
  onRegister,
}: {
  visible: boolean;
  onClose: () => void;
  onLogin: () => void;
  onRegister: () => void;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.overlay,
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        <LinearGradient
          colors={["rgba(255,255,255,0.18)", "rgba(0,170,228,0.10)", "rgba(255,255,255,0.02)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: "100%",
            maxWidth: 460,
            borderRadius: 28,
            padding: 1,
          }}
        >
          <View
            style={{
              borderRadius: 27,
              backgroundColor: "rgba(6,26,44,0.98)",
              padding: 20,
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
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                ACCESO NECESARIO
              </Text>
            </View>

            <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "900" }}>
              Inicia sesión para enviar mensajes
            </Text>

            <Text style={{ color: COLORS.muted, lineHeight: 22 }}>
              Puedes explorar la sala libremente, pero para escribir o enviar mensajes
              necesitas iniciar sesión o crear tu cuenta.
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <Tag text="Chat visible" tone="success" />
              <Tag text="Enviar = login" tone="warn" />
              <Tag text="Comunidad protegida" tone="neutral" />
            </View>

            <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
              <ActionButton label="Iniciar sesión" onPress={onLogin} primary />
              <ActionButton label="Crear cuenta" onPress={onRegister} />
            </View>

            <Pressable
              onPress={onClose}
              style={({ pressed }) => ({
                opacity: pressed ? 0.88 : 1,
                alignSelf: "center",
                paddingVertical: 8,
                paddingHorizontal: 10,
                marginTop: 2,
              })}
            >
              <Text style={{ color: COLORS.muted, fontWeight: "800" }}>Cerrar</Text>
            </Pressable>
          </View>
        </LinearGradient>
      </View>
    </Modal>
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
        borderColor: COLORS.borderSoft,
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