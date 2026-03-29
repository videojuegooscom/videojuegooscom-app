// app/admin/products.tsx
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
  useWindowDimensions,
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
  gold: "#D8B04A",
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
  image_url?: string | null;
  is_featured_home?: boolean;
};

type StatusFilter = "ALL" | ProductStatus;
type VisibilityFilter = "ALL" | "VISIBLE" | "HIDDEN";

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

function fmtEUR(n: number) {
  const safe = Number.isFinite(n) ? n : 0;
  return `${Math.round(safe)}€`;
}

function clampText(s: string, max = 180) {
  const t = String(s ?? "").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function toIntSafe(v: string, fallback = 0) {
  const s = String(v ?? "").trim();
  if (!s) return fallback;

  const cleaned = s.replace(/[^\d.,-]/g, "");
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  let normalized = cleaned;
  if (hasComma && hasDot) {
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    const dec = lastComma > lastDot ? "," : ".";
    const thou = dec === "," ? "." : ",";
    normalized = cleaned.split(thou).join("").replace(dec, ".");
  } else if (hasComma && !hasDot) {
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

function isValidHttpUrl(value: string) {
  const url = String(value ?? "").trim();
  if (!url) return false;
  return /^https?:\/\/\S+$/i.test(url);
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

function statusVisual(status: ProductStatus) {
  if (status === "PUBLISHED") {
    return {
      text: "Publicado",
      borderColor: COLORS.successBorder,
      backgroundColor: COLORS.successBg,
    };
  }
  if (status === "REVIEW") {
    return {
      text: "Por revisar",
      borderColor: COLORS.warningBorder,
      backgroundColor: COLORS.warningBg,
    };
  }
  return {
    text: "Borrador",
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.06)",
  };
}

function SectionTitle({
  title,
  subtitle,
  isMobile,
}: {
  title: string;
  subtitle?: string;
  isMobile?: boolean;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text
        style={{
          color: COLORS.text,
          fontWeight: "900",
          fontSize: isMobile ? 17 : 18,
          lineHeight: isMobile ? 22 : 24,
        }}
      >
        {title}
      </Text>
      {!!subtitle && (
        <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 19 }}>
          {subtitle}
        </Text>
      )}
    </View>
  );
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
  icon?: string;
  isMobile?: boolean;
  compact?: boolean;
}) {
  return (
    <View
      style={{
        width: compact ? (isMobile ? "100%" : "48.6%") : "100%",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.cardSoft,
        padding: isMobile ? 12 : 14,
      }}
    >
      <Text style={{ color: COLORS.muted2, fontWeight: "700", fontSize: 12 }}>
        {icon ? `${icon} ` : ""}
        {label}
      </Text>
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
  variant?: "primary" | "success" | "danger" | "ghost";
  disabled?: boolean;
  isMobile?: boolean;
  fullWidth?: boolean;
}) {
  const isPrimary = variant === "primary";
  const isSuccess = variant === "success";
  const isDanger = variant === "danger";

  const borderColor = isPrimary
    ? COLORS.accentBorder
    : isSuccess
      ? COLORS.successBorder
      : isDanger
        ? COLORS.dangerBorder
        : COLORS.border;

  const backgroundColor = isPrimary
    ? COLORS.accent2
    : isSuccess
      ? COLORS.successBg
      : isDanger
        ? COLORS.dangerBg
        : "rgba(255,255,255,0.06)";

  return (
    <Pressable
      disabled={!!disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 999,
        paddingVertical: isMobile ? 10 : 10,
        paddingHorizontal: isMobile ? 12 : 12,
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
  isMobile,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  isMobile?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 999,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: active ? COLORS.accentBorder : "rgba(255,255,255,0.14)",
        backgroundColor: active ? COLORS.accent2 : "rgba(255,255,255,0.06)",
        opacity: pressed ? 0.88 : 1,
      })}
    >
      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: isMobile ? 13 : 14 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function AdminProducts() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const isTablet = widthSafe >= 700 && widthSafe < 1024;
  const isDesktopish = widthSafe >= 1024;
  const pagePadding = isMobile ? 12 : 16;

  const [loading, setLoading] = useState(true);
  const [screenErr, setScreenErr] = useState<string | null>(null);

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [items, setItems] = useState<ProductRow[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("ALL");

  const [supportsImageUrl, setSupportsImageUrl] = useState(true);
  const [supportsFeaturedHome, setSupportsFeaturedHome] = useState(true);

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
  const [imageUrl, setImageUrl] = useState("");
  const [isFeaturedHome, setIsFeaturedHome] = useState(false);

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
        supabase
          .from("products")
          .select(
            "id,title,description,price_eur,status,condition,category_id,is_active,created_at,updated_at,image_url,is_featured_home"
          )
          .order("updated_at", { ascending: false }),
      ]);

      if (catsRes.error) throw catsRes.error;

      if (prodRes.error) {
        const msg = String(prodRes.error.message ?? "");

        const imageColumnMissing =
          msg.includes("image_url") && (msg.includes("column") || msg.includes("does not exist"));
        const featuredColumnMissing =
          msg.includes("is_featured_home") &&
          (msg.includes("column") || msg.includes("does not exist"));

        if (imageColumnMissing || featuredColumnMissing) {
          const fallbackRes = await supabase
            .from("products")
            .select(
              "id,title,description,price_eur,status,condition,category_id,is_active,created_at,updated_at"
            )
            .order("updated_at", { ascending: false });

          if (fallbackRes.error) throw fallbackRes.error;

          setSupportsImageUrl(!imageColumnMissing);
          setSupportsFeaturedHome(!featuredColumnMissing);
          setCategories((catsRes.data ?? []) as CategoryRow[]);
          setItems(
            ((fallbackRes.data ?? []) as ProductRow[]).map((item) => ({
              ...item,
              image_url: null,
              is_featured_home: false,
            }))
          );
          return;
        }

        throw prodRes.error;
      }

      setSupportsImageUrl(true);
      setSupportsFeaturedHome(true);
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
    setPrice("");
    setStatus("DRAFT");
    setCondition("GOOD");
    setCategoryId(null);
    setIsActive(true);
    setImageUrl("");
    setIsFeaturedHome(false);
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
    setImageUrl(p.image_url ?? "");
    setIsFeaturedHome(!!p.is_featured_home);
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
    const cleanImg = String(imageUrl ?? "").trim();

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

    if (cleanImg && !isValidHttpUrl(cleanImg)) {
      setModalErr("La URL de imagen debe empezar por http:// o https://");
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

    if (supportsImageUrl) {
      payload.image_url = cleanImg || null;
    }

    if (supportsFeaturedHome) {
      payload.is_featured_home = !!isFeaturedHome;
    }

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
    const prev = itemsRef.current;
    const next = prev.map((x) =>
      x.id === p.id ? { ...x, status: "PUBLISHED" as ProductStatus } : x
    );
    setItems(next);

    const { error } = await supabase.from("products").update({ status: "PUBLISHED" }).eq("id", p.id);
    if (error) {
      setItems(prev);
      setScreenErr(error.message);
    }
  }

  async function toggleActive(p: ProductRow) {
    const prev = itemsRef.current;
    const next = prev.map((x) => (x.id === p.id ? { ...x, is_active: !x.is_active } : x));
    setItems(next);

    const { error } = await supabase.from("products").update({ is_active: !p.is_active }).eq("id", p.id);
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
      if (nextValue) {
        return { ...x, is_featured_home: x.id === p.id };
      }
      if (x.id === p.id) {
        return { ...x, is_featured_home: false };
      }
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

        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.card,
            padding: isMobile ? 12 : 12,
            gap: 10,
          }}
        >
          <TextInput
            value={search}
            onChangeText={(v) => setSearch(v)}
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
              <FilterPill
                label="Todos"
                active={statusFilter === "ALL"}
                onPress={() => setStatusFilter("ALL")}
                isMobile={isMobile}
              />
              <FilterPill
                label="Borrador"
                active={statusFilter === "DRAFT"}
                onPress={() => setStatusFilter("DRAFT")}
                isMobile={isMobile}
              />
              <FilterPill
                label="Por revisar"
                active={statusFilter === "REVIEW"}
                onPress={() => setStatusFilter("REVIEW")}
                isMobile={isMobile}
              />
              <FilterPill
                label="Publicado"
                active={statusFilter === "PUBLISHED"}
                onPress={() => setStatusFilter("PUBLISHED")}
                isMobile={isMobile}
              />
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: COLORS.muted, fontWeight: "800" }}>Visibilidad</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <FilterPill
                label="Todos"
                active={visibilityFilter === "ALL"}
                onPress={() => setVisibilityFilter("ALL")}
                isMobile={isMobile}
              />
              <FilterPill
                label="Visibles"
                active={visibilityFilter === "VISIBLE"}
                onPress={() => setVisibilityFilter("VISIBLE")}
                isMobile={isMobile}
              />
              <FilterPill
                label="Ocultos"
                active={visibilityFilter === "HIDDEN"}
                onPress={() => setVisibilityFilter("HIDDEN")}
                isMobile={isMobile}
              />
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
              tabla <Text style={{ fontWeight: "900" }}>products</Text>. El panel sigue
              funcionando, pero la imagen por URL queda desactivada.
            </Text>
          </View>
        )}

        {!supportsFeaturedHome && (
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
              La columna <Text style={{ fontWeight: "900" }}>is_featured_home</Text> no existe
              en tu tabla <Text style={{ fontWeight: "900" }}>products</Text>. El destacado de
              home queda desactivado hasta crearla.
            </Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator color={COLORS.text} />
          <Text style={{ color: COLORS.muted }}>Cargando productos…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: pagePadding,
            paddingBottom: 30,
            gap: 12,
          }}
        >
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

              const statusUi = statusVisual(p.status);

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
                        width: isDesktopish ? 92 : "100%",
                        height: isDesktopish ? 92 : isMobile ? 190 : 220,
                        borderRadius: 16,
                        overflow: "hidden",
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        backgroundColor: "rgba(255,255,255,0.04)",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {p.image_url ? (
                        <Image
                          source={{ uri: p.image_url }}
                          resizeMode="cover"
                          style={{ width: "100%", height: "100%" }}
                        />
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

                            {!!p.is_featured_home && (
                              <View
                                style={{
                                  paddingVertical: 6,
                                  paddingHorizontal: 10,
                                  borderRadius: 999,
                                  borderWidth: 1,
                                  borderColor: COLORS.warningBorder,
                                  backgroundColor: COLORS.warningBg,
                                }}
                              >
                                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                                  🔥 Home
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>

                        <View
                          style={{
                            alignItems: isMobile ? "flex-start" : "flex-end",
                            gap: 10,
                          }}
                        >
                          <Text
                            style={{
                              color: COLORS.gold,
                              fontWeight: "900",
                              fontSize: isMobile ? 17 : 18,
                            }}
                          >
                            {fmtEUR(Number(p.price_eur ?? 0))}
                          </Text>

                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
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

                      <Text style={{ color: COLORS.muted2, fontSize: 12, lineHeight: 17 }}>
                        Creado: {p.created_at ? new Date(p.created_at).toLocaleString() : "-"} ·
                        Actualizado: {p.updated_at ? new Date(p.updated_at).toLocaleString() : "-"}
                      </Text>

                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                        <ChipButton
                          label="Editar"
                          variant="primary"
                          onPress={() => openEditProduct(p)}
                          isMobile={isMobile}
                        />

                        {p.status !== "PUBLISHED" ? (
                          <ChipButton
                            label="Publicar"
                            variant="success"
                            onPress={() => quickPublish(p)}
                            isMobile={isMobile}
                          />
                        ) : null}

                        {supportsFeaturedHome ? (
                          <ChipButton
                            label={p.is_featured_home ? "Quitar destacado" : "Destacar en home"}
                            onPress={() => toggleFeaturedHome(p)}
                            isMobile={isMobile}
                          />
                        ) : null}

                        <ChipButton
                          label="Borrar"
                          variant="danger"
                          onPress={() => askRemove(p)}
                          isMobile={isMobile}
                        />
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
              <Text
                style={{
                  color: COLORS.text,
                  fontSize: isMobile ? 19 : 20,
                  fontWeight: "900",
                }}
              >
                {isEdit ? "Editar producto" : "Nuevo producto"}
              </Text>

              <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                Rellena lo importante. Mejor pocos productos bien montados que un cementerio de fichas mediocres.
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
                      fontSize: 14,
                    }}
                  />

                  {isValidHttpUrl(imageUrl) ? (
                    <View
                      style={{
                        width: "100%",
                        height: isMobile ? 150 : 170,
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
                Categoría actual:{" "}
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>{categoryName}</Text>
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
                      <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                        Destacar en home
                      </Text>
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