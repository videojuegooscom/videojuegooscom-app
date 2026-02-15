// app/catalogo.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "../lib/supabase";

const COLORS = {
  bg: "#071E33",
  bg2: "#061A2C",
  card: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.12)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.75)",
  accent: "#00AAE4",
  accent2: "rgba(0,170,228,0.16)",
  accentBorder: "rgba(0,170,228,0.45)",
  danger: "#FF3B30",
};

type UiFilter = "ALL" | "PUBLICADA" | "LISTA" | "REVISAR";
type UiStatus = "PUBLICADA" | "LISTA" | "REVISAR";
type DbStatus = "DRAFT" | "PUBLISHED" | "REVIEW";

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  sort_order: number;
};

type ProductRow = {
  id: string;
  title: string;
  description: string | null;
  price_eur: number | null;
  status: DbStatus;
  is_active: boolean;
  category_id: string | null;
  updated_at: string;
  created_at: string;
  category?: { id: string; name: string; slug: string } | null;
  image_url?: string | null; // opcional si existe
};

// ✅ Tipo real del resultado de la query con join alias "category:categories(...)"
type ProductDbRow = ProductRow & {
  category: { id: string; name: string; slug: string } | null;
};

type Product = {
  id: string;
  title: string;
  status: UiStatus;
  priceEUR: number;
  category?: { id: string; name: string; slug: string } | null;
};

function fmtEUR(n: number) {
  const safe = Number.isFinite(n) ? n : 0;
  return `${Math.round(safe)}€`;
}

function statusLabel(s: UiStatus) {
  if (s === "PUBLICADA") return "Publicada";
  if (s === "LISTA") return "Lista";
  return "Por revisar";
}

function statusColor(s: UiStatus) {
  if (s === "PUBLICADA") return "rgba(34,197,94,0.18)";
  if (s === "LISTA") return "rgba(242,194,0,0.18)";
  return "rgba(255,45,85,0.18)";
}

function statusBorder(s: UiStatus) {
  if (s === "PUBLICADA") return "rgba(34,197,94,0.35)";
  if (s === "LISTA") return "rgba(242,194,0,0.35)";
  return "rgba(255,45,85,0.35)";
}

function mapDbStatusToUi(s: DbStatus): UiStatus {
  if (s === "PUBLISHED") return "PUBLICADA";
  if (s === "DRAFT") return "LISTA";
  return "REVISAR";
}

/**
 * ✅ BACK “a prueba de balas”
 * - Si hay stack: back()
 * - Si entraste por URL directa/refresh: vuelve al Home "/"
 */
function smartBack() {
  try {
    if (typeof router.canGoBack === "function" && router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // no-op
  }
  router.replace("/");
}

/**
 * Si tu Home envía cat=c1/c2..., aquí lo mapeas a slugs reales.
 * Si ya envías slug/id real, puedes dejarlo vacío.
 */
const LEGACY_CAT_TO_SLUG: Record<string, string> = {};

/** Helper UI: título bonito si viene cat legacy */
function legacyCatLabel(raw?: string) {
  if (!raw) return undefined;
  const legacyMap: Record<string, string> = {
    c1: "Nintendo Switch",
    c2: "PlayStation 4",
    c3: "Xbox",
    c4: "PlayStation 5",
    c5: "Mantenimiento y Reparaciones",
    c6: "Electrónica y Electrodomésticos",
    k1: "Videojuegos Nintendo Switch",
    k2: "Videojuegos PlayStation 4",
    k3: "Videojuegos PlayStation 5",
    k4: "Accesorios y Mandos",
  };
  return legacyMap[raw];
}

function calcColumns(width: number) {
  if (width >= 1100) return 3;
  if (width >= 720) return 2;
  return 1;
}

function resolveCategory(rawCat: string | undefined, cats: CategoryRow[]) {
  if (!rawCat) return undefined;

  const mappedSlug = LEGACY_CAT_TO_SLUG[rawCat];
  if (mappedSlug) {
    const byMapped = cats.find((c) => c.slug === mappedSlug);
    if (byMapped) return byMapped;
  }

  const bySlug = cats.find((c) => c.slug === rawCat);
  if (bySlug) return bySlug;

  const byId = cats.find((c) => c.id === rawCat);
  if (byId) return byId;

  return undefined;
}

async function detectAdmin(): Promise<boolean> {
  try {
    const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) throw sessErr;

    const userId = sessionData.session?.user?.id;
    if (!userId) return false;

    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle<{ role: string | null }>();

    if (error) throw error;
    return (data?.role ?? "") === "admin";
  } catch {
    return false;
  }
}

