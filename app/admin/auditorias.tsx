// app/admin/auditorias.tsx
/**
 * Qué hace: pantalla de administración «Revisiones»: el registro de las revisiones de calidad web
 * automáticas de la tienda (la lista de 20 puntos). Cada fila dice cuándo se hizo, cuántos puntos
 * salieron bien, con aviso o con fallo, qué se cambió (nada: la revisión automática solo lee) y,
 * al tocarla, el detalle punto por punto.
 *
 * Cómo funciona:
 * - Lee la tabla «auditorias_web» (RLS: solo el administrador). La escribe api/auditoria-web.ts,
 *   que lanza el cron de Vercel los días 1 y 15 de cada mes (≈ cada dos semanas).
 * - Los puntos «manual» necesitan un navegador o leer el código: los repasa Claude en sus
 *   sesiones cuando han pasado más de 14 días desde la última revisión.
 *
 * Conectado con: api/auditoria-web.ts, app/admin/index.tsx (tarjeta), app/admin/_layout.tsx.
 */
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StatusBar, Text, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import CargaMarca from "../../components/marca/CargaMarca";

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  ok: "#15803D",
  aviso: "#92660B",
  fallo: "#B91C1C",
  danger: "#B91C1C",
  dangerBg: "#FFE4E6",
};

type Punto = { n: number; nombre: string; estado: "ok" | "aviso" | "fallo" | "manual"; detalle: string };
type Fila = {
  id: string;
  ejecutada_en: string;
  origen: string;
  resumen: string;
  ok: number;
  avisos: number;
  fallos: number;
  manuales: number;
  duracion_ms: number;
  cambios: string;
  resultado: Punto[];
};

const SIMBOLO: Record<Punto["estado"], { icono: React.ComponentProps<typeof Ionicons>["name"]; color: string; texto: string }> = {
  ok: { icono: "checkmark-circle", color: COLORS.ok, texto: "Bien" },
  aviso: { icono: "alert-circle", color: COLORS.aviso, texto: "Aviso" },
  fallo: { icono: "close-circle", color: COLORS.fallo, texto: "Fallo" },
  manual: { icono: "hand-left-outline", color: COLORS.muted, texto: "Lo revisa Claude" },
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

function fechaMadrid(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function AdminAuditorias() {
  const { width } = useWindowDimensions();
  const isMobile = (width && width > 0 ? width : 1024) < 700;
  const pagePadding = isMobile ? 12 : 16;
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [abierta, setAbierta] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("auditorias_web")
          .select("id,ejecutada_en,origen,resumen,ok,avisos,fallos,manuales,duracion_ms,cambios,resultado")
          .order("ejecutada_en", { ascending: false })
          .limit(24);
        if (error) throw error;
        const lista = (data ?? []) as Fila[];
        setFilas(lista);
        setAbierta(lista[0]?.id ?? null);
      } catch (e) {
        console.error("Error cargando las revisiones:", e);
        setErr("No se han podido cargar las revisiones. Inténtalo de nuevo.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
          <Text style={{ color: COLORS.text, fontSize: isMobile ? 19 : 22, fontWeight: "900", textAlign: "center", paddingHorizontal: 44 }}>Revisiones</Text>
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
        >
          <View style={{ width: "100%", maxWidth: 1040, gap: 16 }}>
            <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
              La tienda se revisa sola los días 1 y 15 de cada mes (sobre las 7 de la mañana), con la lista de 20 puntos de calidad web.
              Aquí queda apuntado cuándo se hizo, qué se miró y qué se encontró. La revisión automática solo lee: no cambia nada.
            </Text>

            {!!err && (
              <View style={{ borderRadius: 14, backgroundColor: COLORS.dangerBg, padding: 10 }}>
                <Text style={{ color: COLORS.danger, fontWeight: "800", lineHeight: 20, textAlign: "center" }}>{err}</Text>
              </View>
            )}

            {filas.length === 0 && !err ? (
              <View style={{ alignItems: "center", gap: 6, paddingVertical: 24, paddingHorizontal: 12 }}>
                <Ionicons name="clipboard-outline" size={24} color={COLORS.muted} />
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>Todavía no hay ninguna revisión.</Text>
                <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>La primera aparecerá el próximo día 1 o 15.</Text>
              </View>
            ) : (
              filas.map((f) => (
                <View key={f.id} style={{ borderRadius: 20, backgroundColor: COLORS.card, padding: isMobile ? 12 : 14, gap: 10 }}>
                  <Pressable onPress={() => setAbierta(abierta === f.id ? null : f.id)} accessibilityRole="button" style={{ gap: 6, alignItems: "center" }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 15, textAlign: "center" }}>{fechaMadrid(f.ejecutada_en)}</Text>
                    <Text style={{ color: COLORS.muted, fontWeight: "700", fontSize: 12.5, textAlign: "center" }}>
                      {f.origen === "manual" ? "Hecha a mano" : "Automática"} · {Math.round(f.duracion_ms / 100) / 10} s
                    </Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
                      <Text style={{ color: COLORS.ok, fontWeight: "900" }}>{f.ok} bien</Text>
                      <Text style={{ color: COLORS.aviso, fontWeight: "900" }}>{f.avisos} avisos</Text>
                      <Text style={{ color: COLORS.fallo, fontWeight: "900" }}>{f.fallos} fallos</Text>
                      <Text style={{ color: COLORS.muted, fontWeight: "900" }}>{f.manuales} los revisa Claude</Text>
                    </View>
                    <Text style={{ color: COLORS.text, lineHeight: 20, textAlign: "center" }}>{f.resumen}</Text>
                    <Text style={{ color: COLORS.muted, fontSize: 12.5, lineHeight: 18, textAlign: "center" }}>Qué se cambió: {f.cambios}</Text>
                    <Ionicons name={abierta === f.id ? "chevron-up" : "chevron-down"} size={18} color={COLORS.muted} />
                  </Pressable>

                  {abierta === f.id ? (
                    <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10 }}>
                      {(Array.isArray(f.resultado) ? f.resultado : []).map((p) => {
                        const s = SIMBOLO[p.estado] ?? SIMBOLO.manual;
                        return (
                          <View key={p.n} style={{ alignItems: "center", gap: 2 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <Ionicons name={s.icono} size={16} color={s.color} />
                              <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>
                                {p.n}. {p.nombre}
                              </Text>
                            </View>
                            <Text style={{ color: COLORS.muted, fontSize: 13, lineHeight: 18, textAlign: "center" }}>
                              {s.texto}: {p.detalle}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
