/**
 * Qué hace: pantalla de administración de productos. Lista, filtra
 * (por estado y visibilidad), busca, crea, edita, publica/oculta, destaca
 * en la home y borra los productos del catálogo, incluyendo la gestión de
 * sus fotos y vídeo.
 *
 * Cómo funciona:
 * - Lee/escribe en las tablas "products" y "product_media" de Supabase
 *   (con detección automática de si "product_media" existe todavía).
 * - El modal de alta/edición sube los archivos seleccionados a Supabase
 *   Storage (bucket MEDIA_BUCKET) usando pickMediaFilesWeb() y
 *   buildMediaPath() de products.utils.ts, validando tamaño, tipo y
 *   duración de vídeo con los límites de products.constants.ts.
 * - toggleActive()/toggleFeaturedHome() aplican cambios optimistas en la
 *   lista y los revierten si Supabase devuelve error.
 * - "Marcar vendido" (MarkSoldModal, al final del archivo): busca un
 *   usuario registrado por nombre/usuario/email (función admin_search_users
 *   de sql/product_sales.sql, la única forma segura de leer auth.users
 *   desde el cliente) y, al elegirlo, inserta en product_sales. Es la vía
 *   directa, sin depender de que haya escrito por el chat del producto (esa
 *   otra vía vive en app/admin/chats.tsx) — ambas escriben en la misma
 *   tabla, así que la miniatura en components/Resenas.tsx aparece igual
 *   venga de una vía o de la otra.
 * - Sigue el tema claro global: fondo blanco, azul claro de acento y
 *   textos en azul marino oscuro (COLORS de products.constants.ts).
 *
 * Conectado con:
 * - sql/product_sales.sql → tabla e insert de "Marcar vendido".
 * - lib/supabase.ts → cliente de Supabase para todas las operaciones CRUD.
 * - app/admin/products/products.constants.ts → COLORS y límites de subida.
 * - app/admin/products/products.types.ts → tipos de producto y media.
 * - app/admin/products/products.utils.ts → formateo, validación y subida
 *   de archivos.
 * - app/admin/products/products.components.tsx → StatCard, ChipButton,
 *   FilterPill, SectionTitle, MediaThumb usados en esta pantalla.
 * - app/admin/index.tsx → pantalla desde la que se entra aquí y a la que
 *   se vuelve con smartBackAdminHome().
 * - app/admin/categories.tsx → los productos se clasifican con las
 *   categorías creadas allí (category_id).
 * - app/catalogo.tsx y app/producto/[id].tsx → lo que se publica aquí es
 *   lo que se ve en la tienda pública.
 *
 * Rendimiento: load() limita la consulta de "products" a 300 filas y pide
 * la multimedia solo de esos productos (.in("product_id", ids)) en vez de
 * toda la tabla. normalizeMediaForProduct() reordena la multimedia con un
 * único .upsert() por id en lugar de un .update() por archivo.
 *
 * Móvil: las 4 tarjetas de estadísticas (Total/Publicados/Visibles/
 * Destacados portada) van en rejilla de 2 columnas también en pantallas
 * pequeñas (antes ocupaban el 100% del ancho cada una, es decir 4 filas
 * completas solo de estadísticas antes de llegar al buscador y a "+ Nuevo
 * producto"). Ver StatCard en products.components.tsx.
 */
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { supabase } from "../../lib/supabase";
import {
  ChipButton,
  FilterPill,
  MediaThumb,
  StatCard,
} from "./products/products.components";
import {
  COLORS,
  MAX_FILE_SIZE_MB,
  MAX_IMAGES,
  MAX_VIDEO_SECONDS,
  MEDIA_BUCKET,
} from "./products/products.constants";
import type {
  CategoryRow,
  LocalPickedMedia,
  ProductCondition,
  ProductMediaRow,
  ProductRow,
  ProductStatus,
  StatusFilter,
  VisibilityFilter,
} from "./products/products.types";
import {
  buildMediaPath,
  clampText,
  fmtEUR,
  getPrimaryMedia,
  labelCond,
  labelStatus,
  pickMediaFilesWeb,
  smartBackAdminHome,
  softShadow,
  statusVisual,
  toPriceSafe,
} from "./products/products.utils";

// Texto de partida del campo "Descripción" al crear un producto nuevo — la
// mayoría de artículos llevan siempre este mismo bloque, así que en vez de
// escribirlo a mano cada vez, aparece ya puesto y Daniel solo lo ajusta si
// hace falta. Al editar un producto ya existente esto NO se usa: se carga
// la descripción real guardada, aunque esté vacía.
const DEFAULT_DESCRIPTION =
  "Estado Funcional : 10 / 10\n\n" +
  "1 Año de GARANTÍA.\n\n" +
  "¡Probado y testeado antes de entregarlo o enviarlo!\n\n" +
  "Limpieza realizada para un estado impecable.\n\n" +
  "Envíos y Entregas Rápidas.";

function revokeLocalMedia(items: LocalPickedMedia[]) {
  items.forEach((m) => {
    try {
      URL.revokeObjectURL(m.previewUrl);
    } catch {
      // ignore
    }
  });
}

// Reintenta una operación de red un par de veces con una pequeña espera
// entre intentos. Al subir muchos archivos de golpe (por ejemplo 15 fotos),
// un fallo puntual de conexión en UNA de ellas ya no aborta directamente:
// se reintenta sola un par de veces antes de darse por vencida.
async function withRetries<T>(fn: () => PromiseLike<T>, attempts = 3, delayMs = 600): Promise<T> {
  let lastErr: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
      }
    }
  }

  throw lastErr;
}

function normalizeMediaKind(value: unknown): "image" | "video" | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "image") return "image";
  if (v === "video") return "video";
  return null;
}

function getRowKind(row: Partial<ProductMediaRow>) {
  return normalizeMediaKind(row.kind);
}