export default function CatalogoScreen() {
  const { width } = useWindowDimensions();
  const cols = calcColumns(width);
  const isWide = width >= 900;

  const params = useLocalSearchParams<{ cat?: string; query?: string }>();
  const rawCat = typeof params.cat === "string" ? params.cat : undefined;
  const queryFromUrl = typeof params.query === "string" ? params.query.trim() : "";

  const [filter, setFilter] = useState<UiFilter>("ALL");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [items, setItems] = useState<Product[]>([]);

  // Search UI (local)
  const [q, setQ] = useState(queryFromUrl);

  const bootedRef = useRef(false);

  const effectiveFilter: UiFilter = useMemo(() => {
    return isAdmin ? filter : "PUBLICADA";
  }, [isAdmin, filter]);

  const pageTitle = useMemo(() => {
    if (!rawCat) return "Catálogo";
    const resolved = resolveCategory(rawCat, categories);
    if (resolved) return resolved.name;
    return legacyCatLabel(rawCat) ?? "Catálogo";
  }, [rawCat, categories]);

  const subtitle = useMemo(() => {
    return isAdmin
      ? "Vista admin (publicadas + en preparación)."
      : "Productos publicados (estado real).";
  }, [isAdmin]);

  const categoryChips = useMemo(() => {
    const base = [
      { id: "ALL", name: "Todas", slug: "all", is_active: true, sort_order: -999 } as CategoryRow,
    ];
    return base.concat(categories);
  }, [categories]);

  const activeCategoryId = useMemo(() => {
    if (!rawCat) return "ALL";
    const resolved = resolveCategory(rawCat, categories);
    if (resolved?.id) return resolved.id;
    const bySlug = categories.find((c) => c.slug === rawCat);
    if (bySlug) return bySlug.id;
    return "ALL";
  }, [rawCat, categories]);

  async function loadAll(opts?: { queryOverride?: string }) {
    const queryText = (opts?.queryOverride ?? q ?? "").trim();

    setErr(null);

    // 1) detectar admin
    const adminFlag = await detectAdmin();
    setIsAdmin(adminFlag);

    // 2) cargar categorías (admin: todas; público: activas)
    const catsQuery = supabase
      .from("categories")
      .select("id,name,slug,is_active,sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    const { data: catsData, error: catsErr } = await catsQuery;
    if (catsErr) throw catsErr;

    const cats = ((catsData ?? []) as unknown as CategoryRow[]).filter((c) =>
      adminFlag ? true : !!c.is_active
    );

    setCategories(cats);

    // 3) resolver categoría con LOS DATOS recién cargados (evita race condition)
    const resolvedCat = resolveCategory(rawCat, cats);

    // 4) cargar productos
    let prodQ = supabase
      .from("products")
      .select(
        "id,title,description,price_eur,status,is_active,category_id,updated_at,created_at,category:categories(id,name,slug)"
      )
      .order("updated_at", { ascending: false });

    // Público: solo activos + published
    if (!adminFlag) {
      prodQ = prodQ.eq("is_active", true).eq("status", "PUBLISHED");
    } else {
      // Admin: filtro por estado
      if (effectiveFilter !== "ALL") {
        const dbStatus: DbStatus =
          effectiveFilter === "PUBLICADA"
            ? "PUBLISHED"
            : effectiveFilter === "LISTA"
              ? "DRAFT"
              : "REVIEW";
        prodQ = prodQ.eq("status", dbStatus);
      }
    }

    // categoría
    if (resolvedCat?.id) {
      prodQ = prodQ.eq("category_id", resolvedCat.id);
    }

    // búsqueda (ilike en title/description)
    if (queryText) {
      const pattern = `%${queryText}%`;
      prodQ = prodQ.or(`title.ilike.${pattern},description.ilike.${pattern}`);
    }

    const { data: prodData, error: prodErr } = await prodQ;
    if (prodErr) throw prodErr;

    // ✅ FIX del rojo: cast seguro via unknown + tipo real ProductDbRow
    const rows = (Array.isArray(prodData) ? prodData : []) as unknown as ProductDbRow[];

    const mapped: Product[] = rows.map((p) => ({
      id: p.id,
      title: p.title,
      status: mapDbStatusToUi(p.status),
      priceEUR: Number(p.price_eur ?? 0),
      category: p.category ?? null,
    }));

    setItems(mapped);
  }

  async function bootstrap() {
    setLoading(true);
    try {
      await loadAll({ queryOverride: queryFromUrl });
    } catch (e: any) {
      setErr(e?.message ?? "Error cargando catálogo.");
      setItems([]);
      setCategories([]);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }

  async function refresh(opts?: { queryOverride?: string }) {
    setRefreshing(true);
    try {
      await loadAll(opts);
    } catch (e: any) {
      setErr(e?.message ?? "Error actualizando catálogo.");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si cambian params (cat/query) desde URL externa, sincroniza input y refresca
  useEffect(() => {
    setQ(queryFromUrl);
    if (!bootedRef.current) return;
    if (loading) return;
    refresh({ queryOverride: queryFromUrl });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawCat, queryFromUrl, effectiveFilter]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="light-content" />

      {/* HEADER */}
      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.06)",
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 12,
          gap: 10,
        }}
      >
        {/* Top row */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "900" }}>
              {pageTitle}
            </Text>
            <Text style={{ color: COLORS.muted, marginTop: 4 }}>{subtitle}</Text>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={() => router.push("/carrito")}
              style={({ pressed }) => ({
                opacity: pressed ? 0.88 : 1,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(0,170,228,0.35)",
                backgroundColor: "rgba(0,170,228,0.14)",
              })}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>🛒 Carrito</Text>
            </Pressable>

            <Pressable
              onPress={smartBack}
              style={({ pressed }) => ({
                opacity: pressed ? 0.88 : 1,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: "rgba(255,255,255,0.05)",
              })}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>←</Text>
            </Pressable>
          </View>
        </View>

        {/* Search */}
        <View
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            backgroundColor: "rgba(255,255,255,0.06)",
            paddingHorizontal: 12,
            paddingVertical: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Text style={{ color: "rgba(255,255,255,0.75)", fontWeight: "900" }}>🔎</Text>
          <TextInput
            value={q}
            onChangeText={(t) => setQ(t)}
            placeholder="Buscar por título o descripción…"
            placeholderTextColor="rgba(255,255,255,0.45)"
            style={{
              flex: 1,
              color: COLORS.text,
              fontWeight: "700",
              paddingVertical: 0,
            }}
            returnKeyType="search"
            onSubmitEditing={() => refresh()}
          />

          {q ? (
            <Pressable
              onPress={() => {
                setQ("");
                refresh({ queryOverride: "" });
              }}
              style={({ pressed }) => ({
                opacity: pressed ? 0.85 : 1,
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.14)",
                backgroundColor: "rgba(255,255,255,0.06)",
              })}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>Limpiar</Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => refresh()}
            disabled={refreshing}
            style={({ pressed }) => ({
              opacity: refreshing ? 0.55 : pressed ? 0.85 : 1,
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.14)",
              backgroundColor: "rgba(255,255,255,0.06)",
            })}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>
              {refreshing ? "..." : "↻"}
            </Text>
          </Pressable>
        </View>

        {/* Status chips */}
        {!isAdmin ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Chip active label="Publicadas" onPress={() => setFilter("PUBLICADA")} />
          </View>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Chip active={filter === "ALL"} label="Todos" onPress={() => setFilter("ALL")} />
            <Chip
              active={filter === "PUBLICADA"}
              label="Publicadas"
              onPress={() => setFilter("PUBLICADA")}
            />
            <Chip active={filter === "LISTA"} label="Listas" onPress={() => setFilter("LISTA")} />
            <Chip
              active={filter === "REVISAR"}
              label="Por revisar"
              onPress={() => setFilter("REVISAR")}
            />
          </View>
        )}

        {/* Category chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10 }}
        >
          {categoryChips.map((c) => {
            const isActive = c.id === "ALL" ? activeCategoryId === "ALL" : c.id === activeCategoryId;
            return (
              <Chip
                key={c.id}
                active={isActive}
                label={c.name}
                onPress={() => {
                  if (c.id === "ALL") {
                    router.replace({ pathname: "/catalogo" });
                  } else {
                    router.replace({ pathname: "/catalogo", params: { cat: c.slug } });
                  }
                }}
              />
            );
          })}
        </ScrollView>

        {err ? (
          <View
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "rgba(255,59,48,0.35)",
              backgroundColor: "rgba(255,59,48,0.12)",
              padding: 10,
            }}
          >
            <Text style={{ color: "#FCA5A5", fontWeight: "900" }}>Error</Text>
            <Text style={{ color: "#FEE2E2", marginTop: 4 }}>{err}</Text>
          </View>
        ) : null}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator />
          <Text style={{ color: COLORS.muted }}>Cargando catálogo…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28, gap: 12 }}>
          {/* Summary bar */}
          <View
            style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.card,
              padding: 14,
              flexDirection: isWide ? "row" : "column",
              justifyContent: "space-between",
              alignItems: isWide ? "center" : "flex-start",
              gap: 10,
            }}
          >
            <Text style={{ color: COLORS.muted }}>
              {items.length} producto{items.length === 1 ? "" : "s"} ·{" "}
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                {effectiveFilter === "ALL"
                  ? "Todos"
                  : effectiveFilter === "PUBLICADA"
                    ? "Publicadas"
                    : effectiveFilter === "LISTA"
                      ? "Listas"
                      : "Por revisar"}
              </Text>
              {q ? (
                <>
                  {" "}
                  · Buscando: <Text style={{ color: COLORS.text, fontWeight: "900" }}>{q}</Text>
                </>
              ) : null}
            </Text>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => router.push("/carrito")}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.88 : 1,
                  borderRadius: 999,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderWidth: 1,
                  borderColor: "rgba(0,170,228,0.35)",
                  backgroundColor: "rgba(0,170,228,0.14)",
                })}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Ir al carrito</Text>
              </Pressable>

              <Pressable
                onPress={() => router.push("/checkout")}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.88 : 1,
                  borderRadius: 999,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderWidth: 1,
                  borderColor: COLORS.accentBorder,
                  backgroundColor: COLORS.accent2,
                })}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Checkout</Text>
              </Pressable>
            </View>
          </View>

          {items.length === 0 ? (
            <View
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.card,
                padding: 16,
                gap: 8,
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
                No hay productos para mostrar.
              </Text>
              <Text style={{ color: COLORS.muted }}>
                Cambia de categoría, quita filtros o busca otra cosa.
              </Text>

              <Pressable
                onPress={() => {
                  setQ("");
                  router.replace({ pathname: "/catalogo" });
                  refresh({ queryOverride: "" });
                }}
                style={({ pressed }) => ({
                  marginTop: 8,
                  opacity: pressed ? 0.88 : 1,
                  borderRadius: 16,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderWidth: 1,
                  borderColor: COLORS.accentBorder,
                  backgroundColor: COLORS.accent2,
                  alignSelf: "flex-start",
                })}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Ver todo</Text>
              </Pressable>
            </View>
          ) : (
            <Grid columns={cols} gap={12}>
              {items.map((p) => (
                <ProductCard key={p.id} p={p} onPress={() => router.push(`/producto/${p.id}`)} />
              ))}
            </Grid>
          )}

          <View style={{ alignItems: "center", paddingTop: 18 }}>
            <Pressable
              onPress={smartBack}
              style={({ pressed }) => ({
                opacity: pressed ? 0.88 : 1,
                borderRadius: 999,
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: "rgba(255,255,255,0.06)",
              })}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>← Volver</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.88 : 1,
        borderRadius: 999,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: active ? COLORS.accentBorder : "rgba(255,255,255,0.14)",
        backgroundColor: active ? COLORS.accent2 : "rgba(255,255,255,0.06)",
      })}
    >
      <Text style={{ color: COLORS.text, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}

function Grid({
  columns,
  gap,
  children,
}: {
  columns: number;
  gap: number;
  children: React.ReactNode;
}) {
  const kids = React.Children.toArray(children);
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < kids.length; i += columns) {
    rows.push(kids.slice(i, i + columns));
  }

  return (
    <View style={{ gap }}>
      {rows.map((row, idx) => (
        <View key={idx} style={{ flexDirection: "row", gap }}>
          {row.map((child, j) => (
            <View key={j} style={{ flex: 1 }}>
              {child}
            </View>
          ))}
          {row.length < columns
            ? Array.from({ length: columns - row.length }).map((_, k) => (
                <View key={`pad-${k}`} style={{ flex: 1 }} />
              ))
            : null}
        </View>
      ))}
    </View>
  );
}

