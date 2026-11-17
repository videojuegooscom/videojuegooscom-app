/**
 * Archivo: components/ConversacionProducto.tsx
 * Función: componente de la conversación privada cliente-tienda (chat de producto, de venta o de atención al cliente).
 * Para qué sirve: carga mensajes en tiempo real de un chat (product_chats), permite escribir, borrar la conversación para uno mismo y abrir el chat con el equipo (abrirChatEquipo); lo comparten la pantalla del cliente y la bandeja del administrador.
 * Conectado con: lib/supabase.ts, lib/analiticaPropia.ts, lib/admin/productos.utilidades.ts (fmtEUR), components/ImagenInteligente.tsx, constants/theme.ts, tablas product_chats y mensajes, funciones SQL get_or_create_*_chat y delete_chat_for_me.
 * Utilizado por: app/chat/[chatId].tsx, app/admin/chats.tsx, components/VentanaValoracion.tsx (abrirChatEquipo) y pantallas que abren el chat del equipo (checkout, producto, perfil, Blue IA, Foro, analítica).
 * Dependencias: react, react-native, @expo/vector-icons, expo-router.
 * Estado: ACTIVO
 *
 * Notas: cabecera original conservada justo debajo.
 */
/**
 * Notas:
 * Qué hace: la conversación PRIVADA de un producto concreto entre un
 * cliente y la tienda (distinta del Chat Global, que es público). La usan
 * dos pantallas distintas sin duplicar la lógica:
 * - app/chat/[chatId].tsx → el cliente ve y escribe en SU propia
 *   conversación sobre un producto.
 * - app/admin/chats.tsx → Jefe abre cualquier conversación desde la
 *   bandeja de admin (ahí además se le añade, por fuera de este
 *   componente vía `headerRight`, el botón "Marcar como vendido").
 *
 * Cómo funciona:
 * - Recibe solo el `chatId` (fila de product_chats, ver
 *   sql/product_chats.sql). Con eso carga el producto (título, foto de
 *   portada) y los mensajes, y se suscribe en tiempo real a los mensajes
 *   nuevos de esa conversación con supabase.channel(...).on("postgres_changes",
 *   { event: "INSERT", filter: "chat_id=eq.<chatId>" }, ...), igual que hace
 *   app/(tabs)/chat-global.tsx con el chat público.
 * - "¿Es mío este mensaje?" se decide comparando message.sender_user_id con
 *   la sesión actual (auth.uid()), no con el rol — así funciona igual tanto
 *   si lo abre el cliente como si lo abre un admin.
 * - Enviar un mensaje solo manda el texto: quién escribe (nombre, rol) lo
 *   rellena siempre un trigger en la base de datos a partir de la sesión
 *   real (ver sql/product_chats.sql), igual que en Chat Global y en las
 *   reseñas.
 * - Tres "tipos" de conversación, según qué columna tenga rellena la fila
 *   de product_chats: product_id → chat de un producto (título/foto real);
 *   sell_request_id → chat de una solicitud de "Vender ahora" (título
 *   "Venta: <artículo>", ver components/VenderAhoraModal.tsx y la migración
 *   get_or_create_sell_request_chat); ninguno de los dos → "Atención
 *   al cliente" (botón "Chatear con nosotros" de app/catalogo.tsx, vía
 *   get_or_create_support_chat, o "Hablar con el equipo" de Blue IA y la
 *   confirmación de pedido, vía abrirChatEquipo de este mismo archivo). chatKind decide qué título/icono mostrar.
 * - Borrar conversación (icono de papelera en la cabecera): llama a
 *   delete_chat_for_me(chat_id), que marca SOLO el lado de quien la borra
 *   (cliente o admin, la función lo decide sola con is_admin()) — el otro
 *   lado sigue viéndola hasta que también la borre. Cuando ambos lados la
 *   han borrado, un trigger en la base de datos la elimina de verdad. Pide
 *   confirmación con una franja bajo la cabecera antes de llamar a la
 *   función, y avisa al padre (prop onDeleted) para que salga de la
 *   pantalla o refresque su lista.
 *
 * - Chat con el producto adjunto (mejora 10, 2026-11-15): en las conversaciones de un producto, una TARJETA fijada
 *   arriba del hilo (TarjetaArticuloChat: foto pequeña, título, precio actual y estado a la venta / vendido / retirado
 *   con cargarArticulosChat). El cliente tiene «Ver el artículo» (mientras esté a la venta) y, hasta que escribe, chips de
 *   44 px con primeras preguntas (SUGERENCIAS_CHAT_PRODUCTO) que rellenan el campo sin enviarlo; el administrador, «Ver la
 *   ficha» y «Editar en Productos» (/admin/products?editar=<id>). abrirChatProducto lo abre desde la ficha. Analítica
 *   propia sin datos de nadie ni el texto: chat_producto_abierto, chat_producto_sugerencia (cuál), chat_producto_enviado
 *   (primera o no; Administración → Analítica, «Preguntas por artículos»). Sin migración: product_chats ya era una fila
 *   por (producto, cliente).
 *
 * Conectado con:
 * - lib/supabase.ts → sesión, lectura/envío de mensajes, tiempo real.
 * - sql/product_chats.sql → tablas y función get_or_create_product_chat
 *   (get_or_create_support_chat, get_or_create_sell_request_chat y
 *   delete_chat_for_me viven ya solo como migración de Supabase, no en
 *   ningún archivo .sql local — ver sql/README.md).
 * - components/VenderAhoraModal.tsx → crea chats con sell_request_id.
 * - app/chat/[chatId].tsx, app/admin/chats.tsx → lo incrustan.
 * - Tamaños del móvil (grupo 5, 2026-11-13; constants/theme.ts): ningún texto de menos de 13 px, grises
 *   desde COLORES_TEXTO.secundario, la papelera y los botones de borrar de 44 px y el campo de 16 px y 48.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";
import { trackEvent } from "../lib/analiticaPropia";
import { fmtEUR } from "../lib/admin/productos.utilidades";
import SmartImage from "./ImagenInteligente";
import { CAMPO, COLORES_TEXTO, TACTIL, TAMANOS } from "../constants/theme";

// Título de las conversaciones sin producto ni venta (chat general con la tienda).
export const TITULO_ATENCION_CLIENTE = "Atención al cliente";

// --- Chat con el producto adjunto (mejora 10, 2026-11-15) ------------------------------------------------------------
// Primeras preguntas sugeridas (chips de 44 px): rellenan el campo, nunca se envían solas. Sin «¿Puedo verlo en persona?»:
// la tienda es solo online (sin tienda física), así que se pregunta por la garantía.
export const SUGERENCIAS_CHAT_PRODUCTO = ["¿Sigue disponible?", "¿En qué estado está?", "¿Hacéis envíos a mi zona?", "¿Tiene garantía?"] as const;

export type EstadoArticulo = "venta" | "vendido" | "retirado";
export const ETIQUETA_ESTADO_ARTICULO: Record<EstadoArticulo, string> = { venta: "A la venta", vendido: "Vendido", retirado: "Retirado" };

export type ArticuloChat = {
  id: string;
  /** null: el cliente ya no lo puede leer (retirado o vendido: la política solo enseña lo publicado). */
  titulo: string | null;
  precio: number | null;
  foto: string | null;
  estado: EstadoArticulo;
};

