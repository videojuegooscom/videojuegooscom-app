import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";

const MEDIA_BUCKET = "product-media";
const MAX_IMAGES = 15;
const MAX_VIDEO_SECONDS = 15;

const COLORS = {
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
};

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
};

type ProductStatus = "DRAFT" | "PUBLISHED" | "REVIEW";
type ProductCondition = "NEW" | "LIKE_NEW" | "GOOD" | "FAIR" | "PARTS";
type ProductMediaKind = "image" | "video";

type ProductMediaRow = {
  id: string;
  product_id: string;
  kind: ProductMediaKind;
  storage_path: string;
  public_url: string;
  file_name: string | null;
  mime_type: string | null;
  sort_order: number;
  is_cover: boolean;
  duration_seconds: number | null;
  created_at?: string;
};

type ProductRow = {
  id: string;
  title: string;
  description: string | null;
  price_eur: number | null;
  status: ProductStatus;
  condition: ProductCondition;
  category_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  is_featured_home?: boolean;
  media: ProductMediaRow[];
};

type StatusFilter = "ALL" | ProductStatus;
type VisibilityFilter = "ALL" | "VISIBLE" | "HIDDEN";

type LocalPickedMedia = {
  id: string;
  kind: ProductMediaKind;
  file: File;
  name: string;
  mimeType: string;
  size: number;
  previewUrl: string;
  durationSeconds: number | null;
};

