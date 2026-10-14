// app/admin/aprendizajes.tsx
/**
 * Qué hace: pantalla de administración "Centro De Aprendizajes". Aquí el administrador
 * guarda cada corrección que le hace a Claude (cómo quiere los textos, el diseño, las
 * reglas del negocio, el código…), para que no tenga que repetirla.
 *
 * Cómo funciona:
 * - Lee y escribe la tabla "aprendizajes" (ver
 *   supabase/migrations/20261012150000_centro_aprendizajes.sql). Solo el administrador
 *   puede leerla o cambiarla (RLS con is_admin()).
 * - Claude consulta las lecciones activas antes de cualquier cambio que se le pida (norma
 *   en CLAUDE.md) y las aplica, empezando por las de prioridad "Imprescindible".
 * - Las lecciones no se borran: se desactivan, para conservar el historial.
 * - Un mismo formulario sirve para crear una lección nueva o editar una existente
 *   (botón "Editar" de cada tarjeta).
 *
 * Conectado con:
 * - app/admin/index.tsx → tarjeta "Centro De Aprendizajes" que lleva aquí.
 * - app/admin/_layout.tsx → registra esta ruta ("aprendizajes") en el Stack.
 * - CLAUDE.md → norma que obliga a Claude a consultar estas lecciones.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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

// "on-drag" en web cierra el teclado con CUALQUIER desplazamiento, incluido el que hace
// scrollFieldIntoView (más abajo) al enfocar un campo: el campo se cerraba solo. Por eso solo
// se usa en nativo.
const CIERRE_TECLADO: "none" | "on-drag" = Platform.OS === "web" ? "none" : "on-drag";

type Categoria = "general" | "diseno" | "textos" | "negocio" | "codigo" | "seguridad" | "seo" | "panel";
type Prioridad = 1 | 2 | 3;

type Aprendizaje = {
  id: string;
  created_at: string;
  updated_at: string;
  titulo: string;
  categoria: Categoria;
  regla: string;
  ejemplo_mal: string | null;
  ejemplo_bien: string | null;
  prioridad: Prioridad;
  activa: boolean;
};

type Borrador = {
  id: string | null;
  titulo: string;
  categoria: Categoria;
  regla: string;
  ejemplo_mal: string;
  ejemplo_bien: string;
  prioridad: Prioridad;
};

const CATEGORIAS: { value: Categoria; label: string }[] = [
  { value: "general", label: "General" },
  { value: "diseno", label: "Diseño" },
  { value: "textos", label: "Textos" },
  { value: "negocio", label: "Negocio" },
  { value: "codigo", label: "Código" },
  { value: "seguridad", label: "Seguridad" },
  { value: "seo", label: "SEO" },
  { value: "panel", label: "Panel" },
];

const PRIORIDADES: { value: Prioridad; label: string }[] = [
  { value: 1, label: "Imprescindible" },
  { value: 2, label: "Importante" },
  { value: 3, label: "Preferencia" },
];

const BORRADOR_VACIO: Borrador = {
  id: null,
  titulo: "",
  categoria: "general",
  regla: "",
  ejemplo_mal: "",
  ejemplo_bien: "",
  prioridad: 2,
};

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
  danger: "#B91C1C",
  dangerBg: "#FFE4E6",
  warn: "#B45309",
  warnBg: "#FEF3C7",
};

const COLOR_PRIORIDAD: Record<Prioridad, { fg: string; bg: string }> = {
  1: { fg: COLORS.danger, bg: COLORS.dangerBg },
  2: { fg: COLORS.warn, bg: COLORS.warnBg },
  3: { fg: COLORS.accentDark, bg: COLORS.accent2 },
};

const labelCategoria = (c: Categoria) => CATEGORIAS.find((x) => x.value === c)?.label ?? c;
const labelPrioridad = (p: Prioridad) => PRIORIDADES.find((x) => x.value === p)?.label ?? String(p);

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

// Igual que en Redes sociales: en web, centra el campo enfocado para que el teclado móvil
// no lo tape.
function scrollFieldIntoView(e: any) {
  if (Platform.OS !== "web") return;
  const node = e?.target;
  if (node && typeof node.scrollIntoView === "function") {
    node.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function fmtFecha(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

// Error de "la tabla no existe" (la migración aún no se ha aplicado en Supabase).
function esTablaInexistente(e: any) {
  const code = String(e?.code ?? "");
  const message = String(e?.message ?? "");
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    (/aprendizajes/.test(message) && /does not exist|not find/i.test(message))
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({
        paddingVertical: 7,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: active ? COLORS.accent : COLORS.cardSoft,
        borderWidth: 1,
        borderColor: active ? COLORS.accent : COLORS.border,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: active ? "#FFFFFF" : COLORS.text, fontWeight: "800", fontSize: 12.5 }}>{label}</Text>
    </Pressable>
  );
}

const inputStyle = {
  borderWidth: 1,
  borderColor: COLORS.border,
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 10,
  color: COLORS.text,
  backgroundColor: COLORS.cardSoft,
  // 16px: mínimo que evita el zoom automático de Safari/iOS al enfocar.
  fontSize: 16,
} as const;

export default function AdminAprendizajes() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const pagePadding = isMobile ? 12 : 16;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [items, setItems] = useState<Aprendizaje[]>([]);

  const [filtroCategoria, setFiltroCategoria] = useState<Categoria | "todas">("todas");
  const [verDesactivadas, setVerDesactivadas] = useState(false);

  const [borrador, setBorrador] = useState<Borrador>(BORRADOR_VACIO);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const { data, error } = await supabase
        .from("aprendizajes")
        .select("id,created_at,updated_at,titulo,categoria,regla,ejemplo_mal,ejemplo_bien,prioridad,activa")
        .order("activa", { ascending: false })
        .order("prioridad", { ascending: true })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      setItems((data ?? []) as Aprendizaje[]);
    } catch (e: any) {
      console.error("Error cargando el Centro de Aprendizajes:", e);
      setLoadErr(
        esTablaInexistente(e)
          ? "Falta crear la tabla en Supabase: aplica la migración 20261012150000_centro_aprendizajes.sql."
          : "No se han podido cargar las lecciones. Comprueba tu conexión e inténtalo de nuevo."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visibles = useMemo(
    () =>
      items.filter(
        (a) => (verDesactivadas || a.activa) && (filtroCategoria === "todas" || a.categoria === filtroCategoria)
      ),
    [items, verDesactivadas, filtroCategoria]
  );
  const totalActivas = useMemo(() => items.filter((a) => a.activa).length, [items]);

  function editar(a: Aprendizaje) {
    setBorrador({
      id: a.id,
      titulo: a.titulo,
      categoria: a.categoria,
      regla: a.regla,
      ejemplo_mal: a.ejemplo_mal ?? "",
      ejemplo_bien: a.ejemplo_bien ?? "",
      prioridad: a.prioridad,
    });
    setMsg(null);
    // El formulario está arriba: se sube para que se vea lo que se va a editar.
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  async function guardar() {
    const titulo = borrador.titulo.trim();
    const regla = borrador.regla.trim();
    if (titulo.length < 3 || regla.length < 3) {
      setMsg({ type: "error", text: "Escribe al menos un título y la regla a seguir." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const fila = {
        titulo,
        categoria: borrador.categoria,
        regla,
        ejemplo_mal: borrador.ejemplo_mal.trim() || null,
        ejemplo_bien: borrador.ejemplo_bien.trim() || null,
        prioridad: borrador.prioridad,
      };
      const { error } = borrador.id
        ? await supabase.from("aprendizajes").update(fila).eq("id", borrador.id)
        : await supabase.from("aprendizajes").insert({ ...fila, activa: true });
      if (error) throw error;
      setMsg({ type: "ok", text: borrador.id ? "Lección actualizada." : "Lección guardada. Claude la aplicará desde ahora." });
      setBorrador(BORRADOR_VACIO);
      await load();
    } catch (e: any) {
      console.error("Error guardando la lección:", e);
      setMsg({ type: "error", text: "No se ha podido guardar. Inténtalo de nuevo." });
    } finally {
      setSaving(false);
    }
  }

  async function cambiarActiva(a: Aprendizaje, activa: boolean) {
    setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, activa } : x)));
    const { error } = await supabase.from("aprendizajes").update({ activa }).eq("id", a.id);
    if (error) {
      console.error("Error cambiando el estado de la lección:", error);
      setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, activa: !activa } : x)));
      setMsg({ type: "error", text: "No se ha podido cambiar el estado. Inténtalo de nuevo." });
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      {/* Cabecera fija y compacta (volver al panel + título centrado), igual en todo el panel. */}
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
        <View style={{ width: "100%", maxWidth: 860, alignSelf: "center", minHeight: 40, justifyContent: "center" }}>
          <Pressable
            onPress={smartBackAdminHome}
            accessibilityRole="button"
            accessibilityLabel="Volver al panel"
            hitSlop={8}
            style={({ pressed }) => ({
              position: "absolute",
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
            Centro De Aprendizajes
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: pagePadding, paddingBottom: 48 + insets.bottom, alignItems: "center" }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={CIERRE_TECLADO}
        >
        <View style={{ width: "100%", maxWidth: 860, gap: 16 }}>
          <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
            Lo que le corriges a Claude. Lo consulta antes de cada cambio que le pidas · {totalActivas} activas
          </Text>

          {/* Formulario: nueva lección o edición de una existente. */}
          <View style={{ borderRadius: 20, backgroundColor: COLORS.card, padding: isMobile ? 14 : 18, gap: 10 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>
              {borrador.id ? "Editar lección" : "Nueva lección"}
            </Text>

            <TextInput
              value={borrador.titulo}
              onChangeText={(titulo) => setBorrador((b) => ({ ...b, titulo }))}
              onFocus={scrollFieldIntoView}
              placeholder="Título corto (p. ej. «Nunca pongas textos en inglés»)"
              placeholderTextColor="rgba(11,33,56,0.40)"
              maxLength={140}
              style={inputStyle}
            />

            <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12.5 }}>Categoría</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {CATEGORIAS.map((c) => (
                <Chip
                  key={c.value}
                  label={c.label}
                  active={borrador.categoria === c.value}
                  onPress={() => setBorrador((b) => ({ ...b, categoria: c.value }))}
                />
              ))}
            </View>

            <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12.5 }}>Prioridad</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {PRIORIDADES.map((p) => (
                <Chip
                  key={p.value}
                  label={p.label}
                  active={borrador.prioridad === p.value}
                  onPress={() => setBorrador((b) => ({ ...b, prioridad: p.value }))}
                />
              ))}
            </View>

            <TextInput
              value={borrador.regla}
              onChangeText={(regla) => setBorrador((b) => ({ ...b, regla }))}
              onFocus={scrollFieldIntoView}
              placeholder="La regla: qué debe hacer (o no hacer) Claude a partir de ahora"
              placeholderTextColor="rgba(11,33,56,0.40)"
              multiline
              maxLength={4000}
              style={[inputStyle, { minHeight: 90, textAlignVertical: "top" }]}
            />
            <TextInput
              value={borrador.ejemplo_mal}
              onChangeText={(ejemplo_mal) => setBorrador((b) => ({ ...b, ejemplo_mal }))}
              onFocus={scrollFieldIntoView}
              placeholder="Opcional: cómo estaba mal"
              placeholderTextColor="rgba(11,33,56,0.40)"
              multiline
              maxLength={2000}
              style={[inputStyle, { minHeight: 56, textAlignVertical: "top" }]}
            />
            <TextInput
              value={borrador.ejemplo_bien}
              onChangeText={(ejemplo_bien) => setBorrador((b) => ({ ...b, ejemplo_bien }))}
              onFocus={scrollFieldIntoView}
              placeholder="Opcional: cómo debe quedar"
              placeholderTextColor="rgba(11,33,56,0.40)"
              multiline
              maxLength={2000}
              style={[inputStyle, { minHeight: 56, textAlignVertical: "top" }]}
            />

            {!!msg && (
              <Text
                style={{
                  color: msg.type === "ok" ? COLORS.success : COLORS.danger,
                  fontWeight: "800",
                  fontSize: 12.5,
                  textAlign: "center",
                }}
              >
                {msg.text}
              </Text>
            )}

            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={guardar}
                disabled={saving}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  flex: 1,
                  opacity: pressed || saving ? 0.75 : 1,
                  paddingVertical: 12,
                  borderRadius: 14,
                  backgroundColor: COLORS.accentDark,
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 8,
                })}
              >
                {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
                <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>
                  {saving ? "Guardando…" : borrador.id ? "Guardar cambios" : "Guardar lección"}
                </Text>
              </Pressable>
              {borrador.id ? (
                <Pressable
                  onPress={() => {
                    setBorrador(BORRADOR_VACIO);
                    setMsg(null);
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.85 : 1,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderRadius: 14,
                    backgroundColor: COLORS.cardSoft,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    alignItems: "center",
                    justifyContent: "center",
                  })}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 14 }}>Cancelar</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Filtros. */}
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
              <Chip label="Todas" active={filtroCategoria === "todas"} onPress={() => setFiltroCategoria("todas")} />
              {CATEGORIAS.map((c) => (
                <Chip
                  key={c.value}
                  label={c.label}
                  active={filtroCategoria === c.value}
                  onPress={() => setFiltroCategoria(c.value)}
                />
              ))}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Switch
                value={verDesactivadas}
                onValueChange={setVerDesactivadas}
                trackColor={{ false: "#D9E3EC", true: COLORS.accentBorder }}
                thumbColor={verDesactivadas ? COLORS.accent : "#F4F4F5"}
              />
              <Text style={{ color: COLORS.muted, fontWeight: "700" }}>Mostrar también las desactivadas</Text>
            </View>
          </View>

          {loading ? (
            <View style={{ alignItems: "center", paddingVertical: 24 }}>
              <CargaMarca texto="Cargando lecciones…" />
            </View>
          ) : loadErr ? (
            <View style={{ borderRadius: 14, backgroundColor: COLORS.dangerBg, padding: 12, gap: 8, alignItems: "center" }}>
              <Text style={{ color: COLORS.danger, fontWeight: "800", lineHeight: 20, textAlign: "center" }}>{loadErr}</Text>
              <Pressable onPress={load} accessibilityRole="button">
                <Text style={{ color: COLORS.danger, fontWeight: "900", textDecorationLine: "underline", textAlign: "center" }}>
                  Reintentar
                </Text>
              </Pressable>
            </View>
          ) : visibles.length === 0 ? (
            <View style={{ paddingVertical: 24, paddingHorizontal: 12, alignItems: "center", gap: 6 }}>
              <Ionicons name="school-outline" size={22} color={COLORS.muted2} />
              <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 20 }}>
                Aún no hay lecciones aquí. Cada vez que corrijas algo a Claude, guárdalo arriba para que no vuelva a
                pasar.
              </Text>
            </View>
          ) : (
            visibles.map((a) => {
              const colorP = COLOR_PRIORIDAD[a.prioridad];
              return (
                <View
                  key={a.id}
                  style={{
                    borderRadius: 20,
                    backgroundColor: COLORS.card,
                    padding: isMobile ? 14 : 18,
                    gap: 8,
                    opacity: a.activa ? 1 : 0.55,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 15.5, flex: 1 }}>{a.titulo}</Text>
                    <Switch
                      value={a.activa}
                      onValueChange={(v) => cambiarActiva(a, v)}
                      trackColor={{ false: "#D9E3EC", true: COLORS.accentBorder }}
                      thumbColor={a.activa ? COLORS.accent : "#F4F4F5"}
                    />
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    <View style={{ borderRadius: 999, backgroundColor: colorP.bg, paddingVertical: 3, paddingHorizontal: 9 }}>
                      <Text style={{ color: colorP.fg, fontWeight: "900", fontSize: 11.5 }}>
                        {labelPrioridad(a.prioridad)}
                      </Text>
                    </View>
                    <View style={{ borderRadius: 999, backgroundColor: COLORS.accent2, paddingVertical: 3, paddingHorizontal: 9 }}>
                      <Text style={{ color: COLORS.accentDark, fontWeight: "900", fontSize: 11.5 }}>
                        {labelCategoria(a.categoria)}
                      </Text>
                    </View>
                    <Text style={{ color: COLORS.muted2, fontSize: 11.5, alignSelf: "center" }}>
                      Actualizada el {fmtFecha(a.updated_at)}
                    </Text>
                  </View>
                  <Text style={{ color: COLORS.text, lineHeight: 21 }}>{a.regla}</Text>
                  {a.ejemplo_mal ? (
                    <Text style={{ color: COLORS.danger, lineHeight: 19, fontSize: 13 }}>✗ {a.ejemplo_mal}</Text>
                  ) : null}
                  {a.ejemplo_bien ? (
                    <Text style={{ color: COLORS.success, lineHeight: 19, fontSize: 13 }}>✓ {a.ejemplo_bien}</Text>
                  ) : null}
                  <Pressable
                    onPress={() => editar(a)}
                    accessibilityRole="button"
                    accessibilityLabel={`Editar la lección ${a.titulo}`}
                    style={({ pressed }) => ({ alignSelf: "flex-start", opacity: pressed ? 0.7 : 1, paddingVertical: 4 })}
                  >
                    <Text style={{ color: COLORS.accentDark, fontWeight: "900" }}>Editar</Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
