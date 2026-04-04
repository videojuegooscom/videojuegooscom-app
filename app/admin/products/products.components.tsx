import React from "react";
import {
  Image,
  Pressable,
  Text,
  View,
} from "react-native";
import { COLORS } from "./products.constants";
import type { LocalPickedMedia, ProductMediaRow } from "./products.types";

export function SectionTitle({
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
          fontWeight: "900",
          fontSize: isMobile ? 17 : 18,
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

export function StatCard({
  label,
  value,
  icon,
  isMobile,
  compact,
}: {
  label: string;
  value: string;
  icon?: string;
  isMobile?: boolean;
  compact?: boolean;
}) {
  return (
    <View
      style={{
        width: compact ? (isMobile ? "100%" : "48.6%") : "100%",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.cardSoft,
        padding: isMobile ? 12 : 14,
      }}
    >
      <Text style={{ color: COLORS.muted2, fontWeight: "700", fontSize: 12 }}>
        {icon ? `${icon} ` : ""}
        {label}
      </Text>
      <Text
        style={{
          color: COLORS.text,
          fontWeight: "900",
          fontSize: isMobile ? 18 : 20,
          marginTop: 6,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export function ChipButton({
  label,
  onPress,
  variant,
  disabled,
  isMobile,
  fullWidth,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "success" | "danger" | "ghost";
  disabled?: boolean;
  isMobile?: boolean;
  fullWidth?: boolean;
}) {
  const isPrimary = variant === "primary";
  const isSuccess = variant === "success";
  const isDanger = variant === "danger";

  const borderColor = isPrimary
    ? COLORS.accentBorder
    : isSuccess
      ? COLORS.successBorder
      : isDanger
        ? COLORS.dangerBorder
        : COLORS.border;

  const backgroundColor = isPrimary
    ? COLORS.accent2
    : isSuccess
      ? COLORS.successBg
      : isDanger
        ? COLORS.dangerBg
        : "rgba(255,255,255,0.06)";

  return (
    <Pressable
      disabled={!!disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 999,
        paddingVertical: isMobile ? 10 : 10,
        paddingHorizontal: isMobile ? 12 : 12,
        borderWidth: 1,
        borderColor,
        backgroundColor,
        opacity: disabled ? 0.5 : pressed ? 0.88 : 1,
        width: fullWidth ? "100%" : undefined,
      })}
    >
      <Text
        style={{
          color: COLORS.text,
          fontWeight: "900",
          textAlign: "center",
          fontSize: isMobile ? 13 : 14,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function FilterPill({
  label,
  active,
  onPress,
  isMobile,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  isMobile?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 999,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: active ? COLORS.accentBorder : "rgba(255,255,255,0.14)",
        backgroundColor: active ? COLORS.accent2 : "rgba(255,255,255,0.06)",
        opacity: pressed ? 0.88 : 1,
      })}
    >
      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: isMobile ? 13 : 14 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function MediaThumb({
  media,
  isMobile,
  onRemove,
}: {
  media: ProductMediaRow | LocalPickedMedia;
  isMobile?: boolean;
  onRemove?: () => void;
}) {
  const isLocal = "file" in media;
  const kind = media.kind;
  const imageSource =
    kind === "image"
      ? {
          uri: isLocal ? media.previewUrl : media.public_url,
        }
      : null;

  return (
    <View
      style={{
        width: isMobile ? 96 : 110,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: "rgba(255,255,255,0.04)",
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: "100%",
          height: isMobile ? 82 : 92,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(255,255,255,0.03)",
        }}
      >
        {kind === "image" && imageSource ? (
          <Image source={imageSource} resizeMode="cover" style={{ width: "100%", height: "100%" }} />
        ) : (
          <View style={{ alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Text style={{ fontSize: 28 }}>🎬</Text>
            {"durationSeconds" in media && media.durationSeconds ? (
              <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: "800" }}>
                {Math.round(media.durationSeconds)}s
              </Text>
            ) : "duration_seconds" in media && media.duration_seconds ? (
              <Text style={{ color: COLORS.muted, fontSize: 11, fontWeight: "800" }}>
                {Math.round(media.duration_seconds)}s
              </Text>
            ) : null}
          </View>
        )}
      </View>

      <View style={{ padding: 8, gap: 6 }}>
        <Text
          numberOfLines={2}
          style={{ color: COLORS.text, fontSize: 11, fontWeight: "800", lineHeight: 14 }}
        >
          {"file_name" in media ? media.file_name || kind : media.name}
        </Text>

        <Text style={{ color: COLORS.muted2, fontSize: 10, fontWeight: "700" }}>
          {kind === "image" ? "Imagen" : "Vídeo"}
        </Text>

        {!!onRemove && (
          <Pressable
            onPress={onRemove}
            style={({ pressed }) => ({
              opacity: pressed ? 0.88 : 1,
              borderRadius: 999,
              paddingVertical: 6,
              paddingHorizontal: 8,
              borderWidth: 1,
              borderColor: COLORS.dangerBorder,
              backgroundColor: COLORS.dangerBg,
            })}
          >
            <Text style={{ color: COLORS.danger, fontWeight: "900", fontSize: 11, textAlign: "center" }}>
              Quitar
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}