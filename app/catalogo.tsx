// app/catalogo.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
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
  gold: "#D8B04A",
  accent: "#00AAE4",
  yellow: "#F2C200",
  pill: "rgba(255,255,255,0.08)",
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
};

type Product = {
  id: string;
  title: string;
  status: UiStatus;
  priceEUR: number;
  category?: { id: string; name: string; slug: string } | null;
};

function fmtEUR(n: number) {
  return `${Math.round(n)}€`;
}

function statusLabel(s: UiStatus) {
  if (s === "PUBLICADA") return "Publicada";
  if (s === "LISTA") return "Lista para publicar";
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
 * Si tu Home sigue enviando cat=c1/c2..., aquí lo mapeas a slugs reales.
 * Si ya envías slug/id real, puedes dejarlo vacío.
 */
const LEGACY_CAT_TO_SLUG: Record<string, string> = {};

export default function CatalogoScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  const params = useLocalSearchParams<{ cat?: string; query?: string }>();
  const rawCat = typeof params.cat === "string" ? params.cat : undefined;
  const queryText = typeof params.query === "string" ? params.query.trim() : "";

  const [filter, setFilter] = useState<UiFilter>("ALL");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [items, setItems] = useState<Product[]>([]);

  const bootedRef = useRef(false);

  const resolvedCat = useMemo(() => {
    if (!rawCat) return undefined;

    const mappedSlug = LEGACY_CAT_TO_SLUG[rawCat];
    if (mappedSlug) {
      const byMapped = categories.find((c) => c.slug === mappedSlug);
      if (byMapped) return byMapped;
    }

    const bySlug = categories.find((c) => c.slug === rawCat);
    if (bySlug) return bySlug;

    const byId = categories.find((c) => c.id === rawCat);
    if (byId) return byId;

    return undefined;
  }, [rawCat, categories]);

  const title = useMemo(() => {
    if (!rawCat) return "Catálogo";
    if (resolvedCat) return `Catálogo · ${resolvedCat.name}`;

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

    return legacyMap[rawCat] ? `Catálogo · ${legacyMap[rawCat]}` : "Catálogo";
  }, [rawCat, resolvedCat]);

  const subtitle = useMemo(() => {
    return isAdmin
      ? "Vista admin (publicadas + en preparación)."
      : "Productos publicados (estado real).";
  }, [isAdmin]);

  const effectiveFilter: UiFilter = useMemo(() => {
    return isAdmin ? filter : "PUBLICADA";
  }, [isAdmin, filter]);

  async function detectAdmin(): Promise<boolean> {
    try {
      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;

      const userId = sessionData.session?.user?.id;

      if (!userId) {
        setIsAdmin(false);
        return false;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle<{ role: string | null }>();

      if (error) throw error;

      const ok = (data?.role ?? "") === "admin";
      setIsAdmin(ok);
      return ok;
    } catch {
      setIsAdmin(false);
      return false;
    }
  }

  async function loadCategories() {
    const q = supabase
      .from("categories")
      .select("id,name,slug,is_active,sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    const { data, error } = await q.returns<CategoryRow[]>();
    if (error) throw error;

    const onlyActive = (data ?? []).filter((c) => c.is_active);
    setCategories(onlyActive);
  }

  async function loadProducts(adminFlag: boolean) {
    let q = supabase
      .from("products")
      .select(
        "id,title,description,price_eur,status,is_active,category_id,updated_at,created_at,category:categories(id,name,slug)"
      )
      .order("updated_at", { ascending: false });

    if (!adminFlag) {
      q = q.eq("is_active", true).eq("status", "PUBLISHED");
    } else {
      if (effectiveFilter !== "ALL") {
        const dbStatus: DbStatus =
          effectiveFilter === "PUBLICADA"
            ? "PUBLISHED"
            : effectiveFilter === "LISTA"
              ? "DRAFT"
              : "REVIEW";
        q = q.eq("status", dbStatus);
      }
    }

    if (resolvedCat?.id) {
      q = q.eq("category_id", resolvedCat.id);
    }

    if (queryText) {
      const pattern = `%${queryText}%`;
      q = q.or(`title.ilike.${pattern},description.ilike.${pattern}`);
    }

    const { data, error } = await q.returns<ProductRow[]>();
    if (error) throw error;

    const rows: ProductRow[] = Array.isArray(data) ? data : [];

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
    setErr(null);
    setLoading(true);
    try {
      const adminFlag = await detectAdmin();
      await loadCategories();
      await loadProducts(adminFlag);
    } catch (e: any) {
      setErr(e?.message ?? "Error cargando catálogo.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    setErr(null);
    try {
      const adminFlag = await detectAdmin();
      await loadCategories();
      await loadProducts(adminFlag);
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

  useEffect(() => {
    if (!bootedRef.current) return;
    if (loading) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawCat, queryText, effectiveFilter, resolvedCat?.id]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="light-content" />

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
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "900" }}>
              {title}
            </Text>
            <Text style={{ color: COLORS.muted, marginTop: 4 }}>{subtitle}</Text>

            {queryText ? (
              <Text
                style={{
                  color: "rgba(255,255,255,0.60)",
                  marginTop: 6,
                  fontSize: 12,
                }}
              >
                Buscando:{" "}
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                  {queryText}
                </Text>
              </Text>
            ) : null}
          </View>

          <Pressable
            onPress={smartBack}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: "rgba(255,255,255,0.05)",
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "800" }}>← Volver</Text>
          </Pressable>
        </View>

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
            <Text style={{ color: "#FCA5A5", fontWeight: "900" }}>Error:</Text>
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
          <Pressable
            onPress={refresh}
            disabled={refreshing}
            style={{
              alignSelf: "flex-end",
              borderRadius: 999,
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: "rgba(255,255,255,0.06)",
              opacity: refreshing ? 0.6 : 1,
            }}
          >
            <Text style={{ color: COLORS.text, fontWeight: "900" }}>
              {refreshing ? "Actualizando..." : "↻ Actualizar"}
            </Text>
          </Pressable>

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
                Prueba a cambiar de categoría, quitar filtros o buscar otra cosa.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {items.map((p) => (
                <View
                  key={p.id}
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
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: "900" }}>
                      {p.title}
                    </Text>

                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        marginTop: 10,
                        flexWrap: "wrap",
                      }}
                    >
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

                      <Text style={{ color: COLORS.muted, fontSize: 12 }}>
                        Segunda mano · Estado real
                      </Text>

                      {p.category?.name ? (
                        <Text style={{ color: "rgba(255,255,255,0.60)", fontSize: 12 }}>
                          · {p.category.name}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <Text style={{ color: COLORS.accent, fontSize: 18, fontWeight: "900" }}>
                    {fmtEUR(p.priceEUR)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={{ alignItems: "center", paddingTop: 18 }}>
            <Pressable
              onPress={smartBack}
              style={{
                borderRadius: 999,
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: "rgba(255,255,255,0.06)",
              }}
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
      style={{
        borderRadius: 999,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: active ? "rgba(0,170,228,0.45)" : "rgba(255,255,255,0.14)",
        backgroundColor: active ? "rgba(0,170,228,0.16)" : "rgba(255,255,255,0.06)",
      }}
    >
      <Text style={{ color: COLORS.text, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}
