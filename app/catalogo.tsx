// app/catalogo.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
  bg3: "#082743",
  card: "rgba(255,255,255,0.06)",
  cardStrong: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.12)",
  borderSoft: "rgba(255,255,255,0.08)",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.76)",
  muted2: "rgba(255,255,255,0.58)",
  accent: "#00AAE4",
  accent2: "rgba(0,170,228,0.16)",
  accent3: "rgba(0,170,228,0.22)",
  accentBorder: "rgba(0,170,228,0.45)",
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

type ProductBaseRow = {
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

type ProductDbRow = ProductBaseRow & {
  images?: string[] | null;
  image_url?: string | null;
  category: { id: string; name: string; slug: string } | null;
};

type Product = {
  id: string;
  title: string;
  description: string | null;
  status: UiStatus;
  priceEUR: number;
  imageUrl: string | null;
  category?: { id: string; name: string; slug: string } | null;
};

function fmtEUR(n: number) {
  const safe = Number.isFinite(n) ? n : 0;
  return `${Math.round(safe)}€`;
}

function mapDbStatusToUi(s: DbStatus): UiStatus {
  if (s === "PUBLISHED") return "PUBLICADA";
  if (s === "DRAFT") return "LISTA";
  return "REVISAR";
}

function publicStatusLabel(s: UiStatus) {
  if (s === "PUBLICADA") return "Disponible";
  if (s === "LISTA") return "Preparación";
  return "Revisión";
}

function adminStatusLabel(s: UiStatus) {
  if (s === "PUBLICADA") return "Publicada";
  if (s === "LISTA") return "Lista";
  return "Por revisar";
}

function statusBg(s: UiStatus) {
  if (s === "PUBLICADA") return "rgba(34,197,94,0.18)";
  if (s === "LISTA") return "rgba(242,194,0,0.18)";
  return "rgba(255,45,85,0.18)";
}

function statusBorder(s: UiStatus) {
  if (s === "PUBLICADA") return "rgba(34,197,94,0.35)";
  if (s === "LISTA") return "rgba(242,194,0,0.35)";
  return "rgba(255,45,85,0.35)";
}

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

const LEGACY_CAT_TO_SLUG: Record<string, string> = {};

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
  if (width >= 1320) return 4;
  if (width >= 980) return 3;
  if (width >= 680) return 2;
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

function getCategoryHint(name?: string) {
  if (!name) return "Segunda mano revisada";
  const n = name.toLowerCase();

  if (n.includes("playstation 5") || n.includes("ps5")) return "Consolas y packs PS5";
  if (n.includes("playstation 4") || n.includes("ps4")) return "Consolas y accesorios PS4";
  if (n.includes("xbox")) return "Xbox y accesorios";
  if (n.includes("switch") || n.includes("nintendo")) return "Nintendo y accesorios";
  if (n.includes("videojuego")) return "Juegos listos para enviar";
  if (n.includes("mando") || n.includes("accesorio")) return "Accesorios y periféricos";
  if (n.includes("repar")) return "Servicio y mantenimiento";
  if (n.includes("electr")) return "Electrónica seleccionada";

  return "Producto revisado";
}

function firstImageFromAnyRow(row: any): string | null {
  const imgs = row?.images;

  if (Array.isArray(imgs) && imgs.length > 0) {
    const first = imgs.find((v: unknown) => typeof v === "string" && v.trim());
    if (typeof first === "string" && first.trim()) return first.trim();
  }

  const url = row?.image_url;
  if (typeof url === "string" && url.trim()) return url.trim();

  return null;
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
  const isWide = width >= 980;
  const isTablet = width >= 720;

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

  const [q, setQ] = useState(queryFromUrl);

  const bootedRef = useRef(false);
  const reqSeqRef = useRef(0);

  const effectiveFilter: UiFilter = useMemo(() => {
    return isAdmin ? filter : "PUBLICADA";
  }, [isAdmin, filter]);

  const resolvedCategory = useMemo(() => {
    return resolveCategory(rawCat, categories);
  }, [rawCat, categories]);

  const pageTitle = useMemo(() => {
    if (!rawCat) return "Catálogo";
    if (resolvedCategory?.name) return resolvedCategory.name;
    return legacyCatLabel(rawCat) ?? "Catálogo";
  }, [rawCat, resolvedCategory]);

  const pageSubtitle = useMemo(() => {
    if (isAdmin) return "Gestión visual del catálogo y revisión de estado.";
    if (resolvedCategory?.name) {
      return `${getCategoryHint(resolvedCategory.name)} · Envíos a toda España`;
    }
    return "Consolas, videojuegos y electrónica revisada lista para vender";
  }, [isAdmin, resolvedCategory]);

  const categoryChips = useMemo(() => {
    const base = [
      { id: "ALL", name: "Todo", slug: "all", is_active: true, sort_order: -999 } as CategoryRow,
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

  const heroStats = useMemo(() => {
    const total = items.length;
    const withPrice = items.filter((p) => p.priceEUR > 0).length;
    const categoryCount = categories.length;
    return { total, withPrice, categoryCount };
  }, [items, categories]);

  async function fetchProductsSafe(
    adminFlag: boolean,
    queryText: string,
    resolvedCat?: CategoryRow
  ): Promise<ProductDbRow[]> {
    const baseSelect =
      "id,title,description,price_eur,status,is_active,category_id,updated_at,created_at,category:categories(id,name,slug)";
    const selectWithImages =
      "id,title,description,price_eur,status,is_active,category_id,images,updated_at,created_at,category:categories(id,name,slug)";
    const selectWithImagesAndUrl =
      "id,title,description,price_eur,status,is_active,category_id,images,image_url,updated_at,created_at,category:categories(id,name,slug)";

    const buildQuery = (selectStr: string) => {
      let q = supabase.from("products").select(selectStr).order("updated_at", { ascending: false });

      if (!adminFlag) {
        q = q.eq("is_active", true).eq("status", "PUBLISHED");
      } else if (effectiveFilter !== "ALL") {
        const dbStatus: DbStatus =
          effectiveFilter === "PUBLICADA"
            ? "PUBLISHED"
            : effectiveFilter === "LISTA"
              ? "DRAFT"
              : "REVIEW";
        q = q.eq("status", dbStatus);
      }

      if (resolvedCat?.id) {
        q = q.eq("category_id", resolvedCat.id);
      }

      if (queryText) {
        const pattern = `%${queryText}%`;
        q = q.or(`title.ilike.${pattern},description.ilike.${pattern}`);
      }

      return q;
    };

    const res1 = await buildQuery(selectWithImagesAndUrl);
    if (!res1.error) {
      return (Array.isArray(res1.data) ? res1.data : []) as unknown as ProductDbRow[];
    }

    const msg1 = String(res1.error.message ?? "").toLowerCase();
    const missingImageUrl =
      msg1.includes("image_url") &&
      (msg1.includes("does not exist") || msg1.includes("schema cache") || msg1.includes("column"));

    if (!missingImageUrl) {
      throw res1.error;
    }

    const res2 = await buildQuery(selectWithImages);
    if (!res2.error) {
      return (Array.isArray(res2.data) ? res2.data : []) as unknown as ProductDbRow[];
    }

    const msg2 = String(res2.error.message ?? "").toLowerCase();
    const missingImages =
      msg2.includes("images") &&
      (msg2.includes("does not exist") || msg2.includes("schema cache") || msg2.includes("column"));

    if (!missingImages) {
      throw res2.error;
    }

    const res3 = await buildQuery(baseSelect);
    if (res3.error) throw res3.error;

    return (Array.isArray(res3.data) ? res3.data : []) as unknown as ProductDbRow[];
  }

  async function loadAll(opts?: { queryOverride?: string }) {
    const seq = ++reqSeqRef.current;
    const queryText = (opts?.queryOverride ?? q ?? "").trim();

    setErr(null);

    const adminFlag = await detectAdmin();
    if (seq !== reqSeqRef.current) return;
    setIsAdmin(adminFlag);

    const catsQuery = supabase
      .from("categories")
      .select("id,name,slug,is_active,sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    const { data: catsData, error: catsErr } = await catsQuery;
    if (catsErr) throw catsErr;
    if (seq !== reqSeqRef.current) return;

    const cats = ((catsData ?? []) as unknown as CategoryRow[]).filter((c) =>
      adminFlag ? true : !!c.is_active
    );

    setCategories(cats);

    const resolvedCat = resolveCategory(rawCat, cats);
    const rows = await fetchProductsSafe(adminFlag, queryText, resolvedCat);
    if (seq !== reqSeqRef.current) return;

    const mapped: Product[] = rows.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description ?? null,
      status: mapDbStatusToUi(p.status),
      priceEUR: Number(p.price_eur ?? 0),
      imageUrl: firstImageFromAnyRow(p),
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

      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            backgroundColor: COLORS.bg2,
            borderBottomWidth: 1,
            borderBottomColor: "rgba(255,255,255,0.06)",
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 18,
            gap: 14,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: COLORS.text,
                  fontSize: 28,
                  fontWeight: "900",
                  letterSpacing: -0.5,
                }}
              >
                {pageTitle}
              </Text>

              <Text
                style={{
                  color: COLORS.muted,
                  marginTop: 6,
                  fontSize: 14,
                  lineHeight: 20,
                  maxWidth: 760,
                }}
              >
                {pageSubtitle}
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => router.push("/carrito")}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.88 : 1,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: COLORS.accentBorder,
                  backgroundColor: COLORS.accent2,
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

          {!isAdmin ? (
            <View
              style={{
                borderRadius: 22,
                borderWidth: 1,
                borderColor: COLORS.borderSoft,
                backgroundColor: "rgba(255,255,255,0.04)",
                padding: 16,
                gap: 14,
              }}
            >
              <View
                style={{
                  flexDirection: isWide ? "row" : "column",
                  justifyContent: "space-between",
                  alignItems: isWide ? "center" : "flex-start",
                  gap: 14,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: COLORS.text,
                      fontSize: 20,
                      fontWeight: "900",
                      lineHeight: 26,
                    }}
                  >
                    Encuentra consolas, videojuegos y accesorios con aspecto de tienda seria.
                  </Text>
                  <Text
                    style={{
                      color: COLORS.muted,
                      marginTop: 8,
                      lineHeight: 20,
                    }}
                  >
                    Catálogo claro, contacto directo y productos publicados con enfoque real de venta.
                  </Text>
                </View>

                <View
                  style={{
                    flexDirection: isTablet ? "row" : "column",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <TrustPill label="Productos revisados" />
                  <TrustPill label="Envíos en España" />
                  <TrustPill label="Atención por WhatsApp" />
                </View>
              </View>

              <View
                style={{
                  flexDirection: isWide ? "row" : "column",
                  gap: 10,
                }}
              >
                <MetricCard
                  title="Productos visibles"
                  value={`${heroStats.total}`}
                  subtitle="Inventario mostrado"
                />
                <MetricCard
                  title="Categorías"
                  value={`${heroStats.categoryCount}`}
                  subtitle="Acceso rápido"
                />
                <MetricCard
                  title="Con precio"
                  value={`${heroStats.withPrice}`}
                  subtitle="Listos para decidir"
                />
              </View>
            </View>
          ) : (
            <View
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: COLORS.accentBorder,
                backgroundColor: COLORS.accent2,
                padding: 14,
                gap: 8,
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
                Vista admin
              </Text>
              <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                Aquí sí tiene sentido ver estados internos. En público solo se debe sentir tienda,
                no panel.
              </Text>
            </View>
          )}

          <View
            style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.card,
              paddingHorizontal: 12,
              paddingVertical: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Text style={{ color: COLORS.muted, fontWeight: "900", fontSize: 16 }}>🔎</Text>

            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Buscar consola, videojuego, accesorio..."
              placeholderTextColor="rgba(255,255,255,0.42)"
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
                  paddingVertical: 7,
                  paddingHorizontal: 11,
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
                paddingVertical: 7,
                paddingHorizontal: 11,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: COLORS.accentBorder,
                backgroundColor: COLORS.accent2,
              })}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                {refreshing ? "..." : "Buscar"}
              </Text>
            </Pressable>
          </View>

          {isAdmin ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <Chip active={filter === "ALL"} label="Todos" onPress={() => setFilter("ALL")} />
              <Chip
                active={filter === "PUBLICADA"}
                label="Publicadas"
                onPress={() => setFilter("PUBLICADA")}
              />
              <Chip
                active={filter === "LISTA"}
                label="Listas"
                onPress={() => setFilter("LISTA")}
              />
              <Chip
                active={filter === "REVISAR"}
                label="Por revisar"
                onPress={() => setFilter("REVISAR")}
              />
            </View>
          ) : null}

          <View style={{ gap: 8 }}>
            <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: 13 }}>
              Explorar por categoría
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10 }}
            >
              {categoryChips.map((c) => {
                const active =
                  c.id === "ALL" ? activeCategoryId === "ALL" : c.id === activeCategoryId;

                return (
                  <Chip
                    key={c.id}
                    active={active}
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
          </View>

          {err ? (
            <View
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(255,59,48,0.35)",
                backgroundColor: "rgba(255,59,48,0.12)",
                padding: 12,
              }}
            >
              <Text style={{ color: "#FCA5A5", fontWeight: "900" }}>Error cargando catálogo</Text>
              <Text style={{ color: "#FEE2E2", marginTop: 4, lineHeight: 20 }}>{err}</Text>
            </View>
          ) : null}
        </View>

        {loading ? (
          <View
            style={{
              minHeight: 360,
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              paddingHorizontal: 16,
            }}
          >
            <ActivityIndicator />
            <Text style={{ color: COLORS.muted }}>Cargando catálogo…</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 14 }}>
            <View
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.cardStrong,
                padding: 14,
                gap: 12,
              }}
            >
              <View
                style={{
                  flexDirection: isWide ? "row" : "column",
                  justifyContent: "space-between",
                  alignItems: isWide ? "center" : "flex-start",
                  gap: 10,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>
                    {items.length} producto{items.length === 1 ? "" : "s"} encontrado
                    {items.length === 1 ? "" : "s"}
                  </Text>

                  <Text style={{ color: COLORS.muted, marginTop: 4, lineHeight: 20 }}>
                    {!isAdmin ? "Catálogo público" : "Vista interna"} ·{" "}
                    {effectiveFilter === "ALL"
                      ? "Todos"
                      : effectiveFilter === "PUBLICADA"
                        ? isAdmin
                          ? "Publicadas"
                          : "Disponibles"
                        : effectiveFilter === "LISTA"
                          ? "Listas"
                          : "Por revisar"}
                    {q ? (
                      <>
                        {" "}
                        · Búsqueda: <Text style={{ color: COLORS.text, fontWeight: "900" }}>{q}</Text>
                      </>
                    ) : null}
                  </Text>
                </View>

                <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                  <Pressable
                    onPress={() => router.push("/carrito")}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.88 : 1,
                      borderRadius: 999,
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      backgroundColor: "rgba(255,255,255,0.06)",
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
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>Finalizar compra</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {items.length === 0 ? (
              <View
                style={{
                  borderRadius: 22,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.card,
                  padding: 18,
                  gap: 12,
                }}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 20 }}>
                  Ahora mismo no hay productos para esta vista.
                </Text>

                <Text style={{ color: COLORS.muted, lineHeight: 21 }}>
                  Quita filtros, cambia de categoría o vuelve al catálogo general para ver todo lo
                  disponible. Si esta pantalla la ve un cliente, el problema no es el diseño: es que
                  faltan productos publicados y activos.
                </Text>

                <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                  <Pressable
                    onPress={() => {
                      setQ("");
                      router.replace({ pathname: "/catalogo" });
                      refresh({ queryOverride: "" });
                    }}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.88 : 1,
                      borderRadius: 16,
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      borderWidth: 1,
                      borderColor: COLORS.accentBorder,
                      backgroundColor: COLORS.accent2,
                    })}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>Ver todo</Text>
                  </Pressable>

                  <Pressable
                    onPress={smartBack}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.88 : 1,
                      borderRadius: 16,
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      backgroundColor: "rgba(255,255,255,0.06)",
                    })}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "900" }}>Volver</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Grid columns={cols} gap={14}>
                {items.map((p) => (
                  <ProductCard
                    key={p.id}
                    p={p}
                    isAdmin={isAdmin}
                    onPress={() => router.push(`/producto/${p.id}`)}
                  />
                ))}
              </Grid>
            )}

            {!loading && items.length > 0 && !isAdmin ? (
              <View
                style={{
                  borderRadius: 22,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.card,
                  padding: 16,
                  gap: 10,
                }}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 18 }}>
                  ¿No encuentras exactamente lo que buscas?
                </Text>
                <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                  Escríbenos por WhatsApp y te decimos rápido si podemos conseguirlo, reservarlo o
                  proponerte una alternativa.
                </Text>

                <Pressable
                  onPress={() => router.push("/checkout")}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.88 : 1,
                    alignSelf: "flex-start",
                    borderRadius: 999,
                    paddingVertical: 11,
                    paddingHorizontal: 14,
                    borderWidth: 1,
                    borderColor: COLORS.accentBorder,
                    backgroundColor: COLORS.accent2,
                  })}
                >
                  <Text style={{ color: COLORS.text, fontWeight: "900" }}>
                    Seguir con la compra
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <View style={{ alignItems: "center", paddingTop: 8 }}>
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
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function TrustPill({ label }: { label: string }) {
  return (
    <View
      style={{
        borderRadius: 999,
        paddingVertical: 9,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: COLORS.accentBorder,
        backgroundColor: COLORS.accent2,
      }}
    >
      <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 12 }}>{label}</Text>
    </View>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 160,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.borderSoft,
        backgroundColor: "rgba(255,255,255,0.05)",
        padding: 14,
        gap: 4,
      }}
    >
      <Text style={{ color: COLORS.muted2, fontSize: 12, fontWeight: "700" }}>{title}</Text>
      <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "900" }}>{value}</Text>
      <Text style={{ color: COLORS.muted, fontSize: 12 }}>{subtitle}</Text>
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

