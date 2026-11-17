/**
 * Archivo: app/admin/blog.tsx
 * Función: pantalla de administración del Blog, en la dirección /admin/blog.
 * Para qué sirve: el administrador crea, edita, publica o pasa a borrador, reordena y borra los artículos que se leen en la página pública /blog.
 * Conectado con: lib/supabase.ts (tabla blog_posts), lib/admin/products.components.ts, constants/theme.ts, components/admin/PiezasPanelAdmin.tsx; la página pública es app/blog/index.tsx.
 * Utilizado por: Expo Router (dirección /admin/blog, protegida por app/admin/_layout.tsx); la enlaza la tarjeta «Blog» de app/admin/index.tsx.
 * Dependencias: react, react-native.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: pantalla de administración de los artículos del Blog que se
 * muestran en app/blog/index.tsx. Permite crear, editar, publicar/pasar a
 * borrador, reordenar y borrar artículos, sin tocar código.
 *
 * Cómo funciona:
 * - Lee/escribe directamente en la tabla "blog_posts" de Supabase (columnas:
 *   id, slug, title, excerpt, body, status ["DRAFT"|"PUBLISHED"],
 *   sort_order, created_at, updated_at). RLS: lectura pública de las
 *   publicadas, escritura solo admin (is_admin()) — igual que "products".
 * - El slug determina el enlace directo desde el pie de página de Inicio
 *   (?open=<slug>), así que conviene no cambiarlo una vez enlazado desde
 *   ahí ("Guías de compra" usa "elegir-consola-segunda-mano", "Consejos y
 *   mantenimiento" usa "mantenimiento-consola").
 * - «Publicar» / «Pasar a borrador» alterna entre status "PUBLISHED" y "DRAFT"
 *   con un cambio optimista en la lista (se revierte si Supabase falla),
 *   igual que toggleActive() en app/admin/categories.tsx.
 * - Tamaños del móvil (grupo 5, 2026-11-13; constants/theme.ts): ningún texto de
 *   menos de 13 px, grises desde COLORES_TEXTO.secundario, todo lo que se toca de
 *   44 px (también «volver») y los campos de 16 px y 48 de alto.
 * - Rediseño PANRED4 (tanda 4, 2026-11-16; components/admin/PiezasPanelAdmin.tsx, como Usuarios, Pedidos, Inventario y
 *   Cotizaciones): cifras que filtran (Total, Publicados, Borradores), buscador de 16 px (título, slug o resumen),
 *   pastillas de 44 px con su recuento, filas compactas (título, etiqueta de color del estado, resumen, slug, orden y
 *   cuándo se actualizó) con el lápiz y la papelera a mano y, al tocar una, el detalle por bloques (Artículo,
 *   Publicación y Contenido) con «Publicar» o «Pasar a borrador» abajo. «Nuevo artículo» es el «+» flotante.
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase para todas las operaciones CRUD.
 * - app/blog/index.tsx → pantalla pública que lee estas mismas filas
 *   (status="PUBLISHED") para pintar el listado del Blog.
 * - app/admin/index.tsx → pantalla desde la que se entra aquí (tarjeta
 *   "Blog") y a la que se vuelve con la flecha de la cabecera.
 * - app/admin/_layout.tsx → registra esta ruta ("blog") dentro del Stack
 *   protegido de administración.
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
  AdminLoading,
  AdminNotice,
  BotonFlotante,
  EmptyState,
  IconButton,
  PieVentana,
} from "../../lib/admin/products.components";
import { CAMPO, COLORES_TEXTO, TACTIL, TAMANOS } from "../../constants/theme";
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

type BlogStatus = "DRAFT" | "PUBLISHED";

type BlogRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  status: BlogStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type FiltroBlog = BlogStatus | "todos";
const PASTILLAS: [FiltroBlog, string][] = [
  ["todos", "Todos"],
  ["PUBLISHED", "Publicados"],
  ["DRAFT", "Borradores"],
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

// Cuántas palabras tiene el contenido (para el detalle).
function palabras(texto: string) {
  const t = String(texto ?? "").trim();
  return t ? t.split(/\s+/).length : 0;
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

export default function AdminBlog() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const sectionGap = isMobile ? 18 : 22;
  const insets = useSafeAreaInsets();
  const desplegables = useDesplegables();

  const [loading, setLoading] = useState(true);
  const [screenErr, setScreenErr] = useState<string | null>(null);

  const [items, setItems] = useState<BlogRow[]>([]);
  const itemsRef = useRef<BlogRow[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<FiltroBlog>("todos");

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BlogRow | null>(null);

  const [editing, setEditing] = useState<BlogRow | null>(null);
  const isEdit = !!editing;

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [body, setBody] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [published, setPublished] = useState(false);

  const modalTitle = useMemo(() => (isEdit ? "Editar artículo" : "Nuevo artículo"), [isEdit]);

  const cuenta = (f: FiltroBlog) => (f === "todos" ? items.length : items.filter((x) => x.status === f).length);

  const q = search.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    return items.filter((a) => {
      if (filtro !== "todos" && a.status !== filtro) return false;
      if (!q) return true;
      return (
        String(a.title ?? "").toLowerCase().includes(q) ||
        String(a.slug ?? "").toLowerCase().includes(q) ||
        String(a.excerpt ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, q, filtro]);

  async function load() {
    setLoading(true);
    setScreenErr(null);

    try {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("id,slug,title,excerpt,body,status,sort_order,created_at,updated_at")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;

      setItems((data ?? []) as BlogRow[]);
    } catch (e: any) {
      console.error("Error cargando artículos del blog:", e);
      setScreenErr("No se han podido cargar los artículos. Inténtalo de nuevo.");
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
    setExcerpt("");
    setBody("");
    setSortOrder(String(items.length * 10));
    setPublished(false);
    setModalErr(null);
  }

  function openCreate() {
    resetForm();
    setOpen(true);
  }

  function openEdit(row: BlogRow) {
    setEditing(row);
    setTitle(row.title ?? "");
    setSlug(row.slug ?? "");
    setExcerpt(row.excerpt ?? "");
    setBody(row.body ?? "");
    setSortOrder(String(row.sort_order ?? 0));
    setPublished(row.status === "PUBLISHED");
    setModalErr(null);
    setOpen(true);
  }

  async function save() {
    if (saving) return;

    setSaving(true);
    setModalErr(null);

    const cleanTitle = title.trim();
    const cleanSlug = slugify(slug || cleanTitle);
    const cleanExcerpt = excerpt.trim();
    const cleanBody = body.trim();
    const so = toIntSafe(sortOrder, 0);

    if (!cleanTitle) {
      setModalErr("Introduce un título para el artículo.");
      setSaving(false);
      return;
    }

    if (!cleanSlug) {
      setModalErr("Slug inválido.");
      setSaving(false);
      return;
    }

    if (!cleanBody) {
      setModalErr("Escribe el contenido del artículo.");
      setSaving(false);
      return;
    }

    try {
      const payload = {
        slug: cleanSlug,
        title: cleanTitle,
        excerpt: cleanExcerpt,
        body: cleanBody,
        sort_order: so,
        status: (published ? "PUBLISHED" : "DRAFT") as BlogStatus,
      };

      if (editing) {
        const { error } = await supabase.from("blog_posts").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("blog_posts").insert(payload);
        if (error) throw error;
      }

      setOpen(false);
      resetForm();
      await load();
    } catch (e: any) {
      console.error("Error guardando artículo:", e);
      const msg = String(e?.message ?? "");

      if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
        setModalErr("Ya existe un artículo con ese slug.");
      } else {
        setModalErr("No se pudo guardar el artículo. Inténtalo de nuevo.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function togglePublished(row: BlogRow) {
    const nextStatus: BlogStatus = row.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    const prev = itemsRef.current;
    const next = prev.map((x) => (x.id === row.id ? { ...x, status: nextStatus } : x));
    setItems(next);

    const { error } = await supabase.from("blog_posts").update({ status: nextStatus }).eq("id", row.id);

    if (error) {
      setItems(prev);
      setScreenErr(error.message);
    }
  }

  function askRemove(row: BlogRow) {
    setConfirmDelete(row);
  }

  async function removeConfirmed() {
    const row = confirmDelete;
    if (!row) return;

    setConfirmDelete(null);
    setScreenErr(null);

    try {
      const { error } = await supabase.from("blog_posts").delete().eq("id", row.id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      console.error("Error borrando artículo:", e);
      setScreenErr("No se ha podido borrar el artículo. Inténtalo de nuevo.");
    }
  }

  const hayFiltro = filtro !== "todos" || !!q;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      {/* Cabecera fija y compacta (volver al panel + título centrado), igual en todo el panel. Lo demás va en un solo
          scroll. */}
      <AdminHeader title="Blog" isMobile={isMobile} />

      {loading ? (
        <AdminLoading texto="Cargando artículos…" />
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
            {/* 1) Cifras que filtran la lista (otro toque en la misma, todos). */}
            <FilaCifras nativeID="blog-cifras">
              {(
                [
                  ["todos", "Total", "newspaper-outline"],
                  ["PUBLISHED", "Publicados", "checkmark-circle-outline"],
                  ["DRAFT", "Borradores", "create-outline"],
                ] as const
              ).map(([f, etiqueta, icono]) => (
                <Cifra
                  key={f}
                  nativeID={`blog-cifra-${f}`}
                  valor={String(cuenta(f))}
                  etiqueta={etiqueta}
                  icono={icono}
                  ancho={isMobile ? "30%" : 0}
                  activa={filtro === f && f !== "todos"}
                  onPress={() => setFiltro((x) => (x === f ? "todos" : f))}
                />
              ))}
            </FilaCifras>

            {/* 2) Buscador y pastillas con su recuento. */}
            <View style={{ gap: 12 }}>
              <Buscador
                nativeID="blog-buscar"
                valor={search}
                onCambiar={setSearch}
                placeholder="Buscar por título, slug o resumen"
                etiqueta="Buscar artículos del blog por título, slug o resumen"
              />
              <FilaPastillas isMobile={isMobile} nativeID="blog-filtros">
                {PASTILLAS.map(([f, t]) => (
                  <Chip key={f} nativeID={`blog-filtro-${f}`} label={`${t} (${cuenta(f)})`} activo={filtro === f} onPress={() => setFiltro(f)} />
                ))}
              </FilaPastillas>
            </View>

            {!!screenErr && <AdminNotice tone="danger" text={screenErr} />}

            {/* 3) Cuántos salen, «Abrir todos» y las filas compactas. */}
            <View style={{ gap: 4 }}>
              <RecuentoLista
                nativeID="blog-recuento"
                texto={q ? `${filteredItems.length} ${filteredItems.length === 1 ? "artículo encontrado" : "artículos encontrados"}` : `${filteredItems.length} de ${items.length} artículos`}
                abiertas={desplegables.todasAbiertas(filteredItems.map((r) => r.id))}
                onAlternar={filteredItems.length ? () => desplegables.abrirOCerrarTodas(filteredItems.map((r) => r.id)) : undefined}
                idBoton="blog-abrir-todos"
              />
              {filteredItems.length === 0 ? (
                items.length && hayFiltro ? (
                  <ListaVacia nativeID="blog-vacio" icono="newspaper-outline" titulo="No hay artículos para este filtro." texto="Prueba a borrar el buscador o a elegir «Todos»." />
                ) : (
                  <EmptyState icon="newspaper-outline" title="Todavía no hay artículos." text="Crea el primero con el «+»: si lo publicas, aparecerá en el Blog de la tienda." />
                )
              ) : (
                <View nativeID="blog-lista">
                  {filteredItems.map((row, n) => {
                    const abierta = desplegables.estaAbierta(row.id);
                    const publicado = row.status === "PUBLISHED";
                    return (
                      <FilaLista
                        key={row.id}
                        nativeID={`blog-${row.id}`}
                        idFila={`blog-fila-${row.id}`}
                        primera={n === 0}
                        abierta={abierta}
                        onPress={() => desplegables.alternar(row.id)}
                        etiquetaAccesible={`${row.title}, ${publicado ? "publicado" : "borrador"}. ${abierta ? "Plegar" : "Ver el detalle"}`}
                        miniatura={isMobile ? undefined : <Miniatura icono="newspaper-outline" ancho={48} alto={48} />}
                        titulo={row.title}
                        etiqueta={<EtiquetaColor nativeID={`blog-estado-${row.id}`} texto={publicado ? "Publicado" : "Borrador"} tono={publicado ? "verde" : "amarillo"} />}
                        subtitulo={row.excerpt?.trim() ? row.excerpt : "Sin resumen"}
                        idSubtitulo={`blog-resumen-${row.id}`}
                        // En el móvil, el resumen en una línea (entero en el detalle).
                        lineasSubtitulo={isMobile ? 1 : 2}
                        etiquetas={
                          <>
                            <Etiqueta nativeID={`blog-slug-${row.id}`} icon="link-outline" color={COLORES_TEXTO.azulTexto} texto={`slug: ${row.slug}`} />
                            <Etiqueta icon="time-outline" color={COLORS.muted} texto={`Actualizado: ${fechaPanel(row.updated_at)}`} />
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
                          nativeID={`blog-detalle-${row.id}`}
                          idAcciones={`blog-acciones-${row.id}`}
                          acciones={
                            <>
                              <AccionTexto
                                nativeID={`blog-publicar-${row.id}`}
                                icono={publicado ? "eye-off-outline" : "checkmark-circle-outline"}
                                texto={publicado ? "Pasar a borrador" : "Publicar en el Blog"}
                                onPress={() => togglePublished(row)}
                              />
                              <AccionTexto nativeID={`blog-editar-${row.id}`} icono="create-outline" texto="Editar el artículo" onPress={() => openEdit(row)} />
                            </>
                          }
                        >
                          <Bloque icono="newspaper-outline" titulo="Artículo" ancho={isMobile ? "100%" : "45%"}>
                            <Dato etiqueta="Título">{row.title}</Dato>
                            <Dato etiqueta="Slug">{row.slug}</Dato>
                            <Dato etiqueta="Enlace">{`/blog?open=${row.slug}`}</Dato>
                            <Dato etiqueta="Resumen">{row.excerpt?.trim() ? row.excerpt : "Sin resumen"}</Dato>
                          </Bloque>
                          <Bloque icono="pulse-outline" titulo="Publicación" ancho={isMobile ? "100%" : "45%"}>
                            <View style={{ flexDirection: "row" }}>
                              <EtiquetaColor texto={publicado ? "Publicado" : "Borrador"} tono={publicado ? "verde" : "amarillo"} />
                            </View>
                            <Detalle>{publicado ? "Se muestra en el listado público del Blog." : "Solo se ve aquí, en Administración."}</Detalle>
                            <Dato etiqueta="Orden">{String(row.sort_order ?? 0)}</Dato>
                            <Dato etiqueta="Creado">{fechaPanel(row.created_at, true)}</Dato>
                            <Dato etiqueta="Actualizado">{fechaPanel(row.updated_at, true)}</Dato>
                          </Bloque>
                          <Bloque nativeID={`blog-contenido-${row.id}`} icono="document-text-outline" titulo={`Contenido (${palabras(row.body)} palabras)`} ancho="100%">
                            <Text numberOfLines={6} style={{ color: COLORS.text, fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                              {row.body?.trim() ? row.body : "Sin contenido"}
                            </Text>
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

      {/* «Nuevo artículo»: el «+» flotante abajo a la derecha (al alcance del pulgar). */}
      {!loading ? <BotonFlotante nativeID="blog-nuevo" label="Nuevo artículo" onPress={openCreate} /> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* El formulario (con el texto largo del artículo) se desplaza dentro del modal y,
            en iPhone, sube por encima del teclado. */}
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

              <TextInput
                value={title}
                onChangeText={(v) => {
                  setTitle(v);
                  if (!isEdit) setSlug(slugify(v));
                  setModalErr(null);
                }}
                placeholder="Título del artículo"
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
                placeholder="Slug (identificador para el enlace)"
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
                value={excerpt}
                onChangeText={(v) => {
                  setExcerpt(v);
                  setModalErr(null);
                }}
                placeholder="Resumen corto (se ve en la lista, antes de abrir el artículo)"
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
                  minHeight: 50,
                  textAlignVertical: "top",
                }}
              />

              <TextInput
                value={body}
                onChangeText={(v) => {
                  setBody(v);
                  setModalErr(null);
                }}
                placeholder="Contenido completo del artículo"
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
                  minHeight: 140,
                  textAlignVertical: "top",
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
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>Publicado</Text>
                    <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 18 }}>
                      Si está publicado, aparece en el listado público del Blog. Si no, queda
                      como borrador solo visible aquí.
                    </Text>
                  </View>
                  <Switch value={published} onValueChange={setPublished} />
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
                      {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear artículo"}
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
              Borrar artículo
            </Text>

            <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
              Vas a borrar{" "}
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                {confirmDelete?.title ?? ""}
              </Text>
              . Dejará de mostrarse en el Blog.
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
