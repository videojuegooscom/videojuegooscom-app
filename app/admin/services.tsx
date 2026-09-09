// app/admin/services.tsx
/**
 * Qué hace: panel de administración del catálogo de SERVICIOS (reparación,
 * limpieza, mantenimiento...) — la contraparte de app/admin/products.tsx
 * pero para servicios en vez de productos, y de app/admin/cotizaciones.tsx
 * pero para las solicitudes de "Contratar servicio ahora" en vez de "Vender
 * ahora". Dos pestañas en una sola pantalla:
 * - "Catálogo": crear, editar, publicar/despublicar, ocultar y borrar
 *   servicios (título, descripción, precio y fotos).
 * - "Solicitudes": las peticiones que envían los clientes desde
 *   components/ContratarServicioModal.tsx en la ficha de cada servicio.
 *
 * Cómo funciona:
 * - Tabla "services" (ver sql/services.sql) + "service_media" (ver
 *   sql/service_media.sql, fotos en el mismo bucket público "product-media"
 *   que ya usan los productos — no hace falta un bucket nuevo). Reutiliza el
 *   selector/subida de imágenes de app/admin/products/products.utils.ts
 *   (pickMediaFilesWeb, buildMediaPath) — mismo mecanismo, solo que aquí
 *   solo se admiten fotos (no vídeo, un servicio no lo necesita).
 * - Tabla "service_requests" (ver sql/service_requests.sql): mismo flujo de
 *   estados que sell_requests (nuevo → revisado → contactado, o descartado
 *   en cualquier momento), con botones en vez de desplegable.
 * - Un servicio se ve en la tienda (app/servicios.tsx, app/servicio/[id].tsx)
 *   solo si status='PUBLISHED' y is_active=true, igual que un producto.
 * - Tema claro (fondo blanco, texto azul marino, acentos azul claro) con
 *   contenido centrado en pantallas anchas (columnStyle, maxWidth 1160).
 *
 * Conectado con:
 * - sql/services.sql, sql/service_media.sql, sql/service_requests.sql →
 *   tablas y políticas RLS que usa esta pantalla.
 * - app/admin/products/products.utils.ts, products.constants.ts → selector
 *   y subida de fotos, formateo de precio/texto (reutilizados, no duplicados).
 * - app/servicios.tsx, app/servicio/[id].tsx → lo que ve el público.
 * - components/ContratarServicioModal.tsx → origen de cada fila de
 *   service_requests.
 * - app/admin/index.tsx → origen habitual de la navegación a esta pantalla.
 * - app/admin/_layout.tsx → registra esta ruta ("services") dentro del
 *   Stack protegido del panel admin.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { pickMediaFilesWeb, buildMediaPath, fmtEUR, clampText, toIntSafe } from "./products/products.utils";
import { MEDIA_BUCKET, MAX_IMAGES, ERRORS } from "./products/products.constants";
import type { LocalPickedMedia } from "./products/products.types";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const COLORS = {
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
  success: "#15803D",
  successBg: "#DCFCE7",
  successBorder: "#86EFAC",
  warning: "#92660B",
  warningBg: "#FEF3C7",
  warningBorder: "#FDE68A",
  danger: "#B91C1C",
  dangerBg: "#FFE4E6",
  dangerBorder: "#FDA4AF",
};

const columnStyle = { width: "100%", maxWidth: 1160, alignSelf: "center" } as const;
const modalColumnStyle = { width: "100%", maxWidth: 560, alignSelf: "center" } as const;

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

// --- Tipos -------------------------------------------------------------

type ServiceStatus = "DRAFT" | "PUBLISHED" | "REVIEW";

type ServiceMediaRow = {
  id: string;
  service_id: string;
  storage_path: string | null;
  public_url: string | null;
  file_name: string | null;
  sort_order: number | null;
  is_cover: boolean | null;
};

type ServiceRow = {
  id: string;
  title: string;
  description: string;
  price_eur: number;
  status: ServiceStatus;
  is_active: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
  media: ServiceMediaRow[];
};

type RequestStatus = "nuevo" | "revisado" | "contactado" | "descartado";
type MetodoContacto = "whatsapp" | "gmail" | "instagram" | "facebook" | "tiktok";
type Disponibilidad = "manana" | "mediodia" | "tardenoche";

type ServiceRequestRow = {
  id: string;
  created_at: string;
  service_id: string | null;
  service_title: string;
  nombre: string;
  apellido: string;
  metodo_contacto: MetodoContacto | null;
  contacto: string | null;
  ciudad: string;
  direccion: string | null;
  disponibilidad: Disponibilidad | null;
  comentario: string | null;
  status: RequestStatus;
};

const STATUS_LABEL: Record<ServiceStatus, string> = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicado",
  REVIEW: "Por revisar",
};

const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  nuevo: "Nueva",
  revisado: "Revisada",
  contactado: "Contactada",
  descartado: "Descartada",
};

const REQUEST_STATUS_COLORS: Record<RequestStatus, { bg: string; border: string }> = {
  nuevo: { bg: COLORS.warningBg, border: COLORS.warningBorder },
  revisado: { bg: COLORS.accent2, border: COLORS.accentBorder },
  contactado: { bg: COLORS.successBg, border: COLORS.successBorder },
  descartado: { bg: COLORS.dangerBg, border: COLORS.dangerBorder },
};

const METODO_LABEL: Record<MetodoContacto, string> = {
  whatsapp: "WhatsApp",
  gmail: "Gmail",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

const DISPONIBILIDAD_LABEL: Record<Disponibilidad, string> = {
  manana: "Mañana",
  mediodia: "Mediodía",
  tardenoche: "Tarde y noche",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function coverUrl(media: ServiceMediaRow[]): string | null {
  if (!media?.length) return null;
  const cover = media.find((m) => m.is_cover) ?? media[0];
  return cover?.public_url || null;
}

// --- Piezas visuales compartidas ----------------------------------------

function StatCard({ label, value, icon, isMobile }: { label: string; value: string; icon?: IoniconName; isMobile?: boolean }) {
  return (
    <View
      style={{
        width: isMobile ? "48.4%" : "23.4%",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.cardSoft,
        padding: isMobile ? 12 : 14,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {icon ? <Ionicons name={icon} size={13} color={COLORS.muted2} /> : null}
        <Text style={{ color: COLORS.muted2, fontWeight: "700", fontSize: 12 }}>{label}</Text>
      </View>
      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: isMobile ? 18 : 20, marginTop: 6 }}>
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
  icon,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "danger" | "ghost";
  disabled?: boolean;
  isMobile?: boolean;
  fullWidth?: boolean;
  icon?: IoniconName;
}) {
  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";
  const borderColor = isPrimary ? COLORS.accentBorder : isDanger ? COLORS.dangerBorder : COLORS.border;
  const backgroundColor = isPrimary ? COLORS.accent2 : isDanger ? COLORS.dangerBg : "#F6FAFD";

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
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
      })}
    >
      {icon ? <Ionicons name={icon} size={14} color={COLORS.text} /> : null}
      <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center", fontSize: isMobile ? 13 : 14 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "numeric";
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.muted2}
        multiline={!!multiline}
        keyboardType={keyboardType ?? "default"}
        style={{
          borderWidth: 1,
          borderColor: COLORS.border,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: multiline ? 12 : 10,
          fontSize: 15,
          color: COLORS.text,
          backgroundColor: COLORS.cardSoft,
          minHeight: multiline ? 90 : undefined,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
}

// --- Pantalla principal ---------------------------------------------------

export default function AdminServices() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 760;
  const pagePadding = isMobile ? 12 : 16;

  const [tab, setTab] = useState<"catalogo" | "solicitudes">("catalogo");

  // --- Catálogo ---
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [search, setSearch] = useState("");

  const loadServices = useCallback(async () => {
    setLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from("services")
        .select("id,title,description,price_eur,status,is_active,view_count,created_at,updated_at")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const ids = (rows ?? []).map((r: any) => r.id);
      let mediaByService: Record<string, ServiceMediaRow[]> = {};
      if (ids.length) {
        const { data: media } = await supabase
          .from("service_media")
          .select("id,service_id,storage_path,public_url,file_name,sort_order,is_cover")
          .in("service_id", ids)
          .order("is_cover", { ascending: false })
          .order("sort_order", { ascending: true });
        for (const m of (media ?? []) as ServiceMediaRow[]) {
          (mediaByService[m.service_id] ??= []).push(m);
        }
      }

      setServices(
        (rows ?? []).map((r: any) => ({ ...r, media: mediaByService[r.id] ?? [] }))
      );
    } catch (e) {
      console.error("Error cargando servicios:", e);
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  const filteredServices = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return services;
    return services.filter(
      (s) => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    );
  }, [services, search]);

  const stats = useMemo(() => {
    const total = services.length;
    const published = services.filter((s) => s.status === "PUBLISHED").length;
    const visible = services.filter((s) => s.status === "PUBLISHED" && s.is_active).length;
    const views = services.reduce((sum, s) => sum + (s.view_count ?? 0), 0);
    return { total, published, visible, views };
  }, [services]);

  // --- Modal crear/editar ---
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState<ServiceStatus>("DRAFT");
  const [isActive, setIsActive] = useState(true);
  const [existingMedia, setExistingMedia] = useState<ServiceMediaRow[]>([]);
  const [removedMedia, setRemovedMedia] = useState<ServiceMediaRow[]>([]);
  const [newMedia, setNewMedia] = useState<LocalPickedMedia[]>([]);
  const [coverId, setCoverId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setTitle("");
    setDesc("");
    setPrice("");
    setStatus("DRAFT");
    setIsActive(true);
    setExistingMedia([]);
    setRemovedMedia([]);
    setNewMedia([]);
    setCoverId(null);
    setModalErr(null);
    setModalOpen(true);
  }

  function openEdit(s: ServiceRow) {
    setEditing(s);
    setTitle(s.title);
    setDesc(s.description);
    setPrice(String(s.price_eur ?? 0));
    setStatus(s.status);
    setIsActive(s.is_active);
    setExistingMedia(s.media);
    setRemovedMedia([]);
    setNewMedia([]);
    setCoverId(s.media.find((m) => m.is_cover)?.id ?? s.media[0]?.id ?? null);
    setModalErr(null);
    setModalOpen(true);
  }

  function closeModal() {
    newMedia.forEach((m) => {
      try {
        URL.revokeObjectURL(m.previewUrl);
      } catch {
        // ignore
      }
    });
    setModalOpen(false);
  }

  async function pickPhotos() {
    try {
      const picked = await pickMediaFilesWeb();
      const images = picked.filter((m) => m.kind === "image");
      const totalAfter = existingMedia.length + newMedia.length + images.length;
      if (totalAfter > MAX_IMAGES) {
        setModalErr(ERRORS.MAX_IMAGES);
        return;
      }
      setNewMedia((prev) => [...prev, ...images]);
      if (!coverId && !existingMedia.length && images[0]) setCoverId(images[0].id);
    } catch (e: any) {
      setModalErr(e?.message ?? ERRORS.GENERIC_UPLOAD);
    }
  }

  function removeExistingPhoto(id: string) {
    setExistingMedia((prev) => {
      const found = prev.find((m) => m.id === id);
      if (found) setRemovedMedia((curr) => [...curr, found]);
      return prev.filter((m) => m.id !== id);
    });
    if (coverId === id) setCoverId(null);
  }

  function removeNewPhoto(id: string) {
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
    if (coverId === id) setCoverId(null);
  }

  async function uploadNewPhotos(serviceId: string) {
    if (!newMedia.length) return;
    const startIndex = existingMedia.length;

    for (let i = 0; i < newMedia.length; i++) {
      const item = newMedia[i];
      const storagePath = `services/${buildMediaPath(serviceId, item, startIndex + i)}`;

      const uploadRes = await supabase.storage.from(MEDIA_BUCKET).upload(storagePath, item.file, {
        cacheControl: "3600",
        upsert: false,
        contentType: item.mimeType || undefined,
      });
      if (uploadRes.error) throw uploadRes.error;

      const { data: publicData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath);
      const publicUrl = publicData?.publicUrl ?? "";

      const insertRes = await supabase.from("service_media").insert({
        service_id: serviceId,
        storage_path: storagePath,
        public_url: publicUrl,
        file_name: item.name,
        sort_order: startIndex + i,
        is_cover: coverId === item.id,
      });
      if (insertRes.error) throw insertRes.error;
    }
  }

  async function deleteRemovedPhotos() {
    if (!removedMedia.length) return;
    const paths = removedMedia.map((m) => m.storage_path).filter(Boolean) as string[];
    const ids = removedMedia.map((m) => m.id);
    if (paths.length) {
      const storageDelete = await supabase.storage.from(MEDIA_BUCKET).remove(paths);
      if (storageDelete.error) throw storageDelete.error;
    }
    const dbDelete = await supabase.from("service_media").delete().in("id", ids);
    if (dbDelete.error) throw dbDelete.error;
  }

  async function syncCover(serviceId: string) {
    // Deja como portada únicamente la que coincide con coverId (entre las
    // fotos que ya existían en Supabase; las nuevas ya se insertan con
    // is_cover correcto en uploadNewPhotos).
    for (const m of existingMedia) {
      const shouldBeCover = m.id === coverId;
      if (Boolean(m.is_cover) !== shouldBeCover) {
        await supabase.from("service_media").update({ is_cover: shouldBeCover }).eq("id", m.id);
      }
    }
  }

  async function save() {
    if (saving) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setModalErr("Ponle un título al servicio.");
      return;
    }

    setSaving(true);
    setModalErr(null);

    try {
      const payload = {
        title: cleanTitle,
        description: desc.trim(),
        price_eur: toIntSafe(price, 0),
        status,
        is_active: isActive,
      };

      let serviceId = editing?.id ?? null;

      if (serviceId) {
        const { error } = await supabase.from("services").update(payload).eq("id", serviceId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("services").insert(payload).select("id").single();
        if (error) throw error;
        serviceId = data.id;
      }

      if (serviceId) {
        await deleteRemovedPhotos();
        await uploadNewPhotos(serviceId);
        await syncCover(serviceId);
      }

      closeModal();
      await loadServices();
    } catch (e: any) {
      console.error("Error guardando el servicio:", e);
      setModalErr(e?.message ?? "No se pudo guardar el servicio.");
    } finally {
      setSaving(false);
    }
  }

  // --- Borrar servicio ---
  const [deleteTarget, setDeleteTarget] = useState<ServiceRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const paths = deleteTarget.media.map((m) => m.storage_path).filter(Boolean) as string[];
      if (paths.length) {
        await supabase.storage.from(MEDIA_BUCKET).remove(paths);
      }
      const { error } = await supabase.from("services").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      setDeleteTarget(null);
      await loadServices();
    } catch (e) {
      console.error("Error borrando el servicio:", e);
    } finally {
      setDeleting(false);
    }
  }

  // --- Solicitudes ---
  const [requests, setRequests] = useState<ServiceRequestRow[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestFilter, setRequestFilter] = useState<"ALL" | RequestStatus>("ALL");

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      const { data, error } = await supabase
        .from("service_requests")
        .select(
          "id,created_at,service_id,service_title,nombre,apellido,metodo_contacto,contacto,ciudad,direccion,disponibilidad,comentario,status"
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      setRequests((data ?? []) as ServiceRequestRow[]);
    } catch (e) {
      console.error("Error cargando solicitudes de servicio:", e);
      setRequests([]);
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "solicitudes") loadRequests();
  }, [tab, loadRequests]);

  const filteredRequests = useMemo(() => {
    if (requestFilter === "ALL") return requests;
    return requests.filter((r) => r.status === requestFilter);
  }, [requests, requestFilter]);

  async function setRequestStatus(id: string, next: RequestStatus) {
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: next } : r)));
    const { error } = await supabase.from("service_requests").update({ status: next }).eq("id", id);
    if (error) {
      console.error("Error actualizando la solicitud:", error);
      await loadRequests();
    }
  }

  const [deleteRequestTarget, setDeleteRequestTarget] = useState<ServiceRequestRow | null>(null);

  async function confirmDeleteRequest() {
    if (!deleteRequestTarget) return;
    const id = deleteRequestTarget.id;
    setDeleteRequestTarget(null);
    setRequests((prev) => prev.filter((r) => r.id !== id));
    const { error } = await supabase.from("service_requests").delete().eq("id", id);
    if (error) {
      console.error("Error borrando la solicitud:", error);
      await loadRequests();
    }
  }

  // --- Render ---

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />
      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: "#F6FAFD",
          paddingHorizontal: pagePadding,
          paddingTop: isMobile ? 12 : 14,
          paddingBottom: 14,
          gap: 10,
        }}
      >
        <View style={{ ...columnStyle, gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable
              onPress={smartBackAdminHome}
              style={({ pressed }) => ({
                opacity: pressed ? 0.85 : 1,
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <Ionicons name="chevron-back" size={22} color={COLORS.text} />
            </Pressable>
            <Text style={{ color: COLORS.text, fontSize: isMobile ? 20 : 22, fontWeight: "900" }}>
              Servicios
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <ChipButton
              label="Catálogo"
              onPress={() => setTab("catalogo")}
              variant={tab === "catalogo" ? "primary" : "ghost"}
              isMobile={isMobile}
            />
            <ChipButton
              label="Solicitudes"
              onPress={() => setTab("solicitudes")}
              variant={tab === "solicitudes" ? "primary" : "ghost"}
              isMobile={isMobile}
            />
          </View>
        </View>
      </View>

      {tab === "catalogo" ? (
        <ScrollView contentContainerStyle={{ padding: pagePadding, paddingBottom: 40 }}>
          <View style={{ ...columnStyle, gap: 14 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <StatCard label="Servicios" value={String(stats.total)} icon="construct-outline" isMobile={isMobile} />
              <StatCard label="Publicados" value={String(stats.published)} icon="checkmark-circle-outline" isMobile={isMobile} />
              <StatCard label="Visibles" value={String(stats.visible)} icon="eye-outline" isMobile={isMobile} />
              <StatCard label="Visitas totales" value={String(stats.views)} icon="trending-up-outline" isMobile={isMobile} />
            </View>

            <View style={{ flexDirection: isMobile ? "column" : "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Buscar por título o descripción…"
                  placeholderTextColor={COLORS.muted2}
                  style={{
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    borderRadius: 999,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    fontSize: 14,
                    color: COLORS.text,
                    backgroundColor: COLORS.cardSoft,
                  }}
                />
              </View>
              <ChipButton label="+ Nuevo servicio" onPress={openCreate} variant="primary" isMobile={isMobile} fullWidth={isMobile} />
            </View>

            {loading ? (
              <View style={{ alignItems: "center", paddingVertical: 30 }}>
                <ActivityIndicator color={COLORS.accent} />
              </View>
            ) : filteredServices.length === 0 ? (
              <View
                style={{
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.card,
                  padding: 20,
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Ionicons name="construct-outline" size={24} color={COLORS.muted} />
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Todavía no hay servicios</Text>
                <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 19 }}>
                  Crea el primero (por ejemplo "Reparación de pantalla" o "Limpieza interna") para que
                  aparezca en la categoría "Reparación/Limpieza" de Inicio.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {filteredServices.map((s) => {
                  const cover = coverUrl(s.media);
                  return (
                    <View
                      key={s.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        borderRadius: 18,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        backgroundColor: COLORS.card,
                        padding: 12,
                        ...softShadow(),
                      }}
                    >
                      {cover ? (
                        <Image source={{ uri: cover }} style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: COLORS.cardSoft }} />
                      ) : (
                        <View
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: 12,
                            backgroundColor: COLORS.cardSoft,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Ionicons name="construct-outline" size={22} color={COLORS.muted} />
                        </View>
                      )}

                      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                        <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: "900", fontSize: 14 }}>
                          {s.title || "Sin título"}
                        </Text>
                        <Text numberOfLines={1} style={{ color: COLORS.muted, fontSize: 12 }}>
                          {fmtEUR(s.price_eur)} · {STATUS_LABEL[s.status]}
                          {!s.is_active ? " · Oculto" : ""} · {s.view_count ?? 0} visitas
                        </Text>
                      </View>

                      <Pressable
                        onPress={() => openEdit(s)}
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.85 : 1,
                          padding: 8,
                        })}
                      >
                        <Ionicons name="create-outline" size={20} color={COLORS.accent} />
                      </Pressable>
                      <Pressable
                        onPress={() => setDeleteTarget(s)}
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.85 : 1,
                          padding: 8,
                        })}
                      >
                        <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: pagePadding, paddingBottom: 40 }}>
          <View style={{ ...columnStyle, gap: 14 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(["ALL", "nuevo", "revisado", "contactado", "descartado"] as const).map((f) => (
                <ChipButton
                  key={f}
                  label={f === "ALL" ? "Todas" : REQUEST_STATUS_LABEL[f]}
                  onPress={() => setRequestFilter(f)}
                  variant={requestFilter === f ? "primary" : "ghost"}
                  isMobile={isMobile}
                />
              ))}
            </View>

            {requestsLoading ? (
              <View style={{ alignItems: "center", paddingVertical: 30 }}>
                <ActivityIndicator color={COLORS.accent} />
              </View>
            ) : filteredRequests.length === 0 ? (
              <View
                style={{
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.card,
                  padding: 20,
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Ionicons name="document-text-outline" size={24} color={COLORS.muted} />
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Sin solicitudes todavía</Text>
                <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 19 }}>
                  Aquí aparecerán los clientes que pulsen "Contratar servicio ahora" en la ficha de un
                  servicio.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {filteredRequests.map((r) => {
                  const sc = REQUEST_STATUS_COLORS[r.status];
                  return (
                    <View
                      key={r.id}
                      style={{
                        borderRadius: 18,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        backgroundColor: COLORS.card,
                        padding: 14,
                        gap: 10,
                        ...softShadow(),
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 15 }}>
                            {r.nombre} {r.apellido}
                          </Text>
                          <Text style={{ color: COLORS.muted, fontSize: 12.5, marginTop: 2 }}>
                            {r.service_title} · {formatDate(r.created_at)}
                          </Text>
                        </View>
                        <View
                          style={{
                            paddingVertical: 5,
                            paddingHorizontal: 10,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: sc.border,
                            backgroundColor: sc.bg,
                          }}
                        >
                          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 11 }}>
                            {REQUEST_STATUS_LABEL[r.status]}
                          </Text>
                        </View>
                      </View>

                      <View style={{ gap: 4 }}>
                        <Text style={{ color: COLORS.text, fontSize: 13 }}>
                          <Text style={{ fontWeight: "800" }}>Ciudad: </Text>
                          {r.ciudad}
                        </Text>
                        {r.metodo_contacto ? (
                          <Text style={{ color: COLORS.text, fontSize: 13 }}>
                            <Text style={{ fontWeight: "800" }}>{METODO_LABEL[r.metodo_contacto]}: </Text>
                            {r.contacto || "—"}
                          </Text>
                        ) : null}
                        {r.direccion ? (
                          <Text style={{ color: COLORS.text, fontSize: 13 }}>
                            <Text style={{ fontWeight: "800" }}>Dirección: </Text>
                            {r.direccion}
                          </Text>
                        ) : null}
                        {r.disponibilidad ? (
                          <Text style={{ color: COLORS.text, fontSize: 13 }}>
                            <Text style={{ fontWeight: "800" }}>Disponibilidad: </Text>
                            {DISPONIBILIDAD_LABEL[r.disponibilidad]}
                          </Text>
                        ) : null}
                        {r.comentario ? (
                          <Text style={{ color: COLORS.text, fontSize: 13 }}>
                            <Text style={{ fontWeight: "800" }}>Detalles: </Text>
                            {r.comentario}
                          </Text>
                        ) : null}
                      </View>

                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {(["nuevo", "revisado", "contactado", "descartado"] as RequestStatus[])
                          .filter((s) => s !== r.status)
                          .map((s) => (
                            <ChipButton
                              key={s}
                              label={REQUEST_STATUS_LABEL[s]}
                              onPress={() => setRequestStatus(r.id, s)}
                              isMobile={isMobile}
                            />
                          ))}
                        <ChipButton
                          label="Borrar"
                          variant="danger"
                          onPress={() => setDeleteRequestTarget(r)}
                          isMobile={isMobile}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* Modal crear/editar servicio */}
      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={{ flex: 1, backgroundColor: "rgba(11,33,56,0.55)", padding: 16, justifyContent: "center" }}>
          <View
            style={{
              ...modalColumnStyle,
              maxHeight: "88%",
              borderRadius: 22,
              backgroundColor: COLORS.bg,
              overflow: "hidden",
              ...softShadow(),
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: COLORS.border,
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 17 }}>
                {editing ? "Editar servicio" : "Nuevo servicio"}
              </Text>
              <Pressable onPress={closeModal} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, padding: 4 })}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
              <TextField label="Título" value={title} onChangeText={setTitle} placeholder="Reparación de pantalla" />
              <TextField
                label="Descripción"
                value={desc}
                onChangeText={setDesc}
                placeholder="Qué incluye el servicio, tiempo estimado, garantía…"
                multiline
              />
              <TextField label="Precio (€)" value={price} onChangeText={setPrice} placeholder="0" keyboardType="numeric" />

              <View style={{ gap: 6 }}>
                <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13 }}>Estado</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {(["DRAFT", "PUBLISHED", "REVIEW"] as ServiceStatus[]).map((st) => (
                    <ChipButton
                      key={st}
                      label={STATUS_LABEL[st]}
                      onPress={() => setStatus(st)}
                      variant={status === st ? "primary" : "ghost"}
                    />
                  ))}
                </View>
              </View>

              <Pressable
                onPress={() => setIsActive((v) => !v)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Ionicons
                  name={isActive ? "checkbox" : "square-outline"}
                  size={22}
                  color={isActive ? COLORS.accent : COLORS.muted}
                />
                <Text style={{ color: COLORS.text, fontWeight: "700", fontSize: 13 }}>Visible en la tienda</Text>
              </Pressable>

              <View style={{ gap: 8 }}>
                <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13 }}>
                  Fotos ({existingMedia.length + newMedia.length}/{MAX_IMAGES})
                </Text>

                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {existingMedia.map((m) => (
                    <View key={m.id} style={{ width: 76, height: 76 }}>
                      <Image source={{ uri: m.public_url ?? "" }} style={{ width: 76, height: 76, borderRadius: 12, backgroundColor: COLORS.cardSoft }} />
                      <Pressable
                        onPress={() => setCoverId(m.id)}
                        style={{
                          position: "absolute",
                          top: 4,
                          left: 4,
                          backgroundColor: coverId === m.id ? COLORS.accent : "rgba(11,33,56,0.55)",
                          borderRadius: 999,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                        }}
                      >
                        <Text style={{ color: "#FFFFFF", fontSize: 9, fontWeight: "900" }}>
                          {coverId === m.id ? "Portada" : "Usar"}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => removeExistingPhoto(m.id)}
                        style={{
                          position: "absolute",
                          top: 4,
                          right: 4,
                          backgroundColor: "rgba(11,33,56,0.7)",
                          borderRadius: 999,
                          width: 20,
                          height: 20,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="close" size={13} color="#FFFFFF" />
                      </Pressable>
                    </View>
                  ))}

                  {newMedia.map((m) => (
                    <View key={m.id} style={{ width: 76, height: 76 }}>
                      <Image source={{ uri: m.previewUrl }} style={{ width: 76, height: 76, borderRadius: 12, backgroundColor: COLORS.cardSoft }} />
                      <Pressable
                        onPress={() => setCoverId(m.id)}
                        style={{
                          position: "absolute",
                          top: 4,
                          left: 4,
                          backgroundColor: coverId === m.id ? COLORS.accent : "rgba(11,33,56,0.55)",
                          borderRadius: 999,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                        }}
                      >
                        <Text style={{ color: "#FFFFFF", fontSize: 9, fontWeight: "900" }}>
                          {coverId === m.id ? "Portada" : "Usar"}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => removeNewPhoto(m.id)}
                        style={{
                          position: "absolute",
                          top: 4,
                          right: 4,
                          backgroundColor: "rgba(11,33,56,0.7)",
                          borderRadius: 999,
                          width: 20,
                          height: 20,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="close" size={13} color="#FFFFFF" />
                      </Pressable>
                    </View>
                  ))}

                  <Pressable
                    onPress={pickPhotos}
                    style={({ pressed }) => ({
                      width: 76,
                      height: 76,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: COLORS.accentBorder,
                      backgroundColor: COLORS.accent2,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Ionicons name="add" size={22} color={COLORS.accent} />
                  </Pressable>
                </View>
              </View>

              {!!modalErr && (
                <View
                  style={{
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: COLORS.dangerBorder,
                    backgroundColor: COLORS.dangerBg,
                    padding: 10,
                  }}
                >
                  <Text style={{ color: COLORS.danger, fontWeight: "700", fontSize: 12.5 }}>{modalErr}</Text>
                </View>
              )}

              <Pressable
                onPress={save}
                disabled={saving}
                style={({ pressed }) => ({
                  opacity: saving ? 0.6 : pressed ? 0.88 : 1,
                  borderRadius: 999,
                  paddingVertical: 13,
                  backgroundColor: COLORS.accent,
                  alignItems: "center",
                })}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>
                    {editing ? "Guardar cambios" : "Crear servicio"}
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Confirmar borrado de servicio */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(11,33,56,0.55)", padding: 16, justifyContent: "center" }}>
          <View style={{ ...modalColumnStyle, borderRadius: 20, backgroundColor: COLORS.bg, padding: 18, gap: 14 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>¿Borrar este servicio?</Text>
            <Text style={{ color: COLORS.muted, lineHeight: 19 }}>
              Se borrará "{deleteTarget?.title}" y sus fotos. Esta acción no se puede deshacer.
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <ChipButton label="Cancelar" onPress={() => setDeleteTarget(null)} fullWidth />
              </View>
              <View style={{ flex: 1 }}>
                <ChipButton label={deleting ? "Borrando…" : "Borrar"} onPress={confirmDelete} variant="danger" disabled={deleting} fullWidth />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirmar borrado de solicitud */}
      <Modal visible={!!deleteRequestTarget} transparent animationType="fade" onRequestClose={() => setDeleteRequestTarget(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(11,33,56,0.55)", padding: 16, justifyContent: "center" }}>
          <View style={{ ...modalColumnStyle, borderRadius: 20, backgroundColor: COLORS.bg, padding: 18, gap: 14 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>¿Borrar esta solicitud?</Text>
            <Text style={{ color: COLORS.muted, lineHeight: 19 }}>
              Se borrará la solicitud de {deleteRequestTarget?.nombre}. Esta acción no se puede deshacer.
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <ChipButton label="Cancelar" onPress={() => setDeleteRequestTarget(null)} fullWidth />
              </View>
              <View style={{ flex: 1 }}>
                <ChipButton label="Borrar" onPress={confirmDeleteRequest} variant="danger" fullWidth />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
