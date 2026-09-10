// app/admin/categories.tsx
/**
 * Qué hace: pantalla de administración de categorías. Lista, crea, edita,
 * activa/desactiva y borra las categorías que estructuran la navegación
 * comercial de la tienda (por ejemplo "PlayStation 5", "Xbox", "PC Gaming").
 *
 * Cómo funciona:
 * - Lee/escribe directamente en la tabla "categories" de Supabase
 *   (columnas: id, name, slug, sort_order, is_active, image_url,
 *   created_at, updated_at).
 * - Si la columna "image_url" no existe todavía en Supabase, hace un
 *   fallback automático a una consulta sin esa columna (supportsImageUrl).
 * - El modal de creación/edición valida nombre, slug (autogenerado desde el
 *   nombre) y URL de imagen antes de guardar con insert/update.
 * - toggleActive() aplica un cambio optimista en la lista y lo revierte si
 *   Supabase devuelve error.
 * - Sigue el tema claro global: fondo blanco, azul claro de acento y textos
 *   en azul marino oscuro.
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase para todas las operaciones CRUD.
 * - app/admin/index.tsx → pantalla desde la que se entra aquí (tarjeta
 *   "Categorías") y a la que se vuelve con smartBackAdminHome().
 * - app/admin/products.tsx → los productos usan estas categorías
 *   (category_id) para clasificarse en el catálogo público.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import SmartImage from "../../components/SmartImage";

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

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  image_url?: string | null;
  created_at: string;
  updated_at: string;
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

function slugify(input: string) {
  return (input ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 60);
}

function toIntSafe(v: string, fallback = 0) {
  const raw = String(v ?? "").trim();
  if (!raw) return fallback;
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function isValidHttpUrl(value: string) {
  const url = String(value ?? "").trim();
  if (!url) return false;
  return /^https?:\/\/\S+$/i.test(url);
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
        width: compact ? (isMobile ? "100%" : "31.9%") : "100%",
        borderRadius: 18,
        backgroundColor: COLORS.cardSoft,
        padding: isMobile ? 12 : 14,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {icon ? <Ionicons name={icon} size={13} color={COLORS.muted2} /> : null}
        <Text style={{ color: COLORS.muted2, fontWeight: "700", fontSize: 12 }}>
          {label}
        </Text>
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

export default function AdminCategories() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const isTablet = widthSafe >= 700 && widthSafe < 1024;
  const isDesktopish = widthSafe >= 1024;
  const pagePadding = isMobile ? 12 : 16;

  const [loading, setLoading] = useState(true);
  const [screenErr, setScreenErr] = useState<string | null>(null);

  const [items, setItems] = useState<CategoryRow[]>([]);
  const itemsRef = useRef<CategoryRow[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const [supportsImageUrl, setSupportsImageUrl] = useState(true);

  const [search, setSearch] = useState("");

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CategoryRow | null>(null);

  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const isEdit = !!editing;

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [imageUrl, setImageUrl] = useState("");

  const modalTitle = useMemo(
    () => (isEdit ? "Editar categoría" : "Nueva categoría"),
    [isEdit]
  );

  const stats = useMemo(() => {
    const total = items.length;
    const active = items.filter((x) => !!x.is_active).length;
    const hidden = items.filter((x) => !x.is_active).length;

    return { total, active, hidden };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;

    return items.filter((c) => {
      return (
        String(c.name ?? "").toLowerCase().includes(q) ||
        String(c.slug ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, search]);

  async function load() {
    setLoading(true);
    setScreenErr(null);

    try {
      const res = await supabase
        .from("categories")
        .select("id,name,slug,sort_order,is_active,image_url,created_at,updated_at")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (res.error) {
        const msg = String(res.error.message ?? "");
        const imageColumnMissing =
          msg.includes("image_url") && (msg.includes("column") || msg.includes("does not exist"));

        if (imageColumnMissing) {
          const fallback = await supabase
            .from("categories")
            .select("id,name,slug,sort_order,is_active,created_at,updated_at")
            .order("sort_order", { ascending: true })
            .order("name", { ascending: true });

          if (fallback.error) throw fallback.error;

          setSupportsImageUrl(false);
          setItems(
            ((fallback.data ?? []) as CategoryRow[]).map((row) => ({
              ...row,
              image_url: null,
            }))
          );
          return;
        }

        throw res.error;
      }

      setSupportsImageUrl(true);
      setItems((res.data ?? []) as CategoryRow[]);
    } catch (e: any) {
      console.error("Error cargando categorías:", e);
      setScreenErr("No se han podido cargar las categorías. Inténtalo de nuevo.");
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
    setName("");
    setSlug("");
    setSortOrder("0");
    setIsActive(true);
    setImageUrl("");
    setModalErr(null);
  }

  function openCreate() {
    resetForm();
    setOpen(true);
  }

  function openEdit(c: CategoryRow) {
    setEditing(c);
    setName(c.name ?? "");
    setSlug(c.slug ?? "");
    setSortOrder(String(c.sort_order ?? 0));
    setIsActive(!!c.is_active);
    setImageUrl(c.image_url ?? "");
    setModalErr(null);
    setOpen(true);
  }

  async function save() {
    if (saving) return;

    setSaving(true);
    setModalErr(null);

    const cleanName = name.trim();
    const cleanSlug = slugify(slug || cleanName);
    const so = toIntSafe(sortOrder, 0);
    const cleanImg = String(imageUrl ?? "").trim();

    if (!cleanName) {
      setModalErr("Introduce un nombre de categoría.");
      setSaving(false);
      return;
    }

    if (cleanName.length < 2) {
      setModalErr("El nombre es demasiado corto.");
      setSaving(false);
      return;
    }

    if (!cleanSlug) {
      setModalErr("Slug inválido.");
      setSaving(false);
      return;
    }

    if (cleanImg && !isValidHttpUrl(cleanImg)) {
      setModalErr("La URL de imagen debe empezar por http:// o https://");
      setSaving(false);
      return;
    }

    try {
      const payload: any = {
        name: cleanName,
        slug: cleanSlug,
        sort_order: so,
        is_active: isActive,
      };

      if (supportsImageUrl) {
        payload.image_url = cleanImg || null;
      }

      if (editing) {
        const { error } = await supabase
          .from("categories")
          .update(payload)
          .eq("id", editing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("categories").insert(payload);
        if (error) throw error;
      }

      setOpen(false);
      resetForm();
      await load();
    } catch (e: any) {
      console.error("Error guardando categoría:", e);
      const msg = String(e?.message ?? "");

      if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
        setModalErr("Ya existe una categoría con ese nombre o slug.");
      } else {
        setModalErr("No se pudo guardar la categoría. Inténtalo de nuevo.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: CategoryRow) {
    const prev = itemsRef.current;
    const next = prev.map((x) => (x.id === c.id ? { ...x, is_active: !x.is_active } : x));
    setItems(next);

    const { error } = await supabase
      .from("categories")
      .update({ is_active: !c.is_active })
      .eq("id", c.id);

    if (error) {
      setItems(prev);
      setScreenErr(error.message);
    }
  }

  function askRemove(c: CategoryRow) {
    setConfirmDelete(c);
  }

  async function removeCategoryConfirmed() {
    const c = confirmDelete;
    if (!c) return;

    setConfirmDelete(null);
    setScreenErr(null);

    try {
      const { error } = await supabase.from("categories").delete().eq("id", c.id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      console.error("Error borrando categoría:", e);
      setScreenErr("No se ha podido borrar la categoría. Inténtalo de nuevo.");
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
        {/* Columna centrada: mismo ancho máximo que la lista de abajo */}
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
              Categorías
            </Text>
            <Text
              style={{
                color: COLORS.muted,
                marginTop: 4,
                lineHeight: 20,
                textAlign: isMobile ? "center" : "left",
              }}
            >
              Crea, ordena y activa las secciones que estructuran la navegación comercial.
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
          <StatCard label="Total" value={String(stats.total)} icon="folder-outline" isMobile={isMobile} compact />
          <StatCard label="Activas" value={String(stats.active)} icon="checkmark-circle-outline" isMobile={isMobile} compact />
          <StatCard label="Ocultas" value={String(stats.hidden)} icon="eye-off-outline" isMobile={isMobile} compact />
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
            onChangeText={(v) => setSearch(v)}
            placeholder="Buscar por nombre o slug"
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
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>
              + Nueva categoría
            </Text>
          </Pressable>
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

        {!supportsImageUrl && (
          <View
            style={{
              borderRadius: 14,
              backgroundColor: COLORS.warningBg,
              padding: 10,
            }}
          >
            <Text style={{ color: COLORS.warning, fontWeight: "800", lineHeight: 20 }}>
              La imagen por URL no está disponible todavía para las categorías. El resto del
              panel sigue funcionando con normalidad.
            </Text>
          </View>
        )}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator color={COLORS.text} />
          <Text style={{ color: COLORS.muted }}>Cargando categorías…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: pagePadding,
            paddingBottom: 30,
            alignItems: "center",
          }}
        >
          {/* Columna centrada: mismo ancho máximo que la cabecera */}
          <View style={{ width: "100%", maxWidth: 1040, gap: 12 }}>
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
                No hay categorías para este filtro.
              </Text>
              <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                Crea tu primera categoría para empezar a organizar el catálogo.
              </Text>
            </View>
          ) : (
            filteredItems.map((c) => (
              <View
                key={c.id}
                style={{
                  borderRadius: 20,
                  backgroundColor: COLORS.card,
                  padding: isMobile ? 12 : 14,
                  gap: 12,
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
                      width: isDesktopish ? 92 : "100%",
                      height: isDesktopish ? 92 : isMobile ? 180 : 210,
                      borderRadius: 16,
                      overflow: "hidden",
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      backgroundColor: "#F8FBFE",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {c.image_url ? (
                      <SmartImage
                        uri={c.image_url}
                        contentFit="cover"
                        style={{ width: "100%", height: "100%" }}
                      />
                    ) : (
                      <Ionicons name="folder-outline" size={28} color={COLORS.muted2} />
                    )}
                  </View>

                  <View style={{ flex: 1, gap: 8 }}>
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
                            lineHeight: 22,
                          }}
                        >
                          {c.name}
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
                              borderColor: COLORS.border,
                              backgroundColor: "#F6FAFD",
                            }}
                          >
                            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                              Slug: {c.slug}
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
                              Orden: {c.sort_order}
                            </Text>
                          </View>

                          <View
                            style={{
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor: c.is_active ? COLORS.successBorder : COLORS.warningBorder,
                              backgroundColor: c.is_active ? COLORS.successBg : COLORS.warningBg,
                            }}
                          >
                            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                              {c.is_active ? "Visible" : "Oculta"}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View
                        style={{
                          alignItems: isMobile ? "flex-start" : "flex-end",
                          gap: 10,
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <Text style={{ color: COLORS.muted, fontWeight: "800" }}>
                            {c.is_active ? "Visible" : "Oculta"}
                          </Text>
                          <Switch value={c.is_active} onValueChange={() => toggleActive(c)} />
                        </View>
                      </View>
                    </View>

                    <Text style={{ color: COLORS.muted2, fontSize: 12, lineHeight: 17 }}>
                      Creada: {c.created_at ? new Date(c.created_at).toLocaleString() : "-"} ·
                      Actualizada: {c.updated_at ? new Date(c.updated_at).toLocaleString() : "-"}
                    </Text>

                    <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                      <ChipButton
                        label="Editar"
                        variant="primary"
                        onPress={() => openEdit(c)}
                        isMobile={isMobile}
                      />
                      <ChipButton
                        label="Borrar"
                        variant="danger"
                        onPress={() => askRemove(c)}
                        isMobile={isMobile}
                      />
                    </View>
                  </View>
                </View>
              </View>
            ))
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
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={{
                width: "100%",
                maxWidth: 640,
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
              <Text
                style={{
                  color: COLORS.text,
                  fontSize: isMobile ? 19 : 20,
                  fontWeight: "900",
                }}
              >
                {modalTitle}
              </Text>

              <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                Define el nombre, el orden y la visibilidad de la categoría en la navegación pública.
              </Text>

              <TextInput
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  if (!isEdit) setSlug(slugify(v));
                  setModalErr(null);
                }}
                placeholder="Nombre de la categoría"
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
                value={slug}
                onChangeText={(v) => {
                  setSlug(v);
                  setModalErr(null);
                }}
                placeholder="Identificador para la URL"
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
                value={sortOrder}
                onChangeText={(v) => {
                  setSortOrder(v);
                  setModalErr(null);
                }}
                placeholder="Orden (0, 10, 20...)"
                placeholderTextColor="rgba(11,33,56,0.40)"
                keyboardType="numeric"
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

              {supportsImageUrl ? (
                <>
                  <TextInput
                    value={imageUrl}
                    onChangeText={(v) => {
                      setImageUrl(v);
                      setModalErr(null);
                    }}
                    placeholder="Imagen URL (https://...)"
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

                  {isValidHttpUrl(imageUrl) ? (
                    <View
                      style={{
                        width: "100%",
                        height: isMobile ? 150 : 160,
                        borderRadius: 16,
                        overflow: "hidden",
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        backgroundColor: "#F8FBFE",
                      }}
                    >
                      <SmartImage
                        uri={imageUrl.trim()}
                        contentFit="cover"
                        style={{ width: "100%", height: "100%" }}
                      />
                    </View>
                  ) : null}
                </>
              ) : null}

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
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>Categoría activa</Text>
                    <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 18 }}>
                      Si está activa, puede mostrarse como parte visible de la navegación pública.
                    </Text>
                  </View>
                  <Switch value={isActive} onValueChange={setIsActive} />
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
                    backgroundColor: "#F6FAFD",
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
                    {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear categoría"}
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
              Borrar categoría
            </Text>

            <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
              Vas a borrar{" "}
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                {confirmDelete?.name ?? ""}
              </Text>
              .{"\n\n"}
              Si hay productos vinculados a esta categoría, se quedarán sin categoría asignada.
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
                onPress={removeCategoryConfirmed}
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