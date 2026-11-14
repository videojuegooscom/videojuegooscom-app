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
 * Diseño (dueño, 2026-11-12): ancho máximo 760 px centrado, legible a 360 px y en ordenador.
 * - Cabecera tipo tarjeta (#ficha-cabecera): foto o iniciales, nombre, @usuario · edad · provincia, el correo y, en gris,
 *   «Cliente desde <mes año> · Última conexión hace X» (#ficha-ultima-conexion). Debajo, etiquetas con icono (sin
 *   burbuja): «Perfil completo» o lo que falta, «App instalada» y «Silenciado en el Foro». No sabemos si confirmó el correo
 *   (no llega a la ficha), así que esa etiqueta no sale.
 * - Cuatro cifras en fila (#ficha-cifras): gastado (pedidos no cancelados, menos lo devuelto), pedidos, reparaciones y
 *   ventas a la tienda.
 * - Acciones rápidas (#ficha-acciones, icono + texto, 44 px): «Escribir por el chat» (siempre activo, dueño 2026-11-13: con
 *   conversación abre la suya en Administración → Chat con ?chat=<id>; sin ella, el administrador la EMPIEZA, creando la
 *   conversación general del cliente con su user_id —la política RLS de product_chats ya lo permite—, y abre el hilo; debajo,
 *   «Conversación empezada por la tienda / por el cliente», #ficha-chat-empezo), «Copiar correo», «Ver en Pedidos» (abre
 *   Pedidos con ?buscar=<correo>: buscador relleno, solo sus pedidos) y «Añadir nota» (pestaña Notas con el cuadro listo).
 * - Pestañas deslizables (#ficha-pestanas): Resumen · Pedidos · Reparaciones · Ventas · Actividad · Notas, con su número;
 *   la elegida queda en la URL (?tab=pedidos) para volver a ella, y deslizando el dedo se pasa a la siguiente (en bucle).
 *   - Resumen: la nota interna fijada (fondo amarillo suave), los 3 últimos movimientos, los datos del perfil (edad sin
 *     fecha de nacimiento, dirección de envío) y los dispositivos.
 *   - Pedidos: filas compactas (miniatura del artículo si la hay, referencia VZ-, importe, etapa con color, factura y «Ver
 *     factura»); al tocar uno se despliega (nº interno, artículos, entrega, pago con tarjeta y los botones de etapa de 44 px
 *     separados 8 px) y se vuelve a plegar. Debajo, «Pagos e intentos de compra» y «Compras a la tienda».
 *   - Reparaciones: igual, plegables, con su seguimiento y nota del taller. Ventas: lo que nos ha querido vender.
 *   - Actividad (#ficha-actividad): línea de tiempo por día con un icono por tipo (registro, pedido, pago, factura,
 *     reparación y sus etapas, venta a la tienda, compra, intento de compra, primera conexión desde un dispositivo, Foro e
 *     ideas de mejora); debajo, la moderación del Foro y sus ideas de mejora.
 *
 * Pedidos (dueño, 2026-11-11): cada uno con su referencia «VZ-XXXX-XXXX» (la que ve el cliente) de título y el
 * número interno en pequeño; en la actividad de compra, también la referencia del pedido si está en la ficha.
 * Factura (dueño, 2026-11-12): cada pedido con factura de VeoAura enseña su número y «Ver factura», que abre el PDF en
 * una pestaña nueva (api/factura.ts con «ver=1», enlace firmado de 60 s) para revisar cómo ha quedado.
 * Teléfono (dueño, 2026-11-13): en «Datos del perfil», el teléfono opcional de Mi perfil (#ficha-perfil-telefono) con «Copiar»
 * (#ficha-copiar-telefono, 44 px; «Copiado» un momento); sin la columna (migración 20261113120000) no sale la fila.
 * Direcciones (dueño, 2026-11-14): con 2 o más guardadas (hasta 3: Casa, Trabajo, Familiar), «Direcciones guardadas» dice
 * cuántas y con qué etiquetas (#ficha-perfil-direcciones) y cada una sale entera en su fila, con la predeterminada marcada
 * (#ficha-perfil-direccion-<etiqueta>); con una, «Dirección de envío» como antes. Sin la columna (20261114120000), como antes.
 * Dispositivos (dueño, 2026-11-12): «Última conexión» en la cabecera y la sección «Dispositivos» con cada uno (tipo y
 * navegador, «App instalada», primera y última vez, inicios de sesión), de la tabla cliente_dispositivos (migración
 * 20261112120000; la escribe lib/supabase.ts → registrarDispositivo). Sin IP ni ubicación. Sin la migración, no sale nada.
 *
 * Cómo funciona:
 * - user_id, email y fecha de alta llegan como parámetros de navegación
 *   desde app/admin/users.tsx (ya los tenía cargados de
 *   admin_list_users_with_stats, así que no hace falta pedirlos otra vez); «tab» es la pestaña abierta.
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
 *   a api/escaparate-retorno.ts por si lleva artículos de VeoAura. La miniatura sale de la primera foto del producto
 *   (products.images) si el artículo sigue enlazado a uno.
 * - Pagos e intentos de compra (dueño, 2026-11-06): cada pedido enseña su pago con tarjeta (pagado, devuelto o
 *   empezado sin terminar, y si fue de prueba), y «Pagos e intentos de compra» cuenta sus pagos y, de los
 *   últimos 90 días, lo que hizo en la cesta y al pagar según la analítica propia (añadido a la cesta, «Comprar ya»,
 *   entró a pagar, pedido hecho, abrió el pago con tarjeta, pagó): solo existe si aceptó la analítica, como dice la
 *   política de privacidad. Si algo no se puede leer, la ficha sale igual sin ello.
 * - Servicio de reparación: service_requests donde customer_user_id = este
 *   cliente. Misma limitación que arriba (solo con sesión iniciada al
 *   enviar). Cada solicitud tiene aquí su seguimiento para el cliente (etapa
 *   y «nota del taller», como en Administración → Servicios → Solicitudes):
 *   al guardarlo, el cliente lo ve en Perfil → «Mis seguimientos» y Blue le
 *   avisa. Así no hace falta ir de pantalla en pantalla.
 * - Chat: se busca su conversación más reciente no borrada por el administrador (product_chats.customer_user_id) y el rol del
 *   primer mensaje (product_chat_messages.sender_role) para saber quién la empezó; «Escribir por el chat» la abre o la crea.
 * - Foro (ForoCliente): si está silenciado y hasta cuándo («Quitar silencio»), o silenciarlo 1, 3 o 7 días, y su
 *   historial de moderación (mensajes y comentarios eliminados, silencios), de las tablas foro_silencios y
 *   foro_moderacion. Sin esa migración no sale.
 * - Ideas de mejora (MejorasCliente): lo que ha mandado desde «Mejoras en la tienda» (tabla mejoras_tienda), con la
 *   fecha, desde dónde y «Marcar como leída». Sin la migración o sin ideas, no sale.
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
 * - app/admin/chats.tsx y app/admin/pedidos.tsx → a donde llevan las acciones rápidas.
 * - lib/admin/products.components.tsx → useGestoPestanas (deslizar para cambiar de pestaña, como en Servicios).
 * - pruebas/perfil-datos.mjs → secciones E, DV, PT, ME, M y FC (este diseño).
 * - Migración de Supabase (no hay ya un .sql local por cada cambio, ver
 *   sql/README.md): customer_notes, sell_requests.customer_user_id,
 *   service_requests.customer_user_id.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
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
import { haceCuanto, supabase } from "../../../lib/supabase";
import CargaMarca from "../../../components/marca/CargaMarca";
import SmartImage from "../../../components/SmartImage";
import { ORIGENES_MEJORA, type OrigenMejora } from "../../../components/ReviewModal";
import { datosDeFila, direccionEnUnaLinea, direccionesDeFila, textoEtiqueta } from "../../../components/PerfilPublico";
import { openExternalLink } from "../../../lib/openExternalLink";
import { useGestoPestanas } from "../../../lib/admin/products.components";

// "on-drag" en web cierra el teclado con CUALQUIER desplazamiento, también el que hace el
// propio navegador al enfocar el cuadro de notas (se cerraba solo): solo se usa en nativo.
const CIERRE_TECLADO: "none" | "on-drag" = Platform.OS === "web" ? "none" : "on-drag";

// Tamaños (auditoría 2026-11-12): mínimo 13 px, cuerpo 15, destacados 17, títulos 20/24; grises no más claros que 0,72.
const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  cardSoft: "#F8FBFE",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.72)",
  accent: "#1EA7E8",
  accent2: "#EAF6FD",
  success: "#15803D",
  warn: "#92660B",
  danger: "#B91C1C",
  dangerBg: "#FFE4E6",
  // Nota fijada: amarillo muy suave.
  notaBg: "#FFF9E0",
  notaBorde: "#F5E3A3",
};

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  // Referencia del pedido (VZ-XXXX-XXXX): la que ve el cliente; el número interno va en pequeño (dueño, 2026-11-11).
  codigo_seguimiento?: string | null;
  // Factura de VeoAura de este pedido (pedido_facturas): número, fecha y si ya tiene PDF para «Ver factura».
  factura?: { numero: string | null; pdf: boolean; fecha: string | null } | null;
  created_at: string;
  estado: EstadoPedido;
  entrega: "envio" | "recogida" | null;
  total_eur: number | null;
  user_id: string | null;
  pedido_items: { id: string; titulo: string; precio_eur: number | null; product_id?: string | null }[] | null;
  // Primera foto del primer artículo que sigue enlazado a un producto (products.images).
  miniatura?: string | null;
  // Pago con tarjeta (consulta aparte: migraciones 20261105120000 y 20261106100000).
  pago_estado?: string | null;
  pago_modo?: string | null;
  pagado_eur?: number | string | null;
  pagado_en?: string | null;
  devuelto_eur?: number | string | null;
  devuelto_en?: string | null;
};

// Intentos de compra (analítica propia de ese cliente, solo si aceptó la analítica; el administrador no se cuenta).
const EVENTOS_COMPRA = [
  { key: "add_to_cart", label: "Añadido a la cesta" },
  { key: "buy_now", label: "Comprar ya" },
  { key: "begin_checkout", label: "Entró a pagar" },
  { key: "order_whatsapp", label: "Pedido hecho" },
  { key: "pago_tarjeta", label: "Abrió el pago online" },
  { key: "pago_tarjeta_ok", label: "Pagó online" },
] as const;
type EventoCompra = {
  event_name: string;
  step_label: string | null;
  created_at: string;
  metadata?: { productId?: string; numero?: number; total?: number } | null;
  titulo?: string | null;
};

// Etiqueta de cada etapa del pedido (con entrega en mano, «Enviado» es «Listo para recoger», como lo ve el cliente).
function etiquetaEstadoPedido(e: EstadoPedido, entrega: PedidoFicha["entrega"]) {
  if (e === "enviado") return entrega === "recogida" ? "Listo para recoger" : "Enviado";
  return { pendiente: "Pendiente", confirmado: "Confirmado", preparado: "Preparado", entregado: "Entregado", cancelado: "Cancelado" }[e];
}

// Color de cada etapa: pendiente en ámbar, en curso con el azul de marca, entregado en verde y cancelado en rojo.
const TONO_ESTADO: Record<EstadoPedido, "warn" | "curso" | "success" | "danger"> = {
  pendiente: "warn",
  confirmado: "curso",
  preparado: "curso",
  enviado: "curso",
  entregado: "success",
  cancelado: "danger",
};

// 155,00€ · 1.299,00€
function eur(n: number | null) {
  if (n == null || !Number.isFinite(Number(n))) return "";
  const [ent, dec] = Math.abs(Number(n)).toFixed(2).split(".");
  return `${Number(n) < 0 ? "-" : ""}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}€`;
}

// Para las cifras de la cabecera: sin céntimos (1.299 €).
function eurCorto(n: number) {
  return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} €`;
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

// Un dispositivo desde el que entra el cliente (tabla cliente_dispositivos: solo tipo y navegador, sin IP ni ubicación).
type DispositivoFicha = { dispositivo: string; app_instalada: boolean; primera_vez: string; ultima_vez: string; inicios: number };

// Pestañas de la ficha (en la URL como ?tab=…).
type Pestana = "resumen" | "pedidos" | "reparaciones" | "ventas" | "actividad" | "notas";
const PESTANAS: Pestana[] = ["resumen", "pedidos", "reparaciones", "ventas", "actividad", "notas"];
const NOMBRE_PESTANA: Record<Pestana, string> = {
  resumen: "Resumen",
  pedidos: "Pedidos",
  reparaciones: "Reparaciones",
  ventas: "Ventas",
  actividad: "Actividad",
  notas: "Notas",
};

// Un movimiento de la línea de tiempo («Actividad» y los 3 últimos del Resumen).
type TipoMovimiento =
  | "registro"
  | "pedido"
  | "pago"
  | "devolucion"
  | "factura"
  | "reparacion"
  | "etapa"
  | "venta"
  | "compra"
  | "intento"
  | "dispositivo"
  | "foro"
  | "idea";
type Movimiento = { key: string; fecha: string; tipo: TipoMovimiento; titulo: string; detalle?: string; soloDia?: boolean; destino?: Pestana; icono?: IconName };
const ICONO_MOVIMIENTO: Record<TipoMovimiento, { icono: IconName; color: string }> = {
  registro: { icono: "person-add-outline", color: COLORS.accent },
  pedido: { icono: "receipt-outline", color: COLORS.accent },
  pago: { icono: "card-outline", color: COLORS.success },
  devolucion: { icono: "return-down-back-outline", color: COLORS.danger },
  factura: { icono: "document-text-outline", color: COLORS.accent },
  reparacion: { icono: "construct-outline", color: COLORS.accent },
  etapa: { icono: "git-commit-outline", color: COLORS.accent },
  venta: { icono: "pricetag-outline", color: COLORS.accent },
  compra: { icono: "bag-check-outline", color: COLORS.success },
  intento: { icono: "cart-outline", color: COLORS.muted },
  dispositivo: { icono: "phone-portrait-outline", color: COLORS.accent },
  foro: { icono: "chatbubbles-outline", color: COLORS.warn },
  idea: { icono: "bulb-outline", color: COLORS.warn },
};

type FilaModeracion = { id: string; created_at: string; accion: string; detalle: string | null };
type MejoraFicha = { id: string; created_at: string; texto: string; origen: OrigenMejora; leida: boolean };

// 12/11/2026 12:49 (hora de Madrid)
function fmtFechaHora(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const f = d.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric" });
  const h = d.toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
  return `${f} ${h}`;
}

function fmtHora(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
}

// «octubre 2026»
function fmtMesAnio(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", month: "long", year: "numeric" }).replace(" de ", " ");
}

// Día en Madrid (2026-11-12), para agrupar la línea de tiempo.
function claveDia(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
}

// Icono según el tipo: móvil o tableta, o un ordenador.
function iconoDispositivo(nombre: string): IconName {
  if (/^(iPhone|Android)\b/.test(nombre)) return "phone-portrait-outline";
  if (/^(iPad|Tablet)/.test(nombre)) return "tablet-portrait-outline";
  return "laptop-outline";
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "short", year: "numeric" });
}

// Iniciales para cuando no hay foto: «Dani García» → «DG»; si no hay nombre, la primera letra del correo.
function iniciales(nombre: string, email: string) {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const letras = partes.length ? partes.slice(0, 2).map((p) => p[0]) : [email.trim()[0] ?? "?"];
  return letras.join("").toUpperCase();
}

// Estado con su color: un punto y el texto (sin cápsula).
function Estado({ texto, tono }: { texto: string; tono: "neutral" | "warn" | "curso" | "success" | "danger" }) {
  const color = { neutral: COLORS.muted, warn: COLORS.warn, curso: COLORS.accent, success: COLORS.success, danger: COLORS.danger }[tono];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text numberOfLines={1} style={{ color: tono === "curso" || tono === "neutral" ? COLORS.text : color, fontWeight: "800", fontSize: 13, flexShrink: 1 }}>
        {texto}
      </Text>
    </View>
  );
}

function StatusPill({ status }: { status: string }) {
  const meta = STATUS_LABEL[status] ?? { label: status, tone: "neutral" as const };
  return <Estado texto={meta.label} tono={meta.tone} />;
}

// Una sección de la ficha: icono y título (sin recuadro alrededor), con su número a la derecha si lo tiene.
function Seccion({
  icon,
  title,
  count,
  nativeID,
  children,
}: {
  icon: IconName;
  title: string;
  // Número (o texto corto) que sale a la derecha del título; sin él no sale nada.
  count?: number | string;
  nativeID?: string;
  children: React.ReactNode;
}) {
  return (
    <View nativeID={nativeID} style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {/* Solo el icono, sin burbuja (dueño, 2026-11-04). */}
        <Ionicons name={icon} size={20} color={COLORS.accent} />
        <Text style={{ flex: 1, color: COLORS.text, fontWeight: "900", fontSize: 17 }}>{title}</Text>
        {count !== undefined ? <Text style={{ color: COLORS.muted, fontSize: 13, fontWeight: "800" }}>{count}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <Text style={{ color: COLORS.muted, fontSize: 15, paddingVertical: 6, lineHeight: 21 }}>{text}</Text>;
}

// Un botón de texto con icono (sin burbuja), de 44 px, con el azul de marca.
function BotonTexto({
  icon,
  texto,
  onPress,
  nativeID,
  disabled,
  apagado,
  accessibilityLabel,
}: {
  icon: IconName;
  texto: string;
  onPress: () => void;
  nativeID?: string;
  disabled?: boolean;
  // Se puede tocar (explica por qué no hace nada), pero se ve en gris.
  apagado?: boolean;
  accessibilityLabel?: string;
}) {
  const color = apagado ? COLORS.muted : COLORS.accent;
  return (
    <Pressable
      nativeID={nativeID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? texto}
      style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, opacity: disabled ? 0.5 : pressed ? 0.7 : 1 })}
    >
      <Ionicons name={icon} size={20} color={color} />
      <Text style={{ color: apagado ? COLORS.muted : COLORS.text, fontWeight: "800", fontSize: 15, flexShrink: 1 }}>{texto}</Text>
    </Pressable>
  );
}

// Línea de tiempo: con `porDia`, agrupada por día (Actividad); sin él, una lista corta con la fecha en cada fila (Resumen).
function LineaTiempo({ movimientos, porDia, onIr }: { movimientos: Movimiento[]; porDia?: boolean; onIr: (p: Pestana) => void }) {
  const grupos: { dia: string; items: Movimiento[] }[] = [];
  for (const m of movimientos) {
    const dia = porDia ? claveDia(m.fecha) : "";
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.items.push(m);
    else grupos.push({ dia, items: [m] });
  }
  return (
    <View style={{ gap: porDia ? 18 : 0 }}>
      {grupos.map((g) => (
        <View key={g.dia || "lista"} style={{ gap: 0 }}>
          {porDia ? (
            <Text style={{ color: COLORS.muted, fontWeight: "900", fontSize: 13, letterSpacing: 0.3, paddingBottom: 6 }}>
              {fmtDate(g.items[0].fecha).toUpperCase()}
            </Text>
          ) : null}
          {g.items.map((m, i) => {
            const meta = ICONO_MOVIMIENTO[m.tipo];
            const ultimo = i === g.items.length - 1;
            const cuando = porDia ? (m.soloDia ? "" : fmtHora(m.fecha)) : m.soloDia ? fmtDate(m.fecha) : `${fmtDate(m.fecha)} · ${fmtHora(m.fecha)}`;
            const fila = (
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ width: 24, alignItems: "center" }}>
                  <View style={{ paddingTop: 2 }}>
                    <Ionicons name={m.icono ?? meta.icono} size={20} color={meta.color} />
                  </View>
                  {!ultimo ? <View style={{ flex: 1, width: 2, borderRadius: 1, backgroundColor: COLORS.border, marginTop: 4 }} /> : null}
                </View>
                <View style={{ flex: 1, minWidth: 0, paddingBottom: ultimo ? 0 : 14, gap: 2 }}>
                  <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 15, lineHeight: 21 }}>{m.titulo}</Text>
                  {m.detalle || cuando ? (
                    <Text style={{ color: COLORS.muted, fontSize: 13, lineHeight: 18 }}>
                      {[cuando, m.detalle].filter(Boolean).join(" · ")}
                    </Text>
                  ) : null}
                </View>
                {m.destino ? <Ionicons name="chevron-forward" size={18} color={COLORS.muted} style={{ marginTop: 2 }} /> : null}
              </View>
            );
            return m.destino ? (
              <Pressable
                key={m.key}
                onPress={() => onIr(m.destino as Pestana)}
                accessibilityRole="button"
                accessibilityLabel={`${m.titulo}: ver en ${NOMBRE_PESTANA[m.destino]}`}
                style={({ pressed }) => ({ minHeight: 44, opacity: pressed ? 0.7 : 1 })}
              >
                {fila}
              </Pressable>
            ) : (
              <View key={m.key} style={{ minHeight: 44 }}>
                {fila}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export default function ClienteFicha() {
  const params = useLocalSearchParams<{ userId: string; email?: string; createdAt?: string; tab?: string }>();
  const userId = String(params.userId ?? "").trim();
  const email = typeof params.email === "string" ? params.email : "";
  const createdAt = typeof params.createdAt === "string" ? params.createdAt : "";
  const insets = useSafeAreaInsets();

  // Pestaña abierta: la de la URL (?tab=) para volver a ella; si no, «Resumen».
  const tabUrl = PESTANAS.includes(params.tab as Pestana) ? (params.tab as Pestana) : "resumen";
  const [tab, setTab] = useState<Pestana>(tabUrl);
  useEffect(() => {
    setTab(tabUrl);
  }, [tabUrl]);
  const scrollRef = useRef<ScrollView>(null);
  const pestanasY = useRef(0);
  const notasRef = useRef<TextInput>(null);
  const cambiarTab = useCallback((t: Pestana, subir?: boolean) => {
    setTab(t);
    router.setParams({ tab: t } as never);
    if (subir) scrollRef.current?.scrollTo({ y: Math.max(0, pestanasY.current - 8), animated: true });
  }, []);
  const gesto = useGestoPestanas(PESTANAS, tab, (t) => cambiarTab(t));

  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [sellRequests, setSellRequests] = useState<SellRequestRow[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequestRow[]>([]);
  // ¿Existen las columnas de seguimiento? (si no, la etapa no se puede cambiar desde aquí)
  const [seguimientoDisponible, setSeguimientoDisponible] = useState(false);
  // Pedidos de la tienda; null = la tabla aún no existe o no se ha podido leer.
  const [pedidos, setPedidos] = useState<PedidoFicha[] | null>(null);
  // Pedidos y reparaciones desplegados (se pliegan al volver a tocarlos).
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set());
  const alternar = useCallback((id: string) => {
    setAbiertos((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);
  // Intentos de compra (analítica propia); null = no se han podido leer.
  const [eventosCompra, setEventosCompra] = useState<EventoCompra[] | null>(null);
  // Perfil que el cliente escribe en Mi cuenta (tabla perfiles_cliente). null = no lo ha rellenado o la tabla aún no existe.
  const [perfil, setPerfil] = useState<{
    nombre: string;
    usuario: string;
    pais: string;
    provincia: string;
    edad: number | null;
    foto: string;
    actualizado: string;
    // Dirección de envío de Mi perfil en una línea (vacía si no la ha puesto); null = sin las columnas todavía.
    direccion: string | null;
    // Teléfono (opcional) de Mi perfil (vacío si no lo ha puesto); null = sin la columna todavía.
    telefono: string | null;
    // Hasta 3 direcciones (Casa, Trabajo, Familiar); null = sin la columna todavía (migración 20261114120000).
    direcciones: { id: string; etiqueta: string; linea: string; predeterminada: boolean }[] | null;
  } | null>(null);

  // Dispositivos desde los que entra y su última conexión (tabla cliente_dispositivos). null = la tabla aún no existe.
  const [dispositivos, setDispositivos] = useState<DispositivoFicha[] | null>(null);
  // Su conversación más reciente por el chat (no borrada por el administrador) y quién la empezó; null = no tiene o no se sabe.
  const [chatCliente, setChatCliente] = useState<{ id: string; empezo: "tienda" | "cliente" | null } | null>(null);
  const [creandoChat, setCreandoChat] = useState(false);
  // Foro e ideas de mejora (los cargan ForoCliente y MejorasCliente; aquí, para la línea de tiempo y las etiquetas).
  const [foro, setForo] = useState<{ historial: FilaModeracion[]; silencio: { hasta: string } | null }>({ historial: [], silencio: null });
  const [mejoras, setMejoras] = useState<MejoraFicha[]>([]);

  const [notes, setNotes] = useState("");
  // La nota tal como está guardada (la que sale fijada en el Resumen).
  const [notaGuardada, setNotaGuardada] = useState("");
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [notesUpdatedAt, setNotesUpdatedAt] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [notesError, setNotesError] = useState(false);

  // Aviso de las acciones rápidas («Correo copiado», «sin chat»…).
  const [avisoAccion, setAvisoAccion] = useState<{ ok: boolean; texto: string } | null>(null);
  // «Copiar» del teléfono del perfil: dice «Copiado ✓» un momento en el propio botón.
  const [telCopiado, setTelCopiado] = useState(false);
  // Cuántos movimientos se ven en «Actividad» (de 30 en 30; «Ver menos» vuelve a 30).
  const [limiteActividad, setLimiteActividad] = useState(30);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [salesRes, sellRes, serviceRes, notesRes, chatRes] = await Promise.all([
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
        supabase.from("product_chats").select("id").eq("customer_user_id", userId).is("admin_deleted_at", null).order("last_message_at", { ascending: false }).limit(1),
      ]);

      setPurchases((salesRes.data ?? []) as PurchaseRow[]);
      setSellRequests((sellRes.data ?? []) as SellRequestRow[]);
      const chatId = chatRes.error ? "" : String((chatRes.data ?? [])[0]?.id ?? "");
      if (chatId) {
        // Quién escribió el primer mensaje de esa conversación (si hay mensajes).
        const primero = await supabase.from("product_chat_messages").select("sender_role").eq("chat_id", chatId).order("created_at", { ascending: true }).limit(1);
        const rol = primero.error ? null : (primero.data ?? [])[0]?.sender_role;
        setChatCliente({ id: chatId, empezo: rol === "admin" ? "tienda" : rol === "customer" ? "cliente" : null });
      } else {
        setChatCliente(null);
      }
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
      const COLUMNAS_PEDIDO = "id,numero,codigo_seguimiento,created_at,estado,entrega,total_eur,user_id,pedido_items(id,titulo,precio_eur,product_id)";
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
        let todos = [...((conCuenta.data ?? []) as unknown as PedidoFicha[]), ...((sinSesion.error ? [] : sinSesion.data ?? []) as unknown as PedidoFicha[])];
        todos.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        if (todos.length) {
          // Su pago con tarjeta (aparte: si las columnas aún no existen, la ficha sale igual sin él).
          const pagoRes = await supabase
            .from("pedidos")
            .select("id,pago_estado,pago_modo,pagado_eur,pagado_en,devuelto_eur,devuelto_en")
            .in("id", todos.map((p) => p.id));
          if (!pagoRes.error) {
            const porId = new Map(((pagoRes.data ?? []) as unknown as (Partial<PedidoFicha> & { id: string })[]).map((x) => [x.id, x]));
            todos = todos.map((p) => ({ ...p, ...porId.get(p.id) }));
          }
          // Su factura de VeoAura (número, fecha y si ya tiene PDF), para «Ver factura». Sin la tabla, la ficha sale igual.
          const facRes = await supabase
            .from("pedido_facturas")
            .select("pedido_id,numero_factura,pdf_path,fecha")
            .in("pedido_id", todos.map((p) => p.id))
            .order("fecha", { ascending: false });
          if (!facRes.error) {
            const porPedido = new Map<string, { numero: string | null; pdf: boolean; fecha: string | null }>();
            for (const f of (facRes.data ?? []) as { pedido_id: string; numero_factura: string | null; pdf_path: string | null; fecha: string | null }[]) {
              if (!porPedido.has(f.pedido_id)) porPedido.set(f.pedido_id, { numero: f.numero_factura, pdf: !!f.pdf_path, fecha: f.fecha ?? null });
            }
            todos = todos.map((p) => ({ ...p, factura: porPedido.get(p.id) ?? null }));
          }
          // Miniatura: la primera foto del producto de cada pedido (si el artículo sigue enlazado a uno).
          const prodIds = [...new Set(todos.flatMap((p) => (p.pedido_items ?? []).map((it) => String(it.product_id ?? ""))).filter((x) => UUID.test(x)))];
          if (prodIds.length) {
            const fotosRes = await supabase.from("products").select("id,images").in("id", prodIds);
            if (!fotosRes.error) {
              const foto = new Map(((fotosRes.data ?? []) as { id: string; images?: unknown }[]).map((x) => [x.id, Array.isArray(x.images) ? String(x.images[0] ?? "") : ""]));
              todos = todos.map((p) => ({
                ...p,
                miniatura: (p.pedido_items ?? []).map((it) => foto.get(String(it.product_id ?? "")) ?? "").find(Boolean) || null,
              }));
            }
          }
        }
        setPedidos(todos);
      }

      // Intentos de compra de los últimos 90 días (solo hay si aceptó la analítica).
      const desde = new Date(Date.now() - 90 * 86400000).toISOString();
      const evRes = await supabase
        .from("analytics_events")
        .select("event_name,step_label,created_at,metadata")
        .eq("user_id", userId)
        .in("event_name", EVENTOS_COMPRA.map((e) => e.key))
        .gte("created_at", desde)
        .order("created_at", { ascending: false })
        .limit(500);
      let eventos = evRes.error ? null : ((evRes.data ?? []) as EventoCompra[]);
      // El nombre de cada artículo que añadió a la cesta o compró con «Comprar ya».
      const ids = [...new Set((eventos ?? []).slice(0, 8).map((e) => String(e.metadata?.productId ?? "")).filter((x) => UUID.test(x)))];
      if (eventos && ids.length) {
        const prodRes = await supabase.from("products").select("id,title").in("id", ids);
        const titulos = new Map(((prodRes.data ?? []) as { id: string; title: string }[]).map((x) => [x.id, x.title]));
        eventos = eventos.map((e) => ({ ...e, titulo: titulos.get(String(e.metadata?.productId ?? "")) ?? null }));
      }
      setEventosCompra(eventos);
      setNotes(notesRes.data?.notes ?? "");
      setNotaGuardada(notesRes.data?.notes ?? "");
      setNotesUpdatedAt(notesRes.data?.updated_at ?? null);
      setNotesLoaded(true);

      // Perfil (consulta aparte: si la migración aún no está aplicada, la ficha funciona igual sin esta parte).
      type FilaPerfil = {
        nombre: string | null;
        usuario: string | null;
        pais: string | null;
        provincia: string | null;
        fecha_nacimiento: string | null;
        foto_url?: string | null;
        updated_at?: string | null;
      };
      // «*»: funciona antes y después de cada migración del perfil (foto, dirección…) sin pedir columnas que no existan.
      const perfilRes = await supabase.from("perfiles_cliente").select("*").eq("user_id", userId).maybeSingle<FilaPerfil & Record<string, unknown>>();
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
          direccion: "codigo_postal" in p ? direccionEnUnaLinea(datosDeFila(p)) : null,
          telefono: "telefono" in p ? datosDeFila(p).telefono : null,
          direcciones:
            direccionesDeFila(p)?.map((d) => ({
              id: d.etiqueta,
              etiqueta: textoEtiqueta(d.etiqueta),
              linea: direccionEnUnaLinea(d),
              predeterminada: d.predeterminada,
            })) ?? null,
        });
      } else {
        setPerfil(null);
      }

      // Dispositivos (consulta aparte: sin la migración 20261112120000, la ficha sale igual sin ellos).
      const dispRes = await supabase
        .from("cliente_dispositivos")
        .select("dispositivo,app_instalada,primera_vez,ultima_vez,inicios")
        .eq("user_id", userId)
        .order("ultima_vez", { ascending: false })
        .limit(30);
      setDispositivos(dispRes.error ? null : ((dispRes.data ?? []) as DispositivoFicha[]));
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
    setNotesError(false);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const adminId = sessionData.session?.user?.id ?? null;

      const { error } = await supabase.from("customer_notes").upsert({
        customer_user_id: userId,
        notes,
        updated_by: adminId,
      });
      if (error) throw error;

      setNotaGuardada(notes);
      setNotesUpdatedAt(new Date().toISOString());
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2200);
    } catch (e) {
      console.error("Error guardando la nota del cliente:", e);
      setNotesError(true);
    } finally {
      setSavingNotes(false);
    }
  }

  // --- Acciones rápidas ----------------------------------------------------------------------------------------------
  function avisar(ok: boolean, texto: string) {
    setAvisoAccion({ ok, texto });
    setTimeout(() => setAvisoAccion((a) => (a?.texto === texto ? null : a)), 3000);
  }
  async function copiarCorreo() {
    if (!email) return;
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(email);
        avisar(true, "Correo copiado ✓");
      } else {
        avisar(false, `Correo: ${email}`);
      }
    } catch {
      avisar(false, `No se ha podido copiar: ${email}`);
    }
  }
  async function copiarTelefono() {
    const tel = perfil?.telefono ?? "";
    if (!tel) return;
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(tel);
        setTelCopiado(true);
        setTimeout(() => setTelCopiado(false), 2200);
      } else {
        avisar(false, `Teléfono: ${tel}`);
      }
    } catch {
      avisar(false, `No se ha podido copiar: ${tel}`);
    }
  }
  // Con conversación, abre la suya en Administración → Chat; sin ella, la empieza el administrador (conversación general del
  // cliente: la política de la base de datos deja al administrador crearla) y abre el hilo para escribirle.
  async function escribirPorChat() {
    if (creandoChat) return;
    if (chatCliente) {
      router.push({ pathname: "/admin/chats", params: { chat: chatCliente.id } } as never);
      return;
    }
    if (!UUID.test(userId)) return;
    setCreandoChat(true);
    try {
      const { data, error } = await supabase
        .from("product_chats")
        .insert({ product_id: null, customer_user_id: userId })
        .select("id")
        .single<{ id: string }>();
      if (error || !data?.id) throw error ?? new Error("sin id");
      setChatCliente({ id: data.id, empezo: null });
      router.push({ pathname: "/admin/chats", params: { chat: data.id } } as never);
    } catch (e) {
      console.error("Error creando la conversación del cliente:", e);
      avisar(false, "No se ha podido empezar la conversación. Inténtalo de nuevo.");
    } finally {
      setCreandoChat(false);
    }
  }
  function anadirNota() {
    cambiarTab("notas", true);
    setTimeout(() => notasRef.current?.focus(), 350);
  }

  // --- Datos derivados ---------------------------------------------------------------------------------------------
  const nombre = perfil?.nombre || "";
  const titulo = nombre || (email ? email.split("@")[0] : "Cliente");
  const ultimaConexion = dispositivos && dispositivos[0] ? dispositivos[0].ultima_vez : null;
  const appInstalada = !!dispositivos?.some((d) => d.app_instalada);
  // Estado del perfil obligatorio («Completa tu perfil»): la foto no cuenta.
  const faltan = perfil
    ? [
        !perfil.usuario ? "usuario" : "",
        !perfil.nombre ? "nombre" : "",
        !perfil.pais ? "país" : "",
        !perfil.provincia ? "provincia" : "",
        perfil.edad === null ? "edad" : "",
      ].filter(Boolean)
    : null;
  const gastado = (pedidos ?? []).filter((p) => p.estado !== "cancelado").reduce((a, p) => a + Number(p.total_eur ?? 0) - Number(p.devuelto_eur ?? 0), 0);

  const movimientos = useMemo<Movimiento[]>(() => {
    const lista: Movimiento[] = [];
    if (createdAt) lista.push({ key: "registro", fecha: createdAt, tipo: "registro", titulo: "Se registró en la tienda" });
    for (const p of pedidos ?? []) {
      const ref = p.codigo_seguimiento ? `Pedido ${p.codigo_seguimiento}` : `Pedido nº ${p.numero ?? "—"}`;
      const items = (p.pedido_items ?? []).map((it) => it.titulo).join(", ");
      lista.push({ key: `p-${p.id}`, fecha: p.created_at, tipo: "pedido", titulo: `${ref} · ${eur(p.total_eur)}`, detalle: items || undefined, destino: "pedidos" });
      if (p.pago_estado === "pagado" && p.pagado_en) {
        lista.push({ key: `pg-${p.id}`, fecha: p.pagado_en, tipo: "pago", titulo: `Pagó online ${eur(Number(p.pagado_eur))}${p.pago_modo === "prueba" ? " (de prueba)" : ""}`, detalle: ref, destino: "pedidos" });
      }
      if (p.devuelto_en) lista.push({ key: `dv-${p.id}`, fecha: p.devuelto_en, tipo: "devolucion", titulo: `Devolución de ${eur(Number(p.devuelto_eur))}`, detalle: ref, destino: "pedidos" });
      if (p.factura?.fecha) {
        // La factura solo trae el día: si es el mismo del pedido, va justo después de él (no a medianoche, antes que el pedido).
        const soloDia = /^\d{4}-\d{2}-\d{2}$/.test(p.factura.fecha);
        const fecha = soloDia
          ? claveDia(p.created_at) === p.factura.fecha
            ? new Date(new Date(p.created_at).getTime() + 1000).toISOString()
            : `${p.factura.fecha}T12:00:00Z`
          : p.factura.fecha;
        lista.push({ key: `f-${p.id}`, fecha, tipo: "factura", titulo: `Factura ${p.factura.numero ?? ""}`.trim(), detalle: ref, soloDia, destino: "pedidos" });
      }
    }
    for (const s of serviceRequests) {
      lista.push({ key: `r-${s.id}`, fecha: s.created_at, tipo: "reparacion", titulo: `Pidió una reparación: ${s.service_title}`, detalle: s.ciudad || undefined, destino: "reparaciones" });
      if (s.seguimiento_actualizado) {
        lista.push({
          key: `re-${s.id}`,
          fecha: s.seguimiento_actualizado,
          tipo: "etapa",
          titulo: `Reparación: ${SEGUIMIENTO_LABEL[s.seguimiento ?? ""] ?? s.seguimiento ?? "seguimiento"}`,
          detalle: [s.service_title, s.seguimiento_nota].filter(Boolean).join(" · "),
          destino: "reparaciones",
        });
      }
    }
    for (const v of sellRequests) {
      lista.push({ key: `v-${v.id}`, fecha: v.created_at, tipo: "venta", titulo: `Nos quiso vender: ${v.articulo}`, detalle: [v.precio_estimado, v.ciudad].filter(Boolean).join(" · ") || undefined, destino: "ventas" });
    }
    for (const c of purchases) {
      lista.push({ key: `c-${c.id}`, fecha: c.created_at, tipo: "compra", titulo: `Le vendimos: ${c.product_title || "Producto"}`, detalle: c.source === "comprar_ya" ? "Comprar ya" : "Marcado a mano", destino: "pedidos" });
    }
    (eventosCompra ?? []).slice(0, 30).forEach((e, i) => {
      const etiqueta = EVENTOS_COMPRA.find((x) => x.key === e.event_name)?.label ?? e.event_name;
      const ref = e.metadata?.numero ? (pedidos ?? []).find((x) => x.numero === e.metadata?.numero)?.codigo_seguimiento ?? `nº ${e.metadata.numero}` : "";
      lista.push({ key: `e-${i}-${e.created_at}`, fecha: e.created_at, tipo: "intento", titulo: etiqueta, detalle: [e.titulo, ref ? `pedido ${ref}` : ""].filter(Boolean).join(" · ") || undefined });
    });
    for (const d of dispositivos ?? []) {
      lista.push({ key: `d-${d.dispositivo}`, fecha: d.primera_vez, tipo: "dispositivo", titulo: `Primera conexión desde ${d.dispositivo}`, icono: iconoDispositivo(d.dispositivo), destino: "resumen" });
    }
    for (const h of foro.historial) {
      lista.push({ key: `fo-${h.id}`, fecha: h.created_at, tipo: "foro", titulo: `Foro: ${ACCION_MODERACION[h.accion] ?? h.accion}`, detalle: h.detalle ?? undefined, icono: h.accion === "silenciado" ? "volume-mute-outline" : undefined, destino: "actividad" });
    }
    for (const m of mejoras) {
      lista.push({ key: `m-${m.id}`, fecha: m.created_at, tipo: "idea", titulo: "Mandó una idea de mejora", detalle: m.texto.length > 90 ? `${m.texto.slice(0, 90)}…` : m.texto });
    }
    return lista.filter((m) => !Number.isNaN(new Date(m.fecha).getTime())).sort((a, b) => (new Date(a.fecha).getTime() < new Date(b.fecha).getTime() ? 1 : -1));
  }, [createdAt, pedidos, serviceRequests, sellRequests, purchases, eventosCompra, dispositivos, foro.historial, mejoras]);

  const cuenta: Partial<Record<Pestana, number>> = {
    pedidos: pedidos?.length ?? 0,
    reparaciones: serviceRequests.length,
    ventas: sellRequests.length,
  };

  const cifras = [
    { key: "gastado", valor: pedidos ? eurCorto(gastado) : "—", etiqueta: "Gastado" },
    { key: "pedidos", valor: pedidos ? String(pedidos.length) : "—", etiqueta: "Pedidos" },
    { key: "reparaciones", valor: String(serviceRequests.length), etiqueta: "Reparaciones" },
    { key: "ventas", valor: String(sellRequests.length), etiqueta: "Ventas" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />
      {/* Antes iba dentro de SafeAreaView (solo hace algo en iOS nativo): ahora la cabecera y
          el final del scroll suman la zona segura real (también en el iPhone desde la web). */}
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        {/* Barra fija y compacta (volver + título centrado), igual en todo el panel. */}
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 8 + insets.top,
            paddingBottom: 8,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
            backgroundColor: COLORS.bg2,
          }}
        >
          <View style={{ width: "100%", maxWidth: 760, alignSelf: "center", minHeight: 44, justifyContent: "center" }}>
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
                width: 44,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Ionicons name="chevron-back" size={24} color={COLORS.text} />
            </Pressable>
            <Text numberOfLines={1} style={{ paddingHorizontal: 48, color: COLORS.text, fontWeight: "900", fontSize: 17, textAlign: "center" }}>
              Ficha del cliente
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
            <CargaMarca texto="Cargando ficha…" />
          </View>
        ) : (
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <ScrollView
              ref={scrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 48 + insets.bottom, alignItems: "center" }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={CIERRE_TECLADO}
            >
              <View style={{ width: "100%", maxWidth: 760, gap: 16 }}>
                {/* 1) Cabecera tipo tarjeta: quién es, desde cuándo y cuándo entró por última vez; y sus 4 cifras. */}
                <View nativeID="ficha-cabecera" style={{ borderRadius: 20, backgroundColor: COLORS.card, padding: 16, gap: 14 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                    <View style={{ width: 72, height: 72, borderRadius: 36, overflow: "hidden", backgroundColor: COLORS.accent2, alignItems: "center", justifyContent: "center" }}>
                      {perfil?.foto ? (
                        <SmartImage uri={perfil.foto} alt="Foto de perfil del cliente" contentFit="cover" style={{ width: "100%", height: "100%" }} />
                      ) : (
                        <Text style={{ color: COLORS.accent, fontWeight: "900", fontSize: 24 }}>{iniciales(nombre, email)}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text nativeID="ficha-nombre" numberOfLines={2} style={{ color: COLORS.text, fontWeight: "900", fontSize: 24, lineHeight: 29 }}>
                        {titulo}
                      </Text>
                      {perfil && (perfil.usuario || perfil.edad !== null || perfil.provincia) ? (
                        <Text style={{ color: COLORS.muted, fontWeight: "700", fontSize: 15, lineHeight: 21 }}>
                          {[perfil.usuario ? `@${perfil.usuario}` : "", perfil.edad !== null ? `${perfil.edad} años` : "", perfil.provincia].filter(Boolean).join(" · ")}
                        </Text>
                      ) : null}
                      {email ? (
                        <Text selectable numberOfLines={1} style={{ color: COLORS.text, fontSize: 15, lineHeight: 21 }}>
                          {email}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  {createdAt || ultimaConexion ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6 }}>
                      {createdAt ? <Text style={{ color: COLORS.muted, fontSize: 13, fontWeight: "700" }}>Cliente desde {fmtMesAnio(createdAt)}</Text> : null}
                      {createdAt && ultimaConexion ? <Text style={{ color: COLORS.muted, fontSize: 13 }}>·</Text> : null}
                      {ultimaConexion ? (
                        <Text nativeID="ficha-ultima-conexion" accessibilityLabel={`Última conexión ${haceCuanto(ultimaConexion)}, el ${fmtFechaHora(ultimaConexion)}`} style={{ color: COLORS.muted, fontSize: 13, fontWeight: "700" }}>
                          Última conexión {haceCuanto(ultimaConexion)}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}

                  {/* Etiquetas con su icono, sin cápsula. */}
                  <View nativeID="ficha-etiquetas" style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 6 }}>
                    {[
                      faltan === null
                        ? { icon: "person-outline" as IconName, texto: "Sin perfil", color: COLORS.muted }
                        : faltan.length
                          ? { icon: "alert-circle-outline" as IconName, texto: "Perfil a medias", color: COLORS.danger }
                          : { icon: "checkmark-circle-outline" as IconName, texto: "Perfil completo", color: COLORS.success },
                      ...(appInstalada ? [{ icon: "phone-portrait-outline" as IconName, texto: "App instalada", color: COLORS.accent }] : []),
                      ...(foro.silencio ? [{ icon: "volume-mute-outline" as IconName, texto: "Silenciado en el Foro", color: COLORS.danger }] : []),
                    ].map((e) => (
                      <View key={e.texto} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <Ionicons name={e.icon} size={16} color={e.color} />
                        <Text style={{ color: e.color === COLORS.accent ? COLORS.text : e.color, fontWeight: "800", fontSize: 13 }}>{e.texto}</Text>
                      </View>
                    ))}
                  </View>

                  {/* 2) Cuatro cifras clave en fila (número grande, etiqueta pequeña). Cada columna mide lo que su texto y se
                      reparte el resto: así «Reparaciones» cabe entera a 360 px (con cuatro columnas iguales se cortaba). */}
                  <View nativeID="ficha-cifras" style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12 }}>
                    {cifras.map((c, i) => (
                      <View
                        key={c.key}
                        nativeID={`ficha-cifra-${c.key}`}
                        style={{ flexGrow: 1, flexShrink: 1, flexBasis: "auto", alignItems: "center", gap: 2, borderLeftWidth: i ? 1 : 0, borderLeftColor: COLORS.border, paddingHorizontal: 4 }}
                      >
                        <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: "900", fontSize: c.valor.length > 7 ? 17 : 20 }}>
                          {c.valor}
                        </Text>
                        <Text numberOfLines={1} style={{ color: COLORS.muted, fontWeight: "700", fontSize: 13 }}>
                          {c.etiqueta}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* 3) Acciones rápidas: icono + texto, 44 px; dos por fila en el móvil y las cuatro en el ordenador. */}
                <View style={{ gap: 4 }}>
                  <View nativeID="ficha-acciones" style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 8, paddingHorizontal: 4 }}>
                    {[
                      { id: "chat", icon: "chatbubble-ellipses-outline" as IconName, texto: "Escribir por el chat", onPress: escribirPorChat, disabled: creandoChat },
                      { id: "copiar", icon: "copy-outline" as IconName, texto: "Copiar correo", onPress: copiarCorreo, disabled: !email },
                      { id: "pedidos", icon: "receipt-outline" as IconName, texto: "Ver en Pedidos", onPress: () => router.push(email ? ({ pathname: "/admin/pedidos", params: { buscar: email } } as never) : "/admin/pedidos") },
                      { id: "nota", icon: "create-outline" as IconName, texto: "Añadir nota", onPress: anadirNota },
                    ].map((a) => (
                      <View key={a.id} style={{ flexGrow: 1, flexBasis: 150, minWidth: 0 }}>
                        <BotonTexto nativeID={`ficha-accion-${a.id}`} icon={a.icon} texto={a.texto} onPress={a.onPress} disabled={a.disabled} />
                      </View>
                    ))}
                  </View>
                  {chatCliente?.empezo ? (
                    <Text nativeID="ficha-chat-empezo" style={{ color: COLORS.muted, fontWeight: "700", fontSize: 13, paddingHorizontal: 4 }}>
                      {chatCliente.empezo === "tienda" ? "Conversación empezada por la tienda" : "Conversación empezada por el cliente"}
                    </Text>
                  ) : null}
                  {avisoAccion ? (
                    <Text nativeID="ficha-aviso-accion" accessibilityRole="alert" style={{ color: avisoAccion.ok ? COLORS.success : COLORS.muted, fontWeight: "800", fontSize: 13, paddingHorizontal: 4 }}>
                      {avisoAccion.texto}
                    </Text>
                  ) : null}
                </View>

                {/* 4) Pestañas deslizables (con su número), recordadas en la URL (?tab=). */}
                <View onLayout={(e) => (pestanasY.current = e.nativeEvent.layout.y)} style={{ borderBottomWidth: 1, borderBottomColor: COLORS.border, marginHorizontal: -16 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 22, flexGrow: 1, justifyContent: "center" }}>
                    <View nativeID="ficha-pestanas" role="tablist" style={{ flexDirection: "row", gap: 22 }}>
                      {PESTANAS.map((t) => {
                        const activa = tab === t;
                        const n = cuenta[t];
                        return (
                          <Pressable
                            key={t}
                            nativeID={`ficha-pestana-${t}`}
                            onPress={() => cambiarTab(t)}
                            role="tab"
                            aria-selected={activa}
                            accessibilityLabel={n ? `${NOMBRE_PESTANA[t]} (${n})` : NOMBRE_PESTANA[t]}
                            style={({ pressed }) => ({ minHeight: 48, justifyContent: "flex-end", opacity: pressed ? 0.7 : 1 })}
                          >
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingBottom: 9 }}>
                              <Text style={{ color: activa ? COLORS.text : COLORS.muted, fontWeight: "900", fontSize: 15 }}>{NOMBRE_PESTANA[t]}</Text>
                              {n ? <Text style={{ color: activa ? COLORS.accent : COLORS.muted, fontWeight: "900", fontSize: 13 }}>{n}</Text> : null}
                            </View>
                            <View style={{ height: 3, borderRadius: 2, backgroundColor: activa ? COLORS.accent : "transparent" }} />
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>

                {/* Deslizar el dedo a un lado u otro sobre el contenido cambia de pestaña, en bucle (useGestoPestanas). */}
                <Animated.View
                  ref={gesto.ref}
                  nativeID={`ficha-contenido-${tab}`}
                  {...gesto.panHandlers}
                  style={{ gap: 24, transform: [{ translateX: gesto.desliz }] }}
                >
                  {tab === "resumen" ? (
                    <>
                      {/* La nota interna, fijada arriba (fondo amarillo muy suave). */}
                      {notaGuardada.trim() ? (
                        <Pressable
                          nativeID="ficha-nota-fijada"
                          onPress={() => cambiarTab("notas")}
                          accessibilityRole="button"
                          accessibilityLabel="Nota interna fijada: abrir en Notas"
                          style={({ pressed }) => ({ borderRadius: 16, backgroundColor: COLORS.notaBg, borderWidth: 1, borderColor: COLORS.notaBorde, padding: 14, gap: 6, opacity: pressed ? 0.85 : 1 })}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <Ionicons name="pin-outline" size={18} color={COLORS.warn} />
                            <Text style={{ flex: 1, color: COLORS.warn, fontWeight: "900", fontSize: 13, letterSpacing: 0.3 }}>NOTA INTERNA</Text>
                            {notesUpdatedAt ? <Text style={{ color: COLORS.muted, fontSize: 13 }}>{fmtDate(notesUpdatedAt)}</Text> : null}
                          </View>
                          <Text numberOfLines={6} style={{ color: COLORS.text, fontSize: 15, lineHeight: 21 }}>
                            {notaGuardada.trim()}
                          </Text>
                        </Pressable>
                      ) : null}

                      <Seccion nativeID="ficha-ultimos" icon="time-outline" title="Últimos movimientos">
                        {movimientos.length ? (
                          <>
                            <LineaTiempo movimientos={movimientos.slice(0, 3)} onIr={(t) => cambiarTab(t)} />
                            {movimientos.length > 3 ? (
                              <BotonTexto icon="list-outline" texto="Ver toda la actividad" onPress={() => cambiarTab("actividad")} />
                            ) : null}
                          </>
                        ) : (
                          <EmptyRow text="Todavía no hay movimientos." />
                        )}
                      </Seccion>

                      <Seccion nativeID="ficha-perfil" icon="id-card-outline" title="Datos del perfil">
                        {perfil ? (
                          <View style={{ gap: 0 }}>
                            <Text style={{ color: faltan?.length ? COLORS.danger : COLORS.success, fontWeight: "800", fontSize: 13, paddingBottom: 4 }}>
                              {faltan?.length ? `Faltan: ${faltan.join(", ")}` : "Perfil completo"}
                              {perfil.actualizado ? ` · actualizado ${new Date(perfil.actualizado).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" })}` : ""}
                            </Text>
                            {[
                              ["Nombre", perfil.nombre],
                              ["Usuario", perfil.usuario ? `@${perfil.usuario}` : ""],
                              ["País", perfil.pais],
                              ["Provincia", perfil.provincia],
                              ["Edad", perfil.edad !== null ? `${perfil.edad} años` : ""],
                              // Dirección de envío (opcional) de Mi perfil: la que rellena sus pedidos.
                              // Con 2 o más (hasta 3: Casa, Trabajo, Familiar), cuántas y cada una entera; la predeterminada, marcada.
                              ...(perfil.direcciones && perfil.direcciones.length >= 2
                                ? [
                                    ["Direcciones guardadas", `${perfil.direcciones.length}: ${perfil.direcciones.map((d) => d.etiqueta).join(", ")}`, "ficha-perfil-direcciones"],
                                    ...perfil.direcciones.map((d) => [`${d.etiqueta}${d.predeterminada ? " (predeterminada)" : ""}`, d.linea, `ficha-perfil-direccion-${d.id}`]),
                                  ]
                                : perfil.direccion !== null
                                  ? [["Dirección de envío", perfil.direccion]]
                                  : []),
                              // Teléfono (opcional) de Mi perfil, con «Copiar».
                              ...(perfil.telefono !== null ? [["Teléfono", perfil.telefono]] : []),
                            ].map(([etiqueta, valor, id]) => (
                              <View
                                key={etiqueta}
                                nativeID={etiqueta === "Teléfono" ? "ficha-perfil-telefono" : id}
                                style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: COLORS.border }}
                              >
                                <Text style={{ color: COLORS.muted, fontWeight: "700", fontSize: 15 }}>{etiqueta}</Text>
                                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, flexShrink: 1 }}>
                                  <Text style={{ color: valor ? COLORS.text : COLORS.muted, fontWeight: "800", fontSize: 15, flexShrink: 1, textAlign: "right" }}>{valor || "—"}</Text>
                                  {etiqueta === "Teléfono" && valor ? (
                                    <Pressable
                                      nativeID="ficha-copiar-telefono"
                                      onPress={copiarTelefono}
                                      accessibilityRole="button"
                                      accessibilityLabel="Copiar teléfono"
                                      style={({ pressed }) => ({
                                        minHeight: 44,
                                        paddingHorizontal: 12,
                                        borderRadius: 999,
                                        borderWidth: 1,
                                        borderColor: COLORS.border,
                                        backgroundColor: COLORS.card,
                                        flexDirection: "row",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: 5,
                                        opacity: pressed ? 0.75 : 1,
                                      })}
                                    >
                                      <Ionicons name={telCopiado ? "checkmark" : "copy-outline"} size={16} color={telCopiado ? COLORS.success : COLORS.accent} />
                                      <Text style={{ color: telCopiado ? COLORS.success : COLORS.text, fontWeight: "800", fontSize: 14 }}>{telCopiado ? "Copiado" : "Copiar"}</Text>
                                    </Pressable>
                                  ) : null}
                                </View>
                              </View>
                            ))}
                          </View>
                        ) : (
                          <EmptyRow text="Todavía no ha rellenado su perfil." />
                        )}
                      </Seccion>

                      {/* Dispositivos desde los que entra (dueño, 2026-11-12): tipo y navegador, si usa la app instalada, primera y
                          última vez e inicios de sesión, del más reciente al más antiguo. Sin la migración, no sale. */}
                      {dispositivos !== null ? (
                        <Seccion nativeID="ficha-dispositivos" icon="phone-portrait-outline" title="Dispositivos" count={dispositivos.length}>
                          {dispositivos.length === 0 ? (
                            <EmptyRow text="Aún no hay conexiones registradas (se registran desde el 12/11/2026)." />
                          ) : (
                            <View>
                              {dispositivos.map((d, i) => (
                                <View
                                  key={d.dispositivo}
                                  style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.border }}
                                >
                                  <Ionicons name={iconoDispositivo(d.dispositivo)} size={22} color={COLORS.accent} style={{ marginTop: 1 }} />
                                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 15 }}>
                                      {d.dispositivo}
                                      {d.app_instalada ? <Text style={{ color: COLORS.success, fontWeight: "800", fontSize: 13 }}> · App instalada</Text> : null}
                                    </Text>
                                    <Text style={{ color: COLORS.muted, fontSize: 13, lineHeight: 18 }}>
                                      Última vez: {haceCuanto(d.ultima_vez)} ({fmtFechaHora(d.ultima_vez)})
                                    </Text>
                                    <Text style={{ color: COLORS.muted, fontSize: 13, lineHeight: 18 }}>
                                      Primera vez: {fmtFechaHora(d.primera_vez)} · {d.inicios === 1 ? "1 inicio de sesión" : `${d.inicios} inicios de sesión`}
                                    </Text>
                                  </View>
                                </View>
                              ))}
                            </View>
                          )}
                        </Seccion>
                      ) : null}
                    </>
                  ) : null}

                  {tab === "pedidos" ? (
                    <>
                      <Seccion nativeID="ficha-pedidos" icon="receipt-outline" title="Pedidos" count={pedidos?.length}>
                        {pedidos === null ? (
                          <EmptyRow text="No se han podido leer sus pedidos." />
                        ) : pedidos.length === 0 ? (
                          <EmptyRow text="No ha hecho ningún pedido en la tienda." />
                        ) : (
                          <View>
                            {pedidos.map((p, i) => (
                              <PedidoFila
                                key={p.id}
                                pedido={p}
                                primero={i === 0}
                                abierto={abiertos.has(p.id)}
                                onAlternar={() => alternar(p.id)}
                                onCambiado={(estado) => setPedidos((prev) => (prev ?? []).map((x) => (x.id === p.id ? { ...x, estado } : x)))}
                              />
                            ))}
                          </View>
                        )}
                      </Seccion>

                      {/* Pagos con tarjeta e intentos de compra (dueño, 2026-11-06): lo que ha pagado y devuelto, y lo que ha hecho
                          en la cesta y al pagar según la analítica propia (solo si la aceptó). */}
                      <Seccion nativeID="ficha-compras" icon="card-outline" title="Pagos e intentos de compra">
                        {(() => {
                          const pagados = (pedidos ?? []).filter((p) => p.pago_estado === "pagado");
                          const devueltos = pagados.filter((p) => !!p.devuelto_en);
                          const sinTerminar = (pedidos ?? []).filter((p) => p.pago_estado === "iniciado").length;
                          const cuantos = (k: string) => (eventosCompra ?? []).filter((e) => e.event_name === k).length;
                          const recientes = (eventosCompra ?? []).slice(0, 8);
                          return (
                            <View style={{ gap: 8 }}>
                              <Text nativeID="ficha-compras-pagos" style={{ color: COLORS.text, fontSize: 15, fontWeight: "800", lineHeight: 21 }}>
                                Pagos online: {pagados.length} ({eur(pagados.filter((p) => p.pago_modo === "real").reduce((a, p) => a + Number(p.pagado_eur ?? 0), 0))} de
                                verdad{pagados.some((p) => p.pago_modo === "prueba") ? `; ${pagados.filter((p) => p.pago_modo === "prueba").length} de prueba` : ""}) · devueltos:{" "}
                                {devueltos.length} · empezados sin terminar: {sinTerminar}
                              </Text>
                              {eventosCompra === null ? (
                                <EmptyRow text="No se ha podido leer su actividad de compra." />
                              ) : (
                                <>
                                  <Text nativeID="ficha-compras-intentos" style={{ color: COLORS.muted, fontSize: 13, fontWeight: "700", lineHeight: 19 }}>
                                    Últimos 90 días · {EVENTOS_COMPRA.map((e) => `${e.label}: ${cuantos(e.key)}`).join(" · ")}
                                  </Text>
                                  {recientes.length === 0 ? (
                                    <EmptyRow text="Sin actividad de compra registrada (o no aceptó la analítica)." />
                                  ) : (
                                    <View style={{ gap: 4 }}>
                                      {recientes.map((e, i) => (
                                        <Text key={`${e.created_at}-${i}`} style={{ color: COLORS.muted, fontSize: 13, lineHeight: 19 }}>
                                          {fmtDate(e.created_at)} · {EVENTOS_COMPRA.find((x) => x.key === e.event_name)?.label ?? e.event_name}
                                          {e.titulo ? ` · ${e.titulo}` : ""}
                                          {e.metadata?.numero
                                            ? (() => {
                                                // La analítica guarda el número interno: se enseña la referencia de ese pedido si está en la ficha.
                                                const ref = (pedidos ?? []).find((x) => x.numero === e.metadata?.numero)?.codigo_seguimiento;
                                                return ref ? ` · pedido ${ref}` : ` · pedido nº ${e.metadata.numero}`;
                                              })()
                                            : ""}
                                        </Text>
                                      ))}
                                    </View>
                                  )}
                                </>
                              )}
                            </View>
                          );
                        })()}
                      </Seccion>

                      <Seccion nativeID="ficha-compras-tienda" icon="bag-check-outline" title="Compras a la tienda" count={purchases.length}>
                        {purchases.length === 0 ? (
                          <EmptyRow text="Todavía no le hemos vendido nada (marcado a mano o con «Comprar ya»)." />
                        ) : (
                          <View>
                            {purchases.map((p, i) => (
                              <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.border }}>
                                <Miniatura uri={p.product_image} alt={p.product_title || "Producto"} icono="cube-outline" />
                                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                                  <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: "800", fontSize: 15 }}>
                                    {p.product_title || "Producto"}
                                  </Text>
                                  <Text numberOfLines={1} style={{ color: COLORS.muted, fontSize: 13 }}>
                                    {p.product_condition ? `${p.product_condition} · ` : ""}
                                    {p.source === "comprar_ya" ? "Comprar ya" : "Marcado a mano"} · {fmtDate(p.created_at)}
                                  </Text>
                                </View>
                              </View>
                            ))}
                          </View>
                        )}
                      </Seccion>
                    </>
                  ) : null}

                  {tab === "reparaciones" ? (
                    <Seccion nativeID="ficha-reparaciones" icon="construct-outline" title="Servicio de reparación" count={serviceRequests.length}>
                      {serviceRequests.length === 0 ? (
                        <EmptyRow text="No ha contratado ningún servicio (con sesión iniciada)." />
                      ) : (
                        <View>
                          {serviceRequests.map((s, i) => {
                            const abierto = abiertos.has(s.id);
                            return (
                              <View key={s.id} nativeID={`ficha-reparacion-${s.id}`} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.border, paddingBottom: abierto ? 12 : 0 }}>
                                <Pressable
                                  onPress={() => alternar(s.id)}
                                  accessibilityRole="button"
                                  accessibilityState={{ expanded: abierto }}
                                  accessibilityLabel={`${s.service_title}: ${abierto ? "plegar" : "desplegar"}`}
                                  style={({ pressed }) => ({ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, opacity: pressed ? 0.75 : 1 })}
                                >
                                  <Miniatura icono="construct-outline" />
                                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                                    <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: "800", fontSize: 15 }}>
                                      {s.service_title}
                                    </Text>
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                      {s.seguimiento ? (
                                        <Estado
                                          texto={SEGUIMIENTO_LABEL[s.seguimiento] ?? s.seguimiento}
                                          tono={s.seguimiento === "cancelado" ? "danger" : s.seguimiento === "entregado" ? "success" : "curso"}
                                        />
                                      ) : (
                                        <StatusPill status={s.status} />
                                      )}
                                      <Text style={{ color: COLORS.muted, fontSize: 13 }}>{fmtDate(s.created_at)}</Text>
                                    </View>
                                  </View>
                                  <Ionicons name={abierto ? "chevron-up" : "chevron-down"} size={20} color={COLORS.muted} />
                                </Pressable>
                                {abierto ? (
                                  <View style={{ borderRadius: 16, backgroundColor: COLORS.cardSoft, padding: 12, gap: 10 }}>
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                      <Text style={{ color: COLORS.muted, fontSize: 13, fontWeight: "700" }}>Solicitud:</Text>
                                      <StatusPill status={s.status} />
                                      {s.ciudad ? <Text style={{ color: COLORS.muted, fontSize: 13 }}>· {s.ciudad}</Text> : null}
                                    </View>
                                    {seguimientoDisponible ? (
                                      <SeguimientoReparacion
                                        solicitud={s}
                                        onGuardado={(cambio) => setServiceRequests((prev) => prev.map((x) => (x.id === s.id ? { ...x, ...cambio } : x)))}
                                      />
                                    ) : null}
                                    <BotonTexto icon="chevron-up" texto="Plegar" onPress={() => alternar(s.id)} accessibilityLabel={`Plegar ${s.service_title}`} />
                                  </View>
                                ) : null}
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </Seccion>
                  ) : null}

                  {tab === "ventas" ? (
                    <Seccion nativeID="ficha-ventas" icon="pricetag-outline" title="Ventas a la tienda" count={sellRequests.length}>
                      {sellRequests.length === 0 ? (
                        <EmptyRow text="No nos ha intentado vender nada (con sesión iniciada)." />
                      ) : (
                        <View>
                          {sellRequests.map((s, i) => (
                            <View key={s.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.border }}>
                              <Miniatura icono="pricetag-outline" />
                              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                                <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: "800", fontSize: 15 }}>
                                  {s.articulo}
                                </Text>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                  <StatusPill status={s.status} />
                                  <Text style={{ color: COLORS.muted, fontSize: 13, flexShrink: 1 }}>
                                    {[s.precio_estimado, s.ciudad, fmtDate(s.created_at)].filter(Boolean).join(" · ")}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </Seccion>
                  ) : null}

                  {tab === "actividad" ? (
                    <Seccion nativeID="ficha-actividad" icon="pulse-outline" title="Actividad" count={movimientos.length || undefined}>
                      {movimientos.length ? (
                        <>
                          <LineaTiempo movimientos={movimientos.slice(0, limiteActividad)} porDia onIr={(t) => cambiarTab(t, true)} />
                          {movimientos.length > limiteActividad ? (
                            <BotonTexto icon="chevron-down" texto={`Ver más (${movimientos.length - limiteActividad})`} onPress={() => setLimiteActividad((n) => n + 30)} />
                          ) : limiteActividad > 30 ? (
                            <BotonTexto icon="chevron-up" texto="Ver menos" onPress={() => setLimiteActividad(30)} />
                          ) : null}
                        </>
                      ) : (
                        <EmptyRow text="Todavía no hay movimientos." />
                      )}
                    </Seccion>
                  ) : null}

                  {/* Siempre montados (cargan lo suyo para la línea de tiempo y la etiqueta del Foro); solo se ven en Actividad. */}
                  <ForoCliente userId={userId} visible={tab === "actividad"} onDatos={setForo} />
                  <MejorasCliente userId={userId} visible={tab === "actividad"} onDatos={setMejoras} />

                  {tab === "notas" ? (
                    <Seccion nativeID="ficha-notas" icon="document-text-outline" title="Notas internas">
                      <Text style={{ color: COLORS.muted, fontSize: 15, lineHeight: 21 }}>
                        Para todo lo que no encaja en otra parte: intercambios, garantías, acuerdos concretos con este cliente… Solo la ve el
                        equipo de la tienda y sale fijada en el Resumen.
                      </Text>
                      <TextInput
                        ref={notasRef}
                        nativeID="ficha-notas-texto"
                        value={notes}
                        onChangeText={setNotes}
                        editable={notesLoaded}
                        multiline
                        accessibilityLabel="Notas internas del cliente"
                        placeholder="Escribe aquí cualquier detalle útil sobre este cliente…"
                        placeholderTextColor="rgba(11,33,56,0.55)"
                        style={{
                          minHeight: 140,
                          borderWidth: 1,
                          borderColor: COLORS.border,
                          borderRadius: 14,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          color: COLORS.text,
                          backgroundColor: COLORS.notaBg,
                          // 16 px: con menos, Safari (iPhone) hace zoom al enfocar y la pantalla
                          // se queda ampliada y "descuadrada".
                          fontSize: 16,
                          lineHeight: 22,
                          textAlignVertical: "top",
                        }}
                      />
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <Pressable
                          onPress={handleSaveNotes}
                          disabled={savingNotes || !notesLoaded || notes === notaGuardada}
                          accessibilityRole="button"
                          style={({ pressed }) => ({
                            minHeight: 44,
                            justifyContent: "center",
                            opacity: savingNotes || !notesLoaded || notes === notaGuardada ? 0.5 : pressed ? 0.88 : 1,
                            borderRadius: 999,
                            paddingHorizontal: 22,
                            backgroundColor: COLORS.accent,
                          })}
                        >
                          <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15, textAlign: "center" }}>{savingNotes ? "Guardando…" : "Guardar nota"}</Text>
                        </Pressable>
                        {notesSaved ? (
                          <Text style={{ color: COLORS.success, fontWeight: "800", fontSize: 13 }}>Guardado ✓</Text>
                        ) : notesError ? (
                          <Text accessibilityRole="alert" style={{ color: COLORS.danger, fontWeight: "800", fontSize: 13 }}>
                            No se ha podido guardar. Inténtalo de nuevo.
                          </Text>
                        ) : notesUpdatedAt ? (
                          <Text style={{ color: COLORS.muted, fontSize: 13 }}>Última actualización: {fmtDate(notesUpdatedAt)}</Text>
                        ) : null}
                      </View>
                    </Seccion>
                  ) : null}
                </Animated.View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </View>
    </View>
  );
}

