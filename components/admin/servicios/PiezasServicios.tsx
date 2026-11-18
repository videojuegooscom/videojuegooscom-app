/**
 * Archivo: components/admin/servicios/PiezasServicios.tsx
 * Función: piezas comunes de Administración → Servicios: colores, tipos de servicios y solicitudes, textos de los estados
 *          y de las etapas del seguimiento, formas de pago, columnas, y los botones y campos del panel de Servicios.
 * Para qué sirve: que la pantalla (app/admin/services.tsx) y sus partes (vídeos, envío y cobro de reparaciones) usen las
 *          mismas piezas sin copiarlas. Se separó de app/admin/services.tsx en la tanda 6 de «ordenar el proyecto»
 *          (2026-11-18), sin cambiar nada.
 * Conectado con: constants/temaTienda.ts, components/admin/PiezasPanelAdmin.tsx, components/VisorFotos.tsx.
 * Utilizado por: app/admin/services.tsx y components/admin/servicios/*.
 * Dependencias: react, react-native, @expo/vector-icons.
 * Estado: ACTIVO
 */
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { type FotoVisor } from "../../VisorFotos";
import { type ModalidadServicio } from "../../ContratarServicioModal";
import { type Tono } from "../PiezasPanelAdmin";
import { COLORES_TEXTO, TACTIL } from "../../../constants/temaTienda";

export type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

export const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  cardSoft: "#F8FBFE",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: COLORES_TEXTO.secundario,
  muted2: COLORES_TEXTO.secundario,
  accent: "#1EA7E8",
  // Texto azul de menos de 17 px: azul oscuro; accent queda para iconos, bordes y fondos.
  accentText: COLORES_TEXTO.azulTexto,
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

export const columnStyle = { width: "100%", maxWidth: 1160, alignSelf: "center" } as const;
export const modalColumnStyle = { width: "100%", maxWidth: 560, alignSelf: "center" } as const;

// --- Tipos -------------------------------------------------------------

export type ServiceStatus = "DRAFT" | "PUBLISHED" | "REVIEW";

export type ServiceMediaRow = {
  id: string;
  service_id: string;
  storage_path: string | null;
  public_url: string | null;
  file_name: string | null;
  sort_order: number | null;
  is_cover: boolean | null;
};