function softShadow() {
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

function fmtEUR(n: number) {
  const safe = Number.isFinite(n) ? n : 0;
  return `${Math.round(safe)}€`;
}

function clampText(s: string, max = 180) {
  const t = String(s ?? "").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function toIntSafe(v: string, fallback = 0) {
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

function labelStatus(s: ProductStatus) {
  if (s === "PUBLISHED") return "Publicado";
  if (s === "REVIEW") return "Por revisar";
  return "Borrador";
}

function labelCond(c: ProductCondition) {
  if (c === "NEW") return "Nuevo";
  if (c === "LIKE_NEW") return "Como nuevo";
  if (c === "GOOD") return "Bueno";
  if (c === "FAIR") return "Regular";
  return "Para piezas";
}

function smartBackAdminHome() {
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

function statusVisual(status: ProductStatus) {
  if (status === "PUBLISHED") {
    return {
      text: "Publicado",
      borderColor: COLORS.successBorder,
      backgroundColor: COLORS.successBg,
    };
  }
  if (status === "REVIEW") {
    return {
      text: "Por revisar",
      borderColor: COLORS.warningBorder,
      backgroundColor: COLORS.warningBg,
    };
  }
  return {
    text: "Borrador",
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.06)",
  };
}

function getPrimaryMedia(media: ProductMediaRow[]) {
  if (!media?.length) return null;
  return (
    media.find((m) => m.is_cover && m.kind === "image") ||
    media.find((m) => m.kind === "image") ||
    media.find((m) => m.kind === "video") ||
    media[0]
  );
}

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

function buildMediaPath(productId: string, item: LocalPickedMedia, index: number) {
  const fallbackExt = item.kind === "video" ? "mp4" : "jpg";
  const ext = extFromName(item.name, fallbackExt);
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${productId}/${stamp}-${index + 1}-${rand}-${safeFileName(item.name || item.kind)}.${ext}`;
}

async function getVideoDurationSeconds(file: File): Promise<number> {
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

async function pickMediaFilesWeb(): Promise<LocalPickedMedia[]> {
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
        });
      }

      resolve(out);
    };

    input.click();
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

function StatCard({
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

function ChipButton({
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

function FilterPill({
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

function MediaThumb({
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

export default function AdminProducts() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const isDesktopish = widthSafe >= 1024;
  const pagePadding = isMobile ? 12 : 16;

  const [loading, setLoading] = useState(true);
  const [screenErr, setScreenErr] = useState<string | null>(null);

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [items, setItems] = useState<ProductRow[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("ALL");

  const [supportsFeaturedHome, setSupportsFeaturedHome] = useState(true);
  const [supportsProductMedia, setSupportsProductMedia] = useState(true);

  const itemsRef = useRef<ProductRow[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<ProductRow | null>(null);

  const [editing, setEditing] = useState<ProductRow | null>(null);
  const isEdit = !!editing;

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState<ProductStatus>("DRAFT");
  const [condition, setCondition] = useState<ProductCondition>("GOOD");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [isFeaturedHome, setIsFeaturedHome] = useState(false);

  const [existingMedia, setExistingMedia] = useState<ProductMediaRow[]>([]);
  const [removedMedia, setRemovedMedia] = useState<ProductMediaRow[]>([]);
  const [newMedia, setNewMedia] = useState<LocalPickedMedia[]>([]);

  useEffect(() => {
    return () => {
      newMedia.forEach((m) => {
        try {
          URL.revokeObjectURL(m.previewUrl);
        } catch {
          // ignore
        }
      });
    };
  }, [newMedia]);

  const categoryName = useMemo(() => {
    if (!categoryId) return "Sin categoría";
    return categories.find((c) => c.id === categoryId)?.name ?? "Sin categoría";
  }, [categoryId, categories]);

  const activeCategories = useMemo(() => categories.filter((c) => !!c.is_active), [categories]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();

    return items.filter((p) => {
      const matchesSearch =
        !q ||
        String(p.title ?? "").toLowerCase().includes(q) ||
        String(p.description ?? "").toLowerCase().includes(q);

      const matchesStatus = statusFilter === "ALL" || p.status === statusFilter;

      const matchesVisibility =
        visibilityFilter === "ALL" ||
        (visibilityFilter === "VISIBLE" && !!p.is_active) ||
        (visibilityFilter === "HIDDEN" && !p.is_active);

      return matchesSearch && matchesStatus && matchesVisibility;
    });
  }, [items, search, statusFilter, visibilityFilter]);

  const stats = useMemo(() => {
    const total = items.length;
    const published = items.filter((x) => x.status === "PUBLISHED").length;
    const visible = items.filter((x) => !!x.is_active).length;
    const featured = items.filter((x) => !!x.is_featured_home).length;

    return { total, published, visible, featured };
  }, [items]);

  const currentImageCount = useMemo(
    () => existingMedia.filter((m) => m.kind === "image").length + newMedia.filter((m) => m.kind === "image").length,
    [existingMedia, newMedia]
  );

  const currentVideoCount = useMemo(
    () => existingMedia.filter((m) => m.kind === "video").length + newMedia.filter((m) => m.kind === "video").length,
    [existingMedia, newMedia]
  );

  async function normalizeMediaForProduct(productId: string) {
    const { data, error } = await supabase
      .from("product_media")
      .select(
        "id,product_id,kind,storage_path,public_url,file_name,mime_type,sort_order,is_cover,duration_seconds,created_at"
      )
      .eq("product_id", productId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw error;

    const rows = (data ?? []) as ProductMediaRow[];
    const firstImage = rows.find((m) => m.kind === "image");

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const shouldCover = !!firstImage && row.id === firstImage.id;
      const shouldOrder = i;

      if (row.sort_order !== shouldOrder || row.is_cover !== shouldCover) {
        await supabase
          .from("product_media")
          .update({
            sort_order: shouldOrder,
            is_cover: shouldCover,
          })
          .eq("id", row.id);

        row.sort_order = shouldOrder;
        row.is_cover = shouldCover;
      }
    }

    return rows;
  }

  async function load() {
    setLoading(true);
    setScreenErr(null);

    try {
      const [catsRes, prodRes] = await Promise.all([
        supabase
          .from("categories")
          .select("id,name,slug,sort_order,is_active")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("products")
          .select(
            "id,title,description,price_eur,status,condition,category_id,is_active,created_at,updated_at,is_featured_home"
          )
          .order("updated_at", { ascending: false }),
      ]);

      if (catsRes.error) throw catsRes.error;

      let supportsFeatured = true;
      let productsData: ProductRow[] = [];

      if (prodRes.error) {
        const msg = String(prodRes.error.message ?? "");
        const featuredColumnMissing =
          msg.includes("is_featured_home") && (msg.includes("column") || msg.includes("does not exist"));

        if (featuredColumnMissing) {
          const fallbackRes = await supabase
            .from("products")
            .select("id,title,description,price_eur,status,condition,category_id,is_active,created_at,updated_at")
            .order("updated_at", { ascending: false });

          if (fallbackRes.error) throw fallbackRes.error;

          supportsFeatured = false;
          productsData = ((fallbackRes.data ?? []) as any[]).map((row) => ({
            ...row,
            is_featured_home: false,
            media: [],
          }));
        } else {
          throw prodRes.error;
        }
      } else {
        productsData = ((prodRes.data ?? []) as any[]).map((row) => ({
          ...row,
          media: [],
        }));
      }

      let supportsMedia = true;
      const mediaRes = await supabase
        .from("product_media")
        .select(
          "id,product_id,kind,storage_path,public_url,file_name,mime_type,sort_order,is_cover,duration_seconds,created_at"
        )
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (mediaRes.error) {
        const mediaMsg = String(mediaRes.error.message ?? "").toLowerCase();
        if (
          mediaMsg.includes("product_media") ||
          mediaMsg.includes("relation") ||
          mediaMsg.includes("does not exist") ||
          mediaMsg.includes("schema cache")
        ) {
          supportsMedia = false;
        } else {
          throw mediaRes.error;
        }
      }

      const mediaRows = supportsMedia ? ((mediaRes.data ?? []) as ProductMediaRow[]) : [];
      const mediaByProduct = new Map<string, ProductMediaRow[]>();

      for (const media of mediaRows) {
        const list = mediaByProduct.get(media.product_id) ?? [];
        list.push(media);
        mediaByProduct.set(media.product_id, list);
      }

      const merged = productsData.map((item) => ({
        ...item,
        media: mediaByProduct.get(item.id) ?? [],
      }));

      setSupportsFeaturedHome(supportsFeatured);
      setSupportsProductMedia(supportsMedia);
      setCategories((catsRes.data ?? []) as CategoryRow[]);
      setItems(merged);
    } catch (e: any) {
      setScreenErr(e?.message ?? "Error cargando productos.");
      setCategories([]);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function resetForm() {
    setEditing(null);
    setTitle("");
    setDesc("");
    setPrice("");
    setStatus("DRAFT");
    setCondition("GOOD");
    setCategoryId(null);
    setIsActive(true);
    setIsFeaturedHome(false);
    setExistingMedia([]);
    setRemovedMedia([]);
    newMedia.forEach((m) => {
      try {
        URL.revokeObjectURL(m.previewUrl);
      } catch {
        // ignore
      }
    });
    setNewMedia([]);
    setModalErr(null);
  }

  function openCreate() {
    resetForm();
    setOpen(true);
  }

  function openEditProduct(p: ProductRow) {
    resetForm();
    setEditing(p);
    setTitle(p.title ?? "");
    setDesc(p.description ?? "");
    setPrice(String(p.price_eur ?? 0));
    setStatus(p.status ?? "DRAFT");
    setCondition(p.condition ?? "GOOD");
    setCategoryId(p.category_id ?? null);
    setIsActive(!!p.is_active);
    setIsFeaturedHome(!!p.is_featured_home);
    setExistingMedia([...(p.media ?? [])].sort((a, b) => a.sort_order - b.sort_order));
    setModalErr(null);
    setOpen(true);
  }

  async function addMediaFromPicker() {
    setModalErr(null);

    if (!supportsProductMedia) {
      setModalErr("Primero ejecuta la migración SQL de product_media y el bucket product-media.");
      return;
    }

    try {
      const picked = await pickMediaFilesWeb();
      if (!picked.length) return;

      const pickedImages = picked.filter((m) => m.kind === "image");
      const pickedVideos = picked.filter((m) => m.kind === "video");

      if (pickedVideos.length > 1) {
        setModalErr("Solo se permite 1 vídeo por producto.");
        picked.forEach((m) => URL.revokeObjectURL(m.previewUrl));
        return;
      }

      if (currentImageCount + pickedImages.length > MAX_IMAGES) {
        setModalErr(`Máximo ${MAX_IMAGES} imágenes por producto.`);
        picked.forEach((m) => URL.revokeObjectURL(m.previewUrl));
        return;
      }

      if (currentVideoCount + pickedVideos.length > 1) {
        setModalErr("Solo se permite 1 vídeo por producto.");
        picked.forEach((m) => URL.revokeObjectURL(m.previewUrl));
        return;
      }

      const invalidDuration = pickedVideos.find(
        (v) => !v.durationSeconds || Number(v.durationSeconds) > MAX_VIDEO_SECONDS
      );

      if (invalidDuration) {
        setModalErr(`El vídeo no puede superar ${MAX_VIDEO_SECONDS} segundos.`);
        picked.forEach((m) => URL.revokeObjectURL(m.previewUrl));
        return;
      }

      const invalidType = picked.find((m) => m.kind === "video" && !m.mimeType.startsWith("video/"));
      if (invalidType) {
        setModalErr("El vídeo seleccionado no es válido.");
        picked.forEach((m) => URL.revokeObjectURL(m.previewUrl));
        return;
      }

      setNewMedia((prev) => [...prev, ...picked]);
    } catch (e: any) {
      setModalErr(e?.message ?? "No se pudieron seleccionar archivos.");
    }
  }

  function removeNewMedia(id: string) {
    setNewMedia((prev) => {
      const found = prev.find((m) => m.id === id);
      if (found) {
        try {
          URL.revokeObjectURL(found.previewUrl);
        } catch {
          // ignore
        }
      }
      return prev.filter((m) => m.id !== id);
    });
  }

  function removeExistingMedia(id: string) {
    setExistingMedia((prev) => {
      const found = prev.find((m) => m.id === id);
      if (found) {
        setRemovedMedia((curr) => [...curr, found]);
      }
      return prev.filter((m) => m.id !== id);
    });
  }

  async function uploadNewMedia(productId: string) {
    if (!newMedia.length) return [];

    const startIndex = existingMedia.length;
    const uploadedRows: ProductMediaRow[] = [];

    for (let i = 0; i < newMedia.length; i++) {
      const item = newMedia[i];
      const storagePath = buildMediaPath(productId, item, startIndex + i);

      const uploadRes = await supabase.storage.from(MEDIA_BUCKET).upload(storagePath, item.file, {
        cacheControl: "3600",
        upsert: false,
        contentType: item.mimeType || undefined,
      });

      if (uploadRes.error) throw uploadRes.error;

      const { data: publicData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath);

      const rowPayload = {
        product_id: productId,
        kind: item.kind,
        storage_path: storagePath,
        public_url: publicData.publicUrl,
        file_name: item.name,
        mime_type: item.mimeType || null,
        sort_order: startIndex + i,
        is_cover: false,
        duration_seconds: item.kind === "video" ? item.durationSeconds ?? null : null,
      };

      const insertRes = await supabase
        .from("product_media")
        .insert(rowPayload)
        .select(
          "id,product_id,kind,storage_path,public_url,file_name,mime_type,sort_order,is_cover,duration_seconds,created_at"
        )
        .single();

      if (insertRes.error) throw insertRes.error;
      uploadedRows.push(insertRes.data as ProductMediaRow);
    }

    return uploadedRows;
  }

  async function deleteRemovedMedia() {
    if (!removedMedia.length) return;

    const paths = removedMedia.map((m) => m.storage_path).filter(Boolean);
    const ids = removedMedia.map((m) => m.id);

    if (paths.length) {
      const storageDelete = await supabase.storage.from(MEDIA_BUCKET).remove(paths);
      if (storageDelete.error) throw storageDelete.error;
    }

    const dbDelete = await supabase.from("product_media").delete().in("id", ids);
    if (dbDelete.error) throw dbDelete.error;
  }

  async function save() {
    if (saving) return;

    setSaving(true);
    setModalErr(null);

    const cleanTitle = title.trim();
    const cleanDesc = desc.trim();
    const priceEur = toIntSafe(price, 0);

    if (!cleanTitle) {
      setModalErr("Pon un título.");
      setSaving(false);
      return;
    }

    if (cleanTitle.length < 3) {
      setModalErr("El título es demasiado corto.");
      setSaving(false);
      return;
    }

    if (priceEur < 0) {
      setModalErr("Precio inválido.");
      setSaving(false);
      return;
    }

    const totalImages =
      existingMedia.filter((m) => m.kind === "image").length + newMedia.filter((m) => m.kind === "image").length;
    const totalVideos =
      existingMedia.filter((m) => m.kind === "video").length + newMedia.filter((m) => m.kind === "video").length;

    if (totalImages > MAX_IMAGES) {
      setModalErr(`Máximo ${MAX_IMAGES} imágenes por producto.`);
      setSaving(false);
      return;
    }

    if (totalVideos > 1) {
      setModalErr("Solo se permite 1 vídeo por producto.");
      setSaving(false);
      return;
    }

    const invalidVideo = newMedia.find(
      (m) => m.kind === "video" && (!m.durationSeconds || m.durationSeconds > MAX_VIDEO_SECONDS)
    );
    if (invalidVideo) {
      setModalErr(`El vídeo no puede superar ${MAX_VIDEO_SECONDS} segundos.`);
      setSaving(false);
      return;
    }

    const payload: any = {
      title: cleanTitle,
      description: cleanDesc || null,
      price_eur: priceEur,
      status,
      condition,
      category_id: categoryId,
      is_active: isActive,
    };

    if (supportsFeaturedHome) {
      payload.is_featured_home = !!isFeaturedHome;
    }

    try {
      let productId = editing?.id ?? null;

      if (editing) {
        const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("products").insert(payload).select("id").single();
        if (error) throw error;
        productId = data?.id ?? null;
      }

      if (!productId) {
        throw new Error("No se pudo resolver el producto para subir archivos.");
      }

      if (supportsProductMedia) {
        await deleteRemovedMedia();
        await uploadNewMedia(productId);
        await normalizeMediaForProduct(productId);
      }

      setOpen(false);
      resetForm();
      await load();
    } catch (e: any) {
      setModalErr(e?.message ?? "Error guardando producto.");
    } finally {
      setSaving(false);
    }
  }

  function askRemove(p: ProductRow) {
    setConfirmDelete(p);
  }

  async function removeProductConfirmed() {
    const p = confirmDelete;
    if (!p) return;

    setConfirmDelete(null);
    setScreenErr(null);

    try {
      if (supportsProductMedia && p.media?.length) {
        const paths = p.media.map((m) => m.storage_path).filter(Boolean);
        if (paths.length) {
          const storageRes = await supabase.storage.from(MEDIA_BUCKET).remove(paths);
          if (storageRes.error) throw storageRes.error;
        }
      }

      const { error } = await supabase.from("products").delete().eq("id", p.id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      setScreenErr(e?.message ?? "Error borrando producto.");
    }
  }

  async function quickPublish(p: ProductRow) {
    const prev = itemsRef.current;
    const next = prev.map((x) =>
      x.id === p.id ? { ...x, status: "PUBLISHED" as ProductStatus } : x
    );
    setItems(next);

    const { error } = await supabase.from("products").update({ status: "PUBLISHED" }).eq("id", p.id);
    if (error) {
      setItems(prev);
      setScreenErr(error.message);
    }
  }

  async function toggleActive(p: ProductRow) {
    const prev = itemsRef.current;
    const next = prev.map((x) => (x.id === p.id ? { ...x, is_active: !x.is_active } : x));
    setItems(next);

    const { error } = await supabase.from("products").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) {
      setItems(prev);
      setScreenErr(error.message);
    }
  }

  async function toggleFeaturedHome(p: ProductRow) {
    if (!supportsFeaturedHome) {
      setScreenErr(
        "Tu tabla products todavía no tiene la columna is_featured_home. Si quieres usar destacado en home, hay que crearla."
      );
      return;
    }

    const nextValue = !p.is_featured_home;
    const prev = itemsRef.current;

    const next = prev.map((x) => {
      if (nextValue) {
        return { ...x, is_featured_home: x.id === p.id };
      }
      if (x.id === p.id) {
        return { ...x, is_featured_home: false };
      }
      return x;
    });

    setItems(next);

    try {
      if (nextValue) {
        const currentFeatured = prev.find((x) => x.is_featured_home && x.id !== p.id);

        if (currentFeatured) {
          await supabase.from("products").update({ is_featured_home: false }).eq("id", currentFeatured.id);
        }
      }

      const { error } = await supabase
        .from("products")
        .update({ is_featured_home: nextValue })
        .eq("id", p.id);

      if (error) throw error;
    } catch (e: any) {
      setItems(prev);
      setScreenErr(e?.message ?? "Error cambiando producto destacado.");
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="light-content" />

      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.06)",
          paddingHorizontal: pagePadding,
          paddingTop: isMobile ? 12 : 14,
          paddingBottom: isMobile ? 12 : 12,
          gap: 12,
        }}
      >
        <View
          style={{
            flexDirection: isMobile ? "column" : "row",
            justifyContent: "space-between",
            alignItems: isMobile ? "stretch" : "center",
            gap: 10,
          }}
        >
          <View style={{ flex: isMobile ? undefined : 1, paddingRight: isMobile ? 0 : 10 }}>
            <Text
              style={{
                color: COLORS.text,
                fontSize: isMobile ? 22 : 24,
                fontWeight: "900",
                lineHeight: isMobile ? 28 : 30,
              }}
            >
              Productos
            </Text>
            <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 20 }}>
              Crear, editar, publicar y controlar la visibilidad real del catálogo.
            </Text>
          </View>

          <Pressable
            onPress={smartBackAdminHome}
            style={({ pressed }) => ({
              opacity: pressed ? 0.88 : 1,
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: "rgba(255,255,255,0.05)",
              alignSelf: isMobile ? "flex-start" : "auto",
            })}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>← Volver</Text>
          </Pressable>
        </View>

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 10,
            justifyContent: "space-between",
          }}
        >
          <StatCard label="Total" value={String(stats.total)} icon="📦" isMobile={isMobile} compact />
          <StatCard label="Publicados" value={String(stats.published)} icon="✅" isMobile={isMobile} compact />
          <StatCard label="Visibles" value={String(stats.visible)} icon="👁️" isMobile={isMobile} compact />
          <StatCard label="Destacados home" value={String(stats.featured)} icon="🔥" isMobile={isMobile} compact />
        </View>

        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.card,
            padding: isMobile ? 12 : 12,
            gap: 10,
          }}
        >
          <TextInput
            value={search}
            onChangeText={(v) => setSearch(v)}
            placeholder="Buscar por título o descripción"
            placeholderTextColor="rgba(255,255,255,0.45)"
            style={{
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 12,
              color: COLORS.text,
              backgroundColor: "rgba(255,255,255,0.03)",
              fontSize: isMobile ? 14 : 15,
            }}
          />

          <View style={{ gap: 8 }}>
            <Text style={{ color: COLORS.muted, fontWeight: "800" }}>Estado</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <FilterPill label="Todos" active={statusFilter === "ALL"} onPress={() => setStatusFilter("ALL")} isMobile={isMobile} />
              <FilterPill label="Borrador" active={statusFilter === "DRAFT"} onPress={() => setStatusFilter("DRAFT")} isMobile={isMobile} />
              <FilterPill label="Por revisar" active={statusFilter === "REVIEW"} onPress={() => setStatusFilter("REVIEW")} isMobile={isMobile} />
              <FilterPill label="Publicado" active={statusFilter === "PUBLISHED"} onPress={() => setStatusFilter("PUBLISHED")} isMobile={isMobile} />
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: COLORS.muted, fontWeight: "800" }}>Visibilidad</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <FilterPill label="Todos" active={visibilityFilter === "ALL"} onPress={() => setVisibilityFilter("ALL")} isMobile={isMobile} />
              <FilterPill label="Visibles" active={visibilityFilter === "VISIBLE"} onPress={() => setVisibilityFilter("VISIBLE")} isMobile={isMobile} />
              <FilterPill label="Ocultos" active={visibilityFilter === "HIDDEN"} onPress={() => setVisibilityFilter("HIDDEN")} isMobile={isMobile} />
            </View>
          </View>

          <Pressable
            onPress={openCreate}
            style={({ pressed }) => ({
              opacity: pressed ? 0.9 : 1,
              borderRadius: 14,
              paddingVertical: 13,
              alignItems: "center",
              backgroundColor: COLORS.accent,
              ...softShadow(),
            })}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>+ Nuevo producto</Text>
          </Pressable>
        </View>

        {!!screenErr && (
          <View
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: COLORS.dangerBorder,
              backgroundColor: COLORS.dangerBg,
              padding: 10,
            }}
          >
            <Text style={{ color: COLORS.danger, fontWeight: "800", lineHeight: 20 }}>{screenErr}</Text>
          </View>
        )}

        {!supportsProductMedia && (
          <View
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: COLORS.warningBorder,
              backgroundColor: COLORS.warningBg,
              padding: 10,
            }}
          >
            <Text style={{ color: COLORS.warning, fontWeight: "800", lineHeight: 20 }}>
              Falta la estructura de media. Ejecuta la migración SQL de{" "}
              <Text style={{ fontWeight: "900" }}>product_media</Text> y el bucket{" "}
              <Text style={{ fontWeight: "900" }}>product-media</Text> para subir imágenes y vídeos.
            </Text>
          </View>
        )}

        {!supportsFeaturedHome && (
          <View
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: COLORS.warningBorder,
              backgroundColor: COLORS.warningBg,
              padding: 10,
            }}
          >
            <Text style={{ color: COLORS.warning, fontWeight: "800", lineHeight: 20 }}>
              La columna <Text style={{ fontWeight: "900" }}>is_featured_home</Text> no existe en tu tabla{" "}
              <Text style={{ fontWeight: "900" }}>products</Text>. El destacado de home queda desactivado hasta crearla.
            </Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator color={COLORS.text} />
          <Text style={{ color: COLORS.muted }}>Cargando productos…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: pagePadding,
            paddingBottom: 30,
            gap: 12,
          }}
        >
          {filteredItems.length === 0 ? (
            <View
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.card,
                padding: isMobile ? 14 : 16,
                gap: 8,
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
                No hay productos para este filtro.
              </Text>
              <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                Cambia la búsqueda o crea el primero. Un catálogo vacío no vende ni aunque rece.
              </Text>
            </View>
          ) : (
            filteredItems.map((p) => {
              const catName = p.category_id
                ? categories.find((c) => c.id === p.category_id)?.name ?? "Categoría"
                : "Sin categoría";

              const statusUi = statusVisual(p.status);
              const primaryMedia = getPrimaryMedia(p.media);
              const imageCount = p.media.filter((m) => m.kind === "image").length;
              const hasVideo = p.media.some((m) => m.kind === "video");

              return (
                <View
                  key={p.id}
                  style={{
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: COLORS.card,
                    padding: isMobile ? 12 : 14,
                    gap: 12,
                    ...softShadow(),
                  }}
                >
                  <View
                    style={{
                      flexDirection: isDesktopish ? "row" : "column",
                      gap: 14,
                      alignItems: isDesktopish ? "flex-start" : "stretch",
                    }}
                  >
                    <View
                      style={{
                        width: isDesktopish ? 110 : "100%",
                        height: isDesktopish ? 110 : isMobile ? 190 : 220,
                        borderRadius: 16,
                        overflow: "hidden",
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        backgroundColor: "rgba(255,255,255,0.04)",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {primaryMedia?.kind === "image" ? (
                        <Image
                          source={{ uri: primaryMedia.public_url }}
                          resizeMode="cover"
                          style={{ width: "100%", height: "100%" }}
                        />
                      ) : primaryMedia?.kind === "video" ? (
                        <View style={{ alignItems: "center", justifyContent: "center", gap: 8 }}>
                          <Text style={{ fontSize: 30 }}>🎬</Text>
                          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                            Vídeo
                          </Text>
                        </View>
                      ) : (
                        <Text style={{ fontSize: 28 }}>🎮</Text>
                      )}
                    </View>

                    <View style={{ flex: 1, gap: 10 }}>
                      <View
                        style={{
                          flexDirection: isMobile ? "column" : "row",
                          justifyContent: "space-between",
                          alignItems: isMobile ? "stretch" : "flex-start",
                          gap: 12,
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              color: COLORS.text,
                              fontWeight: "900",
                              fontSize: isMobile ? 16 : 17,
                              lineHeight: isMobile ? 22 : 22,
                            }}
                          >
                            {p.title}
                          </Text>

                          <View
                            style={{
                              flexDirection: "row",
                              flexWrap: "wrap",
                              gap: 8,
                              marginTop: 8,
                            }}
                          >
                            <View
                              style={{
                                paddingVertical: 6,
                                paddingHorizontal: 10,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: statusUi.borderColor,
                                backgroundColor: statusUi.backgroundColor,
                              }}
                            >
                              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                                {statusUi.text}
                              </Text>
                            </View>

                            <View
                              style={{
                                paddingVertical: 6,
                                paddingHorizontal: 10,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: COLORS.border,
                                backgroundColor: "rgba(255,255,255,0.06)",
                              }}
                            >
                              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                                {labelCond(p.condition)}
                              </Text>
                            </View>

                            <View
                              style={{
                                paddingVertical: 6,
                                paddingHorizontal: 10,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: COLORS.border,
                                backgroundColor: "rgba(255,255,255,0.06)",
                              }}
                            >
                              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                                {catName}
                              </Text>
                            </View>

                            <View
                              style={{
                                paddingVertical: 6,
                                paddingHorizontal: 10,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: COLORS.border,
                                backgroundColor: "rgba(255,255,255,0.06)",
                              }}
                            >
                              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                                {imageCount} foto{imageCount === 1 ? "" : "s"}
                                {hasVideo ? " + vídeo" : ""}
                              </Text>
                            </View>

                            {!!p.is_featured_home && (
                              <View
                                style={{
                                  paddingVertical: 6,
                                  paddingHorizontal: 10,
                                  borderRadius: 999,
                                  borderWidth: 1,
                                  borderColor: COLORS.warningBorder,
                                  backgroundColor: COLORS.warningBg,
                                }}
                              >
                                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                                  🔥 Home
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>

                        <View
                          style={{
                            alignItems: isMobile ? "flex-start" : "flex-end",
                            gap: 10,
                          }}
                        >
                          <Text
                            style={{
                              color: COLORS.gold,
                              fontWeight: "900",
                              fontSize: isMobile ? 17 : 18,
                            }}
                          >
                            {fmtEUR(Number(p.price_eur ?? 0))}
                          </Text>

                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <Text style={{ color: COLORS.muted, fontWeight: "800" }}>
                              {p.is_active ? "Visible" : "Oculto"}
                            </Text>
                            <Switch value={p.is_active} onValueChange={() => toggleActive(p)} />
                          </View>
                        </View>
                      </View>

                      {!!p.description && (
                        <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                          {clampText(p.description, isMobile ? 140 : 200)}
                        </Text>
                      )}

                      <Text style={{ color: COLORS.muted2, fontSize: 12, lineHeight: 17 }}>
                        Creado: {p.created_at ? new Date(p.created_at).toLocaleString() : "-"} ·
                        Actualizado: {p.updated_at ? new Date(p.updated_at).toLocaleString() : "-"}
                      </Text>

                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                        <ChipButton label="Editar" variant="primary" onPress={() => openEditProduct(p)} isMobile={isMobile} />

                        {p.status !== "PUBLISHED" ? (
                          <ChipButton label="Publicar" variant="success" onPress={() => quickPublish(p)} isMobile={isMobile} />
                        ) : null}

                        {supportsFeaturedHome ? (
                          <ChipButton
                            label={p.is_featured_home ? "Quitar destacado" : "Destacar en home"}
                            onPress={() => toggleFeaturedHome(p)}
                            isMobile={isMobile}
                          />
                        ) : null}

                        <ChipButton label="Borrar" variant="danger" onPress={() => askRemove(p)} isMobile={isMobile} />
                      </View>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.60)",
            padding: isMobile ? 10 : 16,
            justifyContent: "center",
          }}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={{
                borderRadius: 20,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.bg2,
                padding: isMobile ? 14 : 16,
                gap: 12,
                ...softShadow(),
              }}
            >
              <Text
                style={{
                  color: COLORS.text,
                  fontSize: isMobile ? 19 : 20,
                  fontWeight: "900",
                }}
              >
                {isEdit ? "Editar producto" : "Nuevo producto"}
              </Text>

              <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                Hasta {MAX_IMAGES} imágenes y 1 vídeo de máximo {MAX_VIDEO_SECONDS} segundos.
              </Text>

              <TextInput
                value={title}
                onChangeText={(v) => {
                  setTitle(v);
                  setModalErr(null);
                }}
                placeholder="Título (ej: PS5 Slim 1TB)"
                placeholderTextColor="rgba(255,255,255,0.45)"
                style={{
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  color: COLORS.text,
                  backgroundColor: "rgba(255,255,255,0.03)",
                  fontSize: 14,
                }}
              />

              <TextInput
                value={desc}
                onChangeText={(v) => {
                  setDesc(v);
                  setModalErr(null);
                }}
                placeholder="Descripción"
                placeholderTextColor="rgba(255,255,255,0.45)"
                multiline
                style={{
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  color: COLORS.text,
                  minHeight: isMobile ? 88 : 96,
                  textAlignVertical: "top",
                  backgroundColor: "rgba(255,255,255,0.03)",
                  fontSize: 14,
                }}
              />

              <TextInput
                value={price}
                onChangeText={(v) => {
                  setPrice(v);
                  setModalErr(null);
                }}
                placeholder="Precio € (ej: 239)"
                placeholderTextColor="rgba(255,255,255,0.45)"
                keyboardType="numeric"
                style={{
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  color: COLORS.text,
                  backgroundColor: "rgba(255,255,255,0.03)",
                  fontSize: 14,
                }}
              />

              <SectionTitle
                title="Media del producto"
                subtitle="Sube fotos reales y, si quieres, un vídeo corto enseñando el artículo."
                isMobile={isMobile}
              />

              <View
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.cardSoft,
                  padding: 12,
                  gap: 12,
                }}
              >
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  <ChipButton
                    label="Añadir imágenes / vídeo"
                    variant="primary"
                    onPress={addMediaFromPicker}
                    isMobile={isMobile}
                  />
                </View>

                <Text style={{ color: COLORS.muted, lineHeight: 19 }}>
                  Ahora mismo: {currentImageCount}/{MAX_IMAGES} imágenes · {currentVideoCount}/1 vídeo
                </Text>

                {!!existingMedia.length && (
                  <View style={{ gap: 8 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>Media actual</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        {existingMedia.map((m) => (
                          <MediaThumb
                            key={m.id}
                            media={m}
                            isMobile={isMobile}
                            onRemove={() => removeExistingMedia(m.id)}
                          />
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                )}

                {!!newMedia.length && (
                  <View style={{ gap: 8 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>Media nueva pendiente</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        {newMedia.map((m) => (
                          <MediaThumb
                            key={m.id}
                            media={m}
                            isMobile={isMobile}
                            onRemove={() => removeNewMedia(m.id)}
                          />
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                )}
              </View>

              <Text style={{ color: COLORS.muted, fontWeight: "800" }}>Estado</Text>
              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                {(["DRAFT", "REVIEW", "PUBLISHED"] as ProductStatus[]).map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => setStatus(s)}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.88 : 1,
                      borderRadius: 999,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderWidth: 1,
                      borderColor: status === s ? COLORS.accentBorder : "rgba(255,255,255,0.14)",
                      backgroundColor: status === s ? COLORS.accent2 : "rgba(255,255,255,0.06)",
                    })}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13 }}>
                      {labelStatus(s)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={{ color: COLORS.muted, fontWeight: "800" }}>Condición</Text>
              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                {(["NEW", "LIKE_NEW", "GOOD", "FAIR", "PARTS"] as ProductCondition[]).map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setCondition(c)}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.88 : 1,
                      borderRadius: 999,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderWidth: 1,
                      borderColor: condition === c ? COLORS.accentBorder : "rgba(255,255,255,0.14)",
                      backgroundColor: condition === c ? COLORS.accent2 : "rgba(255,255,255,0.06)",
                    })}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13 }}>
                      {labelCond(c)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={{ color: COLORS.muted, fontWeight: "800", lineHeight: 20 }}>
                Categoría actual: <Text style={{ color: COLORS.text, fontWeight: "900" }}>{categoryName}</Text>
              </Text>

              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                <Pressable
                  onPress={() => setCategoryId(null)}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.88 : 1,
                    borderRadius: 999,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderWidth: 1,
                    borderColor: !categoryId ? COLORS.accentBorder : "rgba(255,255,255,0.14)",
                    backgroundColor: !categoryId ? COLORS.accent2 : "rgba(255,255,255,0.06)",
                  })}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13 }}>
                    Sin categoría
                  </Text>
                </Pressable>

                {activeCategories.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => setCategoryId(c.id)}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.88 : 1,
                      borderRadius: 999,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderWidth: 1,
                      borderColor: categoryId === c.id ? COLORS.accentBorder : "rgba(255,255,255,0.14)",
                      backgroundColor: categoryId === c.id ? COLORS.accent2 : "rgba(255,255,255,0.06)",
                    })}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13 }}>
                      {c.name}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.cardSoft,
                  padding: 12,
                  gap: 12,
                }}
              >
                <View
                  style={{
                    flexDirection: isMobile ? "column" : "row",
                    justifyContent: "space-between",
                    alignItems: isMobile ? "stretch" : "center",
                    gap: 10,
                  }}
                >
                  <View style={{ flex: 1, paddingRight: isMobile ? 0 : 12 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>Producto activo</Text>
                    <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 18 }}>
                      Si está activo, puede mostrarse en tienda según estado y filtros públicos.
                    </Text>
                  </View>
                  <Switch value={isActive} onValueChange={setIsActive} />
                </View>

                {supportsFeaturedHome ? (
                  <View
                    style={{
                      flexDirection: isMobile ? "column" : "row",
                      justifyContent: "space-between",
                      alignItems: isMobile ? "stretch" : "center",
                      gap: 10,
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: isMobile ? 0 : 12 }}>
                      <Text style={{ color: COLORS.text, fontWeight: "900" }}>Destacar en home</Text>
                      <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 18 }}>
                        Marca este producto como oferta destacada principal de la home.
                      </Text>
                    </View>
                    <Switch value={isFeaturedHome} onValueChange={setIsFeaturedHome} />
                  </View>
                ) : null}
              </View>

              {!!modalErr && (
                <View
                  style={{
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: COLORS.dangerBorder,
                    backgroundColor: COLORS.dangerBg,
                    padding: 10,
                  }}
                >
                  <Text style={{ color: COLORS.danger, fontWeight: "800", lineHeight: 20 }}>
                    {modalErr}
                  </Text>
                </View>
              )}

              <View
                style={{
                  flexDirection: isMobile ? "column" : "row",
                  gap: 10,
                  justifyContent: "flex-end",
                  marginTop: 4,
                }}
              >
                <Pressable
                  onPress={() => {
                    setOpen(false);
                    resetForm();
                  }}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.88 : 1,
                    borderRadius: 999,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: "rgba(255,255,255,0.06)",
                    width: isMobile ? "100%" : undefined,
                  })}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>
                    Cancelar
                  </Text>
                </Pressable>

                <Pressable
                  onPress={save}
                  disabled={saving}
                  style={({ pressed }) => ({
                    opacity: saving ? 0.6 : pressed ? 0.9 : 1,
                    borderRadius: 999,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    backgroundColor: COLORS.accent,
                    width: isMobile ? "100%" : undefined,
                  })}
                >
                  <Text style={{ color: "#FFFFFF", fontWeight: "900", textAlign: "center" }}>
                    {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear producto"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={!!confirmDelete}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDelete(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            padding: isMobile ? 10 : 16,
            justifyContent: "center",
          }}
        >
          <View
            style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: COLORS.dangerBorder,
              backgroundColor: COLORS.bg2,
              padding: isMobile ? 14 : 16,
              gap: 10,
            }}
          >
            <Text style={{ color: COLORS.text, fontSize: isMobile ? 17 : 18, fontWeight: "900" }}>
              Borrar producto
            </Text>

            <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
              Vas a borrar{" "}
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                {confirmDelete?.title ?? ""}
              </Text>
              . Esta acción no se puede deshacer.
            </Text>

            <View
              style={{
                flexDirection: isMobile ? "column" : "row",
                gap: 10,
                justifyContent: "flex-end",
                marginTop: 6,
              }}
            >
              <ChipButton
                label="Cancelar"
                variant="ghost"
                onPress={() => setConfirmDelete(null)}
                isMobile={isMobile}
                fullWidth={isMobile}
              />
              <ChipButton
                label="Sí, borrar"
                variant="danger"
                onPress={removeProductConfirmed}
                isMobile={isMobile}
                fullWidth={isMobile}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}