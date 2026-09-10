// app/admin/policies.tsx
/**
 * Qué hace: pantalla de administración de las páginas de "Políticas"
 * (Envíos, Devoluciones, Privacidad, Términos y condiciones...) que se
 * muestran en app/politicas/[slug].tsx. Permite crear, editar, reordenar,
 * publicar/ocultar y borrar cada política, incluyendo sus secciones
 * (encabezado + texto), sin tocar código.
 *
 * Cómo funciona:
 * - Lee/escribe directamente en la tabla "policy_pages" de Supabase
 *   (columnas: id, slug, title, intro, sections [jsonb], is_active,
 *   sort_order, created_at, updated_at). RLS: lectura pública de las
 *   activas, escritura solo admin (is_admin()) — igual que "categories".
 * - El slug determina la URL pública (/politicas/<slug>): el pie de página
 *   de Inicio enlaza a los 4 slugs fijos "envios", "devoluciones",
 *   "privacidad" y "terminos". Se puede crear un slug nuevo, pero no tendrá
 *   enlace propio en el pie de página hasta que se añada allí.
 * - El editor de secciones es una lista libre de pares
 *   {heading, body} — se pueden añadir, editar y quitar antes de guardar;
 *   al guardar se descartan las secciones que queden vacías.
 * - toggleActive() aplica un cambio optimista en la lista y lo revierte si
 *   Supabase devuelve error, igual que en app/admin/categories.tsx.
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase para todas las operaciones CRUD.
 * - app/politicas/[slug].tsx → pantalla pública que lee estas mismas filas
 *   (is_active=true) para pintar cada política.
 * - app/admin/index.tsx → pantalla desde la que se entra aquí (tarjeta
 *   "Políticas") y a la que se vuelve con smartBackAdminHome().
 * - app/admin/_layout.tsx → registra esta ruta ("policies") dentro del
 *   Stack protegido de administración.
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

type PolicySection = { heading: string; body: string };

type PolicyRow = {
  id: string;
  slug: string;
  title: string;
  intro: string;
  sections: PolicySection[];
  is_active: boolean;
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

function normalizeSections(value: unknown): PolicySection[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row): PolicySection | null => {
      if (!row || typeof row !== "object") return null;
      const heading = String((row as any).heading ?? "").trim();
      const body = String((row as any).body ?? "").trim();
      if (!heading && !body) return null;
      return { heading, body };
    })
    .filter((s): s is PolicySection => s !== null);
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

export default function AdminPolicies() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const pagePadding = isMobile ? 12 : 16;

  const [loading, setLoading] = useState(true);
  const [screenErr, setScreenErr] = useState<string | null>(null);

  const [items, setItems] = useState<PolicyRow[]>([]);
  const itemsRef = useRef<PolicyRow[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PolicyRow | null>(null);

  const [editing, setEditing] = useState<PolicyRow | null>(null);
  const isEdit = !!editing;

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [intro, setIntro] = useState("");
  const [sections, setSections] = useState<PolicySection[]>([]);
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);

  const modalTitle = useMemo(() => (isEdit ? "Editar política" : "Nueva política"), [isEdit]);

  const stats = useMemo(() => {
    const total = items.length;
    const active = items.filter((x) => !!x.is_active).length;
    return { total, active, hidden: total - active };
  }, [items]);

  async function load() {
    setLoading(true);
    setScreenErr(null);

    try {
      const { data, error } = await supabase
        .from("policy_pages")
        .select("id,slug,title,intro,sections,is_active,sort_order,created_at,updated_at")
        .order("sort_order", { ascending: true })
        .order("title", { ascending: true });

      if (error) throw error;

      const rows = ((data ?? []) as any[]).map((row) => ({
        ...row,
        sections: normalizeSections(row.sections),
      })) as PolicyRow[];

      setItems(rows);
    } catch (e: any) {
      console.error("Error cargando políticas:", e);
      setScreenErr("No se han podido cargar las políticas. Inténtalo de nuevo.");
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
    setIntro("");
    setSections([{ heading: "", body: "" }]);
    setSortOrder(String(items.length * 10));
    setIsActive(true);
    setModalErr(null);
  }

  function openCreate() {
    resetForm();
    setOpen(true);
  }

  function openEdit(row: PolicyRow) {
    setEditing(row);
    setTitle(row.title ?? "");
    setSlug(row.slug ?? "");
    setIntro(row.intro ?? "");
    setSections(row.sections.length > 0 ? row.sections : [{ heading: "", body: "" }]);
    setSortOrder(String(row.sort_order ?? 0));
    setIsActive(!!row.is_active);
    setModalErr(null);
    setOpen(true);
  }

  function updateSection(index: number, patch: Partial<PolicySection>) {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addSection() {
    setSections((prev) => [...prev, { heading: "", body: "" }]);
  }

  function removeSection(index: number) {
    setSections((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    if (saving) return;

    setSaving(true);
    setModalErr(null);

    const cleanTitle = title.trim();
    const cleanSlug = slugify(slug || cleanTitle);
    const cleanIntro = intro.trim();
    const so = toIntSafe(sortOrder, 0);
    const cleanSections = sections
      .map((s) => ({ heading: s.heading.trim(), body: s.body.trim() }))
      .filter((s) => s.heading && s.body);

    if (!cleanTitle) {
      setModalErr("Introduce un título para la política.");
      setSaving(false);
      return;
    }

    if (!cleanSlug) {
      setModalErr("Slug inválido.");
      setSaving(false);
      return;
    }

    try {
      const payload = {
        slug: cleanSlug,
        title: cleanTitle,
        intro: cleanIntro,
        sections: cleanSections,
        sort_order: so,
        is_active: isActive,
      };

      if (editing) {
        const { error } = await supabase.from("policy_pages").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("policy_pages").insert(payload);
        if (error) throw error;
      }

      setOpen(false);
      resetForm();
      await load();
    } catch (e: any) {
      console.error("Error guardando política:", e);
      const msg = String(e?.message ?? "");

      if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
        setModalErr("Ya existe una política con ese slug.");
      } else {
        setModalErr("No se pudo guardar la política. Inténtalo de nuevo.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: PolicyRow) {
    const prev = itemsRef.current;
    const next = prev.map((x) => (x.id === row.id ? { ...x, is_active: !x.is_active } : x));
    setItems(next);

    const { error } = await supabase
      .from("policy_pages")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);

    if (error) {
      setItems(prev);
      setScreenErr(error.message);
    }
  }

  function askRemove(row: PolicyRow) {
    setConfirmDelete(row);
  }

  async function removeConfirmed() {
    const row = confirmDelete;
    if (!row) return;

    setConfirmDelete(null);
    setScreenErr(null);

    try {
      const { error } = await supabase.from("policy_pages").delete().eq("id", row.id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      console.error("Error borrando política:", e);
      setScreenErr("No se ha podido borrar la política. Inténtalo de nuevo.");
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
                Políticas
              </Text>
              <Text
                style={{
                  color: COLORS.muted,
                  marginTop: 4,
                  lineHeight: 20,
                  textAlign: isMobile ? "center" : "left",
                }}
              >
                Envíos, devoluciones, privacidad y términos — el pie de página enlaza a los slugs
                "envios", "devoluciones", "privacidad" y "terminos".
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
            <StatCard label="Total" value={String(stats.total)} icon="document-text-outline" isMobile={isMobile} />
            <StatCard label="Publicadas" value={String(stats.active)} icon="checkmark-circle-outline" isMobile={isMobile} />
            <StatCard label="Ocultas" value={String(stats.hidden)} icon="eye-off-outline" isMobile={isMobile} />
          </View>

          <View
            style={{
              borderRadius: 18,
              backgroundColor: COLORS.card,
              padding: 12,
              gap: 10,
            }}
          >
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
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>+ Nueva política</Text>
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
              <Text style={{ color: COLORS.danger, fontWeight: "800", lineHeight: 20 }}>{screenErr}</Text>
            </View>
          )}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator color={COLORS.text} />
          <Text style={{ color: COLORS.muted }}>Cargando políticas…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: pagePadding, paddingBottom: 30, alignItems: "center" }}>
          <View style={{ width: "100%", maxWidth: 1040, gap: 12 }}>
            {items.length === 0 ? (
              <View
                style={{
                  borderRadius: 18,
                  backgroundColor: COLORS.card,
                  padding: isMobile ? 14 : 16,
                  gap: 8,
                }}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
                  Todavía no hay políticas.
                </Text>
              </View>
            ) : (
              items.map((row) => (
                <View
                  key={row.id}
                  style={{
                    borderRadius: 20,
                    backgroundColor: COLORS.card,
                    padding: isMobile ? 12 : 14,
                    gap: 12,
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: isMobile ? 16 : 17 }}>
                    {row.title}
                  </Text>

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
                        /politicas/{row.slug}
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
                        {row.sections.length} sección{row.sections.length === 1 ? "" : "es"}
                      </Text>
                    </View>

                    <View
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: row.is_active ? COLORS.successBorder : COLORS.warningBorder,
                        backgroundColor: row.is_active ? COLORS.successBg : COLORS.warningBg,
                      }}
                    >
                      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                        {row.is_active ? "Publicada" : "Oculta"}
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
                        {row.is_active ? "Publicada" : "Oculta"}
                      </Text>
                      <Switch value={row.is_active} onValueChange={() => toggleActive(row)} />
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
                maxWidth: 680,
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
                placeholder="Título (ej: Política de envíos)"
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
                placeholder="Slug para la URL (ej: envios)"
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
                value={intro}
                onChangeText={(v) => {
                  setIntro(v);
                  setModalErr(null);
                }}
                placeholder="Texto de introducción"
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
                  minHeight: 60,
                  textAlignVertical: "top",
                }}
              />

              <View style={{ gap: 10 }}>
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13 }}>Secciones</Text>

                {sections.map((section, index) => (
                  <View
                    key={index}
                    style={{
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      backgroundColor: COLORS.cardSoft,
                      padding: 10,
                      gap: 8,
                    }}
                  >
                    <TextInput
                      value={section.heading}
                      onChangeText={(v) => updateSection(index, { heading: v })}
                      placeholder="Encabezado de la sección"
                      placeholderTextColor="rgba(11,33,56,0.40)"
                      style={{
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        borderRadius: 12,
                        paddingHorizontal: 10,
                        paddingVertical: 10,
                        color: COLORS.text,
                        backgroundColor: "#FFFFFF",
                        fontSize: 13.5,
                        fontWeight: "800",
                      }}
                    />
                    <TextInput
                      value={section.body}
                      onChangeText={(v) => updateSection(index, { body: v })}
                      placeholder="Texto de la sección"
                      placeholderTextColor="rgba(11,33,56,0.40)"
                      multiline
                      style={{
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        borderRadius: 12,
                        paddingHorizontal: 10,
                        paddingVertical: 10,
                        color: COLORS.text,
                        backgroundColor: "#FFFFFF",
                        fontSize: 13.5,
                        minHeight: 60,
                        textAlignVertical: "top",
                      }}
                    />
                    <Pressable onPress={() => removeSection(index)} style={{ alignSelf: "flex-start" }}>
                      <Text style={{ color: COLORS.danger, fontWeight: "800", fontSize: 12 }}>
                        Quitar sección
                      </Text>
                    </Pressable>
                  </View>
                ))}

                <Pressable
                  onPress={addSection}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.88 : 1,
                    borderRadius: 999,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderWidth: 1,
                    borderColor: COLORS.accentBorder,
                    backgroundColor: COLORS.accent2,
                    alignSelf: "flex-start",
                  })}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13 }}>
                    + Añadir sección
                  </Text>
                </Pressable>
              </View>

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
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>Política publicada</Text>
                    <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 18 }}>
                      Si está publicada, es visible en /politicas/{slug || "..."}.
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
                    {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear política"}
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
              Borrar política
            </Text>

            <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
              Vas a borrar{" "}
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                {confirmDelete?.title ?? ""}
              </Text>
              . Su enlace en el pie de página dejará de tener contenido.
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
