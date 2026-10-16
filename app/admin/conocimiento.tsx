// app/admin/conocimiento.tsx
/**
 * Qué hace: pantalla de administración de «Lo que Blue sabe de la tienda». Aquí el dueño
 * escribe respuestas reales (horario, plazos de envío, garantía, pagos…) y Blue IA las usa al
 * contestar a los clientes con más precisión. Blue, desde el panel, le propone temas a lo largo
 * del día (components/Campanita.tsx) y también se pueden añadir desde aquí.
 *
 * Cómo funciona:
 * - Lee/escribe la tabla «blue_conocimiento» (tema único, respuesta de hasta 800 caracteres,
 *   activo sí/no). RLS: lectura de las activas para todos, escritura solo admin (is_admin()).
 * - «Blue te propone»: los temas de lib/conocimiento.ts que aún no tienen respuesta; al tocar
 *   uno se abre el formulario con la pregunta de Blue. La respuesta la escribe siempre el dueño:
 *   la app nunca inventa datos del negocio.
 * - Activar/desactivar y borrar: igual que Noticias Flash (cambio optimista, borrado con aviso).
 *
 * Conectado con:
 * - lib/conocimiento.ts → temas propuestos y guardado.
 * - api/blue-ia.ts → lee los temas activos para responder a los clientes.
 * - app/admin/index.tsx → tarjeta de entrada; app/admin/_layout.tsx → registra la ruta.
 */
import React, { useEffect, useMemo, useState } from "react";
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
import { guardarConocimiento, TEMAS_CONOCIMIENTO, type ItemConocimiento } from "../../lib/conocimiento";

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.48)",
  accent: "#1EA7E8",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  danger: "#B91C1C",
  dangerBg: "#FFE4E6",
  dangerBorder: "#FDA4AF",
};

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

