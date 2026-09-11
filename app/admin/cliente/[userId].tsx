// app/admin/cliente/[userId].tsx
/**
 * Qué hace: "ficha de cliente" dentro del panel admin — la pantalla a la que
 * lleva cada fila de app/admin/users.tsx. Junta en un solo sitio todo lo
 * útil que la tienda sabe de esa persona: qué le hemos comprado (product_sales),
 * qué nos ha intentado vender (sell_requests) y qué servicio de reparación
 * ha contratado (service_requests), más un cuadro de notas libres para
 * cualquier otra cosa (intercambios, garantías, acuerdos puntuales) que no
 * encaje en ninguna tabla concreta.
 *
 * Cómo funciona:
 * - user_id, email y fecha de alta llegan como parámetros de navegación
 *   desde app/admin/users.tsx (ya los tenía cargados de
 *   admin_list_users_with_stats, así que no hace falta pedirlos otra vez).
 * - Compras: product_sales donde buyer_user_id = este cliente. Servicio ya
 *   guarda una "foto fija" del producto (product_title/product_image), así
 *   que se ve igual aunque el producto se haya editado o borrado después.
 * - Ventas a la tienda: sell_requests donde customer_user_id = este cliente.
 *   OJO: esta columna solo se rellena si la persona tenía sesión iniciada AL
 *   ENVIAR el formulario "Vender ahora" (ver
 *   set_request_customer_user_id() en la migración) — las solicitudes
 *   anónimas de antes de este cambio, o enviadas sin iniciar sesión, no
 *   aparecerán aquí aunque sean de este cliente.
 * - Servicio de reparación: service_requests donde customer_user_id = este
 *   cliente. Misma limitación que arriba (solo con sesión iniciada al
 *   enviar).
 * - Notas internas: tabla customer_notes (una fila por cliente, clave
 *   primaria customer_user_id). Es un cuadro de texto libre pensado para
 *   todo lo que NO tiene una tabla propia: intercambios, garantías dadas de
 *   palabra, acuerdos concretos con ese cliente... Se guarda entera de una
 *   vez al pulsar "Guardar nota" (no autoguardado), y queda registrado quién
 *   la actualizó por última vez y cuándo.
 *
 * Conectado con:
 * - app/admin/users.tsx → navega aquí al tocar una fila de la lista.
 * - app/admin/_layout.tsx → registra esta ruta ("cliente/[userId]").
 * - Migración de Supabase (no hay ya un .sql local por cada cambio, ver
 *   sql/README.md): customer_notes, sell_requests.customer_user_id,
 *   service_requests.customer_user_id.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../../lib/supabase";

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
  accentDark: "#0F8FCC",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  success: "#15803D",
  successBg: "#DCFCE7",
  successBorder: "#86EFAC",
  warn: "#92660B",
  warnBg: "rgba(245,158,11,0.14)",
  warnBorder: "rgba(245,158,11,0.30)",
  danger: "#B91C1C",
  dangerBg: "#FFE4E6",
};

type PurchaseRow = {
  id: string;
  created_at: string;
  product_title: string;
  product_condition: string;
  product_image: string;
  source: string;
};

type SellRequestRow = {
  id: string;
  created_at: string;
  articulo: string;
  precio_estimado: string;
  status: string;
  ciudad: string;
};

type ServiceRequestRow = {
  id: string;
  created_at: string;
  service_title: string;
  status: string;
  ciudad: string;
};

const STATUS_LABEL: Record<string, { label: string; tone: "neutral" | "warn" | "success" | "danger" }> = {
  nuevo: { label: "Nuevo", tone: "warn" },
  revisado: { label: "Revisado", tone: "neutral" },
  contactado: { label: "Contactado", tone: "success" },
  descartado: { label: "Descartado", tone: "danger" },
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function StatusPill({ status }: { status: string }) {
  const meta = STATUS_LABEL[status] ?? { label: status, tone: "neutral" as const };
  const palette = {
    neutral: { bg: COLORS.cardSoft, border: COLORS.border, text: COLORS.text },
    warn: { bg: COLORS.warnBg, border: COLORS.warnBorder, text: COLORS.warn },
    success: { bg: COLORS.successBg, border: COLORS.successBorder, text: COLORS.success },
    danger: { bg: COLORS.dangerBg, border: "#FDA4AF", text: COLORS.danger },
  }[meta.tone];

  return (
    <View
      style={{
        borderRadius: 999,
        paddingVertical: 4,
        paddingHorizontal: 9,
        backgroundColor: palette.bg,
        borderWidth: 1,
        borderColor: palette.border,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ color: palette.text, fontWeight: "900", fontSize: 11 }}>{meta.label}</Text>
    </View>
  );
}

function SectionCard({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <View style={{ borderRadius: 18, backgroundColor: COLORS.card, padding: 14, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            backgroundColor: COLORS.accent2,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={icon} size={16} color={COLORS.accentDark} />
        </View>
        <Text style={{ flex: 1, color: COLORS.text, fontWeight: "900", fontSize: 14.5 }}>{title}</Text>
        <Text style={{ color: COLORS.muted2, fontSize: 12, fontWeight: "700" }}>{count}</Text>
      </View>
      {children}
    </View>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <Text style={{ color: COLORS.muted, fontSize: 12.5, fontStyle: "italic", paddingVertical: 4 }}>{text}</Text>
  );
}

export default function ClienteFicha() {
  const params = useLocalSearchParams<{ userId: string; email?: string; createdAt?: string }>();
  const userId = String(params.userId ?? "").trim();
  const email = typeof params.email === "string" ? params.email : "";
  const createdAt = typeof params.createdAt === "string" ? params.createdAt : "";

  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [sellRequests, setSellRequests] = useState<SellRequestRow[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequestRow[]>([]);

  const [notes, setNotes] = useState("");
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [notesUpdatedAt, setNotesUpdatedAt] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [salesRes, sellRes, serviceRes, notesRes] = await Promise.all([
        supabase
          .from("product_sales")
          .select("id,created_at,product_title,product_condition,product_image,source")
          .eq("buyer_user_id", userId)
          .order("created_at", { ascending: false }),
        supabase
          .from("sell_requests")
          .select("id,created_at,articulo,precio_estimado,status,ciudad")
          .eq("customer_user_id", userId)
          .order("created_at", { ascending: false }),
        supabase
          .from("service_requests")
          .select("id,created_at,service_title,status,ciudad")
          .eq("customer_user_id", userId)
          .order("created_at", { ascending: false }),
        supabase
          .from("customer_notes")
          .select("notes,updated_at")
          .eq("customer_user_id", userId)
          .maybeSingle<{ notes: string; updated_at: string }>(),
      ]);

      setPurchases((salesRes.data ?? []) as PurchaseRow[]);
      setSellRequests((sellRes.data ?? []) as SellRequestRow[]);
      setServiceRequests((serviceRes.data ?? []) as ServiceRequestRow[]);
      setNotes(notesRes.data?.notes ?? "");
      setNotesUpdatedAt(notesRes.data?.updated_at ?? null);
      setNotesLoaded(true);
    } catch (e) {
      console.error("Error cargando la ficha del cliente:", e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSaveNotes() {
    if (!userId || savingNotes) return;
    setSavingNotes(true);
    setNotesSaved(false);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const adminId = sessionData.session?.user?.id ?? null;

      const { error } = await supabase.from("customer_notes").upsert({
        customer_user_id: userId,
        notes,
        updated_by: adminId,
      });
      if (error) throw error;

      setNotesUpdatedAt(new Date().toISOString());
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2200);
    } catch (e) {
      console.error("Error guardando la nota del cliente:", e);
    } finally {
      setSavingNotes(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingHorizontal: 16,
            paddingVertical: Platform.OS === "web" ? 12 : 8,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
            backgroundColor: COLORS.bg2,
          }}
        >
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/admin/users"))}
            style={({ pressed }) => ({
              opacity: pressed ? 0.85 : 1,
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Ionicons name="chevron-back" size={22} color={COLORS.text} />
          </Pressable>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
              {email || "Ficha de cliente"}
            </Text>
            {createdAt ? (
              <Text style={{ color: COLORS.muted2, fontSize: 12 }}>Cliente desde {fmtDate(createdAt)}</Text>
            ) : null}
          </View>
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
            <ActivityIndicator color={COLORS.text} />
            <Text style={{ color: COLORS.muted }}>Cargando ficha…</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, alignItems: "center" }}>
            <View style={{ width: "100%", maxWidth: 720, gap: 12 }}>
              <SectionCard icon="bag-check-outline" title="Compras a la tienda" count={purchases.length}>
                {purchases.length === 0 ? (
                  <EmptyRow text="Todavía no le hemos vendido nada." />
                ) : (
                  <View style={{ gap: 8 }}>
                    {purchases.map((p) => (
                      <View
                        key={p.id}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                          borderRadius: 12,
                          backgroundColor: COLORS.cardSoft,
                          padding: 10,
                        }}
                      >
                        {p.product_image ? (
                          <Image
                            source={{ uri: p.product_image }}
                            style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.card }}
                          />
                        ) : (
                          <View
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 10,
                              backgroundColor: COLORS.card,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Ionicons name="cube-outline" size={16} color={COLORS.muted} />
                          </View>
                        )}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: "800", fontSize: 13 }}>
                            {p.product_title || "Producto"}
                          </Text>
                          <Text numberOfLines={1} style={{ color: COLORS.muted, fontSize: 11.5 }}>
                            {p.product_condition ? `${p.product_condition} · ` : ""}
                            {p.source === "comprar_ya" ? "Comprar ya" : "Marcado a mano"}
                          </Text>
                        </View>
                        <Text style={{ color: COLORS.muted2, fontSize: 11 }}>{fmtDate(p.created_at)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </SectionCard>

              <SectionCard icon="pricetag-outline" title="Ventas a la tienda" count={sellRequests.length}>
                {sellRequests.length === 0 ? (
                  <EmptyRow text="No nos ha intentado vender nada (con sesión iniciada)." />
                ) : (
                  <View style={{ gap: 8 }}>
                    {sellRequests.map((s) => (
                      <View key={s.id} style={{ borderRadius: 12, backgroundColor: COLORS.cardSoft, padding: 10, gap: 4 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text numberOfLines={1} style={{ flex: 1, color: COLORS.text, fontWeight: "800", fontSize: 13 }}>
                            {s.articulo}
                          </Text>
                          <Text style={{ color: COLORS.muted2, fontSize: 11 }}>{fmtDate(s.created_at)}</Text>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <StatusPill status={s.status} />
                          <Text style={{ color: COLORS.muted, fontSize: 11.5 }}>
                            {s.precio_estimado} · {s.ciudad}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </SectionCard>

              <SectionCard icon="construct-outline" title="Servicio de reparación" count={serviceRequests.length}>
                {serviceRequests.length === 0 ? (
                  <EmptyRow text="No ha contratado ningún servicio (con sesión iniciada)." />
                ) : (
                  <View style={{ gap: 8 }}>
                    {serviceRequests.map((s) => (
                      <View key={s.id} style={{ borderRadius: 12, backgroundColor: COLORS.cardSoft, padding: 10, gap: 4 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text numberOfLines={1} style={{ flex: 1, color: COLORS.text, fontWeight: "800", fontSize: 13 }}>
                            {s.service_title}
                          </Text>
                          <Text style={{ color: COLORS.muted2, fontSize: 11 }}>{fmtDate(s.created_at)}</Text>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <StatusPill status={s.status} />
                          <Text style={{ color: COLORS.muted, fontSize: 11.5 }}>{s.ciudad}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </SectionCard>

              <View style={{ borderRadius: 18, backgroundColor: COLORS.card, padding: 14, gap: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      backgroundColor: COLORS.accent2,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="document-text-outline" size={16} color={COLORS.accentDark} />
                  </View>
                  <Text style={{ flex: 1, color: COLORS.text, fontWeight: "900", fontSize: 14.5 }}>
                    Notas internas
                  </Text>
                </View>

                <Text style={{ color: COLORS.muted, fontSize: 12, lineHeight: 17 }}>
                  Para todo lo que no encaja arriba: intercambios, garantías, acuerdos concretos con
                  este cliente… Solo la ve el equipo de la tienda.
                </Text>

                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  editable={notesLoaded}
                  multiline
                  placeholder="Escribe aquí cualquier detalle útil sobre este cliente…"
                  placeholderTextColor="rgba(11,33,56,0.40)"
                  style={{
                    minHeight: 110,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    borderRadius: 14,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: COLORS.text,
                    backgroundColor: COLORS.cardSoft,
                    fontSize: 14,
                    textAlignVertical: "top",
                  }}
                />

                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Pressable
                    onPress={handleSaveNotes}
                    disabled={savingNotes || !notesLoaded}
                    style={({ pressed }) => ({
                      opacity: savingNotes || !notesLoaded ? 0.6 : pressed ? 0.88 : 1,
                      borderRadius: 999,
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      backgroundColor: COLORS.accent,
                    })}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 13 }}>
                      {savingNotes ? "Guardando…" : "Guardar nota"}
                    </Text>
                  </Pressable>

                  {notesSaved ? (
                    <Text style={{ color: COLORS.success, fontWeight: "800", fontSize: 12.5 }}>Guardado ✓</Text>
                  ) : notesUpdatedAt ? (
                    <Text style={{ color: COLORS.muted2, fontSize: 11.5 }}>
                      Última actualización: {fmtDate(notesUpdatedAt)}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}
