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
 * su foto de portada desde "service_media", con una rejilla de tarjetas
 * (calcColumns, mismo criterio de columnas que app/catalogo.tsx) y un
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
  ActivityIndicator,
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
import SmartImage from "../components/SmartImage";

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  bg3: "#F6FAFD",
  card: "#F6FAFD",
  border: "#E3EAF2",
  borderSoft: "#EEF3F8",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.48)",
  accent: "#1EA7E8",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
};

const columnStyle = { width: "100%", maxWidth: 1240, alignSelf: "center" } as const;

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

function fmtEUR(n: number) {
  const safe = Number.isFinite(n) ? n : 0;
  // Antes se redondeaba siempre a euros enteros (Math.round); se deja igual
  // de preparado para decimales que el resto de la app, aunque el precio de
  // los servicios sigue guardándose en euros enteros por ahora.
  const rounded = Math.round(safe * 100) / 100;
  const hasCents = Math.abs(rounded - Math.round(rounded)) > 0.001;
  return hasCents ? `${rounded.toFixed(2).replace(".", ",")}€` : `${Math.round(rounded)}€`;
}

function clampText(s: string, max = 110) {
  const t = String(s ?? "").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function calcColumns(width: number) {
  if (width >= 1320) return 4;
  if (width >= 980) return 3;
  if (width >= 680) return 2;
  return 1;
}

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

function ServiceCard({ s, onPress, compact }: { s: Service; onPress: () => void; compact?: boolean }) {
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
          height: compact ? 150 : 180,
          backgroundColor: COLORS.bg3,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.borderSoft,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {s.imageUrl ? (
          <SmartImage uri={s.imageUrl} contentFit="contain" style={{ width: "100%", height: "100%" }} />
        ) : (
          <Ionicons name="construct-outline" size={34} color={COLORS.muted2} />
        )}
      </View>

      <View style={{ padding: 14, gap: 6 }}>
        {/* Sin numberOfLines: el título se ve siempre completo, igual que en
            app/catalogo.tsx (antes se recortaba a 2 líneas con "..."). */}
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 15, lineHeight: 20 }}>
          {s.title}
        </Text>
        {!!s.description && (
          <Text numberOfLines={2} style={{ color: COLORS.muted, fontSize: 12.5, lineHeight: 17 }}>
            {clampText(s.description, 90)}
          </Text>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          <Text style={{ color: COLORS.accent, fontWeight: "900", fontSize: 16 }}>{fmtEUR(s.priceEUR)}</Text>
          <Text style={{ color: COLORS.muted2, fontWeight: "800", fontSize: 12 }}>Ver servicio →</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function ServiciosScreen() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const pagePadding = isMobile ? 12 : 16;
  const columns = calcColumns(widthSafe);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    setErr(null);
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

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return services;
    return services.filter(
      (s) => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    );
  }, [services, search]);

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
        <View style={{ ...columnStyle, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
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
                Reparación y limpieza
              </Text>
              <Text style={{ color: COLORS.muted, fontSize: 13, marginTop: 2 }}>
                Servicios profesionales para tus dispositivos: repara, limpia o dales mantenimiento.
              </Text>
            </View>
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

      <ScrollView contentContainerStyle={{ padding: pagePadding, paddingBottom: 40 }}>
        <View style={{ ...columnStyle }}>
          {loading ? (
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <ActivityIndicator color={COLORS.accent} />
            </View>
          ) : err ? (
            <View
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.card,
                padding: 20,
                alignItems: "center",
                gap: 10,
              }}
            >
              <Ionicons name="alert-circle-outline" size={24} color={COLORS.muted} />
              <Text style={{ color: COLORS.text, textAlign: "center", lineHeight: 20 }}>{err}</Text>
              <Pressable
                onPress={load}
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
            <View
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.card,
                padding: 24,
                alignItems: "center",
                gap: 8,
              }}
            >
              <Ionicons name="construct-outline" size={26} color={COLORS.muted} />
              <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 15 }}>
                Todavía no hay servicios publicados
              </Text>
              <Text style={{ color: COLORS.muted, textAlign: "center", lineHeight: 19 }}>
                Vuelve pronto o escríbenos directamente para preguntar por reparación o limpieza.
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
              {filtered.map((s) => (
                <View key={s.id} style={{ width: `${100 / columns - 1.2}%` as any }}>
                  <ServiceCard s={s} compact={columns >= 3} onPress={() => router.push(`/servicio/${s.id}` as any)} />
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
