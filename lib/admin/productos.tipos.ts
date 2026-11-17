/**
 * Archivo: lib/admin/productos.tipos.ts
 * Función: tipos TypeScript compartidos de la administración de productos.
 * Para qué sirve: describe la forma de categorías, productos, media de producto, filtros y estados de formulario que van y vienen de Supabase y del editor de productos; no contiene lógica.
 * Conectado con: lib/admin/productos.utilidades.ts, lib/admin/productos.componentes.tsx, tablas categories, products y product_media.
 * Utilizado por: app/admin/products.tsx, app/admin/services.tsx, lib/admin/productos.utilidades.ts y lib/admin/productos.componentes.tsx.
 * Dependencias: ninguna externa.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: define los tipos TypeScript compartidos del módulo de
 * administración de productos (categorías, productos, media de producto,
 * filtros y estados de formulario). No contiene lógica ni estilos.
 *
 * Cómo funciona: son solo "types"/"type aliases" que describen la forma de
 * los datos que van y vienen de Supabase (tablas "categories", "products",
 * "product_media") y del formulario de edición de producto.
 *
 * Conectado con:
 * - app/admin/products.tsx → usa casi todos estos tipos para su estado.
 * - lib/admin/productos.componentes.tsx → usa ProductMediaRow,
 *   LocalPickedMedia y ProductMediaKind en MediaThumb.
 * - lib/admin/productos.utilidades.ts → usa varios de estos tipos en
 *   sus funciones auxiliares (fmtEUR, labelStatus, labelCond, etc.).
 */
export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
};

export type ProductStatus = "DRAFT" | "PUBLISHED" | "REVIEW";
export type ProductCondition = "NEW" | "LIKE_NEW" | "GOOD" | "FAIR" | "PARTS";
export type ProductMediaKind = "image" | "video";

export type ProductMediaRow = {
  id: string;
  product_id: string;

  // esquema híbrido actual
  kind?: ProductMediaKind | null;
  media_type?: ProductMediaKind | null;

  storage_path?: string | null;
  public_url?: string | null;
  file_name?: string | null;
  mime_type?: string | null;

  sort_order?: number | null;
  is_cover?: boolean | null;

  // esquema híbrido actual
  duration_seconds?: number | null;
  duration_sec?: number | null;

  created_at?: string | null;
};

export type ProductRow = {
  id: string;
  title: string;
  description: string | null;
  price_eur: number | null;
  status: ProductStatus;
  condition: ProductCondition;
  category_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  is_featured_home?: boolean | null;
  reference?: string | null;
  // Peso con embalaje, para el envío por kilos (migración 20261107120000). undefined = la columna aún no existe.
  peso_kg?: number | null;
  // El peso lo puso Claude como estimación (datos de fábrica + embalaje del dueño; migración 20261115160000) y el dueño
  // aún no lo ha revisado. undefined = sin la columna.
  peso_estimado?: boolean;
  // Solo entrega en mano: no se envía (televisores sin su caja original; migración 20261107140000). undefined = sin la columna.
  solo_entrega_mano?: boolean;
  // «Revisado por nuestro equipo» y meses de garantía (1-36), que marca el dueño (migración 20261114140000). undefined =
  // la columna aún no existe; garantia_meses null = sin indicar.
  revisado?: boolean;
  garantia_meses?: number | null;
  // Aviso a VeoAura de un producto creado a mano («producto_tienda», 2026-11-13; migración 20261113130000):
  // "pendiente" = aún sin respuesta de VeoAura, "enviado" = en VeoAura (ya devolvió su id). undefined = sin aviso.
  veoaura?: "pendiente" | "enviado";
  // Vendido (artículo único): cuándo y, si se vendió por la web, la referencia del pedido pagado (VZ-…; migración
  // 20261115200000_vendido_al_pagar). undefined = no está vendido.
  vendido?: { en: string; referencia: string | null };
  // Reservado con señal hasta esta fecha (products.reservado_hasta, migración 20261115150000; lo pone api/pago.ts al
  // cobrar la señal). undefined = sin reserva vigente o sin la columna.
  reservado_hasta?: string;
  // Unidad de alquiler (products.modo = 'alquiler', migración 20261117100000; fase 2 del alquiler): se gestiona en
  // Administración → Alquileres. undefined = de venta o sin la columna.
  alquiler?: boolean;
  media: ProductMediaRow[];
};

export type StatusFilter = "ALL" | ProductStatus;
export type VisibilityFilter = "ALL" | "VISIBLE" | "HIDDEN";

export type LocalPickedMedia = {
  id: string;
  kind: ProductMediaKind;
  file: File;
  name: string;
  mimeType: string;
  size: number;
  previewUrl: string;
  durationSeconds: number | null;

  // útil para saber si el archivo fue convertido en cliente
  originalName?: string | null;
  originalMimeType?: string | null;

  // por si luego quieres marcar portada antes de guardar
  isCoverCandidate?: boolean;
};

export type ProductFormState = {
  title: string;
  desc: string;
  price: string;
  status: ProductStatus;
  condition: ProductCondition;
  categoryId: string | null;
  isActive: boolean;
  isFeaturedHome: boolean;
};

export type ProductStats = {
  total: number;
  published: number;
  visible: number;
  featured: number;
};

export type ProductMediaCounts = {
  images: number;
  videos: number;
};