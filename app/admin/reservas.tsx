// app/admin/reservas.tsx
/**
 * Qué hace: Administración → «Reservas con señal» (dueño, 2026-11-15, mejora 14: señal del 1 % al 70 % según los días,
 * pagada con Stripe, condiciones de arras aceptadas con casilla y reglas configurables aquí). APAGADA Y VACÍA: el dueño
 * aún no ha dado su escala, los días máximos, el tipo de arras ni qué pasa al vencer, y su gestor tiene que revisar el texto.
 *
 * Cómo funciona:
 * - Tarjeta «Reservas con señal»: interruptor (NO deja activar si falta alguna regla, si «Revisado por mi gestor» no está
 *   marcado o si el texto aún dice «Pendiente de revisión del gestor»; lo comprueba también la base de datos), editor de la
 *   escala (filas «hasta N días → %»: 1-70 % y días crecientes), días máximos, tipo de arras con una explicación neutra de
 *   cada uno, un plegable «Qué dice la ley» (penitenciales frente a confirmatorias con el ejemplo de una PS5 y enlaces al
 *   BOE), «Qué pasa al vencer» (texto del dueño), el texto de las condiciones (precargado con el BORRADOR para el gestor de
 *   lib/reservas.ts: dos variantes de arras y huecos [A DECIDIR POR EL DUEÑO]) y la casilla «Revisado por mi gestor» (se
 *   desmarca sola al cambiar el texto).
 * - Uso (30 días, analítica propia sin datos personales): reserva_abierta, reserva_pagar y reserva_pagada.
 * - Lista de reservas (activas, vencidas, completadas o todas) con artículo, señal, vencimiento y estado; «Marcar completada»,
 *   «Cancelar» y «Marcar vencida» van por api/pago.ts («reserva_estado», solo el administrador): solo cambian el estado y
 *   sueltan el artículo. NO hay reembolsos automáticos: si procede, se hace en Stripe.
 * - Tamaños de constants/theme.ts: todo lo que se toca de 44 px, campos de 16 px.
 *
 * Conectado con: app/admin/index.tsx (tarjeta «Reservas con señal»), app/admin/_layout.tsx (ruta), lib/reservas.ts,
 * api/pago.ts, supabase/migrations/20261115150000_reservas_senal.sql y pruebas/perfil-datos.mjs (sección RESEN).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StatusBar, Switch, Text, TextInput, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import CargaMarca from "../../components/marca/CargaMarca";
import { CAMPO, COLORES_TEXTO, TACTIL, TAMANOS } from "../../constants/theme";
import {
  BORRADOR_CONDICIONES_RESERVA,
  EXPLICACION_ARRAS,
  eurosReserva,
  fechaReserva,
  problemasTextoClienteReserva,
  URL_PAGO,
  validarEscalaReserva,
  type TipoArras,
  type TramoReservaSenal,
} from "../../lib/reservas";

const CIERRE_TECLADO: "none" | "on-drag" = Platform.OS === "web" ? "none" : "on-drag";
const MIGRACION = "supabase/migrations/20261115150000_reservas_senal.sql";
const MARCA_RE = /pendiente de revisión del gestor/i;

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  card: "#F6FAFD",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: COLORES_TEXTO.secundario,
  accent: "#1EA7E8",
  accentText: COLORES_TEXTO.azulTexto,
  success: "#15803D",
  danger: "#B91C1C",
  dangerBg: "#FFE4E6",
  warnBg: "#FFF7E6",
  warn: "#8A5A00",
};

type Ajustes = {
  activa: boolean;
  escala: TramoReservaSenal[] | null;
  dias_max: number | null;
  tipo_arras: TipoArras | null;
  al_vencer: string | null;
  texto_condiciones: string | null;
  condiciones_revisadas: boolean;
};
type FilaTramo = { dias: string; pct: string };
type Reserva = {
  id: string;
  producto_titulo: string | null;
  product_id: string | null;
  dias: number;
  porcentaje: number | string;
  senal_eur: number | string;
  precio_eur: number | string;
  vence_en: string;
  estado: string;
  tipo_arras: string;
  creado_en: string;
  pagado_en: string | null;
};
type Filtro = "activas" | "vencidas" | "completadas" | "todas";

const ESTADOS: Record<string, string> = {
  pendiente_pago: "Pendiente de pago",
  activa: "Activa",
  completada: "Completada",
  vencida: "Vencida",
  cancelada: "Cancelada",
};

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

const entero = (t: string): number | null => {
  const s = t.trim();
  if (!s) return null;
  return /^\d{1,3}$/.test(s) ? Number(s) : NaN;
};

// ¿Vencida? (activa con la fecha pasada, aunque aún no esté marcada).
const esVencida = (r: Reserva) => r.estado === "vencida" || (r.estado === "activa" && Date.parse(r.vence_en) <= Date.now());

export default function AdminReservas() {
  const { width } = useWindowDimensions();
  const isMobile = (width > 0 ? width : 1024) < 700;
  const pagePadding = isMobile ? 14 : 20;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [sinTabla, setSinTabla] = useState(false);
  const [guardado, setGuardado] = useState<Ajustes | null>(null);
  const [tramos, setTramos] = useState<FilaTramo[]>([]);
  const [diasMax, setDiasMax] = useState("");
  const [tipo, setTipo] = useState<TipoArras | null>(null);
  const [alVencer, setAlVencer] = useState("");
  const [texto, setTexto] = useState("");
  const [revisado, setRevisado] = useState(false);
  const [verLey, setVerLey] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [reservas, setReservas] = useState<Reserva[] | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("activas");
  const [uso, setUso] = useState<{ abiertas: number; pagar: number; pagadas: number } | null>(null);
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [msgLista, setMsgLista] = useState<string | null>(null);

  const aplicar = (a: Ajustes) => {
    setGuardado(a);
    setTramos((a.escala ?? []).map((t) => ({ dias: String(t.hasta_dias), pct: String(t.porcentaje) })));
    setDiasMax(a.dias_max ? String(a.dias_max) : "");
    setTipo(a.tipo_arras);
    setAlVencer(a.al_vencer ?? "");
    // Sin texto guardado, se precarga el BORRADOR genérico (no lo ve ningún cliente mientras esté apagada).
    setTexto(a.texto_condiciones ?? BORRADOR_CONDICIONES_RESERVA);
    setRevisado(a.condiciones_revisadas);
  };

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("reserva_ajustes").select("*").eq("id", 1).maybeSingle<Record<string, unknown>>();
      if (error || !data) {
        setSinTabla(true);
        return;
      }
      setSinTabla(false);
      aplicar({
        activa: data.activa === true,
        escala: Array.isArray(data.escala) ? (data.escala as TramoReservaSenal[]).map((t) => ({ hasta_dias: Number(t.hasta_dias), porcentaje: Number(t.porcentaje) })) : null,
        dias_max: data.dias_max == null ? null : Number(data.dias_max),
        tipo_arras: data.tipo_arras === "penitenciales" || data.tipo_arras === "confirmatorias" ? data.tipo_arras : null,
        al_vencer: typeof data.al_vencer === "string" ? data.al_vencer : null,
        texto_condiciones: typeof data.texto_condiciones === "string" ? data.texto_condiciones : null,
        condiciones_revisadas: data.condiciones_revisadas === true,
      });
      const r = await supabase
        .from("reservas")
        .select("id,producto_titulo,product_id,dias,porcentaje,senal_eur,precio_eur,vence_en,estado,tipo_arras,creado_en,pagado_en")
        .order("creado_en", { ascending: false })
        .limit(300);
      setReservas(r.error ? null : ((r.data ?? []) as Reserva[]));
      const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const ev = await supabase
        .from("analytics_events")
        .select("event_name")
        .in("event_name", ["reserva_abierta", "reserva_pagar", "reserva_pagada"])
        .gte("created_at", desde)
        .limit(5000);
      if (ev.error) setUso(null);
      else {
        const filas = (ev.data ?? []) as { event_name: string }[];
        const n = (x: string) => filas.filter((f) => f.event_name === x).length;
        setUso({ abiertas: n("reserva_abierta"), pagar: n("reserva_pagar"), pagadas: n("reserva_pagada") });
      }
    } catch {
      setMsg({ tipo: "error", texto: "No se han podido cargar las reservas. Inténtalo de nuevo." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Lo escrito, leído. error: el primer problema (o null si todo está bien escrito; vacío también vale para guardar).
  const leido = useMemo(() => {
    const escala: TramoReservaSenal[] = [];
    for (const [i, f] of tramos.entries()) {
      if (!f.dias.trim() && !f.pct.trim()) continue;
      const d = entero(f.dias);
      const p = entero(f.pct);
      if (d === null || p === null || Number.isNaN(d) || Number.isNaN(p)) return { error: `Tramo ${i + 1}: escribe los días y el porcentaje con números enteros.` };
      escala.push({ hasta_dias: d, porcentaje: p });
    }
    const errEscala = escala.length ? validarEscalaReserva(escala) : null;
    if (errEscala) return { error: errEscala };
    const dm = entero(diasMax);
    if (Number.isNaN(dm) || (dm !== null && (dm < 1 || dm > 365))) return { error: "Los días máximos tienen que ser un entero de 1 a 365." };
    if (dm !== null && escala.length && dm > escala[escala.length - 1].hasta_dias) return { error: "Los días máximos no pueden pasar del último tramo de la escala." };
    return {
      error: null,
      datos: {
        escala: escala.length ? escala : null,
        dias_max: dm,
        tipo_arras: tipo,
        al_vencer: alVencer.trim() || null,
        texto_condiciones: texto.trim() || null,
        condiciones_revisadas: revisado,
      },
    };
  }, [tramos, diasMax, tipo, alVencer, texto, revisado]);

  // Lo que falta para poder activarla (la misma regla que la base de datos).
  const faltan = useMemo(() => {
    const d = leido.datos;
    if (!d) return [leido.error ?? "revisa los datos"];
    const f: string[] = [];
    if (!d.escala) f.push("la escala");
    if (!d.dias_max) f.push("los días máximos");
    if (!d.tipo_arras) f.push("el tipo de arras");
    if (!d.al_vencer) f.push("qué pasa al vencer");
    if (!d.texto_condiciones) f.push("el texto de las condiciones");
    if (!d.condiciones_revisadas) f.push("marcar «Revisado por mi gestor»");
    if (d.texto_condiciones && MARCA_RE.test(d.texto_condiciones)) f.push("quitar la marca «BORRADOR · Pendiente de revisión del gestor» del texto");
    // Nada interno puede llegar al cliente (la misma comprobación que api/pago.ts y el disparador).
    f.push(...problemasTextoClienteReserva(d.texto_condiciones, d.al_vencer));
    return f;
  }, [leido]);

  const guardar = useCallback(
    async (activa: boolean, desdeInterruptor = false) => {
      // Apagar con el interruptor siempre se puede, aunque haya algo mal escrito (entonces solo se apaga). «Guardar
      // ajustes» con algo mal escrito no guarda nada y dice qué está mal.
      const cuerpo = leido.datos ? { ...leido.datos, activa } : !activa && desdeInterruptor ? { activa: false } : null;
      if (!cuerpo) {
        setMsg({ tipo: "error", texto: leido.error ?? "Revisa los datos." });
        return;
      }
      if (activa && faltan.length) {
        setMsg({ tipo: "error", texto: `No se puede activar: falta ${faltan.join(", ")}.` });
        return;
      }
      setGuardando(true);
      setMsg(null);
      try {
        const { data, error } = await supabase
          .from("reserva_ajustes")
          .update(cuerpo)
          .eq("id", 1)
          .select("*")
          .maybeSingle<Record<string, unknown>>();
        if (error) {
          setMsg({ tipo: "error", texto: error.message && /falta|escala|porcentaje|días/i.test(error.message) ? error.message : "No se han podido guardar los ajustes. Inténtalo de nuevo." });
          return;
        }
        setGuardado((prev) => ({ ...(prev as Ajustes), ...cuerpo, ...(data ? { activa: data.activa === true } : {}) }) as Ajustes);
        setMsg({ tipo: "ok", texto: activa ? "Reservas con señal ACTIVADAS: ya salen en la ficha de los artículos a la venta." : guardado?.activa ? "Reservas con señal desactivadas: la tienda ya no las ofrece." : "Ajustes guardados. Las reservas siguen desactivadas." });
      } catch {
        setMsg({ tipo: "error", texto: "No se han podido guardar los ajustes. Inténtalo de nuevo." });
      } finally {
        setGuardando(false);
      }
    },
    [leido, faltan, guardado]
  );

  const cambiarEstado = useCallback(
    async (r: Reserva, estado: "completada" | "cancelada" | "vencida") => {
      setCambiando(r.id);
      setMsgLista(null);
      try {
        const { data: s } = await supabase.auth.getSession();
        const resp = await fetch(URL_PAGO, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
          body: JSON.stringify({ accion: "reserva_estado", reserva: r.id, estado }),
        });
        const d = (await resp.json().catch(() => null)) as { ok?: boolean; estado?: string; error?: string } | null;
        if (!resp.ok || !d?.ok) {
          setMsgLista(d?.error ? `No se ha podido cambiar: ${d.error}.` : "No se ha podido cambiar la reserva. Inténtalo de nuevo.");
          return;
        }
        setReservas((lista) => (lista ?? []).map((x) => (x.id === r.id ? { ...x, estado: d.estado ?? estado } : x)));
        setMsgLista(
          estado === "cancelada"
            ? "Reserva cancelada y artículo liberado. Si procede devolver la señal, hazlo desde Stripe (aquí no se devuelve dinero)."
            : estado === "completada"
              ? "Reserva marcada como completada y artículo liberado."
              : "Reserva marcada como vencida y artículo liberado."
        );
      } catch {
        setMsgLista("No se ha podido cambiar la reserva: revisa tu conexión.");
      } finally {
        setCambiando(null);
      }
    },
    []
  );

  const lista = useMemo(() => {
    const todas = reservas ?? [];
    if (filtro === "todas") return todas;
    if (filtro === "vencidas") return todas.filter(esVencida);
    if (filtro === "completadas") return todas.filter((r) => r.estado === "completada");
    return todas.filter((r) => (r.estado === "activa" || r.estado === "pendiente_pago") && !esVencida(r));
  }, [reservas, filtro]);
  const cuenta = (f: Filtro) => {
    const todas = reservas ?? [];
    if (f === "todas") return todas.length;
    if (f === "vencidas") return todas.filter(esVencida).length;
    if (f === "completadas") return todas.filter((r) => r.estado === "completada").length;
    return todas.filter((r) => (r.estado === "activa" || r.estado === "pendiente_pago") && !esVencida(r)).length;
  };

  const campo = (props: React.ComponentProps<typeof TextInput>) => (
    <TextInput
      placeholderTextColor="rgba(11,33,56,0.45)"
      {...props}
      style={[
        {
          minHeight: CAMPO.alto,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: "#FFFFFF",
          paddingHorizontal: 12,
          paddingVertical: props.multiline ? 10 : 0,
          color: COLORS.text,
          fontSize: CAMPO.letra,
          fontWeight: props.multiline ? "400" : "600",
          lineHeight: props.multiline ? 22 : undefined,
          textAlignVertical: props.multiline ? "top" : "center",
        },
        props.style,
      ]}
    />
  );
  const etiqueta = (t: string) => <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo }}>{t}</Text>;
  const tarjeta = { borderRadius: 20, backgroundColor: COLORS.card, padding: isMobile ? 14 : 18, gap: 10 } as const;
  const activa = guardado?.activa === true;
  const esBorrador = MARCA_RE.test(texto);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />
      <View style={{ backgroundColor: COLORS.bg2, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingHorizontal: pagePadding, paddingTop: (isMobile ? 10 : 12) + insets.top, paddingBottom: isMobile ? 10 : 12 }}>
        <View style={{ width: "100%", maxWidth: 860, alignSelf: "center", minHeight: TACTIL.minimo, justifyContent: "center" }}>
          <Pressable
            onPress={smartBackAdminHome}
            accessibilityRole="button"
            accessibilityLabel="Volver al panel"
            hitSlop={8}
            style={({ pressed }) => ({ position: "absolute", zIndex: 1, left: 0, top: 0, bottom: 0, width: TACTIL.minimo, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </Pressable>
          <Text style={{ color: COLORS.text, fontSize: isMobile ? 19 : 22, fontWeight: "900", textAlign: "center", paddingHorizontal: 44 }}>Reservas con señal</Text>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <CargaMarca texto="Cargando…" />
        </View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: pagePadding, paddingBottom: 48 + insets.bottom, alignItems: "center" }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={CIERRE_TECLADO}
          >
            <View style={{ width: "100%", maxWidth: 860, gap: 16 }}>
              {sinTabla ? (
                <View nativeID="reservas-sin-migracion" style={{ borderRadius: 14, backgroundColor: COLORS.dangerBg, padding: 12, gap: 4 }}>
                  <Text style={{ color: COLORS.danger, fontWeight: "900", textAlign: "center" }}>Falta preparar la base de datos</Text>
                  <Text style={{ color: COLORS.danger, lineHeight: 20, textAlign: "center" }}>
                    Hay que aplicar {MIGRACION}. Hasta entonces la tienda no ofrece reservas con señal.
                  </Text>
                </View>
              ) : (
                <>
                  <View nativeID="reservas-ajustes" style={tarjeta}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16 }}>Reservas con señal</Text>
                        <Text nativeID="reservas-estado" style={{ color: activa ? COLORS.success : COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo + 0.5 }}>
                          {activa ? "Activadas: se ofrecen en la ficha de los artículos a la venta" : "Desactivadas: ningún cliente ve nada"}
                        </Text>
                      </View>
                      <Switch
                        nativeID="reservas-interruptor"
                        value={activa}
                        disabled={guardando}
                        onValueChange={(v) => guardar(v, true)}
                        accessibilityLabel="Activar las reservas con señal"
                      />
                    </View>
                    {!activa && faltan.length ? (
                      <Text nativeID="reservas-faltan" style={{ color: COLORS.warn, backgroundColor: COLORS.warnBg, borderRadius: 12, padding: 10, fontSize: TAMANOS.minimo + 0.5, lineHeight: 19 }}>
                        Para activarlas falta: {faltan.join(", ")}.
                      </Text>
                    ) : null}
                    {msg ? (
                      <Text nativeID="reservas-mensaje" style={{ color: msg.tipo === "ok" ? COLORS.success : COLORS.danger, fontWeight: "800", lineHeight: 20 }}>
                        {msg.texto}
                      </Text>
                    ) : null}

                    {etiqueta("Escala de la señal (cada tramo: hasta cuántos días → qué porcentaje del precio, del 1 al 70 %)")}
                    {tramos.length === 0 ? (
                      <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo + 0.5 }}>Sin tramos: pon los tuyos (la tienda no propone ninguno).</Text>
                    ) : (
                      <View style={{ flexDirection: "row", gap: 8, paddingRight: TACTIL.minimo + 8 }}>
                        <Text style={{ flex: 1, color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo }}>Hasta (días)</Text>
                        <Text style={{ flex: 1, color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo }}>Señal (% del precio)</Text>
                      </View>
                    )}
                    {tramos.map((t, i) => (
                      <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          {campo({
                            nativeID: `reservas-tramo-dias-${i}`,
                            value: t.dias,
                            onChangeText: (v) => setTramos((l) => l.map((x, j) => (j === i ? { ...x, dias: v.replace(/[^0-9]/g, "").slice(0, 3) } : x))),
                            keyboardType: "number-pad",
                            placeholder: "Hasta días",
                            accessibilityLabel: `Tramo ${i + 1}: hasta cuántos días`,
                          })}
                        </View>
                        <View style={{ flex: 1 }}>
                          {campo({
                            nativeID: `reservas-tramo-pct-${i}`,
                            value: t.pct,
                            onChangeText: (v) => setTramos((l) => l.map((x, j) => (j === i ? { ...x, pct: v.replace(/[^0-9]/g, "").slice(0, 3) } : x))),
                            keyboardType: "number-pad",
                            placeholder: "Porcentaje",
                            accessibilityLabel: `Tramo ${i + 1}: porcentaje`,
                          })}
                        </View>
                        <Pressable
                          nativeID={`reservas-tramo-quitar-${i}`}
                          onPress={() => setTramos((l) => l.filter((_, j) => j !== i))}
                          accessibilityRole="button"
                          accessibilityLabel={`Quitar el tramo ${i + 1}`}
                          style={({ pressed }) => ({ width: TACTIL.minimo, height: TACTIL.minimo, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
                        >
                          <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
                        </Pressable>
                      </View>
                    ))}
                    <Pressable
                      nativeID="reservas-tramo-anadir"
                      onPress={() => setTramos((l) => (l.length >= 12 ? l : [...l, { dias: "", pct: "" }]))}
                      accessibilityRole="button"
                      style={({ pressed }) => ({ alignSelf: "flex-start", minHeight: TACTIL.minimo, flexDirection: "row", alignItems: "center", gap: 6, opacity: pressed ? 0.6 : 1 })}
                    >
                      <Ionicons name="add-circle-outline" size={18} color={COLORS.accent} />
                      <Text style={{ color: COLORS.accentText, fontWeight: "800" }}>Añadir tramo</Text>
                    </Pressable>

                    {etiqueta("Días máximos de reserva")}
                    {campo({ nativeID: "reservas-dias-max", value: diasMax, onChangeText: (v) => setDiasMax(v.replace(/[^0-9]/g, "").slice(0, 3)), keyboardType: "number-pad", placeholder: "Sin poner", accessibilityLabel: "Días máximos de reserva" })}

                    {etiqueta("Tipo de arras (explicación orientativa: confírmala con tu gestor)")}
                    {(["penitenciales", "confirmatorias"] as const).map((t) => (
                      <Pressable
                        key={t}
                        nativeID={`reservas-arras-${t}`}
                        onPress={() => setTipo(t)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: tipo === t }}
                        style={({ pressed }) => ({ minHeight: TACTIL.minimo, flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 6, opacity: pressed ? 0.8 : 1 })}
                      >
                        <Ionicons name={tipo === t ? "radio-button-on" : "radio-button-off"} size={22} color={tipo === t ? COLORS.accent : COLORS.muted} />
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={{ color: COLORS.text, fontWeight: "800" }}>{EXPLICACION_ARRAS[t].titulo}</Text>
                          <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo + 0.5, lineHeight: 19 }}>{EXPLICACION_ARRAS[t].texto}</Text>
                        </View>
                      </Pressable>
                    ))}

                    <View nativeID="reservas-ley" style={{ borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: "#FFFFFF", paddingHorizontal: 12 }}>
                      <Pressable
                        nativeID="reservas-ley-abrir"
                        onPress={() => setVerLey((v) => !v)}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: verLey }}
                        aria-expanded={verLey}
                        style={({ pressed }) => ({ minHeight: TACTIL.minimo, flexDirection: "row", alignItems: "center", gap: 8, opacity: pressed ? 0.7 : 1 })}
                      >
                        <Ionicons name="book-outline" size={18} color={COLORS.accent} />
                        <Text style={{ flex: 1, color: COLORS.text, fontWeight: "800" }}>Qué dice la ley</Text>
                        <Ionicons name={verLey ? "chevron-up" : "chevron-down"} size={18} color={COLORS.muted} />
                      </Pressable>
                      {verLey ? (
                        <View nativeID="reservas-ley-texto" style={{ gap: 6, paddingBottom: 12 }}>
                          {[
                            "Ejemplo: una PS5 de 450 € con una señal del 20 % = 90 €.",
                            "Arras penitenciales (art. 1454 del Código Civil): cada parte puede echarse atrás. Si el cliente no compra, pierde los 90 €; si la tienda no cumple, devuelve el doble: 180 €.",
                            "Arras confirmatorias (lo que se entiende si no se pacta otra cosa): los 90 € son parte del precio y prueban la compra. Si alguien no cumple, la otra parte puede exigir que se cumpla o resolver la compra con indemnización de daños (art. 1124 del Código Civil).",
                            "En ambos casos la tienda no puede quedarse la señal si el cliente renuncia sin dar algo equivalente si renuncia ella (art. 87.2 de la Ley de Consumidores). Y en la venta a distancia queda el desistimiento de 14 días naturales (arts. 102 a 108): tu gestor tiene que revisar cómo encaja.",
                            "Explicación orientativa, citada de memoria: compruébala en el BOE con tu gestor.",
                          ].map((l, i) => (
                            <Text key={i} style={{ color: i === 0 ? COLORS.text : COLORS.muted, fontWeight: i === 0 ? "800" : "400", fontSize: TAMANOS.minimo + 0.5, lineHeight: 19 }}>
                              {l}
                            </Text>
                          ))}
                          <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 16 }}>
                            {(
                              [
                                ["reservas-ley-cc", "Código Civil en el BOE", "https://www.boe.es/buscar/act.php?id=BOE-A-1889-4763"],
                                ["reservas-ley-lgdcu", "Ley de Consumidores en el BOE", "https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555"],
                              ] as const
                            ).map(([id, t, url]) => (
                              <Pressable
                                key={id}
                                nativeID={id}
                                onPress={() => Linking.openURL(url).catch(() => undefined)}
                                accessibilityRole="link"
                                style={({ pressed }) => ({ minHeight: TACTIL.minimo, justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
                              >
                                <Text style={{ color: COLORS.accentText, fontWeight: "800", textDecorationLine: "underline", fontSize: TAMANOS.minimo + 0.5 }}>{t}</Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      ) : null}
                    </View>

                    {etiqueta("Qué pasa al vencer (lo verá el cliente antes de pagar)")}
                    {campo({ nativeID: "reservas-al-vencer", value: alVencer, onChangeText: setAlVencer, multiline: true, maxLength: 2000, placeholder: "Sin poner: escribe qué pasa si la compra no se completa a tiempo", style: { minHeight: 90 }, accessibilityLabel: "Qué pasa al vencer" })}

                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {etiqueta("Condiciones de la reserva (texto completo)")}
                      {esBorrador ? (
                        <Text nativeID="reservas-borrador" style={{ color: COLORS.warn, backgroundColor: COLORS.warnBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, fontWeight: "900", fontSize: TAMANOS.minimo }}>
                          Borrador · pendiente del gestor
                        </Text>
                      ) : null}
                    </View>
                    {campo({
                      nativeID: "reservas-condiciones",
                      value: texto,
                      onChangeText: (v) => {
                        setTexto(v);
                        // Un texto cambiado ya no es el que revisó el gestor.
                        setRevisado(false);
                      },
                      multiline: true,
                      maxLength: 20000,
                      style: { minHeight: 220 },
                      accessibilityLabel: "Condiciones de la reserva",
                    })}
                    <Text nativeID="reservas-marcas-ayuda" style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, lineHeight: 18 }}>
                      {"{porcentaje}, {dias}, {fecha_vencimiento}, {senal_eur} y {precio_eur} se rellenan solas con los datos de cada reserva (por ejemplo «20 %», «14 días», «30 de noviembre de 2026», «90,00 €»). Las notas internas del borrador hay que quitarlas: con ellas no se puede activar."}
                    </Text>

                    <Pressable
                      nativeID="reservas-revisado"
                      onPress={() => setRevisado((v) => !v)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: revisado }}
                      aria-checked={revisado}
                      style={({ pressed }) => ({ minHeight: TACTIL.minimo, flexDirection: "row", alignItems: "center", gap: 10, opacity: pressed ? 0.8 : 1 })}
                    >
                      <Ionicons name={revisado ? "checkbox" : "square-outline"} size={24} color={revisado ? COLORS.accent : COLORS.text} />
                      <Text style={{ flex: 1, color: COLORS.text, fontWeight: "800" }}>Revisado por mi gestor</Text>
                    </Pressable>

                    <Pressable
                      nativeID="reservas-guardar"
                      onPress={() => guardar(activa)}
                      disabled={guardando}
                      accessibilityRole="button"
                      style={({ pressed }) => ({ minHeight: 50, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.accent, opacity: guardando ? 0.6 : pressed ? 0.88 : 1 })}
                    >
                      {guardando ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="save-outline" size={18} color="#FFFFFF" />}
                      <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 15 }}>Guardar ajustes</Text>
                    </Pressable>
                  </View>

                  {uso ? (
                    <View nativeID="reservas-uso" style={[tarjeta, { gap: 4 }]}>
                      <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>Uso (30 días)</Text>
                      <Text nativeID="reservas-uso-cifras" style={{ color: COLORS.text, fontWeight: "800", textAlign: "center" }}>
                        Hojas abiertas {uso.abiertas} · a pagar {uso.pagar} · señales pagadas {uso.pagadas}
                      </Text>
                      <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, textAlign: "center" }}>Analítica propia, sin datos personales (no cuenta a quien la rechazó).</Text>
                    </View>
                  ) : null}

                  <View nativeID="reservas-lista" style={tarjeta}>
                    <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: 16, textAlign: "center" }}>Reservas de los clientes</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
                      {(
                        [
                          ["activas", "Activas"],
                          ["vencidas", "Vencidas"],
                          ["completadas", "Completadas"],
                          ["todas", "Todas"],
                        ] as const
                      ).map(([f, t]) => (
                        <Pressable
                          key={f}
                          nativeID={`reservas-filtro-${f}`}
                          onPress={() => setFiltro(f)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: filtro === f }}
                          style={({ pressed }) => ({
                            minHeight: TACTIL.minimo,
                            justifyContent: "center",
                            paddingHorizontal: 14,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: filtro === f ? COLORS.accent : COLORS.border,
                            backgroundColor: filtro === f ? "#EAF6FD" : "#FFFFFF",
                            opacity: pressed ? 0.8 : 1,
                          })}
                        >
                          <Text style={{ color: COLORS.text, fontWeight: "800" }}>
                            {t} ({cuenta(f)})
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, lineHeight: 18, textAlign: "center" }}>
                      Cancelar o completar no devuelve dinero: si procede, el reembolso se hace en Stripe.
                    </Text>
                    {msgLista ? (
                      <Text nativeID="reservas-lista-mensaje" style={{ color: COLORS.text, fontWeight: "800", lineHeight: 20, textAlign: "center" }}>
                        {msgLista}
                      </Text>
                    ) : null}
                    {reservas === null ? (
                      <Text style={{ color: COLORS.muted, textAlign: "center" }}>No se han podido leer las reservas.</Text>
                    ) : lista.length === 0 ? (
                      <Text nativeID="reservas-vacia" style={{ color: COLORS.muted, textAlign: "center" }}>
                        No hay reservas {filtro === "todas" ? "todavía" : filtro}.
                      </Text>
                    ) : (
                      lista.map((r) => {
                        const vencida = esVencida(r);
                        const abierta = r.estado === "activa" || r.estado === "pendiente_pago";
                        return (
                          <View key={r.id} nativeID={`reserva-${r.id}`} style={{ borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10, gap: 4 }}>
                            <Text style={{ color: COLORS.text, fontWeight: "900" }}>{r.producto_titulo ?? "Artículo"}</Text>
                            <Text nativeID={`reserva-datos-${r.id}`} style={{ color: COLORS.text, fontSize: TAMANOS.minimo + 0.5, lineHeight: 19 }}>
                              Señal {eurosReserva(Number(r.senal_eur))} ({Number(r.porcentaje)} % de {eurosReserva(Number(r.precio_eur))}) · {r.dias} {r.dias === 1 ? "día" : "días"} · vence el {fechaReserva(r.vence_en)}
                            </Text>
                            <Text nativeID={`reserva-estado-${r.id}`} style={{ color: vencida ? COLORS.danger : r.estado === "activa" ? COLORS.success : COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo + 0.5 }}>
                              {vencida && r.estado === "activa" ? "Vencida (sin marcar)" : ESTADOS[r.estado] ?? r.estado} · arras {r.tipo_arras}
                            </Text>
                            {abierta ? (
                              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                                {(vencida ? (["vencida", "completada", "cancelada"] as const) : (["completada", "cancelada"] as const)).map((e) => (
                                  <Pressable
                                    key={e}
                                    nativeID={`reserva-${e}-${r.id}`}
                                    onPress={() => cambiarEstado(r, e)}
                                    disabled={cambiando === r.id}
                                    accessibilityRole="button"
                                    style={({ pressed }) => ({
                                      minHeight: TACTIL.minimo,
                                      justifyContent: "center",
                                      paddingHorizontal: 14,
                                      borderRadius: 999,
                                      borderWidth: 1,
                                      borderColor: e === "cancelada" ? "#FECACA" : COLORS.border,
                                      backgroundColor: "#FFFFFF",
                                      opacity: cambiando === r.id ? 0.5 : pressed ? 0.8 : 1,
                                    })}
                                  >
                                    <Text style={{ color: e === "cancelada" ? COLORS.danger : COLORS.text, fontWeight: "800" }}>
                                      {e === "completada" ? "Marcar completada" : e === "vencida" ? "Marcar vencida" : "Cancelar"}
                                    </Text>
                                  </Pressable>
                                ))}
                              </View>
                            ) : null}
                          </View>
                        );
                      })
                    )}
                  </View>
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}
