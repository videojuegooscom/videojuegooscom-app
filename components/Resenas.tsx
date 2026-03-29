import React from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";

const COLORS = {
  card: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.12)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.75)",
  muted2: "rgba(255,255,255,0.58)",
  accent: "#00AAE4",
  accent2: "rgba(0,170,228,0.16)",
  accentBorder: "rgba(0,170,228,0.45)",
  successBg: "rgba(34,197,94,0.16)",
  successBorder: "rgba(34,197,94,0.34)",
  gold: "#F7C948",
};

function softShadow() {
  return Platform.select<any>({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 3 },
    default: {},
  });
}

function openReviewLink() {
  const fallbackUrl = "https://videojuegoszaragoza.com";

  Linking.openURL(fallbackUrl).catch(() => {
    // no-op
  });
}

function StatPill({
  label,
  value,
  isMobile,
}: {
  label: string;
  value: string;
  isMobile?: boolean;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: isMobile ? 100 : 120,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: "rgba(255,255,255,0.05)",
        paddingVertical: isMobile ? 10 : 12,
        paddingHorizontal: isMobile ? 12 : 14,
      }}
    >
      <Text
        style={{
          color: COLORS.muted2,
          fontSize: 12,
          fontWeight: "700",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: COLORS.text,
          fontSize: isMobile ? 18 : 20,
          fontWeight: "900",
          marginTop: 4,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function ReviewMiniCard({
  quote,
  isMobile,
}: {
  quote: string;
  isMobile?: boolean;
}) {
  return (
    <View
      style={{
        width: "100%",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: "rgba(255,255,255,0.04)",
        padding: isMobile ? 12 : 14,
      }}
    >
      <Text
        style={{
          color: COLORS.text,
          fontSize: isMobile ? 14 : 15,
          lineHeight: isMobile ? 20 : 22,
          fontWeight: "700",
        }}
      >
        “{quote}”
      </Text>
    </View>
  );
}

export default function Resenas({ isMobile = false }: { isMobile?: boolean }) {
  return (
    <View
      style={{
        borderRadius: 22,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.card,
        padding: isMobile ? 14 : 16,
        gap: 14,
        ...softShadow(),
      }}
    >
      <View style={{ gap: 8 }}>
        <View
          style={{
            alignSelf: "flex-start",
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: COLORS.successBorder,
            backgroundColor: COLORS.successBg,
          }}
        >
          <Text
            style={{
              color: COLORS.text,
              fontWeight: "900",
              fontSize: 12,
            }}
          >
            Reseñas
          </Text>
        </View>

        <Text
          style={{
            color: COLORS.text,
            fontSize: isMobile ? 20 : 22,
            fontWeight: "900",
            lineHeight: isMobile ? 27 : 29,
          }}
        >
          Lo que importa no es lo que decimos nosotros, sino lo que opina la gente.
        </Text>

        <Text
          style={{
            color: COLORS.muted,
            lineHeight: 20,
            fontSize: isMobile ? 14 : 15,
          }}
        >
          Este bloque queda dedicado solo a opiniones y prueba social. Nada de mezclar churras con mandos.
        </Text>
      </View>

      <View
        style={{
          borderRadius: 20,
          borderWidth: 1,
          borderColor: COLORS.accentBorder,
          backgroundColor: COLORS.accent2,
          padding: isMobile ? 14 : 16,
          gap: 12,
        }}
      >
        <View
          style={{
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "flex-start" : "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                color: COLORS.gold,
                fontSize: isMobile ? 24 : 28,
                fontWeight: "900",
                lineHeight: isMobile ? 28 : 32,
              }}
            >
              ★★★★★
            </Text>

            <Text
              style={{
                color: COLORS.text,
                fontSize: isMobile ? 24 : 28,
                fontWeight: "900",
                marginTop: 4,
              }}
            >
              5,0 / 5
            </Text>

            <Text
              style={{
                color: COLORS.muted,
                marginTop: 4,
                lineHeight: 19,
              }}
            >
              Valoración media orientativa del servicio y la experiencia.
            </Text>
          </View>

          <Pressable
            onPress={openReviewLink}
            style={({ pressed }) => ({
              opacity: pressed ? 0.88 : 1,
              borderRadius: 999,
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderWidth: 1,
              borderColor: COLORS.accentBorder,
              backgroundColor: "rgba(255,255,255,0.08)",
              alignSelf: isMobile ? "stretch" : "center",
            })}
          >
            <Text
              style={{
                color: COLORS.text,
                fontWeight: "900",
                textAlign: "center",
              }}
            >
              Dejar una reseña
            </Text>
          </Pressable>
        </View>

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <StatPill label="Opiniones" value="+50" isMobile={isMobile} />
          <StatPill label="Valoración" value="Excelente" isMobile={isMobile} />
          <StatPill label="Respuesta" value="Rápida" isMobile={isMobile} />
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <ReviewMiniCard
          isMobile={isMobile}
          quote="Muy atentos, rápidos y el producto llegó tal como esperaba."
        />
        <ReviewMiniCard
          isMobile={isMobile}
          quote="Me resolvieron dudas por WhatsApp sin marearme y todo quedó claro."
        />
        <ReviewMiniCard
          isMobile={isMobile}
          quote="Experiencia seria, cercana y con sensación de tienda de verdad."
        />
      </View>

      <Text
        style={{
          color: COLORS.muted2,
          fontSize: 12,
          lineHeight: 18,
        }}
      >
        Luego, cuando quieras, esto lo conectamos con reseñas reales, Google Business o testimonios verificados.
      </Text>
    </View>
  );
}