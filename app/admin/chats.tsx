// app/admin/chats.tsx
/**
 * Qué hace: bandeja de admin de las conversaciones PRIVADAS por producto
 * (ver sql/product_chats.sql). Es donde Jefe ve quién le ha escrito por
 * cada anuncio y, cuando corresponde, lo marca como "vendido" a esa persona
 * (ver sql/product_sales.sql) — la otra mitad de esa acción vive en
 * app/admin/products.tsx, que la hace buscando directamente a un usuario
 * registrado, sin pasar por el chat.
 *
 * Cómo funciona:
 * - Carga TODAS las conversaciones (la política RLS de product_chats ya
 *   deja ver todo a un admin) y las agrupa por producto: un mismo producto
 *   puede tener varias personas distintas escribiendo por él, y hay que
 *   poder elegir la correcta.
 * - Master-detail en una sola pantalla: lista de productos con
 *   conversaciones a la izquierda (o arriba en móvil) y, al elegir una
 *   conversación, su hilo completo (components/ProductChatThread.tsx) a la
 *   derecha, con el botón "Marcar como vendido a este cliente" añadido por
 *   fuera del componente compartido (headerRight).
 * - Consultas generales (sin producto ni solicitud de venta): se agrupan
 *   aparte, en un bloque fijo "Atención al cliente" al principio de la
 *   lista (botón "Chatear con nosotros" de app/catalogo.tsx, vía
 *   get_or_create_support_chat). No llevan botón "Marcar como vendido" al
 *   abrirlas, porque no hay producto que marcar.
 * - Ventas de clientes (conversaciones con sell_request_id): se abren solas
 *   al enviar el formulario "Vender ahora" con sesión iniciada (ver
 *   components/VenderAhoraModal.tsx, get_or_create_sell_request_chat) y se
 *   agrupan aparte, por solicitud, mostrando el artículo en vez de un
 *   nombre de producto — tampoco llevan "Marcar como vendido" (eso es para
 *   cuando LES vendemos algo, no al revés).
 * - Borrar una conversación (icono de papelera en cada fila y dentro del
 *   hilo abierto) llama a delete_chat_for_me: solo desaparece de ESTA
 *   bandeja (admin); si el cliente no la ha borrado también, él la sigue
 *   viendo. product_chats.admin_deleted_at es lo que se filtra al cargar la
 *   lista (.is("admin_deleted_at", null)).
 * - "Marcar como vendido" hace un INSERT directo en product_sales con
 *   buyer_user_id = el cliente de esa conversación; el trigger de esa tabla
 *   ya sabe que un admin puede elegir libremente a quién marca (a
 *   diferencia de un cliente normal, que solo puede marcarse a sí mismo
 *   desde "Comprar ya"). Si ese producto ya tiene una venta registrada para
 *   esa misma persona, el botón se sustituye por un aviso "Ya vendido ✓" en
 *   vez de dejar duplicar la fila sin querer.
 * - «Asignar seguimiento a este cliente» (bajo la cabecera de cada conversación, salvo las ventas de clientes): crea su
 *   pedido o su reparación YA en su cuenta (api/asignar-seguimiento.ts) y le avisa en el chat con su número de
 *   seguimiento. Para escribir aquí hace falta cuenta, así que el cliente ya está registrado. Arriba de la lista, la
 *   invitación a registrarse para quien escribe por WhatsApp o Instagram (copiar o abrir WhatsApp).
 * - Nombre del cliente en la lista: se pide con admin_users_by_ids (ver
 *   sql/admin_users_by_ids.sql), que devuelve el nombre real aunque esa
 *   persona no haya escrito ni un mensaje. Si esa función todavía no existe
 *   en Supabase (falta ejecutar el script), se cae al nombre sacado del
 *   primer mensaje del cliente y, si tampoco hay, a "Cliente".
 *
 * Conectado con:
 * - sql/product_chats.sql → product_chats, product_chat_messages.
 * - sql/product_sales.sql → marcar como vendido.
 * - sql/admin_users_by_ids.sql → nombre real del cliente en la lista.
 * - components/ProductChatThread.tsx → el hilo de mensajes en sí.
 * - app/admin/products.tsx → la otra forma de marcar "vendido" (buscando al
 *   usuario registrado, sin depender de que haya escrito por chat).
 * - app/admin/index.tsx → origen habitual de la navegación a esta pantalla.
 * - app/admin/_layout.tsx → registra esta ruta ("chats") dentro del Stack
 *   protegido del panel admin.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
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
import { openExternalLink } from "../../lib/openExternalLink";
import { supabase } from "../../lib/supabase";
import ProductChatThread, { TITULO_ATENCION_CLIENTE } from "../../components/ProductChatThread";
import CargaMarca from "../../components/marca/CargaMarca";

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
  successBg: "#DCFCE7",
  successBorder: "#86EFAC",
  success: "#15803D",
};

const columnStyle = { width: "100%", maxWidth: 1160, alignSelf: "center" } as const;

type ChatRow = {
  id: string;
  product_id: string | null;
  sell_request_id: string | null;
  customer_user_id: string;
  last_message_at: string;
  last_message_preview: string;
  customer_name: string;
};

type ProductGroup = {
  product_id: string;
  product_title: string;
  product_image: string | null;
  // Precio del artículo: rellena el importe al asignarle el seguimiento de un pedido.
  product_price: number | null;
  chats: ChatRow[];
};

type SellGroup = {
  sell_request_id: string;
  articulo: string;
  chats: ChatRow[];
};

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "short", year: "numeric" });
}

// --- Asignar seguimiento al cliente de la conversación ---------------------------------------------------------------
// Para escribir en el chat de la tienda hace falta cuenta: el cliente de cualquier conversación ya está registrado. El
// administrador crea aquí su pedido o su reparación YA en su cuenta (api/asignar-seguimiento.ts): el cliente lo ve en
// Perfil → «Mis seguimientos» con su número, y se le avisa con un mensaje en esta misma conversación.
type TipoSeguimiento = "pedido" | "reparacion";
const ETAPAS_ASIGNAR: Record<TipoSeguimiento, { valor: string; etiqueta: (recogida: boolean) => string }[]> = {
  pedido: [
    { valor: "pendiente", etiqueta: () => "Pendiente" },
    { valor: "confirmado", etiqueta: () => "Confirmado" },
    { valor: "preparado", etiqueta: () => "Preparando" },
    { valor: "enviado", etiqueta: (recogida) => (recogida ? "Listo para recoger" : "Enviado") },
    { valor: "entregado", etiqueta: () => "Entregado" },
  ],
  reparacion: [
    { valor: "recibido", etiqueta: () => "Recibida" },
    { valor: "diagnostico", etiqueta: () => "Diagnóstico" },
    { valor: "reparando", etiqueta: () => "En reparación" },
    { valor: "listo", etiqueta: () => "Lista para recoger" },
    { valor: "entregado", etiqueta: () => "Entregada" },
  ],
};
const ERRORES_ASIGNAR: Record<string, string> = {
  "falta el título": "Escribe qué es (por ejemplo, «Reparación de mando PS5»).",
  "importe no válido": "Escribe el importe del pedido (por ejemplo, 249,99).",
  "teléfono no válido": "El teléfono es demasiado corto.",
  "el cliente no tiene correo": "Esta cuenta no tiene correo: no se puede crear un pedido a su nombre.",
  "falta activar los números de seguimiento": "Falta activar los números de seguimiento en la base de datos.",
  "solo para administradores": "Solo un administrador puede asignar seguimientos.",
};

function Chip({ activo, texto, onPress }: { activo: boolean; texto: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      style={({ pressed }) => ({
        minHeight: 40,
        justifyContent: "center",
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: activo ? COLORS.accent : COLORS.border,
        backgroundColor: activo ? COLORS.accent2 : "#FFFFFF",
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: activo ? COLORS.text : COLORS.muted, fontWeight: "800", fontSize: 12.5 }}>{texto}</Text>
    </Pressable>
  );
}

const estiloCampo = {
  minHeight: 44,
  borderWidth: 1,
  borderColor: COLORS.border,
  borderRadius: 12,
  paddingHorizontal: 12,
  fontSize: 16,
  color: COLORS.text,
  backgroundColor: "#FFFFFF",
} as const;

function AsignarSeguimiento({
  chatId,
  esProducto,
  tituloInicial,
  precioInicial,
}: {
  chatId: string;
  esProducto: boolean;
  tituloInicial: string;
  precioInicial: number | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<TipoSeguimiento>(esProducto ? "pedido" : "reparacion");
  const [titulo, setTitulo] = useState(tituloInicial);
  const [etapa, setEtapa] = useState(esProducto ? "confirmado" : "recibido");
  const [entrega, setEntrega] = useState<"envio" | "recogida">("envio");
  const [importe, setImporte] = useState(precioInicial != null ? String(precioInicial).replace(".", ",") : "");
  const [telefono, setTelefono] = useState("");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  function cambiarTipo(t: TipoSeguimiento) {
    setTipo(t);
    setEtapa(t === "pedido" ? "confirmado" : "recibido");
    setAviso(null);
  }

  async function asignar() {
    if (enviando) return;
    setEnviando(true);
    setAviso(null);
    try {
      const { data: sesion } = await supabase.auth.getSession();
      const token = sesion.session?.access_token;
      if (!token) throw new Error("sin sesión");
      const total = Number(importe.replace(/\./g, "").replace(",", ".").trim());
      const r = await fetch("/api/asignar-seguimiento", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          chat_id: chatId,
          tipo,
          titulo,
          etapa,
          ...(tipo === "pedido" ? { entrega, total_eur: Number.isFinite(total) ? total : -1, telefono: telefono.trim() || null } : { nota: nota.trim() || null }),
        }),
      });
      const datos = (await r.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        tipo?: TipoSeguimiento;
        titulo?: string;
        codigo_seguimiento?: string;
        numero_pedido?: number;
      } | null;
      if (!r.ok || !datos?.ok || !datos.codigo_seguimiento) {
        setAviso({ ok: false, texto: ERRORES_ASIGNAR[datos?.error ?? ""] ?? "No se ha podido asignar. Inténtalo de nuevo." });
        return;
      }
      // Aviso al cliente en esta misma conversación (lo escribe el administrador, como cualquier mensaje suyo).
      const mensaje =
        datos.tipo === "pedido"
          ? `Te he asignado el seguimiento de tu pedido nº ${datos.numero_pedido} («${datos.titulo}»). Lo tienes en Perfil → Mis seguimientos, con el número ${datos.codigo_seguimiento}.`
          : `Te he asignado el seguimiento de «${datos.titulo}». Lo tienes en Perfil → Mis seguimientos, con el número ${datos.codigo_seguimiento}.`;
      const { error: errMensaje } = await supabase.from("product_chat_messages").insert({ chat_id: chatId, body: mensaje });
      setAviso({
        ok: true,
        texto: `Asignado ✓ Nº ${datos.codigo_seguimiento}. El cliente ya lo ve en «Mis seguimientos»${errMensaje ? " (el aviso por el chat no se ha podido enviar: escríbeselo tú)" : " y se lo hemos dicho en el chat"}.`,
      });
      setAbierto(false);
    } catch (e) {
      console.error("Error asignando el seguimiento:", e);
      setAviso({ ok: false, texto: "No se ha podido asignar. Inténtalo de nuevo." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <View
      nativeID="chat-asignar-seguimiento"
      style={{ borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.cardSoft, paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}
    >
      {!abierto ? (
        <Pressable
          onPress={() => {
            setAbierto(true);
            setAviso(null);
          }}
          accessibilityRole="button"
          accessibilityLabel="Asignar seguimiento a este cliente"
          style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: pressed ? 0.8 : 1 })}
        >
          <Ionicons name="git-network-outline" size={18} color={COLORS.accent} />
          <Text style={{ color: COLORS.text, fontWeight: "900" }}>Asignar seguimiento a este cliente</Text>
        </Pressable>
      ) : (
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 10, paddingVertical: 4 }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: COLORS.muted, fontSize: 12.5, textAlign: "center", lineHeight: 18 }}>
            Ya tiene cuenta: lo verá al momento en «Mis seguimientos», con su número, y le avisaremos aquí.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
            <Chip activo={tipo === "pedido"} texto="Pedido" onPress={() => cambiarTipo("pedido")} />
            <Chip activo={tipo === "reparacion"} texto="Reparación o mantenimiento" onPress={() => cambiarTipo("reparacion")} />
          </View>
          <TextInput
            value={titulo}
            onChangeText={(t) => setTitulo(t.slice(0, 120))}
            placeholder={tipo === "pedido" ? "Artículo (p. ej. Nintendo Switch OLED)" : "Qué es (p. ej. Reparación de mando PS5)"}
            placeholderTextColor={COLORS.muted2}
            accessibilityLabel="Título del seguimiento"
            style={estiloCampo}
          />
          {tipo === "pedido" ? (
            <>
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
                <Chip activo={entrega === "envio"} texto="Envío" onPress={() => setEntrega("envio")} />
                <Chip activo={entrega === "recogida"} texto="Entrega en mano" onPress={() => setEntrega("recogida")} />
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  value={importe}
                  onChangeText={(t) => setImporte(t.replace(/[^0-9.,]/g, "").slice(0, 12))}
                  placeholder="Importe (€)"
                  placeholderTextColor={COLORS.muted2}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Importe del pedido"
                  style={{ ...estiloCampo, flex: 1, minWidth: 0 }}
                />
                <TextInput
                  value={telefono}
                  onChangeText={(t) => setTelefono(t.slice(0, 30))}
                  placeholder="Teléfono (opcional)"
                  placeholderTextColor={COLORS.muted2}
                  keyboardType="phone-pad"
                  accessibilityLabel="Teléfono del cliente"
                  style={{ ...estiloCampo, flex: 1, minWidth: 0 }}
                />
              </View>
            </>
          ) : (
            <TextInput
              value={nota}
              onChangeText={(t) => setNota(t.slice(0, 500))}
              placeholder="Nota para el cliente (opcional)"
              placeholderTextColor={COLORS.muted2}
              accessibilityLabel="Nota para el cliente"
              style={estiloCampo}
            />
          )}
          <Text style={{ color: COLORS.muted2, fontWeight: "800", fontSize: 12, textAlign: "center" }}>ETAPA</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
            {ETAPAS_ASIGNAR[tipo].map((e) => (
              <Chip key={e.valor} activo={etapa === e.valor} texto={e.etiqueta(entrega === "recogida")} onPress={() => setEtapa(e.valor)} />
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
            <Pressable
              onPress={() => setAbierto(false)}
              accessibilityRole="button"
              style={({ pressed }) => ({
                minHeight: 44,
                justifyContent: "center",
                paddingHorizontal: 16,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: "#FFFFFF",
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: COLORS.text, fontWeight: "800" }}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={asignar}
              disabled={enviando || !titulo.trim()}
              accessibilityRole="button"
              accessibilityLabel="Asignar y avisar al cliente"
              style={({ pressed }) => ({
                minHeight: 44,
                justifyContent: "center",
                paddingHorizontal: 18,
                borderRadius: 999,
                backgroundColor: COLORS.accentDark,
                opacity: enviando || !titulo.trim() ? 0.5 : pressed ? 0.88 : 1,
              })}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>{enviando ? "Asignando…" : "Asignar y avisar al cliente"}</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
      {aviso ? (
        <Text accessibilityRole="alert" style={{ color: aviso.ok ? COLORS.success : "#B91C1C", fontWeight: "800", fontSize: 12.5, textAlign: "center", lineHeight: 18 }}>
          {aviso.texto}
        </Text>
      ) : null}
    </View>
  );
}

// --- Invitar a registrarse a quien escribe por WhatsApp o Instagram ---------------------------------------------------
// Para asignarle un seguimiento, el cliente tiene que tener cuenta y escribir por el chat de la tienda. Este texto se copia
// (o se abre en WhatsApp) para mandárselo.
const INVITACION_REGISTRO =
  "¡Hola! Para darte un número de seguimiento de tu pedido o de tu reparación, crea tu cuenta en la tienda: https://videojuegoszaragoza.com/perfil?acceso=registro y escríbenos desde allí (Blue IA → «Hablar con Blue IA o el equipo»). Así verás en todo momento cómo va en «Mis seguimientos».";

function InvitarRegistro() {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      const nav = (globalThis as { navigator?: { clipboard?: { writeText?: (t: string) => Promise<void> } } }).navigator;
      if (!nav?.clipboard?.writeText) return;
      await nav.clipboard.writeText(INVITACION_REGISTRO);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // sin portapapeles: queda el botón de WhatsApp
    }
  }
  return (
    <View nativeID="chat-invitar-registro" style={{ borderRadius: 16, backgroundColor: COLORS.card, padding: 12, gap: 8 }}>
      <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>¿Te escriben por WhatsApp o Instagram?</Text>
      <Text style={{ color: COLORS.muted, fontSize: 12.5, lineHeight: 18, textAlign: "center" }}>
        Mándales esta invitación: cuando creen su cuenta y te escriban aquí, podrás asignarles su seguimiento.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
        <Pressable
          onPress={copiar}
          accessibilityRole="button"
          accessibilityLabel="Copiar la invitación a registrarse"
          style={({ pressed }) => ({
            minHeight: 44,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 14,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: "#FFFFFF",
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Ionicons name={copiado ? "checkmark" : "copy-outline"} size={16} color={COLORS.text} />
          <Text style={{ color: COLORS.text, fontWeight: "800" }}>{copiado ? "Copiada" : "Copiar invitación"}</Text>
        </Pressable>
        <Pressable
          onPress={() => openExternalLink(`https://wa.me/?text=${encodeURIComponent(INVITACION_REGISTRO)}`)}
          accessibilityRole="button"
          accessibilityLabel="Enviar la invitación por WhatsApp"
          style={({ pressed }) => ({
            minHeight: 44,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 14,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: "#FFFFFF",
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Ionicons name="logo-whatsapp" size={16} color={COLORS.text} />
          <Text style={{ color: COLORS.text, fontWeight: "800" }}>Enviar por WhatsApp</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function AdminChats() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 900;
  const pagePadding = isMobile ? 12 : 16;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  // Conversaciones sin producto (botón "Chatear con nosotros" de
  // app/catalogo.tsx) — aparte de los grupos por producto, no encajan ahí.
  const [supportChats, setSupportChats] = useState<ChatRow[]>([]);
  // Conversaciones abiertas desde "Vender ahora" (VenderAhoraModal), agrupadas
  // por solicitud — igual que groups pero mostrando el artículo, no un
  // producto del catálogo.
  const [sellGroups, setSellGroups] = useState<SellGroup[]>([]);
  const [soldKeys, setSoldKeys] = useState<Set<string>>(new Set());
  const [selectedChat, setSelectedChat] = useState<ChatRow | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductGroup | null>(null);
  const [markingSold, setMarkingSold] = useState(false);
  // Papelera por fila: primer toque pide confirmación (confirmDeleteId),
  // segundo toque borra de verdad. Solo un id a la vez.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: chats, error } = await supabase
        .from("product_chats")
        .select("id,product_id,sell_request_id,customer_user_id,last_message_at,last_message_preview")
        // Solo las que NO he borrado yo (admin) de mi bandeja — ver
        // delete_chat_for_me. Si el cliente la borró de la suya pero yo no,
        // aquí sigue apareciendo.
        .is("admin_deleted_at", null)
        .order("last_message_at", { ascending: false });

      if (error) throw error;

      const chatRows = (chats ?? []) as Omit<ChatRow, "customer_name">[];
      if (chatRows.length === 0) {
        setGroups([]);
        setSupportChats([]);
        setSellGroups([]);
        return;
      }

      const chatIds = chatRows.map((c) => c.id);
      // product_id/sell_request_id pueden ser null: se filtran antes de
      // pedir por id, que no admite null en el .in(...).
      const productIds = Array.from(
        new Set(chatRows.map((c) => c.product_id).filter((id): id is string => !!id))
      );
      const sellRequestIds = Array.from(
        new Set(chatRows.map((c) => c.sell_request_id).filter((id): id is string => !!id))
      );
      const customerIds = Array.from(new Set(chatRows.map((c) => c.customer_user_id)));

      const [
        { data: products },
        { data: media },
        { data: sellRequests },
        { data: firstMsgs },
        { data: sales },
        { data: realUsers },
      ] = await Promise.all([
        supabase.from("products").select("id,title,images,price_eur").in("id", productIds),
        supabase
          .from("product_media")
          .select("product_id,public_url,is_cover,sort_order")
          .in("product_id", productIds)
          .eq("kind", "image")
          // Solo la portada (marcada o la primera), no las filas de todas las fotos (hasta 30 por producto).
          .or("is_cover.eq.true,sort_order.eq.0")
          .order("is_cover", { ascending: false })
          .order("sort_order", { ascending: true }),
        supabase.from("sell_requests").select("id,articulo").in("id", sellRequestIds),
        supabase
          .from("product_chat_messages")
          .select("chat_id,sender_role,sender_name,created_at")
          .in("chat_id", chatIds)
          .eq("sender_role", "customer")
          .order("created_at", { ascending: true }),
        supabase.from("product_sales").select("product_id,buyer_user_id").in("product_id", productIds),
        // Nombre REAL del cliente aunque todavía no haya escrito ningún
        // mensaje (ver sql/admin_users_by_ids.sql). Si esa función todavía
        // no existe en el proyecto de Supabase (falta ejecutar el script),
        // esto falla en silencio y se cae al nombre sacado de los mensajes.
        supabase.rpc("admin_users_by_ids", { ids: customerIds }).then(
          (res) => res,
          () => ({ data: null })
        ),
      ]);

      const titleById: Record<string, string> = {};
      const imageById: Record<string, string | null> = {};
      const priceById: Record<string, number | null> = {};
      for (const row of (products ?? []) as any[]) {
        titleById[row.id] = row.title ?? "Producto";
        imageById[row.id] = row.images?.[0] ?? null;
        priceById[row.id] = Number.isFinite(Number(row.price_eur)) ? Number(row.price_eur) : null;
      }
      for (const row of (media ?? []) as any[]) {
        if (!imageById[row.product_id]) imageById[row.product_id] = row.public_url;
      }

      const articuloBySellRequest: Record<string, string> = {};
      for (const row of (sellRequests ?? []) as any[]) {
        articuloBySellRequest[row.id] = row.articulo ?? "Artículo";
      }

      // Nombre por chat, sacado del primer mensaje del cliente (solo existe
      // si ya ha escrito algo).
      const nameByChat: Record<string, string> = {};
      for (const row of (firstMsgs ?? []) as any[]) {
        if (!nameByChat[row.chat_id]) nameByChat[row.chat_id] = row.sender_name || "";
      }

      // Nombre real por cliente (id de auth.users), disponible aunque no
      // haya escrito nada todavía. Tiene prioridad sobre el anterior.
      const nameByCustomer: Record<string, string> = {};
      for (const row of (realUsers ?? []) as any[]) {
        const name = (row.full_name || row.username || row.email || "").trim();
        if (name) nameByCustomer[row.id] = name;
      }

      const sold = new Set<string>();
      for (const row of (sales ?? []) as any[]) {
        sold.add(`${row.product_id}:${row.buyer_user_id}`);
      }
      setSoldKeys(sold);

      const byProduct: Record<string, ProductGroup> = {};
      const bySellRequest: Record<string, SellGroup> = {};
      const support: ChatRow[] = [];
      for (const c of chatRows) {
        const customerName = nameByCustomer[c.customer_user_id] || nameByChat[c.id] || "Cliente";
        const chatWithName: ChatRow = { ...c, customer_name: customerName };

        if (c.product_id) {
          const group =
            byProduct[c.product_id] ??
            (byProduct[c.product_id] = {
              product_id: c.product_id,
              product_title: titleById[c.product_id] ?? "Producto",
              product_image: imageById[c.product_id] ?? null,
              product_price: priceById[c.product_id] ?? null,
              chats: [],
            });
          group.chats.push(chatWithName);
          continue;
        }

        if (c.sell_request_id) {
          const group =
            bySellRequest[c.sell_request_id] ??
            (bySellRequest[c.sell_request_id] = {
              sell_request_id: c.sell_request_id,
              articulo: articuloBySellRequest[c.sell_request_id] ?? "Artículo",
              chats: [],
            });
          group.chats.push(chatWithName);
          continue;
        }

        support.push(chatWithName);
      }

      const groupList = Object.values(byProduct).sort((a, b) => {
        const aLatest = a.chats[0]?.last_message_at ?? "";
        const bLatest = b.chats[0]?.last_message_at ?? "";
        return aLatest < bLatest ? 1 : -1;
      });

      const sellGroupList = Object.values(bySellRequest).sort((a, b) => {
        const aLatest = a.chats[0]?.last_message_at ?? "";
        const bLatest = b.chats[0]?.last_message_at ?? "";
        return aLatest < bLatest ? 1 : -1;
      });

      support.sort((a, b) => (a.last_message_at < b.last_message_at ? 1 : -1));

      setGroups(groupList);
      setSupportChats(support);
      setSellGroups(sellGroupList);
    } catch (e) {
      console.error("Error cargando las conversaciones:", e);
      setGroups([]);
      setSupportChats([]);
      setSellGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalChats = useMemo(
    () =>
      groups.reduce((sum, g) => sum + g.chats.length, 0) +
      sellGroups.reduce((sum, g) => sum + g.chats.length, 0) +
      supportChats.length,
    [groups, sellGroups, supportChats]
  );

  // Borra una conversación SOLO de mi bandeja (admin) — ver
  // delete_chat_for_me en la migración. Quita la fila de donde esté
  // (consultas generales, grupo de producto o grupo de venta) sin recargar
  // toda la lista, y si era la que tenía abierta, cierra el detalle.
  async function handleDeleteChat(chat: ChatRow) {
    if (deletingId) return;
    setDeletingId(chat.id);
    try {
      const { error } = await supabase.rpc("delete_chat_for_me", { p_chat_id: chat.id });
      if (error) throw error;

      setSupportChats((prev) => prev.filter((c) => c.id !== chat.id));
      setGroups((prev) =>
        prev.map((g) => ({ ...g, chats: g.chats.filter((c) => c.id !== chat.id) })).filter((g) => g.chats.length > 0)
      );
      setSellGroups((prev) =>
        prev.map((g) => ({ ...g, chats: g.chats.filter((c) => c.id !== chat.id) })).filter((g) => g.chats.length > 0)
      );

      if (selectedChat?.id === chat.id) {
        setSelectedChat(null);
        setSelectedProduct(null);
      }
    } catch (e) {
      console.error("Error borrando la conversación:", e);
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  async function markSold() {
    if (!selectedChat || !selectedChat.product_id || !selectedProduct || markingSold) return;

    setMarkingSold(true);
    try {
      const { error } = await supabase.from("product_sales").insert({
        product_id: selectedChat.product_id,
        buyer_user_id: selectedChat.customer_user_id,
      });
      if (error) throw error;

      setSoldKeys((prev) => new Set(prev).add(`${selectedChat.product_id}:${selectedChat.customer_user_id}`));
    } catch (e) {
      console.error("Error marcando como vendido:", e);
    } finally {
      setMarkingSold(false);
    }
  }

  const selectedKey = selectedChat ? `${selectedChat.product_id}:${selectedChat.customer_user_id}` : "";
  const alreadySold = selectedKey ? soldKeys.has(selectedKey) : false;

  // Lista de conversaciones: llega hasta el final aunque haya muchas (margen inferior + zona
  // segura del iPhone) y el primer toque en una fila ya la abre aunque hubiera teclado.
  const list = (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: pagePadding, paddingBottom: 48 + insets.bottom, gap: 12 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <InvitarRegistro />
      {loading ? (
        <View style={{ alignItems: "center", paddingVertical: 24 }}>
          <CargaMarca texto="Cargando conversaciones…" />
        </View>
      ) : groups.length === 0 && supportChats.length === 0 && sellGroups.length === 0 ? (
        <View style={{ paddingVertical: 24, paddingHorizontal: 12, alignItems: "center", gap: 6 }}>
          <Ionicons name="chatbubble-ellipses-outline" size={24} color={COLORS.muted} />
          <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>Sin conversaciones todavía</Text>
          <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 19 }}>
            Aquí aparecerán los clientes que escriban por «Hablar con el equipo» en Blue IA, o por
            «Chatear con nosotros» en el catálogo.
          </Text>
        </View>
      ) : (
        <>
          {supportChats.length > 0 ? (
            <View
              style={{
                borderRadius: 18,
                backgroundColor: COLORS.card,
                padding: 12,
                gap: 8,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: COLORS.cardSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color={COLORS.muted} />
                </View>
                <Text style={{ flex: 1, color: COLORS.text, fontWeight: "900", fontSize: 14 }}>
                  {TITULO_ATENCION_CLIENTE}
                </Text>
                <Text style={{ color: COLORS.muted2, fontSize: 12 }}>
                  {supportChats.length} {supportChats.length === 1 ? "persona" : "personas"}
                </Text>
              </View>

              <View style={{ gap: 6 }}>
                {supportChats.map((chat) => {
                  const active = selectedChat?.id === chat.id;
                  return (
                    <Pressable
                      key={chat.id}
                      onPress={() => {
                        setSelectedChat(chat);
                        setSelectedProduct(null);
                      }}
                      style={({ pressed }) => ({
                        opacity: pressed ? 0.9 : 1,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        borderRadius: 12,
                        backgroundColor: active ? COLORS.accent2 : COLORS.cardSoft,
                        padding: 10,
                      })}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: "700", fontSize: 13 }}>
                          {chat.customer_name}
                        </Text>
                        <Text numberOfLines={1} style={{ color: COLORS.muted, fontSize: 12 }}>
                          {chat.last_message_preview || "Sin mensajes"}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        <Text style={{ color: COLORS.muted2, fontSize: 11 }}>{formatDate(chat.last_message_at)}</Text>
                        {confirmDeleteId === chat.id ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Pressable onPress={() => setConfirmDeleteId(null)} hitSlop={6}>
                              <Text style={{ color: COLORS.muted2, fontSize: 10, fontWeight: "700" }}>Cancelar</Text>
                            </Pressable>
                            <Pressable onPress={() => handleDeleteChat(chat)} disabled={deletingId === chat.id} hitSlop={6}>
                              <Text style={{ color: "#DC2626", fontSize: 10, fontWeight: "900" }}>
                                {deletingId === chat.id ? "Borrando…" : "Confirmar"}
                              </Text>
                            </Pressable>
                          </View>
                        ) : (
                          <Pressable onPress={() => setConfirmDeleteId(chat.id)} hitSlop={6}>
                            <Ionicons name="trash-outline" size={14} color={COLORS.muted2} />
                          </Pressable>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {sellGroups.length > 0 ? (
            <View
              style={{
                borderRadius: 18,
                backgroundColor: COLORS.card,
                padding: 12,
                gap: 8,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: COLORS.cardSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="pricetag-outline" size={18} color={COLORS.muted} />
                </View>
                <Text style={{ flex: 1, color: COLORS.text, fontWeight: "900", fontSize: 14 }}>
                  Ventas de clientes
                </Text>
                <Text style={{ color: COLORS.muted2, fontSize: 12 }}>
                  {sellGroups.length} {sellGroups.length === 1 ? "solicitud" : "solicitudes"}
                </Text>
              </View>

              <View style={{ gap: 10 }}>
                {sellGroups.map((group) => (
                  <View key={group.sell_request_id} style={{ gap: 6 }}>
                    <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: "800", fontSize: 12.5 }}>
                      {group.articulo}
                    </Text>
                    {group.chats.map((chat) => {
                      const active = selectedChat?.id === chat.id;
                      return (
                        <Pressable
                          key={chat.id}
                          onPress={() => {
                            setSelectedChat(chat);
                            setSelectedProduct(null);
                          }}
                          style={({ pressed }) => ({
                            opacity: pressed ? 0.9 : 1,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                            borderRadius: 12,
                            backgroundColor: active ? COLORS.accent2 : COLORS.cardSoft,
                            padding: 10,
                          })}
                        >
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: "700", fontSize: 13 }}>
                              {chat.customer_name}
                            </Text>
                            <Text numberOfLines={1} style={{ color: COLORS.muted, fontSize: 12 }}>
                              {chat.last_message_preview || "Sin mensajes"}
                            </Text>
                          </View>
                          <View style={{ alignItems: "flex-end", gap: 4 }}>
                            <Text style={{ color: COLORS.muted2, fontSize: 11 }}>
                              {formatDate(chat.last_message_at)}
                            </Text>
                            {confirmDeleteId === chat.id ? (
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                <Pressable onPress={() => setConfirmDeleteId(null)} hitSlop={6}>
                                  <Text style={{ color: COLORS.muted2, fontSize: 10, fontWeight: "700" }}>
                                    Cancelar
                                  </Text>
                                </Pressable>
                                <Pressable
                                  onPress={() => handleDeleteChat(chat)}
                                  disabled={deletingId === chat.id}
                                  hitSlop={6}
                                >
                                  <Text style={{ color: "#DC2626", fontSize: 10, fontWeight: "900" }}>
                                    {deletingId === chat.id ? "Borrando…" : "Confirmar"}
                                  </Text>
                                </Pressable>
                              </View>
                            ) : (
                              <Pressable onPress={() => setConfirmDeleteId(chat.id)} hitSlop={6}>
                                <Ionicons name="trash-outline" size={14} color={COLORS.muted2} />
                              </Pressable>
                            )}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {groups.map((group) => (
          <View
            key={group.product_id}
            style={{
              borderRadius: 18,
              backgroundColor: COLORS.card,
              padding: 12,
              gap: 8,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              {group.product_image ? (
                <Image
                  source={{ uri: group.product_image }}
                  style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.cardSoft }}
                />
              ) : (
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: COLORS.cardSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="cube-outline" size={18} color={COLORS.muted} />
                </View>
              )}
              <Text numberOfLines={1} style={{ flex: 1, color: COLORS.text, fontWeight: "900", fontSize: 14 }}>
                {group.product_title}
              </Text>
              <Text style={{ color: COLORS.muted2, fontSize: 12 }}>
                {group.chats.length} {group.chats.length === 1 ? "persona" : "personas"}
              </Text>
            </View>

            <View style={{ gap: 6 }}>
              {group.chats.map((chat) => {
                const key = `${chat.product_id}:${chat.customer_user_id}`;
                const sold = soldKeys.has(key);
                const active = selectedChat?.id === chat.id;
                return (
                  <Pressable
                    key={chat.id}
                    onPress={() => {
                      setSelectedChat(chat);
                      setSelectedProduct(group);
                    }}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.9 : 1,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      borderRadius: 12,
                      backgroundColor: active ? COLORS.accent2 : COLORS.cardSoft,
                      padding: 10,
                    })}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: "700", fontSize: 13 }}>
                        {chat.customer_name}
                      </Text>
                      <Text numberOfLines={1} style={{ color: COLORS.muted, fontSize: 12 }}>
                        {chat.last_message_preview || "Sin mensajes"}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      {sold ? (
                        <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
                      ) : (
                        <Text style={{ color: COLORS.muted2, fontSize: 11 }}>{formatDate(chat.last_message_at)}</Text>
                      )}
                      {confirmDeleteId === chat.id ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Pressable onPress={() => setConfirmDeleteId(null)} hitSlop={6}>
                            <Text style={{ color: COLORS.muted2, fontSize: 10, fontWeight: "700" }}>Cancelar</Text>
                          </Pressable>
                          <Pressable onPress={() => handleDeleteChat(chat)} disabled={deletingId === chat.id} hitSlop={6}>
                            <Text style={{ color: "#DC2626", fontSize: 10, fontWeight: "900" }}>
                              {deletingId === chat.id ? "Borrando…" : "Confirmar"}
                            </Text>
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable onPress={() => setConfirmDeleteId(chat.id)} hitSlop={6}>
                          <Ionicons name="trash-outline" size={14} color={COLORS.muted2} />
                        </Pressable>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
          ))}
        </>
      )}
    </ScrollView>
  );

  // Hilo abierto: ocupa todo el alto disponible (la caja de escribir queda abajo, a la vista)
  // y deja libre la zona segura inferior del iPhone para que no la tape la barra de inicio.
  const detail = selectedChat ? (
    <View style={{ flex: 1, minHeight: 0, paddingBottom: insets.bottom, backgroundColor: COLORS.bg }}>
      <ProductChatThread
        chatId={selectedChat.id}
        bajoCabecera={
          // Ventas de clientes (nos venden ellos): sin seguimiento. En las demás, asignar uno a este cliente.
          selectedChat.sell_request_id ? undefined : (
            <AsignarSeguimiento
              key={selectedChat.id}
              chatId={selectedChat.id}
              esProducto={!!selectedChat.product_id}
              tituloInicial={selectedChat.product_id ? selectedProduct?.product_title ?? "" : ""}
              precioInicial={selectedChat.product_id ? selectedProduct?.product_price ?? null : null}
            />
          )
        }
        onDeleted={() => {
          // Igual que la papelera de cada fila: solo desaparece de esta
          // bandeja (admin); recargar trae la lista al día por si acaso.
          setSelectedChat(null);
          setSelectedProduct(null);
          load();
        }}
        headerRight={
          // Consulta general (sin producto): no hay nada que "marcar como
          // vendido" aquí, así que no se muestra ningún botón.
          !selectedChat.product_id ? undefined : alreadySold ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: COLORS.successBorder,
                backgroundColor: COLORS.successBg,
                paddingVertical: 8,
                paddingHorizontal: 12,
              }}
            >
              <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
              <Text style={{ color: COLORS.success, fontWeight: "900", fontSize: 12 }}>Ya vendido</Text>
            </View>
          ) : (
            <Pressable
              onPress={markSold}
              disabled={markingSold}
              style={({ pressed }) => ({
                opacity: markingSold ? 0.6 : pressed ? 0.88 : 1,
                borderRadius: 999,
                paddingVertical: 8,
                paddingHorizontal: 12,
                backgroundColor: COLORS.accentDark,
              })}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 12 }}>
                {markingSold ? "Marcando…" : "Marcar como vendido"}
              </Text>
            </Pressable>
          )
        }
      />
    </View>
  ) : (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20 }}>
      <Text style={{ color: COLORS.muted, textAlign: "center" }}>
        Elige una conversación para ver los mensajes.
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />
      {/* Antes iba dentro de SafeAreaView (solo hace algo en iOS nativo): ahora la cabecera,
          la lista y el hilo suman la zona segura real (también en el iPhone desde la web). */}
      <View style={{ flex: 1, minHeight: 0, backgroundColor: COLORS.bg }}>
        {/* Cabecera fija y compacta (volver + título centrado), igual en todo el panel. */}
        <View
          style={{
            paddingHorizontal: pagePadding,
            paddingTop: 10 + insets.top,
            paddingBottom: 10,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
            backgroundColor: COLORS.bg2,
          }}
        >
          <View style={{ ...columnStyle, minHeight: 40, justifyContent: "center" }}>
            <Pressable
              onPress={() => {
                if (isMobile && selectedChat) {
                  setSelectedChat(null);
                  setSelectedProduct(null);
                  return;
                }
                router.push("/admin");
              }}
              accessibilityRole="button"
              accessibilityLabel={isMobile && selectedChat ? "Volver a las conversaciones" : "Volver al panel"}
              hitSlop={8}
              style={({ pressed }) => ({
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 40,
                // Por encima del título (que ocupa todo el ancho y va después): si no, el título se quedaba el toque y
                // «Volver» no respondía en el móvil.
                zIndex: 1,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Ionicons name="chevron-back" size={24} color={COLORS.text} />
            </Pressable>

            <View style={{ paddingHorizontal: 44, alignItems: "center" }}>
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: isMobile ? 19 : 22, textAlign: "center" }}>
                Chat
              </Text>
              <Text style={{ color: COLORS.muted2, fontSize: 12, textAlign: "center" }}>
                {totalChats} {totalChats === 1 ? "conversación" : "conversaciones"}
              </Text>
            </View>
          </View>
        </View>

        {isMobile ? (
          selectedChat ? detail : list
        ) : (
          <View style={{ ...columnStyle, flex: 1, minHeight: 0, flexDirection: "row" }}>
            <View style={{ width: 360, borderRightWidth: 1, borderRightColor: COLORS.border }}>{list}</View>
            {detail}
          </View>
        )}
      </View>
    </View>
  );
}
