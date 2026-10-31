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
 * - Pedidos: los de la tienda (pedidos + pedido_items) hechos con su cuenta
 *   (user_id) y, aparte, los hechos SIN sesión con su mismo correo (esos no
 *   los ve en «Mis seguimientos»). Desde aquí se cambia la etapa con un toque
 *   (Pendiente → Confirmado → Preparado → Enviado / Listo para recoger →
 *   Entregado, o Cancelado), igual que en Administración → Pedidos, y se avisa
 *   a api/escaparate-retorno.ts por si lleva artículos de VeoAura.
 * - Servicio de reparación: service_requests donde customer_user_id = este
 *   cliente. Misma limitación que arriba (solo con sesión iniciada al
 *   enviar). Cada solicitud tiene aquí su seguimiento para el cliente (etapa
 *   y «nota del taller», como en Administración → Servicios → Solicitudes):
 *   al guardarlo, el cliente lo ve en Perfil → «Mis seguimientos» y Blue le
 *   avisa. Así no hace falta ir de pantalla en pantalla.
 * - Foro (ForoCliente): si está silenciado y hasta cuándo («Quitar silencio»), o silenciarlo 1, 3 o 7 días, y su
 *   historial de moderación (mensajes y comentarios eliminados, silencios), de las tablas foro_silencios y
 *   foro_moderacion. Sin esa migración la tarjeta no sale.
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
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../../lib/supabase";
import CargaMarca from "../../../components/marca/CargaMarca";
import SmartImage from "../../../components/SmartImage";

// "on-drag" en web cierra el teclado con CUALQUIER desplazamiento, también el que hace el
// propio navegador al enfocar el cuadro de notas (se cerraba solo): solo se usa en nativo.
const CIERRE_TECLADO: "none" | "on-drag" = Platform.OS === "web" ? "none" : "on-drag";

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
  seguimiento?: string | null; // etapa visible para el cliente (si ya existe la columna)
  seguimiento_nota?: string | null;
  seguimiento_actualizado?: string | null;
};

type EstadoPedido = "pendiente" | "confirmado" | "preparado" | "enviado" | "entregado" | "cancelado";
const ESTADOS_PEDIDO: EstadoPedido[] = ["pendiente", "confirmado", "preparado", "enviado", "entregado", "cancelado"];

type PedidoFicha = {
  id: string;
  numero: number | null;
  created_at: string;
  estado: EstadoPedido;
  entrega: "envio" | "recogida" | null;
  total_eur: number | null;
  user_id: string | null;
  pedido_items: { id: string; titulo: string; precio_eur: number | null }[] | null;
};

// Etiqueta de cada etapa del pedido (con entrega en mano, «Enviado» es «Listo para recoger», como lo ve el cliente).
function etiquetaEstadoPedido(e: EstadoPedido, entrega: PedidoFicha["entrega"]) {
  if (e === "enviado") return entrega === "recogida" ? "Listo para recoger" : "Enviado";
  return { pendiente: "Pendiente", confirmado: "Confirmado", preparado: "Preparado", entregado: "Entregado", cancelado: "Cancelado" }[e];
}

// 155,00€ · 1.299,00€
function eur(n: number | null) {
  if (n == null || !Number.isFinite(Number(n))) return "";
  const [ent, dec] = Math.abs(Number(n)).toFixed(2).split(".");
  return `${Number(n) < 0 ? "-" : ""}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}€`;
}

const SEGUIMIENTO_LABEL: Record<string, string> = {
  solicitado: "Solicitada",
  recibido: "Recibida",
  diagnostico: "Diagnóstico",
  reparando: "En reparación",
  listo: "Lista para recoger",
  entregado: "Entregada",
  cancelado: "Cancelada",
};
const SEGUIMIENTO_ETAPAS = ["solicitado", "recibido", "diagnostico", "reparando", "listo", "entregado", "cancelado"];

