// app/admin/services.tsx
/**
 * Qué hace: panel de administración del catálogo de SERVICIOS (reparación,
 * limpieza, mantenimiento...) — la contraparte de app/admin/products.tsx
 * pero para servicios en vez de productos, y de app/admin/cotizaciones.tsx
 * pero para las solicitudes de "Contratar servicio ahora" en vez de "Vender
 * ahora". Dos pestañas en una sola pantalla:
 * - "Catálogo": crear, editar, publicar/despublicar, ocultar y borrar
 *   servicios (título, descripción, precio y fotos).
 * - "Solicitudes": las peticiones que envían los clientes desde
 *   components/ContratarServicioModal.tsx en la ficha de cada servicio.
 *
 * Cómo funciona:
 * - Tabla "services" (ver sql/services.sql) + "service_media" (ver
 *   sql/service_media.sql, fotos en el mismo bucket público "product-media"
 *   que ya usan los productos — no hace falta un bucket nuevo). Reutiliza el
 *   selector/subida de imágenes de app/admin/products/products.utils.ts
 *   (pickMediaFilesWeb, buildMediaPath) — mismo mecanismo, solo que aquí
 *   solo se admiten fotos (no vídeo, un servicio no lo necesita).
 * - Tabla "service_requests" (ver sql/service_requests.sql): mismo flujo de
 *   estados que sell_requests (nuevo → revisado → contactado, o descartado
 *   en cualquier momento), con botones en vez de desplegable.
 * - Un servicio se ve en la tienda (app/servicios.tsx, app/servicio/[id].tsx)
 *   solo si status='PUBLISHED' y is_active=true, igual que un producto.
 * - Tema claro (fondo blanco, texto azul marino, acentos azul claro) con
 *   contenido centrado en pantallas anchas (columnStyle, maxWidth 1160).
 * - Scroll: cabecera fija y compacta (volver + título centrado) y, debajo,
 *   pestañas y contenido de la pestaña activa en un único ScrollView (flex 1,
 *   margen final con hueco para el «+» flotante + zona segura). El modal de
 *   alta/edición se desplaza entero y, en iOS, deja sitio al teclado.
 * - Dueño, 2026-11-03: pestañas con subrayado (PestanasPanel) y, deslizando
 *   el dedo sobre el contenido, se pasa a la otra en bucle (useGestoPestanas);
 *   en «Catálogo» el buscador va arriba (como en Productos), los cuatro
 *   contadores en una fila también en el móvil, «Nuevo servicio» es el «+»
 *   flotante abajo a la derecha, los servicios y las solicitudes van sin
 *   recuadro alrededor (separados por una línea) y al tocar la foto de un
 *   servicio se abre en grande con zoom (components/ImageLightbox.tsx).
 *
 * Rendimiento: uploadNewPhotos() sube las fotos a Storage una a una (no se
 * puede agrupar) pero guarda sus filas en "service_media" con un único
 * INSERT agrupado al final, en vez de uno por foto; syncCover() agrupa igual
 * sus cambios en un solo .upsert(). Mismo patrón ya usado en
 * admin/products.tsx (ver normalizeMediaForProduct allí).
 *
 * Conectado con:
 * - sql/services.sql, sql/service_media.sql, sql/service_requests.sql →
 *   tablas y políticas RLS que usa esta pantalla.
 * - app/admin/products/products.utils.ts, products.constants.ts → selector
 *   y subida de fotos, formateo de precio/texto (reutilizados, no duplicados).
 * - app/admin/products/products.components.tsx → AdminHeader, StatCard,
 *   PrimaryButton, AdminNotice y EmptyState (mismo diseño en todo el panel).
 * - app/servicios.tsx, app/servicio/[id].tsx → lo que ve el público.
 * - components/ContratarServicioModal.tsx → origen de cada fila de
 *   service_requests.
 * - Reparación por envío (dueño, 2026-11-11; migración 20261111100000): en «Solicitudes», el bloque
 *   plegable «Reparación por envío» (AjustesEnvioPanel: activarla, dirección del taller, peso por
 *   aparato, custodia, Bizum, IBAN, titular y plazo; no se activa si falta algo y lo dice), el filtro
 *   «Entrega» y, en cada solicitud (PanelEnvioSolicitud), aparatos, coste de la etiqueta, «Marcar
 *   etiqueta pagada», «Subir etiqueta» y «Subir fotos de recepción» (almacén privado «reparaciones»),
 *   presupuesto y si el cliente lo aceptó, y «Esperando pieza hasta». lib/envio.ts lee los ajustes.
 * - Reparación por envío, parte 2 (dueño, 2026-11-11; migración 20261111130000; sin ella, todo como antes):
 *   en la ficha de cada servicio, «Peso para el envío (kg, con su caja)» con la marca «estimado» hasta
 *   que el dueño lo guarde; en los ajustes, «Peso por defecto (si el servicio no tiene el suyo)», la
 *   garantía en meses y el aviso de que Bizum, IBAN y titular se enseñan al cliente; en cada solicitud,
 *   «Marcar etiqueta pagada» y «Marcar reparación/vuelta pagada» con forma y fecha (el importe lo pone
 *   la base de datos), los avisos «ya lo he pagado» del cliente, el diagnóstico («Sin arreglo» y «Te lo
 *   compramos por»), qué eligió el cliente, «Marcar enviada» con el nº de Correos de la vuelta y la
 *   marca «Garantía»; el filtro «Cobro y garantía» y su resumen con cuántas hay de cada.
 * - app/admin/index.tsx → origen habitual de la navegación a esta pantalla.
 * - app/admin/_layout.tsx → registra esta ruta ("services") dentro del
 *   Stack protegido del panel admin.
 */
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import SmartImage from "../../components/SmartImage";
import ImageLightbox, { type LightboxImage } from "../../components/ImageLightbox";
import { leerModalidades, type ModalidadServicio } from "../../components/ContratarServicioModal";
import { cargarAjustesReparacionEnvio, cargarTarifas, hayTarifaCorreos, type AjustesReparacionEnvio } from "../../lib/envio";
import { enlaceVideo, esEnlaceCorto } from "../servicios";
import CargaMarca from "../../components/marca/CargaMarca";
import {
  AdminHeader,
  AdminNotice,
  BarraSeleccionFotos,
  BotonFlotante,
  EmptyState,
  IconButton,
  MarcaSeleccion,
  PestanasPanel,
  PieVentana,
  PrimaryButton,
  SelectorIOS,
  StatCard,
  useGestoPestanas,
  useSeleccionFotos,
} from "../../lib/admin/products.components";
import { ERRORS, MAX_IMAGES, MEDIA_BUCKET } from "../../lib/admin/products.constants";
import type { LocalPickedMedia } from "../../lib/admin/products.types";
import {
  CIERRE_TECLADO,
  buildMediaPath,
  contarEmojis,
  fmtEUR,
  pickMediaFilesWeb,
  toPriceSafe,
} from "../../lib/admin/products.utils";

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

const columnStyle = { width: "100%", maxWidth: 1160, alignSelf: "center" } as const;
const modalColumnStyle = { width: "100%", maxWidth: 560, alignSelf: "center" } as const;

// --- Tipos -------------------------------------------------------------

type ServiceStatus = "DRAFT" | "PUBLISHED" | "REVIEW";

type ServiceMediaRow = {
  id: string;
  service_id: string;
  storage_path: string | null;
  public_url: string | null;
  file_name: string | null;
  sort_order: number | null;
  is_cover: boolean | null;
};

type ServiceRow = {
  id: string;
  title: string;
  description: string;
  price_eur: number;
  status: ServiceStatus;
  is_active: boolean;
  view_count: number;
  // «Me gusta» de la ficha (null: la migración 20261103200000_servicios_me_gusta.sql aún no está aplicada).
  like_count?: number | null;
  // Opciones que elige el cliente (Básica, Completa…; migración 20261108230000). undefined = la columna aún no existe.
  modalidades?: ModalidadServicio[];
  // Peso de UN aparato con su caja para la etiqueta de Correos (parte 2, migración 20261111130000; undefined sin ella).
  envio_peso_kg?: number | null;
  envio_peso_estimado?: boolean;
  created_at: string;
  updated_at: string;
  media: ServiceMediaRow[];
};

type RequestStatus = "nuevo" | "revisado" | "contactado" | "descartado";
type MetodoContacto = "whatsapp" | "gmail" | "instagram" | "facebook" | "tiktok";
type Disponibilidad = "manana" | "mediodia" | "tardenoche";

type ServiceRequestRow = {
  id: string;
  created_at: string;
  service_id: string | null;
  service_title: string;
  nombre: string;
  apellido: string;
  metodo_contacto: MetodoContacto | null;
  contacto: string | null;
  ciudad: string;
  direccion: string | null;
  disponibilidad: Disponibilidad | null;
  comentario: string | null;
  status: RequestStatus;
  // Seguimiento visible para el cliente (migración 20261013150000; puede no existir aún)
  seguimiento?: Seguimiento | null;
  seguimiento_nota?: string | null;
  seguimiento_actualizado?: string | null;
  // Número de seguimiento (migración 20261031170000; puede no existir aún): el cliente lo escribe en «Mis seguimientos»
  // para añadir la reparación a su cuenta. id_veoaura: la ficha se creó en VeoAura.
  customer_user_id?: string | null;
  codigo_seguimiento?: string | null;
  id_veoaura?: string | null;
  vinculado_en?: string | null;
  // Nota interna: «Asignado desde el chat» si la creó el administrador desde Administración → Chat.
  nota_admin?: string | null;
  // La opción que eligió el cliente y su precio (lo pone la base de datos; migración 20261108230000).
  modalidad?: string | null;
  modalidad_precio_eur?: number | null;
  // Reparación por envío (migración 20261111100000; puede no existir aún). El precio de la etiqueta lo pone la base de datos.
  entrega_modo?: "recogida" | "correos" | null;
  aparatos?: number | null;
  codigo_postal?: string | null;
  etiqueta_eur?: number | null;
  etiqueta_peso_kg?: number | null;
  etiqueta_path?: string | null;
  etiqueta_pagada_en?: string | null;
  condiciones_aceptadas_en?: string | null;
  presupuesto_eur?: number | null;
  presupuesto_aceptado_en?: string | null;
  recepcion_fotos?: string[] | null;
  espera_pieza_hasta?: string | null;
  // Parte 2 (migración 20261111130000; puede no existir aún): cobros, «sin arreglo» y garantía. Los importes (pagado_eur,
  // vuelta_eur) los pone la base de datos.
  etiqueta_pago_modo?: string | null;
  etiqueta_avisada_en?: string | null;
  pago_estado?: string | null;
  pago_modo?: string | null;
  pagado_eur?: number | null;
  pagado_en?: string | null;
  pago_avisado_en?: string | null;
  vuelta_seguimiento?: string | null;
  diagnostico_resultado?: "reparable" | "sin_arreglo" | null;
  oferta_compra_eur?: number | null;
  vuelta_eur?: number | null;
  sin_arreglo_eleccion?: "comprar" | "devolver" | null;
  sin_arreglo_eleccion_en?: string | null;
  entregado_en?: string | null;
  garantia_de?: string | null;
};

const COLUMNAS_ENVIO =
  "entrega_modo,aparatos,codigo_postal,etiqueta_eur,etiqueta_peso_kg,etiqueta_path,etiqueta_pagada_en,condiciones_aceptadas_en,presupuesto_eur,presupuesto_aceptado_en,recepcion_fotos,espera_pieza_hasta";
// Parte 2: solo se piden si la base de datos ya las tiene (los ajustes traen garantia_meses), sin errores antes.
const COLUMNAS_ENVIO_2 =
  "etiqueta_pago_modo,etiqueta_avisada_en,pago_estado,pago_modo,pagado_eur,pagado_en,pago_avisado_en,vuelta_seguimiento,diagnostico_resultado,oferta_compra_eur,vuelta_eur,sin_arreglo_eleccion,sin_arreglo_eleccion_en,entregado_en,garantia_de";
const FORMAS_PAGO = [
  { value: "bizum", label: "Bizum" },
  { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta", label: "Tarjeta" },
] as const;
const FORMA_PAGO_LABEL: Record<string, string> = { bizum: "Bizum", transferencia: "transferencia", tarjeta: "tarjeta", prueba: "tarjeta (de prueba)" };
const hoyISO = () => new Date().toISOString().slice(0, 10);
// Sin la migración de la reparación por envío, se pregunta una vez y se recuerda (no se repite el error en cada carga).
let sinColumnasEnvio = false;
const BUCKET_REPARACIONES = "reparaciones";

// La pone api/asignar-seguimiento.ts al asignar un seguimiento desde el chat.
const NOTA_ASIGNADO_CHAT = "Asignado desde el chat";

type Seguimiento =
  | "solicitado"
  | "etiqueta"
  | "en_camino"
  | "recibido"
  | "diagnostico"
  | "presupuesto"
  | "esperando_pieza"
  | "reparando"
  | "listo"
  | "enviada"
  | "entregado"
  | "cancelado";

const SEGUIMIENTO_ETAPAS: Seguimiento[] = [
  "solicitado",
  "recibido",
  "diagnostico",
  "reparando",
  "listo",
  "entregado",
  "cancelado",
];
// Con la migración 20261111100000: el presupuesto y la espera de una pieza también en las de recogida; las de envío,
// con todas sus etapas (Etiqueta lista → En camino → … → Enviada de vuelta → Entregada).
const SEGUIMIENTO_ETAPAS_RECOGIDA: Seguimiento[] = ["solicitado", "recibido", "diagnostico", "presupuesto", "esperando_pieza", "reparando", "listo", "entregado", "cancelado"];
const SEGUIMIENTO_ETAPAS_ENVIO: Seguimiento[] = [
  "solicitado",
  "etiqueta",
  "en_camino",
  "recibido",
  "diagnostico",
  "presupuesto",
  "esperando_pieza",
  "reparando",
  "listo",
  "enviada",
  "entregado",
  "cancelado",
];

const SEGUIMIENTO_LABEL: Record<Seguimiento, string> = {
  solicitado: "Solicitada",
  etiqueta: "Etiqueta lista",
  en_camino: "En camino",
  recibido: "Recibida",
  diagnostico: "Diagnóstico",
  presupuesto: "Presupuesto",
  esperando_pieza: "Esperando pieza",
  reparando: "En reparación",
  listo: "Lista para recoger",
  enviada: "Enviada de vuelta",
  entregado: "Entregada",
  cancelado: "Cancelada",
};

// Tabla/columna inexistente (migración aún sin aplicar)
function faltaEsquema(error: any) {
  const code = String(error?.code ?? "");
  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(code);
}

const STATUS_LABEL: Record<ServiceStatus, string> = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicado",
  REVIEW: "Por revisar",
};

const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  nuevo: "Nueva",
  revisado: "Revisada",
  contactado: "Contactada",
  descartado: "Descartada",
};

const REQUEST_STATUS_COLORS: Record<RequestStatus, { bg: string; border: string }> = {
  nuevo: { bg: COLORS.warningBg, border: COLORS.warningBorder },
  revisado: { bg: COLORS.accent2, border: COLORS.accentBorder },
  contactado: { bg: COLORS.successBg, border: COLORS.successBorder },
  descartado: { bg: COLORS.dangerBg, border: COLORS.dangerBorder },
};

