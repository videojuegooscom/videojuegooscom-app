/**
 * Archivo: app/admin/escaparate.tsx
 * Función: pantalla de administración «Escaparate VeoAura», en la dirección /admin/escaparate.
 * Para qué sirve: el administrador ve el puente con VeoAura: ventas hechas en la tienda y si ya se avisó, artículos llegados de VeoAura a la venta, y el registro de mensajes y facturas con sus fallos.
 * Conectado con: lib/supabase.ts (tablas del escaparate y escaparate_registro), components/marca/CargaMarca.tsx, constants/temaTienda.ts, lib/admin/productos.componentes.tsx, components/admin/PiezasPanelAdmin.tsx; api/escaparate-retorno.ts.
 * Utilizado por: Expo Router (dirección /admin/escaparate, protegida por app/admin/_layout.tsx); la enlaza la tarjeta «Escaparate VeoAura» de app/admin/index.tsx.
 * Dependencias: react, react-native, expo-router.
 * Estado: ACTIVO
 */
/**
 * Notas:
 * Qué hace: pantalla de administración "Escaparate VeoAura". Reúne en un sitio todo el
 * puente con VeoAura:
 * - Ventas en la tienda: cada artículo de VeoAura pedido en la tienda (y su anulación) y si
 *   ya se le ha avisado a VeoAura (puente de vuelta, api/escaparate-retorno.ts). Lo que siga
 *   pendiente o con error hay que tenerlo en cuenta para no venderlo dos veces.
 * - En el escaparate: los artículos que llegaron de VeoAura, si están a la venta, vendidos o
 *   retirados, con sus visitas y «me gusta».
 * - Últimos mensajes: el registro del puente (escaparate_registro), con los fallos a la vista. También las
 *   facturas que manda VeoAura (evento «factura» y «PDF de la factura», 2026-11-10), con su recuento arriba.
 *
 * Cómo funciona: al abrirla (y con «Enviar ahora») despierta api/escaparate-retorno.ts, que
 * apunta y envía los avisos pendientes; después lee las tablas. Solo el administrador puede
 * leerlas (RLS con is_admin()).
 *
 * Rediseño PANRED2 (2026-11-16, piezas de components/admin/PiezasPanelAdmin.tsx, como Usuarios, Pedidos y Categorías): cifras
 * que filtran (ventas sin confirmar, a la venta, recibidos, fichas de cliente, productos en VeoAura y facturas), las
 * líneas de resumen de siempre, buscador de 16 px, pastillas de 44 px con su recuento (todo, pendientes, ventas,
 * productos de la tienda, escaparate y mensajes), filas compactas con su etiqueta de color (Pendiente de avisar, Avisado a
 * VeoAura, Error al avisar, A la venta, Vendido, Retirado, Correcto…) y, al tocar una, el detalle por bloques con las
 * acciones abajo («Ver en la tienda»).
 *
 * Conectado con:
 * - app/admin/index.tsx → tarjeta "Escaparate VeoAura" que lleva aquí.
 * - app/admin/_layout.tsx → registra esta ruta ("escaparate") en el Stack.
 * - components/AsistenteBlue.tsx → al admin le avisa Blue si hay ventas sin confirmar.
 * - Productos de la tienda a VeoAura (2026-11-13): cada producto creado a mano (sin id_veoaura) y si ya se avisó
 *   a VeoAura («producto_tienda»; pendiente o en VeoAura ✓), desde escaparate_salida_productos.
 * - supabase/migrations/20261015100000_escaparate_novedades_retorno.sql (escaparate_salida).
 * - supabase/migrations/20261113130000_escaparate_salida_productos.sql (escaparate_salida_productos; sin ella se omite).
 * - api/escaparate-veoaura.ts (evento «factura») y app/admin/pedidos.tsx (donde se descargan las facturas).
 * - Tamaños del móvil (constants/temaTienda.ts): ningún texto de menos de 13 px, grises desde COLORES_TEXTO.secundario y todo
 *   lo que se toca (volver, enviar, filas, pastillas) de 44 px; pruebas VA, TM5 y PANRED2 de pruebas/perfil-datos.mjs.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StatusBar, Text, View, useWindowDimensions } from "react-native";
import { router, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import CargaMarca from "../../components/marca/CargaMarca";
import { COLORES_TEXTO, TACTIL, TAMANOS } from "../../constants/temaTienda";
import { AdminHeader } from "../../lib/admin/productos.componentes";
import {
  AccionTexto,
  Bloque,
  Buscador,
  Chip,
  Cifra,
  Dato,
  Detalle,
  EtiquetaColor,
  FilaPastillas,
  ListaVacia,
  Miniatura,
  Seccion,
  useDesplegables,
  type IoniconName,
  type Tono,
} from "../../components/admin/PiezasPanelAdmin";

const COLORS = {
  bg: "#FFFFFF",
  bg2: "#F4F9FD",
  border: "#E3EAF2",
  text: "#0B2138",
  muted: COLORES_TEXTO.secundario,
  accent: "#1EA7E8",
  success: "#15803D",
  danger: "#B91C1C",
  warn: "#B45309",
};

type Salida = {
  id: string;
  creado_en: string;
  // «pedido_pagado»: el pedido se entregó y VeoAura recibe el nombre, el correo y el teléfono del cliente.
  evento: "pedido" | "pedido_anulado" | "pedido_pagado";
  id_veoaura: string;
  pedido_id: string;
  estado: "pendiente" | "enviando" | "enviado" | "error" | "descartado";
  intentos: number;
  enviado_en: string | null;
  detalle: string | null;
};

// Aviso «producto_tienda»: un producto creado a mano en la tienda que VeoAura debe dar de alta en su Stock.
type AvisoProducto = {
  producto_id: string;
  estado: Salida["estado"];
  intentos: number;
  enviado_en: string | null;
  detalle: string | null;
  creado_en: string;
  titulo?: string;
  id_veoaura?: string | null;
};

type Articulo = {
  id: string;
  id_veoaura: string;
  title: string;
  price_eur: number | string | null;
  is_active: boolean | null;
  vendido_en: string | null;
  retirado_en: string | null;
  view_count: number | null;
  like_count: number | null;
};

type Registro = {
  id: number;
  recibido_en: string;
  evento: string | null;
  resultado: string;
  http: number | null;
  detalle: string | null;
};

type Vista = "todo" | "pendientes" | "ventas" | "productos" | "escaparate" | "mensajes";

// Nombre de cada mensaje que llega de VeoAura en «Últimos mensajes» (los que no están aquí salen tal cual).
const NOMBRE_EVENTO: Record<string, string> = {
  publicar: "publicar",
  vendido: "vendido",
  retirar: "retirar",
  fotos: "fotos",
  seguimiento: "seguimiento",
  factura: "factura",
  factura_pdf: "PDF de la factura",
};

const ESTADO_SALIDA: Record<Salida["estado"], { texto: string; tono: Tono }> = {
  pendiente: { texto: "Pendiente de avisar", tono: "amarillo" },
  enviando: { texto: "Avisando…", tono: "amarillo" },
  enviado: { texto: "Avisado a VeoAura", tono: "verde" },
  error: { texto: "Error al avisar", tono: "rojo" },
  descartado: { texto: "Cancelado antes de avisar", tono: "gris" },
};

const PENDIENTE: Salida["estado"][] = ["pendiente", "error", "enviando"];

// Estado de un producto de la tienda respecto a VeoAura: «en VeoAura ✓» solo cuando VeoAura ya respondió con su id.
function textoEstadoProducto(estado: Salida["estado"]): string {
  if (estado === "enviado") return "Enviado a VeoAura · en VeoAura ✓";
  if (estado === "descartado") return "No hace falta: ya tiene id de VeoAura";
  return "Enviado a VeoAura · pendiente";
}

function tonoProducto(estado: Salida["estado"]): Tono {
  if (estado === "enviado") return "verde";
  if (estado === "descartado") return "gris";
  if (estado === "error") return "rojo";
  return "amarillo";
}

function textoEvento(s: Salida) {
  return s.evento === "pedido" ? "Pedido" : s.evento === "pedido_anulado" ? "Pedido cancelado" : "Pedido entregado · ficha del cliente (nombre, correo y teléfono)";
}

// Precio siempre con dos decimales, coma decimal y miles con punto (155,00€ · 1.299,00€).
function fmtEUR(value: number) {
  const v = Number(value);
  const cents = Math.round((Number.isFinite(v) ? v : 0) * 100);
  const [ent, dec] = (Math.abs(cents) / 100).toFixed(2).split(".");
  return `${cents < 0 ? "-" : ""}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}€`;
}

function fmtFechaHora(iso: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es-ES", {
      timeZone: "Europe/Madrid",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

function estadoArticulo(a: Articulo): { texto: string; tono: Tono } {
  if (a.is_active) return { texto: "A la venta", tono: "verde" };
  if (a.vendido_en && (!a.retirado_en || a.vendido_en > a.retirado_en)) return { texto: "Vendido", tono: "indigo" };
  return { texto: "Retirado", tono: "amarillo" };
}

// Una fila compacta que se despliega: icono, título con su etiqueta, una línea de datos y, abierta, su detalle.
function FilaEscaparate({
  id,
  primera,
  icono,
  titulo,
  estado,
  idEstado,
  linea,
  abierta,
  onAlternar,
  children,
}: {
  id: string;
  primera: boolean;
  icono: IoniconName;
  titulo: string;
  estado: { texto: string; tono: Tono };
  idEstado?: string;
  linea: string;
  abierta: boolean;
  onAlternar: () => void;
  children: React.ReactNode;
}) {
  return (
    <View nativeID={id} style={{ borderTopWidth: primera ? 0 : 1, borderTopColor: COLORS.border, paddingVertical: 4 }}>
      <Pressable
        nativeID={`${id}-fila`}
        onPress={onAlternar}
        accessibilityRole="button"
        accessibilityState={{ expanded: abierta }}
        {...({ "aria-expanded": abierta } as object)}
        accessibilityLabel={`${titulo}, ${estado.texto}. ${abierta ? "Plegar" : "Ver el detalle"}`}
        style={({ pressed }) => ({ minHeight: TACTIL.minimo, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, opacity: pressed ? 0.85 : 1 })}
      >
        <Miniatura icono={icono} ancho={44} alto={44} />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 8, rowGap: 4 }}>
            <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.cuerpo, lineHeight: 21, flexShrink: 1 }}>{titulo}</Text>
            <EtiquetaColor nativeID={idEstado} texto={estado.texto} tono={estado.tono} />
          </View>
          <Text style={{ color: COLORS.muted, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 18 }}>{linea}</Text>
        </View>
        <Ionicons name={abierta ? "chevron-up" : "chevron-down"} size={18} color={COLORS.muted} />
      </Pressable>
      {abierta ? <View nativeID={`${id}-detalle`} style={{ gap: 12, paddingBottom: 16 }}>{children}</View> : null}
    </View>
  );
}

export default function AdminEscaparate() {
  const { width } = useWindowDimensions();
  const isMobile = (width || 1024) < 700;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salidas, setSalidas] = useState<Salida[]>([]);
  const [articulos, setArticulos] = useState<Articulo[]>([]);
  const [registro, setRegistro] = useState<Registro[]>([]);
  const [numeros, setNumeros] = useState<Record<string, number>>({});
  const [avisosProductos, setAvisosProductos] = useState<AvisoProducto[]>([]);
  const [vista, setVista] = useState<Vista>("todo");
  const [buscar, setBuscar] = useState("");
  const desplegables = useDesplegables();

  // Despierta el puente de vuelta: apunta y envía lo pendiente. Devuelve si está configurado.
  const despertar = useCallback(async (): Promise<boolean | null> => {
    if (Platform.OS !== "web") return null;
    try {
      const r = await fetch("/api/escaparate-retorno", { method: "POST" });
      const datos: any = await r.json().catch(() => null);
      return typeof datos?.configurado === "boolean" ? datos.configurado : null;
    } catch {
      return null;
    }
  }, []);

  const cargar = useCallback(async () => {
    setErr(null);
    try {
      const [rs, ra, rr] = await Promise.all([
        supabase
          .from("escaparate_salida")
          .select("id,creado_en,evento,id_veoaura,pedido_id,estado,intentos,enviado_en,detalle")
          .order("creado_en", { ascending: false })
          .limit(60),
        supabase
          .from("products")
          .select("id,id_veoaura,title,price_eur,is_active,vendido_en,retirado_en,view_count,like_count")
          .not("id_veoaura", "is", null)
          .order("novedad_en", { ascending: false })
          .limit(300),
        supabase
          .from("escaparate_registro")
          .select("id,recibido_en,evento,resultado,http,detalle")
          .order("recibido_en", { ascending: false })
          .limit(30),
      ]);
      if (rs.error || ra.error || rr.error) throw rs.error ?? ra.error ?? rr.error;
      const listaSalidas = (rs.data ?? []) as Salida[];
      setSalidas(listaSalidas);
      setArticulos((ra.data ?? []) as Articulo[]);
      setRegistro((rr.data ?? []) as Registro[]);

      const ids = [...new Set(listaSalidas.map((s) => s.pedido_id))];
      if (ids.length) {
        const { data } = await supabase.from("pedidos").select("id,numero").in("id", ids);
        setNumeros(Object.fromEntries(((data ?? []) as { id: string; numero: number }[]).map((p) => [p.id, p.numero])));
      }

      // Productos creados a mano → VeoAura. Aparte: si la migración aún no está aplicada, el resto de la pantalla sigue igual.
      const rp = await supabase
        .from("escaparate_salida_productos")
        .select("producto_id,estado,intentos,enviado_en,detalle,creado_en")
        .order("creado_en", { ascending: false })
        .limit(60);
      if (rp.error) {
        setAvisosProductos([]);
      } else {
        const avisos = (rp.data ?? []) as AvisoProducto[];
        const idsProductos = avisos.map((a) => a.producto_id);
        const { data: prods } = idsProductos.length
          ? await supabase.from("products").select("id,title,id_veoaura").in("id", idsProductos)
          : { data: [] as { id: string; title: string; id_veoaura: string | null }[] };
        const porId = new Map(((prods ?? []) as { id: string; title: string; id_veoaura: string | null }[]).map((p) => [p.id, p]));
        setAvisosProductos(avisos.map((a) => ({ ...a, titulo: porId.get(a.producto_id)?.title, id_veoaura: porId.get(a.producto_id)?.id_veoaura ?? null })));
      }
    } catch (e) {
      console.error("Error cargando el escaparate:", e);
      setErr("No se ha podido cargar el escaparate. Si es la primera vez, falta aplicar la migración del puente de vuelta.");
    }
  }, []);

  const enviarAhora = useCallback(async () => {
    setEnviando(true);
    setAviso(null);
    const configurado = await despertar();
    if (configurado === false) {
      setAviso("Falta configurar en Vercel VEOAURA_RETORNO_URL y VEOAURA_RETORNO_SECRETO: los avisos quedan pendientes hasta entonces.");
    }
    await cargar();
    setEnviando(false);
  }, [cargar, despertar]);

  useEffect(() => {
    (async () => {
      await enviarAhora();
      setLoading(false);
    })();
  }, [enviarAhora]);

  const porVeoaura = useMemo(() => new Map(articulos.map((a) => [a.id_veoaura, a])), [articulos]);
  const sinConfirmar = salidas.filter((s) => s.evento !== "pedido_pagado" && PENDIENTE.includes(s.estado)).length;
  // Fichas de cliente (nombre, correo y teléfono de pedidos entregados) ya enviadas a VeoAura y las que faltan.
  const fichasEnviadas = salidas.filter((s) => s.evento === "pedido_pagado" && s.estado === "enviado").length;
  const fichasPorEnviar = salidas.filter((s) => s.evento === "pedido_pagado" && PENDIENTE.includes(s.estado)).length;
  const aLaVenta = articulos.filter((a) => a.is_active).length;
  // Facturas de VeoAura (evento «factura») en los últimos mensajes, y sus PDF que no se pudieron guardar.
  const facturasRecibidas = registro.filter((r) => r.evento === "factura" && r.resultado === "ok").length;
  const facturasConError = registro.filter((r) => (r.evento === "factura" || r.evento === "factura_pdf") && r.resultado !== "ok").length;
  const productosEnVeoaura = avisosProductos.filter((a) => a.estado === "enviado").length;
  const productosPendientes = avisosProductos.filter((a) => PENDIENTE.includes(a.estado)).length;

  // Lo que se ve con la vista y la búsqueda de ahora.
  const q = buscar.trim().toLowerCase();
  const coincide = (...t: (string | number | null | undefined)[]) => !q || t.some((x) => String(x ?? "").toLowerCase().includes(q));
  const ventasVista = salidas.filter((s) => {
    const art = porVeoaura.get(s.id_veoaura);
    const numero = numeros[s.pedido_id];
    return (vista !== "pendientes" || PENDIENTE.includes(s.estado)) && coincide(art?.title, numero ? `#${numero}` : null, textoEvento(s), s.detalle);
  });
  const productosVista = avisosProductos.filter((a) => (vista !== "pendientes" || PENDIENTE.includes(a.estado)) && coincide(a.titulo, a.detalle));
  const articulosVista = articulos.filter((a) => coincide(a.title, a.id_veoaura));
  const mensajesVista = registro.filter((r) => coincide(r.evento ? (NOMBRE_EVENTO[r.evento] ?? r.evento) : null, r.detalle, r.resultado));
  const ver = (s: Exclude<Vista, "todo" | "pendientes">) => vista === "todo" || vista === s || (vista === "pendientes" && (s === "ventas" || s === "productos"));
  const pendientesTotal = salidas.filter((s) => PENDIENTE.includes(s.estado)).length + productosPendientes;
  const alternarVista = (v: Vista) => setVista((x) => (x === v ? "todo" : v));

  const fila = (id: string) => ({ abierta: desplegables.estaAbierta(id), onAlternar: () => desplegables.alternar(id) });

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <StatusBar barStyle="dark-content" />
      <AdminHeader title="Escaparate VeoAura" isMobile={isMobile} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 + insets.bottom, alignItems: "center" }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ width: "100%", maxWidth: 1040, gap: isMobile ? 16 : 20 }}>
          {/* 1) Cifras que filtran (tocar otra vez vuelve a «Todo»). */}
          <View nativeID="escaparate-cifras" style={{ flexDirection: "row", flexWrap: "wrap", gap: TACTIL.separacion }}>
            <Cifra nativeID="escaparate-cifra-sin-confirmar" valor={String(sinConfirmar)} etiqueta="Ventas sin confirmar" icono="alert-circle-outline" ancho={isMobile ? "30%" : 0} alerta={sinConfirmar > 0 && vista !== "pendientes"} activa={vista === "pendientes"} onPress={() => alternarVista("pendientes")} />
            <Cifra nativeID="escaparate-cifra-a-la-venta" valor={String(aLaVenta)} etiqueta="A la venta" icono="storefront-outline" ancho={isMobile ? "30%" : 0} activa={vista === "escaparate"} onPress={() => alternarVista("escaparate")} />
            <Cifra nativeID="escaparate-cifra-recibidos" valor={String(articulos.length)} etiqueta="Recibidos de VeoAura" icono="download-outline" ancho={isMobile ? "30%" : 0} activa={vista === "escaparate"} onPress={() => alternarVista("escaparate")} />
            <Cifra nativeID="escaparate-cifra-fichas" valor={String(fichasEnviadas)} etiqueta="Fichas de cliente" icono="person-outline" ancho={isMobile ? "30%" : 0} activa={vista === "ventas"} onPress={() => alternarVista("ventas")} />
            <Cifra nativeID="escaparate-cifra-productos" valor={String(productosEnVeoaura)} etiqueta="Productos en VeoAura" icono="swap-horizontal-outline" ancho={isMobile ? "30%" : 0} activa={vista === "productos"} onPress={() => alternarVista("productos")} />
            <Cifra nativeID="escaparate-cifra-facturas" valor={String(facturasRecibidas)} etiqueta="Facturas recibidas" icono="receipt-outline" ancho={isMobile ? "30%" : 0} alerta={facturasConError > 0 && vista !== "mensajes"} activa={vista === "mensajes"} onPress={() => alternarVista("mensajes")} />
          </View>

          {/* 2) El resumen de siempre, en líneas cortas. */}
          <View style={{ gap: 4 }}>
            <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: TAMANOS.minimo, lineHeight: 19 }}>
              {aLaVenta} a la venta · {articulos.length} recibidos de VeoAura
              {sinConfirmar ? ` · ${sinConfirmar} ventas sin confirmar a VeoAura` : ""}
            </Text>
            {/* Clientes compartidos con VeoAura: solo de pedidos entregados (cuentan como pagados), nombre, correo y teléfono. */}
            <Detalle nativeID="escaparate-fichas-clientes">
              Fichas de cliente enviadas a VeoAura: {fichasEnviadas}
              {fichasPorEnviar ? ` · por enviar: ${fichasPorEnviar}` : ""} · solo de pedidos entregados (nombre, correo y teléfono)
            </Detalle>
            {/* Facturas que emite VeoAura y manda a la tienda (api/escaparate-veoaura.ts, evento «factura»). */}
            <Detalle nativeID="escaparate-facturas">
              Facturas recibidas de VeoAura en los últimos mensajes: {facturasRecibidas}
              {facturasConError ? ` · con error: ${facturasConError}` : ""} · se descargan en Pedidos y en «Mis pedidos» del cliente
            </Detalle>
            {/* Productos creados a mano en la tienda que VeoAura da de alta en su Stock (api/escaparate-retorno.ts, «producto_tienda»). */}
            <Detalle nativeID="escaparate-productos-tienda">
              Productos de la tienda en VeoAura: {productosEnVeoaura}
              {productosPendientes ? ` · pendientes: ${productosPendientes}` : ""} · solo datos del producto, nunca de clientes
            </Detalle>
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: TACTIL.separacion }}>
            <Pressable
              nativeID="escaparate-enviar"
              onPress={enviarAhora}
              disabled={enviando}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                minHeight: TACTIL.minimo,
                paddingHorizontal: 18,
                borderRadius: 999,
                backgroundColor: COLORS.accent,
                opacity: pressed || enviando ? 0.75 : 1,
              })}
            >
              {enviando ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="sync-outline" size={16} color="#FFFFFF" />}
              <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: TAMANOS.cuerpo }}>{enviando ? "Enviando…" : "Enviar ahora y actualizar"}</Text>
            </Pressable>
          </View>

          {aviso ? <Text style={{ color: COLORS.warn, fontWeight: "800", lineHeight: 20 }}>{aviso}</Text> : null}
          {err ? <Text style={{ color: COLORS.danger, fontWeight: "800", lineHeight: 20 }}>{err}</Text> : null}

          {loading ? (
            <View style={{ alignItems: "center", paddingVertical: 24 }}>
              <CargaMarca texto="Cargando el escaparate…" />
            </View>
          ) : (
            <>
              {/* 3) Buscador y pastillas con su recuento. */}
              <Buscador nativeID="escaparate-buscar" valor={buscar} onCambiar={setBuscar} placeholder="Buscar artículo, pedido o mensaje" etiqueta="Buscar en el escaparate por artículo, número de pedido o mensaje" />
              <FilaPastillas isMobile={isMobile} nativeID="escaparate-filtros">
                {(
                  [
                    ["todo", "Todo", salidas.length + avisosProductos.length + articulos.length + registro.length, true],
                    ["pendientes", "Pendientes", pendientesTotal, true],
                    ["ventas", "Ventas", salidas.length, true],
                    ["productos", "Productos de la tienda", avisosProductos.length, avisosProductos.length > 0],
                    ["escaparate", "Escaparate", articulos.length, true],
                    ["mensajes", "Mensajes", registro.length, true],
                  ] as [Vista, string, number, boolean][]
                )
                  .filter(([, , , sale]) => sale)
                  .map(([v, t, n]) => (
                    <Chip key={v} nativeID={`escaparate-filtro-${v}`} label={`${t} (${n})`} activo={vista === v} onPress={() => setVista(v)} />
                  ))}
              </FilaPastillas>

              {/* 4) Ventas en la tienda. */}
              {ver("ventas") ? (
                <Seccion icon="bag-handle-outline" title="Ventas en la tienda" extra={`${ventasVista.length}`} nativeID="escaparate-ventas">
                  <Detalle>Artículos de VeoAura pedidos aquí. Hasta que ponga «Avisado a VeoAura», no lo vendas también en la tienda física.</Detalle>
                  {ventasVista.length === 0 ? (
                    <ListaVacia icono="bag-handle-outline" titulo={salidas.length ? "Nada con este filtro." : "Todavía no hay pedidos de artículos de VeoAura."} texto={salidas.length ? "Prueba a borrar el buscador o a elegir «Todo»." : "Cuando alguien pida un artículo de VeoAura, sale aquí."} />
                  ) : (
                    <View>
                      {ventasVista.map((s, i) => {
                        const art = porVeoaura.get(s.id_veoaura);
                        const est = ESTADO_SALIDA[s.estado];
                        const numero = numeros[s.pedido_id];
                        return (
                          <FilaEscaparate
                            key={s.id}
                            id={`escaparate-venta-${s.id}`}
                            idEstado={`escaparate-venta-estado-${s.id}`}
                            primera={i === 0}
                            icono={s.evento === "pedido_pagado" ? "person-outline" : s.evento === "pedido_anulado" ? "close-circle-outline" : "bag-handle-outline"}
                            titulo={art?.title ?? "Artículo de VeoAura"}
                            estado={est}
                            linea={`${textoEvento(s)}${numero ? ` #${numero}` : ""} · ${fmtFechaHora(s.creado_en)}`}
                            {...fila(`venta-${s.id}`)}
                          >
                            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                              <Bloque icono="swap-horizontal-outline" titulo="Aviso a VeoAura" ancho={isMobile ? "100%" : "45%"}>
                                <Dato etiqueta="Estado">{est.texto}</Dato>
                                {s.estado === "enviado" && s.enviado_en ? <Dato etiqueta="Avisado">{fmtFechaHora(s.enviado_en)}</Dato> : null}
                                <Dato etiqueta="Intentos">{String(s.intentos)}</Dato>
                                {s.detalle && s.estado !== "enviado" ? <Detalle>{s.detalle}</Detalle> : null}
                              </Bloque>
                              <Bloque icono="receipt-outline" titulo="Pedido" ancho={isMobile ? "100%" : "45%"}>
                                <Dato etiqueta="Qué es">{textoEvento(s)}</Dato>
                                {numero ? <Dato etiqueta="Nº de pedido">{`#${numero}`}</Dato> : null}
                                <Dato etiqueta="Fecha">{fmtFechaHora(s.creado_en)}</Dato>
                                {art ? <Dato etiqueta="Precio">{fmtEUR(Number(art.price_eur ?? 0))}</Dato> : null}
                              </Bloque>
                            </View>
                            <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 18 }}>
                              <AccionTexto icono="receipt-outline" texto="Ver en Pedidos" rol="link" onPress={() => router.push((numero ? `/admin/pedidos?buscar=${numero}` : "/admin/pedidos") as Href)} />
                              {PENDIENTE.includes(s.estado) ? <AccionTexto icono="sync-outline" texto="Avisar ahora" onPress={enviarAhora} disabled={enviando} /> : null}
                            </View>
                          </FilaEscaparate>
                        );
                      })}
                    </View>
                  )}
                </Seccion>
              ) : null}

              {/* 5) Productos de la tienda que VeoAura da de alta. */}
              {ver("productos") && avisosProductos.length > 0 ? (
                <Seccion icon="swap-horizontal-outline" title="Productos de la tienda" extra={`${productosVista.length}`} nativeID="escaparate-productos">
                  <Detalle>Productos creados a mano en Productos. VeoAura los da de alta en su Stock y devuelve su id, para que «vendido» y «retirar» funcionen.</Detalle>
                  {productosVista.length === 0 ? (
                    <ListaVacia icono="swap-horizontal-outline" titulo="Nada con este filtro." texto="Prueba a borrar el buscador o a elegir «Todo»." />
                  ) : (
                    <View>
                      {productosVista.map((a, i) => (
                        <FilaEscaparate
                          key={a.producto_id}
                          id={`escaparate-producto-${a.producto_id}`}
                          primera={i === 0}
                          icono="cube-outline"
                          titulo={a.titulo ?? "Producto de la tienda"}
                          estado={{ texto: textoEstadoProducto(a.estado), tono: tonoProducto(a.estado) }}
                          linea={`Producto nuevo · ${fmtFechaHora(a.creado_en)}`}
                          {...fila(`producto-${a.producto_id}`)}
                        >
                          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                            <Bloque icono="swap-horizontal-outline" titulo="Aviso a VeoAura" ancho="100%">
                              <Dato etiqueta="Estado">{textoEstadoProducto(a.estado)}</Dato>
                              {a.estado === "enviado" && a.enviado_en ? <Dato etiqueta="Enviado">{fmtFechaHora(a.enviado_en)}</Dato> : null}
                              <Dato etiqueta="Intentos">{String(a.intentos)}</Dato>
                              {a.id_veoaura ? <Dato etiqueta="Id en VeoAura">{a.id_veoaura}</Dato> : null}
                              {a.detalle && a.estado !== "enviado" ? <Detalle>{a.detalle}</Detalle> : null}
                            </Bloque>
                          </View>
                          <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 18 }}>
                            <AccionTexto icono="create-outline" texto="Abrir en Productos" rol="link" onPress={() => router.push(`/admin/products?editar=${a.producto_id}` as Href)} />
                          </View>
                        </FilaEscaparate>
                      ))}
                    </View>
                  )}
                </Seccion>
              ) : null}

              {/* 6) Lo que hay en el escaparate. */}
              {ver("escaparate") ? (
                <Seccion icon="storefront-outline" title="En el escaparate" extra={`${articulosVista.length}`} nativeID="escaparate-articulos">
                  {articulosVista.length === 0 ? (
                    <ListaVacia icono="storefront-outline" titulo={articulos.length ? "Nada con este filtro." : "Todavía no ha llegado nada de VeoAura."} texto={articulos.length ? "Prueba a borrar el buscador." : "Lo que VeoAura publique sale aquí."} />
                  ) : (
                    <View>
                      {articulosVista.map((a, i) => {
                        const est = estadoArticulo(a);
                        return (
                          <FilaEscaparate
                            key={a.id}
                            id={`escaparate-articulo-${a.id}`}
                            primera={i === 0}
                            icono="pricetag-outline"
                            titulo={a.title}
                            estado={est}
                            linea={`${fmtEUR(Number(a.price_eur ?? 0))} · ${Number(a.view_count ?? 0)} visitas · ${Number(a.like_count ?? 0)} me gusta`}
                            {...fila(`articulo-${a.id}`)}
                          >
                            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                              <Bloque icono="stats-chart-outline" titulo="En la tienda" ancho={isMobile ? "100%" : "45%"}>
                                <Dato etiqueta="Precio">{fmtEUR(Number(a.price_eur ?? 0))}</Dato>
                                <Dato etiqueta="Visitas">{String(Number(a.view_count ?? 0))}</Dato>
                                <Dato etiqueta="Me gusta">{String(Number(a.like_count ?? 0))}</Dato>
                              </Bloque>
                              <Bloque icono="swap-horizontal-outline" titulo="VeoAura" ancho={isMobile ? "100%" : "45%"}>
                                <Dato etiqueta="Estado">{est.texto}</Dato>
                                {a.vendido_en ? <Dato etiqueta="Vendido">{fmtFechaHora(a.vendido_en)}</Dato> : null}
                                {a.retirado_en ? <Dato etiqueta="Retirado">{fmtFechaHora(a.retirado_en)}</Dato> : null}
                                <Dato etiqueta="Id en VeoAura">{a.id_veoaura}</Dato>
                              </Bloque>
                            </View>
                            <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 18 }}>
                              {a.is_active ? <AccionTexto icono="open-outline" texto="Ver en la tienda" rol="link" onPress={() => router.push(`/producto/${a.id}` as Href)} /> : null}
                              <AccionTexto icono="create-outline" texto="Abrir en Productos" rol="link" onPress={() => router.push(`/admin/products?editar=${a.id}` as Href)} />
                            </View>
                          </FilaEscaparate>
                        );
                      })}
                    </View>
                  )}
                </Seccion>
              ) : null}

              {/* 7) Últimos mensajes del puente (sin desplegar: ya dicen todo en la fila). */}
              {ver("mensajes") ? (
                <Seccion icon="chatbox-ellipses-outline" title="Últimos mensajes" extra={`${mensajesVista.length}`} nativeID="escaparate-mensajes">
                  {mensajesVista.length === 0 ? (
                    <ListaVacia icono="chatbox-ellipses-outline" titulo={registro.length ? "Nada con este filtro." : "Sin mensajes todavía."} texto={registro.length ? "Prueba a borrar el buscador." : "Lo que mande VeoAura sale aquí."} />
                  ) : (
                    <View>
                      {mensajesVista.map((r, i) => {
                        const ok = r.resultado === "ok";
                        return (
                          <View key={r.id} nativeID={`escaparate-mensaje-${r.id}`} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: COLORS.border, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12 }}>
                            <Miniatura icono={r.evento === "factura" || r.evento === "factura_pdf" ? "receipt-outline" : "chatbox-outline"} ancho={44} alto={44} />
                            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                              <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 8, rowGap: 4 }}>
                                <Text style={{ color: COLORS.text, fontWeight: "900", fontSize: TAMANOS.cuerpo, flexShrink: 1 }}>{r.evento ? (NOMBRE_EVENTO[r.evento] ?? r.evento) : "—"}</Text>
                                <EtiquetaColor texto={ok ? "Correcto" : `Error${r.http ? ` ${r.http}` : ""}`} tono={ok ? "verde" : "rojo"} />
                              </View>
                              <Text style={{ color: COLORS.muted, fontWeight: "700", fontSize: TAMANOS.minimo, lineHeight: 18 }}>
                                {fmtFechaHora(r.recibido_en)}
                                {r.detalle ? ` · ${r.detalle}` : ""}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </Seccion>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