// Miniatura de 44 px: la foto si la hay; si no, un icono sobre fondo suave.
function Miniatura({ uri, alt, icono }: { uri?: string | null; alt?: string; icono: IconName }) {
  return (
    <View style={{ width: 44, height: 44, borderRadius: 12, overflow: "hidden", backgroundColor: COLORS.card, alignItems: "center", justifyContent: "center" }}>
      {uri ? <SmartImage uri={uri} alt={alt ?? ""} contentFit="cover" style={{ width: "100%", height: "100%" }} /> : <Ionicons name={icono} size={20} color={COLORS.muted} />}
    </View>
  );
}

// --- Foro: silencio e historial de moderación de este cliente --------------------------------------------------------
// Tablas foro_silencios y foro_moderacion (supabase/migrations/20261031110000_foro_silencios_y_moderacion.sql). Si aún no
// existen, no sale. Silenciar aquí es lo mismo que desde el Foro (lo hace cumplir la base de datos). Pasa su historial y
// su silencio a la ficha (línea de tiempo y etiqueta «Silenciado en el Foro»).

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

function ForoCliente({
  userId,
  visible,
  onDatos,
}: {
  userId: string;
  visible: boolean;
  onDatos: (d: { historial: FilaModeracion[]; silencio: { hasta: string } | null }) => void;
}) {
  const [disponible, setDisponible] = useState(false);
  const [silencio, setSilencio] = useState<{ hasta: string; motivo: string | null } | null>(null);
  const [historial, setHistorial] = useState<FilaModeracion[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const onDatosRef = useRef(onDatos);
  onDatosRef.current = onDatos;

  const cargar = useCallback(async () => {
    const [sil, mod] = await Promise.all([
      supabase.from("foro_silencios").select("hasta,motivo").eq("user_id", userId).maybeSingle<{ hasta: string; motivo: string | null }>(),
      supabase.from("foro_moderacion").select("id,created_at,accion,detalle").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
    ]);
    if (sil.error || mod.error) {
      setDisponible(false);
      return;
    }
    const activo = sil.data && new Date(sil.data.hasta).getTime() > Date.now() ? sil.data : null;
    const filas = (mod.data ?? []) as FilaModeracion[];
    setDisponible(true);
    setSilencio(activo);
    setHistorial(filas);
    onDatosRef.current({ historial: filas, silencio: activo });
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

  if (!disponible || !visible) return null;

  return (
    <Seccion nativeID="ficha-foro" icon="chatbubbles-outline" title="Foro" count={historial.length ? `${historial.length} en el registro` : undefined}>
      {silencio ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Text style={{ flex: 1, minWidth: 180, color: COLORS.danger, fontWeight: "800", fontSize: 15 }}>
            Silenciado hasta el {fechaHora(silencio.hasta)}
            {silencio.motivo ? ` · ${silencio.motivo}` : ""}
          </Text>
          <EtapaChip etiqueta="Quitar silencio" activa={false} disabled={guardando} onPress={() => silenciar(null)} />
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <Text style={{ color: COLORS.muted, fontSize: 15, lineHeight: 21 }}>Puede escribir en el Foro. Silenciar (no podrá escribir ni comentar):</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[1, 3, 7].map((d) => (
              <EtapaChip key={d} etiqueta={d === 1 ? "1 día" : `${d} días`} activa={false} disabled={guardando} onPress={() => silenciar(d)} />
            ))}
          </View>
        </View>
      )}
      {aviso ? (
        <Text accessibilityRole="alert" style={{ color: aviso.ok ? COLORS.success : COLORS.danger, fontWeight: "800", fontSize: 13 }}>
          {aviso.texto}
        </Text>
      ) : null}
      {historial.length ? (
        <View style={{ gap: 0 }}>
          <Text style={{ color: COLORS.muted, fontWeight: "900", fontSize: 13, letterSpacing: 0.3, paddingBottom: 4 }}>HISTORIAL DE MODERACIÓN</Text>
          {historial.map((h, i) => (
            <View key={h.id} style={{ paddingVertical: 9, gap: 2, borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.border }}>
              <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 15 }}>
                {ACCION_MODERACION[h.accion] ?? h.accion} · <Text style={{ color: COLORS.muted, fontWeight: "700", fontSize: 13 }}>{fechaHora(h.created_at)}</Text>
              </Text>
              {h.detalle ? (
                <Text numberOfLines={3} style={{ color: COLORS.muted, fontSize: 13, lineHeight: 19 }}>
                  {h.detalle}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <EmptyRow text="Sin nada en el registro de moderación." />
      )}
    </Seccion>
  );
}

// --- Ideas de mejora de este cliente ---------------------------------------------------------------------------------
// Lo que ha mandado desde «Mejoras en la tienda» (tabla mejoras_tienda, migración 20261101200000_mejoras_tienda.sql),
// con desde dónde y si ya está leída. Si la tabla aún no existe o no ha mandado ninguna, no sale. Pasa la lista a la
// ficha para la línea de tiempo.

function MejorasCliente({ userId, visible, onDatos }: { userId: string; visible: boolean; onDatos: (m: MejoraFicha[]) => void }) {
  const [mejoras, setMejoras] = useState<MejoraFicha[]>([]);
  const [marcando, setMarcando] = useState<string | null>(null);
  const onDatosRef = useRef(onDatos);
  onDatosRef.current = onDatos;

  useEffect(() => {
    if (!userId) return;
    let vivo = true;
    supabase
      .from("mejoras_tienda")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (!vivo || error) return;
        const lista = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
          id: String(r.id ?? ""),
          created_at: String(r.created_at ?? ""),
          texto: String(r.texto ?? ""),
          origen: (["blue", "pie", "perfil"].includes(String(r.origen)) ? r.origen : "blue") as OrigenMejora,
          leida: r.leida === true,
        }));
        setMejoras(lista);
        onDatosRef.current(lista);
      });
    return () => {
      vivo = false;
    };
  }, [userId]);

  async function marcar(id: string) {
    setMarcando(id);
    const { data, error } = await supabase.from("mejoras_tienda").update({ leida: true, leida_en: new Date().toISOString() }).eq("id", id).select("id");
    setMarcando(null);
    if (!error && Array.isArray(data) && data.length) setMejoras((l) => l.map((m) => (m.id === id ? { ...m, leida: true } : m)));
  }

  if (!mejoras.length || !visible) return null;
  const sinLeer = mejoras.filter((m) => !m.leida).length;

  return (
    <Seccion nativeID="ficha-mejoras" icon="bulb-outline" title="Ideas de mejora" count={sinLeer ? `${sinLeer} sin leer` : mejoras.length}>
      {mejoras.map((m) => (
        <View key={m.id} style={{ borderRadius: 14, backgroundColor: m.leida ? COLORS.cardSoft : COLORS.accent2, padding: 12, gap: 6 }}>
          <Text style={{ color: COLORS.text, fontWeight: m.leida ? "600" : "800", fontSize: 15, lineHeight: 21 }}>{m.texto}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Text style={{ flex: 1, minWidth: 160, color: COLORS.muted, fontWeight: "700", fontSize: 13 }}>
              {fechaHora(m.created_at)} · desde {ORIGENES_MEJORA[m.origen]}
              {m.leida ? " · leída" : ""}
            </Text>
            {!m.leida ? <EtapaChip etiqueta="Marcar como leída" activa={false} disabled={marcando === m.id} onPress={() => marcar(m.id)} /> : null}
          </View>
        </View>
      ))}
    </Seccion>
  );
}

