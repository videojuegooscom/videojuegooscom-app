// app/admin/products.tsx
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
  description: string | null;
  price_eur: number | null;
  status: ProductStatus;
  condition: ProductCondition;
  category_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;

  // Opcional: si existe en tu DB lo usamos; si no, no rompe.
  image_url?: string | null;
};

function fmtEUR(n: number) {
  const safe = Number.isFinite(n) ? n : 0;
  return `${Math.round(safe)}€`;
}

function toIntSafe(v: string, fallback = 0) {
  const s = String(v ?? "").trim();
  if (!s) return fallback;

  // tolera "1.200", "1,200", "1200"
  const cleaned = s.replace(/[^\d.,-]/g, "");
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  let normalized = cleaned;
  if (hasComma && hasDot) {
    // decimal = último separador
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    const dec = lastComma > lastDot ? "," : ".";
    const thou = dec === "," ? "." : ",";
    normalized = cleaned.split(thou).join("").replace(dec, ".");
  } else if (hasComma && !hasDot) {
    // si hay una coma, asumimos decimal si hay 1-2 dígitos al final
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
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "success" | "danger" | "ghost";
  disabled?: boolean;
}) {
  const isPrimary = variant === "primary";
  const isSuccess = variant === "success";
  const isDanger = variant === "danger";

  const borderColor = isPrimary
    ? COLORS.accentBorder
    : isSuccess
      ? "rgba(34,197,94,0.40)"
      : isDanger
        ? "rgba(255,59,48,0.40)"
        : COLORS.border;

  const backgroundColor = isPrimary
    ? COLORS.accent2
    : isSuccess
      ? "rgba(34,197,94,0.14)"
      : isDanger
        ? "rgba(255,59,48,0.14)"
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

export default function AdminProducts() {
  const [loading, setLoading] = useState(true);
  const [screenErr, setScreenErr] = useState<string | null>(null);

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [items, setItems] = useState<ProductRow[]>([]);

  const itemsRef = useRef<ProductRow[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Modal state
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<ProductRow | null>(null);

  const [editing, setEditing] = useState<ProductRow | null>(null);
  const isEdit = !!editing;

  // Form
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("0");
  const [status, setStatus] = useState<ProductStatus>("DRAFT");
  const [condition, setCondition] = useState<ProductCondition>("GOOD");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [imageUrl, setImageUrl] = useState(""); // opcional

  const categoryName = useMemo(() => {
    if (!categoryId) return "Sin categoría";
    return categories.find((c) => c.id === categoryId)?.name ?? "Sin categoría";
  }, [categoryId, categories]);

  const activeCategories = useMemo(
    () => categories.filter((c) => !!c.is_active),
    [categories]
  );

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
        // pedimos image_url opcional: si no existe como columna, te lo dirá Supabase con error;
        // en ese caso, quita ",image_url" de este select.
        supabase
          .from("products")
          .select("id,title,description,price_eur,status,condition,category_id,is_active,created_at,updated_at,image_url")
          .order("updated_at", { ascending: false }),
      ]);

      if (catsRes.error) throw catsRes.error;
      if (prodRes.error) throw prodRes.error;

      setCategories((catsRes.data ?? []) as CategoryRow[]);
      setItems((prodRes.data ?? []) as ProductRow[]);
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
    setPrice("0");
    setStatus("DRAFT");
    setCondition("GOOD");
    setCategoryId(null);
    setIsActive(true);
    setImageUrl("");
    setModalErr(null);
  }

  function openCreate() {
    resetForm();
    setOpen(true);
  }

  function openEditProduct(p: ProductRow) {
    setEditing(p);
    setTitle(p.title ?? "");
    setDesc(p.description ?? "");
    setPrice(String(p.price_eur ?? 0));
    setStatus(p.status ?? "DRAFT");
    setCondition(p.condition ?? "GOOD");
    setCategoryId(p.category_id ?? null);
    setIsActive(!!p.is_active);
    setImageUrl((p as any).image_url ?? "");
    setModalErr(null);
    setOpen(true);
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
    if (priceEur < 0) {
      setModalErr("Precio inválido.");
      setSaving(false);
      return;
    }

    const payload: any = {
      title: cleanTitle,
      description: cleanDesc,
      price_eur: priceEur,
      status,
      condition,
      category_id: categoryId,
      is_active: isActive,
    };

    // Solo enviamos image_url si hay algo (para no pisar con null si tu DB no lo usa).
    const cleanImg = String(imageUrl ?? "").trim();
    if (cleanImg) payload.image_url = cleanImg;

    try {
      if (editing) {
        const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
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
      const { error } = await supabase.from("products").delete().eq("id", p.id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      setScreenErr(e?.message ?? "Error borrando producto.");
    }
  }

  async function quickPublish(p: ProductRow) {
    // optimista + rollback
    const prev = itemsRef.current;
    const next = prev.map((x) => (x.id === p.id ? { ...x, status: "PUBLISHED" as ProductStatus } : x));
    setItems(next);

    const { error } = await supabase.from("products").update({ status: "PUBLISHED" }).eq("id", p.id);
    if (error) {
      setItems(prev);
      setScreenErr(error.message);
    }
  }

  async function toggleActive(p: ProductRow) {
    // optimista + rollback
    const prev = itemsRef.current;
    const next = prev.map((x) => (x.id === p.id ? { ...x, is_active: !x.is_active } : x));
    setItems(next);

    const { error } = await supabase.from("products").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) {
      setItems(prev);
      setScreenErr(error.message);
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
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "900" }}>Productos</Text>
            <Text style={{ color: COLORS.muted, marginTop: 4 }}>Crear, editar, publicar y controlar visibilidad.</Text>
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
          <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>+ Nuevo producto</Text>
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
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>No hay productos todavía.</Text>
              <Text style={{ color: COLORS.muted }}>Crea el primero y publícalo cuando esté listo.</Text>
            </View>
          ) : (
            items.map((p) => {
              const catName = p.category_id
                ? categories.find((c) => c.id === p.category_id)?.name ?? "Categoría"
                : "Sin categoría";

              return (
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
                      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
                        {p.title}
                      </Text>

                      <Text style={{ color: COLORS.muted, marginTop: 6, lineHeight: 18 }}>
                        {labelStatus(p.status)} · {labelCond(p.condition)} · {catName}
                      </Text>

                      <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 8, fontSize: 12 }}>
                        Activo: {p.is_active ? "Sí" : "No"} · Actualizado:{" "}
                        {p.updated_at ? new Date(p.updated_at).toLocaleString() : "-"}
                      </Text>
                    </View>

                    <View style={{ alignItems: "flex-end", gap: 10 }}>
                      <Text style={{ color: COLORS.gold, fontWeight: "900", fontSize: 16 }}>
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

                  <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                    <ChipButton label="Editar" variant="primary" onPress={() => openEditProduct(p)} />

                    {p.status !== "PUBLISHED" ? (
                      <ChipButton label="Publicar" variant="success" onPress={() => quickPublish(p)} />
                    ) : null}

                    <ChipButton label="Borrar" variant="danger" onPress={() => askRemove(p)} />
                  </View>
                </View>
              );
            })
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
              }}
            />

            <TextInput
              value={desc}
              onChangeText={(v) => {
                setDesc(v);
                setModalErr(null);
              }}
              placeholder="Descripción (opcional)"
              placeholderTextColor="rgba(255,255,255,0.45)"
              multiline
              style={{
                borderWidth: 1,
                borderColor: COLORS.border,
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: COLORS.text,
                minHeight: 90,
                textAlignVertical: "top",
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
              }}
            />

            {/* image_url opcional */}
            <TextInput
              value={imageUrl}
              onChangeText={(v) => {
                setImageUrl(v);
                setModalErr(null);
              }}
              placeholder="Imagen URL (opcional) (ej: https://...)"
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

            {/* Estado */}
            <Text style={{ color: COLORS.muted, fontWeight: "800", marginTop: 4 }}>Estado</Text>
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
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>{labelStatus(s)}</Text>
                </Pressable>
              ))}
            </View>

            {/* Condición */}
            <Text style={{ color: COLORS.muted, fontWeight: "800", marginTop: 4 }}>Condición</Text>
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
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>{labelCond(c)}</Text>
                </Pressable>
              ))}
            </View>

            {/* Categoría inline */}
            <Text style={{ color: COLORS.muted, fontWeight: "800", marginTop: 4 }}>
              Categoría (actual:{" "}
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>{categoryName}</Text>)
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
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Sin categoría</Text>
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
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>{c.name}</Text>
                </Pressable>
              ))}
            </View>

            {/* Activo */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>Activo</Text>
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
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", padding: 16, justifyContent: "center" }}>
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
            <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "900" }}>Borrar producto</Text>
            <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
              Vas a borrar{" "}
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                {confirmDelete?.title ?? ""}
              </Text>
              . Esta acción no se puede deshacer.
            </Text>

            <View style={{ flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
              <ChipButton label="Cancelar" variant="ghost" onPress={() => setConfirmDelete(null)} />
              <ChipButton label="Sí, borrar" variant="danger" onPress={removeProductConfirmed} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
