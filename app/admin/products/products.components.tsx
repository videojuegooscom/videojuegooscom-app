import React from "react";
import { Image, Pressable, Text, View } from "react-native";
import { COLORS } from "./products.constants";
import type { LocalPickedMedia, ProductMediaRow, ProductMediaKind } from "./products.types";

type MediaLike = ProductMediaRow | LocalPickedMedia;

function normalizeMediaKind(value: unknown): ProductMediaKind | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "image") return "image";
  if (v === "video") return "video";
  return null;
}

function getMediaKind(media: MediaLike): ProductMediaKind | null {
  if ("file" in media) return media.kind;
  return normalizeMediaKind(media.kind ?? media.media_type);
}

function getMediaName(media: MediaLike) {
  const kind = getMediaKind(media);

  if ("file" in media) {
    return media.name || (kind === "video" ? "Vídeo" : "Imagen");
  }

  return media.file_name || (kind === "video" ? "Vídeo" : "Imagen");
}

function getMediaDuration(media: MediaLike) {
  if ("file" in media) return media.durationSeconds ?? null;

  const raw = media.duration_seconds ?? media.duration_sec ?? null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getMediaUrl(media: MediaLike) {
  if ("file" in media) return media.previewUrl;
  const url = String(media.public_url ?? "").trim();
  return url || null;
}

function formatDuration(seconds: number | null) {
  if (!seconds || !Number.isFinite(seconds)) return null;
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins <= 0) return `${secs}s`;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

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
        <Text
          style={{
            color: COLORS.muted,
            marginTop: 4,
            lineHeight: 19,
          }}
        >
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
        paddingVertical: 10,
        paddingHorizontal: 12,
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
      <Text
        style={{
          color: COLORS.text,
          fontWeight: "900",
          fontSize: isMobile ? 13 : 14,
        }}
      >
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
  const kind = getMediaKind(media);
  const mediaName = getMediaName(media);
  const duration = formatDuration(getMediaDuration(media));
  const mediaUrl = getMediaUrl(media);

  const imageSource =
    kind === "image" && mediaUrl
      ? {
          uri: mediaUrl,
        }
      : null;

  const cardWidth = isMobile ? 112 : 128;
  const thumbHeight = isMobile ? 90 : 104;

  return (
    <View
      style={{
        width: cardWidth,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: "rgba(255,255,255,0.04)",
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: "100%",
          height: thumbHeight,
          backgroundColor: "rgba(255,255,255,0.03)",
          position: "relative",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {kind === "image" && imageSource ? (
          <Image
            source={imageSource}
            resizeMode="cover"
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <View
            style={{
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Text style={{ fontSize: 28 }}>{kind === "video" ? "🎬" : "🖼️"}</Text>
            <Text
              style={{
                color: COLORS.text,
                fontWeight: "900",
                fontSize: 11,
              }}
            >
              {kind === "video" ? "Vídeo" : "Sin vista previa"}
            </Text>
          </View>
        )}

        <View
          style={{
            position: "absolute",
            left: 8,
            top: 8,
            borderRadius: 999,
            paddingVertical: 4,
            paddingHorizontal: 8,
            backgroundColor:
              kind === "image" ? "rgba(0,170,228,0.16)" : "rgba(216,176,74,0.18)",
            borderWidth: 1,
            borderColor:
              kind === "image" ? COLORS.accentBorder : "rgba(216,176,74,0.36)",
          }}
        >
          <Text
            style={{
              color: COLORS.text,
              fontWeight: "900",
              fontSize: 10,
            }}
          >
            {kind === "image" ? "IMAGEN" : kind === "video" ? "VÍDEO" : "MEDIA"}
          </Text>
        </View>

        {!!duration && kind === "video" && (
          <View
            style={{
              position: "absolute",
              right: 8,
              bottom: 8,
              borderRadius: 999,
              paddingVertical: 4,
              paddingHorizontal: 8,
              backgroundColor: "rgba(0,0,0,0.58)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
            }}
          >
            <Text
              style={{
                color: "#FFFFFF",
                fontWeight: "900",
                fontSize: 10,
              }}
            >
              {duration}
            </Text>
          </View>
        )}
      </View>

      <View
        style={{
          padding: 8,
          gap: 6,
        }}
      >
        <Text
          numberOfLines={2}
          style={{
            color: COLORS.text,
            fontSize: 11,
            fontWeight: "900",
            lineHeight: 14,
            minHeight: 28,
          }}
        >
          {mediaName}
        </Text>

        <Text
          style={{
            color: COLORS.muted2,
            fontSize: 10,
            fontWeight: "700",
          }}
        >
          {kind === "image"
            ? "Foto del producto"
            : kind === "video"
              ? "Vídeo del producto"
              : "Media del producto"}
        </Text>

        {!!onRemove && (
          <Pressable
            onPress={onRemove}
            style={({ pressed }) => ({
              opacity: pressed ? 0.88 : 1,
              borderRadius: 999,
              paddingVertical: 7,
              paddingHorizontal: 8,
              borderWidth: 1,
              borderColor: COLORS.dangerBorder,
              backgroundColor: COLORS.dangerBg,
              marginTop: 2,
            })}
          >
            <Text
              style={{
                color: COLORS.danger,
                fontWeight: "900",
                fontSize: 11,
                textAlign: "center",
              }}
            >
              Quitar
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}