function getRowDuration(row: Partial<ProductMediaRow>) {
  const n = Number(row.duration_seconds ?? null);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getRowSortOrder(row: Partial<ProductMediaRow>) {
  const n = Number(row.sort_order);
  return Number.isFinite(n) ? n : 0;
}

function getRowPublicUrl(row: Partial<ProductMediaRow>) {
  const url = String(row.public_url ?? "").trim();
  return url || null;
}

function isMissingColumnError(error: unknown, columnName: string) {
  const msg = String((error as any)?.message ?? "").toLowerCase();
  const col = columnName.toLowerCase();
  return (
    msg.includes(col) &&
    (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("column"))
  );
}

function isMissingRelationError(error: unknown, relationName: string) {
  const msg = String((error as any)?.message ?? "").toLowerCase();
  const rel = relationName.toLowerCase();
  return (
    msg.includes(rel) &&
    (msg.includes("does not exist") ||
      msg.includes("relation") ||
      msg.includes("could not find the table"))
  );
}

function sortMediaRows(a: ProductMediaRow, b: ProductMediaRow) {
  const aCover = Boolean(a.is_cover);
  const bCover = Boolean(b.is_cover);

  if (aCover && !bCover) return -1;
  if (!aCover && bCover) return 1;

  return getRowSortOrder(a) - getRowSortOrder(b);
}

function sanitizeMediaRow(row: any): ProductMediaRow {
  return {
    id: String(row.id),
    product_id: String(row.product_id),
    kind: normalizeMediaKind(row.kind) ?? "image",
    storage_path: String(row.storage_path ?? ""),
    public_url: String(row.public_url ?? ""),
    file_name: row.file_name ? String(row.file_name) : null,
    mime_type: row.mime_type ? String(row.mime_type) : null,
    sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
    is_cover: Boolean(row.is_cover),
    duration_seconds: getRowDuration(row),
    created_at: typeof row.created_at === "string" ? row.created_at : undefined,
  };
}

async function fetchProductMediaRowsSafe(
  productId?: string | string[]
): Promise<ProductMediaRow[]> {
  const selects = [
    "id,product_id,kind,storage_path,public_url,file_name,mime_type,sort_order,is_cover,duration_seconds,created_at",
    "id,product_id,kind,storage_path,public_url,file_name,mime_type,sort_order,is_cover,created_at",
    "id,product_id,storage_path,public_url,file_name,mime_type,sort_order,is_cover,created_at",
  ];

  // Si nos piden varios productos a la vez (carga del listado), acotamos con
  // .in() a esos ids en vez de traer toda la tabla; el .limit() se deja como
  // red de seguridad por si un producto tuviera muchísima multimedia.
  if (Array.isArray(productId) && productId.length === 0) return [];

  let lastError: unknown = null;

  for (const selectStr of selects) {
    let query = supabase.from("product_media").select(selectStr);

    if (Array.isArray(productId)) {
      query = query
        .in("product_id", productId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(3000);
    } else if (productId) {
      query = query
        .eq("product_id", productId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(200);
    } else {
      query = query.limit(3000);
    }

    const res = await query;

    if (res.error) {
      const missingTable = isMissingRelationError(res.error, "product_media");
      const missingColumn =
        String(res.error.message ?? "").toLowerCase().includes("column") ||
        String(res.error.message ?? "").toLowerCase().includes("schema cache");

      if (missingTable) return [];
      if (missingColumn) {
        lastError = res.error;
        continue;
      }

      throw res.error;
    }

    return (Array.isArray(res.data) ? res.data : []).map(sanitizeMediaRow).sort(sortMediaRows);
  }

  if (lastError) throw lastError;
  return [];
}

function sanitizeProductRow(row: any): ProductRow {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    description: typeof row.description === "string" ? row.description : null,
    price_eur: Number.isFinite(Number(row.price_eur)) ? Number(row.price_eur) : null,
    status: (row.status ?? "DRAFT") as ProductStatus,
    condition: (row.condition ?? "GOOD") as ProductCondition,
    category_id: row.category_id ? String(row.category_id) : null,
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    is_featured_home: Boolean(row.is_featured_home),
    reference: typeof row.reference === "string" ? row.reference : null,
    media: [],
  };
}

function buildAdminProductsSelect(includeFeatured: boolean, includeReference: boolean) {
  const base =
    "id,title,description,price_eur,status,condition,category_id,is_active,created_at,updated_at";

  return (
    base +
    (includeFeatured ? ",is_featured_home" : "") +
    (includeReference ? ",reference" : "")
  );
}

// Trae la lista de productos probando primero con todas las columnas
// "nuevas" (is_featured_home, reference); si alguna todavía no existe en la
// base de datos (falta ejecutar su migración en Supabase), reintenta sin
// esa columna en vez de romper el panel entero. Sigue el mismo patrón que
// ya usaba is_featured_home, solo que ahora cubre dos columnas opcionales
// en vez de una.
async function fetchAdminProductsSafe(): Promise<{
  rows: any[];
  supportsFeatured: boolean;
  supportsReference: boolean;
}> {
  let includeFeatured = true;
  let includeReference = true;

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await supabase
      .from("products")
      .select(buildAdminProductsSelect(includeFeatured, includeReference))
      .order("updated_at", { ascending: false })
      .limit(300);

    if (!res.error) {
      return {
        rows: Array.isArray(res.data) ? res.data : [],
        supportsFeatured: includeFeatured,
        supportsReference: includeReference,
      };
    }

    const msg = String(res.error.message ?? "").toLowerCase();
    const featuredMissing =
      includeFeatured &&
      msg.includes("is_featured_home") &&
      (msg.includes("column") || msg.includes("does not exist"));
    const referenceMissing =
      includeReference &&
      msg.includes("reference") &&
      (msg.includes("column") || msg.includes("does not exist"));

    if (featuredMissing) {
      includeFeatured = false;
      continue;
    }
    if (referenceMissing) {
      includeReference = false;
      continue;
    }

    throw res.error;
  }

  throw new Error("No se pudo cargar la lista de productos.");
}

// Selector "desplegable": una caja con el valor actual que, al tocarla,
// abre un panel centrado en pantalla con las opciones disponibles (igual
// que cualquier selector nativo). Se usa para Estado, Condición y
// Categoría en el formulario de producto, en vez de tener siempre todas
// las opciones visibles como chips — así el formulario ocupa mucho menos
// alto y es más rápido de escanear.
function DropdownField({
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: 13 }}>{label}</Text>

      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          opacity: pressed ? 0.9 : 1,
          borderWidth: 1,
          borderColor: COLORS.border,
          borderRadius: 14,
          paddingHorizontal: 12,
          paddingVertical: 12,
          backgroundColor: "#F8FBFE",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        })}
      >
        <Text
          style={{ color: COLORS.text, fontWeight: "800", fontSize: 14, flexShrink: 1 }}
          numberOfLines={1}
        >
          {current?.label ?? placeholder ?? "Seleccionar"}
        </Text>
        <Ionicons name="chevron-down" size={16} color={COLORS.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: "100%",
              maxWidth: 380,
              maxHeight: "80%",
              borderRadius: 18,
              backgroundColor: "#FFFFFF",
              borderWidth: 1,
              borderColor: COLORS.border,
              padding: 14,
              gap: 10,
            }}
          >
            <Text
              style={{
                color: COLORS.text,
                fontWeight: "900",
                fontSize: 16,
                textAlign: "center",
              }}
            >
              {label}
            </Text>

            <ScrollView style={{ maxHeight: 360 }}>
              <View style={{ gap: 8 }}>
                {options.map((o) => {
                  const selected = o.value === value;
                  return (
                    <Pressable
                      key={o.value}
                      onPress={() => {
                        onChange(o.value);
                        setOpen(false);
                      }}
                      style={({ pressed }) => ({
                        opacity: pressed ? 0.88 : 1,
                        borderRadius: 12,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        backgroundColor: selected ? COLORS.accent2 : "#F6FAFD",
                        borderWidth: 1,
                        borderColor: selected ? COLORS.accentBorder : "#E3EAF2",
                        alignItems: "center",
                      })}
                    >
                      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 14 }}>
                        {o.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            <Pressable
              onPress={() => setOpen(false)}
              style={({ pressed }) => ({
                opacity: pressed ? 0.88 : 1,
                borderRadius: 12,
                paddingVertical: 10,
                alignItems: "center",
              })}
            >
              <Text style={{ color: COLORS.muted, fontWeight: "800" }}>Cancelar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

type ProductListItemData = ProductRow & { catName: string };

// Una fila de la lista de productos, memoizada. Antes esta fila se
// construía inline dentro del .map() del componente principal: cualquier
// cambio de estado en TODO el panel (por ejemplo escribir en el formulario
// de edición, o simplemente abrirlo) obligaba a React a volver a construir
// y comparar la lista ENTERA (hasta 300 productos con su imagen, chips y
// botones) antes de poder pintar nada más — eso es lo que hacía que el
// "pop" de editar tardase tanto en abrirse en el móvil. Al extraer la fila
// a su propio componente con React.memo(), React se salta por completo
// esas ~300 filas cuando lo que cambia es el formulario, no la lista.
const ProductListItem = React.memo(function ProductListItem({
  item: p,
  isMobile,
  isDesktopish,
  supportsFeaturedHome,
  onEdit,
  onPublish,
  onToggleFeatured,
  onMarkSold,
  onDelete,
  onToggleActive,
}: {
  item: ProductListItemData;
  isMobile: boolean;
  isDesktopish: boolean;
  supportsFeaturedHome: boolean;
  onEdit: (p: ProductRow) => void;
  onPublish: (p: ProductRow) => void;
  onToggleFeatured: (p: ProductRow) => void;
  onMarkSold: (p: ProductRow) => void;
  onDelete: (p: ProductRow) => void;
  onToggleActive: (p: ProductRow) => void;
}) {
  const statusUi = statusVisual(p.status, COLORS);
  const primaryMedia = getPrimaryMedia(p.media);
  const primaryKind = primaryMedia ? getRowKind(primaryMedia) : null;
  const primaryUrl = primaryMedia ? getRowPublicUrl(primaryMedia) : null;
  const imageCount = p.media.filter((m) => getRowKind(m) === "image").length;
  const hasVideo = p.media.some((m) => getRowKind(m) === "video");

  return (
    <View
      style={{
        borderRadius: 20,
        backgroundColor: COLORS.card,
        padding: isMobile ? 12 : 14,
        gap: 12,
      }}
    >
      <View
        style={{
          flexDirection: isDesktopish ? "row" : "column",
          gap: 14,
          alignItems: isDesktopish ? "flex-start" : "stretch",
        }}
      >
        <View
          style={{
            width: isDesktopish ? 110 : "100%",
            height: isDesktopish ? 110 : isMobile ? 190 : 220,
            borderRadius: 16,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: "#F8FBFE",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {primaryKind === "image" && primaryUrl ? (
            <Image
              source={{ uri: primaryUrl }}
              resizeMode="cover"
              style={{ width: "100%", height: "100%" }}
            />
          ) : primaryKind === "video" ? (
            <View style={{ alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Ionicons name="videocam-outline" size={30} color={COLORS.text} />
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>Vídeo</Text>
            </View>
          ) : (
            <Ionicons name="game-controller-outline" size={28} color={COLORS.muted2} />
          )}
        </View>

        <View style={{ flex: 1, gap: 10 }}>
          <View
            style={{
              flexDirection: isMobile ? "column" : "row",
              justifyContent: "space-between",
              alignItems: isMobile ? "stretch" : "flex-start",
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: COLORS.text,
                  fontWeight: "900",
                  fontSize: isMobile ? 16 : 17,
                  lineHeight: isMobile ? 22 : 22,
                }}
              >
                {p.title}
              </Text>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                <View
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: statusUi.borderColor,
                    backgroundColor: statusUi.backgroundColor,
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                    {statusUi.text}
                  </Text>
                </View>

                <View
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: "#F6FAFD",
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                    {labelCond(p.condition)}
                  </Text>
                </View>

                <View
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: "#F6FAFD",
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                    {p.catName}
                  </Text>
                </View>

                <View
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: "#F6FAFD",
                  }}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                    {imageCount} foto{imageCount === 1 ? "" : "s"}
                    {hasVideo ? " + vídeo" : ""}
                  </Text>
                </View>
              </View>
            </View>

            <View style={{ alignItems: isMobile ? "flex-start" : "flex-end", gap: 10 }}>
              <Text
                style={{
                  color: COLORS.gold,
                  fontWeight: "900",
                  fontSize: isMobile ? 17 : 18,
                }}
              >
                {fmtEUR(Number(p.price_eur ?? 0))}
              </Text>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={{ color: COLORS.muted, fontWeight: "800" }}>
                  {p.is_active ? "Visible" : "Oculto"}
                </Text>
                <Switch value={p.is_active} onValueChange={() => onToggleActive(p)} />
              </View>
            </View>
          </View>

          {!!p.description && (
            <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
              {clampText(p.description, isMobile ? 140 : 200)}
            </Text>
          )}

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <ChipButton label="Editar" variant="primary" onPress={() => onEdit(p)} isMobile={isMobile} />
            {p.status !== "PUBLISHED" ? (
              <ChipButton label="Publicar" variant="success" onPress={() => onPublish(p)} isMobile={isMobile} />
            ) : null}
            {supportsFeaturedHome ? (
              <ChipButton
                label={p.is_featured_home ? "Quitar destacado" : "Destacar en portada"}
                onPress={() => onToggleFeatured(p)}
                isMobile={isMobile}
              />
            ) : null}
            <ChipButton label="Marcar vendido" onPress={() => onMarkSold(p)} isMobile={isMobile} />
            <ChipButton label="Borrar" variant="danger" onPress={() => onDelete(p)} isMobile={isMobile} />
          </View>
        </View>
      </View>
    </View>
  );
});

export default function AdminProducts() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const isDesktopish = widthSafe >= 1024;
  const pagePadding = isMobile ? 12 : 16;

  const [loading, setLoading] = useState(true);
  const [screenErr, setScreenErr] = useState<string | null>(null);
  const [mediaDebugErr, setMediaDebugErr] = useState<string | null>(null);

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [items, setItems] = useState<ProductRow[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("ALL");

  const [supportsFeaturedHome, setSupportsFeaturedHome] = useState(true);
  const [supportsReference, setSupportsReference] = useState(true);
  const [supportsProductMedia, setSupportsProductMedia] = useState(true);

  const itemsRef = useRef<ProductRow[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<ProductRow | null>(null);
  const [markSoldTarget, setMarkSoldTarget] = useState<ProductRow | null>(null);

  const [editing, setEditing] = useState<ProductRow | null>(null);
  const isEdit = !!editing;

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState<ProductStatus>("DRAFT");
  const [condition, setCondition] = useState<ProductCondition>("GOOD");
  const [reference, setReference] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [isFeaturedHome, setIsFeaturedHome] = useState(false);

  const [existingMedia, setExistingMedia] = useState<ProductMediaRow[]>([]);
  const [removedMedia, setRemovedMedia] = useState<ProductMediaRow[]>([]);
  const [newMedia, setNewMedia] = useState<LocalPickedMedia[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const [descExpanded, setDescExpanded] = useState(false);
  const [picking, setPicking] = useState(false);

  // Se lee desde resetForm()/openEditProduct() vía ref (en vez de como
  // dependencia normal de useCallback) para que esas funciones mantengan
  // SIEMPRE la misma identidad entre renders — así ProductListItem (más
  // abajo) nunca se ve obligado a re-renderizarse solo porque el usuario
  // añadió o quitó una foto pendiente en el formulario.
  const newMediaRef = useRef<LocalPickedMedia[]>([]);
  useEffect(() => {
    newMediaRef.current = newMedia;
  }, [newMedia]);

  useEffect(() => {
    return () => {
      revokeLocalMedia(newMedia);
    };
  }, [newMedia]);


  const activeCategories = useMemo(() => categories.filter((c) => !!c.is_active), [categories]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();

    return items.filter((p) => {
      const matchesSearch =
        !q ||
        String(p.title ?? "").toLowerCase().includes(q) ||
        String(p.description ?? "").toLowerCase().includes(q);

      const matchesStatus = statusFilter === "ALL" || p.status === statusFilter;

      const matchesVisibility =
        visibilityFilter === "ALL" ||
        (visibilityFilter === "VISIBLE" && !!p.is_active) ||
        (visibilityFilter === "HIDDEN" && !p.is_active);

      return matchesSearch && matchesStatus && matchesVisibility;
    });
  }, [items, search, statusFilter, visibilityFilter]);

  // Se calcula aquí (con el nombre de categoría ya resuelto) para que
  // ProductListItem no necesite la lista completa de "categories" como
  // prop — así solo vuelve a calcularse cuando cambian los productos
  // filtrados o las categorías, nunca por el formulario de edición.
  const listData: ProductListItemData[] = useMemo(
    () =>
      filteredItems.map((p) => ({
        ...p,
        catName: p.category_id
          ? categories.find((c) => c.id === p.category_id)?.name ?? "Categoría"
          : "Sin categoría",
      })),
    [filteredItems, categories]
  );

  const stats = useMemo(() => {
    const total = items.length;
    const published = items.filter((x) => x.status === "PUBLISHED").length;
    const visible = items.filter((x) => !!x.is_active).length;
    const featured = items.filter((x) => !!x.is_featured_home).length;

    return { total, published, visible, featured };
  }, [items]);

  const currentImageCount = useMemo(
    () =>
      existingMedia.filter((m) => getRowKind(m) === "image").length +
      newMedia.filter((m) => m.kind === "image").length,
    [existingMedia, newMedia]
  );

  const currentVideoCount = useMemo(
    () =>
      existingMedia.filter((m) => getRowKind(m) === "video").length +
      newMedia.filter((m) => m.kind === "video").length,
    [existingMedia, newMedia]
  );

  async function normalizeMediaForProduct(productId: string) {
    const rows = await fetchProductMediaRowsSafe(productId);

    if (!rows.length) return rows;

    const firstImage = rows.find((m) => getRowKind(m) === "image");

    // Antes se hacía un .update() por fila (hasta 15 llamadas secuenciales al
    // guardar). Ahora se agrupan los cambios y se envían en un único
    // .upsert() por id, que Supabase resuelve como un solo UPDATE por fila
    // pero en una sola petición de red.
    //
    // BUG corregido: este .upsert() es en realidad un
    // "INSERT ... ON CONFLICT (id) DO UPDATE" a nivel de Postgres. Aunque el
    // "id" ya existe y solo se pretende actualizar, Postgres valida las
    // columnas NOT NULL del INSERT igualmente antes de resolver el
    // conflicto — y "product_id" es NOT NULL y sin valor por defecto. Al
    // enviar solo {id, sort_order, is_cover} (sin product_id), cualquier
    // guardado que necesitara reordenar fotos (por ejemplo tras borrar
    // alguna) fallaba con "null value in column product_id violates
    // not-null constraint". Se soluciona incluyendo también product_id en
    // cada fila enviada.
    const changedRows: Array<{
      id: string;
      product_id: string;
      sort_order: number;
      is_cover: boolean;
    }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const shouldCover = !!firstImage && row.id === firstImage.id;
      const shouldOrder = i;

      if (getRowSortOrder(row) !== shouldOrder || Boolean(row.is_cover) !== shouldCover) {
        changedRows.push({
          id: row.id,
          product_id: row.product_id,
          sort_order: shouldOrder,
          is_cover: shouldCover,
        });
        row.sort_order = shouldOrder;
        row.is_cover = shouldCover;
      }
    }

    if (changedRows.length) {
      const { error: upsertError } = await supabase
        .from("product_media")
        .upsert(changedRows, { onConflict: "id" });

      if (upsertError) throw upsertError;
    }

    return rows;
  }

  async function load() {
    setLoading(true);
    setScreenErr(null);
    setMediaDebugErr(null);

    try {
      const [catsRes, prodResult] = await Promise.all([
        supabase
          .from("categories")
          .select("id,name,slug,sort_order,is_active")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        fetchAdminProductsSafe(),
      ]);

      if (catsRes.error) throw catsRes.error;

      const supportsFeatured = prodResult.supportsFeatured;
      const productsData: ProductRow[] = prodResult.rows.map((row) => sanitizeProductRow(row));

      let supportsMedia = true;
      let mediaRows: ProductMediaRow[] = [];
      const productIds = productsData.map((p) => p.id);

      try {
        mediaRows = await fetchProductMediaRowsSafe(productIds);
      } catch (e: any) {
        const rawMsg = String(e?.message ?? "");
        const msg = rawMsg.toLowerCase();

        const definitelyMissing =
          msg.includes('relation "product_media" does not exist') ||
          msg.includes("could not find the table") ||
          msg.includes("does not exist");

        if (definitelyMissing) {
          supportsMedia = false;
          console.warn("No se pudo leer la tabla de multimedia de productos:", rawMsg);
          setMediaDebugErr("La gestión de fotos y vídeos no está disponible en este momento.");
        } else {
          console.error("Error leyendo la multimedia de productos:", rawMsg);
          setMediaDebugErr("No se han podido cargar las fotos y vídeos de los productos.");
          throw e;
        }
      }

      const mediaByProduct = new Map<string, ProductMediaRow[]>();

      for (const media of mediaRows) {
        const list = mediaByProduct.get(media.product_id) ?? [];
        list.push(media);
        mediaByProduct.set(media.product_id, list);
      }

      const merged = productsData.map((item) => ({
        ...item,
        media: (mediaByProduct.get(item.id) ?? []).sort(sortMediaRows),
      }));

      setSupportsFeaturedHome(supportsFeatured);
      setSupportsReference(prodResult.supportsReference);
      setSupportsProductMedia(supportsMedia);
      setCategories((Array.isArray(catsRes.data) ? catsRes.data : []) as CategoryRow[]);
      setItems(merged);
    } catch (e: any) {
      console.error(
        "Error cargando productos:",
        e?.message || e?.error_description || e?.details || e
      );
      setScreenErr("No se han podido cargar los productos. Inténtalo de nuevo.");
      setCategories([]);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const resetForm = useCallback(() => {
    setEditing(null);
    setTitle("");
    setDesc(DEFAULT_DESCRIPTION);
    setPrice("");
    setStatus("DRAFT");
    setCondition("GOOD");
    setReference("");
    setCategoryId(null);
    setIsActive(true);
    setIsFeaturedHome(false);
    setExistingMedia([]);
    setRemovedMedia([]);
    revokeLocalMedia(newMediaRef.current);
    setNewMedia([]);
    setUploadProgress(null);
    setModalErr(null);
    setDescExpanded(false);
    setPicking(false);
  }, []);

  const openCreate = useCallback(() => {
    resetForm();
    setOpen(true);
  }, [resetForm]);

  const openEditProduct = useCallback(
    (p: ProductRow) => {
      resetForm();
      setEditing(p);
      setTitle(p.title ?? "");
      setDesc(p.description ?? "");
      setPrice(String(p.price_eur ?? 0));
      setStatus(p.status ?? "DRAFT");
      setCondition(p.condition ?? "GOOD");
      setReference(p.reference ?? "");
      setCategoryId(p.category_id ?? null);
      setIsActive(!!p.is_active);
      setIsFeaturedHome(!!p.is_featured_home);
      setExistingMedia([...(p.media ?? [])].sort(sortMediaRows));
      setModalErr(null);
      setOpen(true);
    },
    [resetForm]
  );

  async function addMediaFromPicker() {
    setModalErr(null);

    if (!supportsProductMedia) {
      setModalErr(
        mediaDebugErr || "La gestión de fotos y vídeos no está disponible en este momento."
      );
      return;
    }

    setPicking(true);
    try {
      // pickMediaFilesWeb() ya no falla en bloque: cada archivo se procesa
      // por separado, así que una foto rara entre 15 (formato raro, HEIC
      // que no se puede convertir...) ya no hace desaparecer TODA la
      // selección sin avisar — las buenas se añaden igual y las que fallan
      // se listan en "skipped" para poder avisar de cuáles fueron.
      const { items: picked, skipped } = await pickMediaFilesWeb();

      const skippedNote = skipped.length
        ? `${skipped.length} archivo${skipped.length === 1 ? "" : "s"} no se ${
            skipped.length === 1 ? "pudo" : "pudieron"
          } añadir (${skipped.map((s) => s.name).join(", ")}).`
        : "";

      if (!picked.length) {
        if (skippedNote) setModalErr(skippedNote);
        return;
      }

      const oversize = picked.find((m) => m.size > MAX_FILE_SIZE_MB * 1024 * 1024);
      if (oversize) {
        revokeLocalMedia(picked);
        setModalErr(
          `Uno de los archivos supera el máximo de ${MAX_FILE_SIZE_MB}MB permitido por archivo.${
            skippedNote ? ` ${skippedNote}` : ""
          }`
        );
        return;
      }

      const pickedImages = picked.filter((m) => m.kind === "image");
      const pickedVideos = picked.filter((m) => m.kind === "video");

      if (pickedVideos.length > 1) {
        revokeLocalMedia(picked);
        setModalErr(`Solo se permite 1 vídeo por producto.${skippedNote ? ` ${skippedNote}` : ""}`);
        return;
      }

      if (currentImageCount + pickedImages.length > MAX_IMAGES) {
        revokeLocalMedia(picked);
        setModalErr(
          `Máximo ${MAX_IMAGES} imágenes por producto.${skippedNote ? ` ${skippedNote}` : ""}`
        );
        return;
      }

      if (currentVideoCount + pickedVideos.length > 1) {
        revokeLocalMedia(picked);
        setModalErr(`Solo se permite 1 vídeo por producto.${skippedNote ? ` ${skippedNote}` : ""}`);
        return;
      }

      const invalidDuration = pickedVideos.find(
        (v) => !v.durationSeconds || Number(v.durationSeconds) > MAX_VIDEO_SECONDS
      );

      if (invalidDuration) {
        revokeLocalMedia(picked);
        setModalErr(
          `El vídeo no puede superar ${MAX_VIDEO_SECONDS} segundos.${skippedNote ? ` ${skippedNote}` : ""}`
        );
        return;
      }

      setNewMedia((prev) => [...prev, ...picked]);
      if (skippedNote) setModalErr(skippedNote);
    } catch (e: any) {
      console.error("Error seleccionando archivos:", e?.message ?? e);
      setModalErr("No se han podido seleccionar los archivos.");
    } finally {
      setPicking(false);
    }
  }

  function removeNewMedia(id: string) {
    setNewMedia((prev) => {
      const found = prev.find((m) => m.id === id);
      if (found) revokeLocalMedia([found]);
      return prev.filter((m) => m.id !== id);
    });
  }

  function removeExistingMedia(id: string) {
    setExistingMedia((prev) => {
      const found = prev.find((m) => m.id === id);
      if (found) {
        setRemovedMedia((curr) => [...curr, found]);
      }
      return prev.filter((m) => m.id !== id);
    });
  }

  async function uploadNewMedia(productId: string) {
    if (!newMedia.length) return;

    const startIndex = existingMedia.length;
    // Archivos que SÍ terminan de subirse (Storage + fila en product_media)
    // en esta pasada. Si algo falla a mitad (por ejemplo la 3ª de 5 fotos),
    // los quitamos de "pendientes" (newMedia) antes de propagar el error,
    // para que si el admin pulsa "Guardar cambios" otra vez no se vuelvan a
    // subir duplicados.
    const uploadedIds: string[] = [];
    const total = newMedia.length;

    setUploadProgress({ done: 0, total });

    try {
      for (let i = 0; i < newMedia.length; i++) {
        const item = newMedia[i];
        const storagePath = buildMediaPath(productId, item, startIndex + i);

        // Se reintenta un par de veces cada subida antes de rendirse: al
        // mandar de golpe 10-15 fotos seguidas, un corte de red de un
        // instante en UNA de ellas ya no aborta el resto ni obliga a
        // repetir todo desde cero.
        const uploadRes = await withRetries(() =>
          supabase.storage.from(MEDIA_BUCKET).upload(storagePath, item.file, {
            cacheControl: "3600",
            upsert: false,
            contentType: item.mimeType || undefined,
          })
        );

        if (uploadRes.error) throw uploadRes.error;

        const { data: publicData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath);
        const publicUrl = publicData?.publicUrl ?? "";

        const basePayload: Record<string, any> = {
          product_id: productId,
          storage_path: storagePath,
          public_url: publicUrl,
          file_name: item.name,
          mime_type: item.mimeType || null,
          sort_order: startIndex + i,
          is_cover: false,
        };

        if (item.kind === "image" || item.kind === "video") {
          basePayload.kind = item.kind;
        }

        if (item.kind === "video") {
          basePayload.duration_seconds = item.durationSeconds ?? null;
        }

        const insertRes = await withRetries(() =>
          supabase.from("product_media").insert(basePayload)
        );
        if (insertRes.error) {
          const fallbackPayload = {
            product_id: productId,
            storage_path: storagePath,
            public_url: publicUrl,
            file_name: item.name,
            mime_type: item.mimeType || null,
            sort_order: startIndex + i,
            is_cover: false,
          };

          const retryRes = await withRetries(() =>
            supabase.from("product_media").insert(fallbackPayload)
          );
          if (retryRes.error) throw retryRes.error;
        }

        uploadedIds.push(item.id);
        setUploadProgress({ done: i + 1, total });
      }
    } catch (err) {
      if (uploadedIds.length) {
        const uploadedSet = new Set(uploadedIds);
        setNewMedia((prev) => {
          revokeLocalMedia(prev.filter((m) => uploadedSet.has(m.id)));
          return prev.filter((m) => !uploadedSet.has(m.id));
        });
      }
      throw err;
    }
  }

  async function deleteRemovedMedia() {
    if (!removedMedia.length) return;

    const paths = removedMedia.map((m) => m.storage_path).filter(Boolean) as string[];
    const ids = removedMedia.map((m) => m.id);

    if (paths.length) {
      const storageDelete = await supabase.storage.from(MEDIA_BUCKET).remove(paths);
      if (storageDelete.error) throw storageDelete.error;
    }

    const dbDelete = await supabase.from("product_media").delete().in("id", ids);
    if (dbDelete.error) throw dbDelete.error;
  }

  // Antes, cualquier fallo al guardar (de la ficha del producto o de las
  // fotos/vídeo) mostraba siempre el mismo mensaje genérico
  // ("No se ha podido guardar el producto. Inténtalo de nuevo."), sin decir
  // POR QUÉ — eso hacía imposible saber si era un problema de permisos, de
  // tamaño de archivo, de conexión, etc. Ahora se muestra también el
  // detalle real que devuelve Supabase, traducido cuando reconocemos la
  // causa habitual.
  function describeSaveError(e: any, contexto: "el producto" | "las fotos o el vídeo") {
    const rawMessage = String(
      e?.message || e?.error_description || e?.details || e?.hint || e?.error || ""
    ).trim();
    const lower = rawMessage.toLowerCase();
    const statusCode = String(e?.statusCode ?? e?.status ?? "").trim();

    if (e?.code === "23505" && lower.includes("reference")) {
      return "Ya existe otro producto con ese número de referencia. Usa uno distinto.";
    }

    if (
      lower.includes("row-level security") ||
      lower.includes("permission denied") ||
      statusCode === "403"
    ) {
      return `No tienes permiso para guardar ${contexto} (comprueba que tu cuenta siga marcada como administrador). Detalle: ${
        rawMessage || "sin detalle"
      }`;
    }

    if (lower.includes("exceeded the maximum allowed size") || statusCode === "413") {
      return `Uno de los archivos es demasiado grande para subirlo. Detalle: ${
        rawMessage || "sin detalle"
      }`;
    }

    if (lower.includes("bucket not found")) {
      return "No se encuentra el almacén de fotos/vídeo en Supabase (bucket 'product-media'). Puede que falte ejecutar sql/product_media.sql.";
    }

    if (lower.includes("failed to fetch") || lower.includes("networkerror")) {
      return "No se ha podido conectar con el servidor. Comprueba tu conexión a internet e inténtalo de nuevo.";
    }

    if (rawMessage) {
      return `No se ha podido guardar ${contexto}. Detalle: ${rawMessage}`;
    }

    return `No se ha podido guardar ${contexto}. Inténtalo de nuevo.`;
  }

  async function save() {
    if (saving) return;

    setSaving(true);
    setModalErr(null);

    const cleanTitle = title.trim();
    const cleanDesc = desc.trim();
    // toPriceSafe (no toIntSafe): conserva los céntimos ("17,97" → 17.97) en
    // vez de redondear siempre a euro entero — products.price_eur ya admite
    // decimales en la base de datos.
    const priceEur = toPriceSafe(price, 0);

    if (!cleanTitle) {
      setModalErr("Introduce un título.");
      setSaving(false);
      return;
    }

    if (cleanTitle.length < 3) {
      setModalErr("El título es demasiado corto.");
      setSaving(false);
      return;
    }

    if (priceEur < 0) {
      setModalErr("Precio inválido.");
      setSaving(false);
      return;
    }

    const totalImages =
      existingMedia.filter((m) => getRowKind(m) === "image").length +
      newMedia.filter((m) => m.kind === "image").length;

    const totalVideos =
      existingMedia.filter((m) => getRowKind(m) === "video").length +
      newMedia.filter((m) => m.kind === "video").length;

    if (totalImages > MAX_IMAGES) {
      setModalErr(`Máximo ${MAX_IMAGES} imágenes por producto.`);
      setSaving(false);
      return;
    }

    if (totalVideos > 1) {
      setModalErr("Solo se permite 1 vídeo por producto.");
      setSaving(false);
      return;
    }

    const oversize = newMedia.find((m) => m.size > MAX_FILE_SIZE_MB * 1024 * 1024);
    if (oversize) {
      setModalErr(
        `Uno de los archivos supera el máximo de ${MAX_FILE_SIZE_MB}MB permitido por archivo.`
      );
      setSaving(false);
      return;
    }

    const cleanReference = reference.trim();

    const payload: Record<string, any> = {
      title: cleanTitle,
      description: cleanDesc || null,
      price_eur: priceEur,
      status,
      condition,
      category_id: categoryId,
      is_active: isActive,
    };

    if (supportsFeaturedHome) {
      payload.is_featured_home = !!isFeaturedHome;
    }

    if (supportsReference) {
      payload.reference = cleanReference || null;
    }

    try {
      let productId = editing?.id ?? null;
      const wasNewProduct = !editing;

      if (editing) {
        const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("products")
          .insert(payload)
          .select("id")
          .single();

        if (error) throw error;
        productId = data?.id ?? null;
      }

      if (!productId) throw new Error("No se pudo completar la creación del producto.");

      if (wasNewProduct) {
        // La ficha del producto ya se ha creado en la base de datos. Si la
        // subida de fotos/vídeo de más abajo falla, necesitamos que un
        // reintento ACTUALICE este producto en vez de crear uno nuevo
        // duplicado con el mismo título — por eso lo marcamos como
        // "editing" ya aquí, antes de intentar subir nada.
        setEditing({
          id: productId,
          title: cleanTitle,
          description: cleanDesc || null,
          price_eur: priceEur,
          status,
          condition,
          category_id: categoryId,
          is_active: isActive,
          created_at: "",
          updated_at: "",
          is_featured_home: !!isFeaturedHome,
          reference: cleanReference || null,
          media: [],
        });
      }

      if (supportsProductMedia) {
        try {
          await deleteRemovedMedia();
          await uploadNewMedia(productId);
          await normalizeMediaForProduct(productId);
        } catch (mediaErr: any) {
          // El producto (título, precio, estado...) SÍ se ha guardado bien;
          // el fallo es solo al subir las fotos/vídeo nuevos. Se avisa de
          // forma distinta para no decir "no se ha guardado" cuando sí se
          // ha guardado, y se deja el formulario abierto (con el resto de
          // fotos pendientes que uploadNewMedia() no llegó a subir) para
          // que el admin pueda reintentar solo esa parte.
          console.error(
            "Error subiendo fotos/vídeo del producto:",
            mediaErr?.message || mediaErr?.error_description || mediaErr?.details || mediaErr
          );
          setModalErr(
            `El producto se ha guardado, pero no se han podido subir las fotos o el vídeo nuevos. ${describeSaveError(
              mediaErr,
              "las fotos o el vídeo"
            )}`
          );
          return;
        }
      }

      setOpen(false);
      resetForm();
      await load();
    } catch (e: any) {
      console.error(
        "Error guardando producto:",
        e?.message || e?.error_description || e?.details || e
      );
      setModalErr(describeSaveError(e, "el producto"));
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  }

  const askRemove = useCallback((p: ProductRow) => {
    setConfirmDelete(p);
  }, []);

  async function removeProductConfirmed() {
    const p = confirmDelete;
    if (!p) return;

    setConfirmDelete(null);
    setScreenErr(null);

    try {
      if (supportsProductMedia && p.media?.length) {
        const paths = p.media.map((m) => m.storage_path).filter(Boolean) as string[];
        if (paths.length) {
          const storageRes = await supabase.storage.from(MEDIA_BUCKET).remove(paths);
          if (storageRes.error) throw storageRes.error;
        }
      }

      const { error } = await supabase.from("products").delete().eq("id", p.id);
      if (error) throw error;

      await load();
    } catch (e: any) {
      console.error(
        "Error borrando producto:",
        e?.message || e?.error_description || e?.details || e
      );
      setScreenErr("No se ha podido borrar el producto. Inténtalo de nuevo.");
    }
  }

  const quickPublish = useCallback(async (p: ProductRow) => {
    const prev = itemsRef.current;
    const next = prev.map((x) =>
      x.id === p.id ? { ...x, status: "PUBLISHED" as ProductStatus } : x
    );
    setItems(next);

    const { error } = await supabase
      .from("products")
      .update({ status: "PUBLISHED" })
      .eq("id", p.id);

    if (error) {
      setItems(prev);
      console.error("Error publicando producto:", error.message);
      setScreenErr("No se ha podido publicar el producto. Inténtalo de nuevo.");
    }
  }, []);

  const toggleActive = useCallback(async (p: ProductRow) => {
    const prev = itemsRef.current;
    const next = prev.map((x) => (x.id === p.id ? { ...x, is_active: !x.is_active } : x));
    setItems(next);

    const { error } = await supabase
      .from("products")
      .update({ is_active: !p.is_active })
      .eq("id", p.id);

    if (error) {
      setItems(prev);
      console.error("Error cambiando la visibilidad del producto:", error.message);
      setScreenErr("No se ha podido cambiar la visibilidad del producto. Inténtalo de nuevo.");
    }
  }, []);

  const toggleFeaturedHome = useCallback(
    async (p: ProductRow) => {
      if (!supportsFeaturedHome) {
        setScreenErr("No se puede destacar en portada: esta función no está disponible en este catálogo.");
        return;
      }

      const nextValue = !p.is_featured_home;
      const prev = itemsRef.current;

      const next = prev.map((x) => {
        if (nextValue) return { ...x, is_featured_home: x.id === p.id };
        if (x.id === p.id) return { ...x, is_featured_home: false };
        return x;
      });

      setItems(next);

      try {
        if (nextValue) {
          const currentFeatured = prev.find((x) => x.is_featured_home && x.id !== p.id);
          if (currentFeatured) {
            await supabase
              .from("products")
              .update({ is_featured_home: false })
              .eq("id", currentFeatured.id);
          }
        }

        const { error } = await supabase
          .from("products")
          .update({ is_featured_home: nextValue })
          .eq("id", p.id);

        if (error) throw error;
      } catch (e: any) {
        setItems(prev);
        console.error("Error cambiando producto destacado:", e?.message ?? e);
        setScreenErr("No se ha podido actualizar el producto destacado. Inténtalo de nuevo.");
      }
    },
    [supportsFeaturedHome]
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator color={COLORS.text} />
          <Text style={{ color: COLORS.muted }}>Cargando productos…</Text>
        </View>
      ) : (
        // Todo el contenido (volver, estadísticas, buscador, filtros, botón
        // de crear y la lista de productos) vive dentro de este único
        // ScrollView. Antes el título "Productos" y ese bloque de arriba
        // estaban fuera del scroll (una cabecera fija aparte de la lista);
        // ahora todo se desplaza junto, como un solo scroll de la pestaña,
        // y se quitó el título/subtítulo para aprovechar ese espacio.
        <ScrollView contentContainerStyle={{ padding: pagePadding, paddingBottom: 30, alignItems: "center" }}>
          {/* Columna centrada: mismo ancho máximo en toda la pantalla */}
          <View style={{ width: "100%", maxWidth: 1160, gap: 12 }}>
          <Pressable
            onPress={smartBackAdminHome}
            style={({ pressed }) => ({
              opacity: pressed ? 0.88 : 1,
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: "#F6FAFD",
              alignSelf: "flex-start",
            })}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>← Volver</Text>
          </Pressable>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 10,
              justifyContent: "space-between",
            }}
          >
            <StatCard label="Total" value={String(stats.total)} icon="cube-outline" isMobile={isMobile} compact />
            <StatCard label="Publicados" value={String(stats.published)} icon="checkmark-circle-outline" isMobile={isMobile} compact />
            <StatCard label="Visibles" value={String(stats.visible)} icon="eye-outline" isMobile={isMobile} compact />
            <StatCard label="Destacados portada" value={String(stats.featured)} icon="flame-outline" isMobile={isMobile} compact />
          </View>

          {!!screenErr && (
            <View
              style={{
                borderRadius: 14,
                backgroundColor: COLORS.dangerBg,
                padding: 10,
              }}
            >
              <Text style={{ color: COLORS.danger, fontWeight: "800", lineHeight: 20 }}>
                {screenErr}
              </Text>
            </View>
          )}

          {!supportsProductMedia && (
            <View
              style={{
                borderRadius: 14,
                backgroundColor: COLORS.warningBg,
                padding: 10,
              }}
            >
              <Text style={{ color: COLORS.warning, fontWeight: "800", lineHeight: 20 }}>
                {mediaDebugErr || "No se han podido cargar las fotos y vídeos de los productos."}
              </Text>
            </View>
          )}

          <View
            style={{
              borderRadius: 18,
              backgroundColor: COLORS.card,
              padding: 12,
              gap: 10,
            }}
          >
            <TextInput
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
                // 16px, no 14/15: por debajo de 16px, Safari en iPhone hace
                // zoom automático de toda la pantalla al enfocar el campo —
                // el "zoom insoportable" que reportó Daniel al escribir en
                // el panel de administración.
                fontSize: 16,
              }}
            />

            <View style={{ gap: 8 }}>
              <Text style={{ color: COLORS.muted, fontWeight: "800" }}>Estado</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                <FilterPill label="Todos" active={statusFilter === "ALL"} onPress={() => setStatusFilter("ALL")} isMobile={isMobile} />
                <FilterPill label="Borrador" active={statusFilter === "DRAFT"} onPress={() => setStatusFilter("DRAFT")} isMobile={isMobile} />
                <FilterPill label="Por revisar" active={statusFilter === "REVIEW"} onPress={() => setStatusFilter("REVIEW")} isMobile={isMobile} />
                <FilterPill label="Publicado" active={statusFilter === "PUBLISHED"} onPress={() => setStatusFilter("PUBLISHED")} isMobile={isMobile} />
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: COLORS.muted, fontWeight: "800" }}>Visibilidad</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                <FilterPill label="Todos" active={visibilityFilter === "ALL"} onPress={() => setVisibilityFilter("ALL")} isMobile={isMobile} />
                <FilterPill label="Visibles" active={visibilityFilter === "VISIBLE"} onPress={() => setVisibilityFilter("VISIBLE")} isMobile={isMobile} />
                <FilterPill label="Ocultos" active={visibilityFilter === "HIDDEN"} onPress={() => setVisibilityFilter("HIDDEN")} isMobile={isMobile} />
              </View>
            </View>

            <Pressable
              onPress={openCreate}
              style={({ pressed }) => ({
                opacity: pressed ? 0.9 : 1,
                borderRadius: 14,
                paddingVertical: 13,
                alignItems: "center",
                backgroundColor: COLORS.accent,
                ...softShadow(),
              })}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>
                + Nuevo producto
              </Text>
            </Pressable>
          </View>

          {filteredItems.length === 0 ? (
            <View
              style={{
                borderRadius: 18,
                backgroundColor: COLORS.card,
                padding: isMobile ? 14 : 16,
                gap: 8,
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
                No hay productos para este filtro.
              </Text>
              <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                Cambia la búsqueda o crea el primero: un catálogo vacío no genera ventas.
              </Text>
            </View>
          ) : (
            listData.map((p) => (
              <ProductListItem
                key={p.id}
                item={p}
                isMobile={isMobile}
                isDesktopish={isDesktopish}
                supportsFeaturedHome={supportsFeaturedHome}
                onEdit={openEditProduct}
                onPublish={quickPublish}
                onToggleFeatured={toggleFeaturedHome}
                onMarkSold={setMarkSoldTarget}
                onDelete={askRemove}
                onToggleActive={toggleActive}
              />
            ))
          )}
          </View>
        </ScrollView>
      )}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.60)",
            padding: isMobile ? 10 : 16,
            justifyContent: "center",
          }}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={{
                width: "100%",
                maxWidth: 720,
                alignSelf: "center",
                borderRadius: 20,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.bg2,
                padding: isMobile ? 14 : 16,
                gap: 12,
                ...softShadow(),
              }}
            >
              <View style={{ position: "relative", justifyContent: "center" }}>
                <Text
                  style={{
                    color: COLORS.text,
                    fontSize: isMobile ? 19 : 20,
                    fontWeight: "900",
                    textAlign: "center",
                    paddingHorizontal: 40,
                  }}
                >
                  {isEdit ? "Editar producto" : "Nuevo producto"}
                </Text>

                <Pressable
                  onPress={() => {
                    setOpen(false);
                    resetForm();
                  }}
                  hitSlop={8}
                  style={({ pressed }) => ({
                    position: "absolute",
                    top: -4,
                    right: -4,
                    opacity: pressed ? 0.75 : 1,
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#F6FAFD",
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  })}
                >
                  <Ionicons name="close" size={19} color={COLORS.text} />
                </Pressable>
              </View>

              <TextInput
                value={title}
                onChangeText={(v) => {
                  setTitle(v);
                  setModalErr(null);
                }}
                placeholder="Título del producto"
                placeholderTextColor="rgba(11,33,56,0.40)"
                style={{
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  color: COLORS.text,
                  backgroundColor: "#F8FBFE",
                  fontSize: 16, // 16px: evita el zoom automático de Safari en iPhone al escribir.
                }}
              />

              <View style={{ gap: 8 }}>
                <Pressable
                  onPress={() => setDescExpanded((v) => !v)}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.9 : 1,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    borderRadius: 14,
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    backgroundColor: "#F8FBFE",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  })}
                >
                  <Text
                    style={{ color: desc.trim() ? COLORS.text : "rgba(11,33,56,0.40)", fontSize: 14, flex: 1 }}
                    numberOfLines={1}
                  >
                    {descExpanded
                      ? "Descripción"
                      : desc.trim()
                        ? clampText(desc, 60)
                        : "Descripción (opcional)"}
                  </Text>
                  <Ionicons
                    name={descExpanded ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={COLORS.muted}
                  />
                </Pressable>

                {descExpanded && (
                  <TextInput
                    value={desc}
                    onChangeText={(v) => {
                      setDesc(v);
                      setModalErr(null);
                    }}
                    placeholder="Descripción"
                    placeholderTextColor="rgba(11,33,56,0.40)"
                    multiline
                    autoFocus
                    style={{
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      borderRadius: 14,
                      paddingHorizontal: 12,
                      paddingVertical: 12,
                      color: COLORS.text,
                      minHeight: (isMobile ? 88 : 96) * 3,
                      textAlignVertical: "top",
                      backgroundColor: "#F8FBFE",
                      fontSize: 16, // 16px: evita el zoom automático de Safari en iPhone al escribir.
                    }}
                  />
                )}
              </View>

              <TextInput
                value={price}
                onChangeText={(v) => {
                  setPrice(v);
                  setModalErr(null);
                }}
                placeholder="Precio en euros (admite decimales: 17,97)"
                placeholderTextColor="rgba(11,33,56,0.40)"
                // decimal-pad, no numeric: numeric a veces no ofrece tecla de
                // coma/punto en el teclado del móvil, y el precio necesita
                // poder llevar céntimos (17,97€).
                keyboardType="decimal-pad"
                style={{
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  color: COLORS.text,
                  backgroundColor: "#F8FBFE",
                  fontSize: 16, // 16px: evita el zoom automático de Safari en iPhone al escribir.
                }}
              />

              {supportsReference ? (
                <TextInput
                  value={reference}
                  onChangeText={(v) => {
                    setReference(v);
                    setModalErr(null);
                  }}
                  placeholder="Número de referencia del artículo (opcional)"
                  placeholderTextColor="rgba(11,33,56,0.40)"
                  autoCapitalize="characters"
                  style={{
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    borderRadius: 14,
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    color: COLORS.text,
                    backgroundColor: "#F8FBFE",
                    fontSize: 16, // 16px: evita el zoom automático de Safari en iPhone al escribir.
                  }}
                />
              ) : (
                <Text style={{ color: COLORS.muted, lineHeight: 19, fontSize: 12 }}>
                  El número de referencia todavía no está activado: ejecuta
                  sql/product_reference.sql en Supabase para poder rellenarlo.
                </Text>
              )}

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
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  <ChipButton
                    label={picking ? "Procesando…" : "Añadir imágenes / vídeo"}
                    variant="primary"
                    onPress={addMediaFromPicker}
                    isMobile={isMobile}
                    disabled={!!uploadProgress || picking}
                  />
                  {picking && <ActivityIndicator size="small" color={COLORS.accent} />}
                </View>

                <Text style={{ color: COLORS.muted, lineHeight: 19 }}>
                  Actualmente: {currentImageCount}/{MAX_IMAGES} imágenes · {currentVideoCount}/1 vídeo
                </Text>

                {!!uploadProgress && (
                  <View
                    style={{
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: COLORS.accentBorder,
                      backgroundColor: COLORS.accent2,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <ActivityIndicator size="small" color={COLORS.accent} />
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 13 }}>
                      Subiendo fotos/vídeo… {uploadProgress.done}/{uploadProgress.total}
                    </Text>
                  </View>
                )}

                {!!existingMedia.length && (
                  <View style={{ gap: 8 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>Media actual</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        {existingMedia.map((m) => (
                          <MediaThumb
                            key={m.id}
                            media={m}
                            isMobile={isMobile}
                            onRemove={() => removeExistingMedia(m.id)}
                          />
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                )}

                {!!newMedia.length && (
                  <View style={{ gap: 8 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>Media nueva pendiente</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        {newMedia.map((m) => (
                          <MediaThumb
                            key={m.id}
                            media={m}
                            isMobile={isMobile}
                            onRemove={() => removeNewMedia(m.id)}
                          />
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                )}
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <DropdownField
                    label="Estado"
                    value={status}
                    onChange={(v) => setStatus(v as ProductStatus)}
                    options={(["DRAFT", "REVIEW", "PUBLISHED"] as ProductStatus[]).map((s) => ({
                      value: s,
                      label: labelStatus(s),
                    }))}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <DropdownField
                    label="Condición"
                    value={condition}
                    onChange={(v) => setCondition(v as ProductCondition)}
                    options={(["NEW", "LIKE_NEW", "GOOD", "FAIR", "PARTS"] as ProductCondition[]).map(
                      (c) => ({ value: c, label: labelCond(c) })
                    )}
                  />
                </View>
              </View>

              <DropdownField
                label="Categoría"
                value={categoryId ?? ""}
                onChange={(v) => setCategoryId(v || null)}
                placeholder="Sin categoría"
                options={[
                  { value: "", label: "Sin categoría" },
                  ...activeCategories.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />

              <View style={{ flexDirection: "row", gap: 10 }}>
                <View
                  style={{
                    flex: 1,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: COLORS.cardSoft,
                    padding: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <Text
                    style={{ color: COLORS.text, fontWeight: "900", fontSize: isMobile ? 13 : 14, flexShrink: 1 }}
                  >
                    Producto activo
                  </Text>
                  <Switch value={isActive} onValueChange={setIsActive} />
                </View>

                {supportsFeaturedHome ? (
                  <View
                    style={{
                      flex: 1,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      backgroundColor: COLORS.cardSoft,
                      padding: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <Text
                      style={{ color: COLORS.text, fontWeight: "900", fontSize: isMobile ? 13 : 14, flexShrink: 1 }}
                    >
                      Destacar en portada
                    </Text>
                    <Switch value={isFeaturedHome} onValueChange={setIsFeaturedHome} />
                  </View>
                ) : null}
              </View>

              <Text style={{ color: COLORS.muted, fontSize: 12, lineHeight: 16 }}>
                "Estado" es la fase del producto en el catálogo (borrador, por
                revisar o publicado). "Producto activo" es otra cosa: decide
                si, aun estando publicado, se ve o no en la tienda — apagarlo
                lo oculta sin borrar la ficha ni perder su historial.
              </Text>

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
                  <Text style={{ color: COLORS.danger, fontWeight: "800", lineHeight: 20 }}>
                    {modalErr}
                  </Text>
                </View>
              )}

              {/* Antes había un botón "Cancelar" aquí al lado de "Guardar".
                  Se quitó a petición de Daniel: la "X" de arriba del modal ya
                  cierra sin guardar, así que era un botón redundante. */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "flex-end",
                  marginTop: 4,
                }}
              >
                <Pressable
                  onPress={save}
                  disabled={saving}
                  style={({ pressed }) => ({
                    opacity: saving ? 0.6 : pressed ? 0.9 : 1,
                    borderRadius: 999,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    backgroundColor: COLORS.accent,
                    width: isMobile ? "100%" : undefined,
                  })}
                >
                  <Text style={{ color: "#FFFFFF", fontWeight: "900", textAlign: "center" }}>
                    {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear producto"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
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
              borderColor: COLORS.dangerBorder,
              backgroundColor: COLORS.bg2,
              padding: isMobile ? 14 : 16,
              gap: 10,
            }}
          >
            <Text style={{ color: COLORS.text, fontSize: isMobile ? 17 : 18, fontWeight: "900" }}>
              Borrar producto
            </Text>

            <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
              Vas a borrar{" "}
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                {confirmDelete?.title ?? ""}
              </Text>
              . Esta acción no se puede deshacer.
            </Text>

            <View
              style={{
                flexDirection: isMobile ? "column" : "row",
                gap: 10,
                justifyContent: "flex-end",
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
                onPress={removeProductConfirmed}
                isMobile={isMobile}
                fullWidth={isMobile}
              />
            </View>
          </View>
        </View>
      </Modal>

      <MarkSoldModal
        product={markSoldTarget}
        isMobile={isMobile}
        onClose={() => setMarkSoldTarget(null)}
      />
    </View>
  );
}

// --- "Marcar vendido" buscando un usuario registrado ----------------------
// No depende de que el cliente haya escrito por el chat del producto (esa
// otra vía vive en app/admin/chats.tsx): aquí Jefe busca directamente por
// nombre, usuario o email con la función admin_search_users (ver
// sql/product_sales.sql, la única forma de leer auth.users desde el cliente
// sin exponer la tabla entera) y marca el producto como vendido a quien
// elija. Ambas vías escriben en la misma tabla product_sales.
type AdminUserResult = { id: string; email: string; full_name: string; username: string };
type ExistingSale = { buyer_user_id: string; created_at: string };

function MarkSoldModal({
  product,
  isMobile,
  onClose,
}: {
  product: ProductRow | null;
  isMobile: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminUserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [marking, setMarking] = useState(false);
  const [markedName, setMarkedName] = useState<string | null>(null);
  const [existingSale, setExistingSale] = useState<ExistingSale | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!product) {
      setQuery("");
      setResults([]);
      setMarkedName(null);
      setExistingSale(null);
      return;
    }

    supabase
      .from("product_sales")
      .select("buyer_user_id,created_at")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setExistingSale((data as ExistingSale) ?? null));
  }, [product?.id]);

  useEffect(() => {
    if (!product) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data, error } = await supabase.rpc("admin_search_users", { q: query });
        if (error) throw error;
        setResults((data ?? []) as AdminUserResult[]);
      } catch (e) {
        console.error("Error buscando usuarios:", e);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, product?.id]);

  async function markSoldTo(user: AdminUserResult) {
    if (!product || marking) return;

    setMarking(true);
    try {
      const { error } = await supabase
        .from("product_sales")
        .insert({ product_id: product.id, buyer_user_id: user.id });
      if (error) throw error;

      setMarkedName(user.full_name || user.username || user.email);
      setExistingSale({ buyer_user_id: user.id, created_at: new Date().toISOString() });
    } catch (e) {
      console.error("Error marcando como vendido:", e);
    } finally {
      setMarking(false);
    }
  }

  return (
    <Modal visible={!!product} transparent animationType="fade" onRequestClose={onClose}>
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
            maxWidth: 480,
            alignSelf: "center",
            borderRadius: 18,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.bg2,
            padding: isMobile ? 14 : 16,
            gap: 12,
          }}
        >
          <Text style={{ color: COLORS.text, fontSize: isMobile ? 17 : 18, fontWeight: "900" }}>
            Marcar como vendido
          </Text>

          <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
            Busca al cliente registrado (nombre, usuario o email) al que le has vendido{" "}
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>{product?.title ?? ""}</Text>.
          </Text>

          {existingSale ? (
            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: COLORS.successBorder,
                backgroundColor: COLORS.successBg,
                padding: 10,
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "700", fontSize: 13 }}>
                {markedName ? `Marcado como vendido a ${markedName}.` : "Este producto ya tiene una venta registrada."}
              </Text>
            </View>
          ) : null}

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Nombre, usuario o email…"
            placeholderTextColor="rgba(11,33,56,0.40)"
            style={{
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: 12,
              paddingVertical: 10,
              paddingHorizontal: 12,
              color: COLORS.text,
              backgroundColor: "#FFFFFF",
              fontSize: 16,
            }}
          />

          <View style={{ gap: 8, maxHeight: 260 }}>
            {searching ? (
              <View style={{ alignItems: "center", paddingVertical: 12 }}>
                <ActivityIndicator color={COLORS.accent} />
              </View>
            ) : results.length === 0 ? (
              <Text style={{ color: COLORS.muted, fontSize: 13, textAlign: "center", paddingVertical: 8 }}>
                {query.trim() ? "Sin resultados." : "Escribe para buscar entre los usuarios registrados."}
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 260 }}>
                <View style={{ gap: 6 }}>
                  {results.map((u) => {
                    const isSoldToThis = existingSale?.buyer_user_id === u.id;
                    return (
                      <Pressable
                        key={u.id}
                        onPress={() => markSoldTo(u)}
                        disabled={marking}
                        style={({ pressed }) => ({
                          opacity: marking ? 0.6 : pressed ? 0.9 : 1,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: isSoldToThis ? COLORS.successBorder : COLORS.border,
                          backgroundColor: isSoldToThis ? COLORS.successBg : "#FFFFFF",
                          padding: 10,
                        })}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text numberOfLines={1} style={{ color: COLORS.text, fontWeight: "700", fontSize: 13 }}>
                            {u.full_name || u.username || "Sin nombre"}
                          </Text>
                          <Text numberOfLines={1} style={{ color: COLORS.muted, fontSize: 12 }}>
                            {u.email}
                          </Text>
                        </View>
                        {isSoldToThis ? (
                          <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </View>

          <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 4 }}>
            <ChipButton label="Cerrar" variant="ghost" onPress={onClose} isMobile={isMobile} />
          </View>
        </View>
      </View>
    </Modal>
  );
}