const METODO_LABEL: Record<MetodoContacto, string> = {
  whatsapp: "WhatsApp",
  gmail: "Gmail",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

const DISPONIBILIDAD_LABEL: Record<Disponibilidad, string> = {
  manana: "Mañana",
  mediodia: "Mediodía",
  tardenoche: "Tarde y noche",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function coverUrl(media: ServiceMediaRow[]): string | null {
  if (!media?.length) return null;
  const cover = media.find((m) => m.is_cover) ?? media[0];
  return cover?.public_url || null;
}

// Las fotos de un servicio para el visor (la portada primero, luego en su orden).
function fotosDelServicio(media: ServiceMediaRow[]): LightboxImage[] {
  const conUrl = (media ?? []).filter((m) => !!m.public_url);
  const portada = conUrl.find((m) => m.is_cover) ?? conUrl[0];
  return [...(portada ? [portada] : []), ...conUrl.filter((m) => m !== portada)].map((m) => ({ id: m.id, url: m.public_url as string }));
}

const PESTANAS_SERVICIOS = [
  { key: "catalogo" as const, label: "Catálogo" },
  { key: "solicitudes" as const, label: "Solicitudes" },
];
const ORDEN_PESTANAS = PESTANAS_SERVICIOS.map((p) => p.key);

// --- Piezas visuales compartidas ----------------------------------------

function ChipButton({
  label,
  onPress,
  variant,
  disabled,
  isMobile,
  fullWidth,
  icon,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "danger" | "ghost";
  disabled?: boolean;
  isMobile?: boolean;
  fullWidth?: boolean;
  icon?: IoniconName;
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
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
      })}
    >
      {icon ? <Ionicons name={icon} size={14} color={COLORS.text} /> : null}
      <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center", fontSize: isMobile ? 13 : 14 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  // decimal-pad (no numeric) para los precios: el teclado del iPhone trae la coma para los céntimos.
  keyboardType?: "default" | "numeric" | "decimal-pad";
}) {
  return (
    <View style={{ gap: 6, alignItems: "center" }}>
      <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13, textAlign: "center" }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.muted2}
        multiline={!!multiline}
        keyboardType={keyboardType ?? "default"}
        style={{
          width: "100%",
          borderWidth: 1,
          borderColor: COLORS.border,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: multiline ? 12 : 10,
          // 16 px: Safari en iPhone no hace zoom de toda la pantalla al escribir.
          fontSize: 16,
          color: COLORS.text,
          backgroundColor: COLORS.cardSoft,
          minHeight: multiline ? 90 : undefined,
          textAlign: multiline ? "left" : "center",
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
}

// «Nuestros Servicios» (dueño, 2026-11-09): los vídeos de cómo trabajamos que salen en la página Servicios. Se pegan
// enlaces de Instagram o TikTok (site_settings.videos_servicios, migración 20261109130000); null = falta la migración.
function EditorVideosServicios({ isMobile }: { isMobile: boolean }) {
  const [filas, setFilas] = useState<{ url: string; titulo: string }[] | null>(null);
  const [falta, setFalta] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tono: "success" | "warning"; texto: string } | null>(null);

  useEffect(() => {
    supabase
      .from("site_settings")
      .select("videos_servicios")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          setFalta(true);
          setFilas([]);
          return;
        }
        const v = (data as { videos_servicios?: unknown } | null)?.videos_servicios;
        setFilas(Array.isArray(v) ? v.map((x) => ({ url: String(x?.url ?? ""), titulo: String(x?.titulo ?? "") })) : []);
      });
  }, []);

  async function guardar() {
    if (!filas || guardando) return;
    setGuardando(true);
    setAviso(null);
    // Los enlaces cortos de las apps (vm.tiktok.com/…, instagram.com/share/…) se cambian por el largo, que lleva el
    // número del vídeo (api/video-enlace.ts).
    const llenas = await Promise.all(
      filas
        .filter((f) => f.url.trim() || f.titulo.trim())
        .map(async (f) => {
          if (!esEnlaceCorto(f.url)) return { ...f, url: f.url.trim() };
          try {
            const r = await fetch(`/api/video-enlace?url=${encodeURIComponent(f.url.trim())}`);
            const largo = r.ok ? String(((await r.json()) as { url?: string }).url ?? "") : "";
            return enlaceVideo(largo) ? { ...f, url: largo } : f;
          } catch {
            return f;
          }
        })
    );
    const mala = llenas.findIndex((f) => !enlaceVideo(f.url));
    if (mala >= 0) {
      setFilas(llenas);
      setGuardando(false);
      setAviso({
        tono: "warning",
        texto: esEnlaceCorto(llenas[mala].url)
          ? `No hemos podido abrir el enlace corto del vídeo ${mala + 1}. Ábrelo en el navegador y copia la dirección completa (con /reel/… o /video/número).`
          : `El vídeo ${mala + 1} no es un enlace de Instagram (reel o publicación) ni de TikTok (vídeo). Cópialo desde «Compartir → Copiar enlace».`,
      });
      return;
    }
    const videos = llenas.map((f) => ({ url: f.url.trim(), ...(f.titulo.trim() ? { titulo: f.titulo.trim() } : null) }));
    const { error } = await supabase.from("site_settings").update({ videos_servicios: videos }).eq("id", 1);
    setGuardando(false);
    if (error) {
      setAviso({ tono: "warning", texto: "No se han podido guardar los vídeos. Inténtalo de nuevo." });
      return;
    }
    setFilas(videos.map((v) => ({ url: v.url, titulo: v.titulo ?? "" })));
    setAviso({ tono: "success", texto: videos.length ? `Guardado: ${videos.length} ${videos.length === 1 ? "vídeo" : "vídeos"} en la página Servicios.` : "Guardado: sin vídeos, el apartado no sale en la tienda." });
  }

  const estiloCampo = {
    width: "100%" as const,
    minHeight: 46,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: COLORS.cardSoft,
  };

  return (
    <View
      nativeID="servicios-videos"
      style={{ gap: 10, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, backgroundColor: "#FFFFFF" }}
    >
      <View style={{ alignItems: "center", gap: 4 }}>
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>
          Nuestros Servicios · vídeos{filas?.length ? ` (${filas.filter((f) => f.url.trim()).length})` : ""}
        </Text>
        <Text style={{ color: COLORS.muted, fontSize: 12.5, lineHeight: 18, textAlign: "center" }}>
          Salen al final de la página Servicios para que los clientes vean cómo trabajáis. Pega el enlace de un reel de
          Instagram o un vídeo de TikTok (de un minuto como máximo). Cuántos los ven: Analítica → «Nuestros Servicios».
        </Text>
      </View>
      {filas === null ? (
        <CargaMarca texto="Cargando vídeos…" />
      ) : falta ? (
        <AdminNotice tone="warning" text="Para guardar vídeos falta aplicar en la base de datos la migración 20261109130000_servicios_videos." />
      ) : (
        <>
          {filas.map((f, i) => {
            const enlace = f.url.trim() ? enlaceVideo(f.url) : null;
            const corto = esEnlaceCorto(f.url);
            return (
              <View key={i} style={{ gap: 6, padding: 10, borderRadius: 14, backgroundColor: COLORS.cardSoft }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons
                    name={enlace ? (enlace.plataforma === "Instagram" ? "logo-instagram" : "logo-tiktok") : "videocam-outline"}
                    size={20}
                    color={f.url.trim() && !enlace && !corto ? COLORS.danger : COLORS.text}
                  />
                  <TextInput
                    nativeID={`servicios-video-url-${i}`}
                    value={f.url}
                    onChangeText={(v) => setFilas((prev) => (prev ?? []).map((x, j) => (j === i ? { ...x, url: v } : x)))}
                    placeholder="https://www.instagram.com/reel/…"
                    placeholderTextColor={COLORS.muted2}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={{ ...estiloCampo, flex: 1, width: 0, minWidth: 0 }}
                  />
                  <IconButton
                    icon="trash-outline"
                    label={`Quitar el vídeo ${i + 1}`}
                    variant="danger"
                    onPress={() => setFilas((prev) => (prev ?? []).filter((_, j) => j !== i))}
                  />
                </View>
                <TextInput
                  nativeID={`servicios-video-titulo-${i}`}
                  value={f.titulo}
                  onChangeText={(v) => setFilas((prev) => (prev ?? []).map((x, j) => (j === i ? { ...x, titulo: v } : x)))}
                  placeholder="Título (opcional): Limpieza de una PS4"
                  placeholderTextColor={COLORS.muted2}
                  maxLength={80}
                  style={{ ...estiloCampo, textAlign: "center" }}
                />
                {corto ? (
                  <Text style={{ color: COLORS.muted, fontSize: 12, textAlign: "center" }}>Enlace corto de la app: al guardar se cambia por el completo.</Text>
                ) : f.url.trim() && !enlace ? (
                  <Text style={{ color: COLORS.danger, fontSize: 12, textAlign: "center" }}>Este enlace no es de un vídeo de Instagram o TikTok.</Text>
                ) : null}
              </View>
            );
          })}
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
            {filas.length < 12 ? (
              <ChipButton icon="add" label="Añadir vídeo" onPress={() => setFilas((prev) => [...(prev ?? []), { url: "", titulo: "" }])} isMobile={isMobile} />
            ) : null}
            <ChipButton icon="save-outline" label={guardando ? "Guardando…" : "Guardar vídeos"} variant="primary" disabled={guardando} onPress={guardar} isMobile={isMobile} />
          </View>
        </>
      )}
      {aviso ? <AdminNotice tone={aviso.tono} text={aviso.texto} /> : null}
    </View>
  );
}

// Etapa de seguimiento + nota para el cliente (se ve en Perfil → Seguimientos).
function RequestSeguimiento({
  request,
  disponible,
  isMobile,
  onSaved,
  onMissingMigration,
  envioOk = false,
}: {
  request: ServiceRequestRow;
  disponible: boolean;
  isMobile: boolean;
  // ¿Existe ya la reparación por envío (migración 20261111100000)? Entonces hay más etapas.
  envioOk?: boolean;
  onSaved: (patch: Partial<ServiceRequestRow>) => void;
  onMissingMigration: () => void;
}) {
  const [etapa, setEtapa] = useState<Seguimiento>(request.seguimiento ?? "solicitado");
  const [nota, setNota] = useState(request.seguimiento_nota ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!disponible) {
    return (
      <Text style={{ color: COLORS.warning, fontWeight: "800", fontSize: 12.5, textAlign: "center" }}>
        Falta aplicar la migración de seguimiento
      </Text>
    );
  }

  const cambiado = etapa !== (request.seguimiento ?? "solicitado") || nota.trim() !== (request.seguimiento_nota ?? "");

  async function guardar() {
    if (saving) return;
    setSaving(true);
    setMsg(null);
    const patch = {
      seguimiento: etapa,
      seguimiento_nota: nota.trim() || null,
      seguimiento_actualizado: new Date().toISOString(),
    };
    const { error } = await supabase.from("service_requests").update(patch).eq("id", request.id);
    setSaving(false);
    if (error) {
      if (faltaEsquema(error)) {
        onMissingMigration();
        return;
      }
      console.error("Error guardando el seguimiento:", error);
      setMsg({ ok: false, text: "No se pudo guardar el seguimiento." });
      return;
    }
    onSaved(patch);
    setMsg({ ok: true, text: "Seguimiento guardado ✓" });
  }

  return (
    <View style={{ gap: 8, alignItems: "center", paddingTop: 4 }}>
      <Text style={{ color: COLORS.muted2, fontWeight: "800", fontSize: 12, textAlign: "center" }}>
        SEGUIMIENTO PARA EL CLIENTE
        {request.seguimiento_actualizado ? ` · ${formatDate(request.seguimiento_actualizado)}` : ""}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 }}>
        {(!envioOk ? SEGUIMIENTO_ETAPAS : request.entrega_modo === "correos" ? SEGUIMIENTO_ETAPAS_ENVIO : SEGUIMIENTO_ETAPAS_RECOGIDA).map((s) => (
          <ChipButton
            key={s}
            label={request.entrega_modo === "correos" && s === "listo" ? "Lista" : SEGUIMIENTO_LABEL[s]}
            variant={etapa === s ? (s === "cancelado" ? "danger" : "primary") : "ghost"}
            onPress={() => {
              setEtapa(s);
              setMsg(null);
            }}
            isMobile={isMobile}
          />
        ))}
      </View>
      <TextInput
        value={nota}
        onChangeText={(t) => {
          setNota(t.slice(0, 500));
          setMsg(null);
        }}
        placeholder="Nota para el cliente (opcional)"
        placeholderTextColor={COLORS.muted2}
        maxLength={500}
        style={{
          width: "100%",
          maxWidth: 520,
          borderWidth: 1,
          borderColor: COLORS.border,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 10,
          fontSize: 16,
          color: COLORS.text,
          backgroundColor: COLORS.cardSoft,
          textAlign: "center",
        }}
      />
      <ChipButton
        label={saving ? "Guardando…" : "Guardar seguimiento"}
        variant="primary"
        icon="checkmark"
        disabled={saving || !cambiado}
        onPress={guardar}
        isMobile={isMobile}
      />
      {msg ? (
        <Text style={{ color: msg.ok ? COLORS.success : COLORS.danger, fontWeight: "800", fontSize: 12.5 }}>
          {msg.text}
        </Text>
      ) : null}
    </View>
  );
}

// --- Reparación por envío (dueño, 2026-11-11; migración 20261111100000) ---------------------------------------------

// Elegir archivos en la web (la etiqueta en PDF o las fotos de recepción). En el móvil nativo no hay selector: null.
function elegirArchivosWeb(accept: string, multiple: boolean): Promise<File[] | null> {
  if (Platform.OS !== "web" || typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolver) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolver(input.files ? Array.from(input.files) : []);
    input.click();
  });
}

const EXT_TIPO: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const DIEZ_MB = 10 * 1024 * 1024;

// «Marcar pagado» (parte 2): cómo se pagó y cuándo; el importe lo pone la base de datos. Plegable: se abre y se cierra.
function MarcarPagado({
  id,
  etiqueta,
  isMobile,
  ocupado,
  onGuardar,
}: {
  id: string;
  etiqueta: string;
  isMobile: boolean;
  ocupado: boolean;
  onGuardar: (modo: string, fechaISO: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<string>("bizum");
  const [fecha, setFecha] = useState(hoyISO());
  const valida = /^\d{4}-\d{2}-\d{2}$/.test(fecha.trim()) && !Number.isNaN(new Date(`${fecha.trim()}T12:00:00`).getTime());
  if (!abierto) return <ChipButton label={etiqueta} icon="card-outline" disabled={ocupado} isMobile={isMobile} onPress={() => setAbierto(true)} />;
  return (
    <View nativeID={id} style={{ gap: 6, alignItems: "center", width: "100%", maxWidth: 520 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 }}>
        {FORMAS_PAGO.map((f) => (
          <ChipButton key={f.value} label={f.label} variant={modo === f.value ? "primary" : "ghost"} isMobile={isMobile} onPress={() => setModo(f.value)} />
        ))}
      </View>
      <View style={{ width: "100%", maxWidth: 240 }}>
        <TextField label="Fecha del pago" value={fecha} onChangeText={setFecha} placeholder="AAAA-MM-DD" />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 }}>
        <ChipButton
          label={ocupado ? "Guardando…" : "Guardar pago"}
          variant="primary"
          icon="checkmark"
          disabled={ocupado || !valida}
          isMobile={isMobile}
          onPress={() => {
            // Con la hora de ahora si es hoy; si no, a mediodía de ese día.
            const iso = fecha.trim() === hoyISO() ? new Date().toISOString() : new Date(`${fecha.trim()}T12:00:00`).toISOString();
            onGuardar(modo, iso);
            setAbierto(false);
          }}
        />
        <ChipButton label="Cancelar" isMobile={isMobile} onPress={() => setAbierto(false)} />
      </View>
    </View>
  );
}

