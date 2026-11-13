// app/admin/users.tsx
/**
 * Qué hace: pantalla de administración "Usuarios y participación". Lista los
 * usuarios registrados en la app (con su email, perfil, fecha de alta y última
 * conexión) y cuánto participan: mensajes en el Foro, chats de producto que han
 * iniciado y reseñas que han escrito; además, las ideas de mejora que mandan,
 * la seguridad de las cuentas (contraseñas, inicio de sesión) y la moderación
 * del Foro.
 *
 * DISEÑO (dueño, 2026-11-12: «que se vea profesional, intuitivo, práctico»; el
 * mismo de la ficha del cliente, app/admin/cliente/[userId].tsx, y los tamaños
 * comunes de constants/theme.ts: letra mínima 13, cuerpo 15, táctiles de 44 px):
 * 1) Arriba, el buscador (16 px, sin zoom en el iPhone) y una fila de cifras
 *    clave (registrados, activos 7 días, perfil completo, con la app instalada
 *    si existe el dato y valoración media). Tocar una cifra filtra la lista o
 *    abre su pestaña.
 * 2) Pestañas deslizables recordadas en la URL (?tab=clientes|participacion|
 *    ideas|seguridad): Clientes (con su número) · Participación · Ideas de
 *    mejora (con las sin leer) · Seguridad (con un punto rojo si algo requiere
 *    atención). Escribir en el buscador lleva a «Clientes».
 * 3) Clientes: filtros en una fila deslizable (Activos 7 días, Perfil completo,
 *    Faltan datos, Con foto, Con dirección y los desplegables Provincia, Edad y
 *    País, que se vuelven a plegar al elegir o al tocarlos otra vez), cuántos
 *    salen, «Quitar filtros» y el orden (desplegable: alta más reciente, más
 *    participación o última conexión). Cada fila: foto o iniciales, nombre,
 *    @usuario · provincia (país) · edad · CP, correo, alta y «Última conexión
 *    hace…», etiquetas (Perfil completo / Faltan… / App / Con dirección) y su
 *    participación en una línea; al tocarla, su ficha.
 * 4) Participación: tarjetas con la cifra grande (Foro, chats de producto,
 *    valoración media, reseñas en 30 días, solicitudes de venta y de servicio,
 *    «Mis seguimientos» y números de seguimiento) y «Perfiles de clientes»
 *    (contadores que filtran y el uso de «Completa tu perfil», la foto y la
 *    dirección en 30 días).
 * 5) Ideas de mejora: bandeja tipo correo, primero las sin leer, con quién la
 *    manda (enlace a su ficha), cuándo y desde dónde, y «Marcar leída» de 44 px.
 * 6) Seguridad: recuperar contraseña (con el aviso rojo solo si Supabase frena
 *    correos), contraseñas cortas, inicio de sesión, moderación del Foro y
 *    silenciados con «Quitar silencio».
 * En el ordenador, todo centrado y de 960 px como mucho; las cifras en una fila.
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
 *   haber iniciado sesión, así que el total incluye también las anónimas. Las
 *   que SÍ se enviaron con sesión iniciada quedan atribuidas a esa persona
 *   (customer_user_id) y aparecen dentro de su ficha de cliente.
 * - "Valoración media" sale de store_reviews (rating 1-5, visible a
 *   cualquiera igual que las reseñas de Inicio). «Reseñas (30 días)»: las
 *   publicadas, cuántas usan las ideas sugeridas o un emoji propuesto y la
 *   idea más usada (analítica propia «resena_publicada», components/ReviewModal.tsx).
 * - «Ideas de mejora»: lo que mandan los clientes desde «Mejoras en la
 *   tienda» (Blue, el pie de página o Mi cuenta; tabla mejoras_tienda, migración
 *   20261101200000_mejoras_tienda.sql). Contadores que filtran (sin leer, todas,
 *   por sitio) y, de 30 días, las enviadas y cuántas veces se abrió la cajita y
 *   desde dónde (analítica propia «mejora_abierta»). Sin la migración, una línea
 *   dice que falta aplicarla.
 * - «Recuperar contraseña (30 días)»: enlaces pedidos, abiertos, contraseñas
 *   cambiadas, enlaces que no sirvieron (en otro navegador, caducados) y los
 *   que no se pudieron pedir; si Supabase frena correos por su límite, un
 *   aviso en rojo de que hace falta el correo propio (SMTP). Analítica propia
 *   contrasena_* de app/(tabs)/perfil.tsx y app/reset-password.tsx.
 * - «Contraseñas de al menos 8 (30 días)» (dueño, 2026-11-05: «sube la contraseña a 8»): cuántas veces alguien
 *   escribió una contraseña nueva más corta y dónde (al crear la cuenta, al recuperarla o en Mi perfil). Analítica
 *   propia contrasena_corta (una vez por visita, nunca la contraseña).
 * - «Inicio de sesión y seguridad (30 días)»: cambios de correo pedidos y
 *   terminados, contraseñas cambiadas desde Mi perfil e intentos fallidos
 *   (cuántos con la contraseña actual equivocada). Analítica propia
 *   perfil_correo_* / perfil_contrasena_* de components/PerfilPublico.tsx.
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
 *   seguimientos_abiertos, solo de quien aceptó la analítica); y los números de
 *   seguimiento añadidos a una cuenta y los intentos fallidos (tabla seguimiento_intentos).
 * - Buscador: filtra la lista ya cargada por email, nombre, usuario, provincia,
 *   país, código postal o localidad (no vuelve a pedir nada a Supabase).
 * - Orden: por fecha de alta (más recientes primero, por defecto), por
 *   participación total (suma de los tres contadores) o por «Última conexión»
 *   (2026-11-12: la más reciente de sus dispositivos, tabla cliente_dispositivos,
 *   que cada fila enseña como «Última conexión hace 2 h»); «Activos 7 días» deja
 *   solo a los clientes que se han conectado esa semana y «App» sale a quien entra
 *   con la app instalada (app_instalada); las cifras de activos y de la app no
 *   cuentan a los administradores (como Analítica: su visita al panel no cuenta).
 *   Sin la migración 20261112120000 no sale nada de esto.
 * - PERFILES (seguimiento de «Mi perfil», lo que cada cliente rellena en Mi cuenta, obligatorio
 *   al iniciar sesión: foto opcional, nombre, usuario, país, provincia y edad): se leen de
 *   perfiles_cliente (el administrador las ve todas, por su política; migración
 *   20261030150000_perfiles_cliente_completo.sql). Contadores (con perfil, completos,
 *   clientes con datos pendientes, con foto, edad media, provincias), filtros por estado,
 *   tramo de edad, provincia y país, y cuántos vieron, completaron o abandonaron «Completa tu
 *   perfil» en los últimos 30 días (analítica propia: perfil_obligatorio_visto / perfil_guardado /
 *   perfil_obligatorio_salir, solo de quien no rechazó la analítica), y cuántos encuadraron su foto
 *   o dejaron el recorte a medias (perfil_foto_encuadrada / perfil_foto_cancelada). DIRECCIÓN DE
 *   ENVÍO (opcional, Mi perfil): contador «Con dirección», filtro, «CP 50410 Cuarte…» en cada
 *   fila y, de 30 días, quién la guarda y quién paga con ella ya rellenada (perfil_direccion_guardada /
 *   pago_direccion_perfil); sin las columnas (migración 20261102120000) no sale nada de esto. TELÉFONO (opcional, Mi perfil,
 *   dueño 2026-11-13): contador y chip «Con teléfono» que filtra, etiqueta «Con teléfono» en cada fila (nunca el número en el
 *   listado) y, de 30 días, quién lo guarda y quién paga con él ya rellenado (perfil_telefono_guardado /
 *   pago_telefono_perfil); sin la columna (migración 20261113120000) no sale nada de esto. Si la tabla aún no existe
 *   esta parte no se enseña y el resto funciona igual. La edad sale de la fecha de nacimiento
 *   (no se enseña la fecha). Lee hasta 5.000 perfiles.
 * - Cada fila es pulsable: lleva a la "ficha de cliente"
 *   (app/admin/cliente/[userId].tsx), que junta compras, ventas a la tienda,
 *   servicios de reparación y un cuadro de notas internas para ese usuario.
 *   Se le pasan email y fecha de alta como parámetros de navegación para que
 *   esa pantalla no tenga que volver a pedirlos.
 *
 * Conectado con:
 * - lib/supabase.ts → cliente para la RPC y las consultas de recuento.
 * - constants/theme.ts → TAMANOS, TACTIL, CAMPO, COLORES_TEXTO y colorTextoAzul.
 * - sql (migración) admin_list_users_with_stats → función que agrega todo.
 * - app/admin/index.tsx → tarjeta "Usuarios y participación" que lleva aquí.
 * - app/admin/cliente/[userId].tsx → ficha de cliente a la que lleva cada fila.
 * - app/admin/_layout.tsx → registra esta ruta ("users") en el Stack.
 * - pruebas/perfil-datos.mjs → secciones UP (este diseño), E, F, M, ME, CO, DI, SE, C8, P, RE y DV.
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
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CONTRASENA_MINIMA, haceCuanto, supabase } from "../../lib/supabase";
import CargaMarca from "../../components/marca/CargaMarca";
import SmartImage from "../../components/SmartImage";
import { ORIGENES_MEJORA, SUGERENCIAS_RESENA, type OrigenMejora } from "../../components/ReviewModal";
import { CAMPO, COLORES_TEXTO, TACTIL, TAMANOS, colorTextoAzul } from "../../constants/theme";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];
type Ancho = number | `${number}%`;

// Mismos colores que la ficha del cliente; grises nunca más claros que 0,72 y el azul de texto (#0A78B4) en la letra
// azul de menos de 17 px (el de marca, en iconos, bordes y fondos).
const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  border: "#E3EAF2",
  text: COLORES_TEXTO.texto,
  muted: COLORES_TEXTO.secundario,
  accent: COLORES_TEXTO.azulMarca,
  accentText: COLORES_TEXTO.azulTexto,
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  success: "#15803D",
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
  // Teléfono (opcional; migración 20261113120000_perfil_telefono.sql).
  telefono: string;
};

// Filtro por estado del perfil.
type EstadoPerfil = "completo" | "pendiente" | "foto" | "direccion" | "telefono";

// Tiene una dirección de envío entera (la que rellena el pago).
const conDireccionDeEnvio = (p: PerfilRow | undefined) => !!p && !!p.direccion && !!p.codigo_postal;
// Tiene teléfono guardado en su perfil.
const conTelefonoDePerfil = (p: PerfilRow | undefined) => !!p && !!p.telefono;

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
  // Teléfono: quién lo guarda (en Mi perfil o al comprar) y quién paga con el del perfil ya rellenado (nunca el número).
  "perfil_telefono_guardado",
  "pago_telefono_perfil",
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
  // Contraseña nueva más corta del mínimo (lib/supabase.ts → CONTRASENA_MINIMA), con dónde: registro, recuperar o perfil.
  "contrasena_corta",
] as const;
// Mi perfil → «Inicio de sesión y seguridad» (components/PerfilPublico.tsx): cambios de correo y de contraseña.
const EVENTOS_SEGURIDAD = [
  "perfil_correo_cambio_pedido",
  "perfil_correo_cambio_error",
  "perfil_correo_cambiado",
  "perfil_contrasena_cambiada",
  "perfil_contrasena_error",
] as const;
type UsoSeguridad = { correoPedidos: number; correoErrores: number; correoCambiados: number; contrasenas: number; contrasenaErrores: number; actualMal: number };
type UsoContrasena = {
  pedidos: number;
  errores: number;
  limite: number;
  abiertos: number;
  noSirvieron: number;
  otroNavegador: number;
  caducados: number;
  cambiadas: number;
  cortas: number;
  cortasRegistro: number;
  cortasRecuperar: number;
  cortasPerfil: number;
};

// Una idea de «Mejoras en la tienda» (tabla mejoras_tienda, migración 20261101200000_mejoras_tienda.sql).
type MejoraRow = { id: string; user_id: string; created_at: string; texto: string; origen: OrigenMejora; leida: boolean; leida_en: string | null };

type SortMode = "recent" | "participation" | "conexion";
const ORDENES: { id: SortMode; label: string }[] = [
  { id: "recent", label: "Alta más reciente" },
  { id: "participation", label: "Más participación" },
  { id: "conexion", label: "Última conexión" },
];

// Pestañas (en la URL como ?tab=…).
type Pestana = "clientes" | "participacion" | "ideas" | "seguridad";
const PESTANAS: Pestana[] = ["clientes", "participacion", "ideas", "seguridad"];
const NOMBRE_PESTANA: Record<Pestana, string> = {
  clientes: "Clientes",
  participacion: "Participación",
  ideas: "Ideas de mejora",
  seguridad: "Seguridad",
};

// Desplegables de la fila de filtros (y el del orden); solo uno abierto a la vez.
type Desplegable = "provincia" | "edad" | "pais" | "orden" | null;

// «Activos en los últimos 7 días» (por su última conexión, tabla cliente_dispositivos).
const ACTIVO_MS = 7 * 24 * 60 * 60 * 1000;

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

// Debajo del nombre: «@dani · Zaragoza (España) · 22 años · CP 50410 Cuarte», o «Perfil sin completar».
function resumenDePerfil(p: PerfilRow | undefined): string {
  if (!p) return "Perfil sin completar";
  const edad = edadDe(p.fecha_nacimiento);
  const lugar = p.provincia && p.pais ? `${p.provincia} (${p.pais})` : p.provincia || p.pais;
  // Con dirección de envío, su código postal y localidad (para ver de un vistazo quién está en la zona de reparto).
  const envio = conDireccionDeEnvio(p) ? `CP ${[p.codigo_postal, p.localidad].filter(Boolean).join(" ")}` : "";
  const partes = [p.usuario ? `@${p.usuario}` : "", lugar, edad !== null ? `${edad} años` : "", envio].filter(Boolean);
  return partes.length ? partes.join(" · ") : "Perfil sin completar";
}

// Cuántos hay de cada valor, de más a menos (para los contadores que también sirven de filtro).
function contarPor(valores: string[]): { valor: string; n: number }[] {
  const mapa = new Map<string, number>();
  for (const v of valores) if (v) mapa.set(v, (mapa.get(v) ?? 0) + 1);
  return [...mapa.entries()].map(([valor, n]) => ({ valor, n })).sort((a, b) => b.n - a.n || a.valor.localeCompare(b.valor, "es"));
}

// Iniciales para cuando no hay foto: «Dani García» → «DG»; si no hay nombre, la primera letra del correo.
function iniciales(nombre: string, email: string) {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const letras = partes.length ? partes.slice(0, 2).map((p) => p[0]) : [email.trim()[0] ?? "?"];
  return letras.join("").toUpperCase();
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

const esAdmin = (u: UserRow) => (u.role ?? "").toLowerCase() === "admin";

// Cliente (no administrador) conectado en los últimos 7 días.
function esActivo(u: UserRow, ultimaConexion: Record<string, string> | null, ahora = Date.now()) {
  const ultima = ultimaConexion?.[u.user_id];
  return !esAdmin(u) && !!ultima && ahora - new Date(ultima).getTime() <= ACTIVO_MS;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// Una cifra: el número grande y su etiqueta debajo (como las de la ficha del cliente). Si se puede tocar, filtra la
// lista o lleva a su pestaña; `activa` = su filtro está puesto.
function Cifra({
  valor,
  etiqueta,
  nativeID,
  onPress,
  activa,
  icono,
  ancho,
  fondo = COLORS.card,
  grande,
}: {
  valor: string;
  etiqueta: string;
  nativeID?: string;
  onPress?: () => void;
  activa?: boolean;
  icono?: IoniconName;
  ancho: Ancho;
  fondo?: string;
  grande?: boolean;
}) {
  const contenido = (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "100%" }}>
        {icono ? <Ionicons name={icono} size={grande ? 20 : 18} color={COLORS.accent} /> : null}
        <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: "900", fontSize: grande ? TAMANOS.titulo2 : TAMANOS.titulo3, flexShrink: 1 }}>
          {valor}
        </Text>
      </View>
      <Text
        numberOfLines={2}
        style={{
          color: activa ? COLORS.accentText : COLORS.muted,
          fontWeight: activa ? "900" : "700",
          fontSize: TAMANOS.minimo,
          lineHeight: 17,
          textAlign: "center",
        }}
      >
        {etiqueta}
      </Text>
    </>
  );
  const estilo = {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: ancho,
    minWidth: 0,
    minHeight: 72,
    borderRadius: 16,
    backgroundColor: activa ? COLORS.accent2 : fondo,
    borderWidth: 1,
    borderColor: activa ? COLORS.accentBorder : fondo === COLORS.card ? COLORS.card : COLORS.border,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 2,
  };
  if (!onPress) {
    return (
      <View nativeID={nativeID} style={estilo}>
        {contenido}
      </View>
    );
  }
  return (
    <Pressable
      nativeID={nativeID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!activa }}
      accessibilityLabel={`${valor} ${etiqueta}`}
      style={({ pressed }) => ({ ...estilo, opacity: pressed ? 0.8 : 1 })}
    >
      {contenido}
    </Pressable>
  );
}

// Varias cifras en fila (en el móvil, de 2 o 3 por fila según cuántas sean).
function FilaCifras({ children, nativeID }: { children: React.ReactNode; nativeID?: string }) {
  return (
    <View nativeID={nativeID} style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
      {children}
    </View>
  );
}

// Ancho de cada cifra: en el ordenador todas en una fila; en el móvil, de 3 en 3 (con 3, 5 o 6) o de 2 en 2.
function anchoCifra(n: number, isMobile: boolean): Ancho {
  if (!isMobile) return 0;
  return n === 3 || n === 5 || n === 6 ? "30%" : "45%";
}

// Un filtro (o un desplegable, con su flecha). 44 px de alto.
function Chip({
  label,
  onPress,
  activo,
  abierto,
  desplegable,
  nativeID,
}: {
  label: string;
  onPress: () => void;
  activo?: boolean;
  abierto?: boolean;
  desplegable?: boolean;
  nativeID?: string;
}) {
  return (
    <Pressable
      nativeID={nativeID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!activo, expanded: desplegable ? !!abierto : undefined }}
      style={({ pressed }) => ({
        minHeight: TACTIL.minimo,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: activo || abierto ? COLORS.accent : COLORS.border,
        backgroundColor: activo ? COLORS.accent2 : COLORS.bg,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: COLORS.text, fontWeight: activo ? "900" : "800", fontSize: TAMANOS.minimo }}>{label}</Text>
      {desplegable ? <Ionicons name={abierto ? "chevron-up" : "chevron-down"} size={16} color={COLORS.text} /> : null}
    </Pressable>
  );
}

// Una sección: icono y título (sin recuadro), con un texto corto a la derecha (p. ej. «30 días»).
function Seccion({ icon, title, extra, nativeID, children }: { icon: IoniconName; title: string; extra?: string; nativeID?: string; children: React.ReactNode }) {
  return (
    <View nativeID={nativeID} style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {/* Solo el icono, sin burbuja (dueño, 2026-11-04). */}
        <Ionicons name={icon} size={20} color={COLORS.accent} />
        <Text style={{ flex: 1, color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.destacado }}>{title}</Text>
        {extra ? <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, fontWeight: "800" }}>{extra}</Text> : null}
      </View>
      {children}
    </View>
  );
}

