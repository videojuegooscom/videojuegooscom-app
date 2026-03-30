import React from "react";
import {
  ActivityIndicator,
  Platform,
  Text,
  View,
} from "react-native";

type BrandLoadingScreenProps = {
  message?: string;
};

const COLORS = {
  bg: "#F4F4F2",
  text: "#0B1726",
  accent: "#00AAE4",
  muted: "rgba(11,23,38,0.16)",
};

export default function BrandLoadingScreen({
  message = "Cargando tienda...",
}: BrandLoadingScreenProps) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: COLORS.bg,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
      }}
    >
      <View
        style={{
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          maxWidth: 420,
        }}
      >
        <Text
          style={{
            color: COLORS.text,
            fontSize: 34,
            fontWeight: "900",
            lineHeight: 38,
            letterSpacing: -0.8,
            textAlign: "center",
          }}
        >
          Videojuegos
        </Text>

        <Text
          style={{
            color: COLORS.text,
            fontSize: 34,
            fontWeight: "900",
            lineHeight: 38,
            letterSpacing: -0.8,
            textAlign: "center",
            marginTop: 2,
          }}
        >
          Zaragoza.com
        </Text>

        <View
          style={{
            marginTop: 18,
            width: 92,
            height: 4,
            borderRadius: 999,
            backgroundColor: COLORS.muted,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              width: "52%",
              height: "100%",
              borderRadius: 999,
              backgroundColor: COLORS.accent,
            }}
          />
        </View>

        <View style={{ marginTop: 18 }}>
          <ActivityIndicator size="small" color={COLORS.text} />
        </View>

        <Text
          style={{
            color: "rgba(11,23,38,0.70)",
            fontSize: 14,
            lineHeight: 20,
            marginTop: 12,
            textAlign: "center",
          }}
        >
          {message}
        </Text>
      </View>

      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: Platform.OS === "ios" ? 18 : 12,
          left: 0,
          right: 0,
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: 120,
            height: 5,
            borderRadius: 999,
            backgroundColor: "rgba(11,23,38,0.28)",
          }}
        />
      </View>
    </View>
  );
}