// Lo de una solicitud por envío: aparatos, etiqueta (coste, pagada, subir), fotos de recepción, espera de pieza y
// presupuesto (y si el cliente lo aceptó). El presupuesto y la pieza también salen en las de recogida. Con la parte 2
// (parte2): forma y fecha del pago de la etiqueta, el diagnóstico («Sin arreglo» con «Te lo compramos por»), qué eligió
// el cliente, sus avisos de pago, «Marcar pagado» de la reparación o la vuelta y «Marcar enviada» con el nº de Correos.
function PanelEnvioSolicitud({
  request,
  isMobile,
  onSaved,
  onVerFotos,
  parte2 = false,
}: {
  request: ServiceRequestRow;
  isMobile: boolean;
  onSaved: (patch: Partial<ServiceRequestRow>) => void;
  onVerFotos: (fotos: LightboxImage[]) => void;
  parte2?: boolean;
}) {
  const porEnvio = request.entrega_modo === "correos";
  const [presupuesto, setPresupuesto] = useState(request.presupuesto_eur != null ? String(request.presupuesto_eur).replace(".", ",") : "");
  const [pieza, setPieza] = useState(request.espera_pieza_hasta ?? "");
  const [oferta, setOferta] = useState(request.oferta_compra_eur != null ? String(request.oferta_compra_eur).replace(".", ",") : "");
  const [numeroVuelta, setNumeroVuelta] = useState(request.vuelta_seguimiento ?? "");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fotos = Array.isArray(request.recepcion_fotos) ? request.recepcion_fotos : [];

  async function guardar(patch: Partial<ServiceRequestRow>, que: string, ok: string) {
    setOcupado(que);
    setMsg(null);
    // Con la parte 2 se lee la fila guardada: los importes (pagado_eur, vuelta_eur) los pone la base de datos.
    const consulta = supabase.from("service_requests").update(patch).eq("id", request.id);
    const { data, error } = parte2 ? await consulta.select(`id,seguimiento,seguimiento_actualizado,etiqueta_pagada_en,presupuesto_eur,presupuesto_aceptado_en,${COLUMNAS_ENVIO_2}`) : await consulta;
    setOcupado(null);
    if (error) {
      console.error(`Error guardando (${que}):`, error);
      const m = String((error as { message?: string }).message ?? "");
      setMsg({ ok: false, text: /Aún no hay importe|Di cómo se ha pagado/.test(m) ? m : "No se pudo guardar. Inténtalo de nuevo." });
      return false;
    }
    const fila = Array.isArray(data) ? (data[0] as Partial<ServiceRequestRow> | undefined) : undefined;
    onSaved(fila ? { ...patch, ...fila } : patch);
    setMsg({ ok: true, text: ok });
    return true;
  }

  async function subir(tipo: "etiqueta" | "fotos") {
    const archivos = await elegirArchivosWeb(tipo === "etiqueta" ? "application/pdf" : "image/jpeg,image/png,image/webp", tipo === "fotos");
    if (!archivos?.length) return;
    const lista = archivos.slice(0, tipo === "etiqueta" ? 1 : 3);
    if (lista.some((f) => f.size > DIEZ_MB || !EXT_TIPO[f.type])) {
      setMsg({ ok: false, text: tipo === "etiqueta" ? "La etiqueta tiene que ser un PDF de 10 MB como mucho." : "Las fotos tienen que ser JPG, PNG o WebP de 10 MB como mucho." });
      return;
    }
    setOcupado(tipo);
    setMsg(null);
    const rutas: string[] = [];
    for (const [i, f] of lista.entries()) {
      const ruta = `${request.id}/${tipo === "etiqueta" ? "etiqueta" : `recepcion-${i + 1}`}-${Date.now()}.${EXT_TIPO[f.type]}`;
      const { error } = await supabase.storage.from(BUCKET_REPARACIONES).upload(ruta, f, { contentType: f.type, upsert: false });
      if (error) {
        console.error("Error subiendo a reparaciones:", error);
        setOcupado(null);
        setMsg({ ok: false, text: "No se pudo subir el archivo. Inténtalo de nuevo." });
        return;
      }
      rutas.push(ruta);
    }
    setOcupado(null);
    if (tipo === "etiqueta") {
      // Con la etiqueta subida, la solicitud pasa a «Etiqueta lista» (el cliente recibe el aviso de Blue).
      const avanza = !request.seguimiento || request.seguimiento === "solicitado";
      await guardar(
        { etiqueta_path: rutas[0], ...(avanza ? { seguimiento: "etiqueta" as Seguimiento, seguimiento_actualizado: new Date().toISOString() } : null) },
        "etiqueta",
        avanza ? "Etiqueta subida ✓ · la solicitud pasa a «Etiqueta lista»" : "Etiqueta subida ✓"
      );
    } else {
      await guardar({ recepcion_fotos: rutas }, "fotos", `${rutas.length === 1 ? "Foto subida" : `${rutas.length} fotos subidas`} ✓`);
    }
  }

  async function verFotos() {
    if (!fotos.length) return;
    const { data, error } = await supabase.storage.from(BUCKET_REPARACIONES).createSignedUrls(fotos, 300);
    if (error || !data) {
      setMsg({ ok: false, text: "No se pudieron abrir las fotos." });
      return;
    }
    onVerFotos(data.filter((f) => !!f.signedUrl).map((f, i) => ({ id: String(i), url: f.signedUrl as string })));
  }

  async function verEtiqueta() {
    if (!request.etiqueta_path) return;
    const { data } = await supabase.storage.from(BUCKET_REPARACIONES).createSignedUrl(request.etiqueta_path, 60);
    if (data?.signedUrl && typeof window !== "undefined") window.open(data.signedUrl, "_blank", "noopener");
  }

  const precio = Number(presupuesto.replace(/\./g, "").replace(",", "."));
  const presupuestoValido = presupuesto.trim() !== "" && Number.isFinite(precio) && precio >= 0 && precio <= 99999;
  const piezaValida = pieza.trim() === "" || /^\d{4}-\d{2}-\d{2}$/.test(pieza.trim());

  return (
    <View nativeID={`solicitud-envio-${request.id}`} style={{ gap: 8, alignItems: "center", paddingTop: 4 }}>
      <Text style={{ color: COLORS.muted2, fontWeight: "800", fontSize: 12, textAlign: "center" }}>
        {porEnvio ? "REPARACIÓN POR ENVÍO" : "PRESUPUESTO"}
      </Text>
      {porEnvio ? (
        <>
          <Text nativeID={`solicitud-envio-datos-${request.id}`} style={{ color: COLORS.text, fontSize: 13, textAlign: "center" }}>
            <Text style={{ fontWeight: "800" }}>Aparatos: </Text>
            {request.aparatos ?? 1}
            {request.codigo_postal ? ` · C.P. ${request.codigo_postal}` : ""}
            {" · "}
            <Text style={{ fontWeight: "800" }}>Etiqueta: </Text>
            {request.etiqueta_eur != null ? fmtEUR(Number(request.etiqueta_eur)) : "—"}
            {request.etiqueta_peso_kg != null ? ` (${String(request.etiqueta_peso_kg).replace(".", ",")} kg)` : ""}
            {" · "}
            {request.etiqueta_pagada_en
              ? `pagada el ${formatDate(request.etiqueta_pagada_en)}${request.etiqueta_pago_modo ? ` por ${FORMA_PAGO_LABEL[request.etiqueta_pago_modo] ?? request.etiqueta_pago_modo}` : ""}`
              : Number(request.etiqueta_eur ?? 0) === 0 && request.etiqueta_eur != null
                ? "gratis"
                : "sin pagar"}
          </Text>
          {request.condiciones_aceptadas_en ? (
            <Text style={{ color: COLORS.muted, fontSize: 12, textAlign: "center" }}>Condiciones aceptadas el {formatDate(request.condiciones_aceptadas_en)}</Text>
          ) : null}
          {request.etiqueta_avisada_en && !request.etiqueta_pagada_en ? (
            <Text nativeID={`solicitud-etiqueta-avisada-${request.id}`} style={{ color: COLORS.warning, fontWeight: "800", fontSize: 12.5, textAlign: "center" }}>
              El cliente dice que ya pagó la etiqueta ({formatDate(request.etiqueta_avisada_en)}): compruébalo y márcala pagada
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 }}>
            {!request.etiqueta_pagada_en && parte2 && Number(request.etiqueta_eur ?? 0) > 0 ? (
              <MarcarPagado
                id={`solicitud-etiqueta-pago-${request.id}`}
                etiqueta="Marcar etiqueta pagada"
                isMobile={isMobile}
                ocupado={!!ocupado}
                onGuardar={(modo, iso) => guardar({ etiqueta_pagada_en: iso, etiqueta_pago_modo: modo }, "pagada", `Etiqueta marcada como pagada por ${FORMA_PAGO_LABEL[modo] ?? modo} ✓`)}
              />
            ) : null}
            {!request.etiqueta_pagada_en && !parte2 ? (
              <ChipButton
                label={ocupado === "pagada" ? "Guardando…" : "Marcar etiqueta pagada"}
                icon="card-outline"
                disabled={!!ocupado}
                isMobile={isMobile}
                onPress={() => guardar({ etiqueta_pagada_en: new Date().toISOString() }, "pagada", "Etiqueta marcada como pagada ✓")}
              />
            ) : null}
            <ChipButton
              label={ocupado === "etiqueta" ? "Subiendo…" : request.etiqueta_path ? "Cambiar etiqueta (PDF)" : "Subir etiqueta (PDF)"}
              icon="document-attach-outline"
              disabled={!!ocupado}
              isMobile={isMobile}
              onPress={() => subir("etiqueta")}
            />
            {request.etiqueta_path ? <ChipButton label="Ver etiqueta" icon="eye-outline" isMobile={isMobile} onPress={verEtiqueta} /> : null}
            <ChipButton
              label={ocupado === "fotos" ? "Subiendo…" : fotos.length ? `Cambiar fotos de recepción (${fotos.length})` : "Subir fotos de recepción (hasta 3)"}
              icon="camera-outline"
              disabled={!!ocupado}
              isMobile={isMobile}
              onPress={() => subir("fotos")}
            />
            {fotos.length ? <ChipButton label="Ver fotos" icon="images-outline" isMobile={isMobile} onPress={verFotos} /> : null}
          </View>
        </>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, alignItems: "flex-end", width: "100%", maxWidth: 520 }}>
        <View style={{ flexGrow: 1, flexBasis: 140 }}>
          <TextField label="Presupuesto (€)" value={presupuesto} onChangeText={setPresupuesto} placeholder="Ej: 59,90" keyboardType="decimal-pad" />
        </View>
        <ChipButton
          label={ocupado === "presupuesto" ? "Guardando…" : "Guardar presupuesto"}
          variant="primary"
          icon="checkmark"
          disabled={!!ocupado || !presupuestoValido || precio === Number(request.presupuesto_eur ?? NaN)}
          isMobile={isMobile}
          onPress={() => guardar({ presupuesto_eur: Math.round(precio * 100) / 100 }, "presupuesto", "Presupuesto guardado ✓ · pon la etapa «Presupuesto» para que el cliente lo acepte")}
        />
      </View>
      <Text nativeID={`solicitud-presupuesto-estado-${request.id}`} style={{ color: request.presupuesto_aceptado_en ? COLORS.success : COLORS.muted, fontWeight: "800", fontSize: 12.5, textAlign: "center" }}>
        {request.presupuesto_eur == null
          ? "Sin presupuesto todavía"
          : request.presupuesto_aceptado_en
            ? `El cliente lo aceptó el ${formatDate(request.presupuesto_aceptado_en)}`
            : "El cliente aún no lo ha aceptado"}
      </Text>

      {parte2 ? (
        <View nativeID={`solicitud-cobro-${request.id}`} style={{ gap: 8, alignItems: "center", width: "100%" }}>
          {/* Diagnóstico: reparable o sin arreglo (con «Te lo compramos por», opcional). */}
          <Text style={{ color: COLORS.muted2, fontWeight: "800", fontSize: 12, textAlign: "center" }}>DIAGNÓSTICO</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 }}>
            {(["reparable", "sin_arreglo"] as const).map((d) => (
              <ChipButton
                key={d}
                label={d === "reparable" ? "Reparable" : "Sin arreglo"}
                variant={request.diagnostico_resultado === d ? (d === "sin_arreglo" ? "danger" : "primary") : "ghost"}
                disabled={!!ocupado || request.diagnostico_resultado === d}
                isMobile={isMobile}
                onPress={() => guardar({ diagnostico_resultado: d }, "diagnostico", d === "sin_arreglo" ? "Marcada sin arreglo ✓ · el cliente elige «Te lo compramos» o «Devuélvemelo»" : "Marcada reparable ✓")}
              />
            ))}
          </View>
          {request.diagnostico_resultado === "sin_arreglo" ? (
            <>
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, alignItems: "flex-end", width: "100%", maxWidth: 520 }}>
                <View style={{ flexGrow: 1, flexBasis: 140 }}>
                  <TextField label="Te lo compramos por (€, opcional)" value={oferta} onChangeText={setOferta} placeholder="Ej: 40" keyboardType="decimal-pad" />
                </View>
                <ChipButton
                  label={ocupado === "oferta" ? "Guardando…" : oferta.trim() ? "Guardar oferta" : "Quitar oferta"}
                  icon="pricetag-outline"
                  disabled={!!ocupado || (oferta.trim() !== "" && !(Number(oferta.replace(/\./g, "").replace(",", ".")) >= 0))}
                  isMobile={isMobile}
                  onPress={() => {
                    const n = Number(oferta.replace(/\./g, "").replace(",", "."));
                    guardar({ oferta_compra_eur: oferta.trim() ? Math.round(n * 100) / 100 : null }, "oferta", oferta.trim() ? "Oferta guardada ✓ · el cliente la ve" : "Oferta quitada ✓");
                  }}
                />
              </View>
              <Text nativeID={`solicitud-eleccion-${request.id}`} style={{ color: COLORS.text, fontWeight: "800", fontSize: 12.5, textAlign: "center" }}>
                {request.sin_arreglo_eleccion === "comprar"
                  ? `El cliente eligió «Te lo compramos»${request.sin_arreglo_eleccion_en ? ` el ${formatDate(request.sin_arreglo_eleccion_en)}` : ""}: le llega su solicitud a Vender`
                  : request.sin_arreglo_eleccion === "devolver"
                    ? `El cliente eligió «Devuélvemelo»${request.sin_arreglo_eleccion_en ? ` el ${formatDate(request.sin_arreglo_eleccion_en)}` : ""}${porEnvio ? ` · vuelta ${request.vuelta_eur != null ? fmtEUR(Number(request.vuelta_eur)) : "—"}` : ""}`
                    : `El cliente aún no ha elegido${porEnvio && request.vuelta_eur != null ? ` · la vuelta le costaría ${fmtEUR(Number(request.vuelta_eur))}` : ""}`}
              </Text>
            </>
          ) : null}

          {/* Cobro de la reparación (o de la vuelta si no tiene arreglo). */}
          {porEnvio ? (
            <>
              <Text nativeID={`solicitud-pago-${request.id}`} style={{ color: request.pago_estado === "pagado" ? COLORS.success : COLORS.text, fontWeight: "800", fontSize: 12.5, textAlign: "center" }}>
                {request.pago_estado === "pagado"
                  ? `Pagado ${fmtEUR(Number(request.pagado_eur ?? 0))}${request.pago_modo ? ` por ${FORMA_PAGO_LABEL[request.pago_modo] ?? request.pago_modo}` : ""}${request.pagado_en ? ` el ${formatDate(request.pagado_en)}` : ""}`
                  : request.diagnostico_resultado === "sin_arreglo"
                    ? request.sin_arreglo_eleccion === "devolver" && request.vuelta_eur != null
                      ? `Pendiente de pago: la vuelta, ${fmtEUR(Number(request.vuelta_eur))}`
                      : "Sin nada que cobrar todavía"
                    : request.presupuesto_aceptado_en && request.presupuesto_eur != null
                      ? Number(request.presupuesto_eur) === 0
                        ? "Sin coste (garantía)"
                        : `Pendiente de pago: ${fmtEUR(Number(request.presupuesto_eur))}${request.seguimiento === "listo" ? " · el cliente ya puede pagarlo" : " · podrá pagarlo cuando esté «Lista»"}`
                      : "Sin nada que cobrar todavía"}
              </Text>
              {request.pago_avisado_en && request.pago_estado !== "pagado" ? (
                <Text nativeID={`solicitud-pago-avisado-${request.id}`} style={{ color: COLORS.warning, fontWeight: "800", fontSize: 12.5, textAlign: "center" }}>
                  El cliente dice que ya lo pagó ({formatDate(request.pago_avisado_en)}): compruébalo y márcalo pagado
                </Text>
              ) : null}
              {request.pago_estado !== "pagado" &&
              ((request.diagnostico_resultado === "sin_arreglo" && request.sin_arreglo_eleccion === "devolver" && Number(request.vuelta_eur ?? 0) > 0) ||
                (request.diagnostico_resultado !== "sin_arreglo" && !!request.presupuesto_aceptado_en && Number(request.presupuesto_eur ?? 0) > 0)) ? (
                <MarcarPagado
                  id={`solicitud-pago-marcar-${request.id}`}
                  etiqueta={request.diagnostico_resultado === "sin_arreglo" ? "Marcar vuelta pagada" : "Marcar reparación pagada"}
                  isMobile={isMobile}
                  ocupado={!!ocupado}
                  onGuardar={(modo, iso) => guardar({ pago_estado: "pagado", pago_modo: modo, pagado_en: iso }, "pago", `Pagado por ${FORMA_PAGO_LABEL[modo] ?? modo} ✓ · ya puedes enviarlo`)}
                />
              ) : null}
              {/* Pagada (o sin coste): se envía con el número de Correos de la vuelta. */}
              {request.seguimiento !== "enviada" && request.seguimiento !== "entregado" &&
              (request.pago_estado === "pagado" || (request.seguimiento === "listo" && request.presupuesto_aceptado_en && Number(request.presupuesto_eur ?? -1) === 0)) ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, alignItems: "flex-end", width: "100%", maxWidth: 520 }}>
                  <View style={{ flexGrow: 1, flexBasis: 160 }}>
                    <TextField label="Nº de seguimiento de Correos (vuelta)" value={numeroVuelta} onChangeText={setNumeroVuelta} placeholder="Ej: PK123456789ES" />
                  </View>
                  <ChipButton
                    label={ocupado === "enviada" ? "Guardando…" : "Marcar enviada"}
                    variant="primary"
                    icon="paper-plane-outline"
                    disabled={!!ocupado || numeroVuelta.trim().length < 4}
                    isMobile={isMobile}
                    onPress={() =>
                      guardar(
                        { vuelta_seguimiento: numeroVuelta.trim(), seguimiento: "enviada", seguimiento_actualizado: new Date().toISOString() },
                        "enviada",
                        "Enviada de vuelta ✓ · el cliente ve el número de Correos"
                      )
                    }
                  />
                </View>
              ) : request.vuelta_seguimiento ? (
                <Text style={{ color: COLORS.text, fontSize: 12.5, textAlign: "center" }}>Vuelta por Correos: nº {request.vuelta_seguimiento}</Text>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, alignItems: "flex-end", width: "100%", maxWidth: 520 }}>
        <View style={{ flexGrow: 1, flexBasis: 140 }}>
          <TextField label="Esperando pieza hasta" value={pieza} onChangeText={setPieza} placeholder="AAAA-MM-DD" />
        </View>
        <ChipButton
          label={ocupado === "pieza" ? "Guardando…" : pieza.trim() ? "Guardar fecha" : "Quitar fecha"}
          icon="hourglass-outline"
          disabled={!!ocupado || !piezaValida || pieza.trim() === (request.espera_pieza_hasta ?? "")}
          isMobile={isMobile}
          onPress={() => guardar({ espera_pieza_hasta: pieza.trim() || null }, "pieza", pieza.trim() ? "Fecha de la pieza guardada ✓" : "Fecha quitada ✓")}
        />
      </View>
      {msg ? <Text style={{ color: msg.ok ? COLORS.success : COLORS.danger, fontWeight: "800", fontSize: 12.5, textAlign: "center" }}>{msg.text}</Text> : null}
    </View>
  );
}

