import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { supabase } from "../../lib/supabase";
import {
  COLORS,
  MAX_FILE_SIZE_MB,
  MAX_IMAGES,
  MAX_VIDEO_SECONDS,
  MEDIA_BUCKET,
} from "./products/products.constants";
import type {
  CategoryRow,
  LocalPickedMedia,
  ProductCondition,
  ProductMediaRow,
  ProductRow,
  ProductStatus,
  StatusFilter,
  VisibilityFilter,
} from "./products/products.types";
import {
  buildMediaPath,
  clampText,
  fmtEUR,
  getPrimaryMedia,
  labelCond,
  labelStatus,
  pickMediaFilesWeb,
  smartBackAdminHome,
  softShadow,
  statusVisual,
  toIntSafe,
} from "./products/products.utils";
import {
  ChipButton,
  FilterPill,
  MediaThumb,
  SectionTitle,
  StatCard,
} from "./products/products.components";

function revokeLocalMedia(items: LocalPickedMedia[]) {
  items.forEach((m) => {
    try {
      URL.revokeObjectURL(m.previewUrl);
    } catch {
      // ignore
    }
  });
}

function normalizeMediaKind(value: unknown): "image" | "video" | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "image") return "image";
  if (v === "video") return "video";
  return null;
}

function getRowKind(row: Partial<ProductMediaRow>) {
  return normalizeMediaKind(row.kind ?? row.media_type);
}

