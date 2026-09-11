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
 * - Si la columna "images" no existe (variante de esquema ya contemplada en
 *   otras pantallas, p. ej. app/(tabs)/index.tsx), reintenta sin ella en vez
 *   de fallar. Si aun así no hay productos, o cualquier paso falla, no se
 *   pinta nada (return null) — es un añadido opcional, nunca debe mostrarle
 *   un error al cliente ni dejar un hueco raro en la pantalla.
 * - Cada tarjeta abre la ficha del producto (app/producto/[id].tsx).
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase (tablas categories, products).
 * - components/SmartImage.tsx → foto de cada tarjeta.
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

type ShelfProduct = {
  id: string;
  title: string;
  priceEUR: number;
  image: string | null;
};

function fmtEUR(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  return `${Math.round(safe)}€`;
}

function asShelfProduct(row: unknown): ShelfProduct | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;

  const id = String(r.id ?? "").trim();
  const title = String(r.title ?? "").trim();
  if (!id || !title) return null;

  const images = Array.isArray(r.images) ? r.images : [];
  const image =
    (images.find((v): v is string => typeof v === "string" && !!v.trim()) as
      | string
      | undefined) ?? null;

  return {
    id,
    title,
    priceEUR: Number(r.price_eur ?? 0),
    image,
  };
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
        return data
          .map(asShelfProduct)
          .filter((p): p is ShelfProduct => p !== null);
      }
    }

    return [];
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
      <View>
        <Text style={{ color: COLORS.text, fontSize: 17, fontWeight: "900" }}>
          También te puede interesar
        </Text>
        <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 19 }}>
          Novedades en PlayStation 5 y Xbox.
        </Text>
      </View>

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
              width: 140,
              borderRadius: 16,
              backgroundColor: COLORS.tile,
              padding: 10,
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <View
              style={{
                width: "100%",
                height: 100,
                borderRadius: 12,
                overflow: "hidden",
                backgroundColor: "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {p.image ? (
                <SmartImage uri={p.image} contentFit="cover" style={{ width: "100%", height: "100%" }} />
              ) : (
                <Ionicons name="game-controller-outline" size={28} color={COLORS.muted} />
              )}
            </View>

            <Text
              numberOfLines={2}
              style={{ color: COLORS.text, fontWeight: "800", fontSize: 12.5, marginTop: 8, lineHeight: 16 }}
            >
              {p.title}
            </Text>

            <Text style={{ color: COLORS.accent, fontWeight: "900", fontSize: 14, marginTop: 4 }}>
              {fmtEUR(p.priceEUR)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
