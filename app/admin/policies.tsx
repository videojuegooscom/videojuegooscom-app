/**
 * Archivo: app/admin/policies.tsx
 * Función: pantalla de administración de Políticas, en la dirección /admin/policies.
 * Para qué sirve: el administrador crea, edita, reordena, publica u oculta y borra las políticas (envíos, devoluciones, privacidad, términos…) y sus secciones, sin tocar código.
 * Conectado con: lib/supabase.ts (tabla policy_pages), lib/admin/productos.componentes.tsx, constants/temaTienda.ts, components/admin/PiezasPanelAdmin.tsx; la página pública es app/politicas/[slug].tsx.
 * Utilizado por: Expo Router (dirección /admin/policies, protegida por app/admin/_layout.tsx); la enlaza la tarjeta «Políticas» de app/admin/index.tsx.
 * Dependencias: react, react-native.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: pantalla de administración de las páginas de "Políticas"
 * (Envíos, Devoluciones, Privacidad, Términos y condiciones...) que se
 * muestran en app/politicas/[slug].tsx. Permite crear, editar, reordenar,
 * publicar/ocultar y borrar cada política, incluyendo sus secciones
 * (encabezado + texto), sin tocar código.
 *
 * Cómo funciona:
 * - Lee/escribe directamente en la tabla "policy_pages" de Supabase
 *   (columnas: id, slug, title, intro, sections [jsonb], is_active,
 *   sort_order, created_at, updated_at). RLS: lectura pública de las
 *   activas, escritura solo admin (is_admin()) — igual que "categories".
 * - El slug determina la URL pública (/politicas/<slug>): el pie de página
 *   de Inicio enlaza a los 4 slugs fijos "envios", "devoluciones",
 *   "privacidad" y "terminos". Se puede crear un slug nuevo, pero no tendrá
 *   enlace propio en el pie de página hasta que se añada allí.
 * - El editor de secciones es una lista libre de pares
 *   {heading, body} — se pueden añadir, editar y quitar antes de guardar;
 *   al guardar se descartan las secciones que queden vacías.
 * - toggleActive() aplica un cambio optimista en la lista y lo revierte si
 *   Supabase devuelve error, igual que en app/admin/categories.tsx.
 * - Tamaños del móvil (grupo 5, 2026-11-13; constants/temaTienda.ts): ningún texto de
 *   menos de 13 px, grises desde COLORES_TEXTO.secundario, todo lo que se toca de
 *   44 px (también «volver») y los campos de 16 px y 48 de alto.
 * - Rediseño PANRED4 (tanda 4, 2026-11-16; components/admin/PiezasPanelAdmin.tsx, como Usuarios, Pedidos, Inventario y
 *   Cotizaciones): cifras que filtran (Total, Publicadas, Ocultas y «En el pie» con las 4 del pie de página), buscador
 *   de 16 px (título, slug o introducción), pastillas de 44 px con su recuento, filas compactas (título, etiqueta de
 *   color, introducción, dirección, secciones y si está en el pie) con el lápiz y la papelera a mano y, al tocar una, el
 *   detalle por bloques (Página y Secciones) con «Publicar» u «Ocultar» abajo. «Nueva política» es el «+» flotante.
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase para todas las operaciones CRUD.
 * - app/politicas/[slug].tsx → pantalla pública que lee estas mismas filas
 *   (is_active=true) para pintar cada política.
 * - app/admin/index.tsx → pantalla desde la que se entra aquí (tarjeta
 *   "Políticas") y a la que se vuelve con la flecha de la cabecera.
 * - app/admin/_layout.tsx → registra esta ruta ("policies") dentro del
 *   Stack protegido de administración.
 * - components/admin/PiezasPanelAdmin.tsx → cifras, buscador, pastillas, filas y bloques; pruebas/perfil-datos.mjs (NO7, TM5 y
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
  Etiqueta,
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

// Los 4 slugs a los que enlaza el pie de página de Inicio.
const SLUGS_PIE = ["envios", "devoluciones", "privacidad", "terminos"];

type PolicySection = { heading: string; body: string };

type PolicyRow = {
  id: string;
  slug: string;
  title: string;
  intro: string;
  sections: PolicySection[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type FiltroPoliticas = "todas" | "publicadas" | "ocultas" | "pie";
const PASTILLAS: [FiltroPoliticas, string][] = [
  ["todas", "Todas"],
  ["publicadas", "Publicadas"],
  ["ocultas", "Ocultas"],
  ["pie", "En el pie de página"],
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

function slugify(input: string) {
  return (input ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 60);
}

function toIntSafe(v: string, fallback = 0) {
  const raw = String(v ?? "").trim();
  if (!raw) return fallback;
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function normalizeSections(value: unknown): PolicySection[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row): PolicySection | null => {
      if (!row || typeof row !== "object") return null;
      const heading = String((row as any).heading ?? "").trim();
      const body = String((row as any).body ?? "").trim();
      if (!heading && !body) return null;
      return { heading, body };
    })
    .filter((s): s is PolicySection => s !== null);
}

const enPie = (slug: string) => SLUGS_PIE.includes(String(slug ?? ""));
const textoSecciones = (n: number) => `${n} ${n === 1 ? "sección" : "secciones"}`;

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

export default function AdminPolicies() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const sectionGap = isMobile ? 18 : 22;
  const insets = useSafeAreaInsets();
  const desplegables = useDesplegables();

  const [loading, setLoading] = useState(true);
  const [screenErr, setScreenErr] = useState<string | null>(null);

  const [items, setItems] = useState<PolicyRow[]>([]);
  const itemsRef = useRef<PolicyRow[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<FiltroPoliticas>("todas");

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PolicyRow | null>(null);

  const [editing, setEditing] = useState<PolicyRow | null>(null);
  const isEdit = !!editing;

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [intro, setIntro] = useState("");
  const [sections, setSections] = useState<PolicySection[]>([]);
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);

  const modalTitle = useMemo(() => (isEdit ? "Editar política" : "Nueva política"), [isEdit]);

  const pasa = (x: PolicyRow, f: FiltroPoliticas) =>
    f === "todas" ? true : f === "publicadas" ? !!x.is_active : f === "ocultas" ? !x.is_active : enPie(x.slug);
  const cuenta = (f: FiltroPoliticas) => items.filter((x) => pasa(x, f)).length;
  // Cuántos de los 4 enlaces del pie tienen su página publicada.
  const piePublicadas = useMemo(() => SLUGS_PIE.filter((s) => items.some((x) => x.slug === s && x.is_active)).length, [items]);

  const q = search.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    return items.filter((x) => {
      if (!pasa(x, filtro)) return false;
      if (!q) return true;
      return (
        String(x.title ?? "").toLowerCase().includes(q) ||
        String(x.slug ?? "").toLowerCase().includes(q) ||
        String(x.intro ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, q, filtro]);

  async function load() {
    setLoading(true);
    setScreenErr(null);

    try {
      const { data, error } = await supabase
        .from("policy_pages")
        .select("id,slug,title,intro,sections,is_active,sort_order,created_at,updated_at")
        .order("sort_order", { ascending: true })
        .order("title", { ascending: true });

      if (error) throw error;

      const rows = ((data ?? []) as any[]).map((row) => ({
        ...row,
        sections: normalizeSections(row.sections),
      })) as PolicyRow[];

      setItems(rows);
    } catch (e: any) {
      console.error("Error cargando políticas:", e);
      setScreenErr("No se han podido cargar las políticas. Inténtalo de nuevo.");
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
    setTitle("");
    setSlug("");
    setIntro("");
    setSections([{ heading: "", body: "" }]);
    setSortOrder(String(items.length * 10));
    setIsActive(true);
    setModalErr(null);
  }

  function openCreate() {
    resetForm();
    setOpen(true);
  }

  function openEdit(row: PolicyRow) {
    setEditing(row);
    setTitle(row.title ?? "");
    setSlug(row.slug ?? "");
    setIntro(row.intro ?? "");
    setSections(row.sections.length > 0 ? row.sections : [{ heading: "", body: "" }]);
    setSortOrder(String(row.sort_order ?? 0));
    setIsActive(!!row.is_active);
    setModalErr(null);
    setOpen(true);
  }

  function updateSection(index: number, patch: Partial<PolicySection>) {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addSection() {
    setSections((prev) => [...prev, { heading: "", body: "" }]);
  }

  function removeSection(index: number) {
    setSections((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    if (saving) return;

    setSaving(true);
    setModalErr(null);

    const cleanTitle = title.trim();
    const cleanSlug = slugify(slug || cleanTitle);
    const cleanIntro = intro.trim();
    const so = toIntSafe(sortOrder, 0);
    const cleanSections = sections
      .map((s) => ({ heading: s.heading.trim(), body: s.body.trim() }))
      .filter((s) => s.heading && s.body);

    if (!cleanTitle) {
      setModalErr("Introduce un título para la política.");
      setSaving(false);
      return;
    }

    if (!cleanSlug) {
      setModalErr("Slug inválido.");
      setSaving(false);
      return;
    }

    try {
      const payload = {
        slug: cleanSlug,
        title: cleanTitle,
        intro: cleanIntro,
        sections: cleanSections,
        sort_order: so,
        is_active: isActive,
      };

      if (editing) {
        const { error } = await supabase.from("policy_pages").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("policy_pages").insert(payload);
        if (error) throw error;
      }

      setOpen(false);
      resetForm();
      await load();
    } catch (e: any) {
      console.error("Error guardando política:", e);
      const msg = String(e?.message ?? "");

      if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
        setModalErr("Ya existe una política con ese slug.");
      } else {
        setModalErr("No se pudo guardar la política. Inténtalo de nuevo.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: PolicyRow) {
    const prev = itemsRef.current;
    const next = prev.map((x) => (x.id === row.id ? { ...x, is_active: !x.is_active } : x));
    setItems(next);

    const { error } = await supabase
      .from("policy_pages")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);

    if (error) {
      setItems(prev);
      setScreenErr(error.message);
    }
  }

  function askRemove(row: PolicyRow) {
    setConfirmDelete(row);
  }

  async function removeConfirmed() {
    const row = confirmDelete;
    if (!row) return;

    setConfirmDelete(null);
    setScreenErr(null);

    try {
      const { error } = await supabase.from("policy_pages").delete().eq("id", row.id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      console.error("Error borrando política:", e);
      setScreenErr("No se ha podido borrar la política. Inténtalo de nuevo.");
    }
  }

  const hayFiltro = filtro !== "todas" || !!q;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      {/* Cabecera fija y compacta (volver al panel + título centrado), igual en todo el panel. Lo demás va en un solo
          scroll. */}
      <AdminHeader title="Políticas" isMobile={isMobile} />

      {loading ? (
        <AdminLoading texto="Cargando políticas…" />
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
            <AdminIntro text="Envíos, devoluciones, privacidad y términos: el pie de página enlaza a los slugs «envios», «devoluciones», «privacidad» y «terminos»." />

            {/* 1) Cifras que filtran la lista (otro toque en la misma, todas). */}
            <FilaCifras nativeID="politicas-cifras">
              {(
                [
                  ["todas", String(cuenta("todas")), "Total", "document-text-outline"],
                  ["publicadas", String(cuenta("publicadas")), "Publicadas", "checkmark-circle-outline"],
                  ["ocultas", String(cuenta("ocultas")), "Ocultas", "eye-off-outline"],
                  ["pie", `${piePublicadas} / ${SLUGS_PIE.length}`, "En el pie", "link-outline"],
                ] as const
              ).map(([f, valor, etiqueta, icono]) => (
                <Cifra
                  key={f}
                  nativeID={`politicas-cifra-${f}`}
                  valor={valor}
                  etiqueta={etiqueta}
                  icono={icono}
                  ancho={isMobile ? "45%" : 0}
                  activa={filtro === f && f !== "todas"}
                  alerta={f === "pie" && piePublicadas < SLUGS_PIE.length && filtro !== "pie"}
                  onPress={() => setFiltro((x) => (x === f ? "todas" : f))}
                />
              ))}
            </FilaCifras>

            {/* 2) Buscador y pastillas con su recuento. */}
            <View style={{ gap: 12 }}>
              <Buscador
                nativeID="politicas-buscar"
                valor={search}
                onCambiar={setSearch}
                placeholder="Buscar por título, slug o introducción"
                etiqueta="Buscar políticas por título, slug o introducción"
              />
              <FilaPastillas isMobile={isMobile} nativeID="politicas-filtros">
                {PASTILLAS.map(([f, t]) => (
                  <Chip key={f} nativeID={`politicas-filtro-${f}`} label={`${t} (${cuenta(f)})`} activo={filtro === f} onPress={() => setFiltro(f)} />
                ))}
              </FilaPastillas>
            </View>

            {!!screenErr && <AdminNotice tone="danger" text={screenErr} />}

            {/* 3) Cuántas salen, «Abrir todas» y las filas compactas. */}
            <View style={{ gap: 4 }}>
              <RecuentoLista
                nativeID="politicas-recuento"
                texto={q ? `${filteredItems.length} ${filteredItems.length === 1 ? "política encontrada" : "políticas encontradas"}` : `${filteredItems.length} de ${items.length} políticas`}
                abiertas={desplegables.todasAbiertas(filteredItems.map((r) => r.id))}
                onAlternar={filteredItems.length ? () => desplegables.abrirOCerrarTodas(filteredItems.map((r) => r.id)) : undefined}
                idBoton="politicas-abrir-todas"
                femenino
              />
              {filteredItems.length === 0 ? (
                items.length && hayFiltro ? (
                  <ListaVacia nativeID="politicas-vacio" icono="document-text-outline" titulo="No hay políticas para este filtro." texto="Prueba a borrar el buscador o a elegir «Todas»." />
                ) : (
                  <EmptyState icon="document-text-outline" title="Todavía no hay políticas." text="Crea la primera con el «+»: si la publicas, se verá en /politicas/ y su slug." />
                )
              ) : (
                <View nativeID="politicas-lista">
                  {filteredItems.map((row, n) => {
                    const abierta = desplegables.estaAbierta(row.id);
                    const pie = enPie(row.slug);
                    return (
                      <FilaLista
                        key={row.id}
                        nativeID={`politica-${row.id}`}
                        idFila={`politica-fila-${row.id}`}
                        primera={n === 0}
                        abierta={abierta}
                        onPress={() => desplegables.alternar(row.id)}
                        etiquetaAccesible={`${row.title}, ${row.is_active ? "publicada" : "oculta"}. ${abierta ? "Plegar" : "Ver el detalle"}`}
                        miniatura={isMobile ? undefined : <Miniatura icono="document-text-outline" ancho={48} alto={48} />}
                        titulo={row.title}
                        colorTitulo={row.is_active ? undefined : COLORS.muted}
                        etiqueta={<EtiquetaColor nativeID={`politica-estado-${row.id}`} texto={row.is_active ? "Publicada" : "Oculta"} tono={row.is_active ? "verde" : "gris"} />}
                        subtitulo={row.intro?.trim() ? row.intro : "Sin introducción"}
                        idSubtitulo={`politica-intro-${row.id}`}
                        // En el móvil, la introducción en una línea (entera en el detalle).
                        lineasSubtitulo={isMobile ? 1 : 2}
                        etiquetas={
                          <>
                            <Etiqueta nativeID={`politica-url-${row.id}`} icon="link-outline" color={COLORES_TEXTO.azulTexto} texto={`/politicas/${row.slug}`} />
                            <Etiqueta nativeID={`politica-secciones-${row.id}`} icon="list-outline" color={COLORS.muted} texto={textoSecciones(row.sections.length)} />
                            {pie ? <Etiqueta nativeID={`politica-pie-${row.id}`} icon="albums-outline" color={COLORS.success} texto="En el pie de página" /> : null}
                          </>
                        }
                        derecha={
                          <BotonesFila>
                            <IconButton icon="create-outline" label={`Editar ${row.title}`} variant="primary" onPress={() => openEdit(row)} />
                            <IconButton icon="trash-outline" label={`Borrar ${row.title}`} variant="danger" onPress={() => askRemove(row)} />
                          </BotonesFila>
                        }
                      >
                        <DetalleFila
                          nativeID={`politica-detalle-${row.id}`}
                          idAcciones={`politica-acciones-${row.id}`}
                          acciones={
                            <>
                              <AccionTexto
                                nativeID={`politica-publicar-${row.id}`}
                                icono={row.is_active ? "eye-off-outline" : "checkmark-circle-outline"}
                                texto={row.is_active ? "Ocultar en la tienda" : "Publicar en la tienda"}
                                onPress={() => toggleActive(row)}
                              />
                              <AccionTexto nativeID={`politica-editar-${row.id}`} icono="create-outline" texto="Editar la política" onPress={() => openEdit(row)} />
                            </>
                          }
                        >
                          <Bloque icono="document-text-outline" titulo="Página" ancho={isMobile ? "100%" : "40%"}>
                            <Dato etiqueta="Título">{row.title}</Dato>
                            <Dato etiqueta="Dirección">{`/politicas/${row.slug}`}</Dato>
                            <Detalle color={pie ? COLORS.success : undefined}>{pie ? "Enlazada desde el pie de página de Inicio." : "Sin enlace en el pie de página."}</Detalle>
                            <View style={{ flexDirection: "row" }}>
                              <EtiquetaColor texto={row.is_active ? "Publicada" : "Oculta"} tono={row.is_active ? "verde" : "gris"} />
                            </View>
                            <Dato etiqueta="Introducción">{row.intro?.trim() ? row.intro : "Sin introducción"}</Dato>
                            <Dato etiqueta="Orden">{String(row.sort_order ?? 0)}</Dato>
                            <Dato etiqueta="Actualizada">{fechaPanel(row.updated_at, true)}</Dato>
                          </Bloque>
                          <Bloque nativeID={`politica-bloque-secciones-${row.id}`} icono="list-outline" titulo={`Secciones (${row.sections.length})`} ancho={isMobile ? "100%" : "50%"}>
                            {row.sections.length ? (
                              row.sections.map((s, i) => (
                                <View key={i} style={{ gap: 2 }}>
                                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.minimo, lineHeight: 19 }}>{`${i + 1}. ${s.heading || "Sin encabezado"}`}</Text>
                                  <Text numberOfLines={2} style={{ color: COLORS.muted, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                                    {s.body || "Sin texto"}
                                  </Text>
                                </View>
                              ))
                            ) : (
                              <Detalle>Sin secciones: la página muestra solo su introducción.</Detalle>
                            )}
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

      {/* «Nueva política»: el «+» flotante abajo a la derecha (al alcance del pulgar). */}
      {!loading ? <BotonFlotante nativeID="politicas-nueva" label="Nueva política" onPress={openCreate} /> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* El formulario (con todas sus secciones) se desplaza dentro del modal y, en
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
                maxWidth: 680,
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

              <TextInput
                value={title}
                onChangeText={(v) => {
                  setTitle(v);
                  if (!isEdit) setSlug(slugify(v));
                  setModalErr(null);
                }}
                placeholder="Título (ej: Política de envíos)"
                placeholderTextColor="rgba(11,33,56,0.40)"
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
                value={slug}
                onChangeText={(v) => {
                  setSlug(v);
                  setModalErr(null);
                }}
                placeholder="Slug para la URL (ej: envios)"
                placeholderTextColor="rgba(11,33,56,0.40)"
                autoCapitalize="none"
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
                value={intro}
                onChangeText={(v) => {
                  setIntro(v);
                  setModalErr(null);
                }}
                placeholder="Texto de introducción"
                placeholderTextColor="rgba(11,33,56,0.40)"
                multiline
                style={{
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  color: COLORS.text,
                  backgroundColor: "#F8FBFE",
                  fontSize: 16,
                  minHeight: 60,
                  textAlignVertical: "top",
                }}
              />

              <View style={{ gap: 10 }}>
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 13 }}>Secciones</Text>

                {sections.map((section, index) => (
                  <View
                    key={index}
                    style={{
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      backgroundColor: COLORS.cardSoft,
                      padding: 10,
                      gap: 8,
                    }}
                  >
                    <TextInput
                      value={section.heading}
                      onChangeText={(v) => updateSection(index, { heading: v })}
                      placeholder="Encabezado de la sección"
                      placeholderTextColor="rgba(11,33,56,0.40)"
                      style={{
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        borderRadius: 12,
                        paddingHorizontal: 10,
                        paddingVertical: 10,
                        color: COLORS.text,
                        backgroundColor: "#FFFFFF",
                        fontSize: CAMPO.letra,
                        minHeight: CAMPO.alto,
                        fontWeight: "800",
                      }}
                    />
                    <TextInput
                      value={section.body}
                      onChangeText={(v) => updateSection(index, { body: v })}
                      placeholder="Texto de la sección"
                      placeholderTextColor="rgba(11,33,56,0.40)"
                      multiline
                      style={{
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        borderRadius: 12,
                        paddingHorizontal: 10,
                        paddingVertical: 10,
                        color: COLORS.text,
                        backgroundColor: "#FFFFFF",
                        fontSize: 16,
                        minHeight: 60,
                        textAlignVertical: "top",
                      }}
                    />
                    <View style={{ alignSelf: "flex-start" }}>
                      <IconButton icon="trash-outline" label={`Quitar la sección ${index + 1}`} variant="danger" onPress={() => removeSection(index)} />
                    </View>
                  </View>
                ))}

                <Pressable
                  onPress={addSection}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.88 : 1,
                    borderRadius: 999,
                    minHeight: TACTIL.minimo,
                    justifyContent: "center",
                    paddingHorizontal: 14,
                    borderWidth: 1,
                    borderColor: COLORS.accentBorder,
                    backgroundColor: COLORS.accent2,
                    alignSelf: "center",
                  })}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.minimo }}>
                    + Añadir sección
                  </Text>
                </Pressable>
              </View>

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
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>Política publicada</Text>
                    <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 18 }}>
                      Si está publicada, es visible en /politicas/{slug || "..."}.
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
                      {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear política"}
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
              Borrar política
            </Text>

            <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
              Vas a borrar{" "}
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                {confirmDelete?.title ?? ""}
              </Text>
              . Su enlace en el pie de página dejará de tener contenido.
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
