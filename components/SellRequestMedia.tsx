/**
 * Archivo: components/SellRequestMedia.tsx
 * Función: componente y utilidades de las fotos y el vídeo del formulario «Vender ahora».
 * Para qué sirve: valida, convierte (HEIC a JPEG) y sube a Supabase Storage las fotos y el vídeo que adjunta un cliente a su solicitud de venta, y ofrece el selector visual (SellMediaPicker) y los enlaces firmados para que el administrador los vea o los descargue.
 * Conectado con: constants/theme.ts (TAMANOS, TACTIL, COLORES_TEXTO), lib/supabase.ts, tablas sell_request_media y sell_requests, bucket privado de Storage sell-request-media.
 * Utilizado por: components/VenderAhoraModal.tsx y app/admin/cotizaciones.tsx.
 * Dependencias: react, react-native, @expo/vector-icons, heic2any (conversión HEIC, ver Notas).
 * Estado: ACTIVO
 *
 * Notas: cabecera original conservada justo debajo.
 */
/**
 * Notas:
 * Qué hace: todo lo relacionado con las fotos y el vídeo que un cliente
 * adjunta al formulario "Vender ahora" (OBLIGATORIOS desde el 2026-11-16: de
 * 7 a 10 fotos y 1 vídeo de 20 a 30 segundos y hasta 60 MB; un vídeo cuya
 * duración no se puede medir se rechaza con un aviso), en un único archivo: tipos, límites, conversión HEIC
 * (fotos de iPhone), subida a Supabase Storage, descarga individual para el
 * admin, y el propio selector visual (SellMediaPicker) que se inserta en el
 * formulario.
 *
 * Cómo funciona:
 * - El bucket de Storage "sell-request-media" es PRIVADO (no público como
 *   "product-media"): las fotos de un cliente no deben quedar accesibles
 *   por URL directa. Solo un admin autenticado puede leerlas, generando una
 *   URL firmada de 60 segundos en el momento de pulsar "Descargar". Desde el
 *   2026-11-16 el panel también los enseña (miniaturas y foto en grande) con
 *   enlaces firmados de 10 minutos (enlacesSellRequestMedia), que caducan solos.
 * - Cada archivo sube a Storage y además crea una fila en la tabla
 *   "sell_request_media" (ver sql/sell_request_media.sql), enlazada a su
 *   "sell_requests" por sell_request_id — igual que "product_media" está
 *   enlazada a "products".
 * - uploadSellRequestMedia() se llama DESPUÉS de insertar la fila en
 *   "sell_requests" (necesita su id ya generado para poder enlazar los
 *   archivos). Si falla la subida, la solicitud ya guardada no se pierde:
 *   devuelve los archivos que faltan y VenderAhoraModal.tsx lo dice claro y
 *   deja «Reintentar la subida» solo con esos.
 * - Reutiliza el mismo criterio que app/admin/products/products.utils.ts
 *   (conversión HEIC→JPEG con heic2any, medir duración de vídeo con un
 *   <video> oculto) pero de forma independiente: este módulo lo usa el
 *   formulario público, así que no depende de nada del panel admin.
 * - pickSellImagesWeb/pickSellVideoWeb abren el selector de archivos del
 *   navegador (<input type="file">): la app se despliega solo como web
 *   (expo export --platform web), así que no hace falta expo-image-picker
 *   nativo aquí.
 * - Tamaños (grupo 2 de la auditoría móvil, 2026-11-12): «Añadir fotos» y
 *   «Añadir vídeo» miden 44 px de alto y la X de quitar tiene 44 px de zona
 *   táctil (TACTIL); letra mínima 13 (TAMANOS) y gris COLORES_TEXTO.
 *
 * Conectado con:
 * - constants/theme.ts → TAMANOS, TACTIL y COLORES_TEXTO.
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
import { COLORES_TEXTO, TACTIL, TAMANOS } from "../constants/theme";
import { supabase } from "../lib/supabase";

export const SELL_MEDIA_BUCKET = "sell-request-media";

// Fotos y vídeo OBLIGATORIOS (dueño, 2026-11-16): de 7 a 10 fotos y un vídeo de 20 a 30 segundos.
export const MIN_SELL_IMAGES = 7;
export const MAX_SELL_IMAGES = 10;
export const MIN_SELL_VIDEO_SECONDS = 20;
export const MAX_SELL_VIDEO_SECONDS = 30;
// Margen al medir la duración (los móviles graban 19,8 s o 30,3 s al pulsar a mano).
const MARGEN_DURACION_S = 0.5;
// Si el navegador no llega a leer la duración en este tiempo, se da por no medible.
const ESPERA_DURACION_MS = 10000;
export const AVISO_DURACION_VIDEO = `El vídeo debe durar entre ${MIN_SELL_VIDEO_SECONDS} y ${MAX_SELL_VIDEO_SECONDS} segundos.`;
export const AVISO_VIDEO_SIN_DURACION =
  "No hemos podido comprobar cuánto dura este vídeo. Prueba con otro archivo (MP4 o MOV) de 20 a 30 segundos, por ejemplo grabado con la cámara del móvil.";

/** ¿El vídeo elegido es válido para enviar? (duración medida y dentro de 20-30 s). */
export function videoEsValido(video: LocalSellMedia | null): boolean {
  const d = video?.durationSeconds;
  return typeof d === "number" && Number.isFinite(d) && duracionEnRango(d);
}