function ProductCard({
  p,
  onPress,
  isAdmin,
}: {
  p: Product;
  onPress: () => void;
  isAdmin: boolean;
}) {
  const badgeLabel = isAdmin ? adminStatusLabel(p.status) : publicStatusLabel(p.status);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.94 : 1,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.card,
        overflow: "hidden",
      })}
    >
      <View
        style={{
          height: 180,
          backgroundColor: COLORS.bg3,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.borderSoft,
          position: "relative",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {p.imageUrl ? (
          <Image
            source={{ uri: p.imageUrl }}
            resizeMode="cover"
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <View
            style={{
              width: "100%",
              height: "100%",
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 18,
            }}
          >
            <Text
              style={{
                color: "rgba(255,255,255,0.20)",
                fontWeight: "900",
                fontSize: 40,
              }}
            >
              VG
            </Text>
            <Text
              style={{
                color: COLORS.muted2,
                fontSize: 12,
                marginTop: 6,
                textAlign: "center",
              }}
            >
              Imagen pendiente o no disponible
            </Text>
          </View>
        )}

        <View
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 999,
            backgroundColor: statusBg(p.status),
            borderWidth: 1,
            borderColor: statusBorder(p.status),
          }}
        >
          <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>{badgeLabel}</Text>
        </View>
      </View>

      <View style={{ padding: 14, gap: 10 }}>
        <View style={{ gap: 6 }}>
          {p.category?.name ? (
            <Text
              style={{
                color: COLORS.accent,
                fontSize: 12,
                fontWeight: "800",
                textTransform: "uppercase",
                letterSpacing: 0.4,
              }}
              numberOfLines={1}
            >
              {p.category.name}
            </Text>
          ) : null}

          <Text
            style={{
              color: COLORS.text,
              fontSize: 17,
              lineHeight: 22,
              fontWeight: "900",
              minHeight: 44,
            }}
            numberOfLines={2}
          >
            {p.title}
          </Text>

          <Text
            style={{
              color: COLORS.muted,
              fontSize: 13,
              lineHeight: 19,
              minHeight: 38,
            }}
            numberOfLines={2}
          >
            {p.description?.trim()
              ? p.description.trim()
              : "Producto revisado y presentado con enfoque claro para compra rápida."}
          </Text>
        </View>

        <View
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: COLORS.borderSoft,
            backgroundColor: "rgba(255,255,255,0.04)",
            padding: 12,
            gap: 8,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: 10,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.muted2, fontSize: 12, fontWeight: "700" }}>
                Precio
              </Text>
              <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: "900" }}>
                {fmtEUR(p.priceEUR)}
              </Text>
            </View>

            <View
              style={{
                borderRadius: 999,
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderWidth: 1,
                borderColor: COLORS.accentBorder,
                backgroundColor: COLORS.accent2,
              }}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12 }}>
                Ver producto
              </Text>
            </View>
          </View>

          {!isAdmin ? (
            <Text style={{ color: COLORS.muted, fontSize: 12, lineHeight: 18 }}>
              Compra clara, contacto rápido y producto orientado a venta real.
            </Text>
          ) : (
            <Text style={{ color: COLORS.muted, fontSize: 12, lineHeight: 18 }}>
              Estado interno visible solo para gestión.
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}