/**
 * Producto de una o varias conversaciones, con su estado: «vendido» si tiene una venta registrada (product_sales, que
 * se lee en público), «a la venta» si está publicado y visible, y si no, «retirado». Para el cliente, lo que ya no está
 * publicado no llega (RLS de products): sale sin título y como retirado, o como vendido si consta la venta.
 */
export async function cargarArticulosChat(ids: string[]): Promise<Map<string, ArticuloChat>> {
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  const mapa = new Map<string, ArticuloChat>();
  if (!unicos.length) return mapa;
  const [prods, fotos, ventas] = await Promise.all([
    supabase.from("products").select("id,title,images,price_eur,status,is_active").in("id", unicos),
    supabase
      .from("product_media")
      .select("product_id,public_url,is_cover,sort_order")
      .in("product_id", unicos)
      .eq("kind", "image")
      // Solo la portada (marcada o la primera), no las filas de todas las fotos (hasta 30 por producto).
      .or("is_cover.eq.true,sort_order.eq.0")
      .order("is_cover", { ascending: false })
      .order("sort_order", { ascending: true }),
    supabase.from("product_sales").select("product_id").in("product_id", unicos),
  ]);
  type FilaProducto = { id: string; title: string | null; images: string[] | null; price_eur: unknown; status: string | null; is_active: boolean | null };
  const porId = new Map(((prods.error ? [] : prods.data) ?? []).map((f) => [String((f as FilaProducto).id), f as FilaProducto]));
  const portada = new Map<string, string>();
  for (const f of ((fotos.error ? [] : fotos.data) ?? []) as { product_id: string; public_url: string | null }[]) {
    if (f.public_url && !portada.has(f.product_id)) portada.set(f.product_id, f.public_url);
  }
  const vendidos = new Set(((ventas.error ? [] : ventas.data) ?? []).map((f) => String((f as { product_id: string }).product_id)));
  for (const id of unicos) {
    const f = porId.get(id);
    const precio = f && Number.isFinite(Number(f.price_eur)) ? Number(f.price_eur) : null;
    const estado: EstadoArticulo = vendidos.has(id) ? "vendido" : f && f.status === "PUBLISHED" && f.is_active ? "venta" : "retirado";
    mapa.set(id, { id, titulo: f?.title ?? null, precio, foto: portada.get(id) ?? f?.images?.[0] ?? null, estado });
  }
  return mapa;
}