function duracionEnRango(segundos: number): boolean {
  return segundos >= MIN_SELL_VIDEO_SECONDS - MARGEN_DURACION_S && segundos <= MAX_SELL_VIDEO_SECONDS + MARGEN_DURACION_S;
}
export const MAX_SELL_IMAGE_SIZE_MB = 12;
export const MAX_SELL_VIDEO_SIZE_MB = 60;

const MAX_SELL_IMAGE_SIZE_BYTES = MAX_SELL_IMAGE_SIZE_MB * 1024 * 1024;
const MAX_SELL_VIDEO_SIZE_BYTES = MAX_SELL_VIDEO_SIZE_MB * 1024 * 1024;

const SUPPORTED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const SUPPORTED_VIDEO_MIME = new Set(["video/mp4", "video/webm", "video/quicktime"]);

const COLORS = {
  text: COLORES_TEXTO.texto,
  muted: COLORES_TEXTO.secundario,
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
    let hecho = false;
    // Algunos navegadores nunca avisan con ciertos archivos: pasado el tiempo, se da por no medible.
    const espera = setTimeout(() => terminar(null), ESPERA_DURACION_MS);

    function terminar(segundos: number | null) {
      if (hecho) return;
      hecho = true;
      clearTimeout(espera);
      URL.revokeObjectURL(url);
      // Sin duración real (0, NaN o Infinity, como pasa con algunos WebM): no se puede medir.
      if (segundos === null || !Number.isFinite(segundos) || segundos <= 0) {
        reject(new Error("No se pudo medir la duración del vídeo."));
      } else {
        resolve(segundos);
      }
    }

    video.onloadedmetadata = () => terminar(Number(video.duration));
    video.onerror = () => terminar(null);

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

  // El vídeo es obligatorio y debe durar de 20 a 30 s: si no se puede medir, se rechaza con un aviso amable.
  let durationSeconds: number;
  try {
    durationSeconds = await getVideoDurationSeconds(file);
  } catch {
    throw new Error(AVISO_VIDEO_SIN_DURACION);
  }

  if (!duracionEnRango(durationSeconds)) {
    throw new Error(`${AVISO_DURACION_VIDEO} El que has elegido dura ${Math.round(durationSeconds)} s.`);
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
 *
 * Optimización: las subidas a Storage se lanzan en paralelo (Promise.allSettled,
 * no una tras otra) y las filas de la tabla se insertan todas juntas en una
 * sola llamada — con 10 fotos + 1 vídeo esto pasa de ~22 idas y vueltas a la
 * red a 1 (el tiempo total lo marca el archivo más lento, no la suma de
 * todos). Si algún archivo falla, los que sí subieron se guardan igualmente
 * (no es todo o nada) y se DEVUELVEN los que faltan (con su orden de
 * siempre), para que VenderAhoraModal.tsx lo diga claro y ofrezca
 * «Reintentar la subida» solo con esos. Si falla el guardado de las filas,
 * cuentan como fallidos todos los de esa tanda (se vuelven a subir enteros).
 * Nunca lanza: la solicitud ya está guardada aparte.
 */
export type SellMediaPendiente = { item: LocalSellMedia; orden: number };

/** Las fotos y el vídeo, en el orden en que se guardan (sort_order): primero las fotos y al final el vídeo. */
export function listaParaSubir(images: LocalSellMedia[], video: LocalSellMedia | null): SellMediaPendiente[] {
  const items = video ? [...images, video] : images;
  return items.map((item, orden) => ({ item, orden }));
}

export async function uploadSellRequestMedia(
  sellRequestId: string,
  pendientes: SellMediaPendiente[]
): Promise<SellMediaPendiente[]> {
  if (pendientes.length === 0) return [];

  const results = await Promise.allSettled(
    pendientes.map(async ({ item, orden }) => {
      const path = buildSellMediaPath(sellRequestId, item, orden);
      const uploadRes = await supabase.storage.from(SELL_MEDIA_BUCKET).upload(path, item.file, {
        contentType: item.mimeType,
        upsert: false,
      });
      if (uploadRes.error) throw uploadRes.error;

      return {
        sell_request_id: sellRequestId,
        kind: item.kind,
        storage_path: path,
        file_name: item.name,
        mime_type: item.mimeType,
        size_bytes: item.size,
        duration_seconds: item.durationSeconds,
        sort_order: orden,
      };
    })
  );

  const rows = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const fallidos = pendientes.filter((_, i) => results[i].status !== "fulfilled");

  if (rows.length > 0) {
    try {
      const insertRes = await supabase.from("sell_request_media").insert(rows);
      if (insertRes.error) throw insertRes.error;
    } catch (e) {
      console.error("Error guardando las fotos/vídeo de la solicitud:", e);
      return pendientes;
    }
  }

  if (fallidos.length > 0) {
    console.error(`${fallidos.length} de ${pendientes.length} archivo(s) no se pudieron subir.`);
  }
  return fallidos;
}

/**
 * Enlaces firmados (10 minutos) para VER los adjuntos en el panel sin descargarlos (dueño, 2026-11-16: «no me deja
 * visualizar los archivos multimedia»). El almacén sigue siendo privado: solo un administrador puede firmarlos y el
 * enlace caduca solo. Devuelve { storage_path: url } (los que no se puedan firmar, sin entrada).
 */
export async function enlacesSellRequestMedia(rows: SellRequestMediaRow[], segundos = 600): Promise<Record<string, string>> {
  if (!rows.length) return {};
  const { data, error } = await supabase.storage.from(SELL_MEDIA_BUCKET).createSignedUrls(
    rows.map((r) => r.storage_path),
    segundos
  );
  if (error || !data) throw error ?? new Error("No se pudieron preparar los adjuntos.");
  const enlaces: Record<string, string> = {};
  for (const d of data) if (d.path && d.signedUrl) enlaces[d.path] = d.signedUrl;
  return enlaces;
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
          accessibilityRole="button"
          accessibilityLabel="Quitar"
          // Zona táctil de 44 px centrada en la misma esquina de siempre.
          style={({ pressed }) => ({
            position: "absolute",
            top: -18,
            right: -18,
            width: TACTIL.minimo,
            height: TACTIL.minimo,
            alignItems: "center",
            justifyContent: "center",
            opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
          })}
        >
          <Ionicons name="close-circle" size={20} color={COLORS.danger} />
        </Pressable>
      </View>

      {item.kind === "video" && item.durationSeconds !== null && (
        <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, fontWeight: "700" }}>
          {Math.round(item.durationSeconds)}s
        </Text>
      )}
    </View>
  );
}

