export const MEDIA_BUCKET = "product-media";

// Límites funcionales
export const MAX_IMAGES = 15;
export const MAX_VIDEO_SECONDS = 15;

// Límite de peso por archivo
export const MAX_FILE_SIZE_MB = 20;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// MIME soportados finales
export const SUPPORTED_IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export const SUPPORTED_VIDEO_MIME = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

// MIME convertibles en cliente
export const CONVERTIBLE_IMAGE_MIME = [
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
] as const;

export const ERRORS = {
  FILE_TOO_LARGE: `El archivo supera el máximo de ${MAX_FILE_SIZE_MB}MB.`,
  INVALID_IMAGE_TYPE: "Formato de imagen no soportado.",
  INVALID_VIDEO_TYPE: "Formato de vídeo no soportado.",
  VIDEO_TOO_LONG: `El vídeo no puede superar ${MAX_VIDEO_SECONDS} segundos.`,
  MAX_IMAGES: `Máximo ${MAX_IMAGES} imágenes por producto.`,
  MAX_VIDEO: "Solo se permite 1 vídeo por producto.",
  GENERIC_UPLOAD: "Error subiendo archivos.",
} as const;

export const COLORS = {
  bg: "#071E33",
  bg2: "#061A2C",
  card: "rgba(255,255,255,0.06)",
  cardSoft: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.12)",

  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.75)",
  muted2: "rgba(255,255,255,0.55)",

  accent: "#00AAE4",
  accent2: "rgba(0,170,228,0.16)",
  accentBorder: "rgba(0,170,228,0.45)",

  gold: "#D8B04A",

  success: "#86EFAC",
  successBg: "rgba(34,197,94,0.14)",
  successBorder: "rgba(34,197,94,0.34)",

  warning: "#FDE68A",
  warningBg: "rgba(250,204,21,0.14)",
  warningBorder: "rgba(250,204,21,0.34)",

  danger: "#FCA5A5",
  dangerBg: "rgba(255,59,48,0.12)",
  dangerBorder: "rgba(255,59,48,0.35)",
} as const;