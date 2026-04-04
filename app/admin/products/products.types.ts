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
  kind: ProductMediaKind;
  storage_path: string;
  public_url: string;
  file_name: string | null;
  mime_type: string | null;
  sort_order: number;
  is_cover: boolean;
  duration_seconds: number | null;
  created_at?: string;
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
  is_featured_home?: boolean;
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