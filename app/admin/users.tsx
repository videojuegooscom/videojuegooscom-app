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
 *   cualquiera igual que las reseñas de Inicio). Debajo, «Reseñas (30 días)»:
 *   las publicadas, cuántas usan las ideas sugeridas o un emoji propuesto y la
 *   idea más usada (analítica propia «resena_publicada»,
 *   components/ReviewModal.tsx).
 * - «Ideas de mejora» (arriba): lo que mandan los clientes desde «Mejoras en la
 *   tienda» (Blue, el pie de página o Mi cuenta; tabla mejoras_tienda, migración
 *   20261101200000_mejoras_tienda.sql). Primero las sin leer, con quién la manda
 *   (nombre/usuario o correo, enlace a su ficha), la fecha y desde dónde; el
 *   botón de 44 px la marca como leída (o sin leer). Contadores que filtran
 *   (sin leer, todas, por sitio) y, de 30 días, las enviadas y cuántas veces se
 *   abrió la cajita y desde dónde (analítica propia «mejora_abierta»). Sin la
 *   migración, una línea dice que falta aplicarla.
 * - «Recuperar contraseña (30 días)»: enlaces pedidos, abiertos, contraseñas
 *   cambiadas, enlaces que no sirvieron (en otro navegador, caducados) y los
 *   que no se pudieron pedir; si Supabase frena correos por su límite, un
 *   aviso en rojo de que hace falta el correo propio (SMTP). Analítica propia
 *   contrasena_* de app/(tabs)/perfil.tsx y app/reset-password.tsx.
 * - "Moderación del Foro": con el registro de moderación (tabla
 *   foro_moderacion, que rellena la base de datos sola), los mensajes y
 *   comentarios eliminados y los silencios de los últimos 30 días, y cuántos
 *   están silenciados ahora; debajo, «Silenciados en el Foro» (hasta cuándo,
 *   por qué y «Quitar silencio»). Sin esa migración, solo los comentarios de
 *   noticias eliminados (ocultos). Se modera desde el propio Foro: tocar el
 *   mensaje → papelera o «Silenciar». Lo que hace un administrador no se
 *   cuenta con la analítica propia (lib/analytics.ts no le registra).
 * - "«Mis seguimientos» (30 días)": personas distintas que abrieron esa
 *   pestaña de Perfil y cuántas lo hicieron deslizando (analítica propia
 *   seguimientos_abiertos, solo de quien aceptó la analítica).
 * - Buscador: filtra la lista ya cargada por email (no vuelve a pedir nada a
 *   Supabase, la lista de usuarios registrados no suele ser tan grande).
 * - Orden: por fecha de alta (más recientes primero, por defecto) o por
 *   participación total (suma de los tres contadores), para ver primero a
 *   quien más interactúa con la tienda.
 * - PERFILES (seguimiento de «Mi perfil», lo que cada cliente rellena en Mi cuenta, obligatorio
 *   al iniciar sesión: foto opcional, nombre, usuario, país, provincia y edad): se leen de
 *   perfiles_cliente (el administrador las ve todas, por su política; migración
 *   20261030150000_perfiles_cliente_completo.sql). Salen contadores (con perfil, completos,
 *   clientes con datos pendientes, con foto, edad media, provincias), chips por estado (completo,
 *   faltan datos, con foto), tramo de edad, provincia y país que a la vez FILTRAN la lista, y
 *   cuántos vieron, completaron o abandonaron «Completa tu perfil» en los últimos 30 días
 *   (analítica propia: perfil_obligatorio_visto / perfil_guardado / perfil_obligatorio_salir,
 *   solo de quien no rechazó la analítica), y cuántos encuadraron su foto o dejaron el recorte a
 *   medias (perfil_foto_encuadrada / perfil_foto_cancelada). Cada fila lleva la foto, el resumen y qué le falta;
 *   el buscador también encuentra por nombre, usuario, provincia o país (y código postal o localidad). DIRECCIÓN DE
 *   ENVÍO (opcional, Mi perfil): contador «Con dirección», chip que filtra, «CP 50410 Cuarte…» en el resumen de cada
 *   fila y, de 30 días, quién la guarda y quién paga con ella ya rellenada (perfil_direccion_guardada /
 *   pago_direccion_perfil); sin las columnas (migración 20261102120000) no sale nada de esto. Si la tabla aún no existe
 *   esta parte no se enseña y el resto funciona igual. La edad sale de la fecha de nacimiento
 *   (no se enseña la fecha). Lee hasta 5.000 perfiles.
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
import SmartImage from "../../components/SmartImage";
import { ORIGENES_MEJORA, SUGERENCIAS_RESENA, type OrigenMejora } from "../../components/ReviewModal";

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

// Datos que cada cliente escribe en «Mi cuenta» → Mi perfil (tabla perfiles_cliente).
type PerfilRow = {
  user_id: string;
  nombre: string;
  usuario: string;
  pais: string;
  provincia: string;
  fecha_nacimiento: string;
  foto_url: string;
  updated_at: string;
  // Dirección de envío (opcional; migración 20261102120000_perfiles_direccion.sql).
  codigo_postal: string;
  localidad: string;
  direccion: string;
  piso: string;
};

// Filtro por estado del perfil.
type EstadoPerfil = "completo" | "pendiente" | "foto" | "direccion";

// Tiene una dirección de envío entera (la que rellena el pago).
const conDireccionDeEnvio = (p: PerfilRow | undefined) => !!p && !!p.direccion && !!p.codigo_postal;

// Lo que mide la analítica propia de «Completa tu perfil» (components/PerfilPublico.tsx).
const EVENTOS_PERFIL = [
  "perfil_obligatorio_visto",
  "perfil_guardado",
  "perfil_obligatorio_salir",
  "perfil_foto_encuadrada",
  "perfil_foto_cancelada",
  // Dirección de envío: quién la guarda en Mi perfil y quién paga con ella ya rellenada (app/checkout.tsx).
  "perfil_direccion_guardada",
  "pago_direccion_perfil",
] as const;