// Revoca el blob URL de una previsualización que ya no se usa (al quitar un
// archivo antes de enviar el formulario). Sin esto, cada foto/vídeo quitado
// seguía ocupando memoria en el navegador hasta recargar la página.
function revokePreview(item: LocalSellMedia) {
  try {
    URL.revokeObjectURL(item.previewUrl);
  } catch {
    // no-op: algunos entornos no soportan revokeObjectURL o la url ya no es válida
  }
}

// solo="fotos" o solo="video": pinta solo esa parte (el formulario las pone en dos apartados, cada uno con su título);
// sin «solo», las dos juntas como antes.
export function SellMediaPicker({
  images,
  video,
  onImagesChange,
  onVideoChange,
  disabled,
  solo,
}: {
  images: LocalSellMedia[];
  video: LocalSellMedia | null;
  onImagesChange: (next: LocalSellMedia[]) => void;
  onVideoChange: (next: LocalSellMedia | null) => void;
  disabled?: boolean;
  solo?: "fotos" | "video";
}) {
  const [error, setError] = useState<string | null>(null);
  const verFotos = solo !== "video";
  const verVideo = solo !== "fotos";
  const faltanFotos = Math.max(0, MIN_SELL_IMAGES - images.length);

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

      // Cada archivo se procesa por separado: si uno falla (formato o tamaño
      // no válido) no se pierden los demás ya convertidos de la misma tanda,
      // y no se generan previsualizaciones "huérfanas" que nunca se liberan.
      const built: LocalSellMedia[] = [];
      const failedNames: string[] = [];
      for (const f of toProcess) {
        try {
          built.push(await buildLocalImage(f));
        } catch {
          failedNames.push(f.name);
        }
      }

      if (built.length > 0) {
        onImagesChange([...images, ...built]);
      }

      if (failedNames.length > 0) {
        setError(`No se pudieron añadir: ${failedNames.join(", ")}.`);
      } else if (skipped > 0) {
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
      {((verFotos && images.length > 0) || (verVideo && video)) && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
          {verFotos && images.map((img) => (
            <ThumbChip
              key={img.id}
              item={img}
              disabled={disabled}
              onRemove={() => {
                revokePreview(img);
                onImagesChange(images.filter((i) => i.id !== img.id));
              }}
            />
          ))}
          {verVideo && video && (
            <ThumbChip
              item={video}
              disabled={disabled}
              onRemove={() => {
                revokePreview(video);
                onVideoChange(null);
              }}
            />
          )}
        </View>
      )}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
        {verFotos && (
        <Pressable
          nativeID="vender-fotos-boton"
          onPress={handleAddImages}
          disabled={disabled || images.length >= MAX_SELL_IMAGES}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            minHeight: TACTIL.minimo,
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
        )}

        {verVideo && (
        <Pressable
          nativeID="vender-video-boton"
          onPress={handleAddVideo}
          disabled={disabled || !!video}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            minHeight: TACTIL.minimo,
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
            {video
              ? `Vídeo añadido${video.durationSeconds ? ` (${Math.round(video.durationSeconds)} s)` : ""}`
              : `Añadir vídeo (${MIN_SELL_VIDEO_SECONDS}-${MAX_SELL_VIDEO_SECONDS} s)`}
          </Text>
        </Pressable>
        )}
      </View>

      {/* Qué falta, en gris (no es un error): cuántas fotos quedan o que el vídeo es obligatorio. */}
      {verFotos && faltanFotos > 0 && !error ? (
        <Text nativeID="vender-fotos-faltan" style={{ color: COLORS.muted, textAlign: "center", fontWeight: "700", fontSize: TAMANOS.minimo }}>
          {images.length === 0
            ? `Añade al menos ${MIN_SELL_IMAGES} fotos: por delante, por detrás, los lados, los puertos y los accesorios.`
            : `Te ${faltanFotos === 1 ? "falta 1 foto" : `faltan ${faltanFotos} fotos`} para llegar al mínimo de ${MIN_SELL_IMAGES}.`}
        </Text>
      ) : null}
      {verVideo && !video && !error ? (
        <Text nativeID="vender-video-falta" style={{ color: COLORS.muted, textAlign: "center", fontWeight: "700", fontSize: TAMANOS.minimo }}>
          Graba el artículo encendido y funcionando, de {MIN_SELL_VIDEO_SECONDS} a {MAX_SELL_VIDEO_SECONDS} segundos (hasta {MAX_SELL_VIDEO_SIZE_MB} MB).
        </Text>
      ) : null}

      {!!error && (
        <Text
          nativeID={verVideo && !verFotos ? "vender-video-aviso" : "vender-fotos-aviso"}
          accessibilityLiveRegion="polite"
          style={{ color: COLORS.danger, textAlign: "center", fontWeight: "800", fontSize: TAMANOS.minimo }}
        >
          {error}
        </Text>
      )}
    </View>
  );
}
