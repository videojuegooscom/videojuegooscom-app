// app/admin/blog.tsx
/**
 * Qué hace: pantalla de administración de los artículos del Blog que se
 * muestran en app/blog/index.tsx. Permite crear, editar, publicar/pasar a
 * borrador, reordenar y borrar artículos, sin tocar código.
 *
 * Cómo funciona:
 * - Lee/escribe directamente en la tabla "blog_posts" de Supabase (columnas:
 *   id, slug, title, excerpt, body, status ["DRAFT"|"PUBLISHED"],
 *   sort_order, created_at, updated_at). RLS: lectura pública de las
 *   publicadas, escritura solo admin (is_admin()) — igual que "products".
 * - El slug determina el enlace directo desde el pie de página de Inicio
 *   (?open=<slug>), así que conviene no cambiarlo una vez enlazado desde
 *   ahí ("Guías de compra" usa "elegir-consola-segunda-mano", "Consejos y
 *   mantenimiento" usa "mantenimiento-consola").
 * - El interruptor "Publicado" alterna entre status "PUBLISHED" y "DRAFT"
 *   con un cambio optimista en la lista (se revierte si Supabase falla),
 *   igual que toggleActive() en app/admin/categories.tsx.
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase para todas las operaciones CRUD.
 * - app/blog/index.tsx → pantalla pública que lee estas mismas filas
 *   (status="PUBLISHED") para pintar el listado del Blog.
 * - app/admin/index.tsx → pantalla desde la que se entra aquí (tarjeta
 *   "Blog") y a la que se vuelve con smartBackAdminHome().
 * - app/admin/_layout.tsx → registra esta ruta ("blog") dentro del Stack
 *   protegido de administración.
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

type BlogStatus = "DRAFT" | "PUBLISHED";

type BlogRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  status: BlogStatus;
  sort_order: number;
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
    .replace(/[̀-ͯ]/g, "")
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
}: {
  label: string;
  value: string;
  icon?: IoniconName;
  isMobile?: boolean;
}) {
  return (
    <View
      style={{
        width: isMobile ? "100%" : "31.9%",
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
      <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center", fontSize: isMobile ? 13 : 14 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function AdminBlog() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const pagePadding = isMobile ? 12 : 16;

  const [loading, setLoading] = useState(true);
  const [screenErr, setScreenErr] = useState<string | null>(null);

  const [items, setItems] = useState<BlogRow[]>([]);
  const itemsRef = useRef<BlogRow[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const [search, setSearch] = useState("");

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BlogRow | null>(null);

  const [editing, setEditing] = useState<BlogRow | null>(null);
  const isEdit = !!editing;

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [body, setBody] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [published, setPublished] = useState(false);

  const modalTitle = useMemo(() => (isEdit ? "Editar artículo" : "Nuevo artículo"), [isEdit]);

  const stats = useMemo(() => {
    const total = items.length;
    const publishedCount = items.filter((x) => x.status === "PUBLISHED").length;
    return { total, published: publishedCount, drafts: total - publishedCount };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (a) =>
        String(a.title ?? "").toLowerCase().includes(q) ||
        String(a.slug ?? "").toLowerCase().includes(q)
    );
  }, [items, search]);

  async function load() {
    setLoading(true);
    setScreenErr(null);

    try {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("id,slug,title,excerpt,body,status,sort_order,created_at,updated_at")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;

      setItems((data ?? []) as BlogRow[]);
    } catch (e: any) {
      console.error("Error cargando artículos del blog:", e);
      setScreenErr("No se han podido cargar los artículos. Inténtalo de nuevo.");
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
    setSlug("");
    setExcerpt("");
    setBody("");
    setSortOrder(String(items.length * 10));
    setPublished(false);
    setModalErr(null);
  }

  function openCreate() {
    resetForm();
    setOpen(true);
  }

  function openEdit(row: BlogRow) {
    setEditing(row);
    setTitle(row.title ?? "");
    setSlug(row.slug ?? "");
    setExcerpt(row.excerpt ?? "");
    setBody(row.body ?? "");
    setSortOrder(String(row.sort_order ?? 0));
    setPublished(row.status === "PUBLISHED");
    setModalErr(null);
    setOpen(true);
  }

  async function save() {
    if (saving) return;

    setSaving(true);
    setModalErr(null);

    const cleanTitle = title.trim();
    const cleanSlug = slugify(slug || cleanTitle);
    const cleanExcerpt = excerpt.trim();
    const cleanBody = body.trim();
    const so = toIntSafe(sortOrder, 0);

    if (!cleanTitle) {
      setModalErr("Introduce un título para el artículo.");
      setSaving(false);
      return;
    }

    if (!cleanSlug) {
      setModalErr("Slug inválido.");
      setSaving(false);
      return;
    }

    if (!cleanBody) {
      setModalErr("Escribe el contenido del artículo.");
      setSaving(false);
      return;
    }

    try {
      const payload = {
        slug: cleanSlug,
        title: cleanTitle,
        excerpt: cleanExcerpt,
        body: cleanBody,
        sort_order: so,
        status: (published ? "PUBLISHED" : "DRAFT") as BlogStatus,
      };

      if (editing) {
        const { error } = await supabase.from("blog_posts").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("blog_posts").insert(payload);
        if (error) throw error;
      }

      setOpen(false);
      resetForm();
      await load();
    } catch (e: any) {
      console.error("Error guardando artículo:", e);
      const msg = String(e?.message ?? "");

      if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
        setModalErr("Ya existe un artículo con ese slug.");
      } else {
        setModalErr("No se pudo guardar el artículo. Inténtalo de nuevo.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function togglePublished(row: BlogRow) {
    const nextStatus: BlogStatus = row.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    const prev = itemsRef.current;
    const next = prev.map((x) => (x.id === row.id ? { ...x, status: nextStatus } : x));
    setItems(next);

    const { error } = await supabase.from("blog_posts").update({ status: nextStatus }).eq("id", row.id);

    if (error) {
      setItems(prev);
      setScreenErr(error.message);
    }
  }

  function askRemove(row: BlogRow) {
    setConfirmDelete(row);
  }

  async function removeConfirmed() {
    const row = confirmDelete;
    if (!row) return;

    setConfirmDelete(null);
    setScreenErr(null);

    try {
      const { error } = await supabase.from("blog_posts").delete().eq("id", row.id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      console.error("Error borrando artículo:", e);
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
          paddingBottom: 12,
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
                Blog
              </Text>
              <Text
                style={{
                  color: COLORS.muted,
                  marginTop: 4,
                  lineHeight: 20,
                  textAlign: isMobile ? "center" : "left",
                }}
              >
                Crea, edita y publica los artículos que se muestran en el Blog de la app.
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
            <StatCard label="Total" value={String(stats.total)} icon="newspaper-outline" isMobile={isMobile} />
            <StatCard label="Publicados" value={String(stats.published)} icon="checkmark-circle-outline" isMobile={isMobile} />
            <StatCard label="Borradores" value={String(stats.drafts)} icon="create-outline" isMobile={isMobile} />
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
              onChangeText={setSearch}
              placeholder="Buscar por título o slug"
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
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator color={COLORS.text} />
          <Text style={{ color: COLORS.muted }}>Cargando artículos…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: pagePadding, paddingBottom: 30, alignItems: "center" }}>
          <View style={{ width: "100%", maxWidth: 1040, gap: 12 }}>
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
                  No hay artículos para este filtro.
                </Text>
              </View>
            ) : (
              filteredItems.map((row) => (
                <View
                  key={row.id}
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
                  <View style={{ gap: 4 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: isMobile ? 16 : 17 }}>
                      {row.title}
                    </Text>
                    {!!row.excerpt && (
                      <Text style={{ color: COLORS.muted, fontSize: 13, lineHeight: 18 }}>
                        {row.excerpt}
                      </Text>
                    )}
                  </View>

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
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
                        slug: {row.slug}
                      </Text>
                    </View>

                    <View
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: row.status === "PUBLISHED" ? COLORS.successBorder : COLORS.warningBorder,
                        backgroundColor: row.status === "PUBLISHED" ? COLORS.successBg : COLORS.warningBg,
                      }}
                    >
                      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                        {row.status === "PUBLISHED" ? "Publicado" : "Borrador"}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={{
                      flexDirection: isMobile ? "column" : "row",
                      justifyContent: "space-between",
                      alignItems: isMobile ? "stretch" : "center",
                      gap: 12,
                    }}
                  >
                    <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                      <ChipButton label="Editar" variant="primary" onPress={() => openEdit(row)} isMobile={isMobile} />
                      <ChipButton label="Borrar" variant="danger" onPress={() => askRemove(row)} isMobile={isMobile} />
                    </View>

                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Text style={{ color: COLORS.muted, fontWeight: "800" }}>
                        {row.status === "PUBLISHED" ? "Publicado" : "Borrador"}
                      </Text>
                      <Switch value={row.status === "PUBLISHED"} onValueChange={() => togglePublished(row)} />
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.60)", padding: isMobile ? 10 : 16, justifyContent: "center" }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }} keyboardShouldPersistTaps="handled">
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
              <Text style={{ color: COLORS.text, fontSize: isMobile ? 19 : 20, fontWeight: "900" }}>
                {modalTitle}
              </Text>

              <TextInput
                value={title}
                onChangeText={(v) => {
                  setTitle(v);
                  if (!isEdit) setSlug(slugify(v));
                  setModalErr(null);
                }}
                placeholder="Título del artículo"
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
                placeholder="Slug (identificador para el enlace)"
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
                value={excerpt}
                onChangeText={(v) => {
                  setExcerpt(v);
                  setModalErr(null);
                }}
                placeholder="Resumen corto (se ve en la lista, antes de abrir el artículo)"
                placeholderTextColor="rgba(11,33,56,0.40)"
                multiline
                style={{
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  color: COLORS.text,
                  backgroundColor: "#F8FBFE",
                  fontSize: 14,
                  minHeight: 50,
                  textAlignVertical: "top",
                }}
              />

              <TextInput
                value={body}
                onChangeText={(v) => {
                  setBody(v);
                  setModalErr(null);
                }}
                placeholder="Contenido completo del artículo"
                placeholderTextColor="rgba(11,33,56,0.40)"
                multiline
                style={{
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  color: COLORS.text,
                  backgroundColor: "#F8FBFE",
                  fontSize: 14,
                  minHeight: 140,
                  textAlignVertical: "top",
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
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>Publicado</Text>
                    <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 18 }}>
                      Si está publicado, aparece en el listado público del Blog. Si no, queda
                      como borrador solo visible aquí.
                    </Text>
                  </View>
                  <Switch value={published} onValueChange={setPublished} />
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

              <View style={{ flexDirection: isMobile ? "column" : "row", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
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
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", padding: isMobile ? 10 : 16, justifyContent: "center" }}>
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
                {confirmDelete?.title ?? ""}
              </Text>
              . Dejará de mostrarse en el Blog.
            </Text>

            <View style={{ flexDirection: isMobile ? "column" : "row", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
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
