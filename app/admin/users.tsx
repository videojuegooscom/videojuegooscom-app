// app/admin/users.tsx
/**
 * Qué hace: pantalla de administración "Usuarios y participación". Lista los
 * usuarios registrados en la app (con su email y fecha de alta) y cuánto
 * participan: mensajes en el Foro, chats de producto que han iniciado y
 * reseñas que han escrito. También muestra, aparte, el volumen total de
 * solicitudes de venta y de servicio (esos formularios no exigen sesión
 * iniciada, así que no se pueden atribuir a un usuario registrado concreto)
 * y la valoración media de la tienda.
 *
 * Cómo funciona:
 * - La lista de usuarios con sus contadores sale de UNA sola llamada RPC,
 *   admin_list_users_with_stats() (ver migración
 *   create_admin_list_users_with_stats en Supabase): es una función
 *   SECURITY DEFINER que primero comprueba is_admin() (si no eres admin,
 *   lanza una excepción y no devuelve nada) y solo entonces lee auth.users
 *   para sacar el email de cada perfil — el cliente nunca necesita ni ve la
 *   service role key, y el guardado de la función impide que cualquier otra
 *   persona autenticada la use para sacar la lista de emails.
 * - "Solicitudes de venta" y "Solicitudes de servicio" son recuentos aparte
 *   (sell_requests / service_requests): el formulario se puede enviar sin
 *   haber iniciado sesión, así que el total de aquí arriba incluye también
 *   las anónimas. Las que SÍ se enviaron con sesión iniciada quedan
 *   atribuidas a esa persona (customer_user_id) y aparecen dentro de su
 *   ficha de cliente (app/admin/cliente/[userId].tsx).
 * - "Valoración media" sale de store_reviews (rating 1-5, visible a
 *   cualquiera igual que las reseñas de Inicio).
 * - Buscador: filtra la lista ya cargada por email (no vuelve a pedir nada a
 *   Supabase, la lista de usuarios registrados no suele ser tan grande).
 * - Orden: por fecha de alta (más recientes primero, por defecto) o por
 *   participación total (suma de los tres contadores), para ver primero a
 *   quien más interactúa con la tienda.
 *
 * - Cada fila es pulsable: lleva a la "ficha de cliente"
 *   (app/admin/cliente/[userId].tsx), que junta compras, ventas a la tienda,
 *   servicios de reparación y un cuadro de notas internas para ese usuario.
 *   Se le pasan email y fecha de alta como parámetros de navegación para que
 *   esa pantalla no tenga que volver a pedirlos.
 *
 * Conectado con:
 * - lib/supabase.ts → cliente para la RPC y las consultas de recuento.
 * - sql (migración) admin_list_users_with_stats → función que agrega todo.
 * - app/admin/index.tsx → tarjeta "Usuarios y participación" que lleva aquí.
 * - app/admin/cliente/[userId].tsx → ficha de cliente a la que lleva cada fila.
 * - app/admin/_layout.tsx → registra esta ruta ("users") en el Stack.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
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
  // Azul oscuro de la tienda (el mismo del botón "Comprar"/"Confirmar pedido").
  accentDark: "#1EA7E8",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  success: "#15803D",
  successBg: "#DCFCE7",
  successBorder: "#86EFAC",
  danger: "#B91C1C",
  dangerBg: "#FFE4E6",
  dangerBorder: "#FDA4AF",
};

type UserRow = {
  user_id: string;
  email: string | null;
  role: string | null;
  created_at: string;
  chat_messages_count: number;
  product_chats_count: number;
  store_reviews_count: number;
};

type SortMode = "recent" | "participation";

// "on-drag" en web cierra el teclado con CUALQUIER desplazamiento, también el que hace el
// propio navegador al enfocar un campo (el campo se cerraba solo): solo se usa en nativo.
const CIERRE_TECLADO: "none" | "on-drag" = Platform.OS === "web" ? "none" : "on-drag";

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

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric" });
}

function totalParticipation(u: UserRow) {
  return u.chat_messages_count + u.product_chats_count + u.store_reviews_count;
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
        width: isMobile ? "48.5%" : "23.5%",
        borderRadius: 16,
        backgroundColor: COLORS.cardSoft,
        padding: isMobile ? 12 : 14,
        alignItems: "center",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%" }}>
        {icon ? <Ionicons name={icon} size={13} color={COLORS.muted2} /> : null}
        <Text style={{ color: COLORS.muted2, fontWeight: "700", fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
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
  active,
  isMobile,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  isMobile?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 999,
        paddingVertical: 9,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: active ? COLORS.accentBorder : COLORS.border,
        backgroundColor: active ? COLORS.accent2 : "#F6FAFD",
        opacity: pressed ? 0.88 : 1,
      })}
    >
      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: isMobile ? 12.5 : 13 }}>{label}</Text>
    </Pressable>
  );
}

function MetricPill({ icon, label, value }: { icon: IoniconName; label: string; value: number }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: "#F6FAFD",
      }}
    >
      <Ionicons name={icon} size={13} color={COLORS.accentDark} />
      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
        {value} {label}
      </Text>
    </View>
  );
}

export default function AdminUsers() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const pagePadding = isMobile ? 12 : 16;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [screenErr, setScreenErr] = useState<string | null>(null);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [sellRequestsCount, setSellRequestsCount] = useState(0);
  const [serviceRequestsCount, setServiceRequestsCount] = useState(0);
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [reviewsCount, setReviewsCount] = useState(0);

  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");

  const load = useCallback(async () => {
    setLoading(true);
    setScreenErr(null);

    try {
      const [usersRes, sellRes, serviceRes, reviewsRes] = await Promise.all([
        supabase.rpc("admin_list_users_with_stats"),
        supabase.from("sell_requests").select("id", { count: "exact", head: true }),
        supabase.from("service_requests").select("id", { count: "exact", head: true }),
        supabase.from("store_reviews").select("rating"),
      ]);

      if (usersRes.error) throw usersRes.error;
      if (sellRes.error) throw sellRes.error;
      if (serviceRes.error) throw serviceRes.error;
      if (reviewsRes.error) throw reviewsRes.error;

      setUsers(
        (Array.isArray(usersRes.data) ? usersRes.data : []).map((r: any) => ({
          user_id: String(r.user_id ?? ""),
          email: typeof r.email === "string" ? r.email : null,
          role: typeof r.role === "string" ? r.role : null,
          created_at: String(r.created_at ?? ""),
          chat_messages_count: Number(r.chat_messages_count ?? 0),
          product_chats_count: Number(r.product_chats_count ?? 0),
          store_reviews_count: Number(r.store_reviews_count ?? 0),
        }))
      );

      setSellRequestsCount(sellRes.count ?? 0);
      setServiceRequestsCount(serviceRes.count ?? 0);

      const ratings = (reviewsRes.data ?? [])
        .map((r: any) => Number(r.rating))
        .filter((n: number) => Number.isFinite(n));
      setReviewsCount(ratings.length);
      setAvgRating(ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null);
    } catch (e: any) {
      console.error("Error cargando usuarios y participación:", e);
      setScreenErr(
        "No se han podido cargar los usuarios. Comprueba tu conexión o vuelve a intentarlo."
      );
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const total = users.length;
    const admins = users.filter((u) => (u.role ?? "").toLowerCase() === "admin").length;
    const active = users.filter((u) => totalParticipation(u) > 0).length;
    return { total, admins, active };
  }, [users]);

  const visibleUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? users.filter((u) => (u.email ?? "").toLowerCase().includes(q)) : users;

    const sorted = [...filtered].sort((a, b) => {
      if (sortMode === "participation") return totalParticipation(b) - totalParticipation(a);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return sorted;
  }, [users, search, sortMode]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      {/* Cabecera fija y compacta (volver al panel + título centrado). Contadores, buscador y
          orden van dentro del scroll: fijos arriba ocupaban media pantalla del móvil y la lista
          de usuarios apenas tenía sitio para desplazarse. */}
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
            Usuarios y participación
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <CargaMarca texto="Cargando usuarios…" />
        </View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: pagePadding, paddingBottom: 48 + insets.bottom, alignItems: "center" }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={CIERRE_TECLADO}
          >
          <View style={{ width: "100%", maxWidth: 1040, gap: 16 }}>
            <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
              Quién está registrado y cuánto participa: foro, chats de producto y reseñas.
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" }}>
              <StatCard label="Registrados" value={String(stats.total)} icon="people-outline" isMobile={isMobile} />
              <StatCard label="Con actividad" value={String(stats.active)} icon="flame-outline" isMobile={isMobile} />
              <StatCard label="Solicitudes venta" value={String(sellRequestsCount)} icon="pricetags-outline" isMobile={isMobile} />
              <StatCard label="Solicitudes servicio" value={String(serviceRequestsCount)} icon="construct-outline" isMobile={isMobile} />
            </View>

            <View style={{ gap: 10 }}>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar por email…"
                placeholderTextColor="rgba(11,33,56,0.40)"
                autoCapitalize="none"
                style={{
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: COLORS.text,
                  backgroundColor: "#F8FBFE",
                  // 16 px: con menos, Safari (iPhone) hace zoom al enfocar y la pantalla
                  // se queda ampliada y "descuadrada".
                  fontSize: 16,
                }}
              />

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                <ChipButton label="Más recientes" active={sortMode === "recent"} onPress={() => setSortMode("recent")} isMobile={isMobile} />
                <ChipButton label="Más participación" active={sortMode === "participation"} onPress={() => setSortMode("participation")} isMobile={isMobile} />
              </View>

              <Text style={{ color: COLORS.muted, fontSize: 12, fontWeight: "700", textAlign: "center" }}>
                Valoración media de la tienda:{" "}
                {avgRating != null ? `${avgRating.toFixed(1)} / 5 (${reviewsCount} reseñas)` : "sin reseñas todavía"}
              </Text>
            </View>

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

            {visibleUsers.length === 0 ? (
              <View style={{ alignItems: "center", gap: 6, paddingVertical: 24, paddingHorizontal: 12 }}>
                <Ionicons name="people-outline" size={24} color={COLORS.muted2} />
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>
                  No hay usuarios que coincidan.
                </Text>
                <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
                  Prueba a borrar el buscador o comprueba que haya usuarios registrados.
                </Text>
              </View>
            ) : (
              visibleUsers.map((u) => {
                const isAdmin = (u.role ?? "").toLowerCase() === "admin";
                return (
                  <Pressable
                    key={u.user_id}
                    onPress={() =>
                      router.push({
                        pathname: "/admin/cliente/[userId]",
                        params: { userId: u.user_id, email: u.email ?? "", createdAt: u.created_at },
                      } as any)
                    }
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.92 : 1,
                      borderRadius: 20,
                      backgroundColor: COLORS.card,
                      padding: isMobile ? 12 : 14,
                      gap: 10,
                    })}
                  >
                    <View
                      style={{
                        flexDirection: isMobile ? "column" : "row",
                        justifyContent: "space-between",
                        alignItems: isMobile ? "flex-start" : "center",
                        gap: 8,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
                        <View
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 12,
                            backgroundColor: COLORS.accent2,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Ionicons name="person-outline" size={16} color={COLORS.accentDark} />
                        </View>
                        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 14 }} numberOfLines={1}>
                          {u.email ?? "Sin email"}
                        </Text>
                      </View>

                      <View
                        style={{
                          paddingVertical: 5,
                          paddingHorizontal: 10,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: isAdmin ? COLORS.accentBorder : COLORS.border,
                          backgroundColor: isAdmin ? COLORS.accent2 : "#F6FAFD",
                        }}
                      >
                        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 11.5 }}>
                          {isAdmin ? "Administrador" : "Cliente"}
                        </Text>
                      </View>
                    </View>

                    <Text style={{ color: COLORS.muted, fontSize: 12, fontWeight: "700" }}>
                      Alta: {fmtDate(u.created_at)}
                    </Text>

                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      <MetricPill icon="chatbubbles-outline" label="mensajes en el foro" value={u.chat_messages_count} />
                      <MetricPill icon="chatbubble-ellipses-outline" label="chats de producto" value={u.product_chats_count} />
                      <MetricPill icon="star-outline" label="reseñas" value={u.store_reviews_count} />
                    </View>

                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                      <Text style={{ color: COLORS.accentDark, fontWeight: "800", fontSize: 12 }}>
                        Ver ficha del cliente
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={COLORS.accentDark} />
                    </View>
                  </Pressable>
                );
              })
            )}

            {/* Nota final como texto suelto centrado, sin recuadro decorativo. */}
            <View style={{ alignItems: "center", gap: 6, paddingHorizontal: 8 }}>
              <Ionicons name="information-circle-outline" size={16} color={COLORS.muted2} />
              <Text style={{ color: COLORS.muted, lineHeight: 18, fontSize: 12.5, textAlign: "center" }}>
                Las solicitudes de venta y de servicio no piden iniciar sesión, así que el total de
                arriba incluye también las anónimas. Solo las enviadas CON sesión iniciada aparecen
                dentro de la ficha del cliente correspondiente (toca una fila para verla).
              </Text>
            </View>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}
