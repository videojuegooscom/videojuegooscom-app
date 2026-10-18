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
 *   30 días. Las fechas se tratan como días completos en hora de España
 *   (Europe/Madrid, de 00:00 a 00:00 del día siguiente, con horario de
 *   verano). Ojo: la agrupación por día de "Crecimiento de visitantes" la
 *   hace la función SQL analytics_daily_visitors en la zona del servidor.
 * - "Conversiones por día": lee directamente analytics_events (RLS exige
 *   is_admin()) los eventos add_to_cart, buy_now, begin_checkout y
 *   order_whatsapp del rango y los cuenta por día de Madrid en el cliente.
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
  KeyboardAvoidingView,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import CargaMarca from "../../components/marca/CargaMarca";

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
  // Azul oscuro de la tienda (botón principal, mismo que "Comprar"/"Confirmar pedido").
  accentDark: "#1EA7E8",
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

// "on-drag" en web cierra el teclado con CUALQUIER desplazamiento, también el que hace el
// propio navegador al enfocar un campo (el campo se cerraba solo): solo se usa en nativo.
const CIERRE_TECLADO: "none" | "on-drag" = Platform.OS === "web" ? "none" : "on-drag";

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

// Las fechas del panel son días de calendario de España (Europe/Madrid).
// Internamente cada día se representa como un Date a las 00:00 UTC de ese
// día de calendario (solo para sumar/restar días), y al consultar Supabase
// se convierte al instante real de las 00:00 en Madrid (con su horario de
// verano/invierno).
const TZ = "Europe/Madrid";

const madridPartsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function madridParts(instant: Date) {
  const out: Record<string, number> = {};
  for (const p of madridPartsFmt.formatToParts(instant)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** "AAAA-MM-DD" del día de calendario en Madrid para un instante dado. */
function madridDateStr(instant: Date) {
  const p = madridParts(instant);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

// Diferencia (ms) entre la hora de Madrid y UTC en ese instante (+1h o +2h).
function madridOffsetMs(instantMs: number) {
  const p = madridParts(new Date(instantMs));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

/** Instante ISO de las 00:00 (hora de Madrid) del día "AAAA-MM-DD". */
function madridMidnightIso(dateStr: string) {
  const wallAsUtc = Date.parse(`${dateStr}T00:00:00.000Z`);
  let utc = wallAsUtc - madridOffsetMs(wallAsUtc);
  utc = wallAsUtc - madridOffsetMs(utc);
  return new Date(utc).toISOString();
}

function toDateOnly(d: Date) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function todayMadrid() {
  return new Date(`${madridDateStr(new Date())}T00:00:00.000Z`);
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
  const toExclusive = toDateOnly(addDaysUTC(new Date(`${toStr}T00:00:00.000Z`), 1));
  return { pFrom: madridMidnightIso(fromStr), pTo: madridMidnightIso(toExclusive) };
}

// Eventos de conversión que registran la ficha, la cesta y el checkout.
const CONVERSION_EVENTS = [
  { key: "add_to_cart", label: "Añadir a la cesta" },
  { key: "buy_now", label: "Comprar ya" },
  { key: "begin_checkout", label: "Inicio de pago" },
  { key: "order_whatsapp", label: "Pedido por WhatsApp" },
] as const;

type ConversionKey = (typeof CONVERSION_EVENTS)[number]["key"];
type ConversionDay = { day: string } & Record<ConversionKey, number>;

function emptyConversionCounts(): Record<ConversionKey, number> {
  return { add_to_cart: 0, buy_now: 0, begin_checkout: 0, order_whatsapp: 0 };
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
        borderRadius: 16,
        backgroundColor: COLORS.cardSoft,
        padding: isMobile ? 12 : 14,
        alignItems: "center",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%" }}>
        {icon ? <Ionicons name={icon} size={13} color={COLORS.muted2} /> : null}
        <Text style={{ color: COLORS.muted2, fontWeight: "700", fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: isMobile ? 18 : 20, marginTop: 6, textAlign: "center" }}>
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
      <View style={{ alignItems: "center" }}>
        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>{title}</Text>
        {!!subtitle && (
          <Text style={{ color: COLORS.muted, marginTop: 3, lineHeight: 18, fontSize: 12.5, textAlign: "center" }}>
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
  const insets = useSafeAreaInsets();

  const [preset, setPreset] = useState<DatePreset>("30d");
  const today = useMemo(() => todayMadrid(), []);
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
  const [conversions, setConversions] = useState<ConversionDay[]>([]);

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

      const [totalsRes, dailyRes, funnelRes, convRes] = await Promise.all([
        supabase.rpc("analytics_totals", { p_from: pFrom, p_to: pTo }),
        supabase.rpc("analytics_daily_visitors", { p_from: pFrom, p_to: pTo }),
        supabase.rpc("analytics_funnel", { p_from: pFrom, p_to: pTo }),
        supabase
          .from("analytics_events")
          .select("event_name, created_at")
          .in(
            "event_name",
            CONVERSION_EVENTS.map((c) => c.key)
          )
          .gte("created_at", pFrom)
          .lt("created_at", pTo)
          .order("created_at", { ascending: false })
          .limit(5000),
      ]);

      if (totalsRes.error) throw totalsRes.error;
      if (dailyRes.error) throw dailyRes.error;
      if (funnelRes.error) throw funnelRes.error;

      // Conversiones por día (de Madrid). Si la consulta falla, el resto del
      // panel se muestra igual y este bloque queda vacío.
      const byDay = new Map<string, Record<ConversionKey, number>>();
      if (!convRes.error) {
        for (const r of (convRes.data ?? []) as { event_name: string; created_at: string }[]) {
          const key = r.event_name as ConversionKey;
          const day = madridDateStr(new Date(r.created_at));
          const counts = byDay.get(day) ?? emptyConversionCounts();
          if (key in counts) counts[key] += 1;
          byDay.set(day, counts);
        }
      } else {
        console.error("Error cargando conversiones:", convRes.error);
      }
      setConversions(
        Array.from(byDay.entries())
          .sort((a, b) => (a[0] < b[0] ? 1 : -1))
          .map(([day, counts]) => ({ day, ...counts }))
      );

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
      setConversions([]);
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

  // Guía de Blue y formulario de Vender: pasos de la guía (en orden), cómo termina y qué pasa
  // después en el formulario (abierto y enviado, y de ellos cuántos venían de la guía).
  const guiaVender = useMemo(() => {
    const filas = (prefijo: string) =>
      funnel
        .filter((f) => f.step_label.startsWith(prefijo))
        .sort((a, b) => a.step_label.localeCompare(b.step_label));
    const pasos = filas("Guía Blue: ").filter((f) => /^Guía Blue: \d\d /.test(f.step_label));
    const exacto = (label: string) => funnel.find((f) => f.step_label === label)?.sessions ?? 0;
    const empiezan = pasos[0]?.sessions ?? 0;
    const desdeGuia = exacto("Vender: abierto desde la guía");
    return {
      pasos,
      empiezan,
      completada: exacto("Guía Blue: completada"),
      saltada: exacto("Guía Blue: saltada"),
      pulsaFormulario: exacto("Guía Blue: pulsa «Abrir el formulario»"),
      abierto: exacto("Vender: abierto"),
      abiertoGuia: desdeGuia,
      enviado: exacto("Vender: enviado"),
      enviadoGuia: exacto("Vender: enviado desde la guía"),
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

  const conversionTotals = useMemo(() => {
    const totalsAcc = emptyConversionCounts();
    for (const d of conversions) {
      for (const c of CONVERSION_EVENTS) totalsAcc[c.key] += d[c.key];
    }
    return totalsAcc;
  }, [conversions]);

  const rangeLabel = useMemo(() => {
    if (fromDate === toDate) return `${fromDate} (hora de Madrid)`;
    return `${fromDate} → ${toDate} (hora de Madrid)`;
  }, [fromDate, toDate]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />

      {/* Cabecera fija y compacta (volver al panel + título centrado). El filtro de fechas
          va dentro del scroll: fijo arriba ocupaba casi media pantalla del móvil. */}
      <View
        style={{
          backgroundColor: COLORS.bg2,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
          paddingHorizontal: pagePadding,
          paddingTop: (isMobile ? 10 : 12) + insets.top,
          paddingBottom: isMobile ? 10 : 12,
        }}
      >
        <View style={{ width: "100%", maxWidth: 1040, alignSelf: "center", minHeight: 40, justifyContent: "center" }}>
          <Pressable
            onPress={smartBackAdminHome}
            accessibilityRole="button"
            accessibilityLabel="Volver al panel"
            hitSlop={8}
            style={({ pressed }) => ({
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 40,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </Pressable>
          <Text
            style={{
              color: COLORS.text,
              fontSize: isMobile ? 19 : 22,
              fontWeight: "900",
              textAlign: "center",
              paddingHorizontal: 44,
            }}
          >
            Visitas y métricas
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: pagePadding, paddingBottom: 48 + insets.bottom, alignItems: "center" }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={CIERRE_TECLADO}
        >
        <View style={{ width: "100%", maxWidth: 1040, gap: 16 }}>
          <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
            Visitantes, recorrido por la tienda y crecimiento en el rango de fechas elegido.
          </Text>

          <View
            style={{
              borderRadius: 18,
              backgroundColor: COLORS.card,
              padding: 12,
              gap: 10,
            }}
          >
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
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
                  // 16 px: con menos, Safari (iPhone) hace zoom al enfocar y la pantalla
                  // se queda ampliada y "descuadrada".
                  fontSize: 16,
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
                  fontSize: 16,
                }}
              />
              <Pressable
                onPress={applyCustomRange}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  opacity: pressed ? 0.9 : 1,
                  borderRadius: 999,
                  paddingVertical: 11,
                  paddingHorizontal: 18,
                  backgroundColor: COLORS.accentDark,
                  alignItems: "center",
                })}
              >
                <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 14 }}>Aplicar</Text>
              </Pressable>
            </View>

            {!!dateErr && (
              <Text style={{ color: COLORS.danger, fontWeight: "700", fontSize: 12.5, textAlign: "center" }}>
                {dateErr}
              </Text>
            )}

            <Text style={{ color: COLORS.muted, fontSize: 12, fontWeight: "700", textAlign: "center" }}>
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
              <Text style={{ color: COLORS.danger, fontWeight: "800", lineHeight: 20, textAlign: "center" }}>
                {screenErr}
              </Text>
            </View>
          )}

          {/* Al cambiar el rango solo se recargan los datos: el filtro sigue a la vista. */}
          {loading ? (
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 32 }}>
              <CargaMarca texto="Cargando métricas…" />
            </View>
          ) : (
          <>
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
                <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
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
                <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
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

            <SectionCard
              title="Guía de Blue y Vender"
              subtitle="Sesiones que llegan a cada paso de la guía y qué pasa después con el formulario de Vender (solo visitantes que aceptaron la analítica)."
            >
              {guiaVender.empiezan === 0 ? (
                <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
                  Todavía no hay datos de la guía en este rango de fechas.
                </Text>
              ) : (
                <View style={{ gap: 10 }}>
                  {guiaVender.pasos.map((s) => (
                    <BarRow
                      key={s.step_label}
                      label={s.step_label.replace(/^Guía Blue: \d\d /, "")}
                      value={s.sessions}
                      maxValue={guiaVender.empiezan}
                      color={COLORS.accentDark}
                    />
                  ))}
                  <BarRow label="Guía completada" value={guiaVender.completada} maxValue={guiaVender.empiezan} color={COLORS.accentDark} />
                  <BarRow label="Guía saltada" value={guiaVender.saltada} maxValue={guiaVender.empiezan} color={COLORS.accentDark} />
                  <BarRow label="Pulsan «Abrir el formulario» en la guía" value={guiaVender.pulsaFormulario} maxValue={guiaVender.empiezan} color={COLORS.accentDark} />
                  <BarRow label="Formulario abierto desde la guía" value={guiaVender.abiertoGuia} maxValue={guiaVender.empiezan} color={COLORS.accentDark} />
                  <BarRow label="Formulario enviado desde la guía" value={guiaVender.enviadoGuia} maxValue={guiaVender.empiezan} color={COLORS.accentDark} />
                  <View style={{ marginTop: 4, borderRadius: 14, backgroundColor: COLORS.accent2, padding: 10, gap: 4 }}>
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 12.5 }}>
                      Formulario de Vender (todas las vías): abierto {guiaVender.abierto} · enviado {guiaVender.enviado}
                    </Text>
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 12.5 }}>
                      De cada 100 que empiezan la guía, {Math.round((guiaVender.abiertoGuia / guiaVender.empiezan) * 100)} abren el formulario y{" "}
                      {Math.round((guiaVender.enviadoGuia / guiaVender.empiezan) * 100)} lo envían.
                    </Text>
                  </View>
                </View>
              )}
            </SectionCard>

            <SectionCard
              title="Conversiones por día"
              subtitle="Veces que se pulsó cada acción de compra, por día (hora de Madrid)."
            >
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {CONVERSION_EVENTS.map((c) => (
                  <View
                    key={c.key}
                    style={{
                      borderRadius: 12,
                      backgroundColor: COLORS.accent2,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                    }}
                  >
                    <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 12.5 }}>
                      {c.label}: {conversionTotals[c.key]}
                    </Text>
                  </View>
                ))}
              </View>

              {conversions.length === 0 ? (
                <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>
                  Todavía no hay conversiones registradas en este rango de fechas.
                </Text>
              ) : (
                <View style={{ gap: 6 }}>
                  {conversions.map((d) => (
                    <View
                      key={d.day}
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: 10,
                        paddingVertical: 6,
                        borderTopWidth: 1,
                        borderTopColor: COLORS.border,
                      }}
                    >
                      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 12.5, minWidth: 48 }}>
                        {fmtDayLabel(d.day)}
                      </Text>
                      {CONVERSION_EVENTS.map((c) => (
                        <Text key={c.key} style={{ color: COLORS.muted, fontWeight: "700", fontSize: 12.5 }}>
                          {c.label}: {d[c.key]}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              )}
            </SectionCard>

            <View style={{ flexDirection: isMobile ? "column" : "row", gap: 14 }}>
              <View style={{ flex: 1 }}>
                <SectionCard title="Categorías más vistas" subtitle="Sesiones que entraron en cada categoría.">
                  {topCategories.length === 0 ? (
                    <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>Sin datos en este rango.</Text>
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
                    <Text style={{ color: COLORS.muted, lineHeight: 20, textAlign: "center" }}>Sin datos en este rango.</Text>
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

            {/* Nota final como texto suelto centrado, sin recuadro decorativo. */}
            <View style={{ alignItems: "center", gap: 6, paddingHorizontal: 8 }}>
              <Ionicons name="information-circle-outline" size={16} color={COLORS.muted2} />
              <Text style={{ color: COLORS.muted, lineHeight: 18, fontSize: 12.5, textAlign: "center" }}>
                Estos datos son de analítica propia (tabla analytics_events en Supabase), no de
                Vercel: Vercel Web Analytics no está activado en este proyecto y, aunque lo
                estuviera, solo vería la URL de cada página (por ejemplo /catalogo), no el
                detalle de qué categoría o producto se está viendo. Tus propias visitas como
                administrador no se cuentan en estas cifras.
              </Text>
            </View>
          </>
          )}
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
