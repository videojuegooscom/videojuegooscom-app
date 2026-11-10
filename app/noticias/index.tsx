// app/noticias/index.tsx
/**
 * Qué hace: el índice de noticias en /noticias (dueño, 2026-11-09: que Google encuentre las noticias). Título principal
 * «Noticias de consolas, videojuegos y tecnología», filtros por categoría (chips) y las 30 últimas noticias publicadas,
 * cada una en una tarjeta (foto solo si el servidor la comprobó, categoría y fecha, título y resumen corto) que es un
 * enlace de verdad (<a href>) a su página /noticias/<id>. Diseño de la tienda (CabeceraMarca, colores, SmartImage,
 * CargaMarca). Título y descripción para Google: components/SiteHead.tsx (PAGINAS["/noticias"]).
 *
 * Analítica propia: «Noticias: índice visto» (Administración → Analítica, #analitica-noticias-organicas).
 *
 * Conectado con:
 * - lib/supabase.ts → tabla noticias_gaming (lectura pública, publicada = true).
 * - app/noticias/[id].tsx → la página de cada noticia (y leerFotosNoticia, fechaNoticia, recortar, CATEGORIAS_NOTICIAS).
 * - app/servicio/[id].tsx → faltaColumna; components/SiteHead.tsx → su título; components/SiteFooter.tsx → «Noticias».
 * - api/sitemap.ts → /noticias en el sitemap.
 */
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StatusBar, Text, View, useWindowDimensions } from "react-native";
import { Link, type Href } from "expo-router";
import { supabase } from "../../lib/supabase";
import { trackEvent } from "../../lib/analytics";
import SmartImage from "../../components/SmartImage";
import CargaMarca from "../../components/marca/CargaMarca";
import CabeceraMarca from "../../components/CabeceraMarca";
import { useRecarga } from "../../components/TirarParaActualizar";
import { faltaColumna } from "../servicio/[id]";
import { CATEGORIAS_NOTICIAS, fechaNoticia, leerFotosNoticia, recortar } from "./[id]";

const COLORS = {
  bg: "#FFFFFF",
  card: "#F6FAFD",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  accent: "#1EA7E8",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
};

const LIMITE = 30;
const COLUMNAS = "id,titulo,categoria,resumen,imagen_url,publicada_en,created_at";

type Tarjeta = { id: string; titulo: string; categoria: string; resumen: string; foto: string | null; publicadaEn: string | null };

async function leerNoticias(categoria: string | null): Promise<Tarjeta[]> {
  const consulta = (columnas: string) => {
    let q = supabase.from("noticias_gaming").select(columnas).eq("publicada", true);
    if (categoria) q = q.eq("categoria", categoria);
    return q.order("publicada_en", { ascending: false, nullsFirst: false }).limit(LIMITE);
  };
  let { data, error } = await consulta(`${COLUMNAS},imagenes,imagenes_verificadas`);
  if (error && faltaColumna(error)) ({ data, error } = await consulta(COLUMNAS));
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    titulo: String(r.titulo ?? "").trim(),
    categoria: String(r.categoria ?? "").trim() || "Gaming",
    resumen: String(r.resumen ?? "").trim(),
    foto: leerFotosNoticia(r)[0] ?? null,
    publicadaEn: (r.publicada_en as string | null) ?? (r.created_at as string | null) ?? null,
  }));
}

function Chip({ texto, activo, onPress }: { texto: string; activo: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      style={({ pressed }) => ({
        opacity: pressed ? 0.85 : 1,
        minHeight: 38,
        paddingHorizontal: 14,
        borderRadius: 999,
        justifyContent: "center",
        borderWidth: 1,
        borderColor: activo ? COLORS.accent : COLORS.border,
        backgroundColor: activo ? COLORS.accent : "#FFFFFF",
      })}
    >
      <Text style={{ color: activo ? "#FFFFFF" : COLORS.text, fontWeight: "800", fontSize: 13 }}>{texto}</Text>
    </Pressable>
  );
}