const STATUS_LABEL: Record<string, { label: string; tone: "neutral" | "warn" | "success" | "danger" }> = {
  nuevo: { label: "Nuevo", tone: "warn" },
  revisado: { label: "Revisado", tone: "neutral" },
  contactado: { label: "Contactado", tone: "success" },
  descartado: { label: "Descartado", tone: "danger" },
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "short", year: "numeric" });
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
  // Número (o texto corto) que sale a la derecha del título; sin él no sale nada.
  count?: number | string;
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
        {count !== undefined ? <Text style={{ color: COLORS.muted2, fontSize: 12, fontWeight: "700" }}>{count}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <Text style={{ color: COLORS.muted, fontSize: 12.5, fontStyle: "italic", paddingVertical: 4, textAlign: "center" }}>
      {text}
    </Text>
  );
}

export default function ClienteFicha() {
  const params = useLocalSearchParams<{ userId: string; email?: string; createdAt?: string }>();
  const userId = String(params.userId ?? "").trim();
  const email = typeof params.email === "string" ? params.email : "";
  const createdAt = typeof params.createdAt === "string" ? params.createdAt : "";
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [sellRequests, setSellRequests] = useState<SellRequestRow[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequestRow[]>([]);
  // ¿Existen las columnas de seguimiento? (si no, la etapa no se puede cambiar desde aquí)
  const [seguimientoDisponible, setSeguimientoDisponible] = useState(false);
  // Pedidos de la tienda; null = la tabla aún no existe o no se ha podido leer.
  const [pedidos, setPedidos] = useState<PedidoFicha[] | null>(null);
  // Perfil que el cliente escribe en Mi cuenta (tabla perfiles_cliente). null = no lo ha rellenado o la tabla aún no existe.
  const [perfil, setPerfil] = useState<{
    nombre: string;
    usuario: string;
    pais: string;
    provincia: string;
    edad: number | null;
    foto: string;
    actualizado: string;
  } | null>(null);

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
      // Etapa de seguimiento: consulta aparte para no romper si falta la migración
      let servicios = (serviceRes.data ?? []) as ServiceRequestRow[];
      let conSeguimiento = false;
      if (servicios.length) {
        const segRes = await supabase
          .from("service_requests")
          .select("id,seguimiento,seguimiento_nota,seguimiento_actualizado")
          .eq("customer_user_id", userId);
        if (!segRes.error) {
          conSeguimiento = true;
          type FilaSeg = { id: string; seguimiento: string | null; seguimiento_nota: string | null; seguimiento_actualizado: string | null };
          const porId = new Map(((segRes.data ?? []) as FilaSeg[]).map((x) => [x.id, x]));
          servicios = servicios.map((s) => {
            const seg = porId.get(s.id);
            return {
              ...s,
              seguimiento: seg?.seguimiento ?? null,
              seguimiento_nota: seg?.seguimiento_nota ?? null,
              seguimiento_actualizado: seg?.seguimiento_actualizado ?? null,
            };
          });
        }
      }
      setServiceRequests(servicios);
      setSeguimientoDisponible(conSeguimiento);

      // Pedidos: con su cuenta y, aparte, los hechos sin sesión con su mismo correo.
      const COLUMNAS_PEDIDO = "id,numero,created_at,estado,entrega,total_eur,user_id,pedido_items(id,titulo,precio_eur)";
      const [conCuenta, sinSesion] = await Promise.all([
        supabase.from("pedidos").select(COLUMNAS_PEDIDO).eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
        email
          ? supabase
              .from("pedidos")
              .select(COLUMNAS_PEDIDO)
              .is("user_id", null)
              // Mismo correo sin distinguir mayúsculas («%» y «_» del correo se buscan tal cual).
              .ilike("email", email.trim().replace(/[\\%_]/g, (c) => `\\${c}`))
              .order("created_at", { ascending: false })
              .limit(100)
          : Promise.resolve({ data: [] as unknown[], error: null }),
      ]);
      if (conCuenta.error) {
        setPedidos(null);
      } else {
        const todos = [...((conCuenta.data ?? []) as unknown as PedidoFicha[]), ...((sinSesion.error ? [] : sinSesion.data ?? []) as unknown as PedidoFicha[])];
        todos.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        setPedidos(todos);
      }
      setNotes(notesRes.data?.notes ?? "");
      setNotesUpdatedAt(notesRes.data?.updated_at ?? null);
      setNotesLoaded(true);

      // Perfil (consulta aparte: si la migración aún no está aplicada, la ficha funciona igual sin esta tarjeta).
      type FilaPerfil = {
        nombre: string | null;
        usuario: string | null;
        pais: string | null;
        provincia: string | null;
        fecha_nacimiento: string | null;
        foto_url?: string | null;
        updated_at?: string | null;
      };
      const pedirPerfil = (columnas: string) =>
        supabase.from("perfiles_cliente").select(columnas).eq("user_id", userId).maybeSingle<FilaPerfil>();
      let perfilRes = await pedirPerfil("nombre,usuario,pais,provincia,fecha_nacimiento,foto_url,updated_at");
      // Tabla de la migración antigua (sin foto): se pide sin esas columnas.
      if (perfilRes.error && /foto_url|updated_at/.test(String(perfilRes.error.message ?? ""))) {
        perfilRes = await pedirPerfil("nombre,usuario,pais,provincia,fecha_nacimiento");
      }
      const p = perfilRes.error ? null : perfilRes.data;
      if (p) {
        const hoy = new Date();
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.fecha_nacimiento ?? "");
        let edad: number | null = null;
        if (m) {
          edad = hoy.getFullYear() - Number(m[1]);
          if (hoy.getMonth() + 1 < Number(m[2]) || (hoy.getMonth() + 1 === Number(m[2]) && hoy.getDate() < Number(m[3]))) edad -= 1;
        }
        setPerfil({
          nombre: (p.nombre ?? "").trim(),
          usuario: (p.usuario ?? "").trim(),
          pais: (p.pais ?? "").trim(),
          provincia: (p.provincia ?? "").trim(),
          edad,
          foto: (p.foto_url ?? "").trim(),
          actualizado: (p.updated_at ?? "").trim(),
        });
      } else {
        setPerfil(null);
      }
    } catch (e) {
      console.error("Error cargando la ficha del cliente:", e);
    } finally {
      setLoading(false);
    }
  }, [userId, email]);

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
      {/* Antes iba dentro de SafeAreaView (solo hace algo en iOS nativo): ahora la cabecera y
          el final del scroll suman la zona segura real (también en el iPhone desde la web). */}
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        {/* Cabecera fija y compacta (volver + título centrado), igual en todo el panel. */}
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 10 + insets.top,
            paddingBottom: 10,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
            backgroundColor: COLORS.bg2,
          }}
        >
          <View style={{ width: "100%", maxWidth: 720, alignSelf: "center", minHeight: 40, justifyContent: "center" }}>
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace("/admin/users"))}
              accessibilityRole="button"
              accessibilityLabel="Volver a usuarios"
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

            <View style={{ paddingHorizontal: 44, alignItems: "center" }}>
              <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: "900", fontSize: 17, textAlign: "center" }}>
                {email || "Ficha de cliente"}
              </Text>
              {createdAt ? (
                <Text style={{ color: COLORS.muted2, fontSize: 12, textAlign: "center" }}>
                  Cliente desde {fmtDate(createdAt)}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
            <CargaMarca texto="Cargando ficha…" />
          </View>
        ) : (
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 48 + insets.bottom, alignItems: "center" }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={CIERRE_TECLADO}
          >
            <View style={{ width: "100%", maxWidth: 720, gap: 16 }}>
              <SectionCard icon="id-card-outline" title="Perfil">
                {perfil ? (
                  <View style={{ gap: 6 }}>
                    {perfil.foto ? (
                      <View style={{ alignItems: "center", paddingBottom: 4 }}>
                        <View style={{ width: 88, height: 88, borderRadius: 44, overflow: "hidden", backgroundColor: COLORS.bg2 }}>
                          <SmartImage uri={perfil.foto} alt="Foto de perfil del cliente" contentFit="cover" style={{ width: "100%", height: "100%" }} />
                        </View>
                      </View>
                    ) : null}
                    {(() => {
                      // Estado del perfil obligatorio («Completa tu perfil»): la foto no cuenta.
                      const faltan = [
                        !perfil.usuario ? "usuario" : "",
                        !perfil.nombre ? "nombre" : "",
                        !perfil.pais ? "país" : "",
                        !perfil.provincia ? "provincia" : "",
                        perfil.edad === null ? "edad" : "",
                      ].filter(Boolean);
                      return (
                        <Text style={{ color: faltan.length ? COLORS.danger : COLORS.success, fontWeight: "800", fontSize: 13, textAlign: "center" }}>
                          {faltan.length ? `Faltan: ${faltan.join(", ")}` : "Perfil completo"}
                          {perfil.actualizado ? ` · actualizado ${new Date(perfil.actualizado).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" })}` : ""}
                        </Text>
                      );
                    })()}
                    {[
                      ["Nombre", perfil.nombre],
                      ["Usuario", perfil.usuario ? `@${perfil.usuario}` : ""],
                      ["País", perfil.pais],
                      ["Provincia", perfil.provincia],
                      ["Edad", perfil.edad !== null ? `${perfil.edad} años` : ""],
                    ].map(([etiqueta, valor]) => (
                      <View key={etiqueta} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                        <Text style={{ color: COLORS.muted2, fontWeight: "800", fontSize: 12.5 }}>{etiqueta}</Text>
                        <Text style={{ color: valor ? COLORS.text : COLORS.muted2, fontWeight: "800", fontSize: 13.5, flexShrink: 1, textAlign: "right" }}>
                          {valor || "—"}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <EmptyRow text="Todavía no ha rellenado su perfil." />
                )}
              </SectionCard>

              {pedidos !== null ? (
                <View nativeID="ficha-pedidos">
                  <SectionCard icon="receipt-outline" title="Pedidos" count={pedidos.length}>
                    {pedidos.length === 0 ? (
                      <EmptyRow text="No ha hecho ningún pedido en la tienda." />
                    ) : (
                      <View style={{ gap: 8 }}>
                        {pedidos.map((p) => (
                          <PedidoEtapas
                            key={p.id}
                            pedido={p}
                            onCambiado={(estado) => setPedidos((prev) => (prev ?? []).map((x) => (x.id === p.id ? { ...x, estado } : x)))}
                          />
                        ))}
                      </View>
                    )}
                  </SectionCard>
                </View>
              ) : null}

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
                          {s.seguimiento ? (
                            <Text
                              style={{
                                color: s.seguimiento === "cancelado" ? COLORS.danger : COLORS.accentDark,
                                fontSize: 11.5,
                                fontWeight: "800",
                              }}
                            >
                              · {SEGUIMIENTO_LABEL[s.seguimiento] ?? s.seguimiento}
                            </Text>
                          ) : null}
                        </View>
                        {seguimientoDisponible ? (
                          <SeguimientoReparacion
                            solicitud={s}
                            onGuardado={(cambio) =>
                              setServiceRequests((prev) => prev.map((x) => (x.id === s.id ? { ...x, ...cambio } : x)))
                            }
                          />
                        ) : null}
                      </View>
                    ))}
                  </View>
                )}
              </SectionCard>

              <ForoCliente userId={userId} />

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
                    // 16 px: con menos, Safari (iPhone) hace zoom al enfocar y la pantalla
                    // se queda ampliada y "descuadrada".
                    fontSize: 16,
                    textAlignVertical: "top",
                  }}
                />

                <View style={{ alignItems: "center", gap: 8 }}>
                  <Pressable
                    onPress={handleSaveNotes}
                    disabled={savingNotes || !notesLoaded}
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      opacity: savingNotes || !notesLoaded ? 0.6 : pressed ? 0.88 : 1,
                      borderRadius: 999,
                      paddingVertical: 11,
                      paddingHorizontal: 22,
                      backgroundColor: COLORS.accentDark,
                    })}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14, textAlign: "center" }}>
                      {savingNotes ? "Guardando…" : "Guardar nota"}
                    </Text>
                  </Pressable>

                  {notesSaved ? (
                    <Text style={{ color: COLORS.success, fontWeight: "800", fontSize: 12.5, textAlign: "center" }}>
                      Guardado ✓
                    </Text>
                  ) : notesUpdatedAt ? (
                    <Text style={{ color: COLORS.muted2, fontSize: 11.5, textAlign: "center" }}>
                      Última actualización: {fmtDate(notesUpdatedAt)}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          </ScrollView>
          </KeyboardAvoidingView>
        )}
      </View>
    </View>
  );
}

