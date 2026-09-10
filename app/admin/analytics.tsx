// app/admin/analytics.tsx
/**
 * Qué hace: panel de métricas de visitas del panel de administración. Muestra
 * cuántas personas visitan la tienda, el recorrido que hacen (Inicio →
 * Categoría → Producto → Reseñas, con "Scroll" como señal de enganche
 * aparte), un calendario de crecimiento (visitantes por día) filtrable por
 * fechas, y un ranking de las categorías y productos más vistos.
 *
 * Cómo funciona:
 * - Todo sale de la tabla analytics_events (que rellena lib/analytics.ts
 *   desde Inicio, Catálogo y la ficha de producto) a través de 4 funciones
 *   SQL ya creadas en Supabase: analytics_totals, analytics_daily_visitors,
 *   analytics_funnel y (no usada aquí directamente) analytics_top_metadata.
 *   Las cuatro son SECURITY INVOKER, así que si algún día alguien sin rol
 *   admin llamara a esta pantalla por error, simplemente no vería datos (la
 *   RLS de analytics_events ya exige is_admin() para el SELECT).
 * - Rango de fechas: chips rápidos (Hoy/7 días/30 días/90 días/Todo) o un
 *   rango a medida escribiendo dos fechas (AAAA-MM-DD). Por defecto, últimos
 *   30 días. Las fechas se tratan como días completos en UTC (00:00 a 00:00
 *   del día siguiente) para no complicar cada zona horaria de cada visitante.
 * - "Recorrido principal": agrupa analytics_funnel por prefijo de
 *   step_label ("Categoría ..." → Categoría, "Producto ..." → Producto) para
 *   armar un embudo de 4 pasos (Inicio, Categoría, Producto, Reseñas), con el
 *   % de caída respecto a Inicio en cada paso. "Scroll" se muestra aparte,
 *   como señal de cuánta gente se queda mirando contenido, no como un paso
 *   del embudo (puede pasar en cualquier punto del recorrido).
 * - "Categorías más vistas" / "Productos más vistos": mismos datos de
 *   analytics_funnel, filtrando los step_label que empiezan por "Categoría "
 *   o "Producto " (con nombre concreto detrás), ordenados por sesiones.
 * - Vercel: este proyecto no tiene activado Vercel Web Analytics (se
 *   comprobó con el MCP de Vercel), así que estos datos son 100% propios,
 *   con el detalle de recorrido que Vercel no podría dar aunque estuviera
 *   activado (sus páginas vistas no distinguen "Categoría PS5" de
 *   "Categoría Xbox", por ejemplo — para Vercel ambas son la misma URL
 *   /catalogo). Se explica brevemente al final de la pantalla.
 *
 * Conectado con:
 * - lib/supabase.ts → cliente para llamar a las funciones RPC.
 * - lib/analytics.ts → quien registra los eventos que esta pantalla resume.
 * - app/admin/index.tsx → tarjeta "Visitas y métricas" que lleva aquí.
 * - app/admin/_layout.tsx → registra esta ruta ("analytics") en el Stack.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  cardSoft: "#F8FBFE",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: "rgba(11,33,56,0.62)",
  muted2: "rgba(11,33,56,0.48)",
  accent: "#1EA7E8",
  accentDark: "#0F8FCC",
  accent2: "#EAF6FD",
  accentBorder: "#BEE6FA",
  success: "#15803D",
  successBg: "#DCFCE7",
  successBorder: "#86EFAC",
  warning: "#92660B",
  warningBg: "#FEF3C7",
  warningBorder: "#FDE68A",
  danger: "#B91C1C",
  dangerBg: "#FFE4E6",
  dangerBorder: "#FDA4AF",
};

type TotalsRow = {
  total_sessions: number;
  total_pageviews: number;
  total_events: number;
  registered_visitors: number;
};

type DailyRow = { day: string; visitors: number; pageviews: number };
type FunnelRow = { step_label: string; sessions: number };

type DatePreset = "today" | "7d" | "30d" | "90d" | "all" | "custom";

function smartBackAdminHome() {
  try {
    if (typeof router.canGoBack === "function" && router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // ignore
  }
  router.replace("/admin");
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function toDateOnly(d: Date) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function todayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDaysUTC(d: Date, days: number) {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function isValidDateStr(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) && !Number.isNaN(Date.parse(`${v.trim()}T00:00:00.000Z`));
}

// created_at >= p_from and < p_to (ver analytics_totals y compañía en
// Supabase): p_from es el inicio del día elegido y p_to es el inicio del día
// SIGUIENTE al final del rango, para incluir el día final completo.
function rangeToIso(fromStr: string, toStr: string) {
  const from = new Date(`${fromStr}T00:00:00.000Z`);
  const toExclusive = addDaysUTC(new Date(`${toStr}T00:00:00.000Z`), 1);
  return { pFrom: from.toISOString(), pTo: toExclusive.toISOString() };
}

function fmtDayLabel(dayStr: string) {
  // dayStr viene como "2026-09-10" (o con hora si el driver lo trae como
  // timestamp): nos quedamos solo con los 10 primeros caracteres.
  const clean = String(dayStr ?? "").slice(0, 10);
  const parts = clean.split("-");
  if (parts.length !== 3) return clean;
  return `${parts[2]}/${parts[1]}`;
}

function StatCard({
  label,
  value,
  icon,
  isMobile,
}: {
  label: string;
  value: string;
  icon?: IoniconName;
  isMobile?: boolean;
}) {
  return (
    <View
      style={{
        width: isMobile ? "48.5%" : "23.5%",
        borderRadius: 18,
        backgroundColor: COLORS.cardSoft,
        padding: isMobile ? 12 : 14,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {icon ? <Ionicons name={icon} size={13} color={COLORS.muted2} /> : null}
        <Text style={{ color: COLORS.muted2, fontWeight: "700", fontSize: 12 }} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: isMobile ? 18 : 20, marginTop: 6 }}>
        {value}
      </Text>
    </View>
  );
}

function ChipButton({
  label,
  onPress,
  active,
  isMobile,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  isMobile?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 999,
        paddingVertical: 9,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: active ? COLORS.accentBorder : COLORS.border,
        backgroundColor: active ? COLORS.accent2 : "#F6FAFD",
        opacity: pressed ? 0.88 : 1,
      })}
    >
      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: isMobile ? 12.5 : 13 }}>{label}</Text>
    </Pressable>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        borderRadius: 20,
        backgroundColor: COLORS.card,
        padding: 14,
        gap: 10,
      }}
    >
      <View>
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>{title}</Text>
        {!!subtitle && (
          <Text style={{ color: COLORS.muted, marginTop: 3, lineHeight: 18, fontSize: 12.5 }}>
            {subtitle}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

// Barra horizontal simple (sin librería de gráficos): un View cuyo ancho en
// % representa el valor respecto al máximo de la serie.
function BarRow({
  label,
  value,
  maxValue,
  color,
  valueSuffix,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  valueSuffix?: string;
}) {
  const pct = maxValue > 0 ? Math.max(2, Math.round((value / maxValue) * 100)) : 0;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 12.5, flex: 1 }} numberOfLines={1}>
          {label}
        </Text>
        <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: 12.5 }}>
          {value}
          {valueSuffix ?? ""}
        </Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: "#EEF3F8", overflow: "hidden" }}>
        <View style={{ width: `${pct}%`, height: "100%", borderRadius: 4, backgroundColor: color }} />
      </View>
    </View>
  );
}

export default function AdminAnalytics() {
  const { width } = useWindowDimensions();
  const widthSafe = width && width > 0 ? width : 1024;
  const isMobile = widthSafe < 700;
  const pagePadding = isMobile ? 12 : 16;

  const [preset, setPreset] = useState<DatePreset>("30d");
  const today = useMemo(() => todayUTC(), []);
  const [fromDate, setFromDate] = useState(toDateOnly(addDaysUTC(today, -29)));
  const [toDate, setToDate] = useState(toDateOnly(today));
  const [fromDraft, setFromDraft] = useState(fromDate);
  const [toDraft, setToDraft] = useState(toDate);
  const [dateErr, setDateErr] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [screenErr, setScreenErr] = useState<string | null>(null);

  const [totals, setTotals] = useState<TotalsRow | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);

  function applyPreset(p: DatePreset) {
    setDateErr(null);
    setPreset(p);
    if (p === "custom") return;

    let from = today;
    if (p === "today") from = today;
    else if (p === "7d") from = addDaysUTC(today, -6);
    else if (p === "30d") from = addDaysUTC(today, -29);
    else if (p === "90d") from = addDaysUTC(today, -89);
    else if (p === "all") from = new Date(Date.UTC(2020, 0, 1));

    const f = toDateOnly(from);
    const t = toDateOnly(today);
    setFromDate(f);
    setToDate(t);
    setFromDraft(f);
    setToDraft(t);
  }

  function applyCustomRange() {
    if (!isValidDateStr(fromDraft) || !isValidDateStr(toDraft)) {
      setDateErr("Escribe las dos fechas en formato AAAA-MM-DD.");
      return;
    }
    if (fromDraft > toDraft) {
      setDateErr("La fecha de inicio no puede ser posterior a la de fin.");
      return;
    }
    setDateErr(null);
    setPreset("custom");
    setFromDate(fromDraft.trim());
    setToDate(toDraft.trim());
  }

  const load = useCallback(async () => {
    setLoading(true);
    setScreenErr(null);

    try {
      const { pFrom, pTo } = rangeToIso(fromDate, toDate);

      const [totalsRes, dailyRes, funnelRes] = await Promise.all([
        supabase.rpc("analytics_totals", { p_from: pFrom, p_to: pTo }),
        supabase.rpc("analytics_daily_visitors", { p_from: pFrom, p_to: pTo }),
        supabase.rpc("analytics_funnel", { p_from: pFrom, p_to: pTo }),
      ]);

      if (totalsRes.error) throw totalsRes.error;
      if (dailyRes.error) throw dailyRes.error;
      if (funnelRes.error) throw funnelRes.error;

      const totalsRow = Array.isArray(totalsRes.data) ? totalsRes.data[0] : totalsRes.data;
      setTotals(
        totalsRow
          ? {
              total_sessions: Number(totalsRow.total_sessions ?? 0),
              total_pageviews: Number(totalsRow.total_pageviews ?? 0),
              total_events: Number(totalsRow.total_events ?? 0),
              registered_visitors: Number(totalsRow.registered_visitors ?? 0),
            }
          : { total_sessions: 0, total_pageviews: 0, total_events: 0, registered_visitors: 0 }
      );

      setDaily(
        (Array.isArray(dailyRes.data) ? dailyRes.data : []).map((r: any) => ({
          day: String(r.day ?? ""),
          visitors: Number(r.visitors ?? 0),
          pageviews: Number(r.pageviews ?? 0),
        }))
      );

      setFunnel(
        (Array.isArray(funnelRes.data) ? funnelRes.data : []).map((r: any) => ({
          step_label: String(r.step_label ?? ""),
          sessions: Number(r.sessions ?? 0),
        }))
      );
    } catch (e: any) {
      console.error("Error cargando analítica:", e);
      setScreenErr(
        "No se han podido cargar las métricas. Comprueba tu conexión o vuelve a intentarlo."
      );
      setTotals(null);
      setDaily([]);
      setFunnel([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    load();
  }, [load]);

  // Recorrido principal: agrupa por prefijo de step_label para armar un
  // embudo de 4 pasos fijos, sin que cada categoría/producto distinto rompa
  // el embudo en decenas de filas.
  const coreFunnel = useMemo(() => {
    const findExact = (label: string) => funnel.find((f) => f.step_label === label)?.sessions ?? 0;
    const sumStartingWith = (prefix: string) =>
      funnel.filter((f) => f.step_label.startsWith(prefix)).reduce((acc, f) => acc + f.sessions, 0);

    const inicio = findExact("Inicio");
    const categoria = sumStartingWith("Categoría");
    const producto = sumStartingWith("Producto");
    const resenas = findExact("Reseñas");
    const scroll = findExact("Scroll");

    const steps = [
      { label: "Inicio", sessions: inicio },
      { label: "Categoría", sessions: categoria },
      { label: "Producto", sessions: producto },
      { label: "Reseñas", sessions: resenas },
    ];

    const top = steps[0].sessions;
    return {
      steps: steps.map((s) => ({
        ...s,
        dropPct: top > 0 ? Math.round((1 - s.sessions / top) * 100) : 0,
      })),
      scroll,
    };
  }, [funnel]);

  const topCategories = useMemo(
    () =>
      funnel
        .filter((f) => f.step_label.startsWith("Categoría ") && f.step_label !== "Categoría")
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 8),
    [funnel]
  );

  const topProducts = useMemo(
    () =>
      funnel
        .filter((f) => f.step_label.startsWith("Producto "))
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 8),
    [funnel]
  );

  const maxDailyVisitors = useMemo(
    () => daily.reduce((acc, d) => Math.max(acc, d.visitors), 0),
    [daily]
  );

  const rangeLabel = useMemo(() => {
    if (fromDate === toDate) return fromDate;
    return `${fromDate} → ${toDate}`;
  }, [fromDate, toDate]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: "#E3EAF2",
          paddingHorizontal: pagePadding,
          paddingTop: isMobile ? 12 : 14,
          paddingBottom: 12,
          alignItems: "center",
        }}
      >
        <View style={{ width: "100%", maxWidth: 1040, gap: 12 }}>
          <View
            style={{
              flexDirection: isMobile ? "column" : "row",
              justifyContent: "space-between",
              alignItems: isMobile ? "stretch" : "center",
              gap: 10,
            }}
          >
            <View style={{ flex: isMobile ? undefined : 1 }}>
              <Text
                style={{
                  color: COLORS.text,
                  fontSize: isMobile ? 22 : 24,
                  fontWeight: "900",
                  lineHeight: isMobile ? 28 : 30,
                  textAlign: isMobile ? "center" : "left",
                }}
              >
                Visitas y métricas
              </Text>
              <Text
                style={{
                  color: COLORS.muted,
                  marginTop: 4,
                  lineHeight: 20,
                  textAlign: isMobile ? "center" : "left",
                }}
              >
                Visitantes, recorrido por la tienda y crecimiento en el rango de fechas elegido.
              </Text>
            </View>

            <Pressable
              onPress={smartBackAdminHome}
              style={({ pressed }) => ({
                opacity: pressed ? 0.88 : 1,
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: "#F6FAFD",
                alignSelf: isMobile ? "flex-start" : "auto",
              })}
            >
              <Text style={{ color: COLORS.text, fontWeight: "900" }}>← Volver</Text>
            </Pressable>
          </View>

          <View
            style={{
              borderRadius: 18,
              backgroundColor: COLORS.card,
              padding: 12,
              gap: 10,
            }}
          >
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <ChipButton label="Hoy" active={preset === "today"} onPress={() => applyPreset("today")} isMobile={isMobile} />
              <ChipButton label="7 días" active={preset === "7d"} onPress={() => applyPreset("7d")} isMobile={isMobile} />
              <ChipButton label="30 días" active={preset === "30d"} onPress={() => applyPreset("30d")} isMobile={isMobile} />
              <ChipButton label="90 días" active={preset === "90d"} onPress={() => applyPreset("90d")} isMobile={isMobile} />
              <ChipButton label="Todo" active={preset === "all"} onPress={() => applyPreset("all")} isMobile={isMobile} />
            </View>

            <View style={{ flexDirection: isMobile ? "column" : "row", gap: 8, alignItems: isMobile ? "stretch" : "center" }}>
              <TextInput
                value={fromDraft}
                onChangeText={setFromDraft}
                placeholder="Desde (AAAA-MM-DD)"
                placeholderTextColor="rgba(11,33,56,0.40)"
                autoCapitalize="none"
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: COLORS.text,
                  backgroundColor: "#F8FBFE",
                  fontSize: 13,
                }}
              />
              <TextInput
                value={toDraft}
                onChangeText={setToDraft}
                placeholder="Hasta (AAAA-MM-DD)"
                placeholderTextColor="rgba(11,33,56,0.40)"
                autoCapitalize="none"
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: COLORS.text,
                  backgroundColor: "#F8FBFE",
                  fontSize: 13,
                }}
              />
              <Pressable
                onPress={applyCustomRange}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.9 : 1,
                  borderRadius: 12,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  backgroundColor: COLORS.accent,
                  alignItems: "center",
                })}
              >
                <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 13 }}>Aplicar</Text>
              </Pressable>
            </View>

            {!!dateErr && (
              <Text style={{ color: COLORS.danger, fontWeight: "700", fontSize: 12.5 }}>{dateErr}</Text>
            )}

            <Text style={{ color: COLORS.muted, fontSize: 12, fontWeight: "700" }}>
              Rango actual: {rangeLabel}
            </Text>
          </View>

          {!!screenErr && (
            <View
              style={{
                borderRadius: 14,
                backgroundColor: COLORS.dangerBg,
                padding: 10,
              }}
            >
              <Text style={{ color: COLORS.danger, fontWeight: "800", lineHeight: 20 }}>{screenErr}</Text>
            </View>
          )}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator color={COLORS.text} />
          <Text style={{ color: COLORS.muted }}>Cargando métricas…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: pagePadding, paddingBottom: 30, alignItems: "center" }}>
          <View style={{ width: "100%", maxWidth: 1040, gap: 14 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" }}>
              <StatCard label="Visitantes" value={String(totals?.total_sessions ?? 0)} icon="people-outline" isMobile={isMobile} />
              <StatCard label="Páginas vistas" value={String(totals?.total_pageviews ?? 0)} icon="eye-outline" isMobile={isMobile} />
              <StatCard label="Eventos totales" value={String(totals?.total_events ?? 0)} icon="pulse-outline" isMobile={isMobile} />
              <StatCard label="Con cuenta" value={String(totals?.registered_visitors ?? 0)} icon="person-circle-outline" isMobile={isMobile} />
            </View>

            <SectionCard
              title="Crecimiento de visitantes"
              subtitle="Visitantes distintos por día en el rango elegido."
            >
              {daily.length === 0 ? (
                <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                  Todavía no hay visitas registradas en este rango de fechas.
                </Text>
              ) : (
                <View style={{ gap: 8 }}>
                  {daily.map((d) => (
                    <BarRow
                      key={d.day}
                      label={fmtDayLabel(d.day)}
                      value={d.visitors}
                      maxValue={maxDailyVisitors}
                      color={COLORS.accent}
                    />
                  ))}
                </View>
              )}
            </SectionCard>

            <SectionCard
              title="Recorrido principal"
              subtitle="Sesiones que llegan a cada paso del recorrido (Inicio → Categoría → Producto → Reseñas). El % es la caída respecto a Inicio."
            >
              {coreFunnel.steps[0].sessions === 0 ? (
                <Text style={{ color: COLORS.muted, lineHeight: 20 }}>
                  Todavía no hay recorrido registrado en este rango de fechas.
                </Text>
              ) : (
                <View style={{ gap: 10 }}>
                  {coreFunnel.steps.map((s) => (
                    <BarRow
                      key={s.label}
                      label={s.dropPct > 0 ? `${s.label} (-${s.dropPct}%)` : s.label}
                      value={s.sessions}
                      maxValue={coreFunnel.steps[0].sessions}
                      color={COLORS.accentDark}
                    />
                  ))}

                  <View
                    style={{
                      marginTop: 4,
                      borderRadius: 14,
                      backgroundColor: COLORS.accent2,
                      padding: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="swap-vertical-outline" size={15} color={COLORS.accentDark} />
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 12.5, flex: 1 }}>
                      Sesiones con scroll (en cualquier punto del recorrido): {coreFunnel.scroll}
                    </Text>
                  </View>
                </View>
              )}
            </SectionCard>

            <View style={{ flexDirection: isMobile ? "column" : "row", gap: 14 }}>
              <View style={{ flex: 1 }}>
                <SectionCard title="Categorías más vistas" subtitle="Sesiones que entraron en cada categoría.">
                  {topCategories.length === 0 ? (
                    <Text style={{ color: COLORS.muted, lineHeight: 20 }}>Sin datos en este rango.</Text>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {topCategories.map((c) => (
                        <BarRow
                          key={c.step_label}
                          label={c.step_label.replace(/^Categoría /, "")}
                          value={c.sessions}
                          maxValue={topCategories[0].sessions}
                          color="#22C55E"
                        />
                      ))}
                    </View>
                  )}
                </SectionCard>
              </View>

              <View style={{ flex: 1 }}>
                <SectionCard title="Productos más vistos" subtitle="Sesiones que abrieron la ficha de cada producto.">
                  {topProducts.length === 0 ? (
                    <Text style={{ color: COLORS.muted, lineHeight: 20 }}>Sin datos en este rango.</Text>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {topProducts.map((p) => (
                        <BarRow
                          key={p.step_label}
                          label={p.step_label.replace(/^Producto /, "")}
                          value={p.sessions}
                          maxValue={topProducts[0].sessions}
                          color="#8B5CF6"
                        />
                      ))}
                    </View>
                  )}
                </SectionCard>
              </View>
            </View>

            <View
              style={{
                borderRadius: 16,
                backgroundColor: COLORS.cardSoft,
                padding: 12,
                flexDirection: "row",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <Ionicons name="information-circle-outline" size={16} color={COLORS.muted2} />
              <Text style={{ color: COLORS.muted, lineHeight: 18, fontSize: 12.5, flex: 1 }}>
                Estos datos son de analítica propia (tabla analytics_events en Supabase), no de
                Vercel: Vercel Web Analytics no está activado en este proyecto y, aunque lo
                estuviera, solo vería la URL de cada página (por ejemplo /catalogo), no el
                detalle de qué categoría o producto se está viendo. Tus propias visitas como
                administrador no se cuentan en estas cifras.
              </Text>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
