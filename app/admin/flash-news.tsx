// app/admin/flash-news.tsx
/**
 * Qué hace: pantalla de administración de "Noticias Flash · Blue IA". Estos
 * mensajes ya no van en una franja superior: los usa Blue IA, el asistente
 * flotante de la tienda, que los muestra como avisos en su bocadillo y los
 * conoce para responder a los clientes. Permite crear hasta 5 noticias,
 * editarlas, reordenarlas, activarlas/desactivarlas y borrarlas, eligiendo
 * para cada una su mensaje, su color y cuántos segundos se muestra antes de
 * pasar a la siguiente.
 *
 * Cómo funciona:
 * - Lee/escribe directamente en la tabla "flash_news" de Supabase (columnas:
 *   id, message, color_hex, display_seconds, sort_order, is_active,
 *   created_at, updated_at). RLS: lectura pública de las activas, escritura
 *   solo admin (is_admin()) — igual que "categories" y "products".
 * - MAX_ITEMS (5) limita cuántas noticias puede haber en total: el botón
 *   "+ Nueva noticia" se desactiva al llegar al límite, con un aviso.
 * - El modal de creación/edición deja elegir el color con una paleta de
 *   colores rápidos (chips) o escribiendo un código hexadecimal a mano, y
 *   muestra una vista previa sencilla del aviso en forma de bocadillo.
 * - toggleActive() aplica un cambio optimista en la lista y lo revierte si
 *   Supabase devuelve error, igual que en app/admin/categories.tsx.
 * - Sigue el tema claro global y las mismas convenciones visuales que el
 *   resto del panel de administración (COLORS, ChipButton, StatCard...).
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase para todas las operaciones CRUD.
 * - Asistente flotante de Blue IA → lee estas mismas noticias
 *   (is_active=true) para mostrarlas como avisos y usarlas al responder.
 * - app/admin/index.tsx → pantalla desde la que se entra aquí (tarjeta
 *   "Noticias Flash") y a la que se vuelve con smartBackAdminHome().
 * - app/admin/_layout.tsx → registra esta ruta ("flash-news") dentro del
 *   Stack protegido de administración.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import CargaMarca from "../../components/marca/CargaMarca";

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
  // Botón principal: el mismo azul que "Comprar"/"Confirmar pedido" de la tienda.
  accentDark: "#1EA7E8",
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

// "on-drag" en web cierra el teclado con CUALQUIER desplazamiento, también el que hace el
// propio navegador al enfocar un campo (el campo se cerraba solo): solo se usa en nativo.
const CIERRE_TECLADO: "none" | "on-drag" = Platform.OS === "web" ? "none" : "on-drag";

const MAX_ITEMS = 5;

// Paleta rápida para elegir color sin tener que escribir un hexadecimal a
// mano; el campo de texto sigue disponible debajo para un color a medida.
const COLOR_PRESETS = [
  { label: "Dorado", hex: "#FFB200" },
  { label: "Azul", hex: "#1EA7E8" },
  { label: "Verde", hex: "#22C55E" },
  { label: "Rojo", hex: "#EF4444" },
  { label: "Morado", hex: "#8B5CF6" },
  { label: "Marino", hex: "#0B2138" },
];

const DEFAULT_COLOR = COLOR_PRESETS[0].hex;

type FlashNewsRow = {
  id: string;
  message: string;
  color_hex: string;
  display_seconds: number;
  sort_order: number;
  is_active: boolean;
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

function isValidHex(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value ?? "").trim());
}

// Convierte un hex a rgba translúcido (tinte de cada noticia en la lista y
// borde del bocadillo), con un color de emergencia si el hex no es válido.
function hexToRgba(hex: string, alpha: number) {
  const clean = String(hex ?? "").replace("#", "").trim();
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;

  const r = parseInt(full.substring(0, 2), 16);
  const g = parseInt(full.substring(2, 4), 16);
  const b = parseInt(full.substring(4, 6), 16);

  if ([r, g, b].some((n) => Number.isNaN(n))) {
    return `rgba(255, 178, 0, ${alpha})`;
  }

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
  // Tres por fila también en el móvil (antes, una debajo de otra ocupaban media pantalla).
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        borderRadius: 16,
        backgroundColor: COLORS.cardSoft,
        paddingVertical: isMobile ? 10 : 14,
        paddingHorizontal: isMobile ? 8 : 14,
        alignItems: "center",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {icon ? <Ionicons name={icon} size={13} color={COLORS.muted2} /> : null}
        <Text numberOfLines={1} style={{ color: COLORS.muted2, fontWeight: "700", fontSize: 12 }}>
          {label}
        </Text>
      </View>
      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: isMobile ? 18 : 20, marginTop: 6, textAlign: "center" }}>
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

export default function AdminFlashNews() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const pagePadding = isMobile ? 12 : 16;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [screenErr, setScreenErr] = useState<string | null>(null);

  const [items, setItems] = useState<FlashNewsRow[]>([]);
  const itemsRef = useRef<FlashNewsRow[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FlashNewsRow | null>(null);

  const [editing, setEditing] = useState<FlashNewsRow | null>(null);
  const isEdit = !!editing;

  const [message, setMessage] = useState("");
  const [colorHex, setColorHex] = useState(DEFAULT_COLOR);
  const [displaySeconds, setDisplaySeconds] = useState("6");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);

  const modalTitle = useMemo(() => (isEdit ? "Editar noticia" : "Nueva noticia"), [isEdit]);
  const atLimit = items.length >= MAX_ITEMS && !isEdit;

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
        .from("flash_news")
        .select("id,message,color_hex,display_seconds,sort_order,is_active,created_at,updated_at")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;

      setItems((data ?? []) as FlashNewsRow[]);
    } catch (e: any) {
      console.error("Error cargando noticias flash:", e);
      setScreenErr("No se han podido cargar las noticias. Inténtalo de nuevo.");
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
    setMessage("");
    setColorHex(DEFAULT_COLOR);
    setDisplaySeconds("6");
    setSortOrder(String(items.length * 10));
    setIsActive(true);
    setModalErr(null);
  }

  function openCreate() {
    if (atLimit) return;
    resetForm();
    setOpen(true);
  }

  function openEdit(row: FlashNewsRow) {
    setEditing(row);
    setMessage(row.message ?? "");
    setColorHex(isValidHex(row.color_hex) ? row.color_hex : DEFAULT_COLOR);
    setDisplaySeconds(String(row.display_seconds ?? 6));
    setSortOrder(String(row.sort_order ?? 0));
    setIsActive(!!row.is_active);
    setModalErr(null);
    setOpen(true);
  }

  async function save() {
    if (saving) return;

    setSaving(true);
    setModalErr(null);

    const cleanMessage = message.trim();
    const cleanColor = colorHex.trim();
    const seconds = toIntSafe(displaySeconds, 6);
    const so = toIntSafe(sortOrder, 0);

    if (!cleanMessage) {
      setModalErr("Escribe el texto de la noticia.");
      setSaving(false);
      return;
    }

    if (cleanMessage.length > 140) {
      setModalErr("El texto es demasiado largo (máximo 140 caracteres).");
      setSaving(false);
      return;
    }

    if (!isValidHex(cleanColor)) {
      setModalErr("Elige un color de la paleta o escribe un código válido (#RRGGBB).");
      setSaving(false);
      return;
    }

    if (!Number.isFinite(seconds) || seconds < 2 || seconds > 60) {
      setModalErr("Los segundos en pantalla deben estar entre 2 y 60.");
      setSaving(false);
      return;
    }

    if (!isEdit && items.length >= MAX_ITEMS) {
      setModalErr(`Ya hay ${MAX_ITEMS} noticias — borra una para poder crear otra.`);
      setSaving(false);
      return;
    }

    try {
      const payload = {
        message: cleanMessage,
        color_hex: cleanColor,
        display_seconds: seconds,
        sort_order: so,
        is_active: isActive,
      };

      if (editing) {
        const { error } = await supabase.from("flash_news").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("flash_news").insert(payload);
        if (error) throw error;
      }

      setOpen(false);
      resetForm();
      await load();
    } catch (e: any) {
      console.error("Error guardando noticia flash:", e);
      setModalErr("No se pudo guardar la noticia. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: FlashNewsRow) {
    const prev = itemsRef.current;
    const next = prev.map((x) => (x.id === row.id ? { ...x, is_active: !x.is_active } : x));
    setItems(next);

    const { error } = await supabase
      .from("flash_news")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);

    if (error) {
      setItems(prev);
      setScreenErr(error.message);
    }
  }

  function askRemove(row: FlashNewsRow) {
    setConfirmDelete(row);
  }

  async function removeConfirmed() {
    const row = confirmDelete;
    if (!row) return;

    setConfirmDelete(null);
    setScreenErr(null);

    try {
      const { error } = await supabase.from("flash_news").delete().eq("id", row.id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      console.error("Error borrando noticia flash:", e);
      setScreenErr("No se ha podido borrar la noticia. Inténtalo de nuevo.");
    }
  }

  const previewBorder = hexToRgba(colorHex, 0.45);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      {/* Cabecera fija y compacta (volver al panel + título centrado). El resumen, los
          contadores y el botón van dentro del scroll: fijos arriba se comían media pantalla
          del móvil y la lista apenas tenía sitio para desplazarse. */}
      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
          paddingHorizontal: pagePadding,
          paddingTop: (isMobile ? 10 : 12) + insets.top,
          paddingBottom: isMobile ? 10 : 12,
        }}
      >
        <View style={{ width: "100%", maxWidth: 1040, alignSelf: "center", minHeight: 40, justifyContent: "center" }}>
          <Pressable
            onPress={smartBackAdminHome}
            accessibilityRole="button"
            accessibilityLabel="Volver al panel"
            hitSlop={8}
            style={({ pressed }) => ({
              position: "absolute",
              // Por encima del título, que va después y ocupa todo el ancho (si no, se queda el toque).
              zIndex: 1,
              left: 0,
              top: 0,
              bottom: 0,
              width: 40,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </Pressable>
          <Text
            style={{
              color: COLORS.text,
              fontSize: isMobile ? 19 : 22,
              fontWeight: "900",
              textAlign: "center",
              paddingHorizontal: 44,
            }}
          >
            Noticias Flash · Blue IA
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <CargaMarca texto="Cargando noticias…" />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: pagePadding, paddingBottom: 48 + insets.bottom, alignItems: "center" }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ width: "100%", maxWidth: 1040, gap: 16 }}>
            <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
              Hasta {MAX_ITEMS} avisos para Blue IA: el asistente flotante los muestra a los
              clientes y los tiene en cuenta al responder.
            </Text>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <StatCard label="Total" value={`${stats.total} / ${MAX_ITEMS}`} icon="flash-outline" isMobile={isMobile} />
              <StatCard label="Activas" value={String(stats.active)} icon="checkmark-circle-outline" isMobile={isMobile} />
              <StatCard label="Ocultas" value={String(stats.hidden)} icon="eye-off-outline" isMobile={isMobile} />
            </View>

            <Pressable
              onPress={openCreate}
              disabled={atLimit}
              accessibilityRole="button"
              style={({ pressed }) => ({
                opacity: atLimit ? 0.5 : pressed ? 0.9 : 1,
                borderRadius: 999,
                paddingVertical: 13,
                paddingHorizontal: 20,
                alignItems: "center",
                backgroundColor: COLORS.accentDark,
                width: "100%",
                maxWidth: 420,
                alignSelf: "center",
              })}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15, textAlign: "center" }}>
                {atLimit ? `Límite de ${MAX_ITEMS} noticias alcanzado` : "+ Nueva noticia"}
              </Text>
            </Pressable>

            {!!screenErr && (
              <View
                style={{
                  borderRadius: 14,
                  backgroundColor: COLORS.dangerBg,
                  padding: 10,
                }}
              >
                <Text style={{ color: COLORS.danger, fontWeight: "800", lineHeight: 20, textAlign: "center" }}>
                  {screenErr}
                </Text>
              </View>
            )}

            {items.length === 0 ? (
              <View style={{ alignItems: "center", gap: 6, paddingVertical: 24, paddingHorizontal: 12 }}>
                <Ionicons name="flash-outline" size={24} color={COLORS.muted2} />
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>
                  Todavía no hay noticias.
                </Text>
                <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
                  Crea la primera para que Blue IA la muestre como aviso y la use al responder.
                </Text>
              </View>
            ) : (
              items.map((row) => {
                const rowColor = isValidHex(row.color_hex) ? row.color_hex : DEFAULT_COLOR;
                const rowBg = hexToRgba(rowColor, 0.14);

                return (
                  <View
                    key={row.id}
                    style={{
                      borderRadius: 20,
                      backgroundColor: COLORS.card,
                      padding: isMobile ? 12 : 14,
                      gap: 12,
                    }}
                  >
                    <View
                      style={{
                        borderRadius: 14,
                        backgroundColor: rowBg,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Ionicons name="flash-outline" size={15} color={rowColor} />
                      <Text
                        style={{ color: COLORS.text, fontWeight: "900", fontSize: 14, flex: 1 }}
                        numberOfLines={2}
                      >
                        {row.message}
                      </Text>
                    </View>

                    <View
                      style={{
                        flexDirection: isMobile ? "column" : "row",
                        justifyContent: "space-between",
                        alignItems: isMobile ? "stretch" : "center",
                        gap: 12,
                      }}
                    >
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
                            {row.display_seconds}s en pantalla
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
                            Orden: {row.sort_order}
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
                            {row.is_active ? "Activa" : "Oculta"}
                          </Text>
                        </View>
                      </View>

                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <Switch value={row.is_active} onValueChange={() => toggleActive(row)} />
                      </View>
                    </View>

                    <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                      <ChipButton label="Editar" variant="primary" onPress={() => openEdit(row)} isMobile={isMobile} />
                      <ChipButton label="Borrar" variant="danger" onPress={() => askRemove(row)} isMobile={isMobile} />
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      )}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* El formulario se desplaza dentro del modal (en el móvil no cabe entero) y, en
            iPhone, sube por encima del teclado. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.60)" }}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "center",
              paddingHorizontal: isMobile ? 10 : 16,
              paddingTop: (isMobile ? 16 : 24) + insets.top,
              paddingBottom: (isMobile ? 24 : 32) + insets.bottom,
            }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={CIERRE_TECLADO}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 640,
                alignSelf: "center",
                borderRadius: 20,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.bg,
                padding: isMobile ? 14 : 16,
                gap: 12,
                ...softShadow(),
              }}
            >
              <Text style={{ color: COLORS.text, fontSize: isMobile ? 19 : 20, fontWeight: "900", textAlign: "center" }}>
                {modalTitle}
              </Text>

              <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
                Blue IA mostrará este aviso en su asistente flotante durante el tiempo que
                marques y lo tendrá en cuenta al responder.
              </Text>

              <TextInput
                value={message}
                onChangeText={(v) => {
                  setMessage(v);
                  setModalErr(null);
                }}
                placeholder="Ej: Te compramos tu electrónica hoy mismo"
                placeholderTextColor="rgba(11,33,56,0.40)"
                multiline
                maxLength={140}
                style={{
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  color: COLORS.text,
                  backgroundColor: "#F8FBFE",
                  // 16 px: con menos, Safari (iPhone) hace zoom al enfocar y la pantalla
                  // se queda ampliada y "descuadrada".
                  fontSize: 16,
                  minHeight: 60,
                  textAlignVertical: "top",
                }}
              />

              <View style={{ gap: 8 }}>
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13 }}>Color</Text>

                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {COLOR_PRESETS.map((preset) => {
                    const selected = colorHex.toLowerCase() === preset.hex.toLowerCase();
                    return (
                      <Pressable
                        key={preset.hex}
                        onPress={() => {
                          setColorHex(preset.hex);
                          setModalErr(null);
                        }}
                        style={({ pressed }) => ({
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          paddingVertical: 8,
                          paddingHorizontal: 10,
                          borderRadius: 999,
                          borderWidth: selected ? 2 : 1,
                          borderColor: selected ? COLORS.text : COLORS.border,
                          backgroundColor: pressed ? "#F0F5FA" : "#F8FBFE",
                        })}
                      >
                        <View
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 7,
                            backgroundColor: preset.hex,
                            borderWidth: 1,
                            borderColor: "rgba(11,33,56,0.18)",
                          }}
                        />
                        <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 12 }}>
                          {preset.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <TextInput
                  value={colorHex}
                  onChangeText={(v) => {
                    setColorHex(v);
                    setModalErr(null);
                  }}
                  placeholder="#RRGGBB"
                  placeholderTextColor="rgba(11,33,56,0.40)"
                  autoCapitalize="none"
                  style={{
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    borderRadius: 14,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: COLORS.text,
                    backgroundColor: "#F8FBFE",
                    fontSize: 16,
                  }}
                />
              </View>

              <TextInput
                value={displaySeconds}
                onChangeText={(v) => {
                  setDisplaySeconds(v);
                  setModalErr(null);
                }}
                placeholder="Segundos en pantalla (2-60)"
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
                  fontSize: 16,
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
                  fontSize: 16,
                }}
              />

              {/* Vista previa sencilla del aviso como bocadillo de Blue IA. */}
              <View style={{ alignItems: "center", gap: 6 }}>
                <Text style={{ color: COLORS.muted2, fontWeight: "800", fontSize: 12 }}>
                  Vista previa en Blue IA
                </Text>
                <View
                  style={{
                    maxWidth: 360,
                    borderRadius: 18,
                    borderBottomLeftRadius: 6,
                    borderWidth: 1,
                    borderColor: previewBorder,
                    backgroundColor: "#FFFFFF",
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Ionicons
                    name="flash-outline"
                    size={15}
                    color={isValidHex(colorHex) ? colorHex : DEFAULT_COLOR}
                  />
                  <Text style={{ color: COLORS.text, fontWeight: "700", fontSize: 13, flexShrink: 1 }} numberOfLines={3}>
                    {message.trim() || "Vista previa del aviso…"}
                  </Text>
                </View>
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
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>Noticia activa</Text>
                    <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 18 }}>
                      Si está activa, Blue IA la muestra y la usa al responder.
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
                  <Text style={{ color: COLORS.danger, fontWeight: "800", lineHeight: 20, textAlign: "center" }}>
                    {modalErr}
                  </Text>
                </View>
              )}

              <View style={{ flexDirection: isMobile ? "column" : "row", gap: 10, justifyContent: "center", marginTop: 4 }}>
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
                    paddingHorizontal: 18,
                    backgroundColor: COLORS.accentDark,
                    width: isMobile ? "100%" : undefined,
                  })}
                >
                  <Text style={{ color: "#FFFFFF", fontWeight: "900", textAlign: "center" }}>
                    {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear noticia"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
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
              backgroundColor: COLORS.bg,
              padding: isMobile ? 14 : 16,
              gap: 10,
            }}
          >
            <Text style={{ color: COLORS.text, fontSize: isMobile ? 17 : 18, fontWeight: "900", textAlign: "center" }}>
              Borrar noticia
            </Text>

            <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
              Vas a borrar{" "}
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                «{confirmDelete?.message ?? ""}»
              </Text>
              . Blue IA dejará de mostrarla y de usarla.
            </Text>

            <View style={{ flexDirection: isMobile ? "column" : "row", gap: 10, justifyContent: "center", marginTop: 6 }}>
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
