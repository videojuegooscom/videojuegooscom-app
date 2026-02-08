import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
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
  danger: "#FF3B30",
  ok: "#22C55E",
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
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 60);
}

export default function AdminCategories() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<CategoryRow[]>([]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);

  const isEdit = !!editing;

  const title = useMemo(() => (isEdit ? "Editar categoría" : "Nueva categoría"), [isEdit]);

  async function load() {
    setLoading(true);
    setErr(null);

    const { data, error } = await supabase
      .from("categories")
      .select("id,name,slug,sort_order,is_active,image_url,created_at,updated_at")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      setErr(error.message);
      setItems([]);
    } else {
      setItems((data ?? []) as CategoryRow[]);
    }
    setLoading(false);
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
    setErr(null);
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
    setErr(null);
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    setErr(null);

    const cleanName = name.trim();
    const cleanSlug = slugify(slug || cleanName);
    const so = Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0;

    if (!cleanName) {
      setErr("Pon un nombre de categoría.");
      setSaving(false);
      return;
    }
    if (!cleanSlug) {
      setErr("Slug inválido.");
      setSaving(false);
      return;
    }

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

      if (error) {
        setErr(error.message);
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("categories").insert({
        name: cleanName,
        slug: cleanSlug,
        sort_order: so,
        is_active: isActive,
      });

      if (error) {
        setErr(error.message);
        setSaving(false);
        return;
      }
    }

    setOpen(false);
    resetForm();
    await load();
    setSaving(false);
  }

  async function toggleActive(c: CategoryRow) {
    const { error } = await supabase
      .from("categories")
      .update({ is_active: !c.is_active })
      .eq("id", c.id);

    if (!error) load();
  }

  async function removeCategory(c: CategoryRow) {
    // Ojo: si tienes productos con FK, al borrar hará SET NULL en products.category_id (por tu SQL).
    const { error } = await supabase.from("categories").delete().eq("id", c.id);
    if (error) setErr(error.message);
    else load();
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
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
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "900" }}>Categorías</Text>
            <Text style={{ color: COLORS.muted, marginTop: 4 }}>
              Crear, ordenar y activar/desactivar.
            </Text>
          </View>

          <Pressable
            onPress={() => router.back()}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: "rgba(255,255,255,0.05)",
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "800" }}>← Volver</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={openCreate}
          style={{
            borderRadius: 14,
            paddingVertical: 12,
            alignItems: "center",
            backgroundColor: COLORS.accent,
          }}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>+ Nueva categoría</Text>
        </Pressable>

        {err ? <Text style={{ color: "#FCA5A5" }}>{err}</Text> : null}
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
              <Text style={{ color: COLORS.muted }}>Crea la primera y empieza a meter productos.</Text>
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
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>{c.name}</Text>
                    <Text style={{ color: COLORS.muted, marginTop: 6 }}>
                      slug: <Text style={{ color: COLORS.text, fontWeight: "800" }}>{c.slug}</Text>{" "}
                      · orden:{" "}
                      <Text style={{ color: COLORS.text, fontWeight: "800" }}>{c.sort_order}</Text>
                    </Text>
                  </View>

                  <View style={{ alignItems: "flex-end", gap: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Text style={{ color: COLORS.muted, fontWeight: "800" }}>
                        {c.is_active ? "Activa" : "Oculta"}
                      </Text>
                      <Switch value={c.is_active} onValueChange={() => toggleActive(c)} />
                    </View>

                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <Pressable
                        onPress={() => openEdit(c)}
                        style={{
                          borderRadius: 999,
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderWidth: 1,
                          borderColor: "rgba(0,170,228,0.35)",
                          backgroundColor: "rgba(0,170,228,0.14)",
                        }}
                      >
                        <Text style={{ color: COLORS.text, fontWeight: "900" }}>Editar</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => removeCategory(c)}
                        style={{
                          borderRadius: 999,
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderWidth: 1,
                          borderColor: "rgba(255,59,48,0.40)",
                          backgroundColor: "rgba(255,59,48,0.14)",
                        }}
                      >
                        <Text style={{ color: COLORS.text, fontWeight: "900" }}>Borrar</Text>
                      </Pressable>
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
            <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "900" }}>{title}</Text>

            <TextInput
              value={name}
              onChangeText={(v) => {
                setName(v);
                if (!isEdit) setSlug(slugify(v));
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
              onChangeText={setSlug}
              placeholder="Slug (auto) (ej: playstation-5)"
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
              onChangeText={setSortOrder}
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

            {err ? <Text style={{ color: "#FCA5A5" }}>{err}</Text> : null}

            <View style={{ flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
              <Pressable
                onPress={() => {
                  setOpen(false);
                  resetForm();
                }}
                style={{
                  borderRadius: 999,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: "rgba(255,255,255,0.06)",
                }}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Cancelar</Text>
              </Pressable>

              <Pressable
                onPress={save}
                disabled={saving}
                style={{
                  borderRadius: 999,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  backgroundColor: COLORS.accent,
                  opacity: saving ? 0.6 : 1,
                }}
              >
                <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
                  {saving ? "Guardando..." : "Guardar"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
