// components/CategoryProductsShelf.tsx
/**
 * Qué hace: fila horizontal de productos de PlayStation 5 y Xbox ("También
 * te puede interesar"). Daniel pidió mostrar productos de esas categorías en
 * Perfil y Cesta para que esas pantallas no se vean tan vacías por debajo de
 * su propio contenido (formulario de cuenta / resumen del pedido).
 *
 * Cómo funciona:
 * - Primero resuelve los ids de las categorías con slug "playstation-5" y
 *   "xbox" (tabla categories), luego trae hasta 12 productos activos y
 *   publicados de esas categorías, los más recientes primero.
 * - La foto de portada de cada producto NO vive en products.images (ese
 *   campo suele estar vacío/heredado) sino en la tabla product_media, igual
 *   que en app/catalogo.tsx y app/(tabs)/index.tsx: se hace una segunda
 *   consulta por lotes (todos los ids de producto a la vez) a product_media
 *   y se elige, por producto, la foto marcada is_cover, o si no hay ninguna
 *   marcada, la de menor sort_order; products.images queda solo como último
 *   recurso si ese producto no tiene ninguna fila en product_media. La
 *   primera versión de este componente solo miraba products.images, por eso
 *   no se veía ninguna miniatura ni se encendía la barra de carga.
 * - Si algún paso falla (columna que no existe, tabla vacía...), se sigue
 *   sin esa parte en vez de romper; si al final no hay productos, no se
 *   pinta nada (return null) — es un añadido opcional, nunca debe mostrarle
 *   un error al cliente ni dejar un hueco raro en la pantalla.
 * - Cada tarjeta abre la ficha del producto (app/producto/[id].tsx).
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase (tablas categories, products,
 *   product_media).
 * - components/SmartImage.tsx → foto de cada tarjeta (y quien enciende la
 *   barra de carga global, components/lineapensadoraefectosiri.tsx,
 *   mientras esa foto concreta está descargándose).
 * - app/producto/[id].tsx → destino de cada tarjeta.
 * - app/(tabs)/perfil.tsx, app/(tabs)/cesta.tsx → pantallas que lo montan.
 */
import { Ionicons } from "@expo/vector-icons";
import type { Href } from "expo-router";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import SmartImage from "./SmartImage";
import { supabase } from "../lib/supabase";

const COLORS = {
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  accent: "#1EA7E8",
  tile: "#F6FAFD",
};

const SHELF_CATEGORY_SLUGS = ["playstation-5", "xbox"];

type ShelfProductRow = {
  id: string;
  title: string;
  priceEUR: number;
  fallbackImage: string | null;
};

type ShelfProduct = {
  id: string;
  title: string;
  priceEUR: number;
  image: string | null;
};

type ProductMediaKind = "image" | "video";

type ProductMediaRow = {
  product_id: string;
  kind?: ProductMediaKind | string | null;
  public_url?: string | null;
  sort_order?: number | null;
  is_cover?: boolean | null;
};

function fmtEUR(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  return `${Math.round(safe)}€`;
}

function normalizeMediaKind(value: unknown): ProductMediaKind | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "image") return "image";
  if (v === "video") return "video";
  return null;
}

function sortMediaRows(a: ProductMediaRow, b: ProductMediaRow) {
  const aCover = Boolean(a.is_cover);
  const bCover = Boolean(b.is_cover);
  if (aCover && !bCover) return -1;
  if (!aCover && bCover) return 1;

  const aOrder = Number.isFinite(Number(a.sort_order)) ? Number(a.sort_order) : 99999;
  const bOrder = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 99999;
  return aOrder - bOrder;
}

function asShelfProductRow(row: unknown): ShelfProductRow | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;

  const id = String(r.id ?? "").trim();
  const title = String(r.title ?? "").trim();
  if (!id || !title) return null;

  const images = Array.isArray(r.images) ? r.images : [];
  const fallbackImage =
    (images.find((v): v is string => typeof v === "string" && !!v.trim()) as
      | string
      | undefined) ?? null;

  return {
    id,
    title,
    priceEUR: Number(r.price_eur ?? 0),
    fallbackImage,
  };
}

async function fetchProductRowsSafe(catIds: string[]): Promise<ShelfProductRow[]> {
  const selects = ["id,title,price_eur,images,category_id", "id,title,price_eur,category_id"];

  for (const selectStr of selects) {
    const { data, error } = await supabase
      .from("products")
      .select(selectStr)
      .in("category_id", catIds)
      .eq("is_active", true)
      .eq("status", "PUBLISHED")
      .order("updated_at", { ascending: false })
      .limit(12);

    if (!error && Array.isArray(data)) {
      return data.map(asShelfProductRow).filter((p): p is ShelfProductRow => p !== null);
    }
  }

  return [];
}