// Perfil → «Mis seguimientos» (app/(tabs)/perfil.tsx): quién lo abre y si lo hace deslizando o tocando la pestaña.
// (Lo que hace un administrador no se mide con la analítica propia, que no le cuenta: la moderación del Foro se cuenta
// con datos de la base de datos.)
const EVENTOS_SEGUIMIENTOS = ["seguimientos_abiertos"] as const;
// Foro: quién abre las Normas del Foro desde el aviso de silencio (app/(tabs)/chat-global.tsx). Las abre el cliente
// silenciado, así que sí lo cuenta la analítica propia (si la aceptó).
const EVENTOS_FORO = ["foro_normas_abiertas"] as const;
// Reseñas publicadas desde «Dejar una reseña» (components/ReviewModal.tsx): con qué ideas y si llevan emojis propuestos.
const EVENTOS_RESENAS = ["resena_publicada"] as const;
// «Mejoras en la tienda» (components/ReviewModal.tsx): cuántas veces se abre la cajita y desde dónde (las enviadas se
// cuentan con la propia tabla, que es exacta).
const EVENTOS_MEJORAS = ["mejora_abierta"] as const;
// «¿Olvidaste tu contraseña?» (app/(tabs)/perfil.tsx y app/reset-password.tsx): enlaces pedidos, los que no se pudieron
// pedir (y por qué), abiertos, los que no sirvieron (y por qué) y contraseñas cambiadas. Nunca el correo.
const EVENTOS_CONTRASENA = [
  "contrasena_enlace_pedido",
  "contrasena_enlace_error",
  "contrasena_enlace_abierto",
  "contrasena_enlace_invalido",
  "contrasena_cambiada",
] as const;
type UsoContrasena = {
  pedidos: number;
  errores: number;
  limite: number;
  abiertos: number;
  noSirvieron: number;
  otroNavegador: number;
  caducados: number;
  cambiadas: number;
};

// Una idea de «Mejoras en la tienda» (tabla mejoras_tienda, migración 20261101200000_mejoras_tienda.sql).
type MejoraRow = { id: string; user_id: string; created_at: string; texto: string; origen: OrigenMejora; leida: boolean; leida_en: string | null };

type SortMode = "recent" | "participation";

// Tramos de edad para contar y filtrar.
const TRAMOS_EDAD: { id: string; label: string; min: number; max: number }[] = [
  { id: "14-17", label: "14–17", min: 14, max: 17 },
  { id: "18-24", label: "18–24", min: 18, max: 24 },
  { id: "25-34", label: "25–34", min: 25, max: 34 },
  { id: "35-44", label: "35–44", min: 35, max: 44 },
  { id: "45+", label: "45 o más", min: 45, max: 150 },
];

