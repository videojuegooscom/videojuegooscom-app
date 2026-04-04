import { Platform } from "react-native";
import { router } from "expo-router";
import type {
  LocalPickedMedia,
  ProductCondition,
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

export function getPrimaryMedia(media: ProductMediaRow[]) {
  if (!media?.length) return null;
  return (
    media.find((m) => m.is_cover && m.kind === "image") ||
    media.find((m) => m.kind === "image") ||
    media.find((m) => m.kind === "video") ||
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

export async function pickMediaFilesWeb(): Promise<LocalPickedMedia[]> {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    throw new Error("La subida de archivos desde este panel está preparada para web.");
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*,video/mp4,video/webm,video/quicktime";

    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      const out: LocalPickedMedia[] = [];

      for (const file of files) {
        const mimeType = String(file.type ?? "");
        const isVideo = mimeType.startsWith("video/");
        const kind = isVideo ? "video" : "image";

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
        });
      }

      resolve(out);
    };

    input.click();
  });
}