// --- Foro: silencio e historial de moderación de este cliente --------------------------------------------------------
// Tablas foro_silencios y foro_moderacion (supabase/migrations/20261031110000_foro_silencios_y_moderacion.sql). Si aún no
// existen, esta tarjeta no sale. Silenciar aquí es lo mismo que desde el Foro (lo hace cumplir la base de datos).

const ACCION_MODERACION: Record<string, string> = {
  mensaje_eliminado: "Mensaje del Foro eliminado",
  comentario_eliminado: "Comentario de noticia eliminado",
  silenciado: "Silenciado",
  silencio_quitado: "Silencio quitado",
};

function fechaHora(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function ForoCliente({ userId }: { userId: string }) {
  const [disponible, setDisponible] = useState(false);
  const [silencio, setSilencio] = useState<{ hasta: string; motivo: string | null } | null>(null);
  const [historial, setHistorial] = useState<{ id: string; created_at: string; accion: string; detalle: string | null }[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    const [sil, mod] = await Promise.all([
      supabase.from("foro_silencios").select("hasta,motivo").eq("user_id", userId).maybeSingle<{ hasta: string; motivo: string | null }>(),
      supabase.from("foro_moderacion").select("id,created_at,accion,detalle").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
    ]);
    if (sil.error || mod.error) {
      setDisponible(false);
      return;
    }
    setDisponible(true);
    setSilencio(sil.data && new Date(sil.data.hasta).getTime() > Date.now() ? sil.data : null);
    setHistorial((mod.data ?? []) as { id: string; created_at: string; accion: string; detalle: string | null }[]);
  }, [userId]);

  useEffect(() => {
    if (userId) cargar();
  }, [userId, cargar]);

  async function silenciar(dias: number | null) {
    if (guardando) return;
    setGuardando(true);
    setAviso(null);
    // dias = null → quitar el silencio (hasta ahora mismo).
    const hasta = dias ? new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString() : new Date().toISOString();
    const { data, error } = await supabase
      .from("foro_silencios")
      .upsert({ user_id: userId, hasta }, { onConflict: "user_id" })
      .select("user_id");
    setGuardando(false);
    if (error || !Array.isArray(data) || data.length === 0) {
      setAviso({ ok: false, texto: "No se ha podido guardar (a un administrador no se le puede silenciar)." });
      return;
    }
    // Al silenciar ya lo dice la línea de arriba («Silenciado hasta…»); al quitarlo, se confirma.
    setAviso(dias ? null : { ok: true, texto: "Silencio quitado: ya puede escribir." });
    cargar();
  }

  if (!disponible) return null;

  return (
    <View nativeID="ficha-foro">
      <SectionCard icon="chatbubbles-outline" title="Foro" count={historial.length ? `${historial.length} en el registro` : undefined}>
        {silencio ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Text style={{ flex: 1, minWidth: 180, color: COLORS.danger, fontWeight: "800", fontSize: 13 }}>
              Silenciado hasta el {fechaHora(silencio.hasta)}
              {silencio.motivo ? ` · ${silencio.motivo}` : ""}
            </Text>
            <EtapaChip etiqueta="Quitar silencio" activa={false} disabled={guardando} onPress={() => silenciar(null)} />
          </View>
        ) : (
          <View style={{ gap: 6 }}>
            <Text style={{ color: COLORS.muted, fontSize: 12.5 }}>Puede escribir en el Foro. Silenciar (no podrá escribir ni comentar):</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {[1, 3, 7].map((d) => (
                <EtapaChip key={d} etiqueta={d === 1 ? "1 día" : `${d} días`} activa={false} disabled={guardando} onPress={() => silenciar(d)} />
              ))}
            </View>
          </View>
        )}
        {aviso ? (
          <Text accessibilityRole="alert" style={{ color: aviso.ok ? COLORS.success : COLORS.danger, fontWeight: "800", fontSize: 12.5 }}>
            {aviso.texto}
          </Text>
        ) : null}
        {historial.length ? (
          <View style={{ gap: 6 }}>
            <Text style={{ color: COLORS.muted2, fontWeight: "800", fontSize: 11.5 }}>HISTORIAL DE MODERACIÓN</Text>
            {historial.map((h) => (
              <View key={h.id} style={{ borderRadius: 12, backgroundColor: COLORS.cardSoft, padding: 10, gap: 2 }}>
                <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 12.5 }}>
                  {ACCION_MODERACION[h.accion] ?? h.accion} · <Text style={{ color: COLORS.muted2, fontWeight: "700" }}>{fechaHora(h.created_at)}</Text>
                </Text>
                {h.detalle ? (
                  <Text numberOfLines={3} style={{ color: COLORS.muted, fontSize: 12, lineHeight: 17 }}>
                    {h.detalle}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <EmptyRow text="Sin nada en el registro de moderación." />
        )}
      </SectionCard>
    </View>
  );
}

// --- Etapas desde la ficha ------------------------------------------------------------------------------------------

// Botón de etapa: la actual resaltada (en rojo si es la de cancelar). 44 px de alto para tocarlo bien.
function EtapaChip({
  etiqueta,
  activa,
  peligro,
  disabled,
  onPress,
}: {
  etiqueta: string;
  activa: boolean;
  peligro?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: activa, disabled: !!disabled }}
      style={({ pressed }) => ({
        minHeight: 44,
        justifyContent: "center",
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: activa ? (peligro ? COLORS.danger : COLORS.accent) : COLORS.border,
        backgroundColor: activa ? (peligro ? COLORS.dangerBg : COLORS.accent2) : "#FFFFFF",
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: activa ? (peligro ? COLORS.danger : COLORS.accentDark) : COLORS.muted, fontWeight: "800", fontSize: 12.5 }}>
        {etiqueta}
      </Text>
    </Pressable>
  );
}

// Un pedido con sus etapas: un toque cambia la etapa (como en Administración → Pedidos).
function PedidoEtapas({ pedido, onCambiado }: { pedido: PedidoFicha; onCambiado: (estado: EstadoPedido) => void }) {
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  async function cambiar(estado: EstadoPedido) {
    if (estado === pedido.estado || guardando) return;
    setGuardando(true);
    setAviso(null);
    const { data, error } = await supabase.from("pedidos").update({ estado }).eq("id", pedido.id).select("id");
    setGuardando(false);
    if (error || !Array.isArray(data) || data.length === 0) {
      setAviso({ ok: false, texto: "No se ha podido cambiar la etapa. Inténtalo de nuevo." });
      return;
    }
    onCambiado(estado);
    setAviso({
      ok: true,
      texto: pedido.user_id ? "Etapa guardada ✓ El cliente la ve en «Mis seguimientos»." : "Etapa guardada ✓",
    });
    // Si se cancela un pedido con artículos de VeoAura, el servidor se lo avisa a VeoAura (api/escaparate-retorno.ts).
    if (Platform.OS === "web") fetch("/api/escaparate-retorno", { method: "POST" }).catch(() => {});
  }

  const items = pedido.pedido_items ?? [];
  return (
    <View style={{ borderRadius: 12, backgroundColor: COLORS.cardSoft, padding: 10, gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text numberOfLines={1} style={{ flex: 1, color: COLORS.text, fontWeight: "900", fontSize: 13.5 }}>
          Pedido nº {pedido.numero ?? "—"}
          {pedido.total_eur != null ? ` · ${eur(pedido.total_eur)}` : ""}
        </Text>
        <Text style={{ color: COLORS.muted2, fontSize: 11 }}>{fmtDate(pedido.created_at)}</Text>
      </View>
      {items.length ? (
        <Text style={{ color: COLORS.muted, fontSize: 12, lineHeight: 17 }}>{items.map((it) => it.titulo).join(" · ")}</Text>
      ) : null}
      <Text style={{ color: COLORS.muted2, fontSize: 11.5, fontWeight: "700" }}>
        {pedido.entrega === "recogida" ? "Entrega en mano" : "Envío a domicilio"}
        {pedido.user_id ? "" : " · Hecho sin sesión (con su correo): no lo ve en «Mis seguimientos»"}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {ESTADOS_PEDIDO.map((e) => (
          <EtapaChip
            key={e}
            etiqueta={etiquetaEstadoPedido(e, pedido.entrega)}
            activa={pedido.estado === e}
            peligro={e === "cancelado"}
            disabled={guardando}
            onPress={() => cambiar(e)}
          />
        ))}
      </View>
      {aviso ? (
        <Text accessibilityRole="alert" style={{ color: aviso.ok ? COLORS.success : COLORS.danger, fontWeight: "800", fontSize: 12.5 }}>
          {aviso.texto}
        </Text>
      ) : null}
    </View>
  );
}

// Seguimiento de una reparación para el cliente: etapa + «nota del taller» (como en Administración → Servicios).
function SeguimientoReparacion({
  solicitud,
  onGuardado,
}: {
  solicitud: ServiceRequestRow;
  onGuardado: (cambio: Pick<ServiceRequestRow, "seguimiento" | "seguimiento_nota" | "seguimiento_actualizado">) => void;
}) {
  const inicial = solicitud.seguimiento ?? "solicitado";
  const [etapa, setEtapa] = useState(inicial);
  const [nota, setNota] = useState(solicitud.seguimiento_nota ?? "");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const cambiado = etapa !== inicial || nota.trim() !== (solicitud.seguimiento_nota ?? "");

  async function guardar() {
    if (!cambiado || guardando) return;
    setGuardando(true);
    setAviso(null);
    const cambio = {
      seguimiento: etapa,
      seguimiento_nota: nota.trim() || null,
      seguimiento_actualizado: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("service_requests").update(cambio).eq("id", solicitud.id).select("id");
    setGuardando(false);
    if (error || !Array.isArray(data) || data.length === 0) {
      setAviso({ ok: false, texto: "No se ha podido guardar el seguimiento. Inténtalo de nuevo." });
      return;
    }
    onGuardado(cambio);
    setAviso({ ok: true, texto: "Seguimiento guardado ✓ El cliente lo ve en «Mis seguimientos»." });
  }

  return (
    <View style={{ gap: 6, paddingTop: 4 }}>
      <Text style={{ color: COLORS.muted2, fontWeight: "800", fontSize: 11.5 }}>
        SEGUIMIENTO PARA EL CLIENTE
        {solicitud.seguimiento_actualizado ? ` · ${fmtDate(solicitud.seguimiento_actualizado)}` : ""}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {SEGUIMIENTO_ETAPAS.map((e) => (
          <EtapaChip
            key={e}
            etiqueta={SEGUIMIENTO_LABEL[e]}
            activa={etapa === e}
            peligro={e === "cancelado"}
            disabled={guardando}
            onPress={() => {
              setEtapa(e);
              setAviso(null);
            }}
          />
        ))}
      </View>
      <TextInput
        value={nota}
        onChangeText={(t) => {
          setNota(t.slice(0, 500));
          setAviso(null);
        }}
        placeholder="Nota del taller para el cliente (opcional)"
        placeholderTextColor="rgba(11,33,56,0.40)"
        accessibilityLabel="Nota del taller para el cliente"
        maxLength={500}
        style={{
          minHeight: 44,
          borderWidth: 1,
          borderColor: COLORS.border,
          borderRadius: 14,
          paddingHorizontal: 12,
          paddingVertical: 10,
          color: COLORS.text,
          backgroundColor: "#FFFFFF",
          // 16 px: con menos, Safari (iPhone) hace zoom al enfocar.
          fontSize: 16,
        }}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Pressable
          onPress={guardar}
          disabled={!cambiado || guardando}
          accessibilityRole="button"
          style={({ pressed }) => ({
            minHeight: 44,
            justifyContent: "center",
            paddingHorizontal: 18,
            borderRadius: 999,
            backgroundColor: COLORS.accentDark,
            opacity: !cambiado || guardando ? 0.5 : pressed ? 0.88 : 1,
          })}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 13.5 }}>{guardando ? "Guardando…" : "Guardar seguimiento"}</Text>
        </Pressable>
        {aviso ? (
          <Text accessibilityRole="alert" style={{ flexShrink: 1, color: aviso.ok ? COLORS.success : COLORS.danger, fontWeight: "800", fontSize: 12.5 }}>
            {aviso.texto}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
