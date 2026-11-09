// app/servicios.tsx
/**
 * Qué hace: catálogo público de SERVICIOS (reparación, limpieza,
 * mantenimiento...) — la contraparte de app/catalogo.tsx pero para
 * servicios en vez de productos, mucho más simple (sin filtro por
 * categoría ni por estado admin: aquí solo se listan los servicios
 * publicados y visibles). Es donde lleva ahora la categoría
 * "Reparación/Limpieza" de Inicio en vez de abrir WhatsApp directamente.
 *
 * Cómo funciona: carga "services" (status='PUBLISHED', is_active=true) +
 * su foto de portada desde "service_media", con la MISMA tarjeta y rejilla
 * que el Catálogo e Inicio (TarjetaProducto, RejillaTarjetas y columnasLista
 * de components/CategoryProductsShelf.tsx: en el móvil, 2 columnas) y un
 * buscador simple por título/descripción. Al tocar una tarjeta lleva a
 * app/servicio/[id].tsx.
 *
 * Conectado con:
 * - sql/services.sql, sql/service_media.sql → tablas que lee esta pantalla.
 * - app/servicio/[id].tsx → ficha de cada servicio.
 * - app/(tabs)/index.tsx → la categoría "Reparación/Limpieza" navega aquí.
 * - app/admin/services.tsx → gestiona el catálogo que se muestra aquí.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { columnasLista, RejillaTarjetas, TarjetaProducto } from "../components/CategoryProductsShelf";
import MarcaAnimada from "../components/marca/MarcaAnimada";
import CargaMarca from "../components/marca/CargaMarca";
import CabeceraMarca from "../components/CabeceraMarca";
import { useRecarga } from "../components/TirarParaActualizar";
import { trackEvent } from "../lib/analytics";

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  bg3: "#F6FAFD",
  card: "#F6FAFD",
  border: "#E3EAF2",
  borderSoft: "#EEF3F8",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.62)",
  accent: "#1EA7E8",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
};

const columnStyle = { width: "100%", maxWidth: 1240, alignSelf: "center" } as const;

// --- «Nuestros Servicios»: vídeos de cómo trabajamos (dueño, 2026-11-09) ---
// Se enlazan desde Instagram o TikTok (no se suben a Supabase: no gastan su cuota de descarga). La lista vive en
// site_settings.videos_servicios (migración 20261109130000) y se edita en Administración → Servicios.
export type VideoServicio = { url: string; titulo?: string };
export type EnlaceVideo = { plataforma: "Instagram" | "TikTok"; embed: string };

// El reproductor de cada enlace, o null si no es un vídeo de Instagram (reel/publicación) o de TikTok (/video/<n>).
export function enlaceVideo(url: string): EnlaceVideo | null {
  const u = String(url ?? "").trim();
  const ig = u.match(/^https:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(reels?|p|tv)\/([A-Za-z0-9_-]+)/i);
  if (ig) return { plataforma: "Instagram", embed: `https://www.instagram.com/${ig[1].toLowerCase() === "reels" ? "reel" : ig[1].toLowerCase()}/${ig[2]}/embed/` };
  const tt = u.match(/^https:\/\/(?:www\.|m\.)?tiktok\.com\/(?:@[\w.-]+\/video|embed\/v2|v)\/(\d{6,25})/i);
  if (tt) return { plataforma: "TikTok", embed: `https://www.tiktok.com/embed/v2/${tt[1]}` };
  return null;
}

export function leerVideosServicios(valor: unknown): VideoServicio[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((v) => v && typeof v.url === "string" && enlaceVideo(v.url))
    .slice(0, 12)
    .map((v) => ({ url: String(v.url).trim(), ...(typeof v.titulo === "string" && v.titulo.trim() ? { titulo: v.titulo.trim() } : null) }));
}

// Sin la migración (falta la columna) o sin vídeos: [] y el apartado no sale.
async function loadVideos(): Promise<VideoServicio[]> {
  const { data, error } = await supabase.from("site_settings").select("videos_servicios").eq("id", 1).maybeSingle();
  if (error) return [];
  return leerVideosServicios((data as { videos_servicios?: unknown } | null)?.videos_servicios);
}

// Cada vídeo es una tarjeta: el reproductor de Instagram/TikTok solo se carga al tocarla (así la página no carga
// nada de esas redes, ni sus cookies, hasta que el cliente quiere verlo).
function TarjetaVideo({ video, ancho }: { video: VideoServicio; ancho: number }) {
  const [abierto, setAbierto] = useState(false);
  const enlace = enlaceVideo(video.url);
  if (!enlace) return null;
  const alto = Math.round(ancho * 16 / 9) + 60;
  const ver = () => {
    setAbierto(true);
    // Administración → Analítica (#analitica-videos-servicios).
    trackEvent("servicios_video", `Nuestros Servicios: vídeo visto · ${video.titulo || enlace.plataforma}`, {
      path: "/servicios",
      metadata: { plataforma: enlace.plataforma },
    });
  };
  return (
    <View style={{ width: ancho, gap: 8 }}>
      <View style={{ width: ancho, height: alto, borderRadius: 18, overflow: "hidden", backgroundColor: COLORS.text }}>
        {abierto && Platform.OS === "web" ? (
          React.createElement("iframe", {
            src: enlace.embed,
            title: video.titulo || `Vídeo de ${enlace.plataforma}`,
            width: ancho,
            height: alto,
            style: { border: 0, width: "100%", height: "100%", backgroundColor: "#FFFFFF" },
            allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
            allowFullScreen: true,
            loading: "lazy",
          })
        ) : (
          <Pressable
            onPress={Platform.OS === "web" ? ver : () => Linking.openURL(video.url)}
            accessibilityRole="button"
            accessibilityLabel={`Ver el vídeo${video.titulo ? ` «${video.titulo}»` : ""} de ${enlace.plataforma}`}
            style={({ pressed }) => ({ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 16, opacity: pressed ? 0.9 : 1 })}
          >
            <Ionicons name={enlace.plataforma === "Instagram" ? "logo-instagram" : "logo-tiktok"} size={30} color="rgba(255,255,255,0.85)" />
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.accent, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="play" size={30} color="#FFFFFF" style={{ marginLeft: 4 }} />
            </View>
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15, textAlign: "center" }}>Ver vídeo</Text>
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11.5, lineHeight: 16, textAlign: "center" }}>
              Se reproduce desde {enlace.plataforma}, que puede usar sus cookies.
            </Text>
          </Pressable>
        )}
      </View>
      {video.titulo ? (
        <Text numberOfLines={2} style={{ color: COLORS.text, fontWeight: "800", fontSize: 14, textAlign: "center" }}>
          {video.titulo}
        </Text>
      ) : null}
    </View>
  );
}

function NuestrosServicios({ videos, isMobile, pagePadding }: { videos: VideoServicio[]; isMobile: boolean; pagePadding: number }) {
  if (!videos.length) return null;
  const ancho = isMobile ? 210 : 270;
  return (
    <View nativeID="nuestros-servicios" style={{ ...columnStyle, paddingHorizontal: pagePadding, paddingTop: 18, gap: 12 }}>
      <View style={{ alignItems: "center", gap: 2 }}>
        <Text accessibilityRole="header" {...({ "aria-level": 2 } as object)} style={{ color: COLORS.text, fontWeight: "900", fontSize: isMobile ? 19 : 21, textAlign: "center" }}>
          Nuestros Servicios
        </Text>
        <Text style={{ color: COLORS.muted, fontSize: 13, textAlign: "center" }}>Así trabajamos con tus dispositivos</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingVertical: 4, flexGrow: 1, justifyContent: "center" }}>
        {videos.map((v, i) => (
          <TarjetaVideo key={`${v.url}-${i}`} video={v} ancho={ancho} />
        ))}
      </ScrollView>
    </View>
  );
}

type ServiceMediaRow = {
  service_id: string;
  public_url: string | null;
  is_cover: boolean | null;
  sort_order: number | null;
};

type Service = {
  id: string;
  title: string;
  description: string;
  priceEUR: number;
  imageUrl: string | null;
};

async function loadServices(): Promise<Service[]> {
  const { data: rows, error } = await supabase
    .from("services")
    .select("id,title,description,price_eur")
    .eq("status", "PUBLISHED")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw error;

  const ids = (rows ?? []).map((r: any) => r.id);
  const coverById: Record<string, string | null> = {};

  if (ids.length) {
    const { data: media } = await supabase
      .from("service_media")
      .select("service_id,public_url,is_cover,sort_order")
      .in("service_id", ids)
      .order("is_cover", { ascending: false })
      .order("sort_order", { ascending: true });

    for (const m of (media ?? []) as ServiceMediaRow[]) {
      if (!coverById[m.service_id] && m.public_url) coverById[m.service_id] = m.public_url;
    }
  }

  return (rows ?? []).map((r: any) => ({
    id: r.id,
    title: r.title,
    description: r.description ?? "",
    priceEUR: Number(r.price_eur ?? 0),
    imageUrl: coverById[r.id] ?? null,
  }));
}

export default function ServiciosScreen() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const pagePadding = isMobile ? 12 : 16;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [search, setSearch] = useState("");
  const [videos, setVideos] = useState<VideoServicio[]>([]);

  // silencioso («Desliza para actualizar»): sin volver a enseñar la carga.
  async function load(silencioso = false) {
    if (!silencioso) setLoading(true);
    setErr(null);
    loadVideos().then(setVideos);
    try {
      const rows = await loadServices();
      setServices(rows);
    } catch (e) {
      console.error("Error cargando servicios:", e);
      setErr("No hemos podido cargar los servicios en este momento. Inténtalo de nuevo en unos instantes.");
      setServices([]);
    } finally {
      setLoading(false);
    }
  }

  const recarga = useRecarga();
  useEffect(() => {
    load(recarga > 0);
  }, [recarga]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return services;
    return services.filter(
      (s) => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    );
  }, [services, search]);

  // Las mismas columnas que el Catálogo: en el móvil, 2 en cuanto hay más de un servicio.
  const columns = columnasLista(widthSafe, isMobile, filtered.length);
  const compact = isMobile && columns > 1;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      {/* Como en el resto de la tienda (Catálogo, Inicio…), la cabecera va DENTRO del desplazamiento: toda la
          página se desliza junta, en vez de quedarse una cabecera grande fija y la lista en un hueco pequeño.
          96 abajo: la última tarjeta queda por encima del asistente flotante Blue. Con el buscador abierto,
          tocar una tarjeta funciona al primer toque y arrastrar cierra el teclado. */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: 96 }}
      >
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
          <View style={{ ...columnStyle, gap: 12 }}>
            <CabeceraMarca />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ flex: 1, alignItems: "center" }}>
                <MarcaAnimada cual="taller" ancho={isMobile ? 140 : 160} />
                <Text
                  accessibilityRole="header"
                  {...({ "aria-level": 1 } as object)}
                  style={{ color: COLORS.text, fontSize: isMobile ? 20 : 22, fontWeight: "900", textAlign: "center" }}
                >
                  Reparación y limpieza
                </Text>
                <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 2, textAlign: "center" }}>
                  Servicios profesionales para tus dispositivos: repara, limpia o dales mantenimiento.
                </Text>
              </View>
              {/* Hueco del mismo ancho que el botón de volver: así el título queda centrado de verdad */}
              <View style={{ width: 36 }} />
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                borderWidth: 1,
                borderColor: COLORS.border,
                borderRadius: 999,
                paddingHorizontal: 14,
                paddingVertical: 10,
                backgroundColor: COLORS.bg,
              }}
            >
              <Ionicons name="search" size={16} color={COLORS.muted2} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar un servicio…"
                placeholderTextColor={COLORS.muted2}
                style={{ flex: 1, fontSize: 15, color: COLORS.text }}
              />
            </View>
          </View>
        </View>

        <View style={{ ...columnStyle, padding: pagePadding }}>
          {loading ? (
            <View style={{ alignItems: "center", paddingVertical: 24 }}>
              <CargaMarca texto="Cargando servicios…" />
            </View>
          ) : err ? (
            <View style={{ alignItems: "center", gap: 10, paddingVertical: 20 }}>
              <Ionicons name="alert-circle-outline" size={24} color={COLORS.muted} />
              <Text style={{ color: COLORS.text, textAlign: "center", lineHeight: 20 }}>{err}</Text>
              <Pressable
                onPress={() => load()}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.85 : 1,
                  borderRadius: 999,
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  backgroundColor: COLORS.accent2,
                  borderWidth: 1,
                  borderColor: COLORS.accentBorder,
                })}
              >
                <Text style={{ color: COLORS.text, fontWeight: "900" }}>Reintentar</Text>
              </Pressable>
            </View>
          ) : filtered.length === 0 ? (
            <View style={{ alignItems: "center", gap: 8, paddingVertical: 24 }}>
              <Ionicons name="construct-outline" size={26} color={COLORS.muted} />
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 15, textAlign: "center" }}>
                Todavía no hay servicios publicados
              </Text>
              <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 19 }}>
                Vuelve pronto o escríbenos directamente para preguntar por reparación o limpieza.
              </Text>
            </View>
          ) : (
            // La misma tarjeta y rejilla que el Catálogo e Inicio (components/CategoryProductsShelf.tsx).
            <RejillaTarjetas columns={columns} gap={14}>
              {filtered.map((s, i) => (
                // nativeID: la guía de Blue (components/Campanita.tsx) enmarca el primer servicio.
                <View key={s.id} nativeID={i === 0 ? "servicios-lista" : undefined}>
                  <TarjetaProducto
                    titulo={s.title}
                    precioEUR={s.priceEUR}
                    imagenUrl={s.imageUrl}
                    isMobile={isMobile}
                    compact={compact}
                    onPress={() => router.push(`/servicio/${s.id}` as any)}
                  />
                </View>
              ))}
            </RejillaTarjetas>
          )}
        </View>

        {/* «Nuestros Servicios»: vídeos de cómo trabajamos, debajo de la lista (sin vídeos no sale). */}
        <NuestrosServicios videos={videos} isMobile={isMobile} pagePadding={pagePadding} />
      </ScrollView>
    </View>
  );
}