// Trae, en una sola consulta por lotes, las fotos de product_media de TODOS
// los productos a la vez (nunca una consulta por tarjeta), y devuelve un
// mapa productId → mejor foto de portada (is_cover primero, luego la de
// menor sort_order). Si la tabla no existe o falla, devuelve un mapa vacío
// y cada producto usa su fallbackImage (products.images) si tiene una.
async function fetchCoverImageMapSafe(productIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (productIds.length === 0) return map;

  try {
    const { data, error } = await supabase
      .from("product_media")
      .select("product_id,kind,public_url,sort_order,is_cover")
      .in("product_id", productIds)
      .limit(2000);

    if (error || !Array.isArray(data)) return map;

    const byProduct = new Map<string, ProductMediaRow[]>();
    for (const row of data as ProductMediaRow[]) {
      if (!row?.product_id) continue;
      if (normalizeMediaKind(row.kind) !== "image") continue;
      if (typeof row.public_url !== "string" || !row.public_url.trim()) continue;

      const list = byProduct.get(row.product_id) ?? [];
      list.push(row);
      byProduct.set(row.product_id, list);
    }

    for (const [productId, rows] of byProduct.entries()) {
      const sorted = [...rows].sort(sortMediaRows);
      const best = sorted[0];
      if (best?.public_url) map.set(productId, best.public_url.trim());
    }

    return map;
  } catch {
    return map;
  }
}

async function fetchShelfProductsSafe(): Promise<ShelfProduct[]> {
  try {
    const { data: cats, error: catsErr } = await supabase
      .from("categories")
      .select("id,slug")
      .in("slug", SHELF_CATEGORY_SLUGS);

    if (catsErr || !Array.isArray(cats) || cats.length === 0) return [];

    const catIds = (cats as Array<{ id: string }>).map((c) => c.id).filter(Boolean);
    if (catIds.length === 0) return [];

    const rows = await fetchProductRowsSafe(catIds);
    if (rows.length === 0) return [];

    const coverMap = await fetchCoverImageMapSafe(rows.map((r) => r.id));

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      priceEUR: r.priceEUR,
      image: coverMap.get(r.id) ?? r.fallbackImage,
    }));
  } catch {
    return [];
  }
}

export default function CategoryProductsShelf() {
  const [products, setProducts] = useState<ShelfProduct[] | null>(null);

  useEffect(() => {
    let alive = true;

    fetchShelfProductsSafe().then((rows) => {
      if (alive) setProducts(rows);
    });

    return () => {
      alive = false;
    };
  }, []);

  // Mientras carga, o si no hay nada que mostrar, no se pinta nada: es un
  // añadido opcional, nunca debe dejar un hueco de "cargando" a la vista.
  if (!products || products.length === 0) return null;

  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: COLORS.text, fontSize: 17, fontWeight: "900", textAlign: "center" }}>
        También te puede interesar
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingRight: 4 }}
      >
        {products.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => router.push(`/producto/${p.id}` as Href)}
            style={({ pressed }) => ({
              width: 156,
              borderRadius: 16,
              backgroundColor: COLORS.tile,
              padding: 10,
              alignItems: "center",
              opacity: pressed ? 0.9 : 1,
            })}
          >
            {/* contentFit="contain" (no "cover") a propósito: aquí interesa
                ver la foto entera del producto, sin recortarla para rellenar
                el hueco — aunque eso deje una pequeña banda blanca a los
                lados si la foto no es cuadrada. */}
            <View
              style={{
                width: "100%",
                height: 108,
                borderRadius: 12,
                overflow: "hidden",
                backgroundColor: "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {p.image ? (
                <SmartImage uri={p.image} contentFit="contain" style={{ width: "100%", height: "100%" }} />
              ) : (
                <Ionicons name="game-controller-outline" size={28} color={COLORS.muted} />
              )}
            </View>

            {/* Sin numberOfLines a propósito: el título se ve completo,
                aunque ocupe dos o tres líneas, en vez de cortarse con "...". */}
            <Text
              style={{
                color: COLORS.text,
                fontWeight: "800",
                fontSize: 12.5,
                marginTop: 8,
                lineHeight: 16,
                textAlign: "center",
              }}
            >
              {p.title}
            </Text>

            <Text
              style={{
                color: COLORS.accent,
                fontWeight: "900",
                fontSize: 14,
                marginTop: 4,
                textAlign: "center",
              }}
            >
              {fmtEUR(p.priceEUR)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