// --- Etapas desde la ficha ------------------------------------------------------------------------------------------

// Botón de etapa: la actual resaltada (en rojo si es la de cancelar). 44 px de alto para tocarlo bien.
function EtapaChip({
  etiqueta,
  activa,
  peligro,
  disabled,
  ancho,
  onPress,
}: {
  etiqueta: string;
  activa: boolean;
  peligro?: boolean;
  disabled?: boolean;
  // En la rejilla de etapas: crece para llenar la fila (2 por fila en el móvil, 3 en el ordenador).
  ancho?: boolean;
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
        alignItems: "center",
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: activa ? 2 : 1,
        borderColor: activa ? (peligro ? COLORS.danger : COLORS.accent) : COLORS.border,
        backgroundColor: activa ? (peligro ? COLORS.dangerBg : COLORS.accent2) : "#FFFFFF",
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        ...(ancho ? { flexGrow: 1, flexBasis: "30%", minWidth: 130 } : null),
      })}
    >
      <Text style={{ color: activa ? (peligro ? COLORS.danger : COLORS.text) : COLORS.text, fontWeight: activa ? "900" : "700", fontSize: 15, textAlign: "center" }}>
        {etiqueta}
      </Text>
    </Pressable>
  );
}

// Un pedido en una fila compacta (miniatura, referencia, importe, etapa y factura). Al tocarlo se despliega con sus
// detalles y los botones de etapa (como en Administración → Pedidos); al volver a tocarlo (o «Plegar»), se pliega.
function PedidoFila({
  pedido,
  primero,
  abierto,
  onAlternar,
  onCambiado,
}: {
  pedido: PedidoFicha;
  primero: boolean;
  abierto: boolean;
  onAlternar: () => void;
  onCambiado: (estado: EstadoPedido) => void;
}) {
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

  // «Ver factura»: la misma API que «Descargar» (api/factura.ts) con «ver=1», que la abre en el navegador.
  const [abriendoFactura, setAbriendoFactura] = useState(false);
  async function verFactura() {
    setAbriendoFactura(true);
    setAviso(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      const r = await fetch(`/api/factura?pedido=${encodeURIComponent(pedido.id)}&ver=1`, { headers: { Authorization: `Bearer ${s.session?.access_token ?? ""}` } });
      const d = (await r.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null;
      if (r.ok && d?.ok && d.url) openExternalLink(d.url);
      else setAviso({ ok: false, texto: r.status === 409 ? "El PDF aún está llegando de VeoAura: prueba en unos minutos." : `No se pudo abrir la factura: ${d?.error ?? "sin respuesta del servidor"}.` });
    } catch {
      setAviso({ ok: false, texto: "No se pudo abrir la factura: sin conexión." });
    } finally {
      setAbriendoFactura(false);
    }
  }

  const items = pedido.pedido_items ?? [];
  const ref = pedido.codigo_seguimiento ? pedido.codigo_seguimiento : `Pedido nº ${pedido.numero ?? "—"}`;
  const clave = pedido.numero ?? pedido.id;
  return (
    <View nativeID={`ficha-pedido-${clave}`} style={{ borderTopWidth: primero ? 0 : 1, borderTopColor: COLORS.border, paddingBottom: abierto || pedido.factura ? 10 : 0 }}>
      <Pressable
        nativeID={`ficha-pedido-abrir-${clave}`}
        onPress={onAlternar}
        accessibilityRole="button"
        accessibilityState={{ expanded: abierto }}
        accessibilityLabel={`Pedido ${ref}: ${abierto ? "plegar" : "desplegar"}`}
        style={({ pressed }) => ({ minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, opacity: pressed ? 0.75 : 1 })}
      >
        <Miniatura uri={pedido.miniatura} alt={items[0]?.titulo ?? "Pedido"} icono="receipt-outline" />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: "900", fontSize: 15 }}>
            {pedido.codigo_seguimiento ? `Pedido ${pedido.codigo_seguimiento}` : ref}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Estado texto={etiquetaEstadoPedido(pedido.estado, pedido.entrega)} tono={TONO_ESTADO[pedido.estado]} />
            <Text style={{ color: COLORS.muted, fontSize: 13 }}>{fmtDate(pedido.created_at)}</Text>
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 15 }}>{pedido.total_eur != null ? eur(pedido.total_eur) : ""}</Text>
          <Ionicons name={abierto ? "chevron-up" : "chevron-down"} size={20} color={COLORS.muted} />
        </View>
      </Pressable>

      {/* Factura de VeoAura: «Ver factura» la abre en una pestaña nueva para revisar cómo ha quedado. Texto con su icono. */}
      {pedido.factura ? (
        <View nativeID={`ficha-factura-${clave}`} style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", paddingLeft: 56 }}>
          <Ionicons name="document-text-outline" size={16} color={COLORS.muted} />
          <Text style={{ color: COLORS.muted, fontSize: 13, fontWeight: "800", flexShrink: 1 }}>
            Factura {pedido.factura.numero ?? ""}
            {pedido.factura.pdf ? "" : " · PDF pendiente"}
          </Text>
          {pedido.factura.pdf ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ver la factura ${pedido.factura.numero ?? ""}`}
              onPress={verFactura}
              disabled={abriendoFactura}
              style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 6, opacity: abriendoFactura ? 0.5 : pressed ? 0.7 : 1 })}
            >
              <Ionicons name="eye-outline" size={18} color={COLORS.accent} />
              <Text style={{ color: COLORS.accent, fontWeight: "900", fontSize: 15 }}>Ver factura</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {abierto ? (
        <View nativeID={`ficha-pedido-detalle-${clave}`} style={{ borderRadius: 16, backgroundColor: COLORS.cardSoft, padding: 12, gap: 10, marginTop: pedido.factura ? 4 : 0 }}>
          {pedido.codigo_seguimiento && pedido.numero != null ? (
            <Text nativeID={`ficha-pedido-interno-${pedido.numero}`} style={{ color: COLORS.muted, fontSize: 13, fontWeight: "700" }}>
              Nº interno {pedido.numero}
            </Text>
          ) : null}
          {items.length ? (
            <View style={{ gap: 4 }}>
              {items.map((it) => (
                <View key={it.id} style={{ flexDirection: "row", gap: 12, justifyContent: "space-between" }}>
                  <Text style={{ flex: 1, color: COLORS.text, fontSize: 15, lineHeight: 21 }}>{it.titulo}</Text>
                  {it.precio_eur != null ? <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: "700" }}>{eur(it.precio_eur)}</Text> : null}
                </View>
              ))}
            </View>
          ) : null}
          <Text style={{ color: COLORS.muted, fontSize: 13, fontWeight: "700", lineHeight: 19 }}>
            {pedido.entrega === "recogida" ? "Entrega en mano" : "Envío a domicilio"}
            {pedido.user_id ? "" : " · Hecho sin sesión (con su correo): no lo ve en «Mis seguimientos»"}
          </Text>
          {/* Pago con tarjeta (Stripe): pagado, devuelto o empezado sin terminar. Texto con su icono, sin burbuja. */}
          {pedido.pago_estado ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons
                name={pedido.devuelto_en ? "return-down-back-outline" : pedido.pago_estado === "pagado" ? "card" : "card-outline"}
                size={16}
                color={pedido.pago_estado === "pagado" && !pedido.devuelto_en ? COLORS.success : COLORS.muted}
              />
              <Text
                nativeID={`ficha-pago-${clave}`}
                style={{ flexShrink: 1, color: pedido.pago_estado === "pagado" && !pedido.devuelto_en ? COLORS.success : COLORS.muted, fontSize: 13, fontWeight: "800" }}
              >
                {pedido.pago_estado !== "pagado"
                  ? "Pago online empezado, sin terminar"
                  : pedido.devuelto_en
                    ? `Pagado online ${eur(Number(pedido.pagado_eur))} y devuelto ${eur(Number(pedido.devuelto_eur))} el ${fmtDate(pedido.devuelto_en)}`
                    : `Pagado online · ${eur(Number(pedido.pagado_eur))} · ${pedido.pagado_en ? fmtDate(pedido.pagado_en) : ""}`}
                {pedido.pago_modo === "prueba" ? " (de prueba)" : ""}
              </Text>
            </View>
          ) : null}
          <Text style={{ color: COLORS.muted, fontWeight: "900", fontSize: 13, letterSpacing: 0.3, paddingTop: 2 }}>ETAPA DEL PEDIDO</Text>
          <View nativeID={`ficha-pedido-etapas-${clave}`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {ESTADOS_PEDIDO.map((e) => (
              <EtapaChip
                key={e}
                ancho
                etiqueta={etiquetaEstadoPedido(e, pedido.entrega)}
                activa={pedido.estado === e}
                peligro={e === "cancelado"}
                disabled={guardando}
                onPress={() => cambiar(e)}
              />
            ))}
          </View>
          {aviso ? (
            <Text accessibilityRole="alert" style={{ color: aviso.ok ? COLORS.success : COLORS.danger, fontWeight: "800", fontSize: 13 }}>
              {aviso.texto}
            </Text>
          ) : null}
          <BotonTexto icon="chevron-up" texto="Plegar" onPress={onAlternar} accessibilityLabel={`Plegar el pedido ${ref}`} />
        </View>
      ) : aviso ? (
        <Text accessibilityRole="alert" style={{ color: aviso.ok ? COLORS.success : COLORS.danger, fontWeight: "800", fontSize: 13, paddingLeft: 56 }}>
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
    <View style={{ gap: 10 }}>
      <Text style={{ color: COLORS.muted, fontWeight: "900", fontSize: 13, letterSpacing: 0.3 }}>
        SEGUIMIENTO PARA EL CLIENTE
        {solicitud.seguimiento_actualizado ? ` · ${fmtDate(solicitud.seguimiento_actualizado)}` : ""}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {SEGUIMIENTO_ETAPAS.map((e) => (
          <EtapaChip
            key={e}
            ancho
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
        placeholderTextColor="rgba(11,33,56,0.55)"
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Pressable
          onPress={guardar}
          disabled={!cambiado || guardando}
          accessibilityRole="button"
          style={({ pressed }) => ({
            minHeight: 44,
            justifyContent: "center",
            paddingHorizontal: 20,
            borderRadius: 999,
            backgroundColor: COLORS.accent,
            opacity: !cambiado || guardando ? 0.5 : pressed ? 0.88 : 1,
          })}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>{guardando ? "Guardando…" : "Guardar seguimiento"}</Text>
        </Pressable>
        {aviso ? (
          <Text accessibilityRole="alert" style={{ flexShrink: 1, color: aviso.ok ? COLORS.success : COLORS.danger, fontWeight: "800", fontSize: 13 }}>
            {aviso.texto}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
