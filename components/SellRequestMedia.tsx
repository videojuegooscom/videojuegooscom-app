// components/SellRequestMedia.tsx
/**
 * Qué hace: todo lo relacionado con las fotos y el vídeo que un cliente
 * adjunta al formulario "Vender ahora" (hasta 10 imágenes + 1 vídeo de
 * hasta 20 segundos), en un único archivo: tipos, límites, conversión HEIC
 * (fotos de iPhone), subida a Supabase Storage, descarga individual para el
 * admin, y el propio selector visual (SellMediaPicker) que se inserta en el
 * formulario.
 *
 * Cómo funciona:
 * - El bucket de Storage "sell-request-media" es PRIVADO (no público como
 *   "product-media"): las fotos de un cliente no deben quedar accesibles
 *   por URL directa. Solo un admin autenticado puede leerlas, generando una
 *   URL firmada de 60 segundos en el momento de pulsar "Descargar" — por
 *   diseño no hay galería ni previsualización embebida en el panel admin,
 *   cada archivo se descarga al dispositivo uno a uno.
 * - Cada archivo sube a Storage y además crea una fila en la tabla
 *   "sell_request_media" (ver sql/sell_request_media.sql), enlazada a su
 *   "sell_requests" por sell_request_id — igual que "product_media" está
 *   enlazada a "products".
 * - uploadSellRequestMedia() se llama DESPUÉS de insertar la fila en
 *   "sell_requests" (necesita su id ya generado para poder enlazar los
 *   archivos). Si falla la subida, la solicitud ya guardada no se pierde:
 *   VenderAhoraModal.tsx captura ese error aparte.
 * - Reutiliza el mismo criterio que app/admin/products/products.utils.ts
 *   (conversión HEIC→JPEG con heic2any, medir duración de vídeo con un
 *   <video> oculto) pero de forma independiente: este módulo lo usa el
 *   formulario público, así que no depende de nada del panel admin.
 * - pickSellImagesWeb/pickSellVideoWeb abren el selector de archivos del
 *   navegador (<input type="file">): la app se despliega solo como web
 *   (expo export --platform web), así que no hace falta expo-image-picker
 *   nativo aquí.
 *
 * Conectado con:
 * - components/VenderAhoraModal.tsx → usa <SellMediaPicker> en el
 *   formulario y llama a uploadSellRequestMedia() al enviar.
 * - app/admin/cotizaciones.tsx → llama a downloadSellRequestMedia() por
 *   cada archivo listado de "sell_request_media".
 * - sql/sell_request_media.sql → crea el bucket, la tabla y sus políticas.
 * - lib/supabase.ts → cliente usado para Storage y la tabla.
 */
import React, { useState } from "react";
import { Image, Linking, Platform, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";

export const SELL_MEDIA_BUCKET = "sell-request-media";

export const MAX_SELL_IMAGES = 10;
export const MAX_SELL_VIDEO_SECONDS = 20;
export const MAX_SELL_IMAGE_SIZE_MB = 12;
export const MAX_SELL_VIDEO_SIZE_MB = 60;

const MAX_SELL_IMAGE_SIZE_BYTES = MAX_SELL_IMAGE_SIZE_MB * 1024 * 1024;
const MAX_SELL_VIDEO_SIZE_BYTES = MAX_SELL_VIDEO_SIZE_MB * 1024 * 1024;

const SUPPORTED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const SUPPORTED_VIDEO_MIME = new Set(["video/mp4", "video/webm", "video/quicktime"]);

const COLORS = {
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  border: "#E3EAF2",
  cardSoft: "#F8FBFE",
  danger: "#B91C1C",
};

export type SellMediaKind = "image" | "video";

// Archivo elegido en el navegador del cliente, todavía sin subir.
export type LocalSellMedia = {
  id: string;
  kind: SellMediaKind;
  file: File;
  name: string;
  mimeType: string;
  size: number;
  previewUrl: string;
  durationSeconds: number | null;
};

// Fila ya guardada en la tabla "sell_request_media" (la lee el admin).
export type SellRequestMediaRow = {
  id: string;
  sell_request_id: string;
  kind: SellMediaKind;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
  sort_order: number | null;
  created_at?: string | null;
};

// --- Helpers de archivo -----------------------------------------------------

function extFromName(fileName: string, fallback: string) {
  const clean = String(fileName ?? "").trim();
  const parts = clean.split(".");
  if (parts.length < 2) return fallback;
  return parts.pop()?.toLowerCase() || fallback;
}

function safeFileName(name: string) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
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
  return new File([blob], fileName, { type: mimeType, lastModified: Date.now() });
}

async function dynamicImportHeic2Any(): Promise<any> {
  try {
    const importer = new Function("m", "return import(m)") as (m: string) => Promise<any>;
    return await importer("heic2any");
  } catch {
    throw new Error("Falta la librería de conversión HEIC.");
  }
}

