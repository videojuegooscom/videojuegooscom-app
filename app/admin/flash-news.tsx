/**
 * Archivo: app/admin/flash-news.tsx
 * Función: pantalla de administración «Noticias Flash · Blue IA», en la dirección /admin/flash-news.
 * Para qué sirve: el administrador crea hasta 5 avisos cortos con color y duración, los ordena, activa o borra; Blue IA los muestra a los clientes en su bocadillo.
 * Conectado con: lib/supabase.ts (tabla flash_news), lib/admin/productos.componentes.tsx, constants/temaTienda.ts, components/admin/PiezasPanelAdmin.tsx; los muestra components/AsistenteBlue.tsx.
 * Utilizado por: Expo Router (dirección /admin/flash-news, protegida por app/admin/_layout.tsx); la enlaza la tarjeta «Noticias Flash» de app/admin/index.tsx.
 * Dependencias: react, react-native.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: pantalla de administración de "Noticias Flash · Blue IA". Estos
 * mensajes ya no van en una franja superior: los usa Blue IA, el asistente
 * flotante de la tienda, que los muestra como avisos en su bocadillo y los
 * conoce para responder a los clientes. Permite crear hasta 5 noticias,
 * editarlas, reordenarlas, activarlas/desactivarlas y borrarlas, eligiendo
 * para cada una su mensaje, su color y cuántos segundos se muestra antes de
 * pasar a la siguiente.
 *
 * Cómo funciona:
 * - Lee/escribe directamente en la tabla "flash_news" de Supabase (columnas:
 *   id, message, color_hex, display_seconds, sort_order, is_active,
 *   created_at, updated_at). RLS: lectura pública de las activas, escritura
 *   solo admin (is_admin()) — igual que "categories" y "products".
 * - MAX_ITEMS (5) limita cuántas noticias puede haber en total: al llegar al
 *   límite, el «+» desaparece y un aviso explica que hay que borrar una.
 * - El modal de creación/edición deja elegir el color con una paleta de
 *   colores rápidos (chips) o escribiendo un código hexadecimal a mano, y
 *   muestra una vista previa sencilla del aviso en forma de bocadillo.
 * - toggleActive() aplica un cambio optimista en la lista y lo revierte si
 *   Supabase devuelve error, igual que en app/admin/categories.tsx.
 * - Tamaños del móvil (grupo 5, 2026-11-13; constants/temaTienda.ts): ningún texto de
 *   menos de 13 px, grises desde COLORES_TEXTO.secundario, todo lo que se toca de
 *   44 px (también «volver» y los colores) y los campos de 16 px y 48 de alto.
 * - Rediseño PANRED4 (tanda 4, 2026-11-16; components/admin/PiezasPanelAdmin.tsx, como Usuarios, Pedidos, Inventario y
 *   Cotizaciones): cifras que filtran (Noticias «N / 5», Activas, Ocultas y Huecos libres), buscador de 16 px por el
 *   texto, pastillas de 44 px con su recuento, filas compactas (el aviso con su color, etiqueta Activa u Oculta,
 *   segundos en pantalla y orden) con el lápiz y la papelera a mano y, al tocar una, el detalle por bloques (Aviso, con
 *   su vista previa en Blue IA, y Ajustes) con «Activar» u «Ocultar» abajo. «Nueva noticia» es el «+» flotante.
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase para todas las operaciones CRUD.
 * - Asistente flotante de Blue IA → lee estas mismas noticias
 *   (is_active=true) para mostrarlas como avisos y usarlas al responder.
 * - app/admin/index.tsx → pantalla desde la que se entra aquí (tarjeta
 *   "Noticias Flash") y a la que se vuelve con la flecha de la cabecera.
 * - app/admin/_layout.tsx → registra esta ruta ("flash-news") dentro del
 *   Stack protegido de administración.
 * - components/admin/PiezasPanelAdmin.tsx → cifras, buscador, pastillas, filas y bloques; pruebas/perfil-datos.mjs (TM5 y
 *   PANRED4).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import {
  AdminHeader,
  AdminIntro,
  AdminLoading,
  AdminNotice,
  BotonFlotante,
  EmptyState,
  IconButton,
  PieVentana,
} from "../../lib/admin/productos.componentes";
import { CAMPO, COLORES_TEXTO, TACTIL, TAMANOS } from "../../constants/temaTienda";
import {
  AccionTexto,
  Bloque,
  BotonesFila,
  Buscador,
  Chip,
  Cifra,
  Dato,
  Detalle,
  DetalleFila,
  EtiquetaColor,
  FilaCifras,
  FilaLista,
  FilaPastillas,
  ListaVacia,
  Miniatura,
  RecuentoLista,
  fechaPanel,
  useDesplegables,
} from "../../components/admin/PiezasPanelAdmin";

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  cardSoft: "#F8FBFE",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: COLORES_TEXTO.secundario,
  muted2: COLORES_TEXTO.secundario,
  accent: "#1EA7E8",
  // Botón principal: el mismo azul que "Comprar"/"Confirmar pedido" de la tienda.
  accentDark: "#1EA7E8",
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

// "on-drag" en web cierra el teclado con CUALQUIER desplazamiento, también el que hace el
// propio navegador al enfocar un campo (el campo se cerraba solo): solo se usa en nativo.
const CIERRE_TECLADO: "none" | "on-drag" = Platform.OS === "web" ? "none" : "on-drag";

const MAX_ITEMS = 5;

// Paleta rápida para elegir color sin tener que escribir un hexadecimal a
// mano; el campo de texto sigue disponible debajo para un color a medida.
const COLOR_PRESETS = [
  { label: "Dorado", hex: "#FFB200" },
  { label: "Azul", hex: "#1EA7E8" },
  { label: "Verde", hex: "#22C55E" },
  { label: "Rojo", hex: "#EF4444" },
  { label: "Morado", hex: "#8B5CF6" },
  { label: "Marino", hex: "#0B2138" },
];

const DEFAULT_COLOR = COLOR_PRESETS[0].hex;

type FlashNewsRow = {
  id: string;
  message: string;
  color_hex: string;
  display_seconds: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type FiltroNoticias = "todas" | "activas" | "ocultas";
const PASTILLAS: [FiltroNoticias, string][] = [
  ["todas", "Todas"],
  ["activas", "Activas"],
  ["ocultas", "Ocultas"],
];

function softShadow() {
  return Platform.select<any>({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.24,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 3 },
    default: {},
  });
}

function isValidHex(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value ?? "").trim());
}

// Convierte un hex a rgba translúcido (tinte de cada noticia en la lista y
// borde del bocadillo), con un color de emergencia si el hex no es válido.
function hexToRgba(hex: string, alpha: number) {
  const clean = String(hex ?? "").replace("#", "").trim();
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;

  const r = parseInt(full.substring(0, 2), 16);
  const g = parseInt(full.substring(2, 4), 16);
  const b = parseInt(full.substring(4, 6), 16);

  if ([r, g, b].some((n) => Number.isNaN(n))) {
    return `rgba(255, 178, 0, ${alpha})`;
  }

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function toIntSafe(v: string, fallback = 0) {
  const raw = String(v ?? "").trim();
  if (!raw) return fallback;
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

// El nombre del color si es uno de la paleta; si no, su código.
function nombreColor(hex: string) {
  const p = COLOR_PRESETS.find((c) => c.hex.toLowerCase() === String(hex ?? "").toLowerCase());
  return p ? `${p.label} (${p.hex})` : String(hex ?? "-");
}

// La vista previa del aviso como bocadillo de Blue IA (en el formulario y en el detalle de la fila).
function BocadilloBlue({ texto, color }: { texto: string; color: string }) {
  const c = isValidHex(color) ? color : DEFAULT_COLOR;
  return (
    <View
      style={{
        alignSelf: "flex-start",
        maxWidth: 360,
        borderRadius: 18,
        borderBottomLeftRadius: 6,
        borderWidth: 1,
        borderColor: hexToRgba(c, 0.45),
        backgroundColor: "#FFFFFF",
        paddingVertical: 10,
        paddingHorizontal: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      <Ionicons name="flash-outline" size={15} color={c} />
      <Text style={{ color: COLORS.text, fontWeight: "700", fontSize: 13, flexShrink: 1 }} numberOfLines={3}>
        {texto}
      </Text>
    </View>
  );
}

function ChipButton({
  label,
  onPress,
  variant,
  disabled,
  isMobile,
  fullWidth,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "danger" | "ghost";
  disabled?: boolean;
  isMobile?: boolean;
  fullWidth?: boolean;
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
        justifyContent: "center",
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor,
        backgroundColor,
        opacity: disabled ? 0.5 : pressed ? 0.88 : 1,
        width: fullWidth ? "100%" : undefined,
      })}
    >
      <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center", fontSize: isMobile ? 13 : 14 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function AdminFlashNews() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const sectionGap = isMobile ? 18 : 22;
  const insets = useSafeAreaInsets();
  const desplegables = useDesplegables();

  const [loading, setLoading] = useState(true);
  const [screenErr, setScreenErr] = useState<string | null>(null);

  const [items, setItems] = useState<FlashNewsRow[]>([]);
  const itemsRef = useRef<FlashNewsRow[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<FiltroNoticias>("todas");

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FlashNewsRow | null>(null);

  const [editing, setEditing] = useState<FlashNewsRow | null>(null);
  const isEdit = !!editing;

  const [message, setMessage] = useState("");
  const [colorHex, setColorHex] = useState(DEFAULT_COLOR);
  const [displaySeconds, setDisplaySeconds] = useState("6");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);

  const modalTitle = useMemo(() => (isEdit ? "Editar noticia" : "Nueva noticia"), [isEdit]);
  const atLimit = items.length >= MAX_ITEMS && !isEdit;

  const cuenta = (f: FiltroNoticias) => (f === "todas" ? items.length : items.filter((x) => (f === "activas" ? !!x.is_active : !x.is_active)).length);

  const q = search.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    return items.filter((x) => {
      if (filtro === "activas" && !x.is_active) return false;
      if (filtro === "ocultas" && x.is_active) return false;
      if (!q) return true;
      return String(x.message ?? "").toLowerCase().includes(q);
    });
  }, [items, q, filtro]);

  async function load() {
    setLoading(true);
    setScreenErr(null);

    try {
      const { data, error } = await supabase
        .from("flash_news")
        .select("id,message,color_hex,display_seconds,sort_order,is_active,created_at,updated_at")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;

      setItems((data ?? []) as FlashNewsRow[]);
    } catch (e: any) {
      console.error("Error cargando noticias flash:", e);
      setScreenErr("No se han podido cargar las noticias. Inténtalo de nuevo.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function resetForm() {
    setEditing(null);
    setMessage("");
    setColorHex(DEFAULT_COLOR);
    setDisplaySeconds("6");
    setSortOrder(String(items.length * 10));
    setIsActive(true);
    setModalErr(null);
  }

  function openCreate() {
    if (atLimit) return;
    resetForm();
    setOpen(true);
  }

  function openEdit(row: FlashNewsRow) {
    setEditing(row);
    setMessage(row.message ?? "");
    setColorHex(isValidHex(row.color_hex) ? row.color_hex : DEFAULT_COLOR);
    setDisplaySeconds(String(row.display_seconds ?? 6));
    setSortOrder(String(row.sort_order ?? 0));
    setIsActive(!!row.is_active);
    setModalErr(null);
    setOpen(true);
  }

  async function save() {
    if (saving) return;

    setSaving(true);
    setModalErr(null);

    const cleanMessage = message.trim();
    const cleanColor = colorHex.trim();
    const seconds = toIntSafe(displaySeconds, 6);
    const so = toIntSafe(sortOrder, 0);

    if (!cleanMessage) {
      setModalErr("Escribe el texto de la noticia.");
      setSaving(false);
      return;
    }

    if (cleanMessage.length > 140) {
      setModalErr("El texto es demasiado largo (máximo 140 caracteres).");
      setSaving(false);
      return;
    }

    if (!isValidHex(cleanColor)) {
      setModalErr("Elige un color de la paleta o escribe un código válido (#RRGGBB).");
      setSaving(false);
      return;
    }

    if (!Number.isFinite(seconds) || seconds < 2 || seconds > 60) {
      setModalErr("Los segundos en pantalla deben estar entre 2 y 60.");
      setSaving(false);
      return;
    }

    if (!isEdit && items.length >= MAX_ITEMS) {
      setModalErr(`Ya hay ${MAX_ITEMS} noticias — borra una para poder crear otra.`);
      setSaving(false);
      return;
    }

    try {
      const payload = {
        message: cleanMessage,
        color_hex: cleanColor,
        display_seconds: seconds,
        sort_order: so,
        is_active: isActive,
      };

      if (editing) {
        const { error } = await supabase.from("flash_news").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("flash_news").insert(payload);
        if (error) throw error;
      }

      setOpen(false);
      resetForm();
      await load();
    } catch (e: any) {
      console.error("Error guardando noticia flash:", e);
      setModalErr("No se pudo guardar la noticia. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: FlashNewsRow) {
    const prev = itemsRef.current;
    const next = prev.map((x) => (x.id === row.id ? { ...x, is_active: !x.is_active } : x));
    setItems(next);

    const { error } = await supabase
      .from("flash_news")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);

    if (error) {
      setItems(prev);
      setScreenErr(error.message);
    }
  }

  function askRemove(row: FlashNewsRow) {
    setConfirmDelete(row);
  }

  async function removeConfirmed() {
    const row = confirmDelete;
    if (!row) return;

    setConfirmDelete(null);
    setScreenErr(null);

    try {
      const { error } = await supabase.from("flash_news").delete().eq("id", row.id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      console.error("Error borrando noticia flash:", e);
      setScreenErr("No se ha podido borrar la noticia. Inténtalo de nuevo.");
    }
  }

  const hayFiltro = filtro !== "todas" || !!q;
  const lleno = items.length >= MAX_ITEMS;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      {/* Cabecera fija y compacta (volver al panel + título centrado), igual en todo el panel. Lo demás va en un solo
          scroll. */}
      <AdminHeader title="Noticias Flash · Blue IA" isMobile={isMobile} />

      {loading ? (
        <AdminLoading texto="Cargando noticias…" />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: 16,
            // Sitio para el «+» flotante (58 px) debajo de la última fila.
            paddingBottom: 48 + 74 + insets.bottom,
            alignItems: "center",
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={CIERRE_TECLADO}
        >
          <View style={{ width: "100%", maxWidth: 1040, gap: sectionGap }}>
            <AdminIntro text={`Hasta ${MAX_ITEMS} avisos para Blue IA: el asistente flotante los muestra a los clientes y los tiene en cuenta al responder.`} />

            {/* 1) Cifras que filtran la lista (otro toque en la misma, todas). «Huecos libres» solo informa. */}
            <FilaCifras nativeID="noticias-cifras">
              <Cifra
                nativeID="noticias-cifra-todas"
                valor={`${items.length} / ${MAX_ITEMS}`}
                etiqueta="Noticias"
                icono="flash-outline"
                ancho={isMobile ? "45%" : 0}
                onPress={() => setFiltro("todas")}
              />
              <Cifra
                nativeID="noticias-cifra-activas"
                valor={String(cuenta("activas"))}
                etiqueta="Activas"
                icono="checkmark-circle-outline"
                ancho={isMobile ? "45%" : 0}
                activa={filtro === "activas"}
                onPress={() => setFiltro((x) => (x === "activas" ? "todas" : "activas"))}
              />
              <Cifra
                nativeID="noticias-cifra-ocultas"
                valor={String(cuenta("ocultas"))}
                etiqueta="Ocultas"
                icono="eye-off-outline"
                ancho={isMobile ? "45%" : 0}
                activa={filtro === "ocultas"}
                onPress={() => setFiltro((x) => (x === "ocultas" ? "todas" : "ocultas"))}
              />
              <Cifra
                nativeID="noticias-cifra-libres"
                valor={String(Math.max(0, MAX_ITEMS - items.length))}
                etiqueta="Huecos libres"
                icono="add-circle-outline"
                ancho={isMobile ? "45%" : 0}
                alerta={lleno}
              />
            </FilaCifras>

            {/* 2) Buscador y pastillas con su recuento. */}
            <View style={{ gap: 12 }}>
              <Buscador nativeID="noticias-buscar" valor={search} onCambiar={setSearch} placeholder="Buscar en el texto del aviso" etiqueta="Buscar noticias por su texto" />
              <FilaPastillas isMobile={isMobile} nativeID="noticias-filtros">
                {PASTILLAS.map(([f, t]) => (
                  <Chip key={f} nativeID={`noticias-filtro-${f}`} label={`${t} (${cuenta(f)})`} activo={filtro === f} onPress={() => setFiltro(f)} />
                ))}
              </FilaPastillas>
            </View>

            {!!screenErr && <AdminNotice tone="danger" text={screenErr} />}
            {lleno ? <AdminNotice tone="warning" text={`Ya hay ${MAX_ITEMS} noticias, el máximo. Borra una para poder crear otra.`} /> : null}

            {/* 3) Cuántas salen, «Abrir todas» y las filas compactas. */}
            <View style={{ gap: 4 }}>
              <RecuentoLista
                nativeID="noticias-recuento"
                texto={q ? `${filteredItems.length} ${filteredItems.length === 1 ? "noticia encontrada" : "noticias encontradas"}` : `${filteredItems.length} de ${items.length} noticias`}
                abiertas={desplegables.todasAbiertas(filteredItems.map((r) => r.id))}
                onAlternar={filteredItems.length ? () => desplegables.abrirOCerrarTodas(filteredItems.map((r) => r.id)) : undefined}
                idBoton="noticias-abrir-todas"
                femenino
              />
              {filteredItems.length === 0 ? (
                items.length && hayFiltro ? (
                  <ListaVacia nativeID="noticias-vacio" icono="flash-outline" titulo="No hay noticias para este filtro." texto="Prueba a borrar el buscador o a elegir «Todas»." />
                ) : (
                  <EmptyState icon="flash-outline" title="Todavía no hay noticias." text="Crea la primera con el «+» para que Blue IA la muestre como aviso y la use al responder." />
                )
              ) : (
                <View nativeID="noticias-lista">
                  {filteredItems.map((row, n) => {
                    const abierta = desplegables.estaAbierta(row.id);
                    const rowColor = isValidHex(row.color_hex) ? row.color_hex : DEFAULT_COLOR;
                    return (
                      <FilaLista
                        key={row.id}
                        nativeID={`noticia-${row.id}`}
                        idFila={`noticia-fila-${row.id}`}
                        primera={n === 0}
                        abierta={abierta}
                        onPress={() => desplegables.alternar(row.id)}
                        etiquetaAccesible={`${row.message}, ${row.is_active ? "activa" : "oculta"}. ${abierta ? "Plegar" : "Ver el detalle"}`}
                        miniatura={
                          <Miniatura icono="flash-outline" ancho={44} alto={44}>
                            <View style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center", backgroundColor: hexToRgba(rowColor, 0.14) }}>
                              <Ionicons name="flash" size={20} color={rowColor} />
                            </View>
                          </Miniatura>
                        }
                        titulo={row.message}
                        colorTitulo={row.is_active ? undefined : COLORS.muted}
                        etiqueta={<EtiquetaColor nativeID={`noticia-estado-${row.id}`} texto={row.is_active ? "Activa" : "Oculta"} tono={row.is_active ? "verde" : "gris"} />}
                        subtitulo={`${row.display_seconds} s en pantalla · Orden ${row.sort_order}`}
                        idSubtitulo={`noticia-datos-${row.id}`}
                        derecha={
                          <BotonesFila>
                            <IconButton icon="create-outline" label="Editar la noticia" variant="primary" onPress={() => openEdit(row)} />
                            <IconButton icon="trash-outline" label="Borrar la noticia" variant="danger" onPress={() => askRemove(row)} />
                          </BotonesFila>
                        }
                      >
                        <DetalleFila
                          nativeID={`noticia-detalle-${row.id}`}
                          idAcciones={`noticia-acciones-${row.id}`}
                          acciones={
                            <>
                              <AccionTexto
                                nativeID={`noticia-activar-${row.id}`}
                                icono={row.is_active ? "eye-off-outline" : "eye-outline"}
                                texto={row.is_active ? "Ocultar en Blue IA" : "Activar en Blue IA"}
                                onPress={() => toggleActive(row)}
                              />
                              <AccionTexto nativeID={`noticia-editar-${row.id}`} icono="create-outline" texto="Editar la noticia" onPress={() => openEdit(row)} />
                            </>
                          }
                        >
                          <Bloque icono="chatbubble-ellipses-outline" titulo="Aviso" ancho={isMobile ? "100%" : "55%"}>
                            <Dato etiqueta="Texto">{row.message}</Dato>
                            <Detalle>{`${String(row.message ?? "").length} de 140 caracteres · Vista previa en Blue IA:`}</Detalle>
                            <BocadilloBlue texto={row.message} color={rowColor} />
                          </Bloque>
                          <Bloque icono="options-outline" titulo="Ajustes" ancho={isMobile ? "100%" : "35%"}>
                            <View style={{ flexDirection: "row" }}>
                              <EtiquetaColor texto={row.is_active ? "Activa" : "Oculta"} tono={row.is_active ? "verde" : "gris"} />
                            </View>
                            <Detalle>{row.is_active ? "Blue IA la muestra y la usa al responder." : "Blue IA no la muestra ni la usa."}</Detalle>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: rowColor, borderWidth: 1, borderColor: "rgba(11,33,56,0.18)" }} />
                              <Dato etiqueta="Color">{nombreColor(rowColor)}</Dato>
                            </View>
                            <Dato etiqueta="En pantalla">{`${row.display_seconds} segundos`}</Dato>
                            <Dato etiqueta="Orden">{String(row.sort_order ?? 0)}</Dato>
                            <Dato etiqueta="Creada">{fechaPanel(row.created_at, true)}</Dato>
                            <Dato etiqueta="Actualizada">{fechaPanel(row.updated_at, true)}</Dato>
                          </Bloque>
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

      {/* «Nueva noticia»: el «+» flotante abajo a la derecha (al alcance del pulgar); con el máximo, no sale. */}
      {!loading && !atLimit ? <BotonFlotante nativeID="noticias-nueva" label="Nueva noticia" onPress={openCreate} /> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* El formulario se desplaza dentro del modal (en el móvil no cabe entero) y, en
            iPhone, sube por encima del teclado. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.60)" }}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "center",
              paddingHorizontal: isMobile ? 10 : 16,
              paddingTop: (isMobile ? 16 : 24) + insets.top,
              paddingBottom: (isMobile ? 24 : 32) + insets.bottom,
            }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={CIERRE_TECLADO}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 640,
                alignSelf: "center",
                borderRadius: 20,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.bg,
                padding: isMobile ? 14 : 16,
                gap: 12,
                ...softShadow(),
              }}
            >
              <Text style={{ color: COLORS.text, fontSize: isMobile ? 19 : 20, fontWeight: "900", textAlign: "center" }}>
                {modalTitle}
              </Text>

              <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
                Blue IA mostrará este aviso en su asistente flotante durante el tiempo que
                marques y lo tendrá en cuenta al responder.
              </Text>

              <TextInput
                value={message}
                onChangeText={(v) => {
                  setMessage(v);
                  setModalErr(null);
                }}
                placeholder="Escribe aquí el aviso"
                placeholderTextColor="rgba(11,33,56,0.40)"
                multiline
                maxLength={140}
                style={{
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  color: COLORS.text,
                  backgroundColor: "#F8FBFE",
                  // 16 px: con menos, Safari (iPhone) hace zoom al enfocar y la pantalla
                  // se queda ampliada y "descuadrada".
                  fontSize: 16,
                  minHeight: 60,
                  textAlignVertical: "top",
                }}
              />

              <View style={{ gap: 8 }}>
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13 }}>Color</Text>

                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {COLOR_PRESETS.map((preset) => {
                    const selected = colorHex.toLowerCase() === preset.hex.toLowerCase();
                    return (
                      <Pressable
                        key={preset.hex}
                        onPress={() => {
                          setColorHex(preset.hex);
                          setModalErr(null);
                        }}
                        style={({ pressed }) => ({
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          minHeight: TACTIL.minimo,
                          paddingHorizontal: 12,
                          borderRadius: 999,
                          borderWidth: selected ? 2 : 1,
                          borderColor: selected ? COLORS.text : COLORS.border,
                          backgroundColor: pressed ? "#F0F5FA" : "#F8FBFE",
                        })}
                      >
                        <View
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 7,
                            backgroundColor: preset.hex,
                            borderWidth: 1,
                            borderColor: "rgba(11,33,56,0.18)",
                          }}
                        />
                        <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo }}>
                          {preset.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <TextInput
                  value={colorHex}
                  onChangeText={(v) => {
                    setColorHex(v);
                    setModalErr(null);
                  }}
                  placeholder="#RRGGBB"
                  placeholderTextColor="rgba(11,33,56,0.40)"
                  autoCapitalize="none"
                  style={{
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    borderRadius: 14,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: COLORS.text,
                    backgroundColor: "#F8FBFE",
                    fontSize: CAMPO.letra,
                    minHeight: CAMPO.alto,
                  }}
                />
              </View>

              <TextInput
                value={displaySeconds}
                onChangeText={(v) => {
                  setDisplaySeconds(v);
                  setModalErr(null);
                }}
                placeholder="Segundos en pantalla (2-60)"
                placeholderTextColor="rgba(11,33,56,0.40)"
                keyboardType="numeric"
                style={{
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  color: COLORS.text,
                  backgroundColor: "#F8FBFE",
                  fontSize: CAMPO.letra,
                  minHeight: CAMPO.alto,
                }}
              />

              <TextInput
                value={sortOrder}
                onChangeText={(v) => {
                  setSortOrder(v);
                  setModalErr(null);
                }}
                placeholder="Orden (0, 10, 20...)"
                placeholderTextColor="rgba(11,33,56,0.40)"
                keyboardType="numeric"
                style={{
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  color: COLORS.text,
                  backgroundColor: "#F8FBFE",
                  fontSize: CAMPO.letra,
                  minHeight: CAMPO.alto,
                }}
              />

              {/* Vista previa sencilla del aviso como bocadillo de Blue IA. */}
              <View style={{ alignItems: "center", gap: 6 }}>
                <Text style={{ color: COLORS.muted2, fontWeight: "800", fontSize: TAMANOS.minimo }}>
                  Vista previa en Blue IA
                </Text>
                <View style={{ alignItems: "center" }}>
                  <BocadilloBlue texto={message.trim() || "Vista previa del aviso…"} color={colorHex} />
                </View>
              </View>

              <View
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.cardSoft,
                  padding: 12,
                  gap: 12,
                }}
              >
                <View
                  style={{
                    flexDirection: isMobile ? "column" : "row",
                    justifyContent: "space-between",
                    alignItems: isMobile ? "stretch" : "center",
                    gap: 10,
                  }}
                >
                  <View style={{ flex: 1, paddingRight: isMobile ? 0 : 12 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>Noticia activa</Text>
                    <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 18 }}>
                      Si está activa, Blue IA la muestra y la usa al responder.
                    </Text>
                  </View>
                  <Switch value={isActive} onValueChange={setIsActive} />
                </View>
              </View>

              {!!modalErr && (
                <View
                  style={{
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: COLORS.dangerBorder,
                    backgroundColor: COLORS.dangerBg,
                    padding: 10,
                  }}
                >
                  <Text style={{ color: COLORS.danger, fontWeight: "800", lineHeight: 20, textAlign: "center" }}>
                    {modalErr}
                  </Text>
                </View>
              )}

              {/* La acción principal y, a su derecha, la X para cerrar (dueño, 2026-11-04). */}
              <View style={{ marginTop: 4 }}>
                <PieVentana
                  onCerrar={() => {
                    setOpen(false);
                    resetForm();
                  }}
                >
                  <Pressable
                    onPress={save}
                    disabled={saving}
                    style={({ pressed }) => ({
                      flex: 1,
                      opacity: saving ? 0.6 : pressed ? 0.9 : 1,
                      borderRadius: 999,
                      minHeight: CAMPO.alto,
                      justifyContent: "center",
                      paddingHorizontal: 18,
                      backgroundColor: COLORS.accentDark,
                    })}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "900", textAlign: "center" }}>
                      {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear noticia"}
                    </Text>
                  </Pressable>
                </PieVentana>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", padding: isMobile ? 10 : 16, justifyContent: "center" }}>
          <View
            style={{
              width: "100%",
              maxWidth: 520,
              alignSelf: "center",
              borderRadius: 18,
              borderWidth: 1,
              borderColor: COLORS.dangerBorder,
              backgroundColor: COLORS.bg,
              padding: isMobile ? 14 : 16,
              gap: 10,
            }}
          >
            <Text style={{ color: COLORS.text, fontSize: isMobile ? 17 : 18, fontWeight: "900", textAlign: "center" }}>
              Borrar noticia
            </Text>

            <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
              Vas a borrar{" "}
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                «{confirmDelete?.message ?? ""}»
              </Text>
              . Blue IA dejará de mostrarla y de usarla.
            </Text>

            <View style={{ marginTop: 6 }}>
              <PieVentana onCerrar={() => setConfirmDelete(null)}>
                <View style={{ flex: 1 }}>
                  <ChipButton label="Sí, borrar" variant="danger" onPress={removeConfirmed} isMobile={isMobile} fullWidth />
                </View>
              </PieVentana>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
