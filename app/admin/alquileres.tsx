/**
 * Archivo: app/admin/alquileres.tsx
 * Función: pantalla de administración «Alquileres», en la dirección /admin/alquileres.
 * Para qué sirve: el administrador gestiona el alquiler de artículos (unidades, alquileres, pagos, entrega, renovación, recogida, fianza, recargo) y sus ajustes. Está apagado: los clientes no ven nada.
 * Conectado con: lib/supabase.ts (tablas de alquiler como alquiler_pagos), lib/alquiler.ts, lib/envio.ts, lib/admin/productos.componentes.tsx, constants/theme.ts, components/marca/CargaMarca.tsx, components/admin/PiezasPanelAdmin.tsx.
 * Utilizado por: Expo Router (dirección /admin/alquileres, protegida por app/admin/_layout.tsx); la enlaza la tarjeta «Alquileres» de app/admin/index.tsx.
 * Dependencias: react, react-native.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: Administración → «Alquileres» (dueño, 2026-11-17; FASES 1 y 2). Alquiler de artículos solo en Zaragoza, con
 * planes de 1, 2, 3 y 4 meses (IVA incluido), fianza sin IVA, recargo por retraso y «Alquílalo y, si te gusta, cómpralo».
 * APAGADO: los clientes no ven nada (no hay pantallas de cliente). La contabilidad y las facturas las lleva VeoAura (la
 * fase 3 le mandará los avisos); este panel es el día a día.
 *
 * Cómo funciona (piezas de components/admin/PiezasPanelAdmin.tsx, como Pedidos y Reservas con señal):
 * - Arriba, con el alquiler apagado, el aviso «El alquiler está apagado: los clientes no ven nada»; las cifras (unidades,
 *   libres, alquiladas, «Toca venderla», ocupación = % de unidades alquiladas e ingresos de alquiler del mes, que salen del
 *   registro de cobros public.alquiler_pagos; sin él, de lo pagado en los alquileres empezados este mes).
 * - Alquileres (FASE 2): pastillas por estado (Todos, Reservados, Activos, Por recoger, En revisión, Cerrados, Cancelados)
 *   con su recuento y un buscador (cliente, unidad o número); filas compactas (cliente, unidad, plan, fechas, días que
 *   quedan o de retraso, importe y fianza con su estado). Al tocar una, el detalle por bloques: Cliente (nombre, teléfono y
 *   correo como en Pedidos, con «Ver ficha del cliente»), Alquiler (plan, precio, inicio, fin previsto, días restantes y el
 *   recargo calculado con lib/alquiler.ts si hay retraso), Fianza (importe, modo, estado, recargo, descuento con su motivo
 *   y lo que queda por devolver), Compra tras alquiler (precio − pagado + plus, si se ofrece) y Contrato (la copia aceptada,
 *   que se trae al tocar «Ver la copia aceptada», con su huella SHA-256 y la hora). Abajo, las acciones de su estado, todas
 *   con un segundo toque para confirmar (como en Pedidos): Marcar pagado (efectivo, Bizum o Stripe con su referencia),
 *   Marcar entregado (pone el inicio y el fin previsto según el plan; la fianza queda cobrada), Renovar (1 a 4 meses; suma
 *   al fin previsto y, si se cobra, a lo pagado), Cambio de unidad (plan de 4 meses: otra unidad libre; la unidad del
 *   alquiler pasa a ser la nueva y cambio_product_id guarda la devuelta, que suma los meses que pasaron), Pedir la recogida,
 *   Marcar recogido (en revisión, con la hora; la unidad suma sus meses), Cobrar recargo (calculado y editable, de la
 *   fianza), Descontar de la fianza (importe y motivo obligatorio, que verá el cliente; nunca más de lo que queda),
 *   Devolver fianza, Vendido al cliente (guarda la compra y el artículo pasa a vendido como las ventas), Cerrar y Cancelar.
 *   Cada acción manda SOLO sus columnas; nunca se borra nada. Los cobros se apuntan también en alquiler_pagos.
 * - Unidades de alquiler: los artículos con products.modo = 'alquiler' (llegan de VeoAura o de Productos → «Para
 *   alquilar»). Cada una con su foto, precio de venta, los cuatro precios del plan (calculados o a mano), el coste (solo
 *   para el administrador, public.alquiler_unidades), los meses alquilada de los que se permiten, lo ganado (lo pagado en
 *   sus alquileres) y su estado (Libre, Reservada, Alquilada hasta …, Por recoger, En revisión o «Toca venderla» al llegar
 *   al máximo de meses). «Pasar a la venta» (segundo toque) la devuelve a products.modo 'venta' en su categoría de antes
 *   (alquiler_unidades.categoria_anterior_id) o en la que elija el dueño.
 * - Ajustes (public.alquiler_ajustes, una fila; fase 1): interruptor (NO deja activar sin el contrato, sin «Revisado por mi
 *   gestor» o con notas internas del borrador; lo comprueba también la base de datos), los cuatro porcentajes con la tabla
 *   de ejemplo de 550 € (54,90 €, 99 €, 139 € y 179 €), la fianza y su modo de cobro, el recargo y los días de cortesía, el
 *   «plus» de la compra (550 − 139 + 50 = 461 €), los meses por unidad, el contrato con «Cargar el borrador» y «Revisado por
 *   mi gestor» (se desmarca sola al cambiar el texto).
 * - Tamaños de constants/theme.ts: todo lo que se toca de 44 px, campos de 16 px, ninguna letra de menos de 13 px.
 *
 * Conectado con: app/admin/index.tsx (recuadro «Alquileres»), app/admin/_layout.tsx (ruta), app/admin/products.tsx («Para
 * alquilar»), app/admin/cliente/[userId].tsx (ficha del cliente), app/admin/analytics.tsx (bloque «Alquiler»),
 * lib/alquiler.ts, supabase/migrations/20261117100000_alquiler_base.sql y 20261117120000_alquiler_fase2.sql,
 * docs/puente-veoaura-alquiler.md y pruebas/perfil-datos.mjs (secciones ALQ1 y ALQ2).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, Switch, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { CAMPO, COLORES_TEXTO, TACTIL, TAMANOS } from "../../constants/theme";
import { AdminHeader, AdminLoading } from "../../lib/admin/productos.componentes";
import { esCategoriaServicios } from "../../components/PortadasCategoria";
import {
  AccionTexto,
  Bloque,
  BloqueFormulario,
  Buscador,
  Chip,
  Cifra,
  Dato,
  Detalle,
  DetalleFila,
  EtiquetaColor,
  FilaCifras,
  FilaLista,
  FilaPastillas,
  ListaVacia,
  Miniatura,
  RecuentoLista,
  Seccion,
  fechaPanel,
  useDesplegables,
  type Tono,
} from "../../components/admin/PiezasPanelAdmin";
import {
  AJUSTES_ALQUILER_INICIALES,
  BORRADOR_CONTRATO_ALQUILER,
  ESTADOS_ALQUILER,
  ESTADOS_UNIDAD,
  compraTrasAlquiler,
  diasRestantes,
  diasRetraso,
  estadoUnidad,
  eurosAlquiler,
  faltaParaActivarAlquiler,
  fianzaADevolver,
  leerNumero,
  mesesAlRecoger,
  mesesContratados,
  mesesTranscurridos,
  MODOS_FIANZA,
  PLANES_ALQUILER,
  PRECIO_EJEMPLO_ALQUILER,
  precioMensualAlquiler,
  precioPlanAlquiler,
  preciosAlquiler,
  recargoDeAlquiler,
  recargoRetraso,
  sumarMeses,
  textoPlan,
  validarDescuentoFianza,
  validarPorcentajesAlquiler,
  type AjustesAlquiler,
  type EstadoAlquiler,
  type EstadoFianza,
  type EstadoUnidad,
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
  bg2: "#F4F9FD",
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

const ESTADOS_EN_CURSO: EstadoAlquiler[] = ["reservado", "pendiente_pago", "activo", "por_recoger", "revision"];
const COLUMNAS_ALQUILER =
  "id,user_id,product_id,producto_titulo,plan_meses,estado,precio_venta_eur,precio_plan_eur,pagado_alquiler_eur,fianza_eur,fianza_modo,fianza_estado,fianza_descuento_eur,fianza_descuento_motivo,recargo_eur,inicio_en,fin_previsto_en,devuelto_en,cambio_unidad_en,cambio_product_id,compra_eur,comprado_en,pago_modo,pago_referencia,contrato_hash,contrato_aceptado_en,creado_en";

type Alquiler = {
  id: string;
  user_id: string;
  product_id: string | null;
  producto_titulo: string | null;
  plan_meses: PlanAlquiler;
  estado: EstadoAlquiler;
  precio_venta_eur: number;
  precio_plan_eur: number;
  pagado_alquiler_eur: number;
  fianza_eur: number;
  fianza_modo: ModoFianza;
  fianza_estado: EstadoFianza;
  fianza_descuento_eur: number;
  fianza_descuento_motivo: string | null;
  recargo_eur: number;
  inicio_en: string | null;
  fin_previsto_en: string | null;
  devuelto_en: string | null;
  cambio_unidad_en: string | null;
  cambio_product_id: string | null;
  compra_eur: number | null;
  comprado_en: string | null;
  pago_modo: string | null;
  pago_referencia: string | null;
  contrato_hash: string;
  contrato_aceptado_en: string | null;
  creado_en: string | null;
};
type Unidad = { id: string; title: string; price_eur: number | string; alquiler_precios: Record<string, unknown> | null; is_active: boolean | null; status: string | null; category_id?: string | null };
type DatosUnidad = { coste_eur: number | string | null; meses_alquilada: number | string | null; categoria_anterior_id?: string | null };
type Categoria = { id: string; name: string; slug: string; is_active: boolean | null };
type Cliente = { nombre: string | null; telefono: string | null; email: string | null };
type Pago = { alquiler_id: string; concepto: string; importe_eur: number | string; creado_en: string };
type ModoCobro = "efectivo" | "bizum" | "stripe";

// Las pastillas de la lista de alquileres.
type FiltroAlquiler = "todos" | "reservados" | "activos" | "por_recoger" | "revision" | "cerrados" | "cancelados";
const PASTILLAS: { clave: FiltroAlquiler; texto: string; estados: EstadoAlquiler[] }[] = [
  { clave: "todos", texto: "Todos", estados: [] },
  { clave: "reservados", texto: "Reservados", estados: ["reservado", "pendiente_pago"] },
  { clave: "activos", texto: "Activos", estados: ["activo"] },
  { clave: "por_recoger", texto: "Por recoger", estados: ["por_recoger"] },
  { clave: "revision", texto: "En revisión", estados: ["revision"] },
  { clave: "cerrados", texto: "Cerrados", estados: ["cerrado"] },
  { clave: "cancelados", texto: "Cancelados", estados: ["cancelado"] },
];
const TONO_ALQUILER: Record<EstadoAlquiler, Tono> = {
  reservado: "amarillo",
  pendiente_pago: "amarillo",
  activo: "verde",
  por_recoger: "azul",
  revision: "indigo",
  cerrado: "gris",
  cancelado: "rojo",
};
// La etiqueta de cada alquiler en el panel (la misma palabra que su pastilla: «Activo» / «Activos»).
const ETIQUETA_ALQUILER: Record<EstadoAlquiler, string> = { ...ESTADOS_ALQUILER, activo: "Activo" };
const TONO_UNIDAD: Record<EstadoUnidad, Tono> = { libre: "verde", reservada: "amarillo", alquilada: "azul", por_recoger: "azul", revision: "indigo", vender: "rojo" };
const ESTADOS_FIANZA: Record<EstadoFianza, string> = { pendiente: "pendiente de cobrar", cobrada: "cobrada", devuelta: "devuelta", descontada: "devuelta con descuento" };
const MODOS_COBRO: { clave: ModoCobro; texto: string }[] = [
  { clave: "efectivo", texto: "Efectivo" },
  { clave: "bizum", texto: "Bizum" },
  { clave: "stripe", texto: "Stripe" },
];

// Las acciones de un alquiler (una por estado; todas con segundo toque).
type Accion = "pagado" | "entregado" | "renovar" | "cambio" | "recogida" | "recogido" | "recargo" | "descontar" | "devolver" | "vendido" | "cerrar" | "cancelar";
type FormAccion = { modo: ModoCobro | null; referencia: string; meses: PlanAlquiler; cobrar: boolean; importe: string; motivo: string; unidad: string | null };
const FORM_VACIO: FormAccion = { modo: null, referencia: "", meses: 1, cobrar: true, importe: "", motivo: "", unidad: null };

const numero = (v: unknown, defecto: number) => {
  const n = Number(v);
  return v == null || !Number.isFinite(n) ? defecto : n;
};
const texto = (n: number) => String(n).replace(".", ",");
const cents = (n: number) => Math.round(n * 100);
const sumar = (a: number, b: number) => (cents(a) + cents(b)) / 100;

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

function leerAlquiler(d: Record<string, unknown>): Alquiler {
  const n = (k: string) => numero(d[k], 0);
  const s = (k: string) => (typeof d[k] === "string" && d[k] ? (d[k] as string) : null);
  const plan = numero(d.plan_meses, 1);
  return {
    id: String(d.id),
    user_id: String(d.user_id ?? ""),
    product_id: s("product_id"),
    producto_titulo: s("producto_titulo"),
    plan_meses: (plan >= 1 && plan <= 4 ? plan : 1) as PlanAlquiler,
    estado: (s("estado") ?? "reservado") as EstadoAlquiler,
    precio_venta_eur: n("precio_venta_eur"),
    precio_plan_eur: n("precio_plan_eur"),
    pagado_alquiler_eur: n("pagado_alquiler_eur"),
    fianza_eur: n("fianza_eur"),
    fianza_modo: d.fianza_modo === "tarjeta" ? "tarjeta" : "entrega",
    fianza_estado: (s("fianza_estado") ?? "pendiente") as EstadoFianza,
    fianza_descuento_eur: n("fianza_descuento_eur"),
    fianza_descuento_motivo: s("fianza_descuento_motivo"),
    recargo_eur: n("recargo_eur"),
    inicio_en: s("inicio_en"),
    fin_previsto_en: s("fin_previsto_en"),
    devuelto_en: s("devuelto_en"),
    cambio_unidad_en: s("cambio_unidad_en"),
    cambio_product_id: s("cambio_product_id"),
    compra_eur: d.compra_eur == null ? null : n("compra_eur"),
    comprado_en: s("comprado_en"),
    pago_modo: s("pago_modo"),
    pago_referencia: s("pago_referencia"),
    contrato_hash: String(d.contrato_hash ?? ""),
    contrato_aceptado_en: s("contrato_aceptado_en"),
    creado_en: s("creado_en"),
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

const inicioDelMes = () => {
  const h = new Date();
  return new Date(h.getFullYear(), h.getMonth(), 1).getTime();
};

export default function AdminAlquileres() {
  const { width } = useWindowDimensions();
  const isMobile = (width > 0 ? width : 1024) < 700;
  const insets = useSafeAreaInsets();
  const anchoBloque = isMobile ? "100%" : "48%";

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
  const [fotos, setFotos] = useState<Record<string, string>>({});
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [clientes, setClientes] = useState<Record<string, Cliente>>({});
  const [pagos, setPagos] = useState<Pago[] | null>(null);
  const [edicion, setEdicion] = useState<Record<string, { precios: Record<PlanAlquiler, string>; coste: string }>>({});
  const [msgUnidad, setMsgUnidad] = useState<{ id: string; tipo: "ok" | "error"; texto: string } | null>(null);
  const [avisoUnidades, setAvisoUnidades] = useState<string | null>(null);
  const [guardandoUnidad, setGuardandoUnidad] = useState<string | null>(null);
  const [categoriaVenta, setCategoriaVenta] = useState<Record<string, string>>({});
  const desplegables = useDesplegables();
  const desplegablesAlq = useDesplegables();
  const [filtro, setFiltro] = useState<FiltroAlquiler>("todos");
  const [buscar, setBuscar] = useState("");
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [form, setForm] = useState<FormAccion>(FORM_VACIO);
  const [guardandoAlq, setGuardandoAlq] = useState<string | null>(null);
  const [accionMsg, setAccionMsg] = useState<{ id: string; tipo: "ok" | "error"; texto: string } | null>(null);
  const [contratos, setContratos] = useState<Record<string, string | null>>({});

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
      const [al, un, du, ca, pa] = await Promise.all([
        supabase.from("alquileres").select(COLUMNAS_ALQUILER).order("creado_en", { ascending: false }).limit(1000),
        supabase.from("products").select("id,title,price_eur,alquiler_precios,is_active,status,category_id").eq("modo", "alquiler").order("title", { ascending: true }).limit(500),
        // «*»: con la migración de la fase 2 trae también categoria_anterior_id (sin ella, no falla).
        supabase.from("alquiler_unidades").select("*").limit(1000),
        supabase.from("categories").select("id,name,slug,is_active").order("sort_order", { ascending: true }).limit(200),
        supabase.from("alquiler_pagos").select("alquiler_id,concepto,importe_eur,creado_en").order("creado_en", { ascending: false }).limit(3000),
      ]);
      const lista = al.error ? null : ((al.data ?? []) as unknown as Record<string, unknown>[]).map(leerAlquiler);
      const uns = un.error ? null : ((un.data ?? []) as Unidad[]);
      setAlquileres(lista);
      setUnidades(uns);
      const mapa: Record<string, DatosUnidad> = {};
      for (const f of (du.error ? [] : (du.data ?? [])) as (DatosUnidad & { product_id: string })[]) mapa[f.product_id] = f;
      setDatosUnidad(mapa);
      setCategorias(ca.error ? [] : ((ca.data ?? []) as Categoria[]).filter((c) => c.slug !== "alquilalo-ahora" && !esCategoriaServicios(c.slug)));
      setPagos(pa.error ? null : ((pa.data ?? []) as Pago[]));

      // La foto de cada unidad (la portada o la primera imagen).
      const ids = (uns ?? []).map((u) => u.id);
      if (ids.length) {
        const me = await supabase.from("product_media").select("product_id,kind,public_url,is_cover,sort_order").in("product_id", ids).limit(3000);
        const f: Record<string, string> = {};
        const filas = (me.error ? [] : (me.data ?? [])) as { product_id: string; kind: string | null; public_url: string | null; is_cover: boolean | null; sort_order: number | null }[];
        for (const m of [...filas].sort((a, b) => Number(!!b.is_cover) - Number(!!a.is_cover) || Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))) {
          if (m.public_url && (m.kind ?? "image") === "image" && !f[m.product_id]) f[m.product_id] = m.public_url;
        }
        setFotos(f);
      }

      // Nombre y contacto de cada cliente (Mi perfil y, si falta, sus pedidos), como en Pedidos.
      const usuarios = [...new Set((lista ?? []).map((a) => a.user_id).filter(Boolean))];
      if (usuarios.length) {
        const [pe, pd] = await Promise.all([
          supabase.from("perfiles_cliente").select("*").in("user_id", usuarios).limit(1000),
          supabase.from("pedidos").select("user_id,nombre,telefono,email").in("user_id", usuarios).limit(3000),
        ]);
        const c: Record<string, Cliente> = {};
        for (const p of (pd.error ? [] : (pd.data ?? [])) as { user_id: string; nombre: string | null; telefono: string | null; email: string | null }[]) {
          if (!c[p.user_id]) c[p.user_id] = { nombre: p.nombre ?? null, telefono: p.telefono ?? null, email: p.email ?? null };
        }
        for (const p of (pe.error ? [] : (pe.data ?? [])) as { user_id: string; nombre?: string | null; usuario?: string | null; telefono?: string | null }[]) {
          const antes = c[p.user_id] ?? { nombre: null, telefono: null, email: null };
          c[p.user_id] = { nombre: p.nombre || antes.nombre || p.usuario || null, telefono: p.telefono || antes.telefono, email: antes.email };
        }
        setClientes(c);
      }
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
  // Las reglas GUARDADAS (no lo que se esté escribiendo en Ajustes) para el día a día.
  const reglas = guardado ?? AJUSTES_ALQUILER_INICIALES;

  // --- Unidades: estado, lo ganado y las cifras de arriba ---
  const enCursoDe = useCallback((id: string) => (alquileres ?? []).find((a) => a.product_id === id && ESTADOS_EN_CURSO.includes(a.estado)) ?? null, [alquileres]);
  const infoUnidades = useMemo(() => {
    const info: Record<string, { estado: EstadoUnidad; enCurso: Alquiler | null; ganado: number; meses: number }> = {};
    for (const u of unidades ?? []) {
      const enCurso = enCursoDe(u.id);
      const meses = numero(datosUnidad[u.id]?.meses_alquilada, 0);
      const ganado = (alquileres ?? []).filter((a) => a.product_id === u.id).reduce((s, a) => sumar(s, a.pagado_alquiler_eur), 0);
      info[u.id] = { estado: estadoUnidad(enCurso, meses, reglas.meses_max_unidad), enCurso, ganado, meses };
    }
    return info;
  }, [unidades, alquileres, datosUnidad, enCursoDe, reglas.meses_max_unidad]);

  const cifras = useMemo(() => {
    const lista = Object.values(infoUnidades);
    const total = lista.length;
    const alquiladas = lista.filter((x) => x.estado === "alquilada" || x.estado === "por_recoger").length;
    const desde = inicioDelMes();
    const ingresos =
      pagos !== null
        ? pagos.filter((p) => (p.concepto === "alquiler" || p.concepto === "renovacion") && Date.parse(p.creado_en) >= desde).reduce((s, p) => sumar(s, numero(p.importe_eur, 0)), 0)
        : (alquileres ?? []).filter((a) => a.inicio_en && Date.parse(a.inicio_en) >= desde).reduce((s, a) => sumar(s, a.pagado_alquiler_eur), 0);
    return {
      total,
      libres: lista.filter((x) => x.estado === "libre").length,
      alquiladas,
      vender: lista.filter((x) => x.estado === "vender").length,
      ocupacion: total ? Math.round((alquiladas / total) * 100) : 0,
      ingresos,
    };
  }, [infoUnidades, pagos, alquileres]);

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
        setDatosUnidad((m) => ({ ...m, [u.id]: { ...m[u.id], coste_eur: coste, meses_alquilada: m[u.id]?.meses_alquilada ?? 0 } }));
        setMsgUnidad({ id: u.id, tipo: "ok", texto: "Datos de la unidad guardados." });
      } catch {
        setMsgUnidad({ id: u.id, tipo: "error", texto: "No se han podido guardar los datos de la unidad: revisa tu conexión." });
      } finally {
        setGuardandoUnidad(null);
      }
    },
    [edicion]
  );

  // «Pasar a la venta» (segundo toque): modo 'venta' y la categoría de antes o la elegida. Sale de la lista de unidades.
  const pasarALaVenta = async (u: Unidad) => {
    const clave = `venta:${u.id}`;
    if (confirmando !== clave) {
      setConfirmando(clave);
      setMsgUnidad(null);
      const anterior = datosUnidad[u.id]?.categoria_anterior_id ?? null;
      if (anterior && categorias.some((c) => c.id === anterior) && !categoriaVenta[u.id]) setCategoriaVenta((m) => ({ ...m, [u.id]: anterior }));
      return;
    }
    if (infoUnidades[u.id]?.enCurso) {
      setMsgUnidad({ id: u.id, tipo: "error", texto: "Tiene un alquiler en curso: pásala a la venta cuando se cierre." });
      return;
    }
    const cat = categoriaVenta[u.id];
    if (!cat) {
      setMsgUnidad({ id: u.id, tipo: "error", texto: "Elige la categoría en la que se venderá." });
      return;
    }
    setGuardandoUnidad(u.id);
    const { error } = await supabase.from("products").update({ modo: "venta", category_id: cat }).eq("id", u.id);
    setGuardandoUnidad(null);
    if (error) {
      setMsgUnidad({ id: u.id, tipo: "error", texto: "No se ha podido pasar a la venta. Inténtalo de nuevo." });
      return;
    }
    setConfirmando(null);
    setUnidades((l) => (l ?? []).filter((x) => x.id !== u.id));
    setAvisoUnidades(`«${u.title}» ya está a la venta en ${categorias.find((c) => c.id === cat)?.name ?? "su categoría"}. Revisa su ficha en Productos (fotos, estado y «Revisado por nuestro equipo»).`);
  };

  // --- Acciones de un alquiler ---
  const unidadDe = (id: string | null) => (id ? (unidades ?? []).find((u) => u.id === id) ?? null : null);
  const costeDe = (id: string | null) => {
    const c = id ? datosUnidad[id]?.coste_eur : null;
    return c == null || c === "" ? null : numero(c, 0);
  };
  const compraDe = (a: Alquiler) => compraTrasAlquiler(a.precio_venta_eur, a.pagado_alquiler_eur, reglas.plus_compra_eur, costeDe(a.product_id));
  const precioRenovacion = (a: Alquiler, m: PlanAlquiler) => {
    const u = unidadDe(a.product_id);
    const venta = u ? Number(u.price_eur) || a.precio_venta_eur : a.precio_venta_eur;
    return precioPlanAlquiler(venta, reglas.porcentajes[m], u ? manualesDe(u)[m] : null);
  };
  const unidadesLibres = (a: Alquiler) => (unidades ?? []).filter((u) => u.id !== a.product_id && infoUnidades[u.id]?.estado === "libre");

  const accionesDe = (a: Alquiler): Accion[] => {
    if (a.estado === "reservado" || a.estado === "pendiente_pago") {
      return [...(a.pagado_alquiler_eur < a.precio_plan_eur ? (["pagado"] as Accion[]) : (["entregado"] as Accion[])), "cancelar"];
    }
    const compra = compraDe(a).ofrecer ? (["vendido"] as Accion[]) : [];
    if (a.estado === "activo") return ["renovar", ...(a.plan_meses === 4 && !a.cambio_unidad_en ? (["cambio"] as Accion[]) : []), "recogida", ...compra];
    if (a.estado === "por_recoger") return ["recogido", "renovar", ...compra];
    if (a.estado === "revision") {
      if (a.fianza_estado !== "cobrada") return ["cerrar"];
      const r = recargoDeAlquiler(a, reglas);
      return [...(r.importe > 0 && a.recargo_eur === 0 ? (["recargo"] as Accion[]) : []), "devolver", "descontar"];
    }
    return [];
  };

  const TEXTO_ACCION: Record<Accion, string> = {
    pagado: "Marcar pagado",
    entregado: "Marcar entregado",
    renovar: "Renovar",
    cambio: "Cambio de unidad",
    recogida: "Pedir la recogida",
    recogido: "Marcar recogido",
    recargo: "Cobrar recargo",
    descontar: "Descontar de la fianza",
    devolver: "Devolver fianza",
    vendido: "Vendido al cliente",
    cerrar: "Cerrar",
    cancelar: "Cancelar",
  };
  const ICONO_ACCION: Record<Accion, React.ComponentProps<typeof Ionicons>["name"]> = {
    pagado: "cash-outline",
    entregado: "checkmark-done-outline",
    renovar: "refresh-outline",
    cambio: "swap-horizontal-outline",
    recogida: "car-outline",
    recogido: "archive-outline",
    recargo: "time-outline",
    descontar: "remove-circle-outline",
    devolver: "return-down-back-outline",
    vendido: "bag-check-outline",
    cerrar: "lock-closed-outline",
    cancelar: "close-circle-outline",
  };

  // Lo que hace cada acción: las columnas que se mandan (SOLO esas) y lo que se apunta aparte. Con un error, no se manda nada.
  type Plan = {
    cambios: Partial<Alquiler>;
    pago?: { concepto: "alquiler" | "renovacion" | "recargo" | "compra"; meses?: number; importe_eur: number; modo: "efectivo" | "bizum" | "stripe" | "fianza"; referencia?: string | null };
    unidad?: { product_id: string; meses_alquilada: number };
    producto?: { id: string; cuerpo: Record<string, unknown> };
    ok: string;
  };
  const planDe = (a: Alquiler, accion: Accion, f: FormAccion): Plan | { error: string } => {
    const ahora = new Date().toISOString();
    const cobro = (): { error: string } | { modo: ModoCobro; referencia: string | null } => {
      if (!f.modo) return { error: "Elige cómo se ha cobrado: efectivo, Bizum o Stripe." };
      const ref = f.referencia.replace(/\s+/g, " ").trim();
      if (f.modo === "stripe" && ref.length < 3) return { error: "Escribe la referencia del pago de Stripe (empieza por «pi_»)." };
      return { modo: f.modo, referencia: ref || null };
    };
    const pagoModo = (m: ModoCobro) => (m === "stripe" ? "real" : m);
    switch (accion) {
      case "pagado": {
        const c = cobro();
        if ("error" in c) return c;
        const falta = Math.max(0, cents(a.precio_plan_eur) - cents(a.pagado_alquiler_eur)) / 100;
        return {
          cambios: {
            pagado_alquiler_eur: sumar(a.pagado_alquiler_eur, falta),
            pago_modo: pagoModo(c.modo),
            pago_referencia: c.referencia,
            ...(a.fianza_modo === "tarjeta" && c.modo === "stripe" && a.fianza_estado === "pendiente" ? { fianza_estado: "cobrada" as EstadoFianza } : {}),
          },
          pago: { concepto: "alquiler", meses: a.plan_meses, importe_eur: falta, modo: c.modo, referencia: c.referencia },
          ok: `Pago apuntado: ${eurosAlquiler(falta)} (${MODOS_COBRO.find((m) => m.clave === c.modo)?.texto}).`,
        };
      }
      case "entregado":
        return {
          cambios: { estado: "activo", inicio_en: ahora, fin_previsto_en: sumarMeses(ahora, a.plan_meses), ...(a.fianza_estado === "pendiente" && a.fianza_eur > 0 ? { fianza_estado: "cobrada" as EstadoFianza } : {}) },
          ok: `Entregado: el alquiler termina el ${fechaPanel(sumarMeses(ahora, a.plan_meses))}.`,
        };
      case "renovar": {
        const fin = sumarMeses(a.fin_previsto_en ?? ahora, f.meses);
        if (!f.cobrar) return { cambios: { fin_previsto_en: fin, ...(a.estado === "por_recoger" ? { estado: "activo" as EstadoAlquiler } : {}) }, ok: `Renovado ${textoPlan(f.meses)}: termina el ${fechaPanel(fin)}. Cobro pendiente.` };
        const c = cobro();
        if ("error" in c) return c;
        const imp = leerNumero(f.importe);
        if (imp === null || Number.isNaN(imp) || imp <= 0) return { error: "Escribe el importe de la renovación." };
        return {
          cambios: { fin_previsto_en: fin, ...(a.estado === "por_recoger" ? { estado: "activo" as EstadoAlquiler } : {}), pagado_alquiler_eur: sumar(a.pagado_alquiler_eur, imp), pago_modo: pagoModo(c.modo), pago_referencia: c.referencia },
          pago: { concepto: "renovacion", meses: f.meses, importe_eur: imp, modo: c.modo, referencia: c.referencia },
          ok: `Renovado ${textoPlan(f.meses)} por ${eurosAlquiler(imp)}: termina el ${fechaPanel(fin)}.`,
        };
      }
      case "cambio": {
        const nueva = unidadesLibres(a).find((u) => u.id === f.unidad);
        if (!nueva) return { error: "Elige la unidad libre que se entrega." };
        const cambios: Partial<Alquiler> = { product_id: nueva.id, producto_titulo: nueva.title, cambio_unidad_en: ahora, cambio_product_id: a.product_id };
        return {
          cambios,
          ...(a.product_id ? { unidad: { product_id: a.product_id, meses_alquilada: sumar(numero(datosUnidad[a.product_id]?.meses_alquilada, 0), mesesTranscurridos(a.inicio_en, ahora)) } } : {}),
          ok: `Unidad cambiada: ahora tiene «${nueva.title}». La devuelta suma los meses que ha estado alquilada.`,
        };
      }
      case "recogida":
        return { cambios: { estado: "por_recoger" }, ok: "Recogida pedida: el alquiler queda «Por recoger»." };
      case "recogido": {
        const meses = mesesAlRecoger(a);
        return {
          cambios: { estado: "revision", devuelto_en: ahora },
          ...(a.product_id ? { unidad: { product_id: a.product_id, meses_alquilada: sumar(numero(datosUnidad[a.product_id]?.meses_alquilada, 0), meses) } } : {}),
          ok: `Recogido: queda en revisión. La unidad suma ${texto(meses)} ${meses === 1 ? "mes" : "meses"}.`,
        };
      }
      case "recargo": {
        const imp = leerNumero(f.importe);
        const tope = Math.max(0, cents(a.fianza_eur) - cents(a.fianza_descuento_eur)) / 100;
        if (imp === null || Number.isNaN(imp) || imp <= 0) return { error: "Escribe el importe del recargo." };
        if (cents(imp) > cents(tope)) return { error: `El recargo no puede pasar de la fianza (${eurosAlquiler(tope)}).` };
        return { cambios: { recargo_eur: imp }, pago: { concepto: "recargo", importe_eur: imp, modo: "fianza" }, ok: `Recargo cobrado de la fianza: ${eurosAlquiler(imp)}.` };
      }
      case "descontar": {
        const imp = leerNumero(f.importe);
        const motivo = f.motivo.replace(/\s+/g, " ").trim();
        const err = validarDescuentoFianza(Number.isNaN(imp) ? null : imp, motivo, a.fianza_eur, a.recargo_eur);
        if (err || imp === null) return { error: err ?? "Escribe el importe que se descuenta de la fianza." };
        return {
          cambios: { fianza_descuento_eur: imp, fianza_descuento_motivo: motivo, fianza_estado: "descontada" },
          ok: `Descuento apuntado: ${eurosAlquiler(imp)}. Se devuelven ${eurosAlquiler(fianzaADevolver(a.fianza_eur, a.recargo_eur, imp))}.`,
        };
      }
      case "devolver":
        return { cambios: { fianza_estado: "devuelta" }, ok: `Fianza devuelta: ${eurosAlquiler(fianzaADevolver(a.fianza_eur, a.recargo_eur, 0))}.` };
      case "vendido": {
        const compra = compraDe(a);
        if (!compra.ofrecer) return { error: "Con estos importes la compra no se ofrece." };
        const c = cobro();
        if ("error" in c) return c;
        const anterior = a.product_id ? datosUnidad[a.product_id]?.categoria_anterior_id ?? null : null;
        return {
          cambios: { compra_eur: compra.importe, comprado_en: ahora, estado: "cerrado", ...(a.fianza_estado === "cobrada" ? { fianza_estado: "devuelta" as EstadoFianza } : {}) },
          pago: { concepto: "compra", importe_eur: compra.importe, modo: c.modo, referencia: c.referencia },
          ...(a.product_id ? { producto: { id: a.product_id, cuerpo: { is_active: false, vendido_en: ahora, modo: "venta", ...(anterior ? { category_id: anterior } : {}) } } } : {}),
          ok: `Vendido al cliente por ${eurosAlquiler(compra.importe)}. El artículo ya no está a la venta ni en alquiler.`,
        };
      }
      case "cerrar":
        return { cambios: { estado: "cerrado" }, ok: "Alquiler cerrado." };
      case "cancelar":
        return {
          cambios: { estado: "cancelado" },
          ok: a.pagado_alquiler_eur > 0 ? `Alquiler cancelado. Devuelve lo pagado (${eurosAlquiler(a.pagado_alquiler_eur)}) por el mismo medio.` : "Alquiler cancelado.",
        };
    }
  };

  // El formulario que trae cada acción al primer toque (con lo calculado ya puesto).
  const formInicial = (a: Alquiler, accion: Accion): FormAccion => {
    if (accion === "renovar") return { ...FORM_VACIO, meses: 1, importe: texto(precioRenovacion(a, 1)) };
    if (accion === "recargo") return { ...FORM_VACIO, importe: texto(recargoDeAlquiler(a, reglas).importe) };
    if (accion === "cambio") return { ...FORM_VACIO, unidad: unidadesLibres(a)[0]?.id ?? null };
    return FORM_VACIO;
  };

  const ejecutar = async (a: Alquiler, accion: Accion) => {
    const clave = `${accion}:${a.id}`;
    if (confirmando !== clave) {
      setConfirmando(clave);
      setForm(formInicial(a, accion));
      setAccionMsg(null);
      return;
    }
    const plan = planDe(a, accion, form);
    if ("error" in plan) {
      setAccionMsg({ id: a.id, tipo: "error", texto: plan.error });
      return;
    }
    setGuardandoAlq(a.id);
    setAccionMsg(null);
    try {
      const r = await supabase.from("alquileres").update(plan.cambios).eq("id", a.id);
      if (r.error) {
        setAccionMsg({ id: a.id, tipo: "error", texto: /check|23514|23505/.test(`${r.error.message} ${r.error.code}`) ? "La base de datos no lo admite: revisa los importes (nunca más que la fianza) y que la unidad esté libre." : "No se ha podido guardar. Inténtalo de nuevo." });
        return;
      }
      setAlquileres((l) => (l ?? []).map((x) => (x.id === a.id ? { ...x, ...plan.cambios } : x)));
      const avisos: string[] = [];
      if (plan.unidad) {
        const u = await supabase.from("alquiler_unidades").upsert(plan.unidad, { onConflict: "product_id" });
        if (u.error) avisos.push("no se han podido sumar los meses a la unidad");
        else setDatosUnidad((m) => ({ ...m, [plan.unidad!.product_id]: { ...m[plan.unidad!.product_id], coste_eur: m[plan.unidad!.product_id]?.coste_eur ?? null, meses_alquilada: plan.unidad!.meses_alquilada } }));
      }
      if (plan.producto) {
        const p = await supabase.from("products").update(plan.producto.cuerpo).eq("id", plan.producto.id);
        if (p.error) avisos.push("no se ha podido marcar el artículo como vendido (hazlo en Productos)");
        else setUnidades((l) => (l ?? []).filter((x) => x.id !== plan.producto!.id));
      }
      if (plan.pago) {
        const fila = { alquiler_id: a.id, ...plan.pago };
        const g = await supabase.from("alquiler_pagos").insert(fila);
        if (!g.error) setPagos((l) => (l === null ? l : [{ alquiler_id: a.id, concepto: plan.pago!.concepto, importe_eur: plan.pago!.importe_eur, creado_en: new Date().toISOString() }, ...l]));
      }
      setConfirmando(null);
      setAccionMsg({ id: a.id, tipo: avisos.length ? "error" : "ok", texto: avisos.length ? `${plan.ok} Pero ${avisos.join(" y ")}.` : plan.ok });
    } catch {
      setAccionMsg({ id: a.id, tipo: "error", texto: "No se ha podido guardar: revisa tu conexión." });
    } finally {
      setGuardandoAlq(null);
    }
  };

  const textoConfirmar = (a: Alquiler, accion: Accion): string => {
    switch (accion) {
      case "pagado":
        return `Toca otra vez para apuntar ${eurosAlquiler(Math.max(0, cents(a.precio_plan_eur) - cents(a.pagado_alquiler_eur)) / 100)}`;
      case "entregado":
        return "Toca otra vez: entregado hoy";
      case "renovar":
        return `Toca otra vez para renovar ${textoPlan(form.meses)}`;
      case "cambio":
        return "Toca otra vez para cambiar la unidad";
      case "recogida":
        return "Toca otra vez para pedir la recogida";
      case "recogido":
        return "Toca otra vez: recogido hoy";
      case "recargo":
        return "Toca otra vez para cobrar el recargo";
      case "descontar":
        return "Toca otra vez para descontar";
      case "devolver":
        return `Toca otra vez para devolver ${eurosAlquiler(fianzaADevolver(a.fianza_eur, a.recargo_eur, 0))}`;
      case "vendido": {
        const c = compraDe(a);
        return `Toca otra vez: vendido por ${c.ofrecer ? eurosAlquiler(c.importe) : "-"}`;
      }
      case "cerrar":
        return "Toca otra vez para cerrar el alquiler";
      case "cancelar":
        return "Toca otra vez para cancelar el alquiler";
    }
  };

  // Lo que pide cada acción tras el primer toque (cómo se cobró, meses, importe, motivo o unidad) y lo que va a pasar.
  const selectorCobro = (a: Alquiler) => (
    <View style={{ gap: 6 }}>
      {etiqueta("Cómo se ha cobrado")}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
        {MODOS_COBRO.map((m) => (
          <Chip key={m.clave} nativeID={`alquiler-cobro-${m.clave}-${a.id}`} label={m.texto} activo={form.modo === m.clave} onPress={() => setForm((x) => ({ ...x, modo: m.clave }))} />
        ))}
      </View>
      {form.modo
        ? campo({
            nativeID: `alquiler-referencia-${a.id}`,
            value: form.referencia,
            onChangeText: (v) => setForm((x) => ({ ...x, referencia: v.slice(0, 120) })),
            placeholder: form.modo === "stripe" ? "Referencia de Stripe (pi_…)" : "Referencia (opcional)",
            autoCapitalize: "none",
            accessibilityLabel: "Referencia del pago",
          })
        : null}
    </View>
  );
  const panelAccion = (a: Alquiler, accion: Accion) => {
    const contenido = (() => {
      switch (accion) {
        case "pagado":
          return (
            <>
              <Detalle>{`Alquiler de ${textoPlan(a.plan_meses)}: ${eurosAlquiler(a.precio_plan_eur)} (IVA incluido).${a.fianza_modo === "tarjeta" ? " Con Stripe, la fianza queda cobrada con él." : ""}`}</Detalle>
              {selectorCobro(a)}
            </>
          );
        case "entregado":
          return <Detalle>{`Empieza hoy y termina el ${fechaPanel(sumarMeses(new Date().toISOString(), a.plan_meses))}.${a.fianza_estado === "pendiente" ? ` La fianza (${eurosAlquiler(a.fianza_eur)}) queda como cobrada en la entrega.` : ""}`}</Detalle>;
        case "renovar":
          return (
            <>
              {etiqueta("Meses que se renueva")}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
                {PLANES_ALQUILER.map((m) => (
                  <Chip key={m} nativeID={`alquiler-renovar-${m}-${a.id}`} label={textoPlan(m)} activo={form.meses === m} onPress={() => setForm((x) => ({ ...x, meses: m, importe: texto(precioRenovacion(a, m)) }))} />
                ))}
              </View>
              <Detalle>{`Nuevo fin previsto: ${fechaPanel(sumarMeses(a.fin_previsto_en ?? new Date().toISOString(), form.meses))}.`}</Detalle>
              <Pressable
                nativeID={`alquiler-renovar-cobrar-${a.id}`}
                onPress={() => setForm((x) => ({ ...x, cobrar: !x.cobrar }))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: form.cobrar }}
                aria-checked={form.cobrar}
                style={({ pressed }) => ({ minHeight: TACTIL.minimo, flexDirection: "row", alignItems: "center", gap: 10, opacity: pressed ? 0.8 : 1 })}
              >
                <Ionicons name={form.cobrar ? "checkbox" : "square-outline"} size={24} color={form.cobrar ? COLORS.accent : COLORS.text} />
                <Text style={{ flex: 1, color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.cuerpo }}>Cobrado ahora</Text>
              </Pressable>
              {form.cobrar ? (
                <>
                  {etiqueta("Importe de la renovación (€)")}
                  {campo({ nativeID: `alquiler-importe-${a.id}`, value: form.importe, onChangeText: (v) => setForm((x) => ({ ...x, importe: importe(v) })), keyboardType: "decimal-pad", accessibilityLabel: "Importe de la renovación" })}
                  {selectorCobro(a)}
                </>
              ) : null}
            </>
          );
        case "cambio": {
          const libres = unidadesLibres(a);
          return libres.length ? (
            <>
              {etiqueta("Unidad que se entrega (libres)")}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
                {libres.map((u) => (
                  <Chip key={u.id} nativeID={`alquiler-cambio-unidad-${u.id}-${a.id}`} label={u.title} activo={form.unidad === u.id} onPress={() => setForm((x) => ({ ...x, unidad: u.id }))} />
                ))}
              </View>
              <Detalle>Sin coste para el cliente: el plazo, el precio y la fianza no cambian.</Detalle>
            </>
          ) : (
            <Detalle color={COLORS.danger}>No hay ninguna unidad libre para el cambio.</Detalle>
          );
        }
        case "recogido":
          return <Detalle>{`Queda en revisión. La unidad suma ${texto(mesesAlRecoger(a))} meses de alquiler.`}</Detalle>;
        case "recargo": {
          const r = recargoDeAlquiler(a, reglas);
          return (
            <>
              <Detalle>{`${r.dias} ${r.dias === 1 ? "día" : "días"} de retraso, ${reglas.cortesia_dias} de cortesía, ${eurosAlquiler(reglas.recargo_dia_eur)} por día: ${eurosAlquiler(r.importe)} (como mucho, la fianza).`}</Detalle>
              {etiqueta("Recargo (€)")}
              {campo({ nativeID: `alquiler-importe-${a.id}`, value: form.importe, onChangeText: (v) => setForm((x) => ({ ...x, importe: importe(v) })), keyboardType: "decimal-pad", accessibilityLabel: "Importe del recargo" })}
            </>
          );
        }
        case "descontar":
          return (
            <>
              {etiqueta(`Importe que se descuenta (€, como mucho ${eurosAlquiler(fianzaADevolver(a.fianza_eur, a.recargo_eur, 0))})`)}
              {campo({ nativeID: `alquiler-importe-${a.id}`, value: form.importe, onChangeText: (v) => setForm((x) => ({ ...x, importe: importe(v) })), keyboardType: "decimal-pad", accessibilityLabel: "Importe del descuento" })}
              {etiqueta("Motivo (obligatorio)")}
              {campo({ nativeID: `alquiler-motivo-${a.id}`, value: form.motivo, onChangeText: (v) => setForm((x) => ({ ...x, motivo: v.slice(0, 500) })), multiline: true, maxLength: 500, style: { minHeight: 88 }, accessibilityLabel: "Motivo del descuento" })}
              <Detalle nativeID={`alquiler-motivo-ayuda-${a.id}`}>Lo verá el cliente: escríbelo de forma clara y profesional.</Detalle>
            </>
          );
        case "vendido": {
          const c = compraDe(a);
          return (
            <>
              <Detalle>{c.ofrecer ? `${texto(a.precio_venta_eur)} − ${texto(a.pagado_alquiler_eur)} + ${texto(reglas.plus_compra_eur)} = ${eurosAlquiler(c.importe)}. El artículo pasa a vendido.` : ""}</Detalle>
              {selectorCobro(a)}
            </>
          );
        }
        case "cancelar":
          return a.pagado_alquiler_eur > 0 ? <Detalle color={COLORS.danger}>{`Ya ha pagado ${eurosAlquiler(a.pagado_alquiler_eur)}: tendrás que devolvérselo por el mismo medio.`}</Detalle> : null;
        default:
          return null;
      }
    })();
    if (!contenido) return null;
    return (
      <View nativeID={`alquiler-panel-${accion}-${a.id}`} style={{ width: "100%", gap: 8, borderRadius: 14, backgroundColor: COLORS.bg2, padding: 12 }}>
        {contenido}
      </View>
    );
  };

  const verContrato = async (a: Alquiler) => {
    if (a.id in contratos) {
      setContratos((m) => {
        const n = { ...m };
        delete n[a.id];
        return n;
      });
      return;
    }
    const { data, error } = await supabase.from("alquileres").select("contrato_texto").eq("id", a.id).maybeSingle<{ contrato_texto: string }>();
    setContratos((m) => ({ ...m, [a.id]: error || !data ? null : data.contrato_texto }));
  };

  // --- Lista de alquileres ---
  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const estados = PASTILLAS.find((x) => x.clave === filtro)?.estados ?? [];
    return (alquileres ?? []).filter((a) => {
      if (estados.length && !estados.includes(a.estado)) return false;
      if (!q) return true;
      const c = clientes[a.user_id];
      return [c?.nombre, c?.telefono, c?.email, a.producto_titulo, a.id.slice(0, 8)].some((t) => (t ?? "").toLowerCase().includes(q));
    });
  }, [alquileres, filtro, buscar, clientes]);

  const fechasDe = (a: Alquiler) => {
    if (a.estado === "revision" || a.estado === "cerrado") return a.inicio_en ? `${fechaPanel(a.inicio_en)} → ${fechaPanel(a.devuelto_en ?? a.fin_previsto_en)}` : `Desde ${fechaPanel(a.creado_en)}`;
    return a.inicio_en ? `${fechaPanel(a.inicio_en)} → ${fechaPanel(a.fin_previsto_en)}` : `Solicitado el ${fechaPanel(a.creado_en)}`;
  };
  const plazoDe = (a: Alquiler): { texto: string; color: string } | null => {
    if ((a.estado !== "activo" && a.estado !== "por_recoger") || !a.fin_previsto_en) return null;
    const retraso = diasRetraso(a.fin_previsto_en);
    if (retraso > 0) return { texto: `${retraso} ${retraso === 1 ? "día" : "días"} de retraso`, color: COLORS.danger };
    const quedan = diasRestantes(a.fin_previsto_en);
    return { texto: `Quedan ${quedan} ${quedan === 1 ? "día" : "días"}`, color: COLORS.text };
  };

  const listaAlquileres = (
    <Seccion icon="repeat-outline" title="Alquileres" nativeID="alquiler-alquileres" extra={alquileres ? `${alquileres.length}` : undefined}>
      {alquileres === null ? (
        <ListaVacia nativeID="alquiler-alquileres-error" icono="alert-circle-outline" titulo="No se han podido leer los alquileres." texto="Vuelve a abrir la pantalla en un momento." />
      ) : alquileres.length === 0 ? (
        <ListaVacia
          nativeID="alquiler-alquileres-vacia"
          icono="repeat-outline"
          titulo="Aún no hay alquileres."
          texto={activo ? "Cuando un cliente alquile una unidad, aparecerá aquí con sus pasos." : "Con el alquiler apagado nadie puede alquilar: aquí saldrán cuando lo actives."}
        />
      ) : (
        <View style={{ gap: 10 }}>
          <Buscador nativeID="alquiler-buscar" valor={buscar} onCambiar={setBuscar} placeholder="Buscar cliente, unidad o número" etiqueta="Buscar alquileres" />
          <FilaPastillas isMobile={isMobile} nativeID="alquiler-pastillas">
            {PASTILLAS.map((x) => {
              const n = x.estados.length ? alquileres.filter((a) => x.estados.includes(a.estado)).length : alquileres.length;
              return <Chip key={x.clave} nativeID={`alquiler-pastilla-${x.clave}`} label={`${x.texto} (${n})`} activo={filtro === x.clave} onPress={() => setFiltro(x.clave)} />;
            })}
          </FilaPastillas>
          <RecuentoLista nativeID="alquiler-recuento" texto={`${filtrados.length} de ${alquileres.length} alquileres`} abiertas={false} idBoton="alquiler-abrir-todos" />
          {filtrados.length === 0 ? (
            <ListaVacia nativeID="alquiler-filtro-vacio" icono="search-outline" titulo="Ningún alquiler con este filtro." texto="Cambia la pastilla o la búsqueda." />
          ) : (
            <View>
              {filtrados.map((a, i) => {
                const abierta = desplegablesAlq.estaAbierta(a.id);
                const c = clientes[a.user_id];
                const nombre = c?.nombre || c?.email || "Cliente";
                const plazo = plazoDe(a);
                const r = recargoDeAlquiler(a, reglas);
                const compra = compraDe(a);
                const acciones = accionesDe(a);
                const accionAbierta = acciones.find((x) => confirmando === `${x}:${a.id}`) ?? null;
                return (
                  <FilaLista
                    key={a.id}
                    nativeID={`alquiler-${a.id}`}
                    idFila={`alquiler-fila-${a.id}`}
                    primera={i === 0}
                    abierta={abierta}
                    onPress={() => desplegablesAlq.alternar(a.id)}
                    etiquetaAccesible={`${nombre}, ${ETIQUETA_ALQUILER[a.estado]}. ${abierta ? "Plegar" : "Ver el detalle"}`}
                    miniatura={
                      <Miniatura icono="repeat-outline" ancho={48} alto={48}>
                        {a.product_id && fotos[a.product_id] ? <Image source={{ uri: fotos[a.product_id] }} resizeMode="cover" accessibilityLabel={`Foto de ${a.producto_titulo ?? "la unidad"}`} style={{ width: "100%", height: "100%" }} /> : undefined}
                      </Miniatura>
                    }
                    titulo={nombre}
                    etiqueta={<EtiquetaColor nativeID={`alquiler-estado-${a.id}`} texto={ETIQUETA_ALQUILER[a.estado]} tono={TONO_ALQUILER[a.estado]} />}
                    subtitulo={`${a.producto_titulo ?? "Unidad"} · ${textoPlan(a.plan_meses)} · ${fechasDe(a)}`}
                    idSubtitulo={`alquiler-subtitulo-${a.id}`}
                    etiquetas={
                      <>
                        {plazo ? (
                          <Text nativeID={`alquiler-plazo-${a.id}`} style={{ color: plazo.color, fontWeight: "800", fontSize: TAMANOS.minimo }}>
                            {plazo.texto}
                          </Text>
                        ) : null}
                        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.minimo }}>{eurosAlquiler(a.precio_plan_eur)}</Text>
                        <Text nativeID={`alquiler-fianza-fila-${a.id}`} style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo }}>
                          Fianza {eurosAlquiler(a.fianza_eur)} · {ESTADOS_FIANZA[a.fianza_estado]}
                        </Text>
                      </>
                    }
                  >
                    <DetalleFila
                      nativeID={`alquiler-detalle-${a.id}`}
                      idAcciones={`alquiler-acciones-${a.id}`}
                      acciones={
                        acciones.length ? (
                          <>
                            {acciones.map((x) => (
                              <AccionTexto
                                key={x}
                                nativeID={`alquiler-accion-${x}-${a.id}`}
                                icono={ICONO_ACCION[x]}
                                color={x === "cancelar" || x === "descontar" ? COLORS.danger : undefined}
                                disabled={guardandoAlq === a.id}
                                texto={confirmando === `${x}:${a.id}` ? textoConfirmar(a, x) : TEXTO_ACCION[x]}
                                onPress={() => ejecutar(a, x)}
                              />
                            ))}
                            {accionAbierta ? <AccionTexto nativeID={`alquiler-descartar-${a.id}`} icono="close-outline" color={COLORS.muted} texto="Descartar" onPress={() => setConfirmando(null)} /> : null}
                            {accionAbierta ? panelAccion(a, accionAbierta) : null}
                            {accionMsg?.id === a.id ? (
                              <Text nativeID={`alquiler-accion-mensaje-${a.id}`} style={{ width: "100%", color: accionMsg.tipo === "ok" ? COLORS.success : COLORS.danger, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                                {accionMsg.texto}
                              </Text>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <Detalle>{a.estado === "cancelado" ? "Alquiler cancelado: no hay nada más que hacer." : "Alquiler cerrado: no hay nada más que hacer."}</Detalle>
                            {accionMsg?.id === a.id ? (
                              <Text nativeID={`alquiler-accion-mensaje-${a.id}`} style={{ width: "100%", color: accionMsg.tipo === "ok" ? COLORS.success : COLORS.danger, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                                {accionMsg.texto}
                              </Text>
                            ) : null}
                          </>
                        )
                      }
                    >
                      <Bloque icono="person-outline" titulo="Cliente" ancho={anchoBloque} nativeID={`alquiler-bloque-cliente-${a.id}`}>
                        <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.cuerpo }}>{nombre}</Text>
                        <Text selectable style={{ color: COLORS.muted, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                          {[c?.telefono, c?.email].filter(Boolean).join(" · ") || "Sin teléfono ni correo guardados"}
                        </Text>
                        <AccionTexto
                          nativeID={`alquiler-ficha-${a.id}`}
                          icono="id-card-outline"
                          texto="Ver ficha del cliente"
                          onPress={() => router.push({ pathname: "/admin/cliente/[userId]", params: { userId: a.user_id, email: c?.email ?? "" } } as never)}
                        />
                      </Bloque>
                      <Bloque icono="calendar-outline" titulo="Alquiler" ancho={anchoBloque} nativeID={`alquiler-bloque-alquiler-${a.id}`}>
                        <Dato etiqueta="Unidad">{a.producto_titulo ?? "-"}</Dato>
                        <Dato etiqueta="Plan">{`${textoPlan(a.plan_meses)} · ${eurosAlquiler(a.precio_plan_eur)}${mesesContratados(a.inicio_en, a.fin_previsto_en) > a.plan_meses ? ` · renovado hasta ${textoPlan(mesesContratados(a.inicio_en, a.fin_previsto_en))}` : ""}`}</Dato>
                        <Dato etiqueta="Pagado">{`${eurosAlquiler(a.pagado_alquiler_eur)}${a.pago_modo ? ` · ${a.pago_modo === "real" ? "Stripe" : a.pago_modo === "prueba" ? "Stripe (prueba)" : a.pago_modo === "bizum" ? "Bizum" : "efectivo"}` : ""}${a.pago_referencia ? ` · ${a.pago_referencia}` : ""}`}</Dato>
                        <Dato etiqueta="Inicio">{a.inicio_en ? fechaPanel(a.inicio_en) : "al entregarlo"}</Dato>
                        <Dato etiqueta="Fin previsto">{a.fin_previsto_en ? fechaPanel(a.fin_previsto_en) : "-"}</Dato>
                        {/* Con retraso, los días los dice el recargo calculado (justo debajo). */}
                        {plazo && r.dias === 0 ? <Dato etiqueta="Plazo">{plazo.texto}</Dato> : null}
                        {a.devuelto_en ? <Dato etiqueta="Recogido">{fechaPanel(a.devuelto_en, true)}</Dato> : null}
                        {r.dias > 0 && a.estado !== "cerrado" && a.estado !== "cancelado" ? (
                          <Dato nativeID={`alquiler-recargo-calculado-${a.id}`} etiqueta="Recargo calculado">{`${eurosAlquiler(r.importe)} (${r.dias} ${r.dias === 1 ? "día" : "días"} de retraso)`}</Dato>
                        ) : null}
                        {a.cambio_unidad_en ? <Dato etiqueta="Cambio de unidad">{`${fechaPanel(a.cambio_unidad_en)}${a.cambio_product_id && unidadDe(a.cambio_product_id) ? ` · devuelta «${unidadDe(a.cambio_product_id)!.title}»` : ""}`}</Dato> : null}
                      </Bloque>
                      <Bloque icono="shield-checkmark-outline" titulo="Fianza" ancho={anchoBloque} nativeID={`alquiler-bloque-fianza-${a.id}`}>
                        <Dato etiqueta="Importe">{`${eurosAlquiler(a.fianza_eur)} (sin IVA)`}</Dato>
                        <Dato etiqueta="Cómo se cobra">{MODOS_FIANZA[a.fianza_modo].titulo}</Dato>
                        <Dato etiqueta="Estado">{ESTADOS_FIANZA[a.fianza_estado]}</Dato>
                        {a.recargo_eur > 0 ? <Dato etiqueta="Recargo cobrado">{eurosAlquiler(a.recargo_eur)}</Dato> : null}
                        {a.fianza_descuento_eur > 0 ? <Dato etiqueta="Descuento">{`${eurosAlquiler(a.fianza_descuento_eur)} · ${a.fianza_descuento_motivo ?? ""}`}</Dato> : null}
                        {a.fianza_estado !== "pendiente" ? <Dato etiqueta={a.fianza_estado === "cobrada" ? "Por devolver" : "Devuelto"}>{eurosAlquiler(fianzaADevolver(a.fianza_eur, a.recargo_eur, a.fianza_descuento_eur))}</Dato> : null}
                      </Bloque>
                      {a.compra_eur || a.estado === "activo" || a.estado === "por_recoger" ? (
                        <Bloque icono="bag-check-outline" titulo="Compra tras alquiler" ancho={anchoBloque} nativeID={`alquiler-bloque-compra-${a.id}`}>
                          {a.compra_eur ? (
                            <Dato etiqueta="Comprado">{`${eurosAlquiler(a.compra_eur)} · ${fechaPanel(a.comprado_en)}`}</Dato>
                          ) : compra.ofrecer ? (
                            <Text nativeID={`alquiler-compra-${a.id}`} style={{ color: COLORS.text, fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                              {`Si lo compra hoy: ${texto(a.precio_venta_eur)} − ${texto(a.pagado_alquiler_eur)} + ${texto(reglas.plus_compra_eur)} = `}
                              <Text style={{ fontWeight: "900" }}>{eurosAlquiler(compra.importe)}</Text>
                            </Text>
                          ) : (
                            <Detalle nativeID={`alquiler-compra-${a.id}`}>Con estos importes la compra no se ofrece (saldría por debajo del coste).</Detalle>
                          )}
                        </Bloque>
                      ) : null}
                      <Bloque icono="document-text-outline" titulo="Contrato" ancho={anchoBloque} nativeID={`alquiler-bloque-contrato-${a.id}`}>
                        <Dato etiqueta="Aceptado">{fechaPanel(a.contrato_aceptado_en, true)}</Dato>
                        <Text selectable nativeID={`alquiler-huella-${a.id}`} style={{ color: COLORS.muted, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                          {`Huella SHA-256: ${a.contrato_hash}`}
                        </Text>
                        <AccionTexto nativeID={`alquiler-ver-contrato-${a.id}`} icono={a.id in contratos ? "eye-off-outline" : "eye-outline"} texto={a.id in contratos ? "Ocultar la copia" : "Ver la copia aceptada"} onPress={() => verContrato(a)} />
                        {a.id in contratos ? (
                          <ScrollView nativeID={`alquiler-contrato-copia-${a.id}`} style={{ maxHeight: 320, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: "#FFFFFF" }} contentContainerStyle={{ padding: 10 }} nestedScrollEnabled>
                            <Text selectable style={{ color: COLORS.text, fontSize: TAMANOS.minimo, lineHeight: 20 }}>
                              {contratos[a.id] ?? "No se ha podido traer la copia. Inténtalo de nuevo."}
                            </Text>
                          </ScrollView>
                        ) : null}
                      </Bloque>
                    </DetalleFila>
                  </FilaLista>
                );
              })}
            </View>
          )}
        </View>
      )}
    </Seccion>
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
          {etiqueta("Porcentaje del precio de venta de cada plan. Redondeo: por debajo de 90 €, a «,90»; desde 90 €, al entero acabado en 9.")}
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
      {avisoUnidades ? (
        <Text nativeID="alquiler-unidades-aviso" style={{ color: COLORS.success, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
          {avisoUnidades}
        </Text>
      ) : null}
      {unidades === null ? (
        <ListaVacia nativeID="alquiler-unidades-error" icono="alert-circle-outline" titulo="No se han podido leer las unidades." texto="Vuelve a abrir la pantalla en un momento." />
      ) : unidades.length === 0 ? (
        <ListaVacia
          nativeID="alquiler-unidades-vacia"
          icono="cube-outline"
          titulo="Aún no hay unidades de alquiler."
          texto="Llegan desde VeoAura con el botón «En Escaparate para Alquilar» o desde Productos con «Para alquilar»: cada artículo es una unidad con su propia ficha."
        />
      ) : (
        <View style={{ gap: 4 }}>
          {unidades.map((u, i) => {
            const precio = Number(u.price_eur) || 0;
            const manuales = manualesDe(u);
            const precios = preciosAlquiler(precio, pctsEjemplo, manuales);
            const abierta = desplegables.estaAbierta(u.id);
            const datos = datosUnidad[u.id];
            const info = infoUnidades[u.id] ?? { estado: "libre" as EstadoUnidad, enCurso: null, ganado: 0, meses: 0 };
            const textoEstado = info.estado === "alquilada" && info.enCurso?.fin_previsto_en ? `Alquilada hasta el ${fechaPanel(info.enCurso.fin_previsto_en)}` : ESTADOS_UNIDAD[info.estado];
            const coste = costeDe(u.id);
            const ed = edicion[u.id] ?? {
              precios: { 1: manuales[1] ? texto(manuales[1]) : "", 2: manuales[2] ? texto(manuales[2]) : "", 3: manuales[3] ? texto(manuales[3]) : "", 4: manuales[4] ? texto(manuales[4]) : "" },
              coste: datos?.coste_eur != null ? texto(Number(datos.coste_eur)) : "",
            };
            const cambiar = (c: Partial<typeof ed>) => setEdicion((m) => ({ ...m, [u.id]: { ...ed, ...c } }));
            const vendiendo = confirmando === `venta:${u.id}`;
            const anterior = datos?.categoria_anterior_id ?? null;
            return (
              <FilaLista
                key={u.id}
                nativeID={`alquiler-unidad-${u.id}`}
                idFila={`alquiler-unidad-fila-${u.id}`}
                primera={i === 0}
                abierta={abierta}
                onPress={() => desplegables.alternar(u.id)}
                etiquetaAccesible={`${u.title}, ${textoEstado}. ${abierta ? "Plegar" : "Ver el detalle"}`}
                miniatura={
                  <Miniatura icono="game-controller-outline" ancho={48} alto={48}>
                    {fotos[u.id] ? <Image source={{ uri: fotos[u.id] }} resizeMode="cover" accessibilityLabel={`Foto de ${u.title}`} style={{ width: "100%", height: "100%" }} /> : undefined}
                  </Miniatura>
                }
                titulo={u.title}
                etiqueta={<EtiquetaColor nativeID={`alquiler-unidad-estado-${u.id}`} texto={textoEstado} tono={TONO_UNIDAD[info.estado]} />}
                // Con espacios de no separación: «3 m 109 €» nunca se parte en dos líneas.
                subtitulo={`Venta ${eurosAlquiler(precio)} · ${PLANES_ALQUILER.map((p) => `${p} m ${eurosAlquiler(precios[p])}`).join(" · ")}`}
                etiquetas={
                  <Text nativeID={`alquiler-unidad-datos-${u.id}`} style={{ color: COLORS.muted, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
                    <Text style={{ color: info.estado === "vender" ? COLORS.danger : COLORS.text }}>{`${texto(info.meses)} de ${reglas.meses_max_unidad} meses`}</Text>
                    {` · Ganado ${eurosAlquiler(info.ganado)}${coste !== null ? ` · Coste ${eurosAlquiler(coste)}` : ""} · ${u.is_active && u.status === "PUBLISHED" ? "Publicada" : "Oculta"}`}
                  </Text>
                }
              >
                <DetalleFila
                  nativeID={`alquiler-unidad-detalle-${u.id}`}
                  acciones={
                    <>
                      <AccionTexto
                        nativeID={`alquiler-unidad-guardar-${u.id}`}
                        icono="save-outline"
                        texto={guardandoUnidad === u.id && !vendiendo ? "Guardando…" : "Guardar la unidad"}
                        disabled={guardandoUnidad === u.id}
                        onPress={() => guardarUnidad(u)}
                      />
                      <AccionTexto
                        nativeID={`alquiler-unidad-venta-${u.id}`}
                        icono="storefront-outline"
                        texto={vendiendo ? "Toca otra vez para pasarla a la venta" : "Pasar a la venta"}
                        disabled={guardandoUnidad === u.id}
                        onPress={() => pasarALaVenta(u)}
                      />
                      {vendiendo ? <AccionTexto nativeID={`alquiler-unidad-venta-descartar-${u.id}`} icono="close-outline" color={COLORS.muted} texto="Descartar" onPress={() => setConfirmando(null)} /> : null}
                      {vendiendo ? (
                        <View nativeID={`alquiler-unidad-venta-panel-${u.id}`} style={{ width: "100%", gap: 8, borderRadius: 14, backgroundColor: COLORS.bg2, padding: 12 }}>
                          {etiqueta(anterior && categorias.some((c) => c.id === anterior) ? "Categoría en la que se venderá (marcada, la que tenía antes)" : "Categoría en la que se venderá")}
                          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
                            {categorias.filter((c) => c.is_active || c.id === anterior).map((c) => (
                              <Chip key={c.id} nativeID={`alquiler-unidad-categoria-${c.id}-${u.id}`} label={c.name} activo={categoriaVenta[u.id] === c.id} onPress={() => setCategoriaVenta((m) => ({ ...m, [u.id]: c.id }))} />
                            ))}
                          </View>
                          <Detalle>Sale del alquiler y vuelve a venderse como un artículo más. Revisa después su ficha en Productos.</Detalle>
                        </View>
                      ) : null}
                    </>
                  }
                >
                  <Bloque icono="pricetag-outline" titulo="Precios a mano (vacío = calculado)" ancho={anchoBloque}>
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
                  <Bloque icono="lock-closed-outline" titulo="Solo para ti" ancho={anchoBloque}>
                    {etiqueta("Coste de la unidad (€)")}
                    {campo({ nativeID: `alquiler-unidad-coste-${u.id}`, value: ed.coste, onChangeText: (v) => cambiar({ coste: importe(v) }), keyboardType: "decimal-pad", placeholder: "Sin poner", accessibilityLabel: "Coste de la unidad" })}
                    <Dato etiqueta="Meses alquilada">{`${texto(info.meses)} de ${reglas.meses_max_unidad}`}</Dato>
                    <Dato etiqueta="Ganado en alquileres">{eurosAlquiler(info.ganado)}</Dato>
                    {coste !== null ? <Dato etiqueta="Resultado (ganado − coste)">{eurosAlquiler((cents(info.ganado) - cents(coste)) / 100)}</Dato> : null}
                    {info.estado === "vender" ? <Detalle color={COLORS.danger}>Ha llegado al máximo de meses: pásala a la venta como revisada.</Detalle> : null}
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

  const ancho3 = isMobile ? "30%" : 0;
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
                    <Cifra nativeID="alquiler-cifra-unidades" valor={String(cifras.total)} etiqueta="Unidades de alquiler" icono="cube-outline" ancho={ancho3} />
                    <Cifra nativeID="alquiler-cifra-libres" valor={String(cifras.libres)} etiqueta="Libres" icono="checkmark-circle-outline" ancho={ancho3} />
                    <Cifra nativeID="alquiler-cifra-alquiladas" valor={String(cifras.alquiladas)} etiqueta="Alquiladas" icono="repeat-outline" ancho={ancho3} />
                    <Cifra nativeID="alquiler-cifra-vender" valor={String(cifras.vender)} etiqueta="Toca venderla" icono="storefront-outline" ancho={ancho3} alerta={cifras.vender > 0} />
                    <Cifra nativeID="alquiler-cifra-ocupacion" valor={`${cifras.ocupacion} %`} etiqueta="Ocupación" icono="pie-chart-outline" ancho={ancho3} />
                    <Cifra nativeID="alquiler-cifra-ingresos" valor={eurosAlquiler(cifras.ingresos)} etiqueta="Ingresos del mes" icono="cash-outline" ancho={ancho3} />
                  </FilaCifras>
                  {activo ? (
                    <>
                      {listaAlquileres}
                      {listaUnidades}
                      {ajustes}
                    </>
                  ) : (
                    <>
                      {ajustes}
                      {listaUnidades}
                      {listaAlquileres}
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
