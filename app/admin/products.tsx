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
  gold: "#D8B04A",
  danger: "#FF3B30",
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

type ProductRow = {
  id: string;
  title: string;
  description: string;
  price_eur: number;
  status: ProductStatus;
  condition: ProductCondition;
  category_id: string | null;
  images: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function fmtEUR(n: number) {
  return `${Math.round(n)}€`;
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

export default function AdminProducts() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [items, setItems] = useState<ProductRow[]>([]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("0");
  const [status, setStatus] = useState<ProductStatus>("DRAFT");
  const [condition, setCondition] = useState<ProductCondition>("GOOD");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);

  const isEdit = !!editing;

  const categoryName = useMemo(() => {
    if (!categoryId) return "Sin categoría";
    return categories.find((c) => c.id === categoryId)?.name ?? "Sin categoría";
  }, [categoryId, categories]);

  async function load() {
    setLoading(true);
    setErr(null);

    const [catsRes, prodRes] = await Promise.all([
      supabase
        .from("categories")
        .select("id,name,slug,sort_order,is_active")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("products")
        .select("id,title,description,price_eur,status,condition,category_id,images,is_active,created_at,updated_at")
        .order("updated_at", { ascending: false }),
    ]);

    if (catsRes.error) setErr(catsRes.error.message);
    setCategories((catsRes.data ?? []) as CategoryRow[]);

    if (prodRes.error) setErr(prodRes.error.message);
    setItems((prodRes.data ?? []) as ProductRow[]);

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function resetForm() {
    setEditing(null);
    setTitle("");
    setDesc("");
    setPrice("0");
    setStatus("DRAFT");
    setCondition("GOOD");
    setCategoryId(null);
    setIsActive(true);
    setErr(null);
  }

  function openCreate() {
    resetForm();
    setOpen(true);
  }

  function openEdit(p: ProductRow) {
    setEditing(p);
    setTitle(p.title ?? "");
    setDesc(p.description ?? "");
    setPrice(String(p.price_eur ?? 0));
    setStatus(p.status ?? "DRAFT");
    setCondition(p.condition ?? "GOOD");
    setCategoryId(p.category_id ?? null);
    setIsActive(!!p.is_active);
    setErr(null);
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    setErr(null);

    const cleanTitle = title.trim();
    const cleanDesc = desc.trim();
    const priceEur = Number.isFinite(Number(price)) ? Math.round(Number(price)) : 0;

    if (!cleanTitle) {
      setErr("Pon un título.");
      setSaving(false);
      return;
    }
    if (priceEur < 0) {
      setErr("Precio inválido.");
      setSaving(false);
      return;
    }

    const payload = {
      title: cleanTitle,
      description: cleanDesc,
      price_eur: priceEur,
      status,
      condition,
      category_id: categoryId,
      is_active: isActive,
    };

    if (editing) {
      const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
      if (error) {
        setErr(error.message);
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("products").insert(payload);
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

  async function removeProduct(p: ProductRow) {
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) setErr(error.message);
    else load();
  }

  async function quickPublish(p: ProductRow) {
    const { error } = await supabase
      .from("products")
      .update({ status: "PUBLISHED" })
      .eq("id", p.id);

    if (error) setErr(error.message);
    else load();
  }

  async function toggleActive(p: ProductRow) {
    const { error } = await supabase
      .from("products")
      .update({ is_active: !p.is_active })
      .eq("id", p.id);

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
            <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "900" }}>Productos</Text>
            <Text style={{ color: COLORS.muted, marginTop: 4 }}>
              Crear, editar, publicar y controlar estado.
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
          <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>+ Nuevo producto</Text>
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
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>No hay productos todavía.</Text>
              <Text style={{ color: COLORS.muted }}>Crea el primero y publícalo cuando esté listo.</Text>
            </View>
          ) : (
            items.map((p) => (
              <View
                key={p.id}
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
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>{p.title}</Text>

                    <Text style={{ color: COLORS.muted, marginTop: 6 }}>
                      {labelStatus(p.status)} · {labelCond(p.condition)} ·{" "}
                      {p.category_id
                        ? categories.find((c) => c.id === p.category_id)?.name ?? "Categoría"
                        : "Sin categoría"}
                    </Text>

                    <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 8, fontSize: 12 }}>
                      Activo: {p.is_active ? "Sí" : "No"}
                    </Text>
                  </View>

                  <View style={{ alignItems: "flex-end", gap: 8 }}>
                    <Text style={{ color: COLORS.gold, fontWeight: "900", fontSize: 16 }}>
                      {fmtEUR(p.price_eur)}
                    </Text>

                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Text style={{ color: COLORS.muted, fontWeight: "800" }}>
                        {p.is_active ? "Visible" : "Oculto"}
                      </Text>
                      <Switch value={p.is_active} onValueChange={() => toggleActive(p)} />
                    </View>
                  </View>
                </View>

                <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                  <Pressable
                    onPress={() => openEdit(p)}
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

                  {p.status !== "PUBLISHED" ? (
                    <Pressable
                      onPress={() => quickPublish(p)}
                      style={{
                        borderRadius: 999,
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderWidth: 1,
                        borderColor: "rgba(34,197,94,0.40)",
                        backgroundColor: "rgba(34,197,94,0.14)",
                      }}
                    >
                      <Text style={{ color: COLORS.text, fontWeight: "900" }}>Publicar</Text>
                    </Pressable>
                  ) : null}

                  <Pressable
                    onPress={() => removeProduct(p)}
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
            ))
          )}
        </ScrollView>
      )}

      {/* Modal Crear/Editar */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", padding: 16, justifyContent: "center" }}>
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
              {isEdit ? "Editar producto" : "Nuevo producto"}
            </Text>

            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Título (ej: PS5 Slim 1TB)"
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
              value={desc}
              onChangeText={setDesc}
              placeholder="Descripción (opcional por ahora)"
              placeholderTextColor="rgba(255,255,255,0.45)"
              multiline
              style={{
                borderWidth: 1,
                borderColor: COLORS.border,
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: COLORS.text,
                minHeight: 80,
                textAlignVertical: "top",
              }}
            />

            <TextInput
              value={price}
              onChangeText={setPrice}
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
              }}
            />

            {/* Selector simple: estado */}
            <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              {(["DRAFT", "REVIEW", "PUBLISHED"] as ProductStatus[]).map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setStatus(s)}
                  style={{
                    borderRadius: 999,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderWidth: 1,
                    borderColor: status === s ? "rgba(0,170,228,0.45)" : "rgba(255,255,255,0.14)",
                    backgroundColor: status === s ? "rgba(0,170,228,0.16)" : "rgba(255,255,255,0.06)",
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>{labelStatus(s)}</Text>
                </Pressable>
              ))}
            </View>

            {/* Selector simple: condición */}
            <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              {(["NEW", "LIKE_NEW", "GOOD", "FAIR", "PARTS"] as ProductCondition[]).map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCondition(c)}
                  style={{
                    borderRadius: 999,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderWidth: 1,
                    borderColor: condition === c ? "rgba(0,170,228,0.45)" : "rgba(255,255,255,0.14)",
                    backgroundColor: condition === c ? "rgba(0,170,228,0.16)" : "rgba(255,255,255,0.06)",
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>{labelCond(c)}</Text>
                </Pressable>
              ))}
            </View>

            {/* Categoría: selector “modal” simplificado */}
            <Pressable
              onPress={() => router.push("../categories")}
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: "rgba(255,255,255,0.06)",
                paddingVertical: 12,
                paddingHorizontal: 12,
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                Categoría: <Text style={{ color: COLORS.accent }}>{categoryName}</Text>
              </Text>
              <Text style={{ color: COLORS.muted, marginTop: 6 }}>
                (De momento, gestiona categorías en su pantalla. En el siguiente paso te pongo selector inline.)
              </Text>
            </Pressable>

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>Activo</Text>
              <Switch value={isActive} onValueChange={setIsActive} />
            </View>

            {err ? <Text style={{ color: "#FCA5A5" }}>{err}</Text> : null}

            <View style={{ flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
              <Pressable
                onPress={() => {
                  setOpen(false);
                  setEditing(null);
                  setTitle("");
                  setDesc("");
                  setPrice("0");
                  setStatus("DRAFT");
                  setCondition("GOOD");
                  setCategoryId(null);
                  setIsActive(true);
                  setErr(null);
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

            {/* Nota: en el siguiente paso te pongo selector real de categoría en esta misma pantalla
                (sin navegar a categories). Lo dejo así para que hoy ya funcione todo sin dependencias raras. */}
          </View>
        </View>
      </Modal>
    </View>
  );
}