function TarjetaNoticia({ n, isMobile }: { n: Tarjeta; isMobile: boolean }) {
  return (
    <Link href={`/noticias/${n.id}` as Href} asChild>
      <Pressable
        nativeID={`noticia-tarjeta-${n.id}`}
        accessibilityRole="link"
        // Dentro de <Link asChild> el estilo tiene que ser un objeto (con una función, Link lo pierde).
        style={{
          width: "100%",
          backgroundColor: "#FFFFFF",
          borderRadius: 22,
          borderWidth: 1,
          borderColor: COLORS.border,
          overflow: "hidden",
          flexDirection: isMobile ? "column" : "row",
        }}
      >
        {n.foto ? (
          <SmartImage
            uri={n.foto}
            alt={n.titulo}
            ancho={isMobile ? 420 : 240}
            contentFit="cover"
            style={{ width: isMobile ? "100%" : 240, height: isMobile ? 180 : 160, backgroundColor: COLORS.card }}
          />
        ) : null}
        <View style={{ flex: isMobile ? undefined : 1, padding: 14, gap: 6 }}>
          <Text style={{ color: COLORS.accent, fontSize: 11, fontWeight: "900", letterSpacing: 1.1, textTransform: "uppercase" }}>
            {[n.categoria, fechaNoticia(n.publicadaEn)].filter(Boolean).join(" · ")}
          </Text>
          <Text accessibilityRole="header" {...({ "aria-level": 2 } as object)} style={{ color: COLORS.text, fontSize: 17, fontWeight: "900", lineHeight: 23 }}>
            {n.titulo}
          </Text>
          {n.resumen ? <Text style={{ color: COLORS.muted, fontSize: 14, lineHeight: 20 }}>{recortar(n.resumen, 170)}</Text> : null}
        </View>
      </Pressable>
    </Link>
  );
}

export default function NoticiasIndice() {
  const { width } = useWindowDimensions();
  const ancho = width > 0 ? width : 1024;
  const isMobile = ancho < 700;
  const pagePadding = isMobile ? 16 : 24;

  const [categoria, setCategoria] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [noticias, setNoticias] = useState<Tarjeta[]>([]);
  const recarga = useRecarga();

  useEffect(() => {
    trackEvent("noticias_indice", "Noticias: índice visto", { path: "/noticias" });
  }, []);

  useEffect(() => {
    let vivo = true;
    setFallo(false);
    leerNoticias(categoria)
      .then((filas) => vivo && setNoticias(filas))
      .catch((e) => {
        console.error("Error cargando las noticias:", e);
        if (vivo) setFallo(true);
      })
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [categoria, recarga]);

  function elegir(c: string | null) {
    if (c === categoria) return;
    setCargando(true);
    setCategoria(c);
  }

  return (
    <View nativeID="noticias-indice" style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: pagePadding, paddingTop: isMobile ? 12 : 14, paddingBottom: 96, alignItems: "center" }}
      >
        <View style={{ width: "100%", maxWidth: 820, gap: 14 }}>
          <CabeceraMarca />
          <View style={{ alignItems: "center", gap: 4 }}>
            <Text
              accessibilityRole="header"
              {...({ "aria-level": 1 } as object)}
              style={{ color: COLORS.text, fontSize: isMobile ? 21 : 24, fontWeight: "900", textAlign: "center", lineHeight: isMobile ? 27 : 30 }}
            >
              Noticias de consolas, videojuegos y tecnología
            </Text>
            <Text style={{ color: COLORS.muted, fontSize: 13, textAlign: "center" }}>Lo más importante de cada día, resumido en español.</Text>
          </View>

          <ScrollView nativeID="noticias-chips" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2, flexGrow: 1, justifyContent: "center" }}>
            <Chip texto="Todas" activo={categoria === null} onPress={() => elegir(null)} />
            {CATEGORIAS_NOTICIAS.map((c) => (
              <Chip key={c} texto={c} activo={categoria === c} onPress={() => elegir(c)} />
            ))}
          </ScrollView>

          {cargando ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <CargaMarca texto="Cargando noticias…" />
            </View>
          ) : fallo ? (
            <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 20 }}>
              No hemos podido cargar las noticias. Desliza hacia abajo para intentarlo de nuevo.
            </Text>
          ) : noticias.length === 0 ? (
            <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 20 }}>Todavía no hay noticias en esta categoría.</Text>
          ) : (
            <View nativeID="noticias-lista" style={{ gap: 12 }}>
              {noticias.map((n) => (
                <TarjetaNoticia key={n.id} n={n} isMobile={isMobile} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
