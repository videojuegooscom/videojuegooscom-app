// app/blog/index.tsx
/**
 * Qué hace: listado del Blog — artículos cortos sobre consolas/electrónica
 * (guías de compra, mantenimiento...). El contenido ahora vive en la tabla
 * Supabase "blog_posts" y se edita desde app/admin/blog.tsx (crear, editar,
 * publicar/pasar a borrador, borrar), en vez de estar fijo en este archivo.
 *
 * Cómo funciona:
 * - fetchBlogPostsSafe() carga los artículos con status="PUBLISHED" de
 *   "blog_posts", ordenados por sort_order. Si Supabase falla o todavía no
 *   hay ningún artículo publicado, cae a FALLBACK_ARTICLES — los mismos 3
 *   artículos de arranque que tenía esta pantalla antes del panel de
 *   administración — para que el Blog nunca aparezca vacío.
 * - No hay pantalla de detalle por artículo — cada tarjeta se despliega
 *   in-situ (acordeón) al tocarla.
 * - Lee ?open=<slug> (que pasan los enlaces "Guías de compra" / "Consejos y
 *   mantenimiento" del pie de página de Inicio) para abrir directamente ese
 *   artículo al entrar.
 *
 * Conectado con:
 * - lib/supabase.ts → cliente de Supabase para leer "blog_posts".
 * - app/admin/blog.tsx → editor de administración de estos artículos.
 * - app/(tabs)/index.tsx → el acordeón "Blog" del pie de página enlaza aquí.
 */
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  accent: "#1EA7E8",
};

const columnStyle = { width: "100%", maxWidth: 820, alignSelf: "center" } as const;

type Article = { slug: string; title: string; excerpt: string; body: string };

// Mismo contenido que tenía esta pantalla antes del panel de administración:
// se usa solo si Supabase falla o todavía no hay ningún artículo publicado.
const FALLBACK_ARTICLES: Article[] = [
  {
    slug: "elegir-consola-segunda-mano",
    title: "Cómo elegir una consola de segunda mano sin sorpresas",
    excerpt: "Qué revisar antes de comprar una PS5, PS4, Switch o Xbox reacondicionada.",
    body:
      "Comprar una consola de segunda mano es una forma estupenda de ahorrar, siempre que sepas qué mirar. Antes de decidirte, comprueba que el vendedor te confirme que el equipo ha sido revisado (en nuestra tienda, todo pasa un control de funcionamiento antes de ponerse a la venta). Pregunta si incluye cables originales, mando y fuente de alimentación, y si tiene garantía. Si es posible, revisa el estado de la carcasa y pide fotos reales del equipo, no solo de catálogo. Y recuerda: un precio muy por debajo del mercado suele ser señal de que algo no cuadra.",
  },
  {
    slug: "mantenimiento-consola",
    title: "Mantenimiento básico para que tu consola dure más",
    excerpt: "Limpieza, ventilación y otros hábitos que alargan la vida de tu equipo.",
    body:
      "Las consolas acumulan polvo con el uso, y eso afecta a la refrigeración y, con el tiempo, al rendimiento. Colócala en un sitio con buena ventilación, sin taparla ni dejarla contra la pared, y límpiala por fuera con un paño seco de vez en cuando. Si notas que hace más ruido de lo normal o se calienta en exceso, es buen momento para una limpieza interna profesional — es uno de los servicios que ofrecemos en tienda. Actualizar el software del sistema cuando toca también ayuda a evitar problemas de estabilidad.",
  },
  {
    slug: "vender-consola-que-mirar",
    title: "Vender tu consola: qué esperar del proceso",
    excerpt: "Cómo tasamos tu equipo y qué necesitas para vendérnoslo.",
    body:
      "Si tienes una consola o electrónica que ya no usas, puedes vendérnosla de forma rápida y sin complicaciones: nos cuentas qué tienes y su estado (por WhatsApp o desde la app), la tasamos, y si aceptas el precio, te pagamos en muy poco tiempo. Ayuda mucho que incluyas los accesorios originales (mando, cables, fuente) y que el equipo esté en buen estado general — eso se refleja directamente en el precio de tasación.",
  },
];