// Edad cumplida a partir de «AAAA-MM-DD» (null si no hay fecha o no es válida).
function edadDe(fecha: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return null;
  const [a, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const hoy = new Date();
  let edad = hoy.getFullYear() - a;
  if (hoy.getMonth() + 1 < mes || (hoy.getMonth() + 1 === mes && hoy.getDate() < dia)) edad -= 1;
  return edad >= 0 && edad < 150 ? edad : null;
}

// Un perfil está completo con los cinco datos obligatorios (la foto es opcional).
function perfilCompleto(p: PerfilRow | undefined): boolean {
  return !!p && !!p.nombre && !!p.usuario && !!p.pais && !!p.provincia && edadDe(p.fecha_nacimiento) !== null;
}

// Qué le falta (para la fila de cada cliente): «Faltan: provincia, edad».
function faltaDelPerfil(p: PerfilRow | undefined): string[] {
  if (!p) return ["todo"];
  return [
    !p.usuario ? "usuario" : "",
    !p.nombre ? "nombre" : "",
    !p.pais ? "país" : "",
    !p.provincia ? "provincia" : "",
    edadDe(p.fecha_nacimiento) === null ? "edad" : "",
  ].filter(Boolean);
}

// «Dani · @dani · Zaragoza (España) · 22 años», o «Perfil sin completar».
function resumenDePerfil(p: PerfilRow | undefined): string {
  if (!p) return "Perfil sin completar";
  const edad = edadDe(p.fecha_nacimiento);
  const lugar = p.provincia && p.pais ? `${p.provincia} (${p.pais})` : p.provincia || p.pais;
  // Con dirección de envío, su código postal y localidad (para ver de un vistazo quién está en la zona de reparto).
  const envio = conDireccionDeEnvio(p) ? `CP ${[p.codigo_postal, p.localidad].filter(Boolean).join(" ")}` : "";
  const partes = [p.nombre, p.usuario ? `@${p.usuario}` : "", lugar, edad !== null ? `${edad} años` : "", envio].filter(Boolean);
  return partes.length ? partes.join(" · ") : "Perfil sin completar";
}

// Cuántos hay de cada valor, de más a menos (para los contadores que también sirven de filtro).
function contarPor(valores: string[]): { valor: string; n: number }[] {
  const mapa = new Map<string, number>();
  for (const v of valores) if (v) mapa.set(v, (mapa.get(v) ?? 0) + 1);
  return [...mapa.entries()].map(([valor, n]) => ({ valor, n })).sort((a, b) => b.n - a.n || a.valor.localeCompare(b.valor, "es"));
}

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
  // Reseñas publicadas en 30 días según la analítica propia: con ideas sugeridas, con emojis y la idea más usada.
  const [usoResenas, setUsoResenas] = useState<{ publicadas: number; conIdeas: number; conEmoji: number; ideaMasUsada: string | null } | null>(null);
  const [reviewsCount, setReviewsCount] = useState(0);

  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");

  // Perfiles de los clientes (nombre, usuario, país, provincia y edad) y filtros. `perfilesOk` = la tabla existe
  // (si la migración aún no está aplicada, esta parte no se enseña y el resto de la pantalla funciona igual).
  const [perfiles, setPerfiles] = useState<Record<string, PerfilRow>>({});
  const [perfilesOk, setPerfilesOk] = useState(false);
  // ¿Existen ya las columnas de la dirección de envío? (se sabe por las filas; sin ellas no se enseña nada de la dirección)
  const [direccionColumnas, setDireccionColumnas] = useState(false);
  const [filtroProvincia, setFiltroProvincia] = useState<string | null>(null);
  const [filtroPais, setFiltroPais] = useState<string | null>(null);
  const [filtroTramo, setFiltroTramo] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<EstadoPerfil | null>(null);
  // «Completa tu perfil» en los últimos 30 días: personas distintas que la vieron, la completaron o cerraron sesión.
  const [embudoPerfil, setEmbudoPerfil] = useState<{
    vistos: number;
    completados: number;
    salieron: number;
    fotosEncuadradas: number;
    fotosCanceladas: number;
    direccionGuardada: number;
    pagoConDireccion: number;
  } | null>(null);
  // Moderación del Foro: comentarios de noticias eliminados (ocultos, contados en la base de datos). null = no se ha podido
  // leer. (Los mensajes del Foro eliminados se borran: no quedan en ninguna tabla que contar.)
  const [comentariosEliminados, setComentariosEliminados] = useState<number | null>(null);
  // Registro de moderación (tabla foro_moderacion, 30 días) y silencios en vigor (foro_silencios). null = la migración
  // del Foro aún no está aplicada: entonces sale solo lo de arriba.
  const [moderacion, setModeracion] = useState<{ mensajes: number; comentarios: number; silencios: number } | null>(null);
  const [silenciados, setSilenciados] = useState<{ user_id: string; hasta: string; motivo: string | null }[] | null>(null);
  const [quitandoSilencio, setQuitandoSilencio] = useState<string | null>(null);
  // «Mis seguimientos» en los últimos 30 días: personas distintas que lo abrieron y, de ellas, cuántas deslizando.
  const [usoSeguimientos, setUsoSeguimientos] = useState<{ personas: number; deslizando: number } | null>(null);
  // Personas distintas que abrieron las Normas del Foro desde el aviso de silencio (30 días). null = sin analítica.
  const [normasLeidas, setNormasLeidas] = useState<number | null>(null);
  // Números de seguimiento añadidos a una cuenta en Perfil → «Mis seguimientos» y los intentos fallidos (30 días), con la
  // tabla seguimiento_intentos (datos de la base de datos). null = la migración 20261031170000 aún no está aplicada.
  const [numerosSeguimiento, setNumerosSeguimiento] = useState<{ anadidos: number; fallidos: number; personas: number } | null>(null);
  // Ideas de «Mejoras en la tienda». null = la migración aún no está aplicada (se avisa y el resto funciona igual).
  const [mejoras, setMejoras] = useState<MejoraRow[] | null>(null);
  const [filtroMejoras, setFiltroMejoras] = useState<"sin-leer" | "todas">("sin-leer");
  const [filtroOrigen, setFiltroOrigen] = useState<OrigenMejora | null>(null);
  const [marcandoMejora, setMarcandoMejora] = useState<string | null>(null);
  // Cuántas veces se abrió la cajita en 30 días (analítica propia), por cuántas personas y desde dónde.
  const [usoMejoras, setUsoMejoras] = useState<{ abiertas: number; personas: number; porOrigen: Record<OrigenMejora, number> } | null>(null);
  // «Recuperar contraseña» en 30 días (analítica propia). null = sin analítica.
  const [usoContrasena, setUsoContrasena] = useState<UsoContrasena | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setScreenErr(null);

    try {
      const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [usersRes, sellRes, serviceRes, reviewsRes, perfilesConFoto, eventosRes, comentariosOcultosRes, moderacionRes, silenciosRes, intentosRes, mejorasRes] = await Promise.all([
        supabase.rpc("admin_list_users_with_stats"),
        supabase.from("sell_requests").select("id", { count: "exact", head: true }),
        supabase.from("service_requests").select("id", { count: "exact", head: true }),
        supabase.from("store_reviews").select("rating"),
        // El administrador puede leer todos (política de la tabla). Si la tabla no existe todavía, no es un error de la pantalla.
        // «*»: funciona antes y después de cada migración del perfil (foto, dirección…) sin pedir columnas que no existan.
        supabase.from("perfiles_cliente").select("*").limit(5000),
        supabase
          .from("analytics_events")
          .select("event_name,user_id,session_id,metadata")
          .in("event_name", [...EVENTOS_PERFIL, ...EVENTOS_SEGUIMIENTOS, ...EVENTOS_FORO, ...EVENTOS_RESENAS, ...EVENTOS_MEJORAS, ...EVENTOS_CONTRASENA])
          .gte("created_at", desde)
          .limit(5000),
        supabase.from("noticias_comentarios").select("id", { count: "exact", head: true }).eq("oculto", true),
        supabase.from("foro_moderacion").select("accion").gte("created_at", desde).limit(5000),
        supabase.from("foro_silencios").select("user_id,hasta,motivo").gt("hasta", new Date().toISOString()).order("hasta", { ascending: true }),
        supabase.from("seguimiento_intentos").select("user_id,acierto").gte("created_at", desde).limit(5000),
        supabase.from("mejoras_tienda").select("*").order("created_at", { ascending: false }).limit(500),
      ]);
      setMejoras(
        mejorasRes.error
          ? null
          : ((mejorasRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
              id: String(r.id ?? ""),
              user_id: String(r.user_id ?? ""),
              created_at: String(r.created_at ?? ""),
              texto: String(r.texto ?? ""),
              origen: (["blue", "pie", "perfil"].includes(String(r.origen)) ? r.origen : "blue") as OrigenMejora,
              leida: r.leida === true,
              leida_en: typeof r.leida_en === "string" ? r.leida_en : null,
            }))
      );
      if (intentosRes.error) {
        setNumerosSeguimiento(null);
      } else {
        const intentos = (intentosRes.data ?? []) as { user_id: string; acierto: boolean }[];
        setNumerosSeguimiento({
          anadidos: intentos.filter((i) => i.acierto).length,
          fallidos: intentos.filter((i) => !i.acierto).length,
          personas: new Set(intentos.filter((i) => i.acierto).map((i) => i.user_id)).size,
        });
      }
      setComentariosEliminados(comentariosOcultosRes.error ? null : comentariosOcultosRes.count ?? 0);
      if (moderacionRes.error) {
        setModeracion(null);
      } else {
        const acciones = ((moderacionRes.data ?? []) as { accion: string }[]).map((x) => x.accion);
        setModeracion({
          mensajes: acciones.filter((a) => a === "mensaje_eliminado").length,
          comentarios: acciones.filter((a) => a === "comentario_eliminado").length,
          silencios: acciones.filter((a) => a === "silenciado").length,
        });
      }
      setSilenciados(
        silenciosRes.error ? null : ((silenciosRes.data ?? []) as { user_id: string; hasta: string; motivo: string | null }[])
      );
      if (eventosRes.error) {
        setUsoSeguimientos(null);
        setNormasLeidas(null);
        setUsoResenas(null);
        setUsoMejoras(null);
        setUsoContrasena(null);
      } else {
        // «Recuperar contraseña»: cuántas veces pasa cada cosa (y por qué fallan), sin datos de nadie.
        const deContrasena = ((eventosRes.data ?? []) as { event_name: string; metadata: { motivo?: unknown } | null }[]).filter((e) =>
          (EVENTOS_CONTRASENA as readonly string[]).includes(e.event_name)
        );
        const cuenta = (nombre: string, motivo?: string) =>
          deContrasena.filter((e) => e.event_name === nombre && (!motivo || String(e.metadata?.motivo ?? "") === motivo)).length;
        setUsoContrasena({
          pedidos: cuenta("contrasena_enlace_pedido"),
          errores: cuenta("contrasena_enlace_error"),
          limite: cuenta("contrasena_enlace_error", "limite"),
          abiertos: cuenta("contrasena_enlace_abierto"),
          noSirvieron: cuenta("contrasena_enlace_invalido"),
          otroNavegador: cuenta("contrasena_enlace_invalido", "otro_navegador"),
          caducados: cuenta("contrasena_enlace_invalido", "caducado"),
          cambiadas: cuenta("contrasena_cambiada"),
        });
        // «Mejoras en la tienda»: veces que se abrió la cajita, personas distintas y desde dónde.
        const abiertas = ((eventosRes.data ?? []) as { event_name: string; user_id: string | null; session_id: string | null; metadata: { origen?: unknown } | null }[]).filter(
          (e) => e.event_name === "mejora_abierta"
        );
        const porOrigen: Record<OrigenMejora, number> = { blue: 0, pie: 0, perfil: 0 };
        for (const e of abiertas) {
          const o = String(e.metadata?.origen ?? "") as OrigenMejora;
          if (o in porOrigen) porOrigen[o] += 1;
        }
        setUsoMejoras({ abiertas: abiertas.length, personas: new Set(abiertas.map((e) => e.user_id || e.session_id || "").filter(Boolean)).size, porOrigen });
        type FilaUso = { event_name: string; user_id: string | null; session_id: string | null; metadata: { como?: unknown } | null };
        const filas = (eventosRes.data ?? []) as FilaUso[];
        const aperturas = filas.filter((e) => e.event_name === "seguimientos_abiertos");
        const quien = (e: FilaUso) => e.user_id || e.session_id || "";
        setUsoSeguimientos({
          personas: new Set(aperturas.map(quien).filter(Boolean)).size,
          deslizando: new Set(aperturas.filter((e) => e.metadata?.como === "deslizar").map(quien).filter(Boolean)).size,
        });
        setNormasLeidas(new Set(filas.filter((e) => e.event_name === "foro_normas_abiertas").map(quien).filter(Boolean)).size);
        // Reseñas: cuántas se publican, cuántas con ideas o con emojis propuestos y la idea más usada.
        const resenas = filas
          .filter((e) => e.event_name === "resena_publicada")
          .map((e) => (e.metadata ?? {}) as { sugerencias?: unknown; emojis?: unknown });
        const usos: Record<string, number> = {};
        for (const r of resenas) {
          for (const id of Array.isArray(r.sugerencias) ? r.sugerencias : []) usos[String(id)] = (usos[String(id)] ?? 0) + 1;
        }
        const masUsada = Object.entries(usos).sort((a, b) => b[1] - a[1])[0]?.[0];
        setUsoResenas({
          publicadas: resenas.length,
          conIdeas: resenas.filter((r) => Array.isArray(r.sugerencias) && r.sugerencias.length > 0).length,
          conEmoji: resenas.filter((r) => Number(r.emojis) > 0).length,
          ideaMasUsada: SUGERENCIAS_RESENA.find((s) => s.id === masUsada)?.etiqueta ?? null,
        });
      }
      // Tabla creada con la migración antigua (sin foto): se pide sin esas columnas.
      const perfilesRes =
        perfilesConFoto.error && /foto_url|updated_at/.test(String(perfilesConFoto.error.message ?? ""))
          ? await supabase.from("perfiles_cliente").select("user_id,nombre,usuario,pais,provincia,fecha_nacimiento").limit(5000)
          : perfilesConFoto;

      if (eventosRes.error) {
        setEmbudoPerfil(null);
      } else {
        const personas = (nombre: string) =>
          new Set(
            ((eventosRes.data ?? []) as { event_name: string; user_id: string | null; session_id: string | null }[])
              .filter((e) => e.event_name === nombre)
              .map((e) => e.user_id || e.session_id || "")
              .filter(Boolean)
          ).size;
        setEmbudoPerfil({
          vistos: personas("perfil_obligatorio_visto"),
          completados: personas("perfil_guardado"),
          salieron: personas("perfil_obligatorio_salir"),
          fotosEncuadradas: personas("perfil_foto_encuadrada"),
          fotosCanceladas: personas("perfil_foto_cancelada"),
          direccionGuardada: personas("perfil_direccion_guardada"),
          pagoConDireccion: personas("pago_direccion_perfil"),
        });
      }

      if (perfilesRes.error) {
        setPerfilesOk(false);
        setPerfiles({});
      } else {
        const mapa: Record<string, PerfilRow> = {};
        setDireccionColumnas(((perfilesRes.data ?? []) as Record<string, unknown>[]).some((r) => "codigo_postal" in r));
        for (const r of (perfilesRes.data ?? []) as Record<string, unknown>[]) {
          const id = String(r.user_id ?? "");
          if (!id) continue;
          const t = (v: unknown) => (typeof v === "string" ? v.trim() : "");
          mapa[id] = {
            user_id: id,
            nombre: t(r.nombre),
            usuario: t(r.usuario),
            pais: t(r.pais),
            provincia: t(r.provincia),
            fecha_nacimiento: t(r.fecha_nacimiento),
            foto_url: t(r.foto_url),
            updated_at: t(r.updated_at),
            codigo_postal: t(r.codigo_postal),
            localidad: t(r.localidad),
            direccion: t(r.direccion),
            piso: t(r.piso),
          };
        }
        setPerfiles(mapa);
        setPerfilesOk(true);
      }

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

  // Marcar una idea de mejora como leída (o volver a dejarla sin leer).
  const marcarMejora = useCallback(async (id: string, leida: boolean) => {
    setMarcandoMejora(id);
    const leidaEn = leida ? new Date().toISOString() : null;
    const { data, error } = await supabase.from("mejoras_tienda").update({ leida, leida_en: leidaEn }).eq("id", id).select("id");
    setMarcandoMejora(null);
    if (!error && Array.isArray(data) && data.length) {
      setMejoras((prev) => (prev ?? []).map((m) => (m.id === id ? { ...m, leida, leida_en: leidaEn } : m)));
    }
  }, []);

  // Ideas de mejora: contadores (también sirven de filtro) y las que se ven con los filtros puestos.
  const resumenMejoras = useMemo(() => {
    const lista = mejoras ?? [];
    const hace30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const porOrigen: Record<OrigenMejora, number> = { blue: 0, pie: 0, perfil: 0 };
    for (const m of lista) porOrigen[m.origen] += 1;
    return {
      total: lista.length,
      sinLeer: lista.filter((m) => !m.leida).length,
      enviadas30: lista.filter((m) => new Date(m.created_at).getTime() >= hace30).length,
      personas: new Set(lista.map((m) => m.user_id)).size,
      porOrigen,
    };
  }, [mejoras]);
  const mejorasVisibles = useMemo(
    () => (mejoras ?? []).filter((m) => (filtroMejoras === "todas" || !m.leida) && (!filtroOrigen || m.origen === filtroOrigen)),
    [mejoras, filtroMejoras, filtroOrigen]
  );

  // Quitar el silencio de alguien del Foro: se pone «hasta» en este momento (queda en el registro de moderación).
  const quitarSilencio = useCallback(async (userId: string) => {
    setQuitandoSilencio(userId);
    const { data, error } = await supabase
      .from("foro_silencios")
      .update({ hasta: new Date().toISOString() })
      .eq("user_id", userId)
      .select("user_id");
    setQuitandoSilencio(null);
    if (!error && Array.isArray(data) && data.length) {
      setSilenciados((prev) => (prev ?? []).filter((s) => s.user_id !== userId));
    }
  }, []);

  const stats = useMemo(() => {
    const total = users.length;
    const admins = users.filter((u) => (u.role ?? "").toLowerCase() === "admin").length;
    const active = users.filter((u) => totalParticipation(u) > 0).length;
    return { total, admins, active };
  }, [users]);

  // Contadores del perfil (solo de las cuentas que hay ahora en la lista).
  const resumenPerfiles = useMemo(() => {
    const delosUsuarios = users.map((u) => perfiles[u.user_id]).filter((p): p is PerfilRow => !!p);
    const conAlgo = delosUsuarios.filter((p) => p.nombre || p.usuario || p.pais || p.provincia || p.fecha_nacimiento).length;
    const completos = delosUsuarios.filter((p) => perfilCompleto(p)).length;
    const porProvincia = contarPor(delosUsuarios.map((p) => p.provincia));
    const porPais = contarPor(delosUsuarios.map((p) => p.pais));
    const porTramo = TRAMOS_EDAD.map((t) => ({
      ...t,
      n: delosUsuarios.filter((p) => {
        const e = edadDe(p.fecha_nacimiento);
        return e !== null && e >= t.min && e <= t.max;
      }).length,
    }));
    const edades = delosUsuarios.map((p) => edadDe(p.fecha_nacimiento)).filter((e): e is number => e !== null);
    const media = edades.length ? edades.reduce((a, b) => a + b, 0) / edades.length : null;
    // Clientes (no administradores) a los que aún les sale «Completa tu perfil».
    const pendientes = users.filter((u) => (u.role ?? "").toLowerCase() !== "admin" && !perfilCompleto(perfiles[u.user_id])).length;
    const conFoto = delosUsuarios.filter((p) => !!p.foto_url).length;
    const conDireccion = delosUsuarios.filter((p) => conDireccionDeEnvio(p)).length;
    return { conAlgo, completos, pendientes, conFoto, conDireccion, porProvincia, porPais, porTramo, media };
  }, [users, perfiles]);

  const hayFiltros = !!filtroProvincia || !!filtroPais || !!filtroTramo || !!filtroEstado;

  const visibleUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const tramo = TRAMOS_EDAD.find((t) => t.id === filtroTramo) ?? null;
    const filtered = users.filter((u) => {
      const p = perfiles[u.user_id];
      if (filtroProvincia && p?.provincia !== filtroProvincia) return false;
      if (filtroPais && p?.pais !== filtroPais) return false;
      if (filtroEstado === "completo" && !perfilCompleto(p)) return false;
      if (filtroEstado === "pendiente" && ((u.role ?? "").toLowerCase() === "admin" || perfilCompleto(p))) return false;
      if (filtroEstado === "foto" && !p?.foto_url) return false;
      if (filtroEstado === "direccion" && !conDireccionDeEnvio(p)) return false;
      if (tramo) {
        const e = p ? edadDe(p.fecha_nacimiento) : null;
        if (e === null || e < tramo.min || e > tramo.max) return false;
      }
      if (!q) return true;
      const texto = [u.email, p?.nombre, p?.usuario, p?.provincia, p?.pais, p?.codigo_postal, p?.localidad].filter(Boolean).join(" ").toLowerCase();
      return texto.includes(q);
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortMode === "participation") return totalParticipation(b) - totalParticipation(a);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return sorted;
  }, [users, perfiles, search, sortMode, filtroProvincia, filtroPais, filtroTramo, filtroEstado]);

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

            {/* «Mejoras en la tienda»: las ideas que mandan los clientes (desde Blue, el pie de página o Mi cuenta). Primero
                las que no se han leído; los contadores también filtran. Tocar el nombre lleva a la ficha del cliente. */}
            {mejoras === null ? (
              <Text nativeID="admin-mejoras" style={{ color: COLORS.muted, fontWeight: "700", fontSize: 12.5, lineHeight: 18, textAlign: "center" }}>
                Ideas de mejora: falta aplicar en Supabase la migración 20261101200000_mejoras_tienda.sql. Hasta entonces, la cajita
                de la tienda dice que muy pronto se podrán enviar.
              </Text>
            ) : (
              <View nativeID="admin-mejoras" style={{ gap: 10 }}>
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>
                  Ideas de mejora{resumenMejoras.sinLeer ? ` · ${resumenMejoras.sinLeer} sin leer` : ""}
                </Text>
                <Text nativeID="admin-mejoras-uso" style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12.5, lineHeight: 18, textAlign: "center" }}>
                  Últimos 30 días: {resumenMejoras.enviadas30} {resumenMejoras.enviadas30 === 1 ? "idea enviada" : "ideas enviadas"}
                  {usoMejoras
                    ? ` · abrieron la cajita ${usoMejoras.abiertas} ${usoMejoras.abiertas === 1 ? "vez" : "veces"} (${usoMejoras.personas} ${
                        usoMejoras.personas === 1 ? "persona" : "personas"
                      }): Blue ${usoMejoras.porOrigen.blue} · pie de página ${usoMejoras.porOrigen.pie} · Mi cuenta ${usoMejoras.porOrigen.perfil}`
                    : ""}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                  <ChipButton label={`Sin leer (${resumenMejoras.sinLeer})`} active={filtroMejoras === "sin-leer"} onPress={() => setFiltroMejoras("sin-leer")} isMobile={isMobile} />
                  <ChipButton label={`Todas (${resumenMejoras.total})`} active={filtroMejoras === "todas"} onPress={() => setFiltroMejoras("todas")} isMobile={isMobile} />
                  {(Object.keys(ORIGENES_MEJORA) as OrigenMejora[]).map((o) => (
                    <ChipButton
                      key={o}
                      label={`${ORIGENES_MEJORA[o]} (${resumenMejoras.porOrigen[o]})`}
                      active={filtroOrigen === o}
                      onPress={() => setFiltroOrigen((v) => (v === o ? null : o))}
                      isMobile={isMobile}
                    />
                  ))}
                </View>
                {mejorasVisibles.length === 0 ? (
                  <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 20 }}>
                    {resumenMejoras.total === 0
                      ? "Todavía nadie ha mandado ideas. Se envían desde Blue, el pie de página y Mi cuenta."
                      : "No hay ideas con este filtro: estás al día."}
                  </Text>
                ) : (
                  mejorasVisibles.slice(0, 60).map((m) => {
                    const p = perfiles[m.user_id];
                    const u = users.find((x) => x.user_id === m.user_id);
                    const quien = p?.nombre || p?.usuario ? [p?.nombre, p?.usuario ? `@${p.usuario}` : ""].filter(Boolean).join(" · ") : u?.email ?? "Cliente";
                    return (
                      <View
                        key={m.id}
                        nativeID={`mejora-${m.id}`}
                        style={{
                          flexDirection: "row",
                          gap: 10,
                          alignItems: "flex-start",
                          borderRadius: 16,
                          borderWidth: 1,
                          borderColor: m.leida ? COLORS.border : COLORS.accentBorder,
                          backgroundColor: m.leida ? COLORS.card : COLORS.accent2,
                          padding: 12,
                        }}
                      >
                        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                          <Text style={{ color: COLORS.text, fontSize: 14, lineHeight: 20, fontWeight: m.leida ? "600" : "800" }}>{m.texto}</Text>
                          <Pressable
                            onPress={() =>
                              router.push({
                                pathname: "/admin/cliente/[userId]",
                                params: { userId: m.user_id, email: u?.email ?? "", createdAt: u?.created_at ?? "" },
                              } as any)
                            }
                            accessibilityRole="link"
                            accessibilityLabel={`Ver la ficha de ${quien}`}
                            style={({ pressed }) => ({ minHeight: 32, justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
                          >
                            <Text style={{ color: COLORS.muted, fontSize: 12, fontWeight: "700" }}>
                              <Text style={{ color: COLORS.text, fontWeight: "900", textDecorationLine: "underline" }}>{quien}</Text> · {fmtDate(m.created_at)} · desde{" "}
                              {ORIGENES_MEJORA[m.origen]}
                            </Text>
                          </Pressable>
                        </View>
                        <Pressable
                          onPress={() => marcarMejora(m.id, !m.leida)}
                          disabled={marcandoMejora === m.id}
                          accessibilityRole="button"
                          accessibilityLabel={m.leida ? "Marcar como no leída" : "Marcar como leída"}
                          {...({ title: m.leida ? "Marcar como no leída" : "Marcar como leída" } as object)}
                          style={({ pressed }) => ({
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            alignItems: "center",
                            justifyContent: "center",
                            borderWidth: 1,
                            borderColor: m.leida ? COLORS.border : COLORS.accent,
                            backgroundColor: m.leida ? "#FFFFFF" : COLORS.accent,
                            opacity: marcandoMejora === m.id ? 0.5 : pressed ? 0.85 : 1,
                          })}
                        >
                          <Ionicons name={m.leida ? "mail-unread-outline" : "checkmark"} size={20} color={m.leida ? COLORS.text : "#FFFFFF"} />
                        </Pressable>
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {/* Moderación del Foro: lo que eliminan o silencian los administradores (tocando un mensaje en el Foro). Con el
                registro de moderación, cuenta los últimos 30 días; sin él, solo los comentarios ocultos. */}
            {moderacion ? (
              <Text nativeID="admin-foro-moderacion" style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12.5, lineHeight: 18, textAlign: "center" }}>
                Moderación del Foro (30 días) · mensajes eliminados: {moderacion.mensajes} · comentarios eliminados: {moderacion.comentarios} ·
                silencios: {moderacion.silencios} · silenciados ahora: {silenciados?.length ?? 0}
                {normasLeidas !== null ? ` · leyeron las normas desde el aviso: ${normasLeidas}` : ""}
              </Text>
            ) : comentariosEliminados !== null ? (
              <Text nativeID="admin-foro-moderacion" style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12.5, lineHeight: 18, textAlign: "center" }}>
                Moderación del Foro · comentarios de noticias eliminados: {comentariosEliminados}
              </Text>
            ) : null}
            {/* Las Normas del Foro (las que enlaza el aviso de silencio) se editan en Políticas, como las demás. */}
            <Pressable
              onPress={() => router.push("/admin/policies")}
              accessibilityRole="link"
              accessibilityLabel="Ver o editar las Normas del Foro"
              style={({ pressed }) => ({ minHeight: 44, alignSelf: "center", justifyContent: "center", paddingHorizontal: 12, opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12.5, textDecorationLine: "underline" }}>
                Ver o editar las Normas del Foro
              </Text>
            </Pressable>

            {/* Quién está silenciado ahora en el Foro, hasta cuándo y por qué, con «Quitar silencio». */}
            {silenciados && silenciados.length ? (
              <View nativeID="admin-silenciados" style={{ gap: 8 }}>
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 15, textAlign: "center" }}>Silenciados en el Foro</Text>
                {silenciados.map((s) => {
                  const u = users.find((x) => x.user_id === s.user_id);
                  const p = perfiles[s.user_id];
                  const quien = p?.usuario ? `@${p.usuario}` : u?.email ?? "Cliente";
                  return (
                    <View
                      key={s.user_id}
                      style={{ flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, backgroundColor: COLORS.card, padding: 10 }}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: "900", fontSize: 13.5 }}>
                          {quien}
                        </Text>
                        <Text style={{ color: COLORS.muted, fontSize: 12, lineHeight: 17 }}>
                          Hasta el {new Date(s.hasta).toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          {s.motivo ? ` · ${s.motivo}` : ""}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => quitarSilencio(s.user_id)}
                        disabled={quitandoSilencio === s.user_id}
                        accessibilityRole="button"
                        accessibilityLabel={`Quitar el silencio de ${quien}`}
                        style={({ pressed }) => ({
                          minHeight: 44,
                          justifyContent: "center",
                          paddingHorizontal: 14,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: COLORS.border,
                          backgroundColor: "#FFFFFF",
                          opacity: quitandoSilencio === s.user_id ? 0.5 : pressed ? 0.85 : 1,
                        })}
                      >
                        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12.5 }}>Quitar silencio</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {/* Números de seguimiento (los que da la tienda, p. ej. desde VeoAura): cuántos se añaden a una cuenta y cuántos
                intentos fallan (30 días, datos de la base de datos). Cada número sale en Pedidos y en Servicios. */}
            {numerosSeguimiento ? (
              <Text nativeID="admin-numeros-seguimiento" style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12.5, lineHeight: 18, textAlign: "center" }}>
                Números de seguimiento (30 días): añadidos a una cuenta {numerosSeguimiento.anadidos} (por {numerosSeguimiento.personas}{" "}
                {numerosSeguimiento.personas === 1 ? "persona" : "personas"}) · intentos fallidos {numerosSeguimiento.fallidos}
              </Text>
            ) : null}

            {/* «¿Olvidaste tu contraseña?»: si los enlaces se piden, llegan a abrirse y terminan en una contraseña nueva, y por
                qué fallan (analítica propia, 30 días). Si Supabase frena los correos, se avisa de lo que hace falta. */}
            {usoContrasena ? (
              <View nativeID="admin-contrasenas" style={{ gap: 4 }}>
                <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12.5, lineHeight: 18, textAlign: "center" }}>
                  Recuperar contraseña (30 días): enlaces pedidos {usoContrasena.pedidos} · abiertos {usoContrasena.abiertos} · contraseñas
                  cambiadas {usoContrasena.cambiadas}
                  {usoContrasena.noSirvieron
                    ? ` · enlaces que no sirvieron ${usoContrasena.noSirvieron} (en otro navegador ${usoContrasena.otroNavegador}, caducados o ya usados ${usoContrasena.caducados})`
                    : ""}
                  {usoContrasena.errores ? ` · no se pudieron pedir ${usoContrasena.errores}` : ""}
                </Text>
                {usoContrasena.limite ? (
                  <Text nativeID="admin-contrasenas-aviso" style={{ color: COLORS.danger, fontWeight: "800", fontSize: 12.5, lineHeight: 18, textAlign: "center" }}>
                    Supabase ha frenado {usoContrasena.limite} {usoContrasena.limite === 1 ? "correo" : "correos"} por su límite de envíos: hace falta
                    el correo propio (SMTP) en Supabase → Authentication → Emails.
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* Perfil → «Mis seguimientos»: quién lo abre (analítica propia, 30 días) y cuántos deslizando la pestaña. */}
            {usoSeguimientos ? (
              <Text nativeID="admin-uso-seguimientos" style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12.5, lineHeight: 18, textAlign: "center" }}>
                «Mis seguimientos» (30 días): lo abrieron {usoSeguimientos.personas} · deslizando {usoSeguimientos.deslizando}
              </Text>
            ) : null}

            {/* Seguimiento de los perfiles (lo que cada cliente escribe en Mi cuenta → Tu perfil). Los contadores también
                sirven de filtro: tocar uno filtra la lista de abajo y volver a tocarlo lo quita. */}
            {perfilesOk ? (
              <View style={{ gap: 12 }} nativeID="admin-perfiles">
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>Perfiles de clientes</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" }}>
                  <StatCard label="Con perfil" value={`${resumenPerfiles.conAlgo} de ${stats.total}`} icon="id-card-outline" isMobile={isMobile} />
                  <StatCard label="Perfil completo" value={String(resumenPerfiles.completos)} icon="checkmark-done-outline" isMobile={isMobile} />
                  <StatCard label="Faltan datos" value={String(resumenPerfiles.pendientes)} icon="alert-circle-outline" isMobile={isMobile} />
                  <StatCard label="Con foto" value={String(resumenPerfiles.conFoto)} icon="camera-outline" isMobile={isMobile} />
                  <StatCard
                    label="Edad media"
                    value={resumenPerfiles.media != null ? `${Math.round(resumenPerfiles.media)} años` : "—"}
                    icon="calendar-outline"
                    isMobile={isMobile}
                  />
                  <StatCard label="Provincias" value={String(resumenPerfiles.porProvincia.length)} icon="location-outline" isMobile={isMobile} />
                  {direccionColumnas ? (
                    <StatCard label="Con dirección" value={String(resumenPerfiles.conDireccion)} icon="home-outline" isMobile={isMobile} />
                  ) : null}
                </View>

                {/* «Completa tu perfil» (obligatorio al iniciar sesión): analítica propia de los últimos 30 días. */}
                {embudoPerfil ? (
                  <Text nativeID="admin-perfiles-embudo" style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12.5, lineHeight: 18, textAlign: "center" }}>
                    «Completa tu perfil» (30 días): la vieron {embudoPerfil.vistos} · la completaron {embudoPerfil.completados} · cerraron sesión{" "}
                    {embudoPerfil.salieron}
                  </Text>
                ) : null}
                {/* Foto de perfil: quién la encuadra y la usa, y quién deja el recorte a medias (30 días). */}
                {embudoPerfil ? (
                  <Text nativeID="admin-perfiles-fotos" style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12.5, lineHeight: 18, textAlign: "center" }}>
                    Foto de perfil (30 días): la encuadraron {embudoPerfil.fotosEncuadradas} · dejaron el recorte {embudoPerfil.fotosCanceladas}
                  </Text>
                ) : null}
                {/* Dirección de envío: quién la guarda y quién paga con ella ya rellenada (30 días, personas distintas). */}
                {embudoPerfil && direccionColumnas ? (
                  <Text nativeID="admin-perfiles-direccion" style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12.5, lineHeight: 18, textAlign: "center" }}>
                    Dirección de envío (30 días): la guardaron {embudoPerfil.direccionGuardada} · pagaron con ella ya rellenada{" "}
                    {embudoPerfil.pagoConDireccion}
                  </Text>
                ) : null}

                <Text style={{ color: COLORS.muted2, fontWeight: "800", fontSize: 12, textAlign: "center" }}>ESTADO</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                  {(
                    [
                      ["completo", `Completo (${resumenPerfiles.completos})`],
                      ["pendiente", `Faltan datos (${resumenPerfiles.pendientes})`],
                      ["foto", `Con foto (${resumenPerfiles.conFoto})`],
                      ...(direccionColumnas ? ([["direccion", `Con dirección (${resumenPerfiles.conDireccion})`]] as [EstadoPerfil, string][]) : []),
                    ] as [EstadoPerfil, string][]
                  ).map(([id, label]) => (
                    <ChipButton
                      key={id}
                      label={label}
                      active={filtroEstado === id}
                      onPress={() => setFiltroEstado((v) => (v === id ? null : id))}
                      isMobile={isMobile}
                    />
                  ))}
                </View>

                {resumenPerfiles.conAlgo === 0 ? (
                  <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 20 }}>
                    Todavía nadie ha rellenado su perfil. Cuando lo hagan, aquí verás de dónde son y qué edad tienen.
                  </Text>
                ) : (
                  <>
                    <Text style={{ color: COLORS.muted2, fontWeight: "800", fontSize: 12, textAlign: "center" }}>EDAD</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                      {resumenPerfiles.porTramo.map((t) => (
                        <ChipButton
                          key={t.id}
                          label={`${t.label} (${t.n})`}
                          active={filtroTramo === t.id}
                          onPress={() => setFiltroTramo((v) => (v === t.id ? null : t.id))}
                          isMobile={isMobile}
                        />
                      ))}
                    </View>

                    {resumenPerfiles.porProvincia.length > 0 ? (
                      <>
                        <Text style={{ color: COLORS.muted2, fontWeight: "800", fontSize: 12, textAlign: "center" }}>PROVINCIA</Text>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                          {resumenPerfiles.porProvincia.slice(0, 10).map((p) => (
                            <ChipButton
                              key={p.valor}
                              label={`${p.valor} (${p.n})`}
                              active={filtroProvincia === p.valor}
                              onPress={() => setFiltroProvincia((v) => (v === p.valor ? null : p.valor))}
                              isMobile={isMobile}
                            />
                          ))}
                        </View>
                      </>
                    ) : null}

                    {resumenPerfiles.porPais.length > 1 ? (
                      <>
                        <Text style={{ color: COLORS.muted2, fontWeight: "800", fontSize: 12, textAlign: "center" }}>PAÍS</Text>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                          {resumenPerfiles.porPais.slice(0, 8).map((p) => (
                            <ChipButton
                              key={p.valor}
                              label={`${p.valor} (${p.n})`}
                              active={filtroPais === p.valor}
                              onPress={() => setFiltroPais((v) => (v === p.valor ? null : p.valor))}
                              isMobile={isMobile}
                            />
                          ))}
                        </View>
                      </>
                    ) : null}

                  </>
                )}

                {hayFiltros ? (
                  <View style={{ alignItems: "center" }}>
                    <ChipButton
                      label="Quitar filtros"
                      onPress={() => {
                        setFiltroProvincia(null);
                        setFiltroPais(null);
                        setFiltroTramo(null);
                        setFiltroEstado(null);
                      }}
                      isMobile={isMobile}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={{ gap: 10 }}>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={perfilesOk ? "Buscar por email, nombre, usuario o provincia…" : "Buscar por email…"}
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
              {usoResenas ? (
                <Text nativeID="usuarios-resenas-uso" style={{ color: COLORS.muted, fontSize: 12, fontWeight: "700", textAlign: "center", lineHeight: 17 }}>
                  Reseñas (30 días): {usoResenas.publicadas} publicadas · con ideas sugeridas: {usoResenas.conIdeas} · con emoji:{" "}
                  {usoResenas.conEmoji}
                  {usoResenas.ideaMasUsada ? ` · la idea más usada: «${usoResenas.ideaMasUsada}»` : ""}
                </Text>
              ) : null}
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
                            borderRadius: 17,
                            overflow: "hidden",
                            backgroundColor: COLORS.accent2,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {perfiles[u.user_id]?.foto_url ? (
                            <SmartImage
                              uri={perfiles[u.user_id].foto_url}
                              alt={`Foto de ${perfiles[u.user_id].nombre || u.email || "cliente"}`}
                              contentFit="cover"
                              style={{ width: "100%", height: "100%" }}
                            />
                          ) : (
                            <Ionicons name="person-outline" size={16} color={COLORS.accentDark} />
                          )}
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

                    {perfilesOk ? (
                      <>
                        <Text style={{ color: perfiles[u.user_id] ? COLORS.text : COLORS.muted2, fontSize: 13, fontWeight: "800", lineHeight: 18 }}>
                          {resumenDePerfil(perfiles[u.user_id])}
                        </Text>
                        {/* Estado del perfil obligatorio, como texto de color (sin recuadro). */}
                        {!isAdmin ? (
                          perfilCompleto(perfiles[u.user_id]) ? (
                            <Text style={{ color: COLORS.success, fontSize: 12, fontWeight: "800" }}>
                              Perfil completo{perfiles[u.user_id]?.updated_at ? ` · actualizado ${fmtDate(perfiles[u.user_id].updated_at)}` : ""}
                            </Text>
                          ) : (
                            <Text style={{ color: COLORS.danger, fontSize: 12, fontWeight: "800" }}>
                              {perfiles[u.user_id] ? `Faltan: ${faltaDelPerfil(perfiles[u.user_id]).join(", ")}` : "Aún no ha completado su perfil"}
                            </Text>
                          )
                        ) : null}
                      </>
                    ) : null}

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