const COLOR_ESTADO: Record<EstadoArticulo, { fondo: string; texto: string }> = {
  venta: { fondo: "#DCFCE7", texto: "#166534" },
  vendido: { fondo: "#EEF3F8", texto: "#0B2138" },
  retirado: { fondo: "#FFF1F0", texto: "#9F1239" },
};

export function EtiquetaEstadoArticulo({ estado, nativeID }: { estado: EstadoArticulo; nativeID?: string }) {
  const c = COLOR_ESTADO[estado];
  return (
    <View nativeID={nativeID} style={{ alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: c.fondo }}>
      <Text style={{ color: c.texto, fontWeight: "800", fontSize: TAMANOS.minimo }}>{ETIQUETA_ESTADO_ARTICULO[estado]}</Text>
    </View>
  );
}

function EnlaceTarjeta({ nativeID, texto, icono, onPress }: { nativeID: string; texto: string; icono: React.ComponentProps<typeof Ionicons>["name"]; onPress: () => void }) {
  return (
    <Pressable
      nativeID={nativeID}
      onPress={onPress}
      accessibilityRole="link"
      style={({ pressed }) => ({ minHeight: TACTIL.minimo, flexDirection: "row", alignItems: "center", gap: 4, paddingRight: 4, opacity: pressed ? 0.7 : 1 })}
    >
      <Ionicons name={icono} size={15} color={COLORES_TEXTO.azulTexto} />
      <Text style={{ color: COLORES_TEXTO.azulTexto, fontWeight: "800", fontSize: TAMANOS.minimo }}>{texto}</Text>
    </Pressable>
  );
}

/**
 * Tarjeta del producto fijada arriba del hilo (y en Administración → Chats): foto pequeña, título, precio actual y estado.
 * El cliente tiene «Ver el artículo» mientras está a la venta; el administrador, la ficha y «Editar en Productos».
 */
