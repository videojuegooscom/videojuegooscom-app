// app/admin/categories.tsx
/**
 * Qué hace: pantalla de administración de categorías. Lista, crea, edita,
 * activa/desactiva y borra las categorías que estructuran la navegación
 * comercial de la tienda (por ejemplo "PlayStation 5", "Xbox", "PC Gaming").
 *
 * Cómo funciona:
 * - Lee/escribe directamente en la tabla "categories" de Supabase
 *   (columnas: id, name, slug, sort_order, is_active, image_url, imagenes,
 *   created_at, updated_at).
 * - Portadas: hasta 3 fotos por categoría que se suben desde el formulario
 *   (selector de archivos del panel, reducidas a 1600 px en JPEG) al
 *   almacenamiento product-media, carpeta categorias/. Se guardan en
 *   "imagenes" (y la primera también en "image_url") y en la tienda se pasan
 *   solas en carrusel (components/PortadasCategoria.tsx).
 * - Encuadre para Inicio: al subir una foto se abre «Encuadra la portada»
 *   (RecortarFoto, components/PerfilPublico.tsx) con la forma exacta del
 *   recuadro de Inicio en el móvil, el nombre encima y la foto al % elegido;
 *   al aceptar se suben la foto entera (para la cabecera de dentro de la
 *   categoría) y el encuadre (columna "portadas_inicio", mismo orden que
 *   "imagenes"). «Encuadrar» en cada miniatura lo cambia. Sin esa columna
 *   (migración 20261101170000 pendiente) se sube como antes y se avisa.
 * - «Cómo se ve en Inicio»: con portada, una vista previa del recuadro de
 *   Inicio (el encuadre llenándolo y el nombre encima, sin «Ver categoría»)
 *   y una barra con «−» y «+» (de 10 en 10; la barra de 5 en 5) para que la
 *   foto se vea más suave o más fuerte (10-100 %, columna
 *   "portada_opacidad"; sin valor, 55 %). Al guardar, Inicio se entera al
 *   momento (olvidarPortadasCategorias avisa a las pantallas abiertas).
 * - Lee con select("*"): si "imagenes", "image_url" o "portada_opacidad"
 *   aún no existen en Supabase, no vienen y no se guardan (supportsImagenes,
 *   supportsImageUrl, supportsOpacidad), sin errores 400; sin "imagenes"
 *   solo se guarda una portada.
 * - El modal de creación/edición valida nombre y slug (autogenerado desde el
 *   nombre) antes de guardar con insert/update.
 * - «Reparación / Limpieza» (el recuadro de Inicio que lleva a Servicios)
 *   sale siempre en la lista para ponerle portada: si aún no tiene fila en
 *   categories, va una provisional (sin id) y al guardarla se crea con el
 *   slug «reparaciones». En su formulario solo están las portadas y cuánto se
 *   ven (sin nombre, slug, orden ni «activa»), y no se puede borrar ni ocultar.
 * - Cada categoría enseña cuántas veces se ha tocado su recuadro de Inicio en
 *   30 días y cuántas de ellas tenía portada (analítica propia
 *   «categoria_inicio», que no cuenta a quien la rechazó ni al administrador).
 * - toggleActive() aplica un cambio optimista en la lista y lo revierte si
 *   Supabase devuelve error.
 * - Sigue el tema claro global: fondo blanco, azul claro de acento y textos
 *   en azul marino oscuro.
 * - Scroll: cabecera fija y compacta (volver + título centrado) y, debajo,
 *   subtítulo, estadísticas, buscador y lista en un único ScrollView (flex 1,
 *   margen final 48 px + zona segura). Antes todo lo de arriba era fijo y en
 *   el móvil dejaba la lista en una franja mínima.
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase para todas las operaciones CRUD.
 * - app/admin/index.tsx → pantalla desde la que se entra aquí (tarjeta
 *   "Categorías") y a la que se vuelve con el botón de la cabecera.
 * - app/admin/products/products.components.tsx → AdminHeader, StatCard,
 *   PrimaryButton, AdminNotice y EmptyState (mismo diseño en todo el panel).
 * - app/admin/products.tsx → los productos usan estas categorías
 *   (category_id) para clasificarse en el catálogo público.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import SmartImage from "../../components/SmartImage";
import PortadasCategoria, {
  CATEGORIA_SERVICIOS,
  MAX_PORTADAS,
  NombreSobrePortada,
  OPACIDAD_PORTADA_DEFECTO,
  OPACIDAD_PORTADA_MIN,
  PROPORCION_RECUADRO_INICIO,
  PortadaConNombre,
  PortadaNombreMovible,
  type PosicionNombre,
  SALIDA_ENCUADRE,
  encuadresDe,
  esCategoriaServicios,
  faltaColumnaPortadas,
  olvidarPortadasCategorias,
  opacidadDe,
  portadasDe,
  portadasInicioDe,
  posicionNombreDe,
} from "../../components/PortadasCategoria";
import { RecortarFoto } from "../../components/PerfilPublico";
import {
  AdminHeader,
  AdminLoading,
  AdminNotice,
  BotonFlotante,
  EmptyState,
  IconButton,
  PrimaryButton,
  StatCard,
} from "../../lib/admin/products.components";
import { CIERRE_TECLADO, pickMediaFilesWeb, reducirImagenWeb } from "../../lib/admin/products.utils";
import { MEDIA_BUCKET } from "../../lib/admin/products.constants";

// «−» y «+» de cuánto se ve la foto: de 10 en 10, para que cada toque se note (la barra va de 5 en 5).
const PASO_BOTON_OPACIDAD = 10;
// Separación entre las fichas de la rejilla.
const GAP_REJILLA = 10;

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

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  image_url?: string | null;
  imagenes?: unknown;
  portada_opacidad?: number | null;
  portadas_inicio?: unknown;
  titulo_posicion?: unknown;
  created_at: string;
  updated_at: string;
};

async function consultarCategorias(columnas: string) {
  const res = await supabase
    .from("categories")
    .select(columnas)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  return { data: (res.data ?? null) as unknown as CategoryRow[] | null, error: res.error };
}

// «Reparación / Limpieza» (lleva a Servicios) sale siempre en la lista para poder ponerle portada: si aún no tiene fila
// en categories, va una provisional (sin id) al final y al guardarla se crea.
function conRecuadroServicios(filas: CategoryRow[]): CategoryRow[] {
  if (filas.some((c) => esCategoriaServicios(c.slug))) return filas;
  const orden = filas.reduce((max, c) => Math.max(max, Number(c.sort_order) || 0), 0) + 1;
  const provisional: CategoryRow = {
    id: "",
    name: CATEGORIA_SERVICIOS.nombre,
    slug: CATEGORIA_SERVICIOS.slug,
    sort_order: orden,
    is_active: true,
    image_url: null,
    imagenes: [],
    portada_opacidad: null,
    created_at: "",
    updated_at: "",
  };
  return [...filas, provisional];
}

// Extensión del archivo que se sube (las reducidas siempre son JPEG).
function extensionDe(tipo: string) {
  if (tipo === "image/png") return "png";
  if (tipo === "image/webp") return "webp";
  if (tipo === "image/avif") return "avif";
  return "jpg";
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
  fontSize: 16,
} as const;

function slugify(input: string) {
  return (input ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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

  const borderColor = isPrimary
    ? COLORS.accentBorder
    : isDanger
      ? COLORS.dangerBorder
      : COLORS.border;

  const backgroundColor = isPrimary
    ? COLORS.accent2
    : isDanger
      ? COLORS.dangerBg
      : "#F6FAFD";

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

export default function AdminCategories() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const isDesktopish = widthSafe >= 1024;
  const pagePadding = isMobile ? 12 : 16;
  const sectionGap = isMobile ? 20 : 24;
  // Rejilla de fichas: 2 por fila en el móvil, 3 en tableta y 4 en el ordenador; el ancho sale del de la pantalla
  // (sin márgenes) y, si hay barra de desplazamiento, de lo que mide de verdad la rejilla.
  const columnasRejilla = isMobile ? 2 : isDesktopish ? 4 : 3;
  const [anchoRejilla, setAnchoRejilla] = useState(0);
  const anchoDisponible = anchoRejilla || Math.min(widthSafe - pagePadding * 2, 1040);
  const anchoFicha = Math.floor((anchoDisponible - GAP_REJILLA * (columnasRejilla - 1)) / columnasRejilla);
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [screenErr, setScreenErr] = useState<string | null>(null);

  const [items, setItems] = useState<CategoryRow[]>([]);
  const itemsRef = useRef<CategoryRow[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const [supportsImageUrl, setSupportsImageUrl] = useState(true);
  const [supportsImagenes, setSupportsImagenes] = useState(true);
  // ¿Existe ya la columna de cuánto se ve la portada en Inicio (migración 20261101140000)?
  const [supportsOpacidad, setSupportsOpacidad] = useState(true);
  // Sin la columna "imagenes" (migración pendiente) solo cabe una portada, la de image_url.
  const maxPortadas = supportsImagenes ? MAX_PORTADAS : supportsImageUrl ? 1 : 0;

  const [search, setSearch] = useState("");

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CategoryRow | null>(null);

  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const isEdit = !!editing;
  // «Reparación / Limpieza»: solo portadas y cuánto se ven (el nombre y el enlace del recuadro de Inicio son fijos).
  const editandoServicios = esCategoriaServicios(editing?.slug);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [portadas, setPortadas] = useState<string[]>([]);
  // El encuadre para el recuadro de Inicio de cada portada (mismo orden; "" = sin encuadrar, Inicio la recorta por el
  // centro). Columna portadas_inicio (migración 20261101170000): sin ella no se ofrece encuadrar.
  const [encuadres, setEncuadres] = useState<string[]>([]);
  const [supportsEncuadre, setSupportsEncuadre] = useState(true);
  // Ventana de encuadre abierta: una foto nueva (antes de subirla) o una portada ya subida (indice).
  const [recorte, setRecorte] = useState<{ uri: string; remota: boolean; indice: number | null; archivo?: File } | null>(null);
  // Cuánto se ve la portada en el recuadro de Inicio (10-100 %): menos, más suave y el nombre se lee mejor.
  const [opacidad, setOpacidad] = useState(OPACIDAD_PORTADA_DEFECTO);
  // Dónde va el nombre encima de la portada (lo mueve el dueño manteniéndolo pulsado); null = en el centro. Columna
  // titulo_posicion (migración 20261101190000): sin ella se puede mover en la vista previa, pero no se guarda.
  const [posicionNombre, setPosicionNombre] = useState<PosicionNombre | null>(null);
  const [supportsPosicion, setSupportsPosicion] = useState(true);
  // «Aplicar a otras»: desplegable con las demás categorías para copiarles la transparencia y la posición del nombre.
  const [copiarAbierto, setCopiarAbierto] = useState(false);
  const [copiarA, setCopiarA] = useState<string[]>([]);
  const [copiando, setCopiando] = useState(false);
  const [avisoCopiar, setAvisoCopiar] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [avisoPortadas, setAvisoPortadas] = useState<string | null>(null);
  // Toques en cada recuadro de «Categorías» de Inicio, por slug (analítica propia «categoria_inicio», 30 días; sin
  // quien la rechazó ni el administrador). null si no se ha podido leer.
  const [toquesInicio, setToquesInicio] = useState<Record<string, { toques: number; conPortada: number }> | null>(null);

  const modalTitle = useMemo(
    () => (isEdit ? "Editar categoría" : "Nueva categoría"),
    [isEdit]
  );

  const stats = useMemo(() => {
    const total = items.length;
    const active = items.filter((x) => !!x.is_active).length;
    const hidden = items.filter((x) => !x.is_active).length;

    return { total, active, hidden };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;

    return items.filter((c) => {
      return (
        String(c.name ?? "").toLowerCase().includes(q) ||
        String(c.slug ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, search]);

  async function load() {
    setLoading(true);
    setScreenErr(null);

    try {
      // «*»: trae las columnas que existan, sin errores 400 si falta alguna (migración pendiente); con lo que trae la
      // primera fila se sabe qué se puede guardar (sin filas, se da por hecho que todo y al guardar se comprueba).
      const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [res, toquesRes] = await Promise.all([
        consultarCategorias("*"),
        supabase
          .from("analytics_events")
          .select("metadata")
          .eq("event_name", "categoria_inicio")
          .gte("created_at", desde)
          .limit(5000),
      ]);
      if (toquesRes.error) {
        setToquesInicio(null);
      } else {
        const cuenta: Record<string, { toques: number; conPortada: number }> = {};
        for (const f of (toquesRes.data ?? []) as { metadata: { categoria?: string; portada?: boolean } | null }[]) {
          const slugToque = f.metadata?.categoria;
          if (!slugToque) continue;
          const c = cuenta[slugToque] ?? { toques: 0, conPortada: 0 };
          cuenta[slugToque] = c;
          c.toques += 1;
          if (f.metadata?.portada) c.conPortada += 1;
        }
        setToquesInicio(cuenta);
      }
      if (res.error) throw res.error;
      const filas = res.data ?? [];
      const muestra = filas[0] as Record<string, unknown> | undefined;
      setSupportsImagenes(!muestra || "imagenes" in muestra);
      setSupportsImageUrl(!muestra || "image_url" in muestra);
      setSupportsOpacidad(!muestra || "portada_opacidad" in muestra);
      setSupportsEncuadre(!muestra || "portadas_inicio" in muestra);
      setSupportsPosicion(!muestra || "titulo_posicion" in muestra);
      setItems(conRecuadroServicios(filas));
    } catch (e: any) {
      console.error("Error cargando categorías:", e);
      setScreenErr("No se han podido cargar las categorías. Inténtalo de nuevo.");
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
    setName("");
    setSlug("");
    setSortOrder("0");
    setIsActive(true);
    setPortadas([]);
    setEncuadres([]);
    setOpacidad(OPACIDAD_PORTADA_DEFECTO);
    setPosicionNombre(null);
    setCopiarAbierto(false);
    setCopiarA([]);
    setAvisoCopiar(null);
    setAvisoPortadas(null);
    setModalErr(null);
  }

  function openCreate() {
    resetForm();
    setOpen(true);
  }

  function openEdit(c: CategoryRow) {
    setEditing(c);
    setName(c.name ?? "");
    setSlug(c.slug ?? "");
    setSortOrder(String(c.sort_order ?? 0));
    setIsActive(!!c.is_active);
    setPortadas(portadasDe(c));
    setEncuadres(encuadresDe(c));
    setOpacidad(opacidadDe(c));
    setPosicionNombre(posicionNombreDe(c));
    setCopiarAbierto(false);
    setCopiarA([]);
    setAvisoCopiar(null);
    setAvisoPortadas(null);
    setModalErr(null);
    setOpen(true);
  }

  // Sube una foto a product-media/categorias/ (nombre único: se puede guardar en caché un año sin ver una versión vieja).
  async function subirArchivo(archivo: File, prefijo = ""): Promise<string> {
    const ruta = `categorias/${prefijo}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionDe(archivo.type)}`;
    const { error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(ruta, archivo, { cacheControl: "31536000", upsert: false, contentType: archivo.type || undefined });
    if (error) throw error;
    const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(ruta);
    if (!data?.publicUrl) throw new Error("sin dirección");
    return data.publicUrl;
  }

  // Elige fotos de portada. Con el encuadre disponible, de una en una: primero se encuadra (ventana de recorte con la
  // forma del recuadro de Inicio) y al aceptar se suben la foto entera (para dentro de la categoría) y el encuadre.
  // Sin él (migración pendiente), se suben tal cual, varias a la vez, hasta el máximo.
  async function subirPortadas() {
    if (subiendo) return;
    const libres = maxPortadas - portadas.length;
    if (libres <= 0) return;
    setModalErr(null);
    setAvisoPortadas(null);

    let elegidas: Awaited<ReturnType<typeof pickMediaFilesWeb>>;
    try {
      elegidas = await pickMediaFilesWeb({ soloImagenes: true });
    } catch (e: any) {
      setModalErr(String(e?.message ?? "No se pudo abrir el selector de fotos."));
      return;
    }
    const imagenesElegidas = elegidas.items.filter((it) => it.kind === "image");
    const avisos: string[] = [];
    if (elegidas.skipped.length) avisos.push(`No se han podido usar: ${elegidas.skipped.map((s) => s.name).join(", ")}.`);

    if (supportsEncuadre) {
      const primera = imagenesElegidas[0];
      for (const it of elegidas.items) {
        if (it !== primera) {
          try {
            URL.revokeObjectURL(it.previewUrl);
          } catch {}
        }
      }
      if (imagenesElegidas.length > 1) avisos.push("Las portadas se encuadran de una en una: se ha cogido la primera.");
      if (avisos.length) setAvisoPortadas(avisos.join(" "));
      if (primera) setRecorte({ uri: primera.previewUrl, remota: false, indice: null, archivo: primera.file });
      return;
    }

    for (const it of elegidas.items) {
      try {
        URL.revokeObjectURL(it.previewUrl);
      } catch {}
    }
    const fotos = imagenesElegidas.slice(0, libres);
    if (elegidas.items.length > libres) avisos.push(`Caben ${maxPortadas} portadas: se han añadido las ${libres === 1 ? "primera" : `${libres} primeras`}.`);
    if (!fotos.length) {
      if (avisos.length) setAvisoPortadas(avisos.join(" "));
      return;
    }

    setSubiendo(true);
    const nuevas: string[] = [];
    try {
      for (const it of fotos) nuevas.push(await subirArchivo(await reducirImagenWeb(it.file)));
    } catch (e: any) {
      console.error("Error subiendo portada:", e);
      avisos.push("Alguna foto no se ha podido subir. Inténtalo de nuevo.");
    } finally {
      if (nuevas.length) {
        setPortadas((prev) => [...prev, ...nuevas].slice(0, maxPortadas));
        setEncuadres((prev) => [...prev, ...nuevas.map(() => "")].slice(0, maxPortadas));
      }
      if (avisos.length) setAvisoPortadas(avisos.join(" "));
      setSubiendo(false);
    }
  }

  // Encuadre aceptado: una foto nueva sube entera y con su encuadre; una portada ya subida solo cambia su encuadre.
  async function usarEncuadre(archivoEncuadre: File) {
    const r = recorte;
    if (!r) return;
    setRecorte(null);
    if (!r.remota) {
      try {
        URL.revokeObjectURL(r.uri);
      } catch {}
    }
    setSubiendo(true);
    try {
      const encuadre = await subirArchivo(archivoEncuadre, "inicio-");
      if (r.indice == null) {
        if (!r.archivo) throw new Error("sin foto");
        const entera = await subirArchivo(await reducirImagenWeb(r.archivo));
        setPortadas((prev) => [...prev, entera].slice(0, maxPortadas));
        setEncuadres((prev) => [...prev, encuadre].slice(0, maxPortadas));
      } else {
        const i = r.indice;
        setEncuadres((prev) => prev.map((e, k) => (k === i ? encuadre : e)));
      }
    } catch (e: any) {
      console.error("Error subiendo portada:", e);
      setAvisoPortadas("La foto no se ha podido subir. Inténtalo de nuevo.");
    } finally {
      setSubiendo(false);
    }
  }

  function cancelarEncuadre() {
    if (recorte && !recorte.remota) {
      try {
        URL.revokeObjectURL(recorte.uri);
      } catch {}
    }
    setRecorte(null);
  }

  function quitarPortada(i: number) {
    setPortadas((prev) => prev.filter((_, k) => k !== i));
    setEncuadres((prev) => prev.filter((_, k) => k !== i));
  }

  function adelantarPortada(i: number) {
    if (i <= 0) return;
    const cambiar = (prev: string[]) => {
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    };
    setPortadas(cambiar);
    setEncuadres(cambiar);
  }

  async function save() {
    if (saving) return;

    setSaving(true);
    setModalErr(null);

    const cleanName = name.trim();
    const cleanSlug = editandoServicios ? CATEGORIA_SERVICIOS.slug : slugify(slug || cleanName);
    const so = toIntSafe(sortOrder, 0);

    if (!cleanName) {
      setModalErr("Introduce un nombre de categoría.");
      setSaving(false);
      return;
    }

    if (cleanName.length < 2) {
      setModalErr("El nombre es demasiado corto.");
      setSaving(false);
      return;
    }

    if (!cleanSlug) {
      setModalErr("Slug inválido.");
      setSaving(false);
      return;
    }

    if (subiendo) {
      setModalErr("Espera a que terminen de subirse las portadas.");
      setSaving(false);
      return;
    }

    try {
      const payload: any = {
        name: cleanName,
        slug: cleanSlug,
        sort_order: so,
        // «Reparación / Limpieza» siempre activa: oculta, su recuadro de Inicio se quedaría sin la portada.
        is_active: editandoServicios ? true : isActive,
      };

      const fotos = portadas.slice(0, maxPortadas);
      if (supportsImagenes) payload.imagenes = fotos;
      if (supportsImageUrl) payload.image_url = fotos[0] ?? null;
      if (supportsOpacidad) payload.portada_opacidad = Math.min(100, Math.max(OPACIDAD_PORTADA_MIN, Math.round(opacidad)));
      // El encuadre para Inicio de cada portada, en el mismo orden ("" = sin encuadrar).
      if (supportsEncuadre) payload.portadas_inicio = fotos.map((_, i) => encuadres[i] ?? "");
      // Dónde va el nombre (null = en el centro).
      if (supportsPosicion) payload.titulo_posicion = posicionNombre;

      // Sin id (la de «Reparación / Limpieza» la primera vez), se crea.
      const escribir = (datos: any) =>
        editing?.id
          ? supabase.from("categories").update(datos).eq("id", editing.id)
          : supabase.from("categories").insert(datos);

      let { error } = await escribir(payload);
      // Si la columna de la posición del nombre aún no existe, se guarda el resto (en Inicio, en el centro).
      if (error && "titulo_posicion" in payload && /titulo_posicion/.test(String(error.message ?? ""))) {
        delete payload.titulo_posicion;
        setSupportsPosicion(false);
        ({ error } = await escribir(payload));
      }
      // Si la columna de los encuadres aún no existe, se guarda el resto (Inicio recorta las fotos por el centro).
      if (error && "portadas_inicio" in payload && /portadas_inicio/.test(String(error.message ?? ""))) {
        delete payload.portadas_inicio;
        setSupportsEncuadre(false);
        ({ error } = await escribir(payload));
      }
      // Si la columna de cuánto se ve la portada aún no existe, se guarda el resto (en Inicio, al 55 %).
      if (error && "portada_opacidad" in payload && /portada_opacidad/.test(String(error.message ?? ""))) {
        delete payload.portada_opacidad;
        setSupportsOpacidad(false);
        ({ error } = await escribir(payload));
      }
      // Si la columna de portadas aún no existe, se guarda el resto (y la primera portada en image_url).
      if (error && "imagenes" in payload && faltaColumnaPortadas(error)) {
        delete payload.imagenes;
        setSupportsImagenes(false);
        ({ error } = await escribir(payload));
      }
      if (error) throw error;

      olvidarPortadasCategorias();
      setOpen(false);
      resetForm();
      await load();
    } catch (e: any) {
      console.error("Error guardando categoría:", e);
      const msg = String(e?.message ?? "");

      if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
        setModalErr("Ya existe una categoría con ese nombre o slug.");
      } else {
        setModalErr("No se pudo guardar la categoría. Inténtalo de nuevo.");
      }
    } finally {
      setSaving(false);
    }
  }

  // «Aplicar a otras»: copia a las categorías elegidas la transparencia y la posición del nombre de esta, tal como se
  // ven ahora en la vista previa (aunque aún no se haya guardado). Las fotos y los encuadres no se copian.
  async function aplicarAOtras() {
    if (copiando || !copiarA.length) return;
    setCopiando(true);
    setAvisoCopiar(null);
    const datos: Record<string, unknown> = {};
    if (supportsOpacidad) datos.portada_opacidad = Math.min(100, Math.max(OPACIDAD_PORTADA_MIN, Math.round(opacidad)));
    if (supportsPosicion) datos.titulo_posicion = posicionNombre;
    if (!Object.keys(datos).length) {
      setAvisoCopiar("Aún no hay ajustes que se puedan copiar: falta activar su parte en la base de datos.");
      setCopiando(false);
      return;
    }
    const escribir = (d: Record<string, unknown>) => supabase.from("categories").update(d).in("id", copiarA);
    let { error } = await escribir(datos);
    // Sin la columna de la posición del nombre, se copia solo la transparencia.
    if (error && "titulo_posicion" in datos && /titulo_posicion/.test(String(error.message ?? ""))) {
      delete datos.titulo_posicion;
      setSupportsPosicion(false);
      ({ error } = Object.keys(datos).length ? await escribir(datos) : { error: null });
    }
    setCopiando(false);
    if (error) {
      setAvisoCopiar("No se han podido copiar los ajustes. Inténtalo de nuevo.");
      return;
    }
    const n = copiarA.length;
    const que = "titulo_posicion" in datos ? "la transparencia y la posición del nombre" : "la transparencia";
    setAvisoCopiar(`Copiado a ${n} ${n === 1 ? "categoría" : "categorías"}: ${que}.`);
    setItems((prev) => prev.map((x) => (copiarA.includes(x.id) ? ({ ...x, ...datos } as CategoryRow) : x)));
    setCopiarA([]);
    setCopiarAbierto(false);
    olvidarPortadasCategorias();
  }

  async function toggleActive(c: CategoryRow) {
    const prev = itemsRef.current;
    const next = prev.map((x) => (x.id === c.id ? { ...x, is_active: !x.is_active } : x));
    setItems(next);

    const { error } = await supabase
      .from("categories")
      .update({ is_active: !c.is_active })
      .eq("id", c.id);

    if (error) {
      setItems(prev);
      setScreenErr(error.message);
    }
  }

  function askRemove(c: CategoryRow) {
    setConfirmDelete(c);
  }

  async function removeCategoryConfirmed() {
    const c = confirmDelete;
    if (!c) return;

    setConfirmDelete(null);
    setScreenErr(null);

    try {
      const { error } = await supabase.from("categories").delete().eq("id", c.id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      console.error("Error borrando categoría:", e);
      setScreenErr("No se ha podido borrar la categoría. Inténtalo de nuevo.");
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      {/* Cabecera fija y compacta (volver al panel + título centrado), igual
          en todo el panel. Subtítulo, estadísticas, buscador y lista van en
          un solo scroll (antes eran fijos arriba y en el móvil dejaban la
          lista en una franja mínima). */}
      <AdminHeader title="Categorías" isMobile={isMobile} />

      {loading ? (
        <AdminLoading texto="Cargando categorías…" />
      ) : (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: pagePadding,
          // Sitio para el «+» flotante: no tapa la última fila de fichas.
          paddingBottom: 96 + insets.bottom,
          alignItems: "center",
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={CIERRE_TECLADO}
      >
        {/* Columna centrada con el mismo ancho máximo para todo */}
        <View style={{ width: "100%", maxWidth: 1040, gap: sectionGap }}>

          {/* El buscador arriba de los contadores (petición del dueño); «Nueva categoría» es el «+» flotante. */}
          <TextInput
            nativeID="categorias-buscar"
            value={search}
            onChangeText={(v) => setSearch(v)}
            placeholder="Buscar por nombre o slug"
            placeholderTextColor="rgba(11,33,56,0.40)"
            style={inputStyle}
          />

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <StatCard label="Total" value={String(stats.total)} icon="folder-outline" isMobile={isMobile} columns={3} />
            <StatCard label="Activas" value={String(stats.active)} icon="checkmark-circle-outline" isMobile={isMobile} columns={3} />
            <StatCard label="Ocultas" value={String(stats.hidden)} icon="eye-off-outline" isMobile={isMobile} columns={3} />
          </View>

          {!!screenErr && <AdminNotice tone="danger" text={screenErr} />}

          {!supportsImageUrl && (
            <AdminNotice
              tone="warning"
              text="La imagen por URL no está disponible todavía para las categorías. El resto del panel sigue funcionando con normalidad."
            />
          )}

          {filteredItems.length === 0 ? (
            <EmptyState
              icon="folder-open-outline"
              title="No hay categorías para este filtro."
              text="Crea tu primera categoría para empezar a organizar el catálogo."
            />
          ) : (
            // Fichas en rejilla, una al lado de otra (petición del dueño): 2 por fila en el móvil, 3 o 4 en pantallas
            // anchas. Arriba, el recuadro tal cual sale en Inicio (encuadre, nombre y transparencia).
            <View
              nativeID="categorias-rejilla"
              onLayout={(e) => {
                const w = Math.floor(e.nativeEvent.layout.width);
                if (w && Math.abs(w - anchoRejilla) > 1) setAnchoRejilla(w);
              }}
              style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP_REJILLA }}
            >
            {filteredItems.map((c) => {
              const servicios = esCategoriaServicios(c.slug);
              const fotos = portadasInicioDe(c);
              return (
              <View
                key={c.id || c.slug}
                nativeID={servicios ? "categoria-servicios" : `categoria-ficha-${c.slug}`}
                style={{
                  width: anchoFicha,
                  borderRadius: 18,
                  backgroundColor: COLORS.card,
                  padding: 8,
                  gap: 8,
                }}
              >
                {fotos.length ? (
                  <PortadaConNombre
                    imagenes={fotos}
                    opacidad={opacidadDe(c)}
                    titulo={c.name}
                    proporcion={PROPORCION_RECUADRO_INICIO}
                    posicion={posicionNombreDe(c)}
                    radio={14}
                  />
                ) : (
                  <View
                    style={{
                      width: "100%",
                      aspectRatio: PROPORCION_RECUADRO_INICIO,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      backgroundColor: "#F8FBFE",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                    }}
                  >
                    <Ionicons name="images-outline" size={24} color={COLORS.muted2} />
                    <Text style={{ color: COLORS.muted2, fontWeight: "700", fontSize: 12 }}>Sin portada</Text>
                  </View>
                )}

                <View style={{ gap: 3, paddingHorizontal: 2 }}>
                  <Text numberOfLines={2} style={{ color: COLORS.text, fontWeight: "900", fontSize: 15, lineHeight: 19 }}>
                    {c.name}
                  </Text>
                  <Text numberOfLines={2} style={{ color: COLORS.muted, fontWeight: "700", fontSize: 12, lineHeight: 16 }}>
                    {servicios ? "Recuadro de Inicio · lleva a Servicios" : `${c.is_active ? "Visible" : "Oculta"} · ${c.slug} · orden ${c.sort_order}`}
                  </Text>
                  {toquesInicio ? (
                    <Text
                      nativeID={`categoria-toques-${c.slug}`}
                      numberOfLines={2}
                      style={{ color: COLORS.text, fontWeight: "800", fontSize: 12, lineHeight: 16 }}
                    >
                      {(() => {
                        const t = toquesInicio[c.slug] ?? { toques: 0, conPortada: 0 };
                        const veces = `${t.toques} ${t.toques === 1 ? "toque" : "toques"}`;
                        return `Desde Inicio (30 días): ${veces}${t.toques ? ` · con portada: ${t.conPortada}` : ""}`;
                      })()}
                    </Text>
                  ) : null}
                  {c.id && c.updated_at ? (
                    <Text style={{ color: COLORS.muted2, fontSize: 11.5, lineHeight: 15 }}>
                      Actualizada: {new Date(c.updated_at).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                    </Text>
                  ) : null}
                </View>

                {/* Acciones con iconos: visible (no en «Reparación / Limpieza», que está siempre), editar y borrar. */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: "auto" }}>
                  {!servicios ? (
                    <Switch
                      value={c.is_active}
                      onValueChange={() => toggleActive(c)}
                      accessibilityLabel={c.is_active ? `Ocultar ${c.name}` : `Mostrar ${c.name}`}
                    />
                  ) : (
                    <View />
                  )}
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <IconButton icon="create-outline" label={`Editar ${c.name}`} variant="primary" onPress={() => openEdit(c)} />
                    {!servicios ? (
                      <IconButton icon="trash-outline" label={`Borrar ${c.name}`} variant="danger" onPress={() => askRemove(c)} />
                    ) : null}
                  </View>
                </View>
              </View>
              );
            })}
            </View>
          )}
        </View>
      </ScrollView>
      )}

      {/* «Nueva categoría»: el «+» flotante abajo a la derecha (al alcance del pulgar). */}
      {!loading ? <BotonFlotante nativeID="categoria-nueva" label="Nueva categoría" onPress={openCreate} /> : null}

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
                maxWidth: 640,
                alignSelf: "center",
                borderRadius: 20,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.bg,
                padding: isMobile ? 14 : 16,
                gap: 12,
              }}
            >
              <Text
                style={{
                  color: COLORS.text,
                  fontSize: isMobile ? 19 : 20,
                  fontWeight: "900",
                  textAlign: "center",
                }}
              >
                {modalTitle}
              </Text>

              <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
                {editandoServicios
                  ? `«${CATEGORIA_SERVICIOS.nombre}» es el recuadro de Inicio que lleva a Servicios: aquí eliges su portada y cuánto se ve.`
                  : "Define el nombre, el orden y la visibilidad de la categoría en la navegación pública."}
              </Text>

              {/* «Reparación / Limpieza»: el nombre y el enlace de su recuadro son fijos (sin nombre, slug ni orden). */}
              {!editandoServicios ? (
              <>
              <TextInput
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  if (!isEdit) setSlug(slugify(v));
                  setModalErr(null);
                }}
                placeholder="Nombre de la categoría"
                placeholderTextColor="rgba(11,33,56,0.40)"
                style={inputStyle}
              />

              <TextInput
                value={slug}
                onChangeText={(v) => {
                  setSlug(v);
                  setModalErr(null);
                }}
                placeholder="Identificador para la URL"
                placeholderTextColor="rgba(11,33,56,0.40)"
                autoCapitalize="none"
                style={inputStyle}
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
                style={inputStyle}
              />
              </>
              ) : null}

              {maxPortadas > 0 ? (
                <View nativeID="categoria-portadas" style={{ gap: 10, alignItems: "center", paddingTop: 2 }}>
                  <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>
                    Portadas ({portadas.length}/{maxPortadas})
                  </Text>
                  <Text style={{ color: COLORS.muted, lineHeight: 18, fontSize: 13, textAlign: "center" }}>
                    {maxPortadas <= 1
                      ? "De momento cabe una portada (falta activar las 3 en la base de datos)."
                      : supportsEncuadre
                        ? "Al subir una foto la encuadras con la forma del recuadro de Inicio («Encuadrar» la cambia). Se pasan solas; la primera es la principal."
                        : "Se pasan solas en la tienda; la primera es la principal. Mejor fotos horizontales."}
                  </Text>

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
                    {portadas.map((url, i) => (
                      <View
                        key={url}
                        style={{
                          width: isMobile ? 132 : 150,
                          // Con la forma del recuadro de Inicio: la miniatura enseña su encuadre.
                          aspectRatio: PROPORCION_RECUADRO_INICIO,
                          borderRadius: 14,
                          overflow: "hidden",
                          borderWidth: 1,
                          borderColor: i === 0 ? COLORS.accent : COLORS.border,
                          backgroundColor: "#F8FBFE",
                        }}
                      >
                        <SmartImage
                          uri={encuadres[i] || url}
                          contentFit="cover"
                          ancho={150}
                          alt={`Portada ${i + 1}${encuadres[i] ? " (encuadrada para Inicio)" : ""}`}
                          style={{ width: "100%", height: "100%" }}
                        />
                        {supportsEncuadre ? (
                          <Pressable
                            onPress={() => setRecorte({ uri: url, remota: true, indice: i })}
                            disabled={subiendo}
                            accessibilityRole="button"
                            accessibilityLabel={`Encuadrar la portada ${i + 1} para Inicio`}
                            style={({ pressed }) => ({
                              position: "absolute",
                              right: 4,
                              bottom: 4,
                              height: 32,
                              paddingHorizontal: 9,
                              borderRadius: 16,
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 4,
                              backgroundColor: "rgba(11,33,56,0.72)",
                              opacity: pressed ? 0.8 : 1,
                            })}
                          >
                            <Ionicons name="crop" size={15} color="#FFFFFF" />
                            <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 11.5 }}>Encuadrar</Text>
                          </Pressable>
                        ) : null}
                        {i === 0 && (
                          <Text
                            style={{
                              position: "absolute",
                              left: 6,
                              bottom: 6,
                              paddingHorizontal: 7,
                              paddingVertical: 2,
                              borderRadius: 8,
                              overflow: "hidden",
                              backgroundColor: "rgba(11,33,56,0.72)",
                              color: "#FFFFFF",
                              fontSize: 11,
                              fontWeight: "800",
                            }}
                          >
                            Principal
                          </Text>
                        )}
                        {i > 0 && (
                          <Pressable
                            onPress={() => adelantarPortada(i)}
                            accessibilityRole="button"
                            accessibilityLabel={`Pasar la portada ${i + 1} delante`}
                            style={({ pressed }) => ({
                              position: "absolute",
                              left: 4,
                              top: 4,
                              width: 32,
                              height: 32,
                              borderRadius: 16,
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: "rgba(11,33,56,0.72)",
                              opacity: pressed ? 0.8 : 1,
                            })}
                          >
                            <Ionicons name="arrow-back" size={17} color="#FFFFFF" />
                          </Pressable>
                        )}
                        <Pressable
                          onPress={() => quitarPortada(i)}
                          accessibilityRole="button"
                          accessibilityLabel={`Quitar la portada ${i + 1}`}
                          style={({ pressed }) => ({
                            position: "absolute",
                            right: 4,
                            top: 4,
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: "rgba(11,33,56,0.72)",
                            opacity: pressed ? 0.8 : 1,
                          })}
                        >
                          <Ionicons name="close" size={18} color="#FFFFFF" />
                        </Pressable>
                      </View>
                    ))}

                    {portadas.length < maxPortadas && (
                      <Pressable
                        nativeID="categoria-subir-portada"
                        onPress={subirPortadas}
                        disabled={subiendo}
                        accessibilityRole="button"
                        accessibilityLabel="Subir fotos de portada"
                        style={({ pressed }) => ({
                          width: isMobile ? 132 : 150,
                          aspectRatio: PROPORCION_RECUADRO_INICIO,
                          borderRadius: 14,
                          borderWidth: 1.5,
                          borderStyle: "dashed",
                          borderColor: COLORS.accentBorder,
                          backgroundColor: COLORS.accent2,
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 4,
                          opacity: pressed ? 0.85 : 1,
                        })}
                      >
                        {subiendo ? (
                          <>
                            <ActivityIndicator color={COLORS.accent} />
                            <Text style={{ color: COLORS.accent, fontWeight: "800", fontSize: 12 }}>Subiendo…</Text>
                          </>
                        ) : (
                          <>
                            <Ionicons name="cloud-upload-outline" size={24} color={COLORS.accent} />
                            <Text style={{ color: COLORS.accent, fontWeight: "800", fontSize: 12.5 }}>
                              {portadas.length ? "Añadir foto" : "Subir fotos"}
                            </Text>
                          </>
                        )}
                      </Pressable>
                    )}
                  </View>

                  {!!avisoPortadas && <AdminNotice tone="warning" text={avisoPortadas} />}
                  {!supportsEncuadre && maxPortadas > 0 ? (
                    <AdminNotice
                      tone="warning"
                      text="El encuadre para Inicio se podrá usar en cuanto se active su parte en la base de datos; mientras, Inicio recorta las fotos por el centro."
                    />
                  ) : null}

                  {/* Cómo se ve en Inicio: el encuadre llena el recuadro (con su forma en el móvil) y el nombre va encima.
                      La barra decide cuánto se ve la foto (menos: más suave y el nombre se lee mejor; más: más fuerte). */}
                  {portadas.length > 0 ? (
                    <View nativeID="categoria-opacidad" style={{ width: "100%", gap: 10, alignItems: "center", paddingTop: 6 }}>
                      <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>Cómo se ve en Inicio</Text>
                      {/* El nombre se mueve manteniéndolo pulsado y arrastrándolo (como en el móvil: un dedo). */}
                      <View style={{ width: "100%", maxWidth: 230, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden" }}>
                        <PortadaNombreMovible
                          imagenes={portadas.map((u, i) => encuadres[i] || u)}
                          opacidad={opacidad}
                          titulo={name.trim() || "Nombre de la categoría"}
                          proporcion={PROPORCION_RECUADRO_INICIO}
                          posicion={posicionNombre}
                          onMover={setPosicionNombre}
                        />
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
                        <Text nativeID="categoria-nombre-posicion" style={{ color: COLORS.muted, lineHeight: 18, fontSize: 13, textAlign: "center", flexShrink: 1 }}>
                          {posicionNombre
                            ? "Mantén pulsado el nombre y arrástralo para moverlo."
                            : "Mantén pulsado el nombre y arrástralo para moverlo (ahora, en el centro)."}
                        </Text>
                        {posicionNombre ? (
                          <IconButton icon="locate-outline" label="Centrar el nombre" onPress={() => setPosicionNombre(null)} />
                        ) : null}
                      </View>
                      {!supportsPosicion ? (
                        <AdminNotice
                          tone="warning"
                          text="Dónde va el nombre se podrá guardar en cuanto se active su parte en la base de datos; mientras, en Inicio sale en el centro."
                        />
                      ) : null}
                      <Text style={{ color: COLORS.text, fontWeight: "800", textAlign: "center" }}>
                        Foto: <Text nativeID="categoria-opacidad-valor">{opacidad}</Text> %
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, width: "100%", maxWidth: 360 }}>
                        <Pressable
                          onPress={() => setOpacidad((o) => Math.max(OPACIDAD_PORTADA_MIN, o - PASO_BOTON_OPACIDAD))}
                          disabled={opacidad <= OPACIDAD_PORTADA_MIN}
                          accessibilityRole="button"
                          accessibilityLabel="Foto más suave"
                          style={({ pressed }) => ({
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: COLORS.accent2,
                            opacity: opacidad <= OPACIDAD_PORTADA_MIN ? 0.4 : pressed ? 0.75 : 1,
                          })}
                        >
                          <Ionicons name="remove" size={22} color={COLORS.accent} />
                        </Pressable>
                        {Platform.OS === "web" ? (
                          <input
                            type="range"
                            min={OPACIDAD_PORTADA_MIN}
                            max={100}
                            step={5}
                            value={opacidad}
                            aria-label="Cuánto se ve la foto"
                            onChange={(e) => setOpacidad(Number(e.target.value))}
                            style={{ flex: 1, minWidth: 0, height: 44, accentColor: COLORS.accent, cursor: "pointer" }}
                          />
                        ) : (
                          <View style={{ flex: 1 }} />
                        )}
                        <Pressable
                          onPress={() => setOpacidad((o) => Math.min(100, o + PASO_BOTON_OPACIDAD))}
                          disabled={opacidad >= 100}
                          accessibilityRole="button"
                          accessibilityLabel="Foto más fuerte"
                          style={({ pressed }) => ({
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: COLORS.accent2,
                            opacity: opacidad >= 100 ? 0.4 : pressed ? 0.75 : 1,
                          })}
                        >
                          <Ionicons name="add" size={22} color={COLORS.accent} />
                        </Pressable>
                      </View>
                      <Text style={{ color: COLORS.muted, lineHeight: 18, fontSize: 13, textAlign: "center" }}>
                        Menos: la foto se ve más suave y el nombre se lee mejor. Más: la foto se ve más fuerte.
                      </Text>
                      {!supportsOpacidad ? (
                        <AdminNotice
                          tone="warning"
                          text={`Se podrá guardar en cuanto se active su parte en la base de datos; mientras, en Inicio sale al ${OPACIDAD_PORTADA_DEFECTO} %.`}
                        />
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* «Categoría activa» y, a su lado, «Aplicar a otras»: un desplegable para elegir a qué categorías se
                  copian la transparencia y la posición del nombre de esta (las fotos no). */}
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
                {/* En una fila: «Categoría activa», su interruptor y, al lado, «A otras» (con su desplegable). */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ flex: 1, minWidth: 0, color: COLORS.text, fontWeight: "900" }}>
                    {editandoServicios ? "Ajustes de la portada" : "Categoría activa"}
                  </Text>
                  {!editandoServicios ? (
                    <Switch value={isActive} onValueChange={setIsActive} accessibilityLabel="Categoría activa" />
                  ) : null}
                  <Pressable
                    nativeID="categoria-aplicar-otras"
                    onPress={() => {
                      setAvisoCopiar(null);
                      setCopiarAbierto((v) => !v);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Aplicar estos ajustes a otras categorías"
                    {...({ "aria-expanded": copiarAbierto } as object)}
                    style={({ pressed }) => ({
                      minHeight: 44,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: COLORS.accentBorder,
                      backgroundColor: copiarAbierto ? COLORS.accent2 : "#FFFFFF",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Ionicons name="copy-outline" size={17} color={COLORS.accent} />
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13.5 }}>A otras</Text>
                    <Ionicons name={copiarAbierto ? "chevron-up" : "chevron-down"} size={16} color={COLORS.muted} />
                  </Pressable>
                </View>
                <Text style={{ color: COLORS.muted, lineHeight: 18, fontSize: 13 }}>
                  {editandoServicios
                    ? "«A otras» copia la transparencia y la posición del nombre a las categorías que elijas."
                    : "Si está activa, puede mostrarse en la tienda. «A otras» copia la transparencia y la posición del nombre a las categorías que elijas."}
                </Text>

                {copiarAbierto ? (
                  <View nativeID="categoria-aplicar-lista" style={{ gap: 6 }}>
                    <Text style={{ color: COLORS.muted, fontSize: 13, lineHeight: 18 }}>
                      Copia la transparencia ({opacidad} %) y {posicionNombre ? "la posición del nombre" : "el nombre en el centro"} a:
                    </Text>
                    {(() => {
                      const otras = items.filter((x) => !!x.id && x.id !== editing?.id);
                      if (!otras.length) {
                        return <Text style={{ color: COLORS.muted, fontSize: 13 }}>No hay otras categorías guardadas.</Text>;
                      }
                      const todas = otras.every((x) => copiarA.includes(x.id));
                      return (
                        <>
                          <Pressable
                            onPress={() => setCopiarA(todas ? [] : otras.map((x) => x.id))}
                            accessibilityRole="checkbox"
                            accessibilityLabel="Todas las categorías"
                            {...({ "aria-checked": todas } as object)}
                            style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 }}
                          >
                            <Ionicons name={todas ? "checkbox" : "square-outline"} size={22} color={COLORS.accent} />
                            <Text style={{ color: COLORS.text, fontWeight: "900" }}>Todas</Text>
                          </Pressable>
                          {otras.map((x) => {
                            const marcada = copiarA.includes(x.id);
                            return (
                              <Pressable
                                key={x.id}
                                onPress={() => setCopiarA((l) => (marcada ? l.filter((i) => i !== x.id) : [...l, x.id]))}
                                accessibilityRole="checkbox"
                                accessibilityLabel={x.name}
                                {...({ "aria-checked": marcada } as object)}
                                style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 4 }}
                              >
                                <Ionicons name={marcada ? "checkbox" : "square-outline"} size={22} color={COLORS.accent} />
                                <Text style={{ color: COLORS.text, fontWeight: "700" }}>{x.name}</Text>
                              </Pressable>
                            );
                          })}
                          <PrimaryButton
                            label={copiando ? "Copiando…" : copiarA.length ? `Aplicar a ${copiarA.length} ${copiarA.length === 1 ? "categoría" : "categorías"}` : "Elige a cuáles"}
                            onPress={aplicarAOtras}
                            disabled={copiando || !copiarA.length}
                          />
                        </>
                      );
                    })()}
                  </View>
                ) : null}
                {avisoCopiar ? (
                  <AdminNotice tone={/^Copiado/.test(avisoCopiar) ? "success" : "warning"} text={avisoCopiar} />
                ) : null}
              </View>

              {!!modalErr && <AdminNotice tone="danger" text={modalErr} />}

              {/* Botones centrados: primero la acción principal, debajo "Cancelar". */}
              <View style={{ gap: 10, marginTop: 4, alignItems: "center" }}>
                <PrimaryButton
                  label={saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear categoría"}
                  onPress={save}
                  disabled={saving}
                />

                <Pressable
                  onPress={() => {
                    setOpen(false);
                    resetForm();
                  }}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.88 : 1,
                    borderRadius: 999,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: "#F6FAFD",
                    width: "100%",
                    maxWidth: 420,
                  })}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900", textAlign: "center" }}>
                    Cancelar
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

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
              Borrar categoría
            </Text>

            <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
              Vas a borrar{" "}
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                {confirmDelete?.name ?? ""}
              </Text>
              .{"\n\n"}
              Si hay productos vinculados a esta categoría, se quedarán sin categoría asignada.
            </Text>

            <View
              style={{
                flexDirection: isMobile ? "column" : "row",
                gap: 10,
                justifyContent: "center",
                marginTop: 6,
              }}
            >
              <ChipButton
                label="Cancelar"
                variant="ghost"
                onPress={() => setConfirmDelete(null)}
                isMobile={isMobile}
                fullWidth={isMobile}
              />
              <ChipButton
                label="Sí, borrar"
                variant="danger"
                onPress={removeCategoryConfirmed}
                isMobile={isMobile}
                fullWidth={isMobile}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Encuadre de una portada con la forma del recuadro de Inicio en el móvil, con el nombre encima y la foto al %
          elegido: se ve tal cual quedará antes de subirla. */}
      {recorte ? (
        <RecortarFoto
          uri={recorte.uri}
          remota={recorte.remota}
          proporcion={PROPORCION_RECUADRO_INICIO}
          salida={SALIDA_ENCUADRE}
          redondo={false}
          titulo="Encuadra la portada"
          texto="Así se verá en el recuadro de Inicio. Arrástrala para moverla y acércala o aléjala."
          textoUsar="Usar este encuadre"
          encima={<NombreSobrePortada titulo={name.trim() || "Nombre de la categoría"} />}
          opacidadFoto={opacidad / 100}
          nativeID="categoria-recorte"
          nombreArchivo="portada.jpg"
          onCancelar={cancelarEncuadre}
          onListo={(archivo) => void usarEncuadre(archivo)}
        />
      ) : null}
    </View>
  );
}