/**
 * Archivo: components/panel/inventario.tsx (antes app/admin/inventario.tsx, que ahora solo la descarga al abrirla)
 * Función: pantalla de administración de inventario interno, en la dirección /admin/inventario.
 * Para qué sirve: el administrador lista, crea, edita, cambia de estado (por revisar, listo, en reparación) y borra las unidades físicas que gestiona la tienda.
 * Conectado con: lib/supabase.ts (tabla inventory_items; sql/inventory_items.sql), lib/admin/productos.componentes.tsx, lib/admin/productos.utilidades.ts, constants/temaTienda.ts, components/admin/PiezasPanelAdmin.tsx.
 * Utilizado por: Expo Router (dirección /admin/inventario, protegida por app/admin/_layout.tsx); la enlaza la tarjeta «Inventario» de app/admin/index.tsx.
 * Dependencias: react, react-native.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: pantalla de administración de inventario interno. Lista, crea,
 * edita, cambia de estado y borra las unidades físicas en gestión (por
 * ejemplo, una consola recién comprada pendiente de revisión).
 *
 * Cómo funciona:
 * - Lee/escribe directamente en la tabla "inventory_items" de Supabase
 *   (columnas: id, code, title, status, notes, created_at, updated_at). Ver
 *   sql/inventory_items.sql para crear esa tabla en tu proyecto de Supabase
 *   si todavía no existe (hace falta ejecutarla una vez en el SQL Editor).
 * - Es una lista de gestión de stock independiente: no está enlazada con
 *   "products" ni con "sell_requests" (cotizaciones). El código sugiere un
 *   siguiente número correlativo al crear un artículo, pero es editable.
 * - El modal de creación/edición valida código y título antes de guardar
 *   con insert/update. toggleStatus() permite cambiar el estado con un toque
 *   desde la propia tarjeta, sin abrir el modal.
 * - Si la tabla "inventory_items" todavía no existe en Supabase, la pantalla
 *   lo detecta (error de Postgres "relation does not exist") y muestra un
 *   aviso claro en vez de romperse o quedarse cargando para siempre.
 * - Sigue el tema claro global: fondo blanco, azul claro de acento y textos
 *   en azul marino oscuro.
 * - Scroll: cabecera fija y compacta (volver + título centrado) y, debajo,
 *   subtítulo, estadísticas, buscador y lista en un único ScrollView (flex 1,
 *   margen final 48 px + zona segura). Antes todo lo de arriba era fijo y en
 *   el móvil dejaba la lista en una franja mínima.
 * - Tamaños del móvil (grupo 5, 2026-11-13; constants/temaTienda.ts): ningún texto de
 *   menos de 13 px, grises desde COLORES_TEXTO.secundario, los botones de estado
 *   de 44 px de alto y los campos de 16 px y 48 de alto.
 * - Rediseño PANRED3 (tanda 3, 2026-11-16; components/admin/PiezasPanelAdmin.tsx, como Usuarios, Pedidos, Categorías y
 *   Productos): cifras que filtran (Total, Por revisar, Listos, En reparación), buscador de 16 px (código, título o
 *   notas), pastillas de 44 px con su recuento, filas compactas (código · título, etiqueta de color del estado, notas y
 *   cuándo se actualizó) con el lápiz a mano y, al tocar una, el detalle por bloques (Artículo y Estado) con las acciones
 *   abajo: pasar a cualquiera de los otros dos estados con un toque y borrar. «Nuevo artículo» es el «+» flotante.
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase para todas las operaciones CRUD.
 * - sql/inventory_items.sql → crea la tabla y sus políticas (solo admin).
 * - app/admin/index.tsx → pantalla desde la que se entra aquí (tarjeta
 *   "Inventario") y a la que se vuelve con el botón de la cabecera.
 * - lib/admin/productos.componentes.tsx → CabeceraPanel, BotonPrincipalPanel, AvisoPanel, EstadoVacioPanel, BotonFlotante.
 * - components/admin/PiezasPanelAdmin.tsx → cifras, buscador, pastillas, filas y bloques; pruebas/perfil-datos.mjs (TM5 y PANRED3).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
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
import {
  CabeceraPanel,
  CargandoPanel,
  AvisoPanel,
  BotonFlotante,
  EstadoVacioPanel,
  BotonIconoPanel,
  PieVentana,
  BotonPrincipalPanel,
} from "../../lib/admin/productos.componentes";
import { CIERRE_TECLADO } from "../../lib/admin/productos.utilidades";
import { CAMPO, COLORES_TEXTO, TACTIL, TAMANOS } from "../../constants/temaTienda";
import {
  AccionTexto,
  Bloque,
  Buscador,
  Chip,
  Cifra,
  Dato,
  DetalleFila,
  Detalle,
  Etiqueta,
  EtiquetaColor,
  FilaCifras,
  FilaLista,
  FilaPastillas,
  ListaVacia,
  Miniatura,
  RecuentoLista,
  useDesplegables,
  type NombreIconoPanel,
  type Tono,
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

type InventoryStatus = "TO_REVIEW" | "READY_TO_LIST" | "IN_REPAIR";

type InventoryRow = {
  id: string;
  code: string;
  title: string;
  status: InventoryStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_LABELS: Record<InventoryStatus, string> = {
  TO_REVIEW: "Por revisar",
  READY_TO_LIST: "Listo para publicar",
  IN_REPAIR: "En reparación",
};

const STATUS_ORDER: InventoryStatus[] = ["TO_REVIEW", "READY_TO_LIST", "IN_REPAIR"];

function statusLabel(status: string) {
  return STATUS_LABELS[status as InventoryStatus] ?? status;
}

function statusColors(status: InventoryStatus) {
  if (status === "READY_TO_LIST") {
    return { border: COLORS.successBorder, bg: COLORS.successBg };
  }
  if (status === "IN_REPAIR") {
    return { border: COLORS.dangerBorder, bg: COLORS.dangerBg };
  }
  return { border: COLORS.warningBorder, bg: COLORS.warningBg };
}

// La etiqueta de color y el icono de cada estado en la lista (PANRED3).
const STATUS_TONO: Record<InventoryStatus, Tono> = { TO_REVIEW: "amarillo", READY_TO_LIST: "verde", IN_REPAIR: "rojo" };
const STATUS_ICONO: Record<InventoryStatus, NombreIconoPanel> = { TO_REVIEW: "time-outline", READY_TO_LIST: "checkmark-circle-outline", IN_REPAIR: "build-outline" };
const STATUS_ACCION: Record<InventoryStatus, string> = { TO_REVIEW: "Pasar a «Por revisar»", READY_TO_LIST: "Pasar a «Listo para publicar»", IN_REPAIR: "Pasar a «En reparación»" };
type FiltroInventario = InventoryStatus | "todos";

function fechaCorta(iso: string | null | undefined) {
  if (!iso) return "-";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "-";
  return new Date(t).toLocaleString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
}

// En la fila, solo el día (el año si no es el actual); la hora, en el detalle.
function fechaFila(iso: string | null | undefined) {
  if (!iso) return "-";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "-";
  const d = new Date(t);
  const otroAno = d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", ...(otroAno ? { year: "numeric" } : {}), timeZone: "Europe/Madrid" });
}

// Campo de texto del formulario: 16 px para que Safari en iPhone no haga
// zoom automático de toda la pantalla al enfocarlo.
const inputStyle = {
  borderWidth: 1,
  borderColor: COLORS.border,
  borderRadius: 14,
  paddingHorizontal: 12,
  paddingVertical: 12,
  color: COLORS.text,
  backgroundColor: "#F8FBFE",
  fontSize: CAMPO.letra,
  minHeight: CAMPO.alto,
} as const;

function isMissingTableError(e: any): boolean {
  const msg = String(e?.message ?? "").toLowerCase();
  return msg.includes("inventory_items") && (msg.includes("does not exist") || msg.includes("schema cache"));
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
      <Text
        style={{
          color: COLORS.text,
          fontWeight: "900",
          textAlign: "center",
          fontSize: isMobile ? 13 : 14,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function Inventario() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const sectionGap = isMobile ? 18 : 22;
  const insets = useSafeAreaInsets();
  const desplegables = useDesplegables();
  const [filtro, setFiltro] = useState<FiltroInventario>("todos");

  const [loading, setLoading] = useState(true);
  const [screenErr, setScreenErr] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);

  const [items, setItems] = useState<InventoryRow[]>([]);
  const itemsRef = useRef<InventoryRow[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const [search, setSearch] = useState("");

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<InventoryRow | null>(null);

  const [editing, setEditing] = useState<InventoryRow | null>(null);
  const isEdit = !!editing;

  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<InventoryStatus>("TO_REVIEW");
  const [notes, setNotes] = useState("");

  const modalTitle = useMemo(() => (isEdit ? "Editar artículo" : "Nuevo artículo"), [isEdit]);

  const stats = useMemo(() => {
    const total = items.length;
    const toReview = items.filter((x) => x.status === "TO_REVIEW").length;
    const ready = items.filter((x) => x.status === "READY_TO_LIST").length;
    const inRepair = items.filter((x) => x.status === "IN_REPAIR").length;
    return { total, toReview, ready, inRepair };
  }, [items]);

  const q = search.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    return items.filter((i) => {
      if (filtro !== "todos" && i.status !== filtro) return false;
      if (!q) return true;
      return (
        String(i.code ?? "").toLowerCase().includes(q) ||
        String(i.title ?? "").toLowerCase().includes(q) ||
        String(i.notes ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, q, filtro]);
  const cuenta = (f: FiltroInventario) => (f === "todos" ? items.length : items.filter((i) => i.status === f).length);

  function suggestNextCode(rows: InventoryRow[]) {
    let maxNum = 0;
    for (const r of rows) {
      const n = parseInt(String(r.code ?? "").replace(/\D/g, ""), 10);
      if (Number.isFinite(n) && n > maxNum) maxNum = n;
    }
    return String(maxNum + 1).padStart(3, "0");
  }

  async function load() {
    setLoading(true);
    setScreenErr(null);
    setTableMissing(false);

    try {
      const res = await supabase
        .from("inventory_items")
        .select("id,code,title,status,notes,created_at,updated_at")
        .order("created_at", { ascending: false });

      if (res.error) {
        if (isMissingTableError(res.error)) {
          setTableMissing(true);
          setItems([]);
          return;
        }
        throw res.error;
      }

      setItems((res.data ?? []) as InventoryRow[]);
    } catch (e: any) {
      console.error("Error cargando inventario:", e);
      setScreenErr("No se ha podido cargar el inventario. Inténtalo de nuevo.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function resetForm(rows?: InventoryRow[]) {
    setEditing(null);
    setCode(suggestNextCode(rows ?? itemsRef.current));
    setTitle("");
    setStatus("TO_REVIEW");
    setNotes("");
    setModalErr(null);
  }

  function openCreate() {
    resetForm();
    setOpen(true);
  }

  function openEdit(i: InventoryRow) {
    setEditing(i);
    setCode(i.code ?? "");
    setTitle(i.title ?? "");
    setStatus(i.status);
    setNotes(i.notes ?? "");
    setModalErr(null);
    setOpen(true);
  }

  async function save() {
    if (saving) return;

    setSaving(true);
    setModalErr(null);

    const cleanCode = code.trim();
    const cleanTitle = title.trim();
    const cleanNotes = notes.trim();

    if (!cleanCode) {
      setModalErr("Introduce un código para el artículo.");
      setSaving(false);
      return;
    }

    if (!cleanTitle || cleanTitle.length < 2) {
      setModalErr("Introduce un título válido.");
      setSaving(false);
      return;
    }

    try {
      const payload: any = {
        code: cleanCode,
        title: cleanTitle,
        status,
        notes: cleanNotes || null,
      };

      if (editing) {
        const { error } = await supabase.from("inventory_items").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("inventory_items").insert(payload);
        if (error) throw error;
      }

      setOpen(false);
      resetForm();
      await load();
    } catch (e: any) {
      console.error("Error guardando artículo de inventario:", e);
      if (isMissingTableError(e)) {
        setModalErr("Todavía no existe la tabla de inventario en Supabase. Revisa sql/inventory_items.sql.");
      } else {
        setModalErr("No se pudo guardar el artículo. Inténtalo de nuevo.");
      }
    } finally {
      setSaving(false);
    }
  }

  // Cambia el estado con un toque desde el detalle de la fila, sin abrir el formulario (antes, la pastilla del estado
  // pasaba al siguiente; ahora se elige directamente cualquiera de los otros dos).
  async function cambiarEstado(i: InventoryRow, newStatus: InventoryStatus) {
    setScreenErr(null);
    const prev = itemsRef.current;
    const next = prev.map((x) => (x.id === i.id ? { ...x, status: newStatus } : x));
    setItems(next);

    const { error } = await supabase.from("inventory_items").update({ status: newStatus }).eq("id", i.id);

    if (error) {
      setItems(prev);
      setScreenErr(error.message);
    }
  }

  function askRemove(i: InventoryRow) {
    setConfirmDelete(i);
  }

  async function removeConfirmed() {
    const i = confirmDelete;
    if (!i) return;

    setConfirmDelete(null);
    setScreenErr(null);

    try {
      const { error } = await supabase.from("inventory_items").delete().eq("id", i.id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      console.error("Error borrando artículo de inventario:", e);
      setScreenErr("No se ha podido borrar el artículo. Inténtalo de nuevo.");
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      {/* Cabecera fija y compacta (volver al panel + título centrado), igual
          en todo el panel. Lo demás va en un solo scroll. */}
      <CabeceraPanel title="Inventario" isMobile={isMobile} />

      {loading ? (
        <CargandoPanel texto="Cargando inventario…" />
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

          {/* 1) Cifras que filtran la lista (otro toque en la misma, todas). */}
          <FilaCifras nativeID="inventario-cifras">
            {(
              [
                ["todos", String(stats.total), "Total", "cube-outline"],
                ["TO_REVIEW", String(stats.toReview), "Por revisar", "time-outline"],
                ["READY_TO_LIST", String(stats.ready), "Listos", "checkmark-circle-outline"],
                ["IN_REPAIR", String(stats.inRepair), "En reparación", "build-outline"],
              ] as const
            ).map(([f, valor, etiqueta, icono]) => (
              <Cifra
                key={f}
                nativeID={`inventario-cifra-${f}`}
                valor={valor}
                etiqueta={etiqueta}
                icono={icono}
                ancho={isMobile ? "45%" : 0}
                activa={filtro === f && f !== "todos"}
                onPress={() => setFiltro((x) => (x === f ? "todos" : f))}
              />
            ))}
          </FilaCifras>

          {/* 2) Buscador y pastillas con su recuento. */}
          <View style={{ gap: 12 }}>
            <Buscador nativeID="inventario-buscar" valor={search} onCambiar={setSearch} placeholder="Buscar por código, título o notas" etiqueta="Buscar en el inventario por código, título o notas" />
            <FilaPastillas isMobile={isMobile} nativeID="inventario-filtros">
              {(["todos", ...STATUS_ORDER] as FiltroInventario[]).map((f) => (
                <Chip key={f} nativeID={`inventario-filtro-${f}`} label={`${f === "todos" ? "Todos" : statusLabel(f)} (${cuenta(f)})`} activo={filtro === f} onPress={() => setFiltro(f)} />
              ))}
            </FilaPastillas>
          </View>

          {!!screenErr && <AvisoPanel tone="danger" text={screenErr} />}

          {tableMissing && (
            <AvisoPanel
              tone="warning"
              title="Falta crear la tabla de inventario en Supabase."
              text="Ejecuta el archivo sql/inventory_items.sql una vez en el SQL Editor de tu proyecto de Supabase y recarga esta pantalla."
            />
          )}

          {/* 3) Cuántos salen, «Abrir todos» y las filas compactas. */}
          {!tableMissing ? (
            <View style={{ gap: 4 }}>
              <RecuentoLista
                nativeID="inventario-recuento"
                texto={q ? `${filteredItems.length} ${filteredItems.length === 1 ? "artículo encontrado" : "artículos encontrados"}` : `${filteredItems.length} de ${items.length} artículos`}
                abiertas={desplegables.todasAbiertas(filteredItems.map((i) => i.id))}
                onAlternar={filteredItems.length ? () => desplegables.abrirOCerrarTodas(filteredItems.map((i) => i.id)) : undefined}
                idBoton="inventario-abrir-todos"
              />
              {filteredItems.length === 0 ? (
                items.length ? (
                  <ListaVacia nativeID="inventario-vacio" icono="cube-outline" titulo="No hay artículos en esta lista." texto="Prueba a borrar el buscador o a elegir «Todos»." />
                ) : (
                  <EstadoVacioPanel icon="cube-outline" title="No hay artículos para este filtro." text="Crea tu primer artículo de inventario con el «+» para empezar a llevar el control." />
                )
              ) : (
                <View nativeID="inventario-lista">
                  {filteredItems.map((i, n) => {
                    const abierta = desplegables.estaAbierta(i.id);
                    return (
                      <FilaLista
                        key={i.id}
                        nativeID={`inventario-${i.id}`}
                        idFila={`inventario-fila-${i.id}`}
                        primera={n === 0}
                        abierta={abierta}
                        onPress={() => desplegables.alternar(i.id)}
                        etiquetaAccesible={`${i.code} · ${i.title}, ${statusLabel(i.status)}. ${abierta ? "Plegar" : "Ver el detalle"}`}
                        miniatura={<Miniatura icono={STATUS_ICONO[i.status] ?? "cube-outline"} ancho={48} alto={48} />}
                        titulo={`${i.code} · ${i.title}`}
                        etiqueta={<EtiquetaColor nativeID={`inventario-estado-${i.id}`} texto={statusLabel(i.status)} tono={STATUS_TONO[i.status] ?? "gris"} />}
                        subtitulo={i.notes ? i.notes : "Sin notas"}
                        idSubtitulo={`inventario-notas-${i.id}`}
                        // Las notas, en una línea (enteras en el detalle).
                        lineasSubtitulo={1}
                        etiquetas={<Etiqueta nativeID={`inventario-actualizado-${i.id}`} icon="time-outline" color={COLORS.muted} texto={`Actualizado: ${fechaFila(i.updated_at)}`} />}
                        derecha={<BotonIconoPanel icon="create-outline" label={`Editar ${i.code} ${i.title}`} variant="primary" onPress={() => openEdit(i)} />}
                      >
                        <DetalleFila
                          nativeID={`inventario-detalle-${i.id}`}
                          idAcciones={`inventario-acciones-${i.id}`}
                          acciones={
                            <>
                              {STATUS_ORDER.filter((s) => s !== i.status).map((s) => (
                                <AccionTexto key={s} nativeID={`inventario-pasar-${s}-${i.id}`} icono={STATUS_ICONO[s]} texto={STATUS_ACCION[s]} onPress={() => cambiarEstado(i, s)} />
                              ))}
                              <BotonIconoPanel icon="trash-outline" label={`Borrar ${i.code} ${i.title}`} variant="danger" onPress={() => askRemove(i)} />
                            </>
                          }
                        >
                          <Bloque icono="cube-outline" titulo="Artículo" ancho={isMobile ? "100%" : "45%"}>
                            <Dato etiqueta="Código">{i.code}</Dato>
                            <Dato etiqueta="Título">{i.title}</Dato>
                            <Dato etiqueta="Notas">{i.notes || "Sin notas"}</Dato>
                          </Bloque>
                          <Bloque icono="pulse-outline" titulo="Estado" ancho={isMobile ? "100%" : "45%"}>
                            <View style={{ flexDirection: "row" }}>
                              <EtiquetaColor texto={statusLabel(i.status)} tono={STATUS_TONO[i.status] ?? "gris"} />
                            </View>
                            <Dato etiqueta="Creado">{fechaCorta(i.created_at)}</Dato>
                            <Dato etiqueta="Actualizado">{fechaCorta(i.updated_at)}</Dato>
                            <Detalle>Lista interna: no sale en la tienda ni está enlazada con Productos.</Detalle>
                          </Bloque>
                        </DetalleFila>
                      </FilaLista>
                    );
                  })}
                </View>
              )}
            </View>
          ) : null}
        </View>
      </ScrollView>
      )}

      {/* «Nuevo artículo»: el «+» flotante abajo a la derecha (al alcance del pulgar). */}
      {!loading && !tableMissing ? <BotonFlotante nativeID="inventario-nuevo" label="Nuevo artículo" onPress={openCreate} /> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.60)",
            paddingHorizontal: isMobile ? 10 : 16,
          }}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "center",
              paddingTop: insets.top + 16,
              paddingBottom: insets.bottom + 32,
            }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={CIERRE_TECLADO}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 560,
                alignSelf: "center",
                borderRadius: 20,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.bg,
                padding: isMobile ? 14 : 16,
                gap: 12,
              }}
            >
              <Text style={{ color: COLORS.text, fontSize: isMobile ? 19 : 20, fontWeight: "900", textAlign: "center" }}>
                {modalTitle}
              </Text>

              <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
                Define el código interno, el título y el estado actual del artículo.
              </Text>

              <TextInput
                value={code}
                onChangeText={(v) => {
                  setCode(v);
                  setModalErr(null);
                }}
                placeholder="Código (ej. 001)"
                placeholderTextColor="rgba(11,33,56,0.40)"
                autoCapitalize="none"
                style={inputStyle}
              />

              <TextInput
                value={title}
                onChangeText={(v) => {
                  setTitle(v);
                  setModalErr(null);
                }}
                placeholder="Título (ej. PS5 Slim 1TB)"
                placeholderTextColor="rgba(11,33,56,0.40)"
                style={inputStyle}
              />

              <TextInput
                value={notes}
                onChangeText={(v) => {
                  setNotes(v);
                  setModalErr(null);
                }}
                placeholder="Notas (opcional)"
                placeholderTextColor="rgba(11,33,56,0.40)"
                multiline
                numberOfLines={3}
                style={{ ...inputStyle, minHeight: 72, textAlignVertical: "top" }}
              />

              <View style={{ gap: 10, alignItems: "center" }}>
                <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>Estado</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
                  {STATUS_ORDER.map((s) => {
                    const active = status === s;
                    const sc = statusColors(s);
                    return (
                      <Pressable
                        key={s}
                        onPress={() => setStatus(s)}
                        style={({ pressed }) => ({
                          opacity: pressed ? 0.88 : 1,
                          minHeight: TACTIL.minimo,
                          justifyContent: "center",
                          paddingHorizontal: 12,
                          borderRadius: 999,
                          borderWidth: active ? 2 : 1,
                          borderColor: active ? sc.border : COLORS.border,
                          backgroundColor: active ? sc.bg : "#F6FAFD",
                        })}
                      >
                        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.minimo }}>
                          {statusLabel(s)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {!!modalErr && <AvisoPanel tone="danger" text={modalErr} />}

              {/* La acción principal y, a su derecha, la X para cerrar (dueño, 2026-11-04). */}
              <View style={{ marginTop: 4 }}>
                <PieVentana
                  onCerrar={() => {
                    setOpen(false);
                    resetForm();
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <BotonPrincipalPanel
                      label={saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear artículo"}
                      onPress={save}
                      disabled={saving}
                      fullWidth
                    />
                  </View>
                </PieVentana>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(null)}>
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
              width: "100%",
              maxWidth: 520,
              alignSelf: "center",
              borderRadius: 18,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.bg,
              padding: isMobile ? 14 : 16,
              gap: 10,
            }}
          >
            <Text style={{ color: COLORS.text, fontSize: isMobile ? 17 : 18, fontWeight: "900", textAlign: "center" }}>
              Borrar artículo
            </Text>

            <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
              Vas a borrar{" "}
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                {confirmDelete ? `${confirmDelete.code} · ${confirmDelete.title}` : ""}
              </Text>
              . Esta acción no se puede deshacer.
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