function ProductCard({ p, onPress }: { p: Product; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.92 : 1,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.card,
        padding: 14,
        gap: 10,
        minHeight: 140,
      })}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
        <Text
          style={{ color: COLORS.text, fontSize: 16, fontWeight: "900", flex: 1 }}
          numberOfLines={2}
        >
          {p.title}
        </Text>

        <Text style={{ color: COLORS.accent, fontSize: 16, fontWeight: "900" }}>
          {fmtEUR(p.priceEUR)}
        </Text>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <View
          style={{
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 999,
            backgroundColor: statusColor(p.status),
            borderWidth: 1,
            borderColor: statusBorder(p.status),
          }}
        >
          <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 12 }}>
            {statusLabel(p.status)}
          </Text>
        </View>

        {p.category?.name ? (
          <Text style={{ color: "rgba(255,255,255,0.70)", fontSize: 12 }}>
            {p.category.name}
          </Text>
        ) : (
          <Text style={{ color: "rgba(255,255,255,0.60)", fontSize: 12 }}>
            Segunda mano · Estado real
          </Text>
        )}
      </View>

      <Text style={{ color: "rgba(255,255,255,0.70)", fontSize: 12, marginTop: 2 }}>
        Ver detalles →
      </Text>
    </Pressable>
  );
}