async function convertHeicToJpeg(file: File): Promise<File> {
  const mod = await dynamicImportHeic2Any();
  const heic2any = mod?.default ?? mod;
  if (typeof heic2any !== "function") throw new Error("No se pudo cargar el conversor HEIC.");

  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  const outputBlob = Array.isArray(converted) ? converted[0] : converted;
  if (!(outputBlob instanceof Blob)) {
    throw new Error("La conversión HEIC no devolvió una imagen válida.");
  }

  return blobToFile(outputBlob, replaceExtension(file.name, "jpg"), "image/jpeg");
}

function getVideoDurationSeconds(file: File): Promise<number> {
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

function pickFilesWeb(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve, reject) => {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      reject(new Error("La subida de archivos está preparada para la versión web."));
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.multiple = multiple;
    input.accept = accept;

    input.onchange = () => {
      resolve(Array.from(input.files ?? []));
    };

    input.click();
  });
}

export function pickSellImagesWeb() {
  return pickFilesWeb(
    "image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif",
    true
  );
}

export function pickSellVideoWeb() {
  return pickFilesWeb("video/mp4,video/webm,video/quicktime,.mov", false);
}

async function buildLocalImage(originalFile: File): Promise<LocalSellMedia> {
  let file = originalFile;

  if (isHeicLike(file)) {
    file = await convertHeicToJpeg(file);
  }

  const mimeType = String(file.type ?? "").toLowerCase() || inferMimeTypeFromName(file.name);
  if (!SUPPORTED_IMAGE_MIME.has(mimeType)) {
    throw new Error(`Formato de imagen no soportado (${mimeType || "desconocido"}).`);
  }
  if (file.size > MAX_SELL_IMAGE_SIZE_BYTES) {
    throw new Error(`Cada foto debe pesar menos de ${MAX_SELL_IMAGE_SIZE_MB}MB.`);
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    kind: "image",
    file,
    name: file.name,
    mimeType,
    size: file.size,
    previewUrl: URL.createObjectURL(file),
    durationSeconds: null,
  };
}

async function buildLocalVideo(file: File): Promise<LocalSellMedia> {
  const mimeType = String(file.type ?? "").toLowerCase() || inferMimeTypeFromName(file.name);
  if (!SUPPORTED_VIDEO_MIME.has(mimeType)) {
    throw new Error(`Formato de vídeo no soportado (${mimeType || "desconocido"}).`);
  }
  if (file.size > MAX_SELL_VIDEO_SIZE_BYTES) {
    throw new Error(`El vídeo debe pesar menos de ${MAX_SELL_VIDEO_SIZE_MB}MB.`);
  }

  let durationSeconds: number | null = null;
  try {
    durationSeconds = await getVideoDurationSeconds(file);
  } catch {
    durationSeconds = null;
  }

  if (durationSeconds !== null && durationSeconds > MAX_SELL_VIDEO_SECONDS + 0.5) {
    throw new Error(`El vídeo no puede superar ${MAX_SELL_VIDEO_SECONDS} segundos.`);
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    kind: "video",
    file,
    name: file.name,
    mimeType,
    size: file.size,
    previewUrl: URL.createObjectURL(file),
    durationSeconds,
  };
}

