import React from "react";
import { Platform, Text, View } from "react-native";

const COLORS = {
  card: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.12)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.75)",
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

function SectionTitle({
  title,
  subtitle,
  isMobile,
}: {
  title: string;
  subtitle?: string;
  isMobile?: boolean;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text
        style={{
          color: COLORS.text,
          fontSize: isMobile ? 17 : 18,
          fontWeight: "900",
          lineHeight: isMobile ? 22 : 24,
        }}
      >
        {title}
      </Text>
      {!!subtitle && (
        <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 19 }}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}

function TrustPill({
  text,
  icon,
  isMobile,
}: {
  text: string;
  icon?: string;
  isMobile?: boolean;
}) {
  return (
    <View
      style={{
        paddingVertical: isMobile ? 8 : 10,
        paddingHorizontal: isMobile ? 12 : 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: "rgba(255,255,255,0.06)",
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        minWidth: isMobile ? "48%" : undefined,
      }}
    >
      {!!icon && <Text style={{ color: COLORS.text, fontSize: isMobile ? 14 : 16 }}>{icon}</Text>}
      <Text
        style={{
          color: "rgba(255,255,255,0.88)",
          fontWeight: "800",
          fontSize: isMobile ? 13 : 14,
          lineHeight: 18,
          flexShrink: 1,
        }}
      >
        {text}
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
        gap: 10,
        ...softShadow(),
      }}
    >
      <SectionTitle
        title="Compra con tranquilidad"
        subtitle="Atención directa, información clara y una experiencia pensada para dar confianza."
        isMobile={isMobile}
      />

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <TrustPill icon="⭐" text="Reseñas reales" isMobile={isMobile} />
        <TrustPill icon="🔁" text="Devolución clara" isMobile={isMobile} />
        <TrustPill icon="🧾" text="Factura o recibo" isMobile={isMobile} />
        <TrustPill icon="🧑‍🔧" text="Soporte" isMobile={isMobile} />
      </View>
    </View>
  );
}