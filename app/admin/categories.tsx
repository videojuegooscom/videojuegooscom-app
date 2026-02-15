// app/admin/categories.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
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
  border: "rgba(255,255,255,0.12)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.75)",
  accent: "#00AAE4",
  accent2: "rgba(0,170,228,0.16)",
  accentBorder: "rgba(0,170,228,0.45)",
  danger: "#FF3B30",
};

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  image_url: string | null;
  created_at: string;
  updated_at: string;
};

function slugify(input: string) {
  return (input ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 60);
}

function toIntSafe(v: string, fallback = 0) {
  const n = Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

/**
 * Back inteligente:
 * - Si hay stack: back()
 * - Si entraste por URL directa/refresh: vuelve al admin home
 */
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

function ChipButton({
  label,
  onPress,
  variant,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "danger" | "ghost";
}) {
  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";

  const borderColor = isPrimary
    ? COLORS.accentBorder
    : isDanger
      ? "rgba(255,59,48,0.40)"
      : COLORS.border;

  const backgroundColor = isPrimary
    ? COLORS.accent2
    : isDanger
      ? "rgba(255,59,48,0.14)"
      : "rgba(255,255,255,0.06)";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 999,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor,
        backgroundColor,
        opacity: pressed ? 0.88 : 1,
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

  // Modal state
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

  const modalTitle = useMemo(
    () => (isEdit ? "Editar categoría" : "Nueva categoría"),
    [isEdit]
  );

  async function load() {
    setLoading(true);
    setScreenErr(null);

    try {
      const { data, error } = await supabase
        .from("categories")
        .select("id,name,slug,sort_order,is_active,image_url,created_at,updated_at")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;

      const rows = (data ?? []) as CategoryRow[];
      setItems(rows);
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

    if (!cleanName) {
      setModalErr("Pon un nombre de categoría.");
      setSaving(false);
      return;
    }
    if (!cleanSlug) {
      setModalErr("Slug inválido.");
      setSaving(false);
      return;
    }

    try {
      if (editing) {
        const { error } = await supabase
          .from("categories")
          .update({
            name: cleanName,
            slug: cleanSlug,
            sort_order: so,
            is_active: isActive,
          })
          .eq("id", editing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("categories").insert({
          name: cleanName,
          slug: cleanSlug,
          sort_order: so,
          is_active: isActive,
        });

        if (error) throw error;
      }

      setOpen(false);
      resetForm();
      await load();
    } catch (e: any) {
      setModalErr(e?.message ?? "Error guardando categoría.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: CategoryRow) {
    // Optimista: actualizamos UI y si falla, rollback.
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
      // Ojo: si tienes productos con FK, por tu SQL debería hacer SET NULL en products.category_id
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

      {/* Header */}
      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.06)",
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "900" }}>Categorías</Text>
            <Text style={{ color: COLORS.muted, marginTop: 4 }}>
              Crea, ordena y activa/desactiva. (El orden manda en el catálogo.)
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

        <Pressable
          onPress={openCreate}
          style={({ pressed }) => ({
            opacity: pressed ? 0.9 : 1,
            borderRadius: 14,
            paddingVertical: 12,
            alignItems: "center",
            backgroundColor: COLORS.accent,
          })}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>+ Nueva categoría</Text>
        </Pressable>

        {!!screenErr && <Text style={{ color: "#FCA5A5" }}>{screenErr}</Text>}
      </View>

      {/* Body */}
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30, gap: 12 }}>
          {items.length === 0 ? (
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
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>No hay categorías todavía.</Text>
              <Text style={{ color: COLORS.muted }}>
                Crea la primera. Luego ya metemos productos y a vender.
              </Text>
            </View>
          ) : (
            items.map((c) => (
              <View
                key={c.id}
                style={{
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.card,
                  padding: 14,
                  gap: 10,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
                      {c.name}
                    </Text>

                    <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 18 }}>
                      slug: <Text style={{ color: COLORS.text, fontWeight: "800" }}>{c.slug}</Text>
                      {"  "}· orden:{" "}
                      <Text style={{ color: COLORS.text, fontWeight: "800" }}>{c.sort_order}</Text>
                    </Text>
                  </View>

                  <View style={{ alignItems: "flex-end", gap: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Text style={{ color: COLORS.muted, fontWeight: "800" }}>
                        {c.is_active ? "Activa" : "Oculta"}
                      </Text>
                      <Switch value={c.is_active} onValueChange={() => toggleActive(c)} />
                    </View>

                    <View style={{ flexDirection: "row", gap: 10 }}>
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

      {/* Modal Crear/Editar */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
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
              borderColor: COLORS.border,
              backgroundColor: COLORS.bg2,
              padding: 16,
              gap: 10,
            }}
          >
            <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "900" }}>
              {modalTitle}
            </Text>

            <TextInput
              value={name}
              onChangeText={(v) => {
                setName(v);
                // Solo autogeneramos slug en "crear".
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
              }}
            />

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>Activa</Text>
              <Switch value={isActive} onValueChange={setIsActive} />
            </View>

            {!!modalErr && <Text style={{ color: "#FCA5A5" }}>{modalErr}</Text>}

            <View style={{ flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
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
                  {saving ? "Guardando..." : "Guardar"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirm delete */}
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
              borderColor: "rgba(255,59,48,0.35)",
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
              Si hay productos con esa categoría, por tu configuración deberían quedar sin categoría (category_id = null).
            </Text>

            <View style={{ flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
              <ChipButton label="Cancelar" variant="ghost" onPress={() => setConfirmDelete(null)} />
              <ChipButton label="Sí, borrar" variant="danger" onPress={removeCategoryConfirmed} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
