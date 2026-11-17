// app/admin/alquileres.tsx
/**
 * Qué hace: Administración → «Alquileres» (dueño, 2026-11-17; FASE 1). Alquiler de artículos solo en Zaragoza, con planes
 * de 1, 2, 3 y 4 meses (IVA incluido), fianza sin IVA, recargo por retraso y «Alquílalo y, si te gusta, cómpralo». APAGADO:
 * los clientes no ven nada (en esta fase no hay pantallas de cliente).
 *
 * Cómo funciona (piezas de components/admin/PanelUI.tsx, como Reservas con señal):
 * - Arriba, con el alquiler apagado, el aviso «El alquiler está apagado: los clientes no ven nada»; las cifras (alquileres
 *   en curso, en total y unidades de alquiler).
 * - Ajustes (public.alquiler_ajustes, una fila): interruptor (NO deja activar sin el contrato, sin «Revisado por mi gestor»
 *   o con notas internas del borrador; lo comprueba también la base de datos), los cuatro porcentajes del precio de venta
 *   con la tabla de ejemplo de un artículo de 550 € que se recalcula al escribir (10, 18, 25 y 33 % = 54,90 €, 99 €, 139 € y
 *   179 €), la fianza (sin IVA) y su modo de cobro, el recargo por día de retraso y los días de cortesía (con su ejemplo y el
 *   tope de la fianza), el «plus» de la compra tras el alquiler (con su ejemplo 550 − 139 + 50 = 461 €), los meses que se
 *   alquila como mucho cada unidad, el texto del contrato con «Cargar el borrador» (BORRADOR_CONTRATO_ALQUILER de
 *   lib/alquiler.ts) y la casilla «Revisado por mi gestor» (se desmarca sola al cambiar el texto).
 * - Unidades de alquiler: los artículos con products.modo = 'alquiler' (llegan desde VeoAura con «En Escaparate para
 *   Alquilar»: cada artículo es una unidad). Cada una con sus cuatro precios (los calculados o los puestos a mano, que se
 *   guardan en products.alquiler_precios) y su coste (public.alquiler_unidades, solo para el administrador).
 * - Tamaños de constants/theme.ts: todo lo que se toca de 44 px, campos de 16 px, ninguna letra de menos de 13 px.
 *
 * Conectado con: app/admin/index.tsx (recuadro «Alquileres» del grupo Ventas y clientes), app/admin/_layout.tsx (ruta),
 * lib/alquiler.ts, supabase/migrations/20261117100000_alquiler_base.sql, docs/puente-veoaura-alquiler.md y
 * pruebas/perfil-datos.mjs (sección ALQ1).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, Switch, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { CAMPO, COLORES_TEXTO, TACTIL, TAMANOS } from "../../constants/theme";
import { AdminHeader, AdminLoading } from "../../lib/admin/products.components";
import { AccionTexto, Bloque, BloqueFormulario, Cifra, Dato, Detalle, DetalleFila, EtiquetaColor, FilaCifras, FilaLista, ListaVacia, Miniatura, Seccion, useDesplegables } from "../../components/admin/PanelUI";
import {
  AJUSTES_ALQUILER_INICIALES,
  BORRADOR_CONTRATO_ALQUILER,
  compraTrasAlquiler,
  eurosAlquiler,
  faltaParaActivarAlquiler,
  leerNumero,
  MODOS_FIANZA,
  PLANES_ALQUILER,
  PRECIO_EJEMPLO_ALQUILER,
  precioMensualAlquiler,
  precioPlanAlquiler,
  preciosAlquiler,
  recargoRetraso,
  textoPlan,
  validarPorcentajesAlquiler,
  type AjustesAlquiler,
  type ModoFianza,
  type PlanAlquiler,
  type PorcentajesAlquiler,
  type PreciosManuales,
} from "../../lib/alquiler";

const CIERRE_TECLADO: "none" | "on-drag" = Platform.OS === "web" ? "none" : "on-drag";
const MIGRACION = "supabase/migrations/20261117100000_alquiler_base.sql";
const MARCA_RE = /pendiente de revisión del gestor/i;

const COLORS = {
  bg: "#FFFFFF",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: COLORES_TEXTO.secundario,
  accent: "#1EA7E8",
  success: "#15803D",
  danger: "#B91C1C",
  dangerBg: "#FFE4E6",
  warnBg: "#FFF7E6",
  warn: "#8A5A00",
};

const ESTADOS_EN_CURSO = ["reservado", "pendiente_pago", "activo", "por_recoger", "revision"];

type Alquiler = { id: string; estado: string };
type Unidad = { id: string; title: string; price_eur: number | string; alquiler_precios: Record<string, unknown> | null; is_active: boolean | null; status: string | null };
type DatosUnidad = { coste_eur: number | string | null; meses_alquilada: number | string | null };

const numero = (v: unknown, defecto: number) => {
  const n = Number(v);
  return v == null || !Number.isFinite(n) ? defecto : n;
};
const texto = (n: number) => String(n).replace(".", ",");

function leerAjustes(d: Record<string, unknown>): AjustesAlquiler {
  const i = AJUSTES_ALQUILER_INICIALES;
  return {
    activo: d.activo === true,
    porcentajes: {
      1: numero(d.pct_1_mes, i.porcentajes[1]),
      2: numero(d.pct_2_meses, i.porcentajes[2]),
      3: numero(d.pct_3_meses, i.porcentajes[3]),
      4: numero(d.pct_4_meses, i.porcentajes[4]),
    },
    fianza_eur: numero(d.fianza_eur, i.fianza_eur),
    fianza_modo: d.fianza_modo === "tarjeta" ? "tarjeta" : "entrega",
    recargo_dia_eur: numero(d.recargo_dia_eur, i.recargo_dia_eur),
    cortesia_dias: numero(d.cortesia_dias, i.cortesia_dias),
    plus_compra_eur: numero(d.plus_compra_eur, i.plus_compra_eur),
    meses_max_unidad: numero(d.meses_max_unidad, i.meses_max_unidad),
    texto_contrato: typeof d.texto_contrato === "string" ? d.texto_contrato : null,
    contrato_revisado: d.contrato_revisado === true,
  };
}

function manualesDe(u: Unidad): PreciosManuales {
  const m: PreciosManuales = {};
  for (const p of PLANES_ALQUILER) {
    const v = Number(u.alquiler_precios?.[String(p)]);
    if (Number.isFinite(v) && v > 0) m[p] = v;
  }
  return m;
}

export default function AdminAlquileres() {
  const { width } = useWindowDimensions();
  const isMobile = (width > 0 ? width : 1024) < 700;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [sinTabla, setSinTabla] = useState(false);
  const [guardado, setGuardado] = useState<AjustesAlquiler | null>(null);
  const [pcts, setPcts] = useState<Record<PlanAlquiler, string>>({ 1: "", 2: "", 3: "", 4: "" });
  const [fianza, setFianza] = useState("");
  const [modoFianza, setModoFianza] = useState<ModoFianza>("entrega");
  const [recargo, setRecargo] = useState("");
  const [cortesia, setCortesia] = useState("");
  const [plus, setPlus] = useState("");
  const [mesesMax, setMesesMax] = useState("");
  const [contrato, setContrato] = useState("");
  const [revisado, setRevisado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string; desde: "interruptor" | "guardar" } | null>(null);
  const [alquileres, setAlquileres] = useState<Alquiler[] | null>(null);
  const [unidades, setUnidades] = useState<Unidad[] | null>(null);
  const [datosUnidad, setDatosUnidad] = useState<Record<string, DatosUnidad>>({});
  const [edicion, setEdicion] = useState<Record<string, { precios: Record<PlanAlquiler, string>; coste: string }>>({});
  const [msgUnidad, setMsgUnidad] = useState<{ id: string; tipo: "ok" | "error"; texto: string } | null>(null);
  const [guardandoUnidad, setGuardandoUnidad] = useState<string | null>(null);
  const desplegables = useDesplegables();

  const aplicar = (a: AjustesAlquiler) => {
    setGuardado(a);
    setPcts({ 1: texto(a.porcentajes[1]), 2: texto(a.porcentajes[2]), 3: texto(a.porcentajes[3]), 4: texto(a.porcentajes[4]) });
    setFianza(texto(a.fianza_eur));
    setModoFianza(a.fianza_modo);
    setRecargo(texto(a.recargo_dia_eur));
    setCortesia(String(a.cortesia_dias));
    setPlus(texto(a.plus_compra_eur));
    setMesesMax(String(a.meses_max_unidad));
    setContrato(a.texto_contrato ?? "");
    setRevisado(a.contrato_revisado);
  };

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("alquiler_ajustes").select("*").eq("id", 1).maybeSingle<Record<string, unknown>>();
      if (error || !data) {
        setSinTabla(true);
        return;
      }
      setSinTabla(false);
      aplicar(leerAjustes(data));
      const [al, un, du] = await Promise.all([
        supabase.from("alquileres").select("id,estado").order("creado_en", { ascending: false }).limit(1000),
        supabase.from("products").select("id,title,price_eur,alquiler_precios,is_active,status").eq("modo", "alquiler").order("title", { ascending: true }).limit(500),
        supabase.from("alquiler_unidades").select("product_id,coste_eur,meses_alquilada").limit(500),
      ]);
      setAlquileres(al.error ? null : ((al.data ?? []) as Alquiler[]));
      setUnidades(un.error ? null : ((un.data ?? []) as Unidad[]));
      const mapa: Record<string, DatosUnidad> = {};
      for (const f of (du.error ? [] : (du.data ?? [])) as (DatosUnidad & { product_id: string })[]) mapa[f.product_id] = f;
      setDatosUnidad(mapa);
    } catch {
      setMsg({ tipo: "error", texto: "No se han podido cargar los ajustes del alquiler. Inténtalo de nuevo.", desde: "interruptor" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Lo escrito, leído. error: el primer problema (o null si todo está bien escrito).
  const leido = useMemo(() => {
    const p = { 1: leerNumero(pcts[1]), 2: leerNumero(pcts[2]), 3: leerNumero(pcts[3]), 4: leerNumero(pcts[4]) } as Record<PlanAlquiler, number | null>;
    const errPct = validarPorcentajesAlquiler(p);
    if (errPct) return { error: errPct };
    const f = leerNumero(fianza);
    if (f === null || Number.isNaN(f) || f > 5000) return { error: "La fianza tiene que ser un importe de 0 a 5.000 €." };
    const r = leerNumero(recargo);
    if (r === null || Number.isNaN(r) || r > 100) return { error: "El recargo por día tiene que ser un importe de 0 a 100 €." };
    const c = leerNumero(cortesia);
    if (c === null || Number.isNaN(c) || !Number.isInteger(c) || c > 30) return { error: "Los días de cortesía tienen que ser un entero de 0 a 30." };
    const pl = leerNumero(plus);
    if (pl === null || Number.isNaN(pl) || pl > 5000) return { error: "El plus de la compra tiene que ser un importe de 0 a 5.000 €." };
    const mm = leerNumero(mesesMax);
    if (mm === null || Number.isNaN(mm) || !Number.isInteger(mm) || mm < 1 || mm > 24) return { error: "Los meses por unidad tienen que ser un entero de 1 a 24." };
    return {
      error: null,
      porcentajes: p as PorcentajesAlquiler,
      datos: {
        pct_1_mes: p[1],
        pct_2_meses: p[2],
        pct_3_meses: p[3],
        pct_4_meses: p[4],
        fianza_eur: f,
        fianza_modo: modoFianza,
        recargo_dia_eur: r,
        cortesia_dias: c,
        plus_compra_eur: pl,
        meses_max_unidad: mm,
        texto_contrato: contrato.trim() || null,
        contrato_revisado: revisado,
      },
    };
  }, [pcts, fianza, modoFianza, recargo, cortesia, plus, mesesMax, contrato, revisado]);

  // Lo que falta para poder activarlo (la misma regla que la base de datos).
  const faltan = useMemo(() => (leido.datos ? faltaParaActivarAlquiler(leido.datos.texto_contrato, leido.datos.contrato_revisado) : [leido.error ?? "revisa los datos"]), [leido]);

  const guardar = useCallback(
    async (activo: boolean, desdeInterruptor = false) => {
      const desde = desdeInterruptor ? ("interruptor" as const) : ("guardar" as const);
      // Apagar con el interruptor siempre se puede (aunque haya algo mal escrito, entonces solo se apaga).
      const cuerpo = leido.datos ? { ...leido.datos, activo } : !activo && desdeInterruptor ? { activo: false } : null;
      if (!cuerpo) {
        setMsg({ tipo: "error", texto: leido.error ?? "Revisa los datos.", desde });
        return;
      }
      if (activo && faltan.length) {
        setMsg({ tipo: "error", texto: `No se puede activar: falta ${faltan.join(", ")}.`, desde });
        return;
      }
      setGuardando(true);
      setMsg(null);
      try {
        const { data, error } = await supabase.from("alquiler_ajustes").update(cuerpo).eq("id", 1).select("*").maybeSingle<Record<string, unknown>>();
        if (error) {
          setMsg({ tipo: "error", texto: error.message && /falta|alquiler/i.test(error.message) ? error.message : "No se han podido guardar los ajustes. Inténtalo de nuevo.", desde });
          return;
        }
        setGuardado((prev) => (data ? leerAjustes(data) : prev ? { ...prev, activo } : prev));
        setMsg({
          tipo: "ok",
          texto: activo
            ? "Alquiler ACTIVADO: la categoría «Alquílalo ahora» ya se ve en la tienda."
            : guardado?.activo
              ? "Alquiler desactivado: la tienda ya no lo ofrece y la categoría «Alquílalo ahora» queda oculta."
              : "Ajustes guardados. El alquiler sigue desactivado.",
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

  // Ejemplos que se recalculan al escribir.
  const pctsEjemplo: PorcentajesAlquiler = leido.porcentajes ?? (guardado?.porcentajes ?? AJUSTES_ALQUILER_INICIALES.porcentajes);
  const ejemplo = preciosAlquiler(PRECIO_EJEMPLO_ALQUILER, pctsEjemplo);
  const fianzaN = leido.datos?.fianza_eur ?? guardado?.fianza_eur ?? 0;
  const recargoN = leido.datos?.recargo_dia_eur ?? guardado?.recargo_dia_eur ?? 0;
  const cortesiaN = leido.datos?.cortesia_dias ?? guardado?.cortesia_dias ?? 0;
  const plusN = leido.datos?.plus_compra_eur ?? guardado?.plus_compra_eur ?? 0;
  const compraEjemplo = compraTrasAlquiler(PRECIO_EJEMPLO_ALQUILER, ejemplo[3], plusN);
  const recargo5 = recargoRetraso(5, recargoN, cortesiaN, fianzaN);
  const diasTope = recargoN > 0 ? Math.ceil(fianzaN / recargoN) + cortesiaN : 0;

  const enCurso = (alquileres ?? []).filter((a) => ESTADOS_EN_CURSO.includes(a.estado)).length;

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
  const importe = (v: string) => v.replace(/[^0-9.,]/g, "").slice(0, 9);
  // Un campo con su etiqueta encima, para ponerlos en fila (en el móvil, uno debajo de otro si no caben).
  const campoConEtiqueta = (titulo: string, props: React.ComponentProps<typeof TextInput>) => (
    <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: isMobile ? 140 : 200, minWidth: 0, gap: 4 }}>
      {etiqueta(titulo)}
      {campo(props)}
    </View>
  );
  const activo = guardado?.activo === true;
  const esBorrador = MARCA_RE.test(contrato);
  const mensaje = (desde: "interruptor" | "guardar") =>
    msg && msg.desde === desde ? (
      <Text nativeID="alquiler-mensaje" style={{ color: msg.tipo === "ok" ? COLORS.success : COLORS.danger, fontWeight: "800", fontSize: TAMANOS.cuerpo, lineHeight: 21 }}>
        {msg.texto}
      </Text>
    ) : null;

  const guardarUnidad = useCallback(
    async (u: Unidad) => {
      const e = edicion[u.id];
      if (!e) return;
      const precios: Record<string, number> = {};
      for (const p of PLANES_ALQUILER) {
        const v = leerNumero(e.precios[p]);
        if (Number.isNaN(v) || (v !== null && v <= 0)) {
          setMsgUnidad({ id: u.id, tipo: "error", texto: `El precio de ${textoPlan(p)} no es un importe válido.` });
          return;
        }
        if (v !== null) precios[String(p)] = v;
      }
      const coste = leerNumero(e.coste);
      if (Number.isNaN(coste)) {
        setMsgUnidad({ id: u.id, tipo: "error", texto: "El coste no es un importe válido." });
        return;
      }
      setGuardandoUnidad(u.id);
      setMsgUnidad(null);
      try {
        const nuevos = Object.keys(precios).length ? precios : null;
        const a = await supabase.from("products").update({ alquiler_precios: nuevos }).eq("id", u.id);
        const b = await supabase.from("alquiler_unidades").upsert({ product_id: u.id, coste_eur: coste }, { onConflict: "product_id" });
        if (a.error || b.error) {
          setMsgUnidad({ id: u.id, tipo: "error", texto: "No se han podido guardar los datos de la unidad. Inténtalo de nuevo." });
          return;
        }
        setUnidades((l) => (l ?? []).map((x) => (x.id === u.id ? { ...x, alquiler_precios: nuevos } : x)));
        setDatosUnidad((m) => ({ ...m, [u.id]: { coste_eur: coste, meses_alquilada: m[u.id]?.meses_alquilada ?? 0 } }));
        setMsgUnidad({ id: u.id, tipo: "ok", texto: "Datos de la unidad guardados." });
      } catch {
        setMsgUnidad({ id: u.id, tipo: "error", texto: "No se han podido guardar los datos de la unidad: revisa tu conexión." });
      } finally {
        setGuardandoUnidad(null);
      }
    },
    [edicion]
  );

  // --- Ajustes ---
  const ajustes = (
    <Seccion icon="settings-outline" title="Ajustes del alquiler" nativeID="alquiler-ajustes">
      <View style={{ gap: 10 }}>
        <BloqueFormulario icono="power-outline" titulo="Alquiler" nativeID="alquiler-bloque-estado">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <EtiquetaColor texto={activo ? "Activado" : "Desactivado"} tono={activo ? "verde" : "gris"} />
              <Text nativeID="alquiler-estado" style={{ color: activo ? COLORS.success : COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                {activo ? "Activado: la categoría «Alquílalo ahora» se ve en la tienda" : "Desactivado: ningún cliente ve nada"}
              </Text>
            </View>
            <Switch nativeID="alquiler-interruptor" value={activo} disabled={guardando} onValueChange={(v) => guardar(v, true)} accessibilityLabel="Activar el alquiler" />
          </View>
          {!activo && faltan.length ? (
            <Text nativeID="alquiler-faltan" style={{ color: COLORS.warn, backgroundColor: COLORS.warnBg, borderRadius: 12, padding: 10, fontSize: TAMANOS.minimo, lineHeight: 19 }}>
              Para activarlo falta: {faltan.join(", ")}.
            </Text>
          ) : null}
          {mensaje("interruptor")}
        </BloqueFormulario>

        <BloqueFormulario icono="pricetag-outline" titulo="Precio de cada plan (IVA incluido)" nativeID="alquiler-bloque-precios">
          {etiqueta("Porcentaje del precio de venta de cada plan. Redondeo: por debajo de 90 €, a «,90»; desde 90 €, al entero acabado en 9.")}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
            {PLANES_ALQUILER.map((p) => (
              <View key={p} style={{ flexGrow: 1, flexShrink: 1, flexBasis: isMobile ? "45%" : 0, minWidth: 0, gap: 4 }}>
                {etiqueta(`${textoPlan(p)} (%)`)}
                {campo({
                  nativeID: `alquiler-pct-${p}`,
                  value: pcts[p],
                  onChangeText: (v) => setPcts((x) => ({ ...x, [p]: v.replace(/[^0-9.,]/g, "").slice(0, 6) })),
                  keyboardType: "decimal-pad",
                  placeholder: "%",
                  accessibilityLabel: `Porcentaje del plan de ${textoPlan(p)}`,
                })}
              </View>
            ))}
          </View>
          <View nativeID="alquiler-ejemplo" style={{ borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: "#FFFFFF", padding: 12, gap: 6 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.cuerpo }}>Ejemplo con un artículo de {eurosAlquiler(PRECIO_EJEMPLO_ALQUILER)}</Text>
            {PLANES_ALQUILER.map((p) => (
              <View key={p} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 24 }}>
                <Text style={{ flex: 1, color: COLORS.text, fontWeight: "700", fontSize: TAMANOS.minimo }}>
                  {textoPlan(p)} · {texto(pctsEjemplo[p])} %
                </Text>
                <Text nativeID={`alquiler-ejemplo-${p}`} style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.cuerpo }}>
                  {eurosAlquiler(ejemplo[p])}
                </Text>
                <Text style={{ color: COLORS.muted, fontWeight: "700", fontSize: TAMANOS.minimo, minWidth: 92, textAlign: "right" }}>
                  {p === 1 ? "" : `${eurosAlquiler(precioMensualAlquiler(ejemplo[p], p))}/mes`}
                </Text>
              </View>
            ))}
            <Detalle>Cada artículo puede llevar sus propios precios a mano (en «Unidades de alquiler»), que mandan sobre este cálculo.</Detalle>
          </View>
        </BloqueFormulario>

        <BloqueFormulario icono="shield-checkmark-outline" titulo="Fianza (sin IVA)" nativeID="alquiler-bloque-fianza">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
            {campoConEtiqueta("Importe de la fianza (€)", { nativeID: "alquiler-fianza", value: fianza, onChangeText: (v) => setFianza(importe(v)), keyboardType: "decimal-pad", accessibilityLabel: "Importe de la fianza" })}
          </View>
          {etiqueta("Cómo se cobra")}
          {(["entrega", "tarjeta"] as const).map((m) => (
            <Pressable
              key={m}
              nativeID={`alquiler-fianza-modo-${m}`}
              onPress={() => setModoFianza(m)}
              accessibilityRole="radio"
              accessibilityState={{ selected: modoFianza === m }}
              aria-checked={modoFianza === m}
              style={({ pressed }) => ({ minHeight: TACTIL.minimo, flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 6, opacity: pressed ? 0.8 : 1 })}
            >
              <Ionicons name={modoFianza === m ? "radio-button-on" : "radio-button-off"} size={22} color={modoFianza === m ? COLORS.accent : COLORS.muted} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.cuerpo }}>
                  {MODOS_FIANZA[m].titulo}
                  {m === "entrega" ? " (recomendado)" : ""}
                </Text>
                <Text style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, lineHeight: 19 }}>{MODOS_FIANZA[m].texto}</Text>
              </View>
            </Pressable>
          ))}
          <Detalle>Se devuelve al recoger y revisar el artículo; si hay daños o falta algo, se descuenta con su motivo.</Detalle>
        </BloqueFormulario>

        <BloqueFormulario icono="time-outline" titulo="Retraso en la devolución" nativeID="alquiler-bloque-recargo">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
            {campoConEtiqueta("Recargo por día (€)", { nativeID: "alquiler-recargo", value: recargo, onChangeText: (v) => setRecargo(importe(v)), keyboardType: "decimal-pad", accessibilityLabel: "Recargo por día de retraso" })}
            {campoConEtiqueta("Días de cortesía", { nativeID: "alquiler-cortesia", value: cortesia, onChangeText: (v) => setCortesia(v.replace(/[^0-9]/g, "").slice(0, 2)), keyboardType: "number-pad", accessibilityLabel: "Días de cortesía" })}
          </View>
          <Detalle nativeID="alquiler-recargo-ejemplo">
            {`Ejemplo: 5 días de retraso = ${eurosAlquiler(recargo5)}. Como mucho, el importe de la fianza (${eurosAlquiler(fianzaN)})${diasTope > 0 ? `, al que se llega con ${diasTope} días de retraso` : ""}.`}
          </Detalle>
        </BloqueFormulario>

        <BloqueFormulario icono="bag-check-outline" titulo="Alquílalo y, si te gusta, cómpralo" nativeID="alquiler-bloque-compra">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
            {campoConEtiqueta("Plus de la compra (€)", { nativeID: "alquiler-plus", value: plus, onChangeText: (v) => setPlus(importe(v)), keyboardType: "decimal-pad", accessibilityLabel: "Plus de la compra tras el alquiler" })}
            {campoConEtiqueta("Meses que se alquila cada unidad", { nativeID: "alquiler-meses-max", value: mesesMax, onChangeText: (v) => setMesesMax(v.replace(/[^0-9]/g, "").slice(0, 2)), keyboardType: "number-pad", accessibilityLabel: "Meses que se alquila como mucho cada unidad" })}
          </View>
          <Detalle nativeID="alquiler-compra-ejemplo">
            {compraEjemplo.ofrecer
              ? `Ejemplo: ${eurosAlquiler(PRECIO_EJEMPLO_ALQUILER)} con 3 meses pagados (${eurosAlquiler(ejemplo[3])}): ${PRECIO_EJEMPLO_ALQUILER} − ${texto(ejemplo[3])} + ${texto(plusN)} = ${eurosAlquiler(compraEjemplo.importe)}. Recibes el precio de venta más ${eurosAlquiler(plusN)}.`
              : "Con estos importes la compra no se ofrecería."}
          </Detalle>
          <Detalle>Si la compra saliera por menos del coste de la unidad, no se ofrece. En el plan de 4 meses, la unidad se cambia por otra revisada en el mes 3, sin coste.</Detalle>
        </BloqueFormulario>

        <BloqueFormulario icono="document-text-outline" titulo="Contrato de alquiler" nativeID="alquiler-bloque-contrato">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {etiqueta("Texto completo del contrato (lo verá el cliente antes de aceptar)")}
            {esBorrador ? <EtiquetaColor nativeID="alquiler-borrador" texto="Borrador · pendiente del gestor" tono="amarillo" /> : null}
          </View>
          <AccionTexto
            nativeID="alquiler-cargar-borrador"
            icono="download-outline"
            texto="Cargar el borrador"
            onPress={() => {
              setContrato(BORRADOR_CONTRATO_ALQUILER);
              setRevisado(false);
            }}
          />
          {campo({
            nativeID: "alquiler-contrato",
            value: contrato,
            onChangeText: (v) => {
              setContrato(v);
              // Un texto cambiado ya no es el que revisó el gestor.
              setRevisado(false);
            },
            multiline: true,
            maxLength: 30000,
            placeholder: "Sin texto: toca «Cargar el borrador» para empezar",
            style: { minHeight: 220 },
            accessibilityLabel: "Contrato de alquiler",
          })}
          <Text nativeID="alquiler-marcas-ayuda" style={{ color: COLORS.muted, fontSize: TAMANOS.minimo, lineHeight: 18 }}>
            {"{articulo}, {plan_meses}, {precio_plan_eur}, {precio_venta_eur}, {fianza_eur}, {modo_fianza}, {recargo_dia_eur}, {cortesia_dias}, {plus_compra_eur}, {fecha_inicio} y {fecha_fin} se rellenan solas con los ajustes y los datos de cada alquiler. Las notas internas del borrador hay que quitarlas: con ellas no se puede activar."}
          </Text>
          <Pressable
            nativeID="alquiler-revisado"
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
          nativeID="alquiler-guardar"
          onPress={() => guardar(activo)}
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

  // --- Unidades de alquiler ---
  const listaUnidades = (
    <Seccion icon="cube-outline" title="Unidades de alquiler" nativeID="alquiler-unidades" extra={unidades ? `${unidades.length}` : undefined}>
      {unidades === null ? (
        <ListaVacia nativeID="alquiler-unidades-error" icono="alert-circle-outline" titulo="No se han podido leer las unidades." texto="Vuelve a abrir la pantalla en un momento." />
      ) : unidades.length === 0 ? (
        <ListaVacia
          nativeID="alquiler-unidades-vacia"
          icono="cube-outline"
          titulo="Aún no hay unidades de alquiler."
          texto="Llegan desde VeoAura con el botón «En Escaparate para Alquilar»: cada artículo es una unidad con su propia ficha."
        />
      ) : (
        <View style={{ gap: 4 }}>
          {unidades.map((u, i) => {
            const precio = Number(u.price_eur) || 0;
            const manuales = manualesDe(u);
            const precios = preciosAlquiler(precio, pctsEjemplo, manuales);
            const abierta = desplegables.estaAbierta(u.id);
            const datos = datosUnidad[u.id];
            const ed = edicion[u.id] ?? {
              precios: { 1: manuales[1] ? texto(manuales[1]) : "", 2: manuales[2] ? texto(manuales[2]) : "", 3: manuales[3] ? texto(manuales[3]) : "", 4: manuales[4] ? texto(manuales[4]) : "" },
              coste: datos?.coste_eur != null ? texto(Number(datos.coste_eur)) : "",
            };
            const cambiar = (c: Partial<typeof ed>) => setEdicion((m) => ({ ...m, [u.id]: { ...ed, ...c } }));
            return (
              <FilaLista
                key={u.id}
                nativeID={`alquiler-unidad-${u.id}`}
                idFila={`alquiler-unidad-fila-${u.id}`}
                primera={i === 0}
                abierta={abierta}
                onPress={() => desplegables.alternar(u.id)}
                etiquetaAccesible={`${u.title}. ${abierta ? "Plegar" : "Ver el detalle"}`}
                miniatura={<Miniatura icono="game-controller-outline" ancho={48} alto={48} />}
                titulo={u.title}
                etiqueta={<EtiquetaColor texto={u.is_active && u.status === "PUBLISHED" ? "Publicada" : "Oculta"} tono={u.is_active && u.status === "PUBLISHED" ? "verde" : "gris"} />}
                subtitulo={`Venta ${eurosAlquiler(precio)} · ${PLANES_ALQUILER.map((p) => `${p} m ${eurosAlquiler(precios[p])}`).join(" · ")}`}
              >
                <DetalleFila
                  nativeID={`alquiler-unidad-detalle-${u.id}`}
                  acciones={
                    <AccionTexto
                      nativeID={`alquiler-unidad-guardar-${u.id}`}
                      icono="save-outline"
                      texto={guardandoUnidad === u.id ? "Guardando…" : "Guardar la unidad"}
                      disabled={guardandoUnidad === u.id}
                      onPress={() => guardarUnidad(u)}
                    />
                  }
                >
                  <Bloque icono="pricetag-outline" titulo="Precios a mano (vacío = calculado)" ancho={isMobile ? "100%" : "48%"}>
                    {PLANES_ALQUILER.map((p) => (
                      <View key={p} style={{ gap: 4 }}>
                        {etiqueta(`${textoPlan(p)} · calculado ${eurosAlquiler(precioPlanAlquiler(precio, pctsEjemplo[p]))}`)}
                        {campo({
                          nativeID: `alquiler-unidad-precio-${p}-${u.id}`,
                          value: ed.precios[p],
                          onChangeText: (v) => cambiar({ precios: { ...ed.precios, [p]: importe(v) } }),
                          keyboardType: "decimal-pad",
                          placeholder: "Calculado",
                          accessibilityLabel: `Precio a mano del plan de ${textoPlan(p)}`,
                        })}
                      </View>
                    ))}
                  </Bloque>
                  <Bloque icono="lock-closed-outline" titulo="Solo para ti" ancho={isMobile ? "100%" : "48%"}>
                    {etiqueta("Coste de la unidad (€)")}
                    {campo({ nativeID: `alquiler-unidad-coste-${u.id}`, value: ed.coste, onChangeText: (v) => cambiar({ coste: importe(v) }), keyboardType: "decimal-pad", placeholder: "Sin poner", accessibilityLabel: "Coste de la unidad" })}
                    <Dato etiqueta="Meses ya alquilada">{texto(Number(datos?.meses_alquilada ?? 0))}</Dato>
                    <Detalle>El coste no lo ve ningún cliente. La contabilidad completa está en VeoAura.</Detalle>
                  </Bloque>
                  {msgUnidad?.id === u.id ? (
                    <Text nativeID={`alquiler-unidad-mensaje-${u.id}`} style={{ width: "100%", color: msgUnidad.tipo === "ok" ? COLORS.success : COLORS.danger, fontWeight: "800", fontSize: TAMANOS.cuerpo }}>
                      {msgUnidad.texto}
                    </Text>
                  ) : null}
                </DetalleFila>
              </FilaLista>
            );
          })}
        </View>
      )}
    </Seccion>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />
      <AdminHeader title="Alquileres" isMobile={isMobile} />

      {loading ? (
        <AdminLoading texto="Cargando…" />
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
                <View nativeID="alquiler-sin-migracion" style={{ borderRadius: 14, backgroundColor: COLORS.dangerBg, padding: 12, gap: 4 }}>
                  <Text style={{ color: COLORS.danger, fontWeight: "900", textAlign: "center" }}>Falta preparar la base de datos</Text>
                  <Text style={{ color: COLORS.danger, lineHeight: 20, textAlign: "center" }}>Hay que aplicar {MIGRACION}. Hasta entonces la tienda no ofrece alquileres.</Text>
                </View>
              ) : (
                <>
                  {!activo ? (
                    <View nativeID="alquiler-aviso-apagado" style={{ flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, backgroundColor: COLORS.warnBg, padding: 12 }}>
                      <Ionicons name="eye-off-outline" size={20} color={COLORS.warn} />
                      <Text style={{ flex: 1, color: COLORS.warn, fontWeight: "900", fontSize: TAMANOS.cuerpo, lineHeight: 21 }}>El alquiler está apagado: los clientes no ven nada</Text>
                    </View>
                  ) : null}
                  <FilaCifras nativeID="alquiler-cifras">
                    <Cifra nativeID="alquiler-cifra-en-curso" valor={String(enCurso)} etiqueta="Alquileres en curso" icono="repeat-outline" ancho={isMobile ? "30%" : 0} />
                    <Cifra nativeID="alquiler-cifra-total" valor={String((alquileres ?? []).length)} etiqueta="Alquileres en total" icono="albums-outline" ancho={isMobile ? "30%" : 0} />
                    <Cifra nativeID="alquiler-cifra-unidades" valor={String((unidades ?? []).length)} etiqueta="Unidades de alquiler" icono="cube-outline" ancho={isMobile ? "30%" : 0} />
                  </FilaCifras>
                  {activo ? (
                    <>
                      {listaUnidades}
                      {ajustes}
                    </>
                  ) : (
                    <>
                      {ajustes}
                      {listaUnidades}
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
