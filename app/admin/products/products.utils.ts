import { Platform } from "react-native";
import { router } from "expo-router";
import type {
  LocalPickedMedia,
  ProductCondition,
  ProductMediaKind,
  ProductMediaRow,
  ProductStatus,
} from "./products.types";

export function softShadow() {
  return Platform.select<any>({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.24,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 3 },
    default: {},
  });
}

export function fmtEUR(n: number) {
  const safe = Number.isFinite(n) ? n : 0;
  return `${Math.round(safe)}€`;
}

export function clampText(s: string, max = 180) {
  const t = String(s ?? "").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

export function toIntSafe(v: string, fallback = 0) {
  const s = String(v ?? "").trim();
  if (!s) return fallback;

  const cleaned = s.replace(/[^\d.,-]/g, "");
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  let normalized = cleaned;
  if (hasComma && hasDot) {
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    const dec = lastComma > lastDot ? "," : ".";
    const thou = dec === "," ? "." : ",";
    normalized = cleaned.split(thou).join("").replace(dec, ".");
  } else if (hasComma && !hasDot) {
    const parts = cleaned.split(",");
    if (parts.length === 2 && parts[1].length <= 2) normalized = parts[0] + "." + parts[1];
    else normalized = cleaned.split(",").join("");
  } else if (hasDot && !hasComma) {
    const parts = cleaned.split(".");
    if (parts.length === 2 && parts[1].length <= 2) normalized = parts[0] + "." + parts[1];
    else normalized = cleaned.split(".").join("");
  }

  const n = Number(normalized);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

export function labelStatus(s: ProductStatus) {
  if (s === "PUBLISHED") return "Publicado";
  if (s === "REVIEW") return "Por revisar";
  return "Borrador";
}

export function labelCond(c: ProductCondition) {
  if (c === "NEW") return "Nuevo";
  if (c === "LIKE_NEW") return "Como nuevo";
  if (c === "GOOD") return "Bueno";
  if (c === "FAIR") return "Regular";
  return "Para piezas";
}

export function smartBackAdminHome() {
  try {
    if (typeof router.canGoBack === "function" && router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // ignore
  }
  router.replace("/admin");
}

export function statusVisual(status: ProductStatus, palette: any) {
  if (status === "PUBLISHED") {
    return {
      text: "Publicado",
      borderColor: palette.successBorder,
      backgroundColor: palette.successBg,
    };
  }
  if (status === "REVIEW") {
    return {
      text: "Por revisar",
      borderColor: palette.warningBorder,
      backgroundColor: palette.warningBg,
    };
  }
  return {
    text: "Borrador",
    borderColor: palette.border,
    backgroundColor: "rgba(255,255,255,0.06)",
  };
}

export function normalizeMediaKind(value: unknown): ProductMediaKind | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "image") return "image";
  if (v === "video") return "video";
  return null;
}

export function getMediaKind(media: Pick<ProductMediaRow, "kind" | "media_type">) {
  return normalizeMediaKind(media.kind ?? media.media_type);
}

export function getMediaDuration(
  media: Pick<ProductMediaRow, "duration_seconds" | "duration_sec">
) {
  const raw = media.duration_seconds ?? media.duration_sec;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function getMediaPublicUrl(media: Pick<ProductMediaRow, "public_url">) {
  const url = String(media.public_url ?? "").trim();
  return url || null;
}

export function getPrimaryMedia(media: ProductMediaRow[]) {
  if (!media?.length) return null;

  return (
    media.find((m) => Boolean(m.is_cover) && getMediaKind(m) === "image") ||
    media.find((m) => getMediaKind(m) === "image") ||
    media.find((m) => getMediaKind(m) === "video") ||
    media[0]
  );
}

export function extFromName(fileName: string, fallback: string) {
  const clean = String(fileName ?? "").trim();
  const parts = clean.split(".");
  if (parts.length < 2) return fallback;
  return parts.pop()?.toLowerCase() || fallback;
}

export function safeFileName(name: string) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildMediaPath(productId: string, item: LocalPickedMedia, index: number) {
  const fallbackExt = item.kind === "video" ? "mp4" : "jpg";
  const ext = extFromName(item.name, fallbackExt);
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${productId}/${stamp}-${index + 1}-${rand}-${safeFileName(item.name || item.kind)}.${ext}`;
}

export async function getVideoDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("No se pudo leer la duración del vídeo."));
      return;
    }

    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      const seconds = Number(video.duration || 0);
      URL.revokeObjectURL(url);
      resolve(seconds);
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo analizar el vídeo seleccionado."));
    };

    video.src = url;
  });
}

function inferMimeTypeFromName(fileName: string) {
  const ext = extFromName(fileName, "").toLowerCase();

  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "avif") return "image/avif";
  if (ext === "heic") return "image/heic";
  if (ext === "heif") return "image/heif";
  if (ext === "mp4") return "video/mp4";
  if (ext === "webm") return "video/webm";
  if (ext === "mov" || ext === "qt") return "video/quicktime";

  return "";
}

function isHeicLike(file: File) {
  const mime = String(file.type ?? "").toLowerCase();
  const ext = extFromName(file.name, "").toLowerCase();

  return (
    mime === "image/heic" ||
    mime === "image/heif" ||
    mime === "image/heic-sequence" ||
    mime === "image/heif-sequence" ||
    ext === "heic" ||
    ext === "heif"
  );
}

function replaceExtension(fileName: string, nextExt: string) {
  const clean = String(fileName ?? "").trim();
  if (!clean) return `archivo.${nextExt}`;
  const idx = clean.lastIndexOf(".");
  if (idx <= 0) return `${clean}.${nextExt}`;
  return `${clean.slice(0, idx)}.${nextExt}`;
}

function blobToFile(blob: Blob, fileName: string, mimeType: string) {
  return new File([blob], fileName, {
    type: mimeType,
    lastModified: Date.now(),
  });
}

async function dynamicImportHeic2Any(): Promise<any> {
  try {
    const importer = new Function("m", "return import(m)") as (m: string) => Promise<any>;
    return await importer("heic2any");
  } catch {
    throw new Error('Falta instalar la librería HEIC. Ejecuta: npm install heic2any');
  }
}

async function convertHeicToJpeg(file: File): Promise<File> {
  const mod = await dynamicImportHeic2Any();
  const heic2any = mod?.default ?? mod;

  if (typeof heic2any !== "function") {
    throw new Error("No se pudo cargar el conversor HEIC.");
  }

  const converted = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.92,
  });

  const outputBlob = Array.isArray(converted) ? converted[0] : converted;

  if (!(outputBlob instanceof Blob)) {
    throw new Error("La conversión HEIC no devolvió una imagen válida.");
  }

  const nextName = replaceExtension(file.name, "jpg");
  return blobToFile(outputBlob, nextName, "image/jpeg");
}

function ensureSupportedImageMime(file: File) {
  const mime =
    String(file.type ?? "").toLowerCase() || inferMimeTypeFromName(file.name).toLowerCase();

  const supported = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
  ]);

  if (!supported.has(mime)) {
    throw new Error(`No se soporta MIME Type ${mime || "(vacío)"}`);
  }
}

function ensureSupportedVideoMime(file: File) {
  const mime =
    String(file.type ?? "").toLowerCase() || inferMimeTypeFromName(file.name).toLowerCase();

  const supported = new Set([
    "video/mp4",
    "video/webm",
    "video/quicktime",
  ]);

  if (!supported.has(mime)) {
    throw new Error(`No se soporta MIME Type ${mime || "(vacío)"}`);
  }
}

async function normalizePickedFile(file: File): Promise<File> {
  if (isHeicLike(file)) {
    const converted = await convertHeicToJpeg(file);
    return new File([converted], converted.name, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  }

  const mime =
    String(file.type ?? "").toLowerCase() || inferMimeTypeFromName(file.name).toLowerCase();

  if (mime.startsWith("image/")) {
    ensureSupportedImageMime(file);
    return file;
  }

  if (mime.startsWith("video/")) {
    ensureSupportedVideoMime(file);
    return file;
  }

  throw new Error(`No se soporta MIME Type ${mime || "(vacío)"}`);
}

export async function pickMediaFilesWeb(): Promise<LocalPickedMedia[]> {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    throw new Error("La subida de archivos desde este panel está preparada para web.");
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept =
      "image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif,video/mp4,video/webm,video/quicktime,.mov";

    input.onchange = async () => {
      const originalFiles = Array.from(input.files ?? []);
      const out: LocalPickedMedia[] = [];

      try {
        for (const originalFile of originalFiles) {
          const file = await normalizePickedFile(originalFile);
          const mimeType =
            String(file.type ?? "").toLowerCase() || inferMimeTypeFromName(file.name).toLowerCase();

          const isVideo = mimeType.startsWith("video/");
          const kind: ProductMediaKind = isVideo ? "video" : "image";

          let durationSeconds: number | null = null;
          if (isVideo) {
            try {
              durationSeconds = await getVideoDurationSeconds(file);
            } catch {
              durationSeconds = null;
            }
          }

          out.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            kind,
            file,
            name: file.name,
            mimeType,
            size: file.size,
            previewUrl: URL.createObjectURL(file),
            durationSeconds,
            originalName: originalFile.name,
            originalMimeType: originalFile.type || null,
          });
        }

        resolve(out);
      } catch (error) {
        out.forEach((item) => {
          try {
            URL.revokeObjectURL(item.previewUrl);
          } catch {
            // ignore
          }
        });
        reject(error);
      }
    };

    input.click();
  });
}