// Una tarjeta de Participación: título con su icono, la cifra grande y el detalle debajo. En el móvil (`fila`), a todo
// lo ancho: el título a la izquierda, la cifra a la derecha y el detalle debajo (en dos columnas no cabían).
function Tarjeta({
  nativeID,
  icono,
  titulo,
  valor,
  detalle,
  ancho,
  fila,
}: {
  nativeID?: string;
  icono: IoniconName;
  titulo: string;
  valor: string;
  detalle?: string;
  ancho: Ancho;
  fila?: boolean;
}) {
  if (fila) {
    return (
      <View nativeID={nativeID} style={{ width: "100%", borderRadius: 20, backgroundColor: COLORS.card, paddingVertical: 12, paddingHorizontal: 16, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons name={icono} size={20} color={COLORS.accent} />
          <Text style={{ flex: 1, color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.cuerpo, lineHeight: 20 }}>{titulo}</Text>
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.titulo2, lineHeight: 30 }}>{valor}</Text>
        </View>
        {detalle ? <Text style={{ color: COLORS.muted, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 18, paddingLeft: 30 }}>{detalle}</Text> : null}
      </View>
    );
  }
  return (
    <View nativeID={nativeID} style={{ flexGrow: 1, flexShrink: 1, flexBasis: ancho, minWidth: 0, borderRadius: 20, backgroundColor: COLORS.card, padding: 16, gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name={icono} size={20} color={COLORS.accent} />
        <Text style={{ flex: 1, color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.cuerpo, lineHeight: 20 }}>{titulo}</Text>
      </View>
      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.titulo1, lineHeight: 34 }}>{valor}</Text>
      {detalle ? <Text style={{ color: COLORS.muted, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 18 }}>{detalle}</Text> : null}
    </View>
  );
}

