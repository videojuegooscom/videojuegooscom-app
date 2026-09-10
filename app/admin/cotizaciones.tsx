// app/admin/cotizaciones.tsx
/**
 * Qué hace: panel admin donde aparecen las solicitudes de venta que envían
 * los clientes desde el formulario "Vender ahora" (components/
 * VenderAhoraModal.tsx). Ya no llega nada por email: todo se guarda en la
 * tabla "sell_requests" de Supabase y se revisa aquí.
 *
 * Cómo funciona:
 * - Lee/escribe directamente en la tabla "sell_requests" (select, update de
 *   "status", delete). El INSERT lo hace el cliente público desde el
 *   formulario; aquí solo se listan, se cambia su estado y se pueden
 *   borrar.
 * - Estado de cada solicitud: nuevo → revisado → contactado, o descartado
 *   en cualquier momento. Son botones, no un desplegable, para poder
 *   avanzar el flujo con un solo toque.
 * - Cada tarjeta muestra los datos del cliente (nombre, apellido, género,
 *   confirmación de mayoría de edad), el método/valor de contacto elegido y
 *   cómo entrega el artículo (recogida en su domicilio con dirección, o él
 *   se desplaza, con su disponibilidad horaria).
 * - Filtro rápido por estado + buscador por nombre, artículo, ciudad o
 *   contacto.
 * - Tema claro (fondo blanco, texto azul marino, acentos azul claro) con
 *   contenido centrado en pantallas anchas (columnStyle, maxWidth 1160).
 *   El fondo oscuro semitransparente detrás del modal de confirmación de
 *   borrado se mantiene oscuro a propósito.
 * - Si el cliente adjuntó fotos/vídeo, cada tarjeta muestra un botón
 *   "Descargar" por archivo (foto 1, foto 2..., vídeo). El bucket de
 *   Storage es privado a propósito: no hay galería ni previsualización
 *   embebida, cada archivo se descarga al dispositivo del admin uno a uno
 *   (ver components/SellRequestMedia.tsx → downloadSellRequestMedia()).
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase para leer/escribir solicitudes.
 * - sql/sell_requests.sql → define la tabla y sus políticas RLS.
 * - sql/sell_request_media.sql → define la tabla "sell_request_media" y el
 *   bucket privado "sell-request-media" con sus políticas RLS.
 * - components/VenderAhoraModal.tsx → origen de cada fila (INSERT público)
 *   y de sus archivos adjuntos.
 * - components/SellRequestMedia.tsx → tipos y descarga de cada archivo.
 * - app/admin/index.tsx → origen habitual de la navegación a esta pantalla.
 * - app/admin/_layout.tsx → registra esta ruta ("cotizaciones") dentro del
 *   Stack protegido del panel admin.
 *
 * Rendimiento: load() limita "sell_requests" a 200 filas y pide los
 * adjuntos de "sell_request_media" solo de esas solicitudes (.in) con su
 * propio límite de 200, para no crecer sin control con el tiempo.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { downloadSellRequestMedia, type SellRequestMediaRow } from "../../components/SellRequestMedia";

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

// Ancho máximo centrado para pantallas grandes (web/tablet); en móvil ocupa el 100%.
const columnStyle = { width: "100%", maxWidth: 1160, alignSelf: "center" } as const;
const modalColumnStyle = { width: "100%", maxWidth: 560, alignSelf: "center" } as const;

type SellRequestStatus = "nuevo" | "revisado" | "contactado" | "descartado";
type MetodoContacto = "whatsapp" | "gmail" | "instagram" | "facebook" | "tiktok";
type OpcionVenta = "domicilio" | "entrega";
type Disponibilidad = "manana" | "mediodia" | "tardenoche";
type Genero = "masculino" | "femenino";

type SellRequestRow = {
  id: string;
  created_at: string;
  updated_at: string;
  nombre: string;
  apellido: string;
  articulo: string;
  funciona_bien: boolean;
  motivo_venta: string | null;
  descripcion_problema: string | null;
  ciudad: string;
  precio_estimado: string;
  metodo_contacto: MetodoContacto | null;
  contacto: string | null;
  opcion_venta: OpcionVenta;
  direccion: string | null;
  disponibilidad: Disponibilidad | null;
  mayor_edad: boolean;
  genero: Genero;
  status: SellRequestStatus;
};

const STATUS_LABEL: Record<SellRequestStatus, string> = {
  nuevo: "Nueva",
  revisado: "Revisada",
  contactado: "Contactada",
  descartado: "Descartada",
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

const GENERO_LABEL: Record<Genero, string> = {
  masculino: "Masculino",
  femenino: "Femenino",
};

const STATUS_COLORS: Record<SellRequestStatus, { bg: string; border: string }> = {
  nuevo: { bg: COLORS.warningBg, border: COLORS.warningBorder },
  revisado: { bg: COLORS.accent2, border: COLORS.accentBorder },
  contactado: { bg: COLORS.successBg, border: COLORS.successBorder },
  descartado: { bg: COLORS.dangerBg, border: COLORS.dangerBorder },
};

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

function StatCard({
  label,
  value,
  icon,
  isMobile,
  compact,
}: {
  label: string;
  value: string;
  icon?: IoniconName;
  isMobile?: boolean;
  compact?: boolean;
}) {
  return (
    <View
      style={{
        width: compact ? (isMobile ? "48.4%" : "23.4%") : "100%",
        borderRadius: 18,
        backgroundColor: COLORS.cardSoft,
        padding: isMobile ? 12 : 14,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {icon ? <Ionicons name={icon} size={13} color={COLORS.muted2} /> : null}
        <Text style={{ color: COLORS.muted2, fontWeight: "700", fontSize: 12 }}>{label}</Text>
      </View>
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
  variant?: "primary" | "danger" | "ghost";
  disabled?: boolean;
  isMobile?: boolean;
  fullWidth?: boolean;
}) {
  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";

  const borderColor = isPrimary
    ? COLORS.accentBorder
    : isDanger
      ? COLORS.dangerBorder
      : COLORS.border;

  const backgroundColor = isPrimary
    ? COLORS.accent2
    : isDanger
      ? COLORS.dangerBg
      : "#F6FAFD";

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

function FilterPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? COLORS.accentBorder : COLORS.border,
        backgroundColor: active ? COLORS.accent2 : "#F6FAFD",
        opacity: pressed ? 0.88 : 1,
      })}
    >
      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

export default function AdminCotizaciones() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const isDesktopish = widthSafe >= 1024;
  const pagePadding = isMobile ? 12 : 16;

  const [loading, setLoading] = useState(true);
  const [screenErr, setScreenErr] = useState<string | null>(null);

  const [items, setItems] = useState<SellRequestRow[]>([]);
  const itemsRef = useRef<SellRequestRow[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SellRequestStatus | "todas">("todas");
  const [confirmDelete, setConfirmDelete] = useState<SellRequestRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Fotos/vídeo adjuntos por solicitud (tabla "sell_request_media"),
  // agrupados por sell_request_id. Si la tabla todavía no existe (falta
  // ejecutar sql/sell_request_media.sql) se deja vacío sin romper el resto
  // del panel.
  const [mediaByRequest, setMediaByRequest] = useState<Record<string, SellRequestMediaRow[]>>({});
  const [downloadingMediaId, setDownloadingMediaId] = useState<string | null>(null);
  const [mediaErr, setMediaErr] = useState<string | null>(null);

  const stats = useMemo(() => {
    const total = items.length;
    const nuevo = items.filter((x) => x.status === "nuevo").length;
    const revisado = items.filter((x) => x.status === "revisado").length;
    const contactado = items.filter((x) => x.status === "contactado").length;

    return { total, nuevo, revisado, contactado };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();

    return items.filter((r) => {
      if (statusFilter !== "todas" && r.status !== statusFilter) return false;
      if (!q) return true;

      return (
        String(r.articulo ?? "").toLowerCase().includes(q) ||
        String(r.nombre ?? "").toLowerCase().includes(q) ||
        String(r.apellido ?? "").toLowerCase().includes(q) ||
        String(r.ciudad ?? "").toLowerCase().includes(q) ||
        String(r.contacto ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, search, statusFilter]);

  async function load() {
    setLoading(true);
    setScreenErr(null);

    try {
      const res = await supabase
        .from("sell_requests")
        .select(
          "id,created_at,updated_at,nombre,apellido,articulo,funciona_bien,motivo_venta,descripcion_problema,ciudad,precio_estimado,metodo_contacto,contacto,opcion_venta,direccion,disponibilidad,mayor_edad,genero,status"
        )
        .order("created_at", { ascending: false })
        .limit(200);

      if (res.error) throw res.error;

      const rows = (res.data ?? []) as SellRequestRow[];
      setItems(rows);

      // Aparte, y sin bloquear la lista si falla: los archivos adjuntos.
      // Se piden solo los de las solicitudes ya cargadas (.in) y con un
      // límite de seguridad, en vez de traer toda la tabla de adjuntos.
      try {
        const requestIds = rows.map((r) => r.id);
        if (!requestIds.length) {
          setMediaByRequest({});
          return;
        }

        const mediaRes = await supabase
          .from("sell_request_media")
          .select("id,sell_request_id,kind,storage_path,file_name,mime_type,size_bytes,duration_seconds,sort_order,created_at")
          .in("sell_request_id", requestIds)
          .order("sell_request_id", { ascending: true })
          .order("sort_order", { ascending: true })
          .limit(200);

        if (mediaRes.error) throw mediaRes.error;

        const grouped: Record<string, SellRequestMediaRow[]> = {};
        for (const row of (mediaRes.data ?? []) as SellRequestMediaRow[]) {
          const list = grouped[row.sell_request_id] ?? (grouped[row.sell_request_id] = []);
          list.push(row);
        }
        setMediaByRequest(grouped);
      } catch {
        // La tabla puede no existir todavía (falta ejecutar la migración) o
        // el usuario puede no tener permisos; en cualquier caso, se listan
        // las solicitudes igualmente, solo sin sus archivos.
        setMediaByRequest({});
      }
    } catch (e: any) {
      console.error("Error cargando las solicitudes:", e);
      setScreenErr("No se han podido cargar las solicitudes. Inténtalo de nuevo en unos minutos.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function setStatus(row: SellRequestRow, next: SellRequestStatus) {
    if (busyId) return;

    setBusyId(row.id);
    const prev = itemsRef.current;
    const optimistic = prev.map((x) => (x.id === row.id ? { ...x, status: next } : x));
    setItems(optimistic);

    try {
      const { error } = await supabase
        .from("sell_requests")
        .update({ status: next })
        .eq("id", row.id);

      if (error) throw error;
    } catch (e: any) {
      setItems(prev);
      console.error("Error actualizando el estado:", e);
      setScreenErr("No se pudo actualizar el estado. Inténtalo de nuevo.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDownloadMedia(row: SellRequestMediaRow) {
    if (downloadingMediaId) return;

    setMediaErr(null);
    setDownloadingMediaId(row.id);

    try {
      await downloadSellRequestMedia(row);
    } catch (e: any) {
      console.error("Error descargando el archivo:", e);
      setMediaErr("No se pudo descargar el archivo. Inténtalo de nuevo.");
    } finally {
      setDownloadingMediaId(null);
    }
  }

  function askRemove(row: SellRequestRow) {
    setConfirmDelete(row);
  }

  async function removeConfirmed() {
    const row = confirmDelete;
    if (!row) return;

    setConfirmDelete(null);
    setScreenErr(null);

    try {
      const { error } = await supabase.from("sell_requests").delete().eq("id", row.id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      console.error("Error borrando la solicitud:", e);
      setScreenErr("No se pudo borrar la solicitud. Inténtalo de nuevo.");
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: "#E3EAF2",
          paddingHorizontal: pagePadding,
          paddingTop: isMobile ? 12 : 14,
          paddingBottom: isMobile ? 12 : 12,
          gap: 12,
        }}
      >
        <View style={{ ...columnStyle, gap: 12 }}>
          <View
            style={{
              flexDirection: isMobile ? "column" : "row",
              justifyContent: "space-between",
              alignItems: isMobile ? "stretch" : "center",
              gap: 10,
            }}
          >
            <View style={{ flex: isMobile ? undefined : 1 }}>
              <Text
                style={{
                  color: COLORS.text,
                  fontSize: isMobile ? 22 : 24,
                  fontWeight: "900",
                  lineHeight: isMobile ? 28 : 30,
                }}
              >
                Solicitudes de venta
              </Text>
              <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 20 }}>
                Solicitudes de "Vender ahora" enviadas por clientes desde la app.
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
                backgroundColor: "#F6FAFD",
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
            <StatCard label="Total" value={String(stats.total)} icon="document-text-outline" isMobile={isMobile} compact />
            <StatCard label="Nuevas" value={String(stats.nuevo)} icon="sparkles-outline" isMobile={isMobile} compact />
            <StatCard label="Revisadas" value={String(stats.revisado)} icon="eye-outline" isMobile={isMobile} compact />
            <StatCard label="Contactadas" value={String(stats.contactado)} icon="chatbubbles-outline" isMobile={isMobile} compact />
          </View>

          <View
            style={{
              borderRadius: 18,
              backgroundColor: COLORS.card,
              padding: 12,
              gap: 10,
            }}
          >
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar por nombre, artículo, ciudad o contacto"
              placeholderTextColor="rgba(11,33,56,0.40)"
              style={{
                borderWidth: 1,
                borderColor: COLORS.border,
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: COLORS.text,
                backgroundColor: "#F8FBFE",
                fontSize: isMobile ? 14 : 15,
              }}
            />

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <FilterPill label="Todas" active={statusFilter === "todas"} onPress={() => setStatusFilter("todas")} />
              <FilterPill label="Nuevas" active={statusFilter === "nuevo"} onPress={() => setStatusFilter("nuevo")} />
              <FilterPill label="Revisadas" active={statusFilter === "revisado"} onPress={() => setStatusFilter("revisado")} />
              <FilterPill label="Contactadas" active={statusFilter === "contactado"} onPress={() => setStatusFilter("contactado")} />
              <FilterPill label="Descartadas" active={statusFilter === "descartado"} onPress={() => setStatusFilter("descartado")} />
            </View>
          </View>

          {!!screenErr && (
            <View
              style={{
                borderRadius: 14,
                backgroundColor: COLORS.dangerBg,
                padding: 10,
              }}
            >
              <Text style={{ color: COLORS.danger, fontWeight: "800", lineHeight: 20 }}>
                {screenErr}
              </Text>
            </View>
          )}

          {!!mediaErr && (
            <View
              style={{
                borderRadius: 14,
                backgroundColor: COLORS.dangerBg,
                padding: 10,
              }}
            >
              <Text style={{ color: COLORS.danger, fontWeight: "800", lineHeight: 20 }}>
                {mediaErr}
              </Text>
            </View>
          )}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator color={COLORS.text} />
          <Text style={{ color: COLORS.muted }}>Cargando solicitudes…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: pagePadding,
            paddingBottom: 30,
            alignItems: "center",
          }}
        >
          <View style={{ ...columnStyle, gap: 12 }}>
            {filteredItems.length === 0 ? (
              <View
                style={{
                  borderRadius: 18,
                  backgroundColor: COLORS.card,
                  padding: isMobile ? 14 : 16,
                  gap: 8,
                }}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
                  No hay solicitudes para este filtro.
                </Text>
                <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                  En cuanto un cliente envíe el formulario de "Vender ahora" aparecerá aquí.
                </Text>
              </View>
            ) : (
              filteredItems.map((r) => {
                const st = STATUS_COLORS[r.status];
                const isBusy = busyId === r.id;

                return (
                  <View
                    key={r.id}
                    style={{
                      borderRadius: 20,
                      backgroundColor: COLORS.card,
                      padding: isMobile ? 12 : 14,
                      gap: 10,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: isMobile ? "column" : "row",
                        justifyContent: "space-between",
                        alignItems: isMobile ? "stretch" : "flex-start",
                        gap: 10,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            color: COLORS.text,
                            fontWeight: "900",
                            fontSize: isMobile ? 16 : 17,
                            lineHeight: 22,
                          }}
                        >
                          {r.articulo}
                        </Text>
                        <Text style={{ color: COLORS.muted, fontWeight: "800", marginTop: 2 }}>
                          {r.nombre} {r.apellido}
                        </Text>
                        <Text style={{ color: COLORS.muted2, fontSize: 12, marginTop: 4 }}>
                          {r.created_at ? new Date(r.created_at).toLocaleString() : "-"}
                        </Text>
                      </View>

                      <View
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: st.border,
                          backgroundColor: st.bg,
                          alignSelf: isMobile ? "flex-start" : "auto",
                        }}
                      >
                        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                          {STATUS_LABEL[r.status]}
                        </Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      <View
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: r.funciona_bien ? COLORS.successBorder : COLORS.warningBorder,
                          backgroundColor: r.funciona_bien ? COLORS.successBg : COLORS.warningBg,
                        }}
                      >
                        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                          {r.funciona_bien ? "Funciona bien" : "Presenta una avería"}
                        </Text>
                      </View>

                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: COLORS.border,
                          backgroundColor: "#F6FAFD",
                        }}
                      >
                        <Ionicons name="location-outline" size={13} color={COLORS.text} />
                        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                          {r.ciudad}
                        </Text>
                      </View>

                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: COLORS.border,
                          backgroundColor: "#F6FAFD",
                        }}
                      >
                        <Ionicons name="cash-outline" size={13} color={COLORS.text} />
                        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                          {r.precio_estimado}
                        </Text>
                      </View>

                      <View
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: COLORS.border,
                          backgroundColor: "#F6FAFD",
                        }}
                      >
                        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                          {GENERO_LABEL[r.genero]}
                        </Text>
                      </View>

                      <View
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: r.mayor_edad ? COLORS.successBorder : COLORS.warningBorder,
                          backgroundColor: r.mayor_edad ? COLORS.successBg : COLORS.warningBg,
                        }}
                      >
                        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                          {r.mayor_edad ? "Mayoría de edad confirmada" : "Mayoría de edad sin confirmar"}
                        </Text>
                      </View>
                    </View>

                    <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                      {r.funciona_bien ? r.motivo_venta : r.descripcion_problema}
                    </Text>

                    <Text style={{ color: COLORS.text, fontWeight: "800", lineHeight: 20 }}>
                      {r.opcion_venta === "domicilio"
                        ? `Recogida en domicilio: ${r.direccion ?? "-"}`
                        : `El cliente se desplaza para entregar el artículo · Disponibilidad: ${
                            r.disponibilidad ? DISPONIBILIDAD_LABEL[r.disponibilidad] : "-"
                          }`}
                    </Text>

                    {!!r.contacto && (
                      <Text style={{ color: COLORS.text, fontWeight: "800", lineHeight: 20 }}>
                        Contacto{r.metodo_contacto ? ` (${METODO_LABEL[r.metodo_contacto]})` : ""}: {r.contacto}
                      </Text>
                    )}

                    {(() => {
                      const media = mediaByRequest[r.id];
                      if (!media?.length) return null;
                      let imgCount = 0;
                      return (
                        <View style={{ gap: 6 }}>
                          <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12 }}>
                            Fotos y vídeo adjuntos ({media.length})
                          </Text>
                          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                            {media.map((m) => {
                              const label =
                                m.kind === "video" ? "Descargar vídeo" : `Descargar foto ${++imgCount}`;
                              return (
                                <ChipButton
                                  key={m.id}
                                  label={downloadingMediaId === m.id ? "Descargando…" : label}
                                  variant="ghost"
                                  disabled={!!downloadingMediaId}
                                  onPress={() => handleDownloadMedia(m)}
                                  isMobile={isMobile}
                                />
                              );
                            })}
                          </View>
                        </View>
                      );
                    })()}

                    <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                      {r.status !== "revisado" && (
                        <ChipButton
                          label="Marcar revisada"
                          variant="primary"
                          disabled={isBusy}
                          onPress={() => setStatus(r, "revisado")}
                          isMobile={isMobile}
                        />
                      )}
                      {r.status !== "contactado" && (
                        <ChipButton
                          label="Marcar contactada"
                          variant="primary"
                          disabled={isBusy}
                          onPress={() => setStatus(r, "contactado")}
                          isMobile={isMobile}
                        />
                      )}
                      {r.status !== "descartado" && (
                        <ChipButton
                          label="Descartar"
                          variant="ghost"
                          disabled={isBusy}
                          onPress={() => setStatus(r, "descartado")}
                          isMobile={isMobile}
                        />
                      )}
                      <ChipButton
                        label="Borrar"
                        variant="danger"
                        disabled={isBusy}
                        onPress={() => askRemove(r)}
                        isMobile={isMobile}
                      />
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      )}

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
              ...modalColumnStyle,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: COLORS.dangerBorder,
              backgroundColor: COLORS.bg2,
              padding: isMobile ? 14 : 16,
              gap: 10,
            }}
          >
            <Text style={{ color: COLORS.text, fontSize: isMobile ? 17 : 18, fontWeight: "900" }}>
              Borrar solicitud
            </Text>

            <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
              Vas a borrar la solicitud de{" "}
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                {confirmDelete?.articulo ?? ""}
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
                onPress={removeConfirmed}
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