export function TarjetaArticuloChat({ articulo, modo, nativeID = "chat-producto-tarjeta" }: { articulo: ArticuloChat; modo: "cliente" | "admin"; nativeID?: string }) {
  const verFicha = () => router.push(`/producto/${articulo.id}` as never);
  const enVenta = articulo.estado === "venta";
  return (
    <View nativeID={nativeID} style={{ width: "100%", maxWidth: 640, flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: "#E3EAF2", backgroundColor: "#FFFFFF" }}>
      {articulo.foto ? (
        <SmartImage uri={articulo.foto} ancho={56} alt={articulo.titulo ?? "Artículo"} style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: "#F6FAFD" }} />
      ) : (
        <View style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: "#F6FAFD", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="cube-outline" size={20} color={COLORES_TEXTO.secundario} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text nativeID={`${nativeID}-titulo`} numberOfLines={2} style={{ color: COLORES_TEXTO.texto, fontWeight: "900", fontSize: TAMANOS.cuerpo, lineHeight: 20 }}>
          {articulo.titulo ?? "Este artículo ya no está a la venta"}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 8, rowGap: 2 }}>
          {articulo.precio !== null && articulo.titulo ? (
            <Text nativeID={`${nativeID}-precio`} style={{ color: COLORES_TEXTO.texto, fontWeight: "900", fontSize: TAMANOS.cuerpo }}>
              {fmtEUR(articulo.precio)}
            </Text>
          ) : null}
          {modo === "admin" || !enVenta ? <EtiquetaEstadoArticulo estado={articulo.estado} nativeID={`${nativeID}-estado`} /> : null}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 14, marginBottom: -10, marginTop: -4 }}>
          {modo === "cliente" ? (
            enVenta ? <EnlaceTarjeta nativeID={`${nativeID}-ver`} texto="Ver el artículo" icono="open-outline" onPress={verFicha} /> : null
          ) : (
            <>
              <EnlaceTarjeta nativeID={`${nativeID}-ver`} texto="Ver la ficha" icono="open-outline" onPress={verFicha} />
              <EnlaceTarjeta
                nativeID={`${nativeID}-editar`}
                texto="Editar en Productos"
                icono="create-outline"
                onPress={() => router.push({ pathname: "/admin/products", params: { editar: articulo.id } } as never)}
              />
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const RESUMEN_MAX = 1200;

/**
 * Abre (o crea) el chat privado del cliente con el equipo y navega a él.
 * - Con productId: chat de ese producto (get_or_create_product_chat).
 * - Sin productId: el chat general más reciente del cliente (sin producto ni
 *   venta, no borrado por él) o uno nuevo.
 * - Con resumen: lo manda como primer mensaje del cliente (last_message_* lo
 *   actualiza el trigger de la base de datos).
 * Devuelve "login" si no hay sesión (quien llama decide a dónde llevarle).
 */
export async function abrirChatEquipo({
  productId,
  resumen,
  borrador,
}: {
  productId?: string | null;
  resumen?: string;
  /** Texto que queda ESCRITO en la casilla, sin enviar (valoración baja de un pedido: «Sobre mi pedido VZ-…: »). */
  borrador?: string;
} = {}): Promise<"ok" | "login"> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return "login";

  let chatId: string | null = null;

  if (productId) {
    const { data, error } = await supabase.rpc("get_or_create_product_chat", { p_product_id: productId });
    if (error) throw error;
    chatId = data ? String(data) : null;
  } else {
    const { data: existing, error: findErr } = await supabase
      .from("product_chats")
      .select("id")
      .eq("customer_user_id", userId)
      .is("product_id", null)
      .is("sell_request_id", null)
      .is("customer_deleted_at", null)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (findErr) throw findErr;

    if (existing?.id) {
      chatId = existing.id;
    } else {
      const { data: created, error: insErr } = await supabase
        .from("product_chats")
        .insert({ product_id: null, customer_user_id: userId })
        .select("id")
        .single<{ id: string }>();
      if (insErr) throw insErr;
      chatId = created.id;
    }
  }

  if (!chatId) throw new Error("No se ha podido abrir el chat.");

  const texto = (resumen ?? "").trim();
  if (texto) {
    const body = texto.length > RESUMEN_MAX ? `${texto.slice(0, RESUMEN_MAX - 1)}…` : texto;
    const { error: msgErr } = await supabase.from("product_chat_messages").insert({ chat_id: chatId, body });
    // Si el resumen falla, se abre el chat igualmente.
    if (msgErr) console.error("Error enviando el resumen al chat:", msgErr);
  }

  const casilla = (borrador ?? "").slice(0, 300);
  router.push({ pathname: "/chat/[chatId]", params: casilla ? { chatId, borrador: casilla } : { chatId } } as never);
  return "ok";
}

/**
 * «Preguntar por este artículo» (ficha del producto): abre la conversación de (este producto, este cliente) —la que ya
 * hay o una nueva: get_or_create_product_chat nunca la duplica— y lo mide como chat_producto_abierto (solo el producto).
 * Devuelve "login" sin sesión (la ficha invita a crear la cuenta).
 */
export async function abrirChatProducto(productId: string): Promise<"ok" | "login"> {
  const r = await abrirChatEquipo({ productId });
  if (r === "ok") void trackEvent("chat_producto_abierto", "Chat con el producto: abierto", { path: `/producto/${productId}`, metadata: { productId } });
  return r;
}

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: COLORES_TEXTO.secundario,
  muted2: COLORES_TEXTO.secundario,
  accent: "#1EA7E8",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  bubbleMine: "rgba(0,170,228,0.16)",
  bubbleOther: "#F1F6FA",
};

