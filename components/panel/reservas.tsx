/**
 * Archivo: components/panel/reservas.tsx (antes app/admin/reservas.tsx, que ahora solo la descarga al abrirla)
 * Función: pantalla de administración «Reservas con señal», en la dirección /admin/reservas.
 * Para qué sirve: el administrador configura las reglas de las reservas con señal (escala de días y porcentajes, arras, condiciones), las enciende o apaga y gestiona las reservas (completar, cancelar, marcar vencida). Está apagada hasta que el dueño dé sus reglas.
 * Conectado con: lib/supabase.ts (tablas de reservas y ajustes, migración 20261115150000_reservas_senal.sql), lib/reservas.ts, lib/admin/productos.componentes.tsx, constants/temaTienda.ts, components/admin/PiezasPanelAdmin.tsx; api/pago.ts (acción reserva_estado).
 * Utilizado por: Expo Router (dirección /admin/reservas, protegida por app/admin/_layout.tsx); la enlaza la tarjeta «Reservas con señal» de app/admin/index.tsx.
 * Dependencias: react, react-native, @expo/vector-icons, react-native-safe-area-context.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: Administración → «Reservas con señal» (dueño, 2026-11-15, mejora 14: señal del 1 % al 70 % según los días,
 * pagada con Stripe, condiciones de arras aceptadas con casilla y reglas configurables aquí). APAGADA Y VACÍA: el dueño
 * aún no ha dado su escala, los días máximos, el tipo de arras ni qué pasa al vencer, y su gestor tiene que revisar el texto.
 *
 * Cómo funciona:
 * - Rediseño PANRED2 (2026-11-16, piezas de components/admin/PiezasPanelAdmin.tsx, como Usuarios, Pedidos y Categorías): arriba las
 *   cifras que filtran (Activas, Vencidas, Completadas y la señal de las activas) y el uso de 30 días; la lista con buscador
 *   de 16 px, pastillas de 44 px con su recuento, filas compactas con su etiqueta de color y, al tocar una, el detalle por
 *   bloques con las acciones abajo; las reglas, en un formulario por bloques. Con las reservas apagadas, las reglas van
 *   primero (es lo que hay que hacer); encendidas, primero la lista.
 * - Reglas: interruptor (NO deja activar si falta alguna regla, si «Revisado por mi gestor» no está marcado o si el texto
 *   aún dice «Pendiente de revisión del gestor»; lo comprueba también la base de datos), editor de la escala (filas «hasta
 *   N días → %»: 1-70 % y días crecientes), días máximos, tipo de arras con una explicación neutra de cada uno, un plegable
 *   «Qué dice la ley» (penitenciales frente a confirmatorias con el ejemplo de una PS5 y enlaces al BOE), «Qué pasa al
 *   vencer» (texto del dueño), el texto de las condiciones (precargado con el BORRADOR para el gestor de lib/reservas.ts:
 *   dos variantes de arras y huecos [A DECIDIR POR EL DUEÑO]) y la casilla «Revisado por mi gestor» (se desmarca sola al
 *   cambiar el texto). El mensaje sale junto a lo que se ha tocado (el interruptor arriba, «Guardar ajustes» abajo).
 * - Uso (30 días, analítica propia sin datos personales): reserva_abierta, reserva_pagar y reserva_pagada.
 * - Lista de reservas (activas, vencidas, completadas, canceladas o todas) con artículo, señal, vencimiento y estado;
 *   «Marcar completada», «Cancelar» y «Marcar vencida» van por api/pago.ts («reserva_estado», solo el administrador): solo
 *   cambian el estado y sueltan el artículo. NO hay reembolsos automáticos: si procede, se hace en Stripe.
 * - Tamaños de constants/temaTienda.ts: todo lo que se toca de 44 px, campos de 16 px, ninguna letra de menos de 13 px.
 *
 * Conectado con: app/admin/index.tsx (tarjeta «Reservas con señal»), app/admin/_layout.tsx (ruta), lib/reservas.ts,
 * api/pago.ts, app/admin/products.tsx (etiqueta «Reservado» del artículo), supabase/migrations/20261115150000_reservas_senal.sql
 * y pruebas/perfil-datos.mjs (secciones RESEN y PANRED2).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StatusBar, Switch, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { CAMPO, COLORES_TEXTO, TACTIL, TAMANOS } from "../../constants/temaTienda";
import { CabeceraPanel, CargandoPanel } from "../../lib/admin/productos.componentes";
import {
  AccionTexto,
  Bloque,
  BloqueFormulario,
  Buscador,
  Chip,
  Cifra,
  Dato,
  Detalle,
  EtiquetaColor,
  FilaPastillas,
  ListaVacia,
  Miniatura,
  RecuentoLista,
  Seccion,
  useDesplegables,
  type Tono,
} from "../../components/admin/PiezasPanelAdmin";
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
type Filtro = "activas" | "vencidas" | "completadas" | "canceladas" | "todas";

const ESTADOS: Record<string, string> = {
  pendiente_pago: "Pendiente de pago",
  activa: "Activa",
  completada: "Completada",
  vencida: "Vencida",
  cancelada: "Cancelada",
};

const entero = (t: string): number | null => {
  const s = t.trim();
  if (!s) return null;
  return /^\d{1,3}$/.test(s) ? Number(s) : NaN;
};

// ¿Vencida? (activa con la fecha pasada, aunque aún no esté marcada).
const esVencida = (r: Reserva) => r.estado === "vencida" || (r.estado === "activa" && Date.parse(r.vence_en) <= Date.now());
const esActiva = (r: Reserva) => (r.estado === "activa" || r.estado === "pendiente_pago") && !esVencida(r);

const cumpleFiltro = (r: Reserva, f: Filtro) => {
  if (f === "todas") return true;
  if (f === "vencidas") return esVencida(r);
  if (f === "completadas") return r.estado === "completada";
  if (f === "canceladas") return r.estado === "cancelada";
  return esActiva(r);
};

// Etiqueta de color del estado de una reserva.
function estadoReserva(r: Reserva): { texto: string; tono: Tono } {
  if (esVencida(r)) return { texto: r.estado === "activa" ? "Vencida (sin marcar)" : "Vencida", tono: "rojo" };
  if (r.estado === "activa") return { texto: "Activa", tono: "verde" };
  if (r.estado === "pendiente_pago") return { texto: "Pendiente de pago", tono: "amarillo" };
  if (r.estado === "completada") return { texto: "Completada", tono: "azul" };
  if (r.estado === "cancelada") return { texto: "Cancelada", tono: "gris" };
  return { texto: ESTADOS[r.estado] ?? r.estado, tono: "gris" };
}

function fechaHora(iso: string | null) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
}

export default function AdminReservas() {
  const { width } = useWindowDimensions();
  const isMobile = (width > 0 ? width : 1024) < 700;
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
  // El mensaje y de dónde viene (el interruptor de arriba o «Guardar ajustes» de abajo): sale junto a lo que se ha tocado.
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string; desde: "interruptor" | "guardar" } | null>(null);
  const [reservas, setReservas] = useState<Reserva[] | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("activas");
  const [buscar, setBuscar] = useState("");
  const [uso, setUso] = useState<{ abiertas: number; pagar: number; pagadas: number } | null>(null);
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [msgLista, setMsgLista] = useState<string | null>(null);
  const desplegables = useDesplegables();

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
      setMsg({ tipo: "error", texto: "No se han podido cargar las reservas. Inténtalo de nuevo.", desde: "interruptor" });
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
      const desde = desdeInterruptor ? ("interruptor" as const) : ("guardar" as const);
      // Apagar con el interruptor siempre se puede, aunque haya algo mal escrito (entonces solo se apaga). «Guardar
      // ajustes» con algo mal escrito no guarda nada y dice qué está mal.
      const cuerpo = leido.datos ? { ...leido.datos, activa } : !activa && desdeInterruptor ? { activa: false } : null;
      if (!cuerpo) {
        setMsg({ tipo: "error", texto: leido.error ?? "Revisa los datos.", desde });
        return;
      }
      if (activa && faltan.length) {
        setMsg({ tipo: "error", texto: `No se puede activar: falta ${faltan.join(", ")}.`, desde });
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
          setMsg({ tipo: "error", texto: error.message && /falta|escala|porcentaje|días/i.test(error.message) ? error.message : "No se han podido guardar los ajustes. Inténtalo de nuevo.", desde });
          return;
        }
        setGuardado((prev) => ({ ...(prev as Ajustes), ...cuerpo, ...(data ? { activa: data.activa === true } : {}) }) as Ajustes);
        setMsg({
          tipo: "ok",
          texto: activa ? "Reservas con señal ACTIVADAS: ya salen en la ficha de los artículos a la venta." : guardado?.activa ? "Reservas con señal desactivadas: la tienda ya no las ofrece." : "Ajustes guardados. Las reservas siguen desactivadas.",
          desde,
        });
      } catch {
        setMsg({ tipo: "error", texto: "No se han podido guardar los ajustes. Inténtalo de nuevo.", desde });
      } finally {
        setGuardando(false);
      }
    },
    [leido, faltan, guardado]
  );

  const cambiarEstado = useCallback(async (r: Reserva, estado: "completada" | "cancelada" | "vencida") => {
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
  }, []);

  const q = buscar.trim().toLowerCase();
  const lista = useMemo(
    () => (reservas ?? []).filter((r) => cumpleFiltro(r, filtro) && (!q || String(r.producto_titulo ?? "").toLowerCase().includes(q) || r.id.toLowerCase().startsWith(q))),
    [reservas, filtro, q]
  );
  const cuenta = (f: Filtro) => (reservas ?? []).filter((r) => cumpleFiltro(r, f)).length;
  // La señal que hay ahora en reservas activas (pagada y aún sin completar).
  const senalActivas = (reservas ?? []).filter((r) => r.estado === "activa" && !esVencida(r)).reduce((s, r) => s + (Number(r.senal_eur) || 0), 0);

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
  const etiqueta = (t: string) => <Text style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 18 }}>{t}</Text>;
  const activa = guardado?.activa === true;
  const esBorrador = MARCA_RE.test(texto);
  const mensaje = (desde: "interruptor" | "guardar") =>
    msg && msg.desde === desde ? (
      <Text nativeID="reservas-mensaje" style={{ color: msg.tipo === "ok" ? COLORS.success : COLORS.danger, fontWeight: "800", fontSize: TAMANOS.cuerpo, lineHeight: 21 }}>
        {msg.texto}
      </Text>
    ) : null;

  // --- Las reglas (formulario por bloques) ---
  const reglas = (
    <Seccion icon="settings-outline" title="Reglas de la reserva" nativeID="reservas-ajustes">
      <View style={{ gap: 10 }}>
        <BloqueFormulario icono="power-outline" titulo="Reservas con señal" nativeID="reservas-bloque-estado">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <EtiquetaColor texto={activa ? "Activadas" : "Desactivadas"} tono={activa ? "verde" : "gris"} />
              <Text nativeID="reservas-estado" style={{ color: activa ? COLORS.success : COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                {activa ? "Activadas: se ofrecen en la ficha de los artículos a la venta" : "Desactivadas: ningún cliente ve nada"}
              </Text>
            </View>
            <Switch nativeID="reservas-interruptor" value={activa} disabled={guardando} onValueChange={(v) => guardar(v, true)} accessibilityLabel="Activar las reservas con señal" />
          </View>
          {!activa && faltan.length ? (
            <Text nativeID="reservas-faltan" style={{ color: COLORS.warn, backgroundColor: COLORS.warnBg, borderRadius: 12, padding: 10, fontSize: TAMANOS.minimo, lineHeight: 19 }}>
              Para activarlas falta: {faltan.join(", ")}.
            </Text>
          ) : null}
          {mensaje("interruptor")}
        </BloqueFormulario>

        <BloqueFormulario icono="trending-up-outline" titulo="Escala de la señal" nativeID="reservas-bloque-escala">
          {etiqueta("Cada tramo: hasta cuántos días → qué porcentaje del precio, del 1 al 70 %")}
          {tramos.length === 0 ? (
            <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, lineHeight: 19 }}>Sin tramos: pon los tuyos (la tienda no propone ninguno).</Text>
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
          <AccionTexto nativeID="reservas-tramo-anadir" icono="add-circle-outline" texto="Añadir tramo" onPress={() => setTramos((l) => (l.length >= 12 ? l : [...l, { dias: "", pct: "" }]))} />
        </BloqueFormulario>

        <BloqueFormulario icono="calendar-outline" titulo="Plazo y tipo de arras" nativeID="reservas-bloque-plazo">
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
                <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.cuerpo }}>{EXPLICACION_ARRAS[t].titulo}</Text>
                <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, lineHeight: 19 }}>{EXPLICACION_ARRAS[t].texto}</Text>
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
              <Text style={{ flex: 1, color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.cuerpo }}>Qué dice la ley</Text>
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
                  <Text key={i} style={{ color: i === 0 ? COLORS.text : COLORS.muted, fontWeight: i === 0 ? "800" : "400", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
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
                      <Text style={{ color: COLORS.accentText, fontWeight: "800", textDecorationLine: "underline", fontSize: TAMANOS.minimo }}>{t}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        </BloqueFormulario>

        <BloqueFormulario icono="document-text-outline" titulo="Lo que lee el cliente" nativeID="reservas-bloque-textos">
          {etiqueta("Qué pasa al vencer (lo verá el cliente antes de pagar)")}
          {campo({ nativeID: "reservas-al-vencer", value: alVencer, onChangeText: setAlVencer, multiline: true, maxLength: 2000, placeholder: "Sin poner: escribe qué pasa si la compra no se completa a tiempo", style: { minHeight: 90 }, accessibilityLabel: "Qué pasa al vencer" })}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {etiqueta("Condiciones de la reserva (texto completo)")}
            {esBorrador ? <EtiquetaColor nativeID="reservas-borrador" texto="Borrador · pendiente del gestor" tono="amarillo" /> : null}
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
            <Text style={{ flex: 1, color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.cuerpo }}>Revisado por mi gestor</Text>
          </Pressable>
        </BloqueFormulario>

        {mensaje("guardar")}
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
    </Seccion>
  );

  // --- La lista de reservas de los clientes ---
  const listaClientes = (
    <Seccion icon="bookmark-outline" title="Reservas de los clientes" nativeID="reservas-lista">
      <Buscador nativeID="reservas-buscar" valor={buscar} onCambiar={setBuscar} placeholder="Buscar por artículo" etiqueta="Buscar reservas por el nombre del artículo" />
      <FilaPastillas isMobile={isMobile} nativeID="reservas-filtros">
        {(
          [
            ["activas", "Activas"],
            ["vencidas", "Vencidas"],
            ["completadas", "Completadas"],
            ["canceladas", "Canceladas"],
            ["todas", "Todas"],
          ] as const
        ).map(([f, t]) => (
          <Chip key={f} nativeID={`reservas-filtro-${f}`} label={`${t} (${cuenta(f)})`} activo={filtro === f} onPress={() => setFiltro(f)} />
        ))}
      </FilaPastillas>
      <Detalle>Cancelar o completar no devuelve dinero: si procede, el reembolso se hace en Stripe.</Detalle>
      {msgLista ? (
        <Text nativeID="reservas-lista-mensaje" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.cuerpo, lineHeight: 21 }}>
          {msgLista}
        </Text>
      ) : null}
      {reservas === null ? (
        <ListaVacia icono="alert-circle-outline" titulo="No se han podido leer las reservas." texto="Vuelve a abrir la pantalla en un momento." />
      ) : (
        <View style={{ gap: 4 }}>
          <RecuentoLista
            nativeID="reservas-recuento"
            texto={q ? `${lista.length} ${lista.length === 1 ? "reserva encontrada" : "reservas encontradas"}` : `${lista.length} de ${reservas.length} reservas`}
            abiertas={desplegables.todasAbiertas(lista.map((r) => r.id))}
            onAlternar={lista.length ? () => desplegables.abrirOCerrarTodas(lista.map((r) => r.id)) : undefined}
            idBoton="reservas-abrir-todas"
            femenino
          />
          {lista.length === 0 ? (
            <View nativeID="reservas-vacia">
              <ListaVacia icono="bookmark-outline" titulo={`No hay reservas ${filtro === "todas" ? "todavía" : filtro}.`} texto={q ? "Prueba a borrar el buscador." : "Cuando un cliente reserve con señal, sale aquí."} />
            </View>
          ) : (
            lista.map((r, i) => {
              const est = estadoReserva(r);
              const vencida = esVencida(r);
              const pendiente = r.estado === "activa" || r.estado === "pendiente_pago";
              const abierta = desplegables.estaAbierta(r.id);
              const precio = Number(r.precio_eur) || 0;
              const senal = Number(r.senal_eur) || 0;
              return (
                <View key={r.id} nativeID={`reserva-${r.id}`} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.border, paddingVertical: 4 }}>
                  <Pressable
                    nativeID={`reserva-fila-${r.id}`}
                    onPress={() => desplegables.alternar(r.id)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: abierta }}
                    {...({ "aria-expanded": abierta } as object)}
                    accessibilityLabel={`${r.producto_titulo ?? "Artículo"}, ${est.texto}. ${abierta ? "Plegar" : "Ver el detalle"}`}
                    style={({ pressed }) => ({ minHeight: TACTIL.minimo, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, opacity: pressed ? 0.85 : 1 })}
                  >
                    <Miniatura icono={vencida ? "alarm-outline" : r.estado === "completada" ? "checkmark-done-outline" : "bookmark-outline"} ancho={48} alto={48} />
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 8, rowGap: 4 }}>
                        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.cuerpo, lineHeight: 21, flexShrink: 1 }}>{r.producto_titulo ?? "Artículo"}</Text>
                        <EtiquetaColor nativeID={`reserva-estado-${r.id}`} texto={est.texto} tono={est.tono} />
                      </View>
                      <Text nativeID={`reserva-datos-${r.id}`} style={{ color: COLORS.muted, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 18 }}>
                        Señal {eurosReserva(senal)} ({Number(r.porcentaje)} % de {eurosReserva(precio)}) · {r.dias} {r.dias === 1 ? "día" : "días"} · vence el {fechaReserva(r.vence_en)}
                      </Text>
                    </View>
                    <Ionicons name={abierta ? "chevron-up" : "chevron-down"} size={18} color={COLORS.muted} />
                  </Pressable>
                  {abierta ? (
                    <View nativeID={`reserva-detalle-${r.id}`} style={{ gap: 12, paddingBottom: 16 }}>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                        <Bloque icono="cash-outline" titulo="Señal" ancho={isMobile ? "100%" : "30%"}>
                          <Dato etiqueta="Señal">{`${eurosReserva(senal)} (${Number(r.porcentaje)} %)`}</Dato>
                          <Dato etiqueta="Precio del artículo">{eurosReserva(precio)}</Dato>
                          <Dato etiqueta="Queda por pagar">{eurosReserva(Math.max(0, precio - senal))}</Dato>
                          <Detalle>{r.pagado_en ? `Pagada el ${fechaHora(r.pagado_en)} con Stripe` : "Señal aún sin pagar"}</Detalle>
                        </Bloque>
                        <Bloque icono="calendar-outline" titulo="Plazo" ancho={isMobile ? "100%" : "30%"}>
                          <Dato etiqueta="Días">{String(r.dias)}</Dato>
                          <Dato etiqueta="Vence">{fechaReserva(r.vence_en)}</Dato>
                          <Dato etiqueta="Pedida">{fechaHora(r.creado_en)}</Dato>
                        </Bloque>
                        <Bloque icono="document-text-outline" titulo="Condiciones" ancho={isMobile ? "100%" : "30%"}>
                          <Dato etiqueta="Arras">{r.tipo_arras}</Dato>
                          <Dato etiqueta="Estado">{ESTADOS[r.estado] ?? r.estado}</Dato>
                          {r.product_id ? <Detalle>Mientras está activa, el artículo no se puede comprar en la tienda.</Detalle> : null}
                        </Bloque>
                      </View>
                      {pendiente ? (
                        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 18, rowGap: TACTIL.separacion }}>
                          {(vencida ? (["vencida", "completada", "cancelada"] as const) : (["completada", "cancelada"] as const)).map((e) => (
                            <AccionTexto
                              key={e}
                              nativeID={`reserva-${e}-${r.id}`}
                              icono={e === "completada" ? "checkmark-done-outline" : e === "vencida" ? "alarm-outline" : "close-circle-outline"}
                              texto={e === "completada" ? "Marcar completada" : e === "vencida" ? "Marcar vencida" : "Cancelar"}
                              color={e === "cancelada" ? COLORS.danger : undefined}
                              disabled={cambiando === r.id}
                              onPress={() => cambiarEstado(r, e)}
                            />
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      )}
    </Seccion>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />
      <CabeceraPanel title="Reservas con señal" isMobile={isMobile} />

      {loading ? (
        <CargandoPanel texto="Cargando…" />
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 48 + insets.bottom, alignItems: "center" }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={CIERRE_TECLADO}
          >
            <View style={{ width: "100%", maxWidth: 1040, gap: isMobile ? 18 : 22 }}>
              {sinTabla ? (
                <View nativeID="reservas-sin-migracion" style={{ borderRadius: 14, backgroundColor: COLORS.dangerBg, padding: 12, gap: 4 }}>
                  <Text style={{ color: COLORS.danger, fontWeight: "900", textAlign: "center" }}>Falta preparar la base de datos</Text>
                  <Text style={{ color: COLORS.danger, lineHeight: 20, textAlign: "center" }}>
                    Hay que aplicar {MIGRACION}. Hasta entonces la tienda no ofrece reservas con señal.
                  </Text>
                </View>
              ) : (
                <>
                  {/* Cifras que filtran la lista. */}
                  <View nativeID="reservas-cifras" style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
                    <Cifra nativeID="reservas-cifra-activas" valor={String(cuenta("activas"))} etiqueta="Activas" icono="bookmark-outline" ancho={isMobile ? "45%" : 0} activa={filtro === "activas"} onPress={() => setFiltro("activas")} />
                    <Cifra nativeID="reservas-cifra-vencidas" valor={String(cuenta("vencidas"))} etiqueta="Vencidas" icono="alarm-outline" ancho={isMobile ? "45%" : 0} activa={filtro === "vencidas"} alerta={cuenta("vencidas") > 0 && filtro !== "vencidas"} onPress={() => setFiltro("vencidas")} />
                    <Cifra nativeID="reservas-cifra-completadas" valor={String(cuenta("completadas"))} etiqueta="Completadas" icono="checkmark-done-outline" ancho={isMobile ? "45%" : 0} activa={filtro === "completadas"} onPress={() => setFiltro("completadas")} />
                    <Cifra nativeID="reservas-cifra-senal" valor={eurosReserva(senalActivas)} etiqueta="Señal de las activas" icono="cash-outline" ancho={isMobile ? "45%" : 0} />
                  </View>
                  {uso ? (
                    <View nativeID="reservas-uso" style={{ gap: 2 }}>
                      <Text nativeID="reservas-uso-cifras" style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                        Hojas abiertas {uso.abiertas} · a pagar {uso.pagar} · señales pagadas {uso.pagadas}
                      </Text>
                      <Detalle>Uso de 30 días: analítica propia, sin datos personales (no cuenta a quien la rechazó).</Detalle>
                    </View>
                  ) : null}
                  {activa ? (
                    <>
                      {listaClientes}
                      {reglas}
                    </>
                  ) : (
                    <>
                      {reglas}
                      {listaClientes}
                    </>
                  )}
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}