function getRowDuration(row: Partial<ProductMediaRow>) {
  const raw = row.duration_seconds ?? row.duration_sec ?? null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getRowSortOrder(row: Partial<ProductMediaRow>) {
  const n = Number(row.sort_order);
  return Number.isFinite(n) ? n : 0;
}

function getRowPublicUrl(row: Partial<ProductMediaRow>) {
  const url = String(row.public_url ?? "").trim();
  return url || null;
}

function isMissingColumnError(error: any, columnName: string) {
  const msg = String(error?.message ?? "").toLowerCase();
  const col = columnName.toLowerCase();
  return (
    msg.includes(col) &&
    (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("column"))
  );
}

function isMissingRelationError(error: any, relationName: string) {
  const msg = String(error?.message ?? "").toLowerCase();
  const rel = relationName.toLowerCase();
  return (
    msg.includes(rel) &&
    (msg.includes("does not exist") ||
      msg.includes("relation") ||
      msg.includes("could not find the table"))
  );
}

function sortMediaRows(a: ProductMediaRow, b: ProductMediaRow) {
  const aCover = Boolean(a.is_cover);
  const bCover = Boolean(b.is_cover);

  if (aCover && !bCover) return -1;
  if (!aCover && bCover) return 1;

  return getRowSortOrder(a) - getRowSortOrder(b);
}

function sanitizeMediaRow(row: any): ProductMediaRow {
  return {
    id: String(row.id),
    product_id: String(row.product_id),
    kind: normalizeMediaKind(row.kind),
    media_type: normalizeMediaKind(row.media_type),
    storage_path: row.storage_path ?? null,
    public_url: row.public_url ?? null,
    file_name: row.file_name ?? null,
    mime_type: row.mime_type ?? null,
    sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
    is_cover: Boolean(row.is_cover),
    duration_seconds: getRowDuration(row),
    duration_sec: getRowDuration(row),
    created_at: row.created_at ?? null,
  };
}

async function fetchProductMediaRowsSafe(productId?: string): Promise<ProductMediaRow[]> {
  const selects = [
    "id,product_id,kind,media_type,storage_path,public_url,file_name,mime_type,sort_order,is_cover,duration_seconds,duration_sec,created_at",
    "id,product_id,kind,storage_path,public_url,file_name,mime_type,sort_order,is_cover,duration_seconds,created_at",
    "id,product_id,media_type,storage_path,public_url,file_name,mime_type,sort_order,is_cover,duration_sec,created_at",
    "id,product_id,storage_path,public_url,file_name,mime_type,sort_order,is_cover,created_at",
  ];

  let lastError: any = null;

  for (const selectStr of selects) {
    let query = supabase.from("product_media").select(selectStr).limit(5000);

    if (productId) {
      query = query
        .eq("product_id", productId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(200);
    }

    const res = await query;

    if (res.error) {
      const missingTable = isMissingRelationError(res.error, "product_media");
      const missingColumn =
        String(res.error.message ?? "").toLowerCase().includes("column") ||
        String(res.error.message ?? "").toLowerCase().includes("schema cache");

      if (missingTable) return [];
      if (missingColumn) {
        lastError = res.error;
        continue;
      }

      throw res.error;
    }

    return (Array.isArray(res.data) ? res.data : []).map(sanitizeMediaRow).sort(sortMediaRows);
  }

  if (lastError) throw lastError;
  return [];
}

export default function AdminProducts() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const isDesktopish = widthSafe >= 1024;
  const pagePadding = isMobile ? 12 : 16;

  const [loading, setLoading] = useState(true);
  const [screenErr, setScreenErr] = useState<string | null>(null);
  const [mediaDebugErr, setMediaDebugErr] = useState<string | null>(null);

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
      revokeLocalMedia(newMedia);
    };
  }, [newMedia]);

  const categoryName = useMemo(() => {
    if (!categoryId) return "Sin categoría";
    return categories.find((c) => c.id === categoryId)?.name ?? "Sin categoría";
  }, [categoryId, categories]);

  const activeCategories = useMemo(
    () => categories.filter((c) => !!c.is_active),
    [categories]
  );

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
    () =>
      existingMedia.filter((m) => getRowKind(m) === "image").length +
      newMedia.filter((m) => m.kind === "image").length,
    [existingMedia, newMedia]
  );

  const currentVideoCount = useMemo(
    () =>
      existingMedia.filter((m) => getRowKind(m) === "video").length +
      newMedia.filter((m) => m.kind === "video").length,
    [existingMedia, newMedia]
  );

  async function normalizeMediaForProduct(productId: string) {
    const rows = await fetchProductMediaRowsSafe(productId);

    if (!rows.length) return rows;

    const firstImage = rows.find((m) => getRowKind(m) === "image");

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const shouldCover = !!firstImage && row.id === firstImage.id;
      const shouldOrder = i;

      if (getRowSortOrder(row) !== shouldOrder || Boolean(row.is_cover) !== shouldCover) {
        const payload: Record<string, any> = {
          sort_order: shouldOrder,
          is_cover: shouldCover,
        };

        const { error: updateError } = await supabase
          .from("product_media")
          .update(payload)
          .eq("id", row.id);

        if (updateError) throw updateError;

        row.sort_order = shouldOrder;
        row.is_cover = shouldCover;
      }
    }

    return rows;
  }

  async function load() {
    setLoading(true);
    setScreenErr(null);
    setMediaDebugErr(null);

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
          msg.includes("is_featured_home") &&
          (msg.includes("column") || msg.includes("does not exist"));

        if (featuredColumnMissing) {
          const fallbackRes = await supabase
            .from("products")
            .select(
              "id,title,description,price_eur,status,condition,category_id,is_active,created_at,updated_at"
            )
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
          is_featured_home: row.is_featured_home ?? false,
          media: [],
        }));
      }

      let supportsMedia = true;
      let mediaRows: ProductMediaRow[] = [];

      try {
        mediaRows = await fetchProductMediaRowsSafe();
      } catch (e: any) {
        const rawMsg = String(e?.message ?? "");
        const msg = rawMsg.toLowerCase();

        const definitelyMissing =
          msg.includes('relation "product_media" does not exist') ||
          msg.includes("could not find the table") ||
          msg.includes("does not exist");

        if (definitelyMissing) {
          supportsMedia = false;
          setMediaDebugErr(rawMsg || "La tabla product_media no existe o no está accesible.");
        } else {
          setMediaDebugErr(rawMsg || "Error desconocido al leer product_media.");
          throw e;
        }
      }

      const mediaByProduct = new Map<string, ProductMediaRow[]>();

      for (const media of mediaRows) {
        const list = mediaByProduct.get(media.product_id) ?? [];
        list.push(media);
        mediaByProduct.set(media.product_id, list);
      }

      const merged = productsData.map((item) => ({
        ...item,
        media: (mediaByProduct.get(item.id) ?? []).sort(sortMediaRows),
      }));

      setSupportsFeaturedHome(supportsFeatured);
      setSupportsProductMedia(supportsMedia);
      setCategories((catsRes.data ?? []) as CategoryRow[]);
      setItems(merged);
    } catch (e: any) {
      const exactMessage =
        e?.message ||
        e?.error_description ||
        e?.details ||
        "Error cargando productos.";
      setScreenErr(exactMessage);
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
    revokeLocalMedia(newMedia);
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
    setExistingMedia([...(p.media ?? [])].sort(sortMediaRows));
    setModalErr(null);
    setOpen(true);
  }

  async function addMediaFromPicker() {
    setModalErr(null);

    if (!supportsProductMedia) {
      setModalErr(
        mediaDebugErr || "La tabla product_media no está disponible todavía para este panel."
      );
      return;
    }

    try {
      const picked = await pickMediaFilesWeb();
      if (!picked.length) return;

      const oversize = picked.find((m) => m.size > MAX_FILE_SIZE_MB * 1024 * 1024);
      if (oversize) {
        revokeLocalMedia(picked);
        setModalErr(
          `Uno de los archivos supera el máximo de ${MAX_FILE_SIZE_MB}MB permitido por archivo.`
        );
        return;
      }

      const pickedImages = picked.filter((m) => m.kind === "image");
      const pickedVideos = picked.filter((m) => m.kind === "video");

      if (pickedVideos.length > 1) {
        revokeLocalMedia(picked);
        setModalErr("Solo se permite 1 vídeo por producto.");
        return;
      }

      if (currentImageCount + pickedImages.length > MAX_IMAGES) {
        revokeLocalMedia(picked);
        setModalErr(`Máximo ${MAX_IMAGES} imágenes por producto.`);
        return;
      }

      if (currentVideoCount + pickedVideos.length > 1) {
        revokeLocalMedia(picked);
        setModalErr("Solo se permite 1 vídeo por producto.");
        return;
      }

      const invalidDuration = pickedVideos.find(
        (v) => !v.durationSeconds || Number(v.durationSeconds) > MAX_VIDEO_SECONDS
      );

      if (invalidDuration) {
        revokeLocalMedia(picked);
        setModalErr(`El vídeo no puede superar ${MAX_VIDEO_SECONDS} segundos.`);
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
        revokeLocalMedia([found]);
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
    if (!newMedia.length) return;

    const startIndex = existingMedia.length;

    for (let i = 0; i < newMedia.length; i++) {
      const item = newMedia[i];
      const storagePath = buildMediaPath(productId, item, startIndex + i);

      const uploadRes = await supabase.storage.from(MEDIA_BUCKET).upload(
        storagePath,
        item.file,
        {
          cacheControl: "3600",
          upsert: false,
          contentType: item.mimeType || undefined,
        }
      );

      if (uploadRes.error) throw uploadRes.error;

      const { data: publicData } = supabase.storage
        .from(MEDIA_BUCKET)
        .getPublicUrl(storagePath);

      const publicUrl = publicData?.publicUrl ?? null;

      const rowPayload: Record<string, any> = {
        product_id: productId,
        kind: item.kind,
        media_type: item.kind,
        storage_path: storagePath,
        public_url: publicUrl,
        file_name: item.name,
        mime_type: item.mimeType || null,
        sort_order: startIndex + i,
        is_cover: false,
        duration_seconds: item.kind === "video" ? item.durationSeconds ?? null : null,
        duration_sec: item.kind === "video" ? item.durationSeconds ?? null : null,
      };

      const insertRes = await supabase.from("product_media").insert(rowPayload);

      if (insertRes.error) {
        const maybeLegacyPayload: Record<string, any> = {
          product_id: productId,
          storage_path: storagePath,
          public_url: publicUrl,
          file_name: item.name,
          mime_type: item.mimeType || null,
          sort_order: startIndex + i,
          is_cover: false,
        };

        if (!isMissingColumnError(insertRes.error, "kind")) {
          maybeLegacyPayload.kind = item.kind;
        }

        if (!isMissingColumnError(insertRes.error, "media_type")) {
          maybeLegacyPayload.media_type = item.kind;
        }

        if (item.kind === "video") {
          if (!isMissingColumnError(insertRes.error, "duration_seconds")) {
            maybeLegacyPayload.duration_seconds = item.durationSeconds ?? null;
          }
          if (!isMissingColumnError(insertRes.error, "duration_sec")) {
            maybeLegacyPayload.duration_sec = item.durationSeconds ?? null;
          }
        }

        const retryRes = await supabase.from("product_media").insert(maybeLegacyPayload);
        if (retryRes.error) throw retryRes.error;
      }
    }
  }

  async function deleteRemovedMedia() {
    if (!removedMedia.length) return;

    const paths = removedMedia.map((m) => m.storage_path).filter(Boolean) as string[];
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
      existingMedia.filter((m) => getRowKind(m) === "image").length +
      newMedia.filter((m) => m.kind === "image").length;

    const totalVideos =
      existingMedia.filter((m) => getRowKind(m) === "video").length +
      newMedia.filter((m) => m.kind === "video").length;

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

    const oversize = newMedia.find((m) => m.size > MAX_FILE_SIZE_MB * 1024 * 1024);
    if (oversize) {
      setModalErr(
        `Uno de los archivos supera el máximo de ${MAX_FILE_SIZE_MB}MB permitido por archivo.`
      );
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
        const { error } = await supabase
          .from("products")
          .update(payload)
          .eq("id", editing.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("products")
          .insert(payload)
          .select("id")
          .single();

        if (error) throw error;
        productId = data?.id ?? null;
      }

      if (!productId) throw new Error("No se pudo resolver el ID del producto.");

      if (supportsProductMedia) {
        await deleteRemovedMedia();
        await uploadNewMedia(productId);
        await normalizeMediaForProduct(productId);
      }

      setOpen(false);
      resetForm();
      await load();
    } catch (e: any) {
      const exactMessage =
        e?.message ||
        e?.error_description ||
        e?.details ||
        "Error guardando producto.";
      setModalErr(exactMessage);
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
        const paths = p.media.map((m) => m.storage_path).filter(Boolean) as string[];
        if (paths.length) {
          const storageRes = await supabase.storage.from(MEDIA_BUCKET).remove(paths);
          if (storageRes.error) throw storageRes.error;
        }
      }

      const { error } = await supabase.from("products").delete().eq("id", p.id);
      if (error) throw error;

      await load();
    } catch (e: any) {
      const exactMessage =
        e?.message ||
        e?.error_description ||
        e?.details ||
        "Error borrando producto.";
      setScreenErr(exactMessage);
    }
  }

  async function quickPublish(p: ProductRow) {
    const prev = itemsRef.current;
    const next = prev.map((x) =>
      x.id === p.id ? { ...x, status: "PUBLISHED" as ProductStatus } : x
    );
    setItems(next);

    const { error } = await supabase
      .from("products")
      .update({ status: "PUBLISHED" })
      .eq("id", p.id);

    if (error) {
      setItems(prev);
      setScreenErr(error.message);
    }
  }

  async function toggleActive(p: ProductRow) {
    const prev = itemsRef.current;
    const next = prev.map((x) => (x.id === p.id ? { ...x, is_active: !x.is_active } : x));
    setItems(next);

    const { error } = await supabase
      .from("products")
      .update({ is_active: !p.is_active })
      .eq("id", p.id);

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
      if (nextValue) return { ...x, is_featured_home: x.id === p.id };
      if (x.id === p.id) return { ...x, is_featured_home: false };
      return x;
    });

    setItems(next);

    try {
      if (nextValue) {
        const currentFeatured = prev.find((x) => x.is_featured_home && x.id !== p.id);
        if (currentFeatured) {
          await supabase
            .from("products")
            .update({ is_featured_home: false })
            .eq("id", currentFeatured.id);
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
            <Text style={{ color: COLORS.danger, fontWeight: "800", lineHeight: 20 }}>
              {screenErr}
            </Text>
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
              {mediaDebugErr || "El panel no ha podido leer product_media."}
            </Text>
          </View>
        )}

        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.card,
            padding: 12,
            gap: 10,
          }}
        >
          <TextInput
            value={search}
            onChangeText={setSearch}
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
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>
              + Nuevo producto
            </Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator color={COLORS.text} />
          <Text style={{ color: COLORS.muted }}>Cargando productos…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: pagePadding, paddingBottom: 30, gap: 12 }}>
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

              const statusUi = statusVisual(p.status, COLORS);
              const primaryMedia = getPrimaryMedia(p.media);
              const primaryKind = primaryMedia ? getRowKind(primaryMedia) : null;
              const primaryUrl = primaryMedia ? getRowPublicUrl(primaryMedia) : null;
              const imageCount = p.media.filter((m) => getRowKind(m) === "image").length;
              const hasVideo = p.media.some((m) => getRowKind(m) === "video");

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
                      {primaryKind === "image" && primaryUrl ? (
                        <Image
                          source={{ uri: primaryUrl }}
                          resizeMode="cover"
                          style={{ width: "100%", height: "100%" }}
                        />
                      ) : primaryKind === "video" ? (
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

                          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
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
                          </View>
                        </View>

                        <View style={{ alignItems: isMobile ? "flex-start" : "flex-end", gap: 10 }}>
                          <Text
                            style={{
                              color: COLORS.gold,
                              fontWeight: "900",
                              fontSize: isMobile ? 17 : 18,
                            }}
                          >
                            {fmtEUR(Number(p.price_eur ?? 0))}
                          </Text>

                          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
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
              <Text style={{ color: COLORS.text, fontSize: isMobile ? 19 : 20, fontWeight: "900" }}>
                {isEdit ? "Editar producto" : "Nuevo producto"}
              </Text>

              <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                Hasta {MAX_IMAGES} imágenes y 1 vídeo de máximo {MAX_VIDEO_SECONDS} segundos.
              </Text>

              <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                Peso máximo recomendado por archivo: {MAX_FILE_SIZE_MB}MB.
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
                      borderColor:
                        condition === c ? COLORS.accentBorder : "rgba(255,255,255,0.14)",
                      backgroundColor:
                        condition === c ? COLORS.accent2 : "rgba(255,255,255,0.06)",
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
                      borderColor:
                        categoryId === c.id ? COLORS.accentBorder : "rgba(255,255,255,0.14)",
                      backgroundColor:
                        categoryId === c.id ? COLORS.accent2 : "rgba(255,255,255,0.06)",
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