export default function AdminConocimiento() {
  const { width } = useWindowDimensions();
  const isMobile = (width && width > 0 ? width : 1024) < 700;
  const pagePadding = isMobile ? 12 : 16;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [screenErr, setScreenErr] = useState<string | null>(null);
  const [items, setItems] = useState<ItemConocimiento[]>([]);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [pregunta, setPregunta] = useState<string | null>(null);
  const [tema, setTema] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [editando, setEditando] = useState(false);
  const [borrar, setBorrar] = useState<ItemConocimiento | null>(null);

  // Temas que Blue propone y aún no tienen respuesta.
  const pendientes = useMemo(() => {
    const hechos = new Set(items.map((i) => i.tema));
    return TEMAS_CONOCIMIENTO.filter((t) => !hechos.has(t.tema));
  }, [items]);

  async function load() {
    setLoading(true);
    setScreenErr(null);
    try {
      const { data, error } = await supabase
        .from("blue_conocimiento")
        .select("id,tema,respuesta,activo,created_at,updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      setItems((data ?? []) as ItemConocimiento[]);
    } catch (e) {
      console.error("Error cargando lo que Blue sabe:", e);
      setScreenErr("No se ha podido cargar la información. Inténtalo de nuevo.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function abrir(t: string, r: string, p: string | null, edit: boolean) {
    setTema(t);
    setRespuesta(r);
    setPregunta(p);
    setEditando(edit);
    setModalErr(null);
    setOpen(true);
  }

  async function guardar() {
    if (saving) return;
    setSaving(true);
    setModalErr(null);
    const error = await guardarConocimiento(tema, respuesta);
    setSaving(false);
    if (error) {
      setModalErr(error);
      return;
    }
    setOpen(false);
    await load();
  }

  async function alternar(row: ItemConocimiento) {
    const antes = items;
    setItems(items.map((x) => (x.id === row.id ? { ...x, activo: !x.activo } : x)));
    const { error } = await supabase.from("blue_conocimiento").update({ activo: !row.activo, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (error) {
      setItems(antes);
      setScreenErr("No se ha podido cambiar. Inténtalo de nuevo.");
    }
  }

  async function borrarConfirmado() {
    const row = borrar;
    if (!row) return;
    setBorrar(null);
    const { error } = await supabase.from("blue_conocimiento").delete().eq("id", row.id);
    if (error) setScreenErr("No se ha podido borrar. Inténtalo de nuevo.");
    await load();
  }

  const boton = (texto: string, onPress: () => void, principal = false) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        borderRadius: 999,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: principal ? COLORS.accent : COLORS.border,
        backgroundColor: principal ? COLORS.accent : "#F6FAFD",
        opacity: pressed ? 0.88 : 1,
      })}
    >
      <Text style={{ color: principal ? "#FFFFFF" : COLORS.text, fontWeight: "900", fontSize: 13.5, textAlign: "center" }}>{texto}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

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
            style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 40, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </Pressable>
          <Text style={{ color: COLORS.text, fontSize: isMobile ? 19 : 22, fontWeight: "900", textAlign: "center", paddingHorizontal: 44 }}>
            Lo que Blue sabe
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <CargaMarca texto="Cargando…" />
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
              Escribe aquí respuestas reales de la tienda. Blue IA las usa para contestar a tus clientes con precisión, sin inventar
              nada.
            </Text>

            {boton("+ Añadir información", () => abrir("", "", null, false), true)}

            {!!screenErr && (
              <View style={{ borderRadius: 14, backgroundColor: COLORS.dangerBg, padding: 10 }}>
                <Text style={{ color: COLORS.danger, fontWeight: "800", lineHeight: 20, textAlign: "center" }}>{screenErr}</Text>
              </View>
            )}

            {pendientes.length ? (
              <View style={{ gap: 10, alignItems: "center" }}>
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 15, textAlign: "center" }}>Blue te propone</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                  {pendientes.map((t) => (
                    <Pressable
                      key={t.tema}
                      onPress={() => abrir(t.tema, "", t.pregunta, false)}
                      style={({ pressed }) => ({
                        borderRadius: 999,
                        paddingVertical: 9,
                        paddingHorizontal: 13,
                        borderWidth: 1,
                        borderColor: COLORS.accentBorder,
                        backgroundColor: COLORS.accent2,
                        opacity: pressed ? 0.85 : 1,
                      })}
                    >
                      <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13 }}>{t.tema}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {items.length === 0 ? (
              <View style={{ alignItems: "center", gap: 6, paddingVertical: 24, paddingHorizontal: 12 }}>
                <Ionicons name="bulb-outline" size={24} color={COLORS.muted2} />
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>Todavía no hay información.</Text>
                <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
                  Toca uno de los temas de Blue o añade lo tuyo.
                </Text>
              </View>
            ) : (
              items.map((row) => (
                <View key={row.id} style={{ borderRadius: 20, backgroundColor: COLORS.card, padding: isMobile ? 12 : 14, gap: 10, opacity: row.activo ? 1 : 0.6 }}>
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 15, textAlign: "center" }}>{row.tema}</Text>
                  <Text style={{ color: COLORS.text, lineHeight: 21, textAlign: "center" }}>{row.respuesta}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Switch value={row.activo} onValueChange={() => alternar(row)} />
                      <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: 13 }}>{row.activo ? "Blue lo usa" : "Oculto"}</Text>
                    </View>
                    {boton("Editar", () => abrir(row.tema, row.respuesta, null, true))}
                    {boton("Borrar", () => setBorrar(row))}
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <Pressable
            onPress={() => setOpen(false)}
            style={{ flex: 1, backgroundColor: "rgba(11,33,56,0.45)", alignItems: "center", justifyContent: "center", padding: 16 }}
          >
            <Pressable
              onPress={() => undefined}
              style={{ width: "100%", maxWidth: 480, backgroundColor: COLORS.bg, borderRadius: 24, padding: 18, gap: 12 }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18, textAlign: "center" }}>
                {editando ? "Editar información" : "Añadir información"}
              </Text>
              {pregunta ? (
                <Text style={{ color: COLORS.accent, fontWeight: "900", lineHeight: 21, textAlign: "center" }}>Blue pregunta: {pregunta}</Text>
              ) : null}
              <TextInput
                value={tema}
                onChangeText={setTema}
                editable={!editando && !pregunta}
                placeholder="Tema (ej.: Horario de atención)"
                maxLength={80}
                style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, textAlign: "center", color: COLORS.text, backgroundColor: COLORS.card }}
              />
              <TextInput
                value={respuesta}
                onChangeText={setRespuesta}
                placeholder="Escribe la respuesta real"
                multiline
                maxLength={800}
                style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 12, minHeight: 110, textAlign: "center", color: COLORS.text, backgroundColor: COLORS.card }}
              />
              <Text style={{ color: COLORS.muted2, fontSize: 12, textAlign: "center" }}>{respuesta.length} / 800</Text>
              {!!modalErr && <Text style={{ color: COLORS.danger, fontWeight: "800", textAlign: "center" }}>{modalErr}</Text>}
              <View style={{ flexDirection: "row", gap: 10, justifyContent: "center" }}>
                {boton("Cancelar", () => setOpen(false))}
                {boton(saving ? "Guardando…" : "Guardar", guardar, true)}
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!borrar} transparent animationType="fade" onRequestClose={() => setBorrar(null)}>
        <Pressable
          onPress={() => setBorrar(null)}
          style={{ flex: 1, backgroundColor: "rgba(11,33,56,0.45)", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <Pressable onPress={() => undefined} style={{ width: "100%", maxWidth: 420, backgroundColor: COLORS.bg, borderRadius: 24, padding: 18, gap: 12 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 17, textAlign: "center" }}>¿Borrar «{borrar?.tema}»?</Text>
            <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 20 }}>Blue dejará de usar esta información.</Text>
            <View style={{ flexDirection: "row", gap: 10, justifyContent: "center" }}>
              {boton("Cancelar", () => setBorrar(null))}
              {boton("Borrar", borrarConfirmado, true)}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