// Ajustes de la reparación por envío (fila única reparacion_envio_ajustes), plegados en «Solicitudes». No se activa sin
// la dirección del taller, con el peso por aparato aún estimado o sin tarifa de Correos (y se dice qué falta).
function AjustesEnvioPanel({ isMobile }: { isMobile: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [aj, setAj] = useState<AjustesReparacionEnvio | null | undefined>(undefined);
  const [tarifaOk, setTarifaOk] = useState(false);
  const [form, setForm] = useState({ direccion: "", peso: "", custodia: "", bizum: "", iban: "", titular: "", plazo: "", garantia: "12" });
  const [pesoTocado, setPesoTocado] = useState(false);
  const [activo, setActivo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ tono: "success" | "warning"; texto: string } | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([cargarAjustesReparacionEnvio(), cargarTarifas()]).then(([a, t]) => {
      if (!vivo) return;
      setAj(a);
      setTarifaOk(hayTarifaCorreos(t));
      if (a) {
        setActivo(a.activo);
        setForm({
          direccion: a.direccion_taller ?? "",
          peso: String(a.peso_aparato_kg).replace(".", ","),
          custodia: a.dias_custodia != null ? String(a.dias_custodia) : "",
          bizum: a.bizum ?? "",
          iban: a.iban ?? "",
          titular: a.titular ?? "",
          plazo: String(a.plazo_horas),
          garantia: String(a.garantia_meses),
        });
      }
    });
    return () => {
      vivo = false;
    };
  }, []);

  if (aj === undefined) return null;
  if (aj === null) {
    return (
      <Text nativeID="reparacion-envio-ajustes" style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12.5, textAlign: "center" }}>
        Reparación por envío: falta aplicar su migración (20261111100000).
      </Text>
    );
  }

  const peso = Number(form.peso.replace(",", "."));
  const pesoValido = Number.isFinite(peso) && peso > 0 && peso <= 30;
  const pesoEstimado = aj.peso_estimado && !pesoTocado;
  const faltan = [
    form.direccion.trim().length >= 10 ? null : "la dirección del taller",
    pesoEstimado || !pesoValido ? "el peso real por aparato" : null,
    tarifaOk ? null : "una tarifa de Correos por kilos (Administración → Tarifas de envío)",
  ].filter(Boolean) as string[];
  const set = (k: keyof typeof form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (k === "peso") setPesoTocado(true);
    setMsg(null);
  };

  async function guardar() {
    if (guardando) return;
    const custodia = form.custodia.trim() ? Math.round(Number(form.custodia)) : null;
    const plazo = Math.round(Number(form.plazo || "72"));
    const garantia = Math.round(Number(form.garantia || "12"));
    if (!pesoValido || (custodia !== null && !(custodia >= 1 && custodia <= 365)) || !(plazo >= 1 && plazo <= 2000) || (aj!.parte2 && !(garantia >= 1 && garantia <= 60))) {
      setMsg({ tono: "warning", texto: "Revisa el peso (hasta 30 kg), los días de custodia (1-365), el plazo en horas y los meses de garantía (1-60)." });
      return;
    }
    const activar = activo && faltan.length === 0;
    setGuardando(true);
    const { data: sesion } = await supabase.auth.getSession();
    const patch = {
      activo: activar,
      direccion_taller: form.direccion.trim() || null,
      peso_aparato_kg: Math.round(peso * 1000) / 1000,
      ...(pesoTocado ? { peso_estimado: false } : null),
      dias_custodia: custodia,
      bizum: form.bizum.trim() || null,
      iban: form.iban.replace(/\s+/g, " ").trim() || null,
      titular: form.titular.trim() || null,
      plazo_horas: plazo,
      ...(aj!.parte2 ? { garantia_meses: garantia } : null),
      updated_at: new Date().toISOString(),
      updated_by: sesion.session?.user?.id ?? null,
    };
    const { error } = await supabase.from("reparacion_envio_ajustes").update(patch).eq("id", 1);
    setGuardando(false);
    if (error) {
      console.error("Error guardando la reparación por envío:", error);
      setMsg({ tono: "warning", texto: "No se pudo guardar. Revisa los datos (dirección de 10 a 300 letras, IBAN de 15 a 42)." });
      return;
    }
    setAj({ ...aj!, ...patch, peso_estimado: pesoTocado ? false : aj!.peso_estimado });
    setActivo(activar);
    setPesoTocado(false);
    setMsg({ tono: "success", texto: activar ? "Guardado ✓ · la reparación por envío está activada" : "Guardado ✓ · la reparación por envío está desactivada" });
  }

  return (
    <View nativeID="reparacion-envio-ajustes" style={{ gap: 10, alignItems: "center" }}>
      <Pressable
        nativeID="reparacion-envio-ajustes-abrir"
        onPress={() => setAbierto((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: abierto }}
        style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.7 : 1 })}
      >
        <Ionicons name="cube-outline" size={18} color={COLORS.accent} />
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 14 }}>
          Reparación por envío · {aj.activo ? "activada" : "desactivada"}
        </Text>
        <Ionicons name={abierto ? "chevron-up" : "chevron-down"} size={16} color={COLORS.text} />
      </Pressable>
      {abierto ? (
        <View nativeID="reparacion-envio-ajustes-form" style={{ gap: 10, width: "100%", maxWidth: 560 }}>
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 8 }}>
            <ChipButton label="Desactivada" variant={!activo ? "primary" : "ghost"} isMobile={isMobile} onPress={() => setActivo(false)} />
            <ChipButton
              label="Activada"
              variant={activo ? "primary" : "ghost"}
              disabled={faltan.length > 0}
              isMobile={isMobile}
              onPress={() => setActivo(true)}
            />
          </View>
          {faltan.length ? (
            <AdminNotice tone="warning" text={`Para activarla falta: ${faltan.join(" · ")}.`} />
          ) : null}
          <TextField label="Dirección del taller (a dónde lo envía el cliente)" value={form.direccion} onChangeText={set("direccion")} placeholder="Nombre, calle, número, código postal y ciudad" multiline />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <View style={{ flexGrow: 1, flexBasis: isMobile ? "45%" : "22%" }}>
              <TextField
                label={aj.parte2 ? "Peso por defecto (si el servicio no tiene el suyo)" : "Peso por aparato (kg)"}
                value={form.peso}
                onChangeText={set("peso")}
                placeholder="Ej: 3,5"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flexGrow: 1, flexBasis: isMobile ? "45%" : "22%" }}>
              <TextField label="Plazo (horas)" value={form.plazo} onChangeText={set("plazo")} placeholder="72" keyboardType="numeric" />
            </View>
            <View style={{ flexGrow: 1, flexBasis: isMobile ? "45%" : "22%" }}>
              <TextField label="Días de custodia" value={form.custodia} onChangeText={set("custodia")} placeholder="Los decides tú" keyboardType="numeric" />
            </View>
            <View style={{ flexGrow: 1, flexBasis: isMobile ? "45%" : "22%" }}>
              <TextField label="Bizum" value={form.bizum} onChangeText={set("bizum")} placeholder="Número de Bizum" />
            </View>
            {aj.parte2 ? (
              <View style={{ flexGrow: 1, flexBasis: isMobile ? "45%" : "22%" }}>
                <TextField label="Garantía (meses)" value={form.garantia} onChangeText={set("garantia")} placeholder="12" keyboardType="numeric" />
              </View>
            ) : null}
          </View>
          {aj.parte2 ? (
            <Text nativeID="reparacion-envio-pagos-aviso" style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12.5, lineHeight: 18, textAlign: "center" }}>
              El Bizum, el IBAN y el titular se enseñan al cliente para pagar la etiqueta y la reparación (solo los que rellenes), con su
              número VZ- como concepto. El peso de cada aparato se pone en la ficha de cada servicio (Catálogo); este es el de respaldo.
            </Text>
          ) : null}
          {pesoEstimado ? (
            <Text nativeID="reparacion-envio-peso-estimado" style={{ color: COLORS.warning, fontWeight: "800", fontSize: 12.5, textAlign: "center" }}>
              Peso estimado ({form.peso} kg con embalaje): corrígelo con el real de lo que más reparas.
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <View style={{ flexGrow: 1, flexBasis: isMobile ? "100%" : "45%" }}>
              <TextField label={aj.parte2 ? "IBAN (se enseña al cliente)" : "IBAN (para la parte de pago)"} value={form.iban} onChangeText={set("iban")} placeholder="ES00 0000 0000 0000 0000 0000" />
            </View>
            <View style={{ flexGrow: 1, flexBasis: isMobile ? "100%" : "45%" }}>
              <TextField label="Titular" value={form.titular} onChangeText={set("titular")} placeholder="Nombre del titular" />
            </View>
          </View>
          <View style={{ alignItems: "center" }}>
            <ChipButton label={guardando ? "Guardando…" : "Guardar ajustes"} variant="primary" icon="checkmark" disabled={guardando} isMobile={isMobile} onPress={guardar} />
          </View>
          {msg ? <AdminNotice tone={msg.tono} text={msg.texto} /> : null}
        </View>
      ) : null}
    </View>
  );
}

// --- Pantalla principal ---------------------------------------------------