async function fetchBlogPostsSafe(): Promise<Article[]> {
  try {
    const { data, error } = await supabase
      .from("blog_posts")
      .select("slug,title,excerpt,body,status,sort_order")
      .eq("status", "PUBLISHED")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];

    const articles: Article[] = rows
      .map((row): Article | null => {
        const slug = String((row as any)?.slug ?? "").trim();
        const title = String((row as any)?.title ?? "").trim();
        if (!slug || !title) return null;

        return {
          slug,
          title,
          excerpt: String((row as any)?.excerpt ?? "").trim(),
          body: String((row as any)?.body ?? "").trim(),
        };
      })
      .filter((a): a is Article => a !== null);

    return articles.length > 0 ? articles : FALLBACK_ARTICLES;
  } catch {
    return FALLBACK_ARTICLES;
  }
}

function ArticleCard({
  article,
  open,
  onToggle,
  isMobile,
}: {
  article: Article;
  open: boolean;
  onToggle: () => void;
  isMobile: boolean;
}) {
  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.card,
        overflow: "hidden",
      }}
    >
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => ({
          opacity: pressed ? 0.9 : 1,
          padding: isMobile ? 14 : 16,
          gap: 4,
        })}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: isMobile ? 15 : 16 }}>
              {article.title}
            </Text>
            <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 4, lineHeight: 18 }}>
              {article.excerpt}
            </Text>
          </View>
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={18}
            color={COLORS.text}
          />
        </View>
      </Pressable>

      {open ? (
        <View
          style={{
            paddingHorizontal: isMobile ? 14 : 16,
            paddingBottom: isMobile ? 14 : 16,
            borderTopWidth: 1,
            borderTopColor: "rgba(11,33,56,0.08)",
          }}
        >
          <Text style={{ color: COLORS.muted, lineHeight: 21, fontSize: 14.5, paddingTop: 10 }}>
            {article.body}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function BlogScreen() {
  const { width } = useWindowDimensions();
  const widthSafe = width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const pagePadding = isMobile ? 16 : 24;

  // El pie de página de Inicio ("Guías de compra", "Consejos y
  // mantenimiento") enlaza aquí con ?open=<slug del artículo> para abrir
  // directamente el artículo correspondiente en vez de dejar todo cerrado.
  const params = useLocalSearchParams<{ open?: string }>();
  const initialOpen = typeof params.open === "string" ? params.open : null;

  const [loading, setLoading] = useState(true);
  const [articles, setArticles] = useState<Article[]>([]);
  const [openSlug, setOpenSlug] = useState<string | null>(initialOpen);

  useEffect(() => {
    let alive = true;

    fetchBlogPostsSafe().then((loaded) => {
      if (!alive) return;
      setArticles(loaded);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: "#F6FAFD",
          paddingHorizontal: pagePadding,
          paddingTop: isMobile ? 12 : 14,
          paddingBottom: 14,
        }}
      >
        <View style={{ ...columnStyle, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            style={({ pressed }) => ({
              opacity: pressed ? 0.85 : 1,
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Ionicons name="chevron-back" size={22} color={COLORS.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.text, fontSize: isMobile ? 20 : 22, fontWeight: "900" }}>
              Blog
            </Text>
            <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 2 }}>
              Guías y consejos sobre consolas y electrónica.
            </Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator color={COLORS.text} />
          <Text style={{ color: COLORS.muted }}>Cargando artículos…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: pagePadding,
            paddingTop: 20,
            paddingBottom: 40,
          }}
        >
          <View style={{ ...columnStyle, gap: 12 }}>
            {articles.length === 0 ? (
              <Text style={{ color: COLORS.muted, lineHeight: 22 }}>
                Todavía no hay artículos publicados.
              </Text>
            ) : (
              articles.map((article) => (
                <ArticleCard
                  key={article.slug}
                  article={article}
                  open={openSlug === article.slug}
                  onToggle={() =>
                    setOpenSlug((current) => (current === article.slug ? null : article.slug))
                  }
                  isMobile={isMobile}
                />
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
