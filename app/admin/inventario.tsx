// app/admin/inventario.tsx
/**
 * Qué hace: pantalla de administración de inventario interno. Lista, crea,
 * edita, cambia de estado y borra las unidades físicas en gestión (por
 * ejemplo, una consola recién comprada pendiente de revisión).
 *
 * Cómo funciona:
 * - Lee/escribe directamente en la tabla "inventory_items" de Supabase
 *   (columnas: id, code, title, status, notes, created_at, updated_at). Ver
 *   sql/inventory_items.sql para crear esa tabla en tu proyecto de Supabase
 *   si todavía no existe (hace falta ejecutarla una vez en el SQL Editor).
 * - Es una lista de gestión de stock independiente: no está enlazada con
 *   "products" ni con "sell_requests" (cotizaciones). El código sugiere un
 *   siguiente número correlativo al crear un artículo, pero es editable.
 * - El modal de creación/edición valida código y título antes de guardar
 *   con insert/update. toggleStatus() permite cambiar el estado con un toque
 *   desde la propia tarjeta, sin abrir el modal.
 * - Si la tabla "inventory_items" todavía no existe en Supabase, la pantalla
 *   lo detecta (error de Postgres "relation does not exist") y muestra un
 *   aviso claro en vez de romperse o quedarse cargando para siempre.
 * - Sigue el tema claro global: fondo blanco, azul claro de acento y textos
 *   en azul marino oscuro.
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase para todas las operaciones CRUD.
 * - sql/inventory_items.sql → crea la tabla y sus políticas (solo admin).
 * - app/admin/index.tsx → pantalla desde la que se entra aquí (tarjeta
 *   "Inventario") y a la que se vuelve con smartBackAdminHome().
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

type InventoryStatus = "TO_REVIEW" | "READY_TO_LIST" | "IN_REPAIR";

type InventoryRow = {
  id: string;
  code: string;
  title: string;
  status: InventoryStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_LABELS: Record<InventoryStatus, string> = {
  TO_REVIEW: "Por revisar",
  READY_TO_LIST: "Listo para publicar",
  IN_REPAIR: "En reparación",
};

const STATUS_ORDER: InventoryStatus[] = ["TO_REVIEW", "READY_TO_LIST", "IN_REPAIR"];

function statusLabel(status: string) {
  return STATUS_LABELS[status as InventoryStatus] ?? status;
}

function statusColors(status: InventoryStatus) {
  if (status === "READY_TO_LIST") {
    return { border: COLORS.successBorder, bg: COLORS.successBg };
  }
  if (status === "IN_REPAIR") {
    return { border: COLORS.dangerBorder, bg: COLORS.dangerBg };
  }
  return { border: COLORS.warningBorder, bg: COLORS.warningBg };
}

function nextStatus(status: InventoryStatus): InventoryStatus {
  const idx = STATUS_ORDER.indexOf(status);
  return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
}

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

function isMissingTableError(e: any): boolean {
  const msg = String(e?.message ?? "").toLowerCase();
  return msg.includes("inventory_items") && (msg.includes("does not exist") || msg.includes("schema cache"));
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
        width: compact ? (isMobile ? "48%" : "23.5%") : "100%",
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
      <Text
        style={{
          color: COLORS.text,
          fontWeight: "900",
          fontSize: isMobile ? 17 : 18,
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

export default function Inventario() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const pagePadding = isMobile ? 12 : 16;

  const [loading, setLoading] = useState(true);
  const [screenErr, setScreenErr] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);

  const [items, setItems] = useState<InventoryRow[]>([]);
  const itemsRef = useRef<InventoryRow[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const [search, setSearch] = useState("");

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<InventoryRow | null>(null);

  const [editing, setEditing] = useState<InventoryRow | null>(null);
  const isEdit = !!editing;

  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<InventoryStatus>("TO_REVIEW");
  const [notes, setNotes] = useState("");

  const modalTitle = useMemo(() => (isEdit ? "Editar artículo" : "Nuevo artículo"), [isEdit]);

  const stats = useMemo(() => {
    const total = items.length;
    const toReview = items.filter((x) => x.status === "TO_REVIEW").length;
    const ready = items.filter((x) => x.status === "READY_TO_LIST").length;
    const inRepair = items.filter((x) => x.status === "IN_REPAIR").length;
    return { total, toReview, ready, inRepair };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => {
      return (
        String(i.code ?? "").toLowerCase().includes(q) ||
        String(i.title ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, search]);

  function suggestNextCode(rows: InventoryRow[]) {
    let maxNum = 0;
    for (const r of rows) {
      const n = parseInt(String(r.code ?? "").replace(/\D/g, ""), 10);
      if (Number.isFinite(n) && n > maxNum) maxNum = n;
    }
    return String(maxNum + 1).padStart(3, "0");
  }

  async function load() {
    setLoading(true);
    setScreenErr(null);
    setTableMissing(false);

    try {
      const res = await supabase
        .from("inventory_items")
        .select("id,code,title,status,notes,created_at,updated_at")
        .order("created_at", { ascending: false });

      if (res.error) {
        if (isMissingTableError(res.error)) {
          setTableMissing(true);
          setItems([]);
          return;
        }
        throw res.error;
      }

      setItems((res.data ?? []) as InventoryRow[]);
    } catch (e: any) {
      console.error("Error cargando inventario:", e);
      setScreenErr("No se ha podido cargar el inventario. Inténtalo de nuevo.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function resetForm(rows?: InventoryRow[]) {
    setEditing(null);
    setCode(suggestNextCode(rows ?? itemsRef.current));
    setTitle("");
    setStatus("TO_REVIEW");
    setNotes("");
    setModalErr(null);
  }

  function openCreate() {
    resetForm();
    setOpen(true);
  }

  function openEdit(i: InventoryRow) {
    setEditing(i);
    setCode(i.code ?? "");
    setTitle(i.title ?? "");
    setStatus(i.status);
    setNotes(i.notes ?? "");
    setModalErr(null);
    setOpen(true);
  }

  async function save() {
    if (saving) return;

    setSaving(true);
    setModalErr(null);

    const cleanCode = code.trim();
    const cleanTitle = title.trim();
    const cleanNotes = notes.trim();

    if (!cleanCode) {
      setModalErr("Introduce un código para el artículo.");
      setSaving(false);
      return;
    }

    if (!cleanTitle || cleanTitle.length < 2) {
      setModalErr("Introduce un título válido.");
      setSaving(false);
      return;
    }

    try {
      const payload: any = {
        code: cleanCode,
        title: cleanTitle,
        status,
        notes: cleanNotes || null,
      };

      if (editing) {
        const { error } = await supabase.from("inventory_items").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("inventory_items").insert(payload);
        if (error) throw error;
      }

      setOpen(false);
      resetForm();
      await load();
    } catch (e: any) {
      console.error("Error guardando artículo de inventario:", e);
      if (isMissingTableError(e)) {
        setModalErr("Todavía no existe la tabla de inventario en Supabase. Revisa sql/inventory_items.sql.");
      } else {
        setModalErr("No se pudo guardar el artículo. Inténtalo de nuevo.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(i: InventoryRow) {
    const prev = itemsRef.current;
    const newStatus = nextStatus(i.status);
    const next = prev.map((x) => (x.id === i.id ? { ...x, status: newStatus } : x));
    setItems(next);

    const { error } = await supabase.from("inventory_items").update({ status: newStatus }).eq("id", i.id);

    if (error) {
      setItems(prev);
      setScreenErr(error.message);
    }
  }

  function askRemove(i: InventoryRow) {
    setConfirmDelete(i);
  }

  async function removeConfirmed() {
    const i = confirmDelete;
    if (!i) return;

    setConfirmDelete(null);
    setScreenErr(null);

    try {
      const { error } = await supabase.from("inventory_items").delete().eq("id", i.id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      console.error("Error borrando artículo de inventario:", e);
      setScreenErr("No se ha podido borrar el artículo. Inténtalo de nuevo.");
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
          alignItems: "center",
        }}
      >
        <View style={{ width: "100%", maxWidth: 1040, gap: 12 }}>
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
                  textAlign: isMobile ? "center" : "left",
                }}
              >
                Inventario
              </Text>
              <Text
                style={{
                  color: COLORS.muted,
                  marginTop: 4,
                  lineHeight: 20,
                  textAlign: isMobile ? "center" : "left",
                }}
              >
                Controla el código interno y el estado de cada unidad física en gestión.
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

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" }}>
            <StatCard label="Total" value={String(stats.total)} icon="cube-outline" isMobile={isMobile} compact />
            <StatCard label="Por revisar" value={String(stats.toReview)} icon="time-outline" isMobile={isMobile} compact />
            <StatCard label="Listos" value={String(stats.ready)} icon="checkmark-circle-outline" isMobile={isMobile} compact />
            <StatCard label="En reparación" value={String(stats.inRepair)} icon="build-outline" isMobile={isMobile} compact />
          </View>

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
              onChangeText={(v) => setSearch(v)}
              placeholder="Buscar por código o título"
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
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>+ Nuevo artículo</Text>
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

          {tableMissing && (
            <View
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: COLORS.warningBorder,
                backgroundColor: COLORS.warningBg,
                padding: 10,
                gap: 4,
              }}
            >
              <Text style={{ color: COLORS.warning, fontWeight: "900", lineHeight: 20 }}>
                Falta crear la tabla de inventario en Supabase.
              </Text>
              <Text style={{ color: COLORS.warning, lineHeight: 19 }}>
                Ejecuta el archivo sql/inventory_items.sql una vez en el SQL Editor de tu
                proyecto de Supabase y recarga esta pantalla.
              </Text>
            </View>
          )}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator color={COLORS.text} />
          <Text style={{ color: COLORS.muted }}>Cargando inventario…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: pagePadding,
            paddingBottom: 30,
            alignItems: "center",
          }}
        >
          <View style={{ width: "100%", maxWidth: 1040, gap: 12 }}>
            {!tableMissing && filteredItems.length === 0 ? (
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
                  No hay artículos para este filtro.
                </Text>
                <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                  Crea tu primer artículo de inventario para empezar a llevar el control.
                </Text>
              </View>
            ) : (
              filteredItems.map((i) => {
                const sc = statusColors(i.status);
                return (
                  <View
                    key={i.id}
                    style={{
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      backgroundColor: COLORS.card,
                      padding: isMobile ? 12 : 14,
                      gap: 10,
                      ...softShadow(),
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
                        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: isMobile ? 16 : 17 }}>
                          {i.code} · {i.title}
                        </Text>

                        {!!i.notes && (
                          <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 19 }}>{i.notes}</Text>
                        )}

                        <Text style={{ color: COLORS.muted2, fontSize: 12, marginTop: 8, lineHeight: 17 }}>
                          Actualizado: {i.updated_at ? new Date(i.updated_at).toLocaleString() : "-"}
                        </Text>
                      </View>

                      <Pressable
                        onPress={() => toggleStatus(i)}
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.85 : 1,
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: sc.border,
                          backgroundColor: sc.bg,
                          alignSelf: isMobile ? "flex-start" : "auto",
                        })}
                      >
                        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                          {statusLabel(i.status)}
                        </Text>
                      </Pressable>
                    </View>

                    <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                      <ChipButton label="Editar" variant="primary" onPress={() => openEdit(i)} isMobile={isMobile} />
                      <ChipButton label="Borrar" variant="danger" onPress={() => askRemove(i)} isMobile={isMobile} />
                    </View>
                  </View>
                );
              })
            )}
          </View>
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
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }} keyboardShouldPersistTaps="handled">
            <View
              style={{
                width: "100%",
                maxWidth: 560,
                alignSelf: "center",
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
                {modalTitle}
              </Text>

              <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                Define el código interno, el título y el estado actual del artículo.
              </Text>

              <TextInput
                value={code}
                onChangeText={(v) => {
                  setCode(v);
                  setModalErr(null);
                }}
                placeholder="Código (ej. 001)"
                placeholderTextColor="rgba(11,33,56,0.40)"
                autoCapitalize="none"
                style={{
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  color: COLORS.text,
                  backgroundColor: "#F8FBFE",
                  fontSize: 14,
                }}
              />

              <TextInput
                value={title}
                onChangeText={(v) => {
                  setTitle(v);
                  setModalErr(null);
                }}
                placeholder="Título (ej. PS5 Slim 1TB)"
                placeholderTextColor="rgba(11,33,56,0.40)"
                style={{
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  color: COLORS.text,
                  backgroundColor: "#F8FBFE",
                  fontSize: 14,
                }}
              />

              <TextInput
                value={notes}
                onChangeText={(v) => {
                  setNotes(v);
                  setModalErr(null);
                }}
                placeholder="Notas (opcional)"
                placeholderTextColor="rgba(11,33,56,0.40)"
                multiline
                numberOfLines={3}
                style={{
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  color: COLORS.text,
                  backgroundColor: "#F8FBFE",
                  fontSize: 14,
                  minHeight: 72,
                  textAlignVertical: "top",
                }}
              />

              <View
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.cardSoft,
                  padding: 12,
                  gap: 10,
                }}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Estado</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {STATUS_ORDER.map((s) => {
                    const active = status === s;
                    const sc = statusColors(s);
                    return (
                      <Pressable
                        key={s}
                        onPress={() => setStatus(s)}
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.88 : 1,
                          paddingVertical: 9,
                          paddingHorizontal: 12,
                          borderRadius: 999,
                          borderWidth: active ? 2 : 1,
                          borderColor: active ? sc.border : COLORS.border,
                          backgroundColor: active ? sc.bg : "#F6FAFD",
                        })}
                      >
                        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13 }}>
                          {statusLabel(s)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
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
                  <Text style={{ color: COLORS.danger, fontWeight: "800", lineHeight: 20 }}>{modalErr}</Text>
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
                    backgroundColor: "#F6FAFD",
                    width: isMobile ? "100%" : undefined,
                  })}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>Cancelar</Text>
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
                    {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear artículo"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={!!confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(null)}>
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
              width: "100%",
              maxWidth: 520,
              alignSelf: "center",
              borderRadius: 18,
              borderWidth: 1,
              borderColor: COLORS.dangerBorder,
              backgroundColor: COLORS.bg2,
              padding: isMobile ? 14 : 16,
              gap: 10,
            }}
          >
            <Text style={{ color: COLORS.text, fontSize: isMobile ? 17 : 18, fontWeight: "900" }}>
              Borrar artículo
            </Text>

            <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
              Vas a borrar{" "}
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                {confirmDelete ? `${confirmDelete.code} · ${confirmDelete.title}` : ""}
              </Text>
              . Esta acción no se puede deshacer.
            </Text>

            <View style={{ flexDirection: isMobile ? "column" : "row", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
              <ChipButton label="Cancelar" variant="ghost" onPress={() => setConfirmDelete(null)} isMobile={isMobile} fullWidth={isMobile} />
              <ChipButton label="Sí, borrar" variant="danger" onPress={removeConfirmed} isMobile={isMobile} fullWidth={isMobile} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
