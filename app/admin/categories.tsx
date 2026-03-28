// app/admin/categories.tsx
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
} from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";

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

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18 }}>{title}</Text>
      {!!subtitle && (
        <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 19 }}>{subtitle}</Text>
      )}
    </View>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 140,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.cardSoft,
        padding: 14,
      }}
    >
      <Text style={{ color: COLORS.muted2, fontWeight: "700", fontSize: 12 }}>
        {icon ? `${icon} ` : ""}
        {label}
      </Text>
      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 20, marginTop: 6 }}>
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
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "danger" | "ghost";
  disabled?: boolean;
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
      : "rgba(255,255,255,0.06)";

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
      })}
    >
      <Text style={{ color: COLORS.text, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

export default function AdminCategories() {
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
      setScreenErr(e?.message ?? "Error cargando categorías.");
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
      setModalErr("Pon un nombre de categoría.");
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
      const msg = String(e?.message ?? "Error guardando categoría.");

      if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
        setModalErr("Ya existe una categoría con ese nombre o slug.");
      } else {
        setModalErr(msg);
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
      setScreenErr(e?.message ?? "Error borrando categoría.");
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
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 12,
          gap: 12,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "900" }}>
              Categorías
            </Text>
            <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 20 }}>
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
              backgroundColor: "rgba(255,255,255,0.05)",
            })}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>← Volver</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <StatCard label="Total" value={String(stats.total)} icon="🗂️" />
          <StatCard label="Activas" value={String(stats.active)} icon="✅" />
          <StatCard label="Ocultas" value={String(stats.hidden)} icon="🙈" />
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
            placeholder="Buscar por nombre o slug"
            placeholderTextColor="rgba(255,255,255,0.45)"
            style={{
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 12,
              color: COLORS.text,
              backgroundColor: "rgba(255,255,255,0.03)",
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
              borderWidth: 1,
              borderColor: COLORS.dangerBorder,
              backgroundColor: COLORS.dangerBg,
              padding: 10,
            }}
          >
            <Text style={{ color: COLORS.danger, fontWeight: "800" }}>{screenErr}</Text>
          </View>
        )}

        {!supportsImageUrl && (
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
              La columna <Text style={{ fontWeight: "900" }}>image_url</Text> no existe en tu
              tabla <Text style={{ fontWeight: "900" }}>categories</Text>. El panel sigue
              funcionando, pero la imagen por URL queda desactivada.
            </Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator color={COLORS.text} />
          <Text style={{ color: COLORS.muted }}>Cargando categorías…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30, gap: 12 }}>
          {filteredItems.length === 0 ? (
            <View
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.card,
                padding: 16,
                gap: 8,
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
                No hay categorías para este filtro.
              </Text>
              <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                Crea una base limpia primero. Luego ya metes producto encima y dejas de vender en una nave vacía.
              </Text>
            </View>
          ) : (
            filteredItems.map((c) => (
              <View
                key={c.id}
                style={{
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.card,
                  padding: 14,
                  gap: 12,
                  ...softShadow(),
                }}
              >
                <View style={{ flexDirection: "row", gap: 14, alignItems: "flex-start" }}>
                  <View
                    style={{
                      width: 92,
                      height: 92,
                      borderRadius: 16,
                      overflow: "hidden",
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      backgroundColor: "rgba(255,255,255,0.04)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {c.image_url ? (
                      <Image
                        source={{ uri: c.image_url }}
                        resizeMode="cover"
                        style={{ width: "100%", height: "100%" }}
                      />
                    ) : (
                      <Text style={{ fontSize: 28 }}>🗂️</Text>
                    )}
                  </View>

                  <View style={{ flex: 1, gap: 8 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 12,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            color: COLORS.text,
                            fontWeight: "900",
                            fontSize: 17,
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
                              backgroundColor: "rgba(255,255,255,0.06)",
                            }}
                          >
                            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                              slug: {c.slug}
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
                              orden: {c.sort_order}
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
                              {c.is_active ? "Activa" : "Oculta"}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View style={{ alignItems: "flex-end", gap: 10 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <Text style={{ color: COLORS.muted, fontWeight: "800" }}>
                            {c.is_active ? "Visible" : "Oculta"}
                          </Text>
                          <Switch value={c.is_active} onValueChange={() => toggleActive(c)} />
                        </View>
                      </View>
                    </View>

                    <Text style={{ color: COLORS.muted2, fontSize: 12 }}>
                      Creada: {c.created_at ? new Date(c.created_at).toLocaleString() : "-"} ·
                      Actualizada: {c.updated_at ? new Date(c.updated_at).toLocaleString() : "-"}
                    </Text>

                    <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                      <ChipButton label="Editar" variant="primary" onPress={() => openEdit(c)} />
                      <ChipButton label="Borrar" variant="danger" onPress={() => askRemove(c)} />
                    </View>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.60)",
            padding: 16,
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
                padding: 16,
                gap: 12,
                ...softShadow(),
              }}
            >
              <Text style={{ color: COLORS.text, fontSize: 20, fontWeight: "900" }}>
                {modalTitle}
              </Text>

              <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                Aquí defines el esqueleto comercial de la tienda. Si ordenas mal las categorías, el escaparate se resiente.
              </Text>

              <TextInput
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  if (!isEdit) setSlug(slugify(v));
                  setModalErr(null);
                }}
                placeholder="Nombre (ej: PlayStation 5)"
                placeholderTextColor="rgba(255,255,255,0.45)"
                style={{
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  color: COLORS.text,
                  backgroundColor: "rgba(255,255,255,0.03)",
                }}
              />

              <TextInput
                value={slug}
                onChangeText={(v) => {
                  setSlug(v);
                  setModalErr(null);
                }}
                placeholder="Slug (ej: playstation-5)"
                placeholderTextColor="rgba(255,255,255,0.45)"
                autoCapitalize="none"
                style={{
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  color: COLORS.text,
                  backgroundColor: "rgba(255,255,255,0.03)",
                }}
              />

              <TextInput
                value={sortOrder}
                onChangeText={(v) => {
                  setSortOrder(v);
                  setModalErr(null);
                }}
                placeholder="Orden (0, 10, 20...)"
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
                    placeholderTextColor="rgba(255,255,255,0.45)"
                    autoCapitalize="none"
                    style={{
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      borderRadius: 14,
                      paddingHorizontal: 12,
                      paddingVertical: 12,
                      color: COLORS.text,
                      backgroundColor: "rgba(255,255,255,0.03)",
                    }}
                  />

                  {isValidHttpUrl(imageUrl) ? (
                    <View
                      style={{
                        width: "100%",
                        height: 160,
                        borderRadius: 16,
                        overflow: "hidden",
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        backgroundColor: "rgba(255,255,255,0.04)",
                      }}
                    >
                      <Image
                        source={{ uri: imageUrl.trim() }}
                        resizeMode="cover"
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
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 12 }}>
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
                  <Text style={{ color: COLORS.danger, fontWeight: "800" }}>{modalErr}</Text>
                </View>
              )}

              <View
                style={{
                  flexDirection: "row",
                  gap: 10,
                  justifyContent: "flex-end",
                  marginTop: 4,
                  flexWrap: "wrap",
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
                  })}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>Cancelar</Text>
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
                  })}
                >
                  <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
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
            padding: 16,
            justifyContent: "center",
          }}
        >
          <View
            style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: COLORS.dangerBorder,
              backgroundColor: COLORS.bg2,
              padding: 16,
              gap: 10,
            }}
          >
            <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "900" }}>
              Borrar categoría
            </Text>

            <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
              Vas a borrar{" "}
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                {confirmDelete?.name ?? ""}
              </Text>
              .{"\n\n"}
              Si hay productos ligados a esta categoría, por tu configuración deberían quedarse sin
              categoría (
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>category_id = null</Text>).
            </Text>

            <View
              style={{
                flexDirection: "row",
                gap: 10,
                justifyContent: "flex-end",
                marginTop: 6,
              }}
            >
              <ChipButton label="Cancelar" variant="ghost" onPress={() => setConfirmDelete(null)} />
              <ChipButton label="Sí, borrar" variant="danger" onPress={removeCategoryConfirmed} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}