export default function AdminServices() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 760;
  const pagePadding = isMobile ? 12 : 16;
  const sectionGap = isMobile ? 20 : 24;
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<"catalogo" | "solicitudes">("catalogo");
  // Deslizar el dedo sobre el contenido cambia de pestaña, en bucle (dueño, 2026-11-03).
  const gesto = useGestoPestanas(ORDEN_PESTANAS, tab, (t) => setTab(t));
  // Visor de fotos a pantalla completa con zoom al tocar la foto de un servicio (dueño, 2026-11-03).
  const [visor, setVisor] = useState<{ fotos: LightboxImage[]; inicio: number } | null>(null);

  // --- Catálogo ---
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [search, setSearch] = useState("");
  // false = falta la columna services.modalidades (migración 20261108230000 sin aplicar): no se enseña el editor.
  const [opcionesOk, setOpcionesOk] = useState(false);
  // false = aún no hay peso por servicio (migración 20261111130000): no se enseña el campo.
  const [pesosOk, setPesosOk] = useState(false);

  const loadServices = useCallback(async () => {
    setLoading(true);
    try {
      // Con los «me gusta» si la base de datos ya los tiene; si no (columna que falta), sin ellos.
      const columnas = "id,title,description,price_eur,status,is_active,view_count,created_at,updated_at";
      const leer = (cols: string) => supabase.from("services").select(cols).order("created_at", { ascending: false });
      const faltaCol = (e: any) => !!e && (e.code === "42703" || e.code === "PGRST204" || /like_count|modalidades/.test(e.message ?? ""));
      // Con las opciones y los «me gusta» si la base de datos ya los tiene; si no, sin ellos.
      let { data: rows, error } = await leer(`${columnas},like_count,modalidades`);
      setOpcionesOk(!error);
      if (faltaCol(error)) ({ data: rows, error } = await leer(`${columnas},like_count`));
      if (faltaCol(error)) ({ data: rows, error } = await leer(columnas));
      if (error) throw error;

      const ids = (rows ?? []).map((r: any) => r.id);
      let mediaByService: Record<string, ServiceMediaRow[]> = {};
      if (ids.length) {
        const { data: media } = await supabase
          .from("service_media")
          .select("id,service_id,storage_path,public_url,file_name,sort_order,is_cover")
          .in("service_id", ids)
          .order("is_cover", { ascending: false })
          .order("sort_order", { ascending: true });
        for (const m of (media ?? []) as ServiceMediaRow[]) {
          (mediaByService[m.service_id] ??= []).push(m);
        }
      }

      // Pesos para el envío (parte 2): solo si la base de datos ya los tiene (los ajustes traen garantia_meses).
      const pesos: Record<string, { kg: number | null; estimado: boolean }> = {};
      const conPesos = !!(await cargarAjustesReparacionEnvio())?.parte2;
      setPesosOk(conPesos);
      if (conPesos && ids.length) {
        const { data: filasPeso, error: errPeso } = await supabase.from("services").select("id,envio_peso_kg,envio_peso_estimado").in("id", ids);
        if (errPeso) setPesosOk(false);
        for (const f of (filasPeso ?? []) as { id: string; envio_peso_kg: number | string | null; envio_peso_estimado: boolean | null }[]) {
          pesos[f.id] = { kg: f.envio_peso_kg == null ? null : Number(f.envio_peso_kg), estimado: f.envio_peso_estimado === true };
        }
      }

      setServices(
        (rows ?? []).map((r: any) => ({
          ...r,
          modalidades: "modalidades" in r ? leerModalidades(r.modalidades) : undefined,
          ...(pesos[r.id] ? { envio_peso_kg: pesos[r.id].kg, envio_peso_estimado: pesos[r.id].estimado } : null),
          media: mediaByService[r.id] ?? [],
        }))
      );
    } catch (e) {
      console.error("Error cargando servicios:", e);
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  const filteredServices = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return services;
    return services.filter(
      (s) => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    );
  }, [services, search]);

  const stats = useMemo(() => {
    const total = services.length;
    const published = services.filter((s) => s.status === "PUBLISHED").length;
    const visible = services.filter((s) => s.status === "PUBLISHED" && s.is_active).length;
    const views = services.reduce((sum, s) => sum + (s.view_count ?? 0), 0);
    return { total, published, visible, views };
  }, [services]);

  // --- Modal crear/editar ---
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState<ServiceStatus>("DRAFT");
  const [isActive, setIsActive] = useState(true);
  const [existingMedia, setExistingMedia] = useState<ServiceMediaRow[]>([]);
  const [removedMedia, setRemovedMedia] = useState<ServiceMediaRow[]>([]);
  const [newMedia, setNewMedia] = useState<LocalPickedMedia[]>([]);
  const [coverId, setCoverId] = useState<string | null>(null);
  // Opciones del servicio en el formulario (precio como texto, con coma: «77,97»).
  // foto: la dirección de una foto ya guardada del servicio o `nueva:<id>` de una que se sube al guardar (dueño,
  // 2026-11-09: «al elegir una opción, la foto de la ficha cambia a la de esa opción»).
  const [opciones, setOpciones] = useState<{ nombre: string; precio: string; foto: string | null }[]>([]);
  // La opción a la que se le está eligiendo foto (se abre debajo de su fila).
  const [fotoOpcionAbierta, setFotoOpcionAbierta] = useState<number | null>(null);
  // Peso para el envío (parte 2): texto con coma, si es el estimado y si el dueño lo ha tocado (o dado por bueno).
  const [pesoEnvio, setPesoEnvio] = useState("");
  const [pesoEstimado, setPesoEstimado] = useState(false);
  const [pesoTocado, setPesoTocado] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);
  // Precio guardado sin céntimos porque la base de datos aún no los admite (ver save()).
  const [avisoPrecio, setAvisoPrecio] = useState<string | null>(null);
  // «Seleccionar varias» fotos para quitarlas a la vez (dueño, 2026-11-04).
  const seleccion = useSeleccionFotos();
  const [picking, setPicking] = useState(false);

  function openCreate() {
    seleccion.terminar();
    setEditing(null);
    setTitle("");
    setDesc("");
    setPrice("");
    setStatus("DRAFT");
    setIsActive(true);
    setExistingMedia([]);
    setRemovedMedia([]);
    setNewMedia([]);
    setCoverId(null);
    setOpciones([]);
    setFotoOpcionAbierta(null);
    setPesoEnvio("");
    setPesoEstimado(false);
    setPesoTocado(false);
    setModalErr(null);
    setModalOpen(true);
  }

  function openEdit(s: ServiceRow) {
    seleccion.terminar();
    setEditing(s);
    setTitle(s.title);
    setDesc(s.description);
    // Con coma para los céntimos, como se escribe en España (45,50).
    setPrice(String(s.price_eur ?? 0).replace(".", ","));
    setStatus(s.status);
    setIsActive(s.is_active);
    setExistingMedia(s.media);
    setRemovedMedia([]);
    setNewMedia([]);
    setCoverId(s.media.find((m) => m.is_cover)?.id ?? s.media[0]?.id ?? null);
    setOpciones(
      (s.modalidades ?? []).map((m) => ({ nombre: m.nombre, precio: String(m.precio_eur).replace(".", ","), foto: m.foto ?? null }))
    );
    setFotoOpcionAbierta(null);
    setPesoEnvio(s.envio_peso_kg != null ? String(s.envio_peso_kg).replace(".", ",") : "");
    setPesoEstimado(s.envio_peso_estimado === true);
    setPesoTocado(false);
    setModalErr(null);
    setModalOpen(true);
  }

  function closeModal() {
    newMedia.forEach((m) => {
      try {
        URL.revokeObjectURL(m.previewUrl);
      } catch {
        // ignore
      }
    });
    setModalOpen(false);
  }

  // Devuelve las fotos añadidas (la opción que pidió «Subir foto» se queda con la primera).
  async function pickPhotos(): Promise<{ id: string }[]> {
    setModalErr(null);
    setPicking(true);
    try {
      // pickMediaFilesWeb() ya no aborta la selección entera si UN archivo
      // falla (formato raro, HEIC que no se pudo convertir...): las fotos
      // válidas se añaden igual y las que fallan quedan en "skipped". Antes
      // esto era "todo o nada" — elegías 15 fotos, una daba problemas, y no
      // se añadía NINGUNA sin ningún aviso.
      const { items: picked, skipped } = await pickMediaFilesWeb();
      const images = picked.filter((m) => m.kind === "image");
      const nonImages = picked.filter((m) => m.kind !== "image");

      // Los vídeos no se usan en Servicios: se descartan (revocando su
      // URL local) en vez de dejarlos huérfanos en memoria.
      nonImages.forEach((m) => {
        try {
          URL.revokeObjectURL(m.previewUrl);
        } catch {
          // ignore
        }
      });

      const totalAfter = existingMedia.length + newMedia.length + images.length;
      const skippedNote = skipped.length
        ? `${skipped.length} archivo${skipped.length === 1 ? "" : "s"} no se ${
            skipped.length === 1 ? "pudo" : "pudieron"
          } añadir (${skipped.map((s) => s.name).join(", ")}).`
        : "";

      if (totalAfter > MAX_IMAGES) {
        setModalErr(`${ERRORS.MAX_IMAGES}${skippedNote ? ` ${skippedNote}` : ""}`);
        return [];
      }

      if (images.length) {
        setNewMedia((prev) => [...prev, ...images]);
        if (!coverId && !existingMedia.length && images[0]) setCoverId(images[0].id);
      }

      if (skippedNote) setModalErr(skippedNote);
      return images;
    } catch (e: any) {
      setModalErr(e?.message ?? ERRORS.GENERIC_UPLOAD);
      return [];
    } finally {
      setPicking(false);
    }
  }

  function removeExistingPhoto(id: string) {
    setExistingMedia((prev) => {
      const found = prev.find((m) => m.id === id);
      if (found) setRemovedMedia((curr) => [...curr, found]);
      return prev.filter((m) => m.id !== id);
    });
    if (coverId === id) setCoverId(null);
  }

  function removeNewPhoto(id: string) {
    setNewMedia((prev) => {
      const found = prev.find((m) => m.id === id);
      if (found) {
        try {
          URL.revokeObjectURL(found.previewUrl);
        } catch {
          // ignore
        }
      }
      return prev.filter((m) => m.id !== id);
    });
    if (coverId === id) setCoverId(null);
  }

  // «Seleccionar varias»: quita del formulario las fotos elegidas (se borran de verdad al guardar los cambios). Si la
  // portada estaba entre ellas, pasa a serlo la primera que queda.
  function quitarElegidas() {
    const ids = new Set(seleccion.elegidas);
    const quitadas = existingMedia.filter((m) => ids.has(m.id));
    const nuevasQuitadas = newMedia.filter((m) => ids.has(m.id));
    nuevasQuitadas.forEach((m) => {
      try {
        URL.revokeObjectURL(m.previewUrl);
      } catch {
        // ignore
      }
    });
    const quedanExistentes = existingMedia.filter((m) => !ids.has(m.id));
    const quedanNuevas = newMedia.filter((m) => !ids.has(m.id));
    setExistingMedia(quedanExistentes);
    setNewMedia(quedanNuevas);
    if (quitadas.length) setRemovedMedia((prev) => [...prev, ...quitadas]);
    if (coverId && ids.has(coverId)) setCoverId(quedanExistentes[0]?.id ?? quedanNuevas[0]?.id ?? null);
    seleccion.terminar();
  }

  // Devuelve las fotos quitadas (mientras no se haya guardado).
  function deshacerQuitadas() {
    setExistingMedia((prev) => [...prev, ...removedMedia].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
    setRemovedMedia([]);
  }

  // Devuelve la dirección pública de cada foto nueva (por su id local), para las opciones que la usan.
  async function uploadNewPhotos(serviceId: string): Promise<Record<string, string>> {
    const subidas: Record<string, string> = {};
    if (!newMedia.length) return subidas;
    const startIndex = existingMedia.length;

    // La subida a Storage tiene que ser un archivo detrás de otro (no se
    // puede agrupar). Pero antes, además, se hacía un INSERT a
    // "service_media" por cada foto (hasta 15 peticiones de red seguidas
    // solo para guardar las filas). Ahora se suben los archivos igual, uno a
    // uno, pero las filas se acumulan en memoria y se mandan en un único
    // INSERT agrupado al final — mismo patrón que ya usa
    // admin/products.tsx (ver normalizeMediaForProduct).
    const rows: Record<string, any>[] = [];

    for (let i = 0; i < newMedia.length; i++) {
      const item = newMedia[i];
      const storagePath = `services/${buildMediaPath(serviceId, item, startIndex + i)}`;

      const uploadRes = await supabase.storage.from(MEDIA_BUCKET).upload(storagePath, item.file, {
        cacheControl: "3600",
        upsert: false,
        contentType: item.mimeType || undefined,
      });
      if (uploadRes.error) throw uploadRes.error;

      const { data: publicData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath);
      const publicUrl = publicData?.publicUrl ?? "";
      if (publicUrl) subidas[item.id] = publicUrl;

      rows.push({
        service_id: serviceId,
        storage_path: storagePath,
        public_url: publicUrl,
        file_name: item.name,
        sort_order: startIndex + i,
        is_cover: coverId === item.id,
      });
    }

    if (rows.length) {
      const insertRes = await supabase.from("service_media").insert(rows);
      if (insertRes.error) throw insertRes.error;
    }
    return subidas;
  }

  async function deleteRemovedPhotos() {
    if (!removedMedia.length) return;
    const paths = removedMedia.map((m) => m.storage_path).filter(Boolean) as string[];
    const ids = removedMedia.map((m) => m.id);
    if (paths.length) {
      const storageDelete = await supabase.storage.from(MEDIA_BUCKET).remove(paths);
      if (storageDelete.error) throw storageDelete.error;
    }
    const dbDelete = await supabase.from("service_media").delete().in("id", ids);
    if (dbDelete.error) throw dbDelete.error;
  }

  async function syncCover(serviceId: string) {
    // Deja como portada únicamente la que coincide con coverId (entre las
    // fotos que ya existían en Supabase; las nuevas ya se insertan con
    // is_cover correcto en uploadNewPhotos). Antes esto era un .update() por
    // foto cuyo estado de portada cambiaba; ahora se agrupan los cambios en
    // un único .upsert() — mismo patrón, y misma cautela con las columnas
    // NOT NULL sin valor por defecto (aquí "service_id"), que ya products.tsx
    // documenta: un .upsert() es un INSERT ... ON CONFLICT DO UPDATE a nivel
    // de Postgres, así que sin service_id fallaría aunque la fila ya exista.
    const changedRows = existingMedia
      .filter((m) => Boolean(m.is_cover) !== (m.id === coverId))
      .map((m) => ({ id: m.id, service_id: serviceId, is_cover: m.id === coverId }));

    if (changedRows.length === 0) return;

    const { error } = await supabase.from("service_media").upsert(changedRows, { onConflict: "id" });
    if (error) throw error;
  }

  async function save() {
    if (saving) return;
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setModalErr("Ponle un título al servicio.");
      return;
    }

    // Opciones (Básica, Completa…): las filas vacías no cuentan; una con nombre necesita precio y al revés.
    const filasOpciones = opciones.filter((o) => o.nombre.trim() || o.precio.trim());
    const incompleta = filasOpciones.find((o) => !o.nombre.trim() || !o.precio.trim() || !(toPriceSafe(o.precio, -1) >= 0));
    if (incompleta) {
      setModalErr("Cada opción necesita su nombre y su precio (o déjala vacía para quitarla).");
      return;
    }
    const nombresOpciones = filasOpciones.map((o) => o.nombre.trim().toLowerCase());
    if (new Set(nombresOpciones).size !== nombresOpciones.length) {
      setModalErr("Hay dos opciones con el mismo nombre: cámbiale el nombre a una.");
      return;
    }
    // La foto de cada opción: una foto guardada que siga en el servicio (si se quitó, la opción se queda sin foto); las
    // nuevas (`nueva:<id>`) se resuelven después de subirlas.
    const guardadas = new Set(existingMedia.map((m) => m.public_url ?? ""));
    const nuevas = new Set(newMedia.map((m) => m.id));
    const fotoValida = (f: string | null) =>
      !f ? null : f.startsWith("nueva:") ? (nuevas.has(f.slice(6)) ? f : null) : guardadas.has(f) ? f : null;
    const modalidades: ModalidadServicio[] = filasOpciones.map((o) => {
      const foto = fotoValida(o.foto);
      return {
        nombre: o.nombre.trim(),
        precio_eur: Math.round(toPriceSafe(o.precio, 0) * 100) / 100,
        ...(foto && !foto.startsWith("nueva:") ? { foto } : null),
      };
    });
    const opcionesConFotoNueva = filasOpciones.map((o) => fotoValida(o.foto)).filter((f) => f?.startsWith("nueva:"));
    // Peso para el envío (parte 2): vacío = el peso por defecto de los ajustes; si no, entre 0 y 30 kg.
    const pesoKg = pesoEnvio.trim() ? Number(pesoEnvio.trim().replace(",", ".")) : null;
    if (pesosOk && pesoTocado && pesoKg !== null && !(Number.isFinite(pesoKg) && pesoKg > 0 && pesoKg <= 30)) {
      setModalErr("El peso para el envío tiene que estar entre 0,1 y 30 kg (o vacío para usar el peso por defecto).");
      return;
    }

    setSaving(true);
    setModalErr(null);

    try {
      // Con céntimos (45,50 → 45.5; dueño, 2026-11-04). Hasta que se aplique la migración 20261104150000 la columna
      // es de enteros: entonces se guarda redondeado y se avisa (el servicio no se queda sin guardar).
      // Con opciones, el precio del servicio es el de la más barata (el «desde» de los listados de la tienda).
      const precio = modalidades.length
        ? Math.min(...modalidades.map((m) => m.precio_eur))
        : Math.round(toPriceSafe(price, 0) * 100) / 100;
      const payload: {
        title: string;
        description: string;
        price_eur: number;
        status: ServiceStatus;
        is_active: boolean;
        modalidades?: ModalidadServicio[];
      } = {
        title: cleanTitle,
        description: desc.trim(),
        price_eur: precio,
        status,
        is_active: isActive,
        ...(opcionesOk ? { modalidades } : null),
      };
      const guardar = async (datos: typeof payload, id: string | null) => {
        if (id) {
          const { error } = await supabase.from("services").update(datos).eq("id", id);
          return { id, error };
        }
        const { data, error } = await supabase.from("services").insert(datos).select("id").single();
        return { id: (data as { id: string } | null)?.id ?? null, error };
      };

      let serviceId = editing?.id ?? null;
      let res = await guardar(payload, serviceId);
      const sinCentimos = !!res.error && String((res.error as { code?: string }).code ?? "") === "22P02" && !Number.isInteger(precio);
      if (sinCentimos) res = await guardar({ ...payload, price_eur: Math.round(precio) }, serviceId);
      if (res.error) throw res.error;
      serviceId = res.id;
      setAvisoPrecio(
        sinCentimos
          ? `Guardado con ${fmtEUR(Math.round(precio))} en vez de ${fmtEUR(precio)}: para guardar céntimos en los servicios falta aplicar un ajuste en la base de datos (migración 20261104150000).`
          : null
      );

      if (serviceId) {
        await deleteRemovedPhotos();
        const subidas = await uploadNewPhotos(serviceId);
        await syncCover(serviceId);
        // Las opciones con una foto recién subida: ya con su dirección pública.
        if (opcionesOk && opcionesConFotoNueva.length) {
          const conFotos = filasOpciones.map((o, i) => {
            const f = fotoValida(o.foto);
            const url = f?.startsWith("nueva:") ? subidas[f.slice(6)] : null;
            return url ? { ...modalidades[i], foto: url } : modalidades[i];
          });
          const { error } = await supabase.from("services").update({ modalidades: conFotos }).eq("id", serviceId);
          if (error) throw error;
        }
        // El peso que el dueño ha guardado (o dado por bueno) deja de ser «estimado».
        if (pesosOk && pesoTocado) {
          const { error } = await supabase
            .from("services")
            .update({ envio_peso_kg: pesoKg === null ? null : Math.round(pesoKg * 1000) / 1000, envio_peso_estimado: false })
            .eq("id", serviceId);
          if (error) throw error;
        }
      }

      closeModal();
      await loadServices();
    } catch (e: any) {
      console.error("Error guardando el servicio:", e);
      setModalErr(e?.message ?? "No se pudo guardar el servicio.");
    } finally {
      setSaving(false);
    }
  }

  // --- Borrar servicio ---
  const [deleteTarget, setDeleteTarget] = useState<ServiceRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const paths = deleteTarget.media.map((m) => m.storage_path).filter(Boolean) as string[];
      if (paths.length) {
        await supabase.storage.from(MEDIA_BUCKET).remove(paths);
      }
      const { error } = await supabase.from("services").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      setDeleteTarget(null);
      await loadServices();
    } catch (e) {
      console.error("Error borrando el servicio:", e);
    } finally {
      setDeleting(false);
    }
  }

  // --- Solicitudes ---
  const [requests, setRequests] = useState<ServiceRequestRow[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestFilter, setRequestFilter] = useState<"ALL" | RequestStatus | "sin_cuenta" | "veoaura">("ALL");

  // false = faltan las columnas de seguimiento (migración sin aplicar)
  const [seguimientoOk, setSeguimientoOk] = useState(true);
  // false = aún no hay números de seguimiento (migración 20261031170000 sin aplicar): no se enseñan.
  const [numerosOk, setNumerosOk] = useState(false);
  // false = aún no existe la reparación por envío (migración 20261111100000).
  const [envioOk, setEnvioOk] = useState(false);
  // false = aún no está la parte 2 (migración 20261111130000): sin cobros, «sin arreglo» ni garantía.
  const [parte2Ok, setParte2Ok] = useState(false);
  // Fotos de recepción abiertas en el visor (enlaces firmados del almacén privado).
  const [visorEnvio, setVisorEnvio] = useState<LightboxImage[] | null>(null);
  // Reseñas de los servicios terminados (migración 20261103210000): la de cada solicitud y la media de cada servicio.
  // Vacías si la migración aún no está aplicada.
  const [resenasSolicitud, setResenasSolicitud] = useState<Record<string, { rating: number; comment: string }>>({});
  const [mediaServicio, setMediaServicio] = useState<Record<string, { media: number; n: number }>>({});
  useEffect(() => {
    let vivo = true;
    supabase
      .from("store_reviews")
      .select("service_request_id,service_id,rating,comment")
      .not("service_request_id", "is", null)
      .limit(2000)
      .then(({ data, error }) => {
        if (!vivo || error) return;
        const filas = (data ?? []) as { service_request_id: string; service_id: string | null; rating: number; comment: string }[];
        setResenasSolicitud(Object.fromEntries(filas.map((f) => [f.service_request_id, { rating: f.rating, comment: f.comment }])));
        const suma: Record<string, { t: number; n: number }> = {};
        for (const f of filas) {
          if (!f.service_id) continue;
          suma[f.service_id] = { t: (suma[f.service_id]?.t ?? 0) + f.rating, n: (suma[f.service_id]?.n ?? 0) + 1 };
        }
        setMediaServicio(Object.fromEntries(Object.entries(suma).map(([id, v]) => [id, { media: v.t / v.n, n: v.n }])));
      });
    return () => {
      vivo = false;
    };
  }, []);

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      const base =
        "id,created_at,service_id,service_title,nombre,apellido,metodo_contacto,contacto,ciudad,direccion,disponibilidad,comentario,status";
      const consulta = (columnas: string) =>
        supabase.from("service_requests").select(columnas).order("created_at", { ascending: false }).limit(200);
      const seguimiento = "seguimiento,seguimiento_nota,seguimiento_actualizado";
      const completa = `${base},${seguimiento},customer_user_id,codigo_seguimiento,id_veoaura,vinculado_en,nota_admin`;
      // Con la reparación por envío (migración 20261111100000) y la opción elegida (20261108230000) si la base de datos ya
      // las tiene; si no, sin ellas (y sin volver a preguntar por las de envío en esta visita).
      let res: { data: any[] | null; error: any } = { data: null, error: { code: "42703" } };
      // Parte 2 (cobros, sin arreglo y garantía): solo si los ajustes ya traen garantia_meses (sin errores antes).
      const conParte2 = !sinColumnasEnvio && !!(await cargarAjustesReparacionEnvio())?.parte2;
      setParte2Ok(conParte2);
      if (conParte2) {
        res = await consulta(`${completa},modalidad,modalidad_precio_eur,${COLUMNAS_ENVIO},${COLUMNAS_ENVIO_2}`);
        if (res.error && faltaEsquema(res.error)) setParte2Ok(false);
      }
      if (!sinColumnasEnvio && res.error) {
        res = await consulta(`${completa},modalidad,modalidad_precio_eur,${COLUMNAS_ENVIO}`);
        if (res.error && faltaEsquema(res.error)) sinColumnasEnvio = true;
      }
      setEnvioOk(!res.error);
      if (res.error && faltaEsquema(res.error)) res = await consulta(`${completa},modalidad,modalidad_precio_eur`);
      if (res.error && faltaEsquema(res.error)) res = await consulta(completa);
      setNumerosOk(!res.error);
      if (res.error && faltaEsquema(res.error)) res = await consulta(`${base},${seguimiento}`);
      if (res.error && faltaEsquema(res.error)) {
        setSeguimientoOk(false);
        res = await consulta(base);
      } else if (!res.error) {
        setSeguimientoOk(true);
      }
      const { data, error } = res;
      if (error) throw error;
      setRequests((data ?? []) as ServiceRequestRow[]);
    } catch (e) {
      console.error("Error cargando solicitudes de servicio:", e);
      setRequests([]);
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "solicitudes") loadRequests();
  }, [tab, loadRequests]);

  // Filtros de la opción elegida, la recogida a domicilio (escribió «Dónde podemos recogerlo») y el método de contacto.
  const [filtroOpcion, setFiltroOpcion] = useState("ALL");
  const [filtroRecogida, setFiltroRecogida] = useState<"ALL" | "si" | "no">("ALL");
  const [filtroMetodo, setFiltroMetodo] = useState<"ALL" | MetodoContacto>("ALL");
  // Entrega (reparación por envío): todas, recogida o por envío.
  const [filtroEntrega, setFiltroEntrega] = useState<"ALL" | "recogida" | "correos">("ALL");
  // Parte 2: cobros, «sin arreglo» y garantía (qué hay que mirar y cuántas hay de cada).
  type FiltroCobro = "ALL" | "avisado" | "pendiente" | "pagada" | "sin_arreglo" | "comprar" | "devolver" | "garantia";
  const [filtroCobro, setFiltroCobro] = useState<FiltroCobro>("ALL");
  const pasaCobro = useCallback((r: ServiceRequestRow, f: FiltroCobro) => {
    if (f === "ALL") return true;
    if (f === "avisado") return (!!r.pago_avisado_en && r.pago_estado !== "pagado") || (!!r.etiqueta_avisada_en && !r.etiqueta_pagada_en);
    if (f === "pendiente")
      return (
        r.entrega_modo === "correos" &&
        r.pago_estado !== "pagado" &&
        r.seguimiento !== "cancelado" &&
        ((r.diagnostico_resultado === "sin_arreglo" && r.sin_arreglo_eleccion === "devolver" && Number(r.vuelta_eur ?? 0) > 0) ||
          (r.diagnostico_resultado !== "sin_arreglo" && !!r.presupuesto_aceptado_en && Number(r.presupuesto_eur ?? 0) > 0))
      );
    if (f === "pagada") return r.pago_estado === "pagado";
    if (f === "sin_arreglo") return r.diagnostico_resultado === "sin_arreglo";
    if (f === "comprar" || f === "devolver") return r.diagnostico_resultado === "sin_arreglo" && r.sin_arreglo_eleccion === f;
    return !!r.garantia_de;
  }, []);
  const cuentaCobro = useMemo(() => {
    const c = {} as Record<FiltroCobro, number>;
    for (const f of ["avisado", "pendiente", "pagada", "sin_arreglo", "comprar", "devolver", "garantia"] as FiltroCobro[]) c[f] = requests.filter((r) => pasaCobro(r, f)).length;
    c.ALL = requests.length;
    return c;
  }, [requests, pasaCobro]);
  const garantiasAbiertas = useMemo(() => requests.filter((r) => !!r.garantia_de && r.seguimiento !== "entregado" && r.seguimiento !== "cancelado").length, [requests]);
  const cuentaPorEnvio = useMemo(() => requests.filter((r) => r.entrega_modo === "correos").length, [requests]);
  const opcionesSolicitadas = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const r of requests) if (r.modalidad) cuenta.set(r.modalidad, (cuenta.get(r.modalidad) ?? 0) + 1);
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
  }, [requests]);

  const filteredRequests = useMemo(() => {
    let lista = requests;
    if (requestFilter === "sin_cuenta") lista = lista.filter((r) => !r.customer_user_id);
    else if (requestFilter === "veoaura") lista = lista.filter((r) => !!r.id_veoaura);
    else if (requestFilter !== "ALL") lista = lista.filter((r) => r.status === requestFilter);
    if (filtroOpcion === "SIN") lista = lista.filter((r) => !r.modalidad);
    else if (filtroOpcion !== "ALL") lista = lista.filter((r) => r.modalidad === filtroOpcion);
    if (filtroRecogida !== "ALL") lista = lista.filter((r) => (filtroRecogida === "si") === !!r.direccion?.trim());
    if (filtroMetodo !== "ALL") lista = lista.filter((r) => r.metodo_contacto === filtroMetodo);
    if (filtroEntrega !== "ALL") lista = lista.filter((r) => (r.entrega_modo === "correos" ? "correos" : "recogida") === filtroEntrega);
    if (filtroCobro !== "ALL") lista = lista.filter((r) => pasaCobro(r, filtroCobro));
    return lista;
  }, [requests, requestFilter, filtroOpcion, filtroRecogida, filtroMetodo, filtroEntrega, filtroCobro, pasaCobro]);

  // Cuántas de cada (para los desplegables de filtro).
  const cuentaRecogida = useMemo(() => requests.filter((r) => !!r.direccion?.trim()).length, [requests]);
  const cuentaMetodo = useMemo(() => {
    const c: Partial<Record<MetodoContacto, number>> = {};
    for (const r of requests) if (r.metodo_contacto) c[r.metodo_contacto] = (c[r.metodo_contacto] ?? 0) + 1;
    return c;
  }, [requests]);

  // Números de seguimiento: cuántas fichas vienen de VeoAura y cuántas ya están en la cuenta de su cliente.
  const resumenNumeros = useMemo(() => {
    const deVeoaura = requests.filter((r) => !!r.id_veoaura);
    return {
      veoaura: deVeoaura.length,
      veoauraVinculadas: deVeoaura.filter((r) => !!r.customer_user_id).length,
      sinCuenta: requests.filter((r) => !r.customer_user_id).length,
      anadidasConNumero: requests.filter((r) => !!r.vinculado_en).length,
      desdeChat: requests.filter((r) => r.nota_admin === NOTA_ASIGNADO_CHAT).length,
    };
  }, [requests]);

  async function setRequestStatus(id: string, next: RequestStatus) {
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: next } : r)));
    const { error } = await supabase.from("service_requests").update({ status: next }).eq("id", id);
    if (error) {
      console.error("Error actualizando la solicitud:", error);
      await loadRequests();
    }
  }

  const [deleteRequestTarget, setDeleteRequestTarget] = useState<ServiceRequestRow | null>(null);

  async function confirmDeleteRequest() {
    if (!deleteRequestTarget) return;
    const id = deleteRequestTarget.id;
    setDeleteRequestTarget(null);
    setRequests((prev) => prev.filter((r) => r.id !== id));
    const { error } = await supabase.from("service_requests").delete().eq("id", id);
    if (error) {
      console.error("Error borrando la solicitud:", error);
      await loadRequests();
    }
  }

  // --- Render ---

  return (
    // En iOS deja sitio al teclado (las notas de seguimiento pueden estar al final de la lista).
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: COLORS.bg }}
    >
      <StatusBar barStyle="dark-content" />

      {/* Cabecera fija y compacta (volver al panel + título centrado), igual
          en todo el panel. Pestañas y contenido van en un solo scroll. */}
      <AdminHeader title="Servicios" isMobile={isMobile} maxWidth={1160} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: pagePadding,
          // Hueco para el «+» flotante: nunca tapa el último servicio.
          paddingBottom: 96 + insets.bottom,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={CIERRE_TECLADO}
      >
        {/* Deslizar el dedo a un lado u otro sobre el contenido cambia de pestaña, en bucle (useGestoPestanas). */}
        <Animated.View
          ref={gesto.ref}
          nativeID="servicios-deslizable"
          {...gesto.panHandlers}
          style={{ ...columnStyle, gap: sectionGap, transform: [{ translateX: gesto.desliz }] }}
        >
          <PestanasPanel nativeID="servicios-pestanas" pestanas={PESTANAS_SERVICIOS} actual={tab} onChange={setTab} />

      {tab === "catalogo" ? (
          <>
            {/* El buscador arriba de los contadores, igual que en Productos (mismo alto y mismo sitio). */}
            <TextInput
              nativeID="servicios-buscar"
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar por título o descripción"
              placeholderTextColor="rgba(11,33,56,0.40)"
              style={{
                borderWidth: 1,
                borderColor: COLORS.border,
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: COLORS.text,
                backgroundColor: "#F8FBFE",
                // 16 px: Safari en iPhone no hace zoom de toda la pantalla al escribir.
                fontSize: 16,
              }}
            />

            {avisoPrecio ? <AdminNotice tone="warning" text={avisoPrecio} /> : null}

            {/* Los cuatro contadores en una sola fila, también en el móvil (dueño, 2026-11-03). */}
            <View nativeID="servicios-contadores" style={{ flexDirection: "row", flexWrap: "nowrap", gap: isMobile ? 8 : 10 }}>
              <StatCard label="Servicios" value={String(stats.total)} icon="construct-outline" isMobile={isMobile} columns={4} />
              <StatCard label="Publicados" value={String(stats.published)} icon="checkmark-circle-outline" isMobile={isMobile} columns={4} />
              <StatCard label="Visibles" value={String(stats.visible)} icon="eye-outline" isMobile={isMobile} columns={4} />
              <StatCard label="Visitas" value={String(stats.views)} icon="trending-up-outline" isMobile={isMobile} columns={4} />
            </View>

            {loading ? (
              <CargaMarca texto="Cargando servicios…" />
            ) : filteredServices.length === 0 ? (
              <EmptyState
                icon="construct-outline"
                title="Todavía no hay servicios"
                text="Crea el primero (por ejemplo «Reparación de pantalla» o «Limpieza interna») para que aparezca en la categoría «Reparación/Limpieza» de Inicio."
              />
            ) : (
              // Sin recuadro alrededor de cada servicio (dueño, 2026-11-03: «quitar las burbujas envolventes»): filas
              // separadas por una línea fina.
              <View nativeID="servicios-lista">
                {filteredServices.map((s, i) => {
                  const cover = coverUrl(s.media);
                  return (
                    <View
                      key={s.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        paddingVertical: 12,
                        borderTopWidth: i === 0 ? 0 : 1,
                        borderTopColor: COLORS.border,
                      }}
                    >
                      {cover ? (
                        // Tocar la foto la abre en grande, con zoom.
                        <Pressable
                          onPress={() => setVisor({ fotos: fotosDelServicio(s.media), inicio: 0 })}
                          accessibilityRole="button"
                          accessibilityLabel={`Ver las fotos de ${s.title || "el servicio"}`}
                          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                        >
                          <SmartImage uri={cover} style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: COLORS.cardSoft }} />
                        </Pressable>
                      ) : (
                        <View
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: 12,
                            backgroundColor: COLORS.cardSoft,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Ionicons name="construct-outline" size={22} color={COLORS.muted} />
                        </View>
                      )}

                      {/* Título y datos enteros, en las líneas que hagan falta (dueño, 2026-11-04: «que se vean perfectamente»). */}
                      <View nativeID={`servicio-fila-${s.id}`} style={{ flex: 1, minWidth: 0, gap: 4 }}>
                        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 14, lineHeight: 19, textAlign: "center" }}>
                          {s.title || "Sin título"}
                        </Text>
                        <Text style={{ color: COLORS.muted, fontSize: 12, lineHeight: 17, textAlign: "center" }}>
                          {s.modalidades?.length
                            ? `Desde ${fmtEUR(s.price_eur)} · ${s.modalidades.length} opciones${
                                s.modalidades.some((m) => m.foto) ? ` (${s.modalidades.filter((m) => m.foto).length} con foto)` : ""
                              }`
                            : fmtEUR(s.price_eur)}{" "}
                          ·{" "}
                          {STATUS_LABEL[s.status]}
                          {!s.is_active ? " · Oculto" : ""} · {s.view_count ?? 0} visitas
                          {typeof s.like_count === "number" ? ` · ${s.like_count} me gusta` : ""}
                          {mediaServicio[s.id] ? ` · ★ ${mediaServicio[s.id].media.toFixed(1).replace(".", ",")} (${mediaServicio[s.id].n})` : ""}
                        </Text>
                      </View>

                      <IconButton icon="create-outline" label={`Editar ${s.title || "el servicio"}`} variant="primary" onPress={() => openEdit(s)} />
                      <IconButton icon="trash-outline" label={`Borrar ${s.title || "el servicio"}`} variant="danger" onPress={() => setDeleteTarget(s)} />
                    </View>
                  );
                })}
              </View>
            )}

            <EditorVideosServicios isMobile={isMobile} />
          </>
      ) : (
          <>
            {/* Ajustes de la reparación por envío (plegados). */}
            <AjustesEnvioPanel isMobile={isMobile} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
              {(["ALL", "nuevo", "revisado", "contactado", "descartado"] as const).map((f) => (
                <ChipButton
                  key={f}
                  label={f === "ALL" ? "Todas" : REQUEST_STATUS_LABEL[f]}
                  onPress={() => setRequestFilter(f)}
                  variant={requestFilter === f ? "primary" : "ghost"}
                  isMobile={isMobile}
                />
              ))}
              {numerosOk
                ? (
                    [
                      ["sin_cuenta", `Sin cuenta (${resumenNumeros.sinCuenta})`],
                      ["veoaura", `De VeoAura (${resumenNumeros.veoaura})`],
                    ] as const
                  ).map(([f, label]) => (
                    <ChipButton
                      key={f}
                      label={label}
                      onPress={() => setRequestFilter(f)}
                      variant={requestFilter === f ? "primary" : "ghost"}
                      isMobile={isMobile}
                    />
                  ))
                : null}
            </View>
            {/* Filtros de la opción, la recogida y el método de contacto: desplegables del propio móvil, de dos en dos. */}
            {!requestsLoading && requests.length ? (
              <View nativeID="solicitudes-filtros" style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                <View style={{ flexGrow: 1, flexBasis: isMobile ? "45%" : "30%" }}>
                  <SelectorIOS
                    nativeID="solicitudes-filtro-opcion"
                    label="Opción"
                    value={filtroOpcion}
                    onChange={setFiltroOpcion}
                    options={[
                      { value: "ALL", label: "Todas" },
                      ...opcionesSolicitadas.map(([nombre, n]) => ({ value: nombre, label: `${nombre} (${n})` })),
                      { value: "SIN", label: `Sin opción (${requests.filter((r) => !r.modalidad).length})` },
                    ]}
                  />
                </View>
                <View style={{ flexGrow: 1, flexBasis: isMobile ? "45%" : "30%" }}>
                  <SelectorIOS
                    nativeID="solicitudes-filtro-recogida"
                    label="Recogida"
                    value={filtroRecogida}
                    onChange={(v) => setFiltroRecogida(v as "ALL" | "si" | "no")}
                    options={[
                      { value: "ALL", label: "Todas" },
                      { value: "si", label: `Con dirección de recogida (${cuentaRecogida})` },
                      { value: "no", label: `Sin dirección (${requests.length - cuentaRecogida})` },
                    ]}
                  />
                </View>
                {envioOk ? (
                  <View style={{ flexGrow: 1, flexBasis: isMobile ? "45%" : "30%" }}>
                    <SelectorIOS
                      nativeID="solicitudes-filtro-entrega"
                      label="Entrega"
                      value={filtroEntrega}
                      onChange={(v) => setFiltroEntrega(v as "ALL" | "recogida" | "correos")}
                      options={[
                        { value: "ALL", label: "Todas" },
                        { value: "recogida", label: `Recogida (${requests.length - cuentaPorEnvio})` },
                        { value: "correos", label: `Por envío (${cuentaPorEnvio})` },
                      ]}
                    />
                  </View>
                ) : null}
                <View style={{ flexGrow: 1, flexBasis: isMobile ? (envioOk ? "45%" : "100%") : "30%" }}>
                  <SelectorIOS
                    nativeID="solicitudes-filtro-metodo"
                    label="Contacto"
                    value={filtroMetodo}
                    onChange={(v) => setFiltroMetodo(v as "ALL" | MetodoContacto)}
                    options={[
                      { value: "ALL", label: "Todos" },
                      ...(Object.keys(METODO_LABEL) as MetodoContacto[]).map((m) => ({
                        value: m,
                        label: `${METODO_LABEL[m]} (${cuentaMetodo[m] ?? 0})`,
                      })),
                    ]}
                  />
                </View>
                {parte2Ok ? (
                  <View style={{ flexGrow: 1, flexBasis: isMobile ? "100%" : "30%" }}>
                    <SelectorIOS
                      nativeID="solicitudes-filtro-cobro"
                      label="Cobro y garantía"
                      value={filtroCobro}
                      onChange={(v) => setFiltroCobro(v as FiltroCobro)}
                      options={[
                        { value: "ALL", label: "Todas" },
                        { value: "avisado", label: `Dicen que ya pagaron (${cuentaCobro.avisado})` },
                        { value: "pendiente", label: `Pendientes de pago (${cuentaCobro.pendiente})` },
                        { value: "pagada", label: `Pagadas (${cuentaCobro.pagada})` },
                        { value: "sin_arreglo", label: `Sin arreglo (${cuentaCobro.sin_arreglo})` },
                        { value: "comprar", label: `Sin arreglo · te lo compramos (${cuentaCobro.comprar})` },
                        { value: "devolver", label: `Sin arreglo · devuélvemelo (${cuentaCobro.devolver})` },
                        { value: "garantia", label: `Garantía (${cuentaCobro.garantia})` },
                      ]}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}

            {parte2Ok && !requestsLoading && requests.length ? (
              <Text nativeID="servicios-cobros-resumen" style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12.5, lineHeight: 18, textAlign: "center" }}>
                Cobros · dicen que ya pagaron: {cuentaCobro.avisado} · pendientes: {cuentaCobro.pendiente} · pagadas: {cuentaCobro.pagada} · sin arreglo:{" "}
                {cuentaCobro.sin_arreglo} (te lo compramos {cuentaCobro.comprar}, devuélvemelo {cuentaCobro.devolver}) · garantías: {cuentaCobro.garantia} (abiertas{" "}
                {garantiasAbiertas})
              </Text>
            ) : null}

            {numerosOk && !requestsLoading ? (
              <Text nativeID="servicios-numeros" style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12.5, lineHeight: 18, textAlign: "center" }}>
                Números de seguimiento · de VeoAura: {resumenNumeros.veoaura} (en la cuenta del cliente: {resumenNumeros.veoauraVinculadas}) ·
                añadidas con su número: {resumenNumeros.anadidasConNumero} · sin cuenta: {resumenNumeros.sinCuenta} · asignadas desde
                el chat: {resumenNumeros.desdeChat}
              </Text>
            ) : null}

            {requestsLoading ? (
              <CargaMarca texto="Cargando solicitudes…" />
            ) : filteredRequests.length === 0 ? (
              <EmptyState
                icon="document-text-outline"
                title="Sin solicitudes todavía"
                text="Aquí aparecerán los clientes que pulsen «Contratar servicio ahora» en la ficha de un servicio."
              />
            ) : (
              // Sin recuadro alrededor de cada solicitud: separadas por una línea fina, como el catálogo.
              <View nativeID="solicitudes-lista">
                {filteredRequests.map((r, i) => {
                  const sc = REQUEST_STATUS_COLORS[r.status];
                  return (
                    <View
                      key={r.id}
                      style={{
                        paddingVertical: 16,
                        gap: 10,
                        borderTopWidth: i === 0 ? 0 : 1,
                        borderTopColor: COLORS.border,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 15, textAlign: "center" }}>
                            {r.nombre} {r.apellido}
                          </Text>
                          <Text style={{ color: COLORS.muted, fontSize: 12.5, marginTop: 2, textAlign: "center" }}>
                            {r.service_title} · {formatDate(r.created_at)}
                          </Text>
                          {r.garantia_de ? (
                            <Text nativeID={`solicitud-garantia-${r.id}`} style={{ color: COLORS.success, fontWeight: "900", fontSize: 12.5, marginTop: 4, textAlign: "center" }}>
                              Garantía · sin coste
                              {(() => {
                                const o = requests.find((x) => x.id === r.garantia_de);
                                return o?.codigo_seguimiento ? ` · de ${o.codigo_seguimiento}` : "";
                              })()}
                            </Text>
                          ) : null}
                          {r.codigo_seguimiento ? (
                            <View style={{ alignItems: "center", gap: 2, marginTop: 6 }}>
                              <Text selectable style={{ color: COLORS.text, fontWeight: "900", fontSize: 13.5, letterSpacing: 1 }}>
                                Nº de seguimiento {r.codigo_seguimiento}
                              </Text>
                              <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12, textAlign: "center" }}>
                                {[
                                  r.id_veoaura ? "Ficha de VeoAura" : null,
                                  r.customer_user_id
                                    ? r.vinculado_en
                                      ? `El cliente la añadió a su cuenta el ${formatDate(r.vinculado_en)}`
                                      : r.nota_admin === NOTA_ASIGNADO_CHAT
                                        ? "Asignada desde el chat: ya está en la cuenta del cliente"
                                        : "En la cuenta del cliente"
                                    : "Aún no está en ninguna cuenta: dale este número al cliente",
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <View
                          style={{
                            paddingVertical: 5,
                            paddingHorizontal: 10,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: sc.border,
                            backgroundColor: sc.bg,
                          }}
                        >
                          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 11 }}>
                            {REQUEST_STATUS_LABEL[r.status]}
                          </Text>
                        </View>
                      </View>

                      <View style={{ gap: 4, alignItems: "center" }}>
                        {r.modalidad ? (
                          <Text nativeID={`solicitud-opcion-${r.id}`} style={{ color: COLORS.text, fontSize: 13, textAlign: "center" }}>
                            <Text style={{ fontWeight: "800" }}>Opción: </Text>
                            {r.modalidad}
                            {r.modalidad_precio_eur != null ? ` · ${fmtEUR(Number(r.modalidad_precio_eur))}` : ""}
                          </Text>
                        ) : null}
                        {r.ciudad ? (
                          <Text style={{ color: COLORS.text, fontSize: 13, textAlign: "center" }}>
                            <Text style={{ fontWeight: "800" }}>Ciudad: </Text>
                            {r.ciudad}
                          </Text>
                        ) : null}
                        {r.metodo_contacto ? (
                          <Text style={{ color: COLORS.text, fontSize: 13, textAlign: "center" }}>
                            <Text style={{ fontWeight: "800" }}>{METODO_LABEL[r.metodo_contacto]}: </Text>
                            {r.contacto || "—"}
                          </Text>
                        ) : r.contacto ? (
                          // Fichas de VeoAura: el teléfono o el email que vino con la ficha.
                          <Text style={{ color: COLORS.text, fontSize: 13, textAlign: "center" }}>
                            <Text style={{ fontWeight: "800" }}>Contacto: </Text>
                            {r.contacto}
                          </Text>
                        ) : null}
                        {r.direccion ? (
                          <Text style={{ color: COLORS.text, fontSize: 13, textAlign: "center" }}>
                            <Text style={{ fontWeight: "800" }}>Recogida en: </Text>
                            {r.direccion}
                          </Text>
                        ) : null}
                        {r.disponibilidad ? (
                          <Text style={{ color: COLORS.text, fontSize: 13, textAlign: "center" }}>
                            <Text style={{ fontWeight: "800" }}>Disponibilidad: </Text>
                            {DISPONIBILIDAD_LABEL[r.disponibilidad]}
                          </Text>
                        ) : null}
                        {r.comentario ? (
                          <Text style={{ color: COLORS.text, fontSize: 13, textAlign: "center" }}>
                            <Text style={{ fontWeight: "800" }}>Detalles: </Text>
                            {r.comentario}
                          </Text>
                        ) : null}
                        {resenasSolicitud[r.id] ? (
                          <Text nativeID={`solicitud-resena-${r.id}`} style={{ color: COLORS.text, fontSize: 13, textAlign: "center" }}>
                            <Text style={{ fontWeight: "800" }}>Valoración del cliente: </Text>
                            <Text style={{ color: "#F5A524" }}>{"★".repeat(resenasSolicitud[r.id].rating)}</Text>
                            {resenasSolicitud[r.id].comment ? ` «${resenasSolicitud[r.id].comment}»` : ""}
                          </Text>
                        ) : null}
                      </View>

                      <RequestSeguimiento
                        key={`seg-${r.id}-${r.seguimiento ?? ""}`}
                        request={r}
                        disponible={seguimientoOk}
                        isMobile={isMobile}
                        onSaved={(patch) =>
                          setRequests((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...patch } : x)))
                        }
                        onMissingMigration={() => setSeguimientoOk(false)}
                        envioOk={envioOk}
                      />

                      {envioOk ? (
                        <PanelEnvioSolicitud
                          request={r}
                          isMobile={isMobile}
                          onSaved={(patch) => setRequests((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...patch } : x)))}
                          onVerFotos={setVisorEnvio}
                          parte2={parte2Ok}
                        />
                      ) : null}

                      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
                        {(["nuevo", "revisado", "contactado", "descartado"] as RequestStatus[])
                          .filter((s) => s !== r.status)
                          .map((s) => (
                            <ChipButton
                              key={s}
                              label={REQUEST_STATUS_LABEL[s]}
                              onPress={() => setRequestStatus(r.id, s)}
                              isMobile={isMobile}
                            />
                          ))}
                        <IconButton icon="trash-outline" label="Borrar la solicitud" variant="danger" onPress={() => setDeleteRequestTarget(r)} />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
      )}
        </Animated.View>
      </ScrollView>

      {/* «Nuevo servicio»: el «+» flotante abajo a la derecha, como en Productos (al alcance del pulgar). */}
      {tab === "catalogo" && !loading ? <BotonFlotante nativeID="servicio-nuevo" label="Nuevo servicio" onPress={openCreate} /> : null}

      {/* Las fotos de un servicio en grande, con zoom (el mismo visor que la ficha de producto). */}
      <ImageLightbox
        visible={!!visor}
        images={visor?.fotos ?? []}
        initialIndex={visor?.inicio ?? 0}
        onClose={() => setVisor(null)}
      />
      {/* Fotos de recepción de una reparación por envío (enlaces firmados de 5 minutos). */}
      <ImageLightbox visible={!!visorEnvio} images={visorEnvio ?? []} initialIndex={0} onClose={() => setVisorEnvio(null)} />

      {/* Modal crear/editar servicio: cabecera fija con la X y el
          formulario desplazable dentro (maxHeight), con sitio para el
          teclado en iOS. */}
      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{
            flex: 1,
            backgroundColor: "rgba(11,33,56,0.55)",
            paddingHorizontal: 16,
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
            justifyContent: "center",
          }}
        >
          <View
            style={{
              ...modalColumnStyle,
              maxHeight: "92%",
              borderRadius: 22,
              backgroundColor: COLORS.bg,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                position: "relative",
                justifyContent: "center",
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: COLORS.border,
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 17, textAlign: "center" }}>
                {editing ? "Editar servicio" : "Nuevo servicio"}
              </Text>
            </View>

            <ScrollView
              style={{ flexShrink: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 14 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={CIERRE_TECLADO}
            >
              <TextField label="Título" value={title} onChangeText={setTitle} placeholder="Reparación de pantalla" />
              <TextField
                label="Descripción"
                value={desc}
                onChangeText={setDesc}
                placeholder="Qué incluye el servicio, tiempo estimado, garantía…"
                multiline
              />
              {/* Los emojis no salen en la tienda (sinEmojis; dueño, 2026-11-04): se avisa al escribirlos. */}
              {contarEmojis(desc) > 0 ? (
                <Text nativeID="servicio-aviso-emojis" style={{ color: COLORS.muted, fontSize: 12.5, lineHeight: 18, textAlign: "center", marginTop: -6 }}>
                  En la tienda la descripción se verá sin {contarEmojis(desc) === 1 ? "su emoji" : `sus ${contarEmojis(desc)} emojis`}.
                </Text>
              ) : null}
              {opciones.some((o) => o.nombre.trim() || o.precio.trim()) ? null : (
                <TextField label="Precio (€)" value={price} onChangeText={setPrice} placeholder="0,00" keyboardType="decimal-pad" />
              )}

              {/* Reparación por envío, parte 2: el peso de UN aparato de este servicio con su caja (para la etiqueta de
                  Correos). «Estimado» hasta que el dueño lo guarde (o lo dé por bueno). */}
              {pesosOk ? (
                <View nativeID="servicio-peso-envio" style={{ gap: 4, width: "100%", alignSelf: "stretch" }}>
                  <TextField
                    label="Peso para el envío (kg, con su caja)"
                    value={pesoEnvio}
                    onChangeText={(t) => {
                      setPesoEnvio(t);
                      setPesoTocado(true);
                    }}
                    placeholder="Vacío = el peso por defecto"
                    keyboardType="decimal-pad"
                  />
                  {pesoEstimado && !pesoTocado && pesoEnvio.trim() ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      <Text nativeID="servicio-peso-estimado" style={{ color: COLORS.warning, fontWeight: "800", fontSize: 12.5, textAlign: "center" }}>
                        Estimado: corrígelo con el real o dalo por bueno
                      </Text>
                      <ChipButton label="Es correcto" icon="checkmark" isMobile={isMobile} onPress={() => setPesoTocado(true)} />
                    </View>
                  ) : null}
                  <Text style={{ color: COLORS.muted, fontSize: 12, lineHeight: 17, textAlign: "center" }}>
                    Tramos de Correos: hasta 1, 2, 3, 4, 5, 10… kg. Con varios aparatos se suma.
                  </Text>
                </View>
              ) : null}

              {/* Opciones que elige el cliente en la ficha y al contratar (dueño, 2026-11-08): nombre y precio de cada
                  una; la primera sale elegida. Con opciones, el precio del servicio es el de la más barata. */}
              {opcionesOk ? (
                <View nativeID="servicio-opciones" style={{ gap: 8, width: "100%", alignSelf: "stretch" }}>
                  <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13, textAlign: "center" }}>Opciones del servicio</Text>
                  <Text style={{ color: COLORS.muted, fontSize: 12.5, lineHeight: 18, textAlign: "center" }}>
                    Por ejemplo «Básica» y «Completa + mando». El cliente elige una en la ficha; la primera sale elegida. Sin
                    opciones, el servicio tiene un solo precio.
                  </Text>
                  {opciones.map((o, i) => {
                    const fotoUri = o.foto?.startsWith("nueva:")
                      ? newMedia.find((m) => m.id === o.foto?.slice(6))?.previewUrl ?? null
                      : o.foto && existingMedia.some((m) => m.public_url === o.foto)
                        ? o.foto
                        : null;
                    const todas = [
                      ...existingMedia.filter((m) => m.public_url).map((m) => ({ valor: m.public_url as string, uri: m.public_url as string })),
                      ...newMedia.map((m) => ({ valor: `nueva:${m.id}`, uri: m.previewUrl })),
                    ];
                    const ponerFoto = (foto: string | null) => {
                      setOpciones((prev) => prev.map((x, j) => (j === i ? { ...x, foto } : x)));
                      setFotoOpcionAbierta(null);
                    };
                    return (
                    <View key={i} style={{ gap: 8, width: "100%" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, width: "100%" }}>
                      {/* La foto de la opción (dueño, 2026-11-09): sale en la ficha al elegirla. */}
                      <Pressable
                        nativeID={`servicio-opcion-foto-${i}`}
                        onPress={() => setFotoOpcionAbierta((v) => (v === i ? null : i))}
                        accessibilityRole="button"
                        accessibilityLabel={fotoUri ? `Cambiar la foto de la opción ${o.nombre || i + 1}` : `Poner foto a la opción ${o.nombre || i + 1}`}
                        style={({ pressed }) => ({
                          width: 48,
                          height: 48,
                          flexShrink: 0,
                          borderRadius: 12,
                          overflow: "hidden",
                          borderWidth: 1,
                          borderStyle: fotoUri ? "solid" : "dashed",
                          borderColor: fotoOpcionAbierta === i ? COLORS.accent : COLORS.border,
                          backgroundColor: COLORS.cardSoft,
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: pressed ? 0.8 : 1,
                        })}
                      >
                        {fotoUri ? (
                          <SmartImage uri={fotoUri} style={{ width: 48, height: 48 }} />
                        ) : (
                          <Ionicons name="image-outline" size={20} color={COLORS.muted} />
                        )}
                      </Pressable>
                      <TextInput
                        nativeID={`servicio-opcion-nombre-${i}`}
                        value={o.nombre}
                        onChangeText={(v) => setOpciones((prev) => prev.map((x, j) => (j === i ? { ...x, nombre: v } : x)))}
                        placeholder="Nombre (Básica)"
                        placeholderTextColor={COLORS.muted2}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          width: 0,
                          minHeight: 48,
                          borderWidth: 1,
                          borderColor: COLORS.border,
                          borderRadius: 14,
                          paddingHorizontal: 12,
                          fontSize: 16,
                          color: COLORS.text,
                          backgroundColor: COLORS.cardSoft,
                        }}
                      />
                      <TextInput
                        nativeID={`servicio-opcion-precio-${i}`}
                        value={o.precio}
                        onChangeText={(v) => setOpciones((prev) => prev.map((x, j) => (j === i ? { ...x, precio: v } : x)))}
                        placeholder="0,00 €"
                        placeholderTextColor={COLORS.muted2}
                        keyboardType="decimal-pad"
                        style={{
                          width: 96,
                          flexShrink: 0,
                          minHeight: 48,
                          borderWidth: 1,
                          borderColor: COLORS.border,
                          borderRadius: 14,
                          paddingHorizontal: 12,
                          fontSize: 16,
                          color: COLORS.text,
                          backgroundColor: COLORS.cardSoft,
                          textAlign: "center",
                        }}
                      />
                      <IconButton
                        icon="trash-outline"
                        label={`Quitar la opción ${o.nombre || i + 1}`}
                        variant="danger"
                        onPress={() => {
                          setOpciones((prev) => prev.filter((_, j) => j !== i));
                          setFotoOpcionAbierta(null);
                        }}
                      />
                    </View>
                    {fotoOpcionAbierta === i ? (
                      <View
                        nativeID={`servicio-opcion-fotos-${i}`}
                        style={{ gap: 8, padding: 10, borderRadius: 14, backgroundColor: COLORS.cardSoft, borderWidth: 1, borderColor: COLORS.border }}
                      >
                        <Text style={{ color: COLORS.muted, fontSize: 12.5, textAlign: "center" }}>
                          Elige la foto de «{o.nombre.trim() || `opción ${i + 1}`}» o sube una nueva
                        </Text>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
                          {todas.map((f) => (
                            <Pressable
                              key={f.valor}
                              onPress={() => ponerFoto(f.valor)}
                              accessibilityRole="button"
                              accessibilityLabel="Usar esta foto"
                              style={{
                                width: 56,
                                height: 56,
                                borderRadius: 10,
                                overflow: "hidden",
                                borderWidth: o.foto === f.valor ? 3 : 1,
                                borderColor: o.foto === f.valor ? COLORS.accent : COLORS.border,
                              }}
                            >
                              <SmartImage uri={f.uri} style={{ width: "100%", height: "100%" }} />
                            </Pressable>
                          ))}
                        </View>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
                          <ChipButton
                            icon="cloud-upload-outline"
                            label="Subir foto"
                            onPress={async () => {
                              const añadidas = await pickPhotos();
                              if (añadidas[0]) ponerFoto(`nueva:${añadidas[0].id}`);
                            }}
                            isMobile={isMobile}
                          />
                          {o.foto ? <ChipButton icon="close" label="Sin foto" onPress={() => ponerFoto(null)} isMobile={isMobile} /> : null}
                        </View>
                      </View>
                    ) : null}
                    </View>
                    );
                  })}
                  {opciones.length < 12 ? (
                    <View style={{ alignItems: "center" }}>
                      <ChipButton
                        icon="add"
                        label="Añadir opción"
                        onPress={() =>
                          setOpciones((prev) => [
                            ...prev,
                            // La primera opción nueva arranca con el precio que ya tenía el servicio.
                            { nombre: "", precio: prev.length ? "" : price, foto: null },
                          ])
                        }
                        isMobile={isMobile}
                      />
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* Desplegable con el selector del propio móvil (en el iPhone, la rueda de iOS; dueño, 2026-11-04). */}
              <SelectorIOS
                nativeID="servicio-estado"
                label="Estado"
                centrado
                value={status}
                onChange={(v) => setStatus(v as ServiceStatus)}
                options={(["DRAFT", "PUBLISHED"] as ServiceStatus[]).map((st) => ({ value: st, label: STATUS_LABEL[st] }))}
              />

              <Pressable
                onPress={() => setIsActive((v) => !v)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  alignSelf: "center",
                  gap: 10,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Ionicons
                  name={isActive ? "checkbox" : "square-outline"}
                  size={22}
                  color={isActive ? COLORS.accent : COLORS.muted}
                />
                <Text style={{ color: COLORS.text, fontWeight: "700", fontSize: 13 }}>Visible en la tienda</Text>
              </Pressable>

              <View style={{ gap: 8, alignItems: "center" }}>
                <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13, textAlign: "center" }}>
                  Fotos ({existingMedia.length + newMedia.length}/{MAX_IMAGES})
                </Text>

                {/* Quitar varias a la vez (dueño, 2026-11-04). */}
                <BarraSeleccionFotos
                  total={existingMedia.length + newMedia.length}
                  seleccionando={seleccion.seleccionando}
                  elegidas={seleccion.elegidas.length}
                  onEmpezar={seleccion.empezar}
                  onTodas={() => seleccion.setElegidas([...existingMedia.map((m) => m.id), ...newMedia.map((m) => m.id)])}
                  onQuitar={quitarElegidas}
                  onTerminar={seleccion.terminar}
                />

                <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
                  {/* Las fotos ya guardadas y las nuevas, igual. Eligiendo varias, toda la miniatura se toca y lleva su
                      marca (sin «Usar» ni la X); si no, «Usar»/«Portada» y la X de cada una. */}
                  {[
                    ...existingMedia.map((m) => ({ id: m.id, uri: m.public_url ?? "", quitar: () => removeExistingPhoto(m.id) })),
                    ...newMedia.map((m) => ({ id: m.id, uri: m.previewUrl, quitar: () => removeNewPhoto(m.id) })),
                  ].map((f) => {
                    const elegida = seleccion.elegidas.includes(f.id);
                    return (
                      <View key={f.id} nativeID={`servicio-foto-${f.id}`} style={{ width: 76, height: 76 }}>
                        <SmartImage uri={f.uri} style={{ width: 76, height: 76, borderRadius: 12, backgroundColor: COLORS.cardSoft }} />
                        {seleccion.seleccionando ? (
                          <Pressable
                            onPress={() => seleccion.alternar(f.id)}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: elegida }}
                            accessibilityLabel="Elegir esta foto"
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              borderRadius: 12,
                              borderWidth: elegida ? 3 : 0,
                              borderColor: COLORS.accent,
                              backgroundColor: elegida ? "rgba(30,167,232,0.22)" : "transparent",
                            }}
                          >
                            <MarcaSeleccion elegida={elegida} />
                          </Pressable>
                        ) : (
                          <>
                            <Pressable
                              onPress={() => setCoverId(f.id)}
                              style={{
                                position: "absolute",
                                top: 4,
                                left: 4,
                                backgroundColor: coverId === f.id ? COLORS.accent : "rgba(11,33,56,0.55)",
                                borderRadius: 999,
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                              }}
                            >
                              <Text style={{ color: "#FFFFFF", fontSize: 9, fontWeight: "900" }}>{coverId === f.id ? "Portada" : "Usar"}</Text>
                            </Pressable>
                            <Pressable
                              onPress={f.quitar}
                              accessibilityRole="button"
                              accessibilityLabel="Quitar esta foto"
                              style={{ position: "absolute", top: 0, right: 0, width: 30, height: 30, alignItems: "center", justifyContent: "center" }}
                            >
                              {/* El icono ya es redondo y oscuro (se ve sobre cualquier foto): sin burbuja alrededor. */}
                              <Ionicons name="close-circle" size={22} color="rgba(11,33,56,0.85)" />
                            </Pressable>
                          </>
                        )}
                      </View>
                    );
                  })}

                  <Pressable
                    onPress={pickPhotos}
                    disabled={picking}
                    style={({ pressed }) => ({
                      width: 76,
                      height: 76,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: COLORS.accentBorder,
                      backgroundColor: COLORS.accent2,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: picking ? 0.6 : pressed ? 0.85 : 1,
                    })}
                  >
                    {picking ? (
                      <ActivityIndicator size="small" color={COLORS.accent} />
                    ) : (
                      <Ionicons name="add" size={22} color={COLORS.accent} />
                    )}
                  </Pressable>
                </View>

                {picking && (
                  <Text style={{ color: COLORS.muted, fontSize: 12, textAlign: "center" }}>
                    Procesando fotos… puede tardar unos segundos si son varias o vienen en formato
                    HEIC del iPhone.
                  </Text>
                )}

                {/* Las quitadas se borran al guardar; hasta entonces se pueden devolver. */}
                {removedMedia.length > 0 ? (
                  <View nativeID="servicio-fotos-quitadas" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 4 }}>
                    <Text style={{ color: COLORS.muted, fontSize: 12.5, fontWeight: "700", textAlign: "center" }}>
                      {removedMedia.length === 1 ? "1 foto quitada" : `${removedMedia.length} fotos quitadas`}: se borran al guardar los cambios.
                    </Text>
                    <Pressable onPress={deshacerQuitadas} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 8, justifyContent: "center", opacity: pressed ? 0.7 : 1 })}>
                      <Text style={{ color: COLORS.accent, fontWeight: "900", fontSize: 13 }}>Deshacer</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>

              {!!modalErr && <AdminNotice tone="danger" text={modalErr} />}
            </ScrollView>

            {/* Abajo y siempre a la vista: el botón principal y, a su derecha, la X para cerrar. */}
            <View style={{ padding: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border }}>
              <PieVentana nativeID="servicio-ventana-pie" onCerrar={closeModal}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton
                    label={saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear servicio"}
                    onPress={save}
                    disabled={saving}
                    fullWidth
                  />
                </View>
              </PieVentana>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Confirmar borrado de servicio */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(11,33,56,0.55)", padding: 16, justifyContent: "center" }}>
          <View style={{ ...modalColumnStyle, borderRadius: 20, backgroundColor: COLORS.bg, padding: 18, gap: 14 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>¿Borrar este servicio?</Text>
            <Text style={{ color: COLORS.muted, lineHeight: 19, textAlign: "center" }}>
              Se borrará «{deleteTarget?.title}» y sus fotos. Esta acción no se puede deshacer.
            </Text>
            <PieVentana onCerrar={() => setDeleteTarget(null)}>
              <View style={{ flex: 1 }}>
                <ChipButton label={deleting ? "Borrando…" : "Borrar"} onPress={confirmDelete} variant="danger" disabled={deleting} fullWidth />
              </View>
            </PieVentana>
          </View>
        </View>
      </Modal>

      {/* Confirmar borrado de solicitud */}
      <Modal visible={!!deleteRequestTarget} transparent animationType="fade" onRequestClose={() => setDeleteRequestTarget(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(11,33,56,0.55)", padding: 16, justifyContent: "center" }}>
          <View style={{ ...modalColumnStyle, borderRadius: 20, backgroundColor: COLORS.bg, padding: 18, gap: 14 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>¿Borrar esta solicitud?</Text>
            <Text style={{ color: COLORS.muted, lineHeight: 19, textAlign: "center" }}>
              Se borrará la solicitud de {deleteRequestTarget?.nombre}. Esta acción no se puede deshacer.
            </Text>
            <PieVentana onCerrar={() => setDeleteRequestTarget(null)}>
              <View style={{ flex: 1 }}>
                <ChipButton label="Borrar" onPress={confirmDeleteRequest} variant="danger" fullWidth />
              </View>
            </PieVentana>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
