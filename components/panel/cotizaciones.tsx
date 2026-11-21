/**
 * Archivo: components/panel/cotizaciones.tsx (antes app/admin/cotizaciones.tsx, que ahora solo la descarga al abrirla)
 * Función: pantalla de administración «Cotizaciones», en la dirección /admin/cotizaciones.
 * Para qué sirve: el administrador revisa las solicitudes de venta que los clientes envían con «Vender ahora» (datos, fotos y vídeo), cambia su estado (nuevo, revisado, contactado, descartado) y las borra.
 * Conectado con: lib/supabase.ts (tablas sell_requests y sell_request_media, bucket privado sell-request-media), components/FotosVideoVenta.tsx, components/VenderAhoraModal.tsx, lib/admin/productos.componentes.tsx y productos.utilidades.ts, constants/temaTienda.ts, components/admin/PiezasPanelAdmin.tsx.
 * Utilizado por: Expo Router (dirección /admin/cotizaciones, protegida por app/admin/_layout.tsx); la enlaza la tarjeta «Cotizaciones» de app/admin/index.tsx.
 * Dependencias: react, react-native.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: panel admin donde aparecen las solicitudes de venta que envían
 * los clientes desde el formulario "Vender ahora" (components/
 * VenderAhoraModal.tsx). Ya no llega nada por email: todo se guarda en la
 * tabla "sell_requests" de Supabase y se revisa aquí.
 *
 * Cómo funciona:
 * - Lee/escribe directamente en la tabla "sell_requests" (select, update de
 *   "status", delete). El INSERT lo hace el cliente público desde el
 *   formulario; aquí solo se listan, se cambia su estado y se pueden
 *   borrar.
 * - Estado de cada solicitud: nuevo → revisado → contactado, o descartado
 *   en cualquier momento. Son botones, no un desplegable, para poder
 *   avanzar el flujo con un solo toque.
 * - Cada solicitud muestra los datos del cliente (nombre, apellido, género,
 *   confirmación de mayoría de edad), el método/valor de contacto elegido y
 *   cómo entrega el artículo (recogida en su domicilio con dirección, o él
 *   se desplaza, con su disponibilidad horaria).
 * - «Cambio desde la cesta» (mejora 13, 2026-11-15): las solicitudes que llegan de la línea de la cesta salen con su
 *   etiqueta («· para comprar: …») y tienen su filtro (#cotizaciones-filtro-cesta).
 * - «Cómo quiere que le contactemos» (2026-11-17, obligatorio en «Vender ahora»): cada fila lleva su etiqueta («Por
 *   correo (Gmail)» o «Por el chat de la tienda», #cotizacion-via-<id>), el detalle lo dice aparte del correo y hay
 *   pastillas «Por correo» y «Por chat» con recuento (#cotizaciones-filtro-correo, #cotizaciones-filtro-chat).
 * - «Faltan fotos o vídeo» (2026-11-16, fotos y vídeo obligatorios en «Vender ahora»): las solicitudes con menos de 7
 *   fotos o sin vídeo (antiguas o con una subida que falló) salen con esa etiqueta (#cotizacion-faltan-media-<id>) y
 *   tienen su pastilla con recuento (#cotizaciones-filtro-faltan-media); solo si los adjuntos se han podido cargar.
 * - Filtro rápido por estado + buscador por nombre, artículo, ciudad o
 *   contacto.
 * - Rediseño PANRED3 (tanda 3, 2026-11-16; components/admin/PiezasPanelAdmin.tsx, como Usuarios, Pedidos, Categorías y
 *   Productos): cifras que filtran (Total, Nuevas, Revisadas, Contactadas), buscador de 16 px, pastillas de 44 px con su
 *   recuento (los cuatro estados y «Cambio desde la cesta»), filas compactas (artículo, etiqueta de color del estado,
 *   cliente, ciudad, precio esperado y fecha; etiquetas de la cesta, la avería, los adjuntos y la mayoría de edad sin
 *   confirmar) y, al tocar una, el detalle por bloques (Artículo, Cliente, Entrega y Fotos y vídeo) con las acciones
 *   abajo (Marcar revisada, Marcar contactada, Descartar y borrar).
 * - El fondo oscuro semitransparente detrás del modal de confirmación de
 *   borrado se mantiene oscuro a propósito.
 * - Si el cliente adjuntó fotos/vídeo, el detalle los ENSEÑA (dueño, 2026-11-16: «no me deja visualizar los archivos
 *   multimedia»): miniaturas que abren la foto en grande y «Ver vídeo» en otra pestaña, con enlaces firmados de 10
 *   minutos (GaleriaAdjuntos y components/FotosVideoVenta.tsx → enlacesSellRequestMedia()); el almacén sigue privado.
 *   Debajo sigue el botón «Descargar» por archivo (downloadSellRequestMedia()). Si no adjuntó nada, el bloque lo dice
 *   («El cliente no adjuntó fotos ni vídeo», #cotizacion-sin-fotos-<id>), para no confundirlo con un fallo.
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase para leer/escribir solicitudes.
 * - sql/sell_requests.sql → define la tabla y sus políticas RLS.
 * - sql/sell_request_media.sql → define la tabla "sell_request_media" y el
 *   bucket privado "sell-request-media" con sus políticas RLS.
 * - components/VenderAhoraModal.tsx → origen de cada fila (INSERT público)
 *   y de sus archivos adjuntos.
 * - components/FotosVideoVenta.tsx → tipos y descarga de cada archivo.
 * - components/admin/PiezasPanelAdmin.tsx → cifras, buscador, pastillas, filas y bloques.
 * - app/admin/index.tsx → origen habitual de la navegación a esta pantalla.
 * - app/admin/_layout.tsx → registra esta ruta ("cotizaciones") dentro del
 *   Stack protegido del panel admin.
 * - pruebas/perfil-datos.mjs → secciones CAMBC, TM5 y PANRED3.
 *
 * Rendimiento: load() limita "sell_requests" a 200 filas y pide los
 * adjuntos de "sell_request_media" solo de esas solicitudes (.in) con su
 * propio límite de 2200 (hasta 11 por solicitud), para no crecer sin control con el tiempo.
 *
 * Scroll: cabecera fija y compacta (volver + título centrado) y, debajo, todo en un único ScrollView (flex 1, margen
 * final 48 px + zona segura). El precio esperado, si el cliente escribió solo un número, se muestra como el resto de
 * precios (150,00€).
 *
 * Tamaños del móvil (grupo 5, 2026-11-13; constants/temaTienda.ts): ningún texto de menos de 13 px, grises
 * desde COLORES_TEXTO.secundario, botones y filtros de 44 px y el buscador de 16 px y 48 de alto.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Linking, Modal, Pressable, ScrollView, StatusBar, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { MIN_SELL_IMAGES, downloadSellRequestMedia, enlacesSellRequestMedia, type FilaArchivoVenta } from "../../components/FotosVideoVenta";
import {
  CabeceraPanel,
  CargandoPanel,
  AvisoPanel,
  BotonChipPanel,
  EstadoVacioPanel,
  BotonIconoPanel,
  PieVentana,
} from "../../lib/admin/productos.componentes";
import { CIERRE_TECLADO, formatearEurosPanel, precioSeguro } from "../../lib/admin/productos.utilidades";
import { COLORES_TEXTO, colorTextoAzul, TAMANOS } from "../../constants/temaTienda";
import { leerMarcaCambioCesta } from "../../components/VenderAhoraModal";
import {
  AccionTexto,
  Bloque,
  Buscador,
  Chip,
  Cifra,
  Dato,
  Detalle,
  DetalleFila,
  Etiqueta,
  EtiquetaColor,
  FilaCifras,
  FilaLista,
  FilaPastillas,
  ListaVacia,
  Miniatura,
  RecuentoLista,
  useDesplegables,
  type Tono,
} from "../../components/admin/PiezasPanelAdmin";

const COLORS = {
  bg: "#FFFFFF",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: COLORES_TEXTO.secundario,
  success: "#15803D",
  warning: "#92660B",
  danger: "#B91C1C",
};

// Las fotos y el vídeo de una solicitud, para VERLOS en el panel (dueño, 2026-11-16): miniaturas de 96 px que abren la
// foto en grande; el vídeo se abre en otra pestaña. Los enlaces se firman al abrir el detalle (10 minutos).
function GaleriaAdjuntos({ idSolicitud, media }: { idSolicitud: string; media: FilaArchivoVenta[] }) {
  const [enlaces, setEnlaces] = useState<Record<string, string> | null>(null);
  const [fallo, setFallo] = useState(false);
  const [grande, setGrande] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    enlacesSellRequestMedia(media)
      .then((e) => vivo && setEnlaces(e))
      .catch(() => vivo && setFallo(true));
    return () => {
      vivo = false;
    };
  }, [media]);
  if (fallo) return <Detalle color={COLORS.danger}>No se han podido cargar las fotos. Usa «Descargar» o vuelve a abrir la solicitud.</Detalle>;
  if (!enlaces) return <Detalle>Cargando las fotos…</Detalle>;
  let foto = 0;
  return (
    <View nativeID={`cotizacion-galeria-${idSolicitud}`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {media.map((m) => {
        const url = enlaces[m.storage_path];
        if (!url) return null;
        if (m.kind === "video") {
          return (
            <Pressable
              key={m.id}
              nativeID={`cotizacion-ver-video-${m.id}`}
              accessibilityRole="button"
              accessibilityLabel="Ver el vídeo"
              onPress={() => Linking.openURL(url)}
              style={{ width: 96, height: 96, borderRadius: 12, backgroundColor: "#0B2138", alignItems: "center", justifyContent: "center", gap: 4 }}
            >
              <Ionicons name="play-circle-outline" size={32} color="#FFFFFF" />
              <Text style={{ color: "#FFFFFF", fontSize: TAMANOS.minimo, fontWeight: "800" }}>Ver vídeo</Text>
            </Pressable>
          );
        }
        foto += 1;
        const n = foto;
        return (
          <Pressable
            key={m.id}
            nativeID={`cotizacion-ver-foto-${m.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Ver la foto ${n} en grande`}
            onPress={() => setGrande(url)}
            style={{ width: 96, height: 96, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: COLORS.border, backgroundColor: "#F8FBFE" }}
          >
            <Image source={{ uri: url }} style={{ width: 96, height: 96 }} resizeMode="cover" />
          </Pressable>
        );
      })}
      <Modal visible={!!grande} transparent animationType="fade" onRequestClose={() => setGrande(null)}>
        <Pressable
          nativeID="cotizacion-foto-grande"
          accessibilityRole="button"
          accessibilityLabel="Cerrar la foto"
          onPress={() => setGrande(null)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          {grande ? <Image source={{ uri: grande }} style={{ width: "100%", height: "85%" }} resizeMode="contain" /> : null}
          <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 }}>
            <Ionicons name="close-circle-outline" size={22} color="#FFFFFF" />
            <Text style={{ color: "#FFFFFF", fontSize: TAMANOS.cuerpo, fontWeight: "800" }}>Cerrar</Text>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// Ancho máximo centrado para pantallas grandes (web/tablet); en móvil ocupa el 100%.
const columnStyle = { width: "100%", maxWidth: 1160, alignSelf: "center" } as const;
const modalColumnStyle = { width: "100%", maxWidth: 560, alignSelf: "center" } as const;

type SellRequestStatus = "nuevo" | "revisado" | "contactado" | "descartado";
type MetodoContacto = "whatsapp" | "gmail" | "instagram" | "facebook" | "tiktok";
type OpcionVenta = "domicilio" | "entrega";
type Disponibilidad = "manana" | "mediodia" | "tardenoche";
type Genero = "masculino" | "femenino";

type SellRequestRow = {
  id: string;
  created_at: string;
  updated_at: string;
  nombre: string;
  apellido: string;
  articulo: string;
  funciona_bien: boolean;
  motivo_venta: string | null;
  descripcion_problema: string | null;
  ciudad: string;
  precio_estimado: string;
  metodo_contacto: MetodoContacto | null;
  contacto: string | null;
  opcion_venta: OpcionVenta;
  direccion: string | null;
  disponibilidad: Disponibilidad | null;
  mayor_edad: boolean;
  genero: Genero;
  status: SellRequestStatus;
};

const STATUS_LABEL: Record<SellRequestStatus, string> = {
  nuevo: "Nueva",
  revisado: "Revisada",
  contactado: "Contactada",
  descartado: "Descartada",
};

// Etiqueta de color de cada estado (texto oscuro sobre fondo claro, como en Pedidos).
const STATUS_TONO: Record<SellRequestStatus, Tono> = {
  nuevo: "amarillo",
  revisado: "azul",
  contactado: "verde",
  descartado: "gris",
};

const METODO_LABEL: Record<MetodoContacto, string> = {
  whatsapp: "WhatsApp",
  gmail: "Gmail",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

// Cómo quiere el cliente que le contactemos (obligatorio en «Vender ahora»). El chat se guarda con metodo_contacto vacío
// y contacto «Chat de la tienda»; el correo, con metodo_contacto «gmail» y su dirección en contacto.
type ViaContacto = "correo" | "chat" | "otro" | "ninguno";
const CONTACTO_CHAT = "Chat de la tienda";
function viaContacto(r: SellRequestRow): ViaContacto {
  if (r.metodo_contacto === "gmail") return "correo";
  if (!r.metodo_contacto && r.contacto === CONTACTO_CHAT) return "chat";
  if (r.metodo_contacto || r.contacto) return "otro";
  return "ninguno";
}
function textoVia(r: SellRequestRow): string {
  const via = viaContacto(r);
  if (via === "correo") return "Por correo (Gmail)";
  if (via === "chat") return "Por el chat de la tienda";
  if (via === "otro") return r.metodo_contacto ? `Por ${METODO_LABEL[r.metodo_contacto]}` : "Otra forma";
  return "Sin indicar";
}

const DISPONIBILIDAD_LABEL: Record<Disponibilidad, string> = {
  manana: "Mañana",
  mediodia: "Mediodía",
  tardenoche: "Tarde y noche",
};

const GENERO_LABEL: Record<Genero, string> = {
  masculino: "Masculino",
  femenino: "Femenino",
};

type FiltroEstado = SellRequestStatus | "todas";
const PASTILLAS: [FiltroEstado, string][] = [
  ["todas", "Todas"],
  ["nuevo", "Nuevas"],
  ["revisado", "Revisadas"],
  ["contactado", "Contactadas"],
  ["descartado", "Descartadas"],
];

// El precio esperado lo escribe el cliente a mano ("150€", "1.200",
// "unos 100"...). Si es solo un número, se muestra con dos decimales y coma
// como el resto de precios (150,00€); si no, tal cual lo escribió.
function formatPrecioEstimado(raw: string | null | undefined) {
  const s = String(raw ?? "").trim();
  if (!s) return "-";
  if (/^\d+(?:[.\s]\d{3})*(?:[.,]\d{1,2})?\s*€?$/.test(s)) return formatearEurosPanel(precioSeguro(s));
  return s;
}

function fecha(iso: string | null | undefined, conHora = false) {
  if (!iso) return "-";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "-";
  return new Date(t).toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    ...(conHora ? { year: "numeric", hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Europe/Madrid",
  });
}

// «Cambio de consola» desde la cesta (mejora 13, 2026-11-15): la marca que el formulario pone delante del motivo o del
// problema (components/VenderAhoraModal.tsx → marcaCambioCesta). Se enseña como etiqueta y se quita del texto.
const marcaDe = (r: SellRequestRow) => leerMarcaCambioCesta(r.funciona_bien ? r.motivo_venta : r.descripcion_problema);
const textoCesta = (para: string | null | undefined) => (para ? `Cambio desde la cesta · para comprar: ${para}` : "Cambio desde la cesta");

export default function AdminCotizaciones() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const sectionGap = isMobile ? 18 : 22;
  const insets = useSafeAreaInsets();
  const desplegables = useDesplegables();

  const [loading, setLoading] = useState(true);
  const [screenErr, setScreenErr] = useState<string | null>(null);

  const [items, setItems] = useState<SellRequestRow[]>([]);
  const itemsRef = useRef<SellRequestRow[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FiltroEstado>("todas");
  // «Cambio desde la cesta» (mejora 13): solo las solicitudes que llegan de la línea de la cesta.
  const [soloCesta, setSoloCesta] = useState(false);
  const cuantasCesta = useMemo(() => items.filter((r) => marcaDe(r).desdeCesta).length, [items]);
  // Filtro por cómo quiere que le contactemos (correo o chat de la tienda).
  const [filtroVia, setFiltroVia] = useState<"correo" | "chat" | null>(null);
  const cuantasVia = (v: ViaContacto) => items.filter((r) => viaContacto(r) === v).length;
  const [confirmDelete, setConfirmDelete] = useState<SellRequestRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Fotos/vídeo adjuntos por solicitud (tabla "sell_request_media"),
  // agrupados por sell_request_id. Si la tabla todavía no existe (falta
  // ejecutar sql/sell_request_media.sql) se deja vacío sin romper el resto
  // del panel.
  const [mediaByRequest, setMediaByRequest] = useState<Record<string, FilaArchivoVenta[]>>({});
  const [downloadingMediaId, setDownloadingMediaId] = useState<string | null>(null);
  const [mediaErr, setMediaErr] = useState<string | null>(null);
  // «Faltan fotos o vídeo» (2026-11-16, fotos y vídeo obligatorios en «Vender ahora»): menos de 7 fotos o sin vídeo
  // (solicitudes antiguas o una subida que falló). Solo se marca si los adjuntos se han podido cargar.
  const [mediaCargada, setMediaCargada] = useState(false);
  const [soloFaltaMedia, setSoloFaltaMedia] = useState(false);
  const faltaMedia = useCallback(
    (r: SellRequestRow) => {
      if (!mediaCargada) return false;
      const lista = mediaByRequest[r.id] ?? [];
      return lista.filter((m) => m.kind === "image").length < MIN_SELL_IMAGES || !lista.some((m) => m.kind === "video");
    },
    [mediaByRequest, mediaCargada]
  );
  const cuantasFaltaMedia = useMemo(() => items.filter(faltaMedia).length, [items, faltaMedia]);

  const cuenta = (f: FiltroEstado) => (f === "todas" ? items.length : items.filter((x) => x.status === f).length);

  const q = search.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    return items.filter((r) => {
      if (statusFilter !== "todas" && r.status !== statusFilter) return false;
      if (soloCesta && !marcaDe(r).desdeCesta) return false;
      if (soloFaltaMedia && !faltaMedia(r)) return false;
      if (filtroVia && viaContacto(r) !== filtroVia) return false;
      if (!q) return true;

      return (
        String(r.articulo ?? "").toLowerCase().includes(q) ||
        String(r.nombre ?? "").toLowerCase().includes(q) ||
        String(r.apellido ?? "").toLowerCase().includes(q) ||
        String(r.ciudad ?? "").toLowerCase().includes(q) ||
        String(r.contacto ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, q, statusFilter, soloCesta, soloFaltaMedia, faltaMedia, filtroVia]);

  async function load() {
    setLoading(true);
    setScreenErr(null);

    try {
      const res = await supabase
        .from("sell_requests")
        .select(
          "id,created_at,updated_at,nombre,apellido,articulo,funciona_bien,motivo_venta,descripcion_problema,ciudad,precio_estimado,metodo_contacto,contacto,opcion_venta,direccion,disponibilidad,mayor_edad,genero,status"
        )
        .order("created_at", { ascending: false })
        .limit(200);

      if (res.error) throw res.error;

      const rows = (res.data ?? []) as SellRequestRow[];
      setItems(rows);

      // Aparte, y sin bloquear la lista si falla: los archivos adjuntos.
      // Se piden solo los de las solicitudes ya cargadas (.in) y con un
      // límite de seguridad, en vez de traer toda la tabla de adjuntos.
      try {
        const requestIds = rows.map((r) => r.id);
        if (!requestIds.length) {
          setMediaByRequest({});
          setMediaCargada(true);
          return;
        }

        const mediaRes = await supabase
          .from("sell_request_media")
          .select("id,sell_request_id,kind,storage_path,file_name,mime_type,size_bytes,duration_seconds,sort_order,created_at")
          .in("sell_request_id", requestIds)
          .order("sell_request_id", { ascending: true })
          .order("sort_order", { ascending: true })
          // Hasta 11 archivos por solicitud (10 fotos + 1 vídeo) de las 200 cargadas.
          .limit(2200);

        if (mediaRes.error) throw mediaRes.error;

        const grouped: Record<string, FilaArchivoVenta[]> = {};
        for (const row of (mediaRes.data ?? []) as FilaArchivoVenta[]) {
          const list = grouped[row.sell_request_id] ?? (grouped[row.sell_request_id] = []);
          list.push(row);
        }
        setMediaByRequest(grouped);
        setMediaCargada(true);
      } catch {
        setMediaCargada(false);
        // La tabla puede no existir todavía (falta ejecutar la migración) o
        // el usuario puede no tener permisos; en cualquier caso, se listan
        // las solicitudes igualmente, solo sin sus archivos.
        setMediaByRequest({});
      }
    } catch (e: any) {
      console.error("Error cargando las solicitudes:", e);
      setScreenErr("No se han podido cargar las solicitudes. Inténtalo de nuevo en unos minutos.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function setStatus(row: SellRequestRow, next: SellRequestStatus) {
    if (busyId) return;

    setBusyId(row.id);
    setScreenErr(null);
    const prev = itemsRef.current;
    const optimistic = prev.map((x) => (x.id === row.id ? { ...x, status: next } : x));
    setItems(optimistic);

    try {
      const { error } = await supabase
        .from("sell_requests")
        .update({ status: next })
        .eq("id", row.id);

      if (error) throw error;
    } catch (e: any) {
      setItems(prev);
      console.error("Error actualizando el estado:", e);
      setScreenErr("No se pudo actualizar el estado. Inténtalo de nuevo.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDownloadMedia(row: FilaArchivoVenta) {
    if (downloadingMediaId) return;

    setMediaErr(null);
    setDownloadingMediaId(row.id);

    try {
      await downloadSellRequestMedia(row);
    } catch (e: any) {
      console.error("Error descargando el archivo:", e);
      setMediaErr("No se pudo descargar el archivo. Inténtalo de nuevo.");
    } finally {
      setDownloadingMediaId(null);
    }
  }

  function askRemove(row: SellRequestRow) {
    setConfirmDelete(row);
  }

  async function removeConfirmed() {
    const row = confirmDelete;
    if (!row) return;

    setConfirmDelete(null);
    setScreenErr(null);

    try {
      // Antes de borrar la solicitud, se quitan sus fotos/vídeos del almacenamiento para
      // que no queden archivos huérfanos (las filas de sell_request_media caen en cascada).
      const rutas = (mediaByRequest[row.id] ?? [])
        .map((m) => m.storage_path)
        .filter((p): p is string => typeof p === "string" && p.length > 0);
      if (rutas.length) {
        const { error: errArchivos } = await supabase.storage.from("sell-request-media").remove(rutas);
        if (errArchivos) console.error("No se pudieron borrar los adjuntos de la solicitud:", errArchivos);
      }

      const { error } = await supabase.from("sell_requests").delete().eq("id", row.id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      console.error("Error borrando la solicitud:", e);
      setScreenErr("No se pudo borrar la solicitud. Inténtalo de nuevo.");
    }
  }

  const hayFiltro = statusFilter !== "todas" || soloCesta || soloFaltaMedia || !!filtroVia || !!q;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      {/* Cabecera fija y compacta (volver al panel + título centrado), igual
          en todo el panel. Lo demás va en un solo scroll. */}
      <CabeceraPanel title="Solicitudes de venta" isMobile={isMobile} maxWidth={1160} />

      {loading ? (
        <CargandoPanel texto="Cargando solicitudes…" />
      ) : (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 48 + insets.bottom,
          alignItems: "center",
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={CIERRE_TECLADO}
      >
        <View style={{ ...columnStyle, maxWidth: 1040, gap: sectionGap }}>

          {/* 1) Cifras que filtran la lista (otro toque en la misma, todas). */}
          <FilaCifras nativeID="cotizaciones-cifras">
            {(
              [
                ["todas", "Total", "document-text-outline"],
                ["nuevo", "Nuevas", "sparkles-outline"],
                ["revisado", "Revisadas", "eye-outline"],
                ["contactado", "Contactadas", "chatbubbles-outline"],
              ] as const
            ).map(([f, etiqueta, icono]) => (
              <Cifra
                key={f}
                nativeID={`cotizaciones-cifra-${f}`}
                valor={String(cuenta(f))}
                etiqueta={etiqueta}
                icono={icono}
                ancho={isMobile ? "45%" : 0}
                activa={statusFilter === f && f !== "todas"}
                onPress={() => setStatusFilter((x) => (x === f ? "todas" : f))}
              />
            ))}
          </FilaCifras>

          {/* 2) Buscador y pastillas con su recuento (los estados y, aparte, «Cambio desde la cesta», que se suma). */}
          <View style={{ gap: 12 }}>
            <Buscador
              nativeID="cotizaciones-buscar"
              valor={search}
              onCambiar={setSearch}
              placeholder="Nombre, artículo, ciudad o contacto"
              etiqueta="Buscar solicitudes por nombre, artículo, ciudad o contacto"
            />
            <FilaPastillas isMobile={isMobile} nativeID="cotizaciones-filtros">
              {PASTILLAS.map(([f, t]) => (
                <Chip key={f} nativeID={`cotizaciones-filtro-${f}`} label={`${t} (${cuenta(f)})`} activo={statusFilter === f} onPress={() => setStatusFilter(f)} />
              ))}
              <Chip nativeID="cotizaciones-filtro-cesta" label={`Cambio desde la cesta (${cuantasCesta})`} activo={soloCesta} onPress={() => setSoloCesta((v) => !v)} />
              {mediaCargada ? (
                <Chip nativeID="cotizaciones-filtro-faltan-media" label={`Faltan fotos o vídeo (${cuantasFaltaMedia})`} activo={soloFaltaMedia} onPress={() => setSoloFaltaMedia((v) => !v)} />
              ) : null}
              <Chip nativeID="cotizaciones-filtro-correo" label={`Por correo (${cuantasVia("correo")})`} activo={filtroVia === "correo"} onPress={() => setFiltroVia((v) => (v === "correo" ? null : "correo"))} />
              <Chip nativeID="cotizaciones-filtro-chat" label={`Por chat (${cuantasVia("chat")})`} activo={filtroVia === "chat"} onPress={() => setFiltroVia((v) => (v === "chat" ? null : "chat"))} />
            </FilaPastillas>
          </View>

          {!!screenErr && <AvisoPanel tone="danger" text={screenErr} />}
          {!!mediaErr && <AvisoPanel tone="danger" text={mediaErr} />}

          {/* 3) Cuántas salen, «Abrir todas» y las filas compactas. */}
          <View style={{ gap: 4 }}>
            <RecuentoLista
              nativeID="cotizaciones-recuento"
              texto={q ? `${filteredItems.length} ${filteredItems.length === 1 ? "solicitud encontrada" : "solicitudes encontradas"}` : `${filteredItems.length} de ${items.length} solicitudes`}
              abiertas={desplegables.todasAbiertas(filteredItems.map((r) => r.id))}
              onAlternar={filteredItems.length ? () => desplegables.abrirOCerrarTodas(filteredItems.map((r) => r.id)) : undefined}
              idBoton="cotizaciones-abrir-todas"
              femenino
            />
            {filteredItems.length === 0 ? (
              items.length && hayFiltro ? (
                <ListaVacia nativeID="cotizaciones-vacio" icono="document-text-outline" titulo="No hay solicitudes para este filtro." texto="Prueba a borrar el buscador o a elegir «Todas»." />
              ) : (
                <EstadoVacioPanel
                  icon="document-text-outline"
                  title="No hay solicitudes para este filtro."
                  text="En cuanto un cliente envíe el formulario de «Vender ahora» aparecerá aquí."
                />
              )
            ) : (
              <View nativeID="cotizaciones-lista">
                {filteredItems.map((r, n) => {
                  const isBusy = busyId === r.id;
                  const marca = marcaDe(r);
                  const media = mediaByRequest[r.id] ?? [];
                  const abierta = desplegables.estaAbierta(r.id);
                  const sinMedia = faltaMedia(r);
                  let imgCount = 0;
                  return (
                    <FilaLista
                      key={r.id}
                      nativeID={`cotizacion-${r.id}`}
                      idFila={`cotizacion-fila-${r.id}`}
                      primera={n === 0}
                      abierta={abierta}
                      onPress={() => desplegables.alternar(r.id)}
                      etiquetaAccesible={`${r.articulo}, ${STATUS_LABEL[r.status]}, de ${r.nombre} ${r.apellido}. ${abierta ? "Plegar" : "Ver el detalle"}`}
                      miniatura={<Miniatura icono={media.length ? "images-outline" : marca.desdeCesta ? "swap-horizontal-outline" : "pricetag-outline"} ancho={48} alto={48} />}
                      titulo={r.articulo}
                      colorTitulo={r.status === "descartado" ? COLORS.muted : undefined}
                      etiqueta={<EtiquetaColor nativeID={`cotizacion-estado-${r.id}`} texto={STATUS_LABEL[r.status]} tono={STATUS_TONO[r.status]} />}
                      subtitulo={`${r.nombre} ${r.apellido} · ${r.ciudad} · ${formatPrecioEstimado(r.precio_estimado)} · ${fecha(r.created_at)}`}
                      idSubtitulo={`cotizacion-datos-${r.id}`}
                      etiquetas={
                        <>
                            <Etiqueta
                              nativeID={`cotizacion-via-${r.id}`}
                              icon={viaContacto(r) === "chat" ? "chatbubble-ellipses-outline" : viaContacto(r) === "ninguno" ? "alert-circle-outline" : r.metodo_contacto === "whatsapp" ? "logo-whatsapp" : "mail-outline"}
                              color={viaContacto(r) === "ninguno" ? COLORS.warning : colorTextoAzul(13)}
                              texto={viaContacto(r) === "ninguno" ? "Sin forma de contacto" : textoVia(r)}
                            />
                            {marca.desdeCesta ? <Etiqueta nativeID={`cotizacion-cesta-${r.id}`} icon="swap-horizontal-outline" color={colorTextoAzul(13)} texto={textoCesta(marca.para)} /> : null}
                            {!r.funciona_bien ? <Etiqueta nativeID={`cotizacion-averia-${r.id}`} icon="construct-outline" color={COLORS.warning} texto="Presenta una avería" /> : null}
                            {media.length ? <Etiqueta nativeID={`cotizacion-adjuntos-${r.id}`} icon="images-outline" color={COLORS.text} texto={`${media.length} ${media.length === 1 ? "adjunto" : "adjuntos"}`} /> : null}
                            {sinMedia ? <Etiqueta nativeID={`cotizacion-faltan-media-${r.id}`} icon="camera-outline" color={COLORS.warning} texto="Faltan fotos o vídeo" /> : null}
                            {!r.mayor_edad ? <Etiqueta icon="alert-circle-outline" color={COLORS.warning} texto="Mayoría de edad sin confirmar" /> : null}
                        </>
                      }
                    >
                      <DetalleFila
                        nativeID={`cotizacion-detalle-${r.id}`}
                        idAcciones={`cotizacion-acciones-${r.id}`}
                        acciones={
                          <>
                            {r.status !== "revisado" ? (
                              <AccionTexto nativeID={`cotizacion-revisada-${r.id}`} icono="eye-outline" texto="Marcar revisada" disabled={isBusy} onPress={() => setStatus(r, "revisado")} />
                            ) : null}
                            {r.status !== "contactado" ? (
                              <AccionTexto nativeID={`cotizacion-contactada-${r.id}`} icono="chatbubbles-outline" texto="Marcar contactada" disabled={isBusy} onPress={() => setStatus(r, "contactado")} />
                            ) : null}
                            {r.status !== "descartado" ? (
                              <AccionTexto nativeID={`cotizacion-descartar-${r.id}`} icono="close-circle-outline" texto="Descartar" color={COLORS.text} disabled={isBusy} onPress={() => setStatus(r, "descartado")} />
                            ) : null}
                            <BotonIconoPanel icon="trash-outline" label="Borrar la solicitud" variant="danger" disabled={isBusy} onPress={() => askRemove(r)} />
                          </>
                        }
                      >
                        <Bloque icono="cube-outline" titulo="Artículo" ancho={isMobile ? "100%" : "30%"}>
                          <Dato etiqueta="Artículo">{r.articulo}</Dato>
                          <Text style={{ color: r.funciona_bien ? COLORS.success : COLORS.warning, fontWeight: "900", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                            {r.funciona_bien ? "Funciona bien" : "Presenta una avería"}
                          </Text>
                          <Dato etiqueta="Precio esperado">{formatPrecioEstimado(r.precio_estimado)}</Dato>
                          {marca.desdeCesta ? (
                            <Text nativeID={`cotizacion-detalle-cesta-${r.id}`} style={{ color: colorTextoAzul(13), fontWeight: "900", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                              {textoCesta(marca.para)}
                            </Text>
                          ) : null}
                          {marca.resto ? <Dato etiqueta={r.funciona_bien ? "Por qué lo vende" : "Qué le pasa"}>{marca.resto}</Dato> : null}
                        </Bloque>
                        <Bloque icono="person-outline" titulo="Cliente" ancho={isMobile ? "100%" : "30%"}>
                          <Dato etiqueta="Nombre">{`${r.nombre} ${r.apellido}`}</Dato>
                          <Dato etiqueta="Género">{GENERO_LABEL[r.genero] ?? "-"}</Dato>
                          <Dato etiqueta="Ciudad">{r.ciudad}</Dato>
                          <Text style={{ color: r.mayor_edad ? COLORS.muted : COLORS.warning, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                            {r.mayor_edad ? "Mayoría de edad confirmada" : "Mayoría de edad sin confirmar"}
                          </Text>
                          <Dato nativeID={`cotizacion-via-detalle-${r.id}`} etiqueta="Cómo quiere que le contactemos">
                            {textoVia(r)}
                          </Dato>
                          {viaContacto(r) === "correo" || viaContacto(r) === "otro" ? (
                            <Dato nativeID={`cotizacion-contacto-${r.id}`} etiqueta={viaContacto(r) === "correo" ? "Correo" : "Contacto"}>
                              {r.contacto ?? "-"}
                            </Dato>
                          ) : viaContacto(r) === "chat" ? (
                            <Detalle>Escríbele desde Chats del panel: verá el mensaje en su cuenta.</Detalle>
                          ) : (
                            <Detalle>No indicó cómo contactarle (solicitud anterior a que fuera obligatorio).</Detalle>
                          )}
                        </Bloque>
                        <Bloque icono="car-outline" titulo="Entrega" ancho={isMobile ? "100%" : "30%"}>
                          {r.opcion_venta === "domicilio" ? (
                            <Dato etiqueta="Recogida en domicilio">{r.direccion ?? "-"}</Dato>
                          ) : (
                            <>
                              <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>El cliente se desplaza para entregar el artículo</Text>
                              <Dato etiqueta="Disponibilidad">{r.disponibilidad ? DISPONIBILIDAD_LABEL[r.disponibilidad] : "-"}</Dato>
                            </>
                          )}
                          <Dato etiqueta="Recibida">{fecha(r.created_at, true)}</Dato>
                          <Dato etiqueta="Estado">{STATUS_LABEL[r.status]}</Dato>
                        </Bloque>
                        {media.length ? (
                          <Bloque nativeID={`cotizacion-fotos-${r.id}`} icono="images-outline" titulo={`Fotos y vídeo adjuntos (${media.length})`} ancho="100%">
                            {abierta ? <GaleriaAdjuntos idSolicitud={r.id} media={media} /> : null}
                            <Detalle>Toca una foto para verla en grande. También puedes descargarlas una a una.</Detalle>
                            <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 18, rowGap: 8 }}>
                              {media.map((m) => {
                                const label = m.kind === "video" ? "Descargar vídeo" : `Descargar foto ${++imgCount}`;
                                return (
                                  <AccionTexto
                                    key={m.id}
                                    icono={m.kind === "video" ? "videocam-outline" : "download-outline"}
                                    texto={downloadingMediaId === m.id ? "Descargando…" : label}
                                    disabled={!!downloadingMediaId}
                                    onPress={() => handleDownloadMedia(m)}
                                  />
                                );
                              })}
                            </View>
                          </Bloque>
                        ) : (
                          <Bloque nativeID={`cotizacion-fotos-${r.id}`} icono="images-outline" titulo="Fotos y vídeo" ancho="100%">
                            <Detalle nativeID={`cotizacion-sin-fotos-${r.id}`}>El cliente no adjuntó fotos ni vídeo. Si las necesitas, pídeselas al contactar.</Detalle>
                          </Bloque>
                        )}
                      </DetalleFila>
                    </FilaLista>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
      )}

      <Modal
        visible={!!confirmDelete}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDelete(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            padding: isMobile ? 10 : 16,
            justifyContent: "center",
          }}
        >
          <View
            style={{
              ...modalColumnStyle,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.bg,
              padding: isMobile ? 14 : 16,
              gap: 10,
            }}
          >
            <Text style={{ color: COLORS.text, fontSize: isMobile ? 17 : 18, fontWeight: "900", textAlign: "center" }}>
              Borrar solicitud
            </Text>

            <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
              Vas a borrar la solicitud de{" "}
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                {confirmDelete?.articulo ?? ""}
              </Text>
              . Esta acción no se puede deshacer.
            </Text>

            <View style={{ marginTop: 6 }}>
              <PieVentana onCerrar={() => setConfirmDelete(null)}>
                <View style={{ flex: 1 }}>
                  <BotonChipPanel label="Sí, borrar" variant="danger" onPress={removeConfirmed} isMobile={isMobile} fullWidth />
                </View>
              </PieVentana>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