// «no se pudieron pedir 1» → «No se pudieron pedir 1» (las líneas de detalle empiezan en mayúscula).
const mayuscula = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Un recuadro de Seguridad (fondo suave), con sus cifras y sus líneas de detalle.
function Recuadro({ nativeID, children }: { nativeID?: string; children: React.ReactNode }) {
  return (
    <View nativeID={nativeID} style={{ borderRadius: 20, backgroundColor: COLORS.card, padding: 16, gap: 12 }}>
      {children}
    </View>
  );
}

// Línea de detalle (13 px, gris permitido).
function Detalle({ children, nativeID, color }: { children: React.ReactNode; nativeID?: string; color?: string }) {
  return (
    <Text nativeID={nativeID} style={{ color: color ?? COLORS.muted, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
      {children}
    </Text>
  );
}

// Una etiqueta pequeña de la fila: icono y texto con su color, sin cápsula.
function Etiqueta({ icon, texto, color }: { icon: IoniconName; texto: string; color: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "100%" }}>
      <Ionicons name={icon} size={15} color={color === COLORS.text ? COLORS.accent : color} />
      <Text style={{ color, fontWeight: "800", fontSize: TAMANOS.minimo, flexShrink: 1 }}>{texto}</Text>
    </View>
  );
}

export default function AdminUsers() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const insets = useSafeAreaInsets();

  // Pestaña abierta: la de la URL (?tab=) para volver a ella; si no, «Clientes».
  const params = useLocalSearchParams<{ tab?: string }>();
  const tabUrl = PESTANAS.includes(params.tab as Pestana) ? (params.tab as Pestana) : "clientes";
  const [tab, setTab] = useState<Pestana>(tabUrl);
  useEffect(() => {
    setTab(tabUrl);
  }, [tabUrl]);
  const cambiarTab = useCallback((t: Pestana) => {
    setTab(t);
    router.setParams({ tab: t } as never);
  }, []);

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
  // Última conexión de cada cliente (la más reciente de sus dispositivos). null = la tabla aún no existe.
  const [ultimaConexion, setUltimaConexion] = useState<Record<string, string> | null>(null);
  // Quién entra con la app instalada en alguno de sus dispositivos.
  const [conApp, setConApp] = useState<Set<string>>(() => new Set());
  const [soloActivos, setSoloActivos] = useState(false);
  const [desplegado, setDesplegado] = useState<Desplegable>(null);

  // Perfiles de los clientes (nombre, usuario, país, provincia y edad) y filtros. `perfilesOk` = la tabla existe
  // (si la migración aún no está aplicada, esta parte no se enseña y el resto de la pantalla funciona igual).
  const [perfiles, setPerfiles] = useState<Record<string, PerfilRow>>({});
  const [perfilesOk, setPerfilesOk] = useState(false);
  // ¿Existen ya las columnas de la dirección de envío? (se sabe por las filas; sin ellas no se enseña nada de la dirección)
  const [direccionColumnas, setDireccionColumnas] = useState(false);
  // ¿Existe ya la columna del teléfono? (también se sabe por las filas)
  const [telefonoColumna, setTelefonoColumna] = useState(false);
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
    telefonoGuardado: number;
    pagoConTelefono: number;
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
  // «Inicio de sesión y seguridad» en 30 días (analítica propia). null = sin analítica.
  const [usoSeguridad, setUsoSeguridad] = useState<UsoSeguridad | null>(null);

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
          .in("event_name", [...EVENTOS_PERFIL, ...EVENTOS_SEGUIMIENTOS, ...EVENTOS_FORO, ...EVENTOS_RESENAS, ...EVENTOS_MEJORAS, ...EVENTOS_CONTRASENA, ...EVENTOS_SEGURIDAD])
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
        setUsoSeguridad(null);
      } else {
        // «Inicio de sesión y seguridad»: cuántas veces pasa cada cosa (sin correos ni datos de nadie).
        const deSeguridad = ((eventosRes.data ?? []) as { event_name: string; metadata: { motivo?: unknown } | null }[]).filter((e) =>
          (EVENTOS_SEGURIDAD as readonly string[]).includes(e.event_name)
        );
        const veces = (nombre: string, motivo?: string) =>
          deSeguridad.filter((e) => e.event_name === nombre && (!motivo || String(e.metadata?.motivo ?? "") === motivo)).length;
        setUsoSeguridad({
          correoPedidos: veces("perfil_correo_cambio_pedido"),
          correoErrores: veces("perfil_correo_cambio_error"),
          correoCambiados: veces("perfil_correo_cambiado"),
          contrasenas: veces("perfil_contrasena_cambiada"),
          contrasenaErrores: veces("perfil_contrasena_error"),
          actualMal: veces("perfil_contrasena_error", "actual"),
        });
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
          cortas: cuenta("contrasena_corta"),
          cortasRegistro: cuenta("contrasena_corta", "registro"),
          cortasRecuperar: cuenta("contrasena_corta", "recuperar"),
          cortasPerfil: cuenta("contrasena_corta", "perfil"),
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
          telefonoGuardado: personas("perfil_telefono_guardado"),
          pagoConTelefono: personas("pago_telefono_perfil"),
        });
      }

      if (perfilesRes.error) {
        setPerfilesOk(false);
        setPerfiles({});
      } else {
        const mapa: Record<string, PerfilRow> = {};
        setDireccionColumnas(((perfilesRes.data ?? []) as Record<string, unknown>[]).some((r) => "codigo_postal" in r));
        setTelefonoColumna(((perfilesRes.data ?? []) as Record<string, unknown>[]).some((r) => "telefono" in r));
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
            telefono: t(r.telefono),
          };
        }
        setPerfiles(mapa);
        setPerfilesOk(true);
      }

      // Última conexión y app instalada (migración 20261112120000): sin la tabla, no sale y lo demás funciona igual.
      const conexRes = await supabase
        .from("cliente_dispositivos")
        .select("user_id,ultima_vez,app_instalada")
        .order("ultima_vez", { ascending: false })
        .limit(5000);
      if (conexRes.error) {
        setUltimaConexion(null);
        setConApp(new Set());
      } else {
        const ultimas: Record<string, string> = {};
        const app = new Set<string>();
        for (const f of (conexRes.data ?? []) as { user_id: string; ultima_vez: string; app_instalada?: boolean | null }[]) {
          if (!ultimas[f.user_id] || f.ultima_vez > ultimas[f.user_id]) ultimas[f.user_id] = f.ultima_vez;
          if (f.app_instalada === true) app.add(f.user_id);
        }
        setUltimaConexion(ultimas);
        setConApp(app);
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
  // Primero las sin leer (bandeja tipo correo) y, dentro, de la más nueva a la más vieja.
  const mejorasVisibles = useMemo(
    () =>
      (mejoras ?? [])
        .filter((m) => (filtroMejoras === "todas" || !m.leida) && (!filtroOrigen || m.origen === filtroOrigen))
        .sort((a, b) => Number(a.leida) - Number(b.leida) || b.created_at.localeCompare(a.created_at)),
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

  // Participación total de los clientes (suma de los contadores de cada uno) y cuántas personas participan.
  const participacion = useMemo(() => {
    const suma = (k: keyof Pick<UserRow, "chat_messages_count" | "product_chats_count" | "store_reviews_count">) => users.reduce((a, u) => a + u[k], 0);
    const quienes = (k: keyof Pick<UserRow, "chat_messages_count" | "product_chats_count" | "store_reviews_count">) => users.filter((u) => u[k] > 0).length;
    return {
      foro: suma("chat_messages_count"),
      foroPersonas: quienes("chat_messages_count"),
      chats: suma("product_chats_count"),
      chatsPersonas: quienes("product_chats_count"),
      conActividad: users.filter((u) => totalParticipation(u) > 0).length,
    };
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
    const conTelefono = delosUsuarios.filter((p) => conTelefonoDePerfil(p)).length;
    return { conAlgo, completos, pendientes, conFoto, conDireccion, conTelefono, porProvincia, porPais, porTramo, media };
  }, [users, perfiles]);

  const hayFiltros = !!filtroProvincia || !!filtroPais || !!filtroTramo || !!filtroEstado || soloActivos;
  const quitarFiltros = useCallback(() => {
    setFiltroProvincia(null);
    setFiltroPais(null);
    setFiltroTramo(null);
    setFiltroEstado(null);
    setSoloActivos(false);
    setDesplegado(null);
  }, []);

  const visibleUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const tramo = TRAMOS_EDAD.find((t) => t.id === filtroTramo) ?? null;
    const ahora = Date.now();
    const filtered = users.filter((u) => {
      const p = perfiles[u.user_id];
      if (soloActivos && !esActivo(u, ultimaConexion, ahora)) return false;
      if (filtroProvincia && p?.provincia !== filtroProvincia) return false;
      if (filtroPais && p?.pais !== filtroPais) return false;
      if (filtroEstado === "completo" && !perfilCompleto(p)) return false;
      if (filtroEstado === "pendiente" && ((u.role ?? "").toLowerCase() === "admin" || perfilCompleto(p))) return false;
      if (filtroEstado === "foto" && !p?.foto_url) return false;
      if (filtroEstado === "direccion" && !conDireccionDeEnvio(p)) return false;
      if (filtroEstado === "telefono" && !conTelefonoDePerfil(p)) return false;
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
      if (sortMode === "conexion") return (ultimaConexion?.[b.user_id] ?? "").localeCompare(ultimaConexion?.[a.user_id] ?? "");
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return sorted;
  }, [users, perfiles, search, sortMode, filtroProvincia, filtroPais, filtroTramo, filtroEstado, soloActivos, ultimaConexion]);

  // Cuántos clientes se han conectado en los últimos 7 días y cuántos usan la app instalada (para las cifras y el
  // filtro). Sin los administradores, como en Analítica: su propia visita al panel no cuenta.
  const activos7 = useMemo(
    () => users.filter((u) => esActivo(u, ultimaConexion)).length,
    [users, ultimaConexion]
  );
  const nConApp = useMemo(() => users.filter((u) => !esAdmin(u) && conApp.has(u.user_id)).length, [users, conApp]);

  // Seguridad: algo requiere atención (Supabase frena los correos de recuperar la contraseña).
  const atencionSeguridad = (usoContrasena?.limite ?? 0) > 0;

  // Ir a «Clientes» con un filtro puesto (desde las cifras y los contadores de Participación).
  const filtrarPor = useCallback(
    (estado: EstadoPerfil | "activos") => {
      setDesplegado(null);
      if (estado === "activos") setSoloActivos((v) => (tab === "clientes" ? !v : true));
      else setFiltroEstado((v) => (tab === "clientes" && v === estado ? null : estado));
      cambiarTab("clientes");
    },
    [tab, cambiarTab]
  );

  const irAFicha = (u: { user_id: string; email?: string | null; created_at?: string }) =>
    router.push({
      pathname: "/admin/cliente/[userId]",
      params: { userId: u.user_id, email: u.email ?? "", createdAt: u.created_at ?? "" },
    } as any);

  const valoracion = avgRating != null ? avgRating.toFixed(1).replace(".", ",") : "—";

  // 1) Cifras clave de arriba (la de la app solo si existe el dato).
  const cifras: { key: string; valor: string; etiqueta: string; icono?: IoniconName; onPress?: () => void; activa?: boolean }[] = [
    { key: "registrados", valor: String(users.length), etiqueta: "Registrados", onPress: () => cambiarTab("clientes") },
    ...(ultimaConexion
      ? [{ key: "activos", valor: String(activos7), etiqueta: "Activos 7 días", onPress: () => filtrarPor("activos"), activa: soloActivos }]
      : []),
    ...(perfilesOk
      ? [{ key: "completos", valor: String(resumenPerfiles.completos), etiqueta: "Perfil completo", onPress: () => filtrarPor("completo"), activa: filtroEstado === "completo" }]
      : []),
    ...(ultimaConexion ? [{ key: "app", valor: String(nConApp), etiqueta: "Con la app" }] : []),
    { key: "valoracion", valor: valoracion, etiqueta: "Valoración", icono: "star" as IoniconName, onPress: () => cambiarTab("participacion") },
  ];

  const nombreDe = (userId: string, email?: string | null) => {
    const p = perfiles[userId];
    return p?.nombre || p?.usuario ? [p?.nombre, p?.usuario ? `@${p.usuario}` : ""].filter(Boolean).join(" · ") : email ?? "Cliente";
  };

  // ---------- Pestaña «Clientes» ----------
  const opcionesFiltro =
    desplegado === "provincia"
      ? resumenPerfiles.porProvincia.slice(0, 20).map((p) => ({ id: p.valor, label: `${p.valor} (${p.n})`, activo: filtroProvincia === p.valor, elegir: () => setFiltroProvincia((v) => (v === p.valor ? null : p.valor)) }))
      : desplegado === "edad"
        ? resumenPerfiles.porTramo.map((t) => ({ id: t.id, label: `${t.label} (${t.n})`, activo: filtroTramo === t.id, elegir: () => setFiltroTramo((v) => (v === t.id ? null : t.id)) }))
        : desplegado === "pais"
          ? resumenPerfiles.porPais.slice(0, 12).map((p) => ({ id: p.valor, label: `${p.valor} (${p.n})`, activo: filtroPais === p.valor, elegir: () => setFiltroPais((v) => (v === p.valor ? null : p.valor)) }))
          : [];
  const tramoElegido = TRAMOS_EDAD.find((t) => t.id === filtroTramo);
  const ordenActual = ORDENES.find((o) => o.id === sortMode) ?? ORDENES[0];
  const conFiltros = !!ultimaConexion || perfilesOk;

  const contenidoClientes = (
    <View nativeID="usuarios-contenido-clientes" style={{ gap: 12 }}>
      {conFiltros ? (
        <View style={{ marginHorizontal: -16 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
            <View nativeID="usuarios-filtros" style={{ flexDirection: "row", gap: TACTIL.separacion }}>
              {ultimaConexion ? <Chip label={`Activos 7 días (${activos7})`} activo={soloActivos} onPress={() => setSoloActivos((v) => !v)} /> : null}
              {perfilesOk ? (
                <>
                  {(
                    [
                      ["completo", `Perfil completo (${resumenPerfiles.completos})`],
                      ["pendiente", `Faltan datos (${resumenPerfiles.pendientes})`],
                      ["foto", `Con foto (${resumenPerfiles.conFoto})`],
                      ...(direccionColumnas ? ([["direccion", `Con dirección (${resumenPerfiles.conDireccion})`]] as [EstadoPerfil, string][]) : []),
                      ...(telefonoColumna ? ([["telefono", `Con teléfono (${resumenPerfiles.conTelefono})`]] as [EstadoPerfil, string][]) : []),
                    ] as [EstadoPerfil, string][]
                  ).map(([id, label]) => (
                    <Chip key={id} nativeID={`usuarios-filtro-${id}`} label={label} activo={filtroEstado === id} onPress={() => setFiltroEstado((v) => (v === id ? null : id))} />
                  ))}
                  {resumenPerfiles.porProvincia.length ? (
                    <Chip
                      nativeID="usuarios-filtro-provincia"
                      label={filtroProvincia ?? "Provincia"}
                      activo={!!filtroProvincia}
                      desplegable
                      abierto={desplegado === "provincia"}
                      onPress={() => setDesplegado((d) => (d === "provincia" ? null : "provincia"))}
                    />
                  ) : null}
                  {resumenPerfiles.conAlgo ? (
                    <Chip
                      nativeID="usuarios-filtro-edad"
                      label={tramoElegido ? tramoElegido.label : "Edad"}
                      activo={!!tramoElegido}
                      desplegable
                      abierto={desplegado === "edad"}
                      onPress={() => setDesplegado((d) => (d === "edad" ? null : "edad"))}
                    />
                  ) : null}
                  {resumenPerfiles.porPais.length > 1 ? (
                    <Chip
                      nativeID="usuarios-filtro-pais"
                      label={filtroPais ?? "País"}
                      activo={!!filtroPais}
                      desplegable
                      abierto={desplegado === "pais"}
                      onPress={() => setDesplegado((d) => (d === "pais" ? null : "pais"))}
                    />
                  ) : null}
                </>
              ) : null}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {/* Lo que se despliega de Provincia, Edad o País: al elegir una opción se vuelve a plegar. */}
      {opcionesFiltro.length ? (
        <View nativeID="usuarios-filtro-opciones" style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion, borderRadius: 16, backgroundColor: COLORS.card, padding: 12 }}>
          {opcionesFiltro.map((o) => (
            <Chip
              key={o.id}
              label={o.label}
              activo={o.activo}
              onPress={() => {
                o.elegir();
                setDesplegado(null);
              }}
            />
          ))}
        </View>
      ) : null}

      {/* Cuántos salen, «Quitar filtros» y el orden (desplegable). */}
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 12, rowGap: TACTIL.separacion }}>
        <Text nativeID="usuarios-total" style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo }}>
          {visibleUsers.length === users.length ? plural(users.length, "cliente", "clientes") : `${visibleUsers.length} de ${plural(users.length, "cliente", "clientes")}`}
        </Text>
        {hayFiltros ? (
          <Pressable
            nativeID="usuarios-quitar-filtros"
            onPress={quitarFiltros}
            accessibilityRole="button"
            style={({ pressed }) => ({ minHeight: TACTIL.minimo, flexDirection: "row", alignItems: "center", gap: 4, opacity: pressed ? 0.7 : 1 })}
          >
            <Ionicons name="close-circle-outline" size={18} color={COLORS.accent} />
            <Text style={{ color: COLORS.accentText, fontWeight: "900", fontSize: TAMANOS.minimo }}>Quitar filtros</Text>
          </Pressable>
        ) : null}
        <Pressable
          nativeID="usuarios-orden"
          onPress={() => setDesplegado((d) => (d === "orden" ? null : "orden"))}
          accessibilityRole="button"
          accessibilityLabel={`Ordenar: ${ordenActual.label}`}
          accessibilityState={{ expanded: desplegado === "orden" }}
          style={({ pressed }) => ({ marginLeft: "auto", minHeight: TACTIL.minimo, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.7 : 1 })}
        >
          <Ionicons name="swap-vertical" size={18} color={COLORS.accent} />
          <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo }}>{ordenActual.label}</Text>
          <Ionicons name={desplegado === "orden" ? "chevron-up" : "chevron-down"} size={16} color={COLORS.text} />
        </Pressable>
      </View>
      {/* El orden, desplegado como los filtros: al elegir uno se vuelve a plegar. */}
      {desplegado === "orden" ? (
        <View
          nativeID="usuarios-orden-menu"
          style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: isMobile ? "flex-start" : "flex-end", gap: TACTIL.separacion, borderRadius: 16, backgroundColor: COLORS.card, padding: 12 }}
        >
          {ORDENES.filter((o) => o.id !== "conexion" || ultimaConexion).map((o) => (
            <Chip
              key={o.id}
              label={o.label}
              activo={sortMode === o.id}
              onPress={() => {
                setSortMode(o.id);
                setDesplegado(null);
              }}
            />
          ))}
        </View>
      ) : null}

      {visibleUsers.length === 0 ? (
        <View style={{ alignItems: "center", gap: 6, paddingVertical: 24, paddingHorizontal: 12 }}>
          <Ionicons name="people-outline" size={24} color={COLORS.muted} />
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.cuerpo, textAlign: "center" }}>No hay usuarios que coincidan.</Text>
          <Text style={{ color: COLORS.muted, fontSize: TAMANOS.cuerpo, lineHeight: 21, textAlign: "center" }}>
            Prueba a borrar el buscador o a quitar los filtros.
          </Text>
        </View>
      ) : (
        <View nativeID="usuarios-lista">
          {visibleUsers.map((u, i) => {
            const isAdmin = (u.role ?? "").toLowerCase() === "admin";
            const p = perfiles[u.user_id];
            const nombre = p?.nombre || "";
            const titulo = nombre || p?.usuario || u.email || "Sin email";
            const completo = perfilCompleto(p);
            const conexion = ultimaConexion ? (ultimaConexion[u.user_id] ? `Última conexión ${haceCuanto(ultimaConexion[u.user_id])}` : "Última conexión sin registrar") : "";
            const meta = [`Alta ${fmtDate(u.created_at)}`, completo && p?.updated_at ? `Perfil actualizado ${fmtDate(p.updated_at)}` : "", conexion].filter(Boolean).join(" · ");
            const datosParticipacion: [IoniconName, number, string, string][] = [
              ["chatbubbles-outline", u.chat_messages_count, "en el Foro", "mensajes en el Foro"],
              ["chatbubble-ellipses-outline", u.product_chats_count, u.product_chats_count === 1 ? "chat" : "chats", "chats de producto"],
              ["star-outline", u.store_reviews_count, u.store_reviews_count === 1 ? "reseña" : "reseñas", "reseñas"],
            ];
            return (
              <Pressable
                key={u.user_id}
                nativeID={`usuario-${u.user_id}`}
                onPress={() => irAFicha(u)}
                accessibilityRole="button"
                accessibilityLabel={`Ver ficha del cliente ${titulo}`}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 12,
                  paddingVertical: 14,
                  borderTopWidth: i ? 1 : 0,
                  borderTopColor: COLORS.border,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <View style={{ width: 44, height: 44, borderRadius: 22, overflow: "hidden", backgroundColor: COLORS.accent2, alignItems: "center", justifyContent: "center" }}>
                  {p?.foto_url ? (
                    <SmartImage uri={p.foto_url} alt={`Foto de ${p.nombre || u.email || "cliente"}`} contentFit="cover" style={{ width: "100%", height: "100%" }} />
                  ) : (
                    <Text style={{ color: COLORS.accentText, fontWeight: "900", fontSize: TAMANOS.cuerpo }}>{iniciales(nombre, u.email ?? "")}</Text>
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 8 }}>
                    <Text numberOfLines={1} style={{ flexShrink: 1, color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.cuerpo, lineHeight: 21 }}>
                      {titulo}
                    </Text>
                    {isAdmin ? <Text style={{ color: COLORS.accentText, fontWeight: "900", fontSize: TAMANOS.minimo }}>Administrador</Text> : null}
                  </View>
                  {perfilesOk ? (
                    <Text style={{ color: p ? COLORS.text : COLORS.muted, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 18 }}>{resumenDePerfil(p)}</Text>
                  ) : null}
                  {titulo !== u.email && u.email ? (
                    <Text numberOfLines={1} style={{ color: COLORS.muted, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 18 }}>
                      {u.email}
                    </Text>
                  ) : null}
                  <Text style={{ color: COLORS.muted, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 18 }}>{meta}</Text>
                  {/* Etiquetas (perfil, app, dirección) y participación, en una línea que baja si no cabe. */}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 14, rowGap: 4, marginTop: 2 }}>
                    {perfilesOk && !isAdmin ? (
                      completo ? (
                        <Etiqueta icon="checkmark-circle-outline" texto="Perfil completo" color={COLORS.success} />
                      ) : (
                        <Etiqueta icon="alert-circle-outline" texto={p ? `Faltan: ${faltaDelPerfil(p).join(", ")}` : "Aún no ha completado su perfil"} color={COLORS.danger} />
                      )
                    ) : null}
                    {conApp.has(u.user_id) ? <Etiqueta icon="phone-portrait-outline" texto="App" color={COLORS.text} /> : null}
                    {direccionColumnas && conDireccionDeEnvio(p) ? <Etiqueta icon="home-outline" texto="Con dirección" color={COLORS.text} /> : null}
                    {telefonoColumna && conTelefonoDePerfil(p) ? <Etiqueta icon="call-outline" texto="Con teléfono" color={COLORS.text} /> : null}
                    <View
                      accessibilityLabel={datosParticipacion.map(([, n, , largo]) => `${n} ${largo}`).join(", ")}
                      style={{ flexDirection: "row", alignItems: "center", gap: 12, marginLeft: isMobile ? 0 : "auto" }}
                    >
                      {datosParticipacion.map(([icono, n, corto]) => (
                        <View key={icono} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Ionicons name={icono} size={15} color={n ? COLORS.accent : COLORS.muted} />
                          <Text style={{ color: n ? COLORS.text : COLORS.muted, fontWeight: n ? "900" : "700", fontSize: TAMANOS.minimo }}>
                            {n} {corto}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.muted} style={{ marginTop: 12 }} />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );

  // ---------- Pestaña «Participación» ----------
  const anchoTarjeta: Ancho = isMobile ? "45%" : "30%";
  const contenidoParticipacion = (
    <View nativeID="usuarios-contenido-participacion" style={{ gap: 24 }}>
      <Seccion icon="pulse-outline" title="Actividad" extra={`${plural(participacion.conActividad, "cliente participa", "clientes participan")}`}>
        <View nativeID="usuarios-participacion" style={{ flexDirection: "row", flexWrap: "wrap", gap: isMobile ? TACTIL.separacion : 12 }}>
          <Tarjeta icono="chatbubbles-outline" titulo="Foro" valor={String(participacion.foro)} detalle={`mensajes de ${plural(participacion.foroPersonas, "persona", "personas")}`} ancho={anchoTarjeta} fila={isMobile} />
          <Tarjeta icono="chatbubble-ellipses-outline" titulo="Chats de producto" valor={String(participacion.chats)} detalle={`iniciados por ${plural(participacion.chatsPersonas, "persona", "personas")}`} ancho={anchoTarjeta} fila={isMobile} />
          <Tarjeta
            nativeID="usuarios-valoracion"
            icono="star-outline"
            titulo="Valoración media"
            valor={avgRating != null ? `${valoracion} / 5` : "—"}
            detalle={avgRating != null ? `de ${plural(reviewsCount, "reseña", "reseñas")}` : "sin reseñas todavía"}
            ancho={anchoTarjeta} fila={isMobile}
          />
          {usoResenas ? (
            <Tarjeta
              nativeID="usuarios-resenas-uso"
              icono="create-outline"
              titulo="Reseñas (30 días)"
              valor={String(usoResenas.publicadas)}
              detalle={`publicadas · con ideas sugeridas: ${usoResenas.conIdeas} · con emoji: ${usoResenas.conEmoji}${usoResenas.ideaMasUsada ? ` · la idea más usada: «${usoResenas.ideaMasUsada}»` : ""}`}
              ancho={anchoTarjeta} fila={isMobile}
            />
          ) : null}
          <Tarjeta icono="pricetags-outline" titulo="Solicitudes de venta" valor={String(sellRequestsCount)} detalle="en total, también sin sesión" ancho={anchoTarjeta} fila={isMobile} />
          <Tarjeta icono="construct-outline" titulo="Solicitudes de servicio" valor={String(serviceRequestsCount)} detalle="en total, también sin sesión" ancho={anchoTarjeta} fila={isMobile} />
          {usoSeguimientos ? (
            <Tarjeta
              nativeID="admin-uso-seguimientos"
              icono="locate-outline"
              titulo="«Mis seguimientos» (30 días)"
              valor={String(usoSeguimientos.personas)}
              detalle={`lo abrieron · deslizando ${usoSeguimientos.deslizando}`}
              ancho={anchoTarjeta} fila={isMobile}
            />
          ) : null}
          {numerosSeguimiento ? (
            <Tarjeta
              nativeID="admin-numeros-seguimiento"
              icono="barcode-outline"
              titulo="Números de seguimiento (30 días)"
              valor={String(numerosSeguimiento.anadidos)}
              detalle={`añadidos a una cuenta (por ${plural(numerosSeguimiento.personas, "persona", "personas")}) · intentos fallidos ${numerosSeguimiento.fallidos}`}
              ancho={anchoTarjeta} fila={isMobile}
            />
          ) : null}
        </View>
        <Detalle>
          Las solicitudes de venta y de servicio no piden iniciar sesión, así que el total incluye también las anónimas. Las enviadas con
          sesión iniciada aparecen en la ficha de su cliente.
        </Detalle>
      </Seccion>

      {/* Seguimiento de los perfiles (lo que cada cliente escribe en Mi cuenta → Tu perfil). Los contadores también
          sirven de filtro: tocar uno lleva a «Clientes» con ese filtro puesto. */}
      {perfilesOk ? (
        <Seccion nativeID="admin-perfiles" icon="id-card-outline" title="Perfiles de clientes">
          <FilaCifras>
            {(() => {
              const lista: { key: string; valor: string; etiqueta: string; filtro?: EstadoPerfil }[] = [
                { key: "con-perfil", valor: `${resumenPerfiles.conAlgo} de ${users.length}`, etiqueta: "Con perfil" },
                { key: "completo", valor: String(resumenPerfiles.completos), etiqueta: "Perfil completo", filtro: "completo" },
                { key: "pendiente", valor: String(resumenPerfiles.pendientes), etiqueta: "Faltan datos", filtro: "pendiente" },
                { key: "foto", valor: String(resumenPerfiles.conFoto), etiqueta: "Con foto", filtro: "foto" },
                { key: "edad", valor: resumenPerfiles.media != null ? `${Math.round(resumenPerfiles.media)} años` : "—", etiqueta: "Edad media" },
                { key: "provincias", valor: String(resumenPerfiles.porProvincia.length), etiqueta: "Provincias" },
                ...(direccionColumnas ? [{ key: "direccion", valor: String(resumenPerfiles.conDireccion), etiqueta: "Con dirección", filtro: "direccion" as EstadoPerfil }] : []),
                ...(telefonoColumna ? [{ key: "telefono", valor: String(resumenPerfiles.conTelefono), etiqueta: "Con teléfono", filtro: "telefono" as EstadoPerfil }] : []),
              ];
              const ancho: Ancho = isMobile ? (lista.length % 3 === 0 ? "30%" : "45%") : lista.length > 6 ? "20%" : "30%";
              return lista.map((c) => (
                <Cifra key={c.key} nativeID={`usuarios-perfil-${c.key}`} valor={c.valor} etiqueta={c.etiqueta} ancho={ancho} onPress={c.filtro ? () => filtrarPor(c.filtro!) : undefined} />
              ));
            })()}
          </FilaCifras>
          {resumenPerfiles.conAlgo === 0 ? (
            <Detalle>Todavía nadie ha rellenado su perfil. Cuando lo hagan, aquí verás de dónde son y qué edad tienen.</Detalle>
          ) : null}
          {embudoPerfil ? (
            <View style={{ gap: 4 }}>
              {/* «Completa tu perfil» (obligatorio al iniciar sesión): analítica propia de los últimos 30 días. */}
              <Detalle nativeID="admin-perfiles-embudo">
                «Completa tu perfil» (30 días): la vieron {embudoPerfil.vistos} · la completaron {embudoPerfil.completados} · cerraron sesión{" "}
                {embudoPerfil.salieron}
              </Detalle>
              {/* Foto de perfil: quién la encuadra y la usa, y quién deja el recorte a medias (30 días). */}
              <Detalle nativeID="admin-perfiles-fotos">
                Foto de perfil (30 días): la encuadraron {embudoPerfil.fotosEncuadradas} · dejaron el recorte {embudoPerfil.fotosCanceladas}
              </Detalle>
              {/* Dirección de envío: quién la guarda y quién paga con ella ya rellenada (30 días, personas distintas). */}
              {direccionColumnas ? (
                <Detalle nativeID="admin-perfiles-direccion">
                  Dirección de envío (30 días): la guardaron {embudoPerfil.direccionGuardada} · pagaron con ella ya rellenada{" "}
                  {embudoPerfil.pagoConDireccion}
                </Detalle>
              ) : null}
              {/* Teléfono: quién lo guarda (en Mi perfil o al comprar) y quién paga con el del perfil ya rellenado (30 días). */}
              {telefonoColumna ? (
                <Detalle nativeID="admin-perfiles-telefono">
                  Teléfono (30 días): lo guardaron {embudoPerfil.telefonoGuardado} · pagaron con el de su perfil ya rellenado{" "}
                  {embudoPerfil.pagoConTelefono}
                </Detalle>
              ) : null}
            </View>
          ) : null}
        </Seccion>
      ) : null}
    </View>
  );

  // ---------- Pestaña «Ideas de mejora» ----------
  const contenidoIdeas = (
    <View nativeID="usuarios-contenido-ideas" style={{ gap: 12 }}>
      {/* «Mejoras en la tienda»: las ideas que mandan los clientes (desde Blue, el pie de página o Mi cuenta). Primero
          las que no se han leído; los contadores también filtran. Tocar el nombre lleva a la ficha del cliente. */}
      {mejoras === null ? (
        <Text nativeID="admin-mejoras" style={{ color: COLORS.muted, fontWeight: "700", fontSize: TAMANOS.cuerpo, lineHeight: 21 }}>
          Ideas de mejora: falta aplicar en Supabase la migración 20261101200000_mejoras_tienda.sql. Hasta entonces, la cajita
          de la tienda dice que muy pronto se podrán enviar.
        </Text>
      ) : (
        <View nativeID="admin-mejoras" style={{ gap: 12 }}>
          <Seccion icon="bulb-outline" title={`Ideas de mejora${resumenMejoras.sinLeer ? ` · ${resumenMejoras.sinLeer} sin leer` : ""}`}>
            <Detalle nativeID="admin-mejoras-uso">
              Últimos 30 días: {plural(resumenMejoras.enviadas30, "idea enviada", "ideas enviadas")}
              {usoMejoras
                ? ` · abrieron la cajita ${usoMejoras.abiertas} ${usoMejoras.abiertas === 1 ? "vez" : "veces"} (${plural(usoMejoras.personas, "persona", "personas")}): Blue ${usoMejoras.porOrigen.blue} · pie de página ${usoMejoras.porOrigen.pie} · Mi cuenta ${usoMejoras.porOrigen.perfil}`
                : ""}
            </Detalle>
          </Seccion>
          <View style={{ marginHorizontal: -16 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
              <View nativeID="usuarios-ideas-filtros" style={{ flexDirection: "row", gap: TACTIL.separacion }}>
                <Chip label={`Sin leer (${resumenMejoras.sinLeer})`} activo={filtroMejoras === "sin-leer"} onPress={() => setFiltroMejoras("sin-leer")} />
                <Chip label={`Todas (${resumenMejoras.total})`} activo={filtroMejoras === "todas"} onPress={() => setFiltroMejoras("todas")} />
                {(Object.keys(ORIGENES_MEJORA) as OrigenMejora[]).map((o) => (
                  <Chip key={o} label={`${ORIGENES_MEJORA[o]} (${resumenMejoras.porOrigen[o]})`} activo={filtroOrigen === o} onPress={() => setFiltroOrigen((v) => (v === o ? null : o))} />
                ))}
              </View>
            </ScrollView>
          </View>
          {mejorasVisibles.length === 0 ? (
            <View style={{ alignItems: "center", gap: 6, paddingVertical: 20 }}>
              <Ionicons name="mail-open-outline" size={24} color={COLORS.muted} />
              <Text style={{ color: COLORS.muted, fontSize: TAMANOS.cuerpo, textAlign: "center", lineHeight: 21 }}>
                {resumenMejoras.total === 0
                  ? "Todavía nadie ha mandado ideas. Se envían desde Blue, el pie de página y Mi cuenta."
                  : "No hay ideas con este filtro: estás al día."}
              </Text>
            </View>
          ) : (
            <View nativeID="usuarios-ideas-bandeja" style={{ borderRadius: 20, backgroundColor: COLORS.card, paddingHorizontal: 16 }}>
              {mejorasVisibles.slice(0, 60).map((m, i) => {
                const u = users.find((x) => x.user_id === m.user_id);
                const quien = nombreDe(m.user_id, u?.email);
                return (
                  <View key={m.id} nativeID={`mejora-${m.id}`} style={{ flexDirection: "row", gap: 10, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.border }}>
                    {/* Punto azul = sin leer (como en el correo). */}
                    <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 8, backgroundColor: m.leida ? "transparent" : COLORS.accent }} />
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={{ color: COLORS.text, fontSize: TAMANOS.cuerpo, lineHeight: 21, fontWeight: m.leida ? "600" : "800" }}>{m.texto}</Text>
                      {/* Quién, cuándo y desde dónde; debajo, las dos acciones (ficha y leída) en una fila de 44 px. */}
                      <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, fontWeight: "700", lineHeight: 18 }}>
                        <Text style={{ color: COLORS.text, fontWeight: "900" }}>{quien}</Text> · {fmtDate(m.created_at)} · desde {ORIGENES_MEJORA[m.origen]}
                      </Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 20, rowGap: TACTIL.separacion }}>
                        <Pressable
                          onPress={() => irAFicha({ user_id: m.user_id, email: u?.email, created_at: u?.created_at })}
                          accessibilityRole="link"
                          accessibilityLabel={`Ver la ficha de ${quien}`}
                          style={({ pressed }) => ({ minHeight: TACTIL.minimo, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.7 : 1 })}
                        >
                          <Ionicons name="person-circle-outline" size={20} color={COLORS.accent} />
                          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.minimo }}>Ver ficha</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => marcarMejora(m.id, !m.leida)}
                          disabled={marcandoMejora === m.id}
                          accessibilityRole="button"
                          accessibilityLabel={m.leida ? "Marcar como no leída" : "Marcar como leída"}
                          style={({ pressed }) => ({
                            marginLeft: "auto",
                            minHeight: TACTIL.minimo,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                            opacity: marcandoMejora === m.id ? 0.5 : pressed ? 0.6 : 1,
                          })}
                        >
                          {/* Solo el icono y el texto, sin burbuja (dueño, 2026-11-04). */}
                          <Ionicons name={m.leida ? "mail-unread-outline" : "checkmark-done"} size={20} color={COLORS.accent} />
                          <Text style={{ color: m.leida ? COLORS.text : COLORS.accentText, fontWeight: "900", fontSize: TAMANOS.minimo }}>
                            {m.leida ? "Marcar sin leer" : "Marcar leída"}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}
    </View>
  );

  // ---------- Pestaña «Seguridad» ----------
  const anchoSeg = (n: number): Ancho => (isMobile ? (n === 3 ? "30%" : "45%") : 0);
  const contenidoSeguridad = (
    <View nativeID="usuarios-contenido-seguridad" style={{ gap: 24 }}>
      {!usoContrasena && !usoSeguridad && !moderacion && comentariosEliminados === null ? (
        <Detalle>Todavía no hay datos de seguridad: salen con la analítica propia y el registro de moderación del Foro.</Detalle>
      ) : null}

      {/* «¿Olvidaste tu contraseña?»: si los enlaces se piden, llegan a abrirse y terminan en una contraseña nueva, y por
          qué fallan (analítica propia, 30 días). Si Supabase frena los correos, el aviso rojo de lo que hace falta. */}
      {usoContrasena ? (
        <Seccion icon="key-outline" title="Recuperar contraseña" extra="30 días">
          <Recuadro nativeID="admin-contrasenas">
            {usoContrasena.limite ? (
              <View
                nativeID="admin-contrasenas-aviso"
                accessibilityRole="alert"
                style={{ flexDirection: "row", gap: 10, borderRadius: 14, borderWidth: 1, borderColor: COLORS.dangerBorder, backgroundColor: COLORS.dangerBg, padding: 12 }}
              >
                <Ionicons name="alert-circle" size={20} color={COLORS.danger} />
                <Text style={{ flex: 1, color: COLORS.danger, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                  Supabase ha frenado {plural(usoContrasena.limite, "correo", "correos")} por su límite de envíos: hace falta el correo propio (SMTP)
                  en Supabase → Authentication → Emails.
                </Text>
              </View>
            ) : null}
            <FilaCifras>
              <Cifra valor={String(usoContrasena.pedidos)} etiqueta="Enlaces pedidos" fondo={COLORS.bg} ancho={anchoSeg(3)} />
              <Cifra valor={String(usoContrasena.abiertos)} etiqueta="Abiertos" fondo={COLORS.bg} ancho={anchoSeg(3)} />
              <Cifra valor={String(usoContrasena.cambiadas)} etiqueta="Contraseñas cambiadas" fondo={COLORS.bg} ancho={anchoSeg(3)} />
            </FilaCifras>
            {usoContrasena.noSirvieron || usoContrasena.errores ? (
              <Detalle>
                {mayuscula(
                  [
                    usoContrasena.noSirvieron
                      ? `enlaces que no sirvieron ${usoContrasena.noSirvieron} (en otro navegador ${usoContrasena.otroNavegador}, caducados o ya usados ${usoContrasena.caducados})`
                      : "",
                    usoContrasena.errores ? `no se pudieron pedir ${usoContrasena.errores}` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")
                )}
              </Detalle>
            ) : null}
            {/* Mínimo de 8 caracteres para las contraseñas nuevas: cuántas veces se pidió una más larga y dónde. */}
            <Detalle nativeID="admin-contrasenas-cortas">
              Contraseñas de al menos {CONTRASENA_MINIMA} caracteres (30 días): se pidió una más larga {usoContrasena.cortas}{" "}
              {usoContrasena.cortas === 1 ? "vez" : "veces"}
              {usoContrasena.cortas
                ? ` (al crear la cuenta ${usoContrasena.cortasRegistro} · al recuperarla ${usoContrasena.cortasRecuperar} · en Mi perfil ${usoContrasena.cortasPerfil})`
                : ""}
            </Detalle>
          </Recuadro>
        </Seccion>
      ) : null}

      {/* Mi perfil → «Inicio de sesión y seguridad»: cambios de correo (pedidos y terminados) y de contraseña (30 días). */}
      {usoSeguridad ? (
        <Seccion icon="shield-checkmark-outline" title="Inicio de sesión y seguridad" extra="30 días">
          <Recuadro nativeID="admin-seguridad">
            <FilaCifras>
              <Cifra valor={String(usoSeguridad.correoPedidos)} etiqueta="Cambios de correo pedidos" fondo={COLORS.bg} ancho={anchoSeg(3)} />
              <Cifra valor={String(usoSeguridad.correoCambiados)} etiqueta="Terminados" fondo={COLORS.bg} ancho={anchoSeg(3)} />
              <Cifra valor={String(usoSeguridad.contrasenas)} etiqueta="Contraseñas cambiadas desde Mi perfil" fondo={COLORS.bg} ancho={anchoSeg(3)} />
            </FilaCifras>
            {usoSeguridad.contrasenaErrores || usoSeguridad.correoErrores ? (
              <Detalle>
                {mayuscula(
                  [
                    usoSeguridad.contrasenaErrores ? `intentos fallidos ${usoSeguridad.contrasenaErrores} (contraseña actual equivocada ${usoSeguridad.actualMal})` : "",
                    usoSeguridad.correoErrores ? `cambios de correo que no se pudieron pedir ${usoSeguridad.correoErrores}` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")
                )}
              </Detalle>
            ) : null}
          </Recuadro>
        </Seccion>
      ) : null}

      {/* Moderación del Foro: lo que eliminan o silencian los administradores (tocando un mensaje en el Foro). Con el
          registro de moderación, cuenta los últimos 30 días; sin él, solo los comentarios ocultos. */}
      {moderacion || comentariosEliminados !== null ? (
        <Seccion icon="chatbubbles-outline" title="Moderación del Foro" extra={moderacion ? "30 días" : undefined}>
          <Recuadro nativeID="admin-foro-moderacion">
            {moderacion ? (
              <FilaCifras>
                <Cifra valor={String(moderacion.mensajes)} etiqueta="Mensajes eliminados" fondo={COLORS.bg} ancho={anchoSeg(4)} />
                <Cifra valor={String(moderacion.comentarios)} etiqueta="Comentarios eliminados" fondo={COLORS.bg} ancho={anchoSeg(4)} />
                <Cifra valor={String(moderacion.silencios)} etiqueta="Silencios" fondo={COLORS.bg} ancho={anchoSeg(4)} />
                <Cifra valor={String(silenciados?.length ?? 0)} etiqueta="Silenciados ahora" fondo={COLORS.bg} ancho={anchoSeg(4)} />
              </FilaCifras>
            ) : (
              <FilaCifras>
                <Cifra valor={String(comentariosEliminados ?? 0)} etiqueta="Comentarios de noticias eliminados" fondo={COLORS.bg} ancho={isMobile ? "100%" : 0} />
              </FilaCifras>
            )}
            {moderacion && normasLeidas !== null ? <Detalle>Leyeron las normas desde el aviso: {normasLeidas}</Detalle> : null}
          </Recuadro>
          {/* Las Normas del Foro (las que enlaza el aviso de silencio) se editan en Políticas, como las demás. */}
          <Pressable
            onPress={() => router.push("/admin/policies")}
            accessibilityRole="link"
            accessibilityLabel="Ver o editar las Normas del Foro"
            style={({ pressed }) => ({ minHeight: TACTIL.minimo, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, opacity: pressed ? 0.7 : 1 })}
          >
            <Ionicons name="document-text-outline" size={20} color={COLORS.accent} />
            <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.cuerpo }}>Ver o editar las Normas del Foro</Text>
          </Pressable>
        </Seccion>
      ) : null}

      {/* Quién está silenciado ahora en el Foro, hasta cuándo y por qué, con «Quitar silencio». */}
      {silenciados && silenciados.length ? (
        <Seccion nativeID="admin-silenciados" icon="volume-mute-outline" title="Silenciados en el Foro" extra={String(silenciados.length)}>
          <View style={{ borderRadius: 20, backgroundColor: COLORS.card, paddingHorizontal: 16 }}>
            {silenciados.map((s, i) => {
              const u = users.find((x) => x.user_id === s.user_id);
              const p = perfiles[s.user_id];
              const quien = p?.usuario ? `@${p.usuario}` : u?.email ?? "Cliente";
              return (
                <View key={s.user_id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.border }}>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.cuerpo }}>
                      {quien}
                    </Text>
                    <Text style={{ color: COLORS.muted, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 18 }}>
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
                      minHeight: TACTIL.minimo,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      opacity: quitandoSilencio === s.user_id ? 0.5 : pressed ? 0.7 : 1,
                    })}
                  >
                    <Ionicons name="volume-high-outline" size={20} color={COLORS.accent} />
                    <Text style={{ color: COLORS.accentText, fontWeight: "900", fontSize: TAMANOS.minimo }}>Quitar silencio</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </Seccion>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      {/* Barra fija y compacta (volver + título centrado), igual en todo el panel. */}
      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
          paddingHorizontal: 16,
          paddingTop: 8 + insets.top,
          paddingBottom: 8,
        }}
      >
        <View style={{ width: "100%", maxWidth: 960, alignSelf: "center", minHeight: TACTIL.minimo, justifyContent: "center" }}>
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
              width: 44,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </Pressable>
          <Text numberOfLines={1} style={{ paddingHorizontal: 48, color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.destacado, textAlign: "center" }}>
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
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 48 + insets.bottom, alignItems: "center" }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={CIERRE_TECLADO}
          >
            <View style={{ width: "100%", maxWidth: 960, gap: 16 }}>
              {/* 1) Buscador (16 px: con menos, Safari del iPhone hace zoom al escribir). */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  minHeight: CAMPO.alto,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.card,
                  paddingLeft: 14,
                }}
              >
                <Ionicons name="search" size={20} color={COLORS.accent} />
                <TextInput
                  nativeID="usuarios-buscador"
                  value={search}
                  onChangeText={(v) => {
                    setSearch(v);
                    if (tab !== "clientes") cambiarTab("clientes");
                  }}
                  // Corto para que quepa entero a 360 px (también busca por @usuario, país, CP y localidad).
                  placeholder={perfilesOk ? "Nombre, email o provincia…" : "Buscar por email…"}
                  placeholderTextColor={COLORS.muted}
                  accessibilityLabel="Buscar clientes"
                  autoCapitalize="none"
                  style={{ flex: 1, minWidth: 0, minHeight: CAMPO.alto, paddingHorizontal: 10, color: COLORS.text, fontSize: CAMPO.letra }}
                />
                {search ? (
                  <Pressable
                    onPress={() => setSearch("")}
                    accessibilityRole="button"
                    accessibilityLabel="Borrar la búsqueda"
                    style={({ pressed }) => ({ width: TACTIL.minimo, height: TACTIL.minimo, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
                  >
                    <Ionicons name="close-circle" size={20} color={COLORS.muted} />
                  </Pressable>
                ) : null}
              </View>

              {/* 2) Cifras clave en fila (número grande, etiqueta debajo); tocarlas filtra o abre su pestaña. */}
              <FilaCifras nativeID="usuarios-cifras">
                {cifras.map((c) => (
                  <Cifra
                    key={c.key}
                    nativeID={`usuarios-cifra-${c.key}`}
                    valor={c.valor}
                    etiqueta={c.etiqueta}
                    icono={c.icono}
                    onPress={c.onPress}
                    activa={c.activa}
                    ancho={anchoCifra(cifras.length, isMobile)}
                    grande={!isMobile}
                  />
                ))}
              </FilaCifras>

              {!!screenErr && (
                <View style={{ borderRadius: 14, backgroundColor: COLORS.dangerBg, padding: 12 }}>
                  <Text style={{ color: COLORS.danger, fontWeight: "800", fontSize: TAMANOS.cuerpo, lineHeight: 21, textAlign: "center" }}>{screenErr}</Text>
                </View>
              )}

              {/* 3) Pestañas deslizables (con su número), recordadas en la URL (?tab=). */}
              <View style={{ borderBottomWidth: 1, borderBottomColor: COLORS.border, marginHorizontal: -16 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, flexGrow: 1, justifyContent: isMobile ? "flex-start" : "center" }}>
                  <View nativeID="usuarios-pestanas" role="tablist" style={{ flexDirection: "row", gap: 22 }}>
                    {PESTANAS.map((t) => {
                      const activa = tab === t;
                      const n = t === "clientes" ? users.length : t === "ideas" ? resumenMejoras.sinLeer : 0;
                      const aviso = t === "seguridad" && atencionSeguridad;
                      return (
                        <Pressable
                          key={t}
                          nativeID={`usuarios-pestana-${t}`}
                          onPress={() => {
                            setDesplegado(null);
                            cambiarTab(t);
                          }}
                          role="tab"
                          aria-selected={activa}
                          accessibilityLabel={`${NOMBRE_PESTANA[t]}${n ? ` (${n}${t === "ideas" ? " sin leer" : ""})` : ""}${aviso ? " (requiere atención)" : ""}`}
                          style={({ pressed }) => ({ minHeight: 48, justifyContent: "flex-end", opacity: pressed ? 0.7 : 1 })}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingBottom: 9 }}>
                            <Text style={{ color: activa ? COLORS.text : COLORS.muted, fontWeight: "900", fontSize: TAMANOS.cuerpo }}>{NOMBRE_PESTANA[t]}</Text>
                            {n ? <Text style={{ color: activa || t === "ideas" ? colorTextoAzul(TAMANOS.minimo) : COLORS.muted, fontWeight: "900", fontSize: TAMANOS.minimo }}>{n}</Text> : null}
                            {aviso ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.danger }} /> : null}
                          </View>
                          <View style={{ height: 3, borderRadius: 2, backgroundColor: activa ? COLORS.accent : "transparent" }} />
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>

              {tab === "clientes" ? contenidoClientes : null}
              {tab === "participacion" ? contenidoParticipacion : null}
              {tab === "ideas" ? contenidoIdeas : null}
              {tab === "seguridad" ? contenidoSeguridad : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}