function buildSellMediaPath(sellRequestId: string, item: LocalSellMedia, index: number) {
  const fallbackExt = item.kind === "video" ? "mp4" : "jpg";
  const ext = extFromName(item.name, fallbackExt);
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${sellRequestId}/${stamp}-${index + 1}-${rand}-${safeFileName(item.name || item.kind)}.${ext}`;
}

/**
 * Sube cada archivo local al bucket privado y crea su fila en
 * "sell_request_media". Se llama DESPUÉS de insertar la fila en
 * "sell_requests" (hace falta su id para enlazar los archivos).
 */
export async function uploadSellRequestMedia(
  sellRequestId: string,
  images: LocalSellMedia[],
  video: LocalSellMedia | null
) {
  const items = video ? [...images, video] : images;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const path = buildSellMediaPath(sellRequestId, item, i);

    const uploadRes = await supabase.storage.from(SELL_MEDIA_BUCKET).upload(path, item.file, {
      contentType: item.mimeType,
      upsert: false,
    });
    if (uploadRes.error) throw uploadRes.error;

    const insertRes = await supabase.from("sell_request_media").insert({
      sell_request_id: sellRequestId,
      kind: item.kind,
      storage_path: path,
      file_name: item.name,
      mime_type: item.mimeType,
      size_bytes: item.size,
      duration_seconds: item.durationSeconds,
      sort_order: i,
    });
    if (insertRes.error) throw insertRes.error;
  }
}

/**
 * Descarga UN archivo al dispositivo del admin: genera una URL firmada
 * temporal (el bucket es privado) y fuerza la descarga en vez de abrirla
 * embebida — cada imagen/vídeo se baja de una en una, tal y como se pidió.
 */
export async function downloadSellRequestMedia(row: SellRequestMediaRow) {
  const { data, error } = await supabase.storage
    .from(SELL_MEDIA_BUCKET)
    .createSignedUrl(row.storage_path, 60);

  if (error || !data?.signedUrl) {
    throw error ?? new Error("No se pudo generar el enlace de descarga.");
  }

  const fileName = row.file_name || row.storage_path.split("/").pop() || "archivo";

  if (Platform.OS === "web" && typeof document !== "undefined") {
    const res = await fetch(data.signedUrl);
    if (!res.ok) throw new Error("No se pudo descargar el archivo.");

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
    return;
  }

  await Linking.openURL(data.signedUrl);
}

// --- UI: selector para el formulario público --------------------------------

function ThumbChip({
  item,
  onRemove,
  disabled,
}: {
  item: LocalSellMedia;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ width: 60, alignItems: "center", gap: 4 }}>
      <View style={{ position: "relative" }}>
        {item.kind === "image" ? (
          <Image
            source={{ uri: item.previewUrl }}
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          />
        ) : (
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.cardSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="videocam" size={22} color={COLORS.text} />
          </View>
        )}

        <Pressable
          onPress={onRemove}
          disabled={disabled}
          hitSlop={6}
          style={({ pressed }) => ({
            position: "absolute",
            top: -6,
            right: -6,
            opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
          })}
        >
          <Ionicons name="close-circle" size={20} color={COLORS.danger} />
        </Pressable>
      </View>

      {item.kind === "video" && item.durationSeconds !== null && (
        <Text style={{ color: COLORS.muted, fontSize: 10, fontWeight: "700" }}>
          {Math.round(item.durationSeconds)}s
        </Text>
      )}
    </View>
  );
}

export function SellMediaPicker({
  images,
  video,
  onImagesChange,
  onVideoChange,
  disabled,
}: {
  images: LocalSellMedia[];
  video: LocalSellMedia | null;
  onImagesChange: (next: LocalSellMedia[]) => void;
  onVideoChange: (next: LocalSellMedia | null) => void;
  disabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);

  async function handleAddImages() {
    setError(null);
    const room = MAX_SELL_IMAGES - images.length;
    if (room <= 0) {
      setError(`Ya tienes el máximo de ${MAX_SELL_IMAGES} fotos.`);
      return;
    }

    try {
      const files = await pickSellImagesWeb();
      const toProcess = files.slice(0, room);
      const skipped = files.length - toProcess.length;

      const built: LocalSellMedia[] = [];
      for (const f of toProcess) {
        built.push(await buildLocalImage(f));
      }

      onImagesChange([...images, ...built]);

      if (skipped > 0) {
        setError(`Se añadieron ${toProcess.length} foto(s); el máximo es ${MAX_SELL_IMAGES}.`);
      }
    } catch (e: any) {
      setError(e?.message ?? "No se pudieron añadir las fotos.");
    }
  }

  async function handleAddVideo() {
    setError(null);
    try {
      const files = await pickSellVideoWeb();
      const file = files[0];
      if (!file) return;

      const built = await buildLocalVideo(file);
      onVideoChange(built);
    } catch (e: any) {
      setError(e?.message ?? "No se pudo añadir el vídeo.");
    }
  }

  return (
    <View style={{ gap: 10 }}>
      {(images.length > 0 || video) && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
          {images.map((img) => (
            <ThumbChip
              key={img.id}
              item={img}
              disabled={disabled}
              onRemove={() => onImagesChange(images.filter((i) => i.id !== img.id))}
            />
          ))}
          {video && (
            <ThumbChip item={video} disabled={disabled} onRemove={() => onVideoChange(null)} />
          )}
        </View>
      )}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
        <Pressable
          onPress={handleAddImages}
          disabled={disabled || images.length >= MAX_SELL_IMAGES}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.cardSoft,
            opacity: disabled || images.length >= MAX_SELL_IMAGES ? 0.5 : pressed ? 0.9 : 1,
          })}
        >
          <Ionicons name="images-outline" size={16} color={COLORS.text} />
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13 }}>
            Añadir fotos ({images.length}/{MAX_SELL_IMAGES})
          </Text>
        </Pressable>

        <Pressable
          onPress={handleAddVideo}
          disabled={disabled || !!video}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.cardSoft,
            opacity: disabled || !!video ? 0.5 : pressed ? 0.9 : 1,
          })}
        >
          <Ionicons name="videocam-outline" size={16} color={COLORS.text} />
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13 }}>
            {video ? "Vídeo añadido" : `Añadir vídeo (máx. ${MAX_SELL_VIDEO_SECONDS}s)`}
          </Text>
        </Pressable>
      </View>

      {!!error && (
        <Text style={{ color: COLORS.danger, textAlign: "center", fontWeight: "800", fontSize: 12 }}>
          {error}
        </Text>
      )}
    </View>
  );
}
