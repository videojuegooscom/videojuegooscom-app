/**
 * Qué hace: constantes compartidas del módulo de administración de
 * productos: límites de subida de fotos/vídeo, tipos MIME soportados,
 * textos de error y la paleta de colores (COLORS) del panel de productos.
 *
 * Cómo funciona: son valores estáticos, sin lógica. COLORS define el tema
 * claro (fondo blanco, azul claro de acento, texto azul marino oscuro) que
 * usan todos los componentes de esta carpeta.
 *
 * Conectado con:
 * - app/admin/products.tsx → importa COLORS y los límites de subida.
 * - app/admin/products/products.components.tsx → importa COLORS para los
 *   componentes visuales compartidos (ChipButton, StatCard, etc.).
 * - app/admin/products/products.utils.ts → importa los límites (MAX_*) y
 *   MEDIA_BUCKET para las funciones de subida de media.
 */
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
  FILE_TOO_LARGE: `El archivo supera el máximo de ${MAX_FILE_SIZE_MB} MB.`,
  INVALID_IMAGE_TYPE: "Formato de imagen no compatible.",
  INVALID_VIDEO_TYPE: "Formato de vídeo no compatible.",
  VIDEO_TOO_LONG: `El vídeo no puede superar ${MAX_VIDEO_SECONDS} segundos.`,
  MAX_IMAGES: `Máximo ${MAX_IMAGES} imágenes por producto.`,
  MAX_VIDEO: "Solo se permite 1 vídeo por producto.",
  GENERIC_UPLOAD: "No se pudieron subir los archivos.",
} as const;

export const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  cardSoft: "#F8FBFE",
  border: "#E3EAF2",

  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.48)",

  accent: "#1EA7E8",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",

  gold: "#92660B",

  success: "#15803D",
  successBg: "#DCFCE7",
  successBorder: "#86EFAC",

  warning: "#92660B",
  warningBg: "#FEF3C7",
  warningBorder: "#FDE68A",

  danger: "#B91C1C",
  dangerBg: "#FFE4E6",
  dangerBorder: "#FDA4AF",
} as const;