export type ServiceRow = {
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

export type RequestStatus = "nuevo" | "revisado" | "contactado" | "descartado";
export type MetodoContacto = "whatsapp" | "gmail" | "instagram" | "facebook" | "tiktok";
type Disponibilidad = "manana" | "mediodia" | "tardenoche";

export type ServiceRequestRow = {
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
  // Con qué se pagó online, según Stripe: card, klarna o bizum (migración 20261111150000; puede no existir aún).
  pago_metodo?: string | null;
  etiqueta_pago_metodo?: string | null;
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

export const COLUMNAS_ENVIO =
  "entrega_modo,aparatos,codigo_postal,etiqueta_eur,etiqueta_peso_kg,etiqueta_path,etiqueta_pagada_en,condiciones_aceptadas_en,presupuesto_eur,presupuesto_aceptado_en,recepcion_fotos,espera_pieza_hasta";
// Parte 2: solo se piden si la base de datos ya las tiene (los ajustes traen garantia_meses), sin errores antes.
export const COLUMNAS_ENVIO_2 =
  "etiqueta_pago_modo,etiqueta_avisada_en,pago_estado,pago_modo,pagado_eur,pagado_en,pago_avisado_en,vuelta_seguimiento,diagnostico_resultado,oferta_compra_eur,vuelta_eur,sin_arreglo_eleccion,sin_arreglo_eleccion_en,entregado_en,garantia_de";
export const FORMAS_PAGO = [
  { value: "bizum", label: "Bizum" },
  { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta", label: "Tarjeta" },
] as const;
export const FORMA_PAGO_LABEL: Record<string, string> = { bizum: "Bizum", transferencia: "transferencia", tarjeta: "tarjeta", prueba: "tarjeta (de prueba)" };
// Pagado online (pago_modo «tarjeta» o «prueba»: la página de Stripe): con qué de verdad, si Stripe lo dijo (migración
// 20261111150000). «por Bizum online», «por Klarna online»…
export const COLUMNAS_METODO = "pago_metodo,etiqueta_pago_metodo";
const METODO_ONLINE_LABEL: Record<string, string> = { card: "tarjeta online", bizum: "Bizum online", klarna: "Klarna online" };
export function formaDePago(modo: string | null | undefined, metodo: string | null | undefined): string {
  if (!modo) return "";
  const online = (modo === "tarjeta" || modo === "prueba") && metodo ? METODO_ONLINE_LABEL[metodo] : null;
  return online ? `${online}${modo === "prueba" ? " (de prueba)" : ""}` : FORMA_PAGO_LABEL[modo] ?? modo;
}
export const hoyISO = () => new Date().toISOString().slice(0, 10);
export const BUCKET_REPARACIONES = "reparaciones";

// La pone api/asignar-seguimiento.ts al asignar un seguimiento desde el chat.
export const NOTA_ASIGNADO_CHAT = "Asignado desde el chat";

export type Seguimiento =
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

export const SEGUIMIENTO_ETAPAS: Seguimiento[] = [
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
export const SEGUIMIENTO_ETAPAS_RECOGIDA: Seguimiento[] = ["solicitado", "recibido", "diagnostico", "presupuesto", "esperando_pieza", "reparando", "listo", "entregado", "cancelado"];
export const SEGUIMIENTO_ETAPAS_ENVIO: Seguimiento[] = [
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

export const SEGUIMIENTO_LABEL: Record<Seguimiento, string> = {
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
export function faltaEsquema(error: any) {
  const code = String(error?.code ?? "");
  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(code);
}

export const STATUS_LABEL: Record<ServiceStatus, string> = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicado",
  REVIEW: "Por revisar",
};

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  nuevo: "Nueva",
  revisado: "Revisada",
  contactado: "Contactada",
  descartado: "Descartada",
};

// Etiqueta de color de cada estado (components/admin/PiezasPanelAdmin.tsx) y su nombre en plural para las pastillas.
export const REQUEST_STATUS_TONO: Record<RequestStatus, Tono> = { nuevo: "amarillo", revisado: "azul", contactado: "verde", descartado: "gris" };
export const REQUEST_STATUS_PLURAL: Record<RequestStatus, string> = { nuevo: "Nuevas", revisado: "Revisadas", contactado: "Contactadas", descartado: "Descartadas" };
// Las etapas en las que el aparato está en el taller («En reparación»).
export const ETAPAS_TALLER: Seguimiento[] = ["recibido", "diagnostico", "presupuesto", "esperando_pieza", "reparando"];
// Cifras de «Solicitudes» (filtran al tocarlas).
export type VistaSol = "ALL" | "abiertas" | "reparacion" | "listas" | "envio" | "por_cobrar" | "avisado" | "garantia";
// Pastillas del catálogo.
export type FiltroCatalogo = "todos" | "publicados" | "visibles" | "borradores" | "ocultos";

export const METODO_LABEL: Record<MetodoContacto, string> = {
  whatsapp: "WhatsApp",
  gmail: "Gmail",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

export const DISPONIBILIDAD_LABEL: Record<Disponibilidad, string> = {
  manana: "Mañana",
  mediodia: "Mediodía",
  tardenoche: "Tarde y noche",
};

export function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export function coverUrl(media: ServiceMediaRow[]): string | null {
  if (!media?.length) return null;
  const cover = media.find((m) => m.is_cover) ?? media[0];
  return cover?.public_url || null;
}

// Las fotos de un servicio para el visor (la portada primero, luego en su orden).
export function fotosDelServicio(media: ServiceMediaRow[]): FotoVisor[] {
  const conUrl = (media ?? []).filter((m) => !!m.public_url);
  const portada = conUrl.find((m) => m.is_cover) ?? conUrl[0];
  return [...(portada ? [portada] : []), ...conUrl.filter((m) => m !== portada)].map((m) => ({ id: m.id, url: m.public_url as string }));
}

export const PESTANAS_SERVICIOS = [
  { key: "catalogo" as const, label: "Catálogo" },
  { key: "solicitudes" as const, label: "Solicitudes" },
];
export const ORDEN_PESTANAS = PESTANAS_SERVICIOS.map((p) => p.key);

// --- Piezas visuales compartidas ----------------------------------------

export function ChipButton({
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
        minHeight: TACTIL.minimo,
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

export function TextField({
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