const MESSAGE_MAX = 2000;

type ChatMessage = {
  id: string;
  created_at: string;
  chat_id: string;
  sender_user_id: string;
  sender_role: "customer" | "admin";
  sender_name: string;
  body: string;
};

type ProductInfo = {
  title: string;
  imageUrl: string | null;
};

function formatMsgTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function AnimatedPressable({
  onPress,
  disabled,
  style,
  children,
  etiqueta,
  nativeID,
}: {
  onPress?: () => void;
  disabled?: boolean;
  style?: any;
  children?: React.ReactNode;
  etiqueta?: string;
  nativeID?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      nativeID={nativeID}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      onPressIn={() => Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 50, bounciness: 6 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }).start()}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

type ChatKind = "product" | "sell" | "support";

export default function ProductChatThread({
  chatId,
  headerRight,
  bajoCabecera,
  onDeleted,
  borradorInicial,
}: {
  chatId: string;
  /** Texto que ya sale escrito en la casilla (sin enviar): lo manda abrirChatEquipo({ borrador }). */
  borradorInicial?: string;
  headerRight?: React.ReactNode;
  /** Franja bajo la cabecera (Administración → Chat: «Asignar seguimiento» a este cliente). */
  bajoCabecera?: React.ReactNode;
  /** Se llama justo después de borrar la conversación (por mi lado) con
   * éxito, para que la pantalla que incrusta este componente pueda salir o
   * refrescar su lista (ver app/chat/[chatId].tsx, app/admin/chats.tsx). */
  onDeleted?: () => void;
}) {
  const [meId, setMeId] = useState<string | null>(null);
  const [product, setProduct] = useState<ProductInfo | null>(null);
  // Chat con el producto adjunto: la tarjeta de arriba y si quien mira es el cliente dueño de la conversación (chips y analítica).
  const [articulo, setArticulo] = useState<ArticuloChat | null>(null);
  const [soyCliente, setSoyCliente] = useState(false);
  // Ya ha preguntado en esta visita (los mensajes nuevos llegan por tiempo real; los chips se van al enviar).
  const [yaPregunto, setYaPregunto] = useState(false);
  const sugerenciaUsada = useRef<string | null>(null);
  const campoRef = useRef<TextInput>(null);
  const [sellArticulo, setSellArticulo] = useState<string | null>(null);
  const [chatKind, setChatKind] = useState<ChatKind | null>(null);
  const [customerName, setCustomerName] = useState<string>("Cliente");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(() => (borradorInicial ?? "").slice(0, MESSAGE_MAX));
  const [sending, setSending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const yo = sessionData.session?.user?.id ?? null;
      setMeId(yo);

      const { data: chatRow } = await supabase
        .from("product_chats")
        .select("id,product_id,sell_request_id,customer_user_id")
        .eq("id", chatId)
        .maybeSingle<{
          id: string;
          product_id: string | null;
          sell_request_id: string | null;
          customer_user_id: string;
        }>();

      setSoyCliente(!!yo && chatRow?.customer_user_id === yo);
      // Otra conversación en el mismo hilo (Administración → Chat): nada de la anterior.
      setYaPregunto(false);
      sugerenciaUsada.current = null;
      if (!chatRow?.product_id) setArticulo(null);

      if (chatRow?.product_id) {
        setChatKind("product");

        // Producto adjunto: foto, título, precio actual y estado (a la venta / vendido / retirado).
        const art = (await cargarArticulosChat([chatRow.product_id])).get(chatRow.product_id) ?? null;
        setArticulo(art);
        setProduct({ title: art?.titulo ?? "Producto", imageUrl: art?.foto ?? null });
      } else if (chatRow?.sell_request_id) {
        setChatKind("sell");

        const { data: sellRow } = await supabase
          .from("sell_requests")
          .select("articulo")
          .eq("id", chatRow.sell_request_id)
          .maybeSingle<{ articulo: string }>();
        setSellArticulo(sellRow?.articulo ?? null);
      } else {
        setChatKind("support");
      }

      const { data: msgRows, error } = await supabase
        .from("product_chat_messages")
        .select("id,created_at,chat_id,sender_user_id,sender_role,sender_name,body")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true })
        .limit(300);

      if (error) throw error;

      const rows = (msgRows ?? []) as ChatMessage[];
      setMessages(rows);

      const firstCustomerMsg = rows.find((m) => m.sender_role === "customer");
      if (firstCustomerMsg) setCustomerName(firstCustomerMsg.sender_name || "Cliente");
    } catch {
      // Sin datos: se queda vacío en vez de romper la pantalla.
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    load();
  }, [load]);

  // Al abrir la conversación se marca como leída del lado de quien la abre
  // (cliente o admin, lo decide sql/product_chats.sql). Así el contador de
  // components/AsistenteBlue.tsx baja en cuanto se lee, sin esperar a nada más.
  useEffect(() => {
    if (!chatId) return;
    supabase.rpc("mark_chat_read", { p_chat_id: chatId }).then(
      () => {},
      () => {}
    );
  }, [chatId]);

  useEffect(() => {
    if (!chatId) return;

    const channel = supabase
      .channel(`product_chat_${chatId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "product_chat_messages", filter: `chat_id=eq.${chatId}` },
        (payload) => {
          const row = payload.new as ChatMessage;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          if (row.sender_role === "customer") setCustomerName(row.sender_name || "Cliente");
          // Mensaje ajeno mientras el hilo está abierto: se marca leído al
          // instante para que la campanita no lo cuente.
          if (row.sender_user_id !== meId) {
            supabase.rpc("mark_chat_read", { p_chat_id: chatId }).then(
              () => {},
              () => {}
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, meId]);

  useEffect(() => {
    if (!loading) requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length, loading]);

  // ¿El cliente ya ha escrito en esta conversación? Mientras no, se le sugieren primeras preguntas.
  const yaPreguntoAntes = yaPregunto || messages.some((m) => m.sender_role === "customer");
  const conSugerencias = chatKind === "product" && soyCliente && !!articulo && !yaPreguntoAntes;

  function usarSugerencia(texto: string) {
    setDraft(texto);
    sugerenciaUsada.current = texto;
    campoRef.current?.focus();
    if (articulo) void trackEvent("chat_producto_sugerencia", `Chat con el producto: sugerencia «${texto}»`, { path: `/producto/${articulo.id}`, metadata: { productId: articulo.id, sugerencia: texto } });
  }

  async function handleSend() {
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    try {
      const { error } = await supabase.from("product_chat_messages").insert({ chat_id: chatId, body });
      if (error) throw error;
      setDraft("");
      // Pregunta por un artículo (solo el cliente; nunca el texto): si era la primera y si salió de una sugerencia.
      if (chatKind === "product" && soyCliente && articulo) {
        void trackEvent("chat_producto_enviado", "Chat con el producto: mensaje enviado", {
          path: `/producto/${articulo.id}`,
          metadata: { productId: articulo.id, primera: !yaPreguntoAntes, sugerencia: sugerenciaUsada.current !== null && sugerenciaUsada.current === body },
        });
        sugerenciaUsada.current = null;
        setYaPregunto(true);
      }
    } catch {
      // Se deja el texto escrito para que la persona pueda reintentar.
    } finally {
      setSending(false);
    }
  }

  const headerTitle = useMemo(() => {
    if (chatKind === "sell") return sellArticulo ? `Venta: ${sellArticulo}` : "Venta de un artículo";
    if (chatKind === "support") return TITULO_ATENCION_CLIENTE;
    // Con la tarjeta del producto arriba, la cabecera no repite el título.
    if (chatKind === "product" && articulo) return "Pregunta por un artículo";
    return product?.title ?? "Conversación";
  }, [chatKind, sellArticulo, product, articulo]);

  async function handleDeleteChat() {
    if (deleting) return;
    setDeleting(true);
    try {
      const { error } = await supabase.rpc("delete_chat_for_me", { p_chat_id: chatId });
      if (error) throw error;
      onDeleted?.();
    } catch (e) {
      console.error("Error borrando la conversación:", e);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          padding: 14,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
          backgroundColor: COLORS.bg2,
        }}
      >
        {product?.imageUrl && !articulo ? (
          <Image
            source={{ uri: product.imageUrl }}
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
            <Ionicons
              name={
                chatKind === "sell"
                  ? "pricetag-outline"
                  : chatKind === "support" || articulo
                    ? "chatbubble-ellipses-outline"
                    : "cube-outline"
              }
              size={18}
              color={COLORS.muted}
            />
          </View>
        )}

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: "900", fontSize: 15 }}>
            {headerTitle}
          </Text>
          <Text numberOfLines={1} style={{ color: COLORS.muted2, fontSize: TAMANOS.minimo }}>
            {/* El cliente habla con la tienda (no «Con» su propio nombre). */}
            {soyCliente ? "Con el equipo de la tienda" : `Con ${customerName}`}
          </Text>
        </View>

        <Pressable
          onPress={() => setConfirmDelete(true)}
          hitSlop={8}
          style={({ pressed }) => ({
            opacity: pressed ? 0.7 : 1,
            width: TACTIL.minimo,
            height: TACTIL.minimo,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <Ionicons name="trash-outline" size={18} color={COLORS.muted} />
        </Pressable>

        {headerRight}
      </View>

      {confirmDelete ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            padding: 12,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
            backgroundColor: "#FFF1F0",
          }}
        >
          <Ionicons name="trash-outline" size={16} color="#B91C1C" />
          <Text style={{ flex: 1, color: "#7A271A", fontSize: TAMANOS.minimo, lineHeight: 18 }}>
            ¿Borrar esta conversación? Se te dejará de mostrar a ti; si el otro lado no la ha
            borrado también, seguirá viéndola.
          </Text>
          <Pressable
            onPress={() => setConfirmDelete(false)}
            disabled={deleting}
            style={({ pressed }) => ({
              opacity: pressed ? 0.85 : 1,
              minHeight: TACTIL.minimo,
              justifyContent: "center",
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor: "#FFFFFF",
              borderWidth: 1,
              borderColor: COLORS.border,
            })}
          >
            <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo }}>Cancelar</Text>
          </Pressable>
          <Pressable
            onPress={handleDeleteChat}
            disabled={deleting}
            style={({ pressed }) => ({
              opacity: deleting ? 0.6 : pressed ? 0.88 : 1,
              minHeight: TACTIL.minimo,
              justifyContent: "center",
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor: "#DC2626",
            })}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: TAMANOS.minimo }}>
              {deleting ? "Borrando…" : "Borrar"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Producto adjunto, fijado arriba del hilo (no se desplaza con los mensajes). */}
      {chatKind === "product" && articulo ? (
        <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 2, backgroundColor: COLORS.bg }}>
          <TarjetaArticuloChat articulo={articulo} modo={soyCliente ? "cliente" : "admin"} />
        </View>
      ) : null}

      {bajoCabecera}

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={COLORS.accent} />
        </View>
      ) : (
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 14, gap: 8 }}>
          {messages.length === 0 ? (
            <Text nativeID="chat-vacio" style={{ color: COLORS.muted, textAlign: "center", marginTop: 20, lineHeight: 20 }}>
              {conSugerencias
                ? "Pregúntanos lo que quieras de este artículo: te contestamos aquí y te avisamos cuando respondamos."
                : "Todavía no hay mensajes. Escribe el primero."}
            </Text>
          ) : (
            messages.map((m) => {
              const mine = m.sender_user_id === meId;
              return (
                <View
                  key={m.id}
                  style={{
                    alignSelf: mine ? "flex-end" : "flex-start",
                    maxWidth: "82%",
                    gap: 2,
                  }}
                >
                  <View
                    style={{
                      borderRadius: 16,
                      paddingVertical: 9,
                      paddingHorizontal: 13,
                      backgroundColor: mine ? COLORS.bubbleMine : COLORS.bubbleOther,
                    }}
                  >
                    <Text style={{ color: COLORS.text, fontSize: TAMANOS.cuerpo, lineHeight: 21 }}>{m.body}</Text>
                  </View>
                  <Text
                    style={{
                      color: COLORS.muted2,
                      fontSize: TAMANOS.minimo,
                      textAlign: mine ? "right" : "left",
                      marginHorizontal: 4,
                    }}
                  >
                    {mine ? "Tú" : m.sender_name} · {formatMsgTime(m.created_at)}
                  </Text>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Primeras preguntas sugeridas: rellenan el campo (no se envían solas); se van en cuanto el cliente pregunta. */}
      {conSugerencias && !loading ? (
        <View nativeID="chat-producto-sugerencias" style={{ paddingHorizontal: 12, paddingTop: 8, gap: 6, borderTopWidth: 1, borderTopColor: COLORS.border }}>
          <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, fontWeight: "700" }}>Preguntas rápidas</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
            {SUGERENCIAS_CHAT_PRODUCTO.map((s) => (
              <Pressable
                key={s}
                onPress={() => usarSugerencia(s)}
                accessibilityRole="button"
                accessibilityLabel={`Usar la pregunta ${s}`}
                style={({ pressed }) => ({
                  minHeight: TACTIL.minimo,
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: draft === s ? COLORS.accent : COLORS.accentBorder,
                  backgroundColor: draft === s ? COLORS.accent2 : "#FFFFFF",
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo }}>{s}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 8,
          padding: 12,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          backgroundColor: COLORS.bg,
        }}
      >
        <TextInput
          ref={campoRef}
          nativeID="chat-campo"
          value={draft}
          onChangeText={(t) => setDraft(t.slice(0, MESSAGE_MAX))}
          accessibilityLabel="Escribe un mensaje"
          placeholder={conSugerencias ? "Escribe tu pregunta…" : "Escribe un mensaje…"}
          placeholderTextColor="rgba(11,33,56,0.40)"
          multiline
          style={{
            flex: 1,
            maxHeight: 100,
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: 16,
            paddingVertical: 10,
            paddingHorizontal: 14,
            color: COLORS.text,
            backgroundColor: COLORS.card,
            // 16px es el mínimo que iOS/Android no consideran "hay que
            // acercar la cámara para leer esto": con menos, el navegador
            // hace zoom automático al tocar la casilla y, como es una app
            // de una sola página, ese zoom se queda puesto al navegar a
            // otras pantallas — es lo que se veía como "toda la app mal
            // encuadrada". Por eso TODOS los TextInput de la tienda deben
            // ir a fontSize 16 o más, nunca menos.
            fontSize: CAMPO.letra,
            minHeight: CAMPO.alto,
          }}
        />

        <AnimatedPressable
          nativeID="chat-enviar"
          etiqueta="Enviar mensaje"
          onPress={handleSend}
          disabled={!draft.trim() || sending}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: COLORS.accent,
            opacity: !draft.trim() || sending ? 0.5 : 1,
          }}
        >
          <Ionicons name="send" size={18} color="#FFFFFF" />
        </AnimatedPressable>
      </View>
    </KeyboardAvoidingView>
  );
}
